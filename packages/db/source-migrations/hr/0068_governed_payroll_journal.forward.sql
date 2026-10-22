ALTER TABLE hr_payroll_journal_proposal
 ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false,ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 ADD COLUMN run_number integer,ADD COLUMN posting_date date,ADD COLUMN currency_code text,ADD COLUMN base_currency text,ADD COLUMN exchange_rate_id text,ADD COLUMN exchange_rate numeric(38,18),
 ADD COLUMN source_results_hash text CHECK(source_results_hash ~ '^[a-f0-9]{64}$'),ADD COLUMN source_evidence jsonb,ADD COLUMN accounting_event_id text,ADD COLUMN financial_period_id text,
 ADD COLUMN rejected_by text,ADD COLUMN rejected_at timestamptz,
 ADD CONSTRAINT hr_journal_finance_event_fk FOREIGN KEY(tenant_id,accounting_event_id) REFERENCES accounting_event(tenant_id,id),
 ADD CONSTRAINT hr_journal_finance_entry_fk FOREIGN KEY(tenant_id,company_id,external_journal_id) REFERENCES journal_entry(tenant_id,company_id,id),
 ADD CONSTRAINT hr_journal_finance_period_fk FOREIGN KEY(tenant_id,company_id,financial_period_id) REFERENCES financial_period(tenant_id,company_id,id),
 ADD CONSTRAINT hr_journal_rate_fk FOREIGN KEY(tenant_id,exchange_rate_id) REFERENCES currency_rate(tenant_id,id);
ALTER TABLE hr_payroll_journal_proposal DROP CONSTRAINT hr_payroll_journal_proposal_tenant_id_period_id_key;
CREATE UNIQUE INDEX hr_payroll_journal_active ON hr_payroll_journal_proposal(tenant_id,period_id) WHERE state<>'rejected';
CREATE UNIQUE INDEX hr_payroll_journal_revision ON hr_payroll_journal_proposal(tenant_id,period_id,revision);
ALTER TABLE hr_payroll_workspace_event DROP CONSTRAINT hr_payroll_workspace_event_record_type_check;
ALTER TABLE hr_payroll_workspace_event ADD CONSTRAINT hr_payroll_workspace_event_record_type_check CHECK(record_type IN('component','structure','salary','adjustment','loan','run','policy','ot_policy','ot_arrangement','localization','journal'));

CREATE FUNCTION hr_payroll_accrual_lines(t text,c text,p text,n integer) RETURNS TABLE(account_id text,debit numeric,credit numeric) LANGUAGE sql STABLE AS $$
 WITH raw AS(
 SELECT i.expense_account_id as account_id,i.amount as amount,'debit' as side FROM hr_payroll_result r JOIN hr_payroll_result_item i ON i.tenant_id=r.tenant_id AND i.result_id=r.id WHERE r.tenant_id=t AND r.company_id=c AND r.period_id=p AND r.run_number=n AND i.kind IN('earning','employer_contribution')
 UNION ALL SELECT i.liability_account_id,i.amount,'credit' FROM hr_payroll_result r JOIN hr_payroll_result_item i ON i.tenant_id=r.tenant_id AND i.result_id=r.id WHERE r.tenant_id=t AND r.company_id=c AND r.period_id=p AND r.run_number=n AND i.kind IN('deduction','employer_contribution')
 UNION ALL SELECT pol.net_payable_account_id,r.net,'credit' FROM hr_payroll_result r JOIN hr_payroll_period per ON per.tenant_id=r.tenant_id AND per.id=r.period_id JOIN hr_payroll_policy pol ON pol.tenant_id=per.tenant_id AND pol.company_id=per.company_id AND pol.id=per.policy_id WHERE r.tenant_id=t AND r.company_id=c AND r.period_id=p AND r.run_number=n
 ) SELECT raw.account_id,CASE WHEN side='debit' THEN sum(amount) ELSE 0 END,CASE WHEN side='credit' THEN sum(amount) ELSE 0 END FROM raw WHERE t=current_setting('nexora.tenant_id',true) AND amount>0 GROUP BY raw.account_id,side
$$;
CREATE FUNCTION guard_hr_payroll_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p hr_payroll_period%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.workflow_managed THEN RAISE EXCEPTION 'Governed Payroll journal history is immutable'; END IF; RETURN OLD; END IF;
 IF TG_OP='INSERT' THEN
  IF NOT NEW.workflow_managed THEN RETURN NEW; END IF;
  SELECT * INTO p FROM hr_payroll_period WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.period_id;
  IF p.id IS NULL OR NOT p.workflow_managed OR p.state<>'approved' OR NEW.run_number IS DISTINCT FROM p.run_number OR NEW.state<>'prepared' OR NEW.version<>1 OR NEW.posting_date IS NULL OR date_trunc('month',NEW.posting_date)::date<>p.month OR NEW.posting_date>current_date OR NEW.currency_code IS NULL OR NEW.base_currency IS NULL OR NEW.exchange_rate IS NULL OR NEW.exchange_rate<=0 OR NEW.source_results_hash IS NULL OR NEW.source_evidence IS NULL OR NEW.accepted_by IS NOT NULL OR NEW.posted_by IS NOT NULL OR NEW.accounting_event_id IS NOT NULL THEN RAISE EXCEPTION 'Journal preparation requires the governed approved Payroll run and frozen Finance terms'; END IF;
  RETURN NEW;
 END IF;
 IF NOT OLD.workflow_managed THEN RETURN NEW; END IF;
 IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['version','state','accepted_by','accepted_at','rejected_by','rejected_at','posted_by','posted_at','external_journal_id','external_entry_number','accounting_event_id','financial_period_id']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['version','state','accepted_by','accepted_at','rejected_by','rejected_at','posted_by','posted_at','external_journal_id','external_entry_number','accounting_event_id','financial_period_id']) THEN RAISE EXCEPTION 'Payroll journal source and Finance terms are immutable'; END IF;
 IF OLD.state='prepared' AND NEW.state='accepted' THEN
  IF NEW.accepted_by IS NULL OR NEW.accepted_by=OLD.created_by OR NEW.accepted_at IS NULL THEN RAISE EXCEPTION 'Independent Finance acceptance is required'; END IF;
 ELSIF OLD.state IN('prepared','accepted') AND NEW.state='rejected' THEN
  IF NEW.rejected_by IS NULL OR NEW.rejected_by=OLD.created_by OR NEW.rejected_at IS NULL THEN RAISE EXCEPTION 'Independent Finance rejection is required'; END IF;
 ELSIF OLD.state='accepted' AND NEW.state='posted' THEN
  IF NEW.accepted_by IS DISTINCT FROM OLD.accepted_by OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR NEW.posted_by IS NULL OR NEW.posted_by IN(OLD.created_by,OLD.accepted_by) OR NEW.posted_at IS NULL OR NEW.external_journal_id IS NULL OR NEW.external_entry_number IS NULL OR NEW.accounting_event_id IS NULL OR NEW.financial_period_id IS NULL THEN RAISE EXCEPTION 'Independent Finance posting and journal evidence are required'; END IF;
 ELSE RAISE EXCEPTION 'Unsupported Payroll journal transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_payroll_journal_governed BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_journal_proposal FOR EACH ROW EXECUTE FUNCTION guard_hr_payroll_journal();
CREATE FUNCTION validate_hr_payroll_journal_commit() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF p.state<>'posted' OR NOT EXISTS(SELECT 1 FROM accounting_event e JOIN journal_entry je ON je.tenant_id=e.tenant_id AND je.source_type='accounting_event' AND je.source_id=e.id JOIN hr_payroll_finance_approval_binding b ON b.tenant_id=j.tenant_id AND b.company_id=j.company_id AND b.proposal_id=j.id AND b.finance_journal_id=je.id WHERE e.tenant_id=j.tenant_id AND e.company_id=j.company_id AND e.id=j.accounting_event_id AND e.source_type='hr.payroll' AND e.source_id=p.id AND e.event_type='payroll.accrued' AND e.state='posted' AND je.id=j.external_journal_id AND je.status='posted' AND je.period_id=j.financial_period_id AND je.entry_number=j.external_entry_number AND je.posting_date=j.posting_date) THEN RAISE EXCEPTION 'Payroll posting requires its actual Finance journal and immutable acceptance binding'; END IF;
  IF EXISTS((SELECT account_id,debit,credit FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id EXCEPT SELECT account_id,debit,credit FROM journal_line WHERE tenant_id=j.tenant_id AND journal_id=j.external_journal_id) UNION ALL(SELECT account_id,debit,credit FROM journal_line WHERE tenant_id=j.tenant_id AND journal_id=j.external_journal_id EXCEPT SELECT account_id,debit,credit FROM hr_payroll_journal_line WHERE tenant_id=j.tenant_id AND proposal_id=j.id)) THEN RAISE EXCEPTION 'Posted Finance lines do not reconcile to reviewed Payroll lines'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_payroll_journal_commit AFTER INSERT OR UPDATE ON hr_payroll_journal_proposal DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_payroll_journal_commit();
CREATE CONSTRAINT TRIGGER hr_payroll_journal_lines_commit AFTER INSERT ON hr_payroll_journal_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_payroll_journal_commit();
CREATE FUNCTION guard_hr_bound_finance_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='posted' AND NEW.status IS DISTINCT FROM OLD.status AND EXISTS(SELECT 1 FROM hr_payroll_finance_approval_binding WHERE tenant_id=OLD.tenant_id AND finance_journal_id=OLD.id) THEN RAISE EXCEPTION 'Payroll Finance reversal requires a governed Payroll correction workflow'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER journal_entry_payroll_bound BEFORE UPDATE ON journal_entry FOR EACH ROW EXECUTE FUNCTION guard_hr_bound_finance_journal();
-- Existing period lifecycle is extended below, keeping previous calculation/review guards.

CREATE OR REPLACE FUNCTION protect_governed_payroll_period() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF TG_OP='DELETE' THEN IF OLD.workflow_managed AND ((OLD.state='approved' AND NEW.state='posting_ready') OR(OLD.state='posting_ready' AND NEW.state IN('approved','posted'))) THEN
 IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','posted_by','posted_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','posted_by','posted_at']) OR NOT EXISTS(SELECT 1 FROM hr_payroll_journal_proposal j WHERE j.tenant_id=OLD.tenant_id AND j.company_id=OLD.company_id AND j.period_id=OLD.id AND j.run_number=OLD.run_number AND j.workflow_managed AND j.state=CASE WHEN NEW.state='posting_ready' THEN 'accepted' WHEN NEW.state='approved' THEN 'rejected' ELSE 'posted' END) THEN RAISE EXCEPTION 'Payroll posting transition requires its matching governed Finance proposal'; END IF;
 IF NEW.state='posted' AND(NEW.posted_by IS NULL OR NEW.posted_at IS NULL) THEN RAISE EXCEPTION 'Actual Payroll posting evidence is required'; END IF;
 RETURN NEW;
END IF;
IF OLD.workflow_managed THEN RAISE EXCEPTION 'Governed Payroll periods cannot be deleted'; END IF; RETURN OLD; END IF;
IF OLD.workflow_managed THEN
 IF NEW.version<>OLD.version+1 OR ROW(NEW.id,NEW.tenant_id,NEW.company_id,NEW.attendance_period_id,NEW.policy_id,NEW.month,NEW.created_by,NEW.created_at,NEW.workflow_managed) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.company_id,OLD.attendance_period_id,OLD.policy_id,OLD.month,OLD.created_by,OLD.created_at,OLD.workflow_managed) THEN RAISE EXCEPTION 'Payroll identity or version is protected'; END IF;
 IF NOT ((OLD.state IN('open','calculated') AND NEW.state='calculated' AND NEW.run_number=OLD.run_number+1) OR (OLD.state='calculated' AND NEW.state='under_review' AND NEW.run_number=OLD.run_number) OR (OLD.state='under_review' AND NEW.state IN('calculated','approved') AND NEW.run_number=OLD.run_number)) THEN RAISE EXCEPTION 'Unsupported Payroll lifecycle transition'; END IF;
 IF NEW.state='calculated' AND NEW.run_number>OLD.run_number AND (NEW.calculated_by IS NULL OR NEW.review_hash IS NULL) THEN RAISE EXCEPTION 'Calculation evidence is required'; END IF;
 IF NEW.state='under_review' AND (NEW.submitted_by IS NULL OR NEW.submitted_at IS NULL) THEN RAISE EXCEPTION 'Review submission evidence is required'; END IF;
 IF NEW.state='approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.review_hash IS NULL) THEN RAISE EXCEPTION 'Payroll approval evidence is required'; END IF;
END IF; RETURN NEW; END $$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',68,'governed_payroll_journal');
