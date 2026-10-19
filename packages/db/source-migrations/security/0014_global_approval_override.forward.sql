ALTER TABLE security_role_policy
    ADD CONSTRAINT security_role_policy_override_evidence_unique
        UNIQUE (tenant_id,id,role);
ALTER TABLE security_user_role_assignment
    ADD CONSTRAINT security_assignment_override_evidence_unique
        UNIQUE (tenant_id,assignment_id,user_id,role_policy_id);
ALTER TABLE security_user_role_assignment_version
    ADD CONSTRAINT security_assignment_version_override_evidence_unique
        UNIQUE (tenant_id,assignment_id,version,user_id,role_policy_id);

CREATE TABLE approval_override_event (
    tenant_id text NOT NULL,
    event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 128),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    resource_type text NOT NULL CHECK (resource_type ~ '^[a-z][a-z0-9_.]{1,127}$'),
    resource_id text NOT NULL CHECK (length(resource_id) BETWEEN 1 AND 256),
    decision_action text NOT NULL CHECK (decision_action IN ('approve','reject','activate')),
    actor_user_id text NOT NULL,
    role_code text NOT NULL CHECK (role_code = 'super_administrator'),
    role_policy_id text NOT NULL,
    role_assignment_id text NOT NULL,
    role_assignment_version bigint NOT NULL CHECK (role_assignment_version > 0),
    normal_permission_key text NOT NULL,
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 512),
    correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 128),
    idempotency_key text NOT NULL CHECK (
        length(idempotency_key) BETWEEN 1 AND 255
        AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    ),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(metadata) = 'object'
        AND octet_length(metadata::text) <= 4096
    ),
    PRIMARY KEY (tenant_id,event_id),
    UNIQUE (tenant_id,actor_user_id,idempotency_key),
    UNIQUE (tenant_id,resource_type,resource_id,decision_action,idempotency_key),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_user_id)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,role_policy_id)
        REFERENCES security_role_policy (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,role_policy_id,role_code)
        REFERENCES security_role_policy (tenant_id,id,role) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,role_assignment_id)
        REFERENCES security_user_role_assignment (tenant_id,assignment_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,role_assignment_id,actor_user_id,role_policy_id)
        REFERENCES security_user_role_assignment
            (tenant_id,assignment_id,user_id,role_policy_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,role_assignment_id,role_assignment_version)
        REFERENCES security_user_role_assignment_version (tenant_id,assignment_id,version) ON DELETE RESTRICT,
    FOREIGN KEY (
        tenant_id,role_assignment_id,role_assignment_version,actor_user_id,role_policy_id
    ) REFERENCES security_user_role_assignment_version
        (tenant_id,assignment_id,version,user_id,role_policy_id) ON DELETE RESTRICT,
    FOREIGN KEY (normal_permission_key)
        REFERENCES security_permission_definition (permission_key) ON DELETE RESTRICT
);

CREATE INDEX approval_override_event_resource_history
    ON approval_override_event (tenant_id,resource_type,resource_id,occurred_at,event_id);
CREATE INDEX approval_override_event_actor_history
    ON approval_override_event (tenant_id,actor_user_id,occurred_at DESC,event_id);

CREATE FUNCTION reject_approval_override_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    RAISE EXCEPTION 'approval override events are append-only' USING ERRCODE='P0001';
END
$function$;

CREATE TRIGGER approval_override_event_immutable
BEFORE UPDATE OR DELETE ON approval_override_event
FOR EACH ROW EXECUTE FUNCTION reject_approval_override_event_mutation();

ALTER TABLE approval_override_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_override_event FORCE ROW LEVEL SECURITY;
CREATE POLICY approval_override_event_tenant_isolation ON approval_override_event
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

ALTER TABLE security_role_approval_request ADD COLUMN approval_override_event_id text;
ALTER TABLE security_assignment_approval_request ADD COLUMN approval_override_event_id text;
ALTER TABLE security_user_change_request ADD COLUMN approval_override_event_id text;
ALTER TABLE security_session_policy ADD COLUMN approval_override_event_id text;
ALTER TABLE security_session_policy ADD COLUMN activation_override_event_id text;
ALTER TABLE security_access_review_campaign ADD COLUMN approval_override_event_id text;
ALTER TABLE security_delegation ADD COLUMN approval_override_event_id text;
ALTER TABLE security_impersonation_request ADD COLUMN approval_override_event_id text;

ALTER TABLE security_role_approval_request
    ADD CONSTRAINT security_role_approval_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE security_assignment_approval_request
    ADD CONSTRAINT security_assignment_approval_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE security_user_change_request
    ADD CONSTRAINT security_user_change_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE security_session_policy
    ADD CONSTRAINT security_session_policy_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE security_session_policy
    ADD CONSTRAINT security_session_policy_activation_override_event_fk
        FOREIGN KEY (tenant_id,activation_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE security_access_review_campaign
    ADD CONSTRAINT security_access_review_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE security_delegation
    ADD CONSTRAINT security_delegation_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE security_impersonation_request
    ADD CONSTRAINT security_impersonation_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;

DO $migration$
DECLARE existing_constraint record;
BEGIN
    FOR existing_constraint IN
        SELECT conrelid::regclass AS relation_name,conname
          FROM pg_constraint
         WHERE contype='c'
           AND conrelid=ANY(ARRAY[
               'security_role_approval_request'::regclass,
               'security_assignment_approval_request'::regclass,
               'security_user_change_request'::regclass
           ])
           AND pg_get_constraintdef(oid) LIKE '%decided_by <> requested_by%'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',existing_constraint.relation_name,existing_constraint.conname);
    END LOOP;
END
$migration$;

ALTER TABLE security_role_approval_request
    ADD CONSTRAINT security_role_approval_state_evidence_v2 CHECK (
        (request_state='pending' AND decided_by IS NULL AND decided_at IS NULL AND approval_override_event_id IS NULL)
        OR (
            request_state IN ('approved','rejected')
            AND decided_by IS NOT NULL
            AND decided_at IS NOT NULL
            AND (
                (decided_by<>requested_by AND approval_override_event_id IS NULL)
                OR (decided_by=requested_by AND approval_override_event_id IS NOT NULL)
            )
        )
    );

ALTER TABLE security_assignment_approval_request
    ADD CONSTRAINT security_assignment_approval_state_evidence_v2 CHECK (
        (
            request_state='draft'
            AND submitted_by IS NULL AND submitted_at IS NULL
            AND decided_by IS NULL AND decided_at IS NULL
            AND approval_override_event_id IS NULL
        )
        OR (
            request_state='submitted'
            AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND decided_by IS NULL AND decided_at IS NULL
            AND approval_override_event_id IS NULL
        )
        OR (request_state='pending' AND decided_by IS NULL AND decided_at IS NULL AND approval_override_event_id IS NULL)
        OR (
            request_state IN ('approved','rejected')
            AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND (
                (
                    decided_by<>requested_by
                    AND (submitted_by IS NULL OR decided_by<>submitted_by)
                    AND approval_override_event_id IS NULL
                )
                OR (
                    (decided_by=requested_by OR decided_by=submitted_by)
                    AND approval_override_event_id IS NOT NULL
                )
            )
        )
    );

ALTER TABLE security_user_change_request
    ADD CONSTRAINT security_user_change_state_evidence_v2 CHECK (
        (
            request_state='draft'
            AND submitted_by IS NULL AND submitted_at IS NULL
            AND decided_by IS NULL AND decided_at IS NULL AND decision_reason IS NULL
            AND approval_override_event_id IS NULL
        )
        OR (
            request_state='submitted'
            AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND decided_by IS NULL AND decided_at IS NULL AND decision_reason IS NULL
            AND approval_override_event_id IS NULL
        )
        OR (
            request_state IN ('approved','rejected')
            AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL
            AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND (request_state='approved' OR length(btrim(decision_reason)) BETWEEN 1 AND 512)
            AND (
                (
                    decided_by<>requested_by AND decided_by<>submitted_by
                    AND approval_override_event_id IS NULL
                )
                OR (
                    (decided_by=requested_by OR decided_by=submitted_by)
                    AND approval_override_event_id IS NOT NULL
                )
            )
        )
    );

CREATE OR REPLACE FUNCTION protect_security_approval_request() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP = 'DELETE' OR OLD.request_state <> 'pending' THEN
        RAISE EXCEPTION 'decided security approval requests are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    IF (
        to_jsonb(NEW) - ARRAY[
            'request_state', 'decided_by', 'decided_at',
            'decision_reason', 'row_version', 'approval_override_event_id'
        ]
    ) <> (
        to_jsonb(OLD) - ARRAY[
            'request_state', 'decided_by', 'decided_at',
            'decision_reason', 'row_version', 'approval_override_event_id'
        ]
    ) THEN
        RAISE EXCEPTION 'security approval request identity is immutable'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END
$function$;

CREATE FUNCTION enforce_security_approval_override_transition() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
    row_data jsonb := to_jsonb(NEW);
    old_data jsonb := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
    lifecycle_state text := row_data->>'lifecycle_state';
    decision_actor text := coalesce(row_data->>'approved_by',row_data->>'rejected_by');
    maker_one text := row_data->>TG_ARGV[0];
    maker_two text := row_data->>TG_ARGV[1];
    same_actor boolean;
    decision_changed boolean;
    activation_changed boolean;
BEGIN
    decision_changed := TG_OP='INSERT'
        OR old_data->>'lifecycle_state' IS DISTINCT FROM lifecycle_state
        OR old_data->>'approved_by' IS DISTINCT FROM row_data->>'approved_by'
        OR old_data->>'rejected_by' IS DISTINCT FROM row_data->>'rejected_by'
        OR old_data->>'approval_override_event_id' IS DISTINCT FROM row_data->>'approval_override_event_id';
    IF lifecycle_state IN ('approved','rejected') AND decision_changed THEN
        same_actor := decision_actor IS NOT NULL
            AND (decision_actor=maker_one OR (maker_two IS NOT NULL AND decision_actor=maker_two));
        IF same_actor <> (NEW.approval_override_event_id IS NOT NULL) THEN
            RAISE EXCEPTION 'same-actor Security approval requires governed override evidence'
                USING ERRCODE='23514';
        END IF;
    END IF;

    IF TG_TABLE_NAME='security_session_policy' THEN
        activation_changed := TG_OP='INSERT'
            OR old_data->>'lifecycle_state' IS DISTINCT FROM lifecycle_state
            OR old_data->>'activated_by' IS DISTINCT FROM row_data->>'activated_by'
            OR old_data->>'activation_override_event_id' IS DISTINCT FROM row_data->>'activation_override_event_id';
        IF lifecycle_state='active' AND activation_changed THEN
            same_actor := row_data->>'activated_by' IS NOT NULL
                AND (
                    row_data->>'activated_by'=maker_one
                    OR (maker_two IS NOT NULL AND row_data->>'activated_by'=maker_two)
                );
            IF same_actor <> (row_data->>'activation_override_event_id' IS NOT NULL) THEN
                RAISE EXCEPTION 'same-actor Security activation requires governed override evidence'
                    USING ERRCODE='23514';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER security_session_policy_override_requirement
BEFORE INSERT OR UPDATE ON security_session_policy
FOR EACH ROW EXECUTE FUNCTION enforce_security_approval_override_transition('created_by','submitted_by');
CREATE TRIGGER security_access_review_override_requirement
BEFORE INSERT OR UPDATE ON security_access_review_campaign
FOR EACH ROW EXECUTE FUNCTION enforce_security_approval_override_transition('owner_id','submitted_by');
CREATE TRIGGER security_delegation_override_requirement
BEFORE INSERT OR UPDATE ON security_delegation
FOR EACH ROW EXECUTE FUNCTION enforce_security_approval_override_transition('delegator_id','submitted_by');
CREATE TRIGGER security_impersonation_override_requirement
BEFORE INSERT OR UPDATE ON security_impersonation_request
FOR EACH ROW EXECUTE FUNCTION enforce_security_approval_override_transition('actor_id','submitted_by');

CREATE FUNCTION validate_security_approval_override_reference() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
    row_data jsonb := to_jsonb(NEW);
    override_event_id text;
    decision_actor text;
    expected_decision_action text;
BEGIN
    override_event_id := row_data->>coalesce(TG_ARGV[2],'approval_override_event_id');
    IF override_event_id IS NULL THEN RETURN NEW; END IF;
    IF TG_NARGS>=5 THEN
        decision_actor := row_data->>TG_ARGV[3];
        expected_decision_action := TG_ARGV[4];
    ELSE
        decision_actor := coalesce(row_data->>'decided_by',row_data->>'approved_by',row_data->>'rejected_by');
        IF row_data->>'decided_by' IS NOT NULL THEN
            expected_decision_action := CASE WHEN row_data->>'request_state'='approved' THEN 'approve' ELSE 'reject' END;
        ELSE
            expected_decision_action := CASE WHEN row_data->>'approved_by' IS NOT NULL THEN 'approve' ELSE 'reject' END;
        END IF;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM approval_override_event event
         WHERE event.tenant_id=NEW.tenant_id
           AND event.event_id=override_event_id
           AND event.resource_type=TG_ARGV[0]
           AND event.resource_id=row_data->>TG_ARGV[1]
           AND event.actor_user_id=decision_actor
           AND event.decision_action=expected_decision_action
    ) THEN
        RAISE EXCEPTION 'approval override event does not match the governed decision'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER security_role_approval_override_guard
BEFORE INSERT OR UPDATE ON security_role_approval_request
FOR EACH ROW EXECUTE FUNCTION validate_security_approval_override_reference('security.role_approval_request','request_id');
CREATE TRIGGER security_assignment_approval_override_guard
BEFORE INSERT OR UPDATE ON security_assignment_approval_request
FOR EACH ROW EXECUTE FUNCTION validate_security_approval_override_reference('security.assignment_approval_request','request_id');
CREATE TRIGGER security_user_change_override_guard
BEFORE INSERT OR UPDATE ON security_user_change_request
FOR EACH ROW EXECUTE FUNCTION validate_security_approval_override_reference('security.user_change_request','request_id');
CREATE TRIGGER security_session_policy_override_guard
BEFORE INSERT OR UPDATE ON security_session_policy
FOR EACH ROW EXECUTE FUNCTION validate_security_approval_override_reference('security.session_policy','policy_id');
CREATE TRIGGER security_session_policy_activation_override_guard
BEFORE INSERT OR UPDATE ON security_session_policy
FOR EACH ROW EXECUTE FUNCTION validate_security_approval_override_reference(
    'security.session_policy','policy_id','activation_override_event_id','activated_by','activate'
);
CREATE TRIGGER security_access_review_override_guard
BEFORE INSERT OR UPDATE ON security_access_review_campaign
FOR EACH ROW EXECUTE FUNCTION validate_security_approval_override_reference('security.access_review_campaign','campaign_id');
CREATE TRIGGER security_delegation_override_guard
BEFORE INSERT OR UPDATE ON security_delegation
FOR EACH ROW EXECUTE FUNCTION validate_security_approval_override_reference('security.delegation','delegation_id');
CREATE TRIGGER security_impersonation_override_guard
BEFORE INSERT OR UPDATE ON security_impersonation_request
FOR EACH ROW EXECUTE FUNCTION validate_security_approval_override_reference('security.impersonation_request','request_id');

INSERT INTO security_permission_definition (
    permission_key,module,resource,action,description,required_assurance,
    field_context_required,source_state_context_required,sensitivity
) VALUES (
    'platform.approval.override','platform','approval','override',
    'Override maker/checker separation as a governed super administrator.',
    'password',false,false,'restricted'
) ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('security',14,'global_approval_override');
