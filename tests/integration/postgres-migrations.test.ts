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
      platform: 7,
      security: 9,
      workflow: 1,
      finance: 1,
      hr: 31,
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
      { module_name: "finance", migration_count: "1", latest: 1 },
      { module_name: "hr", migration_count: "31", latest: 31 },
      { module_name: "platform", migration_count: "7", latest: 7 },
      { module_name: "runtime", migration_count: "1", latest: 1 },
      { module_name: "security", migration_count: "9", latest: 9 },
      { module_name: "workflow", migration_count: "1", latest: 1 },
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
    expect(result.rows[0]?.permission_count).toBe("214");
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
      "security_user_change_request_guard",
      "security_user_company_access_guard",
    ]);
  });
});
