/**
 * Phase 2 - attendance, shift and leave.
 *
 * The thing that makes an attendance system trustworthy is not its screens, it
 * is that the same raw evidence always produces the same conclusion, and that
 * the conclusion can be explained. These tests hold the engine to that:
 *
 *   - raw punches are never rewritten, not even by an approved correction;
 *   - every day of the month is classified exactly once;
 *   - thresholds come from the shift, never from the code;
 *   - a rejected request changes nothing;
 *   - payroll receives days and hours, and no money at all.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const stamp = `${process.pid}-${Date.now()}`;

async function load(name) {
  const url = new URL(`../app/${name}`, import.meta.url);
  url.searchParams.set("test", stamp);
  return import(url.href);
}

async function context() {
  const attendance = await load("hr-attendance-data.ts");
  const core = await load("hr-core-data.ts");
  const forEmployee = (id) => ({
    person: core.employee(id),
    assignment: core.assignmentOn(id),
  });
  return { attendance, core, forEmployee };
}

test("daily attendance is derived from raw punches, which are never rewritten", async () => {
  const { attendance, forEmployee } = await context();
  const { person, assignment } = forEmployee("EMP-2");

  // 08 September has an IN punch and no OUT; an approved correction states the
  // OUT time. The day must read as a complete, present day...
  const day = attendance.processDay(person, "2026-09-08", assignment);
  assert.equal(day.status, "Present");
  assert.equal(day.lastOut, "17:35");
  assert.equal(day.correctionId, "ACR-001");

  // ...while the raw record still shows exactly what the device captured.
  const raw = attendance.authoredPunchesFor("EMP-2", "2026-09-08");
  assert.equal(raw.length, 1);
  assert.equal(raw[0].direction, "IN");
  assert.ok(
    !raw.some((punch) => punch.direction === "OUT"),
    "the correction rewrote the raw punch instead of being applied on top of it",
  );

  // Deriving twice gives the same answer: nothing is mutated along the way.
  const again = attendance.processDay(person, "2026-09-08", assignment);
  assert.deepEqual(again, day);
});

test("every day of the month is classified exactly once", async () => {
  const { attendance, core } = await context();

  for (const person of attendance.attendanceEmployees()) {
    const assignment = core.assignmentOn(person.id);
    const summary = attendance.monthlyAttendance(person, "2026-09", assignment);
    const classified =
      summary.present + summary.absent + summary.halfDays + summary.weeklyOffs
      + summary.holidays + summary.leaveDays + summary.unpaidLeaveDays
      + summary.officialDuty + summary.missingPunches;
    assert.equal(
      classified,
      summary.days.length,
      `${person.employeeNumber}: ${classified} classified days against ${summary.days.length} calendar days`,
    );
    assert.equal(summary.days.length, 30, "September has thirty days");

    const dates = summary.days.map((day) => day.date);
    assert.deepEqual([...new Set(dates)], dates, "a date was processed twice");
  }
});

test("the shift in force is resolved by specificity, then by date", async () => {
  const { attendance, core } = await context();

  // Employee beats department beats branch: a company-wide default must not
  // override an agreement made with one person.
  const bilal = core.assignmentOn("EMP-3");
  const resolved = attendance.shiftAssignmentFor("EMP-3", "2026-09-15", bilal);
  assert.equal(resolved.scope, "Employee");
  assert.equal(resolved.shiftId, "SHF-FLEX");

  // Ayesha has no personal shift, but her department does.
  const ayesha = core.assignmentOn("EMP-5");
  const departmentShift = attendance.shiftAssignmentFor("EMP-5", "2026-09-15", ayesha);
  assert.equal(departmentShift.scope, "Department");
  assert.equal(departmentShift.shiftId, "SHF-EARLY");

  // Omar has neither, so the branch default applies.
  const omar = core.assignmentOn("EMP-1");
  const branchShift = attendance.shiftAssignmentFor("EMP-1", "2026-09-15", omar);
  assert.equal(branchShift.scope, "Branch");

  // Shift history is effective-dated, so the same employee resolves to a
  // different shift before and after the change - and the old row is intact.
  const zainab = core.assignmentOn("EMP-7");
  assert.equal(attendance.shiftAssignmentFor("EMP-7", "2026-08-15", zainab).shiftId, "SHF-GEN");
  assert.equal(attendance.shiftAssignmentFor("EMP-7", "2026-09-15", zainab).shiftId, "SHF-LATE");
});

test("thresholds come from the shift, not from the engine", async () => {
  const { attendance, forEmployee } = await context();
  const { person, assignment } = forEmployee("EMP-2");
  const general = attendance.shift("SHF-GEN");

  // 09:42 against a 09:00 start with fifteen minutes of grace is 27 late.
  const late = attendance.processDay(person, "2026-09-02", assignment);
  assert.equal(late.lateMinutes, 27);
  assert.equal(
    late.lateMinutes,
    attendance.toMinutes("09:42") - (general.startMinutes + general.graceInMinutes),
    "lateness must be measured against the shift's own grace period",
  );

  // Inside the grace period nothing is late at all.
  const onTime = attendance.processDay(person, "2026-09-03", assignment);
  assert.equal(onTime.lateMinutes, 0);

  // The unpaid break is deducted from worked time rather than assumed away.
  assert.equal(attendance.shiftWorkingMinutes(general), 8 * 60 - 60);

  // A flexible shift has no lateness at all - that is what makes it flexible.
  const flexible = forEmployee("EMP-3");
  const flexDay = attendance.processDay(flexible.person, "2026-09-02", flexible.assignment);
  assert.equal(flexDay.lateMinutes, 0);
  assert.equal(flexDay.earlyDepartureMinutes, 0);
});

test("a night shift crossing midnight produces a positive day", async () => {
  const { attendance } = await context();
  const night = attendance.shift("SHF-NIGHT");

  // The end is expressed past midnight so every duration stays subtraction.
  assert.ok(night.endMinutes > 1440, "the night shift must end on the following day");
  assert.equal(attendance.toTime(night.endMinutes), "06:00");
  // Eight hours, with a paid break, so the whole span is working time.
  assert.equal(attendance.shiftWorkingMinutes(night), 8 * 60);
});

test("the calendar outranks the punches", async () => {
  const { attendance, forEmployee } = await context();
  const { person, assignment } = forEmployee("EMP-2");

  // A public holiday on a working day is a holiday, and it is paid.
  const holiday = attendance.processDay(person, "2026-09-07", assignment);
  assert.equal(holiday.status, "Holiday");
  assert.equal(holiday.paid, true);
  assert.match(holiday.note, /Defence Day/);

  // A weekly off is a weekly off even though the generator could have produced
  // punches for it.
  const weekend = attendance.processDay(person, "2026-09-05", assignment);
  assert.equal(weekend.status, "Weekly off");
  assert.equal(weekend.overtimeMinutes, 0, "nobody worked, so there is no weekend overtime");

  // A branch holiday applies to that branch only.
  const lahore = forEmployee("EMP-5");
  const islamabad = forEmployee("EMP-4");
  assert.equal(attendance.processDay(lahore.person, "2026-09-25", lahore.assignment).status, "Holiday");
  assert.notEqual(attendance.processDay(islamabad.person, "2026-09-25", islamabad.assignment).status, "Holiday");
});

test("approved leave marks the day and a rejected request changes nothing", async () => {
  const { attendance, forEmployee } = await context();

  const mariam = forEmployee("EMP-2");
  const onLeave = attendance.processDay(mariam.person, "2026-09-22", mariam.assignment);
  assert.equal(onLeave.status, "Leave");
  assert.equal(onLeave.paid, true);
  assert.equal(onLeave.leaveRequestId, "LVR-001");

  // LVR-005 was rejected for 09 September. The day must not read as leave, and
  // a rejected request must not be paid as one either.
  const sana = forEmployee("EMP-4");
  const rejectedDay = attendance.processDay(sana.person, "2026-09-09", sana.assignment);
  assert.notEqual(rejectedDay.status, "Leave");
  assert.equal(rejectedDay.leaveRequestId, null);

  // A rejected correction leaves the absence standing.
  const ayesha = forEmployee("EMP-5");
  const stillAbsent = attendance.processDay(ayesha.person, "2026-09-09", ayesha.assignment);
  assert.equal(stillAbsent.status, "Absent");
  assert.equal(stillAbsent.correctionId, null);
  assert.equal(stillAbsent.paid, false);
});

test("official duty is a working day without punches", async () => {
  const { attendance, forEmployee } = await context();
  const { person, assignment } = forEmployee("EMP-4");

  const duty = attendance.processDay(person, "2026-09-04", assignment);
  assert.equal(duty.status, "Official duty");
  assert.equal(duty.paid, true);
  assert.equal(duty.correctionId, "ACR-002");
  assert.ok(duty.workedMinutes > 0, "official duty credits the shift's working time");
});

test("overtime obeys its rules, its minimum and its cap", async () => {
  const { attendance, forEmployee } = await context();

  // A long evening on an ordinary day is regular overtime, counted only beyond
  // the shift plus its threshold.
  const mariam = forEmployee("EMP-2");
  const long = attendance.processDay(mariam.person, "2026-09-10", mariam.assignment);
  assert.equal(long.overtimeCategory, "Regular");
  const general = attendance.shift("SHF-GEN");
  const expected = long.workedMinutes - attendance.shiftWorkingMinutes(general) - general.overtimeAfterMinutes;
  assert.equal(long.overtimeMinutes, expected);

  // Working a weekly off is weekend overtime at a different rate.
  const sana = forEmployee("EMP-4");
  const saturday = attendance.processDay(sana.person, "2026-09-12", sana.assignment);
  assert.equal(saturday.status, "Weekly off");
  assert.equal(saturday.overtimeCategory, "Weekend");
  assert.ok(saturday.overtimeMinutes > 0);

  const regular = attendance.overtimeRuleFor("Regular");
  const weekend = attendance.overtimeRuleFor("Weekend");
  const holiday = attendance.overtimeRuleFor("Holiday");
  assert.ok(weekend.multiplier > regular.multiplier, "weekend overtime must be worth more than regular");
  assert.ok(holiday.multiplier > weekend.multiplier, "holiday overtime must be worth the most");
  for (const rule of [regular, weekend, holiday]) {
    assert.ok(rule.requiresApproval, "overtime is claimed, so it must be approved");
    assert.ok(rule.dailyCapMinutes > rule.minimumMinutes);
  }

  // Overtime below the rule's minimum is not overtime at all.
  const short = attendance.processDay(mariam.person, "2026-09-03", mariam.assignment);
  assert.ok(short.overtimeMinutes === 0 || short.overtimeMinutes >= regular.minimumMinutes);
});

test("the leave balance is the formula, and pending is shown beside it", async () => {
  const { attendance } = await context();
  const balance = attendance.leaveBalance("EMP-2", "LVT-ANN");

  // Opening + Accrued + Adjustments + Carry forward - Expired - Used
  assert.equal(
    balance.available,
    balance.opening + balance.accrued + balance.carriedForward + balance.adjustments
      - balance.expired - balance.used,
  );
  assert.equal(balance.available, 18);

  // A pending request does not reduce the stated balance - a number that falls
  // when someone submits and rises when they are rejected cannot be reconciled
  // against the transactions that produced it.
  const pendingHolder = attendance.leaveBalance("EMP-3", "LVT-ANN");
  assert.equal(pendingHolder.pending, 3);
  assert.equal(
    pendingHolder.available,
    pendingHolder.opening + pendingHolder.accrued + pendingHolder.carriedForward
      + pendingHolder.adjustments - pendingHolder.expired - pendingHolder.used,
  );
  assert.equal(pendingHolder.availableAfterPending, pendingHolder.available - 3);

  // Expiry reduces the balance and is visible as its own number.
  const expiring = attendance.leaveBalance("EMP-4", "LVT-ANN");
  assert.equal(expiring.expired, 1);
  assert.equal(expiring.available, expiring.opening + expiring.accrued - expiring.expired);
});

test("leave types carry their configuration rather than assuming it", async () => {
  const { attendance } = await context();

  for (const type of attendance.leaveTypes) {
    assert.ok(type.maximumRequestDays >= type.minimumRequestDays, `${type.code}: request bounds are inverted`);
    if (type.carryForward) {
      assert.ok(type.maximumCarryForwardDays > 0, `${type.code} carries forward but caps it at nil`);
      assert.ok(
        type.maximumCarryForwardDays <= type.maximumBalanceDays,
        `${type.code} can carry forward more than it may ever hold`,
      );
    } else {
      assert.equal(type.maximumCarryForwardDays, 0, `${type.code} does not carry forward but sets a cap`);
    }
    if (!type.paid) {
      assert.equal(type.annualEntitlementDays, 0, `${type.code} is unpaid but grants an entitlement`);
      assert.ok(type.requiresHrApproval, "unpaid leave affects pay, so HR must approve it");
    }
  }

  // Maternity leave is the one place a gender restriction is legitimate, and
  // it is configuration rather than a rule buried in code.
  const maternity = attendance.leaveTypes.find((type) => type.code === "MAT");
  assert.deepEqual([...maternity.applicableGenders], ["Female"]);
  const annual = attendance.leaveTypes.find((type) => type.code === "ANN");
  assert.deepEqual([...annual.applicableGenders], [], "annual leave must not be restricted by gender");
});

test("payroll receives days and hours, and no money", async () => {
  const { attendance, core } = await context();

  for (const person of attendance.attendanceEmployees()) {
    const assignment = core.assignmentOn(person.id);
    const input = attendance.payrollInput(person, "2026-09", assignment);

    assert.equal(
      input.paidDays + input.unpaidDays,
      input.calendarDays,
      `${person.employeeNumber}: paid and unpaid days must account for the whole month`,
    );
    assert.ok(input.overtimeHours >= 0);
    const byCategory = Object.values(input.overtimeByCategory).reduce((total, hours) => total + hours, 0);
    assert.ok(
      Math.abs(byCategory - input.overtimeHours) < 0.0001,
      `${person.employeeNumber}: overtime by category does not add up to the total`,
    );

    // Phase 2 states facts; Phase 3 decides what they are worth.
    for (const field of ["rate", "amount", "salary", "gross", "net", "pay"]) {
      assert.ok(!(field in input), `payroll input must not carry ${field}; this phase does not calculate pay`);
    }
  }
});

test("payroll may only consume a locked period", async () => {
  const { attendance, core } = await context();
  const person = core.employee("EMP-2");
  const assignment = core.assignmentOn("EMP-2");

  // September is still being worked through, so it is not releasable.
  const open = attendance.payrollInput(person, "2026-09", assignment);
  assert.equal(open.periodState, "Exceptions");
  assert.equal(open.releasable, false);
  assert.equal(attendance.periodIsLocked("2026-09"), false);

  // August is locked, so its numbers are final.
  const closed = attendance.payrollInput(person, "2026-08", assignment);
  assert.equal(closed.periodState, "Locked");
  assert.equal(closed.releasable, true);
  assert.equal(attendance.periodIsLocked("2026-08"), true);

  // The period walks one path, and Locked is the end of it.
  const states = attendance.attendancePeriods.map((period) => period.state);
  for (const state of states) {
    assert.ok(["Open", "Processing", "Exceptions", "HR review", "Locked"].includes(state));
  }
  for (const period of attendance.attendancePeriods) {
    if (period.state === "Locked") {
      assert.ok(period.lockedOn && period.lockedBy, `${period.month} is locked but nobody locked it`);
    } else {
      assert.equal(period.lockedOn, null, `${period.month} is not locked but carries a lock date`);
    }
  }
});

test("a rotating shift cycles without a new assignment each week", async () => {
  const { attendance } = await context();
  const rotating = attendance.shift("SHF-ROT");

  const resolved = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"].map(
    (date) => attendance.effectiveShift(rotating, date).code,
  );
  assert.equal(new Set(resolved).size, rotating.rotationShiftIds.length, "the rotation does not cover its pattern");
  for (const code of resolved) {
    assert.ok(["EARLY", "LATE", "NIGHT"].includes(code), `unexpected rotation shift ${code}`);
  }

  // A non-rotating shift is returned unchanged.
  const fixed = attendance.shift("SHF-GEN");
  assert.equal(attendance.effectiveShift(fixed, "2026-09-07").id, "SHF-GEN");
});

test("Phase 2 reuses Phase 1 rather than restating it", async () => {
  const source = await readFile(new URL("../app/hr-attendance-data.ts", import.meta.url), "utf8");

  assert.match(source, /from "\.\/hr-core-data\.ts"/, "Phase 2 must build on the Phase 1 employee model");
  for (const restated of [
    "interface Employee {",
    "export const employees",
    "export const orgUnits",
    "employeeStatusTransitions",
  ]) {
    assert.ok(
      !source.includes(restated),
      `Phase 2 redefines ${restated}; it must reuse the Phase 1 definition`,
    );
  }
});
