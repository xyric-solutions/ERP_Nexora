/**
 * Phase 4a — manpower requisition, job opening, candidate, interview and offer
 * fixtures for the isolated Nexora UI/UX prototype.
 *
 * This is the visual specification of the recruitment half of Phase 4
 * (docs/business/hr-lifecycle-design.md in the main repository). It reuses
 * Phase 1's organisation tree, designations, grades and employment types, and
 * Phase 3's money helpers, rather than restating any of them.
 *
 * Five rules are modelled as data rather than asserted in prose, because a
 * recruitment module that lets any of them slip produces an unauditable hire:
 *
 *   - A job opening cannot exist without an approved requisition, and the
 *     openings raised against a requisition cannot exceed the headcount that
 *     requisition approved.
 *   - The pipeline stage belongs to the APPLICATION, not to the candidate. One
 *     person may apply twice; a candidate record is a person, not a process.
 *   - An interview evaluation is a separate record per panel member. Nothing
 *     writes a score onto the candidate, so no single reviewer can quietly
 *     restate the panel's view.
 *   - An offer is bounded by the approved requisition's salary range. Paying
 *     outside it is possible but never silent: it needs a named management
 *     exception before the offer can be sent.
 *   - Creating the employee derives every field from the candidate or the
 *     offer and says which. Recruitment is not re-keyed into the employee
 *     master, and the candidate record survives the conversion.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

import { HR_TODAY, employee, masterRecord, orgUnitName } from "./hr-core-data.ts";
import { money } from "./hr-payroll-data.ts";

/* ------------------------------------------------------------------ */
/* Policy                                                             */
/* ------------------------------------------------------------------ */

export interface RecruitmentPolicy {
  /** A new position always goes to Budget review; a replacement only if it is expensive. */
  budgetReviewThresholdAnnual: number;
  /** Panel evaluations required before an application may be Selected. */
  minPanelEvaluations: number;
  /** Weighted panel average, out of 100, required for selection. */
  selectionScoreThreshold: number;
  /** An employee applying internally must be past probation. */
  internalApplicantsMustBeConfirmed: boolean;
  offerValidityDays: number;
}

export const recruitmentPolicy: RecruitmentPolicy = {
  budgetReviewThresholdAnnual: money(3_000_000),
  minPanelEvaluations: 2,
  selectionScoreThreshold: 65,
  internalApplicantsMustBeConfirmed: true,
  offerValidityDays: 7,
};

/**
 * The gross monthly pay band each grade permits, in minor units. A requisition
 * range must sit inside its grade's band, and an offer must sit inside the
 * requisition range — one chain, checked at every link.
 */
export const gradeSalaryBands: Readonly<Record<string, { min: number; max: number }>> = {
  "GRD-001": { min: money(800000), max: money(1500000) },
  "GRD-002": { min: money(550000), max: money(800000) },
  "GRD-003": { min: money(400000), max: money(650000) },
  "GRD-004": { min: money(300000), max: money(430000) },
  "GRD-005": { min: money(180000), max: money(300000) },
  "GRD-006": { min: money(100000), max: money(180000) },
};

/* ------------------------------------------------------------------ */
/* 1. Manpower requisition                                            */
/* ------------------------------------------------------------------ */

export type PositionType = "New position" | "Replacement";

export type RequisitionStatus =
  | "Draft"
  | "Department submission"
  | "HR review"
  | "Budget review"
  | "Management approval"
  | "Approved"
  | "Rejected"
  | "Cancelled";

/**
 * Draft → Department submission → HR review → Budget review (when required)
 * → Management approval → Approved.
 *
 * Rejected and Cancelled are terminal and retained: a refused headcount
 * request is the evidence for why a department did not grow.
 */
export const requisitionTransitions: Readonly<Record<RequisitionStatus, readonly RequisitionStatus[]>> = {
  "Draft": ["Department submission", "Cancelled"],
  "Department submission": ["HR review", "Draft", "Rejected", "Cancelled"],
  "HR review": ["Budget review", "Management approval", "Department submission", "Rejected", "Cancelled"],
  "Budget review": ["Management approval", "HR review", "Rejected", "Cancelled"],
  "Management approval": ["Approved", "Budget review", "Rejected", "Cancelled"],
  "Approved": ["Cancelled"],
  "Rejected": [],
  "Cancelled": [],
};

export const requisitionStatuses = Object.keys(requisitionTransitions) as readonly RequisitionStatus[];

export function canTransitionRequisition(from: RequisitionStatus, to: RequisitionStatus): boolean {
  return requisitionTransitions[from].includes(to);
}

export interface RequisitionApproval {
  id: string;
  stage: RequisitionStatus;
  decidedBy: string;
  decidedOn: string;
  decision: "Approved" | "Rejected" | "Returned";
  comment: string;
}

export interface ManpowerRequisition {
  id: string;
  reference: string;
  /** Designation requested — never free text, so headcount reporting adds up. */
  designationId: string;
  departmentId: string;
  branchId: string;
  numberRequired: number;
  employmentTypeId: string;
  jobGradeId: string;
  salaryRangeMin: number;
  salaryRangeMax: number;
  currency: string;
  jobDescription: string;
  requiredSkills: readonly string[];
  reason: string;
  positionType: PositionType;
  /** Set only for a replacement, so the vacancy traces to the person who left. */
  replacingEmployeeId: string | null;
  targetStartDate: string;
  status: RequisitionStatus;
  raisedBy: string;
  raisedOn: string;
  approvals: readonly RequisitionApproval[];
}

export const manpowerRequisitions: readonly ManpowerRequisition[] = [
  {
    id: "MRQ-001", reference: "MRQ-2026-0004", designationId: "DSG-007", departmentId: "ORG-DP-003", branchId: "ORG-BR-001",
    numberRequired: 1, employmentTypeId: "EMT-002", jobGradeId: "GRD-005", salaryRangeMin: money(240000), salaryRangeMax: money(290000), currency: "PKR",
    jobDescription: "Build and maintain client-facing delivery services within the Technology & Delivery department.",
    requiredSkills: ["TypeScript", "Python", "SQL", "REST API design"],
    reason: "Delivery pipeline for two new managed-service clients signed in Q1.", positionType: "New position", replacingEmployeeId: null,
    targetStartDate: "2026-07-01", status: "Approved", raisedBy: "Bilal Khan", raisedOn: "2026-05-04",
    approvals: [
      { id: "RQA-001", stage: "HR review", decidedBy: "Sana Iqbal", decidedOn: "2026-05-07", decision: "Approved", comment: "Grade and range consistent with the professional band." },
      { id: "RQA-002", stage: "Budget review", decidedBy: "Mariam Ali", decidedOn: "2026-05-12", decision: "Approved", comment: "Funded from the Q2 delivery growth budget." },
      { id: "RQA-003", stage: "Management approval", decidedBy: "Omar Siddiqui", decidedOn: "2026-05-20", decision: "Approved", comment: "Approved for one position." },
    ],
  },
  {
    id: "MRQ-002", reference: "MRQ-2026-0009", designationId: "DSG-007", departmentId: "ORG-DP-007", branchId: "ORG-BR-002",
    numberRequired: 3, employmentTypeId: "EMT-005", jobGradeId: "GRD-006", salaryRangeMin: money(120000), salaryRangeMax: money(160000), currency: "PKR",
    jobDescription: "Graduate engineering intake for the Lahore delivery engineering practice, on the structured internship programme.",
    requiredSkills: ["JavaScript", "Git", "Problem solving"],
    reason: "Graduate programme intake to build a junior bench ahead of the 2027 delivery plan.", positionType: "New position", replacingEmployeeId: null,
    targetStartDate: "2026-09-21", status: "Approved", raisedBy: "Bilal Khan", raisedOn: "2026-08-03",
    approvals: [
      { id: "RQA-004", stage: "HR review", decidedBy: "Sana Iqbal", decidedOn: "2026-08-05", decision: "Approved", comment: "Internship terms and stipend band confirmed." },
      { id: "RQA-005", stage: "Budget review", decidedBy: "Mariam Ali", decidedOn: "2026-08-11", decision: "Approved", comment: "Within the approved graduate programme envelope." },
      { id: "RQA-006", stage: "Management approval", decidedBy: "Omar Siddiqui", decidedOn: "2026-08-14", decision: "Approved", comment: "Three positions approved; phased intake." },
    ],
  },
  {
    id: "MRQ-003", reference: "MRQ-2026-0012", designationId: "DSG-008", departmentId: "ORG-DP-005", branchId: "ORG-BR-002",
    numberRequired: 1, employmentTypeId: "EMT-001", jobGradeId: "GRD-003", salaryRangeMin: money(420000), salaryRangeMax: money(520000), currency: "PKR",
    jobDescription: "Lead the Commercial function in Lahore: pipeline, partnerships and commercial governance.",
    requiredSkills: ["Commercial leadership", "Contract negotiation", "Team management"],
    reason: "Backfill for the Commercial lead transferred to Service Operations on 01 June 2026.", positionType: "Replacement", replacingEmployeeId: "EMP-5",
    targetStartDate: "2026-11-01", status: "Approved", raisedBy: "Omar Siddiqui", raisedOn: "2026-06-22",
    approvals: [
      { id: "RQA-007", stage: "HR review", decidedBy: "Sana Iqbal", decidedOn: "2026-06-25", decision: "Approved", comment: "Replacement for a vacated approved position." },
      { id: "RQA-008", stage: "Budget review", decidedBy: "Mariam Ali", decidedOn: "2026-06-30", decision: "Approved", comment: "Annualised cost above the threshold; existing budget line confirmed." },
      { id: "RQA-009", stage: "Management approval", decidedBy: "Omar Siddiqui", decidedOn: "2026-07-04", decision: "Approved", comment: "Approved. Prioritise an external hire." },
    ],
  },
  {
    id: "MRQ-004", reference: "MRQ-2026-0013", designationId: "DSG-006", departmentId: "ORG-DP-007", branchId: "ORG-BR-002",
    numberRequired: 1, employmentTypeId: "EMT-001", jobGradeId: "GRD-004", salaryRangeMin: money(330000), salaryRangeMax: money(410000), currency: "PKR",
    jobDescription: "Senior engineering ownership of the delivery platform, including technical mentoring of the graduate intake.",
    requiredSkills: ["System design", "TypeScript", "Cloud infrastructure", "Mentoring"],
    reason: "Senior bench depth for the platform workstream.", positionType: "New position", replacingEmployeeId: null,
    targetStartDate: "2026-12-01", status: "Approved", raisedBy: "Bilal Khan", raisedOn: "2026-07-18",
    approvals: [
      { id: "RQA-010", stage: "HR review", decidedBy: "Sana Iqbal", decidedOn: "2026-07-21", decision: "Approved", comment: "Internal applicants to be considered first." },
      { id: "RQA-011", stage: "Budget review", decidedBy: "Mariam Ali", decidedOn: "2026-07-28", decision: "Approved", comment: "Approved subject to a Q4 budget review of the start date." },
      { id: "RQA-012", stage: "Management approval", decidedBy: "Omar Siddiqui", decidedOn: "2026-08-01", decision: "Approved", comment: "Approved for one position." },
    ],
  },
  {
    id: "MRQ-005", reference: "MRQ-2026-0014", designationId: "DSG-003", departmentId: "ORG-DP-001", branchId: "ORG-BR-001",
    numberRequired: 1, employmentTypeId: "EMT-001", jobGradeId: "GRD-005", salaryRangeMin: money(200000), salaryRangeMax: money(260000), currency: "PKR",
    jobDescription: "Ledger, reconciliation and month-end close support for the Finance & Accounts department.",
    requiredSkills: ["IFRS", "Reconciliations", "ERP finance modules"],
    reason: "Close cycle has grown with the Lahore entity; one additional accountant required.", positionType: "New position", replacingEmployeeId: null,
    targetStartDate: "2026-11-15", status: "Budget review", raisedBy: "Mariam Ali", raisedOn: "2026-09-08",
    approvals: [
      { id: "RQA-013", stage: "HR review", decidedBy: "Sana Iqbal", decidedOn: "2026-09-11", decision: "Approved", comment: "Range sits inside the professional band; sent to Finance for funding." },
    ],
  },
  {
    id: "MRQ-006", reference: "MRQ-2026-0015", designationId: "DSG-005", departmentId: "ORG-DP-002", branchId: "ORG-BR-001",
    numberRequired: 1, employmentTypeId: "EMT-001", jobGradeId: "GRD-005", salaryRangeMin: money(190000), salaryRangeMax: money(250000), currency: "PKR",
    jobDescription: "Employee records, documents and onboarding administration for the People & Culture function.",
    requiredSkills: ["HR administration", "Document control", "Employee onboarding"],
    reason: "Records workload from the graduate intake.", positionType: "New position", replacingEmployeeId: null,
    targetStartDate: "2027-01-05", status: "Draft", raisedBy: "Sana Iqbal", raisedOn: "2026-09-16",
    approvals: [],
  },
  {
    id: "MRQ-007", reference: "MRQ-2026-0016", designationId: "DSG-007", departmentId: "ORG-DP-007", branchId: "ORG-BR-002",
    numberRequired: 3, employmentTypeId: "EMT-001", jobGradeId: "GRD-006", salaryRangeMin: money(120000), salaryRangeMax: money(160000), currency: "PKR",
    jobDescription: "Additional permanent engineering capacity for the Lahore practice.",
    requiredSkills: ["JavaScript", "Testing", "Version control"],
    reason: "Anticipated 2027 demand.", positionType: "New position", replacingEmployeeId: null,
    targetStartDate: "2026-12-01", status: "Rejected", raisedBy: "Bilal Khan", raisedOn: "2026-08-25",
    approvals: [
      { id: "RQA-014", stage: "HR review", decidedBy: "Sana Iqbal", decidedOn: "2026-08-27", decision: "Approved", comment: "Consistent with the associate band." },
      { id: "RQA-015", stage: "Budget review", decidedBy: "Mariam Ali", decidedOn: "2026-09-02", decision: "Rejected", comment: "Not funded in 2026. Resubmit against the 2027 plan once demand is contracted." },
    ],
  },
  {
    id: "MRQ-008", reference: "MRQ-2026-0017", designationId: "DSG-009", departmentId: "ORG-DP-006", branchId: "ORG-BR-003",
    numberRequired: 2, employmentTypeId: "EMT-001", jobGradeId: "GRD-006", salaryRangeMin: money(110000), salaryRangeMax: money(150000), currency: "PKR",
    jobDescription: "First-line client support for the Karachi client office.",
    requiredSkills: ["Client support", "Ticketing systems"],
    reason: "Support desk coverage.", positionType: "New position", replacingEmployeeId: null,
    targetStartDate: "2026-10-01", status: "Cancelled", raisedBy: "Hassan Raza", raisedOn: "2026-07-02",
    approvals: [
      { id: "RQA-016", stage: "HR review", decidedBy: "Sana Iqbal", decidedOn: "2026-07-06", decision: "Returned", comment: "Withdrawn by the requesting department: the Karachi office is closing." },
    ],
  },
  {
    id: "MRQ-009", reference: "MRQ-2026-0018", designationId: "DSG-007", departmentId: "ORG-DP-003", branchId: "ORG-BR-001",
    numberRequired: 1, employmentTypeId: "EMT-001", jobGradeId: "GRD-005", salaryRangeMin: money(230000), salaryRangeMax: money(285000), currency: "PKR",
    jobDescription: "Engineering capacity for the Islamabad technology team.",
    requiredSkills: ["TypeScript", "SQL", "Testing"],
    reason: "Raised in anticipation of an internal move to the Lahore practice; contingent on that move being approved.", positionType: "Replacement", replacingEmployeeId: "EMP-7",
    targetStartDate: "2027-01-02", status: "Management approval", raisedBy: "Bilal Khan", raisedOn: "2026-09-12",
    approvals: [
      { id: "RQA-017", stage: "HR review", decidedBy: "Sana Iqbal", decidedOn: "2026-09-14", decision: "Approved", comment: "Replacement, so Budget review is not triggered by position type." },
      { id: "RQA-018", stage: "Budget review", decidedBy: "Mariam Ali", decidedOn: "2026-09-16", decision: "Approved", comment: "Annualised cost above the threshold; funded from the existing line." },
    ],
  },
  {
    id: "MRQ-010", reference: "MRQ-2026-0019", designationId: "DSG-003", departmentId: "ORG-DP-004", branchId: "ORG-BR-002",
    numberRequired: 1, employmentTypeId: "EMT-004", jobGradeId: "GRD-005", salaryRangeMin: money(210000), salaryRangeMax: money(265000), currency: "PKR",
    jobDescription: "Part-time accounting support for Service Operations billing.",
    requiredSkills: ["Billing", "Reconciliations"],
    reason: "Billing volume in the managed-services book.", positionType: "New position", replacingEmployeeId: null,
    targetStartDate: "2027-02-01", status: "HR review", raisedBy: "Ayesha Malik", raisedOn: "2026-09-17",
    approvals: [],
  },
  {
    id: "MRQ-011", reference: "MRQ-2026-0020", designationId: "DSG-009", departmentId: "ORG-DP-004", branchId: "ORG-BR-002",
    numberRequired: 1, employmentTypeId: "EMT-001", jobGradeId: "GRD-006", salaryRangeMin: money(105000), salaryRangeMax: money(140000), currency: "PKR",
    jobDescription: "First-line support for the Service Operations desk in Lahore.",
    requiredSkills: ["Client support", "Ticketing systems"],
    reason: "Backfill for the support associate whose Karachi role ended with the office closure.", positionType: "Replacement", replacingEmployeeId: "EMP-6",
    targetStartDate: "2026-11-01", status: "Management approval", raisedBy: "Ayesha Malik", raisedOn: "2026-09-09",
    approvals: [
      { id: "RQA-019", stage: "HR review", decidedBy: "Sana Iqbal", decidedOn: "2026-09-11", decision: "Approved", comment: "Replacement, and the annualised cost is below the budget threshold, so Budget review is not required." },
    ],
  },
];

export function requisition(id: string): ManpowerRequisition | undefined {
  return manpowerRequisitions.find((row) => row.id === id);
}

/** Annualised cost at the top of the requested range, for the budget gate. */
export function requisitionAnnualCost(row: ManpowerRequisition): number {
  return row.numberRequired * row.salaryRangeMax * 12;
}

export function budgetReviewRequired(row: ManpowerRequisition): boolean {
  return row.positionType === "New position"
    || requisitionAnnualCost(row) > recruitmentPolicy.budgetReviewThresholdAnnual;
}

/** The approval chain, in order, for the progress strip on the screen. */
export const requisitionChain: readonly RequisitionStatus[] = [
  "Draft", "Department submission", "HR review", "Budget review", "Management approval", "Approved",
];

/**
 * The stage that follows this one for THIS requisition. Budget review is
 * skipped where it is not required, which is the only conditional stage in
 * the chain.
 */
export function nextStageFor(row: ManpowerRequisition): RequisitionStatus | null {
  if (row.status === "Approved" || row.status === "Rejected" || row.status === "Cancelled") return null;
  if (row.status === "HR review") return budgetReviewRequired(row) ? "Budget review" : "Management approval";
  const index = requisitionChain.indexOf(row.status);
  if (index < 0) return null;
  return requisitionChain[index + 1] ?? null;
}

/** The stages this requisition actually passes through, budget gate included or not. */
export function stagesForRequisition(row: ManpowerRequisition): readonly RequisitionStatus[] {
  return budgetReviewRequired(row)
    ? requisitionChain
    : requisitionChain.filter((stage) => stage !== "Budget review");
}

/** A requested range must sit inside the grade's published band. */
export function salaryRangeWithinGradeBand(row: ManpowerRequisition): boolean {
  const band = gradeSalaryBands[row.jobGradeId];
  if (!band) return false;
  return row.salaryRangeMin >= band.min
    && row.salaryRangeMax <= band.max
    && row.salaryRangeMin <= row.salaryRangeMax;
}

/** A replacement must name the person being replaced; a new position must not. */
export function replacementLinkIsConsistent(row: ManpowerRequisition): boolean {
  return row.positionType === "Replacement"
    ? row.replacingEmployeeId !== null
    : row.replacingEmployeeId === null;
}

export function requisitionTitle(row: ManpowerRequisition): string {
  return masterRecord("designation", row.designationId)?.name ?? "—";
}

export function requisitionLocation(row: ManpowerRequisition): string {
  return `${orgUnitName(row.departmentId)} · ${orgUnitName(row.branchId)}`;
}

/* ------------------------------------------------------------------ */
/* 2. Job opening                                                     */
/* ------------------------------------------------------------------ */

export type OpeningStatus = "Open" | "On hold" | "Closed" | "Cancelled";

export const openingStatuses: readonly OpeningStatus[] = ["Open", "On hold", "Closed", "Cancelled"];

export interface JobOpening {
  id: string;
  reference: string;
  requisitionId: string;
  title: string;
  numberRequired: number;
  hiringManagerId: string;
  recruiterId: string;
  postedOn: string;
  closingOn: string;
  status: OpeningStatus;
  statusReason: string;
  channels: readonly string[];
}

export const jobOpenings: readonly JobOpening[] = [
  {
    id: "JOB-001", reference: "JOB-2026-0005", requisitionId: "MRQ-001", title: "Software Engineer — Technology & Delivery",
    numberRequired: 1, hiringManagerId: "EMP-3", recruiterId: "EMP-4", postedOn: "2026-05-22", closingOn: "2026-06-20",
    status: "Closed", statusReason: "Filled on 01 July 2026.", channels: ["Company site", "LinkedIn", "Referral"],
  },
  {
    id: "JOB-002", reference: "JOB-2026-0007", requisitionId: "MRQ-002", title: "Graduate Software Engineer — Lahore",
    numberRequired: 2, hiringManagerId: "EMP-3", recruiterId: "EMP-4", postedOn: "2026-08-17", closingOn: "2026-10-15",
    status: "Open", statusReason: "One of two positions filled; second in offer stage.", channels: ["Company site", "University careers fair"],
  },
  {
    id: "JOB-003", reference: "JOB-2026-0008", requisitionId: "MRQ-003", title: "Operations Manager — Commercial, Lahore",
    numberRequired: 1, hiringManagerId: "EMP-1", recruiterId: "EMP-4", postedOn: "2026-07-08", closingOn: "2026-10-31",
    status: "Open", statusReason: "Final candidate at offer stage, pending a range exception.", channels: ["Company site", "LinkedIn", "Executive search"],
  },
  {
    id: "JOB-004", reference: "JOB-2026-0009", requisitionId: "MRQ-004", title: "Senior Software Engineer — Delivery Engineering",
    numberRequired: 1, hiringManagerId: "EMP-3", recruiterId: "EMP-4", postedOn: "2026-08-05", closingOn: "2026-11-30",
    status: "On hold", statusReason: "Held pending the Q4 budget review of the start date.", channels: ["Company site", "Internal notice board"],
  },
  {
    id: "JOB-005", reference: "JOB-2026-0006", requisitionId: "MRQ-002", title: "Graduate Software Engineer — Lahore (third position)",
    numberRequired: 1, hiringManagerId: "EMP-3", recruiterId: "EMP-4", postedOn: "2026-08-17", closingOn: "2026-10-15",
    status: "Cancelled", statusReason: "Third position deferred to the 2027 intake; requisition headcount not reassigned.", channels: ["Company site"],
  },
];

export function jobOpening(id: string): JobOpening | undefined {
  return jobOpenings.find((row) => row.id === id);
}

export function openingsFor(requisitionId: string): readonly JobOpening[] {
  return jobOpenings.filter((row) => row.requisitionId === requisitionId);
}

/**
 * Headcount raised as openings against a requisition, excluding cancelled
 * ones. A cancelled opening releases its headcount; it does not consume it.
 */
export function requisitionHeadcountRaised(requisitionId: string): number {
  return openingsFor(requisitionId)
    .filter((row) => row.status !== "Cancelled")
    .reduce((total, row) => total + row.numberRequired, 0);
}

/** An opening may only exist against an approved requisition. */
export function openingIsAuthorised(row: JobOpening): boolean {
  return requisition(row.requisitionId)?.status === "Approved";
}

export function requisitionHeadcountWithinLimit(requisitionId: string): boolean {
  const row = requisition(requisitionId);
  if (!row) return false;
  return requisitionHeadcountRaised(requisitionId) <= row.numberRequired;
}

/** Positions on this opening already taken by an accepted offer. */
export function openingFilled(openingId: string): number {
  return offers.filter((row) => row.openingId === openingId && row.status === "Accepted").length;
}

export function openingRemaining(openingId: string): number {
  const row = jobOpening(openingId);
  if (!row) return 0;
  return Math.max(0, row.numberRequired - openingFilled(openingId));
}

/* ------------------------------------------------------------------ */
/* 3. Candidate management                                            */
/* ------------------------------------------------------------------ */

export type CandidateSource = "Referral" | "Job board" | "Company site" | "Agency" | "University" | "Internal";

export interface CandidateDocument {
  id: string;
  title: string;
  category: "CV" | "Identity" | "Qualification" | "Experience" | "Reference";
  reference: string;
  uploadedOn: string;
  uploadedBy: string;
  restricted: boolean;
}

/**
 * A candidate is a PERSON. There is deliberately no stage, score, rating,
 * interview outcome or decision field here: those belong to the application,
 * the interview evaluation and the offer. One person applying to two openings
 * has one candidate record and two applications.
 */
export interface Candidate {
  id: string;
  candidateNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  city: string;
  country: string;
  source: CandidateSource;
  currentEmployer: string;
  currentDesignation: string;
  totalExperienceYears: number;
  noticePeriodDays: number;
  expectedSalary: number;
  highestQualification: string;
  skills: readonly string[];
  /** Set when this candidate is, or became, an employee. Never cleared. */
  employeeId: string | null;
  documents: readonly CandidateDocument[];
  createdBy: string;
  createdOn: string;
}

export const candidates: readonly Candidate[] = [
  {
    id: "CAN-001", candidateNumber: "CAN-2026-0031", firstName: "Usman", lastName: "Tariq", email: "usman.tariq@example.com", mobile: "+92 345 3332211",
    city: "Lahore", country: "Pakistan", source: "University", currentEmployer: "—", currentDesignation: "Graduate", totalExperienceYears: 0,
    noticePeriodDays: 0, expectedSalary: money(140000), highestQualification: "BSc Computer Science, UET", skills: ["JavaScript", "Git", "Problem solving"],
    employeeId: "EMP-8",
    documents: [
      { id: "CDC-001", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0031", uploadedOn: "2026-08-19", uploadedBy: "Usman Tariq", restricted: false },
      { id: "CDC-002", title: "Degree certificate", category: "Qualification", reference: "UET-2024-8841", uploadedOn: "2026-08-19", uploadedBy: "Usman Tariq", restricted: false },
    ],
    createdBy: "Sana Iqbal", createdOn: "2026-08-19",
  },
  {
    id: "CAN-002", candidateNumber: "CAN-2026-0012", firstName: "Zainab", lastName: "Farooq", email: "z.farooq@example.com", mobile: "+92 336 5551122",
    city: "Islamabad", country: "Pakistan", source: "Referral", currentEmployer: "Meridian Software", currentDesignation: "Software Engineer", totalExperienceYears: 4,
    noticePeriodDays: 14, expectedSalary: money(285000), highestQualification: "BE Software Engineering, NUST", skills: ["TypeScript", "Python", "SQL", "REST API design"],
    employeeId: "EMP-7",
    documents: [
      { id: "CDC-003", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0012", uploadedOn: "2026-05-28", uploadedBy: "Zainab Farooq", restricted: false },
      { id: "CDC-004", title: "Degree certificate", category: "Qualification", reference: "NUST-2019-1182", uploadedOn: "2026-05-28", uploadedBy: "Zainab Farooq", restricted: false },
      { id: "CDC-005", title: "Experience letter", category: "Experience", reference: "MSW-EXP-2026-114", uploadedOn: "2026-06-02", uploadedBy: "Sana Iqbal", restricted: true },
    ],
    createdBy: "Sana Iqbal", createdOn: "2026-05-28",
  },
  {
    id: "CAN-003", candidateNumber: "CAN-2026-0034", firstName: "Fatima", lastName: "Sheikh", email: "f.sheikh@example.com", mobile: "+92 300 7781122",
    city: "Lahore", country: "Pakistan", source: "University", currentEmployer: "—", currentDesignation: "Graduate", totalExperienceYears: 0,
    noticePeriodDays: 0, expectedSalary: money(150000), highestQualification: "BS Software Engineering, FAST", skills: ["JavaScript", "React", "Testing"],
    employeeId: null,
    documents: [{ id: "CDC-006", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0034", uploadedOn: "2026-08-21", uploadedBy: "Fatima Sheikh", restricted: false }],
    createdBy: "Sana Iqbal", createdOn: "2026-08-21",
  },
  {
    id: "CAN-004", candidateNumber: "CAN-2026-0021", firstName: "Hira", lastName: "Naveed", email: "h.naveed@example.com", mobile: "+92 321 4456677",
    city: "Lahore", country: "Pakistan", source: "Agency", currentEmployer: "Crestline Partners", currentDesignation: "Commercial Manager", totalExperienceYears: 11,
    noticePeriodDays: 60, expectedSalary: money(560000), highestQualification: "MBA, LUMS", skills: ["Commercial leadership", "Contract negotiation", "Team management"],
    employeeId: null,
    documents: [
      { id: "CDC-007", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0021", uploadedOn: "2026-07-14", uploadedBy: "Sana Iqbal", restricted: false },
      { id: "CDC-008", title: "Reference — Crestline", category: "Reference", reference: "REF-2026-0044", uploadedOn: "2026-09-04", uploadedBy: "Sana Iqbal", restricted: true },
    ],
    createdBy: "Sana Iqbal", createdOn: "2026-07-14",
  },
  {
    id: "CAN-005", candidateNumber: "CAN-2026-0036", firstName: "Ali", lastName: "Hamza", email: "a.hamza@example.com", mobile: "+92 333 2214455",
    city: "Lahore", country: "Pakistan", source: "Company site", currentEmployer: "—", currentDesignation: "Graduate", totalExperienceYears: 0,
    noticePeriodDays: 0, expectedSalary: money(145000), highestQualification: "BS Computer Science, PUCIT", skills: ["JavaScript", "Node.js", "Git"],
    employeeId: null,
    documents: [{ id: "CDC-009", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0036", uploadedOn: "2026-08-24", uploadedBy: "Ali Hamza", restricted: false }],
    createdBy: "Sana Iqbal", createdOn: "2026-08-24",
  },
  {
    id: "CAN-006", candidateNumber: "CAN-2026-0026", firstName: "Kamran", lastName: "Ashraf", email: "k.ashraf@example.com", mobile: "+92 301 9987766",
    city: "Islamabad", country: "Pakistan", source: "Job board", currentEmployer: "Northline Services", currentDesignation: "Operations Lead", totalExperienceYears: 9,
    noticePeriodDays: 30, expectedSalary: money(470000), highestQualification: "MBA, IBA", skills: ["Operations", "Team management", "Client governance"],
    employeeId: null,
    documents: [{ id: "CDC-010", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0026", uploadedOn: "2026-08-02", uploadedBy: "Sana Iqbal", restricted: false }],
    createdBy: "Sana Iqbal", createdOn: "2026-08-02",
  },
  {
    id: "CAN-007", candidateNumber: "CAN-2026-0029", firstName: "Noor", lastName: "Fatima", email: "n.fatima@example.com", mobile: "+92 342 5567788",
    city: "Lahore", country: "Pakistan", source: "Referral", currentEmployer: "Vantage Consulting", currentDesignation: "Senior Consultant", totalExperienceYears: 8,
    noticePeriodDays: 30, expectedSalary: money(455000), highestQualification: "MBA, LUMS", skills: ["Commercial leadership", "Partnerships"],
    employeeId: null,
    documents: [{ id: "CDC-011", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0029", uploadedOn: "2026-08-09", uploadedBy: "Sana Iqbal", restricted: false }],
    createdBy: "Sana Iqbal", createdOn: "2026-08-09",
  },
  {
    id: "CAN-008", candidateNumber: "CAN-2026-0038", firstName: "Danish", lastName: "Iqbal", email: "d.iqbal@example.com", mobile: "+92 311 7742211",
    city: "Lahore", country: "Pakistan", source: "Company site", currentEmployer: "—", currentDesignation: "Graduate", totalExperienceYears: 0,
    noticePeriodDays: 0, expectedSalary: money(150000), highestQualification: "BS Information Technology, UCP", skills: ["JavaScript", "HTML"],
    employeeId: null,
    documents: [{ id: "CDC-012", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0038", uploadedOn: "2026-08-26", uploadedBy: "Danish Iqbal", restricted: false }],
    createdBy: "Sana Iqbal", createdOn: "2026-08-26",
  },
  {
    id: "CAN-009", candidateNumber: "CAN-2026-0024", firstName: "Rabia", lastName: "Aslam", email: "r.aslam@example.com", mobile: "+92 305 3321144",
    city: "Karachi", country: "Pakistan", source: "Agency", currentEmployer: "Southport Trading", currentDesignation: "Commercial Manager", totalExperienceYears: 10,
    noticePeriodDays: 90, expectedSalary: money(520000), highestQualification: "MBA, IBA", skills: ["Commercial leadership", "Trading operations"],
    employeeId: null,
    documents: [{ id: "CDC-013", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0024", uploadedOn: "2026-07-22", uploadedBy: "Sana Iqbal", restricted: false }],
    createdBy: "Sana Iqbal", createdOn: "2026-07-22",
  },
  {
    id: "CAN-010", candidateNumber: "CAN-2026-0014", firstName: "Saad", lastName: "Yousuf", email: "s.yousuf@example.com", mobile: "+92 322 6654433",
    city: "Islamabad", country: "Pakistan", source: "Job board", currentEmployer: "Halcyon Digital", currentDesignation: "Software Engineer", totalExperienceYears: 5,
    noticePeriodDays: 30, expectedSalary: money(295000), highestQualification: "BS Computer Science, COMSATS", skills: ["TypeScript", "SQL", "AWS"],
    employeeId: null,
    documents: [{ id: "CDC-014", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0014", uploadedOn: "2026-05-30", uploadedBy: "Saad Yousuf", restricted: false }],
    createdBy: "Sana Iqbal", createdOn: "2026-05-30",
  },
  {
    id: "CAN-011", candidateNumber: "CAN-2026-0016", firstName: "Mehwish", lastName: "Anwar", email: "m.anwar@example.com", mobile: "+92 314 1122334",
    city: "Islamabad", country: "Pakistan", source: "Referral", currentEmployer: "Ravi Systems", currentDesignation: "Software Engineer", totalExperienceYears: 3,
    noticePeriodDays: 14, expectedSalary: money(265000), highestQualification: "BS Software Engineering, AIR", skills: ["Python", "SQL"],
    employeeId: null,
    documents: [{ id: "CDC-015", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0016", uploadedOn: "2026-06-01", uploadedBy: "Mehwish Anwar", restricted: false }],
    createdBy: "Sana Iqbal", createdOn: "2026-06-01",
  },
  {
    id: "CAN-012", candidateNumber: "CAN-2026-0040", firstName: "Tahir", lastName: "Mehmood", email: "t.mehmood@example.com", mobile: "+92 308 4432211",
    city: "Lahore", country: "Pakistan", source: "Job board", currentEmployer: "Arcadia Tech", currentDesignation: "Senior Software Engineer", totalExperienceYears: 7,
    noticePeriodDays: 60, expectedSalary: money(395000), highestQualification: "MS Computer Science, LUMS", skills: ["System design", "TypeScript", "Cloud infrastructure", "Mentoring"],
    employeeId: null,
    documents: [{ id: "CDC-016", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0040", uploadedOn: "2026-09-05", uploadedBy: "Tahir Mehmood", restricted: false }],
    createdBy: "Sana Iqbal", createdOn: "2026-09-05",
  },
  {
    id: "CAN-013", candidateNumber: "CAN-2026-0033", firstName: "Hassan", lastName: "Javed", email: "h.javed@example.com", mobile: "+92 331 5566778",
    city: "Lahore", country: "Pakistan", source: "University", currentEmployer: "—", currentDesignation: "Graduate", totalExperienceYears: 0,
    noticePeriodDays: 0, expectedSalary: money(148000), highestQualification: "BS Computer Science, NUCES", skills: ["JavaScript", "Git", "Databases"],
    employeeId: null,
    documents: [{ id: "CDC-017", title: "Curriculum vitae", category: "CV", reference: "CV-CAN-2026-0033", uploadedOn: "2026-08-20", uploadedBy: "Hassan Javed", restricted: false }],
    createdBy: "Sana Iqbal", createdOn: "2026-08-20",
  },
];

export function candidate(id: string): Candidate | undefined {
  return candidates.find((row) => row.id === id);
}

export function candidateName(id: string): string {
  const row = candidate(id);
  return row ? `${row.firstName} ${row.lastName}` : "—";
}

/* ------------------------------------------------------------------ */
/* 4. Application and interview workflow                              */
/* ------------------------------------------------------------------ */

export type ApplicationStage =
  | "Application"
  | "Screening"
  | "Shortlisted"
  | "Interview"
  | "Evaluation"
  | "Selected"
  | "Rejected"
  | "Withdrawn"
  | "Hired";

/**
 * Application → Screening → Shortlisted → Interview → Evaluation →
 * Selected → Hired, with Rejected and Withdrawn reachable from any live
 * stage. Hired, Rejected and Withdrawn are terminal: a pipeline that can be
 * rewound is a pipeline whose reporting cannot be trusted.
 */
export const applicationTransitions: Readonly<Record<ApplicationStage, readonly ApplicationStage[]>> = {
  "Application": ["Screening", "Rejected", "Withdrawn"],
  "Screening": ["Shortlisted", "Rejected", "Withdrawn"],
  "Shortlisted": ["Interview", "Rejected", "Withdrawn"],
  "Interview": ["Evaluation", "Rejected", "Withdrawn"],
  "Evaluation": ["Selected", "Rejected", "Withdrawn"],
  "Selected": ["Hired", "Rejected", "Withdrawn"],
  "Rejected": [],
  "Withdrawn": [],
  "Hired": [],
};

export const applicationStages = Object.keys(applicationTransitions) as readonly ApplicationStage[];

/** The stages an application passes through on the way to a hire. */
export const applicationPipeline: readonly ApplicationStage[] = [
  "Application", "Screening", "Shortlisted", "Interview", "Evaluation", "Selected", "Hired",
];

export const terminalApplicationStages: readonly ApplicationStage[] = ["Hired", "Rejected", "Withdrawn"];

export interface Application {
  id: string;
  reference: string;
  candidateId: string;
  openingId: string;
  appliedOn: string;
  stage: ApplicationStage;
  /** True when the applicant is a serving employee. */
  internal: boolean;
  screenedBy: string | null;
  screenedOn: string | null;
  screeningNote: string;
  rejectionReason: string;
  decidedBy: string | null;
  decidedOn: string | null;
}

export const applications: readonly Application[] = [
  { id: "APL-001", reference: "APL-2026-0061", candidateId: "CAN-001", openingId: "JOB-002", appliedOn: "2026-08-19", stage: "Hired", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-08-21", screeningNote: "Strong academic record; meets the graduate criteria.", rejectionReason: "", decidedBy: "Bilal Khan", decidedOn: "2026-09-10" },
  { id: "APL-002", reference: "APL-2026-0022", candidateId: "CAN-002", openingId: "JOB-001", appliedOn: "2026-05-28", stage: "Hired", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-05-30", screeningNote: "Four years of directly relevant delivery experience.", rejectionReason: "", decidedBy: "Bilal Khan", decidedOn: "2026-06-18" },
  { id: "APL-003", reference: "APL-2026-0063", candidateId: "CAN-003", openingId: "JOB-002", appliedOn: "2026-08-21", stage: "Selected", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-08-24", screeningNote: "Good testing fundamentals for a graduate.", rejectionReason: "", decidedBy: "Bilal Khan", decidedOn: "2026-09-16" },
  { id: "APL-004", reference: "APL-2026-0047", candidateId: "CAN-004", openingId: "JOB-003", appliedOn: "2026-07-14", stage: "Selected", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-07-17", screeningNote: "Eleven years commercial leadership; agency shortlist.", rejectionReason: "", decidedBy: "Omar Siddiqui", decidedOn: "2026-09-12" },
  { id: "APL-005", reference: "APL-2026-0066", candidateId: "CAN-005", openingId: "JOB-002", appliedOn: "2026-08-24", stage: "Evaluation", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-08-26", screeningNote: "Meets the graduate criteria; Node.js exposure.", rejectionReason: "", decidedBy: null, decidedOn: null },
  { id: "APL-006", reference: "APL-2026-0051", candidateId: "CAN-006", openingId: "JOB-003", appliedOn: "2026-08-02", stage: "Interview", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-08-05", screeningNote: "Operations background; commercial exposure to confirm at panel.", rejectionReason: "", decidedBy: null, decidedOn: null },
  { id: "APL-007", reference: "APL-2026-0054", candidateId: "CAN-007", openingId: "JOB-003", appliedOn: "2026-08-09", stage: "Shortlisted", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-08-12", screeningNote: "Consulting background; partnership experience relevant.", rejectionReason: "", decidedBy: null, decidedOn: null },
  { id: "APL-008", reference: "APL-2026-0068", candidateId: "CAN-008", openingId: "JOB-002", appliedOn: "2026-08-26", stage: "Rejected", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-08-28", screeningNote: "Screened through to the technical assessment.", rejectionReason: "Technical assessment score 41 against a pass mark of 60.", decidedBy: "Sana Iqbal", decidedOn: "2026-09-04" },
  { id: "APL-009", reference: "APL-2026-0071", candidateId: "CAN-002", openingId: "JOB-004", appliedOn: "2026-09-08", stage: "Application", internal: true, screenedBy: null, screenedOn: null, screeningNote: "Internal applicant. Held: serving probation until 01 January 2027.", rejectionReason: "", decidedBy: null, decidedOn: null },
  { id: "APL-010", reference: "APL-2026-0049", candidateId: "CAN-009", openingId: "JOB-003", appliedOn: "2026-07-22", stage: "Withdrawn", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-07-25", screeningNote: "Screened; relocation from Karachi required.", rejectionReason: "Candidate withdrew: unwilling to relocate.", decidedBy: "Sana Iqbal", decidedOn: "2026-08-14" },
  { id: "APL-011", reference: "APL-2026-0025", candidateId: "CAN-010", openingId: "JOB-001", appliedOn: "2026-05-30", stage: "Selected", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-06-02", screeningNote: "Five years relevant experience.", rejectionReason: "", decidedBy: "Bilal Khan", decidedOn: "2026-06-16" },
  { id: "APL-012", reference: "APL-2026-0027", candidateId: "CAN-011", openingId: "JOB-001", appliedOn: "2026-06-01", stage: "Selected", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-06-03", screeningNote: "Three years relevant experience; second choice.", rejectionReason: "", decidedBy: "Bilal Khan", decidedOn: "2026-06-16" },
  { id: "APL-013", reference: "APL-2026-0073", candidateId: "CAN-012", openingId: "JOB-004", appliedOn: "2026-09-05", stage: "Screening", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-09-09", screeningNote: "Seven years, senior profile. Pipeline retained while the opening is on hold.", rejectionReason: "", decidedBy: null, decidedOn: null },
  { id: "APL-014", reference: "APL-2026-0062", candidateId: "CAN-013", openingId: "JOB-005", appliedOn: "2026-08-20", stage: "Selected", internal: false, screenedBy: "Sana Iqbal", screenedOn: "2026-08-22", screeningNote: "Meets the graduate criteria; database fundamentals sound.", rejectionReason: "", decidedBy: "Bilal Khan", decidedOn: "2026-09-11" },
];

export function application(id: string): Application | undefined {
  return applications.find((row) => row.id === id);
}

export function applicationsFor(openingId: string): readonly Application[] {
  return applications.filter((row) => row.openingId === openingId);
}

export function applicationsOfCandidate(candidateId: string): readonly Application[] {
  return applications.filter((row) => row.candidateId === candidateId);
}

export type InterviewKind = "Screening call" | "Technical" | "Panel" | "HR" | "Final";

export type InterviewStatus = "Scheduled" | "Completed" | "Cancelled" | "No show";

export interface Interview {
  id: string;
  applicationId: string;
  round: number;
  kind: InterviewKind;
  scheduledOn: string;
  scheduledAt: string;
  durationMinutes: number;
  mode: "On site" | "Video" | "Telephone";
  location: string;
  /** Employee ids. An evaluation is expected from each member. */
  panel: readonly string[];
  status: InterviewStatus;
  statusNote: string;
}

export const interviews: readonly Interview[] = [
  { id: "INT-001", applicationId: "APL-001", round: 1, kind: "Technical", scheduledOn: "2026-08-27", scheduledAt: "11:00", durationMinutes: 60, mode: "Video", location: "Teams", panel: ["EMP-3", "EMP-7"], status: "Completed", statusNote: "" },
  { id: "INT-002", applicationId: "APL-001", round: 2, kind: "Final", scheduledOn: "2026-09-03", scheduledAt: "15:00", durationMinutes: 45, mode: "On site", location: "Lahore Delivery Centre", panel: ["EMP-3", "EMP-4"], status: "Completed", statusNote: "" },
  { id: "INT-003", applicationId: "APL-002", round: 1, kind: "Technical", scheduledOn: "2026-06-05", scheduledAt: "10:00", durationMinutes: 75, mode: "On site", location: "Islamabad Head Office", panel: ["EMP-3", "EMP-1"], status: "Completed", statusNote: "" },
  { id: "INT-004", applicationId: "APL-002", round: 2, kind: "Final", scheduledOn: "2026-06-12", scheduledAt: "14:00", durationMinutes: 45, mode: "On site", location: "Islamabad Head Office", panel: ["EMP-3", "EMP-4"], status: "Completed", statusNote: "" },
  { id: "INT-005", applicationId: "APL-003", round: 1, kind: "Technical", scheduledOn: "2026-08-31", scheduledAt: "11:00", durationMinutes: 60, mode: "Video", location: "Teams", panel: ["EMP-3", "EMP-7"], status: "Completed", statusNote: "" },
  { id: "INT-006", applicationId: "APL-003", round: 2, kind: "Final", scheduledOn: "2026-09-09", scheduledAt: "16:00", durationMinutes: 45, mode: "Video", location: "Teams", panel: ["EMP-3", "EMP-4"], status: "Completed", statusNote: "" },
  { id: "INT-007", applicationId: "APL-004", round: 1, kind: "Panel", scheduledOn: "2026-08-20", scheduledAt: "10:00", durationMinutes: 90, mode: "On site", location: "Lahore Delivery Centre", panel: ["EMP-1", "EMP-4", "EMP-5"], status: "Completed", statusNote: "" },
  { id: "INT-008", applicationId: "APL-004", round: 2, kind: "Final", scheduledOn: "2026-09-04", scheduledAt: "12:00", durationMinutes: 60, mode: "On site", location: "Islamabad Head Office", panel: ["EMP-1", "EMP-4"], status: "Completed", statusNote: "" },
  { id: "INT-009", applicationId: "APL-005", round: 1, kind: "Technical", scheduledOn: "2026-09-01", scheduledAt: "09:30", durationMinutes: 60, mode: "Video", location: "Teams", panel: ["EMP-3", "EMP-7"], status: "Completed", statusNote: "" },
  { id: "INT-010", applicationId: "APL-005", round: 2, kind: "Final", scheduledOn: "2026-09-15", scheduledAt: "15:30", durationMinutes: 45, mode: "Video", location: "Teams", panel: ["EMP-3", "EMP-4"], status: "Completed", statusNote: "" },
  { id: "INT-011", applicationId: "APL-006", round: 1, kind: "Panel", scheduledOn: "2026-09-22", scheduledAt: "11:00", durationMinutes: 90, mode: "On site", location: "Lahore Delivery Centre", panel: ["EMP-1", "EMP-4"], status: "Scheduled", statusNote: "Panel confirmed; evaluations open after the session." },
  { id: "INT-012", applicationId: "APL-008", round: 1, kind: "Technical", scheduledOn: "2026-09-07", scheduledAt: "10:00", durationMinutes: 60, mode: "Video", location: "Teams", panel: ["EMP-3"], status: "Cancelled", statusNote: "Cancelled: technical assessment not passed." },
  { id: "INT-013", applicationId: "APL-010", round: 1, kind: "Panel", scheduledOn: "2026-08-12", scheduledAt: "11:00", durationMinutes: 90, mode: "On site", location: "Lahore Delivery Centre", panel: ["EMP-1", "EMP-4"], status: "No show", statusNote: "Candidate did not attend; withdrew two days later." },
  { id: "INT-014", applicationId: "APL-011", round: 1, kind: "Final", scheduledOn: "2026-06-11", scheduledAt: "11:00", durationMinutes: 60, mode: "On site", location: "Islamabad Head Office", panel: ["EMP-3", "EMP-4"], status: "Completed", statusNote: "" },
  { id: "INT-015", applicationId: "APL-012", round: 1, kind: "Final", scheduledOn: "2026-06-11", scheduledAt: "14:00", durationMinutes: 60, mode: "On site", location: "Islamabad Head Office", panel: ["EMP-3", "EMP-4"], status: "Completed", statusNote: "" },
  { id: "INT-016", applicationId: "APL-014", round: 1, kind: "Final", scheduledOn: "2026-09-02", scheduledAt: "10:00", durationMinutes: 45, mode: "Video", location: "Teams", panel: ["EMP-3", "EMP-4"], status: "Completed", statusNote: "" },
];

export function interview(id: string): Interview | undefined {
  return interviews.find((row) => row.id === id);
}

export function interviewsFor(applicationId: string): readonly Interview[] {
  return interviews
    .filter((row) => row.applicationId === applicationId)
    .sort((a, b) => a.round - b.round);
}

/* ------------------------------------------------------------------ */
/* Interview evaluation — a separate record per panel member           */
/* ------------------------------------------------------------------ */

export interface EvaluationCriterion {
  id: string;
  label: string;
  /** Percentage weight. Every template totals 100. */
  weight: number;
}

/** The scale every criterion is scored on. */
export const RATING_SCALE_MAX = 5;

export const evaluationTemplates: Readonly<Record<InterviewKind, readonly EvaluationCriterion[]>> = {
  "Screening call": [
    { id: "fit", label: "Role fit", weight: 40 },
    { id: "communication", label: "Communication", weight: 30 },
    { id: "motivation", label: "Motivation", weight: 30 },
  ],
  "Technical": [
    { id: "depth", label: "Technical depth", weight: 40 },
    { id: "problem", label: "Problem solving", weight: 30 },
    { id: "practice", label: "Engineering practice", weight: 20 },
    { id: "communication", label: "Communication", weight: 10 },
  ],
  "Panel": [
    { id: "domain", label: "Domain expertise", weight: 30 },
    { id: "leadership", label: "Leadership", weight: 30 },
    { id: "stakeholder", label: "Stakeholder handling", weight: 25 },
    { id: "communication", label: "Communication", weight: 15 },
  ],
  "HR": [
    { id: "values", label: "Values alignment", weight: 40 },
    { id: "expectations", label: "Expectation alignment", weight: 35 },
    { id: "availability", label: "Availability", weight: 25 },
  ],
  "Final": [
    { id: "overall", label: "Overall suitability", weight: 50 },
    { id: "growth", label: "Growth potential", weight: 30 },
    { id: "values", label: "Values alignment", weight: 20 },
  ],
};

export type Recommendation = "Strong hire" | "Hire" | "Hold" | "No hire";

/**
 * One evaluation per panel member per interview. The candidate record holds no
 * score, so a panel's view cannot be replaced by a single person's summary.
 */
export interface InterviewEvaluation {
  id: string;
  interviewId: string;
  panelMemberId: string;
  /** Criterion id → score, 1 to RATING_SCALE_MAX. */
  scores: Readonly<Record<string, number>>;
  recommendation: Recommendation;
  strengths: string;
  concerns: string;
  submittedOn: string;
}

export const interviewEvaluations: readonly InterviewEvaluation[] = [
  { id: "IEV-001", interviewId: "INT-001", panelMemberId: "EMP-3", scores: { depth: 4, problem: 4, practice: 3, communication: 4 }, recommendation: "Hire", strengths: "Solid fundamentals; reasoned through the data-modelling exercise.", concerns: "No production experience yet, as expected for a graduate.", submittedOn: "2026-08-27" },
  { id: "IEV-002", interviewId: "INT-001", panelMemberId: "EMP-7", scores: { depth: 4, problem: 4, practice: 4, communication: 4 }, recommendation: "Hire", strengths: "Good version-control habits; asked clarifying questions.", concerns: "Testing vocabulary is thin.", submittedOn: "2026-08-28" },
  { id: "IEV-003", interviewId: "INT-002", panelMemberId: "EMP-3", scores: { overall: 4, growth: 5, values: 4 }, recommendation: "Hire", strengths: "Clear growth trajectory; coachable.", concerns: "None material for the internship band.", submittedOn: "2026-09-03" },
  { id: "IEV-004", interviewId: "INT-002", panelMemberId: "EMP-4", scores: { overall: 4, growth: 4, values: 5 }, recommendation: "Hire", strengths: "Values alignment evident; realistic expectations.", concerns: "Will need structured mentoring in the first quarter.", submittedOn: "2026-09-04" },

  { id: "IEV-005", interviewId: "INT-003", panelMemberId: "EMP-3", scores: { depth: 5, problem: 4, practice: 4, communication: 4 }, recommendation: "Strong hire", strengths: "Strong API design reasoning; production-grade instincts.", concerns: "None.", submittedOn: "2026-06-05" },
  { id: "IEV-006", interviewId: "INT-003", panelMemberId: "EMP-1", scores: { depth: 4, problem: 4, practice: 4, communication: 5 }, recommendation: "Hire", strengths: "Explains trade-offs without jargon.", concerns: "Notice period of 30 days delays the start.", submittedOn: "2026-06-06" },
  { id: "IEV-007", interviewId: "INT-004", panelMemberId: "EMP-3", scores: { overall: 5, growth: 4, values: 4 }, recommendation: "Strong hire", strengths: "Ready for the professional band on day one.", concerns: "None.", submittedOn: "2026-06-12" },
  { id: "IEV-008", interviewId: "INT-004", panelMemberId: "EMP-4", scores: { overall: 4, growth: 4, values: 5 }, recommendation: "Hire", strengths: "Clear on expectations and probation terms.", concerns: "None.", submittedOn: "2026-06-13" },

  { id: "IEV-009", interviewId: "INT-005", panelMemberId: "EMP-3", scores: { depth: 4, problem: 4, practice: 4, communication: 4 }, recommendation: "Hire", strengths: "Testing-first mindset, unusual for a graduate.", concerns: "Limited backend exposure.", submittedOn: "2026-08-31" },
  { id: "IEV-010", interviewId: "INT-005", panelMemberId: "EMP-7", scores: { depth: 3, problem: 4, practice: 4, communication: 4 }, recommendation: "Hire", strengths: "Careful, methodical.", concerns: "Depth on data structures is average.", submittedOn: "2026-09-01" },
  { id: "IEV-011", interviewId: "INT-006", panelMemberId: "EMP-3", scores: { overall: 4, growth: 4, values: 4 }, recommendation: "Hire", strengths: "Fits the graduate cohort well.", concerns: "None material.", submittedOn: "2026-09-09" },
  { id: "IEV-012", interviewId: "INT-006", panelMemberId: "EMP-4", scores: { overall: 4, growth: 4, values: 4 }, recommendation: "Hire", strengths: "Realistic expectations; keen on the mentoring structure.", concerns: "None.", submittedOn: "2026-09-10" },

  { id: "IEV-013", interviewId: "INT-007", panelMemberId: "EMP-1", scores: { domain: 5, leadership: 5, stakeholder: 4, communication: 4 }, recommendation: "Strong hire", strengths: "Eleven years of directly comparable commercial ownership.", concerns: "Salary expectation is above the approved range.", submittedOn: "2026-08-20" },
  { id: "IEV-014", interviewId: "INT-007", panelMemberId: "EMP-4", scores: { domain: 4, leadership: 5, stakeholder: 5, communication: 4 }, recommendation: "Strong hire", strengths: "Handled the stakeholder scenario convincingly.", concerns: "Expectation gap to resolve before an offer.", submittedOn: "2026-08-21" },
  { id: "IEV-015", interviewId: "INT-007", panelMemberId: "EMP-5", scores: { domain: 4, leadership: 4, stakeholder: 4, communication: 4 }, recommendation: "Hire", strengths: "Understands the Commercial book as it stands.", concerns: "Would need the Service Operations handover documented.", submittedOn: "2026-08-22" },
  { id: "IEV-016", interviewId: "INT-008", panelMemberId: "EMP-1", scores: { overall: 5, growth: 4, values: 4 }, recommendation: "Strong hire", strengths: "Best candidate seen for this role.", concerns: "Range exception required.", submittedOn: "2026-09-04" },
  { id: "IEV-017", interviewId: "INT-008", panelMemberId: "EMP-4", scores: { overall: 4, growth: 4, values: 4 }, recommendation: "Hire", strengths: "Credible and prepared.", concerns: "Sixty-day notice period.", submittedOn: "2026-09-05" },

  { id: "IEV-018", interviewId: "INT-009", panelMemberId: "EMP-3", scores: { depth: 3, problem: 4, practice: 3, communication: 4 }, recommendation: "Hire", strengths: "Node.js exposure beyond coursework.", concerns: "Engineering practice needs structure.", submittedOn: "2026-09-01" },
  { id: "IEV-019", interviewId: "INT-009", panelMemberId: "EMP-7", scores: { depth: 3, problem: 3, practice: 3, communication: 4 }, recommendation: "Hold", strengths: "Willing and curious.", concerns: "Weaker than the other graduate candidates on depth.", submittedOn: "2026-09-02" },
  { id: "IEV-020", interviewId: "INT-010", panelMemberId: "EMP-3", scores: { overall: 3, growth: 4, values: 4 }, recommendation: "Hold", strengths: "Coachable.", concerns: "Only two graduate positions; ranked third.", submittedOn: "2026-09-15" },
  { id: "IEV-021", interviewId: "INT-010", panelMemberId: "EMP-4", scores: { overall: 3, growth: 4, values: 4 }, recommendation: "Hold", strengths: "Good attitude.", concerns: "Hold against the 2027 intake rather than reject.", submittedOn: "2026-09-16" },

  { id: "IEV-022", interviewId: "INT-014", panelMemberId: "EMP-3", scores: { overall: 4, growth: 4, values: 4 }, recommendation: "Hire", strengths: "Five years of relevant delivery work; ready for the band.", concerns: "Ranked second behind the referred candidate.", submittedOn: "2026-06-11" },
  { id: "IEV-023", interviewId: "INT-014", panelMemberId: "EMP-4", scores: { overall: 4, growth: 3, values: 4 }, recommendation: "Hire", strengths: "Credible and well prepared.", concerns: "Salary expectation at the top of the range.", submittedOn: "2026-06-12" },
  { id: "IEV-024", interviewId: "INT-015", panelMemberId: "EMP-3", scores: { overall: 3, growth: 4, values: 4 }, recommendation: "Hire", strengths: "Solid fundamentals.", concerns: "Three years; the least experienced of the three finalists.", submittedOn: "2026-06-11" },
  { id: "IEV-025", interviewId: "INT-015", panelMemberId: "EMP-4", scores: { overall: 4, growth: 4, values: 4 }, recommendation: "Hire", strengths: "Keen and pragmatic.", concerns: "Ranked third.", submittedOn: "2026-06-12" },
  { id: "IEV-026", interviewId: "INT-016", panelMemberId: "EMP-3", scores: { overall: 4, growth: 4, values: 4 }, recommendation: "Hire", strengths: "Database fundamentals stronger than the cohort average.", concerns: "None material for the internship band.", submittedOn: "2026-09-02" },
  { id: "IEV-027", interviewId: "INT-016", panelMemberId: "EMP-4", scores: { overall: 4, growth: 4, values: 3 }, recommendation: "Hire", strengths: "Clear on the programme terms.", concerns: "Quieter in the discussion.", submittedOn: "2026-09-03" },
];

export function evaluationsFor(interviewId: string): readonly InterviewEvaluation[] {
  return interviewEvaluations.filter((row) => row.interviewId === interviewId);
}

/** Every criterion in a template must be scored; a partial evaluation is not one. */
export function evaluationIsComplete(row: InterviewEvaluation): boolean {
  const kind = interview(row.interviewId)?.kind;
  if (!kind) return false;
  return evaluationTemplates[kind].every((criterion) => {
    const score = row.scores[criterion.id];
    return typeof score === "number" && score >= 1 && score <= RATING_SCALE_MAX;
  });
}

/**
 * Weighted score out of 100. Weights come from the interview kind's template,
 * not from the evaluation, so one reviewer cannot reweight their own scorecard.
 */
export function weightedScore(row: InterviewEvaluation): number {
  const kind = interview(row.interviewId)?.kind;
  if (!kind) return 0;
  const template = evaluationTemplates[kind];
  const total = template.reduce((sum, criterion) => {
    const score = row.scores[criterion.id] ?? 0;
    return sum + (score / RATING_SCALE_MAX) * criterion.weight;
  }, 0);
  return Math.round(total * 10) / 10;
}

/** Mean weighted score of the evaluations submitted for one interview. */
export function panelScore(interviewId: string): number | null {
  const rows = evaluationsFor(interviewId);
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => sum + weightedScore(row), 0);
  return Math.round((total / rows.length) * 10) / 10;
}

export interface SelectionReadiness {
  applicationId: string;
  interviewsScheduled: number;
  interviewsCompleted: number;
  evaluationsSubmitted: number;
  evaluationsRequired: number;
  averageScore: number | null;
  threshold: number;
  assessmentsOutstanding: number;
  assessmentsFailed: number;
  ready: boolean;
  blockers: readonly string[];
}

/**
 * Whether an application may be moved to Selected, and if not, why not. The
 * screen renders these blockers verbatim rather than greying a button out
 * with no explanation.
 */
export function selectionReadiness(applicationId: string): SelectionReadiness {
  const rows = interviewsFor(applicationId);
  const live = rows.filter((row) => row.status !== "Cancelled");
  const completed = live.filter((row) => row.status === "Completed");
  const evaluations = completed.flatMap((row) => evaluationsFor(row.id));
  const scores = completed.map((row) => panelScore(row.id)).filter((value): value is number => value !== null);
  const averageScore = scores.length > 0
    ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10
    : null;

  const mandatory = assessmentsFor(applicationId).filter((row) => row.mandatory);
  const outstanding = mandatory.filter((row) => row.status === "Assigned" || row.status === "Submitted");
  const failed = mandatory.filter((row) => row.status === "Failed");

  const blockers: string[] = [];
  if (live.length === 0) blockers.push("No interview has been held.");
  if (live.length > completed.length) blockers.push(`${live.length - completed.length} interview(s) not completed.`);
  if (evaluations.length < recruitmentPolicy.minPanelEvaluations) {
    blockers.push(`${evaluations.length} of ${recruitmentPolicy.minPanelEvaluations} panel evaluations submitted.`);
  }
  if (evaluations.some((row) => !evaluationIsComplete(row))) blockers.push("A submitted evaluation is incomplete.");
  if (averageScore !== null && averageScore < recruitmentPolicy.selectionScoreThreshold) {
    blockers.push(`Panel average ${averageScore} is below the ${recruitmentPolicy.selectionScoreThreshold} threshold.`);
  }
  if (outstanding.length > 0) blockers.push(`${outstanding.length} mandatory assessment(s) not decided.`);
  if (failed.length > 0) blockers.push(`${failed.length} mandatory assessment(s) failed.`);

  return {
    applicationId,
    interviewsScheduled: live.length,
    interviewsCompleted: completed.length,
    evaluationsSubmitted: evaluations.length,
    evaluationsRequired: recruitmentPolicy.minPanelEvaluations,
    averageScore,
    threshold: recruitmentPolicy.selectionScoreThreshold,
    assessmentsOutstanding: outstanding.length,
    assessmentsFailed: failed.length,
    ready: blockers.length === 0,
    blockers,
  };
}

/**
 * Whether an application may move to a stage. The transition table decides
 * shape; these gates decide substance.
 */
export function canAdvanceApplication(row: Application, to: ApplicationStage): boolean {
  if (!applicationTransitions[row.stage].includes(to)) return false;
  if (to === "Rejected" || to === "Withdrawn") return true;
  if (to === "Shortlisted") {
    if (row.screenedOn === null) return false;
    if (row.internal && recruitmentPolicy.internalApplicantsMustBeConfirmed) {
      return employee(candidate(row.candidateId)?.employeeId ?? "")?.status === "Confirmed";
    }
    return true;
  }
  if (to === "Interview") return interviewsFor(row.id).some((entry) => entry.status !== "Cancelled");
  if (to === "Evaluation") {
    const live = interviewsFor(row.id).filter((entry) => entry.status !== "Cancelled");
    return live.length > 0 && live.every((entry) => entry.status === "Completed");
  }
  if (to === "Selected") return selectionReadiness(row.id).ready;
  if (to === "Hired") {
    const offer = offerForApplication(row.id);
    return offer !== undefined && offer.status === "Accepted";
  }
  return true;
}

/** Why an internal applicant is held, when they are. */
export function internalApplicantBlocker(row: Application): string | null {
  if (!row.internal || !recruitmentPolicy.internalApplicantsMustBeConfirmed) return null;
  const linked = employee(candidate(row.candidateId)?.employeeId ?? "");
  if (!linked) return "Internal applicant is not linked to an employee record.";
  if (linked.status === "Confirmed") return null;
  return `Internal applicant status is ${linked.status}; policy requires a confirmed employee.`;
}

/* ------------------------------------------------------------------ */
/* Assessments                                                        */
/* ------------------------------------------------------------------ */

export type AssessmentKind = "Aptitude" | "Technical test" | "Case study" | "Language" | "Background check";

export type AssessmentStatus = "Assigned" | "Submitted" | "Passed" | "Failed" | "Waived";

export interface Assessment {
  id: string;
  applicationId: string;
  kind: AssessmentKind;
  mandatory: boolean;
  assignedOn: string;
  dueOn: string;
  score: number | null;
  maxScore: number;
  passMark: number;
  status: AssessmentStatus;
  evaluatedBy: string | null;
  note: string;
}

export const assessments: readonly Assessment[] = [
  { id: "ASM-001", applicationId: "APL-001", kind: "Technical test", mandatory: true, assignedOn: "2026-08-22", dueOn: "2026-08-26", score: 82, maxScore: 100, passMark: 60, status: "Passed", evaluatedBy: "Bilal Khan", note: "Strong on data structures." },
  { id: "ASM-002", applicationId: "APL-001", kind: "Background check", mandatory: true, assignedOn: "2026-09-04", dueOn: "2026-09-12", score: null, maxScore: 0, passMark: 0, status: "Passed", evaluatedBy: "Sana Iqbal", note: "Education verified with the university." },
  { id: "ASM-003", applicationId: "APL-002", kind: "Technical test", mandatory: true, assignedOn: "2026-05-31", dueOn: "2026-06-04", score: 91, maxScore: 100, passMark: 60, status: "Passed", evaluatedBy: "Bilal Khan", note: "Top score in the 2026 intake." },
  { id: "ASM-004", applicationId: "APL-002", kind: "Background check", mandatory: true, assignedOn: "2026-06-13", dueOn: "2026-06-20", score: null, maxScore: 0, passMark: 0, status: "Passed", evaluatedBy: "Sana Iqbal", note: "Previous employer confirmed the experience letter." },
  { id: "ASM-005", applicationId: "APL-003", kind: "Technical test", mandatory: true, assignedOn: "2026-08-25", dueOn: "2026-08-29", score: 74, maxScore: 100, passMark: 60, status: "Passed", evaluatedBy: "Bilal Khan", note: "Good testing section." },
  { id: "ASM-006", applicationId: "APL-003", kind: "Background check", mandatory: true, assignedOn: "2026-09-12", dueOn: "2026-09-22", score: null, maxScore: 0, passMark: 0, status: "Passed", evaluatedBy: "Sana Iqbal", note: "Education verified." },
  { id: "ASM-007", applicationId: "APL-004", kind: "Case study", mandatory: true, assignedOn: "2026-08-14", dueOn: "2026-08-19", score: 88, maxScore: 100, passMark: 65, status: "Passed", evaluatedBy: "Omar Siddiqui", note: "Commercial plan was credible and costed." },
  { id: "ASM-008", applicationId: "APL-004", kind: "Background check", mandatory: true, assignedOn: "2026-09-05", dueOn: "2026-09-15", score: null, maxScore: 0, passMark: 0, status: "Passed", evaluatedBy: "Sana Iqbal", note: "Two references confirmed." },
  { id: "ASM-009", applicationId: "APL-005", kind: "Technical test", mandatory: true, assignedOn: "2026-08-27", dueOn: "2026-08-31", score: 66, maxScore: 100, passMark: 60, status: "Passed", evaluatedBy: "Bilal Khan", note: "Marginal pass." },
  { id: "ASM-010", applicationId: "APL-005", kind: "Background check", mandatory: true, assignedOn: "2026-09-16", dueOn: "2026-09-26", score: null, maxScore: 0, passMark: 0, status: "Assigned", evaluatedBy: null, note: "Awaiting university response." },
  { id: "ASM-011", applicationId: "APL-006", kind: "Case study", mandatory: true, assignedOn: "2026-09-15", dueOn: "2026-09-21", score: null, maxScore: 100, passMark: 65, status: "Submitted", evaluatedBy: null, note: "Submitted; panel to mark at the interview." },
  { id: "ASM-012", applicationId: "APL-008", kind: "Technical test", mandatory: true, assignedOn: "2026-08-29", dueOn: "2026-09-02", score: 41, maxScore: 100, passMark: 60, status: "Failed", evaluatedBy: "Bilal Khan", note: "Below the pass mark; application rejected on this basis." },
  { id: "ASM-013", applicationId: "APL-011", kind: "Technical test", mandatory: true, assignedOn: "2026-06-03", dueOn: "2026-06-07", score: 79, maxScore: 100, passMark: 60, status: "Passed", evaluatedBy: "Bilal Khan", note: "Second-ranked in the round." },
  { id: "ASM-014", applicationId: "APL-012", kind: "Technical test", mandatory: true, assignedOn: "2026-06-04", dueOn: "2026-06-08", score: 71, maxScore: 100, passMark: 60, status: "Passed", evaluatedBy: "Bilal Khan", note: "Solid." },
  { id: "ASM-015", applicationId: "APL-013", kind: "Language", mandatory: false, assignedOn: "2026-09-10", dueOn: "2026-09-20", score: 92, maxScore: 100, passMark: 70, status: "Passed", evaluatedBy: "Sana Iqbal", note: "Optional; client-facing role." },
  { id: "ASM-016", applicationId: "APL-014", kind: "Technical test", mandatory: true, assignedOn: "2026-08-23", dueOn: "2026-08-27", score: 77, maxScore: 100, passMark: 60, status: "Passed", evaluatedBy: "Bilal Khan", note: "Strong database section." },
  { id: "ASM-017", applicationId: "APL-014", kind: "Background check", mandatory: true, assignedOn: "2026-09-03", dueOn: "2026-09-11", score: null, maxScore: 0, passMark: 0, status: "Passed", evaluatedBy: "Sana Iqbal", note: "Education verified." },
  { id: "ASM-018", applicationId: "APL-011", kind: "Background check", mandatory: true, assignedOn: "2026-06-12", dueOn: "2026-06-19", score: null, maxScore: 0, passMark: 0, status: "Passed", evaluatedBy: "Sana Iqbal", note: "Previous employer confirmed." },
  { id: "ASM-019", applicationId: "APL-012", kind: "Background check", mandatory: true, assignedOn: "2026-06-12", dueOn: "2026-06-19", score: null, maxScore: 0, passMark: 0, status: "Passed", evaluatedBy: "Sana Iqbal", note: "Previous employer confirmed." },
];

export function assessmentsFor(applicationId: string): readonly Assessment[] {
  return assessments.filter((row) => row.applicationId === applicationId);
}

/** A scored assessment's decision must agree with its own pass mark. */
export function assessmentDecisionIsConsistent(row: Assessment): boolean {
  if (row.score === null) return true;
  if (row.status === "Passed") return row.score >= row.passMark;
  if (row.status === "Failed") return row.score < row.passMark;
  return true;
}

/* ------------------------------------------------------------------ */
/* 5. Offer management                                                */
/* ------------------------------------------------------------------ */

export type OfferStatus = "Draft" | "Generated" | "Sent" | "Accepted" | "Rejected" | "Expired" | "Withdrawn";

/**
 * Selected → Draft → Generated → Sent → Accepted, then the employee is
 * created. Rejected, Expired and Withdrawn are terminal and retained.
 */
export const offerTransitions: Readonly<Record<OfferStatus, readonly OfferStatus[]>> = {
  "Draft": ["Generated", "Withdrawn"],
  "Generated": ["Sent", "Draft", "Withdrawn"],
  "Sent": ["Accepted", "Rejected", "Expired", "Withdrawn"],
  "Accepted": [],
  "Rejected": [],
  "Expired": [],
  "Withdrawn": [],
};

export interface Offer {
  id: string;
  reference: string;
  applicationId: string;
  candidateId: string;
  openingId: string;
  requisitionId: string;
  status: OfferStatus;
  /* Terms. Each one becomes a field of the employee's first assignment. */
  designationId: string;
  jobGradeId: string;
  departmentId: string;
  branchId: string;
  employmentTypeId: string;
  employeeCategoryId: string;
  workLocationId: string;
  costCentreId: string;
  reportingManagerId: string;
  proposedGross: number;
  currency: string;
  joiningDate: string;
  probationMonths: number;
  noticePeriodDays: number;
  validUntil: string;
  generatedBy: string;
  generatedOn: string;
  sentOn: string | null;
  respondedOn: string | null;
  /** Named authorisation for pay outside the approved requisition range. */
  rangeExceptionApprovedBy: string | null;
  rangeExceptionReason: string;
  /** Set when the offer has been converted. The candidate record is kept. */
  employeeId: string | null;
  note: string;
}

export const offers: readonly Offer[] = [
  {
    id: "OFR-001", reference: "OFR-2026-0011", applicationId: "APL-002", candidateId: "CAN-002", openingId: "JOB-001", requisitionId: "MRQ-001",
    status: "Accepted", designationId: "DSG-007", jobGradeId: "GRD-005", departmentId: "ORG-DP-003", branchId: "ORG-BR-001",
    employmentTypeId: "EMT-002", employeeCategoryId: "CAT-002", workLocationId: "LOC-004", costCentreId: "CCT-003", reportingManagerId: "EMP-3",
    proposedGross: money(285000), currency: "PKR", joiningDate: "2026-07-01", probationMonths: 6, noticePeriodDays: 30, validUntil: "2026-06-25",
    generatedBy: "Sana Iqbal", generatedOn: "2026-06-18", sentOn: "2026-06-18", respondedOn: "2026-06-21",
    rangeExceptionApprovedBy: null, rangeExceptionReason: "", employeeId: "EMP-7",
    note: "Second offer on this opening: issued after the first-choice candidate declined. Accepted; joined on 01 July 2026.",
  },
  {
    id: "OFR-002", reference: "OFR-2026-0019", applicationId: "APL-001", candidateId: "CAN-001", openingId: "JOB-002", requisitionId: "MRQ-002",
    status: "Accepted", designationId: "DSG-007", jobGradeId: "GRD-006", departmentId: "ORG-DP-007", branchId: "ORG-BR-002",
    employmentTypeId: "EMT-005", employeeCategoryId: "CAT-004", workLocationId: "LOC-002", costCentreId: "CCT-003", reportingManagerId: "EMP-3",
    proposedGross: money(145000), currency: "PKR", joiningDate: "2026-09-21", probationMonths: 6, noticePeriodDays: 14, validUntil: "2026-09-17",
    generatedBy: "Sana Iqbal", generatedOn: "2026-09-10", sentOn: "2026-09-10", respondedOn: "2026-09-14",
    rangeExceptionApprovedBy: null, rangeExceptionReason: "", employeeId: "EMP-8", note: "Accepted; employee record created from this offer and pending HR Manager approval.",
  },
  {
    id: "OFR-003", reference: "OFR-2026-0021", applicationId: "APL-003", candidateId: "CAN-003", openingId: "JOB-002", requisitionId: "MRQ-002",
    status: "Sent", designationId: "DSG-007", jobGradeId: "GRD-006", departmentId: "ORG-DP-007", branchId: "ORG-BR-002",
    employmentTypeId: "EMT-005", employeeCategoryId: "CAT-004", workLocationId: "LOC-002", costCentreId: "CCT-003", reportingManagerId: "EMP-3",
    proposedGross: money(150000), currency: "PKR", joiningDate: "2026-10-01", probationMonths: 6, noticePeriodDays: 14, validUntil: "2026-09-25",
    generatedBy: "Sana Iqbal", generatedOn: "2026-09-17", sentOn: "2026-09-17", respondedOn: null,
    rangeExceptionApprovedBy: null, rangeExceptionReason: "", employeeId: null, note: "Second graduate position. Awaiting the candidate's response.",
  },
  {
    id: "OFR-004", reference: "OFR-2026-0020", applicationId: "APL-004", candidateId: "CAN-004", openingId: "JOB-003", requisitionId: "MRQ-003",
    status: "Draft", designationId: "DSG-008", jobGradeId: "GRD-003", departmentId: "ORG-DP-005", branchId: "ORG-BR-002",
    employmentTypeId: "EMT-001", employeeCategoryId: "CAT-001", workLocationId: "LOC-002", costCentreId: "CCT-005", reportingManagerId: "EMP-1",
    proposedGross: money(560000), currency: "PKR", joiningDate: "2026-11-03", probationMonths: 6, noticePeriodDays: 60, validUntil: "2026-09-30",
    generatedBy: "Sana Iqbal", generatedOn: "2026-09-16", sentOn: null, respondedOn: null,
    rangeExceptionApprovedBy: null, rangeExceptionReason: "Candidate expectation is Rs 560,000 against an approved range topping at Rs 520,000.",
    employeeId: null, note: "Cannot be sent until a management range exception is recorded.",
  },
  {
    id: "OFR-005", reference: "OFR-2026-0012", applicationId: "APL-011", candidateId: "CAN-010", openingId: "JOB-001", requisitionId: "MRQ-001",
    status: "Rejected", designationId: "DSG-007", jobGradeId: "GRD-005", departmentId: "ORG-DP-003", branchId: "ORG-BR-001",
    employmentTypeId: "EMT-002", employeeCategoryId: "CAT-002", workLocationId: "LOC-001", costCentreId: "CCT-003", reportingManagerId: "EMP-3",
    proposedGross: money(275000), currency: "PKR", joiningDate: "2026-07-01", probationMonths: 6, noticePeriodDays: 30, validUntil: "2026-06-23",
    generatedBy: "Sana Iqbal", generatedOn: "2026-06-16", sentOn: "2026-06-16", respondedOn: "2026-06-17",
    rangeExceptionApprovedBy: null, rangeExceptionReason: "", employeeId: null,
    note: "First choice. Declined: accepted a counter-offer from the current employer. Retained as recruitment history.",
  },
  {
    id: "OFR-006", reference: "OFR-2026-0013", applicationId: "APL-012", candidateId: "CAN-011", openingId: "JOB-001", requisitionId: "MRQ-001",
    status: "Withdrawn", designationId: "DSG-007", jobGradeId: "GRD-005", departmentId: "ORG-DP-003", branchId: "ORG-BR-001",
    employmentTypeId: "EMT-002", employeeCategoryId: "CAT-002", workLocationId: "LOC-001", costCentreId: "CCT-003", reportingManagerId: "EMP-3",
    proposedGross: money(255000), currency: "PKR", joiningDate: "2026-07-15", probationMonths: 6, noticePeriodDays: 30, validUntil: "2026-06-26",
    generatedBy: "Sana Iqbal", generatedOn: "2026-06-19", sentOn: null, respondedOn: null,
    rangeExceptionApprovedBy: null, rangeExceptionReason: "", employeeId: null,
    note: "Third finalist. Prepared as a fallback and withdrawn once the second-choice candidate accepted. Never sent; retained as recruitment history.",
  },
  {
    id: "OFR-007", reference: "OFR-2026-0018", applicationId: "APL-014", candidateId: "CAN-013", openingId: "JOB-005", requisitionId: "MRQ-002",
    status: "Expired", designationId: "DSG-007", jobGradeId: "GRD-006", departmentId: "ORG-DP-007", branchId: "ORG-BR-002",
    employmentTypeId: "EMT-005", employeeCategoryId: "CAT-004", workLocationId: "LOC-002", costCentreId: "CCT-003", reportingManagerId: "EMP-3",
    proposedGross: money(148000), currency: "PKR", joiningDate: "2026-10-01", probationMonths: 6, noticePeriodDays: 14, validUntil: "2026-09-16",
    generatedBy: "Sana Iqbal", generatedOn: "2026-09-11", sentOn: "2026-09-11", respondedOn: null,
    rangeExceptionApprovedBy: null, rangeExceptionReason: "", employeeId: null,
    note: "Third graduate position. No response by the validity date; the position was then deferred to the 2027 intake and the opening cancelled.",
  },
];

export function offer(id: string): Offer | undefined {
  return offers.find((row) => row.id === id);
}

export function offerForApplication(applicationId: string): Offer | undefined {
  return offers.find((row) => row.applicationId === applicationId);
}

export function canTransitionOffer(from: OfferStatus, to: OfferStatus): boolean {
  return offerTransitions[from].includes(to);
}

/** An offer may only be raised for an application that reached Selected. */
export function canGenerateOffer(applicationId: string): boolean {
  const row = application(applicationId);
  if (!row) return false;
  if (row.stage !== "Selected") return false;
  return openingRemaining(row.openingId) > 0;
}

export function offerWithinRange(row: Offer): boolean {
  const req = requisition(row.requisitionId);
  if (!req) return false;
  return row.proposedGross >= req.salaryRangeMin && row.proposedGross <= req.salaryRangeMax;
}

/**
 * An offer outside the approved range needs a named exception before it can be
 * sent. The candidate is never told a number the company has not authorised.
 */
export function canSendOffer(row: Offer): boolean {
  if (!canTransitionOffer(row.status, "Sent")) return false;
  if (offerWithinRange(row)) return true;
  return row.rangeExceptionApprovedBy !== null;
}

export function offerBlockers(row: Offer): readonly string[] {
  const blockers: string[] = [];
  const req = requisition(row.requisitionId);
  if (!req) blockers.push("Offer is not linked to a requisition.");
  else if (req.status !== "Approved") blockers.push(`Requisition ${req.reference} is ${req.status}, not Approved.`);
  if (!offerWithinRange(row) && row.rangeExceptionApprovedBy === null) {
    blockers.push("Proposed pay is outside the approved range and no management exception is recorded.");
  }
  const live = row.status === "Draft" || row.status === "Generated" || row.status === "Sent";
  if (live && openingRemaining(row.openingId) === 0) {
    blockers.push("Every position on this opening is already filled.");
  }
  const app = application(row.applicationId);
  if (app && app.stage !== "Selected" && app.stage !== "Hired") {
    blockers.push(`Application is at ${app.stage}; an offer requires Selected.`);
  }
  return blockers;
}

/* ------------------------------------------------------------------ */
/* Candidate → employee conversion                                    */
/* ------------------------------------------------------------------ */

export interface RecruitmentLink {
  requisitionId: string;
  openingId: string;
  candidateId: string;
  applicationId: string;
  offerId: string;
}

export interface DraftField {
  field: string;
  label: string;
  value: string;
  /** Where the value came from. Nothing in a draft is typed in by hand. */
  source: string;
}

export interface EmployeeDraft {
  offerId: string;
  /** Every carried field, with the record and field it was read from. */
  fields: readonly DraftField[];
  assignment: {
    effectiveFrom: string;
    branchId: string;
    departmentId: string;
    designationId: string;
    jobGradeId: string;
    costCentreId: string;
    workLocationId: string;
    employmentTypeId: string;
    employeeCategoryId: string;
    reportingManagerId: string;
    changeReason: string;
  };
  recruitment: RecruitmentLink;
  /** Data recruitment does not hold. Named rather than invented. */
  pending: readonly string[];
  status: "Draft";
}

/**
 * Builds the employee the offer implies. Nothing is re-keyed: every field
 * names the candidate or offer field it was read from, and anything
 * recruitment legitimately does not know — national identity number, tax
 * number, bank account, emergency contact — is listed as pending rather than
 * silently blank or invented.
 */
export function buildEmployeeDraft(offerId: string): EmployeeDraft | null {
  const row = offer(offerId);
  if (!row) return null;
  const person = candidate(row.candidateId);
  const app = application(row.applicationId);
  if (!person || !app) return null;

  const probationEnd = addMonths(row.joiningDate, row.probationMonths);
  const fields: readonly DraftField[] = [
    { field: "firstName", label: "First name", value: person.firstName, source: `Candidate ${person.candidateNumber} · firstName` },
    { field: "lastName", label: "Last name", value: person.lastName, source: `Candidate ${person.candidateNumber} · lastName` },
    { field: "preferredName", label: "Preferred name", value: person.firstName, source: `Candidate ${person.candidateNumber} · firstName` },
    { field: "personalEmail", label: "Personal email", value: person.email, source: `Candidate ${person.candidateNumber} · email` },
    { field: "mobile", label: "Mobile", value: person.mobile, source: `Candidate ${person.candidateNumber} · mobile` },
    { field: "city", label: "City", value: person.city, source: `Candidate ${person.candidateNumber} · city` },
    { field: "country", label: "Country", value: person.country, source: `Candidate ${person.candidateNumber} · country` },
    { field: "joinedOn", label: "Joined on", value: row.joiningDate, source: `Offer ${row.reference} · joiningDate` },
    { field: "probationEndsOn", label: "Probation ends on", value: probationEnd, source: `Offer ${row.reference} · joiningDate + probationMonths` },
    { field: "noticePeriodDays", label: "Notice period (days)", value: String(row.noticePeriodDays), source: `Offer ${row.reference} · noticePeriodDays` },
    { field: "status", label: "Status", value: "Draft", source: "Employee lifecycle — a new record always starts at Draft" },
  ];

  return {
    offerId: row.id,
    fields,
    assignment: {
      effectiveFrom: row.joiningDate,
      branchId: row.branchId,
      departmentId: row.departmentId,
      designationId: row.designationId,
      jobGradeId: row.jobGradeId,
      costCentreId: row.costCentreId,
      workLocationId: row.workLocationId,
      employmentTypeId: row.employmentTypeId,
      employeeCategoryId: row.employeeCategoryId,
      reportingManagerId: row.reportingManagerId,
      changeReason: "Initial appointment",
    },
    recruitment: {
      requisitionId: row.requisitionId,
      openingId: row.openingId,
      candidateId: row.candidateId,
      applicationId: row.applicationId,
      offerId: row.id,
    },
    pending: [
      "National identity number",
      "Tax identifier and filing status",
      "Bank account for salary payment",
      "Emergency contact",
      "Signed employment contract document",
    ],
    status: "Draft",
  };
}

/** An employee may only be created from an accepted offer. */
export function canCreateEmployee(offerId: string): boolean {
  const row = offer(offerId);
  return row !== undefined && row.status === "Accepted" && row.employeeId === null;
}

/** The recruitment trail behind an employee, or null if they were not hired through it. */
export function recruitmentTrailFor(employeeId: string): RecruitmentLink | null {
  const row = offers.find((entry) => entry.employeeId === employeeId);
  if (!row) return null;
  return {
    requisitionId: row.requisitionId,
    openingId: row.openingId,
    candidateId: row.candidateId,
    applicationId: row.applicationId,
    offerId: row.id,
  };
}

/** Adds whole months without drifting into an invalid day. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const total = (year * 12) + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Recruitment audit trail                                            */
/* ------------------------------------------------------------------ */

export type RecruitmentEntity = "Requisition" | "Opening" | "Application" | "Interview" | "Offer";

export interface RecruitmentEvent {
  id: string;
  entity: RecruitmentEntity;
  entityId: string;
  at: string;
  actor: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string;
}

/**
 * Append-only. There is no function in this module that removes a row from it,
 * which is the whole point: a rejected candidate, a cancelled requisition and
 * a declined offer are all evidence of how a hiring decision was reached.
 */
export const recruitmentEvents: readonly RecruitmentEvent[] = [
  { id: "REV-A001", entity: "Requisition", entityId: "MRQ-001", at: "2026-05-04 09:12", actor: "Bilal Khan", action: "Created", fromStatus: null, toStatus: "Draft", note: "Delivery growth headcount." },
  { id: "REV-A002", entity: "Requisition", entityId: "MRQ-001", at: "2026-05-05 10:02", actor: "Bilal Khan", action: "Submitted", fromStatus: "Draft", toStatus: "Department submission", note: "" },
  { id: "REV-A003", entity: "Requisition", entityId: "MRQ-001", at: "2026-05-07 14:40", actor: "Sana Iqbal", action: "Reviewed", fromStatus: "HR review", toStatus: "Budget review", note: "New position, so the budget gate applies." },
  { id: "REV-A004", entity: "Requisition", entityId: "MRQ-001", at: "2026-05-20 11:05", actor: "Omar Siddiqui", action: "Approved", fromStatus: "Management approval", toStatus: "Approved", note: "One position." },
  { id: "REV-A005", entity: "Opening", entityId: "JOB-001", at: "2026-05-22 09:00", actor: "Sana Iqbal", action: "Posted", fromStatus: null, toStatus: "Open", note: "Company site and LinkedIn." },
  { id: "REV-A006", entity: "Application", entityId: "APL-002", at: "2026-05-28 16:18", actor: "Zainab Farooq", action: "Applied", fromStatus: null, toStatus: "Application", note: "Referral from Bilal Khan." },
  { id: "REV-A007", entity: "Application", entityId: "APL-002", at: "2026-05-30 11:22", actor: "Sana Iqbal", action: "Screened", fromStatus: "Application", toStatus: "Screening", note: "" },
  { id: "REV-A008", entity: "Application", entityId: "APL-002", at: "2026-06-02 09:40", actor: "Sana Iqbal", action: "Shortlisted", fromStatus: "Screening", toStatus: "Shortlisted", note: "" },
  { id: "REV-A009", entity: "Interview", entityId: "INT-003", at: "2026-06-05 12:30", actor: "Bilal Khan", action: "Completed", fromStatus: "Scheduled", toStatus: "Completed", note: "Two evaluations submitted." },
  { id: "REV-A010", entity: "Application", entityId: "APL-002", at: "2026-06-16 10:15", actor: "Bilal Khan", action: "Selected", fromStatus: "Evaluation", toStatus: "Selected", note: "Panel average above threshold." },
  { id: "REV-A011", entity: "Offer", entityId: "OFR-001", at: "2026-06-18 09:05", actor: "Sana Iqbal", action: "Sent", fromStatus: "Generated", toStatus: "Sent", note: "Within the approved range." },
  { id: "REV-A012", entity: "Offer", entityId: "OFR-001", at: "2026-06-21 13:44", actor: "Zainab Farooq", action: "Accepted", fromStatus: "Sent", toStatus: "Accepted", note: "Joining 01 July 2026." },
  { id: "REV-A013", entity: "Application", entityId: "APL-002", at: "2026-06-24 08:30", actor: "Sana Iqbal", action: "Converted", fromStatus: "Selected", toStatus: "Hired", note: "Employee EMP-000007 created from OFR-2026-0011." },
  { id: "REV-A014", entity: "Offer", entityId: "OFR-005", at: "2026-06-17 17:02", actor: "Saad Yousuf", action: "Declined", fromStatus: "Sent", toStatus: "Rejected", note: "Counter-offer from the current employer." },
  { id: "REV-A015", entity: "Offer", entityId: "OFR-006", at: "2026-06-22 09:15", actor: "Sana Iqbal", action: "Withdrawn", fromStatus: "Generated", toStatus: "Withdrawn", note: "Second-choice candidate accepted; the single approved position is filled." },
  { id: "REV-A027", entity: "Offer", entityId: "OFR-007", at: "2026-09-17 00:05", actor: "System", action: "Expired", fromStatus: "Sent", toStatus: "Expired", note: "No response by 16 September 2026." },
  { id: "REV-A028", entity: "Application", entityId: "APL-014", at: "2026-09-11 10:20", actor: "Bilal Khan", action: "Selected", fromStatus: "Evaluation", toStatus: "Selected", note: "Third graduate position." },
  { id: "REV-A029", entity: "Application", entityId: "APL-011", at: "2026-06-16 10:20", actor: "Bilal Khan", action: "Selected", fromStatus: "Evaluation", toStatus: "Selected", note: "First choice of three finalists." },
  { id: "REV-A030", entity: "Application", entityId: "APL-012", at: "2026-06-16 10:25", actor: "Bilal Khan", action: "Selected", fromStatus: "Evaluation", toStatus: "Selected", note: "Third of three finalists; fallback." },
  { id: "REV-A016", entity: "Requisition", entityId: "MRQ-007", at: "2026-09-02 15:20", actor: "Mariam Ali", action: "Rejected", fromStatus: "Budget review", toStatus: "Rejected", note: "Not funded in 2026." },
  { id: "REV-A017", entity: "Requisition", entityId: "MRQ-008", at: "2026-07-06 11:11", actor: "Sana Iqbal", action: "Cancelled", fromStatus: "HR review", toStatus: "Cancelled", note: "Karachi office closing." },
  { id: "REV-A018", entity: "Application", entityId: "APL-008", at: "2026-09-04 10:00", actor: "Sana Iqbal", action: "Rejected", fromStatus: "Screening", toStatus: "Rejected", note: "Technical assessment 41 against a pass mark of 60." },
  { id: "REV-A019", entity: "Application", entityId: "APL-010", at: "2026-08-14 09:30", actor: "Sana Iqbal", action: "Withdrawn", fromStatus: "Screening", toStatus: "Withdrawn", note: "Candidate unwilling to relocate." },
  { id: "REV-A020", entity: "Opening", entityId: "JOB-004", at: "2026-08-28 16:00", actor: "Mariam Ali", action: "Held", fromStatus: "Open", toStatus: "On hold", note: "Q4 budget review of the start date." },
  { id: "REV-A021", entity: "Opening", entityId: "JOB-005", at: "2026-09-01 09:20", actor: "Sana Iqbal", action: "Cancelled", fromStatus: "Open", toStatus: "Cancelled", note: "Third graduate position deferred to 2027." },
  { id: "REV-A022", entity: "Offer", entityId: "OFR-002", at: "2026-09-14 12:08", actor: "Usman Tariq", action: "Accepted", fromStatus: "Sent", toStatus: "Accepted", note: "Joining 21 September 2026." },
  { id: "REV-A023", entity: "Application", entityId: "APL-001", at: "2026-09-16 09:15", actor: "Sana Iqbal", action: "Converted", fromStatus: "Selected", toStatus: "Hired", note: "Employee EMP-000008 created from OFR-2026-0019." },
  { id: "REV-A024", entity: "Offer", entityId: "OFR-003", at: "2026-09-17 10:40", actor: "Sana Iqbal", action: "Sent", fromStatus: "Generated", toStatus: "Sent", note: "Second graduate position." },
  { id: "REV-A025", entity: "Offer", entityId: "OFR-004", at: "2026-09-16 15:30", actor: "Sana Iqbal", action: "Drafted", fromStatus: null, toStatus: "Draft", note: "Held: pay above the approved range pending a management exception." },
  { id: "REV-A026", entity: "Application", entityId: "APL-009", at: "2026-09-08 11:00", actor: "Zainab Farooq", action: "Applied", fromStatus: null, toStatus: "Application", note: "Internal applicant; held while serving probation." },
];

export function eventsForEntity(entity: RecruitmentEntity, entityId: string): readonly RecruitmentEvent[] {
  return recruitmentEvents
    .filter((row) => row.entity === entity && row.entityId === entityId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/* ------------------------------------------------------------------ */
/* Reporting                                                          */
/* ------------------------------------------------------------------ */

export interface FunnelRow {
  stage: ApplicationStage;
  count: number;
}

/**
 * The pipeline stages an application has actually reached: a prefix of the
 * pipeline, so the funnel cannot report more candidates at a later stage than
 * at an earlier one. A rejected or withdrawn application is credited only with
 * the stages its audit trail shows it cleared.
 */
export function stagesReached(applicationId: string): readonly ApplicationStage[] {
  const row = application(applicationId);
  if (!row) return [];
  const fromTrail = eventsForEntity("Application", applicationId)
    .flatMap((event) => [event.fromStatus, event.toStatus])
    .filter((value): value is ApplicationStage =>
      value !== null && (applicationPipeline as readonly string[]).includes(value));
  const current = (applicationPipeline as readonly string[]).includes(row.stage) ? [row.stage] : [];
  const furthest = [...fromTrail, ...current].reduce(
    (highest, stage) => Math.max(highest, applicationPipeline.indexOf(stage)),
    0,
  );
  return applicationPipeline.slice(0, furthest + 1);
}

export function recruitmentFunnel(): readonly FunnelRow[] {
  return applicationPipeline.map((stage) => ({
    stage,
    count: applications.filter((row) => stagesReached(row.id).includes(stage)).length,
  }));
}

export function timeToHireDays(offerId: string): number | null {
  const row = offer(offerId);
  const app = row ? application(row.applicationId) : undefined;
  if (!row || !app || row.status !== "Accepted" || row.respondedOn === null) return null;
  return daysBetween(app.appliedOn, row.respondedOn);
}

/** Whole days between two ISO dates. Month is zero-based in Date.UTC. */
export function daysBetween(from: string, to: string): number {
  const asUtc = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((asUtc(to) - asUtc(from)) / 86_400_000);
}

export function openPositionCount(): number {
  return jobOpenings
    .filter((row) => row.status === "Open")
    .reduce((total, row) => total + openingRemaining(row.id), 0);
}

/** Prototype "today", shared with every other HR phase. */
export const RECRUITMENT_TODAY = HR_TODAY;
