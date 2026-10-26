-- Explicit company adoption, not automatic activation or Bank facility creation.
CREATE TABLE finance_chart_company_adoption (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 template_id text NOT NULL, catalog_key text NOT NULL, currency text NOT NULL,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,catalog_key),
 UNIQUE(tenant_id,company_id,template_id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,template_id) REFERENCES finance_chart_template(tenant_id,id),
 FOREIGN KEY(tenant_id,currency) REFERENCES currency(tenant_id,code),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE finance_chart_company_node (
 tenant_id text NOT NULL, company_id text NOT NULL, template_id text NOT NULL,
 node_key text NOT NULL, account_id text,
 posting_classification text NOT NULL CHECK(posting_classification IN ('not_applicable','review_required','ordinary','module_controlled')),
 review_version integer NOT NULL DEFAULT 1 CHECK(review_version>0),
 reviewed_by text, review_reason text,
 PRIMARY KEY(tenant_id,company_id,template_id,node_key),
 UNIQUE(tenant_id,company_id,account_id),
 FOREIGN KEY(tenant_id,company_id,template_id) REFERENCES finance_chart_company_adoption(tenant_id,company_id,template_id),
 FOREIGN KEY(tenant_id,template_id,node_key) REFERENCES finance_chart_template_node(tenant_id,template_id,node_key),
 FOREIGN KEY(tenant_id,company_id,account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,reviewed_by) REFERENCES security_user_account(tenant_id,id),
 CHECK((posting_classification IN ('ordinary','module_controlled') AND reviewed_by IS NOT NULL AND char_length(btrim(review_reason)) BETWEEN 3 AND 500)
 OR (posting_classification IN ('not_applicable','review_required') AND reviewed_by IS NULL AND review_reason IS NULL))
);
CREATE TABLE finance_chart_company_event (
 tenant_id text NOT NULL, event_id text NOT NULL, company_id text NOT NULL, template_id text NOT NULL,
 node_key text, action text NOT NULL CHECK(action IN ('adopted','classified')),
 actor_id text NOT NULL, idempotency_key text NOT NULL, request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,event_id), UNIQUE(tenant_id,actor_id,action,idempotency_key),
 FOREIGN KEY(tenant_id,company_id,template_id) REFERENCES finance_chart_company_adoption(tenant_id,company_id,template_id),
 FOREIGN KEY(tenant_id,template_id,node_key) REFERENCES finance_chart_template_node(tenant_id,template_id,node_key),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,event_id) REFERENCES platform_admin_audit_event(tenant_id,id),
 CHECK((action='adopted' AND node_key IS NULL) OR (action='classified' AND node_key IS NOT NULL))
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['finance_chart_company_adoption','finance_chart_company_node','finance_chart_company_event'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''nexora.tenant_id'',true))',tab);
 END LOOP;
END $$;
CREATE TRIGGER chart_company_adoption_immutable BEFORE UPDATE OR DELETE ON finance_chart_company_adoption
 FOR EACH ROW EXECUTE FUNCTION protect_bank_account_event();
CREATE TRIGGER chart_company_event_immutable BEFORE UPDATE OR DELETE ON finance_chart_company_event
 FOR EACH ROW EXECUTE FUNCTION protect_bank_account_event();
CREATE FUNCTION guard_chart_company_node() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source finance_chart_template_node%ROWTYPE; a account%ROWTYPE; profile finance_general_nominal%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Company chart mappings cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO source FROM finance_chart_template_node WHERE tenant_id=NEW.tenant_id AND template_id=NEW.template_id AND node_key=NEW.node_key;
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
  IF source.kind<>'nominal' OR source.parent_key<>'section:2309' OR NEW.posting_classification<>'not_applicable' THEN
   RAISE EXCEPTION 'Only Bank reference definitions may remain unmapped' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO a FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.account_id;
 IF a.id IS NULL OR a.name<>source.name OR a.type<>source.account_type OR a.is_header<>(source.kind<>'nominal')
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
CREATE TRIGGER chart_company_node_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_chart_company_node
 FOR EACH ROW EXECUTE FUNCTION guard_chart_company_node();
CREATE FUNCTION enforce_chart_posting_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE classification text;
BEGIN
 SELECT posting_classification INTO classification FROM finance_chart_company_node
 WHERE tenant_id=NEW.tenant_id AND account_id=NEW.nominal_id;
 IF classification IS NOT NULL AND NEW.state IN ('pending_approval','active') AND classification<>'ordinary' THEN
  RAISE EXCEPTION 'Posting review required; module-controlled accounts cannot enter the ordinary manual posting workflow' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER adopted_nominal_posting_review BEFORE INSERT OR UPDATE ON finance_general_nominal
 FOR EACH ROW EXECUTE FUNCTION enforce_chart_posting_review();
CREATE FUNCTION validate_chart_company_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE adoption finance_chart_company_adoption%ROWTYPE; template finance_chart_template%ROWTYPE; ident text;
BEGIN
 SELECT * INTO adoption FROM finance_chart_company_adoption WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND template_id=NEW.template_id;
 SELECT * INTO template FROM finance_chart_template WHERE tenant_id=NEW.tenant_id AND id=NEW.template_id;
 IF template.state<>'published' OR template.catalog_key<>adoption.catalog_key
 OR (SELECT count(*) FROM finance_chart_company_node WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND template_id=NEW.template_id) <>
    template.category_count+template.section_count+template.nominal_count
 OR NOT EXISTS(SELECT 1 FROM finance_chart_company_event WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND template_id=NEW.template_id AND action='adopted' AND actor_id=adoption.created_by)
 OR EXISTS(SELECT 1 FROM finance_chart_company_node n JOIN finance_chart_template_node source ON source.tenant_id=n.tenant_id AND source.template_id=n.template_id AND source.node_key=n.node_key
    JOIN account a ON a.tenant_id=n.tenant_id AND a.company_id=n.company_id AND a.id=n.account_id
    LEFT JOIN finance_chart_company_node parent ON parent.tenant_id=n.tenant_id AND parent.company_id=n.company_id AND parent.template_id=n.template_id AND parent.node_key=source.parent_key
    WHERE n.tenant_id=NEW.tenant_id AND n.company_id=NEW.company_id AND n.template_id=NEW.template_id
    AND ((source.parent_key IS NOT NULL AND a.parent_id IS DISTINCT FROM parent.account_id) OR (source.kind='category' AND a.parent_id IS NOT NULL))) THEN
  RAISE EXCEPTION 'Company chart adoption or hierarchy evidence incomplete' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='finance_chart_company_node' THEN
 IF NEW.posting_classification IN ('ordinary','module_controlled') AND NOT EXISTS(
  SELECT 1 FROM finance_chart_company_event e WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.template_id=NEW.template_id AND e.node_key=NEW.node_key AND e.action='classified'
  AND e.actor_id=NEW.reviewed_by AND (e.result->>'review_version')::integer=NEW.review_version
  AND e.result->>'classification'=NEW.posting_classification) THEN
  RAISE EXCEPTION 'Posting classification requires immutable review evidence' USING ERRCODE='23514';
 END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER chart_adoption_complete AFTER INSERT ON finance_chart_company_adoption
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_chart_company_complete();
CREATE CONSTRAINT TRIGGER chart_mapping_complete AFTER INSERT OR UPDATE ON finance_chart_company_node
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_chart_company_complete();
INSERT INTO security_permission_definition(permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity) VALUES
 ('finance.chart_template.adopt','finance','chart_template','adopt','Adopt published definitions as company drafts; does not activate or post.','password',false,true,'restricted'),
 ('finance.chart_template.classify','finance','chart_template','classify','Review adopted nominal manual-posting eligibility.','password',false,true,'restricted');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',15,'company_chart_adoption');
