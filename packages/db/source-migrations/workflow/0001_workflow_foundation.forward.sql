CREATE TABLE workflow_definition (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    module text NOT NULL CHECK (module ~ '^[a-z][a-z0-9_]{0,63}$'),
    trigger text NOT NULL CHECK (trigger ~ '^[a-z][a-z0-9_]{0,127}$'),
    entry_step_id text NOT NULL CHECK (length(entry_step_id) BETWEEN 1 AND 128),
    steps jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) > 0),
    version integer NOT NULL CHECK (version > 0),
    status text NOT NULL CHECK (status IN ('draft', 'active', 'inactive')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, id, version),
    UNIQUE (tenant_id, module, trigger, version),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX workflow_definition_one_active
    ON workflow_definition (tenant_id, module, trigger)
    WHERE status = 'active';
CREATE INDEX workflow_definition_tenant_module
    ON workflow_definition (tenant_id, module, trigger, version DESC);

CREATE TABLE approval_instance (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    workflow_definition_id text NOT NULL,
    workflow_definition_version integer NOT NULL CHECK (workflow_definition_version > 0),
    source_type text NOT NULL CHECK (length(source_type) BETWEEN 1 AND 128),
    source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 128),
    current_step_id text NOT NULL CHECK (length(current_step_id) BETWEEN 1 AND 128),
    requested_by text NOT NULL CHECK (length(requested_by) BETWEEN 1 AND 128),
    started_at timestamptz NOT NULL,
    due_at timestamptz NOT NULL,
    state text NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'cancelled')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, workflow_definition_id, workflow_definition_version)
        REFERENCES workflow_definition (tenant_id, id, version) ON DELETE RESTRICT,
    CHECK (due_at >= started_at)
);

CREATE UNIQUE INDEX approval_instance_one_pending_source
    ON approval_instance (tenant_id, source_type, source_id)
    WHERE state = 'pending';
CREATE INDEX approval_instance_tenant_state_due
    ON approval_instance (tenant_id, state, due_at);
CREATE INDEX approval_instance_source_history
    ON approval_instance (tenant_id, source_type, source_id, created_at DESC);

CREATE TABLE approval_action (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    approval_instance_id text NOT NULL,
    step_id text NOT NULL CHECK (length(step_id) BETWEEN 1 AND 128),
    level integer NOT NULL CHECK (level > 0),
    actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    action text NOT NULL CHECK (action IN ('submit', 'approve', 'reject', 'cancel', 'reassign')),
    comments text NOT NULL DEFAULT '' CHECK (length(comments) <= 2000),
    previous_state text NOT NULL CHECK (previous_state IN ('pending', 'approved', 'rejected', 'cancelled')),
    new_state text NOT NULL CHECK (new_state IN ('pending', 'approved', 'rejected', 'cancelled')),
    assigned_to text CHECK (assigned_to IS NULL OR length(assigned_to) BETWEEN 1 AND 128),
    acted_at timestamptz NOT NULL,
    sequence integer NOT NULL CHECK (sequence > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, approval_instance_id, sequence),
    FOREIGN KEY (tenant_id, approval_instance_id)
        REFERENCES approval_instance (tenant_id, id) ON DELETE RESTRICT,
    CHECK (action <> 'reject' OR length(trim(comments)) > 0),
    CHECK (action <> 'reassign' OR assigned_to IS NOT NULL),
    CHECK (action = 'reassign' OR assigned_to IS NULL),
    CHECK (assigned_to IS NULL OR assigned_to <> actor_id)
);

CREATE INDEX approval_action_instance
    ON approval_action (tenant_id, approval_instance_id, sequence);
CREATE INDEX approval_action_actor
    ON approval_action (tenant_id, actor_id, acted_at DESC);

CREATE FUNCTION reject_approval_action_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'approval_action is append-only';
END $$;

CREATE TRIGGER approval_action_immutable
BEFORE UPDATE OR DELETE ON approval_action
FOR EACH ROW EXECUTE FUNCTION reject_approval_action_mutation();

ALTER TABLE workflow_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_definition FORCE ROW LEVEL SECURITY;
CREATE POLICY workflow_definition_tenant_isolation ON workflow_definition
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE approval_instance ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_instance FORCE ROW LEVEL SECURITY;
CREATE POLICY approval_instance_tenant_isolation ON approval_instance
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE approval_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_action FORCE ROW LEVEL SECURITY;
CREATE POLICY approval_action_tenant_isolation ON approval_action
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('workflow', 1, 'workflow_foundation');
