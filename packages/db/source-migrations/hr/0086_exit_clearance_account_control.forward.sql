CREATE FUNCTION validate_exit_clearance_account_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='clearance' AND NEW.state IN('submitted','approved') AND EXISTS(SELECT 1 FROM employee_user_binding b JOIN security_user_account u ON u.tenant_id=b.tenant_id AND u.id=b.user_id AND u.status='active' AND u.archived_at IS NULL WHERE b.tenant_id=NEW.tenant_id AND b.employee_id=NEW.employee_id AND b.ended_at IS NULL AND b.effective_from<=current_date AND(b.effective_to IS NULL OR b.effective_to>=current_date)) THEN RAISE EXCEPTION 'Deactivate the linked departing employee account through Security before clearance';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER exit_clearance_account_control BEFORE INSERT OR UPDATE ON hr_lifecycle_case FOR EACH ROW EXECUTE FUNCTION validate_exit_clearance_account_control();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',86,'exit_clearance_account_control');
