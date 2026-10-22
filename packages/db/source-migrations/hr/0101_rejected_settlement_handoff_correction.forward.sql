CREATE OR REPLACE FUNCTION guard_hr_settlement_void_request() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_lifecycle_case%ROWTYPE;actor text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Settlement correction history is immutable';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:lifecycle-cases:'||NEW.tenant_id||':'||NEW.company_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:attendance:'||NEW.tenant_id||':'||NEW.company_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:payroll:'||NEW.tenant_id||':'||NEW.company_id,0));
 SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.case_id;
 IF c.id IS NULL OR c.kind<>'settlement' OR c.state<>'approved' THEN RAISE EXCEPTION 'Only approved settlement statements can be corrected';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'submitted' OR NEW.case_version<>c.version THEN RAISE EXCEPTION 'A correction starts with an independent review request';END IF;
  actor:=NEW.requested_by;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['state','decided_by','decision_reason','decided_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','decided_by','decision_reason','decided_at']) OR OLD.state<>'submitted' OR NEW.state NOT IN('approved','rejected') OR c.version<>NEW.case_version+1 THEN RAISE EXCEPTION 'Correction terms and decisions are immutable';END IF;
  actor:=NEW.decided_by;
 END IF;
 IF EXISTS(SELECT 1 FROM employee_user_binding WHERE tenant_id=NEW.tenant_id AND employee_id=c.employee_id AND user_id=actor AND ended_at IS NULL) THEN RAISE EXCEPTION 'The employee cannot request or decide their correction';END IF;
 IF NEW.state<>'rejected' AND(
  NOT EXISTS(SELECT 1 FROM hr_lifecycle_case x JOIN hr_employment_relationship er ON er.tenant_id=x.tenant_id AND er.id=x.relationship_id WHERE x.tenant_id=c.tenant_id AND x.company_id=c.company_id AND x.id=c.parent_id AND x.state='approved' AND er.status='active' AND er.approval_state='approved')
  OR EXISTS(SELECT 1 FROM hr_settlement_payroll_link l JOIN hr_payroll_adjustment a ON a.tenant_id=l.tenant_id AND a.company_id=l.company_id AND a.id=l.adjustment_id WHERE l.tenant_id=c.tenant_id AND l.company_id=c.company_id AND l.case_id=c.id AND a.state<>'rejected')
  OR EXISTS(SELECT 1 FROM hr_payroll_period WHERE tenant_id=c.tenant_id AND company_id=c.company_id AND month>=date_trunc('month',(SELECT(terms->>'last_working_date')::date FROM hr_lifecycle_case WHERE tenant_id=c.tenant_id AND id=c.parent_id))::date AND state<>'open')
 ) THEN RAISE EXCEPTION 'Payroll handoff, frozen Payroll or completed offboarding requires its governed correction process';END IF;
 RETURN NEW;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',101,'rejected_settlement_handoff_correction');
