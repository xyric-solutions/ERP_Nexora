import type { PoolClient } from "pg";
import { z } from "zod";
import { salesSourceSchema, salesDocumentSchema, salesLineSchema, type SalesSource } from "@nexora/contracts";
import { operationalFailure as fail } from "../shared/operational-transaction.js";

const lines = `coalesce((select jsonb_agg(jsonb_build_object(
 'id',l.id,'source_line_id',l.source_line_id,'template_line_id',l.template_line_id,'product_id',l.product_id,
 'description',l.description,'quantity',trim_scale(l.quantity)::text,'unit_id',l.unit_id,'unit_price',l.unit_price::text,
 'discount_amount',l.discount_amount::text,'allocated_discount_amount',l.allocated_discount_amount::text,
 'tax_definition_id',l.tax_definition_id,'dimensions',l.dimensions,
 'product_code',l.product_snapshot->>'code','product_name',l.product_snapshot->>'name','product_version',(l.product_snapshot->>'version')::int,
 'product_type',l.product_snapshot->>'type','track_inventory',(l.product_snapshot->>'track_inventory')::boolean,
 'invoice_policy',l.product_snapshot->>'invoice_policy','unit',coalesce(l.unit_snapshot->>'unit_name',u.name),'unit_snapshot',l.unit_snapshot,
 'base_quantity',trim_scale(l.base_quantity)::text,'fulfillment_source_id',l.fulfillment_source_id,'fulfillment_source_line_id',l.fulfillment_source_line_id,
 'net_amount',l.net_amount::text,'tax_amount',l.tax_amount::text,'total_amount',l.total_amount::text,'tax_snapshot',l.tax_snapshot)
 order by l.line_no,l.id) from sales_document_line l join inventory_unit u on(u.tenant_id,u.company_id,u.id)=(l.tenant_id,l.company_id,l.unit_id)
 where(l.tenant_id,l.company_id,l.document_id)=(d.tenant_id,d.company_id,d.id) and l.active),'[]'::jsonb)`;
export const salesSourceProjection = `jsonb_build_object(
 'id',d.id,'company_id',d.company_id,'kind',d.kind,'code',d.code,'state',d.state,'version',d.row_version,'maker_id',d.maker_id,
 'customer_id',d.customer_id,'source_id',d.source_id,'template_id',d.template_id,'billing_period',d.billing_period::text,
 'document_date',d.document_date::text,'due_date',d.due_date::text,'currency',d.currency,'base_currency',d.base_currency,'decimal_places',d.decimal_places,
 'project_id',d.project_id,'location_id',d.location_id,'warehouse_id',d.warehouse_id,'approver_id',d.approver_id,
 'reference',d.details->>'reference','notes',d.details->>'notes','no_tax_reason',d.details->>'no_tax_reason',
 'discount_amount',d.details->>'discount_amount','payment_term',d.details->'payment_term','valid_until',d.details->'valid_until',
 'recurrence',d.details->'recurrence','readiness',d.details->'readiness',
 'net_amount',d.net_amount::text,'tax_amount',d.tax_amount::text,'total_amount',d.total_amount::text,
 'exchange_rate_id',d.exchange_rate_id,'exchange_rate',d.exchange_rate::text,'exchange_rate_date',d.exchange_rate_date::text,
 'created_at',d.created_at::text,'updated_at',d.updated_at::text,'lines',${lines})`;

export async function loadSalesSource(
  client: PoolClient,
  tenant: string,
  company: string,
  id: string,
  lock = false,
): Promise<SalesSource> {
  const row = (
    await client.query<{ record: unknown }>(
      `select ${salesSourceProjection} record from sales_document d where(d.tenant_id,d.company_id,d.id)=($1,$2,$3) ${lock ? "for share of d" : ""}`,
      [tenant, company, id],
    )
  ).rows[0];
  if (!row) fail("The commercial source was not found in this company.", "SALES_NOT_FOUND", 404);
  return salesSourceSchema.parse(row.record);
}
/** Approved generated invoices retain the actual approved template revision. */
export async function loadSalesSourceVersion(
  client: PoolClient,
  tenant: string,
  company: string,
  id: string,
  version: number,
) {
  const row = (
    await client.query<{ snapshot: unknown }>(
      "select snapshot from sales_document_audit where(tenant_id,company_id,document_id,version)=($1,$2,$3,$4)",
      [tenant, company, id, version],
    )
  ).rows[0];
  if (!row) fail("The retained approved commercial revision is missing.", "SALES_SOURCE_REVISION_REQUIRED");
  const raw = z.record(z.string(), z.unknown()).parse(row.snapshot),
    details = z.record(z.string(), z.unknown()).parse(raw.details);
  const pick = (shape: Record<string, unknown>, value: Record<string, unknown>) =>
    Object.fromEntries(Object.keys(shape).map((key) => [key, value[key]]));
  const lines = z
    .array(z.record(z.string(), z.unknown()))
    .parse(raw.lines)
    .map((line) => {
      const product = z.record(z.string(), z.unknown()).parse(line.product_snapshot),
        unit = z.record(z.string(), z.unknown()).parse(line.unit_snapshot);
      return salesLineSchema.parse({
        ...pick(salesLineSchema.shape, line),
        source_line_id: line.source_line_id ?? null,
        template_line_id: line.template_line_id ?? null,
        product_code: product.code,
        product_name: product.name,
        product_version: product.version,
        product_type: product.type,
        track_inventory: product.track_inventory,
        invoice_policy: product.invoice_policy,
        unit: unit.unit_name,
      });
    });
  return salesSourceSchema.parse({
    ...pick(salesSourceSchema.shape, { ...raw, ...details }),
    version: raw.row_version,
    lines,
  });
}
export const salesDocumentSelect = `select ${salesSourceProjection}||jsonb_build_object(
    'recurring_customers',coalesce((select jsonb_agg(jsonb_build_object('id',customer.id,'code',customer.code,'name',customer.name) order by customer.code,customer.id) from finance_party_directory customer where(customer.tenant_id,customer.company_id)=(d.tenant_id,d.company_id) and customer.id in(select jsonb_array_elements_text(coalesce(d.details#>'{recurrence,customer_ids}','[]'::jsonb)))),'[]'::jsonb),
    'customer_code',p.code,'customer_name',p.name,'project_name',project.code||' · '||project.name,'location_name',location.code||' · '||location.name,
    'warehouse_name',warehouse.name,'source_code',source.code,'source_kind',source.kind,'maker_name',coalesce(nullif(btrim(maker.display_name),''),maker.id),
    'approver_name',coalesce(nullif(btrim(approver.display_name),''),approver.id),
    'stock_operation_id',stock.id,'financial_operation_id',financial.id,'subledger_item_id',item.id,'outstanding',balance.outstanding,
    'posting_state',case when financial.state='posted' and exists(select 1 from finance_subledger_operation r where(r.tenant_id,r.company_id,r.payload->>'operation_id')=(financial.tenant_id,financial.company_id,financial.id) and r.type='reversal' and r.state='posted') then 'reversed'
      when financial.id is not null then financial.state when stock.id is not null then stock.state else 'unprepared' end) record
    from sales_document d
    left join finance_party_directory p on(p.tenant_id,p.company_id,p.id)=(d.tenant_id,d.company_id,d.customer_id)
    join erp_project project on(project.tenant_id,project.company_id,project.id)=(d.tenant_id,d.company_id,d.project_id)
    join erp_location location on(location.tenant_id,location.company_id,location.id)=(d.tenant_id,d.company_id,d.location_id)
    left join inventory_warehouse warehouse on(warehouse.tenant_id,warehouse.company_id,warehouse.id)=(d.tenant_id,d.company_id,d.warehouse_id)
    left join sales_document source on(source.tenant_id,source.company_id,source.id)=(d.tenant_id,d.company_id,d.source_id)
    join security_user_account maker on(maker.tenant_id,maker.id)=(d.tenant_id,d.maker_id)
    left join security_user_account approver on(approver.tenant_id,approver.id)=(d.tenant_id,d.approver_id)
    left join finance_subledger_operation financial on(financial.tenant_id,financial.company_id,financial.sales_document_id)=(d.tenant_id,d.company_id,d.id)
    left join finance_subledger_item item on(item.tenant_id,item.company_id,item.sales_document_id)=(d.tenant_id,d.company_id,d.id)
    left join lateral(select sum(e.foreign_delta)::text outstanding from finance_subledger_item_event e where(e.tenant_id,e.company_id,e.item_id)=(item.tenant_id,item.company_id,item.id))balance on true
    left join lateral(select o.id,o.state from inventory_stock_operation o where(o.tenant_id,o.company_id,o.sales_document_id)=(d.tenant_id,d.company_id,d.id) and o.state<>'cancelled' order by o.created_at desc,o.id limit 1)stock on true
    `;
export async function loadSalesDocument(client: PoolClient, tenant: string, company: string, id: string) {
  const row = (
    await client.query<{ record: unknown }>(`${salesDocumentSelect} where(d.tenant_id,d.company_id,d.id)=($1,$2,$3)`, [
      tenant,
      company,
      id,
    ])
  ).rows[0];
  if (!row) fail("The commercial document was not found in this company.", "SALES_NOT_FOUND", 404);
  return salesDocumentSchema.parse(row.record);
}
