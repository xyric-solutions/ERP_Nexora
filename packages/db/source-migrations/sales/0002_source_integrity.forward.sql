-- Additional source validation only; existing business data is never rewritten.
ALTER TABLE sales_document ADD CHECK(jsonb_typeof(details->'readiness')='array' AND jsonb_typeof(details->'discount_amount')='string');
ALTER TABLE sales_document ADD CHECK((kind='recurring' AND jsonb_typeof(details->'recurrence')='object') OR(kind<>'recurring' AND details->'recurrence'='null'::jsonb));
ALTER TABLE sales_document_line ADD CHECK((template_document_id IS NULL)=(template_line_id IS NULL));

CREATE FUNCTION sales_validate_document(t text,c text,doc text,confirm boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d sales_document%ROWTYPE;p sales_document%ROWTYPE;l sales_document_line%ROWTYPE;original sales_document_line%ROWTYPE;
 net numeric;tax numeric;discount numeric;n integer;reserved numeric;current_quantity numeric;current_amount numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('operational:'||t||':'||c,0));
 SELECT * INTO d FROM sales_document WHERE(tenant_id,company_id,id)=(t,c,doc);
 IF d.id IS NULL THEN RAISE EXCEPTION 'Commercial source is missing';END IF;
 SELECT count(*),sum(net_amount),sum(tax_amount),sum(allocated_discount_amount) INTO n,net,tax,discount FROM sales_document_line WHERE(tenant_id,company_id,document_id)=(t,c,doc) AND active;
 IF n NOT BETWEEN 1 AND 100 OR net IS DISTINCT FROM d.net_amount OR tax IS DISTINCT FROM d.tax_amount OR discount IS DISTINCT FROM (d.details->>'discount_amount')::numeric THEN RAISE EXCEPTION 'Commercial totals require their exact active source lines';END IF;
 IF d.state='cancelled' THEN RETURN;END IF;
 IF d.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM finance_party_directory WHERE(tenant_id,company_id,id)=(t,c,d.customer_id) AND kind='customer' AND status='active' AND risk_status<>'blocked') THEN RAISE EXCEPTION 'An eligible canonical customer is required';END IF;
 PERFORM finance_validate_dimensions(t,c,jsonb_build_object('project',d.project_id,'location',d.location_id));
 IF d.source_id IS NOT NULL THEN
  SELECT * INTO p FROM sales_document WHERE(tenant_id,company_id,id)=(t,c,d.source_id);
  IF d.kind='invoice' AND d.state='approved' AND p.kind='recurring' THEN
   SELECT(jsonb_populate_record(NULL::sales_document,a.snapshot)).* INTO p FROM sales_document_audit a WHERE(a.tenant_id,a.company_id,a.document_id,a.version)=(t,c,d.source_id,(d.details->>'source_version')::int) AND a.snapshot->>'state'='approved';
  END IF;
  IF p.id IS NULL OR p.state<>'approved' OR p.currency<>d.currency OR p.document_date>d.document_date OR(p.kind<>'recurring' AND p.customer_id IS DISTINCT FROM d.customer_id)
   OR NOT((d.kind='order' AND p.kind='quotation') OR(d.kind='delivery' AND p.kind IN('order','invoice')) OR(d.kind='invoice' AND p.kind IN('order','recurring')) OR(d.kind='return' AND p.kind='delivery') OR(d.kind='credit' AND p.kind='invoice')) THEN RAISE EXCEPTION 'Commercial ancestry is ineligible';END IF;
  IF confirm AND(d.details->>'source_version')::int IS DISTINCT FROM p.row_version THEN RAISE EXCEPTION 'Commercial source version changed';END IF;
  IF d.kind='order' AND nullif(p.details->>'valid_until','')::date<d.document_date THEN RAISE EXCEPTION 'The quotation expired before this order';END IF;
 ELSIF d.kind IN('delivery','return','credit') THEN RAISE EXCEPTION 'An original commercial source is required';END IF;
 IF confirm AND jsonb_array_length(d.details->'readiness')<>0 THEN RAISE EXCEPTION 'Commercial configuration readiness is incomplete';END IF;
 IF confirm AND d.kind IN('delivery','return') AND(d.warehouse_id IS NULL OR NOT EXISTS(SELECT 1 FROM inventory_warehouse WHERE(tenant_id,company_id,id)=(t,c,d.warehouse_id) AND status='active')) THEN RAISE EXCEPTION 'Actual fulfillment requires an active company warehouse';END IF;
 FOR l IN SELECT * FROM sales_document_line WHERE(tenant_id,company_id,document_id)=(t,c,doc) AND active LOOP
  IF l.unit_price<>round(l.unit_price,d.decimal_places) OR l.discount_amount<>round(l.discount_amount,d.decimal_places) OR l.allocated_discount_amount<>round(l.allocated_discount_amount,d.decimal_places)
   OR l.net_amount<>round(l.quantity*l.unit_price,d.decimal_places)-l.discount_amount-l.allocated_discount_amount OR l.tax_amount<>round(l.tax_amount,d.decimal_places)
   OR l.unit_snapshot IS NULL OR l.unit_id IS DISTINCT FROM l.unit_snapshot->>'unit_id' OR l.quantity IS DISTINCT FROM(l.unit_snapshot->>'entered_quantity')::numeric OR l.base_quantity IS DISTINCT FROM(l.unit_snapshot->>'base_quantity')::numeric
   OR(l.product_id IS DISTINCT FROM l.product_snapshot->>'id') THEN RAISE EXCEPTION 'Commercial line amounts, units or product evidence differ';END IF;
  PERFORM finance_validate_dimensions(t,c,l.dimensions);
  IF l.tax_definition_id IS NULL THEN
   IF l.tax_snapshot IS NOT NULL OR l.tax_amount<>0 OR(confirm AND length(btrim(coalesce(d.details->>'no_tax_reason','')))<3) THEN RAISE EXCEPTION 'Explicit governed or approved untaxed treatment required';END IF;
  ELSIF l.tax_snapshot IS NULL OR l.tax_definition_id IS DISTINCT FROM l.tax_snapshot->>'definition_id' OR l.tax_amount IS DISTINCT FROM abs((l.tax_snapshot->>'amount')::numeric)
   OR l.net_amount IS DISTINCT FROM abs((l.tax_snapshot->>'basis')::numeric) OR l.id IS DISTINCT FROM l.tax_snapshot->>'source_item_id' OR l.tax_snapshot->>'currency' IS DISTINCT FROM d.currency THEN RAISE EXCEPTION 'Commercial tax evidence differs from its line';END IF;
  IF l.source_line_id IS NOT NULL THEN
   SELECT * INTO original FROM sales_document_line WHERE(tenant_id,company_id,document_id,id)=(t,c,d.source_id,l.source_line_id) AND active;
   IF d.kind='invoice' AND d.state='approved' AND p.kind='recurring' THEN
    SELECT(jsonb_populate_record(NULL::sales_document_line,historical_line)).* INTO original FROM sales_document_audit a CROSS JOIN LATERAL jsonb_array_elements(a.snapshot->'lines')historical_line
     WHERE(a.tenant_id,a.company_id,a.document_id,a.version)=(t,c,d.source_id,p.row_version) AND historical_line->>'id'=l.source_line_id;
   END IF;
   IF original.id IS NULL OR l.source_document_id IS DISTINCT FROM d.source_id OR l.product_id IS DISTINCT FROM original.product_id OR l.unit_id<>original.unit_id
    OR l.product_snapshot->>'track_inventory' IS DISTINCT FROM original.product_snapshot->>'track_inventory'
    OR(d.kind<>'order' AND(l.fulfillment_source_id,l.fulfillment_source_line_id) IS DISTINCT FROM(original.fulfillment_source_id,original.fulfillment_source_line_id)) THEN RAISE EXCEPTION 'Commercial line must preserve its original identity and fulfillment reference';END IF;
  ELSIF d.source_id IS NOT NULL AND(d.kind<>'invoice' OR(l.product_snapshot->>'track_inventory')::boolean) THEN RAISE EXCEPTION 'The actual source line is required';END IF;
  IF d.kind='order' OR(d.kind='invoice' AND l.source_line_id IS NULL) THEN
   IF(l.fulfillment_source_id,l.fulfillment_source_line_id) IS DISTINCT FROM(d.id,l.id) THEN RAISE EXCEPTION 'An originating commercial line must own its fulfillment identity';END IF;
  ELSIF d.kind IN('quotation','recurring') AND l.fulfillment_source_id IS NOT NULL THEN RAISE EXCEPTION 'A quotation or recurring template cannot reserve fulfillment';END IF;
  IF confirm AND d.kind IN('delivery','return') AND NOT coalesce((l.product_snapshot->>'track_inventory')::boolean,false) THEN RAISE EXCEPTION 'Physical fulfillment requires an actual tracked product';END IF;
  IF confirm AND l.source_line_id IS NOT NULL AND NOT(p.kind='recurring' AND d.kind='invoice') THEN
   IF d.kind IN('delivery','invoice') THEN
    SELECT * INTO original FROM sales_document_line WHERE(tenant_id,company_id,document_id,id)=(t,c,l.fulfillment_source_id,l.fulfillment_source_line_id);
    SELECT coalesce(sum(x.base_quantity),0) INTO reserved FROM sales_document_line x JOIN sales_document h ON(h.tenant_id,h.company_id,h.id)=(x.tenant_id,x.company_id,x.document_id)
     WHERE x.tenant_id=t AND x.company_id=c AND x.active AND h.kind=d.kind AND h.state='approved' AND h.id<>d.id AND(x.fulfillment_source_id,x.fulfillment_source_line_id)=(l.fulfillment_source_id,l.fulfillment_source_line_id);
    SELECT sum(base_quantity) INTO current_quantity FROM sales_document_line WHERE(tenant_id,company_id,document_id)=(t,c,doc) AND active AND(fulfillment_source_id,fulfillment_source_line_id)=(l.fulfillment_source_id,l.fulfillment_source_line_id);
   ELSE
    SELECT coalesce(sum(x.base_quantity),0) INTO reserved FROM sales_document_line x JOIN sales_document h ON(h.tenant_id,h.company_id,h.id)=(x.tenant_id,x.company_id,x.document_id)
     WHERE x.tenant_id=t AND x.company_id=c AND x.active AND h.kind=d.kind AND h.state='approved' AND h.id<>d.id AND(x.source_document_id,x.source_line_id)=(l.source_document_id,l.source_line_id);
    SELECT sum(base_quantity) INTO current_quantity FROM sales_document_line WHERE(tenant_id,company_id,document_id)=(t,c,doc) AND active AND(source_document_id,source_line_id)=(l.source_document_id,l.source_line_id);
   END IF;
   IF original.id IS NULL OR reserved+current_quantity>original.base_quantity THEN RAISE EXCEPTION 'Commercial source quantity is exhausted';END IF;
   IF d.kind='credit' THEN
    SELECT coalesce(sum(x.net_amount),0) INTO current_amount FROM sales_document_line x JOIN sales_document h ON(h.tenant_id,h.company_id,h.id)=(x.tenant_id,x.company_id,x.document_id)
     WHERE x.tenant_id=t AND x.company_id=c AND x.active AND h.kind='credit' AND(h.state='approved' OR h.id=d.id) AND(x.source_document_id,x.source_line_id)=(l.source_document_id,l.source_line_id);
    IF current_amount>original.net_amount THEN RAISE EXCEPTION 'Credit value exceeds its original invoice line';END IF;
   END IF;
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION require_sales_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc text;d sales_document%ROWTYPE;
BEGIN
 doc:=CASE WHEN TG_TABLE_NAME='sales_document' THEN to_jsonb(NEW)->>'id' ELSE coalesce(to_jsonb(NEW)->>'document_id',to_jsonb(OLD)->>'document_id') END;
 SELECT * INTO d FROM sales_document WHERE(tenant_id,company_id,id)=(coalesce(NEW.tenant_id,OLD.tenant_id),coalesce(NEW.company_id,OLD.company_id),doc);
 PERFORM sales_validate_document(d.tenant_id,d.company_id,d.id,d.state IN('submitted','approved'));
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sales_header_integrity AFTER INSERT OR UPDATE ON sales_document DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_sales_integrity();
CREATE CONSTRAINT TRIGGER sales_line_integrity AFTER INSERT OR UPDATE ON sales_document_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_sales_integrity();

CREATE FUNCTION protect_sales_dependencies() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state='approved' AND NEW.state IN('draft','cancelled') THEN
  IF(OLD.kind<>'recurring' OR NEW.state='cancelled') AND EXISTS(SELECT 1 FROM sales_document WHERE tenant_id=OLD.tenant_id AND company_id=OLD.company_id AND(source_id=OLD.id OR template_id=OLD.id) AND state<>'cancelled') THEN RAISE EXCEPTION 'Resolve retained downstream documents before correcting this source';END IF;
  IF EXISTS(SELECT 1 FROM inventory_stock_operation WHERE(tenant_id,company_id,sales_document_id)=(OLD.tenant_id,OLD.company_id,OLD.id) AND state NOT IN('cancelled','reversed')) THEN RAISE EXCEPTION 'Cancel or reverse the linked stock operation first';END IF;
  IF EXISTS(SELECT 1 FROM finance_subledger_operation o WHERE(o.tenant_id,o.company_id,o.sales_document_id)=(OLD.tenant_id,OLD.company_id,OLD.id) AND o.state NOT IN('draft','rejected')
   AND NOT EXISTS(SELECT 1 FROM finance_subledger_operation r WHERE(r.tenant_id,r.company_id,r.payload->>'operation_id')=(o.tenant_id,o.company_id,o.id) AND r.type='reversal' AND r.state='posted')) THEN RAISE EXCEPTION 'Cancel or reverse linked accounting before commercial cancellation';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER sales_dependency_protection BEFORE UPDATE ON sales_document FOR EACH ROW EXECUTE FUNCTION protect_sales_dependencies();
CREATE TRIGGER sales_line_no_delete BEFORE DELETE ON sales_document_line FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexora_app') THEN REVOKE DELETE ON sales_document_line FROM nexora_app;END IF;END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('sales',2,'source_integrity');
