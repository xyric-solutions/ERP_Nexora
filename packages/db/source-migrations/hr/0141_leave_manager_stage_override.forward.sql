-- HR141: an authorized super administrator may decide the manager stage of a
-- leave request on behalf of the routed manager (for example when that
-- manager is unavailable or the employee's reporting line has changed).
-- Such a decision is accepted only with governed approval-override evidence
-- (manager_override_event_id). Decisions by the routed manager are unchanged.
--
-- Reversible: re-run the HR051 body of guard_hr_leave_workflow, which
-- requires manager_decided_by = manager_user_id for pending_hr/approved.

CREATE OR REPLACE FUNCTION public.guard_hr_leave_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.workflow_managed THEN RAISE EXCEPTION 'Leave request history cannot be deleted' USING ERRCODE='23514';END IF;RETURN OLD;END IF;
 IF NOT NEW.workflow_managed THEN IF TG_OP='UPDATE' AND OLD.workflow_managed THEN RAISE EXCEPTION 'Leave governance cannot be removed' USING ERRCODE='23514';END IF;RETURN NEW;END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'draft' OR NEW.version<>1 THEN RAISE EXCEPTION 'Governed leave starts as a draft' USING ERRCODE='23514';END IF;
 ELSE
  IF NOT OLD.workflow_managed OR (OLD.status IN ('approved','rejected','cancelled') AND NOT (OLD.status='approved' AND NEW.status='cancelled' AND NEW.cancellation_approved_by IS NOT NULL AND NEW.cancellation_approved_at IS NOT NULL)) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Leave history or version is protected' USING ERRCODE='23514';END IF;
  IF ROW(NEW.id,NEW.tenant_id,NEW.company_id,NEW.employee_id,NEW.leave_type_id,NEW.document_id,NEW.from_date,NEW.to_date,NEW.requested_days,NEW.reason,NEW.requested_by,NEW.reference,NEW.requires_hr_approval) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.company_id,OLD.employee_id,OLD.leave_type_id,OLD.document_id,OLD.from_date,OLD.to_date,OLD.requested_days,OLD.reason,OLD.requested_by,OLD.reference,OLD.requires_hr_approval) THEN RAISE EXCEPTION 'Leave terms are immutable; cancel and replace a draft' USING ERRCODE='23514';END IF;
  IF NOT ((OLD.status='draft' AND NEW.status IN ('pending_manager','cancelled')) OR (OLD.status='pending_manager' AND NEW.status IN ('pending_hr','approved','rejected','cancelled')) OR (OLD.status='pending_hr' AND NEW.status IN ('approved','rejected','cancelled')) OR (OLD.status='approved' AND NEW.status='cancelled')) THEN RAISE EXCEPTION 'Invalid leave transition' USING ERRCODE='23514';END IF;
  IF OLD.status<>'draft' AND ROW(NEW.submitted_by,NEW.manager_user_id,NEW.subject_user_ids) IS DISTINCT FROM ROW(OLD.submitted_by,OLD.manager_user_id,OLD.subject_user_ids) THEN RAISE EXCEPTION 'Submitted leave route is immutable' USING ERRCODE='23514';END IF;
  IF OLD.status IN ('pending_hr','approved') AND ROW(NEW.manager_decided_by,NEW.manager_decided_at,NEW.manager_override_event_id) IS DISTINCT FROM ROW(OLD.manager_decided_by,OLD.manager_decided_at,OLD.manager_override_event_id) THEN RAISE EXCEPTION 'Prior manager decision is immutable' USING ERRCODE='23514';END IF;
  IF OLD.status='approved' AND ROW(NEW.hr_decided_by,NEW.hr_decided_at,NEW.hr_override_event_id) IS DISTINCT FROM ROW(OLD.hr_decided_by,OLD.hr_decided_at,OLD.hr_override_event_id) THEN RAISE EXCEPTION 'Original HR approval remains immutable' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.cancellation_approved_by IS NOT NULL AND (NEW.cancellation_approved_by IN (NEW.requested_by,NEW.submitted_by,NEW.manager_decided_by,NEW.hr_decided_by) OR NEW.cancellation_approved_by=ANY(NEW.subject_user_ids)) AND NEW.cancellation_override_event_id IS NULL THEN RAISE EXCEPTION 'Approved cancellation requires independent HR or governed override evidence' USING ERRCODE='23514';END IF;
 IF NEW.status IN ('pending_manager','pending_hr','approved') AND (NEW.submitted_by IS NULL OR NEW.manager_user_id IS NULL OR NEW.review_source_hash IS NULL OR NOT EXISTS(SELECT 1 FROM hr_leave_request_day WHERE tenant_id=NEW.tenant_id AND request_id=NEW.id) OR NEW.requested_days IS DISTINCT FROM (SELECT sum(days) FROM hr_leave_request_day WHERE tenant_id=NEW.tenant_id AND request_id=NEW.id)) THEN RAISE EXCEPTION 'Leave submission needs exact days, route and evidence' USING ERRCODE='23514';END IF;
 IF NEW.status IN ('pending_hr','approved') AND NEW.manager_decided_at IS NULL THEN RAISE EXCEPTION 'Routed manager approval is required' USING ERRCODE='23514';END IF;
 -- HR141: a decision by someone other than the routed manager needs governed override evidence.
 IF NEW.status IN ('pending_hr','approved') AND NEW.manager_decided_by IS DISTINCT FROM NEW.manager_user_id AND NEW.manager_override_event_id IS NULL THEN RAISE EXCEPTION 'Routed manager approval is required' USING ERRCODE='23514';END IF;
 IF NEW.status='approved' AND NEW.requires_hr_approval AND (NEW.hr_decided_by IS NULL OR NEW.hr_decided_at IS NULL) THEN RAISE EXCEPTION 'Final HR approval is required' USING ERRCODE='23514';END IF;
 IF NEW.manager_decided_by IS NOT NULL AND (NEW.manager_decided_by IN (NEW.requested_by,NEW.submitted_by) OR NEW.manager_decided_by=ANY(NEW.subject_user_ids)) AND NEW.manager_override_event_id IS NULL THEN RAISE EXCEPTION 'Manager separation requires governed override evidence' USING ERRCODE='23514';END IF;
 IF NEW.hr_decided_by IS NOT NULL AND (NEW.hr_decided_by IN (NEW.requested_by,NEW.submitted_by,NEW.manager_decided_by) OR NEW.hr_decided_by=ANY(NEW.subject_user_ids)) AND NEW.hr_override_event_id IS NULL THEN RAISE EXCEPTION 'HR separation requires governed override evidence' USING ERRCODE='23514';END IF;
 NEW.updated_at:=now();RETURN NEW;
END $function$;

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',141,'leave_manager_stage_override');
