"use client";

import { changePasswordRequestSchema } from "@nexora/contracts";
import { useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LabeledField } from "@/shared/ui/labeled-field";

import { useSession } from "../../../lib/session/session-provider";

/** My account → Change password, for every signed-in user (`POST /api/v1/auth/change-password`). */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="z-[1300]!" className="z-[1301]! sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Other signed-in sessions are signed out after the change.</DialogDescription>
        </DialogHeader>
        {open ? <ChangePasswordForm onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const { api, csrfToken, refresh } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (next !== confirmation) {
      setError("The new passwords do not match.");
      return;
    }
    const parsed = changePasswordRequestSchema.safeParse({ current_password: current, new_password: next });
    if (!parsed.success) {
      setError(
        next.length < 8
          ? "Use a new password of at least 8 characters."
          : "Choose a password different from the current one.",
      );
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(parsed.data, csrfToken());
      setCurrent("");
      setNext("");
      setConfirmation("");
      setDone(true);
      await refresh();
    } catch {
      setError("The password was not changed. Check your current password and the password rules, then try again.");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <>
        <p role="status" className="m-0 text-sm text-foreground">
          Your password was changed.
        </p>
        <DialogFooter>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <LabeledField label="Current password">
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </LabeledField>
      <LabeledField label="New password" hint="At least 8 characters.">
        <Input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
      </LabeledField>
      <LabeledField label="Confirm new password">
        <Input
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </LabeledField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !current || !next || !confirmation}>
          {saving ? "Changing…" : "Change password"}
        </Button>
      </DialogFooter>
    </form>
  );
}
