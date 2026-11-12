-- Audited company-level nominal edits preserve codes, source catalog and posting ownership.
ALTER TABLE finance_coa_master_change ADD COLUMN section_id text,
 ADD FOREIGN KEY(tenant_id,company_id,section_id) REFERENCES account(tenant_id,company_id,id);

CREATE FUNCTION coa_nominal_edit_proof(t text,c text,a text,e text,v bigint,s text,n text,p text)
 RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM finance_coa_master_change m
 WHERE m.tenant_id=t AND m.company_id=c AND m.account_id=a AND m.id=e
 AND m.record_version=v AND m.resulting_state=s AND m.account_name=n AND m.section_id=p);
$$;

CREATE FUNCTION guard_coa_nominal_reassignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN RETURN NEW; END IF;
 IF NEW.is_header OR NOT OLD.managed_general_nominal OR OLD.managed_bank_nominal
 OR NEW.coa_change_id IS NOT DISTINCT FROM OLD.coa_change_id
 OR NOT coa_nominal_edit_proof(NEW.tenant_id,NEW.company_id,NEW.id,NEW.coa_change_id,NEW.coa_version,NEW.status,NEW.name,NEW.parent_id)
 OR NOT EXISTS(SELECT 1 FROM finance_coa_master_change m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.coa_change_id
   AND m.action='updated' AND m.profile_state IN ('draft','active','inactive')
   AND m.before_state->>'id'=OLD.id AND m.before_state->>'code'=OLD.code
   AND m.before_state->>'parent_id' IS NOT DISTINCT FROM OLD.parent_id)
 OR NOT EXISTS(SELECT 1 FROM finance_general_nominal_policy p
   JOIN account s ON s.tenant_id=p.tenant_id AND s.company_id=p.company_id AND s.id=p.section_id
   JOIN account c ON c.tenant_id=s.tenant_id AND c.company_id=s.company_id AND c.id=s.parent_id AND c.id=p.category_id
   WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id AND p.section_id=NEW.parent_id
   AND p.status='active' AND s.is_header AND c.is_header AND c.parent_id IS NULL
   AND s.status='active' AND c.status='active' AND s.type=NEW.type AND c.type=NEW.type)
 THEN RAISE EXCEPTION 'Nominal Section change requires an audited same-company, same-type ordinary hierarchy' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM journal_line WHERE tenant_id=NEW.tenant_id AND account_id=NEW.id)
 OR EXISTS(SELECT 1 FROM bank_payment_line WHERE tenant_id=NEW.tenant_id AND nominal_account_id=NEW.id)
 OR EXISTS(SELECT 1 FROM bank_receipt_line WHERE tenant_id=NEW.tenant_id AND nominal_account_id=NEW.id)
 OR EXISTS(SELECT 1 FROM manual_journal_line WHERE tenant_id=NEW.tenant_id AND account_id=NEW.id)
 THEN RAISE EXCEPTION 'Used nominal hierarchy cannot change' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coa_nominal_reassignment BEFORE UPDATE OF parent_id ON account
 FOR EACH ROW EXECUTE FUNCTION guard_coa_nominal_reassignment();


CREATE OR REPLACE FUNCTION public.protect_general_account_identity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF TG_TABLE_NAME='account' AND TG_OP='UPDATE' AND NEW.coa_change_id IS DISTINCT FROM OLD.coa_change_id THEN
  IF (to_jsonb(NEW)-ARRAY['coa_change_id','coa_version','name','description','status','parent_id'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['coa_change_id','coa_version','name','description','status','parent_id'])
   OR NEW.coa_version<=OLD.coa_version
   OR NOT coa_master_proof(NEW.tenant_id,NEW.company_id,NEW.id,NEW.coa_change_id,NEW.coa_version,NEW.status,NEW.name)
  THEN RAISE EXCEPTION 'CoA identity or direct change evidence is invalid' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN
  IF OLD.managed_general_nominal THEN RAISE EXCEPTION 'General nominal cannot be deleted' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF NEW.managed_general_nominal IS DISTINCT FROM OLD.managed_general_nominal THEN
  RAISE EXCEPTION 'General nominal classification is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.managed_general_nominal THEN
  IF (NEW.id,NEW.tenant_id,NEW.company_id,NEW.code,NEW.parent_id,NEW.type,NEW.is_header,NEW.manual_posting_allowed,
      NEW.reconciliation_required,NEW.is_system_account,NEW.created_at)
  IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.company_id,OLD.code,OLD.parent_id,OLD.type,OLD.is_header,OLD.manual_posting_allowed,
      OLD.reconciliation_required,OLD.is_system_account,OLD.created_at) THEN
   RAISE EXCEPTION 'General nominal accounting identity is immutable' USING ERRCODE='23514';
  END IF;
  IF (NEW.name,NEW.description,NEW.required_dimensions) IS DISTINCT FROM (OLD.name,OLD.description,OLD.required_dimensions)
    AND NOT EXISTS(SELECT 1 FROM finance_general_nominal g WHERE g.tenant_id=OLD.tenant_id AND g.nominal_id=OLD.id AND g.state='draft') THEN
   RAISE EXCEPTION 'Only draft general nominal fields may be edited' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.protect_finance_nominal_identity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF TG_TABLE_NAME='account' AND TG_OP='UPDATE' AND NEW.coa_change_id IS DISTINCT FROM OLD.coa_change_id THEN
  IF (to_jsonb(NEW)-ARRAY['coa_change_id','coa_version','name','description','status','parent_id'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['coa_change_id','coa_version','name','description','status','parent_id'])
   OR NEW.coa_version<=OLD.coa_version
   OR NOT coa_master_proof(NEW.tenant_id,NEW.company_id,NEW.id,NEW.coa_change_id,NEW.coa_version,NEW.status,NEW.name)
  THEN RAISE EXCEPTION 'CoA identity or direct change evidence is invalid' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
    IF TG_TABLE_NAME='bank_account' THEN
        IF NEW.identity_mode IS DISTINCT FROM OLD.identity_mode
           OR (OLD.identity_mode='nominal_only' AND NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
            RAISE EXCEPTION 'Bank nominal identity mode and mapping are immutable' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP='DELETE' THEN
        IF OLD.managed_bank_nominal THEN
            RAISE EXCEPTION 'Managed bank nominals cannot be deleted' USING ERRCODE='23514';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.managed_bank_nominal IS DISTINCT FROM OLD.managed_bank_nominal THEN
        RAISE EXCEPTION 'Managed bank nominal classification is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.managed_bank_nominal THEN
        IF (NEW.id,NEW.tenant_id,NEW.company_id,NEW.code,NEW.parent_id,NEW.type,NEW.is_header,
            NEW.manual_posting_allowed,NEW.reconciliation_required,NEW.is_system_account,NEW.created_at)
           IS DISTINCT FROM
           (OLD.id,OLD.tenant_id,OLD.company_id,OLD.code,OLD.parent_id,OLD.type,OLD.is_header,
            OLD.manual_posting_allowed,OLD.reconciliation_required,OLD.is_system_account,OLD.created_at) THEN
            RAISE EXCEPTION 'Managed bank nominal accounting identity is immutable' USING ERRCODE='23514';
        END IF;
        IF (NEW.name,NEW.description,NEW.required_dimensions) IS DISTINCT FROM (OLD.name,OLD.description,OLD.required_dimensions)
           AND NOT EXISTS (SELECT 1 FROM bank_account WHERE tenant_id=OLD.tenant_id
                           AND account_id=OLD.id AND identity_mode='nominal_only' AND status='draft') THEN
            RAISE EXCEPTION 'Only draft nominal business fields may be edited' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION bind_coa_master_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a account%ROWTYPE; g finance_general_nominal%ROWTYPE; b bank_account%ROWTYPE; v bigint; marker text; s text; cur text;
BEGIN
 SELECT * INTO a FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.account_id;
 IF a.is_header THEN v:=a.coa_version;marker:=a.coa_change_id;s:=a.status;cur:=null;
 ELSIF a.managed_general_nominal THEN SELECT * INTO g FROM finance_general_nominal WHERE tenant_id=a.tenant_id AND nominal_id=a.id;v:=g.row_version;marker:=g.coa_change_id;s:=g.state;cur:=g.currency;
 ELSE SELECT * INTO b FROM bank_account WHERE tenant_id=a.tenant_id AND account_id=a.id AND identity_mode='nominal_only';v:=b.row_version;marker:=b.coa_change_id;s:=b.status;cur:=b.currency; END IF;
 IF (NEW.section_id IS NOT NULL AND a.parent_id IS DISTINCT FROM NEW.section_id) OR a.id IS NULL OR v IS DISTINCT FROM NEW.record_version OR marker IS DISTINCT FROM NEW.id OR s<>NEW.profile_state OR a.status<>NEW.resulting_state OR a.name<>NEW.account_name OR cur IS DISTINCT FROM NEW.currency
 OR NOT EXISTS(SELECT 1 FROM platform_admin_audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.id AND e.actor_id=NEW.actor_id AND e.entity_id=NEW.account_id AND e.action='finance.coa_master.'||NEW.action)
 THEN RAISE EXCEPTION 'Direct CoA change requires exact immutable audit and current record binding' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION guard_chart_company_node() RETURNS trigger LANGUAGE plpgsql AS $$
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

CREATE OR REPLACE FUNCTION validate_chart_company_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE adoption finance_chart_company_adoption%ROWTYPE; template finance_chart_template%ROWTYPE;
 source finance_chart_template_node%ROWTYPE; a account%ROWTYPE; parent_id text;
BEGIN
 IF TG_TABLE_NAME='finance_chart_company_adoption' THEN
  SELECT * INTO template FROM finance_chart_template WHERE tenant_id=NEW.tenant_id AND id=NEW.template_id;
  IF template.state<>'published' OR template.catalog_key<>NEW.catalog_key
   OR (SELECT count(*) FROM finance_chart_company_node WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND template_id=NEW.template_id)<>
      template.category_count+template.section_count+template.nominal_count
   OR NOT EXISTS(SELECT 1 FROM finance_chart_company_event WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND template_id=NEW.template_id AND action='adopted' AND actor_id=NEW.created_by)
   OR EXISTS(SELECT 1 FROM finance_chart_company_node n JOIN finance_chart_template_node catalog ON catalog.tenant_id=n.tenant_id AND catalog.template_id=n.template_id AND catalog.node_key=n.node_key
     JOIN finance_general_nominal g ON g.tenant_id=n.tenant_id AND g.company_id=n.company_id AND g.nominal_id=n.account_id
     WHERE n.tenant_id=NEW.tenant_id AND n.company_id=NEW.company_id AND n.template_id=NEW.template_id AND catalog.kind='nominal'
     AND (g.currency<>NEW.currency OR NOT EXISTS(SELECT 1 FROM finance_general_nominal_event e WHERE e.tenant_id=g.tenant_id AND e.nominal_id=g.nominal_id AND e.event_type='created'))) THEN
   RAISE EXCEPTION 'Company chart adoption or lifecycle evidence incomplete' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO source FROM finance_chart_template_node WHERE tenant_id=NEW.tenant_id AND template_id=NEW.template_id AND node_key=NEW.node_key;
 IF NEW.account_id IS NOT NULL THEN
  SELECT * INTO a FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.account_id;
  IF source.parent_key IS NOT NULL THEN
   SELECT account_id INTO parent_id FROM finance_chart_company_node WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND template_id=NEW.template_id AND node_key=source.parent_key;
   IF (parent_id IS NULL OR a.parent_id IS DISTINCT FROM parent_id) AND NOT (TG_OP='UPDATE' AND source.kind='nominal' AND a.managed_general_nominal AND coa_nominal_edit_proof(a.tenant_id,a.company_id,a.id,a.coa_change_id,a.coa_version,a.status,a.name,a.parent_id)) THEN
    RAISE EXCEPTION 'Company chart mapping parent disagrees with Excel hierarchy' USING ERRCODE='23514';
   END IF;
  ELSIF a.parent_id IS NOT NULL THEN
   RAISE EXCEPTION 'Company chart category must be a root header' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.posting_classification IN ('ordinary','module_controlled') AND NOT EXISTS(
  SELECT 1 FROM finance_chart_company_event e WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.template_id=NEW.template_id AND e.node_key=NEW.node_key AND e.action='classified'
   AND e.actor_id=NEW.reviewed_by AND (e.result->>'review_version')::integer=NEW.review_version AND e.result->>'classification'=NEW.posting_classification) THEN
  RAISE EXCEPTION 'Posting classification requires immutable review evidence' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',34,'audited_nominal_section_edits');
