import type { PoolClient } from "pg";
import { assetSourceSchema, type AssetSource } from "@nexora/contracts";

// Only original posted financial sources qualify. Purchase approval alone never does.
export async function acquisitionSources(
  client: PoolClient,
  tenant: string,
  company: string,
  offset = 0,
  limit = 30,
  line?: string,
  sourceId?: string,
): Promise<AssetSource[]> {
  const result = await client.query(
    `select d.code as purchase_bill_reference,d.reference as vendor_invoice_reference,coalesce(d.bill_date,d.document_date)::text as invoice_date,d.document_date::text as purchase_date,
    (select po.code from procurement_document po where po.tenant_id=d.tenant_id and po.company_id=d.company_id and po.id=d.source_id and po.kind='order') as purchase_order_reference,
    l.id as line_id,j.id as journal_id,j.entry_number,j.posting_date::text as date,
    l.account_id,a.name as account_name,case when bp.id is not null then 'bank_payment' else 'purchase_invoice' end as source_type,
    coalesce(bp.id,i.id) as source_id,coalesce(bp.reference,d.code) as reference,p.source_supplier_id as supplier_id,p.name as supplier_name,
    d.id as purchase_document_id,bp.bank_account_id,l.currency,coalesce(l.fx_rate,1)::text as exchange_rate,profile.base_currency,
    (l.base_debit-l.base_credit)::text as base_amount,coalesce(reserved.amount,0)::text as allocated,
    (l.base_debit-l.base_credit-coalesce(reserved.amount,0))::text as available,l.dimensions
    from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id
    join account a on a.tenant_id=l.tenant_id and a.company_id=j.company_id and a.id=l.account_id
    join company_currency_profile profile on profile.tenant_id=j.tenant_id and profile.company_id=j.company_id
    left join bank_payment bp on bp.tenant_id=j.tenant_id and bp.company_id=j.company_id and bp.original_journal_entry_id=j.id and bp.state='posted'
    left join finance_subledger_item i on i.tenant_id=j.tenant_id and i.company_id=j.company_id and i.journal_id=j.id and i.side='payable' and i.kind='invoice'
    left join finance_subledger_party p on p.tenant_id=i.tenant_id and p.company_id=i.company_id and p.id=i.party_id
    left join procurement_document d on d.tenant_id=i.tenant_id and d.company_id=i.company_id and d.id=i.source_document_id and d.state='approved' and d.kind='bill'
    left join lateral(select sum(amount) as amount from fixed_asset_acquisition r where r.tenant_id=l.tenant_id and r.company_id=j.company_id and r.source_line_id=l.id) reserved on true
    where j.tenant_id=$1 and j.company_id=$2 and j.status='posted' and l.base_debit>l.base_credit
      and a.type='asset' and not a.reconciliation_required and (bp.id is not null or (i.id is not null and d.id is not null and p.source_supplier_id=d.supplier_id))
      and (i.id is null or not exists(select 1 from finance_subledger_operation r where r.tenant_id=i.tenant_id and r.company_id=i.company_id and r.state='posted' and r.type='reversal' and r.payload->>'operation_id'=i.operation_id))
      and ($5::text is null or l.id=$5)
      and ($5::text is not null or exists(select 1 from fixed_asset_category c where c.tenant_id=j.tenant_id and c.company_id=j.company_id and c.asset_account_id=l.account_id and c.active))
      and ($6::text is null or bp.id=$6 or i.id=$6 or d.id=$6)
    order by j.posting_date desc,j.id,l.line_number limit $3 offset $4`,
    [tenant, company, limit, offset, line ?? null, sourceId ?? null],
  );
  return result.rows.map((row) => assetSourceSchema.parse(row));
}
export async function hasAssetJournalReferences(client: PoolClient, tenant: string, company: string, journal: string) {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `fixed-asset-source-journal:${tenant}:${company}:${journal}`,
  ]);
  const row = (
    await client.query<{ referenced: boolean }>(
      `select exists(select 1 from fixed_asset_acquisition a join journal_line l on l.tenant_id=a.tenant_id and l.id=a.source_line_id where a.tenant_id=$1 and a.company_id=$2 and l.journal_id=$3)
    or exists(select 1 from fixed_asset_event where tenant_id=$1 and company_id=$2 and state='posted' and (journal_id=$3 or preview->>'linked_journal_id'=$3))
    or exists(select 1 from fixed_asset_depreciation_run where tenant_id=$1 and company_id=$2 and state in ('posted','reversed') and (journal_id=$3 or reversal_journal_id=$3)) as referenced`,
      [tenant, company, journal],
    )
  ).rows[0]!;
  return row.referenced;
}
