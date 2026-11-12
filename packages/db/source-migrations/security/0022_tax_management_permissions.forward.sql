INSERT INTO security_permission_definition
 (permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity)
VALUES
 ('finance.tax.read','finance','tax','read','Read company tax definitions and mappings.','password',false,false,'sensitive'),
 ('finance.tax.manage','finance','tax','manage','Maintain company tax definitions.','password',true,true,'restricted'),
 ('finance.tax_mapping.admin','finance','tax_mapping','admin','Administer company tax nominal mappings.','password',true,true,'restricted');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('security',22,'tax_management_permissions');
