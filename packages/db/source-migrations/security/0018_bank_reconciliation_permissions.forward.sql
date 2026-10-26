-- Permission catalogue only. No role, user, company or approval-override grant
-- is assigned implicitly by this migration.
INSERT INTO security_permission_definition
 (permission_key,module,resource,action,description,required_assurance,
  field_context_required,source_state_context_required,sensitivity)
VALUES
 ('banking.statement_import.read','banking','statement_import','read','Read company Bank Statement imports and validation evidence.','password',false,false,'sensitive'),
 ('banking.statement_import.create','banking','statement_import','create','Upload bounded Bank Statement files into governed draft imports.','password',true,true,'restricted'),
 ('banking.statement_import.update','banking','statement_import','update','Update draft statement mappings and explicitly resolve statement rows.','password',true,true,'restricted'),
 ('banking.statement_import.finalize','banking','statement_import','finalize','Finalize validated statement evidence for reconciliation.','password',false,true,'restricted'),
 ('banking.statement_mapping.read','banking','statement_mapping','read','Read reusable company Bank Statement mapping profiles.','password',false,false,'sensitive'),
 ('banking.statement_mapping.manage','banking','statement_mapping','manage','Create and version reusable Bank Statement mapping profiles.','password',true,true,'restricted'),
 ('banking.reconciliation.read','banking','reconciliation','read','Read company Bank Reconciliations and captured ledger evidence.','password',false,false,'sensitive'),
 ('banking.reconciliation.create','banking','reconciliation','create','Create governed Bank Reconciliation drafts.','password',true,true,'restricted'),
 ('banking.reconciliation.update','banking','reconciliation','update','Update eligible Bank Reconciliation drafts and workspaces.','password',true,true,'restricted'),
 ('banking.reconciliation.match','banking','reconciliation','match','Propose, confirm, reject or reverse Bank Reconciliation matches.','password',true,true,'restricted'),
 ('banking.reconciliation.submit','banking','reconciliation','submit','Submit zero-difference Bank Reconciliations for independent approval.','password',false,true,'restricted'),
 ('banking.reconciliation.approve','banking','reconciliation','approve','Approve or return governed Bank Reconciliations.','password',false,true,'restricted'),
 ('banking.reconciliation_adjustment.read','banking','reconciliation_adjustment','read','Read governed Bank-only Reconciliation adjustments.','password',false,false,'sensitive'),
 ('banking.reconciliation_adjustment.create','banking','reconciliation_adjustment','create','Create a Bank-only Reconciliation adjustment draft.','password',true,true,'restricted'),
 ('banking.reconciliation_adjustment.update','banking','reconciliation_adjustment','update','Update a draft Bank-only Reconciliation adjustment.','password',true,true,'restricted'),
 ('banking.reconciliation_adjustment.submit','banking','reconciliation_adjustment','submit','Submit a Bank-only Reconciliation adjustment for independent approval.','password',false,true,'restricted'),
 ('banking.reconciliation_adjustment.approve','banking','reconciliation_adjustment','approve','Approve or reject a Bank-only Reconciliation adjustment.','password',false,true,'restricted'),
 ('banking.reconciliation_adjustment.post','banking','reconciliation_adjustment','post','Post an approved Bank-only Reconciliation adjustment to Finance.','password',false,true,'restricted'),
 ('banking.reconciliation_adjustment.reverse','banking','reconciliation_adjustment','reverse','Create a governed compensating reversal for a posted Reconciliation adjustment.','password',false,true,'restricted');

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('security',18,'bank_reconciliation_permissions');
