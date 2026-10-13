DO $$
BEGIN
    IF to_regclass('public.organization_unit') IS NULL
       OR to_regclass('public.platform_admin_audit_event') IS NULL THEN
        RAISE EXCEPTION 'HR foundation requires Platform PostgreSQL migration 2';
    END IF;
END $$;

CREATE TABLE hr_master_record (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type = 'company'),
    master_type text NOT NULL CHECK (master_type IN (
        'designation', 'job_grade', 'cost_center', 'work_location',
        'employment_type', 'employee_category'
    )),
    code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,31}$'),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
    classification text NOT NULL DEFAULT '' CHECK (char_length(classification) <= 120),
    owning_org_unit_id text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_by text NOT NULL,
    deactivated_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deactivated_at timestamptz,
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, company_id, master_type, code),
    UNIQUE (tenant_id, company_id, master_type, name),
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, owning_org_unit_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    CHECK ((status = 'active' AND deactivated_at IS NULL AND deactivated_by IS NULL)
        OR (status = 'inactive' AND deactivated_at IS NOT NULL AND deactivated_by IS NOT NULL))
);
CREATE INDEX idx_hr_master_company_type_status
    ON hr_master_record (tenant_id, company_id, master_type, status, code);

CREATE TABLE employee (
    id text NOT NULL,
    tenant_id text NOT NULL,
    employee_number text NOT NULL CHECK (employee_number ~ '^[A-Z0-9][A-Z0-9._/-]{0,31}$'),
    first_name text NOT NULL CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 100),
    middle_name text NOT NULL DEFAULT '' CHECK (char_length(middle_name) <= 100),
    last_name text NOT NULL CHECK (char_length(btrim(last_name)) BETWEEN 1 AND 100),
    preferred_name text NOT NULL DEFAULT '' CHECK (char_length(preferred_name) <= 100),
    joined_on date NOT NULL,
    date_of_birth date,
    work_email text NOT NULL DEFAULT '' CHECK (char_length(work_email) <= 320),
    personal_email text NOT NULL DEFAULT '' CHECK (char_length(personal_email) <= 320),
    phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 40),
    national_id_masked text CHECK (national_id_masked IS NULL OR national_id_masked ~ '^\*+.{0,4}$'),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'pending_approval', 'active', 'probation', 'confirmed',
        'suspended', 'resigned', 'terminated', 'inactive'
    )),
    created_by text NOT NULL,
    submitted_by text,
    approved_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, employee_number),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT,
    CHECK (date_of_birth IS NULL OR date_of_birth < joined_on)
);
CREATE INDEX idx_employee_tenant_status_name
    ON employee (tenant_id, status, last_name, first_name, employee_number);

CREATE TABLE employee_contact (
    tenant_id text NOT NULL,
    employee_id text NOT NULL,
    address_line_1 text NOT NULL DEFAULT '' CHECK (char_length(address_line_1) <= 240),
    address_line_2 text NOT NULL DEFAULT '' CHECK (char_length(address_line_2) <= 240),
    city text NOT NULL DEFAULT '' CHECK (char_length(city) <= 120),
    region text NOT NULL DEFAULT '' CHECK (char_length(region) <= 120),
    postal_code text NOT NULL DEFAULT '' CHECK (char_length(postal_code) <= 32),
    country_code text NOT NULL DEFAULT '' CHECK (country_code = '' OR country_code ~ '^[A-Z]{2}$'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, employee_id),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE employee_bank_account (
    id text NOT NULL,
    tenant_id text NOT NULL,
    employee_id text NOT NULL,
    bank_name text NOT NULL CHECK (char_length(btrim(bank_name)) BETWEEN 1 AND 160),
    account_title text NOT NULL CHECK (char_length(btrim(account_title)) BETWEEN 1 AND 160),
    account_number_masked text NOT NULL CHECK (account_number_masked ~ '^\*+.{0,4}$'),
    iban_masked text CHECK (iban_masked IS NULL OR iban_masked ~ '^\*+.{0,4}$'),
    is_primary boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX uq_employee_primary_bank
    ON employee_bank_account (tenant_id, employee_id) WHERE is_primary AND status = 'active';
CREATE INDEX idx_employee_bank_employee ON employee_bank_account (tenant_id, employee_id, status);

CREATE TABLE employee_tax_profile (
    tenant_id text NOT NULL,
    employee_id text NOT NULL,
    tax_identifier_masked text CHECK (tax_identifier_masked IS NULL OR tax_identifier_masked ~ '^\*+.{0,4}$'),
    social_security_masked text CHECK (social_security_masked IS NULL OR social_security_masked ~ '^\*+.{0,4}$'),
    tax_residency_code text NOT NULL DEFAULT '' CHECK (tax_residency_code = '' OR tax_residency_code ~ '^[A-Z]{2}$'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, employee_id),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE employee_emergency_contact (
    id text NOT NULL,
    tenant_id text NOT NULL,
    employee_id text NOT NULL,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    relationship text NOT NULL CHECK (char_length(btrim(relationship)) BETWEEN 1 AND 80),
    phone text NOT NULL CHECK (char_length(btrim(phone)) BETWEEN 1 AND 40),
    is_primary boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_employee_emergency_employee ON employee_emergency_contact (tenant_id, employee_id);

CREATE TABLE employee_dependent (
    id text NOT NULL,
    tenant_id text NOT NULL,
    employee_id text NOT NULL,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    relationship text NOT NULL CHECK (char_length(btrim(relationship)) BETWEEN 1 AND 80),
    date_of_birth date,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_employee_dependent_employee ON employee_dependent (tenant_id, employee_id);

CREATE TABLE employee_document (
    id text NOT NULL,
    tenant_id text NOT NULL,
    employee_id text NOT NULL,
    document_type text NOT NULL CHECK (char_length(btrim(document_type)) BETWEEN 1 AND 80),
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    reference text NOT NULL DEFAULT '' CHECK (char_length(reference) <= 120),
    storage_key text NOT NULL CHECK (char_length(btrim(storage_key)) BETWEEN 1 AND 500),
    issued_on date,
    expires_on date,
    restricted boolean NOT NULL DEFAULT true,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX idx_employee_document_employee ON employee_document (tenant_id, employee_id, document_type);

CREATE TABLE employee_assignment (
    id text NOT NULL,
    tenant_id text NOT NULL,
    employee_id text NOT NULL,
    company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type = 'company'),
    branch_id text NOT NULL,
    branch_type text NOT NULL DEFAULT 'branch' CHECK (branch_type = 'branch'),
    department_id text NOT NULL,
    department_type text NOT NULL DEFAULT 'department' CHECK (department_type = 'department'),
    designation_id text NOT NULL,
    job_grade_id text NOT NULL,
    cost_center_id text NOT NULL,
    work_location_id text NOT NULL,
    employment_type_id text NOT NULL,
    employee_category_id text NOT NULL,
    reporting_manager_id text,
    effective_from date NOT NULL,
    effective_to date,
    change_reason text NOT NULL CHECK (change_reason IN (
        'initial_appointment', 'transfer', 'promotion', 'demotion',
        'manager_change', 'employment_type_change', 'grade_revision',
        'cost_center_change', 'status_change'
    )),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, employee_id, effective_from),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, company_id, company_type) REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, branch_id, branch_type) REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, department_id, department_type) REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, designation_id) REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, job_grade_id) REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, cost_center_id) REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, work_location_id) REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, employment_type_id) REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, employee_category_id) REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, reporting_manager_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    CHECK (reporting_manager_id IS NULL OR reporting_manager_id <> employee_id),
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    EXCLUDE USING gist (
        tenant_id WITH =,
        employee_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    )
);
CREATE INDEX idx_employee_assignment_scope
    ON employee_assignment (tenant_id, company_id, branch_id, department_id, effective_from DESC);
CREATE INDEX idx_employee_assignment_manager
    ON employee_assignment (tenant_id, reporting_manager_id, effective_from DESC);

CREATE TABLE employee_status_history (
    id text NOT NULL,
    tenant_id text NOT NULL,
    employee_id text NOT NULL,
    from_status text,
    to_status text NOT NULL CHECK (to_status IN (
        'draft', 'pending_approval', 'active', 'probation', 'confirmed',
        'suspended', 'resigned', 'terminated', 'inactive'
    )),
    effective_on date NOT NULL,
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
    actor_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, employee_id, effective_on, to_status),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_employee_status_history_employee
    ON employee_status_history (tenant_id, employee_id, effective_on DESC, created_at DESC);

CREATE TABLE audit_field_change (
    id text NOT NULL,
    tenant_id text NOT NULL,
    audit_event_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text,
    is_sensitive boolean NOT NULL DEFAULT true,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, audit_event_id, field_name),
    FOREIGN KEY (tenant_id, audit_event_id)
        REFERENCES platform_admin_audit_event (tenant_id, id) ON DELETE RESTRICT,
    CHECK (char_length(field_name) BETWEEN 1 AND 120),
    CHECK (old_value IS DISTINCT FROM new_value),
    CHECK ((old_value IS NULL OR char_length(old_value) <= 500)
       AND (new_value IS NULL OR char_length(new_value) <= 500))
);
CREATE INDEX idx_audit_field_change_entity
    ON audit_field_change (tenant_id, entity_type, entity_id, field_name, recorded_at DESC);

CREATE FUNCTION validate_hr_master_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM organization_unit WHERE tenant_id=NEW.tenant_id
                   AND id=NEW.company_id AND type='company' AND status='active') THEN
        RAISE EXCEPTION 'HR master company is unavailable';
    END IF;
    IF NEW.owning_org_unit_id IS NOT NULL AND NOT EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT id, parent_id FROM organization_unit
             WHERE tenant_id=NEW.tenant_id AND id=NEW.owning_org_unit_id AND status='active'
            UNION ALL
            SELECT parent.id, parent.parent_id FROM organization_unit parent
             JOIN ancestors child ON child.parent_id=parent.id
            WHERE parent.tenant_id=NEW.tenant_id AND parent.status='active'
        ) SELECT 1 FROM ancestors WHERE id=NEW.company_id
    ) THEN
        RAISE EXCEPTION 'HR master owning organization unit is outside the company';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_master_scope_guard
BEFORE INSERT OR UPDATE ON hr_master_record
FOR EACH ROW EXECUTE FUNCTION validate_hr_master_scope();

CREATE FUNCTION validate_hr_assignment_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    branch_parent text;
    department_parent text;
    master_row record;
    pair record;
BEGIN
    SELECT parent_id INTO branch_parent FROM organization_unit
     WHERE tenant_id = NEW.tenant_id AND id = NEW.branch_id AND type = 'branch' AND status = 'active';
    IF branch_parent IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'HR assignment branch is not active in the selected company';
    END IF;
    SELECT parent_id INTO department_parent FROM organization_unit
     WHERE tenant_id = NEW.tenant_id AND id = NEW.department_id AND type = 'department' AND status = 'active';
    IF department_parent IS DISTINCT FROM NEW.branch_id THEN
        RAISE EXCEPTION 'HR assignment department is not active in the selected branch';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM organization_unit WHERE tenant_id = NEW.tenant_id AND id = NEW.company_id AND type = 'company' AND status = 'active') THEN
        RAISE EXCEPTION 'HR assignment company is inactive';
    END IF;
    FOR pair IN SELECT * FROM (VALUES
        (NEW.designation_id, 'designation'),
        (NEW.job_grade_id, 'job_grade'),
        (NEW.cost_center_id, 'cost_center'),
        (NEW.work_location_id, 'work_location'),
        (NEW.employment_type_id, 'employment_type'),
        (NEW.employee_category_id, 'employee_category')
    ) AS values_to_check(id, expected_type)
    LOOP
        master_row := NULL;
        SELECT master_type, company_id, status INTO master_row
          FROM hr_master_record WHERE tenant_id = NEW.tenant_id AND id = pair.id;
        IF NOT FOUND OR master_row.master_type <> pair.expected_type
           OR master_row.company_id <> NEW.company_id OR master_row.status <> 'active' THEN
            RAISE EXCEPTION 'HR assignment references unavailable master data';
        END IF;
    END LOOP;
    IF NEW.reporting_manager_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM employee WHERE tenant_id = NEW.tenant_id
         AND id = NEW.reporting_manager_id
         AND status IN ('active', 'probation', 'confirmed', 'suspended')
    ) THEN
        RAISE EXCEPTION 'HR assignment reporting manager is unavailable';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER employee_assignment_scope_guard
BEFORE INSERT OR UPDATE ON employee_assignment
FOR EACH ROW EXECUTE FUNCTION validate_hr_assignment_scope();

CREATE FUNCTION reject_hr_immutable_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'HR history and field audit evidence is immutable';
END $$;
CREATE TRIGGER employee_status_history_immutable
BEFORE UPDATE OR DELETE ON employee_status_history
FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
CREATE TRIGGER audit_field_change_immutable
BEFORE UPDATE OR DELETE ON audit_field_change
FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();

DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'hr_master_record', 'employee', 'employee_contact', 'employee_bank_account',
        'employee_tax_profile', 'employee_emergency_contact', 'employee_dependent',
        'employee_document', 'employee_assignment', 'employee_status_history',
        'audit_field_change'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''nexora.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''nexora.tenant_id'', true))',
            table_name || '_tenant_isolation', table_name
        );
    END LOOP;
END $$;

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 1, 'hr_foundation');
