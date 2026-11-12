-- Additive workflow for new interactive headers; no existing record is enrolled or changed.
-- Existing account and audit guard functions are retained without replacement.
CREATE TABLE finance_coa_hierarchy_workflow (
 tenant_id text NOT NULL, company_id text NOT NULL, account_id text NOT NULL,
 record_version bigint NOT NULL CHECK(record_version>1), change_id text NOT NULL,
 state text NOT NULL CHECK(state IN ('draft','pending_approval','active','inactive','rejected')),
 action text NOT NULL CHECK(action IN ('created','updated','submitted','approved','rejected','activated','deactivated')),
 actor_id text NOT NULL, approval_override_event_id text,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,change_id), UNIQUE(tenant_id,account_id,record_version),
 FOREIGN KEY(tenant_id,company_id,account_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,change_id) REFERENCES finance_coa_master_change(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,approval_override_event_id) REFERENCES approval_override_event(tenant_id,event_id)
);
ALTER TABLE finance_coa_hierarchy_workflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_coa_hierarchy_workflow FORCE ROW LEVEL SECURITY;
CREATE POLICY coa_hierarchy_workflow_tenant ON finance_coa_hierarchy_workflow
 USING(tenant_id=current_setting('nexora.tenant_id',true))
 WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER coa_hierarchy_workflow_immutable BEFORE UPDATE OR DELETE ON finance_coa_hierarchy_workflow
 FOR EACH ROW EXECUTE FUNCTION protect_bank_account_event();

CREATE FUNCTION validate_coa_hierarchy_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a account%ROWTYPE; m finance_coa_master_change%ROWTYPE; previous finance_coa_hierarchy_workflow%ROWTYPE;
 permission text; self_decision boolean;
BEGIN
 SELECT * INTO a FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.account_id FOR UPDATE;
 SELECT * INTO m FROM finance_coa_master_change WHERE tenant_id=NEW.tenant_id AND id=NEW.change_id;
 SELECT * INTO previous FROM finance_coa_hierarchy_workflow WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id ORDER BY record_version DESC LIMIT 1;
 IF a.id IS NULL OR NOT a.is_header OR m.id IS NULL OR a.coa_change_id IS DISTINCT FROM NEW.change_id
 OR a.coa_version<>NEW.record_version OR m.record_version<>NEW.record_version OR m.account_id<>NEW.account_id
 OR m.company_id<>NEW.company_id OR m.actor_id<>NEW.actor_id
 OR m.action<>(CASE NEW.action WHEN 'submitted' THEN 'updated' WHEN 'approved' THEN 'activated' WHEN 'rejected' THEN 'updated' ELSE NEW.action END)
 OR a.status<>(CASE WHEN NEW.state='active' THEN 'active' ELSE 'inactive' END)
 THEN RAISE EXCEPTION 'Hierarchy workflow requires exact current master evidence' USING ERRCODE='23514'; END IF;
 IF previous.change_id IS NULL THEN
  IF NEW.action<>'created' OR NEW.state<>'draft' OR NEW.record_version<>2
  THEN RAISE EXCEPTION 'New hierarchy workflow must start as draft' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.record_version<>previous.record_version+1 OR NOT (
    (NEW.action='updated' AND previous.state IN ('draft','active','inactive') AND NEW.state=previous.state)
    OR (NEW.action='submitted' AND previous.state='draft' AND NEW.state='pending_approval')
    OR (NEW.action='approved' AND previous.state='pending_approval' AND NEW.state='active')
    OR (NEW.action='rejected' AND previous.state='pending_approval' AND NEW.state='rejected')
    OR (NEW.action='deactivated' AND previous.state='active' AND NEW.state='inactive')
    OR (NEW.action='activated' AND previous.state='inactive' AND NEW.state='active'))
  THEN RAISE EXCEPTION 'Invalid hierarchy lifecycle transition' USING ERRCODE='23514'; END IF;
 END IF;
 permission:=CASE NEW.action WHEN 'created' THEN 'finance.nominal.create' WHEN 'updated' THEN 'finance.nominal.update'
  WHEN 'submitted' THEN 'finance.nominal.submit' WHEN 'approved' THEN 'finance.nominal.approve'
  WHEN 'rejected' THEN 'finance.nominal.approve' ELSE 'finance.nominal.status' END;
 IF NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.actor_id,permission)
 OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.actor_id,'platform.approval.override',true)
 THEN RAISE EXCEPTION 'Live hierarchy lifecycle authority required' USING ERRCODE='23514'; END IF;
 self_decision:=NEW.action IN ('approved','rejected') AND EXISTS(
  SELECT 1 FROM finance_coa_hierarchy_workflow w WHERE w.tenant_id=NEW.tenant_id AND w.account_id=NEW.account_id
   AND w.action IN ('created','submitted') AND w.actor_id=NEW.actor_id);
 IF self_decision THEN
  IF NOT EXISTS(SELECT 1 FROM approval_override_event e WHERE e.tenant_id=NEW.tenant_id AND e.event_id=NEW.approval_override_event_id
   AND e.actor_user_id=NEW.actor_id AND e.resource_type='finance.hierarchy' AND e.resource_id=NEW.account_id
   AND e.decision_action=(CASE NEW.action WHEN 'approved' THEN 'approve' ELSE 'reject' END)
   AND e.normal_permission_key='finance.nominal.approve' AND e.metadata->>'company_id'=NEW.company_id
   AND (e.metadata->>'expected_version')::bigint=previous.record_version AND e.reason=m.reason)
  THEN RAISE EXCEPTION 'Self decision requires bound approval override evidence' USING ERRCODE='23514'; END IF;
 ELSIF NEW.approval_override_event_id IS NOT NULL THEN
  RAISE EXCEPTION 'Only self decisions may claim an approval override' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coa_hierarchy_workflow_validation BEFORE INSERT ON finance_coa_hierarchy_workflow
 FOR EACH ROW EXECUTE FUNCTION validate_coa_hierarchy_workflow();

CREATE FUNCTION bind_coa_hierarchy_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_admin_audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.change_id
  AND e.approval_reference IS NOT DISTINCT FROM NEW.approval_override_event_id)
 THEN RAISE EXCEPTION 'Hierarchy approval requires bound immutable audit evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER coa_hierarchy_workflow_binding AFTER INSERT ON finance_coa_hierarchy_workflow
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bind_coa_hierarchy_workflow();

-- Only tracked header records are checked. Ordinary nominal and legacy header behavior is unchanged.
CREATE FUNCTION bind_coa_hierarchy_account() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE w finance_coa_hierarchy_workflow%ROWTYPE;
BEGIN
 SELECT * INTO w FROM finance_coa_hierarchy_workflow WHERE tenant_id=NEW.tenant_id AND account_id=NEW.id ORDER BY record_version DESC LIMIT 1;
 IF w.change_id IS NOT NULL AND (NOT NEW.is_header OR w.change_id IS DISTINCT FROM NEW.coa_change_id OR w.record_version<>NEW.coa_version
  OR NEW.status<>(CASE WHEN w.state='active' THEN 'active' ELSE 'inactive' END)
  OR NOT coa_master_proof(NEW.tenant_id,NEW.company_id,NEW.id,NEW.coa_change_id,NEW.coa_version,NEW.status,NEW.name)
  OR NOT EXISTS(SELECT 1 FROM finance_coa_master_change m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.coa_change_id
    AND m.before_state->>'code'=NEW.code AND m.before_state->>'type'=NEW.type
    AND m.before_state->>'parent_id' IS NOT DISTINCT FROM NEW.parent_id))
 THEN RAISE EXCEPTION 'Hierarchy account must match its immutable lifecycle event' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER coa_hierarchy_account_binding AFTER UPDATE ON account
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.is_header OR NEW.is_header) EXECUTE FUNCTION bind_coa_hierarchy_account();

INSERT INTO nexora_schema_migration(module_name,version,name)
 VALUES('finance',35,'hierarchy_approval_workflow');
