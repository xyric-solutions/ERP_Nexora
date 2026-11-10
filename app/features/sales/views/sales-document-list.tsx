"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  clickableRow,
  EmptyState,
  FilterSelect,
  ListFooter,
  ListToolbar,
  MetricTiles,
  PageHead,
  rowKeyHandler,
  SearchBox,
  StatusPill,
  tableClass,
  type Metric,
} from "../components/sales-ui";
import { InvoicePanel } from "../components/invoice-panel";
import type { SalesNav } from "../components/sales-nav";
import { SALES_KINDS } from "../model/sales-constants";
import { formatDate, money, moneyWhole } from "../model/sales-format";
import { useSalesState } from "../model/sales-store";
import { approvalOf, approvalSummary, displayStatus, documentTotal, invoiceBalance, listNextAction, paidOn } from "../model/sales-workflow";
import type { SalesDocument, SalesDocumentKind, SalesState } from "../model/sales-types";

function sourceLabel(doc: SalesDocument): string {
  if (doc.kind === "order") return doc.links.quotation ? `From ${doc.links.quotation}` : "Direct order";
  if (doc.kind === "invoice") {
    if (doc.links.order) return `From ${doc.links.order}`;
    return doc.links.recurring ? `From ${doc.links.recurring}` : "Direct invoice";
  }
  return doc.links.order ? `Order ${doc.links.order}` : "";
}

function metricsFor(kind: SalesDocumentKind, state: SalesState): Metric[] {
  const all = state[kind];
  if (kind === "quotation") {
    const live = all.filter((doc) => doc.status !== "Ordered" && doc.status !== "Rejected");
    return [
      { label: "Pending approval", value: all.filter((doc) => doc.status === "Pending approval").length, hint: "Waiting in Sales Approvals" },
      { label: "Approved", value: all.filter((doc) => doc.status === "Approved").length, hint: "Next: Confirm Order" },
      { label: "Converted to orders", value: all.filter((doc) => doc.status === "Ordered").length, hint: "Approved and confirmed" },
      { label: "Open value", value: moneyWhole(live.reduce((sum, doc) => sum + documentTotal(doc), 0)), hint: "Not yet ordered, incl. sales tax" },
    ];
  }
  if (kind === "order") {
    return [
      { label: "Sales orders", value: all.length, hint: "All orders" },
      { label: "Ready to pick & pack", value: all.filter((doc) => doc.status === "Confirmed").length, hint: "Next: Pick & Pack" },
      { label: "Packed", value: all.filter((doc) => doc.status === "Packed").length, hint: "Next: Save Delivery" },
      { label: "Ready to invoice", value: all.filter((doc) => doc.status === "Delivered").length, hint: "Next: Create Invoice" },
    ];
  }
  const unpaid = all.filter((doc) => doc.status !== "Paid");
  return [
    { label: "Invoices", value: all.length, hint: "All invoices" },
    { label: "Unpaid", value: unpaid.length, hint: "Next: Record Payment" },
    { label: "Overdue", value: all.filter((doc) => displayStatus(doc) === "Overdue").length, hint: "Past the due date" },
    { label: "Outstanding", value: moneyWhole(unpaid.reduce((sum, doc) => sum + invoiceBalance(state, doc), 0)), hint: "Still to collect" },
  ];
}

/** Document list. For invoices, `selected` opens that invoice in the right-side panel. */
export function DocumentList({ kind, nav, selected }: { kind: SalesDocumentKind; nav: SalesNav; selected?: string }) {
  const state = useSalesState();
  const meta = SALES_KINDS[kind];
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState("");
  const [status, setStatus] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state[kind]
      .filter((doc) => (!status || displayStatus(doc) === status) && (!customer || doc.customerId === customer))
      .filter((doc) => {
        if (!needle) return true;
        const name = state.customers.find((item) => item.id === doc.customerId)?.name ?? "";
        return [doc.code, name, doc.reference, doc.links.quotation, doc.links.order, approvalSummary(doc)].join(" ").toLowerCase().includes(needle);
      })
      .sort((a, b) => b.code.localeCompare(a.code, undefined, { numeric: true }));
  }, [customer, kind, query, state, status]);

  const clear = () => {
    setQuery("");
    setCustomer("");
    setStatus("");
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow={`Sales · ${meta.label}`}
        title={meta.plural}
        status={<StatusPill status="Prototype only" />}
        description={meta.description}
        actions={<Button type="button" onClick={() => nav.openNew(meta.pageId)}>+ New {meta.label}</Button>}
      />
      <MetricTiles metrics={metricsFor(kind, state)} />
      <Card>
        <ListToolbar>
          <SearchBox value={query} onChange={setQuery} placeholder={`Search ${meta.label.toLowerCase()}, customer or reference`} />
          <FilterSelect label="Customer" value={customer} options={state.customers.map((item) => [item.id, item.display] as const)} onChange={setCustomer} />
          <FilterSelect label="Status" value={status} options={meta.statuses} onChange={setStatus} />
        </ListToolbar>
        {rows.length ? (
          <>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Reference</th>
                    {kind === "quotation" ? <th>Approval</th> : null}
                    <th>Next action</th>
                    <th className="text-right!">Amount</th>
                    {kind === "invoice" ? <th className="text-right!">Received</th> : null}
                    {kind === "invoice" ? <th className="text-right!">Balance</th> : null}
                    <th>Status</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((doc) => {
                    const next = listNextAction(state, doc);
                    const buyer = state.customers.find((item) => item.id === doc.customerId);
                    const open = () => nav.open(doc.code);
                    return (
                      <tr
                        key={doc.id}
                        className={clickableRow}
                        tabIndex={0}
                        aria-selected={kind === "invoice" ? doc.code === selected : undefined}
                        onClick={open}
                        onKeyDown={rowKeyHandler(open)}
                      >
                        <td>
                          <span className="font-mono text-[0.8125rem] font-semibold">{doc.code}</span>
                          {sourceLabel(doc) ? <small>{sourceLabel(doc)}</small> : null}
                        </td>
                        <td>{formatDate(doc.date)}</td>
                        <td>
                          <strong>{buyer?.display ?? "—"}</strong>
                          <small>{buyer?.code}</small>
                        </td>
                        <td>{doc.reference || "—"}</td>
                        {kind === "quotation" ? (
                          <td className={approvalOf(doc) ? "text-xs font-semibold text-[var(--nx-success-text)]" : "text-xs text-muted-foreground"}>
                            {approvalSummary(doc)}
                          </td>
                        ) : null}
                        <td className={next ? "text-xs font-semibold whitespace-nowrap text-[var(--nx-brand)]" : "text-xs text-muted-foreground"}>
                          {next ? `${next} →` : doc.status === "Rejected" ? "Closed" : "Complete"}
                        </td>
                        <td className="text-right font-semibold tabular-nums">{money(documentTotal(doc))}</td>
                        {kind === "invoice" ? <td className="text-right tabular-nums">{money(paidOn(state, doc))}</td> : null}
                        {kind === "invoice" ? <td className="text-right font-semibold tabular-nums">{money(invoiceBalance(state, doc))}</td> : null}
                        <td><StatusPill status={displayStatus(doc)} /></td>
                        <td>{doc.owner || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ListFooter>Showing {rows.length} of {state[kind].length} {meta.plural.toLowerCase()}</ListFooter>
          </>
        ) : (
          <EmptyState
            title={`No ${meta.plural.toLowerCase()} match these filters`}
            action={<Button type="button" variant="outline" size="sm" onClick={clear}>Clear filters</Button>}
          />
        )}
      </Card>
      {kind === "invoice" ? <InvoicePanel invoiceCode={selected ?? null} nav={nav} onClose={nav.back} /> : null}
    </div>
  );
}
