/** Shared availability: a posted instruction is no longer a reservation. Its
 * journal events reduce AP instead; reversing it reinstates the reservation. */
export function purchaseReservationSql(asOf?: "$3::date") {
  return `coalesce((select sum((a->>'amount')::numeric+coalesce((a->>'discount')::numeric,0))
    from procurement_document payment cross join lateral jsonb_array_elements(payment.allocations) a
    where payment.tenant_id=d.tenant_id and payment.company_id=d.company_id and payment.state='approved'
      and payment.kind in ('payment','multi_payment') ${asOf ? `and payment.document_date<=${asOf}` : ""}
      and payment.allocations @> jsonb_build_array(jsonb_build_object('bill_id',d.id)) and a->>'bill_id'=d.id
      and not exists(select 1 from procurement_accounting_link link join finance_subledger_operation op
        on op.tenant_id=link.tenant_id and op.company_id=link.company_id and op.id=link.operation_id
        where link.tenant_id=payment.tenant_id and link.company_id=payment.company_id and link.document_id=payment.id
          and op.state='posted' ${asOf ? `and op.operation_date<=${asOf}` : ""}
          and not exists(select 1 from finance_subledger_operation r where r.tenant_id=op.tenant_id and r.company_id=op.company_id
            and r.type='reversal' and r.state='posted' and r.payload->>'operation_id'=op.id ${asOf ? `and r.operation_date<=${asOf}` : ""}))),0)`;
}
