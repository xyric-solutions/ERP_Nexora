-- Governed currency catalog, tenant adoption evidence and effective-dated rate revisions.
-- Existing tenant currencies and rates remain valid; no catalog row is auto-adopted.

CREATE TABLE currency_catalog (
    code text PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    decimal_places smallint NOT NULL CHECK (decimal_places BETWEEN 0 AND 8),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO currency_catalog(code,name,decimal_places) VALUES
 ('AED','UAE Dirham',2),
 ('AUD','Australian Dollar',2),
 ('BHD','Bahraini Dinar',3),
 ('CAD','Canadian Dollar',2),
 ('CHF','Swiss Franc',2),
 ('CNY','Chinese Yuan',2),
 ('EUR','Euro',2),
 ('GBP','Pound Sterling',2),
 ('HKD','Hong Kong Dollar',2),
 ('INR','Indian Rupee',2),
 ('JPY','Japanese Yen',0),
 ('KWD','Kuwaiti Dinar',3),
 ('NZD','New Zealand Dollar',2),
 ('OMR','Omani Rial',3),
 ('PKR','Pakistan Rupee',2),
 ('QAR','Qatari Riyal',2),
 ('SAR','Saudi Riyal',2),
 ('SGD','Singapore Dollar',2),
 ('USD','US Dollar',2),
 ('ZAR','South African Rand',2);

CREATE FUNCTION reject_currency_catalog_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Standard currency catalog rows are immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER currency_catalog_immutable BEFORE UPDATE OR DELETE ON currency_catalog
FOR EACH ROW EXECUTE FUNCTION reject_currency_catalog_mutation();

ALTER TABLE currency
    ADD COLUMN catalog_code text,
    ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    ADD COLUMN adopted_by text,
    ADD COLUMN adopted_at timestamptz;

UPDATE currency
   SET catalog_code=code,
       adopted_at=created_at
 WHERE EXISTS (SELECT 1 FROM currency_catalog catalog WHERE catalog.code=currency.code);

ALTER TABLE currency
    ADD CONSTRAINT currency_catalog_fk FOREIGN KEY(catalog_code)
        REFERENCES currency_catalog(code) ON DELETE RESTRICT,
    ADD CONSTRAINT currency_adoption_evidence_check CHECK (
        (catalog_code IS NULL AND adopted_at IS NULL)
        OR (catalog_code IS NOT NULL AND catalog_code=code AND adopted_at IS NOT NULL)
    );

CREATE FUNCTION guard_tenant_currency_governance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE catalog currency_catalog%ROWTYPE;
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Tenant currencies cannot be deleted; use inactive status' USING ERRCODE='23514';
    END IF;
    IF NEW.catalog_code IS NOT NULL THEN
        SELECT * INTO catalog FROM currency_catalog WHERE code=NEW.catalog_code AND status='active';
        IF NOT FOUND OR NEW.code<>catalog.code OR NEW.name<>catalog.name OR NEW.decimal_places<>catalog.decimal_places THEN
            RAISE EXCEPTION 'Adopted currency must match the standard catalog' USING ERRCODE='23514';
        END IF;
    END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.row_version<>1 THEN RAISE EXCEPTION 'New currency version must be one' USING ERRCODE='23514'; END IF;
        IF NEW.is_base AND EXISTS(
            SELECT 1 FROM currency existing
             WHERE existing.tenant_id=NEW.tenant_id AND existing.is_base AND existing.status='active'
        ) THEN RAISE EXCEPTION 'Currency adoption cannot replace the tenant base currency' USING ERRCODE='23514'; END IF;
        RETURN NEW;
    END IF;
    IF (NEW.tenant_id,NEW.code,NEW.name,NEW.decimal_places,NEW.is_base,NEW.catalog_code,NEW.created_at,NEW.adopted_by,NEW.adopted_at)
       IS DISTINCT FROM
       (OLD.tenant_id,OLD.code,OLD.name,OLD.decimal_places,OLD.is_base,OLD.catalog_code,OLD.created_at,OLD.adopted_by,OLD.adopted_at) THEN
        RAISE EXCEPTION 'Currency identity and adoption evidence are immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
        RAISE EXCEPTION 'Currency version and update time must advance' USING ERRCODE='23514';
    END IF;
    IF OLD.is_base AND NEW.status<>'active' THEN
        RAISE EXCEPTION 'The active base currency cannot be deactivated' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tenant_currency_governance BEFORE INSERT OR UPDATE OR DELETE ON currency
FOR EACH ROW EXECUTE FUNCTION guard_tenant_currency_governance();

DO $$ DECLARE current_unique text; BEGIN
 SELECT constraint_name INTO current_unique
   FROM information_schema.table_constraints
  WHERE table_schema='public' AND table_name='currency_rate' AND constraint_type='UNIQUE'
  LIMIT 1;
 IF current_unique IS NULL THEN RAISE EXCEPTION 'Currency rate current-revision constraint is missing'; END IF;
 EXECUTE format('ALTER TABLE currency_rate DROP CONSTRAINT %I',current_unique);
END $$;

ALTER TABLE currency_rate
    ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','superseded')),
    ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
    ADD COLUMN supersedes_rate_id text,
    ADD COLUMN created_by text,
    ADD COLUMN reason text,
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD CONSTRAINT currency_rate_supersedes_fk FOREIGN KEY(tenant_id,supersedes_rate_id)
        REFERENCES currency_rate(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT currency_rate_reason_check CHECK(reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500);

CREATE UNIQUE INDEX currency_rate_one_current_revision
    ON currency_rate(tenant_id,source_currency,target_currency,effective_date)
    WHERE status<>'superseded';
CREATE INDEX currency_rate_active_lookup
    ON currency_rate(tenant_id,source_currency,target_currency,effective_date DESC,id DESC)
    WHERE status='active';

CREATE FUNCTION guard_currency_rate_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Currency rates cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.row_version<>1 OR NEW.status='superseded' THEN
            RAISE EXCEPTION 'New currency rates require version one and a current status' USING ERRCODE='23514';
        END IF;
        IF NEW.supersedes_rate_id IS NOT NULL AND NOT EXISTS(
            SELECT 1 FROM currency_rate previous
             WHERE previous.tenant_id=NEW.tenant_id AND previous.id=NEW.supersedes_rate_id
               AND previous.source_currency=NEW.source_currency AND previous.target_currency=NEW.target_currency
               AND previous.effective_date=NEW.effective_date AND previous.status='superseded'
        ) THEN RAISE EXCEPTION 'Corrected rate must reference the superseded revision' USING ERRCODE='23514'; END IF;
        RETURN NEW;
    END IF;
    IF (NEW.tenant_id,NEW.id,NEW.source_currency,NEW.target_currency,NEW.rate,NEW.effective_date,
        NEW.created_at,NEW.created_by,NEW.supersedes_rate_id,NEW.reason)
       IS DISTINCT FROM
       (OLD.tenant_id,OLD.id,OLD.source_currency,OLD.target_currency,OLD.rate,OLD.effective_date,
        OLD.created_at,OLD.created_by,OLD.supersedes_rate_id,OLD.reason) THEN
        RAISE EXCEPTION 'Currency rate facts are immutable; create a correction revision' USING ERRCODE='23514';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
        RAISE EXCEPTION 'Currency rate version and update time must advance' USING ERRCODE='23514';
    END IF;
    IF OLD.status='superseded' OR NEW.status=OLD.status OR (NEW.status='superseded' AND OLD.status<>'active') THEN
        RAISE EXCEPTION 'Invalid currency rate status transition' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER currency_rate_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON currency_rate
FOR EACH ROW EXECUTE FUNCTION guard_currency_rate_revision();

CREATE TABLE currency_master_event (
    tenant_id text NOT NULL,
    id text NOT NULL CHECK(length(id) BETWEEN 1 AND 128),
    entity_type text NOT NULL CHECK(entity_type IN ('currency','currency_rate')),
    entity_id text NOT NULL CHECK(length(entity_id) BETWEEN 1 AND 128),
    action text NOT NULL CHECK(action IN ('adopted','activated','inactivated','rate_created','rate_corrected','rate_activated','rate_inactivated')),
    record_version bigint NOT NULL CHECK(record_version>0),
    actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 128),
    reason text CHECK(reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500),
    correlation_id text NOT NULL CHECK(length(correlation_id) BETWEEN 1 AND 128),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(tenant_id,id),
    FOREIGN KEY(tenant_id) REFERENCES tenant(id) ON DELETE RESTRICT,
    FOREIGN KEY(tenant_id,id) REFERENCES platform_admin_audit_event(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX currency_master_event_history
    ON currency_master_event(tenant_id,entity_type,entity_id,occurred_at,id);
ALTER TABLE currency_master_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_master_event FORCE ROW LEVEL SECURITY;
CREATE POLICY currency_master_event_tenant ON currency_master_event
    USING(tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER currency_master_event_immutable BEFORE UPDATE OR DELETE ON currency_master_event
FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('platform',10,'currency_master_governance');
