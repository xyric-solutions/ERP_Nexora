CREATE TABLE hr_loan_disbursement(
 tenant_id text NOT NULL,company_id text NOT NULL,loan_id text NOT NULL,payment_id text NOT NULL,bank_payment_line_id text NOT NULL,
 journal_id text NOT NULL,accounting_event_id text NOT NULL,receivable_account_id text NOT NULL,
 amount numeric(20,4) NOT NULL CHECK(amount>0),currency_code text NOT NULL,
 bank_reference text NOT NULL CHECK(length(btrim(bank_reference)) BETWEEN 3 AND 128),confirmed_on date NOT NULL,
 confirmed_by text NOT NULL,confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,loan_id),UNIQUE(tenant_id,bank_payment_line_id),UNIQUE(tenant_id,company_id,bank_reference),
 FOREIGN KEY(tenant_id,loan_id,company_id) REFERENCES hr_employee_loan(tenant_id,id,company_id),
 FOREIGN KEY(tenant_id,company_id,payment_id,bank_payment_line_id) REFERENCES bank_payment_line(tenant_id,company_id,payment_id,id),
 FOREIGN KEY(tenant_id,company_id,journal_id) REFERENCES journal_entry(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,accounting_event_id) REFERENCES accounting_event(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,receivable_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,confirmed_by) REFERENCES security_user_account(tenant_id,id)
);
ALTER TABLE hr_loan_disbursement ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_loan_disbursement FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_loan_disbursement_tenant ON hr_loan_disbursement USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE FUNCTION guard_hr_loan_disbursement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE loan hr_employee_loan%ROWTYPE;p bank_payment%ROWTYPE;line bank_payment_line%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Loan disbursement evidence is immutable'; END IF;
 SELECT * INTO loan FROM hr_employee_loan WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.loan_id FOR UPDATE;
 SELECT * INTO p FROM bank_payment WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.payment_id FOR UPDATE;
 SELECT * INTO line FROM bank_payment_line WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND payment_id=NEW.payment_id AND id=NEW.bank_payment_line_id;
 IF loan.id IS NULL OR NOT loan.workflow_managed OR loan.state<>'approved' OR NEW.confirmed_by IN(loan.created_by,loan.submitted_by) OR EXISTS(SELECT 1 FROM employee_user_binding WHERE tenant_id=NEW.tenant_id AND employee_id=loan.employee_id AND user_id=NEW.confirmed_by AND ended_at IS NULL)
  OR p.id IS NULL OR p.state<>'posted' OR line.id IS NULL OR line.amount<>loan.principal OR NEW.amount<>loan.principal OR NEW.currency_code<>loan.currency_code OR p.transaction_currency<>loan.currency_code
  OR line.external_reference<>loan.reference OR line.document_reference IS DISTINCT FROM loan.employee_id OR NEW.receivable_account_id<>line.nominal_account_id
  OR NEW.journal_id IS DISTINCT FROM p.original_journal_entry_id OR NEW.accounting_event_id IS DISTINCT FROM p.original_accounting_event_id
  OR NEW.confirmed_on< p.posting_date OR NEW.confirmed_on>current_date OR NEW.confirmed_on>=(loan.start_month+interval '1 month')::date
  OR NOT EXISTS(SELECT 1 FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.receivable_account_id AND type='asset' AND status='active' AND NOT is_header)
  OR EXISTS(SELECT 1 FROM hr_payroll_period WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND month>=loan.start_month AND state<>'open')
 THEN RAISE EXCEPTION 'Disbursement requires matching posted payment and independent bank confirmation before Payroll calculation'; END IF;
 IF (SELECT count(*)<>loan.instalment_count OR sum(amount)<>loan.principal OR NOT bool_and(state='scheduled') FROM hr_loan_instalment WHERE tenant_id=NEW.tenant_id AND loan_id=NEW.loan_id) THEN RAISE EXCEPTION 'Loan schedule does not reconcile'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_loan_disbursement_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_loan_disbursement FOR EACH ROW EXECUTE FUNCTION guard_hr_loan_disbursement();
CREATE FUNCTION guard_funded_loan_bank_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.state IS DISTINCT FROM OLD.state AND EXISTS(SELECT 1 FROM hr_loan_disbursement WHERE tenant_id=OLD.tenant_id AND company_id=OLD.company_id AND payment_id=OLD.id) THEN RAISE EXCEPTION 'A funded employee loan requires a governed loan reversal before reversing its Bank Payment'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_payment_funded_loan_guard BEFORE UPDATE ON bank_payment FOR EACH ROW EXECUTE FUNCTION guard_funded_loan_bank_payment();
ALTER TABLE hr_loan_instalment ADD CONSTRAINT hr_loan_instalment_consumed_result_fk FOREIGN KEY(tenant_id,consumed_result_id) REFERENCES hr_payroll_result(tenant_id,id);
CREATE FUNCTION guard_hr_loan_instalment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l hr_employee_loan%ROWTYPE;
BEGIN
 SELECT * INTO l FROM hr_employee_loan WHERE tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id) AND id=coalesce(NEW.loan_id,OLD.loan_id);
 IF NOT l.workflow_managed THEN RETURN coalesce(NEW,OLD); END IF;
 IF TG_OP='INSERT' THEN
  IF l.state<>'approved' OR NEW.state<>'scheduled' OR NEW.consumed_result_id IS NOT NULL OR NEW.due_month<l.start_month OR NEW.due_month>=(l.start_month+(l.instalment_count||' months')::interval)::date OR NEW.due_month<>date_trunc('month',NEW.due_month)::date THEN RAISE EXCEPTION 'Only approved scheduled instalments may be created'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Loan schedules cannot be deleted'; END IF;
 IF OLD.state<>'scheduled' OR NEW.state<>'consumed' OR l.state<>'active' OR (to_jsonb(NEW)-ARRAY['state','consumed_result_id']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','consumed_result_id']) OR NOT EXISTS(
  SELECT 1 FROM hr_payroll_result r JOIN hr_payroll_period p ON p.tenant_id=r.tenant_id AND p.id=r.period_id JOIN hr_payroll_result_item ri ON ri.tenant_id=r.tenant_id AND ri.result_id=r.id
  WHERE r.tenant_id=NEW.tenant_id AND r.company_id=l.company_id AND r.employee_id=l.employee_id AND r.id=NEW.consumed_result_id AND p.month=NEW.due_month AND p.state='approved' AND p.run_number=r.run_number
   AND r.execution_evidence->'loans' @> jsonb_build_array(jsonb_build_object('id',NEW.id,'loan_id',l.id,'amount',NEW.amount::text,'loan_version',l.version))
   AND ri.source='loan:'||NEW.id AND ri.kind='deduction' AND ri.amount=NEW.amount AND ri.component_id=l.component_id
   AND ri.liability_account_id=(SELECT receivable_account_id FROM hr_loan_disbursement WHERE tenant_id=l.tenant_id AND loan_id=l.id)
 ) THEN RAISE EXCEPTION 'Loan recovery requires its exact current approved Payroll result and receivable line'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_loan_instalment_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_loan_instalment FOR EACH ROW EXECUTE FUNCTION guard_hr_loan_instalment();
-- The existing generic Payroll lifecycle function is extended below without weakening salary/adjustment guards.

CREATE OR REPLACE FUNCTION protect_governed_payroll_terms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE successor hr_salary_assignment%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.workflow_managed OR (TG_TABLE_NAME='hr_salary_assignment' AND to_jsonb(OLD)->>'closed_by_successor_id' IS NOT NULL) THEN RAISE EXCEPTION 'Governed payroll records cannot be deleted'; END IF; RETURN OLD; END IF;
 IF TG_TABLE_NAME='hr_salary_assignment' THEN
  IF OLD.closed_by_successor_id IS NOT NULL THEN RAISE EXCEPTION 'Closed salary history is immutable'; END IF;
  IF NEW.closed_by_successor_id IS NOT NULL THEN
   SELECT * INTO successor FROM hr_salary_assignment WHERE tenant_id=NEW.tenant_id AND id=NEW.closed_by_successor_id;
   IF successor.id IS NULL OR successor.supersedes_id IS DISTINCT FROM OLD.id OR successor.company_id IS DISTINCT FROM OLD.company_id OR successor.employee_id IS DISTINCT FROM OLD.employee_id
    OR successor.predecessor_version<>OLD.version OR successor.state<>'submitted' OR OLD.state NOT IN('approved','effective') OR NEW.state IS DISTINCT FROM OLD.state
    OR successor.effective_from<=OLD.effective_from OR (OLD.effective_to IS NOT NULL AND OLD.effective_to<successor.effective_from)
    OR NEW.effective_to IS DISTINCT FROM successor.effective_from-1 OR NEW.version<>OLD.version+1
    OR (to_jsonb(NEW)-ARRAY['effective_to','closed_by_successor_id','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['effective_to','closed_by_successor_id','version'])
   THEN RAISE EXCEPTION 'Salary closure must match a submitted reviewed successor'; END IF;
   IF EXISTS(SELECT 1 FROM hr_payroll_period p WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id AND (p.month+interval '1 month'-interval '1 day')::date>=successor.effective_from AND p.state<>'open') THEN RAISE EXCEPTION 'A calculated Payroll period prevents this salary closure'; END IF;
   RETURN NEW;
  END IF;
 END IF;

 IF TG_TABLE_NAME='hr_payroll_adjustment' AND to_jsonb(OLD)->>'state'='approved' AND to_jsonb(NEW)->>'state'='consumed' THEN
  IF NEW.version<>OLD.version+1 OR NEW.consumed_result_id IS NULL OR (to_jsonb(NEW)-ARRAY['version','state','consumed_result_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','state','consumed_result_id']) OR NOT EXISTS(
   SELECT 1 FROM hr_payroll_result r JOIN hr_payroll_period p ON p.tenant_id=r.tenant_id AND p.id=r.period_id
    WHERE r.tenant_id=OLD.tenant_id AND r.id=NEW.consumed_result_id AND r.company_id=OLD.company_id AND r.employee_id=OLD.employee_id AND p.month=OLD.effective_month AND p.state IN('under_review','approved') AND p.run_number=r.run_number
     AND r.execution_evidence->'adjustments' @> jsonb_build_array(jsonb_build_object('id',OLD.id,'amount',OLD.amount::text,'version',OLD.version))
  ) THEN RAISE EXCEPTION 'Adjustment consumption requires its reviewed current Payroll result'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='hr_payroll_adjustment' AND to_jsonb(OLD)->>'state'='consumed' THEN RAISE EXCEPTION 'Consumed Payroll adjustments are immutable'; END IF;
 IF TG_TABLE_NAME='hr_employee_loan' AND OLD.workflow_managed AND OLD.state IN('approved','active','settled') THEN
  IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version']) THEN RAISE EXCEPTION 'Funded loan terms and approval history are immutable'; END IF;
  IF OLD.state='approved' AND NEW.state='active' THEN
   IF NOT EXISTS(SELECT 1 FROM hr_loan_disbursement WHERE tenant_id=OLD.tenant_id AND company_id=OLD.company_id AND loan_id=OLD.id) THEN RAISE EXCEPTION 'Loan activation requires independently confirmed disbursement'; END IF;
  ELSIF OLD.state='active' AND NEW.state='settled' THEN
   IF NOT EXISTS(SELECT 1 FROM hr_loan_disbursement WHERE tenant_id=OLD.tenant_id AND loan_id=OLD.id) OR (SELECT count(*)<>OLD.instalment_count OR sum(amount)<>OLD.principal OR NOT bool_and(state='consumed') FROM hr_loan_instalment WHERE tenant_id=OLD.tenant_id AND loan_id=OLD.id) THEN RAISE EXCEPTION 'Settlement requires complete exact approved Payroll recovery'; END IF;
  ELSE RAISE EXCEPTION 'Unsupported funded loan lifecycle transition'; END IF;
  RETURN NEW;
 END IF;

 IF OLD.workflow_managed THEN
  IF NEW.workflow_managed IS DISTINCT FROM true OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Payroll version must advance exactly once'; END IF;
  IF (to_jsonb(NEW)-ARRAY['version','status','state','updated_at','submitted_by','submitted_at','approved_by','approved_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','status','state','updated_at','submitted_by','submitted_at','approved_by','approved_at']) THEN RAISE EXCEPTION 'Payroll terms are immutable; create a successor'; END IF;
  IF TG_TABLE_NAME IN('hr_salary_assignment','hr_payroll_adjustment','hr_employee_loan') THEN
   IF NOT ((OLD.state='draft' AND NEW.state IN('submitted','cancelled')) OR (OLD.state='submitted' AND NEW.state IN('approved','rejected','cancelled'))) THEN RAISE EXCEPTION 'Invalid governed payroll lifecycle transition'; END IF;
   IF NEW.state='approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.submitted_by IS NULL) THEN RAISE EXCEPTION 'Approval evidence is required'; END IF;
  END IF;
 END IF; RETURN NEW;
END $$;




INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',65,'governed_loan_recovery');
