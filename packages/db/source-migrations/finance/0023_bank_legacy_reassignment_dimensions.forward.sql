-- Only an already-verified immutable reassignment may retain historical free-text
-- dimensions. Financial fields/lines remain protected by their original guards.
CREATE OR REPLACE FUNCTION validate_bank_context_dimensions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text:=CASE WHEN TG_TABLE_NAME IN ('bank_payment','bank_payment_line') THEN 'payment' ELSE 'receipt' END;
 target_id text; target record; invalid boolean;
BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('bank_payment','bank_receipt') THEN
  IF OLD.state='submitted' AND NEW.state='submitted' AND NEW.approver_reassignment_id IS NOT NULL
   AND NEW.approver_reassignment_id IS DISTINCT FROM OLD.approver_reassignment_id
   AND (to_jsonb(NEW)-ARRAY['row_version','updated_at','approver_user_id','approver_reassignment_id'])=
       (to_jsonb(OLD)-ARRAY['row_version','updated_at','approver_user_id','approver_reassignment_id'])
   AND EXISTS(SELECT 1 FROM bank_approver_reassignment e WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id
    AND e.id=NEW.approver_reassignment_id AND e.record_version=NEW.row_version AND coalesce(e.payment_id,e.receipt_id)=NEW.id
    AND (e.payment_id IS NOT NULL)=(k='payment') AND e.previous_user_id IS NOT DISTINCT FROM OLD.approver_user_id AND e.assigned_user_id=NEW.approver_user_id)
   THEN RETURN NULL; END IF;
 END IF;
 target_id:=CASE WHEN TG_TABLE_NAME IN ('bank_payment','bank_receipt') THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>(k||'_id') END;
 EXECUTE format('SELECT company_id,project_id,location_id,state FROM bank_%I WHERE tenant_id=$1 AND id=$2',k) INTO target USING NEW.tenant_id,target_id;
 IF target.state='reversed' THEN RETURN NULL; END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM bank_%s_line WHERE tenant_id=$1 AND company_id=$2 AND %s_id=$3 AND ((dimensions->>''project'') IS DISTINCT FROM $4 OR (dimensions->>''location'') IS DISTINCT FROM $5))',k,k)
 INTO invalid USING NEW.tenant_id,target.company_id,target_id,target.project_id,target.location_id;
 IF invalid THEN RAISE EXCEPTION 'Bank accounting dimensions must match company master context' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',23,'bank_legacy_reassignment_dimensions');
