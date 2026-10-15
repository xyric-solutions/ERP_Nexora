import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";

import { Redis } from "ioredis";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  loginIdentifierHmac,
  TenantAuthenticationService,
  TenantSelectionService,
  TenantSessionService,
} from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import { RedisLoginThrottleStore } from "../../server/api/src/modules/auth/redis-throttle-store.js";
import { RedisTenantSessionStore } from "../../server/api/src/modules/auth/redis-session-store.js";
import { RedisTenantSelectionStore } from "../../server/api/src/modules/auth/redis-tenant-selection-store.js";
import { SourceTenantAuthenticationRepository } from "../../server/api/src/modules/auth/source-repository.js";
import { ensureSourceTestTenant, sourceTestTenantId } from "./source-security-fixture.js";

const runtimeDatabaseUrl = process.env.TEST_SOURCE_DATABASE_URL;
const bootstrapDatabaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const redisUrl = process.env.TEST_SOURCE_REDIS_URL;
const run = runtimeDatabaseUrl && bootstrapDatabaseUrl && redisUrl ? describe : describe.skip;

run("C4 source-schema authentication and Redis sessions", () => {
  const tenantId = sourceTestTenantId;
  const suffix = randomUUID();
  const userId = `c4.auth.${suffix}`;
  const email = `c4.auth.${suffix}@uat.nexora.invalid`;
  const password = "C4 synthetic integration credential";
  const keyPrefix = `nexora:c4:test:${suffix}`;
  const directorySecret = "d".repeat(32);
  const selectionTenantId = "nexora-c4-selection-uat";
  const selectionEmail = `c4.multi.${suffix}@uat.nexora.invalid`;
  const selectionPassword = "C4 multi-tenant synthetic credential";
  const selectionUsers = [
    { tenantId, userId: `c4.multi.primary.${suffix}` },
    { tenantId: selectionTenantId, userId: `c4.multi.secondary.${suffix}` },
  ] as const;
  let ownerPool: DatabasePool;
  let runtimePool: DatabasePool;
  let redis: Redis;

  beforeAll(async () => {
    ownerPool = createDatabasePool(bootstrapDatabaseUrl!);
    runtimePool = createDatabasePool(runtimeDatabaseUrl!);
    redis = new Redis(redisUrl!, { maxRetriesPerRequest: null });
    await ensureSourceTestTenant(ownerPool);
    const salt = randomBytes(16);
    const passwordHash = pbkdf2Sync(password, salt, 310_000, 32, "sha256");
    await ownerPool.query(
      `insert into security_user_account
        (id, tenant_id, identity_subject, email, status, mfa_state, created_at, updated_at)
       values ($1, $2, $3, $4, 'active', 'disabled', now(), now())`,
      [userId, tenantId, `c4-test:${suffix}`, email],
    );
    await ownerPool.query(
      `insert into security_password_credential
        (tenant_id, user_id, username, algorithm, iterations, salt, password_hash, updated_at)
       values ($1, $2, $3, 'pbkdf2_sha256', 310000, $4, $5, now())`,
      [tenantId, userId, userId, salt, passwordHash],
    );
    for (const [kind, identifier] of [
      ["email", email],
      ["username", userId],
    ] as const) {
      await ownerPool.query(
        `insert into security_login_identifier
          (tenant_id,user_id,identifier_kind,identifier_hmac,lifecycle_state,source_reference)
         values ($1,$2,$3,$4,'active','c4-integration-fixture')`,
        [tenantId, userId, kind, loginIdentifierHmac(directorySecret, kind, identifier)],
      );
    }
    await ownerPool.query(
      `insert into tenant (id,name,plan,region,status,default_locale)
       values ($1,'Nexora C4 Selection UAT','enterprise','uat-isolated','active','en-US')
       on conflict (id) do nothing`,
      [selectionTenantId],
    );
    for (const selectionUser of selectionUsers) {
      const selectionSalt = randomBytes(16);
      await ownerPool.query(
        `insert into security_user_account
          (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at)
         values ($1,$2,$3,$4,'active','disabled',now(),now())`,
        [selectionUser.userId, selectionUser.tenantId, `c4-selection:${selectionUser.userId}`, selectionEmail],
      );
      await ownerPool.query(
        `insert into security_password_credential
          (tenant_id,user_id,username,algorithm,iterations,salt,password_hash,updated_at)
         values ($1,$2,$3,'pbkdf2_sha256',310000,$4,$5,now())`,
        [
          selectionUser.tenantId,
          selectionUser.userId,
          selectionUser.userId,
          selectionSalt,
          pbkdf2Sync(selectionPassword, selectionSalt, 310_000, 32, "sha256"),
        ],
      );
      for (const [kind, identifier] of [
        ["email", selectionEmail],
        ["username", selectionUser.userId],
      ] as const) {
        await ownerPool.query(
          `insert into security_login_identifier
            (tenant_id,user_id,identifier_kind,identifier_hmac,lifecycle_state,source_reference)
           values ($1,$2,$3,$4,'active','c4-selection-fixture')`,
          [selectionUser.tenantId, selectionUser.userId, kind, loginIdentifierHmac(directorySecret, kind, identifier)],
        );
      }
    }
  });

  afterAll(async () => {
    if (ownerPool) {
      for (const selectionUser of selectionUsers) {
        await ownerPool.query("delete from security_login_identifier where tenant_id=$1 and user_id=$2", [
          selectionUser.tenantId,
          selectionUser.userId,
        ]);
        await ownerPool.query("delete from security_password_credential where tenant_id=$1 and user_id=$2", [
          selectionUser.tenantId,
          selectionUser.userId,
        ]);
        await ownerPool.query("delete from security_user_account where tenant_id=$1 and id=$2", [
          selectionUser.tenantId,
          selectionUser.userId,
        ]);
      }
      await ownerPool.query("delete from security_login_identifier where tenant_id = $1 and user_id = $2", [
        tenantId,
        userId,
      ]);
      await ownerPool.query("delete from security_password_credential where tenant_id = $1 and user_id = $2", [
        tenantId,
        userId,
      ]);
      await ownerPool.query("delete from security_user_account where tenant_id = $1 and id = $2", [tenantId, userId]);
    }
    if (redis) {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", `${keyPrefix}:*`, "COUNT", 100);
        cursor = next;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== "0");
    }
    await Promise.allSettled([ownerPool?.end(), runtimePool?.end(), redis?.quit()]);
  });

  it("authenticates by tenant and email, upgrades PBKDF2 only after success, and preserves parity", async () => {
    const repository = new SourceTenantAuthenticationRepository(runtimePool);
    const authentication = await TenantAuthenticationService.create({
      repository,
      throttleStore: new RedisLoginThrottleStore(redis, `${keyPrefix}:throttle`),
      throttleSecret: "t".repeat(32),
      loginDirectorySecret: directorySecret,
    });

    await expect(
      authentication.verifyPasswordCredentials({
        identifier: email,
        password: "incorrect synthetic credential",
        sourceIp: "127.0.0.1",
        correlationId: "c4-wrong-password",
      }),
    ).resolves.toEqual({ status: "invalid" });
    expect(
      (
        await ownerPool.query<{ argon2_hash: string | null }>(
          "select argon2_hash from security_password_credential where tenant_id = $1 and user_id = $2",
          [tenantId, userId],
        )
      ).rows[0]?.argon2_hash,
    ).toBeNull();

    const result = await authentication.verifyPasswordCredentials({
      identifier: email.toUpperCase(),
      password,
      sourceIp: "127.0.0.1",
      correlationId: "c4-correct-password",
    });
    expect(result).toMatchObject({
      status: "verified",
      accounts: [{ tenantId, userId, email, roles: [], permissions: [] }],
    });
    expect(
      (
        await ownerPool.query<{ argon2_hash: string | null }>(
          "select argon2_hash from security_password_credential where tenant_id = $1 and user_id = $2",
          [tenantId, userId],
        )
      ).rows[0]?.argon2_hash,
    ).toMatch(/^\$argon2id\$/);
    await expect(
      authentication.verifyPasswordCredentials({
        identifier: userId.toUpperCase(),
        password,
        sourceIp: "127.0.0.3",
        correlationId: "c4-username-password",
      }),
    ).resolves.toMatchObject({ status: "verified", accounts: [{ tenantId, userId }] });
    await expect(
      authentication.verifyPasswordCredentials({
        identifier: "unknown@uat.nexora.invalid",
        password,
        sourceIp: "127.0.0.2",
        correlationId: "c4-unknown-account",
      }),
    ).resolves.toEqual({ status: "invalid" });
  });

  it("executes login, restore, rotation, logout, CSRF, and fixation prevention through Express", async () => {
    const repository = new SourceTenantAuthenticationRepository(runtimePool);
    const authentication = await TenantAuthenticationService.create({
      repository,
      throttleStore: new RedisLoginThrottleStore(redis, `${keyPrefix}:api-throttle`),
      throttleSecret: "u".repeat(32),
      loginDirectorySecret: directorySecret,
    });
    const sessions = new TenantSessionService(
      new RedisTenantSessionStore(redis, `${keyPrefix}:session`),
      "s".repeat(32),
      { idleTimeoutMs: 30 * 60 * 1_000, absoluteTimeoutMs: 8 * 60 * 60 * 1_000 },
      repository,
    );
    const app = createApp({
      config: { allowedOrigins: new Set(["http://localhost:3000"]), nodeEnv: "production" },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      authService: authentication,
      sessionService: sessions,
      readiness: {},
      jobPublisher: { publishSample: vi.fn(async () => undefined) },
      version: "c4-test",
    });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("origin", "http://localhost:3000")
      .send({ identifier: email, password });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ status: "authenticated", tenant_id: tenantId, user: { id: userId } });
    const cookie = String(login.headers["set-cookie"]?.[0] ?? "");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");

    const restored = await request(app).get("/api/v1/auth/session").set("cookie", cookie);
    expect(restored.status).toBe(200);
    const rotated = await request(app)
      .post("/api/v1/auth/session/rotate")
      .set("origin", "http://localhost:3000")
      .set("cookie", cookie)
      .set("x-csrf-token", login.body.csrf_token);
    expect(rotated.status).toBe(200);
    const rotatedCookie = String(rotated.headers["set-cookie"]?.[0] ?? "");
    expect(rotatedCookie).not.toBe(cookie);
    expect((await request(app).get("/api/v1/auth/session").set("cookie", cookie)).status).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/logout")
          .set("origin", "http://localhost:3000")
          .set("cookie", rotatedCookie)
          .set("x-csrf-token", "invalid")
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/logout")
          .set("origin", "http://localhost:3000")
          .set("cookie", rotatedCookie)
          .set("x-csrf-token", rotated.body.csrf_token)
      ).status,
    ).toBe(204);
    expect((await request(app).get("/api/v1/auth/session").set("cookie", rotatedCookie)).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/login/password").send({})).status).toBe(404);
    expect((await request(app).get("/api/v1/auth/mfa/status")).status).toBe(404);
  });

  it("requires an opaque, single-use selection ticket for multiple verified memberships", async () => {
    const repository = new SourceTenantAuthenticationRepository(runtimePool);
    const authentication = await TenantAuthenticationService.create({
      repository,
      throttleStore: new RedisLoginThrottleStore(redis, `${keyPrefix}:selection-throttle`),
      throttleSecret: "v".repeat(32),
      loginDirectorySecret: directorySecret,
    });
    const sessions = new TenantSessionService(
      new RedisTenantSessionStore(redis, `${keyPrefix}:selection-session`),
      "s".repeat(32),
      { idleTimeoutMs: 30 * 60 * 1_000, absoluteTimeoutMs: 8 * 60 * 60 * 1_000 },
      repository,
    );
    const tenantSelection = new TenantSelectionService(
      new RedisTenantSelectionStore(redis, `${keyPrefix}:selection-ticket`),
      directorySecret,
    );
    const app = createApp({
      config: { allowedOrigins: new Set(["http://localhost:3000"]), nodeEnv: "production" },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      authService: authentication,
      tenantSelectionService: tenantSelection,
      sessionService: sessions,
      readiness: {},
      version: "c4-selection-test",
    });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("origin", "http://localhost:3000")
      .send({ identifier: selectionEmail, password: selectionPassword });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ status: "tenant_selection_required" });
    expect(login.body.choices).toHaveLength(2);
    expect(login.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(login.body)).not.toContain(selectionUsers[0].userId);
    expect(JSON.stringify(login.body)).not.toContain(selectionTenantId);

    const selected = await request(app)
      .post("/api/v1/auth/select-tenant")
      .set("origin", "http://localhost:3000")
      .send({ ticket: login.body.ticket, choice_id: login.body.choices[0].id });
    expect(selected.status).toBe(200);
    expect(selected.body.status).toBe("authenticated");
    expect(String(selected.headers["set-cookie"]?.[0] ?? "")).toContain("HttpOnly");

    const replay = await request(app)
      .post("/api/v1/auth/select-tenant")
      .set("origin", "http://localhost:3000")
      .send({ ticket: login.body.ticket, choice_id: login.body.choices[0].id });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("INVALID_TENANT_SELECTION");
  });
});
