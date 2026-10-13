CREATE TABLE hr_employment_lifecycle_policy (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    legal_employer_id text NOT NULL,
    legal_employer_type text GENERATED ALWAYS AS ('company'::text) STORED,
    code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,31}$'),
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
    version integer NOT NULL CHECK (version > 0),
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','pending_approval','approved','active','inactive')),
    effective_from date NOT NULL,
    effective_to date,
    created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 128),
    submitted_by text CHECK (submitted_by IS NULL OR length(submitted_by) BETWEEN 1 AND 128),
    approved_by text CHECK (approved_by IS NULL OR length(approved_by) BETWEEN 1 AND 128),
    activated_by text CHECK (activated_by IS NULL OR length(activated_by) BETWEEN 1 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz,
    approved_at timestamptz,
    activated_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, id, legal_employer_id),
    UNIQUE (tenant_id, legal_employer_id, code, version),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, legal_employer_id, legal_employer_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (status <> 'pending_approval' OR (submitted_by IS NOT NULL AND submitted_at IS NOT NULL)),
    CHECK (status NOT IN ('approved','active','inactive') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
    CHECK (status <> 'active' OR (activated_by IS NOT NULL AND activated_at IS NOT NULL)),
    EXCLUDE USING gist (
        tenant_id WITH =, legal_employer_id WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    ) WHERE (status = 'active')
);

CREATE TABLE hr_employment_lifecycle_state (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    policy_id text NOT NULL,
    code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{0,63}$'),
    label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
    canonical_class text NOT NULL
        CHECK (canonical_class IN ('pre_employment','employed','temporarily_inactive','ended')),
    is_initial boolean NOT NULL DEFAULT false,
    display_order integer NOT NULL CHECK (display_order > 0),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, policy_id, id),
    UNIQUE (tenant_id, policy_id, code),
    UNIQUE (tenant_id, policy_id, display_order),
    FOREIGN KEY (tenant_id, policy_id)
        REFERENCES hr_employment_lifecycle_policy (tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX uq_hr_employment_lifecycle_initial_state
    ON hr_employment_lifecycle_state (tenant_id, policy_id) WHERE is_initial;

CREATE TABLE hr_employment_lifecycle_transition (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    policy_id text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN (
        'hire','probation','confirmation','suspension','resume',
        'resignation','termination','rehire'
    )),
    from_state_id text,
    to_state_id text NOT NULL,
    requires_approval boolean NOT NULL DEFAULT false,
    workflow_trigger text CHECK (
        workflow_trigger IS NULL OR workflow_trigger ~ '^[a-z][a-z0-9_]{0,127}$'
    ),
    PRIMARY KEY (tenant_id, id),
    UNIQUE NULLS NOT DISTINCT (tenant_id, policy_id, event_type, from_state_id),
    FOREIGN KEY (tenant_id, policy_id)
        REFERENCES hr_employment_lifecycle_policy (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, policy_id, from_state_id)
        REFERENCES hr_employment_lifecycle_state (tenant_id, policy_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, policy_id, to_state_id)
        REFERENCES hr_employment_lifecycle_state (tenant_id, policy_id, id) ON DELETE RESTRICT,
    CHECK (from_state_id IS DISTINCT FROM to_state_id),
    CHECK (NOT requires_approval OR workflow_trigger IS NOT NULL)
);

ALTER TABLE hr_employment_relationship
    ADD COLUMN lifecycle_policy_id text,
    ADD COLUMN approval_state text NOT NULL DEFAULT 'draft'
        CHECK (approval_state IN ('draft','pending','approved','rejected')),
    ADD COLUMN rehire_of_relationship_id text,
    ADD CONSTRAINT fk_hr_employment_relationship_policy
        FOREIGN KEY (tenant_id, lifecycle_policy_id)
        REFERENCES hr_employment_lifecycle_policy (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_hr_employment_relationship_rehire
        FOREIGN KEY (tenant_id, rehire_of_relationship_id)
        REFERENCES hr_employment_relationship (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT hr_employment_relationship_rehire_distinct
        CHECK (rehire_of_relationship_id IS NULL OR rehire_of_relationship_id <> id);

CREATE TABLE hr_employment_lifecycle_request (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    relationship_id text NOT NULL,
    transition_id text NOT NULL,
    effective_on date NOT NULL,
    reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
    source_reference text NOT NULL CHECK (length(trim(source_reference)) BETWEEN 1 AND 512),
    correction_of_event_id text,
    previous_state_id text,
    resulting_state_id text NOT NULL,
    workflow_instance_id text,
    approval_state text NOT NULL DEFAULT 'pending'
        CHECK (approval_state IN ('pending','approved','rejected','cancelled')),
    requested_by text NOT NULL CHECK (length(requested_by) BETWEEN 1 AND 128),
    requested_at timestamptz NOT NULL DEFAULT now(),
    decided_by text CHECK (decided_by IS NULL OR length(decided_by) BETWEEN 1 AND 128),
    decided_at timestamptz,
    decision_comment text NOT NULL DEFAULT '' CHECK (length(decision_comment) <= 2000),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, relationship_id, id),
    FOREIGN KEY (tenant_id, relationship_id)
        REFERENCES hr_employment_relationship (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, transition_id)
        REFERENCES hr_employment_lifecycle_transition (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, previous_state_id)
        REFERENCES hr_employment_lifecycle_state (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, resulting_state_id)
        REFERENCES hr_employment_lifecycle_state (tenant_id, id) ON DELETE RESTRICT,
    CHECK ((approval_state = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
        OR (approval_state <> 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)),
    CHECK (approval_state <> 'rejected' OR length(trim(decision_comment)) > 0)
);
CREATE UNIQUE INDEX uq_hr_employment_lifecycle_pending_request
    ON hr_employment_lifecycle_request (tenant_id, relationship_id)
    WHERE approval_state = 'pending';
CREATE INDEX idx_hr_employment_lifecycle_request_workflow
    ON hr_employment_lifecycle_request (tenant_id, workflow_instance_id)
    WHERE workflow_instance_id IS NOT NULL;

CREATE TABLE hr_employment_event (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    relationship_id text NOT NULL,
    request_id text,
    sequence integer NOT NULL CHECK (sequence > 0),
    event_type text NOT NULL CHECK (event_type IN (
        'hire','probation','confirmation','suspension','resume',
        'resignation','termination','rehire'
    )),
    effective_on date NOT NULL,
    previous_state_id text,
    resulting_state_id text NOT NULL,
    recorded_by text NOT NULL CHECK (length(recorded_by) BETWEEN 1 AND 128),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    approved_by text NOT NULL CHECK (length(approved_by) BETWEEN 1 AND 128),
    approved_at timestamptz NOT NULL,
    source_reference text NOT NULL CHECK (length(trim(source_reference)) BETWEEN 1 AND 512),
    correction_of_event_id text,
    reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, relationship_id, sequence),
    UNIQUE (tenant_id, request_id),
    FOREIGN KEY (tenant_id, relationship_id)
        REFERENCES hr_employment_relationship (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, request_id)
        REFERENCES hr_employment_lifecycle_request (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, previous_state_id)
        REFERENCES hr_employment_lifecycle_state (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, resulting_state_id)
        REFERENCES hr_employment_lifecycle_state (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, correction_of_event_id)
        REFERENCES hr_employment_event (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_hr_employment_event_history
    ON hr_employment_event (tenant_id, relationship_id, effective_on DESC, sequence DESC);

CREATE FUNCTION protect_hr_employment_policy_definition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE policy_status text;
BEGIN
    SELECT status INTO policy_status FROM hr_employment_lifecycle_policy
     WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id)
       AND id=COALESCE(NEW.policy_id,OLD.policy_id);
    IF policy_status <> 'draft' THEN
        RAISE EXCEPTION 'approved lifecycle policy definitions are immutable' USING ERRCODE='23514';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_employment_lifecycle_state_policy_guard
BEFORE INSERT OR UPDATE OR DELETE ON hr_employment_lifecycle_state
FOR EACH ROW EXECUTE FUNCTION protect_hr_employment_policy_definition();
CREATE TRIGGER hr_employment_lifecycle_transition_policy_guard
BEFORE INSERT OR UPDATE OR DELETE ON hr_employment_lifecycle_transition
FOR EACH ROW EXECUTE FUNCTION protect_hr_employment_policy_definition();

CREATE FUNCTION protect_hr_employment_policy() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' AND OLD.status<>'draft' THEN
        RAISE EXCEPTION 'approved lifecycle policies cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF OLD.status<>'draft' AND (
        NEW.tenant_id<>OLD.tenant_id OR NEW.legal_employer_id<>OLD.legal_employer_id
        OR NEW.code<>OLD.code OR NEW.name<>OLD.name OR NEW.version<>OLD.version
        OR NEW.effective_from<>OLD.effective_from OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
        OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
    ) THEN
        RAISE EXCEPTION 'submitted lifecycle policy identity is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status='draft' AND NEW.status NOT IN ('draft','pending_approval') THEN
        RAISE EXCEPTION 'draft lifecycle policy must be submitted before approval' USING ERRCODE='23514';
    END IF;
    IF OLD.status='pending_approval' AND NEW.status NOT IN ('pending_approval','approved','draft') THEN
        RAISE EXCEPTION 'pending lifecycle policy must be decided before activation' USING ERRCODE='23514';
    END IF;
    IF OLD.status IN ('approved','active','inactive') AND NOT (
        (OLD.status='approved' AND NEW.status='active')
        OR (OLD.status='active' AND NEW.status='inactive')
        OR NEW.status=OLD.status
    ) THEN
        RAISE EXCEPTION 'approved lifecycle policy versions cannot be reopened' USING ERRCODE='23514';
    END IF;
    IF OLD.status='inactive' AND NEW.status<>OLD.status THEN
        RAISE EXCEPTION 'inactive lifecycle policy versions are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_employment_lifecycle_policy_immutable
BEFORE UPDATE OR DELETE ON hr_employment_lifecycle_policy
FOR EACH ROW EXECUTE FUNCTION protect_hr_employment_policy();

CREATE FUNCTION protect_hr_employment_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'employment lifecycle events are append-only' USING ERRCODE='23514';
END $$;
CREATE TRIGGER hr_employment_event_immutable
BEFORE UPDATE OR DELETE ON hr_employment_event
FOR EACH ROW EXECUTE FUNCTION protect_hr_employment_event();

CREATE FUNCTION protect_hr_employment_request() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'employment lifecycle requests cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF NEW.tenant_id<>OLD.tenant_id OR NEW.relationship_id<>OLD.relationship_id
       OR NEW.transition_id<>OLD.transition_id OR NEW.effective_on<>OLD.effective_on
       OR NEW.reason<>OLD.reason OR NEW.source_reference<>OLD.source_reference
       OR NEW.correction_of_event_id IS DISTINCT FROM OLD.correction_of_event_id
       OR NEW.previous_state_id IS DISTINCT FROM OLD.previous_state_id
       OR NEW.resulting_state_id<>OLD.resulting_state_id
       OR NEW.workflow_instance_id IS DISTINCT FROM OLD.workflow_instance_id
       OR NEW.requested_by<>OLD.requested_by OR NEW.requested_at<>OLD.requested_at THEN
        RAISE EXCEPTION 'employment lifecycle request evidence is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.approval_state<>'pending' THEN
        RAISE EXCEPTION 'decided employment lifecycle requests are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_employment_lifecycle_request_evidence_guard
BEFORE UPDATE OR DELETE ON hr_employment_lifecycle_request
FOR EACH ROW EXECUTE FUNCTION protect_hr_employment_request();

CREATE FUNCTION validate_hr_employment_relationship_lifecycle() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE policy_employer text; policy_status text; policy_start date; policy_end date;
        prior_employee text; prior_end date; prior_class text;
        latest_class text; expected_status text;
BEGIN
    IF NEW.lifecycle_policy_id IS NOT NULL THEN
        SELECT legal_employer_id,status,effective_from,effective_to
          INTO policy_employer,policy_status,policy_start,policy_end
          FROM hr_employment_lifecycle_policy
         WHERE tenant_id=NEW.tenant_id AND id=NEW.lifecycle_policy_id;
        IF policy_employer IS DISTINCT FROM NEW.legal_employer_id
           OR policy_status NOT IN ('approved','active','inactive')
           OR (TG_OP='INSERT' AND policy_status IS DISTINCT FROM 'active')
           OR NEW.effective_from<policy_start
           OR (policy_end IS NOT NULL AND NEW.effective_from>policy_end) THEN
            RAISE EXCEPTION 'lifecycle policy legal employer mismatch' USING ERRCODE='23514';
        END IF;
    END IF;
    IF NEW.rehire_of_relationship_id IS NOT NULL THEN
        SELECT prior.employee_id,prior.effective_to,state.canonical_class
          INTO prior_employee,prior_end,prior_class
          FROM hr_employment_relationship
         prior LEFT JOIN LATERAL (
            SELECT lifecycle_state.canonical_class
              FROM hr_employment_event event
              JOIN hr_employment_lifecycle_state lifecycle_state
                ON lifecycle_state.tenant_id=event.tenant_id AND lifecycle_state.id=event.resulting_state_id
             WHERE event.tenant_id=prior.tenant_id AND event.relationship_id=prior.id
             ORDER BY event.effective_on DESC,event.sequence DESC LIMIT 1
         ) state ON true
         WHERE prior.tenant_id=NEW.tenant_id AND prior.id=NEW.rehire_of_relationship_id;
        IF prior_employee IS DISTINCT FROM NEW.employee_id OR prior_class IS DISTINCT FROM 'ended'
           OR prior_end IS NULL OR NEW.effective_from<=prior_end THEN
            RAISE EXCEPTION 'rehire requires an ended relationship for the same employee' USING ERRCODE='23514';
        END IF;
    END IF;
    IF TG_OP='UPDATE' AND OLD.status='ended' THEN
        RAISE EXCEPTION 'ended employment relationships are immutable' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND NEW.lifecycle_policy_id IS NOT NULL AND NEW.status<>OLD.status THEN
        SELECT s.canonical_class INTO latest_class
          FROM hr_employment_event e
          JOIN hr_employment_lifecycle_state s ON s.tenant_id=e.tenant_id AND s.id=e.resulting_state_id
         WHERE e.tenant_id=NEW.tenant_id AND e.relationship_id=NEW.id
         ORDER BY e.sequence DESC LIMIT 1;
        expected_status := CASE latest_class
            WHEN 'pre_employment' THEN 'draft'
            WHEN 'employed' THEN 'active'
            WHEN 'temporarily_inactive' THEN 'suspended'
            WHEN 'ended' THEN 'ended'
        END;
        IF expected_status IS DISTINCT FROM NEW.status THEN
            RAISE EXCEPTION 'relationship status must project its latest lifecycle event' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_employment_relationship_lifecycle_guard
BEFORE INSERT OR UPDATE ON hr_employment_relationship
FOR EACH ROW EXECUTE FUNCTION validate_hr_employment_relationship_lifecycle();

CREATE FUNCTION validate_hr_employment_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE rel_start date; rel_end date; rel_policy text; state_policy text;
        policy_start date; policy_end date; prior_state text;
        max_sequence integer; later_count integer; valid_transition boolean;
BEGIN
    SELECT effective_from,effective_to,lifecycle_policy_id
      INTO rel_start,rel_end,rel_policy
      FROM hr_employment_relationship
     WHERE tenant_id=NEW.tenant_id AND id=NEW.relationship_id FOR UPDATE;
    IF rel_policy IS NULL OR NEW.effective_on<rel_start
       OR (rel_end IS NOT NULL AND NEW.effective_on>rel_end) THEN
        RAISE EXCEPTION 'employment event is outside its relationship period' USING ERRCODE='23514';
    END IF;
    SELECT effective_from,effective_to INTO policy_start,policy_end
      FROM hr_employment_lifecycle_policy
     WHERE tenant_id=NEW.tenant_id AND id=rel_policy;
    IF NEW.effective_on<policy_start OR (policy_end IS NOT NULL AND NEW.effective_on>policy_end) THEN
        RAISE EXCEPTION 'employment event is outside its lifecycle policy period' USING ERRCODE='23514';
    END IF;
    SELECT policy_id INTO state_policy FROM hr_employment_lifecycle_state
     WHERE tenant_id=NEW.tenant_id AND id=NEW.resulting_state_id;
    IF state_policy IS DISTINCT FROM rel_policy THEN
        RAISE EXCEPTION 'employment event state is outside its lifecycle policy' USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(max(sequence),0), count(*) FILTER (WHERE effective_on>NEW.effective_on)
      INTO max_sequence,later_count FROM hr_employment_event
     WHERE tenant_id=NEW.tenant_id AND relationship_id=NEW.relationship_id;
    IF NEW.sequence<>max_sequence+1 OR later_count>0 THEN
        RAISE EXCEPTION 'employment event sequence or effective history is ambiguous' USING ERRCODE='23514';
    END IF;
    SELECT resulting_state_id INTO prior_state FROM hr_employment_event
     WHERE tenant_id=NEW.tenant_id AND relationship_id=NEW.relationship_id
     ORDER BY effective_on DESC, sequence DESC LIMIT 1;
    IF prior_state IS NULL AND max_sequence=0 THEN
        SELECT id INTO prior_state FROM hr_employment_lifecycle_state
         WHERE tenant_id=NEW.tenant_id AND policy_id=rel_policy AND is_initial;
    END IF;
    IF prior_state IS DISTINCT FROM NEW.previous_state_id THEN
        RAISE EXCEPTION 'employment event previous state does not match history' USING ERRCODE='23514';
    END IF;
    SELECT true INTO valid_transition FROM hr_employment_lifecycle_transition
     WHERE tenant_id=NEW.tenant_id AND policy_id=rel_policy
       AND event_type=NEW.event_type AND from_state_id IS NOT DISTINCT FROM prior_state
       AND to_state_id=NEW.resulting_state_id;
    IF valid_transition IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'employment event does not match the approved lifecycle policy' USING ERRCODE='23514';
    END IF;
    IF NEW.correction_of_event_id IS NOT NULL AND NEW.correction_of_event_id IS DISTINCT FROM (
        SELECT id FROM hr_employment_event WHERE tenant_id=NEW.tenant_id
         AND relationship_id=NEW.relationship_id ORDER BY sequence DESC LIMIT 1
    ) THEN
        RAISE EXCEPTION 'only the latest employment event may be corrected' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_employment_event_consistency
BEFORE INSERT ON hr_employment_event
FOR EACH ROW EXECUTE FUNCTION validate_hr_employment_event();

CREATE INDEX idx_hr_employment_relationship_policy
    ON hr_employment_relationship (tenant_id, lifecycle_policy_id);
CREATE INDEX idx_hr_employment_relationship_rehire
    ON hr_employment_relationship (tenant_id, rehire_of_relationship_id)
    WHERE rehire_of_relationship_id IS NOT NULL;

ALTER TABLE hr_employment_lifecycle_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employment_lifecycle_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employment_lifecycle_policy_tenant_isolation
ON hr_employment_lifecycle_policy USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

ALTER TABLE hr_employment_lifecycle_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employment_lifecycle_state FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employment_lifecycle_state_tenant_isolation
ON hr_employment_lifecycle_state USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

ALTER TABLE hr_employment_lifecycle_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employment_lifecycle_transition FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employment_lifecycle_transition_tenant_isolation
ON hr_employment_lifecycle_transition USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

ALTER TABLE hr_employment_lifecycle_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employment_lifecycle_request FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employment_lifecycle_request_tenant_isolation
ON hr_employment_lifecycle_request USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

ALTER TABLE hr_employment_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employment_event FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employment_event_tenant_isolation
ON hr_employment_event USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

COMMENT ON TABLE hr_employment_event IS
    'Append-only authoritative employment lifecycle history; employee.status is only a legacy compatibility projection.';
COMMENT ON COLUMN hr_employment_lifecycle_state.canonical_class IS
    'Country-neutral lifecycle class; company terminology is carried by label and code.';

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 11, 'employment_lifecycle');
