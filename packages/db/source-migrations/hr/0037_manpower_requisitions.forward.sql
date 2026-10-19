CREATE TABLE hr_manpower_requisition (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type='company'),
    reference text NOT NULL CHECK (reference ~ '^MRQ-[0-9]{4}-[A-Z0-9]{6}$'),
    job_title text NOT NULL CHECK (char_length(btrim(job_title)) BETWEEN 1 AND 160),
    designation_id text NOT NULL,
    job_grade_id text NOT NULL,
    employment_type_id text NOT NULL,
    branch_id text NOT NULL,
    branch_type text NOT NULL DEFAULT 'branch' CHECK (branch_type='branch'),
    department_id text NOT NULL,
    department_type text NOT NULL DEFAULT 'department' CHECK (department_type='department'),
    positions_requested integer NOT NULL CHECK (positions_requested BETWEEN 1 AND 999),
    position_type text NOT NULL CHECK (position_type IN ('new_position','replacement')),
    replacement_employee_id text,
    salary_minimum numeric(20,4) NOT NULL CHECK (salary_minimum >= 0),
    salary_maximum numeric(20,4) NOT NULL CHECK (salary_maximum >= salary_minimum),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    target_start_date date NOT NULL,
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
    required_skills jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(required_skills) = 'array'),
    state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','approved','rejected','cancelled')),
    created_by text NOT NULL,
    submitted_by text,
    submitted_at timestamptz,
    decided_by text,
    decided_at timestamptz,
    decision_reason text,
    approval_override_event_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,reference),
    FOREIGN KEY (tenant_id,company_id,company_type) REFERENCES organization_unit (tenant_id,id,type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,designation_id) REFERENCES hr_master_record (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,job_grade_id) REFERENCES hr_master_record (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,employment_type_id) REFERENCES hr_master_record (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,branch_id,branch_type) REFERENCES organization_unit (tenant_id,id,type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,department_id,department_type) REFERENCES organization_unit (tenant_id,id,type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,replacement_employee_id) REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    CHECK ((position_type='new_position' AND replacement_employee_id IS NULL) OR (position_type='replacement' AND replacement_employee_id IS NOT NULL)),
    CHECK ((state='draft' AND submitted_by IS NULL AND submitted_at IS NULL AND decided_by IS NULL AND decided_at IS NULL AND decision_reason IS NULL)
       OR (state='submitted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND decided_by IS NULL AND decided_at IS NULL AND decision_reason IS NULL)
       OR (state IN ('approved','rejected') AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_reason IS NOT NULL)
       OR (state='cancelled'))
);

CREATE INDEX idx_hr_manpower_requisition_company_state
  ON hr_manpower_requisition (tenant_id,company_id,state,created_at DESC);

CREATE FUNCTION validate_hr_manpower_requisition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE grade_currency text; grade_min numeric; grade_max numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hr_master_record WHERE tenant_id=NEW.tenant_id AND id=NEW.designation_id AND company_id=NEW.company_id AND master_type='designation' AND status='active') THEN RAISE EXCEPTION 'designation must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM hr_master_record WHERE tenant_id=NEW.tenant_id AND id=NEW.employment_type_id AND company_id=NEW.company_id AND master_type='employment_type' AND status='active') THEN RAISE EXCEPTION 'employment type must be active in the selected company' USING ERRCODE='23514'; END IF;
  SELECT currency_code,band_minimum,band_maximum INTO grade_currency,grade_min,grade_max FROM hr_job_grade_detail detail JOIN hr_master_record master ON master.tenant_id=detail.tenant_id AND master.id=detail.master_record_id WHERE detail.tenant_id=NEW.tenant_id AND detail.master_record_id=NEW.job_grade_id AND detail.company_id=NEW.company_id AND master.status='active';
  IF grade_currency IS NULL THEN RAISE EXCEPTION 'job grade must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF grade_currency<>NEW.currency_code OR grade_min IS NULL OR grade_max IS NULL OR NEW.salary_minimum<grade_min OR NEW.salary_maximum>grade_max THEN RAISE EXCEPTION 'salary range must be within the configured job grade band and currency' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_unit branch WHERE branch.tenant_id=NEW.tenant_id AND branch.id=NEW.branch_id AND branch.type='branch' AND branch.status='active' AND branch.parent_id=NEW.company_id) THEN RAISE EXCEPTION 'branch must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_unit department WHERE department.tenant_id=NEW.tenant_id AND department.id=NEW.department_id AND department.type='department' AND department.status='active') THEN RAISE EXCEPTION 'department must be active' USING ERRCODE='23514'; END IF;
  IF NEW.replacement_employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employee_assignment WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.replacement_employee_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'replacement employee must belong to the selected company' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hr_manpower_requisition_scope_guard BEFORE INSERT OR UPDATE ON hr_manpower_requisition FOR EACH ROW EXECUTE FUNCTION validate_hr_manpower_requisition();
ALTER TABLE hr_manpower_requisition ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_manpower_requisition FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_manpower_requisition_tenant_isolation ON hr_manpower_requisition USING (tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
INSERT INTO nexora_schema_migration (module_name,version,name) VALUES ('hr',37,'manpower_requisitions');
