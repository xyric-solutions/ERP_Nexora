import type { ReactNode } from "react";

/*
 * HR & Payroll drawer detail anatomy, in this order:
 *   HrDetailSummary  – reference code, status pill and one context line
 *   HrDetailFigures  – key counts as large numbers, optional progress bar
 *   HrDetailGroup    – titled list of HrDetailTile label/value rows
 *   HrDetailSection  – titled free content (lists, notes, history)
 *   HrDetailNote     – a short remark such as the latest state change
 *   HrDetailAudit    – quiet created/updated line at the bottom
 */

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClass: Record<Tone, string> = {
  success: "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]",
  warning: "border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]",
  danger: "border-[var(--nx-danger-border)] bg-[var(--nx-danger-soft)] text-[var(--nx-danger)]",
  info: "border-border bg-accent text-foreground",
  neutral: "border-border bg-muted text-muted-foreground",
};

const SUCCESS = /^(active|approved|open|accepted|hired|completed|complete|posted|published|present|paid|ready|selected|passed|converted|confirmed|offer_accepted)$/;
const WARNING = /^(draft|pending|submitted|on_hold|in_review|review|needs_review|scheduled|probation|awaiting.*|interview.*|shortlisted|screening|offered|offer|sent|planned|in_progress)$/;
const DANGER = /^(cancelled|canceled|rejected|withdrawn|declined|inactive|deactivated|closed|terminated|failed|expired|absent|archived|no_show|offer_declined)$/;

/** Maps a stored status value to a semantic tone. */
export function hrStatusTone(status: string): Tone {
  const key = status.trim().toLowerCase().replaceAll(" ", "_");
  if (SUCCESS.test(key)) return "success";
  if (DANGER.test(key)) return "danger";
  if (WARNING.test(key)) return "warning";
  return "neutral";
}

/** Sentence-case wording for a stored status value ("on_hold" -> "On hold"). */
export function hrStatusLabel(status: string): string {
  if (status === "inactive") return "Deactivated";
  const text = status.replaceAll("_", " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function HrStatusPill({ status, label, tone }: { status: string; label?: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-2 text-xs font-semibold leading-5 ${toneClass[tone ?? hrStatusTone(status)]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label ?? hrStatusLabel(status)}
    </span>
  );
}

/** A record code such as JOP-2026-584261, in the mono face. */
export function HrDetailCode({ children, boxed = false }: { children: ReactNode; boxed?: boolean }) {
  return boxed ? (
    <span className="rounded-[5px] border border-border bg-muted px-1.5 py-0.5 font-mono text-[13px] font-semibold tracking-wide">
      {children}
    </span>
  ) : (
    <span className="font-mono text-[12.5px]">{children}</span>
  );
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-12-30" -> "30 Dec 2026"; ISO timestamps also get the time. Unparseable values are returned unchanged. */
export function hrDisplayDate(value: string | null | undefined, withTime?: boolean): string {
  if (!value) return "";
  const dateOnly = DATE_ONLY.test(value);
  const date = dateOnly ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (dateOnly || withTime === false) return day;
  if (withTime === undefined && date.getHours() === 0 && date.getMinutes() === 0) return day;
  return `${day}, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** Top of a drawer: code, status and a single context line. */
export function HrDetailSummary({
  code,
  status,
  statusLabel,
  statusTone,
  extra,
  children,
}: {
  code?: ReactNode;
  status?: string | null;
  statusLabel?: string;
  statusTone?: Tone;
  /** Additional pills after the status. */
  extra?: ReactNode;
  /** Context line, e.g. "From requisition MRQ-… · closes 30 Dec 2026". */
  children?: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {code ? <HrDetailCode boxed>{code}</HrDetailCode> : null}
        {status ? <HrStatusPill status={status} label={statusLabel} tone={statusTone} /> : null}
        {extra}
      </div>
      {children ? <p className="m-0! min-w-0 text-[13px] text-muted-foreground wrap-anywhere">{children}</p> : null}
    </div>
  );
}

/** Key counts as large figures; an optional progress bar reads "x of y …". */
export function HrDetailFigures({
  items,
  progress,
}: {
  items: { label: string; value: ReactNode }[];
  progress?: { value: number; total: number; label: string };
}) {
  const ratio = progress && progress.total > 0 ? Math.min(1, Math.max(0, progress.value / progress.total)) : 0;
  return (
    <dl
      className="m-0! grid min-w-0 overflow-hidden rounded-lg border border-border bg-muted"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item, index) => (
        <div key={item.label} className={`min-w-0 px-3.5 py-2.5 ${index ? "border-l border-border" : ""}`}>
          <dt className="m-0! truncate text-[11.5px] text-muted-foreground">{item.label}</dt>
          <dd className="m-0! mt-0.5 text-xl font-semibold tabular-nums">{item.value}</dd>
        </div>
      ))}
      {progress ? (
        <div className="col-span-full grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-t border-border px-3.5 py-2 text-xs text-muted-foreground">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.value}
            aria-label={progress.label}
          >
            <div className="h-full bg-primary" style={{ width: `${ratio * 100}%` }} />
          </div>
          <span className="tabular-nums">{progress.label}</span>
        </div>
      ) : null}
    </dl>
  );
}

/**
 * Field box shared by detail drawers: the same height, border, radius, surface and
 * padding as the Input used by the matching Add / New / Create drawer.
 */
export const hrFieldBoxClass =
  "flex min-h-10 w-full min-w-0 flex-col justify-center rounded-[var(--nx-radius-md)] border border-input bg-card px-3 py-2 text-sm text-foreground wrap-anywhere";

/** Field label above its box, matching create-form labels. */
export const hrFieldLabelClass = "m-0! text-sm font-medium leading-tight text-foreground";

/**
 * One saved field, laid out like the create form: label above, value inside a
 * bordered box. An empty value reads "Not recorded" in a quieter style.
 */
export function HrDetailTile({
  label,
  value,
  hint,
  mono = false,
}: {
  label: string;
  value?: ReactNode;
  /** Secondary line under the value, e.g. a code or a relative date. */
  hint?: ReactNode;
  /** Render the value as a record code. */
  mono?: boolean;
}) {
  const empty = value === undefined || value === null || value === "";
  return (
    <div className="grid min-w-0 gap-1.5">
      <dt className={hrFieldLabelClass}>{label}</dt>
      <dd className={`m-0! tabular-nums ${hrFieldBoxClass} ${empty ? "italic text-muted-foreground" : ""}`}>
        {empty ? "Not recorded" : mono ? <HrDetailCode>{value}</HrDetailCode> : value}
        {hint && !empty ? <span className="block text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </dd>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h3 className="m-0! mb-0.5! flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground after:h-px after:flex-1 after:bg-border">
      {title}
    </h3>
  );
}

/** Titled free content inside a drawer (lists, forms, history). */
export function HrDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-2" aria-label={title}>
      <SectionTitle title={title} />
      {children}
    </section>
  );
}

/** Titled list of detail rows inside a drawer. */
export function HrDetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3" aria-label={title}>
      <SectionTitle title={title} />
      <dl className="m-0! grid gap-4">{children}</dl>
    </section>
  );
}

/** Untitled list of detail rows, for drawers that show one record's fields. */
export function HrDetailList({ children }: { children: ReactNode }) {
  return <dl className="m-0! grid min-w-0 gap-4">{children}</dl>;
}

/** A short remark, e.g. the reason for the latest state change. */
export function HrDetailNote({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="rounded-md border border-l-[3px] border-border bg-muted px-3 py-2 text-[13px] wrap-anywhere">
      {children}
      {meta ? <small className="mt-0.5 block text-xs text-muted-foreground">{meta}</small> : null}
    </div>
  );
}

/** Created/updated information at the bottom of a drawer. */
export function HrDetailAudit({ items }: { items: { label: string; value?: string | null }[] }) {
  const shown = items.filter((item) => item.value);
  if (!shown.length) return null;
  return (
    <p className="m-0! flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2.5 text-xs text-muted-foreground">
      {shown.map((item) => (
        <span key={item.label}>
          {item.label} <span className="font-medium text-foreground/80">{item.value}</span>
        </span>
      ))}
    </p>
  );
}
