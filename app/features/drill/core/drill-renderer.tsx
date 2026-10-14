"use client";

/**
 * THE dashboard renderer. There is exactly one.
 *
 * It is pointed at a filtered subset of a fact table and told what to split by
 * next. Every drill layer is this same component with narrower data.
 *
 * It contains ZERO domain knowledge: no account names, no customer logic, no
 * module branches. It knows only about fact rows, dimensions, buckets and a
 * navigation stack. If a new module ever needs a change in here, the
 * abstraction is wrong - say so and fix the abstraction instead of
 * special-casing this file.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Dimension, DimensionChain, FactRow } from "./types.ts";
import { formatMinor, formatMinorCompact } from "./types.ts";
import { collapseTrail } from "./aggregate.ts";
import { useDrill } from "./use-drill.ts";
import { DrillBars, DrillCumulative, DrillDonut, DrillTrend, bucketFromSeries } from "./visuals.tsx";
import { SourceTransaction } from "./source-transaction.tsx";

/** Leaf detail is paginated. Never ship a whole row set to sum in the browser. */
const LEAF_PAGE_SIZE = 25;
/** A donut stays readable to about this many children; beyond it, bars. */
const DONUT_LIMIT = 7;

export interface DrillRendererProps {
  chain: DimensionChain;
  rows: readonly FactRow[];
  currency: string;
  minorUnits: number;
  moduleId: string;
  pageId: string;
  title: string;
  /** Client-side period filter. Changing it recomputes the open layer. */
  periodFrom?: string;
  periodTo?: string;
  /** Set when the headline comes from a source other than these fact rows. */
  headlineNote?: string | null;
  syncUrl?: boolean;
}

export function DrillRenderer(props: DrillRendererProps) {
  const { chain, rows, currency, minorUnits, moduleId, pageId, title, periodFrom, periodTo, headlineNote, syncUrl } = props;

  // Periods present in the data. `period` is precomputed on the row, never
  // derived here.
  const periods = useMemo(
    () => [...new Set(rows.map((row) => row.period))].sort(),
    [rows],
  );
  // When the host does not control the range, the renderer owns it. Changing
  // it recomputes the open layer; it never closes the panel, because the layer
  // is derived from (stack, filtered rows) rather than held as panel state.
  const [ownFrom, setOwnFrom] = useState<string>("");
  const [ownTo, setOwnTo] = useState<string>("");
  const from = periodFrom ?? (ownFrom || undefined);
  const to = periodTo ?? (ownTo || undefined);
  const hostControlsRange = periodFrom !== undefined || periodTo !== undefined;

  const { stack, layer, descend, ascend, goToDepth, atRoot, atLeaf, backLabel } = useDrill({
    chain,
    rows,
    moduleId,
    pageId,
    periodFrom: from,
    periodTo: to,
    headlineNote,
    syncUrl,
  });
  const [page, setPage] = useState(0);
  const [selectedTransaction, setSelectedTransaction] = useState<FactRow | null>(null);

  const dimensionCount = useMemo(() => {
    let count = 0;
    let dimension: Dimension | null = chain.root;
    while (dimension) {
      count += 1;
      dimension = dimension.next;
    }
    return count;
  }, [chain]);
  // Dashboard and analysis sit above the registered dimensions; the source
  // transaction is a distinct final layer after the document-detail rows.
  const totalJourneyLayers = dimensionCount + 3;
  const currentJourneyLayer = selectedTransaction ? totalJourneyLayers : stack.length + 2;

  const trail = useMemo(
    () => [{ label: chain.name.split(" -> ")[0] ?? "All", depth: 0 }, ...stack.map((node, i) => ({ label: node.label, depth: i + 1 }))],
    [chain.name, stack],
  );
  const { head, collapsed, tail } = collapseTrail(trail, 4);

  // Multi-series: one series per child bucket, so the dataset index selects
  // the series and the point index selects the period. At a leaf there are no
  // children, so the layer's own total series is shown instead.
  const series = useMemo(
    () =>
      layer.buckets.length
        ? layer.buckets.map((bucket) => ({ label: bucket.label, points: bucket.trend ?? [] }))
        : [{ label: layer.splitBy?.name ?? "Total", points: layer.trend }],
    [layer],
  );
  const leafRows = useMemo(
    () => [...layer.rows].sort((a, b) => b.date.localeCompare(a.date)),
    [layer.rows],
  );
  const pageRows = leafRows.slice(page * LEAF_PAGE_SIZE, page * LEAF_PAGE_SIZE + LEAF_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(leafRows.length / LEAF_PAGE_SIZE));

  const single = layer.buckets.length === 1;

  if (selectedTransaction) {
    return (
      <SourceTransaction
        row={selectedTransaction}
        trail={trail}
        currency={currency}
        minorUnits={minorUnits}
        currentLayer={currentJourneyLayer}
        totalLayers={totalJourneyLayers}
        onBack={() => setSelectedTransaction(null)}
        onGoToDepth={(depth) => { setSelectedTransaction(null); goToDepth(depth); }}
      />
    );
  }

  return (
    <section className="nx-drill" aria-label={title}>
      <header className="nx-drill__head">
        <nav className="nx-drill__crumbs" aria-label="Drill path">
          {head.map((crumb) => (
            <Button variant="ghost" key={crumb.depth} type="button" onClick={() => goToDepth(crumb.depth)} aria-current={crumb.depth === stack.length ? "page" : undefined}>
              {crumb.label}
            </Button>
          ))}
          {collapsed.length ? (
            <span className="nx-drill__crumb-collapsed" title={collapsed.map((c) => c.label).join(" / ")}>
              &hellip;
            </span>
          ) : null}
          {tail.map((crumb) => (
            <Button variant="ghost" key={crumb.depth} type="button" onClick={() => goToDepth(crumb.depth)} aria-current={crumb.depth === stack.length ? "page" : undefined}>
              {crumb.label}
            </Button>
          ))}
        </nav>

        <div className="nx-drill__tools">
          {hostControlsRange ? null : (
            <label className="nx-drill__range">
              <span className="nx-sr-only">Period from</span>
              <select value={ownFrom} onChange={(event) => setOwnFrom(event.target.value)} aria-label="Period from">
                <option value="">From: earliest</option>
                {periods.map((period) => (
                  <option key={period} value={period}>{`From ${period}`}</option>
                ))}
              </select>
              <span className="nx-sr-only">Period to</span>
              <select value={ownTo} onChange={(event) => setOwnTo(event.target.value)} aria-label="Period to">
                <option value="">To: latest</option>
                {periods.map((period) => (
                  <option key={period} value={period}>{`To ${period}`}</option>
                ))}
              </select>
            </label>
          )}
        {/* Labelled with the level it returns to, not "Back". Hidden at root. */}
        {atRoot ? null : (
          <Button variant="ghost" className="nx-drill__back" type="button" onClick={ascend}>
            <span aria-hidden="true">&larr;</span>
            <span className="nx-drill__back-label">{backLabel}</span>
          </Button>
        )}
        </div>
      </header>

      <div className="nx-drill__headline">
        <div>
          <span className="nx-eyebrow">{layer.splitBy ? `Split by ${layer.splitBy.name}` : "Detail"}</span>
          <strong className="nx-num">{formatMinor(layer.total, currency, minorUnits)}</strong>
          <small>
            {layer.rows.length.toLocaleString("en-US")} rows
            {layer.splitBy ? ` · ${layer.buckets.length} ${layer.buckets.length === 1 ? "child" : "children"}` : ""}
          </small>
        </div>
        {layer.comparison ? (
          <div className="nx-drill__compare">
            <span className="nx-eyebrow">Period on period</span>
            <strong className={layer.comparison.delta >= 0 ? "is-up nx-num" : "is-down nx-num"}>
              {layer.comparison.delta >= 0 ? "+" : ""}
              {formatMinorCompact(layer.comparison.delta, currency, minorUnits)}
            </strong>
            <small>
              {layer.comparison.excludedPartial
                ? `${layer.comparison.excludedPartial} excluded as a partial period`
                : "against the previous full period"}
            </small>
          </div>
        ) : null}
      </div>
      <div className="nx-drill__journey-status"><span>Layer {currentJourneyLayer} of {totalJourneyLayers}</span><strong>{atLeaf ? "Document detail" : "Next: " + (layer.splitBy?.name ?? "source transaction")}</strong><small>Click any visual segment or row to continue to the source transaction.</small></div>

      {/* A headline from another source says so; it never borrows unrelated rows. */}
      {layer.headlineNote ? <p className="nx-drill__source-note">{layer.headlineNote}</p> : null}

      <DrillTrend
        series={series}
        currency={currency}
        minorUnits={minorUnits}
        onPickPoint={(datasetIndex, pointIndex) => {
          // Dataset index selects the series - which is a child bucket - and
          // the point index selects the period. `bucketFromSeries` is used for
          // the period label; the descend target is the bucket itself, because
          // period is not a level in this chain.
          void bucketFromSeries(series, datasetIndex, pointIndex);
          const target = layer.buckets[datasetIndex];
          if (target) descend(target);
        }}
      />

      {layer.splitBy ? (
        single ? (
          <DrillCumulative
            trend={layer.trend}
            currency={currency}
            minorUnits={minorUnits}
            bucket={layer.buckets[0]}
            onPick={descend}
          />
        ) : layer.buckets.length <= DONUT_LIMIT ? (
          <DrillDonut buckets={layer.buckets} onPick={descend} currency={currency} minorUnits={minorUnits} />
        ) : (
          <DrillBars buckets={layer.buckets} onPick={descend} currency={currency} minorUnits={minorUnits} />
        )
      ) : null}

      {/* A zero-value child explains itself rather than opening a blank panel. */}
      {layer.splitBy && layer.buckets.some((bucket) => bucket.empty) ? (
        <p className="nx-drill__zero-note">
          {layer.buckets.filter((b) => b.empty).length} child
          {layer.buckets.filter((b) => b.empty).length === 1 ? "" : "ren"} net to zero in this range. They hold
          postings that cancel out, so opening one shows its rows rather than a blank panel.
        </p>
      ) : null}

      {atLeaf ? (
        <div className="nx-drill__leaf">
          <div className="nx-drill__leaf-head">
            <h3>Detail rows</h3>
            <span>
              {leafRows.length.toLocaleString("en-US")} rows &middot; page {page + 1} of {pageCount}
            </span>
          </div>
          <div className="nx-table-wrap">
            <table className="nx-drill__table">
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Type</th>
                  <th scope="col">Date</th>
                  <th scope="col">Period</th>
                  <th scope="col" className="nx-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} onClick={() => setSelectedTransaction(row)}>
                    <td><button className="nx-drill__transaction-link" type="button" onClick={(event) => { event.stopPropagation(); setSelectedTransaction(row); }}>{row.documentId}</button></td>
                    <td>{row.documentType}</td>
                    <td>{row.date}</td>
                    <td>{row.period}</td>
                    <td className="nx-num">{formatMinor(row.amount, currency, minorUnits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 ? (
            <div className="nx-drill__pager">
              <Button variant="outline" type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                Previous
              </Button>
              <Button variant="outline" type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>
                Next
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
