import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthenticatedAccount, TenantSessionView } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import {
  SecurityAdministrationError,
  SourceSecurityAdministrationRepository,
  type SecurityActorContext,
} from "../../server/api/src/modules/security/source-administration-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

function context(userId: string, correlationId: string): SecurityActorContext {
  const actor: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: [],
    permissions: [],
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor, correlationId };
}

run("governed security delegation", () => {
  const suffix = randomUUID();
  const delegateeId = `r06.delegated.${suffix}`;
  let pool: DatabasePool;
  let repository: SourceSecurityAdministrationRepository;
  let app: ReturnType<typeof createApp>;
  let delegationId = "";
  let version = 1;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    await pool.query(
      `insert into security_user_account
        (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at)
       values ($1,$2,$3,$4,'active','disabled',now(),now())`,
      [delegateeId, sourceTestTenantId, `r06-uat:${delegateeId}`, `${delegateeId}@uat.nexora.invalid`],
    );
    repository = new SourceSecurityAdministrationRepository(pool, "d".repeat(32));
    const session = (userId: string): TenantSessionView => ({
      sessionId: `session-${userId}`,
      tenantId: sourceTestTenantId,
      userId,
      sessionVersion: 1,
      csrfToken: "c".repeat(43),
      idleExpiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 120_000),
    });
    app = createApp({
      config: { allowedOrigins: new Set(["http://localhost:3000"]), nodeEnv: "test" },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      authService: {
        verifyPasswordCredentials: vi.fn(async () => ({ status: "invalid" as const })),
        loadAuthenticatedAccount: vi.fn(async (_tenantId, userId) => context(userId, "api").actor),
        loadPasswordVerifiedAccount: vi.fn(async () => null),
        recordTrustedAuthenticationEvent: vi.fn(async () => undefined),
        changeInitialPassword: vi.fn(async () => null),
      },
      sessionService: {
        issue: vi.fn(async () => { throw new Error("not used"); }),
        get: vi.fn(async (token) => session(token)),
        rotate: vi.fn(async () => ({ status: "invalid_session" as const })),
        authorizeMutation: vi.fn(async (token, csrf) =>
          csrf === "c".repeat(43)
            ? { status: "ok" as const, session: session(token) }
            : { status: "invalid_csrf" as const },
        ),
        logout: vi.fn(async () => ({ status: "ok" as const })),
        logoutAll: vi.fn(async () => ({ status: "ok" as const })),
        revokeToken: vi.fn(async () => true),
        revokeAllForUser: vi.fn(async () => 0),
      },
      securityRepository: repository,
      readiness: {},
      version: "delegation-router-test",
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("rejects self-delegation, prohibited authority, and scope expansion", async () => {
    const base = {
      permission_key: "security.authorization.audit.read",
      scope_kind: "tenant" as const,
      scope_value: sourceTestTenantId,
      valid_from: new Date(Date.now() - 60_000).toISOString(),
      valid_until: new Date(Date.now() + 86_400_000).toISOString(),
      reason: "Cover a bounded audit review window",
    };
    await expect(
      repository.createDelegation(
        context("r06.maker", `delegation-self-${suffix}`),
        { ...base, delegatee_id: "r06.maker" },
        `delegation-self-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "SELF_DELEGATION_DENIED" } satisfies Partial<SecurityAdministrationError>);
    await expect(
      repository.createDelegation(
        context("r06.maker", `delegation-prohibited-${suffix}`),
        { ...base, delegatee_id: delegateeId, permission_key: "security.user_account.reset_password" },
        `delegation-prohibited-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "DELEGATION_PROHIBITED" } satisfies Partial<SecurityAdministrationError>);
    await expect(
      repository.createDelegation(
        context("r06.maker", `delegation-scope-${suffix}`),
        {
          ...base,
          delegatee_id: delegateeId,
          scope_kind: "company",
          scope_value: "nexora-r06-uat-company",
        },
        `delegation-scope-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "DELEGATION_DENIED" } satisfies Partial<SecurityAdministrationError>);
  });

  it("creates, submits, independently approves, and activates a bounded grant", async () => {
    await expect(
      repository.listAudit(context(delegateeId, `delegation-before-${suffix}`), 0, 25),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    const created = await repository.createDelegation(
      context("r06.maker", `delegation-create-${suffix}`),
      {
        delegatee_id: delegateeId,
        permission_key: "security.authorization.audit.read",
        scope_kind: "tenant",
        scope_value: sourceTestTenantId,
        valid_from: new Date(Date.now() - 60_000).toISOString(),
        valid_until: new Date(Date.now() + 86_400_000).toISOString(),
        reason: "Cover a bounded audit review window",
      },
      `delegation-create-${suffix}`,
    );
    delegationId = created.entity_id;
    expect(created.projection.new_state).toMatchObject({ lifecycle_state: "draft", row_version: "1" });
    const submitted = await repository.actOnDelegation(
      context("r06.maker", `delegation-submit-${suffix}`),
      { action: "submit", delegation_id: delegationId, expected_version: version },
      `delegation-submit-${suffix}`,
    );
    version = Number((submitted.projection.new_state as Record<string, unknown>).row_version);
    await expect(
      repository.actOnDelegation(
        context("r06.maker", `delegation-self-approve-${suffix}`),
        { action: "approve", delegation_id: delegationId, expected_version: version },
        `delegation-self-approve-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    const queue = await repository.listDelegations(context("r06.checker", `delegation-queue-${suffix}`), {
      lifecycle_state: "submitted",
      cursor: 0,
      limit: 25,
    });
    expect(queue.items).toContainEqual(expect.objectContaining({ delegation_id: delegationId }));
    const approved = await repository.actOnDelegation(
      context("r06.checker", `delegation-approve-${suffix}`),
      { action: "approve", delegation_id: delegationId, expected_version: version },
      `delegation-approve-${suffix}`,
    );
    version = Number((approved.projection.new_state as Record<string, unknown>).row_version);
    const activated = await repository.actOnDelegation(
      context("r06.maker", `delegation-activate-${suffix}`),
      { action: "activate", delegation_id: delegationId, expected_version: version },
      `delegation-activate-${suffix}`,
    );
    version = Number((activated.projection.new_state as Record<string, unknown>).row_version);
    expect(activated.projection.new_state).toMatchObject({ lifecycle_state: "active" });
  });

  it("derives authority at use time and removes it immediately on revocation", async () => {
    const audit = await repository.listAudit(context(delegateeId, `delegation-use-${suffix}`), 0, 25);
    expect(audit.items.length).toBeGreaterThan(0);
    const revoked = await repository.actOnDelegation(
      context("r06.maker", `delegation-revoke-${suffix}`),
      {
        action: "revoke",
        delegation_id: delegationId,
        expected_version: version,
        reason: "Coverage window ended early",
      },
      `delegation-revoke-${suffix}`,
    );
    expect(revoked.projection.new_state).toMatchObject({ lifecycle_state: "revoked" });
    await expect(
      repository.listAudit(context(delegateeId, `delegation-after-${suffix}`), 0, 25),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
  });

  it("retains immutable lifecycle evidence", async () => {
    const page = await repository.listDelegations(context("r06.maker", `delegation-history-${suffix}`), {
      principal_id: delegateeId,
      cursor: 0,
      limit: 25,
    });
    const row = page.items.find((item) => item.delegation_id === delegationId)!;
    expect((row.history as Array<Record<string, unknown>>).map((event) => event.event_type)).toEqual([
      "created",
      "submitted",
      "approved",
      "activated",
      "revoked",
    ]);
    const event = await pool.query<{ event_id: string }>(
      `select event_id from security_delegation_event where tenant_id=$1 and delegation_id=$2 limit 1`,
      [sourceTestTenantId, delegationId],
    );
    await expect(
      pool.query(`update security_delegation_event set reason='tampered' where tenant_id=$1 and event_id=$2`, [
        sourceTestTenantId,
        event.rows[0]!.event_id,
      ]),
    ).rejects.toThrow(/append-only/);
  });

  it("exposes the governed records through the versioned API and enforces mutation controls", async () => {
    const listed = await request(app)
      .get(`/api/v1/security/delegations?principal_id=${encodeURIComponent(delegateeId)}`)
      .set("cookie", "nexora_session=r06.maker");
    expect(listed.status).toBe(200);
    expect(listed.body.items).toContainEqual(expect.objectContaining({ delegation_id: delegationId }));

    const denied = await request(app)
      .post("/api/v1/security/delegations")
      .set("origin", "http://localhost:3000")
      .set("cookie", "nexora_session=r06.maker")
      .set("x-csrf-token", "c".repeat(43))
      .set("idempotency-key", `delegation-api-self-${suffix}`)
      .send({
        delegatee_id: "r06.maker",
        permission_key: "security.authorization.audit.read",
        scope_kind: "tenant",
        scope_value: sourceTestTenantId,
        valid_from: new Date(Date.now() - 60_000).toISOString(),
        valid_until: new Date(Date.now() + 86_400_000).toISOString(),
        reason: "This request must be rejected",
      });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("SELF_DELEGATION_DENIED");
  });
});
