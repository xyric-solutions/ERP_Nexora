DO $$
BEGIN
    IF to_regclass('public.hr_employee_profile_version') IS NULL
       OR to_regclass('public.hr_employment_event') IS NULL THEN
        RAISE EXCEPTION 'employee history read model requires HR profile and lifecycle migrations';
    END IF;
END $$;

INSERT INTO hr_employee_profile_version (
    id,tenant_id,employee_id,effective_from,revision,supersedes_version_id,
    first_name,middle_name,last_name,preferred_name,work_email,date_of_birth,
    personal_email,phone,recorded_by,source_reference
)
SELECT 'migration-0033-baseline-' || md5(employee.tenant_id || ':' || employee.id),
       employee.tenant_id,employee.id,CURRENT_DATE,1,NULL,
       employee.first_name,employee.middle_name,employee.last_name,
       employee.preferred_name,employee.work_email,employee.date_of_birth,
       employee.personal_email,employee.phone,'migration-0033',
       'migration:0033-current-state-baseline'
  FROM employee
 WHERE NOT EXISTS (
       SELECT 1
         FROM hr_employee_profile_version version
        WHERE version.tenant_id=employee.tenant_id
          AND version.employee_id=employee.id
 );

WITH latest_open AS (
    SELECT DISTINCT ON (version.tenant_id,version.employee_id)
           version.id,version.tenant_id,version.employee_id,
           version.effective_from,version.revision,
           employee.first_name,employee.middle_name,employee.last_name,
           employee.preferred_name,employee.work_email,employee.date_of_birth,
           employee.personal_email,employee.phone
      FROM hr_employee_profile_version version
      JOIN employee
        ON employee.tenant_id=version.tenant_id
       AND employee.id=version.employee_id
     WHERE version.effective_to IS NULL
       AND (
         version.first_name IS DISTINCT FROM employee.first_name
         OR version.middle_name IS DISTINCT FROM employee.middle_name
         OR version.last_name IS DISTINCT FROM employee.last_name
         OR version.preferred_name IS DISTINCT FROM employee.preferred_name
         OR version.work_email IS DISTINCT FROM employee.work_email
         OR version.date_of_birth IS DISTINCT FROM employee.date_of_birth
         OR version.personal_email IS DISTINCT FROM employee.personal_email
         OR version.phone IS DISTINCT FROM employee.phone
       )
     ORDER BY version.tenant_id,version.employee_id,
              version.revision DESC,version.recorded_at DESC,version.id DESC
), closed AS (
    UPDATE hr_employee_profile_version version
       SET effective_to=GREATEST(version.effective_from,CURRENT_DATE)
      FROM latest_open stale
     WHERE version.tenant_id=stale.tenant_id
       AND version.id=stale.id
    RETURNING stale.id AS supersedes_version_id,stale.tenant_id,
              stale.employee_id,stale.revision,stale.first_name,
              stale.middle_name,stale.last_name,stale.preferred_name,
              stale.work_email,stale.date_of_birth,stale.personal_email,
              stale.phone
)
INSERT INTO hr_employee_profile_version (
    id,tenant_id,employee_id,effective_from,revision,supersedes_version_id,
    first_name,middle_name,last_name,preferred_name,work_email,date_of_birth,
    personal_email,phone,recorded_by,source_reference
)
SELECT 'migration-0033-reconcile-' || md5(
           closed.tenant_id || ':' || closed.employee_id || ':' || closed.supersedes_version_id
       ),
       closed.tenant_id,closed.employee_id,CURRENT_DATE,closed.revision+1,
       closed.supersedes_version_id,closed.first_name,closed.middle_name,
       closed.last_name,closed.preferred_name,closed.work_email,
       closed.date_of_birth,closed.personal_email,closed.phone,
       'migration-0033','migration:0033-current-state-baseline'
  FROM closed;

COMMENT ON TABLE hr_employee_profile_version IS
    'Immutable effective-dated Employee profile evidence. Migration 0033 restores current baselines but does not reconstruct unrecorded intermediate edits.';

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',33,'employee_history_read_model');
