ALTER TABLE hr_settlement_benefit_source DROP CONSTRAINT hr_settlement_benefit_source_units_check;
ALTER TABLE hr_settlement_benefit_source ADD CONSTRAINT hr_settlement_benefit_source_units_check CHECK(units BETWEEN 1 AND 36500);
CREATE OR REPLACE FUNCTION guard_hr_benefit_rule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE salary jsonb;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Company benefit policy history is immutable';END IF;
 salary:=NEW.terms->'salary_basis';
 IF NEW.terms->>'category' IS DISTINCT FROM NEW.category OR(NEW.terms->>'effective_from')::date IS DISTINCT FROM NEW.effective_from OR(NEW.terms->>'effective_to')::date IS DISTINCT FROM NEW.effective_to OR NEW.terms->>'basis' NOT IN('fixed_amount','completed_service_years','service_days') OR NEW.terms->>'direction' NOT IN('earning','deduction') OR(NEW.terms->>'maximum_units')::integer NOT BETWEEN 1 AND 36500 OR(NEW.terms->>'minimum_service_days')::integer NOT BETWEEN 0 AND 36500 OR(NEW.terms->>'basis'='fixed_amount' AND(NEW.terms->>'maximum_units')::integer<>1) OR length(btrim(NEW.terms->>'policy_reference'))<10 THEN RAISE EXCEPTION 'Benefit terms must retain exact bounded policy settings';END IF;
 IF NEW.terms->>'basis'='service_days' THEN
  IF NEW.terms->>'service_day_count' IS NULL OR NEW.terms->>'service_day_count' NOT IN('elapsed','inclusive') OR NOT(NEW.terms ? 'salary_basis' OR NEW.terms ? 'rate_factors') THEN RAISE EXCEPTION 'Service-day rules need explicit counting and policy rate factors';END IF;
 ELSIF NEW.terms ? 'service_day_count' OR(NEW.terms->>'maximum_units')::integer>100 THEN RAISE EXCEPTION 'Use bounded award or completed-year units';END IF;
 IF NEW.terms ? 'rate_factors' THEN
  IF salary IS NOT NULL OR jsonb_typeof(NEW.terms->'rate_factors') IS DISTINCT FROM 'object' OR coalesce((NEW.terms->'rate_factors'->>'multiplier')::integer,0) NOT BETWEEN 1 AND 10000 OR coalesce((NEW.terms->'rate_factors'->>'divisor')::integer,0) NOT BETWEEN 1 AND 36600 THEN RAISE EXCEPTION 'Use one rate source and explicit bounded integer factors';END IF;
 END IF;
 IF salary IS NULL THEN
  IF NEW.terms->>'rate_minor'!~'^[1-9][0-9]{0,14}$' OR round((NEW.terms->>'rate_minor')::numeric*(NEW.terms->>'maximum_units')::integer*coalesce((NEW.terms->'rate_factors'->>'multiplier')::integer,1)/coalesce((NEW.terms->'rate_factors'->>'divisor')::integer,1),0)>999999999999999 THEN RAISE EXCEPTION 'A fixed company rate must be positive and bounded';END IF;
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
CREATE OR REPLACE FUNCTION guard_hr_benefit_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_lifecycle_case%ROWTYPE;x hr_lifecycle_case%ROWTYPE;r hr_settlement_benefit_rule%ROWTYPE;rel hr_employment_relationship%ROWTYPE;line jsonb;expected_units integer;salary hr_salary_assignment%ROWTYPE;salary_count integer;component_count integer;precision integer;base_amount numeric;expected_rate numeric;multiplier integer:=1;divisor integer:=1;
BEGIN
 SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.case_id;
 SELECT * INTO r FROM hr_settlement_benefit_rule WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.rule_id;
 SELECT * INTO x FROM hr_lifecycle_case WHERE tenant_id=c.tenant_id AND id=c.parent_id;
 SELECT * INTO rel FROM hr_employment_relationship WHERE tenant_id=c.tenant_id AND id=c.relationship_id;
 expected_units:=least((r.terms->>'maximum_units')::integer,CASE WHEN r.terms->>'basis'='fixed_amount' THEN 1 WHEN r.terms->>'basis'='service_days' THEN NEW.as_of-rel.effective_from+CASE WHEN r.terms->>'service_day_count'='inclusive' THEN 1 ELSE 0 END ELSE extract(year FROM age(NEW.as_of,rel.effective_from))::integer END);
 line:=NEW.snapshot->'line';expected_rate:=(r.terms->>'rate_minor')::numeric;
 IF r.terms ? 'salary_basis' THEN
  multiplier:=(r.terms->'salary_basis'->>'multiplier')::integer;divisor:=(r.terms->'salary_basis'->>'divisor')::integer;
  expected_rate:=checked_hr_settlement_salary_rate(NEW.tenant_id,NEW.company_id,c.employee_id,NEW.as_of,r.terms,NEW.snapshot,line);

 ELSIF r.terms ? 'rate_factors' THEN
  multiplier:=(r.terms->'rate_factors'->>'multiplier')::integer;divisor:=(r.terms->'rate_factors'->>'divisor')::integer;
  IF (line->'calculation'->>'rate_divisor')::integer IS DISTINCT FROM divisor OR(line->'calculation'->>'rate_multiplier')::integer IS DISTINCT FROM multiplier THEN RAISE EXCEPTION 'Benefit factors must match the independently approved company rule';END IF;
 ELSIF line->'calculation' ? 'rate_divisor' OR line->'calculation' ? 'rate_multiplier' THEN RAISE EXCEPTION 'Fixed company benefits do not use salary factors';END IF;
 IF c.id IS NULL OR c.kind<>'settlement' OR c.state<>'draft' OR r.id IS NULL OR r.state<>'approved' OR NEW.category IS DISTINCT FROM r.category OR NEW.as_of IS DISTINCT FROM(x.terms->>'last_working_date')::date OR x.state<>'approved' OR rel.status<>'active' OR NEW.as_of>current_date OR NEW.as_of NOT BETWEEN r.effective_from AND r.effective_to OR NEW.as_of-rel.effective_from<(r.terms->>'minimum_service_days')::integer OR NOT(r.terms->'exit_kinds' ? x.kind) OR NEW.units IS DISTINCT FROM expected_units OR NEW.amount_minor::numeric IS DISTINCT FROM round(NEW.units*expected_rate*multiplier/divisor,0) OR c.terms->>'currency' IS DISTINCT FROM r.terms->>'currency' OR NEW.snapshot->'rule'->'terms' IS DISTINCT FROM r.terms OR line->>'direction' IS DISTINCT FROM r.terms->>'direction' OR line->>'amount_minor' IS DISTINCT FROM NEW.amount_minor OR(line->'calculation'->>'quantity')::integer IS DISTINCT FROM NEW.units OR(line->'calculation'->>'rate_minor')::numeric IS DISTINCT FROM expected_rate THEN RAISE EXCEPTION 'Benefit source must match the exact approved company rule, salary, service and exit';END IF;
 RETURN NEW;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',100,'service_day_settlement_formulas');
