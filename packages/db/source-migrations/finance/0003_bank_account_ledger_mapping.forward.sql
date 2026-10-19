CREATE UNIQUE INDEX uq_bank_account_company_ledger_mapping
    ON bank_account (tenant_id,company_id,account_id);

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('finance',3,'bank_account_ledger_mapping');
