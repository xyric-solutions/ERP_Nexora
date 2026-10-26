ALTER TABLE hr_payroll_policy ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false,ADD COLUMN rounding_mode text NOT NULL DEFAULT 'half_up' CHECK(rounding_mode IN('half_up','half_even','down','up'));
ALTER TABLE hr_payroll_period ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false,ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),ADD COLUMN calculated_by text,ADD COLUMN submitted_by text,ADD COLUMN submitted_at timestamptz,ADD COLUMN review_hash text CHECK(review_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE hr_payroll_workspace_event DROP CONSTRAINT hr_payroll_workspace_event_record_type_check;
ALTER TABLE hr_payroll_workspace_event ADD CONSTRAINT hr_payroll_workspace_event_record_type_check CHECK(record_type IN('component','structure','salary','adjustment','loan','run','policy'));
CREATE FUNCTION protect_governed_payroll_policy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF OLD.workflow_managed THEN RAISE EXCEPTION 'Governed Payroll policy is immutable; create a new governed policy version'; END IF; RETURN COALESCE(NEW,OLD); END $$;
CREATE TRIGGER hr_payroll_policy_governed_immutable BEFORE UPDATE OR DELETE ON hr_payroll_policy FOR EACH ROW EXECUTE FUNCTION protect_governed_payroll_policy();
CREATE FUNCTION protect_governed_payroll_period() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF TG_OP='DELETE' THEN IF OLD.workflow_managed THEN RAISE EXCEPTION 'Governed Payroll periods cannot be deleted'; END IF; RETURN OLD; END IF;
IF OLD.workflow_managed THEN
 IF NEW.version<>OLD.version+1 OR ROW(NEW.id,NEW.tenant_id,NEW.company_id,NEW.attendance_period_id,NEW.policy_id,NEW.month,NEW.created_by,NEW.created_at,NEW.workflow_managed) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.company_id,OLD.attendance_period_id,OLD.policy_id,OLD.month,OLD.created_by,OLD.created_at,OLD.workflow_managed) THEN RAISE EXCEPTION 'Payroll identity or version is protected'; END IF;
 IF NOT ((OLD.state IN('open','calculated') AND NEW.state='calculated' AND NEW.run_number=OLD.run_number+1) OR (OLD.state='calculated' AND NEW.state='under_review' AND NEW.run_number=OLD.run_number) OR (OLD.state='under_review' AND NEW.state IN('calculated','approved') AND NEW.run_number=OLD.run_number)) THEN RAISE EXCEPTION 'Unsupported Payroll lifecycle transition'; END IF;
 IF NEW.state='calculated' AND NEW.run_number>OLD.run_number AND (NEW.calculated_by IS NULL OR NEW.review_hash IS NULL) THEN RAISE EXCEPTION 'Calculation evidence is required'; END IF;
 IF NEW.state='under_review' AND (NEW.submitted_by IS NULL OR NEW.submitted_at IS NULL) THEN RAISE EXCEPTION 'Review submission evidence is required'; END IF;
 IF NEW.state='approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.review_hash IS NULL) THEN RAISE EXCEPTION 'Payroll approval evidence is required'; END IF;
END IF; RETURN NEW; END $$;
CREATE TRIGGER hr_payroll_period_governed_guard BEFORE UPDATE OR DELETE ON hr_payroll_period FOR EACH ROW EXECUTE FUNCTION protect_governed_payroll_period();
ALTER TABLE hr_payroll_result ADD COLUMN execution_evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(execution_evidence)='object');
CREATE INDEX hr_payroll_current_run ON hr_payroll_result(tenant_id,company_id,period_id,run_number,employee_id);
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',57,'governed_payroll_runs');
