-- Permit base-currency Bank Account ledgers in governed Manual Journals.
-- Recurring Journal templates remain restricted by the API to ordinary nominals.

CREATE OR REPLACE FUNCTION guard_manual_journal_line() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    header manual_journal%ROWTYPE;
    target_tenant text;
    target_journal text;
    nominal account%ROWTYPE;
    governed_general boolean := false;
    eligible_bank boolean := false;
BEGIN
    target_tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    target_journal:=CASE WHEN TG_OP='DELETE' THEN OLD.journal_id ELSE NEW.journal_id END;
    SELECT * INTO header FROM manual_journal
     WHERE tenant_id=target_tenant AND id=target_journal FOR SHARE;
    -- A parent-driven ON DELETE CASCADE runs after the guarded draft header is
    -- no longer visible. Direct line deletion still finds and validates it.
    IF TG_OP='DELETE' AND header.id IS NULL THEN
        RETURN OLD;
    END IF;
    IF header.id IS NULL OR header.state<>'draft' THEN
        RAISE EXCEPTION 'Manual Journal lines are mutable only while draft' USING ERRCODE='23514';
    END IF;
    IF TG_OP<>'DELETE' THEN
        SELECT * INTO nominal FROM account
         WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.account_id FOR SHARE;

        IF nominal.id IS NOT NULL THEN
            governed_general := nominal.managed_general_nominal
                AND NOT nominal.managed_bank_nominal
                AND EXISTS (
                    SELECT 1 FROM finance_general_nominal governed
                     WHERE governed.tenant_id=nominal.tenant_id
                       AND governed.company_id=nominal.company_id
                       AND governed.nominal_id=nominal.id
                       AND governed.state='active'
                );
            eligible_bank := nominal.managed_bank_nominal
                AND NOT nominal.managed_general_nominal
                AND nominal.reconciliation_required
                AND EXISTS (
                    SELECT 1 FROM bank_account bank
                     WHERE bank.tenant_id=nominal.tenant_id
                       AND bank.company_id=nominal.company_id
                       AND bank.account_id=nominal.id
                       AND bank.status='active'
                       AND bank.currency=header.base_currency
                );
        END IF;

        IF nominal.id IS NULL OR nominal.status<>'active' OR nominal.is_header
           OR NOT nominal.manual_posting_allowed OR nominal.is_system_account
           OR NOT (governed_general OR eligible_bank) THEN
            RAISE EXCEPTION 'Manual Journal requires an active eligible company nominal; Bank nominals must use the company base currency'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$$;

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('finance',33,'manual_journal_bank_nominals');
