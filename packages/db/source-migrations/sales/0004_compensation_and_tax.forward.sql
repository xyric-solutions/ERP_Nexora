-- Retain original source/tax evidence and require dependent compensation first.
CREATE FUNCTION protect_sales_compensation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original text;source text;root record;invoiced numeric;delivered numeric;
BEGIN
 IF TG_TABLE_NAME='finance_subledger_operation' THEN
  IF NEW.type<>'reversal' OR NEW.state='rejected' THEN RETURN NEW;END IF;
  SELECT sales_document_id INTO source FROM finance_subledger_operation WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.payload->>'operation_id');
  IF source IS NOT NULL AND EXISTS(SELECT 1 FROM sales_document WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND kind='credit' AND source_id=source AND state<>'cancelled') THEN RAISE EXCEPTION 'Compensate and cancel dependent commercial credits before reversing the original invoice';END IF;
 ELSE
  IF NEW.kind<>'reversal' OR NEW.state IN('cancelled','rejected') THEN RETURN NEW;END IF;
  original:=NEW.payload->>'operation_id';
  SELECT sales_document_id INTO source FROM inventory_stock_operation WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,original) AND kind='delivery';
  IF source IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM sales_document WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND kind='return' AND source_id=source AND state<>'cancelled') THEN RAISE EXCEPTION 'Compensate and cancel dependent physical returns before reversing delivery';END IF;
   FOR root IN SELECT DISTINCT fulfillment_source_id,fulfillment_source_line_id FROM sales_document_line WHERE(tenant_id,company_id,document_id)=(NEW.tenant_id,NEW.company_id,source) AND active LOOP
    SELECT coalesce(sum(l.base_quantity),0) INTO invoiced FROM sales_document_line l JOIN sales_document d ON(d.tenant_id,d.company_id,d.id)=(l.tenant_id,l.company_id,l.document_id)
     JOIN finance_subledger_operation o ON(o.tenant_id,o.company_id,o.sales_document_id)=(d.tenant_id,d.company_id,d.id) AND o.state='posted'
     WHERE l.tenant_id=NEW.tenant_id AND l.company_id=NEW.company_id AND l.active AND d.kind='invoice' AND l.product_snapshot->>'invoice_policy'='delivered'
      AND(l.fulfillment_source_id,l.fulfillment_source_line_id)=(root.fulfillment_source_id,root.fulfillment_source_line_id)
      AND NOT EXISTS(SELECT 1 FROM finance_subledger_operation r WHERE(r.tenant_id,r.company_id,r.payload->>'operation_id')=(o.tenant_id,o.company_id,o.id) AND r.type='reversal' AND r.state='posted');
    SELECT coalesce(sum(l.base_quantity),0) INTO delivered FROM sales_document_line l JOIN inventory_stock_operation o ON(o.tenant_id,o.company_id,o.sales_document_id)=(l.tenant_id,l.company_id,l.document_id)
     WHERE l.tenant_id=NEW.tenant_id AND l.company_id=NEW.company_id AND l.active AND o.kind='delivery' AND o.state='posted' AND o.id<>original
      AND(l.fulfillment_source_id,l.fulfillment_source_line_id)=(root.fulfillment_source_id,root.fulfillment_source_line_id);
    IF invoiced>delivered THEN RAISE EXCEPTION 'Reverse dependent delivered-policy invoice accounting before compensating its actual delivery';END IF;
   END LOOP;
  END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER sales_financial_compensation BEFORE INSERT OR UPDATE ON finance_subledger_operation FOR EACH ROW EXECUTE FUNCTION protect_sales_compensation();
CREATE TRIGGER sales_physical_compensation BEFORE INSERT OR UPDATE ON inventory_stock_operation FOR EACH ROW EXECUTE FUNCTION protect_sales_compensation();

CREATE FUNCTION attest_sales_credit_tax() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op finance_subledger_operation%ROWTYPE;d sales_document%ROWTYPE;l sales_document_line%ROWTYPE;original_operation text;prior_basis numeric;prior_amount numeric;
BEGIN
 IF NEW.source_type<>'currency_subledger' OR NEW.reverses_id IS NOT NULL THEN RETURN NULL;END IF;
 SELECT * INTO op FROM finance_subledger_operation WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.source_id);
 SELECT * INTO d FROM sales_document WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,op.sales_document_id) AND kind='credit';
 IF d.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO l FROM sales_document_line WHERE(tenant_id,company_id,document_id,id)=(d.tenant_id,d.company_id,d.id,NEW.source_line) AND active;
 SELECT id INTO original_operation FROM finance_subledger_operation WHERE(tenant_id,company_id,sales_document_id)=(d.tenant_id,d.company_id,d.source_id) AND state='posted';
 SELECT coalesce(sum(a.basis),0),coalesce(sum(a.amount),0) INTO prior_basis,prior_amount FROM finance_tax_application a
  WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id AND a.source_type='currency_subledger' AND a.id<>NEW.id
   AND(a.definition_id,a.revision,a.currency)=(NEW.definition_id,NEW.revision,NEW.currency)
   AND((a.source_id=original_operation AND a.source_line=l.source_line_id) OR EXISTS(
    SELECT 1 FROM sales_document_line credit_line JOIN sales_document credit ON(credit.tenant_id,credit.company_id,credit.id)=(credit_line.tenant_id,credit_line.company_id,credit_line.document_id)
    WHERE(credit_line.tenant_id,credit_line.company_id,credit_line.id)=(a.tenant_id,a.company_id,a.source_line) AND credit.kind='credit'
     AND(credit_line.source_document_id,credit_line.source_line_id)=(d.source_id,l.source_line_id)));
 IF l.id IS NULL OR l.source_line_id IS NULL OR original_operation IS NULL OR NEW.basis<>-l.net_amount OR NEW.amount<>-l.tax_amount
  OR NEW.prior_basis<>prior_basis OR NEW.prior_amount<>prior_amount THEN RAISE EXCEPTION 'Sales credit tax must consume its exact remaining original posted line basis and tax';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sales_credit_tax_evidence AFTER INSERT ON finance_tax_application DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION attest_sales_credit_tax();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('sales',4,'compensation_and_tax');
