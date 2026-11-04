"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { HrDeleteButton } from "./hr-icon-buttons";

/**
 * Permanent delete for a deactivated Organisation & Masters record. The server refuses active records and
 * records still referenced elsewhere; the caller shows that message and the record stays deactivated.
 */
export function HrMasterDeleteButton({
  name,
  code,
  saving,
  onDelete,
  className,
}: {
  name: string;
  code?: string;
  saving: boolean;
  onDelete: () => Promise<boolean>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HrDeleteButton
        label={`Delete ${name} permanently`}
        className={className}
        disabled={saving}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      />
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!saving) setOpen(next);
        }}
      >
        <AlertDialogContent
          className="z-[1401]!"
          overlayClassName="z-[1400]!"
          onClick={(event) => event.stopPropagation()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {code ? `${code} will be removed for good and its code will not be reused. ` : ""}
              This cannot be undone. Records still used by employees or other records cannot be deleted and stay
              deactivated. The deletion is kept in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-border">
            <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={async () => {
                // Close either way: the page shows the success message or the server's reason (e.g. still in use).
                await onDelete();
                setOpen(false);
              }}
            >
              {saving ? "Deleting…" : "Delete permanently"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
