import type { ReactNode } from "react";

/**
 * One label/value row of a drawer's detail layout. Rows stack vertically with
 * a hairline between them; no cards or tiles.
 */
export function HrDetailTile({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(7.5rem,36%)_minmax(0,1fr)] items-baseline gap-3 border-b border-border/70 py-2 last:border-b-0">
      <dt className="m-0! text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0! min-w-0 wrap-anywhere text-sm font-medium text-foreground">{value || "Not recorded"}</dd>
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

/** Titled list of detail rows inside a drawer. */
export function HrDetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1" aria-label={title}>
      <h3 className="m-0! text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <dl className="m-0! grid">{children}</dl>
    </section>
  );
}

/** Untitled list of detail rows, for drawers that show one record's fields. */
export function HrDetailList({ children }: { children: ReactNode }) {
  return <dl className="m-0! grid">{children}</dl>;
}
