CREATE TABLE hr_job_grade_detail (
    tenant_id text NOT NULL,
    master_record_id text NOT NULL,
    company_id text NOT NULL,
    grade_level integer NOT NULL CHECK (grade_level BETWEEN 1 AND 999),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    band_minimum numeric(20,4),
    band_midpoint numeric(20,4),
    band_maximum numeric(20,4),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,master_record_id),
    UNIQUE (tenant_id,company_id,grade_level),
    FOREIGN KEY (tenant_id,master_record_id)
        REFERENCES hr_master_record (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id)
        REFERENCES organization_unit (tenant_id,id) ON DELETE RESTRICT,
    CHECK (
        (band_minimum IS NULL AND band_midpoint IS NULL AND band_maximum IS NULL)
        OR (
            band_minimum IS NOT NULL AND band_midpoint IS NOT NULL AND band_maximum IS NOT NULL
            AND band_minimum >= 0 AND band_minimum <= band_midpoint AND band_midpoint <= band_maximum
        )
    )
);

INSERT INTO hr_job_grade_detail
    (tenant_id,master_record_id,company_id,grade_level,currency_code)
SELECT tenant_id,id,company_id,
       (row_number() OVER (PARTITION BY tenant_id,company_id ORDER BY code,id))::integer,
       'PKR'
  FROM hr_master_record
 WHERE master_type='job_grade';

CREATE FUNCTION validate_hr_job_grade_detail() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM hr_master_record master
         WHERE master.tenant_id=NEW.tenant_id AND master.id=NEW.master_record_id
           AND master.company_id=NEW.company_id AND master.master_type='job_grade'
    ) THEN
        RAISE EXCEPTION 'job grade detail must reference a job-grade master in the same company'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER hr_job_grade_detail_scope
BEFORE INSERT OR UPDATE ON hr_job_grade_detail
FOR EACH ROW EXECUTE FUNCTION validate_hr_job_grade_detail();

ALTER TABLE hr_job_grade_detail ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_job_grade_detail FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_job_grade_detail_tenant_isolation ON hr_job_grade_detail
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

CREATE INDEX idx_hr_job_grade_company_level
    ON hr_job_grade_detail (tenant_id,company_id,grade_level);

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',35,'job_grade_catalog');
