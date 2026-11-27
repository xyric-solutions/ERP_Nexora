-- Additive configuration only. No existing company accounts or balances change.
CREATE TABLE finance_business_nature_catalog (
 key text PRIMARY KEY CHECK(length(key) BETWEEN 1 AND 128),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive'))
);
INSERT INTO finance_business_nature_catalog(key,name) VALUES
 ('it_software','IT & Software'),('non_profit','Non-Profit Organization'),
 ('corporate','Corporate Business'),('retail','Retail & Wholesale'),
 ('manufacturing','Manufacturing'),('services','Professional Services'),
 ('government','Government'),('other','Other Business');

ALTER TABLE finance_chart_template
 ADD COLUMN business_nature_key text REFERENCES finance_business_nature_catalog(key),
 ADD COLUMN initialization_roles jsonb,
 ADD CONSTRAINT chart_business_roles_shape CHECK (
  (business_nature_key IS NULL AND initialization_roles IS NULL) OR
  (business_nature_key IS NOT NULL AND initialization_roles IS NOT NULL AND jsonb_typeof(initialization_roles)='object')
 );
CREATE INDEX chart_business_nature ON finance_chart_template(tenant_id,business_nature_key,published_at DESC,id) WHERE state='published';
ALTER TABLE finance_chart_template ADD CONSTRAINT chart_template_nature_identity UNIQUE(tenant_id,id,business_nature_key);

CREATE TABLE finance_company_business_setup (
 tenant_id text NOT NULL, company_id text NOT NULL,
 company_type text NOT NULL DEFAULT 'company' CHECK(company_type='company'),
 business_nature_key text NOT NULL REFERENCES finance_business_nature_catalog(key),
 template_id text NOT NULL, organisation_type text NOT NULL CHECK(organisation_type IN
 ('sole_proprietorship','partnership','private_limited','public_limited','non_profit','government','other')),
 country_code text NOT NULL CHECK(country_code ~ '^[A-Z]{2}$'),
 base_currency text NOT NULL,
 financial_year_start_month smallint NOT NULL CHECK(financial_year_start_month BETWEEN 1 AND 12),
 accounting_method text NOT NULL CHECK(accounting_method IN ('accrual','cash')),
 initialized_by text NOT NULL, initialized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 audit_event_id text NOT NULL,
 PRIMARY KEY(tenant_id,company_id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,company_type) REFERENCES organization_unit(tenant_id,id,type),
 FOREIGN KEY(tenant_id,template_id,business_nature_key) REFERENCES finance_chart_template(tenant_id,id,business_nature_key),
 FOREIGN KEY(tenant_id,company_id,template_id) REFERENCES finance_chart_company_adoption(tenant_id,company_id,template_id),
 FOREIGN KEY(tenant_id,company_id,base_currency) REFERENCES company_currency_profile(tenant_id,company_id,base_currency),
 FOREIGN KEY(tenant_id,initialized_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
ALTER TABLE finance_company_business_setup ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_company_business_setup FORCE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON finance_company_business_setup
 USING(tenant_id=current_setting('nexora.tenant_id',true) AND EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=finance_company_business_setup.tenant_id AND a.company_id=finance_company_business_setup.company_id AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL))
 WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true) AND EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=finance_company_business_setup.tenant_id AND a.company_id=finance_company_business_setup.company_id AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL));
CREATE TRIGGER business_setup_immutable BEFORE UPDATE OR DELETE ON finance_company_business_setup
 FOR EACH ROW EXECUTE FUNCTION protect_bank_account_event();
CREATE FUNCTION validate_business_setup_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.initialized_by IS DISTINCT FROM current_setting('nexora.user_id',true)
 OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.initialized_by,'platform.approval.override',true)
 OR NOT EXISTS(SELECT 1 FROM finance_chart_company_event e WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id
   AND e.template_id=NEW.template_id AND e.event_id=NEW.audit_event_id AND e.actor_id=NEW.initialized_by AND e.action='adopted')
 OR NOT EXISTS(SELECT 1 FROM finance_subledger_policy p WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id)
 THEN RAISE EXCEPTION 'Business setup requires company-scoped authority and immutable chart adoption evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER business_setup_evidence BEFORE INSERT ON finance_company_business_setup
 FOR EACH ROW EXECUTE FUNCTION validate_business_setup_evidence();
CREATE FUNCTION finance_template_bank_section_key(t text, template text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT 'section:'||coalesce(initialization_roles->>'cash_and_bank_section','2309') FROM finance_chart_template WHERE tenant_id=t AND id=template
$$;

CREATE OR REPLACE FUNCTION guard_chart_company_node() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source finance_chart_template_node%ROWTYPE; a account%ROWTYPE; profile finance_general_nominal%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Company chart mappings cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO source FROM finance_chart_template_node WHERE tenant_id=NEW.tenant_id AND template_id=NEW.template_id AND node_key=NEW.node_key;
 IF TG_OP='UPDATE' AND OLD.account_id IS NULL AND NEW.account_id IS NOT NULL THEN
  IF (NEW.tenant_id,NEW.company_id,NEW.template_id,NEW.node_key,NEW.posting_classification,NEW.review_version,NEW.reviewed_by,NEW.review_reason)
    IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.template_id,OLD.node_key,OLD.posting_classification,OLD.review_version,OLD.reviewed_by,OLD.review_reason)
   OR source.kind<>'nominal' OR source.parent_key IS DISTINCT FROM finance_template_bank_section_key(NEW.tenant_id,NEW.template_id) OR NEW.posting_classification<>'not_applicable'
   OR NOT EXISTS(SELECT 1 FROM finance_chart_bank_binding binding WHERE binding.tenant_id=NEW.tenant_id AND binding.company_id=NEW.company_id AND binding.template_id=NEW.template_id AND binding.node_key=NEW.node_key AND binding.nominal_id=NEW.account_id) THEN
   RAISE EXCEPTION 'Only an exact audited Bank definition may be bound once' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.company_id,NEW.template_id,NEW.node_key,NEW.account_id) IS DISTINCT FROM
     (OLD.tenant_id,OLD.company_id,OLD.template_id,OLD.node_key,OLD.account_id)
    OR OLD.posting_classification='not_applicable' OR NEW.posting_classification NOT IN ('ordinary','module_controlled')
    OR NEW.review_version<>OLD.review_version+1 THEN
   RAISE EXCEPTION 'Company chart identity and review version are protected' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.review_version<>1 OR NEW.posting_classification NOT IN ('not_applicable','review_required') THEN
  RAISE EXCEPTION 'Adopted nominals require an explicit initial review' USING ERRCODE='23514';
 END IF;
 IF NEW.account_id IS NULL THEN
  IF source.kind<>'nominal' OR source.parent_key IS DISTINCT FROM finance_template_bank_section_key(NEW.tenant_id,NEW.template_id) OR NEW.posting_classification<>'not_applicable' THEN
   RAISE EXCEPTION 'Only Bank reference definitions may remain unmapped' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO a FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.account_id;
 IF a.id IS NULL OR (a.name<>source.name AND NOT (TG_OP='UPDATE' AND source.kind='nominal' AND a.managed_general_nominal AND coa_nominal_edit_proof(a.tenant_id,a.company_id,a.id,a.coa_change_id,a.coa_version,a.status,a.name,a.parent_id))) OR a.type<>source.account_type OR a.is_header<>(source.kind<>'nominal')
 OR (source.kind<>'category' AND a.code<>source.code) THEN
  RAISE EXCEPTION 'Company account must match its Excel definition' USING ERRCODE='23514';
 END IF;
 IF source.kind='nominal' THEN
  SELECT * INTO profile FROM finance_general_nominal WHERE tenant_id=NEW.tenant_id AND nominal_id=NEW.account_id;
  IF NOT a.managed_general_nominal OR profile.nominal_id IS NULL OR profile.state<>'draft' OR NEW.posting_classification='not_applicable' THEN
   RAISE EXCEPTION 'Initial adoption and classification require a governed draft' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.posting_classification<>'not_applicable' THEN
  RAISE EXCEPTION 'Headers cannot be posting classifications' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.validate_chart_bank_binding()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM finance_chart_company_node m
  JOIN finance_chart_template_node s ON s.tenant_id=m.tenant_id AND s.template_id=m.template_id AND s.node_key=m.node_key
  JOIN account a ON a.tenant_id=m.tenant_id AND a.company_id=m.company_id AND a.id=NEW.nominal_id
  JOIN bank_account b ON b.tenant_id=a.tenant_id AND b.company_id=a.company_id AND b.account_id=a.id AND b.identity_mode='nominal_only'
  JOIN finance_nominal_event e ON e.tenant_id=a.tenant_id AND e.company_id=a.company_id AND e.nominal_id=a.id AND e.bank_account_id=b.id AND e.event_type='created' AND e.actor_id=NEW.created_by AND e.resulting_version=1
  JOIN platform_admin_audit_event audit ON audit.tenant_id=a.tenant_id AND audit.id=NEW.audit_event_id AND audit.entity_type='finance_nominal' AND audit.entity_id=a.id AND audit.action='finance.nominal.create' AND audit.actor_id=NEW.created_by
  WHERE m.tenant_id=NEW.tenant_id AND m.company_id=NEW.company_id AND m.template_id=NEW.template_id AND m.node_key=NEW.node_key
   AND m.account_id=NEW.nominal_id AND s.kind='nominal' AND s.parent_key=finance_template_bank_section_key(NEW.tenant_id,NEW.template_id) AND a.code=s.code AND a.name=s.name AND a.managed_bank_nominal
   AND b.created_by=NEW.created_by AND (b.status='draft' OR (b.status='active' AND EXISTS(SELECT 1 FROM finance_coa_master_change direct WHERE direct.tenant_id=b.tenant_id AND direct.company_id=b.company_id AND direct.account_id=a.id AND direct.id=b.coa_change_id AND direct.action='activated' AND direct.record_version=b.row_version AND direct.actor_id=NEW.created_by)))) THEN
  RAISE EXCEPTION 'Bank definition binding requires the exact audited Bank draft and source mapping' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $function$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',44,'business_nature_setup');
