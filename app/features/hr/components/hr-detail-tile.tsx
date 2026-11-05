import type { ReactNode } from "react";

/** Label-and-value tile used in HR record drawers (matches the Organisation & Masters drawers). */
export function HrDetailTile({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/35 p-3">
      <p className="m-0! text-xs text-muted-foreground">{label}</p>
      <p className="m-0! mt-1! wrap-anywhere text-sm font-semibold text-foreground">{value || "Not recorded"}</p>
    </div>
  );
}

/** Single-column titled section inside a drawer (lists, forms, history), titled like HrDetailGroup. */
export function HrDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <h3 className="m-0! text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Titled group of detail tiles inside a drawer. */
export function HrDetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <h3 className="m-0! text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}
