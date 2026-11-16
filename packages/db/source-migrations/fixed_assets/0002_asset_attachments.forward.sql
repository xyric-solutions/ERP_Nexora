CREATE TABLE fixed_asset_attachment (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,asset_id text NOT NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
 content_type text NOT NULL CHECK(content_type IN ('application/pdf','image/png','image/jpeg')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),checksum_sha256 text NOT NULL CHECK(checksum_sha256 ~ '^[a-f0-9]{64}$'),
 object_key text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id),UNIQUE(object_key),
 FOREIGN KEY(tenant_id,company_id,asset_id) REFERENCES fixed_asset_record(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE INDEX fixed_asset_attachment_history ON fixed_asset_attachment(tenant_id,company_id,asset_id,created_at,id);
ALTER TABLE fixed_asset_attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_asset_attachment FORCE ROW LEVEL SECURITY;
CREATE POLICY company_boundary ON fixed_asset_attachment USING(tenant_id=current_setting('nexora.tenant_id',true) AND EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=fixed_asset_attachment.tenant_id AND a.company_id=fixed_asset_attachment.company_id AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true) AND EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=fixed_asset_attachment.tenant_id AND a.company_id=fixed_asset_attachment.company_id AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL));
CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON fixed_asset_attachment FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_immutable();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('fixed_assets',2,'asset_attachments');
