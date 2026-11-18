import { randomUUID } from "node:crypto";
import {
  budgetPolicySchema,
  budgetReportSchema,
  budgetDrillSchema,
  budgetDimensionsSchema,
  budgetPoolMatches,
  budgetDimensionKey,
  budgetPercent,
  budgetCommentInputSchema,
  budgetAuditSchema,
  decimal,
  decimalText,
  type BudgetQuery,
  type BudgetDimensions,
  type BudgetReport,
  type BudgetCommentInput,
} from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { resolveCompanyBaseCurrency } from "../finance/currencies/company-authority.js";
import { budgetReject, budgetHash, type BudgetClient } from "./transaction.js";
import type { SourceBudgetRepository } from "./source-repository.js";

/** Canonical aliases retain existing journal dimensions without changing historical journals. */
export const budgetDimensionsSql = (alias: string) => `jsonb_strip_nulls(jsonb_build_object(
 'department',coalesce(${alias}.dimensions->>'department',${alias}.dimensions->>'department_id'),
 'project',coalesce(${alias}.dimensions->>'project',${alias}.dimensions->>'project_id'),
 'cost_centre',coalesce(${alias}.dimensions->>'cost_centre',${alias}.dimensions->>'cost_center',${alias}.dimensions->>'cost_center_id'),
 'branch',coalesce(${alias}.dimensions->>'branch',${alias}.dimensions->>'branch_id')))`;
type Allocation = {
  id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  period_id: string;
  period_start: string;
  period_end: string;
  dimensions: BudgetDimensions;
  budget: string;
  transfers: string;
};
type Movement = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  period_id: string;
  period_start: string;
  period_end: string;
  dimensions: BudgetDimensions;
  amount: string;
};
export async function loadBudgetPolicy(
  c: BudgetClient,
  t: string,
  company: string,
  calendar: string | undefined,
  date: string,
) {
  const row = (
    await c.query(
      `select id,company_id,fiscal_calendar_id,version,control_version_id,enabled,mode,warn_percent::text,effective_date::text,reason,created_by from budget_policy
 where tenant_id=$1 and company_id=$2 and ($3::text is null or fiscal_calendar_id=$3) and effective_date<=$4::date order by effective_date desc,version desc limit 1`,
      [t, company, calendar ?? null, date],
    )
  ).rows[0];
  return row ? budgetPolicySchema.parse(row) : null;
}
export async function loadBudgetReport(
  c: BudgetClient,
  t: string,
  company: string,
  q: BudgetQuery,
  allRows = false,
): Promise<BudgetReport> {
  const asOf = q.as_of ?? (await c.query<{ date: string }>("select current_date::text as date")).rows[0]!.date;
  const base = await resolveCompanyBaseCurrency(c, t, company, false);
  let calendar = q.fiscal_calendar_id;
  if (q.version_id) {
    const p = (
      await c.query<{ fiscal_calendar_id: string }>(
        "select p.fiscal_calendar_id from budget_version v join budget_plan p on p.tenant_id=v.tenant_id and p.company_id=v.company_id and p.id=v.plan_id where v.tenant_id=$1 and v.company_id=$2 and v.id=$3",
        [t, company, q.version_id],
      )
    ).rows[0];
    if (!p) budgetReject("The report version was not found.", "NOT_FOUND", 404);
    calendar = p.fiscal_calendar_id;
  }
  if (!calendar)
    calendar = (
      await c.query<{ id: string }>(
        "select id from fiscal_calendar where tenant_id=$1 and company_id=$2 and period_start<=$3 and period_end>=$3 order by period_start desc limit 1",
        [t, company, asOf],
      )
    ).rows[0]?.id;
  const policy = await loadBudgetPolicy(c, t, company, calendar, asOf),
    versionId = q.version_id ?? policy?.control_version_id;
  const issues: string[] = [];
  const legacy = (
    await c.query<{ total: number }>(
      "select count(*)::int as total from budget where tenant_id=$1 and company_id=$2 and managed_line_id is null",
      [t, company],
    )
  ).rows[0]!.total;
  if (legacy)
    issues.push(
      `${legacy} legacy allocation(s) remain preserved outside managed versions. Reconcile them explicitly; they are not added to this baseline.`,
    );
  if (!versionId)
    issues.push("Select a budget version; no approved control baseline is configured for this fiscal year.");
  const parameters = [
    t,
    company,
    calendar ?? null,
    q.period_id ?? null,
    q.from ?? null,
    asOf,
    versionId ?? null,
    q.account_id ?? null,
  ];
  const periodFilter = `p.tenant_id=$1 and p.company_id=$2 and ($3::text is null or p.fiscal_calendar_id=$3 or exists(select 1 from budget b_scope join budget_line l_scope on l_scope.tenant_id=b_scope.tenant_id and l_scope.company_id=b_scope.company_id and l_scope.id=b_scope.managed_line_id where b_scope.tenant_id=p.tenant_id and b_scope.company_id=p.company_id and b_scope.period_id=p.id and l_scope.version_id=$7)) and ($4::text is null or p.id=$4) and ($5::date is null or p.period_end>=$5) and ($8::text is null or a.id=$8)`;
  const allocations = versionId
    ? (
        await c.query<Allocation>(
          `select l.id,l.account_id,a.code as account_code,a.name as account_name,a.type as account_type,
  b.period_id,p.period_start::text,p.period_end::text,l.dimensions,b.amount::text as budget,
  coalesce((select sum(e.amount) from budget_transfer_effect e join budget_request r on r.tenant_id=e.tenant_id and r.company_id=e.company_id and r.id=e.request_id
   where e.tenant_id=l.tenant_id and e.company_id=l.company_id and e.line_id=l.id and e.period_id=b.period_id and r.updated_at::date<=$6::date),0)::text as transfers
  from budget_line l join budget b on b.tenant_id=l.tenant_id and b.company_id=l.company_id and b.managed_line_id=l.id
  join account a on a.tenant_id=l.tenant_id and a.company_id=l.company_id and a.id=l.account_id
  join financial_period p on p.tenant_id=b.tenant_id and p.company_id=b.company_id and p.id=b.period_id
  where ${periodFilter} and l.version_id=$7 order by a.code,p.period_start,l.id limit 20001`,
          parameters,
        )
      ).rows
    : [];
  // A forecast can span multiple calendars; explicit version allocations remain authoritative.
  const actuals = (
    await c.query<Movement>(
      `select a.id as account_id,a.code as account_code,a.name as account_name,a.type as account_type,p.id as period_id,
  p.period_start::text,p.period_end::text,${budgetDimensionsSql("l")} as dimensions,
  sum(case when a.type in ('revenue','liability','equity') then l.base_credit-l.base_debit else l.base_debit-l.base_credit end)::text as amount
  from journal_entry j join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id
  join account a on a.tenant_id=l.tenant_id and a.company_id=j.company_id and a.id=l.account_id
  join financial_period p on p.tenant_id=j.tenant_id and p.company_id=j.company_id and p.id=j.period_id
  where ${periodFilter} and j.status in ('posted','reversed') and j.posting_date<=$6::date and ($5::date is null or j.posting_date>=$5)
  and (a.type in ('expense','revenue') or exists(select 1 from budget_line bl where bl.tenant_id=a.tenant_id and bl.company_id=a.company_id and bl.account_id=a.id and bl.version_id=$7)
   or exists(select 1 from fixed_asset_category category where category.tenant_id=a.tenant_id and category.company_id=a.company_id and category.asset_account_id=a.id))
  group by a.id,a.code,a.name,a.type,p.id,p.period_start,p.period_end,${budgetDimensionsSql("l")} order by a.code,p.period_start limit 20001`,
      parameters,
    )
  ).rows;
  const commitments = (
    await c.query(
      `select c.id,c.source_document_id,d.code as source_code,c.source_line_id,c.account_id,a.code as account_code,a.name as account_name,
  a.type as account_type,c.dimensions,c.period_id,p.period_start::text,p.period_end::text,c.commitment_date::text,c.currency,c.rate::text,c.reserved_base::text as reserved,
  coalesce(sum(e.base_delta),0)::text as consumed,(c.reserved_base-coalesce(sum(e.base_delta),0))::text as remaining
  from budget_commitment c join procurement_document d on d.tenant_id=c.tenant_id and d.company_id=c.company_id and d.id=c.source_document_id
  join account a on a.tenant_id=c.tenant_id and a.company_id=c.company_id and a.id=c.account_id
  join financial_period p on p.tenant_id=c.tenant_id and p.company_id=c.company_id and p.id=c.period_id
  left join budget_commitment_event e on e.tenant_id=c.tenant_id and e.company_id=c.company_id and e.commitment_id=c.id and e.event_date<=$6::date
  where ${periodFilter} and c.commitment_date<=$6::date
  group by c.tenant_id,c.company_id,c.id,d.code,a.code,a.name,a.type,p.period_start,p.period_end order by c.commitment_date,c.id limit 20001`,
      parameters,
    )
  ).rows;
  if ([allocations, actuals, commitments].some((rows) => rows.length > 20000))
    budgetReject("Narrow the report period or account range.", "BUDGET_REPORT_TOO_LARGE");
  const dimensionFilter = Object.fromEntries(
    (["department", "project", "cost_centre", "branch"] as const).flatMap((key) => (q[key] ? [[key, q[key]]] : [])),
  );
  const include = (row: { account_id: string; dimensions: BudgetDimensions }, pool = false) =>
    (!q.account_id || q.account_id === row.account_id) &&
    Object.entries(dimensionFilter).every(
      ([key, value]) =>
        (pool && !row.dimensions[key as keyof BudgetDimensions]) ||
        row.dimensions[key as keyof BudgetDimensions] === value,
    );
  type Bucket = {
    source: Omit<Allocation, "budget" | "transfers">;
    budget: bigint;
    transfers: bigint;
    actual: bigint;
    commitment: bigint;
    unbudgeted: boolean;
  };
  const buckets = new Map<string, Bucket>();
  for (const allocation of allocations) {
    if (!include(allocation, true)) continue;
    buckets.set(`${allocation.id}:${allocation.period_id}`, {
      source: allocation,
      budget: decimal(allocation.budget, 8),
      transfers: decimal(allocation.transfers, 8, true),
      actual: 0n,
      commitment: 0n,
      unbudgeted: false,
    });
  }
  const add = (row: Movement, kind: "actual" | "commitment") => {
    if (!include(row)) return;
    const matches = [...buckets.values()].filter(
      (b) =>
        !b.unbudgeted &&
        b.source.account_id === row.account_id &&
        b.source.period_id === row.period_id &&
        budgetPoolMatches(b.source.dimensions, row.dimensions),
    );
    if (matches.length > 1)
      budgetReject("Selected budget contains overlapping control pools.", "BUDGET_POOL_OVERLAP", 409);
    let bucket = matches[0];
    if (!bucket) {
      const key = budgetHash([row.account_id, row.period_id, budgetDimensionKey(row.dimensions)]);
      bucket = buckets.get(key);
      if (!bucket) {
        const { amount: _amount, ...source } = row;
        void _amount;
        bucket = {
          source: { ...source, id: key },
          budget: 0n,
          transfers: 0n,
          actual: 0n,
          commitment: 0n,
          unbudgeted: true,
        };
        buckets.set(key, bucket);
      }
    }
    bucket[kind] += decimal(row.amount, 8, true);
  };
  for (const row of actuals) add({ ...row, dimensions: budgetDimensionsSchema.parse(row.dimensions) }, "actual");
  for (const row of commitments)
    add({ ...row, dimensions: budgetDimensionsSchema.parse(row.dimensions), amount: row.remaining }, "commitment");
  const text = (value: bigint) => decimalText(value, 8);
  const rows = [...buckets.values()]
    .map((b) => {
      const budget = b.budget + b.transfers,
        variance = b.source.account_type === "revenue" ? b.actual - budget : budget - b.actual;
      return {
        ...b.source,
        id: b.unbudgeted ? b.source.id : `${b.source.id}:${b.source.period_id}`,
        budget: text(b.budget),
        transfers: text(b.transfers),
        actual: text(b.actual),
        commitment: text(b.commitment),
        available: text(budget - b.actual - b.commitment),
        variance: text(variance),
        variance_percent: budgetPercent(variance, budget),
        utilization_percent: budgetPercent(b.actual + b.commitment, budget),
        favorable: variance >= 0n,
        unbudgeted: b.unbudgeted,
      };
    })
    .sort(
      (a, b) =>
        a.account_code.localeCompare(b.account_code) ||
        a.period_start.localeCompare(b.period_start) ||
        a.id.localeCompare(b.id),
    );
  const totals = { budget: 0n, transfers: 0n, actual: 0n, commitment: 0n, available: 0n };
  for (const row of rows.filter((r) => ["expense", "asset"].includes(r.account_type)))
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += decimal(row[key], 8, true);
  // Legacy approved sources missing reservation evidence must not silently become zero exposure.
  const unmapped = (
    await c.query<{ total: number }>(
      `with recursive ancestry as (
  select id as descendant,id,source_id,kind,0 as depth from procurement_document where tenant_id=$1 and company_id=$2 and kind='bill' and state='approved'
  union all select path.descendant,d.id,d.source_id,d.kind,path.depth+1 from ancestry path join procurement_document d on d.tenant_id=$1 and d.company_id=$2 and d.id=path.source_id where path.depth<16)
  select count(*)::int as total from procurement_document d where d.tenant_id=$1 and d.company_id=$2 and d.kind in ('order','bill') and d.state='approved' and d.total_amount>0 and d.document_date<=$3::date
  and (d.kind='order' or not exists(select 1 from ancestry path where path.descendant=d.id and path.kind='order'))
  and not exists(select 1 from budget_commitment c where c.tenant_id=d.tenant_id and c.company_id=d.company_id and c.source_document_id=d.id)`,
      [t, company, asOf],
    )
  ).rows[0]!.total;
  if (unmapped)
    issues.push(
      `${unmapped} approved purchase document(s) require commitment reconciliation before controls can be enabled.`,
    );
  if (
    Object.keys(dimensionFilter).length &&
    allocations.some((a) => Object.keys(dimensionFilter).some((k) => !a.dimensions[k as keyof BudgetDimensions]))
  )
    issues.push(
      "Unrestricted pools show their full allocation; dimension filters narrow movements without inventing a suballocation.",
    );
  const visibleCommitments = commitments
    .filter((c) => include(c))
    .map(({ account_type: _type, period_start: _start, period_end: _end, ...c }) => {
      void _type;
      void _start;
      void _end;
      return c;
    });
  return budgetReportSchema.parse({
    rows: allRows ? rows : rows.slice(q.offset, q.offset + q.limit),
    total: rows.length,
    currency: base.code,
    decimal_places: base.decimalPlaces,
    as_of: asOf,
    policy,
    complete: unmapped === 0,
    issues,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, text(v)])),
    commitments: allRows ? visibleCommitments : visibleCommitments.slice(q.offset, q.offset + q.limit),
    commitment_total: visibleCommitments.length,
  });
}
export class BudgetReporting {
  constructor(readonly repository: SourceBudgetRepository) {}
  report(ctx: BankingActorContext, q: BudgetQuery) {
    return this.repository.transactions.run(ctx, q.company_id, "budget.report.read", false, (c) =>
      loadBudgetReport(c, ctx.tenantId, q.company_id, q),
    );
  }
  drill(ctx: BankingActorContext, q: BudgetQuery) {
    return this.repository.transactions.run(ctx, q.company_id, "budget.report.read", false, async (c) => {
      const values = [
        ctx.tenantId,
        q.company_id,
        q.account_id ?? null,
        q.period_id ?? null,
        q.as_of ?? null,
        q.from ?? null,
        JSON.stringify(
          Object.fromEntries(
            (["department", "project", "cost_centre", "branch"] as const).flatMap((k) => (q[k] ? [[k, q[k]]] : [])),
          ),
        ),
      ];
      const from = `from journal_entry j join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id where j.tenant_id=$1 and j.company_id=$2 and j.status in ('posted','reversed')
   and ($3::text is null or l.account_id=$3) and ($4::text is null or j.period_id=$4) and ($5::date is null or j.posting_date<=$5) and ($6::date is null or j.posting_date>=$6) and ${budgetDimensionsSql("l")} @> $7::jsonb`;
      const rows = (
        await c.query(
          `select l.id,j.id as journal_id,j.entry_number,j.posting_date::text as date,j.source_type,j.source_id,l.base_debit::text as debit,l.base_credit::text as credit,l.dimensions ${from} order by j.posting_date,j.id,l.line_number limit $8 offset $9`,
          [...values, q.limit, q.offset],
        )
      ).rows;
      const total = (await c.query<{ total: number }>(`select count(*)::int as total ${from}`, values)).rows[0]!.total;
      return budgetDrillSchema.parse({ rows, total });
    });
  }
  comment(ctx: BankingActorContext, raw: BudgetCommentInput, key: string) {
    const input = budgetCommentInputSchema.parse(raw);
    return this.repository.transactions.mutate(
      ctx,
      input.company_id,
      "budget.plan.update",
      key,
      { op: "comment", input },
      async (c) => {
        await this.repository.read(c, ctx.tenantId, input.company_id, input.version_id);
        const exists = (
          await c.query(
            "select 1 from account a join financial_period p on p.tenant_id=a.tenant_id and p.company_id=a.company_id where a.tenant_id=$1 and a.company_id=$2 and a.id=$3 and p.id=$4",
            [ctx.tenantId, input.company_id, input.account_id, input.period_id],
          )
        ).rowCount;
        if (!exists) budgetReject("Select an account and period in this company.");
        const id = randomUUID();
        await c.query(
          "insert into budget_comment(tenant_id,company_id,id,version_id,account_id,period_id,comment,actor_id) values($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            ctx.tenantId,
            input.company_id,
            id,
            input.version_id,
            input.account_id,
            input.period_id,
            input.comment,
            ctx.actor.userId,
          ],
        );
        return { id };
      },
      (v) => {
        if (!v || typeof v !== "object" || !("id" in v) || typeof v.id !== "string")
          throw new Error("Invalid comment result.");
        return { id: v.id };
      },
    );
  }
  history(ctx: BankingActorContext, q: BudgetQuery) {
    return this.repository.transactions.run(ctx, q.company_id, "budget.report.read", false, async (c) =>
      (
        await c.query(
          "select id,entity,entity_id,record_version,action,actor_id,reason,occurred_at::text from budget_audit where tenant_id=$1 and company_id=$2 and ($3::text is null or entity_id=$3) order by occurred_at desc,id limit $4 offset $5",
          [ctx.tenantId, q.company_id, q.version_id ?? null, q.limit, q.offset],
        )
      ).rows.map((v) => budgetAuditSchema.parse(v)),
    );
  }
}
