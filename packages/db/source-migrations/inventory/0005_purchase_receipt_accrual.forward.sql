-- Historical receipts and bills are retained. Matching is created only by a
-- newly reviewed financial posting; no existing invoice is reclassified.
CREATE TABLE inventory_receipt_bill_match (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,operation_id text NOT NULL,journal_id text NOT NULL,
 bill_id text NOT NULL,bill_line_id text NOT NULL,receipt_operation_id text NOT NULL,receipt_line_id text NOT NULL,
 product_id text NOT NULL,quantity numeric(24,4) NOT NULL,value numeric(38,8) NOT NULL,accrual_account_id text NOT NULL,
 original_match_id text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),
 UNIQUE(tenant_id,company_id,operation_id,bill_line_id,receipt_operation_id,receipt_line_id),
 CHECK((quantity>0 AND value>0 AND original_match_id IS NULL) OR(quantity<0 AND value<0 AND original_match_id IS NOT NULL)),
 FOREIGN KEY(tenant_id,company_id,operation_id) REFERENCES finance_subledger_operation(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,journal_id) REFERENCES journal_entry(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,bill_id) REFERENCES procurement_document(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,receipt_operation_id) REFERENCES inventory_stock_operation(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,accrual_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,original_match_id) REFERENCES inventory_receipt_bill_match(tenant_id,company_id,id)
);
CREATE UNIQUE INDEX stock_bill_compensation_once ON inventory_receipt_bill_match(tenant_id,company_id,original_match_id) WHERE original_match_id IS NOT NULL;
CREATE INDEX stock_bill_receipt_allocation ON inventory_receipt_bill_match(tenant_id,company_id,receipt_operation_id,receipt_line_id);
CREATE TRIGGER stock_bill_match_immutable BEFORE UPDATE OR DELETE ON inventory_receipt_bill_match FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();

CREATE FUNCTION check_stock_bill_match() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op finance_subledger_operation%ROWTYPE;r inventory_stock_operation%ROWTYPE;original inventory_receipt_bill_match%ROWTYPE;
 received jsonb;matched record;approved jsonb;amount numeric;gl numeric;
BEGIN
 SELECT * INTO op FROM finance_subledger_operation WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.operation_id);
 SELECT * INTO r FROM inventory_stock_operation WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.receipt_operation_id) FOR SHARE;
 IF op.state<>'posted' OR op.journal_id IS DISTINCT FROM NEW.journal_id OR r.kind<>'receipt'
  OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,current_setting('nexora.user_id',true),'finance.subledger.post') THEN
  RAISE EXCEPTION 'Receipt accrual matching requires its authorized posted financial operation';END IF;
 approved:=to_jsonb(NEW)-ARRAY['tenant_id','company_id','id','operation_id','journal_id','created_at'];
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(op.preview->'stock_matches') m
  WHERE m-ARRAY['quantity','value']=approved-ARRAY['quantity','value']
   AND (m->>'quantity')::numeric=NEW.quantity AND (m->>'value')::numeric=NEW.value) THEN
  RAISE EXCEPTION 'Receipt matching must retain exact approved financial evidence';END IF;
 SELECT x INTO received FROM jsonb_array_elements(r.preview->'evidence'->'receipt_lines') x WHERE x->>'line_id'=NEW.receipt_line_id AND x->>'product_id'=NEW.product_id;
 IF received IS NULL OR NEW.accrual_account_id IS DISTINCT FROM r.preview->'evidence'->'policy'->>'receipt_accrual_account_id' THEN
  RAISE EXCEPTION 'Receipt matching must reference actual historical stock and accrual mapping';END IF;
 IF NEW.quantity>0 THEN
  IF r.state<>'posted' OR op.type<>'recognition' OR op.payload->>'side'<>'payable' OR op.payload->>'kind'<>'invoice'
   OR op.payload->>'source_document_id' IS DISTINCT FROM NEW.bill_id OR r.movement_date>op.operation_date
   OR NOT EXISTS(SELECT 1 FROM procurement_document b JOIN procurement_document d ON(d.tenant_id,d.company_id,d.id)=(b.tenant_id,b.company_id,r.payload->>'source_id')
    CROSS JOIN LATERAL jsonb_array_elements(b.lines) l WHERE(b.tenant_id,b.company_id,b.id)=(NEW.tenant_id,NEW.company_id,NEW.bill_id)
     AND b.state='approved' AND b.kind='bill' AND d.source_id=b.source_id AND d.supplier_id=b.supplier_id
     AND l->>'id'=NEW.bill_line_id AND l->>'source_line_id'=received->>'order_line_id' AND l->>'product_id'=NEW.product_id) THEN
   RAISE EXCEPTION 'Tracked bill must consume a posted receipt of the same supplier and order line';END IF;
 ELSE
  SELECT * INTO original FROM inventory_receipt_bill_match WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.original_match_id);
  IF original.id IS NULL OR op.type<>'reversal' OR op.payload->>'operation_id' IS DISTINCT FROM original.operation_id
   OR (NEW.bill_id,NEW.bill_line_id,NEW.receipt_operation_id,NEW.receipt_line_id,NEW.product_id,NEW.accrual_account_id,NEW.quantity,NEW.value)
    IS DISTINCT FROM(original.bill_id,original.bill_line_id,original.receipt_operation_id,original.receipt_line_id,original.product_id,original.accrual_account_id,-original.quantity,-original.value) THEN
   RAISE EXCEPTION 'Receipt matching reversal must exactly compensate its original financial source';END IF;
 END IF;
 SELECT sum(quantity) quantity,sum(value) value INTO matched FROM inventory_receipt_bill_match
  WHERE(tenant_id,company_id,receipt_operation_id,receipt_line_id)=(NEW.tenant_id,NEW.company_id,NEW.receipt_operation_id,NEW.receipt_line_id);
 IF matched.quantity<0 OR matched.value<0 OR matched.quantity>(received->>'quantity')::numeric OR matched.value>(received->>'value')::numeric
  OR(matched.quantity=0 AND matched.value<>0) OR(matched.quantity=(received->>'quantity')::numeric AND matched.value<>(received->>'value')::numeric) THEN
  RAISE EXCEPTION 'Bill matching exceeds actual receipt quantity or historical accrual';END IF;
 SELECT sum(value) INTO amount FROM inventory_receipt_bill_match WHERE(tenant_id,company_id,operation_id,accrual_account_id)=(NEW.tenant_id,NEW.company_id,NEW.operation_id,NEW.accrual_account_id);
 SELECT coalesce(sum(base_debit-base_credit),0) INTO gl FROM journal_line WHERE tenant_id=NEW.tenant_id AND journal_id=NEW.journal_id AND account_id=NEW.accrual_account_id;
 IF amount<>gl THEN RAISE EXCEPTION 'Matched receipt accrual must reconcile exactly with its GL clearing effect';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_bill_match_integrity AFTER INSERT ON inventory_receipt_bill_match DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_bill_match();

CREATE FUNCTION require_stock_bill_matching() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op finance_subledger_operation%ROWTYPE;line jsonb;matched numeric;expected integer;
BEGIN
 SELECT * INTO op FROM finance_subledger_operation WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.id);
 IF op.state<>'posted' THEN RETURN NULL;END IF;
 expected:=coalesce(jsonb_array_length(op.preview->'stock_matches'),0);
 IF expected<>(SELECT count(*) FROM inventory_receipt_bill_match WHERE(tenant_id,company_id,operation_id)=(op.tenant_id,op.company_id,op.id)) THEN
  RAISE EXCEPTION 'Every approved receipt allocation must be posted atomically';END IF;
 IF op.type='recognition' AND op.payload->>'side'='payable' AND op.payload->>'kind'='invoice' THEN
  FOR line IN SELECT l FROM procurement_document d CROSS JOIN LATERAL jsonb_array_elements(d.lines) l
   JOIN inventory_product p ON(p.tenant_id,p.company_id,p.id)=(d.tenant_id,d.company_id,l->>'product_id')
   WHERE(d.tenant_id,d.company_id,d.id)=(op.tenant_id,op.company_id,op.payload->>'source_document_id')
    AND p.type='goods' AND(p.details->>'track_inventory')::boolean AND l->>'asset_category_id' IS NULL LOOP
   SELECT sum(quantity) INTO matched FROM inventory_receipt_bill_match WHERE(tenant_id,company_id,operation_id,bill_line_id)=(op.tenant_id,op.company_id,op.id,line->>'id');
   IF matched IS NULL OR matched IS DISTINCT FROM(line->'unit_snapshot'->>'base_quantity')::numeric THEN
    RAISE EXCEPTION 'Tracked supplier invoices require exact posted receipt quantity matching';END IF;
  END LOOP;
 ELSIF op.type='reversal' AND EXISTS(SELECT 1 FROM inventory_receipt_bill_match WHERE(tenant_id,company_id,operation_id)=(op.tenant_id,op.company_id,op.payload->>'operation_id')) THEN
  IF expected<>(SELECT count(*) FROM inventory_receipt_bill_match WHERE(tenant_id,company_id,operation_id)=(op.tenant_id,op.company_id,op.payload->>'operation_id')) THEN
   RAISE EXCEPTION 'AP reversal must compensate all original receipt allocations';END IF;
 END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_bill_matching_required AFTER INSERT OR UPDATE ON finance_subledger_operation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_stock_bill_matching();

CREATE FUNCTION check_stock_receipt_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='receipt' AND NEW.state='reversed' AND EXISTS(SELECT 1 FROM inventory_receipt_bill_match
  WHERE(tenant_id,company_id,receipt_operation_id)=(NEW.tenant_id,NEW.company_id,NEW.id) HAVING sum(quantity)<>0 OR sum(value)<>0) THEN
  RAISE EXCEPTION 'Reverse dependent supplier recognition before stock receipt reversal';END IF;
 IF NEW.kind='reversal' AND NEW.state='posted' AND EXISTS(SELECT 1 FROM inventory_receipt_bill_match m
  JOIN finance_subledger_operation f ON(f.tenant_id,f.company_id,f.id)=(m.tenant_id,m.company_id,m.operation_id)
  WHERE(m.tenant_id,m.company_id,m.receipt_operation_id)=(NEW.tenant_id,NEW.company_id,NEW.payload->>'operation_id') AND f.operation_date>NEW.movement_date) THEN
  RAISE EXCEPTION 'Receipt reversal cannot precede dependent AP accounting history';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_receipt_reversal_integrity AFTER UPDATE ON inventory_stock_operation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_receipt_reversal();
ALTER TABLE inventory_receipt_bill_match ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_receipt_bill_match FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inventory_receipt_bill_match USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
REVOKE ALL ON inventory_receipt_bill_match FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexora_app') THEN GRANT SELECT,INSERT ON inventory_receipt_bill_match TO nexora_app;END IF;END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('inventory',5,'purchase_receipt_accrual');
