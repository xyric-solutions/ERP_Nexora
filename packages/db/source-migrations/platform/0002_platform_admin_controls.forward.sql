CREATE TABLE platform_admin_idempotency (
    tenant_id text NOT NULL,
    actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    method text NOT NULL CHECK (method IN ('POST')),
    path text NOT NULL CHECK (length(path) BETWEEN 1 AND 256),
    idempotency_key text NOT NULL CHECK (
        idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
    ),
    request_fingerprint text NOT NULL CHECK (
        request_fingerprint ~ '^[a-f0-9]{64}$'
    ),
    response_status smallint NOT NULL CHECK (response_status BETWEEN 200 AND 299),
    response_body jsonb NOT NULL CHECK (jsonb_typeof(response_body) = 'object'),
    response_etag text NOT NULL CHECK (length(response_etag) BETWEEN 1 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, actor_id, method, path, idempotency_key),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);

CREATE INDEX idx_platform_admin_idempotency_created
    ON platform_admin_idempotency (tenant_id, created_at);

CREATE TABLE platform_admin_audit_event (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    sequence bigint NOT NULL CHECK (sequence > 0),
    actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 128),
    action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
    entity_type text NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]*$'),
    entity_id text NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 128),
    before_hash text NOT NULL CHECK (before_hash ~ '^[a-f0-9]{64}$'),
    after_hash text NOT NULL CHECK (after_hash ~ '^[a-f0-9]{64}$'),
    source_reference text NOT NULL CHECK (length(source_reference) BETWEEN 1 AND 512),
    approval_reference text CHECK (length(approval_reference) BETWEEN 1 AND 128),
    occurred_at timestamptz NOT NULL,
    previous_event_hash text NOT NULL CHECK (previous_event_hash ~ '^[a-f0-9]{64}$'),
    event_hash text NOT NULL CHECK (event_hash ~ '^[a-f0-9]{64}$'),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, sequence),
    UNIQUE (tenant_id, event_hash),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);

CREATE INDEX idx_platform_admin_audit_entity
    ON platform_admin_audit_event (tenant_id, entity_type, entity_id, sequence DESC);
CREATE INDEX idx_platform_admin_audit_actor
    ON platform_admin_audit_event (tenant_id, actor_id, sequence DESC);

CREATE FUNCTION reject_platform_admin_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'platform administration audit events are immutable'
        USING ERRCODE = 'P0001';
END
$function$;

CREATE TRIGGER platform_admin_audit_immutable
BEFORE UPDATE OR DELETE ON platform_admin_audit_event
FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();

ALTER TABLE platform_admin_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_idempotency FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_admin_idempotency_tenant_isolation
    ON platform_admin_idempotency
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE platform_admin_audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_audit_event FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_admin_audit_tenant_isolation
    ON platform_admin_audit_event
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('platform', 2, 'platform_admin_controls');
