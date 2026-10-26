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
  IF(to_jsonb(NEW)-ARRAY['state','version','submitted_by','decided_by','reason','updated_at','country_scope_key']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','submitted_by','decided_by','reason','updated_at','country_scope_key']) OR NEW.version<>OLD.version+1 OR NOT((OLD.state='draft' AND NEW.state='submitted')OR(OLD.state='submitted' AND NEW.state IN('approved','rejected'))) THEN RAISE EXCEPTION 'Company benefit terms and decision history are protected';END IF;
 END IF;
 IF NEW.state='submitted' AND NEW.submitted_by IS DISTINCT FROM NEW.created_by THEN RAISE EXCEPTION 'Only the policy author submits';END IF;
 IF NEW.state IN('approved','rejected') AND(NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,NEW.submitted_by)) THEN RAISE EXCEPTION 'An independent company benefit policy decision is required';END IF;
 RETURN NEW;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',104,'country_rule_generated_identity');
