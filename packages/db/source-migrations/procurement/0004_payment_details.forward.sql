-- Additive payment instruction details. Existing vouchers and their codes remain unchanged.
ALTER TABLE procurement_document ADD COLUMN payment_details jsonb,
 ADD CONSTRAINT procurement_payment_details_shape CHECK (
  payment_details IS NULL OR coalesce((kind IN ('payment','multi_payment') AND jsonb_typeof(payment_details)='object'
   AND jsonb_typeof(payment_details->'bank_account_id')='string'
   AND length(btrim(payment_details->>'bank_account_id')) BETWEEN 1 AND 128
   AND jsonb_typeof(payment_details->'entries')='array'
   AND jsonb_array_length(payment_details->'entries') BETWEEN 1 AND 100),false)
 );
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('procurement',4,'payment_details');
