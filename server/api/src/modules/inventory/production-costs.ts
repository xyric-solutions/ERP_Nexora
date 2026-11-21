import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  decimal,
  decimalText,
  parseQuantity,
  stockOperationSchema,
  expectedBatchMaterials,
  type StockOperation,
  type StockPreview,
  type ManufacturingRecipe,
  type StockLookupQuery,
} from "@nexora/contracts";
import type { InventoryContext } from "./source-repository.js";
import { operationalFailure as fail, operationalDigest } from "../shared/operational-transaction.js";
function baseMinor(value: string, places: number) {
  const amount = decimal(value, 8, true),
    unit = 10n ** BigInt(8 - places);
  if (amount % unit) fail("Source expense precision does not match company currency.", "PRODUCTION_SOURCE_PRECISION");
  return amount / unit;
}
const sourceSchema = z.object({
  id: z.string(),
  journal_id: z.string(),
  entry_number: z.string(),
  posting_date: z.string(),
  account_id: z.string(),
  account_name: z.string(),
  value: z.string(),
  allocated: z.string(),
  currency: z.string(),
  fx_rate: z.string().nullable(),
  dimensions: z.record(z.string(), z.string()),
  subledger_source: z.boolean(),
});
const sourcesSql = `select l.id,j.id journal_id,j.entry_number::text,j.posting_date::text,l.account_id,a.code||' · '||a.name account_name,(l.base_debit-l.base_credit)::text value,
 coalesce((select sum(p.value) from inventory_production_cost_allocation p where p.tenant_id=l.tenant_id and p.company_id=j.company_id and p.source_line_id=l.id),0)::text allocated,l.currency,l.fx_rate::text,l.dimensions,
 exists(select 1 from finance_subledger_operation o where(o.tenant_id,o.company_id,o.journal_id)=(j.tenant_id,j.company_id,j.id)) subledger_source
 from journal_line l join journal_entry j on(j.tenant_id,j.id)=(l.tenant_id,l.journal_id) join account a on(a.tenant_id,a.company_id,a.id)=(j.tenant_id,j.company_id,l.account_id)
 where j.tenant_id=$1 and j.company_id=$2 and j.status='posted' and l.base_debit>l.base_credit and a.type='expense' and a.status='active'
 and not a.is_header and not a.is_system_account and not a.managed_bank_nominal and not a.reconciliation_required and not finance_is_subledger_control(a.tenant_id,a.company_id,a.id)
 and not exists(select 1 from accounting_event e where(e.tenant_id,e.id)=(j.tenant_id,j.source_id) and e.source_type='inventory_stock') and not production_expense_has_credit(j.tenant_id,j.company_id,j.id)`;
export async function requireProductionFinanceRead(
  c: PoolClient,
  context: InventoryContext,
  company: string,
  subledger = false,
) {
  for (const permission of ["finance.journal.read", ...(subledger ? ["finance.subledger.read"] : [])])
    if (
      !context.actor.permissions.includes(permission) ||
      !(
        await c.query("select 1 where bank_has_live_permission($1,$2,$3,$4)", [
          context.tenantId,
          company,
          context.actor.userId,
          permission,
        ])
      ).rowCount
    )
      fail(
        "Current Finance source read access is required for production charge allocation.",
        "PRODUCTION_SOURCE_PERMISSION_REQUIRED",
        403,
      );
}
export async function productionExpenseLookup(c: PoolClient, context: InventoryContext, query: StockLookupQuery) {
  await requireProductionFinanceRead(c, context, query.company_id);
  const pattern = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`,
    sql = `with sources as(${sourcesSql}) select id,entry_number||' / '||left(id,12) code,account_name||' · available base amount '||(value::numeric-allocated::numeric)::text name,null::text unit,'expense'::text type,null::text stock_account_id from sources where value::numeric>allocated::numeric and(account_name ilike $3 escape '\\' or entry_number ilike $3 escape '\\')`;
  const items = (
      await c.query(`${sql} order by code,id limit $4 offset $5`, [
        context.tenantId,
        query.company_id,
        pattern,
        query.limit,
        query.offset,
      ])
    ).rows,
    total = (await c.query(`select count(*)::int n from(${sql})x`, [context.tenantId, query.company_id, pattern]))
      .rows[0].n;
  return { items, total };
}
export async function productionBatch(c: PoolClient, t: string, company: string, id: string) {
  const row = (
    await c.query(
      "select id,company_id,code,kind,movement_date::text date,state,version,maker_id,approver_id,poster_id,journal_id,accounting_event_id,payload input,preview from inventory_stock_operation where tenant_id=$1 and company_id=$2 and id=$3 for share",
      [t, company, id],
    )
  ).rows[0];
  if (!row) fail("Choose a posted actual material issue.", "PRODUCTION_BATCH_REQUIRED");
  const issue = stockOperationSchema.parse(row);
  if (issue.kind !== "manufacturing_issue" || issue.state !== "posted" || !issue.preview)
    fail("Choose a posted, unreversed actual material issue.", "PRODUCTION_BATCH_REQUIRED");
  return issue;
}
async function uncompleted(c: PoolClient, t: string, company: string, batch: string, date: string) {
  const row = (
    await c.query(
      `select count(*) filter(where o.kind='manufacturing_completion' and o.state='posted')::int posted,max(o.movement_date)::text latest
 from inventory_stock_operation o where o.tenant_id=$1 and o.company_id=$2 and(o.kind='manufacturing_completion' and o.state in('posted','reversed') and o.payload->>'source_id'=$3 or o.kind='reversal' and o.state='posted' and exists(select 1 from inventory_stock_operation original where(original.tenant_id,original.company_id,original.id)=(o.tenant_id,o.company_id,o.payload->>'operation_id') and original.kind='manufacturing_completion' and original.payload->>'source_id'=$3))`,
      [t, company, batch],
    )
  ).rows[0];
  if (row.posted || (row.latest && date < row.latest))
    fail(
      "Compensate completed output first and use a date after its accounting history.",
      "PRODUCTION_CHARGE_OUTPUT_DEPENDENCY",
    );
}
export async function appendProductionCharge(
  c: PoolClient,
  context: InventoryContext,
  op: StockOperation,
  result: StockPreview,
  leg: (account: string, amount: bigint, dimensions: Record<string, string>, description: string) => void,
) {
  if (op.input.kind !== "manufacturing_charge") fail("A production charge source is required.");
  const input = op.input,
    t = context.tenantId,
    company = op.company_id;
  await requireProductionFinanceRead(c, context, company);
  const issue = await productionBatch(c, t, company, input.source_id);
  if (op.date < issue.date) fail("Actual charges cannot precede material issue.");
  await uncompleted(c, t, company, issue.id, op.date);
  const wip = issue.preview!.evidence.wip_account_id;
  if (typeof wip !== "string") fail("The original WIP evidence is unavailable.");
  const debit = issue.preview!.lines.find(
    (line) => line.accountId === wip && decimal(line.debit, result.decimal_places) > 0n,
  );
  if (!debit) fail("The original WIP dimensions are unavailable.");
  if (Object.entries(input.dimensions).some(([key, value]) => issue.input.dimensions[key] !== value))
    fail("Preserve the production batch's approved dimensions.", "STOCK_PRODUCTION_DIMENSIONS_CHANGED");
  if (new Set(input.allocations.map((l) => l.journal_line_id)).size !== input.allocations.length)
    fail("Use each expense source line once.", "PRODUCTION_SOURCE_DUPLICATE");
  const rows = (
    await c.query(`${sourcesSql} and l.id=any($3::text[]) order by l.id`, [
      t,
      company,
      input.allocations.map((l) => l.journal_line_id),
    ])
  ).rows.map((row) => sourceSchema.parse(row));
  if (rows.length !== input.allocations.length)
    fail("Every charge needs an eligible posted expense source in this company.", "PRODUCTION_EXPENSE_SOURCE_INVALID");
  const evidence = [];
  let total = 0n;
  for (const line of input.allocations) {
    const source = rows.find((row) => row.id === line.journal_line_id)!;
    if (source.subledger_source) await requireProductionFinanceRead(c, context, company, true);
    if (op.date < source.posting_date) fail("Production cost cannot precede its expense recognition.");
    const amount = baseMinor(line.amount, result.decimal_places),
      available = baseMinor(source.value, result.decimal_places) - baseMinor(source.allocated, result.decimal_places);
    if (amount <= 0n || amount > available)
      fail(
        "The production allocation exceeds its posted expense amount still available.",
        "PRODUCTION_EXPENSE_OVERALLOCATED",
      );
    leg(wip, amount, debit.dimensions, `${op.code} actual production cost`);
    leg(source.account_id, -amount, source.dimensions, `${op.code} capitalize ${source.entry_number}`);
    total += amount;
    evidence.push({ ...source, amount: decimalText(amount, result.decimal_places) });
  }
  result.evidence.production_charge = true;
  result.evidence.production_batch_id = issue.id;
  result.evidence.wip_account_id = wip;
  result.evidence.wip_dimensions = debit.dimensions;
  result.evidence.production_sources = evidence;
  result.evidence.charge_total = decimalText(total, result.decimal_places);
  result.evidence.issue_version = issue.version;
  result.evidence.issue_hash = operationalDigest(issue.preview);
}
export async function batchCharges(c: PoolClient, t: string, company: string, batch: string) {
  return (
    await c.query(
      "select coalesce(sum(value),0)::text value,max(o.movement_date)::text latest,coalesce(jsonb_agg(jsonb_build_object('operation_id',a.operation_id,'source_line_id',a.source_line_id,'value',a.value::text) order by a.id),'[]'::jsonb) allocations from inventory_production_cost_allocation a join inventory_stock_operation o on(o.tenant_id,o.company_id,o.id)=(a.tenant_id,a.company_id,a.operation_id) where a.tenant_id=$1 and a.company_id=$2 and a.batch_id=$3",
      [t, company, batch],
    )
  ).rows[0];
}
export async function assertProductionReversal(
  c: PoolClient,
  t: string,
  company: string,
  original: StockOperation,
  date: string,
) {
  if (original.kind === "manufacturing_charge" && original.input.kind === "manufacturing_charge")
    await uncompleted(c, t, company, original.input.source_id, date);
  if (
    original.kind === "manufacturing_issue" &&
    (
      await c.query(
        "select 1 from inventory_stock_operation where tenant_id=$1 and company_id=$2 and kind='manufacturing_charge' and state='posted' and payload->>'source_id'=$3 limit 1",
        [t, company, original.id],
      )
    ).rowCount
  )
    fail(
      "Reverse the production batch's actual charge allocations before reversing its material issue.",
      "PRODUCTION_CHARGE_DEPENDENCY",
    );
}
export async function postProductionAllocations(c: PoolClient, context: InventoryContext, op: StockOperation) {
  if (op.input.kind === "manufacturing_charge") {
    const sources = z.array(sourceSchema.extend({ amount: z.string() })).parse(op.preview?.evidence.production_sources);
    for (const source of sources)
      await c.query(
        "insert into inventory_production_cost_allocation(tenant_id,company_id,id,operation_id,batch_id,source_line_id,value) values($1,$2,$3,$4,$5,$6,$7)",
        [context.tenantId, op.company_id, randomUUID(), op.id, op.input.source_id, source.id, source.amount],
      );
  } else if (op.input.kind === "reversal")
    await c.query(
      "insert into inventory_production_cost_allocation(tenant_id,company_id,id,operation_id,batch_id,source_line_id,value,original_allocation_id) select tenant_id,company_id,$4||'-'||row_number() over(order by id),$3,batch_id,source_line_id,-value,id from inventory_production_cost_allocation where tenant_id=$1 and company_id=$2 and operation_id=$5",
      [context.tenantId, op.company_id, op.id, randomUUID(), op.input.operation_id],
    );
}
export async function attestActualMaterials(
  order: { id: string; recipe?: ManufacturingRecipe | null },
  issued: string,
  input: Extract<StockOperation["input"], { kind: "manufacturing_issue" }>,
) {
  if (!order.recipe) return null;
  const expected = expectedBatchMaterials(order.recipe, issued, input.quantity),
    actual = new Map(input.lines.map((l) => [l.product_id, l]));
  if (actual.size !== expected.length || actual.size !== input.lines.length)
    fail("Actual issue must retain each approved order material once.", "PRODUCTION_RECIPE_MISMATCH");
  for (const line of expected) {
    const selected = actual.get(line.product_id);
    if (!selected || (line.warehouse_id && line.warehouse_id !== selected.warehouse_id))
      fail("Preserve the approved material and warehouse references.", "PRODUCTION_RECIPE_MISMATCH");
    if (parseQuantity(selected.quantity) !== parseQuantity(line.quantity) && !selected.variance_reason?.trim())
      fail("Explain each actual material variance before review.", "PRODUCTION_VARIANCE_REASON_REQUIRED");
  }
  return expected;
}
