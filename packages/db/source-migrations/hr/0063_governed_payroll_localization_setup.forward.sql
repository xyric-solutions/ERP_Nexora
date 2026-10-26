CREATE TABLE hr_payroll_localization_request(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,
 kind text NOT NULL CHECK(kind IN('legal_profile','payroll_configuration','work_location','activation','declaration','parameter')),
 terms jsonb NOT NULL CHECK(jsonb_typeof(terms)='object' AND terms->>'kind'=kind),source_reference text NOT NULL CHECK(length(btrim(source_reference)) BETWEEN 5 AND 500),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','submitted','approved','rejected')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),submitted_by text,submitted_at timestamptz,decided_by text,decided_at timestamptz,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 CHECK(state='draft' OR (submitted_by IS NOT NULL AND submitted_at IS NOT NULL)),CHECK(state NOT IN('approved','rejected') OR(decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX hr_payroll_localization_request_directory ON hr_payroll_localization_request(tenant_id,company_id,kind,created_at DESC,id);
ALTER TABLE hr_payroll_localization_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_localization_request FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_payroll_localization_request_tenant ON hr_payroll_localization_request USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE FUNCTION protect_hr_localization_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Governed statutory setup history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','version','submitted_by','submitted_at','decided_by','decided_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','submitted_by','submitted_at','decided_by','decided_at']) OR NEW.version<>OLD.version+1 OR NOT((OLD.state='draft' AND NEW.state='submitted') OR(OLD.state='submitted' AND NEW.state IN('approved','rejected'))) THEN RAISE EXCEPTION 'Invalid statutory setup transition or altered terms'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_localization_request_immutable BEFORE UPDATE OR DELETE ON hr_payroll_localization_request FOR EACH ROW EXECUTE FUNCTION protect_hr_localization_request();
CREATE FUNCTION protect_hr_materialized_localization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM hr_payroll_localization_request r WHERE r.tenant_id=OLD.tenant_id AND r.company_id=OLD.company_id AND r.id=OLD.id AND r.state='approved') THEN RAISE EXCEPTION 'Governed approved statutory setup is immutable; use a reviewed successor'; END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER hr_legal_setup_immutable BEFORE UPDATE OR DELETE ON company_legal_profile FOR EACH ROW EXECUTE FUNCTION protect_hr_materialized_localization();
CREATE TRIGGER hr_currency_setup_immutable BEFORE UPDATE OR DELETE ON company_payroll_configuration FOR EACH ROW EXECUTE FUNCTION protect_hr_materialized_localization();
CREATE TRIGGER hr_location_setup_immutable BEFORE UPDATE OR DELETE ON hr_work_location_profile FOR EACH ROW EXECUTE FUNCTION protect_hr_materialized_localization();
CREATE TRIGGER hr_activation_setup_immutable BEFORE UPDATE OR DELETE ON company_localization_activation FOR EACH ROW EXECUTE FUNCTION protect_hr_materialized_localization();
ALTER TABLE hr_payroll_workspace_event DROP CONSTRAINT hr_payroll_workspace_event_record_type_check;
ALTER TABLE hr_payroll_workspace_event ADD CONSTRAINT hr_payroll_workspace_event_record_type_check CHECK(record_type IN('component','structure','salary','adjustment','loan','run','policy','ot_policy','ot_arrangement','localization'));
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',63,'governed_payroll_localization_setup');
