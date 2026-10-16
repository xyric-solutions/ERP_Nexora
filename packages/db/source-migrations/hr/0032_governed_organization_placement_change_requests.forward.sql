CREATE FUNCTION hr_organization_placement_is_coherent(
    requested_tenant text,
    requested_company text,
    requested_business_unit text,
    requested_division text,
    requested_branch text,
    requested_department text,
    requested_warehouse text
) RETURNS boolean LANGUAGE sql STABLE AS $function$
    WITH RECURSIVE selected(rank, expected_type, id) AS (
        SELECT * FROM (VALUES
            (1, 'business_unit', requested_business_unit),
            (2, 'division', requested_division),
            (3, 'branch', requested_branch),
            (4, 'department', requested_department),
            (5, 'warehouse', requested_warehouse)
        ) placement(rank, expected_type, id)
        WHERE id IS NOT NULL
    ), typed AS (
        SELECT selected.rank, selected.id
          FROM selected
          JOIN organization_unit unit
            ON unit.tenant_id=requested_tenant AND unit.id=selected.id
           AND unit.type=selected.expected_type AND unit.status='active'
         WHERE organization_unit_is_within_company(
            requested_tenant, selected.id, requested_company
         )
    ), ancestors(child_id, ancestor_id, parent_id) AS (
        SELECT selected.id, unit.id, unit.parent_id
          FROM selected
          JOIN organization_unit unit
            ON unit.tenant_id=requested_tenant AND unit.id=selected.id
        UNION ALL
        SELECT ancestors.child_id, parent.id, parent.parent_id
          FROM ancestors
          JOIN organization_unit parent
            ON parent.tenant_id=requested_tenant
           AND parent.id=ancestors.parent_id
    )
    SELECT (SELECT count(*) FROM selected)>0
       AND (SELECT count(*) FROM typed)=(SELECT count(*) FROM selected)
       AND NOT EXISTS (
           SELECT 1
             FROM selected parent
             CROSS JOIN selected child
            WHERE parent.rank<child.rank
              AND NOT EXISTS (
                  SELECT 1 FROM ancestors
                   WHERE ancestors.child_id=child.id
                     AND ancestors.ancestor_id=parent.id
              )
       )
$function$;

CREATE TABLE hr_employee_organization_placement_change_request (
    tenant_id text NOT NULL,
    id text NOT NULL CHECK (char_length(btrim(id)) BETWEEN 1 AND 128),
    employee_id text NOT NULL,
    company_id text NOT NULL,
    relationship_id text NOT NULL,
    source_assignment_id text NOT NULL,
    current_business_unit_id text,
    current_division_id text,
    current_branch_id text,
    current_department_id text,
    current_warehouse_id text,
    proposed_business_unit_id text,
    proposed_division_id text,
    proposed_branch_id text,
    proposed_department_id text,
    proposed_warehouse_id text,
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
    FOREIGN KEY (tenant_id, current_business_unit_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, current_division_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, current_branch_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, current_department_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, current_warehouse_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, proposed_business_unit_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, proposed_division_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, proposed_branch_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, proposed_department_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, proposed_warehouse_id)
        REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, requested_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, decided_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, projected_assignment_id)
        REFERENCES employee_assignment (tenant_id, id) ON DELETE RESTRICT,
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

CREATE UNIQUE INDEX uq_hr_pending_organization_placement_change_source
    ON hr_employee_organization_placement_change_request
        (tenant_id, source_assignment_id)
    WHERE request_state='pending';
CREATE INDEX idx_hr_organization_placement_change_company_queue
    ON hr_employee_organization_placement_change_request
        (tenant_id, company_id, request_state, requested_at, id);
CREATE INDEX idx_hr_organization_placement_change_employee_history
    ON hr_employee_organization_placement_change_request
        (tenant_id, employee_id, requested_at DESC, id);

CREATE FUNCTION validate_hr_employee_organization_placement_change_request()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    source_row employee_assignment%ROWTYPE;
    source_business_unit text;
    source_division text;
    source_branch text;
    source_department text;
    source_warehouse text;
BEGIN
    SELECT * INTO source_row
      FROM employee_assignment assignment
     WHERE assignment.tenant_id=NEW.tenant_id
       AND assignment.id=NEW.source_assignment_id;
    IF NOT FOUND OR source_row.employee_id<>NEW.employee_id
       OR source_row.company_id<>NEW.company_id
       OR source_row.employment_relationship_id<>NEW.relationship_id
       OR source_row.assignment_status<>'active'
       OR source_row.effective_to IS NOT NULL THEN
        RAISE EXCEPTION 'organization placement source assignment is not authoritative'
            USING ERRCODE='23514';
    END IF;
    IF NEW.effective_on<=source_row.effective_from THEN
        RAISE EXCEPTION 'organization placement change must begin after the source assignment'
            USING ERRCODE='23514';
    END IF;
    SELECT
        max(organization_unit_id) FILTER (WHERE organization_type='business_unit'),
        max(organization_unit_id) FILTER (WHERE organization_type='division'),
        max(organization_unit_id) FILTER (WHERE organization_type='branch'),
        max(organization_unit_id) FILTER (WHERE organization_type='department'),
        max(organization_unit_id) FILTER (WHERE organization_type='warehouse')
      INTO source_business_unit,source_division,source_branch,source_department,source_warehouse
      FROM employee_assignment_org_unit
     WHERE tenant_id=NEW.tenant_id AND assignment_id=NEW.source_assignment_id;
    IF NEW.current_business_unit_id IS DISTINCT FROM source_business_unit
       OR NEW.current_division_id IS DISTINCT FROM source_division
       OR NEW.current_branch_id IS DISTINCT FROM source_branch
       OR NEW.current_department_id IS DISTINCT FROM source_department
       OR NEW.current_warehouse_id IS DISTINCT FROM source_warehouse THEN
        RAISE EXCEPTION 'organization placement current snapshot is stale'
            USING ERRCODE='23514';
    END IF;
    IF NOT hr_organization_placement_is_coherent(
        NEW.tenant_id,NEW.company_id,NEW.proposed_business_unit_id,
        NEW.proposed_division_id,NEW.proposed_branch_id,
        NEW.proposed_department_id,NEW.proposed_warehouse_id
    ) THEN
        RAISE EXCEPTION 'proposed organization placement hierarchy is invalid'
            USING ERRCODE='23514';
    END IF;
    IF NEW.proposed_business_unit_id IS NOT DISTINCT FROM source_business_unit
       AND NEW.proposed_division_id IS NOT DISTINCT FROM source_division
       AND NEW.proposed_branch_id IS NOT DISTINCT FROM source_branch
       AND NEW.proposed_department_id IS NOT DISTINCT FROM source_department
       AND NEW.proposed_warehouse_id IS NOT DISTINCT FROM source_warehouse THEN
        RAISE EXCEPTION 'organization placement change must alter the hierarchy'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER hr_employee_organization_placement_change_context_guard
BEFORE INSERT ON hr_employee_organization_placement_change_request
FOR EACH ROW EXECUTE FUNCTION validate_hr_employee_organization_placement_change_request();

CREATE FUNCTION protect_hr_employee_organization_placement_change_request()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'organization placement change requests cannot be deleted'
            USING ERRCODE='23514';
    END IF;
    IF OLD.request_state<>'pending' THEN
        RAISE EXCEPTION 'decided organization placement change requests are immutable'
            USING ERRCODE='23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY[
        'request_state','decided_by','decided_at','decision_reason',
        'projected_assignment_id','row_version'
    ]) <> (to_jsonb(OLD) - ARRAY[
        'request_state','decided_by','decided_at','decision_reason',
        'projected_assignment_id','row_version'
    ]) THEN
        RAISE EXCEPTION 'organization placement request evidence is immutable'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER hr_employee_organization_placement_change_evidence_guard
BEFORE UPDATE OR DELETE ON hr_employee_organization_placement_change_request
FOR EACH ROW EXECUTE FUNCTION protect_hr_employee_organization_placement_change_request();

ALTER TABLE hr_employee_organization_placement_change_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_organization_placement_change_request FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employee_organization_placement_change_tenant_isolation
ON hr_employee_organization_placement_change_request
USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',32,'governed_organization_placement_change_requests');
