import type {
  BankReceiptDirectoryQuery,
  BankReceiptNominalAccountDirectoryQuery,
  BankReceiptOptionsQuery,
  CreateBankReceiptRequest,
  DecideBankReceiptRequest,
  PostBankReceiptRequest,
  ReverseBankReceiptRequest,
  SubmitBankReceiptRequest,
  UpdateBankReceiptRequest,
} from "@nexora/contracts";

import type { BankingActorContext } from "../source-repository.js";
import type { SourceBankReceiptRepository } from "./source-repository.js";

export class BankingReceiptService {
  constructor(
    private readonly repository: Pick<
      SourceBankReceiptRepository,
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

  list(context: BankingActorContext, query: BankReceiptDirectoryQuery) {
    return this.repository.list(context, query);
  }

  options(context: BankingActorContext, query: BankReceiptOptionsQuery) {
    return this.repository.options(context, query);
  }

  listNominalAccounts(context: BankingActorContext, query: BankReceiptNominalAccountDirectoryQuery) {
    return this.repository.listNominalAccounts(context, query);
  }

  get(context: BankingActorContext, receiptId: string) {
    return this.repository.get(context, receiptId);
  }

  create(context: BankingActorContext, input: CreateBankReceiptRequest, idempotencyKey: string, correlationId: string) {
    return this.repository.create(context, input, idempotencyKey, correlationId);
  }

  update(
    context: BankingActorContext,
    receiptId: string,
    input: UpdateBankReceiptRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.update(context, receiptId, input, idempotencyKey, correlationId);
  }

  submit(
    context: BankingActorContext,
    receiptId: string,
    input: SubmitBankReceiptRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.submit(context, receiptId, input, idempotencyKey, correlationId);
  }

  decide(
    context: BankingActorContext,
    receiptId: string,
    input: DecideBankReceiptRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.decide(context, receiptId, input, idempotencyKey, correlationId);
  }

  post(
    context: BankingActorContext,
    receiptId: string,
    input: PostBankReceiptRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.post(context, receiptId, input, idempotencyKey, correlationId);
  }

  reverse(
    context: BankingActorContext,
    receiptId: string,
    input: ReverseBankReceiptRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.reverse(context, receiptId, input, idempotencyKey, correlationId);
  }
}
