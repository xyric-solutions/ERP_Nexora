"use client";

/**
 * Phase 2 screens: shifts, attendance, corrections, overtime, leave and the
 * month-end close.
 *
 * Every screen here reads the same derived daily attendance the engine
 * produces. None of them stores a conclusion of its own, so the muster roll,
 * the exception queue and the payroll handoff cannot disagree with each other.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HrAttendanceCell, HrAttendanceChip, HrNotice, type AttendanceTone } from "../components/hr-presentation";
import { assignmentOn, employee, fullName, orgUnitName } from "../model/hr-core-data";
import {
  ATTENDANCE_MONTH,
  attendanceCorrections,
  attendanceEmployees,
  datesInMonth,
  displayDate,
  formatHours,
  holidays,
  leaveBalance,
  leaveRequests,
  leaveType,
  leaveTypes,
  monthLabel,
  monthlyAttendance,
  overtimeRules,
  payrollInput,
  periodFor,
  processDay,
  shiftAssignments,
  shiftWorkingMinutes,
  shifts,
  shift as shiftById,
  toTime,
  weekdayName,
  type DailyAttendance,
  type DayStatus,
} from "../model/hr-attendance-data";

export const HR_ATTENDANCE_PAGES = [
  "shifts",
  "shift-assignments",
  "daily-attendance",
  "monthly-attendance",
  "attendance-corrections",
  "overtime",
  "attendance-period",
  "attendance-payroll-inputs",
  "leave-types",
  "leave-balances",
] as const;

export function isHrAttendancePage(pageId: string): boolean {
  return (HR_ATTENDANCE_PAGES as readonly string[]).includes(pageId);
}

/** One letter per status, so a month fits on one screen. */
const statusCode: Readonly<Record<DayStatus, string>> = {
  "Present": "P",
  "Absent": "A",
  "Half day": "H",
  "Weekly off": "W",
  "Holiday": "F",
  "Leave": "L",
  "Unpaid leave": "U",
  "Official duty": "D",
  "Missing punch": "M",
};

const statusTone: Readonly<Record<DayStatus, AttendanceTone>> = {
  "Present": "present",
  "Absent": "absent",
  "Half day": "half",
  "Weekly off": "off",
  "Holiday": "holiday",
  "Leave": "leave",
  "Unpaid leave": "unpaid",
  "Official duty": "duty",
  "Missing punch": "missing",
};

function rows(month: string): readonly { id: string; name: string; department: string; summary: ReturnType<typeof monthlyAttendance> }[] {
  return attendanceEmployees().map((person) => {
    const assignment = assignmentOn(person.id);
    return {
      id: person.id,
      name: fullName(person),
      department: assignment ? orgUnitName(assignment.departmentId) : "—",
      summary: monthlyAttendance(person, month, assignment),
    };
  });
}

function Legend() {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-3.5 p-0" aria-label="Attendance legend">
      {(Object.keys(statusCode) as DayStatus[]).map((status) => (
        <li className="flex items-center gap-1.5 text-xs text-muted-foreground" key={status}>
          <HrAttendanceCell tone={statusTone[status]}>{statusCode[status]}</HrAttendanceCell>
          <span>{status}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */

function MonthlyAttendance({ month, onAction }: { month: string; onAction: (action: string, subject?: string) => void }) {
  const dates = datesInMonth(month);
  const people = rows(month);
  const period = periodFor(month);

  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        <article><span>Employees</span><strong>{people.length}</strong><small>With attendance this month</small></article>
        <article><span>Paid days</span><strong>{people.reduce((total, row) => total + row.summary.days.filter((day) => day.paid).length, 0)}</strong><small>Across the month</small></article>
        <article className={people.some((row) => row.summary.exceptions > 0) ? "warning" : undefined}>
          <span>Exceptions</span>
          <strong>{people.reduce((total, row) => total + row.summary.exceptions, 0)}</strong>
          <small>Must be cleared before locking</small>
        </article>
        <article><span>Overtime</span><strong>{formatHours(people.reduce((total, row) => total + row.summary.overtimeMinutes, 0))}</strong><small>Approved and pending</small></article>
      </div>

      <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">
        Every cell is derived from the raw punches, the shift in force that day, the calendar, approved leave and
        approved corrections. Nothing here is stored: correct a punch and the month re-reads itself.
        {period ? ` ${monthLabel(month)} is ${period.state.toLowerCase()}.` : ""}
      </p>

      <Legend />

      <div className="nx-table-wrap overflow-x-auto">
        <table className="nx-data-table [&_th]:px-1.5 [&_th]:py-1.5 [&_td]:px-1.5 [&_td]:py-1.5 [&_thead_.attendance-name]:bg-muted [&_tbody_.attendance-name]:bg-card">
          <thead>
            <tr>
              <th className="attendance-name sticky left-0 z-10 min-w-47.5 text-left">Employee</th>
              {dates.map((date) => (
                <th key={date} className="w-6.5 text-center tabular-nums" title={`${weekdayName(date)} ${displayDate(date)}`}>
                  {date.slice(-2)}
                </th>
              ))}
              <th className="amount">P</th>
              <th className="amount">A</th>
              <th className="amount">L</th>
              <th className="amount">OT</th>
            </tr>
          </thead>
          <tbody>
            {people.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="attendance-name sticky left-0 z-10 min-w-47.5 text-left">
                  <button className="nx-record-link" type="button" onClick={() => onAction("Open attendance", row.name)}>{row.name}</button>
                  <small>{row.department}</small>
                </th>
                {row.summary.days.map((day) => (
                  <td key={day.date} className="w-6.5 text-center tabular-nums">
                    <HrAttendanceCell
                      tone={statusTone[day.status]}
                      title={`${displayDate(day.date)} · ${day.status}${day.note ? ` · ${day.note}` : ""}`}
                    >
                      {statusCode[day.status]}
                    </HrAttendanceCell>
                  </td>
                ))}
                <td className="amount">{row.summary.present}</td>
                <td className="amount">{row.summary.absent}</td>
                <td className="amount">{row.summary.leaveDays + row.summary.unpaidLeaveDays}</td>
                <td className="amount">{formatHours(row.summary.overtimeMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DailyAttendance({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const [date, setDate] = useState("2026-09-10");
  const people = attendanceEmployees().map((person) => {
    const assignment = assignmentOn(person.id);
    return { person, day: processDay(person, date, assignment), assignment };
  });
  const counted = (status: DayStatus) => people.filter((row) => row.day.status === status).length;

  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        <article><span>Present</span><strong>{counted("Present") + counted("Half day")}</strong><small>Including half days</small></article>
        <article className={counted("Absent") > 0 ? "warning" : undefined}><span>Absent</span><strong>{counted("Absent")}</strong><small>No approved cover</small></article>
        <article><span>On leave</span><strong>{counted("Leave") + counted("Unpaid leave")}</strong><small>Approved requests</small></article>
        <article className={counted("Missing punch") > 0 ? "warning" : undefined}><span>Missing punches</span><strong>{counted("Missing punch")}</strong><small>Awaiting correction</small></article>
      </div>

      <div className="nx-worksheet__controls">
        <label>
          <span>Attendance date</span>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          <span>Day</span>
          <Input readOnly value={`${weekdayName(date)} · ${displayDate(date)}`} />
        </label>
        <Button variant="outline" type="button" onClick={() => onAction("Reprocess day", displayDate(date))}>Reprocess</Button>
      </div>

      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead>
            <tr>
              <th>Employee</th><th>Department</th><th>Shift</th><th>In</th><th>Out</th>
              <th className="amount">Worked</th><th className="amount">Late</th><th className="amount">Overtime</th>
              <th>Status</th><th>Note</th>
            </tr>
          </thead>
          <tbody>
            {people.map(({ person, day, assignment }) => (
              <tr key={person.id}>
                <td>{fullName(person)}</td>
                <td>{assignment ? orgUnitName(assignment.departmentId) : "—"}</td>
                <td>{day.shiftLabel}</td>
                <td>{day.firstIn ?? "—"}</td>
                <td>{day.lastOut ?? "—"}</td>
                <td className="amount">{day.workedMinutes ? formatHours(day.workedMinutes) : "—"}</td>
                <td className="amount">{day.lateMinutes ? `${day.lateMinutes}m` : "—"}</td>
                <td className="amount">{day.overtimeMinutes ? formatHours(day.overtimeMinutes) : "—"}</td>
                <td><HrAttendanceChip tone={statusTone[day.status]}>{day.status}</HrAttendanceChip></td>
                <td>{day.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Shifts({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const [selectedId, setSelectedId] = useState(shifts[0].id);
  const selected = shiftById(selectedId) ?? shifts[0];

  return (
    <div className="nx-recon">
      <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">
        Every threshold below is configuration. The processing engine does not know that 09:00 or fifteen minutes is
        special — it reads these numbers, which is why a new shift needs no code change.
      </p>

      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead>
            <tr><th>Code</th><th>Shift</th><th>Type</th><th>Hours</th><th className="amount">Grace in</th><th className="amount">Break</th><th className="amount">OT after</th><th>Weekly off</th><th>Status</th></tr>
          </thead>
          <tbody>
            {shifts.map((row) => (
              <tr className={row.id === selectedId ? "is-selected" : undefined} key={row.id}>
                <td><button className="nx-record-link" type="button" onClick={() => setSelectedId(row.id)}>{row.code}</button></td>
                <td>{row.name}</td>
                <td>{row.kind}</td>
                <td>{toTime(row.startMinutes)}–{toTime(row.endMinutes)}</td>
                <td className="amount">{row.graceInMinutes}m</td>
                <td className="amount">{row.breaks.reduce((total, item) => total + item.minutes, 0)}m</td>
                <td className="amount">+{row.overtimeAfterMinutes}m</td>
                <td>{row.weeklyOffDays.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ") || "None"}</td>
                <td><span className={`nx-status nx-status-${row.status.toLowerCase()}`}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="grid min-w-0 gap-3 rounded border border-border bg-card p-4 shadow-xs">
        <header>
          <div>
            <span className="nx-eyebrow">Shift rules · {selected.code}</span>
            <h2>{selected.name}</h2>
          </div>
          <div className="nx-txn-detail__actions">
            <Button variant="outline" type="button" onClick={() => onAction("Edit shift", selected.name)}>Edit rules</Button>
            <Button variant="outline" type="button" onClick={() => onAction("Assign shift", selected.name)}>Assign</Button>
          </div>
        </header>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(13.4375rem,1fr))] gap-2.5 [&>div]:border [&>div]:border-border [&>div]:bg-card [&>div]:px-3 [&>div]:py-2.5 [&_span]:block [&_span]:text-xs [&_span]:text-muted-foreground [&_strong]:mt-0.5 [&_strong]:block [&_strong]:text-sm [&_strong]:font-semibold">
          <div><span>Type</span><strong>{selected.kind}</strong></div>
          <div><span>Start / end</span><strong>{toTime(selected.startMinutes)} – {toTime(selected.endMinutes)}</strong></div>
          <div><span>Working time</span><strong>{formatHours(shiftWorkingMinutes(selected))}</strong></div>
          <div><span>Grace on arrival</span><strong>{selected.graceInMinutes} minutes</strong></div>
          <div><span>Early departure allowance</span><strong>{selected.graceOutMinutes} minutes</strong></div>
          <div><span>Breaks</span><strong>{selected.breaks.map((item) => `${item.label} ${item.minutes}m ${item.paid ? "(paid)" : "(unpaid)"}`).join(", ")}</strong></div>
          <div><span>Half day below</span><strong>{formatHours(selected.halfDayMinutes)}</strong></div>
          <div><span>Absent below</span><strong>{formatHours(selected.minimumPresentMinutes)}</strong></div>
          <div><span>Overtime starts after</span><strong>shift + {selected.overtimeAfterMinutes} minutes</strong></div>
          <div><span>Flexible</span><strong>{selected.flexible ? "Yes — no lateness is recorded" : "No"}</strong></div>
          {selected.rotationShiftIds ? (
            <div><span>Rotation</span><strong>{selected.rotationShiftIds.map((id) => shiftById(id)?.code ?? id).join(" → ")}, weekly</strong></div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ShiftAssignments({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  return (
    <div className="nx-recon">
      <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">
        A shift is assigned to an employee, a department or a branch, from an effective date. The most specific
        assignment wins, so a branch default never overrides an agreement made with one person — and the previous row
        is closed rather than overwritten, so shift history stays readable.
      </p>
      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead><tr><th>Reference</th><th>Scope</th><th>Applies to</th><th>Shift</th><th>Effective from</th><th>Effective to</th><th>Assigned by</th><th>Note</th></tr></thead>
          <tbody>
            {[...shiftAssignments].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).map((row) => (
              <tr key={row.id}>
                <td><button className="nx-record-link" type="button" onClick={() => onAction("Open assignment", row.id)}>{row.id}</button></td>
                <td>{row.scope}</td>
                <td>{row.scope === "Employee" ? fullName(employee(row.scopeId)!) : orgUnitName(row.scopeId)}</td>
                <td>{shiftById(row.shiftId)?.name ?? row.shiftId}</td>
                <td>{displayDate(row.effectiveFrom)}</td>
                <td>{row.effectiveTo ? displayDate(row.effectiveTo) : "Current"}</td>
                <td>{row.assignedBy}</td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Corrections({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const pending = attendanceCorrections.filter((row) => row.status.startsWith("Pending"));
  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        <article className={pending.length > 0 ? "warning" : undefined}><span>Awaiting decision</span><strong>{pending.length}</strong><small>Manager or HR</small></article>
        <article><span>Approved</span><strong>{attendanceCorrections.filter((row) => row.status === "Approved").length}</strong><small>Applied on top of the raw record</small></article>
        <article><span>Rejected</span><strong>{attendanceCorrections.filter((row) => row.status === "Rejected").length}</strong><small>Original attendance stands</small></article>
        <article><span>Raw punches changed</span><strong>0</strong><small>Evidence is never edited</small></article>
      </div>

      <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">
        Employee → manager → HR. An approved correction does not rewrite the device record: it is applied on top of it,
        and the day is derived again. That is why the audit trail can still show what the device actually captured.
      </p>

      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead><tr><th>Reference</th><th>Employee</th><th>Date</th><th>Type</th><th>Stated in</th><th>Stated out</th><th>Reason</th><th>Manager</th><th>HR</th><th>Status</th><th /></tr></thead>
          <tbody>
            {attendanceCorrections.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{fullName(employee(row.employeeId)!)}</td>
                <td>{displayDate(row.date)}</td>
                <td>{row.kind}</td>
                <td>{row.statedIn ?? "—"}</td>
                <td>{row.statedOut ?? "—"}</td>
                <td>{row.reason}</td>
                <td>{row.managerDecisionBy ?? "—"}</td>
                <td>{row.hrDecisionBy ?? "—"}</td>
                <td><HrAttendanceChip tone={row.status === "Approved" ? "present" : row.status === "Rejected" ? "absent" : "half"}>{row.status}</HrAttendanceChip></td>
                <td>
                  {row.status.startsWith("Pending") ? (
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="outline" type="button" onClick={() => onAction("Reject correction", row.id)}>Reject</Button>
                      <Button type="button" onClick={() => onAction("Approve correction", row.id)}>Approve</Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Overtime({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const claims: { day: DailyAttendance; name: string }[] = [];
  for (const person of attendanceEmployees()) {
    const assignment = assignmentOn(person.id);
    for (const day of monthlyAttendance(person, ATTENDANCE_MONTH, assignment).days) {
      if (day.overtimeMinutes > 0) claims.push({ day, name: fullName(person) });
    }
  }

  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        {(["Regular", "Weekend", "Holiday"] as const).map((category) => {
          const rule = overtimeRules.find((row) => row.category === category);
          const minutes = claims.filter((row) => row.day.overtimeCategory === category).reduce((total, row) => total + row.day.overtimeMinutes, 0);
          return (
            <article key={category}>
              <span>{category} overtime</span>
              <strong>{formatHours(minutes)}</strong>
              <small>{rule ? `×${rule.multiplier} · min ${rule.minimumMinutes}m · cap ${formatHours(rule.dailyCapMinutes)}` : "No rule"}</small>
            </article>
          );
        })}
        <article><span>Claims</span><strong>{claims.length}</strong><small>All require approval</small></article>
      </div>

      <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">
        Overtime is calculated from attendance, then claimed and approved — it is never paid because a device recorded
        a late exit. Hours flow to payroll only once the period is locked; this phase states the hours and the rate
        multiplier, and Phase 3 decides what they are worth.
      </p>

      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead><tr><th>Employee</th><th>Date</th><th>Shift</th><th>In</th><th>Out</th><th className="amount">Overtime</th><th>Category</th><th className="amount">Rate</th><th>Status</th><th /></tr></thead>
          <tbody>
            {claims.map(({ day, name }) => {
              const rule = overtimeRules.find((row) => row.category === day.overtimeCategory);
              return (
                <tr key={`${day.employeeId}-${day.date}`}>
                  <td>{name}</td>
                  <td>{displayDate(day.date)}</td>
                  <td>{day.shiftLabel}</td>
                  <td>{day.firstIn ?? "—"}</td>
                  <td>{day.lastOut ?? "—"}</td>
                  <td className="amount">{formatHours(day.overtimeMinutes)}</td>
                  <td>{day.overtimeCategory}</td>
                  <td className="amount">×{rule?.multiplier ?? "—"}</td>
                  <td><HrAttendanceChip tone="half">Pending approval</HrAttendanceChip></td>
                  <td><Button type="button" onClick={() => onAction("Approve overtime", `${name} · ${displayDate(day.date)}`)}>Approve</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LeaveTypesScreen() {
  return (
    <div className="nx-recon">
      <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">
        Entitlement, accrual, carry forward, request limits and approval are configuration per leave type. The only
        gender restriction is on maternity leave, where the law requires it — nothing else is restricted.
      </p>
      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead><tr><th>Code</th><th>Leave type</th><th>Paid</th><th className="amount">Entitlement</th><th>Accrual</th><th>Carry forward</th><th className="amount">Max balance</th><th>Request</th><th>HR approval</th><th>Applies to</th></tr></thead>
          <tbody>
            {leaveTypes.map((type) => (
              <tr key={type.id}>
                <td>{type.code}</td>
                <td>{type.name}</td>
                <td>{type.paid ? "Paid" : "Unpaid"}</td>
                <td className="amount">{type.annualEntitlementDays} days</td>
                <td>{type.accrual}</td>
                <td>{type.carryForward ? `Up to ${type.maximumCarryForwardDays} days` : "No"}</td>
                <td className="amount">{type.maximumBalanceDays}</td>
                <td>{type.minimumRequestDays}–{type.maximumRequestDays} days</td>
                <td>{type.requiresHrApproval ? "Required" : "Manager only"}</td>
                <td>{type.applicableGenders.length > 0 ? type.applicableGenders.join(", ") : "All employees"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaveBalances({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const balances = attendanceEmployees().flatMap((person) =>
    leaveTypes
      .filter((type) => type.status === "Active" && type.annualEntitlementDays > 0)
      .map((type) => ({ person, type, balance: leaveBalance(person.id, type.id) }))
      .filter((row) => row.balance.available !== 0 || row.balance.used !== 0 || row.balance.pending !== 0),
  );

  return (
    <div className="nx-recon">
      <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">
        Available = Opening + Accrued + Carry forward + Adjustments − Expired − Approved used. A pending request is
        shown beside the balance, not subtracted from it: a number that falls when someone submits and rises when they
        are rejected cannot be reconciled against the transactions that produced it.
      </p>
      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead>
            <tr>
              <th>Employee</th><th>Leave type</th>
              <th className="amount">Opening</th><th className="amount">Accrued</th><th className="amount">Carried</th>
              <th className="amount">Adjust</th><th className="amount">Expired</th><th className="amount">Used</th>
              <th className="amount">Available</th><th className="amount">Pending</th><th className="amount">After pending</th><th />
            </tr>
          </thead>
          <tbody>
            {balances.map(({ person, type, balance }) => (
              <tr key={`${person.id}-${type.id}`}>
                <td>{fullName(person)}</td>
                <td>{type.name}</td>
                <td className="amount">{balance.opening}</td>
                <td className="amount">{balance.accrued}</td>
                <td className="amount">{balance.carriedForward}</td>
                <td className="amount">{balance.adjustments}</td>
                <td className="amount">{balance.expired || "—"}</td>
                <td className="amount">{balance.used}</td>
                <td className="amount"><strong>{balance.available}</strong></td>
                <td className="amount">{balance.pending || "—"}</td>
                <td className="amount">{balance.availableAfterPending}</td>
                <td><Button variant="outline" type="button" onClick={() => onAction("Adjust balance", `${fullName(person)} · ${type.name}`)}>Adjust</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="grid min-w-0 gap-3 rounded border border-border bg-card p-4 shadow-xs">
        <header><div><span className="nx-eyebrow">Leave workflow</span><h2>Requests in flight</h2></div></header>
        <div className="nx-table-wrap">
          <table className="nx-data-table">
            <thead><tr><th>Reference</th><th>Employee</th><th>Type</th><th>From</th><th>To</th><th className="amount">Days</th><th>Balance then</th><th>Manager</th><th>HR</th><th>Status</th></tr></thead>
            <tbody>
              {leaveRequests.map((request) => {
                const type = leaveType(request.leaveTypeId);
                const balance = leaveBalance(request.employeeId, request.leaveTypeId);
                const tone = request.status === "Approved" ? "present" : request.status === "Rejected" ? "absent" : "half";
                return (
                  <tr key={request.id}>
                    <td>{request.id}</td>
                    <td>{fullName(employee(request.employeeId)!)}</td>
                    <td>{type?.name}</td>
                    <td>{displayDate(request.fromDate)}</td>
                    <td>{displayDate(request.toDate)}</td>
                    <td className="amount">{request.days}</td>
                    <td>{type?.paid ? `${balance.available} available` : "Unpaid — no balance"}</td>
                    <td>{request.managerDecisionBy ?? "—"}</td>
                    <td>{type?.requiresHrApproval ? request.hrDecisionBy ?? "Required" : "Not required"}</td>
                    <td><HrAttendanceChip tone={tone}>{request.status}</HrAttendanceChip></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const periodSteps = ["Open", "Processing", "Exceptions", "HR review", "Locked"] as const;

function AttendancePeriodScreen({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const current = periodFor(ATTENDANCE_MONTH);
  const people = rows(ATTENDANCE_MONTH);
  const exceptions = people.flatMap((row) =>
    row.summary.days.filter((day) => day.exception).map((day) => ({ name: row.name, day })),
  );
  const currentIndex = current ? periodSteps.indexOf(current.state) : 0;

  return (
    <div className="nx-recon">
      <ol className="nx-recon__steps grid grid-cols-5 max-xl:grid-cols-2" aria-label="Month-end attendance close">
        {periodSteps.map((step, index) => (
          <li className={index < currentIndex ? "complete" : index === currentIndex ? "current" : ""} key={step}>
            <i>{index < currentIndex ? "✓" : index + 1}</i>
            <span><strong>{step}</strong><small>{index === currentIndex ? "Current" : index < currentIndex ? "Done" : "Pending"}</small></span>
          </li>
        ))}
      </ol>

      <div className="nx-recon__summary">
        <article><span>Period</span><strong>{monthLabel(ATTENDANCE_MONTH)}</strong><small>Opened {current ? displayDate(current.openedOn) : "—"}</small></article>
        <article><span>Employees</span><strong>{people.length}</strong><small>In this period</small></article>
        <article className={exceptions.length > 0 ? "warning" : undefined}><span>Open exceptions</span><strong>{exceptions.length}</strong><small>Block the lock</small></article>
        <article><span>Holidays</span><strong>{holidays.filter((row) => row.date.startsWith(ATTENDANCE_MONTH)).length}</strong><small>In the calendar</small></article>
      </div>

      <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">
        Locking a period does not freeze a stored table — daily attendance stays derived. What the lock changes is
        authority: after it, punches and corrections for the month can no longer alter the payroll inputs, and a
        change must go through a controlled adjustment against the next open period.
      </p>

      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead><tr><th>Employee</th><th>Date</th><th>Status</th><th>Detail</th><th /></tr></thead>
          <tbody>
            {exceptions.length === 0 ? (
              <tr><td colSpan={5} className="nx-statement-table__empty">No open exceptions — the period can be locked.</td></tr>
            ) : exceptions.map(({ name, day }) => (
              <tr key={`${day.employeeId}-${day.date}`}>
                <td>{name}</td>
                <td>{displayDate(day.date)}</td>
                <td><HrAttendanceChip tone={statusTone[day.status]}>{day.status}</HrAttendanceChip></td>
                <td>{day.note}</td>
                <td><Button variant="outline" type="button" onClick={() => onAction("Resolve exception", `${name} · ${displayDate(day.date)}`)}>Resolve</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="nx-worksheet__actions">
        <Button variant="outline" type="button" onClick={() => onAction("Reprocess period", monthLabel(ATTENDANCE_MONTH))}>Reprocess period</Button>
        <Button
          disabled={exceptions.length > 0}
          title={exceptions.length > 0 ? "Every exception must be resolved before the period can be locked" : undefined}
          type="button"
          onClick={() => onAction("Lock period", monthLabel(ATTENDANCE_MONTH))}
        >
          Lock period
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PayrollInputs({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const inputs = attendanceEmployees().map((person) => ({
    person,
    input: payrollInput(person, ATTENDANCE_MONTH, assignmentOn(person.id)),
  }));
  const releasable = inputs.every((row) => row.input.releasable);

  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        <article><span>Paid days</span><strong>{inputs.reduce((total, row) => total + row.input.paidDays, 0)}</strong><small>Across all employees</small></article>
        <article><span>Unpaid days</span><strong>{inputs.reduce((total, row) => total + row.input.unpaidDays, 0)}</strong><small>Absence and unpaid leave</small></article>
        <article><span>Overtime hours</span><strong>{inputs.reduce((total, row) => total + row.input.overtimeHours, 0).toFixed(2)}</strong><small>By category below</small></article>
        <article className={releasable ? undefined : "warning"}><span>Releasable</span><strong>{releasable ? "Yes" : "No"}</strong><small>{releasable ? "Period locked" : "Period is not locked yet"}</small></article>
      </div>

      <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">
        This is the whole of the Phase 2 to Phase 3 contract: days and hours, with no money anywhere. Payroll decides
        what a day or an overtime hour is worth. Nothing is released until the attendance period is locked, so payroll
        cannot consume figures that are still being corrected.
      </p>

      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead>
            <tr>
              <th>Employee</th><th>Period</th>
              <th className="amount">Calendar days</th><th className="amount">Paid days</th><th className="amount">Unpaid days</th>
              <th className="amount">Approved leave</th><th className="amount">Unpaid leave</th>
              <th className="amount">OT regular</th><th className="amount">OT weekend</th><th className="amount">OT holiday</th>
              <th className="amount">Adjustments</th><th>State</th>
            </tr>
          </thead>
          <tbody>
            {inputs.map(({ person, input }) => (
              <tr key={person.id}>
                <td>{fullName(person)}</td>
                <td>{monthLabel(input.month)}</td>
                <td className="amount">{input.calendarDays}</td>
                <td className="amount">{input.paidDays}</td>
                <td className="amount">{input.unpaidDays}</td>
                <td className="amount">{input.approvedLeaveDays}</td>
                <td className="amount">{input.unpaidLeaveDays}</td>
                <td className="amount">{input.overtimeByCategory.Regular.toFixed(2)}</td>
                <td className="amount">{input.overtimeByCategory.Weekend.toFixed(2)}</td>
                <td className="amount">{input.overtimeByCategory.Holiday.toFixed(2)}</td>
                <td className="amount">{input.adjustments}</td>
                <td><HrAttendanceChip tone={input.releasable ? "present" : "half"}>{input.periodState}</HrAttendanceChip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="nx-worksheet__actions">
        <Button variant="outline" type="button" onClick={() => onAction("Export payroll input", monthLabel(ATTENDANCE_MONTH))}>Export</Button>
        <Button
          disabled={!releasable}
          title={releasable ? undefined : "The attendance period must be locked before payroll can consume it"}
          type="button"
          onClick={() => onAction("Release to payroll", monthLabel(ATTENDANCE_MONTH))}
        >
          Release to payroll
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function HrAttendanceScreen({
  pageId,
  onAction,
}: {
  pageId: string;
  onAction: (action: string, subject?: string) => void;
}) {
  if (pageId === "shifts") return <Shifts onAction={onAction} />;
  if (pageId === "shift-assignments") return <ShiftAssignments onAction={onAction} />;
  if (pageId === "daily-attendance") return <DailyAttendance onAction={onAction} />;
  if (pageId === "monthly-attendance") return <MonthlyAttendance month={ATTENDANCE_MONTH} onAction={onAction} />;
  if (pageId === "attendance-corrections") return <Corrections onAction={onAction} />;
  if (pageId === "overtime") return <Overtime onAction={onAction} />;
  if (pageId === "attendance-period") return <AttendancePeriodScreen onAction={onAction} />;
  if (pageId === "attendance-payroll-inputs") return <PayrollInputs onAction={onAction} />;
  if (pageId === "leave-types") return <LeaveTypesScreen />;
  return <LeaveBalances onAction={onAction} />;
}
