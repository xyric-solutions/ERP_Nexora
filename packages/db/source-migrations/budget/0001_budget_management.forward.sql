-- Additive foundation. Does not activate controls or change existing budget rows.
-- Budget runs after procurement/HR; bridge foreign keys are safe on clean installs.
CREATE TABLE budget_sequence (
 tenant_id text NOT NULL, company_id text NOT NULL, prefix text NOT NULL,
 next_value bigint NOT NULL CHECK(next_value>0), PRIMARY KEY(tenant_id,company_id,prefix),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id)
);
CREATE TABLE budget_plan (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, code text NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200), fiscal_calendar_id text NOT NULL,
 currency text NOT NULL, owner_id text NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by text NOT NULL, updated_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,fiscal_calendar_id) REFERENCES fiscal_calendar(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,currency) REFERENCES company_currency_profile(tenant_id,company_id,base_currency),
 FOREIGN KEY(tenant_id,owner_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE budget_version (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, plan_id text NOT NULL,
 number integer NOT NULL CHECK(number>0), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 kind text NOT NULL CHECK(kind IN ('baseline','revision','scenario','forecast')),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','approved','rejected')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), parent_id text,
 assumptions jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(assumptions)='object'),
 cutoff date, approval_instance_id text, approver_id text, submitted_hash text,
 created_by text NOT NULL, updated_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,plan_id,number),
 FOREIGN KEY(tenant_id,company_id,plan_id) REFERENCES budget_plan(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,parent_id) REFERENCES budget_version(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,approval_instance_id) REFERENCES approval_instance(tenant_id,id),
 FOREIGN KEY(tenant_id,approver_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE budget_line (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, version_id text NOT NULL,
 account_id text NOT NULL, dimensions jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dimensions)='object'),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,version_id,account_id,dimensions),
 FOREIGN KEY(tenant_id,company_id,version_id) REFERENCES budget_version(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,account_id) REFERENCES account(tenant_id,company_id,id)
);
ALTER TABLE budget ADD COLUMN managed_line_id text;
ALTER TABLE budget ADD FOREIGN KEY(tenant_id,company_id,managed_line_id) REFERENCES budget_line(tenant_id,company_id,id);
CREATE UNIQUE INDEX budget_managed_period ON budget(tenant_id,company_id,managed_line_id,period_id) WHERE managed_line_id IS NOT NULL;
CREATE INDEX budget_line_version ON budget_line(tenant_id,company_id,version_id);
CREATE TABLE budget_model (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, code text NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'), active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE budget_policy (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, fiscal_calendar_id text NOT NULL,
 version integer NOT NULL CHECK(version>0), control_version_id text NOT NULL, enabled boolean NOT NULL,
 mode text NOT NULL CHECK(mode IN ('warning','approval','block')),
 warn_percent numeric(8,4) NOT NULL CHECK(warn_percent BETWEEN 0 AND 100),
 effective_date date NOT NULL, created_by text NOT NULL, reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,fiscal_calendar_id,version),
 FOREIGN KEY(tenant_id,company_id,control_version_id) REFERENCES budget_version(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,fiscal_calendar_id) REFERENCES fiscal_calendar(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE budget_request (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, code text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('transfer','exception','closure')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 state text NOT NULL DEFAULT 'submitted' CHECK(state IN ('submitted','approved','rejected')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), approval_instance_id text,
 created_by text NOT NULL, updated_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,approval_instance_id) REFERENCES approval_instance(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE budget_transfer_effect (
 tenant_id text NOT NULL, company_id text NOT NULL, request_id text NOT NULL, line_id text NOT NULL,
 period_id text NOT NULL, amount numeric(38,8) NOT NULL CHECK(amount<>0),
 PRIMARY KEY(tenant_id,company_id,request_id,line_id,period_id),
 FOREIGN KEY(tenant_id,company_id,request_id) REFERENCES budget_request(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,line_id) REFERENCES budget_line(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,period_id) REFERENCES financial_period(tenant_id,id)
);
CREATE TABLE budget_commitment (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 source_document_id text NOT NULL, source_line_id text NOT NULL, account_id text NOT NULL,
 dimensions jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dimensions)='object'),
 period_id text NOT NULL, reserved_base numeric(38,8) NOT NULL CHECK(reserved_base>0),
 reserved_native numeric(38,8) NOT NULL CHECK(reserved_native>0), currency text NOT NULL,
 rate numeric(38,18) NOT NULL CHECK(rate>0), rate_id text, source_version integer NOT NULL,
 created_by text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), commitment_date date NOT NULL,
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,source_document_id,source_line_id),
 FOREIGN KEY(tenant_id,company_id,source_document_id) REFERENCES procurement_document(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,period_id) REFERENCES financial_period(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE budget_commitment_event (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, commitment_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('recognize','reverse','close')),
 base_delta numeric(38,8) NOT NULL CHECK(base_delta<>0), native_delta numeric(38,8) NOT NULL,
 journal_id text, source_document_id text, source_line_id text, request_id text,
 event_date date NOT NULL, actor_id text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id),
 UNIQUE(tenant_id,company_id,commitment_id,journal_id,source_line_id),
 FOREIGN KEY(tenant_id,company_id,commitment_id) REFERENCES budget_commitment(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,journal_id) REFERENCES journal_entry(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,source_document_id) REFERENCES procurement_document(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,request_id) REFERENCES budget_request(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 CHECK((kind IN ('recognize','reverse') AND journal_id IS NOT NULL AND request_id IS NULL) OR (kind='close' AND request_id IS NOT NULL AND journal_id IS NULL))
);
CREATE INDEX budget_commitment_pool ON budget_commitment(tenant_id,company_id,period_id,account_id);
CREATE INDEX budget_commitment_as_of ON budget_commitment_event(tenant_id,company_id,commitment_id,event_date);
CREATE TABLE budget_import (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, version_id text NOT NULL,
 target_version integer NOT NULL, content_hash text NOT NULL, lines jsonb NOT NULL, errors jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('preview','committed')), version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL, updated_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,version_id) REFERENCES budget_version(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE budget_comment (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, version_id text NOT NULL,
 account_id text NOT NULL, period_id text NOT NULL, comment text NOT NULL CHECK(length(btrim(comment)) BETWEEN 3 AND 2000),
 actor_id text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,version_id) REFERENCES budget_version(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,period_id) REFERENCES financial_period(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE budget_audit (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, entity text NOT NULL, entity_id text NOT NULL,
 record_version integer NOT NULL, action text NOT NULL, actor_id text NOT NULL, reason text NOT NULL,
 correlation_id text NOT NULL, snapshot jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,entity,entity_id,record_version),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE budget_idempotency (
 tenant_id text NOT NULL, company_id text NOT NULL, actor_id text NOT NULL, key text NOT NULL,
 fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,actor_id,key),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id)
);
CREATE FUNCTION guard_budget_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Budget documents cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.created_by,NEW.created_at) IS DISTINCT FROM
     (OLD.tenant_id,OLD.company_id,OLD.id,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 THEN
   RAISE EXCEPTION 'Budget identity/version is immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME IN ('budget_version','budget_request') THEN
   IF OLD.state='approved' OR (OLD.state='submitted' AND
     (to_jsonb(NEW)-ARRAY['state','version','updated_by','updated_at','approval_instance_id','submitted_hash']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','version','updated_by','updated_at','approval_instance_id','submitted_hash'])) THEN
    RAISE EXCEPTION 'Approved/submitted budget content is immutable' USING ERRCODE='23514'; END IF;
   IF TG_TABLE_NAME='budget_version' AND NOT
    ((OLD.state IN ('draft','rejected') AND NEW.state IN ('draft','submitted')) OR (OLD.state='submitted' AND NEW.state IN ('approved','rejected'))) THEN
    RAISE EXCEPTION 'Invalid budget lifecycle transition' USING ERRCODE='23514'; END IF;
   IF TG_TABLE_NAME='budget_request' AND NOT (OLD.state='submitted' AND NEW.state IN ('approved','rejected')) THEN
    RAISE EXCEPTION 'Invalid budget request decision' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION require_budget_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM budget_audit a WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id
  AND a.entity=TG_TABLE_NAME AND a.entity_id=NEW.id AND a.record_version=NEW.version
  AND a.actor_id=NEW.updated_by AND a.snapshot=to_jsonb(NEW)) THEN
  RAISE EXCEPTION 'Immutable budget audit evidence required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION guard_budget_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state text;
BEGIN
 SELECT v.state INTO state FROM budget_version v WHERE v.tenant_id=OLD.tenant_id AND v.company_id=OLD.company_id AND v.id=OLD.version_id;
 IF state NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Only draft budget lines can change' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER budget_line_immutable BEFORE UPDATE OR DELETE ON budget_line FOR EACH ROW EXECUTE FUNCTION guard_budget_line();
CREATE FUNCTION guard_managed_budget_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line budget_line; document budget_version; calendar fiscal_calendar; period financial_period;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.managed_line_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM budget_line l JOIN budget_version v ON v.tenant_id=l.tenant_id AND v.company_id=l.company_id AND v.id=l.version_id WHERE l.tenant_id=OLD.tenant_id AND l.company_id=OLD.company_id AND l.id=OLD.managed_line_id AND v.state IN ('draft','rejected')) THEN
   RAISE EXCEPTION 'Approved budget allocation is immutable' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.managed_line_id IS NOT NULL AND NEW.managed_line_id IS DISTINCT FROM OLD.managed_line_id THEN
  RAISE EXCEPTION 'Managed budget ownership is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.managed_line_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO line FROM budget_line WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.managed_line_id;
 SELECT * INTO document FROM budget_version WHERE tenant_id=line.tenant_id AND company_id=line.company_id AND id=line.version_id;
 SELECT f.* INTO calendar FROM budget_plan p JOIN fiscal_calendar f ON f.tenant_id=p.tenant_id AND f.id=p.fiscal_calendar_id WHERE p.tenant_id=document.tenant_id AND p.company_id=document.company_id AND p.id=document.plan_id;
 SELECT * INTO period FROM financial_period WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.period_id;
 IF line.id IS NULL OR period.id IS NULL OR NEW.account_id<>line.account_id OR NEW.dimensions<>line.dimensions OR NEW.version<>document.number
  OR (document.kind NOT IN ('forecast','scenario') AND period.fiscal_calendar_id<>calendar.id) OR NEW.fiscal_year<>(SELECT year FROM fiscal_calendar WHERE tenant_id=NEW.tenant_id AND id=period.fiscal_calendar_id) THEN
  RAISE EXCEPTION 'Managed budget scope/period mismatch' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND document.state NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Only draft allocations can be added' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (document.state NOT IN ('draft','rejected') AND (to_jsonb(NEW)-ARRAY['status','approval_instance_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','approval_instance_id'])) THEN
  RAISE EXCEPTION 'Approved budget amount is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER managed_budget_guard BEFORE INSERT OR UPDATE OR DELETE ON budget FOR EACH ROW EXECUTE FUNCTION guard_managed_budget_allocation();
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['budget_plan','budget_version','budget_model','budget_request','budget_import'] LOOP
  EXECUTE format('CREATE TRIGGER identity_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_budget_document()',name);
  EXECUTE format('CREATE CONSTRAINT TRIGGER audit_evidence AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_budget_evidence()',name);
 END LOOP;
 FOREACH name IN ARRAY ARRAY['budget_policy','budget_transfer_effect','budget_commitment','budget_commitment_event','budget_comment','budget_audit','budget_idempotency'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_finance_subledger_immutable()',name);
 END LOOP;
 FOREACH name IN ARRAY ARRAY['budget_sequence','budget_plan','budget_version','budget_line','budget_model','budget_policy','budget_request','budget_transfer_effect','budget_commitment','budget_commitment_event','budget_import','budget_comment','budget_audit','budget_idempotency'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY company_scope ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=%I.tenant_id AND a.company_id=%I.company_id AND a.user_id=current_setting(''nexora.user_id'',true) AND a.revoked_at IS NULL)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=%I.tenant_id AND a.company_id=%I.company_id AND a.user_id=current_setting(''nexora.user_id'',true) AND a.revoked_at IS NULL))',name,name,name,name,name);
 END LOOP;
END $$;
CREATE INDEX budget_version_directory ON budget_version(tenant_id,company_id,plan_id,number DESC);
CREATE INDEX budget_request_queue ON budget_request(tenant_id,company_id,state,created_at,id);
CREATE INDEX budget_audit_history ON budget_audit(tenant_id,company_id,entity_id,occurred_at,id);
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('budget',1,'budget_management');
