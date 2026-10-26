-- Additional guard preserves all inherited Payroll/Finance/Banking period transitions.
CREATE FUNCTION guard_payroll_jurisdiction_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.workflow_managed AND NEW.state IN('under_review','approved') AND NEW.state IS DISTINCT FROM OLD.state AND EXISTS(
  SELECT 1 FROM hr_payroll_localization_request r WHERE r.tenant_id=OLD.tenant_id AND r.company_id=OLD.company_id AND r.kind IN('jurisdiction_override','jurisdiction_override_revocation') AND(r.terms->>'effective_from')::date<(OLD.month+interval '1 month')::date AND(coalesce(r.terms->>'effective_to','infinity'))::date>=OLD.month AND(r.state IN('draft','submitted') OR(r.state='approved' AND r.decided_at>OLD.calculated_at))
 ) THEN RAISE EXCEPTION 'Resolve employee jurisdiction setup and recalculate Payroll before submission or approval';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_payroll_jurisdiction_submission BEFORE UPDATE ON hr_payroll_period FOR EACH ROW EXECUTE FUNCTION guard_payroll_jurisdiction_submission();
INSERT INTO nexora_schema_migration(module_name,version,name)VALUES('hr',130,'payroll_jurisdiction_submission_guard');
