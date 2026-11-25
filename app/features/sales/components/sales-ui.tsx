"use client";

import type { ReactNode } from "react";
import { WorkspaceHeader } from "@/shared/ui/module-design";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

/* --------------------------------------------------------------- status */

type Tone = "success" | "warning" | "danger" | "info" | "purple" | "neutral";

const STATUS_TONE: Record<string, Tone> = {
  Open: "info",
  Saved: "neutral",
  Ordered: "neutral",
  Confirmed: "info",
  Issued: "success",
  Delivered: "purple",
  Invoiced: "success",
  Unpaid: "warning",
  "Partially paid": "warning",
  Overdue: "danger",
  Paid: "success",
  Recorded: "success",
  Active: "success",
  Inactive: "neutral",
  Paused: "neutral",
  "Pending approval": "warning",
  Approved: "success",
  Rejected: "danger",
  "On credit hold": "danger",
  "Not invoiced": "warning",
  Draft: "warning",
  "Prototype only": "neutral",
  "Changes requested": "warning",
  "Not submitted": "neutral",
  "Not started": "neutral",
  "Not applicable": "neutral",
  "Ready to confirm": "info",
  "Ready for delivery": "info",
  "Ready to invoice": "info",
  "Ready to deliver": "info",
  Posted: "success",
  Allocated: "success",
  "Partly allocated": "warning",
  "On account": "info",
  Returned: "purple",
  "Partly returned": "warning",
  Outstanding: "warning",
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
        "inline-flex min-h-5.5 items-center gap-1.5 rounded-[5px] border border-transparent px-2 py-1 text-xs font-semibold leading-tight whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current before:content-['']",
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
    <WorkspaceHeader eyebrow={eyebrow} title={title} status={status} description={description} actions={actions} />
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
    <section className={cn("grid gap-3.5 sm:grid-cols-2", metrics.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4")}>
      {metrics.map((metric) => {
        const body = (
          <>
            <span className="block text-xs text-muted-foreground">{metric.label}</span>
            <strong className="my-2 block text-[1.625rem] font-semibold tracking-tight text-foreground">
              {metric.value}
            </strong>
            <small className="block text-xs text-muted-foreground">{metric.hint}</small>
          </>
        );
        const base = "min-w-0 rounded-[10px] border border-border bg-card px-5 py-4 text-left";
        return metric.onSelect ? (
          <button
            key={metric.label}
            type="button"
            aria-pressed={metric.selected}
            onClick={metric.onSelect}
            className={cn(
              base,
              "cursor-pointer hover:border-[var(--nx-border-strong)] aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-ring/30",
            )}
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

export function Card({
  title,
  aside,
  children,
  className,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("min-w-0 overflow-hidden rounded-[10px] border border-border bg-card shadow-none", className)}
    >
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
  "w-full border-collapse text-[0.8125rem] [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:normal-case [&_th]:tracking-normal [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-4 [&_td]:align-middle [&_tbody_tr:last-child_td]:border-b-0 [&_td_small]:block [&_td_small]:text-xs [&_td_small]:text-muted-foreground";

export const clickableRow =
  "cursor-pointer hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

export function rowKeyHandler(open: () => void) {
  return (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      open();
    }
  };
}

export function ListToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-t-[10px] border-b border-border bg-card px-4 py-3">
      {children}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex min-w-0 max-w-md flex-[1_1_18rem] items-center gap-2 rounded-[var(--nx-radius-md)] border border-input bg-card px-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
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
      <span className="sr-only">{label}</span>
      <select
        className={cn(selectClass, "h-9 w-auto")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All {label === "Status" ? "statuses" : label.toLowerCase() + "s"}</option>
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
      <span className="text-sm font-medium leading-tight text-foreground">
        {label}
        {required ? (
          <b className="text-[var(--nx-danger)]" aria-hidden="true">
            {" "}
            *
          </b>
        ) : null}
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
  submit = false,
}: {
  saveLabel: string;
  lifecycle: readonly string[];
  state?: string;
  error?: string;
  onSave?: () => void;
  onDiscard: () => void;
  submit?: boolean;
}) {
  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3"
      aria-label="Document actions"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type={submit ? "submit" : "button"} onClick={onSave}>
          {saveLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onDiscard}>
          Discard
        </Button>
      </div>
      <ol className="m-0 flex min-w-0 list-none flex-wrap gap-1 p-0 text-xs" aria-label="Document lifecycle">
        {lifecycle.map((step, index) => (
          <li
            key={step}
            aria-current={index === 0 ? "step" : undefined}
            className={cn(
              "rounded-md border px-2 py-1",
              index === 0
                ? "border-primary bg-accent font-semibold text-accent-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {error || state ? (
        <span
          className={cn(
            "min-w-0 break-words text-xs",
            error ? "font-semibold text-destructive" : "text-muted-foreground",
          )}
          role={error ? "alert" : undefined}
        >
          {error || state}
        </span>
      ) : null}
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
    <div
      className="flex min-h-11 items-end gap-3 overflow-x-auto border-b border-border bg-card px-4"
      role="tablist"
      aria-label={label}
    >
      {tabs.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onChange(id)}
          className={cn(
            "min-h-10 shrink-0 border-0 border-b-2 bg-transparent px-2 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
            active === id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {text}
          {errors.includes(id) ? (
            <span
              className="ml-1.5 inline-block size-1.75 rounded-full bg-[var(--nx-danger)] align-middle"
              aria-label="has errors"
            />
          ) : null}
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
                step.done &&
                  "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]",
                next && "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_var(--nx-focus-ring)]",
                step.skipped && "border-dashed",
                !step.done && !next && "border-border",
              )}
            >
              {step.done ? "✓" : step.skipped ? "–" : index + 1}
            </i>
            <div className="relative z-1 min-w-0 bg-card pr-2">
              <strong className={cn("block text-xs whitespace-nowrap", next && "text-[var(--nx-brand)]")}>
                {step.label}
              </strong>
              {step.link ? (
                <button
                  type="button"
                  onClick={step.link.onOpen}
                  className="block border-0 bg-transparent p-0 font-mono text-[0.6875rem] font-semibold text-[var(--nx-brand)] underline underline-offset-2"
                >
                  {step.link.code}
                </button>
              ) : null}
              <small className="block truncate text-[0.6875rem] text-muted-foreground">
                {step.detail || (next ? "Next" : "Pending")}
              </small>
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
    action: "border-border border-l-primary bg-card",
    wait: "border-border border-l-[var(--nx-warning)] bg-card",
    done: "border-border border-l-[var(--nx-success)] bg-card",
    stopped: "border-border border-l-[var(--nx-danger)] bg-card",
  }[tone];
  const eyebrowClass = {
    action: "text-[var(--nx-brand)]",
    wait: "text-[var(--nx-warning)]",
    done: "text-[var(--nx-success-text)]",
    stopped: "text-[var(--nx-danger)]",
  }[tone];
  return (
    <section
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-l-4 px-4 py-3.5",
        toneClass,
      )}
      aria-label="Next action"
    >
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
        <div
          key={label}
          className="min-w-0 border-b border-border px-3.5 py-3 xl:border-r xl:border-b-0 xl:last:border-r-0"
        >
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

export function ActivityList({
  entries,
}: {
  entries: readonly { step: string; at: string; by: string; note?: string }[];
}) {
  const ordered = [...entries].reverse();
  if (!ordered.length) return <p className="m-0 p-4 text-[0.8125rem] text-muted-foreground">No activity yet.</p>;
  return (
    <ul className="m-0 grid list-none px-4 py-2">
      {ordered.map((entry, index) => (
        <li
          key={`${entry.step}-${entry.at}-${index}`}
          className="grid grid-cols-[1.75rem_1fr] gap-2 border-b border-border py-2.5 last:border-b-0"
        >
          <i className="grid size-7 place-items-center rounded-full bg-primary/10 text-[0.625rem] font-extrabold not-italic text-[var(--nx-brand)]">
            {entry.by
              .split(/[ .]/)
              .map((part) => part[0] ?? "")
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </i>
          <div className="min-w-0">
            <strong className="block text-[0.8125rem]">{entry.step}</strong>
            <small className="block text-xs text-muted-foreground">
              {entry.at} · {entry.by}
            </small>
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
