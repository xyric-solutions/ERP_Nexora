"use client";

/**
 * Period comparison panel.
 *
 * Shows every dashboard KPI across the selected periods, so a reviewer can
 * read day against day, week against week or year against year in one table
 * rather than switching the date filter repeatedly.
 *
 * A table rather than a chart, deliberately: six KPIs across up to twelve
 * periods is a grid, and the people who ask for this comparison read grids.
 * Each row carries an inline bar so the shape is still visible at a glance.
 */

import type { ComparisonMode, Granularity, PeriodDelta, ResolvedPeriod, ValueShape } from "@prototype/shared/model/reporting-period";
import { formatValue } from "@prototype/shared/model/reporting-period";
import { Button } from "@/components/ui/button";

export interface ComparisonRow {
  id: string;
  label: string;
  shape: ValueShape;
  series: readonly number[];
  delta: PeriodDelta | null;
}

interface DashboardComparisonProps {
  rows: readonly ComparisonRow[];
  periods: readonly ResolvedPeriod[];
  granularity: Granularity;
  mode: ComparisonMode;
  scopeSummary: string;
  onOpen: (label: string) => void;
}

function deltaText(delta: PeriodDelta | null, shape: ValueShape): string {
  if (!delta) return "—";
  const sign = delta.absolute > 0 ? "+" : "";
  const abs = `${sign}${formatValue(delta.absolute, { ...shape, prefix: shape.prefix })}`;
  if (delta.percent === null) return abs;
  return `${abs} (${sign}${delta.percent.toFixed(1)}%)`;
}

export function DashboardComparison({
  rows, periods, granularity, mode, scopeSummary, onOpen,
}: DashboardComparisonProps) {
  if (mode === "none" || periods.length < 2) return null;

  const unit = granularity === "day" ? "day" : granularity;
  const partial = periods.find((p) => p.partial);

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="nx-period-compare-title">
      <header className="flex flex-col items-start justify-between gap-4 px-5 py-4 sm:flex-row">
        <div>
          <span className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">
            {mode === "year-over-year" ? "Same period last year" : `${unit} by ${unit}`}
          </span>
          <h2 id="nx-period-compare-title" className="mt-1 font-serif text-xl font-semibold text-foreground">Period comparison</h2>
          <p className="mt-1 text-sm text-muted-foreground">{scopeSummary}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {periods.length} {periods.length === 1 ? unit : `${unit}s`}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-180 border-collapse text-sm tabular-nums">
          <caption className="nx-sr-only">
            Each measure across {periods.length} {unit} periods, with the change against {periods[0].longLabel}.
          </caption>
          <thead>
            <tr className="border-y border-border bg-muted/40">
              <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase" scope="col">Measure</th>
              {periods.map((period) => (
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase" key={period.key} title={period.longLabel}>
                  {period.label}
                  {period.partial ? <em className="text-[var(--nx-warning)] not-italic" aria-label="period still in progress"> *</em> : null}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase">Shape</th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const peak = Math.max(1, ...row.series.map((v) => Math.abs(v)));
              return (
                <tr className="border-b border-border hover:bg-muted/50" key={row.id}>
                  <th className="px-3 py-2 text-left font-semibold text-foreground" scope="row">
                    <Button className="h-auto px-0 py-0 font-semibold text-inherit hover:bg-transparent hover:text-primary hover:underline" variant="ghost" type="button" onClick={() => onOpen(row.label)}>{row.label}</Button>
                  </th>
                  {row.series.map((value, index) => (
                    <td className="px-3 py-2 text-right" key={periods[index]?.key ?? index}>
                      {formatValue(value, row.shape)}
                    </td>
                  ))}
                  <td className="w-27 px-3 py-2">
                    <span className="flex h-5.5 items-end gap-0.5" aria-hidden="true">
                      {row.series.map((value, index) => (
                        <i
                          key={periods[index]?.key ?? index}
                          style={{ height: `${Math.max(6, (Math.abs(value) / peak) * 100)}%` }}
                          className={`min-w-0.75 flex-1 rounded-t-sm bg-[var(--nx-series-1)] ${periods[index]?.partial ? "opacity-50" : ""}`}
                        />
                      ))}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${row.delta?.direction === "up" ? "text-[var(--nx-status-good)]" : row.delta?.direction === "down" ? "text-[var(--nx-status-risk)]" : "text-muted-foreground"}`}>
                    {deltaText(row.delta, row.shape)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="border-t border-border px-5 py-4 text-xs leading-relaxed text-muted-foreground">
        <p className="mb-1">
          Change is measured against <strong>{periods[0].longLabel}</strong>, the first period in
          the selection.
        </p>
        {partial ? (
          <p className="mb-1">
            <strong>* {partial.longLabel} is still in progress</strong> ({partial.from} to{" "}
            {partial.to}), so it is not a like-for-like comparison with the completed periods
            beside it.
          </p>
        ) : null}
        <p className="mt-2 border-t border-dashed border-border pt-2">
          The figure for the latest period is the dashboard&rsquo;s own measure. Earlier periods are
          derived mock history anchored on it &mdash; this is a design prototype, so no period
          here is a record of what actually happened.
        </p>
      </footer>
    </section>
  );
}
