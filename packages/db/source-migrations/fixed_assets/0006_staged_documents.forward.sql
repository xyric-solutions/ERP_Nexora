CREATE TABLE fixed_asset_staged_document (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
 file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
 content_type text NOT NULL CHECK(content_type IN('application/pdf','image/png','image/jpeg')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
 checksum_sha256 text NOT NULL CHECK(checksum_sha256 ~ '^[a-f0-9]{64}$'),object_key text NOT NULL UNIQUE,
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),document_id text,claimed_at timestamptz,
 PRIMARY KEY(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,document_id) REFERENCES procurement_document(tenant_id,company_id,id)
 DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE fixed_asset_staged_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_asset_staged_document FORCE ROW LEVEL SECURITY;
CREATE POLICY staged_document_tenant ON fixed_asset_staged_document
 USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
-- Multiple units may deliberately share the same immutable private purchase document.
ALTER TABLE fixed_asset_attachment DROP CONSTRAINT fixed_asset_attachment_object_key_key;
CREATE INDEX fixed_asset_attachment_object ON fixed_asset_attachment(object_key);
ALTER TABLE fixed_asset_attachment ADD COLUMN staged_document_id text;
ALTER TABLE fixed_asset_attachment ADD CONSTRAINT fixed_asset_attachment_staged_document_fk
 FOREIGN KEY(tenant_id,company_id,staged_document_id) REFERENCES fixed_asset_staged_document(tenant_id,company_id,id);
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('fixed_assets',6,'staged_documents');
