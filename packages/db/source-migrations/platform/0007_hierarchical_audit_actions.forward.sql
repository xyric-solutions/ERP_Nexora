-- Platform audit actions were originally limited to exactly three segments.
-- Governed workflows use additional bounded segments to identify the domain,
-- aggregate and lifecycle action without overloading entity fields.
ALTER TABLE platform_admin_audit_event
    DROP CONSTRAINT platform_admin_audit_event_action_check,
    ADD CONSTRAINT platform_admin_audit_event_action_check
        CHECK (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,5}$');

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('platform', 7, 'hierarchical_audit_actions');
