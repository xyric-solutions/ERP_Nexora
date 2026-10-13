ALTER TABLE security_user_account
    ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);

ALTER TABLE security_assignment_approval_request
    DROP CONSTRAINT security_assignment_approval_request_request_state_check,
    DROP CONSTRAINT security_assignment_approval_request_check,
    ADD COLUMN submitted_by text,
    ADD COLUMN submitted_at timestamptz,
    ADD CONSTRAINT security_assignment_approval_request_request_state_check CHECK (
        request_state IN ('draft', 'submitted', 'pending', 'approved', 'rejected')
    ),
    ADD CONSTRAINT security_assignment_approval_submitter_fk
        FOREIGN KEY (tenant_id, submitted_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT security_assignment_approval_submission_evidence CHECK (
        (submitted_by IS NULL AND submitted_at IS NULL)
        OR (submitted_by IS NOT NULL AND submitted_at IS NOT NULL)
    ),
    ADD CONSTRAINT security_assignment_approval_state_evidence CHECK (
        (
            request_state = 'draft'
            AND submitted_by IS NULL
            AND submitted_at IS NULL
            AND decided_by IS NULL
            AND decided_at IS NULL
        )
        OR
        (
            request_state = 'submitted'
            AND submitted_by IS NOT NULL
            AND submitted_at IS NOT NULL
            AND decided_by IS NULL
            AND decided_at IS NULL
        )
        OR
        (
            request_state = 'pending'
            AND decided_by IS NULL
            AND decided_at IS NULL
        )
        OR
        (
            request_state IN ('approved', 'rejected')
            AND decided_by IS NOT NULL
            AND decided_at IS NOT NULL
            AND decided_by <> requested_by
        )
    );

DROP TRIGGER security_assignment_approval_evidence
    ON security_assignment_approval_request;

CREATE FUNCTION protect_security_assignment_approval_request() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP = 'DELETE' OR OLD.request_state IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'decided security approval requests are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.request_id <> OLD.request_id
       OR NEW.requested_by <> OLD.requested_by
       OR NEW.requested_at <> OLD.requested_at THEN
        RAISE EXCEPTION 'security approval request identity is immutable'
            USING ERRCODE = 'P0001';
    END IF;
    IF OLD.request_state IN ('submitted', 'pending')
       AND (
           (
               NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
               AND NOT (
                   OLD.requested_action = 'create'
                   AND OLD.assignment_id IS NULL
                   AND NEW.assignment_id IS NOT NULL
                   AND NEW.request_state = 'approved'
               )
           )
           OR NEW.target_user_id <> OLD.target_user_id
           OR NEW.role_policy_id <> OLD.role_policy_id
           OR NEW.requested_action <> OLD.requested_action
           OR NEW.proposed_assignment <> OLD.proposed_assignment
           OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
           OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       ) THEN
        RAISE EXCEPTION 'submitted security approval proposals are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    IF NEW.row_version <> OLD.row_version + 1 THEN
        RAISE EXCEPTION 'security approval request version must advance once'
            USING ERRCODE = 'P0001';
    END IF;
    IF OLD.request_state = 'draft'
       AND NEW.request_state NOT IN ('draft', 'submitted') THEN
        RAISE EXCEPTION 'draft security approval request must be submitted first'
            USING ERRCODE = 'P0001';
    END IF;
    IF OLD.request_state IN ('submitted', 'pending')
       AND NEW.request_state NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'submitted security approval request requires a decision'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER security_assignment_approval_evidence
BEFORE UPDATE OR DELETE ON security_assignment_approval_request
FOR EACH ROW EXECUTE FUNCTION protect_security_assignment_approval_request();

CREATE UNIQUE INDEX security_governed_role_one_active_policy
    ON security_role_policy (tenant_id, role_id)
    WHERE role_id IS NOT NULL
      AND created_by IS NOT NULL
      AND lifecycle_state = 'active';

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('security', 4, 'governed_authorization_administration');
