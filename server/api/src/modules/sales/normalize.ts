import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  decimalText,
  parseQuantity,
  formatQuantity,
  salesAmounts,
  salesMinor,
  financialPaymentSchedule,
  absolute,
  decimal,
  salesLineSchema,
  unitSchema,
  unitSnapshotSchema,
  type SalesDocumentInput,
  type SalesLine,
  type SalesSource,
} from "@nexora/contracts";
import type { ReferenceMasterContext } from "../master-data/source-repository.js";
import { operationalFailure as fail, operationalDigest } from "../shared/operational-transaction.js";
import { productUnitChoices, productUnitSnapshot } from "../inventory/units-repository.js";
import { resolveCompanyCurrencyAuthority } from "../finance/currencies/company-authority.js";
import { resolveTax } from "../finance/taxes/resolver.js";
import { loadSalesSource, loadSalesSourceVersion } from "./records.js";
import { salesCreditTax, postedSalesInvoice } from "./credit-tax.js";

const productSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  version: z.number(),
  type: z.enum(["goods", "service"]),
  status: z.enum(["active", "inactive"]),
  sales_enabled: z.boolean(),
  track_inventory: z.boolean(),
  invoice_policy: z.enum(["ordered", "delivered"]),
  stock_account_id: z.string().nullable(),
  income_account_id: z.string().nullable(),
  expense_account_id: z.string().nullable(),
});
type ProductSnapshot = z.infer<typeof productSchema>;
export type CanonicalSalesLine = {
  value: SalesLine;
  product:
    | ProductSnapshot
    | {
        id: null;
        code: null;
        name: null;
        version: null;
        type: "charge";
        track_inventory: false;
        invoice_policy: "ordered";
      };
};
export async function canonicalSales(
  client: PoolClient,
  context: ReferenceMasterContext,
  id: string,
  input: SalesDocumentInput,
  previous?: SalesSource,
) {
  const tenant = context.tenantId,
    company = input.company_id;
  const authority = await resolveCompanyCurrencyAuthority(client, {
    tenantId: tenant,
    companyId: company,
    sourceCurrency: input.currency,
    effectiveOnOrBefore: input.document_date,
  });
  await client.query("select finance_validate_dimensions($1,$2,$3::jsonb)", [
    tenant,
    company,
    JSON.stringify({ project: input.project_id, location: input.location_id }),
  ]);
  if (
    input.customer_id &&
    !(
      await client.query(
        "select 1 from finance_party_directory where tenant_id=$1 and company_id=$2 and id=$3 and kind='customer' and status='active' and risk_status<>'blocked'",
        [tenant, company, input.customer_id],
      )
    ).rowCount
  )
    fail("Choose an active canonical customer in this company.", "SALES_CUSTOMER_REQUIRED");
  if (
    input.warehouse_id &&
    !(
      await client.query(
        "select 1 from inventory_warehouse where tenant_id=$1 and company_id=$2 and id=$3 and status='active' for share",
        [tenant, company, input.warehouse_id],
      )
    ).rowCount
  )
    fail("Choose an active company warehouse.", "SALES_WAREHOUSE_REQUIRED");
  if (
    input.approver_id &&
    (input.approver_id === (previous?.maker_id ?? context.actor.userId) ||
      !["quotation", "recurring"].includes(input.kind) ||
      !(
        await client.query("select 1 where bank_has_live_permission($1,$2,$3,'sales.document.approve')", [
          tenant,
          company,
          input.approver_id,
        ])
      ).rowCount)
  )
    fail(
      "Choose an eligible independent commercial reviewer, or use the explicit creator-approval path.",
      "SALES_APPROVER_INVALID",
    );
  const retained =
    previous?.state === "approved" && input.kind === "invoice" && input.template_id
      ? (
          await client.query<{ version: number }>(
            "select(details->>'template_version')::int version from sales_document where(tenant_id,company_id,id)=($1,$2,$3)",
            [tenant, company, id],
          )
        ).rows[0]
      : null;
  const historicalTemplate =
    retained && input.template_id
      ? await loadSalesSourceVersion(client, tenant, company, input.template_id, retained.version)
      : null;
  const parent = input.source_id
    ? input.source_id === historicalTemplate?.id
      ? historicalTemplate
      : await loadSalesSource(client, tenant, company, input.source_id, true)
    : null;
  if (parent) {
    const allowed: Record<string, readonly string[]> = {
      order: ["quotation"],
      delivery: ["order", "invoice"],
      invoice: ["order", "recurring"],
      return: ["delivery"],
      credit: ["invoice"],
    };
    if (
      parent.state !== "approved" ||
      !allowed[input.kind]?.includes(parent.kind) ||
      input.document_date < parent.document_date ||
      input.currency !== parent.currency
    )
      fail(
        "Choose an approved eligible source with matching currency and a valid document date.",
        "SALES_SOURCE_INELIGIBLE",
      );
    if (parent.kind !== "recurring" && parent.customer_id !== input.customer_id)
      fail("The customer must match the commercial source.", "SALES_SOURCE_CUSTOMER_MISMATCH");
  } else if (["delivery", "return", "credit"].includes(input.kind))
    fail("This transaction requires its approved original commercial source.", "SALES_SOURCE_REQUIRED");
  if (input.kind === "credit") await postedSalesInvoice(client, tenant, company, parent!.id);
  const template = input.template_id
    ? (historicalTemplate ??
      (parent?.id === input.template_id
        ? parent
        : await loadSalesSource(client, tenant, company, input.template_id, true)))
    : null;
  if (parent?.kind === "recurring" && !template)
    fail("A recurring invoice must retain its template and period identity.", "SALES_RECURRING_REFERENCE_REQUIRED");
  if (template) {
    if (
      template.kind !== "recurring" ||
      template.state !== "approved" ||
      !template.recurrence?.enabled ||
      !input.customer_id ||
      !template.recurrence.customer_ids.includes(input.customer_id) ||
      !input.billing_period
    )
      fail(
        "Choose an enabled approved template and its actual billing customer and period.",
        "SALES_RECURRING_INELIGIBLE",
      );
    const period = new Date(`${input.billing_period}T00:00:00.000Z`),
      start = new Date(`${template.recurrence.start_date}T00:00:00.000Z`);
    const months = (period.getUTCFullYear() - start.getUTCFullYear()) * 12 + period.getUTCMonth() - start.getUTCMonth();
    const weekly = template.recurrence.frequency === "weekly",
      step = template.recurrence.frequency === "quarterly" ? 3 : template.recurrence.frequency === "yearly" ? 12 : 1;
    const monthEnd = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    if (
      (weekly
        ? period.getTime() < start.getTime() || (period.getTime() - start.getTime()) % (7 * 86400000) !== 0
        : period.getUTCDate() !== 1 ||
          months < 0 ||
          months % step !== 0 ||
          monthEnd < template.recurrence.start_date) ||
      (template.recurrence.end_date && input.billing_period > template.recurrence.end_date) ||
      input.document_date < template.recurrence.start_date ||
      input.document_date < input.billing_period ||
      (template.recurrence.end_date && input.document_date > template.recurrence.end_date)
    )
      fail("The billing period is outside the template's approved schedule.", "SALES_RECURRING_PERIOD_INVALID");
  }
  if (input.recurrence) {
    if (
      new Set(input.recurrence.customer_ids).size !== input.recurrence.customer_ids.length ||
      (input.recurrence.end_date && input.recurrence.end_date < input.recurrence.start_date)
    )
      fail("Recurring customers must be unique and the schedule must be valid.");
    const customers = (
      await client.query<{ id: string }>(
        "select id from finance_party_directory where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and kind='customer' and status='active' and risk_status<>'blocked'",
        [tenant, company, input.recurrence.customer_ids],
      )
    ).rows;
    if (customers.length !== input.recurrence.customer_ids.length)
      fail("All recurring customers must be canonical active company customers.", "SALES_RECURRING_CUSTOMER_INVALID");
  }
  const productIds = [...new Set(input.lines.flatMap((line) => (line.product_id ? [line.product_id] : [])))];
  const products = new Map(
    (
      await client.query<{ record: unknown }>(
        `select p.details||jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'version',p.row_version,'type',p.type,'status',p.status,'stock_account_id',p.stock_account_id,'income_account_id',p.income_account_id,'expense_account_id',p.expense_account_id) record from inventory_product p where p.tenant_id=$1 and p.company_id=$2 and p.id=any($3::text[]) for share`,
        [tenant, company, productIds],
      )
    ).rows.map((row) => {
      const p = productSchema.parse(row.record);
      return [p.id, p];
    }),
  );
  const choices = await productUnitChoices(client, tenant, company, productIds);
  const ownedIds = new Set(previous?.lines.map((line) => line.id));
  const normalizedInput = input.lines.map((line) => ({
    ...line,
    quantity: formatQuantity(parseQuantity(line.quantity)),
  }));
  const amounts = salesAmounts(normalizedInput, authority.sourceDecimalPlaces, input.discount_amount);
  const lines: CanonicalSalesLine[] = [],
    readiness: string[] = [];
  for (const [index, line] of normalizedInput.entries()) {
    if (line.id && !ownedIds.has(line.id))
      fail("Line identities are reserved by their owning Sales document.", "SALES_LINE_IDENTITY_INVALID");
    const lineId = line.id ?? `sales-line-${randomUUID()}`,
      product = line.product_id ? products.get(line.product_id) : null;
    if (line.product_id && (!product || product.status !== "active" || !product.sales_enabled))
      fail("A selected product is unavailable or not sales enabled in this company.", "SALES_PRODUCT_INELIGIBLE");
    const sourceLine = line.source_line_id
      ? parent?.lines.find((source) => source.id === line.source_line_id)
      : undefined;
    if (line.source_line_id && !sourceLine)
      fail("Choose a line belonging to this exact approved source.", "SALES_SOURCE_LINE_INVALID");
    if (
      sourceLine &&
      (sourceLine.product_id !== line.product_id || (line.unit_id && sourceLine.unit_id !== line.unit_id))
    )
      fail("Source product identities and selected units must be preserved.", "SALES_SOURCE_LINE_CHANGED");
    if (
      sourceLine &&
      product &&
      (sourceLine.track_inventory !== product.track_inventory || sourceLine.product_type !== product.type)
    )
      fail(
        "The product's tracking classification changed after source approval. Review the source correction first.",
        "SALES_SOURCE_TRACKING_CHANGED",
      );
    if (parent && !sourceLine && (input.kind !== "invoice" || product?.track_inventory))
      fail("Physical/source-derived lines must retain their approved source line.", "SALES_SOURCE_LINE_REQUIRED");
    const templateLine = line.template_line_id
      ? template?.lines.find((source) => source.id === line.template_line_id)
      : undefined;
    if (template && (!templateLine || templateLine.product_id !== line.product_id))
      fail("Generated lines require their actual recurring-template line.", "SALES_TEMPLATE_LINE_REQUIRED");
    const unitId = line.unit_id ?? sourceLine?.unit_id;
    let unit;
    if (product) unit = productUnitSnapshot(choices.get(product.id)!, line.quantity, unitId);
    else {
      const row = (
        await client.query<{ record: unknown }>(
          "select jsonb_build_object('id',id,'name',name,'precision',precision,'status',status) record from inventory_unit u where tenant_id=$1 and company_id=$2 and status='active' and (id=$3 or($3::text is null and name='Each')) order by id limit 1 for share",
          [tenant, company, unitId ?? null],
        )
      ).rows[0];
      if (!row) fail("Choose an actual active company unit for the other charge.", "SALES_UNIT_REQUIRED");
      const selected = unitSchema.pick({ id: true, name: true, precision: true, status: true }).parse(row.record);
      if (salesMinor(line.quantity, selected.precision) <= 0n)
        fail("The charge quantity must fit the selected unit precision.");
      unit = unitSnapshotSchema.parse({
        unit_id: selected.id,
        unit_name: selected.name,
        base_unit_id: selected.id,
        base_unit_name: selected.name,
        entered_quantity: line.quantity,
        base_quantity: line.quantity,
        numerator: "1",
        denominator: "1",
        unit_precision: selected.precision,
        base_precision: selected.precision,
      });
    }
    if (sourceLine?.unit_snapshot) {
      const conversion = (snapshot: typeof unit) => ({
        unit_id: snapshot.unit_id,
        base_unit_id: snapshot.base_unit_id,
        numerator: snapshot.numerator,
        denominator: snapshot.denominator,
        unit_precision: snapshot.unit_precision,
        base_precision: snapshot.base_precision,
      });
      if (operationalDigest(conversion(unit)) !== operationalDigest(conversion(sourceLine.unit_snapshot)))
        fail(
          "The approved source unit conversion changed. Review its source correction before proceeding.",
          "SALES_SOURCE_UNIT_CHANGED",
        );
    }
    const dimensions = { ...line.dimensions };
    await client.query("select finance_validate_dimensions($1,$2,$3::jsonb)", [
      tenant,
      company,
      JSON.stringify(dimensions),
    ]);
    const net = amounts.lines[index]!.net;
    const tax =
      input.kind === "credit"
        ? await salesCreditTax(client, tenant, parent!, sourceLine!, net, line.tax_definition_id)
        : line.tax_definition_id
          ? await resolveTax(client, {
              tenant,
              company,
              definition: line.tax_definition_id,
              date: input.document_date,
              module: "sales",
              trigger: "recognition",
              currency: input.currency,
              precision: authority.sourceDecimalPlaces,
              basis: net,
            })
          : null;
    if (tax && tax.treatment !== "output")
      fail("Sales recognition requires a governed output-tax definition.", "SALES_TAX_CONTEXT_INVALID");
    if (tax) tax.source_item_id = lineId;
    else if (input.no_tax_reason.length < 3)
      readiness.push(`Line ${index + 1}: select a governed tax or record the approved untaxed treatment reason.`);
    const snapshot: CanonicalSalesLine["product"] = product
      ? { ...product, invoice_policy: sourceLine?.invoice_policy ?? product.invoice_policy }
      : {
          id: null,
          code: null,
          name: null,
          version: null,
          type: "charge",
          track_inventory: false,
          invoice_policy: "ordered",
        };
    const fulfillmentId =
      input.kind === "order" || (input.kind === "invoice" && !sourceLine)
        ? id
        : (sourceLine?.fulfillment_source_id ?? null);
    const fulfillmentLine =
      input.kind === "order" || (input.kind === "invoice" && !sourceLine)
        ? lineId
        : (sourceLine?.fulfillment_source_line_id ?? null);
    const taxAmount = decimalText(
      absolute(decimal(tax?.amount ?? "0", authority.sourceDecimalPlaces, true)),
      authority.sourceDecimalPlaces,
    );
    lines.push({
      product: snapshot,
      value: salesLineSchema.parse({
        ...line,
        id: lineId,
        unit_id: unit.unit_id,
        product_code: snapshot.code,
        product_name: snapshot.name,
        product_version: snapshot.version,
        product_type: snapshot.type,
        track_inventory: snapshot.track_inventory,
        invoice_policy: sourceLine?.invoice_policy ?? snapshot.invoice_policy,
        unit: unit.unit_name,
        unit_snapshot: unit,
        base_quantity: unit.base_quantity,
        fulfillment_source_id: fulfillmentId,
        fulfillment_source_line_id: fulfillmentLine,
        net_amount: net,
        tax_amount: taxAmount,
        total_amount: decimalText(
          salesMinor(net, authority.sourceDecimalPlaces) + salesMinor(taxAmount, authority.sourceDecimalPlaces),
          authority.sourceDecimalPlaces,
        ),
        allocated_discount_amount: amounts.lines[index]!.document_discount,
        tax_snapshot: tax,
      }),
    });
  }
  const taxTotal = lines.reduce(
      (sum, line) => sum + salesMinor(line.value.tax_amount, authority.sourceDecimalPlaces),
      0n,
    ),
    total = decimalText(
      salesMinor(amounts.net, authority.sourceDecimalPlaces) + taxTotal,
      authority.sourceDecimalPlaces,
    );
  let term = input.payment_term,
    due = input.due_date;
  if (input.kind === "invoice" && !due && !term) {
    term =
      (
        await client.query<{ payment_term: SalesDocumentInput["payment_term"] }>(
          "select payment_term from finance_party_configuration where tenant_id=$1 and company_id=$2 and party_id=$3 order by version desc limit 1",
          [tenant, company, input.customer_id],
        )
      ).rows[0]?.payment_term ?? null;
  }
  if (term)
    due = financialPaymentSchedule(input.document_date, term, total, authority.sourceDecimalPlaces).at(-1)!.due_date;
  if (input.kind === "invoice" && !due)
    readiness.push("Choose a manual due date or review the customer's financial payment terms.");
  return {
    input: { ...input, payment_term: term, due_date: due },
    lines,
    authority,
    net: amounts.net,
    tax: decimalText(taxTotal, authority.sourceDecimalPlaces),
    total,
    readiness: [...new Set(readiness)],
    sourceVersion: parent?.version ?? null,
    templateVersion: template?.version ?? null,
  };
}
