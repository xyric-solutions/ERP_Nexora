-- Repair Bank Transfer date columns for databases that applied an early version
-- of the Transfer migration before posting/value dates were added.

ALTER TABLE bank_transfer
  ADD COLUMN IF NOT EXISTS posting_date date,
  ADD COLUMN IF NOT EXISTS value_date date;

-- Legacy drafts predate explicit posting-date capture. Preserve them with the
-- closest authoritative date already stored on the record.
UPDATE bank_transfer
   SET posting_date = created_at::date
 WHERE posting_date IS NULL;

ALTER TABLE bank_transfer
  ALTER COLUMN posting_date SET NOT NULL;

DROP INDEX IF EXISTS bank_transfer_directory;
CREATE INDEX bank_transfer_directory
  ON bank_transfer(tenant_id,company_id,state,posting_date DESC,id DESC);

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('finance',27,'bank_transfer_date_columns');
