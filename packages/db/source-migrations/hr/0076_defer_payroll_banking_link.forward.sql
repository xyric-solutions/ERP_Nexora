-- Banking is being delivered by another developer; keep Payroll integration inactive until handoff.
DROP TRIGGER IF EXISTS salary_bank_payment_allocation ON bank_payment;
DROP TRIGGER IF EXISTS salary_bound_bank_guard ON bank_payment;
DROP TRIGGER IF EXISTS salary_bound_journal_guard ON journal_entry;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',76,'defer_payroll_banking_link');
