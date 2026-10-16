import type {
  CreateHrEmployeeTransferRequest,
  DecideHrEmployeeTransferRequest,
  HrEmployeeTransferDecisionResult,
  HrEmployeeTransferRequestDirectory,
  HrEmployeeTransferRequestDirectoryQuery,
  HrEmployeeTransferRequestResult,
  HrEmployeeTransferRequestReview,
  CreateHrEmployeePromotionRequest,
  DecideHrEmployeePromotionRequest,
  HrEmployeePromotionDecisionResult,
  HrEmployeePromotionRequestDirectory,
  HrEmployeePromotionRequestDirectoryQuery,
  HrEmployeePromotionRequestResult,
  HrEmployeePromotionRequestReview,
} from "@nexora/contracts";

import type { HrActorContext, SourceHrRepository } from "../source-repository.js";

/** Effective-dated assignment movements remain separate from profile and lifecycle operations. */
export class HrMovementService {
  constructor(
    private readonly repository: Pick<
      SourceHrRepository,
      | "listEmployeeTransferRequests"
      | "getEmployeeTransferRequest"
      | "createEmployeeTransferRequest"
      | "decideEmployeeTransferRequest"
      | "listEmployeePromotionRequests"
      | "getEmployeePromotionRequest"
      | "createEmployeePromotionRequest"
      | "decideEmployeePromotionRequest"
    >,
  ) {}

  listTransfers(
    context: HrActorContext,
    query: HrEmployeeTransferRequestDirectoryQuery,
  ): Promise<HrEmployeeTransferRequestDirectory> {
    return this.repository.listEmployeeTransferRequests(context, query);
  }

  getTransfer(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeeTransferRequestReview> {
    return this.repository.getEmployeeTransferRequest(context, employeeId, requestId);
  }

  requestTransfer(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeTransferRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeTransferRequestResult> {
    return this.repository.createEmployeeTransferRequest(
      context,
      employeeId,
      input,
      idempotencyKey,
      correlationId,
    );
  }

  decideTransfer(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeeTransferRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeTransferDecisionResult> {
    return this.repository.decideEmployeeTransferRequest(
      context,
      employeeId,
      requestId,
      input,
      idempotencyKey,
      correlationId,
    );
  }

  listPromotions(
    context: HrActorContext,
    query: HrEmployeePromotionRequestDirectoryQuery,
  ): Promise<HrEmployeePromotionRequestDirectory> {
    return this.repository.listEmployeePromotionRequests(context, query);
  }

  getPromotion(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
  ): Promise<HrEmployeePromotionRequestReview> {
    return this.repository.getEmployeePromotionRequest(context, employeeId, requestId);
  }

  requestPromotion(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeePromotionRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeePromotionRequestResult> {
    return this.repository.createEmployeePromotionRequest(
      context,
      employeeId,
      input,
      idempotencyKey,
      correlationId,
    );
  }

  decidePromotion(
    context: HrActorContext,
    employeeId: string,
    requestId: string,
    input: DecideHrEmployeePromotionRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeePromotionDecisionResult> {
    return this.repository.decideEmployeePromotionRequest(
      context,
      employeeId,
      requestId,
      input,
      idempotencyKey,
      correlationId,
    );
  }
}
