-- Governed, base-currency manual Journals and recurring draft generation.
-- This migration creates no Journal, accounting event or ledger posting data.

CREATE TABLE manual_journal_sequence (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 2999),
    next_value bigint NOT NULL CHECK (next_value>0),
    PRIMARY KEY (tenant_id,company_id,fiscal_year),
    FOREIGN KEY (tenant_id,company_id)
        REFERENCES organization_unit(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE manual_journal (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    draft_number text NOT NULL CHECK (length(btrim(draft_number)) BETWEEN 1 AND 128),
    journal_date date NOT NULL,
    reference_number text CHECK (
        reference_number IS NULL OR length(btrim(reference_number)) BETWEEN 1 AND 160
    ),
    base_currency text NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
    base_decimal_places smallint NOT NULL CHECK (base_decimal_places BETWEEN 0 AND 8),
    state text NOT NULL DEFAULT 'draft'
        CHECK (state IN ('draft','submitted','posted','reversed')),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    maker_user_id text NOT NULL,
    submitted_by text,
    submitted_at timestamptz,
    rejected_by text,
    rejected_at timestamptz,
    rejection_reason text CHECK (
        rejection_reason IS NULL OR length(btrim(rejection_reason)) BETWEEN 3 AND 500
    ),
    approved_by text,
    approved_at timestamptz,
    approval_note text CHECK (
        approval_note IS NULL OR length(btrim(approval_note)) BETWEEN 1 AND 500
    ),
    self_approval_used boolean NOT NULL DEFAULT false,
    super_admin_override_used boolean NOT NULL DEFAULT false,
    decision_evidence_id text,
    posted_by text,
    posted_at timestamptz,
    accounting_event_id text,
    journal_entry_id text,
    reversed_by text,
    reversed_at timestamptz,
    reversal_reason text CHECK (
        reversal_reason IS NULL OR length(btrim(reversal_reason)) BETWEEN 3 AND 500
    ),
    reversal_accounting_event_id text,
    reversal_journal_entry_id text,
    recurring_template_id text,
    recurring_scheduled_date date,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,id),
    UNIQUE (tenant_id,company_id,draft_number),
    UNIQUE (tenant_id,accounting_event_id),
    UNIQUE (tenant_id,journal_entry_id),
    UNIQUE (tenant_id,reversal_accounting_event_id),
    UNIQUE (tenant_id,reversal_journal_entry_id),
    UNIQUE (tenant_id,recurring_template_id,recurring_scheduled_date),
    FOREIGN KEY (tenant_id,company_id)
        REFERENCES organization_unit(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,base_currency)
        REFERENCES company_currency_profile(tenant_id,company_id,base_currency) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,maker_user_id)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,submitted_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,rejected_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approved_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,posted_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,reversed_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,decision_evidence_id)
        REFERENCES approval_override_event(tenant_id,event_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,accounting_event_id)
        REFERENCES accounting_event(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,reversal_accounting_event_id)
        REFERENCES accounting_event(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,journal_entry_id)
        REFERENCES journal_entry(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,reversal_journal_entry_id)
        REFERENCES journal_entry(tenant_id,company_id,id) ON DELETE RESTRICT,
    CHECK ((recurring_template_id IS NULL)=(recurring_scheduled_date IS NULL)),
    CHECK (NOT super_admin_override_used OR decision_evidence_id IS NOT NULL),
    CHECK (
        (state='draft' AND approved_by IS NULL AND approved_at IS NULL
         AND posted_by IS NULL AND posted_at IS NULL
         AND accounting_event_id IS NULL AND journal_entry_id IS NULL
         AND reversed_by IS NULL AND reversed_at IS NULL
         AND reversal_accounting_event_id IS NULL AND reversal_journal_entry_id IS NULL)
        OR
        (state='submitted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
         AND approved_by IS NULL AND approved_at IS NULL
         AND posted_by IS NULL AND posted_at IS NULL
         AND accounting_event_id IS NULL AND journal_entry_id IS NULL
         AND reversed_by IS NULL AND reversed_at IS NULL
         AND reversal_accounting_event_id IS NULL AND reversal_journal_entry_id IS NULL)
        OR
        (state='posted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
         AND approved_by IS NOT NULL AND approved_at IS NOT NULL
         AND posted_by IS NOT NULL AND posted_at IS NOT NULL
         AND accounting_event_id IS NOT NULL AND journal_entry_id IS NOT NULL
         AND reversed_by IS NULL AND reversed_at IS NULL
         AND reversal_accounting_event_id IS NULL AND reversal_journal_entry_id IS NULL)
        OR
        (state='reversed' AND approved_by IS NOT NULL AND approved_at IS NOT NULL
         AND posted_by IS NOT NULL AND posted_at IS NOT NULL
         AND accounting_event_id IS NOT NULL AND journal_entry_id IS NOT NULL
         AND reversed_by IS NOT NULL AND reversed_at IS NOT NULL
         AND reversal_accounting_event_id IS NOT NULL AND reversal_journal_entry_id IS NOT NULL)
    )
);
CREATE INDEX manual_journal_directory
    ON manual_journal(tenant_id,company_id,state,journal_date DESC,draft_number,id);
CREATE INDEX manual_journal_approval_queue
    ON manual_journal(tenant_id,company_id,submitted_at,draft_number,id)
    WHERE state='submitted';

CREATE TABLE manual_journal_line (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    journal_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 1000),
    account_id text NOT NULL,
    description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
    debit numeric(38,8) NOT NULL DEFAULT 0 CHECK (debit>=0),
    credit numeric(38,8) NOT NULL DEFAULT 0 CHECK (credit>=0),
    dimensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(dimensions)='object' AND octet_length(dimensions::text)<=32768
    ),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,journal_id,line_number),
    UNIQUE (tenant_id,company_id,journal_id,id),
    FOREIGN KEY (tenant_id,company_id,journal_id)
        REFERENCES manual_journal(tenant_id,company_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,company_id,account_id)
        REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
    CHECK ((debit>0 AND credit=0) OR (credit>0 AND debit=0))
);
CREATE INDEX manual_journal_line_account
    ON manual_journal_line(tenant_id,company_id,account_id,journal_id,line_number);

CREATE TABLE manual_journal_event (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    journal_id text NOT NULL CHECK (length(journal_id) BETWEEN 1 AND 128),
    event_type text NOT NULL CHECK (event_type IN (
        'created','updated','submitted','rejected','posted','reversed','deleted'
    )),
    from_state text CHECK (from_state IS NULL OR from_state IN ('draft','submitted','posted','reversed')),
    to_state text CHECK (to_state IS NULL OR to_state IN ('draft','submitted','posted','reversed')),
    resulting_version bigint NOT NULL CHECK (resulting_version>0),
    actor_id text NOT NULL,
    reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 500),
    permission_key text CHECK (permission_key IS NULL OR length(permission_key) BETWEEN 1 AND 255),
    self_approval_used boolean NOT NULL DEFAULT false,
    super_admin_override_used boolean NOT NULL DEFAULT false,
    approval_override_event_id text,
    correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 255),
    request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,actor_id,idempotency_key),
    UNIQUE (tenant_id,journal_id,resulting_version,event_type),
    FOREIGN KEY (tenant_id,actor_id)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event(tenant_id,event_id) ON DELETE RESTRICT,
    CHECK (NOT super_admin_override_used OR approval_override_event_id IS NOT NULL)
);
CREATE INDEX manual_journal_event_history
    ON manual_journal_event(tenant_id,company_id,journal_id,occurred_at,id);

-- Extend the one existing recurring-template authority. Existing templates are
-- retained but remain ineligible for generation until governance fields are set.
ALTER TABLE recurring_journal_template
    ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    ADD COLUMN start_date date,
    ADD COLUMN end_date date,
    ADD COLUMN next_scheduled_date date,
    ADD COLUMN last_generated_date date,
    ADD COLUMN base_currency text,
    ADD COLUMN reference_pattern text CHECK (
        reference_pattern IS NULL OR length(btrim(reference_pattern)) BETWEEN 1 AND 160
    ),
    ADD COLUMN narration text CHECK (
        narration IS NULL OR length(btrim(narration)) BETWEEN 1 AND 500
    ),
    ADD COLUMN created_by text,
    ADD COLUMN updated_by text,
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    ADD CONSTRAINT recurring_journal_template_date_order CHECK (
        end_date IS NULL OR start_date IS NULL OR end_date>=start_date
    ),
    ADD CONSTRAINT recurring_journal_template_generated_order CHECK (
        last_generated_date IS NULL OR start_date IS NULL OR last_generated_date>=start_date
    ),
    ADD FOREIGN KEY (tenant_id,company_id,base_currency)
        REFERENCES company_currency_profile(tenant_id,company_id,base_currency) ON DELETE RESTRICT,
    ADD FOREIGN KEY (tenant_id,created_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    ADD FOREIGN KEY (tenant_id,updated_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE recurring_journal_template
    ADD CONSTRAINT recurring_journal_template_company_identity
        UNIQUE (tenant_id,company_id,id);

CREATE TABLE recurring_journal_template_event (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    template_id text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('created','updated','activated','inactivated')),
    resulting_version bigint NOT NULL CHECK (resulting_version>0),
    actor_id text NOT NULL,
    reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500),
    correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 255),
    request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,actor_id,idempotency_key),
    UNIQUE (tenant_id,template_id,resulting_version,event_type),
    FOREIGN KEY (tenant_id,template_id)
        REFERENCES recurring_journal_template(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE recurring_journal_occurrence (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    template_id text NOT NULL,
    scheduled_date date NOT NULL,
    cycle_number bigint NOT NULL CHECK (cycle_number>0),
    state text NOT NULL CHECK (state IN ('pending','draft_created','draft_deleted','failed')),
    manual_journal_id text,
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 100),
    last_error_code text CHECK (last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 64),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,template_id,scheduled_date),
    UNIQUE (tenant_id,manual_journal_id),
    FOREIGN KEY (tenant_id,company_id,template_id)
        REFERENCES recurring_journal_template(tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,manual_journal_id)
        REFERENCES manual_journal(tenant_id,company_id,id)
        ON DELETE SET NULL (manual_journal_id),
    CHECK (
        (state='draft_created' AND manual_journal_id IS NOT NULL)
        OR (state IN ('pending','draft_deleted','failed') AND manual_journal_id IS NULL)
    )
);
CREATE INDEX recurring_journal_occurrence_history
    ON recurring_journal_occurrence(tenant_id,company_id,template_id,scheduled_date DESC,id);
CREATE INDEX recurring_journal_due
    ON recurring_journal_template(tenant_id,company_id,next_scheduled_date,id)
    WHERE status='active' AND created_by IS NOT NULL AND next_scheduled_date IS NOT NULL;

ALTER TABLE manual_journal
    ADD FOREIGN KEY (tenant_id,company_id,recurring_template_id)
        REFERENCES recurring_journal_template(tenant_id,company_id,id) ON DELETE RESTRICT;

CREATE FUNCTION guard_manual_journal() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    deleted_event boolean;
    override_valid boolean;
BEGIN
    IF TG_OP='DELETE' THEN
        IF OLD.state<>'draft' THEN
            RAISE EXCEPTION 'Only draft Manual Journals may be deleted' USING ERRCODE='23514';
        END IF;
        SELECT EXISTS(
            SELECT 1 FROM manual_journal_event event
             WHERE event.tenant_id=OLD.tenant_id AND event.company_id=OLD.company_id
               AND event.journal_id=OLD.id AND event.event_type='deleted'
               AND event.actor_id=current_setting('nexora.user_id',true)
               AND event.resulting_version=OLD.row_version
        ) INTO deleted_event;
        IF NOT deleted_event THEN
            RAISE EXCEPTION 'Draft deletion requires immutable audit evidence' USING ERRCODE='23514';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.state<>'draft' OR NEW.row_version<>1 THEN
            RAISE EXCEPTION 'New Manual Journals must be version-one drafts' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.draft_number,NEW.base_currency,
        NEW.base_decimal_places,NEW.maker_user_id,NEW.recurring_template_id,
        NEW.recurring_scheduled_date,NEW.created_at)
       IS DISTINCT FROM
       (OLD.tenant_id,OLD.company_id,OLD.id,OLD.draft_number,OLD.base_currency,
        OLD.base_decimal_places,OLD.maker_user_id,OLD.recurring_template_id,
        OLD.recurring_scheduled_date,OLD.created_at) THEN
        RAISE EXCEPTION 'Manual Journal identity and currency are immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
        RAISE EXCEPTION 'Manual Journal version must advance' USING ERRCODE='40001';
    END IF;
    IF NEW.state=OLD.state AND OLD.state<>'draft' THEN
        RAISE EXCEPTION 'Only draft Manual Journals may be edited' USING ERRCODE='23514';
    END IF;
    IF NEW.state<>OLD.state AND NOT (
        (OLD.state='draft' AND NEW.state='submitted') OR
        (OLD.state='submitted' AND NEW.state IN ('draft','posted')) OR
        (OLD.state='posted' AND NEW.state='reversed')
    ) THEN
        RAISE EXCEPTION 'Invalid Manual Journal lifecycle transition' USING ERRCODE='23514';
    END IF;
    IF OLD.state<>'draft' AND (NEW.journal_date,NEW.reference_number)
       IS DISTINCT FROM (OLD.journal_date,OLD.reference_number) THEN
        RAISE EXCEPTION 'Submitted Manual Journal business fields are immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.state='posted' AND OLD.state='submitted' THEN
        IF NOT bank_has_live_permission(
            NEW.tenant_id,NEW.company_id,NEW.approved_by,'finance.journal.approve'
        ) THEN
            RAISE EXCEPTION 'Manual Journal approver lacks live company authority' USING ERRCODE='23514';
        END IF;
        IF NEW.approved_by=NEW.maker_user_id THEN
            SELECT EXISTS(
                SELECT 1 FROM approval_override_event evidence
                 WHERE evidence.tenant_id=NEW.tenant_id
                   AND evidence.event_id=NEW.decision_evidence_id
                   AND evidence.resource_type='finance.manual_journal'
                   AND evidence.resource_id=NEW.id
                   AND evidence.decision_action='post'
                   AND evidence.actor_user_id=NEW.approved_by
                   AND evidence.normal_permission_key='finance.journal.approve'
            ) INTO override_valid;
            IF NOT (
                NEW.self_approval_used AND bank_has_live_permission(
                    NEW.tenant_id,NEW.company_id,NEW.approved_by,'finance.journal.self_approve'
                )
                OR NEW.super_admin_override_used AND COALESCE(override_valid,false)
            ) THEN
                RAISE EXCEPTION 'Manual Journal self-approval requires explicit authority'
                    USING ERRCODE='23514';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER manual_journal_guard
    BEFORE INSERT OR UPDATE OR DELETE ON manual_journal
    FOR EACH ROW EXECUTE FUNCTION guard_manual_journal();

CREATE FUNCTION guard_manual_journal_line() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    header manual_journal%ROWTYPE;
    target_tenant text;
    target_journal text;
    nominal account%ROWTYPE;
BEGIN
    target_tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    target_journal:=CASE WHEN TG_OP='DELETE' THEN OLD.journal_id ELSE NEW.journal_id END;
    SELECT * INTO header FROM manual_journal
     WHERE tenant_id=target_tenant AND id=target_journal FOR SHARE;
    -- A parent-driven ON DELETE CASCADE runs after the guarded draft header is
    -- no longer visible. Direct line deletion still finds and validates it.
    IF TG_OP='DELETE' AND header.id IS NULL THEN
        RETURN OLD;
    END IF;
    IF header.id IS NULL OR header.state<>'draft' THEN
        RAISE EXCEPTION 'Manual Journal lines are mutable only while draft' USING ERRCODE='23514';
    END IF;
    IF TG_OP<>'DELETE' THEN
        SELECT * INTO nominal FROM account
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.account_id FOR SHARE;
        IF nominal.id IS NULL OR nominal.status<>'active' OR nominal.is_header
           OR NOT nominal.manual_posting_allowed OR nominal.is_system_account
           OR nominal.managed_bank_nominal OR NOT nominal.managed_general_nominal
           OR NOT EXISTS (
                SELECT 1 FROM finance_general_nominal governed
                 WHERE governed.tenant_id=nominal.tenant_id
                   AND governed.company_id=nominal.company_id
                   AND governed.nominal_id=nominal.id AND governed.state='active'
           ) THEN
            RAISE EXCEPTION 'Manual Journal requires an active ordinary postable company nominal'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$$;
CREATE TRIGGER manual_journal_line_guard
    BEFORE INSERT OR UPDATE OR DELETE ON manual_journal_line
    FOR EACH ROW EXECUTE FUNCTION guard_manual_journal_line();

CREATE FUNCTION reject_manual_journal_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Manual Journal evidence is immutable' USING ERRCODE='23514';
END
$$;
CREATE TRIGGER manual_journal_event_immutable
    BEFORE UPDATE OR DELETE ON manual_journal_event
    FOR EACH ROW EXECUTE FUNCTION reject_manual_journal_evidence_mutation();
CREATE TRIGGER recurring_journal_template_event_immutable
    BEFORE UPDATE OR DELETE ON recurring_journal_template_event
    FOR EACH ROW EXECUTE FUNCTION reject_manual_journal_evidence_mutation();

CREATE FUNCTION guard_recurring_journal_template() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Recurring Journal templates cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.row_version<>1 OR NEW.created_by IS NULL OR NEW.updated_by IS NULL
           OR NEW.start_date IS NULL OR NEW.next_scheduled_date IS NULL
           OR NEW.base_currency IS NULL OR NEW.narration IS NULL THEN
            RAISE EXCEPTION 'New Recurring Journal template lacks governed fields' USING ERRCODE='23514';
        END IF;
    ELSE
        IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.created_by,NEW.created_at)
           IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.created_by,OLD.created_at)
           OR NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
            RAISE EXCEPTION 'Recurring Journal template identity or version is invalid'
                USING ERRCODE='40001';
        END IF;
    END IF;
    IF NEW.status='active' AND (
        NEW.created_by IS NULL OR NEW.updated_by IS NULL OR NEW.start_date IS NULL
        OR NEW.next_scheduled_date IS NULL OR NEW.base_currency IS NULL OR NEW.narration IS NULL
        OR jsonb_typeof(NEW.lines)<>'array' OR jsonb_array_length(NEW.lines)<2
    ) THEN
        RAISE EXCEPTION 'Active Recurring Journal template lacks complete governed evidence'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER recurring_journal_template_guard
    BEFORE INSERT OR UPDATE OR DELETE ON recurring_journal_template
    FOR EACH ROW EXECUTE FUNCTION guard_recurring_journal_template();

CREATE FUNCTION guard_recurring_journal_occurrence() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Recurring Journal occurrences are immutable' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.template_id,NEW.scheduled_date,
            NEW.cycle_number,NEW.created_at)
           IS DISTINCT FROM
           (OLD.tenant_id,OLD.company_id,OLD.id,OLD.template_id,OLD.scheduled_date,
            OLD.cycle_number,OLD.created_at)
           OR NEW.attempt_count<OLD.attempt_count OR NEW.updated_at<=OLD.updated_at
           OR NOT (
                OLD.state='pending' AND NEW.state IN ('draft_created','failed')
                OR OLD.state='failed' AND NEW.state IN ('draft_created','failed')
                OR OLD.state='draft_created' AND NEW.state='draft_deleted'
           ) THEN
            RAISE EXCEPTION 'Invalid Recurring Journal occurrence transition' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER recurring_journal_occurrence_guard
    BEFORE UPDATE OR DELETE ON recurring_journal_occurrence
    FOR EACH ROW EXECUTE FUNCTION guard_recurring_journal_occurrence();

CREATE TRIGGER manual_journal_actor_guard
    BEFORE INSERT OR UPDATE ON manual_journal
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors(
        'maker_user_id','submitted_by','rejected_by','approved_by','posted_by','reversed_by'
    );
CREATE TRIGGER manual_journal_event_actor_guard
    BEFORE INSERT OR UPDATE ON manual_journal_event
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('actor_id');
CREATE TRIGGER recurring_journal_template_actor_guard
    BEFORE INSERT OR UPDATE ON recurring_journal_template
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('created_by','updated_by');
CREATE TRIGGER recurring_journal_template_event_actor_guard
    BEFORE INSERT OR UPDATE ON recurring_journal_template_event
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('actor_id');

DROP POLICY recurring_journal_template_tenant_isolation ON recurring_journal_template;
DO $$
DECLARE relation text;
BEGIN
    FOREACH relation IN ARRAY ARRAY[
        'manual_journal_sequence','manual_journal','manual_journal_line','manual_journal_event',
        'recurring_journal_template','recurring_journal_template_event','recurring_journal_occurrence'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
        EXECUTE format(
            'CREATE POLICY manual_journal_company_isolation ON %I '
            'USING (bank_reconciliation_company_access(tenant_id,company_id)) '
            'WITH CHECK (bank_reconciliation_company_access(tenant_id,company_id))',relation
        );
    END LOOP;
END
$$;

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('finance',31,'manual_journals');
