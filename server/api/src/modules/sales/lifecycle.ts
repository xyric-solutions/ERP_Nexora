import type { PoolClient } from "pg";
import {
  salesDocumentInputSchema,
  salesLineInputSchema,
  salesMinor,
  parseQuantity,
  decimal,
  type SalesSource,
  type SalesDocumentInput,
  type SalesKind,
} from "@nexora/contracts";
import type { ReferenceMasterContext } from "../master-data/source-repository.js";
import { operationalFailure as fail, operationalDigest } from "../shared/operational-transaction.js";
import { canonicalSales } from "./normalize.js";

export function editableSales(source: SalesSource): SalesDocumentInput {
  return salesDocumentInputSchema.strip().parse({
    ...source,
    lines: source.lines.map((line) => salesLineInputSchema.strip().parse(line)),
  });
}

/** Approval re-resolves governed facts; the submitted source is never silently repriced. */
export async function validateSalesReview(client: PoolClient, context: ReferenceMasterContext, source: SalesSource) {
  const current = await canonicalSales(client, context, source.id, editableSales(source), source);
  if (current.readiness.length) fail(current.readiness.join(" "), "SALES_CONFIGURATION_REQUIRED");
  const money = (value: string) => salesMinor(value, source.decimal_places).toString();
  const facts = (line: SalesSource["lines"][number]) => ({
    ...line,
    quantity: parseQuantity(line.quantity).toString(),
    base_quantity: parseQuantity(line.base_quantity).toString(),
    unit_price: money(line.unit_price),
    discount_amount: money(line.discount_amount),
    allocated_discount_amount: money(line.allocated_discount_amount),
    net_amount: money(line.net_amount),
    tax_amount: money(line.tax_amount),
    total_amount: money(line.total_amount),
  });
  if (
    current.authority.baseCurrency !== source.base_currency ||
    current.authority.sourceDecimalPlaces !== source.decimal_places ||
    current.authority.rateId !== source.exchange_rate_id ||
    decimal(current.authority.rateValue, 18) !== decimal(source.exchange_rate, 18) ||
    operationalDigest(current.lines.map((line) => facts(line.value))) !== operationalDigest(source.lines.map(facts))
  )
    fail("Product, unit, currency or tax evidence changed. Save and review the draft again.", "SALES_REVIEW_STALE");
  const versions = (
    await client.query<{ source_version: number | null; template_version: number | null }>(
      "select (details->>'source_version')::int source_version,(details->>'template_version')::int template_version from sales_document where(tenant_id,company_id,id)=($1,$2,$3)",
      [context.tenantId, source.company_id, source.id],
    )
  ).rows[0]!;
  if (versions.source_version !== current.sourceVersion || versions.template_version !== current.templateVersion)
    fail(
      "The approved commercial source or recurring template changed. Save and review the draft again.",
      "SALES_SOURCE_VERSION_CHANGED",
    );
  await client.query("select sales_validate_document($1,$2,$3,true)", [context.tenantId, source.company_id, source.id]);
}

/** Approved commercial reservations are distinct from actual posted fulfillment. */
export async function reservedSalesQuantities(
  client: PoolClient,
  tenant: string,
  company: string,
  source: SalesSource,
  kind: SalesKind,
) {
  if (!["delivery", "invoice", "return", "credit"].includes(kind)) return new Map<string, bigint>();
  const rows = (
    await client.query<{ id: string; reserved: string }>(
      `
    select original.id,coalesce(sum(used.base_quantity),0)::text reserved
    from sales_document_line original
    left join sales_document_line used on used.tenant_id=original.tenant_id and used.company_id=original.company_id and used.active
      and (case when $4 in('delivery','invoice') then
        used.fulfillment_source_id=original.fulfillment_source_id and used.fulfillment_source_line_id=original.fulfillment_source_line_id
        else used.source_document_id=original.document_id and used.source_line_id=original.id end)
      and exists(select 1 from sales_document d where(d.tenant_id,d.company_id,d.id)=(used.tenant_id,used.company_id,used.document_id) and d.kind=$4 and d.state='approved')
    where(original.tenant_id,original.company_id,original.document_id)=($1,$2,$3) and original.active
    group by original.id`,
      [tenant, company, source.id, kind],
    )
  ).rows;
  return new Map(rows.map((row) => [row.id, parseQuantity(row.reserved)]));
}
