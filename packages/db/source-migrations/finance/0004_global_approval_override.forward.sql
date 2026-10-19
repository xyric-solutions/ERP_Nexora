-- Governed super-administrator maker/checker override for Bank Accounts.
-- Security 0014 owns the immutable approval_override_event authority.

ALTER TABLE bank_account
    ADD COLUMN approval_override_event_id text,
    ADD CONSTRAINT bank_account_approval_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_approval_override_evidence_check CHECK (
        (status IN ('draft','pending_approval','review_required') AND approval_override_event_id IS NULL)
        OR (
            status IN ('active','inactive','closed')
            AND (
                (
                    approved_by<>created_by
                    AND (submitted_by IS NULL OR approved_by<>submitted_by)
                    AND approval_override_event_id IS NULL
                )
                OR (
                    (approved_by=created_by OR approved_by=submitted_by)
                    AND approval_override_event_id IS NOT NULL
                )
            )
        )
        OR (
            status='rejected'
            AND (
                (
                    rejected_by<>created_by
                    AND (submitted_by IS NULL OR rejected_by<>submitted_by)
                    AND approval_override_event_id IS NULL
                )
                OR (
                    (rejected_by=created_by OR rejected_by=submitted_by)
                    AND approval_override_event_id IS NOT NULL
                )
            )
        )
    );

CREATE OR REPLACE FUNCTION enforce_bank_account_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'bank accounts cannot be deleted';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.reference IS DISTINCT FROM OLD.reference
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'bank account identity and creation evidence are immutable';
    END IF;
    IF NEW.row_version <> OLD.row_version + 1 OR NEW.updated_at <= OLD.updated_at THEN
        RAISE EXCEPTION 'bank account version and update time must advance';
    END IF;
    IF OLD.status = 'review_required' THEN
        RAISE EXCEPTION 'legacy bank account requires an explicit migration review workflow';
    END IF;
    IF NEW.status = OLD.status THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'only draft bank accounts may be edited';
        END IF;
        RETURN NEW;
    END IF;
    IF NOT (
        (OLD.status='draft' AND NEW.status='pending_approval')
        OR (OLD.status='pending_approval' AND NEW.status IN ('active','rejected'))
        OR (OLD.status='rejected' AND NEW.status='draft')
        OR (OLD.status='active' AND NEW.status='inactive')
        OR (OLD.status='inactive' AND NEW.status='closed')
    ) THEN
        RAISE EXCEPTION 'invalid bank account lifecycle transition: % -> %', OLD.status, NEW.status;
    END IF;
    IF NOT (OLD.status='rejected' AND NEW.status='draft')
       AND (to_jsonb(NEW)
            - 'status' - 'row_version' - 'updated_at'
            - 'submitted_by' - 'submitted_at' - 'submission_reason'
            - 'approved_by' - 'approved_at'
            - 'rejected_by' - 'rejected_at' - 'decision_reason'
            - 'deactivated_by' - 'deactivated_at' - 'closed_by' - 'closed_at'
            - 'approval_override_event_id')
           IS DISTINCT FROM
           (to_jsonb(OLD)
            - 'status' - 'row_version' - 'updated_at'
            - 'submitted_by' - 'submitted_at' - 'submission_reason'
            - 'approved_by' - 'approved_at'
            - 'rejected_by' - 'rejected_at' - 'decision_reason'
            - 'deactivated_by' - 'deactivated_at' - 'closed_by' - 'closed_at'
            - 'approval_override_event_id') THEN
        RAISE EXCEPTION 'bank account business fields cannot change during a lifecycle decision';
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION validate_bank_account_approval_override() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    decision_actor text;
    expected_decision_action text;
BEGIN
    IF NEW.approval_override_event_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.status IN ('active','inactive','closed') THEN
        decision_actor := NEW.approved_by;
        expected_decision_action := 'approve';
    ELSIF NEW.status='rejected' THEN
        decision_actor := NEW.rejected_by;
        expected_decision_action := 'reject';
    ELSE
        RAISE EXCEPTION 'bank account override evidence is valid only for a decision'
            USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM approval_override_event event
         WHERE event.tenant_id=NEW.tenant_id
           AND event.event_id=NEW.approval_override_event_id
           AND event.resource_type='banking.bank_account'
           AND event.resource_id=NEW.id
           AND event.actor_user_id=decision_actor
           AND event.decision_action=expected_decision_action
           AND event.normal_permission_key='banking.bank_account.approve'
    ) THEN
        RAISE EXCEPTION 'bank account override evidence does not match the governed decision'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER bank_account_approval_override_guard
    BEFORE INSERT OR UPDATE ON bank_account
    FOR EACH ROW EXECUTE FUNCTION validate_bank_account_approval_override();

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('finance',4,'global_approval_override');
