"use client";

/**
 * Invoice panel (prototype): details, payments and payment history in one
 * right-side panel. Replaces the separate Customer Receipts section. Each
 * Save Receipt still creates an individual receipt record (RCT-) in the
 * background so payment history stays traceable.
 *
 * Mock only: nothing is posted to the ledger or bank. When the Sales API is
 * built, receipts must be posted server-side with audit and idempotency.
 */

import { useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field, KeyValues, LinkButton, selectClass, StatusPill, tableClass } from "./sales-ui";
import { InvoicePdfViewer } from "./invoice-viewer";
import { sidePanelClass } from "./fulfilment-panel";
import type { SalesNav } from "./sales-nav";
import { RECEIPT_ACCOUNTS, RECEIPT_METHODS } from "../model/sales-constants";
import { formatDate, money } from "../model/sales-format";
import { commitSales, useSalesState } from "../model/sales-store";
import {
  appliedTo,
  approvalOf,
  approverName,
  displayStatus,
  documentTotal,
  findCustomer,
  findDocument,
  invoiceBalance,
  lineAmount,
  newPaymentInput,
  paidOn,
  receiptsFor,
  recordInvoicePayment,
  validatePayment,
  type FieldErrors,
  type PaymentInput,
  type PaymentKind,
} from "../model/sales-workflow";
import type { SalesDocument } from "../model/sales-types";

const PAYMENT_KINDS: readonly PaymentKind[] = ["Paid in full", "Partially paid"];

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

function InvoiceBody({ invoice, nav, onClose }: { invoice: SalesDocument; nav: SalesNav; onClose: () => void }) {
  const state = useSalesState();
  const customer = findCustomer(state, invoice.customerId);
  const order = findDocument(state, "order", invoice.links.order);
  const quotation = findDocument(state, "quotation", invoice.links.quotation ?? order?.links.quotation);
  const approved = quotation ? approvalOf(quotation) : undefined;
  const receipts = receiptsFor(state, invoice.code);
  const total = documentTotal(invoice);
  const received = paidOn(state, invoice);
  const balance = invoiceBalance(state, invoice);
  const status = displayStatus(invoice);
  const paid = invoice.status === "Paid";
  const lastReceipt = receipts[receipts.length - 1];

  const [payment, setPayment] = useState<PaymentInput>(() => newPaymentInput(state, invoice));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pdfOpen, setPdfOpen] = useState(false);

  const update = (patch: Partial<PaymentInput>) => {
    setPayment((current) => {
      const next = { ...current, ...patch };
      // Paid in full always settles the whole balance.
      if (next.kind === "Paid in full") next.amount = Math.round(balance * 100) / 100;
      else if (patch.kind === "Partially paid") next.amount = 0;
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      if ("kind" in patch) delete next.amount;
      return next;
    });
  };

  const saveReceipt = () => {
    const found = validatePayment(state, invoice, payment);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    try {
      const code = commitSales((sales) => recordInvoicePayment(sales, invoice.code, payment, nav.actor));
      nav.notify(`Receipt ${code} saved against ${invoice.code}.`);
      // Saved: close the panel and return to the list, which shows the new balance and status.
      onClose();
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "The receipt could not be saved.");
    }
  };

  // Navigating replaces the invoice route, which closes this panel.
  const open = (code: string) => nav.open(code);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="grid grid-cols-3 border-b border-border bg-muted">
          {[
            ["Invoice total", money(total)],
            ["Received", money(received)],
            ["Balance due", money(balance)],
          ].map(([label, value], index) => (
            <div key={label} className={index < 2 ? "min-w-0 border-r border-border px-4 py-3" : "min-w-0 px-4 py-3"}>
              <span className="block text-xs text-muted-foreground">{label}</span>
              <strong className={index === 2 && balance > 0 ? "block text-sm font-bold text-[var(--nx-danger)] tabular-nums" : "block text-sm font-bold tabular-nums"}>{value}</strong>
            </div>
          ))}
        </section>

        <Section title="Invoice details">
          <KeyValues
            rows={[
              ["Customer", customer?.display ?? "—"],
              ["Invoice date", formatDate(invoice.date)],
              ["Due date", formatDate(invoice.date2)],
              ["Terms", invoice.terms],
              ["Payment status", <StatusPill key="s" status={status} />],
              ["Payment method", lastReceipt ? lastReceipt.method : "—"],
              ["Last payment date", lastReceipt ? formatDate(lastReceipt.date) : "—"],
              ["Last reference", lastReceipt?.reference || "—"],
              ...(quotation ? ([["Quotation", <LinkButton key="q" mono onClick={() => open(quotation.code)}>{quotation.code}</LinkButton>]] as [string, ReactNode][]) : []),
              ...(approved ? ([["Approved by", `${approverName(approved)} · ${approved.at}`]] as [string, ReactNode][]) : []),
              ...(order ? ([["Sales order", <LinkButton key="o" mono onClick={() => open(order.code)}>{order.code}</LinkButton>]] as [string, ReactNode][]) : []),
              ...(order?.delivery ? ([["Delivery", `${order.delivery.no} · ${formatDate(order.delivery.date)}`]] as [string, ReactNode][]) : []),
              ...(invoice.links.recurring ? ([["Recurring bill", invoice.links.recurring]] as [string, ReactNode][]) : []),
              ...(invoice.reference ? ([["Reference", invoice.reference]] as [string, ReactNode][]) : []),
            ]}
          />
          <div className="overflow-x-auto px-4 pb-4">
            <table className={tableClass}>
              <thead><tr><th>Item</th><th className="text-right!">Qty</th><th className="text-right!">Amount</th></tr></thead>
              <tbody>
                {invoice.lines.map((item, index) => (
                  <tr key={`${item.sku}-${index}`}>
                    <td>{item.desc}<small>{item.tax}% sales tax</small></td>
                    <td className="text-right tabular-nums whitespace-nowrap">{item.qty} {item.uom}</td>
                    <td className="text-right font-semibold tabular-nums">{money(lineAmount(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Record payment">
          {paid ? (
            <p className="m-0 px-4 py-4 text-[0.8125rem] text-muted-foreground">This invoice is fully paid. No balance is due.</p>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Field label="Change invoice status to" required>
                <select className={selectClass} value={payment.kind} onChange={(event) => update({ kind: event.target.value as PaymentKind })}>
                  {PAYMENT_KINDS.map((kind) => <option key={kind}>{kind}</option>)}
                </select>
              </Field>
              <Field
                label="Amount received"
                required
                error={errors.amount}
                hint={payment.kind === "Paid in full" ? "Settles the full balance." : `Less than ${money(balance)}.`}
              >
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  className="text-right"
                  value={payment.amount}
                  readOnly={payment.kind === "Paid in full"}
                  aria-invalid={Boolean(errors.amount)}
                  onChange={(event) => update({ amount: Number(event.target.value) })}
                />
              </Field>
              <Field label="Payment date" required error={errors.date}>
                <Input type="date" value={payment.date} aria-invalid={Boolean(errors.date)} onChange={(event) => update({ date: event.target.value })} />
              </Field>
              <Field label="Payment method" required error={errors.method}>
                <select className={selectClass} value={payment.method} onChange={(event) => update({ method: event.target.value })}>
                  {RECEIPT_METHODS.map((method) => <option key={method}>{method}</option>)}
                </select>
              </Field>
              {payment.method !== "Cash" ? (
                <Field label="Received into">
                  <select className={selectClass} value={payment.account} onChange={(event) => update({ account: event.target.value })}>
                    {RECEIPT_ACCOUNTS.map((account) => <option key={account}>{account}</option>)}
                  </select>
                </Field>
              ) : null}
              <Field label="Reference / transaction ID" required={payment.method !== "Cash"} error={errors.reference}>
                <Input
                  value={payment.reference}
                  placeholder={payment.method === "Cheque" ? "Cheque number" : "e.g. IBFT 88231"}
                  aria-invalid={Boolean(errors.reference)}
                  onChange={(event) => update({ reference: event.target.value })}
                />
              </Field>
              <p className="m-0 text-xs text-muted-foreground sm:col-span-2">
                After saving, the balance becomes {money(Math.max(0, balance - (Number(payment.amount) || 0)))} and the status changes to {payment.kind}.
              </p>
            </div>
          )}
        </Section>

        <Section title="Payment history" aside={<span className="text-xs text-muted-foreground">{receipts.length} payment(s)</span>}>
          {receipts.length ? (
            <div className="overflow-x-auto px-4 pb-4 pt-2">
              <table className={tableClass}>
                <thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Reference</th><th className="text-right!">Amount</th></tr></thead>
                <tbody>
                  {receipts.map((receipt) => (
                    <tr key={receipt.id}>
                      <td><span className="font-mono font-semibold">{receipt.code}</span><small>{receipt.owner}</small></td>
                      <td>{formatDate(receipt.date)}</td>
                      <td>{receipt.method}<small>{receipt.account}</small></td>
                      <td>{receipt.reference || "—"}</td>
                      <td className="text-right font-semibold tabular-nums">{money(appliedTo(receipt, invoice.code))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-0 px-4 py-4 text-[0.8125rem] text-muted-foreground">No payments recorded yet.</p>
          )}
        </Section>
      </div>

      <SheetFooter className="flex-row flex-wrap justify-end border-t border-border bg-muted">
        <Button type="button" variant="outline" onClick={() => setPdfOpen(true)}>
          <FileText /> View PDF
        </Button>
        {!paid ? <Button type="button" onClick={saveReceipt}>Save Receipt</Button> : null}
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

/** Right-side invoice panel: details, Save Receipt and payment history. */
export function InvoicePanel({ invoiceCode, nav, onClose }: { invoiceCode: string | null; nav: SalesNav; onClose: () => void }) {
  const state = useSalesState();
  const invoice = invoiceCode ? findDocument(state, "invoice", invoiceCode) : undefined;
  const customer = invoice ? findCustomer(state, invoice.customerId) : undefined;
  return (
    <Sheet open={Boolean(invoice)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className={sidePanelClass}>
        {invoice ? (
          <>
            <SheetHeader className="border-b border-border pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="font-mono text-lg font-bold">{invoice.code}</SheetTitle>
                <StatusPill status={displayStatus(invoice)} />
              </div>
              <SheetDescription>{customer?.display ?? "—"} · Invoice details, payments and payment history</SheetDescription>
            </SheetHeader>
            <InvoiceBody key={`${invoice.code}-${invoice.status}-${invoice.history.length}`} invoice={invoice} nav={nav} onClose={onClose} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
