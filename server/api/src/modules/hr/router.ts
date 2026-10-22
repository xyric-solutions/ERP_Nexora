import {hrLearningQuerySchema,hrLearningActionSchema,hrLearningWorkspaceSchema,hrLearningCertificateSchema} from "@nexora/contracts";
import {hrSettlementBenefitQuerySchema,hrSettlementBenefitActionSchema,hrSettlementBenefitWorkspaceSchema,type HrSettlementBenefitQuery,type HrSettlementBenefitAction} from '@nexora/contracts';
import {hrSettlementEntitlementQuerySchema,hrSettlementEntitlementActionSchema,hrSettlementEntitlementWorkspaceSchema} from '@nexora/contracts';
import {hrPolicyUpgradeQuerySchema,hrPolicyUpgradeActionSchema,hrPolicyUpgradeWorkspaceSchema} from '@nexora/contracts';
import {hrLifecycleCaseQuerySchema,hrLifecycleCaseActionSchema,hrLifecycleCaseWorkspaceSchema} from '@nexora/contracts';
import {hrPerformanceInboxSchema} from '@nexora/contracts';
import {hrPerformanceParticipationQuerySchema,hrPerformanceParticipationActionSchema,hrPerformanceParticipationSchema} from '@nexora/contracts';
import {hrPerformanceQuerySchema,hrPerformanceCommandSchema} from '@nexora/contracts';
import {hrPayslipQuerySchema,hrPayslipReleaseSchema} from '@nexora/contracts';
import {hrPayrollPaymentQuerySchema,hrPayrollPaymentActionSchema} from '@nexora/contracts';
import {hrPayrollJournalQuerySchema,hrPayrollJournalActionSchema} from '@nexora/contracts';
import {hrLocalizationQuerySchema,createHrLocalizationSchema,hrLocalizationDecisionSchema} from '@nexora/contracts';
import {hrOvertimeMoneyQuerySchema,createHrOvertimeMoneySchema,hrOvertimeMoneyDecisionSchema} from '@nexora/contracts';
import {hrPayrollRunComparisonQuerySchema,hrPayrollRunComparisonSchema,hrPayrollRunQuerySchema,hrPayrollRunActionSchema,hrPayrollRunWorkspaceSchema} from '@nexora/contracts';
import {hrPayrollWorkspaceQuerySchema,hrPayrollWorkspaceSchema,hrPayrollOptionsQuerySchema,hrPayrollOptionsSchema,createHrPayrollRecordSchema,hrPayrollRecordActionSchema,hrPayrollMutationResultSchema} from '@nexora/contracts';
import {hrLeaveQuerySchema,hrLeaveTypeDirectorySchema,createHrLeaveTypeRequestSchema,updateHrLeavePolicyRequestSchema,hrLeaveTypeStatusRequestSchema,hrLeaveBalanceQuerySchema,hrLeaveBalanceDirectorySchema,hrLeaveLedgerQuerySchema,hrLeaveLedgerSchema,hrLeaveBalancePostingRequestSchema,hrLeaveContextQuerySchema,hrLeaveContextSchema,hrLeaveRequestQuerySchema,hrLeaveRequestDirectorySchema,hrLeaveRequestDetailSchema,createHrLeaveRequestSchema,hrLeaveRequestActionRequestSchema} from '@nexora/contracts';
import {hrOvertimeQuerySchema,hrOvertimeContextQuerySchema,createHrOvertimeRequestSchema,hrOvertimeRuleRequestSchema,hrOvertimeActionRequestSchema,hrAttendancePeriodQuerySchema,hrAttendancePeriodActionRequestSchema,hrOvertimeDirectorySchema,hrOvertimeContextSchema,hrOvertimeDetailSchema,hrAttendanceCompletionResultSchema,hrAttendancePeriodWorkspaceSchema,hrAttendancePayrollInputsSchema} from '@nexora/contracts';
import {hrPersonalCorrectionQuerySchema,createHrPersonalCorrectionSchema,hrPersonalCorrectionActionSchema,hrPersonalCorrectionWorkspaceSchema,hrReportGovernanceQuerySchema,hrReportGovernanceActionSchema,hrReportGovernanceWorkspaceSchema,hrReportGovernanceResultSchema} from '@nexora/contracts';
import {hrSelfLeaveContextQuerySchema,createHrSelfLeaveRequestSchema,hrSelfLeaveActionSchema} from '@nexora/contracts';
import {hrSelfServiceQuerySchema,hrSelfServicePayslipQuerySchema,hrSelfServiceWorkspaceSchema,hrPayslipDetailSchema} from '@nexora/contracts';
import { Router, type Request } from "express";
import { z } from "zod";

import {
  createHrEmployeeDraftRequestSchema,
  updateHrEmployeeDraftRequestSchema,
  submitHrEmployeeDraftRequestSchema,
  hrEmployeeDraftApprovalQueueQuerySchema,
  decideHrEmployeeDraftApprovalRequestSchema,
  createHrProfileDraftAssignmentRequestSchema,
  createHrEmployeeContactRequestSchema,
  createHrEmployeeEmergencyContactRequestSchema,
  hrEmployeeDirectoryQuerySchema,
  hrEmployeeDraftDirectoryQuerySchema,
  hrMasterDirectoryQuerySchema,
  createHrMasterRequestSchema,
  updateHrMasterRequestSchema,
  changeHrMasterStatusRequestSchema,
  createHrJobGradeRequestSchema,
  updateHrJobGradeRequestSchema,
  hrEmploymentLifecyclePolicyDirectoryQuerySchema,
  createHrEmploymentLifecyclePolicyRequestSchema,
  submitHrEmploymentLifecyclePolicyRequestSchema,
  approveHrEmploymentLifecyclePolicyRequestSchema,
  activateHrEmploymentLifecyclePolicyRequestSchema,
  createHrJobRequestSchema,
  createHrEmployeeHireRequestSchema,
  decideHrEmployeeHireRequestSchema,
  hrEmployeeHireRequestDirectoryQuerySchema,
  hrOrganizationUnitDirectoryQuerySchema,
  createHrOrganizationUnitRequestSchema,
  updateHrOrganizationUnitRequestSchema,
  changeHrOrganizationUnitStatusRequestSchema,
  createHrEmployeeTransferRequestSchema,
  decideHrEmployeeTransferRequestSchema,
  hrEmployeeTransferRequestDirectoryQuerySchema,
  createHrEmployeePromotionRequestSchema,
  decideHrEmployeePromotionRequestSchema,
  hrEmployeePromotionRequestDirectoryQuerySchema,
  createHrEmployeeManagerChangeRequestSchema,
  decideHrEmployeeManagerChangeRequestSchema,
  hrEmployeeManagerChangeRequestDirectoryQuerySchema,
  createHrEmployeeWorkLocationChangeRequestSchema,
  decideHrEmployeeWorkLocationChangeRequestSchema,
  hrEmployeeWorkLocationChangeRequestDirectoryQuerySchema,
  createHrEmployeeOrganizationPlacementChangeRequestSchema,
  decideHrEmployeeOrganizationPlacementChangeRequestSchema,
  hrEmployeeOrganizationPlacementChangeRequestDirectoryQuerySchema,
  hrEmployeeHistoryQuerySchema,
  hrPositionsOrganizationQuerySchema,
  hrManpowerRequisitionQuerySchema,
  createHrManpowerRequisitionRequestSchema,
  submitHrManpowerRequisitionRequestSchema,
  decideHrManpowerRequisitionRequestSchema,
  hrJobOpeningQuerySchema,
  createHrJobOpeningRequestSchema,
  changeHrJobOpeningStateRequestSchema,
  hrInterviewWorkspaceQuerySchema, hrInterviewPanelQuerySchema, hrInterviewActionRequestSchema,
  createHrOfferEmployeeRequestSchema,
  createHrShiftRequestSchema, updateHrShiftRequestSchema, changeHrShiftStatusRequestSchema, hrShiftQuerySchema, hrShiftScopeQuerySchema, hrShiftContextQuerySchema,
  hrCorrectionQuerySchema,hrCorrectionContextQuerySchema,createHrCorrectionRequestSchema,updateHrCorrectionRequestSchema,hrCorrectionActionRequestSchema,
  hrMonthlyAttendanceQuerySchema,
  hrDailyAttendanceQuerySchema,
  hrShiftAllocationQuerySchema, hrShiftAllocationContextQuerySchema, createHrShiftAllocationRequestSchema, closeHrShiftAllocationRequestSchema, hrShiftResolutionQuerySchema,
  hrOfferQuerySchema, hrOfferScopeQuerySchema, hrOfferContextQuerySchema, createHrOfferRequestSchema, updateHrOfferRequestSchema, hrOfferActionRequestSchema,
  hrApplicationQuerySchema, createHrApplicationRequestSchema, changeHrApplicationStageRequestSchema,
  hrCandidateQuerySchema,
  createHrCandidateRequestSchema,
  changeHrCandidateStatusRequestSchema,
} from "@nexora/contracts";

import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../auth/tenant-router.js";
import { HrEmployeeService } from "./employees/service.js";
import { HrMasterService } from "./masters/service.js";
import { HrLifecycleService } from "./lifecycle/service.js";
import { HrMovementService } from "./movements/service.js";
import { HrApiError, type SourceHrRepository } from "./source-repository.js";
import { loadHrSessionContext } from "./shared/session-context.js";

export interface HrRouterDependencies {
  repository: Pick<
    SourceHrRepository,
    | "listCompanies"
    | "listOrganizationUnits"
    | "createOrganizationUnit"
    | "updateOrganizationUnit"
    | "changeOrganizationUnitStatus"
    | "listEmployees"
    | "getDashboard"
    | "getFinancePayrollDashboard"
    | "getPositionsOrganization"
    | "listManpowerRequisitions"
    | "createManpowerRequisition"
    | "submitManpowerRequisition"
    | "decideManpowerRequisition"
    | "listJobOpenings"
    | "createJobOpening"
    | "changeJobOpeningState"
    | "listInterviewPanel"
    | "getInterviewWorkspace"
    | "performInterviewAction"
    | "getOfferEmployeeWorkspace"
    | "createOfferEmployee"
    | "listLeaveTypes"
    | "createLeaveType"
    | "updateLeavePolicy"
    | "changeLeaveTypeStatus"
    | "listLeaveBalances"
    | "leaveLedger"
    | "postLeaveBalance"
    | "leaveContext"
    | "listLeaveRequests"
    | "getLeaveRequest"
    | "createLeaveRequest"
    | "actOnLeaveRequest"
    | "getPayrollLocalization"
    | "createPayrollLocalization"
    | "decidePayrollLocalization"
    | "getOvertimeMoneyWorkspace"
    | "createOvertimeMoney"
    | "decideOvertimeMoney"
    | "getPayrollPaymentWorkspace"|"actOnPayrollPayment"
    | "getPayslipWorkspace"|"getPayslipDetail"|"releasePayslips"
    | "getLearning" | "actOnLearning" | "getLearningCertificate" | "getPersonalCorrections" | "createPersonalCorrection" | "actOnPersonalCorrection" | "getReportGovernance" | "actOnReportGovernance" | "getSelfLeaveContext" | "getSelfLeaveRequest" | "createSelfLeaveRequest" | "actOnSelfLeaveRequest" | "getSelfService" | "getSelfServicePayslip" | "getSettlementBenefits"|"actOnSettlementBenefit"|"getSettlementEntitlements"|"actOnSettlementEntitlement"|"getPolicyUpgrades"|"actOnPolicyUpgrade"|"getLifecycleCaseWorkspace"|"actOnLifecycleCase"|"getPerformanceInbox"|"getPerformanceParticipation"|"actOnPerformanceParticipation"|"getPerformanceWorkspace"|"actOnPerformance"
    | "getPayrollJournalWorkspace"
    | "actOnPayrollJournal"
    | "getPayrollRunComparison" | "getPayrollRunWorkspace"
    | "actOnPayrollRun"
    | "getPayrollWorkspace"
    | "getPayrollOptions"
    | "createPayrollRecord"
    | "actOnPayrollRecord"
    | "listOvertime"
    | "overtimeContext"
    | "getOvertime"
    | "createOvertimeRule"
    | "createOvertime"
    | "actOnOvertime"
    | "periodWorkspace"
    | "payrollInputs"
    | "actOnPeriod"
    | "listCorrections"
    | "getCorrectionContext"
    | "getCorrection"
    | "createCorrection"
    | "updateCorrection"
    | "actOnCorrection"
    | "listMonthlyAttendance"
    | "listDailyAttendance"
    | "getShiftAllocationContext"
    | "listShiftAllocations"
    | "getShiftAllocation"
    | "resolveEmployeeShift"
    | "createShiftAllocation"
    | "closeShiftAllocation"
    | "getShiftContext"
    | "listShifts"
    | "getShift"
    | "createShift"
    | "updateShift"
    | "changeShiftStatus"
    | "getOfferContext"
    | "listOffers"
    | "getOffer"
    | "createOffer"
    | "updateOffer"
    | "performOfferAction"
    | "listApplications"
    | "createApplication"
    | "changeApplicationStage"
    | "listCandidates"
    | "createCandidate"
    | "changeCandidateStatus"
    | "getEmployee"
    | "listEmployeeDrafts"
    | "getEmployeeDraft"
    | "listEmployeeDraftApprovals"
    | "getEmployeeDraftApproval"
    | "listMasters"
    | "createMaster"
    | "updateMaster"
    | "changeMasterStatus"
    | "listJobGrades"
    | "createJobGrade"
    | "updateJobGrade"
    | "createEmployeeDraft"
    | "updateEmployeeDraft"
    | "submitEmployeeDraft"
    | "decideEmployeeDraftApproval"
    | "createProfileDraftAssignment"
    | "listEmployeeContacts"
    | "createEmployeeContact"
    | "listEmployeeEmergencyContacts"
    | "createEmployeeEmergencyContact"
    | "listEmployeeDocuments"
    | "listEmployeeAssignments"
    | "listEmployeeStatusHistory"
    | "listEmployeeLifecycleEvents"
    | "listEmployeeProfileHistory"
    | "listEmploymentLifecyclePolicies"
    | "createEmploymentLifecyclePolicy"
    | "submitEmploymentLifecyclePolicy"
    | "approveEmploymentLifecyclePolicy"
    | "activateEmploymentLifecyclePolicy"
    | "createJob"
    | "listEmployeeHireRequests"
    | "getEmployeeHireRequest"
    | "createEmployeeHireRequest"
    | "decideEmployeeHireRequest"
    | "listEmployeeTransferRequests"
    | "getEmployeeTransferRequest"
    | "createEmployeeTransferRequest"
    | "decideEmployeeTransferRequest"
    | "listEmployeePromotionRequests"
    | "getEmployeePromotionRequest"
    | "createEmployeePromotionRequest"
    | "decideEmployeePromotionRequest"
    | "listEmployeeManagerChangeRequests"
    | "getEmployeeManagerChangeRequest"
    | "createEmployeeManagerChangeRequest"
    | "decideEmployeeManagerChangeRequest"
    | "listEmployeeWorkLocationChangeRequests"
    | "getEmployeeWorkLocationChangeRequest"
    | "createEmployeeWorkLocationChangeRequest"
    | "decideEmployeeWorkLocationChangeRequest"
    | "listEmployeeOrganizationPlacementChangeRequests"
    | "getEmployeeOrganizationPlacementChangeRequest"
    | "createEmployeeOrganizationPlacementChangeRequest"
    | "decideEmployeeOrganizationPlacementChangeRequest"
  >;
  authentication: TenantAuthApiService;
  sessions: TenantSessionApiService;
  secureCookies: boolean;
  allowedOrigins: ReadonlySet<string>;
}

function trustedOrigin(req: Request, allowed: ReadonlySet<string>): void {
  const origin = req.get("origin");
  if (origin && !allowed.has(origin))
    throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
}

function idempotencyKey(req: Request): string {
  const key = req.get("idempotency-key");
  if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
  return key;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function createHrRouter(dependencies: HrRouterDependencies): Router {
  const router = Router();
  const employees = new HrEmployeeService(dependencies.repository);
  const masters = new HrMasterService(dependencies.repository);
  const lifecycle = new HrLifecycleService(dependencies.repository);
  const movements = new HrMovementService(dependencies.repository);
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });

  async function handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HrApiError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }

  router.get('/attendance_overtime',async(req,res)=>{const input=hrOvertimeQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.listOvertime(context,input);}));});
  router.get('/attendance_overtime_context',async(req,res)=>{const input=hrOvertimeContextQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.overtimeContext(context,input);}));});
  router.get('/attendance_overtime/:recordId',async(req,res)=>{const company=z.string().trim().min(1).max(128).parse(req.query.company_id);const id=z.string().trim().min(1).max(128).parse(req.params.recordId);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.getOvertime(context,company,id);}));});
  router.post('/attendance_overtime',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=createHrOvertimeRequestSchema.parse(req.body);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);const key=idempotencyKey(req),corr=currentRequestContext().correlationId;return dependencies.repository.createOvertime(context,input,key,corr);}));});
  router.post('/attendance_overtime_rules',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrOvertimeRuleRequestSchema.parse(req.body);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);const key=idempotencyKey(req),corr=currentRequestContext().correlationId;return dependencies.repository.createOvertimeRule(context,input,key,corr);}));});
  router.post('/attendance_overtime/:recordId/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrOvertimeActionRequestSchema.parse(req.body);const id=z.string().trim().min(1).max(128).parse(req.params.recordId);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);const key=idempotencyKey(req),corr=currentRequestContext().correlationId;return dependencies.repository.actOnOvertime(context,id,input,key,corr);}));});
  router.get('/attendance_periods',async(req,res)=>{const input=hrAttendancePeriodQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.periodWorkspace(context,input);}));});
  router.get('/attendance_payroll_inputs',async(req,res)=>{const input=hrAttendancePeriodQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.payrollInputs(context,input);}));});
  router.post('/attendance_periods/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrAttendancePeriodActionRequestSchema.parse(req.body);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);const key=idempotencyKey(req),corr=currentRequestContext().correlationId;return dependencies.repository.actOnPeriod(context,input,key,corr);}));});
  router.get('/leave_types',async(req,res)=>{const input=hrLeaveQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.listLeaveTypes(context,input);}));});
  router.post('/leave_types',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=createHrLeaveTypeRequestSchema.parse(req.body);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);const key=idempotencyKey(req),corr=currentRequestContext().correlationId;return dependencies.repository.createLeaveType(context,input,key,corr);}));});
  router.post('/leave_types/:recordId/policies',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=updateHrLeavePolicyRequestSchema.parse(req.body);const id=z.string().trim().min(1).max(128).parse(req.params.recordId);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);const key=idempotencyKey(req),corr=currentRequestContext().correlationId;return dependencies.repository.updateLeavePolicy(context,id,input,key,corr);}));});
  router.post('/leave_types/:recordId/status',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrLeaveTypeStatusRequestSchema.parse(req.body);const id=z.string().trim().min(1).max(128).parse(req.params.recordId);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);const key=idempotencyKey(req),corr=currentRequestContext().correlationId;return dependencies.repository.changeLeaveTypeStatus(context,id,input,key,corr);}));});
  router.get('/leave_balances',async(req,res)=>{const input=hrLeaveBalanceQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.listLeaveBalances(context,input);}));});
  router.get('/leave_ledger',async(req,res)=>{const input=hrLeaveLedgerQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.leaveLedger(context,input);}));});
  router.post('/leave_balances/postings',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrLeaveBalancePostingRequestSchema.parse(req.body);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);const key=idempotencyKey(req),corr=currentRequestContext().correlationId;return dependencies.repository.postLeaveBalance(context,input,key,corr);}));});
  router.get('/leave_context',async(req,res)=>{const input=hrLeaveContextQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.leaveContext(context,input);}));});
  router.get('/leave_requests',async(req,res)=>{const input=hrLeaveRequestQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.listLeaveRequests(context,input);}));});
  router.get('/leave_requests/:recordId',async(req,res)=>{const company=z.string().trim().min(1).max(128).parse(req.query.company_id);const id=z.string().trim().min(1).max(128).parse(req.params.recordId);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.getLeaveRequest(context,company,id);}));});
  router.post('/leave_requests',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=createHrLeaveRequestSchema.parse(req.body);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);const key=idempotencyKey(req),corr=currentRequestContext().correlationId;return dependencies.repository.createLeaveRequest(context,input,key,corr);}));});
  router.post('/leave_requests/:recordId/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrLeaveRequestActionRequestSchema.parse(req.body);const id=z.string().trim().min(1).max(128).parse(req.params.recordId);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);const key=idempotencyKey(req),corr=currentRequestContext().correlationId;return dependencies.repository.actOnLeaveRequest(context,id,input,key,corr);}));});
  router.get('/payroll_workspace',async(req,res)=>{const input=hrPayrollWorkspaceQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.getPayrollWorkspace(context,input);}));});
  router.get('/payroll_options',async(req,res)=>{const input=hrPayrollOptionsQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.getPayrollOptions(context,input);}));});
  router.post('/payroll_records',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=createHrPayrollRecordSchema.parse(req.body);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);return dependencies.repository.createPayrollRecord(context,input,idempotencyKey(req),currentRequestContext().correlationId);}));});
  router.post('/payroll_records/:recordId/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrPayrollRecordActionSchema.parse(req.body);const id=z.string().trim().min(1).max(128).parse(req.params.recordId);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);return dependencies.repository.actOnPayrollRecord(context,id,input,idempotencyKey(req),currentRequestContext().correlationId);}));});
  router.get('/payroll_localization',async(req,res)=>{const q=hrLocalizationQuerySchema.parse(req.query);res.json(await handle(async()=>dependencies.repository.getPayrollLocalization(await loadHrSessionContext(req,dependencies),q)));});
  router.post('/payroll_localization',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=createHrLocalizationSchema.parse(req.body);res.json(await handle(async()=>dependencies.repository.createPayrollLocalization(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.post('/payroll_localization/:id/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrLocalizationDecisionSchema.parse(req.body),id=z.string().min(1).max(128).parse(req.params.id);res.json(await handle(async()=>dependencies.repository.decidePayrollLocalization(await loadHrSessionContext(req,dependencies,true),id,input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get('/payroll_overtime',async(req,res)=>{const input=hrOvertimeMoneyQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.getOvertimeMoneyWorkspace(context,input);}));});
  router.post('/payroll_overtime',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=createHrOvertimeMoneySchema.parse(req.body);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);return dependencies.repository.createOvertimeMoney(context,input,idempotencyKey(req),currentRequestContext().correlationId);}));});
  router.post('/payroll_overtime/:id/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrOvertimeMoneyDecisionSchema.parse(req.body),id=z.string().min(1).max(128).parse(req.params.id);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);return dependencies.repository.decideOvertimeMoney(context,id,input,idempotencyKey(req),currentRequestContext().correlationId);}));});
  router.get('/payroll_payments',async(req,res)=>{hrPayrollPaymentQuerySchema.parse(req.query);res.json(await handle(async()=>(async()=>{await loadHrSessionContext(req,dependencies);throw new HrApiError(409,'HR_PAYMENT_BANKING_INTEGRATION_DEFERRED','Payroll payment integration is deferred until the Banking module is ready.');})()));});
  router.post('/payroll_payments/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);hrPayrollPaymentActionSchema.parse(req.body);res.json(await handle(async()=>(async()=>{await loadHrSessionContext(req,dependencies,true);throw new HrApiError(409,'HR_PAYMENT_BANKING_INTEGRATION_DEFERRED','Payroll payment integration is deferred until the Banking module is ready.');})()));});
  router.get('/payslips',async(req,res)=>{const input=hrPayslipQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>dependencies.repository.getPayslipWorkspace(await loadHrSessionContext(req,dependencies),input)));});
  router.get('/payslips/:id',async(req,res)=>{const company=z.string().trim().min(1).max(128).parse(req.query.company_id),id=z.string().trim().min(1).max(128).parse(req.params.id);res.set('Cache-Control','no-store');res.json(await handle(async()=>dependencies.repository.getPayslipDetail(await loadHrSessionContext(req,dependencies),company,id)));});
  router.post('/payslips/releases',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrPayslipReleaseSchema.parse(req.body);res.json(await handle(async()=>dependencies.repository.releasePayslips(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get('/policy_upgrades',async(req,res)=>{const q=hrPolicyUpgradeQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrPolicyUpgradeWorkspaceSchema.parse(await dependencies.repository.getPolicyUpgrades(await loadHrSessionContext(req,dependencies),q))));});
  router.post('/policy_upgrades/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrPolicyUpgradeActionSchema.parse(req.body);res.json(await handle(async()=>dependencies.repository.actOnPolicyUpgrade(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get('/settlement_entitlements',async(req,res)=>{const q=hrSettlementEntitlementQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrSettlementEntitlementWorkspaceSchema.parse(await dependencies.repository.getSettlementEntitlements(await loadHrSessionContext(req,dependencies),q))));});
  router.post('/settlement_entitlements/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrSettlementEntitlementActionSchema.parse(req.body);res.json(await handle(async()=>dependencies.repository.actOnSettlementEntitlement(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get('/learning',async(req,res)=>{const q=hrLearningQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrLearningWorkspaceSchema.parse(await dependencies.repository.getLearning(await loadHrSessionContext(req,dependencies),q))));});
  router.post('/learning/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrLearningActionSchema.parse(req.body);res.set('Cache-Control','no-store');res.json(await handle(async()=>dependencies.repository.actOnLearning(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get('/learning/certificates/:id',async(req,res)=>{const q=z.strictObject({company_id:z.string().trim().min(1).max(128)}).parse(req.query),id=z.string().trim().min(1).max(128).parse(req.params.id);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrLearningCertificateSchema.parse(await dependencies.repository.getLearningCertificate(await loadHrSessionContext(req,dependencies),q.company_id,id))));});
  router.get('/personal_corrections',async(req,res)=>{const q=hrPersonalCorrectionQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrPersonalCorrectionWorkspaceSchema.parse(await dependencies.repository.getPersonalCorrections(await loadHrSessionContext(req,dependencies),q))));});
  router.post('/personal_corrections',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=createHrPersonalCorrectionSchema.parse(req.body);res.set('Cache-Control','no-store');res.json(await handle(async()=>dependencies.repository.createPersonalCorrection(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.post('/personal_corrections/:id/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrPersonalCorrectionActionSchema.parse(req.body),id=z.string().trim().min(1).max(128).parse(req.params.id);res.set('Cache-Control','no-store');res.json(await handle(async()=>dependencies.repository.actOnPersonalCorrection(await loadHrSessionContext(req,dependencies,true),id,input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get('/report_governance',async(req,res)=>{const q=hrReportGovernanceQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrReportGovernanceWorkspaceSchema.parse(await dependencies.repository.getReportGovernance(await loadHrSessionContext(req,dependencies),q))));});
  router.post('/report_governance/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrReportGovernanceActionSchema.parse(req.body);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrReportGovernanceResultSchema.parse(await dependencies.repository.actOnReportGovernance(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId))));});
  router.get('/self_service/leave_context',async(req,res)=>{const q=hrSelfLeaveContextQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrLeaveContextSchema.parse(await dependencies.repository.getSelfLeaveContext(await loadHrSessionContext(req,dependencies),q))));});
  router.get('/self_service/leave_requests/:id',async(req,res)=>{const q=hrSelfServicePayslipQuerySchema.parse(req.query),id=z.string().trim().min(1).max(128).parse(req.params.id);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrLeaveRequestDetailSchema.parse(await dependencies.repository.getSelfLeaveRequest(await loadHrSessionContext(req,dependencies),q.company_id,id))));});
  router.post('/self_service/leave_requests',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=createHrSelfLeaveRequestSchema.parse(req.body);res.json(await handle(async()=>dependencies.repository.createSelfLeaveRequest(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.post('/self_service/leave_requests/:id/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrSelfLeaveActionSchema.parse(req.body),id=z.string().trim().min(1).max(128).parse(req.params.id);res.json(await handle(async()=>dependencies.repository.actOnSelfLeaveRequest(await loadHrSessionContext(req,dependencies,true),id,input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get('/self_service',async(req,res)=>{const q=hrSelfServiceQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrSelfServiceWorkspaceSchema.parse(await dependencies.repository.getSelfService(await loadHrSessionContext(req,dependencies),q))));});
  router.get('/self_service/payslips/:id',async(req,res)=>{const q=hrSelfServicePayslipQuerySchema.parse(req.query),id=z.string().min(1).max(128).parse(req.params.id);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrPayslipDetailSchema.parse(await dependencies.repository.getSelfServicePayslip(await loadHrSessionContext(req,dependencies),q.company_id,id))));});
  router.get('/settlement_benefits',async(req,res)=>{const q=hrSettlementBenefitQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrSettlementBenefitWorkspaceSchema.parse(await dependencies.repository.getSettlementBenefits(await loadHrSessionContext(req,dependencies),q))));});
  router.post('/settlement_benefits/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrSettlementBenefitActionSchema.parse(req.body);res.json(await handle(async()=>dependencies.repository.actOnSettlementBenefit(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get('/lifecycle_cases',async(req,res)=>{const q=hrLifecycleCaseQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrLifecycleCaseWorkspaceSchema.parse(await dependencies.repository.getLifecycleCaseWorkspace(await loadHrSessionContext(req,dependencies),q))));});
  router.post('/lifecycle_cases/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrLifecycleCaseActionSchema.parse(req.body);res.json(await handle(async()=>dependencies.repository.actOnLifecycleCase(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get('/performance/inbox',async(req,res)=>{res.set('Cache-Control','no-store');res.json(await handle(async()=>hrPerformanceInboxSchema.parse(await dependencies.repository.getPerformanceInbox(await loadHrSessionContext(req,dependencies)))));});
  router.get('/performance/participation',async(req,res)=>{const q=hrPerformanceParticipationQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrPerformanceParticipationSchema.parse(await dependencies.repository.getPerformanceParticipation(await loadHrSessionContext(req,dependencies),q))));});
  router.post('/performance/participation/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrPerformanceParticipationActionSchema.parse(req.body);res.json(await handle(async()=>dependencies.repository.actOnPerformanceParticipation(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get('/performance',async(req,res)=>{const input=hrPerformanceQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>dependencies.repository.getPerformanceWorkspace(await loadHrSessionContext(req,dependencies),input)));});
  router.post('/performance/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrPerformanceCommandSchema.parse(req.body);res.json(await handle(async()=>dependencies.repository.actOnPerformance(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get('/payroll_journal',async(req,res)=>{const input=hrPayrollJournalQuerySchema.parse(req.query);res.json(await handle(async()=>dependencies.repository.getPayrollJournalWorkspace(await loadHrSessionContext(req,dependencies),input)));});
  router.post('/payroll_journal/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrPayrollJournalActionSchema.parse(req.body);res.json(await handle(async()=>dependencies.repository.actOnPayrollJournal(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get('/payroll_runs/comparison',async(req,res)=>{const input=hrPayrollRunComparisonQuerySchema.parse(req.query);res.set('Cache-Control','no-store');res.json(await handle(async()=>hrPayrollRunComparisonSchema.parse(await dependencies.repository.getPayrollRunComparison(await loadHrSessionContext(req,dependencies),input))));});
  router.get('/payroll_runs',async(req,res)=>{const input=hrPayrollRunQuerySchema.parse(req.query);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies);return dependencies.repository.getPayrollRunWorkspace(context,input);}));});
  router.post('/payroll_runs/actions',async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=hrPayrollRunActionSchema.parse(req.body);res.json(await handle(async()=>{const context=await loadHrSessionContext(req,dependencies,true);return dependencies.repository.actOnPayrollRun(context,input,idempotencyKey(req),currentRequestContext().correlationId);}));});
  router.get("/companies", async (req, res) => {
    res.json(await handle(async () => employees.listCompanies(await loadHrSessionContext(req, dependencies))));
  });
  router.get("/dashboard", async (req, res) => {
    const companyId = z.string().trim().min(1).max(128).parse(req.query.company_id);
    res.json(await handle(async () => dependencies.repository.getDashboard(await loadHrSessionContext(req, dependencies), companyId)));
  });
  router.get("/finance_payroll_dashboard", async (req, res) => {
    const companyId = z.string().trim().min(1).max(128).parse(req.query.company_id);
    res.json(
      await handle(async () =>
        dependencies.repository.getFinancePayrollDashboard(
          await loadHrSessionContext(req, dependencies),
          companyId,
        ),
      ),
    );
  });
  router.get("/positions_organization", async (req, res) => {
    const query = hrPositionsOrganizationQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () =>
        dependencies.repository.getPositionsOrganization(await loadHrSessionContext(req, dependencies), query),
      ),
    );
  });
  router.get("/manpower_requisitions", async (req, res) => {
    const query = hrManpowerRequisitionQuerySchema.parse({ company_id: req.query.company_id, search: req.query.search, state: req.query.state, limit: req.query.limit === undefined ? undefined : Number(req.query.limit) });
    res.json(await handle(async () => dependencies.repository.listManpowerRequisitions(await loadHrSessionContext(req, dependencies), query)));
  });
  router.post("/manpower_requisitions", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createHrManpowerRequisitionRequestSchema.parse(req.body);
    const result = await handle(async () => dependencies.repository.createManpowerRequisition(await loadHrSessionContext(req, dependencies, true), input, idempotencyKey(req), currentRequestContext().correlationId));
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.post("/manpower_requisitions/:requisitionId/submit", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const id = z.string().trim().min(1).max(128).parse(req.params.requisitionId), input = submitHrManpowerRequisitionRequestSchema.parse(req.body);
    res.json(await handle(async () => dependencies.repository.submitManpowerRequisition(await loadHrSessionContext(req, dependencies, true), id, input, idempotencyKey(req), currentRequestContext().correlationId)));
  });
  router.post("/manpower_requisitions/:requisitionId/decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const id = z.string().trim().min(1).max(128).parse(req.params.requisitionId), input = decideHrManpowerRequisitionRequestSchema.parse(req.body);
    res.json(await handle(async () => dependencies.repository.decideManpowerRequisition(await loadHrSessionContext(req, dependencies, true), id, input, idempotencyKey(req), currentRequestContext().correlationId)));
  });
  router.get("/job_openings", async (req, res) => {
    const query = hrJobOpeningQuerySchema.parse({ company_id: req.query.company_id, search: req.query.search, state: req.query.state, limit: req.query.limit === undefined ? undefined : Number(req.query.limit) });
    res.json(await handle(async () => dependencies.repository.listJobOpenings(await loadHrSessionContext(req, dependencies), query)));
  });
  router.post("/job_openings", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins); const input=createHrJobOpeningRequestSchema.parse(req.body);
    const result=await handle(async()=>dependencies.repository.createJobOpening(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)); res.status(result.replayed?200:201).json(result);
  });
  router.post("/job_openings/:openingId/state", async (req,res) => {
    trustedOrigin(req,dependencies.allowedOrigins); const id=z.string().trim().min(1).max(128).parse(req.params.openingId),input=changeHrJobOpeningStateRequestSchema.parse(req.body);
    res.json(await handle(async()=>dependencies.repository.changeJobOpeningState(await loadHrSessionContext(req,dependencies,true),id,input,idempotencyKey(req),currentRequestContext().correlationId)));
  });
  router.get("/recruitment_interview_panel", async(req,res)=>{
    const query=hrInterviewPanelQuerySchema.parse({company_id:req.query.company_id,search:req.query.search,limit:req.query.limit===undefined?undefined:Number(req.query.limit)});
    res.json(await handle(async()=>dependencies.repository.listInterviewPanel(await loadHrSessionContext(req,dependencies),query)));
  });
  router.get("/recruitment_interviews",async(req,res)=>{
    const query=hrInterviewWorkspaceQuerySchema.parse({company_id:req.query.company_id,application_id:req.query.application_id});
    res.json(await handle(async()=>dependencies.repository.getInterviewWorkspace(await loadHrSessionContext(req,dependencies),query)));
  });
  router.post("/recruitment_interviews/actions",async(req,res)=>{
    trustedOrigin(req,dependencies.allowedOrigins);
    const input=hrInterviewActionRequestSchema.parse(req.body);
    res.json(await handle(async()=>dependencies.repository.performInterviewAction(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId)));
  });
  router.get("/recruitment_offers/:offerId/employee",async(req,res)=>{
    const id=z.string().trim().min(1).max(128).parse(req.params.offerId),input=hrOfferScopeQuerySchema.parse({company_id:req.query.company_id});
    res.json(await handle(async()=>dependencies.repository.getOfferEmployeeWorkspace(await loadHrSessionContext(req,dependencies),input.company_id,id)));
  });
  router.post("/recruitment_offers/:offerId/employee",async(req,res)=>{
    trustedOrigin(req,dependencies.allowedOrigins);const id=z.string().trim().min(1).max(128).parse(req.params.offerId),input=createHrOfferEmployeeRequestSchema.parse(req.body);
    const result=await handle(async()=>dependencies.repository.createOfferEmployee(await loadHrSessionContext(req,dependencies,true),id,input,idempotencyKey(req),currentRequestContext().correlationId));res.status(result.replayed?200:201).json(result);
  });
  router.get("/attendance_correction_context",async(req,res)=>{const input=hrCorrectionContextQuerySchema.parse({company_id:req.query.company_id,on_date:req.query.on_date,employee_id:req.query.employee_id,search:req.query.search});res.json(await handle(async()=>dependencies.repository.getCorrectionContext(await loadHrSessionContext(req,dependencies),input)));});
  router.get("/attendance_corrections",async(req,res)=>{const input=hrCorrectionQuerySchema.parse({company_id:req.query.company_id,status:req.query.status,search:req.query.search,limit:req.query.limit===undefined?undefined:Number(req.query.limit),offset:req.query.offset===undefined?undefined:Number(req.query.offset)});res.json(await handle(async()=>dependencies.repository.listCorrections(await loadHrSessionContext(req,dependencies),input)));});
  router.get("/attendance_corrections/:correctionId",async(req,res)=>{const id=z.string().trim().min(1).max(128).parse(req.params.correctionId),companyId=z.string().trim().min(1).max(128).parse(req.query.company_id);res.json(await handle(async()=>dependencies.repository.getCorrection(await loadHrSessionContext(req,dependencies),companyId,id)));});
  router.post("/attendance_corrections",async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const input=createHrCorrectionRequestSchema.parse(req.body);const result=await handle(async()=>dependencies.repository.createCorrection(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId));res.status(result.replayed?200:201).json(result);});
  router.post("/attendance_corrections/:correctionId/draft",async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const id=z.string().trim().min(1).max(128).parse(req.params.correctionId),input=updateHrCorrectionRequestSchema.parse(req.body);res.json(await handle(async()=>dependencies.repository.updateCorrection(await loadHrSessionContext(req,dependencies,true),id,input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.post("/attendance_corrections/:correctionId/actions",async(req,res)=>{trustedOrigin(req,dependencies.allowedOrigins);const id=z.string().trim().min(1).max(128).parse(req.params.correctionId),input=hrCorrectionActionRequestSchema.parse(req.body);res.json(await handle(async()=>dependencies.repository.actOnCorrection(await loadHrSessionContext(req,dependencies,true),id,input,idempotencyKey(req),currentRequestContext().correlationId)));});
  router.get("/monthly_attendance",async(req,res)=>{const input=hrMonthlyAttendanceQuerySchema.parse({company_id:req.query.company_id,month:req.query.month,search:req.query.search,limit:req.query.limit===undefined?undefined:Number(req.query.limit),offset:req.query.offset===undefined?undefined:Number(req.query.offset)});res.json(await handle(async()=>dependencies.repository.listMonthlyAttendance(await loadHrSessionContext(req,dependencies),input)));});
  router.get("/daily_attendance",async(req,res)=>{
    const input=hrDailyAttendanceQuerySchema.parse({company_id:req.query.company_id,on_date:req.query.on_date,search:req.query.search,limit:req.query.limit===undefined?undefined:Number(req.query.limit),offset:req.query.offset===undefined?undefined:Number(req.query.offset)});
    res.json(await handle(async()=>dependencies.repository.listDailyAttendance(await loadHrSessionContext(req,dependencies),input)));
  });
  router.get("/shift_assignment_context",async(req,res)=>{
    const input=hrShiftAllocationContextQuerySchema.parse({company_id:req.query.company_id,scope:req.query.scope,on_date:req.query.on_date,search:req.query.search});
    res.json(await handle(async()=>dependencies.repository.getShiftAllocationContext(await loadHrSessionContext(req,dependencies),input)));
  });
  router.get("/shift_assignments",async(req,res)=>{
    const input=hrShiftAllocationQuerySchema.parse({company_id:req.query.company_id,scope:req.query.scope,scope_id:req.query.scope_id,on_date:req.query.on_date,state:req.query.state,search:req.query.search,limit:req.query.limit===undefined?undefined:Number(req.query.limit),offset:req.query.offset===undefined?undefined:Number(req.query.offset)});
    res.json(await handle(async()=>dependencies.repository.listShiftAllocations(await loadHrSessionContext(req,dependencies),input)));
  });
  router.get("/shift_assignments/:assignmentId",async(req,res)=>{
    const id=z.string().trim().min(1).max(128).parse(req.params.assignmentId),input=hrShiftScopeQuerySchema.parse({company_id:req.query.company_id});
    res.json(await handle(async()=>dependencies.repository.getShiftAllocation(await loadHrSessionContext(req,dependencies),input.company_id,id)));
  });
  router.get("/shift_resolution",async(req,res)=>{
    const input=hrShiftResolutionQuerySchema.parse({company_id:req.query.company_id,employee_id:req.query.employee_id,on_date:req.query.on_date});
    res.json(await handle(async()=>dependencies.repository.resolveEmployeeShift(await loadHrSessionContext(req,dependencies),input)));
  });
  router.post("/shift_assignments",async(req,res)=>{
    trustedOrigin(req,dependencies.allowedOrigins);const input=createHrShiftAllocationRequestSchema.parse(req.body);
    const result=await handle(async()=>dependencies.repository.createShiftAllocation(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId));res.status(result.replayed?200:201).json(result);
  });
  router.post("/shift_assignments/:assignmentId/close",async(req,res)=>{
    trustedOrigin(req,dependencies.allowedOrigins);const id=z.string().trim().min(1).max(128).parse(req.params.assignmentId),input=closeHrShiftAllocationRequestSchema.parse(req.body);
    res.json(await handle(async()=>dependencies.repository.closeShiftAllocation(await loadHrSessionContext(req,dependencies,true),id,input,idempotencyKey(req),currentRequestContext().correlationId)));
  });
  router.get("/shift_context",async(req,res)=>{
    const input=hrShiftContextQuerySchema.parse({company_id:req.query.company_id,search:req.query.search});
    res.json(await handle(async()=>dependencies.repository.getShiftContext(await loadHrSessionContext(req,dependencies),input)));
  });
  router.get("/shifts",async(req,res)=>{
    const input=hrShiftQuerySchema.parse({company_id:req.query.company_id,search:req.query.search,status:req.query.status,leaf_only:req.query.leaf_only===undefined?false:z.enum(["true","false"]).parse(req.query.leaf_only)==="true",limit:req.query.limit===undefined?undefined:Number(req.query.limit),offset:req.query.offset===undefined?undefined:Number(req.query.offset)});
    res.json(await handle(async()=>dependencies.repository.listShifts(await loadHrSessionContext(req,dependencies),input)));
  });
  router.get("/shifts/:shiftId",async(req,res)=>{
    const id=z.string().trim().min(1).max(128).parse(req.params.shiftId),input=hrShiftScopeQuerySchema.parse({company_id:req.query.company_id,on_date:req.query.on_date});
    res.json(await handle(async()=>dependencies.repository.getShift(await loadHrSessionContext(req,dependencies),input.company_id,id,input.on_date)));
  });
  router.post("/shifts",async(req,res)=>{
    trustedOrigin(req,dependencies.allowedOrigins);const input=createHrShiftRequestSchema.parse(req.body);
    const result=await handle(async()=>dependencies.repository.createShift(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId));res.status(result.replayed?200:201).json(result);
  });
  router.post("/shifts/:shiftId/rules",async(req,res)=>{
    trustedOrigin(req,dependencies.allowedOrigins);const id=z.string().trim().min(1).max(128).parse(req.params.shiftId),input=updateHrShiftRequestSchema.parse(req.body);
    res.json(await handle(async()=>dependencies.repository.updateShift(await loadHrSessionContext(req,dependencies,true),id,input,idempotencyKey(req),currentRequestContext().correlationId)));
  });
  router.post("/shifts/:shiftId/status",async(req,res)=>{
    trustedOrigin(req,dependencies.allowedOrigins);const id=z.string().trim().min(1).max(128).parse(req.params.shiftId),input=changeHrShiftStatusRequestSchema.parse(req.body);
    res.json(await handle(async()=>dependencies.repository.changeShiftStatus(await loadHrSessionContext(req,dependencies,true),id,input,idempotencyKey(req),currentRequestContext().correlationId)));
  });
  router.get("/recruitment_offer_context",async(req,res)=>{
    const input=hrOfferContextQuerySchema.parse({company_id:req.query.company_id,application_id:req.query.application_id});
    res.json(await handle(async()=>dependencies.repository.getOfferContext(await loadHrSessionContext(req,dependencies),input)));
  });
  router.get("/recruitment_offers",async(req,res)=>{
    const input=hrOfferQuerySchema.parse({company_id:req.query.company_id,search:req.query.search,state:req.query.state,limit:req.query.limit===undefined?undefined:Number(req.query.limit),offset:req.query.offset===undefined?undefined:Number(req.query.offset)});
    res.json(await handle(async()=>dependencies.repository.listOffers(await loadHrSessionContext(req,dependencies),input)));
  });
  router.get("/recruitment_offers/:offerId",async(req,res)=>{
    const id=z.string().trim().min(1).max(128).parse(req.params.offerId),input=hrOfferScopeQuerySchema.parse({company_id:req.query.company_id});
    res.json(await handle(async()=>dependencies.repository.getOffer(await loadHrSessionContext(req,dependencies),input.company_id,id)));
  });
  router.post("/recruitment_offers",async(req,res)=>{
    trustedOrigin(req,dependencies.allowedOrigins);const input=createHrOfferRequestSchema.parse(req.body);
    const result=await handle(async()=>dependencies.repository.createOffer(await loadHrSessionContext(req,dependencies,true),input,idempotencyKey(req),currentRequestContext().correlationId));res.status(result.replayed?200:201).json(result);
  });
  router.post("/recruitment_offers/:offerId/terms",async(req,res)=>{
    trustedOrigin(req,dependencies.allowedOrigins);const id=z.string().trim().min(1).max(128).parse(req.params.offerId),input=updateHrOfferRequestSchema.parse(req.body);
    res.json(await handle(async()=>dependencies.repository.updateOffer(await loadHrSessionContext(req,dependencies,true),id,input,idempotencyKey(req),currentRequestContext().correlationId)));
  });
  router.post("/recruitment_offers/:offerId/actions",async(req,res)=>{
    trustedOrigin(req,dependencies.allowedOrigins);const id=z.string().trim().min(1).max(128).parse(req.params.offerId),input=hrOfferActionRequestSchema.parse(req.body);
    res.json(await handle(async()=>dependencies.repository.performOfferAction(await loadHrSessionContext(req,dependencies,true),id,input,idempotencyKey(req),currentRequestContext().correlationId)));
  });
  router.get("/applications", async (req, res) => {
    const query = hrApplicationQuerySchema.parse({ company_id: req.query.company_id, search: req.query.search, stage: req.query.stage, limit: req.query.limit === undefined ? undefined : Number(req.query.limit), offset: req.query.offset === undefined ? undefined : Number(req.query.offset) });
    res.json(await handle(async () => dependencies.repository.listApplications(await loadHrSessionContext(req, dependencies), query)));
  });
  router.post("/applications", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createHrApplicationRequestSchema.parse(req.body);
    const result = await handle(async () => dependencies.repository.createApplication(await loadHrSessionContext(req, dependencies, true), input, idempotencyKey(req), currentRequestContext().correlationId));
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.post("/applications/:applicationId/stage", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const id = z.string().trim().min(1).max(128).parse(req.params.applicationId);
    const input = changeHrApplicationStageRequestSchema.parse(req.body);
    res.json(await handle(async () => dependencies.repository.changeApplicationStage(await loadHrSessionContext(req, dependencies, true), id, input, idempotencyKey(req), currentRequestContext().correlationId)));
  });
  router.get("/candidates", async (req, res) => {
    const query = hrCandidateQuerySchema.parse({ company_id: req.query.company_id, search: req.query.search, status: req.query.status, limit: req.query.limit === undefined ? undefined : Number(req.query.limit) });
    res.json(await handle(async () => dependencies.repository.listCandidates(await loadHrSessionContext(req, dependencies), query)));
  });
  router.post("/candidates", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins); const input = createHrCandidateRequestSchema.parse(req.body);
    const result = await handle(async () => dependencies.repository.createCandidate(await loadHrSessionContext(req, dependencies, true), input, idempotencyKey(req), currentRequestContext().correlationId)); res.status(result.replayed ? 200 : 201).json(result);
  });
  router.post("/candidates/:candidateId/status", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins); const id = z.string().trim().min(1).max(128).parse(req.params.candidateId), input = changeHrCandidateStatusRequestSchema.parse(req.body);
    res.json(await handle(async () => dependencies.repository.changeCandidateStatus(await loadHrSessionContext(req, dependencies, true), id, input, idempotencyKey(req), currentRequestContext().correlationId)));
  });
  router.get("/organization_units", async (req, res) => {
    const query = hrOrganizationUnitDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      type: req.query.type,
      include_inactive: req.query.include_inactive === "true",
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => employees.listOrganizationUnits(await loadHrSessionContext(req, dependencies), query)),
    );
  });

  router.post("/organization_units", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createHrOrganizationUnitRequestSchema.parse(req.body);
    const result = await handle(async () => dependencies.repository.createOrganizationUnit(
      await loadHrSessionContext(req, dependencies, true), input, idempotencyKey(req), currentRequestContext().correlationId,
    ));
    res.status(result.replayed ? 200 : 201).json(result);
  });

  router.patch("/organization_units/:unitId", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = updateHrOrganizationUnitRequestSchema.parse(req.body);
    res.json(await handle(async () => dependencies.repository.updateOrganizationUnit(
      await loadHrSessionContext(req, dependencies, true), req.params.unitId, input, idempotencyKey(req), currentRequestContext().correlationId,
    )));
  });

  router.post("/organization_units/:unitId/status", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = changeHrOrganizationUnitStatusRequestSchema.parse(req.body);
    res.json(await handle(async () => dependencies.repository.changeOrganizationUnitStatus(
      await loadHrSessionContext(req, dependencies, true), req.params.unitId, input, idempotencyKey(req), currentRequestContext().correlationId,
    )));
  });

  router.get("/employees", async (req, res) => {
    const query = hrEmployeeDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      status: req.query.status,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => employees.list(await loadHrSessionContext(req, dependencies), query)));
  });
  router.post("/employees", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createHrEmployeeDraftRequestSchema.parse(req.body);
    const result = await handle(async () =>
      employees.createDraft(
        await loadHrSessionContext(req, dependencies, true),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employee_drafts", async (req, res) => {
    const query = hrEmployeeDraftDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => employees.listDrafts(await loadHrSessionContext(req, dependencies), query)));
  });
  router.get("/employee_drafts/:employeeId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(await handle(async () => employees.getDraft(await loadHrSessionContext(req, dependencies), employeeId)));
  });
  router.post("/employee_drafts/:employeeId", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = updateHrEmployeeDraftRequestSchema.parse(req.body);
    const result = await handle(async () =>
      employees.updateDraft(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 200).json(result);
  });
  router.post("/employee_drafts/:employeeId/submit", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = submitHrEmployeeDraftRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        employees.submitDraft(
          await loadHrSessionContext(req, dependencies, true),
          employeeId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.get("/employee_draft_approvals", async (req, res) => {
    const query = hrEmployeeDraftApprovalQueueQuerySchema.parse({
      company_id: req.query.company_id,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => employees.listDraftApprovals(await loadHrSessionContext(req, dependencies), query)),
    );
  });
  router.get("/employee_draft_approvals/:employeeId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(
      await handle(async () => employees.getDraftApproval(await loadHrSessionContext(req, dependencies), employeeId)),
    );
  });
  router.post("/employee_drafts/:employeeId/approval_decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = decideHrEmployeeDraftApprovalRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        employees.decideDraftApproval(
          await loadHrSessionContext(req, dependencies, true),
          employeeId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.post("/employees/:employeeId/profile_draft_assignment", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrProfileDraftAssignmentRequestSchema.parse(req.body);
    const result = await handle(async () =>
      employees.createProfileDraftAssignment(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/hire_requests", async (req, res) => {
    const query = hrEmployeeHireRequestDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => lifecycle.listHireRequests(await loadHrSessionContext(req, dependencies), query)),
    );
  });
  router.post("/employees/:employeeId/hire_requests", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrEmployeeHireRequestSchema.parse(req.body);
    const result = await handle(async () =>
      lifecycle.requestHire(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employees/:employeeId/hire_requests/:requestId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    res.json(
      await handle(async () =>
        lifecycle.getHireRequest(await loadHrSessionContext(req, dependencies), employeeId, requestId),
      ),
    );
  });
  router.post("/employees/:employeeId/hire_requests/:requestId/decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    const input = decideHrEmployeeHireRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        lifecycle.decideHire(
          await loadHrSessionContext(req, dependencies, true),
          employeeId,
          requestId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.get("/transfer_requests", async (req, res) => {
    const query = hrEmployeeTransferRequestDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => movements.listTransfers(await loadHrSessionContext(req, dependencies), query)));
  });
  router.post("/employees/:employeeId/transfer_requests", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrEmployeeTransferRequestSchema.parse(req.body);
    const result = await handle(async () =>
      movements.requestTransfer(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employees/:employeeId/transfer_requests/:requestId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    res.json(
      await handle(async () =>
        movements.getTransfer(await loadHrSessionContext(req, dependencies), employeeId, requestId),
      ),
    );
  });
  router.post("/employees/:employeeId/transfer_requests/:requestId/decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    const input = decideHrEmployeeTransferRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        movements.decideTransfer(
          await loadHrSessionContext(req, dependencies, true),
          employeeId,
          requestId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.get("/promotion_requests", async (req, res) => {
    const query = hrEmployeePromotionRequestDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => movements.listPromotions(await loadHrSessionContext(req, dependencies), query)));
  });
  router.post("/employees/:employeeId/promotion_requests", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrEmployeePromotionRequestSchema.parse(req.body);
    const result = await handle(async () =>
      movements.requestPromotion(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employees/:employeeId/promotion_requests/:requestId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    res.json(
      await handle(async () =>
        movements.getPromotion(await loadHrSessionContext(req, dependencies), employeeId, requestId),
      ),
    );
  });
  router.post("/employees/:employeeId/promotion_requests/:requestId/decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    const input = decideHrEmployeePromotionRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        movements.decidePromotion(
          await loadHrSessionContext(req, dependencies, true),
          employeeId,
          requestId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.get("/manager_change_requests", async (req, res) => {
    const query = hrEmployeeManagerChangeRequestDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => movements.listManagerChanges(await loadHrSessionContext(req, dependencies), query)),
    );
  });
  router.post("/employees/:employeeId/manager_change_requests", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrEmployeeManagerChangeRequestSchema.parse(req.body);
    const result = await handle(async () =>
      movements.requestManagerChange(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employees/:employeeId/manager_change_requests/:requestId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    res.json(
      await handle(async () =>
        movements.getManagerChange(await loadHrSessionContext(req, dependencies), employeeId, requestId),
      ),
    );
  });
  router.post("/employees/:employeeId/manager_change_requests/:requestId/decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    const input = decideHrEmployeeManagerChangeRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        movements.decideManagerChange(
          await loadHrSessionContext(req, dependencies, true),
          employeeId,
          requestId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.get("/work_location_change_requests", async (req, res) => {
    const query = hrEmployeeWorkLocationChangeRequestDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => movements.listWorkLocationChanges(await loadHrSessionContext(req, dependencies), query)),
    );
  });
  router.post("/employees/:employeeId/work_location_change_requests", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrEmployeeWorkLocationChangeRequestSchema.parse(req.body);
    const result = await handle(async () =>
      movements.requestWorkLocationChange(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employees/:employeeId/work_location_change_requests/:requestId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    res.json(
      await handle(async () =>
        movements.getWorkLocationChange(await loadHrSessionContext(req, dependencies), employeeId, requestId),
      ),
    );
  });
  router.post("/employees/:employeeId/work_location_change_requests/:requestId/decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    const input = decideHrEmployeeWorkLocationChangeRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        movements.decideWorkLocationChange(
          await loadHrSessionContext(req, dependencies, true),
          employeeId,
          requestId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.get("/organization_placement_change_requests", async (req, res) => {
    const query = hrEmployeeOrganizationPlacementChangeRequestDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () =>
        movements.listOrganizationPlacementChanges(await loadHrSessionContext(req, dependencies), query),
      ),
    );
  });
  router.post("/employees/:employeeId/organization_placement_change_requests", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrEmployeeOrganizationPlacementChangeRequestSchema.parse(req.body);
    const result = await handle(async () =>
      movements.requestOrganizationPlacementChange(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employees/:employeeId/organization_placement_change_requests/:requestId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    res.json(
      await handle(async () =>
        movements.getOrganizationPlacementChange(await loadHrSessionContext(req, dependencies), employeeId, requestId),
      ),
    );
  });
  router.post("/employees/:employeeId/organization_placement_change_requests/:requestId/decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    const input = decideHrEmployeeOrganizationPlacementChangeRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        movements.decideOrganizationPlacementChange(
          await loadHrSessionContext(req, dependencies, true),
          employeeId,
          requestId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.get("/employees/:employeeId/contacts", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(
      await handle(async () => employees.listContacts(await loadHrSessionContext(req, dependencies), employeeId)),
    );
  });
  router.post("/employees/:employeeId/contacts", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrEmployeeContactRequestSchema.parse(req.body);
    const result = await handle(async () =>
      employees.createContact(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employees/:employeeId/emergency_contacts", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(
      await handle(async () =>
        employees.listEmergencyContacts(await loadHrSessionContext(req, dependencies), employeeId),
      ),
    );
  });
  router.post("/employees/:employeeId/emergency_contacts", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrEmployeeEmergencyContactRequestSchema.parse(req.body);
    const result = await handle(async () =>
      employees.createEmergencyContact(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employees/:employeeId/documents", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(
      await handle(async () => employees.listDocuments(await loadHrSessionContext(req, dependencies), employeeId)),
    );
  });
  router.get("/employees/:employeeId/assignments", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(
      await handle(async () => employees.listAssignments(await loadHrSessionContext(req, dependencies), employeeId)),
    );
  });
  router.get("/employees/:employeeId/status_history", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(
      await handle(async () => employees.listStatusHistory(await loadHrSessionContext(req, dependencies), employeeId)),
    );
  });
  router.get("/employees/:employeeId/lifecycle_events", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const query = hrEmployeeHistoryQuerySchema.parse({
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      cursor: req.query.cursor,
    });
    res.json(
      await handle(async () =>
        employees.listLifecycleEvents(await loadHrSessionContext(req, dependencies), employeeId, query),
      ),
    );
  });
  router.get("/employees/:employeeId/profile_history", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const query = hrEmployeeHistoryQuerySchema.parse({
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      cursor: req.query.cursor,
    });
    res.json(
      await handle(async () =>
        employees.listProfileHistory(await loadHrSessionContext(req, dependencies), employeeId, query),
      ),
    );
  });
  router.get("/employees/:employeeId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(await handle(async () => employees.get(await loadHrSessionContext(req, dependencies), employeeId)));
  });
  router.get("/masters", async (req, res) => {
    const query = hrMasterDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      type: req.query.type,
      active_only: parseBoolean(req.query.active_only) ?? true,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => masters.list(await loadHrSessionContext(req, dependencies), query)));
  });
  router.post("/masters", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createHrMasterRequestSchema.parse(req.body);
    const result = await handle(async () => dependencies.repository.createMaster(await loadHrSessionContext(req, dependencies, true), input, idempotencyKey(req), currentRequestContext().correlationId));
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.patch("/masters/:masterId", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = updateHrMasterRequestSchema.parse(req.body);
    res.json(await handle(async () => dependencies.repository.updateMaster(await loadHrSessionContext(req, dependencies, true), req.params.masterId, input, idempotencyKey(req), currentRequestContext().correlationId)));
  });
  router.post("/masters/:masterId/status", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = changeHrMasterStatusRequestSchema.parse(req.body);
    res.json(await handle(async () => dependencies.repository.changeMasterStatus(await loadHrSessionContext(req, dependencies, true), req.params.masterId, input, idempotencyKey(req), currentRequestContext().correlationId)));
  });
  router.get("/job_grades", async (req, res) => {
    const companyId = z.string().trim().min(1).max(128).parse(req.query.company_id);
    res.json(await handle(async () => dependencies.repository.listJobGrades(await loadHrSessionContext(req, dependencies), companyId)));
  });
  router.post("/job_grades", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createHrJobGradeRequestSchema.parse(req.body);
    const result = await handle(async () => dependencies.repository.createJobGrade(
      await loadHrSessionContext(req, dependencies, true), input, idempotencyKey(req), currentRequestContext().correlationId,
    ));
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.patch("/job_grades/:gradeId", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const gradeId = z.string().trim().min(1).max(128).parse(req.params.gradeId);
    const input = updateHrJobGradeRequestSchema.parse(req.body);
    res.json(await handle(async () => dependencies.repository.updateJobGrade(
      await loadHrSessionContext(req, dependencies, true), gradeId, input, idempotencyKey(req), currentRequestContext().correlationId,
    )));
  });
  router.post("/jobs", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createHrJobRequestSchema.parse(req.body);
    const result = await handle(async () =>
      dependencies.repository.createJob(
        await loadHrSessionContext(req, dependencies, true),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employment_lifecycle_policies", async (req, res) => {
    const query = hrEmploymentLifecyclePolicyDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => lifecycle.listPolicies(await loadHrSessionContext(req, dependencies), query)));
  });
  router.post("/employment_lifecycle_policies", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createHrEmploymentLifecyclePolicyRequestSchema.parse(req.body);
    const result = await handle(async () =>
      lifecycle.createPolicy(
        await loadHrSessionContext(req, dependencies, true),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.post("/employment_lifecycle_policies/:policyId/submit", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const policyId = z.string().trim().min(1).max(128).parse(req.params.policyId);
    const input = submitHrEmploymentLifecyclePolicyRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        lifecycle.submitPolicy(
          await loadHrSessionContext(req, dependencies, true),
          policyId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.post("/employment_lifecycle_policies/:policyId/approval_decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const policyId = z.string().trim().min(1).max(128).parse(req.params.policyId);
    const input = approveHrEmploymentLifecyclePolicyRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        lifecycle.approvePolicy(
          await loadHrSessionContext(req, dependencies, true),
          policyId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.post("/employment_lifecycle_policies/:policyId/activate", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const policyId = z.string().trim().min(1).max(128).parse(req.params.policyId);
    const input = activateHrEmploymentLifecyclePolicyRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        lifecycle.activatePolicy(
          await loadHrSessionContext(req, dependencies, true),
          policyId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  return router;
}
