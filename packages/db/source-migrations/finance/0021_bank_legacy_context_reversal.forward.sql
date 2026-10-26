-- A compensating reversal must preserve historical free-text dimensions from
-- before typed references existed. Posted line/context immutability is enforced
-- independently; this exception cannot edit the original lines or journal.
CREATE OR REPLACE FUNCTION validate_bank_context_dimensions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE table_kind text:=CASE WHEN TG_TABLE_NAME IN ('bank_payment','bank_payment_line') THEN 'payment' ELSE 'receipt' END;
 target_id text; target record; invalid boolean;
BEGIN
 target_id:=CASE WHEN TG_TABLE_NAME IN ('bank_payment','bank_receipt') THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>(table_kind||'_id') END;
 EXECUTE format('SELECT company_id,project_id,location_id,state FROM bank_%I WHERE tenant_id=$1 AND id=$2',table_kind)
 INTO target USING NEW.tenant_id,target_id;
 IF target.state='reversed' THEN RETURN NULL; END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM bank_%s_line WHERE tenant_id=$1 AND company_id=$2 AND %s_id=$3 AND ((dimensions->>''project'') IS DISTINCT FROM $4 OR (dimensions->>''location'') IS DISTINCT FROM $5))',table_kind,table_kind)
 INTO invalid USING NEW.tenant_id,target.company_id,target_id,target.project_id,target.location_id;
 IF invalid THEN RAISE EXCEPTION 'Bank accounting dimensions must match company master context' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',21,'bank_legacy_context_reversal');
