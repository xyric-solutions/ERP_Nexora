import { describe, it, expect } from "vitest";
import { closeAttendanceEmployee, attendanceHash } from "../../server/api/src/modules/hr/attendance-completion.js";
import {
  createHrOvertimeRequestSchema,
  hrOvertimeActionRequestSchema,
  hrAttendancePeriodActionRequestSchema,
} from "../../packages/contracts/src/hr/index.js";
import type { HrDailyAttendanceRow } from "../../packages/contracts/src/hr/index.js";
const row = (status: HrDailyAttendanceRow["status"], leave = "0"): HrDailyAttendanceRow => ({
  employee_id: "employee",
  employee_number: "E1",
  display_name: "Employee",
  department: null,
  shift_id: "shift",
  shift_name: "Shift",
  allocation_scope: "employee",
  time_zone: "UTC",
  scheduled_start: "2026-09-01T00:00:00.000Z",
  scheduled_end: "2026-09-01T08:00:00.000Z",
  status,
  first_in: null,
  last_out: null,
  worked_minutes: 0,
  late_minutes: 0,
  potential_overtime_minutes: 0,
  approved_overtime_minutes: 0,
  leave_days: leave,
  correction_applied: false,
  punch_count: 0,
  issues: [],
  punches: null,
});
const source = (leaves: { id: string; days: string; paid: boolean }[] = []) => ({
  employee_id: "employee",
  on_date: "2026-09-01",
  leaves,
  corrections: [],
  overtime: [],
  pending: [],
  punches: [],
  placements: [],
  holidays: [],
});
describe("Attendance close accounting and evidence", () => {
  it.each([
    ["present", "1.0000", "0.0000"],
    ["official_duty", "1.0000", "0.0000"],
    ["off_day", "1.0000", "0.0000"],
    ["holiday", "1.0000", "0.0000"],
    ["half_day", "0.5000", "0.5000"],
    ["absent", "0.0000", "1.0000"],
  ] as const)("balances %s without floating-point monetary arithmetic", (status, paid, unpaid) => {
    const result = closeAttendanceEmployee([{ on_date: "2026-09-01", row: row(status) }], [source()]);
    expect(result.paid_days).toBe(paid);
    expect(result.unpaid_days).toBe(unpaid);
    expect(result.calendar_days).toBe("1.0000");
    expect(result.exception_count).toBe(0);
  });
  it("uses the approved leave type paid flag and exact per-day allocation", () => {
    for (const paid of [true, false]) {
      const result = closeAttendanceEmployee(
        [{ on_date: "2026-09-01", row: row("on_leave", "1") }],
        [source([{ id: "leave", days: "1.0000", paid }])],
      );
      expect(result.paid_days).toBe(paid ? "1.0000" : "0.0000");
      expect(result.unpaid_leave_days).toBe(paid ? "0.0000" : "1.0000");
      expect(result.days[0]?.leave_ids).toEqual(["leave"]);
    }
  });
  it("blocks unreconciled fractional leave and missing per-day evidence", () => {
    const partial = closeAttendanceEmployee(
      [{ on_date: "2026-09-01", row: row("on_leave", "0.5") }],
      [source([{ id: "leave", days: "0.5000", paid: true }])],
    );
    expect(partial.exception_count).toBeGreaterThan(0);
    expect(partial.approved_leave_days).toBe("0.5000");
    const missing = closeAttendanceEmployee([{ on_date: "2026-09-01", row: row("on_leave", "1") }], [source()]);
    expect(missing.days[0]?.issues).toContain("Approved leave and exact daily allocations do not reconcile.");
  });
  it("hashes private source evidence canonically while exposing only payroll input fields", () => {
    expect(attendanceHash({ b: 2, a: 1 })).toBe(attendanceHash({ a: 1, b: 2 }));
    const a = source(),
      b = { ...a, punches: [{ id: "new-device-source" }] };
    const first = closeAttendanceEmployee([{ on_date: "2026-09-01", row: row("present") }], [a]),
      second = closeAttendanceEmployee([{ on_date: "2026-09-01", row: row("present") }], [b]);
    expect(first.source_hash).not.toBe(second.source_hash);
    expect(first).not.toHaveProperty("punches");
  });
  it("requires evidence hashes, explicit lifecycle versions and valid requested minutes", () => {
    expect(
      createHrOvertimeRequestSchema.safeParse({
        company_id: "company",
        employee_id: "employee",
        work_date: "2026-09-01",
        requested_minutes: 0,
        reason: "Controlled evidence request",
      }).success,
    ).toBe(false);
    expect(
      hrAttendancePeriodActionRequestSchema.safeParse({
        company_id: "company",
        month: "2026-09-02",
        action: "lock",
        expected_version: 1,
        reason: "A reviewed period lock",
      }).success,
    ).toBe(false);
    expect(
      hrOvertimeActionRequestSchema.safeParse({
        company_id: "company",
        action: "hr_approve",
        expected_version: 0,
        reason: "Reviewed approval",
      }).success,
    ).toBe(false);
  });
});
