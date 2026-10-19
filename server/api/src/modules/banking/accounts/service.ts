import type {
  BankAccountDirectoryQuery,
  BankingLedgerAccountDirectoryQuery,
  ChangeBankAccountStatusRequest,
  CreateBankAccountRequest,
  DecideBankAccountRequest,
  SubmitBankAccountRequest,
  UpdateBankAccountRequest,
} from "@nexora/contracts";

import type { BankingActorContext, SourceBankingRepository } from "../source-repository.js";

export class BankingAccountService {
  constructor(
    private readonly repository: Pick<
      SourceBankingRepository,
      | "listCompanies"
      | "listLedgerAccounts"
      | "listAccounts"
      | "accountSummary"
      | "getAccount"
      | "createAccount"
      | "updateAccount"
      | "submitAccount"
      | "decideAccount"
      | "changeStatus"
    >,
  ) {}

  listCompanies(context: BankingActorContext) {
    return this.repository.listCompanies(context);
  }

  listLedgerAccounts(context: BankingActorContext, query: BankingLedgerAccountDirectoryQuery) {
    return this.repository.listLedgerAccounts(context, query);
  }

  list(context: BankingActorContext, query: BankAccountDirectoryQuery) {
    return this.repository.listAccounts(context, query);
  }

  summary(context: BankingActorContext, companyId: string) {
    return this.repository.accountSummary(context, companyId);
  }

  get(context: BankingActorContext, accountId: string) {
    return this.repository.getAccount(context, accountId);
  }

  create(context: BankingActorContext, input: CreateBankAccountRequest, idempotencyKey: string, correlationId: string) {
    return this.repository.createAccount(context, input, idempotencyKey, correlationId);
  }

  update(
    context: BankingActorContext,
    accountId: string,
    input: UpdateBankAccountRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.updateAccount(context, accountId, input, idempotencyKey, correlationId);
  }

  submit(
    context: BankingActorContext,
    accountId: string,
    input: SubmitBankAccountRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.submitAccount(context, accountId, input, idempotencyKey, correlationId);
  }

  decide(
    context: BankingActorContext,
    accountId: string,
    input: DecideBankAccountRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.decideAccount(context, accountId, input, idempotencyKey, correlationId);
  }

  changeStatus(
    context: BankingActorContext,
    accountId: string,
    input: ChangeBankAccountStatusRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.changeStatus(context, accountId, input, idempotencyKey, correlationId);
  }
}
