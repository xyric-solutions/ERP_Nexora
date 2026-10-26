ALTER TABLE hr_payroll_localization_request DROP CONSTRAINT hr_payroll_localization_request_kind_check;
ALTER TABLE hr_payroll_localization_request ADD CONSTRAINT hr_payroll_localization_request_kind_check CHECK(kind IN('legal_profile','payroll_configuration','work_location','activation','declaration','parameter','pack_release','jurisdiction_override','jurisdiction_override_revocation'));

CREATE FUNCTION validate_governed_employee_jurisdiction_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o hr_employee_jurisdiction_override%ROWTYPE;r hr_payroll_localization_request%ROWTYPE;
BEGIN
 SELECT * INTO o FROM hr_employee_jurisdiction_override WHERE tenant_id=NEW.tenant_id AND id=NEW.id;
 SELECT * INTO r FROM hr_payroll_localization_request WHERE tenant_id=o.tenant_id AND company_id=o.company_id AND id=o.id AND kind='jurisdiction_override';
 IF r.id IS NULL THEN RETURN NULL;END IF; -- Preserve reviewed legacy facts and snapshots.
 IF r.state<>'approved' OR r.created_by<>o.requested_by OR r.decided_by<>o.approved_by OR r.decided_by=r.created_by
 OR r.terms->>'employee_id'<>o.employee_id OR r.terms->>'employee_assignment_id'<>o.employee_assignment_id
 OR r.terms->>'rule_scope'<>o.rule_scope OR r.terms->>'country_code'<>o.country_code OR r.terms->>'jurisdiction_id'<>o.jurisdiction_id
 OR r.terms->>'legal_basis'<>o.legal_basis OR r.terms->>'evidence_reference'<>o.evidence_reference
 OR (r.terms->>'effective_from')::date<>o.effective_from OR (r.terms->>'effective_to')::date IS DISTINCT FROM o.effective_to
 THEN RAISE EXCEPTION 'Employee jurisdiction overrides require their exact independent approved request';END IF;
 IF o.state='revoked' AND NOT EXISTS(SELECT 1 FROM hr_payroll_localization_request q WHERE q.tenant_id=o.tenant_id AND q.company_id=o.company_id AND q.kind='jurisdiction_override_revocation' AND q.terms->>'override_id'=o.id AND q.state='approved' AND q.decided_by=o.revoked_by AND q.decided_by<>q.created_by AND(q.terms->>'effective_from')::date=o.effective_from AND(q.terms->>'effective_to')::date IS NOT DISTINCT FROM o.effective_to)
 THEN RAISE EXCEPTION 'Jurisdiction revocation requires its independently approved request';END IF;
 IF EXISTS(SELECT 1 FROM hr_payroll_period p WHERE p.tenant_id=o.tenant_id AND p.company_id=o.company_id AND p.state NOT IN('open','calculated') AND(p.month+interval '1 month - 1 day')::date>=o.effective_from AND(o.effective_to IS NULL OR p.month<=o.effective_to))
 THEN RAISE EXCEPTION 'Submitted or finalized Payroll prevents jurisdiction changes';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_governed_employee_jurisdiction_commit AFTER INSERT OR UPDATE ON hr_employee_jurisdiction_override DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_governed_employee_jurisdiction_commit();

CREATE FUNCTION validate_payroll_jurisdiction_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s hr_payroll_statutory_snapshot%ROWTYPE;employee text;earned_from date;earned_to date;ev jsonb;o hr_employee_jurisdiction_override%ROWTYPE;item record;ctx jsonb;lp company_legal_profile%ROWTYPE;wl hr_work_location_profile%ROWTYPE;used text[]:=ARRAY[]::text[];allowed boolean;good boolean;expected integer;
BEGIN
 SELECT * INTO s FROM hr_payroll_statutory_snapshot WHERE tenant_id=NEW.tenant_id AND id=NEW.id;
 SELECT r.employee_id,min((d->>'on_date')::date),max((d->>'on_date')::date) INTO employee,earned_from,earned_to FROM hr_payroll_result r JOIN hr_payroll_input i ON i.tenant_id=r.tenant_id AND i.company_id=r.company_id AND i.id=r.payroll_input_id CROSS JOIN LATERAL jsonb_array_elements(i.completion_payload->'days') d WHERE r.tenant_id=s.tenant_id AND r.id=s.payroll_result_id GROUP BY r.employee_id;
 SELECT count(*) INTO expected FROM hr_employee_jurisdiction_override WHERE tenant_id=s.tenant_id AND company_id=s.company_id AND employee_id=employee AND state='approved' AND effective_from<=earned_to AND(effective_to IS NULL OR effective_to>=earned_from);
 IF jsonb_typeof(s.override_evidence_json) IS DISTINCT FROM 'array' OR jsonb_array_length(s.override_evidence_json)<>expected OR (SELECT count(DISTINCT e->>'id') FROM jsonb_array_elements(s.override_evidence_json)e)<>expected THEN RAISE EXCEPTION 'Payroll must retain every applicable approved jurisdiction override exactly once';END IF;
 IF expected=0 THEN RETURN NULL;END IF;
 IF s.context_segments_json#>>'{0,jurisdiction_resolution}' IS DISTINCT FROM 'category_override_v1' THEN RAISE EXCEPTION 'Payroll override evidence requires its scoped resolver contract';END IF;
 FOR ev IN SELECT value FROM jsonb_array_elements(s.override_evidence_json) LOOP
  SELECT * INTO o FROM hr_employee_jurisdiction_override WHERE tenant_id=s.tenant_id AND company_id=s.company_id AND employee_id=employee AND id=ev->>'id' AND state='approved';
  IF o.id IS NULL OR ev->>'employee_assignment_id' IS DISTINCT FROM o.employee_assignment_id OR ev->>'rule_scope' IS DISTINCT FROM o.rule_scope OR ev->>'country_code' IS DISTINCT FROM o.country_code OR ev->>'jurisdiction_id' IS DISTINCT FROM o.jurisdiction_id OR ev->>'legal_basis' IS DISTINCT FROM o.legal_basis OR ev->>'evidence_reference' IS DISTINCT FROM o.evidence_reference OR ev->>'approved_by' IS DISTINCT FROM o.approved_by OR(ev->>'approved_at')::timestamptz IS DISTINCT FROM o.approved_at OR(ev->>'effective_from')::date IS DISTINCT FROM o.effective_from OR(ev->>'effective_to')::date IS DISTINCT FROM o.effective_to THEN RAISE EXCEPTION 'Payroll jurisdiction evidence must match its reviewed canonical fact';END IF;
 END LOOP;
 FOR item IN
  SELECT r.category AS scope,p.target_jurisdiction_id AS target,c.ctx FROM hr_payroll_statutory_snapshot_line l JOIN hr_statutory_rule_version v ON v.id=l.rule_version_id JOIN hr_statutory_rule r ON r.id=v.rule_id JOIN localization_pack_version pv ON pv.id=v.pack_version_id JOIN localization_pack p ON p.id=pv.pack_id CROSS JOIN LATERAL(
   SELECT l.input_evidence_json#>'{sources,jurisdiction_context}' AS ctx WHERE l.input_evidence_json#>'{sources,context_groups}' IS NULL
   UNION ALL SELECT part#>'{sources,jurisdiction_context}' FROM jsonb_array_elements(coalesce(l.input_evidence_json#>'{sources,context_groups}','[]'::jsonb)) g CROSS JOIN LATERAL jsonb_array_elements(g->'contexts') part
  ) c WHERE l.tenant_id=s.tenant_id AND l.snapshot_id=s.id
 LOOP
  ctx:=item.ctx;
  IF jsonb_typeof(ctx) IS DISTINCT FROM 'object' OR ctx->>'rule_scope' IS DISTINCT FROM item.scope OR coalesce(ctx->>'effective_from','')!~'^\d{4}-\d{2}-\d{2}$' OR coalesce(ctx->>'effective_to','')!~'^\d{4}-\d{2}-\d{2}$' OR(ctx->>'effective_from')::date<earned_from OR(ctx->>'effective_to')::date>earned_to OR(ctx->>'effective_from')::date>(ctx->>'effective_to')::date THEN RAISE EXCEPTION 'Every scoped statutory output needs its exact dated category context';END IF;
  SELECT * INTO lp FROM company_legal_profile WHERE tenant_id=s.tenant_id AND company_id=s.company_id AND id=ctx->>'legal_profile_id' AND state IN('approved','active') AND effective_from<=(ctx->>'effective_from')::date AND(effective_to IS NULL OR effective_to>=(ctx->>'effective_to')::date);
  SELECT * INTO wl FROM hr_work_location_profile WHERE tenant_id=s.tenant_id AND company_id=s.company_id AND id=ctx->>'work_location_profile_id' AND state IN('approved','active') AND effective_from<=(ctx->>'effective_from')::date AND(effective_to IS NULL OR effective_to>=(ctx->>'effective_to')::date);
  IF lp.id IS NULL OR wl.id IS NULL OR lp.country_code<>wl.country_code OR NOT EXISTS(SELECT 1 FROM employee_assignment a WHERE a.tenant_id=s.tenant_id AND a.company_id=s.company_id AND a.employee_id=employee AND a.id=ctx->>'employee_assignment_id' AND a.work_location_id=wl.work_location_id AND a.assignment_status IN('active','ended','legacy_compatibility') AND a.effective_from<=(ctx->>'effective_from')::date AND(a.effective_to IS NULL OR a.effective_to>=(ctx->>'effective_to')::date)) THEN RAISE EXCEPTION 'Scoped Payroll requires matching effective legal/work/employee placement authority';END IF;
  IF ctx->>'override_id' IS NOT NULL THEN
   SELECT * INTO o FROM hr_employee_jurisdiction_override WHERE tenant_id=s.tenant_id AND company_id=s.company_id AND id=ctx->>'override_id' AND employee_id=employee AND rule_scope=item.scope AND employee_assignment_id=ctx->>'employee_assignment_id' AND country_code=lp.country_code AND jurisdiction_id=ctx->>'jurisdiction_id' AND state='approved' AND effective_from<=(ctx->>'effective_from')::date AND(effective_to IS NULL OR effective_to>=(ctx->>'effective_to')::date);
   IF o.id IS NULL OR NOT(s.override_evidence_json @> jsonb_build_array(jsonb_build_object('id',o.id))) THEN RAISE EXCEPTION 'A statutory category cannot borrow another category or employee override';END IF;
   used:=array_append(used,o.id);
   WITH RECURSIVE chain AS(SELECT id,parent_id,status,country_code,valid_from,valid_to,ARRAY[id] AS path FROM jurisdiction WHERE id=o.jurisdiction_id UNION ALL SELECT j.id,j.parent_id,j.status,j.country_code,j.valid_from,j.valid_to,c.path||j.id FROM jurisdiction j JOIN chain c ON j.id=c.parent_id WHERE NOT j.id=ANY(c.path)) SELECT coalesce(bool_and(status='active' AND country_code=lp.country_code AND valid_from<=(ctx->>'effective_from')::date AND(valid_to IS NULL OR valid_to>=(ctx->>'effective_to')::date)),false),coalesce(bool_or(id=item.target),false) INTO good,allowed FROM chain;
  ELSE
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(s.override_evidence_json)e WHERE e->>'rule_scope'=item.scope AND(e->>'effective_from')::date<=(ctx->>'effective_to')::date AND(e->>'effective_to' IS NULL OR(e->>'effective_to')::date>=(ctx->>'effective_from')::date)) OR ctx->>'jurisdiction_id' IS DISTINCT FROM wl.jurisdiction_id THEN RAISE EXCEPTION 'An applicable category override cannot be ignored';END IF;
   WITH RECURSIVE chain AS(SELECT id,parent_id,status,country_code,valid_from,valid_to,id AS origin,ARRAY[id] AS path FROM jurisdiction WHERE id IN(lp.registered_jurisdiction_id,wl.jurisdiction_id) UNION ALL SELECT j.id,j.parent_id,j.status,j.country_code,j.valid_from,j.valid_to,c.origin,c.path||j.id FROM jurisdiction j JOIN chain c ON j.id=c.parent_id WHERE NOT j.id=ANY(c.path)) SELECT coalesce(bool_and(status='active' AND country_code=lp.country_code AND valid_from<=(ctx->>'effective_from')::date AND(valid_to IS NULL OR valid_to>=(ctx->>'effective_to')::date)),false),coalesce(bool_or(id=item.target),false) AND coalesce(bool_or((origin=lp.registered_jurisdiction_id AND id=wl.jurisdiction_id) OR(origin=wl.jurisdiction_id AND id=lp.registered_jurisdiction_id)),false) INTO good,allowed FROM chain;
  END IF;
  IF NOT good OR NOT allowed THEN RAISE EXCEPTION 'Statutory output pack falls outside the category jurisdiction authority';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s.override_evidence_json)e WHERE NOT(e->>'id'=ANY(used))) THEN RAISE EXCEPTION 'Every retained override must resolve an applicable published category';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_payroll_jurisdiction_evidence AFTER INSERT OR UPDATE ON hr_payroll_statutory_snapshot DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_payroll_jurisdiction_evidence();
INSERT INTO nexora_schema_migration(module_name,version,name)VALUES('hr',129,'scoped_payroll_jurisdiction');
