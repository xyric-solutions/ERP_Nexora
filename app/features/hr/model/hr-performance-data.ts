/**
 * Phase 4b — performance management and training fixtures for the isolated
 * Nexora UI/UX prototype.
 *
 * This is the visual specification of the performance and training half of
 * Phase 4 (docs/business/hr-lifecycle-design.md in the main repository).
 *
 * Four rules are modelled as data:
 *
 *   - Cycles, KPIs, goals and the rating scale are CONFIGURATION, not code. A
 *     company that reviews on five levels and one that reviews on four use the
 *     same screens.
 *   - A self-evaluation and a manager evaluation are separate records. Neither
 *     overwrites the other, and the final score is computed from the manager's
 *     rows alone, with the employee's own view kept beside it rather than
 *     replaced by it.
 *   - Performance NEVER writes to payroll. An approved result may propose a
 *     bonus or a salary revision, but the money only moves through Phase 3's
 *     own authorised transaction, and the proposal carries the link to it.
 *   - Training completion is earned, not asserted: it requires the attendance
 *     the programme demands and, where the programme assesses, a pass.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

import { HR_TODAY, employedStatuses, employee, employees, type Employee } from "./hr-core-data.ts";
import { money, payrollAdjustments, salaryRevisions } from "./hr-payroll-data.ts";
import { daysBetween } from "./hr-recruitment-data.ts";

/* ------------------------------------------------------------------ */
/* Rating scale — configuration                                       */
/* ------------------------------------------------------------------ */

export interface RatingLevel {
  id: string;
  label: string;
  /** Inclusive lower bound of the final score, out of 100. */
  from: number;
  /** Inclusive upper bound. */
  to: number;
  /** Whether this level may carry a bonus or increase proposal at all. */
  bonusEligible: boolean;
  promotionEligible: boolean;
  /** Indicative increase, as a percentage. A proposal still needs approval. */
  indicativeIncreasePercent: number;
}

export interface RatingScale {
  id: string;
  code: string;
  name: string;
  /** Scores per criterion run 1..scoreMax before weighting. */
  scoreMax: number;
  levels: readonly RatingLevel[];
  status: "Active" | "Inactive";
}

export const ratingScales: readonly RatingScale[] = [
  {
    id: "RSC-5", code: "FIVE", name: "Five-level scale", scoreMax: 5, status: "Active",
    levels: [
      { id: "RL-5", label: "Outstanding", from: 90, to: 100, bonusEligible: true, promotionEligible: true, indicativeIncreasePercent: 15 },
      { id: "RL-4", label: "Exceeds expectations", from: 75, to: 89.99, bonusEligible: true, promotionEligible: true, indicativeIncreasePercent: 10 },
      { id: "RL-3", label: "Meets expectations", from: 60, to: 74.99, bonusEligible: true, promotionEligible: false, indicativeIncreasePercent: 6 },
      { id: "RL-2", label: "Needs improvement", from: 45, to: 59.99, bonusEligible: false, promotionEligible: false, indicativeIncreasePercent: 0 },
      { id: "RL-1", label: "Unsatisfactory", from: 0, to: 44.99, bonusEligible: false, promotionEligible: false, indicativeIncreasePercent: 0 },
    ],
  },
  {
    id: "RSC-4", code: "FOUR", name: "Four-level scale", scoreMax: 4, status: "Inactive",
    levels: [
      { id: "R4-4", label: "Exceptional", from: 85, to: 100, bonusEligible: true, promotionEligible: true, indicativeIncreasePercent: 12 },
      { id: "R4-3", label: "Strong", from: 70, to: 84.99, bonusEligible: true, promotionEligible: true, indicativeIncreasePercent: 8 },
      { id: "R4-2", label: "Developing", from: 50, to: 69.99, bonusEligible: false, promotionEligible: false, indicativeIncreasePercent: 0 },
      { id: "R4-1", label: "Below standard", from: 0, to: 49.99, bonusEligible: false, promotionEligible: false, indicativeIncreasePercent: 0 },
    ],
  },
];

export function ratingScale(id: string): RatingScale | undefined {
  return ratingScales.find((row) => row.id === id);
}

export function ratingLevelFor(scaleId: string, score: number): RatingLevel | undefined {
  return ratingScale(scaleId)?.levels.find((level) => score >= level.from && score <= level.to);
}

export function ratingLevel(scaleId: string, levelId: string): RatingLevel | undefined {
  return ratingScale(scaleId)?.levels.find((level) => level.id === levelId);
}

/* ------------------------------------------------------------------ */
/* Performance policy                                                 */
/* ------------------------------------------------------------------ */

export interface PerformancePolicy {
  /** Approved goal weights must total exactly this, per employee per cycle. */
  requiredWeightTotal: number;
  /** Months of service inside the cycle before an employee can be rated. */
  minimumServiceMonthsForRating: number;
  selfEvaluationRequired: boolean;
  /** Calibration is a separate step; a manager cannot both rate and calibrate. */
  calibrationRequired: boolean;
}

export const performancePolicy: PerformancePolicy = {
  requiredWeightTotal: 100,
  minimumServiceMonthsForRating: 6,
  selfEvaluationRequired: true,
  calibrationRequired: true,
};

/* ------------------------------------------------------------------ */
/* KPI library — configuration                                        */
/* ------------------------------------------------------------------ */

export type KpiCategory = "Financial" | "Customer" | "Process" | "People" | "Delivery" | "Compliance";

export interface Kpi {
  id: string;
  code: string;
  name: string;
  description: string;
  category: KpiCategory;
  unit: string;
  direction: "Higher is better" | "Lower is better";
  /** Empty means every grade. */
  applicableGradeIds: readonly string[];
  /** Empty means every department. */
  applicableDepartmentIds: readonly string[];
  status: "Active" | "Inactive";
}

export const kpis: readonly Kpi[] = [
  { id: "KPI-001", code: "GM", name: "Gross margin", description: "Delivered gross margin against plan.", category: "Financial", unit: "%", direction: "Higher is better", applicableGradeIds: ["GRD-001", "GRD-002", "GRD-003"], applicableDepartmentIds: [], status: "Active" },
  { id: "KPI-002", code: "CLOSE", name: "Month-end close days", description: "Working days from period end to a signed-off close.", category: "Process", unit: "days", direction: "Lower is better", applicableGradeIds: [], applicableDepartmentIds: ["ORG-DP-001"], status: "Active" },
  { id: "KPI-003", code: "CSAT", name: "Client satisfaction", description: "Average client satisfaction score across engagements.", category: "Customer", unit: "score", direction: "Higher is better", applicableGradeIds: [], applicableDepartmentIds: [], status: "Active" },
  { id: "KPI-004", code: "DELIV", name: "On-time delivery", description: "Milestones delivered on or before the committed date.", category: "Delivery", unit: "%", direction: "Higher is better", applicableGradeIds: [], applicableDepartmentIds: ["ORG-DP-003", "ORG-DP-007", "ORG-DP-004"], status: "Active" },
  { id: "KPI-005", code: "DEFECT", name: "Escaped defects", description: "Defects reaching a client per release.", category: "Delivery", unit: "count", direction: "Lower is better", applicableGradeIds: [], applicableDepartmentIds: ["ORG-DP-003", "ORG-DP-007"], status: "Active" },
  { id: "KPI-006", code: "RETAIN", name: "Team retention", description: "Voluntary retention of the reporting team.", category: "People", unit: "%", direction: "Higher is better", applicableGradeIds: ["GRD-001", "GRD-002", "GRD-003"], applicableDepartmentIds: [], status: "Active" },
  { id: "KPI-007", code: "AUDIT", name: "Audit findings closed", description: "Internal audit findings closed within the agreed date.", category: "Compliance", unit: "%", direction: "Higher is better", applicableGradeIds: [], applicableDepartmentIds: [], status: "Active" },
  { id: "KPI-008", code: "TTH", name: "Time to hire", description: "Median days from application to an accepted offer.", category: "Process", unit: "days", direction: "Lower is better", applicableGradeIds: [], applicableDepartmentIds: ["ORG-DP-002"], status: "Active" },
  { id: "KPI-009", code: "UTIL", name: "Billable utilisation", description: "Billable hours as a share of available hours.", category: "Financial", unit: "%", direction: "Higher is better", applicableGradeIds: [], applicableDepartmentIds: ["ORG-DP-003", "ORG-DP-007"], status: "Inactive" },
];

export function kpi(id: string): Kpi | undefined {
  return kpis.find((row) => row.id === id);
}

/* ------------------------------------------------------------------ */
/* Performance cycle                                                  */
/* ------------------------------------------------------------------ */

export type CycleStatus =
  | "Draft"
  | "Goal setting"
  | "In progress"
  | "Self evaluation"
  | "Manager evaluation"
  | "Calibration"
  | "Final rating"
  | "Closed"
  | "Cancelled";

/**
 * A cycle moves forward only. Reopening a closed cycle would let a rating be
 * restated after the pay decision it justified had already been made.
 */
export const cycleTransitions: Readonly<Record<CycleStatus, readonly CycleStatus[]>> = {
  "Draft": ["Goal setting", "Cancelled"],
  "Goal setting": ["In progress", "Cancelled"],
  "In progress": ["Self evaluation", "Cancelled"],
  "Self evaluation": ["Manager evaluation", "Cancelled"],
  "Manager evaluation": ["Calibration", "Cancelled"],
  "Calibration": ["Final rating", "Cancelled"],
  "Final rating": ["Closed"],
  "Closed": [],
  "Cancelled": [],
};

export const cycleChain: readonly CycleStatus[] = [
  "Draft", "Goal setting", "In progress", "Self evaluation", "Manager evaluation", "Calibration", "Final rating", "Closed",
];

export function canTransitionCycle(from: CycleStatus, to: CycleStatus): boolean {
  return cycleTransitions[from].includes(to);
}

export interface PerformanceCycle {
  id: string;
  reference: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  ratingScaleId: string;
  status: CycleStatus;
  goalSettingClosesOn: string;
  selfEvaluationClosesOn: string;
  managerEvaluationClosesOn: string;
  createdBy: string;
  createdOn: string;
  closedOn: string | null;
}

export const performanceCycles: readonly PerformanceCycle[] = [
  {
    id: "PFC-001", reference: "PFC-2025-A", name: "FY2025 Annual Review", periodStart: "2025-01-01", periodEnd: "2025-12-31",
    ratingScaleId: "RSC-5", status: "Closed", goalSettingClosesOn: "2025-02-15", selfEvaluationClosesOn: "2026-01-31",
    managerEvaluationClosesOn: "2026-02-28", createdBy: "Sana Iqbal", createdOn: "2025-01-06", closedOn: "2026-06-12",
  },
  {
    id: "PFC-002", reference: "PFC-2026-H1", name: "H1 2026 Mid-year Review", periodStart: "2026-01-01", periodEnd: "2026-06-30",
    ratingScaleId: "RSC-5", status: "Closed", goalSettingClosesOn: "2026-01-31", selfEvaluationClosesOn: "2026-07-15",
    managerEvaluationClosesOn: "2026-07-31", createdBy: "Sana Iqbal", createdOn: "2026-01-08", closedOn: "2026-08-10",
  },
  {
    id: "PFC-003", reference: "PFC-2026-A", name: "FY2026 Annual Review", periodStart: "2026-01-01", periodEnd: "2026-12-31",
    ratingScaleId: "RSC-5", status: "Self evaluation", goalSettingClosesOn: "2026-02-20", selfEvaluationClosesOn: "2026-09-30",
    managerEvaluationClosesOn: "2026-10-31", createdBy: "Sana Iqbal", createdOn: "2026-01-12", closedOn: null,
  },
];

export function performanceCycle(id: string): PerformanceCycle | undefined {
  return performanceCycles.find((row) => row.id === id);
}

/**
 * Months of service an employee has inside a cycle's period, measured to the
 * end of the cycle rather than to today. Eligibility is a property of the
 * cycle, so it does not change every time the screen is opened.
 */
export function serviceMonthsInCycle(person: Employee, cycle: PerformanceCycle): number {
  const start = person.joinedOn > cycle.periodStart ? person.joinedOn : cycle.periodStart;
  if (cycle.periodEnd <= start) return 0;
  return Math.floor(daysBetween(start, cycle.periodEnd) / 30);
}

/**
 * Whether an employee can be rated in a cycle. Someone who joined three weeks
 * before the cycle closed has no rateable period, and giving them a rating
 * anyway is how an average gets quietly distorted.
 */
export function ratingEligible(employeeId: string, cycleId: string): boolean {
  const person = employee(employeeId);
  const cycle = performanceCycle(cycleId);
  if (!person || !cycle) return false;
  if (!employedStatuses.includes(person.status) && person.status !== "Resigned") return false;
  return serviceMonthsInCycle(person, cycle) >= performancePolicy.minimumServiceMonthsForRating;
}

export function ratingEligibilityNote(employeeId: string, cycleId: string): string | null {
  const person = employee(employeeId);
  const cycle = performanceCycle(cycleId);
  if (!person || !cycle) return "Employee or cycle not found.";
  const months = serviceMonthsInCycle(person, cycle);
  if (months >= performancePolicy.minimumServiceMonthsForRating) return null;
  return `${months} month(s) of service inside the cycle; ${performancePolicy.minimumServiceMonthsForRating} required for a rating.`;
}

/* ------------------------------------------------------------------ */
/* Goals                                                              */
/* ------------------------------------------------------------------ */

export type GoalStatus =
  | "Draft"
  | "Submitted"
  | "Approved"
  | "Achieved"
  | "Partially achieved"
  | "Missed"
  | "Cancelled";

export interface Goal {
  id: string;
  cycleId: string;
  employeeId: string;
  /** A goal may be measured by a library KPI or stated qualitatively. */
  kpiId: string | null;
  title: string;
  description: string;
  /** Percentage weight within the employee's cycle. Approved goals total 100. */
  weight: number;
  target: string;
  actual: string;
  dueOn: string;
  status: GoalStatus;
  approvedBy: string | null;
  approvedOn: string | null;
}

export const goals: readonly Goal[] = [
  /* PFC-001 — EMP-2, the cycle that justified the promotion. */
  { id: "GOL-001", cycleId: "PFC-001", employeeId: "EMP-2", kpiId: "KPI-002", title: "Shorten the month-end close", description: "Bring the close to five working days without unreviewed manual journals.", weight: 40, target: "5 days", actual: "4 days", dueOn: "2025-12-31", status: "Achieved", approvedBy: "Omar Siddiqui", approvedOn: "2025-02-10" },
  { id: "GOL-002", cycleId: "PFC-001", employeeId: "EMP-2", kpiId: "KPI-007", title: "Close outstanding audit findings", description: "Close all 2024 internal audit findings within the agreed dates.", weight: 35, target: "100%", actual: "100%", dueOn: "2025-11-30", status: "Achieved", approvedBy: "Omar Siddiqui", approvedOn: "2025-02-10" },
  { id: "GOL-003", cycleId: "PFC-001", employeeId: "EMP-2", kpiId: null, title: "Build the finance team's reporting capability", description: "Two team members able to run the statutory pack unaided.", weight: 25, target: "2 people", actual: "2 people", dueOn: "2025-12-31", status: "Achieved", approvedBy: "Omar Siddiqui", approvedOn: "2025-02-10" },

  /* PFC-002 — EMP-2 and EMP-4, the mid-year cycle. */
  { id: "GOL-004", cycleId: "PFC-002", employeeId: "EMP-2", kpiId: "KPI-002", title: "Hold the four-day close", description: "Sustain a four-day close through the Lahore entity's first half.", weight: 40, target: "4 days", actual: "4 days", dueOn: "2026-06-30", status: "Achieved", approvedBy: "Omar Siddiqui", approvedOn: "2026-01-26" },
  { id: "GOL-005", cycleId: "PFC-002", employeeId: "EMP-2", kpiId: "KPI-001", title: "Improve delivered gross margin reporting", description: "Margin by engagement available within two days of close.", weight: 35, target: "2 days", actual: "3 days", dueOn: "2026-06-30", status: "Partially achieved", approvedBy: "Omar Siddiqui", approvedOn: "2026-01-26" },
  { id: "GOL-006", cycleId: "PFC-002", employeeId: "EMP-2", kpiId: "KPI-006", title: "Retain the finance team", description: "No voluntary departures from the finance team in H1.", weight: 25, target: "100%", actual: "100%", dueOn: "2026-06-30", status: "Achieved", approvedBy: "Omar Siddiqui", approvedOn: "2026-01-26" },

  { id: "GOL-007", cycleId: "PFC-002", employeeId: "EMP-4", kpiId: "KPI-008", title: "Reduce time to hire", description: "Median application-to-accepted-offer inside 30 days.", weight: 35, target: "30 days", actual: "26 days", dueOn: "2026-06-30", status: "Achieved", approvedBy: "Omar Siddiqui", approvedOn: "2026-01-26" },
  { id: "GOL-008", cycleId: "PFC-002", employeeId: "EMP-4", kpiId: "KPI-007", title: "Complete the compliance training round", description: "Every employee current on information security and policy training.", weight: 35, target: "100%", actual: "88%", dueOn: "2026-06-30", status: "Partially achieved", approvedBy: "Omar Siddiqui", approvedOn: "2026-01-26" },
  { id: "GOL-009", cycleId: "PFC-002", employeeId: "EMP-4", kpiId: null, title: "Deliver the employee records migration", description: "All employee documents classified and retention-tagged.", weight: 30, target: "100%", actual: "100%", dueOn: "2026-05-31", status: "Achieved", approvedBy: "Omar Siddiqui", approvedOn: "2026-01-26" },

  /* PFC-003 — the live cycle. */
  { id: "GOL-010", cycleId: "PFC-003", employeeId: "EMP-2", kpiId: "KPI-001", title: "Deliver margin reporting by engagement", description: "Engagement margin in the standard pack, reconciled to the ledger.", weight: 40, target: "2 days", actual: "", dueOn: "2026-12-31", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2026-02-16" },
  { id: "GOL-011", cycleId: "PFC-003", employeeId: "EMP-2", kpiId: "KPI-007", title: "Close 2025 audit findings", description: "All 2025 findings closed within the agreed dates.", weight: 35, target: "100%", actual: "", dueOn: "2026-11-30", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2026-02-16" },
  { id: "GOL-012", cycleId: "PFC-003", employeeId: "EMP-2", kpiId: "KPI-006", title: "Retain the finance team", description: "No voluntary departures from the finance team.", weight: 25, target: "100%", actual: "", dueOn: "2026-12-31", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2026-02-16" },

  { id: "GOL-013", cycleId: "PFC-003", employeeId: "EMP-3", kpiId: "KPI-004", title: "On-time delivery across the platform workstream", description: "Milestones delivered on or before the committed date.", weight: 40, target: "95%", actual: "", dueOn: "2026-12-31", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2026-02-18" },
  { id: "GOL-014", cycleId: "PFC-003", employeeId: "EMP-3", kpiId: "KPI-005", title: "Reduce escaped defects", description: "Fewer than two client-visible defects per release.", weight: 35, target: "< 2", actual: "", dueOn: "2026-12-31", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2026-02-18" },
  { id: "GOL-015", cycleId: "PFC-003", employeeId: "EMP-3", kpiId: null, title: "Mentor the graduate intake", description: "Each graduate has a development plan and a fortnightly review.", weight: 25, target: "2 graduates", actual: "", dueOn: "2026-12-31", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2026-02-18" },

  { id: "GOL-016", cycleId: "PFC-003", employeeId: "EMP-4", kpiId: "KPI-008", title: "Hold time to hire under 30 days", description: "Median application-to-accepted-offer inside 30 days.", weight: 35, target: "30 days", actual: "", dueOn: "2026-12-31", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2026-02-16" },
  { id: "GOL-017", cycleId: "PFC-003", employeeId: "EMP-4", kpiId: "KPI-007", title: "Compliance training current for every employee", description: "Information security and policy training valid for all staff.", weight: 40, target: "100%", actual: "", dueOn: "2026-12-31", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2026-02-16" },
  { id: "GOL-018", cycleId: "PFC-003", employeeId: "EMP-4", kpiId: null, title: "Deliver the onboarding programme", description: "Every new joiner completes induction inside their first two weeks.", weight: 25, target: "100%", actual: "", dueOn: "2026-12-31", status: "Approved", approvedBy: "Omar Siddiqui", approvedOn: "2026-02-16" },

  { id: "GOL-019", cycleId: "PFC-003", employeeId: "EMP-5", kpiId: "KPI-003", title: "Raise client satisfaction in managed services", description: "Average satisfaction of 4.5 across the managed-services book.", weight: 40, target: "4.5", actual: "", dueOn: "2026-12-31", status: "Approved", approvedBy: "Mariam Ali", approvedOn: "2026-02-20" },
  { id: "GOL-020", cycleId: "PFC-003", employeeId: "EMP-5", kpiId: "KPI-004", title: "Service operations on-time delivery", description: "SLA commitments met across the operations desk.", weight: 35, target: "97%", actual: "", dueOn: "2026-12-31", status: "Approved", approvedBy: "Mariam Ali", approvedOn: "2026-02-20" },
  { id: "GOL-021", cycleId: "PFC-003", employeeId: "EMP-5", kpiId: null, title: "Document the Commercial handover", description: "Commercial book handed over with a documented pipeline.", weight: 25, target: "Complete", actual: "", dueOn: "2026-09-30", status: "Approved", approvedBy: "Mariam Ali", approvedOn: "2026-02-20" },

  { id: "GOL-022", cycleId: "PFC-003", employeeId: "EMP-7", kpiId: "KPI-004", title: "Deliver assigned milestones on time", description: "Assigned delivery milestones met from the probation period onward.", weight: 50, target: "95%", actual: "", dueOn: "2026-12-31", status: "Approved", approvedBy: "Bilal Khan", approvedOn: "2026-07-08" },
  { id: "GOL-023", cycleId: "PFC-003", employeeId: "EMP-7", kpiId: "KPI-005", title: "Keep escaped defects at zero", description: "No client-visible defects in owned components.", weight: 30, target: "0", actual: "", dueOn: "2026-12-31", status: "Approved", approvedBy: "Bilal Khan", approvedOn: "2026-07-08" },
  { id: "GOL-024", cycleId: "PFC-003", employeeId: "EMP-7", kpiId: null, title: "Complete the induction and technical onboarding", description: "Induction, security training and the platform walkthrough completed.", weight: 20, target: "Complete", actual: "", dueOn: "2026-10-01", status: "Approved", approvedBy: "Bilal Khan", approvedOn: "2026-07-08" },

  /* A goal that is still being negotiated: not approved, so it does not
     count toward the weight total. */
  { id: "GOL-025", cycleId: "PFC-003", employeeId: "EMP-3", kpiId: "KPI-009", title: "Improve billable utilisation", description: "Proposed by the employee; the KPI is inactive, so it was not approved.", weight: 10, target: "82%", actual: "", dueOn: "2026-12-31", status: "Submitted", approvedBy: null, approvedOn: null },
];

export function goal(id: string): Goal | undefined {
  return goals.find((row) => row.id === id);
}

export function goalsFor(employeeId: string, cycleId: string): readonly Goal[] {
  return goals.filter((row) => row.employeeId === employeeId && row.cycleId === cycleId);
}

/** Only approved goals count. A draft goal cannot dilute an approved weight. */
export function approvedGoalsFor(employeeId: string, cycleId: string): readonly Goal[] {
  return goalsFor(employeeId, cycleId).filter(
    (row) => row.status !== "Draft" && row.status !== "Submitted" && row.status !== "Cancelled",
  );
}

export function goalWeightTotal(employeeId: string, cycleId: string): number {
  return approvedGoalsFor(employeeId, cycleId).reduce((total, row) => total + row.weight, 0);
}

export function goalWeightsAreValid(employeeId: string, cycleId: string): boolean {
  return goalWeightTotal(employeeId, cycleId) === performancePolicy.requiredWeightTotal;
}

/** A goal measured by a KPI may only use an active one. */
export function goalKpiIsSelectable(row: Goal): boolean {
  if (row.kpiId === null) return true;
  return kpi(row.kpiId)?.status === "Active";
}

/* ------------------------------------------------------------------ */
/* Reviews, and the two separate evaluations                          */
/* ------------------------------------------------------------------ */

export type ReviewStatus =
  | "Not started"
  | "Self evaluation"
  | "Manager evaluation"
  | "Calibration"
  | "Completed"
  | "Not rated";

export interface PerformanceReview {
  id: string;
  cycleId: string;
  employeeId: string;
  /** The reporting manager at the time of the review. */
  reviewerId: string;
  status: ReviewStatus;
  selfSubmittedOn: string | null;
  managerSubmittedOn: string | null;
  /** Calibration is done by someone other than the rating manager. */
  calibratedBy: string | null;
  calibratedOn: string | null;
  /** Set only at Completed, from the manager rows and the scale. */
  finalScore: number | null;
  finalLevelId: string | null;
  /** The employee's acknowledgement is recorded, not assumed. */
  acknowledgedOn: string | null;
  acknowledgementComment: string;
  note: string;
}

export const performanceReviews: readonly PerformanceReview[] = [
  { id: "PFR-001", cycleId: "PFC-001", employeeId: "EMP-2", reviewerId: "EMP-1", status: "Completed", selfSubmittedOn: "2026-01-20", managerSubmittedOn: "2026-02-14", calibratedBy: "Sana Iqbal", calibratedOn: "2026-05-28", finalScore: 95, finalLevelId: "RL-5", acknowledgedOn: "2026-06-14", acknowledgementComment: "Agreed. Grateful for the promotion discussion.", note: "Basis for the promotion to Finance Manager." },
  { id: "PFR-002", cycleId: "PFC-002", employeeId: "EMP-2", reviewerId: "EMP-1", status: "Completed", selfSubmittedOn: "2026-07-09", managerSubmittedOn: "2026-07-24", calibratedBy: "Sana Iqbal", calibratedOn: "2026-08-04", finalScore: 86, finalLevelId: "RL-4", acknowledgedOn: "2026-08-12", acknowledgementComment: "Agreed.", note: "" },
  { id: "PFR-003", cycleId: "PFC-002", employeeId: "EMP-4", reviewerId: "EMP-1", status: "Completed", selfSubmittedOn: "2026-07-10", managerSubmittedOn: "2026-07-25", calibratedBy: "Mariam Ali", calibratedOn: "2026-08-04", finalScore: 86, finalLevelId: "RL-4", acknowledgedOn: "2026-08-12", acknowledgementComment: "Agreed; the training shortfall is understood.", note: "" },
  { id: "PFR-004", cycleId: "PFC-003", employeeId: "EMP-2", reviewerId: "EMP-1", status: "Self evaluation", selfSubmittedOn: "2026-09-15", managerSubmittedOn: null, calibratedBy: null, calibratedOn: null, finalScore: null, finalLevelId: null, acknowledgedOn: null, acknowledgementComment: "", note: "" },
  { id: "PFR-005", cycleId: "PFC-003", employeeId: "EMP-3", reviewerId: "EMP-1", status: "Self evaluation", selfSubmittedOn: "2026-09-16", managerSubmittedOn: null, calibratedBy: null, calibratedOn: null, finalScore: null, finalLevelId: null, acknowledgedOn: null, acknowledgementComment: "", note: "" },
  { id: "PFR-006", cycleId: "PFC-003", employeeId: "EMP-4", reviewerId: "EMP-1", status: "Not started", selfSubmittedOn: null, managerSubmittedOn: null, calibratedBy: null, calibratedOn: null, finalScore: null, finalLevelId: null, acknowledgedOn: null, acknowledgementComment: "", note: "Self-evaluation window closes 30 September 2026." },
  { id: "PFR-007", cycleId: "PFC-003", employeeId: "EMP-5", reviewerId: "EMP-2", status: "Self evaluation", selfSubmittedOn: "2026-09-17", managerSubmittedOn: null, calibratedBy: null, calibratedOn: null, finalScore: null, finalLevelId: null, acknowledgedOn: null, acknowledgementComment: "", note: "Reviewer is the current reporting manager after the June transfer." },
  { id: "PFR-008", cycleId: "PFC-003", employeeId: "EMP-7", reviewerId: "EMP-3", status: "Not started", selfSubmittedOn: null, managerSubmittedOn: null, calibratedBy: null, calibratedOn: null, finalScore: null, finalLevelId: null, acknowledgedOn: null, acknowledgementComment: "", note: "Goals set on joining; rating eligibility confirmed in the cycle." },
];

export function performanceReview(id: string): PerformanceReview | undefined {
  return performanceReviews.find((row) => row.id === id);
}

export function reviewFor(employeeId: string, cycleId: string): PerformanceReview | undefined {
  return performanceReviews.find((row) => row.employeeId === employeeId && row.cycleId === cycleId);
}

export function reviewsForCycle(cycleId: string): readonly PerformanceReview[] {
  return performanceReviews.filter((row) => row.cycleId === cycleId);
}

export type AssessmentAuthor = "Self" | "Manager";

/**
 * One row per goal per author. The self row and the manager row sit beside
 * each other; neither is an edit of the other, so a disagreement stays visible
 * instead of being resolved by whoever saved last.
 */
export interface GoalAssessment {
  id: string;
  reviewId: string;
  goalId: string;
  author: AssessmentAuthor;
  authorId: string;
  /** 1..scale.scoreMax. */
  score: number;
  comment: string;
  submittedOn: string;
}

export const goalAssessments: readonly GoalAssessment[] = [
  /* PFR-001 — FY2025, EMP-2. */
  { id: "GAS-001", reviewId: "PFR-001", goalId: "GOL-001", author: "Self", authorId: "EMP-2", score: 5, comment: "Close landed at four days from September.", submittedOn: "2026-01-20" },
  { id: "GAS-002", reviewId: "PFR-001", goalId: "GOL-002", author: "Self", authorId: "EMP-2", score: 5, comment: "All findings closed on time.", submittedOn: "2026-01-20" },
  { id: "GAS-003", reviewId: "PFR-001", goalId: "GOL-003", author: "Self", authorId: "EMP-2", score: 4, comment: "Two people trained; a third started late.", submittedOn: "2026-01-20" },
  { id: "GAS-004", reviewId: "PFR-001", goalId: "GOL-001", author: "Manager", authorId: "EMP-1", score: 5, comment: "Best close performance the company has had.", submittedOn: "2026-02-14" },
  { id: "GAS-005", reviewId: "PFR-001", goalId: "GOL-002", author: "Manager", authorId: "EMP-1", score: 5, comment: "Clean audit position.", submittedOn: "2026-02-14" },
  { id: "GAS-006", reviewId: "PFR-001", goalId: "GOL-003", author: "Manager", authorId: "EMP-1", score: 4, comment: "Capability built; depth still thin at one person deep.", submittedOn: "2026-02-14" },

  /* PFR-002 — H1 2026, EMP-2. */
  { id: "GAS-007", reviewId: "PFR-002", goalId: "GOL-004", author: "Self", authorId: "EMP-2", score: 5, comment: "Four days held through the Lahore onboarding.", submittedOn: "2026-07-09" },
  { id: "GAS-008", reviewId: "PFR-002", goalId: "GOL-005", author: "Self", authorId: "EMP-2", score: 4, comment: "Three days rather than two; data quality was the constraint.", submittedOn: "2026-07-09" },
  { id: "GAS-009", reviewId: "PFR-002", goalId: "GOL-006", author: "Self", authorId: "EMP-2", score: 5, comment: "No departures.", submittedOn: "2026-07-09" },
  { id: "GAS-010", reviewId: "PFR-002", goalId: "GOL-004", author: "Manager", authorId: "EMP-1", score: 5, comment: "Sustained under a heavier load.", submittedOn: "2026-07-24" },
  { id: "GAS-011", reviewId: "PFR-002", goalId: "GOL-005", author: "Manager", authorId: "EMP-1", score: 3, comment: "Missed the two-day target; the cause was known in March and not escalated.", submittedOn: "2026-07-24" },
  { id: "GAS-012", reviewId: "PFR-002", goalId: "GOL-006", author: "Manager", authorId: "EMP-1", score: 5, comment: "Team is stable and engaged.", submittedOn: "2026-07-24" },

  /* PFR-003 — H1 2026, EMP-4. */
  { id: "GAS-013", reviewId: "PFR-003", goalId: "GOL-007", author: "Self", authorId: "EMP-4", score: 5, comment: "Median 26 days across four hires.", submittedOn: "2026-07-10" },
  { id: "GAS-014", reviewId: "PFR-003", goalId: "GOL-008", author: "Self", authorId: "EMP-4", score: 3, comment: "88 per cent; the Karachi closure disrupted two cohorts.", submittedOn: "2026-07-10" },
  { id: "GAS-015", reviewId: "PFR-003", goalId: "GOL-009", author: "Self", authorId: "EMP-4", score: 5, comment: "Migration completed and retention-tagged.", submittedOn: "2026-07-10" },
  { id: "GAS-016", reviewId: "PFR-003", goalId: "GOL-007", author: "Manager", authorId: "EMP-1", score: 5, comment: "Strong result against a stretch target.", submittedOn: "2026-07-25" },
  { id: "GAS-017", reviewId: "PFR-003", goalId: "GOL-008", author: "Manager", authorId: "EMP-1", score: 3, comment: "Shortfall accepted, but the plan to recover it arrived late.", submittedOn: "2026-07-25" },
  { id: "GAS-018", reviewId: "PFR-003", goalId: "GOL-009", author: "Manager", authorId: "EMP-1", score: 5, comment: "Delivered ahead of the date.", submittedOn: "2026-07-25" },

  /* PFC-003 — self evaluations only; the manager window has not opened. */
  { id: "GAS-019", reviewId: "PFR-004", goalId: "GOL-010", author: "Self", authorId: "EMP-2", score: 4, comment: "Pack is live; reconciliation automation still manual.", submittedOn: "2026-09-15" },
  { id: "GAS-020", reviewId: "PFR-004", goalId: "GOL-011", author: "Self", authorId: "EMP-2", score: 4, comment: "Eleven of thirteen findings closed.", submittedOn: "2026-09-15" },
  { id: "GAS-021", reviewId: "PFR-004", goalId: "GOL-012", author: "Self", authorId: "EMP-2", score: 5, comment: "No departures to date.", submittedOn: "2026-09-15" },
  { id: "GAS-022", reviewId: "PFR-005", goalId: "GOL-013", author: "Self", authorId: "EMP-3", score: 4, comment: "94 per cent on-time to August.", submittedOn: "2026-09-16" },
  { id: "GAS-023", reviewId: "PFR-005", goalId: "GOL-014", author: "Self", authorId: "EMP-3", score: 4, comment: "One escaped defect in the July release.", submittedOn: "2026-09-16" },
  { id: "GAS-024", reviewId: "PFR-005", goalId: "GOL-015", author: "Self", authorId: "EMP-3", score: 3, comment: "One graduate onboarded; the second joins on 21 September.", submittedOn: "2026-09-16" },
  { id: "GAS-025", reviewId: "PFR-007", goalId: "GOL-019", author: "Self", authorId: "EMP-5", score: 4, comment: "4.4 average across the book.", submittedOn: "2026-09-17" },
  { id: "GAS-026", reviewId: "PFR-007", goalId: "GOL-020", author: "Self", authorId: "EMP-5", score: 4, comment: "96 per cent SLA attainment.", submittedOn: "2026-09-17" },
  { id: "GAS-027", reviewId: "PFR-007", goalId: "GOL-021", author: "Self", authorId: "EMP-5", score: 5, comment: "Handover documented and signed off in August.", submittedOn: "2026-09-17" },
];

export function assessmentsForReview(reviewId: string, author?: AssessmentAuthor): readonly GoalAssessment[] {
  return goalAssessments.filter((row) => row.reviewId === reviewId && (author === undefined || row.author === author));
}

export function assessmentFor(reviewId: string, goalId: string, author: AssessmentAuthor): GoalAssessment | undefined {
  return goalAssessments.find((row) => row.reviewId === reviewId && row.goalId === goalId && row.author === author);
}

/**
 * Weighted score out of 100 from ONE author's rows. The final rating uses the
 * manager's; the self score is computed the same way so the two can be
 * compared, but it never becomes the rating.
 */
export function weightedReviewScore(reviewId: string, author: AssessmentAuthor): number | null {
  const review = performanceReview(reviewId);
  if (!review) return null;
  const scale = ratingScale(performanceCycle(review.cycleId)?.ratingScaleId ?? "");
  if (!scale) return null;
  const rows = assessmentsForReview(reviewId, author);
  if (rows.length === 0) return null;
  const scored = approvedGoalsFor(review.employeeId, review.cycleId);
  const total = scored.reduce((sum, entry) => {
    const row = rows.find((candidate) => candidate.goalId === entry.id);
    if (!row) return sum;
    return sum + (row.score / scale.scoreMax) * entry.weight;
  }, 0);
  return Math.round(total * 10) / 10;
}

/** The rating a completed review's manager rows produce. */
export function computedFinalScore(reviewId: string): number | null {
  return weightedReviewScore(reviewId, "Manager");
}

export function computedFinalLevel(reviewId: string): RatingLevel | undefined {
  const review = performanceReview(reviewId);
  const score = computedFinalScore(reviewId);
  const scaleId = review ? performanceCycle(review.cycleId)?.ratingScaleId : undefined;
  if (score === null || !scaleId) return undefined;
  return ratingLevelFor(scaleId, score);
}

/** The stored rating must be the one the manager's rows produce. */
export function storedRatingAgreesWithAssessments(review: PerformanceReview): boolean {
  if (review.status !== "Completed") return review.finalScore === null && review.finalLevelId === null;
  const computed = computedFinalScore(review.id);
  const level = computedFinalLevel(review.id);
  if (computed === null || !level) return false;
  return review.finalScore === computed && review.finalLevelId === level.id;
}

/** Whoever rated cannot also calibrate. */
export function calibrationIsIndependent(review: PerformanceReview): boolean {
  if (!performancePolicy.calibrationRequired) return true;
  if (review.status !== "Completed") return true;
  if (review.calibratedBy === null) return false;
  const reviewer = employee(review.reviewerId);
  const reviewerName = reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : "";
  return review.calibratedBy !== reviewerName;
}

export function reviewBlockers(review: PerformanceReview): readonly string[] {
  const blockers: string[] = [];
  if (!goalWeightsAreValid(review.employeeId, review.cycleId)) {
    blockers.push(`Approved goal weights total ${goalWeightTotal(review.employeeId, review.cycleId)}, not ${performancePolicy.requiredWeightTotal}.`);
  }
  const eligibility = ratingEligibilityNote(review.employeeId, review.cycleId);
  if (eligibility) blockers.push(eligibility);
  if (performancePolicy.selfEvaluationRequired && review.selfSubmittedOn === null) {
    blockers.push("Self-evaluation has not been submitted.");
  }
  const approved = approvedGoalsFor(review.employeeId, review.cycleId);
  const managerRows = assessmentsForReview(review.id, "Manager");
  if (managerRows.length < approved.length) {
    blockers.push(`${managerRows.length} of ${approved.length} goals rated by the manager.`);
  }
  if (performancePolicy.calibrationRequired && review.calibratedBy === null) {
    blockers.push("Calibration has not been recorded.");
  }
  return blockers;
}

/* ------------------------------------------------------------------ */
/* Outcomes — the boundary with payroll                               */
/* ------------------------------------------------------------------ */

export type OutcomeKind = "Bonus" | "Salary revision" | "Promotion recommendation" | "Development plan";

export type OutcomeStatus = "Proposed" | "Approved" | "Rejected" | "Applied";

/**
 * A performance result may PROPOSE money. It never moves money.
 *
 * `linkedAdjustmentId` and `linkedRevisionId` point at Phase 3 transactions
 * that carry their own approval. Until one of those exists and is approved,
 * nothing has been paid — which is why an outcome can sit at Approved with no
 * link, and why only an Applied outcome has one.
 */
export interface PerformanceOutcome {
  id: string;
  reviewId: string;
  employeeId: string;
  kind: OutcomeKind;
  status: OutcomeStatus;
  /** For a bonus, in minor units. Null for a non-monetary outcome. */
  proposedAmount: number | null;
  /** For a revision or promotion, as a percentage of current gross. */
  proposedPercent: number | null;
  proposedBy: string;
  proposedOn: string;
  approvedBy: string | null;
  approvedOn: string | null;
  /** Phase 3 payroll adjustment that actually paid a bonus. */
  linkedAdjustmentId: string | null;
  /** Phase 3 salary revision that actually changed the salary. */
  linkedRevisionId: string | null;
  note: string;
}

export const performanceOutcomes: readonly PerformanceOutcome[] = [
  {
    id: "PFO-001", reviewId: "PFR-001", employeeId: "EMP-2", kind: "Promotion recommendation", status: "Applied",
    proposedAmount: null, proposedPercent: 12, proposedBy: "Omar Siddiqui", proposedOn: "2026-06-01",
    approvedBy: "Omar Siddiqui", approvedOn: "2026-06-10", linkedAdjustmentId: null, linkedRevisionId: "REV-001",
    note: "Outstanding rating in FY2025. Applied through salary revision REV-001, which carries its own approval and effective date.",
  },
  {
    id: "PFO-002", reviewId: "PFR-003", employeeId: "EMP-4", kind: "Bonus", status: "Applied",
    proposedAmount: money(75000), proposedPercent: null, proposedBy: "Omar Siddiqui", proposedOn: "2026-08-14",
    approvedBy: "Omar Siddiqui", approvedOn: "2026-08-20", linkedAdjustmentId: "ADJ-001", linkedRevisionId: null,
    note: "Exceeds rating in H1 2026. Paid through payroll adjustment ADJ-001 in the September period.",
  },
  {
    id: "PFO-003", reviewId: "PFR-002", employeeId: "EMP-2", kind: "Bonus", status: "Approved",
    proposedAmount: money(60000), proposedPercent: null, proposedBy: "Omar Siddiqui", proposedOn: "2026-08-14",
    approvedBy: "Omar Siddiqui", approvedOn: "2026-08-21", linkedAdjustmentId: null, linkedRevisionId: null,
    note: "Approved but not yet raised as a payroll adjustment. Nothing has been paid: there is no Phase 3 transaction behind it.",
  },
  {
    id: "PFO-004", reviewId: "PFR-003", employeeId: "EMP-4", kind: "Development plan", status: "Approved",
    proposedAmount: null, proposedPercent: null, proposedBy: "Omar Siddiqui", proposedOn: "2026-08-14",
    approvedBy: "Sana Iqbal", approvedOn: "2026-08-18", linkedAdjustmentId: null, linkedRevisionId: null,
    note: "Compliance training shortfall: recovery plan agreed, with the training programme booked for October.",
  },
  {
    id: "PFO-005", reviewId: "PFR-002", employeeId: "EMP-2", kind: "Salary revision", status: "Proposed",
    proposedAmount: null, proposedPercent: 6, proposedBy: "Sana Iqbal", proposedOn: "2026-09-15",
    approvedBy: null, approvedOn: null, linkedAdjustmentId: null, linkedRevisionId: null,
    note: "Mid-year increase proposal. Not approved, so no salary revision exists and no pay has changed.",
  },
];

export function outcomesForReview(reviewId: string): readonly PerformanceOutcome[] {
  return performanceOutcomes.filter((row) => row.reviewId === reviewId);
}

export function outcomesForEmployee(employeeId: string): readonly PerformanceOutcome[] {
  return performanceOutcomes.filter((row) => row.employeeId === employeeId);
}

/**
 * An outcome is only Applied when the Phase 3 transaction behind it exists.
 * An outcome that says "Applied" with nothing to point at is a claim that
 * someone was paid when the ledger has no record of it.
 */
export function outcomeIsBackedByTransaction(row: PerformanceOutcome): boolean {
  if (row.status !== "Applied") return row.linkedAdjustmentId === null && row.linkedRevisionId === null;
  if (row.linkedAdjustmentId !== null) {
    return payrollAdjustments.some((entry) => entry.id === row.linkedAdjustmentId && entry.status === "Approved");
  }
  if (row.linkedRevisionId !== null) {
    return salaryRevisions.some((entry) => entry.id === row.linkedRevisionId && entry.status === "Approved");
  }
  return false;
}

/** A monetary outcome needs a rating level that permits it. */
export function outcomeIsPermittedByRating(row: PerformanceOutcome): boolean {
  const review = performanceReview(row.reviewId);
  if (!review || review.status !== "Completed" || review.finalLevelId === null) return false;
  const scaleId = performanceCycle(review.cycleId)?.ratingScaleId;
  const level = scaleId ? ratingLevel(scaleId, review.finalLevelId) : undefined;
  if (!level) return false;
  if (row.kind === "Bonus") return level.bonusEligible;
  if (row.kind === "Salary revision") return level.bonusEligible;
  if (row.kind === "Promotion recommendation") return level.promotionEligible;
  return true;
}

export function outcomeBlockers(row: PerformanceOutcome): readonly string[] {
  const blockers: string[] = [];
  const review = performanceReview(row.reviewId);
  if (!review) blockers.push("Outcome is not linked to a review.");
  else if (review.status !== "Completed") blockers.push(`Review is at ${review.status}; an outcome requires a completed review.`);
  if (!outcomeIsPermittedByRating(row)) blockers.push("The final rating level does not permit this outcome.");
  if (row.status === "Applied" && !outcomeIsBackedByTransaction(row)) {
    blockers.push("Marked Applied with no approved payroll transaction behind it.");
  }
  if (row.status === "Approved" && row.linkedAdjustmentId === null && row.linkedRevisionId === null) {
    blockers.push("Approved but not yet raised in payroll — no money has moved.");
  }
  return blockers;
}

/* ------------------------------------------------------------------ */
/* Training                                                           */
/* ------------------------------------------------------------------ */

export type TrainingCategory = "Technical" | "Compliance" | "Leadership" | "Safety" | "Onboarding";

export type TrainingMode = "Classroom" | "Online" | "On the job" | "External";

export interface TrainingProgram {
  id: string;
  code: string;
  name: string;
  description: string;
  category: TrainingCategory;
  mode: TrainingMode;
  provider: string;
  durationHours: number;
  costPerParticipant: number;
  /** Attendance required before a completion may be recorded. */
  minimumAttendancePercent: number;
  assessmentRequired: boolean;
  passMark: number;
  /** Compliance training expires; a technical course does not. */
  validityMonths: number | null;
  mandatory: boolean;
  status: "Active" | "Inactive";
}

export const trainingPrograms: readonly TrainingProgram[] = [
  { id: "TRP-001", code: "SEC-AWR", name: "Information Security Awareness", description: "Annual security and data-protection awareness training for every employee.", category: "Compliance", mode: "Online", provider: "Internal — Technology", durationHours: 3, costPerParticipant: money(0), minimumAttendancePercent: 100, assessmentRequired: true, passMark: 80, validityMonths: 12, mandatory: true, status: "Active" },
  { id: "TRP-002", code: "TS-ADV", name: "Advanced TypeScript for Delivery", description: "Type-level design, testing strategy and performance for the delivery platform.", category: "Technical", mode: "Classroom", provider: "Meridian Training", durationHours: 24, costPerParticipant: money(85000), minimumAttendancePercent: 80, assessmentRequired: true, passMark: 70, validityMonths: null, mandatory: false, status: "Active" },
  { id: "TRP-003", code: "LEAD-1", name: "First-line Management", description: "Delegation, feedback, performance conversations and team basics.", category: "Leadership", mode: "Classroom", provider: "Crestline Learning", durationHours: 16, costPerParticipant: money(120000), minimumAttendancePercent: 90, assessmentRequired: false, passMark: 0, validityMonths: null, mandatory: false, status: "Active" },
  { id: "TRP-004", code: "POL-HAR", name: "Workplace Conduct and Anti-harassment", description: "Statutory conduct, reporting channels and manager obligations.", category: "Compliance", mode: "Classroom", provider: "Internal — People & Culture", durationHours: 4, costPerParticipant: money(0), minimumAttendancePercent: 100, assessmentRequired: true, passMark: 75, validityMonths: 24, mandatory: true, status: "Active" },
  { id: "TRP-005", code: "IND-NEX", name: "Nexora Induction", description: "Company, policy, systems and security induction for new joiners. Required of every new joiner, but tracked on the onboarding checklist rather than as a recurring compliance gap.", category: "Onboarding", mode: "Classroom", provider: "Internal — People & Culture", durationHours: 8, costPerParticipant: money(0), minimumAttendancePercent: 100, assessmentRequired: false, passMark: 0, validityMonths: null, mandatory: false, status: "Active" },
  { id: "TRP-006", code: "IFRS-26", name: "IFRS Update for Practitioners", description: "External update on standards effective in the current reporting year.", category: "Technical", mode: "External", provider: "Institute of Chartered Accountants", durationHours: 12, costPerParticipant: money(95000), minimumAttendancePercent: 75, assessmentRequired: false, passMark: 0, validityMonths: null, mandatory: false, status: "Active" },
  { id: "TRP-007", code: "SAFE-FA", name: "Workplace First Aid", description: "Certified first-aid training for nominated office marshals.", category: "Safety", mode: "External", provider: "Red Crescent Training", durationHours: 8, costPerParticipant: money(45000), minimumAttendancePercent: 100, assessmentRequired: true, passMark: 80, validityMonths: 36, mandatory: false, status: "Inactive" },
];

export function trainingProgram(id: string): TrainingProgram | undefined {
  return trainingPrograms.find((row) => row.id === id);
}

export type TrainingRequestStatus = "Draft" | "Pending manager" | "Pending HR" | "Approved" | "Rejected" | "Cancelled";

export const trainingRequestTransitions: Readonly<Record<TrainingRequestStatus, readonly TrainingRequestStatus[]>> = {
  "Draft": ["Pending manager", "Cancelled"],
  "Pending manager": ["Pending HR", "Rejected", "Cancelled"],
  "Pending HR": ["Approved", "Rejected", "Cancelled"],
  "Approved": ["Cancelled"],
  "Rejected": [],
  "Cancelled": [],
};

export interface TrainingRequest {
  id: string;
  reference: string;
  employeeId: string;
  programId: string;
  requestedBy: string;
  requestedOn: string;
  justification: string;
  /** Set when the training answers a development goal or outcome. */
  linkedGoalId: string | null;
  linkedOutcomeId: string | null;
  status: TrainingRequestStatus;
  managerDecisionBy: string | null;
  managerDecisionOn: string | null;
  hrDecisionBy: string | null;
  hrDecisionOn: string | null;
  decisionComment: string;
}

export const trainingRequests: readonly TrainingRequest[] = [
  { id: "TRQ-001", reference: "TRQ-2026-0018", employeeId: "EMP-3", programId: "TRP-002", requestedBy: "Bilal Khan", requestedOn: "2026-06-04", justification: "Platform workstream needs type-level design depth.", linkedGoalId: "GOL-014", linkedOutcomeId: null, status: "Approved", managerDecisionBy: "Omar Siddiqui", managerDecisionOn: "2026-06-08", hrDecisionBy: "Sana Iqbal", hrDecisionOn: "2026-06-11", decisionComment: "Approved against the 2026 learning budget." },
  { id: "TRQ-002", reference: "TRQ-2026-0019", employeeId: "EMP-7", programId: "TRP-002", requestedBy: "Bilal Khan", requestedOn: "2026-07-10", justification: "New joiner; align to the platform's engineering practice.", linkedGoalId: "GOL-022", linkedOutcomeId: null, status: "Approved", managerDecisionBy: "Omar Siddiqui", managerDecisionOn: "2026-07-14", hrDecisionBy: "Sana Iqbal", hrDecisionOn: "2026-07-16", decisionComment: "Approved." },
  { id: "TRQ-003", reference: "TRQ-2026-0021", employeeId: "EMP-5", programId: "TRP-003", requestedBy: "Mariam Ali", requestedOn: "2026-08-03", justification: "Taking on the Service Operations team after the June transfer.", linkedGoalId: "GOL-020", linkedOutcomeId: null, status: "Approved", managerDecisionBy: "Omar Siddiqui", managerDecisionOn: "2026-08-06", hrDecisionBy: "Sana Iqbal", hrDecisionOn: "2026-08-10", decisionComment: "Approved; cohort in October." },
  { id: "TRQ-004", reference: "TRQ-2026-0024", employeeId: "EMP-4", programId: "TRP-003", requestedBy: "Sana Iqbal", requestedOn: "2026-08-22", justification: "Development plan from the H1 review.", linkedGoalId: null, linkedOutcomeId: "PFO-004", status: "Pending HR", managerDecisionBy: "Omar Siddiqui", managerDecisionOn: "2026-08-26", hrDecisionBy: null, hrDecisionOn: null, decisionComment: "Manager supports; HR to confirm the cohort." },
  { id: "TRQ-005", reference: "TRQ-2026-0026", employeeId: "EMP-2", programId: "TRP-006", requestedBy: "Mariam Ali", requestedOn: "2026-09-02", justification: "Standards effective in the current reporting year.", linkedGoalId: "GOL-011", linkedOutcomeId: null, status: "Pending manager", managerDecisionBy: null, managerDecisionOn: null, hrDecisionBy: null, hrDecisionOn: null, decisionComment: "" },
  { id: "TRQ-006", reference: "TRQ-2026-0027", employeeId: "EMP-3", programId: "TRP-006", requestedBy: "Bilal Khan", requestedOn: "2026-09-03", justification: "General interest in reporting standards.", linkedGoalId: null, linkedOutcomeId: null, status: "Rejected", managerDecisionBy: "Omar Siddiqui", managerDecisionOn: "2026-09-08", hrDecisionBy: null, hrDecisionOn: null, decisionComment: "Not relevant to the engineering role; the finance team is attending." },
  { id: "TRQ-007", reference: "TRQ-2026-0029", employeeId: "EMP-8", programId: "TRP-005", requestedBy: "Sana Iqbal", requestedOn: "2026-09-16", justification: "Mandatory induction for the September joiner.", linkedGoalId: null, linkedOutcomeId: null, status: "Draft", managerDecisionBy: null, managerDecisionOn: null, hrDecisionBy: null, hrDecisionOn: null, decisionComment: "Raised with the onboarding checklist; submitted once the employee record is approved." },
];

export function trainingRequest(id: string): TrainingRequest | undefined {
  return trainingRequests.find((row) => row.id === id);
}

/** Only an active programme can be requested. */
export function trainingRequestIsSelectable(row: TrainingRequest): boolean {
  return trainingProgram(row.programId)?.status === "Active";
}

export type SessionStatus = "Planned" | "Confirmed" | "In progress" | "Completed" | "Cancelled";

export interface TrainingSession {
  id: string;
  reference: string;
  programId: string;
  title: string;
  /** One row per day the session runs, so attendance is per day. */
  sessionDays: readonly string[];
  hoursPerDay: number;
  trainerName: string;
  location: string;
  capacity: number;
  status: SessionStatus;
  statusNote: string;
}

export const trainingSessions: readonly TrainingSession[] = [
  { id: "TRS-001", reference: "TRS-2026-0009", programId: "TRP-001", title: "Security Awareness — 2026 round", sessionDays: ["2026-03-10"], hoursPerDay: 3, trainerName: "Bilal Khan", location: "Online", capacity: 40, status: "Completed", statusNote: "Annual round; 2026 validity." },
  { id: "TRS-002", reference: "TRS-2026-0014", programId: "TRP-002", title: "Advanced TypeScript — July cohort", sessionDays: ["2026-07-20", "2026-07-21", "2026-07-22"], hoursPerDay: 8, trainerName: "Meridian Training — R. Ahmed", location: "Lahore Delivery Centre", capacity: 12, status: "Completed", statusNote: "" },
  { id: "TRS-003", reference: "TRS-2026-0017", programId: "TRP-004", title: "Workplace Conduct — August round", sessionDays: ["2026-08-18"], hoursPerDay: 4, trainerName: "Sana Iqbal", location: "Islamabad Head Office", capacity: 30, status: "Completed", statusNote: "" },
  { id: "TRS-004", reference: "TRS-2026-0022", programId: "TRP-003", title: "First-line Management — October cohort", sessionDays: ["2026-10-13", "2026-10-14"], hoursPerDay: 8, trainerName: "Crestline Learning — F. Mahmood", location: "Islamabad Head Office", capacity: 10, status: "Confirmed", statusNote: "Six seats taken." },
  { id: "TRS-005", reference: "TRS-2026-0023", programId: "TRP-005", title: "Nexora Induction — September joiners", sessionDays: ["2026-09-24"], hoursPerDay: 8, trainerName: "Sana Iqbal", location: "Lahore Delivery Centre", capacity: 8, status: "Planned", statusNote: "Scheduled for the September intake." },
  { id: "TRS-006", reference: "TRS-2026-0020", programId: "TRP-006", title: "IFRS Update — September", sessionDays: ["2026-09-15", "2026-09-16"], hoursPerDay: 6, trainerName: "ICAP faculty", location: "External — ICAP Islamabad", capacity: 4, status: "Cancelled", statusNote: "Provider postponed to November; retained with its enrolments." },
];

export function trainingSession(id: string): TrainingSession | undefined {
  return trainingSessions.find((row) => row.id === id);
}

export function sessionsForProgram(programId: string): readonly TrainingSession[] {
  return trainingSessions.filter((row) => row.programId === programId);
}

export function sessionScheduledHours(row: TrainingSession): number {
  return row.sessionDays.length * row.hoursPerDay;
}

export type ParticipantStatus = "Enrolled" | "Attending" | "Completed" | "Failed" | "Withdrawn" | "No show";

export interface TrainingParticipant {
  id: string;
  sessionId: string;
  employeeId: string;
  /** Null for a mandatory programme, which needs no request. */
  requestId: string | null;
  enrolledOn: string;
  status: ParticipantStatus;
  note: string;
}

export const trainingParticipants: readonly TrainingParticipant[] = [
  { id: "TPT-001", sessionId: "TRS-001", employeeId: "EMP-1", requestId: null, enrolledOn: "2026-03-02", status: "Completed", note: "" },
  { id: "TPT-002", sessionId: "TRS-001", employeeId: "EMP-2", requestId: null, enrolledOn: "2026-03-02", status: "Completed", note: "" },
  { id: "TPT-003", sessionId: "TRS-001", employeeId: "EMP-3", requestId: null, enrolledOn: "2026-03-02", status: "Completed", note: "" },
  { id: "TPT-004", sessionId: "TRS-001", employeeId: "EMP-4", requestId: null, enrolledOn: "2026-03-02", status: "Completed", note: "" },
  { id: "TPT-005", sessionId: "TRS-001", employeeId: "EMP-5", requestId: null, enrolledOn: "2026-03-02", status: "No show", note: "Client escalation on the day; rebooked to the 2027 round." },
  { id: "TPT-006", sessionId: "TRS-002", employeeId: "EMP-3", requestId: "TRQ-001", enrolledOn: "2026-06-12", status: "Completed", note: "" },
  { id: "TPT-007", sessionId: "TRS-002", employeeId: "EMP-7", requestId: "TRQ-002", enrolledOn: "2026-07-17", status: "Failed", note: "Attended one of three days; below the 80 per cent attendance the programme requires." },
  { id: "TPT-008", sessionId: "TRS-003", employeeId: "EMP-2", requestId: null, enrolledOn: "2026-08-04", status: "Completed", note: "" },
  { id: "TPT-009", sessionId: "TRS-003", employeeId: "EMP-4", requestId: null, enrolledOn: "2026-08-04", status: "Completed", note: "" },
  { id: "TPT-010", sessionId: "TRS-003", employeeId: "EMP-7", requestId: null, enrolledOn: "2026-08-04", status: "Completed", note: "" },
  { id: "TPT-011", sessionId: "TRS-004", employeeId: "EMP-5", requestId: "TRQ-003", enrolledOn: "2026-08-11", status: "Enrolled", note: "" },
  { id: "TPT-012", sessionId: "TRS-005", employeeId: "EMP-8", requestId: "TRQ-007", enrolledOn: "2026-09-17", status: "Enrolled", note: "Provisional: confirmed once the employee record is approved." },
  { id: "TPT-013", sessionId: "TRS-006", employeeId: "EMP-2", requestId: "TRQ-005", enrolledOn: "2026-09-04", status: "Withdrawn", note: "Session cancelled by the provider; enrolment retained." },
];

export function trainingParticipant(id: string): TrainingParticipant | undefined {
  return trainingParticipants.find((row) => row.id === id);
}

export function participantsFor(sessionId: string): readonly TrainingParticipant[] {
  return trainingParticipants.filter((row) => row.sessionId === sessionId);
}

export function participationOf(employeeId: string): readonly TrainingParticipant[] {
  return trainingParticipants.filter((row) => row.employeeId === employeeId);
}

/** Enrolment cannot exceed the session's capacity. */
export function sessionWithinCapacity(sessionId: string): boolean {
  const row = trainingSession(sessionId);
  if (!row) return false;
  const active = participantsFor(sessionId).filter((entry) => entry.status !== "Withdrawn");
  return active.length <= row.capacity;
}

export interface TrainingAttendance {
  id: string;
  participantId: string;
  onDate: string;
  present: boolean;
  hoursAttended: number;
  recordedBy: string;
}

export const trainingAttendance: readonly TrainingAttendance[] = [
  { id: "TAT-001", participantId: "TPT-001", onDate: "2026-03-10", present: true, hoursAttended: 3, recordedBy: "Bilal Khan" },
  { id: "TAT-002", participantId: "TPT-002", onDate: "2026-03-10", present: true, hoursAttended: 3, recordedBy: "Bilal Khan" },
  { id: "TAT-003", participantId: "TPT-003", onDate: "2026-03-10", present: true, hoursAttended: 3, recordedBy: "Bilal Khan" },
  { id: "TAT-004", participantId: "TPT-004", onDate: "2026-03-10", present: true, hoursAttended: 3, recordedBy: "Bilal Khan" },
  { id: "TAT-005", participantId: "TPT-005", onDate: "2026-03-10", present: false, hoursAttended: 0, recordedBy: "Bilal Khan" },

  { id: "TAT-006", participantId: "TPT-006", onDate: "2026-07-20", present: true, hoursAttended: 8, recordedBy: "Sana Iqbal" },
  { id: "TAT-007", participantId: "TPT-006", onDate: "2026-07-21", present: true, hoursAttended: 8, recordedBy: "Sana Iqbal" },
  { id: "TAT-008", participantId: "TPT-006", onDate: "2026-07-22", present: true, hoursAttended: 8, recordedBy: "Sana Iqbal" },
  { id: "TAT-009", participantId: "TPT-007", onDate: "2026-07-20", present: true, hoursAttended: 8, recordedBy: "Sana Iqbal" },
  { id: "TAT-010", participantId: "TPT-007", onDate: "2026-07-21", present: false, hoursAttended: 0, recordedBy: "Sana Iqbal" },
  { id: "TAT-011", participantId: "TPT-007", onDate: "2026-07-22", present: false, hoursAttended: 0, recordedBy: "Sana Iqbal" },

  { id: "TAT-012", participantId: "TPT-008", onDate: "2026-08-18", present: true, hoursAttended: 4, recordedBy: "Sana Iqbal" },
  { id: "TAT-013", participantId: "TPT-009", onDate: "2026-08-18", present: true, hoursAttended: 4, recordedBy: "Sana Iqbal" },
  { id: "TAT-014", participantId: "TPT-010", onDate: "2026-08-18", present: true, hoursAttended: 4, recordedBy: "Sana Iqbal" },
];

export function attendanceFor(participantId: string): readonly TrainingAttendance[] {
  return trainingAttendance
    .filter((row) => row.participantId === participantId)
    .sort((a, b) => a.onDate.localeCompare(b.onDate));
}

/**
 * Attendance as a percentage of the session's scheduled hours. Hours, not
 * days: a participant who leaves after an hour of an eight-hour day has not
 * attended that day.
 */
export function attendancePercent(participantId: string): number {
  const participant = trainingParticipant(participantId);
  const session = participant ? trainingSession(participant.sessionId) : undefined;
  if (!participant || !session) return 0;
  const scheduled = sessionScheduledHours(session);
  if (scheduled === 0) return 0;
  const attended = attendanceFor(participantId).reduce((total, row) => total + row.hoursAttended, 0);
  return Math.round((attended / scheduled) * 1000) / 10;
}

export type CompletionResult = "Passed" | "Failed" | "Not assessed";

export interface TrainingCompletion {
  id: string;
  participantId: string;
  completedOn: string;
  attendancePercentRecorded: number;
  assessmentScore: number | null;
  result: CompletionResult;
  certificateReference: string;
  validUntil: string | null;
  recordedBy: string;
}

export const trainingCompletions: readonly TrainingCompletion[] = [
  { id: "TCM-001", participantId: "TPT-001", completedOn: "2026-03-10", attendancePercentRecorded: 100, assessmentScore: 95, result: "Passed", certificateReference: "CERT-SEC-2026-001", validUntil: "2027-03-10", recordedBy: "Bilal Khan" },
  { id: "TCM-002", participantId: "TPT-002", completedOn: "2026-03-10", attendancePercentRecorded: 100, assessmentScore: 90, result: "Passed", certificateReference: "CERT-SEC-2026-002", validUntil: "2027-03-10", recordedBy: "Bilal Khan" },
  { id: "TCM-003", participantId: "TPT-003", completedOn: "2026-03-10", attendancePercentRecorded: 100, assessmentScore: 88, result: "Passed", certificateReference: "CERT-SEC-2026-003", validUntil: "2027-03-10", recordedBy: "Bilal Khan" },
  { id: "TCM-004", participantId: "TPT-004", completedOn: "2026-03-10", attendancePercentRecorded: 100, assessmentScore: 92, result: "Passed", certificateReference: "CERT-SEC-2026-004", validUntil: "2027-03-10", recordedBy: "Bilal Khan" },
  { id: "TCM-005", participantId: "TPT-006", completedOn: "2026-07-22", attendancePercentRecorded: 100, assessmentScore: 84, result: "Passed", certificateReference: "CERT-TS-2026-006", validUntil: null, recordedBy: "Sana Iqbal" },
  { id: "TCM-006", participantId: "TPT-007", completedOn: "2026-07-22", attendancePercentRecorded: 33.3, assessmentScore: null, result: "Failed", certificateReference: "—", validUntil: null, recordedBy: "Sana Iqbal" },
  { id: "TCM-007", participantId: "TPT-008", completedOn: "2026-08-18", attendancePercentRecorded: 100, assessmentScore: 88, result: "Passed", certificateReference: "CERT-POL-2026-008", validUntil: "2028-08-18", recordedBy: "Sana Iqbal" },
  { id: "TCM-008", participantId: "TPT-009", completedOn: "2026-08-18", attendancePercentRecorded: 100, assessmentScore: 82, result: "Passed", certificateReference: "CERT-POL-2026-009", validUntil: "2028-08-18", recordedBy: "Sana Iqbal" },
  { id: "TCM-009", participantId: "TPT-010", completedOn: "2026-08-18", attendancePercentRecorded: 100, assessmentScore: 79, result: "Passed", certificateReference: "CERT-POL-2026-010", validUntil: "2028-08-18", recordedBy: "Sana Iqbal" },
];

export function completionFor(participantId: string): TrainingCompletion | undefined {
  return trainingCompletions.find((row) => row.participantId === participantId);
}

/**
 * A pass has to be earned: the programme's attendance minimum, and its pass
 * mark where it assesses. This is the rule that stops a mandatory compliance
 * certificate being issued to someone who did not attend.
 */
export function completionIsEarned(row: TrainingCompletion): boolean {
  const participant = trainingParticipant(row.participantId);
  const program = participant ? trainingProgram(trainingSession(participant.sessionId)?.programId ?? "") : undefined;
  if (!program) return false;
  if (row.result !== "Passed") return false;
  if (row.attendancePercentRecorded < program.minimumAttendancePercent) return false;
  if (program.assessmentRequired) {
    return row.assessmentScore !== null && row.assessmentScore >= program.passMark;
  }
  return true;
}

/** The recorded attendance must match the attendance rows behind it. */
export function completionAttendanceIsConsistent(row: TrainingCompletion): boolean {
  return Math.abs(attendancePercent(row.participantId) - row.attendancePercentRecorded) < 0.2;
}

export function completionBlockers(row: TrainingCompletion): readonly string[] {
  const participant = trainingParticipant(row.participantId);
  const program = participant ? trainingProgram(trainingSession(participant.sessionId)?.programId ?? "") : undefined;
  const blockers: string[] = [];
  if (!program) return ["Completion is not linked to a programme."];
  if (row.attendancePercentRecorded < program.minimumAttendancePercent) {
    blockers.push(`Attendance ${row.attendancePercentRecorded}% is below the ${program.minimumAttendancePercent}% the programme requires.`);
  }
  if (program.assessmentRequired && (row.assessmentScore === null || row.assessmentScore < program.passMark)) {
    blockers.push(`Assessment ${row.assessmentScore ?? "not taken"} against a pass mark of ${program.passMark}.`);
  }
  if (!completionAttendanceIsConsistent(row)) {
    blockers.push(`Recorded attendance does not match the attendance register (${attendancePercent(row.participantId)}%).`);
  }
  return blockers;
}

/** Whether a compliance certificate is still valid on a date. */
export function certificateIsCurrent(row: TrainingCompletion, onDate: string = HR_TODAY): boolean {
  if (row.result !== "Passed") return false;
  if (row.validUntil === null) return true;
  return row.validUntil >= onDate;
}

/** Employees without a current pass on a mandatory programme. */
export function mandatoryTrainingGaps(onDate: string = HR_TODAY): readonly { employeeId: string; programId: string }[] {
  const gaps: { employeeId: string; programId: string }[] = [];
  const mandatory = trainingPrograms.filter((row) => row.mandatory && row.status === "Active");
  for (const person of employees) {
    if (!employedStatuses.includes(person.status)) continue;
    for (const program of mandatory) {
      const current = participationOf(person.id).some((participant) => {
        if (trainingSession(participant.sessionId)?.programId !== program.id) return false;
        const completion = completionFor(participant.id);
        return completion !== undefined && certificateIsCurrent(completion, onDate);
      });
      if (!current) gaps.push({ employeeId: person.id, programId: program.id });
    }
  }
  return gaps;
}

/**
 * Course feedback, kept separate from the completion record. A participant's
 * opinion of the trainer is not evidence that they attended.
 */
export interface TrainingEvaluation {
  id: string;
  participantId: string;
  contentScore: number;
  trainerScore: number;
  relevanceScore: number;
  wouldRecommend: boolean;
  comment: string;
  submittedOn: string;
  /** Manager's view, some weeks later, on whether it changed anything. */
  managerFollowUpScore: number | null;
  managerFollowUpOn: string | null;
  managerFollowUpNote: string;
}

export const trainingEvaluations: readonly TrainingEvaluation[] = [
  { id: "TEV-001", participantId: "TPT-002", contentScore: 4, trainerScore: 4, relevanceScore: 5, wouldRecommend: true, comment: "Short and relevant; the phishing section was the useful part.", submittedOn: "2026-03-10", managerFollowUpScore: 4, managerFollowUpOn: "2026-04-14", managerFollowUpNote: "Reported two suspicious emails since." },
  { id: "TEV-002", participantId: "TPT-003", contentScore: 3, trainerScore: 4, relevanceScore: 4, wouldRecommend: true, comment: "Content is a little basic for engineers.", submittedOn: "2026-03-11", managerFollowUpScore: 3, managerFollowUpOn: "2026-04-14", managerFollowUpNote: "Consider a technical variant for the engineering team." },
  { id: "TEV-003", participantId: "TPT-006", contentScore: 5, trainerScore: 5, relevanceScore: 5, wouldRecommend: true, comment: "Directly applicable; the type-level session changed how we model contracts.", submittedOn: "2026-07-23", managerFollowUpScore: 5, managerFollowUpOn: "2026-09-01", managerFollowUpNote: "Applied on the platform workstream; escaped defects down since July." },
  { id: "TEV-004", participantId: "TPT-007", contentScore: 3, trainerScore: 4, relevanceScore: 5, wouldRecommend: true, comment: "Could only attend the first day because of a delivery clash.", submittedOn: "2026-07-24", managerFollowUpScore: null, managerFollowUpOn: null, managerFollowUpNote: "" },
  { id: "TEV-005", participantId: "TPT-009", contentScore: 4, trainerScore: 5, relevanceScore: 5, wouldRecommend: true, comment: "The manager-obligations section was the most useful part.", submittedOn: "2026-08-19", managerFollowUpScore: 4, managerFollowUpOn: "2026-09-15", managerFollowUpNote: "Reporting channel communicated to the whole team." },
  { id: "TEV-006", participantId: "TPT-010", contentScore: 4, trainerScore: 4, relevanceScore: 4, wouldRecommend: true, comment: "Clear and well run.", submittedOn: "2026-08-19", managerFollowUpScore: null, managerFollowUpOn: null, managerFollowUpNote: "" },
];

export function evaluationForParticipant(participantId: string): TrainingEvaluation | undefined {
  return trainingEvaluations.find((row) => row.participantId === participantId);
}

export interface ProgramEffectiveness {
  programId: string;
  sessionsHeld: number;
  participants: number;
  completionRate: number;
  passed: number;
  failed: number;
  averageAttendance: number;
  averageFeedback: number | null;
  averageManagerFollowUp: number | null;
  totalCost: number;
}

export function programEffectiveness(programId: string): ProgramEffectiveness {
  const program = trainingProgram(programId);
  const sessions = sessionsForProgram(programId);
  const held = sessions.filter((row) => row.status === "Completed" || row.status === "In progress");
  const participants = sessions.flatMap((row) => participantsFor(row.id));
  const billable = participants.filter((row) => row.status !== "Withdrawn");
  const completions = participants.map((row) => completionFor(row.id)).filter((row): row is TrainingCompletion => row !== undefined);
  const attendances = participants.map((row) => attendancePercent(row.id));
  const feedback = participants
    .map((row) => evaluationForParticipant(row.id))
    .filter((row): row is TrainingEvaluation => row !== undefined);
  const followUps = feedback.map((row) => row.managerFollowUpScore).filter((value): value is number => value !== null);
  const mean = (values: readonly number[]) =>
    values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;

  return {
    programId,
    sessionsHeld: held.length,
    participants: participants.length,
    completionRate: billable.length === 0 ? 0 : Math.round((completions.length / billable.length) * 100),
    passed: completions.filter((row) => row.result === "Passed").length,
    failed: completions.filter((row) => row.result === "Failed").length,
    averageAttendance: mean(attendances) ?? 0,
    averageFeedback: mean(feedback.map((row) => (row.contentScore + row.trainerScore + row.relevanceScore) / 3)),
    averageManagerFollowUp: mean(followUps),
    totalCost: billable.length * (program?.costPerParticipant ?? 0),
  };
}

/** The live cycle every performance screen defaults to. */
export const CURRENT_CYCLE = "PFC-003";
