import type {HrLearningQuery,HrLearningAction} from "@nexora/contracts";
import type {HrPersonalCorrectionQuery,CreateHrPersonalCorrection,HrPersonalCorrectionAction,HrReportGovernanceQuery,HrReportGovernanceAction,HrReportGovernanceResult} from '@nexora/contracts';
import type {HrSelfLeaveContextQuery,CreateHrSelfLeaveRequest,HrSelfLeaveAction} from '@nexora/contracts';
import type {HrSelfServiceQuery,HrSelfServiceWorkspace} from '@nexora/contracts';
import type {HrSettlementEntitlementQuery,HrSettlementEntitlementAction,HrSettlementEntitlementWorkspace} from '@nexora/contracts';
import type {HrPolicyUpgradeQuery,HrPolicyUpgradeAction,HrPolicyUpgradeWorkspace} from '@nexora/contracts';
import type {HrLifecycleCaseQuery,HrLifecycleCaseAction,HrLifecycleCaseWorkspace} from '@nexora/contracts';
import type {HrPerformanceInbox} from '@nexora/contracts';
import type {HrPerformanceParticipationQuery,HrPerformanceParticipationAction,HrPerformanceParticipation} from '@nexora/contracts';
import type {HrPerformanceQuery,HrPerformanceCommand,HrPerformanceWorkspace} from '@nexora/contracts';
import type {HrPayslipQuery,HrPayslipRelease,HrPayslipWorkspace,HrPayslipDetail} from '@nexora/contracts';
import type {HrPayrollPaymentQuery,HrPayrollPaymentAction,HrPayrollPaymentWorkspace} from '@nexora/contracts';
import type {HrPayrollJournalQuery,HrPayrollJournalAction,HrPayrollJournalWorkspace} from '@nexora/contracts';
import type {HrLocalizationQuery,CreateHrLocalization,HrLocalizationDecision,HrLocalizationWorkspace,HrOvertimeMoneyQuery,CreateHrOvertimeMoney,HrOvertimeMoneyDecision,HrOvertimeMoneyWorkspace} from '@nexora/contracts';
import type {HrPayrollRunComparisonQuery,HrPayrollRunComparison,HrPayrollRunQuery,HrPayrollRunAction,HrPayrollRunWorkspace} from '@nexora/contracts';
import type {HrPayrollSection,HrPayrollWorkspaceQuery,HrPayrollWorkspace,HrPayrollItem,HrPayrollOptionsQuery,HrPayrollOptions,CreateHrPayrollRecord,HrPayrollRecordAction,HrPayrollMutationResult} from '@nexora/contracts';
import type {HrLeaveQuery,HrLeavePolicyInput,CreateHrLeaveTypeRequest,UpdateHrLeavePolicyRequest,HrLeaveTypeStatusRequest,HrLeavePolicy,HrLeaveType,HrLeaveTypeDirectory,HrLeaveAllocation,HrLeaveContextQuery,HrLeaveBalance,HrLeaveBalanceQuery,HrLeaveBalanceDirectory,HrLeaveLedgerQuery,HrLeaveLedger,HrLeaveBalancePostingRequest,HrLeaveContext,CreateHrLeaveRequest,HrLeaveRequestActionRequest,HrLeaveRequestQuery,HrLeaveRequestSummary,HrLeaveRequestDirectory,HrLeaveRequestDetail} from '@nexora/contracts';
import type {HrOvertimeQuery,HrOvertimeContextQuery,HrOvertimeRuleRequest,HrOvertimeRule,HrOvertimeEvidence,HrOvertimeContext,CreateHrOvertimeRequest,HrOvertimeActionRequest,HrAttendanceCompletionResult,HrOvertimeSummary,HrOvertimeDetail,HrOvertimeDirectory,HrAttendancePeriodQuery,HrAttendancePeriodActionRequest,HrAttendanceCloseDay,HrAttendanceCloseEmployee,HrAttendancePeriod,HrAttendancePeriodWorkspace,HrAttendancePayrollInputs} from '@nexora/contracts';
import type {
  HrCorrectionQuery,HrCorrectionContextQuery,HrCorrectionContext,CreateHrCorrectionRequest,UpdateHrCorrectionRequest,HrCorrectionActionRequest,HrCorrectionSummary,HrCorrectionDirectory,HrCorrectionDetail,HrCorrectionEvidence,HrCorrectionResult,
  HrMonthlyAttendanceQuery, HrMonthlyAttendanceDirectory,
  HrDailyAttendanceQuery, HrDailyAttendanceDirectory,
  CreateHrEmployeeDraftRequest,
  HrEmployeeDetail,
  HrCompanyDirectory,
  HrDashboardSummary,
  HrFinancePayrollDashboard,
  HrPositionsOrganization,
  HrManpowerRequisitionDirectory,
  CreateHrManpowerRequisitionRequest,
  HrManpowerRequisitionResult,
  SubmitHrManpowerRequisitionRequest,
  DecideHrManpowerRequisitionRequest,
  HrJobOpeningDirectory, CreateHrJobOpeningRequest, ChangeHrJobOpeningStateRequest, HrJobOpeningResult,
  HrApplicationDirectory, CreateHrApplicationRequest, ChangeHrApplicationStageRequest, HrApplicationResult,
  HrInterviewPanelDirectory, HrInterviewWorkspace, HrInterviewActionRequest, HrInterviewActionResult,
  HrOfferContext, HrOfferDirectory, HrOfferDetail, CreateHrOfferRequest, UpdateHrOfferRequest, HrOfferActionRequest, HrOfferResult,
  CreateHrOfferEmployeeRequest, HrOfferEmployeeResult, HrOfferEmployeeWorkspace,
  CreateHrShiftRequest, UpdateHrShiftRequest, ChangeHrShiftStatusRequest, HrShiftQuery, HrShiftSummary, HrShiftDirectory, HrShiftDetail, HrShiftResult, HrShiftContext,
  HrShiftAllocationQuery, HrShiftAllocationContextQuery, HrShiftAllocationContext, CreateHrShiftAllocationRequest, CloseHrShiftAllocationRequest, HrShiftAllocationSummary, HrShiftAllocationDirectory, HrShiftAllocationDetail, HrShiftAllocationResult, HrShiftResolutionQuery, HrShiftResolution,
  HrCandidateDirectory, CreateHrCandidateRequest, ChangeHrCandidateStatusRequest, HrCandidateResult,
  HrOrganizationUnitDirectory,
  CreateHrOrganizationUnitRequest,
  UpdateHrOrganizationUnitRequest,
  ChangeHrOrganizationUnitStatusRequest,
  HrOrganizationUnitMutationResult,
  HrEmployeeDraftDirectory,
  HrEmployeeDraftDetail,
  HrEmployeeDraftApprovalQueue,
  HrEmployeeDraftApprovalDetail,
  HrEmployeeDirectory,
  HrEmployeeDraftResult,
  UpdateHrEmployeeDraftRequest,
  SubmitHrEmployeeDraftRequest,
  DecideHrEmployeeDraftApprovalRequest,
  CreateHrProfileDraftAssignmentRequest,
  HrProfileDraftAssignmentResult,
  HrEmployeeStatus,
  HrEmployeeContactDirectory,
  CreateHrEmployeeContactRequest,
  HrEmployeeContactResult,
  HrEmployeeEmergencyContactDirectory,
  CreateHrEmployeeEmergencyContactRequest,
  HrEmployeeEmergencyContactResult,
  HrEmployeeDocumentDirectory,
  HrEmployeeAssignmentDirectory,
  HrEmployeeStatusHistoryDirectory,
  HrEmployeeLifecycleEventDirectory,
  HrEmployeeProfileVersionDirectory,
  HrEmploymentLifecyclePolicyDirectory,
  CreateHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicyResult,
  SubmitHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicySubmissionResult,
  ApproveHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicyApprovalResult,
  ActivateHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicyActivationResult,
  HrMasterDirectory,
  HrMasterType,
  CreateHrMasterRequest,
  UpdateHrMasterRequest,
  ChangeHrMasterStatusRequest,
  HrMasterMutationResult,
  HrJobGradeDirectory,
  CreateHrJobGradeRequest,
  UpdateHrJobGradeRequest,
  CreateHrJobRequest,
  HrJobResult,
  CreateHrEmployeeHireRequest,
  HrEmployeeHireRequestResult,
  DecideHrEmployeeHireRequest,
  HrEmployeeHireDecisionResult,
  HrEmployeeHireRequestDirectory,
  HrEmployeeHireRequestReview,
  CreateHrEmployeeTransferRequest,
  HrEmployeeTransferRequestResult,
  DecideHrEmployeeTransferRequest,
  HrEmployeeTransferDecisionResult,
  HrEmployeeTransferRequestDirectory,
  HrEmployeeTransferRequestReview,
  CreateHrEmployeePromotionRequest,
  HrEmployeePromotionRequestResult,
  DecideHrEmployeePromotionRequest,
  HrEmployeePromotionDecisionResult,
  HrEmployeePromotionRequestDirectory,
  HrEmployeePromotionRequestReview,
  CreateHrEmployeeManagerChangeRequest,
  HrEmployeeManagerChangeRequestResult,
  DecideHrEmployeeManagerChangeRequest,
  HrEmployeeManagerChangeDecisionResult,
  HrEmployeeManagerChangeRequestDirectory,
  HrEmployeeManagerChangeRequestReview,
  CreateHrEmployeeWorkLocationChangeRequest,
  HrEmployeeWorkLocationChangeRequestResult,
  DecideHrEmployeeWorkLocationChangeRequest,
  HrEmployeeWorkLocationChangeDecisionResult,
  HrEmployeeWorkLocationChangeRequestDirectory,
  HrEmployeeWorkLocationChangeRequestReview,
  CreateHrEmployeeOrganizationPlacementChangeRequest,
  HrEmployeeOrganizationPlacementChangeRequestResult,
  DecideHrEmployeeOrganizationPlacementChangeRequest,
  HrEmployeeOrganizationPlacementChangeDecisionResult,
  HrEmployeeOrganizationPlacementChangeRequestDirectory,
  HrEmployeeOrganizationPlacementChangeRequestReview,
} from "@nexora/contracts";

import type { NexoraApiClient } from "@/lib/api/generated";

function query(values: Record<string, string | number | boolean | undefined>): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") parameters.set(key, String(value));
  }
  const result = parameters.toString();
  return result ? `?${result}` : "";
}

/**
 * The only browser-facing HR data boundary. Views receive this adapter through
 * their feature integration layer; they never construct URLs or access storage.
 */
import type {HrSettlementBenefitQuery,HrSettlementBenefitAction} from '@nexora/contracts';
export class HrApiClient {
  constructor(private readonly api: NexoraApiClient) {}

  companies(): Promise<HrCompanyDirectory> {
    return this.api.listHrCompanies();
  }

  dashboard(companyId: string): Promise<HrDashboardSummary> {
    return this.api.getHrDashboard(query({ company_id: companyId }));
  }

  financePayrollDashboard(companyId: string): Promise<HrFinancePayrollDashboard> {
    return this.api.getHrFinancePayrollDashboard(query({ company_id: companyId }));
  }

  positionsOrganization(input: { companyId: string; search?: string; limit?: number }): Promise<HrPositionsOrganization> {
    return this.api.getHrPositionsOrganization(
      query({ company_id: input.companyId, search: input.search, limit: input.limit ?? 100 }),
    );
  }

  manpowerRequisitions(input: { companyId: string; search?: string; state?: string; limit?: number }): Promise<HrManpowerRequisitionDirectory> {
    return this.api.listHrManpowerRequisitions(query({ company_id: input.companyId, search: input.search, state: input.state, limit: input.limit ?? 50 }));
  }

  createManpowerRequisition(input: CreateHrManpowerRequisitionRequest, csrfToken: string, idempotencyKey: string): Promise<HrManpowerRequisitionResult> {
    return this.api.createHrManpowerRequisition(input, csrfToken, idempotencyKey);
  }

  submitManpowerRequisition(id: string, input: SubmitHrManpowerRequisitionRequest, csrfToken: string, idempotencyKey: string): Promise<HrManpowerRequisitionResult> {
    return this.api.submitHrManpowerRequisition(id, input, csrfToken, idempotencyKey);
  }

  decideManpowerRequisition(id: string, input: DecideHrManpowerRequisitionRequest, csrfToken: string, idempotencyKey: string): Promise<HrManpowerRequisitionResult> {
    return this.api.decideHrManpowerRequisition(id, input, csrfToken, idempotencyKey);
  }

  jobOpenings(input: { companyId: string; search?: string; state?: string; limit?: number }): Promise<HrJobOpeningDirectory> { return this.api.listHrJobOpenings(query({ company_id: input.companyId, search: input.search, state: input.state, limit: input.limit ?? 50 })); }
  createJobOpening(input: CreateHrJobOpeningRequest, csrfToken: string, idempotencyKey: string): Promise<HrJobOpeningResult> { return this.api.createHrJobOpening(input, csrfToken, idempotencyKey); }
  changeJobOpeningState(id: string, input: ChangeHrJobOpeningStateRequest, csrfToken: string, idempotencyKey: string): Promise<HrJobOpeningResult> { return this.api.changeHrJobOpeningState(id, input, csrfToken, idempotencyKey); }
  interviewPanel(input: {companyId: string; search?: string}): Promise<HrInterviewPanelDirectory> {return this.api.listHrInterviewPanel(query({company_id:input.companyId,search:input.search,limit:100}));}
  interviewWorkspace(companyId: string, applicationId: string): Promise<HrInterviewWorkspace> {return this.api.getHrInterviewWorkspace(query({company_id:companyId,application_id:applicationId}));}
  interviewAction(input: HrInterviewActionRequest, csrfToken: string, key: string): Promise<HrInterviewActionResult> {return this.api.performHrInterviewAction(input,csrfToken,key);}
  offerEmployeeWorkspace(companyId:string,id:string):Promise<HrOfferEmployeeWorkspace> {return this.api.getHrOfferEmployeeWorkspace(id,query({company_id:companyId}));}
  createOfferEmployee(id:string,input:CreateHrOfferEmployeeRequest,csrf:string,key:string):Promise<HrOfferEmployeeResult> {return this.api.createHrOfferEmployee(id,input,csrf,key);}
  listOvertime(input:HrOvertimeQuery):Promise<HrOvertimeDirectory>{return this.api.attendanceListOvertime(query(input));}
  overtimeContext(input:HrOvertimeContextQuery):Promise<HrOvertimeContext>{return this.api.attendanceOvertimeContext(query(input));}
  getOvertime(company:string,id:string):Promise<HrOvertimeDetail>{return this.api.attendanceGetOvertime(id,query({company_id:company}));}
  createOvertime(input:CreateHrOvertimeRequest,key:string,csrf:string):Promise<HrAttendanceCompletionResult>{return this.api.attendanceCreateOvertime(input,csrf,key);}
  createOvertimeRule(input:HrOvertimeRuleRequest,key:string,csrf:string):Promise<HrAttendanceCompletionResult>{return this.api.attendanceCreateOvertimeRule(input,csrf,key);}
  actOnOvertime(id:string,input:HrOvertimeActionRequest,key:string,csrf:string):Promise<HrAttendanceCompletionResult>{return this.api.attendanceActOnOvertime(id,input,csrf,key);}
  periodWorkspace(input:HrAttendancePeriodQuery):Promise<HrAttendancePeriodWorkspace>{return this.api.attendancePeriodWorkspace(query(input));}
  payrollInputs(input:HrAttendancePeriodQuery):Promise<HrAttendancePayrollInputs>{return this.api.attendancePayrollInputs(query(input));}
  actOnPeriod(input:HrAttendancePeriodActionRequest,key:string,csrf:string):Promise<HrAttendanceCompletionResult>{return this.api.attendanceActOnPeriod(input,csrf,key);}
  listLeaveTypes(input:HrLeaveQuery):Promise<HrLeaveTypeDirectory>{return this.api.timeLeaveListLeaveTypes(query(input));}
  createLeaveType(input:CreateHrLeaveTypeRequest,csrf:string,key:string):Promise<HrAttendanceCompletionResult>{return this.api.timeLeaveCreateLeaveType(input,csrf,key);}
  updateLeavePolicy(id:string,input:UpdateHrLeavePolicyRequest,csrf:string,key:string):Promise<HrAttendanceCompletionResult>{return this.api.timeLeaveUpdateLeavePolicy(id,input,csrf,key);}
  changeLeaveTypeStatus(id:string,input:HrLeaveTypeStatusRequest,csrf:string,key:string):Promise<HrAttendanceCompletionResult>{return this.api.timeLeaveChangeLeaveTypeStatus(id,input,csrf,key);}
  listLeaveBalances(input:HrLeaveBalanceQuery):Promise<HrLeaveBalanceDirectory>{return this.api.timeLeaveListLeaveBalances(query(input));}
  leaveLedger(input:HrLeaveLedgerQuery):Promise<HrLeaveLedger>{return this.api.timeLeaveLeaveLedger(query(input));}
  postLeaveBalance(input:HrLeaveBalancePostingRequest,csrf:string,key:string):Promise<HrAttendanceCompletionResult>{return this.api.timeLeavePostLeaveBalance(input,csrf,key);}
  leaveContext(input:HrLeaveContextQuery):Promise<HrLeaveContext>{return this.api.timeLeaveLeaveContext(query(input));}
  listLeaveRequests(input:HrLeaveRequestQuery):Promise<HrLeaveRequestDirectory>{return this.api.timeLeaveListLeaveRequests(query(input));}
  getLeaveRequest(company:string,id:string):Promise<HrLeaveRequestDetail>{return this.api.timeLeaveGetLeaveRequest(id,query({company_id:company}));}
  createLeaveRequest(input:CreateHrLeaveRequest,csrf:string,key:string):Promise<HrAttendanceCompletionResult>{return this.api.timeLeaveCreateLeaveRequest(input,csrf,key);}
  actOnLeaveRequest(id:string,input:HrLeaveRequestActionRequest,csrf:string,key:string):Promise<HrAttendanceCompletionResult>{return this.api.timeLeaveActOnLeaveRequest(id,input,csrf,key);}
  payrollLocalization(input:HrLocalizationQuery):Promise<HrLocalizationWorkspace>{return this.api.payrollLocalization(query(input));}
  createPayrollLocalization(input:CreateHrLocalization,csrf:string,key:string):Promise<HrPayrollMutationResult>{return this.api.createPayrollLocalization(input,csrf,key);}
  decidePayrollLocalization(id:string,input:HrLocalizationDecision,csrf:string,key:string):Promise<HrPayrollMutationResult>{return this.api.decidePayrollLocalization(id,input,csrf,key);}
  overtimeMoneyWorkspace(input:HrOvertimeMoneyQuery):Promise<HrOvertimeMoneyWorkspace>{return this.api.overtimeMoneyWorkspace(query(input));}
  createOvertimeMoney(input:CreateHrOvertimeMoney,csrf:string,key:string):Promise<HrPayrollMutationResult>{return this.api.createOvertimeMoney(input,csrf,key);}
  decideOvertimeMoney(id:string,input:HrOvertimeMoneyDecision,csrf:string,key:string):Promise<HrPayrollMutationResult>{return this.api.decideOvertimeMoney(id,input,csrf,key);}
  payrollPaymentWorkspace(input:HrPayrollPaymentQuery):Promise<HrPayrollPaymentWorkspace>{return this.api.payrollPaymentWorkspace(query(input));}
  actOnPayrollPayment(input:HrPayrollPaymentAction,csrf:string,key:string){return this.api.actOnPayrollPayment(input,csrf,key);}
  learning(q:HrLearningQuery){return this.api.learning('?'+new URLSearchParams(Object.entries(q).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])));}
  actOnLearning(input:HrLearningAction,csrf:string,key:string){return this.api.actOnLearning(input,csrf,key);}
  learningCertificate(company:string,id:string){return this.api.learningCertificate(company,id);}
  personalCorrections(q:HrPersonalCorrectionQuery){return this.api.personalCorrections('?'+new URLSearchParams(Object.entries(q).map(([k,v])=>[k,String(v)])));}
  createPersonalCorrection(input:CreateHrPersonalCorrection,csrf:string,key:string){return this.api.createPersonalCorrection(input,csrf,key);}
  actOnPersonalCorrection(id:string,input:HrPersonalCorrectionAction,csrf:string,key:string){return this.api.actOnPersonalCorrection(id,input,csrf,key);}
  reportGovernance(q:HrReportGovernanceQuery){return this.api.reportGovernance('?'+new URLSearchParams(Object.entries(q).map(([k,v])=>[k,String(v)])));}
  actOnReportGovernance(input:HrReportGovernanceAction,csrf:string,key:string){return this.api.actOnReportGovernance(input,csrf,key);}
  selfLeaveContext(q:HrSelfLeaveContextQuery){return this.api.selfLeaveContext('?'+new URLSearchParams(Object.entries(q).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])));}
  selfLeaveRequest(company:string,id:string){return this.api.selfLeaveRequest(company,id);}
  createSelfLeaveRequest(input:CreateHrSelfLeaveRequest,csrf:string,key:string){return this.api.createSelfLeaveRequest(input,csrf,key);}
  actOnSelfLeaveRequest(id:string,input:HrSelfLeaveAction,csrf:string,key:string){return this.api.actOnSelfLeaveRequest(id,input,csrf,key);}
  selfService(q:HrSelfServiceQuery):Promise<HrSelfServiceWorkspace>{return this.api.selfService('?'+new URLSearchParams(Object.entries(q).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])));}
  selfServicePayslip(company:string,id:string){return this.api.selfServicePayslip(company,id);}
  payslipWorkspace(input:HrPayslipQuery):Promise<HrPayslipWorkspace>{return this.api.payslipWorkspace(query(input));}
  payslipDetail(company:string,id:string):Promise<HrPayslipDetail>{return this.api.payslipDetail(company,id);}
  releasePayslips(input:HrPayslipRelease,csrf:string,key:string){return this.api.releasePayslips(input,csrf,key);}
  performanceWorkspace(input:HrPerformanceQuery):Promise<HrPerformanceWorkspace>{return this.api.performanceWorkspace(query(input));}
  policyUpgradeWorkspace(input:HrPolicyUpgradeQuery):Promise<HrPolicyUpgradeWorkspace>{return this.api.policyUpgradeWorkspace(query(input));}
  settlementEntitlements(q:HrSettlementEntitlementQuery){return this.api.settlementEntitlements('?'+new URLSearchParams(Object.entries(q).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])));}
  actOnSettlementEntitlement(input:HrSettlementEntitlementAction,csrf:string,key:string){return this.api.actOnSettlementEntitlement(input,csrf,key);}
  settlementBenefits(q:HrSettlementBenefitQuery){return this.api.settlementBenefits('?'+new URLSearchParams(Object.entries(q).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])));}
  actOnSettlementBenefit(input:HrSettlementBenefitAction,csrf:string,key:string){return this.api.actOnSettlementBenefit(input,csrf,key);}
  actOnPolicyUpgrade(input:HrPolicyUpgradeAction,csrf:string,key:string){return this.api.actOnPolicyUpgrade(input,csrf,key);}
  lifecycleCaseWorkspace(input:HrLifecycleCaseQuery):Promise<HrLifecycleCaseWorkspace>{return this.api.lifecycleCaseWorkspace(query(input));}
  actOnLifecycleCase(input:HrLifecycleCaseAction,csrf:string,key:string){return this.api.actOnLifecycleCase(input,csrf,key);}
  performanceInbox():Promise<HrPerformanceInbox>{return this.api.performanceInbox();}
  performanceParticipation(input:HrPerformanceParticipationQuery):Promise<HrPerformanceParticipation>{return this.api.performanceParticipation(query(input));}
  actOnPerformanceParticipation(input:HrPerformanceParticipationAction,csrf:string,key:string){return this.api.actOnPerformanceParticipation(input,csrf,key);}
  actOnPerformance(input:HrPerformanceCommand,csrf:string,key:string){return this.api.actOnPerformance(input,csrf,key);}
  payrollJournalWorkspace(input:HrPayrollJournalQuery):Promise<HrPayrollJournalWorkspace>{return this.api.payrollJournalWorkspace(query(input));}
  actOnPayrollJournal(input:HrPayrollJournalAction,csrf:string,key:string){return this.api.actOnPayrollJournal(input,csrf,key);}
  payrollRunComparison(input:HrPayrollRunComparisonQuery):Promise<HrPayrollRunComparison>{return this.api.payrollRunComparison(query(input));}
  payrollRunWorkspace(input:HrPayrollRunQuery):Promise<HrPayrollRunWorkspace>{return this.api.payrollRunWorkspace(query(input));}
  actOnPayrollRun(input:HrPayrollRunAction,csrf:string,key:string):Promise<HrPayrollMutationResult>{return this.api.actOnPayrollRun(input,csrf,key);}
  payrollWorkspace(input:HrPayrollWorkspaceQuery):Promise<HrPayrollWorkspace>{return this.api.payrollWorkspace(query(input));}
  payrollOptions(input:HrPayrollOptionsQuery):Promise<HrPayrollOptions>{return this.api.payrollOptions(query(input));}
  createPayrollRecord(input:CreateHrPayrollRecord,csrf:string,key:string):Promise<HrPayrollMutationResult>{return this.api.createPayrollRecord(input,csrf,key);}
  actOnPayrollRecord(id:string,input:HrPayrollRecordAction,csrf:string,key:string):Promise<HrPayrollMutationResult>{return this.api.actOnPayrollRecord(id,input,csrf,key);}
  corrections(input:HrCorrectionQuery):Promise<HrCorrectionDirectory>{return this.api.listHrCorrections(query(input));}
  correctionContext(input:HrCorrectionContextQuery):Promise<HrCorrectionContext>{return this.api.getHrCorrectionContext(query(input));}
  correction(companyId:string,id:string):Promise<HrCorrectionDetail>{return this.api.getHrCorrection(id,query({company_id:companyId}));}
  createCorrection(input:CreateHrCorrectionRequest,csrf:string,key:string):Promise<HrCorrectionResult>{return this.api.createHrCorrection(input,csrf,key);}
  updateCorrection(id:string,input:UpdateHrCorrectionRequest,csrf:string,key:string):Promise<HrCorrectionResult>{return this.api.updateHrCorrection(id,input,csrf,key);}
  correctionAction(id:string,input:HrCorrectionActionRequest,csrf:string,key:string):Promise<HrCorrectionResult>{return this.api.actOnHrCorrection(id,input,csrf,key);}
  monthlyAttendance(input:HrMonthlyAttendanceQuery):Promise<HrMonthlyAttendanceDirectory>{return this.api.listHrMonthlyAttendance(query(input));}
  dailyAttendance(input:HrDailyAttendanceQuery):Promise<HrDailyAttendanceDirectory>{return this.api.listHrDailyAttendance(query(input));}
  shiftAllocationContext(input:{companyId:string;scope:CreateHrShiftAllocationRequest["scope"];onDate:string;search?:string}):Promise<HrShiftAllocationContext> {return this.api.getHrShiftAllocationContext(query({company_id:input.companyId,scope:input.scope,on_date:input.onDate,search:input.search}));}
  shiftAllocations(input:{companyId:string;search?:string;scope?:CreateHrShiftAllocationRequest["scope"];scopeId?:string;onDate?:string;state?:string;limit?:number;offset?:number}):Promise<HrShiftAllocationDirectory> {return this.api.listHrShiftAllocations(query({company_id:input.companyId,search:input.search,scope:input.scope,scope_id:input.scopeId,on_date:input.onDate,state:input.state,limit:input.limit??50,offset:input.offset??0}));}
  shiftAllocation(companyId:string,id:string):Promise<HrShiftAllocationDetail> {return this.api.getHrShiftAllocation(id,query({company_id:companyId}));}
  resolveShift(input:{companyId:string;employeeId:string;onDate:string}):Promise<HrShiftResolution> {return this.api.resolveHrEmployeeShift(query({company_id:input.companyId,employee_id:input.employeeId,on_date:input.onDate}));}
  createShiftAllocation(input:CreateHrShiftAllocationRequest,csrf:string,key:string):Promise<HrShiftAllocationResult> {return this.api.createHrShiftAllocation(input,csrf,key);}
  closeShiftAllocation(id:string,input:CloseHrShiftAllocationRequest,csrf:string,key:string):Promise<HrShiftAllocationResult> {return this.api.closeHrShiftAllocation(id,input,csrf,key);}
  shiftContext(companyId:string,search?:string):Promise<HrShiftContext> {return this.api.getHrShiftContext(query({company_id:companyId,search}));}
  shifts(input:{companyId:string;search?:string;status?:string;leafOnly?:boolean;limit?:number;offset?:number}):Promise<HrShiftDirectory> {return this.api.listHrShifts(query({company_id:input.companyId,search:input.search,status:input.status,leaf_only:input.leafOnly??false,limit:input.limit??50,offset:input.offset??0}));}
  shift(companyId:string,id:string,onDate?:string):Promise<HrShiftDetail> {return this.api.getHrShift(id,query({company_id:companyId,on_date:onDate}));}
  createShift(input:CreateHrShiftRequest,csrf:string,key:string):Promise<HrShiftResult> {return this.api.createHrShift(input,csrf,key);}
  updateShift(id:string,input:UpdateHrShiftRequest,csrf:string,key:string):Promise<HrShiftResult> {return this.api.updateHrShift(id,input,csrf,key);}
  shiftStatus(id:string,input:ChangeHrShiftStatusRequest,csrf:string,key:string):Promise<HrShiftResult> {return this.api.changeHrShiftStatus(id,input,csrf,key);}
  offerContext(companyId: string, applicationId: string): Promise<HrOfferContext> {return this.api.getHrOfferContext(query({company_id:companyId,application_id:applicationId}));}
  offers(input: {companyId: string; search?: string; state?: string; offset?: number}): Promise<HrOfferDirectory> {return this.api.listHrOffers(query({company_id:input.companyId,search:input.search,state:input.state,offset:input.offset??0,limit:50}));}
  offer(companyId: string,id: string): Promise<HrOfferDetail> {return this.api.getHrOffer(id,query({company_id:companyId}));}
  createOffer(input: CreateHrOfferRequest,csrf: string,key: string): Promise<HrOfferResult> {return this.api.createHrOffer(input,csrf,key);}
  updateOffer(id: string,input: UpdateHrOfferRequest,csrf: string,key: string): Promise<HrOfferResult> {return this.api.updateHrOffer(id,input,csrf,key);}
  offerAction(id: string,input: HrOfferActionRequest,csrf: string,key: string): Promise<HrOfferResult> {return this.api.performHrOfferAction(id,input,csrf,key);}
  applications(input: { companyId: string; search?: string; stage?: string; limit?: number; offset?: number }): Promise<HrApplicationDirectory> { return this.api.listHrApplications(query({company_id: input.companyId,search:input.search,stage:input.stage,limit:input.limit ?? 100,offset:input.offset ?? 0})); }
  createApplication(input: CreateHrApplicationRequest, csrfToken: string, key: string): Promise<HrApplicationResult> { return this.api.createHrApplication(input,csrfToken,key); }
  changeApplicationStage(id: string, input: ChangeHrApplicationStageRequest, csrfToken: string, key: string): Promise<HrApplicationResult> { return this.api.changeHrApplicationStage(id,input,csrfToken,key); }
  candidates(input: { companyId: string; search?: string; status?: string; limit?: number }): Promise<HrCandidateDirectory> { return this.api.listHrCandidates(query({ company_id: input.companyId, search: input.search, status: input.status, limit: input.limit ?? 50 })); }
  createCandidate(input: CreateHrCandidateRequest, csrfToken: string, idempotencyKey: string): Promise<HrCandidateResult> { return this.api.createHrCandidate(input, csrfToken, idempotencyKey); }
  changeCandidateStatus(id: string, input: ChangeHrCandidateStatusRequest, csrfToken: string, idempotencyKey: string): Promise<HrCandidateResult> { return this.api.changeHrCandidateStatus(id, input, csrfToken, idempotencyKey); }

  organizationUnits(input: {
    companyId: string;
    type?: "business_unit" | "division" | "branch" | "department" | "warehouse";
    includeInactive?: boolean;
    limit?: number;
  }): Promise<HrOrganizationUnitDirectory> {
    return this.api.listHrOrganizationUnits(
      query({ company_id: input.companyId, type: input.type, include_inactive: input.includeInactive, limit: input.limit ?? 200 }),
    );
  }

  createOrganizationUnit(input: CreateHrOrganizationUnitRequest, csrfToken: string, idempotencyKey: string): Promise<HrOrganizationUnitMutationResult> {
    return this.api.createHrOrganizationUnit(input, csrfToken, idempotencyKey);
  }

  updateOrganizationUnit(unitId: string, input: UpdateHrOrganizationUnitRequest, csrfToken: string, idempotencyKey: string): Promise<HrOrganizationUnitMutationResult> {
    return this.api.updateHrOrganizationUnit(unitId, input, csrfToken, idempotencyKey);
  }

  changeOrganizationUnitStatus(unitId: string, input: ChangeHrOrganizationUnitStatusRequest, csrfToken: string, idempotencyKey: string): Promise<HrOrganizationUnitMutationResult> {
    return this.api.changeHrOrganizationUnitStatus(unitId, input, csrfToken, idempotencyKey);
  }

  employees(input: {
    companyId: string;
    search?: string;
    status?: HrEmployeeStatus;
    limit?: number;
  }): Promise<HrEmployeeDirectory> {
    return this.api.listHrEmployees(
      query({ company_id: input.companyId, search: input.search, status: input.status, limit: input.limit ?? 50 }),
    );
  }

  employee(employeeId: string): Promise<HrEmployeeDetail> {
    return this.api.getHrEmployee(employeeId);
  }

  employeeDrafts(input: { companyId: string; search?: string; limit?: number }): Promise<HrEmployeeDraftDirectory> {
    return this.api.listHrEmployeeDrafts(
      query({ company_id: input.companyId, search: input.search, limit: input.limit ?? 50 }),
    );
  }

  employeeDraft(employeeId: string): Promise<HrEmployeeDraftDetail> {
    return this.api.getHrEmployeeDraft(employeeId);
  }

  employeeDraftApprovals(input: { companyId: string; limit?: number }): Promise<HrEmployeeDraftApprovalQueue> {
    return this.api.listHrEmployeeDraftApprovals(query({ company_id: input.companyId, limit: input.limit ?? 50 }));
  }

  employeeDraftApproval(employeeId: string): Promise<HrEmployeeDraftApprovalDetail> {
    return this.api.getHrEmployeeDraftApproval(employeeId);
  }

  createEmployeeDraft(
    input: CreateHrEmployeeDraftRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeDraftResult> {
    return this.api.createHrEmployeeDraft(input, csrfToken, idempotencyKey);
  }

  updateEmployeeDraft(
    employeeId: string,
    input: UpdateHrEmployeeDraftRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeDraftResult> {
    return this.api.updateHrEmployeeDraft(employeeId, input, csrfToken, idempotencyKey);
  }

  submitEmployeeDraft(
    employeeId: string,
    input: SubmitHrEmployeeDraftRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeDraftResult> {
    return this.api.submitHrEmployeeDraft(employeeId, input, csrfToken, idempotencyKey);
  }

  decideEmployeeDraftApproval(
    employeeId: string,
    input: DecideHrEmployeeDraftApprovalRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeDraftResult> {
    return this.api.decideHrEmployeeDraftApproval(employeeId, input, csrfToken, idempotencyKey);
  }

  createProfileDraftAssignment(
    employeeId: string,
    input: CreateHrProfileDraftAssignmentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrProfileDraftAssignmentResult> {
    return this.api.createHrProfileDraftAssignment(employeeId, input, csrfToken, idempotencyKey);
  }

  employeeContacts(employeeId: string): Promise<HrEmployeeContactDirectory> {
    return this.api.listHrEmployeeContacts(employeeId);
  }

  createEmployeeContact(
    employeeId: string,
    input: CreateHrEmployeeContactRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeContactResult> {
    return this.api.createHrEmployeeContact(employeeId, input, csrfToken, idempotencyKey);
  }

  employeeEmergencyContacts(employeeId: string): Promise<HrEmployeeEmergencyContactDirectory> {
    return this.api.listHrEmployeeEmergencyContacts(employeeId);
  }

  createEmployeeEmergencyContact(
    employeeId: string,
    input: CreateHrEmployeeEmergencyContactRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeEmergencyContactResult> {
    return this.api.createHrEmployeeEmergencyContact(employeeId, input, csrfToken, idempotencyKey);
  }

  employeeDocuments(employeeId: string): Promise<HrEmployeeDocumentDirectory> {
    return this.api.listHrEmployeeDocuments(employeeId);
  }

  employeeAssignments(employeeId: string): Promise<HrEmployeeAssignmentDirectory> {
    return this.api.listHrEmployeeAssignments(employeeId);
  }

  employeeStatusHistory(employeeId: string): Promise<HrEmployeeStatusHistoryDirectory> {
    return this.api.listHrEmployeeStatusHistory(employeeId);
  }

  employeeLifecycleEvents(
    employeeId: string,
    input: { limit?: number; cursor?: string } = {},
  ): Promise<HrEmployeeLifecycleEventDirectory> {
    return this.api.listHrEmployeeLifecycleEvents(
      employeeId,
      query({ limit: input.limit ?? 25, cursor: input.cursor }),
    );
  }

  employeeProfileHistory(
    employeeId: string,
    input: { limit?: number; cursor?: string } = {},
  ): Promise<HrEmployeeProfileVersionDirectory> {
    return this.api.listHrEmployeeProfileHistory(employeeId, query({ limit: input.limit ?? 25, cursor: input.cursor }));
  }

  employmentLifecyclePolicies(input: {
    companyId: string;
    limit?: number;
  }): Promise<HrEmploymentLifecyclePolicyDirectory> {
    return this.api.listHrEmploymentLifecyclePolicies(query({ company_id: input.companyId, limit: input.limit ?? 50 }));
  }

  createEmploymentLifecyclePolicy(
    input: CreateHrEmploymentLifecyclePolicyRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmploymentLifecyclePolicyResult> {
    return this.api.createHrEmploymentLifecyclePolicy(input, csrfToken, idempotencyKey);
  }

  submitEmploymentLifecyclePolicy(
    policyId: string,
    input: SubmitHrEmploymentLifecyclePolicyRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmploymentLifecyclePolicySubmissionResult> {
    return this.api.submitHrEmploymentLifecyclePolicy(policyId, input, csrfToken, idempotencyKey);
  }

  approveEmploymentLifecyclePolicy(
    policyId: string,
    input: ApproveHrEmploymentLifecyclePolicyRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmploymentLifecyclePolicyApprovalResult> {
    return this.api.approveHrEmploymentLifecyclePolicy(policyId, input, csrfToken, idempotencyKey);
  }

  activateEmploymentLifecyclePolicy(
    policyId: string,
    input: ActivateHrEmploymentLifecyclePolicyRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmploymentLifecyclePolicyActivationResult> {
    return this.api.activateHrEmploymentLifecyclePolicy(policyId, input, csrfToken, idempotencyKey);
  }

  masters(input: {
    companyId: string;
    type?: HrMasterType;
    activeOnly?: boolean;
    limit?: number;
  }): Promise<HrMasterDirectory> {
    return this.api.listHrMasters(
      query({
        company_id: input.companyId,
        type: input.type,
        active_only: input.activeOnly ?? true,
        limit: input.limit ?? 100,
      }),
    );
  }

  createJob(input: CreateHrJobRequest, csrfToken: string, idempotencyKey: string): Promise<HrJobResult> {
    return this.api.createHrJob(input, csrfToken, idempotencyKey);
  }

  createMaster(input: CreateHrMasterRequest, csrfToken: string, idempotencyKey: string): Promise<HrMasterMutationResult> {
    return this.api.createHrMaster(input, csrfToken, idempotencyKey);
  }

  updateMaster(masterId: string, input: UpdateHrMasterRequest, csrfToken: string, idempotencyKey: string): Promise<HrMasterMutationResult> {
    return this.api.updateHrMaster(masterId, input, csrfToken, idempotencyKey);
  }

  changeMasterStatus(masterId: string, input: ChangeHrMasterStatusRequest, csrfToken: string, idempotencyKey: string): Promise<HrMasterMutationResult> {
    return this.api.changeHrMasterStatus(masterId, input, csrfToken, idempotencyKey);
  }

  jobGrades(companyId: string): Promise<HrJobGradeDirectory> {
    return this.api.listHrJobGrades(query({ company_id: companyId }));
  }

  createJobGrade(input: CreateHrJobGradeRequest, csrfToken: string, idempotencyKey: string): Promise<HrMasterMutationResult> {
    return this.api.createHrJobGrade(input, csrfToken, idempotencyKey);
  }

  updateJobGrade(gradeId: string, input: UpdateHrJobGradeRequest, csrfToken: string, idempotencyKey: string): Promise<HrMasterMutationResult> {
    return this.api.updateHrJobGrade(gradeId, input, csrfToken, idempotencyKey);
  }

  createHireRequest(
    employeeId: string,
    input: CreateHrEmployeeHireRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeHireRequestResult> {
    return this.api.createHrEmployeeHireRequest(employeeId, input, csrfToken, idempotencyKey);
  }
  hireRequests(input: { companyId: string; search?: string; limit?: number }): Promise<HrEmployeeHireRequestDirectory> {
    return this.api.listHrEmployeeHireRequests(
      query({ company_id: input.companyId, search: input.search, limit: input.limit ?? 50 }),
    );
  }
  hireRequest(employeeId: string, requestId: string): Promise<HrEmployeeHireRequestReview> {
    return this.api.getHrEmployeeHireRequest(employeeId, requestId);
  }
  decideHireRequest(
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeHireRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeHireDecisionResult> {
    return this.api.decideHrEmployeeHireRequest(employeeId, requestId, input, csrfToken, idempotencyKey);
  }

  createTransferRequest(
    employeeId: string,
    input: CreateHrEmployeeTransferRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeTransferRequestResult> {
    return this.api.createHrEmployeeTransferRequest(employeeId, input, csrfToken, idempotencyKey);
  }

  transferRequests(input: {
    companyId: string;
    search?: string;
    limit?: number;
  }): Promise<HrEmployeeTransferRequestDirectory> {
    return this.api.listHrEmployeeTransferRequests(
      query({ company_id: input.companyId, search: input.search, limit: input.limit ?? 50 }),
    );
  }

  transferRequest(employeeId: string, requestId: string): Promise<HrEmployeeTransferRequestReview> {
    return this.api.getHrEmployeeTransferRequest(employeeId, requestId);
  }

  decideTransferRequest(
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeTransferRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeTransferDecisionResult> {
    return this.api.decideHrEmployeeTransferRequest(employeeId, requestId, input, csrfToken, idempotencyKey);
  }

  createPromotionRequest(
    employeeId: string,
    input: CreateHrEmployeePromotionRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeePromotionRequestResult> {
    return this.api.createHrEmployeePromotionRequest(employeeId, input, csrfToken, idempotencyKey);
  }

  promotionRequests(input: {
    companyId: string;
    search?: string;
    limit?: number;
  }): Promise<HrEmployeePromotionRequestDirectory> {
    return this.api.listHrEmployeePromotionRequests(
      query({ company_id: input.companyId, search: input.search, limit: input.limit ?? 50 }),
    );
  }

  promotionRequest(employeeId: string, requestId: string): Promise<HrEmployeePromotionRequestReview> {
    return this.api.getHrEmployeePromotionRequest(employeeId, requestId);
  }

  decidePromotionRequest(
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeePromotionRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeePromotionDecisionResult> {
    return this.api.decideHrEmployeePromotionRequest(employeeId, requestId, input, csrfToken, idempotencyKey);
  }

  createManagerChangeRequest(
    employeeId: string,
    input: CreateHrEmployeeManagerChangeRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeManagerChangeRequestResult> {
    return this.api.createHrEmployeeManagerChangeRequest(employeeId, input, csrfToken, idempotencyKey);
  }

  managerChangeRequests(input: {
    companyId: string;
    search?: string;
    limit?: number;
  }): Promise<HrEmployeeManagerChangeRequestDirectory> {
    return this.api.listHrEmployeeManagerChangeRequests(
      query({ company_id: input.companyId, search: input.search, limit: input.limit ?? 50 }),
    );
  }

  managerChangeRequest(employeeId: string, requestId: string): Promise<HrEmployeeManagerChangeRequestReview> {
    return this.api.getHrEmployeeManagerChangeRequest(employeeId, requestId);
  }

  decideManagerChangeRequest(
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeManagerChangeRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeManagerChangeDecisionResult> {
    return this.api.decideHrEmployeeManagerChangeRequest(employeeId, requestId, input, csrfToken, idempotencyKey);
  }

  createWorkLocationChangeRequest(
    employeeId: string,
    input: CreateHrEmployeeWorkLocationChangeRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeWorkLocationChangeRequestResult> {
    return this.api.createHrEmployeeWorkLocationChangeRequest(employeeId, input, csrfToken, idempotencyKey);
  }

  workLocationChangeRequests(input: {
    companyId: string;
    search?: string;
    limit?: number;
  }): Promise<HrEmployeeWorkLocationChangeRequestDirectory> {
    return this.api.listHrEmployeeWorkLocationChangeRequests(
      query({ company_id: input.companyId, search: input.search, limit: input.limit ?? 50 }),
    );
  }

  workLocationChangeRequest(employeeId: string, requestId: string): Promise<HrEmployeeWorkLocationChangeRequestReview> {
    return this.api.getHrEmployeeWorkLocationChangeRequest(employeeId, requestId);
  }

  decideWorkLocationChangeRequest(
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeWorkLocationChangeRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeWorkLocationChangeDecisionResult> {
    return this.api.decideHrEmployeeWorkLocationChangeRequest(employeeId, requestId, input, csrfToken, idempotencyKey);
  }

  createOrganizationPlacementChangeRequest(
    employeeId: string,
    input: CreateHrEmployeeOrganizationPlacementChangeRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeOrganizationPlacementChangeRequestResult> {
    return this.api.createHrEmployeeOrganizationPlacementChangeRequest(employeeId, input, csrfToken, idempotencyKey);
  }

  organizationPlacementChangeRequests(input: {
    companyId: string;
    search?: string;
    limit?: number;
  }): Promise<HrEmployeeOrganizationPlacementChangeRequestDirectory> {
    return this.api.listHrEmployeeOrganizationPlacementChangeRequests(
      query({ company_id: input.companyId, search: input.search, limit: input.limit }),
    );
  }

  organizationPlacementChangeRequest(
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeeOrganizationPlacementChangeRequestReview> {
    return this.api.getHrEmployeeOrganizationPlacementChangeRequest(employeeId, requestId);
  }

  decideOrganizationPlacementChangeRequest(
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeOrganizationPlacementChangeRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<HrEmployeeOrganizationPlacementChangeDecisionResult> {
    return this.api.decideHrEmployeeOrganizationPlacementChangeRequest(
      employeeId,
      requestId,
      input,
      csrfToken,
      idempotencyKey,
    );
  }
}
