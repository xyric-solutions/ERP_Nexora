-- The authentication boundary verifies normalized grants against the compatibility JSON projection.
-- Preserve that invariant when extending existing all-authority administrator policies.
UPDATE security_role_policy p SET permissions=coalesce((SELECT jsonb_agg(g.permission_key ORDER BY g.permission_key) FROM security_role_permission_grant g JOIN security_permission_definition d ON d.permission_key=g.permission_key AND d.status='active' WHERE g.tenant_id=p.tenant_id AND g.role_policy_id=p.id),'[]'::jsonb),row_version=p.row_version+1
 FROM security_tenant_role r WHERE r.tenant_id=p.tenant_id AND r.role_id=p.role_id AND r.role_code='super_administrator' AND p.status='active' AND p.lifecycle_state='active';
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',80,'performance_authorization_parity');
