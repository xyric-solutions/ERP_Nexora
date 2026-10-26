CREATE OR REPLACE FUNCTION guard_hr_settled_salary_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:payroll:'||NEW.tenant_id||':'||NEW.company_id,0));
 IF NEW.state IN('submitted','approved','effective') AND(TG_OP='INSERT' OR OLD.state IS DISTINCT FROM NEW.state OR OLD.effective_from IS DISTINCT FROM NEW.effective_from OR OLD.effective_to IS DISTINCT FROM NEW.effective_to) AND EXISTS(
 SELECT 1 FROM hr_lifecycle_case c JOIN hr_lifecycle_case x ON x.tenant_id=c.tenant_id AND x.id=c.parent_id JOIN hr_settlement_benefit_source s ON s.tenant_id=c.tenant_id AND s.case_id=c.id
 WHERE c.tenant_id=NEW.tenant_id AND c.company_id=NEW.company_id AND c.employee_id=NEW.employee_id AND c.kind='settlement' AND c.state='approved' AND s.snapshot->'rule'->'terms' ? 'salary_basis' AND (x.terms->>'last_working_date')::date>=NEW.effective_from AND(NEW.effective_to IS NULL OR (x.terms->>'last_working_date')::date<=NEW.effective_to) AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.terms->'lines') l WHERE l->>'benefit_source_id'=s.id))
 THEN RAISE EXCEPTION 'Independently correct the approved salary-based settlement before submitting or approving a salary change covering its exit date' USING ERRCODE='23514',CONSTRAINT='hr_settled_salary_change';END IF;
 RETURN NEW;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',98,'settled_salary_correction_guidance');
