import { describe, expect, it } from "vitest";

import * as contracts from "@nexora/contracts";

describe("Bank Statement Import and Reconciliation contracts", () => {
  it("exports the approved bounded statement-import contract surface", () => {
    for (const name of [
      "bankStatementImportStateSchema",
      "bankStatementMappingProfileSchema",
      "bankStatementImportDirectoryQuerySchema",
      "bankStatementImportDetailSchema",
      "bankStatementLineSchema",
      "finalizeBankStatementImportRequestSchema",
    ]) {
      expect(contracts, `${name} must be exported from @nexora/contracts`).toHaveProperty(name);
    }
  });

  it("exports the approved governed reconciliation contract surface", () => {
    for (const name of [
      "bankReconciliationStateSchema",
      "bankReconciliationDirectoryQuerySchema",
      "bankReconciliationDetailSchema",
      "createBankReconciliationRequestSchema",
      "createBankReconciliationMatchRequestSchema",
      "bankReconciliationSetupQuerySchema",
      "bankReconciliationSetupSchema",
      "setBankReconciliationManualSelectionRequestSchema",
      "bankReconciliationManualSelectionMutationResultSchema",
      "decideBankReconciliationRequestSchema",
    ]) {
      expect(contracts, `${name} must be exported from @nexora/contracts`).toHaveProperty(name);
    }
  });

  it("rejects unbounded or internally inconsistent statement mappings", () => {
    const base = {
      file_format: "csv" as const,
      delimiter: ",",
      encoding: "utf-8" as const,
      worksheet: null,
      header_row: 1,
      date_format: "dd/MM/yyyy" as const,
      amount_convention: "separate_debit_credit" as const,
      signed_amount_direction: null,
      columns: {
        date: "Date",
        payment: "Payment",
        receipt: "Receipts",
        signed_amount: null,
        reference: "RefNo.",
        details: "Detail",
        transaction_type: "Transaction Type",
        account_text: "Account",
        payment_mode: "Payment Mode",
        running_balance: "Balance",
      },
    };
    expect(contracts.bankStatementMappingSnapshotSchema.safeParse(base).success).toBe(true);
    expect(
      contracts.bankStatementMappingSnapshotSchema.safeParse({
        ...base,
        delimiter: null,
        columns: { ...base.columns, payment: null },
      }).success,
    ).toBe(false);
    expect(
      contracts.bankStatementUploadFieldsSchema.safeParse({
        company_id: "company-a",
        bank_account_id: "bank-a",
        statement_reference: "R".repeat(129),
        date_format: "dd/MM/yyyy",
        tenant_id: "browser-controlled",
      }).success,
    ).toBe(false);
  });

  it("returns database-derived statement date bounds in import directory rows", () => {
    const parsed = contracts.bankStatementImportSummarySchema.safeParse({
      id: "import-a",
      company_id: "company-a",
      bank_account_id: "bank-a",
      bank_account_name: "Operating Account",
      statement_reference: "OCT-2026",
      statement_date_from: "2026-10-01",
      statement_date_to: "2026-10-31",
      original_filename: "october.csv",
      file_format: "csv",
      detected_media_type: "text/csv",
      byte_size: 128,
      checksum_sha256: "a".repeat(64),
      state: "validated",
      counts: { total: 2, valid: 2, warning: 0, error: 0, duplicate: 0, excluded: 0, finalized: 0 },
      version: 1,
      created_by: "maker-a",
      created_at: "2026-10-31T10:00:00.000Z",
      finalized_by: null,
      finalized_at: null,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.statement_date_from).toBe("2026-10-01");
      expect(parsed.data.statement_date_to).toBe("2026-10-31");
    }
  });

  it("enforces reconciliation evidence and decision reasons", () => {
    const request = {
      company_id: "company-a",
      bank_account_id: "bank-a",
      method: "statement_import" as const,
      reconciliation_date: "2026-11-01",
      statement_date: "2026-10-31",
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      statement_reference: "OCT-2026",
      opening_statement_balance: "0",
      closing_statement_balance: "100.00",
    };
    expect(contracts.createBankReconciliationRequestSchema.safeParse(request).success).toBe(false);
    expect(
      contracts.createBankReconciliationRequestSchema.safeParse({ ...request, import_id: "import-a" }).success,
    ).toBe(true);
    expect(
      contracts.decideBankReconciliationRequestSchema.safeParse({
        action: "reject",
        expected_version: 1,
      }).success,
    ).toBe(false);
  });

  it("models server-derived opening balances and versioned manual selections", () => {
    expect(
      contracts.bankReconciliationSetupQuerySchema.safeParse({
        company_id: "company-a",
        bank_account_id: "bank-a",
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        statement_date: "2026-10-31",
      }).success,
    ).toBe(true);
    expect(
      contracts.setBankReconciliationManualSelectionRequestSchema.safeParse({
        expected_version: 2,
        journal_line_id: "journal-line-a",
        selected: true,
      }).success,
    ).toBe(true);
    expect(
      contracts.setBankReconciliationManualSelectionRequestSchema.safeParse({
        expected_version: 2,
        journal_line_id: "journal-line-a",
        selected: true,
        company_id: "browser-controlled",
      }).success,
    ).toBe(false);
  });
});
