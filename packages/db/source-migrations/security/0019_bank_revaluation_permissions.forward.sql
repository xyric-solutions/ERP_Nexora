-- Exact permission catalogue only. This migration grants no role, user,
-- company access or Super Administrator override authority implicitly.
INSERT INTO security_permission_definition
 (permission_key,module,resource,action,description,required_assurance,
  field_context_required,source_state_context_required,sensitivity)
VALUES
 ('finance.company_currency_profile.read','finance','company_currency_profile','read','Read a company functional-currency profile.','password',false,false,'sensitive'),
 ('finance.company_currency_profile.manage','finance','company_currency_profile','manage','Configure a company functional currency before it is locked.','password',true,true,'restricted'),
 ('finance.company_currency.read','finance','company_currency','read','Read company currency activations.','password',false,false,'sensitive'),
 ('finance.company_currency.manage','finance','company_currency','manage','Activate or inactivate company foreign currencies.','password',true,true,'restricted'),
 ('finance.company_currency_rate.read','finance','company_currency_rate','read','Read effective-dated company exchange-rate evidence.','password',false,false,'sensitive'),
 ('finance.company_currency_rate.manage','finance','company_currency_rate','manage','Create, correct or change company exchange-rate revisions.','password',true,true,'restricted'),
 ('banking.revaluation_policy.read','banking','revaluation_policy','read','Read company Bank Revaluation accounting policy.','password',false,false,'sensitive'),
 ('banking.revaluation_policy.manage','banking','revaluation_policy','manage','Configure governed Bank Revaluation gain and loss policy.','password',true,true,'restricted'),
 ('banking.revaluation.read','banking','revaluation','read','Read company Bank Revaluations and immutable calculation evidence.','password',false,false,'sensitive'),
 ('banking.revaluation.create','banking','revaluation','create','Preview and create a governed Bank Revaluation draft.','password',true,true,'restricted'),
 ('banking.revaluation.update','banking','revaluation','update','Update eligible Bank Revaluation drafts.','password',true,true,'restricted'),
 ('banking.revaluation.submit','banking','revaluation','submit','Submit a Bank Revaluation for independent approval.','password',false,true,'restricted'),
 ('banking.revaluation.approve','banking','revaluation','approve','Approve or reject a submitted Bank Revaluation.','password',false,true,'restricted'),
 ('banking.revaluation.post','banking','revaluation','post','Post an approved Bank Revaluation exactly once.','password',false,true,'restricted'),
 ('banking.revaluation.reverse','banking','revaluation','reverse','Reverse a posted Bank Revaluation through a compensating journal.','password',false,true,'restricted');

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('security',19,'bank_revaluation_permissions');
