CREATE TABLE country (
    code text PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
    alpha3 text NOT NULL UNIQUE CHECK (alpha3 ~ '^[A-Z]{3}$'),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    subnational_mode text NOT NULL CHECK (
        subnational_mode IN ('required', 'optional', 'not_applicable')
    ),
    status text NOT NULL CHECK (status IN ('active', 'inactive')),
    valid_from date NOT NULL,
    valid_to date,
    source_version text NOT NULL CHECK (length(source_version) BETWEEN 1 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE jurisdiction (
    id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    country_code text NOT NULL,
    parent_id text,
    code text NOT NULL CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    level text NOT NULL CHECK (level IN ('national', 'subnational', 'local')),
    kind text NOT NULL CHECK (
        kind IN (
            'national', 'state', 'province', 'territory', 'region',
            'district', 'municipality', 'other'
        )
    ),
    status text NOT NULL CHECK (status IN ('active', 'inactive')),
    valid_from date NOT NULL,
    valid_to date,
    source_version text NOT NULL CHECK (length(source_version) BETWEEN 1 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (country_code, id),
    UNIQUE (country_code, code),
    FOREIGN KEY (country_code) REFERENCES country (code) ON DELETE RESTRICT,
    FOREIGN KEY (country_code, parent_id)
        REFERENCES jurisdiction (country_code, id) ON DELETE RESTRICT,
    CHECK (parent_id IS NULL OR parent_id <> id),
    CHECK (
        (level = 'national' AND parent_id IS NULL)
        OR (level <> 'national' AND parent_id IS NOT NULL)
    ),
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX jurisdiction_one_active_national_root
    ON jurisdiction (country_code)
    WHERE level = 'national' AND status = 'active';
CREATE INDEX jurisdiction_country_parent
    ON jurisdiction (country_code, parent_id, status);

CREATE TABLE legal_entity_type (
    id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    country_code text NOT NULL,
    code text NOT NULL CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    status text NOT NULL CHECK (status IN ('active', 'inactive')),
    valid_from date NOT NULL,
    valid_to date,
    source_version text NOT NULL CHECK (length(source_version) BETWEEN 1 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (country_code, id),
    UNIQUE (country_code, code),
    FOREIGN KEY (country_code) REFERENCES country (code) ON DELETE RESTRICT,
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE localization_pack (
    id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    pack_key text NOT NULL UNIQUE CHECK (
        pack_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),
    domain text NOT NULL CHECK (domain IN ('hr_payroll')),
    country_code text NOT NULL,
    target_jurisdiction_id text NOT NULL,
    publisher_scope text NOT NULL CHECK (publisher_scope IN ('system', 'tenant')),
    publisher_tenant_id text,
    owner_reference text NOT NULL CHECK (length(owner_reference) BETWEEN 1 AND 256),
    status text NOT NULL CHECK (status IN ('active', 'inactive', 'retired')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, target_jurisdiction_id),
    FOREIGN KEY (country_code, target_jurisdiction_id)
        REFERENCES jurisdiction (country_code, id) ON DELETE RESTRICT,
    FOREIGN KEY (publisher_tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT,
    CHECK (
        (publisher_scope = 'system' AND publisher_tenant_id IS NULL)
        OR (publisher_scope = 'tenant' AND publisher_tenant_id IS NOT NULL)
    )
);

CREATE INDEX localization_pack_target
    ON localization_pack (domain, country_code, target_jurisdiction_id, status);

CREATE TABLE localization_pack_version (
    id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    pack_id text NOT NULL,
    semantic_version text NOT NULL CHECK (
        semantic_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
    ),
    effective_from date NOT NULL,
    effective_to date,
    status text NOT NULL CHECK (
        status IN ('draft', 'validated', 'approved', 'active', 'superseded', 'retired')
    ),
    published_at timestamptz,
    validated_at timestamptz,
    approved_at timestamptz,
    activated_at timestamptz,
    superseded_at timestamptz,
    source_manifest_hash text NOT NULL CHECK (source_manifest_hash ~ '^[a-f0-9]{64}$'),
    content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    artifact_hash text NOT NULL CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
    reviewer_id text CHECK (reviewer_id IS NULL OR length(reviewer_id) BETWEEN 1 AND 128),
    approver_id text CHECK (approver_id IS NULL OR length(approver_id) BETWEEN 1 AND 128),
    supersedes_version_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pack_id, semantic_version),
    FOREIGN KEY (pack_id) REFERENCES localization_pack (id) ON DELETE RESTRICT,
    FOREIGN KEY (supersedes_version_id)
        REFERENCES localization_pack_version (id) ON DELETE RESTRICT,
    CHECK (supersedes_version_id IS NULL OR supersedes_version_id <> id),
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (
        status = 'draft'
        OR validated_at IS NOT NULL
    ),
    CHECK (
        status NOT IN ('approved', 'active', 'superseded', 'retired')
        OR (approved_at IS NOT NULL AND approver_id IS NOT NULL)
    ),
    CHECK (
        status NOT IN ('active', 'superseded')
        OR activated_at IS NOT NULL
    )
);

CREATE INDEX localization_pack_version_effective
    ON localization_pack_version (pack_id, effective_from, effective_to, status);

CREATE TABLE localization_pack_dependency (
    dependent_pack_version_id text NOT NULL,
    required_pack_version_id text NOT NULL,
    relation text NOT NULL CHECK (relation = 'includes'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dependent_pack_version_id, required_pack_version_id),
    FOREIGN KEY (dependent_pack_version_id)
        REFERENCES localization_pack_version (id) ON DELETE RESTRICT,
    FOREIGN KEY (required_pack_version_id)
        REFERENCES localization_pack_version (id) ON DELETE RESTRICT,
    CHECK (dependent_pack_version_id <> required_pack_version_id)
);

CREATE TABLE company_legal_profile (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text GENERATED ALWAYS AS ('company'::text) STORED,
    country_code text NOT NULL,
    registered_jurisdiction_id text NOT NULL,
    legal_entity_type_id text NOT NULL,
    address_line_1 text CHECK (address_line_1 IS NULL OR length(address_line_1) BETWEEN 1 AND 200),
    address_line_2 text CHECK (address_line_2 IS NULL OR length(address_line_2) BETWEEN 1 AND 200),
    locality text CHECK (locality IS NULL OR length(locality) BETWEEN 1 AND 120),
    postal_code text CHECK (postal_code IS NULL OR length(postal_code) BETWEEN 1 AND 32),
    effective_from date NOT NULL,
    effective_to date,
    state text NOT NULL CHECK (state IN ('draft', 'approved', 'active', 'superseded')),
    created_by text CHECK (created_by IS NULL OR length(created_by) BETWEEN 1 AND 128),
    submitted_by text CHECK (submitted_by IS NULL OR length(submitted_by) BETWEEN 1 AND 128),
    submitted_at timestamptz,
    approved_by text CHECK (approved_by IS NULL OR length(approved_by) BETWEEN 1 AND 128),
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, id, company_id),
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    FOREIGN KEY (country_code, registered_jurisdiction_id)
        REFERENCES jurisdiction (country_code, id) ON DELETE RESTRICT,
    FOREIGN KEY (country_code, legal_entity_type_id)
        REFERENCES legal_entity_type (country_code, id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (
        state NOT IN ('approved', 'active', 'superseded')
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_id WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    ) WHERE (state IN ('approved', 'active'))
);

CREATE INDEX company_legal_profile_lookup
    ON company_legal_profile (tenant_id, company_id, state, effective_from DESC);

CREATE TABLE company_statutory_registration (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    legal_profile_id text NOT NULL,
    issuing_jurisdiction_id text NOT NULL,
    registration_type text NOT NULL CHECK (
        registration_type ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),
    masked_display_value text NOT NULL CHECK (
        length(masked_display_value) BETWEEN 1 AND 128
        AND position('*' in masked_display_value) > 0
    ),
    secret_reference text CHECK (secret_reference IS NULL OR length(secret_reference) BETWEEN 1 AND 512),
    effective_from date NOT NULL,
    effective_to date,
    status text NOT NULL CHECK (status IN ('draft', 'active', 'expired', 'revoked')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, legal_profile_id, company_id)
        REFERENCES company_legal_profile (tenant_id, id, company_id) ON DELETE RESTRICT,
    FOREIGN KEY (issuing_jurisdiction_id) REFERENCES jurisdiction (id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX company_registration_lookup
    ON company_statutory_registration (
        tenant_id, company_id, registration_type, status, effective_from DESC
    );

CREATE TABLE company_payroll_configuration (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text GENERATED ALWAYS AS ('company'::text) STORED,
    payroll_currency text NOT NULL CHECK (payroll_currency ~ '^[A-Z]{3}$'),
    payroll_frequency text NOT NULL CHECK (
        payroll_frequency IN (
            'weekly', 'biweekly', 'semimonthly', 'monthly', 'four_weekly', 'custom'
        )
    ),
    custom_schedule jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(custom_schedule) = 'object'
    ),
    effective_from date NOT NULL,
    effective_to date,
    status text NOT NULL CHECK (status IN ('draft', 'approved', 'active', 'superseded')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, payroll_currency)
        REFERENCES currency (tenant_id, code) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (
        (payroll_frequency = 'custom' AND custom_schedule <> '{}'::jsonb)
        OR (payroll_frequency <> 'custom' AND custom_schedule = '{}'::jsonb)
    ),
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_id WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    ) WHERE (status = 'active')
);

CREATE INDEX company_payroll_configuration_lookup
    ON company_payroll_configuration (tenant_id, company_id, status, effective_from DESC);

CREATE TABLE company_localization_activation (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    legal_profile_id text NOT NULL,
    target_jurisdiction_id text NOT NULL,
    pack_version_id text NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    state text NOT NULL CHECK (state IN ('draft', 'approved', 'active', 'superseded')),
    approved_by text CHECK (approved_by IS NULL OR length(approved_by) BETWEEN 1 AND 128),
    approved_at timestamptz,
    audit_reference text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, legal_profile_id, company_id)
        REFERENCES company_legal_profile (tenant_id, id, company_id) ON DELETE RESTRICT,
    FOREIGN KEY (target_jurisdiction_id) REFERENCES jurisdiction (id) ON DELETE RESTRICT,
    FOREIGN KEY (pack_version_id) REFERENCES localization_pack_version (id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, audit_reference)
        REFERENCES platform_admin_audit_event (tenant_id, id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (
        state NOT IN ('approved', 'active', 'superseded')
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_id WITH =,
        target_jurisdiction_id WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    ) WHERE (state = 'active')
);

CREATE INDEX company_localization_activation_lookup
    ON company_localization_activation (
        tenant_id, company_id, target_jurisdiction_id, state, effective_from DESC
    );

CREATE TABLE company_localization_control (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    company_type text GENERATED ALWAYS AS ('company'::text) STORED,
    mode text NOT NULL CHECK (mode IN ('legacy_unlocalized', 'localization_required')),
    required_from date,
    created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 128),
    audit_reference text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, company_id),
    FOREIGN KEY (tenant_id, company_id, company_type)
        REFERENCES organization_unit (tenant_id, id, type) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, audit_reference)
        REFERENCES platform_admin_audit_event (tenant_id, id) ON DELETE RESTRICT,
    CHECK (
        (mode = 'legacy_unlocalized' AND required_from IS NULL)
        OR (mode = 'localization_required' AND required_from IS NOT NULL)
    )
);

CREATE FUNCTION validate_jurisdiction_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    parent_level text;
    cycle_found boolean;
BEGIN
    IF NEW.level = 'national' THEN
        RETURN NEW;
    END IF;

    SELECT level INTO parent_level
    FROM jurisdiction
    WHERE country_code = NEW.country_code AND id = NEW.parent_id;

    IF parent_level IS NULL THEN
        RAISE EXCEPTION 'jurisdiction parent is missing or belongs to another country'
            USING ERRCODE = '23503';
    END IF;
    IF NEW.level = 'subnational' AND parent_level <> 'national' THEN
        RAISE EXCEPTION 'subnational jurisdiction parent must be national'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.level = 'local' AND parent_level NOT IN ('national', 'subnational') THEN
        RAISE EXCEPTION 'local jurisdiction parent must be national or subnational'
            USING ERRCODE = '23514';
    END IF;

    WITH RECURSIVE ancestors(id, parent_id) AS (
        SELECT id, parent_id
        FROM jurisdiction
        WHERE country_code = NEW.country_code AND id = NEW.parent_id
        UNION
        SELECT j.id, j.parent_id
        FROM jurisdiction j
        JOIN ancestors a ON j.id = a.parent_id
        WHERE j.country_code = NEW.country_code
    )
    SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id) INTO cycle_found;

    IF cycle_found THEN
        RAISE EXCEPTION 'jurisdiction hierarchy cannot contain a cycle'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER jurisdiction_hierarchy_valid
BEFORE INSERT OR UPDATE OF country_code, parent_id, level ON jurisdiction
FOR EACH ROW EXECUTE FUNCTION validate_jurisdiction_hierarchy();

CREATE FUNCTION validate_localization_pack_dependency()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    dependent_target text;
    required_target text;
    required_is_ancestor boolean;
    cycle_found boolean;
BEGIN
    SELECT p.target_jurisdiction_id INTO dependent_target
    FROM localization_pack_version v
    JOIN localization_pack p ON p.id = v.pack_id
    WHERE v.id = NEW.dependent_pack_version_id;

    SELECT p.target_jurisdiction_id INTO required_target
    FROM localization_pack_version v
    JOIN localization_pack p ON p.id = v.pack_id
    WHERE v.id = NEW.required_pack_version_id;

    IF dependent_target IS NULL OR required_target IS NULL THEN
        RAISE EXCEPTION 'localization pack dependency references a missing version'
            USING ERRCODE = '23503';
    END IF;

    WITH RECURSIVE ancestors(id, parent_id) AS (
        SELECT id, parent_id FROM jurisdiction WHERE id = dependent_target
        UNION
        SELECT j.id, j.parent_id
        FROM jurisdiction j
        JOIN ancestors a ON j.id = a.parent_id
    )
    SELECT EXISTS (
        SELECT 1 FROM ancestors
        WHERE id = required_target AND id <> dependent_target
    ) INTO required_is_ancestor;

    IF NOT required_is_ancestor THEN
        RAISE EXCEPTION 'required pack must target an ancestor jurisdiction'
            USING ERRCODE = '23514';
    END IF;

    WITH RECURSIVE dependencies(version_id) AS (
        SELECT NEW.required_pack_version_id
        UNION
        SELECT d.required_pack_version_id
        FROM localization_pack_dependency d
        JOIN dependencies p ON d.dependent_pack_version_id = p.version_id
    )
    SELECT EXISTS (
        SELECT 1 FROM dependencies WHERE version_id = NEW.dependent_pack_version_id
    ) INTO cycle_found;

    IF cycle_found THEN
        RAISE EXCEPTION 'localization pack dependency graph cannot contain a cycle'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER localization_pack_dependency_valid
BEFORE INSERT OR UPDATE ON localization_pack_dependency
FOR EACH ROW EXECUTE FUNCTION validate_localization_pack_dependency();

CREATE FUNCTION protect_approved_pack_version()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.status IN ('approved', 'active', 'superseded', 'retired') THEN
        RAISE EXCEPTION 'approved localization pack versions cannot be deleted'
            USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE'
    THEN
        IF (OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'validated'))
           OR (OLD.status = 'validated' AND NEW.status NOT IN ('validated', 'approved'))
           OR (OLD.status = 'approved' AND NEW.status NOT IN ('approved', 'active', 'retired'))
           OR (OLD.status = 'active' AND NEW.status NOT IN ('active', 'superseded', 'retired'))
           OR (OLD.status = 'superseded' AND NEW.status NOT IN ('superseded', 'retired'))
           OR (OLD.status = 'retired' AND NEW.status <> 'retired')
        THEN
            RAISE EXCEPTION 'localization pack lifecycle cannot move backward or skip approval'
                USING ERRCODE = 'P0001';
        END IF;
        IF OLD.status IN ('approved', 'active', 'superseded', 'retired')
           AND (
               NEW.pack_id IS DISTINCT FROM OLD.pack_id
               OR NEW.semantic_version IS DISTINCT FROM OLD.semantic_version
               OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
               OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
               OR NEW.source_manifest_hash IS DISTINCT FROM OLD.source_manifest_hash
               OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
               OR NEW.artifact_hash IS DISTINCT FROM OLD.artifact_hash
               OR NEW.supersedes_version_id IS DISTINCT FROM OLD.supersedes_version_id
           )
        THEN
            RAISE EXCEPTION 'approved localization pack content is immutable'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;

CREATE TRIGGER localization_pack_version_immutable
BEFORE UPDATE OR DELETE ON localization_pack_version
FOR EACH ROW EXECUTE FUNCTION protect_approved_pack_version();

CREATE FUNCTION protect_versioned_localization_pack_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1 FROM localization_pack_version
        WHERE pack_id = OLD.id AND status <> 'draft'
    ) AND (
        NEW.pack_key IS DISTINCT FROM OLD.pack_key
        OR NEW.domain IS DISTINCT FROM OLD.domain
        OR NEW.country_code IS DISTINCT FROM OLD.country_code
        OR NEW.target_jurisdiction_id IS DISTINCT FROM OLD.target_jurisdiction_id
        OR NEW.publisher_scope IS DISTINCT FROM OLD.publisher_scope
        OR NEW.publisher_tenant_id IS DISTINCT FROM OLD.publisher_tenant_id
    ) THEN
        RAISE EXCEPTION 'versioned localization pack identity is immutable'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER localization_pack_identity_immutable
BEFORE UPDATE ON localization_pack
FOR EACH ROW EXECUTE FUNCTION protect_versioned_localization_pack_identity();

CREATE FUNCTION protect_approved_pack_dependency()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    dependent_status text;
BEGIN
    SELECT status INTO dependent_status
    FROM localization_pack_version
    WHERE id = OLD.dependent_pack_version_id;
    IF dependent_status IN ('approved', 'active', 'superseded', 'retired') THEN
        RAISE EXCEPTION 'approved localization pack dependencies are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;

CREATE TRIGGER localization_pack_dependency_immutable
BEFORE UPDATE OR DELETE ON localization_pack_dependency
FOR EACH ROW EXECUTE FUNCTION protect_approved_pack_dependency();

CREATE FUNCTION validate_company_localization_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    profile_country text;
    profile_jurisdiction text;
    pack_country text;
    pack_target text;
    pack_status text;
    version_status text;
    version_from date;
    version_to date;
BEGIN
    SELECT country_code, registered_jurisdiction_id
    INTO profile_country, profile_jurisdiction
    FROM company_legal_profile
    WHERE tenant_id = NEW.tenant_id
      AND id = NEW.legal_profile_id
      AND company_id = NEW.company_id;

    SELECT p.country_code, p.target_jurisdiction_id, p.status,
           v.status, v.effective_from, v.effective_to
    INTO pack_country, pack_target, pack_status, version_status, version_from, version_to
    FROM localization_pack_version v
    JOIN localization_pack p ON p.id = v.pack_id
    WHERE v.id = NEW.pack_version_id;

    IF profile_country IS NULL OR pack_country IS NULL THEN
        RAISE EXCEPTION 'localization activation references missing profile or pack version'
            USING ERRCODE = '23503';
    END IF;
    IF NEW.target_jurisdiction_id <> profile_jurisdiction
       OR NEW.target_jurisdiction_id <> pack_target
       OR profile_country <> pack_country
    THEN
        RAISE EXCEPTION 'localization activation profile, jurisdiction, and pack are incompatible'
            USING ERRCODE = '23514';
    END IF;
    IF pack_status <> 'active' OR version_status NOT IN ('approved', 'active') THEN
        RAISE EXCEPTION 'localization activation requires an approved active pack'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.effective_from < version_from
       OR (version_to IS NOT NULL AND (NEW.effective_to IS NULL OR NEW.effective_to > version_to))
    THEN
        RAISE EXCEPTION 'localization activation falls outside pack effective dates'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER company_localization_activation_valid
BEFORE INSERT OR UPDATE ON company_localization_activation
FOR EACH ROW EXECUTE FUNCTION validate_company_localization_activation();

CREATE FUNCTION protect_company_localization_control()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'company localization control cannot be deleted'
            USING ERRCODE = 'P0001';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
    THEN
        RAISE EXCEPTION 'company localization control identity is immutable'
            USING ERRCODE = 'P0001';
    END IF;
    IF OLD.mode = 'localization_required' AND NEW.mode = 'legacy_unlocalized' THEN
        RAISE EXCEPTION 'company localization requirement cannot be weakened'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER company_localization_control_no_downgrade
BEFORE UPDATE OR DELETE ON company_localization_control
FOR EACH ROW EXECUTE FUNCTION protect_company_localization_control();

-- FORCE RLS correctly binds the runtime role, but the migration owner must
-- briefly inspect every existing company to create an explicit legacy marker.
-- These ALTER statements are transactional, so any migration failure restores
-- FORCE before the transaction can be observed.
ALTER TABLE organization_unit NO FORCE ROW LEVEL SECURITY;

INSERT INTO company_localization_control (
    tenant_id, company_id, mode, required_from, created_by
)
SELECT tenant_id, id, 'legacy_unlocalized', NULL, 'system-migration'
FROM organization_unit
WHERE type = 'company';

ALTER TABLE organization_unit FORCE ROW LEVEL SECURITY;

CREATE FUNCTION create_company_localization_control()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.type = 'company' THEN
        INSERT INTO company_localization_control (
            tenant_id, company_id, mode, required_from, created_by
        ) VALUES (
            NEW.tenant_id,
            NEW.id,
            'localization_required',
            CURRENT_DATE,
            'system-trigger'
        );
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER organization_unit_localization_control
AFTER INSERT ON organization_unit
FOR EACH ROW EXECUTE FUNCTION create_company_localization_control();

CREATE FUNCTION reject_localization_catalog_mutation()
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
        RAISE EXCEPTION 'localization reference and pack catalogs are publisher-managed'
            USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;

CREATE TRIGGER country_publisher_managed
BEFORE INSERT OR UPDATE OR DELETE ON country
FOR EACH ROW EXECUTE FUNCTION reject_localization_catalog_mutation();
CREATE TRIGGER jurisdiction_publisher_managed
BEFORE INSERT OR UPDATE OR DELETE ON jurisdiction
FOR EACH ROW EXECUTE FUNCTION reject_localization_catalog_mutation();
CREATE TRIGGER legal_entity_type_publisher_managed
BEFORE INSERT OR UPDATE OR DELETE ON legal_entity_type
FOR EACH ROW EXECUTE FUNCTION reject_localization_catalog_mutation();
CREATE TRIGGER localization_pack_publisher_managed
BEFORE INSERT OR UPDATE OR DELETE ON localization_pack
FOR EACH ROW EXECUTE FUNCTION reject_localization_catalog_mutation();
CREATE TRIGGER localization_pack_version_publisher_managed
BEFORE INSERT OR UPDATE OR DELETE ON localization_pack_version
FOR EACH ROW EXECUTE FUNCTION reject_localization_catalog_mutation();
CREATE TRIGGER localization_pack_dependency_publisher_managed
BEFORE INSERT OR UPDATE OR DELETE ON localization_pack_dependency
FOR EACH ROW EXECUTE FUNCTION reject_localization_catalog_mutation();

ALTER TABLE company_legal_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_legal_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY company_legal_profile_tenant_isolation ON company_legal_profile
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE company_statutory_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_statutory_registration FORCE ROW LEVEL SECURITY;
CREATE POLICY company_registration_tenant_isolation ON company_statutory_registration
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE company_payroll_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_payroll_configuration FORCE ROW LEVEL SECURITY;
CREATE POLICY company_payroll_configuration_tenant_isolation ON company_payroll_configuration
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE company_localization_activation ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_localization_activation FORCE ROW LEVEL SECURITY;
CREATE POLICY company_localization_activation_tenant_isolation ON company_localization_activation
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE company_localization_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_localization_control FORCE ROW LEVEL SECURITY;
CREATE POLICY company_localization_control_tenant_isolation ON company_localization_control
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('platform', 3, 'localization_foundation');
