INSERT INTO security_permission_definition(permission_key,module,resource,action,description,required_assurance,sensitivity)
 SELECT 'hr.performance.'||a,'hr','performance',a,'Governed company Performance Management: '||a,'password','sensitive' FROM unnest(ARRAY['read','manage','review','publish']) a ON CONFLICT DO NOTHING;
-- Extend existing all-authority administrator policies only; ordinary roles require explicit assignment.
INSERT INTO security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
 SELECT p.tenant_id,p.id,d.permission_key,'all' FROM security_role_policy p JOIN security_tenant_role r ON r.tenant_id=p.tenant_id AND r.role_id=p.role_id CROSS JOIN security_permission_definition d
 WHERE r.role_code='super_administrator' AND p.status='active' AND p.lifecycle_state='active' AND d.permission_key LIKE 'hr.performance.%' ON CONFLICT DO NOTHING;
INSERT INTO security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
 SELECT p.tenant_id,p.id,d.permission_key,'tenant',p.tenant_id FROM security_role_policy p JOIN security_tenant_role r ON r.tenant_id=p.tenant_id AND r.role_id=p.role_id CROSS JOIN security_permission_definition d
 WHERE r.role_code='super_administrator' AND p.status='active' AND p.lifecycle_state='active' AND d.permission_key LIKE 'hr.performance.%' ON CONFLICT DO NOTHING;
CREATE TABLE hr_performance_record(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,kind text NOT NULL CHECK(kind IN('cycle','goal','review','outcome')),
 parent_id text,employee_id text,state text NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),terms jsonb NOT NULL CHECK(jsonb_typeof(terms)='object'),evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_by text NOT NULL,updated_by text NOT NULL,submitted_by text,decided_by text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,parent_id) REFERENCES hr_performance_record(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,employee_id) REFERENCES employee(tenant_id,id),
 CHECK(terms->>'kind'=kind),CHECK((kind='cycle' AND parent_id IS NULL AND employee_id IS NULL) OR(kind IN('goal','review','outcome') AND parent_id IS NOT NULL AND employee_id IS NOT NULL)),
 CHECK((kind='cycle' AND state IN('draft','active','closed','cancelled')) OR(kind='goal' AND state IN('draft','approved','cancelled')) OR(kind IN('review','outcome') AND state IN('draft','submitted','published','approved','closed')))
);
CREATE UNIQUE INDEX performance_review_employee ON hr_performance_record(tenant_id,parent_id,employee_id) WHERE kind='review';
CREATE UNIQUE INDEX performance_outcome_review ON hr_performance_record(tenant_id,parent_id) WHERE kind='outcome';
CREATE INDEX performance_company_cycle ON hr_performance_record(tenant_id,company_id,parent_id,kind,state);
CREATE TABLE hr_performance_event(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,record_id text NOT NULL,record_version integer NOT NULL,action text NOT NULL,reason text NOT NULL,actor_id text NOT NULL,
 before_json jsonb,after_json jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,record_id) REFERENCES hr_performance_record(tenant_id,company_id,id),UNIQUE(tenant_id,record_id,record_version)
);
ALTER TABLE hr_performance_record ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_performance_record FORCE ROW LEVEL SECURITY;
CREATE POLICY performance_record_tenant ON hr_performance_record USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_performance_event ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_performance_event FORCE ROW LEVEL SECURITY;
CREATE POLICY performance_event_tenant ON hr_performance_event USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER performance_event_immutable BEFORE UPDATE OR DELETE ON hr_performance_event FOR EACH ROW EXECUTE FUNCTION reject_payroll_snapshot_mutation();
CREATE FUNCTION guard_performance_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p hr_performance_record%ROWTYPE;c hr_performance_record%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Performance history cannot be deleted';END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'Performance records start as unapproved drafts';END IF;
 ELSE
  IF ROW(NEW.tenant_id,NEW.company_id,NEW.id,NEW.kind,NEW.parent_id,NEW.employee_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.company_id,OLD.id,OLD.kind,OLD.parent_id,OLD.employee_id,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Performance identity and version are protected';END IF;
  IF OLD.state IN('closed','cancelled','published') THEN RAISE EXCEPTION 'Final Performance evidence is immutable';END IF;
  IF NEW.state=OLD.state THEN IF OLD.state<>'draft' THEN RAISE EXCEPTION 'Only draft Performance terms may be edited';END IF;
  ELSIF NOT((NEW.kind='cycle' AND((OLD.state='draft' AND NEW.state IN('active','cancelled')) OR(OLD.state='active' AND NEW.state='closed'))) OR(NEW.kind='goal' AND OLD.state='draft' AND NEW.state IN('approved','cancelled')) OR(NEW.kind='review' AND((OLD.state='draft' AND NEW.state='submitted') OR(OLD.state='submitted' AND NEW.state IN('draft','published')))) OR(NEW.kind='outcome' AND((OLD.state='draft' AND NEW.state='submitted') OR(OLD.state='submitted' AND NEW.state IN('draft','approved')) OR(OLD.state='approved' AND NEW.state='closed')))) THEN RAISE EXCEPTION 'Unsupported Performance transition';END IF;
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
  IF NEW.state IN('approved','published') AND (NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,NEW.submitted_by) OR EXISTS(SELECT 1 FROM employee_user_binding WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.employee_id AND user_id=NEW.decided_by AND ended_at IS NULL)) THEN RAISE EXCEPTION 'An independent Performance decision is required';END IF;
  IF NEW.kind='review' AND NEW.state IN('submitted','published') AND((c.terms->>'end_date')::date>current_date OR NEW.evidence->>'goals_hash' IS DISTINCT FROM NEW.terms->>'goals_hash' OR NEW.evidence->>'score' IS NULL OR(SELECT coalesce(sum((g.terms->>'weight_bps')::integer),0) FROM hr_performance_record g WHERE g.tenant_id=NEW.tenant_id AND g.parent_id=c.id AND g.employee_id=NEW.employee_id AND g.kind='goal' AND g.state='approved')<>10000) THEN RAISE EXCEPTION 'Review submission requires completed cycle dates and exactly 100 percent approved goals';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER performance_record_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_record FOR EACH ROW EXECUTE FUNCTION guard_performance_record();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',78,'governed_performance_management');
