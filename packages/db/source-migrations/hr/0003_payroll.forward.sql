DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM nexora_schema_migration WHERE module_name='hr' AND version=2) THEN
        RAISE EXCEPTION 'HR payroll requires HR migration 2';
    END IF;
END $$;

CREATE TABLE hr_payroll_policy (
    id text NOT NULL, tenant_id text NOT NULL, company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type='company'),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    money_scale smallint NOT NULL DEFAULT 2 CHECK (money_scale BETWEEN 0 AND 4),
    net_payable_account_id text NOT NULL CHECK (char_length(btrim(net_payable_account_id)) BETWEEN 1 AND 120),
    payment_clearing_account_id text CHECK (payment_clearing_account_id IS NULL OR char_length(btrim(payment_clearing_account_id)) BETWEEN 1 AND 120),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,id,company_id),
    UNIQUE (tenant_id,company_id,currency_code),
    FOREIGN KEY (tenant_id,company_id,company_type) REFERENCES organization_unit (tenant_id,id,type) ON DELETE RESTRICT
);

CREATE TABLE hr_pay_component (
    id text NOT NULL, tenant_id text NOT NULL, company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type='company'),
    code text NOT NULL CHECK (code ~ '^[A-Za-z][A-Za-z0-9_]{0,39}$'),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    kind text NOT NULL CHECK (kind IN ('earning','deduction')),
    method text NOT NULL CHECK (method IN ('fixed','formula')),
    formula text CHECK ((method='fixed' AND formula IS NULL) OR (method='formula' AND char_length(btrim(formula)) BETWEEN 1 AND 500)),
    taxable boolean NOT NULL DEFAULT false, prorated boolean NOT NULL DEFAULT false,
    expense_account_id text, liability_account_id text,
    position integer NOT NULL DEFAULT 1 CHECK (position > 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,id,company_id), UNIQUE (tenant_id,company_id,code),
    FOREIGN KEY (tenant_id,company_id,company_type) REFERENCES organization_unit (tenant_id,id,type) ON DELETE RESTRICT,
    CHECK ((kind='earning' AND expense_account_id IS NOT NULL) OR (kind='deduction' AND liability_account_id IS NOT NULL))
);
CREATE INDEX idx_hr_pay_component_company ON hr_pay_component (tenant_id,company_id,status,position);

CREATE TABLE hr_salary_structure (
    id text NOT NULL, tenant_id text NOT NULL, company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type='company'),
    code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,31}$'),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    description text NOT NULL DEFAULT '' CHECK (char_length(description)<=1000),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,id,company_id), UNIQUE (tenant_id,company_id,code),
    FOREIGN KEY (tenant_id,company_id,company_type) REFERENCES organization_unit (tenant_id,id,type) ON DELETE RESTRICT
);

CREATE TABLE hr_salary_structure_item (
    tenant_id text NOT NULL, structure_id text NOT NULL, component_id text NOT NULL,
    amount numeric(20,4), formula_override text,
    position integer NOT NULL CHECK (position > 0),
    PRIMARY KEY (tenant_id,structure_id,component_id), UNIQUE (tenant_id,structure_id,position),
    FOREIGN KEY (tenant_id,structure_id) REFERENCES hr_salary_structure (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,component_id) REFERENCES hr_pay_component (tenant_id,id) ON DELETE RESTRICT,
    CHECK ((amount IS NULL) <> (formula_override IS NULL)),
    CHECK (amount IS NULL OR amount >= 0),
    CHECK (formula_override IS NULL OR char_length(btrim(formula_override)) BETWEEN 1 AND 500)
);

CREATE TABLE hr_salary_assignment (
    id text NOT NULL, tenant_id text NOT NULL, company_id text NOT NULL, employee_id text NOT NULL,
    structure_id text NOT NULL, currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    effective_from date NOT NULL, effective_to date,
    state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','approved','effective','superseded','cancelled')),
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
    created_by text NOT NULL, submitted_by text, approved_by text,
    created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz, approved_at timestamptz,
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,id,company_id),
    FOREIGN KEY (tenant_id,employee_id) REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,structure_id,company_id) REFERENCES hr_salary_structure (tenant_id,id,company_id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    EXCLUDE USING gist (tenant_id WITH =, employee_id WITH =, daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') WITH &&)
        WHERE (state IN ('approved','effective'))
);
CREATE INDEX idx_hr_salary_assignment_effective ON hr_salary_assignment (tenant_id,company_id,employee_id,effective_from DESC);

CREATE TABLE hr_payroll_adjustment (
    id text NOT NULL, tenant_id text NOT NULL, company_id text NOT NULL, employee_id text NOT NULL,
    component_id text NOT NULL, effective_month date NOT NULL CHECK (effective_month=date_trunc('month',effective_month)::date),
    amount numeric(20,4) NOT NULL CHECK (amount >= 0), reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
    state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','approved','rejected','consumed')),
    created_by text NOT NULL, approved_by text, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz,
    consumed_result_id text,
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,id,company_id),
    FOREIGN KEY (tenant_id,employee_id) REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,component_id,company_id) REFERENCES hr_pay_component (tenant_id,id,company_id) ON DELETE RESTRICT
);

CREATE TABLE hr_employee_loan (
    id text NOT NULL, tenant_id text NOT NULL, company_id text NOT NULL, employee_id text NOT NULL,
    reference text NOT NULL, principal numeric(20,4) NOT NULL CHECK (principal > 0),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    start_month date NOT NULL CHECK (start_month=date_trunc('month',start_month)::date),
    instalment_count integer NOT NULL CHECK (instalment_count > 0 AND instalment_count <= 600),
    component_id text NOT NULL, state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','approved','rejected','active','settled','cancelled')),
    created_by text NOT NULL, approved_by text, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz,
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,id,company_id), UNIQUE (tenant_id,company_id,reference),
    FOREIGN KEY (tenant_id,employee_id) REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,component_id,company_id) REFERENCES hr_pay_component (tenant_id,id,company_id) ON DELETE RESTRICT
);
CREATE TABLE hr_loan_instalment (
    id text NOT NULL, tenant_id text NOT NULL, loan_id text NOT NULL, due_month date NOT NULL,
    amount numeric(20,4) NOT NULL CHECK (amount > 0), state text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','consumed','waived')),
    consumed_result_id text,
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,loan_id,due_month),
    FOREIGN KEY (tenant_id,loan_id) REFERENCES hr_employee_loan (tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE hr_payroll_period (
    id text NOT NULL, tenant_id text NOT NULL, company_id text NOT NULL, attendance_period_id text NOT NULL,
    policy_id text NOT NULL, month date NOT NULL CHECK (month=date_trunc('month',month)::date),
    state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','processing','calculated','under_review','approved','posting_ready','posted','paid','closed')),
    source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'), run_number integer NOT NULL DEFAULT 0 CHECK (run_number >= 0),
    created_by text NOT NULL, reviewed_by text, approved_by text, posted_by text, paid_by text, closed_by text,
    created_at timestamptz NOT NULL DEFAULT now(), calculated_at timestamptz, reviewed_at timestamptz, approved_at timestamptz,
    posted_at timestamptz, paid_at timestamptz, closed_at timestamptz,
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,id,company_id), UNIQUE (tenant_id,company_id,month), UNIQUE (tenant_id,attendance_period_id),
    FOREIGN KEY (tenant_id,attendance_period_id,company_id) REFERENCES hr_attendance_period (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,policy_id,company_id) REFERENCES hr_payroll_policy (tenant_id,id,company_id) ON DELETE RESTRICT
);

CREATE TABLE hr_payroll_result (
    id text NOT NULL, tenant_id text NOT NULL, company_id text NOT NULL, period_id text NOT NULL,
    employee_id text NOT NULL, salary_assignment_id text NOT NULL, run_number integer NOT NULL CHECK (run_number > 0), currency_code text NOT NULL,
    gross numeric(20,4) NOT NULL CHECK (gross >= 0), deductions numeric(20,4) NOT NULL CHECK (deductions >= 0),
    net numeric(20,4) NOT NULL, attendance_source_hash text NOT NULL, calculation_hash text NOT NULL CHECK (calculation_hash ~ '^[0-9a-f]{64}$'),
    warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings)='array'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,id,company_id), UNIQUE (tenant_id,period_id,run_number,employee_id),
    FOREIGN KEY (tenant_id,period_id,company_id) REFERENCES hr_payroll_period (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,employee_id) REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,salary_assignment_id,company_id) REFERENCES hr_salary_assignment (tenant_id,id,company_id) ON DELETE RESTRICT
);
CREATE TABLE hr_payroll_result_item (
    id text NOT NULL, tenant_id text NOT NULL, result_id text NOT NULL, component_id text NOT NULL,
    component_code text NOT NULL, component_name text NOT NULL, kind text NOT NULL CHECK (kind IN ('earning','deduction')),
    amount numeric(20,4) NOT NULL CHECK (amount >= 0), expense_account_id text, liability_account_id text,
    source text NOT NULL, position integer NOT NULL CHECK (position > 0),
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,result_id,position),
    FOREIGN KEY (tenant_id,result_id) REFERENCES hr_payroll_result (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,component_id) REFERENCES hr_pay_component (tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX idx_hr_payroll_result_period ON hr_payroll_result (tenant_id,company_id,period_id,employee_id);

CREATE TABLE hr_payroll_journal_proposal (
    id text NOT NULL, tenant_id text NOT NULL, company_id text NOT NULL, period_id text NOT NULL,
    state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','accepted','posted','rejected')),
    external_journal_id text, external_entry_number text, created_by text NOT NULL, accepted_by text, posted_by text,
    created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz, posted_at timestamptz,
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,period_id),
    FOREIGN KEY (tenant_id,period_id,company_id) REFERENCES hr_payroll_period (tenant_id,id,company_id) ON DELETE RESTRICT
);
CREATE TABLE hr_payroll_journal_line (
    id text NOT NULL, tenant_id text NOT NULL, proposal_id text NOT NULL, account_id text NOT NULL,
    debit numeric(20,4) NOT NULL DEFAULT 0 CHECK (debit >= 0), credit numeric(20,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    position integer NOT NULL CHECK (position > 0),
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,proposal_id,position),
    FOREIGN KEY (tenant_id,proposal_id) REFERENCES hr_payroll_journal_proposal (tenant_id,id) ON DELETE RESTRICT,
    CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE TABLE hr_payroll_payment_batch (
    id text NOT NULL, tenant_id text NOT NULL, company_id text NOT NULL, period_id text NOT NULL,
    reference text NOT NULL, state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','released','confirmed','failed')),
    created_by text NOT NULL, released_by text, confirmed_by text, created_at timestamptz NOT NULL DEFAULT now(),
    released_at timestamptz, confirmed_at timestamptz,
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,company_id,reference), UNIQUE (tenant_id,period_id),
    FOREIGN KEY (tenant_id,period_id,company_id) REFERENCES hr_payroll_period (tenant_id,id,company_id) ON DELETE RESTRICT
);
CREATE TABLE hr_payroll_payment (
    id text NOT NULL, tenant_id text NOT NULL, batch_id text NOT NULL, result_id text NOT NULL,
    employee_id text NOT NULL, amount numeric(20,4) NOT NULL CHECK (amount >= 0),
    external_reference text, state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','confirmed','failed')),
    confirmed_at timestamptz,
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,batch_id,result_id),
    FOREIGN KEY (tenant_id,batch_id) REFERENCES hr_payroll_payment_batch (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,result_id) REFERENCES hr_payroll_result (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,employee_id) REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    CHECK ((state='confirmed' AND external_reference IS NOT NULL AND confirmed_at IS NOT NULL) OR state<>'confirmed')
);

CREATE FUNCTION validate_payroll_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposal text; line_count integer; debit_total numeric(20,4); credit_total numeric(20,4);
BEGIN
    proposal := COALESCE(to_jsonb(NEW)->>'proposal_id',to_jsonb(NEW)->>'id');
    SELECT count(*),COALESCE(sum(debit),0),COALESCE(sum(credit),0) INTO line_count,debit_total,credit_total
      FROM hr_payroll_journal_line WHERE tenant_id=NEW.tenant_id AND proposal_id=proposal;
    IF line_count < 2 OR debit_total <> credit_total THEN
        RAISE EXCEPTION 'payroll journal proposal must contain at least two balanced lines';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_payroll_journal_proposal_balanced AFTER INSERT OR UPDATE ON hr_payroll_journal_proposal
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_payroll_journal_balance();
CREATE CONSTRAINT TRIGGER hr_payroll_journal_line_balanced AFTER INSERT OR UPDATE ON hr_payroll_journal_line
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_payroll_journal_balance();

CREATE FUNCTION validate_payroll_payment_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.state='confirmed' AND (NOT EXISTS (SELECT 1 FROM hr_payroll_payment WHERE tenant_id=NEW.tenant_id AND batch_id=NEW.id)
       OR EXISTS (SELECT 1 FROM hr_payroll_payment WHERE tenant_id=NEW.tenant_id AND batch_id=NEW.id AND state<>'confirmed')) THEN
        RAISE EXCEPTION 'payment batch confirmation requires every payment reference';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_payroll_payment_batch_confirmed AFTER INSERT OR UPDATE ON hr_payroll_payment_batch
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_payroll_payment_confirmation();

CREATE FUNCTION validate_hr03_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assignment_company text;
BEGIN
    IF to_jsonb(NEW) ? 'employee_id' THEN
        SELECT company_id INTO assignment_company FROM employee_assignment
         WHERE tenant_id=NEW.tenant_id AND employee_id=(to_jsonb(NEW)->>'employee_id')
           AND effective_from <= COALESCE((to_jsonb(NEW)->>'effective_month')::date,(to_jsonb(NEW)->>'start_month')::date,(to_jsonb(NEW)->>'effective_from')::date,CURRENT_DATE)
           AND (effective_to IS NULL OR effective_to >= COALESCE((to_jsonb(NEW)->>'effective_month')::date,(to_jsonb(NEW)->>'start_month')::date,(to_jsonb(NEW)->>'effective_from')::date,CURRENT_DATE))
         ORDER BY effective_from DESC LIMIT 1;
        IF assignment_company IS DISTINCT FROM (to_jsonb(NEW)->>'company_id') THEN
            RAISE EXCEPTION 'payroll employee is unavailable in the selected company';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_salary_assignment_scope BEFORE INSERT OR UPDATE ON hr_salary_assignment FOR EACH ROW EXECUTE FUNCTION validate_hr03_scope();
CREATE TRIGGER hr_payroll_adjustment_scope BEFORE INSERT OR UPDATE ON hr_payroll_adjustment FOR EACH ROW EXECUTE FUNCTION validate_hr03_scope();
CREATE TRIGGER hr_employee_loan_scope BEFORE INSERT OR UPDATE ON hr_employee_loan FOR EACH ROW EXECUTE FUNCTION validate_hr03_scope();

CREATE FUNCTION reject_payroll_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'payroll snapshots are immutable'; END $$;
CREATE TRIGGER hr_payroll_result_immutable BEFORE UPDATE OR DELETE ON hr_payroll_result FOR EACH ROW EXECUTE FUNCTION reject_payroll_snapshot_mutation();
CREATE TRIGGER hr_payroll_result_item_immutable BEFORE UPDATE OR DELETE ON hr_payroll_result_item FOR EACH ROW EXECUTE FUNCTION reject_payroll_snapshot_mutation();
CREATE TRIGGER hr_payroll_journal_line_immutable BEFORE UPDATE OR DELETE ON hr_payroll_journal_line FOR EACH ROW EXECUTE FUNCTION reject_payroll_snapshot_mutation();

CREATE INDEX idx_hr_salary_structure_company ON hr_salary_structure (tenant_id,company_id,status,code);
CREATE INDEX idx_hr_payroll_adjustment_due ON hr_payroll_adjustment (tenant_id,company_id,effective_month,state,employee_id);
CREATE INDEX idx_hr_employee_loan_employee ON hr_employee_loan (tenant_id,company_id,employee_id,state);
CREATE INDEX idx_hr_loan_instalment_due ON hr_loan_instalment (tenant_id,due_month,state,loan_id);
CREATE INDEX idx_hr_payroll_payment_batch_period ON hr_payroll_payment_batch (tenant_id,company_id,period_id,state);

DO $$ DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'hr_payroll_policy','hr_pay_component','hr_salary_structure','hr_salary_structure_item','hr_salary_assignment',
        'hr_payroll_adjustment','hr_employee_loan','hr_loan_instalment','hr_payroll_period','hr_payroll_result',
        'hr_payroll_result_item','hr_payroll_journal_proposal','hr_payroll_journal_line','hr_payroll_payment_batch','hr_payroll_payment'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
        EXECUTE format('CREATE POLICY %I ON %I USING (tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''nexora.tenant_id'',true))',table_name||'_tenant_isolation',table_name);
    END LOOP;
END $$;

INSERT INTO nexora_schema_migration (module_name,version,name) VALUES ('hr',3,'payroll');
