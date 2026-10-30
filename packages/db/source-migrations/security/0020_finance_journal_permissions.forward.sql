-- Exact Finance Journal permission catalogue only. This migration grants no
-- role, user, company access, self-approval or override authority implicitly.
INSERT INTO security_permission_definition
 (permission_key,module,resource,action,description,required_assurance,
  field_context_required,source_state_context_required,sensitivity)
VALUES
 ('finance.journal.update','finance','journal','update','Update an eligible Manual Journal draft.','password',true,true,'restricted'),
 ('finance.journal.delete_draft','finance','journal','delete_draft','Permanently delete eligible Manual Journal draft content with an audit tombstone.','password',true,true,'restricted'),
 ('finance.journal.submit','finance','journal','submit','Submit a balanced Manual Journal for approval.','password',false,true,'restricted'),
 ('finance.journal.approve','finance','journal','approve','Review, reject or confirm and post a submitted Manual Journal.','password',false,true,'restricted'),
 ('finance.journal.self_approve','finance','journal','self_approve','Approve and post one''s own Manual Journal when explicitly assigned.','password',true,true,'restricted'),
 ('finance.journal.reject','finance','journal','reject','Reject a submitted Manual Journal back to draft.','password',false,true,'restricted'),
 ('finance.recurring_journal.read','finance','recurring_journal','read','Read Recurring Journal templates and occurrence history.','password',false,false,'sensitive'),
 ('finance.recurring_journal.manage','finance','recurring_journal','manage','Create, change, activate, inactivate or generate governed Recurring Journal templates.','password',true,true,'restricted');

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('security',20,'finance_journal_permissions');
