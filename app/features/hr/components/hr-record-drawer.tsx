"use client";

import { useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { HrMasterSheet } from "./hr-master-sheet";

/** Shared record editor presentation; the owning workspace retains its API and form state. */
export function HrRecordDrawer({
  title,
  children,
  triggerLabel,
  open,
  onClose,
  busy = false,
  disabled = false,
  description = "Review the details and save your changes.",
  error,
  notice,
  completionKey,
  footer,
}: {
  title: string;
  children: ReactNode;
  triggerLabel?: string;
  open?: boolean;
  onClose?: () => void;
  busy?: boolean;
  disabled?: boolean;
  description?: string;
  error?: string;
  notice?: string;
  completionKey?: string;
  /** Actions for the drawer's bottom action area (HrDrawerActions in the body also land there). */
  footer?: ReactNode;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const [completedAtOpen, setCompletedAtOpen] = useState(completionKey);
  const visible = open ?? (localOpen && completedAtOpen === completionKey);
  const close = () => {
    if (busy) return;
    if (open === undefined) setLocalOpen(false);
    onClose?.();
  };
  return (
    <>
      {triggerLabel ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy}
          onClick={() => {
            setCompletedAtOpen(completionKey);
            setLocalOpen(true);
          }}
        >
          {triggerLabel}
        </Button>
      ) : null}
      <HrMasterSheet
        elevated
        open={visible}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        eyebrow="Record details"
        title={title}
        description={description}
        footer={footer}
      >
        <div
          aria-busy={busy}
          className="grid min-w-0 gap-4 text-foreground [&>aside]:border-0! [&>aside]:bg-transparent! [&>aside]:p-0! [&>aside]:shadow-none! [&>section]:border-0! [&>section]:bg-transparent! [&>section]:p-0! [&>section]:shadow-none! [&>form]:border-0! [&>form]:bg-transparent! [&>form]:p-0! [&>form]:shadow-none! [&_label]:min-w-0 [&_input]:min-w-0 [&_textarea]:min-w-0 [&_select]:min-w-0 [&_select]:w-full [&_h2]:mt-0! [&_h3]:mt-0!"
        >
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {notice ? (
            <p role="status" className="m-0! rounded-lg border border-border bg-muted p-3 text-sm">
              {notice}
            </p>
          ) : null}
          {children}
        </div>
      </HrMasterSheet>
    </>
  );
}
