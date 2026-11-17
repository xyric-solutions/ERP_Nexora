import type { FiscalCalendar } from "@nexora/contracts";

/** Stored company calendars determine their successor; setup supplies only a first-year proposal. */
export function defaultFiscalStart(
  calendars: readonly FiscalCalendar[],
  setupMonth: number | undefined,
  today: string,
) {
  const latest = [...calendars].sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
  if (latest) {
    const next = new Date(`${latest.period_end}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.getUTCFullYear() < 3000 ? next.toISOString().slice(0, 10) : "";
  }
  if (!setupMonth || !Number.isInteger(setupMonth) || setupMonth < 1 || setupMonth > 12) return "";
  const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < setupMonth ? 1 : 0);
  return `${year}-${String(setupMonth).padStart(2, "0")}-01`;
}

export function currentFiscalCalendar(calendars: readonly FiscalCalendar[], today: string) {
  return (
    calendars.find((calendar) => calendar.period_start <= today && calendar.period_end >= today) ??
    [...calendars].sort((a, b) => b.period_start.localeCompare(a.period_start))[0]
  );
}
