"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { HrRecordCodeKind } from "@nexora/contracts";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/session/session-provider";
import { cn } from "cn";
import { HrApiClient } from "../api/hr-client";

/**
 * HR & Payroll create-form standard (HR154):
 *   1. Auto-generated code (read-only)  2. Name or primary identifying field  3. remaining fields
 * Every field sits on its own full-width row; HrFormRows provides the single column and spacing.
 */
export function HrFormRows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 grid-cols-1 gap-4 [&>*]:min-w-0", className)}>{children}</div>;
}

/** The standard field row: label above a full-width control. */
export function HrFormRow({
  label,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <label className="text-sm font-medium leading-tight text-foreground" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Reads the next code the server will reserve for `kind`. The value is only a preview: the
 * final unique code is allocated inside the create transaction and returned with the record.
 */
export function useHrRecordCodePreview(kind: HrRecordCodeKind, companyId: string | undefined, enabled = true, refreshKey?: unknown) {
  const { api } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [state, setState] = useState<{ key: string; code: string | null; failed: boolean; attempt: number }>({
    key: "",
    code: null,
    failed: false,
    attempt: 0,
  });
  const key = `${kind}|${companyId ?? ""}|${String(refreshKey ?? "")}`;
  const attempt = state.key === key ? state.attempt : 0;
  useEffect(() => {
    if (!enabled || !companyId) return;
    let live = true;
    // A transient failure is retried (up to three attempts) so the form shows the real code.
    const load = () =>
      new Promise<Awaited<ReturnType<HrApiClient["recordCodePreview"]>>>((resolve) =>
        resolve(client.recordCodePreview(companyId, kind)),
      )
        .then((preview) => live && setState({ key, code: preview.code, failed: false, attempt }))
        .catch(
          () =>
            live &&
            setState(
              attempt < 2
                ? { key, code: null, failed: false, attempt: attempt + 1 }
                : { key, code: null, failed: true, attempt },
            ),
        );
    const timer = attempt ? window.setTimeout(load, 1200) : undefined;
    if (!attempt) void load();
    return () => {
      live = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [attempt, client, companyId, enabled, key, kind]);
  return state.key === key ? state : { key, code: null, failed: false, attempt: 0 };
}

/**
 * First row of every Add / New / Create form: the automatically generated record code.
 * Pass `value` for an existing record (edit) to show its saved code instead of a preview.
 */
export function HrRecordCodeField({
  kind,
  companyId,
  value,
  id,
  label = "Code",
  refreshKey,
  existing = false,
}: {
  kind: HrRecordCodeKind;
  companyId: string | undefined;
  value?: string | null;
  id?: string;
  label?: string;
  refreshKey?: unknown;
  /** The form edits a saved record: show its code, never a preview of the next one. */
  existing?: boolean;
}) {
  const preview = useHrRecordCodePreview(kind, companyId, !value && !existing, refreshKey);
  const inputId = id ?? `hr-record-code-${kind}`;
  const shown =
    value ||
    (existing
      ? "Not assigned"
      : (preview.code ?? (preview.failed ? "Code unavailable" : "Generating…")));
  return (
    <HrFormRow label={label} htmlFor={inputId}>
      <Input
        id={inputId}
        name="code"
        value={shown}
        readOnly
        aria-readonly="true"
        data-record-code={kind}
        className="cursor-default bg-muted font-mono text-sm tabular-nums text-foreground"
        onChange={() => undefined}
      />
    </HrFormRow>
  );
}
