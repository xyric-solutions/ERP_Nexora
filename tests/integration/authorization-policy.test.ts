import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PolicyAdministrationService, PolicyService } from "../../packages/auth/src/index.js";
import { PostgresPolicyAdministrationRepository } from "../../server/api/src/modules/auth/policy-administration-repository.js";
import { PostgresPolicySnapshotRepository } from "../../server/api/src/modules/auth/policy-repository.js";
import { migrate } from "../../packages/db/src/migrations.js";
import { createDatabasePool } from "../../packages/db/src/pool.js";
import { createLegacyBootstrapAdministrator } from "./legacy-security-fixture.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_test";
const pool = createDatabasePool(databaseUrl);
const now = new Date("2026-10-07T08:00:00.000Z");
const enterpriseScopeId = "50000000-0000-4000-8000-000000000001";

async function resetSecurityTables(): Promise<void> {
  await pool.query(
    "truncate table security_policy_command, security_policy_event, security_assignment_scope, security_role_assignment, security_field_grant, security_role_permission, security_sod_policy, security_role, mfa_security_event, mfa_reset_request, mfa_recovery_code, mfa_credential, user_session, authentication_throttle, security_bootstrap_state, password_history, password_credential, app_user",
  );
  await pool.query("delete from security_scope where scope_type <> 'enterprise'");
}

async function bootstrap() {
  const result = await createLegacyBootstrapAdministrator(pool, {
    loginIdentifier: "root@example.test",
    displayName: "Root User",
    passwordHash: "$argon2id$integration-test-hash",
    now,
  });
  if (!result) throw new Error("bootstrap failed");
  return result;
}

function roleReadRequest() {
  return {
    permissionKey: "security.role.read",
    targetScope: {
      scopeId: enterpriseScopeId,
      scopeType: "enterprise" as const,
      status: "active" as const,
      enterpriseScopeId,
      companyScopeId: null,
      ancestorScopeIds: [] as string[],
    },
    requestedFields: ["code"],
    evaluatedAt: now,
  };
}

describe("PostgreSQL authorization policy", () => {
  beforeAll(async () => {
    await migrate(pool);
  });
  beforeEach(resetSecurityTables);
  afterAll(async () => {
    await pool.end();
  });

  it("derives bootstrap access from dynamic policy and not the bootstrap flag or role name", async () => {
    const administrator = await bootstrap();
    const policy = new PolicyService(new PostgresPolicySnapshotRepository(pool));
    const principal = { userId: administrator.userId, assuranceLevel: "mfa" as const };

    await expect(policy.authorize(principal, roleReadRequest())).resolves.toMatchObject({ allowed: true });
    await pool.query("update app_user set bootstrap_administrator = false where id = $1", [administrator.userId]);
    await pool.query(
      "update security_role set display_name = 'Renamed Security Steward' where code = 'initial_administrator'",
    );
    await expect(policy.authorize(principal, roleReadRequest())).resolves.toMatchObject({ allowed: true });

    const flagOnlyUserId = randomUUID();
    await pool.query(
      `insert into app_user
        (id, login_identifier, display_name, status, bootstrap_administrator, created_at, updated_at)
       values ($1, 'flag-only@example.test', 'Flag Only', 'active', true, $2, $2)`,
      [flagOnlyUserId, now],
    );
    await expect(
      policy.authorize({ userId: flagOnlyUserId, assuranceLevel: "mfa" }, roleReadRequest()),
    ).resolves.toMatchObject({ allowed: false, reason: "assignment_inactive" });
  });

  it("loads exact permission fields from one repeatable-read snapshot", async () => {
    const administrator = await bootstrap();
    const repository = new PostgresPolicySnapshotRepository(pool);
    const snapshot = await repository.loadSnapshot(administrator.userId, now);
    const roleRead = snapshot?.assignments[0]?.permissionGrants.find(
      (permission) => permission.permissionKey === "security.role.read",
    );
    expect(snapshot?.assignments).toHaveLength(1);
    expect(roleRead).toMatchObject({
      requiredAssurance: "mfa",
      fieldBearing: true,
      allowedFields: expect.arrayContaining(["code", "displayName", "status", "version"]),
    });
    expect(snapshot?.assignments[0]?.scopeGrants).toEqual([{ scopeId: enterpriseScopeId, includeDescendants: true }]);
  });

  it("atomically rejects removal of the final effective recovery administrator", async () => {
    await bootstrap();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `delete from security_field_grant
         where role_id = (select id from security_role where code = 'initial_administrator')
           and permission_id = (
             select id from security_permission where permission_key = 'security.role_assignment.edit'
           )`,
      );
      await client.query(
        `delete from security_role_permission
         where role_id = (select id from security_role where code = 'initial_administrator')
           and permission_id = (
             select id from security_permission where permission_key = 'security.role_assignment.edit'
           )`,
      );
      await expect(client.query("commit")).rejects.toThrow(/SECURITY_LAST_ADMINISTRATOR_REQUIRED/);
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
    const remaining = await pool.query<{ count: string }>(
      `select count(*) from security_role_permission role_permission
       join security_permission permission on permission.id = role_permission.permission_id
       where permission.permission_key = 'security.role_assignment.edit'`,
    );
    expect(remaining.rows[0]?.count).toBe("1");
  });

  it("enforces company-bound scope names and excludes archived scope grants", async () => {
    const administrator = await bootstrap();
    const companyId = randomUUID();
    await pool.query(
      `insert into security_scope
        (id, scope_type, code, display_name, parent_id, enterprise_scope_id, company_scope_id)
       values ($1, 'company', 'company_a', 'Company A', $2, $2, $1)`,
      [companyId, enterpriseScopeId],
    );
    await expect(
      pool.query(
        `insert into security_scope
          (id, scope_type, code, display_name, parent_id, enterprise_scope_id, company_scope_id)
         values ($1, 'company', 'company_b', ' company a ', $2, $2, $1)`,
        [randomUUID(), enterpriseScopeId],
      ),
    ).rejects.toThrow(/security_scope_name_boundary_uq/);

    await pool.query(
      `update security_scope set status = 'archived', archived_at = $2, updated_at = $2
       where id = $1`,
      [companyId, now],
    );
    const snapshot = await new PostgresPolicySnapshotRepository(pool).loadSnapshot(administrator.userId, now);
    expect(snapshot?.assignments[0]?.scopeGrants.map((scope) => scope.scopeId)).not.toContain(companyId);
  });

  it("reauthorizes and records an idempotent administration command atomically", async () => {
    const administrator = await bootstrap();
    const sessionId = randomUUID();
    await pool.query(
      `insert into user_session
        (id, user_id, token_hash, status, assurance_level, created_at, last_seen_at,
         idle_expires_at, absolute_expires_at)
       values ($1, $2, $3, 'active', 'mfa', $4, $4, $5, $6)`,
      [
        sessionId,
        administrator.userId,
        "a".repeat(64),
        now,
        new Date(now.getTime() + 15 * 60_000),
        new Date(now.getTime() + 8 * 60 * 60_000),
      ],
    );
    const service = new PolicyAdministrationService(new PostgresPolicyAdministrationRepository(pool));
    const actor = { userId: administrator.userId, sessionId, assuranceLevel: "mfa" as const };
    const command = {
      commandId: randomUUID(),
      operation: "role.create" as const,
      targetScope: roleReadRequest().targetScope,
      requestedFields: ["code", "displayName", "description"],
      data: { code: "company_auditor", displayName: "Company Auditor", description: "Audits company data" },
      evaluatedAt: now,
    };

    const first = await service.execute(actor, command);
    expect(first).toMatchObject({ ok: true, replayed: false, version: 1 });
    await expect(service.execute(actor, command)).resolves.toMatchObject({ ok: true, replayed: true, version: 1 });
    await expect(
      service.execute(actor, { ...command, data: { ...command.data, displayName: "Changed payload" } }),
    ).resolves.toEqual({ ok: false, commandId: command.commandId, code: "conflict" });

    const evidence = await pool.query<{ commands: string; events: string; roles: string }>(
      `select
        (select count(*) from security_policy_command where id = $1) as commands,
        (select count(*) from security_policy_event where metadata ->> 'commandId' = $1::text) as events,
        (select count(*) from security_role where code = 'company_auditor') as roles`,
      [command.commandId],
    );
    expect(evidence.rows[0]).toEqual({ commands: "1", events: "1", roles: "1" });
  });

  it("rejects overlapping scoped assignments for dynamically conflicting roles", async () => {
    const administrator = await bootstrap();
    const firstRoleId = randomUUID();
    const secondRoleId = randomUUID();
    await pool.query(
      `insert into security_role (id, code, display_name, status, created_at, updated_at)
       values ($1, 'request_maker', 'Request Maker', 'active', $3, $3),
              ($2, 'request_checker', 'Request Checker', 'active', $3, $3)`,
      [firstRoleId, secondRoleId, now],
    );
    await pool.query(
      `insert into security_sod_policy
        (id, code, display_name, policy_kind, first_role_id, second_role_id,
         status, created_at, updated_at)
       values ($1, 'maker_checker_roles', 'Maker/checker role conflict', 'assignment_conflict',
               $2, $3, 'active', $4, $4)`,
      [randomUUID(), firstRoleId, secondRoleId, now],
    );
    async function assign(roleId: string): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const assignmentId = randomUUID();
        await client.query(
          `insert into security_role_assignment
            (id, user_id, role_id, status, valid_from, assigned_by_user_id, created_at, updated_at)
           values ($1, $2, $3, 'active', $4, $2, $4, $4)`,
          [assignmentId, administrator.userId, roleId, now],
        );
        await client.query(
          `insert into security_assignment_scope (assignment_id, scope_id, include_descendants)
           values ($1, $2, true)`,
          [assignmentId, enterpriseScopeId],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    const outcomes = await Promise.allSettled([assign(firstRoleId), assign(secondRoleId)]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(
      outcomes.find((outcome) => outcome.status === "rejected" && outcome.reason instanceof Error)?.reason.message,
    ).toMatch(/SECURITY_ASSIGNMENT_SOD_CONFLICT/);

    const assignments = await pool.query<{ count: string }>(
      `select count(*) from security_role_assignment
       where user_id = $1 and role_id in ($2, $3)`,
      [administrator.userId, firstRoleId, secondRoleId],
    );
    expect(assignments.rows[0]?.count).toBe("1");
  });

  it("serializes concurrent revocations so one effective recovery administrator remains", async () => {
    const administrator = await bootstrap();
    const role = await pool.query<{ id: string }>("select id from security_role where code = 'initial_administrator'");
    const roleId = role.rows[0]?.id;
    if (!roleId) throw new Error("initial role missing");
    const secondUserId = randomUUID();
    await pool.query(
      `insert into app_user
        (id, login_identifier, display_name, status, bootstrap_administrator, created_at, updated_at)
       values ($1, 'second-admin@example.test', 'Second Administrator', 'active', false, $2, $2)`,
      [secondUserId, now],
    );
    const secondAssignmentId = randomUUID();
    await pool.query(
      `insert into security_role_assignment
        (id, user_id, role_id, status, valid_from, assigned_by_user_id, created_at, updated_at)
       values ($1, $2, $3, 'active', $4, $5, $4, $4)`,
      [secondAssignmentId, secondUserId, roleId, now, administrator.userId],
    );
    await pool.query(
      `insert into security_assignment_scope (assignment_id, scope_id, include_descendants)
       values ($1, $2, true)`,
      [secondAssignmentId, enterpriseScopeId],
    );
    const assignments = await pool.query<{ id: string }>(
      `select id from security_role_assignment where role_id = $1 and status = 'active' order by id`,
      [roleId],
    );
    expect(assignments.rows).toHaveLength(2);

    async function revoke(assignmentId: string): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(
          `update security_role_assignment set status = 'revoked', revoked_at = $2,
                   updated_at = $2, version = version + 1
           where id = $1`,
          [assignmentId, now],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    const outcomes = await Promise.allSettled(assignments.rows.map((assignment) => revoke(assignment.id)));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(
      outcomes.find((outcome) => outcome.status === "rejected" && outcome.reason instanceof Error)?.reason.message,
    ).toMatch(/SECURITY_LAST_ADMINISTRATOR_REQUIRED/);
    const remaining = await pool.query<{ count: string }>(
      "select count(*) from security_role_assignment where role_id = $1 and status = 'active'",
      [roleId],
    );
    expect(remaining.rows[0]?.count).toBe("1");
  });
});
