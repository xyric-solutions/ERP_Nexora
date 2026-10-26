CREATE OR REPLACE FUNCTION reject_locked_hr02_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_row jsonb;
        prior_row jsonb;
BEGIN
    IF TG_OP='DELETE' THEN
        current_row := to_jsonb(OLD);
        prior_row := current_row;
    ELSIF TG_OP='UPDATE' THEN
        current_row := to_jsonb(NEW);
        prior_row := to_jsonb(OLD);
    ELSE
        current_row := to_jsonb(NEW);
        prior_row := current_row;
    END IF;

    IF TG_TABLE_NAME='hr_leave_transaction' AND TG_OP='INSERT' AND current_row->>'kind'='encashed' AND current_row->>'source_type'='final_settlement' THEN RETURN NEW;END IF;
    IF EXISTS (
        SELECT 1
          FROM (VALUES (current_row),(prior_row)) AS changed(payload)
          JOIN hr_attendance_period p
            ON p.tenant_id=changed.payload->>'tenant_id'
           AND p.company_id=changed.payload->>'company_id'
           AND p.state='locked'
         WHERE daterange(p.month, (p.month + INTERVAL '1 month - 1 day')::date, '[]')
               && daterange(
                    COALESCE(
                        (changed.payload->>'work_date')::date,
                        (changed.payload->>'from_date')::date,
                        (changed.payload->>'effective_on')::date,
                        (changed.payload->>'holiday_date')::date
                    ),
                    COALESCE(
                        (changed.payload->>'to_date')::date,
                        (changed.payload->>'work_date')::date,
                        (changed.payload->>'from_date')::date,
                        (changed.payload->>'effective_on')::date,
                        (changed.payload->>'holiday_date')::date
                    ),
                    '[]'
               )
    ) THEN
        RAISE EXCEPTION 'attendance source cannot change in a locked period';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION guard_hr_settlement_encashment_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s hr_settlement_encashment_source%ROWTYPE;c hr_lifecycle_case%ROWTYPE;p hr_settlement_encashment_rule%ROWTYPE;available numeric;
BEGIN
 IF NEW.kind<>'encashed' AND NEW.source_type<>'final_settlement' THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:attendance:'||NEW.tenant_id||':'||NEW.company_id,0));
 SELECT * INTO s FROM hr_settlement_encashment_source WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.source_id;
 SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=s.case_id;
 SELECT * INTO p FROM hr_settlement_encashment_rule WHERE tenant_id=s.tenant_id AND id=s.rule_id;
 IF s.id IS NULL OR c.kind<>'settlement' OR c.state<>'submitted' OR p.state<>'approved' OR NEW.kind<>'encashed' OR NEW.source_type<>'final_settlement' OR NEW.days IS DISTINCT FROM -s.days OR NEW.effective_on IS DISTINCT FROM s.as_of OR s.as_of>current_date OR NEW.employee_id IS DISTINCT FROM c.employee_id OR NEW.policy_version_id IS DISTINCT FROM s.leave_policy_version_id OR NEW.leave_type_id IS DISTINCT FROM s.leave_type_id OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.terms->'lines') l WHERE l->>'encashment_source_id'=s.id AND l->>'amount_minor'=s.amount_minor) THEN RAISE EXCEPTION 'Encashment ledger requires the exact independently reviewed settlement source';END IF;
 IF EXISTS(SELECT 1 FROM hr_payroll_period WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND month>=date_trunc('month',NEW.effective_on)::date AND state<>'open') THEN RAISE EXCEPTION 'Calculated Payroll requires the governed correction workflow before encashment approval';END IF;
 SELECT coalesce(sum(days),0) INTO available FROM hr_leave_transaction WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND(effective_on<=NEW.effective_on OR kind IN('used','reversal','encashed'));
 available:=available-coalesce((SELECT sum(requested_days) FROM hr_leave_request WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND status IN('pending_manager','pending_hr')),0);
 IF available<s.days THEN RAISE EXCEPTION 'Encashment cannot consume reserved or unavailable leave';END IF;
 RETURN NEW;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',93,'encashment_closed_attendance');
