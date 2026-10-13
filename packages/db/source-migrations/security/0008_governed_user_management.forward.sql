ALTER TABLE security_user_account
    ADD COLUMN display_name text CHECK (
        display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 200
    ),
    ADD COLUMN session_version bigint NOT NULL DEFAULT 1 CHECK (session_version > 0),
    ADD COLUMN archived_by text,
    ADD COLUMN archived_at timestamptz,
    ADD COLUMN archive_reason text,
    ADD CONSTRAINT security_user_account_archived_by_fk
        FOREIGN KEY (tenant_id, archived_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT security_user_account_archive_evidence CHECK (
        (
            archived_by IS NULL
            AND archived_at IS NULL
            AND archive_reason IS NULL
        )
        OR
        (
            status = 'inactive'
            AND archived_by IS NOT NULL
            AND archived_at IS NOT NULL
            AND length(btrim(archive_reason)) BETWEEN 1 AND 512
        )
    );

ALTER TABLE security_password_credential
    ALTER COLUMN algorithm DROP NOT NULL,
    ALTER COLUMN iterations DROP NOT NULL,
    ALTER COLUMN salt DROP NOT NULL,
    ALTER COLUMN password_hash DROP NOT NULL,
    ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
    ADD COLUMN password_version bigint NOT NULL DEFAULT 1 CHECK (password_version > 0),
    ADD COLUMN password_changed_at timestamptz,
    ADD COLUMN credential_status text NOT NULL DEFAULT 'active' CHECK (
        credential_status IN ('active', 'reset_required')
    ),
    ADD CONSTRAINT security_password_credential_state_check CHECK (
        (credential_status = 'reset_required') = must_change_password
    ),
    ADD CONSTRAINT security_password_credential_verifier_complete CHECK (
        (
            argon2_hash IS NOT NULL
            AND argon2_updated_at IS NOT NULL
        )
        OR
        (
            algorithm = 'pbkdf2_sha256'
            AND iterations >= 100000
            AND salt IS NOT NULL
            AND octet_length(salt) >= 16
            AND password_hash IS NOT NULL
            AND octet_length(password_hash) = 32
        )
    );

CREATE TABLE security_user_change_request (
    tenant_id text NOT NULL,
    request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
    target_user_id text,
    applied_user_id text,
    requested_action text NOT NULL CHECK (
        requested_action IN (
            'create', 'edit', 'activate', 'unlock', 'archive',
            'reset_password', 'company_access', 'employee_link'
        )
    ),
    proposed_user jsonb NOT NULL CHECK (jsonb_typeof(proposed_user) = 'object'),
    request_state text NOT NULL DEFAULT 'draft' CHECK (
        request_state IN ('draft', 'submitted', 'approved', 'rejected')
    ),
    requested_by text NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    submitted_by text,
    submitted_at timestamptz,
    decided_by text,
    decided_at timestamptz,
    decision_reason text,
    source_reference text NOT NULL CHECK (length(source_reference) BETWEEN 1 AND 512),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    PRIMARY KEY (tenant_id, request_id),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, target_user_id)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, applied_user_id)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, requested_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, submitted_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, decided_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    CHECK (
        (requested_action = 'create' AND target_user_id IS NULL)
        OR (requested_action <> 'create' AND target_user_id IS NOT NULL)
    ),
    CHECK (applied_user_id IS NULL OR requested_action = 'create'),
    CHECK (
        (
            request_state = 'draft'
            AND submitted_by IS NULL
            AND submitted_at IS NULL
            AND decided_by IS NULL
            AND decided_at IS NULL
            AND decision_reason IS NULL
        )
        OR
        (
            request_state = 'submitted'
            AND submitted_by IS NOT NULL
            AND submitted_at IS NOT NULL
            AND decided_by IS NULL
            AND decided_at IS NULL
            AND decision_reason IS NULL
        )
        OR
        (
            request_state IN ('approved', 'rejected')
            AND submitted_by IS NOT NULL
            AND submitted_at IS NOT NULL
            AND decided_by IS NOT NULL
            AND decided_at IS NOT NULL
            AND decided_by <> requested_by
            AND decided_by <> submitted_by
            AND (request_state = 'approved' OR length(btrim(decision_reason)) BETWEEN 1 AND 512)
        )
    )
);

CREATE INDEX security_user_change_request_queue
    ON security_user_change_request (tenant_id, request_state, requested_at, request_id);
CREATE INDEX security_user_change_request_target
    ON security_user_change_request (tenant_id, target_user_id, requested_at DESC)
    WHERE target_user_id IS NOT NULL;

CREATE TABLE security_user_company_access (
    tenant_id text NOT NULL,
    access_id text NOT NULL CHECK (length(access_id) BETWEEN 1 AND 128),
    user_id text NOT NULL,
    company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type = 'company'),
    is_default boolean NOT NULL DEFAULT false,
    granted_by text NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    revoked_by text,
    revoked_at timestamptz,
    revocation_reason text,
    approved_request_id text,
    source_kind text NOT NULL CHECK (
        source_kind IN ('governed_administration', 'compatibility_backfill')
    ),
    source_reference text NOT NULL CHECK (length(source_reference) BETWEEN 1 AND 512),
    PRIMARY KEY (tenant_id, access_id),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, user_id)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, granted_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, revoked_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, approved_request_id)
        REFERENCES security_user_change_request (tenant_id, request_id) ON DELETE RESTRICT,
    CHECK (
        (
            revoked_by IS NULL
            AND revoked_at IS NULL
            AND revocation_reason IS NULL
        )
        OR
        (
            revoked_by IS NOT NULL
            AND revoked_at IS NOT NULL
            AND length(btrim(revocation_reason)) BETWEEN 1 AND 512
        )
    )
);

CREATE UNIQUE INDEX security_user_company_access_active_unique
    ON security_user_company_access (tenant_id, user_id, company_id)
    WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX security_user_company_access_default_unique
    ON security_user_company_access (tenant_id, user_id)
    WHERE revoked_at IS NULL AND is_default;
CREATE INDEX security_user_company_access_user
    ON security_user_company_access (tenant_id, user_id, revoked_at, company_id);
CREATE INDEX security_user_company_access_company
    ON security_user_company_access (tenant_id, company_id, revoked_at, user_id);

CREATE FUNCTION protect_security_user_change_request() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP = 'DELETE' OR OLD.request_state IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'decided user administration requests are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.request_id <> OLD.request_id
       OR NEW.target_user_id IS DISTINCT FROM OLD.target_user_id
       OR NEW.requested_action <> OLD.requested_action
       OR NEW.requested_by <> OLD.requested_by
       OR NEW.requested_at <> OLD.requested_at
       OR NEW.source_reference <> OLD.source_reference THEN
        RAISE EXCEPTION 'user administration request identity is immutable'
            USING ERRCODE = 'P0001';
    END IF;
    IF OLD.request_state = 'submitted'
       AND (
           NEW.proposed_user IS DISTINCT FROM OLD.proposed_user
           OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
           OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       ) THEN
        RAISE EXCEPTION 'submitted user administration proposals are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    IF NEW.row_version <> OLD.row_version + 1 THEN
        RAISE EXCEPTION 'user administration request version must advance once'
            USING ERRCODE = 'P0001';
    END IF;
    IF OLD.request_state = 'draft' AND NEW.request_state NOT IN ('draft', 'submitted') THEN
        RAISE EXCEPTION 'draft user administration request must be submitted first'
            USING ERRCODE = 'P0001';
    END IF;
    IF OLD.request_state = 'submitted' AND NEW.request_state NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'submitted user administration request requires a decision'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER security_user_change_request_guard
BEFORE UPDATE OR DELETE ON security_user_change_request
FOR EACH ROW EXECUTE FUNCTION protect_security_user_change_request();

CREATE FUNCTION protect_security_user_company_access() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP = 'DELETE' OR OLD.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'user company access history is immutable'
            USING ERRCODE = 'P0001';
    END IF;
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.access_id <> OLD.access_id
       OR NEW.user_id <> OLD.user_id
       OR NEW.company_id <> OLD.company_id
       OR NEW.company_type <> OLD.company_type
       OR NEW.is_default <> OLD.is_default
       OR NEW.granted_by <> OLD.granted_by
       OR NEW.granted_at <> OLD.granted_at
       OR NEW.approved_request_id IS DISTINCT FROM OLD.approved_request_id
       OR NEW.source_kind <> OLD.source_kind
       OR NEW.source_reference <> OLD.source_reference
       OR NEW.revoked_by IS NULL
       OR NEW.revoked_at IS NULL
       OR NEW.revocation_reason IS NULL THEN
        RAISE EXCEPTION 'user company access grants are append-retained'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER security_user_company_access_guard
BEFORE UPDATE OR DELETE ON security_user_company_access
FOR EACH ROW EXECUTE FUNCTION protect_security_user_company_access();

ALTER TABLE security_user_change_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_user_change_request FORCE ROW LEVEL SECURITY;
CREATE POLICY security_user_change_request_tenant_isolation
    ON security_user_change_request
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_user_company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_user_company_access FORCE ROW LEVEL SECURITY;
CREATE POLICY security_user_company_access_tenant_isolation
    ON security_user_company_access
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

INSERT INTO security_permission_definition (
    permission_key, module, resource, action, description,
    required_assurance, field_context_required,
    source_state_context_required, sensitivity
)
VALUES
    ('security.user_account.read', 'security', 'user_account', 'read', 'Read tenant user accounts and governed access state.', 'password', false, false, 'sensitive'),
    ('security.user_account.edit', 'security', 'user_account', 'edit', 'Edit a draft tenant user change request.', 'password', true, true, 'restricted'),
    ('security.user_account.submit', 'security', 'user_account', 'submit', 'Submit a tenant user change request for approval.', 'password', false, true, 'restricted'),
    ('security.user_account.approve', 'security', 'user_account', 'approve', 'Approve or reject a submitted tenant user change request.', 'password', false, true, 'restricted'),
    ('security.user_account.activate', 'security', 'user_account', 'activate', 'Activate or unlock a governed tenant user account.', 'password', false, true, 'restricted'),
    ('security.user_account.archive', 'security', 'user_account', 'archive', 'Deactivate and archive a tenant user account without deleting evidence.', 'password', false, true, 'restricted'),
    ('security.user_account.lock', 'security', 'user_account', 'lock', 'Immediately lock a tenant user account and invalidate sessions.', 'password', false, true, 'restricted'),
    ('security.user_account.reset_password', 'security', 'user_account', 'reset_password', 'Issue a governed one-time password reset.', 'password', false, true, 'restricted'),
    ('security.user_account.revoke_sessions', 'security', 'user_account', 'revoke_sessions', 'Immediately invalidate all sessions for a tenant user.', 'password', false, true, 'restricted'),
    ('security.user_account.company_access', 'security', 'user_account', 'company_access', 'Govern the maximum company-access boundary for a tenant user.', 'password', true, true, 'restricted')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('security', 8, 'governed_user_management');
