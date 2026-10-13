DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration
         WHERE module_name = 'hr' AND version = 1
    ) THEN
        RAISE EXCEPTION 'HR attendance and leave requires HR migration 1';
    END IF;
END $$;

CREATE TABLE hr_shift (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type = 'company'),
    code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,31}$'),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    kind text NOT NULL CHECK (kind IN ('fixed','multiple','night','rotating','flexible')),
    start_minute smallint NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
    end_minute smallint NOT NULL CHECK (end_minute BETWEEN 1 AND 2879 AND end_minute > start_minute),
    grace_in_minutes smallint NOT NULL DEFAULT 0 CHECK (grace_in_minutes BETWEEN 0 AND 720),
    grace_out_minutes smallint NOT NULL DEFAULT 0 CHECK (grace_out_minutes BETWEEN 0 AND 720),
    half_day_minutes smallint NOT NULL CHECK (half_day_minutes BETWEEN 1 AND 1439),
    minimum_present_minutes smallint NOT NULL CHECK (minimum_present_minutes BETWEEN 1 AND half_day_minutes),
    overtime_after_minutes smallint NOT NULL DEFAULT 0 CHECK (overtime_after_minutes BETWEEN 0 AND 720),
    weekly_off_days smallint[] NOT NULL DEFAULT '{}' CHECK (
        weekly_off_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
    ),
    flexible boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, company_id, code),
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    CHECK ((kind = 'flexible') = flexible OR (kind <> 'flexible' AND NOT flexible))
);
CREATE INDEX idx_hr_shift_company_status ON hr_shift (tenant_id, company_id, status, code);

CREATE TABLE hr_shift_break (
    id text NOT NULL,
    tenant_id text NOT NULL,
    shift_id text NOT NULL,
    label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
    minutes smallint NOT NULL CHECK (minutes BETWEEN 1 AND 720),
    paid boolean NOT NULL DEFAULT false,
    position smallint NOT NULL CHECK (position BETWEEN 1 AND 32),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, shift_id, position),
    FOREIGN KEY (tenant_id, shift_id) REFERENCES hr_shift (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE hr_shift_rotation (
    tenant_id text NOT NULL,
    shift_id text NOT NULL,
    position smallint NOT NULL CHECK (position BETWEEN 1 AND 52),
    rotation_shift_id text NOT NULL,
    PRIMARY KEY (tenant_id, shift_id, position),
    FOREIGN KEY (tenant_id, shift_id) REFERENCES hr_shift (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, rotation_shift_id) REFERENCES hr_shift (tenant_id, id) ON DELETE RESTRICT,
    CHECK (shift_id <> rotation_shift_id)
);

CREATE TABLE hr_shift_assignment (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    scope text NOT NULL CHECK (scope IN ('employee','department','branch')),
    scope_id text NOT NULL,
    shift_id text NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, company_id, scope, scope_id, effective_from),
    FOREIGN KEY (tenant_id, shift_id) REFERENCES hr_shift (tenant_id, id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    EXCLUDE USING gist (
        tenant_id WITH =, company_id WITH =, scope WITH =, scope_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    )
);
CREATE INDEX idx_hr_shift_assignment_resolve
    ON hr_shift_assignment (tenant_id, company_id, scope, scope_id, effective_from DESC);

CREATE TABLE hr_holiday (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    branch_id text,
    holiday_date date NOT NULL,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    optional boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE NULLS NOT DISTINCT (tenant_id, company_id, branch_id, holiday_date),
    FOREIGN KEY (tenant_id, company_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, branch_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_hr_holiday_lookup ON hr_holiday (tenant_id, company_id, holiday_date, branch_id);

CREATE TABLE hr_attendance_punch (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    employee_id text NOT NULL,
    work_date date NOT NULL,
    occurred_at timestamptz NOT NULL,
    direction text NOT NULL CHECK (direction IN ('in','out')),
    source text NOT NULL CHECK (source IN ('biometric','mobile','web','imported')),
    source_reference text NOT NULL CHECK (char_length(btrim(source_reference)) BETWEEN 1 AND 200),
    captured_by text NOT NULL,
    captured_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, company_id, source, source_reference),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_hr_attendance_punch_employee_date
    ON hr_attendance_punch (tenant_id, company_id, employee_id, work_date, occurred_at);

CREATE TABLE hr_leave_type (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type = 'company'),
    code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,31}$'),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    paid boolean NOT NULL,
    annual_entitlement_days numeric(8,4) NOT NULL DEFAULT 0 CHECK (annual_entitlement_days >= 0),
    accrual_method text NOT NULL CHECK (accrual_method IN ('annual_grant','monthly_accrual','on_completion')),
    carry_forward boolean NOT NULL DEFAULT false,
    maximum_carry_forward_days numeric(8,4) NOT NULL DEFAULT 0 CHECK (maximum_carry_forward_days >= 0),
    maximum_balance_days numeric(8,4) NOT NULL DEFAULT 0 CHECK (maximum_balance_days >= 0),
    minimum_request_days numeric(8,4) NOT NULL CHECK (minimum_request_days > 0),
    maximum_request_days numeric(8,4) NOT NULL CHECK (maximum_request_days >= minimum_request_days),
    requires_hr_approval boolean NOT NULL DEFAULT false,
    applicable_category_ids text[] NOT NULL DEFAULT '{}',
    applicable_genders text[] NOT NULL DEFAULT '{}',
    document_required_after_days numeric(8,4),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, company_id, code),
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    CHECK ((carry_forward AND maximum_carry_forward_days > 0 AND maximum_carry_forward_days <= maximum_balance_days)
        OR (NOT carry_forward AND maximum_carry_forward_days = 0)),
    CHECK (paid OR (annual_entitlement_days = 0 AND requires_hr_approval)),
    CHECK (document_required_after_days IS NULL OR document_required_after_days >= 0)
);

CREATE TABLE hr_leave_request (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    employee_id text NOT NULL,
    leave_type_id text NOT NULL,
    document_id text,
    from_date date NOT NULL,
    to_date date NOT NULL,
    requested_days numeric(8,4) NOT NULL CHECK (requested_days > 0),
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft','pending_manager','pending_hr','approved','rejected','cancelled'
    )),
    requested_by text NOT NULL,
    submitted_by text,
    manager_decided_by text,
    manager_decided_at timestamptz,
    hr_decided_by text,
    hr_decided_at timestamptz,
    decision_comment text NOT NULL DEFAULT '' CHECK (char_length(decision_comment) <= 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, leave_type_id) REFERENCES hr_leave_type (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, document_id) REFERENCES employee_document (tenant_id, id) ON DELETE RESTRICT,
    CHECK (to_date >= from_date),
    CHECK ((manager_decided_by IS NULL) = (manager_decided_at IS NULL)),
    CHECK ((hr_decided_by IS NULL) = (hr_decided_at IS NULL)),
    EXCLUDE USING gist (
        tenant_id WITH =, employee_id WITH =,
        daterange(from_date, to_date, '[]') WITH &&
    ) WHERE (status IN ('pending_manager','pending_hr','approved'))
);
CREATE INDEX idx_hr_leave_request_company_status
    ON hr_leave_request (tenant_id, company_id, status, from_date, employee_id);

CREATE TABLE hr_leave_transaction (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    employee_id text NOT NULL,
    leave_type_id text NOT NULL,
    effective_on date NOT NULL,
    kind text NOT NULL CHECK (kind IN ('opening','accrual','carry_forward','adjustment','used','expiry','reversal')),
    days numeric(8,4) NOT NULL CHECK (days <> 0),
    source_type text NOT NULL CHECK (source_type IN ('opening','policy','manual_adjustment','leave_request','reversal')),
    source_id text NOT NULL,
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, company_id, employee_id, leave_type_id, source_type, source_id, kind),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, leave_type_id) REFERENCES hr_leave_type (tenant_id, id) ON DELETE RESTRICT,
    CHECK ((kind IN ('used','expiry') AND days < 0) OR (kind NOT IN ('used','expiry')))
);
CREATE INDEX idx_hr_leave_transaction_balance
    ON hr_leave_transaction (tenant_id, company_id, employee_id, leave_type_id, effective_on);

CREATE TABLE hr_attendance_correction (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    employee_id text NOT NULL,
    work_date date NOT NULL,
    kind text NOT NULL CHECK (kind IN ('missing_in','missing_out','incorrect_attendance','official_duty')),
    stated_in timestamptz,
    stated_out timestamptz,
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_manager','pending_hr','approved','rejected','cancelled')),
    requested_by text NOT NULL,
    submitted_by text,
    manager_decided_by text,
    manager_decided_at timestamptz,
    hr_decided_by text,
    hr_decided_at timestamptz,
    decision_comment text NOT NULL DEFAULT '' CHECK (char_length(decision_comment) <= 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    CHECK (stated_out IS NULL OR stated_in IS NULL OR stated_out > stated_in),
    CHECK ((kind = 'missing_in' AND stated_in IS NOT NULL)
        OR (kind = 'missing_out' AND stated_out IS NOT NULL)
        OR (kind = 'incorrect_attendance' AND stated_in IS NOT NULL AND stated_out IS NOT NULL)
        OR kind = 'official_duty')
);
CREATE UNIQUE INDEX uq_hr_approved_correction_day
    ON hr_attendance_correction (tenant_id, company_id, employee_id, work_date)
    WHERE status = 'approved';

CREATE TABLE hr_overtime_rule (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type = 'company'),
    category text NOT NULL CHECK (category IN ('regular','weekend','holiday')),
    multiplier numeric(8,4) NOT NULL CHECK (multiplier >= 1),
    minimum_minutes smallint NOT NULL CHECK (minimum_minutes BETWEEN 0 AND 1439),
    daily_cap_minutes smallint NOT NULL CHECK (daily_cap_minutes > minimum_minutes AND daily_cap_minutes <= 1440),
    requires_approval boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, company_id, category),
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    CHECK (requires_approval)
);

CREATE TABLE hr_overtime_request (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    employee_id text NOT NULL,
    work_date date NOT NULL,
    category text NOT NULL CHECK (category IN ('regular','weekend','holiday')),
    requested_minutes smallint NOT NULL CHECK (requested_minutes BETWEEN 1 AND 1440),
    approved_minutes smallint CHECK (approved_minutes BETWEEN 0 AND 1440),
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_manager','pending_hr','approved','rejected','cancelled')),
    requested_by text NOT NULL,
    submitted_by text,
    manager_decided_by text,
    manager_decided_at timestamptz,
    hr_decided_by text,
    hr_decided_at timestamptz,
    decision_comment text NOT NULL DEFAULT '' CHECK (char_length(decision_comment) <= 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, company_id, employee_id, work_date, category),
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    CHECK ((status = 'approved' AND approved_minutes IS NOT NULL) OR status <> 'approved')
);

CREATE TABLE hr_attendance_period (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text NOT NULL DEFAULT 'company' CHECK (company_type = 'company'),
    month date NOT NULL CHECK (month = date_trunc('month', month)::date),
    state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','processing','exceptions','hr_review','locked')),
    opened_by text NOT NULL,
    submitted_by text,
    locked_by text,
    opened_at timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz,
    locked_at timestamptz,
    source_hash text,
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, id, company_id),
    UNIQUE (tenant_id, company_id, month),
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    CHECK ((state = 'locked' AND locked_by IS NOT NULL AND locked_at IS NOT NULL AND source_hash IS NOT NULL)
        OR (state <> 'locked' AND locked_by IS NULL AND locked_at IS NULL AND source_hash IS NULL))
);

CREATE TABLE hr_payroll_input (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    period_id text NOT NULL,
    employee_id text NOT NULL,
    calendar_days numeric(8,4) NOT NULL CHECK (calendar_days > 0),
    paid_days numeric(8,4) NOT NULL CHECK (paid_days >= 0),
    unpaid_days numeric(8,4) NOT NULL CHECK (unpaid_days >= 0),
    approved_leave_days numeric(8,4) NOT NULL CHECK (approved_leave_days >= 0),
    unpaid_leave_days numeric(8,4) NOT NULL CHECK (unpaid_leave_days >= 0),
    overtime_regular_minutes integer NOT NULL DEFAULT 0 CHECK (overtime_regular_minutes >= 0),
    overtime_weekend_minutes integer NOT NULL DEFAULT 0 CHECK (overtime_weekend_minutes >= 0),
    overtime_holiday_minutes integer NOT NULL DEFAULT 0 CHECK (overtime_holiday_minutes >= 0),
    correction_count integer NOT NULL DEFAULT 0 CHECK (correction_count >= 0),
    source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, period_id, employee_id),
    FOREIGN KEY (tenant_id, period_id, company_id)
        REFERENCES hr_attendance_period (tenant_id, id, company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    CHECK (paid_days + unpaid_days = calendar_days)
);

CREATE FUNCTION validate_hr02_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assignment_company text;
        effective_date date;
BEGIN
    effective_date := COALESCE(
        (to_jsonb(NEW)->>'work_date')::date,
        (to_jsonb(NEW)->>'from_date')::date,
        (to_jsonb(NEW)->>'effective_on')::date,
        CURRENT_DATE
    );
    IF NEW.employee_id IS NOT NULL THEN
        SELECT company_id INTO assignment_company FROM employee_assignment
         WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.employee_id
           AND effective_from <= effective_date
           AND (effective_to IS NULL OR effective_to >= effective_date)
         ORDER BY effective_from DESC LIMIT 1;
        IF assignment_company IS DISTINCT FROM NEW.company_id THEN
            RAISE EXCEPTION 'HR-02 employee is unavailable in the selected company on the effective date';
        END IF;
    END IF;
    IF TG_TABLE_NAME IN ('hr_leave_request','hr_leave_transaction') AND NOT EXISTS (
        SELECT 1 FROM hr_leave_type WHERE tenant_id=NEW.tenant_id
         AND id=(to_jsonb(NEW)->>'leave_type_id') AND company_id=NEW.company_id
    ) THEN RAISE EXCEPTION 'leave type is unavailable in the selected company'; END IF;
    IF TG_TABLE_NAME = 'hr_leave_request' AND (to_jsonb(NEW)->>'document_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM employee_document WHERE tenant_id=NEW.tenant_id
         AND id=(to_jsonb(NEW)->>'document_id') AND employee_id=NEW.employee_id
    ) THEN RAISE EXCEPTION 'leave evidence document is unavailable for the selected employee'; END IF;
    IF TG_TABLE_NAME = 'hr_overtime_request' AND NOT EXISTS (
        SELECT 1 FROM hr_overtime_rule WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id
         AND category=(to_jsonb(NEW)->>'category') AND status='active'
    ) THEN RAISE EXCEPTION 'overtime rule is unavailable in the selected company'; END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER hr_attendance_punch_scope BEFORE INSERT ON hr_attendance_punch
FOR EACH ROW EXECUTE FUNCTION validate_hr02_scope();
CREATE TRIGGER hr_leave_request_scope BEFORE INSERT OR UPDATE ON hr_leave_request
FOR EACH ROW EXECUTE FUNCTION validate_hr02_scope();
CREATE TRIGGER hr_leave_transaction_scope BEFORE INSERT ON hr_leave_transaction
FOR EACH ROW EXECUTE FUNCTION validate_hr02_scope();
CREATE TRIGGER hr_attendance_correction_scope BEFORE INSERT OR UPDATE ON hr_attendance_correction
FOR EACH ROW EXECUTE FUNCTION validate_hr02_scope();
CREATE TRIGGER hr_overtime_request_scope BEFORE INSERT OR UPDATE ON hr_overtime_request
FOR EACH ROW EXECUTE FUNCTION validate_hr02_scope();

CREATE FUNCTION validate_hr_shift_assignment_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM hr_shift WHERE tenant_id=NEW.tenant_id AND id=NEW.shift_id
                   AND company_id=NEW.company_id AND status='active') THEN
        RAISE EXCEPTION 'shift is unavailable in the selected company';
    END IF;
    IF NEW.scope = 'employee' AND NOT EXISTS (
        SELECT 1 FROM employee_assignment WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.scope_id
         AND company_id=NEW.company_id AND effective_from <= COALESCE(NEW.effective_to, 'infinity'::date)
         AND (effective_to IS NULL OR effective_to >= NEW.effective_from)
    ) THEN RAISE EXCEPTION 'shift employee scope is unavailable in the selected company'; END IF;
    IF NEW.scope IN ('branch','department') AND NOT EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT id,parent_id,type FROM organization_unit WHERE tenant_id=NEW.tenant_id AND id=NEW.scope_id AND status='active'
            UNION ALL SELECT p.id,p.parent_id,p.type FROM organization_unit p JOIN ancestors c ON c.parent_id=p.id
             WHERE p.tenant_id=NEW.tenant_id AND p.status='active'
        ) SELECT 1 FROM ancestors WHERE id=NEW.company_id
    ) THEN RAISE EXCEPTION 'shift organization scope is unavailable in the selected company'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_shift_assignment_scope BEFORE INSERT OR UPDATE ON hr_shift_assignment
FOR EACH ROW EXECUTE FUNCTION validate_hr_shift_assignment_scope();

CREATE FUNCTION validate_hr_shift_rotation_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM hr_shift base JOIN hr_shift target
          ON target.tenant_id=base.tenant_id AND target.id=NEW.rotation_shift_id
         WHERE base.tenant_id=NEW.tenant_id AND base.id=NEW.shift_id
           AND base.kind='rotating' AND target.company_id=base.company_id AND target.status='active'
    ) THEN RAISE EXCEPTION 'rotation shifts must be active in the same company'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_shift_rotation_scope BEFORE INSERT OR UPDATE ON hr_shift_rotation
FOR EACH ROW EXECUTE FUNCTION validate_hr_shift_rotation_scope();

CREATE FUNCTION validate_hr_holiday_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM organization_unit WHERE tenant_id=NEW.tenant_id
                   AND id=NEW.company_id AND type='company' AND status='active') THEN
        RAISE EXCEPTION 'holiday company is unavailable';
    END IF;
    IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM organization_unit WHERE tenant_id=NEW.tenant_id AND id=NEW.branch_id
         AND parent_id=NEW.company_id AND type='branch' AND status='active'
    ) THEN RAISE EXCEPTION 'holiday branch is unavailable in the selected company'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_holiday_scope BEFORE INSERT OR UPDATE ON hr_holiday
FOR EACH ROW EXECUTE FUNCTION validate_hr_holiday_scope();

CREATE FUNCTION reject_locked_hr02_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_from date; affected_to date;
BEGIN
    affected_from := COALESCE(
        (to_jsonb(NEW)->>'work_date')::date,
        (to_jsonb(NEW)->>'from_date')::date,
        (to_jsonb(NEW)->>'effective_on')::date,
        (to_jsonb(NEW)->>'holiday_date')::date
    );
    affected_to := COALESCE((to_jsonb(NEW)->>'to_date')::date, affected_from);
    IF EXISTS (
        SELECT 1 FROM hr_attendance_period p WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id
         AND p.state='locked' AND daterange(p.month, (p.month + INTERVAL '1 month - 1 day')::date, '[]')
             && daterange(affected_from, affected_to, '[]')
    ) THEN RAISE EXCEPTION 'attendance source cannot change in a locked period'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_punch_period_lock BEFORE INSERT ON hr_attendance_punch FOR EACH ROW EXECUTE FUNCTION reject_locked_hr02_source();
CREATE TRIGGER hr_leave_request_period_lock BEFORE INSERT OR UPDATE ON hr_leave_request FOR EACH ROW EXECUTE FUNCTION reject_locked_hr02_source();
CREATE TRIGGER hr_leave_transaction_period_lock BEFORE INSERT ON hr_leave_transaction FOR EACH ROW EXECUTE FUNCTION reject_locked_hr02_source();
CREATE TRIGGER hr_correction_period_lock BEFORE INSERT OR UPDATE ON hr_attendance_correction FOR EACH ROW EXECUTE FUNCTION reject_locked_hr02_source();
CREATE TRIGGER hr_overtime_period_lock BEFORE INSERT OR UPDATE ON hr_overtime_request FOR EACH ROW EXECUTE FUNCTION reject_locked_hr02_source();
CREATE TRIGGER hr_holiday_period_lock BEFORE INSERT OR UPDATE ON hr_holiday FOR EACH ROW EXECUTE FUNCTION reject_locked_hr02_source();

CREATE TRIGGER hr_attendance_punch_immutable BEFORE UPDATE OR DELETE ON hr_attendance_punch
FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
CREATE TRIGGER hr_leave_transaction_immutable BEFORE UPDATE OR DELETE ON hr_leave_transaction
FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
CREATE TRIGGER hr_payroll_input_immutable BEFORE UPDATE OR DELETE ON hr_payroll_input
FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();

DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'hr_shift','hr_shift_break','hr_shift_rotation','hr_shift_assignment','hr_holiday',
        'hr_attendance_punch','hr_leave_type','hr_leave_request','hr_leave_transaction',
        'hr_attendance_correction','hr_overtime_rule','hr_overtime_request',
        'hr_attendance_period','hr_payroll_input'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''nexora.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''nexora.tenant_id'', true))',
            table_name || '_tenant_isolation', table_name
        );
    END LOOP;
END $$;

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 2, 'attendance_leave');
