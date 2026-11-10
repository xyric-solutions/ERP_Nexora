-- Warehouse masters and unposted transfer requests. This migration grants no posting authority.
CREATE TABLE inventory_warehouse (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,code text NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),location_id text,
 address text NOT NULL DEFAULT '',contact_name text NOT NULL DEFAULT '',phone text NOT NULL DEFAULT '',email text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL,updated_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,location_id) REFERENCES erp_location(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
ALTER TABLE inventory_product ADD COLUMN location_id text,ADD COLUMN default_warehouse_id text,
 ADD FOREIGN KEY(tenant_id,company_id,location_id) REFERENCES erp_location(tenant_id,company_id,id),
 ADD FOREIGN KEY(tenant_id,company_id,default_warehouse_id) REFERENCES inventory_warehouse(tenant_id,company_id,id);
CREATE TABLE inventory_transfer (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,code text NOT NULL,
 from_warehouse_id text NOT NULL,to_warehouse_id text NOT NULL,CHECK(from_warehouse_id<>to_warehouse_id),
 transfer_date date NOT NULL,reference text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',
 state text NOT NULL DEFAULT 'draft' CHECK(state='draft'),row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL,updated_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,from_warehouse_id) REFERENCES inventory_warehouse(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,to_warehouse_id) REFERENCES inventory_warehouse(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE inventory_transfer_line (
 tenant_id text NOT NULL,company_id text NOT NULL,transfer_id text NOT NULL,line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 100),
 product_id text NOT NULL,quantity numeric(20,4) NOT NULL CHECK(quantity>0),unit text NOT NULL,
 PRIMARY KEY(tenant_id,transfer_id,line_no),UNIQUE(tenant_id,transfer_id,product_id),
 FOREIGN KEY(tenant_id,company_id,transfer_id) REFERENCES inventory_transfer(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id)
);
CREATE TABLE inventory_operation_change (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,entity_type text NOT NULL CHECK(entity_type IN ('warehouse','transfer')),entity_id text NOT NULL,
 record_version integer NOT NULL CHECK(record_version>0),actor_id text NOT NULL,action text NOT NULL CHECK(action IN ('created','saved')),
 audit_event_id text NOT NULL,idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),snapshot jsonb NOT NULL,result jsonb NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,actor_id,idempotency_key),UNIQUE(tenant_id,entity_type,entity_id,record_version),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
CREATE INDEX inventory_warehouse_directory ON inventory_warehouse(tenant_id,company_id,code);
CREATE INDEX inventory_transfer_directory ON inventory_transfer(tenant_id,company_id,code);
CREATE FUNCTION inventory_operation_snapshot(entity text,tenant text,company text,record_id text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN entity='warehouse' THEN (SELECT to_jsonb(w) FROM inventory_warehouse w WHERE w.tenant_id=tenant AND w.company_id=company AND w.id=record_id)
 ELSE (SELECT to_jsonb(t)||jsonb_build_object('line_rows',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.line_no) FROM inventory_transfer_line l WHERE l.tenant_id=tenant AND l.company_id=company AND l.transfer_id=record_id),'[]'::jsonb)) FROM inventory_transfer t WHERE t.tenant_id=tenant AND t.company_id=company AND t.id=record_id) END;
$$;
CREATE FUNCTION guard_inventory_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inventory records must be retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.row_version<>1 THEN RAISE EXCEPTION 'Initial Inventory version required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.created_by,OLD.created_at) OR NEW.row_version<>OLD.row_version+1) THEN RAISE EXCEPTION 'Immutable Inventory identity/version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION require_inventory_operation_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entity text;tenant text;company text;record_id text;v integer;actor text;
BEGIN
 IF TG_TABLE_NAME='inventory_transfer_line' THEN
  entity:='transfer';tenant:=coalesce(NEW.tenant_id,OLD.tenant_id);company:=coalesce(NEW.company_id,OLD.company_id);record_id:=coalesce(NEW.transfer_id,OLD.transfer_id);
  SELECT row_version,updated_by INTO v,actor FROM inventory_transfer WHERE tenant_id=tenant AND company_id=company AND id=record_id;
 ELSE
  entity:=CASE TG_TABLE_NAME WHEN 'inventory_warehouse' THEN 'warehouse' ELSE 'transfer' END;
  tenant:=NEW.tenant_id;company:=NEW.company_id;record_id:=NEW.id;v:=NEW.row_version;actor:=NEW.updated_by;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM inventory_operation_change e JOIN platform_admin_audit_event a ON a.tenant_id=e.tenant_id AND a.id=e.audit_event_id WHERE e.tenant_id=tenant AND e.company_id=company AND e.entity_type=entity AND e.entity_id=record_id AND e.record_version=v AND e.actor_id=actor AND e.snapshot=inventory_operation_snapshot(entity,tenant,company,record_id) AND a.entity_id=record_id AND a.actor_id=e.actor_id AND a.action='inventory.'||entity||'.'||e.action)
 THEN RAISE EXCEPTION 'Immutable Inventory audit evidence required' USING ERRCODE='23514'; END IF;
 IF entity='warehouse' AND NOT EXISTS(SELECT 1 FROM inventory_warehouse w JOIN organization_unit o ON o.tenant_id=w.tenant_id AND o.id=w.id AND o.type='warehouse' AND o.parent_id=w.company_id AND o.code=w.code AND o.name=w.name AND o.status=w.status WHERE w.tenant_id=tenant AND w.id=record_id)
 THEN RAISE EXCEPTION 'Warehouse organization identity does not match' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION protect_inventory_warehouse_organization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM inventory_warehouse w WHERE w.tenant_id=NEW.tenant_id AND w.id=NEW.id AND (NEW.type<>'warehouse' OR NEW.parent_id IS DISTINCT FROM w.company_id OR NEW.code<>w.code OR NEW.name<>w.name OR NEW.status<>w.status)) THEN RAISE EXCEPTION 'Managed warehouse changes require matching Inventory master' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER inventory_warehouse_organization AFTER UPDATE ON organization_unit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION protect_inventory_warehouse_organization();
CREATE CONSTRAINT TRIGGER inventory_transfer_lines_evidence AFTER INSERT OR UPDATE OR DELETE ON inventory_transfer_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_inventory_operation_evidence();
CREATE TRIGGER inventory_operation_change_immutable BEFORE UPDATE OR DELETE ON inventory_operation_change FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['inventory_warehouse','inventory_transfer'] LOOP
  EXECUTE format('CREATE TRIGGER inventory_operation_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_inventory_operation()',name);
  EXECUTE format('CREATE CONSTRAINT TRIGGER inventory_operation_evidence AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_inventory_operation_evidence()',name);
 END LOOP;
 FOREACH name IN ARRAY ARRAY['inventory_warehouse','inventory_transfer','inventory_transfer_line','inventory_operation_change'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',name);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('inventory',2,'warehouses_transfers');
