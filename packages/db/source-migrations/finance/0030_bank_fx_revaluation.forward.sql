-- Governed company Bank FX revaluation, immutable calculation evidence and
-- durable next-period reversal scheduling. This migration posts no journals.

ALTER TABLE account
    ADD CONSTRAINT account_company_revaluation_identity UNIQUE(tenant_id,company_id,id);
ALTER TABLE bank_account
    ADD CONSTRAINT bank_account_company_revaluation_identity UNIQUE(tenant_id,company_id,id);
ALTER TABLE journal_entry
    ADD CONSTRAINT journal_entry_company_revaluation_identity UNIQUE(tenant_id,company_id,id);

CREATE FUNCTION guard_bank_account_company_currency() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM company_currency configured
         WHERE configured.tenant_id=NEW.tenant_id
           AND configured.company_id=NEW.company_id
           AND configured.currency_code=NEW.currency
           AND configured.status='active'
    ) THEN
        RAISE EXCEPTION 'Bank account currency must be active for the same company'
            USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND NEW.currency IS DISTINCT FROM OLD.currency AND (
        EXISTS(SELECT 1 FROM journal_line WHERE tenant_id=OLD.tenant_id AND account_id=OLD.account_id)
        OR EXISTS(SELECT 1 FROM bank_payment WHERE tenant_id=OLD.tenant_id AND bank_account_id=OLD.id)
        OR EXISTS(SELECT 1 FROM bank_receipt WHERE tenant_id=OLD.tenant_id AND bank_account_id=OLD.id)
        OR EXISTS(SELECT 1 FROM bank_transfer_line
                   WHERE tenant_id=OLD.tenant_id
                     AND (from_bank_account_id=OLD.id OR to_bank_account_id=OLD.id))
        OR EXISTS(SELECT 1 FROM bank_statement_import
                   WHERE tenant_id=OLD.tenant_id AND bank_account_id=OLD.id)
        OR EXISTS(SELECT 1 FROM bank_reconciliation
                   WHERE tenant_id=OLD.tenant_id AND bank_account_id=OLD.id)
        OR EXISTS(SELECT 1 FROM bank_revaluation_line
                   WHERE tenant_id=OLD.tenant_id AND bank_account_id=OLD.id)
    ) THEN
        RAISE EXCEPTION 'Bank account currency is immutable after financial activity'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_account_company_currency_guard
    BEFORE INSERT OR UPDATE OF currency,status ON bank_account
    FOR EACH ROW EXECUTE FUNCTION guard_bank_account_company_currency();

CREATE TABLE bank_revaluation_policy (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    unrealized_gain_nominal_id text NOT NULL,
    unrealized_loss_nominal_id text NOT NULL,
    reversal_mode text NOT NULL DEFAULT 'next_open_period_first_day'
        CHECK (reversal_mode='next_open_period_first_day'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id),
    UNIQUE (tenant_id,company_id,id),
    FOREIGN KEY (tenant_id,company_id) REFERENCES organization_unit(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,unrealized_gain_nominal_id)
        REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,unrealized_loss_nominal_id)
        REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,created_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    CHECK (unrealized_gain_nominal_id<>unrealized_loss_nominal_id)
);

CREATE TABLE bank_revaluation_policy_event (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    policy_id text NOT NULL,
    action text NOT NULL CHECK (action IN ('created','updated','activated','inactivated')),
    record_version bigint NOT NULL CHECK (record_version>0),
    actor_id text NOT NULL,
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
    correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,policy_id,record_version),
    FOREIGN KEY (tenant_id,company_id,policy_id)
        REFERENCES bank_revaluation_policy(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE bank_revaluation_sequence (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 2999),
    next_value bigint NOT NULL CHECK (next_value>0),
    PRIMARY KEY (tenant_id,company_id,fiscal_year),
    FOREIGN KEY (tenant_id,company_id) REFERENCES organization_unit(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE bank_revaluation (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    voucher_number text NOT NULL CHECK (length(btrim(voucher_number)) BETWEEN 1 AND 128),
    external_reference text CHECK (external_reference IS NULL OR length(btrim(external_reference)) BETWEEN 1 AND 128),
    narration text CHECK (narration IS NULL OR length(btrim(narration)) BETWEEN 1 AND 500),
    revaluation_date date NOT NULL,
    base_currency text NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
    base_decimal_places smallint NOT NULL CHECK (base_decimal_places BETWEEN 0 AND 8),
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    rate_id text NOT NULL,
    closing_rate numeric(38,18) NOT NULL CHECK (closing_rate>0),
    rate_effective_date date NOT NULL,
    rate_revision_version bigint NOT NULL CHECK (rate_revision_version>0),
    policy_id text NOT NULL,
    policy_version bigint NOT NULL CHECK (policy_version>0),
    unrealized_gain_nominal_id text NOT NULL,
    unrealized_loss_nominal_id text NOT NULL,
    source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
    foreign_balance numeric(38,8) NOT NULL,
    carrying_base_balance numeric(38,8) NOT NULL,
    revalued_base_balance numeric(38,8) NOT NULL,
    total_gain numeric(38,8) NOT NULL CHECK (total_gain>=0),
    total_loss numeric(38,8) NOT NULL CHECK (total_loss>=0),
    net_gain_loss numeric(38,8) NOT NULL,
    account_count integer NOT NULL CHECK (account_count>=0 AND account_count<=10000),
    state text NOT NULL CHECK (state IN ('draft','submitted','approved','rejected','posted','reversed')),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    maker_user_id text NOT NULL,
    approver_user_id text,
    submitted_by text,
    submitted_at timestamptz,
    decided_by text,
    decided_at timestamptz,
    decision_reason text CHECK (decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 3 AND 500),
    super_admin_override_used boolean NOT NULL DEFAULT false,
    decision_evidence_id text,
    posted_by text,
    posted_at timestamptz,
    journal_entry_id text,
    reversal_scheduled_date date,
    reversal_journal_entry_id text,
    reversed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,id),
    UNIQUE (tenant_id,company_id,voucher_number),
    FOREIGN KEY (tenant_id,company_id) REFERENCES organization_unit(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,base_currency)
        REFERENCES company_currency_profile(tenant_id,company_id,base_currency) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,currency)
        REFERENCES company_currency(tenant_id,company_id,currency_code) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,rate_id)
        REFERENCES currency_rate(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,policy_id)
        REFERENCES bank_revaluation_policy(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,unrealized_gain_nominal_id)
        REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,unrealized_loss_nominal_id)
        REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,maker_user_id) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approver_user_id) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,submitted_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,decided_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,posted_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,decision_evidence_id)
        REFERENCES approval_override_event(tenant_id,event_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,journal_entry_id)
        REFERENCES journal_entry(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,reversal_journal_entry_id)
        REFERENCES journal_entry(tenant_id,company_id,id) ON DELETE RESTRICT,
    CHECK (currency<>base_currency),
    CHECK (rate_effective_date<=revaluation_date),
    CHECK (revalued_base_balance=round(foreign_balance*closing_rate,base_decimal_places)),
    CHECK (net_gain_loss=revalued_base_balance-carrying_base_balance),
    CHECK (net_gain_loss=total_gain-total_loss),
    CHECK (
        (state='draft' AND submitted_by IS NULL AND submitted_at IS NULL AND decided_by IS NULL
         AND decided_at IS NULL AND posted_by IS NULL AND posted_at IS NULL AND journal_entry_id IS NULL)
        OR (state='submitted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND decided_by IS NULL AND decided_at IS NULL AND posted_by IS NULL AND journal_entry_id IS NULL)
        OR (state IN ('approved','rejected') AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND posted_by IS NULL AND journal_entry_id IS NULL)
        OR (state='posted' AND decided_by IS NOT NULL AND posted_by IS NOT NULL AND posted_at IS NOT NULL
            AND journal_entry_id IS NOT NULL AND reversal_scheduled_date IS NOT NULL)
        OR (state='reversed' AND journal_entry_id IS NOT NULL AND reversal_journal_entry_id IS NOT NULL
            AND reversed_at IS NOT NULL)
    ),
    CHECK (NOT super_admin_override_used OR decision_evidence_id IS NOT NULL)
);
CREATE UNIQUE INDEX bank_revaluation_one_active_run
    ON bank_revaluation(tenant_id,company_id,currency,revaluation_date)
    WHERE state IN ('draft','submitted','approved','posted');
CREATE UNIQUE INDEX bank_revaluation_one_source_journal
    ON bank_revaluation(tenant_id,journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE UNIQUE INDEX bank_revaluation_one_reversal_journal
    ON bank_revaluation(tenant_id,reversal_journal_entry_id) WHERE reversal_journal_entry_id IS NOT NULL;
CREATE INDEX bank_revaluation_directory
    ON bank_revaluation(tenant_id,company_id,state,revaluation_date DESC,voucher_number,id);

CREATE TABLE bank_revaluation_line (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    revaluation_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    line_order integer NOT NULL CHECK (line_order BETWEEN 1 AND 10000),
    bank_account_id text NOT NULL,
    control_nominal_id text NOT NULL,
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    base_decimal_places smallint NOT NULL CHECK (base_decimal_places BETWEEN 0 AND 8),
    foreign_balance numeric(38,8) NOT NULL,
    carrying_base_balance numeric(38,8) NOT NULL,
    closing_rate numeric(38,18) NOT NULL CHECK (closing_rate>0),
    revalued_base_balance numeric(38,8) NOT NULL,
    adjustment numeric(38,8) NOT NULL,
    direction text NOT NULL CHECK (direction IN ('gain','loss','none')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,revaluation_id,line_order),
    UNIQUE (tenant_id,revaluation_id,bank_account_id),
    UNIQUE (tenant_id,company_id,revaluation_id,id),
    FOREIGN KEY (tenant_id,company_id,revaluation_id)
        REFERENCES bank_revaluation(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,bank_account_id)
        REFERENCES bank_account(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,control_nominal_id)
        REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,currency)
        REFERENCES company_currency(tenant_id,company_id,currency_code) ON DELETE RESTRICT,
    CHECK (revalued_base_balance=round(foreign_balance*closing_rate,base_decimal_places)),
    CHECK (adjustment=revalued_base_balance-carrying_base_balance),
    CHECK (
        (adjustment>0 AND direction='gain') OR
        (adjustment<0 AND direction='loss') OR
        (adjustment=0 AND direction='none')
    )
);

CREATE TABLE bank_revaluation_event (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    revaluation_id text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN (
        'created','updated','submitted','approved','rejected','posted',
        'reversal_scheduled','reversal_failed','reversed'
    )),
    from_state text CHECK (from_state IS NULL OR from_state IN ('draft','submitted','approved','rejected','posted','reversed')),
    to_state text CHECK (to_state IS NULL OR to_state IN ('draft','submitted','approved','rejected','posted','reversed')),
    actor_id text,
    reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 500),
    record_version bigint NOT NULL CHECK (record_version>0),
    super_admin_override_used boolean NOT NULL DEFAULT false,
    decision_evidence_id text,
    correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    FOREIGN KEY (tenant_id,company_id,revaluation_id)
        REFERENCES bank_revaluation(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,decision_evidence_id)
        REFERENCES approval_override_event(tenant_id,event_id) ON DELETE RESTRICT,
    CHECK (NOT super_admin_override_used OR decision_evidence_id IS NOT NULL)
);
CREATE UNIQUE INDEX bank_revaluation_event_one_version_type
    ON bank_revaluation_event(tenant_id,revaluation_id,record_version,event_type)
    WHERE event_type<>'reversal_failed';

CREATE TABLE bank_revaluation_reversal_schedule (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    revaluation_id text NOT NULL,
    scheduled_date date NOT NULL,
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','posted','failed')),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 100),
    next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    claimed_by text,
    claimed_at timestamptz,
    last_error_code text CHECK (last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 64),
    reversal_journal_entry_id text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,revaluation_id),
    UNIQUE (tenant_id,company_id,revaluation_id),
    FOREIGN KEY (tenant_id,company_id,revaluation_id)
        REFERENCES bank_revaluation(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,reversal_journal_entry_id)
        REFERENCES journal_entry(tenant_id,company_id,id) ON DELETE RESTRICT,
    CHECK ((state='posted')=(reversal_journal_entry_id IS NOT NULL)),
    CHECK ((claimed_by IS NULL)=(claimed_at IS NULL))
);
CREATE UNIQUE INDEX bank_revaluation_reversal_one_journal
    ON bank_revaluation_reversal_schedule(tenant_id,reversal_journal_entry_id)
    WHERE reversal_journal_entry_id IS NOT NULL;
CREATE INDEX bank_revaluation_reversal_due
    ON bank_revaluation_reversal_schedule(state,next_attempt_at,scheduled_date,tenant_id,id)
    WHERE state IN ('pending','failed');

CREATE FUNCTION guard_bank_revaluation_policy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE nominal_id text; nominal account%ROWTYPE;
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Bank Revaluation policy cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.created_by,NEW.created_at)
           IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.created_by,OLD.created_at) THEN
            RAISE EXCEPTION 'Bank Revaluation policy identity is immutable' USING ERRCODE='23514';
        END IF;
        IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
            RAISE EXCEPTION 'Bank Revaluation policy version must advance' USING ERRCODE='40001';
        END IF;
    ELSIF NEW.row_version<>1 THEN
        RAISE EXCEPTION 'New Bank Revaluation policy requires version one' USING ERRCODE='23514';
    END IF;
    FOREACH nominal_id IN ARRAY ARRAY[NEW.unrealized_gain_nominal_id,NEW.unrealized_loss_nominal_id] LOOP
        SELECT * INTO nominal FROM account
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=nominal_id FOR SHARE;
        IF nominal.id IS NULL OR nominal.status<>'active' OR nominal.is_header
           OR NOT nominal.manual_posting_allowed OR nominal.managed_bank_nominal THEN
            RAISE EXCEPTION 'Revaluation policy requires active non-Bank postable company nominals'
                USING ERRCODE='23514';
        END IF;
    END LOOP;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_revaluation_policy_guard
    BEFORE INSERT OR UPDATE OR DELETE ON bank_revaluation_policy
    FOR EACH ROW EXECUTE FUNCTION guard_bank_revaluation_policy();

CREATE FUNCTION guard_bank_revaluation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Bank Revaluations cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.row_version<>1 OR NEW.state<>'draft' THEN
            RAISE EXCEPTION 'New Bank Revaluations must be version-one drafts' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.voucher_number,NEW.maker_user_id,NEW.created_at)
       IS DISTINCT FROM
       (OLD.tenant_id,OLD.company_id,OLD.id,OLD.voucher_number,OLD.maker_user_id,OLD.created_at) THEN
        RAISE EXCEPTION 'Bank Revaluation identity is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
        RAISE EXCEPTION 'Bank Revaluation version must advance' USING ERRCODE='40001';
    END IF;
    IF NEW.state=OLD.state AND OLD.state<>'draft' THEN
        RAISE EXCEPTION 'Only draft Bank Revaluations may be edited' USING ERRCODE='23514';
    END IF;
    IF NEW.state<>OLD.state AND NOT (
        (OLD.state='draft' AND NEW.state='submitted') OR
        (OLD.state='submitted' AND NEW.state IN ('approved','rejected')) OR
        (OLD.state='rejected' AND NEW.state='draft') OR
        (OLD.state='approved' AND NEW.state='posted') OR
        (OLD.state='posted' AND NEW.state='reversed')
    ) THEN
        RAISE EXCEPTION 'Invalid Bank Revaluation lifecycle transition' USING ERRCODE='23514';
    END IF;
    IF NEW.state IN ('approved','rejected')
       AND NEW.decided_by=NEW.maker_user_id AND NOT NEW.super_admin_override_used THEN
        RAISE EXCEPTION 'Bank Revaluation makers cannot decide their own submission'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_revaluation_guard
    BEFORE INSERT OR UPDATE OR DELETE ON bank_revaluation
    FOR EACH ROW EXECUTE FUNCTION guard_bank_revaluation();

CREATE FUNCTION guard_bank_revaluation_line() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE header bank_revaluation%ROWTYPE; target_tenant text; target_id text;
BEGIN
    target_tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    target_id:=CASE WHEN TG_OP='DELETE' THEN OLD.revaluation_id ELSE NEW.revaluation_id END;
    SELECT * INTO header FROM bank_revaluation
     WHERE tenant_id=target_tenant AND id=target_id FOR SHARE;
    IF header.id IS NULL OR header.state<>'draft' THEN
        RAISE EXCEPTION 'Revaluation lines are mutable only while the header is draft'
            USING ERRCODE='23514';
    END IF;
    IF TG_OP<>'DELETE' AND (NEW.closing_rate,NEW.base_decimal_places)
       IS DISTINCT FROM (header.closing_rate,header.base_decimal_places) THEN
        RAISE EXCEPTION 'Revaluation line rate and base precision must match the locked header evidence'
            USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.company_id,NEW.revaluation_id,NEW.id,NEW.line_order,
                           NEW.bank_account_id,NEW.control_nominal_id,NEW.currency,NEW.created_at)
                          IS DISTINCT FROM
                          (OLD.tenant_id,OLD.company_id,OLD.revaluation_id,OLD.id,OLD.line_order,
                           OLD.bank_account_id,OLD.control_nominal_id,OLD.currency,OLD.created_at) THEN
        RAISE EXCEPTION 'Revaluation line identity is immutable' USING ERRCODE='23514';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$$;
CREATE TRIGGER bank_revaluation_line_guard
    BEFORE INSERT OR UPDATE OR DELETE ON bank_revaluation_line
    FOR EACH ROW EXECUTE FUNCTION guard_bank_revaluation_line();

CREATE FUNCTION reject_bank_revaluation_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Bank Revaluation evidence is immutable' USING ERRCODE='23514';
END
$$;
CREATE TRIGGER bank_revaluation_policy_event_immutable
    BEFORE UPDATE OR DELETE ON bank_revaluation_policy_event
    FOR EACH ROW EXECUTE FUNCTION reject_bank_revaluation_evidence_mutation();
CREATE TRIGGER bank_revaluation_event_immutable
    BEFORE UPDATE OR DELETE ON bank_revaluation_event
    FOR EACH ROW EXECUTE FUNCTION reject_bank_revaluation_evidence_mutation();

CREATE FUNCTION guard_bank_revaluation_reversal_schedule() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Revaluation reversal schedules cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.revaluation_id,NEW.scheduled_date,NEW.created_at)
           IS DISTINCT FROM
           (OLD.tenant_id,OLD.company_id,OLD.id,OLD.revaluation_id,OLD.scheduled_date,OLD.created_at) THEN
            RAISE EXCEPTION 'Revaluation reversal schedule identity is immutable' USING ERRCODE='23514';
        END IF;
        IF NEW.updated_at<=OLD.updated_at OR NEW.attempt_count<OLD.attempt_count THEN
            RAISE EXCEPTION 'Revaluation reversal attempt evidence must advance' USING ERRCODE='40001';
        END IF;
        IF OLD.state='posted' THEN
            RAISE EXCEPTION 'Posted Revaluation reversals are immutable' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_revaluation_reversal_schedule_guard
    BEFORE UPDATE OR DELETE ON bank_revaluation_reversal_schedule
    FOR EACH ROW EXECUTE FUNCTION guard_bank_revaluation_reversal_schedule();

CREATE TRIGGER bank_revaluation_policy_actor_guard
    BEFORE INSERT OR UPDATE ON bank_revaluation_policy
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('created_by','updated_by');
CREATE TRIGGER bank_revaluation_policy_event_actor_guard
    BEFORE INSERT OR UPDATE ON bank_revaluation_policy_event
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('actor_id');
CREATE TRIGGER bank_revaluation_actor_guard
    BEFORE INSERT OR UPDATE ON bank_revaluation
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors(
        'maker_user_id','approver_user_id','submitted_by','decided_by','posted_by'
    );
CREATE TRIGGER bank_revaluation_event_actor_guard
    BEFORE INSERT OR UPDATE ON bank_revaluation_event
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('actor_id');

DO $$
DECLARE relation text;
BEGIN
    FOREACH relation IN ARRAY ARRAY[
        'bank_revaluation_policy','bank_revaluation_policy_event','bank_revaluation_sequence',
        'bank_revaluation','bank_revaluation_line','bank_revaluation_event',
        'bank_revaluation_reversal_schedule'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
        EXECUTE format(
            'CREATE POLICY bank_revaluation_company_isolation ON %I '
            'USING (bank_reconciliation_company_access(tenant_id,company_id)) '
            'WITH CHECK (bank_reconciliation_company_access(tenant_id,company_id))',relation
        );
    END LOOP;
END
$$;

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('finance',30,'bank_fx_revaluation');
