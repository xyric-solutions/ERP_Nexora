ALTER TABLE hr_payroll_result_item ADD COLUMN tax_snapshot jsonb;
CREATE FUNCTION guard_finance_tax_payroll_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.module='payroll' AND NOT EXISTS (
 SELECT 1 FROM hr_pay_component deduction JOIN hr_pay_component basis ON basis.tenant_id=deduction.tenant_id AND basis.company_id=deduction.company_id
 WHERE deduction.tenant_id=NEW.tenant_id AND deduction.company_id=NEW.company_id AND deduction.id=NEW.payroll_component_id AND basis.id=NEW.payroll_basis_component_id
 AND deduction.kind='deduction' AND basis.kind='earning' AND deduction.status='active' AND basis.status='active' AND basis.position<deduction.position
 AND deduction.liability_account_id=NEW.account_id) THEN
 RAISE EXCEPTION 'Payroll tax mapping needs active ordered earning and deduction components and the matching liability account' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_tax_payroll_context BEFORE INSERT ON finance_tax_mapping_rule FOR EACH ROW EXECUTE FUNCTION guard_finance_tax_payroll_mapping();
-- Component ids use a tenant primary key; company ownership is also checked above.
ALTER TABLE finance_tax_mapping_rule ADD FOREIGN KEY(tenant_id,payroll_component_id) REFERENCES hr_pay_component(tenant_id,id);
ALTER TABLE finance_tax_mapping_rule ADD FOREIGN KEY(tenant_id,payroll_basis_component_id) REFERENCES hr_pay_component(tenant_id,id);
CREATE FUNCTION guard_payroll_tax_result() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mapping finance_tax_mapping_rule%ROWTYPE; definition finance_tax_revision%ROWTYPE; company text;
BEGIN
 IF NEW.tax_snapshot IS NULL THEN RETURN NEW; END IF;
 SELECT r.company_id INTO company FROM hr_payroll_result r WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.result_id;
 SELECT * INTO mapping FROM finance_tax_mapping_rule WHERE tenant_id=NEW.tenant_id AND company_id=company AND definition_id=NEW.tax_snapshot->>'definition_id' AND revision=(NEW.tax_snapshot->>'revision')::integer;
 SELECT * INTO definition FROM finance_tax_revision WHERE tenant_id=mapping.tenant_id AND company_id=mapping.company_id AND definition_id=mapping.definition_id AND revision=mapping.revision;
 IF mapping.module IS DISTINCT FROM 'payroll' OR mapping.payroll_component_id IS DISTINCT FROM NEW.component_id OR mapping.account_id IS DISTINCT FROM NEW.liability_account_id
 OR NEW.kind<>'deduction' OR NEW.amount<>round((NEW.tax_snapshot->>'basis')::numeric*definition.rate/100,(NEW.tax_snapshot->>'decimal_places')::integer)
 OR NEW.amount<>(NEW.tax_snapshot->>'amount')::numeric THEN
 RAISE EXCEPTION 'Payroll tax result must retain its exact governed mapping and calculation' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_tax_result_guard BEFORE INSERT ON hr_payroll_result_item FOR EACH ROW EXECUTE FUNCTION guard_payroll_tax_result();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',152,'unified_tax_components');
