-- Admit governed super-administrator posting-segregation evidence on Bank Payment events.
-- Approval and rejection evidence retain their existing payment-decision linkage.

ALTER TABLE bank_payment_event
    DROP CONSTRAINT bank_payment_event_override_check,
    ADD CONSTRAINT bank_payment_event_override_check CHECK (
        approval_override_event_id IS NULL
        OR event_type IN ('approved','rejected','posted')
    );

CREATE OR REPLACE FUNCTION validate_bank_payment_event_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    payment_override_id text;
    expected_action text;
    expected_permission text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM platform_admin_audit_event audit
         WHERE audit.tenant_id=NEW.tenant_id
           AND audit.id=NEW.platform_audit_event_id
           AND audit.actor_id=NEW.actor_id
           AND audit.correlation_id=NEW.correlation_id
           AND audit.entity_type='bank_payment'
           AND audit.entity_id=NEW.payment_id
           AND audit.approval_reference IS NOT DISTINCT FROM NEW.approval_override_event_id
    ) THEN
        RAISE EXCEPTION 'payment event audit evidence does not match its actor, resource and override'
            USING ERRCODE='23514';
    END IF;

    IF NEW.event_type IN ('approved','rejected') THEN
        SELECT approval_override_event_id INTO payment_override_id
          FROM bank_payment
         WHERE tenant_id=NEW.tenant_id
           AND company_id=NEW.company_id
           AND id=NEW.payment_id;
        IF NEW.approval_override_event_id IS DISTINCT FROM payment_override_id THEN
            RAISE EXCEPTION 'payment decision event must retain the payment override evidence'
                USING ERRCODE='23514';
        END IF;
    ELSIF NEW.approval_override_event_id IS NOT NULL AND NEW.event_type<>'posted' THEN
        RAISE EXCEPTION 'payment override evidence is invalid for this lifecycle event'
            USING ERRCODE='23514';
    END IF;

    IF NEW.approval_override_event_id IS NOT NULL THEN
        expected_action:=CASE NEW.event_type
            WHEN 'approved' THEN 'approve'
            WHEN 'rejected' THEN 'reject'
            WHEN 'posted' THEN 'post'
            ELSE NULL
        END;
        expected_permission:=CASE
            WHEN NEW.event_type='posted' THEN 'banking.payment.post'
            ELSE 'banking.payment.approve'
        END;

        IF expected_action IS NULL OR NOT EXISTS (
            SELECT 1 FROM approval_override_event event
             WHERE event.tenant_id=NEW.tenant_id
               AND event.event_id=NEW.approval_override_event_id
               AND event.resource_type='banking.payment'
               AND event.resource_id=NEW.payment_id
               AND event.actor_user_id=NEW.actor_id
               AND event.correlation_id=NEW.correlation_id
               AND event.decision_action=expected_action
               AND event.normal_permission_key=expected_permission
        ) THEN
            RAISE EXCEPTION 'payment lifecycle event override evidence is invalid'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('finance',7,'bank_payment_posting_override');
