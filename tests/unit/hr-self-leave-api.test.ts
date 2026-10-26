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
const body = {
  company_id: "c",
  leave_type_id: "annual",
  from_date: "2026-10-21",
  to_date: "2026-10-21",
  days: [{ on_date: "2026-10-21", portion: "full" }],
  reason: "Reviewed personal leave application",
  expected_evidence_hash: "a".repeat(64),
};
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
describe("Personal leave HTTP mutation boundary", () => {
  it("requires authentication and uses no-store for personal calendar reads", async () => {
    const { service } = app(),
      url = "/api/v1/hr/self_service/leave_context?company_id=c&from_date=2026-10-21&to_date=2026-10-21";
    expect((await request(service).get(url)).status).toBe(401);
    const r = await request(service).get(url).set("cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  it("accepts a valid employee request without employer-wide role permissions", async () => {
    const { service, repository } = app(),
      r = await request(service)
        .post("/api/v1/hr/self_service/leave_requests")
        .set("cookie", cookie)
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", "personal-leave-create-1")
        .send(body);
    expect(r.status).toBe(200);
    expect(repository.createSelfLeaveRequest).toHaveBeenCalledWith(
      expect.objectContaining({ actor: expect.objectContaining({ userId: "u", permissions: [] }) }),
      body,
      "personal-leave-create-1",
      expect.any(String),
    );
  });
  it.each(["origin", "csrf", "idempotency"])(
    "rejects missing or invalid %s before creating a record",
    async (failure) => {
      const { service, repository } = app();
      let r = request(service)
        .post("/api/v1/hr/self_service/leave_requests")
        .set("cookie", cookie)
        .set("origin", failure === "origin" ? "https://untrusted.example" : origin)
        .set("x-csrf-token", failure === "csrf" ? "wrong" : csrf);
      if (failure !== "idempotency") r = r.set("idempotency-key", "personal-guard-key");
      expect((await r.send(body)).status).toBe(failure === "idempotency" ? 400 : 403);
      expect(repository.createSelfLeaveRequest).not.toHaveBeenCalled();
    },
  );
  it("rejects caller-supplied employee identities", async () => {
    const { service, repository } = app();
    const r = await request(service)
      .post("/api/v1/hr/self_service/leave_requests")
      .set("cookie", cookie)
      .set("origin", origin)
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "personal-invalid-owner")
      .send({ ...body, employee_id: "victim" });
    expect(r.status).toBe(400);
    expect(repository.createSelfLeaveRequest).not.toHaveBeenCalled();
  });
  it.each(["manager_approve", "hr_approve", "cancel_approved"])(
    "rejects privileged personal action %s",
    async (action) => {
      const { service, repository } = app();
      const r = await request(service)
        .post("/api/v1/hr/self_service/leave_requests/request-1/actions")
        .set("cookie", cookie)
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", "personal-invalid-action")
        .send({ company_id: "c", action, expected_version: 1, reason: "Privileged action is forbidden here" });
      expect(r.status).toBe(400);
      expect(repository.actOnSelfLeaveRequest).not.toHaveBeenCalled();
    },
  );
  it("submits a validated version and reviewed source hash through the personal boundary", async () => {
    const { service, repository } = app(),
      input = {
        company_id: "c",
        action: "submit",
        expected_version: 1,
        expected_evidence_hash: "b".repeat(64),
        reason: "Reviewed personal leave submission",
      };
    const r = await request(service)
      .post("/api/v1/hr/self_service/leave_requests/request-1/actions")
      .set("cookie", cookie)
      .set("origin", origin)
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "personal-submit-key")
      .send(input);
    expect(r.status).toBe(200);
    expect(repository.actOnSelfLeaveRequest).toHaveBeenCalledWith(
      expect.anything(),
      "request-1",
      input,
      "personal-submit-key",
      expect.any(String),
    );
  });
});
