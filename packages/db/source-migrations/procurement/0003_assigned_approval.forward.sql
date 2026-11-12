-- Additive assignment; historical documents retain their existing approval behavior.
ALTER TABLE procurement_document ADD COLUMN approver_id text,
 ADD CONSTRAINT procurement_document_approver_fk
 FOREIGN KEY(tenant_id,approver_id) REFERENCES security_user_account(tenant_id,id);
CREATE INDEX procurement_document_assigned_review
 ON procurement_document(tenant_id,company_id,approver_id,id) WHERE state='submitted';

-- Catalogue only: company-scoped authority must be explicitly assigned.
INSERT INTO security_permission_definition
 (permission_key,module,resource,action,description,required_assurance,
 field_context_required,source_state_context_required,sensitivity)
VALUES ('procurement.document.self_approve','procurement','document','self_approve',
 'Decide one''s own assigned Purchase document when explicitly authorized for the company.',
 'password',true,true,'restricted');
INSERT INTO nexora_schema_migration(module_name,version,name)
 VALUES('procurement',3,'assigned_approval');
