"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface CredentialNotice {
  title: string;
  userName: string;
  email: string;
  password: string;
  emailStatus: "queued" | "not_configured";
}

/** Shows a one-time password once. Closing the dialog discards it from the screen. */
export function CredentialResultDialog({ notice, onClose }: { notice: CredentialNotice | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!notice) return;
    try {
      await navigator.clipboard.writeText(notice.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      open={notice !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent overlayClassName="z-[1400]!" className="z-[1401]! sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{notice?.title}</DialogTitle>
          <DialogDescription>
            Temporary password for {notice?.userName} ({notice?.email}). They must change it at first sign-in.
          </DialogDescription>
        </DialogHeader>
        {notice ? (
          <div className="grid gap-3">
            <div className="flex items-center gap-2 rounded-[var(--nx-radius-md)] border border-border bg-muted/40 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-base text-foreground">{notice.password}</code>
              <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Alert>
              <AlertTitle>
                {notice.emailStatus === "queued" ? "Credentials email queued" : "Email not sent — share securely"}
              </AlertTitle>
              <AlertDescription>
                {notice.emailStatus === "queued"
                  ? "The user will receive their sign-in details by email. This password is shown only once."
                  : "Email delivery is not configured. Give this password to the user through a secure channel. It is shown only once."}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
