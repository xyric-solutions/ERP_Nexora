import type { PoolClient } from "pg";
import {
  salesDocumentInputSchema,
  parseQuantity,
  formatQuantity,
  salesMinor,
  decimalText,
  divideRounded,
  type SalesSource,
  type SalesDerivedDraftInput,
} from "@nexora/contracts";
import { operationalFailure as fail } from "../shared/operational-transaction.js";
import { editableSales, reservedSalesQuantities } from "./lifecycle.js";

/** Produces an editable proposal only; codes, stock and accounting are not reserved here. */
export async function deriveSalesDraft(
  client: PoolClient,
  tenant: string,
  source: SalesSource,
  input: SalesDerivedDraftInput,
) {
  if (source.version !== input.expected_version)
    fail("The source changed. Reload before preparing a related draft.", "STALE_VERSION");
  const allowed: Record<string, readonly string[]> = {
    quotation: ["order"],
    order: ["delivery", "invoice"],
    invoice: ["delivery", "credit"],
    delivery: ["return"],
    recurring: ["invoice"],
  };
  if (source.state !== "approved" || !allowed[source.kind]?.includes(input.kind))
    fail("Choose an approved eligible source for this action.", "SALES_SOURCE_INELIGIBLE");
  if (
    source.kind === "recurring" &&
    (!source.recurrence?.enabled ||
      !input.customer_id ||
      !source.recurrence.customer_ids.includes(input.customer_id) ||
      !input.billing_period)
  )
    fail("Choose an enabled template, its billing customer and explicit billing period.", "SALES_RECURRING_INELIGIBLE");
  if (source.kind === "recurring" && source.lines.some((line) => line.track_inventory))
    fail(
      "A recurring goods invoice requires an explicit approved order and matching template lines for fulfillment.",
      "SALES_RECURRING_FULFILLMENT_REQUIRED",
    );
  const reserved = await reservedSalesQuantities(client, tenant, input.company_id, source, input.kind);
  const original = editableSales(source),
    lines = source.lines.flatMap((line, index) => {
      if (["delivery", "return"].includes(input.kind) && !line.track_inventory) return [];
      const remaining = parseQuantity(line.base_quantity) - (reserved.get(line.id) ?? 0n);
      if (remaining <= 0n) return [];
      let entered = (parseQuantity(line.quantity) * remaining) / parseQuantity(line.base_quantity);
      const quantum = 10n ** BigInt(4 - (line.unit_snapshot?.unit_precision ?? 4));
      entered -= entered % quantum;
      if (entered <= 0n) return [];
      const discount =
        salesMinor(line.discount_amount, source.decimal_places) +
        salesMinor(line.allocated_discount_amount, source.decimal_places);
      return [
        {
          ...original.lines[index]!,
          id: undefined,
          source_line_id: line.id,
          template_line_id: source.kind === "recurring" ? line.id : null,
          quantity: formatQuantity(entered),
          discount_amount: decimalText(
            divideRounded(discount * entered, parseQuantity(line.quantity)),
            source.decimal_places,
          ),
        },
      ];
    });
  if (!lines.length) fail("No eligible unreserved source quantity remains for this action.", "SALES_SOURCE_EXHAUSTED");
  return salesDocumentInputSchema.parse({
    ...original,
    kind: input.kind,
    customer_id: input.customer_id ?? source.customer_id,
    source_id: source.id,
    template_id: source.kind === "recurring" ? source.id : null,
    billing_period: input.billing_period ?? null,
    document_date: input.document_date,
    due_date: null,
    valid_until: null,
    approver_id: null,
    recurrence: null,
    payment_term: null,
    discount_amount: "0",
    reference: source.code,
    warehouse_id: input.warehouse_id ?? source.warehouse_id,
    lines,
  });
}
