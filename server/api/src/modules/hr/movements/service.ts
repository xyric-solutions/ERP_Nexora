import type {
  CreateHrEmployeeTransferRequest,
  DecideHrEmployeeTransferRequest,
  HrEmployeeTransferDecisionResult,
  HrEmployeeTransferRequestDirectory,
  HrEmployeeTransferRequestDirectoryQuery,
  HrEmployeeTransferRequestResult,
  HrEmployeeTransferRequestReview,
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
}
