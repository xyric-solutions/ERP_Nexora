DO $$
BEGIN
    IF to_regclass('public.hr_employment_relationship') IS NULL
       OR to_regclass('public.hr_employment_event') IS NULL THEN
        RAISE EXCEPTION 'effective assignments require HR employment lifecycle migration 11';
    END IF;
END $$;

ALTER TABLE hr_master_record
    DROP CONSTRAINT hr_master_record_master_type_check;
ALTER TABLE hr_master_record
    ADD CONSTRAINT hr_master_record_master_type_check CHECK (master_type IN (
        'job', 'designation', 'job_grade', 'cost_center', 'work_location',
        'employment_type', 'employee_category'
    ));

ALTER TABLE hr_employment_relationship
    ADD CONSTRAINT uq_hr_employment_relationship_assignment_scope
    UNIQUE (tenant_id, id, employee_id, legal_employer_id);

ALTER TABLE employee_assignment
    DROP CONSTRAINT employee_assignment_tenant_id_employee_id_effective_from_key,
    DROP CONSTRAINT employee_assignment_change_reason_check,
    ALTER COLUMN branch_id DROP NOT NULL,
    ALTER COLUMN department_id DROP NOT NULL,
    ADD COLUMN employment_relationship_id text,
    ADD COLUMN job_id text,
    ADD COLUMN assignment_status text NOT NULL DEFAULT 'legacy_compatibility',
    ADD COLUMN source_reference text NOT NULL DEFAULT 'legacy:hr-01',
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD CONSTRAINT employee_assignment_status_check CHECK (
        assignment_status IN (
            'profile_draft', 'active', 'ended', 'cancelled', 'legacy_compatibility'
        )
    ),
    ADD CONSTRAINT employee_assignment_source_reference_check CHECK (
        char_length(btrim(source_reference)) BETWEEN 1 AND 500
    ),
    ADD CONSTRAINT employee_assignment_change_reason_check CHECK (change_reason IN (
        'initial_appointment', 'transfer', 'promotion', 'demotion',
        'manager_change', 'employment_type_change', 'grade_revision',
        'cost_center_change', 'status_change', 'organization_change',
        'job_change', 'designation_change', 'work_location_change', 'correction'
    )),
    ADD CONSTRAINT employee_assignment_authority_shape CHECK (
        (employment_relationship_id IS NULL
            AND assignment_status IN (
                'profile_draft', 'legacy_compatibility', 'ended', 'cancelled'
            ))
        OR
        (employment_relationship_id IS NOT NULL
            AND job_id IS NOT NULL
            AND assignment_status IN ('active', 'ended', 'cancelled'))
    ),
    ADD CONSTRAINT fk_employee_assignment_relationship
        FOREIGN KEY (tenant_id, employment_relationship_id, employee_id, company_id)
        REFERENCES hr_employment_relationship
            (tenant_id, id, employee_id, legal_employer_id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT fk_employee_assignment_job
        FOREIGN KEY (tenant_id, job_id)
        REFERENCES hr_master_record (tenant_id, id)
        ON DELETE RESTRICT;

DO $drop_old_exclusion$
DECLARE constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
      FROM pg_constraint
     WHERE conrelid = 'employee_assignment'::regclass AND contype = 'x';
    IF constraint_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE employee_assignment DROP CONSTRAINT %I',
            constraint_name
        );
    END IF;
END
$drop_old_exclusion$;

ALTER TABLE employee_assignment
    ADD CONSTRAINT ex_employee_assignment_authoritative_period
    EXCLUDE USING gist (
        tenant_id WITH =,
        employee_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    ) WHERE (assignment_status IN ('active', 'ended', 'legacy_compatibility'));

CREATE INDEX idx_employee_assignment_relationship_effective
    ON employee_assignment (
        tenant_id, employment_relationship_id, effective_from DESC
    ) WHERE employment_relationship_id IS NOT NULL;
CREATE INDEX idx_employee_assignment_job_effective
    ON employee_assignment (tenant_id, job_id, effective_from DESC)
    WHERE job_id IS NOT NULL;
CREATE INDEX idx_employee_assignment_status_effective
    ON employee_assignment (
        tenant_id, company_id, assignment_status, effective_from DESC
    );

CREATE TABLE employee_assignment_org_unit (
    tenant_id text NOT NULL,
    assignment_id text NOT NULL,
    organization_type text NOT NULL CHECK (
        organization_type IN (
            'business_unit', 'division', 'branch', 'department', 'warehouse'
        )
    ),
    organization_unit_id text NOT NULL,
    created_by text NOT NULL CHECK (char_length(btrim(created_by)) BETWEEN 1 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, assignment_id, organization_type),
    FOREIGN KEY (tenant_id, assignment_id)
        REFERENCES employee_assignment (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, organization_unit_id, organization_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT
);
CREATE INDEX idx_employee_assignment_org_unit_lookup
    ON employee_assignment_org_unit (
        tenant_id, organization_unit_id, organization_type, assignment_id
    );

INSERT INTO employee_assignment_org_unit
    (tenant_id, assignment_id, organization_type, organization_unit_id, created_by)
SELECT tenant_id, id, 'branch', branch_id, created_by
  FROM employee_assignment
 WHERE branch_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO employee_assignment_org_unit
    (tenant_id, assignment_id, organization_type, organization_unit_id, created_by)
SELECT tenant_id, id, 'department', department_id, created_by
  FROM employee_assignment
 WHERE department_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION organization_unit_is_within_company(
    requested_tenant text, requested_unit text, requested_company text
) RETURNS boolean LANGUAGE sql STABLE AS $function$
    WITH RECURSIVE ancestors AS (
        SELECT id, parent_id
          FROM organization_unit
         WHERE tenant_id=requested_tenant AND id=requested_unit AND status='active'
        UNION ALL
        SELECT parent.id, parent.parent_id
          FROM organization_unit parent
          JOIN ancestors child ON child.parent_id=parent.id
         WHERE parent.tenant_id=requested_tenant AND parent.status='active'
    )
    SELECT EXISTS (SELECT 1 FROM ancestors WHERE id=requested_company)
$function$;

CREATE OR REPLACE FUNCTION validate_hr_assignment_scope() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
    master_row record;
    pair record;
    relationship_row record;
    relationship_class text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM organization_unit
         WHERE tenant_id=NEW.tenant_id AND id=NEW.company_id
           AND type='company' AND status='active'
    ) THEN
        RAISE EXCEPTION 'HR assignment legal employer is unavailable'
            USING ERRCODE='23514';
    END IF;
    IF NEW.branch_id IS NOT NULL AND NOT organization_unit_is_within_company(
        NEW.tenant_id, NEW.branch_id, NEW.company_id
    ) THEN
        RAISE EXCEPTION 'HR assignment branch is outside the legal employer'
            USING ERRCODE='23514';
    END IF;
    IF NEW.department_id IS NOT NULL AND NOT organization_unit_is_within_company(
        NEW.tenant_id, NEW.department_id, NEW.company_id
    ) THEN
        RAISE EXCEPTION 'HR assignment department is outside the legal employer'
            USING ERRCODE='23514';
    END IF;
    FOR pair IN SELECT * FROM (VALUES
        (NEW.job_id, 'job', NEW.employment_relationship_id IS NOT NULL),
        (NEW.designation_id, 'designation', true),
        (NEW.job_grade_id, 'job_grade', true),
        (NEW.cost_center_id, 'cost_center', true),
        (NEW.work_location_id, 'work_location', true),
        (NEW.employment_type_id, 'employment_type', true),
        (NEW.employee_category_id, 'employee_category', true)
    ) AS values_to_check(id, expected_type, required)
    LOOP
        IF pair.id IS NULL AND NOT pair.required THEN
            CONTINUE;
        END IF;
        master_row := NULL;
        SELECT master_type, company_id, status INTO master_row
          FROM hr_master_record
         WHERE tenant_id=NEW.tenant_id AND id=pair.id;
        IF NOT FOUND OR master_row.master_type<>pair.expected_type
           OR master_row.company_id<>NEW.company_id OR master_row.status<>'active' THEN
            RAISE EXCEPTION 'HR assignment references unavailable or mistyped master data'
                USING ERRCODE='23514';
        END IF;
    END LOOP;
    IF NEW.employment_relationship_id IS NOT NULL THEN
        SELECT effective_from,effective_to,status INTO relationship_row
          FROM hr_employment_relationship
         WHERE tenant_id=NEW.tenant_id AND id=NEW.employment_relationship_id
           AND employee_id=NEW.employee_id AND legal_employer_id=NEW.company_id;
        IF NOT FOUND OR NEW.effective_from<relationship_row.effective_from
           OR (relationship_row.effective_to IS NOT NULL
               AND (NEW.effective_to IS NULL OR NEW.effective_to>relationship_row.effective_to)) THEN
            RAISE EXCEPTION 'assignment period is outside the employment relationship'
                USING ERRCODE='23514';
        END IF;
        SELECT state.canonical_class INTO relationship_class
          FROM hr_employment_event event
          JOIN hr_employment_lifecycle_state state
            ON state.tenant_id=event.tenant_id AND state.id=event.resulting_state_id
         WHERE event.tenant_id=NEW.tenant_id
           AND event.relationship_id=NEW.employment_relationship_id
           AND event.effective_on<=NEW.effective_from
         ORDER BY event.effective_on DESC,event.sequence DESC LIMIT 1;
        IF relationship_class IS NULL
           OR relationship_class NOT IN ('employed','temporarily_inactive') THEN
            RAISE EXCEPTION 'assignment requires an effective employed relationship state'
                USING ERRCODE='23514';
        END IF;
    END IF;
    IF NEW.reporting_manager_id IS NOT NULL THEN
        IF NEW.reporting_manager_id=NEW.employee_id THEN
            RAISE EXCEPTION 'an employee cannot report to themselves'
                USING ERRCODE='23514';
        END IF;
        IF NEW.employment_relationship_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM employee_assignment manager_assignment
             WHERE manager_assignment.tenant_id=NEW.tenant_id
               AND manager_assignment.employee_id=NEW.reporting_manager_id
               AND manager_assignment.company_id=NEW.company_id
               AND manager_assignment.employment_relationship_id IS NOT NULL
               AND manager_assignment.assignment_status IN ('active','ended')
               AND manager_assignment.effective_from<=NEW.effective_from
               AND (manager_assignment.effective_to IS NULL
                    OR manager_assignment.effective_to>=NEW.effective_from)
        ) THEN
            RAISE EXCEPTION 'reporting manager has no effective relationship in the legal employer'
                USING ERRCODE='23514';
        ELSIF NEW.employment_relationship_id IS NULL AND NOT EXISTS (
            SELECT 1 FROM employee
             WHERE tenant_id=NEW.tenant_id AND id=NEW.reporting_manager_id
               AND status IN ('active','probation','confirmed','suspended')
        ) THEN
            RAISE EXCEPTION 'HR assignment reporting manager is unavailable'
                USING ERRCODE='23514';
        END IF;
        IF EXISTS (
            WITH RECURSIVE manager_chain(employee_id,manager_id,visited) AS (
                SELECT assignment.employee_id,assignment.reporting_manager_id,
                       ARRAY[assignment.employee_id]
                  FROM employee_assignment assignment
                 WHERE assignment.tenant_id=NEW.tenant_id
                   AND assignment.employee_id=NEW.reporting_manager_id
                   AND assignment.assignment_status IN ('active','ended','legacy_compatibility')
                   AND assignment.effective_from<=NEW.effective_from
                   AND (assignment.effective_to IS NULL
                        OR assignment.effective_to>=NEW.effective_from)
                UNION ALL
                SELECT assignment.employee_id,assignment.reporting_manager_id,
                       chain.visited || assignment.employee_id
                  FROM manager_chain chain
                  JOIN employee_assignment assignment
                    ON assignment.tenant_id=NEW.tenant_id
                   AND assignment.employee_id=chain.manager_id
                   AND assignment.assignment_status IN ('active','ended','legacy_compatibility')
                   AND assignment.effective_from<=NEW.effective_from
                   AND (assignment.effective_to IS NULL
                        OR assignment.effective_to>=NEW.effective_from)
                 WHERE NOT assignment.employee_id=ANY(chain.visited)
            )
            SELECT 1 FROM manager_chain WHERE manager_id=NEW.employee_id
        ) THEN
            RAISE EXCEPTION 'reporting relationship would create a cycle'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION validate_employee_assignment_org_unit()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE assignment_company text;
BEGIN
    SELECT company_id INTO assignment_company
      FROM employee_assignment
     WHERE tenant_id=NEW.tenant_id AND id=NEW.assignment_id;
    IF assignment_company IS NULL OR NOT organization_unit_is_within_company(
        NEW.tenant_id, NEW.organization_unit_id, assignment_company
    ) THEN
        RAISE EXCEPTION 'assignment organization placement is outside the legal employer'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER employee_assignment_org_unit_scope_guard
BEFORE INSERT OR UPDATE ON employee_assignment_org_unit
FOR EACH ROW EXECUTE FUNCTION validate_employee_assignment_org_unit();

CREATE FUNCTION sync_employee_assignment_legacy_placements()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    IF NEW.branch_id IS NOT NULL THEN
        INSERT INTO employee_assignment_org_unit
            (tenant_id,assignment_id,organization_type,organization_unit_id,created_by)
        VALUES (NEW.tenant_id,NEW.id,'branch',NEW.branch_id,NEW.created_by)
        ON CONFLICT DO NOTHING;
    END IF;
    IF NEW.department_id IS NOT NULL THEN
        INSERT INTO employee_assignment_org_unit
            (tenant_id,assignment_id,organization_type,organization_unit_id,created_by)
        VALUES (NEW.tenant_id,NEW.id,'department',NEW.department_id,NEW.created_by)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER employee_assignment_legacy_placement_sync
AFTER INSERT ON employee_assignment
FOR EACH ROW EXECUTE FUNCTION sync_employee_assignment_legacy_placements();

CREATE FUNCTION validate_employee_assignment_placement_projection()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE branch_placement text; department_placement text; placement_count integer;
BEGIN
    SELECT organization_unit_id INTO branch_placement
      FROM employee_assignment_org_unit
     WHERE tenant_id=NEW.tenant_id AND assignment_id=NEW.id
       AND organization_type='branch';
    SELECT organization_unit_id INTO department_placement
      FROM employee_assignment_org_unit
     WHERE tenant_id=NEW.tenant_id AND assignment_id=NEW.id
       AND organization_type='department';
    SELECT count(*) INTO placement_count
      FROM employee_assignment_org_unit
     WHERE tenant_id=NEW.tenant_id AND assignment_id=NEW.id;
    IF branch_placement IS DISTINCT FROM NEW.branch_id
       OR department_placement IS DISTINCT FROM NEW.department_id THEN
        RAISE EXCEPTION 'branch/department compatibility projections do not match organization placement'
            USING ERRCODE='23514';
    END IF;
    IF NEW.employment_relationship_id IS NOT NULL AND placement_count=0 THEN
        RAISE EXCEPTION 'an operational assignment requires organization placement'
            USING ERRCODE='23514';
    END IF;
    RETURN NULL;
END
$function$;
CREATE CONSTRAINT TRIGGER employee_assignment_placement_projection_guard
AFTER INSERT OR UPDATE ON employee_assignment
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_employee_assignment_placement_projection();

CREATE FUNCTION protect_employee_assignment_history()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'assignment history is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id
       OR NEW.employee_id<>OLD.employee_id OR NEW.company_id<>OLD.company_id
       OR NEW.employment_relationship_id IS DISTINCT FROM OLD.employment_relationship_id
       OR NEW.job_id IS DISTINCT FROM OLD.job_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.department_id IS DISTINCT FROM OLD.department_id
       OR NEW.designation_id<>OLD.designation_id
       OR NEW.job_grade_id<>OLD.job_grade_id
       OR NEW.cost_center_id<>OLD.cost_center_id
       OR NEW.work_location_id<>OLD.work_location_id
       OR NEW.employment_type_id<>OLD.employment_type_id
       OR NEW.employee_category_id<>OLD.employee_category_id
       OR NEW.reporting_manager_id IS DISTINCT FROM OLD.reporting_manager_id
       OR NEW.effective_from<>OLD.effective_from
       OR NEW.change_reason<>OLD.change_reason
       OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
       OR NEW.source_reference<>OLD.source_reference THEN
        RAISE EXCEPTION 'assignment history fields are immutable; create a new segment'
            USING ERRCODE='23514';
    END IF;
    IF OLD.assignment_status IN ('ended','cancelled') THEN
        RAISE EXCEPTION 'closed assignment history is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.effective_to IS NULL OR NEW.effective_to<NEW.effective_from
       OR OLD.effective_to IS NOT NULL THEN
        RAISE EXCEPTION 'assignment may only be closed once with a valid effective end'
            USING ERRCODE='23514';
    END IF;
    IF NOT (
        (OLD.assignment_status IN ('active','legacy_compatibility')
            AND NEW.assignment_status='ended')
        OR (OLD.assignment_status='legacy_compatibility'
            AND NEW.assignment_status='cancelled')
        OR (OLD.assignment_status='profile_draft'
            AND NEW.assignment_status='cancelled')
    ) THEN
        RAISE EXCEPTION 'invalid assignment status transition' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER employee_assignment_history_immutable
BEFORE UPDATE OR DELETE ON employee_assignment
FOR EACH ROW EXECUTE FUNCTION protect_employee_assignment_history();

CREATE FUNCTION reject_assignment_org_unit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    RAISE EXCEPTION 'assignment organization history is immutable'
        USING ERRCODE='23514';
END
$function$;
CREATE TRIGGER employee_assignment_org_unit_immutable
BEFORE UPDATE OR DELETE ON employee_assignment_org_unit
FOR EACH ROW EXECUTE FUNCTION reject_assignment_org_unit_mutation();

ALTER TABLE employee_assignment_org_unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_assignment_org_unit FORCE ROW LEVEL SECURITY;
CREATE POLICY employee_assignment_org_unit_tenant_isolation
ON employee_assignment_org_unit
USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

COMMENT ON COLUMN employee_assignment.employment_relationship_id IS
    'Required for operational 02C assignments; null only for explicit pre-02C/profile compatibility evidence.';
COMMENT ON TABLE employee_assignment_org_unit IS
    'Normalized immutable organization placement for an effective assignment; branch/department columns remain compatibility projections.';

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',12,'effective_assignments');
