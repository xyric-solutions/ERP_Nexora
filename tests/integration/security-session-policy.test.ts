import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  SecurityAdministrationError,
  SourceSecurityAdministrationRepository,
  type SecurityActorContext,
} from "../../server/api/src/modules/security/source-administration-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
function context(userId: string): SecurityActorContext {
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
  return { tenantId: sourceTestTenantId, actor, correlationId: randomUUID() };
}
const values = {
  password_minimum_length: 12,
  password_require_uppercase: true,
  password_require_lowercase: true,
  password_require_number: true,
  password_require_symbol: true,
  session_idle_minutes: 20,
  session_absolute_hours: 4,
  concurrent_session_limit: 2,
  login_maximum_failures: 4,
  login_window_minutes: 15,
  login_block_minutes: 30,
  delegation_maximum_days: 14,
  impersonation_maximum_minutes: 20,
};

run("governed security session policy", () => {
  let pool: DatabasePool;
  let repository: SourceSecurityAdministrationRepository;
  let policyId = "";
  let version = 1;
  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    repository = new SourceSecurityAdministrationRepository(pool, "d".repeat(32));
  });
  afterAll(async () => {
    await pool?.end();
  });
  it("requires independent approval and activates one PostgreSQL-authoritative version", async () => {
    const created = await repository.createSessionPolicy(
      context("r06.maker"),
      { values, change_summary: "Production session controls" },
      `policy-create-${randomUUID()}`,
    );
    policyId = created.entity_id;
    const submitted = await repository.actOnSessionPolicy(
      context("r06.maker"),
      { action: "submit", policy_id: policyId, expected_version: version },
      `policy-submit-${randomUUID()}`,
    );
    version = Number((submitted.projection.new_state as Record<string, unknown>).row_version);
    await expect(
      repository.actOnSessionPolicy(
        context("r06.maker"),
        { action: "approve", policy_id: policyId, expected_version: version },
        `policy-self-approve-${randomUUID()}`,
      ),
    ).rejects.toBeInstanceOf(SecurityAdministrationError);
    const approved = await repository.actOnSessionPolicy(
      context("r06.checker"),
      { action: "approve", policy_id: policyId, expected_version: version },
      `policy-approve-${randomUUID()}`,
    );
    version = Number((approved.projection.new_state as Record<string, unknown>).row_version);
    await repository.actOnSessionPolicy(
      context("r06.last-admin-b"),
      { action: "activate", policy_id: policyId, expected_version: version },
      `policy-activate-${randomUUID()}`,
    );
    await expect(repository.loadEffectiveSecurityPolicy(sourceTestTenantId)).resolves.toMatchObject({
      passwordMinimumLength: 12,
      sessionIdleMs: 1_200_000,
      concurrentSessionLimit: 2,
      delegationMaximumMs: 14 * 86_400_000,
    });
    const active = await pool.query(
      "select count(*)::int as count from security_session_policy where tenant_id=$1 and lifecycle_state='active'",
      [sourceTestTenantId],
    );
    expect(active.rows[0]?.count).toBe(1);
  });

  it("allows the tenant-wide administrator to use the approved emergency exception without a second actor", async () => {
    const admin = context("r06.last-admin-b");
    const created = await repository.createSessionPolicy(
      admin,
      { values: { ...values, session_idle_minutes: 15 }, change_summary: "Emergency administrator hardening" },
      `policy-admin-create-${randomUUID()}`,
    );
    const id = created.entity_id;
    const submitted = await repository.actOnSessionPolicy(
      admin,
      { action: "submit", policy_id: id, expected_version: 1 },
      `policy-admin-submit-${randomUUID()}`,
    );
    const submittedVersion = Number((submitted.projection.new_state as Record<string, unknown>).row_version);
    const approved = await repository.actOnSessionPolicy(
      admin,
      { action: "approve", policy_id: id, expected_version: submittedVersion },
      `policy-admin-approve-${randomUUID()}`,
    );
    const approvedVersion = Number((approved.projection.new_state as Record<string, unknown>).row_version);
    await expect(
      repository.actOnSessionPolicy(
        admin,
        { action: "activate", policy_id: id, expected_version: approvedVersion },
        `policy-admin-activate-${randomUUID()}`,
      ),
    ).resolves.toMatchObject({ entity_id: id });
    const states = await pool.query<{ policy_id: string; lifecycle_state: string }>(
      `select policy_id,lifecycle_state from security_session_policy where tenant_id=$1 and policy_id=any($2::text[]) order by policy_id`,
      [sourceTestTenantId, [policyId, id]],
    );
    expect(states.rows).toEqual(
      expect.arrayContaining([
        { policy_id: policyId, lifecycle_state: "superseded" },
        { policy_id: id, lifecycle_state: "active" },
      ]),
    );
  });
});
