ALTER TABLE hr_ot_monetary_policy_version ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false,ADD COLUMN workflow_version integer NOT NULL DEFAULT 1 CHECK(workflow_version>0),ADD COLUMN currency_code text,ADD FOREIGN KEY(tenant_id,currency_code) REFERENCES currency(tenant_id,code),ADD CHECK(NOT workflow_managed OR currency_code IS NOT NULL);
ALTER TABLE hr_employee_ot_arrangement ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false,ADD COLUMN workflow_version integer NOT NULL DEFAULT 1 CHECK(workflow_version>0);
ALTER TABLE hr_payroll_workspace_event DROP CONSTRAINT hr_payroll_workspace_event_record_type_check;
ALTER TABLE hr_payroll_workspace_event ADD CONSTRAINT hr_payroll_workspace_event_record_type_check CHECK(record_type IN('component','structure','salary','adjustment','loan','run','policy','ot_policy','ot_arrangement'));
CREATE FUNCTION protect_hr_managed_ot_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_state text;new_state text;ignored text[];
BEGIN
 IF NOT OLD.workflow_managed THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Governed monetary overtime authority cannot be deleted'; END IF;
 old_state=COALESCE(to_jsonb(OLD)->>'state',to_jsonb(OLD)->>'status');new_state=COALESCE(to_jsonb(NEW)->>'state',to_jsonb(NEW)->>'status');
 ignored=ARRAY['state','status','workflow_version','submitted_by','submitted_at','approved_by','approved_at','released_by','released_at','evidence_hash'];
 IF NEW.workflow_version<>OLD.workflow_version+1 OR (to_jsonb(NEW)-ignored) IS DISTINCT FROM (to_jsonb(OLD)-ignored) THEN RAISE EXCEPTION 'Governed monetary overtime terms and version are protected'; END IF;
 IF NOT ((old_state='draft' AND new_state='submitted') OR (old_state='submitted' AND new_state IN('approved','rejected')) OR (TG_TABLE_NAME='hr_ot_monetary_policy_version' AND old_state='approved' AND new_state='released')) THEN RAISE EXCEPTION 'Invalid governed monetary overtime transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_managed_ot_policy_lifecycle BEFORE UPDATE OR DELETE ON hr_ot_monetary_policy_version FOR EACH ROW EXECUTE FUNCTION protect_hr_managed_ot_lifecycle();
CREATE TRIGGER hr_managed_ot_arrangement_lifecycle BEFORE UPDATE OR DELETE ON hr_employee_ot_arrangement FOR EACH ROW EXECUTE FUNCTION protect_hr_managed_ot_lifecycle();
CREATE FUNCTION protect_hr_managed_ot_children() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE blocked boolean;
BEGIN
 IF TG_TABLE_NAME='hr_ot_monetary_policy_option' THEN
  SELECT bool_or(workflow_managed AND status<>'draft') INTO blocked FROM (SELECT workflow_managed,status FROM hr_ot_monetary_policy_version WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id) AND id=ANY(ARRAY[NEW.policy_version_id,OLD.policy_version_id]) FOR SHARE) locked;
 ELSIF TG_TABLE_NAME='hr_ot_monetary_option_component' THEN
  SELECT bool_or(workflow_managed AND status<>'draft') INTO blocked FROM (SELECT v.workflow_managed,v.status FROM hr_ot_monetary_policy_version v JOIN hr_ot_monetary_policy_option o ON o.tenant_id=v.tenant_id AND o.policy_version_id=v.id WHERE o.tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id) AND o.id=ANY(ARRAY[NEW.option_id,OLD.option_id]) FOR SHARE OF v,o) locked;
 ELSE
  SELECT bool_or(workflow_managed AND state<>'draft') INTO blocked FROM (SELECT workflow_managed,state FROM hr_employee_ot_arrangement WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id) AND id=ANY(ARRAY[NEW.arrangement_id,OLD.arrangement_id]) FOR SHARE) locked;
 END IF;
 IF blocked THEN RAISE EXCEPTION 'Submitted governed monetary overtime terms cannot change'; END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER hr_managed_ot_option_children BEFORE INSERT OR UPDATE OR DELETE ON hr_ot_monetary_policy_option FOR EACH ROW EXECUTE FUNCTION protect_hr_managed_ot_children();
CREATE TRIGGER hr_managed_ot_allowed_children BEFORE INSERT OR UPDATE OR DELETE ON hr_ot_monetary_option_component FOR EACH ROW EXECUTE FUNCTION protect_hr_managed_ot_children();
CREATE TRIGGER hr_managed_ot_selected_children BEFORE INSERT OR UPDATE OR DELETE ON hr_employee_ot_arrangement_component FOR EACH ROW EXECUTE FUNCTION protect_hr_managed_ot_children();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',62,'governed_monetary_overtime_setup');
