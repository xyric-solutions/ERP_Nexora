CREATE TABLE hr_employment_relationship (
    id text NOT NULL CONSTRAINT hr_employment_relationship_id_length
        CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    employee_id text NOT NULL,
    legal_employer_id text NOT NULL,
    legal_employer_type text GENERATED ALWAYS AS ('company'::text) STORED,
    relationship_number text NOT NULL
        CONSTRAINT hr_employment_relationship_number_length
        CHECK (length(relationship_number) BETWEEN 1 AND 128),
    status text NOT NULL CONSTRAINT hr_employment_relationship_status_check
        CHECK (status IN ('draft', 'active', 'suspended', 'ended')),
    effective_from date NOT NULL,
    effective_to date,
    created_by text NOT NULL CONSTRAINT hr_employment_relationship_created_by_length
        CHECK (length(created_by) BETWEEN 1 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hr_employment_relationship_pkey PRIMARY KEY (tenant_id, id),
    CONSTRAINT uq_hr_employment_relationship_employer_id
        UNIQUE (tenant_id, id, legal_employer_id),
    CONSTRAINT uq_hr_employment_relationship_number
        UNIQUE (tenant_id, legal_employer_id, relationship_number),
    CONSTRAINT fk_hr_employment_relationship_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT,
    CONSTRAINT fk_hr_employment_relationship_employee
        FOREIGN KEY (tenant_id, employee_id)
        REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_hr_employment_relationship_legal_employer
        FOREIGN KEY (tenant_id, legal_employer_id, legal_employer_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    CONSTRAINT hr_employment_relationship_effective_range
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT hr_employment_relationship_ended_has_end
        CHECK (status <> 'ended' OR effective_to IS NOT NULL),
    CONSTRAINT ex_hr_employment_relationship_non_draft_period EXCLUDE USING gist (
        tenant_id WITH =,
        employee_id WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    ) WHERE (status <> 'draft')
);

CREATE INDEX idx_hr_employment_relationship_employee_effective
    ON hr_employment_relationship (tenant_id, employee_id, effective_from DESC);
CREATE INDEX idx_hr_employment_relationship_employer_status_effective
    ON hr_employment_relationship (
        tenant_id, legal_employer_id, status, effective_from DESC
    );

ALTER TABLE hr_employment_relationship ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employment_relationship FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employment_relationship_tenant_isolation
ON hr_employment_relationship
USING (tenant_id = current_setting('nexora.tenant_id', true))
WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

COMMENT ON TABLE hr_employment_relationship IS
    'Authoritative legal-employment relationship identity. Employee identity and assignment authority remain separate.';
COMMENT ON COLUMN hr_employment_relationship.legal_employer_id IS
    'Legal employer company; this does not infer work or payroll jurisdiction.';

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 10, 'employment_relationship_foundation');
