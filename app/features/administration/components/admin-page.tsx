"use client";

import { Info } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { WorkTable } from "@/shared/ui/work-table";

/**
 * Page frame shared by the Administration views. The shell content area already
 * pads the page, so the frame adds no padding of its own and lines up with the
 * breadcrumb.
 */
export function AdminPage({
  title,
  description,
  actions,
  prototype = false,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  /** Marks screens whose data is still held in the browser (plan Phase 2 deferred). */
  prototype?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <p className="m-0 text-xs font-semibold tracking-[0.14em] text-primary uppercase">Administration</p>
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="m-0 max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2 [&>button]:max-sm:flex-1">{actions}</div> : null}
      </header>
      {prototype ? <PrototypeNotice /> : null}
      {children}
    </section>
  );
}

/** One-line reminder that the screen's data is not saved on the server yet. */
export function PrototypeNotice() {
  return (
    <p
      role="note"
      className="m-0 flex items-start gap-2 rounded-[var(--nx-radius-md)] border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] px-3 py-2 text-sm text-foreground"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-[var(--nx-warning)]" aria-hidden="true" />
      <span>
        <strong className="font-semibold">Prototype data.</strong> Changes stay in this browser session and are not
        saved to the server yet.
      </span>
    </p>
  );
}

/** Bordered card with an optional title bar, used for every Administration panel. */
export function AdminPanel({
  title,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-[var(--nx-radius-lg)] border border-border bg-card ${className}`}
    >
      {title ? (
        <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="m-0 text-sm font-semibold text-foreground">{title}</h2>
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}

const tableClass = [
  "w-full border-collapse text-left text-sm text-foreground",
  "[&_thead]:bg-muted/50",
  "[&_th]:px-4 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:whitespace-nowrap [&_th]:text-muted-foreground",
  "[&_td]:px-4 [&_td]:py-3 [&_td]:align-middle",
  "[&_tbody_tr]:border-t [&_tbody_tr]:border-border [&_tbody_tr:hover]:bg-muted/30",
].join(" ");

/** Styled, horizontally scrollable table for Administration lists. */
export function AdminTable({
  tableId,
  label,
  minWidth,
  children,
}: {
  tableId: string;
  label: string;
  /** Minimum table width before it scrolls sideways, e.g. "40rem". */
  minWidth?: string;
  children: ComponentProps<"table">["children"];
}) {
  return (
    // `relative` keeps absolutely positioned content (e.g. sr-only labels) inside the scroll box.
    <div className="relative min-w-0 overflow-x-auto">
      <WorkTable
        tableId={tableId}
        label={label}
        tools={false}
        paging={false}
        aria-label={label}
        className={tableClass}
        style={minWidth ? { minWidth } : undefined}
      >
        {children}
      </WorkTable>
    </div>
  );
}

/** Small summary figure for the Administration dashboard. */
export function StatTile({
  label,
  value,
  detail,
  tone = "default",
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "default" | "warning" | "success" | "muted";
  onClick?: () => void;
}) {
  const accent = {
    default: "before:bg-primary",
    warning: "before:bg-[var(--nx-warning)]",
    success: "before:bg-[var(--nx-success)]",
    muted: "before:bg-muted-foreground/40",
  }[tone];
  const content = (
    <>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <strong className="text-3xl leading-none font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </strong>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </>
  );
  const className = `relative grid min-w-0 content-start gap-2 overflow-hidden rounded-[var(--nx-radius-lg)] border border-border bg-card p-4 text-left before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${accent}`;
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${className} cursor-pointer transition-colors hover:border-[var(--nx-brand-line)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

const statusTone: Record<string, string> = {
  active: "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]",
  inactive: "border-border bg-muted text-muted-foreground",
  locked: "border-[var(--nx-danger-border)] bg-[var(--nx-danger-soft)] text-[var(--nx-danger)]",
  resigned: "border-border bg-muted text-muted-foreground",
};

export function UserStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap capitalize ${statusTone[status] ?? ""}`}
    >
      {status}
    </span>
  );
}

/** Empty-state row spanning a whole table. */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10! text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
