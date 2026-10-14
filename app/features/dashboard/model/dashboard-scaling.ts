/**
 * Putting the remaining dashboard charts on the period scope.
 *
 * The dashboard has two kinds of chart, and they need different treatment:
 *
 *   RANGE charts show many periods at once - the trend line, the composition
 *   movement. They take one value per selected period.
 *
 *   SNAPSHOT charts show one period - a waterfall bridge, a funnel, a donut,
 *   a radar, a scatter, a heatmap, gauges. A range means nothing to them, so
 *   instead they show whichever period the reviewer is looking at, and the
 *   dashboard offers a period picker to move that snapshot.
 *
 * Both kinds keep the same guarantee as the KPI tiles: at the ANCHOR period -
 * the latest in the selection - the figures are exactly those authored in the
 * fixture, so no number a reviewer has approved moves when the controls
 * change. Earlier periods are deterministic derivations of it.
 */

import type { Granularity, ResolvedPeriod } from "@prototype/shared/model/reporting-period";

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function noise(key: string): number {
  return hash(key) / 0x100000000;
}

/** How far a period may drift from the anchor, by granularity. */
function spreadFor(granularity: Granularity): number {
  switch (granularity) {
    case "day": return 0.06;
    case "week": return 0.1;
    case "month": return 0.16;
    case "quarter": return 0.22;
    case "year": return 0.3;
  }
}

/**
 * The multiplier for one period.
 *
 * Exactly 1 at the anchor (the last period in the selection), so a snapshot
 * of the current period is the authored fixture untouched. Earlier periods
 * get a bounded, deterministic factor.
 */
export function periodFactor(
  seedKey: string,
  periods: readonly ResolvedPeriod[],
  periodKey: string,
  granularity: Granularity,
): number {
  if (periods.length === 0) return 1;
  const index = periods.findIndex((p) => p.key === periodKey);
  const lastIndex = periods.length - 1;
  // An unknown key, or the anchor itself, means "show it as authored".
  if (index < 0 || index === lastIndex) return 1;

  const spread = spreadFor(granularity);
  const distance = (lastIndex - index) / Math.max(1, lastIndex);
  const wobble = (noise(`${seedKey}:${periodKey}`) - 0.5) * 2;
  const factor = 1 - spread * distance * 0.8 + wobble * spread * 0.5;
  // Never invert a measure's sign or collapse it to nothing.
  return Number(Math.max(0.35, factor).toFixed(4));
}

/** Round to the precision the authored value carried, so labels stay tidy. */
function like(value: number, original: number): number {
  const decimals = Number.isInteger(original) ? 0 : Math.min(2, String(original).split(".")[1]?.length ?? 1);
  return Number(value.toFixed(decimals));
}

/**
 * Scale the named numeric fields of a set of records by one period factor.
 *
 * Constrained to `object` rather than `Record<string, unknown>` so the
 * dashboard's own interfaces pass without needing an index signature; the
 * field list is still checked against the record's keys.
 */
export function scaleBy<T extends object, K extends keyof T>(
  rows: readonly T[],
  fields: readonly K[],
  factor: number,
): T[] {
  if (factor === 1) return [...rows];
  return rows.map((row) => {
    const next = { ...row };
    for (const field of fields) {
      const current = row[field];
      if (typeof current === "number") {
        next[field] = like(current * factor, current) as T[K];
      }
    }
    return next;
  });
}

/**
 * One value per selected period for a range chart, ending at the authored
 * value - the same shape as the KPI series, so the trend line and the
 * comparison table can never tell different stories.
 */
export function rangeSeries(
  seedKey: string,
  anchorValue: number,
  periods: readonly ResolvedPeriod[],
  granularity: Granularity,
): number[] {
  return periods.map((period, index) => {
    if (index === periods.length - 1) return anchorValue;
    return like(anchorValue * periodFactor(seedKey, periods, period.key, granularity), anchorValue);
  });
}

/** Label describing which period a snapshot chart is showing. */
export function snapshotLabel(periods: readonly ResolvedPeriod[], periodKey: string): string {
  const period = periods.find((p) => p.key === periodKey) ?? periods[periods.length - 1];
  if (!period) return "";
  return period.partial ? `${period.longLabel} (in progress)` : period.longLabel;
}

/** True when the key names the anchor period, whose figures are the authored ones. */
export function isAnchorPeriod(periods: readonly ResolvedPeriod[], periodKey: string): boolean {
  if (periods.length === 0) return true;
  return periods[periods.length - 1].key === periodKey;
}
