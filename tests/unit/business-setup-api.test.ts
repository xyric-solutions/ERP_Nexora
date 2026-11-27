import { PassThrough } from "node:stream";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/api/src/app.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import type { BusinessSetupRepository } from "../../server/api/src/modules/finance/templates/business-setup-router.js";
import { ChartTemplateError } from "../../server/api/src/modules/finance/templates/template-shared.js";

const session = {
  sessionId: "setup-session",
  tenantId: "synthetic-tenant",
  userId: "synthetic-admin",
  csrfToken: "s".repeat(43),
  idleExpiresAt: new Date("2099-01-01"),
  absoluteExpiresAt: new Date("2099-01-01"),
};
const input = {
  company_name: "Synthetic business",
  business_nature_key: "it_software",
  organisation_type: "private_limited" as const,
  country_code: "PK",
  base_currency: "PKR",
  financial_year_start_month: 7,
  accounting_method: "accrual" as const,
};
const result = {
  setup: {
    ...input,
    company_id: "synthetic-company",
    template_id: "synthetic-template",
    initialized_at: "2026-11-27T00:00:00.000Z",
  },
  audit_event_id: "synthetic-audit",
  replayed: false,
};
function fixture() {
  const repository: BusinessSetupRepository = {
    businessNatures: vi.fn(async () => ({ items: [{ key: "it_software", name: "IT & Software" }] })),
    businessSetup: vi.fn(async () => ({ setup: null })),
    initializeBusiness: vi.fn(async () => result),
  };
  // Mock only the authenticated-session boundary. Real role/company authority
  // and database effects are covered by PostgreSQL integration tests.
  const authentication = {
    loadAuthenticatedAccount: vi.fn(async () => ({
      tenantId: session.tenantId,
      userId: session.userId,
      organizationName: "Synthetic",
      displayName: "Synthetic",
      email: "setup@example.invalid",
      roles: ["super_administrator"],
      permissions: ["finance.chart_template.admin", "platform.approval.override"],
      sessionVersion: 1,
    })),
  } as unknown as TenantAuthApiService;
  const sessions = {
    get: vi.fn(async () => session),
    authorizeMutation: vi.fn(async (_token: string, csrf: string) =>
      csrf === session.csrfToken ? { status: "ok" as const, session } : { status: "invalid_csrf" as const },
    ),
  } as unknown as TenantSessionApiService;
  return {
    repository,
    app: createApp({
      config: { allowedOrigins: new Set(["https://setup.example.invalid"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      authService: authentication,
      sessionService: sessions,
      businessSetupRepository: repository,
    }),
  };
}
describe("Business setup API boundary", () => {
  it("requires a session and rejects forged tenant scope", async () => {
    const { app, repository } = fixture();
    expect((await request(app).get("/api/v1/finance/business_setup/natures")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/v1/finance/business_setup/natures")
          .set("cookie", "nexora_session=token")
          .set("x-tenant-id", "foreign")
      ).status,
    ).toBe(403);
    expect(repository.businessNatures).not.toHaveBeenCalled();
  });
  it("validates company scope and returns uncached database-driven natures", async () => {
    const { app, repository } = fixture();
    const response = await request(app)
      .get("/api/v1/finance/business_setup/natures")
      .set("cookie", "nexora_session=token");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(
      (await request(app).get("/api/v1/finance/business_setup").set("cookie", "nexora_session=token")).status,
    ).toBe(400);
    expect(repository.businessSetup).not.toHaveBeenCalled();
  });
  it("requires CSRF, permitted origin and request key before mutation", async () => {
    const { app, repository } = fixture();
    const send = (origin: string, csrf: string, key?: string) => {
      const req = request(app)
        .post("/api/v1/finance/business_setup")
        .set("cookie", "nexora_session=token")
        .set("origin", origin)
        .set("x-csrf-token", csrf);
      if (key) req.set("idempotency-key", key);
      return req.send(input);
    };
    expect((await send("https://setup.example.invalid", "wrong", "setup-1")).status).toBe(403);
    expect((await send("https://hostile.example.invalid", session.csrfToken, "setup-1")).status).toBe(403);
    expect((await send("https://setup.example.invalid", session.csrfToken)).status).toBe(400);
    expect(repository.initializeBusiness).not.toHaveBeenCalled();
    const accepted = await send("https://setup.example.invalid", session.csrfToken, "setup-1");
    expect(accepted.status).toBe(201);
    expect(accepted.body).toEqual(result);
    expect(repository.initializeBusiness).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      input,
      "setup-1",
      expect.any(String),
    );
  });
  it("rejects extra fields and exposes safe setup conflicts", async () => {
    const { app, repository } = fixture();
    const send = (body: unknown) =>
      request(app)
        .post("/api/v1/finance/business_setup")
        .set("cookie", "nexora_session=token")
        .set("x-csrf-token", session.csrfToken)
        .set("idempotency-key", "setup-2")
        .send(body);
    expect((await send({ ...input, tenant_id: "forged" })).status).toBe(400);
    vi.mocked(repository.initializeBusiness).mockRejectedValue(
      new ChartTemplateError(409, "BUSINESS_SETUP_CONFLICT", "Existing chart needs preservation review."),
    );
    const failed = await send(input);
    expect(failed.status).toBe(409);
    expect(failed.body.code).toBe("BUSINESS_SETUP_CONFLICT");
  });
});
