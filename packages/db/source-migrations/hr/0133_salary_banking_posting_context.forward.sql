CREATE FUNCTION guard_salary_bank_posting_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bank bank_payment%ROWTYPE; accrual hr_payroll_journal_proposal%ROWTYPE; batch hr_payroll_payment_batch%ROWTYPE; period hr_payroll_period%ROWTYPE;
BEGIN
  SELECT * INTO bank FROM bank_payment WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.bank_payment_id;
  SELECT b.* INTO batch FROM hr_payroll_payment x JOIN hr_payroll_payment_batch b ON b.tenant_id=x.tenant_id AND b.id=x.batch_id WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.payment_id;
  SELECT * INTO accrual FROM hr_payroll_journal_proposal WHERE tenant_id=NEW.tenant_id AND id=batch.accrual_proposal_id;
  SELECT * INTO period FROM hr_payroll_period WHERE tenant_id=NEW.tenant_id AND id=batch.period_id;
  IF bank.approved_by IS NULL OR bank.posted_by IS NULL OR bank.created_by=bank.approved_by OR bank.created_by=bank.posted_by OR bank.approved_by=bank.posted_by THEN
    RAISE EXCEPTION 'Salary Banking requires distinct maker, approver and poster';
  END IF;
  IF accrual.id IS NULL OR accrual.state<>'posted' OR period.state NOT IN('posted','paid') OR bank.exchange_rate_value<>1 OR accrual.exchange_rate<>1 OR bank.base_currency IS DISTINCT FROM accrual.base_currency OR bank.transaction_currency IS DISTINCT FROM accrual.currency_code OR bank.posting_date<accrual.posting_date OR bank.posting_date<period.month THEN
    RAISE EXCEPTION 'Salary Banking requires the posted accrual and exact carrying-value parity';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER salary_bank_posting_context BEFORE INSERT ON hr_payroll_bank_allocation
  FOR EACH ROW EXECUTE FUNCTION guard_salary_bank_posting_context();
INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',133,'salary_banking_posting_context');
