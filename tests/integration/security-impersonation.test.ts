import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";

import { Redis } from "ioredis";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { TenantSessionService, type AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import { RedisTenantSessionStore } from "../../server/api/src/modules/auth/redis-session-store.js";
import { SourceTenantAuthenticationRepository } from "../../server/api/src/modules/auth/source-repository.js";
import {
  SourceSecurityAdministrationRepository,
  type SecurityActorContext,
} from "../../server/api/src/modules/security/source-administration-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const redisUrl = process.env.TEST_SOURCE_REDIS_URL;
const run = databaseUrl && redisUrl ? describe : describe.skip;

const makerPermissions = [
  "security.impersonation.read",
  "security.impersonation.create",
  "security.impersonation.submit",
  "security.impersonation.activate",
  "security.impersonation.end",
];

function account(userId: string): AuthenticatedAccount {
  return {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: [],
    permissions:
      userId === "r06.maker"
        ? makerPermissions
        : userId === "r06.checker"
          ? ["security.impersonation.read", "security.impersonation.approve"]
          : userId === "r06.last-admin-b"
            ? ["security.authorization.administer"]
            : [],
    sessionVersion: 1,
  };
}

function actor(userId: string, correlationId: string): SecurityActorContext {
  return { tenantId: sourceTestTenantId, actor: account(userId), correlationId };
}

run("governed security impersonation", () => {
  const suffix = randomUUID();
  const targetId = `r06.impersonation.target.${suffix}`;
  const keyPrefix = `nexora:impersonation:test:${suffix}`;
  let pool: DatabasePool;
  let redis: Redis;
  let repository: SourceSecurityAdministrationRepository;
  let sessions: TenantSessionService;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    redis = new Redis(redisUrl!, { maxRetriesPerRequest: null });
    await ensureSourceAuthorizationFixture(pool);
    await pool.query(
      `insert into security_user_account
        (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at)
       values ($1,$2,$3,$4,'active','disabled',now(),now())`,
      [targetId, sourceTestTenantId, `r06-uat:${targetId}`, `${targetId}@uat.nexora.invalid`],
    );
    repository = new SourceSecurityAdministrationRepository(pool, "d".repeat(32));
    const authRepository = new SourceTenantAuthenticationRepository(pool);
    sessions = new TenantSessionService(
      new RedisTenantSessionStore(redis, keyPrefix),
      "s".repeat(32),
      { idleTimeoutMs: 60_000, absoluteTimeoutMs: 300_000 },
      authRepository,
      undefined,
      repository,
    );
    app = createApp({
      config: { allowedOrigins: new Set(["http://localhost:3000"]), nodeEnv: "test" },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      authService: {
        verifyPasswordCredentials: vi.fn(async () => ({ status: "invalid" as const })),
        loadAuthenticatedAccount: vi.fn(async (_tenantId, userId) => account(userId)),
        loadPasswordVerifiedAccount: vi.fn(async () => null),
        recordTrustedAuthenticationEvent: vi.fn(async () => undefined),
        changeInitialPassword: vi.fn(async () => null),
      },
      sessionService: sessions,
      securityRepository: repository,
      readiness: {},
      version: "impersonation-test",
    });
  });

  afterAll(async () => {
    await redis?.quit();
    await pool?.end();
  });

  it("requires independent approval, activates a server-side context, and blocks security access", async () => {
    const issued = await sessions.issue(sourceTestTenantId, "r06.maker");
    const created = await repository.createImpersonation(
      actor("r06.maker", `impersonation-create-${suffix}`),
      { target_user_id: targetId, purpose: "Investigate a user-visible access issue", duration_minutes: 15 },
      `impersonation-create-${suffix}`,
    );
    const requestId = created.entity_id;
    const submitted = await repository.actOnImpersonation(
      actor("r06.maker", `impersonation-submit-${suffix}`),
      { action: "submit", request_id: requestId, expected_version: 1 },
      `impersonation-submit-${suffix}`,
      issued.sessionId,
    );
    const submittedVersion = Number((submitted.projection.new_state as Record<string, unknown>).row_version);
    await expect(
      repository.actOnImpersonation(
        actor("r06.maker", `impersonation-self-approve-${suffix}`),
        { action: "approve", request_id: requestId, expected_version: submittedVersion },
        `impersonation-self-approve-${suffix}`,
        issued.sessionId,
      ),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    const approved = await repository.actOnImpersonation(
      actor("r06.checker", `impersonation-approve-${suffix}`),
      { action: "approve", request_id: requestId, expected_version: submittedVersion },
      `impersonation-approve-${suffix}`,
      issued.sessionId,
    );
    const approvedVersion = Number((approved.projection.new_state as Record<string, unknown>).row_version);

    const activated = await request(app)
      .post("/api/v1/security/impersonation_actions")
      .set("origin", "http://localhost:3000")
      .set("cookie", `nexora_session=${issued.token}`)
      .set("x-csrf-token", issued.csrfToken)
      .set("idempotency-key", `impersonation-activate-${suffix}`)
      .send({ action: "activate", request_id: requestId, expected_version: approvedVersion });
    expect(activated.status).toBe(200);

    const restored = await request(app).get("/api/v1/auth/session").set("cookie", `nexora_session=${issued.token}`);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({
      user: { id: targetId },
      impersonation: { request_id: requestId, real_user: { id: "r06.maker" } },
    });
    const blocked = await request(app)
      .get("/api/v1/security/permissions")
      .set("cookie", `nexora_session=${issued.token}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("IMPERSONATION_RESTRICTED");

    const activeVersion = Number(activated.body.projection.new_state.row_version);
    const ended = await request(app)
      .post("/api/v1/security/impersonation_actions")
      .set("origin", "http://localhost:3000")
      .set("cookie", `nexora_session=${issued.token}`)
      .set("x-csrf-token", issued.csrfToken)
      .set("idempotency-key", `impersonation-end-${suffix}`)
      .send({ action: "end", request_id: requestId, expected_version: activeVersion, reason: "Support review complete" });
    expect(ended.status).toBe(200);
    expect((await sessions.get(issued.token))?.impersonation).toBeUndefined();
  });

  it("permits approval-free activation only for the single designated emergency principal", async () => {
    const admin = await sessions.issue(sourceTestTenantId, "r06.last-admin-b");
    const created = await repository.createImpersonation(
      actor("r06.last-admin-b", `impersonation-emergency-create-${suffix}`),
      { target_user_id: targetId, purpose: "Urgent production support investigation", duration_minutes: 5 },
      `impersonation-emergency-create-${suffix}`,
    );
    const activated = await request(app)
      .post("/api/v1/security/impersonation_actions")
      .set("origin", "http://localhost:3000")
      .set("cookie", `nexora_session=${admin.token}`)
      .set("x-csrf-token", admin.csrfToken)
      .set("idempotency-key", `impersonation-emergency-${suffix}`)
      .send({ action: "emergency_activate", request_id: created.entity_id, expected_version: 1 });
    expect(activated.status).toBe(200);
    expect(activated.body.projection.new_state).toMatchObject({ lifecycle_state: "active", emergency_activation: true });
    await pool.query(
      `update security_emergency_impersonation_principal set revoked_at=now() where tenant_id=$1 and user_id='r06.last-admin-b'`,
      [sourceTestTenantId],
    );
    expect((await sessions.get(admin.token))?.impersonation).toBeUndefined();
    const undesignated = await repository.createImpersonation(
      actor("r06.last-admin-b", `impersonation-undesignated-create-${suffix}`),
      { target_user_id: targetId, purpose: "Must not bypass a revoked designation", duration_minutes: 5 },
      `impersonation-undesignated-create-${suffix}`,
    );
    const denied = await request(app)
      .post("/api/v1/security/impersonation_actions")
      .set("origin", "http://localhost:3000")
      .set("cookie", `nexora_session=${admin.token}`)
      .set("x-csrf-token", admin.csrfToken)
      .set("idempotency-key", `impersonation-undesignated-${suffix}`)
      .send({ action: "emergency_activate", request_id: undesignated.entity_id, expected_version: 1 });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("EMERGENCY_PRINCIPAL_REQUIRED");
    await pool.query(
      `update security_emergency_impersonation_principal set revoked_at=null where tenant_id=$1 and user_id='r06.last-admin-b'`,
      [sourceTestTenantId],
    );
    const version = Number(activated.body.projection.new_state.row_version);
    const ended = await request(app)
      .post("/api/v1/security/impersonation_actions")
      .set("origin", "http://localhost:3000")
      .set("cookie", `nexora_session=${admin.token}`)
      .set("x-csrf-token", admin.csrfToken)
      .set("idempotency-key", `impersonation-emergency-end-${suffix}`)
      .send({ action: "end", request_id: created.entity_id, expected_version: version, reason: "Emergency review complete" });
    expect(ended.status).toBe(200);
  });

  it("fails closed when PostgreSQL no longer considers the context active", async () => {
    const issued = await sessions.issue(sourceTestTenantId, "r06.maker");
    const created = await repository.createImpersonation(
      actor("r06.maker", `impersonation-stale-create-${suffix}`),
      { target_user_id: targetId, purpose: "Validate fail-closed context", duration_minutes: 5 },
      `impersonation-stale-create-${suffix}`,
    );
    const submitted = await repository.actOnImpersonation(
      actor("r06.maker", `impersonation-stale-submit-${suffix}`),
      { action: "submit", request_id: created.entity_id, expected_version: 1 },
      `impersonation-stale-submit-${suffix}`,
      issued.sessionId,
    );
    const approved = await repository.actOnImpersonation(
      actor("r06.checker", `impersonation-stale-approve-${suffix}`),
      {
        action: "approve",
        request_id: created.entity_id,
        expected_version: Number((submitted.projection.new_state as Record<string, unknown>).row_version),
      },
      `impersonation-stale-approve-${suffix}`,
      issued.sessionId,
    );
    const active = await repository.actOnImpersonation(
      actor("r06.maker", `impersonation-stale-activate-${suffix}`),
      {
        action: "activate",
        request_id: created.entity_id,
        expected_version: Number((approved.projection.new_state as Record<string, unknown>).row_version),
      },
      `impersonation-stale-activate-${suffix}`,
      issued.sessionId,
    );
    const next = active.projection.new_state as Record<string, unknown>;
    expect(
      await sessions.startImpersonation(issued.token, {
        requestId: created.entity_id,
        requestVersion: Number(next.row_version),
        targetUserId: targetId,
        targetSessionVersion: Number(next.target_session_version),
        expiresAt: new Date(String(next.expires_at)),
      }),
    ).not.toBeNull();
    await repository.actOnImpersonation(
      actor("r06.maker", `impersonation-stale-end-${suffix}`),
      {
        action: "end",
        request_id: created.entity_id,
        expected_version: Number(next.row_version),
        reason: "Invalidate PostgreSQL authority before Redis cleanup",
      },
      `impersonation-stale-end-${suffix}`,
      issued.sessionId,
    );
    expect((await sessions.get(issued.token))?.impersonation).toBeUndefined();
  });
});
