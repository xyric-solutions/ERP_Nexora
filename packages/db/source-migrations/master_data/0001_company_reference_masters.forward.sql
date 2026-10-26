-- Shared reporting references, not HR statutory work locations or Bank facilities.
CREATE TABLE erp_project (
 tenant_id text NOT NULL,
 company_id text NOT NULL,
 id text NOT NULL CHECK(length(id) BETWEEN 1 AND 128),
 code text NOT NULL CHECK(length(code) BETWEEN 1 AND 64 AND code ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL,
 updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE erp_location (LIKE erp_project INCLUDING ALL);
ALTER TABLE erp_location
 ADD FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 ADD FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 ADD FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id);

CREATE TABLE erp_reference_master_event (
 tenant_id text NOT NULL,
 company_id text NOT NULL,
 id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('projects','locations')),
 project_id text,
 location_id text,
 record_version bigint NOT NULL CHECK(record_version>0),
 action text NOT NULL CHECK(action IN ('created','updated','status_changed')),
 actor_id text NOT NULL,
 audit_event_id text NOT NULL,
 idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,actor_id,idempotency_key),
 UNIQUE(tenant_id,audit_event_id),
 CHECK((kind='projects' AND project_id IS NOT NULL AND location_id IS NULL)
    OR (kind='locations' AND location_id IS NOT NULL AND project_id IS NULL)),
 FOREIGN KEY(tenant_id,company_id,project_id) REFERENCES erp_project(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,location_id) REFERENCES erp_location(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
CREATE UNIQUE INDEX erp_reference_master_version ON erp_reference_master_event
 (tenant_id,kind,COALESCE(project_id,location_id),record_version);
CREATE INDEX erp_reference_master_history ON erp_reference_master_event
 (tenant_id,company_id,kind,occurred_at,id);

CREATE FUNCTION guard_erp_reference_master() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reference masters cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.row_version<>1 THEN
  RAISE EXCEPTION 'Reference master must start at version one' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND ((NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.created_by,NEW.created_at)
   IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.created_by,OLD.created_at)
   OR NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<OLD.updated_at) THEN
  RAISE EXCEPTION 'Reference identity is immutable and updates require a new version' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM organization_unit WHERE tenant_id=NEW.tenant_id AND id=NEW.company_id
   AND type='company' AND status='active') THEN
  RAISE EXCEPTION 'Active company required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION require_erp_reference_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reference_kind text := CASE TG_TABLE_NAME WHEN 'erp_project' THEN 'projects' ELSE 'locations' END;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM erp_reference_master_event e
   JOIN platform_admin_audit_event a ON a.tenant_id=e.tenant_id AND a.id=e.audit_event_id
   WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.kind=reference_kind
   AND COALESCE(e.project_id,e.location_id)=NEW.id AND e.record_version=NEW.row_version
   AND e.actor_id=NEW.updated_by AND a.actor_id=e.actor_id AND a.entity_id=NEW.id
   AND a.entity_type=TG_TABLE_NAME AND a.action='master_data.'||reference_kind||'.'||e.action
   AND e.result->>'audit_event_id'=e.audit_event_id
   AND e.result->'record'->>'id'=NEW.id AND e.result->'record'->>'company_id'=NEW.company_id
   AND (e.result->'record'->>'version')::bigint=NEW.row_version
   AND e.result->'record'->>'code'=NEW.code AND e.result->'record'->>'name'=NEW.name
   AND e.result->'record'->>'status'=NEW.status
   AND ((NEW.row_version=1 AND e.action='created') OR (NEW.row_version>1 AND e.action<>'created'))) THEN
  RAISE EXCEPTION 'Matching immutable reference change/audit evidence required' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER erp_reference_event_immutable BEFORE UPDATE OR DELETE ON erp_reference_master_event
 FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['erp_project','erp_location'] LOOP
  EXECUTE format('CREATE UNIQUE INDEX %I ON %I(tenant_id,company_id,lower(code))',table_name||'_code',table_name);
  EXECUTE format('CREATE INDEX %I ON %I(tenant_id,company_id,status,lower(code),id)',table_name||'_directory',table_name);
  EXECUTE format('CREATE TRIGGER reference_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_erp_reference_master()',table_name);
  EXECUTE format('CREATE CONSTRAINT TRIGGER reference_evidence AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_erp_reference_evidence()',table_name);
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['erp_project','erp_location','erp_reference_master_event'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',table_name);
 END LOOP;
END $$;
INSERT INTO security_permission_definition(permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity) VALUES
 ('master_data.project.read','master_data','project','read','Read company reporting project references.','password',false,false,'sensitive'),
 ('master_data.project.manage','master_data','project','manage','Maintain company reporting project references.','password',false,true,'restricted'),
 ('master_data.location.read','master_data','location','read','Read company reporting location references.','password',false,false,'sensitive'),
 ('master_data.location.manage','master_data','location','manage','Maintain company reporting location references.','password',false,true,'restricted');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('master_data',1,'company_reference_masters');
