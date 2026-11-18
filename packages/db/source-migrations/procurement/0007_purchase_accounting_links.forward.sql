CREATE TABLE procurement_accounting_link (
 tenant_id text NOT NULL, company_id text NOT NULL, document_id text NOT NULL,
 operation_id text NOT NULL, source_version integer NOT NULL CHECK(source_version>0),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,document_id), UNIQUE(tenant_id,company_id,operation_id),
 FOREIGN KEY(tenant_id,company_id,document_id) REFERENCES procurement_document(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,operation_id) REFERENCES finance_subledger_operation(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id)
);
ALTER TABLE procurement_accounting_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_accounting_link FORCE ROW LEVEL SECURITY;
CREATE POLICY company_scope ON procurement_accounting_link USING
 (tenant_id=current_setting('nexora.tenant_id',true) AND EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=procurement_accounting_link.tenant_id AND a.company_id=procurement_accounting_link.company_id AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL))
 WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true) AND EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=procurement_accounting_link.tenant_id AND a.company_id=procurement_accounting_link.company_id AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL));
CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON procurement_accounting_link
 FOR EACH ROW EXECUTE FUNCTION guard_finance_subledger_immutable();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('procurement',7,'purchase_accounting_links');
