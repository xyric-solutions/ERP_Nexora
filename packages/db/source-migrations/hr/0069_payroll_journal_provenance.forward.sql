CREATE FUNCTION guard_hr_payroll_journal_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p hr_payroll_period%ROWTYPE;decision_actor text;allowed_fields text[];
BEGIN
 IF NOT NEW.workflow_managed THEN RETURN NEW; END IF;
 SELECT * INTO p FROM hr_payroll_period WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.period_id;
 IF TG_OP='INSERT' THEN
  IF jsonb_typeof(NEW.source_evidence->'results') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.source_evidence->'results')<>(SELECT count(*) FROM hr_payroll_result WHERE tenant_id=p.tenant_id AND company_id=p.company_id AND period_id=p.id AND run_number=p.run_number) OR EXISTS(
   SELECT 1 FROM hr_payroll_result r LEFT JOIN hr_payroll_statutory_snapshot s ON s.tenant_id=r.tenant_id AND s.company_id=r.company_id AND s.payroll_result_id=r.id
   WHERE r.tenant_id=p.tenant_id AND r.company_id=p.company_id AND r.period_id=p.id AND r.run_number=p.run_number AND(s.id IS NULL OR s.state<>'sealed' OR NOT(s.context_segments_json @> jsonb_build_array(jsonb_build_object('base_calculation_hash',r.calculation_hash))) OR jsonb_array_length(r.warnings)>0 OR NOT(NEW.source_evidence->'results' @> jsonb_build_array(jsonb_build_object('id',r.id,'employee_id',r.employee_id,'calculation_hash',r.calculation_hash))))
  ) THEN RAISE EXCEPTION 'Payroll journal must retain every approved result and its sealed execution provenance'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.state='accepted' THEN decision_actor:=NEW.accepted_by;allowed_fields:=ARRAY['state','version','accepted_by','accepted_at'];
 ELSIF NEW.state='rejected' THEN decision_actor:=NEW.rejected_by;allowed_fields:=ARRAY['state','version','rejected_by','rejected_at'];
 ELSIF NEW.state='posted' THEN decision_actor:=NEW.posted_by;allowed_fields:=ARRAY['state','version','posted_by','posted_at','external_journal_id','external_entry_number','accounting_event_id','financial_period_id'];
 ELSE RAISE EXCEPTION 'Unsupported Finance journal decision'; END IF;
 IF (to_jsonb(NEW)-allowed_fields) IS DISTINCT FROM(to_jsonb(OLD)-allowed_fields) OR decision_actor IN(p.created_by,p.calculated_by,p.submitted_by,OLD.created_by) OR(NEW.state='posted' AND decision_actor IN(p.approved_by,OLD.accepted_by)) OR EXISTS(SELECT 1 FROM employee_user_binding b JOIN hr_payroll_result r ON r.tenant_id=b.tenant_id AND r.employee_id=b.employee_id WHERE r.tenant_id=p.tenant_id AND r.company_id=p.company_id AND r.period_id=p.id AND r.run_number=p.run_number AND b.user_id=decision_actor AND b.ended_at IS NULL) THEN RAISE EXCEPTION 'Finance journal approval provenance and independent actors are protected'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_payroll_journal_provenance BEFORE INSERT OR UPDATE ON hr_payroll_journal_proposal FOR EACH ROW EXECUTE FUNCTION guard_hr_payroll_journal_provenance();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',69,'payroll_journal_provenance');
