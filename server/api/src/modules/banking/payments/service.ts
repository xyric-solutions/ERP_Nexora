import type {
  BankPaymentDirectoryQuery,
  BankPaymentNominalAccountDirectoryQuery,
  BankPaymentOptionsQuery,
  CreateBankPaymentRequest,
  DecideBankPaymentRequest,
  PostBankPaymentRequest,
  ReverseBankPaymentRequest,
  SubmitBankPaymentRequest,
  UpdateBankPaymentRequest,
} from "@nexora/contracts";

import type { BankingActorContext } from "../source-repository.js";
import type { SourceBankPaymentRepository } from "./source-repository.js";

export class BankingPaymentService {
  constructor(
    private readonly repository: Pick<
      SourceBankPaymentRepository,
      | "list"
      | "options"
      | "listNominalAccounts"
      | "get"
      | "create"
      | "update"
      | "submit"
      | "decide"
      | "post"
      | "reverse"
    >,
  ) {}

  list(context: BankingActorContext, query: BankPaymentDirectoryQuery) {
    return this.repository.list(context, query);
  }

  options(context: BankingActorContext, query: BankPaymentOptionsQuery) {
    return this.repository.options(context, query);
  }

  listNominalAccounts(context: BankingActorContext, query: BankPaymentNominalAccountDirectoryQuery) {
    return this.repository.listNominalAccounts(context, query);
  }

  get(context: BankingActorContext, paymentId: string) {
    return this.repository.get(context, paymentId);
  }

  create(context: BankingActorContext, input: CreateBankPaymentRequest, idempotencyKey: string, correlationId: string) {
    return this.repository.create(context, input, idempotencyKey, correlationId);
  }

  update(
    context: BankingActorContext,
    paymentId: string,
    input: UpdateBankPaymentRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.update(context, paymentId, input, idempotencyKey, correlationId);
  }

  submit(
    context: BankingActorContext,
    paymentId: string,
    input: SubmitBankPaymentRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.submit(context, paymentId, input, idempotencyKey, correlationId);
  }

  decide(
    context: BankingActorContext,
    paymentId: string,
    input: DecideBankPaymentRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.decide(context, paymentId, input, idempotencyKey, correlationId);
  }

  post(
    context: BankingActorContext,
    paymentId: string,
    input: PostBankPaymentRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.post(context, paymentId, input, idempotencyKey, correlationId);
  }

  reverse(
    context: BankingActorContext,
    paymentId: string,
    input: ReverseBankPaymentRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.reverse(context, paymentId, input, idempotencyKey, correlationId);
  }
}
