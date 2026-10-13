DO $$
BEGIN
    IF to_regclass('public.employee') IS NULL
       OR to_regclass('public.employee_assignment_org_unit') IS NULL THEN
        RAISE EXCEPTION 'employee profile satellites require HR effective assignments migration 12';
    END IF;
END $$;

CREATE TABLE hr_employee_profile_version (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    employee_id text NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    supersedes_version_id text,
    first_name text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 100),
    middle_name text NOT NULL DEFAULT '' CHECK (length(middle_name) <= 100),
    last_name text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 100),
    preferred_name text NOT NULL DEFAULT '' CHECK (length(preferred_name) <= 100),
    work_email text NOT NULL DEFAULT '' CHECK (length(work_email) <= 320),
    date_of_birth date,
    personal_email text NOT NULL DEFAULT '' CHECK (length(personal_email) <= 320),
    phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
    recorded_by text NOT NULL CHECK (length(recorded_by) BETWEEN 1 AND 128),
    source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 1 AND 500),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,employee_id,effective_from,revision),
    FOREIGN KEY (tenant_id,employee_id) REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,supersedes_version_id)
        REFERENCES hr_employee_profile_version (tenant_id,id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (date_of_birth IS NULL OR date_of_birth < effective_from),
    EXCLUDE USING gist (
        tenant_id WITH =,
        employee_id WITH =,
        daterange(effective_from,effective_to,'[]') WITH &&
    ) WHERE (supersedes_version_id IS NULL)
);
CREATE INDEX idx_hr_employee_profile_version_history
    ON hr_employee_profile_version (tenant_id,employee_id,effective_from DESC);

INSERT INTO hr_employee_profile_version (
    id,tenant_id,employee_id,effective_from,first_name,middle_name,last_name,
    preferred_name,work_email,date_of_birth,personal_email,phone,recorded_by,
    source_reference
)
SELECT 'migration-0013-' || md5(tenant_id || ':' || id),tenant_id,id,CURRENT_DATE,
       first_name,middle_name,last_name,preferred_name,work_email,date_of_birth,
       personal_email,phone,'migration-0013','migration:0013-current-state-capture'
  FROM employee;

ALTER TABLE employee_contact
    DROP CONSTRAINT employee_contact_pkey,
    ADD COLUMN id text,
    ADD COLUMN channel text NOT NULL DEFAULT 'address',
    ADD COLUMN contact_usage text NOT NULL DEFAULT 'personal',
    ADD COLUMN contact_value text NOT NULL DEFAULT '',
    ADD COLUMN label text NOT NULL DEFAULT '',
    ADD COLUMN is_primary boolean NOT NULL DEFAULT true,
    ADD COLUMN status text NOT NULL DEFAULT 'active',
    ADD COLUMN effective_from date NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN effective_to date,
    ADD COLUMN created_by text NOT NULL DEFAULT 'migration-0013',
    ADD COLUMN source_reference text NOT NULL DEFAULT 'migration:0013-existing-address',
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
UPDATE employee_contact
   SET id='migration-0013-address-' || md5(tenant_id || ':' || employee_id)
 WHERE id IS NULL;
ALTER TABLE employee_contact
    ALTER COLUMN id SET NOT NULL,
    ALTER COLUMN id DROP DEFAULT,
    ALTER COLUMN channel DROP DEFAULT,
    ALTER COLUMN contact_usage DROP DEFAULT,
    ALTER COLUMN created_by DROP DEFAULT,
    ALTER COLUMN source_reference DROP DEFAULT,
    ADD CONSTRAINT employee_contact_pkey PRIMARY KEY (tenant_id,id),
    ADD CONSTRAINT employee_contact_channel_check
        CHECK (channel IN ('email','phone','address')),
    ADD CONSTRAINT employee_contact_usage_check
        CHECK (contact_usage IN ('work','personal','other')),
    ADD CONSTRAINT employee_contact_status_check
        CHECK (status IN ('active','inactive')),
    ADD CONSTRAINT employee_contact_value_shape CHECK (
        (channel IN ('email','phone') AND length(btrim(contact_value)) BETWEEN 1 AND 320)
        OR (channel='address' AND contact_value='')
    ),
    ADD CONSTRAINT employee_contact_effective_range
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    ADD CONSTRAINT employee_contact_source_check
        CHECK (length(btrim(source_reference)) BETWEEN 1 AND 500);
CREATE UNIQUE INDEX uq_employee_contact_current_primary
    ON employee_contact (tenant_id,employee_id,channel,contact_usage)
    WHERE is_primary AND status='active' AND effective_to IS NULL;
CREATE INDEX idx_employee_contact_employee_history
    ON employee_contact (tenant_id,employee_id,channel,effective_from DESC);

INSERT INTO employee_contact (
    id,tenant_id,employee_id,channel,contact_usage,contact_value,label,is_primary,
    status,effective_from,created_by,source_reference
)
SELECT 'migration-0013-work-email-' || md5(tenant_id || ':' || id),tenant_id,id,
       'email','work',work_email,'Work email',true,'active',CURRENT_DATE,
       'migration-0013','migration:0013-current-state-capture'
  FROM employee WHERE work_email<>'';
INSERT INTO employee_contact (
    id,tenant_id,employee_id,channel,contact_usage,contact_value,label,is_primary,
    status,effective_from,created_by,source_reference
)
SELECT 'migration-0013-personal-email-' || md5(tenant_id || ':' || id),tenant_id,id,
       'email','personal',personal_email,'Personal email',true,'active',CURRENT_DATE,
       'migration-0013','migration:0013-current-state-capture'
  FROM employee WHERE personal_email<>'';
INSERT INTO employee_contact (
    id,tenant_id,employee_id,channel,contact_usage,contact_value,label,is_primary,
    status,effective_from,created_by,source_reference
)
SELECT 'migration-0013-personal-phone-' || md5(tenant_id || ':' || id),tenant_id,id,
       'phone','personal',phone,'Personal phone',true,'active',CURRENT_DATE,
       'migration-0013','migration:0013-current-state-capture'
  FROM employee WHERE phone<>'';

ALTER TABLE employee_emergency_contact
    ADD COLUMN email text NOT NULL DEFAULT '' CHECK (length(email) <= 320),
    ADD COLUMN priority integer NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 99),
    ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    ADD COLUMN effective_from date NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN effective_to date,
    ADD COLUMN supersedes_contact_id text,
    ADD COLUMN created_by text NOT NULL DEFAULT 'migration-0013',
    ADD COLUMN source_reference text NOT NULL DEFAULT 'migration:0013-existing-emergency-contact',
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD CONSTRAINT employee_emergency_contact_effective_range
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    ADD CONSTRAINT employee_emergency_contact_source_check
        CHECK (length(btrim(source_reference)) BETWEEN 1 AND 500),
    ADD CONSTRAINT fk_employee_emergency_contact_supersedes
        FOREIGN KEY (tenant_id,supersedes_contact_id)
        REFERENCES employee_emergency_contact (tenant_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX uq_employee_emergency_current_priority
    ON employee_emergency_contact (tenant_id,employee_id,priority)
    WHERE status='active' AND effective_to IS NULL;
CREATE INDEX idx_employee_emergency_contact_history
    ON employee_emergency_contact (tenant_id,employee_id,effective_from DESC,priority);

ALTER TABLE employee_document
    ALTER COLUMN storage_key DROP NOT NULL,
    ADD COLUMN issuing_authority text NOT NULL DEFAULT '' CHECK (length(issuing_authority) <= 200),
    ADD COLUMN verification_status text NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified','pending','verified','rejected','expired')),
    ADD COLUMN notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
    ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    ADD COLUMN supersedes_document_id text,
    ADD COLUMN source_reference text NOT NULL DEFAULT 'migration:0013-existing-document',
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD CONSTRAINT employee_document_source_check
        CHECK (length(btrim(source_reference)) BETWEEN 1 AND 500),
    ADD CONSTRAINT fk_employee_document_supersedes
        FOREIGN KEY (tenant_id,supersedes_document_id)
        REFERENCES employee_document (tenant_id,id) ON DELETE RESTRICT;
CREATE INDEX idx_employee_document_status_expiry
    ON employee_document (tenant_id,employee_id,status,expires_on,created_at DESC);

CREATE FUNCTION protect_hr_employee_profile_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'employee profile history is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id OR NEW.employee_id<>OLD.employee_id
       OR NEW.effective_from<>OLD.effective_from OR NEW.revision<>OLD.revision
       OR NEW.supersedes_version_id IS DISTINCT FROM OLD.supersedes_version_id
       OR OLD.effective_to IS NOT NULL
       OR NEW.effective_to IS NULL OR NEW.effective_to<NEW.effective_from
       OR NEW.first_name<>OLD.first_name OR NEW.middle_name<>OLD.middle_name
       OR NEW.last_name<>OLD.last_name OR NEW.preferred_name<>OLD.preferred_name
       OR NEW.work_email<>OLD.work_email OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
       OR NEW.personal_email<>OLD.personal_email OR NEW.phone<>OLD.phone
       OR NEW.recorded_by<>OLD.recorded_by OR NEW.source_reference<>OLD.source_reference
       OR NEW.recorded_at<>OLD.recorded_at THEN
        RAISE EXCEPTION 'employee profile history may only be closed once' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_employee_profile_version_immutable
BEFORE UPDATE OR DELETE ON hr_employee_profile_version
FOR EACH ROW EXECUTE FUNCTION protect_hr_employee_profile_version();

CREATE FUNCTION protect_employee_contact_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'employee contact history is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id OR NEW.employee_id<>OLD.employee_id
       OR NEW.channel<>OLD.channel OR NEW.contact_usage<>OLD.contact_usage
       OR NEW.contact_value<>OLD.contact_value OR NEW.label<>OLD.label
       OR NEW.is_primary<>OLD.is_primary OR NEW.effective_from<>OLD.effective_from
       OR OLD.effective_to IS NOT NULL OR NEW.effective_to IS NULL
       OR NEW.effective_to<NEW.effective_from OR OLD.status<>'active' OR NEW.status<>'inactive'
       OR NEW.created_by<>OLD.created_by OR NEW.source_reference<>OLD.source_reference
       OR NEW.created_at<>OLD.created_at THEN
        RAISE EXCEPTION 'employee contact history may only be closed once' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER employee_contact_history_immutable
BEFORE UPDATE OR DELETE ON employee_contact
FOR EACH ROW EXECUTE FUNCTION protect_employee_contact_history();

CREATE FUNCTION protect_employee_emergency_contact_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'emergency contact history is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id OR NEW.employee_id<>OLD.employee_id
       OR NEW.name<>OLD.name OR NEW.relationship<>OLD.relationship OR NEW.phone<>OLD.phone
       OR NEW.email<>OLD.email OR NEW.priority<>OLD.priority OR NEW.is_primary<>OLD.is_primary
       OR NEW.effective_from<>OLD.effective_from OR OLD.effective_to IS NOT NULL
       OR NEW.effective_to IS NULL OR NEW.effective_to<NEW.effective_from
       OR OLD.status<>'active' OR NEW.status<>'inactive'
       OR NEW.supersedes_contact_id IS DISTINCT FROM OLD.supersedes_contact_id
       OR NEW.created_by<>OLD.created_by OR NEW.source_reference<>OLD.source_reference
       OR NEW.created_at<>OLD.created_at THEN
        RAISE EXCEPTION 'emergency contact history may only be closed once' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER employee_emergency_contact_history_immutable
BEFORE UPDATE OR DELETE ON employee_emergency_contact
FOR EACH ROW EXECUTE FUNCTION protect_employee_emergency_contact_history();

CREATE FUNCTION reject_employee_document_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'employee document metadata is append-only' USING ERRCODE='23514';
END $$;
CREATE TRIGGER employee_document_metadata_immutable
BEFORE UPDATE OR DELETE ON employee_document
FOR EACH ROW EXECUTE FUNCTION reject_employee_document_mutation();

CREATE FUNCTION guard_employee_contact_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.work_email IS DISTINCT FROM OLD.work_email
        OR NEW.personal_email IS DISTINCT FROM OLD.personal_email
        OR NEW.phone IS DISTINCT FROM OLD.phone)
       AND COALESCE(current_setting('nexora.employee_contact_projection_write',true),'off')<>'on' THEN
        RAISE EXCEPTION 'employee contact projections are managed through employee_contact'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER employee_contact_projection_guard
BEFORE UPDATE OF work_email,personal_email,phone ON employee
FOR EACH ROW EXECUTE FUNCTION guard_employee_contact_projection();

CREATE FUNCTION sync_employee_contact_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status='active' AND NEW.is_primary AND NEW.effective_from<=CURRENT_DATE
       AND (NEW.effective_to IS NULL OR NEW.effective_to>=CURRENT_DATE) THEN
        PERFORM set_config('nexora.employee_contact_projection_write','on',true);
        IF NEW.channel='email' AND NEW.contact_usage='work' THEN
            UPDATE employee SET work_email=NEW.contact_value,updated_at=now()
             WHERE tenant_id=NEW.tenant_id AND id=NEW.employee_id;
        ELSIF NEW.channel='email' AND NEW.contact_usage='personal' THEN
            UPDATE employee SET personal_email=NEW.contact_value,updated_at=now()
             WHERE tenant_id=NEW.tenant_id AND id=NEW.employee_id;
        ELSIF NEW.channel='phone' AND NEW.contact_usage='personal' THEN
            UPDATE employee SET phone=NEW.contact_value,updated_at=now()
             WHERE tenant_id=NEW.tenant_id AND id=NEW.employee_id;
        END IF;
        PERFORM set_config('nexora.employee_contact_projection_write','off',true);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER employee_contact_projection_sync
AFTER INSERT ON employee_contact
FOR EACH ROW EXECUTE FUNCTION sync_employee_contact_projection();

ALTER TABLE hr_employee_profile_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_profile_version FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employee_profile_version_tenant_isolation
ON hr_employee_profile_version
USING (tenant_id=current_setting('nexora.tenant_id',true))
WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

COMMENT ON TABLE hr_employee_profile_version IS
    'Typed effective-dated Employee profile evidence; Employee remains the current identity projection.';
COMMENT ON COLUMN employee_document.storage_key IS
    'Legacy external storage reference only. HR-EMP-02D APIs never accept or expose binary storage keys.';

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',13,'employee_profile_satellites');
