-- Nullable fields preserve historical invoices and clients omitting bill terms.
ALTER TABLE procurement_document ADD COLUMN bill_date date, ADD COLUMN payment_term text;
-- Version 1 used an unnamed check. Locate just that date check rather than
-- depending on PostgreSQL's generated constraint numbering.
DO $$ DECLARE date_check record; BEGIN
 FOR date_check IN SELECT conname FROM pg_constraint
 WHERE conrelid='procurement_document'::regclass AND contype='c'
 AND pg_get_constraintdef(oid) LIKE '%due_date%'
 AND pg_get_constraintdef(oid) LIKE '%document_date%'
 LOOP EXECUTE format('ALTER TABLE procurement_document DROP CONSTRAINT %I',date_check.conname); END LOOP;
END $$;
ALTER TABLE procurement_document
 ADD CONSTRAINT procurement_bill_dates_kind CHECK (kind='bill' OR (bill_date IS NULL AND payment_term IS NULL)),
 ADD CONSTRAINT procurement_bill_payment_term CHECK (payment_term IS NULL OR
  (bill_date IS NOT NULL AND payment_term IN ('immediate','days_15','days_21','days_30','days_45',
   'end_following_month','days_10_after_end_next_month','percent_30_now_balance_60_days'))),
 ADD CONSTRAINT procurement_due_date_basis CHECK (due_date IS NULL OR
  due_date >= CASE WHEN kind='bill' THEN coalesce(bill_date,document_date) ELSE document_date END);
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('procurement',5,'bill_dates_payment_terms');
