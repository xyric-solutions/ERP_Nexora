CREATE OR REPLACE FUNCTION guard_hr_benefit_rule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE salary jsonb;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Company benefit policy history is immutable';END IF;
 salary:=NEW.terms->'salary_basis';
 IF NEW.terms->>'category' IS DISTINCT FROM NEW.category OR(NEW.terms->>'effective_from')::date IS DISTINCT FROM NEW.effective_from OR(NEW.terms->>'effective_to')::date IS DISTINCT FROM NEW.effective_to OR NEW.terms->>'basis' NOT IN('fixed_amount','completed_service_years') OR NEW.terms->>'direction' NOT IN('earning','deduction') OR(NEW.terms->>'maximum_units')::integer NOT BETWEEN 1 AND 100 OR(NEW.terms->>'minimum_service_days')::integer NOT BETWEEN 0 AND 36500 OR(NEW.terms->>'basis'='fixed_amount' AND(NEW.terms->>'maximum_units')::integer<>1) OR length(btrim(NEW.terms->>'policy_reference'))<10 THEN RAISE EXCEPTION 'Benefit terms must retain exact bounded policy settings';END IF;
 IF salary IS NULL THEN
  IF NEW.terms->>'rate_minor'!~'^[1-9][0-9]{0,14}$' OR(NEW.terms->>'rate_minor')::numeric*(NEW.terms->>'maximum_units')::integer>999999999999999 THEN RAISE EXCEPTION 'A fixed company rate must be positive and bounded';END IF;
 ELSE
  IF jsonb_typeof(salary) IS DISTINCT FROM 'object' OR NEW.terms->>'rate_minor' IS DISTINCT FROM '0' OR coalesce((salary->>'multiplier')::integer,0) NOT BETWEEN 1 AND 10000 OR coalesce((salary->>'divisor')::integer,0) NOT BETWEEN 1 AND 36600 OR jsonb_array_length(salary->'component_ids') NOT BETWEEN 1 AND 30 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(salary->'component_ids'))<>jsonb_array_length(salary->'component_ids') THEN RAISE EXCEPTION 'Salary rules require explicit components and bounded integer factors; the rate is server-derived';END IF;
 END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'Company benefit policies start as unapproved drafts';END IF;
 ELSE
  IF(to_jsonb(NEW)-ARRAY['state','version','submitted_by','decided_by','reason','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','submitted_by','decided_by','reason','updated_at']) OR NEW.version<>OLD.version+1 OR NOT((OLD.state='draft' AND NEW.state='submitted')OR(OLD.state='submitted' AND NEW.state IN('approved','rejected'))) THEN RAISE EXCEPTION 'Company benefit terms and decision history are protected';END IF;
 END IF;
 IF NEW.state='submitted' AND NEW.submitted_by IS DISTINCT FROM NEW.created_by THEN RAISE EXCEPTION 'Only the policy author submits';END IF;
 IF NEW.state IN('approved','rejected') AND(NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,NEW.submitted_by)) THEN RAISE EXCEPTION 'An independent company benefit policy decision is required';END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION checked_hr_settlement_salary_rate(p_tenant text,p_company text,p_employee text,p_date date,p_terms jsonb,p_snapshot jsonb,p_line jsonb) RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE salary hr_salary_assignment%ROWTYPE;salary_count integer;component_count integer;precision integer;base_amount numeric;multiplier integer;divisor integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:payroll:'||p_tenant||':'||p_company,0));
  multiplier:=(p_terms->'salary_basis'->>'multiplier')::integer;divisor:=(p_terms->'salary_basis'->>'divisor')::integer;
  SELECT count(*) INTO salary_count FROM hr_salary_assignment WHERE tenant_id=p_tenant AND company_id=p_company AND employee_id=p_employee AND state IN('approved','effective') AND effective_from<=p_date AND(effective_to IS NULL OR effective_to>=p_date);
  SELECT * INTO salary FROM hr_salary_assignment WHERE tenant_id=p_tenant AND company_id=p_company AND employee_id=p_employee AND state IN('approved','effective') AND effective_from<=p_date AND(effective_to IS NULL OR effective_to>=p_date) ORDER BY id LIMIT 1;
  SELECT decimal_places INTO precision FROM currency WHERE tenant_id=p_tenant AND code=p_terms->>'currency' AND status='active' AND decimal_places<=4;
  SELECT count(*),sum(sc.amount*power(10::numeric,precision)) INTO component_count,base_amount FROM hr_salary_assignment_component sc JOIN hr_pay_component pc ON pc.tenant_id=sc.tenant_id AND pc.company_id=sc.company_id AND pc.id=sc.component_id WHERE sc.tenant_id=p_tenant AND sc.company_id=p_company AND sc.assignment_id=salary.id AND p_terms->'salary_basis'->'component_ids' ? sc.component_id AND sc.method='fixed' AND pc.method='fixed' AND pc.kind='earning' AND pc.status='active' AND sc.formula IS NULL AND sc.amount>=0 AND sc.amount*power(10::numeric,precision)=trunc(sc.amount*power(10::numeric,precision)) AND sc.currency_code=p_terms->>'currency';
  IF salary_count<>1 OR salary.id IS NULL OR NOT salary.workflow_managed OR salary.compensation_type<>'fixed' OR salary.payment_basis<>'monthly' OR salary.currency_code IS DISTINCT FROM p_terms->>'currency' OR precision IS NULL OR component_count<>jsonb_array_length(p_terms->'salary_basis'->'component_ids') OR base_amount IS NULL OR base_amount<=0 OR base_amount>999999999999999
   OR p_snapshot->'salary'->'salary'->>'assignment_id' IS DISTINCT FROM salary.id OR(p_snapshot->'salary'->'salary'->>'assignment_version')::integer IS DISTINCT FROM salary.version OR(p_snapshot->'salary'->'salary'->>'basis_minor')::numeric IS DISTINCT FROM base_amount
   OR EXISTS(SELECT 1 FROM hr_salary_assignment WHERE tenant_id=p_tenant AND company_id=p_company AND employee_id=p_employee AND state='submitted' AND effective_from<=p_date AND(effective_to IS NULL OR effective_to>=p_date))
   OR(p_line->'calculation'->>'rate_divisor')::integer IS DISTINCT FROM divisor OR(p_line->'calculation'->>'rate_multiplier')::integer IS DISTINCT FROM multiplier
  THEN RAISE EXCEPTION 'Salary benefit requires the exact independently approved monthly salary, fixed components and policy factors';END IF;

 RETURN base_amount;
END $$;
CREATE OR REPLACE FUNCTION guard_hr_benefit_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_lifecycle_case%ROWTYPE;x hr_lifecycle_case%ROWTYPE;r hr_settlement_benefit_rule%ROWTYPE;rel hr_employment_relationship%ROWTYPE;line jsonb;expected_units integer;salary hr_salary_assignment%ROWTYPE;salary_count integer;component_count integer;precision integer;base_amount numeric;expected_rate numeric;multiplier integer:=1;divisor integer:=1;
BEGIN
 SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.case_id;
 SELECT * INTO r FROM hr_settlement_benefit_rule WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.rule_id;
 SELECT * INTO x FROM hr_lifecycle_case WHERE tenant_id=c.tenant_id AND id=c.parent_id;
 SELECT * INTO rel FROM hr_employment_relationship WHERE tenant_id=c.tenant_id AND id=c.relationship_id;
 expected_units:=least((r.terms->>'maximum_units')::integer,CASE WHEN r.terms->>'basis'='fixed_amount' THEN 1 ELSE extract(year FROM age(NEW.as_of,rel.effective_from))::integer END);
 line:=NEW.snapshot->'line';expected_rate:=(r.terms->>'rate_minor')::numeric;
 IF r.terms ? 'salary_basis' THEN
  multiplier:=(r.terms->'salary_basis'->>'multiplier')::integer;divisor:=(r.terms->'salary_basis'->>'divisor')::integer;
  expected_rate:=checked_hr_settlement_salary_rate(NEW.tenant_id,NEW.company_id,c.employee_id,NEW.as_of,r.terms,NEW.snapshot,line);

 ELSIF line->'calculation' ? 'rate_divisor' OR line->'calculation' ? 'rate_multiplier' THEN RAISE EXCEPTION 'Fixed company benefits do not use salary factors';END IF;
 IF c.id IS NULL OR c.kind<>'settlement' OR c.state<>'draft' OR r.id IS NULL OR r.state<>'approved' OR NEW.category IS DISTINCT FROM r.category OR NEW.as_of IS DISTINCT FROM(x.terms->>'last_working_date')::date OR x.state<>'approved' OR rel.status<>'active' OR NEW.as_of>current_date OR NEW.as_of NOT BETWEEN r.effective_from AND r.effective_to OR NEW.as_of-rel.effective_from<(r.terms->>'minimum_service_days')::integer OR NOT(r.terms->'exit_kinds' ? x.kind) OR NEW.units IS DISTINCT FROM expected_units OR NEW.amount_minor::numeric IS DISTINCT FROM round(NEW.units*expected_rate*multiplier/divisor,0) OR c.terms->>'currency' IS DISTINCT FROM r.terms->>'currency' OR NEW.snapshot->'rule'->'terms' IS DISTINCT FROM r.terms OR line->>'direction' IS DISTINCT FROM r.terms->>'direction' OR line->>'amount_minor' IS DISTINCT FROM NEW.amount_minor OR(line->'calculation'->>'quantity')::integer IS DISTINCT FROM NEW.units OR(line->'calculation'->>'rate_minor')::numeric IS DISTINCT FROM expected_rate THEN RAISE EXCEPTION 'Benefit source must match the exact approved company rule, salary, service and exit';END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION guard_hr_salary_benefit_approval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE src hr_settlement_benefit_source%ROWTYPE;
BEGIN
 IF NEW.kind='settlement' AND NEW.state='approved' AND OLD.state IS DISTINCT FROM 'approved' THEN
  FOR src IN SELECT s.* FROM hr_settlement_benefit_source s WHERE s.tenant_id=NEW.tenant_id AND s.company_id=NEW.company_id AND s.case_id=NEW.id AND s.snapshot->'rule'->'terms' ? 'salary_basis' AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.terms->'lines') l WHERE l->>'benefit_source_id'=s.id) LOOP
   PERFORM checked_hr_settlement_salary_rate(NEW.tenant_id,NEW.company_id,NEW.employee_id,src.as_of,src.snapshot->'rule'->'terms',src.snapshot,src.snapshot->'line');
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_salary_benefit_approval BEFORE UPDATE ON hr_lifecycle_case FOR EACH ROW EXECUTE FUNCTION guard_hr_salary_benefit_approval();
CREATE FUNCTION guard_hr_settled_salary_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:payroll:'||NEW.tenant_id||':'||NEW.company_id,0));
 IF NEW.state IN('submitted','approved','effective') AND(TG_OP='INSERT' OR OLD.state IS DISTINCT FROM NEW.state OR OLD.effective_from IS DISTINCT FROM NEW.effective_from OR OLD.effective_to IS DISTINCT FROM NEW.effective_to) AND EXISTS(
 SELECT 1 FROM hr_lifecycle_case c JOIN hr_lifecycle_case x ON x.tenant_id=c.tenant_id AND x.id=c.parent_id JOIN hr_settlement_benefit_source s ON s.tenant_id=c.tenant_id AND s.case_id=c.id
 WHERE c.tenant_id=NEW.tenant_id AND c.company_id=NEW.company_id AND c.employee_id=NEW.employee_id AND c.kind='settlement' AND c.state='approved' AND s.snapshot->'rule'->'terms' ? 'salary_basis' AND (x.terms->>'last_working_date')::date>=NEW.effective_from AND(NEW.effective_to IS NULL OR (x.terms->>'last_working_date')::date<=NEW.effective_to) AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.terms->'lines') l WHERE l->>'benefit_source_id'=s.id))
 THEN RAISE EXCEPTION 'Independently correct the approved salary-based settlement before submitting or approving a salary change covering its exit date' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_settled_salary_change BEFORE INSERT OR UPDATE ON hr_salary_assignment FOR EACH ROW EXECUTE FUNCTION guard_hr_settled_salary_change();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',97,'approved_salary_settlement_benefits');
