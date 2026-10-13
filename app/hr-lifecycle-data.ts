/**
 * Phase 4c — onboarding, probation, movement and separation fixtures for the
 * isolated Nexora UI/UX prototype.
 *
 * This is the visual specification of the employee-lifecycle half of Phase 4
 * (docs/business/hr-lifecycle-design.md in the main repository).
 *
 * Five rules are modelled as data:
 *
 *   - An approved movement PRODUCES a new effective-dated assignment row. It
 *     never edits the row in force: the previous row is closed the day before,
 *     so Phase 1's "no current-value field to overwrite" guarantee survives a
 *     transfer and a promotion.
 *   - A movement carries no money. If pay changes, a separate Phase 3 salary
 *     revision is raised and linked, and the movement cannot take effect until
 *     that revision is itself approved.
 *   - A termination needs every approver its reason demands. The authority
 *     matrix is data, so "who may terminate for misconduct" is a configuration
 *     question with an auditable answer.
 *   - A settlement cannot be paid before clearance is complete, and everything
 *     the company is owed — loans, advances, unreturned assets, notice
 *     shortfall — appears on it as a line with its source.
 *   - Nothing is deleted. A withdrawn resignation, a rejected termination and a
 *     cancelled redundancy stay on file, because they are the evidence for why
 *     someone is still employed.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

import {
  HR_TODAY,
  assignmentOn,
  assignmentsFor,
  canTransition,
  employee,
  employeeName,
  masterRecord,
  orgUnitName,
  type EmployeeAssignment,
  type EmployeeStatus,
} from "./hr-core-data.ts";
import { leaveBalance, leaveTypes } from "./hr-attendance-data.ts";
import {
  employeeLoans,
  formatMoney,
  loanOutstanding,
  money,
  payrollAdjustments,
  payrollPolicy,
  salaryAssignmentOn,
  salaryRevisions,
  salaryStructure,
  type SalaryAssignment,
} from "./hr-payroll-data.ts";
import { addMonths, daysBetween } from "./hr-recruitment-data.ts";

/* ------------------------------------------------------------------ */
/* 6. Onboarding                                                      */
/* ------------------------------------------------------------------ */

export type OnboardingCategory =
  | "Documents"
  | "Contract"
  | "Payroll"
  | "IT"
  | "Facilities"
  | "Orientation"
  | "Compliance"
  | "Attendance";

export interface OnboardingTaskTemplate {
  id: string;
  title: string;
  category: OnboardingCategory;
  ownerRole: string;
  /** Days from the joining date. Negative means before the first day. */
  dueOffsetDays: number;
  /**
   * A blocking task stops the record moving on: probation cannot be confirmed
   * and, for the payroll ones, the employee cannot be paid.
   */
  blocking: boolean;
  note: string;
}

export interface OnboardingTemplate {
  id: string;
  code: string;
  name: string;
  /** Empty means every employment type. */
  appliesToEmploymentTypeIds: readonly string[];
  tasks: readonly OnboardingTaskTemplate[];
  status: "Active" | "Inactive";
}

export const onboardingTemplates: readonly OnboardingTemplate[] = [
  {
    id: "OBT-001", code: "STD", name: "Standard onboarding", appliesToEmploymentTypeIds: [], status: "Active",
    tasks: [
      { id: "OBX-01", title: "Collect employee documents", category: "Documents", ownerRole: "HR Officer", dueOffsetDays: -3, blocking: true, note: "Identity, qualification and previous-employment documents." },
      { id: "OBX-02", title: "Issue and sign the employment contract", category: "Contract", ownerRole: "HR Manager", dueOffsetDays: 0, blocking: true, note: "Signed copy filed against the employee record." },
      { id: "OBX-03", title: "Capture bank account for salary payment", category: "Payroll", ownerRole: "HR Officer", dueOffsetDays: 3, blocking: true, note: "Verified account; salary cannot be paid without it." },
      { id: "OBX-04", title: "Capture tax identifier and filing status", category: "Payroll", ownerRole: "HR Officer", dueOffsetDays: 3, blocking: true, note: "Needed before the first payroll run." },
      { id: "OBX-05", title: "Create IT account and email", category: "IT", ownerRole: "IT Administrator", dueOffsetDays: 0, blocking: false, note: "" },
      { id: "OBX-06", title: "Issue access card", category: "Facilities", ownerRole: "Office Administrator", dueOffsetDays: 1, blocking: false, note: "" },
      { id: "OBX-07", title: "Issue equipment", category: "Facilities", ownerRole: "IT Administrator", dueOffsetDays: 1, blocking: false, note: "Laptop and peripherals, recorded as assets on loan." },
      { id: "OBX-08", title: "Department introduction", category: "Orientation", ownerRole: "Line Manager", dueOffsetDays: 2, blocking: false, note: "" },
      { id: "OBX-09", title: "Acknowledge company policies", category: "Compliance", ownerRole: "HR Officer", dueOffsetDays: 5, blocking: true, note: "Conduct, security and data-protection policies." },
      { id: "OBX-10", title: "Complete Nexora induction", category: "Orientation", ownerRole: "HR Officer", dueOffsetDays: 14, blocking: false, note: "Delivered through the induction training programme." },
      { id: "OBX-11", title: "Register for attendance and assign a shift", category: "Attendance", ownerRole: "HR Officer", dueOffsetDays: 0, blocking: true, note: "Biometric enrolment and a shift assignment, so attendance can be processed." },
      { id: "OBX-12", title: "Set probation goals", category: "Orientation", ownerRole: "Line Manager", dueOffsetDays: 10, blocking: false, note: "Goals recorded in the live performance cycle." },
    ],
  },
  {
    id: "OBT-002", code: "INTERN", name: "Internship onboarding", appliesToEmploymentTypeIds: ["EMT-005"], status: "Active",
    tasks: [
      { id: "OBY-01", title: "Collect candidate documents", category: "Documents", ownerRole: "HR Officer", dueOffsetDays: -2, blocking: true, note: "Identity and degree certificate." },
      { id: "OBY-02", title: "Issue and sign the internship agreement", category: "Contract", ownerRole: "HR Manager", dueOffsetDays: 0, blocking: true, note: "" },
      { id: "OBY-03", title: "Capture bank account for stipend payment", category: "Payroll", ownerRole: "HR Officer", dueOffsetDays: 3, blocking: true, note: "Stipend cannot be paid without it." },
      { id: "OBY-04", title: "Create IT account and email", category: "IT", ownerRole: "IT Administrator", dueOffsetDays: 0, blocking: false, note: "" },
      { id: "OBY-05", title: "Issue equipment", category: "Facilities", ownerRole: "IT Administrator", dueOffsetDays: 1, blocking: false, note: "" },
      { id: "OBY-06", title: "Acknowledge company policies", category: "Compliance", ownerRole: "HR Officer", dueOffsetDays: 5, blocking: true, note: "" },
      { id: "OBY-07", title: "Register for attendance and assign a shift", category: "Attendance", ownerRole: "HR Officer", dueOffsetDays: 0, blocking: true, note: "" },
      { id: "OBY-08", title: "Assign a mentor", category: "Orientation", ownerRole: "Line Manager", dueOffsetDays: 2, blocking: false, note: "Graduate programme requirement." },
      { id: "OBY-09", title: "Complete Nexora induction", category: "Orientation", ownerRole: "HR Officer", dueOffsetDays: 14, blocking: false, note: "" },
    ],
  },
];

export function onboardingTemplate(id: string): OnboardingTemplate | undefined {
  return onboardingTemplates.find((row) => row.id === id);
}

/** The template that applies to an employment type. */
export function templateForEmploymentType(employmentTypeId: string): OnboardingTemplate | undefined {
  const specific = onboardingTemplates.find(
    (row) => row.status === "Active" && row.appliesToEmploymentTypeIds.includes(employmentTypeId),
  );
  if (specific) return specific;
  return onboardingTemplates.find((row) => row.status === "Active" && row.appliesToEmploymentTypeIds.length === 0);
}

export type OnboardingTaskStatus = "Pending" | "In progress" | "Completed" | "Waived" | "Not applicable";

export interface OnboardingTask {
  id: string;
  checklistId: string;
  templateTaskId: string;
  title: string;
  category: OnboardingCategory;
  owner: string;
  dueOn: string;
  blocking: boolean;
  status: OnboardingTaskStatus;
  completedOn: string | null;
  completedBy: string | null;
  evidenceReference: string;
  note: string;
}

export type ChecklistStatus = "Not started" | "In progress" | "Blocked" | "Completed";

export interface OnboardingChecklist {
  id: string;
  reference: string;
  employeeId: string;
  templateId: string;
  /** The joining date every due date is derived from. */
  joiningDate: string;
  startedOn: string;
  status: ChecklistStatus;
  note: string;
}

export const onboardingChecklists: readonly OnboardingChecklist[] = [
  { id: "OBC-001", reference: "OBC-2026-0007", employeeId: "EMP-7", templateId: "OBT-001", joiningDate: "2026-07-01", startedOn: "2026-06-24", status: "In progress", note: "Induction still outstanding; the September cohort was cancelled." },
  { id: "OBC-002", reference: "OBC-2026-0008", employeeId: "EMP-8", templateId: "OBT-002", joiningDate: "2026-09-21", startedOn: "2026-09-16", status: "Blocked", note: "Bank account, policy acknowledgement and attendance registration outstanding; the employee record is still pending HR Manager approval." },
];

export const onboardingTasks: readonly OnboardingTask[] = [
  /* EMP-7 — joined 01 July 2026. */
  { id: "OBK-001", checklistId: "OBC-001", templateTaskId: "OBX-01", title: "Collect employee documents", category: "Documents", owner: "Sana Iqbal", dueOn: "2026-06-28", blocking: true, status: "Completed", completedOn: "2026-06-26", completedBy: "Sana Iqbal", evidenceReference: "DOC-9, DOC-10", note: "" },
  { id: "OBK-002", checklistId: "OBC-001", templateTaskId: "OBX-02", title: "Issue and sign the employment contract", category: "Contract", owner: "Sana Iqbal", dueOn: "2026-07-01", blocking: true, status: "Completed", completedOn: "2026-07-01", completedBy: "Sana Iqbal", evidenceReference: "CON-2026-0044", note: "" },
  { id: "OBK-003", checklistId: "OBC-001", templateTaskId: "OBX-03", title: "Capture bank account for salary payment", category: "Payroll", owner: "Sana Iqbal", dueOn: "2026-07-04", blocking: true, status: "Completed", completedOn: "2026-07-03", completedBy: "Sana Iqbal", evidenceReference: "EBA-7", note: "Account verified 03 July 2026." },
  { id: "OBK-004", checklistId: "OBC-001", templateTaskId: "OBX-04", title: "Capture tax identifier and filing status", category: "Payroll", owner: "Sana Iqbal", dueOn: "2026-07-04", blocking: true, status: "Completed", completedOn: "2026-07-02", completedBy: "Sana Iqbal", evidenceReference: "NTN 3520244556677", note: "" },
  { id: "OBK-005", checklistId: "OBC-001", templateTaskId: "OBX-05", title: "Create IT account and email", category: "IT", owner: "IT Service Desk", dueOn: "2026-07-01", blocking: false, status: "Completed", completedOn: "2026-06-30", completedBy: "IT Service Desk", evidenceReference: "zainab.farooq@nexora.example", note: "" },
  { id: "OBK-006", checklistId: "OBC-001", templateTaskId: "OBX-06", title: "Issue access card", category: "Facilities", owner: "Office Administrator", dueOn: "2026-07-02", blocking: false, status: "Completed", completedOn: "2026-07-01", completedBy: "Office Administrator", evidenceReference: "CARD-0188", note: "" },
  { id: "OBK-007", checklistId: "OBC-001", templateTaskId: "OBX-07", title: "Issue equipment", category: "Facilities", owner: "IT Service Desk", dueOn: "2026-07-02", blocking: false, status: "Completed", completedOn: "2026-07-01", completedBy: "IT Service Desk", evidenceReference: "AST-1142 laptop, AST-1143 monitor", note: "" },
  { id: "OBK-008", checklistId: "OBC-001", templateTaskId: "OBX-08", title: "Department introduction", category: "Orientation", owner: "Bilal Khan", dueOn: "2026-07-03", blocking: false, status: "Completed", completedOn: "2026-07-02", completedBy: "Bilal Khan", evidenceReference: "—", note: "" },
  { id: "OBK-009", checklistId: "OBC-001", templateTaskId: "OBX-09", title: "Acknowledge company policies", category: "Compliance", owner: "Sana Iqbal", dueOn: "2026-07-06", blocking: true, status: "Completed", completedOn: "2026-07-04", completedBy: "Zainab Farooq", evidenceReference: "POL-ACK-2026-0044", note: "" },
  { id: "OBK-010", checklistId: "OBC-001", templateTaskId: "OBX-10", title: "Complete Nexora induction", category: "Orientation", owner: "Sana Iqbal", dueOn: "2026-07-15", blocking: false, status: "Pending", completedOn: null, completedBy: null, evidenceReference: "", note: "No induction cohort ran in July; rebooked to the September session." },
  { id: "OBK-011", checklistId: "OBC-001", templateTaskId: "OBX-11", title: "Register for attendance and assign a shift", category: "Attendance", owner: "Sana Iqbal", dueOn: "2026-07-01", blocking: true, status: "Completed", completedOn: "2026-07-01", completedBy: "Sana Iqbal", evidenceReference: "SHA-004", note: "General day shift, Islamabad." },
  { id: "OBK-012", checklistId: "OBC-001", templateTaskId: "OBX-12", title: "Set probation goals", category: "Orientation", owner: "Bilal Khan", dueOn: "2026-07-11", blocking: false, status: "Completed", completedOn: "2026-07-08", completedBy: "Bilal Khan", evidenceReference: "GOL-022, GOL-023, GOL-024", note: "" },

  /* EMP-8 — joins 21 September 2026, three days after the prototype's today. */
  { id: "OBK-013", checklistId: "OBC-002", templateTaskId: "OBY-01", title: "Collect candidate documents", category: "Documents", owner: "Sana Iqbal", dueOn: "2026-09-19", blocking: true, status: "Completed", completedOn: "2026-09-17", completedBy: "Sana Iqbal", evidenceReference: "DOC-11, CDC-001, CDC-002", note: "Degree certificate carried across from the candidate record." },
  { id: "OBK-014", checklistId: "OBC-002", templateTaskId: "OBY-02", title: "Issue and sign the internship agreement", category: "Contract", owner: "Sana Iqbal", dueOn: "2026-09-21", blocking: true, status: "In progress", completedOn: null, completedBy: null, evidenceReference: "", note: "Agreement generated from offer OFR-2026-0019; awaiting signature on the first day." },
  { id: "OBK-015", checklistId: "OBC-002", templateTaskId: "OBY-03", title: "Capture bank account for stipend payment", category: "Payroll", owner: "Sana Iqbal", dueOn: "2026-09-24", blocking: true, status: "Pending", completedOn: null, completedBy: null, evidenceReference: "", note: "No account on file. The September stipend cannot be paid until it is captured and verified." },
  { id: "OBK-016", checklistId: "OBC-002", templateTaskId: "OBY-04", title: "Create IT account and email", category: "IT", owner: "IT Service Desk", dueOn: "2026-09-21", blocking: false, status: "In progress", completedOn: null, completedBy: null, evidenceReference: "", note: "Mailbox provisioned; access groups pending." },
  { id: "OBK-017", checklistId: "OBC-002", templateTaskId: "OBY-05", title: "Issue equipment", category: "Facilities", owner: "IT Service Desk", dueOn: "2026-09-22", blocking: false, status: "Pending", completedOn: null, completedBy: null, evidenceReference: "", note: "" },
  { id: "OBK-018", checklistId: "OBC-002", templateTaskId: "OBY-06", title: "Acknowledge company policies", category: "Compliance", owner: "Sana Iqbal", dueOn: "2026-09-26", blocking: true, status: "Pending", completedOn: null, completedBy: null, evidenceReference: "", note: "" },
  { id: "OBK-019", checklistId: "OBC-002", templateTaskId: "OBY-07", title: "Register for attendance and assign a shift", category: "Attendance", owner: "Sana Iqbal", dueOn: "2026-09-21", blocking: true, status: "Pending", completedOn: null, completedBy: null, evidenceReference: "", note: "Biometric enrolment booked for the first morning." },
  { id: "OBK-020", checklistId: "OBC-002", templateTaskId: "OBY-08", title: "Assign a mentor", category: "Orientation", owner: "Bilal Khan", dueOn: "2026-09-23", blocking: false, status: "Completed", completedOn: "2026-09-17", completedBy: "Bilal Khan", evidenceReference: "Mentor: Zainab Farooq", note: "" },
  { id: "OBK-021", checklistId: "OBC-002", templateTaskId: "OBY-09", title: "Complete Nexora induction", category: "Orientation", owner: "Sana Iqbal", dueOn: "2026-10-05", blocking: false, status: "Pending", completedOn: null, completedBy: null, evidenceReference: "TRS-2026-0023", note: "Booked on the 24 September induction session." },
];

export function checklist(id: string): OnboardingChecklist | undefined {
  return onboardingChecklists.find((row) => row.id === id);
}

export function checklistFor(employeeId: string): OnboardingChecklist | undefined {
  return onboardingChecklists.find((row) => row.employeeId === employeeId);
}

export function tasksFor(checklistId: string): readonly OnboardingTask[] {
  return onboardingTasks.filter((row) => row.checklistId === checklistId);
}

/** A task is settled when it is done, waived or does not apply. */
export function taskIsSettled(row: OnboardingTask): boolean {
  return row.status === "Completed" || row.status === "Waived" || row.status === "Not applicable";
}

export interface ChecklistProgress {
  checklistId: string;
  total: number;
  settled: number;
  outstanding: number;
  blockingOutstanding: readonly OnboardingTask[];
  overdue: readonly OnboardingTask[];
  percent: number;
  derivedStatus: ChecklistStatus;
}

export function checklistProgress(checklistId: string, onDate: string = HR_TODAY): ChecklistProgress {
  const rows = tasksFor(checklistId);
  const settled = rows.filter(taskIsSettled);
  const blockingOutstanding = rows.filter((row) => row.blocking && !taskIsSettled(row));
  const overdue = rows.filter((row) => !taskIsSettled(row) && row.dueOn < onDate);
  const percent = rows.length === 0 ? 0 : Math.round((settled.length / rows.length) * 1000) / 10;
  const derivedStatus: ChecklistStatus = settled.length === rows.length
    ? "Completed"
    : blockingOutstanding.length > 0 && overdue.length > 0
      ? "Blocked"
      : settled.length === 0 ? "Not started" : "In progress";
  return {
    checklistId,
    total: rows.length,
    settled: settled.length,
    outstanding: rows.length - settled.length,
    blockingOutstanding,
    overdue,
    percent,
    derivedStatus,
  };
}

/** Every task a template defines must exist on the checklist it produced. */
export function checklistMatchesTemplate(row: OnboardingChecklist): boolean {
  const template = onboardingTemplate(row.templateId);
  if (!template) return false;
  const present = new Set(tasksFor(row.id).map((task) => task.templateTaskId));
  return template.tasks.every((task) => present.has(task.id));
}

/** Due dates must be the template's offsets from the joining date. */
export function checklistDueDatesAreDerived(row: OnboardingChecklist): boolean {
  const template = onboardingTemplate(row.templateId);
  if (!template) return false;
  return tasksFor(row.id).every((task) => {
    const source = template.tasks.find((entry) => entry.id === task.templateTaskId);
    if (!source) return false;
    return task.dueOn === addDays(row.joiningDate, source.dueOffsetDays) && task.blocking === source.blocking;
  });
}

/**
 * Whether payroll may pay this employee at all. The bank account and the tax
 * identifier are onboarding tasks, and an unpaid-but-onboarded employee is a
 * better outcome than a payment to an unverified account.
 */
export function payrollIsUnblocked(employeeId: string): boolean {
  const row = checklistFor(employeeId);
  if (!row) return true;
  return tasksFor(row.id)
    .filter((task) => task.category === "Payroll" && task.blocking)
    .every(taskIsSettled);
}

export function payrollBlockers(employeeId: string): readonly string[] {
  const row = checklistFor(employeeId);
  if (!row) return [];
  return tasksFor(row.id)
    .filter((task) => task.category === "Payroll" && task.blocking && !taskIsSettled(task))
    .map((task) => `${task.title} — ${task.status.toLowerCase()}`);
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* 7. Probation                                                       */
/* ------------------------------------------------------------------ */

export type ProbationRecommendation = "Confirm" | "Extend" | "Terminate";

export type ProbationStatus = "Scheduled" | "In review" | "Recommended" | "Approved" | "Rejected" | "Cancelled";

export const probationTransitions: Readonly<Record<ProbationStatus, readonly ProbationStatus[]>> = {
  "Scheduled": ["In review", "Cancelled"],
  "In review": ["Recommended", "Cancelled"],
  "Recommended": ["Approved", "Rejected", "In review"],
  "Approved": [],
  "Rejected": [],
  "Cancelled": [],
};

export interface ProbationReview {
  id: string;
  reference: string;
  employeeId: string;
  kind: "Interim" | "Final";
  /** The period under review, as it stood when the review was raised. */
  probationStart: string;
  probationEnd: string;
  reviewDueOn: string;
  reviewedOn: string | null;
  reviewerId: string;
  recommendation: ProbationRecommendation | null;
  /** Set only for Extend. */
  extensionMonths: number | null;
  newProbationEnd: string | null;
  /** 1..5, the same scale the performance module uses. */
  ratingScore: number | null;
  strengths: string;
  concerns: string;
  status: ProbationStatus;
  approvedBy: string | null;
  approvedOn: string | null;
  /** The Phase 1 status event an approved Confirm produced. */
  statusEventId: string | null;
  /** The termination record an approved Terminate produced. */
  terminationId: string | null;
}

export const probationReviews: readonly ProbationReview[] = [
  { id: "PRB-001", reference: "PRB-2021-0002", employeeId: "EMP-4", kind: "Final", probationStart: "2021-01-11", probationEnd: "2021-07-11", reviewDueOn: "2021-06-11", reviewedOn: "2021-06-28", reviewerId: "EMP-1", recommendation: "Confirm", extensionMonths: null, newProbationEnd: null, ratingScore: 5, strengths: "Built the HR function from nothing in six months.", concerns: "None.", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2021-07-05", statusEventId: "STE-007", terminationId: null },
  { id: "PRB-002", reference: "PRB-2021-0004", employeeId: "EMP-2", kind: "Final", probationStart: "2021-02-01", probationEnd: "2021-08-01", reviewDueOn: "2021-07-01", reviewedOn: "2021-07-19", reviewerId: "EMP-1", recommendation: "Confirm", extensionMonths: null, newProbationEnd: null, ratingScore: 5, strengths: "Took ownership of the ledger within the first quarter.", concerns: "None.", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2021-07-26", statusEventId: "STE-003", terminationId: null },
  { id: "PRB-003", reference: "PRB-2022-0031", employeeId: "EMP-3", kind: "Final", probationStart: "2022-03-14", probationEnd: "2022-09-14", reviewDueOn: "2022-08-14", reviewedOn: "2022-08-30", reviewerId: "EMP-1", recommendation: "Confirm", extensionMonths: null, newProbationEnd: null, ratingScore: 4, strengths: "Strong delivery; picked up the client engagement quickly.", concerns: "Documentation habits needed work; agreed as a development goal.", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2022-09-07", statusEventId: "STE-005", terminationId: null },
  { id: "PRB-004", reference: "PRB-2022-0044", employeeId: "EMP-5", kind: "Final", probationStart: "2022-06-20", probationEnd: "2022-12-20", reviewDueOn: "2022-11-20", reviewedOn: "2022-12-05", reviewerId: "EMP-1", recommendation: "Confirm", extensionMonths: null, newProbationEnd: null, ratingScore: 4, strengths: "Ran the Lahore operations desk from month two.", concerns: "None material.", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2022-12-13", statusEventId: "STE-009", terminationId: null },
  { id: "PRB-005", reference: "PRB-2023-0077", employeeId: "EMP-6", kind: "Final", probationStart: "2023-09-02", probationEnd: "2024-03-02", reviewDueOn: "2024-02-02", reviewedOn: "2024-02-16", reviewerId: "EMP-5", recommendation: "Confirm", extensionMonths: null, newProbationEnd: null, ratingScore: 3, strengths: "Reliable on the support desk.", concerns: "Escalation judgement to develop.", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2024-02-27", statusEventId: "STE-011", terminationId: null },
  {
    id: "PRB-006", reference: "PRB-2026-0171", employeeId: "EMP-7", kind: "Interim", probationStart: "2026-07-01", probationEnd: "2027-01-01",
    reviewDueOn: "2026-10-01", reviewedOn: "2026-09-14", reviewerId: "EMP-3", recommendation: "Extend", extensionMonths: 2, newProbationEnd: "2027-03-01",
    ratingScore: 3,
    strengths: "Delivery is on track: 94 per cent on-time to August and one escaped defect.",
    concerns: "Two blocking onboarding items are open and the approved technical programme was failed on attendance (33 per cent against an 80 per cent minimum). Recommend two months' extension to close both.",
    status: "Recommended", approvedBy: null, approvedOn: null, statusEventId: null, terminationId: null,
  },
  {
    id: "PRB-007", reference: "PRB-2026-0188", employeeId: "EMP-8", kind: "Final", probationStart: "2026-09-21", probationEnd: "2027-03-21",
    reviewDueOn: "2027-02-19", reviewedOn: null, reviewerId: "EMP-3", recommendation: null, extensionMonths: null, newProbationEnd: null,
    ratingScore: null, strengths: "", concerns: "",
    status: "Scheduled", approvedBy: null, approvedOn: null, statusEventId: null, terminationId: null,
  },
];

export function probationReview(id: string): ProbationReview | undefined {
  return probationReviews.find((row) => row.id === id);
}

export function probationReviewsFor(employeeId: string): readonly ProbationReview[] {
  return probationReviews
    .filter((row) => row.employeeId === employeeId)
    .sort((a, b) => a.probationEnd.localeCompare(b.probationEnd));
}

export function canTransitionProbation(from: ProbationStatus, to: ProbationStatus): boolean {
  return probationTransitions[from].includes(to);
}

/**
 * An Extend must say by how long and until when, and the new end must be the
 * extension applied to the end under review — not a date somebody typed. A
 * Confirm must carry neither, so an extension cannot be smuggled into a
 * confirmation.
 */
export function probationOutcomeIsConsistent(row: ProbationReview): boolean {
  if (row.recommendation === null) {
    return row.extensionMonths === null && row.newProbationEnd === null;
  }
  if (row.recommendation === "Extend") {
    if (row.extensionMonths === null || row.extensionMonths <= 0 || row.newProbationEnd === null) return false;
    return row.newProbationEnd === addMonths(row.probationEnd, row.extensionMonths);
  }
  if (row.recommendation === "Terminate") {
    return row.extensionMonths === null && row.newProbationEnd === null;
  }
  return row.extensionMonths === null && row.newProbationEnd === null;
}

/** An extension appends a period; it never rewrites the one already reviewed. */
export function probationHistoryIsAppendOnly(employeeId: string): boolean {
  const rows = probationReviewsFor(employeeId);
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (current.probationStart !== previous.probationStart) return false;
    if (previous.recommendation === "Extend" && previous.status === "Approved") {
      if (current.probationEnd !== previous.newProbationEnd) return false;
    }
  }
  return true;
}

/**
 * A confirmation is a Phase 1 status transition, so it has to be a legal one,
 * and the blocking onboarding tasks have to be done first.
 */
export function canApproveProbation(row: ProbationReview): boolean {
  if (row.status !== "Recommended" || row.recommendation === null) return false;
  if (!probationOutcomeIsConsistent(row)) return false;
  const person = employee(row.employeeId);
  if (!person) return false;
  if (row.recommendation === "Confirm") {
    if (!canTransition(person.status, "Confirmed")) return false;
    const progress = checklistFor(row.employeeId);
    if (progress && checklistProgress(progress.id).blockingOutstanding.length > 0) return false;
  }
  if (row.recommendation === "Terminate") {
    return row.terminationId !== null;
  }
  return true;
}

export function probationBlockers(row: ProbationReview): readonly string[] {
  const blockers: string[] = [];
  if (!probationOutcomeIsConsistent(row)) blockers.push("Recommendation and extension fields disagree.");
  const person = employee(row.employeeId);
  if (!person) return ["Employee record not found."];
  if (row.recommendation === "Confirm" && !canTransition(person.status, "Confirmed")) {
    blockers.push(`${person.status} cannot move to Confirmed.`);
  }
  const list = checklistFor(row.employeeId);
  if (list) {
    const outstanding = checklistProgress(list.id).blockingOutstanding;
    if (outstanding.length > 0) {
      blockers.push(`${outstanding.length} blocking onboarding task(s) outstanding: ${outstanding.map((task) => task.title).join("; ")}.`);
    }
  }
  if (row.recommendation === "Terminate" && row.terminationId === null) {
    blockers.push("A Terminate recommendation needs an authorised termination record.");
  }
  return blockers;
}

/* ------------------------------------------------------------------ */
/* 10. Transfer and promotion                                         */
/* ------------------------------------------------------------------ */

export type MovementKind =
  | "Department transfer"
  | "Branch transfer"
  | "Designation change"
  | "Grade change"
  | "Promotion"
  | "Demotion"
  | "Reporting manager change"
  | "Cost centre change"
  | "Work location change"
  | "Employment type change";

export type MovementStatus =
  | "Draft"
  | "Submitted"
  | "Pending approval"
  | "Approved"
  | "Effective"
  | "Rejected"
  | "Cancelled";

export const movementTransitions: Readonly<Record<MovementStatus, readonly MovementStatus[]>> = {
  "Draft": ["Submitted", "Cancelled"],
  "Submitted": ["Pending approval", "Draft", "Rejected", "Cancelled"],
  "Pending approval": ["Approved", "Rejected", "Cancelled"],
  "Approved": ["Effective", "Cancelled"],
  "Effective": [],
  "Rejected": [],
  "Cancelled": [],
};

export const movementChain: readonly MovementStatus[] = [
  "Draft", "Submitted", "Pending approval", "Approved", "Effective",
];

export type SalaryImpact = "No change" | "Change";

/**
 * A movement changes WHERE and WHAT someone does. It deliberately holds no
 * salary, gross, amount or pay field: if money changes, `salaryRevisionId`
 * points at the Phase 3 salary revision that carries the number and its own
 * approval.
 *
 * A null `to…` field means that dimension is unchanged, so a movement never
 * restates the values it is not altering.
 */
export interface EmployeeMovement {
  id: string;
  reference: string;
  employeeId: string;
  kinds: readonly MovementKind[];
  effectiveFrom: string;
  status: MovementStatus;
  toBranchId: string | null;
  toDepartmentId: string | null;
  toDesignationId: string | null;
  toJobGradeId: string | null;
  toCostCentreId: string | null;
  toWorkLocationId: string | null;
  toEmploymentTypeId: string | null;
  toEmployeeCategoryId: string | null;
  toReportingManagerId: string | null;
  reason: string;
  salaryImpact: SalaryImpact;
  /** Required before a pay-changing movement can take effect. */
  salaryRevisionId: string | null;
  requestedBy: string;
  requestedOn: string;
  approvedBy: string | null;
  approvedOn: string | null;
  approvalReference: string | null;
  /** The Phase 1 assignment row an effective movement produced. */
  resultingAssignmentId: string | null;
  note: string;
}

export const employeeMovements: readonly EmployeeMovement[] = [
  {
    id: "MOV-001", reference: "MOV-2026-0163", employeeId: "EMP-5",
    kinds: ["Department transfer", "Cost centre change", "Reporting manager change"],
    effectiveFrom: "2026-06-01", status: "Effective",
    toBranchId: null, toDepartmentId: "ORG-DP-004", toDesignationId: null, toJobGradeId: null,
    toCostCentreId: "CCT-004", toWorkLocationId: null, toEmploymentTypeId: null, toEmployeeCategoryId: null,
    toReportingManagerId: "EMP-2",
    reason: "Service Operations needed an experienced manager after the managed-services book grew.",
    salaryImpact: "No change", salaryRevisionId: null,
    requestedBy: "Omar Siddiqui", requestedOn: "2026-05-04", approvedBy: "Mariam Ali", approvedOn: "2026-05-18",
    approvalReference: "APR-2026-0163", resultingAssignmentId: "ASG-008",
    note: "Lateral transfer: grade, designation and pay unchanged, so no salary revision was needed.",
  },
  {
    id: "MOV-002", reference: "MOV-2026-0192", employeeId: "EMP-7",
    kinds: ["Promotion", "Designation change", "Grade change", "Branch transfer", "Department transfer"],
    effectiveFrom: "2027-01-02", status: "Draft",
    toBranchId: "ORG-BR-002", toDepartmentId: "ORG-DP-007", toDesignationId: "DSG-006", toJobGradeId: "GRD-004",
    toCostCentreId: null, toWorkLocationId: "LOC-002", toEmploymentTypeId: null, toEmployeeCategoryId: null,
    toReportingManagerId: null,
    reason: "Internal application to the Senior Software Engineer opening in the Lahore practice.",
    salaryImpact: "Change", salaryRevisionId: null,
    requestedBy: "Bilal Khan", requestedOn: "2026-09-08", approvedBy: null, approvedOn: null,
    approvalReference: null, resultingAssignmentId: null,
    note: "Held at Draft: a grade change means pay changes, and no salary revision has been raised. The internal application is also blocked while the employee is on probation.",
  },
  {
    id: "MOV-003", reference: "MOV-2026-0195", employeeId: "EMP-5",
    kinds: ["Promotion", "Grade change"],
    effectiveFrom: "2026-10-01", status: "Pending approval",
    toBranchId: null, toDepartmentId: null, toDesignationId: null, toJobGradeId: "GRD-002",
    toCostCentreId: null, toWorkLocationId: null, toEmploymentTypeId: null, toEmployeeCategoryId: null,
    toReportingManagerId: null,
    reason: "Promotion to the senior management grade on the annual review; the pay change is raised separately as salary revision REV-002.",
    salaryImpact: "Change", salaryRevisionId: "REV-002",
    requestedBy: "Sana Iqbal", requestedOn: "2026-09-15", approvedBy: null, approvedOn: null,
    approvalReference: null, resultingAssignmentId: null,
    note: "The movement and the salary revision are separate transactions on the same effective date. The movement cannot take effect until REV-002 is approved.",
  },
  {
    id: "MOV-004", reference: "MOV-2026-0186", employeeId: "EMP-4",
    kinds: ["Department transfer"],
    effectiveFrom: "2026-10-01", status: "Rejected",
    toBranchId: null, toDepartmentId: "ORG-DP-004", toDesignationId: null, toJobGradeId: null,
    toCostCentreId: "CCT-004", toWorkLocationId: null, toEmploymentTypeId: null, toEmployeeCategoryId: null,
    toReportingManagerId: "EMP-2",
    reason: "Service Operations requested HR support to be embedded in the department.",
    salaryImpact: "No change", salaryRevisionId: null,
    requestedBy: "Ayesha Malik", requestedOn: "2026-08-28", approvedBy: null, approvedOn: null,
    approvalReference: null, resultingAssignmentId: null,
    note: "Rejected on 05 September 2026: moving the HR Manager out of People & Culture would leave the function without an owner. Retained as the record of the decision.",
  },
  {
    id: "MOV-005", reference: "MOV-2026-0190", employeeId: "EMP-8",
    kinds: ["Reporting manager change"],
    effectiveFrom: "2026-09-21", status: "Cancelled",
    toBranchId: null, toDepartmentId: null, toDesignationId: null, toJobGradeId: null,
    toCostCentreId: null, toWorkLocationId: null, toEmploymentTypeId: null, toEmployeeCategoryId: null,
    toReportingManagerId: "EMP-7",
    reason: "Raised so the graduate would report to their assigned mentor.",
    salaryImpact: "No change", salaryRevisionId: null,
    requestedBy: "Bilal Khan", requestedOn: "2026-09-17", approvedBy: null, approvedOn: null,
    approvalReference: null, resultingAssignmentId: null,
    note: "Cancelled: mentoring is recorded on the onboarding checklist, not by changing the reporting line. Retained rather than deleted.",
  },
];

export function movement(id: string): EmployeeMovement | undefined {
  return employeeMovements.find((row) => row.id === id);
}

export function movementsFor(employeeId: string): readonly EmployeeMovement[] {
  return employeeMovements
    .filter((row) => row.employeeId === employeeId)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

export function canTransitionMovement(from: MovementStatus, to: MovementStatus): boolean {
  return movementTransitions[from].includes(to);
}

/** The dimensions a movement actually changes, read against the row in force. */
export function movementChanges(row: EmployeeMovement): readonly { label: string; from: string; to: string }[] {
  const current = assignmentOn(row.employeeId, addDays(row.effectiveFrom, -1))
    ?? assignmentOn(row.employeeId, HR_TODAY);
  if (!current) return [];
  const comparisons: readonly { label: string; to: string | null; read: (assignment: EmployeeAssignment) => string }[] = [
    { label: "Branch", to: row.toBranchId, read: (a) => orgUnitName(a.branchId) },
    { label: "Department", to: row.toDepartmentId, read: (a) => orgUnitName(a.departmentId) },
    { label: "Designation", to: row.toDesignationId, read: (a) => masterRecord("designation", a.designationId)?.name ?? "—" },
    { label: "Grade", to: row.toJobGradeId, read: (a) => masterRecord("job-grade", a.jobGradeId)?.name ?? "—" },
    { label: "Cost centre", to: row.toCostCentreId, read: (a) => masterRecord("cost-centre", a.costCentreId)?.name ?? "—" },
    { label: "Work location", to: row.toWorkLocationId, read: (a) => masterRecord("work-location", a.workLocationId)?.name ?? "—" },
    { label: "Employment type", to: row.toEmploymentTypeId, read: (a) => masterRecord("employment-type", a.employmentTypeId)?.name ?? "—" },
    { label: "Category", to: row.toEmployeeCategoryId, read: (a) => masterRecord("employee-category", a.employeeCategoryId)?.name ?? "—" },
    { label: "Reporting manager", to: row.toReportingManagerId, read: () => employeeName(current.reportingManagerId) },
  ];
  return comparisons
    .filter((entry) => entry.to !== null)
    .map((entry) => ({
      label: entry.label,
      from: entry.read(current),
      to: entry.label === "Branch" || entry.label === "Department"
        ? orgUnitName(entry.to as string)
        : entry.label === "Reporting manager"
          ? employeeName(entry.to)
          : masterRecord(masterIdForLabel(entry.label), entry.to as string)?.name ?? "—",
    }));
}

function masterIdForLabel(label: string): string {
  if (label === "Designation") return "designation";
  if (label === "Grade") return "job-grade";
  if (label === "Cost centre") return "cost-centre";
  if (label === "Work location") return "work-location";
  if (label === "Employment type") return "employment-type";
  if (label === "Category") return "employee-category";
  return "designation";
}

/** A movement must change at least one thing. */
export function movementIsMeaningful(row: EmployeeMovement): boolean {
  return [
    row.toBranchId, row.toDepartmentId, row.toDesignationId, row.toJobGradeId, row.toCostCentreId,
    row.toWorkLocationId, row.toEmploymentTypeId, row.toEmployeeCategoryId, row.toReportingManagerId,
  ].some((value) => value !== null);
}

/**
 * Whether a pay-changing movement has the Phase 3 transaction it needs, with
 * the same employee and the same effective date. A revision for the wrong
 * person, or effective on a different day, is not a link — it is a coincidence.
 */
export function salaryLinkIsValid(row: EmployeeMovement): boolean {
  if (row.salaryImpact === "No change") return row.salaryRevisionId === null;
  if (row.salaryRevisionId === null) return false;
  const revision = salaryRevisions.find((entry) => entry.id === row.salaryRevisionId);
  if (!revision) return false;
  return revision.employeeId === row.employeeId && revision.effectiveFrom === row.effectiveFrom;
}

/** A pay-changing movement cannot take effect on an unapproved revision. */
export function canMakeMovementEffective(row: EmployeeMovement): boolean {
  if (!canTransitionMovement(row.status, "Effective")) return false;
  if (!movementIsMeaningful(row)) return false;
  if (row.salaryImpact === "No change") return true;
  if (!salaryLinkIsValid(row)) return false;
  const revision = salaryRevisions.find((entry) => entry.id === row.salaryRevisionId);
  return revision?.status === "Approved";
}

export function movementBlockers(row: EmployeeMovement): readonly string[] {
  const blockers: string[] = [];
  if (!movementIsMeaningful(row)) blockers.push("The movement changes nothing.");
  if (row.salaryImpact === "Change" && row.salaryRevisionId === null) {
    blockers.push("Pay changes, but no salary revision has been raised. Raise the revision in Payroll and link it.");
  }
  if (row.salaryImpact === "Change" && row.salaryRevisionId !== null) {
    if (!salaryLinkIsValid(row)) {
      blockers.push("The linked salary revision is for a different employee or a different effective date.");
    } else {
      const revision = salaryRevisions.find((entry) => entry.id === row.salaryRevisionId);
      if (revision && revision.status !== "Approved") {
        blockers.push(`Linked salary revision ${revision.id} is ${revision.status}; the movement cannot take effect until it is approved.`);
      }
    }
  }
  if (row.toJobGradeId !== null) {
    const grade = masterRecord("job-grade", row.toJobGradeId);
    if (grade?.status !== "Active") blockers.push("The target grade is not an active master record.");
  }
  if (row.toDepartmentId !== null && orgUnitName(row.toDepartmentId) === "—") {
    blockers.push("The target department does not exist.");
  }
  return blockers;
}

export interface MovementApplication {
  /** The row in force, closed the day before the movement takes effect. */
  closedAssignment: EmployeeAssignment;
  /** The new row the movement produces. Nothing is edited in place. */
  newAssignment: EmployeeAssignment;
}

/**
 * What an approved movement would do to the assignment history, computed
 * without touching Phase 1's arrays. The previous row is closed the day
 * before, so the history has no gap and no overlap.
 */
export function applyMovement(row: EmployeeMovement): MovementApplication | null {
  const current = assignmentOn(row.employeeId, addDays(row.effectiveFrom, -1))
    ?? assignmentsFor(row.employeeId)[0];
  if (!current) return null;
  const closedAssignment: EmployeeAssignment = { ...current, effectiveTo: addDays(row.effectiveFrom, -1) };
  const newAssignment: EmployeeAssignment = {
    id: `${current.id}-next`,
    employeeId: row.employeeId,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: null,
    companyId: current.companyId,
    branchId: row.toBranchId ?? current.branchId,
    departmentId: row.toDepartmentId ?? current.departmentId,
    designationId: row.toDesignationId ?? current.designationId,
    jobGradeId: row.toJobGradeId ?? current.jobGradeId,
    costCentreId: row.toCostCentreId ?? current.costCentreId,
    workLocationId: row.toWorkLocationId ?? current.workLocationId,
    employmentTypeId: row.toEmploymentTypeId ?? current.employmentTypeId,
    employeeCategoryId: row.toEmployeeCategoryId ?? current.employeeCategoryId,
    reportingManagerId: row.toReportingManagerId ?? current.reportingManagerId,
    changeReason: changeReasonFor(row),
    approvedBy: row.approvedBy ?? "—",
    approvalReference: row.approvalReference ?? row.reference,
  };
  return { closedAssignment, newAssignment };
}

/** Maps a movement onto Phase 1's own change-reason vocabulary. */
export function changeReasonFor(row: EmployeeMovement): EmployeeAssignment["changeReason"] {
  if (row.kinds.includes("Promotion")) return "Promotion";
  if (row.kinds.includes("Demotion")) return "Demotion";
  if (row.kinds.includes("Grade change")) return "Grade revision";
  if (row.kinds.includes("Employment type change")) return "Employment type change";
  if (row.kinds.includes("Reporting manager change") && row.kinds.length === 1) return "Manager change";
  if (row.kinds.includes("Cost centre change") && row.kinds.length === 1) return "Cost centre change";
  return "Transfer";
}

/* ------------------------------------------------------------------ */
/* 11. Resignation                                                    */
/* ------------------------------------------------------------------ */

export type ResignationStatus =
  | "Submitted"
  | "Manager review"
  | "HR review"
  | "Notice period"
  | "Clearance"
  | "Final settlement"
  | "Completed"
  | "Withdrawn"
  | "Rejected";

export const resignationTransitions: Readonly<Record<ResignationStatus, readonly ResignationStatus[]>> = {
  "Submitted": ["Manager review", "Withdrawn"],
  "Manager review": ["HR review", "Rejected", "Withdrawn"],
  "HR review": ["Notice period", "Rejected", "Withdrawn"],
  "Notice period": ["Clearance", "Withdrawn"],
  "Clearance": ["Final settlement"],
  "Final settlement": ["Completed"],
  "Completed": [],
  "Withdrawn": [],
  "Rejected": [],
};

export const resignationChain: readonly ResignationStatus[] = [
  "Submitted", "Manager review", "HR review", "Notice period", "Clearance", "Final settlement", "Completed",
];

export type ResignationReasonCategory =
  | "Better opportunity"
  | "Relocation"
  | "Higher studies"
  | "Personal"
  | "Compensation"
  | "Management"
  | "Health";

export interface Resignation {
  id: string;
  reference: string;
  employeeId: string;
  submittedOn: string;
  reasonCategory: ResignationReasonCategory;
  reason: string;
  /** Contractual notice, read from the employee record. */
  noticePeriodDays: number;
  /** submittedOn + noticePeriodDays: the earliest date the contract allows. */
  requiredLastDay: string;
  agreedLastDay: string;
  /** Days of notice not served. Derived, not typed. */
  noticeShortfallDays: number;
  /** Named authorisation for not recovering a shortfall. */
  shortfallWaivedBy: string | null;
  shortfallWaiverReason: string;
  managerReviewBy: string | null;
  managerReviewOn: string | null;
  managerComment: string;
  hrReviewBy: string | null;
  hrReviewOn: string | null;
  hrComment: string;
  exitInterviewOn: string | null;
  status: ResignationStatus;
  clearanceId: string | null;
  settlementId: string | null;
  /** The Phase 1 status event the completed exit produced. */
  statusEventId: string | null;
  note: string;
}

export const resignations: readonly Resignation[] = [
  {
    id: "RSG-001", reference: "RES-2026-0007", employeeId: "EMP-3", submittedOn: "2026-08-20",
    reasonCategory: "Better opportunity", reason: "Offered a principal engineering role at a product company.",
    noticePeriodDays: 60, requiredLastDay: "2026-10-19", agreedLastDay: "2026-10-19", noticeShortfallDays: 0,
    shortfallWaivedBy: null, shortfallWaiverReason: "",
    managerReviewBy: "Omar Siddiqui", managerReviewOn: "2026-08-24", managerComment: "Counter-offer discussed and declined. Handover plan agreed for the platform workstream.",
    hrReviewBy: "Sana Iqbal", hrReviewOn: "2026-08-27", hrComment: "Full notice served. Replacement requisition MRQ-2026-0018 already approved.",
    exitInterviewOn: "2026-10-14", status: "Clearance", clearanceId: "CLR-001", settlementId: "FST-001",
    statusEventId: null,
    note: "Notice period runs to 19 October 2026. Clearance in progress; the settlement is a draft until clearance completes.",
  },
  {
    id: "RSG-002", reference: "RES-2026-0005", employeeId: "EMP-5", submittedOn: "2026-07-02",
    reasonCategory: "Management", reason: "Concern about the scope of the role after the Commercial book was handed over.",
    noticePeriodDays: 30, requiredLastDay: "2026-08-01", agreedLastDay: "2026-08-01", noticeShortfallDays: 0,
    shortfallWaivedBy: null, shortfallWaiverReason: "",
    managerReviewBy: "Mariam Ali", managerReviewOn: "2026-07-06", managerComment: "Role scope and the Service Operations mandate clarified.",
    hrReviewBy: "Sana Iqbal", hrReviewOn: "2026-07-09", hrComment: "Withdrawn by the employee after the scope conversation. Grade review agreed for the annual cycle.",
    exitInterviewOn: null, status: "Withdrawn", clearanceId: null, settlementId: null,
    statusEventId: null,
    note: "Withdrawn on 10 July 2026. Retained: it is the reason the grade review in MOV-2026-0195 was raised.",
  },
  {
    id: "RSG-003", reference: "RES-2026-0004", employeeId: "EMP-6", submittedOn: "2026-07-15",
    reasonCategory: "Relocation", reason: "Karachi office closing; unwilling to relocate to Lahore.",
    noticePeriodDays: 60, requiredLastDay: "2026-09-13", agreedLastDay: "2026-08-31", noticeShortfallDays: 13,
    shortfallWaivedBy: "Omar Siddiqui", shortfallWaiverReason: "The shortfall follows a company-initiated office closure, so no recovery is made from the settlement.",
    managerReviewBy: "Ayesha Malik", managerReviewOn: "2026-07-21", managerComment: "Relocation offered and declined. Support desk handed to the Lahore team.",
    hrReviewBy: "Sana Iqbal", hrReviewOn: "2026-07-28", hrComment: "Accepted. Notice shortfall waived under the closure terms.",
    exitInterviewOn: "2026-08-28", status: "Final settlement", clearanceId: "CLR-002", settlementId: "FST-002",
    statusEventId: "STE-012",
    note: "Last working day 31 August 2026. Employee status is Resigned; it moves to Inactive once the settlement is paid.",
  },
];

export function resignation(id: string): Resignation | undefined {
  return resignations.find((row) => row.id === id);
}

export function resignationsFor(employeeId: string): readonly Resignation[] {
  return resignations.filter((row) => row.employeeId === employeeId);
}

export function canTransitionResignation(from: ResignationStatus, to: ResignationStatus): boolean {
  return resignationTransitions[from].includes(to);
}

/** The required last day must be the notice period applied to the submission. */
export function noticeDatesAreDerived(row: Resignation): boolean {
  const person = employee(row.employeeId);
  if (!person) return false;
  if (row.noticePeriodDays !== person.noticePeriodDays) return false;
  if (row.requiredLastDay !== addDays(row.submittedOn, row.noticePeriodDays)) return false;
  const shortfall = Math.max(0, daysBetween(row.agreedLastDay, row.requiredLastDay));
  return row.noticeShortfallDays === shortfall;
}

/** A shortfall is either recovered on the settlement or waived by name. */
export function shortfallIsResolved(row: Resignation): boolean {
  if (row.noticeShortfallDays === 0) return row.shortfallWaivedBy === null;
  if (row.shortfallWaivedBy !== null) return row.shortfallWaiverReason.length > 0;
  if (row.settlementId === null) return false;
  return settlementLinesOf(row.settlementId).some((line) => line.source === "Notice");
}

/* ------------------------------------------------------------------ */
/* 12. Termination                                                    */
/* ------------------------------------------------------------------ */

export type TerminationReason =
  | "Misconduct"
  | "Poor performance"
  | "Redundancy"
  | "End of contract"
  | "Abandonment"
  | "Medical";

export type TerminationStatus =
  | "Draft"
  | "Pending HR"
  | "Pending management"
  | "Approved"
  | "Executed"
  | "Rejected"
  | "Cancelled";

export const terminationTransitions: Readonly<Record<TerminationStatus, readonly TerminationStatus[]>> = {
  "Draft": ["Pending HR", "Cancelled"],
  "Pending HR": ["Pending management", "Rejected", "Cancelled"],
  "Pending management": ["Approved", "Rejected", "Cancelled"],
  "Approved": ["Executed", "Cancelled"],
  "Executed": [],
  "Rejected": [],
  "Cancelled": [],
};

/**
 * Who has to approve a termination, by reason. This is configuration, so
 * "who may dismiss for misconduct" has an auditable answer rather than being
 * whoever holds the button.
 */
export const terminationAuthorityMatrix: Readonly<Record<TerminationReason, readonly string[]>> = {
  "Misconduct": ["HR Manager", "Chief Executive"],
  "Poor performance": ["HR Manager", "Chief Executive"],
  "Redundancy": ["HR Manager", "Chief Financial Officer", "Chief Executive"],
  "End of contract": ["HR Manager"],
  "Abandonment": ["HR Manager", "Chief Executive"],
  "Medical": ["HR Manager", "Chief Executive"],
};

/** Reasons that forfeit gratuity. Everything else keeps it. */
export const gratuityForfeitingReasons: readonly TerminationReason[] = ["Misconduct", "Abandonment"];

export interface TerminationApproval {
  id: string;
  role: string;
  approvedBy: string;
  approvedOn: string;
  decision: "Approved" | "Rejected";
  comment: string;
}

export interface TerminationDocument {
  id: string;
  title: string;
  reference: string;
  uploadedOn: string;
  uploadedBy: string;
}

export interface Termination {
  id: string;
  reference: string;
  employeeId: string;
  reason: TerminationReason;
  reasonDetail: string;
  effectiveDate: string;
  status: TerminationStatus;
  initiatedBy: string;
  initiatedOn: string;
  approvals: readonly TerminationApproval[];
  documentation: readonly TerminationDocument[];
  noticePaidInLieuDays: number;
  clearanceId: string | null;
  settlementId: string | null;
  statusEventId: string | null;
  note: string;
}

export const terminations: readonly Termination[] = [
  {
    id: "TRM-001", reference: "TRM-2026-0003", employeeId: "EMP-7", reason: "Poor performance",
    reasonDetail: "Raised at the interim probation review over two open blocking onboarding items and a failed technical programme.",
    effectiveDate: "2026-10-15", status: "Rejected", initiatedBy: "Bilal Khan", initiatedOn: "2026-09-14",
    approvals: [
      { id: "TRA-001", role: "HR Manager", approvedBy: "Sana Iqbal", approvedOn: "2026-09-16", decision: "Rejected", comment: "Delivery performance is on track. The open items are administrative and were partly the company's own scheduling. Extend probation instead." },
    ],
    documentation: [
      { id: "TRD-001", title: "Interim probation review", reference: "PRB-2026-0171", uploadedOn: "2026-09-14", uploadedBy: "Bilal Khan" },
      { id: "TRD-002", title: "Training attendance record", reference: "TPT-007", uploadedOn: "2026-09-14", uploadedBy: "Sana Iqbal" },
    ],
    noticePaidInLieuDays: 0, clearanceId: null, settlementId: null, statusEventId: null,
    note: "Rejected in favour of the two-month probation extension recommended in PRB-2026-0171. Retained as the record of the decision.",
  },
  {
    id: "TRM-002", reference: "TRM-2026-0002", employeeId: "EMP-6", reason: "Redundancy",
    reasonDetail: "Karachi client office closure removed the Client Support Associate position.",
    effectiveDate: "2026-09-30", status: "Cancelled", initiatedBy: "Sana Iqbal", initiatedOn: "2026-07-06",
    approvals: [
      { id: "TRA-002", role: "HR Manager", approvedBy: "Sana Iqbal", approvedOn: "2026-07-08", decision: "Approved", comment: "Redundancy is genuine: the position disappears with the office." },
      { id: "TRA-003", role: "Chief Financial Officer", approvedBy: "Mariam Ali", approvedOn: "2026-07-10", decision: "Approved", comment: "Settlement cost provisioned." },
    ],
    documentation: [
      { id: "TRD-003", title: "Office closure decision", reference: "DEC-2026-0031", uploadedOn: "2026-07-06", uploadedBy: "Sana Iqbal" },
      { id: "TRD-004", title: "Relocation offer and declination", reference: "LTR-2026-0112", uploadedOn: "2026-07-14", uploadedBy: "Sana Iqbal" },
    ],
    noticePaidInLieuDays: 0, clearanceId: null, settlementId: null, statusEventId: null,
    note: "Cancelled on 28 July 2026: the employee resigned first under RES-2026-0004, so the redundancy was not executed. Two of the three required approvals had been collected. Retained in full.",
  },
];

export function termination(id: string): Termination | undefined {
  return terminations.find((row) => row.id === id);
}

export function terminationsFor(employeeId: string): readonly Termination[] {
  return terminations.filter((row) => row.employeeId === employeeId);
}

export function canTransitionTermination(from: TerminationStatus, to: TerminationStatus): boolean {
  return terminationTransitions[from].includes(to);
}

export function requiredApproverRoles(row: Termination): readonly string[] {
  return terminationAuthorityMatrix[row.reason];
}

export function missingApproverRoles(row: Termination): readonly string[] {
  const granted = new Set(row.approvals.filter((entry) => entry.decision === "Approved").map((entry) => entry.role));
  return requiredApproverRoles(row).filter((role) => !granted.has(role));
}

/** Every role the reason demands has approved, and none has refused. */
export function terminationIsAuthorised(row: Termination): boolean {
  if (row.approvals.some((entry) => entry.decision === "Rejected")) return false;
  return missingApproverRoles(row).length === 0;
}

/**
 * A termination may only be executed when it is authorised, documented, and
 * clearance is complete — and the status change itself has to be legal in
 * Phase 1's lifecycle.
 */
export function canExecuteTermination(row: Termination): boolean {
  if (!canTransitionTermination(row.status, "Executed")) return false;
  if (!terminationIsAuthorised(row)) return false;
  if (row.documentation.length === 0) return false;
  if (row.clearanceId === null || !clearanceIsComplete(row.clearanceId)) return false;
  const person = employee(row.employeeId);
  return person !== undefined && canTransition(person.status, "Terminated");
}

export function terminationBlockers(row: Termination): readonly string[] {
  const blockers: string[] = [];
  const missing = missingApproverRoles(row);
  if (missing.length > 0) blockers.push(`Approval outstanding from: ${missing.join(", ")}.`);
  const refused = row.approvals.filter((entry) => entry.decision === "Rejected");
  for (const entry of refused) blockers.push(`${entry.role} refused: ${entry.comment}`);
  if (row.documentation.length === 0) blockers.push("No supporting documentation on file.");
  if (row.clearanceId === null) blockers.push("Clearance has not been started.");
  else if (!clearanceIsComplete(row.clearanceId)) blockers.push("Clearance is not complete.");
  return blockers;
}

export function gratuityIsForfeited(reason: TerminationReason): boolean {
  return gratuityForfeitingReasons.includes(reason);
}

/* ------------------------------------------------------------------ */
/* Clearance                                                          */
/* ------------------------------------------------------------------ */

export type ClearanceDepartment = "Line manager" | "IT" | "Finance" | "Administration" | "HR" | "Assets";

export type ClearanceItemStatus = "Pending" | "Cleared" | "Outstanding" | "Waived";

export interface ClearanceItem {
  id: string;
  clearanceId: string;
  department: ClearanceDepartment;
  item: string;
  owner: string;
  status: ClearanceItemStatus;
  /** Amount to recover on the settlement, in minor units. */
  amountRecoverable: number | null;
  clearedBy: string | null;
  clearedOn: string | null;
  note: string;
}

export type ClearanceStatus = "Not started" | "In progress" | "Blocked" | "Completed";

export interface Clearance {
  id: string;
  reference: string;
  employeeId: string;
  kind: "Resignation" | "Termination";
  sourceId: string;
  startedOn: string;
  targetDate: string;
  status: ClearanceStatus;
  note: string;
}

export const clearances: readonly Clearance[] = [
  { id: "CLR-001", reference: "CLR-2026-0007", employeeId: "EMP-3", kind: "Resignation", sourceId: "RSG-001", startedOn: "2026-09-15", targetDate: "2026-10-19", status: "In progress", note: "Handover and asset return in progress ahead of the 19 October last working day." },
  { id: "CLR-002", reference: "CLR-2026-0004", employeeId: "EMP-6", kind: "Resignation", sourceId: "RSG-003", startedOn: "2026-08-04", targetDate: "2026-08-31", status: "Completed", note: "Completed 30 August 2026; one asset not returned and recovered on the settlement." },
];

export const clearanceItems: readonly ClearanceItem[] = [
  { id: "CLI-001", clearanceId: "CLR-001", department: "Line manager", item: "Handover of the platform workstream and open client commitments", owner: "Omar Siddiqui", status: "Cleared", amountRecoverable: null, clearedBy: "Omar Siddiqui", clearedOn: "2026-09-16", note: "Handover document signed; graduate mentoring reassigned." },
  { id: "CLI-002", clearanceId: "CLR-001", department: "IT", item: "Revoke system access and transfer repository ownership", owner: "IT Service Desk", status: "Pending", amountRecoverable: null, clearedBy: null, clearedOn: null, note: "Scheduled for the last working day." },
  { id: "CLI-003", clearanceId: "CLR-001", department: "Assets", item: "Return laptop AST-0914 and monitor AST-0915", owner: "IT Service Desk", status: "Outstanding", amountRecoverable: money(12000), clearedBy: null, clearedOn: null, note: "Monitor reported damaged; Rs 12,000 recoverable pending the assessment." },
  { id: "CLI-004", clearanceId: "CLR-001", department: "Finance", item: "Settle outstanding loan LON-001", owner: "Mariam Ali", status: "Outstanding", amountRecoverable: null, clearedBy: null, clearedOn: null, note: "Outstanding balance recovered on the final settlement, not here." },
  { id: "CLI-005", clearanceId: "CLR-001", department: "Administration", item: "Return access card and office keys", owner: "Office Administrator", status: "Pending", amountRecoverable: null, clearedBy: null, clearedOn: null, note: "" },
  { id: "CLI-006", clearanceId: "CLR-001", department: "HR", item: "Exit interview and document handover", owner: "Sana Iqbal", status: "Pending", amountRecoverable: null, clearedBy: null, clearedOn: null, note: "Exit interview booked for 14 October 2026." },

  { id: "CLI-007", clearanceId: "CLR-002", department: "Line manager", item: "Handover of the Karachi support queue", owner: "Ayesha Malik", status: "Cleared", amountRecoverable: null, clearedBy: "Ayesha Malik", clearedOn: "2026-08-21", note: "Queue transferred to the Lahore desk." },
  { id: "CLI-008", clearanceId: "CLR-002", department: "IT", item: "Revoke system access", owner: "IT Service Desk", status: "Cleared", amountRecoverable: null, clearedBy: "IT Service Desk", clearedOn: "2026-08-31", note: "" },
  { id: "CLI-009", clearanceId: "CLR-002", department: "Assets", item: "Return laptop AST-0771 and access card", owner: "IT Service Desk", status: "Outstanding", amountRecoverable: money(35000), clearedBy: "IT Service Desk", clearedOn: "2026-08-30", note: "Laptop returned; access card and docking station not returned. Rs 35,000 recovered on the settlement." },
  { id: "CLI-010", clearanceId: "CLR-002", department: "Finance", item: "No outstanding loan or advance", owner: "Mariam Ali", status: "Cleared", amountRecoverable: null, clearedBy: "Mariam Ali", clearedOn: "2026-08-26", note: "" },
  { id: "CLI-011", clearanceId: "CLR-002", department: "Administration", item: "Return office keys", owner: "Office Administrator", status: "Cleared", amountRecoverable: null, clearedBy: "Office Administrator", clearedOn: "2026-08-28", note: "" },
  { id: "CLI-012", clearanceId: "CLR-002", department: "HR", item: "Exit interview and document handover", owner: "Sana Iqbal", status: "Cleared", amountRecoverable: null, clearedBy: "Sana Iqbal", clearedOn: "2026-08-28", note: "Exit interview held 28 August 2026." },
];

export function clearance(id: string): Clearance | undefined {
  return clearances.find((row) => row.id === id);
}

export function clearanceItemsFor(clearanceId: string): readonly ClearanceItem[] {
  return clearanceItems.filter((row) => row.clearanceId === clearanceId);
}

/** An item is settled when it is cleared or waived; "Outstanding" may still be settled by recovery. */
export function clearanceItemIsSettled(row: ClearanceItem): boolean {
  if (row.status === "Cleared" || row.status === "Waived") return true;
  // An outstanding item with a recoverable amount is settled through the
  // settlement, so it does not block clearance once the amount is known.
  return row.status === "Outstanding" && row.amountRecoverable !== null;
}

export function clearanceIsComplete(clearanceId: string): boolean {
  const rows = clearanceItemsFor(clearanceId);
  return rows.length > 0 && rows.every(clearanceItemIsSettled);
}

export function clearanceRecoverableTotal(clearanceId: string): number {
  return clearanceItemsFor(clearanceId).reduce((total, row) => total + (row.amountRecoverable ?? 0), 0);
}

export interface ClearanceProgress {
  clearanceId: string;
  total: number;
  settled: number;
  outstanding: number;
  recoverable: number;
  complete: boolean;
}

export function clearanceProgress(clearanceId: string): ClearanceProgress {
  const rows = clearanceItemsFor(clearanceId);
  const settled = rows.filter(clearanceItemIsSettled);
  return {
    clearanceId,
    total: rows.length,
    settled: settled.length,
    outstanding: rows.length - settled.length,
    recoverable: clearanceRecoverableTotal(clearanceId),
    complete: clearanceIsComplete(clearanceId),
  };
}

/* ------------------------------------------------------------------ */
/* 13. Final settlement                                               */
/* ------------------------------------------------------------------ */

export interface ExitPolicy {
  /** Completed years of service before gratuity is earned at all. */
  minimumServiceYearsForGratuity: number;
  /** Leave types whose balance is paid out on exit. */
  encashableLeaveTypeIds: readonly string[];
  maximumEncashableDays: number;
  /** Working days used to derive a daily rate, shared with Phase 3. */
  standardMonthDays: number;
  settlementDueWithinDays: number;
}

export const exitPolicy: ExitPolicy = {
  minimumServiceYearsForGratuity: 1,
  encashableLeaveTypeIds: ["LVT-ANN"],
  maximumEncashableDays: 30,
  standardMonthDays: payrollPolicy.standardMonthDays,
  settlementDueWithinDays: 30,
};

export type SettlementSource =
  | "Payroll"
  | "Leave"
  | "Overtime"
  | "Bonus"
  | "Gratuity"
  | "Loan"
  | "Advance"
  | "Clearance"
  | "Notice"
  | "Tax";

export interface SettlementLine {
  code: string;
  label: string;
  kind: "Earning" | "Deduction";
  amount: number;
  /** How the number was arrived at, so a settlement can be explained. */
  basis: string;
  source: SettlementSource;
  reference: string;
}

export type SettlementStatus = "Draft" | "Pending HR" | "Pending finance" | "Approved" | "Paid" | "Rejected";

export const settlementTransitions: Readonly<Record<SettlementStatus, readonly SettlementStatus[]>> = {
  "Draft": ["Pending HR", "Rejected"],
  "Pending HR": ["Pending finance", "Draft", "Rejected"],
  "Pending finance": ["Approved", "Draft", "Rejected"],
  "Approved": ["Paid", "Rejected"],
  "Paid": [],
  "Rejected": [],
};

export interface FinalSettlement {
  id: string;
  reference: string;
  employeeId: string;
  kind: "Resignation" | "Termination";
  sourceId: string;
  lastWorkingDay: string;
  /** The payroll period the settlement is paid in. */
  settlementPeriod: string;
  clearanceId: string;
  status: SettlementStatus;
  /**
   * True when the lines are derived from the live payroll, leave and loan
   * records. False for a settlement recorded before those records existed,
   * which is stated rather than recomputed and quietly presented as derived.
   */
  computed: boolean;
  lines: readonly SettlementLine[];
  preparedBy: string;
  preparedOn: string;
  approvedBy: string | null;
  approvedOn: string | null;
  paidOn: string | null;
  paymentReference: string;
  journalReference: string;
  note: string;
}

/** Completed years of service between two dates. */
export function completedServiceYears(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let years = ty - fy;
  if (tm < fm || (tm === fm && td < fd)) years -= 1;
  return Math.max(0, years);
}

/** The gross a salary assignment produces, using Phase 3's structure and overrides. */
export function grossFromAssignment(assignment: SalaryAssignment): number {
  const structure = salaryStructure(assignment.structureId);
  if (!structure) return 0;
  const basic = assignment.overrides.BASIC
    ?? structure.items.find((item) => item.componentCode === "BASIC")?.amount
    ?? 0;
  let total = 0;
  for (const item of structure.items) {
    if (item.componentCode === "BASIC") { total += basic; continue; }
    if (item.componentCode === "HOUSE_RENT") { total += Math.round(basic * 0.4); continue; }
    if (item.componentCode === "MEDICAL") { total += Math.round(basic * 0.1); continue; }
    total += assignment.overrides[item.componentCode] ?? item.amount ?? 0;
  }
  return total;
}

export function basicFromAssignment(assignment: SalaryAssignment): number {
  const structure = salaryStructure(assignment.structureId);
  if (!structure) return 0;
  return assignment.overrides.BASIC
    ?? structure.items.find((item) => item.componentCode === "BASIC")?.amount
    ?? 0;
}

export interface SettlementComputation {
  lines: readonly SettlementLine[];
  grossEarnings: number;
  totalDeductions: number;
  netPayable: number;
  blockers: readonly string[];
}

/**
 * Derives a settlement from the live records: Phase 3's salary assignment and
 * loans, Phase 2's leave balance, this module's clearance recoveries and the
 * resignation's notice position. Nothing here writes to any of them.
 */
export function computeSettlement(
  employeeId: string,
  lastWorkingDay: string,
  clearanceId: string,
  options: { forfeitGratuity?: boolean; noticeShortfallDays?: number } = {},
): SettlementComputation {
  const person = employee(employeeId);
  const blockers: string[] = [];
  if (!person) return { lines: [], grossEarnings: 0, totalDeductions: 0, netPayable: 0, blockers: ["Employee record not found."] };

  const assignment = salaryAssignmentOn(employeeId, lastWorkingDay);
  if (!assignment) {
    blockers.push("No approved salary assignment covers the last working day, so salary, leave encashment and gratuity cannot be derived.");
  }
  const gross = assignment ? grossFromAssignment(assignment) : 0;
  const basic = assignment ? basicFromAssignment(assignment) : 0;
  const dailyGross = Math.round(gross / exitPolicy.standardMonthDays);
  const lines: SettlementLine[] = [];

  /* Salary for the part of the final month that was worked. */
  if (assignment) {
    const workedDays = Number(lastWorkingDay.slice(8, 10));
    const amount = Math.round((gross * workedDays) / exitPolicy.standardMonthDays);
    lines.push({
      code: "SALARY", label: "Salary to the last working day", kind: "Earning", amount,
      basis: `${formatMoney(gross, assignment.currency)} × ${workedDays} of ${exitPolicy.standardMonthDays} days`,
      source: "Payroll", reference: assignment.id,
    });
  }

  /* Leave encashment, from Phase 2's balance, capped by policy. */
  if (assignment) {
    for (const typeId of exitPolicy.encashableLeaveTypeIds) {
      const balance = leaveBalance(employeeId, typeId);
      const days = Math.min(Math.max(0, balance.available), exitPolicy.maximumEncashableDays);
      if (days === 0) continue;
      const type = leaveTypes.find((row) => row.id === typeId);
      lines.push({
        code: "LEAVE_ENCASH", label: `${type?.name ?? typeId} encashment`, kind: "Earning",
        amount: Math.round(days * dailyGross),
        basis: `${days} day(s) available × ${formatMoney(dailyGross, assignment.currency)} daily gross (capped at ${exitPolicy.maximumEncashableDays})`,
        source: "Leave", reference: typeId,
      });
    }
  }

  /* Approved bonuses and allowances awaiting payment in this period. */
  const period = lastWorkingDay.slice(0, 7);
  for (const adjustment of payrollAdjustments) {
    if (adjustment.employeeId !== employeeId || adjustment.period !== period) continue;
    if (adjustment.status !== "Approved") continue;
    const isEarning = adjustment.kind === "Bonus" || adjustment.kind === "Arrears" || adjustment.kind === "Allowance";
    lines.push({
      code: adjustment.componentCode, label: adjustment.kind, kind: isEarning ? "Earning" : "Deduction",
      amount: adjustment.amount, basis: adjustment.reason,
      source: adjustment.kind === "Bonus" ? "Bonus" : "Payroll", reference: adjustment.id,
    });
  }

  /* Gratuity: one month's basic per completed year, unless forfeited. */
  if (assignment) {
    const years = completedServiceYears(person.joinedOn, lastWorkingDay);
    if (options.forfeitGratuity) {
      lines.push({
        code: "GRATUITY", label: "Gratuity — forfeited", kind: "Earning", amount: 0,
        basis: `${years} completed year(s), forfeited under the termination reason`,
        source: "Gratuity", reference: "exitPolicy",
      });
    } else if (years >= exitPolicy.minimumServiceYearsForGratuity) {
      lines.push({
        code: "GRATUITY", label: "Gratuity", kind: "Earning", amount: years * basic,
        basis: `${years} completed year(s) × one month's basic ${formatMoney(basic, assignment.currency)}`,
        source: "Gratuity", reference: "exitPolicy",
      });
    }
  }

  /* Outstanding loans and advances. */
  for (const loan of employeeLoans) {
    if (loan.employeeId !== employeeId) continue;
    if (loan.status !== "Repaying" && loan.status !== "Disbursed") continue;
    const outstanding = loanOutstanding(loan);
    if (outstanding === 0) continue;
    lines.push({
      code: loan.kind === "Loan" ? "LOAN" : "ADVANCE",
      label: `${loan.kind} recovery — full outstanding balance`, kind: "Deduction", amount: outstanding,
      basis: `${loan.instalments.filter((row) => row.status === "Due").length} unpaid instalment(s) recovered in full on exit`,
      source: loan.kind === "Loan" ? "Loan" : "Advance", reference: loan.id,
    });
  }

  /* Unreturned assets and other clearance recoveries. */
  for (const item of clearanceItemsFor(clearanceId)) {
    if (item.amountRecoverable === null) continue;
    lines.push({
      code: "CLEARANCE", label: item.item, kind: "Deduction", amount: item.amountRecoverable,
      basis: `${item.department} clearance: ${item.note}`, source: "Clearance", reference: item.id,
    });
  }

  /* Notice not served and not waived. */
  const shortfall = options.noticeShortfallDays ?? 0;
  if (shortfall > 0 && assignment) {
    lines.push({
      code: "NOTICE", label: "Notice shortfall recovery", kind: "Deduction",
      amount: Math.round(shortfall * dailyGross),
      basis: `${shortfall} day(s) of notice not served × ${formatMoney(dailyGross, assignment.currency)} daily gross`,
      source: "Notice", reference: "noticePeriod",
    });
  }

  const grossEarnings = lines.filter((row) => row.kind === "Earning").reduce((total, row) => total + row.amount, 0);

  /* Income tax on the settlement, using Phase 3's own rule. */
  if (assignment) {
    const taxable = Math.max(0, grossEarnings - money(50000));
    const tax = Math.round(taxable * 0.05);
    if (tax > 0) {
      lines.push({
        code: "TAX", label: "Income tax", kind: "Deduction", amount: tax,
        basis: `5% of ${formatMoney(taxable, assignment.currency)} above the ${formatMoney(money(50000), assignment.currency)} threshold`,
        source: "Tax", reference: "PC-TAX",
      });
    }
  }

  const totalDeductions = lines.filter((row) => row.kind === "Deduction").reduce((total, row) => total + row.amount, 0);
  return { lines, grossEarnings, totalDeductions, netPayable: grossEarnings - totalDeductions, blockers };
}

/** The computation behind a settlement, read from its own source record. */
export function computationFor(settlement: FinalSettlement): SettlementComputation {
  const source = settlement.kind === "Resignation" ? resignation(settlement.sourceId) : undefined;
  const exit = settlement.kind === "Termination" ? termination(settlement.sourceId) : undefined;
  return computeSettlement(settlement.employeeId, settlement.lastWorkingDay, settlement.clearanceId, {
    forfeitGratuity: exit ? gratuityIsForfeited(exit.reason) : false,
    noticeShortfallDays: source && source.shortfallWaivedBy === null ? source.noticeShortfallDays : 0,
  });
}

export function settlementGrossEarnings(row: FinalSettlement): number {
  return row.lines.filter((line) => line.kind === "Earning").reduce((total, line) => total + line.amount, 0);
}

export function settlementDeductions(row: FinalSettlement): number {
  return row.lines.filter((line) => line.kind === "Deduction").reduce((total, line) => total + line.amount, 0);
}

export function settlementNet(row: FinalSettlement): number {
  return settlementGrossEarnings(row) - settlementDeductions(row);
}

export function settlementLinesOf(settlementId: string): readonly SettlementLine[] {
  return finalSettlements.find((row) => row.id === settlementId)?.lines ?? [];
}

/** A computed settlement's stored lines must match the recomputation. */
export function settlementAgreesWithComputation(row: FinalSettlement): boolean {
  if (!row.computed) return true;
  const computed = computationFor(row);
  if (computed.lines.length !== row.lines.length) return false;
  return computed.lines.every((line, index) => {
    const stored = row.lines[index];
    return stored.code === line.code && stored.kind === line.kind && stored.amount === line.amount;
  });
}

/**
 * Nothing is paid before clearance is complete. This is the control that stops
 * a laptop walking out of the building with a cheque.
 */
export function canPaySettlement(row: FinalSettlement): boolean {
  if (!settlementTransitions[row.status].includes("Paid")) return false;
  if (!clearanceIsComplete(row.clearanceId)) return false;
  return row.paymentReference.length > 0 || row.status === "Approved";
}

export function settlementBlockers(row: FinalSettlement): readonly string[] {
  const blockers: string[] = [];
  if (!clearanceIsComplete(row.clearanceId)) {
    const progress = clearanceProgress(row.clearanceId);
    blockers.push(`Clearance ${row.clearanceId} is incomplete: ${progress.outstanding} of ${progress.total} item(s) unsettled.`);
  }
  if (row.computed && !settlementAgreesWithComputation(row)) {
    blockers.push("Stored lines do not match a recomputation from payroll, leave and loan records.");
  }
  if (row.status === "Paid" && row.paymentReference.length === 0) {
    blockers.push("Marked Paid with no payment reference.");
  }
  const computed = computationFor(row);
  for (const blocker of computed.blockers) blockers.push(blocker);
  return blockers;
}

/**
 * Settlement fixtures. FST-001 is derived from the live records, so its lines
 * are generated rather than typed: a hand-typed settlement is exactly the thing
 * this module exists to prevent. FST-002 predates the payroll module holding
 * that employee's salary assignment, so it is a recorded snapshot and says so.
 */
const fst001 = computeSettlement("EMP-3", "2026-10-19", "CLR-001", { noticeShortfallDays: 0 });

export const finalSettlements: readonly FinalSettlement[] = [
  {
    id: "FST-001", reference: "FST-2026-0007", employeeId: "EMP-3", kind: "Resignation", sourceId: "RSG-001",
    lastWorkingDay: "2026-10-19", settlementPeriod: "2026-10", clearanceId: "CLR-001",
    status: "Draft", computed: true, lines: fst001.lines,
    preparedBy: "Mariam Ali", preparedOn: "2026-09-17", approvedBy: null, approvedOn: null,
    paidOn: null, paymentReference: "", journalReference: "",
    note: "Draft: clearance is still in progress and the last working day has not passed. Every line is derived from the salary assignment, leave balance, loan schedule and clearance record.",
  },
  {
    id: "FST-002", reference: "FST-2026-0004", employeeId: "EMP-6", kind: "Resignation", sourceId: "RSG-003",
    lastWorkingDay: "2026-08-31", settlementPeriod: "2026-08", clearanceId: "CLR-002",
    status: "Paid", computed: false,
    lines: [
      { code: "SALARY", label: "Salary to the last working day", kind: "Earning", amount: money(145000), basis: "Full month to 31 August 2026 at the associate structure", source: "Payroll", reference: "Recorded at settlement" },
      { code: "LEAVE_ENCASH", label: "Annual Leave encashment", kind: "Earning", amount: money(29000), basis: "6 days available × Rs 4,833 daily gross", source: "Leave", reference: "LVT-ANN" },
      { code: "GRATUITY", label: "Gratuity", kind: "Earning", amount: money(180000), basis: "2 completed years × one month's basic Rs 90,000", source: "Gratuity", reference: "exitPolicy" },
      { code: "CLEARANCE", label: "Return laptop AST-0771 and access card", kind: "Deduction", amount: money(35000), basis: "Assets clearance: access card and docking station not returned", source: "Clearance", reference: "CLI-009" },
      { code: "TAX", label: "Income tax", kind: "Deduction", amount: money(15200), basis: "5% of Rs 304,000 above the Rs 50,000 threshold", source: "Tax", reference: "PC-TAX" },
    ],
    preparedBy: "Mariam Ali", preparedOn: "2026-09-02", approvedBy: "Omar Siddiqui", approvedOn: "2026-09-08",
    paidOn: "2026-09-10", paymentReference: "BNK-2026-09-0331", journalReference: "JRN-2026-09-0188",
    note: "Notice shortfall of 13 days waived under the office-closure terms, so no notice recovery appears. Recorded rather than recomputed: the payroll module holds no salary assignment for this employee.",
  },
];

export function finalSettlement(id: string): FinalSettlement | undefined {
  return finalSettlements.find((row) => row.id === id);
}

export function settlementFor(employeeId: string): FinalSettlement | undefined {
  return finalSettlements.find((row) => row.employeeId === employeeId);
}

/* ------------------------------------------------------------------ */
/* 14. Lifecycle audit                                                */
/* ------------------------------------------------------------------ */

export type LifecycleEntity =
  | "Onboarding"
  | "Probation"
  | "Movement"
  | "Resignation"
  | "Termination"
  | "Clearance"
  | "Settlement";

export interface LifecycleEvent {
  id: string;
  entity: LifecycleEntity;
  entityId: string;
  employeeId: string;
  at: string;
  actor: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string;
}

/**
 * Append-only. Nothing in this module removes a row, and every terminal state
 * — Withdrawn, Rejected, Cancelled — keeps its trail, because those are the
 * records that explain why someone is still employed.
 */
export const lifecycleEvents: readonly LifecycleEvent[] = [
  { id: "LFE-001", entity: "Onboarding", entityId: "OBC-001", employeeId: "EMP-7", at: "2026-06-24 09:00", actor: "Sana Iqbal", action: "Started", fromStatus: null, toStatus: "In progress", note: "Standard onboarding, twelve tasks." },
  { id: "LFE-002", entity: "Onboarding", entityId: "OBC-001", employeeId: "EMP-7", at: "2026-07-04 16:20", actor: "Zainab Farooq", action: "Task completed", fromStatus: "Pending", toStatus: "Completed", note: "Policy acknowledgement POL-ACK-2026-0044." },
  { id: "LFE-003", entity: "Probation", entityId: "PRB-006", employeeId: "EMP-7", at: "2026-09-14 11:30", actor: "Bilal Khan", action: "Recommended", fromStatus: "In review", toStatus: "Recommended", note: "Extend by two months." },
  { id: "LFE-004", entity: "Termination", entityId: "TRM-001", employeeId: "EMP-7", at: "2026-09-14 12:05", actor: "Bilal Khan", action: "Initiated", fromStatus: null, toStatus: "Draft", note: "Poor performance, raised alongside the interim review." },
  { id: "LFE-005", entity: "Termination", entityId: "TRM-001", employeeId: "EMP-7", at: "2026-09-16 10:15", actor: "Sana Iqbal", action: "Rejected", fromStatus: "Pending HR", toStatus: "Rejected", note: "Extension preferred; delivery performance is on track." },
  { id: "LFE-006", entity: "Movement", entityId: "MOV-001", employeeId: "EMP-5", at: "2026-05-18 14:40", actor: "Mariam Ali", action: "Approved", fromStatus: "Pending approval", toStatus: "Approved", note: "APR-2026-0163." },
  { id: "LFE-007", entity: "Movement", entityId: "MOV-001", employeeId: "EMP-5", at: "2026-06-01 00:05", actor: "System", action: "Effective", fromStatus: "Approved", toStatus: "Effective", note: "Assignment ASG-008 created; ASG-007 closed on 31 May 2026." },
  { id: "LFE-008", entity: "Movement", entityId: "MOV-004", employeeId: "EMP-4", at: "2026-09-05 15:10", actor: "Omar Siddiqui", action: "Rejected", fromStatus: "Pending approval", toStatus: "Rejected", note: "People & Culture cannot be left without an owner." },
  { id: "LFE-009", entity: "Movement", entityId: "MOV-005", employeeId: "EMP-8", at: "2026-09-18 09:30", actor: "Sana Iqbal", action: "Cancelled", fromStatus: "Draft", toStatus: "Cancelled", note: "Mentoring belongs on the onboarding checklist." },
  { id: "LFE-010", entity: "Resignation", entityId: "RSG-002", employeeId: "EMP-5", at: "2026-07-02 17:45", actor: "Ayesha Malik", action: "Submitted", fromStatus: null, toStatus: "Submitted", note: "Concern about role scope." },
  { id: "LFE-011", entity: "Resignation", entityId: "RSG-002", employeeId: "EMP-5", at: "2026-07-10 11:00", actor: "Ayesha Malik", action: "Withdrawn", fromStatus: "HR review", toStatus: "Withdrawn", note: "Scope clarified; grade review agreed for the annual cycle." },
  { id: "LFE-012", entity: "Resignation", entityId: "RSG-003", employeeId: "EMP-6", at: "2026-07-15 10:20", actor: "Hassan Raza", action: "Submitted", fromStatus: null, toStatus: "Submitted", note: "Karachi office closing." },
  { id: "LFE-013", entity: "Termination", entityId: "TRM-002", employeeId: "EMP-6", at: "2026-07-28 09:15", actor: "Sana Iqbal", action: "Cancelled", fromStatus: "Pending management", toStatus: "Cancelled", note: "Superseded by the resignation; two of three approvals had been collected." },
  { id: "LFE-014", entity: "Resignation", entityId: "RSG-003", employeeId: "EMP-6", at: "2026-07-28 09:40", actor: "Sana Iqbal", action: "Accepted", fromStatus: "HR review", toStatus: "Notice period", note: "Notice shortfall of 13 days waived under the closure terms." },
  { id: "LFE-015", entity: "Clearance", entityId: "CLR-002", employeeId: "EMP-6", at: "2026-08-30 16:30", actor: "Sana Iqbal", action: "Completed", fromStatus: "In progress", toStatus: "Completed", note: "One asset not returned; Rs 35,000 recovered on the settlement." },
  { id: "LFE-016", entity: "Settlement", entityId: "FST-002", employeeId: "EMP-6", at: "2026-09-10 12:00", actor: "Mariam Ali", action: "Paid", fromStatus: "Approved", toStatus: "Paid", note: "BNK-2026-09-0331; journal JRN-2026-09-0188." },
  { id: "LFE-017", entity: "Resignation", entityId: "RSG-001", employeeId: "EMP-3", at: "2026-08-20 18:10", actor: "Bilal Khan", action: "Submitted", fromStatus: null, toStatus: "Submitted", note: "Sixty days' notice; last working day 19 October 2026." },
  { id: "LFE-018", entity: "Resignation", entityId: "RSG-001", employeeId: "EMP-3", at: "2026-08-27 14:00", actor: "Sana Iqbal", action: "Accepted", fromStatus: "HR review", toStatus: "Notice period", note: "Full notice served. Replacement requisition MRQ-2026-0018 approved." },
  { id: "LFE-019", entity: "Clearance", entityId: "CLR-001", employeeId: "EMP-3", at: "2026-09-15 09:00", actor: "Sana Iqbal", action: "Started", fromStatus: null, toStatus: "In progress", note: "Six departments." },
  { id: "LFE-020", entity: "Settlement", entityId: "FST-001", employeeId: "EMP-3", at: "2026-09-17 11:20", actor: "Mariam Ali", action: "Drafted", fromStatus: null, toStatus: "Draft", note: "Derived from the salary assignment, leave balance, loan schedule and clearance record." },
  { id: "LFE-021", entity: "Onboarding", entityId: "OBC-002", employeeId: "EMP-8", at: "2026-09-16 10:00", actor: "Sana Iqbal", action: "Started", fromStatus: null, toStatus: "Blocked", note: "Internship onboarding; bank account and attendance registration outstanding." },
  { id: "LFE-022", entity: "Probation", entityId: "PRB-007", employeeId: "EMP-8", at: "2026-09-16 10:05", actor: "Sana Iqbal", action: "Scheduled", fromStatus: null, toStatus: "Scheduled", note: "Final review due 19 February 2027." },
];

export function lifecycleEventsFor(entity: LifecycleEntity, entityId: string): readonly LifecycleEvent[] {
  return lifecycleEvents
    .filter((row) => row.entity === entity && row.entityId === entityId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function lifecycleEventsForEmployee(employeeId: string): readonly LifecycleEvent[] {
  return lifecycleEvents
    .filter((row) => row.employeeId === employeeId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/* ------------------------------------------------------------------ */
/* Reporting                                                          */
/* ------------------------------------------------------------------ */

export interface TurnoverRow {
  period: string;
  resignations: number;
  terminations: number;
}

export function turnoverByMonth(): readonly TurnoverRow[] {
  const periods = new Set<string>();
  for (const row of resignations) periods.add(row.agreedLastDay.slice(0, 7));
  for (const row of terminations) periods.add(row.effectiveDate.slice(0, 7));
  return [...periods].sort().map((period) => ({
    period,
    resignations: resignations.filter(
      (row) => row.agreedLastDay.slice(0, 7) === period && row.status !== "Withdrawn" && row.status !== "Rejected",
    ).length,
    terminations: terminations.filter(
      (row) => row.effectiveDate.slice(0, 7) === period && row.status === "Executed",
    ).length,
  }));
}

/** Employees whose exit is under way but not finished. */
export function exitsInProgress(): readonly { employeeId: string; kind: string; reference: string; status: string; lastDay: string }[] {
  const open: { employeeId: string; kind: string; reference: string; status: string; lastDay: string }[] = [];
  for (const row of resignations) {
    if (row.status === "Withdrawn" || row.status === "Rejected" || row.status === "Completed") continue;
    open.push({ employeeId: row.employeeId, kind: "Resignation", reference: row.reference, status: row.status, lastDay: row.agreedLastDay });
  }
  for (const row of terminations) {
    if (row.status === "Rejected" || row.status === "Cancelled" || row.status === "Executed") continue;
    open.push({ employeeId: row.employeeId, kind: "Termination", reference: row.reference, status: row.status, lastDay: row.effectiveDate });
  }
  return open.sort((a, b) => a.lastDay.localeCompare(b.lastDay));
}

/** The lifecycle status an employee's Phase 4 records imply. */
export function lifecycleStageOf(employeeId: string): string {
  const person = employee(employeeId);
  if (!person) return "—";
  const exit = resignationsFor(employeeId).find(
    (row) => row.status !== "Withdrawn" && row.status !== "Rejected",
  );
  if (exit) return `Exiting — ${exit.status}`;
  const list = checklistFor(employeeId);
  if (list && checklistProgress(list.id).outstanding > 0) return "Onboarding";
  const probation = probationReviewsFor(employeeId).find((row) => row.status !== "Approved" && row.status !== "Cancelled");
  if (probation) return `Probation — ${probation.status}`;
  return "Steady state";
}

export const PROBATION_STATUSES: readonly EmployeeStatus[] = ["Probation"];
