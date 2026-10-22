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
    getLearning: vi.fn(async () => ({
      company_id: "c",
      section: "programmes",
      mode: "hr",
      today: "2026-10-22",
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
      selected: null,
      participants: [],
      history: [],
      programmes: [],
      requests: [],
      sessions: [],
      employees: [],
      performance_links: [],
      options_capped: false,
      can_manage: false,
      can_review: false,
      can_create_request: false,
      gaps: [],
      gap_total: 0,
    })),
    actOnLearning: vi.fn(async () => ({ ...result, status: "draft" })),
    getLearningCertificate: vi.fn(async () => {
      throw new Error("Not called for invalid identity");
    }),
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

const programme = {
  kind: "programme",
  code: "SAFE-1",
  name: "Safe company practices",
  objectives: "Learn and demonstrate safe company practices",
  category: "Compliance",
  delivery_mode: "Classroom",
  provider: "Internal HR",
  duration_minutes: 60,
  cost_per_participant: "0",
  currency: "PKR",
  mandatory: true,
  minimum_attendance_percent: 80,
  pass_mark: 70,
  validity_months: 12,
  prerequisite_ids: [],
};
const cases = [
  { action: "create", expected_version: 0, terms: programme },
  { action: "submit", id: "request", expected_version: 1 },
  {
    action: "attendance",
    id: "participant",
    expected_version: 1,
    attendance: [],
    assessment_score: 90,
    evidence_reference: "Signed trainer attendance reference",
  },
  {
    action: "enroll",
    request_id: "request",
    session_id: "session",
    expected_request_version: 4,
    expected_session_version: 2,
  },
];
describe("Learning HTTP session and mutation boundary", () => {
  it.each(["hr", "mine"])("requires authentication and no-store for %s workspace", async (mode) => {
    const { service } = app();
    const url = "/api/v1/hr/learning?company_id=c&section=programmes&mode=" + mode;
    expect((await request(service).get(url)).status).toBe(401);
    const r = await request(service).get(url).set("cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  for (const body of cases) {
    it("passes the validated " + body.action + " action to the authorized repository", async () => {
      const { service, repository } = app();
      const r = await request(service)
        .post("/api/v1/hr/learning/actions")
        .set("cookie", cookie)
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", "learning-valid-action")
        .send({ ...body, company_id: "c", reason: "Governed company learning acceptance action" });
      expect(r.status).toBe(200);
      expect(r.headers["cache-control"]).toBe("no-store");
      expect(repository.actOnLearning).toHaveBeenCalledOnce();
    });
  }
  it.each(["session", "origin", "csrf", "idempotency"])(
    "blocks missing or invalid %s before a mutation",
    async (failure) => {
      const { service, repository } = app();
      let r = request(service)
        .post("/api/v1/hr/learning/actions")
        .set("origin", failure === "origin" ? "https://untrusted.test" : origin)
        .set("x-csrf-token", failure === "csrf" ? "bad" : csrf);
      if (failure !== "session") r = r.set("cookie", cookie);
      if (failure !== "idempotency") r = r.set("idempotency-key", "learning-guarded-action");
      expect(
        (await r.send({ ...cases[0], company_id: "c", reason: "Governed learning boundary acceptance action" })).status,
      ).toBe(failure === "session" ? 401 : failure === "idempotency" ? 400 : 403);
      expect(repository.actOnLearning).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...cases[0], terms: { ...programme, minimum_attendance_percent: 101 } },
    { ...cases[0], terms: { ...programme, cost_per_participant: "-1" } },
    { action: "finalize", id: "x", expected_version: 0 },
    { action: "create", expected_version: 0, terms: { kind: "completion", certificate_id: "fake" } },
    { ...cases[0], override_self_approval: true },
  ])("rejects malformed or unauthorized workflow fields", async (body) => {
    const { service, repository } = app();
    const r = await request(service)
      .post("/api/v1/hr/learning/actions")
      .set("cookie", cookie)
      .set("origin", origin)
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "learning-invalid-action")
      .send({ ...body, company_id: "c", reason: "Invalid company learning action acceptance" });
    expect(r.status).toBe(400);
    expect(repository.actOnLearning).not.toHaveBeenCalled();
  });
  it("bounds list queries and rejects unknown personal selectors", async () => {
    const { service, repository } = app();
    for (const extra of ["&limit=999", "&employee_id=victim"])
      expect(
        (
          await request(service)
            .get("/api/v1/hr/learning?company_id=c&section=requests&mode=mine" + extra)
            .set("cookie", cookie)
        ).status,
      ).toBe(400);
    expect(repository.getLearning).not.toHaveBeenCalled();
  });
  it("requires authentication for certificate reads", async () => {
    const { service, repository } = app();
    expect((await request(service).get("/api/v1/hr/learning/certificates/record?company_id=c")).status).toBe(401);
    expect(repository.getLearningCertificate).not.toHaveBeenCalled();
  });
});
