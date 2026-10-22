CREATE FUNCTION protect_hr_ot_authority_insertion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
 IF TG_TABLE_NAME='hr_ot_monetary_policy_option' THEN
  SELECT status INTO parent_status FROM hr_ot_monetary_policy_version WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.policy_version_id FOR SHARE;
 ELSIF TG_TABLE_NAME='hr_ot_monetary_option_component' THEN
  SELECT v.status INTO parent_status FROM hr_ot_monetary_policy_version v JOIN hr_ot_monetary_policy_option o ON o.tenant_id=v.tenant_id AND o.company_id=v.company_id AND o.policy_version_id=v.id WHERE o.tenant_id=NEW.tenant_id AND o.company_id=NEW.company_id AND o.id=NEW.option_id FOR SHARE OF v,o;
 ELSE
  SELECT state INTO parent_status FROM hr_employee_ot_arrangement WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.arrangement_id FOR SHARE;
 END IF;
 IF (TG_TABLE_NAME='hr_employee_ot_arrangement_component' AND parent_status IN('approved','effective','superseded')) OR (TG_TABLE_NAME<>'hr_employee_ot_arrangement_component' AND parent_status IN('released','retired')) THEN RAISE EXCEPTION 'Sealed monetary overtime authority cannot accept new children'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_ot_option_insert_seal BEFORE INSERT ON hr_ot_monetary_policy_option FOR EACH ROW EXECUTE FUNCTION protect_hr_ot_authority_insertion();
CREATE TRIGGER hr_ot_option_component_insert_seal BEFORE INSERT ON hr_ot_monetary_option_component FOR EACH ROW EXECUTE FUNCTION protect_hr_ot_authority_insertion();
CREATE TRIGGER hr_ot_arrangement_component_insert_seal BEFORE INSERT ON hr_employee_ot_arrangement_component FOR EACH ROW EXECUTE FUNCTION protect_hr_ot_authority_insertion();
CREATE FUNCTION protect_hr_ot_policy_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM hr_ot_monetary_policy_version WHERE tenant_id=OLD.tenant_id AND policy_id=OLD.id AND status IN('released','retired')) THEN RAISE EXCEPTION 'A released monetary overtime policy identity is immutable'; END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER hr_ot_policy_identity_seal BEFORE UPDATE OR DELETE ON hr_ot_monetary_policy FOR EACH ROW EXECUTE FUNCTION protect_hr_ot_policy_identity();
CREATE FUNCTION protect_hr_ot_arrangement_selection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM hr_employee_ot_arrangement WHERE tenant_id=OLD.tenant_id AND id=OLD.arrangement_id AND state IN('approved','effective','superseded')) THEN RAISE EXCEPTION 'Approved overtime arrangement selections are immutable'; END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER hr_ot_arrangement_component_update_seal BEFORE UPDATE OR DELETE ON hr_employee_ot_arrangement_component FOR EACH ROW EXECUTE FUNCTION protect_hr_ot_arrangement_selection();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',60,'monetary_overtime_authority_seal');
