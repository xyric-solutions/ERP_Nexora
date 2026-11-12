-- HR136: Manpower requisitions name a Project and a hiring basis instead of a
-- Branch. The offer derives its branch from the requisition department's
-- parent branch (offers already require that department-under-branch link).
--
-- Additive: existing requisitions keep their branch and have no project or
-- hiring basis (both stay NULL; history is not relabelled). New requisitions
-- must carry both, enforced by the scope trigger on INSERT.
--
-- Rollback (before any new requisition is created): drop the two columns and
-- the index, restore NOT NULL on branch_id and re-run the HR134 body of
-- validate_hr_manpower_requisition. Once requisitions without a branch exist,
-- restoring NOT NULL requires backfilling branch_id from each department's
-- parent branch first.

ALTER TABLE hr_manpower_requisition
    ALTER COLUMN branch_id DROP NOT NULL,
    ADD COLUMN project_id text,
    ADD COLUMN hiring_basis text,
    ADD CONSTRAINT hr_manpower_requisition_hiring_basis_check CHECK (
        hiring_basis IS NULL OR hiring_basis IN
            ('permanent', 'temporary', 'project_based', 'contract', 'internship', 'part_time')
    ),
    ADD CONSTRAINT hr_manpower_requisition_project_fk
        FOREIGN KEY (tenant_id, company_id, project_id)
        REFERENCES erp_project (tenant_id, company_id, id) ON DELETE RESTRICT;

CREATE INDEX idx_hr_manpower_requisition_project
    ON hr_manpower_requisition (tenant_id, project_id)
    WHERE project_id IS NOT NULL;

-- HR134 body plus: Project/hiring basis on new rows, optional legacy branch.
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
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_unit branch WHERE branch.tenant_id=NEW.tenant_id AND branch.id=NEW.branch_id AND branch.type='branch' AND branch.status='active' AND branch.parent_id=NEW.company_id) THEN RAISE EXCEPTION 'branch must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_unit department WHERE department.tenant_id=NEW.tenant_id AND department.id=NEW.department_id AND department.type='department' AND department.status='active') THEN RAISE EXCEPTION 'department must be active' USING ERRCODE='23514'; END IF;
  IF NEW.replacement_employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employee_assignment WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.replacement_employee_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'replacement employee must belong to the selected company' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',136,'requisition_project_hiring_basis');
