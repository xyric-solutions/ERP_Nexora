import { createHash } from "node:crypto";
import { PassThrough, Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp, type AppDependencies } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { BankingApiError } from "../../server/api/src/modules/banking/source-repository.js";

const csrfToken = "c".repeat(43);
const session = {
  sessionId: "br06-session",
  tenantId: "tenant-a",
  userId: "maker-a",
  csrfToken,
  idleExpiresAt: new Date("2026-10-23T13:00:00.000Z"),
  absoluteExpiresAt: new Date("2026-10-23T20:00:00.000Z"),
};

const adjustment = {
  id: "adjustment-a",
  statement_line_id: "statement-a",
  kind: "bank_charge" as const,
  offset_nominal_id: "nominal-a",
  offset_nominal_code: "6100",
  offset_nominal_name: "Bank charges",
  narrative: "Monthly bank charge",
  direction: "money_out" as const,
  amount: "25.00000000",
  currency: "USD",
  state: "draft" as const,
  version: 1,
  created_by: "maker-a",
  submitted_by: null,
  approved_by: null,
  posted_by: null,
  reversed_by: null,
  journal_id: null,
  bank_journal_line_id: null,
};

const mutationResult = {
  reconciliation_id: "reconciliation-a",
  reconciliation_version: 2,
  adjustment,
  balances: {
    currency: "USD",
    opening_statement_balance: "0.00000000",
    statement_money_in: "0.00000000",
    statement_money_out: "25.00000000",
    reconstructed_statement_balance: "-25.00000000",
    closing_statement_balance: "-25.00000000",
    ledger_balance_at_cutoff: "0.00000000",
    unmatched_ledger_money_in: "0.00000000",
    unmatched_ledger_money_out: "0.00000000",
    adjusted_ledger_balance: "0.00000000",
    difference: "-25.00000000",
    matched_count: 0,
    unmatched_statement_count: 1,
    unmatched_ledger_count: 0,
    adjustment_count: 1,
  },
  audit_event_id: "audit-a",
  replayed: false,
};

function appForAdjustment(
  repository: Record<string, unknown>,
  permissions?: string[],
  related: {
    statementRepository?: Record<string, unknown>;
    statementStorage?: Record<string, unknown>;
    reconciliationRepository?: Record<string, unknown>;
  } = {},
) {
  const authentication = {
    loadAuthenticatedAccount: vi.fn(async () => ({
      tenantId: session.tenantId,
      organizationName: "Tenant A",
      userId: session.userId,
      email: "maker@example.invalid",
      displayName: "Maker",
      roles: [],
      permissions: permissions ?? [
        "banking.reconciliation.read",
        "banking.reconciliation_adjustment.read",
        "banking.reconciliation_adjustment.create",
        "banking.reconciliation_adjustment.update",
        "banking.reconciliation_adjustment.submit",
        "banking.reconciliation_adjustment.approve",
        "banking.reconciliation_adjustment.post",
        "banking.reconciliation_adjustment.reverse",
      ],
      sessionVersion: 1,
    })),
  } as unknown as TenantAuthApiService;
  const sessions = {
    get: vi.fn(async () => session),
    authorizeMutation: vi.fn(async (_token: string, supplied: string) =>
      supplied === csrfToken ? { status: "ok" as const, session } : { status: "invalid_csrf" as const },
    ),
  } as unknown as TenantSessionApiService;
  return createApp({
    config: { allowedOrigins: new Set(["https://banking.example.test"]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    authService: authentication,
    sessionService: sessions,
    bankingRepository: {} as never,
    bankingPaymentRepository: {} as never,
    bankingReceiptRepository: {} as never,
    bankingStatementRepository: (related.statementRepository ?? {}) as never,
    bankingStatementStorage: (related.statementStorage ?? {}) as never,
    bankingReconciliationRepository: (related.reconciliationRepository ?? {}) as never,
    bankingReconciliationAdjustmentRepository: repository as never,
  } as AppDependencies);
}

function mutation(app: ReturnType<typeof appForAdjustment>, method: "post" | "patch", path: string) {
  const agent = request(app);
  return agent[method](path)
    .set("cookie", "nexora_session=br06-token")
    .set("origin", "https://banking.example.test")
    .set("x-csrf-token", csrfToken)
    .set("idempotency-key", `key-${method}-${path.replaceAll("/", "-")}`)
    .set("if-match", '"1"');
}

describe("Bank Reconciliation adjustment API routes", () => {
  it("requires authentication, trusted origin, CSRF, idempotency and exact version evidence", async () => {
    const create = vi.fn(async () => mutationResult);
    const app = appForAdjustment({ create });
    const path = "/api/v1/banking/reconciliations/reconciliation-a/adjustments";
    const body = {
      expected_version: 1,
      statement_line_id: "statement-a",
      kind: "bank_charge",
      offset_nominal_id: "nominal-a",
      narrative: "Monthly bank charge",
    };

    expect((await request(app).post(path).send(body)).status).toBe(401);
    expect(
      (
        await request(app)
          .post(path)
          .set("cookie", "nexora_session=br06-token")
          .set("origin", "https://untrusted.example.test")
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(path)
          .set("cookie", "nexora_session=br06-token")
          .set("origin", "https://banking.example.test")
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(path)
          .set("cookie", "nexora_session=br06-token")
          .set("origin", "https://banking.example.test")
          .set("x-csrf-token", csrfToken)
          .set("if-match", '"1"')
          .send(body)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(path)
          .set("cookie", "nexora_session=br06-token")
          .set("origin", "https://banking.example.test")
          .set("x-csrf-token", csrfToken)
          .set("idempotency-key", "missing-version")
          .send(body)
      ).status,
    ).toBe(428);
    expect((await mutation(app, "post", path).set("if-match", '"2"').send(body)).status).toBe(412);
    expect((await mutation(app, "post", path).send({ ...body, amount: "999" })).status).toBe(400);
    expect(create).not.toHaveBeenCalled();

    const response = await mutation(app, "post", path).send(body);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.headers.etag).toBe('"1"');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a" }),
      "reconciliation-a",
      body,
      expect.any(String),
      expect.any(String),
    );
  });

  it("exposes authenticated read, draft update, submit, decision, post and reverse routes", async () => {
    const get = vi.fn(async () => adjustment);
    const repository = {
      get,
      update: vi.fn(async () => mutationResult),
      submit: vi.fn(async () => mutationResult),
      decide: vi.fn(async () => mutationResult),
      post: vi.fn(async () => mutationResult),
      reverse: vi.fn(async () => mutationResult),
    };
    const app = appForAdjustment(repository);
    const base = "/api/v1/banking/reconciliations/reconciliation-a/adjustments/adjustment-a";
    expect((await request(app).get(base)).status).toBe(401);
    const read = await request(app).get(base).set("cookie", "nexora_session=br06-token");
    expect(read.status).toBe(200);
    expect(read.headers.etag).toBe('"1"');
    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a" }),
      "reconciliation-a",
      "adjustment-a",
    );

    const cases = [
      ["patch", base, { expected_version: 1, narrative: "Updated bank charge" }, "update"],
      ["post", `${base}/submit`, { expected_version: 1 }, "submit"],
      ["post", `${base}/decision`, { action: "approve", expected_version: 1 }, "decide"],
      ["post", `${base}/post`, { expected_version: 1 }, "post"],
      ["post", `${base}/reverse`, { expected_version: 1, reason: "Bank withdrew the charge" }, "reverse"],
    ] as const;
    for (const [method, path, body, operation] of cases) {
      const response = await mutation(app, method, path).send(body);
      expect(response.status).toBe(200);
      expect(repository[operation]).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-a" }),
        "reconciliation-a",
        "adjustment-a",
        body,
        expect.any(String),
        expect.any(String),
      );
    }
  });

  it("maps permission denial without exposing internal details", async () => {
    const post = vi.fn(async () => {
      throw new BankingApiError(403, "PERMISSION_DENIED", "Permission denied.");
    });
    const app = appForAdjustment({ post }, []);
    const response = await mutation(
      app,
      "post",
      "/api/v1/banking/reconciliations/reconciliation-a/adjustments/adjustment-a/post",
    ).send({ expected_version: 1 });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "PERMISSION_DENIED", status: 403 });
    expect(JSON.stringify(response.body)).not.toContain("stack");
  });
});

describe("Bank Statement and Reconciliation API routes", () => {
  it("parses a bounded multipart CSV and delegates persistence through object storage", async () => {
    const csv = Buffer.from(
      "Date,Payment,Receipt,Transaction Type,Account,Payment Mode,Ref No.,Detail\n2026-10-23,25,,Bank charge,6100,Direct debit,CHG-1,Bank charge\n",
      "utf8",
    );
    const checksum = createHash("sha256").update(csv).digest("hex");
    const prepareUpload = vi.fn(async () => ({ currency: "USD", mappingProfile: null }));
    const createImport = vi.fn(async () => ({
      id: "import-a",
      state: "draft",
      version: 1,
      audit_event_id: "import-audit-a",
      replayed: false,
    }));
    const writeBounded = vi.fn(async (input: { objectKey: string; contentType: string; sizeBytes: number }) => ({
      objectKey: input.objectKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksumSha256: checksum,
    }));
    const readBounded = vi.fn(async (input: { objectKey: string }) => ({
      metadata: {
        objectKey: input.objectKey,
        contentType: "text/csv",
        sizeBytes: csv.length,
        checksumSha256: checksum,
      },
      body: Readable.from(csv),
    }));
    const app = appForAdjustment({}, ["banking.statement_import.create"], {
      statementRepository: { prepareUpload, createImport },
      statementStorage: { writeBounded, readBounded, remove: vi.fn(async () => undefined) },
    });
    const path = "/api/v1/banking/statement_imports";
    expect(
      (await request(app).post(path).field("company_id", "company-a").attach("file", csv, "statement.csv")).status,
    ).toBe(401);
    const wrongMedia = await request(app)
      .post(path)
      .set("cookie", "nexora_session=br06-token")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "upload-wrong-media")
      .send({ company_id: "company-a" });
    expect(wrongMedia.status).toBe(415);

    const response = await request(app)
      .post(path)
      .set("cookie", "nexora_session=br06-token")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "upload-a")
      .field("company_id", "company-a")
      .field("bank_account_id", "bank-a")
      .field("statement_reference", "OCT-2026")
      .field("date_format", "yyyy-MM-dd")
      .attach("file", csv, { filename: "statement.csv", contentType: "text/csv" });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.headers.etag).toBe('"1"');
    expect(prepareUpload).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a" }),
      expect.objectContaining({ company_id: "company-a", bank_account_id: "bank-a" }),
    );
    expect(createImport).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a" }),
      expect.objectContaining({
        originalFilename: "statement.csv",
        lines: [expect.objectContaining({ amount: "25.00000000" })],
      }),
      "upload-a",
      expect.any(String),
    );
  });

  it("dispatches reconciliation matching and approval routes with strict concurrency evidence", async () => {
    const mutation = {
      id: "reconciliation-a",
      state: "in_progress",
      version: 2,
      audit_event_id: "audit-a",
      replayed: false,
    };
    const matchMutation = {
      reconciliation_id: "reconciliation-a",
      reconciliation_version: 2,
      match: null,
      balances: mutationResult.balances,
      audit_event_id: "match-audit-a",
      replayed: false,
    };
    const repository = {
      createMatch: vi.fn(async () => matchMutation),
      decideMatch: vi.fn(async () => matchMutation),
      unmatch: vi.fn(async () => matchMutation),
      submit: vi.fn(async () => mutation),
      decide: vi.fn(async () => mutation),
    };
    const app = appForAdjustment({}, undefined, { reconciliationRepository: repository });
    const base = "/api/v1/banking/reconciliations/reconciliation-a";
    const cases = [
      ["post", `${base}/matches`, { action: "propose", expected_version: 1 }, "createMatch"],
      ["post", `${base}/matches/match-a/decision`, { action: "confirm", expected_version: 1 }, "decideMatch"],
      ["delete", `${base}/matches/match-a`, { expected_version: 1, reason: "Incorrect match evidence" }, "unmatch"],
      ["post", `${base}/submit`, { expected_version: 1 }, "submit"],
      ["post", `${base}/decision`, { action: "approve", expected_version: 1 }, "decide"],
    ] as const;
    for (const [method, path, body, operation] of cases) {
      const agent = request(app);
      const response = await agent[method](path)
        .set("cookie", "nexora_session=br06-token")
        .set("origin", "https://banking.example.test")
        .set("x-csrf-token", csrfToken)
        .set("idempotency-key", `reconciliation-${operation}`)
        .set("if-match", '"1"')
        .send(body);
      expect(response.status).toBe(200);
      expect(repository[operation]).toHaveBeenCalled();
    }
  });

  it("exposes authenticated setup and versioned manual-selection routes", async () => {
    const setup = vi.fn(async () => ({
      company_id: "company-a",
      bank_account_id: "bank-a",
      bank_account_name: "Operating account",
      currency: "USD",
      opening_statement_balance: "1000.00000000",
      opening_balance_source: "last_approved_reconciliation",
      last_approved_reconciliation_id: "reconciliation-prior",
      last_approved_statement_date: "2026-09-30",
      available_receipts: "200.00000000",
      available_payments: "50.00000000",
      available_transaction_count: 2,
    }));
    const setManualSelection = vi.fn(async () => ({
      reconciliation_id: "reconciliation-a",
      reconciliation_version: 2,
      journal_line_id: "journal-line-a",
      selected: true,
      balances: mutationResult.balances,
      audit_event_id: "selection-event-a",
      replayed: false,
    }));
    const app = appForAdjustment(
      {},
      ["banking.reconciliation.read", "banking.reconciliation.create", "banking.reconciliation.match"],
      { reconciliationRepository: { setup, setManualSelection } },
    );
    const setupPath =
      "/api/v1/banking/reconciliation_setup?company_id=company-a&bank_account_id=bank-a&period_start=2026-10-01&period_end=2026-10-31&statement_date=2026-10-31";
    expect((await request(app).get(setupPath)).status).toBe(401);
    const loaded = await request(app).get(setupPath).set("cookie", "nexora_session=br06-token");
    expect(loaded.status, JSON.stringify(loaded.body)).toBe(200);
    expect(setup).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a" }),
      expect.objectContaining({ company_id: "company-a", bank_account_id: "bank-a" }),
    );

    const selectionPath = "/api/v1/banking/reconciliations/reconciliation-a/manual_selections";
    const body = { expected_version: 1, journal_line_id: "journal-line-a", selected: true };
    expect((await request(app).post(selectionPath).send(body)).status).toBe(401);
    expect((await mutation(app, "post", selectionPath).set("if-match", '"2"').send(body)).status).toBe(412);
    expect((await mutation(app, "post", selectionPath).send({ ...body, company_id: "forged" })).status).toBe(400);
    const selected = await mutation(app, "post", selectionPath).send(body);
    expect(selected.status, JSON.stringify(selected.body)).toBe(200);
    expect(selected.headers.etag).toBe('"2"');
    expect(setManualSelection).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a" }),
      "reconciliation-a",
      body,
      expect.any(String),
      expect.any(String),
    );
  });
});

describe("Banking production composition", () => {
  it("rejects partial statement and reconciliation dependency wiring", () => {
    expect(() =>
      createApp({
        config: { allowedOrigins: new Set() },
        logger: createLogger(new PassThrough()),
        metrics: createMetrics(),
        readiness: {},
        bankingStatementRepository: {} as never,
      } as AppDependencies),
    ).toThrow("Statement import, storage, reconciliation, and adjustment repositories must be configured together.");
  });
});
