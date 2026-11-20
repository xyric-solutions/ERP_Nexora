-- New source persistence only. No sample documents, customers, prices, taxes,
-- configuration or live accounting/stock effects are created by this migration.
CREATE TABLE sales_document (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,code text NOT NULL CHECK(code ~ '^(QTN|SO|DLV|INV|SR|SCN|RB)-[0-9]{3,}$'),
 kind text NOT NULL CHECK(kind IN('quotation','order','delivery','invoice','return','credit','recurring')),
 customer_id text,source_id text,template_id text,billing_period date,document_date date NOT NULL,due_date date,
 currency text NOT NULL,base_currency text NOT NULL,decimal_places integer NOT NULL CHECK(decimal_places BETWEEN 0 AND 8),
 project_id text NOT NULL,location_id text NOT NULL,warehouse_id text,approver_id text,
 net_amount numeric(38,8) NOT NULL CHECK(net_amount>=0),tax_amount numeric(38,8) NOT NULL CHECK(tax_amount>=0),total_amount numeric(38,8) NOT NULL,
 exchange_rate_id text,exchange_rate numeric(38,18) NOT NULL CHECK(exchange_rate>0),exchange_rate_date date,
 details jsonb NOT NULL CHECK(jsonb_typeof(details)='object'),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','submitted','approved','rejected','cancelled')),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),maker_id text NOT NULL,updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),UNIQUE(tenant_id,company_id,code),
 CHECK(total_amount=net_amount+tax_amount),CHECK(kind='recurring' OR customer_id IS NOT NULL),
 CHECK(due_date IS NULL OR due_date>=document_date),CHECK(source_id IS NULL OR source_id<>id),
 CHECK(template_id IS NULL OR(kind='invoice' AND billing_period IS NOT NULL)),CHECK((template_id IS NULL)=(billing_period IS NULL)),
 CHECK((kind='recurring')=(jsonb_typeof(details->'recurrence')='object')),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,customer_id) REFERENCES finance_subledger_party(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,source_id) REFERENCES sales_document(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,template_id) REFERENCES sales_document(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,currency) REFERENCES currency(tenant_id,code),
 FOREIGN KEY(tenant_id,company_id,base_currency) REFERENCES company_currency_profile(tenant_id,company_id,base_currency),
 FOREIGN KEY(tenant_id,exchange_rate_id) REFERENCES currency_rate(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,project_id) REFERENCES erp_project(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,location_id) REFERENCES erp_location(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,warehouse_id) REFERENCES inventory_warehouse(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,maker_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,approver_id) REFERENCES security_user_account(tenant_id,id)
);
CREATE UNIQUE INDEX sales_recurring_invoice_once ON sales_document(tenant_id,company_id,template_id,customer_id,billing_period) WHERE template_id IS NOT NULL AND state<>'cancelled';
CREATE UNIQUE INDEX sales_quote_order_once ON sales_document(tenant_id,company_id,source_id) WHERE kind='order' AND source_id IS NOT NULL AND state<>'cancelled';
CREATE INDEX sales_directory ON sales_document(tenant_id,company_id,kind,document_date,id);
CREATE INDEX sales_source ON sales_document(tenant_id,company_id,source_id,state);
CREATE INDEX sales_customer ON sales_document(tenant_id,company_id,customer_id,kind,state);
CREATE TABLE sales_document_line (
 tenant_id text NOT NULL,company_id text NOT NULL,document_id text NOT NULL,id text NOT NULL,line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 100),active boolean NOT NULL DEFAULT true,
 product_id text,source_document_id text,source_line_id text,fulfillment_source_id text,fulfillment_source_line_id text,template_document_id text,template_line_id text,
 active_line_no integer GENERATED ALWAYS AS(CASE WHEN active THEN line_no ELSE NULL END) STORED,
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 500),quantity numeric(24,4) NOT NULL CHECK(quantity>0),base_quantity numeric(24,4) NOT NULL CHECK(base_quantity>0),
 unit_id text NOT NULL,unit_snapshot jsonb,product_snapshot jsonb NOT NULL CHECK(jsonb_typeof(product_snapshot)='object'),
 unit_price numeric(38,8) NOT NULL CHECK(unit_price>=0),discount_amount numeric(38,8) NOT NULL CHECK(discount_amount>=0),allocated_discount_amount numeric(38,8) NOT NULL CHECK(allocated_discount_amount>=0),
 net_amount numeric(38,8) NOT NULL CHECK(net_amount>=0),tax_amount numeric(38,8) NOT NULL CHECK(tax_amount>=0),total_amount numeric(38,8) NOT NULL,
 tax_definition_id text,tax_snapshot jsonb,dimensions jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dimensions)='object'),
 PRIMARY KEY(tenant_id,company_id,document_id,id),UNIQUE(tenant_id,company_id,id),
 CHECK(total_amount=net_amount+tax_amount),CHECK((source_document_id IS NULL)=(source_line_id IS NULL)),CHECK((fulfillment_source_id IS NULL)=(fulfillment_source_line_id IS NULL)),
 FOREIGN KEY(tenant_id,company_id,document_id) REFERENCES sales_document(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,source_document_id,source_line_id) REFERENCES sales_document_line(tenant_id,company_id,document_id,id),
 FOREIGN KEY(tenant_id,company_id,fulfillment_source_id,fulfillment_source_line_id) REFERENCES sales_document_line(tenant_id,company_id,document_id,id),
 FOREIGN KEY(tenant_id,company_id,template_document_id,template_line_id) REFERENCES sales_document_line(tenant_id,company_id,document_id,id),
 FOREIGN KEY(tenant_id,company_id,unit_id) REFERENCES inventory_unit(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,tax_definition_id) REFERENCES finance_tax_definition(tenant_id,company_id,id)
);
ALTER TABLE sales_document_line ADD CONSTRAINT sales_current_line_number UNIQUE(tenant_id,company_id,document_id,active_line_no) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX sales_line_source ON sales_document_line(tenant_id,company_id,source_document_id,source_line_id) WHERE active;
CREATE INDEX sales_line_order ON sales_document_line(tenant_id,company_id,fulfillment_source_id,fulfillment_source_line_id) WHERE active;
CREATE TABLE sales_document_audit (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,document_id text NOT NULL,version integer NOT NULL,
 actor_id text NOT NULL,action text NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),snapshot jsonb NOT NULL,
 audit_event_id text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,document_id,version),
 FOREIGN KEY(tenant_id,company_id,document_id) REFERENCES sales_document(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
CREATE TABLE sales_request (
 tenant_id text NOT NULL,company_id text NOT NULL,actor_id text NOT NULL,idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 255),
 request_hash text NOT NULL CHECK(length(request_hash)=64),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,actor_id,idempotency_key),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id)
);

-- Stable dedicated references; procurement source_document_id retains its meaning.
ALTER TABLE finance_subledger_operation ADD COLUMN sales_document_id text;
ALTER TABLE finance_subledger_operation ADD FOREIGN KEY(tenant_id,company_id,sales_document_id) REFERENCES sales_document(tenant_id,company_id,id);
CREATE UNIQUE INDEX sales_financial_operation_once ON finance_subledger_operation(tenant_id,company_id,sales_document_id) WHERE sales_document_id IS NOT NULL;
ALTER TABLE finance_subledger_item ADD COLUMN sales_document_id text;
ALTER TABLE finance_subledger_item ADD FOREIGN KEY(tenant_id,company_id,sales_document_id) REFERENCES sales_document(tenant_id,company_id,id);
CREATE UNIQUE INDEX sales_financial_item_once ON finance_subledger_item(tenant_id,company_id,sales_document_id) WHERE sales_document_id IS NOT NULL;
ALTER TABLE inventory_stock_operation ADD COLUMN sales_document_id text;
ALTER TABLE inventory_stock_operation ADD FOREIGN KEY(tenant_id,company_id,sales_document_id) REFERENCES sales_document(tenant_id,company_id,id);
ALTER TABLE inventory_stock_operation ADD CHECK((kind IN('delivery','return') AND sales_document_id IS NOT NULL AND sales_document_id=payload->>'source_id') OR(kind NOT IN('delivery','return') AND sales_document_id IS NULL));

CREATE FUNCTION sales_document_snapshot(t text,c text,doc text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(d)||jsonb_build_object('net_amount',d.net_amount::text,'tax_amount',d.tax_amount::text,'total_amount',d.total_amount::text,'exchange_rate',d.exchange_rate::text,'lines',coalesce((SELECT jsonb_agg(to_jsonb(l)||jsonb_build_object(
  'quantity',l.quantity::text,'base_quantity',l.base_quantity::text,'unit_price',l.unit_price::text,'discount_amount',l.discount_amount::text,
  'allocated_discount_amount',l.allocated_discount_amount::text,'net_amount',l.net_amount::text,'tax_amount',l.tax_amount::text,'total_amount',l.total_amount::text)
  ORDER BY line_no,id) FROM sales_document_line l WHERE(l.tenant_id,l.company_id,l.document_id)=(d.tenant_id,d.company_id,d.id) AND l.active),'[]'::jsonb))
 FROM sales_document d WHERE(d.tenant_id,d.company_id,d.id)=(t,c,doc)
$$;
CREATE FUNCTION guard_sales_document() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text:=current_setting('nexora.user_id',true);same_content boolean;maker boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Commercial records must be retained';END IF;
 IF NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Commercial actor context is required';END IF;
 maker:=NEW.maker_id=actor AND bank_has_live_permission(NEW.tenant_id,NEW.company_id,actor,'sales.document.create');
 IF TG_OP='INSERT' THEN
  IF NOT maker OR NEW.state<>'draft' OR NEW.row_version<>1 THEN RAISE EXCEPTION 'Authorized initial commercial draft required';END IF;
 ELSE
  IF(NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.kind,NEW.maker_id,NEW.created_at) IS DISTINCT FROM(OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.kind,OLD.maker_id,OLD.created_at)
   OR NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'Commercial identity and versions are protected';END IF;
  same_content:=(to_jsonb(NEW)-ARRAY['state','row_version','updated_by','updated_at'])=(to_jsonb(OLD)-ARRAY['state','row_version','updated_by','updated_at']);
  IF OLD.state IN('draft','rejected') AND NEW.state='draft' THEN
   IF NOT maker THEN RAISE EXCEPTION 'Only the authorized maker can edit a commercial draft';END IF;
  ELSIF OLD.state IN('draft','rejected') AND NEW.state='submitted' THEN
   IF NOT maker OR NOT same_content OR NEW.approver_id IS NULL OR NEW.approver_id=NEW.maker_id OR NEW.kind NOT IN('quotation','recurring') THEN RAISE EXCEPTION 'Commercial submission requires the named independent reviewer';END IF;
  ELSIF NEW.state IN('approved','rejected') AND OLD.state IN('draft','submitted') THEN
   IF NOT same_content OR(OLD.state='draft' AND(NEW.state<>'approved' OR NOT maker OR NEW.approver_id IS NOT NULL))
    OR(OLD.state='submitted' AND(NEW.approver_id IS DISTINCT FROM actor OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,actor,'sales.document.approve'))) THEN RAISE EXCEPTION 'Commercial approval must retain its evidence and assigned authority';END IF;
  ELSIF NEW.state IN('draft','cancelled') AND OLD.state IN('submitted','approved','rejected','draft') THEN
   IF NOT maker OR NOT same_content OR(OLD.state='approved' AND NEW.state='draft' AND NEW.kind NOT IN('quotation','recurring')) THEN RAISE EXCEPTION 'Invalid commercial correction or cancellation';END IF;
  ELSIF OLD.state='approved' AND NEW.state='approved' AND NEW.kind='recurring' THEN
   IF NOT maker OR(to_jsonb(NEW)-ARRAY['details','row_version','updated_by','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['details','row_version','updated_by','updated_at'])
    OR(NEW.details #- '{recurrence,enabled}') IS DISTINCT FROM(OLD.details #- '{recurrence,enabled}') THEN RAISE EXCEPTION 'Only explicit recurring enablement can change an approved template';END IF;
  ELSE RAISE EXCEPTION 'Invalid commercial lifecycle transition';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER sales_document_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON sales_document FOR EACH ROW EXECUTE FUNCTION guard_sales_document();
CREATE FUNCTION guard_sales_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent sales_document%ROWTYPE;doc text:=coalesce(to_jsonb(NEW)->>'document_id',to_jsonb(OLD)->>'document_id');
BEGIN
 SELECT * INTO parent FROM sales_document WHERE(tenant_id,company_id,id)=(coalesce(NEW.tenant_id,OLD.tenant_id),coalesce(NEW.company_id,OLD.company_id),doc) FOR UPDATE;
 IF parent.id IS NULL OR parent.state NOT IN('draft','rejected') OR parent.maker_id IS DISTINCT FROM current_setting('nexora.user_id',true)
  OR NOT bank_has_live_permission(parent.tenant_id,parent.company_id,parent.maker_id,'sales.document.create') THEN RAISE EXCEPTION 'Commercial lines can change only with their authorized draft';END IF;
 IF TG_OP<>'INSERT' AND NOT OLD.active THEN RAISE EXCEPTION 'Archived commercial line evidence is immutable';END IF;
 IF TG_OP='UPDATE' AND(NEW.tenant_id,NEW.company_id,NEW.document_id,NEW.id) IS DISTINCT FROM(OLD.tenant_id,OLD.company_id,OLD.document_id,OLD.id) THEN RAISE EXCEPTION 'Commercial line identity is immutable';END IF;
 IF TG_OP='UPDATE' AND NOT NEW.active AND(to_jsonb(NEW)-ARRAY['active','active_line_no']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['active','active_line_no']) THEN RAISE EXCEPTION 'Archiving must preserve the original source line';END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER sales_line_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON sales_document_line FOR EACH ROW EXECUTE FUNCTION guard_sales_line();
CREATE FUNCTION require_sales_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc text;record sales_document%ROWTYPE;retained_snapshot jsonb;
BEGIN
 doc:=CASE WHEN TG_TABLE_NAME='sales_document' THEN to_jsonb(NEW)->>'id' ELSE coalesce(to_jsonb(NEW)->>'document_id',to_jsonb(OLD)->>'document_id') END;
 SELECT * INTO record FROM sales_document WHERE(tenant_id,company_id,id)=(coalesce(NEW.tenant_id,OLD.tenant_id),coalesce(NEW.company_id,OLD.company_id),doc);
 retained_snapshot:=sales_document_snapshot(record.tenant_id,record.company_id,record.id);
 IF NOT EXISTS(SELECT 1 FROM sales_document_audit s JOIN platform_admin_audit_event a ON(a.tenant_id,a.id)=(s.tenant_id,s.audit_event_id)
  WHERE(s.tenant_id,s.company_id,s.document_id,s.version)=(record.tenant_id,record.company_id,record.id,record.row_version)
   AND s.snapshot=retained_snapshot AND a.entity_id=record.id AND a.actor_id=s.actor_id AND a.action='sales.document.'||s.action AND a.occurred_at>=transaction_timestamp()) THEN RAISE EXCEPTION 'Commercial content requires its exact versioned audit in the same transaction';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sales_header_audit_required AFTER INSERT OR UPDATE ON sales_document DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_sales_audit();
CREATE CONSTRAINT TRIGGER sales_line_audit_required AFTER INSERT OR UPDATE OR DELETE ON sales_document_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_sales_audit();

DO $$ DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['sales_document','sales_document_line','sales_document_audit','sales_request'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',name);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',name);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexora_app') THEN EXECUTE format('GRANT SELECT,INSERT ON %I TO nexora_app',name);END IF;
 END LOOP;
 FOREACH name IN ARRAY ARRAY['sales_document_audit','sales_request'] LOOP EXECUTE format('CREATE TRIGGER sales_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation()',name);END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexora_app') THEN GRANT UPDATE ON sales_document,sales_document_line TO nexora_app;GRANT DELETE ON sales_document_line TO nexora_app;END IF;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('sales',1,'commercial_documents');
