DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration WHERE module_name='hr' AND version=13
    ) THEN
        RAISE EXCEPTION 'salary-segment evidence requires HR migration 13';
    END IF;
END $$;

ALTER TABLE hr_payroll_result
    ALTER COLUMN salary_assignment_id DROP NOT NULL;

CREATE TABLE hr_payroll_result_salary_segment (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    result_id text NOT NULL,
    salary_assignment_id text NOT NULL,
    structure_id text NOT NULL,
    position integer NOT NULL CHECK (position > 0),
    effective_from date NOT NULL,
    effective_to date NOT NULL CHECK (effective_to >= effective_from),
    paid_days numeric(8,4) NOT NULL CHECK (paid_days > 0),
    period_calendar_days numeric(8,4) NOT NULL CHECK (period_calendar_days > 0),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    gross numeric(20,4) NOT NULL CHECK (gross >= 0),
    deductions numeric(20,4) NOT NULL CHECK (deductions >= 0),
    employer_contributions numeric(20,4) NOT NULL DEFAULT 0 CHECK (employer_contributions >= 0),
    net numeric(20,4) NOT NULL,
    component_snapshot_json jsonb NOT NULL CHECK (jsonb_typeof(component_snapshot_json)='array'),
    calculation_hash text NOT NULL CHECK (calculation_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,result_id,position),
    UNIQUE (tenant_id,result_id,salary_assignment_id,effective_from,effective_to),
    FOREIGN KEY (tenant_id,result_id,company_id)
        REFERENCES hr_payroll_result (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,salary_assignment_id,company_id)
        REFERENCES hr_salary_assignment (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,structure_id,company_id)
        REFERENCES hr_salary_structure (tenant_id,id,company_id) ON DELETE RESTRICT
);

CREATE INDEX idx_hr_payroll_result_salary_segment_result
    ON hr_payroll_result_salary_segment (tenant_id,company_id,result_id,position);

CREATE TRIGGER hr_payroll_result_salary_segment_immutable
BEFORE UPDATE OR DELETE ON hr_payroll_result_salary_segment
FOR EACH ROW EXECUTE FUNCTION reject_payroll_snapshot_mutation();

ALTER TABLE hr_payroll_result_salary_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_result_salary_segment FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_payroll_result_salary_segment_tenant_isolation
ON hr_payroll_result_salary_segment
USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

CREATE FUNCTION validate_segmented_payroll_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.salary_assignment_id IS NULL AND (
        SELECT count(*) FROM hr_payroll_result_salary_segment
         WHERE tenant_id=NEW.tenant_id AND result_id=NEW.id
    ) < 2 THEN
        RAISE EXCEPTION 'segmented payroll result requires at least two salary-segment evidence rows';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_payroll_result_salary_evidence
AFTER INSERT ON hr_payroll_result
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_segmented_payroll_result();

COMMENT ON TABLE hr_payroll_result_salary_segment IS
    'Immutable calculation evidence for effective salary portions; hr_salary_assignment remains the salary authority.';

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',14,'payroll_salary_segments');
