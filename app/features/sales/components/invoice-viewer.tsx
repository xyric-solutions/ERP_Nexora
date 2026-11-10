"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Minus, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addressLines, customerPhone } from "../model/customer-model";
import { downloadInvoicePdf, INVOICE_ISSUER, type InvoicePdfInput } from "../model/invoice-pdf";
import { amountInWords, figure, formatDate } from "../model/sales-format";

const A4_WIDTH = 794;

function fitZoom() {
  if (typeof window === "undefined") return 1;
  return Math.max(0.4, Math.min(1, Math.floor(((window.innerWidth - 32) / A4_WIDTH) * 100) / 100));
}

function InvoiceSheet({ invoice, customer, deliveryNo, received, balance, zoom }: InvoicePdfInput & { zoom: number }) {
  const sub = invoice.lines.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const tax = invoice.lines.reduce((sum, item) => sum + (item.qty * item.rate * item.tax) / 100, 0);
  const total = sub + tax;
  const label = "mb-[0.35em] block text-[0.82em] font-bold uppercase tracking-[0.08em] text-[var(--nx-paper-muted)]";
  const facts: [string, string][] = [
    ["Invoice no.", invoice.code],
    ["Invoice date", formatDate(invoice.date)],
    ["Due date", formatDate(invoice.date2)],
    ["Payment terms", invoice.terms],
    ["Sales order", invoice.links.order ?? "—"],
    ["Delivery", deliveryNo || "—"],
    ["Customer ref.", invoice.reference || "—"],
    ["Currency", "PKR"],
  ];
  return (
    <article
      data-print-sheet
      aria-label={`Tax invoice ${invoice.code}`}
      style={{ "--z": zoom } as React.CSSProperties}
      className="relative min-h-[calc(1123px*var(--z))] w-[calc(794px*var(--z))] bg-[var(--nx-paper)] px-[3.6em] py-[3.4em] text-[calc(12px*var(--z))] leading-[1.45] text-[var(--nx-paper-ink)] shadow-[0_6px_24px_var(--nx-shadow-color-overlay)]"
    >
      {invoice.status === "Paid" ? (
        <div aria-hidden="true" className="absolute top-[13em] right-[4em] rotate-[-12deg] rounded-[0.4em] border-[0.22em] border-[var(--nx-success)] px-[0.9em] py-[0.3em] text-[1.9em] font-extrabold tracking-[0.12em] text-[var(--nx-success)] opacity-85">
          PAID
        </div>
      ) : null}
      <header className="flex justify-between gap-[2em] border-b-[0.17em] border-[var(--nx-paper-ink)] pb-[1.3em]">
        <div className="flex gap-[1em]">
          <div aria-hidden="true" className="grid size-[3em] shrink-0 place-items-center rounded-[0.35em] bg-[var(--nx-paper-ink)] text-[1.25em] font-extrabold text-[var(--nx-paper)]">N</div>
          <div>
            <strong className="block text-[1.45em]">{INVOICE_ISSUER.name}</strong>
            <span className="block text-[0.9em] text-[var(--nx-paper-muted)]">{INVOICE_ISSUER.address}</span>
            <span className="block text-[0.9em] text-[var(--nx-paper-muted)]">{INVOICE_ISSUER.registration}</span>
            <span className="block text-[0.9em] text-[var(--nx-paper-muted)]">{INVOICE_ISSUER.email}</span>
          </div>
        </div>
        <div className="text-right">
          <h2 className="m-0 text-[2em] font-semibold tracking-tight text-[var(--nx-paper-ink)]">Tax Invoice</h2>
          <span className="mt-[0.4em] inline-block rounded-[2em] border border-[var(--nx-paper-rule)] px-[0.7em] py-[0.15em] text-[0.82em] font-semibold uppercase tracking-[0.08em] text-[var(--nx-paper-muted)]">Prototype specimen</span>
        </div>
      </header>

      <section className="grid grid-cols-[1fr_1.1fr] gap-[2.4em] border-b border-[var(--nx-paper-rule)] py-[1.6em]">
        <div>
          <span className={label}>Bill to</span>
          <strong className="mb-[0.25em] block text-[1.3em]">{customer?.name ?? "—"}</strong>
          {customer ? (
            <>
              {addressLines(customer.billing).map((part) => (
                <span key={part} className="block text-[var(--nx-paper-muted)]">{part}</span>
              ))}
              <span className="block text-[var(--nx-paper-muted)]">NTN {customer.ntn || "—"}{customer.strn ? ` · STRN ${customer.strn}` : ""}</span>
              {customer.contactName || customerPhone(customer) ? (
                <span className="block text-[var(--nx-paper-muted)]">Attn: {[customer.contactName, customerPhone(customer)].filter(Boolean).join(" · ")}</span>
              ) : null}
            </>
          ) : null}
        </div>
        <dl className="m-0 grid grid-cols-2 gap-x-[1.6em] gap-y-[0.8em]">
          {facts.map(([term, value]) => (
            <div key={term}>
              <dt className="text-[0.82em] font-bold uppercase tracking-[0.08em] text-[var(--nx-paper-muted)]">{term}</dt>
              <dd className="m-0 mt-[0.1em] font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <table data-print-lines className="mt-[1.6em] w-full border-collapse tabular-nums [&_td]:border-b [&_td]:border-[var(--nx-paper-rule)] [&_td]:px-[0.6em] [&_td]:py-[0.8em] [&_td]:align-top [&_th]:border-b [&_th]:border-[var(--nx-paper-ink)] [&_th]:px-[0.6em] [&_th]:py-[0.7em] [&_th]:text-left [&_th]:text-[0.82em] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-[0.08em]">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Description</th>
            <th scope="col" className="text-right!">Qty</th>
            <th scope="col">Unit</th>
            <th scope="col" className="text-right!">Rate</th>
            <th scope="col" className="text-right!">Tax %</th>
            <th scope="col" className="text-right!">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((item, index) => (
            <tr key={`${item.sku}-${index}`}>
              <td className="text-[var(--nx-paper-muted)]">{index + 1}</td>
              <td>
                <strong className="block">{item.sku || "Charge"}</strong>
                <small className="block text-[0.9em] text-[var(--nx-paper-muted)]">{item.desc}</small>
              </td>
              <td className="text-right">{figure(item.qty)}</td>
              <td>{item.uom || "Each"}</td>
              <td className="text-right">{figure(item.rate)}</td>
              <td className="text-right">{Number(item.tax).toFixed(1)}</td>
              <td className="text-right">{figure(item.qty * item.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section data-print-close className="grid grid-cols-[1fr_minmax(15em,0.75fr)] gap-[2.6em] pt-[1.4em]">
        <div>
          <span className={label}>Amount in words</span>
          <div className="text-[1.25em] font-semibold leading-[1.35]">{amountInWords(total)}</div>
          <p className="mt-[1em] mb-0 text-[0.9em] text-[var(--nx-paper-muted)]">
            {invoice.notes ? `${invoice.notes} ` : ""}
            {INVOICE_ISSUER.terms}
          </p>
        </div>
        <dl className="m-0 [&>div]:flex [&>div]:justify-between [&>div]:gap-[1em] [&>div]:border-b [&>div]:border-[var(--nx-paper-rule)] [&>div]:py-[0.45em] [&_dd]:m-0 [&_dd]:font-semibold [&_dt]:text-[var(--nx-paper-muted)]">
          <div><dt>Subtotal</dt><dd>PKR {figure(sub)}</dd></div>
          <div><dt>Sales tax</dt><dd>PKR {figure(tax)}</dd></div>
          <div className="mt-[0.3em] border-y-[0.17em]! border-[var(--nx-paper-ink)]!">
            <dt className="font-bold uppercase tracking-[0.08em] text-[var(--nx-paper-ink)]!">Total due</dt>
            <dd className="text-[1.35em] font-extrabold!">PKR {figure(total)}</dd>
          </div>
          {received > 0 ? (
            <>
              <div><dt>Received</dt><dd>PKR {figure(received)}</dd></div>
              <div><dt>Balance due</dt><dd>PKR {figure(balance)}</dd></div>
            </>
          ) : null}
        </dl>
      </section>

      <footer data-print-footer className="mt-[2.6em] grid grid-cols-2 gap-[2.4em] border-t border-[var(--nx-paper-rule)] pt-[1.2em]">
        <div>
          <span className={label}>Remittance</span>
          <span className="block text-[0.9em] text-[var(--nx-paper-muted)]">{INVOICE_ISSUER.bank}</span>
          <span className="block text-[0.9em] text-[var(--nx-paper-muted)]">{INVOICE_ISSUER.account}</span>
          <span className="block text-[0.9em] text-[var(--nx-paper-muted)]">Quote {invoice.code} on every payment.</span>
        </div>
        <div className="grid grid-cols-3 gap-[1.2em] self-end text-center text-[0.88em] text-[var(--nx-paper-muted)]">
          {["Prepared by", "Reviewed by", "Authorised signatory"].map((signature) => (
            <div key={signature}>
              <i className="mb-[0.5em] block border-t border-[var(--nx-paper-rule)]" />
              {signature}
            </div>
          ))}
        </div>
      </footer>
    </article>
  );
}

/** Full-screen PDF view of an invoice with Download, Print and zoom. */
export function InvoicePdfViewer({ input, customerLabel, onClose }: { input: InvoicePdfInput; customerLabel: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(fitZoom);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onResize = () => setZoom((current) => Math.min(current, fitZoom()));
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      previous?.focus?.();
    };
  }, [onClose]);

  const toolbarButton =
    "border-[var(--nx-emphasis-border)]! bg-transparent! text-[var(--nx-emphasis-text)]! hover:bg-[var(--nx-emphasis-surface-hover)]!";

  return (
    <div
      data-print-viewer
      role="dialog"
      aria-modal="true"
      aria-label={`Invoice ${input.invoice.code} PDF`}
      className="fixed inset-0 z-[190] flex flex-col bg-[var(--nx-overlay-scrim-strong)]"
    >
      <div className="nx-no-print flex flex-wrap items-center gap-2.5 border-b border-[var(--nx-emphasis-border)] bg-[var(--nx-emphasis-background)] px-4 py-2 text-[var(--nx-emphasis-text)]">
        <div className="flex min-w-0 flex-[1_1_12rem] items-center gap-2 font-semibold">
          <FileText className="size-5 shrink-0 text-[var(--nx-emphasis-danger)]" aria-hidden="true" />
          <span className="truncate">
            {input.invoice.code}.pdf <small className="font-normal text-[var(--nx-emphasis-muted)]">· 1 page · {customerLabel}</small>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="outline" className={toolbarButton} aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.4, Math.round((value - 0.1) * 10) / 10))}>
            <Minus />
          </Button>
          <span className="min-w-12 text-center text-xs" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <Button type="button" size="icon" variant="outline" className={toolbarButton} aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.6, Math.round((value + 0.1) * 10) / 10))}>
            <Plus />
          </Button>
        </div>
        <Button type="button" variant="outline" className={toolbarButton} onClick={() => downloadInvoicePdf(input)}>
          <Download /> Download
        </Button>
        <Button type="button" variant="outline" className={toolbarButton} onClick={() => window.print()}>
          <Printer /> Print
        </Button>
        <Button ref={closeRef} type="button" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="grid flex-1 content-start justify-center overflow-auto px-4 pt-6 pb-10">
        <InvoiceSheet {...input} zoom={zoom} />
      </div>
    </div>
  );
}
