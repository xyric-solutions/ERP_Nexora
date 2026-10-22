CREATE OR REPLACE FUNCTION guard_hr_encashment_rule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Encashment policy history is immutable';END IF;
 IF (NEW.state<>'rejected' AND NOT EXISTS(SELECT 1 FROM hr_leave_type WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.leave_type_id AND paid AND status='active')) OR NEW.terms->>'leave_type_id' IS DISTINCT FROM NEW.leave_type_id OR(NEW.terms->>'effective_from')::date<>NEW.effective_from OR(NEW.terms->>'effective_to')::date<>NEW.effective_to THEN RAISE EXCEPTION 'Choose an active paid leave type with matching policy dates';END IF;
 IF NEW.terms ? 'salary_basis' THEN
  IF jsonb_typeof(NEW.terms->'salary_basis') IS DISTINCT FROM 'object' OR NEW.terms->>'rate_minor' IS DISTINCT FROM '0' OR coalesce((NEW.terms->'salary_basis'->>'multiplier')::integer,0) NOT BETWEEN 1 AND 10000 OR coalesce((NEW.terms->'salary_basis'->>'divisor')::integer,0) NOT BETWEEN 1 AND 36600 OR coalesce(jsonb_array_length(NEW.terms->'salary_basis'->'component_ids'),0) NOT BETWEEN 1 AND 30 OR(SELECT count(DISTINCT value) FROM jsonb_array_elements(NEW.terms->'salary_basis'->'component_ids'))<>jsonb_array_length(NEW.terms->'salary_basis'->'component_ids') THEN RAISE EXCEPTION 'Salary encashment requires explicit components and bounded integer factors';END IF;
 ELSE
  IF NEW.terms->>'rate_minor' IS NULL OR NEW.terms->>'rate_minor'!~'^[1-9][0-9]{0,14}$' OR round((NEW.terms->>'rate_minor')::numeric*(NEW.terms->>'maximum_days')::numeric,0)>999999999999999 THEN RAISE EXCEPTION 'Fixed encashment rates must be positive and bounded';END IF;
 END IF;
 IF coalesce((NEW.terms->>'maximum_days')::numeric,0)<=0 OR(NEW.terms->>'maximum_days')::numeric>9999.9999 OR coalesce((NEW.terms->>'minimum_service_days')::integer,-1) NOT BETWEEN 0 AND 36500 OR length(btrim(NEW.terms->>'policy_reference'))<10 THEN RAISE EXCEPTION 'Encashment eligibility must retain bounded policy settings';END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'Encashment policies start as drafts';END IF;
 ELSE
  IF ROW(NEW.tenant_id,NEW.company_id,NEW.id,NEW.terms,NEW.leave_type_id,NEW.effective_from,NEW.effective_to,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.company_id,OLD.id,OLD.terms,OLD.leave_type_id,OLD.effective_from,OLD.effective_to,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 OR NOT((OLD.state='draft' AND NEW.state='submitted')OR(OLD.state='submitted' AND NEW.state IN('approved','rejected'))) THEN RAISE EXCEPTION 'Encashment terms and decision history are protected';END IF;
 END IF;
 IF NEW.state='submitted' AND NEW.submitted_by IS DISTINCT FROM NEW.created_by THEN RAISE EXCEPTION 'Only the policy author can submit';END IF;
 IF NEW.state IN('approved','rejected') AND(NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,NEW.submitted_by)) THEN RAISE EXCEPTION 'Independent encashment policy decision is required';END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_hr_encashment_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_lifecycle_case%ROWTYPE;p hr_settlement_encashment_rule%ROWTYPE;line jsonb;expected_rate numeric;multiplier integer:=1;divisor integer:=1;
BEGIN
 SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.case_id;
 SELECT * INTO p FROM hr_settlement_encashment_rule WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.rule_id;
 line:=NEW.snapshot->'line';expected_rate:=(p.terms->>'rate_minor')::numeric;
 IF p.terms ? 'salary_basis' THEN
  multiplier:=(p.terms->'salary_basis'->>'multiplier')::integer;divisor:=(p.terms->'salary_basis'->>'divisor')::integer;
  expected_rate:=checked_hr_settlement_salary_rate(NEW.tenant_id,NEW.company_id,c.employee_id,NEW.as_of,p.terms,NEW.snapshot,line);
 ELSIF line->'calculation' ? 'rate_divisor' OR line->'calculation' ? 'rate_multiplier' THEN RAISE EXCEPTION 'Fixed encashment rates do not use salary factors';END IF;
 IF c.id IS NULL OR p.id IS NULL OR c.kind IS DISTINCT FROM 'settlement' OR c.state<>'draft' OR p.state IS DISTINCT FROM 'approved' OR NEW.leave_type_id<>p.leave_type_id OR NEW.as_of NOT BETWEEN p.effective_from AND p.effective_to OR NEW.as_of IS DISTINCT FROM(NEW.snapshot->'exit'->'terms'->>'last_working_date')::date OR NEW.days>(p.terms->>'maximum_days')::numeric OR NEW.amount_minor::numeric IS DISTINCT FROM round(expected_rate*NEW.days*multiplier/divisor,0) OR c.terms->>'currency'<>p.terms->>'currency' OR line->>'direction'<>'earning' OR line->>'amount_minor' IS DISTINCT FROM NEW.amount_minor OR(line->'calculation'->>'quantity')::numeric IS DISTINCT FROM NEW.days OR (line->'calculation'->>'rate_minor')::numeric IS DISTINCT FROM expected_rate OR NEW.snapshot->'rule'->'terms' IS DISTINCT FROM p.terms THEN RAISE EXCEPTION 'Encashment source must match the approved company policy and draft statement exactly';END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_hr_salary_benefit_approval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE src record;
BEGIN
 IF NEW.kind='settlement' AND NEW.state='approved' AND OLD.state IS DISTINCT FROM 'approved' THEN
  FOR src IN SELECT s.* FROM (SELECT tenant_id,company_id,case_id,id,as_of,snapshot,'benefit_source_id' source_key FROM hr_settlement_benefit_source UNION ALL SELECT tenant_id,company_id,case_id,id,as_of,snapshot,'encashment_source_id' source_key FROM hr_settlement_encashment_source) s WHERE s.tenant_id=NEW.tenant_id AND s.company_id=NEW.company_id AND s.case_id=NEW.id AND s.snapshot->'rule'->'terms' ? 'salary_basis' AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.terms->'lines') l WHERE l->>s.source_key=s.id) LOOP
   PERFORM checked_hr_settlement_salary_rate(NEW.tenant_id,NEW.company_id,NEW.employee_id,src.as_of,src.snapshot->'rule'->'terms',src.snapshot,src.snapshot->'line');
  END LOOP;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_hr_settled_salary_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:payroll:'||NEW.tenant_id||':'||NEW.company_id,0));
 IF NEW.state IN('submitted','approved','effective') AND(TG_OP='INSERT' OR OLD.state IS DISTINCT FROM NEW.state OR OLD.effective_from IS DISTINCT FROM NEW.effective_from OR OLD.effective_to IS DISTINCT FROM NEW.effective_to) AND EXISTS(
 SELECT 1 FROM hr_lifecycle_case c JOIN hr_lifecycle_case x ON x.tenant_id=c.tenant_id AND x.id=c.parent_id JOIN (SELECT tenant_id,case_id,id,snapshot,'benefit_source_id' source_key FROM hr_settlement_benefit_source UNION ALL SELECT tenant_id,case_id,id,snapshot,'encashment_source_id' source_key FROM hr_settlement_encashment_source) s ON s.tenant_id=c.tenant_id AND s.case_id=c.id
 WHERE c.tenant_id=NEW.tenant_id AND c.company_id=NEW.company_id AND c.employee_id=NEW.employee_id AND c.kind='settlement' AND c.state='approved' AND s.snapshot->'rule'->'terms' ? 'salary_basis' AND (x.terms->>'last_working_date')::date>=NEW.effective_from AND(NEW.effective_to IS NULL OR (x.terms->>'last_working_date')::date<=NEW.effective_to) AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.terms->'lines') l WHERE l->>s.source_key=s.id))
 THEN RAISE EXCEPTION 'Independently correct the approved salary-based settlement before submitting or approving a salary change covering its exit date' USING ERRCODE='23514',CONSTRAINT='hr_settled_salary_change';END IF;
 RETURN NEW;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',99,'approved_salary_leave_encashment');

