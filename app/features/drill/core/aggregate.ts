/**
 * Layer computation.
 *
 * One function turns (rows in scope, dimension to split by) into everything a
 * layer renders: buckets, trend series, total and period-on-period change.
 *
 * Correctness is by construction, not by reconciliation. Every layer is a SUM
 * over a strict subset of its parent's rows, so children always sum to the
 * parent. There is deliberately no reconciliation logic here: if figures
 * disagree the source rows are wrong, and that is where the fix belongs.
 */

import type { DimensionChain, DrillBucket, DrillLayer, DrillNode, Dimension, FactRow, TrendPoint } from "./types.ts";

/** Walk the chain to the dimension at a given depth. */
export function dimensionAtDepth(chain: DimensionChain, depth: number): Dimension | null {
  let dimension: Dimension | null = chain.root;
  for (let i = 0; i < depth; i += 1) {
    if (!dimension) return null;
    dimension = dimension.next;
  }
  return dimension;
}

/** Find a dimension in a chain by its stable id. */
export function dimensionById(chain: DimensionChain, id: string): Dimension | null {
  let dimension: Dimension | null = chain.root;
  while (dimension) {
    if (dimension.id === id) return dimension;
    dimension = dimension.next;
  }
  return null;
}

/**
 * Narrow rows by walking the navigation stack. Each step filters to exactly
 * the rows whose key matches, which is what makes the sums add up.
 */
export function rowsForStack(
  chain: DimensionChain,
  allRows: readonly FactRow[],
  stack: readonly DrillNode[],
): FactRow[] {
  let rows = [...allRows];
  stack.forEach((node, depth) => {
    const dimension = dimensionAtDepth(chain, depth);
    if (!dimension) return;
    rows = rows.filter((row) => dimension.key(row) === node.key);
  });
  return rows;
}

function sum(rows: readonly FactRow[]): number {
  // Integer minor units, so this is exact.
  return rows.reduce((total, row) => total + row.amount, 0);
}

function periodsOf(rows: readonly FactRow[]): string[] {
  return [...new Set(rows.map((row) => row.period))].sort();
}

/**
 * A period is partial when it is at the edge of the data and covers fewer days
 * than the periods before it. Partial periods are excluded from
 * period-on-period comparison and labelled, never silently compared.
 */
function partialPeriods(rows: readonly FactRow[], allRows: readonly FactRow[]): Set<string> {
  const partial = new Set<string>();
  const periods = periodsOf(allRows);
  if (periods.length < 2) return partial;
  const last = periods[periods.length - 1];
  const daysIn = (period: string) => {
    const [y, m] = period.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  };
  const maxDay = Math.max(
    0,
    ...allRows.filter((row) => row.period === last).map((row) => Number(row.date.slice(8, 10)) || 0),
  );
  if (maxDay > 0 && maxDay < daysIn(last)) partial.add(last);
  void rows;
  return partial;
}

export function buildTrend(rows: readonly FactRow[], allRows: readonly FactRow[]): TrendPoint[] {
  const partial = partialPeriods(rows, allRows);
  const byPeriod = new Map<string, number>();
  for (const period of periodsOf(allRows)) byPeriod.set(period, 0);
  for (const row of rows) byPeriod.set(row.period, (byPeriod.get(row.period) ?? 0) + row.amount);
  return [...byPeriod.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, value]) => ({ period, value, partial: partial.has(period) }));
}

function comparisonOf(trend: readonly TrendPoint[]): DrillLayer["comparison"] {
  const usable = trend.filter((point) => !point.partial);
  const excluded = trend.find((point) => point.partial)?.period ?? null;
  if (usable.length < 2) return null;
  const current = usable[usable.length - 1].value;
  const previous = usable[usable.length - 2].value;
  return { current, previous, delta: current - previous, excludedPartial: excluded };
}

/**
 * Compute one layer. This is the only place aggregation happens, and it is
 * shared by every module and every visual.
 */
export function computeLayer(
  chain: DimensionChain,
  allRows: readonly FactRow[],
  stack: readonly DrillNode[],
  options: { headlineNote?: string | null } = {},
): DrillLayer {
  const rows = rowsForStack(chain, allRows, stack);
  const splitBy = dimensionAtDepth(chain, stack.length);

  let buckets: DrillBucket[] = [];
  if (splitBy) {
    const grouped = new Map<string, FactRow[]>();
    for (const row of rows) {
      const key = splitBy.key(row);
      const list = grouped.get(key);
      if (list) list.push(row);
      else grouped.set(key, [row]);
    }
    buckets = [...grouped.entries()]
      .map(([key, groupRows]) => {
        const value = sum(groupRows);
        return {
          key,
          label: splitBy.label(key, groupRows),
          value,
          count: groupRows.length,
          color: splitBy.color?.(key),
          // A bucket can exist and still be worth nothing - fully offset
          // postings, say. It stays visible and explains itself.
          empty: value === 0,
          // Same single pass: the bucket's series over the period axis.
          trend: buildTrend(groupRows, allRows),
        };
      })
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }

  const trend = buildTrend(rows, allRows);
  const total = sum(rows);

  return {
    rows,
    splitBy,
    buckets,
    trend,
    total,
    // Equal to `total` by construction; surfaced so a test can assert it.
    bucketTotal: buckets.reduce((acc, bucket) => acc + bucket.value, 0),
    comparison: comparisonOf(trend),
    headlineNote: options.headlineNote ?? null,
  };
}

/**
 * Breadcrumb rendering: beyond about four levels the middle collapses while
 * root and current stay visible.
 */
export function collapseTrail<T>(trail: readonly T[], limit = 4): { head: T[]; collapsed: T[]; tail: T[] } {
  if (trail.length <= limit) return { head: [...trail], collapsed: [], tail: [] };
  return {
    head: [trail[0]],
    collapsed: trail.slice(1, trail.length - 2),
    tail: trail.slice(trail.length - 2),
  };
}
