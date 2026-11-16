-- Definitions only; existing role administrators explicitly grant scoped access.
INSERT INTO security_permission_definition
 (permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity)
SELECT 'assets.asset.'||action,'assets','asset',action,description,'password',false,false,sensitivity
FROM (VALUES
 ('read','View company fixed assets.','sensitive'),
 ('create','Register assets against posted acquisition evidence.','restricted'),
 ('edit','Edit permitted asset details.','restricted'),
 ('approve','Independently approve and activate assets.','restricted'),
 ('transfer','Prepare asset assignments.','restricted'),
 ('return','Prepare vendor returns and link refunds.','restricted'),
 ('depreciate','Prepare and post approved depreciation.','restricted'),
 ('reverse','Reverse the latest posted depreciation.','restricted'),
 ('maintain','Record maintenance and physical verification.','restricted'),
 ('impair','Prepare impairment assessments.','restricted'),
 ('dispose','Prepare asset disposals.','restricted'),
 ('categories','Manage asset categories and accounting policies.','restricted'),
 ('report','Read fixed asset reports and reconciliation.','sensitive')
) AS permissions(action,description,sensitivity);
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('security',23,'fixed_assets_permissions');
