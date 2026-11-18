-- One governed operation / journal per Purchase instruction. Existing control
-- reconciliation, maker/checker and immutable-event triggers remain unchanged.
ALTER TABLE finance_subledger_operation DROP CONSTRAINT finance_subledger_operation_type_check;
ALTER TABLE finance_subledger_operation ADD CONSTRAINT finance_subledger_operation_type_check
 CHECK(type IN ('recognition','settlement','offset','revaluation','reversal','purchase_payment'));
CREATE INDEX finance_subledger_purchase_source ON finance_subledger_operation
 (tenant_id,company_id,(payload->>'source_document_id'),created_at) WHERE type IN ('recognition','purchase_payment');
CREATE INDEX finance_subledger_reversal_source ON finance_subledger_operation
 (tenant_id,company_id,(payload->>'operation_id'),operation_date) WHERE type='reversal' AND state='posted';
CREATE INDEX finance_subledger_posted_journal ON finance_subledger_operation
 (tenant_id,company_id,journal_id) WHERE journal_id IS NOT NULL;
ALTER TABLE finance_subledger_item DROP CONSTRAINT finance_subledger_item_tenant_id_company_id_operation_id_key;
ALTER TABLE finance_subledger_item ADD UNIQUE(tenant_id,company_id,operation_id,party_id,kind);
CREATE FUNCTION guard_finance_subledger_group_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM finance_subledger_item WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND operation_id=NEW.operation_id)
 AND NOT EXISTS(SELECT 1 FROM finance_subledger_operation WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.operation_id AND type='purchase_payment') THEN
 RAISE EXCEPTION 'Only Purchase payment groups may create multiple supplier items' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_subledger_group_item_guard BEFORE INSERT ON finance_subledger_item
 FOR EACH ROW EXECUTE FUNCTION guard_finance_subledger_group_item();
-- Source accounting mappings remain correctable before review. Identity and
-- approved/posted payloads stay immutable; an edit always returns to draft.
CREATE OR REPLACE FUNCTION guard_finance_subledger_operation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.state='posted' THEN RAISE EXCEPTION 'Financial operations cannot be deleted or edited after posting' USING ERRCODE='23514'; END IF;
 IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.maker_id,NEW.operation_date,NEW.type)
    IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.maker_id,OLD.operation_date,OLD.type)
    OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Operation identity or version changed' USING ERRCODE='40001'; END IF;
 IF NEW.state='draft' AND OLD.state IN ('draft','rejected') AND OLD.type IN ('recognition','purchase_payment')
    AND EXISTS(SELECT 1 FROM procurement_accounting_link l WHERE l.tenant_id=OLD.tenant_id AND l.company_id=OLD.company_id AND l.operation_id=OLD.id) THEN
   IF (NEW.payload-ARRAY['discount_account_id','advance_account_id','advance_monetary','tax_definition_id','additional_tax_definition_id','tax_account_id','bank_fee'])
       IS DISTINCT FROM (OLD.payload-ARRAY['discount_account_id','advance_account_id','advance_monetary','tax_definition_id','additional_tax_definition_id','tax_account_id','bank_fee'])
      OR OLD.maker_id<>current_setting('nexora.user_id',true)
      OR NOT bank_has_live_permission(OLD.tenant_id,OLD.company_id,current_setting('nexora.user_id',true),'finance.subledger.manage')
      OR NEW.approver_id IS NOT NULL OR NEW.journal_id IS NOT NULL OR NEW.preview_hash IS NOT NULL OR NEW.preview IS NULL THEN
      RAISE EXCEPTION 'Only the maker may revise unreviewed source accounting mappings' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 IF NEW.payload IS DISTINCT FROM OLD.payload THEN RAISE EXCEPTION 'Reviewed financial payload is immutable' USING ERRCODE='23514'; END IF;
 IF NOT ((OLD.state IN ('draft','rejected') AND NEW.state='submitted') OR
         (OLD.state IN ('submitted','approved') AND NEW.state='rejected') OR
         (OLD.state='submitted' AND NEW.state='approved') OR
         (OLD.state='approved' AND NEW.state='posted')) THEN
    RAISE EXCEPTION 'Invalid subledger lifecycle transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',40,'purchase_payment_groups');
