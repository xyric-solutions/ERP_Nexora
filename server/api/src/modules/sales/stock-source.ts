import type { PoolClient } from "pg";
import { z } from "zod";
import {
  decimal,
  decimalText,
  divideRounded,
  parseQuantity,
  formatQuantity,
  type StockEntryPreview,
  type StockOperation,
  type StockPreview,
} from "@nexora/contracts";
import type { ReferenceMasterContext } from "../master-data/source-repository.js";
import { operationalFailure as fail, operationalDigest } from "../shared/operational-transaction.js";
import { loadSalesSource } from "./records.js";
import { validateSalesReview } from "./lifecycle.js";

const costLineSchema = z.strictObject({
  line_id: z.string(),
  original_line_id: z.string().nullable(),
  product_id: z.string(),
  warehouse_id: z.string(),
  base_quantity: z.string(),
  value: z.string(),
  stock_account_id: z.string(),
  cogs_account_id: z.string(),
  dimensions: z.record(z.string(), z.string()),
});
const costLinesSchema = z.array(costLineSchema).min(1).max(100);
type CostLine = z.infer<typeof costLineSchema>;
type StockHooks = {
  entry: (product: string, warehouse: string, quantity: bigint, value?: bigint) => Promise<StockEntryPreview>;
  leg: (account: string, value: bigint, dimensions: Record<string, string>, description: string) => void;
};
const minor = (value: string, precision: number) => {
  const parsed = decimal(value, 8, true),
    divisor = 10n ** BigInt(8 - precision);
  if (parsed % divisor)
    fail("Historical fulfillment cost exceeds functional-currency precision.", "SALES_STOCK_COST_INVALID");
  return parsed / divisor;
};

/** Actual delivery owns the stock/COGS effect; invoices and credits never issue or restock. */
export async function appendSalesStock(
  client: PoolClient,
  context: ReferenceMasterContext,
  op: StockOperation,
  result: StockPreview,
  hooks: StockHooks,
) {
  const input = op.input;
  if (input.kind !== "delivery" && input.kind !== "return") fail("An actual Sales fulfillment source is required.");
  const tenant = context.tenantId,
    company = op.company_id,
    source = await loadSalesSource(client, tenant, company, input.source_id, true);
  if (
    source.state !== "approved" ||
    source.version !== input.source_version ||
    source.kind !== input.kind ||
    source.warehouse_id !== input.warehouse_id ||
    op.date < source.document_date ||
    source.lines.some((line) => !line.track_inventory || !line.product_id)
  )
    fail("Choose the approved physical Sales document and its actual warehouse.", "SALES_STOCK_SOURCE_INVALID");
  if (
    Object.entries(input.dimensions).some(([key, value]) =>
      key === "project" ? value !== source.project_id : key === "location" ? value !== source.location_id : false,
    )
  )
    fail("Fulfillment must preserve the approved Sales project and location.", "SALES_STOCK_DIMENSIONS_CHANGED");
  await validateSalesReview(client, context, source);
  const evidence: CostLine[] = [];
  const dimensions = (line: (typeof source.lines)[number]) =>
    Object.fromEntries(
      Object.entries({
        ...input.dimensions,
        project: source.project_id,
        location: source.location_id,
        ...line.dimensions,
        sales_document_id: source.id,
        sales_line_id: line.id,
      }).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  const eligible = async (account: string) => {
    if (
      !(
        await client.query(
          "select 1 from account where(tenant_id,company_id,id)=($1,$2,$3) and type='expense' and status='active' and not is_header and manual_posting_allowed and not managed_bank_nominal and not reconciliation_required and not finance_is_subledger_control($1,$2,id) for share",
          [tenant, company, account],
        )
      ).rowCount
    )
      fail("Review the product's actual COGS expense mapping before fulfillment.", "SALES_COGS_MAPPING_REQUIRED");
  };
  if (input.kind === "delivery") {
    const rows = (
      await client.query<{ id: string; account: string | null }>(
        "select id,product_snapshot->>'expense_account_id' account from sales_document_line where(tenant_id,company_id,document_id)=($1,$2,$3) and active",
        [tenant, company, source.id],
      )
    ).rows;
    const mappings = new Map(rows.map((row) => [row.id, row.account]));
    for (const product of [...new Set(source.lines.map((line) => line.product_id!))]) {
      const lines = source.lines.filter((line) => line.product_id === product);
      let quantity = lines.reduce((sum, line) => sum + parseQuantity(line.base_quantity), 0n);
      const entry = await hooks.entry(product, input.warehouse_id, -quantity);
      let value = -minor(entry.value, result.decimal_places);
      for (const line of lines) {
        const current = parseQuantity(line.base_quantity),
          cost = current === quantity ? value : divideRounded(value * current, quantity),
          account = mappings.get(line.id);
        if (!account)
          fail("Select the product's reviewed COGS expense account before delivery.", "SALES_COGS_MAPPING_REQUIRED");
        await eligible(account);
        if (cost <= 0n || (current < quantity && cost >= value))
          fail(
            "The allocated delivery line cost must preserve a positive residual. Consolidate the physical source quantity.",
            "SALES_STOCK_COST_INVALID",
          );
        quantity -= current;
        value -= cost;
        evidence.push({
          line_id: line.id,
          original_line_id: null,
          product_id: product,
          warehouse_id: input.warehouse_id,
          base_quantity: formatQuantity(current),
          value: decimalText(cost, result.decimal_places),
          stock_account_id: entry.account_id,
          cogs_account_id: account,
          dimensions: dimensions(line),
        });
      }
    }
  } else {
    const original = (
      await client.query<{ id: string; version: number; preview: unknown; movement_date: string }>(
        "select id,version,preview,movement_date::text from inventory_stock_operation where(tenant_id,company_id,sales_document_id)=($1,$2,$3) and kind='delivery' and state='posted' for share",
        [tenant, company, source.source_id],
      )
    ).rows[0];
    if (!original || op.date < original.movement_date)
      fail("Physical return requires its original unreversed posted delivery.", "SALES_RETURN_DELIVERY_REQUIRED");
    const preview = z
      .object({ base_currency: z.string(), evidence: z.object({ sales_lines: costLinesSchema }) })
      .parse(original.preview);
    if (preview.base_currency !== result.base_currency)
      fail("Return cost must retain its original functional currency.", "SALES_STOCK_COST_INVALID");
    result.evidence.delivery = {
      id: original.id,
      version: original.version,
      preview_hash: operationalDigest(original.preview),
    };
    for (const line of source.lines) {
      const cost = preview.evidence.sales_lines.find((item) => item.line_id === line.source_line_id);
      if (!cost || cost.product_id !== line.product_id)
        fail("The original delivery line cost evidence is missing.", "SALES_RETURN_COST_REQUIRED");
      const used = (
        await client.query<{ quantity: string; value: string }>(
          `select coalesce(sum((e->>'base_quantity')::numeric),0)::text quantity,coalesce(sum((e->>'value')::numeric),0)::text value
        from inventory_stock_operation o cross join lateral jsonb_array_elements(o.preview->'evidence'->'sales_lines')e
        where o.tenant_id=$1 and o.company_id=$2 and o.kind='return' and o.state='posted' and e->>'original_line_id'=$3`,
          [tenant, company, cost.line_id],
        )
      ).rows[0]!;
      const remaining = parseQuantity(cost.base_quantity) - parseQuantity(used.quantity),
        quantity = parseQuantity(line.base_quantity),
        carrying = minor(cost.value, result.decimal_places) - minor(used.value, result.decimal_places);
      if (quantity > remaining || remaining <= 0n)
        fail("The actual original delivery quantity was already returned.", "SALES_RETURN_QUANTITY_EXCEEDED");
      const value = quantity === remaining ? carrying : divideRounded(carrying * quantity, remaining);
      if (value <= 0n || (quantity < remaining && value >= carrying))
        fail("The return must preserve the original positive cost residual.", "SALES_STOCK_COST_INVALID");
      await eligible(cost.cogs_account_id);
      const entry = await hooks.entry(line.product_id!, input.warehouse_id, quantity, value);
      if (entry.account_id !== cost.stock_account_id)
        fail("The product's historical stock nominal changed.", "SALES_RETURN_COST_CHANGED");
      const originalEntry = (
        await client.query<{ id: string }>(
          "select id from inventory_stock_entry where(tenant_id,company_id,operation_id,product_id,warehouse_id)=($1,$2,$3,$4,$5) and quantity<0",
          [tenant, company, original.id, cost.product_id, cost.warehouse_id],
        )
      ).rows;
      if (originalEntry.length !== 1)
        fail("The original delivery stock entry is ambiguous.", "SALES_RETURN_COST_REQUIRED");
      entry.original_entry_id = originalEntry[0]!.id;
      // Restocking reverses the original delivery's cost and accounting dimensions.
      evidence.push({
        ...cost,
        line_id: line.id,
        original_line_id: cost.line_id,
        warehouse_id: input.warehouse_id,
        base_quantity: formatQuantity(quantity),
        value: decimalText(value, result.decimal_places),
        dimensions: { ...cost.dimensions, sales_return_document_id: source.id, sales_return_line_id: line.id },
      });
    }
  }
  for (const line of evidence) {
    const amount = minor(line.value, result.decimal_places) * (input.kind === "return" ? 1n : -1n);
    hooks.leg(
      line.stock_account_id,
      amount,
      { ...line.dimensions, warehouse: line.warehouse_id },
      `${op.code} ${source.code} stock`,
    );
    hooks.leg(line.cogs_account_id, -amount, line.dimensions, `${op.code} ${source.code} cost of sales`);
  }
  result.evidence.sales_source = { id: source.id, code: source.code, version: source.version };
  result.evidence.sales_lines = z.json().parse(evidence);
}
