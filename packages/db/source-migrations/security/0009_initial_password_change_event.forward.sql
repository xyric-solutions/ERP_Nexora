ALTER TABLE security_authentication_event
    DROP CONSTRAINT security_authentication_event_event_type_check,
    ADD CONSTRAINT security_authentication_event_event_type_check CHECK (
        event_type IN (
            'credential_verified',
            'tenant_selection_required',
            'tenant_selected',
            'initial_password_changed',
            'session_issued'
        )
    );

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('security', 9, 'initial_password_change_event');
