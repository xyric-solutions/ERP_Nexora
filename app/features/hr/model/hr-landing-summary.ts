import type { HrApiClient } from "../api/hr-client";

/**
 * Data-driven landing-card details for HR & Payroll hubs. A loader returns up
 * to two short facts read from the authorized API; an empty array means the
 * area has no records yet. Loaders never invent data: a failed read renders as
 * "Details unavailable".
 */
export type HrLandingSummaryContext = {
  client: HrApiClient;
  companyId: string;
  /** Shares one request between cards that read the same endpoint. */
  once: <T>(key: string, load: () => Promise<T>) => Promise<T>;
};
export type HrLandingSummaryLoader = (context: HrLandingSummaryContext) => Promise<string[]>;
export type HrLandingSummaryLoaders = Readonly<Record<string, HrLandingSummaryLoader>>;

export type HrLandingSummaryState =
  { state: "loading" } | { state: "ready"; details: string[] } | { state: "unavailable" };

/** "1 branch" / "3 branches". */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Up to `max` names, then "+N more". Duplicate and blank names are skipped. */
export function nameList(names: readonly string[], max = 3): string {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (unique.length <= max) return unique.join(" · ");
  return `${unique.slice(0, max).join(" · ")} +${unique.length - max} more`;
}

/** Counts values, e.g. states, as "2 draft · 1 approved", most frequent first. */
export function tally(values: readonly string[], label: (value: string) => string = humanize, max = 3): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([value, count]) => `${count} ${label(value)}`)
    .join(" · ");
}

export function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

/** Keeps only non-empty details and at most two of them (cards show two lines). */
export function details(...values: readonly (string | false | null | undefined)[]): string[] {
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, 2);
}
