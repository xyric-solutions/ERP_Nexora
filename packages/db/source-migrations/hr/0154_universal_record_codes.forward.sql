-- HR154: every HR & Payroll record created from an Add / New / Create form carries a stable,
-- automatically allocated code (PREFIX-###, reserved by allocateHrCode inside the create transaction).
--
-- 1. Record types without a code gain a nullable `code` column. Existing rows keep NULL: historical
--    records are not renumbered. New rows always receive a code from the API.
-- 2. Recruitment references (MRQ/JOP/CAN/APL/OFR) keep their historical year-random values and also
--    accept the sequential PREFIX-### form for new records.
-- 3. Overtime request references gain the unique index the other attendance references already have.
-- Codes are unique per company (or per tenant where the table has no company) and are never updated
-- after insert, so existing immutability guards that compare whole rows are unaffected.
-- Rollback: drop each uq_<table>_code index, <table>_code_format constraint and code column listed
-- below (only after confirming no code is referenced externally), restore the five recruitment
-- reference CHECKs to their year-random form (only if no sequential reference exists), and drop
-- uq_hr_overtime_request_reference.

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('hr_recruitment_interview',                          false),
      ('hr_recruitment_assessment',                         false),
      ('hr_overtime_rule',                                  true),
      ('hr_leave_transaction',                              true),
      ('hr_employee_transfer_request',                      true),
      ('hr_employee_promotion_request',                     true),
      ('hr_employee_manager_change_request',                true),
      ('hr_employee_work_location_change_request',          true),
      ('hr_employee_organization_placement_change_request', true),
      ('employee_assignment',                               true),
      ('hr_lifecycle_case',                                 true),
      ('employee_contact',                                  false),
      ('employee_emergency_contact',                        false),
      ('employee_document',                                 false),
      ('hr_employee_employment_history',                    false),
      ('hr_salary_assignment',                              true),
      ('hr_payroll_adjustment',                             true),
      ('hr_employee_ot_arrangement',                        true),
      ('hr_payroll_localization_request',                   true),
      ('hr_payroll_policy',                                 true),
      ('hr_payroll_period',                                 true)
    ) AS t(table_name, company_scoped)
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS code text', item.table_name);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (code IS NULL OR code ~ %L)',
      item.table_name, item.table_name || '_code_format', '^[A-Z]{2,5}-[0-9]{3,9}$');
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (tenant_id, %s code) WHERE code IS NOT NULL',
      'uq_' || item.table_name || '_code', item.table_name,
      CASE WHEN item.company_scoped THEN 'company_id,' ELSE '' END);
  END LOOP;
END $$;

ALTER TABLE hr_manpower_requisition DROP CONSTRAINT hr_manpower_requisition_reference_check,
  ADD CONSTRAINT hr_manpower_requisition_reference_check CHECK (reference ~ '^MRQ-([0-9]{4}-[A-Z0-9]{6}|[0-9]{3,9})$');
ALTER TABLE hr_job_opening DROP CONSTRAINT hr_job_opening_reference_check,
  ADD CONSTRAINT hr_job_opening_reference_check CHECK (reference ~ '^JOP-([0-9]{4}-[A-Z0-9]{6}|[0-9]{3,9})$');
ALTER TABLE hr_candidate DROP CONSTRAINT hr_candidate_reference_check,
  ADD CONSTRAINT hr_candidate_reference_check CHECK (reference ~ '^CAN-([0-9]{4}-[A-Z0-9]{6}|[0-9]{3,9})$');
ALTER TABLE hr_recruitment_application DROP CONSTRAINT hr_recruitment_application_reference_check,
  ADD CONSTRAINT hr_recruitment_application_reference_check CHECK (reference ~ '^APL-([0-9]{4}-[A-Z0-9]{12}|[0-9]{3,9})$');
ALTER TABLE hr_recruitment_offer DROP CONSTRAINT hr_recruitment_offer_reference_check,
  ADD CONSTRAINT hr_recruitment_offer_reference_check CHECK (reference ~ '^OFR-([0-9]{4}-[A-Z0-9]{12}|[0-9]{3,9})$');

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_overtime_request_reference ON hr_overtime_request (tenant_id, company_id, reference);

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',154,'universal_record_codes');
