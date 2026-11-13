"use client";

/**
 * Invoice panel (prototype). Invoices are read-only once issued. The panel
 * shows the invoice, its payment history (posted receipts and return
 * receipts) and its sale returns. Per the meeting of 11 Nov 2026:
 * - payments are no longer entered here; Receive Payment opens a receipt on
 *   the Receipts page with this invoice ready to allocate;
 * - Sale Return is chosen from Add New on the Invoices page (the panel lists
 *   the invoice's returns); there is no separate returns module.
 *
 * Mock only: nothing is posted to the ledger, bank or stock. When the Sales
 * API is built, returns and receipts must be posted server-side with audit
 * and idempotency.
 */

import { useState, type ReactNode } from "react";
import { FileText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "cn";
import { KeyValues, LinkButton, salesLayer, StatusPill, tableClass } from "./sales-ui";
import { contextRows } from "./project-location-fields";
import { InvoicePdfViewer } from "./invoice-viewer";
import { sidePanelClass } from "./fulfilment-panel";
import type { SalesNav } from "./sales-nav";
import { formatDate } from "../model/sales-format";
import { currencySummary, docMoney } from "../model/sales-currency";
import { useSalesState } from "../model/sales-store";
import {
  approvalOf,
  approverName,
  displayStatus,
  documentTotal,
  findCustomer,
  findDocument,
  invoiceBalance,
  invoiceCredit,
  lineAmount,
  paidOn,
  receiptsFor,
  returnedOn,
  returnedQty,
  returnsFor,
  returnValue,
  reversalsFor,
} from "../model/sales-workflow";
import type { CustomerReceipt, SalesDocument } from "../model/sales-types";

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-border">
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
        <h3 className="m-0 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function InvoiceBody({ invoice, nav }: { invoice: SalesDocument; nav: SalesNav }) {
  const state = useSalesState();
  const customer = findCustomer(state, invoice.customerId);
  const order = findDocument(state, "order", invoice.links.order);
  const quotation = findDocument(state, "quotation", invoice.links.quotation ?? order?.links.quotation);
  const approved = quotation ? approvalOf(quotation) : undefined;
  const receipts = receiptsFor(state, invoice.code);
  const reversals = reversalsFor(state, invoice.code);
  const returns = returnsFor(state, invoice.code);
  const total = documentTotal(invoice);
  const received = paidOn(state, invoice);
  const returned = returnedOn(state, invoice);
  const balance = invoiceBalance(state, invoice);
  const credit = invoiceCredit(state, invoice);
  const lastReceipt = receipts[receipts.length - 1];
  const [pdfOpen, setPdfOpen] = useState(false);
  /** Amount a receipt applied to (or a return receipt reversed from) this invoice. */
  const onInvoice = (doc: CustomerReceipt) => doc.alloc.filter((line) => line.inv === invoice.code).reduce((sum, line) => sum + line.amount, 0);

  // Navigating replaces the invoice route, which closes this panel.
  const open = (code: string) => nav.open(code);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="grid grid-cols-2 border-b border-border bg-muted sm:grid-cols-4">
          {[
            ["Invoice total", docMoney(total, invoice)],
            ["Received", docMoney(received, invoice)],
            ["Returned", docMoney(returned, invoice)],
            [credit > 0 ? "Credit due to customer" : "Balance due", docMoney(credit > 0 ? credit : balance, invoice)],
          ].map(([label, value], index) => (
            <div key={label} className="min-w-0 border-b border-border px-4 py-3 not-last:border-r max-sm:nth-2:border-r-0 sm:border-b-0">
              <span className="block text-xs text-muted-foreground">{label}</span>
              <strong className={index === 3 && balance > 0 ? "block text-sm font-bold text-[var(--nx-danger)] tabular-nums" : "block text-sm font-bold tabular-nums"}>{value}</strong>
            </div>
          ))}
        </section>

        <Section title="Invoice details">
          <KeyValues
            rows={[
              ["Customer", customer ? <LinkButton key="c" onClick={() => open(customer.code)}>{customer.display}</LinkButton> : "—"],
              ["Invoice date", formatDate(invoice.date)],
              ["Due date", formatDate(invoice.date2)],
              ["Terms", invoice.terms],
              ...contextRows(invoice),
              ["Currency", currencySummary(invoice)],
              ["Payment status", <StatusPill key="s" status={displayStatus(invoice)} />],
              ["Last payment", lastReceipt ? `${formatDate(lastReceipt.date)} · ${lastReceipt.method}` : "—"],
              ...(quotation ? ([["Quotation", <LinkButton key="q" mono onClick={() => open(quotation.code)}>{quotation.code}</LinkButton>]] as [string, ReactNode][]) : []),
              ...(approved ? ([["Approved by", `${approverName(approved)} · ${approved.at}`]] as [string, ReactNode][]) : []),
              ...(order ? ([["Sales order", <LinkButton key="o" mono onClick={() => open(order.code)}>{order.code}</LinkButton>]] as [string, ReactNode][]) : []),
              ...(order?.delivery ? ([["Delivery", `${order.delivery.no} · ${formatDate(order.delivery.date)}`]] as [string, ReactNode][]) : []),
              ...(invoice.links.recurring ? ([["Recurring bill", invoice.links.recurring]] as [string, ReactNode][]) : []),
              ...(invoice.reference ? ([["Reference", invoice.reference]] as [string, ReactNode][]) : []),
            ]}
          />
          <div className="relative overflow-x-auto px-4 pb-4">
            <table className={tableClass}>
              <thead><tr><th>Item</th><th className="text-right!">Qty</th><th className="text-right!">Returned</th><th className="text-right!">Amount</th></tr></thead>
              <tbody>
                {invoice.lines.map((item, index) => (
                  <tr key={`${item.sku}-${index}`}>
                    <td>{item.desc}<small>{item.tax}% sales tax</small></td>
                    <td className="text-right tabular-nums whitespace-nowrap">{item.qty} {item.uom}</td>
                    <td className="text-right tabular-nums">{returnedQty(state, invoice.code, item) || "—"}</td>
                    <td className="text-right font-semibold tabular-nums">{docMoney(lineAmount(item), invoice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Payment history" aside={<span className="text-xs text-muted-foreground">{receipts.length + reversals.length} entr{receipts.length + reversals.length === 1 ? "y" : "ies"}</span>}>
          {receipts.length || reversals.length ? (
            <div className="relative overflow-x-auto px-4 pb-4 pt-2">
              <table className={tableClass}>
                <thead><tr><th>Document</th><th>Date</th><th>Method</th><th>Reference</th><th className="text-right!">Amount</th></tr></thead>
                <tbody>
                  {receipts.map((receipt) => (
                    <tr key={receipt.id}>
                      <td><LinkButton mono onClick={() => open(receipt.code)}>{receipt.code}</LinkButton><small>{receipt.owner}</small></td>
                      <td>{formatDate(receipt.date)}</td>
                      <td>{receipt.method}<small>{receipt.account}</small></td>
                      <td>{receipt.reference || "—"}</td>
                      <td className="text-right font-semibold tabular-nums">{docMoney(onInvoice(receipt), invoice)}</td>
                    </tr>
                  ))}
                  {reversals.map((reversal) => (
                    <tr key={reversal.id}>
                      <td><LinkButton mono onClick={() => open(reversal.code)}>{reversal.code}</LinkButton><small>Return of {reversal.against}</small></td>
                      <td>{formatDate(reversal.date)}</td>
                      <td>{reversal.method}<small>{reversal.account}</small></td>
                      <td>{reversal.reference || "—"}</td>
                      <td className="text-right font-semibold text-[var(--nx-danger)] tabular-nums">−{docMoney(onInvoice(reversal), invoice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-0 px-4 py-4 text-[0.8125rem] text-muted-foreground">No payments yet. Use Receive Payment to record one in Receipts.</p>
          )}
        </Section>

        <Section title="Sale returns" aside={<span className="text-xs text-muted-foreground">{returns.length} return(s)</span>}>
          {returns.length ? (
            <div className="relative overflow-x-auto px-4 pb-4 pt-2">
              <table className={tableClass}>
                <thead><tr><th>Return</th><th>Date</th><th>Items</th><th>Reason</th><th className="text-right!">Value</th></tr></thead>
                <tbody>
                  {returns.map((item) => (
                    <tr key={item.id}>
                      <td className="font-mono font-semibold">{item.code}<small>{item.history[0]?.by}</small></td>
                      <td>{formatDate(item.date)}</td>
                      <td>{item.lines.map((line) => <span key={`${line.sku}-${line.desc}`} className="block">{line.qty} × {line.desc}</span>)}</td>
                      <td>{item.reason}</td>
                      <td className="text-right font-semibold tabular-nums">{docMoney(returnValue(item), invoice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-0 px-4 py-4 text-[0.8125rem] text-muted-foreground">No returns against this invoice. Record one with Add New › Sale Return on the Invoices page.</p>
          )}
        </Section>
      </div>

      <SheetFooter className="flex-row flex-wrap justify-end border-t border-border bg-muted">
        <Button type="button" variant="outline" onClick={() => setPdfOpen(true)}>
          <FileText /> View PDF
        </Button>
        {balance > 0 ? (
          <Button type="button" onClick={() => nav.openNew("receipts", invoice.code)}>
            <Wallet /> Receive Payment
          </Button>
        ) : null}
      </SheetFooter>

      {pdfOpen ? (
        <InvoicePdfViewer
          input={{ invoice, customer, deliveryNo: order?.delivery?.no ?? "", received, balance }}
          customerLabel={customer?.display ?? ""}
          onClose={() => setPdfOpen(false)}
        />
      ) : null}
    </>
  );
}

/** Right-side invoice panel: read-only invoice, payment history and returns. */
export function InvoicePanel({ invoiceCode, nav, onClose }: { invoiceCode: string | null; nav: SalesNav; onClose: () => void }) {
  const state = useSalesState();
  const invoice = invoiceCode ? findDocument(state, "invoice", invoiceCode) : undefined;
  const customer = invoice ? findCustomer(state, invoice.customerId) : undefined;
  return (
    <Sheet open={Boolean(invoice)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" overlayClassName={salesLayer.sheetOverlay} className={cn(sidePanelClass, salesLayer.sheet)}>
        {invoice ? (
          <>
            <SheetHeader className="border-b border-border pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="m-0 font-mono text-lg font-bold">{invoice.code}</SheetTitle>
                <StatusPill status={displayStatus(invoice)} />
              </div>
              <SheetDescription className="m-0">{customer?.display ?? "—"} · Read-only invoice, payment history and returns</SheetDescription>
            </SheetHeader>
            <InvoiceBody key={`${invoice.code}-${invoice.history.length}`} invoice={invoice} nav={nav} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
