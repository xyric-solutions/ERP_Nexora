ALTER TABLE organization_unit
    DROP CONSTRAINT organization_unit_type_check;

ALTER TABLE organization_unit
    ADD CONSTRAINT organization_unit_type_check
    CHECK (type IN (
        'company', 'business_unit', 'division', 'branch', 'department', 'warehouse'
    ));

ALTER TABLE organization_unit NO FORCE ROW LEVEL SECURITY;

DO $preflight$
BEGIN
    IF EXISTS (
        WITH RECURSIVE hierarchy AS (
            SELECT unit.tenant_id, unit.id, unit.parent_id,
                   ARRAY[unit.id]::text[] AS path, false AS cycle
            FROM organization_unit unit
            UNION ALL
            SELECT parent.tenant_id, parent.id, parent.parent_id,
                   child.path || parent.id,
                   parent.id = ANY(child.path)
            FROM hierarchy child
            JOIN organization_unit parent
              ON parent.tenant_id = child.tenant_id
             AND parent.id = child.parent_id
            WHERE NOT child.cycle
        )
        SELECT 1 FROM hierarchy WHERE cycle
    ) THEN
        RAISE EXCEPTION 'existing organization unit hierarchy contains a cycle'
            USING ERRCODE = '23514';
    END IF;
END
$preflight$;

ALTER TABLE organization_unit FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION validate_organization_unit_acyclic()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended('nexora:organization_unit:' || NEW.tenant_id, 0)
    );
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.parent_id = NEW.id THEN
        RAISE EXCEPTION 'an organization unit cannot be its own parent'
            USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT unit.id, unit.parent_id
            FROM organization_unit unit
            WHERE unit.tenant_id = NEW.tenant_id AND unit.id = NEW.parent_id
            UNION ALL
            SELECT parent.id, parent.parent_id
            FROM organization_unit parent
            JOIN ancestors child ON child.parent_id = parent.id
            WHERE parent.tenant_id = NEW.tenant_id
        )
        SELECT 1 FROM ancestors WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'organization unit hierarchy must be acyclic'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER organization_unit_acyclic
BEFORE INSERT OR UPDATE OF tenant_id, parent_id
ON organization_unit
FOR EACH ROW EXECUTE FUNCTION validate_organization_unit_acyclic();

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('platform', 5, 'organization_unit_types');
