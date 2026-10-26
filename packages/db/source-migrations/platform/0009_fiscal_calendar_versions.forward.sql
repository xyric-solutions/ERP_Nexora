-- No business calendar or period is created/activated by this migration.
ALTER TABLE fiscal_calendar ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);
CREATE FUNCTION platform_guard_fiscal_calendar_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Fiscal calendars cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (NEW.id,NEW.tenant_id,NEW.company_id,NEW.year,NEW.period_start,NEW.period_end,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.company_id,OLD.year,OLD.period_start,OLD.period_end,OLD.created_at) THEN
  RAISE EXCEPTION 'Fiscal calendar identity and boundaries are immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.row_version <> OLD.row_version+1 THEN RAISE EXCEPTION 'Fiscal calendar version must advance once' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fiscal_calendar_identity_guard BEFORE UPDATE OR DELETE ON fiscal_calendar FOR EACH ROW EXECUTE FUNCTION platform_guard_fiscal_calendar_identity();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('platform',9,'fiscal_calendar_versions');
