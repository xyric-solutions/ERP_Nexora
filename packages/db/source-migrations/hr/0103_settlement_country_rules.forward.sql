-- Country applicability is shared by benefits and leave encashment. Rates remain
-- independently reviewed company policy; this migration installs no legal rates.
ALTER TABLE hr_settlement_benefit_rule ADD COLUMN country_scope_key text GENERATED ALWAYS AS (coalesce(terms#>>'{legal_scope,country_code}','*')||':'||coalesce(terms#>>'{legal_scope,jurisdiction_id}','*')) STORED;
ALTER TABLE hr_settlement_encashment_rule ADD COLUMN country_scope_key text GENERATED ALWAYS AS (coalesce(terms#>>'{legal_scope,country_code}','*')||':'||coalesce(terms#>>'{legal_scope,jurisdiction_id}','*')) STORED;
DO $$ DECLARE n text; BEGIN
 SELECT conname INTO n FROM pg_constraint WHERE conrelid='hr_settlement_benefit_rule'::regclass AND contype='x';
 EXECUTE format('ALTER TABLE hr_settlement_benefit_rule DROP CONSTRAINT %I',n);
 SELECT conname INTO n FROM pg_constraint WHERE conrelid='hr_settlement_encashment_rule'::regclass AND contype='x';
 EXECUTE format('ALTER TABLE hr_settlement_encashment_rule DROP CONSTRAINT %I',n);
END $$;
ALTER TABLE hr_settlement_benefit_rule ADD CONSTRAINT hr_benefit_country_period EXCLUDE USING gist(tenant_id WITH =,company_id WITH =,category WITH =,country_scope_key WITH =,daterange(effective_from,effective_to,'[]') WITH &&) WHERE(state='approved');
ALTER TABLE hr_settlement_encashment_rule ADD CONSTRAINT hr_encashment_country_period EXCLUDE USING gist(tenant_id WITH =,company_id WITH =,leave_type_id WITH =,country_scope_key WITH =,daterange(effective_from,effective_to,'[]') WITH &&) WHERE(state='approved');

CREATE FUNCTION validate_hr_settlement_country_terms(p_terms jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s jsonb:=p_terms->'legal_scope';c country%ROWTYPE;j jurisdiction%ROWTYPE;cursor_id text;seen text[]:='{}';
BEGIN
 IF s IS NULL THEN RETURN;END IF;
 IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR s->>'country_code' IS NULL OR s->>'country_code'!~'^[A-Z]{2}$' OR s->>'basis' IS NULL OR s->>'basis' NOT IN('legal_employer','work_location') OR coalesce(length(btrim(s->>'authority_reference')),0) NOT BETWEEN 10 AND 1000 OR NOT(s ? 'jurisdiction_id') THEN RAISE EXCEPTION 'Country rules require a reviewed country, explicit jurisdiction basis and authority reference';END IF;
 SELECT * INTO c FROM country WHERE code=s->>'country_code';
 IF c.code IS NULL OR c.status<>'active' OR c.valid_from>(p_terms->>'effective_from')::date OR(c.valid_to IS NOT NULL AND c.valid_to<(p_terms->>'effective_to')::date) THEN RAISE EXCEPTION 'Country must be active throughout the rule effective range';END IF;
 cursor_id:=s->>'jurisdiction_id';
 WHILE cursor_id IS NOT NULL LOOP
  IF cursor_id=ANY(seen) OR cardinality(seen)>=32 THEN RAISE EXCEPTION 'Country jurisdiction ancestry must be complete and acyclic';END IF;
  seen:=array_append(seen,cursor_id);
  SELECT * INTO j FROM jurisdiction WHERE id=cursor_id;
  IF j.id IS NULL OR j.country_code<>c.code OR j.status<>'active' OR j.valid_from>(p_terms->>'effective_from')::date OR(j.valid_to IS NOT NULL AND j.valid_to<(p_terms->>'effective_to')::date) THEN RAISE EXCEPTION 'Jurisdiction and ancestors must be active in this country throughout the rule range';END IF;
  IF j.parent_id IS NULL AND j.level<>'national' THEN RAISE EXCEPTION 'Jurisdiction chain must reach its national root';END IF;
  cursor_id:=j.parent_id;
 END LOOP;
END $$;

CREATE FUNCTION guard_hr_settlement_country_rule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conflict_found boolean;
BEGIN
 IF NEW.state='rejected' THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:lifecycle-cases:'||NEW.tenant_id||':'||NEW.company_id,0));
 PERFORM validate_hr_settlement_country_terms(NEW.terms);
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
CREATE TRIGGER hr_benefit_country_rule BEFORE INSERT OR UPDATE ON hr_settlement_benefit_rule FOR EACH ROW EXECUTE FUNCTION guard_hr_settlement_country_rule();
CREATE TRIGGER hr_encashment_country_rule BEFORE INSERT OR UPDATE ON hr_settlement_encashment_rule FOR EACH ROW EXECUTE FUNCTION guard_hr_settlement_country_rule();

CREATE FUNCTION read_hr_settlement_country_context(p_tenant text,p_company text,p_employee text,p_relationship text,p_date date,p_family text,p_rule text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE selected_terms jsonb;rule_set jsonb;scope jsonb;basis text;basis_count integer;profiles jsonb;assignments jsonb:='[]';overrides jsonb:='[]';profile jsonb;country_row jsonb;ancestry jsonb:='[]';j jurisdiction%ROWTYPE;cursor_id text;seen text[]:='{}';issues jsonb:='[]';r jsonb;score integer;best integer:=-1;winner text;ties integer:=0;depth integer;chain_ok boolean:=true;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:lifecycle-cases:'||p_tenant||':'||p_company,0));
 IF p_family='benefit' THEN
  SELECT terms INTO selected_terms FROM hr_settlement_benefit_rule WHERE tenant_id=p_tenant AND company_id=p_company AND id=p_rule;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'terms',terms,'state',state) ORDER BY id),'[]') INTO rule_set FROM hr_settlement_benefit_rule WHERE tenant_id=p_tenant AND company_id=p_company AND category=selected_terms->>'category' AND p_date BETWEEN effective_from AND effective_to AND(state='approved' OR id=p_rule);
 ELSIF p_family='encashment' THEN
  SELECT terms INTO selected_terms FROM hr_settlement_encashment_rule WHERE tenant_id=p_tenant AND company_id=p_company AND id=p_rule;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'terms',terms,'state',state) ORDER BY id),'[]') INTO rule_set FROM hr_settlement_encashment_rule WHERE tenant_id=p_tenant AND company_id=p_company AND leave_type_id=selected_terms->>'leave_type_id' AND p_date BETWEEN effective_from AND effective_to AND(state='approved' OR id=p_rule);
 ELSE RAISE EXCEPTION 'Unknown settlement rule family';END IF;
 IF selected_terms IS NULL THEN RAISE EXCEPTION 'Choose an available settlement rule from this company';END IF;
 IF NOT(selected_terms ? 'legal_scope') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rule_set) x WHERE x->'terms' ? 'legal_scope') THEN RETURN NULL;END IF;
 IF jsonb_array_length(rule_set)>500 THEN RAISE EXCEPTION 'Too many effective country rules for bounded settlement review';END IF;
 SELECT count(DISTINCT value#>>'{terms,legal_scope,basis}'),min(value#>>'{terms,legal_scope,basis}') INTO basis_count,basis FROM jsonb_array_elements(rule_set) WHERE value->'terms' ? 'legal_scope';
 basis:=coalesce(selected_terms#>>'{legal_scope,basis}',basis);
 IF basis_count>1 THEN issues:=issues||jsonb_build_array('Conflicting jurisdiction bases apply. Independently revise the overlapping company rules.');END IF;
 IF basis='legal_employer' THEN
  IF current_setting('transaction_read_only')='off' THEN PERFORM 1 FROM company_legal_profile WHERE tenant_id=p_tenant AND company_id=p_company AND state IN('approved','active') AND effective_from<=p_date AND(effective_to IS NULL OR effective_to>=p_date) FOR SHARE;END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'country_code',country_code,'jurisdiction_id',registered_jurisdiction_id,'effective_from',effective_from::text,'effective_to',effective_to::text,'state',state,'approved_by',approved_by,'approved_at',approved_at) ORDER BY id),'[]') INTO profiles FROM company_legal_profile WHERE tenant_id=p_tenant AND company_id=p_company AND state IN('approved','active') AND effective_from<=p_date AND(effective_to IS NULL OR effective_to>=p_date);
 ELSE
  IF current_setting('transaction_read_only')='off' THEN PERFORM 1 FROM employee_assignment WHERE tenant_id=p_tenant AND company_id=p_company AND employee_id=p_employee AND employment_relationship_id=p_relationship AND assignment_status IN('active','ended') AND effective_from<=p_date AND(effective_to IS NULL OR effective_to>=p_date) FOR SHARE;END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'work_location_id',work_location_id,'effective_from',effective_from::text,'effective_to',effective_to::text,'assignment_status',assignment_status) ORDER BY id),'[]') INTO assignments FROM employee_assignment WHERE tenant_id=p_tenant AND company_id=p_company AND employee_id=p_employee AND employment_relationship_id=p_relationship AND assignment_status IN('active','ended') AND effective_from<=p_date AND(effective_to IS NULL OR effective_to>=p_date);
  IF current_setting('transaction_read_only')='off' THEN PERFORM 1 FROM hr_work_location_profile WHERE tenant_id=p_tenant AND company_id=p_company AND work_location_id=assignments->0->>'work_location_id' AND state IN('approved','active') AND effective_from<=p_date AND(effective_to IS NULL OR effective_to>=p_date) FOR SHARE;END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'country_code',country_code,'jurisdiction_id',jurisdiction_id,'effective_from',effective_from::text,'effective_to',effective_to::text,'state',state,'approved_by',approved_by,'approved_at',approved_at) ORDER BY id),'[]') INTO profiles FROM hr_work_location_profile WHERE tenant_id=p_tenant AND company_id=p_company AND work_location_id=assignments->0->>'work_location_id' AND state IN('approved','active') AND effective_from<=p_date AND(effective_to IS NULL OR effective_to>=p_date);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'rule_scope',rule_scope,'country_code',country_code,'jurisdiction_id',jurisdiction_id,'effective_from',effective_from::text,'effective_to',effective_to::text) ORDER BY id),'[]') INTO overrides FROM hr_employee_jurisdiction_override WHERE tenant_id=p_tenant AND company_id=p_company AND employee_id=p_employee AND state='approved' AND effective_from<=p_date AND(effective_to IS NULL OR effective_to>=p_date);
  IF jsonb_array_length(assignments)<>1 THEN issues:=issues||jsonb_build_array('Country rules need one effective operational work-location assignment at the exit date.');END IF;
  IF jsonb_array_length(overrides)>0 THEN issues:=issues||jsonb_build_array('An approved employee jurisdiction override needs explicit resolution before settlement calculation.');END IF;
 END IF;
 IF jsonb_array_length(profiles)<>1 THEN issues:=issues||jsonb_build_array('Country rules need one approved effective '||replace(basis,'_','-')||' jurisdiction profile at the exit date.');
 ELSE
  profile:=profiles->0;
  IF current_setting('transaction_read_only')='off' THEN PERFORM 1 FROM country WHERE code=profile->>'country_code' FOR SHARE;END IF;
  SELECT jsonb_build_object('code',code,'name',name,'status',status,'subnational_mode',subnational_mode,'valid_from',valid_from::text,'valid_to',valid_to::text,'source_version',source_version) INTO country_row FROM country WHERE code=profile->>'country_code' AND status='active' AND valid_from<=p_date AND(valid_to IS NULL OR valid_to>=p_date);
  IF country_row IS NULL THEN issues:=issues||jsonb_build_array('The effective country reference is inactive or outside its validity dates.');END IF;
  cursor_id:=profile->>'jurisdiction_id';
  WHILE cursor_id IS NOT NULL LOOP
   IF cursor_id=ANY(seen) OR cardinality(seen)>=32 THEN chain_ok:=false;EXIT;END IF;
   seen:=array_append(seen,cursor_id);
   IF current_setting('transaction_read_only')='off' THEN PERFORM 1 FROM jurisdiction WHERE id=cursor_id FOR SHARE;END IF;
   SELECT * INTO j FROM jurisdiction WHERE id=cursor_id;
   IF j.id IS NULL OR j.country_code IS DISTINCT FROM profile->>'country_code' OR j.status<>'active' OR j.valid_from>p_date OR(j.valid_to IS NOT NULL AND j.valid_to<p_date) OR(j.parent_id IS NULL AND j.level<>'national') THEN chain_ok:=false;EXIT;END IF;
   ancestry:=ancestry||jsonb_build_array(jsonb_build_object('id',j.id,'parent_id',j.parent_id,'name',j.name,'level',j.level,'country_code',j.country_code,'source_version',j.source_version,'valid_from',j.valid_from::text,'valid_to',j.valid_to::text));
   cursor_id:=j.parent_id;
  END LOOP;
  IF NOT chain_ok OR jsonb_array_length(ancestry)=0 THEN issues:=issues||jsonb_build_array('The effective country jurisdiction ancestry must be active, complete and acyclic.');END IF;
  IF basis='work_location' AND country_row->>'subnational_mode'='required' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ancestry) x WHERE x->>'level'='subnational') THEN issues:=issues||jsonb_build_array('This country requires a reviewed subnational work-location profile.');END IF;
 END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(rule_set) LOOP
  scope:=r#>'{terms,legal_scope}';score:=-1;
  IF scope IS NULL THEN score:=0;
  ELSIF scope->>'basis'=basis AND scope->>'country_code'=profile->>'country_code' AND chain_ok THEN
   IF scope->>'jurisdiction_id' IS NULL THEN score:=1;
   ELSE SELECT ord::integer INTO depth FROM jsonb_array_elements(ancestry) WITH ORDINALITY AS a(value,ord) WHERE value->>'id'=scope->>'jurisdiction_id';
    IF depth IS NOT NULL THEN score:=35-depth;END IF;
   END IF;
  END IF;
  IF score>best THEN best:=score;winner:=r->>'id';ties:=1;
  ELSIF score=best AND score>=0 THEN ties:=ties+1;END IF;
 END LOOP;
 IF winner IS DISTINCT FROM p_rule OR ties<>1 THEN issues:=issues||jsonb_build_array('Choose the most specific approved country/regional rule matching the employee jurisdiction; a company default cannot bypass it.');END IF;
 RETURN jsonb_build_object('basis',basis,'as_of',p_date::text,'selected_scope',selected_terms->'legal_scope','rule_set',rule_set,'profiles',profiles,'assignments',assignments,'overrides',overrides,'country',country_row,'ancestry',ancestry,'matched_rule_id',winner,'blockers',issues);
END $$;

CREATE FUNCTION check_hr_settlement_country_source(p_tenant text,p_company text,p_employee text,p_relationship text,p_date date,p_family text,p_rule text,p_snapshot jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE current_context jsonb;
BEGIN
 current_context:=read_hr_settlement_country_context(p_tenant,p_company,p_employee,p_relationship,p_date,p_family,p_rule);
 IF current_context IS DISTINCT FROM p_snapshot->'country_scope' OR coalesce(jsonb_array_length(current_context->'blockers'),0)>0 THEN RAISE EXCEPTION 'Country applicability changed or does not match the approved source. Refresh the draft or independently correct the statement';END IF;
END $$;
CREATE FUNCTION guard_hr_settlement_country_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_lifecycle_case%ROWTYPE;
BEGIN
 SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.case_id;
 PERFORM check_hr_settlement_country_source(NEW.tenant_id,NEW.company_id,c.employee_id,c.relationship_id,NEW.as_of,CASE WHEN TG_TABLE_NAME='hr_settlement_benefit_source' THEN 'benefit' ELSE 'encashment' END,NEW.rule_id,NEW.snapshot);
 RETURN NEW;
END $$;
CREATE TRIGGER hr_benefit_country_source BEFORE INSERT ON hr_settlement_benefit_source FOR EACH ROW EXECUTE FUNCTION guard_hr_settlement_country_source();
CREATE TRIGGER hr_encashment_country_source BEFORE INSERT ON hr_settlement_encashment_source FOR EACH ROW EXECUTE FUNCTION guard_hr_settlement_country_source();

CREATE FUNCTION guard_hr_settlement_country_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_lifecycle_case%ROWTYPE;s record;
BEGIN
 IF TG_TABLE_NAME='hr_lifecycle_case' THEN
  IF NEW.kind<>'settlement' OR NEW.state<>'approved' OR OLD.state='approved' THEN RETURN NEW;END IF;c:=NEW;
 ELSE
  SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.case_id;
 END IF;
 FOR s IN SELECT tenant_id,company_id,case_id,id,as_of,rule_id,snapshot,'benefit' family,'benefit_source_id' source_key FROM hr_settlement_benefit_source WHERE tenant_id=c.tenant_id AND company_id=c.company_id AND case_id=c.id UNION ALL SELECT tenant_id,company_id,case_id,id,as_of,rule_id,snapshot,'encashment','encashment_source_id' FROM hr_settlement_encashment_source WHERE tenant_id=c.tenant_id AND company_id=c.company_id AND case_id=c.id LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(c.terms->'lines') l WHERE l->>s.source_key=s.id) THEN PERFORM check_hr_settlement_country_source(c.tenant_id,c.company_id,c.employee_id,c.relationship_id,s.as_of,s.family,s.rule_id,s.snapshot);END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_country_statement_approval BEFORE UPDATE ON hr_lifecycle_case FOR EACH ROW EXECUTE FUNCTION guard_hr_settlement_country_commit();
CREATE TRIGGER hr_country_payroll_handoff BEFORE INSERT ON hr_settlement_payroll_link FOR EACH ROW EXECUTE FUNCTION guard_hr_settlement_country_commit();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',103,'settlement_country_rules');
