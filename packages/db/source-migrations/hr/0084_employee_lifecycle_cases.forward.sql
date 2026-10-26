CREATE TABLE hr_lifecycle_case(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,relationship_id text NOT NULL,employee_id text NOT NULL,
 parent_id text,kind text NOT NULL CHECK(kind IN('onboarding','probation','resignation','termination','clearance','settlement')),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','submitted','approved','closed','cancelled')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 terms jsonb NOT NULL CHECK(jsonb_typeof(terms)='object'),evidence jsonb NOT NULL DEFAULT '{}',created_by text NOT NULL,updated_by text NOT NULL,submitted_by text,decided_by text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),FOREIGN KEY(tenant_id,relationship_id,company_id) REFERENCES hr_employment_relationship(tenant_id,id,legal_employer_id),
 FOREIGN KEY(tenant_id,employee_id) REFERENCES employee(tenant_id,id),FOREIGN KEY(tenant_id,company_id,parent_id) REFERENCES hr_lifecycle_case(tenant_id,company_id,id)
);
CREATE UNIQUE INDEX lifecycle_open_exit ON hr_lifecycle_case(tenant_id,relationship_id) WHERE kind IN('resignation','termination') AND state<>'cancelled';
CREATE UNIQUE INDEX lifecycle_one_onboarding ON hr_lifecycle_case(tenant_id,relationship_id) WHERE kind='onboarding' AND state<>'cancelled';
CREATE UNIQUE INDEX lifecycle_exit_child ON hr_lifecycle_case(tenant_id,parent_id,kind) WHERE kind IN('clearance','settlement') AND state<>'cancelled';
CREATE INDEX lifecycle_case_company ON hr_lifecycle_case(tenant_id,company_id,kind,updated_at DESC);
CREATE TABLE hr_lifecycle_case_event(tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,record_id text NOT NULL,version integer NOT NULL,action text NOT NULL,reason text NOT NULL,actor_id text NOT NULL,before_json jsonb,after_json jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,record_id,version),FOREIGN KEY(tenant_id,company_id,record_id) REFERENCES hr_lifecycle_case(tenant_id,company_id,id));
ALTER TABLE hr_lifecycle_case ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_lifecycle_case FORCE ROW LEVEL SECURITY;
CREATE POLICY lifecycle_case_tenant ON hr_lifecycle_case USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_lifecycle_case_event ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_lifecycle_case_event FORCE ROW LEVEL SECURITY;
CREATE POLICY lifecycle_case_event_tenant ON hr_lifecycle_case_event USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER lifecycle_case_event_immutable BEFORE UPDATE OR DELETE ON hr_lifecycle_case_event FOR EACH ROW EXECUTE FUNCTION reject_payroll_snapshot_mutation();
CREATE FUNCTION guard_hr_lifecycle_case() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rel hr_employment_relationship%ROWTYPE;p hr_lifecycle_case%ROWTYPE;
BEGIN
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
CREATE TRIGGER lifecycle_case_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_lifecycle_case FOR EACH ROW EXECUTE FUNCTION guard_hr_lifecycle_case();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',84,'employee_lifecycle_cases');
