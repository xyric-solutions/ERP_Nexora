-- Validate events independently as well as requiring events for each master write.
-- This also rejects fabricated history inserts without a corresponding mutation.
CREATE FUNCTION guard_erp_reference_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reference_row record; reference_id text; reference_table text;
BEGIN
 reference_id:=COALESCE(NEW.project_id,NEW.location_id);
 reference_table:=CASE NEW.kind WHEN 'projects' THEN 'erp_project' ELSE 'erp_location' END;
 EXECUTE format('SELECT company_id,code,name,status,row_version,created_by,updated_by FROM %I WHERE tenant_id=$1 AND id=$2',reference_table)
  INTO reference_row USING NEW.tenant_id,reference_id;
 IF reference_row.company_id IS DISTINCT FROM NEW.company_id
  OR reference_row.row_version IS DISTINCT FROM NEW.record_version
  OR reference_row.updated_by IS DISTINCT FROM NEW.actor_id
  OR NEW.result->>'audit_event_id' IS DISTINCT FROM NEW.audit_event_id
  OR NEW.result->'record'->>'id' IS DISTINCT FROM reference_id
  OR NEW.result->'record'->>'company_id' IS DISTINCT FROM NEW.company_id
  OR NEW.result->'record'->>'code' IS DISTINCT FROM reference_row.code
  OR NEW.result->'record'->>'name' IS DISTINCT FROM reference_row.name
  OR NEW.result->'record'->>'status' IS DISTINCT FROM reference_row.status
  OR (NEW.result->'record'->>'version')::bigint IS DISTINCT FROM NEW.record_version
  OR NEW.result->'record'->>'created_by' IS DISTINCT FROM reference_row.created_by
  OR NEW.result->'record'->>'updated_by' IS DISTINCT FROM NEW.actor_id
  OR (NEW.record_version=1 AND NEW.action<>'created')
  OR (NEW.record_version>1 AND NEW.action='created')
  OR NOT EXISTS(SELECT 1 FROM platform_admin_audit_event a WHERE a.tenant_id=NEW.tenant_id
   AND a.id=NEW.audit_event_id AND a.actor_id=NEW.actor_id AND a.entity_id=reference_id
   AND a.entity_type=reference_table AND a.action='master_data.'||NEW.kind||'.'||NEW.action) THEN
  RAISE EXCEPTION 'Reference history must match the changed master and audit actor/action' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reference_event_binding BEFORE INSERT ON erp_reference_master_event
 FOR EACH ROW EXECUTE FUNCTION guard_erp_reference_event();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('master_data',2,'reference_event_binding');
