CREATE FUNCTION validate_lifecycle_case_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected text[];actual text[];earnings numeric;deductions numeric;precision integer;
BEGIN
 IF NEW.kind IN('onboarding','clearance') THEN
  expected:=CASE WHEN NEW.kind='onboarding' THEN ARRAY['access','employment','equipment','identity','payroll'] ELSE ARRAY['access','assets','finance','hr','knowledge'] END;
  SELECT array_agg(t->>'id' ORDER BY t->>'id') INTO actual FROM jsonb_array_elements(NEW.terms->'tasks') t;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Every required lifecycle task must be retained exactly once';END IF;
 END IF;
 IF NEW.kind='settlement' THEN
  SELECT decimal_places INTO precision FROM currency WHERE tenant_id=NEW.tenant_id AND code=NEW.terms->>'currency' AND status='active';
  IF precision IS NULL OR precision>4 OR jsonb_array_length(NEW.terms->'lines') NOT BETWEEN 1 AND 30 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.terms->'lines') l WHERE l->>'amount_minor'!~'^(0|[1-9][0-9]{0,14})$' OR l->>'direction' NOT IN('earning','deduction') OR length(btrim(l->>'source_reference'))<5) THEN RAISE EXCEPTION 'Invalid exact settlement statement evidence';END IF;
  SELECT coalesce(sum((l->>'amount_minor')::numeric) FILTER(WHERE l->>'direction'='earning'),0),coalesce(sum((l->>'amount_minor')::numeric) FILTER(WHERE l->>'direction'='deduction'),0) INTO earnings,deductions FROM jsonb_array_elements(NEW.terms->'lines') l;
  IF NEW.evidence->>'earnings_minor' IS DISTINCT FROM earnings::text OR NEW.evidence->>'deductions_minor' IS DISTINCT FROM deductions::text OR NEW.evidence->>'net_minor' IS DISTINCT FROM(earnings-deductions)::text OR NEW.evidence->>'currency' IS DISTINCT FROM NEW.terms->>'currency' OR(NEW.evidence->>'money_scale')::integer IS DISTINCT FROM precision OR NEW.evidence->>'payment_status' IS DISTINCT FROM 'not_paid' OR NEW.evidence->>'posting_status' IS DISTINCT FROM 'statement_only' THEN RAISE EXCEPTION 'Settlement statements must reconcile exactly and cannot assert posting or payment';END IF;
 END IF;
 IF NEW.kind='probation' AND NEW.state='approved' AND NEW.terms->>'recommendation'='confirm' AND NOT EXISTS(SELECT 1 FROM hr_employment_event e WHERE e.tenant_id=NEW.tenant_id AND e.relationship_id=NEW.relationship_id AND e.event_type='confirmation' AND e.id=NEW.evidence->>'employment_event_id' AND e.source_reference='hr:lifecycle-case:'||NEW.id AND e.approved_by=NEW.decided_by) THEN RAISE EXCEPTION 'Probation confirmation requires the authoritative approved employment event';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lifecycle_case_source_evidence BEFORE INSERT OR UPDATE ON hr_lifecycle_case FOR EACH ROW EXECUTE FUNCTION validate_lifecycle_case_evidence();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',85,'lifecycle_case_source_integrity');
