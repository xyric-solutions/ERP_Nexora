import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import { ReferenceMasterError } from "../../server/api/src/modules/master-data/source-repository.js";
import type { ReferenceMasterRepository } from "../../server/api/src/modules/master-data/service.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import {
  createReferenceMasterRequestSchema,
  updateReferenceMasterRequestSchema,
  referenceMasterQuerySchema,
} from "../../packages/contracts/src/master-data/index.js";
import { buildOpenApiDocument } from "../../packages/contracts/src/openapi-c4.js";
const session = {
  sessionId: "synthetic-session",
  tenantId: "synthetic-tenant",
  userId: "synthetic-user",
  sessionVersion: 1,
  csrfToken: "c".repeat(43),
  idleExpiresAt: new Date("2026-10-21T12:00:00Z"),
  absoluteExpiresAt: new Date("2026-10-21T15:00:00Z"),
};
const record = {
  id: "reference-one",
  company_id: "company-one",
  code: "REF-1",
  name: "Synthetic reporting reference",
  status: "active" as const,
  version: 1,
  created_by: session.userId,
  updated_by: session.userId,
  created_at: "2026-10-21T00:00:00.000Z",
  updated_at: "2026-10-21T00:00:00.000Z",
};
const repo = {
  companies: vi.fn(async () => ({ items: [{ id: "company-one", code: "ONE", name: "Synthetic company" }] })),
  list: vi.fn(async () => ({ items: [record], next_cursor: null })),
  get: vi.fn(async () => record),
  create: vi.fn(async () => ({ record, audit_event_id: "synthetic-audit" })),
  update: vi.fn(async () => ({ record: { ...record, version: 2 }, audit_event_id: "synthetic-audit" })),
  status: vi.fn(async () => ({
    record: { ...record, version: 2, status: "inactive" as const },
    audit_event_id: "synthetic-audit",
  })),
} satisfies ReferenceMasterRepository;
const unavailable = async () => {
  throw new Error("Not used in this API test");
};
function application(impersonated = false) {
  const current = impersonated
    ? {
        ...session,
        impersonation: {
          requestId: "impersonation-one",
          requestVersion: 1,
          targetUserId: "target",
          targetSessionVersion: 1,
          expiresAt: new Date("2026-10-21T13:00:00Z"),
        },
      }
    : session;
  const auth: TenantAuthApiService = {
    verifyPasswordCredentials: unavailable,
    loadPasswordVerifiedAccount: unavailable,
    recordTrustedAuthenticationEvent: unavailable,
    changeInitialPassword: unavailable,
    loadAuthenticatedAccount: async () => ({
      tenantId: session.tenantId,
      userId: session.userId,
      organizationName: "Synthetic",
      displayName: "Synthetic",
      email: "test@example.invalid",
      roles: [],
      permissions: ["master_data.project.read", "master_data.project.manage"],
      sessionVersion: 1,
    }),
  };
  const sessions: TenantSessionApiService = {
    issue: unavailable,
    rotate: unavailable,
    logout: unavailable,
    logoutAll: unavailable,
    revokeToken: unavailable,
    revokeAllForUser: unavailable,
    get: async () => current,
    authorizeMutation: async (_token, csrf) =>
      csrf === session.csrfToken ? { status: "ok", session: current } : { status: "invalid_csrf" },
  };
  return createApp({
    config: { allowedOrigins: new Set(["http://127.0.0.1:3000"]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    authService: auth,
    sessionService: sessions,
    referenceMasterRepository: repo,
  });
}
const base = "/api/v1/master_data/projects";
const input = { company_id: record.company_id, code: record.code, name: record.name };
beforeEach(() => vi.clearAllMocks());
describe("Shared reference API boundary", () => {
  it("requires a cookie session and rejects tenant-header substitution", async () => {
    expect((await request(application()).get(`${base}?company_id=company-one`)).status).toBe(401);
    expect(
      (
        await request(application())
          .get(`${base}?company_id=company-one`)
          .set("Cookie", "nexora_session=synthetic")
          .set("x-tenant-id", "outside")
      ).status,
    ).toBe(403);
    expect(repo.list).not.toHaveBeenCalled();
  });
  it("validates kind and bounded query without a mock fallback", async () => {
    for (const path of [
      `${base}?company_id=company-one&limit=101`,
      "/api/v1/master_data/arbitrary?company_id=company-one",
      `${base}?company_id=company-one&unexpected=true`,
    ]) {
      expect((await request(application()).get(path).set("Cookie", "nexora_session=synthetic")).status).toBe(400);
    }
    expect(repo.list).not.toHaveBeenCalled();
  });
  it("returns authorized directories and detail ETags with no-store caching", async () => {
    const response = await request(application())
      .get(`${base}?company_id=company-one&limit=2`)
      .set("Cookie", "nexora_session=synthetic");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ tenantId: session.tenantId }), "projects", {
      company_id: "company-one",
      limit: 2,
    });
    expect(
      (await request(application()).get(`${base}/companies`).set("Cookie", "nexora_session=synthetic")).status,
    ).toBe(200);
    expect(
      (
        await request(application())
          .get(`${base}/reference-one?company_id=company-one`)
          .set("Cookie", "nexora_session=synthetic")
      ).headers.etag,
    ).toBe('"1"');
  });
  it("rejects bad Origin, missing CSRF and missing idempotency before any create", async () => {
    const app = application();
    expect(
      (
        await request(app)
          .post(base)
          .set("Cookie", "nexora_session=synthetic")
          .set("idempotency-key", "create-one")
          .set("Origin", "https://outside.invalid")
          .send(input)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(base)
          .set("Cookie", "nexora_session=synthetic")
          .set("idempotency-key", "create-one")
          .send(input)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(base)
          .set("Cookie", "nexora_session=synthetic")
          .set("x-csrf-token", session.csrfToken)
          .send(input)
      ).status,
    ).toBe(400);
    expect(repo.create).not.toHaveBeenCalled();
  });
  it("creates via the service and prevents impersonated changes", async () => {
    for (const impersonated of [false, true]) {
      const response = await request(application(impersonated))
        .post(base)
        .set("Cookie", "nexora_session=synthetic")
        .set("idempotency-key", "create-one")
        .set("x-csrf-token", session.csrfToken)
        .send(input);
      expect(response.status).toBe(impersonated ? 403 : 201);
      if (!impersonated) expect(response.headers.etag).toBe('"1"');
    }
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
  it("requires matching If-Match for edits and status changes", async () => {
    const app = application();
    const edit = { company_id: "company-one", expected_version: 1, name: "Edited reference" };
    expect(
      (
        await request(app)
          .patch(`${base}/reference-one`)
          .set("Cookie", "nexora_session=synthetic")
          .set("idempotency-key", "edit-one")
          .set("x-csrf-token", session.csrfToken)
          .send(edit)
      ).status,
    ).toBe(412);
    const response = await request(app)
      .patch(`${base}/reference-one`)
      .set("Cookie", "nexora_session=synthetic")
      .set("idempotency-key", "edit-one")
      .set("x-csrf-token", session.csrfToken)
      .set("If-Match", '"1"')
      .send(edit);
    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"2"');
    expect(
      (
        await request(app)
          .post(`${base}/reference-one/status`)
          .set("Cookie", "nexora_session=synthetic")
          .set("idempotency-key", "status-one")
          .set("x-csrf-token", session.csrfToken)
          .set("If-Match", '"1"')
          .send({ company_id: "company-one", expected_version: 1, status: "inactive" })
      ).status,
    ).toBe(200);
  });
  it("returns safe domain problems instead of falling back to local data", async () => {
    repo.list.mockRejectedValueOnce(
      new ReferenceMasterError(403, "COMPANY_ACCESS_DENIED", "Company access is required."),
    );
    const response = await request(application())
      .get(`${base}?company_id=company-one`)
      .set("Cookie", "nexora_session=synthetic");
    expect(response.status).toBe(403);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.body.code).toBe("COMPANY_ACCESS_DENIED");
  });
});
describe("Shared reference contracts", () => {
  it("normalizes inputs and rejects financial or arbitrary fields", () => {
    expect(createReferenceMasterRequestSchema.parse({ ...input, name: "  Name  " }).name).toBe("Name");
    for (const value of [
      { ...input, currency: "USD" },
      { ...input, code: "../../path" },
      { ...input, name: " " },
    ])
      expect(createReferenceMasterRequestSchema.safeParse(value).success).toBe(false);
    expect(
      updateReferenceMasterRequestSchema.safeParse({
        company_id: "one",
        expected_version: 1,
        name: "Changed",
        code: "CHANGE",
      }).success,
    ).toBe(false);
    expect(referenceMasterQuerySchema.safeParse({ company_id: "one", limit: 101 }).success).toBe(false);
  });
  it("documents both kinds, security, preconditions and shared schemas", () => {
    const document = JSON.parse(JSON.stringify(buildOpenApiDocument()));
    for (const kind of ["projects", "locations"]) {
      expect(document.paths[`/master_data/${kind}`].post.security).toEqual([{ cookieAuth: [] }]);
      expect(document.paths[`/master_data/${kind}/{id}`].patch.parameters).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "if-match", required: true })]),
      );
    }
    expect(document.components.schemas.ReferenceMaster).toBeDefined();
  });
});
