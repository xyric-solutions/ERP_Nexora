import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { DatabasePool } from "../../packages/db/src/index.js";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { SourceReferenceMasterRepository } from "../../server/api/src/modules/master-data/source-repository.js";

export async function bankContextFixture(pool: DatabasePool, context: BankingActorContext, company: string) {
  const permissions = [
    "master_data.project.read",
    "master_data.project.manage",
    "master_data.location.read",
    "master_data.location.manage",
  ];
  for (const permission of permissions) {
    await pool.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-maker',$2,'all') on conflict do nothing",
      [context.tenantId, permission],
    );
    await pool.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-maker',$2,'company',$3) on conflict do nothing",
      [context.tenantId, permission, company],
    );
  }
  const masterActor = {
    ...context,
    actor: { ...context.actor, permissions: [...context.actor.permissions, ...permissions] },
  };
  const masters = new SourceReferenceMasterRepository(pool),
    key = () => randomUUID();
  const project = await masters.create(
    masterActor,
    "projects",
    { company_id: company, code: `PRJ-${key()}`, name: "Synthetic reporting project" },
    key(),
    key(),
  );
  const location = await masters.create(
    masterActor,
    "locations",
    { company_id: company, code: `LOC-${key()}`, name: "Synthetic reporting city" },
    key(),
    key(),
  );
  return { masters, masterActor, project: project.record, location: location.record };
}

export async function assertContextDatabaseGuards(
  pool: DatabasePool,
  tenant: string,
  kind: "payment" | "receipt",
  id: string,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
    await client.query(
      `update bank_${kind}_line set dimensions=dimensions-'project' where tenant_id=$1 and ${kind}_id=$2`,
      [tenant, id],
    );
    await expect(client.query("set constraints all immediate")).rejects.toMatchObject({ code: "23514" });
  } finally {
    await client.query("rollback");
    client.release();
  }
  const isolation = await pool.query(
    "select relrowsecurity,relforcerowsecurity from pg_class where oid='bank_assignment_intervention'::regclass",
  );
  expect(isolation.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
}

export async function assertUnassignedCheckerDenied(
  pool: DatabasePool,
  tenant: string,
  company: string,
  kind: "payment" | "receipt",
  decision: () => Promise<unknown>,
) {
  const permission = `banking.${kind}.approve`,
    policy = "r06-uat-policy-payment-poster";
  const grant = await pool.query(
    "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing returning permission_key",
    [tenant, policy, permission],
  );
  const scope = await pool.query(
    "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing returning permission_key",
    [tenant, policy, permission, company],
  );
  try {
    await expect(decision()).rejects.toMatchObject({ status: 403, code: "BANK_ASSIGNED_CHECKER_REQUIRED" });
  } finally {
    if (scope.rowCount)
      await pool.query(
        "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id=$2 and permission_key=$3 and scope_kind='company' and scope_value=$4",
        [tenant, policy, permission, company],
      );
    if (grant.rowCount)
      await pool.query(
        "delete from security_role_permission_grant where tenant_id=$1 and role_policy_id=$2 and permission_key=$3",
        [tenant, policy, permission],
      );
  }
}

// Hold the same exclusive lock as governed Identity administration, begin a
// decision, and prove it waits before revoking authority and committing.
export async function assertConcurrentApproverRevocation(
  pool: DatabasePool,
  tenant: string,
  company: string,
  kind: "payment" | "receipt",
  decision: () => Promise<unknown>,
) {
  const client = await pool.connect();
  let result: Promise<unknown> | undefined;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`nexora:security:admin:${tenant}`]);
    result = decision().then(
      () => ({ unexpectedSuccess: true }),
      (error: unknown) => error,
    );
    await expect
      .poll(
        async () =>
          (
            await pool.query<{ waiting: boolean }>(
              "select exists(select 1 from pg_stat_activity where $1=any(pg_blocking_pids(pid))) as waiting",
              [client.processID],
            )
          ).rows[0]?.waiting,
        { timeout: 5_000 },
      )
      .toBe(true);
    await client.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-checker' and permission_key=$2 and scope_kind='company' and scope_value=$3",
      [tenant, `banking.${kind}.approve`, company],
    );
    await client.query("commit");
    expect(await result).toMatchObject({ status: 403 });
  } finally {
    await client.query("rollback");
    client.release();
    await result;
    await pool.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-checker',$2,'company',$3) on conflict do nothing",
      [tenant, `banking.${kind}.approve`, company],
    );
  }
}
