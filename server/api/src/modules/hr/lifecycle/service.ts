import type {
  CreateHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicyDirectory,
  HrEmploymentLifecyclePolicyDirectoryQuery,
  HrEmploymentLifecyclePolicyResult,
  SubmitHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicySubmissionResult,
  ApproveHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicyApprovalResult,
  ActivateHrEmploymentLifecyclePolicyRequest,
  HrEmploymentLifecyclePolicyActivationResult,
  CreateHrEmployeeHireRequest,
  HrEmployeeHireRequestResult,
  DecideHrEmployeeHireRequest,
  HrEmployeeHireDecisionResult,
  HrEmployeeHireRequestDirectory,
  HrEmployeeHireRequestDirectoryQuery,
  HrEmployeeHireRequestReview,
} from "@nexora/contracts";

import type { HrActorContext, SourceHrRepository } from "../source-repository.js";

/** Lifecycle use-cases stay separate from employee-profile workflows. */
export class HrLifecycleService {
  constructor(
    private readonly repository: Pick<
      SourceHrRepository,
      | "listEmploymentLifecyclePolicies"
      | "createEmploymentLifecyclePolicy"
      | "submitEmploymentLifecyclePolicy"
      | "approveEmploymentLifecyclePolicy"
      | "activateEmploymentLifecyclePolicy"
      | "listEmployeeHireRequests"
      | "getEmployeeHireRequest"
      | "createEmployeeHireRequest"
      | "decideEmployeeHireRequest"
    >,
  ) {}

  listPolicies(
    context: HrActorContext,
    query: HrEmploymentLifecyclePolicyDirectoryQuery,
  ): Promise<HrEmploymentLifecyclePolicyDirectory> {
    return this.repository.listEmploymentLifecyclePolicies(context, query);
  }

  createPolicy(
    context: HrActorContext,
    input: CreateHrEmploymentLifecyclePolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmploymentLifecyclePolicyResult> {
    return this.repository.createEmploymentLifecyclePolicy(context, input, idempotencyKey, correlationId);
  }

  submitPolicy(
    context: HrActorContext,
    policyId: string,
    input: SubmitHrEmploymentLifecyclePolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmploymentLifecyclePolicySubmissionResult> {
    return this.repository.submitEmploymentLifecyclePolicy(context, policyId, input, idempotencyKey, correlationId);
  }

  approvePolicy(
    context: HrActorContext,
    policyId: string,
    input: ApproveHrEmploymentLifecyclePolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmploymentLifecyclePolicyApprovalResult> {
    return this.repository.approveEmploymentLifecyclePolicy(context, policyId, input, idempotencyKey, correlationId);
  }
  activatePolicy(
    context: HrActorContext,
    policyId: string,
    input: ActivateHrEmploymentLifecyclePolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmploymentLifecyclePolicyActivationResult> {
    return this.repository.activateEmploymentLifecyclePolicy(context, policyId, input, idempotencyKey, correlationId);
  }
  requestHire(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeHireRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeHireRequestResult> {
    return this.repository.createEmployeeHireRequest(context, employeeId, input, idempotencyKey, correlationId);
  }
  listHireRequests(
    context: HrActorContext,
    query: HrEmployeeHireRequestDirectoryQuery,
  ): Promise<HrEmployeeHireRequestDirectory> {
    return this.repository.listEmployeeHireRequests(context, query);
  }
  getHireRequest(context: HrActorContext, employeeId: string, requestId: string): Promise<HrEmployeeHireRequestReview> {
    return this.repository.getEmployeeHireRequest(context, employeeId, requestId);
  }
  decideHire(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeHireRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeHireDecisionResult> {
    return this.repository.decideEmployeeHireRequest(
      context,
      employeeId,
      requestId,
      input,
      idempotencyKey,
      correlationId,
    );
  }
}
