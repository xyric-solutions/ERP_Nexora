-- Persistent standard definitions. Custom packaging always needs product contents.
CREATE TABLE inventory_unit_standard (
 key text PRIMARY KEY, name text NOT NULL UNIQUE, symbol text NOT NULL UNIQUE,
 category text NOT NULL, numerator numeric(18,0) NOT NULL CHECK(numerator>0),
 denominator numeric(18,0) NOT NULL CHECK(denominator>0), precision integer NOT NULL CHECK(precision BETWEEN 0 AND 4)
);
INSERT INTO inventory_unit_standard VALUES
 ('each','Each','ea','count',1,1,4),('pcs','Pcs','pcs','count',1,1,4),
 ('box','Box','box','packaging',1,1,0),('pack','Pack','pack','packaging',1,1,0),
 ('kg','Kg','kg','mass',1,1,4),('gram','Gram','g','mass',1,1000,4),
 ('litre','Litre','L','volume',1,1,4),('metre','Metre','m','length',1,1,4),
 ('hour','Hour','h','time',3600,1,4),('day','Day','day','legacy_day',1,1,4),
 ('mg','Milligram','mg','mass',1,1000000,4),('tonne','Metric Tonne (1000 kg)','t','mass',1000,1,4),
 ('mm','Millimetre','mm','length',1,1000,4),('cm','Centimetre','cm','length',1,100,4),
 ('km','Kilometre','km','length',1000,1,4),
 ('mm2','Square Millimetre','mm2','area',1,1000000,4),('cm2','Square Centimetre','cm2','area',1,10000,4),
 ('m2','Square Metre','m2','area',1,1,4),('ha','Hectare','ha','area',10000,1,4),
 ('ml','Millilitre','mL','volume',1,1000,4),('m3','Cubic Metre','m3','volume',1000,1,4),
 ('dozen','Dozen','doz','count',12,1,0),('second','Second','s','time',1,1,4),
 ('minute','Minute','min','time',60,1,4),('elapsed_day','Elapsed Day (24 hours)','d','time',86400,1,4),
 ('carton','Carton','ctn','packaging',1,1,0),('bag','Bag','bag','packaging',1,1,0);
CREATE TRIGGER inventory_unit_standard_immutable BEFORE UPDATE OR DELETE ON inventory_unit_standard
 FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();

CREATE TABLE inventory_unit (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,code text NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 32),symbol text NOT NULL CHECK(length(btrim(symbol)) BETWEEN 1 AND 16),
 category text NOT NULL CHECK(category IN ('mass','length','area','volume','count','time','packaging','legacy_day')),
 numerator numeric(18,0) NOT NULL CHECK(numerator>0),denominator numeric(18,0) NOT NULL CHECK(denominator>0),
 precision integer NOT NULL CHECK(precision BETWEEN 0 AND 4),status text NOT NULL CHECK(status IN ('active','inactive')),
 standard_key text REFERENCES inventory_unit_standard(key),row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 updated_by text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE UNIQUE INDEX inventory_unit_name ON inventory_unit(tenant_id,company_id,lower(name));
CREATE UNIQUE INDEX inventory_unit_symbol ON inventory_unit(tenant_id,company_id,lower(symbol));
CREATE TABLE inventory_unit_change (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,unit_id text NOT NULL,record_version integer NOT NULL,
 actor_id text NOT NULL,audit_event_id text NOT NULL,idempotency_key text NOT NULL,request_sha256 text NOT NULL,
 snapshot jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,actor_id,idempotency_key),UNIQUE(tenant_id,unit_id,record_version),
 FOREIGN KEY(tenant_id,company_id,unit_id) REFERENCES inventory_unit(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
CREATE FUNCTION seed_inventory_units() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.type='company' THEN
  INSERT INTO inventory_unit(tenant_id,company_id,id,code,name,symbol,category,numerator,denominator,precision,status,standard_key)
   SELECT NEW.tenant_id,NEW.id,'uom:'||md5(NEW.tenant_id||':'||NEW.id)||':'||key,'UOM-'||lpad(row_number() OVER(ORDER BY key)::text,3,'0'),name,symbol,category,numerator,denominator,precision,'active',key FROM inventory_unit_standard;
 END IF;
 RETURN NEW;
END $$;
-- Migration backfill retains all product JSON and immutable historical evidence.
INSERT INTO inventory_unit(tenant_id,company_id,id,code,name,symbol,category,numerator,denominator,precision,status,standard_key)
 SELECT o.tenant_id,o.id,'uom:'||md5(o.tenant_id||':'||o.id)||':'||s.key,'UOM-'||lpad(row_number() OVER(PARTITION BY o.tenant_id,o.id ORDER BY s.key)::text,3,'0'),s.name,s.symbol,s.category,s.numerator,s.denominator,s.precision,'active',s.key
 FROM organization_unit o CROSS JOIN inventory_unit_standard s WHERE o.type='company';
CREATE TRIGGER inventory_company_units AFTER INSERT ON organization_unit FOR EACH ROW EXECUTE FUNCTION seed_inventory_units();
CREATE FUNCTION guard_inventory_unit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retain units; mark inactive instead' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.row_version<>1 THEN RAISE EXCEPTION 'Initial unit version required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.name,NEW.symbol,NEW.category,NEW.numerator,NEW.denominator,NEW.precision,NEW.standard_key,NEW.created_at)
  IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.name,OLD.symbol,OLD.category,OLD.numerator,OLD.denominator,OLD.precision,OLD.standard_key,OLD.created_at)
  OR NEW.row_version<>OLD.row_version+1) THEN RAISE EXCEPTION 'Unit definitions and identity are immutable; create a replacement' USING ERRCODE='23514'; END IF;
 IF NEW.updated_by IS NULL AND NOT (TG_OP='INSERT' AND NEW.status='active' AND EXISTS(SELECT 1 FROM inventory_unit_standard s WHERE s.key=NEW.standard_key AND (s.name,s.symbol,s.category,s.numerator,s.denominator,s.precision)=(NEW.name,NEW.symbol,NEW.category,NEW.numerator,NEW.denominator,NEW.precision)))
 THEN RAISE EXCEPTION 'Unit actor required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION require_inventory_unit_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.updated_by IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM inventory_unit_change e JOIN platform_admin_audit_event a ON a.tenant_id=e.tenant_id AND a.id=e.audit_event_id
 WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.unit_id=NEW.id AND e.record_version=NEW.row_version
 AND e.actor_id=NEW.updated_by AND e.snapshot=to_jsonb(NEW) AND a.entity_id=NEW.id AND a.actor_id=e.actor_id AND a.action IN ('inventory.unit.created','inventory.unit.saved'))
 THEN RAISE EXCEPTION 'Unit audit evidence required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER inventory_unit_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_unit FOR EACH ROW EXECUTE FUNCTION guard_inventory_unit();
CREATE CONSTRAINT TRIGGER inventory_unit_evidence AFTER INSERT OR UPDATE ON inventory_unit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_inventory_unit_evidence();
CREATE TRIGGER inventory_unit_change_immutable BEFORE UPDATE OR DELETE ON inventory_unit_change FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();
CREATE TABLE inventory_product_unit (
 tenant_id text NOT NULL,company_id text NOT NULL,product_id text NOT NULL,unit_id text NOT NULL,
 PRIMARY KEY(tenant_id,company_id,product_id),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,unit_id) REFERENCES inventory_unit(tenant_id,company_id,id)
);
INSERT INTO inventory_product_unit SELECT p.tenant_id,p.company_id,p.id,u.id FROM inventory_product p JOIN inventory_unit u ON u.tenant_id=p.tenant_id AND u.company_id=p.company_id AND u.name=p.details->>'unit';
CREATE FUNCTION sync_inventory_product_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_id text;
BEGIN
 SELECT id INTO selected_id FROM inventory_unit WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND name=NEW.details->>'unit' AND (status='active' OR (TG_OP='UPDATE' AND name=OLD.details->>'unit'));
 IF selected_id IS NULL THEN RAISE EXCEPTION 'Managed product unit required' USING ERRCODE='23514'; END IF;
 INSERT INTO inventory_product_unit VALUES(NEW.tenant_id,NEW.company_id,NEW.id,selected_id) ON CONFLICT(tenant_id,company_id,product_id) DO UPDATE SET unit_id=EXCLUDED.unit_id;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_product_managed_unit AFTER INSERT OR UPDATE ON inventory_product FOR EACH ROW EXECUTE FUNCTION sync_inventory_product_unit();
CREATE FUNCTION require_inventory_product_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant text;company text;product text;
BEGIN
 tenant:=coalesce(NEW.tenant_id,OLD.tenant_id);company:=coalesce(NEW.company_id,OLD.company_id);product:=coalesce(NEW.product_id,OLD.product_id);
 IF NOT EXISTS(SELECT 1 FROM inventory_product_unit r JOIN inventory_product p ON (p.tenant_id,p.company_id,p.id)=(r.tenant_id,r.company_id,r.product_id)
 JOIN inventory_unit u ON (u.tenant_id,u.company_id,u.id)=(r.tenant_id,r.company_id,r.unit_id)
 WHERE r.tenant_id=tenant AND r.company_id=company AND r.product_id=product AND u.name=p.details->>'unit')
 THEN RAISE EXCEPTION 'Product unit reference must match its audited master' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER inventory_product_unit_consistency AFTER INSERT OR UPDATE OR DELETE ON inventory_product_unit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_inventory_product_unit();
ALTER TABLE inventory_transfer_line ADD COLUMN unit_snapshot jsonb;
-- Existing transfer evidence uses snapshots of complete rows. A nullable additive
-- column must not rewrite old rows or their evidence; new writes include it.
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['inventory_unit','inventory_unit_change','inventory_product_unit'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',name);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('inventory',3,'units_of_measure');
