import { z } from "zod";
import { randomUUID } from "node:crypto";
import { budgetSourceControlSchema, budgetSourceDirectorySchema, type BudgetQuery } from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { SourceBudgetRepository } from "./source-repository.js";
import { BudgetGovernance } from "./governance.js";
import { BudgetReporting, loadBudgetPolicy } from "./reporting.js";
import { BudgetForecasting } from "./forecasting.js";
import { BudgetFiles } from "./files.js";
import { budgetHash, budgetReject } from "./transaction.js";
import { reconcileBudgetPurchases } from "./accounting-bridge.js";

export class BudgetService {
  sources(ctx: BankingActorContext, q: BudgetQuery) {
    return this.records.transactions.run(ctx, q.company_id, "budget.plan.read", false, async (c) => {
      const values = [ctx.tenantId, q.company_id, q.search];
      const where =
        "tenant_id=$1 and company_id=$2 and kind in ('order','bill') and state in ('submitted','approved') and ($3='' or code ilike '%'||$3||'%' or reference ilike '%'||$3||'%')";
      const items = (
        await c.query(
          `select id,code,kind,state,row_version as version,total_amount::text as amount,currency from procurement_document where ${where} order by document_date desc,id limit $4 offset $5`,
          [...values, q.limit, q.offset],
        )
      ).rows;
      const total = (
        await c.query<{ total: number }>(
          `select count(*)::int as total from procurement_document where ${where}`,
          values,
        )
      ).rows[0]!.total;
      return budgetSourceDirectorySchema.parse({ items, total });
    });
  }
  readonly governance: BudgetGovernance;
  readonly reporting: BudgetReporting;
  readonly forecasting: BudgetForecasting;
  readonly files: BudgetFiles;
  constructor(readonly records: SourceBudgetRepository) {
    this.governance = new BudgetGovernance(records);
    this.reporting = new BudgetReporting(records);
    this.forecasting = new BudgetForecasting(records);
    this.files = new BudgetFiles(records);
  }
  sourceControl(ctx: BankingActorContext, company: string, id: string) {
    return this.records.transactions.run(ctx, company, "budget.plan.read", false, async (c) => {
      const row = (
        await c.query<{ code: string; row_version: number; snapshot: unknown; calendar: string; date: string }>(
          `select d.code,d.row_version,to_jsonb(d) as snapshot,f.fiscal_calendar_id as calendar,current_date::text as date
   from procurement_document d left join financial_period f on f.tenant_id=d.tenant_id and f.company_id=d.company_id and coalesce(d.due_date,d.document_date) between f.period_start and f.period_end
   where d.tenant_id=$1 and d.company_id=$2 and d.id=$3`,
          [ctx.tenantId, company, id],
        )
      ).rows[0];
      if (!row) budgetReject("The purchase source was not found.", "NOT_FOUND", 404);
      const calendars = (
        await c.query<{ fiscal_calendar_id: string }>(
          `select distinct f.fiscal_calendar_id from procurement_document d join financial_period f
         on f.tenant_id=d.tenant_id and f.company_id=d.company_id
         where d.tenant_id=$1 and d.company_id=$2 and d.id=$3 and
          (coalesce(d.due_date,d.document_date) between f.period_start and f.period_end
           or exists(select 1 from jsonb_array_elements(d.lines||coalesce(d.additional_charges,'[]'::jsonb)) l where l->>'budget_period_id'=f.id))
         order by f.fiscal_calendar_id`,
          [ctx.tenantId, company, id],
        )
      ).rows;
      const policies = [];
      for (const calendar of calendars) {
        const policy = await loadBudgetPolicy(c, ctx.tenantId, company, calendar.fiscal_calendar_id, row.date);
        if (policy) policies.push(policy);
      }
      return budgetSourceControlSchema.parse({
        source_document_id: id,
        code: row.code,
        source_version: row.row_version,
        source_hash: budgetHash(row.snapshot),
        policy: policies.find((policy) => policy.enabled && policy.mode === "approval") ?? policies[0] ?? null,
        policies,
      });
    });
  }
  reconcile(ctx: BankingActorContext, company: string, reason: string, key: string) {
    if (reason.trim().length < 3) budgetReject("Record a reconciliation reason.");
    return this.records.transactions.mutate(
      ctx,
      company,
      "budget.policy.configure",
      key,
      { op: "reconcile", reason },
      async (c) => {
        const result = await reconcileBudgetPurchases(c, ctx.tenantId, company, ctx.actor.userId),
          id = randomUUID();
        await c.query(
          "insert into budget_audit(tenant_id,company_id,id,entity,entity_id,record_version,action,actor_id,reason,correlation_id,snapshot) values($1,$2,$3,'budget_reconciliation',$3,1,'reconciled',$4,$5,$6,$7)",
          [ctx.tenantId, company, id, ctx.actor.userId, reason, key, JSON.stringify({ reason, ...result })],
        );
        return result;
      },
      (v) => z.strictObject({ documents: z.number().int(), journals: z.number().int() }).parse(v),
    );
  }
  report(ctx: BankingActorContext, q: BudgetQuery) {
    return this.reporting.report(ctx, q);
  }
}
