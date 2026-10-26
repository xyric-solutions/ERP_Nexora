import { describe, expect, it, vi } from "vitest";

import { BankingApiClient } from "../../app/features/banking/api/banking-client.js";
import { ApiError, NexoraApiClient } from "../../app/lib/api/generated.js";

describe("Banking browser API adapter", () => {
  it("exposes generated Bank Payment directory and lifecycle methods", () => {
    const api = new NexoraApiClient("http://127.0.0.1:4000");
    for (const method of [
      api.listBankPayments,
      api.listBankPaymentOptions,
      api.listBankPaymentNominalAccounts,
      api.getBankPayment,
      api.createBankPayment,
      api.updateBankPayment,
      api.submitBankPayment,
      api.decideBankPayment,
      api.postBankPayment,
      api.reverseBankPayment,
    ]) {
      expect(typeof method).toBe("function");
    }
  });

  it("exposes generated Bank Receipt directory and lifecycle methods", () => {
    const api = new NexoraApiClient("http://127.0.0.1:4000") as unknown as Record<string, unknown>;
    for (const method of [
      "listBankReceipts",
      "listBankReceiptOptions",
      "listBankReceiptNominalAccounts",
      "getBankReceipt",
      "createBankReceipt",
      "updateBankReceipt",
      "submitBankReceipt",
      "decideBankReceipt",
      "postBankReceipt",
      "reverseBankReceipt",
    ]) {
      expect(typeof api[method]).toBe("function");
    }
  });

  it("exposes the generated statement-import and reconciliation API surface", () => {
    const api = new NexoraApiClient("http://127.0.0.1:4000") as unknown as Record<string, unknown>;
    for (const method of [
      "listBankStatementImportOptions",
      "downloadBankStatementImportTemplate",
      "listBankStatementImports",
      "uploadBankStatementImport",
      "getBankStatementImport",
      "updateBankStatementImportMapping",
      "updateBankStatementLine",
      "validateBankStatementImport",
      "finalizeBankStatementImport",
      "listBankStatementMappingProfiles",
      "createBankStatementMappingProfile",
      "updateBankStatementMappingProfile",
      "listBankReconciliations",
      "getBankReconciliationSetup",
      "getBankReconciliation",
      "createBankReconciliation",
      "setBankReconciliationManualSelection",
      "createBankReconciliationMatch",
      "decideBankReconciliationMatch",
      "unmatchBankReconciliation",
      "getBankReconciliationAdjustment",
      "createBankReconciliationAdjustment",
      "updateBankReconciliationAdjustment",
      "submitBankReconciliationAdjustment",
      "decideBankReconciliationAdjustment",
      "postBankReconciliationAdjustment",
      "reverseBankReconciliationAdjustment",
      "submitBankReconciliation",
      "decideBankReconciliation",
    ]) {
      expect(typeof api[method]).toBe("function");
    }
  });

  it("sends statement files as multipart without overriding the browser boundary", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({}), { status: 201, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const api = new NexoraApiClient("http://127.0.0.1:4000");
      await api.uploadBankStatementImport(
        {
          company_id: "company-a",
          bank_account_id: "bank-a",
          statement_reference: "OCT-2026",
          date_format: "dd/MM/yyyy",
        },
        new File(["Date,Payment,Receipts\n22/10/2026,0,10"], "statement.csv", { type: "text/csv" }),
        "csrf",
        "upload-key",
      );

      const [, init] = fetchMock.mock.calls[0] ?? [];
      expect(init?.headers).toEqual({ "x-csrf-token": "csrf", "idempotency-key": "upload-key" });
      expect(init?.body).toBeInstanceOf(FormData);
      const body = init?.body as FormData;
      expect(body.get("company_id")).toBe("company-a");
      expect(body.get("file")).toBeInstanceOf(File);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("encodes bounded account-directory filters through the generated client", async () => {
    const api = {
      listBankAccounts: vi.fn(async () => ({ items: [], next_cursor: null })),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);

    await client.accounts({
      company_id: "company/a",
      search: "Operating & payroll",
      currency: "USD",
      state: "active",
      sort_by: "ledger_balance",
      sort_direction: "desc",
      limit: 25,
      cursor: "cursor/value",
    });

    const encoded = vi.mocked(api.listBankAccounts).mock.calls[0]?.[0] ?? "";
    const parameters = new URLSearchParams(encoded.slice(1));
    expect(Object.fromEntries(parameters)).toEqual({
      company_id: "company/a",
      search: "Operating & payroll",
      currency: "USD",
      state: "active",
      sort_by: "ledger_balance",
      sort_direction: "desc",
      limit: "25",
      cursor: "cursor/value",
    });
  });

  it("passes mutation safeguards only through generated client methods", async () => {
    const result = {
      id: "bank-account-1",
      reference: "BA-2026-0001",
      state: "draft" as const,
      version: 1,
      audit_event_id: "audit-1",
      replayed: false,
    };
    const api = { createBankAccount: vi.fn(async () => result) } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);
    const payload = {
      company_id: "company-a",
      account_name: "Operating USD",
      account_type: "current" as const,
      bank_name: "Synthetic Bank",
      account_number: "1234567890",
      currency: "USD",
      ledger_account_id: "ledger-a",
      overdraft_limit: "0",
      opening_balance: "0",
    };

    await expect(client.create(payload, "csrf-token", "bank-create-1")).resolves.toEqual(result);
    expect(api.createBankAccount).toHaveBeenCalledWith(payload, "csrf-token", "bank-create-1");
  });

  it("encodes every committed payment-directory filter through the generated client", async () => {
    const api = {
      listBankPayments: vi.fn(async () => ({ items: [], next_cursor: null })),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);

    await client.payments({
      company_id: "company/a",
      bank_account_id: "bank account/1",
      state: "approved",
      posting_date_from: "2026-10-01",
      posting_date_to: "2026-10-31",
      search: "Atlas & invoice",
      sort_by: "total_amount",
      sort_direction: "asc",
      limit: 25,
      cursor: "cursor/value",
    });

    const encoded = vi.mocked(api.listBankPayments).mock.calls[0]?.[0] ?? "";
    const parameters = new URLSearchParams(encoded.slice(1));
    expect(Object.fromEntries(parameters)).toEqual({
      company_id: "company/a",
      bank_account_id: "bank account/1",
      state: "approved",
      posting_date_from: "2026-10-01",
      posting_date_to: "2026-10-31",
      search: "Atlas & invoice",
      sort_by: "total_amount",
      sort_direction: "asc",
      limit: "25",
      cursor: "cursor/value",
    });
  });

  it("adapts payment options, bounded nominal search, and detail reads", async () => {
    const api = {
      listBankPaymentOptions: vi.fn(async () => ({ bank_accounts: [] })),
      listBankPaymentNominalAccounts: vi.fn(async () => ({ items: [] })),
      getBankPayment: vi.fn(async () => ({ id: "payment/1" })),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);

    await client.paymentOptions({ company_id: "company/a" });
    await client.paymentNominalAccounts({ company_id: "company/a", search: "travel & expense", limit: 50 });
    await client.payment("payment/1");

    expect(api.listBankPaymentOptions).toHaveBeenCalledWith("?company_id=company%2Fa");
    const nominalQuery = vi.mocked(api.listBankPaymentNominalAccounts).mock.calls[0]?.[0] ?? "";
    expect(Object.fromEntries(new URLSearchParams(nominalQuery.slice(1)))).toEqual({
      company_id: "company/a",
      search: "travel & expense",
      limit: "50",
    });
    expect(api.getBankPayment).toHaveBeenCalledWith("payment/1");
  });

  it("passes payment payloads, CSRF tokens, versions, and stable action keys unchanged", async () => {
    const mutation = {
      id: "payment-1",
      reference: "BP-2026-000001",
      state: "draft" as const,
      version: 1,
      audit_event_id: "audit-1",
      replayed: false,
    };
    const posted = {
      ...mutation,
      state: "posted" as const,
      accounting_event_id: "accounting-event-1",
      journal_id: "journal-1",
      journal_entry_number: "JE-000001",
    };
    const reversed = {
      ...mutation,
      state: "reversed" as const,
      original_accounting_event_id: "accounting-event-1",
      original_journal_id: "journal-1",
      reversal_accounting_event_id: "accounting-event-2",
      reversal_journal_id: "journal-2",
      reversal_journal_entry_number: "JE-000002",
    };
    const api = {
      createBankPayment: vi.fn(async () => mutation),
      updateBankPayment: vi.fn(async () => mutation),
      submitBankPayment: vi.fn(async () => mutation),
      decideBankPayment: vi.fn(async () => mutation),
      postBankPayment: vi.fn(async () => posted),
      reverseBankPayment: vi.fn(async () => reversed),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);
    const createPayload = {
      company_id: "company-a",
      bank_account_id: "bank-account-1",
      posting_date: "2026-10-19",
      lines: [
        {
          line_order: 1,
          document_date: "2026-10-19",
          external_reference: "INV-1001",
          payment_method: "bank_transfer" as const,
          nominal_account_id: "nominal-1",
          narration: "Supplier payment",
          amount: "125.00",
          dimensions: {},
        },
      ],
    };
    const updatePayload = { expected_version: 1, posting_date: "2026-10-20" };
    const submitPayload = { expected_version: 2 };
    const decisionPayload = { action: "approve" as const, expected_version: 3 };
    const postPayload = { expected_version: 4 };
    const reversePayload = { expected_version: 5, reason: "Duplicate supplier settlement" };

    await client.createPayment(createPayload, "csrf", "payment-create-key");
    await client.updatePayment("payment-1", updatePayload, "csrf", "payment-update-key");
    await client.submitPayment("payment-1", submitPayload, "csrf", "payment-submit-key");
    await client.decidePayment("payment-1", decisionPayload, "csrf", "payment-decision-key");
    await client.postPayment("payment-1", postPayload, "csrf", "payment-post-key");
    await client.reversePayment("payment-1", reversePayload, "csrf", "payment-reverse-key");

    expect(api.createBankPayment).toHaveBeenCalledWith(createPayload, "csrf", "payment-create-key");
    expect(api.updateBankPayment).toHaveBeenCalledWith("payment-1", updatePayload, "csrf", "payment-update-key");
    expect(api.submitBankPayment).toHaveBeenCalledWith("payment-1", submitPayload, "csrf", "payment-submit-key");
    expect(api.decideBankPayment).toHaveBeenCalledWith("payment-1", decisionPayload, "csrf", "payment-decision-key");
    expect(api.postBankPayment).toHaveBeenCalledWith("payment-1", postPayload, "csrf", "payment-post-key");
    expect(api.reverseBankPayment).toHaveBeenCalledWith("payment-1", reversePayload, "csrf", "payment-reverse-key");
  });

  it("adapts receipt directories, options, bounded nominal search, and detail reads", async () => {
    const api = {
      listBankReceipts: vi.fn(async () => ({ items: [], next_cursor: null })),
      listBankReceiptOptions: vi.fn(async () => ({ bank_accounts: [], receipt_methods: [] })),
      listBankReceiptNominalAccounts: vi.fn(async () => ({ items: [] })),
      getBankReceipt: vi.fn(async () => ({ id: "receipt/1" })),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);

    await client.receipts({
      company_id: "company/a",
      bank_account_id: "bank account/1",
      state: "approved",
      posting_date_from: "2026-10-01",
      posting_date_to: "2026-10-31",
      search: "Atlas & receipt",
      sort_by: "total_amount",
      sort_direction: "asc",
      limit: 25,
      cursor: "cursor/value",
    });
    await client.receiptOptions({ company_id: "company/a" });
    await client.receiptNominalAccounts({ company_id: "company/a", search: "revenue & income", limit: 50 });
    await client.receipt("receipt/1");

    const directoryQuery = vi.mocked(api.listBankReceipts).mock.calls[0]?.[0] ?? "";
    expect(Object.fromEntries(new URLSearchParams(directoryQuery.slice(1)))).toEqual({
      company_id: "company/a",
      bank_account_id: "bank account/1",
      state: "approved",
      posting_date_from: "2026-10-01",
      posting_date_to: "2026-10-31",
      search: "Atlas & receipt",
      sort_by: "total_amount",
      sort_direction: "asc",
      limit: "25",
      cursor: "cursor/value",
    });
    expect(api.listBankReceiptOptions).toHaveBeenCalledWith("?company_id=company%2Fa");
    const nominalQuery = vi.mocked(api.listBankReceiptNominalAccounts).mock.calls[0]?.[0] ?? "";
    expect(Object.fromEntries(new URLSearchParams(nominalQuery.slice(1)))).toEqual({
      company_id: "company/a",
      search: "revenue & income",
      limit: "50",
    });
    expect(api.getBankReceipt).toHaveBeenCalledWith("receipt/1");
  });

  it("passes receipt payloads and mutation safeguards only through generated methods", async () => {
    const mutation = {
      id: "receipt-1",
      reference: "BR-2026-000001",
      state: "draft" as const,
      version: 1,
      audit_event_id: "audit-1",
      replayed: false,
    };
    const api = {
      createBankReceipt: vi.fn(async () => mutation),
      updateBankReceipt: vi.fn(async () => mutation),
      submitBankReceipt: vi.fn(async () => mutation),
      decideBankReceipt: vi.fn(async () => mutation),
      postBankReceipt: vi.fn(async () => ({
        ...mutation,
        accounting_event_id: "accounting-event-1",
        journal_id: "journal-1",
        journal_entry_number: "JE-000001",
      })),
      reverseBankReceipt: vi.fn(async () => ({
        ...mutation,
        original_accounting_event_id: "accounting-event-1",
        original_journal_id: "journal-1",
        reversal_accounting_event_id: "accounting-event-2",
        reversal_journal_id: "journal-2",
        reversal_journal_entry_number: "JE-000002",
      })),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);
    const createPayload = {
      company_id: "company-a",
      bank_account_id: "bank-account-1",
      posting_date: "2026-10-19",
      lines: [
        {
          line_order: 1,
          document_date: "2026-10-19",
          external_reference: "RCPT-1001",
          receipt_method: "bank_transfer" as const,
          payer_name: "Nexora Customer",
          nominal_account_id: "nominal-1",
          narration: "Customer receipt",
          amount: "125.00",
          dimensions: {},
        },
      ],
    };
    const updatePayload = { expected_version: 1, posting_date: "2026-10-20" };
    const submitPayload = { expected_version: 2 };
    const decisionPayload = { action: "approve" as const, expected_version: 3 };
    const postPayload = { expected_version: 4 };
    const reversePayload = { expected_version: 5, reason: "Duplicate customer receipt" };

    await client.createReceipt(createPayload, "csrf", "receipt-create-key");
    await client.updateReceipt("receipt-1", updatePayload, "csrf", "receipt-update-key");
    await client.submitReceipt("receipt-1", submitPayload, "csrf", "receipt-submit-key");
    await client.decideReceipt("receipt-1", decisionPayload, "csrf", "receipt-decision-key");
    await client.postReceipt("receipt-1", postPayload, "csrf", "receipt-post-key");
    await client.reverseReceipt("receipt-1", reversePayload, "csrf", "receipt-reverse-key");

    expect(api.createBankReceipt).toHaveBeenCalledWith(createPayload, "csrf", "receipt-create-key");
    expect(api.updateBankReceipt).toHaveBeenCalledWith("receipt-1", updatePayload, "csrf", "receipt-update-key");
    expect(api.submitBankReceipt).toHaveBeenCalledWith("receipt-1", submitPayload, "csrf", "receipt-submit-key");
    expect(api.decideBankReceipt).toHaveBeenCalledWith("receipt-1", decisionPayload, "csrf", "receipt-decision-key");
    expect(api.postBankReceipt).toHaveBeenCalledWith("receipt-1", postPayload, "csrf", "receipt-post-key");
    expect(api.reverseBankReceipt).toHaveBeenCalledWith("receipt-1", reversePayload, "csrf", "receipt-reverse-key");
  });

  it("emits quoted Receipt versions through generated If-Match headers", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "receipt-1",
            reference: "BR-2026-000001",
            state: "draft",
            version: 2,
            audit_event_id: "audit-2",
            replayed: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const api = new NexoraApiClient("http://127.0.0.1:4000");
      await api.updateBankReceipt(
        "receipt-1",
        { expected_version: 7, value_date: null },
        "csrf-token",
        "receipt-update-key",
      );
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.headers).toMatchObject({
        "x-csrf-token": "csrf-token",
        "idempotency-key": "receipt-update-key",
        "if-match": '"7"',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("delegates Transfer directory and lifecycle requests to the generated client", async () => {
    const api = {
      listBankTransfers: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      listBankTransferOptions: vi.fn().mockResolvedValue({ bank_accounts: [], transfer_modes: [] }),
      getBankTransfer: vi.fn(),
      createBankTransfer: vi.fn().mockResolvedValue({ id: "transfer-1" }),
      updateBankTransfer: vi.fn(),
      submitBankTransfer: vi.fn(),
      decideBankTransfer: vi.fn(),
      postBankTransfer: vi.fn(),
      reverseBankTransfer: vi.fn(),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);
    const createPayload = {
      company_id: "company-a",
      posting_date: "2026-10-22",
      value_date: null,
      lines: [
        {
          line_order: 1,
          document_date: "2026-10-22",
          from_bank_account_id: "bank-a",
          external_reference: "REF-1",
          transfer_mode: "internal" as const,
          to_bank_account_id: "bank-b",
          details: "Treasury funding",
          source_amount: "100.00",
          bank_charge_amount: "0",
        },
      ],
    };

    await client.transfers({
      company_id: "company-a",
      state: "approved",
      sort_by: "posting_date",
      sort_direction: "desc",
      limit: 50,
    });
    await client.transferOptions({ company_id: "company-a" });
    await client.createTransfer(createPayload, "csrf", "create-key");
    await client.updateTransfer(
      "transfer-1",
      { expected_version: 1, posting_date: "2026-10-23" },
      "csrf",
      "update-key",
    );
    await client.submitTransfer("transfer-1", { expected_version: 2 }, "csrf", "submit-key");
    await client.decideTransfer("transfer-1", { action: "approve", expected_version: 3 }, "csrf", "decide-key");
    await client.postTransfer("transfer-1", { expected_version: 4 }, "csrf", "post-key");
    await client.reverseTransfer(
      "transfer-1",
      { expected_version: 5, reason: "Duplicate transfer" },
      "csrf",
      "reverse-key",
    );

    expect(api.listBankTransfers).toHaveBeenCalledWith(
      "?company_id=company-a&state=approved&sort_by=posting_date&sort_direction=desc&limit=50",
    );
    expect(api.listBankTransferOptions).toHaveBeenCalledWith("?company_id=company-a");
    expect(api.createBankTransfer).toHaveBeenCalledWith(createPayload, "csrf", "create-key");
    expect(api.updateBankTransfer).toHaveBeenCalledWith(
      "transfer-1",
      { expected_version: 1, posting_date: "2026-10-23" },
      "csrf",
      "update-key",
    );
    expect(api.submitBankTransfer).toHaveBeenCalledWith("transfer-1", { expected_version: 2 }, "csrf", "submit-key");
    expect(api.decideBankTransfer).toHaveBeenCalledWith(
      "transfer-1",
      { action: "approve", expected_version: 3 },
      "csrf",
      "decide-key",
    );
    expect(api.postBankTransfer).toHaveBeenCalledWith("transfer-1", { expected_version: 4 }, "csrf", "post-key");
    expect(api.reverseBankTransfer).toHaveBeenCalledWith(
      "transfer-1",
      { expected_version: 5, reason: "Duplicate transfer" },
      "csrf",
      "reverse-key",
    );
  });

  it("adapts statement import directories, multipart upload, mapping, validation, and finalization", async () => {
    const api = {
      listBankStatementImportOptions: vi.fn(),
      downloadBankStatementImportTemplate: vi.fn(),
      listBankStatementImports: vi.fn(),
      getBankStatementImport: vi.fn(),
      uploadBankStatementImport: vi.fn(),
      updateBankStatementImportMapping: vi.fn(),
      updateBankStatementLine: vi.fn(),
      validateBankStatementImport: vi.fn(),
      finalizeBankStatementImport: vi.fn(),
      listBankStatementMappingProfiles: vi.fn(),
      createBankStatementMappingProfile: vi.fn(),
      updateBankStatementMappingProfile: vi.fn(),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);
    const uploadFields = {
      company_id: "company/a",
      bank_account_id: "bank/a",
      statement_reference: "OCT-2026",
      date_format: "dd/MM/yyyy" as const,
    };
    const file = new File(["Date,Payment,Receipt"], "statement.csv", { type: "text/csv" });

    await client.statementImportOptions({ company_id: "company/a" });
    await client.statementImports({
      company_id: "company/a",
      bank_account_id: "bank/a",
      state: "draft",
      search: "October & payroll",
      limit: 25,
      cursor: "cursor/value",
    });
    await client.statementImport("import/a");
    await client.downloadStatementTemplate("csv");
    await client.uploadStatementImport(uploadFields, file, "csrf", "upload-key");
    await client.updateStatementImportMapping("import/a", { expected_version: 2 } as never, "csrf", "mapping-key");
    await client.updateStatementLine(
      "import/a",
      "line/a",
      { expected_version: 3, inclusion_state: "excluded", exclusion_reason: "Not a company transaction" },
      "csrf",
      "line-key",
    );
    await client.validateStatementImport("import/a", { expected_version: 4 }, "csrf", "validate-key");
    await client.finalizeStatementImport("import/a", { expected_version: 5 }, "csrf", "finalize-key");
    await client.statementMappingProfiles({ company_id: "company/a", bank_account_id: "bank/a", limit: 20 });
    await client.createStatementMappingProfile({ company_id: "company/a" } as never, "csrf", "profile-create-key");
    await client.updateStatementMappingProfile(
      "profile/a",
      { expected_version: 1, name: "Native bank export" },
      "csrf",
      "profile-update-key",
    );

    expect(api.listBankStatementImportOptions).toHaveBeenCalledWith("?company_id=company%2Fa");
    expect(api.listBankStatementImports).toHaveBeenCalledWith(
      "?company_id=company%2Fa&bank_account_id=bank%2Fa&state=draft&search=October+%26+payroll&limit=25&cursor=cursor%2Fvalue",
    );
    expect(api.getBankStatementImport).toHaveBeenCalledWith("import/a");
    expect(api.downloadBankStatementImportTemplate).toHaveBeenCalledWith("csv");
    expect(api.uploadBankStatementImport).toHaveBeenCalledWith(uploadFields, file, "csrf", "upload-key");
    expect(api.updateBankStatementLine).toHaveBeenCalledWith(
      "import/a",
      "line/a",
      expect.objectContaining({ expected_version: 3 }),
      "csrf",
      "line-key",
    );
    expect(api.finalizeBankStatementImport).toHaveBeenCalledWith(
      "import/a",
      { expected_version: 5 },
      "csrf",
      "finalize-key",
    );
  });

  it("adapts the complete reconciliation, match, adjustment, and decision lifecycle", async () => {
    const api = {
      listBankReconciliations: vi.fn(),
      getBankReconciliationSetup: vi.fn(),
      getBankReconciliation: vi.fn(),
      createBankReconciliation: vi.fn(),
      setBankReconciliationManualSelection: vi.fn(),
      createBankReconciliationMatch: vi.fn(),
      decideBankReconciliationMatch: vi.fn(),
      unmatchBankReconciliation: vi.fn(),
      getBankReconciliationAdjustment: vi.fn(),
      createBankReconciliationAdjustment: vi.fn(),
      updateBankReconciliationAdjustment: vi.fn(),
      submitBankReconciliationAdjustment: vi.fn(),
      decideBankReconciliationAdjustment: vi.fn(),
      postBankReconciliationAdjustment: vi.fn(),
      reverseBankReconciliationAdjustment: vi.fn(),
      submitBankReconciliation: vi.fn(),
      decideBankReconciliation: vi.fn(),
    } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);

    await client.reconciliations({ company_id: "company/a", state: "submitted", limit: 25 });
    await client.reconciliationSetup({
      company_id: "company/a",
      bank_account_id: "bank/a",
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      statement_date: "2026-10-31",
    });
    await client.reconciliation("reconciliation/a");
    await client.createReconciliation({ company_id: "company/a" } as never, "csrf", "create-key");
    await client.setReconciliationManualSelection(
      "reconciliation/a",
      { ledger_line_id: "line/a", selected: true, expected_version: 1 },
      "csrf",
      "selection-key",
    );
    await client.createReconciliationMatch(
      "reconciliation/a",
      { action: "propose", expected_version: 1 },
      "csrf",
      "match-key",
    );
    await client.decideReconciliationMatch(
      "reconciliation/a",
      "match/a",
      { action: "confirm", expected_version: 2 },
      "csrf",
      "match-decision-key",
    );
    await client.unmatchReconciliation(
      "reconciliation/a",
      "match/a",
      { expected_version: 3, reason: "Wrong ledger evidence" },
      "csrf",
      "unmatch-key",
    );
    await client.reconciliationAdjustment("reconciliation/a", "adjustment/a");
    await client.createReconciliationAdjustment(
      "reconciliation/a",
      { expected_version: 4 } as never,
      "csrf",
      "adjustment-create-key",
    );
    await client.updateReconciliationAdjustment(
      "reconciliation/a",
      "adjustment/a",
      { expected_version: 1, narrative: "Monthly bank charge" },
      "csrf",
      "adjustment-update-key",
    );
    await client.submitReconciliationAdjustment(
      "reconciliation/a",
      "adjustment/a",
      { expected_version: 2 },
      "csrf",
      "adjustment-submit-key",
    );
    await client.decideReconciliationAdjustment(
      "reconciliation/a",
      "adjustment/a",
      { action: "approve", expected_version: 3 },
      "csrf",
      "adjustment-decision-key",
    );
    await client.postReconciliationAdjustment(
      "reconciliation/a",
      "adjustment/a",
      { expected_version: 4 },
      "csrf",
      "adjustment-post-key",
    );
    await client.reverseReconciliationAdjustment(
      "reconciliation/a",
      "adjustment/a",
      { expected_version: 5, reason: "Bank reversed the charge" },
      "csrf",
      "adjustment-reverse-key",
    );
    await client.submitReconciliation("reconciliation/a", { expected_version: 6 }, "csrf", "submit-key");
    await client.decideReconciliation(
      "reconciliation/a",
      { action: "approve", expected_version: 7 },
      "csrf",
      "decision-key",
    );

    expect(api.listBankReconciliations).toHaveBeenCalledWith("?company_id=company%2Fa&state=submitted&limit=25");
    expect(api.getBankReconciliationSetup).toHaveBeenCalledWith(
      "?company_id=company%2Fa&bank_account_id=bank%2Fa&period_start=2026-10-01&period_end=2026-10-31&statement_date=2026-10-31",
    );
    expect(api.setBankReconciliationManualSelection).toHaveBeenCalledWith(
      "reconciliation/a",
      { ledger_line_id: "line/a", selected: true, expected_version: 1 },
      "csrf",
      "selection-key",
    );
    expect(api.getBankReconciliation).toHaveBeenCalledWith("reconciliation/a");
    expect(api.getBankReconciliationAdjustment).toHaveBeenCalledWith("reconciliation/a", "adjustment/a");
    expect(api.decideBankReconciliationAdjustment).toHaveBeenCalledWith(
      "reconciliation/a",
      "adjustment/a",
      { action: "approve", expected_version: 3 },
      "csrf",
      "adjustment-decision-key",
    );
    expect(api.decideBankReconciliation).toHaveBeenCalledWith(
      "reconciliation/a",
      { action: "approve", expected_version: 7 },
      "csrf",
      "decision-key",
    );
  });

  it("emits encoded adjustment routes with CSRF, idempotency, and quoted version evidence", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const api = new NexoraApiClient("http://127.0.0.1:4000");
      await api.getBankReconciliationAdjustment("reconciliation/a", "adjustment/a");
      await api.postBankReconciliationAdjustment(
        "reconciliation/a",
        "adjustment/a",
        { expected_version: 4 },
        "csrf-token",
        "adjustment-post-key",
      );

      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        "http://127.0.0.1:4000/api/v1/banking/reconciliations/reconciliation%2Fa/adjustments/adjustment%2Fa",
      );
      const [, init] = fetchMock.mock.calls[1] ?? [];
      expect(init?.headers).toMatchObject({
        "x-csrf-token": "csrf-token",
        "idempotency-key": "adjustment-post-key",
        "if-match": '"4"',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves generated ApiError identity, code, and correlation ID", async () => {
    const error = new ApiError(409, "Payment version conflict", "PAYMENT_VERSION_CONFLICT", "correlation-1");
    const api = { postBankPayment: vi.fn(async () => Promise.reject(error)) } as unknown as NexoraApiClient;
    const client = new BankingApiClient(api);

    const request = client.postPayment("payment-1", { expected_version: 4 }, "csrf", "payment-post-key");
    await expect(request).rejects.toBe(error);
    await request.catch((caught: unknown) => {
      expect(caught).toMatchObject({ code: "PAYMENT_VERSION_CONFLICT", correlationId: "correlation-1" });
    });
  });
});
