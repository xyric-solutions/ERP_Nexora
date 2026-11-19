import type { PoolClient } from "pg";
import { connectedReportSchema, type ConnectedReport, type ConnectedReportQuery } from "@nexora/contracts";
import type { BankingActorContext } from "../../banking/source-repository.js";
import { SubledgerError, type SourceSubledgerRepository } from "./source-repository.js";
import { purchaseReservationSql } from "../../procurement/accounting-projection.js";

type Column = ConnectedReport["columns"][number];
const text = (key: string, label: string): Column => ({ key, label, kind: "text" });
const amount = (key: string, label: string): Column => ({ key, label, kind: "amount" });
const quantity = (key: string, label: string): Column => ({ key, label, kind: "quantity" });
type Adapter = { sql: string; columns: Column[]; notes: string[]; permission: string };
// Each adapter emits the same source identity and explicit native currency.
const purchaseBase = `from procurement_document d left join procurement_supplier s on s.tenant_id=d.tenant_id and s.company_id=d.company_id and s.id=d.supplier_id
 left join procurement_document src on src.tenant_id=d.tenant_id and src.company_id=d.company_id and src.id=d.source_id
 left join lateral(select op.id,case when exists(select 1 from finance_subledger_operation r where r.tenant_id=op.tenant_id and r.company_id=op.company_id and r.type='reversal' and r.state='posted' and r.operation_date<=$3::date and r.payload->>'operation_id'=op.id) then 'reversed' else op.state end as state,op.journal_id,coalesce(op.payload->>'bank_fee','0') as bank_fee from finance_subledger_operation op where op.tenant_id=d.tenant_id and op.company_id=d.company_id and op.payload->>'source_document_id'=d.id and op.operation_date<=$3::date and op.type in ('recognition','purchase_payment') order by (op.state='posted') desc,op.created_at limit 1) financial on true`;
const purchaseScope = `d.tenant_id=$1 and d.company_id=$2 and d.document_date<=$3::date`;
const pageSql = `case d.kind when 'request' then 'purchase-requisitions' when 'rfq' then 'rfqs' when 'order' then 'purchase-orders' when 'receipt' then 'goods-receipts' when 'bill' then 'purchase-bills' when 'multi_payment' then 'multi-vendor-payments' else 'payments' end`;
const purchaseIdentity = `d.id,d.document_date as date,d.code,coalesce(s.name,'No supplier selected') as name,d.currency,null::text as bank_id,d.supplier_id,'purchases'::text as source_module,${pageSql} as source_page,d.id as source_id,financial.journal_id`;
const linkedOutstanding = `coalesce((select sum(e.foreign_delta) from finance_subledger_item i join finance_subledger_item_event e on e.tenant_id=i.tenant_id and e.company_id=i.company_id and e.item_id=i.id and e.event_date<=$3::date where i.tenant_id=d.tenant_id and i.company_id=d.company_id and i.source_document_id=d.id and i.side='payable'),d.total_amount)`;

function adapter(report: ConnectedReportQuery["report"]): Adapter {
  const purchase = {
    permission: "procurement.document.read",
    notes: ["Commercial approval is separate from accounting posting. Amounts remain in each document's currency."],
  };
  const bank = {
    permission: "banking.bank_account.read",
    notes: [
      "Book balances use posted and reversed journal history, including compensating reversal entries. Imported statements are separate external evidence.",
    ],
  };
  if (["bank-account-activity-report", "bank-balance-report", "cash-position-report"].includes(report)) {
    const movements = `select b.id as bank_id,b.account_name as name,b.reference as code,b.currency,j.posting_date as date,j.id as journal_id,j.entry_number,
      l.id as line_id,l.debit,l.credit,j.status,coalesce(op.payload->>'reference',j.entry_number) as reference,
      coalesce(op.payload->>'source_document_id','') as purchase_id,coalesce(op.type,j.source_type) as source_type
      from bank_account b join journal_line l on l.tenant_id=b.tenant_id and l.account_id=b.account_id and l.currency=b.currency
      join journal_entry j on j.tenant_id=l.tenant_id and j.company_id=b.company_id and j.id=l.journal_id
      left join finance_subledger_operation op on op.tenant_id=j.tenant_id and op.company_id=j.company_id and op.journal_id=j.id
      where b.tenant_id=$1 and b.company_id=$2 and j.status in ('posted','reversed') and j.posting_date<=$3::date`;
    if (report === "bank-account-activity-report")
      return {
        ...bank,
        columns: [
          text("reference", "Reference"),
          text("source_type", "Source"),
          text("status", "Journal state"),
          amount("debit", "Money in"),
          amount("credit", "Money out"),
          amount("opening", "Opening"),
          amount("closing", "Balance after movement"),
        ],
        sql: `with movements as(${movements}), running as(select *,coalesce(sum(debit-credit) filter(where date<coalesce($4::date,'0001-01-01')) over(partition by bank_id),0) as opening,sum(debit-credit) over(partition by bank_id order by date,journal_id,line_id rows unbounded preceding) as closing from movements)
      select line_id as id,date,code,name,currency,bank_id,null::text as supplier_id,
      case when purchase_id<>'' then 'purchases' else 'accounting' end as source_module,case when purchase_id<>'' then 'payments' else 'journals' end as source_page,coalesce(nullif(purchase_id,''),journal_id) as source_id,journal_id,
      jsonb_build_object('reference',reference,'source_type',source_type,'status',status,'debit',debit::text,'credit',credit::text,'opening',opening::text,'closing',closing::text) as data from running`,
      };
    if (report === "cash-position-report")
      return {
        ...bank,
        columns: [
          amount("opening", "Day opening"),
          amount("debit", "Money in"),
          amount("credit", "Money out"),
          amount("closing", "Day closing"),
        ],
        sql: `with movements as(${movements}),daily as(select bank_id,name,code,currency,date,sum(debit) as debit,sum(credit) as credit from movements group by bank_id,name,code,currency,date),running as(select *,sum(debit-credit) over(partition by bank_id order by date rows unbounded preceding) as closing from daily)
      select bank_id||':'||date::text as id,date,code,name,currency,bank_id,null::text as supplier_id,'banking'::text as source_module,'bank-account-detail'::text as source_page,bank_id as source_id,null::text as journal_id,jsonb_build_object('opening',(closing-debit+credit)::text,'debit',debit::text,'credit',credit::text,'closing',closing::text) as data from running`,
      };
    return {
      ...bank,
      columns: [
        amount("opening", "Opening"),
        amount("debit", "Money in"),
        amount("credit", "Money out"),
        amount("closing", "Closing"),
      ],
      sql: `with movements as(${movements}) select b.id,$3::date as date,b.reference as code,b.account_name as name,b.currency,b.id as bank_id,null::text as supplier_id,'banking'::text as source_module,'bank-account-detail'::text as source_page,b.id as source_id,null::text as journal_id,
      jsonb_build_object('opening',coalesce(sum(m.debit-m.credit) filter(where m.date<coalesce($4::date,'0001-01-01')),0)::text,'debit',coalesce(sum(m.debit) filter(where m.date>=coalesce($4::date,'0001-01-01')),0)::text,'credit',coalesce(sum(m.credit) filter(where m.date>=coalesce($4::date,'0001-01-01')),0)::text,'closing',coalesce(sum(m.debit-m.credit),0)::text) as data
      from bank_account b left join movements m on m.bank_id=b.id where b.tenant_id=$1 and b.company_id=$2 group by b.id,b.reference,b.account_name,b.currency`,
    };
  }
  if (report === "bank-reconciliation-report")
    return {
      permission: "banking.reconciliation.read",
      notes: ["Reconciliation figures are saved review snapshots at their cutoff; they are not live Bank balances."],
      columns: [
        text("state", "State"),
        text("cutoff", "Cutoff"),
        amount("statement", "Statement closing"),
        amount("ledger", "Ledger at cutoff"),
        amount("difference", "Difference"),
      ],
      sql: `select r.id,r.statement_date as date,r.statement_reference as code,b.account_name as name,r.currency,r.bank_account_id as bank_id,null::text as supplier_id,'banking'::text as source_module,'bank-reconciliation'::text as source_page,r.id as source_id,null::text as journal_id,jsonb_build_object('state',r.state,'cutoff',r.period_end::text,'statement',r.closing_statement_balance::text,'ledger',r.ledger_balance_at_cutoff::text,'difference',r.difference::text) as data from bank_reconciliation r join bank_account b on b.tenant_id=r.tenant_id and b.company_id=r.company_id and b.id=r.bank_account_id where r.tenant_id=$1 and r.company_id=$2 and r.statement_date<=$3::date`,
    };
  if (report === "bank-unmatched-report")
    return {
      permission: "banking.reconciliation.read",
      notes: [
        "Only included valid/warning lines in finalized imports are shown. Match/disposition state is current; historical matching state is not reconstructed.",
      ],
      columns: [
        text("direction", "Direction"),
        text("details", "Statement details"),
        text("disposition", "Duplicate disposition"),
        amount("amount", "Amount"),
      ],
      sql: `select l.id,l.transaction_date as date,coalesce(l.reference,i.statement_reference) as code,b.account_name as name,l.currency,i.bank_account_id as bank_id,null::text as supplier_id,'banking'::text as source_module,'import-statement'::text as source_page,i.id as source_id,null::text as journal_id,jsonb_build_object('direction',l.direction,'details',coalesce(l.details,''),'disposition',l.duplicate_disposition,'amount',l.amount::text) as data from bank_statement_line l join bank_statement_import i on i.tenant_id=l.tenant_id and i.company_id=l.company_id and i.id=l.import_id join bank_account b on b.tenant_id=i.tenant_id and b.company_id=i.company_id and b.id=i.bank_account_id where l.tenant_id=$1 and l.company_id=$2 and i.state='finalized' and l.inclusion_state='included' and l.validation_state in ('valid','warning','duplicate') and l.duplicate_disposition not in ('unresolved','rejected_duplicate') and l.reconciled_reconciliation_id is null and not exists(select 1 from bank_reconciliation_match m where m.tenant_id=l.tenant_id and m.company_id=l.company_id and m.statement_line_id=l.id and m.state='confirmed') and l.transaction_date<=$3::date`,
    };
  if (report === "purchase-bank-movements")
    return {
      permission: "banking.payment.read",
      notes: [
        "Read-only Purchase-owned instructions. Only posted accounting changes cash; open the Purchase owner to review. No duplicate Bank voucher is created.",
      ],
      columns: [
        text("state", "Purchase approval"),
        text("finance_state", "Accounting"),
        amount("gross", "Gross"),
        amount("withheld", "Withholding"),
        amount("net", "Net instruction"),
        amount("bank_fee", "Group Bank fee (once)"),
        amount("posted_outflow", "Posted outflow after reversals"),
        text("bank", "Bank"),
      ],
      sql: `select d.id||':'||(entry->>'supplier_id') as id,d.document_date as date,d.code,coalesce((select supplier.name from procurement_supplier supplier where supplier.tenant_id=d.tenant_id and supplier.company_id=d.company_id and supplier.id=entry->>'supplier_id'),entry->>'supplier_name','Supplier') as name,d.currency,d.payment_details->>'bank_account_id' as bank_id,entry->>'supplier_id' as supplier_id,'purchases'::text as source_module,${pageSql} as source_page,d.id as source_id,financial.journal_id,jsonb_build_object('state',d.state,'finance_state',coalesce(financial.state,'not prepared'),'gross',entry->>'amount','withheld',(round((entry->>'amount')::numeric*(entry->>'wht_rate')::numeric/100,2)+(entry->>'additional_wht')::numeric)::text,'net',((entry->>'amount')::numeric-round((entry->>'amount')::numeric*(entry->>'wht_rate')::numeric/100,2)-(entry->>'additional_wht')::numeric)::text,'bank_fee',case when position=1 then coalesce(financial.bank_fee,'0') else '0' end,'posted_outflow',case when financial.state='posted' then ((entry->>'amount')::numeric-round((entry->>'amount')::numeric*(entry->>'wht_rate')::numeric/100,2)-(entry->>'additional_wht')::numeric+case when position=1 then financial.bank_fee::numeric else 0 end)::text else '0' end,'bank',coalesce((select bank.account_name from bank_account bank where bank.tenant_id=d.tenant_id and bank.company_id=d.company_id and bank.id=d.payment_details->>'bank_account_id'),d.payment_details->>'bank_account_name','Unrecorded')) as data ${purchaseBase} cross join lateral jsonb_array_elements(d.payment_details->'entries') with ordinality as payment_entry(entry,position) where ${purchaseScope} and d.kind in ('payment','multi_payment')`,
    };
  if (["supplier-outstanding-report", "supplier-advance-report"].includes(report))
    return {
      permission: "finance.subledger.report",
      notes: [
        "Posted AP item/event balances only. Approved unrecognized Bills and unposted instructions do not create a financial balance. Source event history is available in Supplier Statement.",
      ],
      columns: [
        text("kind", "Item"),
        text("due", "Due date"),
        amount("original", "Original"),
        amount("outstanding", "Outstanding"),
        amount("carrying", "Base carrying"),
        text("base_currency", "Base currency"),
        text("overdue_days", "Overdue days"),
      ],
      sql: `select i.id,i.document_date as date,i.code,p.name,i.currency,null::text as bank_id,p.source_supplier_id as supplier_id,
       'purchases'::text as source_module,'supplier-currency-accounts'::text as source_page,
       coalesce(i.source_document_id,owner.payload->>'source_document_id','') as source_id,i.journal_id,
       jsonb_build_object('kind',i.kind,'due',coalesce(open_due.due_date,i.due_date)::text,'original',i.original_amount::text,
        'outstanding',i.outstanding::text,'carrying',i.carrying::text,'base_currency',i.base_currency,
        'base_decimal_places',i.base_decimal_places::text,'overdue_days',greatest(0,$3::date-coalesce(open_due.due_date,i.due_date))::text) as data
       from (select i.*,sum(e.foreign_delta) as outstanding,sum(e.base_delta) as carrying
        from finance_subledger_item i join finance_subledger_item_event e
         on (e.tenant_id,e.company_id,e.item_id)=(i.tenant_id,i.company_id,i.id) and e.event_date<=$3::date
        where i.tenant_id=$1 and i.company_id=$2 and i.side='payable' and i.document_date<=$3::date
         ${report === "supplier-advance-report" ? "and i.kind='advance'" : ""}
        group by i.tenant_id,i.company_id,i.id having sum(e.foreign_delta)<>0) i
       join finance_subledger_operation owner on (owner.tenant_id,owner.company_id,owner.id)=(i.tenant_id,i.company_id,i.operation_id)
       join finance_party_directory p on (p.tenant_id,p.company_id,p.id)=(i.tenant_id,i.company_id,i.party_id)
       cross join lateral(select min(part.due_date) as due_date
        from finance_due_installments(i.due_schedule,i.due_date,i.original_amount,i.outstanding) part where part.amount<>0) open_due`,
    };
  if (
    [
      "purchase-requisition-report",
      "rfq-comparison-report",
      "purchase-order-detail-report",
      "purchase-bill-detail-report",
    ].includes(report)
  ) {
    const kind = (
      {
        "purchase-requisition-report": "request",
        "rfq-comparison-report": "rfq",
        "purchase-order-detail-report": "order",
        "purchase-bill-detail-report": "bill",
      } as Record<string, string>
    )[report];
    return {
      ...purchase,
      columns: [
        text("state", "State"),
        text("source", "Source"),
        amount("subtotal", "Subtotal"),
        amount("discount", "Discount"),
        amount("charges", "Charges"),
        amount("tax", "Tax"),
        amount("amount", "Total"),
        amount("outstanding", "AP outstanding"),
        ...(kind === "bill"
          ? [
              amount("unrecognized", "Approved, unrecognized"),
              amount("settled", "Settled"),
              amount("reserved", "Reserved"),
              text("payments", "Linked instructions"),
            ]
          : []),
        text("finance_state", "Accounting"),
        text("evidence", "Evidence"),
      ],
      sql: `select ${purchaseIdentity},jsonb_build_object('state',d.state,'source',coalesce(src.code,''),'subtotal',calc.subtotal::text,'discount',(calc.discount+d.discount_amount)::text,'charges',calc.charges::text,'tax',(d.total_amount-calc.subtotal+calc.discount+d.discount_amount-calc.charges)::text,'amount',d.total_amount::text,'outstanding',case when d.kind='bill' and financial.state='posted' then (${linkedOutstanding})::text else '0' end,
      'unrecognized',case when d.kind='bill' and d.state='approved' and coalesce(financial.state,'')<>'posted' then d.total_amount::text else '0' end,
      'settled',case when d.kind='bill' and financial.state='posted' then (d.total_amount-(${linkedOutstanding}))::text else '0' end,
      'reserved',case when d.kind='bill' then (${purchaseReservationSql("$3::date")})::text else '0' end,
      'payments',coalesce((select string_agg(p.code,', ' order by p.code) from procurement_document p where p.tenant_id=d.tenant_id and p.company_id=d.company_id and p.kind in ('payment','multi_payment') and p.document_date<=$3::date and p.allocations @> jsonb_build_array(jsonb_build_object('bill_id',d.id))),''),
      'finance_state',coalesce(financial.state,'not prepared'),'evidence',case when d.kind='rfq' then 'Supplier response/quotation evidence not recorded by this workflow' else 'Persisted commercial document' end) as data ${purchaseBase}
      cross join lateral(select coalesce((select sum(round((l->>'quantity')::numeric*(l->>'unit_price')::numeric,2)) from jsonb_array_elements(d.lines) l),0) as subtotal,coalesce((select sum(coalesce((l->>'discount_amount')::numeric,0)) from jsonb_array_elements(d.lines) l),0) as discount,coalesce((select sum((c->>'amount')::numeric) from jsonb_array_elements(d.additional_charges) c),0) as charges) calc where ${purchaseScope} and d.kind='${kind}'`,
    };
  }
  // Line-level source comparisons. The snapshot's base quantity is the only
  // permitted conversion evidence; matching by labels/product names is forbidden.
  const comparisons = `${purchaseBase} cross join lateral jsonb_array_elements(d.lines) line
    left join lateral(select source_line from jsonb_array_elements(src.lines) source_line where source_line->>'id'=line->>'source_line_id' limit 1) original on true
    left join lateral(select coalesce(sum(case when line->'unit_snapshot'->>'base_unit_id' is not null and child_line->'unit_snapshot'->>'base_unit_id'=line->'unit_snapshot'->>'base_unit_id' then (child_line->'unit_snapshot'->>'base_quantity')::numeric when line->'unit_snapshot' is null and child_line->'unit_snapshot' is null and child_line->>'uom'=line->>'uom' then (child_line->>'quantity')::numeric else null end),0) as received,
      count(*) filter(where not ((line->'unit_snapshot'->>'base_unit_id' is not null and child_line->'unit_snapshot'->>'base_unit_id'=line->'unit_snapshot'->>'base_unit_id') or (line->'unit_snapshot' is null and child_line->'unit_snapshot' is null and child_line->>'uom'=line->>'uom'))) as incompatible,
      max(child.document_date) as last_receipt
      from procurement_document child cross join lateral jsonb_array_elements(child.lines) child_line
      where child.tenant_id=d.tenant_id and child.company_id=d.company_id and child.source_id=case when d.kind='order' then d.id else src.id end and child.kind='receipt' and child.state='approved' and child.document_date<=$3::date and child_line->>'source_line_id'=case when d.kind='order' then line->>'id' else line->>'source_line_id' end) receipts on true`;
  if (report === "purchase-receipt-report" || report === "supplier-performance-report")
    return {
      ...purchase,
      notes: [
        ...purchase.notes,
        "Receipt quantities are operational consumption, not stock-ledger posting. Quality/inspection scores are unavailable because this workflow records no inspection outcomes. Due dates are shown as recorded; no promised-delivery commitment is inferred.",
      ],
      columns: [
        text("item", "Product/service"),
        text("uom", "Comparison unit"),
        quantity("ordered", "Ordered"),
        quantity("received", "Received"),
        quantity("pending", "Pending"),
        text("last_receipt", "Last receipt"),
        text("due", "Recorded order due"),
        text("evidence", "Evidence"),
      ],
      sql: `select ${purchaseIdentity.replace("d.id,", "d.id||':'||coalesce(line->>'id',line->>'description') as id,")},jsonb_build_object('item',line->>'description','uom',coalesce(line->'unit_snapshot'->>'base_unit_name',line->>'uom'),'ordered',coalesce(line->'unit_snapshot'->>'base_quantity',line->>'quantity'),'received',receipts.received::text,'pending',greatest(0,coalesce((line->'unit_snapshot'->>'base_quantity')::numeric,(line->>'quantity')::numeric)-receipts.received)::text,'last_receipt',coalesce(receipts.last_receipt::text,''),'due',coalesce(d.due_date::text,''),'evidence',case when receipts.incompatible>0 then 'Incompatible UOM evidence — review quantities' else 'Quality outcomes unavailable; no inferred score' end) as data ${comparisons} where ${purchaseScope} and d.kind='order' and d.state='approved'`,
    };
  return {
    ...purchase,
    notes: [
      ...purchase.notes,
      "Comparable pricing needs matching currency/UOM and explicit allocated document discounts. Missing snapshots or price evidence are flagged, never substituted.",
    ],
    columns: [
      text("item", "Product/service"),
      quantity("quantity", "Billed quantity"),
      quantity("received", "Received quantity"),
      text("source", "Order"),
      text("price_variance", "Net price variance per unit"),
      text("evidence", "Exception / evidence"),
    ],
    sql: `select ${purchaseIdentity.replace("d.id,", "d.id||':'||coalesce(line->>'id',line->>'description') as id,")},jsonb_build_object('item',line->>'description','quantity',coalesce(line->'unit_snapshot'->>'base_quantity',line->>'quantity'),'received',receipts.received::text,'source',coalesce(src.code,''),'price_variance',case when source_line is not null and d.currency=src.currency and line->>'uom'=source_line->>'uom' and (d.discount_amount=0 or line ? 'allocated_discount_amount') and (src.discount_amount=0 or source_line ? 'allocated_discount_amount') then (((round((line->>'quantity')::numeric*(line->>'unit_price')::numeric,2)-coalesce((line->>'discount_amount')::numeric,0)-coalesce((line->>'allocated_discount_amount')::numeric,0))/(line->>'quantity')::numeric)-((round((source_line->>'quantity')::numeric*(source_line->>'unit_price')::numeric,2)-coalesce((source_line->>'discount_amount')::numeric,0)-coalesce((source_line->>'allocated_discount_amount')::numeric,0))/(source_line->>'quantity')::numeric))::text else 'Unavailable' end,'evidence',case when src.id is null or source_line is null then 'Missing linked order line' when receipts.incompatible>0 then 'Incompatible receipt UOM' when receipts.received<coalesce((line->'unit_snapshot'->>'base_quantity')::numeric,(line->>'quantity')::numeric) then 'Billed quantity exceeds approved receipts' when line->>'uom'<>source_line->>'uom' or d.currency<>src.currency then 'Insufficient comparable pricing evidence' else 'Quantity evidence available; review net pricing' end) as data ${comparisons} where ${purchaseScope} and d.kind='bill'`,
  };
}

export class ConnectedReports {
  constructor(private readonly repository: SourceSubledgerRepository) {}
  async run(context: BankingActorContext, query: ConnectedReportQuery): Promise<ConnectedReport> {
    const definition = adapter(query.report);
    return this.repository.transaction(context, query.company_id, definition.permission, false, async (client) => {
      const from =
        query.from ??
        (
          await client.query<{ from: string }>(
            "select period_start::text as from from fiscal_calendar where tenant_id=$1 and company_id=$2 and period_start<=$3::date and period_end>=$3::date order by period_start desc limit 1",
            [context.tenantId, query.company_id, query.as_of],
          )
        ).rows[0]?.from;
      if (!from)
        throw new SubledgerError(
          409,
          "REPORT_FISCAL_YEAR_MISSING",
          "Configure the company's financial year for this cutoff, or choose an explicit From date.",
        );
      return this.read(client, context, query, from, definition);
    });
  }
  private async read(
    client: PoolClient,
    context: BankingActorContext,
    query: ConnectedReportQuery,
    from: string,
    definition: Adapter,
  ) {
    const parameters = [
      context.tenantId,
      query.company_id,
      query.as_of,
      from,
      query.currency ?? null,
      query.bank_id ?? null,
      query.supplier_id ?? null,
    ];
    // Open-item reports retain older unpaid invoices. From filters movements and
    // commercial activity, never the existence of an AP balance at the cutoff.
    const balances = query.report.startsWith("supplier-") && query.report !== "supplier-performance-report";
    const cte = `with report_period as(select $4::date as period_start),source as(${definition.sql}), filtered as(select * from source where true and ($5::text is null or currency=$5) and ($6::text is null or bank_id=$6) and ($7::text is null or supplier_id=$7) ${balances ? "" : "and date>=$4::date"})`;
    const rows = (
      await client.query(
        `${cte} select id,date::text,code,name,currency,source_module,source_page,source_id,journal_id,data as "values" from filtered order by date,code,id limit $8 offset $9`,
        [...parameters, query.limit, query.offset],
      )
    ).rows;
    const total = (
      await client.query<{ total: number }>(`${cte} select count(*)::integer as total from filtered`, parameters)
    ).rows[0]!.total;
    // Carrying values use base currency; never sum them under original currency.
    // Running activity balances and repeated openings are not additive measures.
    const moneyColumns = definition.columns.filter(
      (column) =>
        column.kind === "amount" &&
        query.report !== "bank-reconciliation-report" &&
        column.key !== "carrying" &&
        !(
          ["bank-account-activity-report", "cash-position-report"].includes(query.report) &&
          ["opening", "closing"].includes(column.key)
        ),
    );
    let totals = (
      await client.query(
        `${cte} select f.currency,c.decimal_places,jsonb_build_object(${moneyColumns.flatMap((column) => [`'${column.key}'`, `coalesce(sum((f.data->>'${column.key}')::numeric),0)::text`]).join(",") || "'records',count(*)::text"}) as "values" from filtered f join currency c on c.tenant_id=$1 and c.code=f.currency group by f.currency,c.decimal_places order by f.currency`,
        parameters,
      )
    ).rows;
    if (["bank-account-activity-report", "cash-position-report"].includes(query.report)) {
      totals = (
        await client.query(
          `${cte},bank_totals as(select bank_id,currency,
        (array_agg((data->>'opening')::numeric order by date,journal_id,id))[1] as opening,
        sum((data->>'debit')::numeric) as debit,sum((data->>'credit')::numeric) as credit,
        (array_agg((data->>'closing')::numeric order by date desc,journal_id desc,id desc))[1] as closing
        from filtered group by bank_id,currency)
        select b.currency,c.decimal_places,jsonb_build_object('opening',sum(opening)::text,'debit',sum(debit)::text,'credit',sum(credit)::text,'closing',sum(closing)::text) as "values" from bank_totals b join currency c on c.tenant_id=$1 and c.code=b.currency group by b.currency,c.decimal_places order by b.currency`,
          parameters,
        )
      ).rows;
    }
    return connectedReportSchema.parse({
      company_id: query.company_id,
      report: query.report,
      as_of: query.as_of,
      from,
      columns: definition.columns,
      rows,
      total_rows: total,
      totals,
      notes: definition.notes,
    });
  }
}
