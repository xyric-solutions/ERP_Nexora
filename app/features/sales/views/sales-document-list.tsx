"use client";

import { useMemo, useState } from "react";
import { ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  EmptyState,
  FilterSelect,
  ListToolbar,
  MetricTiles,
  PageHead,
  SearchBox,
  StatusPill,
  type Metric,
} from "../components/sales-ui";
import { ActionMenu } from "../components/action-menu";
import { SaleReturnDialog } from "../components/sales-dialogs";
import { ListPager, ListTable, ListViewMenu, usePagedRows, useListView, type ListColumn } from "../components/list-view-options";
import { InvoicePanel } from "../components/invoice-panel";
import type { SalesNav } from "../components/sales-nav";
import { FULFILMENT_STAGES, SALES_KINDS } from "../model/sales-constants";
import { formatDate, moneyWhole } from "../model/sales-format";
import { docMoney, toBase } from "../model/sales-currency";
import { commitSales, useSalesState } from "../model/sales-store";
import {
  addReturn,
  approvalOf,
  approvalSummary,
  displayStatus,
  documentTotal,
  fulfilmentStage,
  invoiceBalance,
  isApproverOf,
  listNextAction,
  paidOn,
  returnedOn,
  returnedQty,
  type ReturnInput,
  referenceLabel,
} from "../model/sales-workflow";
import type { SalesDocument, SalesDocumentKind, SalesState } from "../model/sales-types";

function sourceLabel(doc: SalesDocument): string {
  if (doc.kind === "order") return doc.links.quotation ? `From ${doc.links.quotation}` : "Direct order";
  if (doc.kind === "invoice") {
    if (doc.links.order) return `From ${doc.links.order}`;
    return doc.links.recurring ? `From ${doc.links.recurring}` : "Direct invoice";
  }
  return doc.links.order ? `Order ${doc.links.order}` : "";
}

function metricsFor(kind: SalesDocumentKind, state: SalesState, actor: string, mine: boolean, setMine: (value: boolean) => void): Metric[] {
  const all = state[kind];
  if (kind === "quotation") {
    const live = all.filter((doc) => doc.status !== "Ordered" && doc.status !== "Rejected");
    const awaiting = all.filter((doc) => doc.status === "Pending approval" && isApproverOf(doc, actor)).length;
    return [
      { label: "Awaiting my approval", value: awaiting, hint: mine ? "Showing only these · click to show all" : "Quotations you must decide", onSelect: () => setMine(!mine), selected: mine },
      { label: "Approved", value: all.filter((doc) => doc.status === "Approved").length, hint: "Next: Confirm Order" },
      { label: "Drafts", value: all.filter((doc) => doc.status === "Draft").length, hint: "Not approved yet" },
      { label: "Open value", value: moneyWhole(live.reduce((sum, doc) => sum + toBase(documentTotal(doc), doc), 0)), hint: "Not yet ordered, incl. sales tax, in PKR" },
    ];
  }
  if (kind === "order") {
    const confirmed = all.filter((doc) => doc.status === "Confirmed");
    return [
      { label: "Confirmed orders", value: confirmed.length, hint: `${all.length - confirmed.length} draft(s)` },
      { label: "Ready to deliver", value: confirmed.filter((doc) => fulfilmentStage(doc) === "Not started").length, hint: "Next: Confirm Delivery" },
      { label: "Delivered, not invoiced", value: confirmed.filter((doc) => fulfilmentStage(doc) === "Delivered").length, hint: "Next: Create Invoice" },
    ];
  }
  const unpaid = all.filter((doc) => doc.status !== "Paid");
  return [
    { label: "Invoices", value: all.length, hint: "All invoices" },
    { label: "Unpaid", value: unpaid.length, hint: "Next: Receive Payment" },
    { label: "Overdue", value: all.filter((doc) => displayStatus(doc) === "Overdue").length, hint: "Past the due date" },
    { label: "Outstanding", value: moneyWhole(unpaid.reduce((sum, doc) => sum + toBase(invoiceBalance(state, doc), doc), 0)), hint: "Still to collect, in PKR" },
  ];
}

function columnsFor(kind: SalesDocumentKind, state: SalesState): ListColumn<SalesDocument>[] {
  const customerOf = (doc: SalesDocument) => state.customers.find((item) => item.id === doc.customerId);
  const columns: (ListColumn<SalesDocument> | false)[] = [
    {
      id: "code",
      label: "Document",
      required: true,
      cell: (doc) => (
        <>
          <span className="font-mono text-[0.8125rem] font-semibold">{doc.code}</span>
          {sourceLabel(doc) ? <small>{sourceLabel(doc)}</small> : null}
        </>
      ),
    },
    { id: "date", label: SALES_KINDS[kind].date1, nowrap: true, cell: (doc) => formatDate(doc.date) },
    { id: "date2", label: SALES_KINDS[kind].date2, nowrap: true, optional: kind !== "invoice", cell: (doc) => formatDate(doc.date2) },
    {
      id: "customer",
      label: "Customer",
      required: true,
      cell: (doc) => (
        <>
          <strong>{customerOf(doc)?.display ?? "—"}</strong>
          <small>{customerOf(doc)?.code}</small>
        </>
      ),
    },
    { id: "reference", label: SALES_KINDS[kind].referenceLabel, cell: (doc) => doc.reference || "—" },
    kind === "quotation" && { id: "approver", label: "Approver", cell: (doc) => doc.approver || <span className="text-muted-foreground">None</span> },
    kind === "quotation" && {
      id: "approval",
      label: "Approval",
      cell: (doc) => <span className={approvalOf(doc) ? "text-xs font-semibold text-[var(--nx-success-text)]" : "text-xs text-muted-foreground"}>{approvalSummary(doc)}</span>,
    },
    kind === "order" && { id: "fulfilment", label: "Fulfilment", cell: (doc) => (doc.status === "Confirmed" ? <StatusPill status={fulfilmentStage(doc)} /> : <span className="text-xs text-muted-foreground">Not confirmed</span>) },
    {
      id: "next",
      label: "Next action",
      cell: (doc) => {
        const next = listNextAction(state, doc);
        return (
          <span className={next ? "text-xs font-semibold whitespace-nowrap text-[var(--nx-brand)]" : "text-xs text-muted-foreground"}>
            {next ? `${next} →` : doc.status === "Rejected" ? "Closed" : "Complete"}
          </span>
        );
      },
    },
    { id: "terms", label: "Payment terms", optional: true, cell: (doc) => doc.terms },
    { id: "project", label: "Project", optional: true, cell: (doc) => referenceLabel(doc.project) || "—" },
    { id: "location", label: "Location", optional: true, cell: (doc) => referenceLabel(doc.location) || "—" },
    kind === "order" && { id: "warehouse", label: "Ship from", optional: true, cell: (doc) => doc.warehouse },
    { id: "lines", label: "Items", optional: true, cell: (doc) => `${doc.lines.length} line(s)` },
    { id: "amount", label: "Amount", align: "right", required: true, cell: (doc) => <span className="font-semibold">{docMoney(documentTotal(doc), doc)}</span> },
    kind === "invoice" && { id: "received", label: "Received", align: "right", optional: true, cell: (doc) => docMoney(paidOn(state, doc), doc) },
    kind === "invoice" && { id: "returned", label: "Returned", align: "right", optional: true, cell: (doc) => docMoney(returnedOn(state, doc), doc) },
    kind === "invoice" && { id: "balance", label: "Balance", align: "right", cell: (doc) => <span className="font-semibold">{docMoney(invoiceBalance(state, doc), doc)}</span> },
    { id: "status", label: "Status", required: true, cell: (doc) => <StatusPill status={displayStatus(doc)} /> },
    { id: "owner", label: kind === "invoice" ? "Issued by" : "Salesperson", optional: kind === "invoice", cell: (doc) => doc.owner || "—" },
  ];
  return columns.filter(Boolean) as ListColumn<SalesDocument>[];
}

/** Document list. For invoices, `selected` opens that invoice in the right-side panel. */
export function DocumentList({ kind, nav, selected }: { kind: SalesDocumentKind; nav: SalesNav; selected?: string }) {
  const state = useSalesState();
  const meta = SALES_KINDS[kind];
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState("");
  const [status, setStatus] = useState("");
  const [stage, setStage] = useState("");
  const [mine, setMine] = useState(false);
  const [returning, setReturning] = useState(false);
  const columns = useMemo(() => columnsFor(kind, state), [kind, state]);
  const view = useListView(`documents.${kind}`, columns);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state[kind]
      .filter((doc) => (!status || displayStatus(doc) === status) && (!customer || doc.customerId === customer))
      .filter((doc) => !stage || (doc.status === "Confirmed" && fulfilmentStage(doc) === stage))
      .filter((doc) => !mine || (doc.status === "Pending approval" && isApproverOf(doc, nav.actor)))
      .filter((doc) => {
        if (!needle) return true;
        const name = state.customers.find((item) => item.id === doc.customerId)?.name ?? "";
        return [doc.code, name, doc.reference, doc.links.quotation, doc.links.order, doc.approver, approvalSummary(doc)].join(" ").toLowerCase().includes(needle);
      })
      .sort((a, b) => b.code.localeCompare(a.code, undefined, { numeric: true }));
  }, [customer, kind, mine, nav.actor, query, stage, state, status]);
  const paging = usePagedRows(view, rows, [query, customer, status, stage, mine].join("|"));

  const returnable = kind === "invoice" ? state.invoice.filter((doc) => doc.lines.some((line) => line.qty - returnedQty(state, doc.code, line) > 0)) : [];
  const saveReturn = (input: ReturnInput) => {
    try {
      const code = commitSales((sales) => addReturn(sales, input, nav.actor));
      setReturning(false);
      nav.notify(`Sale return ${code} saved against ${input.invoice}. Its value is credited to the invoice.`);
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "The sale return could not be saved.");
    }
  };

  const clear = () => {
    setQuery("");
    setCustomer("");
    setStatus("");
    setStage("");
    setMine(false);
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow={`Sales · ${meta.label}`}
        title={meta.plural}
        status={<StatusPill status="Prototype only" />}
        description={meta.description}
        actions={
          <>
            <ListViewMenu view={view} />
            {kind === "invoice" ? (
              <Button type="button" variant="outline" onClick={() => nav.go("receipts")}>
                <ReceiptText /> Receipts
              </Button>
            ) : null}
            {kind === "invoice" ? (
              <ActionMenu
                label="Add New"
                options={[
                  { label: "Invoice (INV)", run: () => nav.openNew(meta.pageId) },
                  { label: "Sale Return (SR)", run: () => setReturning(true), disabled: !returnable.length },
                ]}
              />
            ) : (
              <Button type="button" onClick={() => nav.openNew(meta.pageId)}>+ New {meta.label}</Button>
            )}
          </>
        }
      />
      <MetricTiles metrics={metricsFor(kind, state, nav.actor, mine, setMine)} />
      <Card>
        <ListToolbar>
          <SearchBox value={query} onChange={setQuery} placeholder={`Search ${meta.label.toLowerCase()}, customer or reference`} />
          <FilterSelect label="Customer" value={customer} options={state.customers.map((item) => [item.id, item.display] as const)} onChange={setCustomer} />
          <FilterSelect label="Status" value={status} options={meta.statuses} onChange={setStatus} />
          {kind === "order" ? <FilterSelect label="Fulfilment" value={stage} options={FULFILMENT_STAGES} onChange={setStage} /> : null}
        </ListToolbar>
        {rows.length ? (
          <>
            <ListTable view={view} rows={paging.pageRows} rowKey={(doc) => doc.code} onOpen={(doc) => nav.open(doc.code)} selected={kind === "invoice" ? (selected ?? "") : undefined} />
            <ListPager view={view} paging={paging} of={state[kind].length} noun={meta.plural.toLowerCase()} />
          </>
        ) : (
          <EmptyState
            title={mine ? "Nothing is waiting for your approval" : `No ${meta.plural.toLowerCase()} match these filters`}
            action={<Button type="button" variant="outline" size="sm" onClick={clear}>Clear filters</Button>}
          />
        )}
      </Card>
      {kind === "invoice" ? <InvoicePanel invoiceCode={selected ?? null} nav={nav} onClose={nav.back} /> : null}
      {returning ? <SaleReturnDialog invoices={returnable} state={state} onClose={() => setReturning(false)} onSave={saveReturn} /> : null}
    </div>
  );
}
