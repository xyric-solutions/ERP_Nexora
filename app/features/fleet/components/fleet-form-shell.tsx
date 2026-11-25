"use client";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkForm, WorkFormLayout } from "@/shared/ui/work-form";

/** Shared frame for the Fleet forms: title, status, error, the field card and a sticky footer. */
export function FleetFormShell({
  title,
  description,
  status,
  error,
  loading,
  loadFailed,
  busy,
  disabled,
  canSave,
  saveLabel,
  saving,
  hint,
  actions,
  onSubmit,
  onClose,
  onRetry,
  children,
}: {
  title: string;
  description?: string;
  status: string;
  error: string;
  loading: boolean;
  loadFailed: boolean;
  busy: boolean;
  disabled: boolean;
  canSave: boolean;
  saveLabel: string;
  saving: boolean;
  hint?: ReactNode;
  /** Extra buttons shown before Close (Tools, Add fuel…). */
  actions?: ReactNode;
  onSubmit: () => void;
  onClose: () => void;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <WorkFormLayout>
        <p role="status">Loading…</p>
      </WorkFormLayout>
    );
  if (loadFailed)
    return (
      <WorkFormLayout>
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="outline" onClick={onRetry}>
                Retry
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </WorkFormLayout>
    );
  return (
    <WorkForm
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="min-w-0 space-y-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-[1.625rem] font-semibold tracking-tight">{title}</h1>
          {description ? <p className="m-0 mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <Badge variant="outline">{status}</Badge>
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset
        disabled={busy || disabled}
        className="m-0 min-w-0 space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        {children}
      </fieldset>
      <footer className="sticky bottom-3 z-20 flex flex-wrap items-center justify-end gap-3 rounded-[10px] border border-border bg-card p-4 shadow-sm">
        {hint ? <div className="mr-auto max-w-xl text-sm text-muted-foreground">{hint}</div> : null}
        <div className="flex flex-wrap gap-2">
          {actions}
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Close
          </Button>
          {canSave ? (
            <Button type="submit" disabled={busy}>
              {saving ? "Saving…" : saveLabel}
            </Button>
          ) : null}
        </div>
      </footer>
    </WorkForm>
  );
}
