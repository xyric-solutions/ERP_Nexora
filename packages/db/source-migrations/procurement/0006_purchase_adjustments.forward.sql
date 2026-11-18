-- Additive, zero-default adjustments preserve historical purchase totals.
ALTER TABLE procurement_document
 ADD COLUMN discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
 ADD COLUMN additional_charges jsonb NOT NULL DEFAULT '[]'::jsonb CHECK
 (jsonb_typeof(additional_charges)='array' AND jsonb_array_length(additional_charges)<=30);
ALTER TABLE procurement_document ADD CONSTRAINT procurement_payment_no_purchase_adjustments
 CHECK (kind NOT IN ('payment','multi_payment') OR (discount_amount=0 AND additional_charges='[]'::jsonb));
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('procurement',6,'purchase_adjustments');
