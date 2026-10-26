-- Ordinary Finance nominals share account identity, not Bank capability.
ALTER TABLE account ADD COLUMN managed_general_nominal boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT account_general_nominal_shape CHECK (
 NOT managed_general_nominal OR (NOT managed_bank_nominal AND NOT is_header
 AND parent_id IS NOT NULL AND manual_posting_allowed AND NOT reconciliation_required
 AND NOT is_system_account AND char_length(btrim(name)) BETWEEN 1 AND 160));
CREATE UNIQUE INDEX uq_account_general_nominal_name
 ON account(tenant_id,company_id,parent_id,lower(btrim(name))) WHERE managed_general_nominal;

CREATE TABLE finance_general_nominal_policy (
 tenant_id text NOT NULL, company_id text NOT NULL, section_id text NOT NULL, category_id text NOT NULL,
 prefix text NOT NULL CHECK(char_length(prefix)<=100),
 code_width smallint NOT NULL CHECK(code_width BETWEEN 1 AND 18),
 next_value bigint NOT NULL CHECK(next_value>0),
 last_value bigint NOT NULL CHECK(last_value>0 AND last_value<power(10::numeric,code_width)),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 PRIMARY KEY(tenant_id,company_id,section_id),
 FOREIGN KEY(tenant_id,company_id,section_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,category_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 CHECK(section_id<>category_id AND next_value<=last_value+1 AND char_length(prefix)+code_width<=128)
);
CREATE TABLE finance_general_nominal (
 tenant_id text NOT NULL, company_id text NOT NULL, nominal_id text NOT NULL,
 currency text NOT NULL,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','pending_approval','active','rejected','inactive')),
 row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, submitted_by text, decided_by text,
 approval_override_event_id text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,nominal_id),
 FOREIGN KEY(tenant_id,company_id,nominal_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,currency) REFERENCES currency(tenant_id,code) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,submitted_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,decided_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,approval_override_event_id) REFERENCES approval_override_event(tenant_id,event_id) ON DELETE RESTRICT,
 CHECK(state='draft' OR submitted_by IS NOT NULL),
 CHECK(state NOT IN ('active','rejected','inactive') OR decided_by IS NOT NULL)
);
CREATE TABLE finance_general_nominal_event (
 tenant_id text NOT NULL, event_id text NOT NULL, company_id text NOT NULL, nominal_id text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('created','updated','submitted','approved','rejected','deactivated')),
 resulting_version bigint NOT NULL CHECK(resulting_version>0),
 actor_id text NOT NULL, reason text CHECK(reason IS NULL OR char_length(btrim(reason)) BETWEEN 3 AND 500),
 approval_override_event_id text, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,event_id), UNIQUE(tenant_id,nominal_id,resulting_version),
 FOREIGN KEY(tenant_id,company_id,nominal_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,approval_override_event_id) REFERENCES approval_override_event(tenant_id,event_id) ON DELETE RESTRICT,
 CHECK(event_type IN ('created','updated') OR reason IS NOT NULL)
);
CREATE INDEX idx_general_nominal_company_state ON finance_general_nominal(tenant_id,company_id,state,nominal_id);
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['finance_general_nominal_policy','finance_general_nominal','finance_general_nominal_event'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''nexora.tenant_id'',true))',table_name);
 END LOOP;
END $$;
CREATE TRIGGER general_nominal_event_immutable BEFORE UPDATE OR DELETE ON finance_general_nominal_event
 FOR EACH ROW EXECUTE FUNCTION protect_bank_account_event();

CREATE FUNCTION protect_general_nominal_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'General nominal policies cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((NEW.tenant_id,NEW.company_id,NEW.section_id,NEW.category_id,NEW.prefix,NEW.code_width,NEW.last_value)
 IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.section_id,OLD.category_id,OLD.prefix,OLD.code_width,OLD.last_value)
 OR NEW.next_value<OLD.next_value) THEN
  RAISE EXCEPTION 'General nominal policy identity and allocation are protected' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM account s JOIN account c ON c.tenant_id=s.tenant_id AND c.company_id=s.company_id AND c.id=s.parent_id
 WHERE s.tenant_id=NEW.tenant_id AND s.company_id=NEW.company_id AND s.id=NEW.section_id AND c.id=NEW.category_id
 AND s.is_header AND c.is_header AND s.status='active' AND c.status='active' AND s.type=c.type
 AND NOT EXISTS(SELECT 1 FROM finance_nominal_section_policy b WHERE b.tenant_id=s.tenant_id AND b.company_id=s.company_id AND b.section_id=s.id)) THEN
  RAISE EXCEPTION 'General nominal policy requires ordinary same-company active headers' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER general_nominal_policy_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_general_nominal_policy
 FOR EACH ROW EXECUTE FUNCTION protect_general_nominal_policy();

CREATE FUNCTION protect_general_nominal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'General nominal history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id
  AND id=NEW.nominal_id AND managed_general_nominal) THEN
  RAISE EXCEPTION 'General nominal profile requires managed Finance identity' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'draft' OR NEW.row_version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL
   OR NEW.approval_override_event_id IS NOT NULL THEN
   RAISE EXCEPTION 'General nominal must start as a draft' USING ERRCODE='23514';
  END IF;
 ELSE
  IF (NEW.tenant_id,NEW.company_id,NEW.nominal_id,NEW.created_by,NEW.created_at)
   IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.nominal_id,OLD.created_by,OLD.created_at)
   OR NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at
   OR (OLD.state<>'draft' AND NEW.currency<>OLD.currency)
   OR NOT ((OLD.state='draft' AND NEW.state IN ('draft','pending_approval'))
     OR (OLD.state='pending_approval' AND NEW.state IN ('active','rejected'))
     OR (OLD.state='active' AND NEW.state='inactive')) THEN
   RAISE EXCEPTION 'General nominal lifecycle transition is invalid' USING ERRCODE='23514';
  END IF;
  IF OLD.state<>'draft' AND NEW.submitted_by IS DISTINCT FROM OLD.submitted_by THEN
   RAISE EXCEPTION 'General nominal submitter is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.state<>'pending_approval' AND (NEW.decided_by,NEW.approval_override_event_id)
    IS DISTINCT FROM (OLD.decided_by,OLD.approval_override_event_id) THEN
   RAISE EXCEPTION 'General nominal decision evidence is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.state IN ('active','rejected') AND NEW.decided_by IN (NEW.created_by,NEW.submitted_by) THEN
   IF NOT EXISTS(SELECT 1 FROM approval_override_event e WHERE e.tenant_id=NEW.tenant_id
    AND e.event_id=NEW.approval_override_event_id AND e.resource_type='finance.nominal'
    AND e.resource_id=NEW.nominal_id AND e.actor_user_id=NEW.decided_by
    AND e.normal_permission_key='finance.nominal.approve'
    AND e.decision_action=CASE WHEN NEW.state='active' THEN 'approve' ELSE 'reject' END) THEN
    RAISE EXCEPTION 'General nominal self-decision requires bound override evidence' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM currency WHERE tenant_id=NEW.tenant_id AND code=NEW.currency AND status='active') THEN
  RAISE EXCEPTION 'General nominal requires an active currency' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER general_nominal_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_general_nominal
 FOR EACH ROW EXECUTE FUNCTION protect_general_nominal();

CREATE FUNCTION protect_general_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.managed_general_nominal THEN RAISE EXCEPTION 'General nominal cannot be deleted' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF NEW.managed_general_nominal IS DISTINCT FROM OLD.managed_general_nominal THEN
  RAISE EXCEPTION 'General nominal classification is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.managed_general_nominal THEN
  IF (NEW.id,NEW.tenant_id,NEW.company_id,NEW.code,NEW.parent_id,NEW.type,NEW.is_header,NEW.manual_posting_allowed,
      NEW.reconciliation_required,NEW.is_system_account,NEW.created_at)
  IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.company_id,OLD.code,OLD.parent_id,OLD.type,OLD.is_header,OLD.manual_posting_allowed,
      OLD.reconciliation_required,OLD.is_system_account,OLD.created_at) THEN
   RAISE EXCEPTION 'General nominal accounting identity is immutable' USING ERRCODE='23514';
  END IF;
  IF (NEW.name,NEW.description,NEW.required_dimensions) IS DISTINCT FROM (OLD.name,OLD.description,OLD.required_dimensions)
    AND NOT EXISTS(SELECT 1 FROM finance_general_nominal g WHERE g.tenant_id=OLD.tenant_id AND g.nominal_id=OLD.id AND g.state='draft') THEN
   RAISE EXCEPTION 'Only draft general nominal fields may be edited' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER general_account_identity_guard BEFORE UPDATE OR DELETE ON account
 FOR EACH ROW EXECUTE FUNCTION protect_general_account_identity();

CREATE FUNCTION validate_general_nominal_final() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a account%ROWTYPE; g finance_general_nominal%ROWTYPE; ident text;
BEGIN
 IF TG_TABLE_NAME='account' THEN ident:=NEW.id;
 ELSIF TG_TABLE_NAME='bank_account' THEN ident:=NEW.account_id;
 ELSE ident:=NEW.nominal_id; END IF;
 SELECT * INTO a FROM account WHERE tenant_id=NEW.tenant_id AND id=ident;
 IF NOT a.managed_general_nominal THEN RETURN NEW; END IF;
 SELECT * INTO g FROM finance_general_nominal WHERE tenant_id=a.tenant_id AND nominal_id=a.id FOR SHARE;
 IF g.nominal_id IS NULL OR g.company_id<>a.company_id OR (g.state='active')<>(a.status='active')
 OR NOT EXISTS(SELECT 1 FROM finance_general_nominal_policy p JOIN account s
   ON s.tenant_id=p.tenant_id AND s.company_id=p.company_id AND s.id=p.section_id
   JOIN account c ON c.tenant_id=s.tenant_id AND c.company_id=s.company_id AND c.id=p.category_id
   WHERE p.tenant_id=a.tenant_id AND p.company_id=a.company_id AND p.section_id=a.parent_id
   AND s.parent_id=c.id AND s.is_header AND c.is_header AND s.type=a.type AND c.type=a.type
   AND s.status='active' AND c.status='active')
 OR EXISTS(SELECT 1 FROM bank_account b WHERE b.tenant_id=a.tenant_id AND b.account_id=a.id) THEN
  RAISE EXCEPTION 'General nominal accounting and governance authority disagree' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER general_nominal_account_consistency AFTER INSERT OR UPDATE ON account
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_general_nominal_final();
CREATE CONSTRAINT TRIGGER general_nominal_profile_consistency AFTER INSERT OR UPDATE ON finance_general_nominal
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_general_nominal_final();
CREATE CONSTRAINT TRIGGER general_nominal_no_bank_capability AFTER INSERT OR UPDATE ON bank_account
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_general_nominal_final();

CREATE FUNCTION validate_general_nominal_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g finance_general_nominal%ROWTYPE; expected_state text;
BEGIN
 SELECT * INTO g FROM finance_general_nominal WHERE tenant_id=NEW.tenant_id AND nominal_id=NEW.nominal_id FOR SHARE;
 expected_state:=CASE NEW.event_type WHEN 'created' THEN 'draft' WHEN 'updated' THEN 'draft'
 WHEN 'submitted' THEN 'pending_approval' WHEN 'approved' THEN 'active' WHEN 'rejected' THEN 'rejected' ELSE 'inactive' END;
 IF g.nominal_id IS NULL OR g.company_id<>NEW.company_id OR g.row_version<>NEW.resulting_version OR g.state<>expected_state
 OR NEW.actor_id IS DISTINCT FROM (CASE NEW.event_type WHEN 'created' THEN g.created_by WHEN 'submitted' THEN g.submitted_by
  WHEN 'approved' THEN g.decided_by WHEN 'rejected' THEN g.decided_by ELSE NEW.actor_id END)
 OR NEW.approval_override_event_id IS DISTINCT FROM (CASE WHEN NEW.event_type IN ('approved','rejected') THEN g.approval_override_event_id ELSE NULL END) THEN
  RAISE EXCEPTION 'General nominal event does not match lifecycle evidence' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER general_nominal_event_guard BEFORE INSERT ON finance_general_nominal_event
 FOR EACH ROW EXECUTE FUNCTION validate_general_nominal_event();

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('finance',11,'general_nominal_master');
