DO $$
BEGIN
    IF to_regclass('public.employee') IS NULL
       OR to_regclass('public.organization_unit') IS NULL THEN
        RAISE EXCEPTION 'employee draft scope requires HR employee and Platform organization authorities';
    END IF;
END $$;

-- A draft has no effective employment assignment. Keep its intended legal
-- employer as an explicit, tenant-scoped authorization boundary until the
-- governed assignment workflow takes ownership of the employee.
CREATE TABLE hr_employee_draft_scope (
    tenant_id text NOT NULL,
    employee_id text NOT NULL,
    company_id text NOT NULL,
    created_by text NOT NULL CHECK (char_length(btrim(created_by)) BETWEEN 1 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, employee_id),
    FOREIGN KEY (tenant_id, employee_id)
        REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, company_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_hr_employee_draft_scope_company
    ON hr_employee_draft_scope (tenant_id, company_id, employee_id);

CREATE FUNCTION validate_hr_employee_draft_scope() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM employee
         WHERE tenant_id=NEW.tenant_id AND id=NEW.employee_id AND status='draft'
    ) THEN
        RAISE EXCEPTION 'employee draft scope requires an employee in draft status'
            USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM organization_unit
         WHERE tenant_id=NEW.tenant_id AND id=NEW.company_id
           AND type='company' AND status='active'
    ) THEN
        RAISE EXCEPTION 'employee draft scope requires an active company'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER hr_employee_draft_scope_guard
BEFORE INSERT OR UPDATE ON hr_employee_draft_scope
FOR EACH ROW EXECUTE FUNCTION validate_hr_employee_draft_scope();

ALTER TABLE hr_employee_draft_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_draft_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employee_draft_scope_tenant_isolation
    ON hr_employee_draft_scope
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

COMMENT ON TABLE hr_employee_draft_scope IS
    'Company authorization scope for a draft employee before effective assignment exists.';

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',23,'employee_draft_scope');
