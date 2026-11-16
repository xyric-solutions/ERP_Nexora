-- Bills of Materials: one per finished product. Planning data only: no stock movement, costing or posting.
CREATE TABLE manufacturing_bom (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 code text NOT NULL CHECK(code ~ '^BOM-[0-9]{3,}$'),
 product_id text NOT NULL,
 output_quantity numeric(20,4) NOT NULL CHECK(output_quantity>0),
 unit text NOT NULL CHECK(length(btrim(unit)) BETWEEN 1 AND 40),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 -- Meeting decision (13 Nov 2026): exactly one Bill of Materials per finished product.
 UNIQUE(tenant_id,company_id,product_id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE manufacturing_bom_line (
 tenant_id text NOT NULL, company_id text NOT NULL, bom_id text NOT NULL,
 line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 200),
 product_id text NOT NULL,
 quantity numeric(20,4) NOT NULL CHECK(quantity>0),
 unit text NOT NULL CHECK(length(btrim(unit)) BETWEEN 1 AND 40),
 PRIMARY KEY(tenant_id,bom_id,line_no), UNIQUE(tenant_id,bom_id,product_id),
 FOREIGN KEY(tenant_id,company_id,bom_id) REFERENCES manufacturing_bom(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id)
);
-- One append-only evidence ledger for every Manufacturing record (BOM, plan, order).
CREATE TABLE manufacturing_change (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 entity_type text NOT NULL CHECK(entity_type IN ('bom','plan','order')), entity_id text NOT NULL,
 record_version integer NOT NULL CHECK(record_version>0), actor_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('created','saved','converted','submit','approve','return')),
 reason text NOT NULL DEFAULT '' CHECK(length(reason)<=2000),
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
CREATE INDEX manufacturing_bom_directory ON manufacturing_bom(tenant_id,company_id,code);
CREATE INDEX manufacturing_bom_line_component ON manufacturing_bom_line(tenant_id,company_id,product_id);
CREATE INDEX manufacturing_change_history ON manufacturing_change(tenant_id,company_id,entity_type,entity_id,record_version);

-- Replaced by later Manufacturing migrations as plan and order tables are added.
CREATE FUNCTION manufacturing_snapshot(entity text,tenant text,company text,record_id text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT (SELECT to_jsonb(b)||jsonb_build_object('line_rows',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.line_no) FROM manufacturing_bom_line l WHERE l.tenant_id=tenant AND l.company_id=company AND l.bom_id=record_id),'[]'::jsonb))
  FROM manufacturing_bom b WHERE entity='bom' AND b.tenant_id=tenant AND b.company_id=company AND b.id=record_id);
$$;
CREATE FUNCTION guard_manufacturing_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Manufacturing records must be retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.row_version<>1 THEN RAISE EXCEPTION 'Initial Manufacturing version required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.created_by,OLD.created_at)
    OR NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'Immutable Manufacturing identity/version' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='manufacturing_bom' AND NEW.product_id<>OLD.product_id THEN
   RAISE EXCEPTION 'A Bill of Materials keeps its finished product' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
-- A component can never be the finished product it is used to make.
CREATE FUNCTION guard_manufacturing_bom_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM manufacturing_bom b WHERE b.tenant_id=NEW.tenant_id AND b.company_id=NEW.company_id AND b.id=NEW.bom_id AND b.product_id=NEW.product_id)
 THEN RAISE EXCEPTION 'A component cannot be the finished product' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION require_manufacturing_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entity text; tenant text; company text; record_id text; v integer; actor text;
BEGIN
 tenant:=coalesce(NEW.tenant_id,OLD.tenant_id); company:=coalesce(NEW.company_id,OLD.company_id);
 IF TG_TABLE_NAME='manufacturing_bom_line' THEN
  entity:='bom'; record_id:=coalesce(NEW.bom_id,OLD.bom_id);
  SELECT row_version,updated_by INTO v,actor FROM manufacturing_bom WHERE tenant_id=tenant AND company_id=company AND id=record_id;
 ELSIF TG_TABLE_NAME='manufacturing_plan_line' THEN
  entity:='plan'; record_id:=coalesce(NEW.plan_id,OLD.plan_id);
  EXECUTE 'SELECT row_version,updated_by FROM manufacturing_plan WHERE tenant_id=$1 AND company_id=$2 AND id=$3' INTO v,actor USING tenant,company,record_id;
 ELSIF TG_TABLE_NAME='manufacturing_order_line' THEN
  entity:='order'; record_id:=coalesce(NEW.order_id,OLD.order_id);
  EXECUTE 'SELECT row_version,updated_by FROM manufacturing_order WHERE tenant_id=$1 AND company_id=$2 AND id=$3' INTO v,actor USING tenant,company,record_id;
 ELSE
  entity:=CASE TG_TABLE_NAME WHEN 'manufacturing_bom' THEN 'bom' WHEN 'manufacturing_plan' THEN 'plan' ELSE 'order' END;
  record_id:=NEW.id; v:=NEW.row_version; actor:=NEW.updated_by;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM manufacturing_change e JOIN platform_admin_audit_event a ON a.tenant_id=e.tenant_id AND a.id=e.audit_event_id
  WHERE e.tenant_id=tenant AND e.company_id=company AND e.entity_type=entity AND e.entity_id=record_id AND e.record_version=v
  AND e.actor_id=actor AND e.snapshot=manufacturing_snapshot(entity,tenant,company,record_id)
  AND a.entity_id=record_id AND a.actor_id=e.actor_id AND a.action='manufacturing.'||entity||'.'||e.action)
 THEN RAISE EXCEPTION 'Immutable Manufacturing audit evidence required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER manufacturing_guard BEFORE INSERT OR UPDATE OR DELETE ON manufacturing_bom FOR EACH ROW EXECUTE FUNCTION guard_manufacturing_record();
CREATE TRIGGER manufacturing_bom_line_guard BEFORE INSERT OR UPDATE ON manufacturing_bom_line FOR EACH ROW EXECUTE FUNCTION guard_manufacturing_bom_line();
CREATE CONSTRAINT TRIGGER manufacturing_evidence AFTER INSERT OR UPDATE ON manufacturing_bom DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_manufacturing_evidence();
CREATE CONSTRAINT TRIGGER manufacturing_lines_evidence AFTER INSERT OR UPDATE OR DELETE ON manufacturing_bom_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_manufacturing_evidence();
CREATE TRIGGER manufacturing_change_immutable BEFORE UPDATE OR DELETE ON manufacturing_change FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['manufacturing_bom','manufacturing_bom_line','manufacturing_change'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',name);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('manufacturing',1,'bill_of_materials');
