-- HR140: Organisation Structure now reads Company -> Location -> Project ->
-- Department. "Location" is the stored division type and "Project" is the
-- stored branch type; type values, codes, foreign keys and history are
-- unchanged. A Location sits directly under the company, a Project sits under
-- a Location, and a Department sits under a Project.
--
-- 1. Placement coherence ranks division (Location) above branch (Project)
--    again, matching the HR032 ordering.
-- 2. Holiday and manpower-requisition branch checks accept a Project anywhere
--    inside the selected company instead of only directly beneath it.
--
-- Additive and reversible: re-run the HR138 body of
-- hr_organization_placement_is_coherent (branch rank 2, division rank 3), the
-- HR002 body of validate_hr_holiday_scope and the HR136 body of
-- validate_hr_manpower_requisition (branch.parent_id=NEW.company_id). Projects
-- already created under a Location must be moved under the company first.

CREATE OR REPLACE FUNCTION hr_organization_placement_is_coherent(
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

CREATE OR REPLACE FUNCTION validate_hr_holiday_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM organization_unit WHERE tenant_id=NEW.tenant_id
                   AND id=NEW.company_id AND type='company' AND status='active') THEN
        RAISE EXCEPTION 'holiday company is unavailable';
    END IF;
    IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM organization_unit WHERE tenant_id=NEW.tenant_id AND id=NEW.branch_id
         AND type='branch' AND status='active'
         AND organization_unit_is_within_company(NEW.tenant_id, NEW.branch_id, NEW.company_id)
    ) THEN RAISE EXCEPTION 'holiday branch is unavailable in the selected company'; END IF;
    RETURN NEW;
END $$;

-- HR136 body; the optional legacy branch may now sit anywhere in the company.
CREATE OR REPLACE FUNCTION validate_hr_manpower_requisition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE grade_currency text; grade_min numeric; grade_max numeric;
BEGIN
  IF TG_OP='INSERT' AND (NEW.project_id IS NULL OR NEW.hiring_basis IS NULL) THEN RAISE EXCEPTION 'project and hiring basis are required' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM hr_master_record WHERE tenant_id=NEW.tenant_id AND id=NEW.designation_id AND company_id=NEW.company_id AND master_type='designation' AND status='active') THEN RAISE EXCEPTION 'designation must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM hr_master_record WHERE tenant_id=NEW.tenant_id AND id=NEW.employment_setup_id AND company_id=NEW.company_id AND master_type='employment_setup' AND status='active') THEN RAISE EXCEPTION 'employment setup must be active in the selected company' USING ERRCODE='23514'; END IF;
  SELECT currency_code,band_minimum,band_maximum INTO grade_currency,grade_min,grade_max FROM hr_job_grade_detail detail JOIN hr_master_record master ON master.tenant_id=detail.tenant_id AND master.id=detail.master_record_id WHERE detail.tenant_id=NEW.tenant_id AND detail.master_record_id=NEW.job_grade_id AND detail.company_id=NEW.company_id AND master.status='active';
  IF grade_currency IS NULL THEN RAISE EXCEPTION 'job grade must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF grade_currency<>NEW.currency_code OR grade_min IS NULL OR grade_max IS NULL OR NEW.salary_minimum<grade_min OR NEW.salary_maximum>grade_max THEN RAISE EXCEPTION 'salary range must be within the configured job grade band and currency' USING ERRCODE='23514'; END IF;
  IF NEW.project_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.project_id IS DISTINCT FROM OLD.project_id) AND NOT EXISTS (SELECT 1 FROM erp_project project WHERE project.tenant_id=NEW.tenant_id AND project.company_id=NEW.company_id AND project.id=NEW.project_id AND project.status='active') THEN RAISE EXCEPTION 'project must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_unit branch WHERE branch.tenant_id=NEW.tenant_id AND branch.id=NEW.branch_id AND branch.type='branch' AND branch.status='active' AND organization_unit_is_within_company(NEW.tenant_id, NEW.branch_id, NEW.company_id)) THEN RAISE EXCEPTION 'branch must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_unit department WHERE department.tenant_id=NEW.tenant_id AND department.id=NEW.department_id AND department.type='department' AND department.status='active') THEN RAISE EXCEPTION 'department must be active' USING ERRCODE='23514'; END IF;
  IF NEW.replacement_employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employee_assignment WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.replacement_employee_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'replacement employee must belong to the selected company' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',140,'location_project_department_hierarchy');
