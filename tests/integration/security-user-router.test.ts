import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthenticatedAccount, TenantSessionView } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../apps/api/src/app.js";
import { SourceSecurityAdministrationRepository } from "../../apps/api/src/modules/security/source-administration-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("security user administration API", () => {
  const suffix = randomUUID();
  const username = `api.user.${suffix}`;
  let pool: DatabasePool;
  let app: ReturnType<typeof createApp>;
  const revokeAllForUser = vi.fn(async () => 0);

  const account = (userId: string): AuthenticatedAccount => ({
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: [],
    permissions: [],
    sessionVersion: 1,
  });

  const session = (token: string): TenantSessionView => ({
    sessionId: `session-${token}`,
    tenantId: sourceTestTenantId,
    userId: token,
    sessionVersion: 1,
    csrfToken: "c".repeat(43),
    idleExpiresAt: new Date(Date.now() + 60_000),
    absoluteExpiresAt: new Date(Date.now() + 120_000),
  });

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    const repository = new SourceSecurityAdministrationRepository(pool, "d".repeat(32));
    app = createApp({
      config: { allowedOrigins: new Set(["http://localhost:3000"]), nodeEnv: "test" },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      authService: {
        verifyPasswordCredentials: vi.fn(async () => ({ status: "invalid" as const })),
        loadAuthenticatedAccount: vi.fn(async (_tenantId, userId) => account(userId)),
        loadPasswordVerifiedAccount: vi.fn(async (_tenantId, userId) => ({
          ...account(userId),
          mustChangePassword: false,
          passwordVersion: 1,
        })),
        recordTrustedAuthenticationEvent: vi.fn(async () => undefined),
        changeInitialPassword: vi.fn(async () => null),
      },
      sessionService: {
        issue: vi.fn(async () => {
          throw new Error("not used");
        }),
        get: vi.fn(async (token) => session(token)),
        rotate: vi.fn(async () => ({ status: "invalid_session" as const })),
        authorizeMutation: vi.fn(async (token, csrfToken) =>
          csrfToken === "c".repeat(43)
            ? { status: "ok" as const, session: session(token) }
            : { status: "invalid_csrf" as const },
        ),
        logout: vi.fn(async () => ({ status: "ok" as const })),
        logoutAll: vi.fn(async () => ({ status: "ok" as const })),
        revokeToken: vi.fn(async () => true),
        revokeAllForUser,
      },
      securityRepository: repository,
      readiness: {},
      version: "user-router-test",
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  function mutation(userId: string) {
    return {
      origin: "http://localhost:3000",
      cookie: `nexora_session=${userId}`,
      csrf: "c".repeat(43),
    };
  }

  it("executes the governed API lifecycle and independently denies unauthorized calls", async () => {
    const maker = mutation("r06.maker");
    const checker = mutation("r06.checker");
    const created = await request(app)
      .post("/api/v1/security/user_requests")
      .set("origin", maker.origin)
      .set("cookie", maker.cookie)
      .set("x-csrf-token", maker.csrf)
      .set("idempotency-key", `api-create-${suffix}`)
      .send({
        requested_action: "create",
        proposal: {
          display_name: "API Governed User",
          username,
          email: `${username}@uat.nexora.invalid`,
          employee_id: null,
          companies: [{ company_id: "nexora-r06-uat-company", is_default: true }],
          initial_role_policy_ids: [],
        },
      });
    expect(created.status).toBe(201);
    const requestId = created.body.entity_id as string;

    const submitted = await request(app)
      .post("/api/v1/security/user_request_actions")
      .set("origin", maker.origin)
      .set("cookie", maker.cookie)
      .set("x-csrf-token", maker.csrf)
      .set("idempotency-key", `api-submit-${suffix}`)
      .send({ action: "submit", request_id: requestId, expected_version: 1 });
    expect(submitted.status).toBe(200);

    const approved = await request(app)
      .post("/api/v1/security/approval_actions")
      .set("origin", checker.origin)
      .set("cookie", checker.cookie)
      .set("x-csrf-token", checker.csrf)
      .set("idempotency-key", `api-approve-${suffix}`)
      .send({
        resource_type: "user",
        request_id: requestId,
        decision: "approved",
        reason: null,
        expected_version: 2,
      });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({
      entity_type: "user_account",
      replayed: false,
      credential_delivery_available: true,
    });
    const userId = approved.body.entity_id as string;
    const relatedApprovals = await request(app)
      .get(`/api/v1/security/approvals?resource_type=user&user_id=${encodeURIComponent(userId)}`)
      .set("cookie", checker.cookie);
    expect(relatedApprovals.status).toBe(200);
    expect(relatedApprovals.body.items).toContainEqual(expect.objectContaining({ request_id: requestId }));
    const history = await request(app)
      .get(`/api/v1/security/audit_events?workspace=users&user_id=${encodeURIComponent(userId)}`)
      .set("cookie", maker.cookie);
    expect(history.status).toBe(200);
    expect(history.body.items).toContainEqual(
      expect.objectContaining({ entity_type: "user_account", entity_id: userId }),
    );
    expect(history.body.items).toContainEqual(
      expect.objectContaining({ entity_type: "user_change_request", entity_id: requestId }),
    );
    expect(
      (await request(app).get("/api/v1/security/audit_events?workspace=invalid").set("cookie", maker.cookie)).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get("/api/v1/security/audit_events?workspace=users&user_id=foreign-user")
          .set("cookie", maker.cookie)
      ).body.items,
    ).toEqual([]);
    expect(
      (await request(app).get("/api/v1/security/assignments?role_policy_id=foreign-policy").set("cookie", maker.cookie))
        .body.items,
    ).toEqual([]);
    expect(
      (
        await request(app)
          .get("/api/v1/security/audit_events?workspace=users")
          .set("cookie", "nexora_session=r06.restricted")
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get("/api/v1/security/audit_events?workspace=users")
          .set("cookie", maker.cookie)
          .set("x-tenant-id", "foreign-tenant")
      ).status,
    ).toBe(403);

    const users = await request(app)
      .get(`/api/v1/security/users?search=${encodeURIComponent(username)}`)
      .set("cookie", maker.cookie);
    expect(users.status).toBe(200);
    expect(users.body.items).toContainEqual(expect.objectContaining({ id: userId, username }));
    const current = await request(app)
      .get(`/api/v1/security/users?archived=false&search=${encodeURIComponent(username)}`)
      .set("cookie", maker.cookie);
    expect(current.status).toBe(200);
    expect(current.body.items).toContainEqual(expect.objectContaining({ id: userId, archived_at: null }));
    const archived = await request(app)
      .get(`/api/v1/security/users?archived=true&search=${encodeURIComponent(username)}`)
      .set("cookie", maker.cookie);
    expect(archived.status).toBe(200);
    expect(archived.body.items).toHaveLength(0);
    expect((await request(app).get("/api/v1/security/users?archived=invalid").set("cookie", maker.cookie)).status).toBe(
      400,
    );
    expect((await request(app).get(`/api/v1/security/users/${userId}`).set("cookie", maker.cookie)).status).toBe(200);
    expect(
      (await request(app).get("/api/v1/security/users").set("cookie", "nexora_session=r06.restricted")).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get("/api/v1/security/users")
          .set("cookie", maker.cookie)
          .set("x-tenant-id", "another-tenant")
      ).status,
    ).toBe(403);

    const locked = await request(app)
      .post("/api/v1/security/user_emergency_actions")
      .set("origin", maker.origin)
      .set("cookie", maker.cookie)
      .set("x-csrf-token", maker.csrf)
      .set("idempotency-key", `api-lock-${suffix}`)
      .send({
        action: "lock",
        target_user_id: userId,
        expected_user_version: 1,
        reason: "Synthetic API security response",
      });
    expect(locked.status).toBe(200);
    expect(revokeAllForUser).toHaveBeenCalledWith(sourceTestTenantId, userId);
    expect((await request(app).delete(`/api/v1/security/users/${userId}`).set("cookie", maker.cookie)).status).toBe(
      404,
    );
  });
});
