-- Shared business identity; immutable financial rows and journal history remain intact.
-- Runs after Finance and Procurement foundations on both fresh and upgraded schemas.
ALTER TABLE party ADD COLUMN company_id text;
ALTER TABLE party ADD FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id);
ALTER TABLE party ADD UNIQUE(tenant_id,company_id,id);
ALTER TABLE party DROP CONSTRAINT party_tenant_id_code_key;
CREATE UNIQUE INDEX party_company_code ON party(tenant_id,company_id,code) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX party_legacy_code ON party(tenant_id,code) WHERE company_id IS NULL;

UPDATE party p SET company_id=s.company_id FROM procurement_supplier s
 WHERE (s.tenant_id,s.id)=(p.tenant_id,p.id);

CREATE TABLE finance_party_master_link (
 tenant_id text NOT NULL, company_id text NOT NULL, financial_party_id text NOT NULL, canonical_party_id text NOT NULL,
 PRIMARY KEY(tenant_id,company_id,financial_party_id), UNIQUE(tenant_id,company_id,canonical_party_id),
 FOREIGN KEY(tenant_id,company_id,financial_party_id) REFERENCES finance_subledger_party(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,canonical_party_id) REFERENCES party(tenant_id,company_id,id)
);

-- Fail closed on broken explicit references. Do not guess an identity from a name.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM finance_subledger_party f LEFT JOIN procurement_supplier s
   ON (s.tenant_id,s.company_id,s.id)=(f.tenant_id,f.company_id,f.source_supplier_id)
   LEFT JOIN party p ON (p.tenant_id,p.company_id,p.id)=(s.tenant_id,s.company_id,s.id)
   WHERE f.source_supplier_id IS NOT NULL AND (f.kind<>'supplier' OR s.id IS NULL OR p.type IS DISTINCT FROM 'vendor')) THEN
  RAISE EXCEPTION 'Canonical party preflight: broken explicit supplier reference' USING ERRCODE='23514';
 END IF;
END $$;

ALTER TABLE finance_subledger_party ADD CONSTRAINT finance_party_supplier_master
 FOREIGN KEY(tenant_id,company_id,source_supplier_id) REFERENCES procurement_supplier(tenant_id,company_id,id);

INSERT INTO party(id,tenant_id,company_id,type,code,name,tax_id,status,risk_status,created_at)
 SELECT f.id,f.tenant_id,f.company_id,CASE f.kind WHEN 'customer' THEN 'customer' ELSE 'vendor' END,
  f.code,f.name,'','active','normal',f.created_at
 FROM finance_subledger_party f WHERE f.source_supplier_id IS NULL;

-- Legacy financial-only suppliers retain no operational profile. Their reviewed
-- cutover must create that profile with the normal immutable Purchasing audit.
INSERT INTO finance_party_master_link
 SELECT tenant_id,company_id,id,coalesce(source_supplier_id,id) FROM finance_subledger_party;

-- Existing tenant isolation remains. Company-owned business masters also require
-- company access; unclassified legacy/employee rows retain their prior scope.
CREATE POLICY business_company_scope ON party AS RESTRICTIVE USING (
 company_id IS NULL OR EXISTS(SELECT 1 FROM security_user_company_access a
  WHERE a.tenant_id=party.tenant_id AND a.company_id=party.company_id
   AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL)) WITH CHECK (
 company_id IS NULL OR EXISTS(SELECT 1 FROM security_user_company_access a
  WHERE a.tenant_id=party.tenant_id AND a.company_id=party.company_id
   AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL));

ALTER TABLE finance_party_master_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_party_master_link FORCE ROW LEVEL SECURITY;
CREATE POLICY company_scope ON finance_party_master_link USING (
 tenant_id=current_setting('nexora.tenant_id',true) AND EXISTS(SELECT 1 FROM security_user_company_access a
  WHERE a.tenant_id=finance_party_master_link.tenant_id AND a.company_id=finance_party_master_link.company_id
   AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL)) WITH CHECK (
 tenant_id=current_setting('nexora.tenant_id',true) AND EXISTS(SELECT 1 FROM security_user_company_access a
  WHERE a.tenant_id=finance_party_master_link.tenant_id AND a.company_id=finance_party_master_link.company_id
   AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL));
CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON finance_party_master_link
 FOR EACH ROW EXECUTE FUNCTION guard_finance_subledger_immutable();

CREATE FUNCTION erp_party_identity_key(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT lower(regexp_replace(btrim(value),'\s+',' ','g'))
$$;
CREATE INDEX party_company_identity ON party(tenant_id,company_id,type,erp_party_identity_key(name));
CREATE INDEX party_company_tax_identity ON party(tenant_id,company_id,type,erp_party_identity_key(tax_id)) WHERE btrim(tax_id)<>'';

CREATE FUNCTION erp_guard_party_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND ((NEW.tenant_id,NEW.id,NEW.type,NEW.code) IS DISTINCT FROM (OLD.tenant_id,OLD.id,OLD.type,OLD.code)
   OR (OLD.company_id IS NOT NULL AND NEW.company_id IS DISTINCT FROM OLD.company_id)) THEN
  RAISE EXCEPTION 'Canonical party identity is immutable' USING ERRCODE='23514',CONSTRAINT='erp_party_identity';
 END IF;
 IF NEW.company_id IS NOT NULL AND NEW.type IN('customer','vendor') THEN
  IF NOT EXISTS(SELECT 1 FROM organization_unit WHERE tenant_id=NEW.tenant_id AND id=NEW.company_id AND type='company') THEN
   RAISE EXCEPTION 'Canonical business party requires a company' USING ERRCODE='23514',CONSTRAINT='erp_party_company';
  END IF;
  IF TG_OP='INSERT' OR (NEW.name,NEW.tax_id,NEW.company_id) IS DISTINCT FROM (OLD.name,OLD.tax_id,OLD.company_id) THEN
   -- Serialize candidate checks, including requests from different module APIs.
   PERFORM pg_advisory_xact_lock(hashtextextended('erp:party-identity:'||NEW.tenant_id||':'||NEW.company_id||':'||NEW.type,0));
   IF EXISTS(SELECT 1 FROM party p WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id AND p.type=NEW.type AND p.id<>NEW.id
    AND (erp_party_identity_key(p.name)=erp_party_identity_key(NEW.name)
      OR (btrim(NEW.tax_id)<>'' AND erp_party_identity_key(p.tax_id)=erp_party_identity_key(NEW.tax_id)))) THEN
    RAISE EXCEPTION 'A matching business identity already exists in this company'
     USING ERRCODE='23514',CONSTRAINT='erp_party_duplicate';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_party_identity BEFORE INSERT OR UPDATE ON party FOR EACH ROW EXECUTE FUNCTION erp_guard_party_identity();

CREATE FUNCTION erp_guard_supplier_master() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE master party%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.company_id,NEW.id,NEW.code) IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code) THEN
  RAISE EXCEPTION 'Supplier identity is immutable' USING ERRCODE='23514',CONSTRAINT='erp_party_identity';
 END IF;
 SELECT * INTO master FROM party WHERE tenant_id=NEW.tenant_id AND id=NEW.id FOR UPDATE;
 IF master.company_id IS NULL AND master.type='vendor' THEN
  UPDATE party SET company_id=NEW.company_id WHERE tenant_id=NEW.tenant_id AND id=NEW.id;
  master.company_id:=NEW.company_id;
 END IF;
 IF master.id IS NULL OR master.company_id IS DISTINCT FROM NEW.company_id OR master.type<>'vendor' OR master.code<>NEW.code THEN
  RAISE EXCEPTION 'Supplier requires its canonical company vendor' USING ERRCODE='23514',CONSTRAINT='erp_party_company';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_supplier_master BEFORE INSERT OR UPDATE ON procurement_supplier FOR EACH ROW EXECUTE FUNCTION erp_guard_supplier_master();

CREATE FUNCTION erp_check_supplier_master() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM procurement_supplier s JOIN party p ON p.tenant_id=s.tenant_id AND p.id=s.id
   WHERE s.tenant_id=NEW.tenant_id AND s.id=NEW.id AND (s.company_id IS DISTINCT FROM p.company_id OR s.name<>p.name OR s.tax_id<>p.tax_id)) THEN
  RAISE EXCEPTION 'Supplier details must agree with the shared master' USING ERRCODE='23514',CONSTRAINT='erp_party_profile';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER erp_supplier_master_consistency AFTER INSERT OR UPDATE ON procurement_supplier
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_check_supplier_master();
CREATE CONSTRAINT TRIGGER erp_party_master_consistency AFTER UPDATE ON party
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_check_supplier_master();

CREATE FUNCTION erp_bind_financial_party() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE master_id text; master_kind text;
BEGIN
 IF NEW.source_supplier_id IS NOT NULL THEN
  IF NEW.kind<>'supplier' THEN
   RAISE EXCEPTION 'Only supplier accounts can link suppliers' USING ERRCODE='23514',CONSTRAINT='erp_party_company';
  END IF;
  SELECT p.id INTO master_id FROM procurement_supplier s JOIN party p ON (p.tenant_id,p.company_id,p.id)=(s.tenant_id,s.company_id,s.id)
   WHERE s.tenant_id=NEW.tenant_id AND s.company_id=NEW.company_id AND s.id=NEW.source_supplier_id
    AND p.type='vendor' AND p.status='active' AND p.risk_status<>'blocked' AND s.risk_status<>'blocked' FOR SHARE OF s,p;
  IF master_id IS NULL THEN
   RAISE EXCEPTION 'Supplier master is unavailable in this company' USING ERRCODE='23514',CONSTRAINT='erp_party_company';
  END IF;
 ELSE
  master_id:=NEW.id;
  master_kind:=CASE NEW.kind WHEN 'customer' THEN 'customer' ELSE 'vendor' END;
  INSERT INTO party(id,tenant_id,company_id,type,code,name,tax_id,status,risk_status,created_at)
   VALUES(master_id,NEW.tenant_id,NEW.company_id,master_kind,NEW.code,NEW.name,'','active','normal',NEW.created_at);
  IF NEW.kind='supplier' THEN
   INSERT INTO procurement_supplier(tenant_id,company_id,id,code,name,status,created_by,updated_by)
    VALUES(NEW.tenant_id,NEW.company_id,master_id,NEW.code,NEW.name,'inactive',NEW.created_by,NEW.created_by);
  END IF;
 END IF;
 INSERT INTO finance_party_master_link VALUES(NEW.tenant_id,NEW.company_id,NEW.id,master_id);
 RETURN NEW;
END $$;
CREATE TRIGGER erp_financial_party_binding AFTER INSERT ON finance_subledger_party
 FOR EACH ROW EXECUTE FUNCTION erp_bind_financial_party();

CREATE VIEW finance_party_directory WITH(security_invoker=true) AS
 SELECT f.tenant_id,f.company_id,f.id,f.kind,f.code,p.name,f.default_currency,
  CASE WHEN f.kind='supplier' THEN s.id ELSE NULL END AS source_supplier_id,
  p.id AS canonical_party_id,p.status,
  CASE WHEN p.risk_status='blocked' OR s.risk_status='blocked' THEN 'blocked'
       WHEN p.risk_status='watch' OR s.risk_status='watch' THEN 'watch' ELSE 'normal' END AS risk_status
 FROM finance_subledger_party f JOIN finance_party_master_link l
  ON (l.tenant_id,l.company_id,l.financial_party_id)=(f.tenant_id,f.company_id,f.id)
 JOIN party p ON (p.tenant_id,p.company_id,p.id)=(l.tenant_id,l.company_id,l.canonical_party_id)
 LEFT JOIN procurement_supplier s ON (s.tenant_id,s.company_id,s.id)=(p.tenant_id,p.company_id,p.id);

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('procurement',8,'canonical_business_parties');
