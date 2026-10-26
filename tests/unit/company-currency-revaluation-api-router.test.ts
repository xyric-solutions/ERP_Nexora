import { PassThrough } from "node:stream";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { BankingApiError } from "../../server/api/src/modules/banking/source-repository.js";

const csrfToken = "r".repeat(43);
const origin = "https://fxr.example.test";
const session = {
  sessionId: "fxr-route-session",
  tenantId: "tenant-a",
  userId: "maker-a",
  csrfToken,
  idleExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
  absoluteExpiresAt: new Date("2099-01-02T00:00:00.000Z"),
};

const mutationResult = {
  id: "revaluation-a",
  voucher_number: "BRV-2026-000001",
  state: "draft" as const,
  version: 1,
  audit_event_id: "event-a",
  journal_entry_id: null,
  reversal_scheduled_date: null,
  replayed: false,
};

function setup() {
  const authentication = {
    loadAuthenticatedAccount: vi.fn(async () => ({
      tenantId: session.tenantId,
      organizationName: "Tenant A",
      userId: session.userId,
      email: "maker@example.invalid",
      displayName: "Maker",
      roles: [],
      permissions: [
        "finance.company_currency.read",
        "finance.company_currency.manage",
        "finance.company_currency_rate.read",
        "finance.company_currency_rate.manage",
        "banking.revaluation_policy.read",
        "banking.revaluation_policy.manage",
        "banking.revaluation.read",
        "banking.revaluation.create",
        "banking.revaluation.update",
        "banking.revaluation.submit",
        "banking.revaluation.approve",
        "banking.revaluation.post",
        "banking.revaluation.reverse",
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
  const revaluations = {
    approverOptions: vi.fn(async () => ({
      items: [{ id: "checker-a", code: "", name: "Checker A", eligible: true, self_approval: false }],
      selected: null,
      next_cursor: null,
    })),
    getPolicy: vi.fn(async () => ({ id: "policy-a", version: 1 })),
    upsertPolicy: vi.fn(async () => ({ id: "policy-a", version: 1, audit_event_id: "policy-event", replayed: false })),
    preview: vi.fn(async () => ({ company_id: "company-a" })),
    list: vi.fn(async () => ({ items: [], next_cursor: null })),
    get: vi.fn(async () => ({ ...mutationResult, lines: [] })),
    listEvents: vi.fn(async () => ({ items: [], next_cursor: null })),
    create: vi.fn(async () => mutationResult),
    update: vi.fn(async () => ({ ...mutationResult, version: 2 })),
    submit: vi.fn(async () => ({ ...mutationResult, state: "submitted" as const, version: 2 })),
    decide: vi.fn(async (_context, _id, input: { action: "approve" | "reject" }) => ({
      ...mutationResult,
      state: input.action === "approve" ? ("approved" as const) : ("rejected" as const),
      version: 3,
    })),
    post: vi.fn(async () => ({ ...mutationResult, state: "posted" as const, version: 4 })),
    reverse: vi.fn(async () => ({ ...mutationResult, state: "reversed" as const, version: 5 })),
  };
  const currencies = {
    listCountryCurrencies: vi.fn(async () => ({ items: [], next_cursor: null })),
    getCompanyCurrencyProfile: vi.fn(async () => ({ id: "profile-a", company_id: "company-a" })),
    configureCompanyCurrencyProfile: vi.fn(async () => ({
      id: "profile-a",
      version: 1,
      audit_event_id: "profile-event",
      replayed: false,
    })),
    listCompanyCurrencies: vi.fn(async () => ({ items: [], next_cursor: null })),
    activateCompanyCurrency: vi.fn(async () => ({
      id: "currency-a",
      version: 1,
      audit_event_id: "currency-event",
      replayed: false,
    })),
    changeCompanyCurrencyStatus: vi.fn(async () => ({
      id: "currency-a",
      version: 2,
      audit_event_id: "currency-event-2",
      replayed: false,
    })),
    listCompanyCurrencyRates: vi.fn(async () => ({ items: [], next_cursor: null })),
    createCompanyCurrencyRate: vi.fn(async () => ({ id: "rate-a" })),
    correctCompanyCurrencyRate: vi.fn(async () => ({ id: "rate-b" })),
    changeCompanyCurrencyRateStatus: vi.fn(async () => ({ id: "rate-a" })),
  };
  const app = createApp({
    config: { allowedOrigins: new Set([origin]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    authService: authentication,
    sessionService: sessions,
    bankingRepository: {} as never,
    bankingPaymentRepository: {} as never,
    bankingReceiptRepository: {} as never,
    bankingRevaluationRepository: revaluations as never,
    financeCurrencyRepository: currencies as never,
  });
  return { app, revaluations, currencies };
}

function authenticated(app: ReturnType<typeof setup>["app"], method: "get" | "post" | "patch", path: string) {
  return request(app)[method](path).set("cookie", "nexora_session=fxr-token");
}

function mutation(app: ReturnType<typeof setup>["app"], method: "post" | "patch", path: string) {
  return authenticated(app, method, path)
    .set("origin", origin)
    .set("x-csrf-token", csrfToken)
    .set("idempotency-key", `key-${method}-${path.replaceAll("/", "-")}`);
}

describe("Company Currency and Bank Revaluation API routes", () => {
  it("exposes a bounded authenticated company-scoped Revaluation approver directory", async () => {
    const { app, revaluations } = setup();
    expect((await request(app).get("/api/v1/banking/revaluations/approvers?company_id=company-a")).status).toBe(401);
    expect(
      (await authenticated(app, "get", "/api/v1/banking/revaluations/approvers?company_id=company-a&limit=101")).status,
    ).toBe(400);
    const response = await authenticated(
      app,
      "get",
      "/api/v1/banking/revaluations/approvers?company_id=company-a&limit=25",
    );
    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({ id: "checker-a", eligible: true });
    expect(revaluations.approverOptions).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a" }),
      expect.objectContaining({ company_id: "company-a", kind: "approver", limit: 25 }),
    );
  });

  it("requires authentication and validates bounded company-currency queries", async () => {
    const { app, currencies } = setup();
    expect((await request(app).get("/api/v1/master-data/countries")).status).toBe(401);
    expect(
      (await authenticated(app, "get", "/api/v1/finance/company-currencies?company_id=company-a&limit=101")).status,
    ).toBe(400);
    expect(currencies.listCompanyCurrencies).not.toHaveBeenCalled();
    expect(
      (await authenticated(app, "get", "/api/v1/finance/company-currencies?company_id=company-a&limit=25")).status,
    ).toBe(200);
    expect(currencies.listCompanyCurrencies).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a" }),
      expect.objectContaining({ company_id: "company-a", limit: 25 }),
    );
  });

  it("enforces origin, CSRF, idempotency, path integrity and version guards for currency mutations", async () => {
    const { app, currencies } = setup();
    const profile = { company_id: "company-a", base_country_code: "PK", base_currency: "PKR" };
    expect(
      (
        await authenticated(app, "post", "/api/v1/finance/companies/company-a/currency-profile")
          .set("origin", origin)
          .set("x-csrf-token", "wrong")
          .set("idempotency-key", "profile")
          .send(profile)
      ).status,
    ).toBe(403);
    expect(
      (
        await authenticated(app, "post", "/api/v1/finance/companies/company-a/currency-profile")
          .set("origin", "https://hostile.invalid")
          .set("x-csrf-token", csrfToken)
          .set("idempotency-key", "profile")
          .send(profile)
      ).status,
    ).toBe(403);
    expect(
      (await mutation(app, "post", "/api/v1/finance/companies/company-b/currency-profile").send(profile)).status,
    ).toBe(400);
    const accepted = await mutation(app, "post", "/api/v1/finance/companies/company-a/currency-profile").send(profile);
    expect(accepted.status).toBe(201);
    expect(currencies.configureCompanyCurrencyProfile).toHaveBeenCalledTimes(1);

    const statusPath = "/api/v1/finance/company-currencies/USD/status?company_id=company-a";
    const statusBody = { expected_version: 1, status: "inactive", reason: "No longer used" };
    expect((await mutation(app, "patch", statusPath).send(statusBody)).status).toBe(412);
    expect((await mutation(app, "patch", statusPath).set("if-match", '"2"').send(statusBody)).status).toBe(412);
    expect((await mutation(app, "patch", statusPath).set("if-match", '"1"').send(statusBody)).status).toBe(200);
  });

  it("exposes the complete guarded revaluation lifecycle and maps approve/reject decisions", async () => {
    const { app, revaluations } = setup();
    const createBody = {
      company_id: "company-a",
      currency: "USD",
      revaluation_date: "2026-10-26",
      approver_user_id: "checker-a",
    };
    expect((await request(app).post("/api/v1/banking/revaluations").send(createBody)).status).toBe(401);
    expect(
      (
        await authenticated(app, "post", "/api/v1/banking/revaluations")
          .set("origin", origin)
          .set("x-csrf-token", csrfToken)
          .send(createBody)
      ).status,
    ).toBe(400);
    expect(
      (
        await mutation(app, "post", "/api/v1/banking/revaluations").send({
          ...createBody,
          carrying_base_balance: "999999",
        })
      ).status,
    ).toBe(400);
    expect((await mutation(app, "post", "/api/v1/banking/revaluations").send(createBody)).status).toBe(201);

    const versioned = (path: string, body: object) =>
      mutation(
        app,
        path.includes("/revaluations/revaluation-a") && !path.match(/\/(submit|approve|reject|post|reverse)$/u)
          ? "patch"
          : "post",
        path,
      )
        .set("if-match", '"1"')
        .send(body);
    expect(
      (await versioned("/api/v1/banking/revaluations/revaluation-a", { expected_version: 1, narration: "Updated" }))
        .status,
    ).toBe(200);
    expect((await versioned("/api/v1/banking/revaluations/revaluation-a/submit", { expected_version: 1 })).status).toBe(
      200,
    );
    expect(
      (await versioned("/api/v1/banking/revaluations/revaluation-a/approve", { expected_version: 1 })).status,
    ).toBe(200);
    expect(
      (
        await versioned("/api/v1/banking/revaluations/revaluation-a/reject", {
          expected_version: 1,
          reason: "Evidence requires correction",
        })
      ).status,
    ).toBe(200);
    expect((await versioned("/api/v1/banking/revaluations/revaluation-a/post", { expected_version: 1 })).status).toBe(
      200,
    );
    expect(
      (
        await versioned("/api/v1/banking/revaluations/revaluation-a/reverse", {
          expected_version: 1,
          reason: "Scheduled reversal is due",
        })
      ).status,
    ).toBe(200);
    expect(revaluations.decide).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "revaluation-a",
      expect.objectContaining({ action: "approve" }),
      expect.any(String),
      expect.any(String),
    );
    expect(revaluations.decide).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "revaluation-a",
      expect.objectContaining({ action: "reject" }),
      expect.any(String),
      expect.any(String),
    );
  });

  it("exposes policy and immutable event endpoints and returns standard scoped errors", async () => {
    const { app, revaluations } = setup();
    expect((await authenticated(app, "get", "/api/v1/banking/revaluation-policy?company_id=company-a")).status).toBe(
      200,
    );
    const policy = {
      company_id: "company-a",
      unrealized_gain_nominal_id: "gain-a",
      unrealized_loss_nominal_id: "loss-a",
      status: "active",
      reason: "Configure unrealized FX policy",
    };
    expect((await mutation(app, "post", "/api/v1/banking/revaluation-policy").send(policy)).status).toBe(200);
    expect((await authenticated(app, "get", "/api/v1/banking/revaluations/revaluation-a/events?limit=25")).status).toBe(
      200,
    );
    revaluations.get = vi.fn(async () => {
      throw new BankingApiError(403, "COMPANY_ACCESS_DENIED", "The company is outside your live permission scope.");
    });
    const denied = await authenticated(app, "get", "/api/v1/banking/revaluations/revaluation-a");
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: "COMPANY_ACCESS_DENIED" });
  });
});
