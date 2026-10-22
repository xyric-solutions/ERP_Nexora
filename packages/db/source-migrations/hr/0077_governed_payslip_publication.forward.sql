ALTER TABLE hr_payslip_release ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false,ADD COLUMN publication_snapshot jsonb,ADD COLUMN publication_hash text,
 ADD CONSTRAINT payslip_publication_evidence CHECK(NOT workflow_managed OR(publication_snapshot IS NOT NULL AND jsonb_typeof(publication_snapshot)='object' AND publication_hash IS NOT NULL AND publication_hash ~ '^[a-f0-9]{64}$'));
CREATE FUNCTION hr_payslip_publication(t text,c text,rid text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('version','payslip_v1','company',jsonb_build_object('id',o.id,'code',o.code,'name',o.name),
 'employee',jsonb_build_object('id',e.id,'number',e.employee_number,'name',concat_ws(' ',e.first_name,e.middle_name,e.last_name)),
 'period',jsonb_build_object('id',p.id,'month',p.month::text,'run_number',p.run_number),
 'result',jsonb_build_object('id',r.id,'currency',r.currency_code,'gross',r.gross::text,'deductions',r.deductions::text,'net',r.net::text,'employer_contributions',r.employer_contributions::text,'calculation_hash',r.calculation_hash),
 'accrual',CASE WHEN j.id IS NULL THEN NULL ELSE jsonb_build_object('id',j.id,'journal_id',j.external_journal_id,'entry_number',j.external_entry_number) END,
 'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('code',i.component_code,'name',i.component_name,'kind',i.kind,'amount',i.amount::text,'position',i.position) ORDER BY i.position) FROM hr_payroll_result_item i WHERE i.tenant_id=r.tenant_id AND i.result_id=r.id),'[]'::jsonb))
 FROM hr_payroll_result r JOIN hr_payroll_period p ON p.tenant_id=r.tenant_id AND p.company_id=r.company_id AND p.id=r.period_id AND p.run_number=r.run_number
 JOIN employee e ON e.tenant_id=r.tenant_id AND e.id=r.employee_id
 JOIN organization_unit o ON o.tenant_id=r.tenant_id AND o.id=r.company_id
 LEFT JOIN hr_payroll_journal_proposal j ON j.tenant_id=r.tenant_id AND j.company_id=r.company_id AND j.period_id=r.period_id AND j.run_number=r.run_number AND j.workflow_managed AND j.state='posted'
 LEFT JOIN journal_entry je ON je.tenant_id=j.tenant_id AND je.company_id=j.company_id AND je.id=j.external_journal_id AND je.status='posted'
 WHERE r.tenant_id=t AND r.company_id=c AND r.id=rid AND t=current_setting('nexora.tenant_id',true) AND((p.workflow_managed AND p.state IN('posted','paid','closed') AND je.status='posted') OR EXISTS(SELECT 1 FROM hr_payslip_release legacy WHERE legacy.tenant_id=r.tenant_id AND legacy.company_id=r.company_id AND legacy.payroll_result_id=r.id AND NOT legacy.workflow_managed))
$$;
CREATE FUNCTION guard_governed_payslip_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p hr_payroll_period%ROWTYPE;doc jsonb;
BEGIN
 IF NOT NEW.workflow_managed THEN RETURN NEW;END IF;
 SELECT * INTO p FROM hr_payroll_period WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.period_id;
 doc:=hr_payslip_publication(NEW.tenant_id,NEW.company_id,NEW.payroll_result_id);
 IF NOT p.workflow_managed OR doc IS NULL OR doc->'accrual'='null'::jsonb OR NEW.publication_snapshot IS DISTINCT FROM doc OR NEW.publication_hash IS NULL OR NEW.released_by IN(p.created_by,p.calculated_by,p.submitted_by) OR EXISTS(SELECT 1 FROM employee_user_binding b JOIN hr_payroll_result r ON r.tenant_id=b.tenant_id AND r.employee_id=b.employee_id WHERE r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id AND r.period_id=p.id AND r.run_number=p.run_number AND b.user_id=NEW.released_by AND b.ended_at IS NULL) THEN RAISE EXCEPTION 'Payslip publication requires exact posted results and an independent releaser';END IF;
 IF (doc->'result'->>'gross')::numeric-(doc->'result'->>'deductions')::numeric<>(doc->'result'->>'net')::numeric OR (doc->'result'->>'gross')::numeric<>(SELECT coalesce(sum((x->>'amount')::numeric),0) FROM jsonb_array_elements(doc->'lines') x WHERE x->>'kind'='earning') OR(doc->'result'->>'deductions')::numeric<>(SELECT coalesce(sum((x->>'amount')::numeric),0) FROM jsonb_array_elements(doc->'lines') x WHERE x->>'kind'='deduction') OR(doc->'result'->>'employer_contributions')::numeric<>(SELECT coalesce(sum((x->>'amount')::numeric),0) FROM jsonb_array_elements(doc->'lines') x WHERE x->>'kind'='employer_contribution') THEN RAISE EXCEPTION 'Payslip totals must reconcile to exact immutable result lines';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER governed_payslip_publication BEFORE INSERT ON hr_payslip_release FOR EACH ROW EXECUTE FUNCTION guard_governed_payslip_publication();
ALTER TABLE hr_payroll_workspace_event DROP CONSTRAINT hr_payroll_workspace_event_record_type_check;
ALTER TABLE hr_payroll_workspace_event ADD CONSTRAINT hr_payroll_workspace_event_record_type_check CHECK(record_type IN('component','structure','salary','adjustment','loan','run','policy','ot_policy','ot_arrangement','localization','journal','payment','payslip'));
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',77,'governed_payslip_publication');
