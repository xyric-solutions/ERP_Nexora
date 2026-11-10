-- HR143: Add Employee records the Location and Project the employee is being
-- hired for. Both are optional organisation units in the draft's company:
-- Location = organisation unit type 'division', Project = type 'branch'. When
-- both are given the project must sit under that location.
--
-- Additive: two nullable columns with tenant-scoped foreign keys. Reversible by
-- restoring the previous validate_hr_employee_draft_scope body and dropping the
-- two columns.

ALTER TABLE hr_employee_draft_scope
  ADD COLUMN location_id text,
  ADD COLUMN project_id text,
  ADD CONSTRAINT hr_employee_draft_scope_location_fkey
    FOREIGN KEY (tenant_id, location_id) REFERENCES organization_unit(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT hr_employee_draft_scope_project_fkey
    FOREIGN KEY (tenant_id, project_id) REFERENCES organization_unit(tenant_id, id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.validate_hr_employee_draft_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM employee
         WHERE tenant_id=NEW.tenant_id AND id=NEW.employee_id AND status='draft'
    ) THEN
        RAISE EXCEPTION 'employee draft scope requires an employee in draft status'
            USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM organization_unit
         WHERE tenant_id=NEW.tenant_id AND id=NEW.company_id
           AND type='company' AND status='active'
    ) THEN
        RAISE EXCEPTION 'employee draft scope requires an active company'
            USING ERRCODE='23514';
    END IF;
    IF NEW.location_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM organization_unit
         WHERE tenant_id=NEW.tenant_id AND id=NEW.location_id AND type='division' AND status='active'
           AND organization_unit_is_within_company(NEW.tenant_id, NEW.location_id, NEW.company_id)
    ) THEN
        RAISE EXCEPTION 'employee draft location must be an active location in the draft company'
            USING ERRCODE='23514';
    END IF;
    IF NEW.project_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM organization_unit
         WHERE tenant_id=NEW.tenant_id AND id=NEW.project_id AND type='branch' AND status='active'
           AND organization_unit_is_within_company(NEW.tenant_id, NEW.project_id, NEW.company_id)
           AND (NEW.location_id IS NULL OR organization_unit_is_within_company(NEW.tenant_id, NEW.project_id, NEW.location_id))
    ) THEN
        RAISE EXCEPTION 'employee draft project must be an active project in the draft company and location'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',143,'employee_draft_location_project');
