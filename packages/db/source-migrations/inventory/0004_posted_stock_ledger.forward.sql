-- Additive only: no opening plan, receipt, transfer or order is posted/backfilled.
CREATE TABLE inventory_stock_policy (
 tenant_id text NOT NULL,company_id text NOT NULL,version integer NOT NULL CHECK(version>0),
 receipt_accrual_account_id text NOT NULL,opening_account_id text NOT NULL,wip_account_id text NOT NULL,variance_account_id text NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,version),FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,receipt_accrual_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,opening_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,wip_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,variance_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE inventory_stock_valuation (
 tenant_id text NOT NULL,company_id text NOT NULL,product_id text NOT NULL,version integer NOT NULL CHECK(version>0),
 method text NOT NULL CHECK(method IN('fifo','weighted_average')),stock_account_id text NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,product_id,version),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,stock_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE inventory_stock_operation (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,code text NOT NULL CHECK(code ~ '^STK-[0-9]{3,}$'),
 kind text NOT NULL CHECK(kind IN('opening','receipt','transfer','manufacturing_issue','manufacturing_completion','delivery','return','reversal')),
 movement_date date NOT NULL,payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','submitted','approved','rejected','cancelled','posted','reversed')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),maker_id text NOT NULL,approver_id text,poster_id text,
 journal_id text,accounting_event_id text,preview jsonb,preview_hash text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),UNIQUE(tenant_id,company_id,code),
 UNIQUE(tenant_id,company_id,journal_id),
 CHECK(payload->>'kind'=kind AND payload->>'company_id'=company_id AND payload->>'date'=movement_date::text),
 CHECK(state NOT IN('submitted','approved','posted','reversed') OR (preview IS NOT NULL AND length(preview_hash)=64)),
 CHECK(state NOT IN('approved','posted','reversed') OR (approver_id IS NOT NULL AND approver_id<>maker_id)),
 CHECK((state IN('posted','reversed') AND journal_id IS NOT NULL AND accounting_event_id IS NOT NULL AND poster_id IS NOT NULL)
  OR(state NOT IN('posted','reversed') AND journal_id IS NULL AND accounting_event_id IS NULL AND poster_id IS NULL)),
 CHECK(poster_id IS NULL OR poster_id<>maker_id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,maker_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,approver_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,poster_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,journal_id) REFERENCES journal_entry(tenant_id,id),
 FOREIGN KEY(tenant_id,accounting_event_id) REFERENCES accounting_event(tenant_id,id)
);
CREATE UNIQUE INDEX stock_single_source ON inventory_stock_operation(tenant_id,company_id,kind,(payload->>'source_id'))
 WHERE kind IN('receipt','transfer','delivery','return') AND state NOT IN('cancelled','reversed');
CREATE UNIQUE INDEX stock_single_reversal ON inventory_stock_operation(tenant_id,company_id,(payload->>'operation_id'))
 WHERE kind='reversal' AND state<>'cancelled';
CREATE INDEX stock_operations_company_date ON inventory_stock_operation(tenant_id,company_id,movement_date,code);
CREATE INDEX stock_operation_source ON inventory_stock_operation(tenant_id,company_id,kind,(payload->>'source_id'),state);
CREATE TABLE inventory_stock_entry (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,operation_id text NOT NULL,line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 200),
 sequence bigint GENERATED ALWAYS AS IDENTITY,kind text NOT NULL,movement_date date NOT NULL,
 product_id text NOT NULL,warehouse_id text NOT NULL,unit text NOT NULL,
 quantity numeric(24,4) NOT NULL,value numeric(38,8) NOT NULL,currency text NOT NULL,account_id text NOT NULL,
 method text NOT NULL CHECK(method IN('fifo','weighted_average')),valuation_version integer NOT NULL,
 original_entry_id text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),UNIQUE(tenant_id,company_id,operation_id,line_no),
 CHECK((quantity>0 AND value>0) OR(quantity<0 AND value<0)),
 FOREIGN KEY(tenant_id,company_id,operation_id) REFERENCES inventory_stock_operation(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,warehouse_id) REFERENCES inventory_warehouse(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,product_id,valuation_version) REFERENCES inventory_stock_valuation(tenant_id,company_id,product_id,version),
 FOREIGN KEY(tenant_id,company_id,original_entry_id) REFERENCES inventory_stock_entry(tenant_id,company_id,id)
);
CREATE UNIQUE INDEX stock_opening_once ON inventory_stock_entry(tenant_id,company_id,product_id,warehouse_id) WHERE kind='opening';
CREATE UNIQUE INDEX stock_entry_compensation_once ON inventory_stock_entry(tenant_id,company_id,original_entry_id) WHERE kind='reversal';
CREATE INDEX stock_entry_balance ON inventory_stock_entry(tenant_id,company_id,product_id,warehouse_id,movement_date,sequence);
CREATE TABLE inventory_stock_cost_allocation (
 tenant_id text NOT NULL,company_id text NOT NULL,entry_id text NOT NULL,incoming_entry_id text NOT NULL,
 quantity numeric(24,4) NOT NULL,value numeric(38,8) NOT NULL,CHECK((quantity>0 AND value>0)OR(quantity<0 AND value<0)),
 PRIMARY KEY(tenant_id,company_id,entry_id,incoming_entry_id),CHECK(entry_id<>incoming_entry_id),
 FOREIGN KEY(tenant_id,company_id,entry_id) REFERENCES inventory_stock_entry(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,incoming_entry_id) REFERENCES inventory_stock_entry(tenant_id,company_id,id)
);
CREATE TABLE inventory_stock_audit (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,entity_type text NOT NULL CHECK(entity_type IN('policy','valuation','operation')),
 entity_id text NOT NULL,version integer NOT NULL,actor_id text NOT NULL,action text NOT NULL,reason text NOT NULL,
 snapshot jsonb NOT NULL,audit_event_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,entity_type,entity_id,version),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
CREATE TABLE inventory_stock_request (
 tenant_id text NOT NULL,company_id text NOT NULL,actor_id text NOT NULL,idempotency_key text NOT NULL,
 request_hash text NOT NULL CHECK(length(request_hash)=64),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,actor_id,idempotency_key),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id)
);

CREATE FUNCTION guard_stock_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Stock operations must be retained';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.approver_id IS NOT NULL OR NEW.poster_id IS NOT NULL OR NEW.preview IS NOT NULL
   OR NEW.maker_id IS DISTINCT FROM current_setting('nexora.user_id',true)
   OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.maker_id,'inventory.stock.manage') THEN
   RAISE EXCEPTION 'An authorized stock maker and initial draft are required';END IF;
 ELSE
  IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.kind,NEW.movement_date,NEW.payload,NEW.maker_id,NEW.created_at)
   IS DISTINCT FROM(OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.kind,OLD.movement_date,OLD.payload,OLD.maker_id,OLD.created_at)
   OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Stock identity, payload and versions are protected';END IF;
  IF NOT ((OLD.state IN('draft','rejected') AND NEW.state IN('submitted','cancelled'))
    OR(OLD.state='submitted' AND NEW.state IN('approved','rejected'))
    OR(OLD.state='approved' AND NEW.state IN('posted','rejected'))
    OR(OLD.state='posted' AND NEW.state='reversed')) THEN RAISE EXCEPTION 'Invalid stock lifecycle transition';END IF;
  IF NEW.state IN('submitted','cancelled') AND (current_setting('nexora.user_id',true)<>NEW.maker_id
    OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.maker_id,'inventory.stock.manage')) THEN RAISE EXCEPTION 'Stock maker authority required';END IF;
  IF NEW.state IN('approved','rejected') AND (current_setting('nexora.user_id',true)=NEW.maker_id
    OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,current_setting('nexora.user_id',true),'inventory.stock.approve')) THEN RAISE EXCEPTION 'Independent stock approval required';END IF;
  IF NEW.state='approved' AND (NEW.approver_id IS DISTINCT FROM current_setting('nexora.user_id',true) OR NEW.preview IS DISTINCT FROM OLD.preview OR NEW.preview_hash IS DISTINCT FROM OLD.preview_hash) THEN RAISE EXCEPTION 'Stock approval must retain submitted evidence';END IF;
  IF NEW.state IN('posted','reversed') AND (current_setting('nexora.user_id',true)=NEW.maker_id
    OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,current_setting('nexora.user_id',true),'inventory.stock.post')) THEN RAISE EXCEPTION 'Stock posting authority required';END IF;
  IF NEW.state='posted' AND (NEW.poster_id IS DISTINCT FROM current_setting('nexora.user_id',true) OR NEW.preview IS DISTINCT FROM OLD.preview OR NEW.preview_hash IS DISTINCT FROM OLD.preview_hash OR NEW.approver_id IS DISTINCT FROM OLD.approver_id) THEN RAISE EXCEPTION 'Stock posting must retain approved evidence';END IF;
  IF NEW.state='reversed' AND (to_jsonb(NEW)-ARRAY['state','version','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','updated_at']) THEN RAISE EXCEPTION 'Stock reversal preserves original accounting evidence';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_operation_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON inventory_stock_operation FOR EACH ROW EXECUTE FUNCTION guard_stock_operation();

CREATE FUNCTION require_stock_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entity text;identity text;actor text;record jsonb;revision integer;
BEGIN
 entity:=CASE TG_TABLE_NAME WHEN 'inventory_stock_policy' THEN 'policy' WHEN 'inventory_stock_valuation' THEN 'valuation' ELSE 'operation' END;
 identity:=CASE entity WHEN 'policy' THEN NEW.company_id WHEN 'valuation' THEN to_jsonb(NEW)->>'product_id' ELSE to_jsonb(NEW)->>'id' END;
 IF entity='operation' THEN
  SELECT to_jsonb(x) INTO record FROM inventory_stock_operation x WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.id);
  revision:=(record->>'version')::int;
 ELSE record:=to_jsonb(NEW);revision:=NEW.version;END IF;
 IF NOT EXISTS(SELECT 1 FROM inventory_stock_audit e JOIN platform_admin_audit_event a ON(a.tenant_id,a.id)=(e.tenant_id,e.audit_event_id)
  WHERE(e.tenant_id,e.company_id,e.entity_type,e.entity_id,e.version)=(NEW.tenant_id,NEW.company_id,entity,identity,revision)
   AND e.snapshot=record AND a.entity_id=identity AND a.actor_id=e.actor_id AND a.action='inventory.stock.'||entity||'.'||e.action) THEN
  RAISE EXCEPTION 'Stock changes require immutable matching audit evidence';END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION guard_stock_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE nominal text;expected text;existing integer;prior_method text;product inventory_product%ROWTYPE;
BEGIN
 IF NEW.created_by IS DISTINCT FROM current_setting('nexora.user_id',true) OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.created_by,'inventory.stock.configure') THEN RAISE EXCEPTION 'Authorized reviewed stock configuration required';END IF;
 IF TG_TABLE_NAME='inventory_stock_policy' THEN
  SELECT coalesce(max(version),0) INTO existing FROM inventory_stock_policy WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id;
  FOR nominal,expected IN SELECT * FROM(VALUES(NEW.receipt_accrual_account_id,'liability'),(NEW.opening_account_id,'equity'),(NEW.wip_account_id,'asset'),(NEW.variance_account_id,'expense')) mappings LOOP
   IF NOT EXISTS(SELECT 1 FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=nominal AND type=expected AND status='active' AND NOT is_header AND manual_posting_allowed AND NOT reconciliation_required AND NOT managed_bank_nominal)
    OR finance_is_subledger_control(NEW.tenant_id,NEW.company_id,nominal) THEN RAISE EXCEPTION 'Select an eligible active stock accounting nominal';END IF;
  END LOOP;
  IF (SELECT count(DISTINCT v) FROM unnest(ARRAY[NEW.receipt_accrual_account_id,NEW.opening_account_id,NEW.wip_account_id,NEW.variance_account_id])v)<>4 THEN RAISE EXCEPTION 'Stock mapping roles require distinct nominals';END IF;
 ELSE
  SELECT coalesce(max(version),0),max(method) INTO existing,prior_method FROM inventory_stock_valuation WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND product_id=NEW.product_id;
  SELECT * INTO product FROM inventory_product WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.product_id;
  IF product.id IS NULL OR product.status<>'active' OR product.type<>'goods' OR (product.details->>'track_inventory')::boolean IS DISTINCT FROM true OR product.stock_account_id IS DISTINCT FROM NEW.stock_account_id
   OR NOT EXISTS(SELECT 1 FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.stock_account_id AND type='asset' AND status='active' AND NOT is_header AND manual_posting_allowed AND NOT reconciliation_required AND NOT managed_bank_nominal)
   OR finance_is_subledger_control(NEW.tenant_id,NEW.company_id,NEW.stock_account_id) THEN RAISE EXCEPTION 'Stock valuation requires the product active stock asset nominal';END IF;
  IF EXISTS(SELECT 1 FROM inventory_stock_entry WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND product_id=NEW.product_id) AND
   EXISTS(SELECT 1 FROM inventory_stock_valuation WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND product_id=NEW.product_id AND method<>NEW.method) THEN RAISE EXCEPTION 'A posted product valuation method requires a separate governed cutover';END IF;
 END IF;
 IF NEW.version<>existing+1 THEN RAISE EXCEPTION 'Current stock configuration version required';END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION protect_posted_stock_product() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.stock_account_id,NEW.details->>'unit',NEW.details->>'unit_id',NEW.details->>'track_inventory') IS DISTINCT FROM
 (OLD.stock_account_id,OLD.details->>'unit',OLD.details->>'unit_id',OLD.details->>'track_inventory') AND EXISTS(
 SELECT 1 FROM inventory_stock_entry WHERE tenant_id=OLD.tenant_id AND company_id=OLD.company_id AND product_id=OLD.id) THEN
 RAISE EXCEPTION 'Posted product stock nominal, base unit and tracking require a governed cutover';END IF;RETURN NEW;
END $$;
CREATE TRIGGER posted_stock_product BEFORE UPDATE ON inventory_product FOR EACH ROW EXECUTE FUNCTION protect_posted_stock_product();
CREATE FUNCTION protect_stock_transfer_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id text;
BEGIN
 source_id:=coalesce(to_jsonb(OLD)->>'transfer_id',to_jsonb(OLD)->>'id');
 IF EXISTS(SELECT 1 FROM inventory_stock_operation WHERE tenant_id=OLD.tenant_id AND company_id=OLD.company_id AND kind='transfer' AND payload->>'source_id'=source_id AND state IN('submitted','approved','posted','reversed')) THEN
  RAISE EXCEPTION 'Reject, cancel or compensate the stock posting before editing its transfer source';END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER posted_transfer_source BEFORE UPDATE OR DELETE ON inventory_transfer FOR EACH ROW EXECUTE FUNCTION protect_stock_transfer_source();
CREATE TRIGGER posted_transfer_line BEFORE UPDATE OR DELETE ON inventory_transfer_line FOR EACH ROW EXECUTE FUNCTION protect_stock_transfer_source();

CREATE FUNCTION check_stock_posting() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE CONSTRAINT TRIGGER stock_operation_integrity AFTER INSERT OR UPDATE ON inventory_stock_operation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_posting();
CREATE CONSTRAINT TRIGGER stock_entry_integrity AFTER INSERT ON inventory_stock_entry DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_posting();
-- A generic Finance reversal cannot detach stock from its original journal.
CREATE FUNCTION check_stock_journal_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event accounting_event%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='accounting_event' THEN
  SELECT * INTO event FROM accounting_event WHERE(tenant_id,id)=(NEW.tenant_id,NEW.id);
  IF event.state='posted' AND event.source_type='inventory_stock' AND NOT EXISTS(
   SELECT 1 FROM inventory_stock_operation o JOIN journal_entry j ON(j.tenant_id,j.company_id,j.id)=(o.tenant_id,o.company_id,o.journal_id)
    WHERE(o.tenant_id,o.accounting_event_id)=(event.tenant_id,event.id) AND j.source_id=event.id
    AND o.state IN('posted','reversed') AND (CASE WHEN o.kind='reversal' THEN o.payload->>'operation_id' ELSE o.id END)=event.source_id) THEN
   RAISE EXCEPTION 'Stock accounting events require their controlled operational posting';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM inventory_stock_operation o JOIN journal_entry j ON(j.tenant_id,j.id)=(o.tenant_id,o.journal_id)
   WHERE(o.tenant_id,o.journal_id)=(NEW.tenant_id,NEW.id)
    AND (o.state NOT IN('posted','reversed') OR j.status<>CASE WHEN o.state='reversed' THEN 'reversed' ELSE 'posted' END)) THEN
   RAISE EXCEPTION 'Stock journals may be reversed only through their controlled stock operation';END IF;
 END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_accounting_source_integrity AFTER INSERT OR UPDATE ON accounting_event DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_journal_source();
CREATE CONSTRAINT TRIGGER stock_journal_source_integrity AFTER INSERT OR UPDATE ON journal_entry DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_journal_source();
CREATE FUNCTION check_stock_cost_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE incoming inventory_stock_entry%ROWTYPE;outgoing inventory_stock_entry%ROWTYPE;
BEGIN
 SELECT * INTO incoming FROM inventory_stock_entry WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.incoming_entry_id);
 SELECT * INTO outgoing FROM inventory_stock_entry WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.entry_id);
 IF incoming.quantity<=0 OR (NEW.quantity>0 AND outgoing.quantity>=0) OR (incoming.product_id,incoming.warehouse_id,incoming.method) IS DISTINCT FROM(outgoing.product_id,outgoing.warehouse_id,'fifo')
  OR incoming.sequence>=outgoing.sequence OR incoming.movement_date>outgoing.movement_date
  OR EXISTS(SELECT 1 FROM inventory_stock_cost_allocation WHERE(tenant_id,company_id,incoming_entry_id)=(NEW.tenant_id,NEW.company_id,NEW.incoming_entry_id) HAVING sum(quantity)>incoming.quantity OR sum(value)>incoming.value OR sum(quantity)<0 OR sum(value)<0)
  OR (NEW.quantity<0 AND (outgoing.kind<>'reversal' OR outgoing.quantity<=0 OR NOT EXISTS(
   SELECT 1 FROM inventory_stock_cost_allocation a WHERE(a.tenant_id,a.company_id,a.entry_id,a.incoming_entry_id)=(NEW.tenant_id,NEW.company_id,outgoing.original_entry_id,NEW.incoming_entry_id) AND a.quantity=-NEW.quantity AND a.value=-NEW.value)))
 THEN RAISE EXCEPTION 'FIFO cost allocation exceeds or does not exactly compensate its source stock evidence';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_cost_allocation_integrity AFTER INSERT ON inventory_stock_cost_allocation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_cost_allocation();

DO $$ DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['inventory_stock_policy','inventory_stock_valuation','inventory_stock_operation','inventory_stock_entry','inventory_stock_cost_allocation','inventory_stock_audit','inventory_stock_request'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',name);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',name);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexora_app') THEN EXECUTE format('GRANT SELECT,INSERT ON %I TO nexora_app',name);END IF;
  IF name<>'inventory_stock_operation' THEN EXECUTE format('CREATE TRIGGER stock_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation()',name);END IF;
 END LOOP;
 FOREACH name IN ARRAY ARRAY['inventory_stock_policy','inventory_stock_valuation','inventory_stock_operation'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER stock_audit_required AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_stock_audit()',name);
 END LOOP;
 FOREACH name IN ARRAY ARRAY['inventory_stock_policy','inventory_stock_valuation'] LOOP
  EXECUTE format('CREATE TRIGGER stock_configuration_guard BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION guard_stock_configuration()',name);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexora_app') THEN GRANT UPDATE ON inventory_stock_operation TO nexora_app;GRANT USAGE,SELECT ON SEQUENCE inventory_stock_entry_sequence_seq TO nexora_app;END IF;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('inventory',4,'posted_stock_ledger');
