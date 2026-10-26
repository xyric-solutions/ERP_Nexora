CREATE OR REPLACE FUNCTION guard_hr_settlement_country_rule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conflict_found boolean;
BEGIN
 IF NEW.state='rejected' THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:lifecycle-cases:'||NEW.tenant_id||':'||NEW.company_id,0));
 PERFORM validate_hr_settlement_country_terms(NEW.terms);
 IF NEW.state='approved' THEN
  IF TG_TABLE_NAME='hr_settlement_benefit_rule' THEN
   SELECT EXISTS(SELECT 1 FROM hr_settlement_benefit_source src JOIN hr_lifecycle_case c ON c.tenant_id=src.tenant_id AND c.company_id=src.company_id AND c.id=src.case_id WHERE src.tenant_id=NEW.tenant_id AND src.company_id=NEW.company_id AND src.snapshot->'rule'->'terms'->>'category'=NEW.category AND src.as_of BETWEEN NEW.effective_from AND NEW.effective_to AND c.state='approved' AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.terms->'lines') l WHERE l->>'benefit_source_id'=src.id) AND EXISTS(SELECT 1 FROM hr_settlement_payroll_link l LEFT JOIN hr_payroll_adjustment a ON a.tenant_id=l.tenant_id AND a.company_id=l.company_id AND a.id=l.adjustment_id WHERE l.tenant_id=c.tenant_id AND l.company_id=c.company_id AND l.case_id=c.id AND(a.state<>'rejected' OR(a.id IS NULL AND(c.terms->'lines'->l.line_index->>'amount_minor')::numeric<>0)))) INTO conflict_found;
  ELSE
   SELECT EXISTS(SELECT 1 FROM hr_settlement_encashment_source src JOIN hr_lifecycle_case c ON c.tenant_id=src.tenant_id AND c.company_id=src.company_id AND c.id=src.case_id WHERE src.tenant_id=NEW.tenant_id AND src.company_id=NEW.company_id AND src.leave_type_id=NEW.leave_type_id AND src.as_of BETWEEN NEW.effective_from AND NEW.effective_to AND c.state='approved' AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.terms->'lines') l WHERE l->>'encashment_source_id'=src.id) AND EXISTS(SELECT 1 FROM hr_settlement_payroll_link l LEFT JOIN hr_payroll_adjustment a ON a.tenant_id=l.tenant_id AND a.company_id=l.company_id AND a.id=l.adjustment_id WHERE l.tenant_id=c.tenant_id AND l.company_id=c.company_id AND l.case_id=c.id AND(a.state<>'rejected' OR(a.id IS NULL AND(c.terms->'lines'->l.line_index->>'amount_minor')::numeric<>0)))) INTO conflict_found;
  END IF;
  IF conflict_found THEN RAISE EXCEPTION 'A country policy cannot be backdated across an active or consumed settlement Payroll obligation' USING ERRCODE='23514',CONSTRAINT='hr_country_settlement_obligation';END IF;
 END IF;

 IF NEW.state='approved' AND NEW.terms ? 'legal_scope' THEN
  IF TG_TABLE_NAME='hr_settlement_benefit_rule' THEN
   SELECT EXISTS(SELECT 1 FROM hr_settlement_benefit_rule r WHERE r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id AND r.category=NEW.category AND r.id<>NEW.id AND r.state='approved' AND r.terms ? 'legal_scope' AND r.terms#>>'{legal_scope,basis}' IS DISTINCT FROM NEW.terms#>>'{legal_scope,basis}' AND daterange(r.effective_from,r.effective_to,'[]')&&daterange(NEW.effective_from,NEW.effective_to,'[]')) INTO conflict_found;
  ELSE
   SELECT EXISTS(SELECT 1 FROM hr_settlement_encashment_rule r WHERE r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id AND r.leave_type_id=NEW.leave_type_id AND r.id<>NEW.id AND r.state='approved' AND r.terms ? 'legal_scope' AND r.terms#>>'{legal_scope,basis}' IS DISTINCT FROM NEW.terms#>>'{legal_scope,basis}' AND daterange(r.effective_from,r.effective_to,'[]')&&daterange(NEW.effective_from,NEW.effective_to,'[]')) INTO conflict_found;
  END IF;
  IF conflict_found THEN RAISE EXCEPTION 'Overlapping country policies for one benefit category or leave type must use one explicit jurisdiction basis';END IF;
 END IF;
 RETURN NEW;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',106,'country_policy_payroll_obligation_guard');
