import { decimal, decimalText, budgetPoolMatches, type BudgetLineInput } from "@nexora/contracts";
import { budgetReject, type BudgetClient } from "./transaction.js";
import { budgetDimensionsSql } from "./reporting.js";
export async function budgetForecastSummary(
  c: BudgetClient,
  t: string,
  company: string,
  version: string,
  cutoff: string,
) {
  const actual = (
    await c.query<{ spend: string; revenue: string }>(
      `select coalesce(sum(case when a.type in ('expense','asset') then l.base_debit-l.base_credit else 0 end),0)::text as spend,
  coalesce(sum(case when a.type='revenue' then l.base_credit-l.base_debit else 0 end),0)::text as revenue
  from journal_entry j join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id join account a on a.tenant_id=l.tenant_id and a.company_id=j.company_id and a.id=l.account_id
  where j.tenant_id=$1 and j.company_id=$2 and j.status in ('posted','reversed') and j.posting_date<=$4::date
  and j.posting_date>=(select f.period_start from budget_version v join budget_plan p on p.tenant_id=v.tenant_id and p.company_id=v.company_id and p.id=v.plan_id join fiscal_calendar f on f.tenant_id=p.tenant_id and f.id=p.fiscal_calendar_id where v.tenant_id=$1 and v.company_id=$2 and v.id=$3)
  and exists(select 1 from budget_line b where b.tenant_id=$1 and b.company_id=$2 and b.version_id=$3 and b.account_id=l.account_id and ${budgetDimensionsSql("l")} @> b.dimensions)`,
      [t, company, version, cutoff],
    )
  ).rows[0]!;
  const future = (
    await c.query<{ spend: string; revenue: string }>(
      `select coalesce(sum(case when a.type in ('expense','asset') then b.amount else 0 end),0)::text as spend,
  coalesce(sum(case when a.type='revenue' then b.amount else 0 end),0)::text as revenue from budget_line l join budget b on b.tenant_id=l.tenant_id and b.company_id=l.company_id and b.managed_line_id=l.id
  join account a on a.tenant_id=l.tenant_id and a.company_id=l.company_id and a.id=l.account_id join financial_period p on p.tenant_id=b.tenant_id and p.company_id=b.company_id and p.id=b.period_id
  where l.tenant_id=$1 and l.company_id=$2 and l.version_id=$3 and p.period_start>$4::date`,
      [t, company, version, cutoff],
    )
  ).rows[0]!;
  return {
    cutoff,
    actual: actual.spend,
    remaining: future.spend,
    eac: decimalText(decimal(actual.spend, 8, true) + decimal(future.spend, 8, true), 8),
    revenue_actual: actual.revenue,
    revenue_remaining: future.revenue,
    revenue_eac: decimalText(decimal(actual.revenue, 8, true) + decimal(future.revenue, 8, true), 8),
  };
}

/** Freeze actual periods from GL when a forecast draft is saved, never from input figures. */
export async function freezeBudgetForecast(
  c: BudgetClient,
  t: string,
  company: string,
  cutoff: string | null,
  lines: BudgetLineInput[],
): Promise<BudgetLineInput[]> {
  if (!cutoff) budgetReject("Forecasts require an actuals cutoff at a configured fiscal period end.");
  const periods = (
    await c.query<{ id: string; end: string }>(
      "select id,period_end::text as end from financial_period where tenant_id=$1 and company_id=$2",
      [t, company],
    )
  ).rows;
  if (!periods.some((p) => p.end === cutoff))
    budgetReject("Use a configured fiscal period end as the forecast cutoff.");
  const actual = (
    await c.query<{ account_id: string; period_id: string; dimensions: Record<string, string>; amount: string }>(
      `select l.account_id,j.period_id,${budgetDimensionsSql("l")} as dimensions,
  sum(case when a.type in ('revenue','liability','equity') then l.base_credit-l.base_debit else l.base_debit-l.base_credit end)::text as amount
  from journal_entry j join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id join account a on a.tenant_id=l.tenant_id and a.company_id=j.company_id and a.id=l.account_id
  where j.tenant_id=$1 and j.company_id=$2 and j.status in ('posted','reversed') and j.posting_date<=$3::date and l.account_id=any($4::text[])
  group by l.account_id,j.period_id,${budgetDimensionsSql("l")} limit 20001`,
      [t, company, cutoff, [...new Set(lines.map((l) => l.account_id))]],
    )
  ).rows;
  if (actual.length > 20000) budgetReject("Narrow the forecast actuals source.");
  return lines.map((line) => ({
    ...line,
    allocations: line.allocations.map((allocation) => {
      if (!periods.some((p) => p.id === allocation.period_id && p.end <= cutoff)) return allocation;
      const amount = actual
        .filter(
          (a) =>
            a.account_id === line.account_id &&
            a.period_id === allocation.period_id &&
            budgetPoolMatches(line.dimensions, a.dimensions),
        )
        .reduce((sum, a) => sum + decimal(a.amount, 8, true), 0n);
      if (amount < 0n)
        budgetReject(
          "A net credit actual cannot be stored as a positive forecast allocation. Use future-only forecast periods; actuals remain visible in GL reports.",
          "BUDGET_NEGATIVE_FORECAST_ACTUAL",
        );
      return { ...allocation, amount: decimalText(amount, 8) };
    }),
  }));
}
