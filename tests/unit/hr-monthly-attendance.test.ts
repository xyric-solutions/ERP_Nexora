import { describe, it, expect } from "vitest";
import { summarizeAttendanceMonth } from "../../server/api/src/modules/hr/monthly-attendance.js";
import { evaluateDailyAttendance, type AttendanceSource } from "../../server/api/src/modules/hr/daily-attendance.js";
import type { HrDailyAttendanceRow } from "@nexora/contracts";
const source: AttendanceSource = {
  employee_id: "e",
  employee_number: "E1",
  display_name: "Test Employee",
  department: "Operations",
  placement_count: 1,
  work_location_id: null,
  employee_status: "active",
  root_shift_id: null,
  allocation_scope: null,
  punches: [],
  corrections: [],
  leaves: [],
  holidays: [],
  approved_overtime_minutes: 0,
};
const row = (extra: Partial<HrDailyAttendanceRow> = {}): HrDailyAttendanceRow => ({
  ...evaluateDailyAttendance(
    source,
    null,
    null,
    null,
    "2026-10-20",
    "2026-10-20",
    new Date("2026-10-20T12:00:00Z"),
    false,
  ),
  ...extra,
});
describe("Monthly attendance summaries", () => {
  it("sums fractional approved leave precisely without inventing paid days", () => {
    const result = summarizeAttendanceMonth(
      Array.from({ length: 31 }, (_, i) => ({
        on_date: `2026-10-${String(i + 1).padStart(2, "0")}`,
        row: row({ leave_days: "0.1", status: "on_leave" }),
      })),
    );
    expect(result[0]?.approved_leave_days).toBe("3.1");
    expect(result[0]?.counts.on_leave).toBe(31);
    expect(result[0]).not.toHaveProperty("paid_days");
  });
  it("keeps half days, scheduled days and exceptions separate", () => {
    const result = summarizeAttendanceMonth([
      {
        on_date: "2026-10-02",
        row: row({
          status: "half_day",
          worked_minutes: 180,
          late_minutes: 10,
          correction_applied: true,
          department: "Sales",
        }),
      },
      { on_date: "2026-10-01", row: row({ status: "scheduled", department: "Operations" }) },
      { on_date: "2026-10-03", row: row({ status: "needs_review", issues: ["Missing punch"] }) },
    ])[0]!;
    expect(result.covered_days).toBe(3);
    expect(result.counts.half_day).toBe(1);
    expect(result.counts.present).toBe(0);
    expect(result.counts.absent).toBe(0);
    expect(result.worked_minutes).toBe(180);
    expect(result.late_minutes).toBe(10);
    expect(result.correction_days).toBe(1);
    expect(result.departments).toEqual(["Operations", "Sales"]);
    expect(result.days.map((d) => d.on_date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });
  it("retains no raw punches or private identity data in day summaries", () => {
    const result = summarizeAttendanceMonth([
      {
        on_date: "2026-10-20",
        row: row({ punches: [{ direction: "in", occurred_at: "2026-10-20T04:00:00Z", source: "web" }] }),
      },
    ]);
    expect(result[0]?.days[0]).not.toHaveProperty("punches");
    expect(result[0]?.finalized_input).toBeNull();
    expect(summarizeAttendanceMonth([])).toEqual([]);
  });
});
