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

export function HrMasterArchiveButton({
  name,
  saving,
  onArchive,
}: {
  name: string;
  saving: boolean;
  onArchive: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" disabled={saving} onClick={() => setOpen(true)}>
        Delete
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!saving) setOpen(next);
        }}
      >
        <AlertDialogContent className="z-[1401]!" overlayClassName="z-[1400]!">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This archives the record by making it inactive. It cannot be selected for new setup. Existing employee and
              accounting history is retained, and you can restore it with Activate.
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
                await onArchive();
                setOpen(false);
              }}
            >
              {saving ? "Archiving…" : "Delete and archive"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
