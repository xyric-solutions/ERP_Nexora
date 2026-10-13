DO $$
BEGIN
    IF to_regclass('public.organization_unit') IS NULL
       OR to_regclass('public.employee') IS NULL
       OR to_regclass('public.employee_assignment') IS NULL THEN
        RAISE EXCEPTION 'organization head assignment requires Platform organization and HR employee authorities';
    END IF;
END $$;

CREATE TABLE hr_organization_head_assignment (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type='company'),
    organization_unit_id text NOT NULL,
    employee_id text NOT NULL,
    effective_from date NOT NULL,
    effective_to_exclusive date,
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
    recorded_by text NOT NULL CHECK (length(recorded_by) BETWEEN 1 AND 128),
    source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 1 AND 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    FOREIGN KEY (tenant_id,company_id,company_type)
        REFERENCES organization_unit (tenant_id,id,type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,organization_unit_id)
        REFERENCES organization_unit (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,employee_id)
        REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    CHECK (effective_to_exclusive IS NULL OR effective_to_exclusive>=effective_from),
    EXCLUDE USING gist (
        tenant_id WITH =,
        organization_unit_id WITH =,
        daterange(effective_from,effective_to_exclusive,'[)') WITH &&
    )
);

CREATE INDEX idx_hr_organization_head_employee_history
    ON hr_organization_head_assignment
       (tenant_id,employee_id,effective_from DESC);
CREATE INDEX idx_hr_organization_head_current
    ON hr_organization_head_assignment
       (tenant_id,company_id,organization_unit_id,effective_from DESC)
    WHERE effective_to_exclusive IS NULL;

CREATE FUNCTION validate_hr_organization_head_assignment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM organization_unit
         WHERE tenant_id=NEW.tenant_id AND id=NEW.company_id
           AND type='company' AND status='active'
    ) THEN
        RAISE EXCEPTION 'organization head company is unavailable or inactive'
            USING ERRCODE='23514';
    END IF;

    IF NOT EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT id,parent_id
              FROM organization_unit
             WHERE tenant_id=NEW.tenant_id AND id=NEW.organization_unit_id
               AND status='active'
            UNION ALL
            SELECT parent.id,parent.parent_id
              FROM organization_unit parent
              JOIN ancestors child ON child.parent_id=parent.id
             WHERE parent.tenant_id=NEW.tenant_id
        )
        SELECT 1 FROM ancestors WHERE id=NEW.company_id
    ) THEN
        RAISE EXCEPTION 'organization unit is outside the selected company'
            USING ERRCODE='23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM employee_assignment assignment
          JOIN employee employee_record
            ON employee_record.tenant_id=assignment.tenant_id
           AND employee_record.id=assignment.employee_id
         WHERE assignment.tenant_id=NEW.tenant_id
           AND assignment.employee_id=NEW.employee_id
           AND assignment.company_id=NEW.company_id
           AND assignment.assignment_status IN ('active','legacy_compatibility')
           AND employee_record.status IN ('active','probation','confirmed')
           AND assignment.effective_from<=NEW.effective_from
           AND (assignment.effective_to IS NULL OR assignment.effective_to>=NEW.effective_from)
           AND (
               (NEW.effective_to_exclusive IS NULL AND assignment.effective_to IS NULL)
               OR (
                   NEW.effective_to_exclusive IS NOT NULL
                   AND (
                       assignment.effective_to IS NULL
                       OR assignment.effective_to>=NEW.effective_to_exclusive-1
                   )
               )
           )
    ) THEN
        RAISE EXCEPTION 'organization head must have effective employment in the selected company'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER hr_organization_head_assignment_scope
BEFORE INSERT ON hr_organization_head_assignment
FOR EACH ROW EXECUTE FUNCTION validate_hr_organization_head_assignment();

CREATE FUNCTION protect_hr_organization_head_assignment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'organization head history is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id
       OR NEW.company_id<>OLD.company_id OR NEW.company_type<>OLD.company_type
       OR NEW.organization_unit_id<>OLD.organization_unit_id
       OR NEW.employee_id<>OLD.employee_id OR NEW.effective_from<>OLD.effective_from
       OR OLD.effective_to_exclusive IS NOT NULL
       OR NEW.effective_to_exclusive IS NULL
       OR NEW.effective_to_exclusive<NEW.effective_from
       OR NEW.reason<>OLD.reason OR NEW.recorded_by<>OLD.recorded_by
       OR NEW.source_reference<>OLD.source_reference OR NEW.created_at<>OLD.created_at THEN
        RAISE EXCEPTION 'organization head history may only be closed once'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER hr_organization_head_assignment_immutable
BEFORE UPDATE OR DELETE ON hr_organization_head_assignment
FOR EACH ROW EXECUTE FUNCTION protect_hr_organization_head_assignment();

ALTER TABLE hr_organization_head_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_organization_head_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_organization_head_assignment_tenant_isolation
    ON hr_organization_head_assignment
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

COMMENT ON TABLE hr_organization_head_assignment IS
    'Effective-dated organization head relationship over existing Platform organization and HR Employee authorities.';
COMMENT ON COLUMN hr_organization_head_assignment.effective_to_exclusive IS
    'Exclusive end date; NULL means the assignment remains open.';

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',22,'organization_head_assignment');
