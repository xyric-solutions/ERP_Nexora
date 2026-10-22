import { PassThrough } from "node:stream";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../server/api/src/app.js";
import type { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
const cookie = "nexora_session=personal-leave-test",
  csrf = "c".repeat(43),
  origin = "https://erp.example.test";
function app() {
  const session = {
      sessionId: "s",
      tenantId: "t",
      userId: "u",
      csrfToken: csrf,
      idleExpiresAt: new Date("2099-01-01"),
      absoluteExpiresAt: new Date("2099-01-01"),
    },
    result = {
      id: "request-1",
      company_id: "c",
      version: 1,
      status: "draft",
      audit_event_id: "audit-1",
      replayed: false,
    };
  const repository = {
    getSelfLeaveContext: vi.fn(async () => ({
      employees: [{ id: "own-employee", code: "E1", name: "Employee" }],
      employees_capped: false,
      types: [],
      documents: [],
      manager_user_id: null,
      manager_name: null,
      subject_user_ids: [],
      days: [],
      balance: null,
      blockers: [],
      today: "2026-10-21",
      hash: "a".repeat(64),
    })),
    getPersonalCorrections: vi.fn(async () => ({
      company_id: "c",
      mode: "mine",
      current: null,
      source_hash: null,
      can_request: false,
      items: [],
      total: 0,
      limit: 25,
      offset: 0,
    })),
    getReportGovernance: vi.fn(async () => ({
      company_id: "c",
      section: "exports",
      catalogue: [],
      active_policy: null,
      policies: [],
      exports: [],
      events: [],
      total: 0,
      limit: 25,
      offset: 0,
      can_manage_policy: false,
    })),
    createPersonalCorrection: vi.fn(async () => ({ ...result, status: "submitted" })),
    actOnPersonalCorrection: vi.fn(async () => ({ ...result, status: "approved" })),
    actOnReportGovernance: vi.fn(async () => ({ ...result, status: "ready" })),
    getSelfLeaveRequest: vi.fn(),
    createSelfLeaveRequest: vi.fn(async () => result),
    actOnSelfLeaveRequest: vi.fn(async () => ({ ...result, status: "pending_manager", version: 2 })),
  };
  const service = createApp({
    config: { allowedOrigins: new Set([origin]) },
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
    sessionService: {
      get: vi.fn(async () => session),
      authorizeMutation: vi.fn(async (_token: string, value: string) =>
        value === csrf ? { status: "ok", session } : { status: "invalid_csrf" },
      ),
    } as unknown as TenantSessionApiService,
  });
  return { repository, service };
}

const personal = {
  company_id: "c",
  profile: {
    first_name: "Test",
    middle_name: "",
    last_name: "Employee",
    preferred_name: "Preferred",
    date_of_birth: null,
    personal_email: "",
    phone: "",
  },
  expected_source_hash: "a".repeat(64),
  reason: "Correct my recorded personal details",
};
const endpoints = [
  ["/api/v1/hr/personal_corrections", personal, "createPersonalCorrection"],
  [
    "/api/v1/hr/personal_corrections/request/actions",
    {
      company_id: "c",
      action: "approve",
      expected_version: 1,
      reason: "Independently reviewed personal details",
      review_reference: "Verified HR evidence reference",
    },
    "actOnPersonalCorrection",
  ],
  [
    "/api/v1/hr/report_governance/actions",
    {
      company_id: "c",
      action: "create_export",
      report: "employee_directory",
      from_date: "2026-10-01",
      to_date: "2026-10-21",
      reason: "Authorized workforce planning export",
    },
    "actOnReportGovernance",
  ],
] as const;
describe("Governed corrections and reporting HTTP boundaries", () => {
  it.each([
    "/api/v1/hr/personal_corrections?company_id=c",
    "/api/v1/hr/report_governance?company_id=c&section=exports",
  ])("requires authentication and no-store for %s", async (url) => {
    const { service } = app();
    expect((await request(service).get(url)).status).toBe(401);
    const r = await request(service).get(url).set("cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  for (const [url, input, method] of endpoints) {
    it("accepts a valid authenticated mutation " + url, async () => {
      const { service, repository } = app();
      const r = await request(service)
        .post(url)
        .set("cookie", cookie)
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", "governed-http-success")
        .send(input);
      expect(r.status).toBe(200);
      expect(r.headers["cache-control"]).toBe("no-store");
      expect(repository[method]).toHaveBeenCalledOnce();
    });
    it.each(["session", "origin", "csrf", "idempotency"])("rejects invalid %s on " + url, async (failure) => {
      const { service, repository } = app();
      let r = request(service)
        .post(url)
        .set("origin", failure === "origin" ? "https://untrusted.test" : origin)
        .set("x-csrf-token", failure === "csrf" ? "invalid" : csrf);
      if (failure !== "session") r = r.set("cookie", cookie);
      if (failure !== "idempotency") r = r.set("idempotency-key", "governed-http-guard");
      expect((await r.send(input)).status).toBe(failure === "session" ? 401 : failure === "idempotency" ? 400 : 403);
      expect(repository[method]).not.toHaveBeenCalled();
    });
  }
  it("rejects caller employee identity and bank-profile fields", async () => {
    const { service, repository } = app();
    for (const body of [
      { ...personal, employee_id: "victim" },
      { ...personal, profile: { ...personal.profile, bank_account: "private" } },
    ]) {
      const r = await request(service)
        .post("/api/v1/hr/personal_corrections")
        .set("cookie", cookie)
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", "governed-http-invalid")
        .send(body);
      expect(r.status).toBe(400);
    }
    expect(repository.createPersonalCorrection).not.toHaveBeenCalled();
  });
  it("rejects unsafe export ranges and unsupported reports", async () => {
    const { service, repository } = app();
    for (const extra of [{ report: "bank_accounts" }, { to_date: "2029-01-01" }]) {
      const r = await request(service)
        .post("/api/v1/hr/report_governance/actions")
        .set("cookie", cookie)
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", "governed-http-invalid")
        .send({ ...endpoints[2][1], ...extra });
      expect(r.status).toBe(400);
    }
    expect(repository.actOnReportGovernance).not.toHaveBeenCalled();
  });
});
