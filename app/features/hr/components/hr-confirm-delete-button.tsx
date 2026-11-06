"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { HrDeleteButton } from "./hr-icon-buttons";

/** Delete icon that asks for confirmation first; sits at the end of a record row or in a drawer footer. */
export function HrConfirmDeleteButton({
  label,
  title,
  description,
  confirmLabel = "Delete",
  disabled = false,
  variant = "ghost",
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel?: string;
  disabled?: boolean;
  variant?: "ghost" | "destructive" | "outline";
  /** Return false to keep the dialog open (for example when the server refused). */
  onConfirm: () => void | boolean | Promise<boolean | void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <HrDeleteButton
        label={label}
        variant={variant}
        className={variant === "ghost" ? "text-destructive hover:text-destructive" : undefined}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      />
      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent className="z-[1501]!" overlayClassName="z-[1500]!" onClick={(event) => event.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-border">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await onConfirm();
                  if (result !== false) setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Deleting…" : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
