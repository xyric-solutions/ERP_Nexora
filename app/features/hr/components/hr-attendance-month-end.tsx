"use client";

import { ArrowUpRight, ChevronRight } from "lucide-react";
import type { HrAttendanceCloseEmployee, HrAttendancePeriodWorkspace } from "@nexora/contracts";

import { Button } from "@/components/ui/button";

import { attendanceLabel as label, attendanceMinutes as minutes, AttendanceStatusBadge } from "./attendance-status";
import { HrClickableRow } from "./hr-clickable-row";
import { HrDetailGroup, HrDetailTile, HrStatusPill, hrDisplayDate } from "./hr-detail-tile";
import { dayValue } from "./hr-workspace-controls";

type Period = NonNullable<HrAttendancePeriodWorkspace["period"]>;
type Navigate = (module: string, page: string, record?: string) => void;

const periodTone = (state: string) =>
  state === "locked" ? "success" : state === "exceptions" ? "danger" : state === "not_opened" ? "neutral" : "warning";

/** "2026-10-01" -> "October 2026". */
export function attendanceMonthLabel(month: string) {
  const date = new Date(`${month.slice(0, 7)}-01T00:00:00`);
  return Number.isNaN(date.getTime())
    ? month.slice(0, 7)
    : date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export const periodActionLabel = (action: "open" | "process" | "lock") =>
  action === "open" ? "Open period" : action === "process" ? "Process review" : "Lock period";

/**
 * One-line period summary: click it for the period drawer; the period's next
 * workflow action sits on the right.
 */
export function AttendancePeriodBar({
  month,
  period,
  actions,
  busy,
  onOpen,
  onAction,
}: {
  month: string;
  period: Period | null | undefined;
  actions: readonly ("open" | "process" | "lock")[];
  busy: boolean;
  onOpen: () => void;
  onAction: (action: "open" | "process" | "lock") => void;
}) {
  const state = period?.state ?? "not_opened";
  // Opening a period is done from the period drawer (row click), not from the bar.
  const barActions = actions.filter((action) => action !== "open");
  const facts: [string, string][] = [
    ["Employees", String(period?.employee_count ?? 0)],
    ["Exceptions", String(period?.exception_count ?? 0)],
    ["Version", String(period?.version ?? 0)],
    [
      state === "locked" ? "Locked" : "Processed",
      state === "locked"
        ? hrDisplayDate(period?.locked_at ?? "", false) || "—"
        : hrDisplayDate(period?.processed_at ?? "", false) || "Not yet",
    ],
  ];
  return (
    <section
      aria-label="Attendance period"
      className="flex min-w-0 flex-wrap items-stretch overflow-hidden rounded-lg border border-border bg-card shadow-sm"
    >
      <button
        type="button"
        onClick={onOpen}
        className="m-0 flex min-w-0 flex-1 cursor-pointer appearance-none flex-wrap items-center gap-x-6 gap-y-3 border-0 bg-transparent px-4 py-3 text-left font-sans text-sm! text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="grid min-w-0 gap-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Attendance period
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-base font-semibold">{attendanceMonthLabel(month)}</strong>
            <HrStatusPill status={state} tone={periodTone(state)} label={label(state)} />
          </span>
        </span>
        <dl className="m-0! flex flex-wrap gap-x-6 gap-y-1">
          {facts.map(([term, value]) => (
            <div key={term} className="grid min-w-0">
              <dt className="text-xs text-muted-foreground">{term}</dt>
              <dd
                className={`m-0! text-sm font-semibold tabular-nums ${
                  term === "Exceptions" && value !== "0" ? "text-[var(--nx-warning)]" : ""
                }`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {barActions.length ? (
        <div className="flex w-full items-center justify-end gap-2 border-t border-border px-4 py-3 sm:w-auto sm:border-t-0 sm:border-l">
          {barActions.map((action) => (
            <Button
              key={action}
              variant={action === "lock" ? "default" : "outline"}
              className={action === "lock" ? "text-primary-foreground!" : ""}
              disabled={busy}
              onClick={() => onAction(action)}
            >
              {periodActionLabel(action)}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Period drawer body: status and facts. History and the action form are added by the caller. */
export function AttendancePeriodDetails({ month, period }: { month: string; period: Period | null | undefined }) {
  const state = period?.state ?? "not_opened";
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <strong className="text-sm">{attendanceMonthLabel(month)}</strong>
        <HrStatusPill status={state} tone={periodTone(state)} label={label(state)} />
      </div>
      <HrDetailGroup title="Review">
        <HrDetailTile label="Employees" value={String(period?.employee_count ?? 0)} />
        <HrDetailTile label="Exceptions" value={String(period?.exception_count ?? 0)} />
        <HrDetailTile label="Review version" value={String(period?.version ?? 0)} />
        <HrDetailTile label="Processed" value={period?.processed_at ? hrDisplayDate(period.processed_at) : ""} />
        <HrDetailTile label="Locked" value={period?.locked_at ? hrDisplayDate(period.locked_at) : ""} />
        <HrDetailTile label="Payroll" value={state === "locked" ? "Inputs available" : "Available after lock"} />
      </HrDetailGroup>
      {period?.review_hash ? (
        <HrDetailGroup title="Evidence">
          <HrDetailTile label="Reviewed source" value={period.review_hash} mono />
        </HrDetailGroup>
      ) : null}
    </div>
  );
}

const overtimeMinutes = (item: HrAttendanceCloseEmployee) =>
  item.overtime_regular_minutes + item.overtime_weekend_minutes + item.overtime_holiday_minutes;

/** Month-end employees as table rows; each row opens the employee drawer. */
export function AttendanceEmployeeTable({
  items,
  selected,
  onOpen,
}: {
  items: HrAttendanceCloseEmployee[];
  selected: string;
  onOpen: (employeeId: string) => void;
}) {
  const th = "px-4 py-3";
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-200 text-left text-sm">
          <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className={`${th} sm:pl-5`}>Employee</th>
              <th className={`${th} text-right`}>Covered</th>
              <th className={`${th} text-right`}>Paid</th>
              <th className={`${th} text-right`}>Unpaid</th>
              <th className={`${th} text-right`}>Leave</th>
              <th className={`${th} text-right`}>Overtime</th>
              <th className={`${th} text-right`}>Corrections</th>
              <th className={`${th} sm:pr-5`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <HrClickableRow key={item.employee_id} onOpen={() => onOpen(item.employee_id)}>
                <td className={`px-4 py-3 sm:pl-5 ${selected === item.employee_id ? "text-[var(--nx-brand)]" : ""}`}>
                  <span className="block font-medium">{item.display_name}</span>
                  <span className="text-xs text-muted-foreground">{item.employee_number}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{dayValue(item.calendar_days)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{dayValue(item.paid_days)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{dayValue(item.unpaid_days)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{dayValue(item.approved_leave_days)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{minutes(overtimeMinutes(item))}</td>
                <td className="px-4 py-3 text-right tabular-nums">{item.correction_count}</td>
                <td className="px-4 py-3 sm:pr-5">
                  {item.exception_count ? (
                    <HrStatusPill status="exceptions" tone="warning" label={`${item.exception_count} exception(s)`} />
                  ) : (
                    <HrStatusPill status="ready" tone="success" label="Ready" />
                  )}
                </td>
              </HrClickableRow>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Employee month drawer body: totals, then one row per day. */
export function AttendanceEmployeeDetails({
  item,
  company,
  onNavigate,
}: {
  item: HrAttendanceCloseEmployee;
  company: string;
  onNavigate: Navigate;
}) {
  const references = item.days.flatMap((day) => [
    ...day.correction_ids.map((id) => ({ date: day.on_date, kind: "Correction", id, note: "" })),
    ...day.leave_ids.map((id) => ({ date: day.on_date, kind: "Leave", id, note: "" })),
    ...day.overtime.map((o) => ({
      date: day.on_date,
      kind: `${label(o.category)} overtime`,
      id: o.id,
      note: minutes(o.minutes),
    })),
  ]);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="rounded-[5px] border border-border bg-muted px-1.5 py-0.5 font-mono text-[13px] font-semibold">
          {item.employee_number}
        </span>
        {item.exception_count ? (
          <HrStatusPill status="exceptions" tone="warning" label={`${item.exception_count} exception(s)`} />
        ) : (
          <HrStatusPill status="ready" tone="success" label="Ready" />
        )}
      </div>
      <dl className="m-0! grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-muted sm:grid-cols-4">
        {[
          ["Paid days", dayValue(item.paid_days)],
          ["Unpaid days", dayValue(item.unpaid_days)],
          ["Approved leave", dayValue(item.approved_leave_days)],
          ["Overtime", minutes(overtimeMinutes(item))],
        ].map(([term, value], index) => (
          <div
            key={term}
            className={`min-w-0 px-3.5 py-2.5 ${index % 2 ? "border-l border-border" : ""} ${index > 1 ? "border-t border-border sm:border-t-0" : ""} ${index === 2 ? "sm:border-l" : ""}`}
          >
            <dt className="truncate text-[11.5px] text-muted-foreground">{term}</dt>
            <dd className="m-0! mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <HrDetailGroup title="Month">
        <HrDetailTile label="Covered days" value={dayValue(item.calendar_days)} />
        <HrDetailTile label="Present / absent" value={`${dayValue(item.present_days)} / ${dayValue(item.absent_days)}`} />
        <HrDetailTile label="Unpaid leave" value={dayValue(item.unpaid_leave_days)} />
        <HrDetailTile
          label="Overtime split"
          value={`Regular ${minutes(item.overtime_regular_minutes)} · Weekend ${minutes(item.overtime_weekend_minutes)} · Holiday ${minutes(item.overtime_holiday_minutes)}`}
        />
        <HrDetailTile label="Corrections" value={String(item.correction_count)} />
      </HrDetailGroup>
      <section className="grid min-w-0 gap-2" aria-label="Daily trace">
        <h3 className="m-0! flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground after:h-px after:flex-1 after:bg-border">
          Daily trace
        </h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-120 text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Paid / unpaid</th>
                <th className="px-4 py-3 text-right">Worked</th>
                <th className="px-4 py-3 text-right">OT</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {item.days.map((day) => (
                <tr key={day.on_date} className="border-b border-border/70 align-top last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    {hrDisplayDate(day.on_date)}
                    {day.issues.length ? (
                      <ul className="m-0! mt-1 grid list-none gap-0.5 p-0! text-xs whitespace-normal text-[var(--nx-warning)]">
                        {day.issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <AttendanceStatusBadge
                      status={day.status as Parameters<typeof AttendanceStatusBadge>[0]["status"]}
                    />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {dayValue(day.paid_days)} / {dayValue(day.unpaid_days)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{minutes(day.worked_minutes)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {minutes(day.overtime.reduce((n, o) => n + o.minutes, 0))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Open daily attendance for ${day.on_date}`}
                      title="Open daily attendance"
                      onClick={() =>
                        onNavigate(
                          "hr",
                          "daily-attendance",
                          JSON.stringify({ company_id: company, on_date: day.on_date, search: item.employee_number }),
                        )
                      }
                    >
                      <ArrowUpRight className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {references.length ? (
        <HrDetailGroup title="Linked records">
          {references.map((ref) => (
            <HrDetailTile
              key={`${ref.kind}:${ref.id}:${ref.date}`}
              label={`${ref.kind} · ${hrDisplayDate(ref.date)}`}
              value={ref.note ? `${ref.id} · ${ref.note}` : ref.id}
              mono
            />
          ))}
        </HrDetailGroup>
      ) : null}
      <HrDetailGroup title="Evidence">
        <HrDetailTile label="Source hash" value={item.source_hash} mono />
      </HrDetailGroup>
    </div>
  );
}
