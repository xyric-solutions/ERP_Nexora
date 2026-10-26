import {LearningDevelopment} from "./learning.js";
import type {HrLearningQuery,HrLearningAction} from "@nexora/contracts";
import type {HrSelfLeaveContextQuery,CreateHrSelfLeaveRequest,HrSelfLeaveAction} from '@nexora/contracts';
import {PersonalDataCorrections} from './personal-corrections.js';
import {HrReportGovernance} from './report-governance.js';
import type {HrGovernedDependencies} from './governed.js';
import type {HrPersonalCorrectionQuery,CreateHrPersonalCorrection,HrPersonalCorrectionAction,HrReportGovernanceQuery,HrReportGovernanceAction,HrReportGovernanceResult} from '@nexora/contracts';
import { HrSelfService } from './self-service.js';
import type {HrSelfServiceQuery} from '@nexora/contracts';
import {SettlementBenefits} from './settlement-benefits.js';
import type {HrSettlementBenefitQuery,HrSettlementBenefitAction} from '@nexora/contracts';
import {SettlementEntitlements} from './settlement-entitlements.js';
import type {HrSettlementEntitlementQuery,HrSettlementEntitlementAction} from '@nexora/contracts';
import type {HrPolicyUpgradeQuery,HrPolicyUpgradeAction,HrPolicyUpgradeWorkspace} from '@nexora/contracts';
import {LifecycleCases} from './lifecycle-cases.js';
import type {HrLifecycleCaseQuery,HrLifecycleCaseAction,HrLifecycleCaseWorkspace} from '@nexora/contracts';
import type {HrPerformanceParticipationQuery,HrPerformanceParticipationAction,HrPerformanceParticipation} from '@nexora/contracts';
import {Performance} from './performance.js';
import type {HrPerformanceQuery,HrPerformanceCommand} from '@nexora/contracts';
import {PayrollPayslips} from './payroll-payslips.js';
import type {HrPayslipQuery,HrPayslipRelease} from '@nexora/contracts';
import {PayrollPayment} from './payroll-payment.js';
import type {HrPayrollPaymentQuery,HrPayrollPaymentAction,HrPayrollPaymentWorkspace} from '@nexora/contracts';
import {PayrollJournal} from './payroll-journal.js';
import type {HrPayrollJournalQuery,HrPayrollJournalAction} from '@nexora/contracts';
import {PayrollLocalizationSetup} from './payroll-localization-setup.js';
import type {HrLocalizationQuery,CreateHrLocalization,HrLocalizationDecision} from '@nexora/contracts';
import type {StatutoryExecutionMode} from './payroll-statutory.js';
import type {HrOvertimeMoneyQuery,CreateHrOvertimeMoney,HrOvertimeMoneyDecision,HrOvertimeMoneyWorkspace} from '@nexora/contracts';
import {PayrollOvertimeSetup} from './payroll-overtime-setup.js';
import {PayrollRuns} from './payroll-runs.js';
import {PayrollRunComparison} from './payroll-run-comparison.js';
import type {HrPayrollRunComparisonQuery} from '@nexora/contracts';
import type {HrPayrollRunQuery,HrPayrollRunAction,HrPayrollRunWorkspace} from '@nexora/contracts';
import {PayrollWorkspace,type PayrollWorkspaceDependencies} from './payroll-workspace.js';
import type {HrPayrollSection,HrPayrollWorkspaceQuery,HrPayrollWorkspace,HrPayrollItem,HrPayrollOptionsQuery,HrPayrollOptions,CreateHrPayrollRecord,HrPayrollRecordAction,HrPayrollMutationResult} from '@nexora/contracts';
import {TimeLeave} from './time-leave.js';
import type {AttendanceCompletionDependencies} from './attendance-completion.js';
import type {HrLeaveQuery,HrLeavePolicyInput,CreateHrLeaveTypeRequest,UpdateHrLeavePolicyRequest,HrLeaveTypeStatusRequest,HrLeavePolicy,HrLeaveType,HrLeaveTypeDirectory,HrLeaveAllocation,HrLeaveContextQuery,HrLeaveBalance,HrLeaveBalanceQuery,HrLeaveBalanceDirectory,HrLeaveLedgerQuery,HrLeaveLedger,HrLeaveBalancePostingRequest,HrLeaveContext,CreateHrLeaveRequest,HrLeaveRequestActionRequest,HrLeaveRequestQuery,HrLeaveRequestSummary,HrLeaveRequestDirectory,HrLeaveRequestDetail} from '@nexora/contracts';
import {AttendanceCompletion} from './attendance-completion.js';
import type {HrOvertimeQuery,HrOvertimeContextQuery,HrOvertimeRuleRequest,HrOvertimeRule,HrOvertimeEvidence,HrOvertimeContext,CreateHrOvertimeRequest,HrOvertimeActionRequest,HrAttendanceCompletionResult,HrOvertimeSummary,HrOvertimeDetail,HrOvertimeDirectory,HrAttendancePeriodQuery,HrAttendancePeriodActionRequest,HrAttendanceCloseDay,HrAttendanceCloseEmployee,HrAttendancePeriod,HrAttendancePeriodWorkspace,HrAttendancePayrollInputs} from '@nexora/contracts';
import { resolveHrShiftOnDate } from "./shift-resolution.js";
import { evaluateDailyAttendance, type AttendanceSource } from "./daily-attendance.js";
import { summarizeAttendanceMonth } from "./monthly-attendance.js";
import { createHash, randomUUID } from "node:crypto";

import { hrInterviewTemplates, hrRecruitmentEvidencePolicy } from "@nexora/contracts";
import { hrApplicationTransitions } from "@nexora/contracts";
import { evaluateApprovalActor, type AuthenticatedAccount } from "@nexora/auth";
import type {
  HrCorrectionQuery,HrCorrectionContextQuery,HrCorrectionContext,CreateHrCorrectionRequest,UpdateHrCorrectionRequest,HrCorrectionActionRequest,HrCorrectionSummary,HrCorrectionDirectory,HrCorrectionDetail,HrCorrectionEvidence,HrCorrectionResult,
  HrMonthlyAttendanceQuery, HrMonthlyAttendanceRow, HrMonthlyAttendanceDirectory, HrDailyAttendanceRow,
  HrDailyAttendanceQuery, HrDailyAttendanceDirectory,
  CreateHrEmployeeDraftRequest,
  HrEmployeeDraftResult,
  HrEmployeeDetail,
  HrEmployeeDirectory,
  HrCompanyDirectory,
  HrDashboardSummary,
  HrFinancePayrollDashboard,
  HrPositionsOrganization,
  HrPositionsOrganizationQuery,
  HrManpowerRequisitionDirectory,
  HrManpowerRequisitionQuery,
  CreateHrManpowerRequisitionRequest,
  HrManpowerRequisitionResult,
  SubmitHrManpowerRequisitionRequest,
  DecideHrManpowerRequisitionRequest,
  HrJobOpeningDirectory,
  HrJobOpeningQuery,
  CreateHrJobOpeningRequest,
  ChangeHrJobOpeningStateRequest,
  HrJobOpeningResult,
  HrApplicationDirectory, HrApplicationQuery, CreateHrApplicationRequest, ChangeHrApplicationStageRequest, HrApplicationResult, HrApplicationStage,
  HrInterviewWorkspaceQuery, HrInterviewPanelQuery, HrInterviewPanelDirectory, HrInterviewWorkspace, HrInterviewActionRequest, HrInterviewActionResult,
  HrOfferQuery, HrOfferContext, HrOfferDirectory, HrOfferDetail, CreateHrOfferRequest, UpdateHrOfferRequest, HrOfferActionRequest, HrOfferResult,
  CreateHrOfferEmployeeRequest, HrOfferEmployeeResult, HrOfferEmployeeWorkspace,
  CreateHrShiftRequest, UpdateHrShiftRequest, ChangeHrShiftStatusRequest, HrShiftQuery, HrShiftSummary, HrShiftDirectory, HrShiftDetail, HrShiftResult, HrShiftContext,
  HrShiftAllocationQuery, HrShiftAllocationContextQuery, HrShiftAllocationContext, CreateHrShiftAllocationRequest, CloseHrShiftAllocationRequest, HrShiftAllocationSummary, HrShiftAllocationDirectory, HrShiftAllocationDetail, HrShiftAllocationResult, HrShiftResolutionQuery, HrShiftResolution,
  HrCandidateDirectory,
  HrCandidateQuery,
  CreateHrCandidateRequest,
  ChangeHrCandidateStatusRequest,
  HrCandidateResult,
  HrOrganizationUnitDirectory,
  HrOrganizationUnitDirectoryQuery,
  CreateHrOrganizationUnitRequest,
  UpdateHrOrganizationUnitRequest,
  ChangeHrOrganizationUnitStatusRequest,
  HrOrganizationUnitMutationResult,
  HrEmployeeDirectoryQuery,
  HrEmployeeDraftDirectory,
  HrEmployeeDraftDetail,
  HrEmployeeDraftDirectoryQuery,
  HrMasterDirectory,
  HrMasterDirectoryQuery,
  CreateHrMasterRequest,
  UpdateHrMasterRequest,
  ChangeHrMasterStatusRequest,
  HrMasterMutationResult,
  HrJobGradeDirectory,
  CreateHrJobGradeRequest,
  UpdateHrJobGradeRequest,
  UpdateHrEmployeeDraftRequest,
  SubmitHrEmployeeDraftRequest,
  HrEmployeeDraftApprovalQueue,
  HrEmployeeDraftApprovalDetail,
  HrEmployeeDraftApprovalQueueQuery,
  DecideHrEmployeeDraftApprovalRequest,
  CreateHrProfileDraftAssignmentRequest,
  HrProfileDraftAssignmentResult,
  HrEmployeeContactDirectory,
  CreateHrEmployeeContactRequest,
  HrEmployeeContactResult,
  HrEmployeeEmergencyContactDirectory,
  CreateHrEmployeeEmergencyContactRequest,
  HrEmployeeEmergencyContactResult,
  HrEmployeeDocumentDirectory,
  HrEmployeeAssignmentDirectory,
  HrEmployeeStatusHistoryDirectory,
  HrEmployeeHistoryQuery,
  HrEmployeeLifecycleEventDirectory,
  HrEmployeeProfileVersionDirectory,
  HrEmploymentLifecyclePolicyDirectory,
  HrEmploymentLifecyclePolicyDirectoryQuery,
  CreateHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicyResult,
  SubmitHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicySubmissionResult,
  ApproveHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicyApprovalResult,
  ActivateHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicyActivationResult,
  CreateHrJobRequest,
  HrJobResult,
  CreateHrEmployeeHireRequest,
  HrEmployeeHireRequestResult,
  DecideHrEmployeeHireRequest,
  HrEmployeeHireDecisionResult,
  HrEmployeeHireRequestDirectory,
  HrEmployeeHireRequestDirectoryQuery,
  HrEmployeeHireRequestReview,
  CreateHrEmployeeTransferRequest,
  HrEmployeeTransferRequestResult,
  DecideHrEmployeeTransferRequest,
  HrEmployeeTransferDecisionResult,
  HrEmployeeTransferRequestDirectory,
  HrEmployeeTransferRequestDirectoryQuery,
  HrEmployeeTransferRequestReview,
  CreateHrEmployeePromotionRequest,
  HrEmployeePromotionRequestResult,
  DecideHrEmployeePromotionRequest,
  HrEmployeePromotionDecisionResult,
  HrEmployeePromotionRequestDirectory,
  HrEmployeePromotionRequestDirectoryQuery,
  HrEmployeePromotionRequestReview,
  CreateHrEmployeeManagerChangeRequest,
  HrEmployeeManagerChangeRequestResult,
  DecideHrEmployeeManagerChangeRequest,
  HrEmployeeManagerChangeDecisionResult,
  HrEmployeeManagerChangeRequestDirectory,
  HrEmployeeManagerChangeRequestDirectoryQuery,
  HrEmployeeManagerChangeRequestReview,
  CreateHrEmployeeWorkLocationChangeRequest,
  HrEmployeeWorkLocationChangeRequestResult,
  DecideHrEmployeeWorkLocationChangeRequest,
  HrEmployeeWorkLocationChangeDecisionResult,
  HrEmployeeWorkLocationChangeRequestDirectory,
  HrEmployeeWorkLocationChangeRequestDirectoryQuery,
  HrEmployeeWorkLocationChangeRequestReview,
  CreateHrEmployeeOrganizationPlacementChangeRequest,
  HrEmployeeOrganizationPlacementChangeRequestResult,
  DecideHrEmployeeOrganizationPlacementChangeRequest,
  HrEmployeeOrganizationPlacementChangeDecisionResult,
  HrEmployeeOrganizationPlacementChangeRequestDirectory,
  HrEmployeeOrganizationPlacementChangeRequestDirectoryQuery,
  HrEmployeeOrganizationPlacementChangeRequestReview,
  HrOrganizationPlacementSnapshot,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";

import { ApprovalOverrideWriterError, writeApprovalOverrideEvent } from "../security/approval-override-writer.js";

export class HrApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface HrActorContext {
  tenantId: string;
  actor: AuthenticatedAccount;
  realActorId?: string;
  impersonationRequestId?: string;
}

type EmployeeSummaryRow = Omit<HrEmployeeDirectory["items"][number], "joined_on"> & { joined_on: string | Date };
type EmployeeDetailRow = Omit<HrEmployeeDetail, "joined_on" | "reporting_manager"> & {
  joined_on: string | Date;
  reporting_manager_id: string | null;
  reporting_manager_number: string | null;
  reporting_manager_name: string | null;
};
type EmployeeAssignmentRow = Omit<
  HrEmployeeAssignmentDirectory["items"][number],
  "effective_from" | "effective_to" | "created_at"
> & {
  effective_from: string | Date;
  effective_to: string | Date | null;
  created_at: string | Date;
};
type EmployeeStatusHistoryRow = Omit<
  HrEmployeeStatusHistoryDirectory["items"][number],
  "effective_on" | "created_at"
> & {
  effective_on: string | Date;
  created_at: string | Date;
};
type EmployeeLifecycleEventRow = Omit<
  HrEmployeeLifecycleEventDirectory["items"][number],
  "effective_on" | "recorded_at" | "approved_at"
> & {
  effective_on: string | Date;
  recorded_at: string | Date;
  approved_at: string | Date;
};
type EmployeeProfileVersionRow = Omit<
  HrEmployeeProfileVersionDirectory["items"][number],
  "effective_from" | "effective_to" | "recorded_at" | "capture_origin"
> & {
  effective_from: string | Date;
  effective_to: string | Date | null;
  recorded_at: string | Date;
};
type EmploymentLifecyclePolicyRow = Omit<
  HrEmploymentLifecyclePolicyDirectory["items"][number],
  "effective_from" | "effective_to" | "self_decision_requires_override" | "super_admin_override_allowed"
> & {
  effective_from: string | Date;
  effective_to: string | Date | null;
  created_by: string;
  submitted_by: string | null;
};
type EmployeeHireRequestReviewRow = Omit<
  HrEmployeeHireRequestReview,
  "effective_on" | "requested_at" | "decided_at"
> & {
  effective_on: string | Date;
  requested_at: string | Date;
  decided_at: string | Date | null;
};
type EmployeeTransferRequestReviewRow = Omit<
  HrEmployeeTransferRequestReview,
  "effective_on" | "requested_at" | "decided_at"
> & {
  effective_on: string | Date;
  requested_at: string | Date;
  decided_at: string | Date | null;
};
type EmployeePromotionRequestReviewRow = Omit<
  HrEmployeePromotionRequestReview,
  "effective_on" | "requested_at" | "decided_at"
> & {
  effective_on: string | Date;
  requested_at: string | Date;
  decided_at: string | Date | null;
};
type EmployeeManagerChangeRequestReviewRow = Omit<
  HrEmployeeManagerChangeRequestReview,
  "effective_on" | "requested_at" | "decided_at"
> & {
  effective_on: string | Date;
  requested_at: string | Date;
  decided_at: string | Date | null;
};
type EmployeeWorkLocationChangeRequestReviewRow = Omit<
  HrEmployeeWorkLocationChangeRequestReview,
  "effective_on" | "requested_at" | "decided_at"
> & {
  effective_on: string | Date;
  requested_at: string | Date;
  decided_at: string | Date | null;
};
type EmployeeOrganizationPlacementChangeRequestReviewRow = Omit<
  HrEmployeeOrganizationPlacementChangeRequestReview,
  "effective_on" | "requested_at" | "decided_at"
> & {
  effective_on: string | Date;
  requested_at: string | Date;
  decided_at: string | Date | null;
};

function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function employeeSummary(row: EmployeeSummaryRow): HrEmployeeDirectory["items"][number] {
  return { ...row, joined_on: dateOnly(row.joined_on) };
}

function approvalOverrideReviewMetadata(
  context: HrActorContext,
  makerActorIds: readonly string[],
  normalDecisionPermission: string,
): { self_decision_requires_override: boolean; super_admin_override_allowed: boolean } {
  const selfDecisionRequiresOverride = makerActorIds.includes(context.actor.userId);
  const policy = evaluateApprovalActor({
    account: context.actor,
    makerActorIds,
    normalDecisionPermission,
    impersonated: Boolean(
      context.impersonationRequestId ||
      (context.realActorId !== undefined && context.realActorId !== context.actor.userId),
    ),
  });
  return {
    self_decision_requires_override: selfDecisionRequiresOverride,
    super_admin_override_allowed: selfDecisionRequiresOverride && policy.kind === "override",
  };
}

function employeeHireRequestReview(
  row: EmployeeHireRequestReviewRow,
  context: HrActorContext,
): HrEmployeeHireRequestReview {
  return {
    ...row,
    effective_on: dateOnly(row.effective_on),
    requested_at: new Date(row.requested_at).toISOString(),
    decided_at: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    ...approvalOverrideReviewMetadata(context, [row.requested_by], "hr.employment_lifecycle.approve"),
  };
}

function employeeTransferRequestReview(
  row: EmployeeTransferRequestReviewRow,
  context: HrActorContext,
): HrEmployeeTransferRequestReview {
  return {
    ...row,
    effective_on: dateOnly(row.effective_on),
    requested_at: new Date(row.requested_at).toISOString(),
    decided_at: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    ...approvalOverrideReviewMetadata(context, [row.requested_by], "hr.employee_assignment.change"),
  };
}

function employeePromotionRequestReview(
  row: EmployeePromotionRequestReviewRow,
  context: HrActorContext,
): HrEmployeePromotionRequestReview {
  return {
    ...row,
    effective_on: dateOnly(row.effective_on),
    requested_at: new Date(row.requested_at).toISOString(),
    decided_at: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    ...approvalOverrideReviewMetadata(context, [row.requested_by], "hr.employee_assignment.change"),
  };
}

function employeeManagerChangeRequestReview(
  row: EmployeeManagerChangeRequestReviewRow,
  context: HrActorContext,
): HrEmployeeManagerChangeRequestReview {
  return {
    ...row,
    effective_on: dateOnly(row.effective_on),
    requested_at: new Date(row.requested_at).toISOString(),
    decided_at: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    ...approvalOverrideReviewMetadata(context, [row.requested_by], "hr.employee_assignment.change"),
  };
}

function employeeWorkLocationChangeRequestReview(
  row: EmployeeWorkLocationChangeRequestReviewRow,
  context: HrActorContext,
): HrEmployeeWorkLocationChangeRequestReview {
  return {
    ...row,
    effective_on: dateOnly(row.effective_on),
    requested_at: new Date(row.requested_at).toISOString(),
    decided_at: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    ...approvalOverrideReviewMetadata(context, [row.requested_by], "hr.employee_assignment.change"),
  };
}

function employeeOrganizationPlacementChangeRequestReview(
  row: EmployeeOrganizationPlacementChangeRequestReviewRow,
  context: HrActorContext,
): HrEmployeeOrganizationPlacementChangeRequestReview {
  return {
    ...row,
    effective_on: dateOnly(row.effective_on),
    requested_at: new Date(row.requested_at).toISOString(),
    decided_at: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    ...approvalOverrideReviewMetadata(context, [row.requested_by], "hr.employee_assignment.change"),
  };
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

function stateHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value)), "utf8")
    .digest("hex");
}

function validIdempotencyKey(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(value);
}

type EmployeeHistoryCursor = { version: 1; kind: "lifecycle" | "profile"; recordedAt: string; id: string };

function encodeEmployeeHistoryCursor(
  kind: EmployeeHistoryCursor["kind"],
  recordedAt: string | Date,
  id: string,
): string {
  return Buffer.from(
    JSON.stringify({ version: 1, kind, recordedAt: new Date(recordedAt).toISOString(), id }),
    "utf8",
  ).toString("base64url");
}

function decodeEmployeeHistoryCursor(
  value: string | undefined,
  expectedKind: EmployeeHistoryCursor["kind"],
): EmployeeHistoryCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<EmployeeHistoryCursor>;
    if (
      parsed.version !== 1 ||
      parsed.kind !== expectedKind ||
      typeof parsed.recordedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.recordedAt)) ||
      typeof parsed.id !== "string" ||
      parsed.id.length < 1 ||
      parsed.id.length > 128
    )
      throw new Error("invalid cursor");
    return parsed as EmployeeHistoryCursor;
  } catch {
    throw new HrApiError(400, "HR_HISTORY_CURSOR_INVALID", "The employee history cursor is invalid.");
  }
}

export class SourceHrRepository {
  constructor(private readonly pool: Pool,private readonly statutoryMode:StatutoryExecutionMode='production') {}

  private attendanceDependencies():AttendanceCompletionDependencies{return {pool:this.pool,read:(context,permission,operation)=>this.read(context,permission,operation),company:(...args)=>this.requireCompanyAccess(...args),evidence:(...args)=>this.correctionEvidence(...args),employees:(...args)=>this.selectAttendanceEmployees(...args),days:(...args)=>this.readAttendanceDays(...args),override:(...args)=>this.resolveApprovalOverride(...args),audit:(client,context,corr,id,before,after)=>this.appendPlatformAudit(client,context,corr,'hr.attendance.completion',{entityId:id,before,after,sourceReference:'hr:attendance-completion:'+id})};}
  private completion(){return new AttendanceCompletion(this.attendanceDependencies());}
  private payrollDependencies():PayrollWorkspaceDependencies{const d=this.attendanceDependencies();return {...d,audit:(client,context,corr,id,before,after)=>this.appendPlatformAudit(client,context,corr,'hr.payroll.workspace',{entityId:id,entityType:'hr_payroll_workspace',before,after,sourceReference:'hr:payroll:'+id})};}
  private payrollWorkspace(){return new PayrollWorkspace(this.payrollDependencies());}
  private overtimeMoney(){return new PayrollOvertimeSetup(this.payrollDependencies());}
  async getOvertimeMoneyWorkspace(c:HrActorContext,q:HrOvertimeMoneyQuery):Promise<HrOvertimeMoneyWorkspace>{return this.overtimeMoney().workspace(c,q);}
  async createOvertimeMoney(c:HrActorContext,input:CreateHrOvertimeMoney,key:string,corr:string){return this.overtimeMoney().create(c,input,key,corr);}
  async decideOvertimeMoney(c:HrActorContext,id:string,input:HrOvertimeMoneyDecision,key:string,corr:string){return this.overtimeMoney().action(c,id,input,key,corr);}
  private localization(){return new PayrollLocalizationSetup(this.payrollDependencies(),this.statutoryMode);}
  async getPayrollLocalization(c:HrActorContext,q:HrLocalizationQuery){return this.localization().workspace(c,q);}
  async createPayrollLocalization(c:HrActorContext,input:CreateHrLocalization,key:string,corr:string){return this.localization().create(c,input,key,corr);}
  async decidePayrollLocalization(c:HrActorContext,id:string,input:HrLocalizationDecision,key:string,corr:string){return this.localization().action(c,id,input,key,corr);}
  private payrollPayment(){return new PayrollPayment(this.payrollDependencies());}
  async getPayrollPaymentWorkspace(c:HrActorContext,q:HrPayrollPaymentQuery):Promise<HrPayrollPaymentWorkspace>{return this.payrollPayment().workspace(c,q);}
  async actOnPayrollPayment(c:HrActorContext,input:HrPayrollPaymentAction,key:string,corr:string){return this.payrollPayment().action(c,input,key,corr);}
  async getSelfService(c:HrActorContext,q:HrSelfServiceQuery){return new HrSelfService(this.pool).workspace(c,q);}
  async getSelfServicePayslip(c:HrActorContext,company:string,id:string){return new HrSelfService(this.pool).payslip(c,company,id);}
  private payrollPayslips(){return new PayrollPayslips(this.payrollDependencies());}
  async getPayslipWorkspace(c:HrActorContext,q:HrPayslipQuery){return this.payrollPayslips().workspace(c,q);}
  async getPayslipDetail(c:HrActorContext,company:string,id:string){return this.payrollPayslips().detail(c,company,id);}
  async releasePayslips(c:HrActorContext,input:HrPayslipRelease,key:string,corr:string){return this.payrollPayslips().release(c,input,key,corr);}
  private policyUpgrades(){const d=this.payrollDependencies();return new LifecycleCases({...d,audit:(client,c,corr,id,before,after)=>this.appendPlatformAudit(client,c,corr,'hr.lifecycle.policy_upgrade',{entityId:id,entityType:'hr_employment_policy_adoption',before,after,sourceReference:'hr:policy-upgrade:'+id})});}
  async getPolicyUpgrades(c:HrActorContext,q:HrPolicyUpgradeQuery){return this.policyUpgrades().policyUpgrades(c,q);}
  async actOnPolicyUpgrade(c:HrActorContext,input:HrPolicyUpgradeAction,key:string,corr:string){return this.policyUpgrades().policyUpgradeAction(c,input,key,corr);}
  private settlementEntitlements(){const d=this.payrollDependencies();return new SettlementEntitlements({...d,audit:(client,c,corr,id,before,after)=>this.appendPlatformAudit(client,c,corr,'hr.lifecycle.workspace',{entityId:id,entityType:'hr_settlement_entitlement',before,after,sourceReference:'hr:settlement-entitlement:'+id})});}
  async getSettlementEntitlements(c:HrActorContext,q:HrSettlementEntitlementQuery){return this.settlementEntitlements().workspace(c,q);}
  async actOnSettlementEntitlement(c:HrActorContext,input:HrSettlementEntitlementAction,key:string,corr:string){return this.settlementEntitlements().command(c,input,key,corr);}
  private settlementBenefits(){const d=this.payrollDependencies();return new SettlementBenefits({...d,audit:(client,c,corr,id,before,after)=>this.appendPlatformAudit(client,c,corr,'hr.lifecycle.workspace',{entityId:id,entityType:'hr_settlement_entitlement',before,after,sourceReference:'hr:settlement-benefit:'+id})});}
  async getSettlementBenefits(c:HrActorContext,q:HrSettlementBenefitQuery){return this.settlementBenefits().workspace(c,q);}
  async actOnSettlementBenefit(c:HrActorContext,input:HrSettlementBenefitAction,key:string,corr:string){return this.settlementBenefits().command(c,input,key,corr);}
  private lifecycleCases(){const d=this.payrollDependencies();return new LifecycleCases({...d,audit:(client,c,corr,id,before,after)=>this.appendPlatformAudit(client,c,corr,'hr.lifecycle.workspace',{entityId:id,entityType:'hr_lifecycle_case',before,after,sourceReference:'hr:lifecycle-case:'+id})});}
  async getLifecycleCaseWorkspace(c:HrActorContext,q:HrLifecycleCaseQuery){return this.lifecycleCases().workspace(c,q);}
  async actOnLifecycleCase(c:HrActorContext,input:HrLifecycleCaseAction,key:string,corr:string){return this.lifecycleCases().command(c,input,key,corr);}
  private performance(){const d=this.payrollDependencies();return new Performance({...d,audit:(client,c,corr,id,before,after)=>this.appendPlatformAudit(client,c,corr,'hr.performance.workspace',{entityId:id,entityType:'hr_performance_record',before,after,sourceReference:'hr:performance:'+id})});}
  async getPerformanceWorkspace(c:HrActorContext,q:HrPerformanceQuery){return this.performance().workspace(c,q);}
  async actOnPerformance(c:HrActorContext,input:HrPerformanceCommand,key:string,corr:string){return this.performance().command(c,input,key,corr);}
  async getPerformanceInbox(c:HrActorContext){return this.performance().participationInbox(c);}
  async getPerformanceParticipation(c:HrActorContext,q:HrPerformanceParticipationQuery){return this.performance().participation(c,q);}
  async actOnPerformanceParticipation(c:HrActorContext,input:HrPerformanceParticipationAction,key:string,corr:string){return this.performance().participationAction(c,input,key,corr);}
  private payrollJournal(){return new PayrollJournal(this.payrollDependencies(),this.statutoryMode);}
  async getPayrollJournalWorkspace(c:HrActorContext,q:HrPayrollJournalQuery){return this.payrollJournal().workspace(c,q);}
  async actOnPayrollJournal(c:HrActorContext,input:HrPayrollJournalAction,key:string,corr:string){return this.payrollJournal().action(c,input,key,corr);}
  async getPayrollRunComparison(c:HrActorContext,q:HrPayrollRunComparisonQuery){return new PayrollRunComparison(this.payrollDependencies()).read(c,q);}
  private payrollRuns(){return new PayrollRuns({...this.payrollDependencies(),statutoryMode:this.statutoryMode});}
  async getPayrollRunWorkspace(c:HrActorContext,q:HrPayrollRunQuery){return this.payrollRuns().workspace(c,q);}
  async actOnPayrollRun(c:HrActorContext,input:HrPayrollRunAction,key:string,corr:string){return this.payrollRuns().action(c,input,key,corr);}
  async getPayrollWorkspace(c:HrActorContext,q:HrPayrollWorkspaceQuery){return this.payrollWorkspace().workspace(c,q);}
  async getPayrollOptions(c:HrActorContext,q:HrPayrollOptionsQuery){return this.payrollWorkspace().options(c,q);}
  async createPayrollRecord(c:HrActorContext,input:CreateHrPayrollRecord,key:string,corr:string){return this.payrollWorkspace().create(c,input,key,corr);}
  async actOnPayrollRecord(c:HrActorContext,id:string,input:HrPayrollRecordAction,key:string,corr:string){return this.payrollWorkspace().action(c,id,input,key,corr);}
  async getLearning(c:HrActorContext,q:HrLearningQuery){return new LearningDevelopment(this.governanceDependencies()).workspace(c,q);}
  async actOnLearning(c:HrActorContext,input:HrLearningAction,key:string,corr:string){return new LearningDevelopment(this.governanceDependencies()).action(c,input,key,corr);}
  async getLearningCertificate(c:HrActorContext,company:string,id:string){return new LearningDevelopment(this.governanceDependencies()).certificate(c,company,id);}
  private governanceDependencies():HrGovernedDependencies{return {pool:this.pool,audit:(client,c,corr,type,id,before,after)=>this.appendPlatformAudit(client,c,corr,type,{entityId:id,entityType:type==='hr.personal_data.correction'?'hr_personal_data_correction':type==='hr.learning.workflow'?'hr_learning_record':'hr_report_export',before,after,sourceReference:'hr:governance:'+id})};}
  private personalCorrections(){return new PersonalDataCorrections({...this.governanceDependencies(),recordProfile:(client,c,employee,profile,reference)=>this.recordEmployeeProfileVersion(client,c,employee,profile,reference)});}
  async getPersonalCorrections(c:HrActorContext,q:HrPersonalCorrectionQuery){return this.personalCorrections().workspace(c,q);}
  async createPersonalCorrection(c:HrActorContext,input:CreateHrPersonalCorrection,key:string,corr:string){return this.personalCorrections().create(c,input,key,corr);}
  async actOnPersonalCorrection(c:HrActorContext,id:string,input:HrPersonalCorrectionAction,key:string,corr:string){return this.personalCorrections().action(c,id,input,key,corr);}
  async getReportGovernance(c:HrActorContext,q:HrReportGovernanceQuery){return new HrReportGovernance(this.governanceDependencies()).workspace(c,q);}
  async actOnReportGovernance(c:HrActorContext,input:HrReportGovernanceAction,key:string,corr:string){return new HrReportGovernance(this.governanceDependencies()).action(c,input,key,corr);}
  private personalLeave(){return new TimeLeave(this.attendanceDependencies(),true);}
  async getSelfLeaveContext(c:HrActorContext,q:HrSelfLeaveContextQuery){return this.personalLeave().leaveContext(c,q);}
  async getSelfLeaveRequest(c:HrActorContext,company:string,id:string){return this.personalLeave().getLeaveRequest(c,company,id);}
  async createSelfLeaveRequest(c:HrActorContext,input:CreateHrSelfLeaveRequest,key:string,corr:string){return this.personalLeave().createOwnLeaveRequest(c,input,key,corr);}
  async actOnSelfLeaveRequest(c:HrActorContext,id:string,input:HrSelfLeaveAction,key:string,corr:string){return this.personalLeave().actOnLeaveRequest(c,id,{...input,override_self_approval:false},key,corr);}
  private timeLeave(){return new TimeLeave(this.attendanceDependencies());}
  async listLeaveTypes(context:HrActorContext,q:HrLeaveQuery):Promise<HrLeaveTypeDirectory>{return this.timeLeave().listLeaveTypes(context,q);}
  async createLeaveType(context:HrActorContext,input:CreateHrLeaveTypeRequest,key:string,corr:string):Promise<HrAttendanceCompletionResult>{return this.timeLeave().createLeaveType(context,input,key,corr);}
  async updateLeavePolicy(context:HrActorContext,id:string,input:UpdateHrLeavePolicyRequest,key:string,corr:string):Promise<HrAttendanceCompletionResult>{return this.timeLeave().updateLeavePolicy(context,id,input,key,corr);}
  async changeLeaveTypeStatus(context:HrActorContext,id:string,input:HrLeaveTypeStatusRequest,key:string,corr:string):Promise<HrAttendanceCompletionResult>{return this.timeLeave().changeLeaveTypeStatus(context,id,input,key,corr);}
  async listLeaveBalances(context:HrActorContext,q:HrLeaveBalanceQuery):Promise<HrLeaveBalanceDirectory>{return this.timeLeave().listLeaveBalances(context,q);}
  async leaveLedger(context:HrActorContext,q:HrLeaveLedgerQuery):Promise<HrLeaveLedger>{return this.timeLeave().leaveLedger(context,q);}
  async postLeaveBalance(context:HrActorContext,input:HrLeaveBalancePostingRequest,key:string,corr:string):Promise<HrAttendanceCompletionResult>{return this.timeLeave().postLeaveBalance(context,input,key,corr);}
  async leaveContext(context:HrActorContext,q:HrLeaveContextQuery):Promise<HrLeaveContext>{return this.timeLeave().leaveContext(context,q);}
  async listLeaveRequests(context:HrActorContext,q:HrLeaveRequestQuery):Promise<HrLeaveRequestDirectory>{return this.timeLeave().listLeaveRequests(context,q);}
  async getLeaveRequest(context:HrActorContext,company:string,id:string):Promise<HrLeaveRequestDetail>{return this.timeLeave().getLeaveRequest(context,company,id);}
  async createLeaveRequest(context:HrActorContext,input:CreateHrLeaveRequest,key:string,corr:string):Promise<HrAttendanceCompletionResult>{return this.timeLeave().createLeaveRequest(context,input,key,corr);}
  async actOnLeaveRequest(context:HrActorContext,id:string,input:HrLeaveRequestActionRequest,key:string,corr:string):Promise<HrAttendanceCompletionResult>{return this.timeLeave().actOnLeaveRequest(context,id,input,key,corr);}
  async listOvertime(context:HrActorContext,q:HrOvertimeQuery):Promise<HrOvertimeDirectory>{return this.completion().listOvertime(context,q);}
  async overtimeContext(context:HrActorContext,q:HrOvertimeContextQuery):Promise<HrOvertimeContext>{return this.completion().overtimeContext(context,q);}
  async getOvertime(context:HrActorContext,company:string,id:string):Promise<HrOvertimeDetail>{return this.completion().getOvertime(context,company,id);}
  async createOvertimeRule(context:HrActorContext,input:HrOvertimeRuleRequest,key:string,corr:string):Promise<HrAttendanceCompletionResult>{return this.completion().createOvertimeRule(context,input,key,corr);}
  async createOvertime(context:HrActorContext,input:CreateHrOvertimeRequest,key:string,corr:string):Promise<HrAttendanceCompletionResult>{return this.completion().createOvertime(context,input,key,corr);}
  async actOnOvertime(context:HrActorContext,id:string,input:HrOvertimeActionRequest,key:string,corr:string):Promise<HrAttendanceCompletionResult>{return this.completion().actOnOvertime(context,id,input,key,corr);}
  async periodWorkspace(context:HrActorContext,q:HrAttendancePeriodQuery):Promise<HrAttendancePeriodWorkspace>{return this.completion().periodWorkspace(context,q);}
  async payrollInputs(context:HrActorContext,q:HrAttendancePeriodQuery):Promise<HrAttendancePayrollInputs>{return this.completion().payrollInputs(context,q);}
  async actOnPeriod(context:HrActorContext,input:HrAttendancePeriodActionRequest,key:string,corr:string):Promise<HrAttendanceCompletionResult>{return this.completion().actOnPeriod(context,input,key,corr);}
  async listCompanies(context: HrActorContext): Promise<HrCompanyDirectory> {
    return this.read(
      context,
      [
        "hr.leave.type.read",
        "hr.leave.balance.read",
        "hr.leave.request.read",
        "hr.attendance.overtime.read",
        "hr.attendance.overtime_rule.manage",
        "hr.attendance.period.read",
        "hr.attendance.payroll_input.read",
        "hr.attendance.correction.read",
        "hr.attendance.read",
        "hr.attendance.shift.read",
        "hr.attendance.shift.manage",
        "hr.learning.read", "hr.report_export.read", "hr.report_audit.read", "hr.employee.read",
        "hr.employee.create",
        "hr.employee.submit",
        "hr.employee.approve",
        "hr.employee_contact.read",
        "hr.employee_contact.manage",
        "hr.employee_emergency_contact.read",
        "hr.employee_emergency_contact.manage",
        "hr.employee_document.read",
        "hr.employee_document.manage",
        "hr.employee_assignment.read",
        "hr.employment_history.read",
        "hr.employment_lifecycle_policy.read",
        "hr.employment_lifecycle_policy.manage",
        "hr.employment_lifecycle_policy.approve",
        "hr.employment_lifecycle.action",
        "hr.employment_relationship.create",
        "hr.employee_assignment.transfer",
        "hr.employee_assignment.change",
        "hr.payroll.setup.read",
        "hr.payroll.salary.read",
        "hr.payroll.adjustment.read",
        "hr.payroll.loan.read",
        "hr.payroll.payslip.read",
        "hr.payroll.period.read",
        "hr.payroll.result.read",
        "hr.payroll.report.read",
        "hr.payroll.payment.read",
      ],
      async (client) => {
        const result = await client.query<HrCompanyDirectory["items"][number]>(
          `select company.id, company.code, company.name
           from organization_unit company
           join security_user_company_access access
             on access.tenant_id = company.tenant_id and access.company_id = company.id
          where company.tenant_id = $1 and access.user_id = $2 and access.revoked_at is null
            and company.type = 'company' and company.status = 'active'
          order by company.name, company.code, company.id
          limit 100`,
          [context.tenantId, context.actor.userId],
        );
        return { items: result.rows };
      },
    );
  }

  async listOrganizationUnits(
    context: HrActorContext,
    query: HrOrganizationUnitDirectoryQuery,
  ): Promise<HrOrganizationUnitDirectory> {
    return this.read(
      context,
      [
        "hr.organization.read",
        "hr.employee_assignment.read",
        "hr.employee_assignment.create",
        "hr.employee_assignment.transfer",
        "hr.employee_assignment.change",
      ],
      async (client) => {
        await this.requireCompanyAccess(client, context, query.company_id);
        const values: unknown[] = [context.tenantId, query.company_id];
        const filters = ["unit.id<>$2", "unit.type in ('business_unit','division','branch','department','warehouse')"];
        if (!query.include_inactive) filters.push("unit.status='active'");
        if (query.type) filters.push(`unit.type=$${values.push(query.type)}`);
        values.push(query.limit);
        const result = await client.query<HrOrganizationUnitDirectory["items"][number]>(
          `with recursive company_tree as (
           select id,parent_id,type,code,name,status,created_at
             from organization_unit
            where tenant_id=$1 and id=$2 and type='company' and status='active'
           union all
           select child.id,child.parent_id,child.type,child.code,child.name,child.status,child.created_at
             from organization_unit child
             join company_tree parent on child.parent_id=parent.id
            where child.tenant_id=$1
         )
         select unit.id,unit.parent_id,unit.type,unit.code,unit.name,unit.status,unit.created_at,
                (select concat_ws(' ',employee.first_name,employee.last_name)
                   from hr_organization_head_assignment head_assignment
                   join employee on employee.tenant_id=head_assignment.tenant_id and employee.id=head_assignment.employee_id
                  where head_assignment.tenant_id=$1 and head_assignment.organization_unit_id=unit.id
                    and head_assignment.effective_from<=current_date
                    and (head_assignment.effective_to_exclusive is null or head_assignment.effective_to_exclusive>current_date)
                  order by head_assignment.effective_from desc limit 1) as head_name,
                (select count(*)::int from employee_assignment assignment
                  join employee_assignment_org_unit placement
                    on placement.tenant_id=assignment.tenant_id and placement.assignment_id=assignment.id
                  where assignment.tenant_id=$1 and assignment.company_id=$2
                    and assignment.assignment_status in ('active','legacy_compatibility')
                    and assignment.effective_from<=current_date
                    and (assignment.effective_to is null or assignment.effective_to>=current_date)
                    and placement.organization_unit_id=unit.id) as employee_count
           from company_tree unit
          where ${filters.join(" and ")}
          order by unit.type,unit.name,unit.code,unit.id
          limit $${values.length}`,
          values,
        );
        return { items: result.rows };
      },
    );
  }

  async createOrganizationUnit(
    context: HrActorContext,
    input: CreateHrOrganizationUnitRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrOrganizationUnitMutationResult> {
    return this.mutateOrganizationUnit(context, "create", undefined, input, idempotencyKey, correlationId);
  }

  async updateOrganizationUnit(
    context: HrActorContext,
    unitId: string,
    input: UpdateHrOrganizationUnitRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrOrganizationUnitMutationResult> {
    return this.mutateOrganizationUnit(context, "update", unitId, input, idempotencyKey, correlationId);
  }

  async changeOrganizationUnitStatus(
    context: HrActorContext,
    unitId: string,
    input: ChangeHrOrganizationUnitStatusRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrOrganizationUnitMutationResult> {
    return this.mutateOrganizationUnit(context, "status", unitId, input, idempotencyKey, correlationId);
  }

  private async mutateOrganizationUnit(
    context: HrActorContext,
    operation: "create" | "update" | "status",
    unitId: string | undefined,
    input: CreateHrOrganizationUnitRequest | UpdateHrOrganizationUnitRequest | ChangeHrOrganizationUnitStatusRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrOrganizationUnitMutationResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.organization.update"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to maintain the organization structure.");
    const client = await this.pool.connect();
    const path = operation === "create" ? "/api/v1/hr/organization_units" : `/api/v1/hr/organization_units/${unitId}/${operation}`;
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const fingerprint = stateHash({ unitId, input });
      const replay = await client.query<{ request_fingerprint: string; response_body: HrOrganizationUnitMutationResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another request.");
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const before = unitId
        ? (await client.query(`select id,parent_id,type,code,name,status from organization_unit where tenant_id=$1 and id=$2 for update`, [context.tenantId, unitId])).rows[0]
        : null;
      if (unitId && !before) throw new HrApiError(404, "HR_ORGANIZATION_UNIT_NOT_FOUND", "Organization unit was not found.");
      if (before?.type === "company") throw new HrApiError(409, "HR_COMPANY_ADMIN_REQUIRED", "Company records are maintained by platform administration.");
      let id = unitId;
      if (operation === "create") {
        const create = input as CreateHrOrganizationUnitRequest;
        const parentType = await this.requireOrganizationParent(client, context, create.company_id, create.parent_id);
        this.assertOrganizationParentType(create.type, parentType);
        id = `org-${randomUUID()}`;
        await client.query(
          `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status) values ($1,$2,$3,$4,$5,$6,'active')`,
          [id, context.tenantId, create.parent_id, create.type, create.code.toUpperCase(), create.name],
        );
      } else if (operation === "update") {
        const update = input as UpdateHrOrganizationUnitRequest;
        const parentType = await this.requireOrganizationParent(client, context, update.company_id, update.parent_id);
        this.assertOrganizationParentType(before.type, parentType);
        await client.query(`update organization_unit set parent_id=$3,code=$4,name=$5,updated_at=now() where tenant_id=$1 and id=$2`, [context.tenantId, unitId, update.parent_id, update.code.toUpperCase(), update.name]);
      } else {
        const change = input as ChangeHrOrganizationUnitStatusRequest;
        if (change.status === "inactive") {
          const roster=await client.query("select 1 from hr_shift_assignment where tenant_id=$1 and company_id=$2 and scope_id=$3 and scope in ('branch','department') and cancelled_at is null and (effective_to is null or effective_to>=current_date) limit 1",[context.tenantId,change.company_id,unitId]);
          if(roster.rowCount)throw new HrApiError(409,"HR_ORGANIZATION_UNIT_IN_SHIFT_USE","Close or cancel current/future shift defaults before deactivating this organisational unit.");
          const usage = await client.query<{ used: boolean }>(
            `select exists(select 1 from organization_unit where tenant_id=$1 and parent_id=$2 and status='active')
                 or exists(select 1 from employee_assignment assignment
                   join employee_assignment_org_unit placement on placement.tenant_id=assignment.tenant_id and placement.assignment_id=assignment.id
                  where assignment.tenant_id=$1 and assignment.assignment_status in ('active','legacy_compatibility')
                    and assignment.effective_from<=current_date and (assignment.effective_to is null or assignment.effective_to>=current_date)
                    and placement.organization_unit_id=$2) as used`,
            [context.tenantId, unitId],
          );
          if (usage.rows[0]?.used) throw new HrApiError(409, "HR_ORGANIZATION_UNIT_IN_USE", "Move active children and employee assignments before deactivating this unit.");
        } else if (before?.parent_id) {
          await this.requireOrganizationParent(client, context, change.company_id, before.parent_id);
        }
        await client.query(`update organization_unit set status=$3,updated_at=now() where tenant_id=$1 and id=$2`, [context.tenantId, unitId, change.status]);
      }
      const after = (await client.query(`select id,parent_id,type,code,name,status from organization_unit where tenant_id=$1 and id=$2`, [context.tenantId, id])).rows[0];
      const audit = await this.appendPlatformAudit(client, context, correlationId, `hr.organization.${operation}`, { entityId: id!, entityType: "organization_unit", before, after });
      const result = { id: id!, company_id: input.company_id, audit_event_id: audit, replayed: false };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "23505") throw new HrApiError(409, "HR_ORGANIZATION_UNIT_CODE_EXISTS", "That organization-unit code is already in use.");
      if (["23503", "23514"].includes(code)) throw new HrApiError(409, "HR_ORGANIZATION_HIERARCHY_INVALID", "The requested hierarchy change is invalid.");
      throw error;
    } finally {
      client.release();
    }
  }

  private async requireOrganizationParent(client: PoolClient, context: HrActorContext, companyId: string, parentId: string): Promise<string> {
    const parent = await client.query<{ id: string; type: string }>(
      `with recursive tree as (select id,parent_id,type,status from organization_unit where tenant_id=$1 and id=$2 and type='company'
        union all select child.id,child.parent_id,child.type,child.status from organization_unit child join tree parent on child.parent_id=parent.id where child.tenant_id=$1)
       select id,type from tree where id=$3 and status='active'`,
      [context.tenantId, companyId, parentId],
    );
    if (!parent.rows[0]) throw new HrApiError(409, "HR_ORGANIZATION_PARENT_INVALID", "The parent must be an active unit inside the selected company.");
    return parent.rows[0].type;
  }

  private assertOrganizationParentType(childType: string, parentType: string): void {
    const allowedParents: Record<string, readonly string[]> = {
      business_unit: ["company"],
      division: ["company", "business_unit"],
      branch: ["company", "business_unit", "division"],
      department: ["company", "business_unit", "division", "branch"],
      warehouse: ["company", "business_unit", "division", "branch"],
    };
    if (!allowedParents[childType]?.includes(parentType))
      throw new HrApiError(409, "HR_ORGANIZATION_PARENT_TYPE_INVALID", `A ${childType} cannot report to a ${parentType}.`);
  }

  async listEmployees(context: HrActorContext, query: HrEmployeeDirectoryQuery): Promise<HrEmployeeDirectory> {
    return this.read(context, "hr.employee.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = [
        "employee.tenant_id = $1",
        `assignment.company_id = $2`,
        "assignment.effective_from <= current_date",
        "(assignment.effective_to is null or assignment.effective_to >= current_date)",
      ];
      if (query.status) filters.push(`employee.status = $${values.push(query.status)}`);
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ', employee.first_name, employee.middle_name, employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeeSummaryRow>(
        `select employee.id, employee.employee_number,
                concat_ws(' ', employee.first_name, employee.middle_name, employee.last_name) as display_name,
                employee.work_email, employee.status, employee.joined_on,
                assignment.company_id, assignment.branch_id, branch.name as branch,
                assignment.department_id, department.name as department,
                designation.name as designation
           from employee
           join employee_assignment assignment
             on assignment.tenant_id = employee.tenant_id and assignment.employee_id = employee.id
           join organization_unit branch
             on branch.tenant_id = assignment.tenant_id and branch.id = assignment.branch_id
           join organization_unit department
             on department.tenant_id = assignment.tenant_id and department.id = assignment.department_id
           join hr_master_record designation
             on designation.tenant_id = assignment.tenant_id and designation.id = assignment.designation_id
          where ${filters.join(" and ")}
          order by employee.last_name, employee.first_name, employee.employee_number, employee.id
          limit $${values.length}`,
        values,
      );
      return { items: result.rows.map(employeeSummary) };
    });
  }

  async getDashboard(context: HrActorContext, companyId: string): Promise<HrDashboardSummary> {
    return this.read(context, "hr.employee.read", async (client) => {
      await this.requireCompanyAccess(client, context, companyId);
      const summary = await client.query<{
        active_headcount: number;
        draft_profiles: number;
        pending_employee_approvals: number;
        pending_movements: number;
        active_departments: number;
        recent_joiners: number;
        master_configuration_gaps: number;
      }>(
        `with recursive org_tree as (
           select id,parent_id,type,status from organization_unit where tenant_id=$1 and id=$2 and type='company'
           union all
           select child.id,child.parent_id,child.type,child.status
             from organization_unit child join org_tree parent on child.parent_id=parent.id
            where child.tenant_id=$1
         ), current_people as (
           select distinct employee.id,employee.status,employee.joined_on
             from employee
             join employee_assignment assignment on assignment.tenant_id=employee.tenant_id and assignment.employee_id=employee.id
            where employee.tenant_id=$1 and assignment.company_id=$2
              and assignment.assignment_status in ('active','legacy_compatibility')
              and assignment.effective_from<=current_date
              and (assignment.effective_to is null or assignment.effective_to>=current_date)
         )
         select
           (select count(*)::int from current_people where status in ('active','probation','confirmed','suspended')) as active_headcount,
           (select count(*)::int from hr_employee_draft_scope scope join employee on employee.tenant_id=scope.tenant_id and employee.id=scope.employee_id where scope.tenant_id=$1 and scope.company_id=$2 and employee.status='draft') as draft_profiles,
           (select count(*)::int from hr_employee_draft_approval approval join hr_employee_draft_scope scope on scope.tenant_id=approval.tenant_id and scope.employee_id=approval.employee_id where approval.tenant_id=$1 and scope.company_id=$2 and approval.state='pending') as pending_employee_approvals,
           ((select count(*) from hr_employment_lifecycle_request request join hr_employment_relationship relationship on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id where request.tenant_id=$1 and relationship.legal_employer_id=$2 and request.approval_state='pending')
            +(select count(*) from hr_employee_transfer_request where tenant_id=$1 and company_id=$2 and request_state='pending')
            +(select count(*) from hr_employee_promotion_request where tenant_id=$1 and company_id=$2 and request_state='pending')
            +(select count(*) from hr_employee_manager_change_request where tenant_id=$1 and company_id=$2 and request_state='pending')
            +(select count(*) from hr_employee_work_location_change_request where tenant_id=$1 and company_id=$2 and request_state='pending')
            +(select count(*) from hr_employee_organization_placement_change_request where tenant_id=$1 and company_id=$2 and request_state='pending'))::int as pending_movements,
           (select count(*)::int from org_tree where type='department' and status='active') as active_departments,
           (select count(*)::int from current_people where joined_on>=current_date-interval '90 days') as recent_joiners,
           (select count(*)::int from hr_master_record where tenant_id=$1 and company_id=$2 and master_type in ('cost_center','work_location','employment_type','employee_category') and status='active' and configuration_value is null) as master_configuration_gaps`,
        [context.tenantId, companyId],
      );
      const metrics = summary.rows[0]!;
      const distribution = await client.query<{ status: string; count: number }>(
        `select employee.status,count(distinct employee.id)::int as count
           from employee join employee_assignment assignment on assignment.tenant_id=employee.tenant_id and assignment.employee_id=employee.id
          where employee.tenant_id=$1 and assignment.company_id=$2
            and assignment.assignment_status in ('active','legacy_compatibility')
            and assignment.effective_from<=current_date and (assignment.effective_to is null or assignment.effective_to>=current_date)
          group by employee.status order by employee.status`,
        [context.tenantId, companyId],
      );
      return {
        company_id: companyId,
        generated_at: new Date().toISOString(),
        metrics,
        status_distribution: distribution.rows,
        action_items: [
          { key: "drafts", label: "Draft employee profiles", count: metrics.draft_profiles, page_id: "employee-drafts", tone: metrics.draft_profiles ? "attention" : "neutral" },
          { key: "approvals", label: "Employee approvals", count: metrics.pending_employee_approvals, page_id: "employee-approvals", tone: metrics.pending_employee_approvals ? "attention" : "neutral" },
          { key: "movements", label: "Movement approvals", count: metrics.pending_movements, page_id: "employee-approvals", tone: metrics.pending_movements ? "attention" : "neutral" },
          { key: "configuration", label: "Master configuration gaps", count: metrics.master_configuration_gaps, page_id: "work-locations", tone: metrics.master_configuration_gaps ? "attention" : "neutral" },
        ],
      };
    });
  }

  async getFinancePayrollDashboard(
    context: HrActorContext,
    companyId: string,
  ): Promise<HrFinancePayrollDashboard> {
    return this.read(
      context,
      ["hr.payroll.report.read", "hr.payroll.period.read", "hr.payroll.result.read"],
      async (client) => {
        await this.requireCompanyAccess(client, context, companyId);
        const metricsResult = await client.query<{
          current_employees: number;
          salary_covered_employees: number;
          salary_gaps: number;
          total_periods: number;
          review_queue: number;
          journal_queue: number;
          payment_exceptions: number;
        }>(
          `with current_people as (
             select distinct assignment.employee_id
               from employee_assignment assignment
              where assignment.tenant_id=$1 and assignment.company_id=$2
                and assignment.assignment_status in ('active','legacy_compatibility')
                and assignment.effective_from<=current_date
                and (assignment.effective_to is null or assignment.effective_to>=current_date)
           ), salary_covered as (
             select distinct salary.employee_id
               from hr_salary_assignment salary join current_people person on person.employee_id=salary.employee_id
              where salary.tenant_id=$1 and salary.company_id=$2
                and salary.state in ('approved','effective')
                and salary.effective_from<=current_date
                and (salary.effective_to is null or salary.effective_to>=current_date)
           )
           select
             (select count(*)::int from current_people) as current_employees,
             (select count(*)::int from salary_covered) as salary_covered_employees,
             ((select count(*) from current_people)-(select count(*) from salary_covered))::int as salary_gaps,
             (select count(*)::int from hr_payroll_period where tenant_id=$1 and company_id=$2) as total_periods,
             (select count(*)::int from hr_payroll_period where tenant_id=$1 and company_id=$2 and state in ('calculated','under_review')) as review_queue,
             (select count(*)::int from hr_payroll_period period
                where period.tenant_id=$1 and period.company_id=$2 and period.state in ('approved','posting_ready')
                  and not exists (select 1 from hr_payroll_journal_proposal proposal where proposal.tenant_id=period.tenant_id and proposal.period_id=period.id and proposal.state='posted')) as journal_queue,
             ((select count(*) from hr_payroll_payment_batch where tenant_id=$1 and company_id=$2 and state in ('failed','rejected'))
               +(select count(*) from hr_payroll_payment payment join hr_payroll_payment_batch batch on batch.tenant_id=payment.tenant_id and batch.id=payment.batch_id
                  where payment.tenant_id=$1 and batch.company_id=$2 and payment.state='failed'))::int as payment_exceptions`,
          [context.tenantId, companyId],
        );
        const periods = await client.query<{
          id: string;
          month: string | Date;
          state: HrFinancePayrollDashboard["recent_periods"][number]["state"];
          run_number: number;
          currency_code: string;
          employee_count: number;
          gross: string;
          deductions: string;
          net: string;
          warning_count: number;
          journal_state: HrFinancePayrollDashboard["recent_periods"][number]["journal_state"];
          journal_balanced: boolean | null;
          payment_state: string | null;
          payment_count: number;
          confirmed_payment_count: number;
          payment_total: string;
        }>(
          `select period.id,period.month,period.state,period.run_number,policy.currency_code,
                  coalesce(result.employee_count,0)::int as employee_count,
                  coalesce(result.gross,0)::text as gross,
                  coalesce(result.deductions,0)::text as deductions,
                  coalesce(result.net,0)::text as net,
                  coalesce(result.warning_count,0)::int as warning_count,
                  proposal.state as journal_state,
                  case when proposal.id is null then null
                       else coalesce(journal.line_count>=2 and journal.debit_total=journal.credit_total,false)
                  end as journal_balanced,
                  batch.state as payment_state,
                  coalesce(payment.payment_count,0)::int as payment_count,
                  coalesce(payment.confirmed_payment_count,0)::int as confirmed_payment_count,
                  coalesce(payment.payment_total,0)::text as payment_total
             from hr_payroll_period period
             join hr_payroll_policy policy on policy.tenant_id=period.tenant_id and policy.id=period.policy_id
             left join lateral (
               select count(*)::int as employee_count,coalesce(sum(coalesce((correction.value->>'gross')::numeric,r.gross)),0) as gross,
                      coalesce(sum(coalesce((correction.value->>'deductions')::numeric,r.deductions)),0) as deductions,coalesce(sum(coalesce((correction.value->>'net')::numeric,r.net)),0) as net,
                      coalesce(sum(jsonb_array_length(r.warnings)),0)::int as warning_count
                 from hr_payroll_result r left join lateral(select effective_hr_payroll_correction(r.tenant_id,r.company_id,r.id) as value)correction on true
                where r.tenant_id=period.tenant_id and r.period_id=period.id and r.run_number=period.run_number
             ) result on true
             left join hr_payroll_journal_proposal proposal
               on proposal.tenant_id=period.tenant_id and proposal.period_id=period.id
             left join lateral (
               select count(*)::int as line_count,coalesce(sum(debit),0) as debit_total,coalesce(sum(credit),0) as credit_total
                 from hr_payroll_journal_line
                where tenant_id=proposal.tenant_id and proposal_id=proposal.id
             ) journal on proposal.id is not null
             left join lateral (
               select candidate.id,candidate.state from hr_payroll_payment_batch candidate
                where candidate.tenant_id=period.tenant_id and candidate.period_id=period.id
                  and candidate.state not in ('rejected','cancelled')
                order by candidate.created_at desc,candidate.id desc limit 1
             ) batch on true
             left join lateral (
               select count(*)::int as payment_count,
                      count(*) filter (where state in ('confirmed','paid'))::int as confirmed_payment_count,
                      coalesce(sum(amount),0) as payment_total
                 from hr_payroll_payment where tenant_id=period.tenant_id and batch_id=batch.id
             ) payment on batch.id is not null
            where period.tenant_id=$1 and period.company_id=$2
            order by period.month desc,period.created_at desc,period.id desc limit 6`,
          [context.tenantId, companyId],
        );
        const recentPeriods = periods.rows.map((period) => ({
          ...period,
          month: dateOnly(period.month),
          gross: String(period.gross),
          deductions: String(period.deductions),
          net: String(period.net),
          payment_total: String(period.payment_total),
        }));
        return {
          company_id: companyId,
          generated_at: new Date().toISOString(),
          metrics: metricsResult.rows[0]!,
          latest_period: recentPeriods[0] ?? null,
          recent_periods: recentPeriods,
        };
      },
    );
  }

  async getPositionsOrganization(
    context: HrActorContext,
    query: HrPositionsOrganizationQuery,
  ): Promise<HrPositionsOrganization> {
    return this.read(
      context,
      ["hr.organization.read", "hr.employee_assignment.read", "hr.employee.read"],
      async (client) => {
        await this.requireCompanyAccess(client, context, query.company_id);
        const values: unknown[] = [context.tenantId, query.company_id];
        const filters = [
          "assignment.tenant_id=$1",
          "assignment.company_id=$2",
          "assignment.assignment_status in ('active','legacy_compatibility')",
          "assignment.effective_from<=current_date",
          "(assignment.effective_to is null or assignment.effective_to>=current_date)",
        ];
        if (query.search) {
          const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
          filters.push(
            `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\' or job.name ilike $${parameter} escape '\\' or designation.name ilike $${parameter} escape '\\' or department.name ilike $${parameter} escape '\\')`,
          );
        }
        values.push(query.limit);
        const items = await client.query<{
          assignment_id: string;
          employee_id: string;
          employee_number: string;
          employee_name: string;
          employee_status: HrPositionsOrganization["items"][number]["employee_status"];
          branch_id: string;
          branch: string;
          department_id: string;
          department: string;
          job: string;
          designation: string;
          job_grade: string;
          reporting_manager: string | null;
          effective_from: string | Date;
        }>(
          `select assignment.id as assignment_id,employee.id as employee_id,employee.employee_number,
                  concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                  employee.status as employee_status,assignment.branch_id,branch.name as branch,
                  assignment.department_id,department.name as department,job.name as job,
                  designation.name as designation,job_grade.name as job_grade,
                  nullif(concat_ws(' ',manager.first_name,manager.middle_name,manager.last_name),'') as reporting_manager,
                  assignment.effective_from
             from employee_assignment assignment
             join employee on employee.tenant_id=assignment.tenant_id and employee.id=assignment.employee_id
             join organization_unit branch on branch.tenant_id=assignment.tenant_id and branch.id=assignment.branch_id
             join organization_unit department on department.tenant_id=assignment.tenant_id and department.id=assignment.department_id
             join hr_master_record job on job.tenant_id=assignment.tenant_id and job.id=assignment.job_id
             join hr_master_record designation on designation.tenant_id=assignment.tenant_id and designation.id=assignment.designation_id
             join hr_master_record job_grade on job_grade.tenant_id=assignment.tenant_id and job_grade.id=assignment.job_grade_id
             left join employee manager on manager.tenant_id=assignment.tenant_id and manager.id=assignment.reporting_manager_id
            where ${filters.join(" and ")}
            order by department.name,job.name,designation.name,employee.last_name,employee.first_name,employee.id
            limit $${values.length}`,
          values,
        );
        const departments = await client.query<HrPositionsOrganization["departments"][number]>(
          `select assignment.department_id,department.name as department,
                  count(distinct assignment.employee_id)::int as active_people,
                  count(distinct assignment.job_id)::int as job_count,
                  count(distinct assignment.reporting_manager_id)::int as manager_count
             from employee_assignment assignment
             join organization_unit department on department.tenant_id=assignment.tenant_id and department.id=assignment.department_id
            where assignment.tenant_id=$1 and assignment.company_id=$2
              and assignment.assignment_status in ('active','legacy_compatibility')
              and assignment.effective_from<=current_date
              and (assignment.effective_to is null or assignment.effective_to>=current_date)
            group by assignment.department_id,department.name
            order by active_people desc,department.name,assignment.department_id`,
          [context.tenantId, query.company_id],
        );
        const metrics = await client.query<HrPositionsOrganization["metrics"]>(
          `select count(distinct assignment.employee_id)::int as current_assignments,
                  count(distinct assignment.department_id)::int as active_departments,
                  count(distinct assignment.job_id)::int as represented_jobs,
                  count(distinct assignment.reporting_manager_id)::int as reporting_managers,
                  count(distinct assignment.employee_id) filter (where assignment.reporting_manager_id is null)::int as without_manager
             from employee_assignment assignment
            where assignment.tenant_id=$1 and assignment.company_id=$2
              and assignment.assignment_status in ('active','legacy_compatibility')
              and assignment.effective_from<=current_date
              and (assignment.effective_to is null or assignment.effective_to>=current_date)`,
          [context.tenantId, query.company_id],
        );
        return {
          company_id: query.company_id,
          generated_at: new Date().toISOString(),
          metrics: metrics.rows[0]!,
          departments: departments.rows,
          items: items.rows.map((item) => ({ ...item, effective_from: dateOnly(item.effective_from) })),
        };
      },
    );
  }

  async listManpowerRequisitions(context: HrActorContext, query: HrManpowerRequisitionQuery): Promise<HrManpowerRequisitionDirectory> {
    return this.read(context, "hr.employee.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["request.tenant_id=$1", "request.company_id=$2"];
      if (query.state) { values.push(query.state); filters.push(`request.state=$${values.length}`); }
      if (query.search) { values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`); filters.push(`(request.reference ilike $${values.length} escape '\\' or request.job_title ilike $${values.length} escape '\\' or department.name ilike $${values.length} escape '\\')`); }
      values.push(query.limit);
      const result = await client.query<HrManpowerRequisitionDirectory["items"][number] & { salary_minimum: string; salary_maximum: string; submitted_at: Date | null; decided_at: Date | null; created_at: Date }>(
        `select request.id,request.company_id,request.reference,request.job_title,designation.name as designation,grade.name as job_grade,
                employment_type.name as employment_type,branch.name as branch,department.name as department,request.positions_requested,
                request.position_type,request.salary_minimum::text,request.salary_maximum::text,request.currency_code,request.target_start_date::text,
                request.reason,request.required_skills,request.state,request.created_by,request.submitted_by,request.submitted_at,request.decided_by,
                request.decided_at,request.decision_reason,request.created_at
           from hr_manpower_requisition request
           join hr_master_record designation on designation.tenant_id=request.tenant_id and designation.id=request.designation_id
           join hr_master_record grade on grade.tenant_id=request.tenant_id and grade.id=request.job_grade_id
           join hr_master_record employment_type on employment_type.tenant_id=request.tenant_id and employment_type.id=request.employment_type_id
           join organization_unit branch on branch.tenant_id=request.tenant_id and branch.id=request.branch_id
           join organization_unit department on department.tenant_id=request.tenant_id and department.id=request.department_id
          where ${filters.join(" and ")} order by request.created_at desc,request.id desc limit $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => ({ ...row, submitted_at: row.submitted_at?.toISOString() ?? null, decided_at: row.decided_at?.toISOString() ?? null, created_at: row.created_at.toISOString() })) };
    });
  }

  async createManpowerRequisition(context: HrActorContext, input: CreateHrManpowerRequisitionRequest, idempotencyKey: string, correlationId: string): Promise<HrManpowerRequisitionResult> {
    if (!validIdempotencyKey(idempotencyKey)) throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee.create")) throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to create manpower requisitions.");
    const client = await this.pool.connect();
    try {
      await client.query("begin"); await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]); await this.requireCompanyAccess(client, context, input.company_id);
      const path = "/api/v1/hr/manpower_requisitions", fingerprint = stateHash(input);
      const replay = await client.query<{request_fingerprint:string;response_body:HrManpowerRequisitionResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update", [context.tenantId,context.actor.userId,path,idempotencyKey]);
      if (replay.rows[0]) { if (replay.rows[0].request_fingerprint!==fingerprint) throw new HrApiError(409,"IDEMPOTENCY_CONFLICT","The idempotency key was already used for another request."); await client.query("commit"); return {...replay.rows[0].response_body,replayed:true}; }
      const id=`manpower-requisition-${randomUUID()}`, reference=`MRQ-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-","").slice(0,6).toUpperCase()}`;
      await client.query(`insert into hr_manpower_requisition (id,tenant_id,company_id,reference,job_title,designation_id,job_grade_id,employment_type_id,branch_id,department_id,positions_requested,position_type,replacement_employee_id,salary_minimum,salary_maximum,currency_code,target_start_date,reason,required_skills,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20)`, [id,context.tenantId,input.company_id,reference,input.job_title,input.designation_id,input.job_grade_id,input.employment_type_id,input.branch_id,input.department_id,input.positions_requested,input.position_type,input.replacement_employee_id??null,input.salary_minimum,input.salary_maximum,input.currency_code,input.target_start_date,input.reason,JSON.stringify(input.required_skills),context.actor.userId]);
      const audit = await this.appendPlatformAudit(client,context,correlationId,"hr.manpower_requisition.create",{entityId:id,entityType:"hr_manpower_requisition",before:null,after:{reference,...input,state:"draft"}});
      const result:HrManpowerRequisitionResult={id,reference,state:"draft",company_id:input.company_id,audit_event_id:audit,replayed:false};
      await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,201,$6,$7)",[context.tenantId,context.actor.userId,path,idempotencyKey,fingerprint,result,stateHash(result)]);
      await client.query("commit"); return result;
    } catch(error) { await client.query("rollback").catch(()=>undefined); throw error; } finally { client.release(); }
  }

  async submitManpowerRequisition(context: HrActorContext, id: string, input: SubmitHrManpowerRequisitionRequest, idempotencyKey: string, correlationId: string): Promise<HrManpowerRequisitionResult> {
    return this.mutateManpowerDecision(context,id,{decision:"submitted",reason:input.reason},idempotencyKey,correlationId);
  }
  async decideManpowerRequisition(context: HrActorContext, id: string, input: DecideHrManpowerRequisitionRequest, idempotencyKey: string, correlationId: string): Promise<HrManpowerRequisitionResult> {
    return this.mutateManpowerDecision(context,id,input,idempotencyKey,correlationId);
  }
  private async mutateManpowerDecision(context: HrActorContext, id: string, input: { decision: "submitted"|"approved"|"rejected"; reason:string }, idempotencyKey:string, correlationId:string): Promise<HrManpowerRequisitionResult> {
    if (!validIdempotencyKey(idempotencyKey)) throw new HrApiError(400,"INVALID_IDEMPOTENCY_KEY","The idempotency key is invalid.");
    const permission=input.decision==="submitted"?"hr.employee.submit":"hr.employee.approve";
    if (!context.actor.permissions.includes(permission)) throw new HrApiError(403,"PERMISSION_DENIED","You are not permitted to make this requisition decision.");
    const client=await this.pool.connect(); try { await client.query("begin"); await client.query("select set_config('nexora.tenant_id',$1,true)",[context.tenantId]); const path=`/api/v1/hr/manpower_requisitions/${id}/${input.decision}`; const fingerprint=stateHash(input);
      const replay=await client.query<{request_fingerprint:string;response_body:HrManpowerRequisitionResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update",[context.tenantId,context.actor.userId,path,idempotencyKey]); if(replay.rows[0]){if(replay.rows[0].request_fingerprint!==fingerprint) throw new HrApiError(409,"IDEMPOTENCY_CONFLICT","The idempotency key was already used for another request.");await client.query("commit");return {...replay.rows[0].response_body,replayed:true};}
      const record=await client.query<{reference:string;company_id:string;state:string;created_by:string;submitted_by:string|null}>(`select request.reference,request.company_id,request.state,request.created_by,request.submitted_by from hr_manpower_requisition request where request.tenant_id=$1 and request.id=$2 and exists(select 1 from security_user_company_access access where access.tenant_id=request.tenant_id and access.user_id=$3 and access.company_id=request.company_id and access.revoked_at is null) for update`,[context.tenantId,id,context.actor.userId]); const before=record.rows[0]; if(!before) throw new HrApiError(404,"HR_MANPOWER_REQUISITION_NOT_FOUND","The manpower requisition is unavailable in your company scope.");
      if(input.decision==="submitted" && before.state!=="draft") throw new HrApiError(409,"HR_MANPOWER_REQUISITION_NOT_SUBMITTABLE","Only draft requisitions can be submitted."); if(input.decision!=="submitted" && before.state!=="submitted") throw new HrApiError(409,"HR_MANPOWER_REQUISITION_NOT_PENDING","Only submitted requisitions can be decided.");
      let override:string|null=null; if(input.decision!=="submitted") override=await this.resolveApprovalOverride(client,context,{normalDecisionPermission:permission,makerActorIds:[before.created_by,before.submitted_by].filter((value):value is string=>Boolean(value)),resourceType:"hr.manpower_requisition",resourceId:id,decisionAction:input.decision==="approved"?"approve":"reject",reason:input.reason,correlationId,idempotencyKey});
      if(input.decision==="submitted") await client.query("update hr_manpower_requisition set state='submitted',submitted_by=$3,submitted_at=now(),updated_at=now() where tenant_id=$1 and id=$2",[context.tenantId,id,context.actor.userId]); else await client.query("update hr_manpower_requisition set state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,approval_override_event_id=$6,updated_at=now() where tenant_id=$1 and id=$2",[context.tenantId,id,input.decision,context.actor.userId,input.reason,override]);
      const audit=await this.appendPlatformAudit(client,context,correlationId,`hr.manpower_requisition.${input.decision}`,{entityId:id,entityType:"hr_manpower_requisition",before:{state:before.state},after:{state:input.decision,reason:input.reason,super_admin_override:override!==null}}); const result:HrManpowerRequisitionResult={id,reference:before.reference,state:input.decision,company_id:before.company_id,audit_event_id:audit,replayed:false}; await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)",[context.tenantId,context.actor.userId,path,idempotencyKey,fingerprint,result,stateHash(result)]); await client.query("commit");return result;
    } catch(error){await client.query("rollback").catch(()=>undefined);throw error;} finally{client.release();}
  }

  async listJobOpenings(context: HrActorContext, query: HrJobOpeningQuery): Promise<HrJobOpeningDirectory> {
    return this.read(context, "hr.employee.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id); const values: unknown[]=[context.tenantId,query.company_id]; const filters=["opening.tenant_id=$1","opening.company_id=$2"];
      if(query.state){values.push(query.state);filters.push(`opening.state=$${values.length}`)} if(query.search){values.push(`%${query.search.replace(/[\\%_]/g,"\\$&")}%`);filters.push(`(opening.reference ilike $${values.length} escape '\\' or opening.title ilike $${values.length} escape '\\' or requisition.reference ilike $${values.length} escape '\\')`)} values.push(query.limit);
      const result=await client.query<HrJobOpeningDirectory["items"][number] & {created_at:Date;closing_on:string|Date|null}>(`select opening.id,opening.company_id,opening.reference,opening.requisition_id,requisition.reference as requisition_reference,opening.title,opening.positions_requested,filled.count as filled_positions,greatest(0,opening.positions_requested-filled.count)::int as remaining_positions,opening.channels,opening.closing_on,opening.state,opening.state_reason,opening.created_at from hr_job_opening opening join hr_manpower_requisition requisition on requisition.tenant_id=opening.tenant_id and requisition.id=opening.requisition_id left join lateral (select count(*)::int as count from hr_offer_employee_handoff h join hr_recruitment_application a on a.tenant_id=h.tenant_id and a.id=h.application_id join hr_recruitment_offer o on o.tenant_id=h.tenant_id and o.id=h.offer_id where h.tenant_id=opening.tenant_id and h.company_id=opening.company_id and o.opening_id=opening.id and a.stage='hired') filled on true where ${filters.join(" and ")} order by opening.created_at desc,opening.id desc limit $${values.length}`,values);
      return {items:result.rows.map(row=>({...row,closing_on:row.closing_on===null?null:dateOnly(row.closing_on),created_at:row.created_at.toISOString()}))};
    });
  }
  async createJobOpening(context: HrActorContext,input:CreateHrJobOpeningRequest,idempotencyKey:string,correlationId:string):Promise<HrJobOpeningResult>{
    if(!validIdempotencyKey(idempotencyKey)) throw new HrApiError(400,"INVALID_IDEMPOTENCY_KEY","The idempotency key is invalid."); if(!context.actor.permissions.includes("hr.employee.create")) throw new HrApiError(403,"PERMISSION_DENIED","You are not permitted to create job openings."); const client=await this.pool.connect();
    try{await client.query("begin");await client.query("select set_config('nexora.tenant_id',$1,true)",[context.tenantId]);await this.requireCompanyAccess(client,context,input.company_id);const path="/api/v1/hr/job_openings",fingerprint=stateHash(input);const replay=await client.query<{request_fingerprint:string;response_body:HrJobOpeningResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update",[context.tenantId,context.actor.userId,path,idempotencyKey]);if(replay.rows[0]){if(replay.rows[0].request_fingerprint!==fingerprint)throw new HrApiError(409,"IDEMPOTENCY_CONFLICT","The idempotency key was already used for another request.");await client.query("commit");return {...replay.rows[0].response_body,replayed:true};}const id=`job-opening-${randomUUID()}`,reference=`JOP-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-","").slice(0,6).toUpperCase()}`;await client.query("insert into hr_job_opening (id,tenant_id,company_id,reference,requisition_id,title,positions_requested,channels,closing_on,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)",[id,context.tenantId,input.company_id,reference,input.requisition_id,input.title,input.positions_requested,JSON.stringify(input.channels),input.closing_on??null,context.actor.userId]);const audit=await this.appendPlatformAudit(client,context,correlationId,"hr.job_opening.create",{entityId:id,entityType:"hr_job_opening",before:null,after:{reference,...input,state:"open"}});const result:HrJobOpeningResult={id,reference,state:"open",company_id:input.company_id,audit_event_id:audit,replayed:false};await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,201,$6,$7)",[context.tenantId,context.actor.userId,path,idempotencyKey,fingerprint,result,stateHash(result)]);await client.query("commit");return result;}catch(error){await client.query("rollback").catch(()=>undefined);throw error;}finally{client.release();}
  }
  async changeJobOpeningState(context:HrActorContext,id:string,input:ChangeHrJobOpeningStateRequest,idempotencyKey:string,correlationId:string):Promise<HrJobOpeningResult>{
    if(!validIdempotencyKey(idempotencyKey))throw new HrApiError(400,"INVALID_IDEMPOTENCY_KEY","The idempotency key is invalid.");if(!context.actor.permissions.includes("hr.employee.update"))throw new HrApiError(403,"PERMISSION_DENIED","You are not permitted to change job opening state.");const client=await this.pool.connect();try{await client.query("begin");await client.query("select set_config('nexora.tenant_id',$1,true)",[context.tenantId]);await this.requireCompanyAccess(client,context,input.company_id);const path=`/api/v1/hr/job_openings/${id}/state`,fingerprint=stateHash(input);const replay=await client.query<{request_fingerprint:string;response_body:HrJobOpeningResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update",[context.tenantId,context.actor.userId,path,idempotencyKey]);if(replay.rows[0]){if(replay.rows[0].request_fingerprint!==fingerprint)throw new HrApiError(409,"IDEMPOTENCY_CONFLICT","The idempotency key was already used for another request.");await client.query("commit");return {...replay.rows[0].response_body,replayed:true};}const record=await client.query<{reference:string;company_id:string;state:HrJobOpeningResult["state"]}>("select reference,company_id,state from hr_job_opening where tenant_id=$1 and id=$2 and company_id=$3 for update",[context.tenantId,id,input.company_id]);const before=record.rows[0];if(!before)throw new HrApiError(404,"HR_JOB_OPENING_NOT_FOUND","The job opening is unavailable in your company scope.");if(before.state==="cancelled")throw new HrApiError(409,"HR_JOB_OPENING_FINAL","A cancelled job opening cannot change state.");await client.query("update hr_job_opening set state=$3,state_reason=$4,updated_at=now() where tenant_id=$1 and id=$2",[context.tenantId,id,input.state,input.reason]);const audit=await this.appendPlatformAudit(client,context,correlationId,"hr.job_opening.state",{entityId:id,entityType:"hr_job_opening",before:{state:before.state},after:{state:input.state,reason:input.reason}});const result:HrJobOpeningResult={id,reference:before.reference,state:input.state,company_id:before.company_id,audit_event_id:audit,replayed:false};await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)",[context.tenantId,context.actor.userId,path,idempotencyKey,fingerprint,result,stateHash(result)]);await client.query("commit");return result;}catch(error){await client.query("rollback").catch(()=>undefined);throw error;}finally{client.release();}
  }

  async listCandidates(context: HrActorContext, query: HrCandidateQuery): Promise<HrCandidateDirectory> {
    if (!context.actor.permissions.includes("hr.employee.read")) throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to view candidates.");
    return this.read(context, "hr.employee.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["candidate.tenant_id=$1", "candidate.company_id=$2"];
      if (query.status) { values.push(query.status); filters.push(`candidate.status=$${values.length}`); }
      if (query.search) { values.push(`%${query.search}%`); filters.push(`(candidate.reference ilike $${values.length} or candidate.first_name ilike $${values.length} or candidate.last_name ilike $${values.length} or candidate.email ilike $${values.length})`); }
      values.push(query.limit);
      const result = await client.query<HrCandidateDirectory["items"][number] & { created_at: Date }>(`select candidate.id,candidate.company_id,candidate.reference,concat_ws(' ',candidate.first_name,candidate.last_name) as display_name,candidate.email,candidate.phone,candidate.source,candidate.status,candidate.created_at from hr_candidate candidate where ${filters.join(" and ")} order by candidate.created_at desc,candidate.id desc limit $${values.length}`, values);
      return { items: result.rows.map((record) => ({ ...record, created_at: record.created_at.toISOString() })) };
    });
  }

  async createCandidate(context: HrActorContext, input: CreateHrCandidateRequest, idempotencyKey: string, correlationId: string): Promise<HrCandidateResult> {
    if (!validIdempotencyKey(idempotencyKey)) throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee.create")) throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to create candidates.");
    const client = await this.pool.connect();
    try {
      await client.query("begin"); await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]); await this.requireCompanyAccess(client, context, input.company_id);
      const path = "/api/v1/hr/candidates", fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrCandidateResult }>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update", [context.tenantId, context.actor.userId, path, idempotencyKey]);
      if (replay.rows[0]) { if (replay.rows[0].request_fingerprint !== fingerprint) throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another request."); await client.query("commit"); return { ...replay.rows[0].response_body, replayed: true }; }
      const id = `candidate-${randomUUID()}`, reference = `CAN-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
      try { await client.query("insert into hr_candidate (id,tenant_id,company_id,reference,first_name,last_name,email,phone,source,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [id, context.tenantId, input.company_id, reference, input.first_name, input.last_name, input.email.toLowerCase(), input.phone, input.source, context.actor.userId]); }
      catch (error: unknown) { if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") throw new HrApiError(409, "HR_CANDIDATE_ALREADY_EXISTS", "An active candidate with this email already exists in the selected company."); throw error; }
      const audit = await this.appendPlatformAudit(client, context, correlationId, "hr.candidate.create", { entityId: id, entityType: "hr_candidate", before: null, after: { reference, ...input, status: "active" } });
      const result: HrCandidateResult = { id, reference, status: "active", company_id: input.company_id, audit_event_id: audit, replayed: false };
      await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,201,$6,$7)", [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)]);
      await client.query("commit"); return result;
    } catch (error) { await client.query("rollback").catch(() => undefined); throw error; } finally { client.release(); }
  }

  async changeCandidateStatus(context: HrActorContext, id: string, input: ChangeHrCandidateStatusRequest, idempotencyKey: string, correlationId: string): Promise<HrCandidateResult> {
    if (!validIdempotencyKey(idempotencyKey)) throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee.update")) throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to change candidate status.");
    const client = await this.pool.connect();
    try {
      await client.query("begin"); await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]); await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/candidates/${id}/status`, fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrCandidateResult }>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update", [context.tenantId, context.actor.userId, path, idempotencyKey]);
      if (replay.rows[0]) { if (replay.rows[0].request_fingerprint !== fingerprint) throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another request."); await client.query("commit"); return { ...replay.rows[0].response_body, replayed: true }; }
      const record = await client.query<{ reference: string; company_id: string; status: HrCandidateResult["status"] }>("select reference,company_id,status from hr_candidate where tenant_id=$1 and id=$2 and company_id=$3 for update", [context.tenantId, id, input.company_id]); const before = record.rows[0];
      if (!before) throw new HrApiError(404, "HR_CANDIDATE_NOT_FOUND", "The candidate is unavailable in your company scope.");
      await client.query("update hr_candidate set status=$3,updated_at=now() where tenant_id=$1 and id=$2", [context.tenantId, id, input.status]);
      const audit = await this.appendPlatformAudit(client, context, correlationId, "hr.candidate.status", { entityId: id, entityType: "hr_candidate", before: { status: before.status }, after: { status: input.status } });
      const result: HrCandidateResult = { id, reference: before.reference, status: input.status, company_id: before.company_id, audit_event_id: audit, replayed: false };
      await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)", [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)]);
      await client.query("commit"); return result;
    } catch (error) { await client.query("rollback").catch(() => undefined); throw error; } finally { client.release(); }
  }

  async listApplications(context: HrActorContext, query: HrApplicationQuery): Promise<HrApplicationDirectory> {
    return this.read(context, "hr.employee.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["a.tenant_id=$1", "a.company_id=$2"];
      if (query.stage) { values.push(query.stage); filters.push(`a.stage=$${values.length}`); }
      if (query.search) { values.push(`%${query.search}%`); filters.push(`(a.reference ilike $${values.length} or concat_ws(' ',c.first_name,c.last_name) ilike $${values.length} or c.email ilike $${values.length} or o.title ilike $${values.length})`); }
      const joins = "from hr_recruitment_application a join hr_candidate c on c.tenant_id=a.tenant_id and c.id=a.candidate_id join hr_job_opening o on o.tenant_id=a.tenant_id and o.id=a.opening_id";
      const count = await client.query<{total: number}>(`select count(*)::int as total ${joins} where ${filters.join(" and ")}`, values);
      values.push(query.limit, query.offset);
      const result = await client.query<Omit<HrApplicationDirectory["items"][number], "created_at" | "updated_at"> & {created_at: Date; updated_at: Date}>(`
        select a.id,a.company_id,a.reference,a.candidate_id,concat_ws(' ',c.first_name,c.last_name) as candidate_name,c.email as candidate_email,
          a.opening_id,o.title as opening_title,o.reference as opening_reference,a.stage,a.created_at,a.updated_at,
          coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'from_stage',e.from_stage,'to_stage',e.to_stage,'reason',e.reason,'actor_id',e.actor_id,'occurred_at',to_char(e.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by e.occurred_at,e.id) from hr_recruitment_application_event e where e.tenant_id=a.tenant_id and e.application_id=a.id),'[]'::jsonb) as history
        ${joins} where ${filters.join(" and ")} order by a.created_at desc,a.id desc limit $${values.length - 1} offset $${values.length}`, values);
      return { items: result.rows.map(row => ({...row, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString()})), total: count.rows[0]?.total ?? 0 };
    });
  }

  async createApplication(context: HrActorContext, input: CreateHrApplicationRequest, key: string, correlationId: string): Promise<HrApplicationResult> {
    return this.mutateRecruitmentApplication(context, input, key, correlationId);
  }

  async changeApplicationStage(context: HrActorContext, id: string, input: ChangeHrApplicationStageRequest, key: string, correlationId: string): Promise<HrApplicationResult> {
    return this.mutateRecruitmentApplication(context, input, key, correlationId, id);
  }

  private async mutateRecruitmentApplication(context: HrActorContext, input: CreateHrApplicationRequest | ChangeHrApplicationStageRequest, key: string, correlationId: string, applicationId?: string): Promise<HrApplicationResult> {
    const create = "candidate_id" in input;
    if (!validIdempotencyKey(key)) throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes(create ? "hr.employee.create" : "hr.employee.update")) throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to maintain recruitment applications.");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = create ? "/api/v1/hr/applications" : `/api/v1/hr/applications/${applicationId}/stage`;
      const fingerprint = stateHash(input);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify([context.tenantId,context.actor.userId,path,key])]);
      const replay = await client.query<{request_fingerprint: string; response_body: HrApplicationResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4", [context.tenantId,context.actor.userId,path,key]);
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", "This request key was used for different application data.");
        await client.query("commit"); return {...replay.rows[0].response_body, replayed:true};
      }
      const id = applicationId ?? `application-${randomUUID()}`;
      let reference: string;
      let previous: HrApplicationStage | null = null;
      let stage: HrApplicationStage = "application";
      let reason = "Application registered against the job opening.";
      if (create) {
        const candidate = await client.query("select id from hr_candidate where tenant_id=$1 and company_id=$2 and id=$3 and status='active' for share", [context.tenantId,input.company_id,input.candidate_id]);
        if (!candidate.rowCount) throw new HrApiError(409,"HR_CANDIDATE_UNAVAILABLE","Select an active candidate in this company.");
        const opening = await client.query("select id from hr_job_opening where tenant_id=$1 and company_id=$2 and id=$3 and state='open' and (closing_on is null or closing_on>=current_date) for share", [context.tenantId,input.company_id,input.opening_id]);
        if (!opening.rowCount) throw new HrApiError(409,"HR_OPENING_UNAVAILABLE","Select an open job opening whose closing date has not passed.");
        reference = `APL-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-","").slice(0,12).toUpperCase()}`;
        await client.query("insert into hr_recruitment_application (id,tenant_id,company_id,candidate_id,opening_id,reference,created_by) values ($1,$2,$3,$4,$5,$6,$7)", [id,context.tenantId,input.company_id,input.candidate_id,input.opening_id,reference,context.actor.userId]);
      } else {
        const record = await client.query<{reference:string; stage:HrApplicationStage; opening_id:string; candidate_id:string}>("select reference,stage,opening_id,candidate_id from hr_recruitment_application where tenant_id=$1 and company_id=$2 and id=$3 for update", [context.tenantId,input.company_id,id]);
        const before = record.rows[0];
        if (!before) throw new HrApiError(404,"HR_APPLICATION_NOT_FOUND","The application is unavailable in your company scope.");
        if (before.stage !== input.expected_stage) throw new HrApiError(409,"HR_APPLICATION_STALE","This application changed. Refresh before making another decision.");
        if (input.stage === "selected" || input.stage === "hired") throw new HrApiError(409,"HR_RECRUITMENT_EVIDENCE_REQUIRED","Selection requires interview evidence; hiring requires the governed accepted-offer workflow.");
        if(before.stage === "selected" && ["rejected","withdrawn"].includes(input.stage)) {
          const offer=await client.query("select id from hr_recruitment_offer where tenant_id=$1 and application_id=$2 and state in ('draft','submitted','approved','generated','sent','accepted') limit 1",[context.tenantId,id]);
          if(offer.rowCount)throw new HrApiError(409,"HR_OFFER_APPLICATION_IN_USE","Close the active offer before closing this application. Accepted offers retain the selected application for the employee handoff.");
        }
        if (!hrApplicationTransitions[before.stage].includes(input.stage)) throw new HrApiError(409,"HR_APPLICATION_TRANSITION_INVALID","This application cannot move to the requested stage.");
        if(input.stage === "interview" || input.stage === "evaluation") {
          const evidence = await this.readInterviewEvidence(client, context, input.company_id, id);
          const live = evidence.interviews.filter(item => item.status !== "cancelled");
          if(!live.length || (input.stage === "evaluation" && live.some(item=>item.status !== "completed")))
            throw new HrApiError(409,"HR_RECRUITMENT_EVIDENCE_REQUIRED",input.stage === "interview" ? "Schedule an interview before moving the application to Interview." : "Complete every non-cancelled interview before moving to Evaluation.");
        }
        if (input.stage !== "rejected" && input.stage !== "withdrawn") {
          const opening = await client.query("select id from hr_job_opening where tenant_id=$1 and company_id=$2 and id=$3 and state='open' for share",[context.tenantId,input.company_id,before.opening_id]);
          if (!opening.rowCount) throw new HrApiError(409,"HR_OPENING_UNAVAILABLE","Forward progression requires an open job opening.");
          const candidate = await client.query("select id from hr_candidate where tenant_id=$1 and company_id=$2 and id=$3 and status='active' for share",[context.tenantId,input.company_id,before.candidate_id]);
          if (!candidate.rowCount) throw new HrApiError(409,"HR_CANDIDATE_UNAVAILABLE","Forward progression requires an active candidate.");
        }
        reference = before.reference; previous = before.stage; stage = input.stage; reason = input.reason;
        await client.query("update hr_recruitment_application set stage=$3,updated_at=now() where tenant_id=$1 and id=$2", [context.tenantId,id,stage]);
      }
      await client.query("insert into hr_recruitment_application_event (id,tenant_id,application_id,actor_id,from_stage,to_stage,reason) values ($1,$2,$3,$4,$5,$6,$7)", [`application-event-${randomUUID()}`,context.tenantId,id,context.actor.userId,previous,stage,reason]);
      const audit = await this.appendPlatformAudit(client,context,correlationId,create ? "hr.application.create" : "hr.application.stage",{entityId:id,entityType:"hr_recruitment_application",before:create ? null : {stage:previous},after:{...input,reference,stage}});
      const result: HrApplicationResult = {id,company_id:input.company_id,reference,stage,audit_event_id:audit,replayed:false};
      await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,$6,$7,$8)", [context.tenantId,context.actor.userId,path,key,fingerprint,create?201:200,result,stateHash(result)]);
      await client.query("commit"); return result;
    } catch(error) {
      await client.query("rollback").catch(()=>undefined);
      if (typeof error === "object" && error !== null && "constraint" in error && error.constraint === "uq_hr_application_candidate_opening") throw new HrApiError(409,"HR_APPLICATION_EXISTS","This candidate already has an application for the selected opening.");
      throw error;
    } finally { client.release(); }
  }

  async listInterviewPanel(context: HrActorContext, query: HrInterviewPanelQuery): Promise<HrInterviewPanelDirectory> {
    return this.read(context,"hr.employee.read",async client=>{
      await this.requireCompanyAccess(client,context,query.company_id);
      const result=await client.query<{id:string;name:string}>(`select u.id,coalesce(u.display_name,u.email) as name from security_user_account u where u.tenant_id=$1 and u.status='active' and u.archived_at is null and (coalesce(u.display_name,'') ilike $3 or u.email ilike $3) and exists(select 1 from security_user_company_access a where a.tenant_id=u.tenant_id and a.user_id=u.id and a.company_id=$2 and a.revoked_at is null) order by name,u.id limit $4`,[context.tenantId,query.company_id,`%${query.search}%`,query.limit]);
      return {items:result.rows};
    });
  }

  async getInterviewWorkspace(context: HrActorContext, query: HrInterviewWorkspaceQuery): Promise<HrInterviewWorkspace> {
    return this.read(context,"hr.employee.read",async client=>{
      await this.requireCompanyAccess(client,context,query.company_id);
      return this.readInterviewEvidence(client,context,query.company_id,query.application_id);
    });
  }

  private async readInterviewEvidence(client: PoolClient, context: HrActorContext, companyId: string, applicationId: string): Promise<HrInterviewWorkspace> {
    const application=await client.query<HrInterviewWorkspace["application"]>(`select a.id,a.reference,concat_ws(' ',c.first_name,c.last_name) as candidate_name,o.title as opening_title,a.stage from hr_recruitment_application a join hr_candidate c on c.tenant_id=a.tenant_id and c.id=a.candidate_id join hr_job_opening o on o.tenant_id=a.tenant_id and o.id=a.opening_id where a.tenant_id=$1 and a.company_id=$2 and a.id=$3`,[context.tenantId,companyId,applicationId]);
    if(!application.rows[0]) throw new HrApiError(404,"HR_APPLICATION_NOT_FOUND","The application is unavailable in your company scope.");
    const interviews=await client.query<Omit<HrInterviewWorkspace["interviews"][number],"starts_at"> & {starts_at:Date}>(`select i.id,i.kind,i.round,i.starts_at,i.duration_minutes,i.mode,i.location,i.status,i.version,i.template,
      coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'name',coalesce(u.display_name,u.email)) order by p.user_id) from hr_recruitment_interview_panel p join security_user_account u on u.tenant_id=p.tenant_id and u.id=p.user_id where p.tenant_id=i.tenant_id and p.interview_id=i.id),'[]'::jsonb) as panel,
      coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'user_id',e.user_id,'scores',e.scores,'weighted_score',e.weighted_score,'recommendation',e.recommendation,'strengths',e.strengths,'concerns',e.concerns,'submitted_at',e.submitted_at) order by e.submitted_at,e.id) from hr_recruitment_interview_evaluation e where e.tenant_id=i.tenant_id and e.interview_id=i.id),'[]'::jsonb) as evaluations
      from hr_recruitment_interview i where i.tenant_id=$1 and i.application_id=$2 order by i.round`,[context.tenantId,applicationId]);
    const assessments=await client.query<HrInterviewWorkspace["assessments"][number]>("select id,title,mandatory,status,reason,decided_by from hr_recruitment_assessment where tenant_id=$1 and application_id=$2 order by id",[context.tenantId,applicationId]);
    const history=await client.query<Omit<HrInterviewWorkspace["history"][number],"occurred_at"> & {occurred_at:Date}>("select id,action,reason,actor_id,occurred_at from hr_recruitment_interview_event where tenant_id=$1 and application_id=$2 order by occurred_at,id",[context.tenantId,applicationId]);
    const live=interviews.rows.filter(i=>i.status!=="cancelled"), completed=live.filter(i=>i.status==="completed");
    const evaluations=completed.flatMap(i=>i.evaluations), evaluators=new Set(evaluations.map(e=>e.user_id)).size;
    const roundScores=completed.filter(i=>i.evaluations.length).map(i=>i.evaluations.reduce((sum,e)=>sum+e.weighted_score,0)/i.evaluations.length);
    const average=roundScores.length ? Math.round(roundScores.reduce((sum,score)=>sum+score,0)/roundScores.length*100)/100 : null;
    const blockers:string[]=[];
    if(!live.length) blockers.push("Schedule and complete at least one interview.");
    if(live.some(i=>i.status!=="completed")) blockers.push("Every non-cancelled interview must be completed.");
    if(completed.some(i=>i.evaluations.length!==i.panel.length)) blockers.push("Every assigned panel member must submit an evaluation for each completed interview.");
    if(evaluators<hrRecruitmentEvidencePolicy.minimum_evaluators) blockers.push(`At least ${hrRecruitmentEvidencePolicy.minimum_evaluators} distinct evaluators are required.`);
    if(average===null || average<hrRecruitmentEvidencePolicy.selection_threshold) blockers.push(`The weighted panel average must be at least ${hrRecruitmentEvidencePolicy.selection_threshold}%.`);
    if(evaluations.some(e=>e.recommendation==="hold" || e.recommendation==="no_hire")) blockers.push("A panel recommendation is Hold or No hire; selection is blocked.");
    if(assessments.rows.some(a=>a.mandatory && a.status!=="passed")) blockers.push("Every mandatory assessment must have a passed outcome.");
    return {application:application.rows[0],interviews:interviews.rows.map(i=>({...i,starts_at:i.starts_at.toISOString()})),assessments:assessments.rows,history:history.rows.map(e=>({...e,occurred_at:e.occurred_at.toISOString()})),readiness:{ready:blockers.length===0,blockers,average_score:average,evaluators,minimum_evaluators:hrRecruitmentEvidencePolicy.minimum_evaluators,threshold:hrRecruitmentEvidencePolicy.selection_threshold,policy_version:hrRecruitmentEvidencePolicy.version}};
  }

  async performInterviewAction(context: HrActorContext, input: HrInterviewActionRequest, key: string, correlationId: string): Promise<HrInterviewActionResult> {
    const permission=input.action==="select"?"hr.employee.approve":"hr.employee.update";
    if(!context.actor.permissions.includes(permission)) throw new HrApiError(403,"PERMISSION_DENIED","You are not permitted to perform this recruitment action.");
    if(!validIdempotencyKey(key)) throw new HrApiError(400,"INVALID_IDEMPOTENCY_KEY","The idempotency key is invalid.");
    const client=await this.pool.connect();
    try {
      await client.query("begin"); await client.query("select set_config('nexora.tenant_id',$1,true)",[context.tenantId]);
      await this.requireCompanyAccess(client,context,input.company_id);
      const path="/api/v1/hr/recruitment_interviews/actions", fingerprint=stateHash(input);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify([context.tenantId,context.actor.userId,path,key])]);
      const replay=await client.query<{request_fingerprint:string;response_body:HrInterviewActionResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",[context.tenantId,context.actor.userId,path,key]);
      if(replay.rows[0]){if(replay.rows[0].request_fingerprint!==fingerprint)throw new HrApiError(409,"IDEMPOTENCY_CONFLICT","This request key was already used for different interview data.");await client.query("commit");return {...replay.rows[0].response_body,replayed:true};}
      // Application lock serializes evidence changes with pipeline decisions and selection.
      const application=await client.query<{stage:HrApplicationStage;opening_id:string;candidate_id:string}>("select stage,opening_id,candidate_id from hr_recruitment_application where tenant_id=$1 and company_id=$2 and id=$3 for update",[context.tenantId,input.company_id,input.application_id]);
      const app=application.rows[0]; if(!app)throw new HrApiError(404,"HR_APPLICATION_NOT_FOUND","The application is unavailable in your company scope.");
      if(!["shortlisted","interview","evaluation"].includes(app.stage))throw new HrApiError(409,"HR_INTERVIEW_STAGE_INVALID","Interview evidence can be maintained only for shortlisted, interview or evaluation applications.");
      const opening=await client.query("select id from hr_job_opening where tenant_id=$1 and company_id=$2 and id=$3 and state='open' for share",[context.tenantId,input.company_id,app.opening_id]);
      if(!opening.rowCount)throw new HrApiError(409,"HR_OPENING_UNAVAILABLE","Interview actions require an open job opening.");
      const candidate=await client.query("select id from hr_candidate where tenant_id=$1 and company_id=$2 and id=$3 and status='active' for share",[context.tenantId,input.company_id,app.candidate_id]);
      if(!candidate.rowCount)throw new HrApiError(409,"HR_CANDIDATE_UNAVAILABLE","Interview actions require an active candidate.");
      let entityId=input.application_id;
      let reason="reason" in input?input.reason:input.action==="evaluate"?"Panel evaluation submitted.":"Interview scheduled.";
      if(input.action==="schedule") {
        if(app.stage==="evaluation")throw new HrApiError(409,"HR_INTERVIEW_STAGE_INVALID","Schedule interview rounds before the evaluation stage.");
        if(Date.parse(input.starts_at)<=Date.now())throw new HrApiError(400,"HR_INTERVIEW_TIME_INVALID","Schedule the interview in the future.");
        const panel=await client.query<{id:string}>(`select u.id from security_user_account u where u.tenant_id=$1 and u.id=any($2::text[]) and u.status='active' and u.archived_at is null and exists(select 1 from security_user_company_access a where a.tenant_id=u.tenant_id and a.user_id=u.id and a.company_id=$3 and a.revoked_at is null) for share`,[context.tenantId,input.panel_user_ids,input.company_id]);
        if(panel.rowCount!==input.panel_user_ids.length)throw new HrApiError(409,"HR_INTERVIEW_PANEL_INVALID","All panel members must be active users with access to this company.");
        const round=await client.query<{round:number}>("select coalesce(max(round),0)::int+1 as round from hr_recruitment_interview where tenant_id=$1 and application_id=$2",[context.tenantId,input.application_id]);
        if(round.rows[0]!.round>20)throw new HrApiError(409,"HR_INTERVIEW_LIMIT","An application supports at most 20 interview rounds.");
        entityId=`interview-${randomUUID()}`;
        await client.query("insert into hr_recruitment_interview (tenant_id,id,application_id,round,kind,starts_at,duration_minutes,mode,location,template,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)",[context.tenantId,entityId,input.application_id,round.rows[0]!.round,input.kind,input.starts_at,input.duration_minutes,input.mode,input.location,JSON.stringify(hrInterviewTemplates[input.kind]),context.actor.userId]);
        for(const userId of input.panel_user_ids)await client.query("insert into hr_recruitment_interview_panel (tenant_id,interview_id,user_id) values ($1,$2,$3)",[context.tenantId,entityId,userId]);
      } else if(input.action==="assessment_add") {
        const count=await client.query<{count:number}>("select count(*)::int as count from hr_recruitment_assessment where tenant_id=$1 and application_id=$2",[context.tenantId,input.application_id]);
        if(count.rows[0]!.count>=30)throw new HrApiError(409,"HR_ASSESSMENT_LIMIT","An application supports at most 30 assessments.");
        entityId=`assessment-${randomUUID()}`;
        await client.query("insert into hr_recruitment_assessment (tenant_id,id,application_id,title,mandatory,reason,created_by) values ($1,$2,$3,$4,$5,$6,$7)",[context.tenantId,entityId,input.application_id,input.title,input.mandatory,input.reason,context.actor.userId]);
      } else if(input.action==="assessment_decide") {
        entityId=input.assessment_id;
        const changed=await client.query("update hr_recruitment_assessment set status=$4,reason=$5,decided_by=$6,decided_at=now() where tenant_id=$1 and application_id=$2 and id=$3 and status='pending' returning id",[context.tenantId,input.application_id,entityId,input.outcome,input.reason,context.actor.userId]);
        if(!changed.rowCount)throw new HrApiError(409,"HR_ASSESSMENT_NOT_PENDING","The assessment is unavailable or already has an immutable decision.");
      } else if(input.action==="select") {
        if(app.stage!=="evaluation")throw new HrApiError(409,"HR_INTERVIEW_STAGE_INVALID","Selection requires the application to be at Evaluation.");
        const evidence=await this.readInterviewEvidence(client,context,input.company_id,input.application_id);
        if(!evidence.readiness.ready)throw new HrApiError(409,"HR_RECRUITMENT_EVIDENCE_REQUIRED",evidence.readiness.blockers.join(" "));
        await client.query("update hr_recruitment_application set stage='selected',updated_at=now() where tenant_id=$1 and id=$2",[context.tenantId,input.application_id]);
        await client.query("insert into hr_recruitment_application_event (id,tenant_id,application_id,actor_id,from_stage,to_stage,reason) values ($1,$2,$3,$4,'evaluation','selected',$5)",[`application-event-${randomUUID()}`,context.tenantId,input.application_id,context.actor.userId,input.reason]);
      } else {
        entityId=input.interview_id;
        const result=await client.query<{status:string;version:number;starts_at:Date;template:{id:string;weight:number}[]}>("select status,version,starts_at,template from hr_recruitment_interview where tenant_id=$1 and application_id=$2 and id=$3 for update",[context.tenantId,input.application_id,entityId]);
        const interview=result.rows[0]; if(!interview)throw new HrApiError(404,"HR_INTERVIEW_NOT_FOUND","The interview is unavailable in this application.");
        if(input.action==="evaluate") {
          if(interview.status!=="completed")throw new HrApiError(409,"HR_INTERVIEW_NOT_COMPLETED","Evaluations may be submitted only after the interview is completed.");
          const panel=await client.query("select user_id from hr_recruitment_interview_panel where tenant_id=$1 and interview_id=$2 and user_id=$3",[context.tenantId,entityId,context.actor.userId]);
          if(!panel.rowCount)throw new HrApiError(403,"HR_INTERVIEW_PANEL_REQUIRED","Only the signed-in assigned panel member can submit their evaluation.");
          const expected=interview.template.map(c=>c.id).sort(),provided=Object.keys(input.scores).sort();
          if(JSON.stringify(expected)!==JSON.stringify(provided))throw new HrApiError(400,"HR_INTERVIEW_SCORES_INVALID","Score every criterion in the interview template, without extra criteria.");
          const score=Math.round(interview.template.reduce((sum,c)=>sum+input.scores[c.id]!/5*c.weight,0)*100)/100;
          await client.query("insert into hr_recruitment_interview_evaluation (tenant_id,id,interview_id,user_id,scores,weighted_score,recommendation,strengths,concerns) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)",[context.tenantId,`evaluation-${randomUUID()}`,entityId,context.actor.userId,JSON.stringify(input.scores),score,input.recommendation,input.strengths,input.concerns]);
        } else {
          if(input.expected_version!==interview.version)throw new HrApiError(409,"HR_INTERVIEW_STALE","The interview changed. Refresh before updating it.");
          if(input.action==="reschedule") {
            if(app.stage==="evaluation" || !["scheduled","no_show"].includes(interview.status))throw new HrApiError(409,"HR_INTERVIEW_FINAL","Only scheduled or no-show interviews can be rescheduled before Evaluation.");
            if(Date.parse(input.starts_at)<=Date.now())throw new HrApiError(400,"HR_INTERVIEW_TIME_INVALID","Reschedule the interview to a future time.");
            await client.query("update hr_recruitment_interview set starts_at=$3,duration_minutes=$4,mode=$5,location=$6,status='scheduled',version=version+1 where tenant_id=$1 and id=$2",[context.tenantId,entityId,input.starts_at,input.duration_minutes,input.mode,input.location]);
          } else {
            if(!["scheduled","no_show"].includes(interview.status) || (interview.status==="no_show" && input.action!=="cancel"))throw new HrApiError(409,"HR_INTERVIEW_FINAL","This interview status cannot be changed.");
            if(input.action!=="cancel" && interview.starts_at.getTime()>Date.now())throw new HrApiError(409,"HR_INTERVIEW_NOT_STARTED","An interview cannot be completed or marked no-show before its scheduled start.");
            if(input.action==="complete" && app.stage!=="interview")throw new HrApiError(409,"HR_INTERVIEW_STAGE_INVALID","Move the application to Interview before recording completion.");
            const status={complete:"completed",cancel:"cancelled",no_show:"no_show"}[input.action];
            await client.query("update hr_recruitment_interview set status=$3,version=version+1 where tenant_id=$1 and id=$2",[context.tenantId,entityId,status]);
          }
        }
      }
      await client.query("insert into hr_recruitment_interview_event (tenant_id,id,application_id,action,reason,actor_id) values ($1,$2,$3,$4,$5,$6)",[context.tenantId,`interview-event-${randomUUID()}`,input.application_id,input.action,reason,context.actor.userId]);
      const audit=await this.appendPlatformAudit(client,context,correlationId,"hr.interview.action",{entityId,entityType:"hr_recruitment_application",before:{application_stage:app.stage},after:{...input,policy:hrRecruitmentEvidencePolicy}});
      const output:HrInterviewActionResult={id:entityId,application_id:input.application_id,audit_event_id:audit,replayed:false};
      await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)",[context.tenantId,context.actor.userId,path,key,fingerprint,output,stateHash(output)]);
      await client.query("commit");return output;
    }catch(error){await client.query("rollback").catch(()=>undefined);if(typeof error==="object" && error!==null && "code" in error && error.code==="23505")throw new HrApiError(409,"HR_INTERVIEW_EVALUATION_EXISTS","This panel member has already submitted an immutable evaluation.");throw error;}finally{client.release();}
  }

  private requireOfferRead(context: HrActorContext): void {
    if(!context.actor.permissions.includes("hr.employee.read") || !context.actor.permissions.includes("hr.payroll.salary.read"))throw new HrApiError(403,"PERMISSION_DENIED","Offer access requires HR employee read and salary read permissions.");
  }
  async getOfferContext(context: HrActorContext, query: {company_id:string;application_id:string}): Promise<HrOfferContext> {
    this.requireOfferRead(context);return this.read(context,"hr.employee.read",async client=>{await this.requireCompanyAccess(client,context,query.company_id);return this.readOfferContext(client,context,query.company_id,query.application_id);});
  }
  private async readOfferContext(client: PoolClient, context: HrActorContext, companyId:string, applicationId:string, excludeOfferId=""): Promise<HrOfferContext> {
    const result=await client.query<HrOfferContext & {application_stage:string;candidate_status:string;opening_state:string;requisition_state:string;active_offer:boolean}>(`select a.id as application_id,a.reference as application_reference,concat_ws(' ',c.first_name,c.last_name) as candidate_name,company.name as company_name,o.id as opening_id,o.title as opening_title,o.reference as opening_reference,r.id as requisition_id,r.reference as requisition_reference,r.designation_id,designation.name as designation,r.job_grade_id,grade.name as job_grade,r.employment_type_id,et.name as employment_type,r.branch_id,branch.name as branch,r.department_id,department.name as department,r.salary_minimum::text,r.salary_maximum::text,r.currency_code,o.positions_requested::int as positions_authorized,
      (select count(*)::int from hr_recruitment_offer reserved where reserved.tenant_id=a.tenant_id and reserved.opening_id=o.id and (reserved.state='accepted' or (reserved.state in ('approved','generated','sent') and reserved.valid_until>=current_date))) as positions_reserved,
      current_date::text as today,a.stage as application_stage,c.status as candidate_status,o.state as opening_state,r.state as requisition_state,
      exists(select 1 from hr_recruitment_offer existing where existing.tenant_id=a.tenant_id and existing.application_id=a.id and existing.id<>$4 and existing.state in ('draft','submitted','approved','generated','sent','accepted')) as active_offer
      from hr_recruitment_application a join hr_candidate c on c.tenant_id=a.tenant_id and c.id=a.candidate_id join organization_unit company on company.tenant_id=a.tenant_id and company.id=a.company_id join hr_job_opening o on o.tenant_id=a.tenant_id and o.id=a.opening_id join hr_manpower_requisition r on r.tenant_id=o.tenant_id and r.id=o.requisition_id join hr_master_record designation on designation.tenant_id=r.tenant_id and designation.id=r.designation_id join hr_master_record grade on grade.tenant_id=r.tenant_id and grade.id=r.job_grade_id join hr_master_record et on et.tenant_id=r.tenant_id and et.id=r.employment_type_id join organization_unit branch on branch.tenant_id=r.tenant_id and branch.id=r.branch_id join organization_unit department on department.tenant_id=r.tenant_id and department.id=r.department_id where a.tenant_id=$1 and a.company_id=$2 and a.id=$3`,[context.tenantId,companyId,applicationId,excludeOfferId]);
    const row=result.rows[0];if(!row)throw new HrApiError(404,"HR_APPLICATION_NOT_FOUND","The application is unavailable in your company scope.");
    const {application_stage,candidate_status,opening_state,requisition_state,active_offer,...facts}=row;
    const blockers:string[]=[];
    if(application_stage!=="selected")blockers.push("The application must be Selected before preparing an offer.");
    if(candidate_status!=="active")blockers.push("The candidate must be active.");
    if(opening_state!=="open")blockers.push("The job opening must be open.");
    if(requisition_state!=="approved")blockers.push("An approved manpower requisition is required.");
    if(active_offer)blockers.push("An active or accepted offer already exists for this application.");
    return {...facts,blockers};
  }
  private offerColumns(): string {return `o.id,o.reference,o.company_id,o.application_id,a.reference as application_reference,concat_ws(' ',c.first_name,c.last_name) as candidate_name,j.title as opening_title,o.state,o.version,o.proposed_gross::text,o.currency_code,o.joining_on::text,o.valid_until::text,(o.valid_until<current_date and o.state in ('draft','submitted','approved','generated','sent')) as is_overdue,(o.proposed_gross<o.salary_minimum or o.proposed_gross>o.salary_maximum) as outside_range,o.created_at`;}
  private offerJoins(): string {return `from hr_recruitment_offer o join hr_recruitment_application a on a.tenant_id=o.tenant_id and a.id=o.application_id join hr_candidate c on c.tenant_id=a.tenant_id and c.id=a.candidate_id join hr_job_opening j on j.tenant_id=o.tenant_id and j.id=o.opening_id`;}
  async listOffers(context:HrActorContext, query:HrOfferQuery):Promise<HrOfferDirectory> {
    this.requireOfferRead(context);return this.read(context,"hr.employee.read",async client=>{
      await this.requireCompanyAccess(client,context,query.company_id);
      const values:unknown[]=[context.tenantId,query.company_id],filters=["o.tenant_id=$1","o.company_id=$2"];
      if(query.search){values.push(`%${query.search}%`);filters.push(`(o.reference ilike $${values.length} or concat_ws(' ',c.first_name,c.last_name) ilike $${values.length} or j.title ilike $${values.length})`);}
      if(query.state){values.push(query.state);filters.push(`o.state=$${values.length}`);}
      const count=await client.query<{total:number}>(`select count(*)::int as total ${this.offerJoins()} where ${filters.join(" and ")}`,values);
      values.push(query.limit,query.offset);
      const result=await client.query<HrOfferDirectory["items"][number] & {created_at:Date}>(`select ${this.offerColumns()} ${this.offerJoins()} where ${filters.join(" and ")} order by o.created_at desc,o.id desc limit $${values.length-1} offset $${values.length}`,values);
      return {items:result.rows.map(row=>({...row,created_at:row.created_at.toISOString()})),total:count.rows[0]?.total??0};
    });
  }
  async getOffer(context:HrActorContext, companyId:string, id:string):Promise<HrOfferDetail> {
    this.requireOfferRead(context);return this.read(context,"hr.employee.read",async client=>{await this.requireCompanyAccess(client,context,companyId);return this.readOfferDetail(client,context,companyId,id);});
  }
  private async readOfferDetail(client:PoolClient, context:HrActorContext, companyId:string, id:string):Promise<HrOfferDetail> {
    const record=await client.query<Omit<HrOfferDetail,"context"|"history"|"created_at"> & {created_at:Date;salary_minimum:string;salary_maximum:string}>(`select ${this.offerColumns()},o.probation_months,o.notice_days,o.cost_center_id,cc.name as cost_center,o.work_location_id,wl.name as work_location,o.employee_category_id,ec.name as employee_category,o.reporting_manager_id,case when manager.id is null then null else concat_ws(' ',manager.first_name,manager.last_name) end as reporting_manager,o.note,o.range_exception_reason,o.created_by,o.submitted_by,o.approved_by,o.exception_approved_by,o.approval_override_event_id,o.document_text,o.delivery_reference,o.response_reference,o.responded_on::text,o.salary_minimum::text,o.salary_maximum::text ${this.offerJoins()} join hr_master_record cc on cc.tenant_id=o.tenant_id and cc.id=o.cost_center_id join hr_master_record wl on wl.tenant_id=o.tenant_id and wl.id=o.work_location_id join hr_master_record ec on ec.tenant_id=o.tenant_id and ec.id=o.employee_category_id left join employee manager on manager.tenant_id=o.tenant_id and manager.id=o.reporting_manager_id where o.tenant_id=$1 and o.company_id=$2 and o.id=$3`,[context.tenantId,companyId,id]);
    const row=record.rows[0];if(!row)throw new HrApiError(404,"HR_OFFER_NOT_FOUND","The offer is unavailable in your company scope.");
    const ctx=await this.readOfferContext(client,context,companyId,row.application_id,id);
    const history=await client.query<HrOfferDetail["history"][number] & {occurred_at:Date}>(`select e.id,e.action,e.from_state,e.to_state,e.reason,e.evidence_reference,e.actor_id,coalesce(u.display_name,u.email,e.actor_id) as actor_name,e.occurred_at from hr_recruitment_offer_event e left join security_user_account u on u.tenant_id=e.tenant_id and u.id=e.actor_id where e.tenant_id=$1 and e.offer_id=$2 order by e.occurred_at,e.id`,[context.tenantId,id]);
    const {salary_minimum,salary_maximum,...detail}=row;
    return {...detail,created_at:row.created_at.toISOString(),context:{...ctx,salary_minimum,salary_maximum},history:history.rows.map(event=>({...event,occurred_at:event.occurred_at.toISOString()}))};
  }
  async createOffer(context:HrActorContext,input:CreateHrOfferRequest,key:string,corr:string):Promise<HrOfferResult>{return this.mutateOffer(context,input,key,corr);}
  async updateOffer(context:HrActorContext,id:string,input:UpdateHrOfferRequest,key:string,corr:string):Promise<HrOfferResult>{return this.mutateOffer(context,input,key,corr,id);}
  async performOfferAction(context:HrActorContext,id:string,input:HrOfferActionRequest,key:string,corr:string):Promise<HrOfferResult>{return this.mutateOffer(context,input,key,corr,id);}
  private async validateOfferTerms(client:PoolClient,context:HrActorContext,ctx:HrOfferContext,terms:CreateHrOfferRequest|UpdateHrOfferRequest):Promise<void>{
    if(terms.valid_until<ctx.today || terms.joining_on<ctx.today || terms.valid_until>terms.joining_on)throw new HrApiError(400,"HR_OFFER_DATES_INVALID","Validity and joining dates must be current or future, with validity on or before joining.");
    const range=await client.query<{outside:boolean}>("select $1::numeric<$2::numeric or $1::numeric>$3::numeric as outside",[terms.proposed_gross,ctx.salary_minimum,ctx.salary_maximum]);
    if(range.rows[0]!.outside&&!terms.range_exception_reason.trim())throw new HrApiError(400,"HR_OFFER_EXCEPTION_REASON_REQUIRED","Explain the proposed compensation exception before submitting an out-of-range offer.");
    for(const [id,type] of [[terms.cost_center_id,"cost_center"],[terms.work_location_id,"work_location"],[terms.employee_category_id,"employee_category"],[ctx.designation_id,"designation"],[ctx.job_grade_id,"job_grade"],[ctx.employment_type_id,"employment_type"]]){
      const record=await client.query("select id from hr_master_record where tenant_id=$1 and company_id=$2 and id=$3 and master_type=$4 and status='active' for share",[context.tenantId,terms.company_id,id,type]);
      if(!record.rowCount)throw new HrApiError(409,"HR_OFFER_MASTER_INVALID","All offer placement and employment masters must be active in this company.");
    }
    const organization=await client.query("select branch.id from organization_unit branch join organization_unit department on department.tenant_id=branch.tenant_id and department.parent_id=branch.id and department.id=$4 and department.status='active' where branch.tenant_id=$1 and branch.id=$3 and branch.parent_id=$2 and branch.status='active'",[context.tenantId,terms.company_id,ctx.branch_id,ctx.department_id]);
    if(!organization.rowCount)throw new HrApiError(409,"HR_OFFER_MASTER_INVALID","The approved branch and department must remain active in this company.");
    if(terms.reporting_manager_id){
      const manager=await client.query("select e.id from employee e join employee_assignment a on a.tenant_id=e.tenant_id and a.employee_id=e.id where e.tenant_id=$1 and e.id=$2 and e.status in ('active','probation','confirmed') and a.company_id=$3 and a.assignment_status in ('active','legacy_compatibility') and a.effective_from<=current_date and (a.effective_to is null or a.effective_to>=current_date) limit 1",[context.tenantId,terms.reporting_manager_id,terms.company_id]);
      if(!manager.rowCount)throw new HrApiError(409,"HR_OFFER_MANAGER_INVALID","Select an active reporting manager in this company.");
    }
  }
  private async mutateOffer(context:HrActorContext,input:CreateHrOfferRequest|UpdateHrOfferRequest|HrOfferActionRequest,key:string,corr:string,offerId?:string):Promise<HrOfferResult>{
    this.requireOfferRead(context);
    const create=offerId===undefined && "application_id" in input, action="action" in input?input.action:create?"create":"update";
    const permission=create?"hr.employee.create":action==="submit"?"hr.employee.submit":["approve","reject_approval"].includes(action)?"hr.employee.approve":"hr.employee.update";
    if(!context.actor.permissions.includes(permission))throw new HrApiError(403,"PERMISSION_DENIED","You are not permitted to perform this offer action.");
    if(!validIdempotencyKey(key))throw new HrApiError(400,"INVALID_IDEMPOTENCY_KEY","The idempotency key is invalid.");
    const client=await this.pool.connect();try{
      await client.query("begin");await client.query("select set_config('nexora.tenant_id',$1,true)",[context.tenantId]);await this.requireCompanyAccess(client,context,input.company_id);
      const path=create?"/api/v1/hr/recruitment_offers":`/api/v1/hr/recruitment_offers/${offerId}/${action==="update"?"terms":"actions"}`,fingerprint=stateHash(input);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify([context.tenantId,context.actor.userId,path,key])]);
      const replay=await client.query<{request_fingerprint:string;response_body:HrOfferResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",[context.tenantId,context.actor.userId,path,key]);
      if(replay.rows[0]){if(replay.rows[0].request_fingerprint!==fingerprint)throw new HrApiError(409,"IDEMPOTENCY_CONFLICT","This request key was already used for different offer data.");await client.query("commit");return {...replay.rows[0].response_body,replayed:true};}
      let appId=create?input.application_id:"";
      if(!create){const r=await client.query<{application_id:string}>("select application_id from hr_recruitment_offer where tenant_id=$1 and company_id=$2 and id=$3",[context.tenantId,input.company_id,offerId]);if(!r.rows[0])throw new HrApiError(404,"HR_OFFER_NOT_FOUND","The offer is unavailable in your company scope.");appId=r.rows[0].application_id;}
      const app=await client.query<{opening_id:string}>("select opening_id from hr_recruitment_application where tenant_id=$1 and company_id=$2 and id=$3 for update",[context.tenantId,input.company_id,appId]);if(!app.rows[0])throw new HrApiError(404,"HR_APPLICATION_NOT_FOUND","The application is unavailable in your company scope.");
      // Serialize competing reservations for the same authorized opening.
      await client.query("select id from hr_job_opening where tenant_id=$1 and id=$2 for update",[context.tenantId,app.rows[0].opening_id]);
      if(!create)await client.query("select id from hr_recruitment_offer where tenant_id=$1 and id=$2 for update",[context.tenantId,offerId]);
      const ctx=await this.readOfferContext(client,context,input.company_id,appId,offerId);
      let before:HrOfferDetail|null=null;if(!create)before=await this.readOfferDetail(client,context,input.company_id,offerId!);
      if(before&&"expected_version" in input&&before.version!==input.expected_version)throw new HrApiError(409,"HR_OFFER_STALE","This offer changed. Refresh before making another decision.");
      const closing=["withdraw","expire","decline","reject_approval"].includes(action);
      if(!closing&&ctx.blockers.length)throw new HrApiError(409,"HR_OFFER_AUTHORITY_INVALID",ctx.blockers.join(" "));
      const id=offerId??`offer-${randomUUID()}`,reference=before?.reference??`OFR-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-","").slice(0,12).toUpperCase()}`;
      let state:HrOfferResult["state"]=before?.state??"draft",version=before?.version??1;
      let reason="Offer draft prepared.",evidence="";
      if(create && ctx.positions_reserved>=ctx.positions_authorized)throw new HrApiError(409,"HR_OFFER_HEADCOUNT_EXCEEDED","All authorized positions are already reserved.");
      if(!("action" in input)){
        if(before&&before.state!=="draft")throw new HrApiError(409,"HR_OFFER_TERMS_FROZEN","Only draft offer terms can be edited. Withdraw this offer and prepare a new version if needed.");
        await this.validateOfferTerms(client,context,ctx,input);
        const terms=[input.proposed_gross,input.joining_on,input.valid_until,input.probation_months,input.notice_days,input.cost_center_id,input.work_location_id,input.employee_category_id,input.reporting_manager_id,input.note,input.range_exception_reason];
        if(create)await client.query("insert into hr_recruitment_offer (tenant_id,id,company_id,application_id,opening_id,requisition_id,reference,designation_id,job_grade_id,employment_type_id,branch_id,department_id,salary_minimum,salary_maximum,currency_code,created_by,proposed_gross,joining_on,valid_until,probation_months,notice_days,cost_center_id,work_location_id,employee_category_id,reporting_manager_id,note,range_exception_reason) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)",[context.tenantId,id,input.company_id,appId,ctx.opening_id,ctx.requisition_id,reference,ctx.designation_id,ctx.job_grade_id,ctx.employment_type_id,ctx.branch_id,ctx.department_id,ctx.salary_minimum,ctx.salary_maximum,ctx.currency_code,context.actor.userId,...terms]);
        else{await client.query("update hr_recruitment_offer set proposed_gross=$3,joining_on=$4,valid_until=$5,probation_months=$6,notice_days=$7,cost_center_id=$8,work_location_id=$9,employee_category_id=$10,reporting_manager_id=$11,note=$12,range_exception_reason=$13,version=version+1,updated_at=now() where tenant_id=$1 and id=$2",[context.tenantId,id,...terms]);version++;reason="Draft offer terms updated.";}
      }else{
        reason=input.reason;evidence=input.evidence_reference;
        const transitions:Record<string,readonly string[]>={submit:["draft"],approve:["submitted"],reject_approval:["submitted"],generate:["approved"],record_sent:["generated"],accept:["sent"],decline:["sent"],withdraw:["draft","submitted","approved","generated","sent"],expire:["draft","submitted","approved","generated","sent"]};
        if(!transitions[input.action]?.includes(state))throw new HrApiError(409,"HR_OFFER_TRANSITION_INVALID","This offer cannot perform the requested action in its current state.");
        if(input.action==="expire"&&!before!.is_overdue)throw new HrApiError(409,"HR_OFFER_NOT_EXPIRED","The offer validity date has not passed.");
        if(!closing&&(before!.valid_until<ctx.today||before!.joining_on<ctx.today))throw new HrApiError(409,"HR_OFFER_EXPIRED","This offer's validity or joining date has passed. Withdraw or expire it and prepare new terms.");
        if(["approve","generate","record_sent","accept"].includes(input.action)){
          await this.validateOfferTerms(client,context,ctx,{...before!,company_id:input.company_id,expected_version:before!.version});
          const reservations=await client.query<{count:number}>("select count(*)::int as count from hr_recruitment_offer where tenant_id=$1 and opening_id=$2 and id<>$3 and (state='accepted' or (state in ('approved','generated','sent') and valid_until>=current_date))",[context.tenantId,ctx.opening_id,id]);
          if(reservations.rows[0]!.count>=ctx.positions_authorized)throw new HrApiError(409,"HR_OFFER_HEADCOUNT_EXCEEDED","All authorized positions are reserved by approved or accepted offers.");
        }
        let extra="",values:unknown[]=[context.tenantId,id];
        if(input.action==="submit"){
          await this.validateOfferTerms(client,context,ctx,{...before!,company_id:input.company_id,expected_version:before!.version});
          state="submitted";values.push(context.actor.userId);extra=",submitted_by=$4";
        }else if(input.action==="approve"||input.action==="reject_approval"){
          if(input.action==="approve"&&before!.outside_range&&(!input.approve_range_exception||!context.actor.permissions.includes("hr.payroll.salary.approve")))throw new HrApiError(403,"HR_OFFER_EXCEPTION_APPROVAL_REQUIRED","Out-of-range compensation requires explicit approval and salary approval permission.");
          const override=await this.resolveApprovalOverride(client,context,{normalDecisionPermission:permission,makerActorIds:[before!.created_by,before!.submitted_by].filter((v):v is string=>!!v),resourceType:"hr.recruitment_offer",resourceId:id,decisionAction:input.action==="approve"?"approve":"reject",reason:input.reason,correlationId:corr,idempotencyKey:key});
          state=input.action==="approve"?"approved":"rejected";values.push(context.actor.userId,input.reason,input.action==="approve"&&before!.outside_range?context.actor.userId:null,override);extra=",approved_by=$4,approved_at=now(),approval_reason=$5,exception_approved_by=$6,approval_override_event_id=$7";
        }else if(input.action==="generate"){
          const approver=await client.query<{name:string}>("select coalesce(display_name,email) as name from security_user_account where tenant_id=$1 and id=$2",[context.tenantId,before!.approved_by]);
          const offer=before!;const letter=[ctx.company_name,"EMPLOYMENT OFFER",`Reference: ${reference}`,`Candidate: ${offer.candidate_name}`,"",`We are pleased to offer you the position of ${ctx.designation} (${ctx.job_grade}), ${ctx.department}, ${ctx.branch}.`,`Employment type: ${ctx.employment_type}`,`Monthly gross compensation: ${offer.currency_code} ${offer.proposed_gross}`,`Joining date: ${offer.joining_on}`,`Offer valid through: ${offer.valid_until}`,`Probation: ${offer.probation_months} months. Notice: ${offer.notice_days} days.`,`Work location: ${offer.work_location}`,`Employee category: ${offer.employee_category}`,`Reporting manager: ${offer.reporting_manager??"To be assigned"}`,offer.note?`Additional terms: ${offer.note}`:"", "Please confirm your acceptance before the validity date.",`Approved by: ${approver.rows[0]?.name ?? offer.approved_by}`].filter(Boolean).join("\n");
          state="generated";values.push(letter);extra=",document_text=$4";
        }else if(input.action==="record_sent"){state="sent";values.push(input.evidence_reference);extra=",delivery_reference=$4";
        }else if(input.action==="accept"||input.action==="decline"){
          const delivered=await client.query<{sent_on:string}>("select min(occurred_at)::date::text as sent_on from hr_recruitment_offer_event where tenant_id=$1 and offer_id=$2 and action='record_sent'",[context.tenantId,id]);
          if(!input.responded_on||input.responded_on>ctx.today||input.responded_on<delivered.rows[0]!.sent_on||input.responded_on>before!.valid_until)throw new HrApiError(400,"HR_OFFER_RESPONSE_DATE_INVALID","The response date must be between recorded delivery and today, within offer validity.");
          state=input.action==="accept"?"accepted":"declined";values.push(input.evidence_reference,input.responded_on);extra=",response_reference=$4,responded_on=$5";
        }else state=input.action==="withdraw"?"withdrawn":"expired";
        values.splice(2,0,state);
        await client.query(`update hr_recruitment_offer set state=$3,version=version+1,updated_at=now()${extra} where tenant_id=$1 and id=$2`,values);version++;
      }
      await client.query("insert into hr_recruitment_offer_event (tenant_id,id,offer_id,action,from_state,to_state,reason,evidence_reference,actor_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",[context.tenantId,`offer-event-${randomUUID()}`,id,action,before?.state??null,state,reason,evidence,context.actor.userId]);
      const audit=await this.appendPlatformAudit(client,context,corr,"hr.offer.action",{entityId:id,entityType:"hr_recruitment_offer",before:before?{state:before.state,version:before.version}:null,after:{...input,reference,state,version}});
      const output:HrOfferResult={id,reference,state,version,audit_event_id:audit,replayed:false};
      await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,$6,$7,$8)",[context.tenantId,context.actor.userId,path,key,fingerprint,create?201:200,output,stateHash(output)]);await client.query("commit");return output;
    }catch(error){await client.query("rollback").catch(()=>undefined);if(typeof error==="object"&&error!==null&&"constraint" in error&&error.constraint==="uq_hr_offer_active_application")throw new HrApiError(409,"HR_OFFER_EXISTS","An active or accepted offer already exists for this application.");throw error;}finally{client.release();}
  }

  async getOfferEmployeeWorkspace(context:HrActorContext, companyId:string, offerId:string):Promise<HrOfferEmployeeWorkspace> {
    this.requireOfferRead(context);
    return this.read(context,"hr.employee.read",async client=>{
      await this.requireCompanyAccess(client,context,companyId);
      const offer=await this.readOfferDetail(client,context,companyId,offerId);
      const source=await client.query<HrOfferEmployeeWorkspace["candidate"] & {stage:HrApplicationStage;status:string}>(`select c.id,c.first_name,c.last_name,c.email,c.phone,c.status,a.stage from hr_recruitment_application a join hr_candidate c on c.tenant_id=a.tenant_id and c.id=a.candidate_id where a.tenant_id=$1 and a.company_id=$2 and a.id=$3`,[context.tenantId,companyId,offer.application_id]);
      const {stage,status,...candidate}=source.rows[0]!;
      const handoff=await client.query<NonNullable<HrOfferEmployeeWorkspace["handoff"]> & {created_at:Date}>(`select h.employee_id,e.employee_number,e.status as employee_status,coalesce(p.state,'draft') as profile_approval,
        (select a.id from employee_assignment a where a.tenant_id=h.tenant_id and a.employee_id=h.employee_id and a.company_id=h.company_id and a.assignment_status='profile_draft' order by a.created_at desc,a.id desc limit 1) as assignment_id,
        (select r.approval_state from hr_employment_lifecycle_request r join hr_employment_relationship er on er.tenant_id=r.tenant_id and er.id=r.relationship_id join hr_employment_lifecycle_transition t on t.tenant_id=r.tenant_id and t.id=r.transition_id where er.tenant_id=h.tenant_id and er.employee_id=h.employee_id and er.legal_employer_id=h.company_id and t.event_type='hire' order by r.requested_at desc,r.id desc limit 1) as hire_state,
        h.created_at,h.created_by,h.reason from hr_offer_employee_handoff h join employee e on e.tenant_id=h.tenant_id and e.id=h.employee_id left join hr_employee_draft_approval p on p.tenant_id=e.tenant_id and p.employee_id=e.id where h.tenant_id=$1 and h.company_id=$2 and h.offer_id=$3`,[context.tenantId,companyId,offerId]);
      const blockers:string[]=[];
      if(offer.state!=="accepted")blockers.push("Record acceptance of the approved and delivered offer first.");
      if(stage!=="selected" && !handoff.rowCount)blockers.push("The application must remain selected until the governed hire is approved.");
      if(status!=="active" && !handoff.rowCount)blockers.push("The candidate must be active.");
      const duplicate=await client.query("select 1 from hr_offer_employee_handoff where tenant_id=$1 and company_id=$2 and candidate_id=$3 and offer_id<>$4",[context.tenantId,companyId,candidate.id,offerId]);
      if(duplicate.rowCount)blockers.push("This candidate already has an employee handoff. Review the existing employee before proceeding.");
      if(!handoff.rowCount) {
        const existingIdentity=await client.query("select 1 from employee where tenant_id=$1 and (lower(nullif(work_email,''))=lower($2) or lower(nullif(personal_email,''))=lower($2)) limit 1",[context.tenantId,candidate.email]);
        if(existingIdentity.rowCount)blockers.push("An employee already uses this candidate email. Review the existing employment before creating another record.");
      }
      return {offer,candidate,application_stage:stage,blockers,handoff:handoff.rows[0]?{...handoff.rows[0],created_at:handoff.rows[0].created_at.toISOString()}:null};
    });
  }

  async createOfferEmployee(context:HrActorContext, offerId:string, input:CreateHrOfferEmployeeRequest, key:string, correlationId:string):Promise<HrOfferEmployeeResult> {
    this.requireOfferRead(context);
    if(!context.actor.permissions.includes("hr.employee.create"))throw new HrApiError(403,"PERMISSION_DENIED","Employee creation permission is required.");
    if(!validIdempotencyKey(key))throw new HrApiError(400,"INVALID_IDEMPOTENCY_KEY","The idempotency key is invalid.");
    const client=await this.pool.connect();
    try {
      await client.query("begin");await client.query("select set_config('nexora.tenant_id',$1,true)",[context.tenantId]);
      await this.requireCompanyAccess(client,context,input.company_id);
      // Use the same lock as manual employee creation, then serialize retries before reading replay evidence.
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`nexora:hr:employee-draft:${context.tenantId}`]);
      const path=`/api/v1/hr/recruitment_offers/${offerId}/employee`, fingerprint=stateHash(input);
      const replay=await client.query<{request_fingerprint:string;response_body:HrOfferEmployeeResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",[context.tenantId,context.actor.userId,path,key]);
      if(replay.rows[0]){if(replay.rows[0].request_fingerprint!==fingerprint)throw new HrApiError(409,"IDEMPOTENCY_CONFLICT","This request key was already used for another employee handoff.");await client.query("commit");return {...replay.rows[0].response_body,replayed:true};}
      const source=await client.query<{application_id:string;candidate_id:string;first_name:string;last_name:string;email:string;phone:string;joining_on:string;version:number;state:string;stage:string;candidate_status:string}>(`select o.application_id,a.candidate_id,c.first_name,c.last_name,c.email,c.phone,o.joining_on::text,o.version,o.state,a.stage,c.status as candidate_status from hr_recruitment_offer o join hr_recruitment_application a on a.tenant_id=o.tenant_id and a.id=o.application_id join hr_candidate c on c.tenant_id=a.tenant_id and c.id=a.candidate_id where o.tenant_id=$1 and o.company_id=$2 and o.id=$3 for update of a,c`,[context.tenantId,input.company_id,offerId]);
      const row=source.rows[0];if(!row)throw new HrApiError(404,"HR_OFFER_NOT_FOUND","The offer is unavailable in your company scope.");
      if(row.state!=="accepted" || row.stage!=="selected" || row.candidate_status!=="active")throw new HrApiError(409,"HR_OFFER_HANDOFF_NOT_READY","An accepted offer, selected application and active candidate are required.");
      if(row.version!==input.expected_version)throw new HrApiError(409,"HR_OFFER_STALE","The offer changed. Refresh before creating the employee.");
      const existing=await client.query("select 1 from hr_offer_employee_handoff where tenant_id=$1 and (offer_id=$2 or employee_id in (select id from employee where tenant_id=$1 and employee_number=$3) or (company_id=$4 and candidate_id=$5))",[context.tenantId,offerId,input.employee_number,input.company_id,row.candidate_id]);
      if(existing.rowCount)throw new HrApiError(409,"HR_OFFER_EMPLOYEE_EXISTS","This offer or candidate already has an employee handoff. Open the existing record; another employee was not created.");
      const duplicate=await client.query("select 1 from employee where tenant_id=$1 and (lower(nullif(work_email,''))=lower($2) or lower(nullif(personal_email,''))=lower($2) or ($3::text is not null and lower(nullif(work_email,''))=lower($3))) limit 1",[context.tenantId,row.email,input.work_email??null]);
      if(duplicate.rowCount)throw new HrApiError(409,"HR_EMPLOYEE_IDENTITY_EXISTS","An employee already uses this email. Review their existing employment before creating another record.");
      const draft=await this.insertEmployeeDraft(client,context,{company_id:input.company_id,employee_number:input.employee_number,first_name:row.first_name,last_name:row.last_name,joined_on:row.joining_on,work_email:input.work_email,phone:row.phone},correlationId,row.email);
      await client.query("insert into hr_offer_employee_handoff (tenant_id,offer_id,company_id,application_id,candidate_id,employee_id,created_by,reason) values ($1,$2,$3,$4,$5,$6,$7,$8)",[context.tenantId,offerId,input.company_id,row.application_id,row.candidate_id,draft.id,context.actor.userId,input.reason]);
      const audit=await this.appendPlatformAudit(client,context,correlationId,"hr.offer.employee_draft",{entityId:offerId,entityType:"hr_recruitment_offer",before:null,after:{employee_id:draft.id,application_id:row.application_id,candidate_id:row.candidate_id,company_id:input.company_id,offer_version:row.version,reason:input.reason,status:"draft"}});
      const result:HrOfferEmployeeResult={...draft,offer_id:offerId,audit_event_id:audit};
      await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,201,$6,$7)",[context.tenantId,context.actor.userId,path,key,fingerprint,result,stateHash(result)]);
      await client.query("commit");return result;
    }catch(error){await client.query("rollback").catch(()=>undefined);if((error as {code?:string}).code==="23505")throw new HrApiError(409,"HR_EMPLOYEE_ALREADY_EXISTS","The employee number, offer or candidate is already linked to an employee.");throw error;}finally{client.release();}
  }

  private async requireOfferAssignmentMatch(client:PoolClient, context:HrActorContext, employeeId:string, input:CreateHrProfileDraftAssignmentRequest):Promise<void> {
    const source=await client.query<{matches:boolean}>(`select (o.company_id=$3 and o.branch_id is not distinct from $4::text and o.department_id is not distinct from $5::text and o.designation_id=$6 and o.job_grade_id=$7 and o.cost_center_id=$8 and o.work_location_id=$9 and o.employment_type_id=$10 and o.employee_category_id=$11 and o.reporting_manager_id is not distinct from $12::text and o.joining_on=$13::date) as matches from hr_offer_employee_handoff h join hr_recruitment_offer o on o.tenant_id=h.tenant_id and o.id=h.offer_id where h.tenant_id=$1 and h.employee_id=$2`,[context.tenantId,employeeId,input.company_id,input.branch_id??null,input.department_id??null,input.designation_id,input.job_grade_id,input.cost_center_id,input.work_location_id,input.employment_type_id,input.employee_category_id,input.reporting_manager_id??null,input.effective_from]);
    if(source.rows[0] && !source.rows[0].matches)throw new HrApiError(409,"HR_OFFER_ASSIGNMENT_MISMATCH","The initial assignment must match the accepted offer's company, role, grade, location, cost centre, employment type, category, manager and joining date.");
  }

  private allocationSelect(): string {
    return `select a.id,a.reference,a.company_id,a.scope,a.scope_id,case when a.scope='employee' then concat_ws(' ',e.first_name,e.middle_name,e.last_name) else coalesce(o.name,a.scope_id) end as scope_name,case when a.scope='employee' then coalesce(e.employee_number,a.scope_id) else coalesce(o.code,a.scope_id) end as scope_code,
    a.shift_id,s.code as shift_code,s.name as shift_name,s.time_zone,s.work_location_id,loc.name as work_location,a.effective_from::text,a.effective_to::text,a.version,
    case when a.cancelled_at is not null then 'cancelled' when a.effective_to<current_date then 'ended' when a.effective_from>current_date then 'scheduled' else 'active' end as state,
    a.note,a.replaces_assignment_id,a.created_at from hr_shift_assignment a join hr_shift s on s.tenant_id=a.tenant_id and s.id=a.shift_id left join employee e on e.tenant_id=a.tenant_id and e.id=a.scope_id and a.scope='employee' left join organization_unit o on o.tenant_id=a.tenant_id and o.id=a.scope_id and a.scope<>'employee' left join hr_master_record loc on loc.tenant_id=s.tenant_id and loc.id=s.work_location_id`;
  }
  private allocationRow(
    row: HrShiftAllocationSummary & { created_at: Date | string },
  ): HrShiftAllocationSummary {
    return { ...row, created_at: new Date(row.created_at).toISOString() };
  }
  private operationalShiftEligibility(dateParameter = "$3"): string {
    return `((ea.assignment_status='legacy_compatibility' or (ea.assignment_status='ended' and ea.employment_relationship_id is null)) or (ea.assignment_status in ('active','ended') and er.approval_state='approved' and (er.status='active' or ${dateParameter}::date<current_date)))`;
  }
  async getShiftAllocationContext(
    context: HrActorContext,
    query: HrShiftAllocationContextQuery,
  ): Promise<HrShiftAllocationContext> {
    return this.read(context, "hr.attendance.shift.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const today = (await client.query<{ today: string }>("select current_date::text as today")).rows[0]!
        .today;
      const search = query.search ? `%${query.search}%` : null;
      let targets: { id: string; code: string; name: string }[];
      if (query.scope === "employee") {
        targets = (
          await client.query<{ id: string; code: string; name: string }>(
            `select distinct e.id,e.employee_number as code,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as name from employee e join employee_assignment ea on ea.tenant_id=e.tenant_id and ea.employee_id=e.id left join hr_employment_relationship er on er.tenant_id=ea.tenant_id and er.id=ea.employment_relationship_id where e.tenant_id=$1 and ea.company_id=$2 and ea.effective_from<=$3 and (ea.effective_to is null or ea.effective_to>=$3) and ${this.operationalShiftEligibility()} and ($3::date<current_date or e.status in ('active','probation','confirmed')) and ($4::text is null or e.employee_number ilike $4 or concat_ws(' ',e.first_name,e.middle_name,e.last_name) ilike $4) order by name,e.id limit 101`,
            [context.tenantId, query.company_id, query.on_date, search],
          )
        ).rows;
      } else {
        targets = (
          await client.query<{ id: string; code: string; name: string }>(
            `with recursive tree as(select id,parent_id,type,code,name,status from organization_unit where tenant_id=$1 and id=$2 and type='company' and status='active' union all select child.id,child.parent_id,child.type,child.code,child.name,child.status from organization_unit child join tree p on p.id=child.parent_id where child.tenant_id=$1 and child.status='active') select id,code,name from tree where type=$3 and ($4::text is null or code ilike $4 or name ilike $4) order by name,id limit 101`,
            [context.tenantId, query.company_id, query.scope, search],
          )
        ).rows;
      }
      return { today, targets: targets.slice(0, 100), capped: targets.length > 100 };
    });
  }
  async listShiftAllocations(
    context: HrActorContext,
    query: HrShiftAllocationQuery,
  ): Promise<HrShiftAllocationDirectory> {
    return this.read(context, "hr.attendance.shift.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id],
        filters = ["a.tenant_id=$1", "a.company_id=$2"];
      if (query.scope) {
        values.push(query.scope);
        filters.push(`a.scope=$${values.length}`);
      }
      if (query.scope_id) {
        values.push(query.scope_id);
        filters.push(`a.scope_id=$${values.length}`);
      }
      if (query.search) {
        values.push(`%${query.search}%`);
        filters.push(
          `(a.reference ilike $${values.length} or s.code ilike $${values.length} or s.name ilike $${values.length} or e.employee_number ilike $${values.length} or concat_ws(' ',e.first_name,e.middle_name,e.last_name) ilike $${values.length} or o.name ilike $${values.length})`,
        );
      }
      if (query.on_date) {
        values.push(query.on_date);
        filters.push(
          `a.cancelled_at is null and a.effective_from<=$${values.length}::date and (a.effective_to is null or a.effective_to>=$${values.length}::date)`,
        );
      }
      if (query.state) {
        const state = {
          cancelled: "a.cancelled_at is not null",
          ended: "a.cancelled_at is null and a.effective_to<current_date",
          scheduled: "a.cancelled_at is null and a.effective_from>current_date",
          active:
            "a.cancelled_at is null and a.effective_from<=current_date and (a.effective_to is null or a.effective_to>=current_date)",
        };
        filters.push(state[query.state]);
      }
      const base = `${this.allocationSelect()} where ${filters.join(" and ")}`;
      const total = await client.query<{ total: number }>(
        `select count(*)::int as total from (${base}) results`,
        values,
      );
      values.push(query.limit, query.offset);
      const rows = await client.query<HrShiftAllocationSummary & { created_at: Date }>(
        `${base} order by a.effective_from desc,a.created_at desc,a.id desc limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      return { items: rows.rows.map((row) => this.allocationRow(row)), total: total.rows[0]!.total };
    });
  }
  async getShiftAllocation(
    context: HrActorContext,
    companyId: string,
    id: string,
  ): Promise<HrShiftAllocationDetail> {
    return this.read(context, "hr.attendance.shift.read", async (client) => {
      await this.requireCompanyAccess(client, context, companyId);
      return this.readShiftAllocation(client, context, companyId, id);
    });
  }
  private async readShiftAllocation(
    client: PoolClient,
    context: HrActorContext,
    companyId: string,
    id: string,
  ): Promise<HrShiftAllocationDetail> {
    const result = await client.query<HrShiftAllocationSummary & { created_at: Date }>(
      `${this.allocationSelect()} where a.tenant_id=$1 and a.company_id=$2 and a.id=$3`,
      [context.tenantId, companyId, id],
    );
    if (!result.rows[0])
      throw new HrApiError(
        404,
        "HR_SHIFT_ALLOCATION_NOT_FOUND",
        "The shift assignment is unavailable in your company scope.",
      );
    const history = await client.query<HrShiftAllocationDetail["history"][number] & { occurred_at: Date }>(
      `select ev.id,ev.action,ev.version,ev.reason,coalesce(u.display_name,u.email,ev.actor_id) as actor_name,related.reference as related_reference,ev.occurred_at from hr_shift_assignment_event ev left join security_user_account u on u.tenant_id=ev.tenant_id and u.id=ev.actor_id left join hr_shift_assignment related on related.tenant_id=ev.tenant_id and related.id=ev.related_assignment_id where ev.tenant_id=$1 and ev.assignment_id=$2 order by ev.version desc limit 50`,
      [context.tenantId, id],
    );
    return {
      ...this.allocationRow(result.rows[0]),
      history: history.rows.map((row) => ({ ...row, occurred_at: row.occurred_at.toISOString() })),
    };
  }
  async resolveEmployeeShift(
    context: HrActorContext,
    query: HrShiftResolutionQuery,
  ): Promise<HrShiftResolution> {
    return this.read(context, "hr.attendance.shift.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const person = await client.query<{
        id: string;
        employee_number: string;
        display_name: string;
        status: string;
      }>(
        `select e.id,e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as display_name,e.status from employee e where e.tenant_id=$1 and e.id=$3 and exists(select 1 from employee_assignment ea where ea.tenant_id=e.tenant_id and ea.employee_id=e.id and ea.company_id=$2 and ea.assignment_status in ('active','legacy_compatibility'))`,
        [context.tenantId, query.company_id, query.employee_id],
      );
      const employee = person.rows[0];
      if (!employee)
        throw new HrApiError(
          404,
          "HR_SHIFT_EMPLOYEE_NOT_FOUND",
          "The employee has no operational employment in your company scope.",
        );
      const placement = await client.query<{
        id: string;
        department_id: string | null;
        branch_id: string | null;
        work_location_id: string | null;
      }>(
        `select ea.id,ea.department_id,ea.branch_id,ea.work_location_id from employee_assignment ea left join hr_employment_relationship er on er.tenant_id=ea.tenant_id and er.id=ea.employment_relationship_id where ea.tenant_id=$1 and ea.company_id=$2 and ea.employee_id=$3 and ea.effective_from<=$4 and (ea.effective_to is null or ea.effective_to>=$4) and ${this.operationalShiftEligibility("$4")} order by ea.effective_from desc,ea.id`,
        [context.tenantId, query.company_id, query.employee_id, query.on_date],
      );
      const blockers: string[] = [];
      const at = placement.rows[0];
      if (!at) blockers.push("No approved operational employee assignment covers this date.");
      else if (placement.rows.length > 1)
        blockers.push(
          "Multiple operational employee assignments cover this date. Resolve the placement before assigning a shift.",
        );
      const today = (await client.query<{ today: string }>("select current_date::text as today")).rows[0]!
        .today;
      if (query.on_date >= today && !["active", "probation", "confirmed"].includes(employee.status))
        blockers.push("The employee is not currently eligible for roster allocation.");
      let contenders: HrShiftAllocationSummary[] = [];
      let resolved: HrShiftSummary | null = null;
      if (at && placement.rows.length === 1) {
        const rows = await client.query<HrShiftAllocationSummary & { created_at: Date }>(
          `${this.allocationSelect()} where a.tenant_id=$1 and a.company_id=$2 and a.cancelled_at is null and a.effective_from<=$6 and (a.effective_to is null or a.effective_to>=$6) and ((a.scope='employee' and a.scope_id=$3) or (a.scope='department' and a.scope_id=$4) or (a.scope='branch' and a.scope_id=$5)) order by case a.scope when 'employee' then 1 when 'department' then 2 else 3 end,a.effective_from desc,a.id`,
          [
            context.tenantId,
            query.company_id,
            query.employee_id,
            at.department_id,
            at.branch_id,
            query.on_date,
          ],
        );
        contenders = rows.rows.map((row) => this.allocationRow(row));
        if (!contenders.length)
          blockers.push("No employee, department or branch shift is assigned on this date.");
        else {
          const winner = contenders[0]!;
          const shift = await this.readShiftDetail(
            client,
            context,
            query.company_id,
            winner.shift_id,
            query.on_date,
          );
          if (query.on_date >= today && shift.status !== "active")
            blockers.push("The highest-priority assigned shift is inactive. Review its assignment.");
          if (shift.work_location_id && shift.work_location_id !== at.work_location_id)
            blockers.push(
              "The highest-priority shift does not match the employee’s effective work location.",
            );
          if (!shift.configured || !shift.resolved || !shift.resolved.configured)
            blockers.push("The assigned shift needs timezone, duration or rotation configuration.");
          if (!blockers.length) resolved = shift.resolved;
        }
      }
      return {
        company_id: query.company_id,
        on_date: query.on_date,
        employee: {
          id: employee.id,
          employee_number: employee.employee_number,
          display_name: employee.display_name,
        },
        operational_assignment_id: at?.id ?? null,
        contenders,
        winning_assignment_id: contenders[0]?.id ?? null,
        resolved_shift: resolved,
        blockers,
      };
    });
  }
  async createShiftAllocation(
    context: HrActorContext,
    input: CreateHrShiftAllocationRequest,
    key: string,
    corr: string,
  ): Promise<HrShiftAllocationResult> {
    return this.mutateShiftAllocation(context, input, key, corr);
  }
  async closeShiftAllocation(
    context: HrActorContext,
    id: string,
    input: CloseHrShiftAllocationRequest,
    key: string,
    corr: string,
  ): Promise<HrShiftAllocationResult> {
    return this.mutateShiftAllocation(context, input, key, corr, id);
  }
  private async allocationEvent(
    client: PoolClient,
    context: HrActorContext,
    after: HrShiftAllocationDetail,
    action: string,
    reason: string,
    before: HrShiftAllocationDetail | null,
    related: string | null,
  ): Promise<void> {
    const snapshot = (item: HrShiftAllocationDetail | null) =>
      item ? (({ history, ...rest }) => rest)(item) : null;
    await client.query(
      "insert into hr_shift_assignment_event (tenant_id,id,assignment_id,version,action,reason,related_assignment_id,before_snapshot,after_snapshot,actor_id) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)",
      [
        context.tenantId,
        `shift-allocation-event-${randomUUID()}`,
        after.id,
        after.version,
        action,
        reason,
        related,
        JSON.stringify(snapshot(before)),
        JSON.stringify(snapshot(after)),
        context.actor.userId,
      ],
    );
  }
  private async mutateShiftAllocation(
    context: HrActorContext,
    input: CreateHrShiftAllocationRequest | CloseHrShiftAllocationRequest,
    key: string,
    corr: string,
    id?: string,
  ): Promise<HrShiftAllocationResult> {
    if (!context.actor.permissions.includes("hr.attendance.shift.manage"))
      throw new HrApiError(403, "PERMISSION_DENIED", "Shift management permission is required.");
    if (!validIdempotencyKey(key))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await this.requireCompanyAccess(client, context, input.company_id);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:shifts:${context.tenantId}:${input.company_id}`,
      ]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:attendance:${context.tenantId}:${input.company_id}`,
      ]);
      const path = id ? `/api/v1/hr/shift_assignments/${id}/close` : "/api/v1/hr/shift_assignments",
        fingerprint = stateHash({ id, input });
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrShiftAllocationResult;
      }>(
        "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",
        [context.tenantId, context.actor.userId, path, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This request key was used for another shift allocation.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const today = (await client.query<{ today: string }>("select current_date::text as today")).rows[0]!
        .today;
      let before: HrShiftAllocationDetail | null = null,
        previous: HrShiftAllocationDetail | null = null,
        after: HrShiftAllocationDetail,
        reference: string;
      if (id) {
        const action = input as CloseHrShiftAllocationRequest;
        await client.query(
          "select id from hr_shift_assignment where tenant_id=$1 and company_id=$2 and id=$3 for update",
          [context.tenantId, input.company_id, id],
        );
        before = await this.readShiftAllocation(client, context, input.company_id, id);
        if (before.version !== action.expected_version)
          throw new HrApiError(
            409,
            "HR_SHIFT_ALLOCATION_STALE",
            "The allocation changed. Refresh before updating it.",
          );
        if (before.state === "cancelled" || before.state === "ended")
          throw new HrApiError(
            409,
            "HR_SHIFT_ALLOCATION_FINAL",
            "Historical and cancelled allocations cannot be rewritten.",
          );
        if (action.action === "cancel") {
          if (before.effective_from < today)
            throw new HrApiError(
              409,
              "HR_SHIFT_ALLOCATION_STARTED",
              "An allocation that started before today must be closed prospectively rather than cancelled.",
            );
          await client.query(
            "update hr_shift_assignment set cancelled_at=now(),cancelled_by=$3,cancellation_reason=$4,version=version+1 where tenant_id=$1 and id=$2",
            [context.tenantId, id, context.actor.userId, action.reason],
          );
        } else
          await client.query(
            "update hr_shift_assignment set effective_to=$3,version=version+1 where tenant_id=$1 and id=$2",
            [context.tenantId, id, action.effective_to],
          );
        after = await this.readShiftAllocation(client, context, input.company_id, id);
        reference = after.reference;
        await this.allocationEvent(client, context, after, action.action, action.reason, before, null);
      } else {
        const create = input as CreateHrShiftAllocationRequest;
        if (create.effective_from < today)
          throw new HrApiError(
            400,
            "HR_SHIFT_ALLOCATION_RETROACTIVE",
            "New shift allocations must begin today or later. Historical corrections require the attendance correction workflow.",
          );
        if(create.scope!=="employee")await client.query("select id from organization_unit where tenant_id=$1 and id=$2 for share",[context.tenantId,create.scope_id]);
        id = `shift-assignment-${randomUUID()}`;
        reference = `SAS-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
        if (create.replace_assignment_id) {
          await client.query(
            "select id from hr_shift_assignment where tenant_id=$1 and company_id=$2 and id=$3 for update",
            [context.tenantId, create.company_id, create.replace_assignment_id],
          );
          previous = await this.readShiftAllocation(
            client,
            context,
            create.company_id,
            create.replace_assignment_id,
          );
          if (previous.version !== create.expected_replace_version)
            throw new HrApiError(
              409,
              "HR_SHIFT_ALLOCATION_STALE",
              "The previous allocation changed. Refresh before replacing it.",
            );
          if (
            previous.scope !== create.scope ||
            previous.scope_id !== create.scope_id ||
            previous.state === "cancelled" ||
            previous.effective_from > create.effective_from ||
            (previous.effective_to && previous.effective_to < create.effective_from)
          )
            throw new HrApiError(
              409,
              "HR_SHIFT_ALLOCATION_REPLACEMENT_INVALID",
              "Replace only the same target’s allocation covering the new start date.",
            );
          if (previous.effective_from === create.effective_from)
            await client.query(
              "update hr_shift_assignment set cancelled_at=now(),cancelled_by=$3,cancellation_reason=$4,version=version+1 where tenant_id=$1 and id=$2",
              [context.tenantId, previous.id, context.actor.userId, create.reason],
            );
          else
            await client.query(
              "update hr_shift_assignment set effective_to=$3::date-1,version=version+1 where tenant_id=$1 and id=$2",
              [context.tenantId, previous.id, create.effective_from],
            );
        }
        await client.query(
          "insert into hr_shift_assignment (id,tenant_id,company_id,scope,scope_id,shift_id,effective_from,effective_to,note,created_by,reference,replaces_assignment_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            id,
            context.tenantId,
            create.company_id,
            create.scope,
            create.scope_id,
            create.shift_id,
            create.effective_from,
            create.effective_to,
            create.reason,
            context.actor.userId,
            reference,
            previous?.id ?? null,
          ],
        );
        after = await this.readShiftAllocation(client, context, input.company_id, id);
        if (previous) {
          const changed = await this.readShiftAllocation(client, context, input.company_id, previous.id);
          await this.allocationEvent(client, context, changed, "supersede", create.reason, previous, id);
        }
        await this.allocationEvent(
          client,
          context,
          after,
          "create",
          create.reason,
          null,
          previous?.id ?? null,
        );
      }
      const audit = await this.appendPlatformAudit(client, context, corr, "hr.shift.allocation", {
        entityId: id,
        entityType: "hr_shift_assignment",
        sourceReference: `hr:shift-assignment:${id}`,
        before: before ?? previous,
        after,
      });
      const output: HrShiftAllocationResult = {
        id,
        reference,
        version: after.version,
        state: after.state,
        replaced_assignment_id: previous?.id ?? null,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        "insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,$6,$7,$8)",
        [
          context.tenantId,
          context.actor.userId,
          path,
          key,
          fingerprint,
          "scope" in input ? 201 : 200,
          output,
          stateHash(output),
        ],
      );
      await client.query("commit");
      return output;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = (error as { code?: string }).code,
        message = (error as { message?: string }).message ?? "";
      if (code === "23P01" || code === "23505")
        throw new HrApiError(
          409,
          "HR_SHIFT_ALLOCATION_OVERLAP",
          "An allocation already covers this target and date range. Explicitly replace it or choose a non-overlapping interval.",
        );
      if (code === "23503")
        throw new HrApiError(
          409,
          "HR_SHIFT_ALLOCATION_REFERENCE_INVALID",
          "The selected shift or target is unavailable in this company.",
        );
      if (code === "23514") {
        if (message.includes("locked attendance"))
          throw new HrApiError(
            409,
            "HR_SHIFT_ALLOCATION_PERIOD_LOCKED",
            "The change affects a locked attendance period. Reopen it through the governed period workflow first.",
          );
        if (message.includes("employment"))
          throw new HrApiError(
            409,
            "HR_SHIFT_ALLOCATION_EMPLOYMENT_REQUIRED",
            "Approved employment must cover the entire allocation interval.",
          );
        if (message.includes("work location") || message.includes("company-wide"))
          throw new HrApiError(
            409,
            "HR_SHIFT_ALLOCATION_LOCATION_MISMATCH",
            "Use a company-wide shift for branch/department defaults, or match an employee shift to their effective work location.",
          );
        throw new HrApiError(
          409,
          "HR_SHIFT_ALLOCATION_PROTECTED",
          "The interval, target or shift is unavailable for this change. Review scope, active shift configuration and dates.",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private correctionSelect():string{return `select c.id,c.reference,c.company_id,c.employee_id,e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as display_name,c.work_date::text,c.kind,
    to_char(c.stated_in at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as stated_in,to_char(c.stated_out at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as stated_out,
    c.reason,c.status,c.version,c.workflow_managed,c.requested_by,coalesce(u.display_name,c.requested_by) as requested_by_name,c.submitted_by,c.manager_user_id,mu.display_name as manager_name,c.manager_decided_by,c.hr_decided_by,c.decision_comment,c.review_source_hash,c.subject_user_ids,c.created_at::text,c.updated_at::text
    from hr_attendance_correction c join employee e on e.tenant_id=c.tenant_id and e.id=c.employee_id left join security_user_account u on u.tenant_id=c.tenant_id and u.id=c.requested_by left join security_user_account mu on mu.tenant_id=c.tenant_id and mu.id=c.manager_user_id`;}
  async listCorrections(context:HrActorContext,query:HrCorrectionQuery):Promise<HrCorrectionDirectory>{
    return this.read(context,"hr.attendance.correction.read",async client=>{await this.requireCompanyAccess(client,context,query.company_id);
      const values:unknown[]=[context.tenantId,query.company_id,query.search?`%${query.search.replace(/[\\%_]/g,"\\$&")}%`:null,query.status??null];
      const where=`c.tenant_id=$1 and c.company_id=$2 and ($3::text is null or c.reference ilike $3 escape '\\' or e.employee_number ilike $3 escape '\\' or concat_ws(' ',e.first_name,e.middle_name,e.last_name) ilike $3 escape '\\') and ($4::text is null or c.status=$4)`;
      const total=(await client.query<{total:number}>(`select count(*)::int as total from hr_attendance_correction c join employee e on e.tenant_id=c.tenant_id and e.id=c.employee_id where ${where}`,values)).rows[0]!.total;
      const rows=await client.query<HrCorrectionSummary>(`${this.correctionSelect()} where ${where} order by c.created_at desc,c.id limit $5 offset $6`,[...values,query.limit,query.offset]);return {items:rows.rows,total};});
  }
  private async correctionEvidence(client:PoolClient,context:HrActorContext,companyId:string,employeeId:string,onDate:string,excludeId?:string):Promise<HrCorrectionEvidence>{
    const placements=await client.query<{id:string;reporting_manager_id:string|null}>(`select ea.id,ea.reporting_manager_id from employee_assignment ea left join hr_employment_relationship er on er.tenant_id=ea.tenant_id and er.id=ea.employment_relationship_id where ea.tenant_id=$1 and ea.company_id=$2 and ea.employee_id=$3 and ea.effective_from<=$4::date and (ea.effective_to is null or ea.effective_to>=$4::date) and ${this.operationalShiftEligibility("$4")}`,[context.tenantId,companyId,employeeId,onDate]);
    if(placements.rows.length!==1)throw new HrApiError(409,"HR_CORRECTION_PLACEMENT_REQUIRED","Exactly one approved operational placement must cover the working date.");
    const placement=placements.rows[0]!;
    const meta=(await client.query<{today:string;now:Date;locked:boolean;approved:boolean}>(`select current_date::text as today,now() as now,exists(select 1 from hr_attendance_period where tenant_id=$1 and company_id=$2 and month=date_trunc('month',$3::date)::date and state='locked') as locked,exists(select 1 from hr_attendance_correction where tenant_id=$1 and company_id=$2 and employee_id=$4 and work_date=$3::date and status='approved' and ($5::text is null or id<>$5)) as approved`,[context.tenantId,companyId,onDate,employeeId,excludeId??null])).rows[0]!;
    const row=(await this.readAttendanceDays(client,context,companyId,[onDate],[employeeId],meta.now,meta.today,true))[0]?.row;
    if(!row)throw new HrApiError(409,"HR_CORRECTION_EMPLOYEE_UNAVAILABLE","The employee is unavailable for attendance on this date.");
    const managers=await client.query<{user_id:string;display_name:string}>(`select b.user_id,u.display_name from employee_user_binding b join security_user_account u on u.tenant_id=b.tenant_id and u.id=b.user_id and u.status='active' join security_user_company_access a on a.tenant_id=b.tenant_id and a.user_id=b.user_id and a.company_id=$3 and a.revoked_at is null where b.tenant_id=$1 and b.employee_id=$2 and b.effective_from<=current_date and (b.effective_to is null or b.effective_to>=current_date)`,[context.tenantId,placement.reporting_manager_id,companyId]);
    const subjects=await client.query<{user_id:string}>(`select distinct user_id from employee_user_binding where tenant_id=$1 and employee_id=$2 and ((effective_from<=$3::date and (effective_to is null or effective_to>=$3::date)) or (effective_from<=current_date and (effective_to is null or effective_to>=current_date))) order by user_id`,[context.tenantId,employeeId,onDate]);
    const blockers:string[]=[];
    if(!row.scheduled_start||!row.scheduled_end||!row.time_zone)blockers.push("A configured effective shift is required before correcting this day.");
    for(const issue of row.issues)if(/placement|location|inactive|currently operational|configuration|timezone/.test(issue))blockers.push(issue);
    const localToday=row.time_zone?new Intl.DateTimeFormat('en-CA',{timeZone:row.time_zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(meta.now):meta.today;
    if(onDate>localToday)blockers.push("Future working dates cannot be corrected.");
    if(meta.locked)blockers.push("The attendance period is locked.");
    if(meta.approved)blockers.push("An approved correction already exists for this employee and date.");
    const evidence={on_date:onDate,employee_id:employeeId,assignment_id:placement.id,manager_employee_id:placement.reporting_manager_id,manager_user_id:managers.rows.length===1?managers.rows[0]!.user_id:null,manager_name:managers.rows.length===1?managers.rows[0]!.display_name:null,subject_user_ids:subjects.rows.map(s=>s.user_id),period_locked:meta.locked,today:localToday,day:row,blockers};
    return {hash:stateHash(evidence),...evidence};
  }
  private publicCorrectionEvidence(context:HrActorContext,evidence:HrCorrectionEvidence):HrCorrectionEvidence{return context.actor.permissions.includes("hr.attendance.punch.read")?evidence:{...evidence,day:{...evidence.day,punches:null}};}
  async getCorrectionContext(context:HrActorContext,query:HrCorrectionContextQuery):Promise<HrCorrectionContext>{
    return this.read(context,"hr.attendance.correction.read",async client=>{await this.requireCompanyAccess(client,context,query.company_id);
      const selected=await this.selectAttendanceEmployees(client,context,query.company_id,query.on_date,query.on_date,query.search,100,0);
      const employees=await client.query<{id:string;code:string;name:string}>("select id,employee_number as code,concat_ws(' ',first_name,middle_name,last_name) as name from employee where tenant_id=$1 and id=any($2::text[]) order by employee_number,id",[context.tenantId,selected.ids]);
      const today=(await client.query<{today:string}>("select current_date::text as today")).rows[0]!.today;
      const evidence=query.employee_id?await this.correctionEvidence(client,context,query.company_id,query.employee_id,query.on_date):null;
      return {today,employees:employees.rows,employees_capped:selected.total>100,evidence:evidence?this.publicCorrectionEvidence(context,evidence):null};});
  }
  private correctionAccess(context:HrActorContext,row:HrCorrectionSummary,evidence:HrCorrectionEvidence|null,locked:boolean){
    const actor=context.actor,permissions=actor.permissions,owner=row.requested_by===actor.userId;
    const makers=[row.requested_by,row.submitted_by??"",...row.subject_user_ids,...(evidence?.subject_user_ids??[])];
    const managerStage=row.status==="pending_manager",hrStage=row.status==="pending_hr";
    const decisionMakers=hrStage?[...makers,row.manager_decided_by??""]:makers;
    const self=decisionMakers.includes(actor.userId),override=actor.roles.includes("super_administrator")&&permissions.includes("platform.approval.override");
    const actions:HrCorrectionActionRequest["action"][]=[];
    if(row.workflow_managed&&!locked){
      if(owner&&["draft","pending_manager","pending_hr"].includes(row.status)&&permissions.includes("hr.attendance.correction.cancel"))actions.push("cancel");
      if(owner&&row.status==="draft"&&permissions.includes("hr.attendance.correction.submit")&&evidence&&!evidence.blockers.length&&evidence.manager_user_id)actions.push("submit");
      for(const decision of ["approve","reject"] as const){
        const action=managerStage?`manager_${decision}` as const:`hr_${decision}` as const;
        if(!managerStage&&!hrStage)continue;
        if(managerStage&&row.manager_user_id!==actor.userId)continue;
        const policy=evaluateApprovalActor({account:actor,normalDecisionPermission:`hr.attendance.correction.${action}`,makerActorIds:decisionMakers,impersonated:Boolean(context.impersonationRequestId||(context.realActorId&&context.realActorId!==actor.userId))});
        if(policy.kind==="forbidden")continue;
        if(decision==="approve"&&(!evidence||evidence.blockers.length||evidence.manager_user_id!==row.manager_user_id||evidence.manager_employee_id===null))continue;
        actions.push(action);
      }
    }
    return {allowed_actions:actions,can_edit:row.workflow_managed&&!locked&&owner&&row.status==="draft"&&permissions.includes("hr.attendance.correction.create"),self_decision_requires_override:(managerStage||hrStage)&&self,override_allowed:override};
  }
  async getCorrection(context:HrActorContext,companyId:string,id:string):Promise<HrCorrectionDetail>{return this.read(context,"hr.attendance.correction.read",async client=>{await this.requireCompanyAccess(client,context,companyId);return this.readCorrection(client,context,companyId,id);});}
  private async readCorrection(client:PoolClient,context:HrActorContext,companyId:string,id:string):Promise<HrCorrectionDetail>{
    const row=(await client.query<HrCorrectionSummary>(`${this.correctionSelect()} where c.tenant_id=$1 and c.company_id=$2 and c.id=$3`,[context.tenantId,companyId,id])).rows[0];if(!row)throw new HrApiError(404,"HR_CORRECTION_NOT_FOUND","The correction is unavailable in your company scope.");
    let evidence:HrCorrectionEvidence|null=null,unavailable:string|null=null;
    try{evidence=await this.correctionEvidence(client,context,companyId,row.employee_id,row.work_date,id);}catch(error){if(error instanceof HrApiError&&error.status===409)unavailable=error.message;else throw error;}
    const locked=(await client.query<{locked:boolean}>("select exists(select 1 from hr_attendance_period where tenant_id=$1 and company_id=$2 and month=date_trunc('month',$3::date)::date and state='locked') as locked",[context.tenantId,companyId,row.work_date])).rows[0]!.locked;
    const history=await client.query<HrCorrectionDetail["history"][number]>(`select ev.id,ev.action,ev.version,ev.reason,coalesce(u.display_name,ev.actor_id) as actor_name,ev.source_hash,ev.override_event_id,ev.occurred_at::text from hr_attendance_correction_event ev left join security_user_account u on u.tenant_id=ev.tenant_id and u.id=ev.actor_id where ev.tenant_id=$1 and ev.correction_id=$2 order by ev.version desc limit 50`,[context.tenantId,id]);
    return {...row,evidence:evidence?this.publicCorrectionEvidence(context,evidence):null,evidence_unavailable:unavailable,evidence_changed:["pending_manager","pending_hr"].includes(row.status)&&evidence!==null&&row.review_source_hash!==evidence.hash,...this.correctionAccess(context,row,evidence,locked),history:history.rows};
  }
  async createCorrection(context:HrActorContext,input:CreateHrCorrectionRequest,key:string,corr:string):Promise<HrCorrectionResult>{return this.mutateCorrection(context,input,key,corr);}
  async updateCorrection(context:HrActorContext,id:string,input:UpdateHrCorrectionRequest,key:string,corr:string):Promise<HrCorrectionResult>{return this.mutateCorrection(context,input,key,corr,id);}
  async actOnCorrection(context:HrActorContext,id:string,input:HrCorrectionActionRequest,key:string,corr:string):Promise<HrCorrectionResult>{return this.mutateCorrection(context,input,key,corr,id);}
  private async validateCorrectionCandidate(client:PoolClient,context:HrActorContext,companyId:string,terms:{kind:string;stated_in:string|null;stated_out:string|null},evidence:HrCorrectionEvidence):Promise<void>{
    const day=evidence.day;
    const shift=(await client.query<HrShiftSummary>(`select ${this.shiftColumns()} ${this.shiftJoins()} where s.tenant_id=$1 and s.company_id=$2 and s.id=$3`,[context.tenantId,companyId,day.shift_id])).rows[0];
    if(!shift||!day.scheduled_start||!day.scheduled_end)throw new HrApiError(409,"HR_CORRECTION_SHIFT_REQUIRED","Review the effective shift before submitting a correction.");
    const meta=(await client.query<{now:Date;today:string}>("select now() as now,current_date::text as today")).rows[0]!;
    const leaveAllocations=(await client.query<{days:string;portion:string}>(`select ld.days::text,ld.portion from hr_leave_request_day ld join hr_leave_request r on r.tenant_id=ld.tenant_id and r.id=ld.request_id and r.status='approved' where ld.tenant_id=$1 and ld.company_id=$2 and ld.employee_id=$3 and ld.leave_date=$4::date order by ld.request_id`,[context.tenantId,companyId,day.employee_id,evidence.on_date])).rows;
    const source:AttendanceSource={employee_id:day.employee_id,employee_number:day.employee_number,display_name:day.display_name,department:day.department,placement_count:1,work_location_id:shift.work_location_id,employee_status:"active",root_shift_id:shift.id,allocation_scope:day.allocation_scope,punches:day.punches??[],corrections:[{kind:terms.kind,stated_in:terms.stated_in,stated_out:terms.stated_out}],leaves:leaveAllocations.length?leaveAllocations:Number(day.leave_days)>0?[{days:day.leave_days}]:[],holidays:day.status==="holiday"?[{name:"Effective calendar holiday",optional:false}]:[],approved_overtime_minutes:day.approved_overtime_minutes};
    const result=evaluateDailyAttendance(source,shift,shift,{start:day.scheduled_start,end:day.scheduled_end,weekday:new Date(evidence.on_date+"T00:00:00Z").getUTCDay(),unpaid_minutes:shift.end_minute-shift.start_minute-shift.net_minutes},evidence.on_date,meta.today,meta.now,true);
    if(result.issues.length)throw new HrApiError(409,"HR_CORRECTION_NOT_RESOLVED",`The proposed correction still needs review: ${result.issues.join(" ")}`);
  }

  private async validateCorrectionTerms(client:PoolClient,input:{stated_in:string|null;stated_out:string|null},evidence:HrCorrectionEvidence,checkLocalOffset=true):Promise<void>{
    for(const value of [input.stated_in,input.stated_out]){
      if(!value)continue;
      const instant=Date.parse(value),start=Date.parse(evidence.day.scheduled_start??""),end=Date.parse(evidence.day.scheduled_end??"");
      if(!Number.isFinite(start)||!Number.isFinite(end)||instant<start-43200000||instant>end+43200000)throw new HrApiError(400,"HR_CORRECTION_TIME_OUTSIDE_SHIFT","Use a timestamp within 12 hours of the effective shift window, including the following date for overnight work.");
      const valid=(await client.query<{past:boolean;local:string}>(`select $1::timestamptz<=now() as past,to_char($1::timestamptz at time zone $2,'YYYY-MM-DD"T"HH24:MI') as local`,[value,evidence.day.time_zone])).rows[0]!;
      if(!valid.past)throw new HrApiError(400,"HR_CORRECTION_FUTURE_TIMESTAMP","Stated punch timestamps cannot be in the future.");
      if(checkLocalOffset&&valid.local!==value.slice(0,16))throw new HrApiError(400,"HR_CORRECTION_TIMEZONE_MISMATCH","The supplied UTC offset does not match the shift timezone at that local time.");
    }
  }
  private async mutateCorrection(context:HrActorContext,input:CreateHrCorrectionRequest|UpdateHrCorrectionRequest|HrCorrectionActionRequest,key:string,corr:string,id?:string):Promise<HrCorrectionResult>{
    const action="action" in input?input.action:id?"update":"create",permission=action==="update"?"create":action;
    if(!context.actor.permissions.includes("hr.attendance.correction.read")||!context.actor.permissions.includes(`hr.attendance.correction.${permission}`))throw new HrApiError(403,"PERMISSION_DENIED","Correction read and action permissions are required.");
    if(!validIdempotencyKey(key))throw new HrApiError(400,"INVALID_IDEMPOTENCY_KEY","The idempotency key is invalid.");
    const client=await this.pool.connect();
    try{
      await client.query("begin");await client.query("select set_config('nexora.tenant_id',$1,true)",[context.tenantId]);await this.requireCompanyAccess(client,context,input.company_id);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`nexora:hr:attendance:${context.tenantId}:${input.company_id}`]);
      const path=id?`/api/v1/hr/attendance_corrections/${id}/${action==="update"?"draft":"actions"}`:"/api/v1/hr/attendance_corrections",fingerprint=stateHash(input);
      const replay=(await client.query<{request_fingerprint:string;response_body:HrCorrectionResult}>("select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",[context.tenantId,context.actor.userId,path,key])).rows[0];
      if(replay){if(replay.request_fingerprint!==fingerprint)throw new HrApiError(409,"IDEMPOTENCY_CONFLICT","This key was used for a different correction request.");await client.query("commit");return {...replay.response_body,replayed:true};}
      let before:HrCorrectionDetail|null=null,evidence:HrCorrectionEvidence|null=null,overrideId:string|null=null;
      if(id){await client.query("select id from hr_attendance_correction where tenant_id=$1 and company_id=$2 and id=$3 for update",[context.tenantId,input.company_id,id]);before=await this.readCorrection(client,context,input.company_id,id);if(!("expected_version" in input)||before.version!==input.expected_version)throw new HrApiError(409,"HR_CORRECTION_STALE","This correction changed. Refresh before saving or deciding.");if(!before.workflow_managed)throw new HrApiError(409,"HR_CORRECTION_LEGACY_READ_ONLY","Legacy correction records are retained as read-only evidence.");
        if(action==="update"?!before.can_edit:!("action" in input)||!before.allowed_actions.includes(input.action))throw new HrApiError(403,"HR_CORRECTION_ACTION_FORBIDDEN","This action is unavailable for the request's state, owner, reporting route or locked attendance period.");
      }
      const employeeId=before?.employee_id??(input as CreateHrCorrectionRequest).employee_id,onDate=before?.work_date??(input as CreateHrCorrectionRequest).work_date;
      const needsEvidence=action==="create"||action==="update"||action==="submit"||action.endsWith("_approve");
      if(needsEvidence){evidence=await this.correctionEvidence(client,context,input.company_id,employeeId,onDate,id);if(evidence.blockers.length)throw new HrApiError(409,"HR_CORRECTION_EVIDENCE_BLOCKED",evidence.blockers.join(" "));if(input.expected_evidence_hash!==evidence.hash)throw new HrApiError(409,"HR_CORRECTION_EVIDENCE_STALE","Attendance evidence changed. Refresh it and review before continuing.");await this.validateCorrectionTerms(client,"kind" in input?input:before!,evidence,"kind" in input);if(action==="submit"||action.endsWith("_approve"))await this.validateCorrectionCandidate(client,context,input.company_id,"kind" in input?input:before!,evidence);}
      if(action==="create"){
        id=`attendance-correction-${randomUUID()}`;const terms=input as CreateHrCorrectionRequest;
        await client.query("insert into hr_attendance_correction (tenant_id,id,company_id,employee_id,work_date,kind,stated_in,stated_out,reason,requested_by,workflow_managed) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)",[context.tenantId,id,input.company_id,employeeId,onDate,terms.kind,terms.stated_in,terms.stated_out,terms.reason,context.actor.userId]);
      }else if(action==="update"){
        const terms=input as UpdateHrCorrectionRequest;await client.query("update hr_attendance_correction set kind=$3,stated_in=$4,stated_out=$5,reason=$6,version=version+1 where tenant_id=$1 and id=$2",[context.tenantId,id,terms.kind,terms.stated_in,terms.stated_out,terms.reason]);
      }else{
        const terms=input as HrCorrectionActionRequest;
        if(action==="submit"){
          if(!evidence?.manager_user_id)throw new HrApiError(409,"HR_CORRECTION_MANAGER_REQUIRED","The effective reporting manager needs an active employee/user binding and company access before submission.");
          const conflict=await client.query("select 1 from hr_attendance_correction where tenant_id=$1 and company_id=$2 and employee_id=$3 and work_date=$4 and id<>$5 and status in ('pending_manager','pending_hr','approved')",[context.tenantId,input.company_id,employeeId,onDate,id]);if(conflict.rowCount)throw new HrApiError(409,"HR_CORRECTION_CONFLICT","Another submitted or approved correction already covers this employee and date.");
          await client.query("update hr_attendance_correction set status='pending_manager',submitted_by=$3,manager_employee_id=$4,manager_user_id=$5,subject_user_ids=$6,review_source_hash=$7,version=version+1 where tenant_id=$1 and id=$2",[context.tenantId,id,context.actor.userId,evidence.manager_employee_id,evidence.manager_user_id,evidence.subject_user_ids,evidence.hash]);
        }else if(action==="cancel")await client.query("update hr_attendance_correction set status='cancelled',decision_comment=$3,version=version+1 where tenant_id=$1 and id=$2",[context.tenantId,id,terms.reason]);
        else{
          const manager=action.startsWith("manager_"),decision=action.endsWith("_approve")?"approve":"reject",makers=[before!.requested_by,before!.submitted_by??"",...before!.subject_user_ids,...(evidence?.subject_user_ids??[]),...(before!.evidence?.subject_user_ids??[]),...(manager?[]:[before!.manager_decided_by??""])];
          const policy=evaluateApprovalActor({account:context.actor,normalDecisionPermission:`hr.attendance.correction.${action}`,makerActorIds:makers,impersonated:Boolean(context.impersonationRequestId||(context.realActorId&&context.realActorId!==context.actor.userId))});
          if(policy.kind==="override"&&!terms.override_self_approval)throw new HrApiError(403,"HR_CORRECTION_EXPLICIT_OVERRIDE_REQUIRED","Explicitly confirm the super-administrator self-decision override and provide its reason.");
          overrideId=await this.resolveApprovalOverride(client,context,{normalDecisionPermission:`hr.attendance.correction.${action}`,makerActorIds:makers,resourceType:"hr_attendance_correction",resourceId:id!,decisionAction:decision,reason:terms.reason,correlationId:corr,idempotencyKey:key});
          const status=decision==="reject"?"rejected":manager?"pending_hr":"approved";
          await client.query(`update hr_attendance_correction set status=$3,${manager?"manager":"hr"}_decided_by=$4,${manager?"manager":"hr"}_decided_at=now(),${manager?"manager":"hr"}_override_event_id=$5,decision_comment=$6,review_source_hash=coalesce($7,review_source_hash),version=version+1 where tenant_id=$1 and id=$2`,[context.tenantId,id,status,context.actor.userId,overrideId,terms.reason,evidence?.hash??null]);
        }
      }
      const after=(await client.query<HrCorrectionSummary>(`${this.correctionSelect()} where c.tenant_id=$1 and c.id=$2`,[context.tenantId,id])).rows[0]!;
      const reason="action" in input?input.reason:input.reason;
      const snapshot=(row:HrCorrectionSummary|HrCorrectionDetail|null)=>row?{id:row.id,reference:row.reference,company_id:row.company_id,employee_id:row.employee_id,work_date:row.work_date,kind:row.kind,stated_in:row.stated_in,stated_out:row.stated_out,reason:row.reason,status:row.status,version:row.version,manager_user_id:row.manager_user_id,manager_decided_by:row.manager_decided_by,hr_decided_by:row.hr_decided_by,review_source_hash:row.review_source_hash}:null;
      await client.query("insert into hr_attendance_correction_event (tenant_id,id,correction_id,version,action,reason,before_snapshot,after_snapshot,source_snapshot,source_hash,actor_id,override_event_id) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12)",[context.tenantId,`correction-event-${randomUUID()}`,id,after.version,action,reason,JSON.stringify(snapshot(before)),JSON.stringify(snapshot(after)),evidence?JSON.stringify((({hash,...rest})=>rest)(evidence)):null,evidence?.hash??null,context.actor.userId,overrideId]);
      const audit=await this.appendPlatformAudit(client,context,corr,"hr.attendance.correction",{entityId:id!,entityType:"hr_attendance_correction",before:snapshot(before),after:snapshot(after),sourceReference:`hr:attendance-correction:${id}`});
      const result:HrCorrectionResult={id:id!,reference:after.reference,company_id:after.company_id,version:after.version,status:after.status,audit_event_id:audit,replayed:false};
      await client.query("insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,$6,$7,$8)",[context.tenantId,context.actor.userId,path,key,fingerprint,action==="create"?201:200,result,stateHash(result)]);await client.query("commit");return result;
    }catch(error){await client.query("rollback").catch(()=>undefined);if(error instanceof HrApiError)throw error;const code=(error as {code?:string}).code;if(["23505","23514","23P01"].includes(code??""))throw new HrApiError(409,"HR_CORRECTION_PROTECTED","The correction conflicts with an active request, protected history or a locked period. Refresh and review.");if(["22007","22008"].includes(code??""))throw new HrApiError(400,"HR_CORRECTION_INVALID_TIMESTAMP","Use valid timestamps with the correct UTC offset.");throw error;}finally{client.release();}
  }

  async listDailyAttendance(context:HrActorContext,query:HrDailyAttendanceQuery):Promise<HrDailyAttendanceDirectory>{
    return this.read(context,"hr.attendance.read",async client=>{
      await this.requireCompanyAccess(client,context,query.company_id);
      const selection=await this.selectAttendanceEmployees(client,context,query.company_id,query.on_date,query.on_date,query.search,query.limit,query.offset);
      const meta=(await client.query<{today:string;now:Date;period_state:string|null}>(`select current_date::text as today,now() as now,(select state from hr_attendance_period where tenant_id=$1 and company_id=$2 and month=date_trunc('month',$3::date)::date) as period_state`,[context.tenantId,query.company_id,query.on_date])).rows[0]!;
      const canRead=context.actor.permissions.includes("hr.attendance.punch.read");
      const days=await this.readAttendanceDays(client,context,query.company_id,[query.on_date],selection.ids,meta.now,meta.today,canRead);
      return {company_id:query.company_id,on_date:query.on_date,generated_at:meta.now.toISOString(),period_state:meta.period_state,total:selection.total,can_read_punches:canRead,items:days.map(d=>d.row)};
    });
  }
  async listMonthlyAttendance(context:HrActorContext,query:HrMonthlyAttendanceQuery):Promise<HrMonthlyAttendanceDirectory>{
    return this.read(context,"hr.attendance.read",async client=>{
      await this.requireCompanyAccess(client,context,query.company_id);
      const meta=(await client.query<{today:string;now:Date;through_date:string;period_state:string|null}>(`select current_date::text as today,now() as now,($3::date+interval '1 month - 1 day')::date::text as through_date,(select state from hr_attendance_period where tenant_id=$1 and company_id=$2 and month=$3::date) as period_state`,[context.tenantId,query.company_id,query.month])).rows[0]!;
      const selection=await this.selectAttendanceEmployees(client,context,query.company_id,query.month,meta.through_date,query.search,query.limit,query.offset);
      const dates:string[]=[];for(let date=Date.parse(query.month+"T00:00:00Z"),end=Date.parse(meta.through_date+"T00:00:00Z");date<=end;date+=86400000)dates.push(new Date(date).toISOString().slice(0,10));
      const days=await this.readAttendanceDays(client,context,query.company_id,dates,selection.ids,meta.now,meta.today,false);
      const items=summarizeAttendanceMonth(days),snapshotAccess=context.actor.permissions.includes("hr.attendance.payroll_input.read");
      if(snapshotAccess && meta.period_state==="locked"){
        const snapshots=await client.query<NonNullable<HrMonthlyAttendanceRow["finalized_input"]>&{employee_id:string}>(`select i.employee_id,i.calendar_days::text,i.paid_days::text,i.unpaid_days::text,i.present_days::text,i.absent_days::text,i.approved_leave_days::text,i.evidence_version,i.created_at::text from hr_payroll_input i join hr_attendance_period p on p.tenant_id=i.tenant_id and p.id=i.period_id and p.company_id=i.company_id where i.tenant_id=$1 and i.company_id=$2 and p.month=$3::date and p.state='locked' and i.employee_id=any($4::text[])`,[context.tenantId,query.company_id,query.month,selection.ids]);
        const byId=new Map(snapshots.rows.map(({employee_id,...snapshot})=>[employee_id,snapshot]));for(const item of items)item.finalized_input=byId.get(item.employee_id)??null;
      }
      const byId=new Map(items.map(item=>[item.employee_id,item]));
      return {company_id:query.company_id,month:query.month,through_date:meta.through_date,generated_at:meta.now.toISOString(),period_state:meta.period_state,snapshot_access:snapshotAccess,total:selection.total,items:selection.ids.flatMap(id=>byId.get(id)?[byId.get(id)!]:[])};
    });
  }
  private async selectAttendanceEmployees(client:PoolClient,context:HrActorContext,companyId:string,from:string,to:string,search:string|undefined,limit:number,offset:number):Promise<{ids:string[];total:number}>{
    const values:unknown[]=[context.tenantId,companyId,from,to,search?`%${search.replace(/[\\%_]/g,"\\$&")}%`:null];
    // Past approved placements stay visible after separation; drafts never become an operational roster.
    const eligible=`((ea.assignment_status='legacy_compatibility' or (ea.assignment_status='ended' and ea.employment_relationship_id is null)) or (ea.assignment_status in ('active','ended') and er.approval_state='approved' and (er.status='active' or greatest(ea.effective_from,$3::date)<current_date)))`;
    const where=`from employee e where e.tenant_id=$1 and ($5::text is null or concat_ws(' ',e.first_name,e.middle_name,e.last_name) ilike $5 escape '\\' or e.employee_number ilike $5 escape '\\') and exists(select 1 from employee_assignment ea left join hr_employment_relationship er on er.tenant_id=ea.tenant_id and er.id=ea.employment_relationship_id where ea.tenant_id=e.tenant_id and ea.employee_id=e.id and ea.company_id=$2 and ea.effective_from<=$4::date and (ea.effective_to is null or ea.effective_to>=$3::date) and ${eligible})`;
    const total=(await client.query<{total:number}>(`select count(*)::int as total ${where}`,values)).rows[0]!.total;
    const employees=await client.query<{id:string}>(`select e.id ${where} order by e.employee_number collate "C",e.id collate "C" limit $6 offset $7`,[...values,limit,offset]);
    return {total,ids:employees.rows.map(e=>e.id)};
  }

  private async readAttendanceDays(client:PoolClient,context:HrActorContext,companyId:string,dates:string[],employeeIds:string[],now:Date,today:string,canReadPunches:boolean):Promise<{on_date:string;row:HrDailyAttendanceRow}[]>{
      const sources=await client.query<AttendanceSource & {on_date:string}>(`with roster as (
        select d.on_date::text as on_date,e.id as employee_id,e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as display_name,e.status as employee_status,
          (array_agg(ea.department_id order by ea.effective_from desc,ea.id))[1] as department_id,
          (array_agg(ea.branch_id order by ea.effective_from desc,ea.id))[1] as branch_id,
          (array_agg(ea.work_location_id order by ea.effective_from desc,ea.id))[1] as work_location_id,count(*)::int as placement_count
        from employee e join employee_assignment ea on ea.tenant_id=e.tenant_id and ea.employee_id=e.id
        left join hr_employment_relationship er on er.tenant_id=ea.tenant_id and er.id=ea.employment_relationship_id
        cross join unnest($3::date[]) d(on_date)
        where e.tenant_id=$1 and ea.company_id=$2 and e.id=any($4::text[]) and ea.effective_from<=d.on_date and (ea.effective_to is null or ea.effective_to>=d.on_date)
        and ${this.operationalShiftEligibility("d.on_date")}  group by e.tenant_id,e.id,d.on_date)
        select r.*,d.name as department,a.shift_id as root_shift_id,a.scope as allocation_scope,
        coalesce(p.punches,'[]'::jsonb) as punches,coalesce(c.corrections,'[]'::jsonb) as corrections,
        coalesce(l.leaves,'[]'::jsonb) as leaves,coalesce(h.holidays,'[]'::jsonb) as holidays,
        coalesce(o.minutes,0)::int as approved_overtime_minutes
        from roster r left join organization_unit d on d.tenant_id=$1 and d.id=r.department_id
        left join lateral (select shift_id,scope from hr_shift_assignment a where a.tenant_id=$1 and a.company_id=$2 and a.cancelled_at is null
          and a.effective_from<=r.on_date::date and (a.effective_to is null or a.effective_to>=r.on_date::date)
          and ((a.scope='employee' and a.scope_id=r.employee_id) or (a.scope='department' and a.scope_id=r.department_id) or (a.scope='branch' and a.scope_id=r.branch_id))
          order by case a.scope when 'employee' then 1 when 'department' then 2 else 3 end,a.effective_from desc,a.id limit 1) a on true
        left join lateral (select jsonb_agg(jsonb_build_object('direction',x.direction,'occurred_at',x.occurred_at,'source',x.source) order by x.occurred_at,x.id) as punches
          from (select id,direction,occurred_at,source from hr_attendance_punch where tenant_id=$1 and company_id=$2 and employee_id=r.employee_id and work_date=r.on_date::date order by occurred_at,id limit 129) x) p on true
        left join lateral (select jsonb_agg(jsonb_build_object('kind',kind,'stated_in',stated_in,'stated_out',stated_out)) as corrections
          from hr_attendance_correction where tenant_id=$1 and company_id=$2 and employee_id=r.employee_id and work_date=r.on_date::date and status='approved') c on true
        left join lateral (select jsonb_agg(jsonb_build_object('days',ld.days::text,'portion',ld.portion)) as leaves from hr_leave_request lr
          left join hr_leave_request_day ld on ld.tenant_id=lr.tenant_id and ld.company_id=lr.company_id and ld.request_id=lr.id and ld.employee_id=lr.employee_id and ld.leave_date=r.on_date::date
          where lr.tenant_id=$1 and lr.company_id=$2 and lr.employee_id=r.employee_id and lr.status='approved' and lr.from_date<=r.on_date::date and lr.to_date>=r.on_date::date
          and (ld.id is not null or not exists(select 1 from hr_leave_request_day any_day where any_day.tenant_id=lr.tenant_id and any_day.request_id=lr.id))) l on true
        left join lateral (select jsonb_agg(jsonb_build_object('name',name,'optional',optional)) as holidays from hr_holiday where tenant_id=$1 and company_id=$2 and holiday_date=r.on_date::date and status='active' and (branch_id is null or branch_id=r.branch_id)) h on true
        left join lateral (select sum(approved_minutes) as minutes from hr_overtime_request where tenant_id=$1 and company_id=$2 and employee_id=r.employee_id and work_date=r.on_date::date and status='approved') o on true
        order by r.employee_number,r.employee_id`,[context.tenantId,companyId,dates,employeeIds]);
      const rootIds=[...new Set(sources.rows.flatMap(r=>r.root_shift_id?[r.root_shift_id]:[]))];
      const rotations=await client.query<{shift_id:string;rotation_shift_id:string}>("select r.shift_id,r.rotation_shift_id from hr_shift_rotation r join hr_shift s on s.tenant_id=r.tenant_id and s.id=r.shift_id where r.tenant_id=$1 and s.company_id=$2 and r.shift_id=any($3::text[]) order by r.shift_id,r.position",[context.tenantId,companyId,rootIds]);
      const ids=[...new Set([...rootIds,...rotations.rows.map(r=>r.rotation_shift_id)])];
      const shifts=await client.query<HrShiftSummary>(`select ${this.shiftColumns()} ${this.shiftJoins()} where s.tenant_id=$1 and s.company_id=$2 and s.id=any($3::text[])`,[context.tenantId,companyId,ids]);
      const byId=new Map(shifts.rows.map(s=>[s.id,s]));
      const resolvedDays=sources.rows.map(source=>{const root=byId.get(source.root_shift_id??"")??null;const members=rotations.rows.filter(r=>r.shift_id===root?.id).flatMap(r=>byId.get(r.rotation_shift_id)?[byId.get(r.rotation_shift_id)!]:[]);return {source,root,resolved:root?resolveHrShiftOnDate(root,members,source.on_date):null};});
      const pairs=[...new Map(resolvedDays.flatMap(d=>d.resolved?[{id:d.resolved.id,on_date:d.source.on_date}]:[]).map(pair=>[pair.id+":"+pair.on_date,pair])).values()];
      const windows=await client.query<{id:string;on_date:string;start:Date;end:Date;weekday:number;unpaid_minutes:number}>(`select s.id,d.on_date::text,
        ((d.on_date+s.start_minute*interval '1 minute') at time zone s.time_zone) as start,
        ((d.on_date+s.end_minute*interval '1 minute') at time zone s.time_zone) as end,
        extract(dow from d.on_date)::int as weekday,
        coalesce((select sum(minutes) from hr_shift_break b where b.tenant_id=s.tenant_id and b.shift_id=s.id and not b.paid),0)::int as unpaid_minutes
        from jsonb_to_recordset($3::jsonb) as d(id text,on_date date) join hr_shift s on s.tenant_id=$1 and s.company_id=$2 and s.id=d.id where s.time_zone is not null and s.required_work_minutes is not null`,[context.tenantId,companyId,JSON.stringify(pairs)]);
      const windowById=new Map(windows.rows.map(w=>[w.id+":"+w.on_date,{start:w.start.toISOString(),end:w.end.toISOString(),weekday:w.weekday,unpaid_minutes:w.unpaid_minutes}]));
      return resolvedDays.map(({source,root,resolved})=>({on_date:source.on_date,row:evaluateDailyAttendance(source,root,resolved,resolved?windowById.get(resolved.id+":"+source.on_date)??null:null,source.on_date,today,now,canReadPunches)}));
  }

  async getShiftContext(
    context: HrActorContext,
    query: { company_id: string; search?: string | undefined },
  ): Promise<HrShiftContext> {
    return this.read(context, "hr.attendance.shift.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const result = await client.query<HrShiftContext["locations"][number]>(
        "select id,code,name from hr_master_record where tenant_id=$1 and company_id=$2 and master_type='work_location' and status='active' and ($3::text is null or name ilike $3 or code ilike $3) order by name,id limit 101",
        [context.tenantId, query.company_id, query.search ? `%${query.search}%` : null],
      );
      return {
        locations: result.rows.slice(0, 100),
        locations_capped: result.rows.length > 100,
        time_zones: ["UTC", ...Intl.supportedValuesOf("timeZone")],
      };
    });
  }
  private shiftColumns(): string {
    return `s.id,s.company_id,s.code,s.name,s.kind,s.status,s.version,s.time_zone,s.work_location_id,loc.name as work_location,s.start_minute,s.end_minute,s.required_work_minutes,
    (s.end_minute-s.start_minute-coalesce((select sum(b.minutes) from hr_shift_break b where b.tenant_id=s.tenant_id and b.shift_id=s.id and not b.paid),0))::int as net_minutes,
    s.grace_in_minutes,s.grace_out_minutes,s.minimum_present_minutes,s.half_day_minutes,s.overtime_after_minutes,s.weekly_off_days,s.rotation_anchor_date::text,
    (s.time_zone is not null and s.required_work_minutes is not null and (s.kind<>'rotating' or s.rotation_anchor_date is not null)) as configured,
    (exists(select 1 from hr_shift_assignment a where a.tenant_id=s.tenant_id and a.shift_id=s.id) or exists(select 1 from hr_shift_rotation r where r.tenant_id=s.tenant_id and r.rotation_shift_id=s.id)) as rules_locked`;
  }
  private shiftJoins(): string {
    return `from hr_shift s left join hr_master_record loc on loc.tenant_id=s.tenant_id and loc.id=s.work_location_id`;
  }
  async listShifts(context: HrActorContext, query: HrShiftQuery): Promise<HrShiftDirectory> {
    return this.read(context, "hr.attendance.shift.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id],
        filters = ["s.tenant_id=$1", "s.company_id=$2"];
      if (query.status) {
        values.push(query.status);
        filters.push(`s.status=$${values.length}`);
      }
      if (query.search) {
        values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(s.code ilike $${values.length} escape '\\' or s.name ilike $${values.length} escape '\\')`,
        );
      }
      if (query.leaf_only) filters.push("s.kind<>'rotating'");
      const total = await client.query<{ total: number }>(
        `select count(*)::int as total from hr_shift s where ${filters.join(" and ")}`,
        values,
      );
      values.push(query.limit, query.offset);
      const rows = await client.query<HrShiftSummary>(
        `select ${this.shiftColumns()} ${this.shiftJoins()} where ${filters.join(" and ")} order by s.code,s.id limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      return { items: rows.rows, total: total.rows[0]!.total };
    });
  }
  async getShift(
    context: HrActorContext,
    companyId: string,
    id: string,
    onDate?: string,
  ): Promise<HrShiftDetail> {
    return this.read(context, "hr.attendance.shift.read", async (client) => {
      await this.requireCompanyAccess(client, context, companyId);
      return this.readShiftDetail(client, context, companyId, id, onDate);
    });
  }
  private async readShiftDetail(
    client: PoolClient,
    context: HrActorContext,
    companyId: string,
    id: string,
    onDate?: string,
  ): Promise<HrShiftDetail> {
    const rows = await client.query<HrShiftSummary>(
      `select ${this.shiftColumns()} ${this.shiftJoins()} where s.tenant_id=$1 and s.company_id=$2 and s.id=$3`,
      [context.tenantId, companyId, id],
    );
    const row = rows.rows[0];
    if (!row)
      throw new HrApiError(404, "HR_SHIFT_NOT_FOUND", "The shift is unavailable in your company scope.");
    const breaks = await client.query<HrShiftDetail["breaks"][number]>(
      "select label,minutes,paid from hr_shift_break where tenant_id=$1 and shift_id=$2 order by position",
      [context.tenantId, id],
    );
    const members = await client.query<HrShiftSummary & { position: number }>(
      `select r.position,${this.shiftColumns()} from hr_shift_rotation r join hr_shift s on s.tenant_id=r.tenant_id and s.id=r.rotation_shift_id left join hr_master_record loc on loc.tenant_id=s.tenant_id and loc.id=s.work_location_id where r.tenant_id=$1 and r.shift_id=$2 and s.company_id=$3 order by r.position`,
      [context.tenantId, id, companyId],
    );
    const rotation = members.rows.map(({ position, ...shift }) => ({ position, shift }));
    const today =
      onDate ?? (await client.query<{ today: string }>("select current_date::text as today")).rows[0]!.today;
    const resolved = resolveHrShiftOnDate(row, rotation.map(r => r.shift), today);
    const history = await client.query<HrShiftDetail["history"][number] & { occurred_at: Date }>(
      `select e.id,e.action,e.version,e.reason,coalesce(u.display_name,u.email,e.actor_id) as actor_name,e.occurred_at from hr_shift_rule_event e left join security_user_account u on u.tenant_id=e.tenant_id and u.id=e.actor_id where e.tenant_id=$1 and e.shift_id=$2 order by e.version desc limit 50`,
      [context.tenantId, id],
    );
    return {
      ...row,
      breaks: breaks.rows,
      rotation,
      preview_date: today,
      resolved,
      history: history.rows.map((e) => ({ ...e, occurred_at: e.occurred_at.toISOString() })),
    };
  }
  async createShift(
    context: HrActorContext,
    input: CreateHrShiftRequest,
    key: string,
    corr: string,
  ): Promise<HrShiftResult> {
    return this.mutateShift(context, input, key, corr);
  }
  async updateShift(
    context: HrActorContext,
    id: string,
    input: UpdateHrShiftRequest,
    key: string,
    corr: string,
  ): Promise<HrShiftResult> {
    return this.mutateShift(context, input, key, corr, id);
  }
  async changeShiftStatus(
    context: HrActorContext,
    id: string,
    input: ChangeHrShiftStatusRequest,
    key: string,
    corr: string,
  ): Promise<HrShiftResult> {
    return this.mutateShift(context, input, key, corr, id, true);
  }
  private async mutateShift(
    context: HrActorContext,
    input: CreateHrShiftRequest | UpdateHrShiftRequest | ChangeHrShiftStatusRequest,
    key: string,
    corr: string,
    existingId?: string,
    statusOnly = false,
  ): Promise<HrShiftResult> {
    if (!context.actor.permissions.includes("hr.attendance.shift.manage"))
      throw new HrApiError(403, "PERMISSION_DENIED", "Shift management permission is required.");
    if (!validIdempotencyKey(key))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await this.requireCompanyAccess(client, context, input.company_id);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:shifts:${context.tenantId}:${input.company_id}`,
      ]);
      const path = existingId
          ? `/api/v1/hr/shifts/${existingId}/${statusOnly ? "status" : "rules"}`
          : "/api/v1/hr/shifts",
        fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrShiftResult }>(
        "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",
        [context.tenantId, context.actor.userId, path, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This request key was used for different shift rules.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      let before: HrShiftDetail | null = null;
      if (existingId) {
        await client.query(
          "select id from hr_shift where tenant_id=$1 and company_id=$2 and id=$3 for update",
          [context.tenantId, input.company_id, existingId],
        );
        before = await this.readShiftDetail(client, context, input.company_id, existingId);
        if (!("expected_version" in input) || input.expected_version !== before.version)
          throw new HrApiError(409, "HR_SHIFT_STALE", "The shift changed. Refresh before saving.");
        if (!statusOnly && before.rules_locked)
          throw new HrApiError(
            409,
            "HR_SHIFT_RULES_IN_USE",
            "This shift is referenced by an assignment or rotation. Copy it to a new code to preserve history.",
          );
      }
      const id = existingId ?? `shift-${randomUUID()}`;
      if (statusOnly) {
        const request = input as ChangeHrShiftStatusRequest;
        if (before!.status === request.status)
          throw new HrApiError(409, "HR_SHIFT_STATUS_UNCHANGED", "The shift already has this status.");
        if (request.status === "inactive") {
          const usage = await client.query(
            "select 1 from hr_shift_assignment where tenant_id=$1 and shift_id=$2 and cancelled_at is null and (effective_to is null or effective_to>=current_date) union all select 1 from hr_shift_rotation r join hr_shift parent on parent.tenant_id=r.tenant_id and parent.id=r.shift_id where r.tenant_id=$1 and r.rotation_shift_id=$2 and parent.status='active' limit 1",
            [context.tenantId, id],
          );
          if (usage.rowCount)
            throw new HrApiError(
              409,
              "HR_SHIFT_IN_USE",
              "Move current/future assignments and active rotation references before deactivating this shift.",
            );
        } else {
          if (!before!.configured)
            throw new HrApiError(
              409,
              "HR_SHIFT_CONFIGURATION_REQUIRED",
              "Complete timezone and work rules before activating this shift.",
            );
          if (before!.rotation.some((r) => r.shift.status !== "active" || !r.shift.configured))
            throw new HrApiError(
              409,
              "HR_SHIFT_ROTATION_INVALID",
              "Every rotation member must be active and configured before reactivation.",
            );
          if (before!.work_location_id) {
            const location = await client.query(
              "select 1 from hr_master_record where tenant_id=$1 and company_id=$2 and id=$3 and master_type='work_location' and status='active' for share",
              [context.tenantId, input.company_id, before!.work_location_id],
            );
            if (!location.rowCount)
              throw new HrApiError(
                409,
                "HR_SHIFT_LOCATION_INVALID",
                "An active work location in this company is required.",
              );
          }
        }
        await client.query(
          "update hr_shift set status=$3,version=version+1,updated_at=now() where tenant_id=$1 and id=$2",
          [context.tenantId, id, request.status],
        );
      } else {
        const terms = input as CreateHrShiftRequest | UpdateHrShiftRequest;
        if (terms.work_location_id) {
          const location = await client.query(
            "select id from hr_master_record where tenant_id=$1 and company_id=$2 and id=$3 and master_type='work_location' and status='active' for share",
            [context.tenantId, terms.company_id, terms.work_location_id],
          );
          if (!location.rowCount)
            throw new HrApiError(
              409,
              "HR_SHIFT_LOCATION_INVALID",
              "Select an active work location belonging to this company.",
            );
        }
        let scalar: {
          start_minute: number;
          end_minute: number;
          grace_in_minutes: number;
          grace_out_minutes: number;
          minimum_present_minutes: number;
          half_day_minutes: number;
          overtime_after_minutes: number;
          weekly_off_days: number[];
          required_work_minutes: number;
        };
        if (terms.kind === "rotating") {
          if (terms.rotation_shift_ids.includes(id))
            throw new HrApiError(409, "HR_SHIFT_ROTATION_INVALID", "A rotation cannot include itself.");
          await client.query(
            "select id from hr_shift where tenant_id=$1 and company_id=$2 and id=any($3::text[]) order by id for share",
            [context.tenantId, terms.company_id, terms.rotation_shift_ids],
          );
          const members = await client.query<HrShiftSummary>(
            `select ${this.shiftColumns()} ${this.shiftJoins()} where s.tenant_id=$1 and s.company_id=$2 and s.id=any($3::text[])`,
            [context.tenantId, terms.company_id, terms.rotation_shift_ids],
          );
          if (
            members.rowCount !== new Set(terms.rotation_shift_ids).size ||
            members.rows.some(
              (m) =>
                m.kind === "rotating" ||
                m.status !== "active" ||
                !m.configured ||
                m.time_zone !== terms.time_zone ||
                m.work_location_id !== terms.work_location_id,
            )
          )
            throw new HrApiError(
              409,
              "HR_SHIFT_ROTATION_INVALID",
              "Use active configured non-rotating shifts from this company, with the same timezone and work location.",
            );
          const first = members.rows.find((m) => m.id === terms.rotation_shift_ids[0])!;
          scalar = {
            start_minute: first.start_minute,
            end_minute: first.end_minute,
            grace_in_minutes: first.grace_in_minutes,
            grace_out_minutes: first.grace_out_minutes,
            minimum_present_minutes: first.minimum_present_minutes,
            half_day_minutes: first.half_day_minutes,
            overtime_after_minutes: first.overtime_after_minutes,
            weekly_off_days: first.weekly_off_days,
            required_work_minutes: first.required_work_minutes!,
          };
        } else {
          scalar = terms;
        }
        const values = [
          context.tenantId,
          id,
          terms.company_id,
          terms.code,
          terms.name,
          terms.kind,
          scalar.start_minute,
          scalar.end_minute,
          scalar.grace_in_minutes,
          scalar.grace_out_minutes,
          scalar.half_day_minutes,
          scalar.minimum_present_minutes,
          scalar.overtime_after_minutes,
          scalar.weekly_off_days,
          terms.kind === "flexible",
          context.actor.userId,
          terms.time_zone,
          terms.work_location_id,
          scalar.required_work_minutes,
          terms.kind === "rotating" ? terms.rotation_anchor_date : null,
        ];
        if (!existingId)
          await client.query(
            "insert into hr_shift (tenant_id,id,company_id,code,name,kind,start_minute,end_minute,grace_in_minutes,grace_out_minutes,half_day_minutes,minimum_present_minutes,overtime_after_minutes,weekly_off_days,flexible,created_by,time_zone,work_location_id,required_work_minutes,rotation_anchor_date) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)",
            values,
          );
        else
          await client.query(
            "update hr_shift set code=$4,name=$5,kind=$6,start_minute=$7,end_minute=$8,grace_in_minutes=$9,grace_out_minutes=$10,half_day_minutes=$11,minimum_present_minutes=$12,overtime_after_minutes=$13,weekly_off_days=$14,flexible=$15,time_zone=$17,work_location_id=$18,required_work_minutes=$19,rotation_anchor_date=$20,version=version+1,updated_at=now() where tenant_id=$1 and id=$2 and company_id=$3 and $16::text is not null",
            values,
          );
        if (existingId) {
          await client.query("delete from hr_shift_break where tenant_id=$1 and shift_id=$2", [
            context.tenantId,
            id,
          ]);
          await client.query("delete from hr_shift_rotation where tenant_id=$1 and shift_id=$2", [
            context.tenantId,
            id,
          ]);
        }
        if (terms.kind === "rotating") {
          for (const [index, memberId] of terms.rotation_shift_ids.entries())
            await client.query(
              "insert into hr_shift_rotation (tenant_id,shift_id,position,rotation_shift_id) values ($1,$2,$3,$4)",
              [context.tenantId, id, index + 1, memberId],
            );
        } else
          for (const [index, br] of terms.breaks.entries())
            await client.query(
              "insert into hr_shift_break (tenant_id,id,shift_id,label,minutes,paid,position) values ($1,$2,$3,$4,$5,$6,$7)",
              [context.tenantId, `shift-break-${randomUUID()}`, id, br.label, br.minutes, br.paid, index + 1],
            );
      }
      const after = await this.readShiftDetail(client, context, input.company_id, id),
        action = statusOnly ? "status" : existingId ? "update" : "create";
      const snapshot = { ...after, history: undefined, resolved: undefined, preview_date: undefined };
      await client.query(
        "insert into hr_shift_rule_event (tenant_id,id,shift_id,version,action,reason,snapshot,actor_id) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)",
        [
          context.tenantId,
          `shift-event-${randomUUID()}`,
          id,
          after.version,
          action,
          input.reason,
          JSON.stringify(snapshot),
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(client, context, corr, "hr.shift.rules", {
        entityId: id,
        entityType: "hr_shift",
        sourceReference: `hr:shift:${id}`,
        before,
        after: snapshot,
      });
      const output: HrShiftResult = {
        id,
        code: after.code,
        version: after.version,
        status: after.status,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        "insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,$6,$7,$8)",
        [
          context.tenantId,
          context.actor.userId,
          path,
          key,
          fingerprint,
          existingId ? 200 : 201,
          output,
          stateHash(output),
        ],
      );
      await client.query("commit");
      return output;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if ((error as { code?: string }).code === "23505")
        throw new HrApiError(
          409,
          "HR_SHIFT_CODE_EXISTS",
          "This shift code is already used in the selected company.",
        );
      if ((error as { code?: string }).code === "23514")
        throw new HrApiError(
          409,
          "HR_SHIFT_RULES_PROTECTED",
          "Shift rules are referenced or invalid. Refresh and review assignment, rotation and location configuration.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async getEmployee(context: HrActorContext, employeeId: string): Promise<HrEmployeeDetail> {
    return this.read(context, "hr.employee.read", async (client) => {
      const result = await client.query<EmployeeDetailRow>(
        `select employee.id, employee.employee_number,
                concat_ws(' ', employee.first_name, employee.middle_name, employee.last_name) as display_name,
                employee.work_email, employee.status, employee.joined_on, employee.preferred_name, employee.phone,
                assignment.company_id, assignment.branch_id, branch.name as branch,
                assignment.department_id, department.name as department,
                designation.name as designation, employment_type.name as employment_type,
                job_grade.name as job_grade, work_location.name as work_location,
                employee_category.name as employee_category,
                manager.id as reporting_manager_id, manager.employee_number as reporting_manager_number,
                concat_ws(' ', manager.first_name, manager.middle_name, manager.last_name) as reporting_manager_name,
                binding.user_id as user_account_id
           from employee
           join employee_assignment assignment
             on assignment.tenant_id = employee.tenant_id and assignment.employee_id = employee.id
            and assignment.effective_from <= current_date
            and (assignment.effective_to is null or assignment.effective_to >= current_date)
           join organization_unit branch
             on branch.tenant_id = assignment.tenant_id and branch.id = assignment.branch_id
           join organization_unit department
             on department.tenant_id = assignment.tenant_id and department.id = assignment.department_id
           join hr_master_record designation on designation.tenant_id = assignment.tenant_id and designation.id = assignment.designation_id
           join hr_master_record employment_type on employment_type.tenant_id = assignment.tenant_id and employment_type.id = assignment.employment_type_id
           join hr_master_record job_grade on job_grade.tenant_id = assignment.tenant_id and job_grade.id = assignment.job_grade_id
           join hr_master_record work_location on work_location.tenant_id = assignment.tenant_id and work_location.id = assignment.work_location_id
           join hr_master_record employee_category on employee_category.tenant_id = assignment.tenant_id and employee_category.id = assignment.employee_category_id
           left join employee manager on manager.tenant_id = assignment.tenant_id and manager.id = assignment.reporting_manager_id
           left join employee_user_binding binding
             on binding.tenant_id = employee.tenant_id and binding.employee_id = employee.id
            and binding.effective_from <= current_date and (binding.effective_to is null or binding.effective_to >= current_date)
          where employee.tenant_id = $1 and employee.id = $2
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id = employee.tenant_id and access.user_id = $3
                 and access.company_id = assignment.company_id and access.revoked_at is null
            )`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      const row = result.rows[0];
      if (!row)
        throw new HrApiError(404, "HR_EMPLOYEE_NOT_FOUND", "The employee is unavailable in your company scope.");
      const { reporting_manager_id, reporting_manager_number, reporting_manager_name, joined_on, ...detail } = row;
      return {
        ...detail,
        joined_on: dateOnly(joined_on),
        reporting_manager:
          reporting_manager_id && reporting_manager_number && reporting_manager_name
            ? {
                id: reporting_manager_id,
                employee_number: reporting_manager_number,
                display_name: reporting_manager_name,
              }
            : null,
      };
    });
  }

  async listEmployeeDrafts(
    context: HrActorContext,
    query: HrEmployeeDraftDirectoryQuery,
  ): Promise<HrEmployeeDraftDirectory> {
    return this.read(context, "hr.employee.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["employee.tenant_id = $1", "scope.company_id = $2", "employee.status = 'draft'"];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ', employee.first_name, employee.middle_name, employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<{
        id: string;
        employee_number: string;
        display_name: string;
        work_email: string;
        joined_on: string | Date;
        company_id: string;
        created_at: string | Date;
      }>(
        `select employee.id,employee.employee_number,
                concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as display_name,
                employee.work_email,employee.joined_on,scope.company_id,employee.created_at
           from hr_employee_draft_scope scope
           join employee on employee.tenant_id=scope.tenant_id and employee.id=scope.employee_id
          where ${filters.join(" and ")}
          order by employee.created_at desc, employee.id desc
          limit $${values.length}`,
        values,
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          joined_on: dateOnly(row.joined_on),
          created_at:
            row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async getEmployeeDraft(context: HrActorContext, employeeId: string): Promise<HrEmployeeDraftDetail> {
    return this.read(context, "hr.employee.read", async (client) => {
      const result = await client.query<{
        id: string;
        employee_number: string;
        first_name: string;
        middle_name: string;
        last_name: string;
        preferred_name: string;
        work_email: string;
        phone: string;
        joined_on: string | Date;
        company_id: string;
        created_at: string | Date;
      }>(
        `select employee.id,employee.employee_number,employee.first_name,employee.middle_name,employee.last_name,
                employee.preferred_name,employee.work_email,employee.phone,employee.joined_on::text,
                scope.company_id,employee.created_at
           from hr_employee_draft_scope scope
           join employee on employee.tenant_id=scope.tenant_id and employee.id=scope.employee_id
          where scope.tenant_id=$1 and employee.id=$2 and employee.status='draft'
            and exists (select 1 from security_user_company_access access
                         where access.tenant_id=scope.tenant_id and access.user_id=$3
                           and access.company_id=scope.company_id and access.revoked_at is null)`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      const row = result.rows[0];
      if (!row)
        throw new HrApiError(
          404,
          "HR_EMPLOYEE_DRAFT_NOT_FOUND",
          "The employee draft is unavailable in your company scope.",
        );
      return {
        ...row,
        display_name: [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" "),
        joined_on: dateOnly(row.joined_on),
        created_at:
          row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
      };
    });
  }

  async createEmployeeDraft(
    context: HrActorContext,
    input: CreateHrEmployeeDraftRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeDraftResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee.create"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to create employee drafts.");

    const client = await this.pool.connect();
    try {
      // A tenant-level lock makes the idempotency replay and the append-only
      // audit sequence deterministic under concurrent browser retries.
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `nexora:hr:employee-draft:${context.tenantId}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);

      const requestPath = "/api/v1/hr/employees";
      const fingerprint = stateHash(input);
      const previous = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeDraftResult;
      }>(
        `select request_fingerprint,response_body
           from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4
          for update`,
        [context.tenantId, context.actor.userId, requestPath, idempotencyKey],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...previous.rows[0].response_body, replayed: true };
      }

      const result = await this.insertEmployeeDraft(client, context, input, correlationId);
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, requestPath, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if ((error as { code?: string }).code === "23505")
        throw new HrApiError(409, "HR_EMPLOYEE_ALREADY_EXISTS", "The employee number is already in use.");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertEmployeeDraft(client:PoolClient, context:HrActorContext, input:CreateHrEmployeeDraftRequest, correlationId:string, personalEmail=""):Promise<HrEmployeeDraftResult> {
      const employeeId = `employee-${randomUUID()}`;
      await client.query(
        `insert into employee
          (id,tenant_id,employee_number,first_name,middle_name,last_name,preferred_name,joined_on,work_email,phone,status,created_by,personal_email)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12)`,
        [
          employeeId,
          context.tenantId,
          input.employee_number,
          input.first_name,
          input.middle_name ?? "",
          input.last_name,
          input.preferred_name ?? "",
          input.joined_on,
          input.work_email ?? "",
          input.phone ?? "",
          context.actor.userId,
          personalEmail,
        ],
      );
      await client.query(
        `insert into hr_employee_draft_scope (tenant_id,employee_id,company_id,created_by)
         values ($1,$2,$3,$4)`,
        [context.tenantId, employeeId, input.company_id, context.actor.userId],
      );
      const auditEventId = await this.appendPlatformAudit(client, context, correlationId, "hr.employee.create", {
        entityId: employeeId,
        before: null,
        after: {
          id: employeeId,
          company_id: input.company_id,
          employee_number: input.employee_number,
          first_name: input.first_name,
          middle_name: input.middle_name ?? "",
          last_name: input.last_name,
          preferred_name: input.preferred_name ?? "",
          joined_on: input.joined_on,
          work_email: input.work_email ?? "",
          phone: input.phone ?? "",
          status: "draft",
        },
      });
      await this.recordEmployeeProfileVersion(
        client,
        context,
        employeeId,
        {
          first_name: input.first_name,
          middle_name: input.middle_name ?? "",
          last_name: input.last_name,
          preferred_name: input.preferred_name ?? "",
          work_email: input.work_email ?? "",
          date_of_birth: null,
          personal_email: personalEmail,
          phone: input.phone ?? "",
        },
        `platform-audit:${auditEventId}`,
      );
      const result: HrEmployeeDraftResult = {
        id: employeeId,
        employee_number: input.employee_number,
        status: "draft",
        company_id: input.company_id,
        audit_event_id: auditEventId,
        replayed: false,
      };
      return result;
  }

  async updateEmployeeDraft(
    context: HrActorContext,
    employeeId: string,
    input: UpdateHrEmployeeDraftRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeDraftResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee.update"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to update employee drafts.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `nexora:hr:employee-draft:${context.tenantId}`,
      ]);
      const requestPath = `/api/v1/hr/employee_drafts/${employeeId}`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrEmployeeDraftResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, requestPath, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const existing = await client.query<{
        employee_number: string;
        company_id: string;
        first_name: string;
        middle_name: string;
        last_name: string;
        preferred_name: string;
        joined_on: string;
        work_email: string;
        date_of_birth: string | Date | null;
        personal_email: string;
        phone: string;
      }>(
        `select employee.employee_number,scope.company_id,employee.first_name,employee.middle_name,employee.last_name,
                employee.preferred_name,employee.joined_on::text,employee.work_email,employee.date_of_birth,
                employee.personal_email,employee.phone
           from hr_employee_draft_scope scope join employee on employee.tenant_id=scope.tenant_id and employee.id=scope.employee_id
          where scope.tenant_id=$1 and employee.id=$2 and employee.status='draft'
            and exists (select 1 from security_user_company_access access where access.tenant_id=scope.tenant_id
              and access.user_id=$3 and access.company_id=scope.company_id and access.revoked_at is null) for update of employee`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      const before = existing.rows[0];
      if (!before)
        throw new HrApiError(
          404,
          "HR_EMPLOYEE_DRAFT_NOT_FOUND",
          "The employee draft is unavailable in your company scope.",
        );
      if(input.joined_on) {
        const changedDate=await client.query("select 1 from hr_offer_employee_handoff h join hr_recruitment_offer o on o.tenant_id=h.tenant_id and o.id=h.offer_id where h.tenant_id=$1 and h.employee_id=$2 and o.joining_on<>$3::date",[context.tenantId,employeeId,input.joined_on]);
        if(changedDate.rowCount)throw new HrApiError(409,"HR_OFFER_JOINING_DATE_MISMATCH","The recruitment profile joining date must match the accepted offer.");
      }
      const after = {
        ...before,
        first_name: input.first_name ?? before.first_name,
        middle_name: input.middle_name ?? before.middle_name,
        last_name: input.last_name ?? before.last_name,
        preferred_name: input.preferred_name ?? before.preferred_name,
        joined_on: input.joined_on ?? before.joined_on,
        work_email: input.work_email ?? before.work_email,
        phone: input.phone ?? before.phone,
      };
      await client.query(
        `update employee set first_name=$3,middle_name=$4,last_name=$5,preferred_name=$6,joined_on=$7,work_email=$8,phone=$9,updated_at=now()
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          employeeId,
          after.first_name,
          after.middle_name,
          after.last_name,
          after.preferred_name,
          after.joined_on,
          after.work_email,
          after.phone,
        ],
      );
      const auditEventId = await this.appendPlatformAudit(client, context, correlationId, "hr.employee.update", {
        entityId: employeeId,
        before,
        after,
      });
      await this.recordEmployeeProfileVersion(
        client,
        context,
        employeeId,
        {
          first_name: after.first_name,
          middle_name: after.middle_name,
          last_name: after.last_name,
          preferred_name: after.preferred_name,
          work_email: after.work_email,
          date_of_birth: after.date_of_birth,
          personal_email: after.personal_email,
          phone: after.phone,
        },
        `platform-audit:${auditEventId}`,
      );
      const result: HrEmployeeDraftResult = {
        id: employeeId,
        employee_number: before.employee_number,
        status: "draft",
        company_id: before.company_id,
        audit_event_id: auditEventId,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, requestPath, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async submitEmployeeDraft(
    context: HrActorContext,
    employeeId: string,
    input: SubmitHrEmployeeDraftRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeDraftResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee.submit"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to submit employee drafts.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `nexora:hr:employee-draft:${context.tenantId}`,
      ]);
      const path = `/api/v1/hr/employee_drafts/${employeeId}/submit`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrEmployeeDraftResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const record = await client.query<{ employee_number: string; company_id: string; status: string }>(
        `select employee.employee_number,scope.company_id,employee.status from hr_employee_draft_scope scope
           join employee on employee.tenant_id=scope.tenant_id and employee.id=scope.employee_id
          where scope.tenant_id=$1 and employee.id=$2 and exists (select 1 from security_user_company_access access where access.tenant_id=scope.tenant_id and access.user_id=$3 and access.company_id=scope.company_id and access.revoked_at is null) for update of employee`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      const before = record.rows[0];
      if (!before)
        throw new HrApiError(
          404,
          "HR_EMPLOYEE_DRAFT_NOT_FOUND",
          "The employee draft is unavailable in your company scope.",
        );
      if (before.status !== "draft")
        throw new HrApiError(409, "HR_DRAFT_NOT_SUBMITTABLE", "Only a draft employee can be submitted.");
      await client.query(
        "update employee set status='pending_approval',submitted_by=$3,updated_at=now() where tenant_id=$1 and id=$2",
        [context.tenantId, employeeId, context.actor.userId],
      );
      await client.query(
        `insert into employee_status_history (id,tenant_id,employee_id,from_status,to_status,effective_on,reason,actor_id)
         values ($1,$2,$3,'draft','pending_approval',current_date,$4,$5)`,
        [`employee-status-${randomUUID()}`, context.tenantId, employeeId, input.reason, context.actor.userId],
      );
      const auditEventId = await this.appendPlatformAudit(client, context, correlationId, "hr.employee.submit", {
        entityId: employeeId,
        before,
        after: { ...before, status: "pending_approval", reason: input.reason },
      });
      await client.query(
        `insert into hr_employee_draft_approval (id,tenant_id,employee_id,state,submitted_by,audit_event_id)
         values ($1,$2,$3,'pending',$4,$5)`,
        [`employee-draft-approval-${randomUUID()}`, context.tenantId, employeeId, context.actor.userId, auditEventId],
      );
      const result = {
        id: employeeId,
        employee_number: before.employee_number,
        status: "pending_approval" as const,
        company_id: before.company_id,
        audit_event_id: auditEventId,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeDraftApprovals(
    context: HrActorContext,
    query: HrEmployeeDraftApprovalQueueQuery,
  ): Promise<HrEmployeeDraftApprovalQueue> {
    return this.read(context, "hr.employee.approve", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const result = await client.query<{
        approval_id: string;
        employee_id: string;
        employee_number: string;
        display_name: string;
        company_id: string;
        submitted_by: string;
        submitted_at: string | Date;
      }>(
        `select approval.id as approval_id,employee.id as employee_id,employee.employee_number,
                concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as display_name,
                scope.company_id,approval.submitted_by,approval.submitted_at
           from hr_employee_draft_approval approval
           join hr_employee_draft_scope scope on scope.tenant_id=approval.tenant_id and scope.employee_id=approval.employee_id
           join employee on employee.tenant_id=approval.tenant_id and employee.id=approval.employee_id
          where approval.tenant_id=$1 and scope.company_id=$2 and approval.state='pending'
          order by approval.submitted_at,approval.id limit $3`,
        [context.tenantId, query.company_id, query.limit],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          submitted_at:
            row.submitted_at instanceof Date
              ? row.submitted_at.toISOString()
              : new Date(row.submitted_at).toISOString(),
        })),
      };
    });
  }

  async getEmployeeDraftApproval(context: HrActorContext, employeeId: string): Promise<HrEmployeeDraftApprovalDetail> {
    return this.read(context, "hr.employee.approve", async (client) => {
      const result = await client.query<{
        id: string;
        employee_number: string;
        first_name: string;
        middle_name: string;
        last_name: string;
        preferred_name: string;
        work_email: string;
        phone: string;
        joined_on: string | Date;
        company_id: string;
        created_at: string | Date;
        approval_id: string;
        created_by: string;
        submitted_by: string;
        submitted_at: string | Date;
      }>(
        `select employee.id,employee.employee_number,employee.first_name,employee.middle_name,
                employee.last_name,employee.preferred_name,employee.work_email,employee.phone,
                employee.joined_on,employee.created_at,employee.created_by,scope.company_id,
                approval.id as approval_id,approval.submitted_by,approval.submitted_at
           from hr_employee_draft_approval approval
           join employee on employee.tenant_id=approval.tenant_id and employee.id=approval.employee_id
           join hr_employee_draft_scope scope on scope.tenant_id=approval.tenant_id and scope.employee_id=approval.employee_id
          where approval.tenant_id=$1 and approval.employee_id=$2 and approval.state='pending'
            and employee.status='pending_approval'
            and exists (select 1 from security_user_company_access access
                         where access.tenant_id=scope.tenant_id and access.user_id=$3
                           and access.company_id=scope.company_id and access.revoked_at is null)`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      const row = result.rows[0];
      if (!row)
        throw new HrApiError(
          404,
          "HR_APPROVAL_NOT_FOUND",
          "The pending approval is unavailable in your company scope.",
        );
      return {
        ...row,
        display_name: [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" "),
        joined_on: dateOnly(row.joined_on),
        created_at: new Date(row.created_at).toISOString(),
        submitted_at: new Date(row.submitted_at).toISOString(),
        ...approvalOverrideReviewMetadata(context, [row.created_by, row.submitted_by], "hr.employee.approve"),
      };
    });
  }

  async decideEmployeeDraftApproval(
    context: HrActorContext,
    employeeId: string,
    input: DecideHrEmployeeDraftApprovalRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeDraftResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee.approve"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide employee approvals.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `nexora:hr:employee-approval:${context.tenantId}`,
      ]);
      const path = `/api/v1/hr/employee_drafts/${employeeId}/approval_decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrEmployeeDraftResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const record = await client.query<{
        approval_id: string;
        employee_number: string;
        company_id: string;
        submitted_by: string;
        created_by: string;
      }>(
        `select approval.id as approval_id,employee.employee_number,scope.company_id,
                approval.submitted_by,employee.created_by
           from hr_employee_draft_approval approval
           join hr_employee_draft_scope scope on scope.tenant_id=approval.tenant_id and scope.employee_id=approval.employee_id
           join employee on employee.tenant_id=approval.tenant_id and employee.id=approval.employee_id
          where approval.tenant_id=$1 and approval.employee_id=$2 and approval.state='pending'
            and employee.status='pending_approval'
            and exists (select 1 from security_user_company_access access where access.tenant_id=scope.tenant_id and access.user_id=$3 and access.company_id=scope.company_id and access.revoked_at is null)
          for update of approval,employee`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      const before = record.rows[0];
      if (!before)
        throw new HrApiError(
          409,
          "HR_APPROVAL_NOT_PENDING",
          "The employee approval is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employee.approve",
        makerActorIds: [before.created_by, before.submitted_by],
        resourceType: "hr.employee_draft_approval",
        resourceId: before.approval_id,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const employeeStatus = input.decision === "rejected" ? "draft" : "pending_approval";
      await client.query(
        "update hr_employee_draft_approval set state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,approval_override_event_id=$6 where tenant_id=$1 and id=$2",
        [
          context.tenantId,
          before.approval_id,
          input.decision,
          context.actor.userId,
          input.reason,
          approvalOverrideEventId,
        ],
      );
      if (input.decision === "rejected")
        await client.query(
          "update employee set status='draft',submitted_by=null,updated_at=now() where tenant_id=$1 and id=$2",
          [context.tenantId, employeeId],
        );
      await client.query(
        "insert into employee_status_history (id,tenant_id,employee_id,from_status,to_status,effective_on,reason,actor_id) values ($1,$2,$3,'pending_approval',$4,current_date,$5,$6)",
        [
          `employee-status-${randomUUID()}`,
          context.tenantId,
          employeeId,
          employeeStatus,
          input.reason,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(client, context, correlationId, "hr.employee.approve", {
        entityId: employeeId,
        before: { status: "pending_approval", approval: "pending" },
        after: {
          status: employeeStatus,
          approval: input.decision,
          reason: input.reason,
          super_admin_override: approvalOverrideEventId !== null,
        },
      });
      const result = {
        id: employeeId,
        employee_number: before.employee_number,
        status: employeeStatus as "draft" | "pending_approval",
        company_id: before.company_id,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query("update hr_employee_draft_approval set audit_event_id=$3 where tenant_id=$1 and id=$2", [
        context.tenantId,
        before.approval_id,
        audit,
      ]);
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createProfileDraftAssignment(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrProfileDraftAssignmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrProfileDraftAssignmentResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.create"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to create employee assignments.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:assignment:${context.tenantId}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/profile_draft_assignment`,
        fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrProfileDraftAssignmentResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const approved = await client.query(
        `select 1 from employee employee join hr_employee_draft_scope scope on scope.tenant_id=employee.tenant_id and scope.employee_id=employee.id join hr_employee_draft_approval approval on approval.tenant_id=employee.tenant_id and approval.employee_id=employee.id where employee.tenant_id=$1 and employee.id=$2 and scope.company_id=$3 and approval.state='approved'`,
        [context.tenantId, employeeId, input.company_id],
      );
      if (!approved.rowCount)
        throw new HrApiError(
          409,
          "HR_ASSIGNMENT_NOT_ALLOWED",
          "An approved employee draft in the selected company is required.",
        );
      await this.requireOfferAssignmentMatch(client, context, employeeId, input);
      const id = `employee-assignment-${randomUUID()}`;
      await client.query(
        `insert into employee_assignment (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,reporting_manager_id,effective_from,change_reason,created_by,assignment_status,source_reference) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'initial_appointment',$15,'profile_draft','hr:profile-draft-assignment')`,
        [
          id,
          context.tenantId,
          employeeId,
          input.company_id,
          input.branch_id ?? null,
          input.department_id ?? null,
          input.designation_id,
          input.job_grade_id,
          input.cost_center_id,
          input.work_location_id,
          input.employment_type_id,
          input.employee_category_id,
          input.reporting_manager_id ?? null,
          input.effective_from,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(client, context, correlationId, "hr.employee_assignment.create", {
        entityId: id,
        before: null,
        after: { employee_id: employeeId, company_id: input.company_id, assignment_status: "profile_draft" },
      });
      const result = {
        id,
        employee_id: employeeId,
        company_id: input.company_id,
        assignment_status: "profile_draft" as const,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeContacts(context: HrActorContext, employeeId: string): Promise<HrEmployeeContactDirectory> {
    return this.read(context, "hr.employee_contact.read", async (client) => {
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const result = await client.query<{
        id: string;
        employee_id: string;
        channel: "email" | "phone";
        contact_usage: "work" | "personal" | "other";
        contact_value: string;
        label: string;
        is_primary: boolean;
        effective_from: string | Date;
        created_at: string | Date;
      }>(
        `select id,employee_id,channel,contact_usage,contact_value,label,is_primary,effective_from,created_at
           from employee_contact
          where tenant_id=$1 and employee_id=$2 and channel in ('email','phone')
            and status='active' and effective_from<=current_date
            and (effective_to is null or effective_to>=current_date)
          order by channel,contact_usage,is_primary desc,effective_from desc,id
          limit 100`,
        [context.tenantId, employeeId],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          effective_from: dateOnly(row.effective_from),
          created_at: new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async createEmployeeContact(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeContactRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeContactResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_contact.manage"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to manage employee contacts.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-contact:${context.tenantId}:${employeeId}`,
      ]);
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const path = `/api/v1/hr/employees/${employeeId}/contacts`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrEmployeeContactResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      if (input.is_primary) {
        const primary = await client.query(
          `select 1 from employee_contact where tenant_id=$1 and employee_id=$2 and channel=$3 and contact_usage=$4
             and is_primary and status='active' and effective_to is null for update`,
          [context.tenantId, employeeId, input.channel, input.contact_usage],
        );
        if (primary.rowCount)
          throw new HrApiError(
            409,
            "HR_CONTACT_PRIMARY_EXISTS",
            "Close the existing primary contact through the governed contact-change workflow before adding another.",
          );
      }
      const id = `employee-contact-${randomUUID()}`;
      await client.query(
        `insert into employee_contact
          (id,tenant_id,employee_id,channel,contact_usage,contact_value,label,is_primary,status,effective_from,created_by,source_reference)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'active',current_date,$9,'hr:employee-contact-create')`,
        [
          id,
          context.tenantId,
          employeeId,
          input.channel,
          input.contact_usage,
          input.contact_value,
          input.label ?? "",
          input.is_primary,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(client, context, correlationId, "hr.employee_contact.create", {
        entityId: id,
        before: null,
        after: {
          employee_id: employeeId,
          channel: input.channel,
          contact_usage: input.contact_usage,
          is_primary: input.is_primary,
        },
      });
      const result = { id, employee_id: employeeId, audit_event_id: audit, replayed: false };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeEmergencyContacts(
    context: HrActorContext,
    employeeId: string,
  ): Promise<HrEmployeeEmergencyContactDirectory> {
    return this.read(context, "hr.employee_emergency_contact.read", async (client) => {
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const result = await client.query<{
        id: string;
        employee_id: string;
        name: string;
        relationship: string;
        phone: string;
        email: string;
        priority: number;
        is_primary: boolean;
        effective_from: string | Date;
        created_at: string | Date;
      }>(
        `select id,employee_id,name,relationship,phone,email,priority,is_primary,effective_from,created_at
           from employee_emergency_contact
          where tenant_id=$1 and employee_id=$2 and status='active' and effective_from<=current_date
            and (effective_to is null or effective_to>=current_date)
          order by priority,effective_from desc,id
          limit 99`,
        [context.tenantId, employeeId],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          effective_from: dateOnly(row.effective_from),
          created_at: new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async createEmployeeEmergencyContact(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeEmergencyContactRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeEmergencyContactResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_emergency_contact.manage"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to manage emergency contacts.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-emergency-contact:${context.tenantId}:${employeeId}`,
      ]);
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const path = `/api/v1/hr/employees/${employeeId}/emergency_contacts`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeEmergencyContactResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const conflict = await client.query(
        `select 1 from employee_emergency_contact
          where tenant_id=$1 and employee_id=$2 and status='active' and effective_to is null
            and (priority=$3 or ($4 and is_primary))
          for update`,
        [context.tenantId, employeeId, input.priority, input.is_primary],
      );
      if (conflict.rowCount)
        throw new HrApiError(
          409,
          "HR_EMERGENCY_CONTACT_CONFLICT",
          "The active emergency-contact priority or primary designation already exists.",
        );
      const id = `employee-emergency-contact-${randomUUID()}`;
      await client.query(
        `insert into employee_emergency_contact
          (id,tenant_id,employee_id,name,relationship,phone,email,priority,is_primary,status,effective_from,created_by,source_reference)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',current_date,$10,'hr:employee-emergency-contact-create')`,
        [
          id,
          context.tenantId,
          employeeId,
          input.name,
          input.relationship,
          input.phone,
          input.email ?? "",
          input.priority,
          input.is_primary,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_emergency_contact.create",
        {
          entityId: id,
          before: null,
          after: { employee_id: employeeId, priority: input.priority, is_primary: input.is_primary },
        },
      );
      const result = { id, employee_id: employeeId, audit_event_id: audit, replayed: false };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeDocuments(context: HrActorContext, employeeId: string): Promise<HrEmployeeDocumentDirectory> {
    return this.read(context, "hr.employee_document.read", async (client) => {
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const result = await client.query<{
        id: string;
        employee_id: string;
        document_type: string;
        title: string;
        reference: string;
        issued_on: string | Date | null;
        expires_on: string | Date | null;
        restricted: boolean;
        issuing_authority: string;
        verification_status: "unverified" | "pending" | "verified" | "rejected" | "expired";
        status: "active" | "inactive";
        created_at: string | Date;
      }>(
        `select id,employee_id,document_type,title,reference,issued_on,expires_on,restricted,
                issuing_authority,verification_status,status,created_at
           from employee_document
          where tenant_id=$1 and employee_id=$2
          order by status='active' desc,expires_on nulls last,created_at desc,id
          limit 100`,
        [context.tenantId, employeeId],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          issued_on: row.issued_on === null ? null : dateOnly(row.issued_on),
          expires_on: row.expires_on === null ? null : dateOnly(row.expires_on),
          created_at: new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async listEmployeeAssignments(context: HrActorContext, employeeId: string): Promise<HrEmployeeAssignmentDirectory> {
    return this.read(context, "hr.employee_assignment.read", async (client) => {
      await this.requireEmployeeAssignmentCompanyScope(client, context, employeeId);
      const result = await client.query<EmployeeAssignmentRow>(
        `select assignment.id,assignment.employee_id,assignment.company_id,
                assignment.employment_relationship_id,assignment.branch_id,assignment.department_id,
                assignment.job_id,assignment.designation_id,assignment.job_grade_id,assignment.cost_center_id,
                assignment.work_location_id,assignment.employment_type_id,assignment.employee_category_id,
                assignment.reporting_manager_id,
                jsonb_build_object(
                  'business_unit_id',(select organization_unit_id from employee_assignment_org_unit
                    where tenant_id=assignment.tenant_id and assignment_id=assignment.id and organization_type='business_unit'),
                  'division_id',(select organization_unit_id from employee_assignment_org_unit
                    where tenant_id=assignment.tenant_id and assignment_id=assignment.id and organization_type='division'),
                  'branch_id',(select organization_unit_id from employee_assignment_org_unit
                    where tenant_id=assignment.tenant_id and assignment_id=assignment.id and organization_type='branch'),
                  'department_id',(select organization_unit_id from employee_assignment_org_unit
                    where tenant_id=assignment.tenant_id and assignment_id=assignment.id and organization_type='department'),
                  'warehouse_id',(select organization_unit_id from employee_assignment_org_unit
                    where tenant_id=assignment.tenant_id and assignment_id=assignment.id and organization_type='warehouse')
                ) as organization_placements,
                designation.name as designation,coalesce(job.name,'') as job,
                job_grade.name as job_grade,employment_type.name as employment_type,
                work_location.name as work_location,assignment.change_reason,
                assignment.assignment_status,assignment.effective_from::text,assignment.effective_to::text,assignment.created_at
           from employee_assignment assignment
           join hr_master_record designation
             on designation.tenant_id=assignment.tenant_id and designation.id=assignment.designation_id
           left join hr_master_record job
             on job.tenant_id=assignment.tenant_id and job.id=assignment.job_id
           join hr_master_record job_grade
             on job_grade.tenant_id=assignment.tenant_id and job_grade.id=assignment.job_grade_id
           join hr_master_record employment_type
             on employment_type.tenant_id=assignment.tenant_id and employment_type.id=assignment.employment_type_id
           join hr_master_record work_location
             on work_location.tenant_id=assignment.tenant_id and work_location.id=assignment.work_location_id
          where assignment.tenant_id=$1 and assignment.employee_id=$2
            and exists(select 1 from security_user_company_access access where access.tenant_id=assignment.tenant_id and access.company_id=assignment.company_id and access.user_id=$3 and access.revoked_at is null)
          order by assignment.effective_from desc, assignment.created_at desc, assignment.id desc
          limit 100`,
        [context.tenantId, employeeId, context.actor.userId],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          effective_from: dateOnly(row.effective_from),
          effective_to: row.effective_to ? dateOnly(row.effective_to) : null,
          created_at: new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async listEmployeeStatusHistory(
    context: HrActorContext,
    employeeId: string,
  ): Promise<HrEmployeeStatusHistoryDirectory> {
    return this.read(context, "hr.employment_history.read", async (client) => {
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const result = await client.query<EmployeeStatusHistoryRow>(
        `select id,employee_id,from_status,to_status,effective_on,reason,created_at
           from employee_status_history
          where tenant_id=$1 and employee_id=$2
          order by effective_on desc,created_at desc,id desc
          limit 100`,
        [context.tenantId, employeeId],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          effective_on: dateOnly(row.effective_on),
          created_at: new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async listEmployeeLifecycleEvents(
    context: HrActorContext,
    employeeId: string,
    query: HrEmployeeHistoryQuery,
  ): Promise<HrEmployeeLifecycleEventDirectory> {
    return this.read(context, "hr.employment_history.read", async (client) => {
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const cursor = decodeEmployeeHistoryCursor(query.cursor, "lifecycle");
      const values: unknown[] = [context.tenantId, employeeId];
      const cursorFilter = cursor
        ? `and (event.recorded_at,event.id)<($${values.push(cursor.recordedAt)}::timestamptz,$${values.push(cursor.id)})`
        : "";
      values.push(query.limit + 1);
      const result = await client.query<EmployeeLifecycleEventRow>(
        `select event.id,event.relationship_id,event.sequence,event.event_type,event.effective_on,
                case when previous_state.id is null then null else jsonb_build_object(
                  'code',previous_state.code,'label',previous_state.label,
                  'canonical_class',previous_state.canonical_class
                ) end as previous_state,
                jsonb_build_object(
                  'code',resulting_state.code,'label',resulting_state.label,
                  'canonical_class',resulting_state.canonical_class
                ) as resulting_state,
                event.reason,event.source_reference,event.recorded_at,event.approved_at
           from hr_employment_event event
           join hr_employment_relationship relationship
             on relationship.tenant_id=event.tenant_id and relationship.id=event.relationship_id
           left join hr_employment_lifecycle_state previous_state
             on previous_state.tenant_id=event.tenant_id and previous_state.id=event.previous_state_id
           join hr_employment_lifecycle_state resulting_state
             on resulting_state.tenant_id=event.tenant_id and resulting_state.id=event.resulting_state_id
          where event.tenant_id=$1 and relationship.employee_id=$2 ${cursorFilter}
          order by event.recorded_at desc,event.id desc
          limit $${values.length}`,
        values,
      );
      const hasMore = result.rows.length > query.limit;
      const page = result.rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          ...row,
          effective_on: dateOnly(row.effective_on),
          recorded_at: new Date(row.recorded_at).toISOString(),
          approved_at: new Date(row.approved_at).toISOString(),
        })),
        next_cursor: hasMore && last ? encodeEmployeeHistoryCursor("lifecycle", last.recorded_at, last.id) : null,
      };
    });
  }

  async listEmployeeProfileHistory(
    context: HrActorContext,
    employeeId: string,
    query: HrEmployeeHistoryQuery,
  ): Promise<HrEmployeeProfileVersionDirectory> {
    return this.read(context, "hr.employment_history.read", async (client) => {
      await this.requireActiveEmployeeCompanyScope(client, context, employeeId);
      const cursor = decodeEmployeeHistoryCursor(query.cursor, "profile");
      const values: unknown[] = [context.tenantId, employeeId];
      const cursorFilter = cursor
        ? `and (version.recorded_at,version.id)<($${values.push(cursor.recordedAt)}::timestamptz,$${values.push(cursor.id)})`
        : "";
      values.push(query.limit + 1);
      const result = await client.query<EmployeeProfileVersionRow>(
        `select version.id,version.revision,version.effective_from,version.effective_to,
                version.first_name,version.middle_name,version.last_name,version.preferred_name,
                version.work_email,version.source_reference,version.recorded_at
           from hr_employee_profile_version version
          where version.tenant_id=$1 and version.employee_id=$2 ${cursorFilter}
          order by version.recorded_at desc,version.id desc
          limit $${values.length}`,
        values,
      );
      const hasMore = result.rows.length > query.limit;
      const page = result.rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          ...row,
          effective_from: dateOnly(row.effective_from),
          effective_to: row.effective_to === null ? null : dateOnly(row.effective_to),
          capture_origin: row.source_reference.startsWith("migration:") ? "migration_baseline" : "recorded_change",
          recorded_at: new Date(row.recorded_at).toISOString(),
        })),
        next_cursor: hasMore && last ? encodeEmployeeHistoryCursor("profile", last.recorded_at, last.id) : null,
      };
    });
  }

  async listEmploymentLifecyclePolicies(
    context: HrActorContext,
    query: HrEmploymentLifecyclePolicyDirectoryQuery,
  ): Promise<HrEmploymentLifecyclePolicyDirectory> {
    return this.read(context, "hr.employment_lifecycle_policy.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const result = await client.query<EmploymentLifecyclePolicyRow>(
        `select id,legal_employer_id as company_id,code,name,version,status,effective_from,effective_to,
                created_by,submitted_by
           from hr_employment_lifecycle_policy
          where tenant_id=$1 and legal_employer_id=$2
          order by effective_from desc,version desc,code,id
          limit $3`,
        [context.tenantId, query.company_id, query.limit],
      );
      return {
        items: result.rows.map((row) => {
          const { created_by, submitted_by, ...policy } = row;
          return {
            ...policy,
            effective_from: dateOnly(row.effective_from),
            effective_to: row.effective_to ? dateOnly(row.effective_to) : null,
            ...approvalOverrideReviewMetadata(
              context,
              [created_by, submitted_by ?? ""],
              "hr.employment_lifecycle_policy.approve",
            ),
          };
        }),
      };
    });
  }

  async createEmploymentLifecyclePolicy(
    context: HrActorContext,
    input: CreateHrEmploymentLifecyclePolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmploymentLifecyclePolicyResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employment_lifecycle_policy.manage"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to manage lifecycle policies.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:lifecycle-policy:${context.tenantId}:${input.company_id}:${input.code}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = "/api/v1/hr/employment_lifecycle_policies";
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmploymentLifecyclePolicyResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const versionResult = await client.query<{ version: number }>(
        `select coalesce(max(version),0)::integer as version
           from hr_employment_lifecycle_policy
          where tenant_id=$1 and legal_employer_id=$2 and code=$3`,
        [context.tenantId, input.company_id, input.code],
      );
      const id = `employment-lifecycle-policy-${randomUUID()}`;
      const version = (versionResult.rows[0]?.version ?? 0) + 1;
      await client.query(
        `insert into hr_employment_lifecycle_policy
          (id,tenant_id,legal_employer_id,code,name,version,status,effective_from,effective_to,created_by)
         values ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9)`,
        [
          id,
          context.tenantId,
          input.company_id,
          input.code,
          input.name,
          version,
          input.effective_from,
          input.effective_to ?? null,
          context.actor.userId,
        ],
      );
      const preEmploymentStateId = `employment-lifecycle-state-${randomUUID()}`;
      const employedStateId = `employment-lifecycle-state-${randomUUID()}`;
      const confirmedStateId=`employment-lifecycle-state-${randomUUID()}`,endedStateId=`employment-lifecycle-state-${randomUUID()}`;
      await client.query(
        `insert into hr_employment_lifecycle_state
          (id,tenant_id,policy_id,code,label,canonical_class,is_initial,display_order)
         values
          ($1,$2,$3,'pre_employment','Pre-employment','pre_employment',true,1),
          ($4,$2,$3,'employed','Employed','employed',false,2)`,
        [preEmploymentStateId, context.tenantId, id, employedStateId],
      );
      await client.query("insert into hr_employment_lifecycle_state(id,tenant_id,policy_id,code,label,canonical_class,is_initial,display_order) values($1,$2,$3,'confirmed','Confirmed employment','employed',false,3),($4,$2,$3,'ended','Ended employment','ended',false,4)",[confirmedStateId,context.tenantId,id,endedStateId]);
      for(const [eventType,fromState,toState] of [['confirmation',employedStateId,confirmedStateId],['resignation',employedStateId,endedStateId],['termination',employedStateId,endedStateId],['resignation',confirmedStateId,endedStateId],['termination',confirmedStateId,endedStateId]])await client.query("insert into hr_employment_lifecycle_transition(id,tenant_id,policy_id,event_type,from_state_id,to_state_id,requires_approval,workflow_trigger) values($1,$2,$3,$4,$5,$6,true,$7)",['employment-lifecycle-transition-'+randomUUID(),context.tenantId,id,eventType,fromState,toState,'hr_employment_'+eventType]);
      await client.query(
        `insert into hr_employment_lifecycle_transition
          (id,tenant_id,policy_id,event_type,from_state_id,to_state_id,requires_approval,workflow_trigger)
         values ($1,$2,$3,'hire',$4,$5,true,'hr_employment_hire')`,
        [
          `employment-lifecycle-transition-${randomUUID()}`,
          context.tenantId,
          id,
          preEmploymentStateId,
          employedStateId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employment_lifecycle_policy.create",
        {
          entityId: id,
          entityType: "employment_lifecycle_policy",
          before: null,
          after: { company_id: input.company_id, code: input.code, version, status: "draft" },
        },
      );
      const result: HrEmploymentLifecyclePolicyResult = {
        id,
        company_id: input.company_id,
        code: input.code,
        name: input.name,
        version,
        status: "draft",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async submitEmploymentLifecyclePolicy(
    context: HrActorContext,
    policyId: string,
    input: SubmitHrEmploymentLifecyclePolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmploymentLifecyclePolicySubmissionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employment_lifecycle_policy.manage"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to submit lifecycle policies.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:lifecycle-policy-submit:${context.tenantId}:${policyId}`,
      ]);
      const path = `/api/v1/hr/employment_lifecycle_policies/${policyId}/submit`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmploymentLifecyclePolicySubmissionResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const policy = await client.query<{
        company_id: string;
        code: string;
        name: string;
        version: number;
        status: "draft" | "pending_approval" | "approved" | "active" | "inactive";
      }>(
        `select legal_employer_id as company_id,code,name,version,status
           from hr_employment_lifecycle_policy
          where tenant_id=$1 and id=$2
            and exists (select 1 from security_user_company_access access where access.tenant_id=hr_employment_lifecycle_policy.tenant_id and access.user_id=$3 and access.company_id=hr_employment_lifecycle_policy.legal_employer_id and access.revoked_at is null)
          for update`,
        [context.tenantId, policyId, context.actor.userId],
      );
      const before = policy.rows[0];
      if (!before || before.status !== "draft")
        throw new HrApiError(
          409,
          "HR_LIFECYCLE_POLICY_NOT_DRAFT",
          "The lifecycle policy is not a draft in your company scope.",
        );
      await client.query(
        `update hr_employment_lifecycle_policy
            set status='pending_approval',submitted_by=$3,submitted_at=now(),updated_at=now()
          where tenant_id=$1 and id=$2`,
        [context.tenantId, policyId, context.actor.userId],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employment_lifecycle_policy.submit",
        {
          entityId: policyId,
          entityType: "employment_lifecycle_policy",
          before: { ...before, status: "draft" },
          after: { ...before, status: "pending_approval", reason: input.reason },
        },
      );
      const result: HrEmploymentLifecyclePolicySubmissionResult = {
        id: policyId,
        company_id: before.company_id,
        code: before.code,
        name: before.name,
        version: before.version,
        status: "pending_approval",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async approveEmploymentLifecyclePolicy(
    context: HrActorContext,
    policyId: string,
    input: ApproveHrEmploymentLifecyclePolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmploymentLifecyclePolicyApprovalResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employment_lifecycle_policy.approve"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to approve lifecycle policies.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:lifecycle-policy-approval:${context.tenantId}:${policyId}`,
      ]);
      const path = `/api/v1/hr/employment_lifecycle_policies/${policyId}/approval_decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmploymentLifecyclePolicyApprovalResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const policy = await client.query<{
        company_id: string;
        code: string;
        name: string;
        version: number;
        created_by: string;
        submitted_by: string | null;
      }>(
        `select legal_employer_id as company_id,code,name,version,created_by,submitted_by
           from hr_employment_lifecycle_policy
          where tenant_id=$1 and id=$2 and status='pending_approval'
            and exists (select 1 from security_user_company_access access where access.tenant_id=hr_employment_lifecycle_policy.tenant_id and access.user_id=$3 and access.company_id=hr_employment_lifecycle_policy.legal_employer_id and access.revoked_at is null)
          for update`,
        [context.tenantId, policyId, context.actor.userId],
      );
      const before = policy.rows[0];
      if (!before)
        throw new HrApiError(
          409,
          "HR_LIFECYCLE_POLICY_NOT_PENDING",
          "The lifecycle policy is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employment_lifecycle_policy.approve",
        makerActorIds: [before.created_by, before.submitted_by ?? ""],
        resourceType: "hr.employment_lifecycle_policy",
        resourceId: policyId,
        decisionAction: "approve",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      await client.query(
        `update hr_employment_lifecycle_policy
            set status='approved',approved_by=$3,approved_at=now(),updated_at=now(),
                approval_override_event_id=$4
          where tenant_id=$1 and id=$2`,
        [context.tenantId, policyId, context.actor.userId, approvalOverrideEventId],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employment_lifecycle_policy.approve",
        {
          entityId: policyId,
          entityType: "employment_lifecycle_policy",
          before: { ...before, status: "pending_approval" },
          after: {
            ...before,
            status: "approved",
            reason: input.reason,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmploymentLifecyclePolicyApprovalResult = {
        id: policyId,
        company_id: before.company_id,
        code: before.code,
        name: before.name,
        version: before.version,
        status: "approved",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async activateEmploymentLifecyclePolicy(
    context: HrActorContext,
    policyId: string,
    input: ActivateHrEmploymentLifecyclePolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmploymentLifecyclePolicyActivationResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employment_lifecycle_policy.approve"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to activate lifecycle policies.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:lifecycle-policy-activation:${context.tenantId}:${policyId}`,
      ]);
      const path = `/api/v1/hr/employment_lifecycle_policies/${policyId}/activate`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmploymentLifecyclePolicyActivationResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const policy = await client.query<{
        company_id: string;
        code: string;
        name: string;
        version: number;
        created_by: string;
        submitted_by: string | null;
      }>(
        `select legal_employer_id as company_id,code,name,version,created_by,submitted_by
           from hr_employment_lifecycle_policy
          where tenant_id=$1 and id=$2 and status='approved' and effective_from<=current_date and (effective_to is null or effective_to>=current_date)
            and exists (select 1 from security_user_company_access access where access.tenant_id=hr_employment_lifecycle_policy.tenant_id and access.user_id=$3 and access.company_id=hr_employment_lifecycle_policy.legal_employer_id and access.revoked_at is null)
          for update`,
        [context.tenantId, policyId, context.actor.userId],
      );
      const before = policy.rows[0];
      if (!before)
        throw new HrApiError(
          409,
          "HR_LIFECYCLE_POLICY_NOT_ACTIVATABLE",
          "The policy must be approved, currently effective, and within your company scope.",
        );
      const activationOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employment_lifecycle_policy.approve",
        makerActorIds: [before.created_by, before.submitted_by ?? ""],
        resourceType: "hr.employment_lifecycle_policy",
        resourceId: policyId,
        decisionAction: "activate",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const overlapping = await client.query(
        `select 1 from hr_employment_lifecycle_policy where tenant_id=$1 and legal_employer_id=$2 and status='active'
           and daterange(effective_from,effective_to,'[]') && daterange(current_date,current_date,'[]') limit 1`,
        [context.tenantId, before.company_id],
      );
      if (overlapping.rowCount)
        throw new HrApiError(
          409,
          "HR_LIFECYCLE_POLICY_ACTIVE_EXISTS",
          "An active lifecycle policy already governs this company today.",
        );
      await client.query(
        `update hr_employment_lifecycle_policy
            set status='active',activated_by=$3,activated_at=now(),updated_at=now(),
                activation_override_event_id=$4
          where tenant_id=$1 and id=$2`,
        [context.tenantId, policyId, context.actor.userId, activationOverrideEventId],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employment_lifecycle_policy.activate",
        {
          entityId: policyId,
          entityType: "employment_lifecycle_policy",
          before: { ...before, status: "approved" },
          after: {
            ...before,
            status: "active",
            reason: input.reason,
            super_admin_override: activationOverrideEventId !== null,
          },
        },
      );
      const result: HrEmploymentLifecyclePolicyActivationResult = {
        id: policyId,
        company_id: before.company_id,
        code: before.code,
        name: before.name,
        version: before.version,
        status: "active",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createEmployeeHireRequest(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeHireRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeHireRequestResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (
      !context.actor.permissions.includes("hr.employment_lifecycle.action") ||
      !context.actor.permissions.includes("hr.employment_relationship.create")
    )
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to request an employee hire.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:hire:${context.tenantId}:${employeeId}:${input.company_id}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/hire_requests`,
        fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrEmployeeHireRequestResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const eligibility = await client.query<{ policy_id: string; transition_id: string; resulting_state_id: string }>(
        `select policy.id as policy_id, transition.id as transition_id, transition.to_state_id as resulting_state_id
           from hr_employee_draft_approval approval
           join hr_employee_draft_scope scope on scope.tenant_id=approval.tenant_id and scope.employee_id=approval.employee_id
           join employee_assignment assignment on assignment.tenant_id=approval.tenant_id and assignment.id=$4
           join hr_master_record job on job.tenant_id=assignment.tenant_id and job.id=$5
           join hr_employment_lifecycle_policy policy on policy.tenant_id=approval.tenant_id and policy.legal_employer_id=scope.company_id
           join hr_employment_lifecycle_transition transition on transition.tenant_id=policy.tenant_id and transition.policy_id=policy.id and transition.event_type='hire'
          where approval.tenant_id=$1 and approval.employee_id=$2 and approval.state='approved'
            and scope.company_id=$3 and assignment.employee_id=$2 and assignment.company_id=$3 and assignment.assignment_status='profile_draft'
            and job.company_id=$3 and job.master_type='job' and job.status='active'
            and policy.status='active' and policy.effective_from<= $6 and (policy.effective_to is null or policy.effective_to >= $6)
            and transition.requires_approval=true
            and not exists (select 1 from hr_employment_relationship relationship join hr_employment_lifecycle_request request on request.tenant_id=relationship.tenant_id and request.relationship_id=relationship.id where relationship.tenant_id=$1 and relationship.employee_id=$2 and relationship.legal_employer_id=$3 and request.approval_state='pending')
          limit 1`,
        [
          context.tenantId,
          employeeId,
          input.company_id,
          input.profile_draft_assignment_id,
          input.job_id,
          input.effective_on,
        ],
      );
      const governing = eligibility.rows[0];
      if (!governing)
        throw new HrApiError(
          409,
          "HR_HIRE_NOT_ALLOWED",
          "An approved employee draft, active policy, active job, and matching profile draft assignment are required.",
        );
      const offerDate=await client.query("select 1 from hr_offer_employee_handoff h join hr_recruitment_offer o on o.tenant_id=h.tenant_id and o.id=h.offer_id where h.tenant_id=$1 and h.employee_id=$2 and (h.company_id<>$3 or o.joining_on<>$4::date)",[context.tenantId,employeeId,input.company_id,input.effective_on]);
      if(offerDate.rowCount)throw new HrApiError(409,"HR_OFFER_HIRE_MISMATCH","The hire company and effective date must match the accepted offer.");
      const relationshipId = `employment-relationship-${randomUUID()}`;
      const requestId = `employment-lifecycle-request-${randomUUID()}`;
      await client.query(
        `insert into hr_employment_relationship (id,tenant_id,employee_id,legal_employer_id,relationship_number,status,effective_from,lifecycle_policy_id,approval_state,created_by)
         values ($1,$2,$3,$4,$5,'draft',$6,$7,'pending',$8)`,
        [
          relationshipId,
          context.tenantId,
          employeeId,
          input.company_id,
          `HIRE-${randomUUID()}`,
          input.effective_on,
          governing.policy_id,
          context.actor.userId,
        ],
      );
      await client.query(
        `insert into hr_employment_lifecycle_request (id,tenant_id,relationship_id,transition_id,effective_on,reason,source_reference,resulting_state_id,approval_state,requested_by,job_id,profile_draft_assignment_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11)`,
        [
          requestId,
          context.tenantId,
          relationshipId,
          governing.transition_id,
          input.effective_on,
          input.reason,
          `hr:hire-request:${employeeId}`,
          governing.resulting_state_id,
          context.actor.userId,
          input.job_id,
          input.profile_draft_assignment_id,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employment_lifecycle.hire.request",
        {
          entityId: requestId,
          entityType: "employment_relationship",
          before: null,
          after: {
            employee_id: employeeId,
            company_id: input.company_id,
            relationship_id: relationshipId,
            status: "pending_approval",
          },
        },
      );
      const result: HrEmployeeHireRequestResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: input.company_id,
        relationship_id: relationshipId,
        lifecycle_request_id: requestId,
        status: "pending_approval",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeHireRequests(
    context: HrActorContext,
    query: HrEmployeeHireRequestDirectoryQuery,
  ): Promise<HrEmployeeHireRequestDirectory> {
    return this.read(context, "hr.employment_lifecycle.approve", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = [
        "request.tenant_id=$1",
        "relationship.legal_employer_id=$2",
        "request.approval_state='pending'",
        "transition.event_type='hire'",
      ];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\' or job.code ilike $${parameter} escape '\\' or job.name ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeeHireRequestReviewRow>(
        `${this.employeeHireRequestReviewSelect()}
          where ${filters.join(" and ")}
          order by request.requested_at,request.id
          limit $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => employeeHireRequestReview(row, context)) };
    });
  }

  async getEmployeeHireRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeeHireRequestReview> {
    return this.read(context, "hr.employment_lifecycle.approve", async (client) => {
      const result = await client.query<EmployeeHireRequestReviewRow>(
        `${this.employeeHireRequestReviewSelect()}
          where request.tenant_id=$1 and request.id=$2 and employee.id=$3 and transition.event_type='hire'
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=relationship.legal_employer_id and access.revoked_at is null
            )`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = result.rows[0];
      if (!row)
        throw new HrApiError(
          404,
          "HR_HIRE_REQUEST_NOT_FOUND",
          "The employee Hire request is unavailable in your company scope.",
        );
      return employeeHireRequestReview(row, context);
    });
  }

  async decideEmployeeHireRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeHireRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeHireDecisionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employment_lifecycle.approve"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide employee hire requests.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:hire-decision:${context.tenantId}:${requestId}`,
      ]);
      const path = `/api/v1/hr/employees/${employeeId}/hire_requests/${requestId}/decision`,
        fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrEmployeeHireDecisionResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const pending = await client.query<{
        company_id: string;
        relationship_id: string;
        requested_by: string;
        effective_on: string;
        reason: string;
        resulting_state_id: string;
        job_id: string;
        profile_draft_assignment_id: string;
        branch_id: string | null;
        department_id: string | null;
        designation_id: string;
        job_grade_id: string;
        cost_center_id: string;
        work_location_id: string;
        employment_type_id: string;
        employee_category_id: string;
        reporting_manager_id: string | null;
      }>(
        `select relationship.legal_employer_id as company_id,request.relationship_id,request.requested_by,request.effective_on::text,request.reason,request.resulting_state_id,request.job_id,request.profile_draft_assignment_id,assignment.branch_id,assignment.department_id,assignment.designation_id,assignment.job_grade_id,assignment.cost_center_id,assignment.work_location_id,assignment.employment_type_id,assignment.employee_category_id,assignment.reporting_manager_id
           from hr_employment_lifecycle_request request join hr_employment_relationship relationship on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id join employee_assignment assignment on assignment.tenant_id=request.tenant_id and assignment.id=request.profile_draft_assignment_id
          where request.tenant_id=$1 and request.id=$2 and relationship.employee_id=$3 and request.approval_state='pending'
            and exists (select 1 from security_user_company_access access where access.tenant_id=request.tenant_id and access.user_id=$4 and access.company_id=relationship.legal_employer_id and access.revoked_at is null) for update of request,relationship,assignment`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = pending.rows[0];
      if (!row)
        throw new HrApiError(409, "HR_HIRE_NOT_PENDING", "The hire request is not pending in your company scope.");
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employment_lifecycle.approve",
        makerActorIds: [row.requested_by],
        resourceType: "hr.employment_lifecycle_request",
        resourceId: requestId,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      await client.query(
        `update hr_employment_lifecycle_request
            set approval_state=$3,decided_by=$4,decided_at=now(),decision_comment=$5,
                approval_override_event_id=$6
          where tenant_id=$1 and id=$2`,
        [context.tenantId, requestId, input.decision, context.actor.userId, input.reason, approvalOverrideEventId],
      );
      let assignmentId: string | null = null;
      if (input.decision === "approved") {
        await this.requireOfferAssignmentMatch(client,context,employeeId,{company_id:row.company_id,branch_id:row.branch_id??undefined,department_id:row.department_id??undefined,designation_id:row.designation_id,job_grade_id:row.job_grade_id,cost_center_id:row.cost_center_id,work_location_id:row.work_location_id,employment_type_id:row.employment_type_id,employee_category_id:row.employee_category_id,reporting_manager_id:row.reporting_manager_id??undefined,effective_from:row.effective_on});
        await client.query(
          `insert into hr_employment_event (id,tenant_id,relationship_id,request_id,sequence,event_type,effective_on,previous_state_id,resulting_state_id,recorded_by,approved_by,approved_at,source_reference,reason) values ($1,$2,$3,$4,1,'hire',$5,(select id from hr_employment_lifecycle_state where tenant_id=$2 and policy_id=$6 and is_initial=true),$7,$8,$8,now(),$9,$10)`,
          [
            `employment-event-${randomUUID()}`,
            context.tenantId,
            row.relationship_id,
            requestId,
            row.effective_on,
            (
              await client.query<{ lifecycle_policy_id: string }>(
                `select lifecycle_policy_id from hr_employment_relationship where tenant_id=$1 and id=$2`,
                [context.tenantId, row.relationship_id],
              )
            ).rows[0]?.lifecycle_policy_id,
            row.resulting_state_id,
            context.actor.userId,
            `hr:hire-request:${requestId}`,
            row.reason,
          ],
        );
        await client.query(
          `update hr_employment_relationship set status='active',approval_state='approved',updated_at=now() where tenant_id=$1 and id=$2`,
          [context.tenantId, row.relationship_id],
        );
        assignmentId = `employee-assignment-${randomUUID()}`;
        await client.query(
          `insert into employee_assignment (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_id,job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,reporting_manager_id,effective_from,change_reason,created_by,employment_relationship_id,assignment_status,source_reference) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'initial_appointment',$16,$17,'active',$18)`,
          [
            assignmentId,
            context.tenantId,
            employeeId,
            row.company_id,
            row.branch_id,
            row.department_id,
            row.designation_id,
            row.job_id,
            row.job_grade_id,
            row.cost_center_id,
            row.work_location_id,
            row.employment_type_id,
            row.employee_category_id,
            row.reporting_manager_id,
            row.effective_on,
            context.actor.userId,
            row.relationship_id,
            `hr:hire-request:${requestId}`,
          ],
        );
        await client.query(`update employee set status='active',updated_at=now() where tenant_id=$1 and id=$2`, [
          context.tenantId,
          employeeId,
        ]);
        // Recruitment becomes Hired only after the governed employment activation succeeds in this transaction.
        const handoff=await client.query<{application_id:string}>("select application_id from hr_offer_employee_handoff where tenant_id=$1 and employee_id=$2 and company_id=$3",[context.tenantId,employeeId,row.company_id]);
        if(handoff.rows[0]) {
          const advanced=await client.query("update hr_recruitment_application set stage='hired',updated_at=now() where tenant_id=$1 and id=$2 and stage='selected' returning id",[context.tenantId,handoff.rows[0].application_id]);
          if(!advanced.rowCount)throw new HrApiError(409,"HR_OFFER_HIRE_STAGE_INVALID","The recruitment application must remain selected until hire approval.");
          await client.query("insert into hr_recruitment_application_event (id,tenant_id,application_id,actor_id,from_stage,to_stage,reason) values ($1,$2,$3,$4,'selected','hired',$5)",[`application-event-${randomUUID()}`,context.tenantId,handoff.rows[0].application_id,context.actor.userId,`Governed hire approved: ${requestId}`]);
        }
      } else
        await client.query(
          `update hr_employment_relationship set approval_state='rejected',updated_at=now() where tenant_id=$1 and id=$2`,
          [context.tenantId, row.relationship_id],
        );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employment_lifecycle.hire.decide",
        {
          entityId: requestId,
          entityType: "employment_relationship",
          before: { status: "pending" },
          after: {
            status: input.decision,
            relationship_id: row.relationship_id,
            assignment_id: assignmentId,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmployeeHireDecisionResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: row.company_id,
        relationship_id: row.relationship_id,
        status: input.decision,
        assignment_id: assignmentId,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeTransferRequests(
    context: HrActorContext,
    query: HrEmployeeTransferRequestDirectoryQuery,
  ): Promise<HrEmployeeTransferRequestDirectory> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["request.tenant_id=$1", "request.company_id=$2", "request.request_state='pending'"];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeeTransferRequestReviewRow>(
        `${this.employeeTransferRequestReviewSelect()}
          where ${filters.join(" and ")}
          order by request.requested_at,request.id
          limit $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => employeeTransferRequestReview(row, context)) };
    });
  }

  async getEmployeeTransferRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeeTransferRequestReview> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      const result = await client.query<EmployeeTransferRequestReviewRow>(
        `${this.employeeTransferRequestReviewSelect()}
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      if (!result.rows[0])
        throw new HrApiError(
          404,
          "HR_TRANSFER_NOT_FOUND",
          "The transfer request is unavailable in your company scope.",
        );
      return employeeTransferRequestReview(result.rows[0], context);
    });
  }

  async createEmployeeTransferRequest(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeTransferRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeTransferRequestResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.transfer"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to request employee transfers.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-transfer:${context.tenantId}:${input.source_assignment_id}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/transfer_requests`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeTransferRequestResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (input.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_TRANSFER_EFFECTIVE_DATE_REQUIRED",
          "This transfer workflow currently requires today's effective date.",
        );
      const source = await client.query<{ relationship_id: string }>(
        `select assignment.employment_relationship_id as relationship_id
           from employee_assignment assignment
           join employee on employee.tenant_id=assignment.tenant_id and employee.id=assignment.employee_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=assignment.tenant_id and relationship.id=assignment.employment_relationship_id
          where assignment.tenant_id=$1 and assignment.id=$2 and assignment.employee_id=$3
            and assignment.company_id=$4 and assignment.assignment_status='active'
            and assignment.effective_to is null and assignment.effective_from<current_date
            and employee.status in ('active','probation','confirmed','suspended')
            and relationship.status='active'
          for update of assignment,employee,relationship`,
        [context.tenantId, input.source_assignment_id, employeeId, input.company_id],
      );
      if (!source.rows[0]?.relationship_id)
        throw new HrApiError(
          409,
          "HR_TRANSFER_SOURCE_UNAVAILABLE",
          "The source assignment is no longer eligible for transfer.",
        );
      const pending = await client.query(
        `select 1 from hr_employee_transfer_request
          where tenant_id=$1 and source_assignment_id=$2 and request_state='pending'`,
        [context.tenantId, input.source_assignment_id],
      );
      if (pending.rowCount)
        throw new HrApiError(
          409,
          "HR_TRANSFER_ALREADY_PENDING",
          "A transfer request is already pending for this assignment.",
        );
      const id = `employee-transfer-request-${randomUUID()}`;
      await client.query(
        `insert into hr_employee_transfer_request
          (tenant_id,id,employee_id,company_id,relationship_id,source_assignment_id,
           proposed_branch_id,proposed_department_id,proposed_job_id,proposed_designation_id,
           proposed_job_grade_id,proposed_cost_center_id,proposed_work_location_id,
           proposed_employment_type_id,proposed_employee_category_id,proposed_reporting_manager_id,
           effective_on,reason,requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          context.tenantId,
          id,
          employeeId,
          input.company_id,
          source.rows[0].relationship_id,
          input.source_assignment_id,
          input.branch_id ?? null,
          input.department_id ?? null,
          input.job_id,
          input.designation_id,
          input.job_grade_id,
          input.cost_center_id,
          input.work_location_id,
          input.employment_type_id,
          input.employee_category_id,
          input.reporting_manager_id ?? null,
          input.effective_on,
          input.reason,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.transfer.request",
        {
          entityId: id,
          before: null,
          after: {
            employee_id: employeeId,
            company_id: input.company_id,
            source_assignment_id: input.source_assignment_id,
            effective_on: input.effective_on,
            status: "pending",
          },
        },
      );
      const result: HrEmployeeTransferRequestResult = {
        id,
        employee_id: employeeId,
        company_id: input.company_id,
        source_assignment_id: input.source_assignment_id,
        status: "pending",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async decideEmployeeTransferRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeTransferRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeTransferDecisionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide employee transfers.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-transfer:${context.tenantId}:${requestId}`,
      ]);
      const path = `/api/v1/hr/employees/${employeeId}/transfer_requests/${requestId}/decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeTransferDecisionResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const pending = await client.query<{
        company_id: string;
        relationship_id: string;
        source_assignment_id: string;
        requested_by: string;
        effective_on: string;
        proposed_branch_id: string | null;
        proposed_department_id: string | null;
        proposed_job_id: string;
        proposed_designation_id: string;
        proposed_job_grade_id: string;
        proposed_cost_center_id: string;
        proposed_work_location_id: string;
        proposed_employment_type_id: string;
        proposed_employee_category_id: string;
        proposed_reporting_manager_id: string | null;
      }>(
        `select request.company_id,request.relationship_id,request.source_assignment_id,
                request.requested_by,request.effective_on::text,request.proposed_branch_id,
                request.proposed_department_id,request.proposed_job_id,request.proposed_designation_id,
                request.proposed_job_grade_id,request.proposed_cost_center_id,
                request.proposed_work_location_id,request.proposed_employment_type_id,
                request.proposed_employee_category_id,request.proposed_reporting_manager_id
           from hr_employee_transfer_request request
           join employee_assignment assignment
             on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and request.request_state='pending' and assignment.assignment_status='active'
            and assignment.effective_to is null
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )
          for update of request,assignment`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = pending.rows[0];
      if (!row)
        throw new HrApiError(
          409,
          "HR_TRANSFER_NOT_PENDING",
          "The transfer request is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employee_assignment.change",
        makerActorIds: [row.requested_by],
        resourceType: "hr.employee_transfer_request",
        resourceId: requestId,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (row.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_TRANSFER_EFFECTIVE_DATE_REQUIRED",
          "This transfer can only be decided on its effective date.",
        );
      let assignmentId: string | null = null;
      if (input.decision === "approved") {
        await client.query(
          `update employee_assignment
              set effective_to=($3::date - 1),assignment_status='ended',updated_at=now()
            where tenant_id=$1 and id=$2`,
          [context.tenantId, row.source_assignment_id, row.effective_on],
        );
        assignmentId = `employee-assignment-${randomUUID()}`;
        await client.query(
          `insert into employee_assignment
            (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_id,
             job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,
             reporting_manager_id,effective_from,change_reason,created_by,employment_relationship_id,
             assignment_status,source_reference)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'transfer',$16,$17,'active',$18)`,
          [
            assignmentId,
            context.tenantId,
            employeeId,
            row.company_id,
            row.proposed_branch_id,
            row.proposed_department_id,
            row.proposed_designation_id,
            row.proposed_job_id,
            row.proposed_job_grade_id,
            row.proposed_cost_center_id,
            row.proposed_work_location_id,
            row.proposed_employment_type_id,
            row.proposed_employee_category_id,
            row.proposed_reporting_manager_id,
            row.effective_on,
            context.actor.userId,
            row.relationship_id,
            `hr:transfer-request:${requestId}`,
          ],
        );
        await client.query(
          `insert into employee_assignment_org_unit
            (tenant_id,assignment_id,organization_type,organization_unit_id,created_by)
           select tenant_id,$3,organization_type,organization_unit_id,$4
             from employee_assignment_org_unit
            where tenant_id=$1 and assignment_id=$2
              and organization_type not in ('branch','department')
           on conflict do nothing`,
          [context.tenantId, row.source_assignment_id, assignmentId, context.actor.userId],
        );
      }
      await client.query(
        `update hr_employee_transfer_request
            set request_state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,
                projected_assignment_id=$6,approval_override_event_id=$7,row_version=row_version+1
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          requestId,
          input.decision,
          context.actor.userId,
          input.reason,
          assignmentId,
          approvalOverrideEventId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.transfer.decide",
        {
          entityId: requestId,
          before: { status: "pending", source_assignment_id: row.source_assignment_id },
          after: {
            status: input.decision,
            assignment_id: assignmentId,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmployeeTransferDecisionResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: row.company_id,
        source_assignment_id: row.source_assignment_id,
        status: input.decision,
        assignment_id: assignmentId,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeePromotionRequests(
    context: HrActorContext,
    query: HrEmployeePromotionRequestDirectoryQuery,
  ): Promise<HrEmployeePromotionRequestDirectory> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["request.tenant_id=$1", "request.company_id=$2", "request.request_state='pending'"];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeePromotionRequestReviewRow>(
        `${this.employeePromotionRequestReviewSelect()}
          where ${filters.join(" and ")}
          order by request.requested_at,request.id
          limit $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => employeePromotionRequestReview(row, context)) };
    });
  }

  async getEmployeePromotionRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeePromotionRequestReview> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      const result = await client.query<EmployeePromotionRequestReviewRow>(
        `${this.employeePromotionRequestReviewSelect()}
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      if (!result.rows[0])
        throw new HrApiError(
          404,
          "HR_PROMOTION_NOT_FOUND",
          "The promotion request is unavailable in your company scope.",
        );
      return employeePromotionRequestReview(result.rows[0], context);
    });
  }

  async createEmployeePromotionRequest(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeePromotionRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeePromotionRequestResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to request employee promotions.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-promotion:${context.tenantId}:${input.source_assignment_id}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/promotion_requests`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeePromotionRequestResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (input.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_PROMOTION_EFFECTIVE_DATE_REQUIRED",
          "This promotion workflow currently requires today's effective date.",
        );
      const source = await client.query<{
        relationship_id: string;
        job_id: string;
        designation_id: string;
        job_grade_id: string;
      }>(
        `select assignment.employment_relationship_id as relationship_id,
                assignment.job_id,assignment.designation_id,assignment.job_grade_id
           from employee_assignment assignment
           join employee on employee.tenant_id=assignment.tenant_id and employee.id=assignment.employee_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=assignment.tenant_id and relationship.id=assignment.employment_relationship_id
          where assignment.tenant_id=$1 and assignment.id=$2 and assignment.employee_id=$3
            and assignment.company_id=$4 and assignment.assignment_status='active'
            and assignment.effective_to is null and assignment.effective_from<current_date
            and employee.status in ('active','probation','confirmed','suspended')
            and relationship.status='active'
          for update of assignment,employee,relationship`,
        [context.tenantId, input.source_assignment_id, employeeId, input.company_id],
      );
      const sourceRow = source.rows[0];
      if (!sourceRow?.relationship_id)
        throw new HrApiError(
          409,
          "HR_PROMOTION_SOURCE_UNAVAILABLE",
          "The source assignment is no longer eligible for promotion.",
        );
      if (
        sourceRow.job_id === input.job_id &&
        sourceRow.designation_id === input.designation_id &&
        sourceRow.job_grade_id === input.job_grade_id
      )
        throw new HrApiError(
          409,
          "HR_PROMOTION_CHANGE_REQUIRED",
          "A promotion must change the job, designation, or job grade.",
        );
      const pending = await client.query(
        `select 1 from hr_employee_promotion_request
          where tenant_id=$1 and source_assignment_id=$2 and request_state='pending'`,
        [context.tenantId, input.source_assignment_id],
      );
      if (pending.rowCount)
        throw new HrApiError(
          409,
          "HR_PROMOTION_ALREADY_PENDING",
          "A promotion request is already pending for this assignment.",
        );
      const id = `employee-promotion-request-${randomUUID()}`;
      await client.query(
        `insert into hr_employee_promotion_request
          (tenant_id,id,employee_id,company_id,relationship_id,source_assignment_id,
           proposed_job_id,proposed_designation_id,proposed_job_grade_id,effective_on,reason,requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          context.tenantId,
          id,
          employeeId,
          input.company_id,
          sourceRow.relationship_id,
          input.source_assignment_id,
          input.job_id,
          input.designation_id,
          input.job_grade_id,
          input.effective_on,
          input.reason,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.promotion.request",
        {
          entityId: id,
          before: null,
          after: {
            employee_id: employeeId,
            company_id: input.company_id,
            source_assignment_id: input.source_assignment_id,
            effective_on: input.effective_on,
            status: "pending",
          },
        },
      );
      const result: HrEmployeePromotionRequestResult = {
        id,
        employee_id: employeeId,
        company_id: input.company_id,
        source_assignment_id: input.source_assignment_id,
        status: "pending",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_PROMOTION_CONTEXT_INVALID",
          "The promotion context is no longer valid. Refresh the employee assignment and active master data.",
        );
      if (code === "23505")
        throw new HrApiError(
          409,
          "HR_PROMOTION_ALREADY_PENDING",
          "A promotion request is already pending for this assignment.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async decideEmployeePromotionRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeePromotionRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeePromotionDecisionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide employee promotions.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-promotion:${context.tenantId}:${requestId}`,
      ]);
      const path = `/api/v1/hr/employees/${employeeId}/promotion_requests/${requestId}/decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeePromotionDecisionResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const pending = await client.query<{
        company_id: string;
        relationship_id: string;
        source_assignment_id: string;
        requested_by: string;
        effective_on: string;
        proposed_job_id: string;
        proposed_designation_id: string;
        proposed_job_grade_id: string;
        branch_id: string | null;
        department_id: string | null;
        cost_center_id: string;
        work_location_id: string;
        employment_type_id: string;
        employee_category_id: string;
        reporting_manager_id: string | null;
      }>(
        `select request.company_id,request.relationship_id,request.source_assignment_id,
                request.requested_by,request.effective_on::text,request.proposed_job_id,
                request.proposed_designation_id,request.proposed_job_grade_id,
                assignment.branch_id,assignment.department_id,assignment.cost_center_id,
                assignment.work_location_id,assignment.employment_type_id,
                assignment.employee_category_id,assignment.reporting_manager_id
           from hr_employee_promotion_request request
           join employee_assignment assignment
             on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and request.request_state='pending' and assignment.assignment_status='active'
            and assignment.effective_to is null and relationship.status='active'
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )
          for update of request,assignment,relationship`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = pending.rows[0];
      if (!row)
        throw new HrApiError(
          409,
          "HR_PROMOTION_NOT_PENDING",
          "The promotion request is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employee_assignment.change",
        makerActorIds: [row.requested_by],
        resourceType: "hr.employee_promotion_request",
        resourceId: requestId,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (row.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_PROMOTION_EFFECTIVE_DATE_REQUIRED",
          "This promotion can only be decided on its effective date.",
        );
      let assignmentId: string | null = null;
      if (input.decision === "approved") {
        await client.query(
          `update employee_assignment
              set effective_to=($3::date - 1),assignment_status='ended',updated_at=now()
            where tenant_id=$1 and id=$2`,
          [context.tenantId, row.source_assignment_id, row.effective_on],
        );
        assignmentId = `employee-assignment-${randomUUID()}`;
        await client.query(
          `insert into employee_assignment
            (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_id,
             job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,
             reporting_manager_id,effective_from,change_reason,created_by,employment_relationship_id,
             assignment_status,source_reference)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'promotion',$16,$17,'active',$18)`,
          [
            assignmentId,
            context.tenantId,
            employeeId,
            row.company_id,
            row.branch_id,
            row.department_id,
            row.proposed_designation_id,
            row.proposed_job_id,
            row.proposed_job_grade_id,
            row.cost_center_id,
            row.work_location_id,
            row.employment_type_id,
            row.employee_category_id,
            row.reporting_manager_id,
            row.effective_on,
            context.actor.userId,
            row.relationship_id,
            `hr:promotion-request:${requestId}`,
          ],
        );
      }
      await client.query(
        `update hr_employee_promotion_request
            set request_state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,
                projected_assignment_id=$6,approval_override_event_id=$7,row_version=row_version+1
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          requestId,
          input.decision,
          context.actor.userId,
          input.reason,
          assignmentId,
          approvalOverrideEventId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.promotion.decide",
        {
          entityId: requestId,
          before: { status: "pending", source_assignment_id: row.source_assignment_id },
          after: {
            status: input.decision,
            assignment_id: assignmentId,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmployeePromotionDecisionResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: row.company_id,
        source_assignment_id: row.source_assignment_id,
        status: input.decision,
        assignment_id: assignmentId,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_PROMOTION_CONTEXT_INVALID",
          "The promotion context is no longer valid. Refresh the request and active assignment data.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeManagerChangeRequests(
    context: HrActorContext,
    query: HrEmployeeManagerChangeRequestDirectoryQuery,
  ): Promise<HrEmployeeManagerChangeRequestDirectory> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["request.tenant_id=$1", "request.company_id=$2", "request.request_state='pending'"];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeeManagerChangeRequestReviewRow>(
        `${this.employeeManagerChangeRequestReviewSelect()}
          where ${filters.join(" and ")}
          order by request.requested_at,request.id
          limit $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => employeeManagerChangeRequestReview(row, context)) };
    });
  }

  async getEmployeeManagerChangeRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeeManagerChangeRequestReview> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      const result = await client.query<EmployeeManagerChangeRequestReviewRow>(
        `${this.employeeManagerChangeRequestReviewSelect()}
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      if (!result.rows[0])
        throw new HrApiError(
          404,
          "HR_MANAGER_CHANGE_NOT_FOUND",
          "The manager-change request is unavailable in your company scope.",
        );
      return employeeManagerChangeRequestReview(result.rows[0], context);
    });
  }

  async createEmployeeManagerChangeRequest(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeManagerChangeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeManagerChangeRequestResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.manager_change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to request reporting-manager changes.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-manager-change:${context.tenantId}:${input.source_assignment_id}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/manager_change_requests`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeManagerChangeRequestResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (input.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_EFFECTIVE_DATE_REQUIRED",
          "This manager-change workflow currently requires today's effective date.",
        );
      const source = await client.query<{
        relationship_id: string;
        reporting_manager_id: string | null;
      }>(
        `select assignment.employment_relationship_id as relationship_id,assignment.reporting_manager_id
           from employee_assignment assignment
           join employee on employee.tenant_id=assignment.tenant_id and employee.id=assignment.employee_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=assignment.tenant_id and relationship.id=assignment.employment_relationship_id
          where assignment.tenant_id=$1 and assignment.id=$2 and assignment.employee_id=$3
            and assignment.company_id=$4 and assignment.assignment_status='active'
            and assignment.effective_to is null and assignment.effective_from<current_date
            and employee.status in ('active','probation','confirmed','suspended')
            and relationship.status='active'
          for update of assignment,employee,relationship`,
        [context.tenantId, input.source_assignment_id, employeeId, input.company_id],
      );
      const sourceRow = source.rows[0];
      if (!sourceRow?.relationship_id)
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_SOURCE_UNAVAILABLE",
          "The source assignment is no longer eligible for a manager change.",
        );
      if (sourceRow.reporting_manager_id === input.reporting_manager_id)
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_REQUIRED",
          "A manager-change request must alter the reporting manager.",
        );
      if (input.reporting_manager_id === employeeId)
        throw new HrApiError(409, "HR_MANAGER_CHANGE_SELF_FORBIDDEN", "An employee cannot report to themselves.");
      if (input.reporting_manager_id !== null) {
        const manager = await client.query(
          `select 1
             from hr_employment_relationship relationship
             join employee_assignment assignment
               on assignment.tenant_id=relationship.tenant_id
              and assignment.employment_relationship_id=relationship.id
            where relationship.tenant_id=$1 and relationship.employee_id=$2
              and relationship.legal_employer_id=$3 and relationship.status='active'
              and relationship.effective_from<=$4::date
              and (relationship.effective_to is null or relationship.effective_to>=$4::date)
              and assignment.employee_id=$2 and assignment.company_id=$3
              and assignment.assignment_status='active' and assignment.effective_from<=$4::date
              and (assignment.effective_to is null or assignment.effective_to>=$4::date)
            limit 1`,
          [context.tenantId, input.reporting_manager_id, input.company_id, input.effective_on],
        );
        if (!manager.rowCount)
          throw new HrApiError(
            409,
            "HR_MANAGER_CHANGE_MANAGER_UNAVAILABLE",
            "The proposed reporting manager is not effective in this legal employer.",
          );
        const cycle = await client.query(
          `with recursive reporting_chain(employee_id,reporting_manager_id) as (
             select assignment.employee_id,assignment.reporting_manager_id
               from employee_assignment assignment
              where assignment.tenant_id=$1 and assignment.employee_id=$2
                and assignment.company_id=$3 and assignment.assignment_status='active'
                and assignment.effective_from<=$4::date
                and (assignment.effective_to is null or assignment.effective_to>=$4::date)
             union all
             select assignment.employee_id,assignment.reporting_manager_id
               from employee_assignment assignment
               join reporting_chain chain on assignment.employee_id=chain.reporting_manager_id
              where assignment.tenant_id=$1 and assignment.company_id=$3
                and assignment.assignment_status='active' and assignment.effective_from<=$4::date
                and (assignment.effective_to is null or assignment.effective_to>=$4::date)
           )
           select 1 from reporting_chain where reporting_manager_id=$5 limit 1`,
          [context.tenantId, input.reporting_manager_id, input.company_id, input.effective_on, employeeId],
        );
        if (cycle.rowCount)
          throw new HrApiError(
            409,
            "HR_MANAGER_CHANGE_CYCLE_FORBIDDEN",
            "The proposed reporting line would create a management cycle.",
          );
      }
      const pending = await client.query(
        `select 1 from hr_employee_manager_change_request
          where tenant_id=$1 and source_assignment_id=$2 and request_state='pending'`,
        [context.tenantId, input.source_assignment_id],
      );
      if (pending.rowCount)
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_ALREADY_PENDING",
          "A manager-change request is already pending for this assignment.",
        );
      const id = `employee-manager-change-request-${randomUUID()}`;
      await client.query(
        `insert into hr_employee_manager_change_request
          (tenant_id,id,employee_id,company_id,relationship_id,source_assignment_id,
           proposed_reporting_manager_id,clear_reporting_manager,effective_on,reason,requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          context.tenantId,
          id,
          employeeId,
          input.company_id,
          sourceRow.relationship_id,
          input.source_assignment_id,
          input.reporting_manager_id,
          input.clear_reporting_manager,
          input.effective_on,
          input.reason,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.manager_change.request",
        {
          entityId: id,
          before: { reporting_manager_id: sourceRow.reporting_manager_id },
          after: {
            employee_id: employeeId,
            company_id: input.company_id,
            source_assignment_id: input.source_assignment_id,
            reporting_manager_id: input.reporting_manager_id,
            clear_reporting_manager: input.clear_reporting_manager,
            effective_on: input.effective_on,
            status: "pending",
          },
        },
      );
      const result: HrEmployeeManagerChangeRequestResult = {
        id,
        employee_id: employeeId,
        company_id: input.company_id,
        source_assignment_id: input.source_assignment_id,
        status: "pending",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_CONTEXT_INVALID",
          "The manager-change context is no longer valid. Refresh the employee assignment and manager directory.",
        );
      if (code === "23505")
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_ALREADY_PENDING",
          "A manager-change request is already pending for this assignment.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async decideEmployeeManagerChangeRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeManagerChangeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeManagerChangeDecisionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide reporting-manager changes.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-manager-change:${context.tenantId}:${requestId}`,
      ]);
      const path = `/api/v1/hr/employees/${employeeId}/manager_change_requests/${requestId}/decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeManagerChangeDecisionResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const pending = await client.query<{
        company_id: string;
        relationship_id: string;
        source_assignment_id: string;
        requested_by: string;
        effective_on: string;
        proposed_reporting_manager_id: string | null;
        branch_id: string | null;
        department_id: string | null;
        designation_id: string;
        job_id: string;
        job_grade_id: string;
        cost_center_id: string;
        work_location_id: string;
        employment_type_id: string;
        employee_category_id: string;
      }>(
        `select request.company_id,request.relationship_id,request.source_assignment_id,
                request.requested_by,request.effective_on::text,request.proposed_reporting_manager_id,
                assignment.branch_id,assignment.department_id,assignment.designation_id,assignment.job_id,
                assignment.job_grade_id,assignment.cost_center_id,assignment.work_location_id,
                assignment.employment_type_id,assignment.employee_category_id
           from hr_employee_manager_change_request request
           join employee_assignment assignment
             on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and request.request_state='pending' and assignment.assignment_status='active'
            and assignment.effective_to is null and relationship.status='active'
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )
          for update of request,assignment,relationship`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = pending.rows[0];
      if (!row)
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_NOT_PENDING",
          "The manager-change request is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employee_assignment.change",
        makerActorIds: [row.requested_by],
        resourceType: "hr.employee_manager_change_request",
        resourceId: requestId,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (row.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_EFFECTIVE_DATE_REQUIRED",
          "This manager change can only be decided on its effective date.",
        );
      let assignmentId: string | null = null;
      if (input.decision === "approved") {
        await client.query(
          `update employee_assignment
              set effective_to=($3::date - 1),assignment_status='ended',updated_at=now()
            where tenant_id=$1 and id=$2`,
          [context.tenantId, row.source_assignment_id, row.effective_on],
        );
        assignmentId = `employee-assignment-${randomUUID()}`;
        await client.query(
          `insert into employee_assignment
            (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_id,
             job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,
             reporting_manager_id,effective_from,change_reason,created_by,employment_relationship_id,
             assignment_status,source_reference)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'manager_change',$16,$17,'active',$18)`,
          [
            assignmentId,
            context.tenantId,
            employeeId,
            row.company_id,
            row.branch_id,
            row.department_id,
            row.designation_id,
            row.job_id,
            row.job_grade_id,
            row.cost_center_id,
            row.work_location_id,
            row.employment_type_id,
            row.employee_category_id,
            row.proposed_reporting_manager_id,
            row.effective_on,
            context.actor.userId,
            row.relationship_id,
            `hr:manager-change-request:${requestId}`,
          ],
        );
      }
      await client.query(
        `update hr_employee_manager_change_request
            set request_state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,
                projected_assignment_id=$6,approval_override_event_id=$7,row_version=row_version+1
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          requestId,
          input.decision,
          context.actor.userId,
          input.reason,
          assignmentId,
          approvalOverrideEventId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.manager_change.decide",
        {
          entityId: requestId,
          before: { status: "pending", source_assignment_id: row.source_assignment_id },
          after: {
            status: input.decision,
            assignment_id: assignmentId,
            reporting_manager_id: row.proposed_reporting_manager_id,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmployeeManagerChangeDecisionResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: row.company_id,
        source_assignment_id: row.source_assignment_id,
        status: input.decision,
        assignment_id: assignmentId,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_MANAGER_CHANGE_CONTEXT_INVALID",
          "The manager-change context is no longer valid. Refresh the request and active assignment data.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeWorkLocationChangeRequests(
    context: HrActorContext,
    query: HrEmployeeWorkLocationChangeRequestDirectoryQuery,
  ): Promise<HrEmployeeWorkLocationChangeRequestDirectory> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["request.tenant_id=$1", "request.company_id=$2", "request.request_state='pending'"];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeeWorkLocationChangeRequestReviewRow>(
        `${this.employeeWorkLocationChangeRequestReviewSelect()}
          where ${filters.join(" and ")}
          order by request.requested_at,request.id
          limit $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => employeeWorkLocationChangeRequestReview(row, context)) };
    });
  }

  async getEmployeeWorkLocationChangeRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeeWorkLocationChangeRequestReview> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      const result = await client.query<EmployeeWorkLocationChangeRequestReviewRow>(
        `${this.employeeWorkLocationChangeRequestReviewSelect()}
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      if (!result.rows[0])
        throw new HrApiError(
          404,
          "HR_WORK_LOCATION_CHANGE_NOT_FOUND",
          "The work-location-change request is unavailable in your company scope.",
        );
      return employeeWorkLocationChangeRequestReview(result.rows[0], context);
    });
  }

  async createEmployeeWorkLocationChangeRequest(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeWorkLocationChangeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeWorkLocationChangeRequestResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to request work-location changes.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-work-location-change:${context.tenantId}:${input.source_assignment_id}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/work_location_change_requests`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeWorkLocationChangeRequestResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (input.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_EFFECTIVE_DATE_REQUIRED",
          "This work-location-change workflow currently requires today's effective date.",
        );
      const source = await client.query<{
        relationship_id: string;
        work_location_id: string;
      }>(
        `select assignment.employment_relationship_id as relationship_id,assignment.work_location_id
           from employee_assignment assignment
           join employee on employee.tenant_id=assignment.tenant_id and employee.id=assignment.employee_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=assignment.tenant_id and relationship.id=assignment.employment_relationship_id
          where assignment.tenant_id=$1 and assignment.id=$2 and assignment.employee_id=$3
            and assignment.company_id=$4 and assignment.assignment_status='active'
            and assignment.effective_to is null and assignment.effective_from<current_date
            and employee.status in ('active','probation','confirmed','suspended')
            and relationship.status='active'
          for update of assignment,employee,relationship`,
        [context.tenantId, input.source_assignment_id, employeeId, input.company_id],
      );
      const sourceRow = source.rows[0];
      if (!sourceRow?.relationship_id)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_SOURCE_UNAVAILABLE",
          "The source assignment is no longer eligible for a work-location change.",
        );
      if (sourceRow.work_location_id === input.work_location_id)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_REQUIRED",
          "A work-location-change request must select a different work location.",
        );
      const target = await client.query<{ profile_id: string }>(
        `select profile.id as profile_id
           from hr_master_record location
           join hr_work_location_profile profile
             on profile.tenant_id=location.tenant_id
            and profile.company_id=location.company_id
            and profile.work_location_id=location.id
          where location.tenant_id=$1 and location.id=$2 and location.company_id=$3
            and location.master_type='work_location' and location.status='active'
            and profile.state in ('approved','active')
            and profile.effective_from<=$4::date
            and (profile.effective_to is null or profile.effective_to>=$4::date)
          order by profile.effective_from desc,profile.id
          limit 1
          for share of location,profile`,
        [context.tenantId, input.work_location_id, input.company_id, input.effective_on],
      );
      const profileId = target.rows[0]?.profile_id;
      if (!profileId)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_JURISDICTION_REQUIRED",
          "The target work location requires an effective approved jurisdiction profile.",
        );
      const pending = await client.query(
        `select 1 from hr_employee_work_location_change_request
          where tenant_id=$1 and source_assignment_id=$2 and request_state='pending'`,
        [context.tenantId, input.source_assignment_id],
      );
      if (pending.rowCount)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_ALREADY_PENDING",
          "A work-location-change request is already pending for this assignment.",
        );
      const id = `employee-work-location-change-request-${randomUUID()}`;
      await client.query(
        `insert into hr_employee_work_location_change_request
          (tenant_id,id,employee_id,company_id,relationship_id,source_assignment_id,
           current_work_location_id,proposed_work_location_id,proposed_work_location_profile_id,
           effective_on,reason,requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          context.tenantId,
          id,
          employeeId,
          input.company_id,
          sourceRow.relationship_id,
          input.source_assignment_id,
          sourceRow.work_location_id,
          input.work_location_id,
          profileId,
          input.effective_on,
          input.reason,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.work_location_change.request",
        {
          entityId: id,
          before: { work_location_id: sourceRow.work_location_id },
          after: {
            employee_id: employeeId,
            company_id: input.company_id,
            source_assignment_id: input.source_assignment_id,
            work_location_id: input.work_location_id,
            jurisdiction_profile_id: profileId,
            effective_on: input.effective_on,
            status: "pending",
          },
        },
      );
      const result: HrEmployeeWorkLocationChangeRequestResult = {
        id,
        employee_id: employeeId,
        company_id: input.company_id,
        source_assignment_id: input.source_assignment_id,
        status: "pending",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_CONTEXT_INVALID",
          "The work-location-change context is no longer valid. Refresh the assignment and location data.",
        );
      if (code === "23505")
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_ALREADY_PENDING",
          "A work-location-change request is already pending for this assignment.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async decideEmployeeWorkLocationChangeRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeWorkLocationChangeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeWorkLocationChangeDecisionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide work-location changes.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-work-location-change:${context.tenantId}:${requestId}`,
      ]);
      const path = `/api/v1/hr/employees/${employeeId}/work_location_change_requests/${requestId}/decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeWorkLocationChangeDecisionResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const pending = await client.query<{
        company_id: string;
        relationship_id: string;
        source_assignment_id: string;
        requested_by: string;
        effective_on: string;
        proposed_work_location_id: string;
        proposed_work_location_profile_id: string;
        profile_state: string;
        profile_effective_from: string;
        profile_effective_to: string | null;
        branch_id: string | null;
        department_id: string | null;
        designation_id: string;
        job_id: string;
        job_grade_id: string;
        cost_center_id: string;
        employment_type_id: string;
        employee_category_id: string;
        reporting_manager_id: string | null;
      }>(
        `select request.company_id,request.relationship_id,request.source_assignment_id,
                request.requested_by,request.effective_on::text,request.proposed_work_location_id,
                request.proposed_work_location_profile_id,profile.state as profile_state,
                profile.effective_from::text as profile_effective_from,
                profile.effective_to::text as profile_effective_to,
                assignment.branch_id,assignment.department_id,assignment.designation_id,assignment.job_id,
                assignment.job_grade_id,assignment.cost_center_id,assignment.employment_type_id,
                assignment.employee_category_id,assignment.reporting_manager_id
           from hr_employee_work_location_change_request request
           join employee_assignment assignment
             on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id
           join hr_work_location_profile profile
             on profile.tenant_id=request.tenant_id
            and profile.id=request.proposed_work_location_profile_id
            and profile.company_id=request.company_id
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and request.request_state='pending' and assignment.assignment_status='active'
            and assignment.effective_to is null and relationship.status='active'
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )
          for update of request,assignment,relationship,profile`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = pending.rows[0];
      if (!row)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_NOT_PENDING",
          "The work-location-change request is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employee_assignment.change",
        makerActorIds: [row.requested_by],
        resourceType: "hr.employee_work_location_change_request",
        resourceId: requestId,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (row.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_EFFECTIVE_DATE_REQUIRED",
          "This work-location change can only be decided on its effective date.",
        );
      const jurisdictionReady =
        ["approved", "active"].includes(row.profile_state) &&
        row.profile_effective_from <= row.effective_on &&
        (row.profile_effective_to === null || row.profile_effective_to >= row.effective_on);
      if (input.decision === "approved" && !jurisdictionReady)
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_JURISDICTION_REQUIRED",
          "The target work location no longer has effective approved jurisdiction evidence.",
        );
      let assignmentId: string | null = null;
      if (input.decision === "approved") {
        await client.query(
          `update employee_assignment
              set effective_to=($3::date - 1),assignment_status='ended',updated_at=now()
            where tenant_id=$1 and id=$2`,
          [context.tenantId, row.source_assignment_id, row.effective_on],
        );
        assignmentId = `employee-assignment-${randomUUID()}`;
        await client.query(
          `insert into employee_assignment
            (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_id,
             job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,
             reporting_manager_id,effective_from,change_reason,created_by,employment_relationship_id,
             assignment_status,source_reference)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'work_location_change',$16,$17,'active',$18)`,
          [
            assignmentId,
            context.tenantId,
            employeeId,
            row.company_id,
            row.branch_id,
            row.department_id,
            row.designation_id,
            row.job_id,
            row.job_grade_id,
            row.cost_center_id,
            row.proposed_work_location_id,
            row.employment_type_id,
            row.employee_category_id,
            row.reporting_manager_id,
            row.effective_on,
            context.actor.userId,
            row.relationship_id,
            `hr:work-location-change-request:${requestId}`,
          ],
        );
        await client.query(
          `insert into employee_assignment_org_unit
            (tenant_id,assignment_id,organization_type,organization_unit_id,created_by)
           select tenant_id,$3,organization_type,organization_unit_id,$4
             from employee_assignment_org_unit
            where tenant_id=$1 and assignment_id=$2
           on conflict do nothing`,
          [context.tenantId, row.source_assignment_id, assignmentId, context.actor.userId],
        );
      }
      await client.query(
        `update hr_employee_work_location_change_request
            set request_state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,
                projected_assignment_id=$6,approval_override_event_id=$7,row_version=row_version+1
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          requestId,
          input.decision,
          context.actor.userId,
          input.reason,
          assignmentId,
          approvalOverrideEventId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.work_location_change.decide",
        {
          entityId: requestId,
          before: { status: "pending", source_assignment_id: row.source_assignment_id },
          after: {
            status: input.decision,
            assignment_id: assignmentId,
            work_location_id: row.proposed_work_location_id,
            jurisdiction_profile_id: row.proposed_work_location_profile_id,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmployeeWorkLocationChangeDecisionResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: row.company_id,
        source_assignment_id: row.source_assignment_id,
        status: input.decision,
        assignment_id: assignmentId,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_WORK_LOCATION_CHANGE_CONTEXT_INVALID",
          "The work-location-change context is no longer valid. Refresh the request and active assignment data.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async listEmployeeOrganizationPlacementChangeRequests(
    context: HrActorContext,
    query: HrEmployeeOrganizationPlacementChangeRequestDirectoryQuery,
  ): Promise<HrEmployeeOrganizationPlacementChangeRequestDirectory> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["request.tenant_id=$1", "request.company_id=$2", "request.request_state='pending'"];
      if (query.search) {
        const parameter = values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(employee.employee_number ilike $${parameter} escape '\\' or concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) ilike $${parameter} escape '\\')`,
        );
      }
      values.push(query.limit);
      const result = await client.query<EmployeeOrganizationPlacementChangeRequestReviewRow>(
        `${this.employeeOrganizationPlacementChangeRequestReviewSelect()}
          where ${filters.join(" and ")}
          order by request.requested_at,request.id
          limit $${values.length}`,
        values,
      );
      return {
        items: result.rows.map((row) => employeeOrganizationPlacementChangeRequestReview(row, context)),
      };
    });
  }

  async getEmployeeOrganizationPlacementChangeRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeeOrganizationPlacementChangeRequestReview> {
    return this.read(context, "hr.employee_assignment.change", async (client) => {
      const result = await client.query<EmployeeOrganizationPlacementChangeRequestReviewRow>(
        `${this.employeeOrganizationPlacementChangeRequestReviewSelect()}
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      if (!result.rows[0])
        throw new HrApiError(
          404,
          "HR_ORGANIZATION_PLACEMENT_CHANGE_NOT_FOUND",
          "The organization-placement-change request is unavailable in your company scope.",
        );
      return employeeOrganizationPlacementChangeRequestReview(result.rows[0], context);
    });
  }

  async createEmployeeOrganizationPlacementChangeRequest(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeOrganizationPlacementChangeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeOrganizationPlacementChangeRequestResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to request organization changes.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-organization-placement-change:${context.tenantId}:${input.source_assignment_id}`,
      ]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = `/api/v1/hr/employees/${employeeId}/organization_placement_change_requests`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeOrganizationPlacementChangeRequestResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (input.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_EFFECTIVE_DATE_REQUIRED",
          "This organization-placement workflow currently requires today's effective date.",
        );
      const source = await client.query<{
        relationship_id: string;
        business_unit_id: string | null;
        division_id: string | null;
        branch_id: string | null;
        department_id: string | null;
        warehouse_id: string | null;
      }>(
        `select assignment.employment_relationship_id as relationship_id,
                (select organization_unit_id from employee_assignment_org_unit
                  where tenant_id=assignment.tenant_id and assignment_id=assignment.id
                    and organization_type='business_unit') as business_unit_id,
                (select organization_unit_id from employee_assignment_org_unit
                  where tenant_id=assignment.tenant_id and assignment_id=assignment.id
                    and organization_type='division') as division_id,
                (select organization_unit_id from employee_assignment_org_unit
                  where tenant_id=assignment.tenant_id and assignment_id=assignment.id
                    and organization_type='branch') as branch_id,
                (select organization_unit_id from employee_assignment_org_unit
                  where tenant_id=assignment.tenant_id and assignment_id=assignment.id
                    and organization_type='department') as department_id,
                (select organization_unit_id from employee_assignment_org_unit
                  where tenant_id=assignment.tenant_id and assignment_id=assignment.id
                    and organization_type='warehouse') as warehouse_id
           from employee_assignment assignment
           join employee on employee.tenant_id=assignment.tenant_id and employee.id=assignment.employee_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=assignment.tenant_id and relationship.id=assignment.employment_relationship_id
          where assignment.tenant_id=$1 and assignment.id=$2 and assignment.employee_id=$3
            and assignment.company_id=$4 and assignment.assignment_status='active'
            and assignment.effective_to is null and assignment.effective_from<current_date
            and employee.status in ('active','probation','confirmed','suspended')
            and relationship.status='active'
          for update of assignment,employee,relationship`,
        [context.tenantId, input.source_assignment_id, employeeId, input.company_id],
      );
      const sourceRow = source.rows[0];
      if (!sourceRow?.relationship_id)
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_SOURCE_UNAVAILABLE",
          "The source assignment is no longer eligible for an organization-placement change.",
        );
      const current: HrOrganizationPlacementSnapshot = {
        business_unit_id: sourceRow.business_unit_id,
        division_id: sourceRow.division_id,
        branch_id: sourceRow.branch_id,
        department_id: sourceRow.department_id,
        warehouse_id: sourceRow.warehouse_id,
      };
      if (stateHash(current) === stateHash(input.proposed))
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_CHANGE_REQUIRED",
          "The proposed organization hierarchy must differ from the current hierarchy.",
        );
      const readiness = await client.query<{ ready: boolean }>(
        `select hr_organization_placement_is_coherent($1,$2,$3,$4,$5,$6,$7) as ready`,
        [
          context.tenantId,
          input.company_id,
          input.proposed.business_unit_id,
          input.proposed.division_id,
          input.proposed.branch_id,
          input.proposed.department_id,
          input.proposed.warehouse_id,
        ],
      );
      if (!readiness.rows[0]?.ready)
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_HIERARCHY_INVALID",
          "The proposed organization units must form one active hierarchy in the legal company.",
        );
      const pending = await client.query(
        `select 1 from hr_employee_organization_placement_change_request
          where tenant_id=$1 and source_assignment_id=$2 and request_state='pending'`,
        [context.tenantId, input.source_assignment_id],
      );
      if (pending.rowCount)
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_ALREADY_PENDING",
          "An organization-placement-change request is already pending for this assignment.",
        );
      const id = `employee-organization-placement-change-request-${randomUUID()}`;
      await client.query(
        `insert into hr_employee_organization_placement_change_request
          (tenant_id,id,employee_id,company_id,relationship_id,source_assignment_id,
           current_business_unit_id,current_division_id,current_branch_id,current_department_id,current_warehouse_id,
           proposed_business_unit_id,proposed_division_id,proposed_branch_id,proposed_department_id,proposed_warehouse_id,
           effective_on,reason,requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          context.tenantId,
          id,
          employeeId,
          input.company_id,
          sourceRow.relationship_id,
          input.source_assignment_id,
          current.business_unit_id,
          current.division_id,
          current.branch_id,
          current.department_id,
          current.warehouse_id,
          input.proposed.business_unit_id,
          input.proposed.division_id,
          input.proposed.branch_id,
          input.proposed.department_id,
          input.proposed.warehouse_id,
          input.effective_on,
          input.reason,
          context.actor.userId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.organization_change.request",
        { entityId: id, before: current, after: { ...input.proposed, status: "pending" } },
      );
      const result: HrEmployeeOrganizationPlacementChangeRequestResult = {
        id,
        employee_id: employeeId,
        company_id: input.company_id,
        source_assignment_id: input.source_assignment_id,
        status: "pending",
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_CONTEXT_INVALID",
          "The organization-placement context is no longer valid. Refresh the assignment and hierarchy data.",
        );
      if (code === "23505")
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_ALREADY_PENDING",
          "An organization-placement-change request is already pending for this assignment.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async decideEmployeeOrganizationPlacementChangeRequest(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeOrganizationPlacementChangeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeOrganizationPlacementChangeDecisionResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.employee_assignment.change"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to decide organization changes.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:employee-organization-placement-change:${context.tenantId}:${requestId}`,
      ]);
      const path = `/api/v1/hr/employees/${employeeId}/organization_placement_change_requests/${requestId}/decision`;
      const fingerprint = stateHash(input);
      const replay = await client.query<{
        request_fingerprint: string;
        response_body: HrEmployeeOrganizationPlacementChangeDecisionResult;
      }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const pending = await client.query<{
        company_id: string;
        relationship_id: string;
        source_assignment_id: string;
        requested_by: string;
        effective_on: string;
        proposed_business_unit_id: string | null;
        proposed_division_id: string | null;
        proposed_branch_id: string | null;
        proposed_department_id: string | null;
        proposed_warehouse_id: string | null;
        designation_id: string;
        job_id: string;
        job_grade_id: string;
        cost_center_id: string;
        work_location_id: string;
        employment_type_id: string;
        employee_category_id: string;
        reporting_manager_id: string | null;
      }>(
        `select request.company_id,request.relationship_id,request.source_assignment_id,
                request.requested_by,request.effective_on::text,
                request.proposed_business_unit_id,request.proposed_division_id,
                request.proposed_branch_id,request.proposed_department_id,request.proposed_warehouse_id,
                assignment.designation_id,assignment.job_id,assignment.job_grade_id,
                assignment.cost_center_id,assignment.work_location_id,assignment.employment_type_id,
                assignment.employee_category_id,assignment.reporting_manager_id
           from hr_employee_organization_placement_change_request request
           join employee_assignment assignment
             on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
           join hr_employment_relationship relationship
             on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id
          where request.tenant_id=$1 and request.id=$2 and request.employee_id=$3
            and request.request_state='pending' and assignment.assignment_status='active'
            and assignment.effective_to is null and relationship.status='active'
            and exists (
              select 1 from security_user_company_access access
               where access.tenant_id=request.tenant_id and access.user_id=$4
                 and access.company_id=request.company_id and access.revoked_at is null
            )
          for update of request,assignment,relationship`,
        [context.tenantId, requestId, employeeId, context.actor.userId],
      );
      const row = pending.rows[0];
      if (!row)
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_NOT_PENDING",
          "The organization-placement-change request is not pending in your company scope.",
        );
      const approvalOverrideEventId = await this.resolveApprovalOverride(client, context, {
        normalDecisionPermission: "hr.employee_assignment.change",
        makerActorIds: [row.requested_by],
        resourceType: "hr.employee_organization_placement_change_request",
        resourceId: requestId,
        decisionAction: input.decision === "approved" ? "approve" : "reject",
        reason: input.reason,
        correlationId,
        idempotencyKey,
      });
      const currentDate = (await client.query<{ current_date: string }>("select current_date::text as current_date"))
        .rows[0]?.current_date;
      if (row.effective_on !== currentDate)
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_EFFECTIVE_DATE_REQUIRED",
          "This organization-placement change can only be decided on its effective date.",
        );
      if (input.decision === "approved") {
        const readiness = await client.query<{ ready: boolean }>(
          `select hr_organization_placement_is_coherent($1,$2,$3,$4,$5,$6,$7) as ready`,
          [
            context.tenantId,
            row.company_id,
            row.proposed_business_unit_id,
            row.proposed_division_id,
            row.proposed_branch_id,
            row.proposed_department_id,
            row.proposed_warehouse_id,
          ],
        );
        if (!readiness.rows[0]?.ready)
          throw new HrApiError(
            409,
            "HR_ORGANIZATION_PLACEMENT_HIERARCHY_INVALID",
            "The proposed organization hierarchy is no longer active and coherent.",
          );
      }
      let assignmentId: string | null = null;
      if (input.decision === "approved") {
        await client.query(
          `update employee_assignment
              set effective_to=($3::date - 1),assignment_status='ended',updated_at=now()
            where tenant_id=$1 and id=$2`,
          [context.tenantId, row.source_assignment_id, row.effective_on],
        );
        assignmentId = `employee-assignment-${randomUUID()}`;
        await client.query(
          `insert into employee_assignment
            (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_id,
             job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,
             reporting_manager_id,effective_from,change_reason,created_by,employment_relationship_id,
             assignment_status,source_reference)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'organization_change',$16,$17,'active',$18)`,
          [
            assignmentId,
            context.tenantId,
            employeeId,
            row.company_id,
            row.proposed_branch_id,
            row.proposed_department_id,
            row.designation_id,
            row.job_id,
            row.job_grade_id,
            row.cost_center_id,
            row.work_location_id,
            row.employment_type_id,
            row.employee_category_id,
            row.reporting_manager_id,
            row.effective_on,
            context.actor.userId,
            row.relationship_id,
            `hr:organization-placement-change-request:${requestId}`,
          ],
        );
        await client.query(
          `insert into employee_assignment_org_unit
            (tenant_id,assignment_id,organization_type,organization_unit_id,created_by)
           select $1,$2,placement.organization_type,placement.organization_unit_id,$3
             from (values
               ('business_unit',$4::text),('division',$5::text),('branch',$6::text),
               ('department',$7::text),('warehouse',$8::text)
             ) placement(organization_type,organization_unit_id)
            where placement.organization_unit_id is not null
           on conflict do nothing`,
          [
            context.tenantId,
            assignmentId,
            context.actor.userId,
            row.proposed_business_unit_id,
            row.proposed_division_id,
            row.proposed_branch_id,
            row.proposed_department_id,
            row.proposed_warehouse_id,
          ],
        );
      }
      await client.query(
        `update hr_employee_organization_placement_change_request
            set request_state=$3,decided_by=$4,decided_at=now(),decision_reason=$5,
                projected_assignment_id=$6,approval_override_event_id=$7,row_version=row_version+1
          where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          requestId,
          input.decision,
          context.actor.userId,
          input.reason,
          assignmentId,
          approvalOverrideEventId,
        ],
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "hr.employee_assignment.organization_change.decide",
        {
          entityId: requestId,
          before: { status: "pending", source_assignment_id: row.source_assignment_id },
          after: {
            status: input.decision,
            assignment_id: assignmentId,
            super_admin_override: approvalOverrideEventId !== null,
          },
        },
      );
      const result: HrEmployeeOrganizationPlacementChangeDecisionResult = {
        id: requestId,
        employee_id: employeeId,
        company_id: row.company_id,
        source_assignment_id: row.source_assignment_id,
        status: input.decision,
        assignment_id: assignmentId,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23503", "23514"].includes(code))
        throw new HrApiError(
          409,
          "HR_ORGANIZATION_PLACEMENT_CONTEXT_INVALID",
          "The organization-placement context is no longer valid. Refresh the request and hierarchy data.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async listMasters(context: HrActorContext, query: HrMasterDirectoryQuery): Promise<HrMasterDirectory> {
    return this.read(context, "hr.master.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["tenant_id = $1", "company_id = $2"];
      if (query.type) filters.push(`master_type = $${values.push(query.type)}`);
      if (query.active_only) filters.push("status = 'active'");
      values.push(query.limit);
      const result = await client.query<{
        id: string;
        company_id: string;
        type: HrMasterDirectory["items"][number]["type"];
        code: string;
        name: string;
        description: string;
        status: "active" | "inactive";
        configuration_key: HrMasterDirectory["items"][number]["configuration_key"];
        configuration_value: string | null;
      }>(
        `select id, company_id, master_type as type, code, name, description, status,
                configuration_key,configuration_value
           from hr_master_record where ${filters.join(" and ")}
          order by master_type, code, id limit $${values.length}`,
        values,
      );
      return { items: result.rows };
    });
  }

  async listJobGrades(context: HrActorContext, companyId: string): Promise<HrJobGradeDirectory> {
    return this.read(context, "hr.master.read", async (client) => {
      await this.requireCompanyAccess(client, context, companyId);
      const result = await client.query<HrJobGradeDirectory["items"][number]>(
        `select master.id,master.company_id,master.master_type as type,master.code,master.name,
                master.description,master.status,master.configuration_key,master.configuration_value,
                detail.grade_level,detail.currency_code,
                detail.band_minimum::text,detail.band_midpoint::text,detail.band_maximum::text
           from hr_master_record master
           join hr_job_grade_detail detail
             on detail.tenant_id=master.tenant_id and detail.master_record_id=master.id
          where master.tenant_id=$1 and master.company_id=$2 and master.master_type='job_grade'
          order by detail.grade_level,master.code,master.id
          limit 100`,
        [context.tenantId, companyId],
      );
      return { items: result.rows };
    });
  }

  async createJobGrade(
    context: HrActorContext,
    input: CreateHrJobGradeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    return this.mutateJobGrade(context, "create", undefined, input, idempotencyKey, correlationId);
  }

  async updateJobGrade(
    context: HrActorContext,
    gradeId: string,
    input: UpdateHrJobGradeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    return this.mutateJobGrade(context, "update", gradeId, input, idempotencyKey, correlationId);
  }

  private async mutateJobGrade(
    context: HrActorContext,
    operation: "create" | "update",
    gradeId: string | undefined,
    input: CreateHrJobGradeRequest | UpdateHrJobGradeRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    if (!validIdempotencyKey(idempotencyKey)) throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    const permission = operation === "create" ? "hr.master.create" : "hr.master.update";
    if (!context.actor.permissions.includes(permission)) throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to maintain job grades.");
    const client = await this.pool.connect();
    const path = operation === "create" ? "/api/v1/hr/job_grades" : `/api/v1/hr/job_grades/${gradeId}`;
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const fingerprint = stateHash({ gradeId, input });
      const replay = await client.query<{ request_fingerprint: string; response_body: HrMasterMutationResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method=$3 and path=$4 and idempotency_key=$5 for update`,
        [context.tenantId, context.actor.userId, operation === "create" ? "POST" : "PATCH", path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another request.");
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const before = gradeId ? (await client.query(
        `select master.id,master.code,master.name,master.description,master.status,detail.grade_level,
                detail.currency_code,detail.band_minimum::text,detail.band_midpoint::text,detail.band_maximum::text
           from hr_master_record master join hr_job_grade_detail detail
             on detail.tenant_id=master.tenant_id and detail.master_record_id=master.id
          where master.tenant_id=$1 and master.id=$2 and master.company_id=$3 and master.master_type='job_grade' for update`,
        [context.tenantId, gradeId, input.company_id],
      )).rows[0] : null;
      if (gradeId && !before) throw new HrApiError(404, "HR_JOB_GRADE_NOT_FOUND", "Job grade was not found.");
      let id = gradeId;
      if (operation === "create") {
        id = `hr-grade-${randomUUID()}`;
        await client.query(
          `insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,description,status,created_by)
           values ($1,$2,$3,'job_grade',$4,$5,$6,'active',$7)`,
          [id, context.tenantId, input.company_id, input.code.toUpperCase(), input.name, input.description, context.actor.userId],
        );
        await client.query(
          `insert into hr_job_grade_detail (tenant_id,master_record_id,company_id,grade_level,currency_code,band_minimum,band_midpoint,band_maximum)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [context.tenantId, id, input.company_id, input.grade_level, input.currency_code.toUpperCase(), input.band_minimum, input.band_midpoint, input.band_maximum],
        );
      } else {
        await client.query(
          `update hr_master_record set code=$4,name=$5,description=$6,updated_at=now()
            where tenant_id=$1 and id=$2 and company_id=$3 and master_type='job_grade'`,
          [context.tenantId, gradeId, input.company_id, input.code.toUpperCase(), input.name, input.description],
        );
        await client.query(
          `update hr_job_grade_detail set grade_level=$4,currency_code=$5,band_minimum=$6,band_midpoint=$7,band_maximum=$8,updated_at=now()
            where tenant_id=$1 and master_record_id=$2 and company_id=$3`,
          [context.tenantId, gradeId, input.company_id, input.grade_level, input.currency_code.toUpperCase(), input.band_minimum, input.band_midpoint, input.band_maximum],
        );
      }
      const after = (await client.query(
        `select master.id,master.code,master.name,master.description,master.status,detail.grade_level,
                detail.currency_code,detail.band_minimum::text,detail.band_midpoint::text,detail.band_maximum::text
           from hr_master_record master join hr_job_grade_detail detail
             on detail.tenant_id=master.tenant_id and detail.master_record_id=master.id
          where master.tenant_id=$1 and master.id=$2`,
        [context.tenantId, id],
      )).rows[0];
      const audit = await this.appendPlatformAudit(client, context, correlationId, `hr.job_grade.${operation}`, { entityId: id!, entityType: "hr_master_record", before, after });
      const result = { id: id!, company_id: input.company_id, audit_event_id: audit, replayed: false };
      const method = operation === "create" ? "POST" : "PATCH";
      const responseStatus = operation === "create" ? 201 : 200;
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [context.tenantId, context.actor.userId, method, path, idempotencyKey, fingerprint, responseStatus, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "23505") throw new HrApiError(409, "HR_JOB_GRADE_DUPLICATE", "The job-grade code, name, or level is already in use for this company.");
      if (["23503", "23514"].includes(code)) throw new HrApiError(409, "HR_JOB_GRADE_INVALID", "The job-grade details are invalid for this company.");
      throw error;
    } finally {
      client.release();
    }
  }

  async createJob(
    context: HrActorContext,
    input: CreateHrJobRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrJobResult> {
    if (!validIdempotencyKey(idempotencyKey))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    if (!context.actor.permissions.includes("hr.master.create"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to create jobs.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const path = "/api/v1/hr/jobs",
        fingerprint = stateHash(input);
      const replay = await client.query<{ request_fingerprint: string; response_body: HrJobResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new HrApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const id = `hr-job-${randomUUID()}`;
      await client.query(
        `insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,description,status,created_by) values ($1,$2,$3,'job',$4,$5,$6,'active',$7)`,
        [id, context.tenantId, input.company_id, input.code, input.name, input.description ?? "", context.actor.userId],
      );
      const audit = await this.appendPlatformAudit(client, context, correlationId, "hr.master.job.create", {
        entityId: id,
        entityType: "hr_master_record",
        before: null,
        after: { company_id: input.company_id, master_type: "job", code: input.code },
      });
      const result: HrJobResult = {
        id,
        company_id: input.company_id,
        code: input.code,
        name: input.name,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
        [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createMaster(
    context: HrActorContext,
    input: CreateHrMasterRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    return this.mutateMaster(context, "create", undefined, input, idempotencyKey, correlationId);
  }

  async updateMaster(
    context: HrActorContext,
    masterId: string,
    input: UpdateHrMasterRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    return this.mutateMaster(context, "update", masterId, input, idempotencyKey, correlationId);
  }

  async changeMasterStatus(
    context: HrActorContext,
    masterId: string,
    input: ChangeHrMasterStatusRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    return this.mutateMaster(context, "status", masterId, input, idempotencyKey, correlationId);
  }

  private async mutateMaster(
    context: HrActorContext,
    operation: "create" | "update" | "status",
    masterId: string | undefined,
    input: CreateHrMasterRequest | UpdateHrMasterRequest | ChangeHrMasterStatusRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrMasterMutationResult> {
    if (!validIdempotencyKey(idempotencyKey)) throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    const permission = operation === "create" ? "hr.master.create" : "hr.master.update";
    if (!context.actor.permissions.includes(permission)) throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to maintain HR master data.");
    const client = await this.pool.connect();
    const path = operation === "create" ? "/api/v1/hr/masters" : `/api/v1/hr/masters/${masterId}/${operation}`;
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await this.requireCompanyAccess(client, context, input.company_id);
      const fingerprint = stateHash({ masterId, input });
      const replay = await client.query<{ request_fingerprint: string; response_body: HrMasterMutationResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another request.");
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const before = masterId ? (await client.query(`select id,company_id,master_type,code,name,description,status,configuration_key,configuration_value from hr_master_record where tenant_id=$1 and id=$2 and company_id=$3 for update`, [context.tenantId, masterId, input.company_id])).rows[0] : null;
      if (masterId && !before) throw new HrApiError(404, "HR_MASTER_NOT_FOUND", "HR master record was not found.");
      if (operation === "update" && before && ["cost_center", "work_location", "employment_type", "employee_category"].includes(String(before.master_type))) {
        const update = input as UpdateHrMasterRequest;
        if (!update.configuration_key || !update.configuration_value)
          throw new HrApiError(400, "HR_MASTER_CONFIGURATION_REQUIRED", "Configuration is required when updating this HR master type.");
      }
      let id = masterId;
      if (operation === "create") {
        const create = input as CreateHrMasterRequest;
        id = `hr-master-${randomUUID()}`;
        await client.query(`insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,description,status,created_by,configuration_key,configuration_value) values ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10)`, [id, context.tenantId, create.company_id, create.type, create.code.toUpperCase(), create.name, create.description, context.actor.userId, create.configuration_key ?? null, create.configuration_value ?? null]);
      } else if (operation === "update") {
        const update = input as UpdateHrMasterRequest;
        await client.query(`update hr_master_record set code=$4,name=$5,description=$6,configuration_key=$7,configuration_value=$8,updated_at=now() where tenant_id=$1 and id=$2 and company_id=$3`, [context.tenantId, masterId, update.company_id, update.code.toUpperCase(), update.name, update.description, update.configuration_key ?? null, update.configuration_value ?? null]);
      } else {
        const change = input as ChangeHrMasterStatusRequest;
        if(change.status==="inactive"&&before?.master_type==="work_location") {
          const shiftUse=await client.query("select 1 from hr_shift where tenant_id=$1 and company_id=$2 and work_location_id=$3 and status='active' limit 1",[context.tenantId,change.company_id,masterId]);
          if(shiftUse.rowCount)throw new HrApiError(409,"HR_WORK_LOCATION_IN_SHIFT_USE","Deactivate or move the active shifts at this work location before deactivating the location.");
        }
        await client.query(`update hr_master_record set status=$4,deactivated_by=case when $4='inactive' then $5 else null end,deactivated_at=case when $4='inactive' then now() else null end,updated_at=now() where tenant_id=$1 and id=$2 and company_id=$3`, [context.tenantId, masterId, change.company_id, change.status, context.actor.userId]);
      }
      const after = (await client.query(`select id,company_id,master_type,code,name,description,status,configuration_key,configuration_value from hr_master_record where tenant_id=$1 and id=$2`, [context.tenantId, id])).rows[0];
      const audit = await this.appendPlatformAudit(client, context, correlationId, `hr.master.${operation}`, { entityId: id!, entityType: "hr_master_record", before, after });
      const result = { id: id!, company_id: input.company_id, audit_event_id: audit, replayed: false };
      await client.query(`insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`, [context.tenantId, context.actor.userId, path, idempotencyKey, fingerprint, result, stateHash(result)]);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "23505") throw new HrApiError(409, "HR_MASTER_DUPLICATE", "That code or name already exists for this company and master type.");
      if (code === "23514") throw new HrApiError(409, "HR_MASTER_CONFIGURATION_INVALID", "The master configuration is invalid for this record type.");
      throw error;
    } finally {
      client.release();
    }
  }

  private async read<T>(
    context: HrActorContext,
    permission: string | readonly string[],
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const allowed = typeof permission === "string" ? [permission] : permission;
    if (!allowed.some((item) => context.actor.permissions.includes(item)))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to access this HR data.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [context.tenantId]);
      const output = await operation(client);
      await client.query("commit");
      return output;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private employeeHireRequestReviewSelect(): string {
    return `select request.id,employee.id as employee_id,employee.employee_number,
                   concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                   relationship.legal_employer_id as company_id,relationship.id as relationship_id,
                   job.id as job_id,job.code as job_code,job.name as job_name,
                   assignment.id as profile_draft_assignment_id,designation.name as designation,
                   job_grade.name as job_grade,employment_type.name as employment_type,
                   work_location.name as work_location,request.effective_on,request.requested_by,
                   request.requested_at,request.reason,request.approval_state as status,
                   request.decided_by,request.decided_at,request.decision_comment as decision_reason
              from hr_employment_lifecycle_request request
              join hr_employment_relationship relationship
                on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id
              join employee
                on employee.tenant_id=relationship.tenant_id and employee.id=relationship.employee_id
              join hr_employment_lifecycle_transition transition
                on transition.tenant_id=request.tenant_id and transition.id=request.transition_id
              join hr_master_record job
                on job.tenant_id=request.tenant_id and job.id=request.job_id
              join employee_assignment assignment
                on assignment.tenant_id=request.tenant_id and assignment.id=request.profile_draft_assignment_id
              join hr_master_record designation
                on designation.tenant_id=assignment.tenant_id and designation.id=assignment.designation_id
              join hr_master_record job_grade
                on job_grade.tenant_id=assignment.tenant_id and job_grade.id=assignment.job_grade_id
              join hr_master_record employment_type
                on employment_type.tenant_id=assignment.tenant_id and employment_type.id=assignment.employment_type_id
              join hr_master_record work_location
                on work_location.tenant_id=assignment.tenant_id and work_location.id=assignment.work_location_id`;
  }

  private employeeTransferRequestReviewSelect(): string {
    return `select request.id,request.employee_id,employee.employee_number,
                   concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                   request.company_id,request.relationship_id,request.source_assignment_id,
                   coalesce(source_branch.name,'') as source_branch,
                   coalesce(source_department.name,'') as source_department,
                   coalesce(proposed_branch.name,'') as proposed_branch,
                   coalesce(proposed_department.name,'') as proposed_department,
                   proposed_job.name as proposed_job,
                   proposed_designation.name as proposed_designation,
                   proposed_job_grade.name as proposed_job_grade,
                   proposed_work_location.name as proposed_work_location,
                   request.effective_on,request.requested_by,request.requested_at,
                   request.reason,request.request_state as status,request.decided_by,
                   request.decided_at,request.decision_reason
              from hr_employee_transfer_request request
              join employee
                on employee.tenant_id=request.tenant_id and employee.id=request.employee_id
              join employee_assignment source_assignment
                on source_assignment.tenant_id=request.tenant_id and source_assignment.id=request.source_assignment_id
              left join organization_unit source_branch
                on source_branch.tenant_id=source_assignment.tenant_id and source_branch.id=source_assignment.branch_id
              left join organization_unit source_department
                on source_department.tenant_id=source_assignment.tenant_id and source_department.id=source_assignment.department_id
              left join organization_unit proposed_branch
                on proposed_branch.tenant_id=request.tenant_id and proposed_branch.id=request.proposed_branch_id
              left join organization_unit proposed_department
                on proposed_department.tenant_id=request.tenant_id and proposed_department.id=request.proposed_department_id
              join hr_master_record proposed_job
                on proposed_job.tenant_id=request.tenant_id and proposed_job.id=request.proposed_job_id
              join hr_master_record proposed_designation
                on proposed_designation.tenant_id=request.tenant_id and proposed_designation.id=request.proposed_designation_id
              join hr_master_record proposed_job_grade
                on proposed_job_grade.tenant_id=request.tenant_id and proposed_job_grade.id=request.proposed_job_grade_id
              join hr_master_record proposed_work_location
                on proposed_work_location.tenant_id=request.tenant_id and proposed_work_location.id=request.proposed_work_location_id`;
  }

  private employeePromotionRequestReviewSelect(): string {
    return `select request.id,request.employee_id,employee.employee_number,
                   concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                   request.company_id,request.relationship_id,request.source_assignment_id,
                   source_job.name as source_job,source_designation.name as source_designation,
                   source_job_grade.name as source_job_grade,proposed_job.name as proposed_job,
                   proposed_designation.name as proposed_designation,
                   proposed_job_grade.name as proposed_job_grade,request.effective_on,
                   request.requested_by,request.requested_at,request.reason,
                   request.request_state as status,request.decided_by,
                   request.decided_at,request.decision_reason
              from hr_employee_promotion_request request
              join employee
                on employee.tenant_id=request.tenant_id and employee.id=request.employee_id
              join employee_assignment source_assignment
                on source_assignment.tenant_id=request.tenant_id and source_assignment.id=request.source_assignment_id
              join hr_master_record source_job
                on source_job.tenant_id=source_assignment.tenant_id and source_job.id=source_assignment.job_id
              join hr_master_record source_designation
                on source_designation.tenant_id=source_assignment.tenant_id and source_designation.id=source_assignment.designation_id
              join hr_master_record source_job_grade
                on source_job_grade.tenant_id=source_assignment.tenant_id and source_job_grade.id=source_assignment.job_grade_id
              join hr_master_record proposed_job
                on proposed_job.tenant_id=request.tenant_id and proposed_job.id=request.proposed_job_id
              join hr_master_record proposed_designation
                on proposed_designation.tenant_id=request.tenant_id and proposed_designation.id=request.proposed_designation_id
              join hr_master_record proposed_job_grade
                on proposed_job_grade.tenant_id=request.tenant_id and proposed_job_grade.id=request.proposed_job_grade_id`;
  }

  private employeeManagerChangeRequestReviewSelect(): string {
    return `select request.id,request.employee_id,employee.employee_number,
                   concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                   request.company_id,request.relationship_id,request.source_assignment_id,
                   source_assignment.reporting_manager_id as current_reporting_manager_id,
                   case when current_manager.id is null then null
                        else concat_ws(' ',current_manager.first_name,current_manager.middle_name,current_manager.last_name)
                   end as current_reporting_manager_name,
                   request.proposed_reporting_manager_id,
                   case when proposed_manager.id is null then null
                        else concat_ws(' ',proposed_manager.first_name,proposed_manager.middle_name,proposed_manager.last_name)
                   end as proposed_reporting_manager_name,
                   request.clear_reporting_manager,request.effective_on,request.requested_by,
                   request.requested_at,request.reason,request.request_state as status,
                   request.decided_by,request.decided_at,request.decision_reason
              from hr_employee_manager_change_request request
              join employee
                on employee.tenant_id=request.tenant_id and employee.id=request.employee_id
              join employee_assignment source_assignment
                on source_assignment.tenant_id=request.tenant_id and source_assignment.id=request.source_assignment_id
              left join employee current_manager
                on current_manager.tenant_id=source_assignment.tenant_id
               and current_manager.id=source_assignment.reporting_manager_id
              left join employee proposed_manager
                on proposed_manager.tenant_id=request.tenant_id
               and proposed_manager.id=request.proposed_reporting_manager_id`;
  }

  private employeeWorkLocationChangeRequestReviewSelect(): string {
    return `select request.id,request.employee_id,employee.employee_number,
                   concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                   request.company_id,request.relationship_id,request.source_assignment_id,
                   request.current_work_location_id,current_location.name as current_work_location_name,
                   request.proposed_work_location_id,proposed_location.name as proposed_work_location_name,
                   request.proposed_work_location_profile_id as jurisdiction_profile_id,
                   profile.country_code as jurisdiction_country_code,profile.jurisdiction_id,
                   (profile.state in ('approved','active')
                     and profile.effective_from<=request.effective_on
                     and (profile.effective_to is null or profile.effective_to>=request.effective_on))
                     as jurisdiction_ready,
                   request.effective_on,request.requested_by,request.requested_at,
                   request.reason,request.request_state as status,request.decided_by,
                   request.decided_at,request.decision_reason
              from hr_employee_work_location_change_request request
              join employee
                on employee.tenant_id=request.tenant_id and employee.id=request.employee_id
              join hr_master_record current_location
                on current_location.tenant_id=request.tenant_id
               and current_location.id=request.current_work_location_id
              join hr_master_record proposed_location
                on proposed_location.tenant_id=request.tenant_id
               and proposed_location.id=request.proposed_work_location_id
              join hr_work_location_profile profile
                on profile.tenant_id=request.tenant_id
               and profile.id=request.proposed_work_location_profile_id
               and profile.company_id=request.company_id`;
  }

  private employeeOrganizationPlacementChangeRequestReviewSelect(): string {
    return `select request.id,request.employee_id,employee.employee_number,
                   concat_ws(' ',employee.first_name,employee.middle_name,employee.last_name) as employee_name,
                   request.company_id,request.relationship_id,request.source_assignment_id,
                   jsonb_build_object(
                     'business_unit_id',request.current_business_unit_id,
                     'division_id',request.current_division_id,
                     'branch_id',request.current_branch_id,
                     'department_id',request.current_department_id,
                     'warehouse_id',request.current_warehouse_id
                   ) as current,
                   jsonb_build_object(
                     'business_unit_id',request.proposed_business_unit_id,
                     'division_id',request.proposed_division_id,
                     'branch_id',request.proposed_branch_id,
                     'department_id',request.proposed_department_id,
                     'warehouse_id',request.proposed_warehouse_id
                   ) as proposed,
                   coalesce((
                     select jsonb_object_agg(placement.organization_type,unit.name)
                       from (values
                         ('business_unit',request.current_business_unit_id),
                         ('division',request.current_division_id),
                         ('branch',request.current_branch_id),
                         ('department',request.current_department_id),
                         ('warehouse',request.current_warehouse_id)
                       ) placement(organization_type,organization_unit_id)
                       join organization_unit unit
                         on unit.tenant_id=request.tenant_id
                        and unit.id=placement.organization_unit_id
                   ),'{}'::jsonb) as current_names,
                   coalesce((
                     select jsonb_object_agg(placement.organization_type,unit.name)
                       from (values
                         ('business_unit',request.proposed_business_unit_id),
                         ('division',request.proposed_division_id),
                         ('branch',request.proposed_branch_id),
                         ('department',request.proposed_department_id),
                         ('warehouse',request.proposed_warehouse_id)
                       ) placement(organization_type,organization_unit_id)
                       join organization_unit unit
                         on unit.tenant_id=request.tenant_id
                        and unit.id=placement.organization_unit_id
                   ),'{}'::jsonb) as proposed_names,
                   hr_organization_placement_is_coherent(
                     request.tenant_id,request.company_id,
                     request.proposed_business_unit_id,request.proposed_division_id,
                     request.proposed_branch_id,request.proposed_department_id,
                     request.proposed_warehouse_id
                   ) as hierarchy_ready,
                   request.effective_on,request.requested_by,request.requested_at,
                   request.reason,request.request_state as status,request.decided_by,
                   request.decided_at,request.decision_reason
              from hr_employee_organization_placement_change_request request
              join employee
                on employee.tenant_id=request.tenant_id and employee.id=request.employee_id`;
  }

  private async requireCompanyAccess(client: PoolClient, context: HrActorContext, companyId: string): Promise<void> {
    const access = await client.query(
      `select 1 from security_user_company_access
        where tenant_id = $1 and user_id = $2 and company_id = $3 and revoked_at is null`,
      [context.tenantId, context.actor.userId, companyId],
    );
    if (!access.rowCount)
      throw new HrApiError(403, "COMPANY_ACCESS_DENIED", "The company is outside your access scope.");
  }

  private async requireActiveEmployeeCompanyScope(
    client: PoolClient,
    context: HrActorContext,
    employeeId: string,
  ): Promise<void> {
    const result = await client.query(
      `select 1
         from employee employee
         join employee_assignment assignment
           on assignment.tenant_id=employee.tenant_id and assignment.employee_id=employee.id
         join security_user_company_access access
           on access.tenant_id=assignment.tenant_id and access.company_id=assignment.company_id
        where employee.tenant_id=$1 and employee.id=$2 and access.user_id=$3 and access.revoked_at is null
          and assignment.assignment_status in ('active','legacy_compatibility')
          and assignment.effective_from<=current_date
          and (assignment.effective_to is null or assignment.effective_to>=current_date)
        limit 1`,
      [context.tenantId, employeeId, context.actor.userId],
    );
    if (!result.rowCount)
      throw new HrApiError(404, "HR_EMPLOYEE_NOT_FOUND", "The employee is unavailable in your company scope.");
  }

  private async requireEmployeeAssignmentCompanyScope(
    client: PoolClient,
    context: HrActorContext,
    employeeId: string,
  ): Promise<void> {
    const result = await client.query(
      `select 1
         from employee_assignment assignment
         join security_user_company_access access
           on access.tenant_id=assignment.tenant_id and access.company_id=assignment.company_id
        where assignment.tenant_id=$1 and assignment.employee_id=$2 and access.user_id=$3
          and access.revoked_at is null
          and (assignment.assignment_status='profile_draft' or (
            assignment.assignment_status in ('active','legacy_compatibility')
            and assignment.effective_from<=current_date
            and (assignment.effective_to is null or assignment.effective_to>=current_date)))
        limit 1`,
      [context.tenantId, employeeId, context.actor.userId],
    );
    if (!result.rowCount)
      throw new HrApiError(404, "HR_EMPLOYEE_NOT_FOUND", "The employee is unavailable in your company scope.");
  }

  private async recordEmployeeProfileVersion(
    client: PoolClient,
    context: HrActorContext,
    employeeId: string,
    profile: {
      first_name: string;
      middle_name: string;
      last_name: string;
      preferred_name: string;
      work_email: string;
      date_of_birth: string | Date | null;
      personal_email: string;
      phone: string;
    },
    sourceReference: string,
  ): Promise<void> {
    const current = await client.query<{
      id: string;
      revision: number;
      effective_from: string | Date;
      effective_to: string | Date | null;
      first_name: string;
      middle_name: string;
      last_name: string;
      preferred_name: string;
      work_email: string;
      date_of_birth: string | Date | null;
      personal_email: string;
      phone: string;
    }>(
      `select id,revision,effective_from,effective_to,first_name,middle_name,last_name,
              preferred_name,work_email,date_of_birth,personal_email,phone
         from hr_employee_profile_version
        where tenant_id=$1 and employee_id=$2
        order by revision desc,recorded_at desc,id desc
        limit 1 for update`,
      [context.tenantId, employeeId],
    );
    const previous = current.rows[0];
    const sameProfile =
      previous !== undefined &&
      previous.first_name === profile.first_name &&
      previous.middle_name === profile.middle_name &&
      previous.last_name === profile.last_name &&
      previous.preferred_name === profile.preferred_name &&
      previous.work_email === profile.work_email &&
      (previous.date_of_birth === null ? null : dateOnly(previous.date_of_birth)) ===
        (profile.date_of_birth === null ? null : dateOnly(profile.date_of_birth)) &&
      previous.personal_email === profile.personal_email &&
      previous.phone === profile.phone;
    if (sameProfile && previous.effective_to === null) return;

    const captureDate = await client.query<{ value: string }>(
      "select greatest(coalesce($1::date,current_date),current_date)::text as value",
      [previous ? dateOnly(previous.effective_from) : null],
    );
    const effectiveFrom = captureDate.rows[0]?.value;
    if (!effectiveFrom) throw new Error("Unable to determine the employee profile capture date.");
    if (previous?.effective_to === null)
      await client.query("update hr_employee_profile_version set effective_to=$3 where tenant_id=$1 and id=$2", [
        context.tenantId,
        previous.id,
        effectiveFrom,
      ]);
    await client.query(
      `insert into hr_employee_profile_version (
         id,tenant_id,employee_id,effective_from,revision,supersedes_version_id,
         first_name,middle_name,last_name,preferred_name,work_email,date_of_birth,
         personal_email,phone,recorded_by,source_reference
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        `employee-profile-version-${randomUUID()}`,
        context.tenantId,
        employeeId,
        effectiveFrom,
        (previous?.revision ?? 0) + 1,
        previous?.id ?? null,
        profile.first_name,
        profile.middle_name,
        profile.last_name,
        profile.preferred_name,
        profile.work_email,
        profile.date_of_birth === null ? null : dateOnly(profile.date_of_birth),
        profile.personal_email,
        profile.phone,
        context.actor.userId,
        sourceReference,
      ],
    );
  }

  private async resolveApprovalOverride(
    client: PoolClient,
    context: HrActorContext,
    input: {
      normalDecisionPermission: string;
      makerActorIds: readonly string[];
      resourceType: string;
      resourceId: string;
      decisionAction: "approve" | "reject" | "activate";
      reason: string;
      correlationId: string;
      idempotencyKey: string;
    },
  ): Promise<string | null> {
    const impersonated = Boolean(
      context.impersonationRequestId ||
      (context.realActorId !== undefined && context.realActorId !== context.actor.userId),
    );
    const policy = evaluateApprovalActor({
      account: context.actor,
      normalDecisionPermission: input.normalDecisionPermission,
      makerActorIds: input.makerActorIds,
      impersonated,
    });
    if (policy.kind === "ordinary") return null;
    if (policy.kind === "forbidden") {
      const message =
        policy.reason === "impersonation_forbidden"
          ? "Approval overrides are unavailable during impersonation."
          : "A different HR approver must decide this request.";
      throw new HrApiError(403, "HR_SELF_APPROVAL_FORBIDDEN", message);
    }
    try {
      const evidence = await writeApprovalOverrideEvent(client, {
        tenantId: context.tenantId,
        account: context.actor,
        makerActorIds: input.makerActorIds,
        normalDecisionPermission: input.normalDecisionPermission,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        decisionAction: input.decisionAction,
        reason: input.reason,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        metadata: { module: "hr", super_admin_override: true },
        impersonated,
      });
      return evidence.eventId;
    } catch (error) {
      if (!(error instanceof ApprovalOverrideWriterError)) throw error;
      if (error.code === "INVALID_APPROVAL_OVERRIDE_EVIDENCE")
        throw new HrApiError(400, "INVALID_APPROVAL_OVERRIDE_EVIDENCE", error.message);
      if (error.code === "APPROVAL_OVERRIDE_IDEMPOTENCY_CONFLICT")
        throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", error.message);
      throw new HrApiError(403, "HR_SELF_APPROVAL_FORBIDDEN", error.message);
    }
  }

  private async appendPlatformAudit(
    client: PoolClient,
    context: HrActorContext,
    correlationId: string,
    action:
      | "hr.employee.create"
      | "hr.employee.update"
      | "hr.employee.submit"
      | "hr.employee.approve"
      | "hr.employee_assignment.create"
      | "hr.employee_contact.create"
      | "hr.employee_emergency_contact.create"
      | "hr.employment_lifecycle_policy.create"
      | "hr.employment_lifecycle_policy.submit"
      | "hr.employment_lifecycle_policy.approve"
      | "hr.employment_lifecycle_policy.activate"
      | "hr.master.job.create"
      | "hr.job_grade.create"
      | "hr.job_grade.update"
      | "hr.master.create"
      | "hr.master.update"
      | "hr.master.status"
      | "hr.organization.create"
      | "hr.organization.update"
      | "hr.organization.status"
      | "hr.employment_lifecycle.hire.request"
      | "hr.employment_lifecycle.hire.decide"
      | "hr.employee_assignment.transfer.request"
      | "hr.employee_assignment.transfer.decide"
      | "hr.employee_assignment.promotion.request"
      | "hr.employee_assignment.promotion.decide"
      | "hr.employee_assignment.manager_change.request"
      | "hr.employee_assignment.manager_change.decide"
      | "hr.employee_assignment.work_location_change.request"
      | "hr.employee_assignment.work_location_change.decide"
      | "hr.employee_assignment.organization_change.request"
      | "hr.employee_assignment.organization_change.decide"
      | "hr.manpower_requisition.create"
      | "hr.manpower_requisition.submitted"
      | "hr.manpower_requisition.approved"
      | "hr.manpower_requisition.rejected"
      | "hr.job_opening.create"
      | "hr.job_opening.state"
      | "hr.candidate.create"
      | "hr.candidate.status"
      | "hr.application.create"
      | "hr.application.stage"
      | "hr.interview.action"
      | "hr.offer.action"
      | "hr.offer.employee_draft"
      | "hr.shift.rules"
      | "hr.lifecycle.policy_upgrade"
      | "hr.lifecycle.workspace"
      | "hr.performance.workspace"
      | "hr.payroll.workspace"
      | "hr.attendance.completion"
      | "hr.attendance.correction"
      | "hr.shift.allocation"
      | "hr.personal_data.correction"
      | "hr.report.governance"
      | "hr.learning.workflow",
    mutation: {
      entityId: string;
      entityType?: "hr_learning_record" | "hr_personal_data_correction" | "hr_report_export" | "hr_settlement_entitlement" | "hr_employment_policy_adoption" | "hr_lifecycle_case" | "hr_performance_record" | "hr_payroll_workspace" | "employee" | "employment_lifecycle_policy" | "hr_master_record" | "employment_relationship" | "organization_unit" | "hr_manpower_requisition" | "hr_job_opening" | "hr_candidate" | "hr_recruitment_application" | "hr_recruitment_offer" | "hr_shift" | "hr_shift_assignment" | "hr_attendance_correction";
      before: unknown;
      after: unknown;
      sourceReference?: string;
    },
  ): Promise<string> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const latest = await client.query<{ sequence: string; event_hash: string }>(
      `select sequence,event_hash from platform_admin_audit_event
        where tenant_id=$1 order by sequence desc limit 1`,
      [context.tenantId],
    );
    const sequence = latest.rows[0] ? Number(latest.rows[0].sequence) + 1 : 1;
    const previousEventHash = latest.rows[0]?.event_hash ?? stateHash({ genesis: context.tenantId });
    const id = `audit-${randomUUID()}`;
    const occurredAt = new Date().toISOString();
    const payload = {
      id,
      tenant_id: context.tenantId,
      actor_id: context.actor.userId,
      correlation_id: correlationId,
      action,
      entity_type: mutation.entityType ?? "employee",
      entity_id: mutation.entityId,
      before_hash: stateHash(mutation.before),
      after_hash: stateHash(mutation.after),
      source_reference: mutation.sourceReference ?? "hr.employee.draft",
      approval_reference: null,
      occurred_at: occurredAt,
      sequence,
      previous_event_hash: previousEventHash,
    };
    const eventHash = stateHash(payload);
    await client.query(
      `insert into platform_admin_audit_event
       (id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        context.tenantId,
        sequence,
        context.actor.userId,
        correlationId,
        payload.action,
        payload.entity_type,
        mutation.entityId,
        payload.before_hash,
        payload.after_hash,
        payload.source_reference,
        null,
        occurredAt,
        previousEventHash,
        eventHash,
      ],
    );
    return id;
  }
}
