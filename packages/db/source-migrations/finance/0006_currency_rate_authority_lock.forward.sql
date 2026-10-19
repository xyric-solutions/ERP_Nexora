-- Serialize currency-rate authority changes with Finance posting revalidation.
-- The trigger makes the protocol mandatory for every PostgreSQL writer.

CREATE FUNCTION finance_currency_rate_lock_resource(
    tenant_value text,
    source_currency_value text,
    target_currency_value text
) RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $function$
    SELECT 'nexora:finance:rate-authority:'
        || tenant_value || ':' || source_currency_value || ':' || target_currency_value
$function$;

CREATE FUNCTION finance_currency_rate_lock_key(
    tenant_value text,
    source_currency_value text,
    target_currency_value text
) RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $function$
    SELECT pg_catalog.hashtextextended(
        finance_currency_rate_lock_resource(
            tenant_value,
            source_currency_value,
            target_currency_value
        ),
        0
    )
$function$;

CREATE FUNCTION lock_currency_rate_authority() RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    old_resource text;
    new_resource text;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        old_resource := finance_currency_rate_lock_resource(
            OLD.tenant_id,
            OLD.source_currency,
            OLD.target_currency
        );
    END IF;
    IF TG_OP <> 'DELETE' THEN
        new_resource := finance_currency_rate_lock_resource(
            NEW.tenant_id,
            NEW.source_currency,
            NEW.target_currency
        );
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new_resource,0));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old_resource,0));
        RETURN OLD;
    END IF;

    IF old_resource = new_resource THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old_resource,0));
    ELSIF old_resource < new_resource THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old_resource,0));
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new_resource,0));
    ELSE
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new_resource,0));
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old_resource,0));
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER currency_rate_authority_lock
    BEFORE INSERT OR UPDATE OR DELETE ON currency_rate
    FOR EACH ROW EXECUTE FUNCTION lock_currency_rate_authority();

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('finance',6,'currency_rate_authority_lock');
