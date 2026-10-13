"use client";

/**
 * Phase 3 screens: pay components, salary structures, revisions, the payroll
 * run and review, loans, the accounting hand-off, payment and payslips.
 *
 * Every screen reads the one snapshot the engine produced. None of them
 * calculates money of its own, so the review total, the payslip, the journal
 * and the payment batch cannot disagree with each other.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

import { useState } from "react";
import { employee, fullName } from "./hr-core-data";
import {
  PAYROLL_PERIOD,
  buildPayrollJournal,
  canCalculate,
  canMarkPaid,
  employeeLoans,
  formatMoney,
  isEditable,
  loanOutstanding,
  payComponents,
  paymentBatchFor,
  payrollAdjustments,
  payrollPeriodFor,
  payrollPeriods,
  payrollPolicy,
  payrollTotals,
  payrollVariance,
  runFor,
  salaryAssignments,
  salaryRevisions,
  salaryStructure,
  salaryStructures,
  type PayrollResult,
} from "./hr-payroll-data";

export const HR_PAYROLL_PAGES = [
  "payroll-setup",
  "salary-structures",
  "salary-revisions",
  "payroll-runs",
  "payroll-validation",
  "employee-loans",
  "payroll-journal",
  "payment-batch",
  "payslips",
] as const;

export function isHrPayrollPage(pageId: string): boolean {
  return (HR_PAYROLL_PAGES as readonly string[]).includes(pageId);
}

const period = payrollPeriodFor(PAYROLL_PERIOD)!;
const run = runFor(PAYROLL_PERIOD)!;
const previousRun = runFor("2026-08");

/* ------------------------------------------------------------------ */

function PayComponents() {
  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        <article><span>Components</span><strong>{payComponents.length}</strong><small>All configurable</small></article>
        <article><span>Earnings</span><strong>{payComponents.filter((row) => row.kind === "Earning").length}</strong><small>Paid to the employee</small></article>
        <article><span>Deductions</span><strong>{payComponents.filter((row) => row.kind === "Deduction").length}</strong><small>Withheld or recovered</small></article>
        <article><span>Unpaid days</span><strong>{payrollPolicy.unpaidDayMethod}</strong><small>One method, never both</small></article>
      </div>

      <p className="nx-hr-notice" role="note">
        Nothing about pay is written into the engine. A formula is parsed, never executed: it may use numbers,
        the whitelisted variables below, <code>+ − × ÷</code> and <code>min</code>, <code>max</code>, <code>round</code> —
        and nothing else, so a payroll rule cannot reach anything outside its own inputs. Priority is the evaluation
        order, which is what makes a circular reference impossible rather than merely detected.
      </p>

      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead>
            <tr><th className="amount">Priority</th><th>Code</th><th>Component</th><th>Type</th><th>Basis</th><th>Formula</th><th>Taxable</th><th>Prorated</th><th>GL account</th><th>Status</th></tr>
          </thead>
          <tbody>
            {payComponents.map((component) => (
              <tr key={component.id}>
                <td className="amount">{component.priority}</td>
                <td>{component.code}</td>
                <td>{component.name}</td>
                <td><span className={`nx-att-chip nx-att-chip--${component.kind === "Earning" ? "present" : "absent"}`}>{component.kind}</span></td>
                <td>{component.basis}</td>
                <td><code className="nx-pay-formula">{component.formula ?? "—"}</code></td>
                <td>{component.taxable ? "Taxable" : "Exempt"}</td>
                <td>{component.prorated ? "Yes" : "No"}</td>
                <td>{component.glAccount}</td>
                <td><span className={`nx-status nx-status-${component.status.toLowerCase()}`}>{component.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SalaryStructures() {
  return (
    <div className="nx-recon">
      <p className="nx-hr-notice" role="note">
        A structure is effective-dated and an employee may override individual amounts within it. The gross shown is
        the contracted monthly figure before attendance, overtime or adjustments — payroll derives the rest.
      </p>
      <div className="nx-hr-structure-grid">
        {salaryStructures.map((structure) => {
          const fixed = structure.items.filter((item) => item.amount !== null);
          const gross = fixed.reduce((total, item) => total + (item.amount ?? 0), 0);
          return (
            <section className="nx-hr-unit" key={structure.id}>
              <header>
                <div>
                  <span className="nx-eyebrow">{structure.code} · effective {structure.effectiveFrom}</span>
                  <h2>{structure.name}</h2>
                </div>
                <span className={`nx-status nx-status-${structure.status.toLowerCase()}`}>{structure.status}</span>
              </header>
              <table className="nx-data-table">
                <thead><tr><th>Component</th><th className="amount">Amount</th></tr></thead>
                <tbody>
                  {structure.items.map((item) => (
                    <tr key={item.componentCode}>
                      <td>{item.componentCode}</td>
                      <td className="amount">{item.amount === null ? <em>formula</em> : formatMoney(item.amount, structure.currency)}</td>
                    </tr>
                  ))}
                  <tr><td><strong>Fixed total</strong></td><td className="amount"><strong>{formatMoney(gross, structure.currency)}</strong></td></tr>
                </tbody>
              </table>
            </section>
          );
        })}
      </div>

      <section className="nx-hr-unit">
        <header><div><span className="nx-eyebrow">Assignments</span><h2>Employee salary assignments</h2></div></header>
        <div className="nx-table-wrap">
          <table className="nx-data-table">
            <thead><tr><th>Reference</th><th>Employee</th><th>Structure</th><th>Overrides</th><th>Effective from</th><th>Effective to</th><th>Approval</th><th>Approved by</th></tr></thead>
            <tbody>
              {salaryAssignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td>{assignment.id}</td>
                  <td>{fullName(employee(assignment.employeeId)!)}</td>
                  <td>{salaryStructure(assignment.structureId)?.name}</td>
                  <td>{Object.entries(assignment.overrides).map(([code, amount]) => `${code} ${formatMoney(amount, assignment.currency)}`).join(", ") || "—"}</td>
                  <td>{assignment.effectiveFrom}</td>
                  <td>{assignment.effectiveTo ?? "Current"}</td>
                  <td><span className={`nx-att-chip nx-att-chip--${assignment.approval === "Approved" ? "present" : "half"}`}>{assignment.approval}</span></td>
                  <td>{assignment.approvedBy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SalaryRevisions({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  return (
    <div className="nx-recon">
      <p className="nx-hr-notice" role="note">
        A revision is its own transaction with its own approval. Approving it does not overwrite the current
        assignment — it closes it the day before the new one starts, so what the employee was paid last year is still
        readable next year.
      </p>
      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead><tr><th>Reference</th><th>Employee</th><th>Effective</th><th className="amount">Old gross</th><th className="amount">New gross</th><th className="amount">Change</th><th>Reason</th><th>Requested by</th><th>Approved by</th><th>Status</th><th /></tr></thead>
          <tbody>
            {salaryRevisions.map((revision) => {
              const change = revision.newGross - revision.oldGross;
              return (
                <tr key={revision.id}>
                  <td>{revision.id}</td>
                  <td>{fullName(employee(revision.employeeId)!)}</td>
                  <td>{revision.effectiveFrom}</td>
                  <td className="amount">{formatMoney(revision.oldGross)}</td>
                  <td className="amount">{formatMoney(revision.newGross)}</td>
                  <td className="amount">{formatMoney(change)} ({((change / revision.oldGross) * 100).toFixed(1)}%)</td>
                  <td>{revision.reason}</td>
                  <td>{revision.requestedBy}</td>
                  <td>{revision.approvedBy ?? "—"}</td>
                  <td><span className={`nx-att-chip nx-att-chip--${revision.status === "Approved" ? "present" : revision.status === "Rejected" ? "absent" : "half"}`}>{revision.status}</span></td>
                  <td>
                    {revision.status === "Pending approval" ? (
                      <div className="nx-att-actions">
                        <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Reject revision", revision.id)}>Reject</button>
                        <button className="nx-button nx-button-primary" type="button" onClick={() => onAction("Approve revision", revision.id)}>Approve</button>
                      </div>
                    ) : null}
                  </td>
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

const payrollSteps = ["Open", "Processing", "Calculated", "Under review", "Approved", "Posted", "Paid", "Closed"] as const;

function PayrollRuns({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const currentIndex = payrollSteps.indexOf(period.status);
  const calculable = canCalculate(period);

  return (
    <div className="nx-recon">
      <ol className="nx-recon__steps nx-pay-steps" aria-label="Payroll period lifecycle">
        {payrollSteps.map((step, index) => (
          <li className={index < currentIndex ? "complete" : index === currentIndex ? "current" : ""} key={step}>
            <i>{index < currentIndex ? "✓" : index + 1}</i>
            <span><strong>{step}</strong></span>
          </li>
        ))}
      </ol>

      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead><tr><th>Period</th><th>Start</th><th>End</th><th>Salary date</th><th>Company</th><th className="amount">Employees</th><th className="amount">Net payroll</th><th>Journal</th><th>Payment batch</th><th>Status</th></tr></thead>
          <tbody>
            {payrollPeriods.map((row) => {
              const rowRun = runFor(row.period);
              const totals = rowRun ? payrollTotals(rowRun) : null;
              return (
                <tr key={row.id}>
                  <td><button className="nx-record-link" type="button" onClick={() => onAction("Open period", row.name)}>{row.name}</button></td>
                  <td>{row.startDate}</td>
                  <td>{row.endDate}</td>
                  <td>{row.salaryDate}</td>
                  <td>Nexora Services</td>
                  <td className="amount">{totals?.employees ?? 0}</td>
                  <td className="amount">{totals ? formatMoney(totals.netPay) : "—"}</td>
                  <td>{row.postedJournalId ?? "—"}</td>
                  <td>{row.paymentBatchId ?? "—"}</td>
                  <td><span className={`nx-att-chip nx-att-chip--${row.status === "Closed" || row.status === "Paid" ? "present" : isEditable(row.status) ? "half" : "leave"}`}>{row.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="nx-hr-notice" role="note">
        Payroll may only be calculated against a <strong>locked</strong> attendance period. September attendance is
        still in exceptions, so calculation is blocked — a payroll built on figures that are still being corrected is
        a payroll that has to be redone.
      </p>

      <div className="nx-worksheet__actions">
        <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Open review", period.name)}>Review</button>
        <button
          className="nx-button nx-button-primary"
          disabled={!calculable}
          title={calculable ? undefined : "The attendance period for September 2026 is not locked yet"}
          type="button"
          onClick={() => onAction("Calculate payroll", period.name)}
        >
          Calculate payroll
        </button>
      </div>
    </div>
  );
}

function PayrollReview({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const totals = payrollTotals(run);
  const variances = payrollVariance(run, previousRun);

  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        <article><span>Employees</span><strong>{totals.employees}</strong><small>{period.name}</small></article>
        <article><span>Gross payroll</span><strong>{formatMoney(totals.grossEarnings)}</strong><small>All earnings</small></article>
        <article><span>Deductions</span><strong>{formatMoney(totals.totalDeductions)}</strong><small>Tax, PF, loans</small></article>
        <article><span>Net payroll</span><strong>{formatMoney(totals.netPay)}</strong><small>Payable to employees</small></article>
      </div>

      <section className="nx-hr-unit">
        <header><div><span className="nx-eyebrow">Department totals</span><h2>Where the cost sits</h2></div></header>
        <table className="nx-data-table">
          <thead><tr><th>Department</th><th className="amount">Employees</th><th className="amount">Gross</th><th className="amount">Net</th></tr></thead>
          <tbody>
            {totals.byDepartment.map((row) => (
              <tr key={row.department}>
                <td>{row.department}</td>
                <td className="amount">{row.employees}</td>
                <td className="amount">{formatMoney(row.gross)}</td>
                <td className="amount">{formatMoney(row.net)}</td>
              </tr>
            ))}
            <tr><td><strong>Total</strong></td><td className="amount"><strong>{totals.employees}</strong></td><td className="amount"><strong>{formatMoney(totals.grossEarnings)}</strong></td><td className="amount"><strong>{formatMoney(totals.netPay)}</strong></td></tr>
          </tbody>
        </table>
      </section>

      <section className="nx-hr-unit">
        <header><div><span className="nx-eyebrow">Variance against {previousRun ? "August 2026" : "the prior period"}</span><h2>What moved, and why</h2></div></header>
        <table className="nx-data-table">
          <thead><tr><th>Employee</th><th className="amount">Previous net</th><th className="amount">This period</th><th className="amount">Change</th><th className="amount">%</th><th>Explanation</th></tr></thead>
          <tbody>
            {variances.length === 0 ? (
              <tr><td colSpan={6} className="nx-statement-table__empty">No material movement against the prior period.</td></tr>
            ) : variances.map((row) => (
              <tr key={row.employeeName}>
                <td>{row.employeeName}</td>
                <td className="amount">{formatMoney(row.previousNet)}</td>
                <td className="amount">{formatMoney(row.currentNet)}</td>
                <td className="amount">{formatMoney(row.difference)}</td>
                <td className="amount">{row.percent.toFixed(1)}%</td>
                <td>{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="nx-hr-unit">
        <header><div><span className="nx-eyebrow">Exceptions</span><h2>Investigate before approving</h2></div></header>
        <table className="nx-data-table">
          <thead><tr><th>Employee</th><th>Exception</th><th /></tr></thead>
          <tbody>
            {totals.exceptions.length === 0 ? (
              <tr><td colSpan={3} className="nx-statement-table__empty">No exceptions.</td></tr>
            ) : totals.exceptions.map((row, index) => (
              <tr key={`${row.employeeName}-${index}`}>
                <td>{row.employeeName}</td>
                <td>{row.detail}</td>
                <td><button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Investigate", row.employeeName)}>Investigate</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="nx-hr-unit">
        <header><div><span className="nx-eyebrow">Approval</span><h2>Configurable approval levels</h2></div></header>
        <table className="nx-data-table">
          <thead><tr><th className="amount">Level</th><th>Role</th><th>Approved by</th><th>On</th><th>Status</th></tr></thead>
          <tbody>
            {period.approvals.map((approval) => (
              <tr key={approval.level}>
                <td className="amount">{approval.level}</td>
                <td>{approval.role}</td>
                <td>{approval.by ?? "—"}</td>
                <td>{approval.on ?? "—"}</td>
                <td><span className={`nx-att-chip nx-att-chip--${approval.by ? "present" : "half"}`}>{approval.by ? "Approved" : "Pending"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="nx-worksheet__actions">
        <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Send back", period.name)}>Send back for correction</button>
        <button
          className="nx-button nx-button-primary"
          disabled={totals.exceptions.length > 0}
          title={totals.exceptions.length > 0 ? "Every exception must be investigated before approval" : undefined}
          type="button"
          onClick={() => onAction("Approve payroll", period.name)}
        >
          Approve payroll
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Loans({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        <article><span>Active loans</span><strong>{employeeLoans.filter((row) => row.status === "Repaying").length}</strong><small>Being recovered from payroll</small></article>
        <article><span>Outstanding</span><strong>{formatMoney(employeeLoans.reduce((total, row) => total + loanOutstanding(row), 0))}</strong><small>Still to recover</small></article>
        <article><span>Awaiting approval</span><strong>{employeeLoans.filter((row) => row.status === "Requested").length}</strong><small>Not yet deducted</small></article>
        <article><span>Due this period</span><strong>{formatMoney(employeeLoans.flatMap((row) => row.instalments).filter((row) => row.period === PAYROLL_PERIOD && row.status === "Due").reduce((total, row) => total + row.amount, 0))}</strong><small>{period.name}</small></article>
      </div>

      <p className="nx-hr-notice" role="note">
        Request → approval → disbursement → monthly deduction → settlement. A deduction traces to an instalment row,
        so payroll never recomputes what is owed: an unapproved loan deducts nothing at all.
      </p>

      {employeeLoans.map((loan) => (
        <section className="nx-hr-unit" key={loan.id}>
          <header>
            <div>
              <span className="nx-eyebrow">{loan.kind} · {loan.id}</span>
              <h2>{fullName(employee(loan.employeeId)!)} — {formatMoney(loan.principal)}</h2>
              <p>{loan.reason}</p>
            </div>
            <div className="nx-txn-detail__actions">
              <span className={`nx-att-chip nx-att-chip--${loan.status === "Settled" ? "present" : loan.status === "Requested" ? "half" : "leave"}`}>{loan.status}</span>
              {loan.status === "Requested" ? (
                <button className="nx-button nx-button-primary" type="button" onClick={() => onAction("Approve loan", loan.id)}>Approve</button>
              ) : (
                <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Settle early", loan.id)}>Settle early</button>
              )}
            </div>
          </header>
          <div className="nx-hr-fields">
            <div><span>Instalment</span><strong>{formatMoney(loan.instalmentAmount)}</strong></div>
            <div><span>Outstanding</span><strong>{formatMoney(loanOutstanding(loan))}</strong></div>
            <div><span>Approved by</span><strong>{loan.approvedBy ?? "Not yet approved"}</strong></div>
            <div><span>Disbursed</span><strong>{loan.disbursedOn ?? "—"}</strong></div>
          </div>
          {loan.instalments.length > 0 ? (
            <table className="nx-data-table">
              <thead><tr><th>Instalment</th><th>Period</th><th className="amount">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {loan.instalments.map((instalment) => (
                  <tr key={instalment.id}>
                    <td>{instalment.id}</td>
                    <td>{instalment.period}</td>
                    <td className="amount">{formatMoney(instalment.amount)}</td>
                    <td><span className={`nx-att-chip nx-att-chip--${instalment.status === "Deducted" ? "present" : "half"}`}>{instalment.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ))}

      <section className="nx-hr-unit">
        <header><div><span className="nx-eyebrow">Adjustments</span><h2>Bonus, arrears and recoveries</h2></div></header>
        <table className="nx-data-table">
          <thead><tr><th>Reference</th><th>Employee</th><th>Period</th><th>Kind</th><th>Component</th><th className="amount">Amount</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>
            {payrollAdjustments.map((adjustment) => (
              <tr key={adjustment.id}>
                <td>{adjustment.id}</td>
                <td>{fullName(employee(adjustment.employeeId)!)}</td>
                <td>{adjustment.period}</td>
                <td>{adjustment.kind}</td>
                <td>{adjustment.componentCode}</td>
                <td className="amount">{formatMoney(adjustment.amount)}</td>
                <td>{adjustment.reason}</td>
                <td><span className={`nx-att-chip nx-att-chip--${adjustment.status === "Approved" ? "present" : "half"}`}>{adjustment.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PayrollJournalScreen({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const journal = buildPayrollJournal(run, period);

  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        <article><span>Total debit</span><strong>{formatMoney(journal.totalDebit)}</strong><small>Payroll expense</small></article>
        <article><span>Total credit</span><strong>{formatMoney(journal.totalCredit)}</strong><small>Payables and recoveries</small></article>
        <article className={journal.balanced ? undefined : "warning"}>
          <span>Balanced</span><strong>{journal.balanced ? "Yes" : "No"}</strong><small>Debits against credits</small>
        </article>
        <article><span>Value date</span><strong>{journal.date}</strong><small>Salary date</small></article>
      </div>

      <p className="nx-hr-notice" role="note">
        Payroll never touches a balance. It proposes this journal and the Finance module posts it, so the ledger keeps
        one posting path. The proposal is refused unless debits equal credits to the cent — rather than letting the
        ledger reject it after the fact.
      </p>

      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead><tr><th>Account</th><th>Description</th><th className="amount">Debit</th><th className="amount">Credit</th></tr></thead>
          <tbody>
            {journal.lines.map((line, index) => (
              <tr key={`${line.account}-${index}`}>
                <td>{line.account}</td>
                <td>{line.description}</td>
                <td className="amount">{line.debit ? formatMoney(line.debit) : "—"}</td>
                <td className="amount">{line.credit ? formatMoney(line.credit) : "—"}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={2}><strong>Total</strong></td>
              <td className="amount"><strong>{formatMoney(journal.totalDebit)}</strong></td>
              <td className="amount"><strong>{formatMoney(journal.totalCredit)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="nx-worksheet__actions">
        <button
          className="nx-button nx-button-primary"
          disabled={!journal.balanced || period.status !== "Approved"}
          title={period.status !== "Approved" ? "The payroll must be approved before it can be posted" : undefined}
          type="button"
          onClick={() => onAction("Post to general ledger", period.name)}
        >
          Post to general ledger
        </button>
      </div>
    </div>
  );
}

function PaymentBatchScreen({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const batch = paymentBatchFor(run, period);
  const payable = canMarkPaid(batch);

  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        <article><span>Payments</span><strong>{batch.payments.length}</strong><small>One per employee</small></article>
        <article><span>Batch total</span><strong>{formatMoney(batch.payments.reduce((total, row) => total + row.amount, 0))}</strong><small>Net pay</small></article>
        <article><span>Value date</span><strong>{batch.valueDate}</strong><small>Salary date</small></article>
        <article className={payable ? undefined : "warning"}><span>Ready to mark paid</span><strong>{payable ? "Yes" : "No"}</strong><small>{payable ? "All references confirmed" : "Awaiting bank references"}</small></article>
      </div>

      <p className="nx-hr-notice" role="note">
        A period cannot be marked paid until every line carries a bank payment reference. Marking payroll paid with no
        payment record is the easiest way for a system to claim money moved when it did not.
      </p>

      <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead><tr><th>Employee</th><th>Bank account</th><th className="amount">Amount</th><th>Reference</th><th>Status</th></tr></thead>
          <tbody>
            {batch.payments.map((payment) => (
              <tr key={payment.employeeId}>
                <td>{payment.employeeName}</td>
                <td>{payment.bankAccount}</td>
                <td className="amount">{formatMoney(payment.amount)}</td>
                <td>{payment.reference ?? "—"}</td>
                <td><span className={`nx-att-chip nx-att-chip--${payment.status === "Confirmed" ? "present" : "half"}`}>{payment.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="nx-worksheet__actions">
        <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Generate bank instruction", period.name)}>Generate bank instruction</button>
        <button
          className="nx-button nx-button-primary"
          disabled={!payable}
          title={payable ? undefined : "Every payment needs a confirmed bank reference first"}
          type="button"
          onClick={() => onAction("Mark paid", period.name)}
        >
          Mark paid
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Payslip({ result, onAction }: { result: PayrollResult; onAction: (action: string, subject?: string) => void }) {
  const earnings = result.items.filter((item) => item.kind === "Earning");
  const deductions = result.items.filter((item) => item.kind === "Deduction");
  const person = employee(result.employeeId);

  return (
    <section className="nx-payslip">
      <header>
        <div>
          <span className="nx-eyebrow">Nexora Services (Private) Limited</span>
          <h2>Payslip — {period.name}</h2>
          <p>{result.employeeName} · {result.employeeNumber} · {result.department}</p>
        </div>
        <div className="nx-txn-detail__actions">
          <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Print payslip", result.employeeName)}>Print</button>
          <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Email payslip", result.employeeName)}>Email securely</button>
        </div>
      </header>

      <div className="nx-hr-fields">
        <div><span>Pay period</span><strong>{period.startDate} – {period.endDate}</strong></div>
        <div><span>Salary date</span><strong>{period.salaryDate}</strong></div>
        <div><span>Paid days</span><strong>{result.paidDays} of {result.paidDays + result.unpaidDays}</strong></div>
        <div><span>Overtime hours</span><strong>{result.overtimeHours.toFixed(2)}</strong></div>
        <div><span>Bank account</span><strong>{person?.bankAccounts.find((row) => row.isPrimary)?.iban ?? "—"}</strong></div>
        <div><span>Currency</span><strong>{result.currency}</strong></div>
      </div>

      <div className="nx-payslip__columns">
        <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead><tr><th>Earnings</th><th>Basis</th><th className="amount">Amount</th></tr></thead>
          <tbody>
            {earnings.map((item) => (
              <tr key={item.componentCode}>
                <td>{item.componentName}</td>
                <td><small>{item.basis}</small></td>
                <td className="amount">{formatMoney(item.amount, result.currency)}</td>
              </tr>
            ))}
            <tr><td colSpan={2}><strong>Gross earnings</strong></td><td className="amount"><strong>{formatMoney(result.grossEarnings, result.currency)}</strong></td></tr>
          </tbody>
        </table>
        </div>

        <div className="nx-table-wrap">
        <table className="nx-data-table">
          <thead><tr><th>Deductions</th><th>Basis</th><th className="amount">Amount</th></tr></thead>
          <tbody>
            {deductions.length === 0 ? (
              <tr><td colSpan={3} className="nx-statement-table__empty">No deductions this period.</td></tr>
            ) : deductions.map((item) => (
              <tr key={item.componentCode}>
                <td>{item.componentName}</td>
                <td><small>{item.basis}</small></td>
                <td className="amount">{formatMoney(item.amount, result.currency)}</td>
              </tr>
            ))}
            <tr><td colSpan={2}><strong>Total deductions</strong></td><td className="amount"><strong>{formatMoney(result.totalDeductions, result.currency)}</strong></td></tr>
          </tbody>
        </table>
        </div>
      </div>

      <div className="nx-payslip__net">
        <span>Net pay</span>
        <strong>{formatMoney(result.netPay, result.currency)}</strong>
        <small>Gross {formatMoney(result.grossEarnings, result.currency)} less deductions {formatMoney(result.totalDeductions, result.currency)}</small>
      </div>
    </section>
  );
}

function Payslips({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const [employeeId, setEmployeeId] = useState(run.results[0]?.employeeId ?? "");
  const result = run.results.find((row) => row.employeeId === employeeId) ?? run.results[0];

  return (
    <div className="nx-recon">
      <div className="nx-worksheet__controls">
        <label>
          <span>Employee</span>
          <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            {run.results.map((row) => (
              <option key={row.employeeId} value={row.employeeId}>{row.employeeNumber} — {row.employeeName}</option>
            ))}
          </select>
        </label>
        <label><span>Period</span><input readOnly value={period.name} /></label>
      </div>
      {result ? <Payslip result={result} onAction={onAction} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function HrPayrollScreen({
  pageId,
  onAction,
}: {
  pageId: string;
  onAction: (action: string, subject?: string) => void;
}) {
  if (pageId === "payroll-setup") return <PayComponents />;
  if (pageId === "salary-structures") return <SalaryStructures />;
  if (pageId === "salary-revisions") return <SalaryRevisions onAction={onAction} />;
  if (pageId === "payroll-runs") return <PayrollRuns onAction={onAction} />;
  if (pageId === "payroll-validation") return <PayrollReview onAction={onAction} />;
  if (pageId === "employee-loans") return <Loans onAction={onAction} />;
  if (pageId === "payroll-journal") return <PayrollJournalScreen onAction={onAction} />;
  if (pageId === "payment-batch") return <PaymentBatchScreen onAction={onAction} />;
  return <Payslips onAction={onAction} />;
}
