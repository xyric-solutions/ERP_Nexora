import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  backfillUserCompanyAccess,
  readUserCompanyAccessShadowParity,
} from "../../packages/db/src/user-company-access-backfill.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/pool.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("user company-access compatibility backfill", () => {
  const suffix = randomUUID();
  const tenantId = `company-access-${suffix}`;
  const administratorId = `company-access-admin-${suffix}`;
  const targetId = `company-access-target-${suffix}`;
  const unmappedId = `company-access-unmapped-${suffix}`;
  const companyId = `company-access-company-${suffix}`;
  const roleId = `company-access-role-${suffix}`;
  const policyId = `company-access-policy-${suffix}`;
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await migrateSourceSchema(pool);
    await pool.query(
      `insert into tenant (id,name,plan,region,status,default_locale)
       values ($1,'Company Access Backfill Test','enterprise','test','active','en-US')`,
      [tenantId],
    );
    await pool.query(
      `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
       values ($1,$2,null,'company',$3,'Backfill Test Company','active')`,
      [companyId, tenantId, `CAB-${suffix.slice(0, 8)}`],
    );
    for (const userId of [administratorId, targetId, unmappedId]) {
      await pool.query(
        `insert into security_user_account
          (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at)
         values ($1,$2,$3,$4,'active','disabled',now(),now())`,
        [userId, tenantId, `test:${userId}`, `${userId}@uat.nexora.invalid`],
      );
    }
    await pool.query(
      `insert into security_tenant_role
        (tenant_id,role_id,role_code,display_name,description,lifecycle_state,
         source_kind,source_reference)
       values ($1,$2,$3,'Backfill Test Role','Compatibility backfill test role',
               'active','legacy_backfill',$4)`,
      [tenantId, roleId, `cab_${suffix.replaceAll("-", "").slice(0, 20)}`, `test:${policyId}`],
    );
    await pool.query(
      `insert into security_role_policy
        (id,tenant_id,role,scope,permissions,field_rules,sod_rules,version,status,
         created_at,role_id,lifecycle_state)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,1,'active',now(),$8,'active')`,
      [
        policyId,
        tenantId,
        `cab_${suffix.replaceAll("-", "").slice(0, 20)}`,
        JSON.stringify({ mode: "tenant" }),
        JSON.stringify(["security.authorization.permission.read"]),
        JSON.stringify({ allow: null, deny: [] }),
        JSON.stringify({ conflicting_roles: [], distinct_actor_fields: [] }),
        roleId,
      ],
    );
    await pool.query(
      `insert into security_role_permission_grant
        (tenant_id,role_policy_id,permission_key,field_allow_mode)
       values ($1,$2,'security.authorization.permission.read','all')`,
      [tenantId, policyId],
    );
    await pool.query(
      `insert into security_role_scope_grant
        (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
       values ($1,$2,'security.authorization.permission.read','tenant',$1)`,
      [tenantId, policyId],
    );
    await pool.query(
      `insert into security_user_role_assignment
        (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,
         lifecycle_state,valid_from)
       values ($1,$2,$3,$4,now(),$5,'active',now())`,
      [tenantId, targetId, policyId, administratorId, `company-access-assignment-${suffix}`],
    );
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("is deterministic, idempotent, traceable, and preserves source authority", async () => {
    const sourceBefore = await pool.query<{
      tenant_id: string;
      user_id: string;
      role_policy_id: string;
      assigned_by: string;
    }>(
      `select tenant_id,user_id,role_policy_id,assigned_by
         from security_user_role_assignment
        where tenant_id=$1 order by user_id,role_policy_id`,
      [tenantId],
    );

    const first = await backfillUserCompanyAccess(pool);
    expect(first.examinedUsers).toBeGreaterThanOrEqual(3);
    expect(first.inserted).toBeGreaterThanOrEqual(1);
    expect(first.updated).toBe(0);

    const access = await pool.query<{
      user_id: string;
      company_id: string;
      is_default: boolean;
      granted_by: string;
      source_kind: string;
      source_reference: string;
    }>(
      `select user_id,company_id,is_default,granted_by,source_kind,source_reference
         from security_user_company_access
        where tenant_id=$1 and user_id=$2 and revoked_at is null`,
      [tenantId, targetId],
    );
    expect(access.rows).toEqual([
      {
        user_id: targetId,
        company_id: companyId,
        is_default: true,
        granted_by: administratorId,
        source_kind: "compatibility_backfill",
        source_reference: "normalized-role-scope:v1",
      },
    ]);

    const second = await backfillUserCompanyAccess(pool);
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBeGreaterThanOrEqual(1);

    const sourceAfter = await pool.query<{
      tenant_id: string;
      user_id: string;
      role_policy_id: string;
      assigned_by: string;
    }>(
      `select tenant_id,user_id,role_policy_id,assigned_by
         from security_user_role_assignment
        where tenant_id=$1 order by user_id,role_policy_id`,
      [tenantId],
    );
    expect(sourceAfter.rows).toEqual(sourceBefore.rows);

    const shadow = await readUserCompanyAccessShadowParity(pool);
    expect(shadow.mismatches.filter((row) => row.tenantId === tenantId && row.userId === targetId)).toEqual([]);
  });

  it("restores forced row-level security after mutation and shadow reads", async () => {
    const rls = await pool.query<{ relname: string; relforcerowsecurity: boolean }>(
      `select relname,relforcerowsecurity
         from pg_class
        where oid=any(array[
          'security_user_account'::regclass,
          'security_user_role_assignment'::regclass,
          'security_role_policy'::regclass,
          'security_role_scope_grant'::regclass,
          'security_user_company_access'::regclass,
          'employee_user_binding'::regclass,
          'employee_assignment'::regclass,
          'organization_unit'::regclass
        ])
        order by relname`,
    );
    expect(rls.rows).toHaveLength(8);
    expect(rls.rows.every((row) => row.relforcerowsecurity)).toBe(true);
  });
});
