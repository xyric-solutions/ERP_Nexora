import type {
  BankRevaluationDetail,
  BankRevaluationDirectory,
  BankRevaluationDirectoryQuery,
  BankRevaluationMutationResult,
  BankRevaluationEventDirectory,
  BankRevaluationEventDirectoryQuery,
  BankRevaluationPolicy,
  BankRevaluationPolicyMutation,
  BankRevaluationPreview,
  BankRevaluationPreviewRequest,
  BankWorkflowOptionQuery,
  BankWorkflowOptions,
  CreateBankRevaluationRequest,
  DecideBankRevaluationRequest,
  PostBankRevaluationRequest,
  ReverseBankRevaluationRequest,
  SubmitBankRevaluationRequest,
  UpdateBankRevaluationRequest,
  UpsertBankRevaluationPolicyRequest,
} from "@nexora/contracts";

import type { BankingActorContext } from "../source-repository.js";

export interface BankingRevaluationRepository {
  approverOptions(context: BankingActorContext, query: BankWorkflowOptionQuery): Promise<BankWorkflowOptions>;
  getPolicy(context: BankingActorContext, companyId: string): Promise<BankRevaluationPolicy>;
  upsertPolicy(
    context: BankingActorContext,
    input: UpsertBankRevaluationPolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationPolicyMutation>;
  preview(context: BankingActorContext, input: BankRevaluationPreviewRequest): Promise<BankRevaluationPreview>;
  list(context: BankingActorContext, query: BankRevaluationDirectoryQuery): Promise<BankRevaluationDirectory>;
  get(context: BankingActorContext, id: string): Promise<BankRevaluationDetail>;
  listEvents(
    context: BankingActorContext,
    id: string,
    query: BankRevaluationEventDirectoryQuery,
  ): Promise<BankRevaluationEventDirectory>;
  create(
    context: BankingActorContext,
    input: CreateBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationMutationResult>;
  update(
    context: BankingActorContext,
    id: string,
    input: UpdateBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationMutationResult>;
  submit(
    context: BankingActorContext,
    id: string,
    input: SubmitBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationMutationResult>;
  decide(
    context: BankingActorContext,
    id: string,
    input: DecideBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationMutationResult>;
  post(
    context: BankingActorContext,
    id: string,
    input: PostBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationMutationResult>;
  reverse(
    context: BankingActorContext,
    id: string,
    input: ReverseBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationMutationResult>;
}

export class BankingRevaluationService {
  constructor(private readonly repository: BankingRevaluationRepository) {}

  approverOptions(context: BankingActorContext, query: BankWorkflowOptionQuery) {
    return this.repository.approverOptions(context, query);
  }

  getPolicy(context: BankingActorContext, companyId: string) {
    return this.repository.getPolicy(context, companyId);
  }

  upsertPolicy(
    context: BankingActorContext,
    input: UpsertBankRevaluationPolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.upsertPolicy(context, input, idempotencyKey, correlationId);
  }

  preview(context: BankingActorContext, input: BankRevaluationPreviewRequest) {
    return this.repository.preview(context, input);
  }

  list(context: BankingActorContext, query: BankRevaluationDirectoryQuery) {
    return this.repository.list(context, query);
  }

  get(context: BankingActorContext, id: string) {
    return this.repository.get(context, id);
  }

  listEvents(context: BankingActorContext, id: string, query: BankRevaluationEventDirectoryQuery) {
    return this.repository.listEvents(context, id, query);
  }

  create(
    context: BankingActorContext,
    input: CreateBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.create(context, input, idempotencyKey, correlationId);
  }

  update(
    context: BankingActorContext,
    id: string,
    input: UpdateBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.update(context, id, input, idempotencyKey, correlationId);
  }

  submit(
    context: BankingActorContext,
    id: string,
    input: SubmitBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.submit(context, id, input, idempotencyKey, correlationId);
  }

  decide(
    context: BankingActorContext,
    id: string,
    input: DecideBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.decide(context, id, input, idempotencyKey, correlationId);
  }

  post(
    context: BankingActorContext,
    id: string,
    input: PostBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.post(context, id, input, idempotencyKey, correlationId);
  }

  reverse(
    context: BankingActorContext,
    id: string,
    input: ReverseBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.reverse(context, id, input, idempotencyKey, correlationId);
  }
}
