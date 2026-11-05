import { ArrowRight, type LucideIcon } from "lucide-react";

/** Shared landing-page card for every HR & Payroll area: icon and name on one line, description below. */
export function HrNavCard({
  icon: Icon,
  label,
  description,
  meta,
  layout = "card",
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  /** Optional status line, e.g. a record count. */
  meta?: string;
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
        className={`${base} flex items-center gap-3 px-4 py-3`}
      >
        <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug group-hover:text-primary">{label}</span>
          <span className="block text-sm leading-relaxed text-muted-foreground">{description}</span>
        </span>
        {meta ? <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{meta}</span> : null}
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
      <span className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</span>
      {meta ? <span className="mt-2 text-xs text-muted-foreground">{meta}</span> : null}
    </button>
  );
}
