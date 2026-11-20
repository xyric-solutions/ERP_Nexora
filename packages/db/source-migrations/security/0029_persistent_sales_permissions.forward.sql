-- Catalogue only; existing Super Admin synchronization remains authoritative.
INSERT INTO security_permission_definition(permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity) VALUES
 ('sales.document.read','sales','document','read','Read company commercial documents and canonical Sales directories.','password',false,true,'restricted'),
 ('sales.document.create','sales','document','create','Create and maintain owned commercial drafts and confirm nonfinancial sources.','password',true,true,'restricted'),
 ('sales.document.approve','sales','document','approve','Review commercial quotations and recurring templates assigned for approval.','password',false,true,'restricted');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('security',29,'persistent_sales_permissions');
