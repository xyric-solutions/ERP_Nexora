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

 IF TG_TABLE_NAME='hr_payroll_adjustment' AND OLD.state='approved' AND NEW.state='consumed' THEN
  IF NEW.version<>OLD.version+1 OR NEW.consumed_result_id IS NULL OR (to_jsonb(NEW)-ARRAY['version','state','consumed_result_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','state','consumed_result_id']) OR NOT EXISTS(
   SELECT 1 FROM hr_payroll_result r JOIN hr_payroll_period p ON p.tenant_id=r.tenant_id AND p.id=r.period_id
    WHERE r.tenant_id=OLD.tenant_id AND r.id=NEW.consumed_result_id AND r.company_id=OLD.company_id AND r.employee_id=OLD.employee_id AND p.month=OLD.effective_month AND p.state IN('under_review','approved') AND p.run_number=r.run_number
     AND r.execution_evidence->'adjustments' @> jsonb_build_array(jsonb_build_object('id',OLD.id,'amount',OLD.amount::text,'version',OLD.version))
  ) THEN RAISE EXCEPTION 'Adjustment consumption requires its reviewed current Payroll result'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='hr_payroll_adjustment' AND OLD.state='consumed' THEN RAISE EXCEPTION 'Consumed Payroll adjustments are immutable'; END IF;
 IF OLD.workflow_managed THEN
  IF NEW.workflow_managed IS DISTINCT FROM true OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Payroll version must advance exactly once'; END IF;
  IF (to_jsonb(NEW)-ARRAY['version','status','state','updated_at','submitted_by','submitted_at','approved_by','approved_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','status','state','updated_at','submitted_by','submitted_at','approved_by','approved_at']) THEN RAISE EXCEPTION 'Payroll terms are immutable; create a successor'; END IF;
  IF TG_TABLE_NAME IN('hr_salary_assignment','hr_payroll_adjustment','hr_employee_loan') THEN
   IF NOT ((OLD.state='draft' AND NEW.state IN('submitted','cancelled')) OR (OLD.state='submitted' AND NEW.state IN('approved','rejected','cancelled'))) THEN RAISE EXCEPTION 'Invalid governed payroll lifecycle transition'; END IF;
   IF NEW.state='approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.submitted_by IS NULL) THEN RAISE EXCEPTION 'Approval evidence is required'; END IF;
  END IF;
 END IF; RETURN NEW;
END $$;


CREATE FUNCTION validate_hr_payroll_adjustment_consumption() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.state='consumed' AND NOT EXISTS(SELECT 1 FROM hr_payroll_result r JOIN hr_payroll_period p ON p.tenant_id=r.tenant_id AND p.id=r.period_id WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.consumed_result_id AND r.company_id=NEW.company_id AND r.employee_id=NEW.employee_id AND p.month=NEW.effective_month AND p.run_number=r.run_number AND p.state='approved') THEN RAISE EXCEPTION 'Adjustment consumption and current Payroll approval must commit together'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_payroll_adjustment_consumption_commit AFTER INSERT OR UPDATE ON hr_payroll_adjustment DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_payroll_adjustment_consumption();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',58,'payroll_adjustment_consumption');
