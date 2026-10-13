"use client";

/**
 * Dependency-free SVG chart kit for the isolated Nexora UI/UX prototype.
 *
 * Every chart is pure presentation over deterministic mock fixtures: no data
 * layer, no network, no Demo Account values. Each chart exposes an accessible
 * name plus an adjacent screen-reader table so the visual is never the only
 * representation of the numbers.
 */

import type { CSSProperties, ReactNode } from "react";

/**
 * Series identity tones.
 *
 * The seven categorical tones map to the validated cool palette in
 * `theme-colors.css`, in FIXED ORDER. They previously pointed at brand and status
 * tokens (`--nx-success`, `--nx-warning`, `--nx-danger`) plus two raw hexes,
 * which meant a status colour could impersonate a series. Status now has its
 * own reserved tones below and the two are never interchangeable.
 *
 * A series that *means* good or bad wears a status tone; a series that is
 * merely "the fourth one" wears a categorical tone. Never both in one chart.
 */
export type ChartCategoricalTone = "blue" | "plum" | "cyan" | "violet" | "teal" | "indigo" | "sky";
export type ChartStatusTone = "good" | "warn" | "risk" | "bad";
export type ChartTone = ChartCategoricalTone | ChartStatusTone | "other";

export const chartToneColor: Record<ChartTone, string> = {
  // Categorical - fixed order, matches --nx-series-1..7.
  blue: "var(--nx-series-1)",
  plum: "var(--nx-series-2)",
  cyan: "var(--nx-series-3)",
  violet: "var(--nx-series-4)",
  teal: "var(--nx-series-5)",
  indigo: "var(--nx-series-6)",
  sky: "var(--nx-series-7)",
  // Status - reserved meaning, always shipped with a label.
  good: "var(--nx-status-good)",
  warn: "var(--nx-status-warn)",
  risk: "var(--nx-status-risk)",
  bad: "var(--nx-status-bad)",
  // Anything past the last slot folds into one neutral "other".
  other: "var(--nx-text-subtle)",
};

const chartToneTextColor: Record<ChartTone, string> = {
  blue: "var(--nx-on-series-1)",
  plum: "var(--nx-on-series-2)",
  cyan: "var(--nx-on-series-3)",
  violet: "var(--nx-on-series-4)",
  teal: "var(--nx-on-series-5)",
  indigo: "var(--nx-on-series-6)",
  sky: "var(--nx-on-series-7)",
  good: "var(--nx-on-status-good)",
  warn: "var(--nx-on-status-warn)",
  risk: "var(--nx-on-status-risk)",
  bad: "var(--nx-on-status-bad)",
  other: "var(--nx-on-chart-other)",
};

/** The categorical order. It is the colour-blind-safety mechanism: do not rearrange. */
export const toneOrder: readonly ChartCategoricalTone[] = [
  "blue", "plum", "cyan", "violet", "teal", "indigo", "sky",
];

/** The ordinal ramp, for stages and tiers where the order carries meaning. */
export const ordinalRamp: readonly string[] = [
  "var(--nx-ordinal-1)",
  "var(--nx-ordinal-2)",
  "var(--nx-ordinal-3)",
  "var(--nx-ordinal-4)",
  "var(--nx-ordinal-5)",
];

export function ordinalAt(index: number, count: number): string {
  if (count <= 1) return ordinalRamp[ordinalRamp.length - 1];
  // Spread the requested number of stages across the five steps.
  const position = Math.round((index / (count - 1)) * (ordinalRamp.length - 1));
  return ordinalRamp[Math.min(ordinalRamp.length - 1, Math.max(0, position))];
}

/**
 * Assign the next categorical tone. Slots are never cycled: an eighth series
 * folds into "other" rather than reusing slot 1, which would make two
 * different series the same colour.
 */
export function toneAt(index: number): ChartTone {
  return index < toneOrder.length ? toneOrder[index] : "other";
}

function roundTo(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function niceCeiling(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Screen-reader equivalent for every chart; visually hidden but always present. */
function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}) {
  return (
    <table className="nx-sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={`${row[0]}-${rowIndex}`}>
            {row.map((cell, cellIndex) => (
              cellIndex === 0
                ? <th key={`${cell}-${cellIndex}`} scope="row">{cell}</th>
                : <td key={`${cell}-${cellIndex}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChartLegend({ items }: { items: readonly { label: string; tone: ChartTone; hint?: string }[] }) {
  return (
    <ul className="nx-chart-legend" aria-hidden="true">
      {items.map((item) => (
        <li key={item.label}>
          <i style={{ background: chartToneColor[item.tone] }} />
          <span>{item.label}</span>
          {item.hint ? <b>{item.hint}</b> : null}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline — inline KPI trend                                        */
/* ------------------------------------------------------------------ */

export function Sparkline({
  values,
  tone = "blue",
  label,
}: {
  values: readonly number[];
  tone?: ChartTone;
  label: string;
}) {
  if (values.length < 2) return null;
  const width = 120;
  const height = 32;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => ({
    x: roundTo(index * step),
    y: roundTo(height - ((value - minimum) / span) * (height - 4) - 2),
  }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const color = chartToneColor[tone];
  const last = points[points.length - 1];

  return (
    <svg
      className="nx-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      focusable="false"
    >
      <path d={area} fill={color} opacity={0.14} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={2.6} fill={color} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Combo chart — comparison bars + primary line/area                   */
/* ------------------------------------------------------------------ */

export interface ComboChartProps {
  labels: readonly string[];
  barSeries?: { label: string; values: readonly number[]; tone?: ChartTone };
  lineSeries: { label: string; values: readonly number[]; tone?: ChartTone };
  formatValue: (value: number) => string;
  accessibleSummary: string;
}

export function ComboChart({ labels, barSeries, lineSeries, formatValue, accessibleSummary }: ComboChartProps) {
  const width = 720;
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 28, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maximum = niceCeiling(Math.max(1, ...(barSeries?.values ?? []), ...lineSeries.values));
  const slot = plotWidth / labels.length;
  const barWidth = Math.min(26, slot * 0.44);
  const barTone = chartToneColor[barSeries?.tone ?? "cyan"];
  const lineTone = chartToneColor[lineSeries.tone ?? "blue"];
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => maximum * ratio);
  const labelStride = Math.max(1, Math.ceil(labels.length / 12));

  const pointFor = (value: number, index: number) => ({
    x: roundTo(padding.left + slot * index + slot / 2),
    y: roundTo(padding.top + plotHeight - (value / maximum) * plotHeight),
  });
  const linePoints = lineSeries.values.map(pointFor);
  const linePath = linePoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L${linePoints[linePoints.length - 1]?.x ?? padding.left} ${padding.top + plotHeight} L${linePoints[0]?.x ?? padding.left} ${padding.top + plotHeight} Z`;

  return (
    <figure className="nx-chart nx-chart--combo">
      <ChartLegend
        items={[
          { label: lineSeries.label, tone: lineSeries.tone ?? "blue" },
          ...(barSeries ? [{ label: barSeries.label, tone: barSeries.tone ?? "cyan" } as const] : []),
        ]}
      />
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={accessibleSummary} focusable="false" preserveAspectRatio="xMidYMid meet">
        {gridValues.map((value) => {
          const y = roundTo(padding.top + plotHeight - (value / maximum) * plotHeight);
          return (
            <g key={value}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="nx-chart__grid" />
              <text x={padding.left - 8} y={y + 4} className="nx-chart__axis" textAnchor="end">{formatValue(value)}</text>
            </g>
          );
        })}
        {barSeries?.values.map((value, index) => {
          const barHeight = Math.max(2, (value / maximum) * plotHeight);
          return (
            <rect
              key={labels[index]}
              x={roundTo(padding.left + slot * index + slot / 2 - barWidth / 2)}
              y={roundTo(padding.top + plotHeight - barHeight)}
              width={roundTo(barWidth)}
              height={roundTo(barHeight)}
              rx={3}
              fill={barTone}
              opacity={0.42}
            >
              <title>{`${labels[index]} · ${barSeries.label}: ${formatValue(value)}`}</title>
            </rect>
          );
        })}
        <path d={areaPath} fill={lineTone} opacity={0.1} />
        <path d={linePath} fill="none" stroke={lineTone} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {linePoints.map((point, index) => (
          <circle key={labels[index]} cx={point.x} cy={point.y} r={3.4} fill="var(--nx-surface)" stroke={lineTone} strokeWidth={2}>
            <title>{`${labels[index]} · ${lineSeries.label}: ${formatValue(lineSeries.values[index])}`}</title>
          </circle>
        ))}
        {labels.map((label, index) => (
          index % labelStride === 0 || index === labels.length - 1 ? (
          <text
            key={label}
            x={roundTo(padding.left + slot * index + slot / 2)}
            y={height - 8}
            className="nx-chart__axis"
            textAnchor="middle"
          >
            {label}
          </text>
          ) : null
        ))}
      </svg>
      <ChartTable
        caption={accessibleSummary}
        columns={barSeries ? ["Period", lineSeries.label, barSeries.label] : ["Period", lineSeries.label]}
        rows={labels.map((label, index) => barSeries
          ? [label, formatValue(lineSeries.values[index]), formatValue(barSeries.values[index])]
          : [label, formatValue(lineSeries.values[index])])}
      />
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked bars — composition over time                                */
/* ------------------------------------------------------------------ */

export interface StackedSeries {
  label: string;
  tone: ChartTone;
  values: readonly number[];
}

export function StackedBarChart({
  labels,
  series,
  formatValue,
  accessibleSummary,
}: {
  labels: readonly string[];
  series: readonly StackedSeries[];
  formatValue: (value: number) => string;
  accessibleSummary: string;
}) {
  const width = 720;
  const height = 240;
  const padding = { top: 14, right: 16, bottom: 28, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const totals = labels.map((_, index) => series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0));
  const maximum = niceCeiling(Math.max(1, ...totals));
  const slot = plotWidth / labels.length;
  const barWidth = Math.min(38, slot * 0.6);

  return (
    <figure className="nx-chart nx-chart--stacked">
      <ChartLegend items={series.map((item) => ({ label: item.label, tone: item.tone }))} />
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={accessibleSummary} focusable="false" preserveAspectRatio="xMidYMid meet">
        {[0, 0.5, 1].map((ratio) => {
          const y = roundTo(padding.top + plotHeight - ratio * plotHeight);
          return (
            <g key={ratio}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="nx-chart__grid" />
              <text x={padding.left - 8} y={y + 4} className="nx-chart__axis" textAnchor="end">{formatValue(maximum * ratio)}</text>
            </g>
          );
        })}
        {labels.map((label, index) => {
          let cursor = padding.top + plotHeight;
          return (
            <g key={label}>
              {series.map((item) => {
                const value = item.values[index] ?? 0;
                const segmentHeight = (value / maximum) * plotHeight;
                cursor -= segmentHeight;
                return (
                  <rect
                    key={item.label}
                    x={roundTo(padding.left + slot * index + slot / 2 - barWidth / 2)}
                    y={roundTo(cursor)}
                    width={roundTo(barWidth)}
                    height={roundTo(Math.max(0, segmentHeight))}
                    fill={chartToneColor[item.tone]}
                  >
                    <title>{`${label} · ${item.label}: ${formatValue(value)}`}</title>
                  </rect>
                );
              })}
              <text x={roundTo(padding.left + slot * index + slot / 2)} y={height - 8} className="nx-chart__axis" textAnchor="middle">{label}</text>
            </g>
          );
        })}
      </svg>
      <ChartTable
        caption={accessibleSummary}
        columns={["Period", ...series.map((item) => item.label), "Total"]}
        rows={labels.map((label, index) => [
          label,
          ...series.map((item) => formatValue(item.values[index] ?? 0)),
          formatValue(totals[index]),
        ])}
      />
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Donut — part-to-whole composition                                   */
/* ------------------------------------------------------------------ */

export interface DonutDatum {
  name: string;
  value: number;
  tone?: ChartTone;
}

export function DonutChart({
  data,
  centerValue,
  centerLabel,
  formatValue = (value: number) => String(value),
  accessibleSummary,
}: {
  data: readonly DonutDatum[];
  centerValue?: string;
  centerLabel?: string;
  formatValue?: (value: number) => string;
  accessibleSummary: string;
}) {
  const segments = data.filter((item) => Number.isFinite(item.value) && item.value > 0);
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return null;

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const arcs = segments.reduce<{ cursor: number; items: { item: DonutDatum; index: number; length: number; offset: number }[] }>(
    (state, item, index) => {
      const length = (item.value / total) * circumference;
      return {
        cursor: state.cursor + length,
        items: [...state.items, { item, index, length, offset: state.cursor }],
      };
    },
    { cursor: 0, items: [] },
  ).items;

  return (
    <figure className="nx-chart nx-chart--donut">
      <div className="nx-donut-layout">
        <svg viewBox="0 0 160 160" role="img" aria-label={accessibleSummary} focusable="false" className="nx-donut-svg">
          <g transform="rotate(-90 80 80)">
            {arcs.map(({ item, index, length, offset }) => (
              <circle
                key={item.name}
                cx={80}
                cy={80}
                r={radius}
                fill="none"
                stroke={chartToneColor[item.tone ?? toneAt(index)]}
                strokeWidth={22}
                strokeDasharray={`${roundTo(length)} ${roundTo(circumference - length)}`}
                strokeDashoffset={roundTo(-offset)}
              >
                <title>{`${item.name}: ${formatValue(item.value)}`}</title>
              </circle>
            ))}
          </g>
          {centerValue ? <text x="80" y="78" textAnchor="middle" className="nx-donut-svg__value">{centerValue}</text> : null}
          {centerLabel ? <text x="80" y="94" textAnchor="middle" className="nx-donut-svg__label">{centerLabel}</text> : null}
        </svg>
        <ul className="nx-donut-key" aria-hidden="true">
          {segments.map((item, index) => (
            <li key={item.name}>
              <i style={{ background: chartToneColor[item.tone ?? toneAt(index)] }} />
              <span>{item.name}</span>
              <b>{formatValue(item.value)}</b>
            </li>
          ))}
        </ul>
      </div>
      <ChartTable
        caption={accessibleSummary}
        columns={["Category", "Value", "Share"]}
        rows={segments.map((item) => [item.name, formatValue(item.value), `${Math.round((item.value / total) * 100)}%`])}
      />
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Waterfall — contribution bridge                                     */
/* ------------------------------------------------------------------ */

export interface WaterfallStep {
  id: string;
  label: string;
  value: number;
  isTotal?: boolean;
}

export function WaterfallChart({
  steps,
  formatValue,
  accessibleSummary,
}: {
  steps: readonly WaterfallStep[];
  formatValue: (value: number) => string;
  accessibleSummary: string;
}) {
  const width = 720;
  const height = 250;
  const padding = { top: 16, right: 16, bottom: 42, left: 60 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const bars = steps.reduce<{ running: number; items: (WaterfallStep & { start: number; end: number; low: number; high: number })[] }>(
    (state, step) => {
      const start = step.isTotal ? 0 : state.running;
      const end = step.isTotal ? step.value : state.running + step.value;
      return {
        running: end,
        items: [...state.items, { ...step, start, end, low: Math.min(start, end), high: Math.max(start, end) }],
      };
    },
    { running: 0, items: [] },
  ).items;
  const maximum = niceCeiling(Math.max(1, ...bars.map((bar) => bar.high)));
  const slot = plotWidth / bars.length;
  const barWidth = Math.min(52, slot * 0.58);
  const yFor = (value: number) => roundTo(padding.top + plotHeight - (value / maximum) * plotHeight);

  return (
    <figure className="nx-chart nx-chart--waterfall">
      <ChartLegend
        items={[
          { label: "Increase", tone: "teal" },
          { label: "Decrease", tone: "plum" },
          { label: "Total", tone: "blue" },
        ]}
      />
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={accessibleSummary} focusable="false" preserveAspectRatio="xMidYMid meet">
        {[0, 0.5, 1].map((ratio) => {
          const y = yFor(maximum * ratio);
          return (
            <g key={ratio}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="nx-chart__grid" />
              <text x={padding.left - 8} y={y + 4} className="nx-chart__axis" textAnchor="end">{formatValue(maximum * ratio)}</text>
            </g>
          );
        })}
        {bars.map((bar, index) => {
          const tone: ChartTone = bar.isTotal ? "blue" : bar.value >= 0 ? "teal" : "plum";
          const x = roundTo(padding.left + slot * index + slot / 2 - barWidth / 2);
          const top = yFor(bar.high);
          const barHeight = Math.max(2, yFor(bar.low) - top);
          const previous = bars[index - 1];
          return (
            <g key={bar.id}>
              {previous ? (
                <line
                  x1={roundTo(padding.left + slot * (index - 1) + slot / 2 + barWidth / 2)}
                  x2={x}
                  y1={yFor(previous.end)}
                  y2={yFor(previous.end)}
                  className="nx-chart__connector"
                />
              ) : null}
              <rect x={x} y={top} width={roundTo(barWidth)} height={roundTo(barHeight)} rx={3} fill={chartToneColor[tone]}>
                <title>{`${bar.label}: ${formatValue(bar.value)}${bar.isTotal ? "" : ` · running ${formatValue(bar.end)}`}`}</title>
              </rect>
              <text x={roundTo(x + barWidth / 2)} y={top - 6} className="nx-chart__value" textAnchor="middle">
                {formatValue(bar.value)}
              </text>
              <text x={roundTo(x + barWidth / 2)} y={height - 12} className="nx-chart__axis" textAnchor="middle">
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ChartTable
        caption={accessibleSummary}
        columns={["Step", "Movement", "Running total"]}
        rows={bars.map((bar) => [bar.label, formatValue(bar.value), formatValue(bar.end)])}
      />
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Funnel — stage conversion                                           */
/* ------------------------------------------------------------------ */

export interface FunnelStage {
  id: string;
  label: string;
  value: number;
  display: string;
}

export function FunnelChart({
  stages,
  accessibleSummary,
  onSelect,
}: {
  stages: readonly FunnelStage[];
  accessibleSummary: string;
  onSelect?: (stage: FunnelStage) => void;
}) {
  const top = stages[0]?.value ?? 1;
  return (
    <figure className="nx-chart nx-chart--funnel">
      <div className="nx-funnel" role="group" aria-label={accessibleSummary}>
        {stages.map((stage, index) => {
          const ratio = Math.max(0.16, stage.value / (top || 1));
          const conversion = index === 0 ? 100 : Math.round((stage.value / (stages[index - 1]?.value || 1)) * 100);
          const style = { "--nx-funnel-width": `${roundTo(ratio * 100)}%` } as CSSProperties;
          return (
            <button
              className="nx-funnel__stage"
              data-stage={index}
              key={stage.id}
              onClick={() => onSelect?.(stage)}
              style={style}
              type="button"
            >
              <span className="nx-funnel__bar" aria-hidden="true" style={{ background: ordinalAt(index, stages.length) }} />
              <span className="nx-funnel__meta">
                <strong>{stage.label}</strong>
                <b>{stage.display}</b>
                {index > 0 ? <small>{conversion}% of previous</small> : <small>Entry stage</small>}
              </span>
            </button>
          );
        })}
      </div>
      <ChartTable
        caption={accessibleSummary}
        columns={["Stage", "Value", "Conversion from previous"]}
        rows={stages.map((stage, index) => [
          stage.label,
          stage.display,
          index === 0 ? "Entry stage" : `${Math.round((stage.value / (stages[index - 1]?.value || 1)) * 100)}%`,
        ])}
      />
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Gauge — actual against target                                       */
/* ------------------------------------------------------------------ */

export function GaugeChart({
  label,
  valueLabel,
  percent,
  targetPercent,
  hint,
  tone = "blue",
  caption,
}: {
  label: string;
  valueLabel: string;
  /** Arc fill, expressed as attainment against target rather than the raw measure. */
  percent: number;
  targetPercent?: number;
  hint?: string;
  tone?: ChartTone;
  caption: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 52;
  const circumference = Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const color = chartToneColor[tone];
  const targetAngle = targetPercent === undefined ? null : Math.PI * (Math.max(0, Math.min(100, targetPercent)) / 100);

  return (
    <figure className="nx-gauge">
      <svg viewBox="0 0 140 84" role="img" aria-label={caption} focusable="false">
        <path d="M 18 70 A 52 52 0 0 1 122 70" className="nx-gauge__track" fill="none" strokeWidth={12} strokeLinecap="round" />
        <path
          d="M 18 70 A 52 52 0 0 1 122 70"
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${roundTo(dash)} ${roundTo(circumference)}`}
        />
        {targetAngle === null ? null : (
          <line
            x1={roundTo(70 - Math.cos(targetAngle) * (radius - 10))}
            y1={roundTo(70 - Math.sin(targetAngle) * (radius - 10))}
            x2={roundTo(70 - Math.cos(targetAngle) * (radius + 10))}
            y2={roundTo(70 - Math.sin(targetAngle) * (radius + 10))}
            className="nx-gauge__target"
          />
        )}
        <text x="70" y="64" className="nx-gauge__value" textAnchor="middle">{valueLabel}</text>
      </svg>
      <figcaption>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : targetPercent === undefined ? null : <small>Target {targetPercent}%</small>}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Radar — multi-axis actual vs target                                 */
/* ------------------------------------------------------------------ */

export interface RadarAxis {
  id: string;
  label: string;
  value: number;
  target: number;
}

export function RadarChart({ axes, accessibleSummary }: { axes: readonly RadarAxis[]; accessibleSummary: string }) {
  const size = 260;
  const center = size / 2;
  const radius = 92;
  const angleFor = (index: number) => (Math.PI * 2 * index) / axes.length - Math.PI / 2;
  const pointFor = (ratio: number, index: number) => {
    const angle = angleFor(index);
    const distance = Math.max(0, Math.min(1, ratio)) * radius;
    return `${roundTo(center + Math.cos(angle) * distance)},${roundTo(center + Math.sin(angle) * distance)}`;
  };
  const valuePolygon = axes.map((axis, index) => pointFor(axis.value / 100, index)).join(" ");
  const targetPolygon = axes.map((axis, index) => pointFor(axis.target / 100, index)).join(" ");

  return (
    <figure className="nx-chart nx-chart--radar">
      <ChartLegend items={[{ label: "Actual", tone: "blue" }, { label: "Target", tone: "indigo" }]} />
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={accessibleSummary} focusable="false">
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon
            key={ring}
            points={axes.map((_, index) => pointFor(ring, index)).join(" ")}
            className="nx-chart__radar-ring"
          />
        ))}
        {axes.map((axis, index) => (
          <line
            key={axis.id}
            x1={center}
            y1={center}
            x2={pointFor(1, index).split(",")[0]}
            y2={pointFor(1, index).split(",")[1]}
            className="nx-chart__radar-spoke"
          />
        ))}
        <polygon points={targetPolygon} className="nx-chart__radar-target" />
        <polygon points={valuePolygon} className="nx-chart__radar-value" />
        {axes.map((axis, index) => {
          const angle = angleFor(index);
          return (
            <text
              key={axis.id}
              x={roundTo(center + Math.cos(angle) * (radius + 18))}
              y={roundTo(center + Math.sin(angle) * (radius + 18)) + 4}
              className="nx-chart__axis"
              textAnchor={Math.abs(Math.cos(angle)) < 0.3 ? "middle" : Math.cos(angle) > 0 ? "start" : "end"}
            >
              {axis.label}
            </text>
          );
        })}
      </svg>
      <ChartTable
        caption={accessibleSummary}
        columns={["Dimension", "Actual", "Target"]}
        rows={axes.map((axis) => [axis.label, String(axis.value), String(axis.target)])}
      />
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Heatmap — density grid                                              */
/* ------------------------------------------------------------------ */

export interface HeatmapCell {
  row: string;
  column: string;
  value: number;
}

export function HeatmapChart({
  cells,
  rows,
  columns,
  tone = "blue",
  formatValue,
  accessibleSummary,
}: {
  cells: readonly HeatmapCell[];
  rows: readonly string[];
  columns: readonly string[];
  tone?: ChartTone;
  formatValue: (value: number) => string;
  accessibleSummary: string;
}) {
  const lookup = new Map(cells.map((cell) => [`${cell.row}|${cell.column}`, cell.value]));
  const values = cells.map((cell) => cell.value);
  const minimum = Math.min(...values, 0);
  const maximum = Math.max(...values, 1);
  const span = maximum - minimum || 1;
  const color = chartToneColor[tone];

  return (
    <figure className="nx-chart nx-chart--heatmap">
      <div
        className="nx-heatmap"
        role="img"
        aria-label={accessibleSummary}
        style={{ "--nx-heatmap-columns": String(columns.length) } as CSSProperties}
      >
        <div className="nx-heatmap__row nx-heatmap__row--head" aria-hidden="true">
          <span className="nx-heatmap__label" />
          {columns.map((column) => <span className="nx-heatmap__column" key={column}>{column}</span>)}
        </div>
        {rows.map((row) => (
          <div className="nx-heatmap__row" key={row}>
            <span className="nx-heatmap__label">{row}</span>
            {columns.map((column) => {
              const value = lookup.get(`${row}|${column}`);
              const intensity = value === undefined ? 0 : 0.12 + ((value - minimum) / span) * 0.88;
              const highIntensity = intensity >= 0.72;
              return (
                <span
                  className="nx-heatmap__cell"
                  key={column}
                  style={{
                    background:
                      value === undefined
                        ? "var(--nx-surface-soft)"
                        : highIntensity
                          ? "var(--nx-heatmap-high-background)"
                          : `color-mix(in srgb, ${color} ${Math.round(intensity * 100)}%, var(--nx-surface))`,
                    color: highIntensity ? "var(--nx-heatmap-high-text)" : undefined,
                  }}
                  title={`${row} · ${column}: ${value === undefined ? "No data" : formatValue(value)}`}
                >
                  {value === undefined ? "" : formatValue(value)}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="nx-heatmap__scale" aria-hidden="true">
        <span>Low</span>
        <i style={{ background: `linear-gradient(to right, color-mix(in srgb, ${color} 12%, var(--nx-surface)), ${color})` }} />
        <span>High</span>
      </div>
      <ChartTable
        caption={accessibleSummary}
        columns={["Row", ...columns]}
        rows={rows.map((row) => [
          row,
          ...columns.map((column) => {
            const value = lookup.get(`${row}|${column}`);
            return value === undefined ? "No data" : formatValue(value);
          }),
        ])}
      />
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Scatter — two measures plus magnitude                               */
/* ------------------------------------------------------------------ */

export interface ScatterPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number;
  tone: ChartTone;
}

export function ScatterChart({
  points,
  xLabel,
  yLabel,
  formatX,
  formatY,
  accessibleSummary,
}: {
  points: readonly ScatterPoint[];
  xLabel: string;
  yLabel: string;
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  accessibleSummary: string;
}) {
  const width = 520;
  const height = 260;
  const padding = { top: 16, right: 18, bottom: 40, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxX = niceCeiling(Math.max(1, ...points.map((point) => point.x)));
  const maxY = niceCeiling(Math.max(1, ...points.map((point) => point.y)));
  const maxSize = Math.max(1, ...points.map((point) => point.size));

  return (
    <figure className="nx-chart nx-chart--scatter">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={accessibleSummary} focusable="false" preserveAspectRatio="xMidYMid meet">
        {[0, 0.5, 1].map((ratio) => {
          const y = roundTo(padding.top + plotHeight - ratio * plotHeight);
          return (
            <g key={`y-${ratio}`}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="nx-chart__grid" />
              <text x={padding.left - 8} y={y + 4} className="nx-chart__axis" textAnchor="end">{formatY(maxY * ratio)}</text>
            </g>
          );
        })}
        {[0, 0.5, 1].map((ratio) => {
          const x = roundTo(padding.left + ratio * plotWidth);
          return (
            <text key={`x-${ratio}`} x={x} y={height - 20} className="nx-chart__axis" textAnchor="middle">{formatX(maxX * ratio)}</text>
          );
        })}
        {/*
          * Scatter is an all-pairs form: any two marks can sit side by side, so
          * every pair - not just neighbours - must be separable. No cool
          * seven-slot palette clears that floor (the leading three fail at
          * dE 8.5 normal against a 15 floor), and the rule is to cut the series
          * count rather than restep the palette. So the marks carry ONE slot and
          * identity comes from position, size and the per-point label instead.
          */}
        {points.map((point) => (
          <circle
            key={point.id}
            cx={roundTo(padding.left + (point.x / maxX) * plotWidth)}
            cy={roundTo(padding.top + plotHeight - (point.y / maxY) * plotHeight)}
            r={roundTo(7 + (point.size / maxSize) * 11)}
            fill="var(--nx-series-1)"
            opacity={0.62}
            stroke="var(--nx-series-1)"
            strokeWidth={1.5}
          >
            <title>{`${point.label} · ${xLabel} ${formatX(point.x)} · ${yLabel} ${formatY(point.y)}`}</title>
          </circle>
        ))}
        <text x={roundTo(padding.left + plotWidth / 2)} y={height - 4} className="nx-chart__axis-title" textAnchor="middle">{xLabel}</text>
        <text x={14} y={roundTo(padding.top + plotHeight / 2)} className="nx-chart__axis-title" textAnchor="middle" transform={`rotate(-90 14 ${roundTo(padding.top + plotHeight / 2)})`}>{yLabel}</text>
      </svg>
      <ChartTable
        caption={accessibleSummary}
        columns={["Item", xLabel, yLabel]}
        rows={points.map((point) => [point.label, formatX(point.x), formatY(point.y)])}
      />
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Treemap — proportional composition                                  */
/* ------------------------------------------------------------------ */

export interface TreemapNode {
  id: string;
  label: string;
  value: number;
  display: string;
  tone: ChartTone;
}

/** Simple slice-and-dice layout; adequate and stable for a small fixed node count. */
export function TreemapChart({
  nodes,
  accessibleSummary,
  onSelect,
}: {
  nodes: readonly TreemapNode[];
  accessibleSummary: string;
  onSelect?: (node: TreemapNode) => void;
}) {
  const total = nodes.reduce((sum, node) => sum + node.value, 0) || 1;
  const [first, ...rest] = nodes;
  const firstShare = first ? (first.value / total) * 100 : 100;
  const restTotal = rest.reduce((sum, node) => sum + node.value, 0) || 1;

  return (
    <figure className="nx-chart nx-chart--treemap">
      <div className="nx-treemap" role="group" aria-label={accessibleSummary}>
        {first ? (
          <button
            className="nx-treemap__tile nx-treemap__tile--lead"
            key={first.id}
            onClick={() => onSelect?.(first)}
            style={{
              background: chartToneColor[first.tone],
              color: chartToneTextColor[first.tone],
              flexBasis: `${roundTo(Math.max(34, firstShare))}%`,
            }}
            type="button"
          >
            <strong>{first.label}</strong>
            <b>{first.display}</b>
            <small>{Math.round(firstShare)}%</small>
          </button>
        ) : null}
        <div className="nx-treemap__stack">
          {rest.map((node) => (
            <button
              className="nx-treemap__tile"
              key={node.id}
              onClick={() => onSelect?.(node)}
              style={{
                background: chartToneColor[node.tone],
                color: chartToneTextColor[node.tone],
                flexGrow: Math.max(1, (node.value / restTotal) * 100),
              }}
              type="button"
            >
              <strong>{node.label}</strong>
              <b>{node.display}</b>
              <small>{Math.round((node.value / total) * 100)}%</small>
            </button>
          ))}
        </div>
      </div>
      <ChartTable
        caption={accessibleSummary}
        columns={["Category", "Value", "Share"]}
        rows={nodes.map((node) => [node.label, node.display, `${Math.round((node.value / total) * 100)}%`])}
      />
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Panel shell                                                          */
/* ------------------------------------------------------------------ */

export function ChartPanel({
  eyebrow,
  title,
  subtitle,
  badge,
  action,
  chartId,
  wide,
  span,
  children,
  note,
  onDrill,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  badge?: string;
  action?: ReactNode;
  chartId: string;
  wide?: boolean;
  /** Explicit grid width in 12-column units; ignored when `wide` is set. */
  span?: 5 | 6 | 7 | 8;
  children: ReactNode;
  note?: string;
  onDrill?: () => void;
}) {
  const widthClass = wide ? " nx-role-panel--wide" : span ? ` nx-role-panel--span-${span}` : "";
  return (
    <article
      className={`nx-role-panel${widthClass}`}
      data-dashboard-chart={chartId}
      data-drillable={onDrill ? "true" : undefined}
      onPointerUp={onDrill ? (event) => {
        if ((event.target as HTMLElement).closest("button, a")) return;
        onDrill();
      } : undefined}
    >
      <div className="nx-role-panel__head">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="nx-role-panel__actions">
          {action ?? (badge ? <span className="nx-role-badge">{badge}</span> : null)}
          {onDrill ? <button className="nx-role-panel__drill-action" type="button" onClick={onDrill} aria-label={"Open " + title + " drill-down"}>Analyse <span aria-hidden="true">↗</span></button> : null}
        </div>
      </div>
      {children}
      {note ? <p className="nx-role-section-note"><strong>Management read-out</strong><span>{note}</span></p> : null}
    </article>
  );
}
