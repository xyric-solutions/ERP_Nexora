-- Permission catalog only. No role, user, company or self-approval grant is assigned implicitly.
INSERT INTO security_permission_definition
 (permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity)
VALUES
 ('banking.transfer.read','banking','transfer','read','Read governed Bank Transfers and their accounting projections.','password',false,false,'sensitive'),
 ('banking.transfer.create','banking','transfer','create','Create governed Bank Transfer drafts.','password',true,true,'restricted'),
 ('banking.transfer.update','banking','transfer','update','Update governed Bank Transfer drafts.','password',true,true,'restricted'),
 ('banking.transfer.submit','banking','transfer','submit','Submit governed Bank Transfers for independent approval.','password',false,true,'restricted'),
 ('banking.transfer.approve','banking','transfer','approve','Approve or reject governed Bank Transfers.','password',false,true,'restricted'),
 ('banking.transfer.reassign','banking','transfer','reassign','Reassign a submitted Bank Transfer to an eligible approver.','password',false,true,'restricted'),
 ('banking.transfer.post','banking','transfer','post','Explicitly post approved Bank Transfers to Finance.','password',false,true,'restricted'),
 ('banking.transfer.reverse','banking','transfer','reverse','Create a governed compensating reversal for a posted Bank Transfer.','password',false,true,'restricted'),
 ('platform.currency.manage','platform','currency','manage','Adopt and activate or inactivate tenant currencies without changing base currency.','password',true,true,'restricted'),
 ('platform.currency_rate.manage','platform','currency_rate','manage','Create, correct and change governed effective-dated currency rates.','password',true,true,'restricted'),
 ('finance.transfer_fx_policy.read','finance','transfer_fx_policy','read','Read company Bank Transfer FX and rounding policy.','password',false,false,'sensitive'),
 ('finance.transfer_fx_policy.manage','finance','transfer_fx_policy','manage','Configure company Bank Transfer FX, rounding and charge nominals.','password',true,true,'restricted');

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('security',17,'bank_transfer_permissions');
