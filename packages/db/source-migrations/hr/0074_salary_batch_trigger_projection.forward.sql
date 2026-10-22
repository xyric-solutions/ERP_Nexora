CREATE OR REPLACE FUNCTION reconcile_governed_salary_batch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b hr_payroll_payment_batch%ROWTYPE;bid text;
BEGIN
 bid:=CASE WHEN TG_TABLE_NAME='hr_payroll_payment_batch' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'batch_id' END;
 SELECT * INTO b FROM hr_payroll_payment_batch WHERE tenant_id=NEW.tenant_id AND id=bid;
 IF NOT b.workflow_managed OR b.state='cancelled' THEN RETURN NULL;END IF;
 IF b.payroll_result_count<=0 OR b.payroll_result_count<>(SELECT count(*) FROM hr_payroll_result WHERE tenant_id=b.tenant_id AND company_id=b.company_id AND period_id=b.period_id AND run_number=b.payroll_run_number AND net>0) OR EXISTS(SELECT r.id,r.employee_id,r.net,r.currency_code FROM hr_payroll_result r WHERE r.tenant_id=b.tenant_id AND r.company_id=b.company_id AND r.period_id=b.period_id AND r.run_number=b.payroll_run_number AND r.net>0 EXCEPT ALL SELECT x.result_id,x.employee_id,x.amount,x.currency_code FROM hr_payroll_payment x WHERE x.tenant_id=b.tenant_id AND x.batch_id=b.id) OR EXISTS(SELECT x.result_id,x.employee_id,x.amount,x.currency_code FROM hr_payroll_payment x WHERE x.tenant_id=b.tenant_id AND x.batch_id=b.id EXCEPT ALL SELECT r.id,r.employee_id,r.net,r.currency_code FROM hr_payroll_result r WHERE r.tenant_id=b.tenant_id AND r.company_id=b.company_id AND r.period_id=b.period_id AND r.run_number=b.payroll_run_number AND r.net>0) THEN RAISE EXCEPTION 'Salary payment population must reconcile exactly';END IF;
 IF EXISTS(SELECT 1 FROM hr_payroll_payment x LEFT JOIN hr_payroll_payment_settlement s ON s.tenant_id=x.tenant_id AND s.payment_id=x.id WHERE x.tenant_id=b.tenant_id AND x.batch_id=b.id AND((x.state='confirmed') IS DISTINCT FROM(s.payment_id IS NOT NULL))) OR(b.state='confirmed') IS DISTINCT FROM(NOT EXISTS(SELECT 1 FROM hr_payroll_payment WHERE tenant_id=b.tenant_id AND batch_id=b.id AND state<>'confirmed')) THEN RAISE EXCEPTION 'Salary batch state must match every bank settlement';END IF;
 RETURN NULL;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',74,'salary_batch_trigger_projection');
