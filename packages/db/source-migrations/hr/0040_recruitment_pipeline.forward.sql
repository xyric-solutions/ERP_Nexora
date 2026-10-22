ALTER TABLE hr_candidate ADD CONSTRAINT uq_hr_candidate_company_id UNIQUE (tenant_id,company_id,id);
ALTER TABLE hr_job_opening ADD CONSTRAINT uq_hr_opening_company_id UNIQUE (tenant_id,company_id,id);
CREATE TABLE hr_recruitment_application (
  id text NOT NULL, tenant_id text NOT NULL, company_id text NOT NULL, candidate_id text NOT NULL, opening_id text NOT NULL,
  reference text NOT NULL CHECK (reference ~ '^APL-[0-9]{4}-[A-Z0-9]{12}$'),
  stage text NOT NULL DEFAULT 'application' CHECK (stage IN ('application','screening','shortlisted','interview','evaluation','selected','hired','rejected','withdrawn')),
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,company_id,reference), CONSTRAINT uq_hr_application_candidate_opening UNIQUE (tenant_id,candidate_id,opening_id),
  FOREIGN KEY (tenant_id,company_id,candidate_id) REFERENCES hr_candidate (tenant_id,company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,company_id,opening_id) REFERENCES hr_job_opening (tenant_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX idx_hr_application_pipeline ON hr_recruitment_application (tenant_id,company_id,stage,created_at DESC,id);
CREATE TABLE hr_recruitment_application_event (
  id text NOT NULL, tenant_id text NOT NULL, application_id text NOT NULL, actor_id text NOT NULL,
  from_stage text, to_stage text NOT NULL, reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,application_id) REFERENCES hr_recruitment_application (tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX idx_hr_application_event_trail ON hr_recruitment_application_event (tenant_id,application_id,occurred_at,id);
CREATE TRIGGER hr_application_event_immutable BEFORE UPDATE OR DELETE ON hr_recruitment_application_event FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
ALTER TABLE hr_recruitment_application ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_recruitment_application FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_application_tenant_isolation ON hr_recruitment_application USING (tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_recruitment_application_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_recruitment_application_event FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_application_event_tenant_isolation ON hr_recruitment_application_event USING (tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
INSERT INTO nexora_schema_migration (module_name,version,name) VALUES ('hr',40,'recruitment_pipeline');
