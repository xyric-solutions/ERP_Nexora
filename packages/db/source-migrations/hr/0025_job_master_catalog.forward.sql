-- An additive catalog extension. Existing master rows and assignment history remain unchanged.
ALTER TABLE hr_master_record
    DROP CONSTRAINT IF EXISTS hr_master_record_master_type_check;

ALTER TABLE hr_master_record
    ADD CONSTRAINT hr_master_record_master_type_check CHECK (master_type IN (
        'job', 'designation', 'job_grade', 'cost_center', 'work_location',
        'employment_type', 'employee_category'
    ));

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 25, 'job_master_catalog');
