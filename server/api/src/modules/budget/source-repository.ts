import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  budgetPlanInputSchema,
  budgetPlanSchema,
  budgetOptionsSchema,
  budgetVersionInputSchema,
  budgetVersionUpdateSchema,
  budgetDetailSchema,
  budgetDirectorySchema,
  budgetVersionSchema,
  budgetModelSchema,
  budgetPolicySchema,
  budgetRequestSchema,
  budgetDimensionKey,
  budgetPoolsOverlap,
  decimal,
  type BudgetQuery,
  type BudgetLineInput,
  type BudgetVersionInput,
  type BudgetVersionUpdate,
  type BudgetPlanInput,
  type BudgetDetail,
} from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { resolveCompanyBaseCurrency } from "../finance/currencies/company-authority.js";
import { companyAuthoritySql } from "../security/company-authority.js";
import { BudgetTransactions, budgetAudit, budgetReject, allocateBudgetCode, type BudgetClient } from "./transaction.js";
import { freezeBudgetForecast, budgetForecastSummary } from "./forecast-actuals.js";

const versionColumns = `v.id,v.company_id,v.plan_id,v.number,v.name,v.kind,v.state,v.version,v.parent_id,v.cutoff::text,v.assumptions,v.approver_id,
 v.created_by,v.updated_by,v.created_at::text,v.updated_at::text,p.name as plan_name,p.code as plan_code,p.fiscal_calendar_id,p.currency,
 coalesce((select sum(b.amount) from budget_line l join budget b on b.tenant_id=l.tenant_id and b.company_id=l.company_id and b.managed_line_id=l.id
 where l.tenant_id=v.tenant_id and l.company_id=v.company_id and l.version_id=v.id),0)::text as total`;
const versionJoin = `from budget_version v join budget_plan p on p.tenant_id=v.tenant_id and p.company_id=v.company_id and p.id=v.plan_id`;
export class SourceBudgetRepository {
  readonly transactions: BudgetTransactions;
  constructor(readonly pool: Pool) {
    this.transactions = new BudgetTransactions(pool);
  }
  options(ctx: BankingActorContext, q: BudgetQuery) {
    return this.transactions.run(ctx, q.company_id, "budget.plan.read", false, async (c) => {
      const t = ctx.tenantId,
        company = q.company_id,
        base = await resolveCompanyBaseCurrency(c, t, company, false);
      const refs = async (sql: string) => (await c.query(sql, [t, company])).rows;
      const accountWhere = `tenant_id=$1 and company_id=$2 and status='active' and not is_header and not reconciliation_required and ($3='' or code ilike '%'||$3||'%' or name ilike '%'||$3||'%')`;
      const accounts = await c.query(
        `select id,code,name,type,required_dimensions from account where ${accountWhere} order by code,id limit $4 offset $5`,
        [t, company, q.search, q.limit, q.offset],
      );
      const accountTotal = (
        await c.query<{ total: number }>(`select count(*)::integer as total from account where ${accountWhere}`, [
          t,
          company,
          q.search,
        ])
      ).rows[0]!.total;
      const permissions = [];
      for (const permission of ctx.actor.permissions.filter((p) => p.startsWith("budget.")))
        if ((await c.query(companyAuthoritySql, [t, ctx.actor.userId, company, permission])).rowCount)
          permissions.push(permission);
      return budgetOptionsSchema.parse({
        currency: base.code,
        decimal_places: base.decimalPlaces,
        permissions,
        accounts: accounts.rows,
        account_total: accountTotal,
        calendars: await refs(
          "select id,year::text as code,'FY '||year::text as name,year,period_start::text as start,period_end::text as end from fiscal_calendar where tenant_id=$1 and company_id=$2 and status='active' order by period_start desc limit 100",
        ),
        periods: await refs(
          "select id,fiscal_calendar_id,period_number as number,period_start::text as start,period_end::text as end,status from financial_period where tenant_id=$1 and company_id=$2 order by period_start,id limit 1200",
        ),
        departments: await refs(
          "select id,code,name from organization_unit where tenant_id=$1 and type='department' and status='active' and organization_unit_is_within_company($1,id,$2) order by code limit 1000",
        ),
        branches: await refs(
          "select id,code,name from organization_unit where tenant_id=$1 and type='branch' and status='active' and organization_unit_is_within_company($1,id,$2) order by code limit 1000",
        ),
        projects: await refs(
          "select id,code,name from erp_project where tenant_id=$1 and company_id=$2 and status='active' order by code limit 1000",
        ),
        cost_centres: await refs(
          "select id,code,name from hr_master_record where tenant_id=$1 and company_id=$2 and master_type='cost_center' and status='active' order by code limit 1000",
        ),
        approvers: (
          await c.query(
            `select u.id,coalesce(nullif(u.display_name,''),u.id) as name from security_user_account u where u.tenant_id=$1 and u.status='active' and u.archived_at is null
    and exists(select 1 from security_user_company_access a where a.tenant_id=u.tenant_id and a.user_id=u.id and a.company_id=$2 and a.revoked_at is null)
    and bank_has_live_permission($1,$2,u.id,'budget.plan.approve') order by u.display_name,u.id limit 1000`,
            [t, company],
          )
        ).rows,
      });
    });
  }
  createPlan(ctx: BankingActorContext, raw: BudgetPlanInput, key: string, correlation: string) {
    const input = budgetPlanInputSchema.parse(raw);
    return this.transactions.mutate(
      ctx,
      input.company_id,
      "budget.plan.create",
      key,
      { op: "plan.create", input },
      async (c) => {
        const calendar = (
          await c.query(
            "select 1 from fiscal_calendar where tenant_id=$1 and company_id=$2 and id=$3 and status='active' for share",
            [ctx.tenantId, input.company_id, input.fiscal_calendar_id],
          )
        ).rowCount;
        if (!calendar) budgetReject("Select an active fiscal calendar in this company.");
        const base = await resolveCompanyBaseCurrency(c, ctx.tenantId, input.company_id);
        const id = randomUUID(),
          code = await allocateBudgetCode(c, ctx.tenantId, input.company_id, "BGT");
        await c.query(
          "insert into budget_plan(tenant_id,company_id,id,code,name,fiscal_calendar_id,currency,owner_id,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$8,$8)",
          [ctx.tenantId, input.company_id, id, code, input.name, input.fiscal_calendar_id, base.code, ctx.actor.userId],
        );
        await budgetAudit(c, ctx, input.company_id, "budget_plan", id, "created", input.reason, correlation);
        return (
          await c.query(
            "select id,company_id,code,name,fiscal_calendar_id,currency,owner_id,version from budget_plan where tenant_id=$1 and company_id=$2 and id=$3",
            [ctx.tenantId, input.company_id, id],
          )
        ).rows[0];
      },
      (v) => budgetPlanSchema.parse(v),
    );
  }
  async read(c: BudgetClient, t: string, company: string, id: string): Promise<BudgetDetail> {
    const row = (
      await c.query(`select ${versionColumns} ${versionJoin} where v.tenant_id=$1 and v.company_id=$2 and v.id=$3`, [
        t,
        company,
        id,
      ])
    ).rows[0];
    if (!row) budgetReject("Budget version was not found in this company.", "NOT_FOUND", 404);
    const lines = (
      await c.query(
        `select l.id,l.account_id,l.dimensions,l.notes,a.code as account_code,a.name as account_name,a.type as account_type,
   jsonb_agg(jsonb_build_object('period_id',b.period_id,'amount',b.amount::text) order by f.period_start) as allocations
   from budget_line l join account a on a.tenant_id=l.tenant_id and a.company_id=l.company_id and a.id=l.account_id
   join budget b on b.tenant_id=l.tenant_id and b.company_id=l.company_id and b.managed_line_id=l.id
   join financial_period f on f.tenant_id=b.tenant_id and f.company_id=b.company_id and f.id=b.period_id
   where l.tenant_id=$1 and l.company_id=$2 and l.version_id=$3 group by l.id,l.account_id,l.dimensions,l.notes,a.code,a.name,a.type order by a.code,l.id`,
        [t, company, id],
      )
    ).rows;
    return budgetDetailSchema.parse({
      comments: (
        await c.query(
          "select id,account_id,period_id,comment,actor_id,occurred_at::text from budget_comment where tenant_id=$1 and company_id=$2 and version_id=$3 order by occurred_at desc,id limit 1000",
          [t, company, id],
        )
      ).rows,
      forecast_summary:
        row.kind === "forecast" && row.cutoff ? await budgetForecastSummary(c, t, company, id, row.cutoff) : null,
      record: row,
      lines,
      history: (
        await c.query(
          "select id,entity,entity_id,record_version,action,actor_id,reason,occurred_at::text from budget_audit where tenant_id=$1 and company_id=$2 and entity_id=$3 order by record_version desc limit 1000",
          [t, company, id],
        )
      ).rows,
      approvals: (
        await c.query(
          `select a.actor_id,a.action,a.comments,a.acted_at::text from approval_action a join approval_instance i on i.tenant_id=a.tenant_id and i.id=a.approval_instance_id
    where i.tenant_id=$1 and i.source_type='budget_version' and i.source_id=$3 and exists(select 1 from budget_version v where v.tenant_id=$1 and v.company_id=$2 and v.id=$3)
    order by a.acted_at,a.sequence limit 1000`,
          [t, company, id],
        )
      ).rows,
    });
  }
  detail(ctx: BankingActorContext, company: string, id: string) {
    return this.transactions.run(ctx, company, "budget.plan.read", false, (c) =>
      this.read(c, ctx.tenantId, company, id),
    );
  }
  async validateLines(
    c: BudgetClient,
    t: string,
    company: string,
    calendar: string,
    kind: string,
    lines: BudgetLineInput[],
  ) {
    const base = await resolveCompanyBaseCurrency(c, t, company, false),
      seen = new Set<string>();
    const periods = (
      await c.query<{ id: string; fiscal_calendar_id: string; status: string }>(
        "select id,fiscal_calendar_id,status from financial_period where tenant_id=$1 and company_id=$2",
        [t, company],
      )
    ).rows;
    const accounts = new Set(
      (
        await c.query<{ id: string }>(
          "select id from account where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and status='active' and not is_header and not reconciliation_required for share",
          [t, company, [...new Set(lines.map((l) => l.account_id))]],
        )
      ).rows.map((a) => a.id),
    );
    for (const dimension of ["department", "branch", "project", "cost_centre"] as const) {
      const identities = [
        ...new Set(lines.flatMap((l) => (l.dimensions[dimension] ? [l.dimensions[dimension]!] : []))),
      ];
      if (!identities.length) continue;
      const found =
        dimension === "project"
          ? await c.query(
              "select id from erp_project where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and status='active' for share",
              [t, company, identities],
            )
          : dimension === "cost_centre"
            ? await c.query(
                "select id from hr_master_record where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and master_type='cost_center' and status='active' for share",
                [t, company, identities],
              )
            : await c.query(
                "select id from organization_unit where tenant_id=$1 and id=any($3::text[]) and type=$4 and status='active' and organization_unit_is_within_company($1,id,$2) for share",
                [t, company, identities, dimension],
              );
      if (found.rowCount !== identities.length) budgetReject("A budget dimension is unavailable in this company.");
    }
    for (const line of lines) {
      const k = `${line.account_id}:${budgetDimensionKey(line.dimensions)}`;
      if (seen.has(k)) budgetReject("Combine duplicate account/dimension lines before saving.");
      seen.add(k);
      if (!accounts.has(line.account_id))
        budgetReject("Every budget line requires an active posting account in this company.");
      const allocated = new Set<string>();
      for (const allocation of line.allocations) {
        const period = periods.find((p) => p.id === allocation.period_id);
        if (!period || (!["forecast", "scenario"].includes(kind) && period.fiscal_calendar_id !== calendar))
          budgetReject("Every allocation must use a period in the selected fiscal calendar.");
        if (allocated.has(allocation.period_id)) budgetReject("A line cannot allocate the same period twice.");
        allocated.add(allocation.period_id);
        try {
          if (decimal(allocation.amount, 8) % 10n ** BigInt(8 - base.decimalPlaces))
            budgetReject("An allocation exceeds the company currency precision.");
        } catch {
          budgetReject("An allocation exceeds the company currency precision.");
        }
      }
    }
  }
  async replaceLines(c: BudgetClient, ctx: BankingActorContext, company: string, id: string, lines: BudgetLineInput[]) {
    const document = await this.read(c, ctx.tenantId, company, id);
    if (!["draft", "rejected"].includes(document.record.state))
      budgetReject("Only draft or rejected allocations can change.", "BUDGET_STATE_CONFLICT", 409);
    await this.validateLines(c, ctx.tenantId, company, document.record.fiscal_calendar_id, document.record.kind, lines);
    await c.query(
      "delete from budget where tenant_id=$1 and company_id=$2 and managed_line_id in(select id from budget_line where tenant_id=$1 and company_id=$2 and version_id=$3)",
      [ctx.tenantId, company, id],
    );
    await c.query("delete from budget_line where tenant_id=$1 and company_id=$2 and version_id=$3", [
      ctx.tenantId,
      company,
      id,
    ]);
    const prepared = lines.map((line) => ({ ...line, id: randomUUID() }));
    if (prepared.length) {
      await c.query(
        `insert into budget_line(tenant_id,company_id,id,version_id,account_id,dimensions,notes)
        select $1,$2,record.id,$3,record.account_id,record.dimensions,record.notes from jsonb_to_recordset($4::jsonb) record(id text,account_id text,dimensions jsonb,notes text)`,
        [ctx.tenantId, company, id, JSON.stringify(prepared)],
      );
      const allocations = prepared.flatMap((line) =>
        line.allocations.map((allocation) => ({
          id: randomUUID(),
          line_id: line.id,
          account_id: line.account_id,
          dimensions: line.dimensions,
          ...allocation,
        })),
      );
      await c.query(
        `insert into budget(id,tenant_id,company_id,fiscal_year,period_id,account_id,amount,dimensions,version,status,created_by,created_at,managed_line_id)
        select record.id,$1,$2,calendar.year,p.id,record.account_id,record.amount,record.dimensions,$3,'draft',$4,clock_timestamp(),record.line_id
        from jsonb_to_recordset($5::jsonb) record(id text,line_id text,account_id text,dimensions jsonb,period_id text,amount numeric)
        join financial_period p on p.tenant_id=$1 and p.company_id=$2 and p.id=record.period_id join fiscal_calendar calendar on calendar.tenant_id=p.tenant_id and calendar.id=p.fiscal_calendar_id`,
        [ctx.tenantId, company, document.record.number, ctx.actor.userId, JSON.stringify(allocations)],
      );
    }
  }
  async insertVersion(c: BudgetClient, ctx: BankingActorContext, input: BudgetVersionInput, correlation: string) {
    if (input.kind === "forecast")
      input = {
        ...input,
        lines: await freezeBudgetForecast(c, ctx.tenantId, input.company_id, input.cutoff, input.lines),
      };
    const p = (
      await c.query<{ fiscal_calendar_id: string }>(
        "select fiscal_calendar_id from budget_plan where tenant_id=$1 and company_id=$2 and id=$3 for update",
        [ctx.tenantId, input.company_id, input.plan_id],
      )
    ).rows[0];
    if (!p) budgetReject("Budget plan was not found in this company.", "NOT_FOUND", 404);
    if (input.parent_id) {
      const parent = await this.read(c, ctx.tenantId, input.company_id, input.parent_id);
      if (parent.record.plan_id !== input.plan_id) budgetReject("The parent must belong to this budget plan.");
    }
    await this.validateLines(c, ctx.tenantId, input.company_id, p.fiscal_calendar_id, input.kind, input.lines);
    const id = randomUUID();
    await c.query(
      `insert into budget_version(tenant_id,company_id,id,plan_id,number,name,kind,parent_id,cutoff,assumptions,created_by,updated_by)
    select $1,$2,$3,$4,coalesce(max(number),0)+1,$5,$6,$7,$8,$9,$10,$10 from budget_version where tenant_id=$1 and company_id=$2 and plan_id=$4`,
      [
        ctx.tenantId,
        input.company_id,
        id,
        input.plan_id,
        input.name,
        input.kind,
        input.parent_id,
        input.cutoff,
        JSON.stringify(input.assumptions),
        ctx.actor.userId,
      ],
    );
    await this.replaceLines(c, ctx, input.company_id, id, input.lines);
    await budgetAudit(c, ctx, input.company_id, "budget_version", id, "created", input.reason, correlation);
    return this.read(c, ctx.tenantId, input.company_id, id);
  }
  createVersion(ctx: BankingActorContext, raw: BudgetVersionInput, key: string, correlation: string) {
    const input = budgetVersionInputSchema.parse(raw);
    return this.transactions.mutate(
      ctx,
      input.company_id,
      "budget.plan.create",
      key,
      { op: "version.create", input },
      (c) => this.insertVersion(c, ctx, input, correlation),
      (v) => budgetDetailSchema.parse(v),
    );
  }
  updateVersion(ctx: BankingActorContext, id: string, raw: BudgetVersionUpdate, key: string, correlation: string) {
    const input = budgetVersionUpdateSchema.parse(raw);
    return this.transactions.mutate(
      ctx,
      input.company_id,
      "budget.plan.update",
      key,
      { op: "version.update", id, input },
      async (c) => {
        const before = await this.read(c, ctx.tenantId, input.company_id, id);
        if (before.record.version !== input.expected_version)
          budgetReject("The budget changed. Reload before saving.", "BUDGET_VERSION_CONFLICT", 409);
        if (
          before.record.plan_id !== input.plan_id ||
          before.record.kind !== input.kind ||
          before.record.parent_id !== input.parent_id
        )
          budgetReject("Budget version ownership and lineage cannot change.");
        const lines =
          input.kind === "forecast"
            ? await freezeBudgetForecast(c, ctx.tenantId, input.company_id, input.cutoff, input.lines)
            : input.lines;
        await this.replaceLines(c, ctx, input.company_id, id, lines);
        await c.query(
          "update budget_version set name=$4,cutoff=$5,assumptions=$6,state='draft',version=version+1,updated_by=$7,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
          [
            ctx.tenantId,
            input.company_id,
            id,
            input.name,
            input.cutoff,
            JSON.stringify(input.assumptions),
            ctx.actor.userId,
          ],
        );
        await budgetAudit(c, ctx, input.company_id, "budget_version", id, "updated", input.reason, correlation);
        return this.read(c, ctx.tenantId, input.company_id, id);
      },
      (v) => budgetDetailSchema.parse(v),
    );
  }
  directory(ctx: BankingActorContext, q: BudgetQuery) {
    return this.transactions.run(ctx, q.company_id, "budget.plan.read", false, async (c) => {
      const args = [
        ctx.tenantId,
        q.company_id,
        q.fiscal_calendar_id ?? null,
        q.plan_id ?? null,
        q.state ?? null,
        q.search,
        q.kind ?? null,
      ];
      const where = `v.tenant_id=$1 and v.company_id=$2 and ($3::text is null or p.fiscal_calendar_id=$3) and ($4::text is null or p.id=$4) and ($5::text is null or v.state=$5) and ($6='' or v.name ilike '%'||$6||'%' or p.code ilike '%'||$6||'%') and ($7::text is null or v.kind=$7)`;
      const versions = (
        await c.query(
          `select ${versionColumns} ${versionJoin} where ${where} order by v.created_at desc,v.id limit $8 offset $9`,
          [...args, q.limit, q.offset],
        )
      ).rows.map((v) => budgetVersionSchema.parse(v));
      const total = (
        await c.query<{ total: number }>(`select count(*)::integer as total ${versionJoin} where ${where}`, args)
      ).rows[0]!.total;
      const simple = [ctx.tenantId, q.company_id, q.limit, q.offset];
      const plans = (
        await c.query(
          "select id,company_id,code,name,fiscal_calendar_id,currency,owner_id,version from budget_plan where tenant_id=$1 and company_id=$2 order by created_at desc,id limit $3 offset $4",
          simple,
        )
      ).rows;
      const models = (
        await c.query(
          "select id,code,name,company_id,version,active,definition->'lines' as lines from budget_model where tenant_id=$1 and company_id=$2 order by created_at desc,id limit $3 offset $4",
          simple,
        )
      ).rows.map((v) => budgetModelSchema.parse(v));
      const requests = (
        await c.query(
          `select r.id,r.company_id,r.code,r.kind,r.payload,r.state,r.version,r.created_by,r.updated_by,r.created_at::text,
    coalesce((select a.reason from budget_audit a where a.tenant_id=r.tenant_id and a.company_id=r.company_id and a.entity_id=r.id order by record_version limit 1),'') as reason
    from budget_request r where r.tenant_id=$1 and r.company_id=$2 order by r.created_at desc,r.id limit $3 offset $4`,
          simple,
        )
      ).rows.map((v) => budgetRequestSchema.parse(v));
      const policies = (
        await c.query(
          "select distinct on(fiscal_calendar_id) id,company_id,fiscal_calendar_id,version,control_version_id,enabled,mode,warn_percent::text,effective_date::text,reason,created_by from budget_policy where tenant_id=$1 and company_id=$2 order by fiscal_calendar_id,version desc limit 100",
          simple.slice(0, 2),
        )
      ).rows.map((v) => budgetPolicySchema.parse(v));
      const counts = (
        await c.query<{ request_total: number; model_total: number; plan_total: number }>(
          `select
    (select count(*)::int from budget_request where tenant_id=$1 and company_id=$2) as request_total,
    (select count(*)::int from budget_model where tenant_id=$1 and company_id=$2) as model_total,
    (select count(*)::int from budget_plan where tenant_id=$1 and company_id=$2) as plan_total`,
          simple.slice(0, 2),
        )
      ).rows[0]!;
      return budgetDirectorySchema.parse({ plans, versions, models, requests, policies, total, ...counts });
    });
  }
  assertDisjoint(lines: BudgetDetail["lines"]) {
    for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++)
        if (
          lines[i]!.account_id === lines[j]!.account_id &&
          budgetPoolsOverlap(lines[i]!.dimensions, lines[j]!.dimensions) &&
          lines[i]!.allocations.some((a) => lines[j]!.allocations.some((b) => b.period_id === a.period_id))
        )
          budgetReject("Control allocations contain overlapping account/dimension pools.");
  }
}
