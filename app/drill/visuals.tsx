"use client";

/**
 * Drill visuals.
 *
 * Every visual receives buckets and emits the SAME intent: `onPick(bucket)`.
 * There is no click handler per chart. A new chart costs about three lines and
 * is drillable to full depth automatically, because descending is the
 * renderer's job, not the chart's.
 *
 * On multi-series charts the dataset index selects the series and the point
 * index selects the period; `bucketFromSeries` applies that convention so no
 * chart has to reimplement it.
 *
 * Colour comes from the designation theme tokens, never from hard-coded hex.
 */

import type { DrillBucket, TrendPoint } from "./types.ts";
import { formatMinorCompact } from "./types.ts";

interface PickProps {
  buckets: readonly DrillBucket[];
  onPick: (bucket: DrillBucket) => void;
  currency: string;
  minorUnits: number;
}

// The validated categorical palette, in fixed order. Never cycled: past the
// last slot a series folds into the neutral "other" tone.
const TONES = [
  "var(--nx-series-1)",
  "var(--nx-series-2)",
  "var(--nx-series-3)",
  "var(--nx-series-4)",
  "var(--nx-series-5)",
  "var(--nx-series-6)",
  "var(--nx-series-7)",
];
const OVERFLOW_TONE = "var(--nx-text-subtle)";

function toneFor(bucket: DrillBucket, index: number): string {
  if (bucket.color) return bucket.color;
  return index < TONES.length ? TONES[index] : OVERFLOW_TONE;
}

/** Horizontal bars. Used when there are more buckets than a donut can carry. */
export function DrillBars({ buckets, onPick, currency, minorUnits }: PickProps) {
  const peak = Math.max(1, ...buckets.map((b) => Math.abs(b.value)));
  return (
    <ul className="nx-drill-bars">
      {buckets.map((bucket, index) => (
        <li key={bucket.key}>
          <button
            type="button"
            className="nx-drill-bar"
            data-empty={bucket.empty ? "true" : "false"}
            onClick={() => onPick(bucket)}
            aria-label={`${bucket.label}, ${formatMinorCompact(bucket.value, currency, minorUnits)}, ${bucket.count} rows`}
          >
            <span className="nx-drill-bar__label">{bucket.label}</span>
            <span className="nx-drill-bar__track">
              <span
                className="nx-drill-bar__fill"
                style={{ width: `${Math.max(1.5, (Math.abs(bucket.value) / peak) * 100)}%`, background: toneFor(bucket, index) }}
              />
            </span>
            <span className="nx-drill-bar__value nx-num">{formatMinorCompact(bucket.value, currency, minorUnits)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Donut composition. Only used when there is more than one child. */
export function DrillDonut({ buckets, onPick, currency, minorUnits }: PickProps) {
  const total = buckets.reduce((sum, b) => sum + Math.abs(b.value), 0) || 1;
  // Offsets accumulate through the reduce rather than by reassigning a
  // captured variable, so nothing mutates during render.
  const segments = buckets.reduce<{ bucket: DrillBucket; index: number; fraction: number; start: number }[]>(
    (acc, bucket, index) => {
      const fraction = Math.abs(bucket.value) / total;
      const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].fraction : 0;
      acc.push({ bucket, index, fraction, start });
      return acc;
    },
    [],
  );
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="nx-drill-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label="Composition by share of value">
        <g transform="translate(70 70) rotate(-90)">
          {segments.map(({ bucket, index, fraction, start }) => (
            <circle
              key={bucket.key}
              r={radius}
              fill="none"
              strokeWidth={18}
              stroke={toneFor(bucket, index)}
              strokeDasharray={`${fraction * circumference} ${circumference}`}
              strokeDashoffset={-start * circumference}
              opacity={bucket.empty ? 0.25 : 1}
            />
          ))}
        </g>
      </svg>
      <ul className="nx-drill-legend">
        {buckets.map((bucket, index) => (
          <li key={bucket.key}>
            <button type="button" onClick={() => onPick(bucket)} data-empty={bucket.empty ? "true" : "false"}>
              <i style={{ background: toneFor(bucket, index) }} aria-hidden="true" />
              <span>{bucket.label}</span>
              <b className="nx-num">{formatMinorCompact(bucket.value, currency, minorUnits)}</b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A single child is not a composition. Rule: show the cumulative line instead
 * of a one-slice donut.
 */
export function DrillCumulative({
  trend,
  currency,
  minorUnits,
  onPick,
  bucket,
}: {
  trend: readonly TrendPoint[];
  currency: string;
  minorUnits: number;
  onPick?: (bucket: DrillBucket) => void;
  bucket?: DrillBucket;
}) {
  // Running total accumulated through the reduce, for the same reason.
  const points = trend.reduce<(TrendPoint & { running: number })[]>((acc, point) => {
    const running = (acc.length ? acc[acc.length - 1].running : 0) + point.value;
    acc.push({ ...point, running });
    return acc;
  }, []);
  const peak = Math.max(1, ...points.map((p) => Math.abs(p.running)));
  const step = points.length > 1 ? 100 / (points.length - 1) : 0;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(2)} ${(100 - (Math.abs(p.running) / peak) * 92).toFixed(2)}`)
    .join(" ");

  return (
    <div className="nx-drill-cumulative">
      <p className="nx-drill-cumulative__note">
        One child only, so this shows the cumulative line rather than a single-slice donut.
      </p>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Cumulative value by period">
        <path d={path} fill="none" stroke="var(--nx-series-1)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <ol className="nx-drill-cumulative__periods">
        {points.map((p) => (
          <li key={p.period}>
            <span>{p.period.slice(5)}</span>
            <b className="nx-num">{formatMinorCompact(p.running, currency, minorUnits)}</b>
            {p.partial ? <em>partial</em> : null}
          </li>
        ))}
      </ol>
      {bucket && onPick ? (
        <button type="button" className="nx-drill-cumulative__descend" onClick={() => onPick(bucket)}>
          Open {bucket.label}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Multi-series trend. Dataset index selects the series, point index selects
 * the period - the convention every multi-series chart follows.
 */
export interface TrendSeries {
  label: string;
  points: readonly TrendPoint[];
}

export function bucketFromSeries(
  series: readonly TrendSeries[],
  datasetIndex: number,
  pointIndex: number,
): DrillBucket | null {
  const dataset = series[datasetIndex];
  const point = dataset?.points[pointIndex];
  if (!dataset || !point) return null;
  return {
    key: point.period,
    label: `${dataset.label} - ${point.period}`,
    value: point.value,
    count: 1,
    empty: point.value === 0,
  };
}

export function DrillTrend({
  series,
  currency,
  minorUnits,
  onPickPoint,
}: {
  series: readonly TrendSeries[];
  currency: string;
  minorUnits: number;
  onPickPoint?: (datasetIndex: number, pointIndex: number) => void;
}) {
  const peak = Math.max(1, ...series.flatMap((s) => s.points.map((p) => Math.abs(p.value))));
  const periods = series[0]?.points ?? [];
  return (
    <div className="nx-drill-trend">
      <div className="nx-drill-trend__plot" role="group" aria-label="Value by period">
        {periods.map((point, pointIndex) => (
          <div className="nx-drill-trend__slot" key={point.period}>
            <div className="nx-drill-trend__stack">
              {series.map((dataset, datasetIndex) => {
                const value = dataset.points[pointIndex]?.value ?? 0;
                const height = (Math.abs(value) / peak) * 100;
                return (
                  <button
                    key={dataset.label}
                    type="button"
                    className="nx-drill-trend__bar"
                    style={{ height: `${Math.max(2, height)}%`, background: datasetIndex < TONES.length ? TONES[datasetIndex] : OVERFLOW_TONE }}
                    data-partial={point.partial ? "true" : "false"}
                    onClick={() => onPickPoint?.(datasetIndex, pointIndex)}
                    aria-label={`${dataset.label}, ${point.period}, ${formatMinorCompact(value, currency, minorUnits)}${point.partial ? ", partial period" : ""}`}
                  />
                );
              })}
            </div>
            <span className="nx-drill-trend__period">
              {point.period.slice(5)}
              {point.partial ? <em title="Partial period">*</em> : null}
            </span>
          </div>
        ))}
      </div>
      {periods.some((p) => p.partial) ? (
        <p className="nx-drill-trend__footnote">* partial period, excluded from period-on-period comparison</p>
      ) : null}
    </div>
  );
}
