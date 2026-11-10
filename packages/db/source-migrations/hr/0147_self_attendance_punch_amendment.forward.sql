-- HR147: Employees may correct today's self-recorded check-in or check-out.
--
-- Punches stay immutable. A correction records a new punch and an amendment row
-- that marks the earlier punch as replaced; every attendance reader ignores
-- replaced punches. The amendment is immutable, tenant-isolated and blocked in
-- a locked attendance period, so the full history remains auditable.
--
-- Additive: one new table. Reversible by dropping the table once no amendment
-- has been recorded (replaced punches would otherwise reappear).

CREATE TABLE hr_attendance_punch_amendment (
    tenant_id text NOT NULL,
    id text NOT NULL,
    company_id text NOT NULL,
    employee_id text NOT NULL,
    work_date date NOT NULL,
    punch_id text NOT NULL,
    replaced_by_punch_id text NOT NULL,
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
    amended_by text NOT NULL,
    amended_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, punch_id),
    CHECK (punch_id <> replaced_by_punch_id),
    FOREIGN KEY (tenant_id, punch_id) REFERENCES hr_attendance_punch (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, replaced_by_punch_id) REFERENCES hr_attendance_punch (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employee (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, company_id) REFERENCES organization_unit (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_hr_attendance_punch_amendment_day
    ON hr_attendance_punch_amendment (tenant_id, company_id, employee_id, work_date);

ALTER TABLE hr_attendance_punch_amendment ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_attendance_punch_amendment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_attendance_punch_amendment
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));
CREATE TRIGGER hr_attendance_punch_amendment_immutable BEFORE UPDATE OR DELETE ON hr_attendance_punch_amendment
FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
CREATE TRIGGER hr_attendance_punch_amendment_period_lock BEFORE INSERT ON hr_attendance_punch_amendment
FOR EACH ROW EXECUTE FUNCTION reject_locked_hr02_source();

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',147,'self_attendance_punch_amendment');
