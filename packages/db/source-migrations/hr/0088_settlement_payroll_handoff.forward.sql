CREATE TABLE hr_settlement_payroll_link (
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,case_id text NOT NULL,
 line_index integer NOT NULL CHECK(line_index BETWEEN 0 AND 29),revision integer NOT NULL CHECK(revision>0),
 adjustment_id text,component_id text,effective_month date NOT NULL CHECK(effective_month=date_trunc('month',effective_month)::date),
 source_version integer NOT NULL,source_terms jsonb NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 500),
 exclusion_reason text NOT NULL DEFAULT '',created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,case_id,line_index,revision),UNIQUE(tenant_id,adjustment_id),
 FOREIGN KEY(tenant_id,company_id,case_id) REFERENCES hr_lifecycle_case(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,adjustment_id,company_id) REFERENCES hr_payroll_adjustment(tenant_id,id,company_id),
 FOREIGN KEY(tenant_id,component_id,company_id) REFERENCES hr_pay_component(tenant_id,id,company_id),
 CHECK((adjustment_id IS NOT NULL AND component_id IS NOT NULL AND exclusion_reason='') OR(adjustment_id IS NULL AND component_id IS NULL AND length(btrim(exclusion_reason)) BETWEEN 5 AND 500))
);
CREATE INDEX hr_settlement_payroll_case ON hr_settlement_payroll_link(tenant_id,company_id,case_id,line_index,revision DESC);
ALTER TABLE hr_settlement_payroll_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_settlement_payroll_link FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_settlement_payroll_scope ON hr_settlement_payroll_link USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER hr_settlement_payroll_immutable BEFORE UPDATE OR DELETE ON hr_settlement_payroll_link FOR EACH ROW EXECUTE FUNCTION reject_payroll_snapshot_mutation();
CREATE FUNCTION guard_hr_settlement_payroll_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_lifecycle_case%ROWTYPE;a hr_payroll_adjustment%ROWTYPE;comp hr_pay_component%ROWTYPE;prev hr_settlement_payroll_link%ROWTYPE;l jsonb;scale integer;
BEGIN
 SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.case_id FOR UPDATE;
 IF c.kind IS DISTINCT FROM 'settlement' OR c.state<>'approved' OR NEW.source_version<>c.version OR NEW.source_terms IS DISTINCT FROM c.terms THEN RAISE EXCEPTION 'Payroll handoff requires the immutable approved settlement';END IF;
 l:=c.terms->'lines'->NEW.line_index;
 IF l IS NULL THEN RAISE EXCEPTION 'Choose an existing settlement line';END IF;
 SELECT * INTO prev FROM hr_settlement_payroll_link WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id AND line_index=NEW.line_index ORDER BY revision DESC LIMIT 1;
 IF NEW.revision<>coalesce(prev.revision,0)+1 OR(prev.adjustment_id IS NOT NULL AND EXISTS(SELECT 1 FROM hr_payroll_adjustment WHERE tenant_id=NEW.tenant_id AND id=prev.adjustment_id AND state<>'rejected')) THEN RAISE EXCEPTION 'Only rejected or excluded settlement inputs can be replaced';END IF;
 IF EXISTS(SELECT 1 FROM hr_settlement_payroll_link WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id AND effective_month<>NEW.effective_month) THEN RAISE EXCEPTION 'Settlement replacements retain their original Payroll month';END IF;
 IF NEW.adjustment_id IS NOT NULL THEN
  SELECT * INTO a FROM hr_payroll_adjustment WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.adjustment_id;
  SELECT * INTO comp FROM hr_pay_component WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.component_id;
  SELECT decimal_places INTO scale FROM currency WHERE tenant_id=NEW.tenant_id AND code=c.terms->>'currency' AND status='active';
  IF a.id IS NULL OR NOT a.workflow_managed OR a.state<>'draft' OR a.employee_id<>c.employee_id OR a.component_id<>NEW.component_id OR a.effective_month<>NEW.effective_month OR a.created_by<>NEW.created_by OR a.amount<=0 OR a.amount IS DISTINCT FROM (l->>'amount_minor')::numeric/power(10::numeric,scale)
   OR comp.id IS NULL OR comp.status<>'active' OR comp.kind IS DISTINCT FROM l->>'direction' OR comp.method<>'fixed'
  THEN RAISE EXCEPTION 'Settlement adjustment must preserve exact approved source, employee and component direction';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_settlement_payroll_guard BEFORE INSERT ON hr_settlement_payroll_link FOR EACH ROW EXECUTE FUNCTION guard_hr_settlement_payroll_link();
CREATE FUNCTION guard_hr_settlement_adjustment_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='approved' AND OLD.state IS DISTINCT FROM NEW.state AND EXISTS(
 SELECT 1 FROM hr_settlement_payroll_link l JOIN hr_lifecycle_case c ON c.tenant_id=l.tenant_id AND c.id=l.case_id
 WHERE l.tenant_id=NEW.tenant_id AND l.adjustment_id=NEW.id AND (NEW.approved_by IN(c.created_by,c.updated_by,c.submitted_by,l.created_by) OR EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=c.tenant_id AND b.employee_id=c.employee_id AND b.user_id=NEW.approved_by AND b.ended_at IS NULL)))
 THEN RAISE EXCEPTION 'Settlement authors and employee cannot approve derived Payroll inputs';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_settlement_adjustment_approval BEFORE UPDATE ON hr_payroll_adjustment FOR EACH ROW EXECUTE FUNCTION guard_hr_settlement_adjustment_approval();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',88,'settlement_payroll_handoff');
