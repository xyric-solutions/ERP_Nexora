CREATE TABLE security_session_policy (
    tenant_id text NOT NULL,
    policy_id text NOT NULL,
    policy_version integer NOT NULL CHECK (policy_version > 0),
    lifecycle_state text NOT NULL DEFAULT 'draft' CHECK (lifecycle_state IN ('draft','submitted','approved','rejected','active','superseded')),
    password_minimum_length integer NOT NULL CHECK (password_minimum_length BETWEEN 8 AND 64),
    password_require_uppercase boolean NOT NULL,
    password_require_lowercase boolean NOT NULL,
    password_require_number boolean NOT NULL,
    password_require_symbol boolean NOT NULL,
    session_idle_minutes integer NOT NULL CHECK (session_idle_minutes BETWEEN 5 AND 1440),
    session_absolute_hours integer NOT NULL CHECK (session_absolute_hours BETWEEN 1 AND 720),
    concurrent_session_limit integer NOT NULL CHECK (concurrent_session_limit BETWEEN 1 AND 20),
    login_maximum_failures integer NOT NULL CHECK (login_maximum_failures BETWEEN 3 AND 20),
    login_window_minutes integer NOT NULL CHECK (login_window_minutes BETWEEN 1 AND 120),
    login_block_minutes integer NOT NULL CHECK (login_block_minutes BETWEEN 1 AND 1440),
    delegation_maximum_days integer NOT NULL CHECK (delegation_maximum_days BETWEEN 1 AND 90),
    impersonation_maximum_minutes integer NOT NULL CHECK (impersonation_maximum_minutes BETWEEN 5 AND 60),
    change_summary text NOT NULL CHECK (length(change_summary) BETWEEN 1 AND 512),
    created_by text NOT NULL, submitted_by text, submitted_at timestamptz,
    approved_by text, approved_at timestamptz, rejected_by text, rejected_at timestamptz, rejection_reason text,
    activated_by text, activated_at timestamptz, superseded_at timestamptz,
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,policy_id), UNIQUE (tenant_id,policy_version),
    FOREIGN KEY (tenant_id,created_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,submitted_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approved_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,rejected_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,activated_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    CHECK (session_idle_minutes * 60 <= session_absolute_hours * 3600),
    CHECK (rejection_reason IS NULL OR length(rejection_reason) BETWEEN 1 AND 512)
);
CREATE UNIQUE INDEX security_session_policy_one_active ON security_session_policy (tenant_id) WHERE lifecycle_state='active';
CREATE INDEX security_session_policy_history ON security_session_policy (tenant_id,policy_version DESC);

CREATE TABLE security_session_policy_event (
    tenant_id text NOT NULL, event_id text NOT NULL, policy_id text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('created','submitted','approved','rejected','activated','superseded')),
    actor_id text NOT NULL, reason text, state_snapshot jsonb NOT NULL CHECK (jsonb_typeof(state_snapshot)='object'),
    occurred_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,event_id),
    FOREIGN KEY (tenant_id,policy_id) REFERENCES security_session_policy (tenant_id,policy_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT
);
CREATE FUNCTION reject_security_session_policy_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN RAISE EXCEPTION 'security session policy events are append-only' USING ERRCODE='P0001'; END $function$;
CREATE TRIGGER security_session_policy_event_immutable BEFORE UPDATE OR DELETE ON security_session_policy_event
FOR EACH ROW EXECUTE FUNCTION reject_security_session_policy_event_mutation();

ALTER TABLE security_session_policy ENABLE ROW LEVEL SECURITY; ALTER TABLE security_session_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY security_session_policy_tenant ON security_session_policy USING (tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE security_session_policy_event ENABLE ROW LEVEL SECURITY; ALTER TABLE security_session_policy_event FORCE ROW LEVEL SECURITY;
CREATE POLICY security_session_policy_event_tenant ON security_session_policy_event USING (tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

INSERT INTO security_permission_definition (permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity) VALUES
('security.session_policy.read','security','session_policy','read','Read tenant security and session policies.','password',false,false,'sensitive'),
('security.session_policy.create','security','session_policy','create','Create a tenant security and session policy draft.','password',true,true,'restricted'),
('security.session_policy.submit','security','session_policy','submit','Submit a tenant security and session policy.','password',false,true,'restricted'),
('security.session_policy.approve','security','session_policy','approve','Approve or reject a tenant security and session policy.','password',false,true,'restricted'),
('security.session_policy.activate','security','session_policy','activate','Activate an approved tenant security and session policy.','password',false,true,'restricted')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO nexora_schema_migration (module_name,version,name) VALUES ('security',13,'security_session_policy');
