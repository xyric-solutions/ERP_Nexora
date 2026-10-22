CREATE TABLE hr_recruitment_interview (
  tenant_id text NOT NULL, id text NOT NULL, application_id text NOT NULL,
  round integer NOT NULL CHECK (round BETWEEN 1 AND 20), kind text NOT NULL CHECK (kind IN ('screening','technical','panel','hr','final')),
  starts_at timestamptz NOT NULL, duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 240),
  mode text NOT NULL CHECK (mode IN ('on_site','video','telephone')), location text NOT NULL CHECK (char_length(btrim(location)) BETWEEN 1 AND 300),
  template jsonb NOT NULL CHECK (jsonb_typeof(template)='array'),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  version integer NOT NULL DEFAULT 1, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,application_id,round),
  FOREIGN KEY (tenant_id,application_id) REFERENCES hr_recruitment_application (tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE hr_recruitment_interview_panel (
  tenant_id text NOT NULL, interview_id text NOT NULL, user_id text NOT NULL,
  PRIMARY KEY (tenant_id,interview_id,user_id),
  FOREIGN KEY (tenant_id,interview_id) REFERENCES hr_recruitment_interview (tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,user_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE hr_recruitment_interview_evaluation (
  tenant_id text NOT NULL, id text NOT NULL, interview_id text NOT NULL, user_id text NOT NULL,
  scores jsonb NOT NULL CHECK (jsonb_typeof(scores)='object'), weighted_score numeric(5,2) NOT NULL CHECK (weighted_score BETWEEN 0 AND 100),
  recommendation text NOT NULL CHECK (recommendation IN ('strong_hire','hire','hold','no_hire')),
  strengths text NOT NULL CHECK (char_length(btrim(strengths)) BETWEEN 1 AND 2000), concerns text NOT NULL CHECK (char_length(btrim(concerns)) BETWEEN 1 AND 2000),
  submitted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,interview_id,user_id),
  FOREIGN KEY (tenant_id,interview_id,user_id) REFERENCES hr_recruitment_interview_panel (tenant_id,interview_id,user_id) ON DELETE RESTRICT
);
CREATE TABLE hr_recruitment_assessment (
  tenant_id text NOT NULL, id text NOT NULL, application_id text NOT NULL, title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160), mandatory boolean NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','passed','failed')), reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  created_by text NOT NULL, decided_by text, decided_at timestamptz,
  PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,application_id) REFERENCES hr_recruitment_application (tenant_id,id) ON DELETE RESTRICT,
  CHECK ((status='pending' AND decided_by IS NULL AND decided_at IS NULL) OR (status<>'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE TABLE hr_recruitment_interview_event (
  tenant_id text NOT NULL,id text NOT NULL,application_id text NOT NULL,action text NOT NULL,reason text NOT NULL,actor_id text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,application_id) REFERENCES hr_recruitment_application (tenant_id,id) ON DELETE RESTRICT
);
CREATE FUNCTION guard_hr_recruitment_assessment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.status<>'pending' OR NEW.title<>OLD.title OR NEW.mandatory<>OLD.mandatory OR NEW.application_id<>OLD.application_id OR NEW.created_by<>OLD.created_by OR NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id THEN
    RAISE EXCEPTION 'Assessment identity and decided evidence are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hr_recruitment_assessment_guard BEFORE UPDATE OR DELETE ON hr_recruitment_assessment FOR EACH ROW EXECUTE FUNCTION guard_hr_recruitment_assessment();
CREATE TRIGGER hr_recruitment_evaluation_immutable BEFORE UPDATE OR DELETE ON hr_recruitment_interview_evaluation FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
CREATE TRIGGER hr_recruitment_panel_immutable BEFORE UPDATE OR DELETE ON hr_recruitment_interview_panel FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
CREATE TRIGGER hr_recruitment_interview_event_immutable BEFORE UPDATE OR DELETE ON hr_recruitment_interview_event FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['hr_recruitment_interview','hr_recruitment_interview_panel','hr_recruitment_interview_evaluation','hr_recruitment_assessment','hr_recruitment_interview_event'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''nexora.tenant_id'',true))',tab);
  END LOOP;
END $$;
CREATE INDEX idx_hr_interview_application ON hr_recruitment_interview (tenant_id,application_id,starts_at);
CREATE INDEX idx_hr_assessment_application ON hr_recruitment_assessment (tenant_id,application_id);
CREATE INDEX idx_hr_interview_event_application ON hr_recruitment_interview_event (tenant_id,application_id,occurred_at);
INSERT INTO nexora_schema_migration (module_name,version,name) VALUES ('hr',41,'interviews_evaluations');
