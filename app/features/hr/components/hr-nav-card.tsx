import { ArrowRight, type LucideIcon } from "lucide-react";

import type { HrLandingSummaryState } from "../model/hr-landing-summary";

export type HrNavCardSummary = HrLandingSummaryState | { state: "restricted"; message: string };

/**
 * Shared landing entry for every HR & Payroll area. Cards show the icon, name
 * and arrow on one line with live details from the area's records below; rows
 * show only the icon and name.
 */
export function HrNavCard({
  icon: Icon,
  label,
  summary,
  layout = "card",
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  /** Live details; omitted while no company is in scope. */
  summary?: HrNavCardSummary;
  layout?: "card" | "row";
  disabled?: boolean;
  onClick: () => void;
}) {
  const base =
    "group rounded-xl border border-border bg-card text-left text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
  if (layout === "row")
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`${base} flex items-center gap-3 rounded-lg px-3 py-2`}
      >
        <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold group-hover:text-primary">{label}</span>
        <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
      </button>
    );
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${base} flex flex-col p-4`}>
      <span className="flex items-center gap-2.5">
        <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-semibold leading-snug group-hover:text-primary" title={label}>
          {label}
        </span>
        <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
      </span>
      <SummaryDetails summary={summary} />
    </button>
  );
}

/** Every card reserves exactly two detail lines, so all landing cards share one height. */
function SummaryDetails({ summary }: { summary?: HrNavCardSummary }) {
  const frame = "mt-2 grid h-12 grid-rows-2 text-sm leading-6 text-muted-foreground";
  if (!summary || summary.state === "loading")
    return (
      <span className={`${frame} items-center`} aria-hidden="true">
        <span className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        <span className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </span>
    );
  const lines =
    summary.state === "restricted"
      ? [summary.message]
      : summary.state === "unavailable"
        ? ["Details unavailable"]
        : summary.details.length
          ? summary.details.slice(0, 2)
          : ["No records yet"];
  return (
    <span className={frame}>
      {lines.map((line) => (
        <span key={line} className="truncate" title={line}>
          {line}
        </span>
      ))}
    </span>
  );
}
