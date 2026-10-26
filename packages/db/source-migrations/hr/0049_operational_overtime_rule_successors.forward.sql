-- A successor may close an open-ended operational rule without changing its past terms.
CREATE OR REPLACE FUNCTION protect_hr_operational_overtime_rule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM hr_overtime_request WHERE tenant_id=OLD.tenant_id AND operational_rule_id=OLD.id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Referenced overtime rules cannot be deleted' USING ERRCODE='23514';END IF;
  IF (to_jsonb(NEW)-ARRAY['effective_to','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['effective_to','updated_at']) OR NEW.effective_to IS NULL OR NEW.effective_to<OLD.effective_from OR NEW.effective_to>=coalesce(OLD.effective_to,'infinity'::date) OR EXISTS(SELECT 1 FROM hr_overtime_request WHERE tenant_id=OLD.tenant_id AND operational_rule_id=OLD.id AND work_date>NEW.effective_to) THEN RAISE EXCEPTION 'Referenced overtime terms are immutable and all existing claim dates must remain covered' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',49,'operational_overtime_rule_successors');
