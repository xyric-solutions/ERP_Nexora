/**
 * Deterministic fact-row builder for the prototype's drill views.
 *
 * Rows are invented fixtures, generated from a fixed seed so every reviewer
 * sees the same figures and a test can assert exact sums. Amounts are integer
 * minor units and `period` is precomputed, both as the rules require.
 *
 * The last period is deliberately clipped part-way through the month so the
 * partial-period edge case is always demonstrable.
 */

import type { Dimension, FactRow } from "../types.ts";

/** Periods present in every view. The final one is partial. */
export const PERIODS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"] as const;
/** Data in the final period stops here, making it partial. */
export const PARTIAL_LAST_DAY = 11;

/** Small deterministic PRNG - same fixtures on every run. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export interface BuildSpec {
  /** Prefix for generated row and document ids. */
  prefix: string;
  seed: number;
  documentType: string;
  /** Attribute columns and their candidate values, in chain order. */
  levels: { column: string; values: readonly string[] }[];
  /** Rows generated per period. */
  perPeriod: number;
  /** Amount range in MAJOR units; converted to minor units internally. */
  minMajor: number;
  maxMajor: number;
  minorUnits?: number;
  /** Fraction of rows forced to zero, so zero-buckets are reviewable. */
  zeroEvery?: number;
}

export function buildFacts(spec: BuildSpec): FactRow[] {
  const rnd = seeded(spec.seed);
  const minor = spec.minorUnits ?? 100;
  const rows: FactRow[] = [];
  let n = 0;

  for (const period of PERIODS) {
    const [year, month] = period.split("-").map(Number);
    const lastDay = period === PERIODS[PERIODS.length - 1] ? PARTIAL_LAST_DAY : new Date(year, month, 0).getDate();
    for (let i = 0; i < spec.perPeriod; i += 1) {
      n += 1;
      const day = 1 + Math.floor(rnd() * lastDay);
      const date = `${period}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
      const major = spec.minMajor + rnd() * (spec.maxMajor - spec.minMajor);
      const forcedZero = spec.zeroEvery ? n % spec.zeroEvery === 0 : false;
      // Integer minor units. Rounded once, here, so every later sum is exact.
      const amount = forcedZero ? 0 : Math.round(major * minor);

      const row: FactRow = {
        id: `${spec.prefix}-${n}`,
        date,
        period,
        amount,
        documentId: `${spec.prefix.toUpperCase()}-2026-${String(10_000 + n)}`,
        documentType: spec.documentType,
      };
      for (const level of spec.levels) {
        row[level.column] = level.values[Math.floor(rnd() * level.values.length)];
      }
      rows.push(row);
    }
  }
  return rows;
}

/**
 * Build a dimension chain from a simple description. Chains are linked from
 * the leaf backwards so `next` is always the level below.
 */
export function chainOf(
  levels: { id: string; name: string; column: string; label?: (key: string) => string }[],
): Dimension {
  let next: Dimension | null = null;
  for (let i = levels.length - 1; i >= 0; i -= 1) {
    const level = levels[i];
    const current: Dimension = {
      id: level.id,
      name: level.name,
      column: level.column,
      key: (row) => String(row[level.column] ?? "unassigned"),
      label: (key) => (level.label ? level.label(key) : key),
      next,
    };
    next = current;
  }
  return next as Dimension;
}
