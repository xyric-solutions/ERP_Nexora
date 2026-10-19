import type {
  BankAccountDetail,
  BankAccountDirectory,
  BankAccountDirectoryQuery,
  BankAccountMutationResult,
  BankingCompanyDirectory,
  BankingLedgerAccountDirectory,
  ChangeBankAccountStatusRequest,
  CreateBankAccountRequest,
  DecideBankAccountRequest,
  SubmitBankAccountRequest,
  UpdateBankAccountRequest,
} from "@nexora/contracts";

import type { NexoraApiClient } from "@/lib/api/generated";

function query(values: Record<string, string | number | undefined>): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") parameters.set(key, String(value));
  }
  const result = parameters.toString();
  return result ? `?${result}` : "";
}

export class BankingApiClient {
  constructor(private readonly api: NexoraApiClient) {}

  companies(): Promise<BankingCompanyDirectory> {
    return this.api.listBankingCompanies();
  }

  ledgerAccounts(input: {
    companyId: string;
    search?: string;
    limit?: number;
  }): Promise<BankingLedgerAccountDirectory> {
    return this.api.listBankingLedgerAccounts(
      query({ company_id: input.companyId, search: input.search, limit: input.limit ?? 100 }),
    );
  }

  accounts(input: BankAccountDirectoryQuery): Promise<BankAccountDirectory> {
    return this.api.listBankAccounts(
      query({
        company_id: input.company_id,
        search: input.search,
        bank: input.bank,
        currency: input.currency,
        ledger_account_id: input.ledger_account_id,
        state: input.state,
        sort_by: input.sort_by,
        sort_direction: input.sort_direction,
        limit: input.limit,
        cursor: input.cursor,
      }),
    );
  }

  summary(companyId: string) {
    return this.api.getBankAccountSummary(query({ company_id: companyId }));
  }

  account(accountId: string): Promise<BankAccountDetail> {
    return this.api.getBankAccount(accountId);
  }

  create(
    input: CreateBankAccountRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankAccountMutationResult> {
    return this.api.createBankAccount(input, csrfToken, idempotencyKey);
  }

  update(
    accountId: string,
    input: UpdateBankAccountRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankAccountMutationResult> {
    return this.api.updateBankAccount(accountId, input, csrfToken, idempotencyKey);
  }

  submit(
    accountId: string,
    input: SubmitBankAccountRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankAccountMutationResult> {
    return this.api.submitBankAccount(accountId, input, csrfToken, idempotencyKey);
  }

  decide(
    accountId: string,
    input: DecideBankAccountRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankAccountMutationResult> {
    return this.api.decideBankAccount(accountId, input, csrfToken, idempotencyKey);
  }

  changeStatus(
    accountId: string,
    input: ChangeBankAccountStatusRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankAccountMutationResult> {
    return this.api.changeBankAccountStatus(accountId, input, csrfToken, idempotencyKey);
  }
}
