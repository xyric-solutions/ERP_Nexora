-- Lifecycle policies describe the company policy and can be deactivated; lifecycle
-- cases gain an independent 'rejected' decision and checklist items need only be done.
ALTER TABLE hr_employment_lifecycle_policy
    ADD COLUMN description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
    ADD COLUMN deactivated_by text CHECK (deactivated_by IS NULL OR length(deactivated_by) BETWEEN 1 AND 128),
    ADD COLUMN deactivated_at timestamptz;

ALTER TABLE hr_lifecycle_case DROP CONSTRAINT IF EXISTS hr_lifecycle_case_state_check;
ALTER TABLE hr_lifecycle_case ADD CONSTRAINT hr_lifecycle_case_state_check
    CHECK (state IN ('draft','submitted','approved','rejected','closed','cancelled'));

-- A rejected case no longer blocks a fresh case for the same employment.
DROP INDEX IF EXISTS lifecycle_open_exit;
CREATE UNIQUE INDEX lifecycle_open_exit ON hr_lifecycle_case(tenant_id,relationship_id)
    WHERE kind IN ('resignation','termination') AND state NOT IN ('cancelled','rejected');
DROP INDEX IF EXISTS lifecycle_one_onboarding;
CREATE UNIQUE INDEX lifecycle_one_onboarding ON hr_lifecycle_case(tenant_id,relationship_id)
    WHERE kind='onboarding' AND state NOT IN ('cancelled','rejected');
DROP INDEX IF EXISTS lifecycle_exit_child;
CREATE UNIQUE INDEX lifecycle_exit_child ON hr_lifecycle_case(tenant_id,parent_id,kind)
    WHERE kind IN ('clearance','settlement') AND state NOT IN ('cancelled','rejected');
CREATE INDEX IF NOT EXISTS lifecycle_case_company_state ON hr_lifecycle_case(tenant_id,company_id,kind,state);

CREATE OR REPLACE FUNCTION public.guard_hr_lifecycle_case()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE rel hr_employment_relationship%ROWTYPE;p hr_lifecycle_case%ROWTYPE;
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
 IF TG_OP='INSERT' THEN IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'Lifecycle cases start as unapproved drafts';END IF;
 ELSE
  IF ROW(NEW.tenant_id,NEW.company_id,NEW.id,NEW.kind,NEW.relationship_id,NEW.employee_id,NEW.parent_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.company_id,OLD.id,OLD.kind,OLD.relationship_id,OLD.employee_id,OLD.parent_id,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Lifecycle identity and version are protected';END IF;
  IF OLD.state IN('closed','cancelled','rejected') OR(OLD.state='approved' AND NOT(NEW.state='closed' AND NEW.kind IN('resignation','termination'))) THEN RAISE EXCEPTION 'Approved lifecycle evidence is immutable';END IF;
  IF NEW.state=OLD.state THEN IF OLD.state<>'draft' THEN RAISE EXCEPTION 'Only drafts can be edited';END IF;
  ELSIF NOT((OLD.state='draft' AND NEW.state IN('submitted','cancelled')) OR(OLD.state='submitted' AND NEW.state IN('draft','approved','rejected')) OR(OLD.state='approved' AND NEW.state='closed' AND NEW.kind IN('resignation','termination'))) THEN RAISE EXCEPTION 'Unsupported lifecycle transition';END IF;
  IF OLD.state<>NEW.state AND NEW.terms IS DISTINCT FROM OLD.terms THEN RAISE EXCEPTION 'Decisions preserve reviewed terms';END IF;
 END IF;
 IF NEW.kind IN('clearance','settlement') THEN SELECT * INTO p FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.parent_id;IF p.id IS NULL OR p.kind NOT IN('resignation','termination') OR p.state<>'approved' OR p.relationship_id<>NEW.relationship_id OR NEW.terms->>'exit_case_id' IS DISTINCT FROM p.id THEN RAISE EXCEPTION 'Choose the approved exit of the same employee';END IF;
 ELSIF NEW.parent_id IS NOT NULL OR NEW.terms->>'relationship_id' IS DISTINCT FROM NEW.relationship_id THEN RAISE EXCEPTION 'Case relationship terms do not match';END IF;
 IF NEW.state IN('approved','rejected') AND(NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,OLD.updated_by,NEW.submitted_by) OR EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=NEW.tenant_id AND b.employee_id=NEW.employee_id AND b.user_id=NEW.decided_by AND b.ended_at IS NULL)) THEN RAISE EXCEPTION 'Independent lifecycle approval is required';END IF;
 IF NEW.state IN('submitted','approved') AND NEW.kind IN('onboarding','clearance') AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.terms->'tasks') t WHERE(t->>'complete')::boolean IS DISTINCT FROM true) THEN RAISE EXCEPTION 'Mark every checklist item done before submitting';END IF;
 IF NEW.kind IN('resignation','termination') AND NEW.state='closed' AND(NOT EXISTS(SELECT 1 FROM hr_lifecycle_case c WHERE c.tenant_id=NEW.tenant_id AND c.parent_id=NEW.id AND c.kind='clearance' AND c.state='approved') OR NOT EXISTS(SELECT 1 FROM hr_lifecycle_case c WHERE c.tenant_id=NEW.tenant_id AND c.parent_id=NEW.id AND c.kind='settlement' AND c.state='approved') OR NOT EXISTS(SELECT 1 FROM hr_employment_event e WHERE e.tenant_id=NEW.tenant_id AND e.relationship_id=NEW.relationship_id AND e.source_reference='hr:lifecycle-case:'||NEW.id AND e.event_type=NEW.kind)) THEN RAISE EXCEPTION 'Offboarding needs approved clearance, settlement and the authoritative employment event';END IF;
 RETURN NEW;
END $function$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',150,'lifecycle_policy_description_case_rejection');
