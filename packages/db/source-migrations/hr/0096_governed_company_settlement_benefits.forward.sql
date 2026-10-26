CREATE TABLE hr_settlement_benefit_rule(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,category text NOT NULL CHECK(category IN('gratuity','severance','notice','other')),
 effective_from date NOT NULL,effective_to date NOT NULL,terms jsonb NOT NULL,state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','submitted','approved','rejected')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by text NOT NULL,submitted_by text,decided_by text,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),CHECK(effective_to>=effective_from),
 EXCLUDE USING gist(tenant_id WITH =,company_id WITH =,category WITH =,daterange(effective_from,effective_to,'[]') WITH &&) WHERE(state='approved')
);
CREATE TABLE hr_settlement_benefit_source(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,case_id text NOT NULL,rule_id text NOT NULL,category text NOT NULL,as_of date NOT NULL,units integer NOT NULL CHECK(units BETWEEN 1 AND 100),amount_minor text NOT NULL CHECK(amount_minor~'^[1-9][0-9]{0,14}$'),source_hash text NOT NULL CHECK(source_hash~'^[a-f0-9]{64}$'),snapshot jsonb NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,company_id,case_id) REFERENCES hr_lifecycle_case(tenant_id,company_id,id),FOREIGN KEY(tenant_id,company_id,rule_id) REFERENCES hr_settlement_benefit_rule(tenant_id,company_id,id)
);
CREATE INDEX hr_benefit_rule_directory ON hr_settlement_benefit_rule(tenant_id,company_id,created_at DESC,id);
CREATE INDEX hr_benefit_source_case ON hr_settlement_benefit_source(tenant_id,company_id,case_id,category);
ALTER TABLE hr_settlement_benefit_rule ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_settlement_benefit_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_benefit_rule_scope ON hr_settlement_benefit_rule USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_settlement_benefit_source ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_settlement_benefit_source FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_benefit_source_scope ON hr_settlement_benefit_source USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER hr_benefit_source_immutable BEFORE UPDATE OR DELETE ON hr_settlement_benefit_source FOR EACH ROW EXECUTE FUNCTION reject_payroll_snapshot_mutation();
CREATE FUNCTION guard_hr_benefit_rule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Company benefit policy history is immutable';END IF;
 IF NEW.terms->>'category' IS DISTINCT FROM NEW.category OR(NEW.terms->>'effective_from')::date IS DISTINCT FROM NEW.effective_from OR(NEW.terms->>'effective_to')::date IS DISTINCT FROM NEW.effective_to OR NEW.terms->>'basis' NOT IN('fixed_amount','completed_service_years') OR NEW.terms->>'direction' NOT IN('earning','deduction') OR NEW.terms->>'rate_minor'!~'^[1-9][0-9]{0,14}$' OR(NEW.terms->>'maximum_units')::integer NOT BETWEEN 1 AND 100 OR(NEW.terms->>'minimum_service_days')::integer NOT BETWEEN 0 AND 36500 OR(NEW.terms->>'basis'='fixed_amount' AND(NEW.terms->>'maximum_units')::integer<>1) OR length(btrim(NEW.terms->>'policy_reference'))<10 OR (NEW.terms->>'rate_minor')::numeric*(NEW.terms->>'maximum_units')::integer>999999999999999 THEN RAISE EXCEPTION 'Benefit terms must retain exact bounded policy settings';END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'Company benefit policies start as unapproved drafts';END IF;
 ELSE
  IF(to_jsonb(NEW)-ARRAY['state','version','submitted_by','decided_by','reason','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','submitted_by','decided_by','reason','updated_at']) OR NEW.version<>OLD.version+1 OR NOT((OLD.state='draft' AND NEW.state='submitted')OR(OLD.state='submitted' AND NEW.state IN('approved','rejected'))) THEN RAISE EXCEPTION 'Company benefit terms and decision history are protected';END IF;
 END IF;
 IF NEW.state='submitted' AND NEW.submitted_by IS DISTINCT FROM NEW.created_by THEN RAISE EXCEPTION 'Only the policy author submits';END IF;
 IF NEW.state IN('approved','rejected') AND(NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,NEW.submitted_by)) THEN RAISE EXCEPTION 'An independent company benefit policy decision is required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_benefit_rule_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_settlement_benefit_rule FOR EACH ROW EXECUTE FUNCTION guard_hr_benefit_rule();
CREATE FUNCTION guard_hr_benefit_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_lifecycle_case%ROWTYPE;x hr_lifecycle_case%ROWTYPE;r hr_settlement_benefit_rule%ROWTYPE;rel hr_employment_relationship%ROWTYPE;line jsonb;expected_units integer;
BEGIN
 SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.case_id;
 SELECT * INTO r FROM hr_settlement_benefit_rule WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.rule_id;
 SELECT * INTO x FROM hr_lifecycle_case WHERE tenant_id=c.tenant_id AND id=c.parent_id;
 SELECT * INTO rel FROM hr_employment_relationship WHERE tenant_id=c.tenant_id AND id=c.relationship_id;
 expected_units:=least((r.terms->>'maximum_units')::integer,CASE WHEN r.terms->>'basis'='fixed_amount' THEN 1 ELSE extract(year FROM age(NEW.as_of,rel.effective_from))::integer END);
 line:=NEW.snapshot->'line';
 IF c.id IS NULL OR c.kind<>'settlement' OR c.state<>'draft' OR r.id IS NULL OR r.state<>'approved' OR NEW.category IS DISTINCT FROM r.category OR NEW.as_of IS DISTINCT FROM(x.terms->>'last_working_date')::date OR x.state<>'approved' OR rel.status<>'active' OR NEW.as_of>current_date OR NEW.as_of NOT BETWEEN r.effective_from AND r.effective_to OR NEW.as_of-rel.effective_from<(r.terms->>'minimum_service_days')::integer OR NOT(r.terms->'exit_kinds' ? x.kind) OR NEW.units IS DISTINCT FROM expected_units OR NEW.amount_minor::numeric IS DISTINCT FROM NEW.units*(r.terms->>'rate_minor')::numeric OR c.terms->>'currency' IS DISTINCT FROM r.terms->>'currency' OR NEW.snapshot->'rule'->'terms' IS DISTINCT FROM r.terms OR line->>'direction' IS DISTINCT FROM r.terms->>'direction' OR line->>'amount_minor' IS DISTINCT FROM NEW.amount_minor OR(line->'calculation'->>'quantity')::integer IS DISTINCT FROM NEW.units OR line->'calculation'->>'rate_minor' IS DISTINCT FROM r.terms->>'rate_minor' THEN RAISE EXCEPTION 'Benefit source must match the exact approved company rule, service and exit';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_benefit_source_guard BEFORE INSERT ON hr_settlement_benefit_source FOR EACH ROW EXECUTE FUNCTION guard_hr_benefit_source();
CREATE FUNCTION guard_hr_benefit_case_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line jsonb;s hr_settlement_benefit_source%ROWTYPE;seen text[]:='{}';
BEGIN
 IF NEW.kind<>'settlement' THEN RETURN NEW;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.terms->'lines') AS expanded(value) WHERE value->>'source_reference' LIKE 'Approved benefit rule %' AND NOT(value ? 'benefit_source_id')) THEN RAISE EXCEPTION 'A calculated benefit reference cannot be detached from its protected source';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(NEW.terms->'lines') WHERE value ? 'benefit_source_id' LOOP
  SELECT * INTO s FROM hr_settlement_benefit_source WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND case_id=NEW.id AND id=line->>'benefit_source_id';
  IF s.id IS NULL OR(line-'benefit_source_id') IS DISTINCT FROM s.snapshot->'line' OR s.category=ANY(seen) THEN RAISE EXCEPTION 'Calculated benefits retain their exact source and cannot duplicate a benefit category';END IF;
  seen:=array_append(seen,s.category);
  IF NEW.state='approved' AND OLD.state IS DISTINCT FROM 'approved' AND s.created_by=NEW.decided_by THEN RAISE EXCEPTION 'The benefit calculator cannot approve its statement';END IF;
 END LOOP;
 IF cardinality(seen)>0 AND NEW.state IN('submitted','approved') AND OLD.state IS DISTINCT FROM NEW.state AND EXISTS(SELECT 1 FROM hr_payroll_period WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND month>=date_trunc('month',(SELECT(terms->>'last_working_date')::date FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND id=NEW.parent_id))::date AND state<>'open') THEN RAISE EXCEPTION 'Frozen Payroll requires its governed correction workflow';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_benefit_case_lines BEFORE INSERT OR UPDATE ON hr_lifecycle_case FOR EACH ROW EXECUTE FUNCTION guard_hr_benefit_case_lines();
CREATE FUNCTION guard_hr_benefit_payroll_approval() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.state='approved' AND OLD.state IS DISTINCT FROM NEW.state AND EXISTS(
 SELECT 1 FROM hr_settlement_payroll_link l JOIN hr_lifecycle_case c ON c.tenant_id=l.tenant_id AND c.id=l.case_id JOIN hr_settlement_benefit_source s ON s.tenant_id=c.tenant_id AND s.case_id=c.id AND s.created_by=NEW.approved_by
 WHERE l.tenant_id=NEW.tenant_id AND l.adjustment_id=NEW.id AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.terms->'lines') ln WHERE ln->>'benefit_source_id'=s.id)) THEN RAISE EXCEPTION 'A benefit calculator cannot approve derived Payroll inputs';END IF;RETURN NEW;
END $$;
CREATE TRIGGER hr_benefit_payroll_approval BEFORE UPDATE ON hr_payroll_adjustment FOR EACH ROW EXECUTE FUNCTION guard_hr_benefit_payroll_approval();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',96,'governed_company_settlement_benefits');
