-- Additive references only. Existing business records remain null; no assignment backfill.
ALTER TABLE bank_payment
 ADD COLUMN project_id text,
 ADD COLUMN location_id text,
 ADD COLUMN approver_user_id text,
 ADD FOREIGN KEY(tenant_id,company_id,project_id) REFERENCES erp_project(tenant_id,company_id,id),
 ADD FOREIGN KEY(tenant_id,company_id,location_id) REFERENCES erp_location(tenant_id,company_id,id),
 ADD FOREIGN KEY(tenant_id,approver_user_id) REFERENCES security_user_account(tenant_id,id);
ALTER TABLE bank_receipt
 ADD COLUMN project_id text,
 ADD COLUMN location_id text,
 ADD COLUMN approver_user_id text,
 ADD FOREIGN KEY(tenant_id,company_id,project_id) REFERENCES erp_project(tenant_id,company_id,id),
 ADD FOREIGN KEY(tenant_id,company_id,location_id) REFERENCES erp_location(tenant_id,company_id,id),
 ADD FOREIGN KEY(tenant_id,approver_user_id) REFERENCES security_user_account(tenant_id,id);
CREATE INDEX bank_payment_assigned_queue ON bank_payment(tenant_id,company_id,approver_user_id,state,id);
CREATE INDEX bank_receipt_assigned_queue ON bank_receipt(tenant_id,company_id,approver_user_id,state,id);

CREATE FUNCTION bank_has_live_permission(t text,c text,u text,permission text,super_only boolean DEFAULT false)
 RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM security_user_account actor
 JOIN security_user_company_access access ON access.tenant_id=actor.tenant_id AND access.user_id=actor.id AND access.company_id=c AND access.revoked_at IS NULL
 JOIN organization_unit company ON company.tenant_id=access.tenant_id AND company.id=c AND company.type='company' AND company.status='active'
 JOIN security_user_role_assignment_version assignment ON assignment.tenant_id=actor.tenant_id AND assignment.user_id=actor.id
 JOIN security_role_policy policy ON policy.tenant_id=assignment.tenant_id AND policy.id=assignment.role_policy_id AND policy.status='active' AND policy.lifecycle_state='active'
 JOIN security_tenant_role role ON role.tenant_id=policy.tenant_id AND role.role_id=policy.role_id AND role.lifecycle_state='active'
 JOIN security_role_permission_grant g ON g.tenant_id=policy.tenant_id AND g.role_policy_id=policy.id AND g.permission_key=permission
 JOIN security_permission_definition d ON d.permission_key=g.permission_key AND d.status='active'
 JOIN security_role_scope_grant s ON s.tenant_id=g.tenant_id AND s.role_policy_id=g.role_policy_id AND s.permission_key=g.permission_key
 WHERE actor.tenant_id=t AND actor.id=u AND actor.status='active' AND actor.archived_at IS NULL
 AND assignment.lifecycle_state='active' AND assignment.valid_from<=now() AND (assignment.valid_until IS NULL OR assignment.valid_until>now())
 AND assignment.version=(SELECT max(v.version) FROM security_user_role_assignment_version v WHERE v.tenant_id=assignment.tenant_id AND v.assignment_id=assignment.assignment_id)
 AND (NOT super_only OR role.role_code='super_administrator')
 AND ((s.scope_kind='tenant' AND s.scope_value=t) OR (NOT super_only AND s.scope_kind='company' AND s.scope_value=c)))
$$;
-- An independently authorized super-admin intervention is not a fabricated self-approval override.
CREATE TABLE bank_assignment_intervention (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 payment_id text, receipt_id text, record_version bigint NOT NULL CHECK(record_version>0),
 assigned_user_id text NOT NULL, actor_id text NOT NULL, audit_event_id text NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,audit_event_id),
 CHECK(num_nonnulls(payment_id,receipt_id)=1),
 FOREIGN KEY(tenant_id,company_id,payment_id) REFERENCES bank_payment(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,receipt_id) REFERENCES bank_receipt(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,assigned_user_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
ALTER TABLE bank_assignment_intervention ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_assignment_intervention FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bank_assignment_intervention
 USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER bank_assignment_intervention_immutable BEFORE UPDATE OR DELETE ON bank_assignment_intervention
 FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();

CREATE FUNCTION guard_bank_workflow_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text:=CASE TG_TABLE_NAME WHEN 'bank_payment' THEN 'payment' ELSE 'receipt' END; deciding text;
BEGIN
 IF TG_OP='UPDATE' AND OLD.state<>'draft' AND
  (NEW.project_id,NEW.location_id,NEW.approver_user_id) IS DISTINCT FROM (OLD.project_id,OLD.location_id,OLD.approver_user_id) THEN
  RAISE EXCEPTION 'Submitted Bank workflow context is immutable' USING ERRCODE='23514';
 END IF;
 -- Reversal must remain possible even after a historical reference is inactive.
 IF TG_OP='UPDATE' AND NEW.state='reversed' THEN RETURN NEW; END IF;
 IF NEW.state IN ('draft','submitted','posted') THEN
  IF NEW.project_id IS NOT NULL THEN
   PERFORM 1 FROM erp_project WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.project_id AND status='active' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Active company project required' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.location_id IS NOT NULL THEN
   PERFORM 1 FROM erp_location WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.location_id AND status='active' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Active company location required' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.state='draft' AND NEW.state='submitted' AND NEW.approver_user_id IS NULL THEN
  RAISE EXCEPTION 'Select an eligible Bank approver before submitting' USING ERRCODE='23514';
 END IF;
 IF NEW.approver_user_id IS NOT NULL AND NEW.state IN ('draft','submitted','approved','rejected') AND
  NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.approver_user_id,'banking.'||kind||'.approve') THEN
  RAISE EXCEPTION 'Assigned Bank approver is no longer eligible' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION validate_bank_assignment_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text:=CASE TG_TABLE_NAME WHEN 'bank_payment' THEN 'payment' ELSE 'receipt' END; deciding text;
BEGIN
 IF NEW.state NOT IN ('approved','rejected') OR OLD.state<>'submitted' OR NEW.approver_user_id IS NULL THEN RETURN NULL; END IF;
 deciding:=CASE NEW.state WHEN 'approved' THEN NEW.approved_by ELSE NEW.rejected_by END;
 IF deciding<>NEW.approver_user_id AND NOT EXISTS(
  SELECT 1 FROM bank_assignment_intervention e JOIN platform_admin_audit_event a ON a.tenant_id=e.tenant_id AND a.id=e.audit_event_id
  WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND COALESCE(e.payment_id,e.receipt_id)=NEW.id
  AND (e.payment_id IS NOT NULL)=(kind='payment') AND e.record_version=NEW.row_version
  AND e.assigned_user_id=NEW.approver_user_id AND e.actor_id=deciding
  AND a.actor_id=deciding AND a.entity_id=NEW.id AND a.action='banking.'||kind||'.'||CASE NEW.state WHEN 'approved' THEN 'approve' ELSE 'reject' END
  AND bank_has_live_permission(NEW.tenant_id,NEW.company_id,deciding,'platform.approval.override',true)
 ) THEN RAISE EXCEPTION 'Only the assigned checker or an audited global administrator may decide' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$
DECLARE target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['bank_payment','bank_receipt'] LOOP
  EXECUTE format('CREATE TRIGGER bank_workflow_context BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION guard_bank_workflow_context()',target);
  EXECUTE format('CREATE CONSTRAINT TRIGGER bank_assigned_decision AFTER UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_bank_assignment_decision()',target);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',19,'bank_workflow_context');
