-- Durable fair scan cursors contain identifiers only; business results retain tenant RLS.
CREATE TABLE fixed_asset_worker_cursor (
 id text PRIMARY KEY,last_key text,updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO fixed_asset_worker_cursor(id) VALUES('tenants');
CREATE TABLE fixed_asset_preparation_result (
 tenant_id text NOT NULL,company_id text NOT NULL,status text NOT NULL,
 error_code text,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id)
);
ALTER TABLE fixed_asset_preparation_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_asset_preparation_result FORCE ROW LEVEL SECURITY;
CREATE POLICY fixed_asset_preparation_result_tenant ON fixed_asset_preparation_result
 USING(tenant_id=current_setting('nexora.tenant_id',true))
 WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
INSERT INTO nexora_schema_migration(module_name,version,name)
 VALUES('fixed_assets',5,'draft_preparation');
