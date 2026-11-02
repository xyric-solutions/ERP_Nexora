import type { ReactNode } from "react";

/** Shared list filters keep their own handlers and adapt to the available width. */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-3 border-b border-border bg-muted/30 p-4 [&>.nx-search-field]:h-10! [&>.nx-search-field]:min-w-0! [&>.nx-search-field]:w-full! [&>.nx-search-field]:flex-[1_1_15rem]! [&>.nx-search-field]:rounded-[var(--nx-radius-md)]! [&>.nx-search-field]:bg-card! [&>button]:min-h-10 [&>label]:min-w-0 [&>label]:max-w-full">
      {children}
    </div>
  );
}
