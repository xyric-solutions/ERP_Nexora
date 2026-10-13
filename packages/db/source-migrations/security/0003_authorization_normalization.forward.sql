ALTER TABLE security_tenant_role
    ADD COLUMN source_kind text NOT NULL DEFAULT 'governed' CHECK (
        source_kind IN ('governed', 'legacy_backfill')
    ),
    ADD COLUMN source_reference text CHECK (
        source_reference IS NULL OR length(source_reference) BETWEEN 1 AND 512
    ),
    ALTER COLUMN created_by DROP NOT NULL,
    DROP CONSTRAINT security_tenant_role_check,
    ADD CONSTRAINT security_tenant_role_lifecycle_evidence CHECK (
        (
            source_kind = 'governed'
            AND source_reference IS NULL
            AND created_by IS NOT NULL
            AND (
                (
                    lifecycle_state = 'active'
                    AND archived_by IS NULL
                    AND archived_at IS NULL
                )
                OR
                (
                    lifecycle_state = 'archived'
                    AND archived_by IS NOT NULL
                    AND archived_at IS NOT NULL
                )
            )
        )
        OR
        (
            source_kind = 'legacy_backfill'
            AND source_reference IS NOT NULL
            AND created_by IS NULL
            AND archived_by IS NULL
            AND archived_at IS NULL
        )
    );

ALTER TABLE security_user_role_assignment_version
    ADD COLUMN source_kind text NOT NULL DEFAULT 'governed' CHECK (
        source_kind IN ('governed', 'legacy_backfill')
    ),
    ADD COLUMN source_reference text CHECK (
        source_reference IS NULL OR length(source_reference) BETWEEN 1 AND 512
    ),
    ALTER COLUMN administration_command_id DROP NOT NULL,
    ADD CONSTRAINT security_assignment_version_source_evidence CHECK (
        (
            source_kind = 'governed'
            AND source_reference IS NULL
            AND administration_command_id IS NOT NULL
        )
        OR
        (
            source_kind = 'legacy_backfill'
            AND source_reference IS NOT NULL
            AND administration_command_id IS NULL
        )
    );

ALTER TABLE security_role_permission_grant
    ADD COLUMN field_allow_mode text NOT NULL DEFAULT 'all' CHECK (
        field_allow_mode IN ('all', 'explicit', 'none')
    );

CREATE TABLE security_authorization_shadow_mismatch (
    tenant_id text NOT NULL,
    mismatch_id text NOT NULL CHECK (length(mismatch_id) BETWEEN 1 AND 128),
    user_id text NOT NULL,
    role_context jsonb NOT NULL CHECK (jsonb_typeof(role_context) = 'object'),
    permission_key text NOT NULL,
    resource_type text NOT NULL CHECK (length(resource_type) BETWEEN 1 AND 128),
    resource_id text CHECK (
        resource_id IS NULL OR length(resource_id) BETWEEN 1 AND 256
    ),
    action text NOT NULL CHECK (length(action) BETWEEN 1 AND 128),
    old_decision jsonb NOT NULL CHECK (jsonb_typeof(old_decision) = 'object'),
    new_decision jsonb NOT NULL CHECK (jsonb_typeof(new_decision) = 'object'),
    reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 512),
    source_data jsonb NOT NULL CHECK (jsonb_typeof(source_data) = 'object'),
    target_data jsonb NOT NULL CHECK (jsonb_typeof(target_data) = 'object'),
    classification text NOT NULL CHECK (
        classification IN (
            'expected_documented', 'data_quality_issue', 'mapping_issue',
            'implementation_defect', 'security_issue'
        )
    ),
    security_sensitive boolean NOT NULL,
    observed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, mismatch_id),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, user_id)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (permission_key)
        REFERENCES security_permission_definition (permission_key) ON DELETE RESTRICT
);

CREATE INDEX security_shadow_mismatch_tenant_observed
    ON security_authorization_shadow_mismatch (
        tenant_id, classification, observed_at, mismatch_id
    );

CREATE FUNCTION reject_security_shadow_mismatch_mutation() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    RAISE EXCEPTION 'security authorization shadow mismatches are append-only'
        USING ERRCODE = 'P0001';
END
$function$;

CREATE TRIGGER security_shadow_mismatch_immutable
BEFORE UPDATE OR DELETE ON security_authorization_shadow_mismatch
FOR EACH ROW EXECUTE FUNCTION reject_security_shadow_mismatch_mutation();

ALTER TABLE security_authorization_shadow_mismatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_authorization_shadow_mismatch FORCE ROW LEVEL SECURITY;
CREATE POLICY security_shadow_mismatch_tenant_isolation
    ON security_authorization_shadow_mismatch
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('security', 3, 'authorization_normalization');
