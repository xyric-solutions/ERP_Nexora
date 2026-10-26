CREATE OR REPLACE FUNCTION guard_performance_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p hr_performance_record%ROWTYPE;c hr_performance_record%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Performance history cannot be deleted';END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'Performance records start as unapproved drafts';END IF;
 ELSE
  IF ROW(NEW.tenant_id,NEW.company_id,NEW.id,NEW.kind,NEW.parent_id,NEW.employee_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.company_id,OLD.id,OLD.kind,OLD.parent_id,OLD.employee_id,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Performance identity and version are protected';END IF;
  IF OLD.state IN('closed','cancelled','published') THEN RAISE EXCEPTION 'Final Performance evidence is immutable';END IF;
  IF NEW.state=OLD.state THEN IF OLD.state<>'draft' THEN RAISE EXCEPTION 'Only draft Performance terms may be edited';END IF;
  ELSIF NOT((NEW.kind='cycle' AND((OLD.state='draft' AND NEW.state IN('active','cancelled')) OR(OLD.state='active' AND NEW.state='closed'))) OR(NEW.kind='goal' AND((OLD.state='draft' AND NEW.state IN('approved','cancelled'))OR(OLD.state='approved' AND NEW.state='draft'))) OR(NEW.kind='review' AND((OLD.state='draft' AND NEW.state='submitted') OR(OLD.state='submitted' AND NEW.state IN('draft','published')))) OR(NEW.kind='outcome' AND((OLD.state='draft' AND NEW.state='submitted') OR(OLD.state='submitted' AND NEW.state IN('draft','approved')) OR(OLD.state='approved' AND NEW.state='closed')))) THEN RAISE EXCEPTION 'Unsupported Performance transition';END IF;
  IF NEW.state<>OLD.state AND ROW(NEW.terms,NEW.evidence) IS DISTINCT FROM ROW(OLD.terms,OLD.evidence) THEN RAISE EXCEPTION 'Performance decisions preserve reviewed terms and source evidence';END IF;
 END IF;
 IF NEW.kind='cycle' THEN
  IF NOT((NEW.terms->>'start_date')::date<=(NEW.terms->>'end_date')::date AND(NEW.terms->>'end_date')::date<=(NEW.terms->>'review_due_date')::date) THEN RAISE EXCEPTION 'Cycle dates must be ordered';END IF;
  IF NEW.state='closed' AND(EXISTS(SELECT 1 FROM hr_performance_record g WHERE g.tenant_id=NEW.tenant_id AND g.parent_id=NEW.id AND g.kind='goal' AND g.state<>'cancelled' AND NOT EXISTS(SELECT 1 FROM hr_performance_record r WHERE r.tenant_id=g.tenant_id AND r.parent_id=g.parent_id AND r.employee_id=g.employee_id AND r.kind='review' AND r.state='published')) OR EXISTS(SELECT 1 FROM hr_performance_record r WHERE r.tenant_id=NEW.tenant_id AND r.parent_id=NEW.id AND r.kind='review' AND(r.state<>'published' OR NOT EXISTS(SELECT 1 FROM hr_performance_record o WHERE o.tenant_id=r.tenant_id AND o.parent_id=r.id AND o.kind='outcome' AND o.state='closed')))) THEN RAISE EXCEPTION 'Close all cycle reviews and follow-up outcomes first';END IF;
 ELSE
  SELECT * INTO p FROM hr_performance_record WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.parent_id;
  IF NEW.kind='outcome' THEN SELECT * INTO c FROM hr_performance_record WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=p.parent_id;IF p.kind<>'review' OR p.state<>'published' OR NEW.employee_id<>p.employee_id THEN RAISE EXCEPTION 'Outcomes require their published employee review';END IF;
  ELSE c:=p;END IF;
  IF c.id IS NULL OR c.kind<>'cycle' OR c.state<>'active' THEN RAISE EXCEPTION 'An active company cycle is required';END IF;
  IF NEW.kind='goal' THEN
   IF EXISTS(SELECT 1 FROM hr_performance_record r WHERE r.tenant_id=NEW.tenant_id AND r.parent_id=c.id AND r.kind='review' AND r.employee_id=NEW.employee_id AND r.state IN('submitted','published')) THEN RAISE EXCEPTION 'Submitted reviews freeze employee goals';END IF;
   IF (NEW.terms->>'weight_bps')::integer NOT BETWEEN 1 AND 10000 OR(NEW.terms->>'due_date')::date NOT BETWEEN(c.terms->>'start_date')::date AND(c.terms->>'end_date')::date OR(SELECT coalesce(sum((g.terms->>'weight_bps')::integer),0) FROM hr_performance_record g WHERE g.tenant_id=NEW.tenant_id AND g.parent_id=c.id AND g.employee_id=NEW.employee_id AND g.kind='goal' AND g.state<>'cancelled' AND g.id<>NEW.id)+(NEW.terms->>'weight_bps')::integer>10000 THEN RAISE EXCEPTION 'Goal weights or dates exceed their cycle';END IF;
  END IF;
  IF NEW.state IN('approved','published') AND (NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,NEW.submitted_by) OR(TG_OP='UPDATE' AND NEW.decided_by=OLD.updated_by) OR EXISTS(SELECT 1 FROM employee_user_binding WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.employee_id AND user_id=NEW.decided_by AND ended_at IS NULL)) THEN RAISE EXCEPTION 'An independent Performance decision is required';END IF;
  IF NEW.kind='review' AND NEW.state IN('submitted','published') AND((c.terms->>'end_date')::date>current_date OR NEW.evidence->>'goals_hash' IS DISTINCT FROM NEW.terms->>'goals_hash' OR NEW.evidence->>'score' IS NULL OR(SELECT coalesce(sum((g.terms->>'weight_bps')::integer),0) FROM hr_performance_record g WHERE g.tenant_id=NEW.tenant_id AND g.parent_id=c.id AND g.employee_id=NEW.employee_id AND g.kind='goal' AND g.state='approved')<>10000) THEN RAISE EXCEPTION 'Review submission requires completed cycle dates and exactly 100 percent approved goals';END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION performance_source_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_performance_record%ROWTYPE;goals jsonb;cnt integer;weight integer;score numeric;
BEGIN
 IF NEW.kind='cycle' THEN RETURN NEW;END IF;
 IF NEW.kind IN('goal','review') AND(NEW.terms->>'cycle_id' IS DISTINCT FROM NEW.parent_id OR NEW.terms->>'employee_id' IS DISTINCT FROM NEW.employee_id) THEN RAISE EXCEPTION 'Performance terms cannot reparent an employee or cycle';END IF;
 IF NEW.kind='outcome' AND NEW.terms->>'review_id' IS DISTINCT FROM NEW.parent_id THEN RAISE EXCEPTION 'Outcome must retain its published review';END IF;
 SELECT * INTO c FROM hr_performance_record WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=CASE WHEN NEW.kind='outcome' THEN(SELECT parent_id FROM hr_performance_record WHERE tenant_id=NEW.tenant_id AND id=NEW.parent_id)ELSE NEW.parent_id END;
 IF NOT EXISTS(SELECT 1 FROM employee_assignment a LEFT JOIN hr_employment_relationship er ON er.tenant_id=a.tenant_id AND er.id=a.employment_relationship_id WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id AND a.employee_id=NEW.employee_id AND a.effective_from<=(c.terms->>'end_date')::date AND(a.effective_to IS NULL OR a.effective_to>=(c.terms->>'start_date')::date) AND(a.assignment_status='legacy_compatibility' OR(a.assignment_status='active' AND er.approval_state='approved' AND er.status='active'))) THEN RAISE EXCEPTION 'Performance employee must belong to the cycle company';END IF;
 IF NEW.kind='outcome' AND NOT EXISTS(SELECT 1 FROM employee_assignment a LEFT JOIN hr_employment_relationship er ON er.tenant_id=a.tenant_id AND er.id=a.employment_relationship_id WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id AND a.employee_id=NEW.terms->>'owner_employee_id' AND a.effective_from<=(c.terms->>'end_date')::date AND(a.effective_to IS NULL OR a.effective_to>=(c.terms->>'start_date')::date) AND(a.assignment_status='legacy_compatibility' OR(a.assignment_status='active' AND er.approval_state='approved' AND er.status='active'))) THEN RAISE EXCEPTION 'Follow-up owner must belong to the company';END IF;
 IF NEW.kind='review' AND NEW.state IN('submitted','published') THEN
  SELECT count(*),coalesce(sum((g.terms->>'weight_bps')::integer),0),jsonb_agg(jsonb_build_object('id',g.id,'version',g.version)||g.terms ORDER BY g.id COLLATE "C") INTO cnt,weight,goals FROM hr_performance_record g WHERE g.tenant_id=NEW.tenant_id AND g.company_id=NEW.company_id AND g.parent_id=NEW.parent_id AND g.employee_id=NEW.employee_id AND g.kind='goal' AND g.state='approved';
  SELECT sum((g.terms->>'weight_bps')::integer*(x->>'rating')::integer)::numeric/10000 INTO score FROM jsonb_array_elements(NEW.terms->'ratings') x JOIN hr_performance_record g ON g.tenant_id=NEW.tenant_id AND g.company_id=NEW.company_id AND g.id=x->>'goal_id' AND g.parent_id=NEW.parent_id AND g.employee_id=NEW.employee_id AND g.kind='goal' AND g.state='approved';
  IF cnt NOT BETWEEN 1 AND 50 OR weight<>10000 OR jsonb_array_length(NEW.terms->'ratings')<>cnt OR(SELECT count(DISTINCT x->>'goal_id') FROM jsonb_array_elements(NEW.terms->'ratings')x)<>cnt OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.terms->'ratings')x WHERE(x->>'rating')::integer NOT BETWEEN 1 AND 5) OR NEW.evidence->'goals' IS DISTINCT FROM goals OR NEW.evidence->'ratings' IS DISTINCT FROM NEW.terms->'ratings' OR(NEW.evidence->>'score')::numeric IS DISTINCT FROM score OR EXISTS(SELECT 1 FROM hr_performance_record g WHERE g.tenant_id=NEW.tenant_id AND g.parent_id=NEW.parent_id AND g.employee_id=NEW.employee_id AND g.kind='goal' AND g.state='draft') THEN RAISE EXCEPTION 'Submitted review must match exact approved goal versions, ratings and weighted score';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER performance_source_integrity BEFORE INSERT OR UPDATE ON hr_performance_record FOR EACH ROW EXECUTE FUNCTION performance_source_integrity();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',79,'performance_source_integrity');
