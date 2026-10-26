CREATE TABLE hr_job_opening (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type='company'),
    reference text NOT NULL CHECK (reference ~ '^JOP-[0-9]{4}-[A-Z0-9]{6}$'),
    requisition_id text NOT NULL,
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
    positions_requested integer NOT NULL CHECK (positions_requested BETWEEN 1 AND 999),
    channels jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(channels)='array'),
    closing_on date,
    state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','on_hold','closed','cancelled')),
    state_reason text NOT NULL DEFAULT '' CHECK (char_length(state_reason)<=1000),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,reference),
    FOREIGN KEY (tenant_id,company_id,company_type) REFERENCES organization_unit (tenant_id,id,type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,requisition_id) REFERENCES hr_manpower_requisition (tenant_id,id) ON DELETE RESTRICT
);

CREATE INDEX idx_hr_job_opening_company_state ON hr_job_opening (tenant_id,company_id,state,created_at DESC);

CREATE FUNCTION validate_hr_job_opening() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE approved_headcount integer; raised_headcount integer;
BEGIN
  SELECT positions_requested INTO approved_headcount FROM hr_manpower_requisition
   WHERE tenant_id=NEW.tenant_id AND id=NEW.requisition_id AND company_id=NEW.company_id AND state='approved';
  IF approved_headcount IS NULL THEN RAISE EXCEPTION 'job opening requires an approved requisition in the selected company' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(positions_requested),0)::integer INTO raised_headcount FROM hr_job_opening
   WHERE tenant_id=NEW.tenant_id AND requisition_id=NEW.requisition_id AND id<>NEW.id AND state<>'cancelled';
  IF raised_headcount + NEW.positions_requested > approved_headcount THEN RAISE EXCEPTION 'job opening headcount exceeds the approved requisition' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hr_job_opening_authority_guard BEFORE INSERT OR UPDATE OF requisition_id,company_id,positions_requested,state ON hr_job_opening FOR EACH ROW EXECUTE FUNCTION validate_hr_job_opening();
ALTER TABLE hr_job_opening ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_job_opening FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_job_opening_tenant_isolation ON hr_job_opening USING (tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
INSERT INTO nexora_schema_migration (module_name,version,name) VALUES ('hr',38,'job_openings');
