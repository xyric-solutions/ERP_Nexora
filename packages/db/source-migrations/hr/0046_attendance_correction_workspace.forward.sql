ALTER TABLE hr_attendance_correction
 ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN reference text NOT NULL DEFAULT ('ACR-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
 ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false,
 ADD COLUMN manager_employee_id text,
 ADD COLUMN manager_user_id text,
 ADD COLUMN subject_user_ids text[] NOT NULL DEFAULT '{}',
 ADD COLUMN review_source_hash text,
 ADD COLUMN manager_override_event_id text,
 ADD COLUMN hr_override_event_id text,
 ADD CONSTRAINT fk_hr_correction_manager_employee FOREIGN KEY(tenant_id,manager_employee_id) REFERENCES employee(tenant_id,id),
 ADD CONSTRAINT fk_hr_correction_manager_user FOREIGN KEY(tenant_id,manager_user_id) REFERENCES security_user_account(tenant_id,id),
 ADD CONSTRAINT fk_hr_correction_manager_override FOREIGN KEY(tenant_id,manager_override_event_id) REFERENCES approval_override_event(tenant_id,event_id),
 ADD CONSTRAINT fk_hr_correction_hr_override FOREIGN KEY(tenant_id,hr_override_event_id) REFERENCES approval_override_event(tenant_id,event_id);
CREATE UNIQUE INDEX uq_hr_correction_reference ON hr_attendance_correction(tenant_id,company_id,reference);
CREATE INDEX idx_hr_correction_workspace ON hr_attendance_correction(tenant_id,company_id,status,work_date DESC,id);
CREATE INDEX idx_hr_correction_day ON hr_attendance_correction(tenant_id,company_id,employee_id,work_date,status);
CREATE TABLE hr_attendance_correction_event (
 tenant_id text NOT NULL,id text NOT NULL,correction_id text NOT NULL,version integer NOT NULL,
 action text NOT NULL CHECK(action IN ('create','update','submit','cancel','manager_approve','manager_reject','hr_approve','hr_reject')),
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 8 AND 1000),
 before_snapshot jsonb,after_snapshot jsonb NOT NULL,source_snapshot jsonb,source_hash text,
 actor_id text NOT NULL,override_event_id text,occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,correction_id,version),
 FOREIGN KEY(tenant_id,correction_id) REFERENCES hr_attendance_correction(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,override_event_id) REFERENCES approval_override_event(tenant_id,event_id),
 CHECK((source_snapshot IS NULL AND source_hash IS NULL) OR (source_snapshot IS NOT NULL AND source_hash ~ '^[a-f0-9]{64}$'))
);
ALTER TABLE hr_attendance_correction_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_attendance_correction_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_attendance_correction_event USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER hr_correction_event_immutable BEFORE UPDATE OR DELETE ON hr_attendance_correction_event FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
CREATE FUNCTION guard_hr_correction_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.workflow_managed THEN RAISE EXCEPTION 'Correction history cannot be deleted' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF NOT NEW.workflow_managed THEN
  IF TG_OP='UPDATE' AND OLD.workflow_managed THEN RAISE EXCEPTION 'Correction governance cannot be removed' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:attendance:'||NEW.tenant_id||':'||NEW.company_id,0));
 IF EXISTS(SELECT 1 FROM hr_attendance_period WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND state='locked' AND month=date_trunc('month',NEW.work_date)::date) THEN RAISE EXCEPTION 'Attendance period is locked' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.manager_decided_by IS NOT NULL OR NEW.hr_decided_by IS NOT NULL THEN RAISE EXCEPTION 'New corrections must start as drafts' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT OLD.workflow_managed THEN RAISE EXCEPTION 'Legacy correction evidence cannot be converted in place' USING ERRCODE='23514'; END IF;
  IF OLD.status IN ('approved','rejected','cancelled') THEN RAISE EXCEPTION 'Final correction evidence is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.version<>OLD.version+1 OR ROW(NEW.id,NEW.tenant_id,NEW.company_id,NEW.employee_id,NEW.work_date,NEW.requested_by,NEW.reference,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.company_id,OLD.employee_id,OLD.work_date,OLD.requested_by,OLD.reference,OLD.created_at) THEN RAISE EXCEPTION 'Correction identity or version is protected' USING ERRCODE='23514'; END IF;
  IF NOT ((OLD.status='draft' AND NEW.status IN ('draft','pending_manager','cancelled')) OR (OLD.status='pending_manager' AND NEW.status IN ('pending_hr','rejected','cancelled')) OR (OLD.status='pending_hr' AND NEW.status IN ('approved','rejected','cancelled'))) THEN RAISE EXCEPTION 'Correction state transition is invalid' USING ERRCODE='23514'; END IF;
  IF OLD.status<>'draft' AND ROW(NEW.kind,NEW.stated_in,NEW.stated_out,NEW.reason,NEW.submitted_by,NEW.manager_employee_id,NEW.manager_user_id,NEW.subject_user_ids) IS DISTINCT FROM ROW(OLD.kind,OLD.stated_in,OLD.stated_out,OLD.reason,OLD.submitted_by,OLD.manager_employee_id,OLD.manager_user_id,OLD.subject_user_ids) THEN RAISE EXCEPTION 'Submitted correction terms and routing are immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status='pending_hr' AND ROW(NEW.manager_decided_by,NEW.manager_decided_at,NEW.manager_override_event_id) IS DISTINCT FROM ROW(OLD.manager_decided_by,OLD.manager_decided_at,OLD.manager_override_event_id) THEN RAISE EXCEPTION 'Manager decision history is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status IN ('pending_manager','pending_hr','approved') THEN
  IF NEW.submitted_by IS NULL OR NEW.manager_user_id IS NULL OR NEW.review_source_hash IS NULL THEN RAISE EXCEPTION 'Submitted correction needs routing and source evidence' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM hr_attendance_correction WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND employee_id=NEW.employee_id AND work_date=NEW.work_date AND id<>NEW.id AND status IN ('pending_manager','pending_hr','approved')) THEN RAISE EXCEPTION 'Another correction is active for this employee date' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status IN ('pending_hr','approved') AND (NEW.manager_decided_by IS DISTINCT FROM NEW.manager_user_id OR NEW.manager_decided_at IS NULL) THEN RAISE EXCEPTION 'Assigned manager approval is required' USING ERRCODE='23514'; END IF;
 IF NEW.status='approved' AND (NEW.hr_decided_by IS NULL OR NEW.hr_decided_at IS NULL) THEN RAISE EXCEPTION 'Final HR decision is required' USING ERRCODE='23514'; END IF;
 IF NEW.manager_decided_by IS NOT NULL AND (NEW.manager_decided_by=NEW.requested_by OR NEW.manager_decided_by=NEW.submitted_by OR NEW.manager_decided_by=ANY(NEW.subject_user_ids)) AND NEW.manager_override_event_id IS NULL THEN RAISE EXCEPTION 'Manager maker-checker separation requires override evidence' USING ERRCODE='23514'; END IF;
 IF NEW.hr_decided_by IS NOT NULL AND (NEW.hr_decided_by=NEW.requested_by OR NEW.hr_decided_by=NEW.submitted_by OR NEW.hr_decided_by=NEW.manager_decided_by OR NEW.hr_decided_by=ANY(NEW.subject_user_ids)) AND NEW.hr_override_event_id IS NULL THEN RAISE EXCEPTION 'HR maker-checker separation requires override evidence' USING ERRCODE='23514'; END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER hr_correction_workflow_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_attendance_correction FOR EACH ROW EXECUTE FUNCTION guard_hr_correction_workflow();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',46,'attendance_correction_workspace');
