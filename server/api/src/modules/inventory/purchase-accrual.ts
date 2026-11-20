import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  decimal,
  decimalText,
  divideRounded,
  parseQuantity,
  formatQuantity,
  receiptBillMatchSchema,
  type ReceiptBillMatch,
  type PurchaseLine,
} from "@nexora/contracts";
import { productUnitChoices, productUnitSnapshot } from "./units-repository.js";
import { operationalDigest } from "../shared/operational-transaction.js";

export class PurchaseAccrualError extends Error {
  readonly status = 409;
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(message: string): never {
  throw new PurchaseAccrualError("PURCHASE_STOCK_MATCH_REQUIRED", message);
}
const receiptLine = z.object({
  line_id: z.string(),
  order_line_id: z.string(),
  product_id: z.string(),
  quantity: z.string(),
  value: z.string(),
});

/** Allocate only posted receipts of the same approved PO line. Caller owns the
 * company operational lock and SQL transaction, including financial posting. */
export async function matchPurchaseStock(
  client: PoolClient,
  input: {
    tenant: string;
    company: string;
    bill: string;
    date: string;
    line: PurchaseLine;
    precision: number;
  },
): Promise<{ matches: ReceiptBillMatch[]; varianceAccount: string } | null> {
  const { tenant, company, bill, line } = input;
  if (!line.product_id || line.asset_category_id) return null;
  const product = (
    await client.query<{ tracked: boolean }>(
      "select type='goods' and coalesce((details->>'track_inventory')::boolean,false) as tracked from inventory_product where tenant_id=$1 and company_id=$2 and id=$3 for share",
      [tenant, company, line.product_id],
    )
  ).rows[0];
  if (!product?.tracked) return null;
  if (!line.id || !line.source_line_id)
    fail("A tracked purchase requires its canonical approved bill and order-line references.");
  if (line.nominal_account_id)
    fail("A tracked purchase clears receipt accrual. Remove the manual nominal override through source review.");
  const choices = (await productUnitChoices(client, tenant, company, [line.product_id])).get(line.product_id)!;
  const snapshot = productUnitSnapshot(choices, line.quantity, line.unit_id);
  if (!line.unit_snapshot || operationalDigest(snapshot) !== operationalDigest(line.unit_snapshot))
    fail("Review the tracked bill's approved unit conversion before recognition.");
  const policy = (
    await client.query<{ variance_account_id: string }>(
      "select variance_account_id from inventory_stock_policy where tenant_id=$1 and company_id=$2 order by version desc limit 1",
      [tenant, company],
    )
  ).rows[0];
  if (!policy) fail("Review stock accounting configuration before recognizing a tracked purchase.");
  const receipts = (
    await client.query<{ id: string; preview: unknown }>(
      `select r.id,r.preview from inventory_stock_operation r
     join procurement_document d on(d.tenant_id,d.company_id,d.id)=(r.tenant_id,r.company_id,r.payload->>'source_id')
     join procurement_document b on(b.tenant_id,b.company_id,b.id)=(d.tenant_id,d.company_id,$3)
     where r.tenant_id=$1 and r.company_id=$2 and r.kind='receipt' and r.state='posted'
      and r.movement_date<=$4::date and d.source_id=b.source_id and d.supplier_id=b.supplier_id
      and exists(select 1 from jsonb_array_elements(r.preview->'evidence'->'receipt_lines') x
       where x->>'order_line_id'=$5 and x->>'product_id'=$6)
     order by r.movement_date,r.code limit 1001 for share of r`,
      [tenant, company, bill, input.date, line.source_line_id, line.product_id],
    )
  ).rows;
  if (receipts.length > 1000) fail("This purchase spans too many receipt batches. Review smaller source allocations.");
  let needed = parseQuantity(snapshot.base_quantity);
  const matches: ReceiptBillMatch[] = [];
  for (const receipt of receipts) {
    const preview = z
      .object({
        evidence: z.object({
          receipt_lines: z.array(receiptLine),
          policy: z.object({ receipt_accrual_account_id: z.string() }),
        }),
      })
      .parse(receipt.preview);
    for (const received of preview.evidence.receipt_lines.filter(
      (r) => r.order_line_id === line.source_line_id && r.product_id === line.product_id,
    )) {
      if (!needed) break;
      const used = (
        await client.query<{ quantity: string; value: string }>(
          "select coalesce(sum(quantity),0)::text quantity,coalesce(sum(value),0)::text value from inventory_receipt_bill_match where tenant_id=$1 and company_id=$2 and receipt_operation_id=$3 and receipt_line_id=$4",
          [tenant, company, receipt.id, received.line_id],
        )
      ).rows[0]!;
      const quantity = parseQuantity(received.quantity) - decimal(used.quantity, 4, true);
      const value = decimal(received.value, 8) - decimal(used.value, 8, true);
      if (quantity < 0n || value < 0n)
        fail("Receipt accrual allocations are inconsistent. Reconcile the source before posting.");
      if (!quantity) continue;
      const take = needed < quantity ? needed : quantity;
      const unit = 10n ** BigInt(8 - input.precision);
      const carrying = take === quantity ? value : divideRounded((value / unit) * take, quantity) * unit;
      if (carrying <= 0n || (take < quantity && carrying >= value))
        fail("The receipt cost cannot represent this partial quantity at functional-currency precision.");
      matches.push({
        bill_id: bill,
        bill_line_id: line.id!,
        receipt_operation_id: receipt.id,
        receipt_line_id: received.line_id,
        product_id: line.product_id,
        quantity: formatQuantity(take),
        value: decimalText(carrying, 8),
        accrual_account_id: preview.evidence.policy.receipt_accrual_account_id,
        original_match_id: null,
      });
      needed -= take;
    }
    if (!needed) break;
  }
  if (needed) fail("Post sufficient actual stock receipts for this order line before recognizing its supplier bill.");
  return { matches, varianceAccount: policy.variance_account_id };
}

export async function reversePurchaseStockMatches(
  client: PoolClient,
  tenant: string,
  company: string,
  operation: string,
) {
  const rows = (
    await client.query<{ id: string; record: unknown }>(
      "select id,to_jsonb(m)||jsonb_build_object('quantity',quantity::text,'value',value::text) record from inventory_receipt_bill_match m where tenant_id=$1 and company_id=$2 and operation_id=$3 order by id",
      [tenant, company, operation],
    )
  ).rows;
  return rows.map((row) => {
    const match = receiptBillMatchSchema.parse(
      row.record && typeof row.record === "object"
        ? Object.fromEntries(Object.entries(row.record).filter(([key]) => key in receiptBillMatchSchema.shape))
        : row.record,
    );
    return {
      ...match,
      quantity: decimalText(-decimal(match.quantity, 4, true), 4),
      value: decimalText(-decimal(match.value, 8, true), 8),
      original_match_id: row.id,
    };
  });
}

export async function recordPurchaseStockMatches(
  client: PoolClient,
  tenant: string,
  company: string,
  operation: string,
  journal: string,
  matches: ReceiptBillMatch[],
) {
  for (const match of matches)
    await client.query(
      `insert into inventory_receipt_bill_match(tenant_id,company_id,id,operation_id,journal_id,bill_id,bill_line_id,
      receipt_operation_id,receipt_line_id,product_id,quantity,value,accrual_account_id,original_match_id)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        tenant,
        company,
        randomUUID(),
        operation,
        journal,
        match.bill_id,
        match.bill_line_id,
        match.receipt_operation_id,
        match.receipt_line_id,
        match.product_id,
        match.quantity,
        match.value,
        match.accrual_account_id,
        match.original_match_id,
      ],
    );
}
