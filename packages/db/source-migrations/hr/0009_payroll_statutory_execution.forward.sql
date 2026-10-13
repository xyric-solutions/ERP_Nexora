ALTER TABLE hr_statutory_rule_version
    ADD COLUMN output_definition_json jsonb;
ALTER TABLE hr_statutory_rule_version
    ADD CONSTRAINT hr_statutory_rule_version_output_definition_object CHECK (
        output_definition_json IS NULL OR jsonb_typeof(output_definition_json) = 'object'
    );

CREATE OR REPLACE FUNCTION protect_hr_statutory_rule_version()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    old_pack_status text;
    new_pack_status text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF EXISTS (
            SELECT 1 FROM localization_import_release
            WHERE pack_version_id = NEW.pack_version_id
        ) THEN
            RAISE EXCEPTION 'released statutory rule versions are immutable'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;
    SELECT status INTO old_pack_status
    FROM localization_pack_version WHERE id = OLD.pack_version_id;
    IF TG_OP = 'UPDATE' THEN
        SELECT status INTO new_pack_status
        FROM localization_pack_version WHERE id = NEW.pack_version_id;
    END IF;
    IF old_pack_status IN ('approved', 'active', 'superseded', 'retired')
       OR new_pack_status IN ('approved', 'active', 'superseded', 'retired')
    THEN
        RAISE EXCEPTION 'approved statutory rule versions are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;
DROP TRIGGER hr_statutory_rule_version_immutable ON hr_statutory_rule_version;
CREATE TRIGGER hr_statutory_rule_version_immutable
BEFORE INSERT OR UPDATE OR DELETE ON hr_statutory_rule_version
FOR EACH ROW EXECUTE FUNCTION protect_hr_statutory_rule_version();

CREATE OR REPLACE FUNCTION protect_hr_statutory_rule_test_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    old_pack_status text;
    new_pack_status text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF EXISTS (
            SELECT 1 FROM localization_import_release
            WHERE pack_version_id = NEW.pack_version_id
        ) THEN
            RAISE EXCEPTION 'released statutory rule test vectors are immutable'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;
    SELECT status INTO old_pack_status
    FROM localization_pack_version WHERE id = OLD.pack_version_id;
    IF TG_OP = 'UPDATE' THEN
        SELECT status INTO new_pack_status
        FROM localization_pack_version WHERE id = NEW.pack_version_id;
    END IF;
    IF old_pack_status IN ('approved', 'active', 'superseded', 'retired')
       OR new_pack_status IN ('approved', 'active', 'superseded', 'retired')
    THEN
        RAISE EXCEPTION 'approved statutory rule test vectors are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;
DROP TRIGGER hr_statutory_rule_test_vector_immutable ON hr_statutory_rule_test_vector;
CREATE TRIGGER hr_statutory_rule_test_vector_immutable
BEFORE INSERT OR UPDATE OR DELETE ON hr_statutory_rule_test_vector
FOR EACH ROW EXECUTE FUNCTION protect_hr_statutory_rule_test_vector();

ALTER TABLE hr_pay_component DROP CONSTRAINT hr_pay_component_kind_check;
ALTER TABLE hr_pay_component ADD CONSTRAINT hr_pay_component_kind_check
    CHECK (kind IN ('earning','deduction','employer_contribution'));
ALTER TABLE hr_pay_component DROP CONSTRAINT hr_pay_component_check1;
ALTER TABLE hr_pay_component ADD CONSTRAINT hr_pay_component_account_check CHECK (
    (kind='earning' AND expense_account_id IS NOT NULL)
    OR (kind='deduction' AND liability_account_id IS NOT NULL)
    OR (kind='employer_contribution' AND expense_account_id IS NOT NULL AND liability_account_id IS NOT NULL)
);

ALTER TABLE hr_payroll_result
    ADD COLUMN employer_contributions numeric(20,4) NOT NULL DEFAULT 0
    CHECK (employer_contributions >= 0);

ALTER TABLE hr_payroll_result_item DROP CONSTRAINT hr_payroll_result_item_kind_check;
ALTER TABLE hr_payroll_result_item ADD CONSTRAINT hr_payroll_result_item_kind_check
    CHECK (kind IN ('earning','deduction','employer_contribution'));

ALTER TABLE hr_payroll_statutory_snapshot
    ADD COLUMN source_snapshot_id text,
    ADD COLUMN correction_reason text;
ALTER TABLE hr_payroll_statutory_snapshot
    ADD CONSTRAINT hr_payroll_statutory_snapshot_source_fk
        FOREIGN KEY (tenant_id, source_snapshot_id, company_id)
        REFERENCES hr_payroll_statutory_snapshot (tenant_id, id, company_id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT hr_payroll_statutory_snapshot_recalculation_evidence CHECK (
        (recalculation_mode = 'original'
            AND source_snapshot_id IS NULL AND correction_reason IS NULL)
        OR (recalculation_mode = 'reproduce_original'
            AND source_snapshot_id IS NOT NULL AND correction_reason IS NULL)
        OR (recalculation_mode = 'corrected'
            AND source_snapshot_id IS NOT NULL
            AND length(btrim(correction_reason)) BETWEEN 1 AND 1000)
    );

CREATE TABLE hr_payroll_statutory_snapshot_line (
    tenant_id text NOT NULL,
    snapshot_id text NOT NULL,
    position integer NOT NULL CHECK (position > 0),
    rule_version_id text NOT NULL,
    line_code text NOT NULL CHECK (line_code ~ '^[A-Za-z][A-Za-z0-9_]{0,79}$'),
    line_name text NOT NULL CHECK (length(btrim(line_name)) BETWEEN 1 AND 200),
    line_kind text NOT NULL CHECK (
        line_kind IN ('earning','deduction','employer_contribution','informational')
    ),
    component_code text,
    applicable boolean NOT NULL,
    employee_amount numeric(20,4) NOT NULL CHECK (employee_amount >= 0),
    employer_amount numeric(20,4) NOT NULL CHECK (employer_amount >= 0),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    input_evidence_hash text NOT NULL CHECK (input_evidence_hash ~ '^[a-f0-9]{64}$'),
    output_evidence_hash text NOT NULL CHECK (output_evidence_hash ~ '^[a-f0-9]{64}$'),
    PRIMARY KEY (tenant_id, snapshot_id, position),
    UNIQUE (tenant_id, snapshot_id, rule_version_id, line_code),
    FOREIGN KEY (tenant_id, snapshot_id)
        REFERENCES hr_payroll_statutory_snapshot (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (rule_version_id)
        REFERENCES hr_statutory_rule_version (id) ON DELETE RESTRICT,
    CHECK (
        (line_kind = 'informational' AND component_code IS NULL
            AND employee_amount = 0 AND employer_amount = 0)
        OR (line_kind IN ('earning','deduction') AND component_code IS NOT NULL
            AND employer_amount = 0)
        OR (line_kind = 'employer_contribution' AND component_code IS NOT NULL
            AND employee_amount = 0)
    ),
    CHECK (applicable OR (employee_amount = 0 AND employer_amount = 0))
);

CREATE FUNCTION validate_hr_payroll_statutory_snapshot_line_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    referenced_output_hash text;
BEGIN
    SELECT output_evidence_hash INTO referenced_output_hash
    FROM hr_payroll_statutory_snapshot_rule
    WHERE tenant_id = NEW.tenant_id
      AND snapshot_id = NEW.snapshot_id
      AND rule_version_id = NEW.rule_version_id;
    IF referenced_output_hash IS NULL
       OR referenced_output_hash <> NEW.output_evidence_hash
    THEN
        RAISE EXCEPTION 'snapshot line must match its exact rule and output evidence'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER hr_payroll_statutory_snapshot_line_reference_valid
BEFORE INSERT ON hr_payroll_statutory_snapshot_line
FOR EACH ROW EXECUTE FUNCTION validate_hr_payroll_statutory_snapshot_line_reference();

CREATE TRIGGER hr_payroll_statutory_snapshot_line_immutable
BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_statutory_snapshot_line
FOR EACH ROW EXECUTE FUNCTION protect_hr_payroll_statutory_snapshot_child();

ALTER TABLE hr_payroll_statutory_snapshot_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_statutory_snapshot_line FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_payroll_statutory_snapshot_line_tenant_isolation
ON hr_payroll_statutory_snapshot_line
USING (tenant_id = current_setting('nexora.tenant_id', true))
WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

CREATE OR REPLACE FUNCTION protect_hr_payroll_statutory_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'payroll statutory snapshots are immutable' USING ERRCODE = 'P0001';
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
       OR NEW.source_snapshot_id IS DISTINCT FROM OLD.source_snapshot_id
       OR NEW.correction_reason IS DISTINCT FROM OLD.correction_reason
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'payroll statutory snapshots are immutable except for initial sealing'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION validate_hr_payroll_statutory_snapshot_sealed()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    current_state text;
    pack_count integer; pack_min integer; pack_max integer;
    rule_count integer; rule_min integer; rule_max integer;
    line_count integer; line_min integer; line_max integer;
BEGIN
    SELECT state INTO current_state FROM hr_payroll_statutory_snapshot
    WHERE tenant_id = NEW.tenant_id AND id = NEW.id;
    IF current_state <> 'sealed' THEN
        RAISE EXCEPTION 'payroll statutory snapshot must be sealed before commit' USING ERRCODE = '23514';
    END IF;
    SELECT count(*),min(position),max(position) INTO pack_count,pack_min,pack_max
    FROM hr_payroll_statutory_snapshot_pack
    WHERE tenant_id=NEW.tenant_id AND snapshot_id=NEW.id;
    IF pack_count=0 OR pack_min<>1 OR pack_max<>pack_count THEN
        RAISE EXCEPTION 'payroll statutory snapshot pack references must be contiguous and non-empty' USING ERRCODE='23514';
    END IF;
    SELECT count(*),min(position),max(position) INTO rule_count,rule_min,rule_max
    FROM hr_payroll_statutory_snapshot_rule
    WHERE tenant_id=NEW.tenant_id AND snapshot_id=NEW.id;
    IF rule_count=0 OR rule_min<>1 OR rule_max<>rule_count THEN
        RAISE EXCEPTION 'payroll statutory snapshot rule references must be contiguous and non-empty' USING ERRCODE='23514';
    END IF;
    SELECT count(*),min(position),max(position) INTO line_count,line_min,line_max
    FROM hr_payroll_statutory_snapshot_line
    WHERE tenant_id=NEW.tenant_id AND snapshot_id=NEW.id;
    IF line_count>0 AND (line_count<>rule_count OR line_min<>1 OR line_max<>line_count) THEN
        RAISE EXCEPTION 'payroll statutory snapshot lines must match rules and be contiguous' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
END
$function$;

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 9, 'payroll_statutory_execution');
