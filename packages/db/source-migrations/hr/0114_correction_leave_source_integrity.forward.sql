-- Review a compensating proposal without rewriting Payroll, Finance, leave or employment history.
CREATE OR REPLACE FUNCTION hr_settlement_correction_context(t text,c text,k text) RETURNS jsonb LANGUAGE sql STABLE AS $$

 SELECT previous.context||jsonb_build_object('leave_sources',coalesce((SELECT jsonb_agg(jsonb_build_object('line_index',line.ordinality-1,'source_id',s.id,'days',(-coalesce((SELECT sum(tx.days) FROM hr_leave_transaction tx WHERE tx.tenant_id=t AND tx.company_id=c AND((tx.kind='encashed' AND tx.source_type='final_settlement' AND tx.source_id=s.id) OR(tx.kind='encashment_correction' AND tx.evidence_json->>'original_source_id'=s.id))),0))::text) ORDER BY line.ordinality) FROM hr_settlement_encashment_source s JOIN LATERAL jsonb_array_elements(previous.context->'terms'->'lines') WITH ORDINALITY line ON line.value->>'encashment_source_id'=s.id WHERE s.tenant_id=t AND s.company_id=c AND s.case_id=k),'[]'::jsonb)) FROM (SELECT base.context || jsonb_build_object('settled_lines',coalesce((SELECT r.lines FROM hr_settlement_correction_review r WHERE r.tenant_id=t AND r.company_id=c AND r.case_id=k AND r.state='processed' ORDER BY r.decided_at DESC,r.created_at DESC,r.id DESC LIMIT 1),(SELECT jsonb_agg(jsonb_build_object('line_index',ordinality-1,'corrected_minor',value->>'amount_minor') ORDER BY ordinality) FROM jsonb_array_elements(base.context->'terms'->'lines') WITH ORDINALITY))) FROM (SELECT jsonb_build_object('case_version',x.version,'terms',x.terms,'evidence',x.evidence,
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
 WHERE x.tenant_id=t AND x.company_id=c AND x.id=k AND x.kind='settlement' AND x.state='approved') base(context)) previous(context)
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
  IF entry ? 'corrected_leave_days' THEN
   IF original->>'encashment_source_id' IS NULL OR entry->>'corrected_leave_days' !~ '^(0|[1-9][0-9]{0,4})(\.[0-9]{1,4})?$' OR (entry->>'corrected_leave_days')::numeric>36500 OR (entry->>'original_leave_days')::numeric IS DISTINCT FROM(SELECT(value->>'days')::numeric FROM jsonb_array_elements(context->'leave_sources') WHERE(value->>'line_index')::int=idx) THEN RAISE EXCEPTION 'Corrected encashment days must match the retained source and current ledger';END IF;
   IF (entry->>'corrected_leave_days')::numeric IS DISTINCT FROM(entry->>'original_leave_days')::numeric THEN
    IF (entry->>'corrected_minor')::numeric IS DISTINCT FROM round((entry->>'corrected_leave_days')::numeric*(original->'calculation'->>'rate_minor')::numeric*coalesce((original->'calculation'->>'rate_multiplier')::numeric,1)/coalesce((original->'calculation'->>'rate_divisor')::numeric,1)) OR (entry->>'corrected_leave_days')::numeric>(SELECT (p.terms->>'maximum_days')::numeric FROM hr_settlement_encashment_source s JOIN hr_settlement_encashment_rule p ON p.tenant_id=s.tenant_id AND p.id=s.rule_id WHERE s.tenant_id=NEW.tenant_id AND s.company_id=NEW.company_id AND s.id=original->>'encashment_source_id') THEN RAISE EXCEPTION 'Corrected days must respect the captured rate, exact rounding and approved day cap';END IF;
    changed:=true;
   END IF;
  END IF;
  changed:=changed OR (entry->>'delta_minor')::numeric<>0;
  delta:=delta+(entry->>'delta_minor')::numeric*CASE WHEN original->>'direction'='earning' THEN 1 ELSE -1 END;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'line_index') FROM jsonb_array_elements(NEW.lines))<>jsonb_array_length(NEW.lines) OR NOT changed OR delta IS DISTINCT FROM NEW.net_delta_minor::numeric THEN RAISE EXCEPTION 'Correction differences must reconcile exactly';END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION reject_locked_hr02_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_row jsonb;
        prior_row jsonb;
BEGIN
    IF TG_OP='DELETE' THEN
        current_row := to_jsonb(OLD);
        prior_row := current_row;
    ELSIF TG_OP='UPDATE' THEN
        current_row := to_jsonb(NEW);
        prior_row := to_jsonb(OLD);
    ELSE
        current_row := to_jsonb(NEW);
        prior_row := current_row;
    END IF;

    IF TG_TABLE_NAME='hr_leave_transaction' AND TG_OP='INSERT' AND ((current_row->>'kind'='encashed' AND current_row->>'source_type'='final_settlement') OR(current_row->>'kind'='encashment_reversal' AND current_row->>'source_type'='settlement_void') OR(current_row->>'kind'='encashment_correction' AND current_row->>'source_type'='settlement_correction')) THEN RETURN NEW;END IF;
    IF EXISTS (
        SELECT 1
          FROM (VALUES (current_row),(prior_row)) AS changed(payload)
          JOIN hr_attendance_period p
            ON p.tenant_id=changed.payload->>'tenant_id'
           AND p.company_id=changed.payload->>'company_id'
           AND p.state='locked'
         WHERE daterange(p.month, (p.month + INTERVAL '1 month - 1 day')::date, '[]')
               && daterange(
                    COALESCE(
                        (changed.payload->>'work_date')::date,
                        (changed.payload->>'from_date')::date,
                        (changed.payload->>'effective_on')::date,
                        (changed.payload->>'holiday_date')::date
                    ),
                    COALESCE(
                        (changed.payload->>'to_date')::date,
                        (changed.payload->>'work_date')::date,
                        (changed.payload->>'from_date')::date,
                        (changed.payload->>'effective_on')::date,
                        (changed.payload->>'holiday_date')::date
                    ),
                    '[]'
               )
    ) THEN
        RAISE EXCEPTION 'attendance source cannot change in a locked period';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
CREATE FUNCTION protect_hr_corrected_encashment_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.kind='encashment_correction' THEN RAISE EXCEPTION 'Posted supplemental leave history is immutable; use a successor correction';END IF;RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END $$;
CREATE TRIGGER hr_corrected_encashment_history BEFORE UPDATE OR DELETE ON hr_leave_transaction FOR EACH ROW EXECUTE FUNCTION protect_hr_corrected_encashment_history();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',114,'correction_leave_source_integrity');
