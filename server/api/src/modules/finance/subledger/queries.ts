import type { SubledgerQuery } from "@nexora/contracts";

/** Shared dated aggregate; aggregation stays in PostgreSQL, before paging. */
export const itemBalancesSql = `with item_balances as (
 select i.*,p.name as party_name,coalesce(sum(e.foreign_delta),0) as outstanding,
   coalesce(sum(e.base_delta),0) as carrying,coalesce(sum(e.historical_delta),0) as historical,
   coalesce(sum(e.unrealized_delta),0) as unrealized,($3::date-i.due_date) as overdue_days
 from finance_subledger_item i
 join finance_subledger_party p on p.tenant_id=i.tenant_id and p.company_id=i.company_id and p.id=i.party_id
 join finance_subledger_item_event e on e.tenant_id=i.tenant_id and e.company_id=i.company_id and e.item_id=i.id and e.event_date<=$3::date
 where i.tenant_id=$1 and i.company_id=$2 and i.document_date<=$3::date
 and ($4::text is null or i.party_id=$4) and ($5::text is null or i.side=$5) and ($6::text is null or i.currency=$6)
 group by i.tenant_id,i.company_id,i.id,p.name
)`;

export function itemBalanceParameters(
  tenant: string,
  query: Pick<SubledgerQuery, "company_id" | "as_of" | "party_id" | "side" | "currency">,
) {
  return [tenant, query.company_id, query.as_of, query.party_id ?? null, query.side ?? null, query.currency ?? null];
}
