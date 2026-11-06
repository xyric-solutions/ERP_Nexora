-- HR138: Organisation Structure now reads Company -> Project -> Location ->
-- Department. "Project" is the existing branch unit type and "Location" is the
-- existing division unit type; stored type values, foreign keys and history
-- are unchanged. Only the relative order of the two levels changes: a Location
-- (division) now sits under a Project (branch), so the placement coherence
-- check ranks branch above division.
--
-- Manpower requisitions also gain an optional Work Location (the place and
-- city where the role works) and the business reason becomes optional.
--
-- Additive and reversible:
--   * placement check: restore the HR032 function body (division rank 2,
--     branch rank 3);
--   * requisition: drop trigger hr_manpower_requisition_work_location_guard,
--     function validate_hr_requisition_work_location, the FK and the
--     work_location_id column, then restore hr_manpower_requisition_reason_check
--     with char_length(btrim(reason)) BETWEEN 1 AND 2000 (only after giving any
--     blank reasons a value).

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
            (2, 'branch', requested_branch),
            (3, 'division', requested_division),
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

ALTER TABLE hr_manpower_requisition
    ADD COLUMN work_location_id text,
    ADD CONSTRAINT hr_manpower_requisition_work_location_fk
        FOREIGN KEY (tenant_id, work_location_id)
        REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX idx_hr_manpower_requisition_work_location
    ON hr_manpower_requisition (tenant_id, work_location_id)
    WHERE work_location_id IS NOT NULL;

-- Checked only when the location is set or changed, so later deactivation of a
-- work location never blocks submitting or deciding an existing requisition.
CREATE FUNCTION validate_hr_requisition_work_location() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF NEW.work_location_id IS NOT NULL
       AND (TG_OP='INSERT' OR NEW.work_location_id IS DISTINCT FROM OLD.work_location_id)
       AND NOT EXISTS (
           SELECT 1 FROM hr_master_record location
            WHERE location.tenant_id=NEW.tenant_id AND location.id=NEW.work_location_id
              AND location.company_id=NEW.company_id AND location.master_type='work_location'
              AND location.status='active'
       ) THEN
        RAISE EXCEPTION 'work location must be active in the selected company' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $function$;

CREATE TRIGGER hr_manpower_requisition_work_location_guard
BEFORE INSERT OR UPDATE OF work_location_id, company_id ON hr_manpower_requisition
FOR EACH ROW EXECUTE FUNCTION validate_hr_requisition_work_location();

ALTER TABLE hr_manpower_requisition
    DROP CONSTRAINT hr_manpower_requisition_reason_check,
    ADD CONSTRAINT hr_manpower_requisition_reason_check
        CHECK (char_length(btrim(reason)) <= 2000);

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',138,'project_location_hierarchy');
