ALTER TABLE fixed_asset_record ADD COLUMN accrual_basis jsonb
 CHECK(accrual_basis IS NULL OR jsonb_typeof(accrual_basis)='object');
CREATE FUNCTION maintain_fixed_asset_accrual_basis() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed boolean;commencement date;
BEGIN
 IF COALESCE(NEW.category_snapshot->>'calculation_basis','legacy_monthly')<>'actual_actual' AND NEW.method<>'double_declining' THEN
  IF NEW.accrual_basis IS NOT NULL THEN RAISE EXCEPTION 'Legacy asset calculation basis cannot be replaced' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF;
 changed:=TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN
  changed:=(NEW.cost,NEW.impairment,NEW.residual_value,NEW.useful_life_months,NEW.method,NEW.annual_rate_percent,NEW.depreciation_start)
    IS DISTINCT FROM(OLD.cost,OLD.impairment,OLD.residual_value,OLD.useful_life_months,OLD.method,OLD.annual_rate_percent,OLD.depreciation_start);
  IF NOT changed AND NEW.accrual_basis IS DISTINCT FROM OLD.accrual_basis THEN
   RAISE EXCEPTION 'Daily accrual bases change only with governed financial policy or lifecycle effects' USING ERRCODE='23514';
  END IF;
 END IF;
 IF changed THEN
  commencement:=GREATEST(NEW.depreciation_start,COALESCE(NEW.last_depreciation_end+1,NEW.depreciation_start));
  IF TG_OP='UPDATE' AND (NEW.cost,NEW.impairment) IS DISTINCT FROM(OLD.cost,OLD.impairment) THEN
   commencement:=GREATEST(commencement,NEW.last_financial_date);
  END IF;
  NEW.accrual_basis:=jsonb_build_object('start',commencement::text,'opening_carrying',(NEW.cost-NEW.accumulated_depreciation-NEW.impairment)::text,'opening_accumulated',NEW.accumulated_depreciation::text);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fixed_asset_daily_basis BEFORE INSERT OR UPDATE ON fixed_asset_record
 FOR EACH ROW EXECUTE FUNCTION maintain_fixed_asset_accrual_basis();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('fixed_assets',4,'daily_accrual_basis');
