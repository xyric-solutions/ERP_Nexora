-- Catalog only: no role, user, company or delegation is granted implicitly.
INSERT INTO security_permission_definition(permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity) VALUES
 ('security.bank_self_approval.read','security','bank_self_approval','read','Read company Bank self-approval grant history.','password',false,false,'restricted'),
 ('security.bank_self_approval.manage','security','bank_self_approval','manage','Issue/revoke company and transaction-kind Bank self-approval grants (global administrators only).','password',false,false,'restricted');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('security',16,'bank_self_approval_permissions');
