import type {
  BankReconciliationDetail,
  BankReconciliationDirectory,
  BankReconciliationDirectoryQuery,
  BankReconciliationMatchMutationResult,
  BankReconciliationManualSelectionMutationResult,
  BankReconciliationMutationResult,
  BankReconciliationSetup,
  BankReconciliationSetupQuery,
  CreateBankReconciliationMatchRequest,
  CreateBankReconciliationRequest,
  DecideBankReconciliationMatchRequest,
  DecideBankReconciliationRequest,
  SubmitBankReconciliationRequest,
  SetBankReconciliationManualSelectionRequest,
  UnmatchBankReconciliationRequest,
} from "@nexora/contracts";

import type { BankingActorContext } from "../source-repository.js";

export interface BankingReconciliationRepository {
  setup(context: BankingActorContext, query: BankReconciliationSetupQuery): Promise<BankReconciliationSetup>;
  list(context: BankingActorContext, query: BankReconciliationDirectoryQuery): Promise<BankReconciliationDirectory>;
  get(context: BankingActorContext, id: string): Promise<BankReconciliationDetail>;
  create(
    context: BankingActorContext,
    input: CreateBankReconciliationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationMutationResult>;
  createMatch(
    context: BankingActorContext,
    id: string,
    input: CreateBankReconciliationMatchRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationMatchMutationResult>;
  setManualSelection(
    context: BankingActorContext,
    id: string,
    input: SetBankReconciliationManualSelectionRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationManualSelectionMutationResult>;
  decideMatch(
    context: BankingActorContext,
    id: string,
    matchId: string,
    input: DecideBankReconciliationMatchRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationMatchMutationResult>;
  unmatch(
    context: BankingActorContext,
    id: string,
    matchId: string,
    input: UnmatchBankReconciliationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationMatchMutationResult>;
  submit(
    context: BankingActorContext,
    id: string,
    input: SubmitBankReconciliationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationMutationResult>;
  decide(
    context: BankingActorContext,
    id: string,
    input: DecideBankReconciliationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationMutationResult>;
}

export class BankingReconciliationService {
  constructor(private readonly repository: BankingReconciliationRepository) {}

  setup(context: BankingActorContext, query: BankReconciliationSetupQuery) {
    return this.repository.setup(context, query);
  }

  list(context: BankingActorContext, query: BankReconciliationDirectoryQuery) {
    return this.repository.list(context, query);
  }

  get(context: BankingActorContext, id: string) {
    return this.repository.get(context, id);
  }

  create(
    context: BankingActorContext,
    input: CreateBankReconciliationRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.create(context, input, idempotencyKey, correlationId);
  }

  createMatch(
    context: BankingActorContext,
    id: string,
    input: CreateBankReconciliationMatchRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.createMatch(context, id, input, idempotencyKey, correlationId);
  }

  setManualSelection(
    context: BankingActorContext,
    id: string,
    input: SetBankReconciliationManualSelectionRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.setManualSelection(context, id, input, idempotencyKey, correlationId);
  }

  decideMatch(
    context: BankingActorContext,
    id: string,
    matchId: string,
    input: DecideBankReconciliationMatchRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.decideMatch(context, id, matchId, input, idempotencyKey, correlationId);
  }

  unmatch(
    context: BankingActorContext,
    id: string,
    matchId: string,
    input: UnmatchBankReconciliationRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.unmatch(context, id, matchId, input, idempotencyKey, correlationId);
  }

  submit(
    context: BankingActorContext,
    id: string,
    input: SubmitBankReconciliationRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.submit(context, id, input, idempotencyKey, correlationId);
  }

  decide(
    context: BankingActorContext,
    id: string,
    input: DecideBankReconciliationRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.decide(context, id, input, idempotencyKey, correlationId);
  }
}
