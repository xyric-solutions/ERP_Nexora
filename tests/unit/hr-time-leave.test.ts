import { describe, it, expect } from "vitest";
import { leaveUnits, leaveDecimal } from "../../server/api/src/modules/hr/time-leave.js";
import {
  createHrLeaveRequestSchema,
  createHrLeaveTypeRequestSchema,
  hrLeaveContextQuerySchema,
  hrLeaveBalancePostingRequestSchema,
} from "../../packages/contracts/src/hr/index.js";
import { evaluateDailyAttendance, type AttendanceSource } from "../../server/api/src/modules/hr/daily-attendance.js";
import type { HrShiftSummary } from "../../packages/contracts/src/hr/index.js";
import { closeAttendanceEmployee } from "../../server/api/src/modules/hr/attendance-completion.js";
describe("Exact leave contracts and half-day attendance", () => {
  it("round-trips signed day quantities without binary fraction accumulation", () => {
    expect(leaveUnits("0.0001")).toBe(1);
    expect(leaveUnits("-1.5000")).toBe(-15000);
    expect(leaveDecimal(leaveUnits("0.1000") + leaveUnits("0.2000"))).toBe("0.3000");
    expect(() => leaveUnits("0.12345")).toThrow();
  });
  it("rejects duplicate day allocations, invalid calendars and excessive ranges", () => {
    const input = {
      company_id: "company",
      employee_id: "employee",
      leave_type_id: "annual",
      from_date: "2026-09-01",
      to_date: "2026-09-01",
      document_id: null,
      days: [{ on_date: "2026-09-01", portion: "full" }],
      reason: "Controlled employee leave request with evidence",
      expected_evidence_hash: "a".repeat(64),
    };
    expect(createHrLeaveRequestSchema.safeParse(input).success).toBe(true);
    expect(createHrLeaveRequestSchema.safeParse({ ...input, days: [...input.days, ...input.days] }).success).toBe(
      false,
    );
    expect(
      createHrLeaveRequestSchema.safeParse({ ...input, days: [{ on_date: "2026-09-02", portion: "full" }] }).success,
    ).toBe(false);
    expect(
      hrLeaveContextQuerySchema.safeParse({ company_id: "company", from_date: "2026-01-01", to_date: "2026-12-31" })
        .success,
    ).toBe(false);
  });
  it("requires evidence and correctly signed non-zero posting quantities", () => {
    const input = {
      company_id: "company",
      employee_id: "employee",
      leave_type_id: "annual",
      effective_on: "2026-09-01",
      kind: "adjustment",
      days: "0",
      period_start: null,
      period_end: null,
      expected_balance_hash: "a".repeat(64),
      reason: "Controlled leave ledger adjustment evidence",
    };
    expect(hrLeaveBalancePostingRequestSchema.safeParse(input).success).toBe(false);
    expect(hrLeaveBalancePostingRequestSchema.safeParse({ ...input, days: "-0.5" }).success).toBe(true);
  });
  it("does not configure unpaid leave as a paid entitlement or skip mandatory HR approval", () => {
    const input = {
      company_id: "company",
      code: "UNPAID",
      name: "Unpaid leave",
      paid: false,
      reason: "Controlled unpaid leave configuration evidence",
      policy: {
        effective_from: "2026-09-01",
        annual_entitlement_days: "1",
        accrual_method: "annual_grant",
        carry_forward: false,
        maximum_carry_forward_days: "0",
        maximum_balance_days: "0",
        minimum_request_days: "0.5",
        maximum_request_days: "30",
        requires_hr_approval: false,
        applicable_category_ids: [],
        applicable_genders: [],
        document_required_after_days: null,
      },
    };
    expect(createHrLeaveTypeRequestSchema.safeParse(input).success).toBe(false);
    expect(
      createHrLeaveTypeRequestSchema.safeParse({
        ...input,
        policy: { ...input.policy, annual_entitlement_days: "0", requires_hr_approval: true },
      }).success,
    ).toBe(true);
  });
  const shift = {
    id: "shift",
    name: "Shift",
    configured: true,
    status: "active",
    work_location_id: null,
    kind: "fixed",
    required_work_minutes: 420,
    start_minute: 0,
    end_minute: 480,
    weekly_off_days: [],
    grace_in_minutes: 0,
    grace_out_minutes: 0,
    minimum_present_minutes: 120,
    half_day_minutes: 240,
    overtime_after_minutes: 30,
    time_zone: "UTC",
  } as HrShiftSummary;
  const source: AttendanceSource = {
    employee_id: "employee",
    employee_number: "E1",
    display_name: "Employee",
    department: null,
    placement_count: 1,
    work_location_id: null,
    employee_status: "active",
    root_shift_id: "shift",
    allocation_scope: "employee",
    punches: [
      { direction: "in", occurred_at: "2026-09-01T04:00:00.000Z", source: "web" },
      { direction: "out", occurred_at: "2026-09-01T08:00:00.000Z", source: "web" },
    ],
    leaves: [{ days: "0.5", portion: "first_half" }],
    corrections: [],
    holidays: [],
    approved_overtime_minutes: 0,
  };
  const evaluate = (s = source) =>
    evaluateDailyAttendance(
      s,
      shift,
      shift,
      { start: "2026-09-01T00:00:00.000Z", end: "2026-09-01T08:00:00.000Z", weekday: 2, unpaid_minutes: 60 },
      "2026-09-01",
      "2026-09-02",
      new Date("2026-09-02T12:00:00Z"),
      false,
    );
  it("prorates the scheduled break and reconciles an explicitly non-overlapping half-day", () => {
    const row = evaluate();
    expect(row.status).toBe("partial_leave");
    expect(row.worked_minutes).toBe(210);
    expect(row.late_minutes).toBe(0);
    expect(row.issues).toEqual([]);
  });
  it("blocks overlapping punches and legacy fractional leave without a portion", () => {
    expect(evaluate({ ...source, leaves: [{ days: "0.5", portion: "second_half" }] }).status).toBe("needs_review");
    expect(evaluate({ ...source, leaves: [{ days: "0.5" }] }).status).toBe("needs_review");
  });
  it("balances unpaid half-leave with the worked half in finalized attendance inputs", () => {
    const row = evaluate();
    const result = closeAttendanceEmployee(
      [{ on_date: "2026-09-01", row }],
      [
        {
          employee_id: "employee",
          on_date: "2026-09-01",
          leaves: [{ id: "leave", days: "0.5000", paid: false }],
          corrections: [],
          overtime: [],
          pending: [],
          punches: [],
          placements: [],
          holidays: [],
        },
      ],
    );
    expect(result.paid_days).toBe("0.5000");
    expect(result.unpaid_days).toBe("0.5000");
    expect(result.unpaid_leave_days).toBe("0.5000");
    expect(result.exception_count).toBe(0);
  });
});
