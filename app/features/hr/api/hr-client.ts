import type {
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
