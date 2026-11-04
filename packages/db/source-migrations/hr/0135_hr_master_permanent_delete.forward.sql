-- HR135: Permanent delete of deactivated Organisation & Masters records.
-- The API (DELETE /api/v1/hr/masters/:id, /job_grades/:id,
-- /organization_units/:id) is the only intended caller. These guards are
-- defence in depth: a row may be physically removed only once it has been
-- deactivated, and retired Employment Type / Employee Category provenance can
-- never be removed. Existing ON DELETE RESTRICT foreign keys continue to block
-- deletion of any referenced row (assignments, requisitions, offers, shifts,
-- the HR134 legacy map, child units, ...). Code counters are not touched here;
-- hr_record_code_counter keeps the high-water mark so codes are never reissued.
-- The full before-state is kept in the immutable hr_master_deletion table.
-- Forward-only and additive: dropping the three delete guards and the new
-- table restores HR134 behaviour.

CREATE FUNCTION guard_hr_master_permanent_delete() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF OLD.master_type IN ('employment_type', 'employee_category') THEN
        RAISE EXCEPTION 'retired employment masters are read-only provenance and cannot be deleted'
            USING ERRCODE = '23514';
    END IF;
    IF OLD.status <> 'inactive' THEN
        RAISE EXCEPTION 'only an inactive HR master record can be permanently deleted'
            USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
END
$function$;
CREATE TRIGGER guard_hr_master_permanent_delete
BEFORE DELETE ON hr_master_record
FOR EACH ROW EXECUTE FUNCTION guard_hr_master_permanent_delete();

-- Job-grade detail rows follow their master: removable only while the grade
-- master is inactive (the API deletes detail then master in one transaction).
CREATE FUNCTION guard_hr_job_grade_detail_delete() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF EXISTS (
        SELECT 1 FROM hr_master_record
         WHERE tenant_id = OLD.tenant_id AND id = OLD.master_record_id
           AND status <> 'inactive'
    ) THEN
        RAISE EXCEPTION 'only an inactive job grade can be permanently deleted'
            USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
END
$function$;
CREATE TRIGGER guard_hr_job_grade_detail_delete
BEFORE DELETE ON hr_job_grade_detail
FOR EACH ROW EXECUTE FUNCTION guard_hr_job_grade_detail_delete();

CREATE FUNCTION guard_organization_unit_permanent_delete() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF OLD.status <> 'inactive' THEN
        RAISE EXCEPTION 'only an inactive organization unit can be permanently deleted'
            USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
END
$function$;
CREATE TRIGGER guard_organization_unit_permanent_delete
BEFORE DELETE ON organization_unit
FOR EACH ROW EXECUTE FUNCTION guard_organization_unit_permanent_delete();

-- Immutable deletion evidence. platform_admin_audit_event stores only state
-- hashes, so the full before-state of a permanently deleted record is kept
-- here, linked to its audit event. Rows can never be updated or deleted.
CREATE TABLE hr_master_deletion (
    tenant_id text NOT NULL REFERENCES tenant (id) ON DELETE RESTRICT,
    id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 128),
    company_id text NOT NULL CHECK (char_length(company_id) BETWEEN 1 AND 128),
    entity_type text NOT NULL CHECK (entity_type IN ('hr_master_record', 'organization_unit')),
    entity_id text NOT NULL CHECK (char_length(entity_id) BETWEEN 1 AND 128),
    record_kind text NOT NULL CHECK (char_length(record_kind) BETWEEN 1 AND 64),
    code text NOT NULL CHECK (char_length(code) BETWEEN 1 AND 64),
    before_state jsonb NOT NULL CHECK (
        jsonb_typeof(before_state) = 'object' AND octet_length(before_state::text) <= 65536
    ),
    audit_event_id text NOT NULL,
    deleted_by text NOT NULL CHECK (char_length(deleted_by) BETWEEN 1 AND 128),
    deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, entity_type, entity_id),
    FOREIGN KEY (tenant_id, audit_event_id)
        REFERENCES platform_admin_audit_event (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_hr_master_deletion_company
    ON hr_master_deletion (tenant_id, company_id, record_kind, deleted_at DESC);
CREATE TRIGGER hr_master_deletion_immutable
BEFORE UPDATE OR DELETE ON hr_master_deletion
FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
ALTER TABLE hr_master_deletion ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_master_deletion FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_master_deletion_tenant_isolation ON hr_master_deletion
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',135,'hr_master_permanent_delete');
