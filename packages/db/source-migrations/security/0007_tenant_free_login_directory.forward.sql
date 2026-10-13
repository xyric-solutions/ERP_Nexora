CREATE TABLE security_login_identifier (
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    identifier_kind text NOT NULL CHECK (identifier_kind IN ('email', 'username')),
    identifier_hmac text NOT NULL CHECK (identifier_hmac ~ '^[0-9a-f]{64}$'),
    lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('active', 'inactive')),
    source_reference text NOT NULL CHECK (length(source_reference) BETWEEN 1 AND 512),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id, identifier_kind),
    UNIQUE (tenant_id, identifier_kind, identifier_hmac, user_id),
    FOREIGN KEY (tenant_id, user_id)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX security_login_identifier_lookup
    ON security_login_identifier (identifier_kind, identifier_hmac)
    WHERE lifecycle_state = 'active';
CREATE INDEX security_login_identifier_tenant_reconciliation
    ON security_login_identifier (tenant_id, lifecycle_state, user_id);

CREATE TABLE security_login_directory_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    secret_verifier text NOT NULL CHECK (secret_verifier ~ '^[0-9a-f]{64}$'),
    last_reconciled_at timestamptz NOT NULL
);

ALTER TABLE security_login_identifier ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_login_identifier FORCE ROW LEVEL SECURITY;
CREATE POLICY security_login_identifier_tenant_isolation ON security_login_identifier
    USING (
        tenant_id = current_setting('nexora.tenant_id', true)
        OR current_user = pg_get_userbyid(
            (SELECT relowner FROM pg_class WHERE oid = 'security_login_identifier'::regclass)
        )
    )
    WITH CHECK (
        tenant_id = current_setting('nexora.tenant_id', true)
        OR current_user = pg_get_userbyid(
            (SELECT relowner FROM pg_class WHERE oid = 'security_login_identifier'::regclass)
        )
    );

ALTER TABLE security_login_directory_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_login_directory_state FORCE ROW LEVEL SECURITY;
CREATE POLICY security_login_directory_state_owner_only ON security_login_directory_state
    USING (
        current_user = pg_get_userbyid(
            (SELECT relowner FROM pg_class WHERE oid = 'security_login_directory_state'::regclass)
        )
    )
    WITH CHECK (
        current_user = pg_get_userbyid(
            (SELECT relowner FROM pg_class WHERE oid = 'security_login_directory_state'::regclass)
        )
    );

CREATE FUNCTION resolve_security_login_candidates(
    email_hmac text,
    username_hmac text,
    result_limit integer DEFAULT 17
) RETURNS TABLE (tenant_id text, user_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT DISTINCT identifier.tenant_id, identifier.user_id
    FROM public.security_login_identifier identifier
    WHERE identifier.lifecycle_state = 'active'
      AND (
          (identifier.identifier_kind = 'email' AND identifier.identifier_hmac = email_hmac)
          OR
          (identifier.identifier_kind = 'username' AND identifier.identifier_hmac = username_hmac)
      )
    ORDER BY identifier.tenant_id, identifier.user_id
    LIMIT LEAST(GREATEST(result_limit, 1), 17)
$$;

REVOKE ALL ON FUNCTION resolve_security_login_candidates(text, text, integer) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexora_app') THEN
        REVOKE ALL ON TABLE security_login_identifier FROM nexora_app;
        REVOKE ALL ON TABLE security_login_directory_state FROM nexora_app;
        GRANT EXECUTE ON FUNCTION resolve_security_login_candidates(text, text, integer) TO nexora_app;
    END IF;
END
$$;

CREATE TABLE security_authentication_event (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 128),
    event_type text NOT NULL CHECK (
        event_type IN (
            'credential_verified',
            'tenant_selection_required',
            'tenant_selected',
            'session_issued'
        )
    ),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);

CREATE INDEX security_authentication_event_tenant_user_time
    ON security_authentication_event (tenant_id, user_id, occurred_at DESC);

CREATE FUNCTION reject_security_authentication_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'security_authentication_event is append-only';
END
$$;

CREATE TRIGGER security_authentication_event_immutable
BEFORE UPDATE OR DELETE ON security_authentication_event
FOR EACH ROW EXECUTE FUNCTION reject_security_authentication_event_mutation();

ALTER TABLE security_authentication_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_authentication_event FORCE ROW LEVEL SECURITY;
CREATE POLICY security_authentication_event_tenant_isolation ON security_authentication_event
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('security', 7, 'tenant_free_login_directory');
