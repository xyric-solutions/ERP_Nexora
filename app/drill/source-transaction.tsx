"use client";

import type { FactRow } from "./types.ts";
import { formatMinor } from "./types.ts";

interface SourceTransactionProps {
  row: FactRow;
  trail: readonly { label: string; depth: number }[];
  currency: string;
  minorUnits: number;
  currentLayer: number;
  totalLayers: number;
  onBack: () => void;
  onGoToDepth: (depth: number) => void;
}

export function SourceTransaction({
  row,
  trail,
  currency,
  minorUnits,
  currentLayer,
  totalLayers,
  onBack,
  onGoToDepth,
}: SourceTransactionProps) {
  return (
    <section className="nx-drill nx-drill--transaction" aria-label={row.documentId + " source transaction"}>
      <header className="nx-drill__head">
        <nav className="nx-drill__crumbs" aria-label="Drill path">
          {trail.map((crumb) => (
            <button key={crumb.depth} type="button" onClick={() => onGoToDepth(crumb.depth)}>{crumb.label}</button>
          ))}
          <button type="button" aria-current="page">{row.documentId}</button>
        </nav>
        <button className="nx-drill__back" type="button" onClick={onBack}>
          <span aria-hidden="true">&larr;</span><span>Back to detail rows</span>
        </button>
      </header>
      <div className="nx-drill__journey-status"><span>Layer {currentLayer} of {totalLayers}</span><strong>Source transaction reached</strong><small>Dashboard → analysis → dimension → document → transaction</small></div>
      <div className="nx-drill-transaction__title">
        <div><span className="nx-eyebrow">Source transaction</span><h2>{row.documentId}</h2><p>Complete mock transaction evidence reached from the dashboard drill path.</p></div>
        <span className="nx-drill-transaction__status">Posted</span>
      </div>
      <section className="nx-drill-transaction__summary" aria-label="Transaction summary">
        <article><span>Document type</span><strong>{row.documentType}</strong></article>
        <article><span>Transaction date</span><strong>{row.date}</strong></article>
        <article><span>Reporting period</span><strong>{row.period}</strong></article>
        <article><span>Transaction value</span><strong className="nx-num">{formatMinor(row.amount, currency, minorUnits)}</strong></article>
      </section>
      <div className="nx-drill-transaction__layout">
        <section className="nx-drill-transaction__card">
          <header><span>Accounting impact</span><h3>Posting lines</h3></header>
          <table>
            <thead><tr><th>Account / dimension</th><th>Description</th><th className="nx-num">Debit</th><th className="nx-num">Credit</th></tr></thead>
            <tbody>
              <tr><td>Primary posting account</td><td>{row.documentType} source value</td><td className="nx-num">{row.amount >= 0 ? formatMinor(row.amount, currency, minorUnits) : "—"}</td><td className="nx-num">{row.amount < 0 ? formatMinor(Math.abs(row.amount), currency, minorUnits) : "—"}</td></tr>
              <tr><td>Control account</td><td>Balanced control-side posting</td><td className="nx-num">{row.amount < 0 ? formatMinor(Math.abs(row.amount), currency, minorUnits) : "—"}</td><td className="nx-num">{row.amount >= 0 ? formatMinor(row.amount, currency, minorUnits) : "—"}</td></tr>
            </tbody>
          </table>
        </section>
        <aside className="nx-drill-transaction__card">
          <header><span>Audit evidence</span><h3>Source and control</h3></header>
          <dl>
            <div><dt>Internal row</dt><dd>{row.id}</dd></div>
            <div><dt>Origin</dt><dd>Prototype fact view</dd></div>
            <div><dt>Approval</dt><dd>Approved · mock workflow</dd></div>
            <div><dt>Evidence</dt><dd>Document and posting trail complete</dd></div>
          </dl>
        </aside>
      </div>
      <footer className="nx-drill-transaction__footer"><p>No live transaction was read or changed. This is a prototype source-level view.</p><div><button type="button" onClick={() => window.print()}>Print</button><button type="button" onClick={onBack}>Return to drill</button></div></footer>
    </section>
  );
}
