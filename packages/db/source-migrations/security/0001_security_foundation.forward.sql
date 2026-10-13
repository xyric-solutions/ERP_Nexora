CREATE TABLE security_user_account (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    identity_subject text NOT NULL CHECK (length(identity_subject) BETWEEN 1 AND 255),
    email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320 AND position('@' IN email) > 1),
    status text NOT NULL CHECK (status IN ('active', 'inactive', 'locked')),
    mfa_state text NOT NULL CHECK (mfa_state IN ('required', 'enrolled', 'disabled')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, identity_subject),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX security_user_account_tenant_email_unique
    ON security_user_account (tenant_id, lower(email));
CREATE INDEX security_user_account_tenant_status
    ON security_user_account (tenant_id, status);

CREATE TABLE security_password_credential (
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    username text NOT NULL CHECK (
        length(username) BETWEEN 1 AND 128 AND username = lower(username)
    ),
    algorithm text NOT NULL CHECK (algorithm = 'pbkdf2_sha256'),
    iterations integer NOT NULL CHECK (iterations >= 100000),
    salt bytea NOT NULL CHECK (octet_length(salt) >= 16),
    password_hash bytea NOT NULL CHECK (octet_length(password_hash) = 32),
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, username),
    UNIQUE (tenant_id, user_id),
    FOREIGN KEY (tenant_id, user_id)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX security_password_credential_tenant_user
    ON security_password_credential (tenant_id, user_id);

CREATE TABLE security_role_policy (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    role text NOT NULL CHECK (role ~ '^[a-z][a-z0-9_]{0,63}$'),
    scope jsonb NOT NULL CHECK (jsonb_typeof(scope) = 'object'),
    permissions jsonb NOT NULL CHECK (
        jsonb_typeof(permissions) = 'array' AND jsonb_array_length(permissions) > 0
    ),
    field_rules jsonb NOT NULL CHECK (jsonb_typeof(field_rules) = 'object'),
    sod_rules jsonb NOT NULL CHECK (jsonb_typeof(sod_rules) = 'object'),
    version integer NOT NULL CHECK (version > 0),
    status text NOT NULL CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, role, version),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);

CREATE INDEX security_role_policy_tenant_status
    ON security_role_policy (tenant_id, status);

CREATE TABLE security_user_role_assignment (
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    role_policy_id text NOT NULL,
    assigned_by text NOT NULL,
    assigned_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, user_id, role_policy_id),
    FOREIGN KEY (tenant_id, user_id)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, role_policy_id)
        REFERENCES security_role_policy (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, assigned_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX security_assignment_tenant_user
    ON security_user_role_assignment (tenant_id, user_id);

CREATE TABLE security_audit_event (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 128),
    action text NOT NULL CHECK (length(action) BETWEEN 1 AND 200),
    entity_type text NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 128),
    entity_id text NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 256),
    before_hash text NOT NULL CHECK (before_hash ~ '^[0-9a-f]{64}$'),
    after_hash text NOT NULL CHECK (after_hash ~ '^[0-9a-f]{64}$'),
    source_reference text NOT NULL CHECK (length(source_reference) BETWEEN 1 AND 512),
    approval_reference text CHECK (approval_reference IS NULL OR length(approval_reference) BETWEEN 1 AND 128),
    occurred_at timestamptz NOT NULL,
    sequence bigint NOT NULL CHECK (sequence > 0),
    previous_event_hash text NOT NULL CHECK (previous_event_hash ~ '^[0-9a-f]{64}$'),
    event_hash text NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, sequence),
    UNIQUE (tenant_id, event_hash),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);

CREATE INDEX security_audit_event_tenant_target
    ON security_audit_event (tenant_id, entity_type, entity_id, sequence);

CREATE FUNCTION reject_security_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'security_audit_event is append-only';
END $$;

CREATE TRIGGER security_audit_event_immutable
BEFORE UPDATE OR DELETE ON security_audit_event
FOR EACH ROW EXECUTE FUNCTION reject_security_audit_mutation();

ALTER TABLE security_user_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_user_account FORCE ROW LEVEL SECURITY;
CREATE POLICY security_user_account_tenant_isolation ON security_user_account
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_password_credential ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_password_credential FORCE ROW LEVEL SECURITY;
CREATE POLICY security_password_credential_tenant_isolation ON security_password_credential
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_role_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY security_role_policy_tenant_isolation ON security_role_policy
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_user_role_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_user_role_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY security_assignment_tenant_isolation ON security_user_role_assignment
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_event FORCE ROW LEVEL SECURITY;
CREATE POLICY security_audit_event_tenant_isolation ON security_audit_event
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('security', 1, 'security_foundation');
