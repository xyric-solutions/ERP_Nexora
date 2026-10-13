DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration WHERE module_name='hr' AND version=14
    ) THEN
        RAISE EXCEPTION 'payroll time-input evidence requires HR migration 14';
    END IF;
END $$;

ALTER TABLE hr_payroll_input
    ADD COLUMN present_days numeric(8,4) NOT NULL DEFAULT 0 CHECK (present_days >= 0),
    ADD COLUMN absent_days numeric(8,4) NOT NULL DEFAULT 0 CHECK (absent_days >= 0),
    ADD COLUMN evidence_version text NOT NULL DEFAULT 'legacy_summary_v1'
        CHECK (evidence_version IN ('legacy_summary_v1','attendance_leave_overtime_v2')),
    ADD COLUMN source_snapshot_json jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(source_snapshot_json)='array');

ALTER TABLE hr_payroll_input
    ADD CONSTRAINT hr_payroll_input_attendance_day_bounds
        CHECK (present_days + absent_days <= calendar_days),
    ADD CONSTRAINT hr_payroll_input_evidence_shape
        CHECK (
            (evidence_version='legacy_summary_v1' AND jsonb_array_length(source_snapshot_json)=0)
            OR
            (evidence_version='attendance_leave_overtime_v2'
             AND jsonb_array_length(source_snapshot_json)::numeric=calendar_days)
        );

ALTER TABLE hr_payroll_result_salary_segment
    DROP CONSTRAINT hr_payroll_result_salary_segment_paid_days_check,
    ADD CONSTRAINT hr_payroll_result_salary_segment_paid_days_check CHECK (paid_days >= 0);

CREATE OR REPLACE FUNCTION reject_locked_hr02_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_row jsonb;
        prior_row jsonb;
BEGIN
    IF TG_OP='DELETE' THEN
        current_row := to_jsonb(OLD);
        prior_row := current_row;
    ELSIF TG_OP='UPDATE' THEN
        current_row := to_jsonb(NEW);
        prior_row := to_jsonb(OLD);
    ELSE
        current_row := to_jsonb(NEW);
        prior_row := current_row;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (VALUES (current_row),(prior_row)) AS changed(payload)
          JOIN hr_attendance_period p
            ON p.tenant_id=changed.payload->>'tenant_id'
           AND p.company_id=changed.payload->>'company_id'
           AND p.state='locked'
         WHERE daterange(p.month, (p.month + INTERVAL '1 month - 1 day')::date, '[]')
               && daterange(
                    COALESCE(
                        (changed.payload->>'work_date')::date,
                        (changed.payload->>'from_date')::date,
                        (changed.payload->>'effective_on')::date,
                        (changed.payload->>'holiday_date')::date
                    ),
                    COALESCE(
                        (changed.payload->>'to_date')::date,
                        (changed.payload->>'work_date')::date,
                        (changed.payload->>'from_date')::date,
                        (changed.payload->>'effective_on')::date,
                        (changed.payload->>'holiday_date')::date
                    ),
                    '[]'
               )
    ) THEN
        RAISE EXCEPTION 'attendance source cannot change in a locked period';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

DROP TRIGGER hr_leave_request_period_lock ON hr_leave_request;
DROP TRIGGER hr_correction_period_lock ON hr_attendance_correction;
DROP TRIGGER hr_overtime_period_lock ON hr_overtime_request;
DROP TRIGGER hr_holiday_period_lock ON hr_holiday;

CREATE TRIGGER hr_leave_request_period_lock BEFORE INSERT OR UPDATE OR DELETE ON hr_leave_request
FOR EACH ROW EXECUTE FUNCTION reject_locked_hr02_source();
CREATE TRIGGER hr_correction_period_lock BEFORE INSERT OR UPDATE OR DELETE ON hr_attendance_correction
FOR EACH ROW EXECUTE FUNCTION reject_locked_hr02_source();
CREATE TRIGGER hr_overtime_period_lock BEFORE INSERT OR UPDATE OR DELETE ON hr_overtime_request
FOR EACH ROW EXECUTE FUNCTION reject_locked_hr02_source();
CREATE TRIGGER hr_holiday_period_lock BEFORE INSERT OR UPDATE OR DELETE ON hr_holiday
FOR EACH ROW EXECUTE FUNCTION reject_locked_hr02_source();

COMMENT ON COLUMN hr_payroll_input.source_snapshot_json IS
    'Immutable money-free daily evidence copied from Attendance, Leave, and approved Overtime authorities at period lock.';

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',15,'payroll_time_input_evidence');
