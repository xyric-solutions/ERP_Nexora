-- Governed Bank Statement Import and Reconciliation authority.
-- This migration is additive. It neither migrates existing Banking records nor
-- grants any permission introduced by Security 0018.

CREATE TABLE bank_statement_mapping_profile (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 128),
    bank_account_id text NOT NULL,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','inactive')),
    mapping jsonb NOT NULL CHECK (
        jsonb_typeof(mapping)='object' AND octet_length(mapping::text)<=65536
    ),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    created_by text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,id),
    UNIQUE (tenant_id,company_id,bank_account_id,id),
    UNIQUE (tenant_id,company_id,bank_account_id,name),
    FOREIGN KEY (tenant_id,company_id,bank_account_id)
        REFERENCES bank_account(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,created_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,updated_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE bank_statement_mapping_profile_event (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 128),
    profile_id text NOT NULL,
    profile_version bigint NOT NULL CHECK (profile_version>0),
    event_type text NOT NULL CHECK (event_type IN ('created','updated','activated','inactivated')),
    actor_id text NOT NULL,
    reason text CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 3 AND 500),
    state_snapshot jsonb NOT NULL CHECK (
        jsonb_typeof(state_snapshot)='object' AND octet_length(state_snapshot::text)<=65536
    ),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,event_id),
    UNIQUE (tenant_id,profile_id,profile_version),
    FOREIGN KEY (tenant_id,company_id,profile_id)
        REFERENCES bank_statement_mapping_profile(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE bank_statement_import (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 128),
    bank_account_id text NOT NULL,
    mapping_profile_id text,
    statement_reference text NOT NULL CHECK (char_length(btrim(statement_reference)) BETWEEN 1 AND 128),
    original_filename text NOT NULL CHECK (
        char_length(btrim(original_filename)) BETWEEN 1 AND 255
        AND original_filename !~ '[\\/]'
    ),
    file_format text NOT NULL CHECK (file_format IN ('csv','xlsx')),
    detected_media_type text NOT NULL CHECK (detected_media_type IN (
        'text/csv','application/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )),
    object_storage_key text NOT NULL CHECK (char_length(object_storage_key) BETWEEN 1 AND 512),
    byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 26214400),
    checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
    date_format text NOT NULL CHECK (date_format IN ('dd/MM/yyyy','MM/dd/yyyy','yyyy-MM-dd','dd-MM-yyyy')),
    mapping_snapshot jsonb CHECK (
        mapping_snapshot IS NULL OR (
            jsonb_typeof(mapping_snapshot)='object' AND octet_length(mapping_snapshot::text)<=65536
        )
    ),
    state text NOT NULL DEFAULT 'uploaded' CHECK (state IN ('uploaded','draft','validated','finalized','rejected')),
    total_row_count integer NOT NULL DEFAULT 0 CHECK (total_row_count BETWEEN 0 AND 1000),
    valid_row_count integer NOT NULL DEFAULT 0 CHECK (valid_row_count BETWEEN 0 AND 1000),
    warning_row_count integer NOT NULL DEFAULT 0 CHECK (warning_row_count BETWEEN 0 AND 1000),
    error_row_count integer NOT NULL DEFAULT 0 CHECK (error_row_count BETWEEN 0 AND 1000),
    duplicate_row_count integer NOT NULL DEFAULT 0 CHECK (duplicate_row_count BETWEEN 0 AND 1000),
    excluded_row_count integer NOT NULL DEFAULT 0 CHECK (excluded_row_count BETWEEN 0 AND 1000),
    finalized_row_count integer NOT NULL DEFAULT 0 CHECK (finalized_row_count BETWEEN 0 AND 1000),
    rejection_reason text CHECK (rejection_reason IS NULL OR char_length(btrim(rejection_reason)) BETWEEN 3 AND 500),
    supersedes_import_id text,
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    finalized_by text,
    finalized_at timestamptz,
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,id),
    UNIQUE (tenant_id,company_id,bank_account_id,id),
    UNIQUE (tenant_id,company_id,bank_account_id,checksum_sha256),
    UNIQUE (tenant_id,object_storage_key),
    FOREIGN KEY (tenant_id,company_id,bank_account_id)
        REFERENCES bank_account(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,bank_account_id,mapping_profile_id)
        REFERENCES bank_statement_mapping_profile(tenant_id,company_id,bank_account_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,bank_account_id,supersedes_import_id)
        REFERENCES bank_statement_import(tenant_id,company_id,bank_account_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,created_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,finalized_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    CHECK (supersedes_import_id IS NULL OR supersedes_import_id<>id),
    CHECK (
        valid_row_count<=total_row_count AND warning_row_count<=total_row_count
        AND error_row_count<=total_row_count AND duplicate_row_count<=total_row_count
        AND excluded_row_count<=total_row_count AND finalized_row_count<=total_row_count
    ),
    CHECK (
        (state='finalized' AND finalized_by IS NOT NULL AND finalized_at IS NOT NULL
         AND rejection_reason IS NULL AND mapping_snapshot IS NOT NULL)
        OR (state='rejected' AND finalized_by IS NULL AND finalized_at IS NULL
            AND rejection_reason IS NOT NULL)
        OR (state IN ('uploaded','draft','validated') AND finalized_by IS NULL
            AND finalized_at IS NULL AND rejection_reason IS NULL)
    )
);

CREATE FUNCTION bank_statement_jsonb_key_count(value jsonb) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT
SET search_path=pg_catalog AS $$
    SELECT count(*)::integer FROM jsonb_object_keys(value)
$$;

CREATE TABLE bank_statement_line (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 128),
    import_id text NOT NULL,
    source_row_number integer NOT NULL CHECK (source_row_number BETWEEN 1 AND 1000),
    raw_row jsonb NOT NULL CHECK (
        jsonb_typeof(raw_row)='object'
        AND bank_statement_jsonb_key_count(raw_row)<=64
        AND octet_length(raw_row::text)<=262144
    ),
    transaction_date date,
    direction text CHECK (direction IN ('money_in','money_out')),
    amount numeric(38,8) CHECK (amount IS NULL OR amount>0),
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    reference text CHECK (reference IS NULL OR char_length(reference)<=500),
    details text CHECK (details IS NULL OR char_length(details)<=500),
    transaction_type text CHECK (transaction_type IS NULL OR char_length(transaction_type)<=160),
    account_text text CHECK (account_text IS NULL OR char_length(account_text)<=200),
    payment_mode text CHECK (payment_mode IS NULL OR char_length(payment_mode)<=160),
    row_fingerprint text NOT NULL CHECK (row_fingerprint ~ '^[0-9a-f]{64}$'),
    inclusion_state text NOT NULL DEFAULT 'included' CHECK (inclusion_state IN ('included','excluded')),
    exclusion_reason text CHECK (exclusion_reason IS NULL OR char_length(btrim(exclusion_reason)) BETWEEN 3 AND 500),
    validation_state text NOT NULL CHECK (validation_state IN ('valid','warning','duplicate','error')),
    duplicate_disposition text NOT NULL DEFAULT 'not_applicable' CHECK (duplicate_disposition IN (
        'not_applicable','unresolved','accepted_duplicate','rejected_duplicate'
    )),
    validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
        jsonb_typeof(validation_issues)='array'
        AND jsonb_array_length(validation_issues)<=25
        AND octet_length(validation_issues::text)<=32768
    ),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    reconciled_reconciliation_id text,
    reconciled_at timestamptz,
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,id),
    UNIQUE (tenant_id,company_id,import_id,id),
    UNIQUE (tenant_id,company_id,import_id,source_row_number),
    FOREIGN KEY (tenant_id,company_id,import_id)
        REFERENCES bank_statement_import(tenant_id,company_id,id) ON DELETE RESTRICT,
    CHECK ((direction IS NULL AND amount IS NULL) OR (direction IS NOT NULL AND amount IS NOT NULL)),
    CHECK (
        (inclusion_state='included' AND exclusion_reason IS NULL)
        OR (inclusion_state='excluded' AND exclusion_reason IS NOT NULL)
    ),
    CHECK (
        (validation_state='duplicate' AND duplicate_disposition IN ('unresolved','accepted_duplicate','rejected_duplicate'))
        OR (validation_state<>'duplicate' AND duplicate_disposition='not_applicable')
    ),
    CHECK (
        validation_state='error' OR inclusion_state='excluded'
        OR (transaction_date IS NOT NULL AND direction IS NOT NULL AND amount IS NOT NULL
            AND (nullif(btrim(reference),'') IS NOT NULL OR nullif(btrim(details),'') IS NOT NULL))
    ),
    CHECK (
        (reconciled_reconciliation_id IS NULL AND reconciled_at IS NULL)
        OR (reconciled_reconciliation_id IS NOT NULL AND reconciled_at IS NOT NULL)
    )
);

CREATE TABLE bank_statement_import_event (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 128),
    import_id text NOT NULL,
    import_version bigint NOT NULL CHECK (import_version>0),
    event_type text NOT NULL CHECK (event_type IN (
        'uploaded','mapping_updated','line_resolved','validated','finalized','rejected'
    )),
    actor_id text NOT NULL,
    statement_line_id text,
    reason text CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 3 AND 500),
    state_snapshot jsonb NOT NULL CHECK (
        jsonb_typeof(state_snapshot)='object' AND octet_length(state_snapshot::text)<=65536
    ),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,event_id),
    FOREIGN KEY (tenant_id,company_id,import_id)
        REFERENCES bank_statement_import(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,import_id,statement_line_id)
        REFERENCES bank_statement_line(tenant_id,company_id,import_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);

CREATE INDEX bank_statement_mapping_profile_directory
    ON bank_statement_mapping_profile(tenant_id,company_id,bank_account_id,state,name,id);
CREATE INDEX bank_statement_import_directory
    ON bank_statement_import(tenant_id,company_id,bank_account_id,state,created_at DESC,id);
CREATE INDEX bank_statement_import_statement_reference
    ON bank_statement_import(tenant_id,company_id,statement_reference,id);
CREATE INDEX bank_statement_line_import_status
    ON bank_statement_line(tenant_id,company_id,import_id,inclusion_state,validation_state,source_row_number);
CREATE INDEX bank_statement_line_match_candidate
    ON bank_statement_line(tenant_id,company_id,currency,transaction_date,direction,amount)
    WHERE inclusion_state='included' AND validation_state IN ('valid','warning','duplicate');
CREATE INDEX bank_statement_line_fingerprint
    ON bank_statement_line(tenant_id,company_id,import_id,row_fingerprint);

CREATE TABLE bank_reconciliation (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 128),
    bank_account_id text NOT NULL,
    method text NOT NULL CHECK (method IN ('statement_import','manual_tick')),
    import_id text,
    statement_date date NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    statement_reference text NOT NULL CHECK (char_length(btrim(statement_reference)) BETWEEN 1 AND 128),
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    opening_statement_balance numeric(38,8) NOT NULL,
    statement_money_in numeric(38,8) NOT NULL DEFAULT 0,
    statement_money_out numeric(38,8) NOT NULL DEFAULT 0,
    reconstructed_statement_balance numeric(38,8) NOT NULL DEFAULT 0,
    closing_statement_balance numeric(38,8) NOT NULL,
    ledger_balance_at_cutoff numeric(38,8) NOT NULL DEFAULT 0,
    unmatched_ledger_money_in numeric(38,8) NOT NULL DEFAULT 0,
    unmatched_ledger_money_out numeric(38,8) NOT NULL DEFAULT 0,
    adjusted_ledger_balance numeric(38,8) NOT NULL DEFAULT 0,
    difference numeric(38,8) NOT NULL DEFAULT 0,
    matched_count integer NOT NULL DEFAULT 0 CHECK (matched_count>=0),
    unmatched_statement_count integer NOT NULL DEFAULT 0 CHECK (unmatched_statement_count>=0),
    unmatched_ledger_count integer NOT NULL DEFAULT 0 CHECK (unmatched_ledger_count>=0),
    adjustment_count integer NOT NULL DEFAULT 0 CHECK (adjustment_count>=0),
    ledger_population_hash text NOT NULL CHECK (ledger_population_hash ~ '^[0-9a-f]{64}$'),
    ledger_calculated_at timestamptz NOT NULL,
    state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','in_progress','submitted','approved')),
    prepared_by text NOT NULL,
    submitted_by text,
    submitted_at timestamptz,
    approved_by text,
    approved_at timestamptz,
    decision_reason text CHECK (decision_reason IS NULL OR char_length(btrim(decision_reason)) BETWEEN 3 AND 500),
    approval_override_event_id text,
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,id),
    UNIQUE (tenant_id,company_id,bank_account_id,id),
    FOREIGN KEY (tenant_id,company_id,bank_account_id)
        REFERENCES bank_account(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,bank_account_id,import_id)
        REFERENCES bank_statement_import(tenant_id,company_id,bank_account_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,prepared_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,submitted_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approved_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event(tenant_id,event_id) ON DELETE RESTRICT,
    CHECK (period_start<=period_end AND period_end<=statement_date),
    CHECK ((method='statement_import' AND import_id IS NOT NULL) OR (method='manual_tick' AND import_id IS NULL)),
    CHECK (
        (state IN ('draft','in_progress') AND submitted_by IS NULL AND submitted_at IS NULL
         AND approved_by IS NULL AND approved_at IS NULL AND approval_override_event_id IS NULL)
        OR (state='submitted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND approved_by IS NULL AND approved_at IS NULL AND approval_override_event_id IS NULL)
        OR (state='approved' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND decision_reason IS NOT NULL)
    )
);

CREATE UNIQUE INDEX bank_reconciliation_import_once
    ON bank_reconciliation(tenant_id,company_id,import_id) WHERE import_id IS NOT NULL;
ALTER TABLE bank_reconciliation ADD CONSTRAINT bank_reconciliation_one_live_period
    EXCLUDE USING gist (
        tenant_id WITH =, company_id WITH =, bank_account_id WITH =,
        daterange(period_start,period_end,'[]') WITH &&
    ) WHERE (state<>'approved');
CREATE INDEX bank_reconciliation_directory
    ON bank_reconciliation(tenant_id,company_id,bank_account_id,state,statement_date DESC,id);

ALTER TABLE bank_statement_line
    ADD FOREIGN KEY (tenant_id,company_id,reconciled_reconciliation_id)
        REFERENCES bank_reconciliation(tenant_id,company_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX bank_statement_line_reconciled_once
    ON bank_statement_line(tenant_id,company_id,id,reconciled_reconciliation_id)
    WHERE reconciled_reconciliation_id IS NOT NULL;

CREATE TABLE bank_reconciliation_ledger_line (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    reconciliation_id text NOT NULL,
    journal_line_id text NOT NULL,
    journal_id text NOT NULL,
    posting_date date NOT NULL,
    direction text NOT NULL CHECK (direction IN ('money_in','money_out')),
    amount numeric(38,8) NOT NULL CHECK (amount>0),
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    reference text CHECK (reference IS NULL OR char_length(reference)<=128),
    narrative text CHECK (narrative IS NULL OR char_length(narrative)<=500),
    captured_at timestamptz NOT NULL DEFAULT now(),
    reconciled_at timestamptz,
    PRIMARY KEY (tenant_id,reconciliation_id,journal_line_id),
    UNIQUE (tenant_id,company_id,reconciliation_id,journal_line_id),
    FOREIGN KEY (tenant_id,company_id,reconciliation_id)
        REFERENCES bank_reconciliation(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,journal_id)
        REFERENCES journal_entry(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,journal_line_id)
        REFERENCES journal_line(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX bank_reconciliation_ledger_candidate
    ON bank_reconciliation_ledger_line(
        tenant_id,company_id,reconciliation_id,currency,posting_date,direction,amount,journal_line_id
    );
CREATE UNIQUE INDEX bank_reconciliation_journal_line_approved_once
    ON bank_reconciliation_ledger_line(tenant_id,company_id,journal_line_id)
    WHERE reconciled_at IS NOT NULL;

CREATE TABLE bank_reconciliation_match (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 128),
    reconciliation_id text NOT NULL,
    statement_line_id text NOT NULL,
    journal_line_id text NOT NULL,
    match_type text NOT NULL CHECK (match_type IN ('exact','suggested','manual')),
    state text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','confirmed','rejected')),
    confidence_score numeric(5,4) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
    reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
        jsonb_typeof(reason_codes)='array' AND jsonb_array_length(reason_codes)<=20
        AND octet_length(reason_codes::text)<=4096
    ),
    decided_by text,
    decided_at timestamptz,
    decision_reason text CHECK (decision_reason IS NULL OR char_length(btrim(decision_reason)) BETWEEN 3 AND 500),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,id),
    FOREIGN KEY (tenant_id,company_id,reconciliation_id)
        REFERENCES bank_reconciliation(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,statement_line_id)
        REFERENCES bank_statement_line(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,reconciliation_id,journal_line_id)
        REFERENCES bank_reconciliation_ledger_line(tenant_id,company_id,reconciliation_id,journal_line_id)
        ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,created_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,decided_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    CHECK (
        (state='proposed' AND decided_by IS NULL AND decided_at IS NULL AND decision_reason IS NULL)
        OR (state='confirmed' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
        OR (state='rejected' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_reason IS NOT NULL)
    )
);
CREATE UNIQUE INDEX bank_reconciliation_confirmed_statement_line
    ON bank_reconciliation_match(tenant_id,company_id,statement_line_id) WHERE state='confirmed';
CREATE UNIQUE INDEX bank_reconciliation_confirmed_journal_line
    ON bank_reconciliation_match(tenant_id,company_id,journal_line_id) WHERE state='confirmed';
CREATE INDEX bank_reconciliation_match_workspace
    ON bank_reconciliation_match(tenant_id,company_id,reconciliation_id,state,match_type,id);

CREATE TABLE bank_reconciliation_adjustment (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 128),
    reconciliation_id text NOT NULL,
    statement_line_id text NOT NULL,
    kind text NOT NULL CHECK (kind IN (
        'bank_charge','interest_earned','unidentified_credit','unidentified_debit','other'
    )),
    offset_nominal_id text NOT NULL,
    narrative text NOT NULL CHECK (char_length(btrim(narrative)) BETWEEN 3 AND 500),
    direction text NOT NULL CHECK (direction IN ('money_in','money_out')),
    amount numeric(38,8) NOT NULL CHECK (amount>0),
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','approved','posted','reversed')),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    submitted_by text,
    submitted_at timestamptz,
    approved_by text,
    approved_at timestamptz,
    decision_reason text CHECK (decision_reason IS NULL OR char_length(btrim(decision_reason)) BETWEEN 3 AND 500),
    approval_override_event_id text,
    posted_by text,
    posted_at timestamptz,
    accounting_event_id text,
    journal_id text,
    bank_journal_line_id text,
    reversed_by text,
    reversed_at timestamptz,
    reversal_reason text CHECK (reversal_reason IS NULL OR char_length(btrim(reversal_reason)) BETWEEN 3 AND 500),
    reversal_accounting_event_id text,
    reversal_journal_id text,
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,id),
    FOREIGN KEY (tenant_id,company_id,reconciliation_id)
        REFERENCES bank_reconciliation(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,statement_line_id)
        REFERENCES bank_statement_line(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,offset_nominal_id)
        REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,created_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,submitted_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approved_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,posted_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,reversed_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event(tenant_id,event_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,accounting_event_id)
        REFERENCES accounting_event(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,reversal_accounting_event_id)
        REFERENCES accounting_event(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,journal_id)
        REFERENCES journal_entry(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,reversal_journal_id)
        REFERENCES journal_entry(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,bank_journal_line_id)
        REFERENCES journal_line(tenant_id,id) ON DELETE RESTRICT,
    CHECK (
        (state='draft' AND submitted_by IS NULL AND submitted_at IS NULL AND approved_by IS NULL
         AND approved_at IS NULL AND posted_by IS NULL AND posted_at IS NULL AND reversed_by IS NULL)
        OR (state='submitted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND approved_by IS NULL AND approved_at IS NULL AND posted_by IS NULL AND reversed_by IS NULL)
        OR (state='approved' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND decision_reason IS NOT NULL
            AND posted_by IS NULL AND posted_at IS NULL AND reversed_by IS NULL)
        OR (state='posted' AND submitted_by IS NOT NULL AND approved_by IS NOT NULL
            AND posted_by IS NOT NULL AND posted_at IS NOT NULL AND accounting_event_id IS NOT NULL
            AND journal_id IS NOT NULL AND bank_journal_line_id IS NOT NULL AND reversed_by IS NULL)
        OR (state='reversed' AND posted_by IS NOT NULL AND posted_at IS NOT NULL
            AND accounting_event_id IS NOT NULL AND journal_id IS NOT NULL AND bank_journal_line_id IS NOT NULL
            AND reversed_by IS NOT NULL AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL
            AND reversal_accounting_event_id IS NOT NULL AND reversal_journal_id IS NOT NULL)
    )
);
CREATE UNIQUE INDEX bank_reconciliation_adjustment_live_statement
    ON bank_reconciliation_adjustment(tenant_id,company_id,statement_line_id) WHERE state<>'reversed';
CREATE UNIQUE INDEX bank_reconciliation_adjustment_accounting_event
    ON bank_reconciliation_adjustment(tenant_id,accounting_event_id) WHERE accounting_event_id IS NOT NULL;
CREATE UNIQUE INDEX bank_reconciliation_adjustment_journal
    ON bank_reconciliation_adjustment(tenant_id,company_id,journal_id) WHERE journal_id IS NOT NULL;
CREATE INDEX bank_reconciliation_adjustment_workspace
    ON bank_reconciliation_adjustment(tenant_id,company_id,reconciliation_id,state,id);

CREATE TABLE bank_reconciliation_adjustment_event (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 128),
    adjustment_id text NOT NULL,
    adjustment_version bigint NOT NULL CHECK (adjustment_version>0),
    event_type text NOT NULL CHECK (event_type IN ('created','updated','submitted','approved','rejected','posted','reversed')),
    actor_id text NOT NULL,
    reason text CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 3 AND 500),
    state_snapshot jsonb NOT NULL CHECK (
        jsonb_typeof(state_snapshot)='object' AND octet_length(state_snapshot::text)<=65536
    ),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,event_id),
    FOREIGN KEY (tenant_id,company_id,adjustment_id)
        REFERENCES bank_reconciliation_adjustment(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE bank_reconciliation_event (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 128),
    reconciliation_id text NOT NULL,
    reconciliation_version bigint NOT NULL CHECK (reconciliation_version>0),
    event_type text NOT NULL CHECK (event_type IN (
        'created','ledger_captured','match_proposed','match_confirmed','match_rejected','unmatched',
        'adjustment_linked','submitted','approved','returned'
    )),
    actor_id text NOT NULL,
    reason text CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 3 AND 500),
    state_snapshot jsonb NOT NULL CHECK (
        jsonb_typeof(state_snapshot)='object' AND octet_length(state_snapshot::text)<=65536
    ),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,event_id),
    FOREIGN KEY (tenant_id,company_id,reconciliation_id)
        REFERENCES bank_reconciliation(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);

CREATE INDEX bank_statement_mapping_profile_event_history
    ON bank_statement_mapping_profile_event(tenant_id,company_id,profile_id,occurred_at,event_id);
CREATE INDEX bank_statement_import_event_history
    ON bank_statement_import_event(tenant_id,company_id,import_id,occurred_at,event_id);
CREATE INDEX bank_reconciliation_adjustment_event_history
    ON bank_reconciliation_adjustment_event(tenant_id,company_id,adjustment_id,occurred_at,event_id);
CREATE INDEX bank_reconciliation_event_history
    ON bank_reconciliation_event(tenant_id,company_id,reconciliation_id,occurred_at,event_id);

CREATE FUNCTION reject_bank_reconciliation_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Bank Statement and Reconciliation event evidence is immutable'
        USING ERRCODE='23514';
END
$$;

CREATE TRIGGER bank_statement_mapping_profile_event_immutable
    BEFORE UPDATE OR DELETE ON bank_statement_mapping_profile_event
    FOR EACH ROW EXECUTE FUNCTION reject_bank_reconciliation_evidence_mutation();
CREATE TRIGGER bank_statement_import_event_immutable
    BEFORE UPDATE OR DELETE ON bank_statement_import_event
    FOR EACH ROW EXECUTE FUNCTION reject_bank_reconciliation_evidence_mutation();
CREATE TRIGGER bank_reconciliation_adjustment_event_immutable
    BEFORE UPDATE OR DELETE ON bank_reconciliation_adjustment_event
    FOR EACH ROW EXECUTE FUNCTION reject_bank_reconciliation_evidence_mutation();
CREATE TRIGGER bank_reconciliation_event_immutable
    BEFORE UPDATE OR DELETE ON bank_reconciliation_event
    FOR EACH ROW EXECUTE FUNCTION reject_bank_reconciliation_evidence_mutation();

CREATE FUNCTION guard_bank_statement_mapping_profile() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Bank Statement mapping profiles are append-retained' USING ERRCODE='23514';
    END IF;
    IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.bank_account_id,NEW.created_by,NEW.created_at)
       IS DISTINCT FROM
       (OLD.tenant_id,OLD.company_id,OLD.id,OLD.bank_account_id,OLD.created_by,OLD.created_at) THEN
        RAISE EXCEPTION 'Bank Statement mapping profile identity is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
        RAISE EXCEPTION 'Bank Statement mapping profile version must advance' USING ERRCODE='40001';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_statement_mapping_profile_guard
    BEFORE UPDATE OR DELETE ON bank_statement_mapping_profile
    FOR EACH ROW EXECUTE FUNCTION guard_bank_statement_mapping_profile();

CREATE FUNCTION guard_bank_statement_import() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    actual_rows integer;
    unresolved_rows integer;
    superseded_state text;
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Bank Statement imports are append-retained' USING ERRCODE='23514';
    END IF;
    IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.bank_account_id,NEW.original_filename,
        NEW.file_format,NEW.detected_media_type,NEW.object_storage_key,NEW.byte_size,
        NEW.checksum_sha256,NEW.created_by,NEW.created_at)
       IS DISTINCT FROM
       (OLD.tenant_id,OLD.company_id,OLD.id,OLD.bank_account_id,OLD.original_filename,
        OLD.file_format,OLD.detected_media_type,OLD.object_storage_key,OLD.byte_size,
        OLD.checksum_sha256,OLD.created_by,OLD.created_at) THEN
        RAISE EXCEPTION 'Bank Statement import file identity is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.state IN ('finalized','rejected') THEN
        RAISE EXCEPTION 'Finalized or rejected Bank Statement imports are immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
        RAISE EXCEPTION 'Bank Statement import version must advance' USING ERRCODE='40001';
    END IF;
    IF NOT (
        NEW.state=OLD.state AND OLD.state IN ('uploaded','draft','validated')
        OR OLD.state='uploaded' AND NEW.state IN ('draft','rejected')
        OR OLD.state='draft' AND NEW.state IN ('validated','rejected')
        OR OLD.state='validated' AND NEW.state IN ('draft','finalized','rejected')
    ) THEN
        RAISE EXCEPTION 'Invalid Bank Statement import transition: % -> %',OLD.state,NEW.state
            USING ERRCODE='23514';
    END IF;
    IF NEW.supersedes_import_id IS NOT NULL THEN
        SELECT state INTO superseded_state
          FROM bank_statement_import
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id
           AND bank_account_id=NEW.bank_account_id AND id=NEW.supersedes_import_id
         FOR SHARE;
        IF superseded_state IS DISTINCT FROM 'rejected' THEN
            RAISE EXCEPTION 'Only a rejected Bank Statement import may be superseded' USING ERRCODE='23514';
        END IF;
    END IF;
    IF NEW.state='finalized' AND OLD.state<>'finalized' THEN
        SELECT count(*),count(*) FILTER (
                   WHERE inclusion_state='included' AND (
                       validation_state='error'
                       OR (validation_state='duplicate' AND duplicate_disposition<>'accepted_duplicate')
                       OR transaction_date IS NULL OR direction IS NULL OR amount IS NULL
                   )
               )
          INTO actual_rows,unresolved_rows
          FROM bank_statement_line
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND import_id=NEW.id;
        IF actual_rows<>NEW.total_row_count OR actual_rows>1000 OR unresolved_rows<>0
           OR NEW.error_row_count<>0
           OR NEW.finalized_row_count<>NEW.total_row_count-NEW.excluded_row_count THEN
            RAISE EXCEPTION 'Bank Statement import is not ready to finalize' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_statement_import_guard
    BEFORE UPDATE OR DELETE ON bank_statement_import
    FOR EACH ROW EXECUTE FUNCTION guard_bank_statement_import();

CREATE FUNCTION guard_bank_statement_line() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    import_state text;
    reconciliation_state text;
    reconciliation_import text;
BEGIN
    SELECT state INTO import_state
      FROM bank_statement_import
     WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id)
       AND company_id=COALESCE(NEW.company_id,OLD.company_id)
       AND id=COALESCE(NEW.import_id,OLD.import_id)
     FOR SHARE;
    IF TG_OP='DELETE' THEN
        IF import_state IN ('finalized','rejected') THEN
            RAISE EXCEPTION 'Finalized Bank Statement source rows are immutable' USING ERRCODE='23514';
        END IF;
        RETURN OLD;
    END IF;
    IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.import_id,NEW.source_row_number,NEW.raw_row,NEW.row_fingerprint)
       IS DISTINCT FROM
       (OLD.tenant_id,OLD.company_id,OLD.id,OLD.import_id,OLD.source_row_number,OLD.raw_row,OLD.row_fingerprint) THEN
        RAISE EXCEPTION 'Bank Statement source row evidence is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 THEN
        RAISE EXCEPTION 'Bank Statement row version must advance' USING ERRCODE='40001';
    END IF;
    IF import_state='finalized' THEN
        IF (to_jsonb(NEW)-'row_version'-'reconciled_reconciliation_id'-'reconciled_at')
           IS DISTINCT FROM
           (to_jsonb(OLD)-'row_version'-'reconciled_reconciliation_id'-'reconciled_at')
           OR OLD.reconciled_reconciliation_id IS NOT NULL
           OR NEW.reconciled_reconciliation_id IS NULL THEN
            RAISE EXCEPTION 'Finalized Bank Statement rows permit only one reconciliation marker' USING ERRCODE='23514';
        END IF;
        SELECT state,import_id INTO reconciliation_state,reconciliation_import
          FROM bank_reconciliation
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id
           AND id=NEW.reconciled_reconciliation_id
         FOR SHARE;
        IF reconciliation_state IS DISTINCT FROM 'approved'
           OR reconciliation_import IS DISTINCT FROM NEW.import_id THEN
            RAISE EXCEPTION 'Statement row reconciliation marker requires its approved reconciliation'
                USING ERRCODE='23514';
        END IF;
    ELSIF NEW.reconciled_reconciliation_id IS DISTINCT FROM OLD.reconciled_reconciliation_id
       OR NEW.reconciled_at IS DISTINCT FROM OLD.reconciled_at THEN
        RAISE EXCEPTION 'Only finalized Statement rows may be reconciled' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_statement_line_guard
    BEFORE UPDATE OR DELETE ON bank_statement_line
    FOR EACH ROW EXECUTE FUNCTION guard_bank_statement_line();

CREATE FUNCTION validate_bank_reconciliation_record() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    bank_currency text;
    import_state text;
BEGIN
    SELECT currency INTO bank_currency
      FROM bank_account
     WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.bank_account_id
     FOR SHARE;
    IF bank_currency IS DISTINCT FROM NEW.currency THEN
        RAISE EXCEPTION 'Reconciliation currency must match its Bank Account' USING ERRCODE='23514';
    END IF;
    IF NEW.import_id IS NOT NULL THEN
        SELECT state INTO import_state
          FROM bank_statement_import
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id
           AND bank_account_id=NEW.bank_account_id AND id=NEW.import_id
         FOR SHARE;
        IF import_state IS DISTINCT FROM 'finalized' THEN
            RAISE EXCEPTION 'Reconciliation requires a finalized Bank Statement import' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_reconciliation_record_guard
    BEFORE INSERT ON bank_reconciliation
    FOR EACH ROW EXECUTE FUNCTION validate_bank_reconciliation_record();

CREATE FUNCTION guard_bank_reconciliation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    unresolved integer;
    override_valid boolean;
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Bank Reconciliations are append-retained' USING ERRCODE='23514';
    END IF;
    IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.bank_account_id,NEW.method,NEW.import_id,
        NEW.statement_date,NEW.period_start,NEW.period_end,NEW.statement_reference,NEW.currency,
        NEW.opening_statement_balance,NEW.closing_statement_balance,NEW.prepared_by,NEW.created_at)
       IS DISTINCT FROM
       (OLD.tenant_id,OLD.company_id,OLD.id,OLD.bank_account_id,OLD.method,OLD.import_id,
        OLD.statement_date,OLD.period_start,OLD.period_end,OLD.statement_reference,OLD.currency,
        OLD.opening_statement_balance,OLD.closing_statement_balance,OLD.prepared_by,OLD.created_at) THEN
        RAISE EXCEPTION 'Bank Reconciliation identity and source evidence are immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.state='approved' THEN
        RAISE EXCEPTION 'Approved Bank Reconciliations are immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
        RAISE EXCEPTION 'Bank Reconciliation version must advance' USING ERRCODE='40001';
    END IF;
    IF NOT (
        NEW.state=OLD.state AND OLD.state IN ('draft','in_progress')
        OR OLD.state='draft' AND NEW.state='in_progress'
        OR OLD.state='in_progress' AND NEW.state='submitted'
        OR OLD.state='submitted' AND NEW.state IN ('approved','in_progress')
    ) THEN
        RAISE EXCEPTION 'Invalid Bank Reconciliation transition: % -> %',OLD.state,NEW.state
            USING ERRCODE='23514';
    END IF;
    IF NEW.state='submitted' AND OLD.state<>'submitted' THEN
        SELECT count(*) INTO unresolved
          FROM bank_statement_line line
         WHERE NEW.import_id IS NOT NULL
           AND line.tenant_id=NEW.tenant_id AND line.company_id=NEW.company_id
           AND line.import_id=NEW.import_id AND line.inclusion_state='included'
           AND NOT EXISTS (
               SELECT 1 FROM bank_reconciliation_match match
                WHERE match.tenant_id=NEW.tenant_id AND match.company_id=NEW.company_id
                  AND match.reconciliation_id=NEW.id AND match.statement_line_id=line.id
                  AND match.state='confirmed'
           );
        IF NEW.difference<>0 OR NEW.unmatched_statement_count<>0 OR unresolved<>0
           OR EXISTS (
               SELECT 1 FROM bank_reconciliation_match match
               JOIN bank_reconciliation_ledger_line capture
                 ON capture.tenant_id=match.tenant_id AND capture.company_id=match.company_id
                AND capture.reconciliation_id=match.reconciliation_id
                AND capture.journal_line_id=match.journal_line_id
               JOIN journal_entry journal
                 ON journal.tenant_id=capture.tenant_id AND journal.company_id=capture.company_id
                AND journal.id=capture.journal_id
               WHERE match.tenant_id=NEW.tenant_id AND match.company_id=NEW.company_id
                 AND match.reconciliation_id=NEW.id AND match.state='confirmed'
                 AND journal.status<>'posted'
           ) THEN
            RAISE EXCEPTION 'Bank Reconciliation is not ready to submit' USING ERRCODE='23514';
        END IF;
    END IF;
    IF NEW.state='approved' AND OLD.state='submitted' THEN
        SELECT EXISTS(
            SELECT 1 FROM approval_override_event evidence
             WHERE evidence.tenant_id=NEW.tenant_id
               AND evidence.event_id=NEW.approval_override_event_id
               AND evidence.resource_type='bank_reconciliation'
               AND evidence.resource_id=NEW.id
               AND evidence.decision_action='approve'
               AND evidence.actor_user_id=NEW.approved_by
               AND evidence.normal_permission_key='banking.reconciliation.approve'
        ) INTO override_valid;
        IF NEW.approved_by=NEW.prepared_by AND NOT COALESCE(override_valid,false) THEN
            RAISE EXCEPTION 'Bank Reconciliation requires an independent approver or governed override'
                USING ERRCODE='23514';
        END IF;
        IF EXISTS (
            SELECT 1 FROM bank_reconciliation_adjustment adjustment
             WHERE adjustment.tenant_id=NEW.tenant_id AND adjustment.company_id=NEW.company_id
               AND adjustment.reconciliation_id=NEW.id AND adjustment.state<>'posted'
        ) THEN
            RAISE EXCEPTION 'Every Reconciliation adjustment must be posted before approval'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_reconciliation_guard
    BEFORE UPDATE OR DELETE ON bank_reconciliation
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation();

CREATE FUNCTION guard_bank_reconciliation_ledger_line() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    reconciliation bank_reconciliation%ROWTYPE;
    bank_nominal_id text;
    journal journal_entry%ROWTYPE;
    line journal_line%ROWTYPE;
    expected_direction text;
    expected_amount numeric(38,8);
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Captured Reconciliation ledger populations are append-retained' USING ERRCODE='23514';
    END IF;
    SELECT * INTO reconciliation FROM bank_reconciliation
     WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.reconciliation_id FOR SHARE;
    IF TG_OP='INSERT' THEN
        IF reconciliation.state NOT IN ('draft','in_progress') THEN
            RAISE EXCEPTION 'Ledger population can be captured only for an open Reconciliation' USING ERRCODE='23514';
        END IF;
        SELECT account_id INTO bank_nominal_id FROM bank_account
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=reconciliation.bank_account_id FOR SHARE;
        SELECT * INTO journal FROM journal_entry
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.journal_id FOR SHARE;
        SELECT * INTO line FROM journal_line
         WHERE tenant_id=NEW.tenant_id AND id=NEW.journal_line_id FOR SHARE;
        expected_direction:=CASE WHEN line.debit>0 THEN 'money_in' ELSE 'money_out' END;
        expected_amount:=CASE WHEN line.debit>0 THEN line.debit ELSE line.credit END;
        IF journal.id IS NULL OR line.id IS NULL OR line.journal_id<>journal.id
           OR journal.status<>'posted' OR journal.posting_date NOT BETWEEN reconciliation.period_start AND reconciliation.period_end
           OR line.account_id<>bank_nominal_id OR line.currency<>NEW.currency
           OR expected_direction<>NEW.direction OR expected_amount<>NEW.amount THEN
            RAISE EXCEPTION 'Captured ledger line is not eligible for this Bank Reconciliation'
                USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF (to_jsonb(NEW)-'reconciled_at') IS DISTINCT FROM (to_jsonb(OLD)-'reconciled_at')
       OR OLD.reconciled_at IS NOT NULL OR NEW.reconciled_at IS NULL
       OR reconciliation.state<>'approved' THEN
        RAISE EXCEPTION 'Captured ledger evidence is immutable except for approved reconciliation marking'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_reconciliation_ledger_line_guard
    BEFORE INSERT OR UPDATE OR DELETE ON bank_reconciliation_ledger_line
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_ledger_line();

CREATE FUNCTION guard_bank_reconciliation_match() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    reconciliation bank_reconciliation%ROWTYPE;
    statement bank_statement_line%ROWTYPE;
    capture bank_reconciliation_ledger_line%ROWTYPE;
    journal_status text;
BEGIN
    SELECT * INTO reconciliation FROM bank_reconciliation
     WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id)
       AND company_id=COALESCE(NEW.company_id,OLD.company_id)
       AND id=COALESCE(NEW.reconciliation_id,OLD.reconciliation_id) FOR SHARE;
    IF TG_OP='DELETE' THEN
        IF reconciliation.state IN ('submitted','approved') THEN
            RAISE EXCEPTION 'Submitted Reconciliation matches are immutable' USING ERRCODE='23514';
        END IF;
        RETURN OLD;
    END IF;
    IF reconciliation.state IN ('submitted','approved') THEN
        RAISE EXCEPTION 'Submitted Reconciliation matches are immutable' USING ERRCODE='23514';
    END IF;
    SELECT * INTO statement FROM bank_statement_line
     WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.statement_line_id FOR SHARE;
    SELECT * INTO capture FROM bank_reconciliation_ledger_line
     WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id
       AND reconciliation_id=NEW.reconciliation_id AND journal_line_id=NEW.journal_line_id FOR SHARE;
    SELECT status INTO journal_status FROM journal_entry
     WHERE tenant_id=capture.tenant_id AND company_id=capture.company_id AND id=capture.journal_id FOR SHARE;
    IF reconciliation.import_id IS NULL OR statement.import_id<>reconciliation.import_id
       OR statement.inclusion_state<>'included'
       OR statement.validation_state NOT IN ('valid','warning','duplicate')
       OR (statement.validation_state='duplicate' AND statement.duplicate_disposition<>'accepted_duplicate')
       OR statement.direction<>capture.direction OR statement.amount<>capture.amount
       OR statement.currency<>capture.currency OR journal_status<>'posted' THEN
        RAISE EXCEPTION 'Reconciliation match evidence is not eligible' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.reconciliation_id,NEW.statement_line_id,
            NEW.journal_line_id,NEW.match_type,NEW.created_by,NEW.created_at)
           IS DISTINCT FROM
           (OLD.tenant_id,OLD.company_id,OLD.id,OLD.reconciliation_id,OLD.statement_line_id,
            OLD.journal_line_id,OLD.match_type,OLD.created_by,OLD.created_at) THEN
            RAISE EXCEPTION 'Reconciliation match identity is immutable' USING ERRCODE='23514';
        END IF;
        IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
            RAISE EXCEPTION 'Reconciliation match version must advance' USING ERRCODE='40001';
        END IF;
        IF NOT (OLD.state='proposed' AND NEW.state IN ('confirmed','rejected')
                OR OLD.state='confirmed' AND NEW.state='rejected') THEN
            RAISE EXCEPTION 'Invalid Reconciliation match transition: % -> %',OLD.state,NEW.state
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_reconciliation_match_guard
    BEFORE INSERT OR UPDATE OR DELETE ON bank_reconciliation_match
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_match();

CREATE FUNCTION guard_bank_reconciliation_adjustment() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    reconciliation bank_reconciliation%ROWTYPE;
    statement bank_statement_line%ROWTYPE;
    nominal account%ROWTYPE;
    event accounting_event%ROWTYPE;
    journal journal_entry%ROWTYPE;
    bank_line journal_line%ROWTYPE;
    bank_nominal_id text;
    override_valid boolean;
BEGIN
    SELECT * INTO reconciliation FROM bank_reconciliation
     WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id)
       AND company_id=COALESCE(NEW.company_id,OLD.company_id)
       AND id=COALESCE(NEW.reconciliation_id,OLD.reconciliation_id) FOR SHARE;
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Bank Reconciliation adjustments are append-retained' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' THEN
        IF reconciliation.state NOT IN ('draft','in_progress') OR reconciliation.import_id IS NULL THEN
            RAISE EXCEPTION 'Adjustment requires an open imported-statement Reconciliation' USING ERRCODE='23514';
        END IF;
        SELECT * INTO statement FROM bank_statement_line
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.statement_line_id FOR SHARE;
        SELECT * INTO nominal FROM account
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.offset_nominal_id FOR SHARE;
        IF statement.import_id<>reconciliation.import_id OR statement.inclusion_state<>'included'
           OR statement.validation_state NOT IN ('valid','warning','duplicate')
           OR statement.direction<>NEW.direction OR statement.amount<>NEW.amount OR statement.currency<>NEW.currency
           OR nominal.id IS NULL OR nominal.status<>'active' OR nominal.is_header OR NOT nominal.manual_posting_allowed
           OR EXISTS (
               SELECT 1 FROM bank_reconciliation_match match
                WHERE match.tenant_id=NEW.tenant_id AND match.company_id=NEW.company_id
                  AND match.statement_line_id=NEW.statement_line_id AND match.state='confirmed'
           ) THEN
            RAISE EXCEPTION 'Bank Reconciliation adjustment evidence is not eligible' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF reconciliation.state='approved' OR OLD.state='reversed' THEN
        RAISE EXCEPTION 'Approved Reconciliation adjustments are immutable' USING ERRCODE='23514';
    END IF;
    IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.reconciliation_id,NEW.statement_line_id,
        NEW.direction,NEW.amount,NEW.currency,NEW.created_by,NEW.created_at)
       IS DISTINCT FROM
       (OLD.tenant_id,OLD.company_id,OLD.id,OLD.reconciliation_id,OLD.statement_line_id,
        OLD.direction,OLD.amount,OLD.currency,OLD.created_by,OLD.created_at) THEN
        RAISE EXCEPTION 'Bank Reconciliation adjustment source evidence is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
        RAISE EXCEPTION 'Bank Reconciliation adjustment version must advance' USING ERRCODE='40001';
    END IF;
    IF NOT (
        NEW.state=OLD.state AND OLD.state='draft'
        OR OLD.state='draft' AND NEW.state='submitted'
        OR OLD.state='submitted' AND NEW.state IN ('approved','draft')
        OR OLD.state='approved' AND NEW.state='posted'
        OR OLD.state='posted' AND NEW.state='reversed'
    ) THEN
        RAISE EXCEPTION 'Invalid Reconciliation adjustment transition: % -> %',OLD.state,NEW.state
            USING ERRCODE='23514';
    END IF;
    IF NEW.state='approved' AND OLD.state='submitted' THEN
        SELECT EXISTS(
            SELECT 1 FROM approval_override_event evidence
             WHERE evidence.tenant_id=NEW.tenant_id AND evidence.event_id=NEW.approval_override_event_id
               AND evidence.resource_type='bank_reconciliation_adjustment'
               AND evidence.resource_id=NEW.id AND evidence.decision_action='approve'
               AND evidence.actor_user_id=NEW.approved_by
               AND evidence.normal_permission_key='banking.reconciliation_adjustment.approve'
        ) INTO override_valid;
        IF NEW.approved_by=NEW.created_by AND NOT COALESCE(override_valid,false) THEN
            RAISE EXCEPTION 'Reconciliation adjustment requires an independent approver or governed override'
                USING ERRCODE='23514';
        END IF;
    END IF;
    IF NEW.state='posted' AND OLD.state='approved' THEN
        SELECT * INTO event FROM accounting_event
         WHERE tenant_id=NEW.tenant_id AND id=NEW.accounting_event_id FOR SHARE;
        SELECT * INTO journal FROM journal_entry
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.journal_id FOR SHARE;
        SELECT * INTO bank_line FROM journal_line
         WHERE tenant_id=NEW.tenant_id AND id=NEW.bank_journal_line_id FOR SHARE;
        SELECT account_id INTO bank_nominal_id FROM bank_account
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=reconciliation.bank_account_id FOR SHARE;
        IF event.state<>'posted' OR event.source_type<>'banking.reconciliation_adjustment' OR event.source_id<>NEW.id
           OR journal.status<>'posted' OR journal.source_type<>'accounting_event' OR journal.source_id<>event.id
           OR bank_line.journal_id<>journal.id OR bank_line.account_id<>bank_nominal_id
           OR bank_line.currency<>NEW.currency
           OR (NEW.direction='money_in' AND bank_line.debit<>NEW.amount)
           OR (NEW.direction='money_out' AND bank_line.credit<>NEW.amount) THEN
            RAISE EXCEPTION 'Posted Reconciliation adjustment Finance evidence is inconsistent'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_reconciliation_adjustment_guard
    BEFORE INSERT OR UPDATE OR DELETE ON bank_reconciliation_adjustment
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_adjustment();

CREATE FUNCTION guard_bank_reconciliation_company_actors() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE
    actor_field text;
    actor_id text;
BEGIN
    FOREACH actor_field IN ARRAY TG_ARGV LOOP
        actor_id:=to_jsonb(NEW)->>actor_field;
        IF TG_OP='UPDATE' AND (to_jsonb(OLD)->>actor_field) IS NOT DISTINCT FROM actor_id THEN
            CONTINUE;
        END IF;
        IF actor_id IS NOT NULL AND NOT EXISTS (
            SELECT 1
              FROM public.security_user_company_access access
             WHERE access.tenant_id=NEW.tenant_id
               AND access.company_id=NEW.company_id
               AND access.user_id=actor_id
               AND access.revoked_at IS NULL
        ) THEN
            RAISE EXCEPTION 'Bank Statement and Reconciliation actor lacks current company access'
                USING ERRCODE='23514';
        END IF;
    END LOOP;
    RETURN NEW;
END
$$;

CREATE TRIGGER bank_statement_mapping_profile_company_actor_guard
    BEFORE INSERT OR UPDATE ON bank_statement_mapping_profile
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('created_by','updated_by');
CREATE TRIGGER bank_statement_mapping_profile_event_company_actor_guard
    BEFORE INSERT OR UPDATE ON bank_statement_mapping_profile_event
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('actor_id');
CREATE TRIGGER bank_statement_import_company_actor_guard
    BEFORE INSERT OR UPDATE ON bank_statement_import
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('created_by','finalized_by');
CREATE TRIGGER bank_statement_import_event_company_actor_guard
    BEFORE INSERT OR UPDATE ON bank_statement_import_event
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('actor_id');
CREATE TRIGGER bank_reconciliation_company_actor_guard
    BEFORE INSERT OR UPDATE ON bank_reconciliation
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('prepared_by','submitted_by','approved_by');
CREATE TRIGGER bank_reconciliation_match_company_actor_guard
    BEFORE INSERT OR UPDATE ON bank_reconciliation_match
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('created_by','decided_by');
CREATE TRIGGER bank_reconciliation_adjustment_company_actor_guard
    BEFORE INSERT OR UPDATE ON bank_reconciliation_adjustment
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors(
        'created_by','submitted_by','approved_by','posted_by','reversed_by'
    );
CREATE TRIGGER bank_reconciliation_adjustment_event_company_actor_guard
    BEFORE INSERT OR UPDATE ON bank_reconciliation_adjustment_event
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('actor_id');
CREATE TRIGGER bank_reconciliation_event_company_actor_guard
    BEFORE INSERT OR UPDATE ON bank_reconciliation_event
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('actor_id');

CREATE FUNCTION prevent_approved_reconciliation_journal_reversal() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status='posted' AND NEW.status='reversed' AND EXISTS (
        SELECT 1
          FROM bank_reconciliation_ledger_line capture
          JOIN bank_reconciliation_match match
            ON match.tenant_id=capture.tenant_id AND match.company_id=capture.company_id
           AND match.reconciliation_id=capture.reconciliation_id
           AND match.journal_line_id=capture.journal_line_id AND match.state='confirmed'
          JOIN bank_reconciliation reconciliation
            ON reconciliation.tenant_id=match.tenant_id AND reconciliation.company_id=match.company_id
           AND reconciliation.id=match.reconciliation_id AND reconciliation.state='approved'
         WHERE capture.tenant_id=OLD.tenant_id AND capture.company_id=OLD.company_id
           AND capture.journal_id=OLD.id
    ) THEN
        RAISE EXCEPTION 'Journal entries referenced by an approved Bank Reconciliation cannot be reversed'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER journal_entry_approved_reconciliation_guard
    BEFORE UPDATE ON journal_entry
    FOR EACH ROW EXECUTE FUNCTION prevent_approved_reconciliation_journal_reversal();

CREATE FUNCTION bank_reconciliation_company_access(target_tenant text,target_company text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
    SELECT target_tenant=current_setting('nexora.tenant_id',true)
       AND EXISTS (
           SELECT 1
             FROM public.security_user_company_access access
            WHERE access.tenant_id=target_tenant
              AND access.company_id=target_company
              AND access.user_id=current_setting('nexora.user_id',true)
              AND access.revoked_at IS NULL
       )
$$;

DO $$
DECLARE
    relation text;
BEGIN
    FOREACH relation IN ARRAY ARRAY[
        'bank_statement_mapping_profile','bank_statement_mapping_profile_event',
        'bank_statement_import','bank_statement_line','bank_statement_import_event',
        'bank_reconciliation','bank_reconciliation_ledger_line','bank_reconciliation_match',
        'bank_reconciliation_adjustment','bank_reconciliation_adjustment_event','bank_reconciliation_event'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
        EXECUTE format(
            'CREATE POLICY bank_reconciliation_company_isolation ON %I '
            'USING (bank_reconciliation_company_access(tenant_id,company_id)) '
            'WITH CHECK (bank_reconciliation_company_access(tenant_id,company_id))',
            relation
        );
    END LOOP;
END
$$;

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('finance',28,'bank_statement_reconciliation');
