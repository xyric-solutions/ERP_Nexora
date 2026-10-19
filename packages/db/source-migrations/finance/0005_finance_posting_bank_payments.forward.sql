-- Governed Bank Payments persistence and Finance posting links.
-- This migration is additive; earlier Finance migration history remains immutable.

ALTER TABLE bank_account
    ADD CONSTRAINT bank_account_company_identity_unique
        UNIQUE (tenant_id,company_id,id);
ALTER TABLE account
    ADD CONSTRAINT account_company_identity_unique
        UNIQUE (tenant_id,company_id,id);
ALTER TABLE bank_account
    ADD CONSTRAINT bank_account_company_ledger_fk
        FOREIGN KEY (tenant_id,company_id,account_id)
        REFERENCES account (tenant_id,company_id,id) ON DELETE RESTRICT;
ALTER TABLE financial_period
    ADD CONSTRAINT financial_period_company_identity_unique
        UNIQUE (tenant_id,company_id,id);
ALTER TABLE journal_entry
    ADD CONSTRAINT journal_entry_company_identity_unique
        UNIQUE (tenant_id,company_id,id);

CREATE TABLE bank_payment_sequence (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 2999),
    next_value bigint NOT NULL CHECK (next_value > 0),
    PRIMARY KEY (tenant_id,company_id,fiscal_year),
    FOREIGN KEY (tenant_id,company_id)
        REFERENCES organization_unit (tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE bank_payment (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    reference text NOT NULL CHECK (length(btrim(reference)) BETWEEN 1 AND 64),
    bank_account_id text NOT NULL,
    posting_date date NOT NULL,
    value_date date,
    transaction_currency text NOT NULL CHECK (transaction_currency ~ '^[A-Z]{3}$'),
    base_currency text NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
    exchange_rate_id text,
    exchange_rate_value numeric(38,18),
    total_amount numeric(38,8) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    state text NOT NULL DEFAULT 'draft' CHECK (
        state IN ('draft','submitted','approved','rejected','posted','reversed')
    ),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    submitted_by text,
    submitted_at timestamptz,
    approved_by text,
    approved_at timestamptz,
    rejected_by text,
    rejected_at timestamptz,
    decision_reason text CHECK (
        decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 3 AND 500
    ),
    approval_override_event_id text,
    posted_by text,
    posted_at timestamptz,
    original_period_id text,
    original_accounting_event_id text,
    original_journal_entry_id text,
    reversed_by text,
    reversed_at timestamptz,
    reversal_reason text CHECK (
        reversal_reason IS NULL OR length(btrim(reversal_reason)) BETWEEN 3 AND 500
    ),
    reversal_period_id text,
    reversal_accounting_event_id text,
    reversal_journal_entry_id text,
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,id),
    UNIQUE (tenant_id,company_id,reference),
    UNIQUE (tenant_id,original_accounting_event_id),
    UNIQUE (tenant_id,original_journal_entry_id),
    UNIQUE (tenant_id,reversal_accounting_event_id),
    UNIQUE (tenant_id,reversal_journal_entry_id),
    FOREIGN KEY (tenant_id,company_id)
        REFERENCES organization_unit (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,bank_account_id)
        REFERENCES bank_account (tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,transaction_currency)
        REFERENCES currency (tenant_id,code) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,base_currency)
        REFERENCES currency (tenant_id,code) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,exchange_rate_id)
        REFERENCES currency_rate (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,created_by)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,submitted_by)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approved_by)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,rejected_by)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,posted_by)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,reversed_by)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,original_period_id)
        REFERENCES financial_period (tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,reversal_period_id)
        REFERENCES financial_period (tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,original_accounting_event_id)
        REFERENCES accounting_event (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,reversal_accounting_event_id)
        REFERENCES accounting_event (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,original_journal_entry_id)
        REFERENCES journal_entry (tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,reversal_journal_entry_id)
        REFERENCES journal_entry (tenant_id,company_id,id) ON DELETE RESTRICT,
    CONSTRAINT bank_payment_currency_evidence_check CHECK (
        (
            transaction_currency=base_currency
            AND exchange_rate_id IS NULL
            AND exchange_rate_value=1
        )
        OR (
            transaction_currency<>base_currency
            AND exchange_rate_id IS NOT NULL
            AND exchange_rate_value IS NOT NULL
            AND exchange_rate_value>0
        )
    ),
    CONSTRAINT bank_payment_lifecycle_evidence_check CHECK (
        (
            state='draft'
            AND submitted_by IS NULL AND submitted_at IS NULL
            AND approved_by IS NULL AND approved_at IS NULL
            AND rejected_by IS NULL AND rejected_at IS NULL
            AND decision_reason IS NULL AND approval_override_event_id IS NULL
            AND posted_by IS NULL AND posted_at IS NULL
            AND original_period_id IS NULL
            AND original_accounting_event_id IS NULL AND original_journal_entry_id IS NULL
            AND reversed_by IS NULL AND reversed_at IS NULL AND reversal_reason IS NULL
            AND reversal_period_id IS NULL
            AND reversal_accounting_event_id IS NULL AND reversal_journal_entry_id IS NULL
        )
        OR (
            state='submitted'
            AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND approved_by IS NULL AND approved_at IS NULL
            AND rejected_by IS NULL AND rejected_at IS NULL
            AND decision_reason IS NULL AND approval_override_event_id IS NULL
            AND posted_by IS NULL AND posted_at IS NULL
            AND original_period_id IS NULL
            AND original_accounting_event_id IS NULL AND original_journal_entry_id IS NULL
            AND reversed_by IS NULL AND reversed_at IS NULL AND reversal_reason IS NULL
            AND reversal_period_id IS NULL
            AND reversal_accounting_event_id IS NULL AND reversal_journal_entry_id IS NULL
        )
        OR (
            state='approved'
            AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND approved_by IS NOT NULL AND approved_at IS NOT NULL
            AND rejected_by IS NULL AND rejected_at IS NULL
            AND posted_by IS NULL AND posted_at IS NULL
            AND original_period_id IS NULL
            AND original_accounting_event_id IS NULL AND original_journal_entry_id IS NULL
            AND reversed_by IS NULL AND reversed_at IS NULL AND reversal_reason IS NULL
            AND reversal_period_id IS NULL
            AND reversal_accounting_event_id IS NULL AND reversal_journal_entry_id IS NULL
        )
        OR (
            state='rejected'
            AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND approved_by IS NULL AND approved_at IS NULL
            AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL
            AND decision_reason IS NOT NULL
            AND posted_by IS NULL AND posted_at IS NULL
            AND original_period_id IS NULL
            AND original_accounting_event_id IS NULL AND original_journal_entry_id IS NULL
            AND reversed_by IS NULL AND reversed_at IS NULL AND reversal_reason IS NULL
            AND reversal_period_id IS NULL
            AND reversal_accounting_event_id IS NULL AND reversal_journal_entry_id IS NULL
        )
        OR (
            state='posted'
            AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND approved_by IS NOT NULL AND approved_at IS NOT NULL
            AND rejected_by IS NULL AND rejected_at IS NULL
            AND posted_by IS NOT NULL AND posted_at IS NOT NULL
            AND original_period_id IS NOT NULL
            AND original_accounting_event_id IS NOT NULL AND original_journal_entry_id IS NOT NULL
            AND reversed_by IS NULL AND reversed_at IS NULL AND reversal_reason IS NULL
            AND reversal_period_id IS NULL
            AND reversal_accounting_event_id IS NULL AND reversal_journal_entry_id IS NULL
        )
        OR (
            state='reversed'
            AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND approved_by IS NOT NULL AND approved_at IS NOT NULL
            AND rejected_by IS NULL AND rejected_at IS NULL
            AND posted_by IS NOT NULL AND posted_at IS NOT NULL
            AND original_period_id IS NOT NULL
            AND original_accounting_event_id IS NOT NULL AND original_journal_entry_id IS NOT NULL
            AND reversed_by IS NOT NULL AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL
            AND reversal_period_id IS NOT NULL
            AND reversal_accounting_event_id IS NOT NULL AND reversal_journal_entry_id IS NOT NULL
        )
    ),
    CONSTRAINT bank_payment_decision_separation_check CHECK (
        state IN ('draft','submitted')
        OR (
            state IN ('approved','posted','reversed')
            AND (
                (
                    approved_by<>created_by
                    AND approved_by<>submitted_by
                    AND approval_override_event_id IS NULL
                )
                OR (
                    (approved_by=created_by OR approved_by=submitted_by)
                    AND approval_override_event_id IS NOT NULL
                )
            )
        )
        OR (
            state='rejected'
            AND (
                (
                    rejected_by<>created_by
                    AND rejected_by<>submitted_by
                    AND approval_override_event_id IS NULL
                )
                OR (
                    (rejected_by=created_by OR rejected_by=submitted_by)
                    AND approval_override_event_id IS NOT NULL
                )
            )
        )
    ),
    CONSTRAINT bank_payment_positive_submitted_total_check CHECK (
        state='draft' OR total_amount>0
    )
);

CREATE TABLE bank_payment_line (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    payment_id text NOT NULL,
    line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 200),
    document_date date NOT NULL,
    external_reference text NOT NULL CHECK (length(btrim(external_reference)) BETWEEN 1 AND 128),
    document_reference text CHECK (
        document_reference IS NULL OR length(document_reference) BETWEEN 1 AND 128
    ),
    payment_method text NOT NULL CHECK (
        payment_method IN ('bank_transfer','cheque','cash','online','standing_order','card')
    ),
    nominal_account_id text NOT NULL,
    narration text NOT NULL CHECK (length(btrim(narration)) BETWEEN 3 AND 500),
    amount numeric(38,8) NOT NULL CHECK (amount>0),
    dimensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(dimensions)='object' AND octet_length(dimensions::text)<=4096
    ),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,payment_id,line_number),
    UNIQUE (tenant_id,company_id,payment_id,id),
    FOREIGN KEY (tenant_id,company_id,payment_id)
        REFERENCES bank_payment (tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,nominal_account_id)
        REFERENCES account (tenant_id,company_id,id) ON DELETE RESTRICT
);

CREATE TABLE bank_payment_event (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 128),
    payment_id text NOT NULL,
    event_type text NOT NULL CHECK (
        event_type IN ('created','updated','submitted','approved','rejected','posted','reversed')
    ),
    from_state text CHECK (
        from_state IS NULL OR from_state IN ('draft','submitted','approved','rejected','posted','reversed')
    ),
    to_state text NOT NULL CHECK (
        to_state IN ('draft','submitted','approved','rejected','posted','reversed')
    ),
    actor_id text NOT NULL,
    correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 128),
    idempotency_key text NOT NULL CHECK (
        length(idempotency_key) BETWEEN 1 AND 255
        AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    ),
    platform_audit_event_id text NOT NULL,
    approval_override_event_id text,
    safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(safe_metadata)='object' AND octet_length(safe_metadata::text)<=4096
    ),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,event_id),
    UNIQUE (tenant_id,payment_id,event_type,idempotency_key),
    UNIQUE (tenant_id,platform_audit_event_id),
    FOREIGN KEY (tenant_id,company_id,payment_id)
        REFERENCES bank_payment (tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,platform_audit_event_id)
        REFERENCES platform_admin_audit_event (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT,
    CONSTRAINT bank_payment_event_transition_check CHECK (
        (event_type='created' AND from_state IS NULL AND to_state='draft')
        OR (event_type='updated' AND from_state='draft' AND to_state='draft')
        OR (event_type='submitted' AND from_state='draft' AND to_state='submitted')
        OR (event_type='approved' AND from_state='submitted' AND to_state='approved')
        OR (event_type='rejected' AND from_state='submitted' AND to_state='rejected')
        OR (event_type='posted' AND from_state='approved' AND to_state='posted')
        OR (event_type='reversed' AND from_state='posted' AND to_state='reversed')
    ),
    CONSTRAINT bank_payment_event_override_check CHECK (
        approval_override_event_id IS NULL OR event_type IN ('approved','rejected')
    )
);

CREATE INDEX idx_bank_payment_company_state_date
    ON bank_payment (tenant_id,company_id,state,posting_date DESC,id);
CREATE INDEX idx_bank_payment_company_reference
    ON bank_payment (tenant_id,company_id,reference,id);
CREATE INDEX idx_bank_payment_account_history
    ON bank_payment (tenant_id,company_id,bank_account_id,posting_date DESC,id);
CREATE INDEX idx_bank_payment_line_order
    ON bank_payment_line (tenant_id,company_id,payment_id,line_number);
CREATE INDEX idx_bank_payment_event_history
    ON bank_payment_event (tenant_id,company_id,payment_id,occurred_at,event_id);

CREATE FUNCTION validate_bank_payment_currency() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    selected_rate currency_rate%ROWTYPE;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM currency
         WHERE tenant_id=NEW.tenant_id AND code=NEW.transaction_currency AND status='active'
    ) THEN
        RAISE EXCEPTION 'payment transaction currency must be active' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM currency
         WHERE tenant_id=NEW.tenant_id AND code=NEW.base_currency
           AND status='active' AND is_base
    ) THEN
        RAISE EXCEPTION 'payment base currency must be the active tenant base currency'
            USING ERRCODE='23514';
    END IF;
    IF NEW.transaction_currency=NEW.base_currency THEN
        IF NEW.exchange_rate_id IS NOT NULL OR NEW.exchange_rate_value<>1 THEN
            RAISE EXCEPTION 'base-currency payments must use the implicit unit rate'
                USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    SELECT * INTO selected_rate FROM currency_rate
     WHERE tenant_id=NEW.tenant_id AND id=NEW.exchange_rate_id;
    IF NOT FOUND
       OR selected_rate.source_currency<>NEW.transaction_currency
       OR selected_rate.target_currency<>NEW.base_currency
       OR selected_rate.effective_date>NEW.posting_date
       OR selected_rate.rate<>NEW.exchange_rate_value THEN
        RAISE EXCEPTION 'payment exchange rate does not match its currency pair and posting date'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER bank_payment_currency_guard
    BEFORE INSERT OR UPDATE ON bank_payment
    FOR EACH ROW EXECUTE FUNCTION validate_bank_payment_currency();

CREATE FUNCTION validate_bank_payment_approval_override() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    decision_actor text;
    expected_action text;
BEGIN
    IF NEW.approval_override_event_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.state IN ('approved','posted','reversed') THEN
        decision_actor:=NEW.approved_by;
        expected_action:='approve';
    ELSIF NEW.state='rejected' THEN
        decision_actor:=NEW.rejected_by;
        expected_action:='reject';
    ELSE
        RAISE EXCEPTION 'payment override evidence is valid only for a decision'
            USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM approval_override_event event
         WHERE event.tenant_id=NEW.tenant_id
           AND event.event_id=NEW.approval_override_event_id
           AND event.resource_type='banking.payment'
           AND event.resource_id=NEW.id
           AND event.actor_user_id=decision_actor
           AND event.decision_action=expected_action
           AND event.normal_permission_key='banking.payment.approve'
    ) THEN
        RAISE EXCEPTION 'payment override evidence does not match the governed decision'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER bank_payment_approval_override_guard
    BEFORE INSERT OR UPDATE ON bank_payment
    FOR EACH ROW EXECUTE FUNCTION validate_bank_payment_approval_override();

CREATE FUNCTION enforce_bank_payment_transition() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    persisted_line_count integer;
    persisted_total numeric(38,8);
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'bank payments cannot be deleted' USING ERRCODE='P0001';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.reference IS DISTINCT FROM OLD.reference
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'bank payment identity and creation evidence are immutable'
            USING ERRCODE='P0001';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
        RAISE EXCEPTION 'bank payment version and update time must advance'
            USING ERRCODE='23514';
    END IF;
    IF NEW.state=OLD.state THEN
        IF OLD.state<>'draft' THEN
            RAISE EXCEPTION 'only draft bank payments may be edited' USING ERRCODE='P0001';
        END IF;
        RETURN NEW;
    END IF;
    IF NOT (
        (OLD.state='draft' AND NEW.state='submitted')
        OR (OLD.state='submitted' AND NEW.state IN ('approved','rejected'))
        OR (OLD.state='approved' AND NEW.state='posted')
        OR (OLD.state='posted' AND NEW.state='reversed')
    ) THEN
        RAISE EXCEPTION 'invalid bank payment lifecycle transition: % -> %',OLD.state,NEW.state
            USING ERRCODE='23514';
    END IF;
    IF OLD.state IN ('submitted','approved','posted') AND (
        NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
        OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    ) THEN
        RAISE EXCEPTION 'bank payment submission evidence is immutable'
            USING ERRCODE='P0001';
    END IF;
    IF OLD.state IN ('approved','posted') AND (
        NEW.approved_by IS DISTINCT FROM OLD.approved_by
        OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
        OR NEW.decision_reason IS DISTINCT FROM OLD.decision_reason
        OR NEW.approval_override_event_id IS DISTINCT FROM OLD.approval_override_event_id
    ) THEN
        RAISE EXCEPTION 'bank payment approval evidence is immutable'
            USING ERRCODE='P0001';
    END IF;
    IF OLD.state='posted' AND (
        NEW.posted_by IS DISTINCT FROM OLD.posted_by
        OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
        OR NEW.original_period_id IS DISTINCT FROM OLD.original_period_id
        OR NEW.original_accounting_event_id IS DISTINCT FROM OLD.original_accounting_event_id
        OR NEW.original_journal_entry_id IS DISTINCT FROM OLD.original_journal_entry_id
    ) THEN
        RAISE EXCEPTION 'bank payment posting evidence is immutable'
            USING ERRCODE='P0001';
    END IF;
    IF (
        to_jsonb(NEW)-ARRAY[
            'state','row_version','updated_at','submitted_by','submitted_at',
            'approved_by','approved_at','rejected_by','rejected_at','decision_reason',
            'approval_override_event_id','posted_by','posted_at','original_period_id',
            'original_accounting_event_id','original_journal_entry_id','reversed_by',
            'reversed_at','reversal_reason','reversal_period_id',
            'reversal_accounting_event_id','reversal_journal_entry_id'
        ]
    ) IS DISTINCT FROM (
        to_jsonb(OLD)-ARRAY[
            'state','row_version','updated_at','submitted_by','submitted_at',
            'approved_by','approved_at','rejected_by','rejected_at','decision_reason',
            'approval_override_event_id','posted_by','posted_at','original_period_id',
            'original_accounting_event_id','original_journal_entry_id','reversed_by',
            'reversed_at','reversal_reason','reversal_period_id',
            'reversal_accounting_event_id','reversal_journal_entry_id'
        ]
    ) THEN
        RAISE EXCEPTION 'bank payment business facts cannot change during a lifecycle transition'
            USING ERRCODE='P0001';
    END IF;
    IF OLD.state='draft' AND NEW.state='submitted' THEN
        SELECT count(*)::integer,coalesce(sum(amount),0)::numeric(38,8)
          INTO persisted_line_count,persisted_total
          FROM bank_payment_line
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND payment_id=NEW.id;
        IF persisted_line_count NOT BETWEEN 1 AND 200 OR persisted_total<=0
           OR persisted_total<>NEW.total_amount THEN
            RAISE EXCEPTION 'submitted payment lines must be present and match the persisted total'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER bank_payment_transition_guard
    BEFORE UPDATE OR DELETE ON bank_payment
    FOR EACH ROW EXECUTE FUNCTION enforce_bank_payment_transition();

CREATE FUNCTION validate_bank_payment_line() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    parent_state text;
    control_account_id text;
    persisted_line_count integer;
    effective_tenant text:=coalesce(NEW.tenant_id,OLD.tenant_id);
    effective_company text:=coalesce(NEW.company_id,OLD.company_id);
    effective_payment text:=coalesce(NEW.payment_id,OLD.payment_id);
BEGIN
    SELECT payment.state,account.account_id
      INTO parent_state,control_account_id
      FROM bank_payment payment
      JOIN bank_account account
        ON account.tenant_id=payment.tenant_id
       AND account.company_id=payment.company_id
       AND account.id=payment.bank_account_id
     WHERE payment.tenant_id=effective_tenant
       AND payment.company_id=effective_company
       AND payment.id=effective_payment;
    IF parent_state IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'bank payment lines may change only while the payment is draft'
            USING ERRCODE='P0001';
    END IF;
    IF TG_OP='DELETE' THEN
        RETURN OLD;
    END IF;
    IF TG_OP='UPDATE' AND (
        NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.company_id IS DISTINCT FROM OLD.company_id
        OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
        OR NEW.id IS DISTINCT FROM OLD.id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
    ) THEN
        RAISE EXCEPTION 'bank payment line identity is immutable' USING ERRCODE='P0001';
    END IF;
    IF NEW.nominal_account_id=control_account_id THEN
        RAISE EXCEPTION 'a payment nominal line cannot use the bank control account'
            USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' THEN
        SELECT count(*)::integer INTO persisted_line_count
          FROM bank_payment_line
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND payment_id=NEW.payment_id;
        IF persisted_line_count>=200 THEN
            RAISE EXCEPTION 'a bank payment cannot contain more than 200 lines'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER bank_payment_line_guard
    BEFORE INSERT OR UPDATE OR DELETE ON bank_payment_line
    FOR EACH ROW EXECUTE FUNCTION validate_bank_payment_line();

CREATE FUNCTION validate_bank_payment_posting_links() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    original_event accounting_event%ROWTYPE;
    reversal_event accounting_event%ROWTYPE;
    original_journal journal_entry%ROWTYPE;
    reversal_journal journal_entry%ROWTYPE;
BEGIN
    IF NEW.state NOT IN ('posted','reversed') THEN
        RETURN NEW;
    END IF;
    SELECT * INTO original_event FROM accounting_event
     WHERE tenant_id=NEW.tenant_id AND id=NEW.original_accounting_event_id;
    SELECT * INTO original_journal FROM journal_entry
     WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id
       AND id=NEW.original_journal_entry_id;
    IF original_event.source_type IS DISTINCT FROM 'banking.payment'
       OR original_event.source_id IS DISTINCT FROM NEW.id
       OR original_event.event_type IS DISTINCT FROM 'bank_payment.posted'
       OR original_event.state IS DISTINCT FROM 'posted'
       OR original_journal.source_type IS DISTINCT FROM 'accounting_event'
       OR original_journal.source_id IS DISTINCT FROM original_event.id
       OR original_journal.period_id IS DISTINCT FROM NEW.original_period_id
       OR original_journal.reverses_journal_id IS NOT NULL THEN
        RAISE EXCEPTION 'payment original Finance posting links are inconsistent'
            USING ERRCODE='23514';
    END IF;
    IF NEW.state='posted' THEN
        IF original_journal.status IS DISTINCT FROM 'posted'
           OR original_journal.reversed_by_journal_id IS NOT NULL THEN
            RAISE EXCEPTION 'posted payment must link one active posted journal'
                USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    SELECT * INTO reversal_event FROM accounting_event
     WHERE tenant_id=NEW.tenant_id AND id=NEW.reversal_accounting_event_id;
    SELECT * INTO reversal_journal FROM journal_entry
     WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id
       AND id=NEW.reversal_journal_entry_id;
    IF original_journal.status IS DISTINCT FROM 'reversed'
       OR original_journal.reversed_by_journal_id IS DISTINCT FROM reversal_journal.id
       OR reversal_event.source_type IS DISTINCT FROM 'banking.payment'
       OR reversal_event.source_id IS DISTINCT FROM NEW.id
       OR reversal_event.event_type IS DISTINCT FROM 'bank_payment.reversed'
       OR reversal_event.state IS DISTINCT FROM 'posted'
       OR reversal_event.compensates_event_id IS DISTINCT FROM original_event.id
       OR reversal_journal.status IS DISTINCT FROM 'posted'
       OR reversal_journal.source_type IS DISTINCT FROM 'accounting_event'
       OR reversal_journal.source_id IS DISTINCT FROM reversal_event.id
       OR reversal_journal.period_id IS DISTINCT FROM NEW.reversal_period_id
       OR reversal_journal.reverses_journal_id IS DISTINCT FROM original_journal.id THEN
        RAISE EXCEPTION 'payment reversal Finance links are inconsistent'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER bank_payment_posting_link_guard
    BEFORE INSERT OR UPDATE ON bank_payment
    FOR EACH ROW EXECUTE FUNCTION validate_bank_payment_posting_links();

CREATE FUNCTION validate_bank_payment_event_authority() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    payment_override_id text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM platform_admin_audit_event audit
         WHERE audit.tenant_id=NEW.tenant_id
           AND audit.id=NEW.platform_audit_event_id
           AND audit.actor_id=NEW.actor_id
           AND audit.correlation_id=NEW.correlation_id
           AND audit.entity_type='bank_payment'
           AND audit.entity_id=NEW.payment_id
    ) THEN
        RAISE EXCEPTION 'payment event audit evidence does not match its actor and resource'
            USING ERRCODE='23514';
    END IF;
    IF NEW.event_type IN ('approved','rejected') THEN
        SELECT approval_override_event_id INTO payment_override_id
          FROM bank_payment
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.payment_id;
        IF NEW.approval_override_event_id IS DISTINCT FROM payment_override_id THEN
            RAISE EXCEPTION 'payment decision event must retain the payment override evidence'
                USING ERRCODE='23514';
        END IF;
    END IF;
    IF NEW.approval_override_event_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM approval_override_event event
         WHERE event.tenant_id=NEW.tenant_id
           AND event.event_id=NEW.approval_override_event_id
           AND event.resource_type='banking.payment'
           AND event.resource_id=NEW.payment_id
           AND event.actor_user_id=NEW.actor_id
           AND event.decision_action=CASE NEW.event_type WHEN 'approved' THEN 'approve' ELSE 'reject' END
           AND event.normal_permission_key='banking.payment.approve'
    ) THEN
        RAISE EXCEPTION 'payment decision event override evidence is invalid'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER bank_payment_event_authority_guard
    BEFORE INSERT ON bank_payment_event
    FOR EACH ROW EXECUTE FUNCTION validate_bank_payment_event_authority();

CREATE FUNCTION protect_bank_payment_event() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    RAISE EXCEPTION 'bank payment lifecycle evidence is append-only' USING ERRCODE='P0001';
END
$function$;

CREATE TRIGGER bank_payment_event_immutable
    BEFORE UPDATE OR DELETE ON bank_payment_event
    FOR EACH ROW EXECUTE FUNCTION protect_bank_payment_event();

DO $migration$
DECLARE relation_name text;
BEGIN
    FOREACH relation_name IN ARRAY ARRAY[
        'bank_payment_sequence','bank_payment','bank_payment_line','bank_payment_event'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation_name);
        EXECUTE format(
            'CREATE POLICY %I ON %I USING (tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''nexora.tenant_id'',true))',
            relation_name||'_tenant_isolation',relation_name
        );
    END LOOP;
END
$migration$;

INSERT INTO security_permission_definition (
    permission_key,module,resource,action,description,required_assurance,
    field_context_required,source_state_context_required,sensitivity
) VALUES
('banking.payment.read','banking','payment','read','Read governed Bank Payments and their safe accounting projections.','password',false,false,'sensitive'),
('banking.payment.create','banking','payment','create','Create governed Bank Payment drafts.','password',true,true,'restricted'),
('banking.payment.update','banking','payment','update','Update governed Bank Payment drafts.','password',true,true,'restricted'),
('banking.payment.submit','banking','payment','submit','Submit governed Bank Payments for independent approval.','password',false,true,'restricted'),
('banking.payment.approve','banking','payment','approve','Approve or reject governed Bank Payments.','password',false,true,'restricted'),
('banking.payment.post','banking','payment','post','Explicitly post approved Bank Payments to Finance.','password',false,true,'restricted'),
('banking.payment.reverse','banking','payment','reverse','Create a governed compensating reversal for a posted Bank Payment.','password',false,true,'restricted')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('finance',5,'finance_posting_bank_payments');
