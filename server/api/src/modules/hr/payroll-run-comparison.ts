import type { HrPayrollRunComparison, HrPayrollRunComparisonQuery } from "@nexora/contracts";
import type { AttendanceCompletionDependencies } from "./attendance-completion.js";
import { attendanceHash } from "./attendance-completion.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import { ExactPayrollAmount as Money } from "./payroll-calculation.js";
import { HrApiError, type HrActorContext } from "./source-repository.js";

type Dependencies = Pick<AttendanceCompletionDependencies, "read" | "company">;
type Result = NonNullable<HrPayrollRunComparison["items"][number]["after"]>;
type Amounts = HrPayrollRunComparison["delta"];
type Source = Result & { employee_id: string; employee_number: string; display_name: string; run_number: number };
const amountKeys = ["gross", "deductions", "net", "employer_contributions"] as const;
const conflict = (message: string): never => {
  throw new HrApiError(409, "HR_PAYROLL_COMPARISON_REVIEW_REQUIRED", message);
};
function totals(rows: Result[]): Amounts {
  return Object.fromEntries(
    amountKeys.map((k) => [k, rows.reduce((sum, r) => sum.add(Money.parse(r[k])), Money.parse("0")).decimal(4)]),
  ) as Amounts;
}
function difference(after: Amounts | null, before: Amounts | null): Amounts {
  return Object.fromEntries(
    amountKeys.map((k) => [
      k,
      Money.parse(after?.[k] ?? "0")
        .subtract(Money.parse(before?.[k] ?? "0"))
        .decimal(4),
    ]),
  ) as Amounts;
}
function result(r: Source | undefined): Result | null {
  if (!r) return null;
  return {
    id: r.id,
    calculation_hash: r.calculation_hash,
    attendance_source_hash: r.attendance_source_hash,
    currency_code: r.currency_code,
    gross: r.gross,
    deductions: r.deductions,
    net: r.net,
    employer_contributions: r.employer_contributions,
  };
}

/** Compares original immutable calculations, never later settlement supplements or bank/payment facts. */
export class PayrollRunComparison {
  constructor(private readonly d: Dependencies) {}
  async read(c: HrActorContext, q: HrPayrollRunComparisonQuery): Promise<HrPayrollRunComparison> {
    return this.d.read(c, "hr.payroll.period.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      await requireHrCompanyPermission(client, c, q.company_id, "hr.payroll.period.read");
      await requireHrCompanyPermission(client, c, q.company_id, "hr.payroll.result.read");
      const period = (
        await client.query<{ id: string; version: number; run_number: number; currency_code: string }>(
          `select p.id,p.version,p.run_number,pol.currency_code from hr_payroll_period p join hr_payroll_policy pol on pol.tenant_id=p.tenant_id and pol.company_id=p.company_id and pol.id=p.policy_id where p.tenant_id=$1 and p.company_id=$2 and p.month=$3::date`,
          [c.tenantId, q.company_id, q.month],
        )
      ).rows[0];
      if (!period || period.run_number !== q.expected_run_number)
        return conflict("The current Payroll run changed. Refresh Payroll results before comparing or deciding.");
      const runs = (
        await client.query<HrPayrollRunComparison["runs"][number]>(
          `select run_number,count(*)::int as employee_count,max(created_at)::text as calculated_at from hr_payroll_result where tenant_id=$1 and company_id=$2 and period_id=$3 and run_number<=$4 group by run_number order by run_number desc limit 50`,
          [c.tenantId, q.company_id, period.id, period.run_number],
        )
      ).rows;
      const baseline = q.baseline_run_number ?? runs.find((r) => r.run_number < period.run_number)?.run_number ?? null;
      if (baseline !== null && baseline >= period.run_number)
        return conflict("Choose an earlier retained run from this company and Payroll month.");
      const rows = (
        await client.query<Source>(
          `select r.id,r.run_number,r.employee_id,e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as display_name,r.currency_code,r.gross::text,r.deductions::text,r.net::text,r.employer_contributions::text,r.calculation_hash,r.attendance_source_hash from hr_payroll_result r join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=any($4::int[]) order by r.run_number,r.employee_id collate "C" limit 1001`,
          [c.tenantId, q.company_id, period.id, [period.run_number, ...(baseline === null ? [] : [baseline])]],
        )
      ).rows;
      if (rows.length > 1000) return conflict("This comparison exceeds the supported 500 employees per run.");
      const current = rows.filter((r) => r.run_number === period.run_number),
        previous = rows.filter((r) => r.run_number === baseline);
      if (!current.length || current.length > 500 || previous.length > 500 || (baseline !== null && !previous.length))
        return conflict(
          "Both selected runs must have complete retained employee results within the supported comparison limit.",
        );
      if (rows.some((r) => r.currency_code !== period.currency_code))
        return conflict(
          "Retained results do not share the Payroll policy currency. Compare only reconciled same-currency runs.",
        );
      const byCurrent = new Map(current.map((r) => [r.employee_id, r])),
        byPrevious = new Map(previous.map((r) => [r.employee_id, r]));
      const items: HrPayrollRunComparison["items"] = [...new Set(rows.map((r) => r.employee_id))]
        .map((employeeId): HrPayrollRunComparison["items"][number] => {
          const next = byCurrent.get(employeeId),
            prior = byPrevious.get(employeeId),
            label = next ?? prior!;
          const after = result(next),
            before = result(prior);
          const evidenceChanged = !!after && !!before && after.calculation_hash !== before.calculation_hash;
          const attendanceChanged =
            !!after && !!before && after.attendance_source_hash !== before.attendance_source_hash;
          const amountsChanged =
            !!after && !!before && amountKeys.some((k) => Money.parse(after[k]).compare(Money.parse(before[k])) !== 0);
          return {
            employee_id: employeeId,
            employee_number: label.employee_number,
            display_name: label.display_name,
            change: !before
              ? "added"
              : !after
                ? "removed"
                : amountsChanged
                  ? "amount_changed"
                  : evidenceChanged || attendanceChanged
                    ? "evidence_changed"
                    : "unchanged",
            evidence_changed: evidenceChanged,
            attendance_changed: attendanceChanged,
            before,
            after,
            delta: difference(after, before),
          };
        })
        .sort((a, b) =>
          a.employee_number < b.employee_number
            ? -1
            : a.employee_number > b.employee_number
              ? 1
              : a.employee_id < b.employee_id
                ? -1
                : 1,
        );
      const counts: HrPayrollRunComparison["counts"] = {
        amount_changed: 0,
        evidence_changed: 0,
        added: 0,
        removed: 0,
        unchanged: 0,
      };
      for (const item of items) counts[item.change]++;
      const visible = items.filter(
        (i) => q.filter === "all" || (q.filter === "changed" ? i.change !== "unchanged" : i.change === q.filter),
      );
      const currentTotals = totals(current),
        baselineTotals = baseline === null ? null : totals(previous);
      return {
        company_id: q.company_id,
        month: q.month,
        period_id: period.id,
        period_version: period.version,
        current_run_number: period.run_number,
        baseline_run_number: baseline,
        currency_code: period.currency_code,
        runs,
        counts,
        current_totals: currentTotals,
        baseline_totals: baselineTotals,
        delta: difference(currentTotals, baselineTotals),
        source_hash: attendanceHash({
          period: period.id,
          version: period.version,
          baseline,
          results: rows.map((r) => [r.id, r.calculation_hash, r.attendance_source_hash]),
        }),
        items: visible.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 25)),
        total: visible.length,
        limit: q.limit ?? 25,
        offset: q.offset ?? 0,
      };
    });
  }
}
