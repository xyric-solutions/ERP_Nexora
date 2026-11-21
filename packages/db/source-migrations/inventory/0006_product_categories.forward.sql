CREATE TABLE inventory_product_category(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,code text NOT NULL CHECK(code~'^CAT-[0-9]{3,}$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),status text NOT NULL CHECK(status IN('active','inactive')),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),created_by text NOT NULL,updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE UNIQUE INDEX inventory_category_name ON inventory_product_category(tenant_id,company_id,lower(regexp_replace(btrim(name),'\s+',' ','g')));
CREATE TABLE inventory_product_category_change(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,category_id text NOT NULL,record_version integer NOT NULL,
 actor_id text NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),audit_event_id text NOT NULL,
 idempotency_key text NOT NULL,request_sha256 text NOT NULL,snapshot jsonb NOT NULL,result jsonb NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,category_id,record_version),UNIQUE(tenant_id,actor_id,idempotency_key),
 FOREIGN KEY(tenant_id,company_id,category_id) REFERENCES inventory_product_category(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
CREATE FUNCTION guard_product_category() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retain categories; deactivate instead';END IF;
 IF TG_OP='INSERT' THEN IF NEW.row_version<>1 THEN RAISE EXCEPTION 'Initial category version required';END IF;
 ELSIF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.created_by,NEW.created_at) IS DISTINCT FROM(OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.created_by,OLD.created_at) OR NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'Immutable category identity/version';END IF;
 RETURN NEW;END $$;
CREATE FUNCTION require_product_category_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM inventory_product_category_change e JOIN platform_admin_audit_event a ON(a.tenant_id,a.id)=(e.tenant_id,e.audit_event_id)
 WHERE(e.tenant_id,e.company_id,e.category_id,e.record_version,e.actor_id)=(NEW.tenant_id,NEW.company_id,NEW.id,NEW.row_version,NEW.updated_by) AND e.snapshot=to_jsonb(NEW) AND a.entity_id=NEW.id AND a.actor_id=e.actor_id AND a.action='inventory.category.save') THEN RAISE EXCEPTION 'Category audit evidence required';END IF;RETURN NULL;END $$;
CREATE TRIGGER category_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_product_category FOR EACH ROW EXECUTE FUNCTION guard_product_category();
CREATE CONSTRAINT TRIGGER category_evidence AFTER INSERT OR UPDATE ON inventory_product_category DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_product_category_evidence();
CREATE TRIGGER category_change_immutable BEFORE UPDATE OR DELETE ON inventory_product_category_change FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();
ALTER TABLE inventory_product ADD COLUMN category_id text;
ALTER TABLE inventory_product ADD FOREIGN KEY(tenant_id,company_id,category_id) REFERENCES inventory_product_category(tenant_id,company_id,id);
CREATE INDEX inventory_product_category_reference ON inventory_product(tenant_id,company_id,category_id);
CREATE FUNCTION validate_product_category() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.category_id IS NULL THEN RAISE EXCEPTION 'Select a product category';END IF;
 ELSIF NEW.category_id IS NOT DISTINCT FROM OLD.category_id THEN
  IF NEW.category_id IS NULL AND NEW.category IS DISTINCT FROM OLD.category THEN RAISE EXCEPTION 'Link a managed category before changing legacy category text';END IF;
  RETURN NEW;
 END IF;
 IF NEW.category_id IS NULL OR NOT EXISTS(SELECT 1 FROM inventory_product_category c WHERE(c.tenant_id,c.company_id,c.id)=(NEW.tenant_id,NEW.company_id,NEW.category_id) AND c.status='active') THEN RAISE EXCEPTION 'Choose an active category from this company';END IF;
 RETURN NEW;END $$;
CREATE TRIGGER product_category_reference BEFORE INSERT OR UPDATE ON inventory_product FOR EACH ROW EXECUTE FUNCTION validate_product_category();
DO $$ DECLARE relation text;BEGIN FOREACH relation IN ARRAY ARRAY['inventory_product_category','inventory_product_category_change'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
 EXECUTE format('CREATE POLICY tenant_isolation ON %1$I USING(tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS(SELECT 1 FROM security_user_company_access x WHERE x.tenant_id=%1$I.tenant_id AND x.user_id=current_setting(''nexora.user_id'',true) AND x.company_id=%1$I.company_id AND x.revoked_at IS NULL)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS(SELECT 1 FROM security_user_company_access x WHERE x.tenant_id=%1$I.tenant_id AND x.user_id=current_setting(''nexora.user_id'',true) AND x.company_id=%1$I.company_id AND x.revoked_at IS NULL))',relation);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',relation);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexora_app') THEN EXECUTE format('GRANT SELECT,INSERT ON %I TO nexora_app',relation);END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexora_app') THEN GRANT UPDATE ON inventory_product_category TO nexora_app;END IF;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('inventory',6,'product_categories');
