import { PassThrough } from "node:stream";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../server/api/src/app.js";
import type { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
const cookie = "nexora_session=personal-test";
function app() {
  const session = {
    sessionId: "s",
    tenantId: "t",
    userId: "u",
    csrfToken: "c".repeat(43),
    idleExpiresAt: new Date("2099-01-01"),
    absoluteExpiresAt: new Date("2099-01-01"),
  };
  const repository = {
    getSelfService: vi.fn(async () => ({
      memberships: [],
      memberships_truncated: false,
      company_id: null,
      month: "2026-10-01",
      status: "link_required",
      payslips: [],
      payslip_total: 0,
      requests: [],
      request_total: 0,
      balances: [],
      balances_truncated: false,
      loans: [],
      loan_total: 0,
      limit: 25,
      offset: 0,
    })),
    getSelfServicePayslip: vi.fn(),
  };
  const service = createApp({
    config: { allowedOrigins: new Set(["https://erp.example.test"]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    hrRepository: repository as unknown as SourceHrRepository,
    authService: {
      loadAuthenticatedAccount: vi.fn(async () => ({
        tenantId: "t",
        userId: "u",
        organizationName: "Test",
        email: "self@example.test",
        displayName: "Employee",
        roles: ["employee"],
        permissions: [],
        sessionVersion: 1,
      })),
    } as unknown as TenantAuthApiService,
    sessionService: { get: vi.fn(async () => session) } as unknown as TenantSessionApiService,
  });
  return { repository, service };
}
describe("Personal HR API boundary", () => {
  it.each(["/api/v1/hr/self_service?month=2026-10-01", "/api/v1/hr/self_service/payslips/document?company_id=c"])(
    "requires an authenticated session for %s",
    async (path) => {
      expect((await request(app().service).get(path)).status).toBe(401);
    },
  );
  it("returns private employee data with no-store and the authenticated actor", async () => {
    const { repository, service } = app();
    const r = await request(service)
      .get("/api/v1/hr/self_service")
      .query({ month: "2026-10-01" })
      .set("cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(repository.getSelfService).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t", actor: expect.objectContaining({ userId: "u" }) }),
      expect.objectContaining({ month: "2026-10-01", limit: 25, offset: 0 }),
    );
  });
  it.each([
    { month: "2026-10-01", employee_id: "victim" },
    { month: "2026-10-02" },
    { month: "2026-10-01", limit: 51 },
    { month: "2026-10-01", offset: -1 },
  ])("rejects unsafe query %j before the repository", async (query) => {
    const { repository, service } = app();
    expect((await request(service).get("/api/v1/hr/self_service").query(query).set("cookie", cookie)).status).toBe(400);
    expect(repository.getSelfService).not.toHaveBeenCalled();
  });
  it("rejects employee selectors on personal payslip reads", async () => {
    const { repository, service } = app();
    expect(
      (
        await request(service)
          .get("/api/v1/hr/self_service/payslips/document")
          .query({ company_id: "c", employee_id: "victim" })
          .set("cookie", cookie)
      ).status,
    ).toBe(400);
    expect(repository.getSelfServicePayslip).not.toHaveBeenCalled();
  });
});
