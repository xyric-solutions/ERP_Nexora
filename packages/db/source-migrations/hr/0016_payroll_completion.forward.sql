DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration WHERE module_name='hr' AND version=15
    ) THEN
        RAISE EXCEPTION 'payroll completion requires HR migration 15';
    END IF;
END $$;

ALTER TABLE hr_payroll_result
    ADD COLUMN payroll_input_id text,
    ADD COLUMN payroll_input_evidence_version text,
    ADD COLUMN employment_context_hash text,
    ADD COLUMN employment_context_as_of date,
    ADD COLUMN employment_context_source_references jsonb,
    ADD CONSTRAINT hr_payroll_result_input_reference_pair CHECK (
        (payroll_input_id IS NULL AND payroll_input_evidence_version IS NULL)
        OR (payroll_input_id IS NOT NULL AND payroll_input_evidence_version IS NOT NULL)
    ),
    ADD CONSTRAINT hr_payroll_result_employment_evidence_pair CHECK (
        (employment_context_hash IS NULL AND employment_context_as_of IS NULL
         AND employment_context_source_references IS NULL)
        OR
        (employment_context_hash ~ '^[0-9a-f]{64}$' AND employment_context_as_of IS NOT NULL
         AND jsonb_typeof(employment_context_source_references)='array')
    ),
    ADD CONSTRAINT hr_payroll_result_input_reference_fk
        FOREIGN KEY (tenant_id,payroll_input_id)
        REFERENCES hr_payroll_input (tenant_id,id) ON DELETE RESTRICT;

CREATE TABLE hr_payslip_release (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    period_id text NOT NULL,
    payroll_result_id text NOT NULL,
    employee_id text NOT NULL,
    run_number integer NOT NULL CHECK (run_number > 0),
    calculation_hash text NOT NULL CHECK (calculation_hash ~ '^[0-9a-f]{64}$'),
    released_by text NOT NULL,
    released_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,payroll_result_id),
    UNIQUE (tenant_id,period_id,run_number,employee_id),
    FOREIGN KEY (tenant_id,period_id,company_id)
        REFERENCES hr_payroll_period (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,payroll_result_id,company_id)
        REFERENCES hr_payroll_result (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,employee_id)
        REFERENCES employee (tenant_id,id) ON DELETE RESTRICT
);

CREATE FUNCTION validate_payslip_release() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE result_row hr_payroll_result%ROWTYPE;
DECLARE period_row hr_payroll_period%ROWTYPE;
BEGIN
    SELECT * INTO result_row FROM hr_payroll_result
     WHERE tenant_id=NEW.tenant_id AND id=NEW.payroll_result_id;
    SELECT * INTO period_row FROM hr_payroll_period
     WHERE tenant_id=NEW.tenant_id AND id=NEW.period_id;
    IF result_row.id IS NULL OR period_row.id IS NULL
       OR result_row.company_id IS DISTINCT FROM NEW.company_id
       OR result_row.period_id IS DISTINCT FROM NEW.period_id
       OR result_row.employee_id IS DISTINCT FROM NEW.employee_id
       OR result_row.run_number IS DISTINCT FROM NEW.run_number
       OR result_row.calculation_hash IS DISTINCT FROM NEW.calculation_hash
       OR period_row.company_id IS DISTINCT FROM NEW.company_id
       OR period_row.run_number IS DISTINCT FROM NEW.run_number
       OR period_row.state NOT IN ('posted','paid','closed') THEN
        RAISE EXCEPTION 'payslip release does not match a posted current payroll result';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER hr_payslip_release_validate
BEFORE INSERT ON hr_payslip_release
FOR EACH ROW EXECUTE FUNCTION validate_payslip_release();

CREATE TRIGGER hr_payslip_release_immutable
BEFORE UPDATE OR DELETE ON hr_payslip_release
FOR EACH ROW EXECUTE FUNCTION reject_payroll_snapshot_mutation();

ALTER TABLE hr_payslip_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payslip_release FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_payslip_release_tenant_isolation ON hr_payslip_release
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

COMMENT ON TABLE hr_payslip_release IS
    'Immutable employee-publication boundary for an existing payroll result; the payroll result remains the payslip content authority.';

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',16,'payroll_completion');
