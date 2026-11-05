"use client";

import type { ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
  size = "default",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  message?: string;
  elevated?: boolean;
  /** "wide" suits calendars and dense detail; forms keep the default width. */
  size?: "default" | "wide";
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={`${elevated ? "z-[1401]!" : "z-[1301]!"} w-full! gap-0 overflow-hidden border-border p-0 ${size === "wide" ? "sm:max-w-3xl!" : "sm:max-w-xl!"}`}
        overlayClassName={elevated ? "z-[1400]!" : "z-[1300]!"}
        side="right"
      >
        <SheetHeader className="border-b border-border bg-muted/35 px-5 py-5 pr-14 sm:px-6">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</span>
          <SheetTitle className="m-0! mt-1! text-xl font-semibold sm:text-2xl">{title}</SheetTitle>
          <SheetDescription className="mt-1 leading-relaxed">{description}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {message ? (
            <p role="status" className="mb-4 rounded-lg border border-border bg-muted p-3 text-sm">
              {message}
            </p>
          ) : null}
          {children}
        </div>
        {footer ? (
          <SheetFooter className="border-t border-border bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            {footer}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
