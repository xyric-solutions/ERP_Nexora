-- Keep PL/pgSQL record names distinct from SQL aliases (variable_conflict=error).
CREATE OR REPLACE FUNCTION validate_chart_company_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE template_record finance_chart_template%ROWTYPE;
 source_record finance_chart_template_node%ROWTYPE; account_record account%ROWTYPE; parent_identity text;
BEGIN
 IF TG_TABLE_NAME='finance_chart_company_adoption' THEN
  SELECT * INTO template_record FROM finance_chart_template WHERE tenant_id=NEW.tenant_id AND id=NEW.template_id;
  IF template_record.state<>'published' OR template_record.catalog_key<>NEW.catalog_key
   OR (SELECT count(*) FROM finance_chart_company_node WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND template_id=NEW.template_id)<>
      template_record.category_count+template_record.section_count+template_record.nominal_count
   OR NOT EXISTS(SELECT 1 FROM finance_chart_company_event WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND template_id=NEW.template_id AND action='adopted' AND actor_id=NEW.created_by)
   OR EXISTS(SELECT 1 FROM finance_chart_company_node n JOIN finance_chart_template_node source ON source.tenant_id=n.tenant_id AND source.template_id=n.template_id AND source.node_key=n.node_key
     JOIN finance_general_nominal g ON g.tenant_id=n.tenant_id AND g.company_id=n.company_id AND g.nominal_id=n.account_id
     WHERE n.tenant_id=NEW.tenant_id AND n.company_id=NEW.company_id AND n.template_id=NEW.template_id AND source.kind='nominal'
     AND (g.currency<>NEW.currency OR NOT EXISTS(SELECT 1 FROM finance_general_nominal_event e WHERE e.tenant_id=g.tenant_id AND e.nominal_id=g.nominal_id AND e.event_type='created'))) THEN
   RAISE EXCEPTION 'Company chart adoption or lifecycle evidence incomplete' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO source_record FROM finance_chart_template_node WHERE tenant_id=NEW.tenant_id AND template_id=NEW.template_id AND node_key=NEW.node_key;
 IF NEW.account_id IS NOT NULL THEN
  SELECT * INTO account_record FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.account_id;
  IF source_record.parent_key IS NOT NULL THEN
   SELECT account_id INTO parent_identity FROM finance_chart_company_node WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND template_id=NEW.template_id AND node_key=source_record.parent_key;
   IF parent_identity IS NULL OR account_record.parent_id IS DISTINCT FROM parent_identity THEN
    RAISE EXCEPTION 'Company chart mapping parent disagrees with Excel hierarchy' USING ERRCODE='23514';
   END IF;
  ELSIF account_record.parent_id IS NOT NULL THEN
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
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',17,'chart_validation_record_names');
