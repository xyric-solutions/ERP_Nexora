-- A hire request preserves selected operational context while it awaits an
-- independent lifecycle decision. It does not create an operational assignment.
ALTER TABLE hr_employment_lifecycle_request
    ADD COLUMN job_id text,
    ADD COLUMN profile_draft_assignment_id text,
    ADD CONSTRAINT fk_hr_lifecycle_request_job
        FOREIGN KEY (tenant_id, job_id)
        REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_hr_lifecycle_request_profile_draft_assignment
        FOREIGN KEY (tenant_id, profile_draft_assignment_id)
        REFERENCES employee_assignment (tenant_id, id) ON DELETE RESTRICT;

-- Extend the existing evidence guard so newly added hire context is immutable
-- once a request has been recorded.
CREATE OR REPLACE FUNCTION protect_hr_employment_request() RETURNS trigger
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
       OR NEW.requested_by<>OLD.requested_by OR NEW.requested_at<>OLD.requested_at
       OR NEW.job_id IS DISTINCT FROM OLD.job_id
       OR NEW.profile_draft_assignment_id IS DISTINCT FROM OLD.profile_draft_assignment_id THEN
        RAISE EXCEPTION 'employment lifecycle request evidence is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.approval_state<>'pending' THEN
        RAISE EXCEPTION 'decided employment lifecycle requests are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION validate_hr_hire_request_context() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    event_kind text;
    relationship_employee text;
    relationship_company text;
    job_company text;
    job_type text;
    job_status text;
    assignment_employee text;
    assignment_company text;
    assignment_status text;
BEGIN
    SELECT event_type INTO event_kind
      FROM hr_employment_lifecycle_transition
     WHERE tenant_id=NEW.tenant_id AND id=NEW.transition_id;

    IF event_kind = 'hire' THEN
        IF NEW.job_id IS NULL OR NEW.profile_draft_assignment_id IS NULL THEN
            RAISE EXCEPTION 'hire requests require a job and profile draft assignment'
                USING ERRCODE='23514';
        END IF;
        SELECT employee_id, legal_employer_id
          INTO relationship_employee, relationship_company
          FROM hr_employment_relationship
         WHERE tenant_id=NEW.tenant_id AND id=NEW.relationship_id;
        SELECT company_id, master_type, status
          INTO job_company, job_type, job_status
          FROM hr_master_record
         WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id;
        SELECT employee_id, company_id, assignment_status
          INTO assignment_employee, assignment_company, assignment_status
          FROM employee_assignment
         WHERE tenant_id=NEW.tenant_id AND id=NEW.profile_draft_assignment_id;
        IF relationship_employee IS NULL
           OR job_company IS DISTINCT FROM relationship_company
           OR job_type IS DISTINCT FROM 'job'
           OR job_status IS DISTINCT FROM 'active'
           OR assignment_employee IS DISTINCT FROM relationship_employee
           OR assignment_company IS DISTINCT FROM relationship_company
           OR assignment_status IS DISTINCT FROM 'profile_draft' THEN
            RAISE EXCEPTION 'hire request context is invalid for its employment relationship'
                USING ERRCODE='23514';
        END IF;
    ELSIF NEW.job_id IS NOT NULL OR NEW.profile_draft_assignment_id IS NOT NULL THEN
        RAISE EXCEPTION 'only hire requests may include pending hire context'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER hr_employment_lifecycle_request_hire_context_guard
BEFORE INSERT ON hr_employment_lifecycle_request
FOR EACH ROW EXECUTE FUNCTION validate_hr_hire_request_context();

CREATE UNIQUE INDEX uq_hr_pending_hire_per_employee_company
    ON hr_employment_lifecycle_request (tenant_id, profile_draft_assignment_id)
    WHERE approval_state='pending' AND profile_draft_assignment_id IS NOT NULL;

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 26, 'governed_hire_requests');
