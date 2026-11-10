import { describe, expect, it } from "vitest";
import {
  evaluateAttendanceRecord,
  summarizeAttendanceRecords,
  type AttendancePunchRow,
} from "../../server/api/src/modules/hr/self-attendance.js";
import {
  createHrSelfAttendancePunchSchema,
  hrSelfAttendanceQuerySchema,
} from "../../packages/contracts/src/hr/index.js";
import { attendanceLeaveWorkspace } from "../../app/features/hr/model/time-workspace-navigation.js";

const punch = (direction: "in" | "out", time: string, extra: Partial<AttendancePunchRow> = {}): AttendancePunchRow => ({
  on_date: "2026-11-05",
  direction,
  occurred_at: `2026-11-05T${time}:00Z`,
  local_time: time,
  work_mode: "office",
  note: null,
  ...extra,
});

describe("Self-service check-in records", () => {
  it("classifies 7h+ as completed, 4h-7h as early leave and under 4h as half day", () => {
    const at = (out: string) =>
      evaluateAttendanceRecord("2026-11-05", [punch("in", "09:58"), punch("out", out)], "2026-11-10");
    expect(at("17:46")).toMatchObject({ status: "completed", worked_minutes: 468, arrival: "on_time" });
    expect(at("16:58")).toMatchObject({ status: "completed", worked_minutes: 420 });
    expect(at("16:57")).toMatchObject({ status: "early_leave", worked_minutes: 419 });
    expect(at("13:58")).toMatchObject({ status: "early_leave", worked_minutes: 240 });
    expect(at("13:57")).toMatchObject({ status: "half_day", worked_minutes: 239 });
  });

  it("marks a check-in after 11:00 as late and keeps the check-in work mode and notes", () => {
    const record = evaluateAttendanceRecord(
      "2026-11-05",
      [
        punch("in", "11:01", { work_mode: "remote", note: "Power outage" }),
        punch("out", "19:00", { note: "will complete remaining hour from home." }),
      ],
      "2026-11-10",
    );
    expect(record).toMatchObject({
      arrival: "late",
      work_mode: "remote",
      check_in_time: "11:01",
      check_out_time: "19:00",
      note: "Power outage · will complete remaining hour from home.",
    });
    expect(evaluateAttendanceRecord("2026-11-05", [punch("in", "11:00")], "2026-11-10").arrival).toBe("on_time");
  });

  it("distinguishes an open day today from a missing check-out on a past day", () => {
    expect(evaluateAttendanceRecord("2026-11-10", [punch("in", "09:00")], "2026-11-10").status).toBe("in_progress");
    expect(evaluateAttendanceRecord("2026-11-05", [punch("in", "09:00")], "2026-11-10").status).toBe(
      "missing_check_out",
    );
    expect(evaluateAttendanceRecord("2026-11-05", [punch("out", "17:00")], "2026-11-10")).toMatchObject({
      status: "missing_check_in",
      arrival: null,
      worked_minutes: 0,
    });
  });

  it("summarizes the range", () => {
    const records = [
      evaluateAttendanceRecord("2026-11-02", [punch("in", "09:55"), punch("out", "17:02")], "2026-11-10"),
      evaluateAttendanceRecord(
        "2026-11-03",
        [punch("in", "11:30", { work_mode: "remote" }), punch("out", "17:00")],
        "2026-11-10",
      ),
    ];
    expect(summarizeAttendanceRecords(records)).toEqual({
      recorded_days: 2,
      completed: 1,
      early_leave: 1,
      half_day: 0,
      late: 1,
      remote: 1,
      worked_minutes: 427 + 330,
    });
  });

  it("validates punch requests and bounded ranges", () => {
    expect(
      createHrSelfAttendancePunchSchema.safeParse({
        company_id: "c1",
        direction: "in",
        time: "09:00",
        work_mode: "office",
      }).success,
    ).toBe(true);
    expect(
      createHrSelfAttendancePunchSchema.safeParse({
        company_id: "c1",
        direction: "in",
        time: "9am",
        work_mode: "office",
      }).success,
    ).toBe(false);
    expect(
      createHrSelfAttendancePunchSchema.safeParse({ company_id: "c1", direction: "out", work_mode: "home" }).success,
    ).toBe(false);
    expect(
      hrSelfAttendanceQuerySchema.safeParse({ company_id: "c1", from: "2026-11-10", to: "2026-11-01" }).success,
    ).toBe(false);
    expect(
      hrSelfAttendanceQuerySchema.safeParse({ company_id: "c1", from: "2026-01-01", to: "2026-11-01" }).success,
    ).toBe(false);
    expect(
      hrSelfAttendanceQuerySchema.safeParse({ company_id: "c1", from: "2026-11-01", to: "2026-11-10" }).success,
    ).toBe(true);
  });
});

describe("Attendance & Leave navigation", () => {
  it("orders the sections and puts Check In / Out first under Daily Attendance", () => {
    expect(attendanceLeaveWorkspace.groups.map((g) => g.label)).toEqual([
      "Daily Attendance",
      "Leave Setup",
      "Shift Setup",
      "Month-end & Payroll",
    ]);
    expect(attendanceLeaveWorkspace.groups[0].pages.map((p) => p.label)).toEqual([
      "Check In / Out",
      "Attendance",
      "Corrections",
      "Overtime",
    ]);
    expect(attendanceLeaveWorkspace.groups[3].pages.map((p) => p.id)).toContain("my-attendance");
  });
});
