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

import type { ComparisonMode, Granularity, PeriodDelta, ResolvedPeriod, ValueShape } from "./dashboard-period";
import { formatValue } from "./dashboard-period";

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
    <section className="nx-period-compare" aria-labelledby="nx-period-compare-title">
      <header className="nx-period-compare__head">
        <div>
          <span className="nx-eyebrow">
            {mode === "year-over-year" ? "Same period last year" : `${unit} by ${unit}`}
          </span>
          <h2 id="nx-period-compare-title">Period comparison</h2>
          <p>{scopeSummary}</p>
        </div>
        <span className="nx-period-compare__count">
          {periods.length} {periods.length === 1 ? unit : `${unit}s`}
        </span>
      </header>

      <div className="nx-table-wrap">
        <table className="nx-period-compare__table">
          <caption className="nx-sr-only">
            Each measure across {periods.length} {unit} periods, with the change against {periods[0].longLabel}.
          </caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              {periods.map((period) => (
                <th scope="col" className="nx-num" key={period.key} title={period.longLabel}>
                  {period.label}
                  {period.partial ? <em aria-label="period still in progress"> *</em> : null}
                </th>
              ))}
              <th scope="col" className="nx-num">Shape</th>
              <th scope="col" className="nx-num">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const peak = Math.max(1, ...row.series.map((v) => Math.abs(v)));
              return (
                <tr key={row.id}>
                  <th scope="row">
                    <button type="button" onClick={() => onOpen(row.label)}>{row.label}</button>
                  </th>
                  {row.series.map((value, index) => (
                    <td className="nx-num" key={periods[index]?.key ?? index}>
                      {formatValue(value, row.shape)}
                    </td>
                  ))}
                  <td className="nx-period-compare__shape">
                    <span className="nx-period-compare__bars" aria-hidden="true">
                      {row.series.map((value, index) => (
                        <i
                          key={periods[index]?.key ?? index}
                          style={{ height: `${Math.max(6, (Math.abs(value) / peak) * 100)}%` }}
                          data-partial={periods[index]?.partial ? "true" : "false"}
                        />
                      ))}
                    </span>
                  </td>
                  <td className="nx-num" data-direction={row.delta?.direction ?? "flat"}>
                    {deltaText(row.delta, row.shape)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="nx-period-compare__notes">
        <p>
          Change is measured against <strong>{periods[0].longLabel}</strong>, the first period in
          the selection.
        </p>
        {partial ? (
          <p>
            <strong>* {partial.longLabel} is still in progress</strong> ({partial.from} to{" "}
            {partial.to}), so it is not a like-for-like comparison with the completed periods
            beside it.
          </p>
        ) : null}
        <p className="nx-period-compare__provenance">
          The figure for the latest period is the dashboard&rsquo;s own measure. Earlier periods are
          derived mock history anchored on it &mdash; this is a design prototype, so no period
          here is a record of what actually happened.
        </p>
      </footer>
    </section>
  );
}
