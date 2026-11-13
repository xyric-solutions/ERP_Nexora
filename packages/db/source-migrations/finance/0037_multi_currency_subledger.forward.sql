-- Persistent monetary open items. No fixture data, grants or journals are created.
CREATE TABLE finance_subledger_party (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('customer','supplier')), code text NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200), default_currency text NOT NULL,
 source_supplier_id text, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 UNIQUE(tenant_id,company_id,source_supplier_id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,default_currency) REFERENCES currency(tenant_id,code)
);
CREATE TABLE finance_subledger_policy (
 tenant_id text NOT NULL, company_id text NOT NULL, version integer NOT NULL CHECK(version>0),
 receivable_account_id text NOT NULL, payable_account_id text NOT NULL,
 revenue_account_id text NOT NULL, expense_account_id text NOT NULL,
 realized_gain_account_id text NOT NULL, realized_loss_account_id text NOT NULL,
 unrealized_gain_account_id text NOT NULL, unrealized_loss_account_id text NOT NULL,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,version),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id)
);
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['receivable','payable','revenue','expense','realized_gain','realized_loss','unrealized_gain','unrealized_loss'] LOOP
 EXECUTE format('ALTER TABLE finance_subledger_policy ADD FOREIGN KEY(tenant_id,company_id,%I) REFERENCES account(tenant_id,company_id,id)',role_name||'_account_id');
 END LOOP;
END $$;
CREATE TABLE finance_subledger_sequence (
 tenant_id text NOT NULL, company_id text NOT NULL, prefix text NOT NULL, next_value bigint NOT NULL CHECK(next_value>0),
 PRIMARY KEY(tenant_id,company_id,prefix), FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id)
);
CREATE TABLE finance_subledger_operation (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, code text NOT NULL,
 type text NOT NULL CHECK(type IN ('recognition','settlement','offset','revaluation','reversal')),
 operation_date date NOT NULL, state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','approved','rejected','posted')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), maker_id text NOT NULL, approver_id text,
 payload jsonb NOT NULL, preview jsonb, preview_hash text, journal_id text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,maker_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,approver_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,journal_id) REFERENCES journal_entry(tenant_id,company_id,id),
 CHECK(approver_id IS NULL OR approver_id<>maker_id),
 CHECK((state='posted')=(journal_id IS NOT NULL)),
 CHECK(state NOT IN ('submitted','approved','posted') OR (preview IS NOT NULL AND preview_hash IS NOT NULL)),
 CHECK(state NOT IN ('approved','posted') OR approver_id IS NOT NULL)
);
CREATE INDEX finance_subledger_operation_directory ON finance_subledger_operation(tenant_id,company_id,operation_date,id);
CREATE TABLE finance_subledger_item (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, code text NOT NULL, operation_id text NOT NULL,
 party_id text NOT NULL, side text NOT NULL CHECK(side IN ('receivable','payable')),
 kind text NOT NULL CHECK(kind IN ('invoice','credit_note','advance')), currency text NOT NULL, base_currency text NOT NULL,
 decimal_places smallint NOT NULL CHECK(decimal_places BETWEEN 0 AND 8), base_decimal_places smallint NOT NULL CHECK(base_decimal_places BETWEEN 0 AND 8),
 document_date date NOT NULL, due_date date NOT NULL CHECK(due_date>=document_date),
 original_amount numeric(38,8) NOT NULL CHECK(original_amount<>0), original_base numeric(38,8) NOT NULL CHECK(original_base<>0),
 monetary boolean NOT NULL, control_account_id text NOT NULL, journal_id text NOT NULL,
 rate numeric(38,18) NOT NULL CHECK(rate>0), rate_id text, source_document_id text,
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,operation_id),
 UNIQUE(tenant_id,company_id,side,source_document_id),
 FOREIGN KEY(tenant_id,company_id,operation_id) REFERENCES finance_subledger_operation(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,party_id) REFERENCES finance_subledger_party(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,control_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,journal_id) REFERENCES journal_entry(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,currency) REFERENCES currency(tenant_id,code),
 FOREIGN KEY(tenant_id,company_id,base_currency) REFERENCES company_currency_profile(tenant_id,company_id,base_currency),
 FOREIGN KEY(tenant_id,rate_id) REFERENCES currency_rate(tenant_id,id),
 CHECK((kind='invoice' AND original_amount>0 AND original_base>0) OR (kind<>'invoice' AND original_amount<0 AND original_base<0)),
 CHECK(monetary OR kind='advance')
);
CREATE INDEX finance_subledger_item_party ON finance_subledger_item(tenant_id,company_id,party_id,document_date,id);
CREATE TABLE finance_subledger_item_event (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, item_id text NOT NULL,
 operation_id text NOT NULL, event_date date NOT NULL,
 foreign_delta numeric(38,8) NOT NULL, base_delta numeric(38,8) NOT NULL,
 historical_delta numeric(38,8) NOT NULL, unrealized_delta numeric(38,8) NOT NULL,
 journal_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,item_id,operation_id),
 FOREIGN KEY(tenant_id,company_id,item_id) REFERENCES finance_subledger_item(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,operation_id) REFERENCES finance_subledger_operation(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,journal_id) REFERENCES journal_entry(tenant_id,company_id,id),
 CHECK(base_delta=historical_delta+unrealized_delta)
);
CREATE INDEX finance_subledger_event_asof ON finance_subledger_item_event(tenant_id,company_id,item_id,event_date,id);
CREATE TABLE finance_subledger_audit (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 operation_id text, action text NOT NULL, actor_id text NOT NULL, reason text NOT NULL,
 evidence jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,operation_id) REFERENCES finance_subledger_operation(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE finance_subledger_idempotency (
 tenant_id text NOT NULL, company_id text NOT NULL, actor_id text NOT NULL, key text NOT NULL,
 fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,actor_id,key), FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id)
);
CREATE FUNCTION guard_finance_subledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Posted subledger evidence is immutable' USING ERRCODE='23514';
END $$;
CREATE FUNCTION guard_finance_subledger_operation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.state='posted' THEN RAISE EXCEPTION 'Financial operations cannot be deleted or edited after posting' USING ERRCODE='23514'; END IF;
 IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.payload,NEW.maker_id,NEW.operation_date,NEW.type)
    IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.payload,OLD.maker_id,OLD.operation_date,OLD.type)
    OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Operation identity or version changed' USING ERRCODE='40001'; END IF;
 IF NOT ((OLD.state IN ('draft','rejected') AND NEW.state='submitted') OR
         (OLD.state IN ('submitted','approved') AND NEW.state='rejected') OR
         (OLD.state='submitted' AND NEW.state='approved') OR
         (OLD.state='approved' AND NEW.state='posted')) THEN
    RAISE EXCEPTION 'Invalid subledger lifecycle transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_subledger_operation_guard BEFORE UPDATE OR DELETE ON finance_subledger_operation FOR EACH ROW EXECUTE FUNCTION guard_finance_subledger_operation();
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['finance_subledger_party','finance_subledger_policy','finance_subledger_sequence','finance_subledger_operation','finance_subledger_item','finance_subledger_item_event','finance_subledger_audit','finance_subledger_idempotency'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY company_scope ON %I USING (tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS (SELECT 1 FROM security_user_company_access access WHERE access.tenant_id=%I.tenant_id AND access.company_id=%I.company_id AND access.user_id=current_setting(''nexora.user_id'',true) AND access.revoked_at IS NULL)) WITH CHECK (tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS (SELECT 1 FROM security_user_company_access access WHERE access.tenant_id=%I.tenant_id AND access.company_id=%I.company_id AND access.user_id=current_setting(''nexora.user_id'',true) AND access.revoked_at IS NULL))',relation,relation,relation,relation,relation);
 END LOOP;
 FOREACH relation IN ARRAY ARRAY['finance_subledger_party','finance_subledger_policy','finance_subledger_item','finance_subledger_item_event','finance_subledger_audit','finance_subledger_idempotency'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_finance_subledger_immutable()',relation);
 END LOOP;
END $$;
CREATE FUNCTION check_finance_subledger_effect() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE operation_state text; operation_journal text; operation_date date; total_foreign numeric; total_base numeric; item_original numeric;
 control_id text; ledger_effect numeric; subledger_effect numeric;
BEGIN
 SELECT state,journal_id,finance_subledger_operation.operation_date INTO operation_state,operation_journal,operation_date FROM finance_subledger_operation
  WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.operation_id;
 IF operation_state<>'posted' OR operation_journal IS DISTINCT FROM NEW.journal_id OR operation_date IS DISTINCT FROM NEW.event_date THEN
  RAISE EXCEPTION 'Subledger effects require their atomic posted journal' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM journal_entry WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.journal_id AND posting_date=NEW.event_date AND status IN ('posted','reversed'))
    OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,current_setting('nexora.user_id',true),'finance.subledger.post') THEN
  RAISE EXCEPTION 'Subledger posting requires current company authority and a posted journal' USING ERRCODE='23514'; END IF;
 SELECT sum(foreign_delta),sum(base_delta) INTO total_foreign,total_base FROM finance_subledger_item_event
  WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND item_id=NEW.item_id;
 SELECT original_amount,control_account_id INTO item_original,control_id FROM finance_subledger_item
  WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.item_id;
 IF abs(total_foreign)>abs(item_original) OR total_foreign*item_original<0 OR
    (total_foreign=0 AND total_base<>0) OR total_base*item_original<0 THEN
  RAISE EXCEPTION 'Open-item balances violate their original amount or carrying-value invariant' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(base_debit-base_credit),0) INTO ledger_effect FROM journal_line
  WHERE tenant_id=NEW.tenant_id AND journal_id=NEW.journal_id AND account_id=control_id;
 SELECT coalesce(sum(e.base_delta*(CASE WHEN i.side='receivable' THEN 1 ELSE -1 END)),0) INTO subledger_effect
  FROM finance_subledger_item_event e JOIN finance_subledger_item i ON i.tenant_id=e.tenant_id AND i.company_id=e.company_id AND i.id=e.item_id
  WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.operation_id=NEW.operation_id AND i.control_account_id=control_id;
 IF ledger_effect<>subledger_effect THEN
  RAISE EXCEPTION 'Open-item effects must reconcile to their journal control account' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER finance_subledger_effect_guard AFTER INSERT ON finance_subledger_item_event
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_finance_subledger_effect();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',37,'multi_currency_subledger');
