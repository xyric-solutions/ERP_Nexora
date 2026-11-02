-- HR76 deliberately parked these integrations while Banking was under delivery.
-- Restore the retained obligation and settlement guards against the governed
-- Banking payment/posting boundary. Existing records and amounts are untouched.
CREATE TRIGGER salary_bank_payment_allocation
  AFTER UPDATE ON bank_payment FOR EACH ROW
  EXECUTE FUNCTION allocate_posted_salary_bank_payment();
CREATE TRIGGER salary_bound_bank_guard
  BEFORE UPDATE ON bank_payment FOR EACH ROW
  EXECUTE FUNCTION guard_salary_bound_bank_evidence();
CREATE TRIGGER salary_bound_journal_guard
  BEFORE UPDATE ON journal_entry FOR EACH ROW
  EXECUTE FUNCTION guard_salary_bound_bank_evidence();

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',132,'enable_salary_banking_consumption');
