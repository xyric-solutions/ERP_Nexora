ALTER TABLE inventory_stock_operation DROP CONSTRAINT inventory_stock_operation_kind_check;
ALTER TABLE inventory_stock_operation ADD CONSTRAINT inventory_stock_operation_kind_check CHECK(kind IN('opening','receipt','transfer','manufacturing_issue','manufacturing_completion','manufacturing_charge','delivery','return','reversal'));
CREATE TABLE inventory_production_cost_allocation(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,operation_id text NOT NULL,batch_id text NOT NULL,source_line_id text NOT NULL,
 value numeric(30,8) NOT NULL CHECK(value<>0),original_allocation_id text,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),UNIQUE(tenant_id,operation_id,source_line_id),UNIQUE(tenant_id,original_allocation_id),
 CHECK((value<0)=(original_allocation_id IS NOT NULL)),
 FOREIGN KEY(tenant_id,company_id,operation_id) REFERENCES inventory_stock_operation(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,batch_id) REFERENCES inventory_stock_operation(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,source_line_id) REFERENCES journal_line(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,original_allocation_id) REFERENCES inventory_production_cost_allocation(tenant_id,company_id,id)
);
CREATE INDEX production_cost_source ON inventory_production_cost_allocation(tenant_id,company_id,source_line_id);
CREATE INDEX production_cost_batch ON inventory_production_cost_allocation(tenant_id,company_id,batch_id);
CREATE TRIGGER production_cost_immutable BEFORE UPDATE OR DELETE ON inventory_production_cost_allocation FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();
CREATE FUNCTION production_expense_has_credit(t text,c text,source_journal text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM finance_subledger_item i JOIN finance_subledger_operation credit ON(credit.tenant_id,credit.company_id,credit.payload->>'original_item_id')=(i.tenant_id,i.company_id,i.id)
 WHERE(i.tenant_id,i.company_id,i.journal_id)=(t,c,source_journal) AND credit.state='posted' AND credit.type='recognition' AND credit.payload->>'kind'='credit_note'
 AND NOT EXISTS(SELECT 1 FROM finance_subledger_operation r WHERE(r.tenant_id,r.company_id,r.payload->>'operation_id')=(credit.tenant_id,credit.company_id,credit.id) AND r.type='reversal' AND r.state='posted'));
$$;
CREATE FUNCTION guard_production_cost_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source journal_line%ROWTYPE;journal journal_entry%ROWTYPE;op inventory_stock_operation%ROWTYPE;batch inventory_stock_operation%ROWTYPE;original inventory_production_cost_allocation%ROWTYPE;allocated numeric;
BEGIN
 SELECT * INTO source FROM journal_line WHERE(tenant_id,id)=(NEW.tenant_id,NEW.source_line_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('production-source:'||NEW.tenant_id||':'||source.journal_id,0));
 SELECT * INTO journal FROM journal_entry WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,source.journal_id);
 SELECT * INTO op FROM inventory_stock_operation WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.operation_id);
 SELECT * INTO batch FROM inventory_stock_operation WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.batch_id);
 IF journal.id IS NULL OR batch.id IS NULL OR batch.kind<>'manufacturing_issue' OR batch.state<>'posted' OR op.movement_date<batch.movement_date OR op.movement_date<journal.posting_date THEN RAISE EXCEPTION 'Actual production charge source/company/date mismatch';END IF;
 IF EXISTS(SELECT 1 FROM inventory_stock_operation o WHERE o.tenant_id=NEW.tenant_id AND o.company_id=NEW.company_id AND o.kind='manufacturing_completion' AND o.payload->>'source_id'=NEW.batch_id AND o.state='posted') THEN RAISE EXCEPTION 'Compensate completed output before changing batch costs';END IF;
 IF NEW.value>0 THEN
  IF production_expense_has_credit(NEW.tenant_id,NEW.company_id,journal.id) THEN RAISE EXCEPTION 'Resolve source credit before allocating its expense';END IF;
  IF op.kind<>'manufacturing_charge' OR op.payload->>'source_id'<>NEW.batch_id OR journal.status<>'posted' OR source.base_debit<=source.base_credit OR NOT EXISTS(SELECT 1 FROM account a WHERE(a.tenant_id,a.company_id,a.id)=(NEW.tenant_id,NEW.company_id,source.account_id) AND a.type='expense' AND a.status='active' AND NOT a.is_header AND NOT a.is_system_account AND NOT a.managed_bank_nominal AND NOT a.reconciliation_required AND NOT finance_is_subledger_control(a.tenant_id,a.company_id,a.id)) OR EXISTS(SELECT 1 FROM accounting_event e WHERE(e.tenant_id,e.id)=(journal.tenant_id,journal.source_id) AND e.source_type='inventory_stock') THEN RAISE EXCEPTION 'Eligible posted expense evidence required';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(op.payload->'allocations') line WHERE line->>'journal_line_id'=NEW.source_line_id AND(line->>'amount')::numeric=NEW.value) THEN RAISE EXCEPTION 'Cost allocation must match its reviewed operation';END IF;
 ELSE
  SELECT * INTO original FROM inventory_production_cost_allocation WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.original_allocation_id);
  IF op.kind<>'reversal' OR original.operation_id IS DISTINCT FROM op.payload->>'operation_id' OR(original.batch_id,original.source_line_id,original.value) IS DISTINCT FROM(NEW.batch_id,NEW.source_line_id,-NEW.value) THEN RAISE EXCEPTION 'Exact original cost allocation compensation required';END IF;
 END IF;
 SELECT coalesce(sum(value),0)+NEW.value INTO allocated FROM inventory_production_cost_allocation WHERE(tenant_id,company_id,source_line_id)=(NEW.tenant_id,NEW.company_id,NEW.source_line_id);
 IF allocated<0 OR allocated>source.base_debit-source.base_credit THEN RAISE EXCEPTION 'Expense source cannot be capitalized twice or over-reversed';END IF;
 RETURN NEW;END $$;
CREATE TRIGGER production_cost_allocation_guard BEFORE INSERT ON inventory_production_cost_allocation FOR EACH ROW EXECUTE FUNCTION guard_production_cost_allocation();
CREATE FUNCTION validate_production_cost_posting(t text,c text,operation text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE op inventory_stock_operation%ROWTYPE;batch inventory_stock_operation%ROWTYPE;total numeric;wip text;dims jsonb;original text;
BEGIN
 SELECT * INTO op FROM inventory_stock_operation WHERE(tenant_id,company_id,id)=(t,c,operation);
 IF op.kind='manufacturing_charge' THEN
  IF jsonb_array_length(op.payload->'allocations')<>(SELECT count(*) FROM inventory_production_cost_allocation WHERE(tenant_id,company_id,operation_id)=(t,c,op.id)) THEN RAISE EXCEPTION 'All approved production cost allocations are required';END IF;
 ELSE
  original:=op.payload->>'operation_id';
  IF(SELECT count(*) FROM inventory_production_cost_allocation WHERE(tenant_id,company_id,operation_id)=(t,c,op.id))<>(SELECT count(*) FROM inventory_production_cost_allocation WHERE(tenant_id,company_id,operation_id)=(t,c,original)) THEN RAISE EXCEPTION 'Complete cost compensation required';END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM inventory_stock_entry WHERE(tenant_id,company_id,operation_id)=(t,c,op.id)) OR jsonb_array_length(op.preview->'entries')<>0 THEN RAISE EXCEPTION 'Production charges change value, never physical quantities';END IF;
 SELECT sum(value),min(batch_id) INTO total,original FROM inventory_production_cost_allocation WHERE(tenant_id,company_id,operation_id)=(t,c,op.id);
 IF total IS NULL OR total=0 THEN RAISE EXCEPTION 'Actual production cost evidence required';END IF;
 SELECT * INTO batch FROM inventory_stock_operation WHERE(tenant_id,company_id,id)=(t,c,original);wip:=batch.preview#>>'{evidence,wip_account_id}';
 SELECT line->'dimensions' INTO dims FROM jsonb_array_elements(batch.preview->'lines') line WHERE line->>'accountId'=wip AND(line->>'debit')::numeric>0 LIMIT 1;
 IF wip IS NULL OR dims IS NULL THEN RAISE EXCEPTION 'Original WIP authority required';END IF;
 IF EXISTS(WITH expected AS(
  SELECT wip account_id,dims dimensions,total amount UNION ALL
  SELECT l.account_id,l.dimensions,-a.value FROM inventory_production_cost_allocation a JOIN journal_line l ON(l.tenant_id,l.id)=(a.tenant_id,a.source_line_id) WHERE(a.tenant_id,a.company_id,a.operation_id)=(t,c,op.id)
 ), wanted AS(SELECT account_id,dimensions,sum(amount) amount FROM expected GROUP BY account_id,dimensions),actual AS(
 SELECT account_id,dimensions,sum(base_debit-base_credit) amount FROM journal_line WHERE tenant_id=t AND journal_id=op.journal_id GROUP BY account_id,dimensions)
 SELECT 1 FROM((SELECT * FROM wanted EXCEPT SELECT * FROM actual) UNION ALL(SELECT * FROM actual EXCEPT SELECT * FROM wanted)) mismatch) THEN RAISE EXCEPTION 'Actual production WIP and expense journal effects must reconcile exactly';END IF;
END $$;
CREATE FUNCTION protect_allocated_expense_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status<>'posted' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('production-source:'||NEW.tenant_id||':'||NEW.id,0));
  IF EXISTS(SELECT 1 FROM inventory_production_cost_allocation a JOIN journal_line l ON(l.tenant_id,l.id)=(a.tenant_id,a.source_line_id) WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id AND l.journal_id=NEW.id GROUP BY a.source_line_id HAVING sum(a.value)>0) THEN RAISE EXCEPTION 'Compensate production cost allocations before reversing the original expense';END IF;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER allocated_expense_source BEFORE UPDATE ON journal_entry FOR EACH ROW EXECUTE FUNCTION protect_allocated_expense_source();
CREATE FUNCTION protect_allocated_ap_credit() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE source_journal text;BEGIN
 IF NEW.state='posted' AND NEW.type='recognition' AND NEW.payload->>'kind'='credit_note' THEN
  SELECT journal_id INTO source_journal FROM finance_subledger_item WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.payload->>'original_item_id');
  IF source_journal IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('production-source:'||NEW.tenant_id||':'||source_journal,0));
   IF EXISTS(SELECT 1 FROM inventory_production_cost_allocation a JOIN journal_line l ON(l.tenant_id,l.id)=(a.tenant_id,a.source_line_id) WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id AND l.journal_id=source_journal GROUP BY a.source_line_id HAVING sum(a.value)>0) THEN RAISE EXCEPTION 'Compensate production allocations before crediting their source expense';END IF;
  END IF;
 END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER production_source_credit AFTER INSERT OR UPDATE ON finance_subledger_operation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION protect_allocated_ap_credit();
ALTER TABLE inventory_production_cost_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_production_cost_allocation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inventory_production_cost_allocation USING(tenant_id=current_setting('nexora.tenant_id',true) AND EXISTS(SELECT 1 FROM security_user_company_access x WHERE x.tenant_id=inventory_production_cost_allocation.tenant_id AND x.company_id=inventory_production_cost_allocation.company_id AND x.user_id=current_setting('nexora.user_id',true) AND x.revoked_at IS NULL)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true) AND EXISTS(SELECT 1 FROM security_user_company_access x WHERE x.tenant_id=inventory_production_cost_allocation.tenant_id AND x.company_id=inventory_production_cost_allocation.company_id AND x.user_id=current_setting('nexora.user_id',true) AND x.revoked_at IS NULL));
REVOKE ALL ON inventory_production_cost_allocation FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexora_app') THEN GRANT SELECT,INSERT ON inventory_production_cost_allocation TO nexora_app;END IF;END $$;

CREATE OR REPLACE FUNCTION check_stock_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op inventory_stock_operation%ROWTYPE;entry inventory_stock_entry%ROWTYPE;balance record;role text;value_delta numeric;gl_delta numeric;
BEGIN
 SELECT * INTO op FROM inventory_stock_operation WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,coalesce(to_jsonb(NEW)->>'operation_id',to_jsonb(NEW)->>'id'));
 IF op.state NOT IN('posted','reversed') THEN
  IF EXISTS(SELECT 1 FROM inventory_stock_entry WHERE(tenant_id,company_id,operation_id)=(op.tenant_id,op.company_id,op.id)) THEN RAISE EXCEPTION 'Unposted stock cannot have ledger effects';END IF;RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM journal_entry j JOIN accounting_event e ON(e.tenant_id,e.id)=(j.tenant_id,j.source_id)
  WHERE(j.tenant_id,j.company_id,j.id)=(op.tenant_id,op.company_id,op.journal_id) AND j.status=CASE WHEN op.state='posted' THEN 'posted' ELSE 'reversed' END
   AND j.source_type='accounting_event' AND e.id=op.accounting_event_id AND e.state='posted' AND e.source_type='inventory_stock'
   AND e.source_id=CASE WHEN op.kind='reversal' THEN op.payload->>'operation_id' ELSE op.id END) THEN RAISE EXCEPTION 'Stock requires its actual centrally posted journal';END IF;
 IF op.state='reversed' AND NOT EXISTS(SELECT 1 FROM inventory_stock_operation r WHERE r.tenant_id=op.tenant_id AND r.company_id=op.company_id AND r.kind='reversal' AND r.payload->>'operation_id'=op.id AND r.state='posted') THEN RAISE EXCEPTION 'Stock reversal requires its controlled compensating operation';END IF;
 IF op.kind='manufacturing_charge' OR(op.kind='reversal' AND EXISTS(SELECT 1 FROM inventory_stock_operation original WHERE(original.tenant_id,original.company_id,original.id)=(op.tenant_id,op.company_id,op.payload->>'operation_id') AND original.kind='manufacturing_charge')) THEN PERFORM validate_production_cost_posting(op.tenant_id,op.company_id,op.id);RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM inventory_stock_entry WHERE(tenant_id,company_id,operation_id)=(op.tenant_id,op.company_id,op.id)) THEN RAISE EXCEPTION 'Posted stock requires real quantity and value entries';END IF;
 FOR entry IN SELECT * FROM inventory_stock_entry WHERE(tenant_id,company_id,operation_id)=(op.tenant_id,op.company_id,op.id) LOOP
  IF entry.kind<>op.kind OR entry.movement_date<>op.movement_date OR NOT EXISTS(SELECT 1 FROM company_currency_profile p JOIN currency c ON(c.tenant_id,c.code)=(p.tenant_id,p.base_currency) WHERE(p.tenant_id,p.company_id,p.base_currency)=(entry.tenant_id,entry.company_id,entry.currency) AND entry.value=round(entry.value,c.decimal_places)) THEN RAISE EXCEPTION 'Stock dates, currency and value precision must match accounting authority';END IF;
  IF entry.value<>(op.preview->'entries'->(entry.line_no-1)->>'value')::numeric OR entry.quantity<>(op.preview->'entries'->(entry.line_no-1)->>'quantity')::numeric
   OR entry.product_id IS DISTINCT FROM op.preview->'entries'->(entry.line_no-1)->>'product_id' OR entry.warehouse_id IS DISTINCT FROM op.preview->'entries'->(entry.line_no-1)->>'warehouse_id'
   OR entry.account_id IS DISTINCT FROM op.preview->'entries'->(entry.line_no-1)->>'account_id' THEN RAISE EXCEPTION 'Stock ledger must match approved quantities and values';END IF;
  SELECT sum(quantity) AS quantity,sum(value) AS value INTO balance FROM inventory_stock_entry WHERE tenant_id=entry.tenant_id AND company_id=entry.company_id AND product_id=entry.product_id AND warehouse_id=entry.warehouse_id;
  IF balance.quantity<0 OR balance.value<0 OR(balance.quantity=0 AND balance.value<>0) OR(balance.quantity>0 AND balance.value=0) THEN RAISE EXCEPTION 'Posted stock quantity and value cannot be negative or leave residual value';END IF;
  IF entry.quantity<0 AND entry.method='fifo' AND NOT EXISTS(SELECT 1 FROM inventory_stock_cost_allocation WHERE(tenant_id,company_id,entry_id)=(entry.tenant_id,entry.company_id,entry.id) HAVING sum(quantity)=-entry.quantity AND sum(value)=-entry.value) THEN RAISE EXCEPTION 'FIFO issues require exact cost allocations';END IF;
  IF entry.quantity>0 AND entry.method='fifo' AND entry.kind='reversal' AND NOT EXISTS(SELECT 1 FROM inventory_stock_cost_allocation WHERE(tenant_id,company_id,entry_id)=(entry.tenant_id,entry.company_id,entry.id) HAVING sum(quantity)=-entry.quantity AND sum(value)=-entry.value) THEN RAISE EXCEPTION 'FIFO compensation must restore exact original allocations';END IF;
 END LOOP;
 IF (SELECT count(*) FROM inventory_stock_entry WHERE(tenant_id,company_id,operation_id)=(op.tenant_id,op.company_id,op.id))<>jsonb_array_length(op.preview->'entries') THEN RAISE EXCEPTION 'Stock posting must include all approved entries';END IF;
 FOR role IN SELECT DISTINCT account_id FROM inventory_stock_entry WHERE(tenant_id,company_id,operation_id)=(op.tenant_id,op.company_id,op.id) LOOP
  SELECT sum(value) INTO value_delta FROM inventory_stock_entry WHERE(tenant_id,company_id,operation_id,account_id)=(op.tenant_id,op.company_id,op.id,role);
  SELECT coalesce(sum(base_debit-base_credit),0) INTO gl_delta FROM journal_line WHERE tenant_id=op.tenant_id AND journal_id=op.journal_id AND account_id=role;
  IF value_delta<>gl_delta THEN RAISE EXCEPTION 'Stock value must reconcile with its GL asset effect';END IF;
 END LOOP;RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER production_cost_posting AFTER INSERT ON inventory_production_cost_allocation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_posting();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('inventory',7,'production_cost_allocations');
