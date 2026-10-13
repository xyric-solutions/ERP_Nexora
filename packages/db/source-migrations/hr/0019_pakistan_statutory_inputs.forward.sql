DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration WHERE module_name='hr' AND version=18
    ) THEN
        RAISE EXCEPTION 'Pakistan statutory inputs require HR migration 18';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration WHERE module_name='platform' AND version=6
    ) THEN
        RAISE EXCEPTION 'Pakistan statutory inputs require Platform migration 6';
    END IF;
END $$;

ALTER TABLE hr_statutory_rule_version
    DROP CONSTRAINT hr_statutory_rule_version_rule_type_check;
ALTER TABLE hr_statutory_rule_version
    ADD CONSTRAINT hr_statutory_rule_version_rule_type_check CHECK (
        rule_type IN (
            'parameter_table', 'bracket_table', 'threshold_cap', 'safe_formula',
            'annualized_withholding', 'calendar', 'eligibility_condition',
            'reporting_definition'
        )
    );

CREATE TABLE hr_employee_statutory_declaration (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    employee_id text NOT NULL,
    jurisdiction_id text NOT NULL,
    tax_year integer NOT NULL CHECK (tax_year BETWEEN 2000 AND 2200),
    version_number integer NOT NULL CHECK (version_number > 0),
    effective_from date NOT NULL,
    supersedes_declaration_id text,
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    estimated_annual_salary numeric(20,4) NOT NULL CHECK (estimated_annual_salary >= 0),
    prior_taxable_salary numeric(20,4) NOT NULL DEFAULT 0 CHECK (prior_taxable_salary >= 0),
    prior_salary_tax_withheld numeric(20,4) NOT NULL DEFAULT 0 CHECK (prior_salary_tax_withheld >= 0),
    documented_tax_credit numeric(20,4) NOT NULL DEFAULT 0 CHECK (documented_tax_credit >= 0),
    other_tax_withheld numeric(20,4) NOT NULL DEFAULT 0 CHECK (other_tax_withheld >= 0),
    eobi_applicability text NOT NULL CHECK (eobi_applicability IN ('applicable','not_applicable')),
    provincial_social_security_status text NOT NULL CHECK (
        provincial_social_security_status IN ('assessed_not_applicable','external_pack_required')
    ),
    source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 1 AND 500),
    evidence_hash text,
    state text NOT NULL DEFAULT 'draft' CHECK (
        state IN ('draft','submitted','approved','rejected')
    ),
    created_by text NOT NULL,
    submitted_by text,
    submitted_at timestamptz,
    approved_by text,
    approved_at timestamptz,
    audit_reference text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,id,company_id),
    FOREIGN KEY (tenant_id,employee_id) REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id) REFERENCES organization_unit (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (jurisdiction_id) REFERENCES jurisdiction (id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,supersedes_declaration_id)
        REFERENCES hr_employee_statutory_declaration (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,audit_reference) REFERENCES platform_admin_audit_event (tenant_id,id) ON DELETE RESTRICT,
    CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[a-f0-9]{64}$'),
    CHECK ((state='draft' AND submitted_by IS NULL AND submitted_at IS NULL AND approved_by IS NULL AND approved_at IS NULL AND evidence_hash IS NULL)
        OR (state IN ('submitted','rejected') AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND approved_by IS NULL AND approved_at IS NULL AND evidence_hash IS NULL)
        OR (state='approved' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by<>submitted_by AND evidence_hash IS NOT NULL))
);
CREATE UNIQUE INDEX hr_employee_statutory_declaration_version
    ON hr_employee_statutory_declaration
    (tenant_id,company_id,employee_id,jurisdiction_id,tax_year,version_number);
CREATE UNIQUE INDEX hr_employee_statutory_declaration_approved_root
    ON hr_employee_statutory_declaration
    (tenant_id,company_id,employee_id,jurisdiction_id,tax_year)
    WHERE state='approved' AND supersedes_declaration_id IS NULL;
CREATE UNIQUE INDEX hr_employee_statutory_declaration_approved_successor
    ON hr_employee_statutory_declaration (tenant_id,supersedes_declaration_id)
    WHERE state='approved' AND supersedes_declaration_id IS NOT NULL;
CREATE UNIQUE INDEX hr_employee_statutory_declaration_approved_effective
    ON hr_employee_statutory_declaration
    (tenant_id,company_id,employee_id,jurisdiction_id,tax_year,effective_from)
    WHERE state='approved';
CREATE INDEX hr_employee_statutory_declaration_lookup
    ON hr_employee_statutory_declaration
    (tenant_id,company_id,employee_id,tax_year,state,effective_from DESC,version_number DESC);

CREATE TABLE hr_company_statutory_parameter (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    jurisdiction_id text NOT NULL,
    scheme_code text NOT NULL CHECK (scheme_code ~ '^[a-z][a-z0-9_]{1,63}$'),
    parameter_key text NOT NULL CHECK (parameter_key ~ '^[a-z][a-z0-9_]{1,63}$'),
    amount numeric(20,4) NOT NULL CHECK (amount >= 0),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    effective_from date NOT NULL,
    effective_to date,
    source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 1 AND 500),
    evidence_hash text,
    state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','approved','rejected')),
    created_by text NOT NULL,
    submitted_by text,
    submitted_at timestamptz,
    approved_by text,
    approved_at timestamptz,
    audit_reference text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,id,company_id),
    FOREIGN KEY (tenant_id,company_id) REFERENCES organization_unit (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (jurisdiction_id) REFERENCES jurisdiction (id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,audit_reference) REFERENCES platform_admin_audit_event (tenant_id,id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[a-f0-9]{64}$'),
    CHECK ((state='draft' AND submitted_by IS NULL AND submitted_at IS NULL AND approved_by IS NULL AND approved_at IS NULL AND evidence_hash IS NULL)
        OR (state IN ('submitted','rejected') AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND approved_by IS NULL AND approved_at IS NULL AND evidence_hash IS NULL)
        OR (state='approved' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by<>submitted_by AND evidence_hash IS NOT NULL))
);
ALTER TABLE hr_company_statutory_parameter ADD CONSTRAINT hr_company_statutory_parameter_no_approved_overlap
    EXCLUDE USING gist (
        tenant_id WITH =, company_id WITH =, jurisdiction_id WITH =,
        scheme_code WITH =, parameter_key WITH =,
        daterange(effective_from,effective_to,'[]') WITH &&
    ) WHERE (state='approved');
CREATE INDEX hr_company_statutory_parameter_lookup
    ON hr_company_statutory_parameter
    (tenant_id,company_id,jurisdiction_id,scheme_code,parameter_key,state,effective_from DESC);

CREATE FUNCTION protect_hr_approved_statutory_input()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP='DELETE' AND OLD.state='approved' THEN
        RAISE EXCEPTION 'approved statutory inputs are immutable' USING ERRCODE='P0001';
    END IF;
    IF TG_OP='UPDATE' AND OLD.state='approved' THEN
        RAISE EXCEPTION 'approved statutory inputs are immutable' USING ERRCODE='P0001';
    END IF;
    RETURN COALESCE(NEW,OLD);
END
$function$;

CREATE FUNCTION validate_hr_statutory_declaration_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.state <> 'approved' OR OLD.state = 'approved' THEN
        RETURN NEW;
    END IF;
    IF NEW.supersedes_declaration_id IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM hr_employee_statutory_declaration existing
            WHERE existing.tenant_id=NEW.tenant_id
              AND existing.company_id=NEW.company_id
              AND existing.employee_id=NEW.employee_id
              AND existing.jurisdiction_id=NEW.jurisdiction_id
              AND existing.tax_year=NEW.tax_year
              AND existing.state='approved'
        ) THEN
            RAISE EXCEPTION 'statutory declaration revision must supersede the current approved version'
                USING ERRCODE='23505';
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM hr_employee_statutory_declaration predecessor
            WHERE predecessor.tenant_id=NEW.tenant_id
              AND predecessor.id=NEW.supersedes_declaration_id
              AND predecessor.company_id=NEW.company_id
              AND predecessor.employee_id=NEW.employee_id
              AND predecessor.jurisdiction_id=NEW.jurisdiction_id
              AND predecessor.tax_year=NEW.tax_year
              AND predecessor.state='approved'
              AND predecessor.effective_from < NEW.effective_from
        ) THEN
            RAISE EXCEPTION 'statutory declaration predecessor is not an earlier approved authority'
                USING ERRCODE='23514';
        END IF;
        IF EXISTS (
            SELECT 1 FROM hr_employee_statutory_declaration successor
            WHERE successor.tenant_id=NEW.tenant_id
              AND successor.supersedes_declaration_id=NEW.supersedes_declaration_id
              AND successor.state='approved'
              AND successor.id<>NEW.id
        ) THEN
            RAISE EXCEPTION 'statutory declaration predecessor already has an approved successor'
                USING ERRCODE='23505';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER hr_employee_statutory_declaration_approval_guard
BEFORE UPDATE OF state ON hr_employee_statutory_declaration
FOR EACH ROW EXECUTE FUNCTION validate_hr_statutory_declaration_approval();
CREATE TRIGGER hr_employee_statutory_declaration_immutable
BEFORE UPDATE OR DELETE ON hr_employee_statutory_declaration
FOR EACH ROW EXECUTE FUNCTION protect_hr_approved_statutory_input();
CREATE TRIGGER hr_company_statutory_parameter_immutable
BEFORE UPDATE OR DELETE ON hr_company_statutory_parameter
FOR EACH ROW EXECUTE FUNCTION protect_hr_approved_statutory_input();

ALTER TABLE hr_payroll_statutory_snapshot_line
    ADD COLUMN input_evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN calculation_evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD CONSTRAINT hr_payroll_statutory_snapshot_line_input_object
        CHECK (jsonb_typeof(input_evidence_json)='object'),
    ADD CONSTRAINT hr_payroll_statutory_snapshot_line_calculation_object
        CHECK (jsonb_typeof(calculation_evidence_json)='object');

ALTER TABLE hr_employee_statutory_declaration ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_statutory_declaration FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employee_statutory_declaration_tenant_isolation
ON hr_employee_statutory_declaration
USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

ALTER TABLE hr_company_statutory_parameter ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_company_statutory_parameter FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_company_statutory_parameter_tenant_isolation
ON hr_company_statutory_parameter
USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',19,'pakistan_statutory_inputs');
