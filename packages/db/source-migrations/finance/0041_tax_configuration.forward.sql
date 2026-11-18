-- Company-owned display settings and region masters. No rates or grants are seeded.
CREATE TABLE finance_tax_region (
 tenant_id text NOT NULL, company_id text NOT NULL, code text NOT NULL CHECK(code ~ '^TRG-[0-9]{3,}$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
 short_code text NOT NULL CHECK(short_code ~ '^[A-Z][A-Z0-9-]{0,9}$'),
 status text NOT NULL CHECK(status IN ('active','inactive')),
 PRIMARY KEY(tenant_id,company_id,code), UNIQUE(tenant_id,company_id,short_code),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id)
);
CREATE TABLE finance_tax_configuration_revision (
 tenant_id text NOT NULL, company_id text NOT NULL, version integer NOT NULL CHECK(version>0),
 year_end_date date, display jsonb NOT NULL CHECK(jsonb_typeof(display)='array'),
 regions jsonb NOT NULL CHECK(jsonb_typeof(regions)='array'),
 actor_id text NOT NULL, reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,version),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id)
);
ALTER TABLE finance_tax_revision DROP CONSTRAINT finance_tax_revision_tax_type_check;
ALTER TABLE finance_tax_revision ADD CONSTRAINT finance_tax_revision_tax_type_check
 CHECK(tax_type IN ('WHT','GST','ADT','FED','GST Withheld','VAT','Excise','Payroll Tax','Other'));
-- rate remains the total applied percentage, preserving all existing source workflows,
-- exact-money resolution, immutable applications and GL reconciliation constraints.
ALTER TABLE finance_tax_revision ADD COLUMN additional_rate numeric NOT NULL DEFAULT 0
 CHECK(additional_rate>=0 AND additional_rate<=rate AND additional_rate=round(additional_rate,2));
ALTER TABLE finance_tax_revision ADD COLUMN print_label text NOT NULL DEFAULT '' CHECK(length(print_label)<=60);
ALTER TABLE finance_tax_revision ADD COLUMN region_code text;
ALTER TABLE finance_tax_revision ADD FOREIGN KEY(tenant_id,company_id,region_code)
 REFERENCES finance_tax_region(tenant_id,company_id,code);
CREATE INDEX finance_tax_revision_region ON finance_tax_revision(tenant_id,company_id,region_code);

CREATE FUNCTION guard_finance_tax_region_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.tenant_id,NEW.company_id,NEW.code,NEW.short_code) IS DISTINCT FROM
 (OLD.tenant_id,OLD.company_id,OLD.code,OLD.short_code) THEN
 RAISE EXCEPTION 'Retain tax region identity; inactivate it and add a new region instead' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tax_region_identity BEFORE UPDATE ON finance_tax_region
 FOR EACH ROW EXECUTE FUNCTION guard_finance_tax_region_identity();
CREATE FUNCTION guard_finance_tax_region_selection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.region_code IS NOT NULL AND NOT EXISTS(SELECT 1 FROM finance_tax_region
 WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND code=NEW.region_code AND status='active') THEN
 RAISE EXCEPTION 'Select an active company tax region' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tax_revision_region BEFORE INSERT ON finance_tax_revision
 FOR EACH ROW EXECUTE FUNCTION guard_finance_tax_region_selection();
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['finance_tax_region','finance_tax_configuration_revision'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
 EXECUTE format('CREATE POLICY company_scope ON %I USING (tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS(SELECT 1 FROM security_user_company_access c WHERE c.tenant_id=%I.tenant_id AND c.company_id=%I.company_id AND c.user_id=current_setting(''nexora.user_id'',true) AND c.revoked_at IS NULL)) WITH CHECK (tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS(SELECT 1 FROM security_user_company_access c WHERE c.tenant_id=%I.tenant_id AND c.company_id=%I.company_id AND c.user_id=current_setting(''nexora.user_id'',true) AND c.revoked_at IS NULL))',relation,relation,relation,relation,relation);
 EXECUTE format('CREATE TRIGGER tax_configuration_authority BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_finance_tax_admin()',relation);
 END LOOP;
END $$;
CREATE TRIGGER immutable_tax_configuration BEFORE UPDATE OR DELETE ON finance_tax_configuration_revision
 FOR EACH ROW EXECUTE FUNCTION guard_finance_subledger_immutable();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',41,'tax_configuration');
