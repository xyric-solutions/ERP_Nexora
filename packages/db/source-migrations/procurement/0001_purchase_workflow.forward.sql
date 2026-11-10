-- Operational purchase documents and payment instructions. No stock/GL/bank posting.
CREATE TABLE procurement_supplier (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 code text NOT NULL, name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 tax_id text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '',
 status text NOT NULL CHECK(status IN ('active','inactive')),
 risk_status text NOT NULL DEFAULT 'normal' CHECK(risk_status IN ('normal','watch','blocked')),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, updated_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,id) REFERENCES party(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE procurement_document (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('request','rfq','order','receipt','bill','payment','multi_payment')),
 code text NOT NULL, supplier_id text, source_id text,
 invited_supplier_ids jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(invited_supplier_ids)='array' AND jsonb_array_length(invited_supplier_ids)<=50),
 document_date date NOT NULL, due_date date, currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 reference text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
 lines jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines)<=100),
 allocations jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(allocations)='array' AND jsonb_array_length(allocations)<=100),
 total_amount numeric(20,2) NOT NULL CHECK(total_amount>=0),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','approved','rejected','cancelled')),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), approval_instance_id text,
 created_by text NOT NULL, updated_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 CHECK(source_id IS NULL OR source_id<>id), CHECK(due_date IS NULL OR due_date>=document_date),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,supplier_id) REFERENCES procurement_supplier(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,source_id) REFERENCES procurement_document(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,approval_instance_id) REFERENCES approval_instance(tenant_id,id)
);
CREATE TABLE procurement_change (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 entity_type text NOT NULL CHECK(entity_type IN ('supplier','document')), entity_id text NOT NULL, record_version integer NOT NULL,
 actor_id text NOT NULL, action text NOT NULL, reason text NOT NULL,
 audit_event_id text NOT NULL, approval_override_event_id text,
 idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 snapshot jsonb NOT NULL, result jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,actor_id,idempotency_key), UNIQUE(tenant_id,entity_type,entity_id,record_version),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id),
 FOREIGN KEY(tenant_id,approval_override_event_id) REFERENCES approval_override_event(tenant_id,event_id)
);
CREATE INDEX procurement_document_directory ON procurement_document(tenant_id,company_id,kind,created_at DESC,id DESC);
CREATE INDEX procurement_document_source ON procurement_document(tenant_id,company_id,source_id,state);
CREATE INDEX procurement_payment_allocations ON procurement_document USING gin(allocations jsonb_path_ops) WHERE state='approved';
CREATE INDEX procurement_supplier_directory ON procurement_supplier(tenant_id,company_id,lower(name),id);
CREATE INDEX procurement_change_history ON procurement_change(tenant_id,company_id,entity_type,entity_id,record_version);
CREATE FUNCTION guard_procurement_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Purchase records cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.row_version<>1 THEN RAISE EXCEPTION 'Initial version required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.created_by,OLD.created_at)
    OR NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'Immutable purchase identity/version' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='procurement_document' THEN
   IF NEW.kind<>OLD.kind OR OLD.state IN ('approved','cancelled') THEN RAISE EXCEPTION 'Final purchase records are immutable' USING ERRCODE='23514'; END IF;
   IF OLD.state='submitted' AND (to_jsonb(NEW)-ARRAY['state','row_version','updated_by','updated_at','approval_instance_id'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','row_version','updated_by','updated_at','approval_instance_id']) THEN
    RAISE EXCEPTION 'Submitted purchase terms are immutable' USING ERRCODE='23514';
   END IF;
   IF NOT ((OLD.state IN ('draft','rejected') AND NEW.state IN ('draft','submitted','cancelled'))
     OR (OLD.state='submitted' AND NEW.state IN ('approved','rejected','cancelled'))) THEN
    RAISE EXCEPTION 'Invalid purchase lifecycle transition' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION require_procurement_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entity text := CASE TG_TABLE_NAME WHEN 'procurement_supplier' THEN 'supplier' ELSE 'document' END;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM procurement_change e JOIN platform_admin_audit_event a ON a.tenant_id=e.tenant_id AND a.id=e.audit_event_id
  WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.entity_type=entity AND e.entity_id=NEW.id
  AND e.record_version=NEW.row_version AND e.actor_id=NEW.updated_by AND e.snapshot=to_jsonb(NEW)
  AND a.entity_id=NEW.id AND a.actor_id=e.actor_id AND a.action='procurement.'||entity||'.'||e.action) THEN
  RAISE EXCEPTION 'Immutable purchase audit evidence required' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER procurement_change_immutable BEFORE UPDATE OR DELETE ON procurement_change FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['procurement_supplier','procurement_document'] LOOP
  EXECUTE format('CREATE TRIGGER procurement_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_procurement_record()',name);
  EXECUTE format('CREATE CONSTRAINT TRIGGER procurement_evidence AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_procurement_evidence()',name);
 END LOOP;
 FOREACH name IN ARRAY ARRAY['procurement_supplier','procurement_document','procurement_change'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',name);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('procurement',1,'purchase_workflow');
