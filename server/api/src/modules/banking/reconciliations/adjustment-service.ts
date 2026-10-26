import type {
  BankReconciliationAdjustment,
  BankReconciliationAdjustmentMutationResult,
  CreateBankReconciliationAdjustmentRequest,
  DecideBankReconciliationAdjustmentRequest,
  PostBankReconciliationAdjustmentRequest,
  ReverseBankReconciliationAdjustmentRequest,
  SubmitBankReconciliationAdjustmentRequest,
  UpdateBankReconciliationAdjustmentRequest,
} from "@nexora/contracts";

import type { BankingActorContext } from "../source-repository.js";

export interface BankReconciliationAdjustmentRepository {
  get(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
  ): Promise<BankReconciliationAdjustment>;
  create(
    context: BankingActorContext,
    reconciliationId: string,
    input: CreateBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult>;
  update(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: UpdateBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult>;
  submit(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: SubmitBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult>;
  decide(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: DecideBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult>;
  post(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: PostBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult>;
  reverse(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: ReverseBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult>;
}

export class BankReconciliationAdjustmentService {
  constructor(private readonly repository: BankReconciliationAdjustmentRepository) {}

  get(context: BankingActorContext, reconciliationId: string, adjustmentId: string) {
    return this.repository.get(context, reconciliationId, adjustmentId);
  }

  create(
    context: BankingActorContext,
    reconciliationId: string,
    input: CreateBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    return this.repository.create(context, reconciliationId, input, idempotencyKey, correlationId);
  }

  update(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: UpdateBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    return this.repository.update(context, reconciliationId, adjustmentId, input, idempotencyKey, correlationId);
  }

  submit(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: SubmitBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    return this.repository.submit(context, reconciliationId, adjustmentId, input, idempotencyKey, correlationId);
  }

  decide(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: DecideBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    return this.repository.decide(context, reconciliationId, adjustmentId, input, idempotencyKey, correlationId);
  }

  post(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: PostBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    return this.repository.post(context, reconciliationId, adjustmentId, input, idempotencyKey, correlationId);
  }

  reverse(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: ReverseBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    return this.repository.reverse(context, reconciliationId, adjustmentId, input, idempotencyKey, correlationId);
  }
}
