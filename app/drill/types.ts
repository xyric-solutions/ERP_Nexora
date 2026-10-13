/**
 * Drill engine contracts.
 *
 * These mirror the architectural rules exactly. Read the rules before
 * changing anything here: the shapes are the contract that lets ONE renderer
 * serve every module.
 *
 * Prototype scope: this is the mock-only implementation. The server rules
 * (whitelisted column resolution, parameterised SQL, tenant predicate before
 * client filters, aggregation in the database, paginated leaf detail) cannot
 * hold in an isolated prototype with no server, so they are WAIVED here and
 * not faked. `resolveColumn` below marks the exact seam where the real
 * implementation must call the server. Everything client-side - one renderer,
 * fact rows, dimension chains, the single navigation stack, uniform click
 * intent, correctness by construction, the edge cases, accessibility - is
 * implemented as specified.
 */

/**
 * A flat, denormalised drillable row.
 *
 * If an attribute is not on the row it cannot be drilled by. Add the column
 * to the fact view; never add a screen.
 */
export interface FactRow {
  id: string;
  date: string;
  /** 'YYYY-MM', precomputed. Never derived in the UI. */
  period: string;
  /**
   * Signed, debit positive, in integer MINOR UNITS (e.g. paisa/cents).
   * Never float: floats cannot sum exactly and a ledger must.
   */
  amount: number;
  documentId: string;
  documentType: string;
  [dimension: string]: unknown;
}

/** One level of a drill chain. */
export interface Dimension {
  /** Stable; appears in URLs. */
  id: string;
  name: string;
  /** Resolved server-side only. Never interpolated into a query client-side. */
  column: string;
  key: (r: FactRow) => string;
  label: (key: string, rows: FactRow[]) => string;
  color?: (key: string) => string;
  /** null = leaf. */
  next: Dimension | null;
}

/** One entry on the navigation stack: "we descended into this bucket". */
export interface DrillNode {
  /** Dimension whose bucket we entered. */
  dimensionId: string;
  /** The bucket key within that dimension. */
  key: string;
  /** Display label captured at descend time. */
  label: string;
}

/** A period point in a trend series. */
export interface TrendPoint {
  period: string;
  value: number;
  /**
   * True when the period is clipped by the edge of the data. Partial periods
   * are excluded from period-on-period comparison and labelled.
   */
  partial: boolean;
}

/** A clickable bucket produced by any visual. */
export interface DrillBucket {
  key: string;
  label: string;
  value: number;
  count: number;
  color?: string;
  /** True when the bucket has no value - drives the zero-value explanation. */
  empty: boolean;
  /**
   * This bucket's own series over the period axis. Present so a multi-series
   * chart can follow the convention: dataset index selects the series (this
   * bucket), point index selects the period.
   */
  trend?: TrendPoint[];
}

/** Everything one layer needs, computed in a single pass. */
export interface DrillLayer {
  /** Rows in scope for this layer - always a strict subset of the parent's. */
  rows: FactRow[];
  /** The dimension this layer splits by, or null at a leaf. */
  splitBy: Dimension | null;
  buckets: DrillBucket[];
  trend: TrendPoint[];
  total: number;
  /** Sum of the buckets. Equals `total` by construction. */
  bucketTotal: number;
  /** Period-on-period change, excluding any partial edge period. */
  comparison: { current: number; previous: number; delta: number; excludedPartial: string | null } | null;
  /**
   * Set when the headline does not come from these fact rows, so the layer can
   * say so rather than filling the space with unrelated figures.
   */
  headlineNote: string | null;
}

/** A registered fact view plus the chains available over it. */
export interface FactView {
  id: string;
  name: string;
  /** Where a real implementation would read from; unused in the prototype. */
  source: string;
  rows: readonly FactRow[];
  chains: readonly DimensionChain[];
  /** Currency label for presentation only. */
  currency: string;
  /** Minor units per major unit, for presentation only. */
  minorUnits: number;
}

export interface DimensionChain {
  id: string;
  name: string;
  root: Dimension;
}

/** Money helpers. Amounts are integer minor units everywhere. */
export function formatMinor(amount: number, currency: string, minorUnits = 100): string {
  const negative = amount < 0;
  const whole = Math.abs(amount) / minorUnits;
  const text = whole.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${negative ? "-" : ""}${currency} ${text}`;
}

export function formatMinorCompact(amount: number, currency: string, minorUnits = 100): string {
  const major = Math.abs(amount) / minorUnits;
  const sign = amount < 0 ? "-" : "";
  if (major >= 1_000_000) return `${sign}${currency} ${(major / 1_000_000).toFixed(1)}M`;
  if (major >= 1_000) return `${sign}${currency} ${(major / 1_000).toFixed(0)}K`;
  return `${sign}${currency} ${major.toFixed(0)}`;
}
