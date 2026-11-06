"use client";

import { useState, type ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { HrDrawerFooterProvider, useHrDrawerSection } from "./hr-drawer-context";

/**
 * The single HR & Payroll side drawer: one width and full height everywhere, a
 * compact header (section name, then the record's name) and one bottom action
 * area. Actions come from `footer` or from `HrDrawerActions` inside the body.
 */
export function HrMasterSheet({
  open,
  onOpenChange,
  eyebrow,
  title,
  description,
  children,
  footer,
  message,
  elevated = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fallback section name when the page does not provide one. */
  eyebrow: string;
  /** The selected record's name. */
  title: string;
  /** Read by assistive technology only; the header stays compact. */
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  message?: string;
  elevated?: boolean;
  /** Retained for compatibility; every drawer now shares one size. */
  size?: "default" | "wide";
}) {
  const section = useHrDrawerSection();
  const [footerTarget, setFooterTarget] = useState<HTMLDivElement | null>(null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={`${elevated ? "z-[1401]!" : "z-[1301]!"} w-full! gap-0 overflow-hidden border-border p-0 sm:max-w-[34rem]!`}
        overlayClassName={elevated ? "z-[1400]!" : "z-[1300]!"}
        side="right"
      >
        <SheetHeader className="gap-0 border-b border-border px-5 py-3 pr-14 sm:px-6">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            {section ?? eyebrow}
          </span>
          <SheetTitle className="m-0! truncate text-lg font-semibold leading-snug">{title}</SheetTitle>
          <SheetDescription className="sr-only">{description || title}</SheetDescription>
        </SheetHeader>
        <HrDrawerFooterProvider target={footerTarget}>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            {message ? (
              <p role="status" className="mb-4 rounded-lg border border-border bg-muted p-3 text-sm">
                {message}
              </p>
            ) : null}
            {children}
          </div>
        </HrDrawerFooterProvider>
        {/* One bottom action area; it collapses when the record has no actions. */}
        <div className="flex flex-wrap items-center justify-end gap-2 bg-muted/40 px-5 py-3 sm:px-6 [&:not(:has(button,a))]:hidden">
          {footer}
          <div ref={setFooterTarget} className="contents" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
