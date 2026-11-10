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
    <div className="grid min-w-0 content-start gap-2 text-sm font-medium">
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
/** Workflow history as a vertical timeline: action, when, who and the recorded reason. */
export function History({ items, title = "History" }: { items: HrOvertimeDetail["history"]; title?: string }) {
  return (
    <section aria-label={title} className="grid min-w-0 gap-3">
      <h3 className="m-0! flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground after:h-px after:flex-1 after:bg-border">
        {title}
        <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold tracking-normal tabular-nums">
          {items.length}
        </span>
      </h3>
      {items.length ? (
        <ol className="m-0! grid list-none p-0!">
          {items.map((h, i) => (
            <li key={i} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
              <span aria-hidden className="relative flex justify-center">
                <span className="z-10 mt-1 size-2.5 rounded-full border-2 border-primary bg-card" />
                {i < items.length - 1 ? <span className="absolute top-4 -bottom-4 w-px bg-border" /> : null}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <strong className="text-sm font-semibold">{label(h.action)}</strong>
                  <time dateTime={h.occurred_at} className="text-xs text-muted-foreground tabular-nums">
                    {new Date(h.occurred_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p className="m-0! text-xs text-muted-foreground">{h.actor_name}</p>
                {h.reason ? (
                  <p className="m-0! mt-1.5 rounded-md bg-muted px-2.5 py-1.5 text-[13px] break-words">{h.reason}</p>
                ) : null}
                {h.override_event_id ? (
                  <span className="mt-1 inline-block text-xs font-medium text-[var(--nx-warning)]">
                    Audited administrator override
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0! text-sm text-muted-foreground">No activity recorded yet.</p>
      )}
    </section>
  );
}
