DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration
        WHERE module_name = 'platform' AND version = 3
    ) THEN
        RAISE EXCEPTION 'generalized localization activation requires Platform migration 3';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_company_localization_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    profile_country text;
    profile_state text;
    profile_from date;
    profile_to date;
    target_country text;
    target_status text;
    target_from date;
    target_to date;
    pack_country text;
    pack_target text;
    pack_status text;
    version_status text;
    version_from date;
    version_to date;
BEGIN
    SELECT country_code, state, effective_from, effective_to
    INTO profile_country, profile_state, profile_from, profile_to
    FROM company_legal_profile
    WHERE tenant_id = NEW.tenant_id
      AND id = NEW.legal_profile_id
      AND company_id = NEW.company_id;

    SELECT country_code, status, valid_from, valid_to
    INTO target_country, target_status, target_from, target_to
    FROM jurisdiction
    WHERE id = NEW.target_jurisdiction_id;

    SELECT p.country_code, p.target_jurisdiction_id, p.status,
           v.status, v.effective_from, v.effective_to
    INTO pack_country, pack_target, pack_status, version_status, version_from, version_to
    FROM localization_pack_version v
    JOIN localization_pack p ON p.id = v.pack_id
    WHERE v.id = NEW.pack_version_id;

    IF profile_country IS NULL OR target_country IS NULL OR pack_country IS NULL THEN
        RAISE EXCEPTION 'localization activation references missing profile, jurisdiction, or pack version'
            USING ERRCODE = '23503';
    END IF;
    IF NEW.target_jurisdiction_id <> pack_target
       OR profile_country <> pack_country
       OR profile_country <> target_country
    THEN
        RAISE EXCEPTION 'localization activation must target a pack in the legal employer country'
            USING ERRCODE = '23514';
    END IF;
    IF target_status <> 'active' THEN
        RAISE EXCEPTION 'localization activation requires an active target jurisdiction'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.state IN ('approved', 'active', 'superseded')
       AND profile_state NOT IN ('approved', 'active', 'superseded')
    THEN
        RAISE EXCEPTION 'reviewed localization activation requires a reviewed company legal profile'
            USING ERRCODE = '23514';
    END IF;
    IF pack_status <> 'active' OR version_status NOT IN ('approved', 'active') THEN
        RAISE EXCEPTION 'localization activation requires an approved active pack'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.effective_from < profile_from
       OR (profile_to IS NOT NULL AND (NEW.effective_to IS NULL OR NEW.effective_to > profile_to))
       OR NEW.effective_from < target_from
       OR (target_to IS NOT NULL AND (NEW.effective_to IS NULL OR NEW.effective_to > target_to))
       OR NEW.effective_from < version_from
       OR (version_to IS NOT NULL AND (NEW.effective_to IS NULL OR NEW.effective_to > version_to))
    THEN
        RAISE EXCEPTION 'localization activation falls outside profile, jurisdiction, or pack effective dates'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('platform', 4, 'generalized_localization_activation');
