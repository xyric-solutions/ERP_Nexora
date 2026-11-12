-- A transaction-specific quote never replaces governed base-valuation rates.
ALTER TABLE bank_transfer_line ADD COLUMN conversion_rate numeric(38,18);
ALTER TABLE bank_transfer_line ADD CONSTRAINT bank_transfer_conversion_rate_valid
  CHECK (conversion_rate IS NULL OR (conversion_rate > 0 AND source_currency <> destination_currency));

-- Preserve the quote and amounts for every lifecycle revision in immutable events.
ALTER TABLE bank_transfer_event ADD COLUMN fx_evidence jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(fx_evidence) = 'array');

CREATE FUNCTION guard_bank_transfer_conversion_rate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE destination_decimals integer;
BEGIN
  IF NEW.conversion_rate IS NOT NULL THEN
    SELECT decimal_places INTO destination_decimals FROM currency
      WHERE tenant_id=NEW.tenant_id AND code=NEW.destination_currency FOR SHARE;
    IF destination_decimals IS NULL OR
       NEW.destination_amount <> round(NEW.source_amount * NEW.conversion_rate, destination_decimals) THEN
      RAISE EXCEPTION 'Transfer destination amount must match its conversion rate'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bank_transfer_conversion_rate_guard BEFORE INSERT OR UPDATE ON bank_transfer_line
  FOR EACH ROW EXECUTE FUNCTION guard_bank_transfer_conversion_rate();

INSERT INTO nexora_schema_migration(module_name,version,name)
  VALUES('finance',36,'transfer_conversion_rate');
