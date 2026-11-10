import type { ReactNode } from "react";

export function BankEntryHeader({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 items-start justify-between gap-3 border-b border-border pb-3">
      <div className="min-w-0">
        <h1 className="m-0 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mb-0 mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {status ? <div className="shrink-0 pt-0.5">{status}</div> : null}
    </header>
  );
}
