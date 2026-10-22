-- Additive governed overtime and reviewed attendance close; existing legacy evidence remains readable.
ALTER TABLE hr_overtime_request
 ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN reference text NOT NULL DEFAULT ('OT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
 ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false,
 ADD COLUMN manager_user_id text,
 ADD COLUMN subject_user_ids text[] NOT NULL DEFAULT '{}',
 ADD COLUMN review_source_hash text,
 ADD COLUMN manager_override_event_id text,
 ADD COLUMN hr_override_event_id text,
 ADD FOREIGN KEY(tenant_id,manager_user_id) REFERENCES security_user_account(tenant_id,id),
 ADD FOREIGN KEY(tenant_id,manager_override_event_id) REFERENCES approval_override_event(tenant_id,event_id),
 ADD FOREIGN KEY(tenant_id,hr_override_event_id) REFERENCES approval_override_event(tenant_id,event_id);
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='hr_overtime_request'::regclass AND contype='u' LOOP EXECUTE format('ALTER TABLE hr_overtime_request DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
CREATE UNIQUE INDEX uq_hr_overtime_active_day ON hr_overtime_request(tenant_id,company_id,employee_id,work_date) WHERE status IN ('draft','pending_manager','pending_hr','approved');
ALTER TABLE hr_attendance_period
 ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN review_hash text,
 ADD COLUMN employee_count integer NOT NULL DEFAULT 0,
 ADD COLUMN exception_count integer NOT NULL DEFAULT 0,
 ADD COLUMN processed_at timestamptz,
 ADD COLUMN close_run_id text,
 ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false,
 ADD COLUMN lock_override_event_id text,
 ADD FOREIGN KEY(tenant_id,lock_override_event_id) REFERENCES approval_override_event(tenant_id,event_id);
CREATE TABLE hr_attendance_close_employee (
 tenant_id text NOT NULL,id text NOT NULL,company_id text NOT NULL,period_id text NOT NULL,run_id text NOT NULL,
 employee_id text NOT NULL,employee_number text NOT NULL,payload jsonb NOT NULL,source_hash text NOT NULL CHECK(source_hash~'^[0-9a-f]{64}$'),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,period_id,run_id,employee_id),
 FOREIGN KEY(tenant_id,period_id,company_id) REFERENCES hr_attendance_period(tenant_id,id,company_id),
 FOREIGN KEY(tenant_id,employee_id) REFERENCES employee(tenant_id,id)
);
CREATE INDEX ix_hr_close_run ON hr_attendance_close_employee(tenant_id,period_id,run_id,employee_number,employee_id);
CREATE TABLE hr_attendance_completion_event (
 tenant_id text NOT NULL,id text NOT NULL,company_id text NOT NULL,resource_type text NOT NULL CHECK(resource_type IN ('overtime','period','overtime_rule')),
 resource_id text NOT NULL,version integer NOT NULL,action text NOT NULL,reason text NOT NULL,
 before_snapshot jsonb,after_snapshot jsonb NOT NULL,source_hash text,actor_id text NOT NULL,override_event_id text,occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,resource_type,resource_id,version),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,override_event_id) REFERENCES approval_override_event(tenant_id,event_id)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['hr_attendance_close_employee','hr_attendance_completion_event'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',t);
 EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation()',t);
END LOOP; END $$;
ALTER TABLE hr_payroll_input DROP CONSTRAINT hr_payroll_input_evidence_version_check,DROP CONSTRAINT hr_payroll_input_evidence_shape,
 ADD CONSTRAINT hr_payroll_input_evidence_version_check CHECK(evidence_version IN ('legacy_summary_v1','attendance_leave_overtime_v2','attendance_leave_overtime_v3','attendance_leave_overtime_v4','attendance_close_v5')),
 ADD CONSTRAINT hr_payroll_input_evidence_shape CHECK((evidence_version='legacy_summary_v1' AND jsonb_array_length(source_snapshot_json)=0) OR (evidence_version<>'legacy_summary_v1' AND jsonb_array_length(source_snapshot_json)::numeric=calendar_days)),
 ADD COLUMN completion_payload jsonb;
-- Serialize source ingestion with review/lock, including device writes outside the API.
CREATE FUNCTION serialize_hr_attendance_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; BEGIN r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:attendance:'||(r->>'tenant_id')||':'||(r->>'company_id'),0));
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['hr_attendance_punch','hr_leave_request','hr_leave_request_day','hr_attendance_correction','hr_overtime_request','hr_holiday','hr_overtime_rule','employee_assignment','hr_leave_type','hr_shift'] LOOP
 EXECUTE format('CREATE TRIGGER hr_a00_attendance_serialization BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION serialize_hr_attendance_source()',t);
END LOOP;END $$;
CREATE FUNCTION guard_hr_close_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Attendance period history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.state='locked' THEN RAISE EXCEPTION 'Locked attendance periods are immutable' USING ERRCODE='23514'; END IF;
 IF NOT NEW.workflow_managed THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF NOT OLD.workflow_managed OR NEW.version<>OLD.version+1 OR ROW(NEW.id,NEW.tenant_id,NEW.company_id,NEW.month,NEW.opened_by,NEW.opened_at) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.company_id,OLD.month,OLD.opened_by,OLD.opened_at) THEN RAISE EXCEPTION 'Period identity/version is protected' USING ERRCODE='23514'; END IF;
  IF NEW.state='locked' AND (OLD.state<>'hr_review' OR NEW.exception_count<>0 OR NEW.employee_count<1 OR NEW.review_hash IS DISTINCT FROM NEW.source_hash OR NEW.close_run_id IS NULL OR (NEW.locked_by IN (NEW.opened_by,NEW.submitted_by) AND NEW.lock_override_event_id IS NULL)) THEN RAISE EXCEPTION 'Attendance review, source evidence and independent lock are required' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_period_history_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_attendance_period FOR EACH ROW EXECUTE FUNCTION guard_hr_close_history();
CREATE FUNCTION guard_hr_overtime_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.workflow_managed THEN RAISE EXCEPTION 'Overtime history cannot be deleted' USING ERRCODE='23514';END IF;RETURN OLD;END IF;
 IF NOT NEW.workflow_managed THEN IF TG_OP='UPDATE' AND OLD.workflow_managed THEN RAISE EXCEPTION 'Overtime governance is protected' USING ERRCODE='23514'; END IF;RETURN NEW;END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'draft' OR NEW.version<>1 OR NEW.operational_rule_id IS NULL THEN RAISE EXCEPTION 'Overtime starts as an evidenced draft' USING ERRCODE='23514';END IF;
 ELSE
  IF NOT OLD.workflow_managed OR OLD.status IN ('approved','rejected','cancelled') OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Final overtime or version is protected' USING ERRCODE='23514';END IF;
  IF ROW(NEW.id,NEW.tenant_id,NEW.company_id,NEW.employee_id,NEW.work_date,NEW.category,NEW.requested_minutes,NEW.reason,NEW.requested_by,NEW.reference,NEW.operational_rule_id,NEW.operational_rule_evidence_hash) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.company_id,OLD.employee_id,OLD.work_date,OLD.category,OLD.requested_minutes,OLD.reason,OLD.requested_by,OLD.reference,OLD.operational_rule_id,OLD.operational_rule_evidence_hash) THEN RAISE EXCEPTION 'Overtime terms are immutable; cancel and replace a draft' USING ERRCODE='23514';END IF;
  IF NOT ((OLD.status='draft' AND NEW.status IN ('pending_manager','cancelled')) OR (OLD.status='pending_manager' AND NEW.status IN ('pending_hr','rejected','cancelled')) OR (OLD.status='pending_hr' AND NEW.status IN ('approved','rejected','cancelled'))) THEN RAISE EXCEPTION 'Invalid overtime transition' USING ERRCODE='23514'; END IF;
  IF OLD.status<>'draft' AND ROW(NEW.submitted_by,NEW.manager_user_id,NEW.subject_user_ids) IS DISTINCT FROM ROW(OLD.submitted_by,OLD.manager_user_id,OLD.subject_user_ids) THEN RAISE EXCEPTION 'Submitted routing is immutable' USING ERRCODE='23514';END IF;
  IF OLD.status='pending_hr' AND ROW(NEW.manager_decided_by,NEW.manager_decided_at,NEW.manager_override_event_id) IS DISTINCT FROM ROW(OLD.manager_decided_by,OLD.manager_decided_at,OLD.manager_override_event_id) THEN RAISE EXCEPTION 'Manager decision is immutable' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.status IN ('pending_manager','pending_hr','approved') AND (NEW.manager_user_id IS NULL OR NEW.submitted_by IS NULL OR NEW.review_source_hash IS NULL) THEN RAISE EXCEPTION 'Submission needs manager and evidence' USING ERRCODE='23514'; END IF;
 IF NEW.status IN ('pending_hr','approved') AND (NEW.manager_decided_by IS DISTINCT FROM NEW.manager_user_id OR NEW.manager_decided_at IS NULL) THEN RAISE EXCEPTION 'Routed manager approval is required' USING ERRCODE='23514'; END IF;
 IF NEW.status='approved' AND (NEW.hr_decided_by IS NULL OR NEW.hr_decided_at IS NULL OR NEW.approved_minutes>NEW.requested_minutes OR NEW.approved_minutes<=0) THEN RAISE EXCEPTION 'Valid HR-approved minutes are required' USING ERRCODE='23514'; END IF;
 IF NEW.manager_decided_by IS NOT NULL AND (NEW.manager_decided_by IN (NEW.requested_by,NEW.submitted_by) OR NEW.manager_decided_by=ANY(NEW.subject_user_ids)) AND NEW.manager_override_event_id IS NULL THEN RAISE EXCEPTION 'Manager separation requires override' USING ERRCODE='23514';END IF;
 IF NEW.hr_decided_by IS NOT NULL AND (NEW.hr_decided_by IN (NEW.requested_by,NEW.submitted_by,NEW.manager_decided_by) OR NEW.hr_decided_by=ANY(NEW.subject_user_ids)) AND NEW.hr_override_event_id IS NULL THEN RAISE EXCEPTION 'HR separation requires override' USING ERRCODE='23514';END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER hr_overtime_workflow_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_overtime_request FOR EACH ROW EXECUTE FUNCTION guard_hr_overtime_workflow();
-- Operational rule rows used by a claim cannot be edited retrospectively.
CREATE FUNCTION protect_hr_operational_overtime_rule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF EXISTS(SELECT 1 FROM hr_overtime_request WHERE tenant_id=OLD.tenant_id AND operational_rule_id=OLD.id) THEN RAISE EXCEPTION 'Referenced overtime rules are immutable; use a later non-overlapping version' USING ERRCODE='23514';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
CREATE TRIGGER hr_overtime_rule_history BEFORE UPDATE OR DELETE ON hr_overtime_rule FOR EACH ROW EXECUTE FUNCTION protect_hr_operational_overtime_rule();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',47,'attendance_overtime_period_close_inputs');
