CREATE TABLE IF NOT EXISTS nexora_schema_migration (
    module_name text NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    name text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (module_name, version)
);

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE tenant (
    id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    plan text NOT NULL CHECK (plan IN ('starter', 'business', 'enterprise')),
    region text NOT NULL CHECK (length(region) BETWEEN 1 AND 64),
    status text NOT NULL CHECK (status IN ('active', 'suspended', 'inactive')),
    default_locale text NOT NULL CHECK (default_locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_unit (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    parent_id text,
    type text NOT NULL CHECK (type IN ('company', 'branch', 'department', 'warehouse')),
    code text NOT NULL CHECK (length(code) BETWEEN 1 AND 128),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    status text NOT NULL CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, id, type),
    UNIQUE (tenant_id, code),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, parent_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX idx_organization_unit_tenant_parent
    ON organization_unit (tenant_id, parent_id);
CREATE INDEX idx_organization_unit_tenant_type_status
    ON organization_unit (tenant_id, type, status);

CREATE TABLE fiscal_calendar (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text GENERATED ALWAYS AS ('company'::text) STORED,
    year integer NOT NULL CHECK (year BETWEEN 1900 AND 2999),
    period_start date NOT NULL,
    period_end date NOT NULL,
    status text NOT NULL CHECK (status IN ('draft', 'active', 'closed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, id, company_id),
    UNIQUE (tenant_id, company_id, year),
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    CHECK (period_start < period_end),
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_id WITH =,
        daterange(period_start, period_end, '[]') WITH &&
    )
);

CREATE INDEX idx_fiscal_calendar_tenant_company_status
    ON fiscal_calendar (tenant_id, company_id, status);

CREATE TABLE accounting_period (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    fiscal_calendar_id text NOT NULL,
    period_number smallint NOT NULL CHECK (period_number BETWEEN 1 AND 366),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    period_start date NOT NULL,
    period_end date NOT NULL,
    status text NOT NULL CHECK (status IN ('open', 'soft_closed', 'closed', 'locked')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, fiscal_calendar_id, period_number),
    FOREIGN KEY (tenant_id, fiscal_calendar_id, company_id)
        REFERENCES fiscal_calendar (tenant_id, id, company_id) ON DELETE RESTRICT,
    CHECK (period_start <= period_end),
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_id WITH =,
        daterange(period_start, period_end, '[]') WITH &&
    )
);

CREATE INDEX idx_accounting_period_tenant_company_status
    ON accounting_period (tenant_id, company_id, status, period_start);

CREATE TABLE currency (
    tenant_id text NOT NULL,
    code text NOT NULL CHECK (code ~ '^[A-Z]{3}$'),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    decimal_places smallint NOT NULL CHECK (decimal_places BETWEEN 0 AND 8),
    is_base boolean NOT NULL DEFAULT false,
    status text NOT NULL CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, code),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_currency_one_active_base
    ON currency (tenant_id)
    WHERE is_base AND status = 'active';

CREATE TABLE currency_rate (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    source_currency text NOT NULL,
    target_currency text NOT NULL,
    rate numeric(38, 18) NOT NULL CHECK (rate > 0),
    effective_date date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, source_currency, target_currency, effective_date),
    FOREIGN KEY (tenant_id, source_currency)
        REFERENCES currency (tenant_id, code) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, target_currency)
        REFERENCES currency (tenant_id, code) ON DELETE RESTRICT,
    CHECK (source_currency <> target_currency)
);

CREATE INDEX idx_currency_rate_tenant_pair_effective
    ON currency_rate (tenant_id, source_currency, target_currency, effective_date DESC);

CREATE TABLE tenant_module (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    module_key text NOT NULL CHECK (module_key ~ '^[a-z][a-z0-9_]{0,63}$'),
    status text NOT NULL CHECK (status IN ('enabled', 'disabled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, module_key),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);

CREATE INDEX idx_tenant_module_tenant_status
    ON tenant_module (tenant_id, status);

CREATE TABLE tenant_policy (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    policy_key text NOT NULL CHECK (policy_key ~ '^[a-z][a-z0-9_]{0,63}$'),
    policy_value jsonb NOT NULL CHECK (jsonb_typeof(policy_value) = 'object'),
    version integer NOT NULL CHECK (version > 0),
    status text NOT NULL CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, policy_key, version),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_tenant_policy_one_active
    ON tenant_policy (tenant_id, policy_key)
    WHERE status = 'active';

CREATE TABLE numbering_sequence (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text GENERATED ALWAYS AS ('company'::text) STORED,
    module_key text NOT NULL CHECK (module_key ~ '^[a-z][a-z0-9_]{0,63}$'),
    document_type text NOT NULL CHECK (document_type ~ '^[a-z][a-z0-9_]{0,63}$'),
    prefix text NOT NULL DEFAULT '' CHECK (length(prefix) <= 32),
    suffix text NOT NULL DEFAULT '' CHECK (length(suffix) <= 32),
    next_value bigint NOT NULL CHECK (next_value > 0),
    increment_by integer NOT NULL DEFAULT 1 CHECK (increment_by > 0),
    padding smallint NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 20),
    reset_policy text NOT NULL DEFAULT 'never' CHECK (reset_policy IN ('never', 'yearly', 'monthly')),
    last_reset_period text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, company_id, module_key, document_type),
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT
);

CREATE INDEX idx_numbering_sequence_lookup
    ON numbering_sequence (tenant_id, company_id, module_key, document_type, status);

CREATE TABLE setup_draft (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    field_errors jsonb NOT NULL CHECK (jsonb_typeof(field_errors) = 'array'),
    status text NOT NULL CHECK (status IN ('draft', 'approved', 'activated', 'rejected')),
    created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id)
);

CREATE INDEX idx_setup_draft_tenant_status_updated
    ON setup_draft (tenant_id, status, updated_at DESC);

ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant
    USING (id = current_setting('nexora.tenant_id', true))
    WITH CHECK (id = current_setting('nexora.tenant_id', true));

ALTER TABLE organization_unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_unit FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_unit_tenant_isolation ON organization_unit
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE fiscal_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_calendar FORCE ROW LEVEL SECURITY;
CREATE POLICY fiscal_calendar_tenant_isolation ON fiscal_calendar
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE accounting_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_period FORCE ROW LEVEL SECURITY;
CREATE POLICY accounting_period_tenant_isolation ON accounting_period
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE currency ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency FORCE ROW LEVEL SECURITY;
CREATE POLICY currency_tenant_isolation ON currency
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE currency_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_rate FORCE ROW LEVEL SECURITY;
CREATE POLICY currency_rate_tenant_isolation ON currency_rate
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE tenant_module ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_module FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_module_tenant_isolation ON tenant_module
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE tenant_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_policy_tenant_isolation ON tenant_policy
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE numbering_sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE numbering_sequence FORCE ROW LEVEL SECURITY;
CREATE POLICY numbering_sequence_tenant_isolation ON numbering_sequence
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE setup_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE setup_draft FORCE ROW LEVEL SECURITY;
CREATE POLICY setup_draft_tenant_isolation ON setup_draft
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('platform', 1, 'platform_core');
