import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  SecurityAdministrationError,
  SourceSecurityAdministrationRepository,
  type SecurityActorContext,
} from "../../server/api/src/modules/security/source-administration-repository.js";
import { ensureSourceSuperAdministratorFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
function context(
  userId: string,
  permissions: readonly string[] = [],
  roles: readonly string[] = [],
): SecurityActorContext {
  const actor: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles,
    permissions,
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
    await ensureSourceSuperAdministratorFixture(pool);
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
      context("r06.override-admin"),
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

  it("removes the legacy tenant-wide administrator self-approval bypass", async () => {
    await pool.query(
      `insert into security_role_permission_grant
        (tenant_id,role_policy_id,permission_key,field_allow_mode)
       values ($1,'r06-uat-policy-approval-override','security.authorization.administer','all')
       on conflict do nothing`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_role_scope_grant
        (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
       values ($1,'r06-uat-policy-approval-override','security.authorization.administer','tenant',$1)
       on conflict do nothing`,
      [sourceTestTenantId],
    );
    try {
      const admin = context("r06.override-admin");
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
      await expect(
        repository.actOnSessionPolicy(
          admin,
          {
            action: "approve",
            policy_id: id,
            expected_version: submittedVersion,
            reason: "Legacy administrator bypass must remain closed",
          },
          `policy-admin-approve-${randomUUID()}`,
        ),
      ).rejects.toMatchObject({ status: 403, code: "MAKER_CHECKER_VIOLATION" });
    } finally {
      await pool.query(
        `delete from security_role_scope_grant
          where tenant_id=$1 and role_policy_id='r06-uat-policy-approval-override'
            and permission_key='security.authorization.administer'`,
        [sourceTestTenantId],
      );
      await pool.query(
        `delete from security_role_permission_grant
          where tenant_id=$1 and role_policy_id='r06-uat-policy-approval-override'
            and permission_key='security.authorization.administer'`,
        [sourceTestTenantId],
      );
    }
  });

  it("requires a reason and records separate approval and activation override evidence", async () => {
    const permissions = [
      "platform.approval.override",
      "security.session_policy.create",
      "security.session_policy.submit",
      "security.session_policy.approve",
      "security.session_policy.activate",
    ];
    const admin = context("r06.override-admin", permissions, ["super_administrator"]);
    const created = await repository.createSessionPolicy(
      admin,
      { values: { ...values, session_idle_minutes: 15 }, change_summary: "Governed administrator hardening" },
      `policy-override-create-${randomUUID()}`,
    );
    const id = created.entity_id;
    const submitted = await repository.actOnSessionPolicy(
      admin,
      { action: "submit", policy_id: id, expected_version: 1 },
      `policy-override-submit-${randomUUID()}`,
    );
    const submittedVersion = Number((submitted.projection.new_state as Record<string, unknown>).row_version);
    await expect(
      repository.actOnSessionPolicy(
        admin,
        { action: "approve", policy_id: id, expected_version: submittedVersion },
        `policy-override-approve-missing-reason-${randomUUID()}`,
      ),
    ).rejects.toMatchObject({ status: 400, code: "APPROVAL_OVERRIDE_REASON_REQUIRED" });
    const approved = await repository.actOnSessionPolicy(
      admin,
      {
        action: "approve",
        policy_id: id,
        expected_version: submittedVersion,
        reason: "Controlled self-approval for the isolated UAT policy",
      },
      `policy-override-approve-${randomUUID()}`,
    );
    expect(approved.projection.authorization).toMatchObject({ maker_checker_override: true });
    const approvedVersion = Number((approved.projection.new_state as Record<string, unknown>).row_version);
    await expect(
      repository.actOnSessionPolicy(
        admin,
        { action: "activate", policy_id: id, expected_version: approvedVersion },
        `policy-override-activate-missing-reason-${randomUUID()}`,
      ),
    ).rejects.toMatchObject({ status: 400, code: "APPROVAL_OVERRIDE_REASON_REQUIRED" });
    const activated = await repository.actOnSessionPolicy(
      admin,
      {
        action: "activate",
        policy_id: id,
        expected_version: approvedVersion,
        reason: "Activate the governed UAT policy after documented review",
      },
      `policy-override-activate-${randomUUID()}`,
    );
    expect(activated.projection.authorization).toMatchObject({ maker_checker_override: true });
    const states = await pool.query<{ policy_id: string; lifecycle_state: string }>(
      `select policy_id,lifecycle_state from security_session_policy where tenant_id=$1 and policy_id=$2`,
      [sourceTestTenantId, id],
    );
    expect(states.rows).toEqual([{ policy_id: id, lifecycle_state: "active" }]);
    const evidence = await pool.query<{
      approval_override_event_id: string;
      activation_override_event_id: string;
      event_count: number;
    }>(
      `select policy.approval_override_event_id,policy.activation_override_event_id,
              (select count(*)::int from approval_override_event event
                where event.tenant_id=policy.tenant_id
                  and event.resource_type='security.session_policy'
                  and event.resource_id=policy.policy_id) as event_count
         from security_session_policy policy where policy.tenant_id=$1 and policy.policy_id=$2`,
      [sourceTestTenantId, id],
    );
    expect(evidence.rows[0]?.approval_override_event_id).toBeTruthy();
    expect(evidence.rows[0]?.activation_override_event_id).toBeTruthy();
    expect(evidence.rows[0]?.approval_override_event_id).not.toBe(evidence.rows[0]?.activation_override_event_id);
    expect(evidence.rows[0]?.event_count).toBe(2);
  });
});
