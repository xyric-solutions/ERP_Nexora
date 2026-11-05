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
    <button type="button" disabled={disabled} onClick={onClick} className={`${base} flex h-full flex-col p-4`}>
      <span className="flex items-center gap-2.5">
        <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 font-semibold leading-snug group-hover:text-primary">{label}</span>
        <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
      </span>
      <SummaryDetails summary={summary} />
    </button>
  );
}

function SummaryDetails({ summary }: { summary?: HrNavCardSummary }) {
  const muted = "mt-2 text-sm leading-relaxed text-muted-foreground";
  if (!summary || summary.state === "loading")
    return (
      <span className="mt-3 grid gap-1.5" aria-hidden="true">
        <span className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        <span className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </span>
    );
  if (summary.state === "restricted") return <span className={muted}>{summary.message}</span>;
  if (summary.state === "unavailable") return <span className={muted}>Details unavailable</span>;
  if (!summary.details.length) return <span className={muted}>No records yet</span>;
  return (
    <span className="mt-2 grid gap-0.5 text-sm leading-relaxed text-muted-foreground">
      {summary.details.map((detail) => (
        <span key={detail} className="break-words">
          {detail}
        </span>
      ))}
    </span>
  );
}
