import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  ApprovalOverrideWriterError,
  writeApprovalOverrideEvent,
} from "../../server/api/src/modules/security/approval-override-writer.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("transactional approval override evidence", () => {
  const suffix = randomUUID();
  const actorId = `override-actor-${suffix}`;
  let roleId = "role-super-administrator";
  let policyId = "policy-super-administrator";
  const assignmentId = `override-assignment-${suffix}`;
  let pool: DatabasePool;

  const account: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId: actorId,
    email: `${actorId}@uat.nexora.invalid`,
    displayName: "Override Actor",
    roles: ["super_administrator"],
    permissions: [
      "platform.approval.override",
      "banking.bank_account.approve",
      "security.authorization.assignment.approve",
    ],
    sessionVersion: 1,
  };

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await client.query(
        `insert into security_user_account
          (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at,display_name)
         values ($1,$2,$3,$4,'active','disabled',now(),now(),'Override Actor')`,
        [actorId, sourceTestTenantId, `test:${actorId}`, account.email],
      );
      await client.query(
        `insert into security_tenant_role
          (tenant_id,role_id,role_code,display_name,description,lifecycle_state,source_kind,source_reference)
         values ($1,$2,'super_administrator','Override Test','Controlled test authority',
                 'active','legacy_backfill',$3)
         on conflict (tenant_id,role_code) do nothing`,
        [sourceTestTenantId, roleId, `test:${suffix}`],
      );
      const governedRole = await client.query<{ role_id: string }>(
        `select role_id from security_tenant_role
          where tenant_id=$1 and role_code='super_administrator' and lifecycle_state='active'`,
        [sourceTestTenantId],
      );
      roleId = governedRole.rows[0]!.role_id;
      await client.query(
        `insert into security_role_policy
          (id,tenant_id,role,scope,permissions,field_rules,sod_rules,version,status,created_at,role_id,lifecycle_state)
         values ($1,$2,'super_administrator',$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,
                 1,'active',now(),$7,'active')
         on conflict do nothing`,
        [
          policyId,
          sourceTestTenantId,
          JSON.stringify({ mode: "tenant" }),
          JSON.stringify(account.permissions),
          JSON.stringify({ allow: null, deny: [] }),
          JSON.stringify({ conflicting_roles: [], distinct_actor_fields: [] }),
          roleId,
        ],
      );
      const governedPolicy = await client.query<{ id: string }>(
        `select id from security_role_policy
          where tenant_id=$1 and role=$2 and role_id=$3
            and status='active' and lifecycle_state='active'
          order by id limit 1`,
        [sourceTestTenantId, "super_administrator", roleId],
      );
      policyId = governedPolicy.rows[0]!.id;
      for (const permission of account.permissions) {
        await client.query(
          `insert into security_role_permission_grant
            (tenant_id,role_policy_id,permission_key,field_allow_mode)
           values ($1,$2,$3,'all') on conflict do nothing`,
          [sourceTestTenantId, policyId, permission],
        );
      }
      await client.query(
        `insert into security_user_role_assignment
          (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from)
         values ($1,$2,$3,$2,now(),$4,'active',now())`,
        [sourceTestTenantId, actorId, policyId, assignmentId],
      );
      await client.query(
        `insert into security_user_role_assignment_version
          (tenant_id,assignment_id,version,supersedes_version,user_id,role_policy_id,lifecycle_state,
           valid_from,assigned_by,administration_command_id,source_kind,source_reference)
         values ($1,$2,1,null,$3,$4,'active',now(),$3,null,'legacy_backfill',$5)`,
        [sourceTestTenantId, assignmentId, actorId, policyId, `test:${suffix}`],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  function evidenceInput(
    idempotencyKey: string,
    resourceId = `resource-${suffix}`,
    options: { resourceType?: string; normalDecisionPermission?: string } = {},
  ) {
    return {
      tenantId: sourceTestTenantId,
      account,
      makerActorIds: [actorId],
      normalDecisionPermission: options.normalDecisionPermission ?? "banking.bank_account.approve",
      resourceType: options.resourceType ?? "banking.bank_account",
      resourceId,
      decisionAction: "approve" as const,
      reason: "Controlled super-admin acceptance",
      correlationId: `correlation-${suffix}`,
      idempotencyKey,
      metadata: { source: "integration_test" },
    };
  }

  it("inserts once and replays the matching event inside the caller transaction", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      const input = evidenceInput(`replay-${suffix}`);
      const created = await writeApprovalOverrideEvent(client, input);
      const replayed = await writeApprovalOverrideEvent(client, input);
      expect(created.replayed).toBe(false);
      expect(replayed).toEqual({ eventId: created.eventId, replayed: true });
      await client.query("commit");

      const count = await pool.query<{ count: string }>(
        "select count(*)::text as count from approval_override_event where tenant_id=$1 and event_id=$2",
        [sourceTestTenantId, created.eventId],
      );
      expect(count.rows[0]?.count).toBe("1");
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  it("rejects conflicting idempotency reuse", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      const key = `conflict-${suffix}`;
      await writeApprovalOverrideEvent(client, evidenceInput(key, `first-${suffix}`));
      await expect(writeApprovalOverrideEvent(client, evidenceInput(key, `second-${suffix}`))).rejects.toBeInstanceOf(
        ApprovalOverrideWriterError,
      );
      await client.query("rollback");
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  it("rolls back with the caller transaction", async () => {
    const client = await pool.connect();
    const key = `rollback-${suffix}`;
    let eventId = "";
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      eventId = (await writeApprovalOverrideEvent(client, evidenceInput(key, `rollback-${suffix}`))).eventId;
      await client.query("rollback");
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
    const count = await pool.query<{ count: string }>(
      "select count(*)::text as count from approval_override_event where tenant_id=$1 and event_id=$2",
      [sourceTestTenantId, eventId],
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  it("requires correctly linked evidence for an ordinary same-actor Security decision", async () => {
    const client = await pool.connect();
    const requestId = `override-role-request-${suffix}`;
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await client.query(
        `insert into security_assignment_approval_request
          (tenant_id,request_id,assignment_id,target_user_id,role_policy_id,requested_action,
           proposed_assignment,request_state,requested_by,submitted_by,submitted_at)
         values ($1,$2,$3,$4,$5,'edit','{}'::jsonb,'submitted',$4,$4,now())`,
        [sourceTestTenantId, requestId, assignmentId, actorId, policyId],
      );
      await expect(
        client.query(
          `update security_assignment_approval_request
              set request_state='approved',decided_by=$3,decided_at=now(),row_version=row_version+1
            where tenant_id=$1 and request_id=$2`,
          [sourceTestTenantId, requestId, actorId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback");

      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await client.query(
        `insert into security_assignment_approval_request
          (tenant_id,request_id,assignment_id,target_user_id,role_policy_id,requested_action,
           proposed_assignment,request_state,requested_by,submitted_by,submitted_at)
         values ($1,$2,$3,$4,$5,'edit','{}'::jsonb,'submitted',$4,$4,now())`,
        [sourceTestTenantId, requestId, assignmentId, actorId, policyId],
      );
      const override = await writeApprovalOverrideEvent(
        client,
        evidenceInput(`security-role-${suffix}`, requestId, {
          resourceType: "security.assignment_approval_request",
          normalDecisionPermission: "security.authorization.assignment.approve",
        }),
      );
      await expect(
        client.query(
          `update security_assignment_approval_request
              set request_state='approved',decided_by=$3,decided_at=now(),
                  approval_override_event_id=$4,row_version=row_version+1
            where tenant_id=$1 and request_id=$2`,
          [sourceTestTenantId, requestId, actorId, override.eventId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await client.query("commit");
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  it("keeps committed override evidence immutable", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      const override = await writeApprovalOverrideEvent(
        client,
        evidenceInput(`immutable-${suffix}`, `immutable-${suffix}`),
      );
      await client.query("commit");

      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await expect(
        client.query("update approval_override_event set reason='Changed' where tenant_id=$1 and event_id=$2", [
          sourceTestTenantId,
          override.eventId,
        ]),
      ).rejects.toMatchObject({ code: "P0001" });
      await client.query("rollback");
    } finally {
      client.release();
    }
  });
});
