import { PassThrough } from "node:stream";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import type { FinanceNominalRepository } from "../../server/api/src/modules/finance/router.js";

const session = {
  sessionId: "nominal-session",
  tenantId: "nominal-tenant",
  userId: "nominal-maker",
  csrfToken: "n".repeat(43),
  idleExpiresAt: new Date("2099-01-01"),
  absoluteExpiresAt: new Date("2099-01-01"),
};
const payload = {
  company_id: "company",
  category_id: "current-assets",
  section_id: "cash-bank",
  name: "Operating USD",
  currency: "USD",
};
const result = {
  id: "nominal-one",
  bank_account_id: "bank-one",
  code: "100001",
  state: "draft" as const,
  version: 1,
  audit_event_id: "audit-one",
  replayed: false,
};
function setup() {
  const repository: FinanceNominalRepository = {
    options: vi.fn(async () => ({
      companies: [],
      selected_company_id: null,
      categories: [],
      sections: [],
      currencies: [],
      setup: { cash_and_bank_configured: false, code_policy_configured: false },
    })),
    list: vi.fn(async () => ({ items: [], next_cursor: null })),
    get: vi.fn(),
    create: vi.fn(async () => result),
    update: vi.fn(async () => result),
    submit: vi.fn(async () => result),
    decide: vi.fn(async () => result),
    changeStatus: vi.fn(async () => result),
  };
  // Only the session-loading boundary is exercised; unrelated authentication methods are deliberately absent.
  const authentication = {
    loadAuthenticatedAccount: vi.fn(async () => ({
      tenantId: session.tenantId,
      userId: session.userId,
      organizationName: "Synthetic Bank",
      email: "maker@example.test",
      displayName: "Maker",
      roles: [],
      permissions: ["finance.nominal.read"],
      sessionVersion: 1,
    })),
  } as unknown as TenantAuthApiService;
  const sessions = {
    get: vi.fn(async () => session),
    authorizeMutation: vi.fn(async (_token: string, csrf: string) =>
      csrf === session.csrfToken ? { status: "ok" as const, session } : { status: "invalid_csrf" as const },
    ),
  } as unknown as TenantSessionApiService;
  const app = createApp({
    config: { allowedOrigins: new Set(["https://nominal.example.test"]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    authService: authentication,
    sessionService: sessions,
    financeNominalRepository: repository,
  });
  return { app, repository };
}
describe("Bank nominal HTTP boundary", () => {
  it("requires a session and prevents tenant-header spoofing", async () => {
    const { app, repository } = setup();
    expect((await request(app).get("/api/v1/finance/nominals/options")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/v1/finance/nominals/options")
          .set("cookie", "nexora_session=token")
          .set("x-tenant-id", "other")
      ).status,
    ).toBe(403);
    expect(repository.options).not.toHaveBeenCalled();
  });
  it("requires CSRF, an allowed origin and an idempotency key for creation", async () => {
    const { app, repository } = setup();
    const send = (origin: string, csrf: string, key?: string) => {
      const req = request(app)
        .post("/api/v1/finance/nominals")
        .set("cookie", "nexora_session=token")
        .set("origin", origin)
        .set("x-csrf-token", csrf);
      if (key) req.set("idempotency-key", key);
      return req.send(payload);
    };
    expect((await send("https://nominal.example.test", "wrong", "create-one")).status).toBe(403);
    expect((await send("https://hostile.example.test", session.csrfToken, "create-one")).status).toBe(403);
    expect((await send("https://nominal.example.test", session.csrfToken)).status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
    const accepted = await send("https://nominal.example.test", session.csrfToken, "create-one");
    expect(accepted.status).toBe(201);
    expect(accepted.body).toEqual(result);
    expect(accepted.headers["cache-control"]).toBe("no-store");
  });
  it("rejects stale or missing If-Match before calling a lifecycle mutation", async () => {
    const { app, repository } = setup();
    const send = (etag?: string) => {
      const req = request(app)
        .post("/api/v1/finance/nominals/nominal-one/submit")
        .set("cookie", "nexora_session=token")
        .set("x-csrf-token", session.csrfToken)
        .set("idempotency-key", "submit-one");
      if (etag) req.set("if-match", etag);
      return req.send({ expected_version: 1, reason: "Synthetic approval request" });
    };
    expect((await send()).status).toBe(412);
    expect((await send('"2"')).status).toBe(412);
    expect(repository.submit).not.toHaveBeenCalled();
    expect((await send('"1"')).status).toBe(200);
  });
  it("validates bounded directory inputs and rejects legacy identity fields", async () => {
    const { app, repository } = setup();
    expect(
      (
        await request(app)
          .get("/api/v1/finance/nominals?company_id=company&limit=100000")
          .set("cookie", "nexora_session=token")
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/v1/finance/nominals")
          .set("cookie", "nexora_session=token")
          .set("x-csrf-token", session.csrfToken)
          .set("idempotency-key", "bad-fields")
          .send({ ...payload, account_number: "123" })
      ).status,
    ).toBe(400);
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });
});
