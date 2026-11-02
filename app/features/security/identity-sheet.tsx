"use client";

import type { ReactNode } from "react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";

/** Presentation only: each security workflow owns its authority, request and draft state. */
export function IdentitySheet({
  open,
  title,
  children,
  onClose,
  busy = false,
  message,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose(): void;
  busy?: boolean;
  message?: string;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName="z-[160]"
        className="z-[161] gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"
      >
        <SheetHeader className="shrink-0 border-b border-border pr-4">
          <div className="flex items-start justify-between gap-3">
            <SheetTitle>{title}</SheetTitle>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
              Close sheet
            </Button>
          </div>
          <SheetDescription>Review the details. Existing permissions and approval requirements apply.</SheetDescription>
        </SheetHeader>
        <div
          aria-busy={busy}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 [overflow-wrap:anywhere] [&_label]:min-w-0 [&_input]:min-w-0 [&_select]:min-w-0 [&_select]:max-w-full [&_select]:rounded-md [&_select]:border [&_select]:border-input [&_select]:bg-background [&_select]:px-2 [&_select]:py-2 [&_select]:text-foreground [&_textarea]:min-w-0"
        >
          {message ? (
            <Alert role="status" className="mb-4">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
