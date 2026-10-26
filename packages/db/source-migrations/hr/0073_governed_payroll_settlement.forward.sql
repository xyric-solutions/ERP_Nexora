-- Salary settlement reuses independently posted Banking evidence; it never sends transfers.
ALTER TABLE hr_payroll_payment_batch ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false,
 ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),ADD COLUMN payment_mode text,
 ADD COLUMN accrual_proposal_id text,ADD COLUMN net_payable_account_id text,
 ADD CONSTRAINT payroll_payment_accrual_fk FOREIGN KEY(tenant_id,accrual_proposal_id) REFERENCES hr_payroll_journal_proposal(tenant_id,id),
 ADD CONSTRAINT payroll_payment_net_account_fk FOREIGN KEY(tenant_id,company_id,net_payable_account_id) REFERENCES account(tenant_id,company_id,id),
 ADD CONSTRAINT payroll_payment_governed_mode CHECK(NOT workflow_managed OR (payment_mode='posted_bank_reconciliation_v1' AND accrual_proposal_id IS NOT NULL AND net_payable_account_id IS NOT NULL AND validation_hash IS NOT NULL AND payroll_run_number IS NOT NULL));
CREATE TABLE hr_payroll_payment_settlement(
 tenant_id text NOT NULL,payment_id text NOT NULL,company_id text NOT NULL,batch_id text NOT NULL,result_id text NOT NULL,employee_id text NOT NULL,
 bank_payment_id text NOT NULL,bank_payment_line_id text NOT NULL,journal_id text NOT NULL,accounting_event_id text NOT NULL,
 amount numeric(20,4) NOT NULL CHECK(amount>0),currency_code text NOT NULL CHECK(currency_code ~ '^[A-Z]{3}$'),
 bank_reference text NOT NULL CHECK(length(btrim(bank_reference)) BETWEEN 3 AND 120),confirmed_on date NOT NULL,confirmed_by text NOT NULL,
 evidence_hash text NOT NULL CHECK(evidence_hash ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,payment_id),UNIQUE(tenant_id,result_id),UNIQUE(tenant_id,bank_payment_line_id),UNIQUE(tenant_id,company_id,bank_reference),
 FOREIGN KEY(tenant_id,payment_id) REFERENCES hr_payroll_payment(tenant_id,id),
 FOREIGN KEY(tenant_id,batch_id) REFERENCES hr_payroll_payment_batch(tenant_id,id),
 FOREIGN KEY(tenant_id,result_id) REFERENCES hr_payroll_result(tenant_id,id),
 FOREIGN KEY(tenant_id,employee_id) REFERENCES employee(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,bank_payment_id,bank_payment_line_id) REFERENCES bank_payment_line(tenant_id,company_id,payment_id,id),
 FOREIGN KEY(tenant_id,company_id,journal_id) REFERENCES journal_entry(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,accounting_event_id) REFERENCES accounting_event(tenant_id,id),
 FOREIGN KEY(tenant_id,confirmed_by) REFERENCES security_user_account(tenant_id,id)
);
ALTER TABLE hr_payroll_payment_settlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_payment_settlement FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_payment_settlement_tenant ON hr_payroll_payment_settlement USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_payroll_workspace_event DROP CONSTRAINT hr_payroll_workspace_event_record_type_check;
ALTER TABLE hr_payroll_workspace_event ADD CONSTRAINT hr_payroll_workspace_event_record_type_check CHECK(record_type IN('component','structure','salary','adjustment','loan','run','policy','ot_policy','ot_arrangement','localization','journal','payment'));

CREATE FUNCTION guard_governed_payroll_payment_batch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p hr_payroll_period%ROWTYPE;j hr_payroll_journal_proposal%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.workflow_managed THEN RAISE EXCEPTION 'Salary payment batches cannot be deleted'; END IF;RETURN OLD;END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.workflow_managed IS DISTINCT FROM OLD.workflow_managed THEN RAISE EXCEPTION 'Payment provenance is immutable';END IF;
  IF NOT OLD.workflow_managed THEN RETURN NEW;END IF;
  IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','approved_by','approved_at','released_by','released_at','confirmed_by','confirmed_at','cancelled_by','cancelled_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','approved_by','approved_at','released_by','released_at','confirmed_by','confirmed_at','cancelled_by','cancelled_at']) THEN RAISE EXCEPTION 'Salary payment identity or version is protected';END IF;
  IF NOT((OLD.state='draft' AND NEW.state IN('released','cancelled')) OR(OLD.state='released' AND NEW.state IN('released','confirmed'))) THEN RAISE EXCEPTION 'Unsupported governed salary payment transition';END IF;
  IF OLD.state<>'draft' AND ROW(NEW.approved_by,NEW.approved_at,NEW.released_by,NEW.released_at,NEW.cancelled_by,NEW.cancelled_at) IS DISTINCT FROM ROW(OLD.approved_by,OLD.approved_at,OLD.released_by,OLD.released_at,OLD.cancelled_by,OLD.cancelled_at) THEN RAISE EXCEPTION 'Salary batch approval is immutable';END IF;
  IF OLD.state='released' AND NEW.state='released' AND ROW(NEW.confirmed_by,NEW.confirmed_at) IS DISTINCT FROM ROW(OLD.confirmed_by,OLD.confirmed_at) THEN RAISE EXCEPTION 'Confirmation requires the complete batch';END IF;
 ELSE
  IF NOT NEW.workflow_managed THEN RETURN NEW;END IF;
  IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.approved_by IS NOT NULL OR NEW.confirmed_by IS NOT NULL OR NEW.released_by IS NOT NULL THEN RAISE EXCEPTION 'Salary payment batches start as unapproved drafts';END IF;
 END IF;
 SELECT * INTO p FROM hr_payroll_period WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.period_id;
 SELECT * INTO j FROM hr_payroll_journal_proposal WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.accrual_proposal_id;
 IF p.id IS NULL OR NOT p.workflow_managed OR p.state NOT IN('posted','paid') OR j.id IS NULL OR NOT j.workflow_managed OR j.state<>'posted' OR j.period_id<>p.id OR j.run_number<>p.run_number OR NEW.payroll_run_number<>p.run_number OR NEW.currency_code<>j.currency_code OR NEW.net_payable_account_id IS DISTINCT FROM j.source_evidence->>'net_account_id' OR NOT EXISTS(SELECT 1 FROM journal_entry WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=j.external_journal_id AND status='posted') THEN RAISE EXCEPTION 'Salary payment requires the actual posted accrual';END IF;
 IF NEW.state IN('released','confirmed') AND(NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.released_by IS DISTINCT FROM NEW.approved_by OR NEW.released_at IS NULL OR NEW.approved_by IN(NEW.created_by,p.created_by,p.calculated_by,p.submitted_by) OR EXISTS(SELECT 1 FROM employee_user_binding u JOIN hr_payroll_result r ON r.tenant_id=u.tenant_id AND r.employee_id=u.employee_id WHERE r.tenant_id=NEW.tenant_id AND r.period_id=p.id AND r.run_number=p.run_number AND u.user_id=NEW.approved_by AND u.ended_at IS NULL)) THEN RAISE EXCEPTION 'Independent salary batch approval is required';END IF;
 IF NEW.state='confirmed' AND(NEW.confirmed_by IS NULL OR NEW.confirmed_at IS NULL) THEN RAISE EXCEPTION 'Salary batch confirmation evidence is required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER governed_salary_batch_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_payment_batch FOR EACH ROW EXECUTE FUNCTION guard_governed_payroll_payment_batch();

CREATE FUNCTION guard_governed_salary_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b hr_payroll_payment_batch%ROWTYPE;r hr_payroll_result%ROWTYPE;
BEGIN
 SELECT * INTO b FROM hr_payroll_payment_batch WHERE tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id) AND id=coalesce(NEW.batch_id,OLD.batch_id);
 IF NOT b.workflow_managed THEN RETURN coalesce(NEW,OLD);END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Salary obligations cannot be deleted';END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO r FROM hr_payroll_result WHERE tenant_id=NEW.tenant_id AND company_id=b.company_id AND id=NEW.result_id;
  IF b.state<>'draft' OR NEW.state<>'pending' OR NEW.external_reference IS NOT NULL OR NEW.confirmed_at IS NOT NULL OR r.id IS NULL OR r.period_id<>b.period_id OR r.run_number<>b.payroll_run_number OR NEW.employee_id<>r.employee_id OR NEW.amount<>r.net OR NEW.amount<=0 OR NEW.currency_code IS DISTINCT FROM r.currency_code OR NEW.payroll_result_hash IS DISTINCT FROM r.calculation_hash THEN RAISE EXCEPTION 'Salary obligation must match its exact immutable result';END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['state','external_reference','confirmed_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','external_reference','confirmed_at']) OR OLD.state<>'pending' OR NOT((NEW.state='cancelled' AND b.state='draft' AND NEW.external_reference IS NULL AND NEW.confirmed_at IS NULL) OR(NEW.state='confirmed' AND b.state='released' AND EXISTS(SELECT 1 FROM hr_payroll_payment_settlement s WHERE s.tenant_id=NEW.tenant_id AND s.payment_id=NEW.id AND s.bank_reference=NEW.external_reference))) THEN RAISE EXCEPTION 'Salary payment changes require independent bank evidence';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER governed_salary_payment_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_payment FOR EACH ROW EXECUTE FUNCTION guard_governed_salary_payment();

CREATE FUNCTION guard_salary_settlement_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE x hr_payroll_payment%ROWTYPE;b hr_payroll_payment_batch%ROWTYPE;p hr_payroll_period%ROWTYPE;j hr_payroll_journal_proposal%ROWTYPE;bp bank_payment%ROWTYPE;l bank_payment_line%ROWTYPE;actual journal_line%ROWTYPE;je journal_entry%ROWTYPE;pos integer;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Salary bank evidence is immutable';END IF;
 SELECT * INTO x FROM hr_payroll_payment WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_id;
 SELECT * INTO b FROM hr_payroll_payment_batch WHERE tenant_id=NEW.tenant_id AND id=x.batch_id;
 SELECT * INTO p FROM hr_payroll_period WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=b.period_id;
 SELECT * INTO j FROM hr_payroll_journal_proposal WHERE tenant_id=NEW.tenant_id AND id=b.accrual_proposal_id;
 SELECT * INTO bp FROM bank_payment WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.bank_payment_id FOR UPDATE;
 SELECT * INTO l FROM bank_payment_line WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND payment_id=bp.id AND id=NEW.bank_payment_line_id;
 SELECT * INTO je FROM journal_entry WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=bp.original_journal_entry_id FOR UPDATE;
 SELECT count(*) INTO pos FROM bank_payment_line WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND payment_id=bp.id AND line_number<=l.line_number;
 SELECT * INTO actual FROM journal_line WHERE tenant_id=NEW.tenant_id AND journal_id=je.id AND line_number=pos;
 IF x.id IS NULL OR NOT b.workflow_managed OR b.state<>'released' OR p.state<>'posted' OR x.state<>'pending' OR NEW.batch_id<>b.id OR NEW.company_id<>b.company_id OR NEW.result_id<>x.result_id OR NEW.employee_id<>x.employee_id OR NEW.amount<>x.amount OR NEW.currency_code IS DISTINCT FROM x.currency_code OR NEW.confirmed_by IN(b.created_by,p.created_by,p.calculated_by,p.submitted_by) OR EXISTS(SELECT 1 FROM employee_user_binding u JOIN hr_payroll_result r ON r.tenant_id=u.tenant_id AND r.employee_id=u.employee_id WHERE r.tenant_id=NEW.tenant_id AND r.period_id=p.id AND r.run_number=p.run_number AND u.user_id=NEW.confirmed_by AND u.ended_at IS NULL) THEN RAISE EXCEPTION 'Independent exact salary confirmation is required';END IF;
 IF bp.id IS NULL OR bp.state<>'posted' OR bp.approval_override_event_id IS NOT NULL OR bp.approved_by IS NULL OR bp.posted_by IS NULL OR bp.created_by IN(bp.approved_by,bp.posted_by) OR bp.approved_by=bp.posted_by OR l.id IS NULL OR l.amount<>NEW.amount OR l.external_reference<>x.id OR l.document_reference IS DISTINCT FROM x.employee_id OR l.nominal_account_id<>b.net_payable_account_id OR l.payment_method NOT IN('bank_transfer','online','standing_order') OR bp.transaction_currency<>NEW.currency_code OR je.id IS NULL OR je.status<>'posted' OR je.source_type<>'accounting_event' OR je.source_id IS DISTINCT FROM bp.original_accounting_event_id OR NEW.journal_id<>je.id OR NEW.accounting_event_id IS DISTINCT FROM bp.original_accounting_event_id OR NEW.confirmed_on<bp.posting_date OR NEW.confirmed_on>current_date OR bp.posting_date<j.posting_date OR EXISTS(SELECT 1 FROM hr_loan_disbursement WHERE tenant_id=NEW.tenant_id AND bank_payment_line_id=l.id) THEN RAISE EXCEPTION 'Salary confirmation must reference a matching posted bank payment';END IF;
 IF EXISTS(SELECT 1 FROM employee_user_binding WHERE tenant_id=NEW.tenant_id AND employee_id=x.employee_id AND ended_at IS NULL AND user_id IN(bp.created_by,bp.submitted_by,bp.approved_by,bp.posted_by)) THEN RAISE EXCEPTION 'Salary beneficiary cannot execute their own bank payment';END IF;
 IF actual.account_id IS DISTINCT FROM b.net_payable_account_id OR actual.debit IS DISTINCT FROM NEW.amount OR actual.credit IS DISTINCT FROM 0::numeric OR actual.base_debit IS DISTINCT FROM NEW.amount OR actual.base_credit IS DISTINCT FROM 0::numeric OR actual.currency IS DISTINCT FROM NEW.currency_code OR actual.fx_rate IS DISTINCT FROM 1::numeric OR bp.exchange_rate_value IS DISTINCT FROM 1::numeric OR j.exchange_rate IS DISTINCT FROM 1::numeric OR bp.base_currency IS DISTINCT FROM j.base_currency THEN RAISE EXCEPTION 'Salary settlement must clear the exact accrual carrying value';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER salary_settlement_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_payment_settlement FOR EACH ROW EXECUTE FUNCTION guard_salary_settlement_evidence();

CREATE FUNCTION reconcile_governed_salary_batch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b hr_payroll_payment_batch%ROWTYPE;bid text;
BEGIN
 bid:=CASE WHEN TG_TABLE_NAME='hr_payroll_payment_batch' THEN NEW.id ELSE NEW.batch_id END;
 SELECT * INTO b FROM hr_payroll_payment_batch WHERE tenant_id=NEW.tenant_id AND id=bid;
 IF NOT b.workflow_managed OR b.state='cancelled' THEN RETURN NULL;END IF;
 IF b.payroll_result_count<=0 OR b.payroll_result_count<>(SELECT count(*) FROM hr_payroll_result WHERE tenant_id=b.tenant_id AND company_id=b.company_id AND period_id=b.period_id AND run_number=b.payroll_run_number AND net>0) OR EXISTS(SELECT r.id,r.employee_id,r.net,r.currency_code FROM hr_payroll_result r WHERE r.tenant_id=b.tenant_id AND r.company_id=b.company_id AND r.period_id=b.period_id AND r.run_number=b.payroll_run_number AND r.net>0 EXCEPT ALL SELECT x.result_id,x.employee_id,x.amount,x.currency_code FROM hr_payroll_payment x WHERE x.tenant_id=b.tenant_id AND x.batch_id=b.id) OR EXISTS(SELECT x.result_id,x.employee_id,x.amount,x.currency_code FROM hr_payroll_payment x WHERE x.tenant_id=b.tenant_id AND x.batch_id=b.id EXCEPT ALL SELECT r.id,r.employee_id,r.net,r.currency_code FROM hr_payroll_result r WHERE r.tenant_id=b.tenant_id AND r.company_id=b.company_id AND r.period_id=b.period_id AND r.run_number=b.payroll_run_number AND r.net>0) THEN RAISE EXCEPTION 'Salary payment population must reconcile exactly';END IF;
 IF EXISTS(SELECT 1 FROM hr_payroll_payment x LEFT JOIN hr_payroll_payment_settlement s ON s.tenant_id=x.tenant_id AND s.payment_id=x.id WHERE x.tenant_id=b.tenant_id AND x.batch_id=b.id AND((x.state='confirmed') IS DISTINCT FROM(s.payment_id IS NOT NULL))) OR(b.state='confirmed') IS DISTINCT FROM(NOT EXISTS(SELECT 1 FROM hr_payroll_payment WHERE tenant_id=b.tenant_id AND batch_id=b.id AND state<>'confirmed')) THEN RAISE EXCEPTION 'Salary batch state must match every bank settlement';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER governed_salary_batch_reconciled AFTER INSERT OR UPDATE ON hr_payroll_payment_batch DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_governed_salary_batch();
CREATE CONSTRAINT TRIGGER governed_salary_payment_reconciled AFTER INSERT OR UPDATE ON hr_payroll_payment DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_governed_salary_batch();
CREATE CONSTRAINT TRIGGER governed_salary_proof_reconciled AFTER INSERT ON hr_payroll_payment_settlement DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_governed_salary_batch();

CREATE FUNCTION guard_salary_bound_bank_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='bank_payment' THEN IF OLD.state='posted' AND NEW.state IS DISTINCT FROM OLD.state AND EXISTS(SELECT 1 FROM hr_payroll_payment_settlement WHERE tenant_id=OLD.tenant_id AND bank_payment_id=OLD.id) THEN RAISE EXCEPTION 'Salary payment reversal requires a governed Payroll correction';END IF;END IF;
 IF TG_TABLE_NAME='journal_entry' THEN IF OLD.status='posted' AND NEW.status IS DISTINCT FROM OLD.status AND EXISTS(SELECT 1 FROM hr_payroll_payment_settlement WHERE tenant_id=OLD.tenant_id AND journal_id=OLD.id) THEN RAISE EXCEPTION 'Salary settlement journal reversal requires a governed Payroll correction';END IF;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER salary_bound_bank_guard BEFORE UPDATE ON bank_payment FOR EACH ROW EXECUTE FUNCTION guard_salary_bound_bank_evidence();
CREATE TRIGGER salary_bound_journal_guard BEFORE UPDATE ON journal_entry FOR EACH ROW EXECUTE FUNCTION guard_salary_bound_bank_evidence();

CREATE OR REPLACE FUNCTION protect_governed_payroll_period() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF TG_OP='DELETE' THEN IF OLD.workflow_managed THEN RAISE EXCEPTION 'Governed Payroll periods cannot be deleted'; END IF; RETURN OLD; END IF;
IF OLD.workflow_managed AND OLD.state='posted' AND NEW.state='paid' THEN
 IF NEW.version<>OLD.version+1 OR NEW.paid_by IS NULL OR NEW.paid_at IS NULL OR (to_jsonb(NEW)-ARRAY['state','version','paid_by','paid_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','paid_by','paid_at']) OR NOT EXISTS(SELECT 1 FROM hr_payroll_payment_batch b WHERE b.tenant_id=NEW.tenant_id AND b.company_id=NEW.company_id AND b.period_id=NEW.id AND b.workflow_managed AND b.payroll_run_number=NEW.run_number AND b.state='confirmed' AND b.confirmed_by=NEW.paid_by AND NOT EXISTS(SELECT 1 FROM hr_payroll_result r WHERE r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id AND r.period_id=NEW.id AND r.run_number=NEW.run_number AND r.net>0 AND NOT EXISTS(SELECT 1 FROM hr_payroll_payment_settlement s WHERE s.tenant_id=r.tenant_id AND s.company_id=r.company_id AND s.result_id=r.id AND s.batch_id=b.id))) THEN RAISE EXCEPTION 'Paid Payroll requires complete independently confirmed bank evidence';END IF;
 RETURN NEW;
END IF;
IF OLD.workflow_managed AND ((OLD.state='approved' AND NEW.state='posting_ready') OR(OLD.state='posting_ready' AND NEW.state IN('approved','posted'))) THEN
 IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','posted_by','posted_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','posted_by','posted_at']) OR NOT EXISTS(SELECT 1 FROM hr_payroll_journal_proposal j WHERE j.tenant_id=OLD.tenant_id AND j.company_id=OLD.company_id AND j.period_id=OLD.id AND j.run_number=OLD.run_number AND j.workflow_managed AND j.state=CASE WHEN NEW.state='posting_ready' THEN 'accepted' WHEN NEW.state='approved' THEN 'rejected' ELSE 'posted' END) THEN RAISE EXCEPTION 'Payroll posting transition requires its matching governed Finance proposal'; END IF;
 IF NEW.state='posted' AND(NEW.posted_by IS NULL OR NEW.posted_at IS NULL) THEN RAISE EXCEPTION 'Actual Payroll posting evidence is required'; END IF;
 RETURN NEW;
END IF;
IF OLD.workflow_managed THEN
 IF NEW.version<>OLD.version+1 OR ROW(NEW.id,NEW.tenant_id,NEW.company_id,NEW.attendance_period_id,NEW.policy_id,NEW.month,NEW.created_by,NEW.created_at,NEW.workflow_managed) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.company_id,OLD.attendance_period_id,OLD.policy_id,OLD.month,OLD.created_by,OLD.created_at,OLD.workflow_managed) THEN RAISE EXCEPTION 'Payroll identity or version is protected'; END IF;
 IF NOT ((OLD.state IN('open','calculated') AND NEW.state='calculated' AND NEW.run_number=OLD.run_number+1) OR (OLD.state='calculated' AND NEW.state='under_review' AND NEW.run_number=OLD.run_number) OR (OLD.state='under_review' AND NEW.state IN('calculated','approved') AND NEW.run_number=OLD.run_number)) THEN RAISE EXCEPTION 'Unsupported Payroll lifecycle transition'; END IF;
 IF NEW.state='calculated' AND NEW.run_number>OLD.run_number AND (NEW.calculated_by IS NULL OR NEW.review_hash IS NULL) THEN RAISE EXCEPTION 'Calculation evidence is required'; END IF;
 IF NEW.state='under_review' AND (NEW.submitted_by IS NULL OR NEW.submitted_at IS NULL) THEN RAISE EXCEPTION 'Review submission evidence is required'; END IF;
 IF NEW.state='approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.review_hash IS NULL) THEN RAISE EXCEPTION 'Payroll approval evidence is required'; END IF;
END IF; RETURN NEW; END $$;


INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',73,'governed_payroll_settlement');
