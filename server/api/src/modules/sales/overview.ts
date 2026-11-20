import type { PoolClient } from "pg";

/** Badges derive from actual uncompleted work; no sample counters or future jobs. */
export async function salesNavigation(client: PoolClient, tenant: string, company: string, asOf?: string) {
  const row = (
    await client.query<{ quotations: number; delivery: number; receipts: number; recurring: number }>(
      `
    select
      (select count(*)::int from sales_document where tenant_id=$1 and company_id=$2 and kind='quotation' and state='submitted') quotations,
      (select count(*)::int from sales_document d where d.tenant_id=$1 and d.company_id=$2 and d.kind='delivery' and d.state not in('cancelled','rejected')
        and not exists(select 1 from inventory_stock_operation o where(o.tenant_id,o.company_id,o.sales_document_id)=(d.tenant_id,d.company_id,d.id) and o.state='posted')) delivery,
      (select count(*)::int from finance_subledger_operation where tenant_id=$1 and company_id=$2 and type='settlement' and payload->>'side'='receivable' and state='draft') receipts,
      (select count(*)::int from sales_document d
        cross join lateral(select(d.details#>>'{recurrence,start_date}')::date starts,nullif(d.details#>>'{recurrence,end_date}','')::date ends,
          d.details#>>'{recurrence,frequency}' frequency,coalesce($3::date,current_date) cutoff) schedule
        cross join lateral(select case schedule.frequency when 'quarterly' then 3 when 'yearly' then 12 else 1 end step) frequency
        cross join lateral(select(case when schedule.frequency='weekly' then schedule.starts+7*((schedule.cutoff-schedule.starts)/7)
          else date_trunc('month',schedule.starts)::date+make_interval(months=>((extract(year from schedule.cutoff)::int-extract(year from schedule.starts)::int)*12+extract(month from schedule.cutoff)::int-extract(month from schedule.starts)::int)/frequency.step*frequency.step) end)::date period) billing
        where d.tenant_id=$1 and d.company_id=$2 and d.kind='recurring' and d.state='approved' and d.details#>>'{recurrence,enabled}'='true'
          and schedule.starts<=schedule.cutoff and(schedule.ends is null or schedule.ends>=schedule.cutoff)
          and exists(select 1 from jsonb_array_elements_text(d.details#>'{recurrence,customer_ids}') customer
            where not exists(select 1 from sales_document invoice where invoice.tenant_id=d.tenant_id and invoice.company_id=d.company_id and invoice.template_id=d.id
              and invoice.customer_id=customer and invoice.billing_period=billing.period and invoice.state<>'cancelled'))) recurring`,
      [tenant, company, asOf ?? null],
    )
  ).rows[0]!;
  return {
    quotations: row.quotations,
    "pick-pack-delivery": row.delivery,
    receipts: row.receipts,
    "recurring-bills": row.recurring,
  };
}
