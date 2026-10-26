-- Direct Super Admin CoA master changes. No business activation or classification backfill.
CREATE TABLE finance_coa_master_change (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,account_id text NOT NULL,
 actor_id text NOT NULL,action text NOT NULL CHECK(action IN ('updated','activated','deactivated','created')),
 record_version bigint NOT NULL CHECK(record_version>0),resulting_state text NOT NULL CHECK(resulting_state IN ('active','inactive')),
 profile_state text NOT NULL CHECK(profile_state IN ('active','inactive','draft')),
 account_name text NOT NULL,currency text,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 before_state jsonb NOT NULL CHECK(jsonb_typeof(before_state)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,account_id,record_version),
 FOREIGN KEY(tenant_id,company_id,account_id) REFERENCES account(tenant_id,company_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,id) REFERENCES platform_admin_audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE finance_coa_master_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_coa_master_change FORCE ROW LEVEL SECURITY;
CREATE POLICY coa_master_tenant ON finance_coa_master_change USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER coa_master_change_immutable BEFORE UPDATE OR DELETE ON finance_coa_master_change FOR EACH ROW EXECUTE FUNCTION protect_bank_account_event();
ALTER TABLE account ADD COLUMN coa_change_id text,ADD COLUMN coa_version bigint NOT NULL DEFAULT 1 CHECK(coa_version>0),
 ADD FOREIGN KEY(tenant_id,coa_change_id) REFERENCES finance_coa_master_change(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE finance_general_nominal ADD COLUMN coa_change_id text,
 ADD FOREIGN KEY(tenant_id,coa_change_id) REFERENCES finance_coa_master_change(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE bank_account ADD COLUMN coa_change_id text,
 ADD FOREIGN KEY(tenant_id,coa_change_id) REFERENCES finance_coa_master_change(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE finance_general_nominal DROP CONSTRAINT finance_general_nominal_check,DROP CONSTRAINT finance_general_nominal_check1,
 ADD CHECK(coa_change_id IS NOT NULL OR state='draft' OR submitted_by IS NOT NULL),
 ADD CHECK(coa_change_id IS NOT NULL OR state NOT IN ('active','rejected','inactive') OR decided_by IS NOT NULL);
ALTER TABLE bank_account DROP CONSTRAINT bank_account_lifecycle_evidence_check, ADD CONSTRAINT bank_account_lifecycle_evidence_check CHECK((identity_mode='nominal_only' AND coa_change_id IS NOT NULL) OR ((((status = 'review_required'::text) OR ((created_by IS NOT NULL) AND (((status = 'draft'::text) AND (submitted_by IS NULL) AND (submitted_at IS NULL) AND (submission_reason IS NULL) AND (approved_by IS NULL) AND (approved_at IS NULL) AND (rejected_by IS NULL) AND (rejected_at IS NULL) AND (decision_reason IS NULL)) OR ((status = 'pending_approval'::text) AND (submitted_by IS NOT NULL) AND (submitted_at IS NOT NULL) AND (submission_reason IS NOT NULL) AND (approved_by IS NULL) AND (approved_at IS NULL) AND (rejected_by IS NULL) AND (rejected_at IS NULL) AND (decision_reason IS NULL)) OR ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'closed'::text])) AND (submitted_by IS NOT NULL) AND (submitted_at IS NOT NULL) AND (submission_reason IS NOT NULL) AND (approved_by IS NOT NULL) AND (approved_at IS NOT NULL) AND (decision_reason IS NOT NULL) AND (rejected_by IS NULL) AND (rejected_at IS NULL)) OR ((status = 'rejected'::text) AND (submitted_by IS NOT NULL) AND (submitted_at IS NOT NULL) AND (submission_reason IS NOT NULL) AND (rejected_by IS NOT NULL) AND (rejected_at IS NOT NULL) AND (decision_reason IS NOT NULL) AND (approved_by IS NULL) AND (approved_at IS NULL))))))));
ALTER TABLE bank_account DROP CONSTRAINT bank_account_approval_override_evidence_check, ADD CONSTRAINT bank_account_approval_override_evidence_check CHECK((identity_mode='nominal_only' AND coa_change_id IS NOT NULL) OR (((((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'review_required'::text])) AND (approval_override_event_id IS NULL)) OR ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'closed'::text])) AND (((approved_by <> created_by) AND ((submitted_by IS NULL) OR (approved_by <> submitted_by)) AND (approval_override_event_id IS NULL)) OR (((approved_by = created_by) OR (approved_by = submitted_by)) AND (approval_override_event_id IS NOT NULL)))) OR ((status = 'rejected'::text) AND (((rejected_by <> created_by) AND ((submitted_by IS NULL) OR (rejected_by <> submitted_by)) AND (approval_override_event_id IS NULL)) OR (((rejected_by = created_by) OR (rejected_by = submitted_by)) AND (approval_override_event_id IS NOT NULL))))))));
ALTER TABLE finance_general_nominal_event DROP CONSTRAINT finance_general_nominal_event_event_type_check,ADD CONSTRAINT finance_general_nominal_event_event_type_check CHECK(event_type IN ('created','updated','submitted','approved','rejected','deactivated','activated'));
ALTER TABLE finance_nominal_event DROP CONSTRAINT finance_nominal_event_event_type_check,ADD CONSTRAINT finance_nominal_event_event_type_check CHECK(event_type IN ('created','updated','submitted','approved','rejected','deactivated','activated'));
ALTER TABLE bank_account_event DROP CONSTRAINT bank_account_event_event_type_check,ADD CONSTRAINT bank_account_event_event_type_check CHECK(event_type IN ('created','updated','submitted','approved','rejected','revised','deactivated','closed','activated'));

CREATE FUNCTION coa_master_proof(t text,c text,a text,e text,v bigint,s text,n text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM finance_coa_master_change m WHERE m.tenant_id=t AND m.company_id=c AND m.account_id=a AND m.id=e AND m.record_version=v AND m.resulting_state=s AND m.account_name=n
 AND bank_has_live_permission(t,c,m.actor_id,'platform.approval.override',true));
$$;
CREATE FUNCTION validate_coa_master_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('nexora:security:admin:'||NEW.tenant_id,0));
 IF NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.actor_id,'platform.approval.override',true)
 THEN RAISE EXCEPTION 'Only a live global Super Admin may manage Chart of Accounts masters' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coa_master_authority BEFORE INSERT ON finance_coa_master_change FOR EACH ROW EXECUTE FUNCTION validate_coa_master_change();
CREATE FUNCTION bind_coa_master_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a account%ROWTYPE; g finance_general_nominal%ROWTYPE; b bank_account%ROWTYPE; v bigint; marker text; s text; cur text;
BEGIN
 SELECT * INTO a FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.account_id;
 IF a.is_header THEN v:=a.coa_version;marker:=a.coa_change_id;s:=a.status;cur:=null;
 ELSIF a.managed_general_nominal THEN SELECT * INTO g FROM finance_general_nominal WHERE tenant_id=a.tenant_id AND nominal_id=a.id;v:=g.row_version;marker:=g.coa_change_id;s:=g.state;cur:=g.currency;
 ELSE SELECT * INTO b FROM bank_account WHERE tenant_id=a.tenant_id AND account_id=a.id AND identity_mode='nominal_only';v:=b.row_version;marker:=b.coa_change_id;s:=b.status;cur:=b.currency; END IF;
 IF a.id IS NULL OR v IS DISTINCT FROM NEW.record_version OR marker IS DISTINCT FROM NEW.id OR s<>NEW.profile_state OR a.status<>NEW.resulting_state OR a.name<>NEW.account_name OR cur IS DISTINCT FROM NEW.currency
 OR NOT EXISTS(SELECT 1 FROM platform_admin_audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.id AND e.actor_id=NEW.actor_id AND e.entity_id=NEW.account_id AND e.action='finance.coa_master.'||NEW.action)
 THEN RAISE EXCEPTION 'Direct CoA change requires exact immutable audit and current record binding' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER coa_master_evidence_binding AFTER INSERT ON finance_coa_master_change DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bind_coa_master_change();
CREATE OR REPLACE FUNCTION public.protect_general_nominal()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND NEW.coa_change_id IS DISTINCT FROM OLD.coa_change_id THEN
  IF (NEW.tenant_id,NEW.company_id,NEW.nominal_id,NEW.created_by,NEW.created_at,NEW.submitted_by,NEW.decided_by,NEW.approval_override_event_id) IS DISTINCT FROM
     (OLD.tenant_id,OLD.company_id,OLD.nominal_id,OLD.created_by,OLD.created_at,OLD.submitted_by,OLD.decided_by,OLD.approval_override_event_id)
   OR NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at OR NEW.state NOT IN ('draft','active','inactive')
   OR NOT EXISTS(SELECT 1 FROM account a JOIN finance_coa_master_change m ON m.tenant_id=a.tenant_id AND m.id=NEW.coa_change_id WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.nominal_id AND a.managed_general_nominal AND m.profile_state=NEW.state AND coa_master_proof(NEW.tenant_id,NEW.company_id,a.id,NEW.coa_change_id,NEW.row_version,a.status,a.name))
   OR NOT EXISTS(SELECT 1 FROM currency c WHERE c.tenant_id=NEW.tenant_id AND c.code=NEW.currency AND c.status='active')
  THEN RAISE EXCEPTION 'Invalid direct nominal master change' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
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
END $function$
;
CREATE OR REPLACE FUNCTION public.enforce_bank_account_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND NEW.coa_change_id IS DISTINCT FROM OLD.coa_change_id THEN
  IF OLD.identity_mode<>'nominal_only' OR NEW.identity_mode<>OLD.identity_mode OR NEW.status NOT IN ('draft','active','inactive')
   OR NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at
   OR (to_jsonb(NEW)-ARRAY['coa_change_id','row_version','updated_at','status','account_name','currency','deactivated_by','deactivated_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['coa_change_id','row_version','updated_at','status','account_name','currency','deactivated_by','deactivated_at'])
   OR NOT EXISTS(SELECT 1 FROM finance_coa_master_change m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.coa_change_id AND m.profile_state=NEW.status AND coa_master_proof(NEW.tenant_id,NEW.company_id,NEW.account_id,NEW.coa_change_id,NEW.row_version,CASE WHEN NEW.status='active' THEN 'active' ELSE 'inactive' END,NEW.account_name))
  THEN RAISE EXCEPTION 'Invalid direct Bank nominal master change' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'bank accounts cannot be deleted';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.reference IS DISTINCT FROM OLD.reference
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'bank account identity and creation evidence are immutable';
    END IF;
    IF NEW.row_version <> OLD.row_version + 1 OR NEW.updated_at <= OLD.updated_at THEN
        RAISE EXCEPTION 'bank account version and update time must advance';
    END IF;
    IF OLD.status = 'review_required' THEN
        RAISE EXCEPTION 'legacy bank account requires an explicit migration review workflow';
    END IF;
    IF NEW.status = OLD.status THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'only draft bank accounts may be edited';
        END IF;
        RETURN NEW;
    END IF;
    IF NOT (
        (OLD.status='draft' AND NEW.status='pending_approval')
        OR (OLD.status='pending_approval' AND NEW.status IN ('active','rejected'))
        OR (OLD.status='rejected' AND NEW.status='draft')
        OR (OLD.status='active' AND NEW.status='inactive')
        OR (OLD.status='inactive' AND NEW.status='closed')
    ) THEN
        RAISE EXCEPTION 'invalid bank account lifecycle transition: % -> %', OLD.status, NEW.status;
    END IF;
    IF NOT (OLD.status='rejected' AND NEW.status='draft')
       AND (to_jsonb(NEW)
            - 'status' - 'row_version' - 'updated_at'
            - 'submitted_by' - 'submitted_at' - 'submission_reason'
            - 'approved_by' - 'approved_at'
            - 'rejected_by' - 'rejected_at' - 'decision_reason'
            - 'deactivated_by' - 'deactivated_at' - 'closed_by' - 'closed_at'
            - 'approval_override_event_id')
           IS DISTINCT FROM
           (to_jsonb(OLD)
            - 'status' - 'row_version' - 'updated_at'
            - 'submitted_by' - 'submitted_at' - 'submission_reason'
            - 'approved_by' - 'approved_at'
            - 'rejected_by' - 'rejected_at' - 'decision_reason'
            - 'deactivated_by' - 'deactivated_at' - 'closed_by' - 'closed_at'
            - 'approval_override_event_id') THEN
        RAISE EXCEPTION 'bank account business fields cannot change during a lifecycle decision';
    END IF;
    RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.protect_general_account_identity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF TG_TABLE_NAME='account' AND TG_OP='UPDATE' AND NEW.coa_change_id IS DISTINCT FROM OLD.coa_change_id THEN
  IF (to_jsonb(NEW)-ARRAY['coa_change_id','coa_version','name','description','status'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['coa_change_id','coa_version','name','description','status'])
   OR NEW.coa_version<=OLD.coa_version
   OR NOT coa_master_proof(NEW.tenant_id,NEW.company_id,NEW.id,NEW.coa_change_id,NEW.coa_version,NEW.status,NEW.name)
  THEN RAISE EXCEPTION 'CoA identity or direct change evidence is invalid' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
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
END $function$
;
CREATE OR REPLACE FUNCTION public.protect_finance_nominal_identity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF TG_TABLE_NAME='account' AND TG_OP='UPDATE' AND NEW.coa_change_id IS DISTINCT FROM OLD.coa_change_id THEN
  IF (to_jsonb(NEW)-ARRAY['coa_change_id','coa_version','name','description','status'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['coa_change_id','coa_version','name','description','status'])
   OR NEW.coa_version<=OLD.coa_version
   OR NOT coa_master_proof(NEW.tenant_id,NEW.company_id,NEW.id,NEW.coa_change_id,NEW.coa_version,NEW.status,NEW.name)
  THEN RAISE EXCEPTION 'CoA identity or direct change evidence is invalid' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
    IF TG_TABLE_NAME='bank_account' THEN
        IF NEW.identity_mode IS DISTINCT FROM OLD.identity_mode
           OR (OLD.identity_mode='nominal_only' AND NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
            RAISE EXCEPTION 'Bank nominal identity mode and mapping are immutable' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP='DELETE' THEN
        IF OLD.managed_bank_nominal THEN
            RAISE EXCEPTION 'Managed bank nominals cannot be deleted' USING ERRCODE='23514';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.managed_bank_nominal IS DISTINCT FROM OLD.managed_bank_nominal THEN
        RAISE EXCEPTION 'Managed bank nominal classification is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.managed_bank_nominal THEN
        IF (NEW.id,NEW.tenant_id,NEW.company_id,NEW.code,NEW.parent_id,NEW.type,NEW.is_header,
            NEW.manual_posting_allowed,NEW.reconciliation_required,NEW.is_system_account,NEW.created_at)
           IS DISTINCT FROM
           (OLD.id,OLD.tenant_id,OLD.company_id,OLD.code,OLD.parent_id,OLD.type,OLD.is_header,
            OLD.manual_posting_allowed,OLD.reconciliation_required,OLD.is_system_account,OLD.created_at) THEN
            RAISE EXCEPTION 'Managed bank nominal accounting identity is immutable' USING ERRCODE='23514';
        END IF;
        IF (NEW.name,NEW.description,NEW.required_dimensions) IS DISTINCT FROM (OLD.name,OLD.description,OLD.required_dimensions)
           AND NOT EXISTS (SELECT 1 FROM bank_account WHERE tenant_id=OLD.tenant_id
                           AND account_id=OLD.id AND identity_mode='nominal_only' AND status='draft') THEN
            RAISE EXCEPTION 'Only draft nominal business fields may be edited' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.validate_general_nominal_event()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE g finance_general_nominal%ROWTYPE; expected_state text;
BEGIN
 IF NEW.event_type IN ('updated','activated','deactivated') AND EXISTS(
 SELECT 1 FROM finance_general_nominal p JOIN finance_coa_master_change m ON m.tenant_id=p.tenant_id AND m.id=p.coa_change_id
 WHERE p.tenant_id=NEW.tenant_id AND p.nominal_id=NEW.nominal_id AND p.company_id=NEW.company_id AND p.row_version=NEW.resulting_version
 AND m.actor_id=NEW.actor_id AND m.record_version=NEW.resulting_version AND m.action=NEW.event_type AND NEW.approval_override_event_id IS NULL)
 THEN RETURN NEW; END IF;
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
END $function$
;
CREATE OR REPLACE FUNCTION public.validate_finance_nominal_event()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    bank bank_account%ROWTYPE;
    expected_state text;
BEGIN
 IF NEW.event_type IN ('updated','activated','deactivated') AND EXISTS(
 SELECT 1 FROM bank_account p JOIN finance_coa_master_change m ON m.tenant_id=p.tenant_id AND m.id=p.coa_change_id
 WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.bank_account_id AND p.account_id=NEW.nominal_id AND p.company_id=NEW.company_id AND p.row_version=NEW.resulting_version
 AND m.actor_id=NEW.actor_id AND m.record_version=NEW.resulting_version AND m.action=NEW.event_type AND NEW.approval_override_event_id IS NULL)
 THEN RETURN NEW; END IF;
    SELECT * INTO bank FROM bank_account WHERE tenant_id=NEW.tenant_id AND id=NEW.bank_account_id FOR SHARE;
    expected_state:=CASE NEW.event_type WHEN 'created' THEN 'draft' WHEN 'updated' THEN 'draft'
        WHEN 'submitted' THEN 'pending_approval' WHEN 'approved' THEN 'active'
        WHEN 'rejected' THEN 'rejected' WHEN 'deactivated' THEN 'inactive' END;
    IF bank.id IS NULL OR bank.identity_mode<>'nominal_only' OR bank.account_id<>NEW.nominal_id
       OR bank.company_id<>NEW.company_id OR bank.row_version<>NEW.resulting_version OR bank.status<>expected_state
       OR NEW.approval_override_event_id IS DISTINCT FROM
          (CASE WHEN NEW.event_type IN ('approved','rejected') THEN bank.approval_override_event_id ELSE NULL END) THEN
        RAISE EXCEPTION 'Finance nominal event does not match its Banking lifecycle evidence' USING ERRCODE='23514';
    END IF;
    IF NEW.actor_id IS DISTINCT FROM (CASE NEW.event_type
        WHEN 'created' THEN bank.created_by WHEN 'submitted' THEN bank.submitted_by
        WHEN 'approved' THEN bank.approved_by WHEN 'rejected' THEN bank.rejected_by
        WHEN 'deactivated' THEN bank.deactivated_by ELSE NEW.actor_id END) THEN
        RAISE EXCEPTION 'Finance nominal event actor does not match lifecycle authority' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.validate_chart_bank_binding()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM finance_chart_company_node m
  JOIN finance_chart_template_node s ON s.tenant_id=m.tenant_id AND s.template_id=m.template_id AND s.node_key=m.node_key
  JOIN account a ON a.tenant_id=m.tenant_id AND a.company_id=m.company_id AND a.id=NEW.nominal_id
  JOIN bank_account b ON b.tenant_id=a.tenant_id AND b.company_id=a.company_id AND b.account_id=a.id AND b.identity_mode='nominal_only'
  JOIN finance_nominal_event e ON e.tenant_id=a.tenant_id AND e.company_id=a.company_id AND e.nominal_id=a.id AND e.bank_account_id=b.id AND e.event_type='created' AND e.actor_id=NEW.created_by AND e.resulting_version=1
  JOIN platform_admin_audit_event audit ON audit.tenant_id=a.tenant_id AND audit.id=NEW.audit_event_id AND audit.entity_type='finance_nominal' AND audit.entity_id=a.id AND audit.action='finance.nominal.create' AND audit.actor_id=NEW.created_by
  WHERE m.tenant_id=NEW.tenant_id AND m.company_id=NEW.company_id AND m.template_id=NEW.template_id AND m.node_key=NEW.node_key
   AND m.account_id=NEW.nominal_id AND s.kind='nominal' AND s.parent_key='section:2309' AND a.code=s.code AND a.name=s.name AND a.managed_bank_nominal
   AND b.created_by=NEW.created_by AND (b.status='draft' OR (b.status='active' AND EXISTS(SELECT 1 FROM finance_coa_master_change direct WHERE direct.tenant_id=b.tenant_id AND direct.company_id=b.company_id AND direct.account_id=a.id AND direct.id=b.coa_change_id AND direct.action='activated' AND direct.record_version=b.row_version AND direct.actor_id=NEW.created_by)))) THEN
  RAISE EXCEPTION 'Bank definition binding requires the exact audited Bank draft and source mapping' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $function$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',24,'direct_coa_master_changes');
