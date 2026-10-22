CREATE OR REPLACE FUNCTION validate_hr_payroll_journal_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j hr_payroll_journal_proposal%ROWTYPE;p hr_payroll_period%ROWTYPE;
BEGIN
 SELECT * INTO j FROM hr_payroll_journal_proposal WHERE tenant_id=NEW.tenant_id AND id=coalesce(to_jsonb(NEW)->>'proposal_id',to_jsonb(NEW)->>'id');
 IF NOT j.workflow_managed THEN RETURN NULL; END IF;
 SELECT * INTO p FROM hr_payroll_period WHERE tenant_id=j.tenant_id AND company_id=j.company_id AND id=j.period_id;
 IF p.run_number<>j.run_number OR p.state NOT IN('approved','posting_ready','posted') OR EXISTS(
  (SELECT account_id,debit,credit FROM hr_payroll_accrual_lines(j.tenant_id,j.company_id,j.period_id,j.run_number) EXCEPT SELECT account_id,debit,credit FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id)
  UNION ALL (SELECT account_id,debit,credit FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id EXCEPT SELECT account_id,debit,credit FROM hr_payroll_accrual_lines(j.tenant_id,j.company_id,j.period_id,j.run_number))
 ) THEN RAISE EXCEPTION 'Payroll journal must reconcile to every exact approved result account and amount'; END IF;
 IF j.state='accepted' AND p.state<>'posting_ready' THEN RAISE EXCEPTION 'Finance acceptance and Payroll posting readiness must commit together'; END IF;
 IF j.state='posted' THEN
  IF p.state<>'posted' OR NOT EXISTS(SELECT 1 FROM accounting_event e JOIN journal_entry je ON je.tenant_id=e.tenant_id AND je.source_type='accounting_event' AND je.source_id=e.id JOIN hr_payroll_finance_approval_binding b ON b.tenant_id=j.tenant_id AND b.company_id=j.company_id AND b.proposal_id=j.id AND b.finance_journal_id=je.id WHERE e.tenant_id=j.tenant_id AND je.company_id=j.company_id AND e.id=j.accounting_event_id AND e.source_type='hr.payroll' AND e.source_id=p.id AND e.event_type='payroll.accrued' AND e.state='posted' AND je.id=j.external_journal_id AND je.status='posted' AND je.period_id=j.financial_period_id AND je.entry_number=j.external_entry_number AND je.posting_date=j.posting_date) THEN RAISE EXCEPTION 'Payroll posting requires its actual Finance journal and immutable acceptance binding'; END IF;
  IF EXISTS((SELECT account_id,debit,credit FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id EXCEPT SELECT account_id,debit,credit FROM journal_line WHERE tenant_id=j.tenant_id AND journal_id=j.external_journal_id) UNION ALL(SELECT account_id,debit,credit FROM journal_line WHERE tenant_id=j.tenant_id AND journal_id=j.external_journal_id EXCEPT SELECT account_id,debit,credit FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id)) THEN RAISE EXCEPTION 'Posted Finance lines do not reconcile to reviewed Payroll lines'; END IF;
 END IF;
 RETURN NULL;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',71,'payroll_journal_finance_reconciliation');
