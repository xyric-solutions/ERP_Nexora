-- Whole-account cost-centre mappings are frozen in the independently reviewed proposal.
-- Existing amount/source and approval guards remain intact.
ALTER TABLE hr_payroll_journal_line ADD COLUMN dimensions jsonb NOT NULL DEFAULT '{}'::jsonb
 CHECK(jsonb_typeof(dimensions)='object' AND octet_length(dimensions::text)<=4096);
CREATE FUNCTION validate_hr_payroll_journal_dimensions_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j hr_payroll_journal_proposal%ROWTYPE; mappings jsonb;
BEGIN
 SELECT * INTO j FROM hr_payroll_journal_proposal WHERE tenant_id=NEW.tenant_id
 AND id=coalesce(to_jsonb(NEW)->>'proposal_id',to_jsonb(NEW)->>'id');
 IF NOT j.workflow_managed THEN RETURN NULL; END IF;
 mappings:=coalesce(j.source_evidence->'cost_center_mappings','[]'::jsonb);
 IF jsonb_typeof(mappings)<>'array' OR jsonb_array_length(mappings)>1000 THEN RAISE EXCEPTION 'Invalid Payroll dimension mapping evidence'; END IF;
 IF j.source_evidence->>'assembly_version'='payroll_accrual_cost_centres_v1' THEN
  IF jsonb_array_length(mappings)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(mappings) m WHERE jsonb_typeof(m)<>'object' OR jsonb_typeof(m->'account_id') IS DISTINCT FROM 'string' OR jsonb_typeof(m->'cost_center_id') IS DISTINCT FROM 'string' OR (m-ARRAY['account_id','cost_center_id'])<>'{}'::jsonb)
  OR (SELECT count(DISTINCT m->>'account_id') FROM jsonb_array_elements(mappings)m)<>jsonb_array_length(mappings) THEN RAISE EXCEPTION 'Payroll mappings require unique accounts and canonical cost centres'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(mappings)m WHERE NOT EXISTS(SELECT 1 FROM hr_payroll_journal_line l WHERE l.tenant_id=j.tenant_id AND l.proposal_id=j.id AND l.account_id=m->>'account_id') OR NOT EXISTS(SELECT 1 FROM hr_master_record cc WHERE cc.tenant_id=j.tenant_id AND cc.company_id=j.company_id AND cc.id=m->>'cost_center_id' AND cc.master_type='cost_center')) THEN RAISE EXCEPTION 'Payroll mappings must reference source accounts and company cost centres'; END IF;
 ELSE
  IF mappings<>'[]'::jsonb THEN RAISE EXCEPTION 'Dimension mappings require a supported Payroll assembly version'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM hr_payroll_journal_line l WHERE l.tenant_id=j.tenant_id AND l.proposal_id=j.id AND l.dimensions IS DISTINCT FROM coalesce((SELECT jsonb_build_object('cost_center',m->>'cost_center_id') FROM jsonb_array_elements(mappings)m WHERE m->>'account_id'=l.account_id),'{}'::jsonb)) THEN RAISE EXCEPTION 'Payroll line dimensions must match immutable reviewed mappings'; END IF;
 -- Required keys may not be omitted through direct inserts. Rejection remains possible after authority changes.
 IF j.state IN('prepared','accepted','posted') AND EXISTS(SELECT 1 FROM hr_payroll_journal_line l JOIN account a ON a.tenant_id=l.tenant_id AND a.id=l.account_id AND a.company_id=j.company_id WHERE l.tenant_id=j.tenant_id AND l.proposal_id=j.id AND (jsonb_typeof(a.required_dimensions)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(a.required_dimensions)d WHERE d<>'"cost_center"'::jsonb OR nullif(l.dimensions->>'cost_center','') IS NULL))) THEN RAISE EXCEPTION 'Every required Payroll dimension needs a supported reviewed mapping'; END IF;
 -- Validate current authority when preparing/accepting/posting. Rejection must remain possible after deactivation.
 IF j.state IN('prepared','accepted','posted') AND EXISTS(SELECT 1 FROM jsonb_array_elements(mappings)m JOIN account a ON a.tenant_id=j.tenant_id AND a.company_id=j.company_id AND a.id=m->>'account_id' JOIN hr_master_record cc ON cc.tenant_id=j.tenant_id AND cc.company_id=j.company_id AND cc.id=m->>'cost_center_id' WHERE cc.status<>'active' OR NOT(a.required_dimensions ? 'cost_center')) THEN RAISE EXCEPTION 'Payroll cost-centre authority changed before journal decision'; END IF;
 IF j.state='posted' AND EXISTS(
  (SELECT account_id,debit,credit,dimensions FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id EXCEPT ALL SELECT account_id,debit,credit,dimensions FROM journal_line WHERE tenant_id=j.tenant_id AND journal_id=j.external_journal_id)
  UNION ALL (SELECT account_id,debit,credit,dimensions FROM journal_line WHERE tenant_id=j.tenant_id AND journal_id=j.external_journal_id EXCEPT ALL SELECT account_id,debit,credit,dimensions FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id)
 ) THEN RAISE EXCEPTION 'Posted Finance dimensions must match the exact reviewed Payroll lines'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_payroll_journal_dimensions_commit AFTER INSERT OR UPDATE ON hr_payroll_journal_proposal DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_payroll_journal_dimensions_commit();
CREATE CONSTRAINT TRIGGER hr_payroll_journal_line_dimensions_commit AFTER INSERT ON hr_payroll_journal_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_payroll_journal_dimensions_commit();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',128,'payroll_journal_cost_centres');
