-- All historical headers retain null evidence identities. No grant/backfill.
CREATE TABLE bank_self_approval_grant_version (
 tenant_id text NOT NULL, company_id text NOT NULL, transaction_kind text NOT NULL CHECK(transaction_kind IN ('payment','receipt')),
 user_id text NOT NULL, version bigint NOT NULL CHECK(version>0), id text NOT NULL,
 state text NOT NULL CHECK(state IN ('active','revoked')), actor_id text NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 audit_event_id text NOT NULL, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 255),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,transaction_kind,user_id,version), UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,audit_event_id), UNIQUE(tenant_id,actor_id,idempotency_key),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
CREATE FUNCTION bank_can_self_approve(t text,c text,u text,k text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT k IN ('payment','receipt') AND bank_has_live_permission(t,c,u,'banking.'||k||'.approve')
 AND EXISTS(SELECT 1 FROM bank_self_approval_grant_version g WHERE g.tenant_id=t AND g.company_id=c
  AND g.transaction_kind=k AND g.user_id=u AND g.state='active' AND g.version=(
   SELECT max(v.version) FROM bank_self_approval_grant_version v WHERE v.tenant_id=t AND v.company_id=c AND v.transaction_kind=k AND v.user_id=u))
$$;
CREATE FUNCTION bind_bank_self_approval_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous record;
BEGIN
 -- Serialize with Bank decisions, including direct SQL statements using this guard.
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:security:admin:'||NEW.tenant_id,0));
 SELECT version,state INTO previous FROM bank_self_approval_grant_version WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id
  AND transaction_kind=NEW.transaction_kind AND user_id=NEW.user_id ORDER BY version DESC LIMIT 1;
 IF NEW.version<>coalesce(previous.version,0)+1 OR NEW.state IS NOT DISTINCT FROM previous.state
  OR (previous.version IS NULL AND NEW.state<>'active') OR NEW.actor_id=NEW.user_id
  OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.actor_id,'platform.approval.override',true)
  OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.actor_id,'security.bank_self_approval.manage')
  OR (NEW.state='active' AND NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.user_id,'banking.'||NEW.transaction_kind||'.approve'))
  OR NOT EXISTS(SELECT 1 FROM platform_admin_audit_event a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.audit_event_id
   AND a.actor_id=NEW.actor_id AND a.entity_type='bank_self_approval_grant' AND a.entity_id=NEW.id
   AND a.action='security.bank_self_approval.'||NEW.state AND a.source_reference='company:'||NEW.company_id)
 THEN RAISE EXCEPTION 'Bank self-approval grant requires current global authority, exact version and audit' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_self_approval_grant_binding BEFORE INSERT ON bank_self_approval_grant_version FOR EACH ROW EXECUTE FUNCTION bind_bank_self_approval_grant();

CREATE TABLE bank_delegated_decision (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 transaction_kind text NOT NULL CHECK(transaction_kind IN ('payment','receipt')), payment_id text, receipt_id text,
 record_version bigint NOT NULL CHECK(record_version>0), user_id text NOT NULL, grant_version bigint NOT NULL,
 created_by text NOT NULL, submitted_by text NOT NULL, decision_action text NOT NULL CHECK(decision_action IN ('approve','reject')),
 audit_event_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,audit_event_id), UNIQUE(tenant_id,payment_id), UNIQUE(tenant_id,receipt_id),
 CHECK((transaction_kind='payment' AND payment_id IS NOT NULL AND receipt_id IS NULL) OR (transaction_kind='receipt' AND receipt_id IS NOT NULL AND payment_id IS NULL)),
 FOREIGN KEY(tenant_id,company_id,payment_id) REFERENCES bank_payment(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,receipt_id) REFERENCES bank_receipt(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,transaction_kind,user_id,grant_version) REFERENCES bank_self_approval_grant_version(tenant_id,company_id,transaction_kind,user_id,version),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
CREATE TABLE bank_approver_reassignment (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 transaction_kind text NOT NULL CHECK(transaction_kind IN ('payment','receipt')), payment_id text, receipt_id text,
 record_version bigint NOT NULL CHECK(record_version>1), previous_user_id text, assigned_user_id text NOT NULL,
 actor_id text NOT NULL, audit_event_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,audit_event_id), UNIQUE(tenant_id,payment_id,record_version), UNIQUE(tenant_id,receipt_id,record_version),
 CHECK(previous_user_id IS DISTINCT FROM assigned_user_id),
 CHECK((transaction_kind='payment' AND payment_id IS NOT NULL AND receipt_id IS NULL) OR (transaction_kind='receipt' AND receipt_id IS NOT NULL AND payment_id IS NULL)),
 FOREIGN KEY(tenant_id,company_id,payment_id) REFERENCES bank_payment(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,receipt_id) REFERENCES bank_receipt(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,previous_user_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,assigned_user_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
ALTER TABLE bank_payment ADD COLUMN delegated_decision_id text, ADD COLUMN approver_reassignment_id text,
 ADD FOREIGN KEY(tenant_id,delegated_decision_id) REFERENCES bank_delegated_decision(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
 ADD FOREIGN KEY(tenant_id,approver_reassignment_id) REFERENCES bank_approver_reassignment(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE bank_receipt ADD COLUMN delegated_decision_id text, ADD COLUMN approver_reassignment_id text,
 ADD FOREIGN KEY(tenant_id,delegated_decision_id) REFERENCES bank_delegated_decision(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
 ADD FOREIGN KEY(tenant_id,approver_reassignment_id) REFERENCES bank_approver_reassignment(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;

-- Preserve the original ordinary/global decision alternatives; add only separately
-- bound delegated evidence. A deferred FK/guard forbids an invented evidence ID.
DO $$ DECLARE k text; BEGIN
 FOREACH k IN ARRAY ARRAY['payment','receipt'] LOOP
  EXECUTE format('ALTER TABLE bank_%s DROP CONSTRAINT bank_%s_decision_separation_check',k,k);
  EXECUTE format($sql$ALTER TABLE bank_%s ADD CONSTRAINT bank_%s_decision_separation_check CHECK (
   (state IN ('draft','submitted') AND delegated_decision_id IS NULL)
   OR (state IN ('approved','posted','reversed','rejected') AND (
    ((CASE WHEN state='rejected' THEN rejected_by ELSE approved_by END)<>created_by AND
     (CASE WHEN state='rejected' THEN rejected_by ELSE approved_by END)<>submitted_by AND approval_override_event_id IS NULL AND delegated_decision_id IS NULL)
    OR (((CASE WHEN state='rejected' THEN rejected_by ELSE approved_by END)=created_by OR
      (CASE WHEN state='rejected' THEN rejected_by ELSE approved_by END)=submitted_by) AND
     num_nonnulls(approval_override_event_id,delegated_decision_id)=1))))$sql$,k,k);
 END LOOP;
END $$;

CREATE FUNCTION enforce_bank_workflow_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text:=CASE TG_TABLE_NAME WHEN 'bank_payment' THEN 'payment' ELSE 'receipt' END;
 count_lines integer; total numeric(38,8);
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Bank transactions cannot be deleted' USING ERRCODE='P0001'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'draft' OR NEW.delegated_decision_id IS NOT NULL OR NEW.approver_reassignment_id IS NOT NULL THEN
   RAISE EXCEPTION 'New Bank records must be drafts without decision evidence' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF (NEW.tenant_id,NEW.id,NEW.company_id,NEW.reference,NEW.created_by,NEW.created_at) IS DISTINCT FROM
  (OLD.tenant_id,OLD.id,OLD.company_id,OLD.reference,OLD.created_by,OLD.created_at) THEN
  RAISE EXCEPTION 'Bank identity and creation evidence are immutable' USING ERRCODE='P0001'; END IF;
 IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
  RAISE EXCEPTION 'Bank version and update time must advance' USING ERRCODE='23514'; END IF;
 IF NEW.state=OLD.state THEN
  IF OLD.state='submitted' AND NEW.approver_reassignment_id IS NOT NULL
   AND NEW.approver_reassignment_id IS DISTINCT FROM OLD.approver_reassignment_id
   AND NEW.approver_user_id IS DISTINCT FROM OLD.approver_user_id
   AND (to_jsonb(NEW)-ARRAY['row_version','updated_at','approver_user_id','approver_reassignment_id'])=
       (to_jsonb(OLD)-ARRAY['row_version','updated_at','approver_user_id','approver_reassignment_id']) THEN RETURN NEW; END IF;
  IF OLD.state<>'draft' THEN RAISE EXCEPTION 'Only draft Bank transactions may be edited' USING ERRCODE='P0001'; END IF;
  IF (NEW.delegated_decision_id,NEW.approver_reassignment_id) IS DISTINCT FROM (OLD.delegated_decision_id,OLD.approver_reassignment_id) THEN
   RAISE EXCEPTION 'Drafts cannot acquire decision/reassignment evidence' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NOT ((OLD.state='draft' AND NEW.state='submitted') OR (OLD.state='submitted' AND NEW.state IN ('approved','rejected'))
  OR (OLD.state='approved' AND NEW.state='posted') OR (OLD.state='posted' AND NEW.state='reversed')) THEN
  RAISE EXCEPTION 'Invalid Bank lifecycle transition' USING ERRCODE='23514'; END IF;
 IF OLD.state IN ('submitted','approved','posted') AND (NEW.submitted_by,NEW.submitted_at) IS DISTINCT FROM (OLD.submitted_by,OLD.submitted_at) THEN
  RAISE EXCEPTION 'Bank submission evidence is immutable' USING ERRCODE='P0001'; END IF;
 IF OLD.state IN ('approved','posted') AND (NEW.approved_by,NEW.approved_at,NEW.decision_reason,NEW.approval_override_event_id,NEW.delegated_decision_id)
  IS DISTINCT FROM (OLD.approved_by,OLD.approved_at,OLD.decision_reason,OLD.approval_override_event_id,OLD.delegated_decision_id) THEN
  RAISE EXCEPTION 'Bank approval evidence is immutable' USING ERRCODE='P0001'; END IF;
 IF OLD.state='posted' AND (NEW.posted_by,NEW.posted_at,NEW.original_period_id,NEW.original_accounting_event_id,NEW.original_journal_entry_id)
  IS DISTINCT FROM (OLD.posted_by,OLD.posted_at,OLD.original_period_id,OLD.original_accounting_event_id,OLD.original_journal_entry_id) THEN
  RAISE EXCEPTION 'Bank posting evidence is immutable' USING ERRCODE='P0001'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','row_version','updated_at','submitted_by','submitted_at','approved_by','approved_at','rejected_by','rejected_at','decision_reason',
  'approval_override_event_id','delegated_decision_id','posted_by','posted_at','original_period_id','original_accounting_event_id','original_journal_entry_id',
  'reversed_by','reversed_at','reversal_reason','reversal_period_id','reversal_accounting_event_id','reversal_journal_entry_id']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['state','row_version','updated_at','submitted_by','submitted_at','approved_by','approved_at','rejected_by','rejected_at','decision_reason',
  'approval_override_event_id','delegated_decision_id','posted_by','posted_at','original_period_id','original_accounting_event_id','original_journal_entry_id',
  'reversed_by','reversed_at','reversal_reason','reversal_period_id','reversal_accounting_event_id','reversal_journal_entry_id']) THEN
  RAISE EXCEPTION 'Bank business facts cannot change during lifecycle transitions' USING ERRCODE='P0001'; END IF;
 IF NEW.delegated_decision_id IS DISTINCT FROM OLD.delegated_decision_id AND NOT (OLD.state='submitted' AND NEW.state IN ('approved','rejected')) THEN
  RAISE EXCEPTION 'Delegation evidence belongs only to a decision' USING ERRCODE='23514'; END IF;
 IF OLD.state='draft' AND NEW.state='submitted' THEN
  EXECUTE format('SELECT count(*)::integer,coalesce(sum(amount),0) FROM bank_%s_line WHERE tenant_id=$1 AND company_id=$2 AND %s_id=$3',k,k)
  INTO count_lines,total USING NEW.tenant_id,NEW.company_id,NEW.id;
  IF count_lines NOT BETWEEN 1 AND 200 OR total<=0 OR total<>NEW.total_amount THEN
   RAISE EXCEPTION 'Submitted Bank lines must match the persisted positive total' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_bank_workflow_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text:=CASE TG_TABLE_NAME WHEN 'bank_payment' THEN 'payment' ELSE 'receipt' END; reassignment boolean:=false;
BEGIN
 IF TG_OP='UPDATE' THEN
  reassignment:=OLD.state='submitted' AND NEW.state='submitted' AND NEW.approver_reassignment_id IS NOT NULL
   AND NEW.approver_reassignment_id IS DISTINCT FROM OLD.approver_reassignment_id;
  IF OLD.state<>'draft' AND ((NEW.project_id,NEW.location_id) IS DISTINCT FROM (OLD.project_id,OLD.location_id)
   OR (NOT reassignment AND NEW.approver_user_id IS DISTINCT FROM OLD.approver_user_id)) THEN
   RAISE EXCEPTION 'Submitted Bank context is immutable outside governed reassignment' USING ERRCODE='23514'; END IF;
  IF NEW.state='reversed' THEN RETURN NEW; END IF;
  IF OLD.state='draft' AND NEW.state='submitted' AND NEW.approver_user_id IS NULL THEN
   RAISE EXCEPTION 'Select an eligible Bank approver' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT reassignment AND NEW.state IN ('draft','submitted','posted') THEN
  IF NEW.project_id IS NOT NULL THEN
   PERFORM 1 FROM erp_project WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.project_id AND status='active' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Active company project required' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.location_id IS NOT NULL THEN
   PERFORM 1 FROM erp_location WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.location_id AND status='active' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Active company location required' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF NEW.approver_user_id IS NOT NULL AND NEW.state IN ('draft','submitted','approved','rejected') AND
  NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.approver_user_id,'banking.'||k||'.approve') THEN
  RAISE EXCEPTION 'Assigned Bank approver is no longer eligible' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION bind_bank_governance_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target record; k text:=NEW.transaction_kind; target_id text:=coalesce(NEW.payment_id,NEW.receipt_id); is_decision boolean:=TG_TABLE_NAME='bank_delegated_decision';
 deciding text;
BEGIN
 EXECUTE format('SELECT * FROM bank_%I WHERE tenant_id=$1 AND company_id=$2 AND id=$3',k) INTO target USING NEW.tenant_id,NEW.company_id,target_id;
 IF target.id IS NULL OR target.row_version<>NEW.record_version THEN RAISE EXCEPTION 'Governance evidence version mismatch' USING ERRCODE='23514'; END IF;
 IF is_decision THEN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('nexora:security:admin:'||NEW.tenant_id,0));
  deciding:=CASE target.state WHEN 'approved' THEN target.approved_by WHEN 'rejected' THEN target.rejected_by ELSE NULL END;
  IF target.delegated_decision_id IS DISTINCT FROM NEW.id OR target.approval_override_event_id IS NOT NULL
   OR deciding IS DISTINCT FROM NEW.user_id OR target.approver_user_id IS DISTINCT FROM NEW.user_id
   OR NEW.created_by<>target.created_by OR NEW.submitted_by<>target.submitted_by
   OR (NEW.user_id<>target.created_by AND NEW.user_id<>target.submitted_by)
   OR NEW.decision_action<>(CASE target.state WHEN 'approved' THEN 'approve' WHEN 'rejected' THEN 'reject' ELSE '' END)
   OR NOT bank_can_self_approve(NEW.tenant_id,NEW.company_id,NEW.user_id,k)
   OR NEW.grant_version<>(SELECT max(version) FROM bank_self_approval_grant_version WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND transaction_kind=k AND user_id=NEW.user_id)
   OR NOT EXISTS(SELECT 1 FROM platform_admin_audit_event a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.audit_event_id AND a.actor_id=NEW.user_id
    AND a.entity_type='bank_'||k AND a.entity_id=target_id AND a.action='banking.'||k||'.'||NEW.decision_action AND a.approval_reference IS NULL)
  THEN RAISE EXCEPTION 'Delegated Bank decision requires exact live grant and audit evidence' USING ERRCODE='23514'; END IF;
 ELSE
  IF target.state<>'submitted' OR target.approver_reassignment_id IS DISTINCT FROM NEW.id OR target.approver_user_id<>NEW.assigned_user_id
   OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.actor_id,'platform.approval.override',true)
   OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.actor_id,'banking.'||k||'.approve')
   OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.assigned_user_id,'banking.'||k||'.approve')
   OR (NEW.assigned_user_id IN (target.created_by,target.submitted_by) AND NOT (
    bank_can_self_approve(NEW.tenant_id,NEW.company_id,NEW.assigned_user_id,k)
    OR bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.assigned_user_id,'platform.approval.override',true)))
   OR NOT EXISTS(SELECT 1 FROM platform_admin_audit_event a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.audit_event_id AND a.actor_id=NEW.actor_id
    AND a.entity_type='bank_'||k AND a.entity_id=target_id AND a.action='banking.'||k||'.reassign')
  THEN RAISE EXCEPTION 'Bank reassignment requires global authority, eligible checker and exact audit' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION require_bank_governance_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.delegated_decision_id IS DISTINCT FROM OLD.delegated_decision_id AND NOT EXISTS(
  SELECT 1 FROM bank_delegated_decision e WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.id=NEW.delegated_decision_id
   AND coalesce(e.payment_id,e.receipt_id)=NEW.id AND (e.payment_id IS NOT NULL)=(TG_TABLE_NAME='bank_payment') AND e.record_version=NEW.row_version)
 THEN RAISE EXCEPTION 'Matching immutable delegated decision evidence required' USING ERRCODE='23514'; END IF;
 IF NEW.approver_reassignment_id IS DISTINCT FROM OLD.approver_reassignment_id AND NOT EXISTS(
  SELECT 1 FROM bank_approver_reassignment e WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.id=NEW.approver_reassignment_id
   AND coalesce(e.payment_id,e.receipt_id)=NEW.id AND (e.payment_id IS NOT NULL)=(TG_TABLE_NAME='bank_payment') AND e.record_version=NEW.row_version
   AND e.previous_user_id IS NOT DISTINCT FROM OLD.approver_user_id AND e.assigned_user_id=NEW.approver_user_id)
 THEN RAISE EXCEPTION 'Matching immutable reassignment history required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE k text; relation text; BEGIN
 FOREACH k IN ARRAY ARRAY['payment','receipt'] LOOP
  EXECUTE format('DROP TRIGGER bank_%s_transition_guard ON bank_%s',k,k);
  EXECUTE format('CREATE TRIGGER bank_%s_transition_guard BEFORE INSERT OR UPDATE OR DELETE ON bank_%s FOR EACH ROW EXECUTE FUNCTION enforce_bank_workflow_transition()',k,k);
  EXECUTE format('CREATE CONSTRAINT TRIGGER bank_governance_evidence AFTER UPDATE ON bank_%s DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_bank_governance_evidence()',k);
 END LOOP;
 FOREACH relation IN ARRAY ARRAY['bank_self_approval_grant_version','bank_delegated_decision','bank_approver_reassignment'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',relation);
  EXECUTE format('CREATE TRIGGER governance_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation()',relation);
 END LOOP;
 FOREACH relation IN ARRAY ARRAY['bank_delegated_decision','bank_approver_reassignment'] LOOP
  EXECUTE format('CREATE TRIGGER governance_binding BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION bind_bank_governance_evidence()',relation);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',22,'bank_delegation_and_reassignment');
