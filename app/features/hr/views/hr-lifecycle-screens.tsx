"use client";

/**
 * HR Phase 4 presentation: recruitment, performance/development and the
 * employee lifecycle. All values come from the deterministic Phase 4 fixture
 * modules. Buttons are prototype interactions only and never mutate Demo data.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { employeeName, orgUnitName } from "../model/hr-core-data";
import { formatMoney } from "../model/hr-payroll-data";
import {
  applicationPipeline,
  applications,
  buildEmployeeDraft,
  candidateName,
  candidates,
  evaluationsFor,
  interviews,
  jobOpenings,
  manpowerRequisitions,
  offers,
  offerBlockers,
  openPositionCount,
  panelScore,
  recruitmentFunnel,
  requisitionTitle,
  selectionReadiness,
} from "../model/hr-recruitment-data";
import {
  completionBlockers,
  computedFinalLevel,
  computedFinalScore,
  goals,
  mandatoryTrainingGaps,
  performanceCycles,
  performanceOutcomes,
  performanceReviews,
  programEffectiveness,
  reviewBlockers,
  trainingCompletions,
  trainingParticipant,
  trainingProgram,
  trainingPrograms,
  trainingRequests,
  trainingSessions,
} from "../model/hr-performance-data";
import {
  checklistProgress,
  clearanceItemsFor,
  clearanceProgress,
  clearances,
  employeeMovements,
  exitsInProgress,
  finalSettlements,
  movementBlockers,
  movementChanges,
  onboardingChecklists,
  payrollBlockers,
  probationBlockers,
  probationReviews,
  resignations,
  settlementBlockers,
  settlementNet,
  terminationBlockers,
  terminations,
} from "../model/hr-lifecycle-data";

export const HR_LIFECYCLE_PAGES = [
  "manpower-requisitions", "job-openings", "candidates", "recruitment-pipeline", "interviews", "offers", "create-employee-from-offer",
  "performance-cycles", "goals-kpis", "performance-reviews", "performance-outcomes",
  "training-programs", "training-requests", "training-sessions", "training-completions",
  "onboarding", "probation-reviews", "employee-movements", "resignations", "terminations", "clearance", "final-settlements", "offboarding",
] as const;

export function isHrLifecyclePage(pageId: string): boolean {
  return (HR_LIFECYCLE_PAGES as readonly string[]).includes(pageId);
}

type Navigate = (moduleId: string, pageId: string) => void;
type Action = (action: string, subject?: string) => void;
type Tone = "positive" | "warning" | "negative" | "neutral";

interface UiRecord {
  id: string;
  reference: string;
  title: string;
  subtitle: string;
  status: string;
  tone?: Tone;
  owner?: string;
  date?: string;
  fields: readonly [string, string][];
  blockers?: readonly string[];
  note?: string;
  progress?: number;
  actions?: readonly string[];
}

interface PageModel {
  family: "Recruitment control centre" | "Performance & development" | "Employee lifecycle control";
  title: string;
  description: string;
  primaryAction: string;
  lifecycle: readonly string[];
  records: readonly UiRecord[];
  metrics: readonly { label: string; value: string; hint: string; tone?: Tone }[];
}

const recruitmentLife = ["Draft", "Submitted", "HR review", "Budget review", "Management approval", "Approved"];
const performanceLife = ["Goal setting", "Self evaluation", "Manager evaluation", "Calibration", "Completed"];
const employeeLife = ["Initiate", "Manager / HR review", "Approval", "Effective / clearance", "Closed"];

function toneFor(status: string): Tone {
  const value = status.toLowerCase();
  if (/approved|accepted|completed|effective|passed|hired|open$|paid|closed/.test(value)) return "positive";
  if (/rejected|failed|cancelled|expired|blocked|missed/.test(value)) return "negative";
  if (/pending|review|draft|progress|scheduled|hold|submitted|clearance|evaluation/.test(value)) return "warning";
  return "neutral";
}

function asRecord(input: Omit<UiRecord, "tone"> & { tone?: Tone }): UiRecord {
  return { ...input, tone: input.tone ?? toneFor(input.status) };
}

function recruitmentModel(pageId: string): PageModel {
  const common = {
    family: "Recruitment control centre" as const,
    lifecycle: recruitmentLife,
    metrics: [
      { label: "Open positions", value: String(openPositionCount()), hint: "Approved headcount still unfilled", tone: "warning" as const },
      { label: "Active applications", value: String(applications.filter((row) => !["Hired", "Rejected", "Withdrawn"].includes(row.stage)).length), hint: "Across open and held vacancies" },
      { label: "Offers awaiting response", value: String(offers.filter((row) => row.status === "Sent").length), hint: "Validity dates monitored", tone: "warning" as const },
      { label: "Hires completed", value: String(applications.filter((row) => row.stage === "Hired").length), hint: "Candidate trail retained", tone: "positive" as const },
    ],
  };

  if (pageId === "manpower-requisitions") return {
    ...common, title: "Manpower requisitions", description: "Approved headcount, salary bands and independent HR, budget and management decisions.", primaryAction: "New requisition",
    records: manpowerRequisitions.map((row) => asRecord({ id: row.id, reference: row.reference, title: requisitionTitle(row), subtitle: `${orgUnitName(row.departmentId)} · ${row.positionType}`, status: row.status, owner: row.raisedBy, date: row.targetStartDate, fields: [["Positions", String(row.numberRequired)], ["Employment", row.employmentTypeId], ["Approved salary band", `${formatMoney(row.salaryRangeMin, row.currency)} – ${formatMoney(row.salaryRangeMax, row.currency)}`], ["Target start", row.targetStartDate], ["Skills", row.requiredSkills.join(", ")], ["Approvals", `${row.approvals.filter((item) => item.decision === "Approved").length} recorded`]], note: row.reason, actions: ["View approval trail", "Open linked vacancies", "Print requisition"] })),
  };
  if (pageId === "job-openings") return {
    ...common, title: "Job openings", description: "Vacancies tied to approved requisitions, hiring owners, channels and remaining authorised headcount.", primaryAction: "Create opening",
    records: jobOpenings.map((row) => asRecord({ id: row.id, reference: row.reference, title: row.title, subtitle: `${row.channels.join(" · ")}`, status: row.status, owner: employeeName(row.recruiterId), date: row.closingOn, progress: Math.round(((row.numberRequired - Math.max(0, row.numberRequired - applications.filter((item) => item.openingId === row.id && item.stage === "Hired").length)) / row.numberRequired) * 100), fields: [["Authorised positions", String(row.numberRequired)], ["Hiring manager", employeeName(row.hiringManagerId)], ["Recruiter", employeeName(row.recruiterId)], ["Posted", row.postedOn], ["Closes", row.closingOn], ["Applications", String(applications.filter((item) => item.openingId === row.id).length)]], note: row.statusReason, actions: ["Open pipeline", "Publish / hold", "View requisition"] })),
  };
  if (pageId === "candidates") return {
    ...common, title: "Candidate directory", description: "One person record with multiple applications, restricted documents and retained recruitment history.", primaryAction: "Add candidate",
    records: candidates.map((row) => asRecord({ id: row.id, reference: row.candidateNumber, title: `${row.firstName} ${row.lastName}`, subtitle: `${row.currentDesignation} · ${row.currentEmployer}`, status: row.employeeId ? "Hired" : "Candidate", owner: row.createdBy, date: row.createdOn, fields: [["Location", `${row.city}, ${row.country}`], ["Experience", `${row.totalExperienceYears} years`], ["Expected salary", formatMoney(row.expectedSalary)], ["Notice", `${row.noticePeriodDays} days`], ["Applications", String(applications.filter((item) => item.candidateId === row.id).length)], ["Documents", `${row.documents.length} · ${row.documents.filter((item) => item.restricted).length} restricted`]], note: row.skills.join(" · "), actions: ["Open profile", "Add application", "Review documents"] })),
  };
  if (pageId === "interviews") return {
    ...common, title: "Interview calendar & evaluations", description: "Each panel member submits independent evidence; no reviewer overwrites another reviewer’s score.", primaryAction: "Schedule interview",
    records: interviews.map((row) => { const score = panelScore(row.id); const evaluations = evaluationsFor(row.id); return asRecord({ id: row.id, reference: row.id, title: `${row.kind} interview · ${candidateName(applications.find((item) => item.id === row.applicationId)?.candidateId ?? "")}`, subtitle: `${row.mode} · ${row.location}`, status: row.status, date: `${row.scheduledOn} ${row.scheduledAt}`, fields: [["Round", String(row.round)], ["Duration", `${row.durationMinutes} minutes`], ["Panel members", String(row.panel.length)], ["Evaluations", `${evaluations.length} submitted`], ["Panel score", score === null ? "Pending" : `${score.toFixed(1)} / 100`], ["Application", row.applicationId]], note: row.statusNote, actions: ["Open scorecard", "Record evaluation", "Reschedule"] }); }),
  };
  if (pageId === "offers" || pageId === "create-employee-from-offer") return {
    ...common, title: pageId === "offers" ? "Offer management" : "Create employee from accepted offer", description: pageId === "offers" ? "Controlled offer terms, validity, salary-range exceptions and response history." : "Preview the traceable employee draft; every carried field names its recruitment source.", primaryAction: pageId === "offers" ? "Prepare offer" : "Create employee draft",
    records: offers.map((row) => { const draft = buildEmployeeDraft(row.id); const blockers = offerBlockers(row); return asRecord({ id: row.id, reference: row.reference, title: candidateName(row.candidateId), subtitle: `${row.designationId} · joining ${row.joiningDate}`, status: row.status, owner: row.generatedBy, date: row.validUntil, fields: [["Proposed gross", formatMoney(row.proposedGross, row.currency)], ["Validity", row.validUntil], ["Probation", `${row.probationMonths} months`], ["Notice", `${row.noticePeriodDays} days`], ["Range exception", row.rangeExceptionApprovedBy ?? (blockers.length ? "Required" : "Not required")], ["Employee record", row.employeeId ?? "Not created"], ...(draft ? [["Fields carried", String(draft.fields.length)], ["Fields still required", String(draft.pending.length)]] as [string, string][] : [])], blockers, note: row.note, actions: row.status === "Accepted" ? ["Open employee draft", "View recruitment trail", "Start onboarding"] : ["Open offer", "View approval evidence", "Print preview"] }); }),
  };
  return {
    ...common, title: "Recruitment pipeline", description: "Application-stage flow, conversion, panel readiness and traceable candidate-to-employee decisions.", primaryAction: "Add application",
    records: applications.map((row) => { const readiness = selectionReadiness(row.id); return asRecord({ id: row.id, reference: row.reference, title: candidateName(row.candidateId), subtitle: jobOpenings.find((item) => item.id === row.openingId)?.title ?? row.openingId, status: row.stage, owner: row.screenedBy ?? "Unassigned", date: row.appliedOn, progress: Math.round(((applicationPipeline.indexOf(row.stage) + 1) / applicationPipeline.length) * 100), fields: [["Internal applicant", row.internal ? "Yes" : "No"], ["Panel score", readiness.averageScore === null ? "Pending" : `${readiness.averageScore.toFixed(1)} / 100`], ["Evaluations", `${readiness.evaluationsSubmitted} of ${readiness.evaluationsRequired}`], ["Decision", row.decidedBy ?? "Pending"], ["Opening", row.openingId], ["Applied", row.appliedOn]], blockers: readiness.blockers, note: row.rejectionReason || row.screeningNote, actions: ["Open application", "Move stage", "View evidence"] }); }),
  };
}

function performanceModel(pageId: string): PageModel {
  const common = {
    family: "Performance & development" as const,
    lifecycle: performanceLife,
    metrics: [
      { label: "Live cycle", value: performanceCycles.find((row) => row.status !== "Closed")?.name ?? "None", hint: "Configured review calendar" },
      { label: "Reviews in progress", value: String(performanceReviews.filter((row) => !["Completed", "Not rated"].includes(row.status)).length), hint: "Self, manager or calibration stage", tone: "warning" as const },
      { label: "Approved outcomes", value: String(performanceOutcomes.filter((row) => row.status === "Approved").length), hint: "Separate payroll action still required" },
      { label: "Mandatory training gaps", value: String(mandatoryTrainingGaps().length), hint: "Current employees × active programmes", tone: "negative" as const },
    ],
  };
  if (pageId === "performance-cycles") return { ...common, title: "Performance cycles", description: "Configurable dates, scales and controlled stage transitions for every review cycle.", primaryAction: "New cycle", records: performanceCycles.map((row) => asRecord({ id: row.id, reference: row.reference, title: row.name, subtitle: `${row.periodStart} – ${row.periodEnd}`, status: row.status, owner: row.createdBy, date: row.managerEvaluationClosesOn, fields: [["Rating scale", row.ratingScaleId], ["Goal close", row.goalSettingClosesOn], ["Self review close", row.selfEvaluationClosesOn], ["Manager close", row.managerEvaluationClosesOn], ["Reviews", String(performanceReviews.filter((item) => item.cycleId === row.id).length)], ["Closed on", row.closedOn ?? "Open"]], actions: ["Open cycle", "Review completion", "View scale"] })) };
  if (pageId === "goals-kpis") return { ...common, title: "Goals & KPIs", description: "Weighted employee goals linked to governed KPI definitions, targets, evidence and approvals.", primaryAction: "Add goal", records: goals.map((row) => asRecord({ id: row.id, reference: row.id, title: row.title, subtitle: `${employeeName(row.employeeId)} · ${row.cycleId}`, status: row.status, owner: row.approvedBy ?? "Pending approval", date: row.dueOn, progress: row.status === "Achieved" ? 100 : row.status === "Partially achieved" ? 65 : undefined, fields: [["Weight", `${row.weight}%`], ["Target", row.target], ["Actual", row.actual || "Not recorded"], ["KPI", row.kpiId ?? "Qualitative"], ["Due", row.dueOn], ["Approved on", row.approvedOn ?? "Pending"]], note: row.description, actions: ["Open goal", "Update evidence", "Submit / approve"] })) };
  if (pageId === "performance-reviews") return { ...common, title: "Performance reviews", description: "Self and manager assessments remain separate; final ratings are computed and independently calibrated.", primaryAction: "Start review", records: performanceReviews.map((row) => { const score = computedFinalScore(row.id); return asRecord({ id: row.id, reference: row.id, title: employeeName(row.employeeId), subtitle: `${row.cycleId} · reviewer ${employeeName(row.reviewerId)}`, status: row.status, owner: row.calibratedBy ?? employeeName(row.reviewerId), date: row.managerSubmittedOn ?? row.selfSubmittedOn ?? undefined, fields: [["Final score", score === null ? "Pending" : `${score.toFixed(1)} / 100`], ["Rating", computedFinalLevel(row.id)?.label ?? "Not rated"], ["Self submitted", row.selfSubmittedOn ?? "Pending"], ["Manager submitted", row.managerSubmittedOn ?? "Pending"], ["Calibrated by", row.calibratedBy ?? "Pending"], ["Acknowledged", row.acknowledgedOn ?? "Pending"]], blockers: reviewBlockers(row), note: row.note || row.acknowledgementComment, actions: ["Open review", "Compare self vs manager", "Calibrate"] }); }) };
  if (pageId === "performance-outcomes") return { ...common, title: "Performance outcomes", description: "Performance may propose pay or movement, but only the linked Payroll or Lifecycle transaction applies it.", primaryAction: "Propose outcome", records: performanceOutcomes.map((row) => asRecord({ id: row.id, reference: row.id, title: `${row.kind} · ${employeeName(row.employeeId)}`, subtitle: `Review ${row.reviewId}`, status: row.status, owner: row.proposedBy, date: row.proposedOn, fields: [["Amount", row.proposedAmount === null ? "—" : formatMoney(row.proposedAmount)], ["Percent", row.proposedPercent === null ? "—" : `${row.proposedPercent}%`], ["Approved by", row.approvedBy ?? "Pending"], ["Payroll adjustment", row.linkedAdjustmentId ?? "Not raised"], ["Salary revision", row.linkedRevisionId ?? "Not raised"], ["Review", row.reviewId]], note: row.note, actions: ["Open outcome", "Raise governed transaction", "View review"] })) };
  if (pageId === "training-requests") return { ...common, title: "Training requests", description: "Employee need, manager decision, HR decision, budget relevance and goal linkage in one queue.", primaryAction: "New request", records: trainingRequests.map((row) => asRecord({ id: row.id, reference: row.reference, title: trainingProgram(row.programId)?.name ?? row.programId, subtitle: employeeName(row.employeeId), status: row.status, owner: row.requestedBy, date: row.requestedOn, fields: [["Programme", row.programId], ["Linked goal", row.linkedGoalId ?? "—"], ["Linked outcome", row.linkedOutcomeId ?? "—"], ["Manager decision", row.managerDecisionBy ?? "Pending"], ["HR decision", row.hrDecisionBy ?? "Pending"], ["Requested", row.requestedOn]], note: row.decisionComment || row.justification, actions: ["Open request", "Approve / reject", "View development need"] })) };
  if (pageId === "training-sessions") return { ...common, title: "Training sessions", description: "Scheduled cohorts, trainers, capacity, daily attendance and completion readiness.", primaryAction: "Schedule session", records: trainingSessions.map((row) => asRecord({ id: row.id, reference: row.reference, title: row.title, subtitle: `${row.location} · ${row.trainerName}`, status: row.status, owner: row.trainerName, date: row.sessionDays[0], fields: [["Programme", row.programId], ["Dates", row.sessionDays.join(", ")], ["Hours", `${row.sessionDays.length * row.hoursPerDay}`], ["Capacity", String(row.capacity)], ["Enrolled", "See participant register"], ["Location", row.location]], note: row.statusNote, actions: ["Open session", "Take attendance", "Record completion"] })) };
  if (pageId === "training-completions") return { ...common, title: "Training completion & certificates", description: "Passes are earned from attendance and assessment evidence; expired mandatory learning remains visible.", primaryAction: "Record completion", records: trainingCompletions.map((row) => { const participant = trainingParticipant(row.participantId); return asRecord({ id: row.id, reference: row.id, title: employeeName(participant?.employeeId ?? null), subtitle: participant ? trainingProgram(trainingSessions.find((item) => item.id === participant.sessionId)?.programId ?? "")?.name ?? participant.sessionId : row.participantId, status: row.result, owner: row.recordedBy, date: row.completedOn, fields: [["Attendance", `${row.attendancePercentRecorded}%`], ["Assessment", row.assessmentScore === null ? "Not assessed" : String(row.assessmentScore)], ["Certificate", row.certificateReference || "Not issued"], ["Valid until", row.validUntil ?? "No expiry"], ["Participant", row.participantId], ["Completed", row.completedOn]], blockers: completionBlockers(row), actions: ["Open evidence", "View certificate", "Renew training"] }); }) };
  return { ...common, title: "Training programmes", description: "Governed learning catalogue with attendance thresholds, assessment rules, cost and effectiveness.", primaryAction: "Add programme", records: trainingPrograms.map((row) => { const effectiveness = programEffectiveness(row.id); return asRecord({ id: row.id, reference: row.code, title: row.name, subtitle: `${row.category} · ${row.mode} · ${row.provider}`, status: row.status, fields: [["Duration", `${row.durationHours} hours`], ["Cost / participant", formatMoney(row.costPerParticipant)], ["Minimum attendance", `${row.minimumAttendancePercent}%`], ["Pass mark", row.assessmentRequired ? `${row.passMark}` : "Not assessed"], ["Mandatory", row.mandatory ? "Yes" : "No"], ["Completion rate", `${effectiveness.completionRate}%`]], note: row.description, actions: ["Open programme", "Schedule cohort", "View effectiveness"] }); }) };
}

function lifecycleModel(pageId: string): PageModel {
  const common = {
    family: "Employee lifecycle control" as const,
    lifecycle: employeeLife,
    metrics: [
      { label: "Onboarding cases", value: String(onboardingChecklists.length), hint: `${onboardingChecklists.filter((row) => row.status === "Blocked").length} blocked`, tone: "warning" as const },
      { label: "Probation decisions", value: String(probationReviews.filter((row) => ["Scheduled", "In review", "Recommended"].includes(row.status)).length), hint: "Awaiting review or approval" },
      { label: "Movements pending", value: String(employeeMovements.filter((row) => ["Draft", "Pending approval", "Approved"].includes(row.status)).length), hint: "Effective-dated assignment changes" },
      { label: "Exits in progress", value: String(exitsInProgress().length), hint: "Clearance and settlement controlled", tone: "warning" as const },
    ],
  };
  if (pageId === "onboarding") return { ...common, title: "Onboarding", description: "Template-derived joining tasks, evidence, due dates and payroll-blocking controls.", primaryAction: "Start onboarding", records: onboardingChecklists.map((row) => { const progress = checklistProgress(row.id); return asRecord({ id: row.id, reference: row.reference, title: employeeName(row.employeeId), subtitle: `Joining ${row.joiningDate}`, status: row.status, date: row.joiningDate, progress: progress.percent, fields: [["Tasks complete", `${progress.settled} of ${progress.total}`], ["Blocking open", String(progress.blockingOutstanding.length)], ["Overdue", String(progress.overdue.length)], ["Payroll readiness", payrollBlockers(row.employeeId).length ? "Blocked" : "Ready"], ["Template", row.templateId], ["Started", row.startedOn]], blockers: [...progress.blockingOutstanding.map((item) => `${item.title} — ${item.status}`), ...payrollBlockers(row.employeeId)], note: row.note, actions: ["Open checklist", "Complete task", "View employee"] }); }) };
  if (pageId === "probation-reviews") return { ...common, title: "Probation reviews", description: "Scheduled reviews, scored recommendations and controlled confirm, extend or terminate outcomes.", primaryAction: "Schedule review", records: probationReviews.map((row) => asRecord({ id: row.id, reference: row.reference, title: employeeName(row.employeeId), subtitle: `${row.kind} review · ${row.probationStart} – ${row.probationEnd}`, status: row.status, owner: employeeName(row.reviewerId), date: row.reviewDueOn, fields: [["Recommendation", row.recommendation ?? "Pending"], ["Rating", row.ratingScore === null ? "Pending" : `${row.ratingScore} / 5`], ["Extension", row.extensionMonths === null ? "—" : `${row.extensionMonths} months`], ["New end", row.newProbationEnd ?? "—"], ["Approved by", row.approvedBy ?? "Pending"], ["Status event", row.statusEventId ?? "Not created"]], blockers: probationBlockers(row), note: row.concerns || row.strengths, actions: ["Open review", "Approve decision", "View onboarding"] })) };
  if (pageId === "employee-movements") return { ...common, title: "Employee movements", description: "Transfers and promotions produce a new effective-dated assignment; pay changes remain separate Payroll transactions.", primaryAction: "New movement", records: employeeMovements.map((row) => asRecord({ id: row.id, reference: row.reference, title: employeeName(row.employeeId), subtitle: row.kinds.join(" · "), status: row.status, owner: row.requestedBy, date: row.effectiveFrom, fields: [["Effective from", row.effectiveFrom], ["Salary impact", row.salaryImpact], ["Salary revision", row.salaryRevisionId ?? "Not required / not raised"], ["Changes", movementChanges(row).map((item) => item.label).join(", ") || "None"], ["Approved by", row.approvedBy ?? "Pending"], ["Assignment created", row.resultingAssignmentId ?? "Not effective"]], blockers: movementBlockers(row), note: row.note || row.reason, actions: ["Open movement", "Compare before / after", "View salary revision"] })) };
  if (pageId === "resignations") return { ...common, title: "Resignations", description: "Notice, manager and HR review, waiver authority, exit interview, clearance and settlement trace.", primaryAction: "Record resignation", records: resignations.map((row) => asRecord({ id: row.id, reference: row.reference, title: employeeName(row.employeeId), subtitle: row.reasonCategory, status: row.status, owner: row.hrReviewBy ?? row.managerReviewBy ?? "HR queue", date: row.agreedLastDay, fields: [["Submitted", row.submittedOn], ["Required last day", row.requiredLastDay], ["Agreed last day", row.agreedLastDay], ["Notice shortfall", `${row.noticeShortfallDays} days`], ["Clearance", row.clearanceId ?? "Not started"], ["Settlement", row.settlementId ?? "Not started"]], note: row.note || row.reason, actions: ["Open resignation", "Start / view clearance", "Open settlement"] })) };
  if (pageId === "terminations") return { ...common, title: "Termination cases", description: "Reason-specific authority, documentary evidence and clearance gates; rejected and cancelled cases remain auditable.", primaryAction: "Initiate termination", records: terminations.map((row) => asRecord({ id: row.id, reference: row.reference, title: employeeName(row.employeeId), subtitle: row.reason, status: row.status, owner: row.initiatedBy, date: row.effectiveDate, fields: [["Initiated", row.initiatedOn], ["Effective", row.effectiveDate], ["Approvals", String(row.approvals.length)], ["Documents", String(row.documentation.length)], ["Clearance", row.clearanceId ?? "Not started"], ["Settlement", row.settlementId ?? "Not started"]], blockers: terminationBlockers(row), note: row.note || row.reasonDetail, actions: ["Open case", "Review authority", "View evidence"] })) };
  if (pageId === "clearance") return { ...common, title: "Exit clearance", description: "Department-by-department accountability, returned assets and recoverable amounts before settlement payment.", primaryAction: "Start clearance", records: clearances.map((row) => { const progress = clearanceProgress(row.id); return asRecord({ id: row.id, reference: row.reference, title: employeeName(row.employeeId), subtitle: `${row.kind} · ${row.sourceId}`, status: row.status, date: row.targetDate, progress: Math.round((progress.settled / Math.max(1, progress.total)) * 100), fields: [["Settled", `${progress.settled} of ${progress.total}`], ["Outstanding", String(progress.outstanding)], ["Recoverable", formatMoney(progress.recoverable)], ["Target", row.targetDate], ["Departments", clearanceItemsFor(row.id).map((item) => item.department).join(", ")], ["Source", row.sourceId]], blockers: clearanceItemsFor(row.id).filter((item) => !["Cleared", "Waived"].includes(item.status)).map((item) => `${item.department}: ${item.item} — ${item.status}`), note: row.note, actions: ["Open checklist", "Clear item", "Open settlement"] }); }) };
  if (pageId === "final-settlements" || pageId === "offboarding") return { ...common, title: pageId === "offboarding" ? "Offboarding control centre" : "Final settlements", description: "Derived earnings and deductions, HR and Finance approval, clearance control, payment and journal trace.", primaryAction: "Prepare settlement", records: finalSettlements.map((row) => asRecord({ id: row.id, reference: row.reference, title: employeeName(row.employeeId), subtitle: `${row.kind} · last day ${row.lastWorkingDay}`, status: row.status, owner: row.preparedBy, date: row.lastWorkingDay, fields: [["Net payable", formatMoney(settlementNet(row))], ["Earning lines", String(row.lines.filter((item) => item.kind === "Earning").length)], ["Deduction lines", String(row.lines.filter((item) => item.kind === "Deduction").length)], ["Clearance", row.clearanceId], ["Payment", row.paymentReference || "Not paid"], ["Journal", row.journalReference || "Not posted"]], blockers: settlementBlockers(row), note: row.note, actions: ["Open calculation", "Review / approve", "View payment & journal"] })) };
  return { ...common, title: "Employee lifecycle", description: "A single control view across onboarding, probation, movement, resignation, termination, clearance and settlement.", primaryAction: "New lifecycle action", records: exitsInProgress().map((row) => asRecord({ id: row.reference, reference: row.reference, title: employeeName(row.employeeId), subtitle: row.kind, status: row.status, date: row.lastDay, fields: [["Employee", employeeName(row.employeeId)], ["Process", row.kind], ["Reference", row.reference], ["Current stage", row.status], ["Last working day", row.lastDay], ["Next control", "Open the source workflow"]], actions: ["Open process", "View employee timeline", "View audit trail"] })) };
}

function modelFor(pageId: string): PageModel {
  if (["manpower-requisitions", "job-openings", "candidates", "recruitment-pipeline", "interviews", "offers", "create-employee-from-offer"].includes(pageId)) return recruitmentModel(pageId);
  if (["performance-cycles", "goals-kpis", "performance-reviews", "performance-outcomes", "training-programs", "training-requests", "training-sessions", "training-completions"].includes(pageId)) return performanceModel(pageId);
  return lifecycleModel(pageId);
}

function Status({ value, tone = toneFor(value) }: { value: string; tone?: Tone }) {
  return <span className={`inline-flex min-h-6 items-center rounded-full border px-2 text-xs font-bold whitespace-nowrap ${tone === "positive" ? "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]" : tone === "warning" ? "border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]" : tone === "negative" ? "border-[var(--nx-danger-border)] bg-[var(--nx-danger-soft)] text-destructive" : "border-border bg-muted text-muted-foreground"}`}>{value}</span>;
}

export function HrLifecycleScreen({ pageId, onAction, onNavigate }: { pageId: string; onAction: Action; onNavigate: Navigate }) {
  const model = useMemo(() => modelFor(pageId), [pageId]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [selectedId, setSelectedId] = useState(model.records[0]?.id ?? "");
  const [detailOpen, setDetailOpen] = useState(true);
  const statuses = useMemo(() => ["All statuses", ...Array.from(new Set(model.records.map((row) => row.status)))], [model.records]);
  const visible = useMemo(() => model.records.filter((row) => {
    const haystack = `${row.reference} ${row.title} ${row.subtitle} ${row.status} ${row.owner ?? ""}`.toLowerCase();
    return (status === "All statuses" || row.status === status) && haystack.includes(query.trim().toLowerCase());
  }), [model.records, query, status]);
  const selected = model.records.find((row) => row.id === selectedId) ?? visible[0] ?? model.records[0];

  const familyLinks = [
    ["Recruitment", "recruitment-pipeline"],
    ["Performance", "performance-reviews"],
    ["Training", "training-programs"],
    ["Lifecycle", "employee-movements"],
    ["Exit", "offboarding"],
  ] as const;

  return (
    <div className="grid gap-4 text-foreground max-sm:gap-3">
      <section className="flex flex-col items-start justify-between gap-5 rounded-lg border border-border bg-[var(--nx-brand-strong)] px-6 py-5 text-primary-foreground shadow-md sm:flex-row max-sm:p-4">
        <div className="max-w-190"><span className="text-xs font-bold uppercase tracking-wider text-[var(--nx-emphasis-muted)]">{model.family}</span><h2 className="my-1 text-2xl font-bold tracking-tight">{model.title}</h2><p className="m-0 text-sm leading-relaxed text-[var(--nx-emphasis-muted)]">{model.description}</p></div>
        <div className="flex flex-wrap justify-end gap-2 max-sm:w-full"><Button variant="outline" type="button" onClick={() => onAction("Export", model.title)}>Export</Button><Button type="button" onClick={() => onAction(model.primaryAction, model.title)}>+ {model.primaryAction}</Button></div>
      </section>

      <nav className="flex gap-1 overflow-x-auto rounded border border-border bg-card p-1 shadow-sm" aria-label="HR lifecycle areas">
        {familyLinks.map(([label, target]) => <Button key={target} variant="ghost" className={pageId === target || (label === "Recruitment" && pageId.startsWith("recruit")) ? "bg-accent text-primary" : "text-muted-foreground"} type="button" onClick={() => onNavigate("hr", target)}>{label}</Button>)}
      </nav>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={`${model.title} summary`}>
        {model.metrics.map((metric) => <article className={`grid min-w-0 gap-1 rounded border border-border border-t-3 bg-card p-4 shadow-sm ${metric.tone === "positive" ? "border-t-[var(--nx-success-text)]" : metric.tone === "warning" ? "border-t-[var(--nx-warning)]" : metric.tone === "negative" ? "border-t-destructive" : "border-t-primary"}`} key={metric.label}><span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{metric.label}</span><strong className="truncate text-xl font-bold text-foreground">{metric.value}</strong><small className="text-xs text-muted-foreground">{metric.hint}</small></article>)}
      </section>

      {pageId === "recruitment-pipeline" ? <section className="grid grid-flow-col auto-cols-[minmax(6.875rem,1fr)] gap-2 overflow-x-auto rounded border border-border bg-card p-3.5" aria-label="Recruitment funnel">{recruitmentFunnel().map((row, index, all) => <article className="grid min-w-26 gap-2" key={row.stage}><div className="flex items-baseline justify-between gap-1.5"><span className="text-xs font-bold">{row.stage}</span><strong className="text-lg font-bold text-primary">{row.count}</strong></div><i className="h-1.75 overflow-hidden rounded-full bg-border"><b className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(8, (row.count / Math.max(1, all[0].count)) * 100)}%` }} /></i><small className="text-xs text-muted-foreground">{index === 0 ? "Applicants" : `${Math.round((row.count / Math.max(1, all[index - 1].count)) * 100)}% stage conversion`}</small></article>)}</section> : null}

      <section className="grid grid-flow-col auto-cols-[minmax(7.5rem,1fr)] overflow-x-auto rounded border border-border bg-card" aria-label="Workflow lifecycle">
        {model.lifecycle.map((stage, index) => <div className="flex min-w-30 items-center gap-2 border-r border-border px-3 py-2.5 text-xs font-bold text-muted-foreground last:border-r-0" key={stage}><b className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs text-primary">{index + 1}</b><span>{stage}</span></div>)}
      </section>

      <section className={`grid min-w-0 items-start gap-3.5 ${detailOpen ? "xl:grid-cols-[minmax(0,1fr)_minmax(20.625rem,24.375rem)]" : "grid-cols-1"}`}>
        <div className="min-w-0 overflow-hidden rounded border border-border bg-card shadow-sm">
          <div className="grid items-end gap-2 border-b border-border bg-muted p-3 md:grid-cols-[minmax(13.75rem,1.4fr)_minmax(9.375rem,.75fr)_minmax(9.0625rem,.7fr)_auto]">
            <label className="grid min-w-0 gap-1"><span className="text-xs font-bold uppercase text-muted-foreground">Search</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Reference, employee, owner or status…" /></label>
            <label className="grid min-w-0 gap-1"><span className="text-xs font-bold uppercase text-muted-foreground">Status</span><select className="h-8 rounded border border-border bg-card px-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="grid min-w-0 gap-1"><span className="text-xs font-bold uppercase text-muted-foreground">Period</span><select className="h-8 rounded border border-border bg-card px-2 text-sm" defaultValue="Current year"><option>Current year</option><option>Current quarter</option><option>Last 30 days</option><option>Custom range</option></select></label>
            <Button variant="outline" type="button" onClick={() => { setQuery(""); setStatus("All statuses"); }}>Reset</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5"><div><strong className="text-sm">{visible.length}</strong><span className="text-xs text-muted-foreground"> records</span></div><div className="flex gap-2"><Button variant="outline" type="button" onClick={() => onAction("Saved views", model.title)}>Saved views</Button><Button variant="outline" type="button" onClick={() => onAction("More filters", model.title)}>More filters</Button></div></div>
          <div className="nx-table-wrap">
            <table className="nx-data-table min-w-230">
              <thead><tr><th>Reference</th><th>Employee / subject</th><th>Context</th><th>Status</th><th>Owner</th><th>Date</th><th aria-label="Open record" /></tr></thead>
              <tbody>{visible.map((row) => <tr key={row.id} className={`cursor-pointer hover:bg-muted ${selected?.id === row.id ? "bg-muted" : ""}`} onClick={() => { setSelectedId(row.id); setDetailOpen(true); }}><td><button type="button" className="border-0 bg-transparent p-0 text-sm font-bold text-primary underline underline-offset-2" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id); setDetailOpen(true); }}>{row.reference}</button></td><td><strong>{row.title}</strong></td><td>{row.subtitle}</td><td><Status value={row.status} tone={row.tone} /></td><td>{row.owner ?? "—"}</td><td>{row.date ?? "—"}</td><td>›</td></tr>)}</tbody>
            </table>
          </div>
          {visible.length === 0 ? <div className="grid min-h-45 place-items-center gap-1 p-7.5 text-center text-muted-foreground"><strong className="text-foreground">No matching records</strong><span className="text-sm">Clear filters or search a different reference, person, owner or status.</span></div> : null}
        </div>

        {detailOpen && selected ? <aside className="sticky top-19 max-h-[calc(100vh-6.25rem)] overflow-auto rounded border border-border bg-card shadow-md max-xl:fixed max-xl:top-18 max-xl:right-3 max-xl:bottom-3 max-xl:z-90 max-xl:w-[min(27.5rem,calc(100vw-1.5rem))]" aria-label={`${selected.reference} details`}>
          <header className="flex justify-between gap-3 border-b border-border bg-muted p-4"><div><span className="text-xs font-extrabold tracking-wide text-primary">{selected.reference}</span><h3 className="my-1 text-lg font-bold">{selected.title}</h3><p className="m-0 text-xs leading-relaxed text-muted-foreground">{selected.subtitle}</p></div><Button variant="outline" size="icon" type="button" aria-label="Close detail" onClick={() => setDetailOpen(false)}>×</Button></header>
          <div className="flex items-center justify-between gap-2.5 px-4 py-3"><Status value={selected.status} tone={selected.tone} />{selected.progress !== undefined ? <span className="text-xs font-bold text-muted-foreground">{selected.progress}% complete</span> : null}</div>
          {selected.progress !== undefined ? <div className="mx-4 mb-3 h-1.25 overflow-hidden rounded-full bg-border"><i className="block h-full rounded-full bg-[var(--nx-success)]" style={{ width: `${Math.max(0, Math.min(100, selected.progress))}%` }} /></div> : null}
          <section className="border-t border-border px-4 py-3"><h4 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-primary">Record summary</h4><dl className="m-0 grid gap-2">{selected.fields.map(([label, value]) => <div className="grid grid-cols-[minmax(6.5625rem,.75fr)_minmax(0,1.25fr)] gap-2.5" key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="m-0 overflow-wrap-anywhere text-right text-xs font-semibold">{value}</dd></div>)}</dl></section>
          {selected.blockers?.length ? <section className="grid gap-2 border-t border-border bg-[var(--nx-warning-soft)] px-4 py-3"><h4 className="mb-0 text-xs font-bold uppercase tracking-wide text-[var(--nx-warning)]">Controls & exceptions</h4>{selected.blockers.map((item) => <p className="m-0 flex gap-2 text-xs leading-relaxed text-[var(--nx-warning)]" key={item}><b className="grid size-4.5 shrink-0 place-items-center rounded-full bg-[var(--nx-warning)] text-xs text-primary-foreground">!</b><span>{item}</span></p>)}</section> : <section className="flex items-center gap-2 border-t border-border bg-[var(--nx-success-soft)] px-4 py-3"><b className="grid size-6.5 shrink-0 place-items-center rounded-full bg-[var(--nx-success)] text-primary-foreground">✓</b><div className="grid gap-0.5"><strong className="text-xs text-[var(--nx-success-text)]">Control checks clear</strong><span className="text-xs text-[var(--nx-success-text)]">No blocking exception is recorded for this state.</span></div></section>}
          {selected.note ? <section className="border-t border-border px-4 py-3"><h4 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-primary">Business context</h4><p className="m-0 text-xs leading-relaxed">{selected.note}</p></section> : null}
          <section className="border-t border-border px-4 py-3"><h4 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-primary">Available actions</h4><div className="grid gap-2">{(selected.actions ?? ["Open record", "View audit trail"]).map((action, index) => <Button key={action} variant={index === 0 ? "default" : "outline"} type="button" onClick={() => onAction(action, selected.reference)}>{action}</Button>)}</div></section>
          <footer className="flex items-center justify-between gap-2 border-t border-border bg-muted px-4 py-3"><span className="text-xs text-muted-foreground">Prototype data · no real HR transaction will be changed</span><Button variant="outline" type="button" onClick={() => onAction("Open audit trail", selected.reference)}>Audit trail</Button></footer>
        </aside> : null}
      </section>
    </div>
  );
}
