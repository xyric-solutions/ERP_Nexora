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
  BankPaymentDetail,
  BankPaymentDirectory,
  BankPaymentDirectoryQuery,
  BankPaymentMutationResult,
  BankPaymentNominalAccountDirectory,
  BankPaymentNominalAccountDirectoryQuery,
  BankPaymentOptions,
  BankPaymentOptionsQuery,
  BankPaymentPostingResult,
  BankPaymentReversalResult,
  CreateBankPaymentRequest,
  DecideBankPaymentRequest,
  PostBankPaymentRequest,
  ReverseBankPaymentRequest,
  SubmitBankPaymentRequest,
  UpdateBankPaymentRequest,
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

  payments(input: BankPaymentDirectoryQuery): Promise<BankPaymentDirectory> {
    return this.api.listBankPayments(
      query({
        company_id: input.company_id,
        bank_account_id: input.bank_account_id,
        state: input.state,
        posting_date_from: input.posting_date_from,
        posting_date_to: input.posting_date_to,
        search: input.search,
        sort_by: input.sort_by,
        sort_direction: input.sort_direction,
        limit: input.limit,
        cursor: input.cursor,
      }),
    );
  }

  paymentOptions(input: BankPaymentOptionsQuery): Promise<BankPaymentOptions> {
    return this.api.listBankPaymentOptions(query({ company_id: input.company_id }));
  }

  paymentNominalAccounts(input: BankPaymentNominalAccountDirectoryQuery): Promise<BankPaymentNominalAccountDirectory> {
    return this.api.listBankPaymentNominalAccounts(
      query({ company_id: input.company_id, search: input.search, limit: input.limit }),
    );
  }

  payment(paymentId: string): Promise<BankPaymentDetail> {
    return this.api.getBankPayment(paymentId);
  }

  createPayment(
    input: CreateBankPaymentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankPaymentMutationResult> {
    return this.api.createBankPayment(input, csrfToken, idempotencyKey);
  }

  updatePayment(
    paymentId: string,
    input: UpdateBankPaymentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankPaymentMutationResult> {
    return this.api.updateBankPayment(paymentId, input, csrfToken, idempotencyKey);
  }

  submitPayment(
    paymentId: string,
    input: SubmitBankPaymentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankPaymentMutationResult> {
    return this.api.submitBankPayment(paymentId, input, csrfToken, idempotencyKey);
  }

  decidePayment(
    paymentId: string,
    input: DecideBankPaymentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankPaymentMutationResult> {
    return this.api.decideBankPayment(paymentId, input, csrfToken, idempotencyKey);
  }

  postPayment(
    paymentId: string,
    input: PostBankPaymentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankPaymentPostingResult> {
    return this.api.postBankPayment(paymentId, input, csrfToken, idempotencyKey);
  }

  reversePayment(
    paymentId: string,
    input: ReverseBankPaymentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankPaymentReversalResult> {
    return this.api.reverseBankPayment(paymentId, input, csrfToken, idempotencyKey);
  }
}
