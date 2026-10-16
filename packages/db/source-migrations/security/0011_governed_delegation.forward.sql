CREATE TABLE security_delegation (
    tenant_id text NOT NULL,
    delegation_id text NOT NULL,
    delegator_id text NOT NULL,
    delegatee_id text NOT NULL,
    permission_key text NOT NULL,
    scope_kind text NOT NULL CHECK (scope_kind IN ('tenant','company')),
    scope_value text NOT NULL,
    valid_from timestamptz NOT NULL,
    valid_until timestamptz NOT NULL,
    reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 512),
    lifecycle_state text NOT NULL DEFAULT 'draft' CHECK (
        lifecycle_state IN ('draft','submitted','approved','active','rejected','revoked','expired')
    ),
    submitted_by text,
    submitted_at timestamptz,
    approved_by text,
    approved_at timestamptz,
    rejected_by text,
    rejected_at timestamptz,
    rejection_reason text,
    activated_by text,
    activated_at timestamptz,
    revoked_by text,
    revoked_at timestamptz,
    revocation_reason text,
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,delegation_id),
    FOREIGN KEY (tenant_id,delegator_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,delegatee_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (permission_key) REFERENCES security_permission_definition (permission_key) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,submitted_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approved_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,rejected_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,activated_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,revoked_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    CHECK (delegator_id<>delegatee_id),
    CHECK (valid_until>valid_from),
    CHECK (scope_kind<>'tenant' OR scope_value=tenant_id),
    CHECK (rejection_reason IS NULL OR length(rejection_reason) BETWEEN 1 AND 512),
    CHECK (revocation_reason IS NULL OR length(revocation_reason) BETWEEN 1 AND 512)
);

CREATE UNIQUE INDEX security_delegation_one_active_authority
    ON security_delegation (tenant_id,delegatee_id,permission_key,scope_kind,scope_value)
    WHERE lifecycle_state='active';
CREATE INDEX security_delegation_principal_state
    ON security_delegation (tenant_id,delegatee_id,delegator_id,lifecycle_state,valid_until);

CREATE TABLE security_delegation_event (
    tenant_id text NOT NULL,
    event_id text NOT NULL,
    delegation_id text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('created','submitted','approved','rejected','activated','revoked','expired')),
    actor_id text NOT NULL,
    reason text,
    state_snapshot jsonb NOT NULL CHECK (jsonb_typeof(state_snapshot)='object'),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,event_id),
    FOREIGN KEY (tenant_id,delegation_id) REFERENCES security_delegation (tenant_id,delegation_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 512)
);

CREATE INDEX security_delegation_event_history
    ON security_delegation_event (tenant_id,delegation_id,occurred_at,event_id);

CREATE FUNCTION reject_security_delegation_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    RAISE EXCEPTION 'security delegation events are append-only' USING ERRCODE='P0001';
END
$function$;
CREATE TRIGGER security_delegation_event_immutable
BEFORE UPDATE OR DELETE ON security_delegation_event
FOR EACH ROW EXECUTE FUNCTION reject_security_delegation_event_mutation();

ALTER TABLE security_delegation ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_delegation FORCE ROW LEVEL SECURITY;
CREATE POLICY security_delegation_tenant ON security_delegation
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE security_delegation_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_delegation_event FORCE ROW LEVEL SECURITY;
CREATE POLICY security_delegation_event_tenant ON security_delegation_event
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

INSERT INTO security_permission_definition (
    permission_key,module,resource,action,description,required_assurance,
    field_context_required,source_state_context_required,sensitivity
)
VALUES
    ('security.delegation.read','security','delegation','read','Read governed delegation requests and grants.','password',false,false,'sensitive'),
    ('security.delegation.create','security','delegation','create','Create a bounded delegation draft from current authority.','password',true,true,'restricted'),
    ('security.delegation.submit','security','delegation','submit','Submit a delegation for independent approval.','password',false,true,'restricted'),
    ('security.delegation.approve','security','delegation','approve','Approve or reject a submitted delegation.','password',false,true,'restricted'),
    ('security.delegation.activate','security','delegation','activate','Activate an approved effective-dated delegation.','password',false,true,'restricted'),
    ('security.delegation.revoke','security','delegation','revoke','Revoke an active delegation and retain evidence.','password',false,true,'restricted')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('security',11,'governed_delegation');
