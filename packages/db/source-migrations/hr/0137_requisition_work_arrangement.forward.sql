-- HR137: Manpower requisitions record where the role works, using the same
-- arrangement values as the Work Location master's working pattern (HR036):
-- on_site, hybrid, remote, client_site.
--
-- Additive: existing requisitions keep a NULL arrangement (history is not
-- relabelled). The API requires the field on new requisitions; the column
-- only constrains the allowed values.
--
-- Rollback: drop the constraint and the column.

ALTER TABLE hr_manpower_requisition
    ADD COLUMN work_arrangement text,
    ADD CONSTRAINT hr_manpower_requisition_work_arrangement_check CHECK (
        work_arrangement IS NULL OR work_arrangement IN ('on_site', 'hybrid', 'remote', 'client_site')
    );

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',137,'requisition_work_arrangement');
