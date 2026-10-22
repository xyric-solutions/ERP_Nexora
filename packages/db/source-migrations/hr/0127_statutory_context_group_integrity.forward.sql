CREATE OR REPLACE FUNCTION validate_dated_statutory_context_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot hr_payroll_statutory_snapshot%ROWTYPE; context jsonb; contexts jsonb; payload jsonb; earned integer; covered integer; context_days integer;
BEGIN
 SELECT * INTO snapshot FROM hr_payroll_statutory_snapshot WHERE tenant_id=NEW.tenant_id AND id=NEW.id;
 IF snapshot.resolver_version<>'dated_statutory_context_v1' THEN RETURN NEW; END IF;
 SELECT i.completion_payload INTO payload FROM hr_payroll_result r JOIN hr_payroll_input i ON i.tenant_id=r.tenant_id AND i.company_id=r.company_id AND i.id=r.payroll_input_id
  WHERE r.tenant_id=snapshot.tenant_id AND r.company_id=snapshot.company_id AND r.id=snapshot.payroll_result_id;
 contexts:=snapshot.context_segments_json->0->'segments';
 IF snapshot.state<>'sealed' OR jsonb_array_length(snapshot.context_segments_json)<>1 OR jsonb_typeof(contexts) IS DISTINCT FROM 'array'
  OR jsonb_typeof(payload->'days') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Dated statutory execution requires sealed contexts and frozen earned days' USING ERRCODE='23514';END IF;
 earned:=jsonb_array_length(payload->'days');
 IF earned<1 OR earned>31 OR jsonb_array_length(contexts)<2 OR jsonb_array_length(contexts)>31 THEN
  RAISE EXCEPTION 'Dated statutory context count is outside the earned period' USING ERRCODE='23514';END IF;
 covered:=0;
 FOR context IN SELECT value FROM jsonb_array_elements(contexts) LOOP
  IF coalesce(context->>'effective_from','')!~'^\d{4}-\d{2}-\d{2}$' OR coalesce(context->>'effective_to','')!~'^\d{4}-\d{2}-\d{2}$'
   OR (context->>'effective_from')::date>(context->>'effective_to')::date OR coalesce(context->>'calendar_days','')!~'^[1-9][0-9]?$'
   OR coalesce(context->>'input_hash','')!~'^[a-f0-9]{64}$' OR coalesce(context->>'resolved_set_hash','')!~'^[a-f0-9]{64}$'
   OR jsonb_typeof(context->'locations') IS DISTINCT FROM 'array' OR jsonb_array_length(context->'locations')<>1
   OR jsonb_typeof(context->'packs') IS DISTINCT FROM 'array' OR jsonb_array_length(context->'packs')<1
  THEN RAISE EXCEPTION 'Dated statutory context evidence is incomplete' USING ERRCODE='23514';END IF;
  SELECT count(*)::int INTO context_days FROM jsonb_array_elements(payload->'days') d WHERE d->>'on_date' BETWEEN context->>'effective_from' AND context->>'effective_to';
  IF context_days<>(context->>'calendar_days')::int OR context_days<1 OR NOT EXISTS(
   SELECT 1 FROM company_legal_profile p WHERE p.tenant_id=snapshot.tenant_id AND p.company_id=snapshot.company_id AND p.id=context->>'legal_profile_id'
    AND p.effective_from<=(context->>'effective_from')::date AND(p.effective_to IS NULL OR p.effective_to>=(context->>'effective_to')::date)
    AND p.state IN('approved','active') AND p.approved_by IS NOT NULL AND p.approved_at IS NOT NULL
  ) OR NOT EXISTS(
   SELECT 1 FROM employee_assignment a JOIN hr_payroll_result r ON r.tenant_id=a.tenant_id AND r.company_id=a.company_id AND r.employee_id=a.employee_id
    JOIN hr_work_location_profile l ON l.tenant_id=a.tenant_id AND l.company_id=a.company_id AND l.work_location_id=a.work_location_id
    WHERE r.tenant_id=snapshot.tenant_id AND r.company_id=snapshot.company_id AND r.id=snapshot.payroll_result_id
     AND a.id=context#>>'{locations,0,assignment,id}' AND l.id=context#>>'{locations,0,location,id}'
     AND a.assignment_status IN('active','ended','legacy_compatibility') AND l.state IN('approved','active')
     AND a.effective_from<=(context->>'effective_from')::date AND(a.effective_to IS NULL OR a.effective_to>=(context->>'effective_to')::date)
     AND l.effective_from<=(context->>'effective_from')::date AND(l.effective_to IS NULL OR l.effective_to>=(context->>'effective_to')::date)
  ) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(context->'packs') p WHERE NOT EXISTS(
   SELECT 1 FROM hr_payroll_statutory_snapshot_pack sp WHERE sp.tenant_id=snapshot.tenant_id AND sp.snapshot_id=snapshot.id AND sp.pack_version_id=p))
  THEN RAISE EXCEPTION 'Dated statutory context does not match its earned source authority' USING ERRCODE='23514';END IF;
  covered:=covered+context_days;
 END LOOP;
 IF covered<>earned OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'days') d WHERE
  (SELECT count(*) FROM jsonb_array_elements(contexts) c WHERE d->>'on_date' BETWEEN c->>'effective_from' AND c->>'effective_to')<>1)
 THEN RAISE EXCEPTION 'Every frozen earned day needs exactly one statutory context' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM hr_payroll_statutory_snapshot_line l JOIN hr_statutory_rule_version r ON r.id=l.rule_version_id
  CROSS JOIN LATERAL jsonb_array_elements(l.input_evidence_json#>'{sources,context_groups}') g
  WHERE l.tenant_id=snapshot.tenant_id AND l.snapshot_id=snapshot.id AND
   ((g->>'earned_period_days')::int<>earned OR (g->>'allocated_days')::int<1 OR (g->>'allocated_days')::int>earned
    OR ((g->>'allocated_days')::int<earned AND r.configuration_json->>'context_basis' IS DISTINCT FROM 'calendar_weighted_monthly')))
 THEN RAISE EXCEPTION 'Partial statutory context allocation requires its published rule policy' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION validate_statutory_context_group_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot hr_payroll_statutory_snapshot%ROWTYPE; groups jsonb; grp jsonb; item jsonb; earned integer; actual_days integer; expected numeric:=0; policy text; rule_from date; rule_to date; applicable boolean:=false;
BEGIN
 SELECT * INTO snapshot FROM hr_payroll_statutory_snapshot WHERE tenant_id=NEW.tenant_id AND id=NEW.snapshot_id;
 IF snapshot.resolver_version<>'dated_statutory_context_v1' THEN RETURN NEW;END IF;
 SELECT jsonb_array_length(i.completion_payload->'days') INTO earned FROM hr_payroll_result r JOIN hr_payroll_input i ON i.tenant_id=r.tenant_id AND i.company_id=r.company_id AND i.id=r.payroll_input_id
  WHERE r.tenant_id=snapshot.tenant_id AND r.id=snapshot.payroll_result_id;
 SELECT configuration_json->>'context_basis',effective_from,effective_to INTO policy,rule_from,rule_to FROM hr_statutory_rule_version WHERE id=NEW.rule_version_id;
 groups:=NEW.input_evidence_json#>'{sources,context_groups}';
 IF jsonb_typeof(groups) IS DISTINCT FROM 'array' OR jsonb_array_length(groups)<1 OR jsonb_array_length(groups)>31
 THEN RAISE EXCEPTION 'Dated statutory output needs retained context allocation groups' USING ERRCODE='23514';END IF;
 FOR grp IN SELECT value FROM jsonb_array_elements(groups) LOOP
  IF coalesce(grp->>'allocated_days','')!~'^[1-9][0-9]?$' OR coalesce(grp->>'earned_period_days','')!~'^[1-9][0-9]?$' OR (grp->>'earned_period_days')::int<>earned
   OR (grp->>'allocated_days')::int>earned OR jsonb_typeof(grp->'contexts') IS DISTINCT FROM 'array'
   OR jsonb_array_length(grp->'contexts')<1 OR jsonb_array_length(grp->'contexts')>31
   OR (grp->>'allocated_days')::int<earned AND policy IS DISTINCT FROM 'calendar_weighted_monthly'
   OR grp->>'context_basis' IS DISTINCT FROM coalesce(policy,'unchanged_monthly')
   OR jsonb_typeof(grp#>'{calculation,applicable}') IS DISTINCT FROM 'boolean'
   OR grp#>>'{calculation,line_kind}' IS DISTINCT FROM NEW.line_kind
   OR grp#>>'{calculation,currency_code}' IS DISTINCT FROM NEW.currency_code
   OR coalesce(grp#>>'{calculation,amount}','')!~'^\d{1,30}(\.\d{1,4})?$'
  THEN RAISE EXCEPTION 'Dated statutory output allocation policy is invalid' USING ERRCODE='23514';END IF;
  actual_days:=0;
  FOR item IN SELECT value FROM jsonb_array_elements(grp->'contexts') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot.context_segments_json#>'{0,segments}') c
    WHERE c->>'effective_from'=item->>'effective_from' AND c->>'effective_to'=item->>'effective_to' AND c->>'calendar_days'=item->>'calendar_days'
     AND (c->>'effective_from')::date>=rule_from AND(rule_to IS NULL OR(c->>'effective_to')::date<=rule_to))
   THEN RAISE EXCEPTION 'Statutory allocation group references an unretained context' USING ERRCODE='23514';END IF;
   actual_days:=actual_days+(item->>'calendar_days')::int;
  END LOOP;
  IF actual_days<>(grp->>'allocated_days')::int THEN RAISE EXCEPTION 'Statutory allocation group days do not reconcile' USING ERRCODE='23514';END IF;
  expected:=expected+(grp#>>'{calculation,amount}')::numeric;
  applicable:=applicable OR(grp#>>'{calculation,applicable}')::boolean;
 END LOOP;
 IF expected<>NEW.employee_amount+NEW.employer_amount OR applicable IS DISTINCT FROM NEW.applicable
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(groups) g CROSS JOIN LATERAL jsonb_array_elements(g->'contexts') c GROUP BY c->>'effective_from',c->>'effective_to' HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Statutory allocated amounts or covered contexts do not reconcile with the sealed output' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER hr_statutory_context_group_integrity AFTER INSERT ON hr_payroll_statutory_snapshot_line
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_statutory_context_group_integrity();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',127,'statutory_context_group_integrity');
