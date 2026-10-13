DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration
        WHERE module_name = 'hr' AND version = 5
    ) THEN
        RAISE EXCEPTION 'HR payroll localization requires HR migration 5';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration
        WHERE module_name = 'platform' AND version = 3
    ) THEN
        RAISE EXCEPTION 'HR payroll localization requires Platform migration 3';
    END IF;
END $$;

CREATE TABLE hr_work_location_profile (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text GENERATED ALWAYS AS ('company'::text) STORED,
    work_location_id text NOT NULL,
    country_code text NOT NULL,
    jurisdiction_id text NOT NULL,
    address_line_1 text CHECK (address_line_1 IS NULL OR length(address_line_1) BETWEEN 1 AND 200),
    address_line_2 text CHECK (address_line_2 IS NULL OR length(address_line_2) BETWEEN 1 AND 200),
    locality text CHECK (locality IS NULL OR length(locality) BETWEEN 1 AND 120),
    postal_code text CHECK (postal_code IS NULL OR length(postal_code) BETWEEN 1 AND 32),
    effective_from date NOT NULL,
    effective_to date,
    state text NOT NULL CHECK (state IN ('draft', 'approved', 'active', 'superseded')),
    created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 128),
    submitted_by text CHECK (submitted_by IS NULL OR length(submitted_by) BETWEEN 1 AND 128),
    submitted_at timestamptz,
    approved_by text CHECK (approved_by IS NULL OR length(approved_by) BETWEEN 1 AND 128),
    approved_at timestamptz,
    audit_reference text CHECK (audit_reference IS NULL OR length(audit_reference) BETWEEN 1 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, id, company_id),
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, work_location_id)
        REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (country_code, jurisdiction_id)
        REFERENCES jurisdiction (country_code, id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (
        state NOT IN ('approved', 'active', 'superseded')
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
    EXCLUDE USING gist (
        tenant_id WITH =,
        work_location_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    ) WHERE (state IN ('approved', 'active'))
);
CREATE INDEX hr_work_location_profile_effective
    ON hr_work_location_profile (
        tenant_id, company_id, work_location_id, effective_from DESC
    );

CREATE TABLE hr_employee_jurisdiction_override (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text GENERATED ALWAYS AS ('company'::text) STORED,
    employee_id text NOT NULL,
    employee_assignment_id text NOT NULL,
    rule_scope text NOT NULL CHECK (
        rule_scope ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),
    country_code text NOT NULL,
    jurisdiction_id text NOT NULL,
    legal_basis text NOT NULL CHECK (length(btrim(legal_basis)) BETWEEN 1 AND 1000),
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
    evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) BETWEEN 1 AND 500),
    effective_from date NOT NULL,
    effective_to date,
    state text NOT NULL DEFAULT 'draft' CHECK (
        state IN ('draft', 'submitted', 'approved', 'rejected', 'revoked')
    ),
    requested_by text NOT NULL CHECK (length(requested_by) BETWEEN 1 AND 128),
    requested_at timestamptz NOT NULL DEFAULT now(),
    approved_by text CHECK (approved_by IS NULL OR length(approved_by) BETWEEN 1 AND 128),
    approved_at timestamptz,
    rejected_by text CHECK (rejected_by IS NULL OR length(rejected_by) BETWEEN 1 AND 128),
    rejected_at timestamptz,
    revoked_by text CHECK (revoked_by IS NULL OR length(revoked_by) BETWEEN 1 AND 128),
    revoked_at timestamptz,
    audit_reference text CHECK (audit_reference IS NULL OR length(audit_reference) BETWEEN 1 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, id, company_id),
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, employee_id)
        REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, employee_assignment_id)
        REFERENCES employee_assignment (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (country_code, jurisdiction_id)
        REFERENCES jurisdiction (country_code, id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (approved_by IS NULL OR approved_by <> requested_by),
    CHECK (
        state NOT IN ('approved', 'revoked')
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
    CHECK (state <> 'rejected' OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL)),
    CHECK (state <> 'revoked' OR (revoked_by IS NOT NULL AND revoked_at IS NOT NULL)),
    EXCLUDE USING gist (
        tenant_id WITH =,
        employee_id WITH =,
        rule_scope WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    ) WHERE (state = 'approved')
);
CREATE INDEX hr_employee_jurisdiction_override_effective
    ON hr_employee_jurisdiction_override (
        tenant_id, company_id, employee_id, rule_scope, effective_from DESC
    );

CREATE TABLE hr_statutory_rule (
    id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    pack_id text NOT NULL,
    rule_key text NOT NULL CHECK (
        rule_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),
    category text NOT NULL CHECK (
        category ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pack_id, rule_key),
    FOREIGN KEY (pack_id) REFERENCES localization_pack (id) ON DELETE RESTRICT
);

CREATE TABLE hr_statutory_rule_version (
    id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    rule_id text NOT NULL,
    pack_version_id text NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    rule_type text NOT NULL CHECK (
        rule_type IN (
            'parameter_table', 'bracket_table', 'threshold_cap', 'safe_formula',
            'calendar', 'eligibility_condition', 'reporting_definition'
        )
    ),
    applicability_json jsonb NOT NULL CHECK (jsonb_typeof(applicability_json) = 'object'),
    configuration_json jsonb NOT NULL CHECK (jsonb_typeof(configuration_json) = 'object'),
    stacking_operation text NOT NULL CHECK (
        stacking_operation IN (
            'additive', 'replace_explicit', 'minimum_floor', 'maximum_cap', 'independent'
        )
    ),
    source_references_json jsonb NOT NULL CHECK (jsonb_typeof(source_references_json) = 'array'),
    content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    supersedes_rule_version_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rule_id, pack_version_id, effective_from),
    FOREIGN KEY (rule_id) REFERENCES hr_statutory_rule (id) ON DELETE RESTRICT,
    FOREIGN KEY (pack_version_id)
        REFERENCES localization_pack_version (id) ON DELETE RESTRICT,
    FOREIGN KEY (supersedes_rule_version_id)
        REFERENCES hr_statutory_rule_version (id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (supersedes_rule_version_id IS NULL OR supersedes_rule_version_id <> id)
);
CREATE INDEX hr_statutory_rule_version_effective
    ON hr_statutory_rule_version (rule_id, effective_from, effective_to);

CREATE TABLE hr_statutory_rule_test_vector (
    id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    rule_version_id text NOT NULL,
    pack_version_id text NOT NULL,
    scenario_key text NOT NULL CHECK (
        scenario_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),
    vector_kind text NOT NULL CHECK (
        vector_kind IN ('positive', 'boundary', 'non_applicable')
    ),
    canonical_inputs_json jsonb NOT NULL CHECK (jsonb_typeof(canonical_inputs_json) = 'object'),
    expected_outputs_json jsonb NOT NULL CHECK (jsonb_typeof(expected_outputs_json) = 'object'),
    rounding_expectations_json jsonb NOT NULL CHECK (jsonb_typeof(rounding_expectations_json) = 'object'),
    source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 1 AND 500),
    reviewer_id text NOT NULL CHECK (length(reviewer_id) BETWEEN 1 AND 128),
    reviewed_at timestamptz NOT NULL,
    content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rule_version_id, scenario_key),
    FOREIGN KEY (rule_version_id)
        REFERENCES hr_statutory_rule_version (id) ON DELETE RESTRICT,
    FOREIGN KEY (pack_version_id)
        REFERENCES localization_pack_version (id) ON DELETE RESTRICT
);

CREATE TABLE hr_payroll_statutory_snapshot (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    payroll_result_id text NOT NULL,
    resolver_version text NOT NULL CHECK (length(resolver_version) BETWEEN 1 AND 128),
    calculation_engine_version text NOT NULL CHECK (
        length(calculation_engine_version) BETWEEN 1 AND 128
    ),
    context_segments_json jsonb NOT NULL CHECK (
        jsonb_typeof(context_segments_json) = 'array'
        AND jsonb_array_length(context_segments_json) > 0
    ),
    company_legal_profile_id text NOT NULL,
    work_location_evidence_json jsonb NOT NULL CHECK (
        jsonb_typeof(work_location_evidence_json) = 'array'
    ),
    override_evidence_json jsonb NOT NULL CHECK (
        jsonb_typeof(override_evidence_json) = 'array'
    ),
    input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
    resolved_set_hash text NOT NULL CHECK (resolved_set_hash ~ '^[a-f0-9]{64}$'),
    recalculation_mode text NOT NULL CHECK (
        recalculation_mode IN ('original', 'reproduce_original', 'corrected')
    ),
    prior_payroll_result_id text,
    state text NOT NULL DEFAULT 'building' CHECK (state IN ('building', 'sealed')),
    sealed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, id, company_id),
    UNIQUE (tenant_id, payroll_result_id),
    FOREIGN KEY (tenant_id, payroll_result_id, company_id)
        REFERENCES hr_payroll_result (tenant_id, id, company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, prior_payroll_result_id, company_id)
        REFERENCES hr_payroll_result (tenant_id, id, company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, company_legal_profile_id, company_id)
        REFERENCES company_legal_profile (tenant_id, id, company_id) ON DELETE RESTRICT,
    CHECK (
        (state = 'building' AND sealed_at IS NULL)
        OR (state = 'sealed' AND sealed_at IS NOT NULL)
    ),
    CHECK (
        (recalculation_mode = 'corrected' AND prior_payroll_result_id IS NOT NULL)
        OR (recalculation_mode <> 'corrected' AND prior_payroll_result_id IS NULL)
    )
);
CREATE INDEX hr_payroll_statutory_snapshot_result
    ON hr_payroll_statutory_snapshot (tenant_id, company_id, payroll_result_id);

CREATE TABLE hr_payroll_statutory_snapshot_pack (
    tenant_id text NOT NULL,
    snapshot_id text NOT NULL,
    position integer NOT NULL CHECK (position > 0),
    pack_version_id text NOT NULL,
    PRIMARY KEY (tenant_id, snapshot_id, position),
    UNIQUE (tenant_id, snapshot_id, pack_version_id),
    FOREIGN KEY (tenant_id, snapshot_id)
        REFERENCES hr_payroll_statutory_snapshot (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (pack_version_id)
        REFERENCES localization_pack_version (id) ON DELETE RESTRICT
);

CREATE TABLE hr_payroll_statutory_snapshot_rule (
    tenant_id text NOT NULL,
    snapshot_id text NOT NULL,
    position integer NOT NULL CHECK (position > 0),
    rule_version_id text NOT NULL,
    rule_scope text NOT NULL CHECK (
        rule_scope ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),
    stacking_operation text NOT NULL CHECK (
        stacking_operation IN (
            'additive', 'replace_explicit', 'minimum_floor', 'maximum_cap', 'independent'
        )
    ),
    output_evidence_hash text NOT NULL CHECK (output_evidence_hash ~ '^[a-f0-9]{64}$'),
    PRIMARY KEY (tenant_id, snapshot_id, position),
    UNIQUE (tenant_id, snapshot_id, rule_version_id, rule_scope),
    FOREIGN KEY (tenant_id, snapshot_id)
        REFERENCES hr_payroll_statutory_snapshot (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (rule_version_id)
        REFERENCES hr_statutory_rule_version (id) ON DELETE RESTRICT
);

CREATE FUNCTION validate_hr_work_location_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM hr_master_record
        WHERE tenant_id = NEW.tenant_id
          AND id = NEW.work_location_id
          AND company_id = NEW.company_id
          AND master_type = 'work_location'
    ) THEN
        RAISE EXCEPTION 'work-location profile must reference a work-location master in the selected company'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER hr_work_location_profile_valid
BEFORE INSERT OR UPDATE ON hr_work_location_profile
FOR EACH ROW EXECUTE FUNCTION validate_hr_work_location_profile();

CREATE FUNCTION validate_hr_employee_jurisdiction_override()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    assignment_employee text;
    assignment_company text;
    assignment_from date;
    assignment_to date;
BEGIN
    SELECT employee_id, company_id, effective_from, effective_to
    INTO assignment_employee, assignment_company, assignment_from, assignment_to
    FROM employee_assignment
    WHERE tenant_id = NEW.tenant_id AND id = NEW.employee_assignment_id;

    IF assignment_employee IS NULL
       OR assignment_employee <> NEW.employee_id
       OR assignment_company <> NEW.company_id
    THEN
        RAISE EXCEPTION 'jurisdiction override assignment, employee, and company are incompatible'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.effective_from < assignment_from
       OR (
           assignment_to IS NOT NULL
           AND (NEW.effective_to IS NULL OR NEW.effective_to > assignment_to)
       )
    THEN
        RAISE EXCEPTION 'jurisdiction override falls outside the employee assignment'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER hr_employee_jurisdiction_override_valid
BEFORE INSERT OR UPDATE ON hr_employee_jurisdiction_override
FOR EACH ROW EXECUTE FUNCTION validate_hr_employee_jurisdiction_override();

CREATE FUNCTION protect_hr_employee_jurisdiction_override()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.state IN ('approved', 'rejected', 'revoked') THEN
        RAISE EXCEPTION 'reviewed jurisdiction override evidence cannot be deleted'
            USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.state = 'approved' THEN
        IF NEW.state NOT IN ('approved', 'revoked')
           OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.company_id IS DISTINCT FROM OLD.company_id
           OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
           OR NEW.employee_assignment_id IS DISTINCT FROM OLD.employee_assignment_id
           OR NEW.rule_scope IS DISTINCT FROM OLD.rule_scope
           OR NEW.country_code IS DISTINCT FROM OLD.country_code
           OR NEW.jurisdiction_id IS DISTINCT FROM OLD.jurisdiction_id
           OR NEW.legal_basis IS DISTINCT FROM OLD.legal_basis
           OR NEW.reason IS DISTINCT FROM OLD.reason
           OR NEW.evidence_reference IS DISTINCT FROM OLD.evidence_reference
           OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
           OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
           OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
           OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
           OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
           OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
        THEN
            RAISE EXCEPTION 'approved jurisdiction override content is immutable'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.state IN ('rejected', 'revoked') THEN
        RAISE EXCEPTION 'completed jurisdiction override evidence is immutable'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;
CREATE TRIGGER hr_employee_jurisdiction_override_immutable
BEFORE UPDATE OR DELETE ON hr_employee_jurisdiction_override
FOR EACH ROW EXECUTE FUNCTION protect_hr_employee_jurisdiction_override();

CREATE FUNCTION validate_hr_statutory_rule_version()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    rule_pack text;
    version_pack text;
    version_from date;
    version_to date;
    superseded_rule text;
BEGIN
    SELECT pack_id INTO rule_pack FROM hr_statutory_rule WHERE id = NEW.rule_id;
    SELECT pack_id, effective_from, effective_to
    INTO version_pack, version_from, version_to
    FROM localization_pack_version WHERE id = NEW.pack_version_id;
    IF rule_pack IS NULL OR version_pack IS NULL OR rule_pack <> version_pack THEN
        RAISE EXCEPTION 'statutory rule and localization pack version are incompatible'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.effective_from < version_from
       OR (version_to IS NOT NULL AND (NEW.effective_to IS NULL OR NEW.effective_to > version_to))
    THEN
        RAISE EXCEPTION 'statutory rule version falls outside the localization pack version'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.supersedes_rule_version_id IS NOT NULL THEN
        SELECT rule_id INTO superseded_rule
        FROM hr_statutory_rule_version
        WHERE id = NEW.supersedes_rule_version_id;
        IF superseded_rule IS NULL OR superseded_rule <> NEW.rule_id THEN
            RAISE EXCEPTION 'a statutory rule version can supersede only the same rule'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER hr_statutory_rule_version_valid
BEFORE INSERT OR UPDATE ON hr_statutory_rule_version
FOR EACH ROW EXECUTE FUNCTION validate_hr_statutory_rule_version();

CREATE FUNCTION validate_hr_statutory_rule_test_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    version_pack text;
BEGIN
    SELECT pack_version_id INTO version_pack
    FROM hr_statutory_rule_version
    WHERE id = NEW.rule_version_id;
    IF version_pack IS NULL OR version_pack <> NEW.pack_version_id THEN
        RAISE EXCEPTION 'statutory rule test vector pack version is incompatible'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER hr_statutory_rule_test_vector_valid
BEFORE INSERT OR UPDATE ON hr_statutory_rule_test_vector
FOR EACH ROW EXECUTE FUNCTION validate_hr_statutory_rule_test_vector();

CREATE FUNCTION protect_hr_statutory_rule_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM hr_statutory_rule_version rv
        JOIN localization_pack_version pv ON pv.id = rv.pack_version_id
        WHERE rv.rule_id = OLD.id
          AND pv.status IN ('approved', 'active', 'superseded', 'retired')
    ) THEN
        RAISE EXCEPTION 'approved statutory rule identity is immutable'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;
CREATE TRIGGER hr_statutory_rule_identity_immutable
BEFORE UPDATE OR DELETE ON hr_statutory_rule
FOR EACH ROW EXECUTE FUNCTION protect_hr_statutory_rule_identity();

CREATE FUNCTION protect_hr_statutory_rule_version()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    pack_status text;
BEGIN
    SELECT status INTO pack_status
    FROM localization_pack_version
    WHERE id = OLD.pack_version_id;
    IF pack_status IN ('approved', 'active', 'superseded', 'retired') THEN
        RAISE EXCEPTION 'approved statutory rule versions are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;
CREATE TRIGGER hr_statutory_rule_version_immutable
BEFORE UPDATE OR DELETE ON hr_statutory_rule_version
FOR EACH ROW EXECUTE FUNCTION protect_hr_statutory_rule_version();

CREATE FUNCTION protect_hr_statutory_rule_test_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    pack_status text;
BEGIN
    SELECT status INTO pack_status
    FROM localization_pack_version
    WHERE id = OLD.pack_version_id;
    IF pack_status IN ('approved', 'active', 'superseded', 'retired') THEN
        RAISE EXCEPTION 'approved statutory rule test vectors are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;
CREATE TRIGGER hr_statutory_rule_test_vector_immutable
BEFORE UPDATE OR DELETE ON hr_statutory_rule_test_vector
FOR EACH ROW EXECUTE FUNCTION protect_hr_statutory_rule_test_vector();

CREATE TRIGGER hr_statutory_rule_publisher_managed
BEFORE INSERT OR UPDATE OR DELETE ON hr_statutory_rule
FOR EACH ROW EXECUTE FUNCTION reject_localization_catalog_mutation();
CREATE TRIGGER hr_statutory_rule_version_publisher_managed
BEFORE INSERT OR UPDATE OR DELETE ON hr_statutory_rule_version
FOR EACH ROW EXECUTE FUNCTION reject_localization_catalog_mutation();
CREATE TRIGGER hr_statutory_rule_test_vector_publisher_managed
BEFORE INSERT OR UPDATE OR DELETE ON hr_statutory_rule_test_vector
FOR EACH ROW EXECUTE FUNCTION reject_localization_catalog_mutation();

CREATE FUNCTION validate_hr_payroll_snapshot_pack_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    pack_status text;
BEGIN
    SELECT status INTO pack_status
    FROM localization_pack_version
    WHERE id = NEW.pack_version_id;
    IF pack_status NOT IN ('approved', 'active', 'superseded', 'retired') THEN
        RAISE EXCEPTION 'payroll statutory snapshot requires an approved pack version'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER hr_payroll_snapshot_pack_reference_valid
BEFORE INSERT ON hr_payroll_statutory_snapshot_pack
FOR EACH ROW EXECUTE FUNCTION validate_hr_payroll_snapshot_pack_reference();

CREATE FUNCTION validate_hr_payroll_snapshot_rule_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    referenced_pack_version text;
    referenced_stacking_operation text;
BEGIN
    SELECT pack_version_id, stacking_operation
    INTO referenced_pack_version, referenced_stacking_operation
    FROM hr_statutory_rule_version
    WHERE id = NEW.rule_version_id;
    IF referenced_pack_version IS NULL OR NOT EXISTS (
        SELECT 1 FROM hr_payroll_statutory_snapshot_pack
        WHERE tenant_id = NEW.tenant_id
          AND snapshot_id = NEW.snapshot_id
          AND pack_version_id = referenced_pack_version
    ) THEN
        RAISE EXCEPTION 'snapshot rule reference requires its pack version in the snapshot'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.stacking_operation <> referenced_stacking_operation THEN
        RAISE EXCEPTION 'snapshot rule stacking operation must match the immutable rule version'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER hr_payroll_snapshot_rule_reference_valid
BEFORE INSERT ON hr_payroll_statutory_snapshot_rule
FOR EACH ROW EXECUTE FUNCTION validate_hr_payroll_snapshot_rule_reference();

CREATE FUNCTION protect_hr_payroll_statutory_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'payroll statutory snapshots are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    IF OLD.state <> 'building'
       OR NEW.state <> 'sealed'
       OR NEW.sealed_at IS NULL
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.payroll_result_id IS DISTINCT FROM OLD.payroll_result_id
       OR NEW.resolver_version IS DISTINCT FROM OLD.resolver_version
       OR NEW.calculation_engine_version IS DISTINCT FROM OLD.calculation_engine_version
       OR NEW.context_segments_json IS DISTINCT FROM OLD.context_segments_json
       OR NEW.company_legal_profile_id IS DISTINCT FROM OLD.company_legal_profile_id
       OR NEW.work_location_evidence_json IS DISTINCT FROM OLD.work_location_evidence_json
       OR NEW.override_evidence_json IS DISTINCT FROM OLD.override_evidence_json
       OR NEW.input_hash IS DISTINCT FROM OLD.input_hash
       OR NEW.resolved_set_hash IS DISTINCT FROM OLD.resolved_set_hash
       OR NEW.recalculation_mode IS DISTINCT FROM OLD.recalculation_mode
       OR NEW.prior_payroll_result_id IS DISTINCT FROM OLD.prior_payroll_result_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'payroll statutory snapshots are immutable except for initial sealing'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER hr_payroll_statutory_snapshot_immutable
BEFORE UPDATE OR DELETE ON hr_payroll_statutory_snapshot
FOR EACH ROW EXECUTE FUNCTION protect_hr_payroll_statutory_snapshot();

CREATE FUNCTION protect_hr_payroll_statutory_snapshot_child()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    snapshot_state text;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'payroll statutory snapshot references are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    SELECT state INTO snapshot_state
    FROM hr_payroll_statutory_snapshot
    WHERE tenant_id = NEW.tenant_id AND id = NEW.snapshot_id;
    IF snapshot_state <> 'building' THEN
        RAISE EXCEPTION 'payroll statutory snapshot references can be added only before sealing'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER hr_payroll_statutory_snapshot_pack_immutable
BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_statutory_snapshot_pack
FOR EACH ROW EXECUTE FUNCTION protect_hr_payroll_statutory_snapshot_child();
CREATE TRIGGER hr_payroll_statutory_snapshot_rule_immutable
BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_statutory_snapshot_rule
FOR EACH ROW EXECUTE FUNCTION protect_hr_payroll_statutory_snapshot_child();

CREATE FUNCTION validate_hr_payroll_statutory_snapshot_sealed()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    current_state text;
    pack_count integer;
    pack_min integer;
    pack_max integer;
    rule_count integer;
    rule_min integer;
    rule_max integer;
BEGIN
    SELECT state INTO current_state
    FROM hr_payroll_statutory_snapshot
    WHERE tenant_id = NEW.tenant_id AND id = NEW.id;
    IF current_state <> 'sealed' THEN
        RAISE EXCEPTION 'payroll statutory snapshot must be sealed before commit'
            USING ERRCODE = '23514';
    END IF;
    SELECT count(*), min(position), max(position)
    INTO pack_count, pack_min, pack_max
    FROM hr_payroll_statutory_snapshot_pack
    WHERE tenant_id = NEW.tenant_id AND snapshot_id = NEW.id;
    IF pack_count = 0 OR pack_min <> 1 OR pack_max <> pack_count THEN
        RAISE EXCEPTION 'payroll statutory snapshot pack references must be contiguous and non-empty'
            USING ERRCODE = '23514';
    END IF;
    SELECT count(*), min(position), max(position)
    INTO rule_count, rule_min, rule_max
    FROM hr_payroll_statutory_snapshot_rule
    WHERE tenant_id = NEW.tenant_id AND snapshot_id = NEW.id;
    IF rule_count > 0 AND (rule_min <> 1 OR rule_max <> rule_count) THEN
        RAISE EXCEPTION 'payroll statutory snapshot rule references must be contiguous'
            USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END
$function$;
CREATE CONSTRAINT TRIGGER hr_payroll_statutory_snapshot_sealed
AFTER INSERT OR UPDATE ON hr_payroll_statutory_snapshot
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_hr_payroll_statutory_snapshot_sealed();

DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'hr_work_location_profile',
        'hr_employee_jurisdiction_override',
        'hr_payroll_statutory_snapshot',
        'hr_payroll_statutory_snapshot_pack',
        'hr_payroll_statutory_snapshot_rule'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''nexora.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''nexora.tenant_id'', true))',
            table_name || '_tenant_isolation', table_name
        );
    END LOOP;
END $$;

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 6, 'payroll_localization');
