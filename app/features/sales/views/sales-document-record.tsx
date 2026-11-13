"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ActivityList,
  Card,
  EmptyState,
  FlowStrip,
  KeyValues,
  LinkButton,
  NextActionBar,
  PageHead,
  StatusPill,
  SummaryCells,
  tableClass,
  TotalsSummary,
  type FlowStep,
} from "../components/sales-ui";
import { FulfilmentPanel } from "../components/fulfilment-panel";
import { DeleteDraftDialog } from "../components/sales-dialogs";
import type { SalesNav } from "../components/sales-nav";
import { customerPhone } from "../model/customer-model";
import { formatDate } from "../model/sales-format";
import { currencySummary, docMoney } from "../model/sales-currency";
import { commitSales, useSalesState } from "../model/sales-store";
import {
  approvalOf,
  approvalSummary,
  confirmOrder,
  deleteOrder,
  displayStatus,
  documentChain,
  findCustomer,
  findDocument,
  fulfilmentStage,
  historyTime,
  lineAmount,
  lineTotals,
  nextActionFor,
  receiptsFor,
} from "../model/sales-workflow";
import type { SalesDocument, SalesState } from "../model/sales-types";
import { DocumentEntry } from "./sales-document-entry";
import { contextRows } from "../components/project-location-fields";

/** New Quotation → Management Approval → Delivery → Invoice → Payment. */
function flowSteps(state: SalesState, order: SalesDocument, open: (code: string) => void): FlowStep[] {
  const { quotation, invoice } = documentChain(state, order);
  const approved = quotation ? approvalOf(quotation) : undefined;
  const link = (code: string | undefined) => (code ? { code, onOpen: () => open(code) } : undefined);
  const receipts = invoice ? receiptsFor(state, invoice.code) : [];
  return [
    { label: "Quotation", done: Boolean(quotation), skipped: !quotation, link: link(quotation?.code), detail: quotation ? historyTime(quotation, "Saved") : "Direct order" },
    {
      label: approved ? "Approved" : "Order confirmed",
      done: order.status !== "Draft",
      detail: approved ? approvalSummary(quotation!).replace("Approved by ", "") : historyTime(order, "Confirmed"),
    },
    { label: "Delivered", done: Boolean(order.delivery), detail: order.delivery ? `${order.delivery.no} · ${formatDate(order.delivery.date)}` : "" },
    { label: "Invoiced", done: Boolean(invoice), link: link(invoice?.code), detail: invoice ? historyTime(invoice, "Issued") : "" },
    {
      label: "Paid",
      done: invoice?.status === "Paid",
      detail: invoice ? (receipts.length ? `${displayStatus(invoice)} · ${receipts.map((item) => item.code).join(", ")}` : displayStatus(invoice)) : "",
    },
  ];
}

/** Sales order record. Quotations use QuotationRecord; invoices open in the invoice panel. */
export function DocumentRecord({ code, nav }: { code: string; nav: SalesNav }) {
  const state = useSalesState();
  const doc = findDocument(state, "order", code);
  const [editing, setEditing] = useState(false);
  const [fulfilling, setFulfilling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!doc) {
    return (
      <EmptyState
        title={`${code} was not found`}
        hint="Sample records reset when the page reloads."
        action={<Button type="button" variant="outline" size="sm" onClick={nav.back}>Back to list</Button>}
      />
    );
  }

  if (editing) {
    return <DocumentEntry kind="order" existing={doc} nav={nav} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />;
  }

  const customer = findCustomer(state, doc.customerId);
  const next = nextActionFor(state, doc);
  const totals = lineTotals(doc.lines);
  const quotation = findDocument(state, "quotation", doc.links.quotation);
  const stage = fulfilmentStage(doc);

  const remove = () => {
    setDeleting(false);
    try {
      commitSales((sales) => deleteOrder(sales, doc.code));
      nav.go("sales-orders");
      nav.notify(`Draft ${doc.code} deleted.`);
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "The draft could not be deleted.");
    }
  };

  const run = (change: () => string) => {
    try {
      nav.notify(change());
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "That action could not be completed.");
    }
  };

  const runAction = () => {
    if (next.type !== "action") return;
    if (next.action === "confirm") {
      run(() => {
        commitSales((sales) => confirmOrder(sales, doc.code, nav.actor));
        return `${doc.code} confirmed. It is now in Delivery.`;
      });
    } else if (next.action === "delivery") setFulfilling(true);
    // Opens the invoice form prefilled from this order; the invoice is saved from that form.
    else if (next.action === "createInvoice") nav.openNew("invoices", doc.code);
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Sales · Sales Order"
        title={`Sales Order · ${doc.code}`}
        status={
          <>
            <StatusPill status={doc.status} />
            {doc.status === "Confirmed" ? <StatusPill status={stage} /> : null}
          </>
        }
        actions={
          <>
            <Button type="button" variant="outline" onClick={nav.back}>Back to list</Button>
            {doc.status === "Draft" ? <Button type="button" variant="outline" onClick={() => setEditing(true)}>Edit</Button> : null}
            {doc.status === "Draft" ? <Button type="button" variant="destructive" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button> : null}
            {doc.status === "Confirmed" && stage !== "Invoiced" ? (
              <Button type="button" variant="outline" onClick={() => setFulfilling(true)}>Delivery</Button>
            ) : null}
          </>
        }
      />

      <section
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] px-3 py-2 text-[0.8125rem]"
        aria-label="Document type"
      >
        <strong className="text-[var(--nx-success-text)]">Sales Order · customer confirmed</strong>
        <span className="text-muted-foreground">
          {doc.status === "Draft" ? "Draft direct order. Confirm Order when the customer confirms it." : `The customer's order is confirmed. Fulfilment: ${stage}.`}
        </span>
      </section>

      <FlowStrip steps={flowSteps(state, doc, (target) => nav.open(target))} />

      {next.type === "action" ? (
        <NextActionBar tone="action" eyebrow="Next action" title={next.label} text={next.text}>
          <Button type="button" className="h-10 px-4.5" onClick={runAction}>{next.label}</Button>
        </NextActionBar>
      ) : next.type === "done" ? (
        <NextActionBar tone="done" eyebrow="Complete" title="No action needed" text={next.text}>
          {next.link ? <Button type="button" variant="outline" onClick={() => nav.open(next.link!.code)}>{next.link.label}</Button> : null}
        </NextActionBar>
      ) : null}

      <SummaryCells
        cells={[
          ["Customer", customer ? <LinkButton key="c" onClick={() => nav.open(customer.code)}>{customer.display}</LinkButton> : "—"],
          ["Order date", formatDate(doc.date)],
          ["Delivery date", formatDate(doc.date2)],
          ["Total", docMoney(totals.total, doc)],
          ["Approval", quotation ? approvalSummary(quotation) : "Direct order, no approval"],
        ]}
      />

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18.75rem]">
        <Card title="Products and services" aside={doc.reference ? <span className="text-xs text-muted-foreground">Reference {doc.reference}</span> : undefined}>
          <div className="relative overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product / service</th>
                  <th className="text-right!">Qty</th>
                  <th>Unit</th>
                  <th className="text-right!">Rate</th>
                  <th className="text-right!">Tax</th>
                  <th className="text-right!">Amount</th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((item, index) => (
                  <tr key={`${item.sku}-${index}`}>
                    <td className="text-muted-foreground">{index + 1}</td>
                    <td><strong>{item.desc}</strong><small>{item.sku || "Other charge"}</small></td>
                    <td className="text-right tabular-nums">{item.qty}</td>
                    <td>{item.uom || "Each"}</td>
                    <td className="text-right tabular-nums">{docMoney(item.rate, doc)}</td>
                    <td className="text-right tabular-nums">{item.tax}%</td>
                    <td className="text-right font-semibold tabular-nums">{docMoney(lineAmount(item), doc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="grid grid-cols-1 gap-4 rounded-b-lg border-t border-border bg-muted p-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)]">
            {doc.notes ? (
              <div><span className="text-xs font-semibold text-muted-foreground">Notes</span><p className="mt-1 mb-0 text-[0.8125rem]">{doc.notes}</p></div>
            ) : (
              <span className="text-xs text-muted-foreground">No notes on this document.</span>
            )}
            <TotalsSummary rows={[["Untaxed amount", docMoney(totals.sub, doc)], ["Sales tax", docMoney(totals.tax, doc)]]} total={["Total", docMoney(totals.total, doc)]} />
          </footer>
        </Card>

        <aside className="grid min-w-0 content-start gap-3.5 md:grid-cols-2 xl:grid-cols-1">
          {doc.delivery ? (
            <Card title="Delivery" aside={<StatusPill status={stage} />}>
              <KeyValues
                rows={[
                  ...(doc.delivery
                    ? ([
                        ["Delivery no.", doc.delivery.no],
                        ["Delivered on", formatDate(doc.delivery.date)],
                        ["Received by", doc.delivery.receivedBy || "—"],
                        ...contextRows(doc.delivery).map(([label, text]) => [`Delivery ${label.toLowerCase()}`, text] as [string, string]),
                      ] as [string, string][])
                    : []),
                ]}
              />
            </Card>
          ) : null}
          <Card title="Customer">
            <KeyValues
              rows={[
                ["Name", customer?.name ?? "—"],
                ["Contact", customer?.contactName ?? "—"],
                ["Phone", customerPhone(customer) || "—"],
                ["Terms", doc.terms],
                ["Currency", currencySummary(doc)],
                ["Ship from", doc.warehouse],
                ...contextRows(doc),
              ]}
            />
          </Card>
          <Card title="Activity"><ActivityList entries={doc.history} /></Card>
        </aside>
      </div>

      <FulfilmentPanel orderCode={fulfilling ? doc.code : null} nav={nav} onClose={() => setFulfilling(false)} />
      <DeleteDraftDialog code={deleting ? doc.code : null} onClose={() => setDeleting(false)} onConfirm={remove} />
    </div>
  );
}
