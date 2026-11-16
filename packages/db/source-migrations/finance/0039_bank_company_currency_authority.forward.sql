-- Align new Bank drafts with the existing company currency resolver. Historical
-- submitted/posted evidence remains frozen under its original authority.
DO $$ DECLARE kind text;BEGIN
 FOREACH kind IN ARRAY ARRAY['payment','receipt'] LOOP
 EXECUTE format($body$
 CREATE OR REPLACE FUNCTION validate_bank_%s_currency() RETURNS trigger LANGUAGE plpgsql AS $function$
 DECLARE bank_currency text; selected_rate currency_rate%%ROWTYPE;
 BEGIN
  IF TG_OP='UPDATE' AND OLD.state<>'draft' AND
   (NEW.bank_account_id,NEW.transaction_currency,NEW.base_currency,NEW.exchange_rate_id,NEW.exchange_rate_value,NEW.posting_date)
    IS NOT DISTINCT FROM (OLD.bank_account_id,OLD.transaction_currency,OLD.base_currency,OLD.exchange_rate_id,OLD.exchange_rate_value,OLD.posting_date) THEN RETURN NEW; END IF;
  SELECT currency INTO bank_currency FROM bank_account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.bank_account_id;
  IF bank_currency IS DISTINCT FROM NEW.transaction_currency THEN RAISE EXCEPTION 'Bank transaction currency must match the company bank' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM company_currency_profile p JOIN currency c ON c.tenant_id=p.tenant_id AND c.code=p.base_currency
    JOIN company_currency b ON b.tenant_id=p.tenant_id AND b.company_id=p.company_id AND b.currency_code=p.base_currency
    WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id AND p.status='active' AND p.base_currency=NEW.base_currency AND c.status='active' AND b.status='active' AND b.is_base)
   OR NOT EXISTS(SELECT 1 FROM company_currency c JOIN currency s ON s.tenant_id=c.tenant_id AND s.code=c.currency_code WHERE c.tenant_id=NEW.tenant_id AND c.company_id=NEW.company_id AND c.currency_code=NEW.transaction_currency AND c.status='active' AND s.status='active') THEN
   RAISE EXCEPTION 'New Bank drafts require active company currency authority' USING ERRCODE='23514';END IF;
  IF NEW.transaction_currency=NEW.base_currency THEN
   IF NEW.exchange_rate_id IS NOT NULL OR NEW.exchange_rate_value<>1 THEN RAISE EXCEPTION 'Base-currency Bank documents use the implicit unit rate' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(finance_currency_rate_lock_key(NEW.tenant_id,NEW.transaction_currency,NEW.base_currency));
  SELECT * INTO selected_rate FROM currency_rate WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.exchange_rate_id AND status='active' FOR SHARE;
  IF NOT FOUND OR selected_rate.source_currency<>NEW.transaction_currency OR selected_rate.target_currency<>NEW.base_currency OR selected_rate.effective_date>NEW.posting_date OR selected_rate.rate<>NEW.exchange_rate_value THEN
   RAISE EXCEPTION 'Bank exchange rate must match company currency authority and posting date' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END
 $function$;
 $body$,kind);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',39,'bank_company_currency_authority');
