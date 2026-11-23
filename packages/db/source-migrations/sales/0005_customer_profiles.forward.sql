CREATE TABLE sales_customer_profile (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  party_id text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  profile jsonb NOT NULL CHECK (profile->>'format' IS NOT DISTINCT FROM 'supplier-profile-v1'),
  version integer NOT NULL CHECK (version > 0),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, company_id, party_id),
  FOREIGN KEY (tenant_id, company_id, party_id) REFERENCES party (tenant_id, company_id, id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES security_user_account (tenant_id, id)
);

ALTER TABLE sales_customer_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_customer_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY company_scope ON sales_customer_profile USING (
  tenant_id = current_setting('nexora.tenant_id', true) AND EXISTS (
    SELECT 1 FROM security_user_company_access a
    WHERE a.tenant_id = sales_customer_profile.tenant_id AND a.company_id = sales_customer_profile.company_id
      AND a.user_id = current_setting('nexora.user_id', true) AND a.revoked_at IS NULL
  )
) WITH CHECK (
  tenant_id = current_setting('nexora.tenant_id', true) AND EXISTS (
    SELECT 1 FROM security_user_company_access a
    WHERE a.tenant_id = sales_customer_profile.tenant_id AND a.company_id = sales_customer_profile.company_id
      AND a.user_id = current_setting('nexora.user_id', true) AND a.revoked_at IS NULL
  )
);

INSERT INTO nexora_schema_migration (module_name, version, name) VALUES ('sales', 5, 'customer_profiles');
