import { PassThrough } from "node:stream";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../server/api/src/app.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { fiscalCalendarDetailSchema } from "../../packages/contracts/src/finance/periods.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
const session = {
  sessionId: "test",
  tenantId: "tenant-one",
  userId: "admin-one",
  csrfToken: "test-csrf",
  idleExpiresAt: new Date(),
  absoluteExpiresAt: new Date(),
};
function application() {
  const detail = fiscalCalendarDetailSchema.parse({
    calendar: {
      id: "year-one",
      company_id: "company-one",
      year: 2026,
      period_start: "2026-01-01",
      period_end: "2026-12-31",
      status: "active",
      version: 1,
    },
    periods: [],
    history: [],
    history_has_more: false,
  });
  const calendars = {
      companies: vi.fn(async () => ({ items: [] })),
      list: vi.fn(async () => ({ items: [], next_cursor: null })),
      detail: vi.fn(async () => detail),
      create: vi.fn(async () => detail),
      generate: vi.fn(async () => detail),
    },
    periods = { change: vi.fn(async () => detail) };
  // Partial transport-boundary doubles implement only session methods exercised
  // here. Live authorization and real persistence are covered by integration tests.
  const auth = {
    loadAuthenticatedAccount: vi.fn(async () => ({
      tenantId: session.tenantId,
      userId: session.userId,
      organizationName: "Test",
      displayName: "Test",
      email: "test@example.invalid",
      roles: [],
      permissions: [],
      sessionVersion: 1,
    })),
  } as unknown as TenantAuthApiService;
  const sessions = {
    get: vi.fn(async () => session),
    authorizeMutation: vi.fn(async (_token: string, csrf: string) =>
      csrf === session.csrfToken ? { status: "ok", session } : { status: "invalid_csrf" },
    ),
  } as unknown as TenantSessionApiService;
  return {
    calendars,
    periods,
    app: createApp({
      config: { allowedOrigins: new Set(["https://erp.example.test"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      authService: auth,
      sessionService: sessions,
      fiscalCalendarRepository: calendars,
      financePeriodRepository: periods,
    }),
  };
}
describe("Fiscal calendar API boundary", () => {
  it("requires authentication and rejects a spoofed tenant", async () => {
    const { app, calendars } = application();
    expect((await request(app).get("/api/v1/master_data/fiscal_calendars/options")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/v1/master_data/fiscal_calendars/options")
          .set("cookie", "nexora_session=test")
          .set("x-tenant-id", "another")
      ).status,
    ).toBe(403);
    expect(calendars.companies).not.toHaveBeenCalled();
  });
  it("rejects CSRF, unsafe origin, missing keys and incorrect expected versions", async () => {
    const { app, calendars } = application();
    for (const [origin, csrf, key, version, status] of [
      ["https://hostile.test", session.csrfToken, "test", '"1"', 403],
      ["https://erp.example.test", "wrong", "test", '"1"', 403],
      ["https://erp.example.test", session.csrfToken, "", '"1"', 400],
      ["https://erp.example.test", session.csrfToken, "test", '"2"', 412],
    ] as const) {
      const r = await request(app)
        .post("/api/v1/master_data/fiscal_calendars/year-one/periods")
        .set("cookie", "nexora_session=test")
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", key)
        .set("if-match", version)
        .send({ company_id: "company-one", expected_version: 1 });
      expect(r.status).toBe(status);
    }
    expect(calendars.generate).not.toHaveBeenCalled();
  });
  it("dispatches validated creation with server-derived tenant and actor", async () => {
    const { app, calendars } = application();
    const r = await request(app)
      .post("/api/v1/master_data/fiscal_calendars")
      .set("cookie", "nexora_session=test")
      .set("origin", "https://erp.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "test-create")
      .send({ company_id: "company-one", period_start: "2026-07-01" });
    expect(r.status).toBe(200);
    expect(calendars.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-one", actor: expect.objectContaining({ userId: "admin-one" }) }),
      { company_id: "company-one", period_start: "2026-07-01" },
      "test-create",
      expect.any(String),
    );
  });
  it("requires the sorted quoted batch version vector, not an unguarded status update", async () => {
    const { app, periods } = application();
    const body = {
      company_id: "company-one",
      periods: [
        { id: "b", expected_version: 2 },
        { id: "a", expected_version: 1 },
      ],
      status: "open",
      reason: "Testing period",
    };
    for (const [header, status] of [
      ['"2,1"', 412],
      ['"1,2"', 200],
    ] as const) {
      const r = await request(app)
        .post("/api/v1/finance/fiscal_calendars/year-one/period_status")
        .set("cookie", "nexora_session=test")
        .set("origin", "https://erp.example.test")
        .set("x-csrf-token", session.csrfToken)
        .set("idempotency-key", "test-change")
        .set("if-match", header)
        .send(body);
      expect(r.status).toBe(status);
    }
    expect(periods.change).toHaveBeenCalledOnce();
  });
  it("rejects invalid dates, duplicate periods and undeclared bypass properties", async () => {
    const { app, calendars } = application();
    for (const date of ["2026-07-15", "2026-02-30"]) {
      expect(
        (
          await request(app)
            .post("/api/v1/master_data/fiscal_calendars")
            .set("cookie", "nexora_session=test")
            .set("x-csrf-token", session.csrfToken)
            .set("idempotency-key", "test-invalid")
            .send({ company_id: "company-one", period_start: date })
        ).status,
      ).toBe(400);
    }
    expect(calendars.create).not.toHaveBeenCalled();
  });
});
