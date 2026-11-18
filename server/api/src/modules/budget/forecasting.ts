import {
  budgetGenerateSchema,
  budgetVersionInputSchema,
  budgetDetailSchema,
  decimal,
  decimalText,
  divideRounded,
  budgetPoolMatches,
  type BudgetGenerate,
  type BudgetLineInput,
} from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { resolveCompanyBaseCurrency } from "../finance/currencies/company-authority.js";
import { budgetReject } from "./transaction.js";
import { budgetDimensionsSql } from "./reporting.js";
import type { SourceBudgetRepository } from "./source-repository.js";

export class BudgetForecasting {
  constructor(readonly repository: SourceBudgetRepository) {}
  generate(ctx: BankingActorContext, raw: BudgetGenerate, key: string, correlation: string) {
    const input = budgetGenerateSchema.parse(raw),
      permission = input.kind === "revision" ? "budget.plan.create" : "budget.forecast.create";
    return this.repository.transactions.mutate(
      ctx,
      input.company_id,
      permission,
      key,
      { op: "generate", input },
      async (c) => {
        const source = await this.repository.read(c, ctx.tenantId, input.company_id, input.source_version_id);
        if (!source.lines.length) budgetReject("The source version has no allocations.");
        const base = await resolveCompanyBaseCurrency(c, ctx.tenantId, input.company_id, false),
          factor = 10n ** BigInt(8 - base.decimalPlaces);
        const growth = decimal(input.growth_percent, 4, true);
        if (growth < -1000000n) budgetReject("A forecast cannot reduce allocations below zero.");
        const scale = (value: bigint) => divideRounded(value * (1000000n + growth), 1000000n);
        const round = (value: bigint) => decimalText(divideRounded(value, factor) * factor, 8);
        let lines: BudgetLineInput[];
        if (input.method === "copy") {
          lines = source.lines.map(({ account_id, dimensions, notes, allocations }) => ({
            account_id,
            dimensions,
            notes,
            allocations: allocations.map((a) => ({
              period_id: a.period_id,
              amount: round(scale(decimal(a.amount, 8))),
            })),
          }));
        } else {
          if (
            !input.history_from ||
            !input.history_to ||
            input.history_from > input.history_to ||
            input.history_to > input.cutoff
          )
            budgetReject("Historical forecasting requires a valid history range ending on or before the cutoff.");
          if (
            !(
              await c.query(
                "select 1 from financial_period where tenant_id=$1 and company_id=$2 and period_end=$3::date",
                [ctx.tenantId, input.company_id, input.cutoff],
              )
            ).rowCount
          )
            budgetReject("Use a configured fiscal period end as the actuals cutoff.");
          const periods = (
            await c.query<{ id: string; period_number: number; period_start: string; period_end: string }>(
              `select id,period_number,period_start::text,period_end::text from financial_period
     where tenant_id=$1 and company_id=$2 and (($6='rolling' and period_start>$3::date) or ($6='historical' and fiscal_calendar_id=$4)) order by period_start limit $5`,
              [
                ctx.tenantId,
                input.company_id,
                input.cutoff,
                source.record.fiscal_calendar_id,
                input.method === "rolling" ? input.horizon : 12,
                input.method,
              ],
            )
          ).rows;
          if (!periods.length || (input.method === "rolling" && periods.length !== input.horizon))
            budgetReject("Configure all periods in the requested forecast horizon.");
          for (let i = 1; i < periods.length; i++) {
            const next = new Date(`${periods[i - 1]!.period_end}T00:00:00Z`);
            next.setUTCDate(next.getUTCDate() + 1);
            if (next.toISOString().slice(0, 10) !== periods[i]!.period_start)
              budgetReject("Forecast periods must form a consecutive, non-overlapping horizon.");
          }
          const history = (
            await c.query<{
              account_id: string;
              dimensions: Record<string, string>;
              period_id: string;
              period_number: number;
              amount: string;
            }>(
              `select a.id as account_id,${budgetDimensionsSql("l")} as dimensions,p.id as period_id,p.period_number,
     sum(case when a.type in ('revenue','liability','equity') then l.base_credit-l.base_debit else l.base_debit-l.base_credit end)::text as amount
     from journal_entry j join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id join account a on a.tenant_id=l.tenant_id and a.company_id=j.company_id and a.id=l.account_id
     join financial_period p on p.tenant_id=j.tenant_id and p.company_id=j.company_id and p.id=j.period_id
     where j.tenant_id=$1 and j.company_id=$2 and j.status in ('posted','reversed') and j.posting_date between $3::date and $4::date
     group by a.id,${budgetDimensionsSql("l")},p.id,p.period_number limit 20001`,
              [ctx.tenantId, input.company_id, input.history_from, input.cutoff],
            )
          ).rows;
          if (history.length > 20000) budgetReject("Narrow the historical forecast source range.");
          const historyPeriods = (
            await c.query<{ id: string; period_number: number; period_start: string; period_end: string }>(
              "select id,period_number,period_start::text,period_end::text from financial_period where tenant_id=$1 and company_id=$2 and period_start>=$3::date and period_end<=$4::date order by period_start",
              [ctx.tenantId, input.company_id, input.history_from, input.history_to],
            )
          ).rows;
          if (!historyPeriods.length) budgetReject("Select at least one complete historical period.");
          lines = source.lines.map((line) => {
            const entries = history.filter(
              (h) => h.account_id === line.account_id && budgetPoolMatches(line.dimensions, h.dimensions),
            );
            if (!entries.some((h) => historyPeriods.some((p) => p.id === h.period_id)))
              budgetReject(`No posted history exists for ${line.account_code}; enter a manual forecast instead.`);
            return {
              account_id: line.account_id,
              dimensions: line.dimensions,
              notes: line.notes,
              allocations: periods.map((period) => {
                if (period.period_end <= input.cutoff) {
                  const actual = entries
                    .filter((h) => h.period_id === period.id)
                    .reduce((sum, h) => sum + decimal(h.amount, 8, true), 0n);
                  if (actual < 0n) budgetReject("A negative actual requires explicit manual forecast treatment.");
                  return { period_id: period.id, amount: round(actual) };
                }
                const seasonal = historyPeriods.filter((h) => h.period_number === period.period_number),
                  sample = seasonal.length ? seasonal : historyPeriods;
                const total = entries
                  .filter((h) => sample.some((p) => p.id === h.period_id))
                  .reduce((sum, h) => sum + decimal(h.amount, 8, true), 0n);
                const estimate = scale(divideRounded(total, BigInt(sample.length)));
                if (estimate < 0n) budgetReject("A negative historical result requires a manual forecast adjustment.");
                return { period_id: period.id, amount: round(estimate) };
              }),
            };
          });
        }
        const draft = budgetVersionInputSchema.parse({
          company_id: input.company_id,
          plan_id: source.record.plan_id,
          name: input.name,
          kind: input.kind,
          parent_id: source.record.id,
          cutoff: input.kind === "forecast" ? input.cutoff : null,
          assumptions: {
            case: input.case,
            method: input.method,
            growth_percent: input.growth_percent,
            ...(input.history_from ? { history_from: input.history_from } : {}),
            ...(input.history_to ? { history_to: input.history_to } : {}),
            horizon: input.horizon,
            source_version_id: source.record.id,
            source_cutoff: input.cutoff,
            algorithm: "posted-fiscal-seasonal-mean-v1",
          },
          lines,
          reason: input.reason,
        });
        return this.repository.insertVersion(c, ctx, draft, correlation);
      },
      (v) => budgetDetailSchema.parse(v),
    );
  }
}
