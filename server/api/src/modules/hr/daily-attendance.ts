import type { HrDailyAttendanceRow, HrShiftSummary } from "@nexora/contracts";

export type AttendancePunch = { direction: "in" | "out"; occurred_at: string; source: string };
export type AttendanceSource = {
  employee_id: string;
  employee_number: string;
  display_name: string;
  department: string | null;
  placement_count: number;
  work_location_id: string | null;
  employee_status: string;
  root_shift_id: string | null;
  allocation_scope: "employee" | "department" | "branch" | null;
  punches: AttendancePunch[];
  corrections: { kind: string; stated_in: string | null; stated_out: string | null }[];
  leaves: { days: string | null; portion?: string }[];
  holidays: { name: string; optional: boolean }[];
  approved_overtime_minutes: number;
};
export type ShiftWindow = { start: string; end: string; weekday: number; unpaid_minutes: number };

/** Operational daily view only. Payroll settlement remains the locked-period authority. */
export function evaluateDailyAttendance(
  source: AttendanceSource,
  root: HrShiftSummary | null,
  shift: HrShiftSummary | null,
  window: ShiftWindow | null,
  onDate: string,
  today: string,
  now: Date,
  canReadPunches: boolean,
): HrDailyAttendanceRow {
  const issues: string[] = [];
  if (source.placement_count !== 1) issues.push("Multiple operational placements cover this date.");
  if (onDate >= today && !["active", "probation", "confirmed"].includes(source.employee_status))
    issues.push("Employee is not currently operational.");
  if (!root) issues.push("No employee, department or branch shift is assigned.");
  else {
    if (!root.configured || !shift?.configured || !window)
      issues.push("Assigned shift requires complete timezone, duration or rotation rules.");
    if (onDate >= today && root.status !== "active") issues.push("Highest-priority assigned shift is inactive.");
    if (root.work_location_id && root.work_location_id !== source.work_location_id)
      issues.push("Assigned shift does not match the effective work location.");
  }
  const raw = source.punches.slice(0, 128);
  if (source.punches.length > 128) issues.push("More than 128 punches exist; review the source before processing.");
  let punches = [...raw],
    correctionApplied = false,
    official = false;
  const correction = source.corrections[0];
  if (correction) {
    correctionApplied = true;
    if (correction.kind === "official_duty") official = true;
    else if (correction.kind === "incorrect_attendance")
      punches = [
        ...(correction.stated_in
          ? [{ direction: "in" as const, occurred_at: correction.stated_in, source: "approved correction" }]
          : []),
        ...(correction.stated_out
          ? [{ direction: "out" as const, occurred_at: correction.stated_out, source: "approved correction" }]
          : []),
      ];
    else {
      const time = correction.kind === "missing_in" ? correction.stated_in : correction.stated_out;
      if (time)
        punches.push({
          direction: correction.kind === "missing_in" ? "in" : "out",
          occurred_at: time,
          source: "approved correction",
        });
    }
  }
  punches.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  let opened: number | null = null,
    gross = 0,
    first: string | null = null,
    last: string | null = null,
    invalid = false;
  const nowMs = now.getTime(),
    start = window ? Date.parse(window.start) : null,
    end = window ? Date.parse(window.end) : null;
  const leaveDays = source.leaves.reduce((sum, l) => sum + Number(l.days ?? 0), 0);
  const partialLeave =
    leaveDays === 0.5 &&
    source.leaves.length === 1 &&
    ["first_half", "second_half"].includes(source.leaves[0]?.portion ?? "");
  const effectiveStart =
    partialLeave && source.leaves[0]?.portion === "first_half" && start !== null && end !== null
      ? (start + end) / 2
      : start;
  const effectiveEnd =
    partialLeave && source.leaves[0]?.portion === "second_half" && start !== null && end !== null
      ? (start + end) / 2
      : end;
  for (const punch of punches) {
    const at = Date.parse(punch.occurred_at);
    if (!Number.isFinite(at) || at > nowMs) {
      invalid = true;
      continue;
    }
    // Work-date belongs to the shift, including its overnight end and bounded extra work.
    if (start !== null && end !== null && (at < start - 12 * 3600000 || at > end + 12 * 3600000)) invalid = true;
    if (punch.direction === "in") {
      first ??= punch.occurred_at;
      if (opened !== null) invalid = true;
      else opened = at;
    } else {
      if (opened === null || at <= opened) invalid = true;
      else {
        gross += at - opened;
        opened = null;
        last = punch.occurred_at;
      }
    }
  }
  const ongoing = effectiveEnd !== null && nowMs <= effectiveEnd + (shift?.grace_out_minutes ?? 0) * 60000;
  if (opened !== null && !ongoing) invalid = true;
  if (invalid) issues.push("Missing, duplicate, out-of-order or out-of-window punch evidence requires review.");
  if (source.leaves.some((l) => l.days === null)) issues.push("Approved leave is missing its per-day allocation.");
  if (leaveDays > 1) issues.push("Approved leave allocations overlap.");
  if (leaveDays > 0 && leaveDays < 1 && !partialLeave)
    issues.push("Partial leave is missing an explicit half-day allocation.");
  if (leaveDays > 0 && punches.length > 0) {
    const midpoint = start !== null && end !== null ? (start + end) / 2 : null;
    if (
      !partialLeave ||
      midpoint === null ||
      !first ||
      !last ||
      (source.leaves[0]?.portion === "first_half" ? Date.parse(first) < midpoint : Date.parse(last) > midpoint)
    )
      issues.push("Attendance overlaps approved leave; reconcile the day.");
  }
  if (official && leaveDays > 0) issues.push("Official duty overlaps approved leave; reconcile the day.");
  const recordedGaps =
    first && last ? Math.max(0, Math.floor((Date.parse(last) - Date.parse(first) - gross) / 60000)) : 0;
  const worked = Math.max(
    0,
    Math.floor(gross / 60000) -
      Math.max(0, Math.floor((window?.unpaid_minutes ?? 0) * (partialLeave ? 0.5 : 1)) - recordedGaps),
  );
  const late =
    first && effectiveStart !== null && shift?.kind !== "flexible"
      ? Math.max(0, Math.floor((Date.parse(first) - effectiveStart) / 60000) - (shift?.grace_in_minutes ?? 0))
      : 0;
  let status: HrDailyAttendanceRow["status"] = "needs_review";
  if (!issues.length && shift && window && start !== null && end !== null) {
    if (official) status = "official_duty";
    else if (partialLeave) {
      if (effectiveStart !== null && nowMs < effectiveStart && !punches.length) status = "scheduled";
      else if (ongoing) status = "in_progress";
      else if (worked > 0 && worked < Math.ceil((shift.required_work_minutes ?? 0) / 2)) {
        issues.push("Worked minutes do not cover the remaining half-day requirement.");
        status = "needs_review";
      } else status = "partial_leave";
    } else if (leaveDays > 0) status = "on_leave";
    else if (source.holidays.some((h) => !h.optional)) status = "holiday";
    else if (shift.weekly_off_days.includes(window.weekday)) status = "off_day";
    else if (nowMs < start && !punches.length) status = "scheduled";
    else if (ongoing) status = "in_progress";
    else if (worked >= shift.half_day_minutes) status = "present";
    else if (worked >= shift.minimum_present_minutes) status = "half_day";
    else status = "absent";
  }
  return {
    employee_id: source.employee_id,
    employee_number: source.employee_number,
    display_name: source.display_name,
    department: source.department,
    shift_id: shift?.id ?? root?.id ?? null,
    shift_name: shift?.name ?? root?.name ?? null,
    allocation_scope: source.allocation_scope,
    time_zone: shift?.time_zone ?? root?.time_zone ?? null,
    scheduled_start: window?.start ?? null,
    scheduled_end: window?.end ?? null,
    status,
    first_in: first,
    last_out: last,
    worked_minutes: worked,
    late_minutes: late,
    potential_overtime_minutes:
      issues.length || !shift
        ? 0
        : Math.max(0, worked - (shift.required_work_minutes ?? 0) - shift.overtime_after_minutes),
    approved_overtime_minutes: source.approved_overtime_minutes,
    leave_days: String(leaveDays),
    correction_applied: correctionApplied,
    punch_count: source.punches.length,
    issues,
    punches: canReadPunches ? raw : null,
  };
}
