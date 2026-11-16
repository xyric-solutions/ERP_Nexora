import { assetDashboardSchema, assetQuerySchema, type AssetQuery } from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { SourceAssetRepository } from "./source-repository.js";
import { refundBalanceQuery, refundOutstandingExpression } from "./refunds.js";

export class AssetReportService {
  constructor(readonly repository: SourceAssetRepository) {}
  async dashboard(context: BankingActorContext, raw: AssetQuery, report = false) {
    const query = assetQuerySchema.parse(raw);
    return this.repository.transaction(context, query.company_id, report ? "report" : "read", false, async (client) => {
      const { where, parameters: values } = this.repository.assetScope(context.tenantId, query);
      const scope = `with scoped as(select * from fixed_asset_record where ${where})`;
      const totals = (
        await client.query(
          `${scope} select count(*)::int as total,
   count(*) filter(where status in ('active','fully_depreciated'))::int as active,count(*) filter(where status='returned')::int as returned,count(*) filter(where status='disposed')::int as disposed,
   count(*) filter(where status in ('active','fully_depreciated') and details->>'verification_due' is not null and (details->>'verification_due')::date<=current_date)::int as verification_due,
   count(*) filter(where status in ('active','fully_depreciated') and (details->>'warranty_end')::date between current_date and current_date+30)::int as warranty_expiring,
   count(*) filter(where status='active' and depreciation_start<=current_date and (last_depreciation_end is null or last_depreciation_end<date_trunc('month',current_date)))::int as depreciation_due,
   (select count(distinct e.asset_id)::int from fixed_asset_event e join scoped a on a.tenant_id=e.tenant_id and a.company_id=e.company_id and a.id=e.asset_id where a.status not in ('returned','disposed') and e.type='maintenance' and e.state='posted' and (e.input->>'maintenance_status'='in_progress' or ((e.input->>'next_date')::date<=current_date)) and not exists(select 1 from fixed_asset_event n where n.tenant_id=e.tenant_id and n.company_id=e.company_id and n.asset_id=e.asset_id and n.type='maintenance' and n.state='posted' and (n.event_date,n.created_at,n.id)>(e.event_date,e.created_at,e.id))) as maintenance,
   coalesce(sum(cost) filter(where status not in ('returned','disposed')),0)::text as cost,
   coalesce(sum(accumulated_depreciation) filter(where status not in ('returned','disposed')),0)::text as accumulated_depreciation,
   coalesce(sum(impairment) filter(where status not in ('returned','disposed')),0)::text as impairment,
   coalesce(sum(cost-accumulated_depreciation-impairment) filter(where status not in ('returned','disposed')),0)::text as net_book_value
   from scoped`,
          values,
        )
      ).rows[0]!;
      const groups = [];
      const groupPages = [];
      for (const dimension of [
        "category",
        "department",
        "location",
        "project",
        "custodian",
        "acquisition_month",
      ] as const) {
        const expression =
          dimension === "category"
            ? "category_id"
            : dimension === "acquisition_month"
              ? "to_char(acquisition_date,'YYYY-MM')"
              : `coalesce(assignment->>'${dimension}_id','unassigned')`;
        const table = {
          category: "fixed_asset_category",
          department: "organization_unit",
          location: "erp_location",
          project: "erp_project",
          custodian: "employee",
          acquisition_month: null,
        }[dimension];
        const rows = await client.query(
          `${scope}, grouped as(select ${expression} as id,count(*)::int as count,coalesce(sum(cost),0)::text as cost,coalesce(sum(accumulated_depreciation),0)::text as accumulated_depreciation,coalesce(sum(impairment),0)::text as impairment,coalesce(sum(cost-accumulated_depreciation-impairment),0)::text as net_book_value from scoped where status not in ('returned','disposed') group by ${expression})
    select g.*,count(*) over()::int as group_total,${table ? `case when g.id='unassigned' then 'Unassigned' else coalesce(${dimension === "custodian" ? "concat_ws(' ',n.first_name,n.last_name)" : "n.name"},g.id) end` : "g.id"} as label from grouped g ${table ? `left join ${table} n on n.tenant_id=$1 and n.id=g.id ${dimension === "department" || dimension === "custodian" ? "" : "and n.company_id=$2"}` : ""} order by g.id limit $${values.length + 1} offset $${values.length + 2}`,
          [...values, query.limit + 1, query.offset],
        );
        groupPages.push({
          dimension,
          total: rows.rows[0]?.group_total ?? 0,
          next_offset: rows.rows.length > query.limit ? query.offset + query.limit : null,
        });
        groups.push(
          ...rows.rows.slice(0, query.limit).map(({ group_total, ...row }) => {
            void group_total;
            return { ...row, dimension };
          }),
        );
      }
      const refund = (await client.query<{ amount: string }>(refundBalanceQuery(scope), values)).rows[0]!.amount;
      const refundRows = await client.query(
        `${scope},refunds as(select r.asset_id,a.code as asset_code,a.details->>'name' as asset_name,coalesce(s.name,'Unassigned supplier') as supplier_name,r.code as return_code,r.event_date::text as date,r.preview->>'amount' as amount,round(${refundOutstandingExpression},a.decimal_places)::text as outstanding from fixed_asset_event r join scoped a on a.tenant_id=r.tenant_id and a.company_id=r.company_id and a.id=r.asset_id left join procurement_supplier s on s.tenant_id=a.tenant_id and s.company_id=a.company_id and s.id=a.supplier_id where r.state='posted' and r.type='return') select * from refunds where outstanding::numeric>0 order by date,return_code limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, query.limit + 1, query.offset],
      );
      // Reconcile all registered accounting-policy snapshots, including inactive categories.
      // Other/unregistered balances remain visible as differences rather than being hidden.
      const reconciliation = (
        await client.query(
          `with register as(
    select category_snapshot->>'asset_account_id' as account_id,'asset'::text as role,sum(case when status in ('returned','disposed') then 0 else cost-impairment end) as balance from fixed_asset_record where tenant_id=$1 and company_id=$2 group by category_snapshot->>'asset_account_id'
    union all select category_snapshot->>'accumulated_account_id','accumulated',sum(case when status in ('returned','disposed') then 0 else -accumulated_depreciation end) from fixed_asset_record where tenant_id=$1 and company_id=$2 group by category_snapshot->>'accumulated_account_id'
   ), roles as(select account_id,role,sum(balance) as register_balance from register group by account_id,role)
   select r.account_id,a.name as account_name,r.role,r.register_balance::text,coalesce(g.balance,0)::text as gl_balance,(coalesce(g.balance,0)-r.register_balance)::text as difference from roles r join account a on a.tenant_id=$1 and a.company_id=$2 and a.id=r.account_id
   left join lateral(select sum(l.base_debit-l.base_credit) as balance from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id where l.tenant_id=$1 and j.company_id=$2 and l.account_id=r.account_id and j.status in ('posted','reversed')) g on true order by a.code,r.role`,
          [context.tenantId, query.company_id],
        )
      ).rows;
      return assetDashboardSchema.parse({
        ...totals,
        refund_outstanding: refund,
        refunds: refundRows.rows.slice(0, query.limit),
        refunds_next_offset: refundRows.rows.length > query.limit ? query.offset + query.limit : null,
        groups,
        group_pages: groupPages,
        reconciliation,
      });
    });
  }
}
