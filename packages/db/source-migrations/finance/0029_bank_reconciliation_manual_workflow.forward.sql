-- Production manual Bank Reconciliation evidence and imported balance support.
-- This migration is additive and does not select, reconcile, post, or otherwise
-- mutate financial transactions.

ALTER TABLE bank_reconciliation
    ADD COLUMN reconciliation_date date;

UPDATE bank_reconciliation
   SET reconciliation_date=(created_at AT TIME ZONE 'UTC')::date
 WHERE reconciliation_date IS NULL;

ALTER TABLE bank_reconciliation
    ALTER COLUMN reconciliation_date SET NOT NULL,
    ADD COLUMN available_ledger_money_in numeric(38,8) NOT NULL DEFAULT 0,
    ADD COLUMN available_ledger_money_out numeric(38,8) NOT NULL DEFAULT 0,
    ADD COLUMN selected_ledger_money_in numeric(38,8) NOT NULL DEFAULT 0,
    ADD COLUMN selected_ledger_money_out numeric(38,8) NOT NULL DEFAULT 0,
    ADD COLUMN calculated_selected_balance numeric(38,8) NOT NULL DEFAULT 0,
    ADD CONSTRAINT bank_reconciliation_date_order
        CHECK (statement_date<=reconciliation_date);

ALTER TABLE bank_statement_line
    ADD COLUMN running_balance numeric(38,8);

ALTER TABLE bank_statement_import
    ADD COLUMN statement_ending_date date,
    ADD COLUMN statement_ending_balance numeric(38,8),
    ADD CONSTRAINT bank_statement_import_ending_balance_pair
        CHECK (
            (statement_ending_date IS NULL AND statement_ending_balance IS NULL)
            OR (statement_ending_date IS NOT NULL AND statement_ending_balance IS NOT NULL)
        );

CREATE TABLE bank_reconciliation_manual_selection (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    reconciliation_id text NOT NULL,
    journal_line_id text NOT NULL,
    selected boolean NOT NULL,
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    changed_by text NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,reconciliation_id,journal_line_id),
    UNIQUE (tenant_id,company_id,reconciliation_id,journal_line_id),
    FOREIGN KEY (tenant_id,company_id,reconciliation_id,journal_line_id)
        REFERENCES bank_reconciliation_ledger_line(
            tenant_id,company_id,reconciliation_id,journal_line_id
        ) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,changed_by)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE bank_reconciliation_manual_selection_event (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 128),
    reconciliation_id text NOT NULL,
    journal_line_id text NOT NULL,
    reconciliation_version bigint NOT NULL CHECK (reconciliation_version>0),
    selected boolean NOT NULL,
    actor_id text NOT NULL,
    correlation_id text NOT NULL CHECK (char_length(btrim(correlation_id)) BETWEEN 1 AND 128),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,event_id),
    FOREIGN KEY (tenant_id,company_id,reconciliation_id,journal_line_id)
        REFERENCES bank_reconciliation_ledger_line(
            tenant_id,company_id,reconciliation_id,journal_line_id
        ) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);

CREATE INDEX bank_reconciliation_manual_selection_current
    ON bank_reconciliation_manual_selection(
        tenant_id,company_id,reconciliation_id,selected,journal_line_id
    );
CREATE INDEX bank_reconciliation_manual_selection_event_history
    ON bank_reconciliation_manual_selection_event(
        tenant_id,company_id,reconciliation_id,occurred_at,event_id
    );

CREATE FUNCTION guard_bank_reconciliation_manual_selection() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target_tenant text;
    target_company text;
    target_reconciliation text;
    reconciliation bank_reconciliation%ROWTYPE;
BEGIN
    target_tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    target_company:=CASE WHEN TG_OP='DELETE' THEN OLD.company_id ELSE NEW.company_id END;
    target_reconciliation:=CASE WHEN TG_OP='DELETE' THEN OLD.reconciliation_id ELSE NEW.reconciliation_id END;

    SELECT * INTO reconciliation
      FROM bank_reconciliation
     WHERE tenant_id=target_tenant AND company_id=target_company AND id=target_reconciliation
     FOR SHARE;

    IF reconciliation.id IS NULL OR reconciliation.method<>'manual_tick' THEN
        RAISE EXCEPTION 'Manual selections require a same-company manual reconciliation'
            USING ERRCODE='23514';
    END IF;
    IF reconciliation.state NOT IN ('draft','in_progress') THEN
        RAISE EXCEPTION 'Manual selections are locked after submission' USING ERRCODE='23514';
    END IF;
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Manual selection state is append-retained' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF (NEW.tenant_id,NEW.company_id,NEW.reconciliation_id,NEW.journal_line_id,NEW.created_at)
           IS DISTINCT FROM
           (OLD.tenant_id,OLD.company_id,OLD.reconciliation_id,OLD.journal_line_id,OLD.created_at) THEN
            RAISE EXCEPTION 'Manual selection identity is immutable' USING ERRCODE='23514';
        END IF;
        IF NEW.row_version<>OLD.row_version+1 OR NEW.changed_at<=OLD.changed_at THEN
            RAISE EXCEPTION 'Manual selection version must advance' USING ERRCODE='40001';
        END IF;
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER bank_reconciliation_manual_selection_guard
    BEFORE INSERT OR UPDATE OR DELETE ON bank_reconciliation_manual_selection
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_manual_selection();

CREATE TRIGGER bank_reconciliation_manual_selection_event_immutable
    BEFORE UPDATE OR DELETE ON bank_reconciliation_manual_selection_event
    FOR EACH ROW EXECUTE FUNCTION reject_bank_reconciliation_evidence_mutation();

-- Finance 0028 originally introduced this shared actor guard. Define it here
-- as well so 0029 remains forward-compatible with databases whose recorded
-- Finance 0028 predates that additive guard definition.
CREATE OR REPLACE FUNCTION guard_bank_reconciliation_company_actors() RETURNS trigger
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

CREATE TRIGGER bank_reconciliation_manual_selection_company_actor_guard
    BEFORE INSERT OR UPDATE ON bank_reconciliation_manual_selection
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('changed_by');
CREATE TRIGGER bank_reconciliation_manual_selection_event_company_actor_guard
    BEFORE INSERT OR UPDATE ON bank_reconciliation_manual_selection_event
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('actor_id');

CREATE FUNCTION guard_bank_reconciliation_manual_extension() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.reconciliation_date IS DISTINCT FROM OLD.reconciliation_date THEN
        RAISE EXCEPTION 'Bank Reconciliation date is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_reconciliation_manual_extension_guard
    BEFORE UPDATE ON bank_reconciliation
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_manual_extension();

ALTER TABLE bank_reconciliation_manual_selection ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_manual_selection FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_reconciliation_company_isolation
    ON bank_reconciliation_manual_selection
    USING (bank_reconciliation_company_access(tenant_id,company_id))
    WITH CHECK (bank_reconciliation_company_access(tenant_id,company_id));

ALTER TABLE bank_reconciliation_manual_selection_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_manual_selection_event FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_reconciliation_company_isolation
    ON bank_reconciliation_manual_selection_event
    USING (bank_reconciliation_company_access(tenant_id,company_id))
    WITH CHECK (bank_reconciliation_company_access(tenant_id,company_id));

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('finance',29,'bank_reconciliation_manual_workflow');
