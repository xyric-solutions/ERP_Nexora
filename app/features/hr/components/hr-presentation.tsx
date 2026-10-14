import type { ComponentProps, ReactNode } from "react";
import { cn } from "cn";

export type AttendanceTone = "present" | "absent" | "half" | "off" | "holiday" | "leave" | "unpaid" | "duty" | "missing";

const toneClasses: Record<AttendanceTone, string> = {
  present: "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]",
  absent: "border-[var(--nx-danger-border)] bg-[var(--nx-danger-soft)] text-destructive",
  half: "border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]",
  off: "border-[var(--nx-border-strong)] bg-muted text-muted-foreground",
  holiday: "border-[var(--nx-purple-soft)] bg-[var(--nx-purple-soft)] text-[var(--nx-purple)]",
  leave: "border-[var(--nx-brand-line)] bg-[var(--nx-info-soft)] text-primary",
  unpaid: "border-[var(--nx-danger-border)] bg-[var(--nx-danger-soft)] text-destructive",
  duty: "border-[var(--nx-brand-line)] bg-[var(--nx-info-soft)] text-primary",
  missing: "border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]",
};

export function HrAttendanceCell({ tone, children, className, ...props }: { tone: AttendanceTone; children: ReactNode } & ComponentProps<"span">) {
  return <span className={cn("inline-grid size-5 place-items-center rounded border text-xs font-bold", toneClasses[tone], className)} {...props}>{children}</span>;
}

export function HrAttendanceChip({ tone, children, className, ...props }: { tone: AttendanceTone; children: ReactNode } & ComponentProps<"span">) {
  return <span className={cn("inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold", toneClasses[tone], className)} {...props}>{children}</span>;
}

export function HrNotice({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground", className)} role="note">{children}</p>;
}
