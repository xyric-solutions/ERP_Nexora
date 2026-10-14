/**
 * Phase 2 - attendance, shift and leave foundation for the isolated Nexora
 * UI/UX prototype.
 *
 * Phase 1 supplies the employee, organisation, master, approval and audit
 * shapes; nothing here redefines them. This module adds the time layer, and
 * its central idea is the one the brief asks for:
 *
 *     raw punches are evidence, daily attendance is a conclusion.
 *
 * Raw punches are never edited. Daily attendance is *derived* from the punches,
 * the shift in force on that date, the calendar, approved leave and approved
 * corrections - by a pure function, every time it is shown. That is why a
 * correction changes what the day says without anyone rewriting the device
 * record, and why a locked period can be re-derived and still produce the same
 * answer.
 *
 * Shift assignments use the same effective-dated pattern as Phase 1
 * assignments: an employee's shift on a date is resolved, never stored on the
 * employee, so shift history cannot be overwritten.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

import { employedStatuses, employees, HR_TODAY, type Employee } from "./hr-core-data.ts";

/* ------------------------------------------------------------------ */
/* Time helpers - minutes since midnight, so night shifts work         */
/* ------------------------------------------------------------------ */

/** "09:00" -> 540. A shift that ends "next day" is expressed as > 1440. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function toTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

export function formatHours(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const total = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** 0 = Sunday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function datesInMonth(month: string): readonly string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export function weekdayName(date: string): string {
  return weekdayNames[weekdayOf(date)];
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${monthNames[monthNumber - 1]} ${year}`;
}

export function displayDate(date: string): string {
  const short = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [year, month, day] = date.split("-");
  return `${day} ${short[Number(month) - 1]} ${year}`;
}

/* ------------------------------------------------------------------ */
/* Shifts                                                              */
/* ------------------------------------------------------------------ */

export type ShiftKind = "Fixed" | "Multiple" | "Night" | "Rotating" | "Flexible";

export interface ShiftBreak {
  id: string;
  label: string;
  minutes: number;
  paid: boolean;
}

/**
 * Every threshold is configuration. Nothing in the processing engine knows
 * that 09:00 or fifteen minutes is special; it reads these numbers.
 */
export interface Shift {
  id: string;
  code: string;
  name: string;
  kind: ShiftKind;
  /** Minutes since midnight. End may exceed 1440 for a night shift. */
  startMinutes: number;
  endMinutes: number;
  /** Late is only late after this. */
  graceInMinutes: number;
  /** Leaving before the shift ends by more than this is an early departure. */
  graceOutMinutes: number;
  breaks: readonly ShiftBreak[];
  /** Below this worked time the day is a half day. */
  halfDayMinutes: number;
  /** Below this the day counts as absent even with punches. */
  minimumPresentMinutes: number;
  /** Overtime starts only after the shift plus this buffer. */
  overtimeAfterMinutes: number;
  /** 0 = Sunday. The days this shift does not work. */
  weeklyOffDays: readonly number[];
  /** Rotating shifts cycle through these shift ids, one per week. */
  rotationShiftIds?: readonly string[];
  /** A flexible shift only requires the hours, not the start time. */
  flexible: boolean;
  status: "Active" | "Inactive";
}

export const shifts: readonly Shift[] = [
  {
    id: "SHF-GEN", code: "GEN", name: "General 09:00–17:00", kind: "Fixed",
    startMinutes: toMinutes("09:00"), endMinutes: toMinutes("17:00"),
    graceInMinutes: 15, graceOutMinutes: 10,
    breaks: [{ id: "BRK-1", label: "Lunch", minutes: 60, paid: false }],
    halfDayMinutes: 240, minimumPresentMinutes: 120, overtimeAfterMinutes: 30,
    weeklyOffDays: [0, 6], flexible: false, status: "Active",
  },
  {
    id: "SHF-EARLY", code: "EARLY", name: "Early 07:00–15:00", kind: "Multiple",
    startMinutes: toMinutes("07:00"), endMinutes: toMinutes("15:00"),
    graceInMinutes: 10, graceOutMinutes: 10,
    breaks: [{ id: "BRK-2", label: "Break", minutes: 45, paid: false }],
    halfDayMinutes: 240, minimumPresentMinutes: 120, overtimeAfterMinutes: 30,
    weeklyOffDays: [0, 6], flexible: false, status: "Active",
  },
  {
    id: "SHF-LATE", code: "LATE", name: "Late 13:00–21:00", kind: "Multiple",
    startMinutes: toMinutes("13:00"), endMinutes: toMinutes("21:00"),
    graceInMinutes: 15, graceOutMinutes: 10,
    breaks: [{ id: "BRK-3", label: "Break", minutes: 45, paid: false }],
    halfDayMinutes: 240, minimumPresentMinutes: 120, overtimeAfterMinutes: 30,
    weeklyOffDays: [0, 6], flexible: false, status: "Active",
  },
  {
    id: "SHF-NIGHT", code: "NIGHT", name: "Night 22:00–06:00", kind: "Night",
    // 22:00 to 06:00 the following morning: the end is expressed past midnight
    // so every duration calculation stays ordinary subtraction.
    startMinutes: toMinutes("22:00"), endMinutes: toMinutes("22:00") + 8 * 60,
    graceInMinutes: 15, graceOutMinutes: 15,
    breaks: [{ id: "BRK-4", label: "Night break", minutes: 45, paid: true }],
    halfDayMinutes: 240, minimumPresentMinutes: 120, overtimeAfterMinutes: 30,
    weeklyOffDays: [0], flexible: false, status: "Active",
  },
  {
    id: "SHF-FLEX", code: "FLEX", name: "Flexible 8 hours", kind: "Flexible",
    startMinutes: toMinutes("08:00"), endMinutes: toMinutes("20:00"),
    graceInMinutes: 240, graceOutMinutes: 240,
    breaks: [{ id: "BRK-5", label: "Break", minutes: 45, paid: false }],
    halfDayMinutes: 240, minimumPresentMinutes: 120, overtimeAfterMinutes: 60,
    weeklyOffDays: [0, 6], flexible: true, status: "Active",
  },
  {
    id: "SHF-ROT", code: "ROT", name: "Rotating support", kind: "Rotating",
    startMinutes: toMinutes("07:00"), endMinutes: toMinutes("15:00"),
    graceInMinutes: 10, graceOutMinutes: 10,
    breaks: [{ id: "BRK-6", label: "Break", minutes: 45, paid: false }],
    halfDayMinutes: 240, minimumPresentMinutes: 120, overtimeAfterMinutes: 30,
    weeklyOffDays: [0], rotationShiftIds: ["SHF-EARLY", "SHF-LATE", "SHF-NIGHT"],
    flexible: false, status: "Active",
  },
];

export function shift(id: string): Shift | undefined {
  return shifts.find((row) => row.id === id);
}

/** Working minutes the shift expects, net of unpaid breaks. */
export function shiftWorkingMinutes(row: Shift): number {
  const unpaidBreak = row.breaks.filter((item) => !item.paid).reduce((total, item) => total + item.minutes, 0);
  return row.endMinutes - row.startMinutes - unpaidBreak;
}

/* ------------------------------------------------------------------ */
/* Shift assignment - employee, department or branch, effective-dated  */
/* ------------------------------------------------------------------ */

export type ShiftScope = "Employee" | "Department" | "Branch";

export interface ShiftAssignment {
  id: string;
  scope: ShiftScope;
  /** Employee id, department org unit id or branch org unit id. */
  scopeId: string;
  shiftId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  assignedBy: string;
  note: string;
}

export const shiftAssignments: readonly ShiftAssignment[] = [
  { id: "SAS-001", scope: "Branch", scopeId: "ORG-BR-001", shiftId: "SHF-GEN", effectiveFrom: "2021-01-01", effectiveTo: null, assignedBy: "Sana Iqbal", note: "Head office default" },
  { id: "SAS-002", scope: "Branch", scopeId: "ORG-BR-002", shiftId: "SHF-GEN", effectiveFrom: "2022-03-14", effectiveTo: null, assignedBy: "Sana Iqbal", note: "Delivery centre default" },
  { id: "SAS-003", scope: "Department", scopeId: "ORG-DP-004", shiftId: "SHF-EARLY", effectiveFrom: "2024-01-01", effectiveTo: null, assignedBy: "Sana Iqbal", note: "Service operations start early" },
  { id: "SAS-004", scope: "Employee", scopeId: "EMP-3", shiftId: "SHF-FLEX", effectiveFrom: "2025-01-01", effectiveTo: null, assignedBy: "Sana Iqbal", note: "Flexible hours agreed on promotion" },
  { id: "SAS-005", scope: "Employee", scopeId: "EMP-7", shiftId: "SHF-GEN", effectiveFrom: "2026-07-01", effectiveTo: "2026-08-31", assignedBy: "Sana Iqbal", note: "Induction on general shift" },
  { id: "SAS-006", scope: "Employee", scopeId: "EMP-7", shiftId: "SHF-LATE", effectiveFrom: "2026-09-01", effectiveTo: null, assignedBy: "Bilal Khan", note: "Moved to late shift for client cover" },
];

/**
 * The shift in force for an employee on a date.
 *
 * Specificity decides, then recency: an employee assignment beats a department
 * one, which beats a branch one. Anything else would mean a company-wide
 * default silently overriding an agreement made with one person.
 */
export function shiftAssignmentFor(
  employeeId: string,
  date: string,
  assignment: { branchId: string; departmentId: string } | undefined,
): ShiftAssignment | undefined {
  const applies = (row: ShiftAssignment) =>
    row.effectiveFrom <= date && (row.effectiveTo === null || row.effectiveTo >= date);

  const byScope = (scope: ShiftScope, scopeId: string | undefined) =>
    scopeId === undefined
      ? undefined
      : shiftAssignments
          .filter((row) => row.scope === scope && row.scopeId === scopeId && applies(row))
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];

  return (
    byScope("Employee", employeeId)
    ?? byScope("Department", assignment?.departmentId)
    ?? byScope("Branch", assignment?.branchId)
  );
}

/**
 * A rotating shift cycles through its rotation, one shift per ISO week, so the
 * same employee is on a different pattern each week without a new assignment.
 */
export function effectiveShift(base: Shift, date: string): Shift {
  if (base.kind !== "Rotating" || !base.rotationShiftIds?.length) return base;
  const epoch = Date.UTC(2026, 0, 5); // a Monday
  const weeks = Math.floor((Date.parse(`${date}T00:00:00Z`) - epoch) / (7 * 24 * 60 * 60 * 1000));
  const index = ((weeks % base.rotationShiftIds.length) + base.rotationShiftIds.length) % base.rotationShiftIds.length;
  return shift(base.rotationShiftIds[index]) ?? base;
}

/* ------------------------------------------------------------------ */
/* Calendar - holidays and weekly offs                                 */
/* ------------------------------------------------------------------ */

export interface Holiday {
  id: string;
  date: string;
  name: string;
  /** Empty means the whole company. */
  branchIds: readonly string[];
  optional: boolean;
}

export const holidays: readonly Holiday[] = [
  { id: "HOL-001", date: "2026-09-07", name: "Defence Day", branchIds: [], optional: false },
  { id: "HOL-002", date: "2026-09-11", name: "Founder's Day", branchIds: [], optional: false },
  { id: "HOL-003", date: "2026-09-25", name: "Lahore Foundation Day", branchIds: ["ORG-BR-002"], optional: true },
];

export function holidayOn(date: string, branchId: string | undefined): Holiday | undefined {
  return holidays.find(
    (row) => row.date === date && (row.branchIds.length === 0 || (branchId !== undefined && row.branchIds.includes(branchId))),
  );
}

/* ------------------------------------------------------------------ */
/* Raw punches - evidence, never edited                                */
/* ------------------------------------------------------------------ */

export type PunchDirection = "IN" | "OUT";
export type PunchSource = "Biometric" | "Mobile" | "Web" | "Imported";

export interface RawPunch {
  id: string;
  employeeId: string;
  /** The business date the punch belongs to; a night shift's OUT belongs to the date it started. */
  date: string;
  time: string;
  direction: PunchDirection;
  source: PunchSource;
  deviceId: string;
  /** Raw punches are never edited, so this is a fact about the device, not a status. */
  captured: string;
}

/**
 * Explicit punches for the days that carry a story: a late arrival, a missing
 * OUT, an overtime evening, an absence. The remaining working days are
 * generated deterministically below, so a full month exists without a
 * thousand-line fixture.
 */
const authoredPunches: readonly RawPunch[] = [
  { id: "PCH-001", employeeId: "EMP-2", date: "2026-09-02", time: "09:42", direction: "IN", source: "Biometric", deviceId: "ISB-DOOR-1", captured: "2026-09-02T09:42:11Z" },
  { id: "PCH-002", employeeId: "EMP-2", date: "2026-09-02", time: "17:20", direction: "OUT", source: "Biometric", deviceId: "ISB-DOOR-1", captured: "2026-09-02T17:20:04Z" },
  { id: "PCH-003", employeeId: "EMP-2", date: "2026-09-08", time: "08:56", direction: "IN", source: "Biometric", deviceId: "ISB-DOOR-1", captured: "2026-09-08T08:56:31Z" },
  // No OUT on 08 September: the classic missing-punch day.
  { id: "PCH-004", employeeId: "EMP-2", date: "2026-09-10", time: "08:51", direction: "IN", source: "Biometric", deviceId: "ISB-DOOR-1", captured: "2026-09-10T08:51:02Z" },
  { id: "PCH-005", employeeId: "EMP-2", date: "2026-09-10", time: "20:38", direction: "OUT", source: "Biometric", deviceId: "ISB-DOOR-1", captured: "2026-09-10T20:38:55Z" },
  { id: "PCH-006", employeeId: "EMP-2", date: "2026-09-15", time: "08:58", direction: "IN", source: "Biometric", deviceId: "ISB-DOOR-1", captured: "2026-09-15T08:58:40Z" },
  { id: "PCH-007", employeeId: "EMP-2", date: "2026-09-15", time: "13:05", direction: "OUT", source: "Biometric", deviceId: "ISB-DOOR-1", captured: "2026-09-15T13:05:12Z" },

  { id: "PCH-010", employeeId: "EMP-4", date: "2026-09-03", time: "09:31", direction: "IN", source: "Mobile", deviceId: "MOB-IOS-22", captured: "2026-09-03T09:31:09Z" },
  { id: "PCH-011", employeeId: "EMP-4", date: "2026-09-03", time: "17:06", direction: "OUT", source: "Mobile", deviceId: "MOB-IOS-22", captured: "2026-09-03T17:06:44Z" },
  { id: "PCH-012", employeeId: "EMP-4", date: "2026-09-17", time: "09:02", direction: "IN", source: "Biometric", deviceId: "ISB-DOOR-1", captured: "2026-09-17T09:02:18Z" },
  { id: "PCH-013", employeeId: "EMP-4", date: "2026-09-17", time: "19:44", direction: "OUT", source: "Biometric", deviceId: "ISB-DOOR-1", captured: "2026-09-17T19:44:02Z" },

  // A genuine Saturday call-out: weekend overtime with an approval behind it.
  { id: "PCH-014", employeeId: "EMP-4", date: "2026-09-12", time: "10:02", direction: "IN", source: "Biometric", deviceId: "ISB-DOOR-1", captured: "2026-09-12T10:02:31Z" },
  { id: "PCH-015", employeeId: "EMP-4", date: "2026-09-12", time: "15:48", direction: "OUT", source: "Biometric", deviceId: "ISB-DOOR-1", captured: "2026-09-12T15:48:19Z" },

  { id: "PCH-020", employeeId: "EMP-7", date: "2026-09-02", time: "13:08", direction: "IN", source: "Biometric", deviceId: "ISB-DOOR-2", captured: "2026-09-02T13:08:21Z" },
  { id: "PCH-021", employeeId: "EMP-7", date: "2026-09-02", time: "21:14", direction: "OUT", source: "Biometric", deviceId: "ISB-DOOR-2", captured: "2026-09-02T21:14:37Z" },
  { id: "PCH-022", employeeId: "EMP-7", date: "2026-09-16", time: "13:34", direction: "IN", source: "Biometric", deviceId: "ISB-DOOR-2", captured: "2026-09-16T13:34:55Z" },
  { id: "PCH-023", employeeId: "EMP-7", date: "2026-09-16", time: "21:02", direction: "OUT", source: "Biometric", deviceId: "ISB-DOOR-2", captured: "2026-09-16T21:02:13Z" },
];

/** Days with no punches at all, so the engine has genuine absences to find. */
const absentDays: readonly { employeeId: string; date: string }[] = [
  { employeeId: "EMP-2", date: "2026-09-04" },
  { employeeId: "EMP-5", date: "2026-09-09" },
];

/**
 * A deterministic, seeded variation so ordinary days are not all identical.
 * Derived from the employee and the date, so the same day always produces the
 * same punch - a prototype that changes its own history on reload is useless
 * for review.
 */
function seededOffset(employeeId: string, date: string, spread: number): number {
  let hash = 7;
  for (const character of `${employeeId}:${date}`) {
    hash = (hash * 31 + character.charCodeAt(0)) % 100003;
  }
  return (hash % (spread * 2 + 1)) - spread;
}

/** Punches actually recorded for this employee and date, authored as fixtures. */
export function authoredPunchesFor(employeeId: string, date: string): readonly RawPunch[] {
  return authoredPunches.filter((row) => row.employeeId === employeeId && row.date === date);
}

/**
 * Punches for an ordinary working day. Non-working days are deliberately not
 * generated: a generated punch on a public holiday would invent a day of
 * holiday overtime that nobody worked.
 */
export function punchesFor(employeeId: string, date: string, workingShift: Shift): readonly RawPunch[] {
  const authored = authoredPunchesFor(employeeId, date);
  if (authored.length > 0) return authored;
  if (absentDays.some((row) => row.employeeId === employeeId && row.date === date)) return [];

  const inMinutes = workingShift.startMinutes + seededOffset(employeeId, date, 12);
  const outMinutes = workingShift.endMinutes + seededOffset(employeeId, `${date}-out`, 18);
  return [
    { id: `GEN-${employeeId}-${date}-IN`, employeeId, date, time: toTime(inMinutes), direction: "IN", source: "Biometric", deviceId: "AUTO", captured: `${date}T00:00:00Z` },
    { id: `GEN-${employeeId}-${date}-OUT`, employeeId, date, time: toTime(outMinutes), direction: "OUT", source: "Biometric", deviceId: "AUTO", captured: `${date}T00:00:00Z` },
  ];
}

export const rawPunches: readonly RawPunch[] = authoredPunches;

/* ------------------------------------------------------------------ */
/* Leave                                                               */
/* ------------------------------------------------------------------ */

export type AccrualMethod = "Annual grant" | "Monthly accrual" | "On completion";

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  paid: boolean;
  annualEntitlementDays: number;
  accrual: AccrualMethod;
  carryForward: boolean;
  maximumCarryForwardDays: number;
  maximumBalanceDays: number;
  minimumRequestDays: number;
  maximumRequestDays: number;
  requiresHrApproval: boolean;
  /** Empty means every category. */
  applicableCategoryIds: readonly string[];
  /** Empty means every gender; used only where the law requires it. */
  applicableGenders: readonly string[];
  documentRequiredAfterDays: number | null;
  status: "Active" | "Inactive";
}

export const leaveTypes: readonly LeaveType[] = [
  { id: "LVT-ANN", code: "ANN", name: "Annual Leave", paid: true, annualEntitlementDays: 20, accrual: "Monthly accrual", carryForward: true, maximumCarryForwardDays: 10, maximumBalanceDays: 30, minimumRequestDays: 0.5, maximumRequestDays: 15, requiresHrApproval: false, applicableCategoryIds: [], applicableGenders: [], documentRequiredAfterDays: null, status: "Active" },
  { id: "LVT-SCK", code: "SCK", name: "Sick Leave", paid: true, annualEntitlementDays: 10, accrual: "Annual grant", carryForward: false, maximumCarryForwardDays: 0, maximumBalanceDays: 10, minimumRequestDays: 0.5, maximumRequestDays: 10, requiresHrApproval: false, applicableCategoryIds: [], applicableGenders: [], documentRequiredAfterDays: 2, status: "Active" },
  { id: "LVT-CAS", code: "CAS", name: "Casual Leave", paid: true, annualEntitlementDays: 10, accrual: "Annual grant", carryForward: false, maximumCarryForwardDays: 0, maximumBalanceDays: 10, minimumRequestDays: 0.5, maximumRequestDays: 3, requiresHrApproval: false, applicableCategoryIds: [], applicableGenders: [], documentRequiredAfterDays: null, status: "Active" },
  { id: "LVT-UNP", code: "UNP", name: "Unpaid Leave", paid: false, annualEntitlementDays: 0, accrual: "Annual grant", carryForward: false, maximumCarryForwardDays: 0, maximumBalanceDays: 0, minimumRequestDays: 1, maximumRequestDays: 30, requiresHrApproval: true, applicableCategoryIds: [], applicableGenders: [], documentRequiredAfterDays: null, status: "Active" },
  { id: "LVT-MAT", code: "MAT", name: "Maternity Leave", paid: true, annualEntitlementDays: 90, accrual: "On completion", carryForward: false, maximumCarryForwardDays: 0, maximumBalanceDays: 90, minimumRequestDays: 30, maximumRequestDays: 90, requiresHrApproval: true, applicableCategoryIds: [], applicableGenders: ["Female"], documentRequiredAfterDays: 0, status: "Active" },
  { id: "LVT-EMG", code: "EMG", name: "Emergency Leave", paid: true, annualEntitlementDays: 3, accrual: "Annual grant", carryForward: false, maximumCarryForwardDays: 0, maximumBalanceDays: 3, minimumRequestDays: 0.5, maximumRequestDays: 2, requiresHrApproval: true, applicableCategoryIds: [], applicableGenders: [], documentRequiredAfterDays: null, status: "Active" },
];

export function leaveType(id: string): LeaveType | undefined {
  return leaveTypes.find((row) => row.id === id);
}

export type LeaveRequestStatus = "Draft" | "Pending manager" | "Pending HR" | "Approved" | "Rejected" | "Cancelled";

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: LeaveRequestStatus;
  requestedOn: string;
  managerDecisionBy: string | null;
  managerDecisionOn: string | null;
  hrDecisionBy: string | null;
  hrDecisionOn: string | null;
  decisionComment: string;
}

export const leaveRequests: readonly LeaveRequest[] = [
  { id: "LVR-001", employeeId: "EMP-2", leaveTypeId: "LVT-ANN", fromDate: "2026-09-21", toDate: "2026-09-23", days: 3, reason: "Family commitment", status: "Approved", requestedOn: "2026-09-01", managerDecisionBy: "Omar Siddiqui", managerDecisionOn: "2026-09-02", hrDecisionBy: null, hrDecisionOn: null, decisionComment: "Cover arranged with the team" },
  { id: "LVR-002", employeeId: "EMP-5", leaveTypeId: "LVT-SCK", fromDate: "2026-09-14", toDate: "2026-09-15", days: 2, reason: "Influenza, certificate attached", status: "Approved", requestedOn: "2026-09-14", managerDecisionBy: "Mariam Ali", managerDecisionOn: "2026-09-14", hrDecisionBy: null, hrDecisionOn: null, decisionComment: "Certificate received" },
  { id: "LVR-003", employeeId: "EMP-3", leaveTypeId: "LVT-ANN", fromDate: "2026-09-28", toDate: "2026-09-30", days: 3, reason: "Annual break", status: "Pending manager", requestedOn: "2026-09-16", managerDecisionBy: null, managerDecisionOn: null, hrDecisionBy: null, hrDecisionOn: null, decisionComment: "" },
  { id: "LVR-004", employeeId: "EMP-7", leaveTypeId: "LVT-UNP", fromDate: "2026-09-24", toDate: "2026-09-25", days: 2, reason: "Personal matter, balance exhausted", status: "Pending HR", requestedOn: "2026-09-15", managerDecisionBy: "Bilal Khan", managerDecisionOn: "2026-09-16", hrDecisionBy: null, hrDecisionOn: null, decisionComment: "Manager supports; unpaid leave needs HR" },
  { id: "LVR-005", employeeId: "EMP-4", leaveTypeId: "LVT-CAS", fromDate: "2026-09-09", toDate: "2026-09-09", days: 1, reason: "Personal errand", status: "Rejected", requestedOn: "2026-09-07", managerDecisionBy: "Omar Siddiqui", managerDecisionOn: "2026-09-08", hrDecisionBy: null, hrDecisionOn: null, decisionComment: "Month-end close falls on that day" },
];

export type LeaveTransactionKind = "Opening" | "Accrual" | "Carry forward" | "Adjustment" | "Used" | "Expiry";

export interface LeaveTransaction {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  kind: LeaveTransactionKind;
  days: number;
  onDate: string;
  reference: string;
  note: string;
}

export const leaveTransactions: readonly LeaveTransaction[] = [
  { id: "LVX-001", employeeId: "EMP-2", leaveTypeId: "LVT-ANN", kind: "Opening", days: 4, onDate: "2026-01-01", reference: "OPEN-2026", note: "Opening balance for 2026" },
  { id: "LVX-002", employeeId: "EMP-2", leaveTypeId: "LVT-ANN", kind: "Carry forward", days: 6, onDate: "2026-01-01", reference: "CF-2025", note: "Carried from 2025, capped at 10" },
  { id: "LVX-003", employeeId: "EMP-2", leaveTypeId: "LVT-ANN", kind: "Accrual", days: 15, onDate: "2026-09-01", reference: "ACC-2026-09", note: "Monthly accrual to September" },
  { id: "LVX-004", employeeId: "EMP-2", leaveTypeId: "LVT-ANN", kind: "Used", days: 8, onDate: "2026-06-15", reference: "LVR-000", note: "Summer break" },
  { id: "LVX-005", employeeId: "EMP-2", leaveTypeId: "LVT-ANN", kind: "Adjustment", days: 1, onDate: "2026-04-01", reference: "ADJ-0012", note: "Public holiday worked, day returned" },

  { id: "LVX-010", employeeId: "EMP-2", leaveTypeId: "LVT-SCK", kind: "Accrual", days: 10, onDate: "2026-01-01", reference: "GRANT-2026", note: "Annual grant" },
  { id: "LVX-011", employeeId: "EMP-2", leaveTypeId: "LVT-SCK", kind: "Used", days: 2, onDate: "2026-03-04", reference: "LVR-000", note: "Sick" },

  { id: "LVX-020", employeeId: "EMP-3", leaveTypeId: "LVT-ANN", kind: "Opening", days: 2, onDate: "2026-01-01", reference: "OPEN-2026", note: "Opening balance for 2026" },
  { id: "LVX-021", employeeId: "EMP-3", leaveTypeId: "LVT-ANN", kind: "Accrual", days: 15, onDate: "2026-09-01", reference: "ACC-2026-09", note: "Monthly accrual to September" },
  { id: "LVX-022", employeeId: "EMP-3", leaveTypeId: "LVT-ANN", kind: "Used", days: 5, onDate: "2026-05-02", reference: "LVR-000", note: "Eid break" },

  { id: "LVX-030", employeeId: "EMP-5", leaveTypeId: "LVT-SCK", kind: "Accrual", days: 10, onDate: "2026-01-01", reference: "GRANT-2026", note: "Annual grant" },
  { id: "LVX-031", employeeId: "EMP-5", leaveTypeId: "LVT-SCK", kind: "Used", days: 2, onDate: "2026-09-14", reference: "LVR-002", note: "Influenza" },

  { id: "LVX-040", employeeId: "EMP-4", leaveTypeId: "LVT-ANN", kind: "Opening", days: 3, onDate: "2026-01-01", reference: "OPEN-2026", note: "Opening balance for 2026" },
  { id: "LVX-041", employeeId: "EMP-4", leaveTypeId: "LVT-ANN", kind: "Accrual", days: 15, onDate: "2026-09-01", reference: "ACC-2026-09", note: "Monthly accrual to September" },
  { id: "LVX-042", employeeId: "EMP-4", leaveTypeId: "LVT-ANN", kind: "Expiry", days: 1, onDate: "2026-03-31", reference: "EXP-2025", note: "Carry-forward day unused by 31 March" },

  { id: "LVX-050", employeeId: "EMP-7", leaveTypeId: "LVT-ANN", kind: "Accrual", days: 5, onDate: "2026-09-01", reference: "ACC-2026-09", note: "Accrued since joining in July" },
];

export interface LeaveBalance {
  employeeId: string;
  leaveTypeId: string;
  opening: number;
  accrued: number;
  carriedForward: number;
  adjustments: number;
  expired: number;
  used: number;
  pending: number;
  available: number;
  /** What remains if every pending request is approved. */
  availableAfterPending: number;
}

/**
 * Available = Opening + Accrued + Adjustments + Carry forward - Approved used
 *             - Expired
 *
 * Pending requests are deliberately NOT subtracted from the stated balance -
 * they are shown beside it. A balance that silently drops when someone submits
 * a request, and rises again when it is rejected, makes the number impossible
 * to reconcile against the transactions that produced it.
 */
export function leaveBalance(employeeId: string, leaveTypeId: string): LeaveBalance {
  const rows = leaveTransactions.filter(
    (row) => row.employeeId === employeeId && row.leaveTypeId === leaveTypeId,
  );
  const sum = (kind: LeaveTransactionKind) =>
    rows.filter((row) => row.kind === kind).reduce((total, row) => total + row.days, 0);

  const opening = sum("Opening");
  const accrued = sum("Accrual");
  const carriedForward = sum("Carry forward");
  const adjustments = sum("Adjustment");
  const expired = sum("Expiry");
  const used = sum("Used");

  const pending = leaveRequests
    .filter((row) => row.employeeId === employeeId && row.leaveTypeId === leaveTypeId)
    .filter((row) => row.status === "Pending manager" || row.status === "Pending HR")
    .reduce((total, row) => total + row.days, 0);

  const available = opening + accrued + carriedForward + adjustments - expired - used;
  return {
    employeeId, leaveTypeId, opening, accrued, carriedForward, adjustments, expired, used, pending,
    available,
    availableAfterPending: available - pending,
  };
}

/** Approved leave covering a date, which is what attendance processing reads. */
export function approvedLeaveOn(employeeId: string, date: string): LeaveRequest | undefined {
  return leaveRequests.find(
    (row) =>
      row.employeeId === employeeId
      && row.status === "Approved"
      && row.fromDate <= date
      && row.toDate >= date,
  );
}

/* ------------------------------------------------------------------ */
/* Attendance corrections and official duty                            */
/* ------------------------------------------------------------------ */

export type CorrectionKind = "Missing IN" | "Missing OUT" | "Incorrect attendance" | "Official duty";
export type CorrectionStatus = "Draft" | "Pending manager" | "Pending HR" | "Approved" | "Rejected";

export interface AttendanceCorrection {
  id: string;
  employeeId: string;
  date: string;
  kind: CorrectionKind;
  /** The time the employee states, for a missing punch. */
  statedIn: string | null;
  statedOut: string | null;
  reason: string;
  status: CorrectionStatus;
  requestedOn: string;
  managerDecisionBy: string | null;
  managerDecisionOn: string | null;
  hrDecisionBy: string | null;
  hrDecisionOn: string | null;
  decisionComment: string;
}

export const attendanceCorrections: readonly AttendanceCorrection[] = [
  { id: "ACR-001", employeeId: "EMP-2", date: "2026-09-08", kind: "Missing OUT", statedIn: null, statedOut: "17:35", reason: "Left through the car park exit; badge not read", status: "Approved", requestedOn: "2026-09-09", managerDecisionBy: "Omar Siddiqui", managerDecisionOn: "2026-09-09", hrDecisionBy: "Sana Iqbal", hrDecisionOn: "2026-09-10", decisionComment: "Corroborated by the team calendar" },
  { id: "ACR-002", employeeId: "EMP-4", date: "2026-09-04", kind: "Official duty", statedIn: null, statedOut: null, reason: "Client audit at Continental Trust all day", status: "Approved", requestedOn: "2026-09-04", managerDecisionBy: "Omar Siddiqui", managerDecisionOn: "2026-09-04", hrDecisionBy: "Sana Iqbal", hrDecisionOn: "2026-09-07", decisionComment: "Visit confirmed" },
  { id: "ACR-003", employeeId: "EMP-2", date: "2026-09-04", kind: "Incorrect attendance", statedIn: "09:00", statedOut: "17:10", reason: "Worked from the Lahore office; device not enrolled", status: "Pending manager", requestedOn: "2026-09-16", managerDecisionBy: null, managerDecisionOn: null, hrDecisionBy: null, hrDecisionOn: null, decisionComment: "" },
  { id: "ACR-004", employeeId: "EMP-5", date: "2026-09-09", kind: "Missing IN", statedIn: "07:05", statedOut: null, reason: "Arrived with a visitor group through reception", status: "Rejected", requestedOn: "2026-09-10", managerDecisionBy: "Mariam Ali", managerDecisionOn: "2026-09-11", hrDecisionBy: null, hrDecisionOn: null, decisionComment: "No supporting record; treated as absence" },
];

export function approvedCorrectionOn(employeeId: string, date: string): AttendanceCorrection | undefined {
  return attendanceCorrections.find(
    (row) => row.employeeId === employeeId && row.date === date && row.status === "Approved",
  );
}

/* ------------------------------------------------------------------ */
/* Overtime rules                                                      */
/* ------------------------------------------------------------------ */

export type OvertimeCategory = "Regular" | "Weekend" | "Holiday";

export interface OvertimeRule {
  id: string;
  category: OvertimeCategory;
  multiplier: number;
  /** Overtime below this many minutes is not paid at all. */
  minimumMinutes: number;
  /** Nothing beyond this is paid in a single day. */
  dailyCapMinutes: number;
  requiresApproval: boolean;
  status: "Active" | "Inactive";
}

export const overtimeRules: readonly OvertimeRule[] = [
  { id: "OTR-REG", category: "Regular", multiplier: 1.5, minimumMinutes: 30, dailyCapMinutes: 240, requiresApproval: true, status: "Active" },
  { id: "OTR-WKD", category: "Weekend", multiplier: 2, minimumMinutes: 60, dailyCapMinutes: 480, requiresApproval: true, status: "Active" },
  { id: "OTR-HOL", category: "Holiday", multiplier: 2.5, minimumMinutes: 60, dailyCapMinutes: 480, requiresApproval: true, status: "Active" },
];

export function overtimeRuleFor(category: OvertimeCategory): OvertimeRule | undefined {
  return overtimeRules.find((row) => row.category === category && row.status === "Active");
}

/* ------------------------------------------------------------------ */
/* Attendance periods                                                  */
/* ------------------------------------------------------------------ */

export type PeriodState = "Open" | "Processing" | "Exceptions" | "HR review" | "Locked";

export interface AttendancePeriod {
  id: string;
  month: string;
  state: PeriodState;
  openedOn: string;
  lockedOn: string | null;
  lockedBy: string | null;
}

export const attendancePeriods: readonly AttendancePeriod[] = [
  { id: "ATP-2026-07", month: "2026-07", state: "Locked", openedOn: "2026-07-01", lockedOn: "2026-08-04", lockedBy: "Sana Iqbal" },
  { id: "ATP-2026-08", month: "2026-08", state: "Locked", openedOn: "2026-08-01", lockedOn: "2026-09-03", lockedBy: "Sana Iqbal" },
  { id: "ATP-2026-09", month: "2026-09", state: "Exceptions", openedOn: "2026-09-01", lockedOn: null, lockedBy: null },
];

export function periodFor(month: string): AttendancePeriod | undefined {
  return attendancePeriods.find((row) => row.month === month);
}

export function periodIsLocked(month: string): boolean {
  return periodFor(month)?.state === "Locked";
}

/* ------------------------------------------------------------------ */
/* Daily attendance - derived, never stored                            */
/* ------------------------------------------------------------------ */

export type DayStatus =
  | "Present"
  | "Absent"
  | "Half day"
  | "Weekly off"
  | "Holiday"
  | "Leave"
  | "Unpaid leave"
  | "Official duty"
  | "Missing punch";

export interface DailyAttendance {
  employeeId: string;
  date: string;
  shiftId: string | null;
  shiftLabel: string;
  status: DayStatus;
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;
  overtimeCategory: OvertimeCategory | null;
  /** Counts toward paid days for payroll. */
  paid: boolean;
  /** A day that needs a human decision before the period can lock. */
  exception: boolean;
  /** Why the day reads the way it does. */
  note: string;
  correctionId: string | null;
  leaveRequestId: string | null;
}

/**
 * Derives one day for one employee.
 *
 * The order of the checks is the business rule: the calendar outranks the
 * punches (a punch on a public holiday does not make it a working day), an
 * approved correction outranks the raw record, and approved leave outranks an
 * absence. Raw punches are read, never written.
 */
export function processDay(
  person: Employee,
  date: string,
  assignment: { branchId: string; departmentId: string } | undefined,
): DailyAttendance {
  const base = {
    employeeId: person.id,
    date,
    firstIn: null as string | null,
    lastOut: null as string | null,
    workedMinutes: 0,
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
    overtimeMinutes: 0,
    overtimeCategory: null as OvertimeCategory | null,
    correctionId: null as string | null,
    leaveRequestId: null as string | null,
  };

  const assignmentRow = shiftAssignmentFor(person.id, date, assignment);
  const assignedShift = assignmentRow ? shift(assignmentRow.shiftId) : undefined;
  const workingShift = assignedShift ? effectiveShift(assignedShift, date) : undefined;
  const shiftLabel = workingShift ? `${workingShift.code} ${toTime(workingShift.startMinutes)}–${toTime(workingShift.endMinutes)}` : "No shift";

  const holiday = holidayOn(date, assignment?.branchId);
  const correction = approvedCorrectionOn(person.id, date);
  const leave = approvedLeaveOn(person.id, date);
  const isHoliday = holiday !== undefined;
  const isWeeklyOff = workingShift ? workingShift.weeklyOffDays.includes(weekdayOf(date)) : false;
  const punches = !workingShift
    ? []
    : isHoliday || isWeeklyOff
      ? authoredPunchesFor(person.id, date)
      : punchesFor(person.id, date, workingShift);
  const ins = punches.filter((row) => row.direction === "IN").map((row) => row.time).sort();
  const outs = punches.filter((row) => row.direction === "OUT").map((row) => row.time).sort();

  const shiftCommon = { shiftId: workingShift?.id ?? null, shiftLabel };

  if (!workingShift) {
    return { ...base, ...shiftCommon, status: "Absent", paid: false, exception: true, note: "No shift is assigned on this date" };
  }

  // Official duty is an approved statement that the person was working
  // elsewhere, so it outranks the absence the device would otherwise report.
  if (correction?.kind === "Official duty") {
    return {
      ...base, ...shiftCommon, status: "Official duty", paid: true, exception: false,
      workedMinutes: shiftWorkingMinutes(workingShift),
      note: correction.reason, correctionId: correction.id,
    };
  }

  if (holiday) {
    const worked = ins.length > 0 && outs.length > 0;
    if (!worked) {
      return { ...base, ...shiftCommon, status: "Holiday", paid: true, exception: false, note: holiday.name };
    }
    const workedMinutes = toMinutes(outs.at(-1)!) - toMinutes(ins[0]);
    const rule = overtimeRuleFor("Holiday");
    const overtime = rule && workedMinutes >= rule.minimumMinutes ? Math.min(workedMinutes, rule.dailyCapMinutes) : 0;
    return {
      ...base, ...shiftCommon, status: "Holiday", paid: true, exception: overtime > 0,
      firstIn: ins[0], lastOut: outs.at(-1)!, workedMinutes,
      overtimeMinutes: overtime, overtimeCategory: "Holiday",
      note: `${holiday.name} — worked, holiday overtime applies`,
    };
  }

  if (isWeeklyOff) {
    const worked = ins.length > 0 && outs.length > 0;
    if (!worked) {
      return { ...base, ...shiftCommon, status: "Weekly off", paid: true, exception: false, note: weekdayName(date) };
    }
    const workedMinutes = toMinutes(outs.at(-1)!) - toMinutes(ins[0]);
    const rule = overtimeRuleFor("Weekend");
    const overtime = rule && workedMinutes >= rule.minimumMinutes ? Math.min(workedMinutes, rule.dailyCapMinutes) : 0;
    return {
      ...base, ...shiftCommon, status: "Weekly off", paid: true, exception: overtime > 0,
      firstIn: ins[0], lastOut: outs.at(-1)!, workedMinutes,
      overtimeMinutes: overtime, overtimeCategory: "Weekend",
      note: "Worked on a weekly off — weekend overtime applies",
    };
  }

  if (leave) {
    const type = leaveType(leave.leaveTypeId);
    return {
      ...base, ...shiftCommon,
      status: type?.paid ? "Leave" : "Unpaid leave",
      paid: Boolean(type?.paid), exception: false,
      note: `${type?.name ?? "Leave"} — ${leave.id}`,
      leaveRequestId: leave.id,
    };
  }

  // An approved correction supplies the punch the device never captured. The
  // raw record is untouched; the day is simply derived from better evidence.
  const effectiveIn = correction?.statedIn ?? ins[0] ?? null;
  const effectiveOut = correction?.statedOut ?? outs.at(-1) ?? null;

  if (!effectiveIn && !effectiveOut) {
    return { ...base, ...shiftCommon, status: "Absent", paid: false, exception: true, note: "No punch recorded" };
  }
  if (!effectiveIn || !effectiveOut) {
    return {
      ...base, ...shiftCommon, status: "Missing punch", paid: false, exception: true,
      firstIn: effectiveIn, lastOut: effectiveOut,
      note: effectiveIn ? "No OUT punch recorded" : "No IN punch recorded",
      correctionId: correction?.id ?? null,
    };
  }

  const inMinutes = toMinutes(effectiveIn);
  const rawOutMinutes = toMinutes(effectiveOut);
  // A night shift's OUT falls after midnight, so it reads as a smaller number
  // than the IN. Rolling it forward a day is what makes the duration positive.
  const outMinutes = rawOutMinutes < inMinutes ? rawOutMinutes + 1440 : rawOutMinutes;
  const unpaidBreak = workingShift.breaks.filter((item) => !item.paid).reduce((total, item) => total + item.minutes, 0);
  const workedMinutes = Math.max(0, outMinutes - inMinutes - unpaidBreak);

  const lateMinutes = workingShift.flexible
    ? 0
    : Math.max(0, inMinutes - (workingShift.startMinutes + workingShift.graceInMinutes));
  const earlyDepartureMinutes = workingShift.flexible
    ? 0
    : Math.max(0, workingShift.endMinutes - workingShift.graceOutMinutes - outMinutes);

  const expected = shiftWorkingMinutes(workingShift);
  const rule = overtimeRuleFor("Regular");
  const beyond = Math.max(0, workedMinutes - expected - workingShift.overtimeAfterMinutes);
  const overtimeMinutes = rule && beyond >= rule.minimumMinutes ? Math.min(beyond, rule.dailyCapMinutes) : 0;

  let status: DayStatus = "Present";
  let note = "";
  if (workedMinutes < workingShift.minimumPresentMinutes) {
    status = "Absent";
    note = "Worked less than the minimum for a present day";
  } else if (workedMinutes < workingShift.halfDayMinutes) {
    status = "Half day";
    note = "Worked less than half the shift";
  } else if (lateMinutes > 0 && earlyDepartureMinutes > 0) {
    note = "Late arrival and early departure";
  } else if (lateMinutes > 0) {
    note = `Late by ${lateMinutes} minutes beyond the ${workingShift.graceInMinutes}-minute grace`;
  } else if (earlyDepartureMinutes > 0) {
    note = `Left ${earlyDepartureMinutes} minutes early`;
  } else if (overtimeMinutes > 0) {
    note = "Overtime beyond the shift threshold";
  } else {
    note = "Within the shift";
  }

  return {
    ...base, ...shiftCommon, status,
    firstIn: effectiveIn, lastOut: effectiveOut,
    workedMinutes, lateMinutes, earlyDepartureMinutes,
    overtimeMinutes, overtimeCategory: overtimeMinutes > 0 ? "Regular" : null,
    paid: status !== "Absent",
    exception: status === "Absent" || overtimeMinutes > 0,
    note,
    correctionId: correction?.id ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Monthly summary and payroll inputs                                  */
/* ------------------------------------------------------------------ */

export interface MonthlyAttendance {
  employeeId: string;
  month: string;
  days: readonly DailyAttendance[];
  present: number;
  absent: number;
  halfDays: number;
  weeklyOffs: number;
  holidays: number;
  leaveDays: number;
  unpaidLeaveDays: number;
  officialDuty: number;
  missingPunches: number;
  lateDays: number;
  earlyDepartures: number;
  lateMinutes: number;
  overtimeMinutes: number;
  exceptions: number;
}

export function monthlyAttendance(
  person: Employee,
  month: string,
  assignment: { branchId: string; departmentId: string } | undefined,
): MonthlyAttendance {
  const days = datesInMonth(month).map((date) => processDay(person, date, assignment));
  const count = (status: DayStatus) => days.filter((day) => day.status === status).length;
  return {
    employeeId: person.id,
    month,
    days,
    present: count("Present"),
    absent: count("Absent"),
    halfDays: count("Half day"),
    weeklyOffs: count("Weekly off"),
    holidays: count("Holiday"),
    leaveDays: count("Leave"),
    unpaidLeaveDays: count("Unpaid leave"),
    officialDuty: count("Official duty"),
    missingPunches: count("Missing punch"),
    lateDays: days.filter((day) => day.lateMinutes > 0).length,
    earlyDepartures: days.filter((day) => day.earlyDepartureMinutes > 0).length,
    lateMinutes: days.reduce((total, day) => total + day.lateMinutes, 0),
    overtimeMinutes: days.reduce((total, day) => total + day.overtimeMinutes, 0),
    exceptions: days.filter((day) => day.exception).length,
  };
}

/**
 * What Phase 3 consumes. No money appears here: this phase states days and
 * hours, and payroll decides what they are worth.
 */
export interface PayrollInput {
  employeeId: string;
  month: string;
  calendarDays: number;
  paidDays: number;
  unpaidDays: number;
  approvedLeaveDays: number;
  unpaidLeaveDays: number;
  overtimeHours: number;
  overtimeByCategory: Readonly<Record<OvertimeCategory, number>>;
  adjustments: number;
  periodState: PeriodState;
  /** Payroll may only consume a locked period. */
  releasable: boolean;
}

export function payrollInput(
  person: Employee,
  month: string,
  assignment: { branchId: string; departmentId: string } | undefined,
): PayrollInput {
  const summary = monthlyAttendance(person, month, assignment);
  const byCategory: Record<OvertimeCategory, number> = { Regular: 0, Weekend: 0, Holiday: 0 };
  for (const day of summary.days) {
    if (day.overtimeCategory) byCategory[day.overtimeCategory] += day.overtimeMinutes / 60;
  }
  const paidDays = summary.days.filter((day) => day.paid).length;
  const state = periodFor(month)?.state ?? "Open";
  return {
    employeeId: person.id,
    month,
    calendarDays: summary.days.length,
    paidDays,
    unpaidDays: summary.days.length - paidDays,
    approvedLeaveDays: summary.leaveDays,
    unpaidLeaveDays: summary.unpaidLeaveDays,
    overtimeHours: summary.overtimeMinutes / 60,
    overtimeByCategory: byCategory,
    adjustments: summary.days.filter((day) => day.correctionId !== null).length,
    periodState: state,
    releasable: state === "Locked",
  };
}

/** Employees whose attendance is processed: employed, with a live assignment. */
export function attendanceEmployees(): readonly Employee[] {
  return employees.filter((person) => employedStatuses.includes(person.status));
}

export const ATTENDANCE_MONTH = HR_TODAY.slice(0, 7);
