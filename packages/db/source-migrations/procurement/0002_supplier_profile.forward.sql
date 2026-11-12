-- Additive supplier details; existing identities, audit history and legacy fields remain intact.
ALTER TABLE procurement_supplier
 ADD COLUMN profile jsonb NOT NULL DEFAULT '{}'::jsonb
 CHECK (jsonb_typeof(profile) = 'object' AND octet_length(profile::text) <= 65536);

INSERT INTO nexora_schema_migration(module_name,version,name)
 VALUES ('procurement',2,'supplier_profile');
