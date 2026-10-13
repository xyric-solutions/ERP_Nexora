import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";

import { Redis } from "ioredis";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  hashPassword,
  loginIdentifierHmac,
  PasswordChangeService,
  TenantAuthenticationService,
  TenantSessionService,
} from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../apps/api/src/app.js";
import { RedisLoginThrottleStore } from "../../apps/api/src/modules/auth/redis-throttle-store.js";
import { RedisPasswordChangeTicketStore } from "../../apps/api/src/modules/auth/redis-password-change-store.js";
import { RedisTenantSessionStore } from "../../apps/api/src/modules/auth/redis-session-store.js";
import { SourceTenantAuthenticationRepository } from "../../apps/api/src/modules/auth/source-repository.js";
import { ensureSourceTestTenant, sourceTestTenantId } from "./source-security-fixture.js";

const runtimeDatabaseUrl = process.env.TEST_SOURCE_DATABASE_URL;
const bootstrapDatabaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const redisUrl = process.env.TEST_SOURCE_REDIS_URL;
const run = runtimeDatabaseUrl && bootstrapDatabaseUrl && redisUrl ? describe : describe.skip;

run("first-password change through PostgreSQL and Redis", () => {
  const suffix = randomUUID();
  const tenantId = sourceTestTenantId;
  const userId = `password-change.${suffix}`;
  const email = `${userId}@uat.nexora.invalid`;
  const username = `password.change.${suffix}`;
  const temporaryPassword = "Temporary password phrase 123";
  const permanentPassword = "Permanent password phrase 456";
  const directorySecret = "d".repeat(32);
  const keyPrefix = `nexora:test:password-change:${suffix}`;
  let ownerPool: DatabasePool;
  let runtimePool: DatabasePool;
  let redis: Redis;

  beforeAll(async () => {
    ownerPool = createDatabasePool(bootstrapDatabaseUrl!);
    runtimePool = createDatabasePool(runtimeDatabaseUrl!);
    redis = new Redis(redisUrl!, { maxRetriesPerRequest: null });
    await ensureSourceTestTenant(ownerPool);
    await ownerPool.query(
      `insert into security_user_account
        (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at,display_name)
       values ($1,$2,$3,$4,'active','disabled',now(),now(),'Password Change UAT')`,
      [userId, tenantId, `password-change:${suffix}`, email],
    );
    await ownerPool.query(
      `insert into security_password_credential
        (tenant_id,user_id,username,algorithm,iterations,salt,password_hash,updated_at,
         argon2_hash,argon2_updated_at,must_change_password,credential_status)
       values ($1,$2,$3,null,null,null,null,now(),$4,now(),true,'reset_required')`,
      [tenantId, userId, username, await hashPassword(temporaryPassword)],
    );
    for (const [kind, identifier] of [
      ["email", email],
      ["username", username],
    ] as const) {
      await ownerPool.query(
        `insert into security_login_identifier
          (tenant_id,user_id,identifier_kind,identifier_hmac,lifecycle_state,source_reference)
         values ($1,$2,$3,$4,'active','first-password-change-test')`,
        [tenantId, userId, kind, loginIdentifierHmac(directorySecret, kind, identifier)],
      );
    }
  });

  afterAll(async () => {
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

  it("withholds a session until a single-use ticket changes the password transactionally", async () => {
    const repository = new SourceTenantAuthenticationRepository(runtimePool);
    const authentication = await TenantAuthenticationService.create({
      repository,
      throttleStore: new RedisLoginThrottleStore(redis, `${keyPrefix}:throttle`),
      throttleSecret: "t".repeat(32),
      loginDirectorySecret: directorySecret,
    });
    const sessions = new TenantSessionService(
      new RedisTenantSessionStore(redis, `${keyPrefix}:session`),
      "s".repeat(32),
      { idleTimeoutMs: 30 * 60 * 1_000, absoluteTimeoutMs: 8 * 60 * 60 * 1_000 },
      repository,
    );
    const passwordChanges = new PasswordChangeService(
      new RedisPasswordChangeTicketStore(redis, `${keyPrefix}:ticket`),
      "p".repeat(32),
    );
    const app = createApp({
      config: { allowedOrigins: new Set(["http://localhost:3000"]), nodeEnv: "production" },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      authService: authentication,
      passwordChangeService: passwordChanges,
      sessionService: sessions,
      readiness: {},
      jobPublisher: { publishSample: vi.fn(async () => undefined) },
      version: "password-change-test",
    });

    const firstLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("origin", "http://localhost:3000")
      .send({ identifier: username, password: temporaryPassword });
    expect(firstLogin.status).toBe(200);
    expect(firstLogin.body).toMatchObject({ status: "password_change_required" });
    expect(firstLogin.body.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(firstLogin.headers["set-cookie"]).toBeUndefined();

    const samePassword = await request(app)
      .post("/api/v1/auth/change-initial-password")
      .set("origin", "http://localhost:3000")
      .send({ ticket: firstLogin.body.ticket, new_password: temporaryPassword });
    expect(samePassword.status).toBe(401);
    expect(samePassword.body.code).toBe("INVALID_PASSWORD_CHANGE");
    expect(
      (
        await request(app)
          .post("/api/v1/auth/change-initial-password")
          .set("origin", "http://localhost:3000")
          .send({ ticket: firstLogin.body.ticket, new_password: permanentPassword })
      ).status,
    ).toBe(401);

    const secondLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("origin", "http://localhost:3000")
      .send({ identifier: email, password: temporaryPassword });
    const changed = await request(app)
      .post("/api/v1/auth/change-initial-password")
      .set("origin", "http://localhost:3000")
      .send({ ticket: secondLogin.body.ticket, new_password: permanentPassword });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ status: "authenticated", tenant_id: tenantId, user: { id: userId } });
    expect(String(changed.headers["set-cookie"]?.[0] ?? "")).toContain("HttpOnly");

    const credential = await ownerPool.query<{
      must_change_password: boolean;
      credential_status: string;
      password_version: number;
      session_version: number;
    }>(
      `select credential.must_change_password,credential.credential_status,
              credential.password_version,account.session_version
         from security_password_credential credential
         join security_user_account account
           on account.tenant_id=credential.tenant_id and account.id=credential.user_id
        where credential.tenant_id=$1 and credential.user_id=$2`,
      [tenantId, userId],
    );
    expect(credential.rows[0]).toEqual({
      must_change_password: false,
      credential_status: "active",
      password_version: "2",
      session_version: "2",
    });
    const events = await ownerPool.query<{ event_type: string }>(
      `select event_type from security_authentication_event
        where tenant_id=$1 and user_id=$2 order by occurred_at`,
      [tenantId, userId],
    );
    expect(events.rows.map((row) => row.event_type)).toContain("initial_password_changed");

    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .set("origin", "http://localhost:3000")
          .send({ identifier: username, password: temporaryPassword })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .set("origin", "http://localhost:3000")
          .send({ identifier: username, password: permanentPassword })
      ).body.status,
    ).toBe("authenticated");
  });
});
