"use client";

/**
 * Discard prompt (meeting of 11 Nov 2026): leaving a form that has unsaved
 * changes asks "You are about to discard this. Are you sure?" first. Covers
 * Close/Discard/Back buttons, closing a side panel and reloading the page.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { salesLayer } from "./sales-ui";

/** True when a form's current value differs from where it started. */
export function useIsDirty<T>(value: T): boolean {
  const [initial] = useState(() => JSON.stringify(value));
  return initial !== JSON.stringify(value);
}

/**
 * Wraps leave actions. guard(fn) runs fn straight away when the form is clean
 * and asks for confirmation when it has unsaved changes.
 */
export function useDiscardGuard(dirty: boolean) {
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const guard = useCallback(
    (leave: () => void) => {
      if (dirty) setPending(() => leave);
      else leave();
    },
    [dirty],
  );

  const dialog = (
    <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
      <AlertDialogContent overlayClassName={salesLayer.dialogOverlay} className={salesLayer.dialog}>
        <AlertDialogHeader>
          <AlertDialogTitle className="m-0">Discard changes?</AlertDialogTitle>
          <AlertDialogDescription className="m-0">You are about to discard this. Your unsaved changes will be lost. Are you sure?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              const leave = pending;
              setPending(null);
              leave?.();
            }}
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { guard, dialog };
}
