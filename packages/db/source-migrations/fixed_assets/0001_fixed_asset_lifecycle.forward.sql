-- Additive fixed-asset domain; no business fixtures, implicit grants or acquisitions.
CREATE TABLE fixed_asset_category (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,code text NOT NULL,name text NOT NULL,
 version integer NOT NULL CHECK(version>0),active boolean NOT NULL,policy jsonb NOT NULL,
 asset_account_id text NOT NULL,accumulated_account_id text NOT NULL,
 created_by text NOT NULL,updated_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id),UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,asset_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,accumulated_account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id),
 CHECK(length(btrim(name)) BETWEEN 2 AND 200),CHECK(jsonb_typeof(policy)='object')
);
CREATE TABLE fixed_asset_sequence (
 tenant_id text NOT NULL,company_id text NOT NULL,prefix text NOT NULL,next_value bigint NOT NULL CHECK(next_value>0),
 PRIMARY KEY(tenant_id,company_id,prefix),FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id)
);
CREATE FUNCTION guard_fixed_asset_category_accounts() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE role text;account_row account%ROWTYPE;expected text;BEGIN
 IF TG_OP='UPDATE' AND ((NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'Asset category identities are immutable and updates require a version' USING ERRCODE='23514';END IF;
 IF NEW.asset_account_id IS DISTINCT FROM NEW.policy->>'asset_account_id' OR NEW.accumulated_account_id IS DISTINCT FROM NEW.policy->>'accumulated_account_id' THEN RAISE EXCEPTION 'Category accounting policy and references must agree' USING ERRCODE='23514';END IF;
 FOREACH role IN ARRAY ARRAY['asset','accumulated','expense','gain','loss','impairment'] LOOP
  SELECT * INTO account_row FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.policy->>(role||'_account_id') FOR SHARE;
  expected:=CASE WHEN role IN ('asset','accumulated') THEN 'asset' WHEN role='gain' THEN 'revenue' ELSE 'expense' END;
  IF NOT FOUND OR account_row.type<>expected OR account_row.status<>'active' OR account_row.is_header OR account_row.reconciliation_required THEN RAISE EXCEPTION 'Category mappings require active postable accounts of the correct type' USING ERRCODE='23514';END IF;
  IF role IN ('asset','accumulated') AND (EXISTS(SELECT 1 FROM bank_account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND account_id=account_row.id)
   OR EXISTS(SELECT 1 FROM finance_subledger_policy WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND account_row.id IN(receivable_account_id,payable_account_id))
   OR EXISTS(SELECT 1 FROM finance_tax_mapping_rule WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND account_id=account_row.id)) THEN RAISE EXCEPTION 'Bank, supplier/customer and tax controls cannot become fixed asset controls' USING ERRCODE='23514';END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER fixed_asset_category_accounts BEFORE INSERT OR UPDATE ON fixed_asset_category FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_category_accounts();
CREATE TABLE fixed_asset_record (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,code text NOT NULL,
 category_id text NOT NULL,category_snapshot jsonb NOT NULL,supplier_id text,source_line_id text NOT NULL,
 acquisition_date date NOT NULL,base_currency text NOT NULL,decimal_places smallint NOT NULL CHECK(decimal_places BETWEEN 0 AND 8),
 cost numeric(28,8) NOT NULL CHECK(cost>0),residual_value numeric(28,8) NOT NULL CHECK(residual_value>=0),
 accumulated_depreciation numeric(28,8) NOT NULL DEFAULT 0 CHECK(accumulated_depreciation>=0),impairment numeric(28,8) NOT NULL DEFAULT 0 CHECK(impairment>=0),
 useful_life_months integer NOT NULL CHECK(useful_life_months BETWEEN 1 AND 1200),method text NOT NULL CHECK(method IN ('straight_line','reducing_balance')),
 annual_rate_percent numeric(8,4) NOT NULL CHECK(annual_rate_percent BETWEEN 0 AND 100),
 in_service_date date NOT NULL,depreciation_start date NOT NULL,last_depreciation_end date,last_financial_date date NOT NULL,
 assignment jsonb NOT NULL,assignment_date date NOT NULL,details jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','submitted','approved','active','fully_depreciated','returned','disposed')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),created_by text NOT NULL,approved_by text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id),UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id,category_id) REFERENCES fixed_asset_category(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,supplier_id) REFERENCES procurement_supplier(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,source_line_id) REFERENCES journal_line(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,base_currency) REFERENCES company_currency_profile(tenant_id,company_id,base_currency),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,approved_by) REFERENCES security_user_account(tenant_id,id),
 CHECK(approved_by IS NULL OR approved_by<>created_by),
 CHECK(status NOT IN ('approved','active','fully_depreciated') OR approved_by IS NOT NULL),
 CHECK(residual_value<=cost AND accumulated_depreciation+impairment<=cost),
 CHECK(in_service_date>=acquisition_date AND depreciation_start>=in_service_date),
 CHECK(method<>'reducing_balance' OR annual_rate_percent>0)
);
CREATE UNIQUE INDEX fixed_asset_serial ON fixed_asset_record(tenant_id,company_id,lower(details->>'serial_number')) WHERE btrim(details->>'serial_number')<>'';
-- Generated references keep immutable policy snapshots and assignments subject to
-- real foreign keys without duplicating application/JSON serialization logic.
DO $$ DECLARE role text;BEGIN
 FOREACH role IN ARRAY ARRAY['expense','gain','loss','impairment'] LOOP
 EXECUTE format('ALTER TABLE fixed_asset_category ADD COLUMN %I text GENERATED ALWAYS AS (policy->>%L) STORED NOT NULL,ADD FOREIGN KEY(tenant_id,company_id,%I) REFERENCES account(tenant_id,company_id,id)',role||'_account_id',role||'_account_id',role||'_account_id');
 END LOOP;
 FOREACH role IN ARRAY ARRAY['asset','accumulated','expense','gain','loss','impairment'] LOOP
 EXECUTE format('ALTER TABLE fixed_asset_record ADD COLUMN %I text GENERATED ALWAYS AS (category_snapshot->>%L) STORED NOT NULL,ADD FOREIGN KEY(tenant_id,company_id,%I) REFERENCES account(tenant_id,company_id,id)',role||'_account_id',role||'_account_id',role||'_account_id');
 END LOOP;
END $$;
ALTER TABLE fixed_asset_record
 ADD COLUMN custodian_id text GENERATED ALWAYS AS (assignment->>'custodian_id') STORED,
 ADD COLUMN department_id text GENERATED ALWAYS AS (assignment->>'department_id') STORED,
 ADD COLUMN branch_id text GENERATED ALWAYS AS (assignment->>'branch_id') STORED,
 ADD COLUMN location_id text GENERATED ALWAYS AS (assignment->>'location_id') STORED,
 ADD COLUMN project_id text GENERATED ALWAYS AS (assignment->>'project_id') STORED,
 ADD FOREIGN KEY(tenant_id,custodian_id) REFERENCES employee(tenant_id,id),
 ADD FOREIGN KEY(tenant_id,department_id) REFERENCES organization_unit(tenant_id,id),
 ADD FOREIGN KEY(tenant_id,branch_id) REFERENCES organization_unit(tenant_id,id),
 ADD FOREIGN KEY(tenant_id,company_id,location_id) REFERENCES erp_location(tenant_id,company_id,id),
 ADD FOREIGN KEY(tenant_id,company_id,project_id) REFERENCES erp_project(tenant_id,company_id,id);
CREATE INDEX fixed_asset_directory ON fixed_asset_record(tenant_id,company_id,status,category_id,code);
CREATE INDEX fixed_asset_assignments ON fixed_asset_record USING gin(assignment jsonb_path_ops);
CREATE TABLE fixed_asset_event (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,code text NOT NULL,asset_id text NOT NULL,
 type text NOT NULL CHECK(type IN ('transfer','maintenance','verification','impairment','disposal','return','refund')),
 event_date date NOT NULL,state text NOT NULL CHECK(state IN ('draft','submitted','approved','rejected','posted')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),asset_version integer NOT NULL,
 maker_id text NOT NULL,approver_id text,input jsonb NOT NULL,preview jsonb NOT NULL,journal_id text,
 posted_asset_version integer,posted_at timestamptz,depreciation_run_ids jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id),UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id,asset_id) REFERENCES fixed_asset_record(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,maker_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,approver_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,journal_id) REFERENCES journal_entry(tenant_id,company_id,id),
 CHECK(approver_id IS NULL OR approver_id<>maker_id),CHECK(state NOT IN ('approved','posted') OR approver_id IS NOT NULL),
 CHECK((state='posted')=(posted_asset_version IS NOT NULL AND posted_at IS NOT NULL))
);
CREATE INDEX fixed_asset_event_history ON fixed_asset_event(tenant_id,company_id,asset_id,event_date,id);
CREATE INDEX fixed_asset_return_credit ON fixed_asset_event(tenant_id,company_id,(input->>'credit_note_item_id')) WHERE type='return' AND state='posted';
CREATE INDEX fixed_asset_refund_return ON fixed_asset_event(tenant_id,company_id,(input->>'return_event_id')) WHERE type='refund' AND state='posted';
CREATE INDEX fixed_asset_refund_receipt ON fixed_asset_event(tenant_id,company_id,(input->>'receipt_line_id')) WHERE type='refund' AND state='posted';
CREATE TABLE fixed_asset_acquisition (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,asset_id text NOT NULL,source_line_id text NOT NULL,
 amount numeric(28,8) NOT NULL CHECK(amount>0),event_id text,
 PRIMARY KEY(tenant_id,company_id,id),UNIQUE(tenant_id,company_id,asset_id,source_line_id),
 FOREIGN KEY(tenant_id,company_id,asset_id) REFERENCES fixed_asset_record(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,source_line_id) REFERENCES journal_line(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,event_id) REFERENCES fixed_asset_event(tenant_id,company_id,id)
);
CREATE INDEX fixed_asset_acquisition_source ON fixed_asset_acquisition(tenant_id,source_line_id);
CREATE TABLE fixed_asset_depreciation_run (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,code text NOT NULL,period_id text NOT NULL,
 period_start date NOT NULL,period_end date NOT NULL,state text NOT NULL CHECK(state IN ('draft','submitted','approved','rejected','posted','reversed')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),maker_id text NOT NULL,approver_id text,
 total numeric(28,8) NOT NULL CHECK(total>=0),details jsonb NOT NULL,journal_id text,reversal_journal_id text,
 lifecycle_event_id text,accounting_event_id text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id),UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,period_id) REFERENCES financial_period(tenant_id,id),
 FOREIGN KEY(tenant_id,maker_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,approver_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,journal_id) REFERENCES journal_entry(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,reversal_journal_id) REFERENCES journal_entry(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,accounting_event_id) REFERENCES accounting_event(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,lifecycle_event_id) REFERENCES fixed_asset_event(tenant_id,company_id,id),
 CHECK(approver_id IS NULL OR approver_id<>maker_id),CHECK(state NOT IN ('approved','posted','reversed') OR approver_id IS NOT NULL),
 CHECK((state IN ('posted','reversed'))=(journal_id IS NOT NULL)),CHECK((state='reversed')=(reversal_journal_id IS NOT NULL))
);
CREATE TABLE fixed_asset_depreciation_effect (
 tenant_id text NOT NULL,company_id text NOT NULL,run_id text NOT NULL,asset_id text NOT NULL,period_start date NOT NULL,period_end date NOT NULL,
 amount numeric(28,8) NOT NULL CHECK(amount>0),previous_end date,previous_financial_date date NOT NULL,asset_version integer NOT NULL,reversed_at timestamptz,
 PRIMARY KEY(tenant_id,company_id,run_id,asset_id),
 FOREIGN KEY(tenant_id,company_id,run_id) REFERENCES fixed_asset_depreciation_run(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,asset_id) REFERENCES fixed_asset_record(tenant_id,company_id,id)
);
ALTER TABLE fixed_asset_depreciation_effect ADD CONSTRAINT fixed_asset_period_nonoverlap EXCLUDE USING gist (tenant_id WITH =,company_id WITH =,asset_id WITH =,daterange(period_start,period_end,'[]') WITH &&) WHERE(reversed_at IS NULL);
CREATE UNIQUE INDEX fixed_asset_period_once ON fixed_asset_depreciation_effect(tenant_id,company_id,asset_id,period_start,period_end) WHERE reversed_at IS NULL;
CREATE TABLE fixed_asset_audit (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,entity_id text NOT NULL,action text NOT NULL,
 actor_id text NOT NULL,reason text NOT NULL,before_value jsonb,after_value jsonb,audit_event_id text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
CREATE INDEX fixed_asset_audit_history ON fixed_asset_audit(tenant_id,company_id,entity_id,occurred_at,id);
CREATE TABLE fixed_asset_idempotency (
 tenant_id text NOT NULL,company_id text NOT NULL,actor_id text NOT NULL,key text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,company_id,actor_id,key),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 CHECK(key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'),CHECK(fingerprint ~ '^[a-f0-9]{64}$')
);
CREATE FUNCTION guard_fixed_asset_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fixed asset evidence is immutable' USING ERRCODE='23514'; END $$;
CREATE FUNCTION guard_fixed_asset_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Fixed assets cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.category_id,NEW.category_snapshot,NEW.source_line_id,NEW.created_by,NEW.created_at,NEW.base_currency,NEW.decimal_places,NEW.acquisition_date,NEW.supplier_id) IS DISTINCT FROM
 (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.category_id,OLD.category_snapshot,OLD.source_line_id,OLD.created_by,OLD.created_at,OLD.base_currency,OLD.decimal_places,OLD.acquisition_date,OLD.supplier_id) OR NEW.version<>OLD.version+1) THEN
 RAISE EXCEPTION 'Asset identity and accounting policy are immutable; updates require a new version' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (OLD.status<>'draft' OR NEW.status<>'draft') AND
 (NEW.residual_value,NEW.useful_life_months,NEW.method,NEW.annual_rate_percent,NEW.in_service_date,NEW.depreciation_start)
 IS DISTINCT FROM (OLD.residual_value,OLD.useful_life_months,OLD.method,OLD.annual_rate_percent,OLD.in_service_date,OLD.depreciation_start) THEN
 RAISE EXCEPTION 'Depreciation policy changes are restricted to unsubmitted drafts' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fixed_asset_record_guard BEFORE UPDATE OR DELETE ON fixed_asset_record FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_record();
CREATE FUNCTION guard_fixed_asset_control_reuse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='finance_subledger_policy' THEN
  IF EXISTS(SELECT 1 FROM fixed_asset_record WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND (asset_account_id IN(NEW.receivable_account_id,NEW.payable_account_id) OR accumulated_account_id IN(NEW.receivable_account_id,NEW.payable_account_id)))
   OR EXISTS(SELECT 1 FROM fixed_asset_category WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND (asset_account_id IN(NEW.receivable_account_id,NEW.payable_account_id) OR accumulated_account_id IN(NEW.receivable_account_id,NEW.payable_account_id))) THEN RAISE EXCEPTION 'Fixed asset controls cannot become monetary subledger controls' USING ERRCODE='23514';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM fixed_asset_record WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND NEW.account_id IN(asset_account_id,accumulated_account_id)) OR EXISTS(SELECT 1 FROM fixed_asset_category WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND NEW.account_id IN(asset_account_id,accumulated_account_id)) THEN RAISE EXCEPTION 'Fixed asset controls cannot become tax controls' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER fixed_asset_subledger_control_guard BEFORE INSERT ON finance_subledger_policy FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_control_reuse();
CREATE TRIGGER fixed_asset_tax_control_guard BEFORE INSERT OR UPDATE ON finance_tax_mapping_rule FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_control_reuse();
CREATE FUNCTION guard_fixed_asset_acquisition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_amount numeric;allocated numeric;journal text;BEGIN
 -- Serialize all allocations against the original financial evidence, including direct SQL callers.
 SELECT l.journal_id INTO journal FROM journal_line l JOIN journal_entry j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.source_line_id AND j.company_id=NEW.company_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('fixed-asset-source-journal:'||NEW.tenant_id||':'||NEW.company_id||':'||journal,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('fixed-asset-source:'||NEW.tenant_id||':'||NEW.source_line_id,0));
 SELECT l.base_debit-l.base_credit INTO source_amount FROM journal_line l JOIN journal_entry j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
 WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.source_line_id AND j.company_id=NEW.company_id AND j.status='posted'
 AND NOT EXISTS(SELECT 1 FROM finance_subledger_operation o JOIN finance_subledger_operation r ON r.tenant_id=o.tenant_id AND r.company_id=o.company_id AND r.type='reversal' AND r.state='posted' AND r.payload->>'operation_id'=o.id WHERE o.tenant_id=j.tenant_id AND o.company_id=j.company_id AND o.journal_id=j.id) FOR SHARE OF j,l;
 SELECT coalesce(sum(amount),0) INTO allocated FROM fixed_asset_acquisition WHERE tenant_id=NEW.tenant_id AND source_line_id=NEW.source_line_id;
 IF source_amount IS NULL OR source_amount<allocated+NEW.amount THEN RAISE EXCEPTION 'Asset allocations exceed posted acquisition evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fixed_asset_acquisition_guard BEFORE INSERT ON fixed_asset_acquisition FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_acquisition();
CREATE FUNCTION guard_fixed_asset_journal_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='reversed' AND OLD.status='posted' THEN
  IF EXISTS(SELECT 1 FROM fixed_asset_acquisition a JOIN journal_line l ON l.tenant_id=a.tenant_id AND l.id=a.source_line_id WHERE l.tenant_id=OLD.tenant_id AND a.company_id=OLD.company_id AND l.journal_id=OLD.id)
   OR EXISTS(SELECT 1 FROM fixed_asset_event WHERE tenant_id=OLD.tenant_id AND company_id=OLD.company_id AND state='posted' AND (journal_id=OLD.id OR preview->>'linked_journal_id'=OLD.id))
   OR EXISTS(SELECT 1 FROM fixed_asset_depreciation_run r WHERE r.tenant_id=OLD.tenant_id AND r.company_id=OLD.company_id AND (r.journal_id=OLD.id OR r.reversal_journal_id=OLD.id)
    AND NOT(r.journal_id=OLD.id AND r.state='posted' AND r.id=coalesce(current_setting('nexora.asset_depreciation_reversal',true),'') AND bank_has_live_permission(OLD.tenant_id,OLD.company_id,current_setting('nexora.user_id',true),'assets.asset.reverse'))) THEN
   RAISE EXCEPTION 'Asset-linked journals require their owning governed lifecycle workflow' USING ERRCODE='23514',CONSTRAINT='registered_asset_acquisition';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fixed_asset_source_reversal_guard BEFORE UPDATE ON journal_entry FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_journal_reversal();
CREATE FUNCTION guard_fixed_asset_posted_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.state='posted' THEN RAISE EXCEPTION 'Posted asset events are immutable' USING ERRCODE='23514'; END IF;
 IF NEW.version<>OLD.version+1 OR (NEW.tenant_id,NEW.company_id,NEW.id,NEW.asset_id,NEW.type,NEW.event_date,NEW.maker_id,NEW.input,NEW.preview) IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.asset_id,OLD.type,OLD.event_date,OLD.maker_id,OLD.input,OLD.preview) THEN
 RAISE EXCEPTION 'Asset event evidence cannot be overwritten' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER fixed_asset_posted_event_guard BEFORE UPDATE OR DELETE ON fixed_asset_event FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_posted_event();
CREATE FUNCTION require_fixed_asset_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE acquisition_total numeric;depreciation_total numeric;impairment_total numeric;BEGIN
 IF NOT EXISTS(SELECT 1 FROM fixed_asset_audit e WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.entity_id=NEW.id
  AND e.actor_id=current_setting('nexora.user_id',true) AND coalesce(e.after_value->'asset'->>'version',e.after_value->>'version')=NEW.version::text) THEN
 RAISE EXCEPTION 'Asset mutations require atomic immutable audit evidence' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM fixed_asset_record a WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id AND a.id=NEW.id AND a.version>NEW.version) THEN RETURN NULL;END IF;
 IF NEW.status IN ('returned','disposed') AND NOT EXISTS(SELECT 1 FROM fixed_asset_event e WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.asset_id=NEW.id AND e.state='posted' AND e.type=CASE WHEN NEW.status='returned' THEN 'return' ELSE 'disposal' END) THEN RAISE EXCEPTION 'Terminal assets require their posted lifecycle event' USING ERRCODE='23514';END IF;
 SELECT coalesce(sum(amount),0) INTO acquisition_total FROM fixed_asset_acquisition WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND asset_id=NEW.id;
 SELECT coalesce(sum(amount),0) INTO depreciation_total FROM fixed_asset_depreciation_effect WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND asset_id=NEW.id AND reversed_at IS NULL;
 SELECT coalesce(sum((preview->>'amount')::numeric),0) INTO impairment_total FROM fixed_asset_event WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND asset_id=NEW.id AND type='impairment' AND state='posted';
 IF NEW.cost<>acquisition_total OR NEW.accumulated_depreciation<>depreciation_total OR NEW.impairment<>impairment_total THEN
 RAISE EXCEPTION 'Asset balances must reconcile to immutable source and lifecycle evidence' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM journal_line l JOIN journal_entry j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.source_line_id AND j.company_id=NEW.company_id AND j.status='posted' AND l.account_id=NEW.category_snapshot->>'asset_account_id' AND j.posting_date=NEW.acquisition_date) THEN
 RAISE EXCEPTION 'Asset source evidence must match the company, policy and acquisition date' USING ERRCODE='23514';END IF;
 IF NEW.cost*power(10::numeric,NEW.decimal_places)<>trunc(NEW.cost*power(10::numeric,NEW.decimal_places)) OR NEW.residual_value*power(10::numeric,NEW.decimal_places)<>trunc(NEW.residual_value*power(10::numeric,NEW.decimal_places)) THEN
 RAISE EXCEPTION 'Asset amounts exceed functional currency precision' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER fixed_asset_evidence_guard AFTER INSERT OR UPDATE ON fixed_asset_record DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_fixed_asset_evidence();
CREATE FUNCTION guard_fixed_asset_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.state='reversed' OR (OLD.state='posted' AND NEW.state<>'reversed') THEN RAISE EXCEPTION 'Posted depreciation requires a governed reversal' USING ERRCODE='23514';END IF;
 IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.period_id,NEW.period_start,NEW.period_end,NEW.maker_id,NEW.total,NEW.details) IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.period_id,OLD.period_start,OLD.period_end,OLD.maker_id,OLD.total,OLD.details) OR NEW.version<>OLD.version+1 THEN
 RAISE EXCEPTION 'Depreciation evidence cannot be overwritten' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fixed_asset_run_guard BEFORE UPDATE OR DELETE ON fixed_asset_depreciation_run FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_run();
CREATE FUNCTION require_fixed_asset_depreciation_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run fixed_asset_depreciation_run%ROWTYPE;asset fixed_asset_record%ROWTYPE;expense_effect numeric;accumulated_effect numeric;BEGIN
 SELECT * INTO run FROM fixed_asset_depreciation_run WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.run_id;
 SELECT * INTO asset FROM fixed_asset_record WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.asset_id;
 IF run.state NOT IN ('posted','reversed') OR (run.state='reversed')<>(NEW.reversed_at IS NOT NULL) OR run.period_start>NEW.period_start OR run.period_end<NEW.period_end
  OR NOT EXISTS(SELECT 1 FROM accounting_event e JOIN journal_entry j ON j.tenant_id=e.tenant_id AND j.source_id=e.id AND j.id=run.journal_id AND j.company_id=NEW.company_id AND j.status IN ('posted','reversed') WHERE e.tenant_id=NEW.tenant_id AND e.id=run.accounting_event_id AND e.state='posted' AND e.source_type='assets.depreciation' AND e.source_id=run.id AND e.event_type='depreciation') THEN
 RAISE EXCEPTION 'Depreciation effects require their atomic posted Finance journal' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(run.details) d WHERE d->>'asset_id'=NEW.asset_id AND (d->>'start')::date=NEW.period_start AND (d->>'end')::date=NEW.period_end AND (d->>'amount')::numeric=NEW.amount) THEN RAISE EXCEPTION 'Depreciation dates must match the approved calculation' USING ERRCODE='23514';END IF;
 IF run.lifecycle_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fixed_asset_event e WHERE e.tenant_id=run.tenant_id AND e.company_id=run.company_id AND e.id=run.lifecycle_event_id AND e.state='posted' AND e.maker_id=run.maker_id AND e.approver_id=run.approver_id AND e.depreciation_run_ids ? run.id) THEN RAISE EXCEPTION 'Lifecycle depreciation requires its independent event approval' USING ERRCODE='23514';END IF;
 SELECT coalesce(sum(l.base_debit-l.base_credit) filter(where l.account_id=asset.category_snapshot->>'expense_account_id'),0),coalesce(sum(l.base_credit-l.base_debit) filter(where l.account_id=asset.category_snapshot->>'accumulated_account_id'),0)
 INTO expense_effect,accumulated_effect FROM journal_line l JOIN accounting_event e ON e.tenant_id=l.tenant_id AND e.id=run.accounting_event_id CROSS JOIN LATERAL jsonb_array_elements(e.payload->'audit_lines') evidence
 WHERE l.tenant_id=NEW.tenant_id AND l.journal_id=run.journal_id AND l.line_number=(evidence->>'line_number')::integer AND evidence->'source_metadata'->>'asset_id'=NEW.asset_id;
 IF expense_effect<>NEW.amount OR accumulated_effect<>NEW.amount THEN RAISE EXCEPTION 'Asset depreciation must reconcile to its exact journal lines' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER fixed_asset_depreciation_posting_guard AFTER INSERT OR UPDATE ON fixed_asset_depreciation_effect DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_fixed_asset_depreciation_posting();
CREATE FUNCTION guard_fixed_asset_depreciation_effect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.reversed_at IS NOT NULL OR NEW.reversed_at IS NULL OR
 (NEW.tenant_id,NEW.company_id,NEW.run_id,NEW.asset_id,NEW.period_start,NEW.period_end,NEW.amount,NEW.previous_end,NEW.previous_financial_date,NEW.asset_version) IS DISTINCT FROM
 (OLD.tenant_id,OLD.company_id,OLD.run_id,OLD.asset_id,OLD.period_start,OLD.period_end,OLD.amount,OLD.previous_end,OLD.previous_financial_date,OLD.asset_version) THEN
 RAISE EXCEPTION 'Depreciation effects are immutable except a governed one-time reversal' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER fixed_asset_depreciation_effect_guard BEFORE UPDATE OR DELETE ON fixed_asset_depreciation_effect FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_depreciation_effect();
CREATE FUNCTION require_fixed_asset_event_posting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state<>'posted' THEN RETURN NULL;END IF;
 IF jsonb_array_length(NEW.preview->'lines')>0 THEN
  IF NOT EXISTS(SELECT 1 FROM journal_entry j JOIN accounting_event e ON e.tenant_id=j.tenant_id AND e.id=j.source_id WHERE j.tenant_id=NEW.tenant_id AND j.company_id=NEW.company_id AND j.id=NEW.journal_id AND j.status='posted' AND e.state='posted' AND e.source_type='assets.lifecycle' AND e.source_id=NEW.id AND e.event_type=NEW.type) THEN
  RAISE EXCEPTION 'Financial asset events require their atomic Finance posting' USING ERRCODE='23514';END IF;
  IF EXISTS(WITH expected AS(SELECT account_id,sum(debit-credit) balance FROM jsonb_to_recordset(NEW.preview->'lines') AS x(account_id text,debit numeric,credit numeric) GROUP BY account_id),actual AS(SELECT account_id,sum(base_debit-base_credit) balance FROM journal_line WHERE tenant_id=NEW.tenant_id AND journal_id=NEW.journal_id GROUP BY account_id)
   SELECT 1 FROM expected e FULL JOIN actual a USING(account_id) WHERE coalesce(e.balance,0)<>coalesce(a.balance,0)) THEN
  RAISE EXCEPTION 'Asset financial preview must reconcile to its posted journal' USING ERRCODE='23514';END IF;
 ELSIF NEW.journal_id IS DISTINCT FROM NEW.preview->>'linked_journal_id' THEN RAISE EXCEPTION 'Operational asset events cannot create an unrelated journal' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER fixed_asset_event_posting_guard AFTER INSERT OR UPDATE ON fixed_asset_event DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_fixed_asset_event_posting();
DO $$ DECLARE relation text;BEGIN
 FOREACH relation IN ARRAY ARRAY['fixed_asset_category','fixed_asset_sequence','fixed_asset_record','fixed_asset_event','fixed_asset_acquisition','fixed_asset_depreciation_run','fixed_asset_depreciation_effect','fixed_asset_audit','fixed_asset_idempotency'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
 EXECUTE format('CREATE POLICY company_boundary ON %I USING (tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=%I.tenant_id AND a.company_id=%I.company_id AND a.user_id=current_setting(''nexora.user_id'',true) AND a.revoked_at IS NULL)) WITH CHECK (tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=%I.tenant_id AND a.company_id=%I.company_id AND a.user_id=current_setting(''nexora.user_id'',true) AND a.revoked_at IS NULL))',relation,relation,relation,relation,relation);
 END LOOP;
 FOREACH relation IN ARRAY ARRAY['fixed_asset_acquisition','fixed_asset_audit','fixed_asset_idempotency'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_immutable()',relation);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('fixed_assets',1,'fixed_asset_lifecycle');
