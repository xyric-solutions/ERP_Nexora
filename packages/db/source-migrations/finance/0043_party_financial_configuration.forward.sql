-- Additive financial settings and new-posting due schedules. No business
-- configuration, balances or existing posted evidence are backfilled.
CREATE TABLE finance_party_configuration (
 tenant_id text NOT NULL, company_id text NOT NULL, party_id text NOT NULL,
 version integer NOT NULL CHECK(version>0),
 payment_term text CHECK(payment_term IN ('immediate','days_15','days_21','days_30','days_45','end_following_month','days_10_after_end_next_month','percent_30_now_balance_60_days')),
 credit_limit numeric(38,8) CHECK(credit_limit>=0), credit_currency text NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,party_id,version),
 FOREIGN KEY(tenant_id,company_id,party_id) REFERENCES finance_subledger_party(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,credit_currency) REFERENCES company_currency_profile(tenant_id,company_id,base_currency),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id)
);
ALTER TABLE finance_party_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_party_configuration FORCE ROW LEVEL SECURITY;
CREATE POLICY company_scope ON finance_party_configuration USING (
 tenant_id=current_setting('nexora.tenant_id',true) AND EXISTS(SELECT 1 FROM security_user_company_access a
 WHERE a.tenant_id=finance_party_configuration.tenant_id AND a.company_id=finance_party_configuration.company_id
 AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL)) WITH CHECK (
 tenant_id=current_setting('nexora.tenant_id',true) AND EXISTS(SELECT 1 FROM security_user_company_access a
 WHERE a.tenant_id=finance_party_configuration.tenant_id AND a.company_id=finance_party_configuration.company_id
 AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL));
CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON finance_party_configuration
 FOR EACH ROW EXECUTE FUNCTION guard_finance_subledger_immutable();
CREATE TRIGGER configuration_no_truncate BEFORE TRUNCATE ON finance_party_configuration
 FOR EACH STATEMENT EXECUTE FUNCTION guard_finance_subledger_immutable();

CREATE FUNCTION finance_guard_party_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text; precision integer; previous integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('subledger:'||NEW.tenant_id||':'||NEW.company_id,0));
 IF NEW.created_by IS DISTINCT FROM current_setting('nexora.user_id',true)
 OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.created_by,'finance.subledger.manage') THEN
  RAISE EXCEPTION 'Current company financial management authority is required' USING ERRCODE='23514';
 END IF;
 SELECT p.kind INTO kind FROM finance_subledger_party p
  WHERE (p.tenant_id,p.company_id,p.id)=(NEW.tenant_id,NEW.company_id,NEW.party_id);
 SELECT c.decimal_places INTO precision FROM currency c WHERE c.tenant_id=NEW.tenant_id AND c.code=NEW.credit_currency;
 IF kind IS NULL OR (kind='customer' AND NEW.credit_limit IS NULL)
 OR (kind='supplier' AND NEW.credit_limit IS NOT NULL)
 OR NEW.credit_limit IS DISTINCT FROM round(NEW.credit_limit,precision) THEN
  RAISE EXCEPTION 'Configure customer credit in functional currency; suppliers have no customer credit limit' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(max(version),0) INTO previous FROM finance_party_configuration
  WHERE (tenant_id,company_id,party_id)=(NEW.tenant_id,NEW.company_id,NEW.party_id);
 IF NEW.version<>previous+1 THEN RAISE EXCEPTION 'Financial configuration version changed' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER configuration_authority BEFORE INSERT ON finance_party_configuration
 FOR EACH ROW EXECUTE FUNCTION finance_guard_party_configuration();
CREATE FUNCTION finance_require_party_configuration_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM finance_subledger_audit a WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id
  AND a.action='party_configured' AND a.actor_id=NEW.created_by AND a.reason=NEW.reason
  AND a.evidence->>'party_id'=NEW.party_id AND (a.evidence->>'version')::integer=NEW.version
  AND a.evidence->>'payment_term' IS NOT DISTINCT FROM NEW.payment_term AND a.evidence->>'credit_currency'=NEW.credit_currency
  AND (a.evidence->>'credit_limit')::numeric IS NOT DISTINCT FROM NEW.credit_limit) THEN
  RAISE EXCEPTION 'Financial configuration requires immutable audit evidence' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER configuration_audit AFTER INSERT ON finance_party_configuration
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_require_party_configuration_audit();

ALTER TABLE finance_subledger_item ADD COLUMN due_schedule jsonb;
-- One dated installment authority for both aging buckets and connected
-- outstanding reports. Legacy single-date credits retain their signed balance.
CREATE FUNCTION finance_due_installments(jsonb,date,numeric,numeric)
RETURNS TABLE(due_date date,amount numeric) LANGUAGE sql STABLE AS $$
 SELECT (part->>'due_date')::date,
  CASE WHEN $1 IS NULL THEN $4 ELSE greatest(0,least((part->>'amount')::numeric,
   sum((part->>'amount')::numeric) over(order by ordinal)-($3-$4))) END
 FROM jsonb_array_elements(coalesce($1,jsonb_build_array(jsonb_build_object('due_date',$2,'amount',abs($3)))))
 WITH ORDINALITY schedule(part,ordinal)
$$;
CREATE FUNCTION finance_guard_due_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE part jsonb; due date; previous date; total numeric:=0; value numeric; approved_schedule jsonb;
BEGIN
 IF NEW.due_schedule IS NULL THEN RETURN NEW; END IF;
 SELECT item->'due_schedule' INTO approved_schedule FROM finance_subledger_operation o
 CROSS JOIN LATERAL jsonb_array_elements(coalesce(o.preview->'additional_items','[]'::jsonb)||jsonb_build_array(o.preview->'item')) items(item)
 WHERE (o.tenant_id,o.company_id,o.id)=(NEW.tenant_id,NEW.company_id,NEW.operation_id) AND item->>'id'=NEW.id;
 IF NEW.due_schedule IS DISTINCT FROM approved_schedule THEN
  RAISE EXCEPTION 'Invoice due schedules require their approved financial evidence' USING ERRCODE='23514';
 END IF;
 IF jsonb_typeof(NEW.due_schedule)<>'array' OR jsonb_array_length(NEW.due_schedule) NOT BETWEEN 1 AND 24 OR NEW.kind<>'invoice' THEN
  RAISE EXCEPTION 'Only invoice due schedules are supported' USING ERRCODE='23514';
 END IF;
 FOR part IN SELECT * FROM jsonb_array_elements(NEW.due_schedule) LOOP
  IF jsonb_typeof(part)<>'object' OR coalesce(part->>'due_date','') !~ '^\d{4}-\d{2}-\d{2}$'
   OR coalesce(part->>'amount','') !~ '^(0|[1-9]\d{0,29})(\.\d{1,8})?$' THEN
   RAISE EXCEPTION 'Invalid invoice installment' USING ERRCODE='23514';
  END IF;
  due:=(part->>'due_date')::date; value:=(part->>'amount')::numeric;
  IF due<NEW.document_date OR due>NEW.due_date OR (previous IS NOT NULL AND due<previous)
   OR value<0 OR value<>round(value,NEW.decimal_places) THEN
   RAISE EXCEPTION 'Invalid dated installment amount' USING ERRCODE='23514';
  END IF;
  previous:=due; total:=total+value;
 END LOOP;
 IF total<>NEW.original_amount OR previous IS DISTINCT FROM NEW.due_date THEN
  RAISE EXCEPTION 'Installments must agree with the original invoice and final due date' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER due_schedule_guard BEFORE INSERT ON finance_subledger_item FOR EACH ROW EXECUTE FUNCTION finance_guard_due_schedule();

-- The API checks credit on prepare/review/post. This deferred invariant also
-- protects direct financial writes. Receipts and exact reversals remain valid
-- when a subsequently reduced limit is below the historic exposure.
CREATE FUNCTION finance_guard_customer_credit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE party text; limit_value numeric; exposure numeric; approved_version integer; current_version integer;
BEGIN
 SELECT i.party_id,(o.preview->'party_configuration'->>'version')::integer INTO party,approved_version FROM finance_subledger_item i JOIN finance_subledger_operation o
 ON (o.tenant_id,o.company_id,o.id)=(NEW.tenant_id,NEW.company_id,NEW.operation_id)
 WHERE (i.tenant_id,i.company_id,i.id)=(NEW.tenant_id,NEW.company_id,NEW.item_id)
 AND i.side='receivable' AND i.kind='invoice' AND i.operation_id=NEW.operation_id AND o.type='recognition';
 IF party IS NULL THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('subledger:'||NEW.tenant_id||':'||NEW.company_id,0));
 SELECT credit_limit,version INTO limit_value,current_version FROM finance_party_configuration
 WHERE (tenant_id,company_id,party_id)=(NEW.tenant_id,NEW.company_id,party) ORDER BY version DESC LIMIT 1;
 IF limit_value IS NULL OR approved_version IS DISTINCT FROM current_version THEN RAISE EXCEPTION 'Current reviewed customer financial configuration is required'
  USING ERRCODE='23514',CONSTRAINT='finance_customer_credit_configuration'; END IF;
 SELECT greatest(0,coalesce(sum(e.base_delta),0)) INTO exposure FROM finance_subledger_item i JOIN finance_subledger_item_event e
 ON (e.tenant_id,e.company_id,e.item_id)=(i.tenant_id,i.company_id,i.id)
 WHERE i.tenant_id=NEW.tenant_id AND i.company_id=NEW.company_id AND i.party_id=party AND i.side='receivable';
 IF exposure>limit_value THEN RAISE EXCEPTION 'Customer credit limit exceeded' USING ERRCODE='23514',CONSTRAINT='finance_customer_credit_limit'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER customer_credit_guard AFTER INSERT ON finance_subledger_item_event
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_guard_customer_credit();
DO $$ BEGIN
 REVOKE ALL ON finance_party_configuration FROM PUBLIC;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexora_app') THEN
  REVOKE ALL ON finance_party_configuration FROM nexora_app;
  GRANT SELECT,INSERT ON finance_party_configuration TO nexora_app;
 END IF;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',43,'party_financial_configuration');
