DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration WHERE module_name='hr' AND version=16
    ) THEN
        RAISE EXCEPTION 'leave production completeness requires HR migration 16';
    END IF;
END $$;

CREATE TABLE hr_leave_policy_version (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    leave_type_id text NOT NULL,
    version_number integer NOT NULL CHECK (version_number > 0),
    effective_from date NOT NULL,
    effective_to date,
    annual_entitlement_days numeric(8,4) NOT NULL CHECK (annual_entitlement_days >= 0),
    accrual_method text NOT NULL CHECK (accrual_method IN ('annual_grant','monthly_accrual','on_completion')),
    accrual_timing text CHECK (accrual_timing IN ('period_start','period_end')),
    partial_period_rule text CHECK (partial_period_rule IN ('full_entitlement','prorate_calendar_days')),
    cycle_start_month smallint CHECK (cycle_start_month BETWEEN 1 AND 12),
    cycle_start_day smallint CHECK (cycle_start_day BETWEEN 1 AND 28),
    carry_forward boolean NOT NULL DEFAULT false,
    maximum_carry_forward_days numeric(8,4) NOT NULL DEFAULT 0 CHECK (maximum_carry_forward_days >= 0),
    maximum_balance_days numeric(8,4) NOT NULL DEFAULT 0 CHECK (maximum_balance_days >= 0),
    minimum_request_days numeric(8,4) NOT NULL CHECK (minimum_request_days > 0),
    maximum_request_days numeric(8,4) NOT NULL CHECK (maximum_request_days >= minimum_request_days),
    requires_hr_approval boolean NOT NULL DEFAULT false,
    applicable_category_ids text[] NOT NULL DEFAULT '{}',
    applicable_genders text[] NOT NULL DEFAULT '{}',
    document_required_after_days numeric(8,4),
    automation_ready boolean NOT NULL DEFAULT false,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,leave_type_id,version_number),
    FOREIGN KEY (tenant_id,leave_type_id) REFERENCES hr_leave_type (tenant_id,id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK ((carry_forward AND maximum_carry_forward_days > 0 AND maximum_carry_forward_days <= maximum_balance_days)
        OR (NOT carry_forward AND maximum_carry_forward_days = 0)),
    CHECK (document_required_after_days IS NULL OR document_required_after_days >= 0),
    CHECK (NOT automation_ready OR (
        accrual_timing IS NOT NULL AND partial_period_rule IS NOT NULL
        AND cycle_start_month IS NOT NULL AND cycle_start_day IS NOT NULL
    )),
    EXCLUDE USING gist (
        tenant_id WITH =,
        leave_type_id WITH =,
        daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') WITH &&
    )
);
CREATE INDEX idx_hr_leave_policy_effective
    ON hr_leave_policy_version (tenant_id,company_id,leave_type_id,effective_from,effective_to);

INSERT INTO hr_leave_policy_version (
    id,tenant_id,company_id,leave_type_id,version_number,effective_from,
    annual_entitlement_days,accrual_method,carry_forward,maximum_carry_forward_days,
    maximum_balance_days,minimum_request_days,maximum_request_days,requires_hr_approval,
    applicable_category_ids,applicable_genders,document_required_after_days,automation_ready,created_by,created_at
)
SELECT id || ':policy:1',tenant_id,company_id,id,1,'0001-01-01'::date,
       annual_entitlement_days,accrual_method,carry_forward,maximum_carry_forward_days,
       maximum_balance_days,minimum_request_days,maximum_request_days,requires_hr_approval,
       applicable_category_ids,applicable_genders,document_required_after_days,false,created_by,created_at
  FROM hr_leave_type;

CREATE TABLE hr_leave_request_day (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    request_id text NOT NULL,
    employee_id text NOT NULL,
    leave_type_id text NOT NULL,
    policy_version_id text NOT NULL,
    leave_date date NOT NULL,
    days numeric(5,4) NOT NULL CHECK (days > 0 AND days <= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,request_id,leave_date),
    FOREIGN KEY (tenant_id,request_id) REFERENCES hr_leave_request (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,employee_id) REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,leave_type_id) REFERENCES hr_leave_type (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,policy_version_id) REFERENCES hr_leave_policy_version (tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX idx_hr_leave_request_day_employee
    ON hr_leave_request_day (tenant_id,company_id,employee_id,leave_date);

INSERT INTO hr_leave_request_day (
    id,tenant_id,company_id,request_id,employee_id,leave_type_id,policy_version_id,leave_date,days
)
SELECT r.id || ':day:' || to_char(d.leave_date,'YYYYMMDD'),r.tenant_id,r.company_id,r.id,
       r.employee_id,r.leave_type_id,p.id,d.leave_date,1
  FROM hr_leave_request r
 CROSS JOIN LATERAL generate_series(r.from_date,r.to_date,interval '1 day') AS d(leave_date)
  JOIN hr_leave_policy_version p ON p.tenant_id=r.tenant_id AND p.leave_type_id=r.leave_type_id
 WHERE r.requested_days=(r.to_date-r.from_date+1);

ALTER TABLE hr_leave_transaction
    ADD COLUMN policy_version_id text,
    ADD COLUMN period_start date,
    ADD COLUMN period_end date,
    ADD COLUMN evidence_hash text,
    ADD COLUMN evidence_json jsonb,
    ADD CONSTRAINT hr_leave_transaction_policy_version_fk
        FOREIGN KEY (tenant_id,policy_version_id)
        REFERENCES hr_leave_policy_version (tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT hr_leave_transaction_period_pair CHECK (
        (period_start IS NULL AND period_end IS NULL)
        OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_end >= period_start)
    ),
    ADD CONSTRAINT hr_leave_transaction_evidence_pair CHECK (
        (evidence_hash IS NULL AND evidence_json IS NULL)
        OR (evidence_hash ~ '^[0-9a-f]{64}$' AND jsonb_typeof(evidence_json)='object')
    );

ALTER TABLE hr_payroll_input
    DROP CONSTRAINT hr_payroll_input_evidence_version_check,
    DROP CONSTRAINT hr_payroll_input_evidence_shape,
    ADD CONSTRAINT hr_payroll_input_evidence_version_check
        CHECK (evidence_version IN ('legacy_summary_v1','attendance_leave_overtime_v2','attendance_leave_overtime_v3')),
    ADD CONSTRAINT hr_payroll_input_evidence_shape CHECK (
        (evidence_version='legacy_summary_v1' AND jsonb_array_length(source_snapshot_json)=0)
        OR
        (evidence_version IN ('attendance_leave_overtime_v2','attendance_leave_overtime_v3')
         AND jsonb_array_length(source_snapshot_json)::numeric=calendar_days)
    );

CREATE FUNCTION validate_leave_policy_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM hr_leave_type t
         WHERE t.tenant_id=NEW.tenant_id AND t.id=NEW.leave_type_id
           AND t.company_id=NEW.company_id
    ) THEN
        RAISE EXCEPTION 'leave policy type is unavailable in the selected company';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_leave_policy_scope BEFORE INSERT ON hr_leave_policy_version
FOR EACH ROW EXECUTE FUNCTION validate_leave_policy_scope();

CREATE FUNCTION validate_leave_request_day_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request_row hr_leave_request%ROWTYPE;
DECLARE policy_row hr_leave_policy_version%ROWTYPE;
BEGIN
    SELECT * INTO request_row FROM hr_leave_request
     WHERE tenant_id=NEW.tenant_id AND id=NEW.request_id;
    SELECT * INTO policy_row FROM hr_leave_policy_version
     WHERE tenant_id=NEW.tenant_id AND id=NEW.policy_version_id;
    IF request_row.id IS NULL OR policy_row.id IS NULL
       OR request_row.company_id IS DISTINCT FROM NEW.company_id
       OR request_row.employee_id IS DISTINCT FROM NEW.employee_id
       OR request_row.leave_type_id IS DISTINCT FROM NEW.leave_type_id
       OR NEW.leave_date < request_row.from_date OR NEW.leave_date > request_row.to_date
       OR policy_row.company_id IS DISTINCT FROM NEW.company_id
       OR policy_row.leave_type_id IS DISTINCT FROM NEW.leave_type_id
       OR NEW.leave_date < policy_row.effective_from
       OR (policy_row.effective_to IS NOT NULL AND NEW.leave_date > policy_row.effective_to) THEN
        RAISE EXCEPTION 'leave request day does not match its request and effective policy';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_leave_request_day_scope BEFORE INSERT ON hr_leave_request_day
FOR EACH ROW EXECUTE FUNCTION validate_leave_request_day_scope();

CREATE FUNCTION protect_leave_policy_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'leave policy versions are immutable';
    END IF;
    IF OLD.effective_to IS NOT NULL OR NEW.effective_to IS NULL OR NEW.effective_to < OLD.effective_from
       OR (to_jsonb(NEW)-'effective_to'-'created_at') IS DISTINCT FROM (to_jsonb(OLD)-'effective_to'-'created_at') THEN
        RAISE EXCEPTION 'only the open leave policy end date may be closed';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_leave_policy_immutable BEFORE UPDATE OR DELETE ON hr_leave_policy_version
FOR EACH ROW EXECUTE FUNCTION protect_leave_policy_version();
CREATE TRIGGER hr_leave_request_day_immutable BEFORE UPDATE OR DELETE ON hr_leave_request_day
FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();

ALTER TABLE hr_leave_policy_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_leave_policy_version FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_leave_policy_version_tenant_isolation ON hr_leave_policy_version
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

ALTER TABLE hr_leave_request_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_leave_request_day FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_leave_request_day_tenant_isolation ON hr_leave_request_day
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

COMMENT ON TABLE hr_leave_policy_version IS
    'Immutable effective-dated policy authority for an existing leave type; hr_leave_type policy columns remain a current compatibility projection.';
COMMENT ON TABLE hr_leave_request_day IS
    'Immutable per-date allocation evidence owned by the existing leave request authority and consumed by Attendance/Payroll.';

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',17,'leave_production_completeness');
