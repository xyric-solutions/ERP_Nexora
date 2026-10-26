-- Approved policy definitions and historical employment events remain unchanged.
CREATE TABLE hr_employment_policy_adoption(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,relationship_id text NOT NULL,
 source_policy_id text NOT NULL,target_policy_id text NOT NULL,source_event_id text NOT NULL,previous_adoption_id text,
 from_state_id text NOT NULL,target_state_id text NOT NULL,effective_on date NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','approved','rejected','cancelled')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 snapshot jsonb NOT NULL,source_hash text NOT NULL CHECK(source_hash~'^[a-f0-9]{64}$'),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 500),
 requested_by text NOT NULL,decided_by text,decision_reason text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),decided_at timestamptz,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,relationship_id,company_id) REFERENCES hr_employment_relationship(tenant_id,id,legal_employer_id),
 FOREIGN KEY(tenant_id,source_policy_id) REFERENCES hr_employment_lifecycle_policy(tenant_id,id),FOREIGN KEY(tenant_id,target_policy_id) REFERENCES hr_employment_lifecycle_policy(tenant_id,id),
 FOREIGN KEY(tenant_id,source_event_id) REFERENCES hr_employment_event(tenant_id,id),FOREIGN KEY(tenant_id,previous_adoption_id) REFERENCES hr_employment_policy_adoption(tenant_id,id),
 FOREIGN KEY(tenant_id,from_state_id) REFERENCES hr_employment_lifecycle_state(tenant_id,id),FOREIGN KEY(tenant_id,target_state_id) REFERENCES hr_employment_lifecycle_state(tenant_id,id),
 CHECK(source_policy_id<>target_policy_id),CHECK((state='pending' AND decided_by IS NULL AND decided_at IS NULL) OR(state<>'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND length(btrim(decision_reason)) BETWEEN 10 AND 500))
);
CREATE UNIQUE INDEX employment_policy_adoption_pending ON hr_employment_policy_adoption(tenant_id,relationship_id) WHERE state='pending';
CREATE UNIQUE INDEX employment_policy_adoption_day ON hr_employment_policy_adoption(tenant_id,relationship_id,effective_on) WHERE state='approved';
CREATE INDEX employment_policy_adoption_company ON hr_employment_policy_adoption(tenant_id,company_id,created_at DESC,id);
ALTER TABLE hr_employment_policy_adoption ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_employment_policy_adoption FORCE ROW LEVEL SECURITY;
CREATE POLICY employment_policy_adoption_tenant ON hr_employment_policy_adoption USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE FUNCTION resolve_hr_employment_policy(requested_tenant text,requested_relationship text,requested_date date)
RETURNS TABLE(policy_id text,state_id text,source_event_id text,adoption_id text) LANGUAGE sql STABLE AS $$
 SELECT coalesce(a.target_policy_id,r.lifecycle_policy_id),
        CASE WHEN a.id IS NOT NULL AND e.id=a.source_event_id THEN a.target_state_id ELSE e.resulting_state_id END,
        e.id,a.id
 FROM hr_employment_relationship r
 LEFT JOIN LATERAL(SELECT id,resulting_state_id FROM hr_employment_event WHERE tenant_id=r.tenant_id AND relationship_id=r.id AND effective_on<=requested_date ORDER BY sequence DESC LIMIT 1)e ON true
 LEFT JOIN LATERAL(SELECT id,target_policy_id,target_state_id,source_event_id FROM hr_employment_policy_adoption WHERE tenant_id=r.tenant_id AND relationship_id=r.id AND state='approved' AND effective_on<=requested_date ORDER BY effective_on DESC LIMIT 1)a ON true
 WHERE r.tenant_id=requested_tenant AND r.id=requested_relationship
$$;
CREATE FUNCTION guard_hr_employment_policy_adoption() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rel hr_employment_relationship%ROWTYPE;target hr_employment_lifecycle_policy%ROWTYPE;origin record;from_state hr_employment_lifecycle_state%ROWTYPE;target_state hr_employment_lifecycle_state%ROWTYPE;last_event hr_employment_event%ROWTYPE;prior_date date;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Policy upgrade history cannot be deleted';END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.state<>'pending' OR NEW.state NOT IN('approved','rejected','cancelled') OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','decided_by','decision_reason','decided_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','decided_by','decision_reason','decided_at']) THEN RAISE EXCEPTION 'Policy upgrade terms and decisions are immutable';END IF;
  IF NEW.state<>'approved' THEN RETURN NEW;END IF;
 ELSE IF NEW.state<>'pending' OR NEW.version<>1 THEN RAISE EXCEPTION 'Policy upgrades start as pending independent review';END IF;END IF;
 SELECT * INTO rel FROM hr_employment_relationship WHERE tenant_id=NEW.tenant_id AND legal_employer_id=NEW.company_id AND id=NEW.relationship_id FOR UPDATE;
 IF rel.id IS NULL OR rel.status<>'active' OR rel.approval_state<>'approved' THEN RAISE EXCEPTION 'Choose active approved employment';END IF;
 SELECT * INTO origin FROM resolve_hr_employment_policy(NEW.tenant_id,NEW.relationship_id,NEW.effective_on);
 SELECT * INTO last_event FROM hr_employment_event WHERE tenant_id=NEW.tenant_id AND relationship_id=NEW.relationship_id ORDER BY sequence DESC LIMIT 1;
 IF EXISTS(SELECT 1 FROM hr_employment_policy_adoption WHERE tenant_id=NEW.tenant_id AND relationship_id=NEW.relationship_id AND state='approved' AND effective_on>=NEW.effective_on AND id<>NEW.id) THEN RAISE EXCEPTION 'Policy upgrades cannot precede or replace an approved boundary';END IF;
 IF origin.policy_id IS DISTINCT FROM NEW.source_policy_id OR origin.state_id IS DISTINCT FROM NEW.from_state_id OR origin.source_event_id IS DISTINCT FROM NEW.source_event_id OR origin.adoption_id IS DISTINCT FROM NEW.previous_adoption_id OR last_event.id IS DISTINCT FROM NEW.source_event_id THEN RAISE EXCEPTION 'The employee policy or employment history changed';END IF;
 SELECT * INTO target FROM hr_employment_lifecycle_policy WHERE tenant_id=NEW.tenant_id AND id=NEW.target_policy_id;
 IF target.id IS NULL OR target.legal_employer_id<>NEW.company_id OR target.status NOT IN('approved','active') OR NEW.effective_on NOT BETWEEN target.effective_from AND coalesce(target.effective_to,'infinity'::date) OR NEW.effective_on>current_date OR NEW.effective_on<last_event.effective_on THEN RAISE EXCEPTION 'Choose an approved company policy covering a current, ordered upgrade date';END IF;
 IF NEW.previous_adoption_id IS NOT NULL THEN SELECT effective_on INTO prior_date FROM hr_employment_policy_adoption WHERE tenant_id=NEW.tenant_id AND id=NEW.previous_adoption_id;IF prior_date>=NEW.effective_on THEN RAISE EXCEPTION 'Successive policy upgrades require a later effective date';END IF;END IF;
 SELECT * INTO from_state FROM hr_employment_lifecycle_state WHERE tenant_id=NEW.tenant_id AND id=NEW.from_state_id;
 SELECT * INTO target_state FROM hr_employment_lifecycle_state WHERE tenant_id=NEW.tenant_id AND id=NEW.target_state_id;
 IF from_state.policy_id IS DISTINCT FROM NEW.source_policy_id OR target_state.policy_id IS DISTINCT FROM NEW.target_policy_id OR from_state.code IS DISTINCT FROM target_state.code OR from_state.canonical_class IS DISTINCT FROM 'employed' OR target_state.canonical_class IS DISTINCT FROM 'employed' THEN RAISE EXCEPTION 'An upgrade must retain the exact employment state meaning';END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_employment_lifecycle_transition t JOIN hr_employment_lifecycle_state s ON s.tenant_id=t.tenant_id AND s.id=t.to_state_id WHERE t.tenant_id=NEW.tenant_id AND t.policy_id=NEW.target_policy_id AND t.from_state_id=NEW.target_state_id AND t.event_type='resignation' AND s.canonical_class='ended') OR NOT EXISTS(SELECT 1 FROM hr_employment_lifecycle_transition t JOIN hr_employment_lifecycle_state s ON s.tenant_id=t.tenant_id AND s.id=t.to_state_id WHERE t.tenant_id=NEW.tenant_id AND t.policy_id=NEW.target_policy_id AND t.from_state_id=NEW.target_state_id AND t.event_type='termination' AND s.canonical_class='ended') THEN RAISE EXCEPTION 'The replacement policy must support governed employee exits';END IF;
 IF NEW.state='approved' AND(NEW.decided_by=NEW.requested_by OR EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=NEW.tenant_id AND b.employee_id=rel.employee_id AND b.user_id=NEW.decided_by AND b.ended_at IS NULL)) THEN RAISE EXCEPTION 'Independent policy upgrade approval is required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employment_policy_adoption_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_employment_policy_adoption FOR EACH ROW EXECUTE FUNCTION guard_hr_employment_policy_adoption();
CREATE FUNCTION protect_original_employment_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.lifecycle_policy_id IS DISTINCT FROM OLD.lifecycle_policy_id AND EXISTS(SELECT 1 FROM hr_employment_event WHERE tenant_id=OLD.tenant_id AND relationship_id=OLD.id) THEN RAISE EXCEPTION 'Original Hire policy references are immutable; request a governed policy upgrade';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER original_employment_policy_guard BEFORE UPDATE ON hr_employment_relationship FOR EACH ROW EXECUTE FUNCTION protect_original_employment_policy();
-- The original policy pointer describes the Hire authority; this ledger governs
-- subsequent events from the independently approved effective boundary onward.
CREATE OR REPLACE FUNCTION validate_hr_employment_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rel_start date;rel_end date;effective_policy text;transition_state text;state_policy text;policy_start date;policy_end date;prior_state text;max_sequence integer;later_count integer;valid_transition boolean;
BEGIN
 SELECT effective_from,effective_to INTO rel_start,rel_end FROM hr_employment_relationship WHERE tenant_id=NEW.tenant_id AND id=NEW.relationship_id FOR UPDATE;
 SELECT policy_id,state_id INTO effective_policy,transition_state FROM resolve_hr_employment_policy(NEW.tenant_id,NEW.relationship_id,NEW.effective_on);
 IF effective_policy IS NULL OR NEW.effective_on<rel_start OR(rel_end IS NOT NULL AND NEW.effective_on>rel_end) THEN RAISE EXCEPTION 'Employment event is outside its relationship period' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM hr_employment_policy_adoption WHERE tenant_id=NEW.tenant_id AND relationship_id=NEW.relationship_id AND state='approved' AND effective_on>NEW.effective_on) THEN RAISE EXCEPTION 'A later approved policy boundary prevents backdated events' USING ERRCODE='23514';END IF;
 SELECT effective_from,effective_to INTO policy_start,policy_end FROM hr_employment_lifecycle_policy WHERE tenant_id=NEW.tenant_id AND id=effective_policy;
 IF NEW.effective_on<policy_start OR(policy_end IS NOT NULL AND NEW.effective_on>policy_end) THEN RAISE EXCEPTION 'Employment event is outside its effective policy period' USING ERRCODE='23514';END IF;
 SELECT policy_id INTO state_policy FROM hr_employment_lifecycle_state WHERE tenant_id=NEW.tenant_id AND id=NEW.resulting_state_id;
 IF state_policy IS DISTINCT FROM effective_policy THEN RAISE EXCEPTION 'Employment event state is outside its effective policy' USING ERRCODE='23514';END IF;
 SELECT coalesce(max(sequence),0),count(*) FILTER(WHERE effective_on>NEW.effective_on) INTO max_sequence,later_count FROM hr_employment_event WHERE tenant_id=NEW.tenant_id AND relationship_id=NEW.relationship_id;
 IF NEW.sequence<>max_sequence+1 OR later_count>0 THEN RAISE EXCEPTION 'Employment event sequence or effective history is ambiguous' USING ERRCODE='23514';END IF;
 SELECT resulting_state_id INTO prior_state FROM hr_employment_event WHERE tenant_id=NEW.tenant_id AND relationship_id=NEW.relationship_id ORDER BY sequence DESC LIMIT 1;
 IF prior_state IS NULL AND max_sequence=0 THEN SELECT id INTO prior_state FROM hr_employment_lifecycle_state WHERE tenant_id=NEW.tenant_id AND policy_id=effective_policy AND is_initial;transition_state:=prior_state;END IF;
 IF prior_state IS DISTINCT FROM NEW.previous_state_id THEN RAISE EXCEPTION 'Employment event previous state does not match history' USING ERRCODE='23514';END IF;
 SELECT true INTO valid_transition FROM hr_employment_lifecycle_transition WHERE tenant_id=NEW.tenant_id AND policy_id=effective_policy AND event_type=NEW.event_type AND from_state_id IS NOT DISTINCT FROM transition_state AND to_state_id=NEW.resulting_state_id;
 IF valid_transition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Employment event does not match its approved policy authority' USING ERRCODE='23514';END IF;
 IF NEW.correction_of_event_id IS NOT NULL AND NEW.correction_of_event_id IS DISTINCT FROM(SELECT id FROM hr_employment_event WHERE tenant_id=NEW.tenant_id AND relationship_id=NEW.relationship_id ORDER BY sequence DESC LIMIT 1) THEN RAISE EXCEPTION 'Only the latest employment event may be corrected' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',87,'governed_employment_policy_adoption');
