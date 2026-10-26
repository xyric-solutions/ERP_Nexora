import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import {
  ensureSourceAuthorizationFixture,
  sourceTestCompanyId,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const bootstrapUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = bootstrapUrl ? describe : describe.skip;
const executeFile = promisify(execFile);
const databaseName = `reconciliation_provision_${randomUUID().replaceAll("-", "")}`;
const permissions = [
  "banking.statement_import.read",
  "banking.statement_import.create",
  "banking.statement_import.update",
  "banking.statement_import.finalize",
  "banking.statement_mapping.read",
  "banking.statement_mapping.manage",
  "banking.reconciliation.read",
  "banking.reconciliation.create",
  "banking.reconciliation.update",
  "banking.reconciliation.match",
  "banking.reconciliation.submit",
  "banking.reconciliation.approve",
  "banking.reconciliation_adjustment.read",
  "banking.reconciliation_adjustment.create",
  "banking.reconciliation_adjustment.update",
  "banking.reconciliation_adjustment.submit",
  "banking.reconciliation_adjustment.approve",
  "banking.reconciliation_adjustment.post",
  "banking.reconciliation_adjustment.reverse",
] as const;

run("Bank Reconciliation controlled UAT provisioning", () => {
  let bootstrap: DatabasePool;
  let pool: DatabasePool;
  let databaseUrl: string;

  beforeAll(async () => {
    expect(databaseName).toMatch(/^reconciliation_provision_[a-f0-9]{32}$/);
    bootstrap = createDatabasePool(bootstrapUrl!);
    await bootstrap.query(`create database ${databaseName}`);
    const target = new URL(bootstrapUrl!);
    target.pathname = `/${databaseName}`;
    databaseUrl = target.toString();
    pool = createDatabasePool(databaseUrl);
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);

    await pool.query(
      `insert into security_user_role_assignment
        (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from)
       values ($1,'r06.last-admin-a','r06-uat-policy-administrator','r06.last-admin-b',now(),
               'r06-fixture-assignment-second-admin','active',now())`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_user_role_assignment_version
        (tenant_id,assignment_id,version,user_id,role_policy_id,lifecycle_state,valid_from,
         assigned_by,source_kind,source_reference)
       select tenant_id,assignment_id,1,user_id,role_policy_id,lifecycle_state,valid_from,
              assigned_by,'legacy_backfill','controlled-test-fixture'
         from security_user_role_assignment
        where tenant_id=$1 and assignment_id='r06-fixture-assignment-second-admin'`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_user_account
        (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at,display_name)
       values ('user-shoaib-super-admin',$1,'local:user-shoaib-super-admin',
               'shoaib@uat.nexora.invalid','active','disabled',now(),now(),'Shoaib')`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_tenant_role
        (tenant_id,role_id,role_code,display_name,description,lifecycle_state,source_kind,source_reference)
       values ($1,'br12-global-super-admin-role','super_administrator','Super Administrator',
               'Controlled pre-existing override authority','active','legacy_backfill','controlled-test-fixture')`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_role_policy
        (id,tenant_id,role,scope,permissions,field_rules,sod_rules,version,status,created_at,
         role_id,lifecycle_state)
       values ('br12-global-super-admin-policy',$1,'super_administrator',
               jsonb_build_object('mode','tenant'),'["platform.approval.override"]'::jsonb,
               '{"allow":null,"deny":[]}'::jsonb,
               '{"conflicting_roles":[],"distinct_actor_fields":[]}'::jsonb,
               1,'active',now(),'br12-global-super-admin-role','active')`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_role_permission_grant
        (tenant_id,role_policy_id,permission_key,field_allow_mode)
       values ($1,'br12-global-super-admin-policy','platform.approval.override','all')`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_role_scope_grant
        (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
       values ($1,'br12-global-super-admin-policy','platform.approval.override','tenant',$1)`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_user_role_assignment
        (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from)
       values ($1,'user-shoaib-super-admin','br12-global-super-admin-policy','r06.last-admin-b',now(),
               'br12-global-super-admin-assignment','active',now())`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_user_role_assignment_version
        (tenant_id,assignment_id,version,user_id,role_policy_id,lifecycle_state,valid_from,
         assigned_by,source_kind,source_reference)
       select tenant_id,assignment_id,1,user_id,role_policy_id,lifecycle_state,valid_from,
              assigned_by,'legacy_backfill','controlled-test-fixture'
         from security_user_role_assignment
        where tenant_id=$1 and assignment_id='br12-global-super-admin-assignment'`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_user_company_access
        (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
       values ($1,'br12-shoaib-company-access','user-shoaib-super-admin',$2,true,
               'r06.last-admin-b','governed_administration','controlled-test-fixture')`,
      [sourceTestTenantId, sourceTestCompanyId],
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${databaseName}`);
      await bootstrap.end();
    }
  });

  it("creates one governed company overlay, preserves the global role, and is safe to rerun", async () => {
    const environment = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NEXORA_ENVIRONMENT: "uat",
      NEXORA_UAT_CONFIRM: sourceTestTenantId,
      NEXORA_BANK_RECONCILIATION_TENANT_ID: sourceTestTenantId,
      NEXORA_BANK_RECONCILIATION_COMPANY_ID: sourceTestCompanyId,
      NEXORA_BANK_RECONCILIATION_MAKER_USER_ID: "r06.last-admin-b",
      NEXORA_BANK_RECONCILIATION_CHECKER_USER_ID: "r06.last-admin-a",
      NEXORA_BANK_RECONCILIATION_SHOAIB_USER_ID: "user-shoaib-super-admin",
    };
    const command = ["node_modules/tsx/dist/cli.mjs", "scripts/provision-bank-reconciliation-uat.ts"];
    const first = await executeFile(process.execPath, command, {
      cwd: process.cwd(),
      env: environment,
      timeout: 120_000,
    });
    const firstAudit = await pool.query<{ count: number }>(
      "select count(*)::int as count from security_audit_event where tenant_id=$1",
      [sourceTestTenantId],
    );
    const second = await executeFile(process.execPath, command, {
      cwd: process.cwd(),
      env: environment,
      timeout: 120_000,
    });
    const secondAudit = await pool.query<{ count: number }>(
      "select count(*)::int as count from security_audit_event where tenant_id=$1",
      [sourceTestTenantId],
    );

    expect(JSON.parse(first.stdout)).toMatchObject({ created: true, permissionCount: permissions.length });
    expect(JSON.parse(second.stdout)).toMatchObject({ created: false, permissionCount: permissions.length });
    expect(secondAudit.rows[0]?.count).toBe(firstAudit.rows[0]?.count);
    expect(first.stdout).not.toContain(databaseUrl);
    expect(second.stdout).not.toContain(databaseUrl);

    const overlay = await pool.query<{
      policy_id: string;
      permissions: string[];
      scope: { mode: string; company_ids: string[] };
      lifecycle_state: string;
      status: string;
    }>(
      `select policy.id as policy_id,policy.permissions,policy.scope,policy.lifecycle_state,policy.status
         from security_role_policy policy
        where policy.tenant_id=$1 and policy.role='shoaib_bank_reconciliation_uat'`,
      [sourceTestTenantId],
    );
    expect(overlay.rows).toHaveLength(1);
    expect(overlay.rows[0]).toMatchObject({
      scope: { mode: "companies", company_ids: [sourceTestCompanyId] },
      lifecycle_state: "active",
      status: "active",
    });
    expect(overlay.rows[0]!.permissions.sort()).toEqual([...permissions].sort());

    const normalized = await pool.query<{ permission_key: string; scope_kind: string; scope_value: string }>(
      `select grant_row.permission_key,scope.scope_kind,scope.scope_value
         from security_role_permission_grant grant_row
         join security_role_scope_grant scope
           on scope.tenant_id=grant_row.tenant_id
          and scope.role_policy_id=grant_row.role_policy_id
          and scope.permission_key=grant_row.permission_key
        where grant_row.tenant_id=$1 and grant_row.role_policy_id=$2
        order by grant_row.permission_key`,
      [sourceTestTenantId, overlay.rows[0]!.policy_id],
    );
    expect(normalized.rows.map((row) => row.permission_key)).toEqual([...permissions].sort());
    expect(
      normalized.rows.every((row) => row.scope_kind === "company" && row.scope_value === sourceTestCompanyId),
    ).toBe(true);

    const authority = await pool.query<{
      assignment_count: number;
      assignment_version_count: number;
      bank_permission_count: number;
      override_allowed: boolean;
      global_permissions: string[];
      security_18: boolean;
      finance_29: boolean;
    }>(
      `select
         (select count(*)::int from security_user_role_assignment
           where tenant_id=$1 and user_id='user-shoaib-super-admin' and role_policy_id=$3
             and lifecycle_state='active') as assignment_count,
         (select count(*)::int from security_user_role_assignment_version version
           where version.tenant_id=$1 and version.user_id='user-shoaib-super-admin'
             and version.role_policy_id=$3) as assignment_version_count,
         (select count(*)::int from unnest($4::text[]) permission
           where bank_has_live_permission($1,$2,'user-shoaib-super-admin',permission)) as bank_permission_count,
         bank_has_live_permission(
           $1,$2,'user-shoaib-super-admin','platform.approval.override',true
         ) as override_allowed,
         (select permissions from security_role_policy
           where tenant_id=$1 and id='br12-global-super-admin-policy') as global_permissions,
         exists(select 1 from nexora_schema_migration where module_name='security' and version=18) as security_18,
         exists(select 1 from nexora_schema_migration where module_name='finance' and version=29) as finance_29`,
      [sourceTestTenantId, sourceTestCompanyId, overlay.rows[0]!.policy_id, permissions],
    );
    expect(authority.rows[0]).toEqual({
      assignment_count: 1,
      assignment_version_count: 1,
      bank_permission_count: permissions.length,
      override_allowed: true,
      global_permissions: ["platform.approval.override"],
      security_18: true,
      finance_29: true,
    });
  }, 180_000);
});
