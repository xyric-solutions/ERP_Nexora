CREATE OR REPLACE FUNCTION guard_hr_settlement_correction_execution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE review hr_settlement_correction_review%ROWTYPE;actor text;result jsonb;total_debit numeric;total_credit numeric;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Supplemental Payroll history cannot be deleted';END IF;
 IF NEW.snapshot->'before' IS NULL OR NEW.snapshot->'after' IS NULL OR NEW.snapshot->'source'->'results' IS NULL OR NEW.snapshot->'journal'->'lines' IS NULL OR jsonb_array_length(NEW.snapshot->'source'->'results')<>jsonb_array_length(NEW.snapshot->'before') THEN RAISE EXCEPTION 'Complete retained Payroll and journal provenance is required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:lifecycle-cases:'||NEW.tenant_id||':'||NEW.company_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:payroll:'||NEW.tenant_id||':'||NEW.company_id,0));
 SELECT * INTO review FROM hr_settlement_correction_review WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.correction_id AND case_id=NEW.case_id;
 IF review.id IS NULL OR review.state NOT IN('approved','processed') THEN RAISE EXCEPTION 'Independently approve the correction review first';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'calculated' OR NEW.version<>1 OR NEW.approved_by IS NOT NULL OR NEW.posted_by IS NOT NULL OR NEW.journal_id IS NOT NULL THEN RAISE EXCEPTION 'Supplemental Payroll starts as an unposted calculation';END IF;
  actor:=NEW.created_by;
 ELSE
  IF NEW.version<>OLD.version+1 OR(to_jsonb(NEW)-ARRAY['state','version','approved_by','approved_at','decision_reason','posted_by','posted_at','journal_id','entry_number','accounting_event_id']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','approved_by','approved_at','decision_reason','posted_by','posted_at','journal_id','entry_number','accounting_event_id']) OR NOT((OLD.state='calculated' AND NEW.state IN('approved','rejected')) OR(OLD.state='approved' AND NEW.state IN('posted','rejected'))) THEN RAISE EXCEPTION 'Supplemental Payroll identity, calculation and decisions are protected';END IF;
  IF NEW.state IN('approved','rejected') THEN
   actor:=NEW.approved_by;
   IF NEW.approved_at IS NULL OR length(btrim(NEW.decision_reason))<5 OR actor IN(NEW.created_by,review.requested_by) THEN RAISE EXCEPTION 'An independent Payroll officer must review the calculation';END IF;
  ELSE
   actor:=NEW.posted_by;
   IF NEW.posted_at IS NULL OR actor IN(NEW.created_by,review.requested_by,NEW.approved_by) THEN RAISE EXCEPTION 'A separate Finance officer must post the correction';END IF;
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM hr_lifecycle_case x WHERE x.tenant_id=NEW.tenant_id AND x.company_id=NEW.company_id AND x.id=NEW.case_id AND(actor=ANY(ARRAY[x.created_by,x.updated_by,x.submitted_by]) OR EXISTS(SELECT 1 FROM hr_settlement_benefit_source s WHERE s.tenant_id=x.tenant_id AND s.company_id=x.company_id AND s.case_id=x.id AND s.created_by=actor AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.terms->'lines') l WHERE l->>'benefit_source_id'=s.id)) OR EXISTS(SELECT 1 FROM hr_settlement_encashment_source s WHERE s.tenant_id=x.tenant_id AND s.company_id=x.company_id AND s.case_id=x.id AND s.created_by=actor AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.terms->'lines') l WHERE l->>'encashment_source_id'=s.id)))) THEN RAISE EXCEPTION 'Original statement authors and calculators cannot decide or post derived Payroll corrections';END IF;
 IF actor IS NULL OR EXISTS(SELECT 1 FROM employee_user_binding b JOIN hr_lifecycle_case x ON x.tenant_id=b.tenant_id AND x.employee_id=b.employee_id WHERE x.tenant_id=NEW.tenant_id AND x.company_id=NEW.company_id AND x.id=NEW.case_id AND b.user_id=actor AND b.ended_at IS NULL) THEN RAISE EXCEPTION 'Affected employees cannot calculate, review or post their correction';END IF;
 SELECT sum((l->>'debit')::numeric),sum((l->>'credit')::numeric) INTO total_debit,total_credit FROM jsonb_array_elements(NEW.snapshot->'journal'->'lines') l;
 IF coalesce(total_debit,0)<>coalesce(total_credit,0) OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.snapshot->'journal'->'lines') l WHERE(l->>'debit')::numeric<0 OR(l->>'credit')::numeric<0 OR((l->>'debit')::numeric>0 AND(l->>'credit')::numeric>0)) THEN RAISE EXCEPTION 'Supplemental Payroll journal must balance exactly';END IF;
 FOR result IN SELECT value FROM jsonb_array_elements(NEW.snapshot->'source'->'results') LOOP
  IF NOT EXISTS(SELECT 1 FROM hr_payroll_result r JOIN hr_payroll_period p ON p.tenant_id=r.tenant_id AND p.id=r.period_id AND p.company_id=r.company_id AND p.run_number=r.run_number WHERE r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id AND r.id=result->>'id' AND r.calculation_hash=result->>'calculation_hash' AND p.state IN('approved','posting_ready','posted','paid','closed')) THEN RAISE EXCEPTION 'Supplemental Payroll must retain actual finalized result provenance';END IF;
 END LOOP;
 IF NEW.state='posted' AND jsonb_array_length(NEW.snapshot->'journal'->'lines')>0 THEN
  IF NOT EXISTS(SELECT 1 FROM journal_entry j JOIN accounting_event e ON e.tenant_id=j.tenant_id AND j.source_type='accounting_event' AND j.source_id=e.id WHERE j.tenant_id=NEW.tenant_id AND j.company_id=NEW.company_id AND j.id=NEW.journal_id AND j.status='posted' AND j.entry_number=NEW.entry_number AND e.id=NEW.accounting_event_id AND e.state='posted' AND e.source_type='hr.settlement_correction' AND e.source_id=NEW.id AND e.event_type='settlement.corrected') THEN RAISE EXCEPTION 'An actual Finance correction journal is required';END IF;
  IF EXISTS((SELECT l->>'account_id',(l->>'debit')::numeric,(l->>'credit')::numeric FROM jsonb_array_elements(NEW.snapshot->'journal'->'lines') l EXCEPT SELECT account_id,debit,credit FROM journal_line WHERE tenant_id=NEW.tenant_id AND journal_id=NEW.journal_id) UNION ALL(SELECT account_id,debit,credit FROM journal_line WHERE tenant_id=NEW.tenant_id AND journal_id=NEW.journal_id EXCEPT SELECT l->>'account_id',(l->>'debit')::numeric,(l->>'credit')::numeric FROM jsonb_array_elements(NEW.snapshot->'journal'->'lines') l)) THEN RAISE EXCEPTION 'Actual Finance correction lines must match the independently approved differences';END IF;
 END IF;
 RETURN NEW;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',115,'supplemental_source_independence');
