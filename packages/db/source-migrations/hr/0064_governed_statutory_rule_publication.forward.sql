ALTER TABLE hr_payroll_localization_request DROP CONSTRAINT hr_payroll_localization_request_kind_check;
ALTER TABLE hr_payroll_localization_request ADD CONSTRAINT hr_payroll_localization_request_kind_check CHECK(kind IN('legal_profile','payroll_configuration','work_location','activation','declaration','parameter','pack_release'));
CREATE TABLE hr_statutory_pack_publication(
 tenant_id text NOT NULL,company_id text NOT NULL,request_id text NOT NULL,artifact_hash text NOT NULL,pack_version_id text NOT NULL,publisher_name name NOT NULL DEFAULT session_user,published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,request_id),UNIQUE(pack_version_id),FOREIGN KEY(tenant_id,request_id) REFERENCES hr_payroll_localization_request(tenant_id,id),FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),FOREIGN KEY(artifact_hash) REFERENCES localization_import_release(artifact_hash),FOREIGN KEY(pack_version_id) REFERENCES localization_pack_version(id)
);
ALTER TABLE hr_statutory_pack_publication ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_statutory_pack_publication FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_statutory_pack_publication_tenant ON hr_statutory_pack_publication USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE FUNCTION guard_hr_statutory_publication() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner_role name;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Statutory publication acknowledgements are immutable'; END IF;
 SELECT pg_get_userbyid(relowner)::name INTO owner_role FROM pg_class WHERE oid=TG_RELID;
 IF session_user::name<>owner_role AND NOT public.localization_publisher_is_registered() THEN RAISE EXCEPTION 'A registered publisher is required' USING ERRCODE='42501'; END IF;
 IF NEW.publisher_name<>session_user::name OR NOT EXISTS(SELECT 1 FROM public.hr_payroll_localization_request q JOIN public.localization_import_release r ON r.artifact_hash=NEW.artifact_hash AND r.pack_version_id=NEW.pack_version_id WHERE q.tenant_id=NEW.tenant_id AND q.company_id=NEW.company_id AND q.id=NEW.request_id AND q.kind='pack_release' AND q.state='approved' AND q.created_by<>q.decided_by AND r.report_json->>'request_id'=q.id AND r.report_json->>'tenant_id'=q.tenant_id AND r.report_json->>'company_id'=q.company_id) THEN RAISE EXCEPTION 'Publication requires the matching independently approved bundle and immutable release'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_statutory_publication_immutable BEFORE INSERT OR UPDATE OR DELETE ON hr_statutory_pack_publication FOR EACH ROW EXECUTE FUNCTION guard_hr_statutory_publication();
CREATE OR REPLACE FUNCTION protect_hr_localization_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Governed statutory setup history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','version','submitted_by','submitted_at','decided_by','decided_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','submitted_by','submitted_at','decided_by','decided_at']) OR NEW.version<>OLD.version+1 OR NOT((OLD.state='draft' AND NEW.state='submitted') OR(OLD.state='submitted' AND NEW.state IN('approved','rejected'))) THEN RAISE EXCEPTION 'Invalid statutory setup transition or altered terms'; END IF;
 IF OLD.state='submitted' AND(NEW.submitted_by IS DISTINCT FROM OLD.submitted_by OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at) THEN RAISE EXCEPTION 'Submitted statutory review identity is immutable'; END IF;
 IF NEW.submitted_by IS DISTINCT FROM NEW.created_by THEN RAISE EXCEPTION 'The statutory maker must submit the request'; END IF;
 IF NEW.kind='pack_release' AND NEW.state IN('approved','rejected') AND NEW.decided_by=NEW.created_by THEN RAISE EXCEPTION 'Rule publication requires independent review'; END IF;
 RETURN NEW;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',64,'governed_statutory_rule_publication');
