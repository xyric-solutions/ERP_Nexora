-- Loans and salary advances share the governed loan workflow but stay separate records.
-- Existing rows remain loans. The kind is part of the immutable terms set at creation.
ALTER TABLE hr_employee_loan
    ADD COLUMN loan_kind text NOT NULL DEFAULT 'loan' CHECK (loan_kind IN ('loan','advance'));

CREATE INDEX idx_hr_employee_loan_kind ON hr_employee_loan (tenant_id,company_id,loan_kind);

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',151,'employee_loan_kind');
