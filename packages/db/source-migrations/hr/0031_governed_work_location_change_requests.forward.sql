-- Work-location change is isolated because location selects statutory context.
-- A request is evidence only; approval projects a new immutable assignment.
CREATE TABLE hr_employee_work_location_change_request (
    tenant_id text NOT NULL,
    id text NOT NULL CHECK (char_length(btrim(id)) BETWEEN 1 AND 128),
    employee_id text NOT NULL,
    company_id text NOT NULL,
    relationship_id text NOT NULL,
    source_assignment_id text NOT NULL,
    current_work_location_id text NOT NULL,
    proposed_work_location_id text NOT NULL,
    proposed_work_location_profile_id text NOT NULL,
    effective_on date NOT NULL,
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
    request_state text NOT NULL DEFAULT 'pending'
        CHECK (request_state IN ('pending', 'approved', 'rejected')),
    requested_by text NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    decided_by text,
    decided_at timestamptz,
    decision_reason text,
    projected_assignment_id text,
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, employee_id)
        REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, relationship_id)
        REFERENCES hr_employment_relationship (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, source_assignment_id)
        REFERENCES employee_assignment (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, company_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, current_work_location_id)
        REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, proposed_work_location_id)
        REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, proposed_work_location_profile_id, company_id)
        REFERENCES hr_work_location_profile (tenant_id, id, company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, requested_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, decided_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, projected_assignment_id)
        REFERENCES employee_assignment (tenant_id, id) ON DELETE RESTRICT,
    CHECK (current_work_location_id <> proposed_work_location_id),
    CHECK (
        (request_state='pending' AND decided_by IS NULL AND decided_at IS NULL
            AND decision_reason IS NULL AND projected_assignment_id IS NULL)
        OR
        (request_state='approved' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
            AND projected_assignment_id IS NOT NULL AND decided_by<>requested_by)
        OR
        (request_state='rejected' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
            AND projected_assignment_id IS NULL AND decided_by<>requested_by)
    )
);

CREATE UNIQUE INDEX uq_hr_pending_work_location_change_source
    ON hr_employee_work_location_change_request (tenant_id, source_assignment_id)
    WHERE request_state='pending';
CREATE INDEX idx_hr_work_location_change_company_queue
    ON hr_employee_work_location_change_request
        (tenant_id, company_id, request_state, requested_at, id);
CREATE INDEX idx_hr_work_location_change_employee_history
    ON hr_employee_work_location_change_request
        (tenant_id, employee_id, requested_at DESC, id);

CREATE FUNCTION validate_hr_employee_work_location_change_request() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    source_row employee_assignment%ROWTYPE;
    profile_row hr_work_location_profile%ROWTYPE;
BEGIN
    SELECT * INTO source_row
      FROM employee_assignment assignment
     WHERE assignment.tenant_id=NEW.tenant_id
       AND assignment.id=NEW.source_assignment_id;
    IF NOT FOUND
       OR source_row.employee_id<>NEW.employee_id
       OR source_row.company_id<>NEW.company_id
       OR source_row.employment_relationship_id<>NEW.relationship_id
       OR source_row.assignment_status<>'active'
       OR source_row.effective_to IS NOT NULL THEN
        RAISE EXCEPTION 'work-location source assignment is not currently authoritative'
            USING ERRCODE='23514';
    END IF;
    IF NEW.current_work_location_id<>source_row.work_location_id THEN
        RAISE EXCEPTION 'work-location source snapshot is stale'
            USING ERRCODE='23514';
    END IF;
    IF NEW.effective_on<=source_row.effective_from THEN
        RAISE EXCEPTION 'work-location change must begin after the source assignment'
            USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM hr_master_record master
         WHERE master.tenant_id=NEW.tenant_id
           AND master.id=NEW.proposed_work_location_id
           AND master.company_id=NEW.company_id
           AND master.master_type='work_location'
           AND master.status='active'
    ) THEN
        RAISE EXCEPTION 'work-location target is unavailable'
            USING ERRCODE='23514';
    END IF;
    SELECT * INTO profile_row
      FROM hr_work_location_profile profile
     WHERE profile.tenant_id=NEW.tenant_id
       AND profile.id=NEW.proposed_work_location_profile_id
       AND profile.company_id=NEW.company_id;
    IF NOT FOUND
       OR profile_row.work_location_id<>NEW.proposed_work_location_id
       OR profile_row.state NOT IN ('approved','active')
       OR profile_row.effective_from>NEW.effective_on
       OR (profile_row.effective_to IS NOT NULL
           AND profile_row.effective_to<NEW.effective_on) THEN
        RAISE EXCEPTION 'work-location target lacks effective reviewed jurisdiction evidence'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER hr_employee_work_location_change_context_guard
BEFORE INSERT ON hr_employee_work_location_change_request
FOR EACH ROW EXECUTE FUNCTION validate_hr_employee_work_location_change_request();

CREATE FUNCTION protect_hr_employee_work_location_change_request() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'work-location change requests cannot be deleted'
            USING ERRCODE='23514';
    END IF;
    IF OLD.request_state<>'pending' THEN
        RAISE EXCEPTION 'decided work-location change requests are immutable'
            USING ERRCODE='23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY[
        'request_state','decided_by','decided_at','decision_reason',
        'projected_assignment_id','row_version'
    ]) <> (to_jsonb(OLD) - ARRAY[
        'request_state','decided_by','decided_at','decision_reason',
        'projected_assignment_id','row_version'
    ]) THEN
        RAISE EXCEPTION 'work-location change request evidence is immutable'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER hr_employee_work_location_change_evidence_guard
BEFORE UPDATE OR DELETE ON hr_employee_work_location_change_request
FOR EACH ROW EXECUTE FUNCTION protect_hr_employee_work_location_change_request();

ALTER TABLE hr_employee_work_location_change_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_work_location_change_request FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employee_work_location_change_tenant_isolation
ON hr_employee_work_location_change_request
USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',31,'governed_work_location_change_requests');
