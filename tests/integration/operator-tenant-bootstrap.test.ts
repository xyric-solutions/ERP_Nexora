import { randomBytes, randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { Redis } from "ioredis";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  PasswordChangeService,
  TenantAuthenticationService,
  TenantSessionService,
} from "../../packages/auth/src/index.js";
import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import {
  bootstrapTenant,
  readTenantBootstrapConfig,
} from "../../server/api/src/modules/administration/operator-tenant-bootstrap.js";
import { RedisLoginThrottleStore } from "../../server/api/src/modules/auth/redis-throttle-store.js";
import { RedisPasswordChangeTicketStore } from "../../server/api/src/modules/auth/redis-password-change-store.js";
import { RedisTenantSessionStore } from "../../server/api/src/modules/auth/redis-session-store.js";
import { SourceTenantAuthenticationRepository } from "../../server/api/src/modules/auth/source-repository.js";
import { PostgresCredentialEmailOutbox } from "../../server/worker/src/email/outbox-store.js";
import { processSendEmailBatch } from "../../server/worker/src/jobs/send-email.js";

const ownerUrl = process.env.TEST_OPERATOR_BOOTSTRAP_DATABASE_URL;
const runtimeUrl = process.env.TEST_OPERATOR_BOOTSTRAP_APP_DATABASE_URL;
const redisUrl = process.env.TEST_OPERATOR_BOOTSTRAP_REDIS_URL;
const run = ownerUrl && runtimeUrl && redisUrl ? describe : describe.skip;

run("operator onboarding and credential delivery on PostgreSQL and Redis", () => {
  const prefix = `operator-bootstrap-${randomUUID()}`;
  const origin = "https://nexora.example.test";
  const directorySecret = randomBytes(32).toString("hex");
  const emailKey = randomBytes(32);
  const tenantId = `t-${randomUUID()}`;
  const email = `${tenantId}@example.invalid`;
  const environment = {
    NODE_ENV: "production",
    NEXORA_BOOTSTRAP_ENABLED: "true",
    NEXORA_BOOTSTRAP_TENANT_ID: tenantId,
    NEXORA_BOOTSTRAP_ORGANISATION_NAME: "Synthetic Onboarding Organisation",
    NEXORA_BOOTSTRAP_COUNTRY_CODE: "PK",
    NEXORA_BOOTSTRAP_FINANCIAL_YEAR_START_MONTH: "7",
    NEXORA_BOOTSTRAP_ADMIN_FULL_NAME: "Synthetic Administrator",
    NEXORA_BOOTSTRAP_ADMIN_EMAIL: email,
    CREDENTIAL_EMAIL_ENABLED: "true",
    CREDENTIAL_EMAIL_ORIGIN: origin,
    CREDENTIAL_EMAIL_ENCRYPTION_KEY: emailKey.toString("base64"),
    DATABASE_MIGRATION_URL: ownerUrl,
    AUTH_LOGIN_DIRECTORY_SECRET: directorySecret,
  };
  let owner: DatabasePool;
  let runtime: DatabasePool;
  let redis: Redis;

  beforeAll(async () => {
    for (const url of [ownerUrl!, runtimeUrl!, redisUrl!]) {
      if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
        throw new Error("The operator bootstrap suite requires isolated loopback dependencies");
      }
    }
    owner = createDatabasePool(ownerUrl!);
    runtime = createDatabasePool(runtimeUrl!);
    redis = new Redis(redisUrl!);
    await migrateSourceSchema(owner);
  });

  afterAll(async () => {
    await Promise.allSettled([owner?.end(), runtime?.end(), redis?.quit()]);
  });

  it("creates the first administrator atomically, sends one email and opens a company session after password change", async () => {
    const config = readTenantBootstrapConfig(environment);
    const [first, replay] = await Promise.all([bootstrapTenant(owner, config), bootstrapTenant(owner, config)]);
    const created = [first, replay].find((result) => result.status === "created");
    expect(created).toMatchObject({ tenantId, credentialEmailQueued: true });
    expect([first.status, replay.status].sort()).toEqual(["already_bootstrapped", "created"]);
    expect(
      await owner.query("select count(*)::int as count from credential_email_outbox where tenant_id=$1", [tenantId]),
    ).toMatchObject({ rows: [{ count: 1 }] });
    await expect(runtime.query("select payload from credential_email_outbox")).rejects.toMatchObject({ code: "42501" });
    await expect(
      bootstrapTenant(
        owner,
        readTenantBootstrapConfig({ ...environment, NEXORA_BOOTSTRAP_ADMIN_FULL_NAME: "Different Administrator" }),
      ),
    ).rejects.toThrow("different inputs");

    const sender = { send: vi.fn(async () => ({ messageId: "synthetic-delivery" })) };
    const store = new PostgresCredentialEmailOutbox(runtime, emailKey);
    const competingStore = new PostgresCredentialEmailOutbox(runtime, emailKey);
    await Promise.all([
      processSendEmailBatch({ now: new Date(), batchSize: 1 }, { store, sender }),
      processSendEmailBatch({ now: new Date(), batchSize: 1 }, { store: competingStore, sender }),
    ]);
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: email, text: expect.stringContaining(config.registration.admin_password) }),
    );
    expect(
      await owner.query("select status, payload from credential_email_outbox where tenant_id=$1", [tenantId]),
    ).toMatchObject({ rows: [{ status: "sent", payload: null }] });

    const repository = new SourceTenantAuthenticationRepository(runtime);
    const sessions = new TenantSessionService(
      new RedisTenantSessionStore(redis, `${prefix}:sessions`),
      "s".repeat(32),
      { idleTimeoutMs: 30 * 60_000, absoluteTimeoutMs: 8 * 60 * 60_000 },
      repository,
    );
    const app = createApp({
      config: { allowedOrigins: new Set([origin]), nodeEnv: "production" },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      authService: await TenantAuthenticationService.create({
        repository,
        loginDirectorySecret: directorySecret,
        throttleSecret: "t".repeat(32),
        throttleStore: new RedisLoginThrottleStore(redis, `${prefix}:throttle`),
      }),
      passwordChangeService: new PasswordChangeService(
        new RedisPasswordChangeTicketStore(redis, `${prefix}:tickets`),
        "p".repeat(32),
      ),
      sessionService: sessions,
      sessionCompanies: repository,
    });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("origin", origin)
      .send({ identifier: email, password: config.registration.admin_password })
      .expect(200);
    expect(login.body.status).toBe("password_change_required");
    expect(login.headers["set-cookie"]).toBeUndefined();
    const changed = await request(app)
      .post("/api/v1/auth/change-initial-password")
      .set("origin", origin)
      .send({ ticket: login.body.ticket, new_password: randomBytes(24).toString("base64url") })
      .expect(200);
    expect(changed.body).toMatchObject({
      status: "authenticated",
      tenant_id: tenantId,
      user: {
        roles: ["super_administrator"],
        permissions: expect.arrayContaining(["security.authorization.administer"]),
      },
    });
    const cookie = String(changed.headers["set-cookie"]?.[0]);
    expect(cookie).toContain("__Host-nexora_session");
    const companies = await request(app).get("/api/v1/auth/companies").set("cookie", cookie.split(";")[0]!).expect(200);
    expect(companies.body.items).toEqual([expect.objectContaining({ id: created?.companyId, code: "CO-001" })]);
    await request(app)
      .put("/api/v1/auth/session/company")
      .set("origin", origin)
      .set("cookie", cookie.split(";")[0]!)
      .set("x-csrf-token", changed.body.csrf_token)
      .send({ company_id: created?.companyId })
      .expect(200);
  });
});
