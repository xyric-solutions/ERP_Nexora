-- Calculation progress only: zero currency accrual does not create a GL entry or financial effect.
CREATE TABLE fixed_asset_zero_accrual_observation (
 tenant_id text NOT NULL,company_id text NOT NULL,asset_id text NOT NULL,asset_version integer NOT NULL,
 period_end date NOT NULL,observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,asset_id),
 FOREIGN KEY(tenant_id,company_id,asset_id) REFERENCES fixed_asset_record(tenant_id,company_id,id)
);
ALTER TABLE fixed_asset_zero_accrual_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_asset_zero_accrual_observation FORCE ROW LEVEL SECURITY;
CREATE POLICY zero_accrual_tenant ON fixed_asset_zero_accrual_observation
 USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('fixed_assets',7,'zero_accrual_observations');
