import type { ReactNode } from "react";

export function BankEntryHeader({ title, status }: { title: string; description: string; status?: ReactNode }) {
  return (
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="m-0 text-lg font-semibold tracking-tight">{title}</h1>
      </div>
      {status ? <div className="shrink-0 pt-0.5">{status}</div> : null}
    </header>
  );
}
