import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceSuperAdministratorFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";

const bootstrapUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const suite = bootstrapUrl ? describe : describe.skip;
const database = `super_admin_access_${randomUUID().replaceAll("-", "")}`;
// The fixture's super_administrator role starts with a deliberately narrow list of keys.
const superPolicy = "r06-uat-policy-approval-override";
const ordinaryPolicy = "r06-uat-policy-maker";

suite("Super Admin always holds every active permission (security 0025)", () => {
  let bootstrap: DatabasePool, pool: DatabasePool;
  beforeAll(async () => {
    if (!bootstrapUrl || !["localhost", "127.0.0.1"].includes(new URL(bootstrapUrl).hostname))
      throw new Error("An explicit local test database is required");
    bootstrap = createDatabasePool(bootstrapUrl);
    await bootstrap.query(`create database ${database}`);
    const url = new URL(bootstrapUrl);
    url.pathname = `/${database}`;
    pool = createDatabasePool(url.toString());
    await migrateSourceSchema(pool);
    await ensureSourceSuperAdministratorFixture(pool);
  }, 180_000);
  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${database}`);
      await bootstrap.end();
    }
  });

  async function access(policy: string) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      const result = await client.query<{ grants: string[]; scopes: string[]; listed: string[]; active: string[] }>(
        `select
           coalesce((select array_agg(permission_key order by permission_key) from security_role_permission_grant
              where tenant_id=$1 and role_policy_id=$2),'{}') as grants,
           coalesce((select array_agg(permission_key order by permission_key) from security_role_scope_grant
              where tenant_id=$1 and role_policy_id=$2 and scope_kind='tenant' and scope_value=$1),'{}') as scopes,
           coalesce((select array_agg(k order by k) from security_role_policy p, jsonb_array_elements_text(p.permissions) k
              where p.tenant_id=$1 and p.id=$2),'{}') as listed,
           (select array_agg(permission_key order by permission_key) from security_permission_definition where status='active') as active`,
        [tenant, policy],
      );
      await client.query("commit");
      return result.rows[0]!;
    } finally {
      client.release();
    }
  }

  it("backfills every active permission into the Super Admin role, its scope and its policy list", async () => {
    const before = await access(superPolicy);
    expect(before.grants.length).toBeLessThan(before.active.length);
    await pool.query("select sync_super_administrator_permissions()");
    const after = await access(superPolicy);
    expect(after.grants).toEqual(after.active);
    expect(after.scopes).toEqual(after.active);
    expect(after.listed).toEqual(after.active);
    expect(after.grants).toEqual(expect.arrayContaining(["fleet.vehicle.read", "manufacturing.bom.read", "finance.tax.read"]));
  });

  it("grants a permission added by a later migration automatically, and only to Super Admins", async () => {
    const key = "fleet.probe.read";
    await pool.query(
      `insert into security_permission_definition
        (permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity)
       values ($1,'fleet','probe','read','Synthetic key for the Super Admin access test.','password',false,false,'standard')`,
      [key],
    );
    const superAccess = await access(superPolicy);
    expect(superAccess.grants).toContain(key);
    expect(superAccess.scopes).toContain(key);
    expect(superAccess.listed).toContain(key);
    expect((await access(ordinaryPolicy)).grants).not.toContain(key);

    // A retired key leaves the policy list; reactivating it brings it back.
    await pool.query("update security_permission_definition set status='archived' where permission_key=$1", [key]);
    expect((await access(superPolicy)).listed).not.toContain(key);
    await pool.query("update security_permission_definition set status='active' where permission_key=$1", [key]);
    expect((await access(superPolicy)).listed).toContain(key);
  });

  it("leaves row-level security on the tenant registry forced", async () => {
    const result = await pool.query<{ forced: boolean }>(
      "select relforcerowsecurity as forced from pg_class where oid='public.tenant'::regclass",
    );
    expect(result.rows[0]?.forced).toBe(true);
  });
});
