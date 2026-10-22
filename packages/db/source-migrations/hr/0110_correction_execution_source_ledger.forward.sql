-- Review a compensating proposal without rewriting Payroll, Finance, leave or employment history.
CREATE OR REPLACE FUNCTION hr_settlement_correction_context(t text,c text,k text) RETURNS jsonb LANGUAGE sql STABLE AS $$

 SELECT base.context || jsonb_build_object('settled_lines',coalesce((SELECT r.lines FROM hr_settlement_correction_review r WHERE r.tenant_id=t AND r.company_id=c AND r.case_id=k AND r.state='processed' ORDER BY r.decided_at DESC,r.created_at DESC,r.id DESC LIMIT 1),(SELECT jsonb_agg(jsonb_build_object('line_index',ordinality-1,'corrected_minor',value->>'amount_minor') ORDER BY ordinality) FROM jsonb_array_elements(base.context->'terms'->'lines') WITH ORDINALITY))) FROM (SELECT jsonb_build_object('case_version',x.version,'terms',x.terms,'evidence',x.evidence,
 'exit_id',p.id,'exit_state',p.state,'employment_status',r.status,'employment_effective_to',r.effective_to::text,
 'payroll_links',coalesce((SELECT jsonb_agg(jsonb_build_object('line_index',l.line_index,'revision',l.revision,'adjustment_id',l.adjustment_id,'exclusion_reason',l.exclusion_reason,'state',a.state,'version',a.version,'result_id',a.consumed_result_id,'calculation_hash',res.calculation_hash,'period_state',pp.state,'period_version',pp.version,'journal_id',j.external_journal_id,'finance_state',je.status) ORDER BY l.line_index,l.revision)
 FROM hr_settlement_payroll_link l LEFT JOIN hr_payroll_adjustment a ON a.tenant_id=l.tenant_id AND a.company_id=l.company_id AND a.id=l.adjustment_id
 LEFT JOIN hr_payroll_result res ON res.tenant_id=a.tenant_id AND res.id=a.consumed_result_id
 LEFT JOIN hr_payroll_period pp ON pp.tenant_id=l.tenant_id AND pp.company_id=l.company_id AND pp.month=l.effective_month
 LEFT JOIN hr_payroll_journal_proposal j ON j.tenant_id=pp.tenant_id AND j.company_id=pp.company_id AND j.period_id=pp.id AND j.run_number=pp.run_number AND j.state='posted'
 LEFT JOIN journal_entry je ON je.tenant_id=j.tenant_id AND je.company_id=j.company_id AND je.id=j.external_journal_id
 WHERE l.tenant_id=x.tenant_id AND l.company_id=x.company_id AND l.case_id=x.id),'[]'::jsonb),
 'exit_payroll',coalesce((SELECT jsonb_build_object('id',pp.id,'state',pp.state,'version',pp.version) FROM hr_payroll_period pp WHERE pp.tenant_id=x.tenant_id AND pp.company_id=x.company_id AND pp.month=date_trunc('month',(p.terms->>'last_working_date')::date)::date),'null'::jsonb))
 FROM hr_lifecycle_case x JOIN hr_lifecycle_case p ON p.tenant_id=x.tenant_id AND p.company_id=x.company_id AND p.id=x.parent_id
 JOIN hr_employment_relationship r ON r.tenant_id=x.tenant_id AND r.id=x.relationship_id
 WHERE x.tenant_id=t AND x.company_id=c AND x.id=k AND x.kind='settlement' AND x.state='approved') base(context)
$$;
CREATE OR REPLACE FUNCTION guard_hr_settlement_correction_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE context jsonb;actor text;entry jsonb;original jsonb;idx integer;delta numeric:=0;changed boolean:=false;
BEGIN
 IF TG_OP='UPDATE' AND OLD.state='approved' AND NEW.state='processed' THEN
  IF (to_jsonb(NEW)-'state') IS DISTINCT FROM(to_jsonb(OLD)-'state') OR NOT EXISTS(SELECT 1 FROM hr_settlement_correction_execution e WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.correction_id=NEW.id AND e.state='posted') THEN RAISE EXCEPTION 'A processed correction requires its actual immutable Payroll/Finance execution';END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Correction review history is immutable';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:lifecycle-cases:'||NEW.tenant_id||':'||NEW.company_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:payroll:'||NEW.tenant_id||':'||NEW.company_id,0));
 context:=hr_settlement_correction_context(NEW.tenant_id,NEW.company_id,NEW.case_id);
 IF context IS NULL THEN RAISE EXCEPTION 'Choose an approved settlement statement';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'submitted' THEN RAISE EXCEPTION 'Corrections start as review requests';END IF;
  actor:=NEW.requested_by;
 ELSE
  IF OLD.state<>'submitted' OR NEW.state NOT IN('approved','rejected') OR (to_jsonb(NEW)-ARRAY['state','decided_by','decision_reason','decided_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','decided_by','decision_reason','decided_at']) THEN RAISE EXCEPTION 'Correction terms and decisions are immutable';END IF;
  actor:=NEW.decided_by;
 END IF;
 IF EXISTS(SELECT 1 FROM hr_lifecycle_case x JOIN employee_user_binding b ON b.tenant_id=x.tenant_id AND b.employee_id=x.employee_id AND b.ended_at IS NULL WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.case_id AND b.user_id=actor) THEN RAISE EXCEPTION 'Affected employees cannot request or decide their correction';END IF;
 IF NEW.state='rejected' THEN RETURN NEW;END IF;
 IF NEW.snapshot IS DISTINCT FROM context THEN RAISE EXCEPTION 'Correction source evidence changed; reject and request a fresh review';END IF;
 IF NOT(context->>'employment_status'='ended' OR context->>'exit_state'='closed' OR coalesce(context->'exit_payroll'->>'state','open')<>'open' OR EXISTS(SELECT 1 FROM jsonb_array_elements(context->'payroll_links') l WHERE l->>'state'='consumed')) THEN RAISE EXCEPTION 'Use the pre-Payroll statement correction workflow';END IF;
 IF EXISTS(SELECT 1 FROM hr_settlement_void_request WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND case_id=NEW.case_id AND state='submitted') THEN RAISE EXCEPTION 'Resolve the pending statement void first';END IF;
 IF jsonb_array_length(NEW.lines)<>jsonb_array_length(context->'terms'->'lines') THEN RAISE EXCEPTION 'Review every original statement line';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(NEW.lines) LOOP
  IF (entry->>'line_index') !~ '^(0|[1-2]?[0-9])$' OR (entry->>'corrected_minor') !~ '^(0|[1-9][0-9]{0,14})$' THEN RAISE EXCEPTION 'Invalid correction line';END IF;
  idx:=(entry->>'line_index')::integer;
  original:=(context->'terms'->'lines'->idx)||jsonb_build_object('amount_minor',(SELECT value->>'corrected_minor' FROM jsonb_array_elements(context->'settled_lines') WHERE(value->>'line_index')::int=idx));
  IF original IS NULL OR entry->>'original_minor' IS DISTINCT FROM original->>'amount_minor' OR (entry->>'delta_minor')::numeric IS DISTINCT FROM (entry->>'corrected_minor')::numeric-(original->>'amount_minor')::numeric THEN RAISE EXCEPTION 'Correction line does not reconcile to the retained original';END IF;
  changed:=changed OR (entry->>'delta_minor')::numeric<>0;
  delta:=delta+(entry->>'delta_minor')::numeric*CASE WHEN original->>'direction'='earning' THEN 1 ELSE -1 END;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'line_index') FROM jsonb_array_elements(NEW.lines))<>jsonb_array_length(NEW.lines) OR NOT changed OR delta IS DISTINCT FROM NEW.net_delta_minor::numeric THEN RAISE EXCEPTION 'Correction differences must reconcile exactly';END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION protect_hr_settlement_pending_correction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.state IS DISTINCT FROM OLD.state AND EXISTS(SELECT 1 FROM hr_settlement_correction_review c WHERE c.tenant_id=OLD.tenant_id AND c.company_id=OLD.company_id AND c.state IN('submitted','approved') AND(c.case_id=OLD.id OR EXISTS(SELECT 1 FROM hr_lifecycle_case x WHERE x.tenant_id=c.tenant_id AND x.id=c.case_id AND x.parent_id=OLD.id))) THEN RAISE EXCEPTION 'An unresolved financial correction preserves the original statement and exit state';END IF;
 RETURN NEW;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',110,'correction_execution_source_ledger');
