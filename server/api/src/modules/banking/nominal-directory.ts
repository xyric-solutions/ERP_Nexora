import type { BankPaymentNominalAccountDirectory, BankPaymentNominalAccountDirectoryQuery } from "@nexora/contracts";
import type { PoolClient } from "pg";

type Availability = NonNullable<BankPaymentNominalAccountDirectory["availability"]>;

/** Read the existing company Chart of Accounts after the caller has authorized company access. */
export async function readBankNominalDirectory(
  client: PoolClient,
  tenantId: string,
  query: BankPaymentNominalAccountDirectoryQuery,
): Promise<BankPaymentNominalAccountDirectory> {
  const search = query.search ? `%${query.search.replace(/[\\%_]/g, "\\$&")}%` : null;
  // One snapshot keeps the explanation and selectable rows consistent. Counts never expose
  // another company, headers, account names or unapproved account identifiers.
  const result = await client.query<{
    items: BankPaymentNominalAccountDirectory["items"];
    availability: Omit<Availability, "has_more">;
  }>(
    `with classified as (
       select account.id,account.code,account.name,account.type as account_type,account.required_dimensions,
         case
           when not account.manual_posting_allowed or account.reconciliation_required or account.is_system_account
             or exists (select 1 from bank_account bank where bank.tenant_id=account.tenant_id
                         and bank.company_id=account.company_id and bank.account_id=account.id and bank.status='active')
             then 'protected'
           when general.state in ('draft','pending_approval','rejected') then 'pending_approval'
           when account.status<>'active' then 'inactive'
           else 'eligible'
         end as availability
       from account
       left join finance_general_nominal general on general.tenant_id=account.tenant_id
         and general.company_id=account.company_id and general.nominal_id=account.id
       where account.tenant_id=$1 and account.company_id=$2 and not account.is_header
     ), matching as (
       select id,code,name,account_type,required_dimensions from classified
       where availability='eligible' and ($3::text is null or code ilike $3 escape '\\' or name ilike $3 escape '\\')
     ), limited as (
       select * from matching order by code,name,id limit $4
     )
     select (select coalesce(jsonb_agg(to_jsonb(limited) order by code,name,id),'[]'::jsonb) from limited) as items,
       jsonb_build_object(
         'eligible_count',count(*) filter(where availability='eligible'),
         'matching_count',(select count(*) from matching),
         'pending_approval_count',count(*) filter(where availability='pending_approval'),
         'inactive_count',count(*) filter(where availability='inactive'),
         'protected_count',count(*) filter(where availability='protected')
       ) as availability from classified`,
    [tenantId, query.company_id, search, query.limit + 1],
  );
  const row = result.rows[0]!;
  return {
    items: row.items.slice(0, query.limit),
    availability: { ...row.availability, has_more: row.items.length > query.limit },
  };
}
