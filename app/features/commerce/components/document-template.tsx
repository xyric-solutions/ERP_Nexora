"use client";

/**
 * Printable business document templates for the isolated prototype.
 *
 * An ERP is judged by the documents it produces, not only by its screens.
 * These render as real A4 documents - letterhead, party blocks, a line table
 * with tabular figures, a totals ladder, amount in words, terms and signature
 * blocks - and print through `print.css` without screen chrome.
 *
 * Every value is an invented fixture. Nothing here posts, numbers, or reaches
 * the Demo Account.
 */

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  KIND_META,
  money,
  amountInWords,
  type DocumentKind,
  type DocumentLine,
  type DocumentRecord,
} from "../model/document-data";

export type { DocumentKind, DocumentLine, DocumentRecord } from "../model/document-data";
export { amountInWords, documentLinesFrom } from "../model/document-data";

export interface NexoraDocumentProps {
  kind: DocumentKind;
  record: DocumentRecord;
  lines: readonly DocumentLine[];
  onAction?: (action: string, target: string) => void;
}

export function NexoraDocument({ kind, record, lines, onAction }: NexoraDocumentProps) {
  const meta = KIND_META[kind];
  const computed = useMemo(() => {
    const rows = lines.map((line) => {
      const net = line.quantity * line.rate;
      const tax = meta.showTax ? net * (line.taxRate / 100) : 0;
      return { ...line, net, tax, gross: net + tax };
    });
    const subtotal = rows.reduce((sum, row) => sum + row.net, 0);
    const taxTotal = rows.reduce((sum, row) => sum + row.tax, 0);
    return { rows, subtotal, taxTotal, total: subtotal + taxTotal };
  }, [lines, meta.showTax]);

  return (
    <div data-print-document className="flex flex-col items-center gap-3.5">
      <div className="nx-no-print flex w-full max-w-205 items-center justify-between gap-4 rounded border border-border bg-muted px-3.5 py-2 text-sm text-muted-foreground">
        <span>Document preview &middot; prototype fixture, not a numbered record</span>
        <div className="flex gap-2">
          <Button variant="outline" type="button" onClick={() => onAction?.("Download PDF", record.document)}>Download PDF</Button>
          <Button variant="outline" type="button" onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <article data-print-sheet className="w-full max-w-205 border border-border bg-card px-11 py-10 text-foreground shadow-sm max-sm:px-4 max-sm:py-5" aria-label={`${meta.title} ${record.document}`}>
        <header className="flex items-start justify-between gap-7 border-b-2 border-foreground pb-4 max-sm:flex-col">
          <div className="flex gap-3">
            <div className="grid size-9.5 shrink-0 place-items-center rounded bg-sidebar font-serif text-xl font-bold text-sidebar-foreground" aria-hidden="true">N</div>
            <div>
              <strong className="block font-serif text-lg font-bold text-foreground">Nexora Demonstration Holdings</strong>
              <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">14 Kingsway Terrace &middot; Level 9 &middot; Karachi 75600</span>
              <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">Tax registration 3140-2291-0087 &middot; +92 21 3555 0140 &middot; accounts@nexora.example</span>
            </div>
          </div>
          <div className="text-right max-sm:text-left">
            <h1 className="m-0 font-serif text-2xl font-semibold tracking-tight text-foreground">{meta.title}</h1>
            <span className="mt-1.5 inline-block rounded-full border border-warning px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-warning">Prototype specimen</span>
          </div>
        </header>

        <section className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-7 border-b border-border py-5 max-sm:grid-cols-1">
          <div>
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{meta.partyLabel}</span>
            <strong className="mb-1 block text-lg font-semibold text-foreground">{record.party}</strong>
            <span className="block text-sm leading-relaxed text-muted-foreground">Plot 22, Industrial Estate</span>
            <span className="block text-sm leading-relaxed text-muted-foreground">Lahore 54000 &middot; Pakistan</span>
            <span className="block text-sm leading-relaxed text-muted-foreground">Tax reg. 8871-0043-2210</span>
          </div>
          <dl className="m-0 grid grid-cols-2 gap-x-5 gap-y-2.5">
            <div className="flex flex-col gap-0.5"><dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{meta.numberLabel}</dt><dd className="m-0 text-sm font-semibold tabular-nums text-foreground">{record.document}</dd></div>
            <div className="flex flex-col gap-0.5"><dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Date</dt><dd className="m-0 text-sm font-semibold tabular-nums text-foreground">{record.date}</dd></div>
            <div className="flex flex-col gap-0.5"><dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Reference</dt><dd className="m-0 text-sm font-semibold tabular-nums text-foreground">{record.reference}</dd></div>
            <div className="flex flex-col gap-0.5"><dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Currency</dt><dd className="m-0 text-sm font-semibold tabular-nums text-foreground">{record.currency}</dd></div>
            <div className="flex flex-col gap-0.5"><dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Payment terms</dt><dd className="m-0 text-sm font-semibold tabular-nums text-foreground">Net 30 days</dd></div>
            <div className="flex flex-col gap-0.5"><dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Prepared by</dt><dd className="m-0 text-sm font-semibold tabular-nums text-foreground">{record.owner}</dd></div>
          </dl>
        </section>

        <table data-print-lines className="mt-5 w-full border-collapse tabular-nums [&_th]:border-b [&_th]:border-foreground [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:text-[0.6875rem] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:whitespace-nowrap [&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-2.5 [&_td]:align-top [&_td]:text-sm [&_td_strong]:block [&_td_strong]:font-semibold [&_td_strong]:text-foreground [&_td_small]:mt-0.5 [&_td_small]:block [&_td_small]:text-[0.6875rem] [&_td_small]:text-muted-foreground">
          <thead>
            <tr>
              <th scope="col" className="w-8.5 text-muted-foreground">#</th>
              <th scope="col">Description</th>
              <th scope="col" className="text-right">Qty</th>
              <th scope="col">UOM</th>
              <th scope="col" className="text-right">Rate</th>
              {meta.showTax ? <th scope="col" className="text-right">Tax %</th> : null}
              <th scope="col" className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {computed.rows.map((row, index) => (
              <tr key={row.id}>
                <td className="w-8.5 text-muted-foreground">{index + 1}</td>
                <td>
                  <strong>{row.code}</strong>
                  <small>{row.description}</small>
                </td>
                <td className="text-right">{row.quantity.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td>{row.uom}</td>
                <td className="text-right">{row.rate.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                {meta.showTax ? <td className="text-right">{row.taxRate.toFixed(1)}</td> : null}
                <td className="text-right">{row.net.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section data-print-close className="grid grid-cols-[minmax(0,1fr)_minmax(15rem,.72fr)] gap-8.5 pt-4.5 max-sm:grid-cols-1">
          <div>
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Amount in words</span>
            <strong className="block font-serif text-lg font-semibold leading-snug text-foreground">{amountInWords(computed.total, record.currency)}</strong>
            <p className="mb-0 mt-3.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
              Goods and services remain the property of Nexora Demonstration Holdings until settled in
              full. Queries must be raised within seven days of the document date. This is a prototype
              specimen: it carries no legal or accounting effect.
            </p>
          </div>
          <dl className="m-0 [&>div]:flex [&>div]:items-baseline [&>div]:justify-between [&>div]:gap-4 [&>div]:border-b [&>div]:border-border [&>div]:py-1.5 [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:text-right [&_dd]:text-sm [&_dd]:font-semibold [&_dd]:tabular-nums [&_dd]:text-foreground">
            <div><dt>Subtotal</dt><dd>{money(computed.subtotal, record.currency)}</dd></div>
            {meta.showTax ? (
              <div><dt>Tax</dt><dd>{money(computed.taxTotal, record.currency)}</dd></div>
            ) : null}
            <div className="mt-1 !border-b-2 !border-t-2 !border-foreground">
              <dt className="font-semibold uppercase tracking-[0.08em] text-foreground!">Total {kind === "purchase-order" ? "committed" : "due"}</dt>
              <dd className="font-serif text-lg! font-bold!">{money(computed.total, record.currency)}</dd>
            </div>
          </dl>
        </section>

        <footer data-print-footer className="mt-7.5 grid grid-cols-2 gap-7.5 border-t border-border pt-4 max-sm:grid-cols-1">
          <div>
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Remittance</span>
            <span className="block text-[0.6875rem] leading-relaxed text-muted-foreground">Meridian Commercial Bank &middot; Corporate Branch</span>
            <span className="block text-[0.6875rem] leading-relaxed text-muted-foreground">Account 0041-882-90117 &middot; IBAN PK36MRDN0041882901170</span>
            <span className="block text-[0.6875rem] leading-relaxed text-muted-foreground">Quote {record.document} on every payment.</span>
          </div>
          <div className="grid grid-cols-3 self-end gap-3.5 [&>div]:text-center [&>div]:text-[0.6875rem] [&>div]:text-muted-foreground [&_i]:mb-1.5 [&_i]:block [&_i]:border-t [&_i]:border-border">
            <div><i />Prepared by</div>
            <div><i />Reviewed by</div>
            <div><i />Authorised signatory</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
