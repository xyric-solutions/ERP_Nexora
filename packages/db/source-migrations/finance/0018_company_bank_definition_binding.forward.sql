-- Explicit source-definition selection; no Bank facilities/currencies auto-created.
CREATE TABLE finance_chart_bank_binding (
 tenant_id text NOT NULL, company_id text NOT NULL, template_id text NOT NULL, node_key text NOT NULL,
 nominal_id text NOT NULL, audit_event_id text NOT NULL, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,template_id,node_key),UNIQUE(tenant_id,company_id,nominal_id),
 FOREIGN KEY(tenant_id,company_id,template_id,node_key) REFERENCES finance_chart_company_node(tenant_id,company_id,template_id,node_key),
 FOREIGN KEY(tenant_id,company_id,nominal_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id)
);
ALTER TABLE finance_chart_bank_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_chart_bank_binding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_chart_bank_binding
 USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER chart_bank_binding_immutable BEFORE UPDATE OR DELETE ON finance_chart_bank_binding
 FOR EACH ROW EXECUTE FUNCTION protect_bank_account_event();
CREATE FUNCTION validate_chart_bank_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM finance_chart_company_node m
  JOIN finance_chart_template_node s ON s.tenant_id=m.tenant_id AND s.template_id=m.template_id AND s.node_key=m.node_key
  JOIN account a ON a.tenant_id=m.tenant_id AND a.company_id=m.company_id AND a.id=NEW.nominal_id
  JOIN bank_account b ON b.tenant_id=a.tenant_id AND b.company_id=a.company_id AND b.account_id=a.id AND b.identity_mode='nominal_only'
  JOIN finance_nominal_event e ON e.tenant_id=a.tenant_id AND e.company_id=a.company_id AND e.nominal_id=a.id AND e.bank_account_id=b.id AND e.event_type='created' AND e.actor_id=NEW.created_by AND e.resulting_version=1
  JOIN platform_admin_audit_event audit ON audit.tenant_id=a.tenant_id AND audit.id=NEW.audit_event_id AND audit.entity_type='finance_nominal' AND audit.entity_id=a.id AND audit.action='finance.nominal.create' AND audit.actor_id=NEW.created_by
  WHERE m.tenant_id=NEW.tenant_id AND m.company_id=NEW.company_id AND m.template_id=NEW.template_id AND m.node_key=NEW.node_key
   AND m.account_id=NEW.nominal_id AND s.kind='nominal' AND s.parent_key='section:2309' AND a.code=s.code AND a.name=s.name AND a.managed_bank_nominal
   AND b.created_by=NEW.created_by AND b.status='draft') THEN
  RAISE EXCEPTION 'Bank definition binding requires the exact audited Bank draft and source mapping' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER chart_bank_binding_complete AFTER INSERT ON finance_chart_bank_binding
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_chart_bank_binding();
CREATE OR REPLACE FUNCTION guard_chart_company_node() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_row finance_chart_template_node%ROWTYPE; account_row account%ROWTYPE; profile finance_general_nominal%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Company chart mappings cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO source_row FROM finance_chart_template_node WHERE tenant_id=NEW.tenant_id AND template_id=NEW.template_id AND node_key=NEW.node_key;
 IF TG_OP='UPDATE' AND OLD.account_id IS NULL AND NEW.account_id IS NOT NULL THEN
  IF (NEW.tenant_id,NEW.company_id,NEW.template_id,NEW.node_key,NEW.posting_classification,NEW.review_version,NEW.reviewed_by,NEW.review_reason)
    IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.template_id,OLD.node_key,OLD.posting_classification,OLD.review_version,OLD.reviewed_by,OLD.review_reason)
   OR source_row.kind<>'nominal' OR source_row.parent_key<>'section:2309' OR NEW.posting_classification<>'not_applicable'
   OR NOT EXISTS(SELECT 1 FROM finance_chart_bank_binding binding WHERE binding.tenant_id=NEW.tenant_id AND binding.company_id=NEW.company_id AND binding.template_id=NEW.template_id AND binding.node_key=NEW.node_key AND binding.nominal_id=NEW.account_id) THEN
   RAISE EXCEPTION 'Only an explicit audited Bank definition may be bound once' USING ERRCODE='23514';
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
  IF source_row.kind<>'nominal' OR source_row.parent_key<>'section:2309' OR NEW.posting_classification<>'not_applicable' THEN
   RAISE EXCEPTION 'Only Bank reference definitions may remain unmapped' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO account_row FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.account_id;
 IF account_row.id IS NULL OR account_row.name<>source_row.name OR account_row.type<>source_row.account_type OR account_row.is_header<>(source_row.kind<>'nominal') OR (source_row.kind<>'category' AND account_row.code<>source_row.code) THEN
  RAISE EXCEPTION 'Company account must match its Excel definition' USING ERRCODE='23514';
 END IF;
 IF source_row.kind='nominal' THEN
  SELECT * INTO profile FROM finance_general_nominal WHERE tenant_id=NEW.tenant_id AND nominal_id=NEW.account_id;
  IF NOT account_row.managed_general_nominal OR profile.nominal_id IS NULL OR profile.state<>'draft' OR NEW.posting_classification='not_applicable' THEN
   RAISE EXCEPTION 'Initial adoption and classification require a governed draft' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.posting_classification<>'not_applicable' THEN
  RAISE EXCEPTION 'Headers cannot be posting classifications' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',18,'company_bank_definition_binding');
