CREATE OR REPLACE FUNCTION validate_hr02_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assignment_company text;
        effective_date date;
BEGIN
    -- A governed reversal restores the original authority even after a transfer or end date.
    IF TG_TABLE_NAME='hr_leave_request' AND TG_OP='UPDATE' AND to_jsonb(OLD)->>'status'='approved' AND to_jsonb(NEW)->>'status'='cancelled' AND (to_jsonb(NEW)->>'workflow_managed')::boolean AND to_jsonb(NEW)->>'cancellation_approved_by' IS NOT NULL AND ROW(NEW.tenant_id,NEW.id,NEW.company_id,NEW.employee_id,to_jsonb(NEW)->>'leave_type_id') IS NOT DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.company_id,OLD.employee_id,to_jsonb(OLD)->>'leave_type_id') THEN
      RETURN NEW;
    END IF;
    IF TG_TABLE_NAME='hr_leave_transaction' AND to_jsonb(NEW)->>'kind'='reversal' AND to_jsonb(NEW)->>'source_type'='reversal' AND to_jsonb(NEW)->'evidence_json'->>'request_id' IS NOT NULL THEN
      IF NOT EXISTS(SELECT 1 FROM hr_leave_transaction used_entry JOIN hr_leave_request r ON r.tenant_id=used_entry.tenant_id AND r.id=to_jsonb(NEW)->'evidence_json'->>'request_id' AND r.workflow_managed AND r.status='cancelled' AND r.cancellation_approved_by IS NOT NULL WHERE used_entry.tenant_id=NEW.tenant_id AND used_entry.company_id=NEW.company_id AND used_entry.employee_id=NEW.employee_id AND used_entry.leave_type_id=NEW.leave_type_id AND used_entry.kind='used' AND used_entry.source_type='leave_request' AND used_entry.source_id=NEW.source_id AND used_entry.effective_on=NEW.effective_on AND used_entry.days=-NEW.days AND used_entry.policy_version_id IS NOT DISTINCT FROM NEW.policy_version_id) THEN RAISE EXCEPTION 'Leave reversal must match the original governed usage exactly' USING ERRCODE='23514';END IF;
      RETURN NEW;
    END IF;
    effective_date := COALESCE(
        (to_jsonb(NEW)->>'work_date')::date,
        (to_jsonb(NEW)->>'from_date')::date,
        (to_jsonb(NEW)->>'effective_on')::date,
        CURRENT_DATE
    );
    IF NEW.employee_id IS NOT NULL THEN
        SELECT company_id INTO assignment_company FROM employee_assignment
         WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.employee_id
           AND effective_from <= effective_date
           AND (effective_to IS NULL OR effective_to >= effective_date)
         ORDER BY effective_from DESC LIMIT 1;
        IF assignment_company IS DISTINCT FROM NEW.company_id THEN
            RAISE EXCEPTION 'HR-02 employee is unavailable in the selected company on the effective date';
        END IF;
    END IF;
    IF TG_TABLE_NAME IN ('hr_leave_request','hr_leave_transaction') AND NOT EXISTS (
        SELECT 1 FROM hr_leave_type WHERE tenant_id=NEW.tenant_id
         AND id=(to_jsonb(NEW)->>'leave_type_id') AND company_id=NEW.company_id
    ) THEN RAISE EXCEPTION 'leave type is unavailable in the selected company'; END IF;
    IF TG_TABLE_NAME = 'hr_leave_request' AND (to_jsonb(NEW)->>'document_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM employee_document WHERE tenant_id=NEW.tenant_id
         AND id=(to_jsonb(NEW)->>'document_id') AND employee_id=NEW.employee_id
    ) THEN RAISE EXCEPTION 'leave evidence document is unavailable for the selected employee'; END IF;
    IF TG_TABLE_NAME = 'hr_overtime_request' AND NOT EXISTS (
        SELECT 1 FROM hr_overtime_rule WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id
         AND category=(to_jsonb(NEW)->>'category') AND status='active'
    ) THEN RAISE EXCEPTION 'overtime rule is unavailable in the selected company'; END IF;
    RETURN NEW;
END $$;


INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',52,'leave_cancellation_original_scope');
