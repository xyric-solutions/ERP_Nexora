-- HR139: employee record files and previous employment history.
--
-- 1. Employee documents can carry an uploaded file (stored in private object
--    storage under storage_key). File metadata is recorded with the document.
--    Documents stay append-only: a replacement is a new row that supersedes the
--    old one, and the only permitted change to an existing row is a single
--    removal (status active -> inactive with removed_at/removed_by). Physical
--    deletes remain rejected so the audit trail is preserved.
-- 2. hr_employee_employment_history records an employee's previous employers
--    (company, position, period, skills, last salary). Rows are maintained by
--    HR with platform audit events; removal is a soft status change.
--
-- Additive and reversible: restore the HR013 reject_employee_document_mutation
-- body (raise on every update/delete), drop the added document columns, and
-- drop hr_employee_employment_history.

ALTER TABLE employee_document
    ADD COLUMN file_name text CHECK (file_name IS NULL OR char_length(btrim(file_name)) BETWEEN 1 AND 255),
    ADD COLUMN content_type text CHECK (content_type IS NULL OR char_length(content_type) BETWEEN 3 AND 120),
    ADD COLUMN size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 1 AND 10485760),
    ADD COLUMN checksum_sha256 text CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$'),
    ADD COLUMN removed_at timestamptz,
    ADD COLUMN removed_by text CHECK (removed_by IS NULL OR char_length(removed_by) BETWEEN 1 AND 128),
    ADD CONSTRAINT employee_document_removal_check CHECK (
        (status = 'inactive') OR (removed_at IS NULL AND removed_by IS NULL)
    );

CREATE OR REPLACE FUNCTION reject_employee_document_mutation() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'employee document metadata is append-only' USING ERRCODE='23514';
    END IF;
    -- The single permitted update: remove an active document once, keeping every other value.
    IF OLD.status = 'active' AND NEW.status = 'inactive'
       AND OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL AND NEW.removed_by IS NOT NULL
       AND NEW.tenant_id = OLD.tenant_id AND NEW.id = OLD.id AND NEW.employee_id = OLD.employee_id
       AND NEW.document_type = OLD.document_type AND NEW.title = OLD.title AND NEW.reference = OLD.reference
       AND NEW.storage_key IS NOT DISTINCT FROM OLD.storage_key
       AND NEW.issued_on IS NOT DISTINCT FROM OLD.issued_on AND NEW.expires_on IS NOT DISTINCT FROM OLD.expires_on
       AND NEW.restricted = OLD.restricted AND NEW.issuing_authority = OLD.issuing_authority
       AND NEW.verification_status = OLD.verification_status AND NEW.notes IS NOT DISTINCT FROM OLD.notes
       AND NEW.supersedes_document_id IS NOT DISTINCT FROM OLD.supersedes_document_id
       AND NEW.source_reference = OLD.source_reference AND NEW.created_by = OLD.created_by
       AND NEW.created_at = OLD.created_at
       AND NEW.file_name IS NOT DISTINCT FROM OLD.file_name
       AND NEW.content_type IS NOT DISTINCT FROM OLD.content_type
       AND NEW.size_bytes IS NOT DISTINCT FROM OLD.size_bytes
       AND NEW.checksum_sha256 IS NOT DISTINCT FROM OLD.checksum_sha256 THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'employee document metadata is append-only' USING ERRCODE='23514';
END $function$;

CREATE TABLE hr_employee_employment_history (
    tenant_id text NOT NULL,
    id text NOT NULL CHECK (char_length(btrim(id)) BETWEEN 1 AND 128),
    employee_id text NOT NULL,
    company_name text NOT NULL CHECK (char_length(btrim(company_name)) BETWEEN 1 AND 200),
    job_title text NOT NULL CHECK (char_length(btrim(job_title)) BETWEEN 1 AND 160),
    start_on date NOT NULL,
    end_on date,
    skills jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(skills) = 'array' AND jsonb_array_length(skills) <= 30),
    last_salary numeric(18,4) CHECK (last_salary IS NULL OR last_salary >= 0),
    salary_currency text CHECK (salary_currency IS NULL OR salary_currency ~ '^[A-Z]{3}$'),
    responsibilities text NOT NULL DEFAULT '' CHECK (char_length(responsibilities) <= 2000),
    reason_for_leaving text NOT NULL DEFAULT '' CHECK (char_length(reason_for_leaving) <= 500),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 128),
    updated_by text NOT NULL CHECK (char_length(updated_by) BETWEEN 1 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    CHECK (end_on IS NULL OR end_on >= start_on),
    CHECK ((last_salary IS NULL) = (salary_currency IS NULL))
);
CREATE INDEX idx_hr_employee_employment_history_employee
    ON hr_employee_employment_history (tenant_id, employee_id, status, start_on DESC);

ALTER TABLE hr_employee_employment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_employment_history FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employee_employment_history_tenant_isolation ON hr_employee_employment_history
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',139,'employee_record_files_and_history');
