import type { ComponentType, ReactNode } from "react";

/**
 * Compact KPI tile for HR & Payroll dashboards: label (with optional icon),
 * one large figure and a single short note. Pass onClick to make it a link
 * to the screen behind the figure.
 */
export function HrStatTile({
  label,
  value,
  note,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">{label}</span>
        {Icon ? <Icon className="size-4 shrink-0 text-primary" aria-hidden /> : null}
      </span>
      <strong className="block min-w-0 truncate text-2xl font-semibold leading-tight tabular-nums">{value}</strong>
      {note ? (
        <span className="block min-w-0 truncate text-xs text-muted-foreground" title={note}>
          {note}
        </span>
      ) : null}
    </>
  );
  const frame = "grid min-w-0 content-start gap-1 rounded-lg border border-border bg-card px-3.5 py-3 text-left text-foreground shadow-sm";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${frame} transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    >
      {body}
    </button>
  ) : (
    <article className={frame}>{body}</article>
  );
}

/** Horizontal magnitude bar for one row of a ranked list (single series, brand ink). */
export function HrInlineBar({ value, max, label, tone = "brand" }: { value: number; max: number; label: string; tone?: "brand" | "success" }) {
  const width = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <span className="block h-2 min-w-0 overflow-hidden rounded-full bg-muted" role="img" aria-label={label} title={label}>
      <span
        className={`block h-full rounded-r-full ${tone === "success" ? "bg-[var(--nx-success)]" : "bg-[var(--nx-brand)]"}`}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

/** Small page header used by the Workforce & Insights dashboards. */
export function HrInsightHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  /** Right-hand controls. */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="m-0! text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</p>
        <h1 className="m-0! mt-0.5! text-xl font-semibold leading-tight text-foreground">{title}</h1>
      </div>
      {children}
    </header>
  );
}

/**
 * Former company select for the Workforce & Insights dashboards. The company is now chosen once
 * after sign-in, so this renders nothing; the props are kept so existing callers stay valid.
 */
export function HrCompanySelect(props: {
  id: string;
  value: string;
  companies: readonly { id: string; name: string; code?: string | null }[];
  onChange: (companyId: string) => void;
  disabled?: boolean;
}): null {
  void props;
  return null;
}
