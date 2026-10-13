DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration
        WHERE module_name = 'platform' AND version = 5
    ) THEN
        RAISE EXCEPTION 'Pakistan reference release requires Platform migration 5';
    END IF;
END $$;

INSERT INTO country (
    code, alpha3, name, subnational_mode, status, valid_from, source_version
) VALUES (
    'PK', 'PAK', 'Pakistan', 'required', 'active', DATE '1947-08-14',
    'urn:iso:std:iso:3166:-1:2020:PK'
) ON CONFLICT (code) DO NOTHING;

INSERT INTO jurisdiction (
    id, country_code, parent_id, code, name, level, kind, status, valid_from,
    source_version
) VALUES (
    'pk-national', 'PK', NULL, 'PK', 'Pakistan', 'national', 'national',
    'active', DATE '1947-08-14',
    'https://pakistancode.gov.pk/english/UY2FqaJw1-apaUY2Fqa-apaUY2JqZ5w%3D-sg-jjjjjjjjjjjjj'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO legal_entity_type (
    id, country_code, code, name, status, valid_from, source_version
) VALUES (
    'pk-company', 'PK', 'company', 'Company under the Companies Act, 2017',
    'active', DATE '2017-05-30',
    'https://www.secp.gov.pk/document/companies-act-2017/'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('platform', 6, 'pakistan_reference_release');

