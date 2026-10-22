import { describe, it, expect } from "vitest";
import type { HrShiftSummary } from "@nexora/contracts";
import {
  evaluateDailyAttendance,
  type AttendanceSource,
  type ShiftWindow,
} from "../../server/api/src/modules/hr/daily-attendance.js";
import { resolveHrShiftOnDate } from "../../server/api/src/modules/hr/shift-resolution.js";
const date = "2026-10-20",
  today = "2026-10-21";
const shift: HrShiftSummary = {
  id: "day",
  company_id: "co",
  code: "DAY",
  name: "Day",
  kind: "fixed",
  status: "active",
  version: 1,
  time_zone: "Asia/Karachi",
  work_location_id: null,
  work_location: null,
  start_minute: 540,
  end_minute: 1020,
  required_work_minutes: 420,
  net_minutes: 420,
  grace_in_minutes: 15,
  grace_out_minutes: 10,
  minimum_present_minutes: 120,
  half_day_minutes: 240,
  overtime_after_minutes: 30,
  weekly_off_days: [0, 6],
  rotation_anchor_date: null,
  configured: true,
  rules_locked: true,
};
const window: ShiftWindow = { start: date + "T04:00:00Z", end: date + "T12:00:00Z", weekday: 2, unpaid_minutes: 60 };
const punch = (direction: "in" | "out", time: string) => ({
  direction,
  occurred_at: date + "T" + time + ":00Z",
  source: "biometric",
});
const base: AttendanceSource = {
  employee_id: "employee",
  employee_number: "E1",
  display_name: "Test Employee",
  department: "Operations",
  placement_count: 1,
  work_location_id: "loc",
  employee_status: "active",
  root_shift_id: "day",
  allocation_scope: "employee",
  punches: [punch("in", "04:00"), punch("out", "12:00")],
  corrections: [],
  leaves: [],
  holidays: [],
  approved_overtime_minutes: 0,
};
const run = (
  extra: Partial<AttendanceSource> = {},
  now = "2026-10-21T12:00:00Z",
  s: HrShiftSummary | null = shift,
  w: ShiftWindow | null = window,
) => evaluateDailyAttendance({ ...base, ...extra }, s, s, w, date, today, new Date(now), true);
describe("Operational attendance evidence", () => {
  it("derives actual work, grace and extra minutes without approving payroll", () => {
    const r = run({ punches: [punch("in", "04:30"), punch("out", "14:00")] });
    expect(r.status).toBe("present");
    expect(r.worked_minutes).toBe(510);
    expect(r.late_minutes).toBe(15);
    expect(r.potential_overtime_minutes).toBe(60);
    expect(r.approved_overtime_minutes).toBe(0);
  });
  it("pairs multiple sessions and does not deduct an unpaid meal twice", () => {
    const r = run({
      punches: [punch("in", "04:00"), punch("out", "07:00"), punch("in", "08:00"), punch("out", "12:00")],
    });
    expect(r.worked_minutes).toBe(420);
    expect(r.status).toBe("present");
  });
  it.each([
    [[], "absent"],
    [[punch("in", "04:00"), punch("out", "07:30")], "half_day"],
    [[punch("in", "04:00")], "needs_review"],
    [[punch("out", "12:00")], "needs_review"],
    [[punch("in", "04:00"), punch("in", "05:00"), punch("out", "12:00")], "needs_review"],
  ] as const)("classifies completed evidence %j", (punches, status) =>
    expect(run({ punches: [...punches] }).status).toBe(status),
  );
  it("keeps upcoming and ongoing shifts out of absence", () => {
    expect(run({ punches: [] }, date + "T03:00:00Z").status).toBe("scheduled");
    expect(run({ punches: [punch("in", "04:00")] }, date + "T06:00:00Z").status).toBe("in_progress");
  });
  it("uses approved correction evidence without changing raw punches", () => {
    const r = run({
      punches: [punch("in", "04:00")],
      corrections: [{ kind: "missing_out", stated_in: null, stated_out: date + "T12:00:00Z" }],
    });
    expect(r.status).toBe("present");
    expect(r.correction_applied).toBe(true);
    expect(r.punches).toHaveLength(1);
  });
  it("shows partial approved day allocations and flags conflicting attendance", () => {
    expect(run({ punches: [], leaves: [{ days: "0.5" }] })).toMatchObject({ status: "needs_review", leave_days: "0.5" });
    expect(run({ punches: [], leaves: [{ days: "0.5" }] }).issues).toContain("Partial leave is missing an explicit half-day allocation.");
    expect(run({ leaves: [{ days: "1" }] }).status).toBe("needs_review");
    expect(run({ punches: [], leaves: [{ days: null }] }).status).toBe("needs_review");
  });
  it("does not treat an optional holiday as a company-wide day off", () => {
    expect(run({ punches: [], holidays: [{ name: "Optional", optional: true }] }).status).toBe("absent");
    expect(run({ punches: [], holidays: [{ name: "Public", optional: false }] }).status).toBe("holiday");
  });
  it("does not silently fall back around location or placement problems", () => {
    expect(run({}, undefined, { ...shift, work_location_id: "other" }).status).toBe("needs_review");
    expect(run({ placement_count: 2 }).status).toBe("needs_review");
    expect(run({}, undefined, null, null).status).toBe("needs_review");
  });
  it("handles overnight timestamps and hides raw evidence without permission", () => {
    const source = {
      ...base,
      punches: [
        { direction: "in" as const, occurred_at: date + "T17:00:00Z", source: "web" },
        { direction: "out" as const, occurred_at: "2026-10-21T01:00:00Z", source: "web" },
      ],
    };
    const r = evaluateDailyAttendance(
      source,
      shift,
      shift,
      { ...window, start: date + "T17:00:00Z", end: "2026-10-21T01:00:00Z" },
      date,
      today,
      new Date("2026-10-21T02:00:00Z"),
      false,
    );
    expect(r.status).toBe("present");
    expect(r.worked_minutes).toBe(420);
    expect(r.punches).toBeNull();
  });
  it("rejects future or excessive source punches", () => {
    expect(run({ punches: [punch("in", "04:00"), punch("out", "12:00")] }, date + "T08:00:00Z").status).toBe(
      "needs_review",
    );
    expect(run({ punches: Array.from({ length: 129 }, () => punch("in", "04:00")) }).status).toBe("needs_review");
  });
  it("shares anchored weekly rotation selection before and after its anchor", () => {
    const root = { ...shift, kind: "rotating" as const, rotation_anchor_date: "2026-10-19" },
      night = { ...shift, id: "night" };
    expect(resolveHrShiftOnDate(root, [shift, night], "2026-10-18")?.id).toBe("night");
    expect(resolveHrShiftOnDate(root, [shift, night], "2026-10-20")?.id).toBe("day");
    expect(resolveHrShiftOnDate(root, [shift, night], "2026-10-26")?.id).toBe("night");
  });
});
