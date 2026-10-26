DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM nexora_schema_migration WHERE module_name='hr' AND version=53) THEN RAISE EXCEPTION 'Payroll workspace requires HR53'; END IF;
END $$;
ALTER TABLE hr_salary_structure ADD COLUMN currency_code text CHECK(currency_code ~ '^[A-Z]{3}$');
DO $$ DECLARE tbl text; BEGIN
FOREACH tbl IN ARRAY ARRAY['hr_pay_component','hr_salary_structure','hr_salary_assignment','hr_payroll_adjustment','hr_employee_loan'] LOOP
EXECUTE format('ALTER TABLE %I ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0), ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false',tbl);
END LOOP; END $$;
ALTER TABLE hr_payroll_adjustment ADD COLUMN submitted_by text, ADD COLUMN submitted_at timestamptz;
ALTER TABLE hr_employee_loan ADD COLUMN submitted_by text, ADD COLUMN submitted_at timestamptz;
CREATE TABLE hr_payroll_workspace_event(
tenant_id text NOT NULL,id text NOT NULL,company_id text NOT NULL,record_id text NOT NULL,record_type text NOT NULL CHECK(record_type IN('component','structure','salary','adjustment','loan')),action text NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 500),actor_id text NOT NULL,before_json jsonb,after_json jsonb NOT NULL,source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),override_id text,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id));
ALTER TABLE hr_payroll_workspace_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_workspace_event FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_payroll_workspace_event_scope ON hr_payroll_workspace_event USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE INDEX hr_payroll_workspace_event_record ON hr_payroll_workspace_event(tenant_id,company_id,record_id,created_at,id);
CREATE TRIGGER hr_payroll_workspace_event_immutable BEFORE UPDATE OR DELETE ON hr_payroll_workspace_event FOR EACH ROW EXECUTE FUNCTION reject_payroll_snapshot_mutation();
CREATE FUNCTION protect_governed_payroll_terms() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF TG_OP='DELETE' THEN IF OLD.workflow_managed THEN RAISE EXCEPTION 'Governed payroll records cannot be deleted'; END IF; RETURN OLD; END IF;
IF OLD.workflow_managed THEN
 IF NEW.workflow_managed IS DISTINCT FROM true OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Payroll version must advance exactly once'; END IF;
 IF (to_jsonb(NEW)-ARRAY['version','status','state','updated_at','submitted_by','submitted_at','approved_by','approved_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','status','state','updated_at','submitted_by','submitted_at','approved_by','approved_at']) THEN RAISE EXCEPTION 'Payroll terms are immutable; create a successor'; END IF;
 IF TG_TABLE_NAME IN('hr_salary_assignment','hr_payroll_adjustment','hr_employee_loan') THEN
  IF NOT ((OLD.state='draft' AND NEW.state IN('submitted','cancelled')) OR (OLD.state='submitted' AND NEW.state IN('approved','rejected','cancelled'))) THEN RAISE EXCEPTION 'Invalid governed payroll lifecycle transition'; END IF;
  IF NEW.state='approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.submitted_by IS NULL) THEN RAISE EXCEPTION 'Approval evidence is required'; END IF;
 END IF;
END IF; RETURN NEW; END $$;
DO $$ DECLARE tbl text; BEGIN
FOREACH tbl IN ARRAY ARRAY['hr_pay_component','hr_salary_structure','hr_salary_assignment','hr_payroll_adjustment','hr_employee_loan'] LOOP
EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_governed_payroll_terms()',tbl||'_workspace_guard',tbl);
END LOOP; END $$;
CREATE FUNCTION protect_governed_structure_item() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE sid text; tid text; BEGIN
sid:=COALESCE(NEW.structure_id,OLD.structure_id);tid:=COALESCE(NEW.tenant_id,OLD.tenant_id);
IF EXISTS(SELECT 1 FROM hr_salary_structure s WHERE s.tenant_id=tid AND s.id=sid AND s.workflow_managed) AND (TG_OP<>'INSERT' OR EXISTS(SELECT 1 FROM hr_payroll_workspace_event e WHERE e.tenant_id=tid AND e.record_id=sid)) THEN RAISE EXCEPTION 'Governed structure items are immutable'; END IF;
RETURN COALESCE(NEW,OLD); END $$;
CREATE TRIGGER hr_salary_structure_item_workspace_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_salary_structure_item FOR EACH ROW EXECUTE FUNCTION protect_governed_structure_item();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',54,'payroll_configuration_workspace');
