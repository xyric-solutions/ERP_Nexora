-- Reserve each salary obligation when Banking posts, before external settlement confirmation.
CREATE TABLE hr_payroll_bank_allocation(
 tenant_id text NOT NULL,payment_id text NOT NULL,company_id text NOT NULL,bank_payment_id text NOT NULL,bank_payment_line_id text NOT NULL,
 journal_id text NOT NULL,state text NOT NULL CHECK(state IN('posted','reversed')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),reversed_at timestamptz,
 PRIMARY KEY(tenant_id,bank_payment_line_id),
 FOREIGN KEY(tenant_id,payment_id) REFERENCES hr_payroll_payment(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,bank_payment_id,bank_payment_line_id) REFERENCES bank_payment_line(tenant_id,company_id,payment_id,id),
 FOREIGN KEY(tenant_id,company_id,journal_id) REFERENCES journal_entry(tenant_id,company_id,id)
);
CREATE UNIQUE INDEX salary_bank_allocation_active ON hr_payroll_bank_allocation(tenant_id,payment_id) WHERE state='posted';
ALTER TABLE hr_payroll_bank_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_bank_allocation FORCE ROW LEVEL SECURITY;
CREATE POLICY salary_bank_allocation_tenant ON hr_payroll_bank_allocation USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE FUNCTION guard_salary_bank_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p bank_payment%ROWTYPE;b hr_payroll_payment_batch%ROWTYPE;x hr_payroll_payment%ROWTYPE;l bank_payment_line%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Salary bank allocation history is immutable';END IF;
 SELECT * INTO p FROM bank_payment WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.bank_payment_id;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['state','reversed_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','reversed_at']) OR OLD.state<>'posted' OR NEW.state<>'reversed' OR NEW.reversed_at IS NULL OR p.state<>'reversed' OR EXISTS(SELECT 1 FROM hr_payroll_payment_settlement WHERE tenant_id=NEW.tenant_id AND payment_id=NEW.payment_id) THEN RAISE EXCEPTION 'Salary allocation release requires an actual unconfirmed Bank Payment reversal';END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO x FROM hr_payroll_payment WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_id FOR UPDATE;
 SELECT * INTO b FROM hr_payroll_payment_batch WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=x.batch_id;
 SELECT * INTO l FROM bank_payment_line WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND payment_id=p.id AND id=NEW.bank_payment_line_id;
 IF p.id IS NULL OR p.state<>'posted' OR NEW.state<>'posted' OR NEW.reversed_at IS NOT NULL OR x.id IS NULL OR x.state<>'pending' OR b.id IS NULL OR NOT b.workflow_managed OR b.state<>'released' OR l.id IS NULL OR l.external_reference<>x.id OR l.document_reference IS DISTINCT FROM x.employee_id OR l.amount<>x.amount OR l.nominal_account_id<>b.net_payable_account_id OR p.transaction_currency IS DISTINCT FROM x.currency_code OR l.payment_method NOT IN('bank_transfer','online','standing_order') OR NEW.journal_id IS DISTINCT FROM p.original_journal_entry_id OR NOT EXISTS(SELECT 1 FROM journal_entry WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.journal_id AND status='posted') OR p.posted_at<b.released_at OR p.approval_override_event_id IS NOT NULL OR EXISTS(SELECT 1 FROM employee_user_binding WHERE tenant_id=NEW.tenant_id AND employee_id=x.employee_id AND ended_at IS NULL AND user_id IN(p.created_by,p.submitted_by,p.approved_by,p.posted_by)) THEN RAISE EXCEPTION 'Banking posting must reserve an approved exact independent salary obligation';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER salary_bank_allocation_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_bank_allocation FOR EACH ROW EXECUTE FUNCTION guard_salary_bank_allocation();
CREATE FUNCTION allocate_posted_salary_bank_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state='approved' AND NEW.state='posted' THEN
  INSERT INTO hr_payroll_bank_allocation(tenant_id,payment_id,company_id,bank_payment_id,bank_payment_line_id,journal_id,state)
   SELECT NEW.tenant_id,x.id,NEW.company_id,NEW.id,l.id,NEW.original_journal_entry_id,'posted' FROM bank_payment_line l JOIN hr_payroll_payment x ON x.tenant_id=l.tenant_id AND x.id=l.external_reference JOIN hr_payroll_payment_batch b ON b.tenant_id=x.tenant_id AND b.id=x.batch_id WHERE l.tenant_id=NEW.tenant_id AND l.company_id=NEW.company_id AND l.payment_id=NEW.id AND b.workflow_managed;
 ELSIF OLD.state='posted' AND NEW.state='reversed' THEN
  UPDATE hr_payroll_bank_allocation SET state='reversed',reversed_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND bank_payment_id=NEW.id AND state='posted';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER salary_bank_payment_allocation AFTER UPDATE ON bank_payment FOR EACH ROW EXECUTE FUNCTION allocate_posted_salary_bank_payment();
-- Preserve earlier validated salary settlements when upgrading an existing installation.
-- Unconfirmed historic candidates are checked and reserved on confirmation by the service.
CREATE FUNCTION require_salary_bank_allocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM hr_payroll_bank_allocation WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND payment_id=NEW.payment_id AND bank_payment_id=NEW.bank_payment_id AND bank_payment_line_id=NEW.bank_payment_line_id AND journal_id=NEW.journal_id AND state='posted') THEN RAISE EXCEPTION 'Salary confirmation requires its reserved posted bank obligation';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER salary_settlement_allocation_required BEFORE INSERT ON hr_payroll_payment_settlement FOR EACH ROW EXECUTE FUNCTION require_salary_bank_allocation();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',75,'salary_banking_obligation');
