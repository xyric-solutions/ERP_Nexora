"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

/* --------------------------------------------------------------- status */

type Tone = "success" | "warning" | "danger" | "info" | "purple" | "neutral";

const STATUS_TONE: Record<string, Tone> = {
  Open: "info", Saved: "neutral", Ordered: "success", Confirmed: "info", Issued: "success",
  Delivered: "purple", Invoiced: "success", Unpaid: "warning", "Partially paid": "warning", Overdue: "danger",
  Paid: "success", Recorded: "success", Active: "success", Inactive: "neutral", Paused: "neutral",
  "Pending approval": "warning", Approved: "success", Rejected: "danger", "On credit hold": "danger",
  "Not invoiced": "warning", Draft: "neutral", "Prototype only": "neutral", "Changes requested": "warning",
  "Not submitted": "neutral", "Not started": "neutral", "Not applicable": "neutral", "Ready to confirm": "info",
  "Ready for delivery": "info", "Ready to invoice": "info", "Ready to deliver": "info",
  Posted: "success", Allocated: "success", "Partly allocated": "warning", "On account": "info", Returned: "purple",
  "Partly returned": "warning", Outstanding: "warning",
};

const TONE_CLASS: Record<Tone, string> = {
  success: "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]",
  warning: "border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]",
  danger: "border-[var(--nx-danger-border)] bg-[var(--nx-danger-soft)] text-[var(--nx-danger)]",
  info: "border-[var(--nx-info-border)] bg-[var(--nx-info-soft)] text-[var(--nx-info)]",
  purple: "border-border bg-[var(--nx-purple-soft)] text-[var(--nx-purple)]",
  neutral: "border-border bg-[var(--nx-neutral-soft)] text-muted-foreground",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-5.5 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold leading-tight whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current before:content-['']",
        TONE_CLASS[STATUS_TONE[status] ?? "neutral"],
      )}
    >
      {status}
    </span>
  );
}

/* ------------------------------------------------------------- overlays */

/**
 * Stacking order for Sales overlays. The shell sidebar (z 60) and its
 * drawers (z 80–130) sit above the primitives' default z-50, which left the
 * sidebar uncovered and clipped full-screen previews. Side panels use the
 * shell modal layer; dialogs opened from a panel and the document viewer stay
 * above it; toasts (z 180) remain on top.
 */
export const salesLayer = {
  sheetOverlay: "z-[160]",
  sheet: "z-[161]",
  dialogOverlay: "z-[170]",
  dialog: "z-[171]",
  viewer: "z-[175]",
} as const;

/* ----------------------------------------------------------- page parts */

export function PageHead({
  eyebrow,
  title,
  status,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  status?: ReactNode;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    // Side by side only when there is room; the actions keep one row instead of stacking under each other.
    <header className="flex flex-col items-start justify-between gap-4 border-b border-border pb-4 xl:flex-row xl:items-end xl:gap-6">
      <div className="min-w-0 xl:flex-1">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--nx-brand)]">{eyebrow}</span>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <h1 className="m-0 text-2xl font-bold leading-tight tracking-tight text-foreground">{title}</h1>
          {status}
        </div>
        {description ? <p className="mt-1.5 mb-0 max-w-190 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center justify-start gap-2 xl:w-auto xl:shrink-0 xl:justify-end">{actions}</div> : null}
    </header>
  );
}

export interface Metric {
  label: string;
  value: ReactNode;
  hint: string;
  onSelect?: () => void;
  selected?: boolean;
}

export function MetricTiles({ metrics }: { metrics: readonly Metric[] }) {
  return (
    <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const body = (
          <>
            <span className="block text-xs text-muted-foreground">{metric.label}</span>
            <strong className="my-1 block text-lg font-bold tracking-tight text-foreground">{metric.value}</strong>
            <small className="block text-xs text-muted-foreground">{metric.hint}</small>
          </>
        );
        const base = "min-w-0 rounded border border-border bg-card p-3.5 text-left shadow-sm";
        return metric.onSelect ? (
          <button
            key={metric.label}
            type="button"
            aria-pressed={metric.selected}
            onClick={metric.onSelect}
            className={cn(base, "cursor-pointer hover:border-[var(--nx-border-strong)] aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-ring/30")}
          >
            {body}
          </button>
        ) : (
          <article key={metric.label} className={base}>
            {body}
          </article>
        );
      })}
    </section>
  );
}

export function Card({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-border bg-card shadow-sm", className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="m-0 text-sm font-bold text-foreground">{title}</h2>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- lists */

export const tableClass =
  "w-full border-collapse text-[0.8125rem] [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-[0.6875rem] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-[0.055em] [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle [&_tbody_tr:last-child_td]:border-b-0 [&_td_small]:block [&_td_small]:text-xs [&_td_small]:text-muted-foreground";

export const clickableRow = "cursor-pointer hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

export function rowKeyHandler(open: () => void) {
  return (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      open();
    }
  };
}

export function ListToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-t-lg border-b border-border bg-muted px-3 py-2.5">{children}</div>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="flex min-w-0 max-w-95 flex-[1_1_15rem] items-center gap-2 rounded-[var(--nx-radius-md)] border border-input bg-card px-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

export const selectClass =
  "h-10 w-full min-w-0 rounded-[var(--nx-radius-md)] border border-input bg-card px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (string | readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      {label}
      <select className={cn(selectClass, "h-9 w-auto")} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => {
          const [optionValue, optionLabel] = typeof option === "string" ? [option, option] : option;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function ListFooter({ children }: { children: ReactNode }) {
  return <div className="border-t border-border px-3 py-2.5 text-xs text-muted-foreground">{children}</div>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-1.5 px-4 py-10 text-center text-muted-foreground">
      <strong className="text-sm text-foreground">{title}</strong>
      {hint ? <span className="text-xs">{hint}</span> : null}
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- forms */

export function Field({
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("grid min-w-0 content-start gap-1.5", className)}>
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
        {required ? <b className="text-[var(--nx-danger)]" aria-hidden="true"> *</b> : null}
      </span>
      {children}
      {error ? <small className="text-xs font-semibold text-[var(--nx-danger)]">{error}</small> : null}
      {hint && !error ? <small className="text-xs text-muted-foreground">{hint}</small> : null}
    </label>
  );
}

export function ReadField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-w-0 content-start gap-1.5", className)}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="min-h-5.5 font-medium break-words text-foreground">{children || "—"}</span>
    </div>
  );
}

export function SubHead({ children }: { children: ReactNode }) {
  return (
    <div className="col-span-full mt-1 border-b border-border pb-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </div>
  );
}

/** Purchase-style action bar: Save/Discard, lifecycle strip, save state. */
export function EntryActionBar({
  saveLabel,
  lifecycle,
  state,
  error,
  onSave,
  onDiscard,
}: {
  saveLabel: string;
  lifecycle: readonly string[];
  state: string;
  error?: string;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <section
      className="grid min-h-12.5 grid-cols-1 items-center gap-3 rounded border border-border bg-card p-2.5 shadow-sm lg:grid-cols-[auto_minmax(0,1fr)_auto]"
      aria-label="Document actions"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" onClick={onSave}>{saveLabel}</Button>
        <Button type="button" variant="outline" onClick={onDiscard}>Discard</Button>
      </div>
      <ol className="m-0 flex min-w-0 list-none items-center justify-start overflow-x-auto p-0 lg:justify-center" aria-label="Document lifecycle">
        {lifecycle.map((step, index) => (
          <li
            key={step}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-bold not-last:after:mx-1.5 not-last:after:h-px not-last:after:w-5.5 not-last:after:bg-border",
              index === 0 ? "text-[var(--nx-brand)]" : "text-muted-foreground",
            )}
          >
            <i className={cn("grid size-6 shrink-0 place-items-center rounded-full border border-border text-xs not-italic", index === 0 && "border-primary bg-primary text-primary-foreground")}>
              {index + 1}
            </i>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <span className={cn("flex items-center gap-1.5 text-xs whitespace-nowrap", error ? "font-semibold text-[var(--nx-danger)]" : "text-muted-foreground")} role={error ? "alert" : undefined}>
        <i className={cn("size-1.75 rounded-full", error ? "bg-[var(--nx-danger)]" : "bg-[var(--nx-warning)]")} />
        {error || state}
      </span>
    </section>
  );
}

export function EntryTabs<T extends string>({
  tabs,
  active,
  onChange,
  errors = [],
  label,
}: {
  tabs: readonly (readonly [T, string])[];
  active: T;
  onChange: (tab: T) => void;
  errors?: readonly T[];
  label: string;
}) {
  return (
    <div className="flex min-h-11 items-end gap-1 overflow-x-auto border-b border-border bg-primary/10 px-3" role="tablist" aria-label={label}>
      {tabs.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onChange(id)}
          className={cn(
            "min-h-10.5 shrink-0 border-0 border-b-2 bg-transparent px-3.5 text-sm font-semibold whitespace-nowrap",
            active === id ? "border-primary bg-card text-[var(--nx-brand)]" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {text}
          {errors.includes(id) ? <span className="ml-1.5 inline-block size-1.75 rounded-full bg-[var(--nx-danger)] align-middle" aria-label="has errors" /> : null}
        </button>
      ))}
    </div>
  );
}

export function TotalsSummary({ rows, total }: { rows: readonly [string, string][]; total: [string, string] }) {
  return (
    <dl className="m-0 grid grid-cols-[1fr_auto] content-start gap-x-4 gap-y-1.5 text-[0.8125rem]">
      {rows.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="m-0 text-right font-semibold">{value}</dd>
        </div>
      ))}
      <dt className="border-t border-border pt-1.5 text-[0.9375rem] font-bold text-foreground">{total[0]}</dt>
      <dd className="m-0 border-t border-border pt-1.5 text-right text-[0.9375rem] font-bold">{total[1]}</dd>
    </dl>
  );
}

/* --------------------------------------------------------------- record */

export interface FlowStep {
  label: string;
  done: boolean;
  skipped?: boolean;
  detail?: string;
  link?: { code: string; onOpen: () => void };
}

export function FlowStrip({ steps }: { steps: readonly FlowStep[] }) {
  const nextIndex = steps.findIndex((step) => !step.done && !step.skipped);
  return (
    <ol
      className={cn(
        "m-0 grid list-none grid-cols-1 gap-2.5 rounded-lg border border-border bg-card p-3 shadow-sm sm:grid-cols-3 md:gap-y-3",
        steps.length > 5 ? "xl:grid-cols-6" : "md:grid-cols-5",
      )}
      aria-label="Sales flow"
    >
      {steps.map((step, index) => {
        const next = index === nextIndex;
        return (
          <li
            key={step.label}
            aria-current={next ? "step" : undefined}
            className={cn(
              "relative flex min-w-0 items-center gap-2 pr-2 md:not-last:after:absolute md:not-last:after:top-1/2 md:not-last:after:right-1 md:not-last:after:left-9 md:not-last:after:h-px md:not-last:after:content-['']",
              step.done ? "md:not-last:after:bg-[var(--nx-success-border)]" : "md:not-last:after:bg-border",
            )}
          >
            <i
              className={cn(
                "relative z-1 grid size-7.5 shrink-0 place-items-center rounded-full border bg-card text-xs font-bold not-italic text-muted-foreground",
                step.done && "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]",
                next && "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_var(--nx-focus-ring)]",
                step.skipped && "border-dashed",
                !step.done && !next && "border-border",
              )}
            >
              {step.done ? "✓" : step.skipped ? "–" : index + 1}
            </i>
            <div className="relative z-1 min-w-0 bg-card pr-2">
              <strong className={cn("block text-xs whitespace-nowrap", next && "text-[var(--nx-brand)]")}>{step.label}</strong>
              {step.link ? (
                <button type="button" onClick={step.link.onOpen} className="block border-0 bg-transparent p-0 font-mono text-[0.6875rem] font-semibold text-[var(--nx-brand)] underline underline-offset-2">
                  {step.link.code}
                </button>
              ) : null}
              <small className="block truncate text-[0.6875rem] text-muted-foreground">{step.detail || (next ? "Next" : "Pending")}</small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The single next action shown on every record, like Purchase. */
export function NextActionBar({
  tone,
  eyebrow,
  title,
  text,
  children,
}: {
  tone: "action" | "wait" | "done" | "stopped";
  eyebrow: string;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  const toneClass = {
    action: "border-[var(--nx-brand-line)] border-l-primary bg-[var(--nx-brand-soft)]",
    wait: "border-[var(--nx-warning-border)] border-l-[var(--nx-warning)] bg-[var(--nx-warning-soft)]",
    done: "border-[var(--nx-success-border)] border-l-[var(--nx-success)] bg-[var(--nx-success-soft)]",
    stopped: "border-[var(--nx-danger-border)] border-l-[var(--nx-danger)] bg-[var(--nx-danger-soft)]",
  }[tone];
  const eyebrowClass = {
    action: "text-[var(--nx-brand)]",
    wait: "text-[var(--nx-warning)]",
    done: "text-[var(--nx-success-text)]",
    stopped: "text-[var(--nx-danger)]",
  }[tone];
  return (
    <section className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg border border-l-4 px-4 py-3.5", toneClass)} aria-label="Next action">
      <div className="min-w-0">
        <span className={cn("text-xs font-bold uppercase tracking-[0.06em]", eyebrowClass)}>{eyebrow}</span>
        <strong className="mt-0.5 block text-base font-bold text-foreground">{title}</strong>
        <p className="mt-0.5 mb-0 max-w-175 text-[0.8125rem] text-muted-foreground">{text}</p>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </section>
  );
}

export function SummaryCells({ cells }: { cells: readonly [string, ReactNode][] }) {
  return (
    <section className="grid overflow-hidden rounded border border-border bg-card sm:grid-cols-2 xl:grid-cols-5">
      {cells.map(([label, value]) => (
        <div key={label} className="min-w-0 border-b border-border px-3.5 py-3 xl:border-r xl:border-b-0 xl:last:border-r-0">
          <span className="block text-xs text-muted-foreground">{label}</span>
          <strong className="mt-1 block text-[0.8125rem] break-words">{value}</strong>
        </div>
      ))}
    </section>
  );
}

export function KeyValues({ rows }: { rows: readonly [string, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 p-4 text-[0.8125rem]">
      {rows.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="m-0 text-right font-semibold break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ActivityList({ entries }: { entries: readonly { step: string; at: string; by: string; note?: string }[] }) {
  const ordered = [...entries].reverse();
  if (!ordered.length) return <p className="m-0 p-4 text-[0.8125rem] text-muted-foreground">No activity yet.</p>;
  return (
    <ul className="m-0 grid list-none px-4 py-2">
      {ordered.map((entry, index) => (
        <li key={`${entry.step}-${entry.at}-${index}`} className="grid grid-cols-[1.75rem_1fr] gap-2 border-b border-border py-2.5 last:border-b-0">
          <i className="grid size-7 place-items-center rounded-full bg-primary/10 text-[0.625rem] font-extrabold not-italic text-[var(--nx-brand)]">
            {entry.by.split(/[ .]/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase()}
          </i>
          <div className="min-w-0">
            <strong className="block text-[0.8125rem]">{entry.step}</strong>
            <small className="block text-xs text-muted-foreground">{entry.at} · {entry.by}</small>
            {entry.note ? <small className="block text-xs text-muted-foreground">{entry.note}</small> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LinkButton({ children, onClick, mono }: { children: ReactNode; onClick: () => void; mono?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-0 bg-transparent p-0 text-left font-semibold text-[var(--nx-brand)] underline decoration-[var(--nx-brand-line)] underline-offset-2 hover:text-[var(--nx-brand-strong)]",
        mono && "font-mono",
      )}
    >
      {children}
    </button>
  );
}
