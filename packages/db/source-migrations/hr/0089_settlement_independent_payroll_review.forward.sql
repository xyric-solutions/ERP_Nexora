-- Approved-case updated_by identifies the decision officer, not the original author.
-- Retain independent Payroll approval while allowing that independent officer to review.
CREATE OR REPLACE FUNCTION guard_hr_settlement_adjustment_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='approved' AND OLD.state IS DISTINCT FROM NEW.state AND EXISTS(
 SELECT 1 FROM hr_settlement_payroll_link l JOIN hr_lifecycle_case c ON c.tenant_id=l.tenant_id AND c.id=l.case_id
 WHERE l.tenant_id=NEW.tenant_id AND l.adjustment_id=NEW.id AND (NEW.approved_by IN(c.created_by,c.submitted_by,l.created_by) OR EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=c.tenant_id AND b.employee_id=c.employee_id AND b.user_id=NEW.approved_by AND b.ended_at IS NULL)))
 THEN RAISE EXCEPTION 'Settlement authors and employee cannot approve derived Payroll inputs';END IF;
 RETURN NEW;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',89,'settlement_independent_payroll_review');
