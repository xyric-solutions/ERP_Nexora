-- Repair historical installed Bank trigger bodies without rewriting migration 0004.
-- Explicit variable names avoid ambiguity with approval_override_event columns.
CREATE OR REPLACE FUNCTION validate_bank_account_approval_override()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    expected_decision_actor text;
    expected_decision_action text;
BEGIN
    IF NEW.approval_override_event_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.status IN ('active','inactive','closed') THEN
        expected_decision_actor := NEW.approved_by;
        expected_decision_action := 'approve';
    ELSIF NEW.status='rejected' THEN
        expected_decision_actor := NEW.rejected_by;
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
           AND event.actor_user_id=expected_decision_actor
           AND event.decision_action=expected_decision_action
           AND event.normal_permission_key='banking.bank_account.approve'
    ) THEN
        RAISE EXCEPTION 'bank account override evidence does not match the governed decision'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('finance',10,'bank_account_override_variable_fix');
