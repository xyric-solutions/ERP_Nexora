UPDATE security_permission_definition
SET required_assurance = 'password'
WHERE permission_key = ANY (
    ARRAY[
        'security.authorization.administer',
        'security.authorization.role.create',
        'security.authorization.role.edit',
        'security.authorization.role.submit',
        'security.authorization.role.approve',
        'security.authorization.role.activate',
        'security.authorization.role.archive',
        'security.authorization.assignment.create',
        'security.authorization.assignment.edit',
        'security.authorization.assignment.submit',
        'security.authorization.assignment.approve',
        'security.authorization.assignment.revoke'
    ]::text[]
);

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('security', 5, 'password_session_assurance');

