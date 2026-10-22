CREATE TABLE hr_settlement_void_request(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,case_id text NOT NULL,case_version integer NOT NULL CHECK(case_version>0),
 state text NOT NULL DEFAULT 'submitted' CHECK(state IN('submitted','approved','rejected')),
 requested_by text NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 500),decided_by text,decision_reason text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),decided_at timestamptz,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,company_id,case_id) REFERENCES hr_lifecycle_case(tenant_id,company_id,id),UNIQUE(tenant_id,case_id,case_version),
 CHECK((state='submitted' AND decided_by IS NULL AND decision_reason IS NULL AND decided_at IS NULL) OR(state IN('approved','rejected') AND decided_by IS NOT NULL AND decided_by<>requested_by AND length(btrim(decision_reason)) BETWEEN 5 AND 500 AND decided_at IS NOT NULL))
);
CREATE UNIQUE INDEX hr_one_pending_settlement_void ON hr_settlement_void_request(tenant_id,case_id) WHERE state='submitted';
CREATE INDEX hr_settlement_void_history ON hr_settlement_void_request(tenant_id,company_id,case_id,created_at);
ALTER TABLE hr_settlement_void_request ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_settlement_void_request FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_settlement_void_scope ON hr_settlement_void_request USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE FUNCTION guard_hr_settlement_void_request() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_lifecycle_case%ROWTYPE;actor text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Settlement correction history is immutable';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:lifecycle-cases:'||NEW.tenant_id||':'||NEW.company_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:attendance:'||NEW.tenant_id||':'||NEW.company_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:payroll:'||NEW.tenant_id||':'||NEW.company_id,0));
 SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.case_id;
 IF c.id IS NULL OR c.kind<>'settlement' OR c.state<>'approved' THEN RAISE EXCEPTION 'Only approved settlement statements can be corrected';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'submitted' OR NEW.case_version<>c.version THEN RAISE EXCEPTION 'A correction starts with an independent review request';END IF;
  actor:=NEW.requested_by;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['state','decided_by','decision_reason','decided_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','decided_by','decision_reason','decided_at']) OR OLD.state<>'submitted' OR NEW.state NOT IN('approved','rejected') OR c.version<>NEW.case_version+1 THEN RAISE EXCEPTION 'Correction terms and decisions are immutable';END IF;
  actor:=NEW.decided_by;
 END IF;
 IF EXISTS(SELECT 1 FROM employee_user_binding WHERE tenant_id=NEW.tenant_id AND employee_id=c.employee_id AND user_id=actor AND ended_at IS NULL) THEN RAISE EXCEPTION 'The employee cannot request or decide their correction';END IF;
 IF NEW.state<>'rejected' AND(
  NOT EXISTS(SELECT 1 FROM hr_lifecycle_case x JOIN hr_employment_relationship er ON er.tenant_id=x.tenant_id AND er.id=x.relationship_id WHERE x.tenant_id=c.tenant_id AND x.company_id=c.company_id AND x.id=c.parent_id AND x.state='approved' AND er.status='active' AND er.approval_state='approved')
  OR EXISTS(SELECT 1 FROM hr_settlement_payroll_link WHERE tenant_id=c.tenant_id AND company_id=c.company_id AND case_id=c.id)
  OR EXISTS(SELECT 1 FROM hr_payroll_period WHERE tenant_id=c.tenant_id AND company_id=c.company_id AND month>=date_trunc('month',(SELECT(terms->>'last_working_date')::date FROM hr_lifecycle_case WHERE tenant_id=c.tenant_id AND id=c.parent_id))::date AND state<>'open')
 ) THEN RAISE EXCEPTION 'Payroll handoff, frozen Payroll or completed offboarding requires its governed correction process';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_settlement_void_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_settlement_void_request FOR EACH ROW EXECUTE FUNCTION guard_hr_settlement_void_request();
ALTER TABLE hr_leave_transaction DROP CONSTRAINT hr_leave_transaction_kind_check,DROP CONSTRAINT hr_leave_transaction_source_type_check;
ALTER TABLE hr_leave_transaction ADD CONSTRAINT hr_leave_transaction_kind_check CHECK(kind IN('opening','accrual','carry_forward','adjustment','used','expiry','reversal','encashed','encashment_reversal')),
 ADD CONSTRAINT hr_leave_transaction_source_type_check CHECK(source_type IN('opening','policy','manual_adjustment','leave_request','reversal','final_settlement','settlement_void'));
CREATE FUNCTION guard_hr_encashment_void_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind<>'encashment_reversal' AND NEW.source_type<>'settlement_void' THEN RETURN NEW;END IF;
 IF NEW.kind<>'encashment_reversal' OR NEW.source_type<>'settlement_void' OR NOT EXISTS(
 SELECT 1 FROM hr_leave_transaction t JOIN hr_settlement_encashment_source s ON s.tenant_id=t.tenant_id AND s.company_id=t.company_id AND s.id=t.source_id
 JOIN hr_settlement_void_request v ON v.tenant_id=s.tenant_id AND v.company_id=s.company_id AND v.case_id=s.case_id AND v.id=NEW.evidence_json->>'correction_id' AND v.state='approved' AND v.decided_by=NEW.created_by
 WHERE t.tenant_id=NEW.tenant_id AND t.company_id=NEW.company_id AND t.employee_id=NEW.employee_id AND t.leave_type_id=NEW.leave_type_id AND t.source_id=NEW.source_id AND t.kind='encashed' AND t.source_type='final_settlement' AND NEW.days=-t.days AND NEW.effective_on=t.effective_on AND NEW.policy_version_id IS NOT DISTINCT FROM t.policy_version_id AND NEW.evidence_hash IS NOT DISTINCT FROM t.evidence_hash AND NEW.evidence_json->>'original_entry_id'=t.id AND NEW.evidence_json->>'case_id'=s.case_id
 ) THEN RAISE EXCEPTION 'A restoration must match an independently approved correction and the exact original consumption';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_encashment_void_ledger_guard BEFORE INSERT ON hr_leave_transaction FOR EACH ROW EXECUTE FUNCTION guard_hr_encashment_void_ledger();
CREATE FUNCTION validate_hr_settlement_void_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v hr_settlement_void_request%ROWTYPE;c hr_lifecycle_case%ROWTYPE;target text;
BEGIN
 IF TG_TABLE_NAME='hr_settlement_void_request' THEN target:=NEW.id;
 ELSIF TG_TABLE_NAME='hr_leave_transaction' THEN
  IF NEW.kind<>'encashment_reversal' THEN RETURN NULL;END IF;target:=NEW.evidence_json->>'correction_id';
 ELSE
  IF NEW.kind<>'settlement' THEN RETURN NULL;END IF;
  SELECT id INTO target FROM hr_settlement_void_request WHERE tenant_id=NEW.tenant_id AND case_id=NEW.id AND case_version IN(NEW.version-1,NEW.version-2) ORDER BY case_version DESC LIMIT 1;
  IF target IS NULL THEN RETURN NULL;END IF;
 END IF;
 SELECT * INTO v FROM hr_settlement_void_request WHERE tenant_id=NEW.tenant_id AND id=target;
 SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=v.tenant_id AND id=v.case_id;
 IF v.id IS NULL OR c.id IS NULL OR(v.state='submitted' AND(c.state<>'approved' OR c.version<>v.case_version+1)) OR(v.state IN('approved','rejected') AND(c.state<>CASE WHEN v.state='approved' THEN 'cancelled' ELSE 'approved' END OR c.version<>v.case_version+2)) THEN RAISE EXCEPTION 'Correction decision and retained statement must commit together';END IF;
 IF v.state='approved' AND EXISTS(SELECT 1 FROM hr_leave_transaction t JOIN hr_settlement_encashment_source s ON s.tenant_id=t.tenant_id AND s.id=t.source_id WHERE t.tenant_id=v.tenant_id AND s.case_id=v.case_id AND t.kind='encashed' AND t.source_type='final_settlement' AND NOT EXISTS(SELECT 1 FROM hr_leave_transaction r WHERE r.tenant_id=t.tenant_id AND r.company_id=t.company_id AND r.employee_id=t.employee_id AND r.leave_type_id=t.leave_type_id AND r.source_id=t.source_id AND r.source_type='settlement_void' AND r.kind='encashment_reversal' AND r.days=-t.days AND r.created_by=v.decided_by AND r.evidence_json->>'correction_id'=v.id)) THEN RAISE EXCEPTION 'Void approval must restore every original encashment exactly once';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_settlement_void_commit AFTER INSERT OR UPDATE ON hr_settlement_void_request DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_settlement_void_commit();
CREATE CONSTRAINT TRIGGER hr_settlement_void_case_commit AFTER UPDATE ON hr_lifecycle_case DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_settlement_void_commit();
CREATE CONSTRAINT TRIGGER hr_settlement_void_ledger_commit AFTER INSERT ON hr_leave_transaction DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_settlement_void_commit();
CREATE FUNCTION guard_hr_pending_settlement_void() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='hr_settlement_payroll_link' THEN
  IF EXISTS(SELECT 1 FROM hr_settlement_void_request WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND case_id=NEW.case_id AND state='submitted') THEN RAISE EXCEPTION 'Resolve the settlement correction review before Payroll handoff';END IF;
 ELSE
  IF NEW.kind IN('resignation','termination') AND NEW.state='closed' AND EXISTS(SELECT 1 FROM hr_settlement_void_request v JOIN hr_lifecycle_case c ON c.tenant_id=v.tenant_id AND c.id=v.case_id WHERE v.tenant_id=NEW.tenant_id AND c.parent_id=NEW.id AND v.state='submitted') THEN RAISE EXCEPTION 'Resolve the settlement correction review before offboarding';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_settlement_void_payroll_pause BEFORE INSERT ON hr_settlement_payroll_link FOR EACH ROW EXECUTE FUNCTION guard_hr_pending_settlement_void();
CREATE TRIGGER hr_settlement_void_exit_pause BEFORE UPDATE ON hr_lifecycle_case FOR EACH ROW EXECUTE FUNCTION guard_hr_pending_settlement_void();

CREATE OR REPLACE FUNCTION guard_hr_lifecycle_case() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rel hr_employment_relationship%ROWTYPE;p hr_lifecycle_case%ROWTYPE;
BEGIN

 IF TG_OP='UPDATE' AND OLD.kind='settlement' AND OLD.state='approved' AND EXISTS(
  SELECT 1 FROM hr_settlement_void_request v WHERE v.tenant_id=NEW.tenant_id AND v.company_id=NEW.company_id AND v.case_id=NEW.id AND(
   (v.state='submitted' AND v.case_version=OLD.version AND NEW.state='approved' AND NEW.updated_by=v.requested_by)
   OR(v.state IN('approved','rejected') AND v.case_version=OLD.version-1 AND NEW.state=CASE WHEN v.state='approved' THEN 'cancelled' ELSE 'approved' END AND NEW.updated_by=v.decided_by))
 ) THEN
  IF NEW.version<>OLD.version+1 OR(to_jsonb(NEW)-ARRAY['version','state','updated_by','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['version','state','updated_by','updated_at']) THEN RAISE EXCEPTION 'Corrections preserve the original approved statement and evidence';END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Lifecycle case history cannot be deleted';END IF;
 SELECT * INTO rel FROM hr_employment_relationship WHERE tenant_id=NEW.tenant_id AND id=NEW.relationship_id AND legal_employer_id=NEW.company_id AND employee_id=NEW.employee_id;
 IF rel.id IS NULL OR rel.approval_state<>'approved' THEN RAISE EXCEPTION 'Lifecycle cases require approved employment';END IF;
 IF NEW.terms->>'kind' IS DISTINCT FROM NEW.kind THEN RAISE EXCEPTION 'Case terms must match the record kind';END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'Lifecycle cases start as unapproved drafts';END IF;
 ELSE
  IF ROW(NEW.tenant_id,NEW.company_id,NEW.id,NEW.kind,NEW.relationship_id,NEW.employee_id,NEW.parent_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.company_id,OLD.id,OLD.kind,OLD.relationship_id,OLD.employee_id,OLD.parent_id,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Lifecycle identity and version are protected';END IF;
  IF OLD.state IN('closed','cancelled') OR(OLD.state='approved' AND NOT(NEW.state='closed' AND NEW.kind IN('resignation','termination'))) THEN RAISE EXCEPTION 'Approved lifecycle evidence is immutable';END IF;
  IF NEW.state=OLD.state THEN IF OLD.state<>'draft' THEN RAISE EXCEPTION 'Only drafts can be edited';END IF;
  ELSIF NOT((OLD.state='draft' AND NEW.state IN('submitted','cancelled')) OR(OLD.state='submitted' AND NEW.state IN('draft','approved')) OR(OLD.state='approved' AND NEW.state='closed' AND NEW.kind IN('resignation','termination'))) THEN RAISE EXCEPTION 'Unsupported lifecycle transition';END IF;
  IF OLD.state<>NEW.state AND NEW.terms IS DISTINCT FROM OLD.terms THEN RAISE EXCEPTION 'Decisions preserve reviewed terms';END IF;
 END IF;
 IF NEW.kind IN('clearance','settlement') THEN SELECT * INTO p FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.parent_id;IF p.id IS NULL OR p.kind NOT IN('resignation','termination') OR p.state<>'approved' OR p.relationship_id<>NEW.relationship_id OR NEW.terms->>'exit_case_id' IS DISTINCT FROM p.id THEN RAISE EXCEPTION 'Choose the approved exit of the same employee';END IF;
 ELSIF NEW.parent_id IS NOT NULL OR NEW.terms->>'relationship_id' IS DISTINCT FROM NEW.relationship_id THEN RAISE EXCEPTION 'Case relationship terms do not match';END IF;
 IF NEW.state='approved' AND(NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,OLD.updated_by,NEW.submitted_by) OR EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=NEW.tenant_id AND b.employee_id=NEW.employee_id AND b.user_id=NEW.decided_by AND b.ended_at IS NULL)) THEN RAISE EXCEPTION 'Independent lifecycle approval is required';END IF;
 IF NEW.state IN('submitted','approved') AND NEW.kind IN('onboarding','clearance') AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.terms->'tasks') t WHERE(t->>'complete')::boolean IS DISTINCT FROM true OR length(btrim(t->>'evidence'))<5) THEN RAISE EXCEPTION 'Every required checklist task needs completion evidence';END IF;
 IF NEW.kind IN('resignation','termination') AND NEW.state='closed' AND(NOT EXISTS(SELECT 1 FROM hr_lifecycle_case c WHERE c.tenant_id=NEW.tenant_id AND c.parent_id=NEW.id AND c.kind='clearance' AND c.state='approved') OR NOT EXISTS(SELECT 1 FROM hr_lifecycle_case c WHERE c.tenant_id=NEW.tenant_id AND c.parent_id=NEW.id AND c.kind='settlement' AND c.state='approved') OR NOT EXISTS(SELECT 1 FROM hr_employment_event e WHERE e.tenant_id=NEW.tenant_id AND e.relationship_id=NEW.relationship_id AND e.source_reference='hr:lifecycle-case:'||NEW.id AND e.event_type=NEW.kind)) THEN RAISE EXCEPTION 'Offboarding needs approved clearance, settlement and the authoritative employment event';END IF;
 RETURN NEW;
END $$;

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

    IF TG_TABLE_NAME='hr_leave_transaction' AND TG_OP='INSERT' AND ((current_row->>'kind'='encashed' AND current_row->>'source_type'='final_settlement') OR(current_row->>'kind'='encashment_reversal' AND current_row->>'source_type'='settlement_void')) THEN RETURN NEW;END IF;
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
 SELECT coalesce(sum(days),0) INTO available FROM hr_leave_transaction WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND(effective_on<=NEW.effective_on OR kind IN('used','reversal','encashed','encashment_reversal'));
 available:=available-coalesce((SELECT sum(requested_days) FROM hr_leave_request WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND status IN('pending_manager','pending_hr')),0);
 IF available<s.days THEN RAISE EXCEPTION 'Encashment cannot consume reserved or unavailable leave';END IF;
 RETURN NEW;
END $$;


INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',94,'governed_pre_payroll_settlement_void');
