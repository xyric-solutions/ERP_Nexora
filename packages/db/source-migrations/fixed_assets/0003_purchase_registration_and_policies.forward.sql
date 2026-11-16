-- Extend the existing asset domain without changing historical policy snapshots.
ALTER TABLE fixed_asset_record DROP CONSTRAINT fixed_asset_record_method_check;
ALTER TABLE fixed_asset_record ADD CONSTRAINT fixed_asset_record_method_check
 CHECK(method IN ('straight_line','reducing_balance','double_declining'));

CREATE TABLE fixed_asset_nominal_classification (
 tenant_id text NOT NULL,company_id text NOT NULL,account_id text NOT NULL,
 active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,account_id),
 FOREIGN KEY(tenant_id,company_id,account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
INSERT INTO fixed_asset_nominal_classification(tenant_id,company_id,account_id,updated_by)
 SELECT DISTINCT ON(c.tenant_id,c.company_id,c.asset_account_id)
 c.tenant_id,c.company_id,c.asset_account_id,c.updated_by
 FROM fixed_asset_category c JOIN account a ON a.tenant_id=c.tenant_id AND a.company_id=c.company_id AND a.id=c.asset_account_id
 WHERE c.active AND a.type='asset' AND a.status='active' AND NOT a.is_header AND NOT a.reconciliation_required
 ORDER BY c.tenant_id,c.company_id,c.asset_account_id,c.updated_at DESC;

CREATE TABLE fixed_asset_company_policy (
 tenant_id text NOT NULL,company_id text NOT NULL,version integer NOT NULL CHECK(version>0),
 policy jsonb NOT NULL CHECK(jsonb_typeof(policy)='object'),updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE fixed_asset_purchase_origin (
 tenant_id text NOT NULL,company_id text NOT NULL,asset_id text NOT NULL,
 document_id text NOT NULL,line_id text NOT NULL,unit_id text NOT NULL,
 PRIMARY KEY(tenant_id,company_id,asset_id),
 UNIQUE(tenant_id,company_id,document_id,line_id,unit_id),
 FOREIGN KEY(tenant_id,company_id,asset_id) REFERENCES fixed_asset_record(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,document_id) REFERENCES procurement_document(tenant_id,company_id,id)
);
CREATE TRIGGER fixed_asset_purchase_origin_immutable BEFORE UPDATE OR DELETE ON fixed_asset_purchase_origin
 FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_immutable();
CREATE FUNCTION guard_fixed_asset_purchase_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM procurement_document d CROSS JOIN LATERAL jsonb_array_elements(d.lines) l
   CROSS JOIN LATERAL jsonb_array_elements(l->'asset_registration'->'units') u
   JOIN fixed_asset_record a ON a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id AND a.id=NEW.asset_id
   JOIN journal_line j ON j.tenant_id=a.tenant_id AND j.id=a.source_line_id
   WHERE d.tenant_id=NEW.tenant_id AND d.company_id=NEW.company_id AND d.id=NEW.document_id
   AND d.kind='bill' AND d.state='approved' AND l->>'id'=NEW.line_id AND u->>'unit_id'=NEW.unit_id
   AND j.dimensions->>'purchase_line_id'=NEW.line_id AND a.category_id=l->>'asset_category_id') THEN
   RAISE EXCEPTION 'Asset origin must match approved purchase unit and posted debit' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fixed_asset_purchase_origin_valid BEFORE INSERT ON fixed_asset_purchase_origin
 FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_purchase_origin();
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['fixed_asset_nominal_classification','fixed_asset_company_policy','fixed_asset_purchase_origin'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',target);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',target);
 EXECUTE format('CREATE POLICY %I ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',target||'_tenant',target);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name)
 VALUES('fixed_assets',3,'purchase_registration_and_policies');
