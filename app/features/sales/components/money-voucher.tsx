"use client";

/**
 * Printable voucher for a receipt, customer payment or return (Receipts page
 * Print / Preview). Prototype specimen: it is not a posted accounting
 * document and carries no legal effect.
 */

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentViewerFrame, viewerToolbarButton } from "./document-viewer";
import { INVOICE_ISSUER } from "../model/invoice-pdf";
import { moneyDocMeta } from "../model/sales-constants";
import { addressLines } from "../model/customer-model";
import { amountInWords, figure, formatDate } from "../model/sales-format";
import { docCurrency } from "../model/sales-currency";
import { appliedTo, unallocatedOf } from "../model/sales-workflow";
import type { CustomerReceipt, SalesCustomer, SalesState } from "../model/sales-types";

/** Scale that fits the A4 voucher into a narrow window (print always uses full size). */
function fitZoom() {
  if (typeof window === "undefined") return 1;
  return Math.max(0.4, Math.min(1, Math.floor(((window.innerWidth - 32) / 794) * 100) / 100));
}

function VoucherSheet({ doc, customer, state, zoom }: { doc: CustomerReceipt; customer: SalesCustomer | undefined; state: SalesState; zoom: number }) {
  const meta = moneyDocMeta(doc.type);
  const currency = docCurrency(doc);
  const label = "mb-[0.35em] block text-[0.82em] font-bold uppercase tracking-[0.08em] text-[var(--nx-paper-muted)]";
  const incoming = doc.type === "Receipt" || doc.type === "Return payment";
  const facts: [string, string][] = [
    ["Voucher no.", doc.code],
    ["Date", formatDate(doc.date)],
    ["Status", doc.status],
    ["Method", doc.method],
    [incoming ? "Received into" : "Paid from", doc.account || "—"],
    ["Reference", doc.reference || "—"],
    ...(doc.against ? ([["Returns", doc.against]] as [string, string][]) : []),
    ...(doc.purpose ? ([["Purpose", doc.purpose]] as [string, string][]) : []),
  ];
  const onAccount = unallocatedOf(state, doc);
  return (
    <article
      data-print-sheet
      aria-label={`${meta.label} ${doc.code}`}
      style={{ "--z": zoom } as React.CSSProperties}
      className="relative min-h-[calc(1123px*var(--z))] w-[calc(794px*var(--z))] bg-[var(--nx-paper)] px-[3.6em] py-[3.4em] text-[calc(12px*var(--z))] leading-[1.45] text-[var(--nx-paper-ink)] shadow-[0_6px_24px_var(--nx-shadow-color-overlay)]"
    >
      {doc.status === "Draft" ? (
        <div aria-hidden="true" className="absolute top-[13em] right-[4em] rotate-[-12deg] rounded-[0.4em] border-[0.22em] border-[var(--nx-paper-muted)] px-[0.9em] py-[0.3em] text-[1.9em] font-extrabold tracking-[0.12em] text-[var(--nx-paper-muted)] opacity-85">
          DRAFT
        </div>
      ) : null}
      <header className="flex justify-between gap-[2em] border-b-[0.17em] border-[var(--nx-paper-ink)] pb-[1.3em]">
        <div>
          <strong className="block text-[1.45em]">{INVOICE_ISSUER.name}</strong>
          <span className="block text-[0.9em] text-[var(--nx-paper-muted)]">{INVOICE_ISSUER.address}</span>
          <span className="block text-[0.9em] text-[var(--nx-paper-muted)]">{INVOICE_ISSUER.registration}</span>
        </div>
        <div className="text-right">
          <h2 className="m-0 text-[2em] font-semibold tracking-tight">{meta.label}</h2>
          <span className="mt-[0.4em] inline-block rounded-[2em] border border-[var(--nx-paper-rule)] px-[0.7em] py-[0.15em] text-[0.82em] font-semibold uppercase tracking-[0.08em] text-[var(--nx-paper-muted)]">Prototype specimen</span>
        </div>
      </header>
      <section className="grid grid-cols-[1fr_1.1fr] gap-[2.4em] border-b border-[var(--nx-paper-rule)] py-[1.6em]">
        <div>
          <span className={label}>{incoming ? "Received from" : "Paid to"}</span>
          <strong className="mb-[0.25em] block text-[1.3em]">{customer?.name ?? "—"}</strong>
          {addressLines(customer?.billing).map((part) => (
            <span key={part} className="block text-[var(--nx-paper-muted)]">{part}</span>
          ))}
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
      {doc.alloc.length ? (
        <table data-print-lines className="mt-[1.6em] w-full border-collapse tabular-nums [&_td]:border-b [&_td]:border-[var(--nx-paper-rule)] [&_td]:px-[0.6em] [&_td]:py-[0.7em] [&_th]:border-b [&_th]:border-[var(--nx-paper-ink)] [&_th]:px-[0.6em] [&_th]:py-[0.7em] [&_th]:text-left [&_th]:text-[0.82em] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-[0.08em]">
          <thead>
            <tr>
              <th scope="col">{doc.type === "Return receipt" ? "Reversed from invoice" : "Allocated to invoice"}</th>
              <th scope="col" className="text-right!">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.alloc.map((item) => (
              <tr key={item.inv}>
                <td>{item.inv}</td>
                <td className="text-right">{figure(doc.type === "Receipt" && doc.status === "Posted" ? appliedTo(state, doc, item.inv) : item.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <section data-print-close className="grid grid-cols-[1fr_minmax(15em,0.75fr)] gap-[2.6em] pt-[1.4em]">
        <div>
          <span className={label}>Amount in words</span>
          <div className="text-[1.25em] font-semibold leading-[1.35]">{amountInWords(doc.amount, currency)}</div>
          {doc.note ? <p className="mt-[1em] mb-0 text-[0.9em] text-[var(--nx-paper-muted)]">{doc.note}</p> : null}
        </div>
        <dl className="m-0 [&>div]:flex [&>div]:justify-between [&>div]:gap-[1em] [&>div]:border-b [&>div]:border-[var(--nx-paper-rule)] [&>div]:py-[0.45em] [&_dd]:m-0 [&_dd]:font-semibold [&_dt]:text-[var(--nx-paper-muted)]">
          <div className="border-y-[0.17em]! border-[var(--nx-paper-ink)]!">
            <dt className="font-bold uppercase tracking-[0.08em] text-[var(--nx-paper-ink)]!">{meta.amountLabel}</dt>
            <dd className="text-[1.35em] font-extrabold!">{currency} {figure(doc.amount, currency)}</dd>
          </div>
          {doc.type === "Receipt" ? (
            <div><dt>On account</dt><dd>{currency} {figure(onAccount, currency)}</dd></div>
          ) : null}
        </dl>
      </section>
      <footer data-print-footer className="mt-[3em] grid grid-cols-3 gap-[1.2em] border-t border-[var(--nx-paper-rule)] pt-[2.4em] text-center text-[0.88em] text-[var(--nx-paper-muted)]">
        {["Prepared by", "Checked by", incoming ? "Received by" : "Paid by"].map((signature) => (
          <div key={signature}>
            <i className="mb-[0.5em] block border-t border-[var(--nx-paper-rule)]" />
            {signature}
          </div>
        ))}
      </footer>
    </article>
  );
}

/** Full-screen voucher preview with Print. `autoPrint` opens the print dialog straight away. */
export function MoneyVoucherViewer({
  doc,
  customer,
  state,
  autoPrint = false,
  onClose,
}: {
  doc: CustomerReceipt;
  customer: SalesCustomer | undefined;
  state: SalesState;
  autoPrint?: boolean;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(fitZoom);
  useEffect(() => {
    const onResize = () => setZoom(fitZoom());
    window.addEventListener("resize", onResize);
    const timer = autoPrint ? window.setTimeout(() => window.print(), 150) : undefined;
    return () => {
      window.removeEventListener("resize", onResize);
      if (timer) window.clearTimeout(timer);
    };
  }, [autoPrint]);

  return (
    <DocumentViewerFrame
      label={`${doc.code} preview`}
      title={doc.code}
      subtitle={`${moneyDocMeta(doc.type).label} · ${customer?.display ?? "—"}`}
      onClose={onClose}
      tools={
        <Button type="button" variant="outline" className={viewerToolbarButton} onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      }
    >
      <VoucherSheet doc={doc} customer={customer} state={state} zoom={zoom} />
    </DocumentViewerFrame>
  );
}
