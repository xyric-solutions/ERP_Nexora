-- Durable high-water marks: historical identifiers are never renumbered or reused.
ALTER TABLE hr_pay_component DROP CONSTRAINT hr_pay_component_code_check;
ALTER TABLE hr_pay_component ADD CONSTRAINT hr_pay_component_code_check
  CHECK (code ~ '^[A-Za-z][A-Za-z0-9_]{0,39}$' OR code ~ '^PAY-[0-9]{3,}$');
CREATE TABLE hr_record_code_counter (
  tenant_id text NOT NULL REFERENCES tenant(id),
  scope_id text NOT NULL,
  record_kind text NOT NULL,
  next_value bigint NOT NULL CHECK (next_value > 0),
  PRIMARY KEY (tenant_id, scope_id, record_kind)
);
ALTER TABLE hr_record_code_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_record_code_counter FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_record_code_counter_tenant ON hr_record_code_counter
  USING (tenant_id = current_setting('nexora.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));
INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',131,'automatic_record_codes');
