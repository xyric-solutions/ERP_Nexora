-- Definitions only. Company administrators explicitly assign Budget access.
INSERT INTO security_permission_definition
 (permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity)
SELECT 'budget.'||resource||'.'||action,'budget',resource,action,description,'password',false,false,sensitivity
FROM (VALUES
 ('plan','read','Read company budgets and planning references.','sensitive'),
 ('plan','create','Create company budgets and versions.','restricted'),
 ('plan','update','Edit draft budgets, scenarios and forecasts.','restricted'),
 ('plan','submit','Submit budget versions for independent approval.','restricted'),
 ('plan','approve','Independently approve or reject budget versions.','restricted'),
 ('plan','activate','Activate independently approved control versions.','restricted'),
 ('model','manage','Maintain reusable budget models.','restricted'),
 ('forecast','create','Create forecasts and scenarios.','restricted'),
 ('transfer','create','Request controlled budget transfers.','restricted'),
 ('transfer','approve','Independently approve budget transfers.','restricted'),
 ('policy','configure','Configure budget control policies.','restricted'),
 ('exception','approve','Independently approve source-specific budget exceptions.','restricted'),
 ('commitment','close','Independently close residual purchase commitments.','restricted'),
 ('data','create','Import budget allocations into drafts.','restricted'),
 ('data','export','Export company budget data.','sensitive'),
 ('report','read','Read budget, actual, forecast and commitment reports.','sensitive')
) AS permissions(resource,action,description,sensitivity);
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('security',24,'budget_permissions');
