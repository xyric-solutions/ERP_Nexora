import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool } from "../../packages/db/src/pool.js";
import { inspectSourceMigrationState, migrateSourceSchema } from "../../packages/db/src/source-migrations.js";

const databaseUrl = process.env.TEST_SOURCE_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_source_test";
const pool = createDatabasePool(databaseUrl);

describe("production PostgreSQL source migrations", () => {
  beforeAll(async () => {
    await migrateSourceSchema(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("is deterministic and idempotent", async () => {
    await expect(migrateSourceSchema(pool)).resolves.toEqual([]);
    await expect(inspectSourceMigrationState(pool)).resolves.toEqual({
      platform: 8,
      security: 15,
      workflow: 1,
      finance: 7,
      hr: 34,
      runtime: 1,
    });
  });

  it("creates the canonical production domains and operational runtime table", async () => {
    const expected = [
      "employee",
      "employee_assignment",
      "hr_employee_profile_version",
      "hr_payroll_period",
      "job_execution",
      "security_permission_definition",
      "security_login_identifier",
      "approval_override_event",
      "bank_payment",
      "bank_payment_event",
      "bank_payment_line",
      "bank_payment_sequence",
      "security_authentication_event",
      "security_tenant_role",
      "security_user_change_request",
      "security_user_company_access",
      "security_user_account",
      "tenant",
    ];
    const result = await pool.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public' and table_name = any($1::text[])
       order by table_name`,
      [expected],
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([...expected].sort());
  });

  it("records the complete source-ledger chain", async () => {
    const result = await pool.query<{ module_name: string; migration_count: string; latest: number }>(
      `select module_name, count(*)::text as migration_count, max(version) as latest
       from nexora_schema_migration
       group by module_name
       order by module_name`,
    );
    expect(result.rows).toEqual([
      { module_name: "finance", migration_count: "7", latest: 7 },
      { module_name: "hr", migration_count: "34", latest: 34 },
      { module_name: "platform", migration_count: "8", latest: 8 },
      { module_name: "runtime", migration_count: "1", latest: 1 },
      { module_name: "security", migration_count: "15", latest: 15 },
      { module_name: "workflow", migration_count: "1", latest: 1 },
    ]);
    const bankPaymentMigrations = await pool.query<{ module_name: string; version: number; name: string }>(
      `select module_name,version,name from nexora_schema_migration
        where (module_name='platform' and version=8)
           or (module_name='security' and version=15)
           or (module_name='finance' and version in (5,6,7))
        order by module_name,version`,
    );
    expect(bankPaymentMigrations.rows).toEqual([
      { module_name: "finance", version: 5, name: "finance_posting_bank_payments" },
      { module_name: "finance", version: 6, name: "currency_rate_authority_lock" },
      { module_name: "finance", version: 7, name: "bank_payment_posting_override" },
      { module_name: "platform", version: 8, name: "idempotency_patch_method" },
      { module_name: "security", version: 15, name: "approval_override_post_action" },
    ]);
  });

  it("enforces the Finance currency-rate authority lock at the database boundary", async () => {
    const result = await pool.query<{ trigger_name: string; function_name: string }>(
      `select trigger.tgname as trigger_name,procedure.proname as function_name
         from pg_trigger trigger
         join pg_proc procedure on procedure.oid=trigger.tgfoid
        where trigger.tgrelid='currency_rate'::regclass
          and trigger.tgname='currency_rate_authority_lock'
          and not trigger.tgisinternal`,
    );
    expect(result.rows).toEqual([
      { trigger_name: "currency_rate_authority_lock", function_name: "lock_currency_rate_authority" },
    ]);
    const functions = await pool.query<{ function_name: string }>(
      `select proname as function_name from pg_proc
        where proname in ('finance_currency_rate_lock_resource','finance_currency_rate_lock_key')
        order by proname`,
    );
    expect(functions.rows.map((row) => row.function_name)).toEqual([
      "finance_currency_rate_lock_key",
      "finance_currency_rate_lock_resource",
    ]);
  });

  it("accepts bounded hierarchical platform audit action names", async () => {
    const result = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid='platform_admin_audit_event'::regclass
          and conname='platform_admin_audit_event_action_check'`,
    );
    expect(result.rows[0]?.definition).toContain("{2,5}");
  });

  it("allows only POST and PATCH in the shared idempotency store", async () => {
    const result = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid='platform_admin_idempotency'::regclass
          and conname='platform_admin_idempotency_method_check'`,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.definition).toContain("'POST'::text");
    expect(result.rows[0]?.definition).toContain("'PATCH'::text");
    expect(result.rows[0]?.definition).not.toContain("'PUT'::text");
    expect(result.rows[0]?.definition).not.toContain("'DELETE'::text");

    const client = await pool.connect();
    const tenantId = "migration-idempotency-method-test";
    const insert = `insert into platform_admin_idempotency (
      tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,
      response_status,response_body,response_etag
    ) values ($1,'actor',$2,'/api/v1/test',$3,$4,200,'{}'::jsonb,'etag')`;
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [tenantId]);
      await client.query(
        `insert into tenant (id,name,plan,region,status,default_locale)
         values ($1,'Migration idempotency test','enterprise','test','active','en')`,
        [tenantId],
      );
      await expect(client.query(insert, [tenantId, "POST", "post-key", "a".repeat(64)])).resolves.toBeDefined();
      await expect(client.query(insert, [tenantId, "PATCH", "patch-key", "b".repeat(64)])).resolves.toBeDefined();

      await client.query("savepoint invalid_delete_method");
      await expect(client.query(insert, [tenantId, "DELETE", "delete-key", "c".repeat(64)])).rejects.toMatchObject({
        code: "23514",
      });
      await client.query("rollback to savepoint invalid_delete_method");
      await client.query("savepoint invalid_put_method");
      await expect(client.query(insert, [tenantId, "PUT", "put-key", "d".repeat(64)])).rejects.toMatchObject({
        code: "23514",
      });
      await client.query("rollback to savepoint invalid_put_method");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("forces row-level security on every tenant-owned production table", async () => {
    const result = await pool.query<{ missing_count: string }>(
      `select count(*)::text as missing_count
       from information_schema.columns c
       join pg_class t on t.relname = c.table_name
       join pg_namespace n on n.oid = t.relnamespace and n.nspname = c.table_schema
       where c.table_schema = 'public'
         and c.column_name = 'tenant_id'
         and t.relkind = 'r'
         and (not t.relrowsecurity or not t.relforcerowsecurity)`,
    );
    expect(result.rows[0]?.missing_count).toBe("0");
  });

  it("restricts cross-tenant login discovery to the hardened resolver", async () => {
    const functionSecurity = await pool.query<{
      security_definer: boolean;
      configuration: string[] | null;
      public_execute: boolean;
    }>(
      `select procedure.prosecdef as security_definer,
              procedure.proconfig as configuration,
              exists(
                select 1
                from aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) acl
                where acl.grantee=0 and acl.privilege_type='EXECUTE'
              ) as public_execute
       from pg_proc procedure
       where procedure.oid = 'resolve_security_login_candidates(text,text,integer)'::regprocedure`,
    );
    expect(functionSecurity.rows[0]).toMatchObject({ security_definer: true, public_execute: false });
    expect(functionSecurity.rows[0]?.configuration).toContain("search_path=pg_catalog, public");
    const tables = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname,relrowsecurity,relforcerowsecurity from pg_class
       where oid=any(array[
         'security_login_identifier'::regclass,
         'security_login_directory_state'::regclass,
         'security_authentication_event'::regclass
       ]) order by relname`,
    );
    expect(tables.rows).toHaveLength(3);
    expect(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const immutableTrigger = await pool.query<{ exists: boolean }>(
      `select exists(
         select 1 from pg_trigger
         where tgrelid='security_authentication_event'::regclass
           and tgname='security_authentication_event_immutable'
           and not tgisinternal
       ) as exists`,
    );
    expect(immutableTrigger.rows[0]?.exists).toBe(true);
  });

  it("seeds the exact normalized permission catalogue", async () => {
    const result = await pool.query<{ permission_count: string }>(
      "select count(*)::text as permission_count from security_permission_definition",
    );
    expect(result.rows[0]?.permission_count).toBe("253");
    const overridePermission = await pool.query<{ permission_key: string }>(
      `select permission_key from security_permission_definition
        where permission_key='platform.approval.override' and status='active'`,
    );
    expect(overridePermission.rows).toEqual([{ permission_key: "platform.approval.override" }]);
    const paymentPermissions = await pool.query<{ permission_key: string }>(
      `select permission_key from security_permission_definition
        where permission_key like 'banking.payment.%' and status='active'
        order by permission_key`,
    );
    expect(paymentPermissions.rows.map((row) => row.permission_key)).toEqual([
      "banking.payment.approve",
      "banking.payment.create",
      "banking.payment.post",
      "banking.payment.read",
      "banking.payment.reverse",
      "banking.payment.submit",
      "banking.payment.update",
    ]);
  });

  it("installs immutable tenant-scoped approval override evidence and nullable Security references", async () => {
    const relation = await pool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relrowsecurity,relforcerowsecurity from pg_class
        where oid='approval_override_event'::regclass`,
    );
    expect(relation.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const columns = await pool.query<{ table_name: string; column_name: string; is_nullable: string }>(
      `select table_name,column_name,is_nullable from information_schema.columns
        where table_schema='public'
          and table_name=any($1::text[])
          and column_name in ('approval_override_event_id','activation_override_event_id')
        order by table_name,column_name`,
      [
        [
          "security_role_approval_request",
          "security_assignment_approval_request",
          "security_user_change_request",
          "security_session_policy",
          "security_access_review_campaign",
          "security_delegation",
          "security_impersonation_request",
        ],
      ],
    );
    expect(columns.rows).toHaveLength(8);
    expect(columns.rows.every((row) => row.is_nullable === "YES")).toBe(true);
    expect(columns.rows).toContainEqual({
      table_name: "security_session_policy",
      column_name: "activation_override_event_id",
      is_nullable: "YES",
    });
  });

  it("installs governed user lifecycle and credential compatibility safeguards", async () => {
    const columns = await pool.query<{ column_name: string; is_nullable: string }>(
      `select column_name,is_nullable
       from information_schema.columns
       where table_schema='public'
         and table_name='security_user_account'
         and column_name=any($1::text[])
       order by column_name`,
      [["display_name", "session_version", "archived_by", "archived_at", "archive_reason"]],
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "archive_reason",
      "archived_at",
      "archived_by",
      "display_name",
      "session_version",
    ]);
    expect(columns.rows.find((row) => row.column_name === "session_version")?.is_nullable).toBe("NO");

    const credential = await pool.query<{ column_name: string; is_nullable: string }>(
      `select column_name,is_nullable
       from information_schema.columns
       where table_schema='public'
         and table_name='security_password_credential'
         and column_name=any($1::text[])
       order by column_name`,
      [["must_change_password", "password_version", "password_changed_at", "credential_status", "password_hash"]],
    );
    expect(credential.rows.find((row) => row.column_name === "password_hash")?.is_nullable).toBe("YES");
    expect(credential.rows.find((row) => row.column_name === "password_version")?.is_nullable).toBe("NO");

    const guards = await pool.query<{ trigger_name: string }>(
      `select tgname as trigger_name
       from pg_trigger
       where tgrelid=any(array[
         'security_user_change_request'::regclass,
         'security_user_company_access'::regclass
       ]) and not tgisinternal
       order by tgname`,
    );
    expect(guards.rows.map((row) => row.trigger_name)).toEqual([
      "security_user_change_override_guard",
      "security_user_change_request_guard",
      "security_user_company_access_guard",
    ]);
  });
});
