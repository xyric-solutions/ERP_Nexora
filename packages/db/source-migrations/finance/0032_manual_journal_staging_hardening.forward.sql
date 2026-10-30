-- Staging hardening for Manual Journal separation of duties and recurring work.
-- This migration creates no Journal, accounting event or ledger posting data.

CREATE TABLE manual_journal_preparer (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    journal_id text NOT NULL,
    actor_id text NOT NULL,
    created_document boolean NOT NULL DEFAULT false,
    updated_document boolean NOT NULL DEFAULT false,
    submitted_document boolean NOT NULL DEFAULT false,
    first_prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    last_prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,journal_id,actor_id),
    FOREIGN KEY (tenant_id,company_id,journal_id)
        REFERENCES manual_journal(tenant_id,company_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,actor_id)
        REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
    CHECK (created_document OR updated_document OR submitted_document)
);
CREATE INDEX manual_journal_preparer_company
    ON manual_journal_preparer(tenant_id,company_id,actor_id,journal_id);

INSERT INTO manual_journal_preparer(
    tenant_id,company_id,journal_id,actor_id,created_document,updated_document,
    submitted_document,first_prepared_at,last_prepared_at
)
SELECT journal.tenant_id,journal.company_id,journal.id,journal.maker_user_id,
       true,false,journal.submitted_by=journal.maker_user_id,
       journal.created_at,
       greatest(journal.created_at,coalesce(journal.submitted_at,journal.created_at))
  FROM manual_journal journal
ON CONFLICT (tenant_id,journal_id,actor_id) DO UPDATE
SET created_document=true,
    submitted_document=manual_journal_preparer.submitted_document OR excluded.submitted_document,
    first_prepared_at=least(manual_journal_preparer.first_prepared_at,excluded.first_prepared_at),
    last_prepared_at=greatest(manual_journal_preparer.last_prepared_at,excluded.last_prepared_at);

INSERT INTO manual_journal_preparer(
    tenant_id,company_id,journal_id,actor_id,created_document,updated_document,
    submitted_document,first_prepared_at,last_prepared_at
)
SELECT journal.tenant_id,journal.company_id,journal.id,journal.submitted_by,
       false,false,true,journal.submitted_at,journal.submitted_at
  FROM manual_journal journal
 WHERE journal.submitted_by IS NOT NULL AND journal.submitted_at IS NOT NULL
ON CONFLICT (tenant_id,journal_id,actor_id) DO UPDATE
SET submitted_document=true,
    first_prepared_at=least(manual_journal_preparer.first_prepared_at,excluded.first_prepared_at),
    last_prepared_at=greatest(manual_journal_preparer.last_prepared_at,excluded.last_prepared_at);

INSERT INTO manual_journal_preparer(
    tenant_id,company_id,journal_id,actor_id,created_document,updated_document,
    submitted_document,first_prepared_at,last_prepared_at
)
SELECT event.tenant_id,event.company_id,event.journal_id,event.actor_id,
       bool_or(event.event_type='created'),bool_or(event.event_type='updated'),
       bool_or(event.event_type='submitted'),min(event.occurred_at),max(event.occurred_at)
  FROM manual_journal_event event
  JOIN manual_journal journal
    ON journal.tenant_id=event.tenant_id AND journal.company_id=event.company_id
   AND journal.id=event.journal_id
 WHERE event.event_type IN ('created','updated','submitted')
 GROUP BY event.tenant_id,event.company_id,event.journal_id,event.actor_id
ON CONFLICT (tenant_id,journal_id,actor_id) DO UPDATE
SET created_document=manual_journal_preparer.created_document OR excluded.created_document,
    updated_document=manual_journal_preparer.updated_document OR excluded.updated_document,
    submitted_document=manual_journal_preparer.submitted_document OR excluded.submitted_document,
    first_prepared_at=least(manual_journal_preparer.first_prepared_at,excluded.first_prepared_at),
    last_prepared_at=greatest(manual_journal_preparer.last_prepared_at,excluded.last_prepared_at);

CREATE FUNCTION capture_manual_journal_preparer() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.event_type IN ('created','updated','submitted') THEN
        INSERT INTO manual_journal_preparer(
            tenant_id,company_id,journal_id,actor_id,created_document,
            updated_document,submitted_document,first_prepared_at,last_prepared_at
        )
        SELECT NEW.tenant_id,NEW.company_id,NEW.journal_id,NEW.actor_id,
               NEW.event_type='created',NEW.event_type='updated',NEW.event_type='submitted',
               NEW.occurred_at,NEW.occurred_at
          FROM manual_journal journal
         WHERE journal.tenant_id=NEW.tenant_id AND journal.company_id=NEW.company_id
           AND journal.id=NEW.journal_id
        ON CONFLICT (tenant_id,journal_id,actor_id) DO UPDATE
        SET created_document=manual_journal_preparer.created_document OR excluded.created_document,
            updated_document=manual_journal_preparer.updated_document OR excluded.updated_document,
            submitted_document=manual_journal_preparer.submitted_document OR excluded.submitted_document,
            last_prepared_at=greatest(manual_journal_preparer.last_prepared_at,excluded.last_prepared_at);
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER manual_journal_event_preparer_capture
    AFTER INSERT ON manual_journal_event
    FOR EACH ROW EXECUTE FUNCTION capture_manual_journal_preparer();

CREATE FUNCTION enforce_manual_journal_preparer_separation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    actor_prepared boolean := false;
    override_valid boolean := false;
BEGIN
    IF TG_OP='UPDATE' AND OLD.state='submitted' AND NEW.state='posted' THEN
        SELECT EXISTS(
            SELECT 1 FROM manual_journal_preparer preparer
             WHERE preparer.tenant_id=NEW.tenant_id
               AND preparer.company_id=NEW.company_id
               AND preparer.journal_id=NEW.id
               AND preparer.actor_id=NEW.approved_by
        ) INTO actor_prepared;
        IF actor_prepared THEN
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
                RAISE EXCEPTION 'Manual Journal preparer approval requires explicit authority'
                    USING ERRCODE='23514';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER manual_journal_preparer_separation
    BEFORE UPDATE ON manual_journal
    FOR EACH ROW EXECUTE FUNCTION enforce_manual_journal_preparer_separation();

CREATE TRIGGER manual_journal_preparer_actor_guard
    BEFORE INSERT OR UPDATE ON manual_journal_preparer
    FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_company_actors('actor_id');

ALTER TABLE manual_journal_preparer ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_journal_preparer FORCE ROW LEVEL SECURITY;
CREATE POLICY manual_journal_company_isolation ON manual_journal_preparer
    USING (bank_reconciliation_company_access(tenant_id,company_id))
    WITH CHECK (bank_reconciliation_company_access(tenant_id,company_id));

ALTER TABLE recurring_journal_occurrence
    DROP CONSTRAINT recurring_journal_occurrence_state_check,
    ADD CONSTRAINT recurring_journal_occurrence_state_check
        CHECK (state IN ('pending','draft_created','draft_deleted','failed','exhausted'));
ALTER TABLE recurring_journal_occurrence
    DROP CONSTRAINT recurring_journal_occurrence_check,
    ADD CONSTRAINT recurring_journal_occurrence_check CHECK (
        (state='draft_created' AND manual_journal_id IS NOT NULL)
        OR (state IN ('pending','draft_deleted','failed','exhausted') AND manual_journal_id IS NULL)
    );

CREATE OR REPLACE FUNCTION guard_recurring_journal_occurrence() RETURNS trigger
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
           OR NEW.attempt_count<OLD.attempt_count OR NEW.attempt_count>100
           OR NEW.updated_at<=OLD.updated_at
           OR NOT (
                OLD.state='pending' AND NEW.state IN ('draft_created','failed','exhausted')
                OR OLD.state='failed' AND NEW.state IN ('draft_created','failed','exhausted')
                OR OLD.state='draft_created' AND NEW.state='draft_deleted'
           ) THEN
            RAISE EXCEPTION 'Invalid Recurring Journal occurrence transition' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$$;

UPDATE recurring_journal_occurrence
   SET state='exhausted',updated_at=clock_timestamp()
 WHERE state='failed' AND attempt_count>=100;

CREATE TABLE recurring_journal_worker_cursor (
    id text PRIMARY KEY CHECK (id='tenant_scan'),
    last_tenant_id text,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO recurring_journal_worker_cursor(id,last_tenant_id)
VALUES('tenant_scan',NULL);

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('finance',32,'manual_journal_staging_hardening');
