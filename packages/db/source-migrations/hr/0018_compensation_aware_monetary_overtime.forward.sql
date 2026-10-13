DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration WHERE module_name='hr' AND version=17
    ) THEN
        RAISE EXCEPTION 'monetary overtime requires HR migration 17';
    END IF;
END $$;

ALTER TABLE hr_salary_assignment
    ADD COLUMN compensation_type text,
    ADD COLUMN payment_basis text,
    ADD COLUMN compensation_model_version integer,
    ADD CONSTRAINT hr_salary_assignment_compensation_model CHECK (
        (compensation_type IS NULL AND payment_basis IS NULL AND compensation_model_version IS NULL)
        OR
        (compensation_type IN ('fixed','contractual','hourly')
         AND payment_basis IN ('hourly','daily','weekly','monthly','annual','custom')
         AND compensation_model_version = 1)
    );

CREATE TABLE hr_salary_assignment_component (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    assignment_id text NOT NULL,
    structure_id text NOT NULL,
    component_id text NOT NULL,
    position integer NOT NULL CHECK (position > 0),
    method text NOT NULL CHECK (method IN ('fixed','formula')),
    amount numeric(20,4),
    formula text,
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,assignment_id,component_id),
    UNIQUE (tenant_id,assignment_id,position),
    FOREIGN KEY (tenant_id,assignment_id,company_id)
        REFERENCES hr_salary_assignment (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,structure_id,component_id)
        REFERENCES hr_salary_structure_item (tenant_id,structure_id,component_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,component_id,company_id)
        REFERENCES hr_pay_component (tenant_id,id,company_id) ON DELETE RESTRICT,
    CHECK ((method='fixed' AND amount IS NOT NULL AND amount >= 0 AND formula IS NULL)
        OR (method='formula' AND amount IS NULL AND formula IS NOT NULL
            AND char_length(btrim(formula)) BETWEEN 1 AND 500))
);
CREATE INDEX idx_hr_salary_assignment_component_assignment
    ON hr_salary_assignment_component (tenant_id,company_id,assignment_id,position);

CREATE TABLE hr_ot_monetary_policy (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type='company'),
    reference text NOT NULL CHECK (reference ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    contractual_ot_allowed boolean NOT NULL DEFAULT false,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,id,company_id),
    UNIQUE (tenant_id,company_id,reference),
    FOREIGN KEY (tenant_id,company_id,company_type)
        REFERENCES organization_unit (tenant_id,id,type) ON DELETE RESTRICT
);

CREATE TABLE hr_ot_monetary_policy_version (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    policy_id text NOT NULL,
    version_number integer NOT NULL CHECK (version_number > 0),
    category text NOT NULL CHECK (category IN ('regular','weekend','holiday')),
    scope_kind text NOT NULL DEFAULT 'company' CHECK (scope_kind='company'),
    effective_from date NOT NULL,
    effective_to date,
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','submitted','approved','released','retired','rejected')),
    approval_required boolean NOT NULL DEFAULT true,
    source_reference text NOT NULL CHECK (char_length(btrim(source_reference)) BETWEEN 1 AND 500),
    evidence_hash text,
    created_by text NOT NULL,
    submitted_by text,
    approved_by text,
    released_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz,
    approved_at timestamptz,
    released_at timestamptz,
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,id,company_id),
    UNIQUE (tenant_id,policy_id,version_number,category),
    FOREIGN KEY (tenant_id,policy_id,company_id)
        REFERENCES hr_ot_monetary_policy (tenant_id,id,company_id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK ((status='draft' AND submitted_by IS NULL AND approved_by IS NULL AND released_by IS NULL)
        OR (status='submitted' AND submitted_by IS NOT NULL AND approved_by IS NULL AND released_by IS NULL)
        OR (status IN ('approved','rejected') AND submitted_by IS NOT NULL AND approved_by IS NOT NULL AND released_by IS NULL)
        OR (status IN ('released','retired') AND submitted_by IS NOT NULL AND approved_by IS NOT NULL
            AND released_by IS NOT NULL AND evidence_hash ~ '^[0-9a-f]{64}$')),
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_id WITH =,
        category WITH =,
        daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') WITH &&
    ) WHERE (status='released')
);
CREATE INDEX idx_hr_ot_monetary_policy_version_effective
    ON hr_ot_monetary_policy_version (tenant_id,company_id,category,effective_from,effective_to,status);

CREATE TABLE hr_ot_monetary_policy_option (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    policy_version_id text NOT NULL,
    code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    rate_basis_method text NOT NULL
        CHECK (rate_basis_method IN ('direct_hourly','daily','weekly','monthly','annual','custom')),
    basis_source text NOT NULL
        CHECK (basis_source IN ('selected_components','direct_contractual_rate')),
    allowed_compensation_types text[] NOT NULL,
    allowed_payment_bases text[] NOT NULL,
    minimum_components smallint NOT NULL DEFAULT 0 CHECK (minimum_components BETWEEN 0 AND 50),
    maximum_components smallint NOT NULL DEFAULT 0 CHECK (maximum_components BETWEEN minimum_components AND 50),
    ordinary_hours numeric(12,6),
    multiplier numeric(12,6) NOT NULL CHECK (multiplier > 0),
    minute_precision smallint NOT NULL CHECK (minute_precision BETWEEN 0 AND 8),
    hourly_rate_precision smallint NOT NULL CHECK (hourly_rate_precision BETWEEN 0 AND 8),
    intermediate_precision smallint NOT NULL CHECK (intermediate_precision BETWEEN 0 AND 8),
    rounding_mode text NOT NULL CHECK (rounding_mode IN ('half_up','half_even','down','up')),
    rounding_stage text NOT NULL CHECK (rounding_stage IN ('hourly_rate','per_ot_day','final_employee_period')),
    final_currency_scale smallint NOT NULL CHECK (final_currency_scale BETWEEN 0 AND 4),
    currency_mode text NOT NULL DEFAULT 'assignment_currency' CHECK (currency_mode='assignment_currency'),
    earning_component_id text NOT NULL,
    custom_steps jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,id,company_id),
    UNIQUE (tenant_id,policy_version_id,code),
    FOREIGN KEY (tenant_id,policy_version_id,company_id)
        REFERENCES hr_ot_monetary_policy_version (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,earning_component_id,company_id)
        REFERENCES hr_pay_component (tenant_id,id,company_id) ON DELETE RESTRICT,
    CHECK (allowed_compensation_types <@ ARRAY['fixed','contractual','hourly']::text[]
        AND cardinality(allowed_compensation_types) > 0),
    CHECK (allowed_payment_bases <@ ARRAY['hourly','daily','weekly','monthly','annual','custom']::text[]
        AND cardinality(allowed_payment_bases) > 0),
    CHECK ((basis_source='selected_components' AND minimum_components > 0)
        OR (basis_source='direct_contractual_rate' AND minimum_components=0 AND maximum_components=0)),
    CHECK ((rate_basis_method='direct_hourly' AND ordinary_hours IS NULL)
        OR (rate_basis_method IN ('daily','weekly','monthly','annual') AND ordinary_hours > 0)
        OR (rate_basis_method='custom' AND custom_steps IS NOT NULL AND jsonb_typeof(custom_steps)='array')),
    CHECK (rate_basis_method='custom' OR custom_steps IS NULL)
);
CREATE INDEX idx_hr_ot_monetary_option_version
    ON hr_ot_monetary_policy_option (tenant_id,company_id,policy_version_id,code);

CREATE TABLE hr_ot_monetary_option_component (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    option_id text NOT NULL,
    component_id text NOT NULL,
    position integer NOT NULL CHECK (position > 0),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,option_id,component_id),
    UNIQUE (tenant_id,option_id,position),
    FOREIGN KEY (tenant_id,option_id,company_id)
        REFERENCES hr_ot_monetary_policy_option (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,component_id,company_id)
        REFERENCES hr_pay_component (tenant_id,id,company_id) ON DELETE RESTRICT
);

CREATE TABLE hr_employee_ot_arrangement (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    employee_id text NOT NULL,
    category text NOT NULL CHECK (category IN ('regular','weekend','holiday')),
    policy_version_id text NOT NULL,
    policy_option_id text NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    direct_rate numeric(20,6),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    state text NOT NULL DEFAULT 'draft'
        CHECK (state IN ('draft','submitted','approved','effective','superseded','rejected','cancelled')),
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
    evidence_hash text,
    created_by text NOT NULL,
    submitted_by text,
    approved_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz,
    approved_at timestamptz,
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,id,company_id),
    FOREIGN KEY (tenant_id,employee_id) REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,policy_version_id,company_id)
        REFERENCES hr_ot_monetary_policy_version (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,policy_option_id,company_id)
        REFERENCES hr_ot_monetary_policy_option (tenant_id,id,company_id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (direct_rate IS NULL OR direct_rate > 0),
    CHECK ((state='draft' AND submitted_by IS NULL AND approved_by IS NULL)
        OR (state='submitted' AND submitted_by IS NOT NULL AND approved_by IS NULL)
        OR (state IN ('approved','effective','superseded','rejected')
            AND submitted_by IS NOT NULL AND approved_by IS NOT NULL AND evidence_hash ~ '^[0-9a-f]{64}$')
        OR state='cancelled'),
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_id WITH =,
        employee_id WITH =,
        category WITH =,
        daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') WITH &&
    ) WHERE (state IN ('approved','effective'))
);
CREATE INDEX idx_hr_employee_ot_arrangement_effective
    ON hr_employee_ot_arrangement (tenant_id,company_id,employee_id,category,effective_from,effective_to,state);

CREATE TABLE hr_employee_ot_arrangement_component (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    arrangement_id text NOT NULL,
    component_id text NOT NULL,
    position integer NOT NULL CHECK (position > 0),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,arrangement_id,component_id),
    UNIQUE (tenant_id,arrangement_id,position),
    FOREIGN KEY (tenant_id,arrangement_id,company_id)
        REFERENCES hr_employee_ot_arrangement (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,component_id,company_id)
        REFERENCES hr_pay_component (tenant_id,id,company_id) ON DELETE RESTRICT
);

ALTER TABLE hr_overtime_rule
    DROP CONSTRAINT hr_overtime_rule_tenant_id_company_id_category_key,
    ADD COLUMN version_number integer NOT NULL DEFAULT 1 CHECK (version_number > 0),
    ADD COLUMN effective_from date NOT NULL DEFAULT '0001-01-01'::date,
    ADD COLUMN effective_to date,
    ADD COLUMN evidence_hash text,
    ADD CONSTRAINT hr_overtime_rule_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
    ADD CONSTRAINT hr_overtime_rule_version UNIQUE (tenant_id,company_id,category,version_number),
    ADD CONSTRAINT hr_overtime_rule_effective_exclusion EXCLUDE USING gist (
        tenant_id WITH =,
        company_id WITH =,
        category WITH =,
        daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') WITH &&
    ) WHERE (status='active');
CREATE INDEX idx_hr_overtime_rule_effective
    ON hr_overtime_rule (tenant_id,company_id,category,effective_from,effective_to,status);

ALTER TABLE hr_overtime_request
    ADD COLUMN operational_rule_id text,
    ADD COLUMN operational_rule_evidence_hash text,
    ADD CONSTRAINT hr_overtime_request_operational_rule_fk
        FOREIGN KEY (tenant_id,operational_rule_id)
        REFERENCES hr_overtime_rule (tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT hr_overtime_request_operational_rule_pair CHECK (
        (operational_rule_id IS NULL AND operational_rule_evidence_hash IS NULL)
        OR (operational_rule_id IS NOT NULL AND operational_rule_evidence_hash ~ '^[0-9a-f]{64}$')
    );

ALTER TABLE hr_payroll_input
    DROP CONSTRAINT hr_payroll_input_evidence_version_check,
    DROP CONSTRAINT hr_payroll_input_evidence_shape,
    ADD CONSTRAINT hr_payroll_input_evidence_version_check
        CHECK (evidence_version IN ('legacy_summary_v1','attendance_leave_overtime_v2',
                                    'attendance_leave_overtime_v3','attendance_leave_overtime_v4')),
    ADD CONSTRAINT hr_payroll_input_evidence_shape CHECK (
        (evidence_version='legacy_summary_v1' AND jsonb_array_length(source_snapshot_json)=0)
        OR
        (evidence_version IN ('attendance_leave_overtime_v2','attendance_leave_overtime_v3',
                              'attendance_leave_overtime_v4')
         AND jsonb_array_length(source_snapshot_json)::numeric=calendar_days)
    );

CREATE TABLE hr_payroll_ot_evidence (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    payroll_result_id text NOT NULL,
    payroll_result_item_id text NOT NULL,
    employee_id text NOT NULL,
    work_date date NOT NULL,
    approved_minutes integer NOT NULL CHECK (approved_minutes > 0 AND approved_minutes <= 1440),
    category text NOT NULL CHECK (category IN ('regular','weekend','holiday')),
    overtime_request_id text NOT NULL,
    operational_rule_id text NOT NULL,
    policy_version_id text NOT NULL,
    policy_option_id text NOT NULL,
    arrangement_id text NOT NULL,
    compensation_type text NOT NULL CHECK (compensation_type IN ('fixed','contractual','hourly')),
    payment_basis text NOT NULL CHECK (payment_basis IN ('hourly','daily','weekly','monthly','annual','custom')),
    salary_assignment_id text NOT NULL,
    salary_segment_id text NOT NULL,
    basis_components_json jsonb NOT NULL CHECK (jsonb_typeof(basis_components_json)='array'),
    basis_amount numeric(20,6) NOT NULL CHECK (basis_amount >= 0),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    conversion_method text NOT NULL,
    ordinary_hours numeric(12,6),
    hourly_rate numeric(20,8) NOT NULL CHECK (hourly_rate >= 0),
    multiplier numeric(12,6) NOT NULL CHECK (multiplier > 0),
    overtime_hours numeric(16,8) NOT NULL CHECK (overtime_hours > 0),
    unrounded_amount numeric(24,8) NOT NULL CHECK (unrounded_amount >= 0),
    rounded_amount numeric(20,4) NOT NULL CHECK (rounded_amount >= 0),
    rounding_mode text NOT NULL CHECK (rounding_mode IN ('half_up','half_even','down','up')),
    rounding_stage text NOT NULL CHECK (rounding_stage IN ('hourly_rate','per_ot_day','final_employee_period')),
    minute_precision smallint NOT NULL CHECK (minute_precision BETWEEN 0 AND 8),
    hourly_rate_precision smallint NOT NULL CHECK (hourly_rate_precision BETWEEN 0 AND 8),
    intermediate_precision smallint NOT NULL CHECK (intermediate_precision BETWEEN 0 AND 8),
    final_currency_scale smallint NOT NULL CHECK (final_currency_scale BETWEEN 0 AND 4),
    earning_component_id text NOT NULL,
    calculation_json jsonb NOT NULL CHECK (jsonb_typeof(calculation_json)='object'),
    evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,payroll_result_id,overtime_request_id),
    FOREIGN KEY (tenant_id,payroll_result_id,company_id)
        REFERENCES hr_payroll_result (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,payroll_result_item_id)
        REFERENCES hr_payroll_result_item (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,employee_id) REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,overtime_request_id) REFERENCES hr_overtime_request (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,operational_rule_id) REFERENCES hr_overtime_rule (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,policy_version_id,company_id)
        REFERENCES hr_ot_monetary_policy_version (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,policy_option_id,company_id)
        REFERENCES hr_ot_monetary_policy_option (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,arrangement_id,company_id)
        REFERENCES hr_employee_ot_arrangement (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,salary_assignment_id,company_id)
        REFERENCES hr_salary_assignment (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,salary_segment_id)
        REFERENCES hr_payroll_result_salary_segment (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,earning_component_id,company_id)
        REFERENCES hr_pay_component (tenant_id,id,company_id) ON DELETE RESTRICT
);
CREATE INDEX idx_hr_payroll_ot_evidence_result
    ON hr_payroll_ot_evidence (tenant_id,company_id,payroll_result_id,work_date,category);

CREATE FUNCTION validate_hr_ot_monetary_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_row hr_ot_monetary_policy_version%ROWTYPE;
DECLARE option_row hr_ot_monetary_policy_option%ROWTYPE;
DECLARE arrangement_row hr_employee_ot_arrangement%ROWTYPE;
DECLARE assignment_row hr_salary_assignment%ROWTYPE;
DECLARE evidence_result record;
DECLARE evidence_request record;
DECLARE evidence_segment record;
BEGIN
    IF TG_TABLE_NAME='hr_ot_monetary_policy_option' THEN
        SELECT * INTO version_row FROM hr_ot_monetary_policy_version
         WHERE tenant_id=NEW.tenant_id AND id=NEW.policy_version_id;
        IF version_row.id IS NULL OR version_row.company_id IS DISTINCT FROM NEW.company_id THEN
            RAISE EXCEPTION 'monetary overtime option is outside its policy company';
        END IF;
    ELSIF TG_TABLE_NAME='hr_employee_ot_arrangement' THEN
        SELECT * INTO version_row FROM hr_ot_monetary_policy_version
         WHERE tenant_id=NEW.tenant_id AND id=NEW.policy_version_id;
        SELECT * INTO option_row FROM hr_ot_monetary_policy_option
         WHERE tenant_id=NEW.tenant_id AND id=NEW.policy_option_id;
        IF version_row.id IS NULL OR option_row.id IS NULL
           OR version_row.company_id IS DISTINCT FROM NEW.company_id
           OR option_row.company_id IS DISTINCT FROM NEW.company_id
           OR option_row.policy_version_id IS DISTINCT FROM NEW.policy_version_id
           OR version_row.category IS DISTINCT FROM NEW.category THEN
            RAISE EXCEPTION 'employee overtime arrangement does not match its policy option';
        END IF;
    ELSIF TG_TABLE_NAME='hr_employee_ot_arrangement_component' THEN
        SELECT * INTO arrangement_row FROM hr_employee_ot_arrangement
         WHERE tenant_id=NEW.tenant_id AND id=NEW.arrangement_id;
        IF arrangement_row.id IS NULL OR arrangement_row.company_id IS DISTINCT FROM NEW.company_id
           OR NOT EXISTS (
               SELECT 1 FROM hr_ot_monetary_option_component allowed
                WHERE allowed.tenant_id=NEW.tenant_id
                  AND allowed.option_id=arrangement_row.policy_option_id
                  AND allowed.component_id=NEW.component_id
           ) THEN
            RAISE EXCEPTION 'employee overtime component is not permitted by the selected option';
        END IF;
    ELSIF TG_TABLE_NAME='hr_salary_assignment_component' THEN
        SELECT * INTO assignment_row FROM hr_salary_assignment
         WHERE tenant_id=NEW.tenant_id AND id=NEW.assignment_id;
        IF assignment_row.id IS NULL OR assignment_row.company_id IS DISTINCT FROM NEW.company_id
           OR assignment_row.structure_id IS DISTINCT FROM NEW.structure_id
           OR assignment_row.currency_code IS DISTINCT FROM NEW.currency_code THEN
            RAISE EXCEPTION 'salary assignment component does not match its compensation assignment';
        END IF;
    ELSIF TG_TABLE_NAME='hr_payroll_ot_evidence' THEN
        SELECT r.company_id,r.employee_id,i.result_id AS item_result_id
          INTO evidence_result
          FROM hr_payroll_result r
          JOIN hr_payroll_result_item i ON i.tenant_id=r.tenant_id AND i.id=NEW.payroll_result_item_id
         WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.payroll_result_id;
        SELECT company_id,employee_id,work_date,category,approved_minutes,status,operational_rule_id
          INTO evidence_request FROM hr_overtime_request
         WHERE tenant_id=NEW.tenant_id AND id=NEW.overtime_request_id;
        SELECT result_id,salary_assignment_id,currency_code INTO evidence_segment
          FROM hr_payroll_result_salary_segment
         WHERE tenant_id=NEW.tenant_id AND id=NEW.salary_segment_id;
        SELECT * INTO arrangement_row FROM hr_employee_ot_arrangement
         WHERE tenant_id=NEW.tenant_id AND id=NEW.arrangement_id;
        SELECT * INTO assignment_row FROM hr_salary_assignment
         WHERE tenant_id=NEW.tenant_id AND id=NEW.salary_assignment_id;
        SELECT * INTO version_row FROM hr_ot_monetary_policy_version
         WHERE tenant_id=NEW.tenant_id AND id=NEW.policy_version_id;
        SELECT * INTO option_row FROM hr_ot_monetary_policy_option
         WHERE tenant_id=NEW.tenant_id AND id=NEW.policy_option_id;
        IF evidence_result.company_id IS DISTINCT FROM NEW.company_id
           OR evidence_result.employee_id IS DISTINCT FROM NEW.employee_id
           OR evidence_result.item_result_id IS DISTINCT FROM NEW.payroll_result_id
           OR evidence_request.company_id IS DISTINCT FROM NEW.company_id
           OR evidence_request.employee_id IS DISTINCT FROM NEW.employee_id
           OR evidence_request.work_date IS DISTINCT FROM NEW.work_date
           OR evidence_request.category IS DISTINCT FROM NEW.category
           OR evidence_request.approved_minutes IS DISTINCT FROM NEW.approved_minutes
           OR evidence_request.status IS DISTINCT FROM 'approved'
           OR evidence_request.operational_rule_id IS DISTINCT FROM NEW.operational_rule_id
           OR evidence_segment.result_id IS DISTINCT FROM NEW.payroll_result_id
           OR evidence_segment.salary_assignment_id IS DISTINCT FROM NEW.salary_assignment_id
           OR evidence_segment.currency_code IS DISTINCT FROM NEW.currency_code
           OR arrangement_row.company_id IS DISTINCT FROM NEW.company_id
           OR arrangement_row.employee_id IS DISTINCT FROM NEW.employee_id
           OR arrangement_row.category IS DISTINCT FROM NEW.category
           OR arrangement_row.policy_version_id IS DISTINCT FROM NEW.policy_version_id
           OR arrangement_row.policy_option_id IS DISTINCT FROM NEW.policy_option_id
           OR assignment_row.company_id IS DISTINCT FROM NEW.company_id
           OR assignment_row.employee_id IS DISTINCT FROM NEW.employee_id
           OR assignment_row.currency_code IS DISTINCT FROM NEW.currency_code
           OR version_row.company_id IS DISTINCT FROM NEW.company_id
           OR version_row.category IS DISTINCT FROM NEW.category
           OR option_row.company_id IS DISTINCT FROM NEW.company_id
           OR option_row.policy_version_id IS DISTINCT FROM NEW.policy_version_id
           OR option_row.earning_component_id IS DISTINCT FROM NEW.earning_component_id THEN
            RAISE EXCEPTION 'monetary overtime evidence authorities do not match';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER hr_ot_option_scope BEFORE INSERT OR UPDATE ON hr_ot_monetary_policy_option
FOR EACH ROW EXECUTE FUNCTION validate_hr_ot_monetary_scope();
CREATE TRIGGER hr_employee_ot_arrangement_scope BEFORE INSERT OR UPDATE ON hr_employee_ot_arrangement
FOR EACH ROW EXECUTE FUNCTION validate_hr_ot_monetary_scope();
CREATE TRIGGER hr_employee_ot_arrangement_component_scope BEFORE INSERT OR UPDATE ON hr_employee_ot_arrangement_component
FOR EACH ROW EXECUTE FUNCTION validate_hr_ot_monetary_scope();
CREATE TRIGGER hr_salary_assignment_component_scope BEFORE INSERT OR UPDATE ON hr_salary_assignment_component
FOR EACH ROW EXECUTE FUNCTION validate_hr_ot_monetary_scope();
CREATE TRIGGER hr_payroll_ot_evidence_scope BEFORE INSERT OR UPDATE ON hr_payroll_ot_evidence
FOR EACH ROW EXECUTE FUNCTION validate_hr_ot_monetary_scope();

CREATE FUNCTION protect_hr_ot_monetary_authority() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
    IF TG_TABLE_NAME='hr_ot_monetary_policy_version' THEN
        IF OLD.status IN ('released','retired') THEN
            RAISE EXCEPTION 'released monetary overtime policy versions are immutable';
        END IF;
    ELSIF TG_TABLE_NAME IN ('hr_ot_monetary_policy_option','hr_ot_monetary_option_component') THEN
        IF TG_TABLE_NAME='hr_ot_monetary_policy_option' THEN
            SELECT status INTO parent_status FROM hr_ot_monetary_policy_version
             WHERE tenant_id=OLD.tenant_id AND id=OLD.policy_version_id;
        ELSE
            SELECT v.status INTO parent_status
              FROM hr_ot_monetary_policy_version v
              JOIN hr_ot_monetary_policy_option o ON o.tenant_id=v.tenant_id AND o.policy_version_id=v.id
             WHERE o.tenant_id=OLD.tenant_id AND o.id=OLD.option_id;
        END IF;
        IF parent_status IN ('released','retired') THEN
            RAISE EXCEPTION 'released monetary overtime policy options are immutable';
        END IF;
    ELSIF TG_TABLE_NAME='hr_employee_ot_arrangement' THEN
        IF OLD.state IN ('approved','effective','superseded') THEN
            RAISE EXCEPTION 'approved employee overtime arrangements are immutable';
        END IF;
    ELSE
        RAISE EXCEPTION 'monetary overtime evidence is immutable';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER hr_ot_policy_version_immutable BEFORE UPDATE OR DELETE ON hr_ot_monetary_policy_version
FOR EACH ROW EXECUTE FUNCTION protect_hr_ot_monetary_authority();
CREATE TRIGGER hr_ot_option_immutable BEFORE UPDATE OR DELETE ON hr_ot_monetary_policy_option
FOR EACH ROW EXECUTE FUNCTION protect_hr_ot_monetary_authority();
CREATE TRIGGER hr_ot_option_component_immutable BEFORE UPDATE OR DELETE ON hr_ot_monetary_option_component
FOR EACH ROW EXECUTE FUNCTION protect_hr_ot_monetary_authority();
CREATE TRIGGER hr_employee_ot_arrangement_immutable BEFORE UPDATE OR DELETE ON hr_employee_ot_arrangement
FOR EACH ROW EXECUTE FUNCTION protect_hr_ot_monetary_authority();
CREATE TRIGGER hr_salary_assignment_component_immutable BEFORE UPDATE OR DELETE ON hr_salary_assignment_component
FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
CREATE TRIGGER hr_payroll_ot_evidence_immutable BEFORE UPDATE OR DELETE ON hr_payroll_ot_evidence
FOR EACH ROW EXECUTE FUNCTION protect_hr_ot_monetary_authority();

CREATE FUNCTION protect_hr_compensation_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.compensation_model_version IS NOT NULL THEN
        IF TG_OP='DELETE'
           OR OLD.company_id IS DISTINCT FROM NEW.company_id
           OR OLD.employee_id IS DISTINCT FROM NEW.employee_id
           OR OLD.structure_id IS DISTINCT FROM NEW.structure_id
           OR OLD.currency_code IS DISTINCT FROM NEW.currency_code
           OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
           OR OLD.compensation_type IS DISTINCT FROM NEW.compensation_type
           OR OLD.payment_basis IS DISTINCT FROM NEW.payment_basis
           OR OLD.compensation_model_version IS DISTINCT FROM NEW.compensation_model_version THEN
            RAISE EXCEPTION 'compensation assignment authority is immutable; create an effective-dated revision';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER hr_compensation_assignment_immutable BEFORE UPDATE OR DELETE ON hr_salary_assignment
FOR EACH ROW EXECUTE FUNCTION protect_hr_compensation_assignment();

ALTER TABLE hr_salary_assignment_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_salary_assignment_component FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_salary_assignment_component_tenant_isolation ON hr_salary_assignment_component
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_ot_monetary_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_ot_monetary_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_ot_monetary_policy_tenant_isolation ON hr_ot_monetary_policy
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_ot_monetary_policy_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_ot_monetary_policy_version FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_ot_monetary_policy_version_tenant_isolation ON hr_ot_monetary_policy_version
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_ot_monetary_policy_option ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_ot_monetary_policy_option FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_ot_monetary_policy_option_tenant_isolation ON hr_ot_monetary_policy_option
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_ot_monetary_option_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_ot_monetary_option_component FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_ot_monetary_option_component_tenant_isolation ON hr_ot_monetary_option_component
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_employee_ot_arrangement ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_ot_arrangement FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employee_ot_arrangement_tenant_isolation ON hr_employee_ot_arrangement
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_employee_ot_arrangement_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_ot_arrangement_component FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employee_ot_arrangement_component_tenant_isolation ON hr_employee_ot_arrangement_component
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_payroll_ot_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_ot_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_payroll_ot_evidence_tenant_isolation ON hr_payroll_ot_evidence
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

COMMENT ON COLUMN hr_overtime_rule.multiplier IS
    'Legacy operational quantity evidence only; never an overtime monetary multiplier.';
COMMENT ON TABLE hr_ot_monetary_policy_version IS
    'Released effective company authority for permitted monetary overtime choices.';
COMMENT ON TABLE hr_employee_ot_arrangement IS
    'Effective HR selection within a released company monetary overtime policy.';
COMMENT ON TABLE hr_payroll_ot_evidence IS
    'Immutable per-work-date monetary overtime calculation evidence owned by Payroll results.';

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',18,'compensation_aware_monetary_overtime');
