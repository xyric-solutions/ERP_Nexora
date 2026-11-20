-- Source identity is distinct from Procurement's existing source_document_id.
CREATE FUNCTION attach_sales_financial_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reference text;source sales_document%ROWTYPE;
BEGIN
 reference:=CASE WHEN NEW.type='recognition' THEN nullif(NEW.payload->>'sales_document_id','') ELSE NULL END;
 IF NEW.sales_document_id IS NOT NULL AND NEW.sales_document_id IS DISTINCT FROM reference THEN RAISE EXCEPTION 'Financial Sales reference differs from its payload';END IF;
 NEW.sales_document_id:=reference;
 IF TG_OP='UPDATE' AND NEW.sales_document_id IS DISTINCT FROM OLD.sales_document_id THEN RAISE EXCEPTION 'Financial Sales reference is immutable';END IF;
 IF reference IS NOT NULL AND NEW.state<>'rejected' THEN
  SELECT * INTO source FROM sales_document WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,reference) FOR SHARE;
  IF source.id IS NULL OR source.state<>'approved' OR source.kind NOT IN('invoice','credit') OR NEW.payload->>'side'<>'receivable'
   OR NEW.payload->>'kind'<>(CASE WHEN source.kind='invoice' THEN 'invoice' ELSE 'credit_note' END)
   OR NEW.payload->>'party_id' IS DISTINCT FROM source.customer_id OR NEW.payload->>'currency'<>source.currency
   OR NEW.operation_date<>source.document_date OR(NEW.payload->>'due_date')::date<>coalesce(source.due_date,source.document_date)
   OR(NEW.payload->>'amount')::numeric<>source.net_amount OR NEW.payload ? 'source_document_id'
   OR NEW.payload->'dimensions'->>'project' IS DISTINCT FROM source.project_id OR NEW.payload->'dimensions'->>'location' IS DISTINCT FROM source.location_id
   OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,current_setting('nexora.user_id',true),'sales.document.read') THEN RAISE EXCEPTION 'Authorized approved Sales accounting evidence is required';END IF;
  PERFORM sales_validate_document(source.tenant_id,source.company_id,source.id,true);
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER sales_financial_source BEFORE INSERT OR UPDATE ON finance_subledger_operation FOR EACH ROW EXECUTE FUNCTION attach_sales_financial_source();
CREATE FUNCTION attach_sales_item_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op finance_subledger_operation%ROWTYPE;source sales_document%ROWTYPE;
BEGIN
 SELECT * INTO op FROM finance_subledger_operation WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.operation_id);
 IF NEW.sales_document_id IS NOT NULL AND NEW.sales_document_id IS DISTINCT FROM op.sales_document_id THEN RAISE EXCEPTION 'Receivable source identity differs from its financial operation';END IF;
 NEW.sales_document_id:=op.sales_document_id;
 IF NEW.sales_document_id IS NOT NULL THEN
  SELECT * INTO source FROM sales_document WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,NEW.sales_document_id);
  IF NEW.side<>'receivable' OR NEW.party_id<>source.customer_id OR NEW.currency<>source.currency OR NEW.original_amount<>(CASE WHEN source.kind='credit' THEN -source.total_amount ELSE source.total_amount END) THEN RAISE EXCEPTION 'Sales receivable must equal its complete approved commercial total';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER sales_item_source BEFORE INSERT ON finance_subledger_item FOR EACH ROW EXECUTE FUNCTION attach_sales_item_source();
CREATE FUNCTION attach_sales_stock_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reference text;source sales_document%ROWTYPE;
BEGIN
 reference:=CASE WHEN NEW.kind IN('delivery','return') THEN NEW.payload->>'source_id' ELSE NULL END;
 IF NEW.sales_document_id IS NOT NULL AND NEW.sales_document_id IS DISTINCT FROM reference THEN RAISE EXCEPTION 'Physical Sales reference differs from its payload';END IF;
 NEW.sales_document_id:=reference;
 IF TG_OP='UPDATE' AND NEW.sales_document_id IS DISTINCT FROM OLD.sales_document_id THEN RAISE EXCEPTION 'Physical Sales reference is immutable';END IF;
 IF reference IS NOT NULL AND NEW.state NOT IN('cancelled','rejected','reversed') THEN
  SELECT * INTO source FROM sales_document WHERE(tenant_id,company_id,id)=(NEW.tenant_id,NEW.company_id,reference) FOR SHARE;
  IF source.id IS NULL OR source.state<>'approved' OR source.row_version IS DISTINCT FROM(NEW.payload->>'source_version')::int OR source.kind<>NEW.kind OR source.warehouse_id IS NULL OR NEW.movement_date<source.document_date
   OR NEW.payload->>'warehouse_id' IS DISTINCT FROM source.warehouse_id
   OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,current_setting('nexora.user_id',true),'sales.document.read') THEN RAISE EXCEPTION 'Authorized approved Sales fulfillment evidence is required';END IF;
  PERFORM sales_validate_document(source.tenant_id,source.company_id,source.id,true);
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER sales_stock_source BEFORE INSERT OR UPDATE ON inventory_stock_operation FOR EACH ROW EXECUTE FUNCTION attach_sales_stock_source();

CREATE FUNCTION protect_sales_credit_and_return() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state IN('submitted','approved') AND NEW.kind IN('credit','return') AND EXISTS(SELECT 1 FROM sales_document_line l WHERE(l.tenant_id,l.company_id,l.document_id)=(NEW.tenant_id,NEW.company_id,NEW.id) AND l.active GROUP BY source_line_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Each credited or returned original line must appear once';END IF;
 IF NEW.state IN('submitted','approved') AND NEW.kind='return' AND NOT EXISTS(SELECT 1 FROM inventory_stock_operation WHERE(tenant_id,company_id,sales_document_id)=(NEW.tenant_id,NEW.company_id,NEW.source_id) AND kind='delivery' AND state='posted') THEN RAISE EXCEPTION 'A physical return requires its unreversed actual posted delivery';END IF;
 IF NEW.state IN('submitted','approved') AND NEW.kind='credit' THEN
  IF NOT EXISTS(SELECT 1 FROM finance_subledger_operation o WHERE(o.tenant_id,o.company_id,o.sales_document_id)=(NEW.tenant_id,NEW.company_id,NEW.source_id) AND o.state='posted'
   AND NOT EXISTS(SELECT 1 FROM finance_subledger_operation r WHERE(r.tenant_id,r.company_id,r.payload->>'operation_id')=(o.tenant_id,o.company_id,o.id) AND r.type='reversal' AND r.state='posted')) THEN RAISE EXCEPTION 'A financial credit requires its unreversed actual posted invoice';END IF;
  IF EXISTS(SELECT 1 FROM sales_document_line l WHERE(l.tenant_id,l.company_id,l.document_id)=(NEW.tenant_id,NEW.company_id,NEW.id) AND l.active GROUP BY source_line_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Each credited original invoice line must appear once';END IF;
  IF EXISTS(SELECT 1 FROM sales_document d JOIN sales_document_line l ON(l.tenant_id,l.company_id,l.document_id)=(d.tenant_id,d.company_id,d.id) AND l.active
   WHERE d.tenant_id=NEW.tenant_id AND d.company_id=NEW.company_id AND d.kind='credit' AND d.state='approved' AND d.id<>NEW.id AND d.source_id=NEW.source_id
   AND EXISTS(SELECT 1 FROM sales_document_line current_line WHERE(current_line.tenant_id,current_line.company_id,current_line.document_id)=(NEW.tenant_id,NEW.company_id,NEW.id) AND current_line.active AND current_line.source_line_id=l.source_line_id)
   AND NOT EXISTS(SELECT 1 FROM finance_subledger_operation o WHERE(o.tenant_id,o.company_id,o.sales_document_id)=(d.tenant_id,d.company_id,d.id) AND o.state='posted')) THEN RAISE EXCEPTION 'Finish or cancel the earlier credit of this original line before reviewing another';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER sales_credit_return_source BEFORE UPDATE ON sales_document FOR EACH ROW EXECUTE FUNCTION protect_sales_credit_and_return();

-- Match Finance's existing live company-access RLS boundary; no grants are seeded.
DO $$ DECLARE relation text;BEGIN
 FOREACH relation IN ARRAY ARRAY['sales_document','sales_document_line','sales_document_audit','sales_request'] LOOP
  EXECUTE format('DROP POLICY tenant_isolation ON %I',relation);
  EXECUTE format('CREATE POLICY company_scope ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=%I.tenant_id AND a.company_id=%I.company_id AND a.user_id=current_setting(''nexora.user_id'',true) AND a.revoked_at IS NULL)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=%I.tenant_id AND a.company_id=%I.company_id AND a.user_id=current_setting(''nexora.user_id'',true) AND a.revoked_at IS NULL))',relation,relation,relation,relation,relation);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('sales',3,'posting_references');
