// Supplier credit balances remain owned by Accounting, including tax, offsets and FX.
export const refundOutstandingExpression = `case when r.input->>'credit_note_item_id' is null then
 greatest((r.preview->>'amount')::numeric-coalesce((select sum((f.preview->>'amount')::numeric) from fixed_asset_event f where f.tenant_id=r.tenant_id and f.company_id=r.company_id and f.type='refund' and f.state='posted' and f.input->>'return_event_id'=r.id),0),0)
 else least((r.preview->>'amount')::numeric,greatest(-coalesce((select sum(e.base_delta) from finance_subledger_item_event e where e.tenant_id=r.tenant_id and e.company_id=r.company_id and e.item_id=r.input->>'credit_note_item_id'),0),0)*(r.preview->>'amount')::numeric/nullif(abs((select i.original_base from finance_subledger_item i where i.tenant_id=r.tenant_id and i.company_id=r.company_id and i.id=r.input->>'credit_note_item_id')),0)) end`;
// The caller supplies only a trusted SQL scope and bound values. Supplier credit
// balances remain owned by Finance, including offsets, refunds and FX valuation.
export function refundBalanceQuery(scope: string) {
  return `${scope}, returns as(
 select e.* from fixed_asset_event e join scoped a on a.tenant_id=e.tenant_id and a.company_id=e.company_id and a.id=e.asset_id where e.state='posted' and e.type='return')
 select round(coalesce(sum(${refundOutstandingExpression}),0),
 (select decimal_places from currency c join company_currency_profile p on p.tenant_id=c.tenant_id and p.base_currency=c.code where p.tenant_id=$1 and p.company_id=$2))::text as amount from returns r`;
}
