-- Closing a retained personal contact must clear or restore its canonical projection.
-- Inserts continue through the existing contact projection trigger.
CREATE FUNCTION refresh_closed_personal_contact_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
 IF NEW.contact_usage='personal' AND NEW.channel IN('email','phone') AND NEW.is_primary THEN
  SELECT contact_value INTO v FROM employee_contact WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.employee_id AND contact_usage='personal' AND channel=NEW.channel AND is_primary AND status='active' AND effective_from<=current_date AND(effective_to IS NULL OR effective_to>=current_date) ORDER BY effective_from DESC,created_at DESC,id DESC LIMIT 1;
  PERFORM set_config('nexora.employee_contact_projection_write','on',true);
  IF NEW.channel='email' THEN UPDATE employee SET personal_email=coalesce(v,''),updated_at=now() WHERE tenant_id=NEW.tenant_id AND id=NEW.employee_id;
  ELSE UPDATE employee SET phone=coalesce(v,''),updated_at=now() WHERE tenant_id=NEW.tenant_id AND id=NEW.employee_id;END IF;
  PERFORM set_config('nexora.employee_contact_projection_write','off',true);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employee_closed_personal_contact_projection AFTER UPDATE ON employee_contact FOR EACH ROW EXECUTE FUNCTION refresh_closed_personal_contact_projection();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',119,'personal_contact_projection_close');
