import type { PoolClient } from "pg";
import type { HrActorContext } from "./source-repository.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import type { HrSettlementSalaryBasis, HrSettlementSalaryEvidence } from "@nexora/contracts";
export async function requireSettlementSalaryRead(client: PoolClient, c: HrActorContext, company: string) {
  for (const key of ["hr.payroll.setup.read", "hr.payroll.salary.read"])
    await requireHrCompanyPermission(client, c, company, key);
}
/** Payroll stores four-decimal currency values. Convert exactly; never round a salary basis. */
export function settlementSalaryMinor(amount: string, scale: number): string {
  if (!/^\d{1,16}(\.\d{1,4})?$/.test(amount) || !Number.isInteger(scale) || scale < 0 || scale > 4)
    throw new RangeError("Unsupported salary amount or currency precision.");
  const [whole, fraction = ""] = amount.split("."),
    units = BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, "0")),
    factor = 10n ** BigInt(4 - scale);
  if (units % factor !== 0n) throw new RangeError("The salary component exceeds the rule currency precision.");
  const minor = units / factor;
  if (minor > 999999999999999n) throw new RangeError("The salary component exceeds the supported amount.");
  return minor.toString();
}
export async function readSettlementSalaryBasis(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  employee: string,
  date: string,
  currency: string,
  scale: number,
  basis: HrSettlementSalaryBasis,
) {
  await requireSettlementSalaryRead(client, c, company);
  const assignments = (
    await client.query(
      "select id,version,state,workflow_managed,currency_code,compensation_type,payment_basis,effective_from::text,effective_to::text,created_by,submitted_by,approved_by from hr_salary_assignment where tenant_id=$1 and company_id=$2 and employee_id=$3 and state in('approved','effective') and effective_from<=$4::date and(effective_to is null or effective_to>=$4::date) order by id",
      [c.tenantId, company, employee, date],
    )
  ).rows;
  const pending = (
    await client.query(
      "select id,version,effective_from::text,effective_to::text from hr_salary_assignment where tenant_id=$1 and company_id=$2 and employee_id=$3 and state='submitted' and effective_from<=$4::date and(effective_to is null or effective_to>=$4::date) order by id",
      [c.tenantId, company, employee, date],
    )
  ).rows;
  const assignment = assignments.length === 1 ? assignments[0] : null,
    blockers: string[] = [];
  if (
    !assignment?.workflow_managed ||
    assignment.currency_code !== currency ||
    assignment.compensation_type !== "fixed" ||
    assignment.payment_basis !== "monthly"
  )
    blockers.push(
      "One independently approved, governed fixed monthly salary in the rule currency must cover the exit date.",
    );
  if (pending.length)
    blockers.push(
      "Resolve submitted salary changes covering the exit date before calculating this settlement entitlement.",
    );
  const components = assignment
    ? (
        await client.query(
          "select s.component_id as id,c.name,c.kind,c.status,c.method as component_method,s.method,s.amount::text,s.formula,s.currency_code,s.evidence_hash from hr_salary_assignment_component s join hr_pay_component c on c.tenant_id=s.tenant_id and c.company_id=s.company_id and c.id=s.component_id where s.tenant_id=$1 and s.company_id=$2 and s.assignment_id=$3 and s.component_id=any($4::text[]) order by s.component_id",
          [c.tenantId, company, assignment.id, basis.component_ids],
        )
      ).rows
    : [];
  if (
    components.length !== basis.component_ids.length ||
    components.some(
      (x) =>
        x.kind !== "earning" ||
        x.status !== "active" ||
        x.component_method !== "fixed" ||
        x.method !== "fixed" ||
        x.formula !== null ||
        x.currency_code !== currency,
    )
  )
    blockers.push(
      "Every selected salary component must be an active fixed earning captured by the approved salary. Formula components are not evaluated here.",
    );
  let salary: HrSettlementSalaryEvidence | null = null;
  if (!blockers.length && assignment) {
    try {
      const values = components.map((x) => ({
          id: x.id as string,
          name: x.name as string,
          amount_minor: settlementSalaryMinor(x.amount, scale),
        })),
        sum = values.reduce((n, x) => n + BigInt(x.amount_minor), 0n);
      if (sum <= 0n || sum > 999999999999999n) throw new RangeError();
      salary = {
        assignment_id: assignment.id as string,
        assignment_version: assignment.version as number,
        effective_from: assignment.effective_from as string,
        effective_to: assignment.effective_to as string | null,
        basis_minor: sum.toString(),
        multiplier: basis.multiplier,
        divisor: basis.divisor,
        components: values,
      };
    } catch {
      blockers.push(
        "Selected salary amounts must be positive in total, within supported limits and exactly representable in the currency.",
      );
    }
  }
  return { salary, blockers, source: { assignments, components, pending } };
}
