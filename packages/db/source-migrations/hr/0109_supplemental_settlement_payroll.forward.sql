CREATE TABLE hr_settlement_correction_execution(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,case_id text NOT NULL,correction_id text NOT NULL,
 state text NOT NULL DEFAULT 'calculated' CHECK(state IN('calculated','approved','rejected','posted')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),source_hash text NOT NULL CHECK(length(source_hash)=64),
 terms jsonb NOT NULL,snapshot jsonb NOT NULL,created_by text NOT NULL,approved_by text,posted_by text,
 decision_reason text,journal_id text,entry_number text,accounting_event_id text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),approved_at timestamptz,posted_at timestamptz,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,company_id,case_id) REFERENCES hr_lifecycle_case(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,correction_id) REFERENCES hr_settlement_correction_review(tenant_id,id),
 CHECK(jsonb_typeof(snapshot->'before')='array' AND jsonb_array_length(snapshot->'before') BETWEEN 1 AND 120),
 CHECK(jsonb_typeof(snapshot->'after')='array' AND jsonb_array_length(snapshot->'after')=jsonb_array_length(snapshot->'before')),
 CHECK(jsonb_typeof(snapshot->'journal'->'lines')='array' AND jsonb_array_length(snapshot->'journal'->'lines')<=1000)
);
CREATE UNIQUE INDEX hr_one_active_correction_execution ON hr_settlement_correction_execution(tenant_id,correction_id) WHERE state<>'rejected';
CREATE INDEX hr_correction_execution_company ON hr_settlement_correction_execution(tenant_id,company_id,posted_at DESC);
ALTER TABLE hr_settlement_correction_execution ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_settlement_correction_execution FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_correction_execution_tenant ON hr_settlement_correction_execution USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE FUNCTION effective_hr_payroll_correction(t text,c text,r text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT result FROM hr_settlement_correction_execution x CROSS JOIN LATERAL jsonb_array_elements(x.snapshot->'after') result
 WHERE x.tenant_id=t AND x.company_id=c AND x.state='posted' AND result->>'result_id'=r ORDER BY x.posted_at DESC,x.id DESC LIMIT 1
$$;
CREATE FUNCTION guard_hr_settlement_correction_execution() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER hr_correction_execution_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_settlement_correction_execution FOR EACH ROW EXECUTE FUNCTION guard_hr_settlement_correction_execution();
ALTER TABLE hr_settlement_correction_review DROP CONSTRAINT hr_settlement_correction_review_state_check;
ALTER TABLE hr_settlement_correction_review ADD CONSTRAINT hr_settlement_correction_review_state_check CHECK(state IN('submitted','approved','rejected','processed'));
-- Named explicitly because the original anonymous check also constrains decision states.
DO $$ DECLARE item record;BEGIN FOR item IN SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='hr_settlement_correction_review'::regclass AND contype='c' LOOP IF item.definition LIKE '%decision_reason%' THEN EXECUTE format('ALTER TABLE hr_settlement_correction_review DROP CONSTRAINT %I',item.conname);END IF;END LOOP;END $$;
ALTER TABLE hr_settlement_correction_review ADD CONSTRAINT hr_correction_review_decision_check CHECK((state='submitted' AND decided_by IS NULL AND decision_reason IS NULL AND decided_at IS NULL) OR(state IN('approved','rejected','processed') AND decided_by IS NOT NULL AND decided_by<>requested_by AND length(btrim(decision_reason)) BETWEEN 5 AND 500 AND decided_at IS NOT NULL));
DROP INDEX hr_one_unresolved_settlement_correction;
CREATE UNIQUE INDEX hr_one_unresolved_settlement_correction ON hr_settlement_correction_review(tenant_id,case_id) WHERE state IN('submitted','approved');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',109,'supplemental_settlement_payroll');
