-- A manager-change request changes only the effective reporting line. All
-- placement, role, employment, and compensation fields remain unchanged.
CREATE TABLE hr_employee_manager_change_request (
    tenant_id text NOT NULL,
    id text NOT NULL CHECK (char_length(btrim(id)) BETWEEN 1 AND 128),
    employee_id text NOT NULL,
    company_id text NOT NULL,
    relationship_id text NOT NULL,
    source_assignment_id text NOT NULL,
    proposed_reporting_manager_id text,
    clear_reporting_manager boolean NOT NULL DEFAULT false,
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
    FOREIGN KEY (tenant_id, proposed_reporting_manager_id)
        REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, requested_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, decided_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, projected_assignment_id)
        REFERENCES employee_assignment (tenant_id, id) ON DELETE RESTRICT,
    CHECK (
        (clear_reporting_manager AND proposed_reporting_manager_id IS NULL)
        OR
        (NOT clear_reporting_manager AND proposed_reporting_manager_id IS NOT NULL)
    ),
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

CREATE UNIQUE INDEX uq_hr_pending_manager_change_source
    ON hr_employee_manager_change_request (tenant_id, source_assignment_id)
    WHERE request_state='pending';
CREATE INDEX idx_hr_manager_change_company_queue
    ON hr_employee_manager_change_request
        (tenant_id, company_id, request_state, requested_at, id);
CREATE INDEX idx_hr_manager_change_employee_history
    ON hr_employee_manager_change_request (tenant_id, employee_id, requested_at DESC, id);

CREATE FUNCTION validate_hr_employee_manager_change_request() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    source_row employee_assignment%ROWTYPE;
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
        RAISE EXCEPTION 'manager-change source assignment is not currently authoritative'
            USING ERRCODE='23514';
    END IF;
    IF NEW.effective_on<=source_row.effective_from THEN
        RAISE EXCEPTION 'manager change must begin after the source assignment'
            USING ERRCODE='23514';
    END IF;
    IF NEW.proposed_reporting_manager_id IS NOT DISTINCT FROM source_row.reporting_manager_id THEN
        RAISE EXCEPTION 'manager change must alter the reporting manager'
            USING ERRCODE='23514';
    END IF;
    IF NEW.proposed_reporting_manager_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM hr_employment_relationship manager_relationship
          JOIN employee_assignment manager_assignment
            ON manager_assignment.tenant_id=manager_relationship.tenant_id
           AND manager_assignment.employment_relationship_id=manager_relationship.id
         WHERE manager_relationship.tenant_id=NEW.tenant_id
           AND manager_relationship.employee_id=NEW.proposed_reporting_manager_id
           AND manager_relationship.legal_employer_id=NEW.company_id
           AND manager_relationship.status='active'
           AND manager_relationship.effective_from<=NEW.effective_on
           AND (manager_relationship.effective_to IS NULL OR manager_relationship.effective_to>=NEW.effective_on)
           AND manager_assignment.employee_id=NEW.proposed_reporting_manager_id
           AND manager_assignment.company_id=NEW.company_id
           AND manager_assignment.assignment_status='active'
           AND manager_assignment.effective_from<=NEW.effective_on
           AND (manager_assignment.effective_to IS NULL OR manager_assignment.effective_to>=NEW.effective_on)
    ) THEN
        RAISE EXCEPTION 'proposed reporting manager is not effective in the legal employer'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER hr_employee_manager_change_context_guard
BEFORE INSERT ON hr_employee_manager_change_request
FOR EACH ROW EXECUTE FUNCTION validate_hr_employee_manager_change_request();

CREATE FUNCTION protect_hr_employee_manager_change_request() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'manager-change requests cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF OLD.request_state<>'pending' THEN
        RAISE EXCEPTION 'decided manager-change requests are immutable' USING ERRCODE='23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY[
        'request_state','decided_by','decided_at','decision_reason',
        'projected_assignment_id','row_version'
    ]) <> (to_jsonb(OLD) - ARRAY[
        'request_state','decided_by','decided_at','decision_reason',
        'projected_assignment_id','row_version'
    ]) THEN
        RAISE EXCEPTION 'manager-change request evidence is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER hr_employee_manager_change_evidence_guard
BEFORE UPDATE OR DELETE ON hr_employee_manager_change_request
FOR EACH ROW EXECUTE FUNCTION protect_hr_employee_manager_change_request();

ALTER TABLE hr_employee_manager_change_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_manager_change_request FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employee_manager_change_tenant_isolation
ON hr_employee_manager_change_request
USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',30,'governed_manager_change_requests');
