-- HR149: Employment Setup merges into Cost Centre.
-- A cost centre now carries the payment route and pay cycle of the people it
-- pays; Employment Setup records are archived as read-only provenance and new
-- workflow rows no longer reference them. Requisitions gain a cost centre and
-- leave eligibility moves from setups to cost centres.
-- Fails closed (no silent guess) when a cost centre's current employees use
-- different routes/cycles or a restricted leave rule has no matching centre.
-- Rollback outline: restore HR134/HR140 function bodies, re-require setup
-- columns after backfilling them from cost-centre terms, drop the HR149
-- columns/triggers, and reactivate the archived setups.

-- 1. Cost-centre terms --------------------------------------------------------
ALTER TABLE hr_master_record DROP CONSTRAINT hr_master_employment_setup_terms;

-- 2. New references ------------------------------------------------------------
ALTER TABLE hr_manpower_requisition
    ADD COLUMN cost_center_id text,
    ADD CONSTRAINT fk_hr_requisition_cost_center
        FOREIGN KEY (tenant_id, cost_center_id) REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE hr_leave_type ADD COLUMN applicable_cost_center_ids text[] NOT NULL DEFAULT '{}';
ALTER TABLE hr_leave_policy_version ADD COLUMN applicable_cost_center_ids text[] NOT NULL DEFAULT '{}';

-- 3. Backfill per tenant (HR134 pattern) --------------------------------------
ALTER TABLE hr_manpower_requisition DISABLE TRIGGER hr_manpower_requisition_scope_guard;
ALTER TABLE hr_leave_type DISABLE TRIGGER hr_leave_type_identity;
ALTER TABLE hr_leave_policy_version DISABLE TRIGGER hr_leave_policy_immutable;
ALTER TABLE hr_master_record DISABLE TRIGGER hr_master_scope_guard;

ALTER TABLE tenant NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
    t text;
    previous_scope text := current_setting('nexora.tenant_id', true);
    conflict text;
BEGIN
    FOR t IN SELECT id FROM tenant ORDER BY id LOOP
        PERFORM set_config('nexora.tenant_id', t, true);

        -- 3.1 A cost centre's terms come from the setups of its current employees.
        SELECT string_agg(code, ', ' ORDER BY code) INTO conflict FROM (
            SELECT cc.code
              FROM employee_assignment a
              JOIN hr_master_record cc ON cc.tenant_id = a.tenant_id AND cc.id = a.cost_center_id
              JOIN hr_master_record es ON es.tenant_id = a.tenant_id AND es.id = a.employment_setup_id
             WHERE a.tenant_id = t AND a.effective_to IS NULL
               AND a.assignment_status IN ('active', 'legacy_compatibility')
             GROUP BY cc.id, cc.code
            HAVING count(DISTINCT (es.payment_route, es.pay_cycle)) > 1
        ) mixed;
        IF conflict IS NOT NULL THEN
            RAISE EXCEPTION 'HR149: cost centre(s) % pay current employees through different payment routes or pay cycles in tenant %; split them before merging', conflict, t
                USING ERRCODE = '23514';
        END IF;
        -- Most recent assignment of each centre decides; unused centres default to payroll/monthly.
        UPDATE hr_master_record cc
           SET payment_route = coalesce((
                 SELECT es.payment_route FROM employee_assignment a
                   JOIN hr_master_record es ON es.tenant_id = a.tenant_id AND es.id = a.employment_setup_id
                  WHERE a.tenant_id = cc.tenant_id AND a.cost_center_id = cc.id
                  ORDER BY (a.effective_to IS NULL) DESC, a.effective_from DESC, a.id
                  LIMIT 1), 'payroll'),
               pay_cycle = coalesce((
                 SELECT es.pay_cycle FROM employee_assignment a
                   JOIN hr_master_record es ON es.tenant_id = a.tenant_id AND es.id = a.employment_setup_id
                  WHERE a.tenant_id = cc.tenant_id AND a.cost_center_id = cc.id
                  ORDER BY (a.effective_to IS NULL) DESC, a.effective_from DESC, a.id
                  LIMIT 1), 'monthly'),
               updated_at = now()
         WHERE cc.tenant_id = t AND cc.master_type = 'cost_center';

        -- 3.2 Requisitions: the cost centre whose terms match the requisition's setup,
        -- preferring one already used with that setup by employees.
        UPDATE hr_manpower_requisition r
           SET cost_center_id = (
                 SELECT cc.id
                   FROM hr_master_record es
                   JOIN hr_master_record cc ON cc.tenant_id = es.tenant_id AND cc.company_id = r.company_id
                    AND cc.master_type = 'cost_center'
                    AND cc.payment_route = es.payment_route AND cc.pay_cycle = es.pay_cycle
                  WHERE es.tenant_id = r.tenant_id AND es.id = r.employment_setup_id
                  ORDER BY EXISTS (SELECT 1 FROM employee_assignment a
                                    WHERE a.tenant_id = cc.tenant_id AND a.cost_center_id = cc.id
                                      AND a.employment_setup_id = es.id) DESC,
                           (cc.status = 'active') DESC, cc.code
                  LIMIT 1)
         WHERE r.tenant_id = t AND r.cost_center_id IS NULL AND r.employment_setup_id IS NOT NULL;

        -- 3.3 Leave eligibility: setups -> cost centres with the same route and cycle.
        UPDATE hr_leave_type lt
           SET applicable_cost_center_ids = coalesce((
                 SELECT array_agg(DISTINCT cc.id ORDER BY cc.id)
                   FROM unnest(lt.applicable_employment_setup_ids) s(id)
                   JOIN hr_master_record es ON es.tenant_id = lt.tenant_id AND es.id = s.id
                   JOIN hr_master_record cc ON cc.tenant_id = lt.tenant_id AND cc.company_id = lt.company_id
                    AND cc.master_type = 'cost_center'
                    AND cc.payment_route = es.payment_route AND cc.pay_cycle = es.pay_cycle), '{}')
         WHERE lt.tenant_id = t AND cardinality(lt.applicable_employment_setup_ids) > 0;
        UPDATE hr_leave_policy_version v
           SET applicable_cost_center_ids = coalesce((
                 SELECT array_agg(DISTINCT cc.id ORDER BY cc.id)
                   FROM unnest(v.applicable_employment_setup_ids) s(id)
                   JOIN hr_master_record es ON es.tenant_id = v.tenant_id AND es.id = s.id
                   JOIN hr_master_record cc ON cc.tenant_id = v.tenant_id AND cc.company_id = v.company_id
                    AND cc.master_type = 'cost_center'
                    AND cc.payment_route = es.payment_route AND cc.pay_cycle = es.pay_cycle), '{}')
         WHERE v.tenant_id = t AND cardinality(v.applicable_employment_setup_ids) > 0;
        IF EXISTS (SELECT 1 FROM hr_leave_type WHERE tenant_id = t
                      AND cardinality(applicable_employment_setup_ids) > 0
                      AND cardinality(applicable_cost_center_ids) = 0)
           OR EXISTS (SELECT 1 FROM hr_leave_policy_version WHERE tenant_id = t
                      AND cardinality(applicable_employment_setup_ids) > 0
                      AND cardinality(applicable_cost_center_ids) = 0) THEN
            RAISE EXCEPTION 'HR149 would widen a leave eligibility restriction in tenant %; no cost centre matches its employment setups', t
                USING ERRCODE = '23514';
        END IF;

        -- 3.4 Archive Employment Setup records (read-only provenance).
        UPDATE hr_master_record
           SET status = 'inactive', deactivated_by = 'migration-0149',
               deactivated_at = now(), updated_at = now()
         WHERE tenant_id = t AND master_type = 'employment_setup' AND status = 'active';
    END LOOP;
    PERFORM set_config('nexora.tenant_id', coalesce(previous_scope, ''), true);
END $$;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;

ALTER TABLE hr_manpower_requisition ENABLE TRIGGER hr_manpower_requisition_scope_guard;
ALTER TABLE hr_leave_type ENABLE TRIGGER hr_leave_type_identity;
ALTER TABLE hr_leave_policy_version ENABLE TRIGGER hr_leave_policy_immutable;
ALTER TABLE hr_master_record ENABLE TRIGGER hr_master_scope_guard;

-- 4. Terms constraint: setups (archived) and cost centres both carry terms.
ALTER TABLE hr_master_record
    ADD CONSTRAINT hr_master_employment_terms CHECK (
        -- Explicit IS NOT NULL: a NULL IN (...) would otherwise pass the check.
        (master_type = 'employment_setup'
            AND payment_route IS NOT NULL AND pay_cycle IS NOT NULL
            AND payment_route IN ('payroll', 'stipend', 'accounts_payable')
            AND pay_cycle IN ('monthly', 'fortnightly', 'weekly', 'stipend')
            AND configuration_key IS NULL AND configuration_value IS NULL)
        OR (master_type = 'cost_center'
            AND payment_route IS NOT NULL AND pay_cycle IS NOT NULL
            AND payment_route IN ('payroll', 'stipend', 'accounts_payable')
            AND pay_cycle IN ('monthly', 'fortnightly', 'weekly', 'stipend'))
        OR (master_type NOT IN ('employment_setup', 'cost_center')
            AND payment_route IS NULL AND pay_cycle IS NULL)
    );

-- 5. New rows no longer reference employment setups.
ALTER TABLE employee_assignment ALTER COLUMN employment_setup_id DROP NOT NULL;
ALTER TABLE hr_employee_transfer_request ALTER COLUMN proposed_employment_setup_id DROP NOT NULL;
ALTER TABLE hr_manpower_requisition ALTER COLUMN employment_setup_id DROP NOT NULL;
ALTER TABLE hr_recruitment_offer ALTER COLUMN employment_setup_id DROP NOT NULL;
CREATE INDEX idx_hr_requisition_cost_center ON hr_manpower_requisition (tenant_id, cost_center_id);

-- 6. Employment Setup is retired: no new records, no reactivation or edits.
CREATE OR REPLACE FUNCTION guard_hr_retired_employment_masters() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF NEW.master_type IN ('employment_type', 'employee_category')
       OR (TG_OP = 'UPDATE' AND OLD.master_type IN ('employment_type', 'employee_category')) THEN
        RAISE EXCEPTION 'employment types and employee categories are retired; set payment terms on the cost centre'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.master_type = 'employment_setup'
       OR (TG_OP = 'UPDATE' AND OLD.master_type = 'employment_setup') THEN
        RAISE EXCEPTION 'employment setups are retired; set the payment route and pay cycle on the cost centre'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;

-- 7. Validation functions accept rows without an employment setup.
-- HR134 body: the setup becomes optional (validated only when present).
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
        (NEW.employment_setup_id, 'employment_setup', false)
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

-- HR134 body: setups are no longer compared or required on transfers.
CREATE OR REPLACE FUNCTION validate_hr_employee_transfer_request() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    source_row employee_assignment%ROWTYPE;
    master_pair record;
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
        RAISE EXCEPTION 'transfer source assignment is not currently authoritative'
            USING ERRCODE='23514';
    END IF;
    IF NEW.effective_on<=source_row.effective_from THEN
        RAISE EXCEPTION 'transfer must begin after the source assignment'
            USING ERRCODE='23514';
    END IF;
    IF NEW.proposed_branch_id IS NOT NULL AND NOT organization_unit_is_within_company(
        NEW.tenant_id,NEW.proposed_branch_id,NEW.company_id
    ) THEN
        RAISE EXCEPTION 'transfer branch is outside the legal employer'
            USING ERRCODE='23514';
    END IF;
    IF NEW.proposed_department_id IS NOT NULL AND NOT organization_unit_is_within_company(
        NEW.tenant_id,NEW.proposed_department_id,NEW.company_id
    ) THEN
        RAISE EXCEPTION 'transfer department is outside the legal employer'
            USING ERRCODE='23514';
    END IF;
    FOR master_pair IN SELECT * FROM (VALUES
        (NEW.proposed_job_id,'job'),
        (NEW.proposed_designation_id,'designation'),
        (NEW.proposed_job_grade_id,'job_grade'),
        (NEW.proposed_cost_center_id,'cost_center'),
        (NEW.proposed_work_location_id,'work_location')
    ) AS proposed(id,expected_type)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM hr_master_record master
             WHERE master.tenant_id=NEW.tenant_id AND master.id=master_pair.id
               AND master.company_id=NEW.company_id
               AND master.master_type=master_pair.expected_type
               AND master.status='active'
        ) THEN
            RAISE EXCEPTION 'transfer references unavailable or mistyped master data'
                USING ERRCODE='23514';
        END IF;
    END LOOP;
    IF NEW.proposed_branch_id IS NOT DISTINCT FROM source_row.branch_id
       AND NEW.proposed_department_id IS NOT DISTINCT FROM source_row.department_id THEN
        RAISE EXCEPTION 'transfer must change branch or department'
            USING ERRCODE='23514';
    END IF;
    IF NEW.proposed_job_id IS DISTINCT FROM source_row.job_id
       OR NEW.proposed_designation_id IS DISTINCT FROM source_row.designation_id
       OR NEW.proposed_job_grade_id IS DISTINCT FROM source_row.job_grade_id
       OR NEW.proposed_cost_center_id IS DISTINCT FROM source_row.cost_center_id
       OR NEW.proposed_work_location_id IS DISTINCT FROM source_row.work_location_id
       OR NEW.proposed_reporting_manager_id IS DISTINCT FROM source_row.reporting_manager_id THEN
        RAISE EXCEPTION 'transfer may change organization placement only'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

-- HR140 body: a requisition names a cost centre (required for new requisitions);
-- a legacy setup is validated only when newly set.
CREATE OR REPLACE FUNCTION validate_hr_manpower_requisition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE grade_currency text; grade_min numeric; grade_max numeric;
BEGIN
  IF TG_OP='INSERT' AND (NEW.project_id IS NULL OR NEW.hiring_basis IS NULL) THEN RAISE EXCEPTION 'project and hiring basis are required' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' AND NEW.cost_center_id IS NULL THEN RAISE EXCEPTION 'cost centre is required' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM hr_master_record WHERE tenant_id=NEW.tenant_id AND id=NEW.designation_id AND company_id=NEW.company_id AND master_type='designation' AND status='active') THEN RAISE EXCEPTION 'designation must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF NEW.cost_center_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id) AND NOT EXISTS (SELECT 1 FROM hr_master_record WHERE tenant_id=NEW.tenant_id AND id=NEW.cost_center_id AND company_id=NEW.company_id AND master_type='cost_center' AND status='active') THEN RAISE EXCEPTION 'cost centre must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF NEW.employment_setup_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.employment_setup_id IS DISTINCT FROM OLD.employment_setup_id) AND NOT EXISTS (SELECT 1 FROM hr_master_record WHERE tenant_id=NEW.tenant_id AND id=NEW.employment_setup_id AND company_id=NEW.company_id AND master_type='employment_setup' AND status='active') THEN RAISE EXCEPTION 'employment setup must be active in the selected company' USING ERRCODE='23514'; END IF;
  SELECT currency_code,band_minimum,band_maximum INTO grade_currency,grade_min,grade_max FROM hr_job_grade_detail detail JOIN hr_master_record master ON master.tenant_id=detail.tenant_id AND master.id=detail.master_record_id WHERE detail.tenant_id=NEW.tenant_id AND detail.master_record_id=NEW.job_grade_id AND detail.company_id=NEW.company_id AND master.status='active';
  IF grade_currency IS NULL THEN RAISE EXCEPTION 'job grade must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF grade_currency<>NEW.currency_code OR grade_min IS NULL OR grade_max IS NULL OR NEW.salary_minimum<grade_min OR NEW.salary_maximum>grade_max THEN RAISE EXCEPTION 'salary range must be within the configured job grade band and currency' USING ERRCODE='23514'; END IF;
  IF NEW.project_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.project_id IS DISTINCT FROM OLD.project_id) AND NOT EXISTS (SELECT 1 FROM erp_project project WHERE project.tenant_id=NEW.tenant_id AND project.company_id=NEW.company_id AND project.id=NEW.project_id AND project.status='active') THEN RAISE EXCEPTION 'project must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_unit branch WHERE branch.tenant_id=NEW.tenant_id AND branch.id=NEW.branch_id AND branch.type='branch' AND branch.status='active' AND organization_unit_is_within_company(NEW.tenant_id, NEW.branch_id, NEW.company_id)) THEN RAISE EXCEPTION 'branch must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_unit department WHERE department.tenant_id=NEW.tenant_id AND department.id=NEW.department_id AND department.type='department' AND department.status='active') THEN RAISE EXCEPTION 'department must be active' USING ERRCODE='23514'; END IF;
  IF NEW.replacement_employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employee_assignment WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.replacement_employee_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'replacement employee must belong to the selected company' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

-- HR134 body: an offer setup is optional; a newly set one must still be active.
CREATE OR REPLACE FUNCTION validate_hr_offer_employment_setup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.employment_setup_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.employment_setup_id IS NOT DISTINCT FROM OLD.employment_setup_id THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM hr_master_record WHERE tenant_id=NEW.tenant_id AND id=NEW.employment_setup_id AND company_id=NEW.company_id AND master_type='employment_setup' AND status='active') THEN RAISE EXCEPTION 'offer employment setup must be active in the offer company' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

-- 8. Leave eligibility by cost centre (newly added centres must be active).
CREATE FUNCTION validate_hr_leave_cost_center_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE previous_ids text[] := '{}';
BEGIN
  IF TG_OP='UPDATE' THEN previous_ids := OLD.applicable_cost_center_ids; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.applicable_cost_center_ids) requested(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM hr_master_record m
        WHERE m.tenant_id=NEW.tenant_id AND m.id=requested.id
          AND m.company_id=NEW.company_id AND m.master_type='cost_center'
          AND (m.status='active' OR requested.id=ANY(previous_ids)))
  ) THEN
    RAISE EXCEPTION 'leave eligibility must reference active cost centres of the same company' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hr_leave_type_cost_center_scope
BEFORE INSERT OR UPDATE OF applicable_cost_center_ids ON hr_leave_type
FOR EACH ROW EXECUTE FUNCTION validate_hr_leave_cost_center_scope();
CREATE TRIGGER hr_leave_policy_cost_center_scope
BEFORE INSERT OR UPDATE OF applicable_cost_center_ids ON hr_leave_policy_version
FOR EACH ROW EXECUTE FUNCTION validate_hr_leave_cost_center_scope();

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',149,'cost_centre_employment_terms');
