CREATE TABLE accounting_event (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    source_type text NOT NULL CHECK (length(source_type) BETWEEN 1 AND 128),
    source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 128),
    event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 128),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    payload_hash text NOT NULL CHECK (length(payload_hash) = 64),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 255),
    state text NOT NULL CHECK (state IN ('received','validated','posted','rejected','failed','retry','dead')),
    retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 5),
    compensates_event_id text,
    audit_ref text,
    created_at timestamptz NOT NULL,
    posted_at timestamptz,
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, compensates_event_id) REFERENCES accounting_event (tenant_id, id) ON DELETE RESTRICT,
    CHECK ((state = 'posted') = (posted_at IS NOT NULL))
);
CREATE INDEX accounting_event_state ON accounting_event (tenant_id, state, created_at);
CREATE INDEX accounting_event_source ON accounting_event (tenant_id, source_type, source_id);
CREATE INDEX accounting_event_payload_hash ON accounting_event (tenant_id, source_type, source_id, payload_hash);

CREATE TABLE account (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    code text NOT NULL CHECK (length(code) BETWEEN 1 AND 128),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    type text NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
    parent_id text,
    is_header boolean NOT NULL DEFAULT false,
    required_dimensions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(required_dimensions) = 'array'),
    status text NOT NULL CHECK (status IN ('active','inactive')),
    manual_posting_allowed boolean NOT NULL DEFAULT true,
    is_system_account boolean NOT NULL DEFAULT false,
    reconciliation_required boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, company_id, code),
    FOREIGN KEY (tenant_id, company_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, parent_id) REFERENCES account (tenant_id, id) ON DELETE RESTRICT,
    CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX account_company_status ON account (tenant_id, company_id, status, code);

CREATE TABLE financial_period (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    fiscal_calendar_id text NOT NULL,
    period_number integer NOT NULL CHECK (period_number BETWEEN 1 AND 12),
    period_start date NOT NULL,
    period_end date NOT NULL,
    status text NOT NULL CHECK (status IN ('open','soft_close','closed')),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, fiscal_calendar_id, period_number),
    FOREIGN KEY (tenant_id, company_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, fiscal_calendar_id) REFERENCES fiscal_calendar (tenant_id, id) ON DELETE RESTRICT,
    CHECK (period_start < period_end)
);
CREATE INDEX financial_period_lookup ON financial_period (tenant_id, company_id, period_start, period_end);

CREATE TABLE recurring_journal_template (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    schedule text NOT NULL CHECK (schedule IN ('monthly','quarterly')),
    lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) > 0),
    status text NOT NULL CHECK (status IN ('active','inactive')),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tax_rule (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    jurisdiction text NOT NULL,
    tax_type text NOT NULL,
    rate numeric(38,18) NOT NULL CHECK (rate >= 0),
    effective_date date NOT NULL,
    config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    status text NOT NULL CHECK (status IN ('active','inactive')),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, jurisdiction, tax_type, version),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);
CREATE INDEX tax_rule_active ON tax_rule (tenant_id, jurisdiction, tax_type, effective_date DESC);

CREATE TABLE journal_entry (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 128),
    posting_date date NOT NULL,
    period_id text,
    source_type text NOT NULL CHECK (length(source_type) BETWEEN 1 AND 128),
    source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 128),
    status text NOT NULL CHECK (status IN ('draft','posted','reversed')),
    entry_number text,
    reverses_journal_id text,
    reversed_by_journal_id text,
    recurring_template_id text,
    recurring_cycle_number integer CHECK (recurring_cycle_number IS NULL OR recurring_cycle_number > 0),
    intercompany_link_id text,
    created_at timestamptz NOT NULL,
    posted_at timestamptz,
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, company_id, entry_number),
    UNIQUE (tenant_id, recurring_template_id, recurring_cycle_number),
    FOREIGN KEY (tenant_id, company_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, period_id) REFERENCES financial_period (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, reverses_journal_id) REFERENCES journal_entry (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, reversed_by_journal_id) REFERENCES journal_entry (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, recurring_template_id) REFERENCES recurring_journal_template (tenant_id, id) ON DELETE RESTRICT,
    CHECK (
        (status = 'draft' AND entry_number IS NULL AND posted_at IS NULL)
        OR (status IN ('posted','reversed') AND entry_number IS NOT NULL AND period_id IS NOT NULL AND posted_at IS NOT NULL)
    )
);
CREATE INDEX journal_entry_company_status ON journal_entry (tenant_id, company_id, status, posting_date);
CREATE INDEX journal_entry_period ON journal_entry (tenant_id, period_id);
CREATE INDEX journal_entry_source ON journal_entry (tenant_id, source_type, source_id);
CREATE UNIQUE INDEX journal_entry_controlled_source_once
    ON journal_entry (tenant_id, source_type, source_id)
    WHERE source_type IN ('accounting_event','payroll') AND reverses_journal_id IS NULL;
CREATE INDEX journal_entry_intercompany ON journal_entry (tenant_id, intercompany_link_id);

CREATE TABLE journal_line (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    journal_id text NOT NULL,
    tenant_id text NOT NULL,
    line_number integer NOT NULL CHECK (line_number > 0),
    account_id text NOT NULL,
    debit numeric(38,8) NOT NULL CHECK (debit >= 0),
    credit numeric(38,8) NOT NULL CHECK (credit >= 0),
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    fx_rate numeric(38,18) CHECK (fx_rate IS NULL OR fx_rate > 0),
    tax_rule_id text,
    base_debit numeric(38,8) NOT NULL CHECK (base_debit >= 0),
    base_credit numeric(38,8) NOT NULL CHECK (base_credit >= 0),
    dimensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimensions) = 'object'),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, journal_id, line_number),
    FOREIGN KEY (tenant_id, journal_id) REFERENCES journal_entry (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, account_id) REFERENCES account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, tax_rule_id) REFERENCES tax_rule (tenant_id, id) ON DELETE RESTRICT,
    CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
    CHECK ((base_debit > 0 AND base_credit = 0) OR (base_credit > 0 AND base_debit = 0))
);
CREATE INDEX journal_line_account ON journal_line (tenant_id, account_id);
CREATE INDEX journal_line_journal ON journal_line (tenant_id, journal_id, line_number);

CREATE TABLE journal_entry_sequence (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    period_id text NOT NULL,
    next_value bigint NOT NULL CHECK (next_value > 0),
    PRIMARY KEY (tenant_id, company_id, period_id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, period_id) REFERENCES financial_period (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE party (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    type text NOT NULL CHECK (type IN ('customer','vendor','employee')),
    code text NOT NULL CHECK (length(code) BETWEEN 1 AND 128),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    tax_id text NOT NULL DEFAULT '',
    status text NOT NULL CHECK (status IN ('active','inactive')),
    risk_status text NOT NULL CHECK (risk_status IN ('normal','watch','blocked')),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, code),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);
CREATE INDEX party_status ON party (tenant_id, status, type);

CREATE TABLE bank_account (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    account_id text NOT NULL,
    bank_name text NOT NULL CHECK (length(bank_name) BETWEEN 1 AND 200),
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    status text NOT NULL CHECK (status IN ('active','inactive')),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, account_id) REFERENCES account (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX bank_account_company ON bank_account (tenant_id, company_id, status);

CREATE TABLE budget (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 2999),
    period_id text,
    account_id text NOT NULL,
    amount numeric(38,8) NOT NULL CHECK (amount >= 0),
    dimensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimensions) = 'object'),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    status text NOT NULL CHECK (status IN ('draft','pending_approval','approved','superseded','rejected')),
    approval_instance_id text,
    superseded_by_id text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, account_id) REFERENCES account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, period_id) REFERENCES financial_period (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, superseded_by_id) REFERENCES budget (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, approval_instance_id) REFERENCES approval_instance (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX budget_company_year ON budget (tenant_id, company_id, fiscal_year, status);

CREATE TABLE consolidation_group (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    parent_company_id text NOT NULL,
    members jsonb NOT NULL CHECK (jsonb_typeof(members) = 'array' AND jsonb_array_length(members) > 0),
    effective_date date NOT NULL,
    elimination_rules jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(elimination_rules) = 'array'),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    status text NOT NULL CHECK (status IN ('active','superseded')),
    superseded_by_id text,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, parent_company_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, superseded_by_id) REFERENCES consolidation_group (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX consolidation_group_status ON consolidation_group (tenant_id, status);

CREATE TABLE report_definition (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    name text NOT NULL,
    module text NOT NULL,
    filters_schema jsonb NOT NULL CHECK (jsonb_typeof(filters_schema) = 'object'),
    schedule text,
    export_policy jsonb NOT NULL CHECK (jsonb_typeof(export_policy) = 'object'),
    status text NOT NULL CHECK (status IN ('active','inactive')),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, name),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);
CREATE INDEX report_definition_module ON report_definition (tenant_id, module, status);

CREATE TABLE analytics_snapshot (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    dataset text NOT NULL,
    as_of timestamptz NOT NULL,
    payload jsonb NOT NULL,
    freshness_at timestamptz NOT NULL,
    storage_ref text,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX analytics_snapshot_latest ON analytics_snapshot (tenant_id, company_id, dataset, freshness_at DESC);

CREATE TABLE report_job (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    report_type text NOT NULL,
    requested_by text NOT NULL,
    params jsonb NOT NULL CHECK (jsonb_typeof(params) = 'object'),
    status text NOT NULL CHECK (status IN ('queued','running','completed','failed')),
    result_snapshot_id text,
    failure_reason text,
    created_at timestamptz NOT NULL,
    completed_at timestamptz,
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, result_snapshot_id) REFERENCES analytics_snapshot (tenant_id, id) ON DELETE RESTRICT,
    CHECK (status <> 'completed' OR (result_snapshot_id IS NOT NULL AND completed_at IS NOT NULL)),
    CHECK (status <> 'failed' OR (failure_reason IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE INDEX report_job_status ON report_job (tenant_id, company_id, status, created_at);

CREATE FUNCTION finance_guard_journal_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE debit_total numeric(38,8); credit_total numeric(38,8);
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'journal entries cannot be deleted';
    END IF;
    IF OLD.status IN ('posted','reversed') THEN
        IF OLD.status = 'posted' AND NEW.status = 'reversed'
           AND NEW.reversed_by_journal_id IS NOT NULL
           AND (to_jsonb(NEW) - 'status' - 'reversed_by_journal_id') =
               (to_jsonb(OLD) - 'status' - 'reversed_by_journal_id') THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'posted journal entries are immutable';
    END IF;
    IF NEW.status NOT IN ('draft','posted') THEN
        RAISE EXCEPTION 'a draft journal can only transition to posted';
    END IF;
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.id <> OLD.id
       OR NEW.company_id <> OLD.company_id OR NEW.created_by <> OLD.created_by
       OR NEW.source_type <> OLD.source_type OR NEW.source_id <> OLD.source_id
       OR NEW.reverses_journal_id IS DISTINCT FROM OLD.reverses_journal_id
       OR NEW.recurring_template_id IS DISTINCT FROM OLD.recurring_template_id
       OR NEW.recurring_cycle_number IS DISTINCT FROM OLD.recurring_cycle_number
       OR NEW.intercompany_link_id IS DISTINCT FROM OLD.intercompany_link_id
       OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'journal identity and source fields are immutable';
    END IF;
    IF NEW.status = 'posted' THEN
        SELECT COALESCE(sum(base_debit),0), COALESCE(sum(base_credit),0)
          INTO debit_total, credit_total
          FROM journal_line WHERE tenant_id = NEW.tenant_id AND journal_id = NEW.id;
        IF debit_total = 0 OR debit_total <> credit_total THEN
            RAISE EXCEPTION 'journal entry must be balanced before posting';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER journal_entry_guard BEFORE UPDATE OR DELETE ON journal_entry
FOR EACH ROW EXECUTE FUNCTION finance_guard_journal_entry();

CREATE FUNCTION finance_guard_journal_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
    SELECT status INTO parent_status FROM journal_entry
     WHERE tenant_id = COALESCE(OLD.tenant_id, NEW.tenant_id)
       AND id = COALESCE(OLD.journal_id, NEW.journal_id);
    IF parent_status IN ('posted','reversed') THEN
        RAISE EXCEPTION 'posted journal lines are immutable';
    END IF;
    RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER journal_line_guard BEFORE UPDATE OR DELETE ON journal_line
FOR EACH ROW EXECUTE FUNCTION finance_guard_journal_line();

CREATE FUNCTION finance_guard_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'accounting events cannot be deleted';
    END IF;
    IF OLD.state IN ('posted','rejected','dead') THEN
        RAISE EXCEPTION 'terminal accounting events are immutable';
    END IF;
    IF NEW.payload <> OLD.payload OR NEW.payload_hash <> OLD.payload_hash
       OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.source_type <> OLD.source_type
       OR NEW.source_id <> OLD.source_id OR NEW.event_type <> OLD.event_type
       OR NEW.compensates_event_id IS DISTINCT FROM OLD.compensates_event_id THEN
        RAISE EXCEPTION 'accounting event business data is immutable';
    END IF;
    IF NOT (
        (OLD.state = 'received' AND NEW.state IN ('validated','rejected'))
        OR (OLD.state = 'validated' AND NEW.state IN ('posted','failed'))
        OR (OLD.state = 'failed' AND NEW.state IN ('retry','dead'))
        OR (OLD.state = 'retry' AND NEW.state IN ('validated','dead'))
    ) THEN
        RAISE EXCEPTION 'invalid accounting event state transition';
    END IF;
    IF NEW.retry_count < OLD.retry_count THEN
        RAISE EXCEPTION 'accounting event retry count cannot decrease';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER accounting_event_guard BEFORE UPDATE OR DELETE ON accounting_event
FOR EACH ROW EXECUTE FUNCTION finance_guard_event();

CREATE FUNCTION finance_guard_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.id <> OLD.id
       OR NEW.company_id <> OLD.company_id OR NEW.code <> OLD.code
       OR NEW.is_header <> OLD.is_header OR NEW.is_system_account <> OLD.is_system_account
       OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'account identity and system fields are immutable';
    END IF;
    IF NEW.type <> OLD.type AND EXISTS (
        SELECT 1 FROM journal_line jl JOIN journal_entry je
          ON je.tenant_id = jl.tenant_id AND je.id = jl.journal_id
        WHERE jl.tenant_id = OLD.tenant_id AND jl.account_id = OLD.id
          AND je.status IN ('posted','reversed')
    ) THEN
        RAISE EXCEPTION 'account type cannot change after posting';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER account_guard BEFORE UPDATE ON account
FOR EACH ROW EXECUTE FUNCTION finance_guard_account();

DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'accounting_event','account','financial_period','recurring_journal_template',
        'tax_rule','journal_entry','journal_line','journal_entry_sequence','party',
        'bank_account','budget','consolidation_group','report_definition',
        'analytics_snapshot','report_job'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''nexora.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''nexora.tenant_id'', true))',
            table_name || '_tenant_isolation', table_name
        );
    END LOOP;
END $$;

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('finance', 1, 'finance_foundation');
