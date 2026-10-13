DO $$
BEGIN
    IF to_regclass('public.security_user_account') IS NULL THEN
        RAISE EXCEPTION 'employee identity binding requires the Security PostgreSQL foundation';
    END IF;
END $$;

CREATE TABLE employee_user_binding (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    employee_id text NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    ended_by text,
    ended_at timestamptz,
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, user_id)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, employee_id)
        REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, created_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, ended_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK ((ended_by IS NULL AND ended_at IS NULL)
        OR (ended_by IS NOT NULL AND ended_at IS NOT NULL))
);

ALTER TABLE employee_user_binding ADD CONSTRAINT employee_user_binding_user_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        user_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    );
ALTER TABLE employee_user_binding ADD CONSTRAINT employee_user_binding_employee_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        employee_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    );
CREATE INDEX idx_employee_user_binding_user
    ON employee_user_binding (tenant_id, user_id, effective_from DESC);
CREATE INDEX idx_employee_user_binding_employee
    ON employee_user_binding (tenant_id, employee_id, effective_from DESC);

CREATE FUNCTION guard_employee_user_binding_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'employee identity bindings cannot be deleted';
    END IF;
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.id IS DISTINCT FROM NEW.id
       OR OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.employee_id IS DISTINCT FROM NEW.employee_id
       OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
       OR OLD.reason IS DISTINCT FROM NEW.reason
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.effective_to IS NOT NULL
       OR NEW.effective_to IS NULL
       OR NEW.ended_by IS NULL
       OR NEW.ended_at IS NULL THEN
        RAISE EXCEPTION 'employee identity binding history is immutable';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER employee_user_binding_guard
BEFORE UPDATE OR DELETE ON employee_user_binding
FOR EACH ROW EXECUTE FUNCTION guard_employee_user_binding_mutation();

ALTER TABLE employee_user_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_user_binding FORCE ROW LEVEL SECURITY;
CREATE POLICY employee_user_binding_tenant_isolation ON employee_user_binding
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 5, 'employee_identity');
