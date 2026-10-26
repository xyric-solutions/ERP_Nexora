CREATE FUNCTION validate_hr_loan_recovery_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='consumed' AND NOT EXISTS(
  SELECT 1 FROM hr_payroll_result r JOIN hr_payroll_period p ON p.tenant_id=r.tenant_id AND p.id=r.period_id
   JOIN hr_employee_loan l ON l.tenant_id=NEW.tenant_id AND l.id=NEW.loan_id
  WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.consumed_result_id AND r.company_id=l.company_id AND r.employee_id=l.employee_id AND p.month=NEW.due_month AND p.state='approved' AND p.run_number=r.run_number
 ) THEN RAISE EXCEPTION 'Loan consumption and current Payroll approval must commit atomically'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_loan_recovery_commit AFTER INSERT OR UPDATE ON hr_loan_instalment DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_loan_recovery_commit();
CREATE FUNCTION validate_hr_loan_disbursement_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM hr_employee_loan WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.loan_id AND state IN('active','settled')) THEN RAISE EXCEPTION 'Disbursement evidence and loan activation must commit atomically'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_loan_disbursement_commit AFTER INSERT ON hr_loan_disbursement DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_loan_disbursement_commit();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',66,'loan_recovery_commit_guards');
