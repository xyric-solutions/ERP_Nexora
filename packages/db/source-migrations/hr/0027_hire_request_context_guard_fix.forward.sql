-- Qualify employee_assignment columns so PL/pgSQL variables cannot shadow
-- them while validating governed Hire request context.
CREATE OR REPLACE FUNCTION validate_hr_hire_request_context() RETURNS trigger
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
    SELECT transition.event_type INTO event_kind
      FROM hr_employment_lifecycle_transition transition
     WHERE transition.tenant_id=NEW.tenant_id AND transition.id=NEW.transition_id;

    IF event_kind = 'hire' THEN
        IF NEW.job_id IS NULL OR NEW.profile_draft_assignment_id IS NULL THEN
            RAISE EXCEPTION 'hire requests require a job and profile draft assignment'
                USING ERRCODE='23514';
        END IF;
        SELECT relationship.employee_id, relationship.legal_employer_id
          INTO relationship_employee, relationship_company
          FROM hr_employment_relationship relationship
         WHERE relationship.tenant_id=NEW.tenant_id AND relationship.id=NEW.relationship_id;
        SELECT job.company_id, job.master_type, job.status
          INTO job_company, job_type, job_status
          FROM hr_master_record job
         WHERE job.tenant_id=NEW.tenant_id AND job.id=NEW.job_id;
        SELECT assignment.employee_id, assignment.company_id, assignment.assignment_status
          INTO assignment_employee, assignment_company, assignment_status
          FROM employee_assignment assignment
         WHERE assignment.tenant_id=NEW.tenant_id AND assignment.id=NEW.profile_draft_assignment_id;
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

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 27, 'hire_request_context_guard_fix');
