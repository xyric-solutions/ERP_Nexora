-- Definitions only: no implicit grants or financial data.
INSERT INTO security_permission_definition
 (permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity)
VALUES
 ('finance.subledger.read','finance','subledger','read','Read company monetary open items.','password',false,false,'sensitive'),
 ('finance.subledger.manage','finance','subledger','manage','Configure parties and currency accounting; prepare financial drafts.','password',true,true,'restricted'),
 ('finance.subledger.approve','finance','subledger','approve','Independently approve monetary subledger operations.','password',true,true,'restricted'),
 ('finance.subledger.post','finance','subledger','post','Post independently approved monetary subledger operations.','password',true,true,'restricted'),
 ('finance.subledger.report','finance','subledger','report','Read reconciled currency and financial reports.','password',false,false,'sensitive');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('security',21,'multi_currency_subledger_permissions');
