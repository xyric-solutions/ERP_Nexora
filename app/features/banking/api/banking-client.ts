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
  BankReceiptDetail,
  BankReceiptDirectory,
  BankReceiptDirectoryQuery,
  BankReceiptMutationResult,
  BankReceiptNominalAccountDirectory,
  BankReceiptNominalAccountDirectoryQuery,
  BankReceiptOptions,
  BankReceiptOptionsQuery,
  BankReceiptPostingResult,
  BankReceiptReversalResult,
  CreateBankReceiptRequest,
  DecideBankReceiptRequest,
  PostBankReceiptRequest,
  ReverseBankReceiptRequest,
  SubmitBankReceiptRequest,
  UpdateBankReceiptRequest,
  BankTransferDetail,
  BankTransferDirectory,
  BankTransferDirectoryQuery,
  BankTransferMutationResult,
  BankTransferOptions,
  BankTransferOptionsQuery,
  BankTransferPostingResult,
  BankTransferReversalResult,
  CreateBankTransferRequest,
  DecideBankTransferRequest,
  PostBankTransferRequest,
  ReverseBankTransferRequest,
  SubmitBankTransferRequest,
  UpdateBankTransferRequest,
  BankStatementFileFormat,
  BankStatementImportDetail,
  BankStatementImportDirectory,
  BankStatementImportDirectoryQuery,
  BankStatementImportMutationResult,
  BankStatementImportOptions,
  BankStatementImportOptionsQuery,
  BankStatementMappingProfile,
  BankStatementMappingProfileDirectory,
  BankStatementMappingProfileDirectoryQuery,
  BankStatementUploadFields,
  CreateBankStatementMappingProfileRequest,
  FinalizeBankStatementImportRequest,
  UpdateBankStatementImportMappingRequest,
  UpdateBankStatementLineRequest,
  UpdateBankStatementMappingProfileRequest,
  ValidateBankStatementImportRequest,
  BankReconciliationAdjustment,
  BankReconciliationAdjustmentMutationResult,
  BankReconciliationDetail,
  BankReconciliationDirectory,
  BankReconciliationDirectoryQuery,
  BankReconciliationMatchMutationResult,
  BankReconciliationManualSelectionMutationResult,
  BankReconciliationMutationResult,
  BankReconciliationSetup,
  BankReconciliationSetupQuery,
  CreateBankReconciliationAdjustmentRequest,
  CreateBankReconciliationMatchRequest,
  CreateBankReconciliationRequest,
  DecideBankReconciliationAdjustmentRequest,
  DecideBankReconciliationMatchRequest,
  DecideBankReconciliationRequest,
  PostBankReconciliationAdjustmentRequest,
  ReverseBankReconciliationAdjustmentRequest,
  SubmitBankReconciliationAdjustmentRequest,
  SubmitBankReconciliationRequest,
  SetBankReconciliationManualSelectionRequest,
  UnmatchBankReconciliationRequest,
  UpdateBankReconciliationAdjustmentRequest,
  ApproveBankRevaluationRequest,
  BankRevaluationDetail,
  BankRevaluationDirectory,
  BankRevaluationDirectoryQuery,
  BankWorkflowOptionQuery,
  BankWorkflowOptions,
  BankRevaluationEventDirectory,
  BankRevaluationMutationResult,
  BankRevaluationPreview,
  BankRevaluationPreviewRequest,
  CreateBankRevaluationRequest,
  PostBankRevaluationRequest,
  RejectBankRevaluationRequest,
  ReverseBankRevaluationRequest,
  SubmitBankRevaluationRequest,
  UpdateBankRevaluationRequest,
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

  receipts(input: BankReceiptDirectoryQuery): Promise<BankReceiptDirectory> {
    return this.api.listBankReceipts(
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

  receiptOptions(input: BankReceiptOptionsQuery): Promise<BankReceiptOptions> {
    return this.api.listBankReceiptOptions(query({ company_id: input.company_id }));
  }

  receiptNominalAccounts(input: BankReceiptNominalAccountDirectoryQuery): Promise<BankReceiptNominalAccountDirectory> {
    return this.api.listBankReceiptNominalAccounts(
      query({ company_id: input.company_id, search: input.search, limit: input.limit }),
    );
  }

  receipt(receiptId: string): Promise<BankReceiptDetail> {
    return this.api.getBankReceipt(receiptId);
  }

  createReceipt(
    input: CreateBankReceiptRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReceiptMutationResult> {
    return this.api.createBankReceipt(input, csrfToken, idempotencyKey);
  }

  updateReceipt(
    receiptId: string,
    input: UpdateBankReceiptRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReceiptMutationResult> {
    return this.api.updateBankReceipt(receiptId, input, csrfToken, idempotencyKey);
  }

  submitReceipt(
    receiptId: string,
    input: SubmitBankReceiptRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReceiptMutationResult> {
    return this.api.submitBankReceipt(receiptId, input, csrfToken, idempotencyKey);
  }

  decideReceipt(
    receiptId: string,
    input: DecideBankReceiptRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReceiptMutationResult> {
    return this.api.decideBankReceipt(receiptId, input, csrfToken, idempotencyKey);
  }

  postReceipt(
    receiptId: string,
    input: PostBankReceiptRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReceiptPostingResult> {
    return this.api.postBankReceipt(receiptId, input, csrfToken, idempotencyKey);
  }

  reverseReceipt(
    receiptId: string,
    input: ReverseBankReceiptRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReceiptReversalResult> {
    return this.api.reverseBankReceipt(receiptId, input, csrfToken, idempotencyKey);
  }

  transfers(input: BankTransferDirectoryQuery): Promise<BankTransferDirectory> {
    return this.api.listBankTransfers(
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

  transferOptions(input: BankTransferOptionsQuery): Promise<BankTransferOptions> {
    return this.api.listBankTransferOptions(query({ company_id: input.company_id }));
  }

  transfer(transferId: string): Promise<BankTransferDetail> {
    return this.api.getBankTransfer(transferId);
  }

  createTransfer(
    input: CreateBankTransferRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankTransferMutationResult> {
    return this.api.createBankTransfer(input, csrfToken, idempotencyKey);
  }

  updateTransfer(
    transferId: string,
    input: UpdateBankTransferRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankTransferMutationResult> {
    return this.api.updateBankTransfer(transferId, input, csrfToken, idempotencyKey);
  }

  submitTransfer(
    transferId: string,
    input: SubmitBankTransferRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankTransferMutationResult> {
    return this.api.submitBankTransfer(transferId, input, csrfToken, idempotencyKey);
  }

  decideTransfer(
    transferId: string,
    input: DecideBankTransferRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankTransferMutationResult> {
    return this.api.decideBankTransfer(transferId, input, csrfToken, idempotencyKey);
  }

  postTransfer(
    transferId: string,
    input: PostBankTransferRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankTransferPostingResult> {
    return this.api.postBankTransfer(transferId, input, csrfToken, idempotencyKey);
  }

  reverseTransfer(
    transferId: string,
    input: ReverseBankTransferRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankTransferReversalResult> {
    return this.api.reverseBankTransfer(transferId, input, csrfToken, idempotencyKey);
  }

  revaluations(input: BankRevaluationDirectoryQuery): Promise<BankRevaluationDirectory> {
    const parameters = new URLSearchParams();
    parameters.set("company_id", input.company_id);
    if (input.currency) parameters.set("currency", input.currency);
    if (input.bank_account_id) parameters.set("bank_account_id", input.bank_account_id);
    for (const state of input.states ?? []) parameters.append("states", state);
    if (input.date_from) parameters.set("date_from", input.date_from);
    if (input.date_to) parameters.set("date_to", input.date_to);
    if (input.search) parameters.set("search", input.search);
    parameters.set("limit", String(input.limit));
    if (input.cursor) parameters.set("cursor", input.cursor);
    return this.api.listBankRevaluations(`?${parameters.toString()}`);
  }

  revaluation(revaluationId: string): Promise<BankRevaluationDetail> {
    return this.api.getBankRevaluation(revaluationId);
  }

  revaluationApprovers(input: Omit<BankWorkflowOptionQuery, "kind">): Promise<BankWorkflowOptions> {
    const parameters = new URLSearchParams({ company_id: input.company_id, limit: String(input.limit) });
    if (input.selected_id) parameters.set("selected_id", input.selected_id);
    if (input.search) parameters.set("search", input.search);
    if (input.cursor) parameters.set("cursor", input.cursor);
    return this.api.listBankRevaluationApprovers(`?${parameters.toString()}`);
  }

  previewRevaluation(
    input: BankRevaluationPreviewRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankRevaluationPreview> {
    return this.api.previewBankRevaluation(input, csrfToken, idempotencyKey);
  }

  createRevaluation(
    input: CreateBankRevaluationRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankRevaluationMutationResult> {
    return this.api.createBankRevaluation(input, csrfToken, idempotencyKey);
  }

  updateRevaluation(
    revaluationId: string,
    input: UpdateBankRevaluationRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankRevaluationMutationResult> {
    return this.api.updateBankRevaluation(revaluationId, input, csrfToken, idempotencyKey);
  }

  submitRevaluation(
    revaluationId: string,
    input: SubmitBankRevaluationRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankRevaluationMutationResult> {
    return this.api.submitBankRevaluation(revaluationId, input, csrfToken, idempotencyKey);
  }

  approveRevaluation(
    revaluationId: string,
    input: ApproveBankRevaluationRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankRevaluationMutationResult> {
    return this.api.approveBankRevaluation(revaluationId, input, csrfToken, idempotencyKey);
  }

  rejectRevaluation(
    revaluationId: string,
    input: RejectBankRevaluationRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankRevaluationMutationResult> {
    return this.api.rejectBankRevaluation(revaluationId, input, csrfToken, idempotencyKey);
  }

  postRevaluation(
    revaluationId: string,
    input: PostBankRevaluationRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankRevaluationMutationResult> {
    return this.api.postBankRevaluation(revaluationId, input, csrfToken, idempotencyKey);
  }

  reverseRevaluation(
    revaluationId: string,
    input: ReverseBankRevaluationRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankRevaluationMutationResult> {
    return this.api.reverseBankRevaluation(revaluationId, input, csrfToken, idempotencyKey);
  }

  revaluationEvents(revaluationId: string, cursor?: string): Promise<BankRevaluationEventDirectory> {
    return this.api.listBankRevaluationEvents(revaluationId, query({ limit: 50, cursor }));
  }

  statementImportOptions(input: BankStatementImportOptionsQuery): Promise<BankStatementImportOptions> {
    return this.api.listBankStatementImportOptions(query({ company_id: input.company_id }));
  }

  downloadStatementTemplate(format: BankStatementFileFormat): Promise<Blob> {
    return this.api.downloadBankStatementImportTemplate(format);
  }

  statementImports(input: BankStatementImportDirectoryQuery): Promise<BankStatementImportDirectory> {
    return this.api.listBankStatementImports(
      query({
        company_id: input.company_id,
        bank_account_id: input.bank_account_id,
        state: input.state,
        statement_date_from: input.statement_date_from,
        statement_date_to: input.statement_date_to,
        search: input.search,
        limit: input.limit,
        cursor: input.cursor,
      }),
    );
  }

  statementImport(importId: string): Promise<BankStatementImportDetail> {
    return this.api.getBankStatementImport(importId);
  }

  uploadStatementImport(
    fields: BankStatementUploadFields,
    file: File,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankStatementImportMutationResult> {
    return this.api.uploadBankStatementImport(fields, file, csrfToken, idempotencyKey);
  }

  updateStatementImportMapping(
    importId: string,
    input: UpdateBankStatementImportMappingRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankStatementImportMutationResult> {
    return this.api.updateBankStatementImportMapping(importId, input, csrfToken, idempotencyKey);
  }

  updateStatementLine(
    importId: string,
    lineId: string,
    input: UpdateBankStatementLineRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankStatementImportMutationResult> {
    return this.api.updateBankStatementLine(importId, lineId, input, csrfToken, idempotencyKey);
  }

  validateStatementImport(
    importId: string,
    input: ValidateBankStatementImportRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankStatementImportMutationResult> {
    return this.api.validateBankStatementImport(importId, input, csrfToken, idempotencyKey);
  }

  finalizeStatementImport(
    importId: string,
    input: FinalizeBankStatementImportRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankStatementImportMutationResult> {
    return this.api.finalizeBankStatementImport(importId, input, csrfToken, idempotencyKey);
  }

  statementMappingProfiles(
    input: BankStatementMappingProfileDirectoryQuery,
  ): Promise<BankStatementMappingProfileDirectory> {
    return this.api.listBankStatementMappingProfiles(
      query({
        company_id: input.company_id,
        bank_account_id: input.bank_account_id,
        state: input.state,
        search: input.search,
        limit: input.limit,
        cursor: input.cursor,
      }),
    );
  }

  createStatementMappingProfile(
    input: CreateBankStatementMappingProfileRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankStatementMappingProfile> {
    return this.api.createBankStatementMappingProfile(input, csrfToken, idempotencyKey);
  }

  updateStatementMappingProfile(
    profileId: string,
    input: UpdateBankStatementMappingProfileRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankStatementMappingProfile> {
    return this.api.updateBankStatementMappingProfile(profileId, input, csrfToken, idempotencyKey);
  }

  reconciliations(input: BankReconciliationDirectoryQuery): Promise<BankReconciliationDirectory> {
    return this.api.listBankReconciliations(
      query({
        company_id: input.company_id,
        bank_account_id: input.bank_account_id,
        state: input.state,
        method: input.method,
        statement_date_from: input.statement_date_from,
        statement_date_to: input.statement_date_to,
        search: input.search,
        limit: input.limit,
        cursor: input.cursor,
      }),
    );
  }

  reconciliation(reconciliationId: string): Promise<BankReconciliationDetail> {
    return this.api.getBankReconciliation(reconciliationId);
  }

  reconciliationSetup(input: BankReconciliationSetupQuery): Promise<BankReconciliationSetup> {
    return this.api.getBankReconciliationSetup(
      query({
        company_id: input.company_id,
        bank_account_id: input.bank_account_id,
        period_start: input.period_start,
        period_end: input.period_end,
        statement_date: input.statement_date,
      }),
    );
  }

  createReconciliation(
    input: CreateBankReconciliationRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationMutationResult> {
    return this.api.createBankReconciliation(input, csrfToken, idempotencyKey);
  }

  setReconciliationManualSelection(
    reconciliationId: string,
    input: SetBankReconciliationManualSelectionRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationManualSelectionMutationResult> {
    return this.api.setBankReconciliationManualSelection(reconciliationId, input, csrfToken, idempotencyKey);
  }

  createReconciliationMatch(
    reconciliationId: string,
    input: CreateBankReconciliationMatchRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationMatchMutationResult> {
    return this.api.createBankReconciliationMatch(reconciliationId, input, csrfToken, idempotencyKey);
  }

  decideReconciliationMatch(
    reconciliationId: string,
    matchId: string,
    input: DecideBankReconciliationMatchRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationMatchMutationResult> {
    return this.api.decideBankReconciliationMatch(reconciliationId, matchId, input, csrfToken, idempotencyKey);
  }

  unmatchReconciliation(
    reconciliationId: string,
    matchId: string,
    input: UnmatchBankReconciliationRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationMatchMutationResult> {
    return this.api.unmatchBankReconciliation(reconciliationId, matchId, input, csrfToken, idempotencyKey);
  }

  reconciliationAdjustment(reconciliationId: string, adjustmentId: string): Promise<BankReconciliationAdjustment> {
    return this.api.getBankReconciliationAdjustment(reconciliationId, adjustmentId);
  }

  createReconciliationAdjustment(
    reconciliationId: string,
    input: CreateBankReconciliationAdjustmentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    return this.api.createBankReconciliationAdjustment(reconciliationId, input, csrfToken, idempotencyKey);
  }

  updateReconciliationAdjustment(
    reconciliationId: string,
    adjustmentId: string,
    input: UpdateBankReconciliationAdjustmentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    return this.api.updateBankReconciliationAdjustment(
      reconciliationId,
      adjustmentId,
      input,
      csrfToken,
      idempotencyKey,
    );
  }

  submitReconciliationAdjustment(
    reconciliationId: string,
    adjustmentId: string,
    input: SubmitBankReconciliationAdjustmentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    return this.api.submitBankReconciliationAdjustment(
      reconciliationId,
      adjustmentId,
      input,
      csrfToken,
      idempotencyKey,
    );
  }

  decideReconciliationAdjustment(
    reconciliationId: string,
    adjustmentId: string,
    input: DecideBankReconciliationAdjustmentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    return this.api.decideBankReconciliationAdjustment(
      reconciliationId,
      adjustmentId,
      input,
      csrfToken,
      idempotencyKey,
    );
  }

  postReconciliationAdjustment(
    reconciliationId: string,
    adjustmentId: string,
    input: PostBankReconciliationAdjustmentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    return this.api.postBankReconciliationAdjustment(reconciliationId, adjustmentId, input, csrfToken, idempotencyKey);
  }

  reverseReconciliationAdjustment(
    reconciliationId: string,
    adjustmentId: string,
    input: ReverseBankReconciliationAdjustmentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    return this.api.reverseBankReconciliationAdjustment(
      reconciliationId,
      adjustmentId,
      input,
      csrfToken,
      idempotencyKey,
    );
  }

  submitReconciliation(
    reconciliationId: string,
    input: SubmitBankReconciliationRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationMutationResult> {
    return this.api.submitBankReconciliation(reconciliationId, input, csrfToken, idempotencyKey);
  }

  decideReconciliation(
    reconciliationId: string,
    input: DecideBankReconciliationRequest,
    csrfToken: string,
    idempotencyKey: string,
  ): Promise<BankReconciliationMutationResult> {
    return this.api.decideBankReconciliation(reconciliationId, input, csrfToken, idempotencyKey);
  }
}
