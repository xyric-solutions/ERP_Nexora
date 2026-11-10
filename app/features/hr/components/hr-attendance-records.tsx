"use client";
import { useMemo } from "react";
import type {
  HrAttendanceRecord,
  HrAttendanceRecordStatus,
  HrAttendanceRecordSummary,
  HrAttendanceWorkMode,
} from "@nexora/contracts";
import { Clock3 } from "lucide-react";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { useAttendanceRead } from "./hr-workspace-controls";

/** "13:05" -> "01:05 PM". */
export function clockLabel(time: string | null | undefined) {
  if (!time) return "-";
  const [h, m] = time.split(":").map(Number) as [number, number];
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** 470 -> "7h 50m"; 0 -> "0m". */
export function durationLabel(minutes: number) {
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
export const recordStatusLabels: Readonly<Record<HrAttendanceRecordStatus, string>> = {
  completed: "Completed",
  early_leave: "Early leave",
  half_day: "Half day",
  in_progress: "Checked in",
  missing_check_out: "Missing check-out",
  missing_check_in: "Missing check-in",
};
export const workModeLabels: Readonly<Record<HrAttendanceWorkMode, string>> = { office: "On-site", remote: "Remote" };
const statusText: Readonly<Record<HrAttendanceRecordStatus, string>> = {
  completed: "text-[var(--nx-success-text)]",
  early_leave: "text-[var(--nx-warning)]",
  half_day: "text-[var(--nx-warning)]",
  in_progress: "text-[var(--nx-info)]",
  missing_check_out: "text-destructive",
  missing_check_in: "text-destructive",
};
export function RecordStatus({ status }: { status: HrAttendanceRecordStatus }) {
  return <span className={`font-semibold ${statusText[status]}`}>{recordStatusLabels[status]}</span>;
}

/** Calendar dates from `from` to `to` inclusive, as ISO dates. */
export function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  for (let t = Date.parse(from + "T00:00:00Z"), end = Date.parse(to + "T00:00:00Z"); t <= end; t += 86400000)
    dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
}

const tileTone = {
  neutral: "bg-muted/60 text-foreground",
  success: "bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]",
  warning: "bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]",
  info: "bg-[var(--nx-info-soft)] text-[var(--nx-info)]",
} as const;
export function AttendanceRecordTiles({ summary }: { summary: HrAttendanceRecordSummary }) {
  const tiles: [string, string | number, keyof typeof tileTone][] = [
    ["recorded days", summary.recorded_days, "neutral"],
    ["completed", summary.completed, "success"],
    ["early leave", summary.early_leave, "warning"],
    ["half day", summary.half_day, "warning"],
    ["late", summary.late, "warning"],
    ["remote", summary.remote, "info"],
    ["total time", durationLabel(summary.worked_minutes), "neutral"],
  ];
  return (
    <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7" aria-label="Attendance summary">
      {tiles.map(([name, value, tone]) => (
        <div key={name} className={`grid content-center gap-1 rounded-lg px-3 py-3 text-center ${tileTone[tone]}`}>
          <dd className="m-0 text-xl font-bold tabular-nums">{value}</dd>
          <dt className="text-sm opacity-90">{name}</dt>
        </div>
      ))}
    </dl>
  );
}

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Monday-first calendar of the range: each date shows its check-in and check-out times. */
export function AttendanceRecordCalendar({
  from,
  to,
  today,
  records,
}: {
  from: string;
  to: string;
  today: string;
  records: readonly HrAttendanceRecord[];
}) {
  const byDate = useMemo(() => new Map(records.map((r) => [r.on_date, r])), [records]);
  const dates = datesBetween(from, to);
  const lead = (new Date(from + "T00:00:00Z").getUTCDay() + 6) % 7;
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-3" aria-label="Attendance calendar">
      {weekdays.map((day) => (
        <span
          key={day}
          aria-hidden="true"
          className="py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-sm"
        >
          {day}
        </span>
      ))}
      {Array.from({ length: lead }, (_, i) => (
        <span key={`pad-${i}`} aria-hidden="true" />
      ))}
      {dates.map((date) => {
        const record = byDate.get(date),
          future = date > today;
        return (
          <div
            key={date}
            aria-label={
              record
                ? `${date}: in ${clockLabel(record.check_in_time)}, out ${clockLabel(record.check_out_time)}, ${recordStatusLabels[record.status]}`
                : `${date}: no record`
            }
            className={`grid min-h-16 min-w-0 content-start gap-1 rounded-lg border p-1.5 text-xs sm:min-h-24 sm:p-3 sm:text-sm ${
              future ? "border-border/60 bg-card text-muted-foreground/60" : "border-border bg-muted/40"
            } ${date === today ? "ring-2 ring-primary/40" : ""}`}
          >
            <span className="font-semibold">{Number(date.slice(8))}</span>
            <span className="hidden truncate text-muted-foreground sm:block">{clockLabel(record?.check_in_time)}</span>
            <span className="hidden truncate text-muted-foreground sm:block">{clockLabel(record?.check_out_time)}</span>
            {record && (
              <span
                aria-hidden="true"
                className={`size-2 rounded-full bg-current sm:hidden ${statusText[record.status]}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AttendanceRecordTable({
  records,
  range,
}: {
  records: readonly HrAttendanceRecord[];
  /** Shown after the heading, e.g. "2026-11-01 to 2026-11-10". */
  range?: string;
}) {
  return (
    <section className="grid min-w-0 gap-3" aria-label="Attendance records in this range">
      <h3 className="m-0! flex flex-wrap items-center gap-2 text-base font-semibold">
        <Clock3 className="size-5 text-primary" aria-hidden="true" />
        Attendance records in this range
        {range && <span className="text-sm font-normal text-muted-foreground">· {range}</span>}
      </h3>
      {records.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-200 border-collapse text-left text-sm">
            <thead className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Date", "Check in", "Check out", "Total", "Status", "Arrival", "Mode", "Notes"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.on_date} className="border-b border-border/70 last:border-0">
                  <td className="whitespace-nowrap px-3 py-3 font-semibold">{r.on_date}</td>
                  <td className="whitespace-nowrap px-3 py-3">{clockLabel(r.check_in_time)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{clockLabel(r.check_out_time)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">
                    {r.check_out_time ? durationLabel(r.worked_minutes) : "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <RecordStatus status={r.status} />
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-3 ${r.arrival === "late" ? "text-[var(--nx-warning)]" : r.arrival ? "text-[var(--nx-success-text)]" : ""}`}
                  >
                    {r.arrival === "late" ? "Late" : r.arrival ? "On time" : "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">{r.work_mode ? workModeLabels[r.work_mode] : "-"}</td>
                  <td className="min-w-48 px-3 py-3 text-muted-foreground">{r.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No check-ins were recorded in this range.
        </p>
      )}
    </section>
  );
}

/** Downloads the records as CSV (Excel-compatible). */
export function exportAttendanceRecords(records: readonly HrAttendanceRecord[], fileName: string) {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [
    ["Date", "Check in", "Check out", "Total", "Status", "Arrival", "Mode", "Notes"],
    ...[...records]
      .sort((a, b) => a.on_date.localeCompare(b.on_date))
      .map((r) => [
        r.on_date,
        clockLabel(r.check_in_time),
        clockLabel(r.check_out_time),
        r.check_out_time ? durationLabel(r.worked_minutes) : "",
        recordStatusLabels[r.status],
        r.arrival === "late" ? "Late" : r.arrival ? "On time" : "",
        r.work_mode ? workModeLabels[r.work_mode] : "",
        r.note ?? "",
      ]),
  ];
  const url = URL.createObjectURL(
    new Blob(["﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The companies the signed-in user is linked to as an employee (from Employee Self-service), with the chosen one.
 * `status` is "link_required" when the sign-in has no employee record.
 */
export function useSelfAttendanceCompanies(company: string, today: string) {
  const { api } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]);
  const q = { ...(company ? { company_id: company } : {}), month: today.slice(0, 8) + "01", limit: 1, offset: 0 };
  const read = useAttendanceRead(JSON.stringify(q), () => client.selfService(q));
  return { client, read, workspace: read.data };
}
