-- Company-scoped product master. Opening stock is an unposted plan, never a ledger balance.
CREATE TABLE inventory_product (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, code text NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 type text NOT NULL CHECK(type IN ('goods','service')), status text NOT NULL CHECK(status IN ('active','inactive')),
 category text NOT NULL DEFAULT '', reference text NOT NULL DEFAULT '', barcode text NOT NULL DEFAULT '',
 currency text NOT NULL, preferred_supplier_id text, stock_account_id text, income_account_id text, expense_account_id text,
 details jsonb NOT NULL CHECK(jsonb_typeof(details)='object'),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,currency) REFERENCES currency(tenant_id,code),
 FOREIGN KEY(tenant_id,company_id,preferred_supplier_id) REFERENCES procurement_supplier(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,stock_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,income_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,expense_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE UNIQUE INDEX inventory_product_barcode ON inventory_product(tenant_id,company_id,lower(barcode)) WHERE barcode<>'';
CREATE INDEX inventory_product_directory ON inventory_product(tenant_id,company_id,id);
CREATE INDEX inventory_product_filters ON inventory_product(tenant_id,company_id,type,status,category);
CREATE TABLE inventory_product_change (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, product_id text NOT NULL,
 record_version integer NOT NULL CHECK(record_version>0), actor_id text NOT NULL, action text NOT NULL CHECK(action IN ('created','saved')),
 audit_event_id text NOT NULL, idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'), snapshot jsonb NOT NULL, result jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,actor_id,idempotency_key), UNIQUE(tenant_id,product_id,record_version),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
CREATE FUNCTION guard_inventory_product() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Products must be retained; mark inactive instead' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.row_version<>1 THEN RAISE EXCEPTION 'Initial product version required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.created_by,NEW.created_at)
  IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.created_by,OLD.created_at)
  OR NEW.row_version<>OLD.row_version+1) THEN RAISE EXCEPTION 'Immutable product identity/version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION require_inventory_product_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM inventory_product_change e JOIN platform_admin_audit_event a ON a.tenant_id=e.tenant_id AND a.id=e.audit_event_id
  WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.product_id=NEW.id AND e.record_version=NEW.row_version
  AND e.actor_id=NEW.updated_by AND e.snapshot=to_jsonb(NEW) AND a.entity_id=NEW.id AND a.actor_id=e.actor_id AND a.action='inventory.product.'||e.action)
 THEN RAISE EXCEPTION 'Immutable product audit evidence required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER inventory_product_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_product FOR EACH ROW EXECUTE FUNCTION guard_inventory_product();
CREATE CONSTRAINT TRIGGER inventory_product_evidence AFTER INSERT OR UPDATE ON inventory_product DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_inventory_product_evidence();
CREATE TRIGGER inventory_product_change_immutable BEFORE UPDATE OR DELETE ON inventory_product_change FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['inventory_product','inventory_product_change'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',name);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('inventory',1,'products');
