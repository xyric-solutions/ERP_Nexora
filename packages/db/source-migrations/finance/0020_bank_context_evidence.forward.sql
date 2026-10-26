CREATE FUNCTION bind_bank_assignment_intervention() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target record; target_table text:=CASE WHEN NEW.payment_id IS NOT NULL THEN 'bank_payment' ELSE 'bank_receipt' END;
 target_kind text:=CASE WHEN NEW.payment_id IS NOT NULL THEN 'payment' ELSE 'receipt' END;
BEGIN
 EXECUTE format('SELECT id,company_id,approver_user_id,row_version,state,approved_by,rejected_by FROM %I WHERE tenant_id=$1 AND id=$2',target_table)
 INTO target USING NEW.tenant_id,COALESCE(NEW.payment_id,NEW.receipt_id);
 IF target.company_id IS DISTINCT FROM NEW.company_id OR target.approver_user_id IS DISTINCT FROM NEW.assigned_user_id
  OR target.row_version IS DISTINCT FROM NEW.record_version OR target.state NOT IN ('approved','rejected')
  OR (CASE target.state WHEN 'approved' THEN target.approved_by ELSE target.rejected_by END) IS DISTINCT FROM NEW.actor_id
  OR NEW.actor_id=NEW.assigned_user_id
  OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.actor_id,'banking.'||target_kind||'.approve')
  OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.actor_id,'platform.approval.override',true)
  OR NOT EXISTS(SELECT 1 FROM platform_admin_audit_event a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.audit_event_id
   AND a.actor_id=NEW.actor_id AND a.entity_id=target.id
   AND a.action='banking.'||target_kind||'.'||CASE target.state WHEN 'approved' THEN 'approve' ELSE 'reject' END)
 THEN RAISE EXCEPTION 'Assignment intervention must match a governed decision and audit' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assignment_intervention_binding BEFORE INSERT ON bank_assignment_intervention
 FOR EACH ROW EXECUTE FUNCTION bind_bank_assignment_intervention();

CREATE FUNCTION validate_bank_context_dimensions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE table_kind text:=CASE WHEN TG_TABLE_NAME IN ('bank_payment','bank_payment_line') THEN 'payment' ELSE 'receipt' END;
 target_id text; target record; invalid boolean;
BEGIN
 target_id:=CASE WHEN TG_TABLE_NAME IN ('bank_payment','bank_receipt') THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>(table_kind||'_id') END;
 EXECUTE format('SELECT company_id,project_id,location_id FROM bank_%I WHERE tenant_id=$1 AND id=$2',table_kind)
 INTO target USING NEW.tenant_id,target_id;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM bank_%s_line WHERE tenant_id=$1 AND company_id=$2 AND %s_id=$3 AND ((dimensions->>''project'') IS DISTINCT FROM $4 OR (dimensions->>''location'') IS DISTINCT FROM $5))',table_kind,table_kind)
 INTO invalid USING NEW.tenant_id,target.company_id,target_id,target.project_id,target.location_id;
 IF invalid THEN RAISE EXCEPTION 'Bank accounting dimensions must match company master context' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$
DECLARE target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['bank_payment','bank_receipt','bank_payment_line','bank_receipt_line'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER bank_context_dimensions AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_bank_context_dimensions()',target);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',20,'bank_context_evidence');
