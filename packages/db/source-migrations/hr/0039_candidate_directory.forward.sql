CREATE TABLE hr_candidate (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type='company'),
    reference text NOT NULL CHECK (reference ~ '^CAN-[0-9]{4}-[A-Z0-9]{6}$'),
    first_name text NOT NULL CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 100),
    last_name text NOT NULL CHECK (char_length(btrim(last_name)) BETWEEN 1 AND 100),
    email text NOT NULL CHECK (char_length(btrim(email)) BETWEEN 3 AND 320 AND position('@' IN email)>1),
    phone text NOT NULL DEFAULT '' CHECK (char_length(phone)<=40),
    source text NOT NULL CHECK (source IN ('direct','referral','agency','job_board','other')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,reference),
    FOREIGN KEY (tenant_id,company_id,company_type) REFERENCES organization_unit (tenant_id,id,type) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX uq_hr_candidate_company_email_active ON hr_candidate (tenant_id,company_id,lower(email)) WHERE status='active';
CREATE INDEX idx_hr_candidate_company_name ON hr_candidate (tenant_id,company_id,status,last_name,first_name,created_at DESC);
ALTER TABLE hr_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_candidate FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_candidate_tenant_isolation ON hr_candidate USING (tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
INSERT INTO nexora_schema_migration (module_name,version,name) VALUES ('hr',39,'candidate_directory');
