ALTER TABLE hr_leave_type ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE hr_leave_request
 ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN reference text NOT NULL DEFAULT ('LVR-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
 ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false,
 ADD COLUMN manager_user_id text,
 ADD COLUMN subject_user_ids text[] NOT NULL DEFAULT '{}',
 ADD COLUMN requires_hr_approval boolean NOT NULL DEFAULT true,
 ADD COLUMN review_source_hash text,
 ADD COLUMN manager_override_event_id text,
 ADD COLUMN hr_override_event_id text,
 ADD FOREIGN KEY(tenant_id,manager_user_id) REFERENCES security_user_account(tenant_id,id),
 ADD FOREIGN KEY(tenant_id,manager_override_event_id) REFERENCES approval_override_event(tenant_id,event_id),
 ADD FOREIGN KEY(tenant_id,hr_override_event_id) REFERENCES approval_override_event(tenant_id,event_id);
CREATE UNIQUE INDEX uq_hr_leave_reference ON hr_leave_request(tenant_id,company_id,reference);
ALTER TABLE hr_leave_request_day
 ADD COLUMN portion text NOT NULL DEFAULT 'full' CHECK(portion IN ('full','first_half','second_half')),
 ADD COLUMN paid_snapshot boolean;
ALTER TABLE hr_attendance_completion_event DROP CONSTRAINT hr_attendance_completion_event_resource_type_check,
 ADD CONSTRAINT hr_attendance_completion_event_resource_type_check CHECK(resource_type IN ('overtime','period','overtime_rule','leave_type','leave_request','leave_balance'));
CREATE INDEX ix_hr_leave_register ON hr_leave_request(tenant_id,company_id,created_at DESC,id);
CREATE INDEX ix_hr_leave_reservations ON hr_leave_request(tenant_id,company_id,employee_id,leave_type_id,status);
CREATE TRIGGER hr_a00_policy_serialization BEFORE INSERT OR UPDATE OR DELETE ON hr_leave_policy_version FOR EACH ROW EXECUTE FUNCTION serialize_hr_attendance_source();
CREATE TRIGGER hr_a00_ledger_serialization BEFORE INSERT ON hr_leave_transaction FOR EACH ROW EXECUTE FUNCTION serialize_hr_attendance_source();
CREATE OR REPLACE FUNCTION protect_leave_policy_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Leave policy versions are immutable' USING ERRCODE='23514';END IF;
 IF OLD.effective_to IS NOT NULL OR NEW.effective_to IS NULL OR NEW.effective_to<OLD.effective_from OR (to_jsonb(NEW)-'effective_to') IS DISTINCT FROM (to_jsonb(OLD)-'effective_to') OR EXISTS(SELECT 1 FROM hr_leave_request_day WHERE tenant_id=OLD.tenant_id AND policy_version_id=OLD.id AND leave_date>NEW.effective_to) THEN RAISE EXCEPTION 'Only a policy end date may close, preserving all referenced leave dates' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION protect_hr_leave_type_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Leave type history cannot be deleted' USING ERRCODE='23514';END IF;
 IF ROW(NEW.tenant_id,NEW.id,NEW.company_id,NEW.code,NEW.paid,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.company_id,OLD.code,OLD.paid,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Leave type identity, paid flag or version is protected' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_leave_type_identity BEFORE UPDATE OR DELETE ON hr_leave_type FOR EACH ROW EXECUTE FUNCTION protect_hr_leave_type_identity();
CREATE FUNCTION guard_hr_governed_leave_day() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r hr_leave_request%ROWTYPE;t hr_leave_type%ROWTYPE;BEGIN
 SELECT * INTO r FROM hr_leave_request WHERE tenant_id=NEW.tenant_id AND id=NEW.request_id;
 IF NOT r.workflow_managed THEN RETURN NEW;END IF;
 SELECT * INTO t FROM hr_leave_type WHERE tenant_id=NEW.tenant_id AND id=NEW.leave_type_id;
 IF r.status<>'draft' OR NEW.days IS DISTINCT FROM (CASE WHEN NEW.portion='full' THEN 1::numeric ELSE 0.5::numeric END) OR NEW.paid_snapshot IS DISTINCT FROM t.paid THEN RAISE EXCEPTION 'Governed leave days must be evidenced, exact draft allocations' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_leave_day_governance BEFORE INSERT ON hr_leave_request_day FOR EACH ROW EXECUTE FUNCTION guard_hr_governed_leave_day();
CREATE FUNCTION guard_hr_leave_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.workflow_managed THEN RAISE EXCEPTION 'Leave request history cannot be deleted' USING ERRCODE='23514';END IF;RETURN OLD;END IF;
 IF NOT NEW.workflow_managed THEN IF TG_OP='UPDATE' AND OLD.workflow_managed THEN RAISE EXCEPTION 'Leave governance cannot be removed' USING ERRCODE='23514';END IF;RETURN NEW;END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'draft' OR NEW.version<>1 THEN RAISE EXCEPTION 'Governed leave starts as a draft' USING ERRCODE='23514';END IF;
 ELSE
  IF NOT OLD.workflow_managed OR OLD.status IN ('approved','rejected','cancelled') OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Leave history or version is protected' USING ERRCODE='23514';END IF;
  IF ROW(NEW.id,NEW.tenant_id,NEW.company_id,NEW.employee_id,NEW.leave_type_id,NEW.document_id,NEW.from_date,NEW.to_date,NEW.requested_days,NEW.reason,NEW.requested_by,NEW.reference,NEW.requires_hr_approval) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.company_id,OLD.employee_id,OLD.leave_type_id,OLD.document_id,OLD.from_date,OLD.to_date,OLD.requested_days,OLD.reason,OLD.requested_by,OLD.reference,OLD.requires_hr_approval) THEN RAISE EXCEPTION 'Leave terms are immutable; cancel and replace a draft' USING ERRCODE='23514';END IF;
  IF NOT ((OLD.status='draft' AND NEW.status IN ('pending_manager','cancelled')) OR (OLD.status='pending_manager' AND NEW.status IN ('pending_hr','approved','rejected','cancelled')) OR (OLD.status='pending_hr' AND NEW.status IN ('approved','rejected','cancelled'))) THEN RAISE EXCEPTION 'Invalid leave transition' USING ERRCODE='23514';END IF;
  IF OLD.status<>'draft' AND ROW(NEW.submitted_by,NEW.manager_user_id,NEW.subject_user_ids) IS DISTINCT FROM ROW(OLD.submitted_by,OLD.manager_user_id,OLD.subject_user_ids) THEN RAISE EXCEPTION 'Submitted leave route is immutable' USING ERRCODE='23514';END IF;
  IF OLD.status='pending_hr' AND ROW(NEW.manager_decided_by,NEW.manager_decided_at,NEW.manager_override_event_id) IS DISTINCT FROM ROW(OLD.manager_decided_by,OLD.manager_decided_at,OLD.manager_override_event_id) THEN RAISE EXCEPTION 'Prior manager decision is immutable' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.status IN ('pending_manager','pending_hr','approved') AND (NEW.submitted_by IS NULL OR NEW.manager_user_id IS NULL OR NEW.review_source_hash IS NULL OR NOT EXISTS(SELECT 1 FROM hr_leave_request_day WHERE tenant_id=NEW.tenant_id AND request_id=NEW.id) OR NEW.requested_days IS DISTINCT FROM (SELECT sum(days) FROM hr_leave_request_day WHERE tenant_id=NEW.tenant_id AND request_id=NEW.id)) THEN RAISE EXCEPTION 'Leave submission needs exact days, route and evidence' USING ERRCODE='23514';END IF;
 IF NEW.status IN ('pending_hr','approved') AND (NEW.manager_decided_by IS DISTINCT FROM NEW.manager_user_id OR NEW.manager_decided_at IS NULL) THEN RAISE EXCEPTION 'Routed manager approval is required' USING ERRCODE='23514';END IF;
 IF NEW.status='approved' AND NEW.requires_hr_approval AND (NEW.hr_decided_by IS NULL OR NEW.hr_decided_at IS NULL) THEN RAISE EXCEPTION 'Final HR approval is required' USING ERRCODE='23514';END IF;
 IF NEW.manager_decided_by IS NOT NULL AND (NEW.manager_decided_by IN (NEW.requested_by,NEW.submitted_by) OR NEW.manager_decided_by=ANY(NEW.subject_user_ids)) AND NEW.manager_override_event_id IS NULL THEN RAISE EXCEPTION 'Manager separation requires governed override evidence' USING ERRCODE='23514';END IF;
 IF NEW.hr_decided_by IS NOT NULL AND (NEW.hr_decided_by IN (NEW.requested_by,NEW.submitted_by,NEW.manager_decided_by) OR NEW.hr_decided_by=ANY(NEW.subject_user_ids)) AND NEW.hr_override_event_id IS NULL THEN RAISE EXCEPTION 'HR separation requires governed override evidence' USING ERRCODE='23514';END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER hr_leave_workflow_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_leave_request FOR EACH ROW EXECUTE FUNCTION guard_hr_leave_workflow();
-- Final approval and used ledger entries must commit together, one exact entry per charged day.
CREATE FUNCTION validate_hr_leave_final_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.workflow_managed AND NEW.status='approved' AND EXISTS(SELECT 1 FROM hr_leave_request_day d WHERE d.tenant_id=NEW.tenant_id AND d.request_id=NEW.id AND NOT EXISTS(SELECT 1 FROM hr_leave_transaction t WHERE t.tenant_id=d.tenant_id AND t.company_id=d.company_id AND t.employee_id=d.employee_id AND t.leave_type_id=d.leave_type_id AND t.kind='used' AND t.source_type='leave_request' AND t.source_id=NEW.id||':'||d.leave_date::text AND t.effective_on=d.leave_date AND t.days=-d.days AND t.policy_version_id=d.policy_version_id)) THEN RAISE EXCEPTION 'Leave approval must commit its exact daily ledger usage' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER hr_leave_final_ledger AFTER INSERT OR UPDATE ON hr_leave_request DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_leave_final_ledger();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',50,'time_leave_governed_workspace');
