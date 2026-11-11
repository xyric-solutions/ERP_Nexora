-- HR148: Payroll results freeze each employee's cost centre; accrual journals
-- split expense lines by it (assembly payroll_accrual_employee_cost_centres_v2).
-- Additive: existing results have no cost centre and keep producing identical
-- v1 journals. Rollback: drop the v2 branch by restoring the HR071/HR072 and
-- HR128 function bodies, drop hr_payroll_accrual_dimension_lines, then drop
-- hr_payroll_result.cost_center_id once no v2 proposal references it.

-- 1. Frozen cost centre on each employee result ------------------------------
ALTER TABLE hr_payroll_result
    ADD COLUMN cost_center_id text,
    ADD CONSTRAINT hr_payroll_result_cost_center_fk
        FOREIGN KEY (tenant_id, cost_center_id) REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT;
COMMENT ON COLUMN hr_payroll_result.cost_center_id IS
    'Employee assignment cost centre frozen at calculation; splits accrual expense lines (HR148).';

-- 2. Expected accrual lines with dimensions ----------------------------------
-- Expense debits split by the frozen employee cost centre; untagged lines and
-- all credits use the reviewed whole-account mapping, if any.
CREATE FUNCTION hr_payroll_accrual_dimension_lines(t text, c text, p text, n integer, mappings jsonb)
RETURNS TABLE(account_id text, debit numeric, credit numeric, dimensions jsonb) LANGUAGE sql STABLE AS $$
 WITH mapped AS(
  SELECT m->>'account_id' AS account_id, jsonb_build_object('cost_center', m->>'cost_center_id') AS dims
    FROM jsonb_array_elements(coalesce(mappings,'[]'::jsonb)) m
 ), debits AS(
  SELECT i.expense_account_id AS account_id, r.cost_center_id, sum(i.amount) AS amount
    FROM hr_payroll_result r JOIN hr_payroll_result_item i ON i.tenant_id=r.tenant_id AND i.result_id=r.id
   WHERE r.tenant_id=t AND r.company_id=c AND r.period_id=p AND r.run_number=n
     AND i.kind IN('earning','employer_contribution') AND i.amount>0
   GROUP BY i.expense_account_id, r.cost_center_id
 ), credits AS(
  SELECT x.account_id, sum(x.amount) AS amount FROM (
   SELECT i.liability_account_id AS account_id, i.amount
     FROM hr_payroll_result r JOIN hr_payroll_result_item i ON i.tenant_id=r.tenant_id AND i.result_id=r.id
    WHERE r.tenant_id=t AND r.company_id=c AND r.period_id=p AND r.run_number=n
      AND i.kind IN('deduction','employer_contribution') AND i.amount>0
   UNION ALL
   SELECT pol.net_payable_account_id, r.net
     FROM hr_payroll_result r
     JOIN hr_payroll_period per ON per.tenant_id=r.tenant_id AND per.id=r.period_id
     JOIN hr_payroll_policy pol ON pol.tenant_id=per.tenant_id AND pol.company_id=per.company_id AND pol.id=per.policy_id
    WHERE r.tenant_id=t AND r.company_id=c AND r.period_id=p AND r.run_number=n AND r.net>0
  ) x GROUP BY x.account_id
 )
 SELECT d.account_id, d.amount, 0::numeric,
        CASE WHEN d.cost_center_id IS NOT NULL THEN jsonb_build_object('cost_center', d.cost_center_id)
             ELSE coalesce((SELECT dims FROM mapped WHERE mapped.account_id=d.account_id), '{}'::jsonb) END
   FROM debits d WHERE t=current_setting('nexora.tenant_id',true)
 UNION ALL
 SELECT cr.account_id, 0::numeric, cr.amount,
        coalesce((SELECT dims FROM mapped WHERE mapped.account_id=cr.account_id), '{}'::jsonb)
   FROM credits cr WHERE t=current_setting('nexora.tenant_id',true)
$$;

-- 3. Amount reconciliation compares per-account totals ------------------------
-- (split lines of one account sum to the approved result amount; v1 journals
-- have one line per account and side, so behaviour is unchanged for them).
CREATE OR REPLACE FUNCTION validate_hr_payroll_journal_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j hr_payroll_journal_proposal%ROWTYPE;p hr_payroll_period%ROWTYPE;
BEGIN
 SELECT * INTO j FROM hr_payroll_journal_proposal WHERE tenant_id=NEW.tenant_id AND id=coalesce(to_jsonb(NEW)->>'proposal_id',to_jsonb(NEW)->>'id');
 IF NOT j.workflow_managed THEN RETURN NULL; END IF;
 SELECT * INTO p FROM hr_payroll_period WHERE tenant_id=j.tenant_id AND company_id=j.company_id AND id=j.period_id;
 IF p.run_number<>j.run_number OR p.state NOT IN('approved','posting_ready','posted') OR EXISTS(
  (SELECT account_id,debit,credit FROM hr_payroll_accrual_lines(j.tenant_id,j.company_id,j.period_id,j.run_number)
   EXCEPT ALL SELECT account_id,sum(debit),sum(credit) FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id GROUP BY account_id,(debit>0))
  UNION ALL (SELECT account_id,sum(debit),sum(credit) FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id GROUP BY account_id,(debit>0)
   EXCEPT ALL SELECT account_id,debit,credit FROM hr_payroll_accrual_lines(j.tenant_id,j.company_id,j.period_id,j.run_number))
 ) THEN RAISE EXCEPTION 'Payroll journal must reconcile to every exact approved result account and amount'; END IF;
 IF j.state='accepted' AND p.state<>'posting_ready' THEN RAISE EXCEPTION 'Finance acceptance and Payroll posting readiness must commit together'; END IF;
 IF j.state='posted' THEN
  IF p.state<>'posted' OR NOT EXISTS(SELECT 1 FROM accounting_event e JOIN journal_entry je ON je.tenant_id=e.tenant_id AND je.source_type='accounting_event' AND je.source_id=e.id JOIN hr_payroll_finance_approval_binding b ON b.tenant_id=j.tenant_id AND b.company_id=j.company_id AND b.proposal_id=j.id AND b.finance_journal_id=je.id WHERE e.tenant_id=j.tenant_id AND je.company_id=j.company_id AND e.id=j.accounting_event_id AND e.source_type='hr.payroll' AND e.source_id=p.id AND e.event_type='payroll.accrued' AND e.state='posted' AND je.id=j.external_journal_id AND je.status='posted' AND je.period_id=j.financial_period_id AND je.entry_number=j.external_entry_number AND je.posting_date=j.posting_date) THEN RAISE EXCEPTION 'Payroll posting requires its actual Finance journal and immutable acceptance binding'; END IF;
  IF EXISTS((SELECT account_id,debit,credit FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id EXCEPT ALL SELECT account_id,debit,credit FROM journal_line WHERE tenant_id=j.tenant_id AND journal_id=j.external_journal_id) UNION ALL(SELECT account_id,debit,credit FROM journal_line WHERE tenant_id=j.tenant_id AND journal_id=j.external_journal_id EXCEPT ALL SELECT account_id,debit,credit FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id)) THEN RAISE EXCEPTION 'Posted Finance lines do not reconcile to reviewed Payroll lines'; END IF;
 END IF;
 RETURN NULL;
END $$;

-- 4. Dimension rules: v1 unchanged; v2 lines must equal the frozen split -----
CREATE OR REPLACE FUNCTION validate_hr_payroll_journal_dimensions_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j hr_payroll_journal_proposal%ROWTYPE; mappings jsonb; version text;
BEGIN
 SELECT * INTO j FROM hr_payroll_journal_proposal WHERE tenant_id=NEW.tenant_id
 AND id=coalesce(to_jsonb(NEW)->>'proposal_id',to_jsonb(NEW)->>'id');
 IF NOT j.workflow_managed THEN RETURN NULL; END IF;
 mappings:=coalesce(j.source_evidence->'cost_center_mappings','[]'::jsonb);
 version:=j.source_evidence->>'assembly_version';
 IF jsonb_typeof(mappings)<>'array' OR jsonb_array_length(mappings)>1000 THEN RAISE EXCEPTION 'Invalid Payroll dimension mapping evidence'; END IF;
 IF version IN('payroll_accrual_cost_centres_v1','payroll_accrual_employee_cost_centres_v2') THEN
  IF (version='payroll_accrual_cost_centres_v1' AND jsonb_array_length(mappings)=0) OR EXISTS(SELECT 1 FROM jsonb_array_elements(mappings) m WHERE jsonb_typeof(m)<>'object' OR jsonb_typeof(m->'account_id') IS DISTINCT FROM 'string' OR jsonb_typeof(m->'cost_center_id') IS DISTINCT FROM 'string' OR (m-ARRAY['account_id','cost_center_id'])<>'{}'::jsonb)
  OR (SELECT count(DISTINCT m->>'account_id') FROM jsonb_array_elements(mappings)m)<>jsonb_array_length(mappings) THEN RAISE EXCEPTION 'Payroll mappings require unique accounts and canonical cost centres'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(mappings)m WHERE NOT EXISTS(SELECT 1 FROM hr_payroll_journal_line l WHERE l.tenant_id=j.tenant_id AND l.proposal_id=j.id AND l.account_id=m->>'account_id') OR NOT EXISTS(SELECT 1 FROM hr_master_record cc WHERE cc.tenant_id=j.tenant_id AND cc.company_id=j.company_id AND cc.id=m->>'cost_center_id' AND cc.master_type='cost_center')) THEN RAISE EXCEPTION 'Payroll mappings must reference source accounts and company cost centres'; END IF;
 ELSE
  IF mappings<>'[]'::jsonb THEN RAISE EXCEPTION 'Dimension mappings require a supported Payroll assembly version'; END IF;
 END IF;
 IF version='payroll_accrual_employee_cost_centres_v2' THEN
  -- Every line (account, amount, cost centre) must equal the frozen employee split exactly.
  IF EXISTS(
   (SELECT account_id,debit,credit,dimensions FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id
    EXCEPT ALL SELECT account_id,debit,credit,dimensions FROM hr_payroll_accrual_dimension_lines(j.tenant_id,j.company_id,j.period_id,j.run_number,mappings))
   UNION ALL (SELECT account_id,debit,credit,dimensions FROM hr_payroll_accrual_dimension_lines(j.tenant_id,j.company_id,j.period_id,j.run_number,mappings)
    EXCEPT ALL SELECT account_id,debit,credit,dimensions FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id)
  ) THEN RAISE EXCEPTION 'Payroll journal lines must equal the frozen employee cost-centre split'; END IF;
  IF j.state IN('prepared','accepted','posted') AND EXISTS(SELECT 1 FROM hr_payroll_journal_line l WHERE l.tenant_id=j.tenant_id AND l.proposal_id=j.id AND l.dimensions ? 'cost_center' AND NOT EXISTS(SELECT 1 FROM hr_master_record cc WHERE cc.tenant_id=j.tenant_id AND cc.company_id=j.company_id AND cc.id=l.dimensions->>'cost_center' AND cc.master_type='cost_center' AND cc.status='active')) THEN RAISE EXCEPTION 'Payroll cost-centre authority changed before journal decision'; END IF;
 ELSIF EXISTS(SELECT 1 FROM hr_payroll_journal_line l WHERE l.tenant_id=j.tenant_id AND l.proposal_id=j.id AND l.dimensions IS DISTINCT FROM coalesce((SELECT jsonb_build_object('cost_center',m->>'cost_center_id') FROM jsonb_array_elements(mappings)m WHERE m->>'account_id'=l.account_id),'{}'::jsonb)) THEN RAISE EXCEPTION 'Payroll line dimensions must match immutable reviewed mappings'; END IF;
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

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',148,'payroll_employee_cost_centres');
