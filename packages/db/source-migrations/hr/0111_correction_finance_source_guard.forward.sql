CREATE FUNCTION protect_hr_correction_finance_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND EXISTS(SELECT 1 FROM hr_settlement_correction_execution e WHERE e.tenant_id=OLD.tenant_id AND e.company_id=OLD.company_id AND e.journal_id=OLD.id AND e.state='posted') THEN RAISE EXCEPTION 'Use a compensating settlement Payroll correction; Finance-only reversal would leave tax carry-forwards unchanged';END IF;RETURN NEW;
END $$;
CREATE TRIGGER hr_correction_finance_source BEFORE UPDATE ON journal_entry FOR EACH ROW EXECUTE FUNCTION protect_hr_correction_finance_source();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',111,'correction_finance_source_guard');
