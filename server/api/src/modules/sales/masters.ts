import type { PoolClient } from "pg";
import { salesLookupDirectorySchema, type SalesLookupQuery } from "@nexora/contracts";
import { operationalFailure as fail } from "../shared/operational-transaction.js";

/** Workflow-owned, bounded master directories; no fixture fallback or master writes. */
export async function lookupSales(client: PoolClient, tenant: string, query: SalesLookupQuery) {
  const params = [
    tenant,
    query.company_id,
    `%${query.search.replace(/[\\%_]/g, "\\$&")}%`,
    query.as_of ?? null,
    query.customer_id ?? null,
    query.warehouse_id ?? null,
    query.currency ?? null,
    query.source_kind ?? null,
  ];
  let source: string;
  switch (query.kind) {
    case "customer":
      source = `select p.id,p.code,p.name,'customer'::text type,p.default_currency currency,null::text price,null::text unit,null::text quantity,null::int decimal_places,
      case when c.version is null then null else jsonb_build_object('company_id',c.company_id,'party_id',c.party_id,'version',c.version,'payment_term',c.payment_term,'credit_limit',c.credit_limit::text,'credit_currency',c.credit_currency,'reason',c.reason) end financial_configuration
      from finance_party_directory p left join lateral(select * from finance_party_configuration c where(c.tenant_id,c.company_id,c.party_id)=(p.tenant_id,p.company_id,p.id) order by version desc limit 1)c on true
      where p.tenant_id=$1 and p.company_id=$2 and p.kind='customer' and p.status='active' and p.risk_status<>'blocked'`;
      break;
    case "product":
      source = `select p.id,p.code,p.name,p.type,p.currency,(p.details->>'sale_price')::numeric::text price,p.details->>'unit' unit,p.details->>'unit_id' unit_id,
      case when p.details->>'track_inventory'='true' then(select coalesce(sum(e.quantity),0)::text from inventory_stock_entry e where(e.tenant_id,e.company_id,e.product_id)=(p.tenant_id,p.company_id,p.id) and($6::text is null or e.warehouse_id=$6)) else null end quantity,
      c.decimal_places from inventory_product p join currency c on(c.tenant_id,c.code)=(p.tenant_id,p.currency)
      where p.tenant_id=$1 and p.company_id=$2 and p.status='active' and p.details->>'sales_enabled'='true'`;
      break;
    case "warehouse":
      source =
        "select id,code,name,'warehouse'::text type,null::text currency,null::text price,null::text unit,null::text quantity,null::int decimal_places from inventory_warehouse where tenant_id=$1 and company_id=$2 and status='active'";
      break;
    case "unit":
      source =
        "select id,code,name,category type,null::text currency,null::text price,name unit,id unit_id,null::text quantity,precision decimal_places from inventory_unit where tenant_id=$1 and company_id=$2 and status='active'";
      break;
    case "project":
    case "location":
      source = `select id,code,name,'${query.kind}'::text type,null::text currency,null::text price,null::text unit,null::text quantity,null::int decimal_places from ${query.kind === "project" ? "erp_project" : "erp_location"} where tenant_id=$1 and company_id=$2 and status='active'`;
      break;
    case "approver":
      source = `select u.id,u.id code,coalesce(nullif(btrim(u.display_name),''),u.id) name,'approver'::text type,null::text currency,null::text price,null::text unit,null::text quantity,null::int decimal_places
      from security_user_account u where u.tenant_id=$1 and u.status='active' and u.archived_at is null and bank_has_live_permission(u.tenant_id,$2,u.id,'sales.document.approve')`;
      break;
    case "currency":
      source = `select c.currency_code id,c.currency_code code,s.name,'currency'::text type,c.currency_code currency,null::text price,null::text unit,null::text quantity,s.decimal_places
      from company_currency c join currency s on(s.tenant_id,s.code)=(c.tenant_id,c.currency_code) where c.tenant_id=$1 and c.company_id=$2 and c.status='active' and s.status='active'`;
      break;
    case "tax":
      source = `select d.id,d.code,r.name,'tax'::text type,g.currency,null::text price,null::text unit,null::text quantity,null::int decimal_places,r.rate::text tax_rate
      from finance_tax_definition d join lateral(select * from finance_tax_revision r where(r.tenant_id,r.company_id,r.definition_id)=(d.tenant_id,d.company_id,d.id) and r.effective_date<=coalesce($4::date,current_date) order by r.effective_date desc,r.revision desc limit 1)r on true
      join finance_tax_mapping_rule m on(m.tenant_id,m.company_id,m.definition_id,m.revision)=(r.tenant_id,r.company_id,r.definition_id,r.revision)
      join account a on(a.tenant_id,a.company_id,a.id)=(m.tenant_id,m.company_id,m.account_id) left join finance_general_nominal g on(g.tenant_id,g.company_id,g.nominal_id)=(a.tenant_id,a.company_id,a.id)
      where d.tenant_id=$1 and d.company_id=$2 and d.status='active' and m.module='sales' and m.treatment='output' and m.trigger='recognition'
       and a.status='active' and a.type='liability' and not a.is_header and not a.reconciliation_required and not a.managed_bank_nominal
       and not finance_is_subledger_control(a.tenant_id,a.company_id,a.id) and($7::text is null or g.currency is null or g.currency=$7)`;
      break;
    case "source":
      if (!query.source_kind) fail("Choose the commercial source kind.", "SALES_SOURCE_KIND_REQUIRED", 400);
      source = `select d.id,d.code,coalesce(p.name,d.details->>'reference','') name,d.kind type,d.currency,null::text price,null::text unit,null::text quantity,d.decimal_places
        from sales_document d left join finance_party_directory p on(p.tenant_id,p.company_id,p.id)=(d.tenant_id,d.company_id,d.customer_id)
        where d.tenant_id=$1 and d.company_id=$2 and d.state='approved' and d.kind=$8 and($5::text is null or d.customer_id=$5)`;
      break;
  }
  // Typed placeholder anchors keep each branch's prepared parameter types stable.
  const filter =
    "(code ilike $3 escape '\\' or name ilike $3 escape '\\' or id ilike $3 escape '\\') and($4::date is null or true) and($5::text is null or true) and($6::text is null or true) and($7::text is null or true) and($8::text is null or true)";
  const items = (
    await client.query(`select * from(${source})s where ${filter} order by code,id limit $9 offset $10`, [
      ...params,
      query.limit,
      query.offset,
    ])
  ).rows;
  const total = (await client.query<{ n: number }>(`select count(*)::int n from(${source})s where ${filter}`, params))
    .rows[0]!.n;
  return salesLookupDirectorySchema.parse({ items, total });
}
