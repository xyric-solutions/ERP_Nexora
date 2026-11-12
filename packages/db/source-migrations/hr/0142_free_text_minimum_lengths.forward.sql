-- HR142: free-text reasons, notes, evidence and references in HR & Payroll no
-- longer need a minimum number of characters; they only need to be non-blank.
-- Maximum lengths, required/optional rules, workflow states, approvals and
-- audit evidence are unchanged. System-generated values (for example learning
-- certificate numbers) keep their own format checks.
--
-- Reversible: re-run the previous function bodies (HR guard functions listed
-- below) and restore the previous minimums (8 characters on the reason
-- constraints) after confirming no shorter values were stored.

CREATE OR REPLACE FUNCTION public.guard_hr_benefit_rule()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE salary jsonb;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Company benefit policy history is immutable';END IF;
 salary:=NEW.terms->'salary_basis';
 IF NEW.terms->>'category' IS DISTINCT FROM NEW.category OR(NEW.terms->>'effective_from')::date IS DISTINCT FROM NEW.effective_from OR(NEW.terms->>'effective_to')::date IS DISTINCT FROM NEW.effective_to OR NEW.terms->>'basis' NOT IN('fixed_amount','completed_service_years','service_days') OR NEW.terms->>'direction' NOT IN('earning','deduction') OR(NEW.terms->>'maximum_units')::integer NOT BETWEEN 1 AND 36500 OR(NEW.terms->>'minimum_service_days')::integer NOT BETWEEN 0 AND 36500 OR(NEW.terms->>'basis'='fixed_amount' AND(NEW.terms->>'maximum_units')::integer<>1) OR length(btrim(NEW.terms->>'policy_reference'))<1 THEN RAISE EXCEPTION 'Benefit terms must retain exact bounded policy settings';END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.guard_hr_encashment_rule()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Encashment policy history is immutable';END IF;
 IF (NEW.state<>'rejected' AND NOT EXISTS(SELECT 1 FROM hr_leave_type WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.leave_type_id AND paid AND status='active')) OR NEW.terms->>'leave_type_id' IS DISTINCT FROM NEW.leave_type_id OR(NEW.terms->>'effective_from')::date<>NEW.effective_from OR(NEW.terms->>'effective_to')::date<>NEW.effective_to THEN RAISE EXCEPTION 'Choose an active paid leave type with matching policy dates';END IF;
 IF NEW.terms ? 'salary_basis' THEN
  IF jsonb_typeof(NEW.terms->'salary_basis') IS DISTINCT FROM 'object' OR NEW.terms->>'rate_minor' IS DISTINCT FROM '0' OR coalesce((NEW.terms->'salary_basis'->>'multiplier')::integer,0) NOT BETWEEN 1 AND 10000 OR coalesce((NEW.terms->'salary_basis'->>'divisor')::integer,0) NOT BETWEEN 1 AND 36600 OR coalesce(jsonb_array_length(NEW.terms->'salary_basis'->'component_ids'),0) NOT BETWEEN 1 AND 30 OR(SELECT count(DISTINCT value) FROM jsonb_array_elements(NEW.terms->'salary_basis'->'component_ids'))<>jsonb_array_length(NEW.terms->'salary_basis'->'component_ids') THEN RAISE EXCEPTION 'Salary encashment requires explicit components and bounded integer factors';END IF;
 ELSE
  IF NEW.terms->>'rate_minor' IS NULL OR NEW.terms->>'rate_minor'!~'^[1-9][0-9]{0,14}$' OR round((NEW.terms->>'rate_minor')::numeric*(NEW.terms->>'maximum_days')::numeric,0)>999999999999999 THEN RAISE EXCEPTION 'Fixed encashment rates must be positive and bounded';END IF;
 END IF;
 IF coalesce((NEW.terms->>'maximum_days')::numeric,0)<=0 OR(NEW.terms->>'maximum_days')::numeric>9999.9999 OR coalesce((NEW.terms->>'minimum_service_days')::integer,-1) NOT BETWEEN 0 AND 36500 OR length(btrim(NEW.terms->>'policy_reference'))<1 THEN RAISE EXCEPTION 'Encashment eligibility must retain bounded policy settings';END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'Encashment policies start as drafts';END IF;
 ELSE
  IF ROW(NEW.tenant_id,NEW.company_id,NEW.id,NEW.terms,NEW.leave_type_id,NEW.effective_from,NEW.effective_to,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.company_id,OLD.id,OLD.terms,OLD.leave_type_id,OLD.effective_from,OLD.effective_to,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 OR NOT((OLD.state='draft' AND NEW.state='submitted')OR(OLD.state='submitted' AND NEW.state IN('approved','rejected'))) THEN RAISE EXCEPTION 'Encashment terms and decision history are protected';END IF;
 END IF;
 IF NEW.state='submitted' AND NEW.submitted_by IS DISTINCT FROM NEW.created_by THEN RAISE EXCEPTION 'Only the policy author can submit';END IF;
 IF NEW.state IN('approved','rejected') AND(NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,NEW.submitted_by)) THEN RAISE EXCEPTION 'Independent encashment policy decision is required';END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_hr_lifecycle_case()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE rel hr_employment_relationship%ROWTYPE;p hr_lifecycle_case%ROWTYPE;
BEGIN

 IF TG_OP='UPDATE' AND OLD.kind='settlement' AND OLD.state='approved' AND EXISTS(
  SELECT 1 FROM hr_settlement_void_request v WHERE v.tenant_id=NEW.tenant_id AND v.company_id=NEW.company_id AND v.case_id=NEW.id AND(
   (v.state='submitted' AND v.case_version=OLD.version AND NEW.state='approved')
   OR(v.state IN('approved','rejected') AND v.case_version=OLD.version-1 AND NEW.state=CASE WHEN v.state='approved' THEN 'cancelled' ELSE 'approved' END))
 ) THEN
  IF NEW.version<>OLD.version+1 OR(to_jsonb(NEW)-ARRAY['version','state','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['version','state','updated_at']) THEN RAISE EXCEPTION 'Corrections preserve the original approved statement and evidence';END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Lifecycle case history cannot be deleted';END IF;
 SELECT * INTO rel FROM hr_employment_relationship WHERE tenant_id=NEW.tenant_id AND id=NEW.relationship_id AND legal_employer_id=NEW.company_id AND employee_id=NEW.employee_id;
 IF rel.id IS NULL OR rel.approval_state<>'approved' THEN RAISE EXCEPTION 'Lifecycle cases require approved employment';END IF;
 IF NEW.terms->>'kind' IS DISTINCT FROM NEW.kind THEN RAISE EXCEPTION 'Case terms must match the record kind';END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'Lifecycle cases start as unapproved drafts';END IF;
 ELSE
  IF ROW(NEW.tenant_id,NEW.company_id,NEW.id,NEW.kind,NEW.relationship_id,NEW.employee_id,NEW.parent_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.company_id,OLD.id,OLD.kind,OLD.relationship_id,OLD.employee_id,OLD.parent_id,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Lifecycle identity and version are protected';END IF;
  IF OLD.state IN('closed','cancelled') OR(OLD.state='approved' AND NOT(NEW.state='closed' AND NEW.kind IN('resignation','termination'))) THEN RAISE EXCEPTION 'Approved lifecycle evidence is immutable';END IF;
  IF NEW.state=OLD.state THEN IF OLD.state<>'draft' THEN RAISE EXCEPTION 'Only drafts can be edited';END IF;
  ELSIF NOT((OLD.state='draft' AND NEW.state IN('submitted','cancelled')) OR(OLD.state='submitted' AND NEW.state IN('draft','approved')) OR(OLD.state='approved' AND NEW.state='closed' AND NEW.kind IN('resignation','termination'))) THEN RAISE EXCEPTION 'Unsupported lifecycle transition';END IF;
  IF OLD.state<>NEW.state AND NEW.terms IS DISTINCT FROM OLD.terms THEN RAISE EXCEPTION 'Decisions preserve reviewed terms';END IF;
 END IF;
 IF NEW.kind IN('clearance','settlement') THEN SELECT * INTO p FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.parent_id;IF p.id IS NULL OR p.kind NOT IN('resignation','termination') OR p.state<>'approved' OR p.relationship_id<>NEW.relationship_id OR NEW.terms->>'exit_case_id' IS DISTINCT FROM p.id THEN RAISE EXCEPTION 'Choose the approved exit of the same employee';END IF;
 ELSIF NEW.parent_id IS NOT NULL OR NEW.terms->>'relationship_id' IS DISTINCT FROM NEW.relationship_id THEN RAISE EXCEPTION 'Case relationship terms do not match';END IF;
 IF NEW.state='approved' AND(NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,OLD.updated_by,NEW.submitted_by) OR EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=NEW.tenant_id AND b.employee_id=NEW.employee_id AND b.user_id=NEW.decided_by AND b.ended_at IS NULL)) THEN RAISE EXCEPTION 'Independent lifecycle approval is required';END IF;
 IF NEW.state IN('submitted','approved') AND NEW.kind IN('onboarding','clearance') AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.terms->'tasks') t WHERE(t->>'complete')::boolean IS DISTINCT FROM true OR length(btrim(t->>'evidence'))<1) THEN RAISE EXCEPTION 'Every required checklist task needs completion evidence';END IF;
 IF NEW.kind IN('resignation','termination') AND NEW.state='closed' AND(NOT EXISTS(SELECT 1 FROM hr_lifecycle_case c WHERE c.tenant_id=NEW.tenant_id AND c.parent_id=NEW.id AND c.kind='clearance' AND c.state='approved') OR NOT EXISTS(SELECT 1 FROM hr_lifecycle_case c WHERE c.tenant_id=NEW.tenant_id AND c.parent_id=NEW.id AND c.kind='settlement' AND c.state='approved') OR NOT EXISTS(SELECT 1 FROM hr_employment_event e WHERE e.tenant_id=NEW.tenant_id AND e.relationship_id=NEW.relationship_id AND e.source_reference='hr:lifecycle-case:'||NEW.id AND e.event_type=NEW.kind)) THEN RAISE EXCEPTION 'Offboarding needs approved clearance, settlement and the authoritative employment event';END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_hr_personal_data_correction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Personal correction history is immutable';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'submitted' OR NEW.version<>1 OR NEW.decided_by IS NOT NULL OR NEW.decided_at IS NOT NULL OR NEW.decision_reason<>'' OR NEW.review_reference<>'' OR NEW.before_profile IS DISTINCT FROM hr_personal_profile_snapshot(NEW.tenant_id,NEW.employee_id) THEN RAISE EXCEPTION 'Corrections start with the actual reviewed employee profile';END IF;
 ELSE
  IF OLD.state<>'submitted' OR NEW.state NOT IN('approved','rejected','cancelled') OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['version','state','decided_by','decision_reason','review_reference','decided_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','state','decided_by','decision_reason','review_reference','decided_at']) OR NEW.decided_by IS NULL OR NEW.decided_at IS NULL OR length(btrim(NEW.decision_reason))<1 THEN RAISE EXCEPTION 'Personal corrections require immutable terms and a versioned decision';END IF;
  IF NEW.state='cancelled' AND NEW.decided_by<>NEW.requested_by THEN RAISE EXCEPTION 'Only the requester can cancel';END IF;
  IF NEW.state IN('approved','rejected') AND(NEW.decided_by=NEW.requested_by OR EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=NEW.tenant_id AND b.employee_id=NEW.employee_id AND b.user_id=NEW.decided_by AND b.ended_at IS NULL AND b.effective_from<=current_date AND(b.effective_to IS NULL OR b.effective_to>=current_date))) THEN RAISE EXCEPTION 'An independent HR reviewer is required';END IF;
  IF NEW.state='approved' AND length(btrim(NEW.review_reference))<1 THEN RAISE EXCEPTION 'Supporting information must be independently reviewed';END IF;
 END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(NEW.proposed_profile))<>7 OR NOT NEW.proposed_profile ?& ARRAY['first_name','middle_name','last_name','preferred_name','date_of_birth','personal_email','phone'] THEN RAISE EXCEPTION 'Only personal profile fields may be corrected';END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_hr_report_policy()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Report policy history is immutable';END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'submitted' OR NEW.version<>1 OR NEW.decided_by IS NOT NULL OR NEW.decided_at IS NOT NULL OR NEW.decision_reason<>'' THEN RAISE EXCEPTION 'Report policy starts with independent review pending';END IF;
 ELSE IF OLD.state<>'submitted' OR NEW.state NOT IN('approved','rejected') OR NEW.version<>OLD.version+1 OR NEW.decided_by IS NULL OR NEW.decided_by=NEW.created_by OR NEW.decided_at IS NULL OR length(btrim(NEW.decision_reason))<1 OR (to_jsonb(NEW)-ARRAY['version','state','decided_by','decided_at','decision_reason']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['version','state','decided_by','decided_at','decision_reason']) THEN RAISE EXCEPTION 'Report policy requires an independent versioned immutable review';END IF;END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_hr_settlement_correction_execution()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
   IF NEW.approved_at IS NULL OR length(btrim(NEW.decision_reason))<1 OR actor IN(NEW.created_by,review.requested_by) THEN RAISE EXCEPTION 'An independent Payroll officer must review the calculation';END IF;
  ELSE
   actor:=NEW.posted_by;
   IF NEW.posted_at IS NULL OR actor IN(NEW.created_by,review.requested_by,NEW.approved_by) THEN RAISE EXCEPTION 'A separate Finance officer must post the correction';END IF;
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM hr_lifecycle_case x WHERE x.tenant_id=NEW.tenant_id AND x.company_id=NEW.company_id AND x.id=NEW.case_id AND(actor=ANY(ARRAY[x.created_by,x.submitted_by,CASE WHEN x.updated_by IS DISTINCT FROM x.decided_by THEN x.updated_by ELSE NULL END]) OR EXISTS(SELECT 1 FROM hr_settlement_benefit_source s WHERE s.tenant_id=x.tenant_id AND s.company_id=x.company_id AND s.case_id=x.id AND s.created_by=actor AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.terms->'lines') l WHERE l->>'benefit_source_id'=s.id)) OR EXISTS(SELECT 1 FROM hr_settlement_encashment_source s WHERE s.tenant_id=x.tenant_id AND s.company_id=x.company_id AND s.case_id=x.id AND s.created_by=actor AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.terms->'lines') l WHERE l->>'encashment_source_id'=s.id)))) THEN RAISE EXCEPTION 'Original statement authors and calculators cannot decide or post derived Payroll corrections';END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.guard_performance_contribution()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE c hr_performance_record%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Contribution history cannot be deleted'; END IF;
 SELECT * INTO c FROM hr_performance_record WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.cycle_id;
 IF c.kind IS DISTINCT FROM 'cycle' OR c.state<>'active' THEN RAISE EXCEPTION 'An active Performance cycle is required';END IF;
 IF EXISTS(SELECT 1 FROM hr_performance_record r WHERE r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id AND r.parent_id=NEW.cycle_id AND r.employee_id=NEW.employee_id AND r.kind='review' AND r.state IN('submitted','published')) THEN RAISE EXCEPTION 'Submitted manager reviews freeze contributions';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'invited' OR NEW.version<>1 OR NEW.summary<>'' OR NEW.ratings<>'[]'::jsonb OR NEW.goals<>'[]'::jsonb OR NEW.goals_hash<>'' THEN RAISE EXCEPTION 'Contributions start as empty invitations';END IF;
 ELSE
  IF OLD.state<>'invited' OR NEW.state NOT IN('submitted','withdrawn') OR NEW.version<>OLD.version+1 OR ROW(NEW.tenant_id,NEW.company_id,NEW.id,NEW.cycle_id,NEW.employee_id,NEW.contributor_employee_id,NEW.kind,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.company_id,OLD.id,OLD.cycle_id,OLD.employee_id,OLD.contributor_employee_id,OLD.kind,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Contribution identity and submitted evidence are immutable';END IF;
  IF NEW.state='submitted' AND(NOT EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=NEW.tenant_id AND b.employee_id=NEW.contributor_employee_id AND b.user_id=NEW.updated_by AND b.ended_at IS NULL) OR length(btrim(NEW.summary))<1 OR NEW.goals_hash!~'^[a-f0-9]{64}$' OR jsonb_array_length(NEW.ratings)=0) THEN RAISE EXCEPTION 'Only the bound employee can submit their appraisal';END IF;
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.validate_lifecycle_case_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE expected text[];actual text[];earnings numeric;deductions numeric;precision integer;
BEGIN
 IF NEW.kind IN('onboarding','clearance') THEN
  expected:=CASE WHEN NEW.kind='onboarding' THEN ARRAY['access','employment','equipment','identity','payroll'] ELSE ARRAY['access','assets','finance','hr','knowledge'] END;
  SELECT array_agg(t->>'id' ORDER BY t->>'id') INTO actual FROM jsonb_array_elements(NEW.terms->'tasks') t;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Every required lifecycle task must be retained exactly once';END IF;
 END IF;
 IF NEW.kind='settlement' THEN
  SELECT decimal_places INTO precision FROM currency WHERE tenant_id=NEW.tenant_id AND code=NEW.terms->>'currency' AND status='active';
  IF precision IS NULL OR precision>4 OR jsonb_array_length(NEW.terms->'lines') NOT BETWEEN 1 AND 30 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.terms->'lines') l WHERE l->>'amount_minor'!~'^(0|[1-9][0-9]{0,14})$' OR l->>'direction' NOT IN('earning','deduction') OR length(btrim(l->>'source_reference'))<1) THEN RAISE EXCEPTION 'Invalid exact settlement statement evidence';END IF;
  SELECT coalesce(sum((l->>'amount_minor')::numeric) FILTER(WHERE l->>'direction'='earning'),0),coalesce(sum((l->>'amount_minor')::numeric) FILTER(WHERE l->>'direction'='deduction'),0) INTO earnings,deductions FROM jsonb_array_elements(NEW.terms->'lines') l;
  IF NEW.evidence->>'earnings_minor' IS DISTINCT FROM earnings::text OR NEW.evidence->>'deductions_minor' IS DISTINCT FROM deductions::text OR NEW.evidence->>'net_minor' IS DISTINCT FROM(earnings-deductions)::text OR NEW.evidence->>'currency' IS DISTINCT FROM NEW.terms->>'currency' OR(NEW.evidence->>'money_scale')::integer IS DISTINCT FROM precision OR NEW.evidence->>'payment_status' IS DISTINCT FROM 'not_paid' OR NEW.evidence->>'posting_status' IS DISTINCT FROM 'statement_only' THEN RAISE EXCEPTION 'Settlement statements must reconcile exactly and cannot assert posting or payment';END IF;
 END IF;
 IF NEW.kind='probation' AND NEW.state='approved' AND NEW.terms->>'recommendation'='confirm' AND NOT EXISTS(SELECT 1 FROM hr_employment_event e WHERE e.tenant_id=NEW.tenant_id AND e.relationship_id=NEW.relationship_id AND e.event_type='confirmation' AND e.id=NEW.evidence->>'employment_event_id' AND e.source_reference='hr:lifecycle-case:'||NEW.id AND e.approved_by=NEW.decided_by) THEN RAISE EXCEPTION 'Probation confirmation requires the authoritative approved employment event';END IF;
 RETURN NEW;
END $function$;

ALTER TABLE hr_offer_employee_handoff DROP CONSTRAINT hr_offer_employee_handoff_reason_check, ADD CONSTRAINT hr_offer_employee_handoff_reason_check CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000);

ALTER TABLE hr_shift_rule_event DROP CONSTRAINT hr_shift_rule_event_reason_check, ADD CONSTRAINT hr_shift_rule_event_reason_check CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000);

ALTER TABLE hr_shift_assignment_event DROP CONSTRAINT hr_shift_assignment_event_reason_check, ADD CONSTRAINT hr_shift_assignment_event_reason_check CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000);

ALTER TABLE hr_attendance_correction_event DROP CONSTRAINT hr_attendance_correction_event_reason_check, ADD CONSTRAINT hr_attendance_correction_event_reason_check CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000);

ALTER TABLE hr_shift_assignment DROP CONSTRAINT ck_hr_shift_allocation_cancel, ADD CONSTRAINT ck_hr_shift_allocation_cancel CHECK ((cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL) OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND char_length(btrim(cancellation_reason)) BETWEEN 1 AND 1000));

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',142,'free_text_minimum_lengths');
