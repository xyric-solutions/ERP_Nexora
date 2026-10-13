"use client";

/**
 * HR Phase 4 presentation: recruitment, performance/development and the
 * employee lifecycle. All values come from the deterministic Phase 4 fixture
 * modules. Buttons are prototype interactions only and never mutate Demo data.
 */

import { useMemo, useState } from "react";
import { employeeName, orgUnitName } from "./hr-core-data";
import { formatMoney } from "./hr-payroll-data";
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
} from "./hr-recruitment-data";
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
} from "./hr-performance-data";
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
} from "./hr-lifecycle-data";

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
  return <span className={`nx-hr4-status nx-hr4-status--${tone}`}>{value}</span>;
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
    <div className="nx-hr4">
      <section className="nx-hr4-hero">
        <div><span>{model.family}</span><h2>{model.title}</h2><p>{model.description}</p></div>
        <div className="nx-hr4-hero__actions"><button type="button" onClick={() => onAction("Export", model.title)}>Export</button><button type="button" className="is-primary" onClick={() => onAction(model.primaryAction, model.title)}>+ {model.primaryAction}</button></div>
      </section>

      <nav className="nx-hr4-nav" aria-label="HR lifecycle areas">
        {familyLinks.map(([label, target]) => <button key={target} className={pageId === target || (label === "Recruitment" && pageId.startsWith("recruit")) ? "is-active" : ""} type="button" onClick={() => onNavigate("hr", target)}>{label}</button>)}
      </nav>

      <section className="nx-hr4-metrics" aria-label={`${model.title} summary`}>
        {model.metrics.map((metric) => <article key={metric.label} data-tone={metric.tone ?? "neutral"}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.hint}</small></article>)}
      </section>

      {pageId === "recruitment-pipeline" ? <section className="nx-hr4-funnel" aria-label="Recruitment funnel">{recruitmentFunnel().map((row, index, all) => <article key={row.stage}><div><span>{row.stage}</span><strong>{row.count}</strong></div><i><b style={{ width: `${Math.max(8, (row.count / Math.max(1, all[0].count)) * 100)}%` }} /></i><small>{index === 0 ? "Applicants" : `${Math.round((row.count / Math.max(1, all[index - 1].count)) * 100)}% stage conversion`}</small></article>)}</section> : null}

      <section className="nx-hr4-workflow" aria-label="Workflow lifecycle">
        {model.lifecycle.map((stage, index) => <div key={stage}><b>{index + 1}</b><span>{stage}</span></div>)}
      </section>

      <section className={`nx-hr4-workspace ${detailOpen ? "has-detail" : ""}`}>
        <div className="nx-hr4-register">
          <div className="nx-hr4-filters">
            <label className="nx-hr4-search"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Reference, employee, owner or status…" /></label>
            <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Period</span><select defaultValue="Current year"><option>Current year</option><option>Current quarter</option><option>Last 30 days</option><option>Custom range</option></select></label>
            <button type="button" onClick={() => { setQuery(""); setStatus("All statuses"); }}>Reset</button>
          </div>
          <div className="nx-hr4-register__head"><div><strong>{visible.length}</strong><span> records</span></div><div><button type="button" onClick={() => onAction("Saved views", model.title)}>Saved views</button><button type="button" onClick={() => onAction("More filters", model.title)}>More filters</button></div></div>
          <div className="nx-table-wrap">
            <table className="nx-data-table nx-hr4-table">
              <thead><tr><th>Reference</th><th>Employee / subject</th><th>Context</th><th>Status</th><th>Owner</th><th>Date</th><th aria-label="Open record" /></tr></thead>
              <tbody>{visible.map((row) => <tr key={row.id} className={selected?.id === row.id ? "is-selected" : ""} onClick={() => { setSelectedId(row.id); setDetailOpen(true); }}><td><button type="button" className="nx-hr4-link" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id); setDetailOpen(true); }}>{row.reference}</button></td><td><strong>{row.title}</strong></td><td>{row.subtitle}</td><td><Status value={row.status} tone={row.tone} /></td><td>{row.owner ?? "—"}</td><td>{row.date ?? "—"}</td><td>›</td></tr>)}</tbody>
            </table>
          </div>
          {visible.length === 0 ? <div className="nx-hr4-empty"><strong>No matching records</strong><span>Clear filters or search a different reference, person, owner or status.</span></div> : null}
        </div>

        {detailOpen && selected ? <aside className="nx-hr4-detail" aria-label={`${selected.reference} details`}>
          <header><div><span>{selected.reference}</span><h3>{selected.title}</h3><p>{selected.subtitle}</p></div><button type="button" aria-label="Close detail" onClick={() => setDetailOpen(false)}>×</button></header>
          <div className="nx-hr4-detail__status"><Status value={selected.status} tone={selected.tone} />{selected.progress !== undefined ? <span>{selected.progress}% complete</span> : null}</div>
          {selected.progress !== undefined ? <div className="nx-hr4-progress"><i style={{ width: `${Math.max(0, Math.min(100, selected.progress))}%` }} /></div> : null}
          <section><h4>Record summary</h4><dl>{selected.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
          {selected.blockers?.length ? <section className="nx-hr4-exceptions"><h4>Controls & exceptions</h4>{selected.blockers.map((item) => <p key={item}><b>!</b><span>{item}</span></p>)}</section> : <section className="nx-hr4-clear"><b>✓</b><div><strong>Control checks clear</strong><span>No blocking exception is recorded for this state.</span></div></section>}
          {selected.note ? <section><h4>Business context</h4><p className="nx-hr4-note">{selected.note}</p></section> : null}
          <section><h4>Available actions</h4><div className="nx-hr4-actions">{(selected.actions ?? ["Open record", "View audit trail"]).map((action, index) => <button key={action} className={index === 0 ? "is-primary" : ""} type="button" onClick={() => onAction(action, selected.reference)}>{action}</button>)}</div></section>
          <footer><span>Prototype data · no real HR transaction will be changed</span><button type="button" onClick={() => onAction("Open audit trail", selected.reference)}>Audit trail</button></footer>
        </aside> : null}
      </section>
    </div>
  );
}
