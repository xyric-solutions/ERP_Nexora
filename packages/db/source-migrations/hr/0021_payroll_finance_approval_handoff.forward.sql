-- Bind new Payroll journal proposals to the existing Finance/Workflow authorities
-- without changing the historical hr_payroll_journal_proposal row shape.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='hr_payroll_journal_proposal'
          AND column_name='finance_approval_instance_id'
    ) THEN
        IF EXISTS (
            SELECT 1
            FROM hr_payroll_journal_proposal
            WHERE finance_approval_instance_id IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'draft Finance approval evidence exists; migration requires explicit preservation';
        END IF;
        ALTER TABLE hr_payroll_journal_proposal
            DROP COLUMN finance_approval_instance_id;
    END IF;
END $$;

CREATE TABLE hr_payroll_finance_approval_binding (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    proposal_id text NOT NULL,
    finance_journal_id text NOT NULL,
    approval_instance_id text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,proposal_id),
    UNIQUE (tenant_id,finance_journal_id),
    FOREIGN KEY (tenant_id,proposal_id)
        REFERENCES hr_payroll_journal_proposal (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id)
        REFERENCES organization_unit (tenant_id,id) ON DELETE RESTRICT
);

CREATE INDEX idx_hr_payroll_finance_approval_instance
    ON hr_payroll_finance_approval_binding (tenant_id,approval_instance_id)
    WHERE approval_instance_id IS NOT NULL;

CREATE FUNCTION protect_hr_payroll_finance_approval_binding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Payroll Finance approval binding is immutable';
END $$;

CREATE TRIGGER hr_payroll_finance_approval_binding_immutable
    BEFORE UPDATE OR DELETE ON hr_payroll_finance_approval_binding
    FOR EACH ROW EXECUTE FUNCTION protect_hr_payroll_finance_approval_binding();

ALTER TABLE hr_payroll_finance_approval_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_finance_approval_binding FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_payroll_finance_approval_binding_tenant_isolation
    ON hr_payroll_finance_approval_binding
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',21,'payroll_finance_approval_handoff');
