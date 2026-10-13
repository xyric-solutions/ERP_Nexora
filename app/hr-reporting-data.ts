/**
 * HR Phase 5 reporting read model.
 *
 * This module deliberately owns no payroll, attendance, leave or accounting
 * calculation. It composes the approved Phase 1–4 masters and finalized
 * transactional snapshots into permission-aware report projections.
 */

import {
  assignmentOn,
  employeeName,
  employees,
  employedStatuses,
  masterRecord,
  orgUnitName,
  orgUnits,
} from "./hr-core-data.ts";
import {
  attendancePeriods,
  formatHours,
  leaveRequests,
  leaveType,
  leaveTypes,
  monthlyAttendance,
} from "./hr-attendance-data.ts";
import {
  buildPayrollJournal,
  closedRuns,
  payrollPeriodFor,
  payrollPeriods,
  payrollTotals,
  type PayrollResult,
} from "./hr-payroll-data.ts";

export type HrReportDomain = "HR" | "Attendance" | "Leave" | "Payroll" | "Payroll accounting";
export type ReportSensitivity = "Internal" | "Confidential" | "Highly confidential";
export type ReportPermission = "hr.report.view" | "attendance.report.view" | "leave.report.view" | "payroll.report.view" | "payroll.accounting.view";
export type ExportFormat = "PDF" | "Excel" | "CSV";

export interface HrReportDefinition {
  id: string;
  title: string;
  domain: HrReportDomain;
  description: string;
  permission: ReportPermission;
  sensitivity: ReportSensitivity;
  source: string;
  dimensions: readonly string[];
  metrics: readonly string[];
  drillTarget: { moduleId: string; pageId: string };
  strategy: "live projection" | "summary view" | "background export";
}

const report = (
  id: string,
  title: string,
  domain: HrReportDomain,
  description: string,
  permission: ReportPermission,
  sensitivity: ReportSensitivity,
  source: string,
  dimensions: readonly string[],
  metrics: readonly string[],
  drillTarget: { moduleId: string; pageId: string },
  strategy: HrReportDefinition["strategy"] = "live projection",
): HrReportDefinition => ({ id, title, domain, description, permission, sensitivity, source, dimensions, metrics, drillTarget, strategy });

export const hrReportDefinitions: readonly HrReportDefinition[] = [
  report("employee-list-report", "Employee List", "HR", "Authoritative employee register with current assignment and lifecycle status.", "hr.report.view", "Internal", "Employee master + effective-dated assignment", ["Company", "Branch", "Department", "Status"], ["Employees", "Active"], { moduleId: "hr", pageId: "employee-record" }),
  report("employee-directory-report", "Employee Directory", "HR", "Permission-safe business contact directory.", "hr.report.view", "Internal", "Employee master", ["Branch", "Department", "Designation"], ["Employees"], { moduleId: "hr", pageId: "employees" }),
  report("department-employees-report", "Department-wise Employees", "HR", "Headcount distributed by the effective department assignment.", "hr.report.view", "Internal", "Effective-dated assignment", ["Department", "Status"], ["Headcount", "Share"], { moduleId: "hr", pageId: "org-structure" }, "summary view"),
  report("branch-employees-report", "Branch-wise Employees", "HR", "Headcount and status by authorized branch.", "hr.report.view", "Internal", "Effective-dated assignment", ["Branch", "Status"], ["Headcount", "Share"], { moduleId: "hr", pageId: "org-structure" }, "summary view"),
  report("designation-employees-report", "Designation-wise Employees", "HR", "Employees grouped by approved designation master.", "hr.report.view", "Internal", "Assignment + designation master", ["Designation", "Grade"], ["Headcount"], { moduleId: "hr", pageId: "designations" }, "summary view"),
  report("employee-status-report", "Employee Status Report", "HR", "Current employee state with its latest approved transition.", "hr.report.view", "Confidential", "Employee master + status history", ["Status", "Branch", "Department"], ["Employees", "Pending approval"], { moduleId: "hr", pageId: "employee-record" }),
  report("new-joiners-report", "New Joiners", "HR", "Employees whose join date falls inside the selected period.", "hr.report.view", "Confidential", "Employee master", ["Join date", "Branch", "Department"], ["New joiners"], { moduleId: "hr", pageId: "onboarding" }),
  report("employee-exits-report", "Exits", "HR", "Approved resignations and terminations effective in the selected period.", "hr.report.view", "Confidential", "Employee status history + lifecycle cases", ["Exit date", "Reason", "Department"], ["Exits"], { moduleId: "hr", pageId: "offboarding" }),
  report("employee-turnover-report", "Employee Turnover", "HR", "Joiners, exits and average headcount with a traceable turnover rate.", "hr.report.view", "Confidential", "Employee master + status history", ["Period", "Department", "Branch"], ["Joiners", "Exits", "Average headcount", "Turnover"], { moduleId: "hr", pageId: "offboarding" }, "summary view"),
  report("employee-history-report", "Employee History", "HR", "Effective-dated assignment and status history without overwriting prior state.", "hr.report.view", "Highly confidential", "Assignment history + status history", ["Employee", "Effective date", "Change type"], ["Movements"], { moduleId: "hr", pageId: "employee-record" }, "background export"),
  report("document-expiry-report", "Document Expiry", "HR", "Employee documents due or expired within the selected horizon.", "hr.report.view", "Highly confidential", "Employee document satellites", ["Expiry window", "Document type", "Branch"], ["Expired", "Due soon"], { moduleId: "hr", pageId: "employee-record" }),

  report("daily-attendance-report", "Daily Attendance", "Attendance", "Derived day status from the locked attendance period.", "attendance.report.view", "Confidential", "Locked attendance period + approved punches", ["Date", "Branch", "Department", "Status"], ["Present", "Absent", "Exceptions"], { moduleId: "hr", pageId: "daily-attendance" }),
  report("monthly-attendance-report", "Monthly Attendance", "Attendance", "Employee attendance totals for a locked month.", "attendance.report.view", "Confidential", "Locked attendance period", ["Month", "Department", "Employee"], ["Paid days", "Absent", "Late", "Overtime"], { moduleId: "hr", pageId: "monthly-attendance" }, "summary view"),
  report("absence-report", "Absence", "Attendance", "Unapproved absence occurrences from locked attendance.", "attendance.report.view", "Confidential", "Locked attendance period", ["Date", "Department", "Employee"], ["Absent days"], { moduleId: "hr", pageId: "daily-attendance" }),
  report("late-attendance-report", "Late", "Attendance", "Late arrivals with minutes and shift context.", "attendance.report.view", "Confidential", "Locked attendance period + shift rules", ["Date", "Department", "Employee"], ["Late days", "Late minutes"], { moduleId: "hr", pageId: "daily-attendance" }),
  report("early-departure-report", "Early Departure", "Attendance", "Early departures with approved correction context.", "attendance.report.view", "Confidential", "Locked attendance period + corrections", ["Date", "Department", "Employee"], ["Early departures", "Minutes"], { moduleId: "hr", pageId: "attendance-corrections" }),
  report("overtime-report", "Overtime", "Attendance", "Approved overtime hours by category and employee.", "attendance.report.view", "Confidential", "Locked attendance period + overtime approvals", ["Category", "Department", "Employee"], ["Hours", "Employees"], { moduleId: "hr", pageId: "overtime" }),
  report("missing-punch-report", "Missing Punch", "Attendance", "Missing IN/OUT events that required correction or remain unresolved.", "attendance.report.view", "Confidential", "Locked attendance period + corrections", ["Date", "Branch", "Employee"], ["Missing punches", "Resolved"], { moduleId: "hr", pageId: "attendance-corrections" }),
  report("department-attendance-report", "Department Attendance", "Attendance", "Attendance rate and exception load by department.", "attendance.report.view", "Confidential", "Locked attendance summary", ["Department", "Month"], ["Attendance rate", "Absence", "Exceptions"], { moduleId: "hr", pageId: "monthly-attendance" }, "summary view"),
  report("employee-attendance-summary-report", "Employee Attendance Summary", "Attendance", "Employee-level monthly attendance, leave and overtime summary.", "attendance.report.view", "Confidential", "Locked attendance summary", ["Employee", "Month"], ["Present", "Leave", "Absent", "Overtime"], { moduleId: "hr", pageId: "monthly-attendance" }, "summary view"),

  report("leave-balance-report", "Leave Balance", "Leave", "Opening, accrual, usage and available balance by employee and leave type.", "leave.report.view", "Confidential", "Leave ledger", ["Employee", "Leave type", "Department"], ["Opening", "Accrued", "Used", "Available"], { moduleId: "hr", pageId: "leave-balances" }),
  report("leave-taken-report", "Leave Taken", "Leave", "Approved leave used in the selected period.", "leave.report.view", "Confidential", "Approved leave requests", ["Period", "Leave type", "Department"], ["Days taken", "Employees"], { moduleId: "hr", pageId: "leave-requests" }),
  report("leave-pending-report", "Leave Pending", "Leave", "Manager and HR approval queues with ageing.", "leave.report.view", "Confidential", "Submitted leave requests", ["Approval stage", "Department", "Age"], ["Requests", "Days requested"], { moduleId: "hr", pageId: "leave-approval" }),
  report("leave-department-report", "Leave by Department", "Leave", "Approved and pending leave by effective department.", "leave.report.view", "Confidential", "Leave requests + assignment", ["Department", "Status"], ["Days", "Employees"], { moduleId: "hr", pageId: "leave-requests" }, "summary view"),
  report("leave-type-report", "Leave by Type", "Leave", "Leave usage and remaining liability by approved leave type.", "leave.report.view", "Confidential", "Leave ledger + leave type master", ["Leave type", "Status"], ["Taken", "Available"], { moduleId: "hr", pageId: "leave-types" }, "summary view"),
  report("leave-trend-report", "Leave Trend", "Leave", "Period trend for approved leave and pending demand.", "leave.report.view", "Confidential", "Leave requests", ["Period", "Leave type"], ["Days", "Requests"], { moduleId: "hr", pageId: "leave-requests" }, "summary view"),

  report("payroll-register-report", "Payroll Register", "Payroll", "Employee-level finalized payroll with earnings, deductions and net pay.", "payroll.report.view", "Highly confidential", "Closed payroll snapshot", ["Period", "Company", "Branch", "Department"], ["Gross", "Deductions", "Net"], { moduleId: "hr", pageId: "payroll-runs" }, "background export"),
  report("salary-sheet-report", "Salary Sheet", "Payroll", "Final salary sheet with component and attendance traceability.", "payroll.report.view", "Highly confidential", "Closed payroll snapshot", ["Employee", "Department", "Component"], ["Gross", "Net", "Paid days"], { moduleId: "hr", pageId: "payslips" }, "background export"),
  report("department-payroll-report", "Department Payroll", "Payroll", "Final gross and net payroll by cost-owning department.", "payroll.report.view", "Highly confidential", "Closed payroll snapshot + assignment", ["Department", "Period"], ["Employees", "Gross", "Net"], { moduleId: "hr", pageId: "payroll-runs" }, "summary view"),
  report("branch-payroll-report", "Branch Payroll", "Payroll", "Final payroll by authorized branch.", "payroll.report.view", "Highly confidential", "Closed payroll snapshot + assignment", ["Branch", "Period"], ["Employees", "Gross", "Net"], { moduleId: "hr", pageId: "payroll-runs" }, "summary view"),
  report("earnings-summary-report", "Earnings Summary", "Payroll", "Final earning components and their GL destinations.", "payroll.report.view", "Highly confidential", "Closed payroll items", ["Component", "Department"], ["Amount", "Employees"], { moduleId: "hr", pageId: "payroll-journal" }, "summary view"),
  report("deduction-summary-report", "Deduction Summary", "Payroll", "Final deduction components with payable or recovery account.", "payroll.report.view", "Highly confidential", "Closed payroll items", ["Component", "Department"], ["Amount", "Employees"], { moduleId: "hr", pageId: "payroll-journal" }, "summary view"),
  report("tax-summary-report", "Tax Summary", "Payroll", "Final payroll tax withholding by employee and configured tax rule.", "payroll.report.view", "Highly confidential", "Closed payroll TAX items + tax configuration", ["Period", "Employee", "Tax rule"], ["Taxable pay", "Tax withheld"], { moduleId: "hr", pageId: "statutory-deductions" }, "background export"),
  report("overtime-payroll-report", "Overtime Payroll", "Payroll", "Approved overtime hours traced to finalized payroll earnings.", "payroll.report.view", "Highly confidential", "Locked attendance + closed payroll OVERTIME item", ["Employee", "Category", "Department"], ["Hours", "Amount"], { moduleId: "hr", pageId: "overtime" }),
  report("bonus-report", "Bonus Report", "Payroll", "Approved bonus inputs appearing in finalized payroll.", "payroll.report.view", "Highly confidential", "Closed payroll BONUS items", ["Employee", "Department", "Approval"], ["Bonus amount"], { moduleId: "hr", pageId: "payroll-inputs" }),
  report("loan-recovery-report", "Loan Recovery", "Payroll", "Loan instalments recovered through finalized payroll.", "payroll.report.view", "Highly confidential", "Closed payroll LOAN items + loan schedule", ["Employee", "Loan", "Period"], ["Recovered", "Outstanding"], { moduleId: "hr", pageId: "employee-loans" }),
  report("advance-recovery-report", "Advance Recovery", "Payroll", "Salary advance recoveries in finalized payroll.", "payroll.report.view", "Highly confidential", "Closed payroll ADVANCE items", ["Employee", "Period"], ["Recovered", "Outstanding"], { moduleId: "hr", pageId: "employee-loans" }),
  report("payroll-variance-report", "Payroll Variance", "Payroll", "Month-on-month employee and component movement with reason codes.", "payroll.report.view", "Highly confidential", "Closed payroll snapshots", ["Employee", "Department", "Reason"], ["Previous", "Current", "Variance"], { moduleId: "hr", pageId: "payroll-validation" }, "summary view"),
  report("net-salary-report", "Net Salary Report", "Payroll", "Final net salary and verified payment destination.", "payroll.report.view", "Highly confidential", "Closed payroll + verified employee bank account", ["Employee", "Bank", "Currency"], ["Net salary"], { moduleId: "hr", pageId: "payment-batch" }, "background export"),

  report("payroll-general-ledger-report", "General Ledger", "Payroll accounting", "Balanced payroll journal prepared for Finance, with source-run traceability.", "payroll.accounting.view", "Highly confidential", "Closed payroll → balanced journal", ["Account", "Cost centre", "Period"], ["Debit", "Credit"], { moduleId: "finance", pageId: "general-ledger" }, "background export"),
  report("salary-payable-report", "Salary Payable", "Payroll accounting", "Net employee liability and payment-batch status.", "payroll.accounting.view", "Highly confidential", "Payroll journal + payment batch", ["Period", "Branch", "Payment status"], ["Payable", "Paid", "Outstanding"], { moduleId: "hr", pageId: "payment-batch" }, "summary view"),
  report("tax-payable-report", "Tax Payable", "Payroll accounting", "Withheld tax liability reconciled to the payroll journal.", "payroll.accounting.view", "Highly confidential", "Payroll journal TAX liability", ["Period", "Jurisdiction", "Account"], ["Tax withheld", "Posted", "Outstanding"], { moduleId: "finance", pageId: "general-ledger" }),
  report("employee-receivables-report", "Employee Receivables", "Payroll accounting", "Loans and advances recovered through payroll and their remaining receivable.", "payroll.accounting.view", "Highly confidential", "Payroll recoveries + employee loan ledger", ["Employee", "Recovery type", "Account"], ["Opening", "Recovered", "Closing"], { moduleId: "hr", pageId: "employee-loans" }),
  report("employer-contributions-report", "Employer Contributions", "Payroll accounting", "Configured employer contribution expense and payable by effective rule.", "payroll.accounting.view", "Highly confidential", "Contribution configuration + closed payroll", ["Contribution", "Department", "Cost centre"], ["Employer amount", "Employee amount"], { moduleId: "hr", pageId: "statutory-deductions" }, "summary view"),
  report("cost-centre-expenses-report", "Cost Center Expenses", "Payroll accounting", "Payroll expense distributed by authoritative cost-centre assignment.", "payroll.accounting.view", "Highly confidential", "Closed payroll + effective assignment", ["Cost centre", "Department", "GL account"], ["Payroll expense", "Employees"], { moduleId: "finance", pageId: "general-ledger" }, "summary view"),
];

export const phase5ReportIds = hrReportDefinitions.map((row) => row.id);

export interface ReportActor {
  id: string;
  name: string;
  role: string;
  companyIds: readonly string[];
  branchIds: readonly string[];
  permissions: readonly (ReportPermission | "report.export" | "report.audit.view" | "compliance.manage")[];
}

const allReportPermissions: readonly ReportPermission[] = ["hr.report.view", "attendance.report.view", "leave.report.view", "payroll.report.view", "payroll.accounting.view"];

export function reportActorForRole(role: string): ReportActor {
  const executive = ["Chief Executive Officer", "Chief Financial Officer", "Administrator"].includes(role);
  const finance = ["Finance Manager", "Accountant", "Auditor"].includes(role);
  const hr = role === "HR Manager";
  const permissions: ReportActor["permissions"] = executive
    ? [...allReportPermissions, "report.export", "report.audit.view", "compliance.manage"]
    : finance
      ? ["payroll.report.view", "payroll.accounting.view", "report.export", "report.audit.view"]
      : hr
        ? ["hr.report.view", "attendance.report.view", "leave.report.view", "payroll.report.view", "report.export", "compliance.manage"]
        : ["hr.report.view"];
  return {
    id: role.toLowerCase().replaceAll(" ", "-"),
    name: role,
    role,
    companyIds: ["ORG-CO-001"],
    branchIds: executive || finance || hr ? ["ORG-BR-001", "ORG-BR-002", "ORG-BR-003"] : ["ORG-BR-001"],
    permissions,
  };
}

export interface ReportFilters {
  companyId: string;
  branchId: string | "all";
  departmentId: string | "all";
  fromDate: string;
  toDate: string;
  status: string | "all";
}

export const defaultReportFilters: ReportFilters = {
  companyId: "ORG-CO-001",
  branchId: "all",
  departmentId: "all",
  fromDate: "2026-08-01",
  toDate: "2026-08-31",
  status: "all",
};

export function reportDefinition(id: string): HrReportDefinition | undefined {
  return hrReportDefinitions.find((row) => row.id === id);
}

export function canViewReport(actor: ReportActor, definition: HrReportDefinition): boolean {
  return actor.permissions.includes(definition.permission);
}

export function canExportReport(actor: ReportActor, definition: HrReportDefinition, format: ExportFormat): boolean {
  const supportedFormats: readonly ExportFormat[] = ["PDF", "Excel", "CSV"];
  return supportedFormats.includes(format) && canViewReport(actor, definition) && actor.permissions.includes("report.export");
}

export function validateReportScope(actor: ReportActor, filters: ReportFilters): readonly string[] {
  const issues: string[] = [];
  if (!actor.companyIds.includes(filters.companyId)) issues.push("Company is outside the user's authorized scope.");
  if (filters.branchId !== "all" && !actor.branchIds.includes(filters.branchId)) issues.push("Branch is outside the user's authorized scope.");
  if (filters.departmentId !== "all") {
    const department = orgUnits.find((unit) => unit.id === filters.departmentId && unit.type === "Department");
    if (!department || (filters.branchId !== "all" && department.parentId !== filters.branchId) || !actor.branchIds.includes(department.parentId ?? "")) {
      issues.push("Department is outside the selected or authorized branch scope.");
    }
  }
  if (filters.fromDate > filters.toDate) issues.push("From date must be on or before To date.");
  return issues;
}

export interface ReportAuditEvent {
  id: string;
  actorId: string;
  actorName: string;
  reportId: string;
  reportName: string;
  filters: ReportFilters;
  occurredAt: string;
  action: "Generated" | `Exported ${ExportFormat}`;
  companyId: string;
  branchId: string;
  outcome: "Allowed" | "Denied";
}

export function buildReportAuditEvent(
  actor: ReportActor,
  definition: HrReportDefinition,
  filters: ReportFilters,
  action: ReportAuditEvent["action"],
  occurredAt = "2026-09-21T10:30:00+05:00",
): ReportAuditEvent {
  const format = action.startsWith("Exported ") ? action.replace("Exported ", "") as ExportFormat : null;
  const allowed = validateReportScope(actor, filters).length === 0
    && (format ? canExportReport(actor, definition, format) : canViewReport(actor, definition));
  return {
    id: `RA-${definition.id}-${occurredAt.replaceAll(/[-:T+]/g, "").slice(0, 14)}`,
    actorId: actor.id,
    actorName: actor.name,
    reportId: definition.id,
    reportName: definition.title,
    filters: { ...filters },
    occurredAt,
    action,
    companyId: filters.companyId,
    branchId: filters.branchId,
    outcome: allowed ? "Allowed" : "Denied",
  };
}

export type ComplianceConfigurationKind = "Tax" | "Contribution" | "Payroll rule" | "Eligibility";
export interface ComplianceConfiguration {
  id: string;
  kind: ComplianceConfigurationKind;
  jurisdiction: string;
  companyId: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  employeeEligibility: string;
  version: number;
  status: "Draft" | "Approved" | "Superseded";
  approvedBy: string | null;
  parameters: Readonly<Record<string, string | number | boolean>>;
}

export const complianceConfigurations: readonly ComplianceConfiguration[] = [
  { id: "CMP-TAX-2026-01", kind: "Tax", jurisdiction: "PK-Federal", companyId: "ORG-CO-001", name: "Payroll withholding profile", effectiveFrom: "2026-07-01", effectiveTo: null, employeeEligibility: "Employees marked taxable in the approved employee master", version: 3, status: "Approved", approvedBy: "Mariam Ali", parameters: { schedule: "Configuration table TAX-PK-2026", rounding: "Nearest minor unit", declarationRequired: true } },
  { id: "CMP-CON-2026-01", kind: "Contribution", jurisdiction: "Company policy", companyId: "ORG-CO-001", name: "Retirement contribution profile", effectiveFrom: "2026-01-01", effectiveTo: null, employeeEligibility: "Confirmed employees enrolled in the contribution plan", version: 2, status: "Approved", approvedBy: "Omar Siddiqui", parameters: { employeeRate: 5, employerRate: 5, rateUnit: "Percent of eligible basic" } },
  { id: "CMP-PAY-2026-01", kind: "Payroll rule", jurisdiction: "Company policy", companyId: "ORG-CO-001", name: "Unpaid-day calculation", effectiveFrom: "2026-01-01", effectiveTo: null, employeeEligibility: "Payroll-paid employees", version: 4, status: "Approved", approvedBy: "Sana Iqbal", parameters: { method: "Prorate earnings", standardMonthDays: 30, standardMonthHours: 208 } },
  { id: "CMP-ELG-2026-01", kind: "Eligibility", jurisdiction: "Company policy", companyId: "ORG-CO-001", name: "Overtime eligibility", effectiveFrom: "2026-01-01", effectiveTo: null, employeeEligibility: "Eligible category and approved overtime request", version: 2, status: "Approved", approvedBy: "Sana Iqbal", parameters: { requiresPreApproval: true, excludeManagementGrade: true } },
];

export function effectiveCompliance(kind: ComplianceConfigurationKind, companyId: string, onDate: string): ComplianceConfiguration | undefined {
  return complianceConfigurations
    .filter((row) => row.kind === kind && row.companyId === companyId && row.status === "Approved")
    .filter((row) => row.effectiveFrom <= onDate && (row.effectiveTo === null || row.effectiveTo >= onDate))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export interface ReportTableRow {
  id: string;
  cells: readonly string[];
  source: { moduleId: string; pageId: string; recordRef: string };
}

export interface ReportSnapshot {
  definition: HrReportDefinition;
  sourceState: string;
  columns: readonly string[];
  rows: readonly ReportTableRow[];
  kpis: readonly { label: string; value: string; note: string }[];
  series: readonly { label: string; value: number }[];
  totalRows: number;
  pageSize: number;
  execution: "Interactive" | "Background export recommended";
}

const money = (value: number, currency = "PKR") => `${currency} ${Math.round(value).toLocaleString("en-US")}`;
const lockedAttendanceMonth = attendancePeriods.filter((row) => row.state === "Locked").sort((a, b) => b.month.localeCompare(a.month))[0]?.month ?? "2026-08";
const finalizedPayrollRun = closedRuns.at(-1);
const finalizedPayrollPeriod = finalizedPayrollRun ? payrollPeriodFor(finalizedPayrollRun.period) : undefined;

function inScope(filters: ReportFilters, employeeId: string, onDate = filters.toDate) {
  const assignment = assignmentOn(employeeId, onDate) ?? assignmentOn(employeeId, "2026-08-31");
  return Boolean(assignment
    && assignment.companyId === filters.companyId
    && (filters.branchId === "all" || assignment.branchId === filters.branchId)
    && (filters.departmentId === "all" || assignment.departmentId === filters.departmentId));
}

function employeeRows(filters: ReportFilters): readonly ReportTableRow[] {
  return employees.filter((person) => inScope(filters, person.id)).map((person) => {
    const assignment = assignmentOn(person.id, filters.toDate) ?? assignmentOn(person.id, "2026-08-31");
    return {
      id: person.id,
      cells: [person.employeeNumber, employeeName(person.id), orgUnitName(assignment?.departmentId ?? ""), masterRecord("designation", assignment?.designationId ?? "")?.name ?? "—", person.status, person.joinedOn],
      source: { moduleId: "hr", pageId: "employee-record", recordRef: person.id },
    };
  });
}

function attendanceRows(filters: ReportFilters): readonly ReportTableRow[] {
  return employees.filter((person) => inScope(filters, person.id, `${lockedAttendanceMonth}-31`)).map((person) => {
    const assignment = assignmentOn(person.id, `${lockedAttendanceMonth}-31`);
    const summary = monthlyAttendance(person, lockedAttendanceMonth, assignment);
    return {
      id: `${person.id}-${lockedAttendanceMonth}`,
      cells: [person.employeeNumber, employeeName(person.id), orgUnitName(assignment?.departmentId ?? ""), String(summary.present), String(summary.absent), String(summary.lateDays), formatHours(summary.overtimeMinutes), String(summary.exceptions)],
      source: { moduleId: "hr", pageId: "monthly-attendance", recordRef: person.id },
    };
  });
}

function leaveRows(filters: ReportFilters): readonly ReportTableRow[] {
  return leaveRequests.filter((row) => inScope(filters, row.employeeId)).map((row) => ({
    id: row.id,
    cells: [row.id, employeeName(row.employeeId), leaveType(row.leaveTypeId)?.name ?? row.leaveTypeId, row.fromDate, row.toDate, String(row.days), row.status],
    source: { moduleId: "hr", pageId: "leave-requests", recordRef: row.id },
  }));
}

function payrollRows(filters: ReportFilters): readonly ReportTableRow[] {
  return (finalizedPayrollRun?.results ?? []).filter((row) => inScope(filters, row.employeeId, finalizedPayrollPeriod?.endDate)).map((row) => ({
    id: `${finalizedPayrollRun?.id}-${row.employeeId}`,
    cells: [row.employeeNumber, row.employeeName, row.department, money(row.grossEarnings, row.currency), money(row.totalDeductions, row.currency), money(row.netPay, row.currency), String(row.paidDays)],
    source: { moduleId: "hr", pageId: "payslips", recordRef: row.employeeId },
  }));
}

function accountingRows(): readonly ReportTableRow[] {
  if (!finalizedPayrollRun || !finalizedPayrollPeriod) return [];
  const journal = buildPayrollJournal(finalizedPayrollRun, finalizedPayrollPeriod);
  return journal.lines.map((line, index) => ({
    id: `${journal.reference}-${index + 1}`,
    cells: [journal.reference, line.account, line.description, money(line.debit), money(line.credit), journal.balanced ? "Balanced" : "Blocked"],
    source: { moduleId: "finance", pageId: "general-ledger", recordRef: journal.reference },
  }));
}

function payrollComponentTotal(results: readonly PayrollResult[], code: string) {
  return results.reduce((total, row) => total + (row.items.find((item) => item.componentCode === code)?.amount ?? 0), 0);
}

export function buildReportSnapshot(definitionId: string, filters: ReportFilters = defaultReportFilters): ReportSnapshot | undefined {
  const definition = reportDefinition(definitionId);
  if (!definition) return undefined;
  const attendance = attendanceRows(filters);
  const payroll = finalizedPayrollRun ? payrollTotals(finalizedPayrollRun) : null;
  const people = employeeRows(filters);
  const leave = leaveRows(filters);
  const isAttendance = definition.domain === "Attendance";
  const isLeave = definition.domain === "Leave";
  const isPayroll = definition.domain === "Payroll";
  const isAccounting = definition.domain === "Payroll accounting";
  const rows = isAttendance ? attendance : isLeave ? leave : isPayroll ? payrollRows(filters) : isAccounting ? accountingRows() : people;
  const columns = isAttendance
    ? ["Employee #", "Employee", "Department", "Present", "Absent", "Late", "Overtime", "Exceptions"]
    : isLeave
      ? ["Request", "Employee", "Leave type", "From", "To", "Days", "Status"]
      : isPayroll
        ? ["Employee #", "Employee", "Department", "Gross", "Deductions", "Net", "Paid days"]
        : isAccounting
          ? ["Journal", "Account", "Description", "Debit", "Credit", "Control"]
          : ["Employee #", "Employee", "Department", "Designation", "Status", "Joined"];
  const active = employees.filter((person) => employedStatuses.includes(person.status)).length;
  const pendingLeave = leaveRequests.filter((row) => row.status.startsWith("Pending")).length;
  const kpis = isAttendance
    ? [{ label: "Locked month", value: lockedAttendanceMonth, note: "Finalized attendance only" }, { label: "Employees", value: String(attendance.length), note: "Within authorized scope" }, { label: "Exceptions", value: String(attendance.reduce((sum, row) => sum + Number(row.cells[7]), 0)), note: "Source drill-down available" }, { label: "Overtime", value: formatHours(attendance.reduce((sum, row) => sum + Number.parseFloat(row.cells[6]) * 60, 0)), note: "Approved/derived hours" }]
    : isLeave
      ? [{ label: "Requests", value: String(leave.length), note: "Selected scope" }, { label: "Pending", value: String(pendingLeave), note: "Manager or HR queue" }, { label: "Approved days", value: String(leaveRequests.filter((row) => row.status === "Approved").reduce((sum, row) => sum + row.days, 0)), note: "Approved requests" }, { label: "Leave types", value: String(leaveTypes.length), note: "Approved master" }]
      : isPayroll || isAccounting
        ? [{ label: "Finalized period", value: finalizedPayrollRun?.period ?? "—", note: "Closed snapshot only" }, { label: "Gross payroll", value: money(payroll?.grossEarnings ?? 0), note: "Approved source run" }, { label: "Deductions", value: money(payroll?.totalDeductions ?? 0), note: "Tax + recovery + contributions" }, { label: "Net payroll", value: money(payroll?.netPay ?? 0), note: isAccounting ? "Tied to salary payable" : "Payment handoff basis" }]
        : [{ label: "Employees", value: String(people.length), note: "Authorized scope" }, { label: "Active", value: String(active), note: "Authoritative status" }, { label: "New joiners", value: String(employees.filter((person) => person.joinedOn >= filters.fromDate && person.joinedOn <= filters.toDate).length), note: "Selected period" }, { label: "Documents due", value: String(employees.flatMap((person) => person.documents).filter((document) => document.expiresOn && document.expiresOn <= "2026-12-31").length), note: "Next review horizon" }];
  const series = isPayroll || isAccounting
    ? (payroll?.byDepartment.map((row) => ({ label: row.department, value: row.gross })) ?? [])
    : isLeave
      ? leaveTypes.map((type) => ({ label: type.name, value: leaveRequests.filter((row) => row.leaveTypeId === type.id && row.status === "Approved").reduce((sum, row) => sum + row.days, 0) }))
      : orgUnits.filter((unit) => unit.type === "Department").map((unit) => ({ label: unit.name, value: employees.filter((person) => assignmentOn(person.id)?.departmentId === unit.id).length }));
  return {
    definition,
    sourceState: isAttendance ? `${lockedAttendanceMonth} locked` : isPayroll || isAccounting ? `${finalizedPayrollRun?.period ?? "No"} closed payroll` : "Approved masters / submitted transactions",
    columns,
    rows,
    kpis,
    series,
    totalRows: rows.length,
    pageSize: 25,
    execution: definition.strategy === "background export" ? "Background export recommended" : "Interactive",
  };
}

export function hrDashboardSnapshot(filters: ReportFilters = defaultReportFilters) {
  const scopedEmployees = employees.filter((person) => inScope(filters, person.id));
  const activeEmployees = scopedEmployees.filter((person) => employedStatuses.includes(person.status));
  const attendance = attendanceRows(filters);
  const absences = attendance.reduce((sum, row) => sum + Number(row.cells[4]), 0);
  const overtimeHours = attendance.reduce((sum, row) => sum + Number.parseFloat(row.cells[6]), 0);
  const payroll = finalizedPayrollRun ? payrollTotals(finalizedPayrollRun) : null;
  return {
    metrics: [
      { label: "Total employees", value: String(scopedEmployees.length), note: "Authorized company and branch" },
      { label: "Active employees", value: String(activeEmployees.length), note: "Confirmed, probation or notice" },
      { label: "New joiners", value: String(scopedEmployees.filter((person) => person.joinedOn >= filters.fromDate && person.joinedOn <= filters.toDate).length), note: "Selected period" },
      { label: "Exits", value: String(scopedEmployees.filter((person) => ["Resigned", "Terminated"].includes(person.status)).length), note: "Current lifecycle state" },
      { label: "Attendance", value: attendance.length ? `${Math.max(0, 100 - (absences / (attendance.length * 22)) * 100).toFixed(1)}%` : "—", note: `${lockedAttendanceMonth} locked` },
      { label: "Absence", value: String(absences), note: "Employee-days" },
      { label: "Leave pending", value: String(leaveRequests.filter((row) => row.status.startsWith("Pending")).length), note: "Manager + HR" },
      { label: "Overtime", value: `${overtimeHours.toFixed(1)}h`, note: "Locked attendance" },
      { label: "Payroll total", value: money(payroll?.netPay ?? 0), note: `${finalizedPayrollRun?.period ?? "—"} finalized` },
    ],
    headcount: orgUnits.filter((unit) => unit.type === "Department").map((unit) => ({ label: unit.name, value: scopedEmployees.filter((person) => assignmentOn(person.id)?.departmentId === unit.id).length })),
  };
}

export function financePayrollDashboardSnapshot() {
  const run = finalizedPayrollRun;
  const totals = run ? payrollTotals(run) : null;
  const pending = payrollPeriods.filter((period) => period.status !== "Closed");
  return {
    metrics: [
      { label: "Gross payroll", value: money(totals?.grossEarnings ?? 0), note: `${run?.period ?? "—"} finalized` },
      { label: "Total deductions", value: money(totals?.totalDeductions ?? 0), note: "Configured payroll components" },
      { label: "Net payroll", value: money(totals?.netPay ?? 0), note: "Salary payable" },
      { label: "Tax withheld", value: money(run ? payrollComponentTotal(run.results, "TAX") : 0), note: "Tax payable reconciliation" },
      { label: "Pending approval", value: String(pending.length), note: "Payroll periods" },
      { label: "Pending payments", value: String(payrollPeriods.filter((period) => period.status !== "Closed" || !period.paymentBatchId).length), note: "Payment handoff" },
    ],
    payrollByDepartment: totals?.byDepartment ?? [],
    journal: run && finalizedPayrollPeriod ? buildPayrollJournal(run, finalizedPayrollPeriod) : null,
  };
}

export const reportingPerformancePolicy = {
  interactivePageSize: 25,
  maximumInteractiveRows: 10_000,
  backgroundExportThreshold: 10_000,
  requiredIndexes: [
    "employee_assignment(company_id, branch_id, department_id, effective_from, effective_to)",
    "attendance_fact(company_id, branch_id, attendance_date, employee_id, status)",
    "leave_request(company_id, employee_id, from_date, to_date, status)",
    "payroll_result(company_id, payroll_period_id, employee_id, department_id)",
    "report_audit(company_id, generated_at, report_id, actor_id)",
  ],
  summaryViews: ["hr_monthly_attendance_summary", "hr_monthly_headcount_snapshot", "payroll_department_summary", "payroll_gl_reconciliation"],
} as const;
