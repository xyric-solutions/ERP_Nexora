-- HR146: A governed Payroll policy may be edited or deleted only while no
-- payroll period uses it. Once a period references the policy it stays
-- immutable, as before. The API performs the same check (inside the company
-- payroll lock) and records each change in the payroll workspace audit trail;
-- the foreign key from hr_payroll_period still restricts deletion.
--
-- Reversible: restore the previous body (raise for every governed row).

CREATE OR REPLACE FUNCTION public.protect_governed_payroll_policy()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
IF OLD.workflow_managed AND EXISTS (
  SELECT 1 FROM hr_payroll_period period
   WHERE period.tenant_id=OLD.tenant_id AND period.company_id=OLD.company_id AND period.policy_id=OLD.id
) THEN
  RAISE EXCEPTION 'Governed Payroll policy is used by a payroll period and is immutable; create a new governed policy version';
END IF;
RETURN COALESCE(NEW,OLD); END $function$;

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',146,'payroll_policy_unused_changes');
