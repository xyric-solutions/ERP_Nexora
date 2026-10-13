ALTER TABLE employee_status_history
    DROP CONSTRAINT employee_status_history_tenant_id_employee_id_effective_on__key;

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 4, 'workflow_status_history');
