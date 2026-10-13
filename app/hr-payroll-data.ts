/**
 * Phase 3 - payroll for the isolated Nexora UI/UX prototype.
 *
 * Phases 1 and 2 supply the employee, organisation, approval, attendance and
 * leave shapes; nothing here redefines them. Three rules shape everything:
 *
 *   1. A payroll result is a SNAPSHOT, not a view. Once calculated, each
 *      employee's result holds the amounts themselves, not a pointer to the
 *      salary structure that produced them. A revision next month cannot alter
 *      what September paid. (Phase 2 is deliberately the opposite: attendance
 *      is derived every time, because a punch can legitimately be corrected.
 *      A payment cannot.)
 *   2. Payroll reads its inputs and never writes them. There is no function
 *      here that edits a punch, a leave balance or an attendance period.
 *   3. Money is calculated in exactly one place. The review screen, the
 *      payslip, the journal and the payment batch all read the one snapshot,
 *      so they cannot disagree.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

import { assignmentOn, employedStatuses, employee, employees, fullName, orgUnitName, type Employee } from "./hr-core-data.ts";
import { payrollInput, periodIsLocked, type PayrollInput } from "./hr-attendance-data.ts";

/* ------------------------------------------------------------------ */
/* Money - integers in minor units, never floats                       */
/* ------------------------------------------------------------------ */

/**
 * Every amount in this module is an integer number of paisa/cents. Floating
 * point is not used for money anywhere: 0.1 + 0.2 must never appear on a
 * payslip.
 */
export function money(major: number): number {
  return Math.round(major * 100);
}

export function formatMoney(minor: number, currency = "PKR"): string {
  const symbol = currency === "PKR" ? "Rs " : currency === "USD" ? "$" : `${currency} `;
  const value = (Math.abs(minor) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${minor < 0 ? "-" : ""}${symbol}${value}`;
}

/* ------------------------------------------------------------------ */
/* Formula engine                                                      */
/* ------------------------------------------------------------------ */

export class FormulaError extends Error {}

const FUNCTIONS: Readonly<Record<string, (...args: number[]) => number>> = {
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  round: (value) => Math.round(value),
};

/**
 * A deliberately small expression evaluator.
 *
 * It supports numbers, whitelisted identifiers, `+ - * / ( )` and the three
 * functions above - and nothing else. It is a parser, not `eval`: a formula
 * cannot reach a global, call a method, or read anything outside the variable
 * map it is handed. A payroll rule is configuration written by an
 * administrator, so it must not be able to execute code.
 *
 * An unknown identifier is an error rather than zero. Silently treating a
 * misspelled variable as nil is how an allowance quietly disappears from
 * everyone's pay.
 */
export function evaluateFormula(expression: string, variables: Readonly<Record<string, number>>): number {
  const tokens = expression.match(/\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/,]|\S/g) ?? [];
  let position = 0;

  const peek = () => tokens[position];
  const next = () => tokens[position++];

  function parseExpression(): number {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const operator = next();
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const operator = next();
      const right = parseFactor();
      if (operator === "/" && right === 0) throw new FormulaError(`division by zero in "${expression}"`);
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  function parseFactor(): number {
    const token = next();
    if (token === undefined) throw new FormulaError(`unexpected end of "${expression}"`);
    if (token === "-") return -parseFactor();
    if (token === "+") return parseFactor();
    if (token === "(") {
      const value = parseExpression();
      if (next() !== ")") throw new FormulaError(`unbalanced brackets in "${expression}"`);
      return value;
    }
    if (/^\d/.test(token)) return Number(token);
    if (/^[A-Za-z_]/.test(token)) {
      if (peek() === "(") {
        const fn = FUNCTIONS[token];
        if (!fn) throw new FormulaError(`unknown function ${token} in "${expression}"`);
        next();
        const args: number[] = [];
        if (peek() !== ")") {
          args.push(parseExpression());
          while (peek() === ",") {
            next();
            args.push(parseExpression());
          }
        }
        if (next() !== ")") throw new FormulaError(`unbalanced brackets in "${expression}"`);
        return fn(...args);
      }
      if (!(token in variables)) {
        throw new FormulaError(`unknown variable ${token} in "${expression}"`);
      }
      return variables[token];
    }
    throw new FormulaError(`unexpected "${token}" in "${expression}"`);
  }

  const result = parseExpression();
  if (position !== tokens.length) throw new FormulaError(`unexpected "${peek()}" in "${expression}"`);
  if (!Number.isFinite(result)) throw new FormulaError(`"${expression}" did not produce a number`);
  return result;
}

/* ------------------------------------------------------------------ */
/* Pay components                                                      */
/* ------------------------------------------------------------------ */

export type ComponentKind = "Earning" | "Deduction";
export type ComponentBasis = "Fixed" | "Formula";

export interface PayComponent {
  id: string;
  code: string;
  name: string;
  kind: ComponentKind;
  basis: ComponentBasis;
  /** Only for Formula components. */
  formula: string | null;
  taxable: boolean;
  recurring: boolean;
  /** Evaluation order. A formula may only reference lower priorities. */
  priority: number;
  /** Reduced in proportion to paid days - true for salary, false for a loan. */
  prorated: boolean;
  glAccount: string;
  effectiveFrom: string;
  status: "Active" | "Inactive";
}

export const payComponents: readonly PayComponent[] = [
  { id: "PC-BASIC", code: "BASIC", name: "Basic Salary", kind: "Earning", basis: "Fixed", formula: null, taxable: true, recurring: true, priority: 10, prorated: true, glAccount: "60-01-00100", effectiveFrom: "2021-01-01", status: "Active" },
  { id: "PC-HRA", code: "HOUSE_RENT", name: "House Rent Allowance", kind: "Earning", basis: "Formula", formula: "BASIC_FULL * 0.40", taxable: true, recurring: true, priority: 20, prorated: true, glAccount: "60-01-00100", effectiveFrom: "2021-01-01", status: "Active" },
  { id: "PC-MED", code: "MEDICAL", name: "Medical Allowance", kind: "Earning", basis: "Formula", formula: "BASIC_FULL * 0.10", taxable: false, recurring: true, priority: 30, prorated: true, glAccount: "60-01-00100", effectiveFrom: "2021-01-01", status: "Active" },
  { id: "PC-TRN", code: "TRANSPORT", name: "Transport Allowance", kind: "Earning", basis: "Fixed", formula: null, taxable: false, recurring: true, priority: 40, prorated: true, glAccount: "60-01-00100", effectiveFrom: "2021-01-01", status: "Active" },
  { id: "PC-OT", code: "OVERTIME", name: "Overtime", kind: "Earning", basis: "Formula", formula: "round(HOURLY_RATE * (OT_HOURS_REGULAR * 1.5 + OT_HOURS_WEEKEND * 2 + OT_HOURS_HOLIDAY * 2.5))", taxable: true, recurring: false, priority: 50, prorated: false, glAccount: "60-01-00100", effectiveFrom: "2021-01-01", status: "Active" },
  { id: "PC-BON", code: "BONUS", name: "Bonus", kind: "Earning", basis: "Fixed", formula: null, taxable: true, recurring: false, priority: 60, prorated: false, glAccount: "60-01-00100", effectiveFrom: "2021-01-01", status: "Active" },
  { id: "PC-ARR", code: "ARREARS", name: "Arrears", kind: "Earning", basis: "Fixed", formula: null, taxable: true, recurring: false, priority: 70, prorated: false, glAccount: "60-01-00100", effectiveFrom: "2021-01-01", status: "Active" },

  { id: "PC-UNP", code: "UNPAID_LEAVE", name: "Unpaid Leave Recovery", kind: "Deduction", basis: "Formula", formula: "round(DAILY_RATE * UNPAID_DAYS)", taxable: false, recurring: false, priority: 100, prorated: false, glAccount: "60-01-00100", effectiveFrom: "2021-01-01", status: "Active" },
  { id: "PC-PF", code: "PROVIDENT_FUND", name: "Provident Fund", kind: "Deduction", basis: "Formula", formula: "round(BASIC * 0.05)", taxable: false, recurring: true, priority: 110, prorated: false, glAccount: "20-02-00100", effectiveFrom: "2021-01-01", status: "Active" },
  { id: "PC-TAX", code: "TAX", name: "Income Tax", kind: "Deduction", basis: "Formula", formula: "round(max(0, (GROSS_TAXABLE - 5000000) * 0.05))", taxable: false, recurring: true, priority: 120, prorated: false, glAccount: "20-03-00200", effectiveFrom: "2021-01-01", status: "Active" },
  { id: "PC-LOAN", code: "LOAN", name: "Loan Instalment", kind: "Deduction", basis: "Fixed", formula: null, taxable: false, recurring: true, priority: 130, prorated: false, glAccount: "10-02-00200", effectiveFrom: "2021-01-01", status: "Active" },
  { id: "PC-ADV", code: "ADVANCE", name: "Advance Recovery", kind: "Deduction", basis: "Fixed", formula: null, taxable: false, recurring: false, priority: 140, prorated: false, glAccount: "10-02-00200", effectiveFrom: "2021-01-01", status: "Active" },
];

export function payComponent(code: string): PayComponent | undefined {
  return payComponents.find((row) => row.code === code);
}

/* ------------------------------------------------------------------ */
/* Salary structures and assignments                                   */
/* ------------------------------------------------------------------ */

export interface StructureItem {
  componentCode: string;
  /** Minor units for a fixed component; ignored for a formula component. */
  amount: number | null;
}

export interface SalaryStructure {
  id: string;
  code: string;
  name: string;
  currency: string;
  effectiveFrom: string;
  items: readonly StructureItem[];
  status: "Active" | "Inactive";
}

export const salaryStructures: readonly SalaryStructure[] = [
  {
    id: "SST-EXEC", code: "EXEC", name: "Executive", currency: "PKR", effectiveFrom: "2026-01-01", status: "Active",
    items: [
      { componentCode: "BASIC", amount: money(600000) },
      { componentCode: "HOUSE_RENT", amount: null },
      { componentCode: "MEDICAL", amount: null },
      { componentCode: "TRANSPORT", amount: money(40000) },
    ],
  },
  {
    id: "SST-MGT", code: "MGT", name: "Management", currency: "PKR", effectiveFrom: "2026-01-01", status: "Active",
    items: [
      { componentCode: "BASIC", amount: money(300000) },
      { componentCode: "HOUSE_RENT", amount: null },
      { componentCode: "MEDICAL", amount: null },
      { componentCode: "TRANSPORT", amount: money(25000) },
    ],
  },
  {
    id: "SST-PROF", code: "PROF", name: "Professional", currency: "PKR", effectiveFrom: "2026-01-01", status: "Active",
    items: [
      { componentCode: "BASIC", amount: money(180000) },
      { componentCode: "HOUSE_RENT", amount: null },
      { componentCode: "MEDICAL", amount: null },
      { componentCode: "TRANSPORT", amount: money(15000) },
    ],
  },
  {
    id: "SST-ASSOC", code: "ASSOC", name: "Associate", currency: "PKR", effectiveFrom: "2026-01-01", status: "Active",
    items: [
      { componentCode: "BASIC", amount: money(90000) },
      { componentCode: "HOUSE_RENT", amount: null },
      { componentCode: "MEDICAL", amount: null },
      { componentCode: "TRANSPORT", amount: money(10000) },
    ],
  },
];

export function salaryStructure(id: string): SalaryStructure | undefined {
  return salaryStructures.find((row) => row.id === id);
}

export type AssignmentApproval = "Draft" | "Pending approval" | "Approved";

export interface SalaryAssignment {
  id: string;
  employeeId: string;
  structureId: string;
  /** Overrides the structure's fixed amounts for this employee, in minor units. */
  overrides: Readonly<Record<string, number>>;
  currency: string;
  frequency: "Monthly";
  effectiveFrom: string;
  effectiveTo: string | null;
  approval: AssignmentApproval;
  approvedBy: string | null;
  revisionId: string | null;
}

export const salaryAssignments: readonly SalaryAssignment[] = [
  { id: "SAL-001", employeeId: "EMP-1", structureId: "SST-EXEC", overrides: {}, currency: "PKR", frequency: "Monthly", effectiveFrom: "2026-01-01", effectiveTo: null, approval: "Approved", approvedBy: "Board", revisionId: null },
  { id: "SAL-002", employeeId: "EMP-2", structureId: "SST-MGT", overrides: {}, currency: "PKR", frequency: "Monthly", effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30", approval: "Approved", approvedBy: "Omar Siddiqui", revisionId: null },
  { id: "SAL-003", employeeId: "EMP-2", structureId: "SST-MGT", overrides: { BASIC: money(340000) }, currency: "PKR", frequency: "Monthly", effectiveFrom: "2026-07-01", effectiveTo: null, approval: "Approved", approvedBy: "Omar Siddiqui", revisionId: "REV-001" },
  { id: "SAL-004", employeeId: "EMP-3", structureId: "SST-PROF", overrides: { BASIC: money(220000) }, currency: "PKR", frequency: "Monthly", effectiveFrom: "2026-01-01", effectiveTo: null, approval: "Approved", approvedBy: "Omar Siddiqui", revisionId: null },
  { id: "SAL-005", employeeId: "EMP-4", structureId: "SST-MGT", overrides: {}, currency: "PKR", frequency: "Monthly", effectiveFrom: "2026-01-01", effectiveTo: null, approval: "Approved", approvedBy: "Omar Siddiqui", revisionId: null },
  { id: "SAL-006", employeeId: "EMP-5", structureId: "SST-MGT", overrides: { BASIC: money(260000) }, currency: "PKR", frequency: "Monthly", effectiveFrom: "2026-01-01", effectiveTo: null, approval: "Approved", approvedBy: "Omar Siddiqui", revisionId: null },
  { id: "SAL-007", employeeId: "EMP-7", structureId: "SST-PROF", overrides: {}, currency: "PKR", frequency: "Monthly", effectiveFrom: "2026-07-01", effectiveTo: null, approval: "Approved", approvedBy: "Sana Iqbal", revisionId: null },
];

/** The assignment in force on a date - never stored on the employee. */
export function salaryAssignmentOn(employeeId: string, onDate: string): SalaryAssignment | undefined {
  return salaryAssignments
    .filter((row) => row.employeeId === employeeId && row.approval === "Approved")
    .filter((row) => row.effectiveFrom <= onDate && (row.effectiveTo === null || row.effectiveTo >= onDate))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

/* ------------------------------------------------------------------ */
/* Salary revision                                                     */
/* ------------------------------------------------------------------ */

export type RevisionStatus = "Draft" | "Submitted" | "Pending approval" | "Approved" | "Rejected";

export interface SalaryRevision {
  id: string;
  employeeId: string;
  effectiveFrom: string;
  fromAssignmentId: string;
  toAssignmentId: string | null;
  oldGross: number;
  newGross: number;
  reason: string;
  status: RevisionStatus;
  requestedBy: string;
  requestedOn: string;
  approvedBy: string | null;
  approvedOn: string | null;
}

export const salaryRevisions: readonly SalaryRevision[] = [
  { id: "REV-001", employeeId: "EMP-2", effectiveFrom: "2026-07-01", fromAssignmentId: "SAL-002", toAssignmentId: "SAL-003", oldGross: money(475000), newGross: money(535000), reason: "Promotion to Finance Manager", status: "Approved", requestedBy: "Sana Iqbal", requestedOn: "2026-06-10", approvedBy: "Omar Siddiqui", approvedOn: "2026-06-18" },
  { id: "REV-002", employeeId: "EMP-5", effectiveFrom: "2026-10-01", fromAssignmentId: "SAL-006", toAssignmentId: null, oldGross: money(415000), newGross: money(455000), reason: "Annual review increase", status: "Pending approval", requestedBy: "Sana Iqbal", requestedOn: "2026-09-15", approvedBy: null, approvedOn: null },
];

/* ------------------------------------------------------------------ */
/* Loans, advances and adjustments                                     */
/* ------------------------------------------------------------------ */

export type LoanStatus = "Requested" | "Approved" | "Disbursed" | "Repaying" | "Settled" | "Rejected";

export interface LoanInstalment {
  id: string;
  period: string;
  amount: number;
  status: "Due" | "Deducted" | "Waived";
}

export interface EmployeeLoan {
  id: string;
  employeeId: string;
  kind: "Loan" | "Advance";
  principal: number;
  instalmentAmount: number;
  requestedOn: string;
  approvedBy: string | null;
  disbursedOn: string | null;
  status: LoanStatus;
  reason: string;
  instalments: readonly LoanInstalment[];
}

export const employeeLoans: readonly EmployeeLoan[] = [
  {
    id: "LON-001", employeeId: "EMP-3", kind: "Loan", principal: money(300000), instalmentAmount: money(50000),
    requestedOn: "2026-05-02", approvedBy: "Omar Siddiqui", disbursedOn: "2026-05-10", status: "Repaying",
    reason: "House repair",
    instalments: [
      { id: "LIN-001", period: "2026-06", amount: money(50000), status: "Deducted" },
      { id: "LIN-002", period: "2026-07", amount: money(50000), status: "Deducted" },
      { id: "LIN-003", period: "2026-08", amount: money(50000), status: "Deducted" },
      { id: "LIN-004", period: "2026-09", amount: money(50000), status: "Due" },
      { id: "LIN-005", period: "2026-10", amount: money(50000), status: "Due" },
      { id: "LIN-006", period: "2026-11", amount: money(50000), status: "Due" },
    ],
  },
  {
    id: "LON-002", employeeId: "EMP-7", kind: "Advance", principal: money(60000), instalmentAmount: money(30000),
    requestedOn: "2026-08-20", approvedBy: "Sana Iqbal", disbursedOn: "2026-08-25", status: "Repaying",
    reason: "Salary advance against September",
    instalments: [
      { id: "LIN-010", period: "2026-09", amount: money(30000), status: "Due" },
      { id: "LIN-011", period: "2026-10", amount: money(30000), status: "Due" },
    ],
  },
  {
    id: "LON-003", employeeId: "EMP-5", kind: "Loan", principal: money(150000), instalmentAmount: money(25000),
    requestedOn: "2026-09-12", approvedBy: null, disbursedOn: null, status: "Requested",
    reason: "Education fees", instalments: [],
  },
];

export function loanOutstanding(loan: EmployeeLoan): number {
  return loan.instalments.filter((row) => row.status === "Due").reduce((total, row) => total + row.amount, 0);
}

export function loanDeductionFor(employeeId: string, period: string): number {
  return employeeLoans
    .filter((loan) => loan.employeeId === employeeId && (loan.status === "Repaying" || loan.status === "Disbursed"))
    .flatMap((loan) => loan.instalments)
    .filter((row) => row.period === period && row.status !== "Waived")
    .reduce((total, row) => total + row.amount, 0);
}

export type AdjustmentKind = "Bonus" | "Arrears" | "Deduction" | "Allowance" | "Recovery";
export type AdjustmentStatus = "Draft" | "Pending approval" | "Approved" | "Rejected";

export interface PayrollAdjustment {
  id: string;
  employeeId: string;
  period: string;
  kind: AdjustmentKind;
  componentCode: string;
  amount: number;
  reason: string;
  status: AdjustmentStatus;
  requestedBy: string;
  approvedBy: string | null;
}

export const payrollAdjustments: readonly PayrollAdjustment[] = [
  { id: "ADJ-001", employeeId: "EMP-4", period: "2026-09", kind: "Bonus", componentCode: "BONUS", amount: money(75000), reason: "Client audit delivered ahead of schedule", status: "Approved", requestedBy: "Omar Siddiqui", approvedBy: "Omar Siddiqui" },
  { id: "ADJ-002", employeeId: "EMP-2", period: "2026-09", kind: "Arrears", componentCode: "ARREARS", amount: money(40000), reason: "July revision paid one month late", status: "Approved", requestedBy: "Sana Iqbal", approvedBy: "Omar Siddiqui" },
  { id: "ADJ-003", employeeId: "EMP-3", period: "2026-09", kind: "Deduction", componentCode: "ADVANCE", amount: money(15000), reason: "Unreturned equipment", status: "Pending approval", requestedBy: "Sana Iqbal", approvedBy: null },
];

/** Only approved adjustments reach payroll. A pending one changes nothing. */
export function adjustmentsFor(employeeId: string, period: string): readonly PayrollAdjustment[] {
  return payrollAdjustments.filter(
    (row) => row.employeeId === employeeId && row.period === period && row.status === "Approved",
  );
}

/* ------------------------------------------------------------------ */
/* Payroll period state machine                                        */
/* ------------------------------------------------------------------ */

export type PayrollPeriodStatus =
  | "Open" | "Processing" | "Calculated" | "Under review"
  | "Approved" | "Posted" | "Paid" | "Closed";

export const payrollPeriodStatuses: readonly PayrollPeriodStatus[] = [
  "Open", "Processing", "Calculated", "Under review", "Approved", "Posted", "Paid", "Closed",
];

/**
 * The only legal moves. Recalculation is allowed while a period is still being
 * worked on and never afterwards; a paid period cannot be reopened, and a
 * closed one goes nowhere at all.
 */
export const payrollTransitions: Readonly<Record<PayrollPeriodStatus, readonly PayrollPeriodStatus[]>> = {
  "Open": ["Processing"],
  "Processing": ["Calculated", "Open"],
  "Calculated": ["Under review", "Processing"],
  "Under review": ["Approved", "Processing"],
  "Approved": ["Posted"],
  "Posted": ["Paid"],
  "Paid": ["Closed"],
  "Closed": [],
};

export function canTransitionPayroll(from: PayrollPeriodStatus, to: PayrollPeriodStatus): boolean {
  return payrollTransitions[from].includes(to);
}

/** A period stops being editable the moment it is approved. */
export function isEditable(status: PayrollPeriodStatus): boolean {
  return ["Open", "Processing", "Calculated", "Under review"].includes(status);
}

export interface PayrollPeriod {
  id: string;
  period: string;
  name: string;
  startDate: string;
  endDate: string;
  salaryDate: string;
  companyId: string;
  branchId: string | null;
  status: PayrollPeriodStatus;
  approvals: readonly { level: number; role: string; by: string | null; on: string | null }[];
  postedJournalId: string | null;
  paymentBatchId: string | null;
}

export const payrollPeriods: readonly PayrollPeriod[] = [
  {
    id: "PRP-2026-08", period: "2026-08", name: "August 2026", startDate: "2026-08-01", endDate: "2026-08-31",
    salaryDate: "2026-09-03", companyId: "ORG-CO-001", branchId: null, status: "Closed",
    approvals: [
      { level: 1, role: "Payroll Manager", by: "Sana Iqbal", on: "2026-09-01" },
      { level: 2, role: "Finance Manager", by: "Mariam Ali", on: "2026-09-02" },
      { level: 3, role: "Management", by: "Omar Siddiqui", on: "2026-09-02" },
    ],
    postedJournalId: "JRN-2026-0841", paymentBatchId: "PMB-2026-08",
  },
  {
    id: "PRP-2026-09", period: "2026-09", name: "September 2026", startDate: "2026-09-01", endDate: "2026-09-30",
    salaryDate: "2026-10-03", companyId: "ORG-CO-001", branchId: null, status: "Calculated",
    approvals: [
      { level: 1, role: "Payroll Manager", by: null, on: null },
      { level: 2, role: "Finance Manager", by: null, on: null },
      { level: 3, role: "Management", by: null, on: null },
    ],
    postedJournalId: null, paymentBatchId: null,
  },
];

export function payrollPeriodFor(period: string): PayrollPeriod | undefined {
  return payrollPeriods.find((row) => row.period === period);
}

/* ------------------------------------------------------------------ */
/* Payroll policy                                                      */
/* ------------------------------------------------------------------ */

/**
 * How an unpaid day reduces pay. There are two accepted methods and they are
 * alternatives, never both:
 *
 *   - "Prorate earnings" pays only the days worked: earnings are reduced in
 *     proportion to paid days.
 *   - "Deduct daily rate" pays the full salary and takes the unpaid days back
 *     as a separate, visible deduction line.
 *
 * Applying both docks the employee twice for the same absence. That is a
 * genuine payroll defect, not a rounding difference, so the choice is
 * configuration and the engine enforces that exactly one is in effect.
 */
export type UnpaidDayMethod = "Prorate earnings" | "Deduct daily rate";

export interface PayrollPolicy {
  unpaidDayMethod: UnpaidDayMethod;
  /** Days used to derive a daily rate, so a 28-day month does not inflate it. */
  standardMonthDays: number;
  standardMonthHours: number;
}

export const payrollPolicy: PayrollPolicy = {
  unpaidDayMethod: "Prorate earnings",
  standardMonthDays: 30,
  standardMonthHours: 208,
};

/* ------------------------------------------------------------------ */
/* Calculation                                                         */
/* ------------------------------------------------------------------ */

export interface PayrollItem {
  componentCode: string;
  componentName: string;
  kind: ComponentKind;
  amount: number;
  taxable: boolean;
  /** How the number was arrived at, so a payslip can be explained. */
  basis: string;
  glAccount: string;
}

export interface PayrollResult {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  department: string;
  period: string;
  currency: string;
  structureId: string;
  assignmentId: string;
  items: readonly PayrollItem[];
  grossEarnings: number;
  grossTaxable: number;
  totalDeductions: number;
  netPay: number;
  paidDays: number;
  unpaidDays: number;
  overtimeHours: number;
  /** Set once the snapshot is taken; a later revision cannot change it. */
  calculatedOn: string;
  warnings: readonly string[];
}



/**
 * Calculates one employee for one period.
 *
 * Inputs are read, never written: the Phase 2 payroll input arrives as a
 * value, and nothing here can alter attendance, leave or a loan schedule.
 */
export function calculateEmployee(
  person: Employee,
  period: PayrollPeriod,
  input: PayrollInput,
): PayrollResult | null {
  const assignment = salaryAssignmentOn(person.id, period.endDate);
  if (!assignment) return null;
  const structure = salaryStructure(assignment.structureId);
  if (!structure) return null;

  const orgAssignment = assignmentOn(person.id, period.endDate);
  const warnings: string[] = [];

  const fixedFor = (code: string): number | null => {
    if (code in assignment.overrides) return assignment.overrides[code];
    const item = structure.items.find((row) => row.componentCode === code);
    return item?.amount ?? null;
  };

  // The structure's own fixed basic is the reference for every rate, so a
  // proration or an unpaid day is measured against contracted pay rather than
  // against what this month happens to produce.
  const contractedBasic = fixedFor("BASIC") ?? 0;
  const variables: Record<string, number> = {
    PAID_DAYS: input.paidDays,
    UNPAID_DAYS: input.unpaidDays,
    CALENDAR_DAYS: input.calendarDays,
    OT_HOURS_REGULAR: input.overtimeByCategory.Regular,
    OT_HOURS_WEEKEND: input.overtimeByCategory.Weekend,
    OT_HOURS_HOLIDAY: input.overtimeByCategory.Holiday,
    DAILY_RATE: contractedBasic / payrollPolicy.standardMonthDays,
    HOURLY_RATE: contractedBasic / payrollPolicy.standardMonthHours,
    GROSS_TAXABLE: 0,
    // Contracted basic, before any proration: the base an allowance is a
    // percentage *of*. The paid BASIC is published below once it is known.
    BASIC_FULL: contractedBasic,
  };

  const items: PayrollItem[] = [];
  const adjustments = adjustmentsFor(person.id, period.period);
  const loanDue = loanDeductionFor(person.id, period.period);

  const included = payComponents
    .filter((component) => component.status === "Active")
    .filter((component) => component.effectiveFrom <= period.endDate)
    .slice()
    .sort((a, b) => a.priority - b.priority);

  const proratePolicy = payrollPolicy.unpaidDayMethod === "Prorate earnings";
  const prorationFactor = proratePolicy && input.calendarDays > 0 ? input.paidDays / input.calendarDays : 1;

  for (const component of included) {
    let amount: number | null = null;
    let basis = "";

    const structureItem = structure.items.some((row) => row.componentCode === component.code)
      || component.code in assignment.overrides;
    const adjustment = adjustments.find((row) => row.componentCode === component.code);

    // Under proration the unpaid days are already absent from earnings, so
    // taking them again as a deduction would dock the employee twice.
    if (component.code === "UNPAID_LEAVE" && proratePolicy) continue;

    if (component.code === "LOAN") {
      if (loanDue > 0) {
        amount = loanDue;
        basis = "Instalments due this period";
      }
    } else if (adjustment) {
      amount = adjustment.amount;
      basis = `${adjustment.kind} — ${adjustment.reason}`;
    } else if (structureItem && component.basis === "Fixed") {
      amount = fixedFor(component.code);
      basis = "Salary structure";
    } else if (component.basis === "Formula" && component.formula) {
      // A formula component only applies if its inputs make sense: the
      // overtime component is nil when there was no overtime, rather than a
      // zero line on every payslip.
      try {
        const computed = evaluateFormula(component.formula, variables);
        if (Math.abs(computed) >= 1) {
          amount = Math.round(computed);
          basis = component.formula;
        }
      } catch (error) {
        warnings.push(`${component.code}: ${(error as Error).message}`);
      }
    }

    if (amount === null) continue;

    const contracted = amount;
    if (component.prorated && prorationFactor < 1) {
      amount = Math.round(amount * prorationFactor);
      basis = `${basis} · prorated ${input.paidDays}/${input.calendarDays} of ${formatMoney(contracted, structure.currency)}`;
    }

    // Two variables per component: what was paid, and what was contracted.
    // A deduction on actual pay reads CODE; an allowance derived from the
    // contract reads CODE_FULL and is prorated once, by itself.
    variables[component.code] = amount;
    variables[`${component.code}_FULL`] = contracted;
    if (component.kind === "Earning" && component.taxable) {
      variables.GROSS_TAXABLE = (variables.GROSS_TAXABLE ?? 0) + amount;
    }

    items.push({
      componentCode: component.code,
      componentName: component.name,
      kind: component.kind,
      amount,
      taxable: component.taxable,
      basis,
      glAccount: component.glAccount,
    });
  }

  const grossEarnings = items.filter((row) => row.kind === "Earning").reduce((total, row) => total + row.amount, 0);
  const totalDeductions = items.filter((row) => row.kind === "Deduction").reduce((total, row) => total + row.amount, 0);
  const netPay = grossEarnings - totalDeductions;

  if (netPay < 0) {
    warnings.push("Deductions exceed earnings; net pay would be negative and must be reviewed");
  }
  if (!input.releasable) {
    warnings.push(`Attendance period ${input.month} is ${input.periodState}, not locked`);
  }

  return {
    employeeId: person.id,
    employeeNumber: person.employeeNumber,
    employeeName: fullName(person),
    department: orgAssignment ? orgUnitName(orgAssignment.departmentId) : "—",
    period: period.period,
    currency: structure.currency,
    structureId: structure.id,
    assignmentId: assignment.id,
    items,
    grossEarnings,
    grossTaxable: variables.GROSS_TAXABLE,
    totalDeductions,
    netPay,
    paidDays: input.paidDays,
    unpaidDays: input.unpaidDays,
    overtimeHours: input.overtimeHours,
    calculatedOn: "2026-09-18T09:00:00Z",
    warnings,
  };
}

/** Everyone the period pays: employed, with an approved salary assignment. */
export function payrollEmployees(period: PayrollPeriod): readonly Employee[] {
  return employees
    .filter((person) => employedStatuses.includes(person.status))
    .filter((person) => salaryAssignmentOn(person.id, period.endDate) !== undefined);
}

export function calculatePeriod(period: PayrollPeriod): readonly PayrollResult[] {
  return payrollEmployees(period)
    .map((person) => {
      const orgAssignment = assignmentOn(person.id, period.endDate);
      const input = payrollInput(person, period.period, orgAssignment);
      return calculateEmployee(person, period, input);
    })
    .filter((result): result is PayrollResult => result !== null);
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

/**
 * The stored result of a run. August is a snapshot: it holds its own amounts
 * and is never recalculated, which is what makes it survive the salary
 * revisions that came after it.
 */
export interface PayrollRun {
  id: string;
  period: string;
  calculatedOn: string;
  calculatedBy: string;
  results: readonly PayrollResult[];
}

function augustSnapshot(): PayrollRun {
  const period = payrollPeriodFor("2026-08")!;
  return {
    id: "PRN-2026-08",
    period: "2026-08",
    calculatedOn: "2026-09-01T10:15:00Z",
    calculatedBy: "Sana Iqbal",
    results: calculatePeriod(period),
  };
}

/**
 * The August run is materialised once, at module load, and then frozen. Later
 * reads return the same objects, so nothing that happens to a salary structure
 * afterwards can change what August paid.
 */
export const closedRuns: readonly PayrollRun[] = Object.freeze([
  Object.freeze(augustSnapshot()),
]);

export function runFor(period: string): PayrollRun | undefined {
  const closed = closedRuns.find((row) => row.period === period);
  if (closed) return closed;
  const payrollPeriod = payrollPeriodFor(period);
  if (!payrollPeriod) return undefined;
  return {
    id: `PRN-${period}`,
    period,
    calculatedOn: "2026-09-18T09:00:00Z",
    calculatedBy: "Sana Iqbal",
    results: calculatePeriod(payrollPeriod),
  };
}

/* ------------------------------------------------------------------ */
/* Payroll totals and review                                           */
/* ------------------------------------------------------------------ */

export interface PayrollTotals {
  employees: number;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  byDepartment: readonly { department: string; employees: number; gross: number; net: number }[];
  exceptions: readonly { employeeName: string; detail: string }[];
}

export function payrollTotals(run: PayrollRun): PayrollTotals {
  const byDepartment = new Map<string, { employees: number; gross: number; net: number }>();
  for (const result of run.results) {
    const row = byDepartment.get(result.department) ?? { employees: 0, gross: 0, net: 0 };
    row.employees += 1;
    row.gross += result.grossEarnings;
    row.net += result.netPay;
    byDepartment.set(result.department, row);
  }
  const exceptions = run.results.flatMap((result) =>
    result.warnings.map((detail) => ({ employeeName: result.employeeName, detail })),
  );
  return {
    employees: run.results.length,
    grossEarnings: run.results.reduce((total, row) => total + row.grossEarnings, 0),
    totalDeductions: run.results.reduce((total, row) => total + row.totalDeductions, 0),
    netPay: run.results.reduce((total, row) => total + row.netPay, 0),
    byDepartment: [...byDepartment.entries()]
      .map(([department, row]) => ({ department, ...row }))
      .sort((a, b) => b.gross - a.gross),
    exceptions,
  };
}

/** Month-on-month movement, which is what a reviewer actually looks for. */
export function payrollVariance(current: PayrollRun, previous: PayrollRun | undefined): readonly {
  employeeName: string;
  previousNet: number;
  currentNet: number;
  difference: number;
  percent: number;
  reason: string;
}[] {
  if (!previous) return [];
  const rows: { employeeName: string; previousNet: number; currentNet: number; difference: number; percent: number; reason: string }[] = [];
  for (const result of current.results) {
    const before = previous.results.find((row) => row.employeeId === result.employeeId);
    const previousNet = before?.netPay ?? 0;
    const difference = result.netPay - previousNet;
    if (previousNet === 0) {
      rows.push({ employeeName: result.employeeName, previousNet, currentNet: result.netPay, difference, percent: 100, reason: "New in this payroll" });
      continue;
    }
    const percent = (difference / previousNet) * 100;
    if (Math.abs(percent) >= 5) {
      const bonus = result.items.find((row) => row.componentCode === "BONUS");
      const arrears = result.items.find((row) => row.componentCode === "ARREARS");
      const overtime = result.items.find((row) => row.componentCode === "OVERTIME");
      const reason = bonus ? "Bonus paid" : arrears ? "Arrears paid" : overtime ? "Overtime" : result.unpaidDays > 0 ? "Unpaid days" : "Salary change";
      rows.push({ employeeName: result.employeeName, previousNet, currentNet: result.netPay, difference, percent, reason });
    }
  }
  return rows.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}

/* ------------------------------------------------------------------ */
/* Accounting hand-off                                                 */
/* ------------------------------------------------------------------ */

export interface JournalLine {
  account: string;
  description: string;
  debit: number;
  credit: number;
}

export interface PayrollJournal {
  reference: string;
  period: string;
  date: string;
  lines: readonly JournalLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

/**
 * Builds the journal payroll proposes to Finance. Payroll never touches a
 * balance: it produces this, and the finance service posts it.
 *
 * Earnings are an expense; the net is a payable to the employee; every
 * deduction is a payable or a recovery against its own account. Debits must
 * equal credits to the cent, and the caller refuses to offer an unbalanced
 * journal rather than letting the ledger reject it later.
 */
export function buildPayrollJournal(run: PayrollRun, period: PayrollPeriod): PayrollJournal {
  const debits = new Map<string, number>();
  const credits = new Map<string, number>();
  const add = (map: Map<string, number>, account: string, amount: number) =>
    map.set(account, (map.get(account) ?? 0) + amount);

  for (const result of run.results) {
    for (const item of result.items) {
      if (item.kind === "Earning") add(debits, item.glAccount, item.amount);
      else add(credits, item.glAccount, item.amount);
    }
    add(credits, "20-02-00100", result.netPay);
  }

  const lines: JournalLine[] = [
    ...[...debits.entries()].map(([account, amount]) => ({
      account, description: "Payroll earnings", debit: amount, credit: 0,
    })),
    ...[...credits.entries()].map(([account, amount]) => ({
      account, description: account === "20-02-00100" ? "Net payable and statutory deductions" : "Payroll deduction", debit: 0, credit: amount,
    })),
  ];

  const totalDebit = lines.reduce((total, row) => total + row.debit, 0);
  const totalCredit = lines.reduce((total, row) => total + row.credit, 0);
  return {
    reference: period.postedJournalId ?? `JRN-${period.period}-DRAFT`,
    period: period.period,
    date: period.salaryDate,
    lines,
    totalDebit,
    totalCredit,
    balanced: totalDebit === totalCredit,
  };
}

/* ------------------------------------------------------------------ */
/* Payment                                                             */
/* ------------------------------------------------------------------ */

export interface Payment {
  employeeId: string;
  employeeName: string;
  bankAccount: string;
  amount: number;
  reference: string | null;
  status: "Pending" | "Instructed" | "Confirmed";
}

export interface PaymentBatch {
  id: string;
  period: string;
  bankAccountId: string;
  valueDate: string;
  status: "Draft" | "Instructed" | "Confirmed";
  payments: readonly Payment[];
}

export function paymentBatchFor(run: PayrollRun, period: PayrollPeriod): PaymentBatch {
  const confirmed = period.status === "Paid" || period.status === "Closed";
  return {
    id: period.paymentBatchId ?? `PMB-${period.period}-DRAFT`,
    period: period.period,
    bankAccountId: "BA-4472",
    valueDate: period.salaryDate,
    status: confirmed ? "Confirmed" : "Draft",
    payments: run.results.map((result) => {
      const person = employee(result.employeeId);
      const account = person?.bankAccounts.find((row) => row.isPrimary);
      return {
        employeeId: result.employeeId,
        employeeName: result.employeeName,
        bankAccount: account ? account.iban : "No bank account on file",
        amount: result.netPay,
        reference: confirmed ? `FT${period.period.replace("-", "")}${result.employeeNumber.slice(-4)}` : null,
        status: confirmed ? "Confirmed" : "Pending",
      };
    }),
  };
}

/**
 * A period may only be marked paid once every employee line carries a payment
 * reference. "Mark paid" with no payment record is the easiest way for a
 * payroll system to lie about money having moved.
 */
export function canMarkPaid(batch: PaymentBatch): boolean {
  return batch.payments.length > 0 && batch.payments.every((row) => row.reference !== null && row.status === "Confirmed");
}

/** Payroll may only run against a locked attendance period. */
export function canCalculate(period: PayrollPeriod): boolean {
  return isEditable(period.status) && periodIsLocked(period.period);
}

export const PAYROLL_PERIOD = "2026-09";
