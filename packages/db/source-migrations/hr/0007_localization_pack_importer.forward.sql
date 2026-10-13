DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration
        WHERE module_name = 'hr' AND version = 6
    ) THEN
        RAISE EXCEPTION 'HR localization pack importer requires HR migration 6';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration
        WHERE module_name = 'platform' AND version = 3
    ) THEN
        RAISE EXCEPTION 'HR localization pack importer requires Platform migration 3';
    END IF;
END $$;

CREATE TABLE localization_publisher_principal (
    role_name name PRIMARY KEY,
    status text NOT NULL CHECK (status IN ('active', 'inactive')),
    registered_by text NOT NULL CHECK (length(registered_by) BETWEEN 1 AND 128),
    registered_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE localization_import_release (
    artifact_hash text PRIMARY KEY CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
    pack_version_id text NOT NULL UNIQUE,
    bundle_schema_version integer NOT NULL CHECK (bundle_schema_version = 1),
    imported_by name NOT NULL DEFAULT session_user,
    imported_at timestamptz NOT NULL DEFAULT now(),
    report_json jsonb NOT NULL CHECK (jsonb_typeof(report_json) = 'object'),
    FOREIGN KEY (pack_version_id)
        REFERENCES localization_pack_version (id) ON DELETE RESTRICT
);

REVOKE ALL ON TABLE localization_publisher_principal FROM PUBLIC;
REVOKE ALL ON TABLE localization_import_release FROM PUBLIC;

CREATE FUNCTION reject_localization_publisher_principal_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    table_owner text;
BEGIN
    SELECT pg_get_userbyid(relowner) INTO table_owner
    FROM pg_class
    WHERE oid = TG_RELID;
    IF current_user <> table_owner THEN
        RAISE EXCEPTION 'localization publisher registration is migration-owner managed'
            USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;

CREATE TRIGGER localization_publisher_principal_owner_managed
BEFORE INSERT OR UPDATE OR DELETE ON localization_publisher_principal
FOR EACH ROW EXECUTE FUNCTION reject_localization_publisher_principal_mutation();

CREATE OR REPLACE FUNCTION reject_localization_catalog_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    table_owner name;
    publisher_allowed boolean;
BEGIN
    SELECT pg_get_userbyid(relowner)::name INTO table_owner
    FROM pg_class
    WHERE oid = TG_RELID;

    SELECT EXISTS (
        SELECT 1
        FROM public.localization_publisher_principal
        WHERE role_name = session_user::name
          AND status = 'active'
    ) AND TG_TABLE_NAME = ANY(ARRAY[
        'localization_pack',
        'localization_pack_version',
        'localization_pack_dependency',
        'hr_statutory_rule',
        'hr_statutory_rule_version',
        'hr_statutory_rule_test_vector',
        'localization_import_release'
    ]) INTO publisher_allowed;

    IF session_user::name <> table_owner AND NOT publisher_allowed THEN
        RAISE EXCEPTION 'localization reference and pack catalogs are publisher-managed'
            USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;

CREATE FUNCTION localization_publisher_is_registered()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.localization_publisher_principal
        WHERE role_name = session_user::name
          AND status = 'active'
    )
$function$;

CREATE FUNCTION validate_localization_import_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    version_status text;
    version_artifact_hash text;
BEGIN
    SELECT status, artifact_hash
    INTO version_status, version_artifact_hash
    FROM public.localization_pack_version
    WHERE id = NEW.pack_version_id;

    IF version_status <> 'approved' OR version_artifact_hash <> NEW.artifact_hash THEN
        RAISE EXCEPTION 'localization import release requires matching approved pack evidence'
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.hr_statutory_rule_version
        WHERE pack_version_id = NEW.pack_version_id
    ) OR EXISTS (
        SELECT 1
        FROM public.hr_statutory_rule_version rule_version
        LEFT JOIN public.hr_statutory_rule_test_vector vector
          ON vector.rule_version_id = rule_version.id
         AND vector.pack_version_id = rule_version.pack_version_id
        WHERE rule_version.pack_version_id = NEW.pack_version_id
        GROUP BY rule_version.id
        HAVING count(DISTINCT vector.vector_kind) FILTER (
            WHERE vector.vector_kind IN ('positive', 'boundary', 'non_applicable')
        ) <> 3
    ) THEN
        RAISE EXCEPTION 'localization import release requires complete reviewed rule vectors'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.imported_by <> session_user::name THEN
        RAISE EXCEPTION 'localization import actor must be database-derived'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE FUNCTION protect_localization_import_release()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'localization import release evidence is immutable'
        USING ERRCODE = 'P0001';
END
$function$;

CREATE TRIGGER localization_import_release_valid
BEFORE INSERT ON localization_import_release
FOR EACH ROW EXECUTE FUNCTION validate_localization_import_release();

CREATE TRIGGER localization_import_release_immutable
BEFORE UPDATE OR DELETE ON localization_import_release
FOR EACH ROW EXECUTE FUNCTION protect_localization_import_release();

CREATE TRIGGER localization_import_release_publisher_managed
BEFORE INSERT OR UPDATE OR DELETE ON localization_import_release
FOR EACH ROW EXECUTE FUNCTION reject_localization_catalog_mutation();

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 7, 'localization_pack_importer');
