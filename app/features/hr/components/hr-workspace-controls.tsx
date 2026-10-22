"use client";
import {
  useEffect,
  useEffectEvent,
  useState,
  useId,
  isValidElement,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from "react";
import type { HrOvertimeDetail } from "@nexora/contracts";
import { Badge } from "@/components/ui/badge";
import { attendanceLabel as label } from "./attendance-status";
export const selectClass =
  "h-10 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring";
export const panel = "min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5";
export const dayValue = (value: string) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(Number(value));
export const localDate = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
/** Keyed API reads discard stale responses without resetting typed form state. */
export function useAttendanceRead<T>(key: string | null, load: () => Promise<T>) {
  const currentLoad = useEffectEvent(load),
    [state, setState] = useState<{ key: string; data: T | null; error: string } | null>(null);
  useEffect(() => {
    if (!key) return;
    let active = true;
    currentLoad()
      .then((data) => {
        if (active) setState({ key, data, error: "" });
      })
      .catch((e: unknown) => {
        if (active)
          setState({
            key,
            data: null,
            error: e instanceof Error ? e.message : "The attendance records could not be loaded.",
          });
      });
    return () => {
      active = false;
    };
  }, [key]);
  return key && state?.key === key
    ? { data: state.data, error: state.error, loading: false }
    : { data: null, error: "", loading: !!key };
}
export function Field({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-2 text-sm font-medium">
      <label htmlFor={id}>{title}</label>
      {isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children}
    </div>
  );
}
export function State({ value }: { value: string }) {
  return (
    <Badge
      variant="outline"
      className={
        value === "locked" || value === "approved"
          ? "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]!"
          : value === "exceptions" || value.startsWith("pending")
            ? "border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]!"
            : "bg-muted text-foreground!"
      }
    >
      {label(value)}
    </Badge>
  );
}
export function Metric({ title, value, hint }: { title: string; value: string | number; hint: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-4">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="mt-2 break-words text-xl font-semibold tabular-nums [overflow-wrap:anywhere]">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
export function History({ items }: { items: HrOvertimeDetail["history"] }) {
  return (
    <details className={panel}>
      <summary className="cursor-pointer text-sm font-semibold">Decision history ({items.length})</summary>
      <ol className="mt-4 grid gap-3">
        {items.map((h, i) => (
          <li key={i} className="min-w-0 border-l-2 border-primary/30 pl-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <strong>{label(h.action)}</strong>
              <span className="text-xs text-muted-foreground">
                {h.actor_name} · {new Date(h.occurred_at).toLocaleString()}
              </span>
            </div>
            <p className="mt-1 break-words text-muted-foreground">{h.reason}</p>
            {h.override_event_id && (
              <span className="text-xs text-[var(--nx-warning)]">Audited administrator override</span>
            )}
          </li>
        ))}
      </ol>
      {!items.length && <p className="mt-3 text-sm text-muted-foreground">No workflow events recorded.</p>}
    </details>
  );
}
