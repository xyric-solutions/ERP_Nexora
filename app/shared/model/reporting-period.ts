/**
 * Dashboard period scope and comparison.
 *
 * Role dashboards previously showed one unlabelled moment in time. This adds
 * the two things a reviewer always asks for: *which dates am I looking at*,
 * and *how does that compare with the period before, or with last year*.
 *
 * Everything here is pure and deterministic, so the same selection always
 * produces the same figures and a test can assert them.
 *
 * One deliberate property: the series for a KPI always ENDS at the value
 * authored in the dashboard fixture. The headline figure a reviewer has
 * already signed off never moves when they change the period controls - only
 * the earlier periods and the comparison are derived. That keeps approved
 * numbers stable and makes the comparison honest about which figure is the
 * anchor.
 */

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type Granularity = "day" | "week" | "month" | "quarter" | "year";

/**
 * "none"          - a single period, no comparison shown
 * "sequential"    - N periods side by side: day by day, week by week, year by year
 * "year-over-year"- the current period against the same period one year earlier
 */
export type ComparisonMode = "none" | "sequential" | "year-over-year";

export interface PeriodScope {
  granularity: Granularity;
  /** How many periods to show. 1 when not comparing. */
  count: number;
  mode: ComparisonMode;
  /** Anchor date, ISO 'YYYY-MM-DD'. The latest period ends on or contains it. */
  asAt: string;
  /** Optional start date for a custom range. */
  from?: string;
}

export interface ResolvedPeriod {
  /** Stable key, e.g. '2026-W38', '2026-Q3', '2026-09', '2026-09-17', '2026'. */
  key: string;
  /** Short label for an axis, e.g. 'W38', 'Sep', 'Q3', '17 Sep', '2026'. */
  label: string;
  /** Full label for a table header or tooltip, e.g. 'Week 38 2026'. */
  longLabel: string;
  /** Inclusive ISO date bounds. */
  from: string;
  to: string;
  /** True when the period contains the anchor date and so may be incomplete. */
  partial: boolean;
}

export const GRANULARITIES: readonly { value: Granularity; label: string; plural: string }[] = [
  { value: "day", label: "Day", plural: "days" },
  { value: "week", label: "Week", plural: "weeks" },
  { value: "month", label: "Month", plural: "months" },
  { value: "quarter", label: "Quarter", plural: "quarters" },
  { value: "year", label: "Year", plural: "years" },
];

export const COMPARISON_MODES: readonly { value: ComparisonMode; label: string; hint: string }[] = [
  { value: "none", label: "No comparison", hint: "One period only" },
  { value: "sequential", label: "Period by period", hint: "Day by day, week by week, year by year" },
  { value: "year-over-year", label: "Same period last year", hint: "This period against one year earlier" },
];

/** Bounds on how many periods may be compared at once. */
export const MIN_PERIODS = 2;
export const MAX_PERIODS = 60;

/**
 * The prototype's "today". Fixed, so a reviewer sees the same dates on any
 * machine on any day and screenshots stay reproducible.
 */
export const PROTOTYPE_TODAY = "2026-09-17";

export const DEFAULT_SCOPE: PeriodScope = {
  granularity: "month",
  count: 6,
  mode: "sequential",
  asAt: PROTOTYPE_TODAY,
};

/* ------------------------------------------------------------------ *
 * Date helpers - all UTC, so no timezone can shift a period boundary
 * ------------------------------------------------------------------ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return utc(y, (m ?? 1) - 1, d ?? 1);
}

export function toIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Last day of a month, leap years included. */
export function daysInMonth(year: number, monthIndex: number): number {
  return utc(year, monthIndex + 1, 0).getUTCDate();
}

/** Monday-start week containing the date. */
function startOfWeek(date: Date): Date {
  const day = date.getUTCDay(); // 0 = Sunday
  const backToMonday = day === 0 ? 6 : day - 1;
  return addDays(date, -backToMonday);
}

/**
 * ISO-8601 week number and its week-numbering year. The week-numbering year
 * is not always the calendar year: 1 January can fall in week 52 or 53 of the
 * previous year, which is exactly the case a naive implementation gets wrong.
 */
export function isoWeek(date: Date): { year: number; week: number } {
  const thursday = addDays(startOfWeek(date), 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = addDays(startOfWeek(utc(year, 0, 4)), 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return { year, week };
}

/* ------------------------------------------------------------------ *
 * Period construction
 * ------------------------------------------------------------------ */

function periodContaining(date: Date, granularity: Granularity): ResolvedPeriod {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();

  switch (granularity) {
    case "day": {
      const iso = toIso(date);
      return {
        key: iso,
        label: `${date.getUTCDate()} ${MONTHS[m]}`,
        longLabel: `${date.getUTCDate()} ${MONTHS[m]} ${y}`,
        from: iso,
        to: iso,
        partial: false,
      };
    }
    case "week": {
      const start = startOfWeek(date);
      const end = addDays(start, 6);
      const { year, week } = isoWeek(date);
      return {
        key: `${year}-W${String(week).padStart(2, "0")}`,
        label: `W${week}`,
        longLabel: `Week ${week} ${year} (${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} to ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]})`,
        from: toIso(start),
        to: toIso(end),
        partial: false,
      };
    }
    case "month": {
      return {
        key: `${y}-${String(m + 1).padStart(2, "0")}`,
        label: MONTHS[m],
        longLabel: `${MONTHS[m]} ${y}`,
        from: toIso(utc(y, m, 1)),
        to: toIso(utc(y, m, daysInMonth(y, m))),
        partial: false,
      };
    }
    case "quarter": {
      const q = Math.floor(m / 3);
      const startMonth = q * 3;
      const endMonth = startMonth + 2;
      return {
        key: `${y}-Q${q + 1}`,
        label: `Q${q + 1}`,
        longLabel: `Q${q + 1} ${y}`,
        from: toIso(utc(y, startMonth, 1)),
        to: toIso(utc(y, endMonth, daysInMonth(y, endMonth))),
        partial: false,
      };
    }
    case "year": {
      return {
        key: String(y),
        label: String(y),
        longLabel: String(y),
        from: toIso(utc(y, 0, 1)),
        to: toIso(utc(y, 11, 31)),
        partial: false,
      };
    }
  }
}

/** Step a date back by whole periods of the given granularity. */
function stepBack(date: Date, granularity: Granularity, steps: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  switch (granularity) {
    case "day":
      return addDays(date, -steps);
    case "week":
      return addDays(date, -steps * 7);
    case "month": {
      const target = m - steps;
      const year = y + Math.floor(target / 12);
      const month = ((target % 12) + 12) % 12;
      // Clamp the day so 31 March minus one month is 28/29 February, not 3 March.
      return utc(year, month, Math.min(d, daysInMonth(year, month)));
    }
    case "quarter":
      return stepBack(date, "month", steps * 3);
    case "year": {
      const year = y - steps;
      return utc(year, m, Math.min(d, daysInMonth(year, m)));
    }
  }
}
/** Number of inclusive calendar periods touched by a custom date range. */
export function countPeriodsInRange(fromIso: string, toIsoValue: string, granularity: Granularity): number {
  const from = parseIso(fromIso);
  const to = parseIso(toIsoValue);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return MIN_PERIODS;

  let count = 1;
  if (granularity === "day") {
    count = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  } else if (granularity === "week") {
    count = Math.floor((startOfWeek(to).getTime() - startOfWeek(from).getTime()) / (7 * 86_400_000)) + 1;
  } else if (granularity === "month") {
    count = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1;
  } else if (granularity === "quarter") {
    const fromQuarter = from.getUTCFullYear() * 4 + Math.floor(from.getUTCMonth() / 3);
    const toQuarter = to.getUTCFullYear() * 4 + Math.floor(to.getUTCMonth() / 3);
    count = toQuarter - fromQuarter + 1;
  } else {
    count = to.getUTCFullYear() - from.getUTCFullYear() + 1;
  }

  return Math.max(MIN_PERIODS, Math.min(MAX_PERIODS, count));
}


/**
 * Resolve a scope into the periods to display, oldest first. The last entry is
 * always the period containing the anchor date, and is flagged partial when
 * the anchor sits before its end - so a half-finished month is never compared
 * as though it were complete.
 */
export function resolvePeriods(scope: PeriodScope): ResolvedPeriod[] {
  const anchor = parseIso(scope.asAt);
  const current = periodContaining(anchor, scope.granularity);
  const partial = current.to > scope.asAt;
  const currentPeriod = { ...current, partial };

  if (scope.mode === "none") return [currentPeriod];

  if (scope.mode === "year-over-year") {
    const lastYear = periodContaining(stepBack(anchor, "year", 1), scope.granularity);
    return [lastYear, currentPeriod];
  }

  const requestedCount = scope.from
    ? countPeriodsInRange(scope.from, scope.asAt, scope.granularity)
    : Math.round(scope.count);
  const count = Math.max(MIN_PERIODS, Math.min(MAX_PERIODS, requestedCount));
  const periods: ResolvedPeriod[] = [];
  for (let i = count - 1; i >= 1; i -= 1) {
    periods.push(periodContaining(stepBack(anchor, scope.granularity, i), scope.granularity));
  }
  periods.push(currentPeriod);
  return periods;
}

/** One-line description of the resolved scope, for the control bar. */
export function describeScope(scope: PeriodScope, periods: readonly ResolvedPeriod[]): string {
  const first = periods[0];
  const last = periods[periods.length - 1];
  if (!first || !last) return "No period selected";
  const unit = GRANULARITIES.find((g) => g.value === scope.granularity);
  if (scope.mode === "none") return `${last.longLabel} · ${last.from} to ${last.to}`;
  if (scope.mode === "year-over-year") return `${last.longLabel} against ${first.longLabel}`;
  return `${periods.length} ${unit?.plural ?? "periods"} · ${first.longLabel} to ${last.longLabel}`;
}

/* ------------------------------------------------------------------ *
 * Preset -> anchor date
 *
 * The dashboard already had a Period preset control ("This month", "Last
 * year", "Custom range"). Rather than add a second date control beside it,
 * the preset resolves to the anchor date that the comparison then works back
 * from, so there is one place to choose dates and one place to choose how
 * they are compared.
 * ------------------------------------------------------------------ */

export type PeriodPreset =
  | "today" | "this-week" | "last-week" | "this-month" | "last-month"
  | "this-quarter" | "last-quarter" | "year-to-date" | "this-year" | "last-year" | "custom";

/** Last day of the quarter before the one containing the date. */
function endOfPreviousQuarter(date: Date): Date {
  const q = Math.floor(date.getUTCMonth() / 3);
  const startMonth = q * 3;
  return addDays(utc(date.getUTCFullYear(), startMonth, 1), -1);
}

export function anchorForPreset(preset: PeriodPreset, today: string, customTo?: string): string {
  const now = parseIso(today);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  switch (preset) {
    case "today":
    case "this-week":
    case "this-month":
    case "this-quarter":
    case "year-to-date":
    case "this-year":
      return today;
    case "last-week":
      return toIso(addDays(now, -7));
    case "last-month":
      // The last day of the previous month, so the anchor period is complete.
      return toIso(addDays(utc(y, m, 1), -1));
    case "last-quarter":
      return toIso(endOfPreviousQuarter(now));
    case "last-year":
      return toIso(utc(y - 1, 11, 31));
    case "custom":
      return customTo && /^\d{4}-\d{2}-\d{2}$/.test(customTo) ? customTo : today;
  }
}

/* ------------------------------------------------------------------ *
 * Value parsing and formatting
 * ------------------------------------------------------------------ */

export interface ValueShape {
  /** Numeric value in display units (so 8.42 for "$8.42M"). */
  amount: number;
  prefix: string;
  suffix: string;
  /** K / M / B scale suffix, kept so a derived value reads the same way. */
  scale: "" | "K" | "M" | "B";
  decimals: number;
  /** Set when the source string carried no number at all. */
  literal?: string;
}

/**
 * Read a dashboard value string into its parts. Dashboard fixtures are
 * authored for humans - "$8.42M", "18.6%", "4", "PKR 1,234.00", "62 days" -
 * so a derived figure has to be rebuilt in the same shape.
 */
export function parseValue(text: string): ValueShape {
  const match = /(-?[\d,]+(?:\.\d+)?)/.exec(text);
  if (!match) return { amount: 0, prefix: "", suffix: "", scale: "", decimals: 0, literal: text };

  const raw = match[1];
  const amount = Number(raw.replace(/,/g, ""));
  const before = text.slice(0, match.index);
  let after = text.slice(match.index + raw.length);

  let scale: ValueShape["scale"] = "";
  const scaleMatch = /^([KMB])/.exec(after);
  if (scaleMatch) {
    scale = scaleMatch[1] as ValueShape["scale"];
    after = after.slice(scaleMatch[1].length);
  }

  const dot = raw.indexOf(".");
  return {
    amount,
    prefix: before,
    suffix: after,
    scale,
    decimals: dot < 0 ? 0 : raw.length - dot - 1,
    };
}

/** Rebuild a value string in the same shape as the one it was derived from. */
export function formatValue(amount: number, shape: ValueShape): string {
  if (shape.literal !== undefined) return shape.literal;
  const fixed = amount.toLocaleString("en-US", {
    minimumFractionDigits: shape.decimals,
    maximumFractionDigits: shape.decimals,
  });
  return `${shape.prefix}${fixed}${shape.scale}${shape.suffix}`;
}

/* ------------------------------------------------------------------ *
 * Deterministic series
 * ------------------------------------------------------------------ */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable pseudo-random in [0,1) from a string key. */
function noise(key: string): number {
  return hash(key) / 0x100000000;
}

/**
 * Build a value for each period, ending at the authored current value.
 *
 * Earlier periods drift from the current one by a bounded, deterministic
 * amount that depends on the KPI id and the period key, so the shape is
 * stable and repeatable but not flat. Longer granularities drift more, which
 * is what a real business series looks like.
 */
export function seriesFor(
  kpiId: string,
  current: number,
  periods: readonly ResolvedPeriod[],
  granularity: Granularity,
): number[] {
  const spread =
    granularity === "day" ? 0.06
    : granularity === "week" ? 0.1
    : granularity === "month" ? 0.16
    : granularity === "quarter" ? 0.22
    : 0.3;

  const lastIndex = periods.length - 1;
  return periods.map((period, index) => {
    if (index === lastIndex) return current;
    // Distance from the anchor: older periods may differ more.
    const distance = (lastIndex - index) / Math.max(1, lastIndex);
    const wobble = (noise(`${kpiId}:${period.key}`) - 0.5) * 2; // -1..1
    const drift = 1 - spread * distance * 0.8 + wobble * spread * 0.5;
    const value = current * drift;
    // Keep the sign and avoid a nonsensical negative for a naturally positive KPI.
    if (current >= 0 && value < 0) return 0;
    return Number(value.toFixed(4));
  });
}

export interface PeriodDelta {
  absolute: number;
  percent: number | null;
  direction: "up" | "down" | "flat";
  /** What the current figure is being compared against. */
  basisLabel: string;
}

/** Compare the last period against the first, which is the basis in both modes. */
export function deltaOf(series: readonly number[], periods: readonly ResolvedPeriod[]): PeriodDelta | null {
  if (series.length < 2 || periods.length < 2) return null;
  const current = series[series.length - 1];
  const basis = series[0];
  const absolute = current - basis;
  const percent = basis === 0 ? null : (absolute / Math.abs(basis)) * 100;
  return {
    absolute,
    percent,
    direction: absolute > 0 ? "up" : absolute < 0 ? "down" : "flat",
    basisLabel: periods[0].longLabel,
  };
}
