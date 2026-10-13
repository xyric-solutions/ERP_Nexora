/**
 * Phase 3 - payroll.
 *
 * Payroll is the one module where a defect is a legal problem rather than an
 * inconvenience, so these tests are about money being right and history being
 * immovable:
 *
 *   - a formula is parsed, never executed;
 *   - an unpaid day is deducted once, by one configured method;
 *   - proration is applied once per component;
 *   - a closed run cannot be changed by anything that happens afterwards;
 *   - the forbidden transitions are refused;
 *   - the journal balances and payment cannot be faked.
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

test("the formula engine parses; it never executes", async () => {
  const { evaluateFormula, FormulaError } = await load("hr-payroll-data.ts");

  assert.equal(evaluateFormula("BASIC * 0.40", { BASIC: 1000 }), 400);
  assert.equal(evaluateFormula("2 + 3 * 4", {}), 14, "precedence must be arithmetic, not left to right");
  assert.equal(evaluateFormula("(2 + 3) * 4", {}), 20);
  assert.equal(evaluateFormula("-BASIC + 10", { BASIC: 4 }), 6);
  assert.equal(evaluateFormula("max(0, A - B)", { A: 10, B: 40 }), 0);
  assert.equal(evaluateFormula("round(10 / 3)", {}), 3);

  // A misspelled variable is an error, never nil. Treating it as zero is how
  // an allowance quietly disappears from everyone's pay.
  assert.throws(() => evaluateFormula("BASICC * 2", { BASIC: 1 }), FormulaError);

  // Nothing outside the variable map is reachable.
  for (const attack of [
    "process",
    "globalThis",
    "constructor",
    "this",
    "require('fs')",
    "(() => 1)()",
    "BASIC.toString()",
  ]) {
    assert.throws(
      () => evaluateFormula(attack, { BASIC: 1 }),
      (error) => error instanceof FormulaError,
      `"${attack}" was not rejected by the formula engine`,
    );
  }

  assert.throws(() => evaluateFormula("1 / 0", {}), FormulaError);
  assert.throws(() => evaluateFormula("(1 + 2", {}), FormulaError);
  assert.throws(() => evaluateFormula("foo(1)", {}), FormulaError);
});

test("an unpaid day is deducted once, by one configured method", async () => {
  const { runFor, payrollPolicy } = await load("hr-payroll-data.ts");
  const run = runFor("2026-09");
  const withUnpaid = run.results.find((row) => row.unpaidDays > 0);
  assert.ok(withUnpaid, "the fixtures need an employee with an unpaid day");

  if (payrollPolicy.unpaidDayMethod === "Prorate earnings") {
    // Earnings already exclude the day, so a separate recovery line would
    // dock the employee twice for the same absence.
    assert.equal(
      withUnpaid.items.some((item) => item.componentCode === "UNPAID_LEAVE"),
      false,
      "earnings are prorated and an unpaid-leave deduction was taken as well",
    );
  } else {
    assert.ok(withUnpaid.items.some((item) => item.componentCode === "UNPAID_LEAVE"));
    assert.ok(
      withUnpaid.items.every((item) => !item.basis.includes("prorated")),
      "the daily-rate method must not also prorate",
    );
  }
});

test("proration is applied once per component, on the contracted base", async () => {
  const { runFor, salaryAssignmentOn, salaryStructure, money } = await load("hr-payroll-data.ts");
  const run = runFor("2026-09");
  const result = run.results.find((row) => row.unpaidDays > 0);

  const assignment = salaryAssignmentOn(result.employeeId, "2026-09-30");
  const structure = salaryStructure(assignment.structureId);
  const contractedBasic = assignment.overrides.BASIC
    ?? structure.items.find((item) => item.componentCode === "BASIC").amount;

  const basic = result.items.find((item) => item.componentCode === "BASIC");
  const houseRent = result.items.find((item) => item.componentCode === "HOUSE_RENT");
  const factor = result.paidDays / (result.paidDays + result.unpaidDays);

  assert.equal(basic.amount, Math.round(contractedBasic * factor));
  // House rent is forty per cent of the contracted basic, prorated once -
  // not forty per cent of an already-prorated basic, prorated again.
  assert.equal(houseRent.amount, Math.round(Math.round(contractedBasic * 0.4) * factor));
  assert.notEqual(houseRent.amount, Math.round(basic.amount * 0.4 * factor));
  assert.equal(contractedBasic, money(340000));
});

test("salary is effective-dated and a revision never rewrites history", async () => {
  const { salaryAssignmentOn, money, salaryRevisions } = await load("hr-payroll-data.ts");

  // Mariam's July promotion. June reads the old assignment, September the new,
  // and the old row still exists with its own dates.
  const before = salaryAssignmentOn("EMP-2", "2026-06-30");
  const after = salaryAssignmentOn("EMP-2", "2026-09-30");
  assert.notEqual(before.id, after.id);
  assert.equal(before.overrides.BASIC, undefined);
  assert.equal(after.overrides.BASIC, money(340000));
  assert.equal(before.effectiveTo, "2026-06-30");
  assert.equal(after.effectiveTo, null);

  const revision = salaryRevisions.find((row) => row.id === "REV-001");
  assert.equal(revision.status, "Approved");
  assert.ok(revision.oldGross < revision.newGross);
  assert.equal(revision.fromAssignmentId, before.id);
  assert.equal(revision.toAssignmentId, after.id);

  // A revision awaiting approval changes nothing yet.
  const pending = salaryRevisions.find((row) => row.status === "Pending approval");
  assert.ok(pending);
  assert.equal(pending.toAssignmentId, null);
  assert.equal(salaryAssignmentOn(pending.employeeId, "2026-09-30").id, pending.fromAssignmentId);
});

test("a closed run is a snapshot that later changes cannot reach", async () => {
  const { closedRuns, runFor } = await load("hr-payroll-data.ts");

  const august = closedRuns.find((run) => run.period === "2026-08");
  assert.ok(august, "August must be a stored snapshot");
  assert.ok(Object.isFrozen(august), "a closed run must be frozen");
  assert.ok(Object.isFrozen(closedRuns));

  // Reading it twice returns the very same objects - it is not recalculated.
  assert.strictEqual(runFor("2026-08"), august);
  assert.strictEqual(runFor("2026-08").results, august.results);

  // The snapshot carries amounts, not a pointer to a structure that can move.
  for (const result of august.results) {
    for (const item of result.items) {
      assert.equal(typeof item.amount, "number");
      assert.ok(Number.isInteger(item.amount), "money must be integer minor units");
    }
    assert.equal(
      result.grossEarnings - result.totalDeductions,
      result.netPay,
      `${result.employeeNumber}: the snapshot's own totals must agree`,
    );
  }
});

test("the payroll period refuses every forbidden transition", async () => {
  const { canTransitionPayroll, payrollTransitions, payrollPeriodStatuses, isEditable } =
    await load("hr-payroll-data.ts");

  // The rules the brief calls critical.
  assert.equal(canTransitionPayroll("Paid", "Open"), false, "PAID must never return to a draft state");
  assert.equal(canTransitionPayroll("Paid", "Processing"), false);
  assert.equal(canTransitionPayroll("Paid", "Approved"), false);
  assert.deepEqual(payrollTransitions.Closed, [], "CLOSED is terminal");
  assert.equal(canTransitionPayroll("Posted", "Approved"), false, "a posted period cannot go back behind its journal");
  assert.deepEqual(payrollTransitions.Posted, ["Paid"]);

  // Editing stops at approval, not at payment.
  assert.equal(isEditable("Under review"), true);
  assert.equal(isEditable("Approved"), false);
  assert.equal(isEditable("Posted"), false);
  assert.equal(isEditable("Paid"), false);
  assert.equal(isEditable("Closed"), false);

  // The whole machine moves forward only, apart from returning to Processing
  // to recalculate before approval.
  const order = payrollPeriodStatuses;
  for (const [from, targets] of Object.entries(payrollTransitions)) {
    for (const to of targets) {
      const forward = order.indexOf(to) > order.indexOf(from);
      assert.ok(
        forward || to === "Processing" || to === "Open",
        `${from} -> ${to} moves backwards through the lifecycle`,
      );
    }
  }
});

test("payroll only runs against a locked attendance period", async () => {
  const { canCalculate, payrollPeriodFor, runFor } = await load("hr-payroll-data.ts");
  const attendance = await load("hr-attendance-data.ts");

  // September attendance is still in exceptions, so payroll must not proceed.
  assert.equal(attendance.periodIsLocked("2026-09"), false);
  assert.equal(canCalculate(payrollPeriodFor("2026-09")), false);

  // ...and every result says why, rather than quietly producing a number.
  const run = runFor("2026-09");
  for (const result of run.results) {
    assert.ok(
      result.warnings.some((warning) => warning.includes("not locked")),
      `${result.employeeNumber} was calculated with no warning about the open attendance period`,
    );
  }
});

test("payroll consumes approved records only", async () => {
  const { runFor, payrollAdjustments, employeeLoans, money } = await load("hr-payroll-data.ts");
  const run = runFor("2026-09");

  // An approved bonus reaches the payslip.
  const approved = payrollAdjustments.find((row) => row.id === "ADJ-001");
  assert.equal(approved.status, "Approved");
  const withBonus = run.results.find((row) => row.employeeId === approved.employeeId);
  const bonus = withBonus.items.find((item) => item.componentCode === "BONUS");
  assert.ok(bonus, "an approved bonus must appear");
  assert.equal(bonus.amount, approved.amount);

  // A pending one does not.
  const pending = payrollAdjustments.find((row) => row.status === "Pending approval");
  const pendingResult = run.results.find((row) => row.employeeId === pending.employeeId);
  assert.equal(
    pendingResult.items.some((item) => item.componentCode === pending.componentCode),
    false,
    "an adjustment awaiting approval must not be paid",
  );

  // A loan being repaid is deducted; one still awaiting approval is not.
  const repaying = employeeLoans.find((row) => row.status === "Repaying");
  const loanResult = run.results.find((row) => row.employeeId === repaying.employeeId);
  const loanLine = loanResult.items.find((item) => item.componentCode === "LOAN");
  assert.ok(loanLine, "a due instalment must be deducted");
  assert.equal(loanLine.amount, money(50000));

  const requested = employeeLoans.find((row) => row.status === "Requested");
  const requestedResult = run.results.find((row) => row.employeeId === requested.employeeId);
  assert.equal(
    requestedResult.items.some((item) => item.componentCode === "LOAN"),
    false,
    "an unapproved loan must not be deducted",
  );
});

test("loan schedules account for themselves", async () => {
  const { employeeLoans, loanOutstanding, loanDeductionFor, money } = await load("hr-payroll-data.ts");

  const loan = employeeLoans.find((row) => row.id === "LON-001");
  const deducted = loan.instalments.filter((row) => row.status === "Deducted");
  const due = loan.instalments.filter((row) => row.status === "Due");
  assert.equal(
    deducted.length * loan.instalmentAmount + due.length * loan.instalmentAmount,
    loan.principal,
    "the schedule must add up to the principal",
  );
  assert.equal(loanOutstanding(loan), due.length * loan.instalmentAmount);
  assert.equal(loanDeductionFor(loan.employeeId, "2026-09"), money(50000));
  assert.equal(loanDeductionFor(loan.employeeId, "2026-12"), 0, "no instalment is due after the schedule ends");
});

test("who is paid, and who is not", async () => {
  const { runFor } = await load("hr-payroll-data.ts");
  const core = await load("hr-core-data.ts");
  const run = runFor("2026-09");

  const paid = new Set(run.results.map((row) => row.employeeId));

  // A resigned employee is not in the payroll.
  const resigned = core.employees.find((person) => person.status === "Resigned");
  assert.ok(resigned);
  assert.equal(paid.has(resigned.id), false, "a leaver must not be paid");

  // Neither is a record still awaiting approval.
  const pending = core.employees.find((person) => person.status === "Pending approval");
  assert.ok(pending);
  assert.equal(paid.has(pending.id), false, "an unapproved employee must not be paid");

  // A mid-year joiner with an approved assignment is paid.
  const joiner = core.employees.find((person) => person.id === "EMP-7");
  assert.equal(paid.has(joiner.id), true);
});

test("the accounting hand-off balances and maps every component", async () => {
  const { runFor, buildPayrollJournal, payrollPeriodFor, payComponents } = await load("hr-payroll-data.ts");
  const run = runFor("2026-09");
  const journal = buildPayrollJournal(run, payrollPeriodFor("2026-09"));

  assert.equal(journal.totalDebit, journal.totalCredit, "debits must equal credits to the cent");
  assert.equal(journal.balanced, true);
  assert.ok(journal.lines.length > 0);
  for (const line of journal.lines) {
    assert.ok(
      (line.debit > 0) !== (line.credit > 0),
      `${line.account} is both a debit and a credit`,
    );
    assert.match(line.account, /^\d{2}-\d{2}-\d{5}$/, `${line.account} is not a nominal account code`);
  }

  // Every component carries a GL account, so the mapping is configuration.
  for (const component of payComponents) {
    assert.match(component.glAccount, /^\d{2}-\d{2}-\d{5}$/, `${component.code} has no GL account`);
  }

  // Gross earnings are the debit side; the credit side is net plus deductions.
  const gross = run.results.reduce((total, row) => total + row.grossEarnings, 0);
  assert.equal(journal.totalDebit, gross);
});

test("a period cannot be marked paid without payment references", async () => {
  const { runFor, paymentBatchFor, payrollPeriodFor, canMarkPaid } = await load("hr-payroll-data.ts");

  const draft = paymentBatchFor(runFor("2026-09"), payrollPeriodFor("2026-09"));
  assert.equal(draft.status, "Draft");
  assert.ok(draft.payments.every((row) => row.reference === null));
  assert.equal(canMarkPaid(draft), false, "marking paid with no payment reference would be a lie about money");

  const confirmed = paymentBatchFor(runFor("2026-08"), payrollPeriodFor("2026-08"));
  assert.equal(confirmed.status, "Confirmed");
  assert.ok(confirmed.payments.every((row) => row.reference !== null));
  assert.equal(canMarkPaid(confirmed), true);

  // Every payment is for exactly the net pay of its own result.
  const august = runFor("2026-08");
  for (const payment of confirmed.payments) {
    const result = august.results.find((row) => row.employeeId === payment.employeeId);
    assert.equal(payment.amount, result.netPay);
  }
});

test("totals, department splits and variances agree with the results", async () => {
  const { runFor, payrollTotals, payrollVariance } = await load("hr-payroll-data.ts");
  const run = runFor("2026-09");
  const totals = payrollTotals(run);

  assert.equal(totals.employees, run.results.length);
  assert.equal(totals.grossEarnings - totals.totalDeductions, totals.netPay);
  assert.equal(
    totals.byDepartment.reduce((sum, row) => sum + row.employees, 0),
    totals.employees,
    "department headcount must add up to the payroll headcount",
  );
  assert.equal(
    totals.byDepartment.reduce((sum, row) => sum + row.gross, 0),
    totals.grossEarnings,
    "department gross must add up to the payroll gross",
  );

  // A variance names a reason rather than just a number.
  const variances = payrollVariance(run, runFor("2026-08"));
  for (const row of variances) {
    assert.equal(row.currentNet - row.previousNet, row.difference);
    assert.ok(row.reason.length > 0, `${row.employeeName} has an unexplained variance`);
  }
  assert.ok(variances.some((row) => row.reason === "Bonus paid"), "the bonus should show as a variance");
});

test("every result's arithmetic holds", async () => {
  const { runFor } = await load("hr-payroll-data.ts");

  for (const period of ["2026-08", "2026-09"]) {
    for (const result of runFor(period).results) {
      const earnings = result.items.filter((item) => item.kind === "Earning");
      const deductions = result.items.filter((item) => item.kind === "Deduction");

      assert.equal(
        earnings.reduce((total, item) => total + item.amount, 0),
        result.grossEarnings,
        `${result.employeeNumber}: earnings do not add up to gross`,
      );
      assert.equal(
        deductions.reduce((total, item) => total + item.amount, 0),
        result.totalDeductions,
        `${result.employeeNumber}: deductions do not add up`,
      );
      assert.equal(result.grossEarnings - result.totalDeductions, result.netPay);
      assert.equal(
        result.grossTaxable,
        earnings.filter((item) => item.taxable).reduce((total, item) => total + item.amount, 0),
        `${result.employeeNumber}: taxable gross does not match the taxable components`,
      );

      // Negative net is not silently paid; it is flagged for review.
      if (result.netPay < 0) {
        assert.ok(result.warnings.some((warning) => warning.includes("negative")));
      }
      for (const item of result.items) {
        assert.ok(item.basis.length > 0, `${result.employeeNumber}: ${item.componentCode} has no stated basis`);
      }
    }
  }
});

test("payroll reads its inputs and never writes them", async () => {
  const source = await readFile(new URL("../app/hr-payroll-data.ts", import.meta.url), "utf8");

  assert.match(source, /from "\.\/hr-core-data\.ts"/);
  assert.match(source, /from "\.\/hr-attendance-data\.ts"/);

  // No redefinition of what earlier phases own.
  for (const restated of ["interface Employee {", "export const employees", "export const holidays", "function processDay"]) {
    assert.ok(!source.includes(restated), `payroll redefines ${restated} instead of reusing it`);
  }

  // And no write path into them: payroll may not mutate attendance or leave.
  for (const name of ["punches.push", "leaveTransactions.push", "attendancePeriods.push", "rawPunches.push"]) {
    assert.ok(!source.includes(name), `payroll writes to ${name}`);
  }
});
