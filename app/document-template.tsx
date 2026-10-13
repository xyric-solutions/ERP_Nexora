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
import {
  KIND_META,
  money,
  amountInWords,
  type DocumentKind,
  type DocumentLine,
  type DocumentRecord,
} from "./document-data";

export type { DocumentKind, DocumentLine, DocumentRecord } from "./document-data";
export { amountInWords, documentLinesFrom } from "./document-data";

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
    <div className="nx-document-wrap">
      <div className="nx-document-toolbar nx-no-print">
        <span>Document preview &middot; prototype fixture, not a numbered record</span>
        <div>
          <button type="button" onClick={() => onAction?.("Download PDF", record.document)}>Download PDF</button>
          <button type="button" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <article className="nx-document" aria-label={`${meta.title} ${record.document}`}>
        <header className="nx-document__letterhead">
          <div className="nx-document__identity">
            <div className="nx-document__mark" aria-hidden="true">N</div>
            <div>
              <strong>Nexora Demonstration Holdings</strong>
              <span>14 Kingsway Terrace &middot; Level 9 &middot; Karachi 75600</span>
              <span>Tax registration 3140-2291-0087 &middot; +92 21 3555 0140 &middot; accounts@nexora.example</span>
            </div>
          </div>
          <div className="nx-document__stamp">
            <h1 className="nx-document__title">{meta.title}</h1>
            <span className="nx-document__badge">Prototype specimen</span>
          </div>
        </header>

        <section className="nx-document__parties">
          <div>
            <span className="nx-document__label">{meta.partyLabel}</span>
            <strong>{record.party}</strong>
            <span>Plot 22, Industrial Estate</span>
            <span>Lahore 54000 &middot; Pakistan</span>
            <span>Tax reg. 8871-0043-2210</span>
          </div>
          <dl className="nx-document__meta">
            <div><dt>{meta.numberLabel}</dt><dd>{record.document}</dd></div>
            <div><dt>Date</dt><dd>{record.date}</dd></div>
            <div><dt>Reference</dt><dd>{record.reference}</dd></div>
            <div><dt>Currency</dt><dd>{record.currency}</dd></div>
            <div><dt>Payment terms</dt><dd>Net 30 days</dd></div>
            <div><dt>Prepared by</dt><dd>{record.owner}</dd></div>
          </dl>
        </section>

        <table className="nx-document__lines">
          <thead>
            <tr>
              <th scope="col" className="nx-document__col-index">#</th>
              <th scope="col">Description</th>
              <th scope="col" className="nx-num">Qty</th>
              <th scope="col">UOM</th>
              <th scope="col" className="nx-num">Rate</th>
              {meta.showTax ? <th scope="col" className="nx-num">Tax %</th> : null}
              <th scope="col" className="nx-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {computed.rows.map((row, index) => (
              <tr key={row.id}>
                <td className="nx-document__col-index">{index + 1}</td>
                <td>
                  <strong>{row.code}</strong>
                  <small>{row.description}</small>
                </td>
                <td className="nx-num">{row.quantity.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td>{row.uom}</td>
                <td className="nx-num">{row.rate.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                {meta.showTax ? <td className="nx-num">{row.taxRate.toFixed(1)}</td> : null}
                <td className="nx-num">{row.net.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="nx-document__close">
          <div className="nx-document__words">
            <span className="nx-document__label">Amount in words</span>
            <strong>{amountInWords(computed.total, record.currency)}</strong>
            <p className="nx-document__terms">
              Goods and services remain the property of Nexora Demonstration Holdings until settled in
              full. Queries must be raised within seven days of the document date. This is a prototype
              specimen: it carries no legal or accounting effect.
            </p>
          </div>
          <dl className="nx-document__totals">
            <div><dt>Subtotal</dt><dd className="nx-num">{money(computed.subtotal, record.currency)}</dd></div>
            {meta.showTax ? (
              <div><dt>Tax</dt><dd className="nx-num">{money(computed.taxTotal, record.currency)}</dd></div>
            ) : null}
            <div className="nx-document__totals-rule">
              <dt>Total {kind === "purchase-order" ? "committed" : "due"}</dt>
              <dd className="nx-num">{money(computed.total, record.currency)}</dd>
            </div>
          </dl>
        </section>

        <footer className="nx-document__foot">
          <div className="nx-document__bank">
            <span className="nx-document__label">Remittance</span>
            <span>Meridian Commercial Bank &middot; Corporate Branch</span>
            <span>Account 0041-882-90117 &middot; IBAN PK36MRDN0041882901170</span>
            <span>Quote {record.document} on every payment.</span>
          </div>
          <div className="nx-document__signatures">
            <div><i />Prepared by</div>
            <div><i />Reviewed by</div>
            <div><i />Authorised signatory</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
