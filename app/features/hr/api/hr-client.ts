import type {
  CreateHrEmployeeDraftRequest,
  HrEmployeeDetail,
  HrCompanyDirectory,
  HrOrganizationUnitDirectory,
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

  organizationUnits(input: {
    companyId: string;
    type?: "branch" | "department";
    limit?: number;
  }): Promise<HrOrganizationUnitDirectory> {
    return this.api.listHrOrganizationUnits(
      query({ company_id: input.companyId, type: input.type, limit: input.limit ?? 200 }),
    );
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
}
