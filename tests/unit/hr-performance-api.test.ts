import { PassThrough } from "node:stream";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../server/api/src/app.js";
import type { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
const csrf = "p".repeat(43),
  cookie = "nexora_session=performance-test",
  origin = "https://performance.example.test";
function app() {
  const session = {
      sessionId: "performance-session",
      tenantId: "tenant-performance",
      userId: "performance-user",
      csrfToken: csrf,
      idleExpiresAt: new Date("2099-01-01"),
      absoluteExpiresAt: new Date("2099-01-01"),
    },
    repository = {
      getPerformanceWorkspace: vi.fn(async () => ({ items: [], total: 0 })),
      actOnPerformance: vi.fn(async () => ({
        id: "performance-1",
        company_id: "company-1",
        status: "draft",
        version: 1,
        audit_event_id: "audit-1",
        replayed: false,
      })),
    };
  return {
    repository,
    service: createApp({
      config: { allowedOrigins: new Set([origin]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      hrRepository: repository as unknown as SourceHrRepository,
      authService: {
        loadAuthenticatedAccount: vi.fn(async () => ({
          tenantId: session.tenantId,
          userId: session.userId,
          organizationName: "Performance test",
          email: "test@example.test",
          displayName: "Test reviewer",
          roles: ["hr_manager"],
          permissions: ["hr.performance.read", "hr.performance.manage"],
          sessionVersion: 1,
        })),
      } as unknown as TenantAuthApiService,
      sessionService: {
        get: vi.fn(async () => session),
        authorizeMutation: vi.fn(async (_token: string, value: string) =>
          value === csrf ? { status: "ok", session } : { status: "invalid_csrf" },
        ),
      } as unknown as TenantSessionApiService,
    }),
  };
}
const body = {
  action: "save",
  company_id: "company-1",
  record_id: null,
  expected_version: 0,
  reason: "Reviewed company Performance cycle",
  terms: {
    kind: "cycle",
    title: "Annual review",
    description: "Weighted five-point model",
    start_date: "2026-01-01",
    end_date: "2026-10-21",
    review_due_date: "2026-11-01",
  },
};
describe("Performance private API boundary", () => {
  it("requires authentication before reading employee assessments", async () => {
    const { service, repository } = app();
    expect(
      (await request(service).get("/api/v1/hr/performance").query({ company_id: "company-1", section: "reviews" }))
        .status,
    ).toBe(401);
    expect(repository.getPerformanceWorkspace).not.toHaveBeenCalled();
  });
  it("uses authenticated company scope, bounded queries and no-store", async () => {
    const { service, repository } = app();
    const r = await request(service)
      .get("/api/v1/hr/performance")
      .set("cookie", cookie)
      .query({ company_id: "company-1", section: "reviews", limit: "10" });
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(repository.getPerformanceWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-performance" }),
      expect.objectContaining({ company_id: "company-1", section: "reviews", limit: 10, offset: 0 }),
    );
  });
  it("rejects a foreign origin and CSRF failure before mutations", async () => {
    const { service, repository } = app();
    for (const foreign of [true, false]) {
      const r = await request(service)
        .post("/api/v1/hr/performance/actions")
        .set("cookie", cookie)
        .set("origin", foreign ? "https://foreign.invalid" : origin)
        .set("x-csrf-token", foreign ? csrf : "bad")
        .set("idempotency-key", "performance-test-key")
        .send(body);
      expect(r.status).toBe(403);
    }
    expect(repository.actOnPerformance).not.toHaveBeenCalled();
  });
  it("rejects client scores, money or approval overrides", async () => {
    const { service, repository } = app();
    for (const extra of [{ score: "5" }, { salary_increase: "100" }, { confirm_override: true }])
      expect(
        (
          await request(service)
            .post("/api/v1/hr/performance/actions")
            .set("cookie", cookie)
            .set("origin", origin)
            .set("x-csrf-token", csrf)
            .set("idempotency-key", "performance-test-key")
            .send({ ...body, ...extra })
        ).status,
      ).toBe(400);
    expect(repository.actOnPerformance).not.toHaveBeenCalled();
  });
  it("passes versioned, idempotent commands to the authenticated service boundary", async () => {
    const { service, repository } = app();
    const r = await request(service)
      .post("/api/v1/hr/performance/actions")
      .set("cookie", cookie)
      .set("origin", origin)
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "performance-test-key")
      .send(body);
    expect(r.status).toBe(200);
    expect(repository.actOnPerformance).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-performance" }),
      body,
      "performance-test-key",
      expect.any(String),
    );
  });
});
