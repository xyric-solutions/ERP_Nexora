-- Additive protection: existing accounting history is never rewritten.
CREATE FUNCTION finance_is_subledger_control(t text, c text, a text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM finance_subledger_policy p
  WHERE p.tenant_id=t AND p.company_id=c AND a IN(p.receivable_account_id,p.payable_account_id))
$$;

-- Invoker rights retain RLS. Known semantic dimensions require active company
-- masters; custom dimensions and immutable source metadata retain their meaning.
CREATE FUNCTION finance_validate_dimensions(t text, c text, d jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE k text; v text; found_id text;
BEGIN
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR pg_column_size(d)>8192
    OR (SELECT count(*) FROM jsonb_object_keys(d))>25 THEN
  RAISE EXCEPTION 'Invalid accounting dimensions' USING ERRCODE='23514',CONSTRAINT='finance_dimension_reference';
 END IF;
 IF d ? 'cost_center' AND d ? 'cost_centre' AND d->>'cost_center'<>d->>'cost_centre' THEN
  RAISE EXCEPTION 'Conflicting cost centre identities' USING ERRCODE='23514',CONSTRAINT='finance_dimension_reference';
 END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each_text(d) ORDER BY key,value LOOP
  IF jsonb_typeof(d->k)<>'string' OR length(btrim(k))=0 OR length(k)>64
     OR length(btrim(v))=0 OR length(v)>128 THEN
   RAISE EXCEPTION 'Invalid accounting dimension value' USING ERRCODE='23514',CONSTRAINT='finance_dimension_reference';
  END IF;
  found_id:=NULL;
  IF k='project' THEN
   SELECT id INTO found_id FROM erp_project WHERE tenant_id=t AND company_id=c AND id=v AND status='active' FOR SHARE;
  ELSIF k='location' THEN
   SELECT id INTO found_id FROM erp_location WHERE tenant_id=t AND company_id=c AND id=v AND status='active' FOR SHARE;
  ELSIF k IN('cost_center','cost_centre') THEN
   SELECT id INTO found_id FROM hr_master_record WHERE tenant_id=t AND company_id=c AND id=v AND master_type='cost_center' AND status='active' FOR SHARE;
  ELSIF k IN('department','branch','division','business_unit','warehouse') THEN
   SELECT id INTO found_id FROM organization_unit WHERE tenant_id=t AND id=v AND type=k AND status='active'
    AND organization_unit_is_within_company(t,id,c) FOR SHARE;
  ELSE
   CONTINUE;
  END IF;
  IF found_id IS NULL THEN
   RAISE EXCEPTION 'Accounting dimension is inactive or outside the company' USING ERRCODE='23514',CONSTRAINT='finance_dimension_reference';
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION finance_validate_posting_references(t text, c text, source text, lines jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE line jsonb;
BEGIN
 FOR line IN SELECT value FROM jsonb_array_elements(lines) LOOP
  IF source<>'currency_subledger' AND finance_is_subledger_control(t,c,line->>'accountId') THEN
   RAISE EXCEPTION 'AP/AR control accounts require the governed subledger workflow'
    USING ERRCODE='23514',CONSTRAINT='finance_subledger_control_required';
  END IF;
  PERFORM finance_validate_dimensions(t,c,coalesce(line->'dimensions','{}'::jsonb));
 END LOOP;
END $$;

-- UPDATE/DELETE were already guarded. Protect INSERTs into terminal journals too.
CREATE FUNCTION finance_guard_new_journal_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE header journal_entry%ROWTYPE;
BEGIN
 SELECT * INTO header FROM journal_entry WHERE tenant_id=NEW.tenant_id AND id=NEW.journal_id FOR SHARE;
 IF header.id IS NULL OR header.status<>'draft' THEN
  RAISE EXCEPTION 'Journal lines can only be added to a draft journal'
   USING ERRCODE='23514',CONSTRAINT='finance_journal_line_immutable';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM account WHERE tenant_id=NEW.tenant_id AND company_id=header.company_id AND id=NEW.account_id) THEN
  RAISE EXCEPTION 'Journal account must belong to its company' USING ERRCODE='23514',CONSTRAINT='finance_journal_company';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_journal_line_insert BEFORE INSERT ON journal_line
 FOR EACH ROW EXECUTE FUNCTION finance_guard_new_journal_line();

CREATE OR REPLACE FUNCTION finance_guard_journal_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.journal_id,NEW.id) IS DISTINCT FROM (OLD.tenant_id,OLD.journal_id,OLD.id) THEN
  RAISE EXCEPTION 'Journal line identity cannot be reassigned' USING ERRCODE='23514',CONSTRAINT='finance_journal_line_immutable';
 END IF;
 SELECT status INTO parent_status FROM journal_entry WHERE tenant_id=OLD.tenant_id AND id=OLD.journal_id FOR SHARE;
 IF parent_status IS DISTINCT FROM 'draft' THEN
  RAISE EXCEPTION 'Posted journal lines are immutable' USING ERRCODE='23514',CONSTRAINT='finance_journal_line_immutable';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

-- Deferred: the source operation, GL and open items must be checked in their
-- final atomic state. Header events avoid running an aggregate once per line.
CREATE FUNCTION finance_check_journal_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE header journal_entry%ROWTYPE; original journal_entry%ROWTYPE; event accounting_event%ROWTYPE;
 line journal_line%ROWTYPE; control text; op text; native_currency text; delta numeric; expected numeric;
 base_code text; base_scale integer; dims jsonb;
BEGIN
 IF TG_OP='UPDATE' AND OLD.status<>'draft' THEN RETURN NULL; END IF;
 SELECT * INTO header FROM journal_entry WHERE tenant_id=NEW.tenant_id AND id=NEW.id;
 IF header.status NOT IN('posted','reversed') THEN RETURN NULL; END IF;
 -- Share with other postings, exclude policy adoption until this commit. Use a
 -- separate key from the subledger stream to preserve existing lock ordering.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('finance:control-policy:'||header.tenant_id||':'||header.company_id,0));
 IF NOT EXISTS(SELECT 1 FROM organization_unit WHERE tenant_id=header.tenant_id AND id=header.company_id AND type='company' AND status='active') THEN
  RAISE EXCEPTION 'Active posting company required' USING ERRCODE='23514',CONSTRAINT='finance_journal_company';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM financial_period WHERE tenant_id=header.tenant_id AND company_id=header.company_id
    AND id=header.period_id AND header.posting_date BETWEEN period_start AND period_end AND status='open') THEN
  RAISE EXCEPTION 'Posting requires an open period in the journal company' USING ERRCODE='23514',CONSTRAINT='finance_journal_period';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM journal_line WHERE tenant_id=header.tenant_id AND journal_id=header.id
    HAVING sum(base_debit)>0 AND sum(base_debit)=sum(base_credit)) THEN
  RAISE EXCEPTION 'Posted journals must balance in base currency' USING ERRCODE='23514',CONSTRAINT='finance_journal_balance';
 END IF;
 IF header.source_type='accounting_event' THEN
  SELECT * INTO event FROM accounting_event WHERE tenant_id=header.tenant_id AND id=header.source_id;
  IF event.id IS NULL OR event.state<>'posted' THEN
   RAISE EXCEPTION 'Posted accounting event required' USING ERRCODE='23514',CONSTRAINT='finance_journal_source';
  END IF;
 END IF;
 IF coalesce((event.payload->'resolved'->>'multi_currency')::boolean,false)=false AND EXISTS(
   SELECT 1 FROM journal_line WHERE tenant_id=header.tenant_id AND journal_id=header.id GROUP BY currency HAVING sum(debit)<>sum(credit)) THEN
  RAISE EXCEPTION 'Single currency journals must balance in transaction currency' USING ERRCODE='23514',CONSTRAINT='finance_journal_balance';
 END IF;
 IF header.reverses_journal_id IS NOT NULL THEN
  SELECT * INTO original FROM journal_entry WHERE tenant_id=header.tenant_id AND company_id=header.company_id AND id=header.reverses_journal_id;
  IF original.status IS DISTINCT FROM 'reversed' OR original.reversed_by_journal_id IS DISTINCT FROM header.id
     OR header.posting_date<original.posting_date OR EXISTS(
    (SELECT account_id,debit,credit,currency,fx_rate,base_debit,base_credit,dimensions FROM journal_line WHERE tenant_id=header.tenant_id AND journal_id=header.id
     EXCEPT ALL SELECT account_id,credit,debit,currency,fx_rate,base_credit,base_debit,dimensions FROM journal_line WHERE tenant_id=header.tenant_id AND journal_id=original.id)
    UNION ALL
    (SELECT account_id,credit,debit,currency,fx_rate,base_credit,base_debit,dimensions FROM journal_line WHERE tenant_id=header.tenant_id AND journal_id=original.id
     EXCEPT ALL SELECT account_id,debit,credit,currency,fx_rate,base_debit,base_credit,dimensions FROM journal_line WHERE tenant_id=header.tenant_id AND journal_id=header.id)) THEN
   RAISE EXCEPTION 'Reversal must exactly compensate its original journal' USING ERRCODE='23514',CONSTRAINT='finance_journal_reversal';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM journal_line l LEFT JOIN account a ON a.tenant_id=l.tenant_id AND a.company_id=header.company_id AND a.id=l.account_id
   WHERE l.tenant_id=header.tenant_id AND l.journal_id=header.id AND (a.id IS NULL OR a.status<>'active' OR a.is_header OR NOT a.manual_posting_allowed)) THEN
   RAISE EXCEPTION 'Active company posting account required' USING ERRCODE='23514',CONSTRAINT='finance_journal_company';
  END IF;
  SELECT p.base_currency,c.decimal_places INTO base_code,base_scale FROM company_currency_profile p
   JOIN currency c ON c.tenant_id=p.tenant_id AND c.code=p.base_currency WHERE p.tenant_id=header.tenant_id AND p.company_id=header.company_id;
  IF base_code IS NULL OR EXISTS(
   SELECT 1 FROM journal_line l LEFT JOIN currency c ON c.tenant_id=l.tenant_id AND c.code=l.currency
    LEFT JOIN company_currency cc ON cc.tenant_id=l.tenant_id AND cc.company_id=header.company_id AND cc.currency_code=l.currency
   WHERE l.tenant_id=header.tenant_id AND l.journal_id=header.id AND
    (c.code IS NULL OR c.status<>'active' OR cc.currency_code IS NULL OR cc.status<>'active'
     OR l.debit<>round(l.debit,c.decimal_places) OR l.credit<>round(l.credit,c.decimal_places)
     OR (l.currency=base_code AND l.fx_rate IS NOT NULL) OR (l.currency<>base_code AND l.fx_rate IS NULL)
     OR l.base_debit<>round(l.debit*coalesce(l.fx_rate,1),base_scale)
     OR l.base_credit<>round(l.credit*coalesce(l.fx_rate,1),base_scale))) THEN
   RAISE EXCEPTION 'Journal currencies and base amounts must match company authority'
    USING ERRCODE='23514',CONSTRAINT='finance_journal_currency';
  END IF;
  FOR dims IN SELECT DISTINCT dimensions FROM journal_line WHERE tenant_id=header.tenant_id AND journal_id=header.id LOOP
   PERFORM finance_validate_dimensions(header.tenant_id,header.company_id,dims);
  END LOOP;
 END IF;
 FOR control IN SELECT DISTINCT l.account_id FROM journal_line l WHERE l.tenant_id=header.tenant_id AND l.journal_id=header.id
    AND finance_is_subledger_control(header.tenant_id,header.company_id,l.account_id) LOOP
  SELECT id INTO op FROM finance_subledger_operation WHERE tenant_id=header.tenant_id AND company_id=header.company_id AND journal_id=header.id AND state='posted';
  IF event.source_type IS DISTINCT FROM 'currency_subledger' OR op IS NULL
     OR NOT bank_has_live_permission(header.tenant_id,header.company_id,current_setting('nexora.user_id',true),'finance.subledger.post') THEN
   RAISE EXCEPTION 'Control-account journals require their authorized posted subledger operation'
    USING ERRCODE='23514',CONSTRAINT='finance_subledger_journal_reconciliation';
  END IF;
  SELECT coalesce(sum(base_debit-base_credit),0) INTO delta FROM journal_line WHERE tenant_id=header.tenant_id AND journal_id=header.id AND account_id=control;
  SELECT coalesce(sum(e.base_delta*CASE WHEN i.side='receivable' THEN 1 ELSE -1 END),0) INTO expected
   FROM finance_subledger_item_event e JOIN finance_subledger_item i ON (i.tenant_id,i.company_id,i.id)=(e.tenant_id,e.company_id,e.item_id)
   WHERE e.tenant_id=header.tenant_id AND e.company_id=header.company_id AND e.operation_id=op AND e.journal_id=header.id AND i.control_account_id=control;
  IF delta<>expected OR NOT EXISTS(SELECT 1 FROM finance_subledger_item_event e JOIN finance_subledger_item i ON (i.tenant_id,i.company_id,i.id)=(e.tenant_id,e.company_id,e.item_id)
   WHERE e.tenant_id=header.tenant_id AND e.company_id=header.company_id AND e.operation_id=op AND i.control_account_id=control) THEN
   RAISE EXCEPTION 'GL control effect must match its open-item effect' USING ERRCODE='23514',CONSTRAINT='finance_subledger_journal_reconciliation';
  END IF;
  -- Base-denominated carrying-value/valuation legs are already reconciled above.
  -- Foreign currencies must reconcile individually, including missing GL legs.
  FOR native_currency IN
   SELECT currency FROM journal_line WHERE tenant_id=header.tenant_id AND journal_id=header.id AND account_id=control
    AND currency<>event.payload->'resolved'->>'base_currency'
   UNION
   SELECT i.currency FROM finance_subledger_item_event e JOIN finance_subledger_item i ON (i.tenant_id,i.company_id,i.id)=(e.tenant_id,e.company_id,e.item_id)
    WHERE e.tenant_id=header.tenant_id AND e.company_id=header.company_id AND e.operation_id=op AND i.control_account_id=control
    AND i.currency<>event.payload->'resolved'->>'base_currency'
  LOOP
   SELECT coalesce(sum(debit-credit),0) INTO delta FROM journal_line WHERE tenant_id=header.tenant_id AND journal_id=header.id AND account_id=control AND currency=native_currency;
   SELECT coalesce(sum(e.foreign_delta*CASE WHEN i.side='receivable' THEN 1 ELSE -1 END),0) INTO expected
    FROM finance_subledger_item_event e JOIN finance_subledger_item i ON (i.tenant_id,i.company_id,i.id)=(e.tenant_id,e.company_id,e.item_id)
    WHERE e.tenant_id=header.tenant_id AND e.company_id=header.company_id AND e.operation_id=op AND e.journal_id=header.id AND i.control_account_id=control AND i.currency=native_currency;
   IF delta<>expected THEN
    RAISE EXCEPTION 'Native control effect must match its open-item effect' USING ERRCODE='23514',CONSTRAINT='finance_subledger_journal_reconciliation';
   END IF;
  END LOOP;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER finance_journal_integrity AFTER INSERT OR UPDATE ON journal_entry
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_check_journal_integrity();

-- A normal posting nominal must not become a control account while carrying
-- unmatched GL balances. Do not disguise legacy differences by changing policy.
CREATE FUNCTION finance_guard_control_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE control text; ledger numeric; items numeric; base_code text; native_currency text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('subledger:'||NEW.tenant_id||':'||NEW.company_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('finance:control-policy:'||NEW.tenant_id||':'||NEW.company_id,0));
 SELECT base_currency INTO base_code FROM company_currency_profile WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id;
 FOREACH control IN ARRAY ARRAY[NEW.receivable_account_id,NEW.payable_account_id] LOOP
  IF NOT EXISTS(SELECT 1 FROM account a WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id AND a.id=control
    AND NOT a.is_header AND a.manual_posting_allowed AND NOT a.reconciliation_required AND NOT a.is_system_account
    AND NOT a.managed_bank_nominal AND a.status='active')
    OR EXISTS(SELECT 1 FROM bank_account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND account_id=control) THEN
   RAISE EXCEPTION 'Control accounts must be ordinary eligible company nominals' USING ERRCODE='23514',CONSTRAINT='finance_subledger_control_policy';
  END IF;
  SELECT coalesce(sum(l.base_debit-l.base_credit),0) INTO ledger FROM journal_line l JOIN journal_entry j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
   WHERE j.tenant_id=NEW.tenant_id AND j.company_id=NEW.company_id AND j.status IN('posted','reversed') AND l.account_id=control;
  SELECT coalesce(sum(e.base_delta*CASE WHEN i.side='receivable' THEN 1 ELSE -1 END),0) INTO items
   FROM finance_subledger_item_event e JOIN finance_subledger_item i ON (i.tenant_id,i.company_id,i.id)=(e.tenant_id,e.company_id,e.item_id)
   WHERE i.tenant_id=NEW.tenant_id AND i.company_id=NEW.company_id AND i.control_account_id=control;
  IF ledger<>items THEN
   RAISE EXCEPTION 'Control account GL and open items must reconcile before policy adoption'
    USING ERRCODE='23514',CONSTRAINT='finance_subledger_control_policy';
  END IF;
  FOR native_currency IN
   SELECT DISTINCT l.currency FROM journal_line l JOIN journal_entry j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
    WHERE j.tenant_id=NEW.tenant_id AND j.company_id=NEW.company_id AND j.status IN('posted','reversed') AND l.account_id=control AND l.currency<>base_code
   UNION
   SELECT DISTINCT i.currency FROM finance_subledger_item i WHERE i.tenant_id=NEW.tenant_id AND i.company_id=NEW.company_id AND i.control_account_id=control AND i.currency<>base_code
  LOOP
   SELECT coalesce(sum(l.debit-l.credit),0) INTO ledger FROM journal_line l JOIN journal_entry j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
    WHERE j.tenant_id=NEW.tenant_id AND j.company_id=NEW.company_id AND j.status IN('posted','reversed') AND l.account_id=control AND l.currency=native_currency;
   SELECT coalesce(sum(e.foreign_delta*CASE WHEN i.side='receivable' THEN 1 ELSE -1 END),0) INTO items
    FROM finance_subledger_item_event e JOIN finance_subledger_item i ON (i.tenant_id,i.company_id,i.id)=(e.tenant_id,e.company_id,e.item_id)
    WHERE i.tenant_id=NEW.tenant_id AND i.company_id=NEW.company_id AND i.control_account_id=control AND i.currency=native_currency;
   IF ledger<>items THEN
    RAISE EXCEPTION 'Control account original-currency balances must reconcile before policy adoption'
     USING ERRCODE='23514',CONSTRAINT='finance_subledger_control_policy';
   END IF;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_control_policy_guard BEFORE INSERT ON finance_subledger_policy
 FOR EACH ROW EXECUTE FUNCTION finance_guard_control_policy();

CREATE UNIQUE INDEX finance_accounting_source_operation_once
 ON accounting_event(tenant_id,source_type,source_id,(payload->>'operation'))
 WHERE state='posted' AND payload->>'operation' IN('post','reverse');

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',42,'accounting_integrity_guards');
