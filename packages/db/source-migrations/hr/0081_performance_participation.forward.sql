-- Add employee-owned appraisals and peer evidence without granting any role permissions.
CREATE TABLE hr_performance_contribution(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,cycle_id text NOT NULL,
 employee_id text NOT NULL,contributor_employee_id text NOT NULL,kind text NOT NULL CHECK(kind IN('self','peer')),
 state text NOT NULL DEFAULT 'invited' CHECK(state IN('invited','submitted','withdrawn')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 summary text NOT NULL DEFAULT '',goals_hash text NOT NULL DEFAULT '',goals jsonb NOT NULL DEFAULT '[]',ratings jsonb NOT NULL DEFAULT '[]',
 created_by text NOT NULL,updated_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,cycle_id,employee_id,contributor_employee_id,kind),
 FOREIGN KEY(tenant_id,company_id,cycle_id) REFERENCES hr_performance_record(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,employee_id) REFERENCES employee(tenant_id,id),FOREIGN KEY(tenant_id,contributor_employee_id) REFERENCES employee(tenant_id,id),
 CHECK((kind='self')=(employee_id=contributor_employee_id)),CHECK(jsonb_typeof(goals)='array' AND jsonb_typeof(ratings)='array')
);
CREATE INDEX performance_contribution_cycle ON hr_performance_contribution(tenant_id,company_id,cycle_id);
CREATE TABLE hr_performance_acknowledgement(
 tenant_id text NOT NULL,company_id text NOT NULL,review_id text NOT NULL,review_version integer NOT NULL,employee_id text NOT NULL,
 actor_id text NOT NULL,comment text NOT NULL CHECK(length(comment) BETWEEN 5 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,review_id),FOREIGN KEY(tenant_id,company_id,review_id) REFERENCES hr_performance_record(tenant_id,company_id,id),FOREIGN KEY(tenant_id,employee_id) REFERENCES employee(tenant_id,id)
);
ALTER TABLE hr_performance_contribution ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_performance_contribution FORCE ROW LEVEL SECURITY;
CREATE POLICY performance_contribution_tenant ON hr_performance_contribution USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_performance_acknowledgement ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_performance_acknowledgement FORCE ROW LEVEL SECURITY;
CREATE POLICY performance_acknowledgement_tenant ON hr_performance_acknowledgement USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE FUNCTION guard_performance_contribution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_performance_record%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Contribution history cannot be deleted'; END IF;
 SELECT * INTO c FROM hr_performance_record WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.cycle_id;
 IF c.kind IS DISTINCT FROM 'cycle' OR c.state<>'active' THEN RAISE EXCEPTION 'An active Performance cycle is required';END IF;
 IF EXISTS(SELECT 1 FROM hr_performance_record r WHERE r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id AND r.parent_id=NEW.cycle_id AND r.employee_id=NEW.employee_id AND r.kind='review' AND r.state IN('submitted','published')) THEN RAISE EXCEPTION 'Submitted manager reviews freeze contributions';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'invited' OR NEW.version<>1 OR NEW.summary<>'' OR NEW.ratings<>'[]'::jsonb OR NEW.goals<>'[]'::jsonb OR NEW.goals_hash<>'' THEN RAISE EXCEPTION 'Contributions start as empty invitations';END IF;
 ELSE
  IF OLD.state<>'invited' OR NEW.state NOT IN('submitted','withdrawn') OR NEW.version<>OLD.version+1 OR ROW(NEW.tenant_id,NEW.company_id,NEW.id,NEW.cycle_id,NEW.employee_id,NEW.contributor_employee_id,NEW.kind,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.company_id,OLD.id,OLD.cycle_id,OLD.employee_id,OLD.contributor_employee_id,OLD.kind,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Contribution identity and submitted evidence are immutable';END IF;
  IF NEW.state='submitted' AND(NOT EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=NEW.tenant_id AND b.employee_id=NEW.contributor_employee_id AND b.user_id=NEW.updated_by AND b.ended_at IS NULL) OR length(NEW.summary)<10 OR NEW.goals_hash!~'^[a-f0-9]{64}$' OR jsonb_array_length(NEW.ratings)=0) THEN RAISE EXCEPTION 'Only the bound employee can submit their appraisal';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER performance_contribution_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_contribution FOR EACH ROW EXECUTE FUNCTION guard_performance_contribution();
CREATE FUNCTION guard_performance_acknowledgement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Acknowledgements are immutable';END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_performance_record r JOIN employee_user_binding b ON b.tenant_id=r.tenant_id AND b.employee_id=r.employee_id AND b.user_id=NEW.actor_id AND b.ended_at IS NULL WHERE r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id AND r.id=NEW.review_id AND r.kind='review' AND r.state='published' AND r.employee_id=NEW.employee_id AND r.version=NEW.review_version) THEN RAISE EXCEPTION 'Only the assessed employee can acknowledge the published review';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER performance_acknowledgement_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_acknowledgement FOR EACH ROW EXECUTE FUNCTION guard_performance_acknowledgement();
CREATE FUNCTION guard_performance_participation_gate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='review' AND NEW.state IN('submitted','published') AND EXISTS(SELECT 1 FROM hr_performance_contribution p WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id AND p.cycle_id=NEW.parent_id AND p.employee_id=NEW.employee_id AND(p.state='invited' OR(p.state='submitted' AND p.goals_hash IS DISTINCT FROM NEW.terms->>'goals_hash'))) THEN RAISE EXCEPTION 'Complete invited contributions against the current goals before submitting the manager review';END IF;
 IF NEW.kind='goal' AND EXISTS(SELECT 1 FROM hr_performance_contribution p WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id AND p.cycle_id=NEW.parent_id AND p.employee_id=NEW.employee_id AND p.state='submitted') THEN RAISE EXCEPTION 'Submitted employee evidence freezes agreed goals';END IF;
 IF NEW.kind='cycle' AND NEW.state='closed' AND EXISTS(SELECT 1 FROM hr_performance_record r WHERE r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id AND r.parent_id=NEW.id AND r.kind='review' AND EXISTS(SELECT 1 FROM hr_performance_contribution p WHERE p.tenant_id=r.tenant_id AND p.cycle_id=r.parent_id AND p.employee_id=r.employee_id AND p.kind='self' AND p.state='submitted') AND NOT EXISTS(SELECT 1 FROM hr_performance_acknowledgement a WHERE a.tenant_id=r.tenant_id AND a.review_id=r.id)) THEN RAISE EXCEPTION 'Employee acknowledgement remains outstanding';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER performance_participation_gate BEFORE INSERT OR UPDATE ON hr_performance_record FOR EACH ROW EXECUTE FUNCTION guard_performance_participation_gate();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',81,'performance_participation');
