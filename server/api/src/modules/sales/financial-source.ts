import type { PoolClient } from "pg";
import { decimal, parseQuantity, salesMinor, type SubledgerInput, type SubledgerPolicy } from "@nexora/contracts";
import type { ReferenceMasterContext } from "../master-data/source-repository.js";
import { operationalFailure as fail } from "../shared/operational-transaction.js";
import { loadSalesSource } from "./records.js";
import { validateSalesReview } from "./lifecycle.js";
import { postedSalesInvoice } from "./credit-tax.js";

/** Attests a commercial source inside the central Finance transaction at every review/post. */
export async function salesFinancialSource(
  client: PoolClient,
  context: ReferenceMasterContext,
  input: Extract<SubledgerInput, { type: "recognition" }>,
  policy: SubledgerPolicy,
) {
  if (!input.sales_document_id) return null;
  if (
    !context.actor.permissions.includes("sales.document.read") ||
    !(
      await client.query("select 1 where bank_has_live_permission($1,$2,$3,'sales.document.read')", [
        context.tenantId,
        input.company_id,
        context.actor.userId,
      ])
    ).rowCount
  )
    fail(
      "Current Sales read authority is required for this source-owned posting.",
      "SALES_SOURCE_PERMISSION_REQUIRED",
      403,
    );
  const source = await loadSalesSource(client, context.tenantId, input.company_id, input.sales_document_id, true);
  if (
    source.state !== "approved" ||
    !["invoice", "credit"].includes(source.kind) ||
    input.side !== "receivable" ||
    input.kind !== (source.kind === "invoice" ? "invoice" : "credit_note") ||
    input.party_id !== source.customer_id ||
    input.currency !== source.currency ||
    input.date !== source.document_date ||
    input.due_date !== (source.due_date ?? source.document_date) ||
    decimal(input.amount, 8) !== decimal(source.net_amount, 8) ||
    input.source_document_id ||
    input.counter_account_id ||
    input.tax_definition_id ||
    input.tax_account_id ||
    input.tax_amount !== undefined ||
    !input.monetary ||
    input.dimensions?.project !== source.project_id ||
    input.dimensions?.location !== source.location_id
  )
    fail(
      "Sales accounting must retain the approved customer, amounts, dates, dimensions and governed line mappings.",
      "SALES_FINANCIAL_SOURCE_MISMATCH",
    );
  await validateSalesReview(client, context, source);
  if (source.kind === "credit") {
    const original = await postedSalesInvoice(client, context.tenantId, input.company_id, source.source_id!);
    if (input.original_item_id !== original.item_id)
      fail("The credit must retain its original posted invoice item.", "SALES_CREDIT_ITEM_MISMATCH");
  } else if (input.original_item_id)
    fail("Only a credit can reference an original receivable.", "SALES_CREDIT_ITEM_MISMATCH");
  const mappings = (
    await client.query<{ id: string; account_id: string }>(
      `
    select l.id,coalesce(nullif(l.product_snapshot->>'income_account_id',''),$4) account_id
    from sales_document_line l where(l.tenant_id,l.company_id,l.document_id)=($1,$2,$3) and l.active`,
      [context.tenantId, input.company_id, source.id, policy.revenue_account_id],
    )
  ).rows;
  const accounts = [...new Set(mappings.map((row) => row.account_id))];
  const eligible = (
    await client.query<{ id: string }>(
      `
    select a.id from account a where a.tenant_id=$1 and a.company_id=$2 and a.id=any($3::text[]) and a.status='active'
      and a.type='revenue' and not a.is_header and not a.reconciliation_required
      and not exists(select 1 from bank_account b where(b.tenant_id,b.company_id,b.account_id)=(a.tenant_id,a.company_id,a.id))
      and not exists(select 1 from finance_subledger_policy p where(p.tenant_id,p.company_id)=(a.tenant_id,a.company_id) and a.id in(p.receivable_account_id,p.payable_account_id)) for share of a`,
      [context.tenantId, input.company_id, accounts],
    )
  ).rows;
  if (eligible.length !== accounts.length)
    fail(
      "Review each product income account or the company revenue mapping before posting.",
      "SALES_REVENUE_MAPPING_REQUIRED",
    );
  if (source.kind === "invoice")
    for (const line of source.lines) {
      if (!line.track_inventory || line.invoice_policy !== "delivered") continue;
      const rows = (
        await client.query<{ delivered: string; invoiced: string }>(
          `
      select coalesce((select sum(l.base_quantity) from sales_document_line l join sales_document d on(d.tenant_id,d.company_id,d.id)=(l.tenant_id,l.company_id,l.document_id)
        join inventory_stock_operation o on(o.tenant_id,o.company_id,o.sales_document_id)=(d.tenant_id,d.company_id,d.id) and o.kind='delivery' and o.state='posted'
        where l.tenant_id=$1 and l.company_id=$2 and l.active and d.state='approved' and(l.fulfillment_source_id,l.fulfillment_source_line_id)=($3,$4)),0)::text delivered,
      coalesce((select sum(l.base_quantity) from sales_document_line l join sales_document d on(d.tenant_id,d.company_id,d.id)=(l.tenant_id,l.company_id,l.document_id)
        join finance_subledger_operation o on(o.tenant_id,o.company_id,o.sales_document_id)=(d.tenant_id,d.company_id,d.id) and o.state='posted'
        where l.tenant_id=$1 and l.company_id=$2 and l.active and d.id<>$5 and d.kind='invoice' and(l.fulfillment_source_id,l.fulfillment_source_line_id)=($3,$4)
          and not exists(select 1 from finance_subledger_operation r where(r.tenant_id,r.company_id,r.payload->>'operation_id')=(o.tenant_id,o.company_id,o.id) and r.type='reversal' and r.state='posted')),0)::text invoiced`,
          [context.tenantId, input.company_id, line.fulfillment_source_id, line.fulfillment_source_line_id, source.id],
        )
      ).rows[0]!;
      const required = source.lines
        .filter(
          (other) =>
            other.fulfillment_source_id === line.fulfillment_source_id &&
            other.fulfillment_source_line_id === line.fulfillment_source_line_id,
        )
        .reduce((sum, item) => sum + parseQuantity(item.base_quantity), 0n);
      if (parseQuantity(rows.invoiced) + required > parseQuantity(rows.delivered))
        fail(
          "Delivered-policy goods require sufficient actual posted delivery before AR recognition.",
          "SALES_POSTED_DELIVERY_REQUIRED",
        );
    }
  const total = source.lines.reduce((sum, line) => sum + salesMinor(line.net_amount, source.decimal_places), 0n);
  if (total !== salesMinor(source.net_amount, source.decimal_places))
    fail("Sales recognition line bases no longer reconcile.", "SALES_FINANCIAL_SOURCE_MISMATCH");
  return {
    source,
    taxes: source.lines.flatMap((line) => (line.tax_snapshot ? [line.tax_snapshot] : [])),
    allocations: source.lines.map((line) => ({
      line,
      account: mappings.find((row) => row.id === line.id)!.account_id,
    })),
  };
}
