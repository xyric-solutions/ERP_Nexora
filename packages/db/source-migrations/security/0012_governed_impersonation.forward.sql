CREATE TABLE security_emergency_impersonation_principal (
    tenant_id text NOT NULL PRIMARY KEY REFERENCES tenant (id) ON DELETE RESTRICT,
    user_id text NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    designated_by text NOT NULL,
    source_reference text NOT NULL,
    designated_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    FOREIGN KEY (tenant_id,user_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,designated_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE security_impersonation_request (
    tenant_id text NOT NULL,
    request_id text NOT NULL,
    actor_id text NOT NULL,
    target_user_id text NOT NULL,
    purpose text NOT NULL CHECK (length(purpose) BETWEEN 1 AND 512),
    duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 60),
    lifecycle_state text NOT NULL DEFAULT 'draft' CHECK (
        lifecycle_state IN ('draft','submitted','approved','active','rejected','ended','expired','activation_failed')
    ),
    emergency_activation boolean NOT NULL DEFAULT false,
    submitted_by text,
    submitted_at timestamptz,
    approved_by text,
    approved_at timestamptz,
    rejected_by text,
    rejected_at timestamptz,
    rejection_reason text,
    activated_by text,
    activated_at timestamptz,
    active_session_id text,
    target_session_version integer,
    expires_at timestamptz,
    ended_by text,
    ended_at timestamptz,
    end_reason text,
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,request_id),
    FOREIGN KEY (tenant_id,actor_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,target_user_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,submitted_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approved_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,rejected_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,activated_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,ended_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    CHECK (actor_id<>target_user_id),
    CHECK (rejection_reason IS NULL OR length(rejection_reason) BETWEEN 1 AND 512),
    CHECK (end_reason IS NULL OR length(end_reason) BETWEEN 1 AND 512),
    CHECK (lifecycle_state<>'active' OR (active_session_id IS NOT NULL AND target_session_version IS NOT NULL AND expires_at IS NOT NULL))
);

CREATE UNIQUE INDEX security_impersonation_one_active_session
    ON security_impersonation_request (tenant_id,active_session_id)
    WHERE lifecycle_state='active';
CREATE INDEX security_impersonation_principal_state
    ON security_impersonation_request (tenant_id,actor_id,target_user_id,lifecycle_state,created_at DESC);

CREATE TABLE security_impersonation_event (
    tenant_id text NOT NULL,
    event_id text NOT NULL,
    request_id text NOT NULL,
    event_type text NOT NULL CHECK (
        event_type IN ('created','submitted','approved','rejected','activated','emergency_activated','ended','expired','activation_failed')
    ),
    real_actor_id text NOT NULL,
    effective_actor_id text NOT NULL,
    reason text,
    state_snapshot jsonb NOT NULL CHECK (jsonb_typeof(state_snapshot)='object'),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,event_id),
    FOREIGN KEY (tenant_id,request_id) REFERENCES security_impersonation_request (tenant_id,request_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,real_actor_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,effective_actor_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 512)
);

CREATE INDEX security_impersonation_event_history
    ON security_impersonation_event (tenant_id,request_id,occurred_at,event_id);

CREATE FUNCTION reject_security_impersonation_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    RAISE EXCEPTION 'security impersonation events are append-only' USING ERRCODE='P0001';
END
$function$;
CREATE TRIGGER security_impersonation_event_immutable
BEFORE UPDATE OR DELETE ON security_impersonation_event
FOR EACH ROW EXECUTE FUNCTION reject_security_impersonation_event_mutation();

ALTER TABLE security_emergency_impersonation_principal ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_emergency_impersonation_principal FORCE ROW LEVEL SECURITY;
CREATE POLICY security_emergency_impersonation_principal_tenant ON security_emergency_impersonation_principal
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE security_impersonation_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_impersonation_request FORCE ROW LEVEL SECURITY;
CREATE POLICY security_impersonation_request_tenant ON security_impersonation_request
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE security_impersonation_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_impersonation_event FORCE ROW LEVEL SECURITY;
CREATE POLICY security_impersonation_event_tenant ON security_impersonation_event
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

INSERT INTO security_permission_definition (
    permission_key,module,resource,action,description,required_assurance,
    field_context_required,source_state_context_required,sensitivity
)
VALUES
    ('security.impersonation.read','security','impersonation','read','Read governed impersonation requests and sessions.','password',false,false,'sensitive'),
    ('security.impersonation.create','security','impersonation','create','Create a bounded impersonation request.','password',true,true,'restricted'),
    ('security.impersonation.submit','security','impersonation','submit','Submit an impersonation request for approval.','password',false,true,'restricted'),
    ('security.impersonation.approve','security','impersonation','approve','Approve or reject an impersonation request.','password',false,true,'restricted'),
    ('security.impersonation.activate','security','impersonation','activate','Activate an independently approved impersonation session.','password',false,true,'restricted'),
    ('security.impersonation.emergency_activate','security','impersonation','emergency_activate','Activate impersonation as the single designated emergency principal.','password',false,true,'restricted'),
    ('security.impersonation.end','security','impersonation','end','End an active impersonation session.','password',false,true,'restricted')
ON CONFLICT (permission_key) DO NOTHING;

WITH candidate AS (
    SELECT DISTINCT assignment.tenant_id,assignment.user_id
      FROM security_user_role_assignment_version assignment
      JOIN security_user_account account
        ON account.tenant_id=assignment.tenant_id AND account.id=assignment.user_id
       AND account.status='active' AND account.archived_at IS NULL
      JOIN security_role_policy policy
        ON policy.tenant_id=assignment.tenant_id AND policy.id=assignment.role_policy_id
       AND policy.status='active' AND policy.lifecycle_state='active'
      JOIN security_role_permission_grant permission_grant
        ON permission_grant.tenant_id=policy.tenant_id AND permission_grant.role_policy_id=policy.id
       AND permission_grant.permission_key='security.authorization.administer'
     WHERE assignment.version=(SELECT max(latest.version) FROM security_user_role_assignment_version latest
       WHERE latest.tenant_id=assignment.tenant_id AND latest.assignment_id=assignment.assignment_id)
       AND assignment.lifecycle_state='active' AND assignment.valid_from<=now()
       AND (assignment.valid_until IS NULL OR assignment.valid_until>now())
), unambiguous AS (
    SELECT tenant_id,min(user_id) AS user_id FROM candidate GROUP BY tenant_id HAVING count(*)=1
)
INSERT INTO security_emergency_impersonation_principal
    (tenant_id,user_id,designated_by,source_reference)
SELECT tenant_id,user_id,user_id,'migration:unique-active-tenant-administrator'
  FROM unambiguous
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('security',12,'governed_impersonation');
