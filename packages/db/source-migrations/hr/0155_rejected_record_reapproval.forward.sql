-- HR155: rejected records can be approved again (re-approval) instead of being permanently blocked.
--
-- 1. Employee Lifecycle cases (onboarding, probation, resignation, termination, exit clearance,
--    settlement): a rejected case may move to approved through the normal independent approval.
--    The rejection stays in hr_lifecycle_case_event and the platform audit; the re-approval is a new
--    event. The officer who rejected may re-approve, but the author/submitter and the employee may not.
-- 2. Lifecycle policies gain an independent Rejected decision (pending_approval -> rejected) and the
--    same re-approval path (rejected -> approved). Rejected policies keep their identity immutable.
-- Rollback: restore guard_hr_lifecycle_case and protect_hr_employment_policy /
-- enforce_hr_lifecycle_policy_approval_override from HR150/HR034 (only after confirming no policy is
-- 'rejected'), drop hr_employment_lifecycle_policy_rejection_check, rejected_by and rejected_at, and
-- restore the original status CHECK.

CREATE OR REPLACE FUNCTION public.guard_hr_lifecycle_case()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE rel hr_employment_relationship%ROWTYPE;p hr_lifecycle_case%ROWTYPE;reapproval boolean;
BEGIN

 IF TG_OP='UPDATE' AND OLD.kind='settlement' AND OLD.state='approved' AND EXISTS(
  SELECT 1 FROM hr_settlement_void_request v WHERE v.tenant_id=NEW.tenant_id AND v.company_id=NEW.company_id AND v.case_id=NEW.id AND(
   (v.state='submitted' AND v.case_version=OLD.version AND NEW.state='approved')
   OR(v.state IN('approved','rejected') AND v.case_version=OLD.version-1 AND NEW.state=CASE WHEN v.state='approved' THEN 'cancelled' ELSE 'approved' END))
 ) THEN
  IF NEW.version<>OLD.version+1 OR(to_jsonb(NEW)-ARRAY['version','state','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['version','state','updated_at']) THEN RAISE EXCEPTION 'Corrections preserve the original approved statement and evidence';END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Lifecycle case history cannot be deleted';END IF;
 SELECT * INTO rel FROM hr_employment_relationship WHERE tenant_id=NEW.tenant_id AND id=NEW.relationship_id AND legal_employer_id=NEW.company_id AND employee_id=NEW.employee_id;
 IF rel.id IS NULL OR rel.approval_state<>'approved' THEN RAISE EXCEPTION 'Lifecycle cases require approved employment';END IF;
 IF NEW.terms->>'kind' IS DISTINCT FROM NEW.kind THEN RAISE EXCEPTION 'Case terms must match the record kind';END IF;
 reapproval := TG_OP='UPDATE' AND OLD.state='rejected' AND NEW.state='approved';
 IF TG_OP='INSERT' THEN IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'Lifecycle cases start as unapproved drafts';END IF;
 ELSE
  IF ROW(NEW.tenant_id,NEW.company_id,NEW.id,NEW.kind,NEW.relationship_id,NEW.employee_id,NEW.parent_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.company_id,OLD.id,OLD.kind,OLD.relationship_id,OLD.employee_id,OLD.parent_id,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Lifecycle identity and version are protected';END IF;
  IF OLD.state IN('closed','cancelled') OR(OLD.state='rejected' AND NOT reapproval) OR(OLD.state='approved' AND NOT(NEW.state='closed' AND NEW.kind IN('resignation','termination'))) THEN RAISE EXCEPTION 'Approved lifecycle evidence is immutable';END IF;
  IF NEW.state=OLD.state THEN IF OLD.state<>'draft' THEN RAISE EXCEPTION 'Only drafts can be edited';END IF;
  ELSIF NOT((OLD.state='draft' AND NEW.state IN('submitted','cancelled')) OR(OLD.state='submitted' AND NEW.state IN('draft','approved','rejected')) OR reapproval OR(OLD.state='approved' AND NEW.state='closed' AND NEW.kind IN('resignation','termination'))) THEN RAISE EXCEPTION 'Unsupported lifecycle transition';END IF;
  IF OLD.state<>NEW.state AND NEW.terms IS DISTINCT FROM OLD.terms THEN RAISE EXCEPTION 'Decisions preserve reviewed terms';END IF;
  IF reapproval AND NEW.submitted_by IS DISTINCT FROM OLD.submitted_by THEN RAISE EXCEPTION 'Re-approval preserves the original submission';END IF;
 END IF;
 IF NEW.kind IN('clearance','settlement') THEN SELECT * INTO p FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.parent_id;IF p.id IS NULL OR p.kind NOT IN('resignation','termination') OR p.state<>'approved' OR p.relationship_id<>NEW.relationship_id OR NEW.terms->>'exit_case_id' IS DISTINCT FROM p.id THEN RAISE EXCEPTION 'Choose the approved exit of the same employee';END IF;
 ELSIF NEW.parent_id IS NOT NULL OR NEW.terms->>'relationship_id' IS DISTINCT FROM NEW.relationship_id THEN RAISE EXCEPTION 'Case relationship terms do not match';END IF;
 -- The officer who rejected (OLD.updated_by) may re-approve; authors, submitters and the employee may not.
 IF NEW.state IN('approved','rejected') AND(NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,NEW.submitted_by) OR(NOT reapproval AND NEW.decided_by=OLD.updated_by) OR EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=NEW.tenant_id AND b.employee_id=NEW.employee_id AND b.user_id=NEW.decided_by AND b.ended_at IS NULL)) THEN RAISE EXCEPTION 'Independent lifecycle approval is required';END IF;
 IF NEW.state IN('submitted','approved') AND NEW.kind IN('onboarding','clearance') AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.terms->'tasks') t WHERE(t->>'complete')::boolean IS DISTINCT FROM true) THEN RAISE EXCEPTION 'Mark every checklist item done before submitting';END IF;
 IF NEW.kind IN('resignation','termination') AND NEW.state='closed' AND(NOT EXISTS(SELECT 1 FROM hr_lifecycle_case c WHERE c.tenant_id=NEW.tenant_id AND c.parent_id=NEW.id AND c.kind='clearance' AND c.state='approved') OR NOT EXISTS(SELECT 1 FROM hr_lifecycle_case c WHERE c.tenant_id=NEW.tenant_id AND c.parent_id=NEW.id AND c.kind='settlement' AND c.state='approved') OR NOT EXISTS(SELECT 1 FROM hr_employment_event e WHERE e.tenant_id=NEW.tenant_id AND e.relationship_id=NEW.relationship_id AND e.source_reference='hr:lifecycle-case:'||NEW.id AND e.event_type=NEW.kind)) THEN RAISE EXCEPTION 'Offboarding needs approved clearance, settlement and the authoritative employment event';END IF;
 RETURN NEW;
END $function$;

ALTER TABLE hr_employment_lifecycle_policy
    ADD COLUMN rejected_by text CHECK (rejected_by IS NULL OR length(rejected_by) BETWEEN 1 AND 128),
    ADD COLUMN rejected_at timestamptz;
ALTER TABLE hr_employment_lifecycle_policy DROP CONSTRAINT hr_employment_lifecycle_policy_status_check;
ALTER TABLE hr_employment_lifecycle_policy ADD CONSTRAINT hr_employment_lifecycle_policy_status_check
    CHECK (status IN ('draft','pending_approval','approved','active','inactive','rejected'));
ALTER TABLE hr_employment_lifecycle_policy ADD CONSTRAINT hr_employment_lifecycle_policy_rejection_check
    CHECK (status <> 'rejected' OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL AND submitted_by IS NOT NULL));

CREATE OR REPLACE FUNCTION public.protect_hr_employment_policy()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP='DELETE' AND OLD.status<>'draft' THEN
        RAISE EXCEPTION 'approved lifecycle policies cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF OLD.status<>'draft' AND (
        NEW.tenant_id<>OLD.tenant_id OR NEW.legal_employer_id<>OLD.legal_employer_id
        OR NEW.code<>OLD.code OR NEW.name<>OLD.name OR NEW.version<>OLD.version
        OR NEW.effective_from<>OLD.effective_from OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
        OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
    ) THEN
        RAISE EXCEPTION 'submitted lifecycle policy identity is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status='draft' AND NEW.status NOT IN ('draft','pending_approval') THEN
        RAISE EXCEPTION 'draft lifecycle policy must be submitted before approval' USING ERRCODE='23514';
    END IF;
    IF OLD.status='pending_approval' AND NEW.status NOT IN ('pending_approval','approved','rejected','draft') THEN
        RAISE EXCEPTION 'pending lifecycle policy must be decided before activation' USING ERRCODE='23514';
    END IF;
    IF OLD.status='rejected' AND NEW.status NOT IN ('rejected','approved') THEN
        RAISE EXCEPTION 'a rejected lifecycle policy can only be approved again' USING ERRCODE='23514';
    END IF;
    IF OLD.status='rejected' AND (NEW.rejected_by IS DISTINCT FROM OLD.rejected_by OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
        OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by) THEN
        RAISE EXCEPTION 'lifecycle policy rejection history is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status IN ('approved','active','inactive') AND NOT (
        (OLD.status='approved' AND NEW.status='active')
        OR (OLD.status='active' AND NEW.status='inactive')
        OR NEW.status=OLD.status
    ) THEN
        RAISE EXCEPTION 'approved lifecycle policy versions cannot be reopened' USING ERRCODE='23514';
    END IF;
    IF OLD.status='inactive' AND NEW.status<>OLD.status THEN
        RAISE EXCEPTION 'inactive lifecycle policy versions are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.enforce_hr_lifecycle_policy_approval_override()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    approval_same_actor boolean;
    activation_same_actor boolean;
BEGIN
    IF NEW.status IN ('draft','pending_approval','rejected') THEN
        IF NEW.approval_override_event_id IS NOT NULL
           OR NEW.activation_override_event_id IS NOT NULL THEN
            RAISE EXCEPTION 'undecided lifecycle policies cannot contain override evidence'
                USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;

    approval_same_actor := NEW.approved_by IS NOT NULL
        AND (NEW.approved_by=NEW.created_by OR NEW.approved_by=NEW.submitted_by);
    IF approval_same_actor <> (NEW.approval_override_event_id IS NOT NULL) THEN
        RAISE EXCEPTION 'same-actor lifecycle-policy approval requires governed override evidence'
            USING ERRCODE='23514';
    END IF;
    IF NEW.approval_override_event_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM approval_override_event event
         WHERE event.tenant_id=NEW.tenant_id
           AND event.event_id=NEW.approval_override_event_id
           AND event.resource_type='hr.employment_lifecycle_policy'
           AND event.resource_id=NEW.id
           AND event.actor_user_id=NEW.approved_by
           AND event.decision_action='approve'
    ) THEN
        RAISE EXCEPTION 'approval override event does not match lifecycle-policy approval'
            USING ERRCODE='23514';
    END IF;

    IF NEW.status='approved' THEN
        IF NEW.activation_override_event_id IS NOT NULL THEN
            RAISE EXCEPTION 'unactivated lifecycle policies cannot contain activation override evidence'
                USING ERRCODE='23514';
        END IF;
    ELSE
        activation_same_actor := NEW.activated_by IS NOT NULL
            AND (NEW.activated_by=NEW.created_by OR NEW.activated_by=NEW.submitted_by);
        IF activation_same_actor <> (NEW.activation_override_event_id IS NOT NULL) THEN
            RAISE EXCEPTION 'same-actor lifecycle-policy activation requires governed override evidence'
                USING ERRCODE='23514';
        END IF;
        IF NEW.activation_override_event_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM approval_override_event event
             WHERE event.tenant_id=NEW.tenant_id
               AND event.event_id=NEW.activation_override_event_id
               AND event.resource_type='hr.employment_lifecycle_policy'
               AND event.resource_id=NEW.id
               AND event.actor_user_id=NEW.activated_by
               AND event.decision_action='activate'
        ) THEN
            RAISE EXCEPTION 'approval override event does not match lifecycle-policy activation'
                USING ERRCODE='23514';
        END IF;
    END IF;

    IF TG_OP='UPDATE' THEN
        IF OLD.approval_override_event_id IS DISTINCT FROM NEW.approval_override_event_id
           AND NOT (OLD.status IN ('pending_approval','rejected') AND NEW.status='approved') THEN
            RAISE EXCEPTION 'lifecycle-policy approval evidence is immutable'
                USING ERRCODE='23514';
        END IF;
        IF OLD.activation_override_event_id IS DISTINCT FROM NEW.activation_override_event_id
           AND NOT (OLD.status='approved' AND NEW.status='active') THEN
            RAISE EXCEPTION 'lifecycle-policy activation evidence is immutable'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;

-- 3. Transfers and promotions: a rejected request can be approved again by an independent approver
--    (same effective-date and source-assignment rules as a first approval). The original rejection is
--    kept on the row in rejected_by / rejected_at / rejection_reason and in the platform audit.
ALTER TABLE tenant NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
  t text;
  tenant_scope text;
  previous_scope text := current_setting('nexora.tenant_id', true);
BEGIN
  FOREACH t IN ARRAY ARRAY['hr_employee_transfer_request','hr_employee_promotion_request'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN rejected_by text CHECK (rejected_by IS NULL OR length(rejected_by) BETWEEN 1 AND 128)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN rejected_at timestamptz', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN rejection_reason text CHECK (rejection_reason IS NULL OR char_length(btrim(rejection_reason)) BETWEEN 1 AND 1000)', t);
    -- Historical rejections: the decision columns already hold the rejection. Rows are tenant-scoped
    -- by row-level security, so back-fill one tenant at a time.
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', t);
    FOR tenant_scope IN SELECT id FROM tenant ORDER BY id LOOP
      PERFORM set_config('nexora.tenant_id', tenant_scope, true);
      EXECUTE format('UPDATE %I SET rejected_by=decided_by,rejected_at=decided_at,rejection_reason=decision_reason WHERE request_state=''rejected''', t);
    END LOOP;
    PERFORM set_config('nexora.tenant_id', coalesce(previous_scope, ''), true);
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', t);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (request_state<>''rejected'' OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL AND rejection_reason IS NOT NULL))', t, t || '_rejection_evidence');
  END LOOP;
END $$;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.protect_hr_employee_transfer_request()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'transfer requests cannot be deleted' USING ERRCODE='23514'; END IF;
    IF OLD.request_state='rejected' AND NEW.request_state='approved' THEN
        IF ROW(NEW.rejected_by,NEW.rejected_at,NEW.rejection_reason) IS DISTINCT FROM ROW(OLD.rejected_by,OLD.rejected_at,OLD.rejection_reason) THEN
            RAISE EXCEPTION 'transfer rejection history is immutable' USING ERRCODE='23514';
        END IF;
    ELSIF OLD.request_state<>'pending' THEN RAISE EXCEPTION 'decided transfer requests are immutable' USING ERRCODE='23514';
    END IF;
    IF (to_jsonb(NEW)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id','rejected_by','rejected_at','rejection_reason'])
       <> (to_jsonb(OLD)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id','rejected_by','rejected_at','rejection_reason']) THEN
        RAISE EXCEPTION 'transfer request evidence is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.protect_hr_employee_promotion_request()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'promotion requests cannot be deleted' USING ERRCODE='23514'; END IF;
    IF OLD.request_state='rejected' AND NEW.request_state='approved' THEN
        IF ROW(NEW.rejected_by,NEW.rejected_at,NEW.rejection_reason) IS DISTINCT FROM ROW(OLD.rejected_by,OLD.rejected_at,OLD.rejection_reason) THEN
            RAISE EXCEPTION 'promotion rejection history is immutable' USING ERRCODE='23514';
        END IF;
    ELSIF OLD.request_state<>'pending' THEN RAISE EXCEPTION 'decided promotion requests are immutable' USING ERRCODE='23514';
    END IF;
    IF (to_jsonb(NEW)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id','rejected_by','rejected_at','rejection_reason'])
       <> (to_jsonb(OLD)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id','rejected_by','rejected_at','rejection_reason']) THEN
        RAISE EXCEPTION 'promotion request evidence is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

-- Shared override guard: decided override evidence stays immutable, except when a rejected request
-- is approved again (each table's own protect trigger decides whether that transition is allowed).
CREATE OR REPLACE FUNCTION public.enforce_hr_request_approval_override()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    row_data jsonb := to_jsonb(NEW);
    old_data jsonb := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
    target_resource_id text := row_data->>TG_ARGV[1];
    state_value text := row_data->>TG_ARGV[2];
    maker_actor text := row_data->>TG_ARGV[3];
    decision_actor text := row_data->>'decided_by';
    override_event_id text := row_data->>'approval_override_event_id';
    creator_actor text;
    same_actor boolean;
    target_decision_action text;
BEGIN
    IF state_value IN ('pending','pending_approval') THEN
        IF override_event_id IS NOT NULL THEN
            RAISE EXCEPTION 'pending HR decisions cannot contain override evidence'
                USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF state_value NOT IN ('approved','rejected') THEN RETURN NEW; END IF;

    IF TG_TABLE_NAME='hr_employee_draft_approval' THEN
        SELECT employee.created_by INTO creator_actor
          FROM employee
         WHERE employee.tenant_id=NEW.tenant_id
           AND employee.id=NEW.employee_id;
    END IF;
    same_actor := decision_actor IS NOT NULL
        AND (decision_actor=maker_actor OR decision_actor=creator_actor);
    IF same_actor <> (override_event_id IS NOT NULL) THEN
        RAISE EXCEPTION 'same-actor HR approval requires governed override evidence'
            USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE'
       AND old_data->>TG_ARGV[2] IN ('approved','rejected')
       AND NOT (old_data->>TG_ARGV[2]='rejected' AND state_value='approved')
       AND old_data->>'approval_override_event_id' IS DISTINCT FROM override_event_id THEN
        RAISE EXCEPTION 'decided HR override evidence is immutable'
            USING ERRCODE='23514';
    END IF;
    IF override_event_id IS NULL THEN RETURN NEW; END IF;

    target_decision_action := CASE state_value WHEN 'approved' THEN 'approve' ELSE 'reject' END;
    IF NOT EXISTS (
        SELECT 1 FROM approval_override_event event
         WHERE event.tenant_id=NEW.tenant_id
           AND event.event_id=override_event_id
           AND event.resource_type=TG_ARGV[0]
           AND event.resource_id=target_resource_id
           AND event.actor_user_id=decision_actor
           AND event.decision_action=target_decision_action
    ) THEN
        RAISE EXCEPTION 'approval override event does not match the governed HR decision'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

-- 4. Loan and advance requests: rejected -> approved re-approval (HR153 guard, one transition added).
--    Every decision is appended to hr_payroll_workspace_event, so the rejection stays in the history.
CREATE OR REPLACE FUNCTION protect_governed_payroll_terms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE successor hr_salary_assignment%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.workflow_managed OR (TG_TABLE_NAME='hr_salary_assignment' AND to_jsonb(OLD)->>'closed_by_successor_id' IS NOT NULL) THEN RAISE EXCEPTION 'Governed payroll records cannot be deleted'; END IF; RETURN OLD; END IF;
 IF TG_TABLE_NAME='hr_salary_assignment' THEN
  IF OLD.closed_by_successor_id IS NOT NULL THEN RAISE EXCEPTION 'Closed salary history is immutable'; END IF;
  IF NEW.closed_by_successor_id IS NOT NULL THEN
   SELECT * INTO successor FROM hr_salary_assignment WHERE tenant_id=NEW.tenant_id AND id=NEW.closed_by_successor_id;
   IF successor.id IS NULL OR successor.supersedes_id IS DISTINCT FROM OLD.id OR successor.company_id IS DISTINCT FROM OLD.company_id OR successor.employee_id IS DISTINCT FROM OLD.employee_id
    OR successor.predecessor_version<>OLD.version OR successor.state<>'submitted' OR OLD.state NOT IN('approved','effective') OR NEW.state IS DISTINCT FROM OLD.state
    OR successor.effective_from<=OLD.effective_from OR (OLD.effective_to IS NOT NULL AND OLD.effective_to<successor.effective_from)
    OR NEW.effective_to IS DISTINCT FROM successor.effective_from-1 OR NEW.version<>OLD.version+1
    OR (to_jsonb(NEW)-ARRAY['effective_to','closed_by_successor_id','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['effective_to','closed_by_successor_id','version'])
   THEN RAISE EXCEPTION 'Salary closure must match a submitted reviewed successor'; END IF;
   IF EXISTS(SELECT 1 FROM hr_payroll_period p WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id AND (p.month+interval '1 month'-interval '1 day')::date>=successor.effective_from AND p.state<>'open') THEN RAISE EXCEPTION 'A calculated Payroll period prevents this salary closure'; END IF;
   RETURN NEW;
  END IF;
 END IF;

 IF TG_TABLE_NAME='hr_payroll_adjustment' AND to_jsonb(OLD)->>'state'='approved' AND to_jsonb(NEW)->>'state'='consumed' THEN
  IF NEW.version<>OLD.version+1 OR NEW.consumed_result_id IS NULL OR (to_jsonb(NEW)-ARRAY['version','state','consumed_result_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','state','consumed_result_id']) OR NOT EXISTS(
   SELECT 1 FROM hr_payroll_result r JOIN hr_payroll_period p ON p.tenant_id=r.tenant_id AND p.id=r.period_id
    WHERE r.tenant_id=OLD.tenant_id AND r.id=NEW.consumed_result_id AND r.company_id=OLD.company_id AND r.employee_id=OLD.employee_id AND p.month=OLD.effective_month AND p.state IN('under_review','approved') AND p.run_number=r.run_number
     AND r.execution_evidence->'adjustments' @> jsonb_build_array(jsonb_build_object('id',OLD.id,'amount',OLD.amount::text,'version',OLD.version))
  ) THEN RAISE EXCEPTION 'Adjustment consumption requires its reviewed current Payroll result'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='hr_payroll_adjustment' AND to_jsonb(OLD)->>'state'='consumed' THEN RAISE EXCEPTION 'Consumed Payroll adjustments are immutable'; END IF;
 IF TG_TABLE_NAME='hr_employee_loan' AND OLD.workflow_managed AND to_jsonb(OLD)->>'state' IN('approved','active','settled') THEN
  IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version']) THEN RAISE EXCEPTION 'Funded loan terms and approval history are immutable'; END IF;
  IF OLD.state='approved' AND NEW.state='active' THEN
   IF NOT EXISTS(SELECT 1 FROM hr_loan_disbursement WHERE tenant_id=OLD.tenant_id AND company_id=OLD.company_id AND loan_id=OLD.id) THEN RAISE EXCEPTION 'Loan activation requires independently confirmed disbursement'; END IF;
  ELSIF OLD.state='active' AND NEW.state='settled' THEN
   IF NOT EXISTS(SELECT 1 FROM hr_loan_disbursement WHERE tenant_id=OLD.tenant_id AND loan_id=OLD.id) OR (SELECT count(*)<>OLD.instalment_count OR sum(amount)<>OLD.principal OR NOT bool_and(state='consumed') FROM hr_loan_instalment WHERE tenant_id=OLD.tenant_id AND loan_id=OLD.id) THEN RAISE EXCEPTION 'Settlement requires complete exact approved Payroll recovery'; END IF;
  ELSE RAISE EXCEPTION 'Unsupported funded loan lifecycle transition'; END IF;
  RETURN NEW;
 END IF;

 -- HR153: a draft loan/advance may have its terms revised while it remains a draft.
 IF TG_TABLE_NAME='hr_employee_loan' AND OLD.workflow_managed AND to_jsonb(OLD)->>'state'='draft' AND to_jsonb(NEW)->>'state'='draft' THEN
  IF NEW.workflow_managed IS DISTINCT FROM true OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Payroll version must advance exactly once'; END IF;
  IF (to_jsonb(NEW)-ARRAY['version','employee_id','principal','currency_code','start_month','instalment_count','component_id'])
     IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','employee_id','principal','currency_code','start_month','instalment_count','component_id'])
  THEN RAISE EXCEPTION 'Only draft loan terms can be revised; identity, code and approval evidence are fixed'; END IF;
  RETURN NEW;
 END IF;

 IF OLD.workflow_managed THEN
  IF NEW.workflow_managed IS DISTINCT FROM true OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Payroll version must advance exactly once'; END IF;
  IF (to_jsonb(NEW)-ARRAY['version','status','state','updated_at','submitted_by','submitted_at','approved_by','approved_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','status','state','updated_at','submitted_by','submitted_at','approved_by','approved_at']) THEN RAISE EXCEPTION 'Payroll terms are immutable; create a successor'; END IF;
  IF TG_TABLE_NAME IN('hr_salary_assignment','hr_payroll_adjustment','hr_employee_loan') THEN
   -- HR155: a rejected loan or advance may be approved again (re-approval) with fresh approval evidence.
   IF NOT ((OLD.state='draft' AND NEW.state IN('submitted','cancelled')) OR (OLD.state='submitted' AND NEW.state IN('approved','rejected','cancelled'))
        OR (TG_TABLE_NAME='hr_employee_loan' AND OLD.state='rejected' AND NEW.state='approved')) THEN RAISE EXCEPTION 'Invalid governed payroll lifecycle transition'; END IF;
   IF OLD.state='rejected' AND NEW.submitted_by IS DISTINCT FROM OLD.submitted_by THEN RAISE EXCEPTION 'Re-approval preserves the original submission'; END IF;
   IF NEW.state='approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.submitted_by IS NULL) THEN RAISE EXCEPTION 'Approval evidence is required'; END IF;
  END IF;
 END IF; RETURN NEW;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',155,'rejected_record_reapproval');
