import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import type {
  BankingPaymentRepository,
  BankingReceiptRepository,
  BankingRepository,
  BankingTransferRepository,
} from "../../server/api/src/modules/banking/router.js";
import { BankingApiError } from "../../server/api/src/modules/banking/source-repository.js";

const session = {
  sessionId: "session-banking-1",
  tenantId: "tenant-banking",
  userId: "user-banking",
  csrfToken: "b".repeat(43),
  idleExpiresAt: new Date("2026-10-20T13:00:00.000Z"),
  absoluteExpiresAt: new Date("2026-10-20T20:00:00.000Z"),
};

function appForBanking(
  repository: Partial<BankingRepository>,
  paymentRepository: Partial<BankingPaymentRepository> = {},
  receiptRepository: Partial<BankingReceiptRepository> = {},
  transferRepository: Partial<BankingTransferRepository> = {},
) {
  const authentication = {
    loadAuthenticatedAccount: vi.fn(async () => ({
      tenantId: session.tenantId,
      organizationName: "Nexora Banking",
      userId: session.userId,
      email: "banking@example.test",
      displayName: "Banking User",
      roles: ["banking_manager"],
      permissions: [
        "banking.bank_account.read",
        "banking.bank_account.create",
        "banking.bank_account.update",
        "banking.bank_account.submit",
        "banking.bank_account.approve",
        "banking.bank_account.status",
        "banking.payment.read",
        "banking.payment.create",
        "banking.payment.update",
        "banking.payment.submit",
        "banking.payment.approve",
        "banking.payment.post",
        "banking.payment.reverse",
        "banking.receipt.read",
        "banking.receipt.create",
        "banking.receipt.update",
        "banking.receipt.submit",
        "banking.receipt.approve",
        "banking.receipt.post",
        "banking.receipt.reverse",
        "banking.transfer.read",
        "banking.transfer.create",
        "banking.transfer.update",
        "banking.transfer.submit",
        "banking.transfer.approve",
        "banking.transfer.post",
        "banking.transfer.reverse",
      ],
      sessionVersion: 1,
    })),
  } as unknown as TenantAuthApiService;
  const sessions = {
    get: vi.fn(async () => session),
    authorizeMutation: vi.fn(async (_token: string, csrfToken: string) =>
      csrfToken === session.csrfToken ? { status: "ok" as const, session } : { status: "invalid_csrf" as const },
    ),
  } as unknown as TenantSessionApiService;
  return createApp({
    config: { allowedOrigins: new Set(["https://banking.example.test"]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    authService: authentication,
    sessionService: sessions,
    bankingRepository: repository as BankingRepository,
    bankingPaymentRepository: paymentRepository as BankingPaymentRepository,
    bankingReceiptRepository: receiptRepository as BankingReceiptRepository,
    bankingTransferRepository: transferRepository as BankingTransferRepository,
  });
}

const paymentLine = {
  line_order: 1,
  document_date: "2026-10-19",
  external_reference: "INV-1001",
  payment_method: "bank_transfer" as const,
  nominal_account_id: "nominal-1",
  narration: "Supplier payment",
  amount: "125.00",
  dimensions: {},
};

const paymentCreate = {
  company_id: "company-a",
  bank_account_id: "bank-account-1",
  posting_date: "2026-10-19",
  lines: [paymentLine],
};

describe("Bank workflow option projections", () => {
  for (const kind of ["payments", "receipts"] as const)
    it(`enforces HTTP mutation guards on ${kind} reassignment`, async () => {
      const reassign = vi.fn(async () => ({
        id: "transaction-one",
        reference: "SYN-1",
        state: "submitted",
        version: 3,
        audit_event_id: "synthetic-audit",
        replayed: false,
      }));
      const app = appForBanking({}, kind === "payments" ? { reassign } : {}, kind === "receipts" ? { reassign } : {}),
        path = `/api/v1/banking/${kind}/transaction-one/approver`;
      const input = { approver_user_id: "checker-two", expected_version: 2 };
      expect((await request(app).post(path).send(input)).status).toBe(401);
      expect(
        (
          await request(app)
            .post(path)
            .set("cookie", "nexora_session=token-banking")
            .set("origin", "https://untrusted.example.test")
            .send(input)
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(path)
            .set("cookie", "nexora_session=token-banking")
            .set("origin", "https://banking.example.test")
            .set("x-csrf-token", session.csrfToken)
            .set("idempotency-key", "synthetic-reassign")
            .set("if-match", '"1"')
            .send(input)
        ).status,
      ).toBe(412);
      expect(reassign).not.toHaveBeenCalled();
      const response = await request(app)
        .post(path)
        .set("cookie", "nexora_session=token-banking")
        .set("origin", "https://banking.example.test")
        .set("x-csrf-token", session.csrfToken)
        .set("idempotency-key", "synthetic-reassign")
        .set("if-match", '"2"')
        .send(input);
      expect(response.status).toBe(200);
      expect(reassign).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: session.tenantId }),
        "transaction-one",
        input,
        "synthetic-reassign",
        expect.any(String),
      );
    });
  for (const kind of ["payments", "receipts"] as const) {
    it(`authenticates and validates the bounded ${kind} directory before dispatch`, async () => {
      const workflowOptions = vi.fn(async () => ({ items: [], selected: null, next_cursor: null }));
      const app = appForBanking(
        {},
        kind === "payments" ? { workflowOptions } : {},
        kind === "receipts" ? { workflowOptions } : {},
      );
      const path = `/api/v1/banking/${kind}/workflow_options`;
      expect((await request(app).get(`${path}?company_id=company-a&kind=project`)).status).toBe(401);
      expect(workflowOptions).not.toHaveBeenCalled();
      for (const query of [
        "kind=project",
        "company_id=company-a&kind=unknown",
        "company_id=company-a&kind=project&limit=101",
        "company_id=company-a&kind=project&tenant_id=forged",
      ]) {
        expect((await request(app).get(`${path}?${query}`).set("cookie", "nexora_session=token-banking")).status).toBe(
          400,
        );
      }
      expect(workflowOptions).not.toHaveBeenCalled();
      const response = await request(app)
        .get(`${path}?company_id=company-a&kind=project&limit=10`)
        .set("cookie", "nexora_session=token-banking");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [], selected: null, next_cursor: null });
      expect(workflowOptions).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: session.tenantId }),
        expect.objectContaining({ company_id: "company-a", kind: "project", limit: 10 }),
      );
    });
  }
});

describe("Bank Transfer API routes", () => {
  const transferInput = {
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

  it("authenticates, validates, and dispatches Transfer directory and create requests", async () => {
    const list = vi.fn(async () => ({ items: [], next_cursor: null }));
    const create = vi.fn(async () => ({
      id: "transfer-1",
      reference: "TRF-1",
      state: "draft" as const,
      version: 1,
      audit_event_id: "audit-1",
      replayed: false,
    }));
    const app = appForBanking({}, {}, {}, { list, create });
    expect((await request(app).get("/api/v1/banking/transfers?company_id=company-a")).status).toBe(401);
    const directory = await request(app)
      .get("/api/v1/banking/transfers?company_id=company-a&limit=25")
      .set("cookie", "nexora_session=token-banking");
    expect(directory.status).toBe(200);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      expect.objectContaining({ company_id: "company-a", limit: 25 }),
    );

    const created = await request(app)
      .post("/api/v1/banking/transfers")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "transfer-create")
      .send(transferInput);
    expect(created.status).toBe(201);
    expect(created.headers.etag).toBe('"1"');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      transferInput,
      "transfer-create",
      expect.any(String),
    );
  });

  it("requires matching If-Match evidence for Transfer lifecycle mutations", async () => {
    const submit = vi.fn(async () => ({
      id: "transfer-1",
      reference: "TRF-1",
      state: "submitted" as const,
      version: 2,
      audit_event_id: "audit-2",
      replayed: false,
    }));
    const app = appForBanking({}, {}, {}, { submit });
    const stale = await request(app)
      .post("/api/v1/banking/transfers/transfer-1/submit")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "transfer-submit")
      .set("if-match", '"1"')
      .send({ expected_version: 2 });
    expect(stale.status).toBe(412);
    expect(submit).not.toHaveBeenCalled();

    const accepted = await request(app)
      .post("/api/v1/banking/transfers/transfer-1/submit")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "transfer-submit")
      .set("if-match", '"2"')
      .send({ expected_version: 2 });
    expect(accepted.status).toBe(200);
    expect(accepted.headers.etag).toBe('"2"');
  });
});

const receiptCreate = {
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

function paymentMutation(version: number, replayed = false) {
  return {
    id: "payment-1",
    reference: "BP-2026-000001",
    state: "draft" as const,
    version,
    audit_event_id: `audit-${version}`,
    replayed,
  };
}

function receiptMutation(version: number, replayed = false) {
  return {
    id: "receipt-1",
    reference: "BR-2026-000001",
    state: "draft" as const,
    version,
    audit_event_id: `receipt-audit-${version}`,
    replayed,
  };
}

const paymentRepositoryForLifecycle = {
  update: vi.fn(async () => paymentMutation(2)),
  submit: vi.fn(async () => ({ ...paymentMutation(3), state: "submitted" as const })),
  decide: vi.fn(async () => ({ ...paymentMutation(4), state: "approved" as const })),
  post: vi.fn(async () => ({
    ...paymentMutation(5),
    state: "posted" as const,
    accounting_event_id: "event-1",
    journal_id: "journal-1",
    journal_entry_number: "JE-0001",
  })),
  reverse: vi.fn(async () => ({
    ...paymentMutation(6),
    state: "reversed" as const,
    original_accounting_event_id: "event-1",
    original_journal_id: "journal-1",
    reversal_accounting_event_id: "event-2",
    reversal_journal_id: "journal-2",
    reversal_journal_entry_number: "JE-0002",
  })),
};

const receiptRepositoryForLifecycle = {
  update: vi.fn(async () => receiptMutation(2)),
  submit: vi.fn(async () => ({ ...receiptMutation(3), state: "submitted" as const })),
  decide: vi.fn(async () => ({ ...receiptMutation(4), state: "approved" as const })),
  post: vi.fn(async () => ({
    ...receiptMutation(5),
    state: "posted" as const,
    accounting_event_id: "receipt-event-1",
    journal_id: "receipt-journal-1",
    journal_entry_number: "JE-R-0001",
  })),
  reverse: vi.fn(async () => ({
    ...receiptMutation(6),
    state: "reversed" as const,
    original_accounting_event_id: "receipt-event-1",
    original_journal_id: "receipt-journal-1",
    reversal_accounting_event_id: "receipt-event-2",
    reversal_journal_id: "receipt-journal-2",
    reversal_journal_entry_number: "JE-R-0002",
  })),
};

function mutationRequest(method: "patch" | "post", path: string) {
  const agent = request(appForBanking({}, paymentRepositoryForLifecycle));
  const operation = method === "patch" ? agent.patch(path) : agent.post(path);
  return operation
    .set("cookie", "nexora_session=token-banking")
    .set("origin", "https://banking.example.test")
    .set("x-csrf-token", session.csrfToken)
    .set("idempotency-key", `payment-${method}-${path}`);
}

function receiptMutationRequest(method: "patch" | "post", path: string) {
  const agent = request(appForBanking({}, {}, receiptRepositoryForLifecycle));
  const operation = method === "patch" ? agent.patch(path) : agent.post(path);
  return operation
    .set("cookie", "nexora_session=token-banking")
    .set("origin", "https://banking.example.test")
    .set("x-csrf-token", session.csrfToken)
    .set("idempotency-key", `receipt-${method}-${path}`);
}

describe("Banking API foundation", () => {
  it("checks the authoritative Finance and Banking relations in production readiness", () => {
    const serverSource = readFileSync(new URL("../../server/api/src/server.ts", import.meta.url), "utf8");
    const readinessSource = readFileSync(
      new URL("../../server/api/src/modules/banking/readiness.ts", import.meta.url),
      "utf8",
    );
    expect(serverSource).toContain("banking_foundation: createBankingFoundationReadiness(pool)");
    expect(readinessSource).toContain("to_regclass('public.journal_line')");
    expect(readinessSource).not.toContain("to_regclass('public.journal_entry_line')");
    expect(readinessSource).toContain("to_regclass('public.bank_receipt')");
    expect(readinessSource).toContain("to_regclass('public.bank_receipt_line')");
    expect(readinessSource).toContain("to_regclass('public.bank_receipt_event')");
    expect(readinessSource).toContain("module_name='finance' and version>=30");
    expect(readinessSource).toContain("to_regclass('public.finance_coa_master_change')");
    expect(readinessSource).toContain("to_regclass('public.bank_assignment_intervention')");
    expect(readinessSource).toContain("module_name='platform' and version>=11");
    expect(readinessSource).toContain("module_name='security' and version>=19");
    expect(readinessSource).toContain("to_regclass('public.bank_revaluation_reversal_schedule')");
  });

  it("fails fast when production Banking repositories are only partially composed", () => {
    expect(() =>
      createApp({
        config: { allowedOrigins: new Set() },
        logger: createLogger(new PassThrough()),
        metrics: createMetrics(),
        readiness: {},
        bankingRepository: {} as BankingRepository,
      }),
    ).toThrow("Banking account, payment, and receipt repositories must be configured together.");
  });

  it("keeps the account directory behind an authenticated session and parses bounded filters", async () => {
    const repository = {
      listAccounts: vi.fn(async () => ({ items: [], next_cursor: null })),
    };
    const blocked = await request(appForBanking(repository)).get(
      "/api/v1/banking/accounts?company_id=company-a&limit=25",
    );
    expect(blocked.status).toBe(401);
    expect(repository.listAccounts).not.toHaveBeenCalled();

    const accepted = await request(appForBanking(repository))
      .get(
        "/api/v1/banking/accounts?company_id=company-a&search=Operating&currency=USD&state=active&sort_by=bank_name&sort_direction=desc&limit=25",
      )
      .set("cookie", "nexora_session=token-banking");
    expect(accepted.status).toBe(200);
    expect(repository.listAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: session.tenantId,
        actor: expect.objectContaining({ userId: session.userId }),
      }),
      {
        company_id: "company-a",
        search: "Operating",
        currency: "USD",
        state: "active",
        sort_by: "bank_name",
        sort_direction: "desc",
        limit: 25,
      },
    );
  });

  it("rejects invalid directory bounds before reaching persistence", async () => {
    const repository = { listAccounts: vi.fn() };
    const response = await request(appForBanking(repository))
      .get("/api/v1/banking/accounts?company_id=company-a&limit=101")
      .set("cookie", "nexora_session=token-banking");
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_REQUEST");
    expect(repository.listAccounts).not.toHaveBeenCalled();
  });

  it("protects account creation with origin, CSRF, idempotency, and strict contract parsing", async () => {
    const repository = {
      createAccount: vi.fn(async () => ({
        id: "bank-account-1",
        reference: "BA-2026-0001",
        state: "draft" as const,
        version: 1,
        audit_event_id: "audit-1",
        replayed: false,
      })),
    };
    const payload = {
      company_id: "company-a",
      account_name: "Operating USD",
      account_type: "current",
      bank_name: "First Meridian Bank",
      account_number: "001234567890",
      currency: "USD",
      ledger_account_id: "ledger-bank-usd",
    };
    const untrusted = await request(appForBanking(repository))
      .post("/api/v1/banking/accounts")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://untrusted.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "bank-create-1")
      .send(payload);
    expect(untrusted.status).toBe(403);
    expect(untrusted.body.code).toBe("ORIGIN_VALIDATION_FAILED");

    const accepted = await request(appForBanking(repository))
      .post("/api/v1/banking/accounts")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "bank-create-1")
      .send(payload);
    expect(accepted.status).toBe(201);
    expect(repository.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      expect.objectContaining({ ...payload, opening_balance: "0", overdraft_limit: "0" }),
      "bank-create-1",
      expect.any(String),
    );
  });

  it("maps safe Banking domain errors to the standard problem response", async () => {
    const repository = {
      getAccount: vi.fn(async () => {
        throw new BankingApiError(404, "BANK_ACCOUNT_NOT_FOUND", "The bank account is unavailable.");
      }),
    };
    const response = await request(appForBanking(repository))
      .get("/api/v1/banking/accounts/bank-account-1")
      .set("cookie", "nexora_session=token-banking");
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ status: 404, code: "BANK_ACCOUNT_NOT_FOUND" });
  });

  it("keeps the keyset payment directory authenticated, company-scoped, and contract bounded", async () => {
    const paymentRepository = {
      list: vi.fn(async () => ({ items: [], next_cursor: "next-payment-cursor" })),
    };
    const blocked = await request(appForBanking({}, paymentRepository)).get(
      "/api/v1/banking/payments?company_id=company-a",
    );
    expect(blocked.status).toBe(401);
    expect(paymentRepository.list).not.toHaveBeenCalled();

    const missingCompany = await request(appForBanking({}, paymentRepository))
      .get("/api/v1/banking/payments")
      .set("cookie", "nexora_session=token-banking");
    expect(missingCompany.status).toBe(400);
    expect(missingCompany.body.code).toBe("INVALID_REQUEST");

    const accepted = await request(appForBanking({}, paymentRepository))
      .get(
        "/api/v1/banking/payments?company_id=company-a&bank_account_id=bank-account-1&state=draft&posting_date_from=2026-10-01&posting_date_to=2026-10-31&search=INV-1001&sort_by=reference&sort_direction=asc&limit=25&cursor=opaque-cursor",
      )
      .set("cookie", "nexora_session=token-banking");
    expect(accepted.status).toBe(200);
    expect(accepted.headers["cache-control"]).toBe("no-store");
    expect(paymentRepository.list).toHaveBeenCalledWith(expect.objectContaining({ tenantId: session.tenantId }), {
      company_id: "company-a",
      bank_account_id: "bank-account-1",
      state: "draft",
      posting_date_from: "2026-10-01",
      posting_date_to: "2026-10-31",
      search: "INV-1001",
      sort_by: "reference",
      sort_direction: "asc",
      limit: 25,
      cursor: "opaque-cursor",
    });
  });

  it("composes payment option, nominal-account, and detail reads with a detail ETag", async () => {
    const paymentRepository = {
      options: vi.fn(async () => ({ bank_accounts: [] })),
      listNominalAccounts: vi.fn(async () => ({ items: [] })),
      get: vi.fn(async () => ({ id: "payment-1", version: 7 })),
    };
    const app = appForBanking({}, paymentRepository);
    const options = await request(app)
      .get("/api/v1/banking/payments/options?company_id=company-a")
      .set("cookie", "nexora_session=token-banking");
    const nominals = await request(app)
      .get("/api/v1/banking/payments/nominal_accounts?company_id=company-a&search=expense&limit=20")
      .set("cookie", "nexora_session=token-banking");
    const detail = await request(app)
      .get("/api/v1/banking/payments/payment-1")
      .set("cookie", "nexora_session=token-banking");

    expect(options.status).toBe(200);
    expect(nominals.status).toBe(200);
    expect(detail.status).toBe(200);
    expect(detail.headers.etag).toBe('"7"');
    expect(paymentRepository.options).toHaveBeenCalledWith(expect.anything(), { company_id: "company-a" });
    expect(paymentRepository.listNominalAccounts).toHaveBeenCalledWith(expect.anything(), {
      company_id: "company-a",
      search: "expense",
      limit: 20,
    });
    expect(paymentRepository.get).toHaveBeenCalledWith(expect.anything(), "payment-1");
  });

  it("protects exact payment creation with session, origin, CSRF, and idempotency controls", async () => {
    const paymentRepository = { create: vi.fn(async () => paymentMutation(1)) };
    const app = appForBanking({}, paymentRepository);

    const anonymous = await request(app).post("/api/v1/banking/payments").send(paymentCreate);
    expect(anonymous.status).toBe(401);

    const untrusted = await request(app)
      .post("/api/v1/banking/payments")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://untrusted.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "payment-create-untrusted")
      .send(paymentCreate);
    expect(untrusted.status).toBe(403);
    expect(untrusted.body.code).toBe("ORIGIN_VALIDATION_FAILED");

    const missingCsrf = await request(app)
      .post("/api/v1/banking/payments")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://banking.example.test")
      .set("idempotency-key", "payment-create-no-csrf")
      .send(paymentCreate);
    expect(missingCsrf.status).toBe(403);

    const missingIdempotency = await request(app)
      .post("/api/v1/banking/payments")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", session.csrfToken)
      .send(paymentCreate);
    expect(missingIdempotency.status).toBe(400);
    expect(missingIdempotency.body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const invalid = await request(app)
      .post("/api/v1/banking/payments")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "payment-create-invalid")
      .send({ ...paymentCreate, client_total: "125.00" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("INVALID_REQUEST");

    const accepted = await request(app)
      .post("/api/v1/banking/payments")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "payment-create-1")
      .send(paymentCreate);
    expect(accepted.status).toBe(201);
    expect(accepted.headers.etag).toBe('"1"');
    expect(paymentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      paymentCreate,
      "payment-create-1",
      expect.any(String),
    );

    paymentRepository.create.mockResolvedValueOnce(paymentMutation(1, true));
    const replayed = await request(app)
      .post("/api/v1/banking/payments")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "payment-create-1")
      .send(paymentCreate);
    expect(replayed.status).toBe(201);
    expect(replayed.body.replayed).toBe(true);
    expect(replayed.headers.etag).toBe('"1"');
  });

  it("supports optional matching If-Match and all five versioned payment lifecycle routes", async () => {
    vi.clearAllMocks();
    const updated = await mutationRequest("patch", "/api/v1/banking/payments/payment-1").send({
      expected_version: 1,
      posting_date: "2026-10-20",
    });
    expect(updated.status).toBe(200);
    expect(updated.headers.etag).toBe('"2"');

    const submitted = await mutationRequest("post", "/api/v1/banking/payments/payment-1/submit")
      .set("if-match", '"2"')
      .send({ expected_version: 2 });
    expect(submitted.status).toBe(200);
    expect(submitted.headers.etag).toBe('"3"');

    const decided = await mutationRequest("post", "/api/v1/banking/payments/payment-1/decision")
      .set("if-match", '"3"')
      .send({ action: "approve", expected_version: 3 });
    expect(decided.status).toBe(200);

    const posted = await mutationRequest("post", "/api/v1/banking/payments/payment-1/post")
      .set("if-match", '"4"')
      .send({ expected_version: 4 });
    expect(posted.status).toBe(200);

    const reversed = await mutationRequest("post", "/api/v1/banking/payments/payment-1/reverse")
      .set("if-match", '"5"')
      .send({ expected_version: 5, reason: "Duplicate supplier settlement" });
    expect(reversed.status).toBe(200);
    expect(reversed.headers.etag).toBe('"6"');
    expect(paymentRepositoryForLifecycle.update).toHaveBeenCalledOnce();
    expect(paymentRepositoryForLifecycle.submit).toHaveBeenCalledOnce();
    expect(paymentRepositoryForLifecycle.decide).toHaveBeenCalledOnce();
    expect(paymentRepositoryForLifecycle.post).toHaveBeenCalledOnce();
    expect(paymentRepositoryForLifecycle.reverse).toHaveBeenCalledOnce();
  });

  it("rejects malformed and mismatched payment If-Match values before persistence", async () => {
    vi.clearAllMocks();
    const malformed = await mutationRequest("post", "/api/v1/banking/payments/payment-1/submit")
      .set("if-match", "2")
      .send({ expected_version: 2 });
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("INVALID_IF_MATCH");

    const weak = await mutationRequest("post", "/api/v1/banking/payments/payment-1/submit")
      .set("if-match", 'W/"2"')
      .send({ expected_version: 2 });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe("INVALID_IF_MATCH");

    const mismatched = await mutationRequest("post", "/api/v1/banking/payments/payment-1/post")
      .set("if-match", '"3"')
      .send({ expected_version: 4 });
    expect(mismatched.status).toBe(412);
    expect(mismatched.body.code).toBe("PAYMENT_PRECONDITION_FAILED");
    expect(paymentRepositoryForLifecycle.submit).not.toHaveBeenCalled();
    expect(paymentRepositoryForLifecycle.post).not.toHaveBeenCalled();
  });

  it("enforces origin, CSRF, and idempotency guards on every payment lifecycle mutation", async () => {
    vi.clearAllMocks();
    const cases = [
      { path: "/api/v1/banking/payments/payment-1/submit", body: { expected_version: 2 }, operation: "submit" },
      {
        path: "/api/v1/banking/payments/payment-1/decision",
        body: { action: "approve", expected_version: 3 },
        operation: "decide",
      },
      { path: "/api/v1/banking/payments/payment-1/post", body: { expected_version: 4 }, operation: "post" },
      {
        path: "/api/v1/banking/payments/payment-1/reverse",
        body: { expected_version: 5, reason: "Controlled reversal reason" },
        operation: "reverse",
      },
    ] as const;

    for (const testCase of cases) {
      const untrusted = await request(appForBanking({}, paymentRepositoryForLifecycle))
        .post(testCase.path)
        .set("cookie", "nexora_session=token-banking")
        .set("origin", "https://untrusted.example.test")
        .set("x-csrf-token", session.csrfToken)
        .set("idempotency-key", `untrusted-${testCase.operation}`)
        .send(testCase.body);
      expect(untrusted.status, testCase.operation).toBe(403);
      expect(untrusted.body.code, testCase.operation).toBe("ORIGIN_VALIDATION_FAILED");

      const missingCsrf = await request(appForBanking({}, paymentRepositoryForLifecycle))
        .post(testCase.path)
        .set("cookie", "nexora_session=token-banking")
        .set("origin", "https://banking.example.test")
        .set("idempotency-key", `missing-csrf-${testCase.operation}`)
        .send(testCase.body);
      expect(missingCsrf.status, testCase.operation).toBe(403);

      const missingIdempotency = await request(appForBanking({}, paymentRepositoryForLifecycle))
        .post(testCase.path)
        .set("cookie", "nexora_session=token-banking")
        .set("origin", "https://banking.example.test")
        .set("x-csrf-token", session.csrfToken)
        .send(testCase.body);
      expect(missingIdempotency.status, testCase.operation).toBe(400);
      expect(missingIdempotency.body.code, testCase.operation).toBe("IDEMPOTENCY_KEY_REQUIRED");
      expect(paymentRepositoryForLifecycle[testCase.operation]).not.toHaveBeenCalled();
    }
  });

  it("composes authenticated receipt reads with bounded queries, static routes, and a detail ETag", async () => {
    const receiptRepository = {
      list: vi.fn(async () => ({ items: [], next_cursor: "next-receipt-cursor" })),
      options: vi.fn(async () => ({ bank_accounts: [], receipt_methods: [] })),
      listNominalAccounts: vi.fn(async () => ({ items: [] })),
      get: vi.fn(async () => ({ id: "receipt-1", version: 7 })),
    };
    const app = appForBanking({}, {}, receiptRepository);
    const blocked = await request(app).get("/api/v1/banking/receipts?company_id=company-a");
    expect(blocked.status).toBe(401);

    const directory = await request(app)
      .get(
        "/api/v1/banking/receipts?company_id=company-a&bank_account_id=bank-account-1&state=draft&posting_date_from=2026-10-01&posting_date_to=2026-10-31&search=Customer&sort_by=reference&sort_direction=asc&limit=25&cursor=opaque-cursor",
      )
      .set("cookie", "nexora_session=token-banking");
    const options = await request(app)
      .get("/api/v1/banking/receipts/options?company_id=company-a")
      .set("cookie", "nexora_session=token-banking");
    const nominals = await request(app)
      .get("/api/v1/banking/receipts/nominal_accounts?company_id=company-a&search=revenue&limit=20")
      .set("cookie", "nexora_session=token-banking");
    const detail = await request(app)
      .get("/api/v1/banking/receipts/receipt-1")
      .set("cookie", "nexora_session=token-banking");

    expect(directory.status).toBe(200);
    expect(options.status).toBe(200);
    expect(nominals.status).toBe(200);
    expect(detail.status).toBe(200);
    expect(detail.headers.etag).toBe('"7"');
    expect(receiptRepository.list).toHaveBeenCalledWith(expect.anything(), {
      company_id: "company-a",
      bank_account_id: "bank-account-1",
      state: "draft",
      posting_date_from: "2026-10-01",
      posting_date_to: "2026-10-31",
      search: "Customer",
      sort_by: "reference",
      sort_direction: "asc",
      limit: 25,
      cursor: "opaque-cursor",
    });
    expect(receiptRepository.options).toHaveBeenCalledWith(expect.anything(), { company_id: "company-a" });
    expect(receiptRepository.listNominalAccounts).toHaveBeenCalledWith(expect.anything(), {
      company_id: "company-a",
      search: "revenue",
      limit: 20,
    });
    expect(receiptRepository.get).toHaveBeenCalledWith(expect.anything(), "receipt-1");
  });

  it("protects strict receipt creation with session, origin, CSRF, idempotency, and an ETag", async () => {
    const receiptRepository = { create: vi.fn(async () => receiptMutation(1)) };
    const app = appForBanking({}, {}, receiptRepository);
    expect((await request(app).post("/api/v1/banking/receipts").send(receiptCreate)).status).toBe(401);

    const untrusted = await request(app)
      .post("/api/v1/banking/receipts")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://untrusted.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "receipt-create-untrusted")
      .send(receiptCreate);
    expect(untrusted.status).toBe(403);
    expect(untrusted.body.code).toBe("ORIGIN_VALIDATION_FAILED");

    const invalid = await request(app)
      .post("/api/v1/banking/receipts")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "receipt-create-invalid")
      .send({ ...receiptCreate, client_total: "125.00" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("INVALID_REQUEST");

    const accepted = await request(app)
      .post("/api/v1/banking/receipts")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "receipt-create-1")
      .send(receiptCreate);
    expect(accepted.status).toBe(201);
    expect(accepted.headers.etag).toBe('"1"');
    expect(receiptRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      receiptCreate,
      "receipt-create-1",
      expect.any(String),
    );
  });

  it("supports all five versioned receipt lifecycle routes and rejects stale preconditions", async () => {
    vi.clearAllMocks();
    const updated = await receiptMutationRequest("patch", "/api/v1/banking/receipts/receipt-1").send({
      expected_version: 1,
      posting_date: "2026-10-20",
    });
    const submitted = await receiptMutationRequest("post", "/api/v1/banking/receipts/receipt-1/submit")
      .set("if-match", '"2"')
      .send({ expected_version: 2 });
    const decided = await receiptMutationRequest("post", "/api/v1/banking/receipts/receipt-1/decision")
      .set("if-match", '"3"')
      .send({ action: "approve", expected_version: 3 });
    const posted = await receiptMutationRequest("post", "/api/v1/banking/receipts/receipt-1/post")
      .set("if-match", '"4"')
      .send({ expected_version: 4 });
    const reversed = await receiptMutationRequest("post", "/api/v1/banking/receipts/receipt-1/reverse")
      .set("if-match", '"5"')
      .send({ expected_version: 5, reason: "Duplicate customer receipt" });

    expect([updated.status, submitted.status, decided.status, posted.status, reversed.status]).toEqual([
      200, 200, 200, 200, 200,
    ]);
    expect([
      updated.headers.etag,
      submitted.headers.etag,
      decided.headers.etag,
      posted.headers.etag,
      reversed.headers.etag,
    ]).toEqual(['"2"', '"3"', '"4"', '"5"', '"6"']);
    expect(receiptRepositoryForLifecycle.update).toHaveBeenCalledOnce();
    expect(receiptRepositoryForLifecycle.submit).toHaveBeenCalledOnce();
    expect(receiptRepositoryForLifecycle.decide).toHaveBeenCalledOnce();
    expect(receiptRepositoryForLifecycle.post).toHaveBeenCalledOnce();
    expect(receiptRepositoryForLifecycle.reverse).toHaveBeenCalledOnce();

    const stale = await receiptMutationRequest("post", "/api/v1/banking/receipts/receipt-1/post")
      .set("if-match", '"3"')
      .send({ expected_version: 4 });
    expect(stale.status).toBe(412);
    expect(stale.body.code).toBe("RECEIPT_PRECONDITION_FAILED");
  });

  it("enforces origin, CSRF, and idempotency guards on every receipt lifecycle mutation", async () => {
    vi.clearAllMocks();
    const cases = [
      {
        method: "patch" as const,
        path: "/api/v1/banking/receipts/receipt-1",
        body: { expected_version: 1, value_date: null },
        operation: "update",
      },
      {
        method: "post" as const,
        path: "/api/v1/banking/receipts/receipt-1/submit",
        body: { expected_version: 2 },
        operation: "submit",
      },
      {
        method: "post" as const,
        path: "/api/v1/banking/receipts/receipt-1/decision",
        body: { action: "approve", expected_version: 3 },
        operation: "decide",
      },
      {
        method: "post" as const,
        path: "/api/v1/banking/receipts/receipt-1/post",
        body: { expected_version: 4 },
        operation: "post",
      },
      {
        method: "post" as const,
        path: "/api/v1/banking/receipts/receipt-1/reverse",
        body: { expected_version: 5, reason: "Controlled reversal reason" },
        operation: "reverse",
      },
    ] as const;

    for (const testCase of cases) {
      const app = appForBanking({}, {}, receiptRepositoryForLifecycle);
      const untrustedAgent = request(app)[testCase.method](testCase.path);
      const untrusted = await untrustedAgent
        .set("cookie", "nexora_session=token-banking")
        .set("origin", "https://untrusted.example.test")
        .set("x-csrf-token", session.csrfToken)
        .set("idempotency-key", `receipt-untrusted-${testCase.operation}`)
        .send(testCase.body);
      expect(untrusted.status, testCase.operation).toBe(403);

      const missingIdempotencyAgent = request(app)[testCase.method](testCase.path);
      const missingIdempotency = await missingIdempotencyAgent
        .set("cookie", "nexora_session=token-banking")
        .set("origin", "https://banking.example.test")
        .set("x-csrf-token", session.csrfToken)
        .send(testCase.body);
      expect(missingIdempotency.status, testCase.operation).toBe(400);
      expect(missingIdempotency.body.code, testCase.operation).toBe("IDEMPOTENCY_KEY_REQUIRED");
      expect(receiptRepositoryForLifecycle[testCase.operation]).not.toHaveBeenCalled();
    }
  });
});
