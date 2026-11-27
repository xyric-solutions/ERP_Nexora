ALTER TABLE tenant
    ADD COLUMN organisation_type text CHECK (organisation_type IN ('sole_proprietorship', 'partnership', 'private_limited', 'public_limited', 'non_profit', 'government', 'other')),
    ADD COLUMN country_code text CHECK (country_code ~ '^[A-Z]{2}$'),
    ADD COLUMN financial_year_start_month smallint CHECK (financial_year_start_month BETWEEN 1 AND 12),
    ADD COLUMN registered_at timestamptz,
    ADD COLUMN registered_by text,
    ADD CONSTRAINT tenant_registration_evidence CHECK (
        (registered_at IS NULL AND registered_by IS NULL) OR
        (registered_at IS NOT NULL AND registered_by IS NOT NULL AND organisation_type IS NOT NULL
         AND country_code IS NOT NULL AND financial_year_start_month IS NOT NULL)
    );

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('platform', 12, 'tenant_profile');
