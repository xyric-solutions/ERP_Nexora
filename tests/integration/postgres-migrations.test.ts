import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";

import { createDatabasePool } from "../../packages/db/src/pool.js";
import {
  inspectSourceMigrationState,
  migrateSourceModule,
  migrateSourceSchema,
} from "../../packages/db/src/source-migrations.js";

const bootstrapDatabaseUrl =
  process.env.TEST_SOURCE_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_source_test";
const suiteDatabase = `migration_suite_${randomUUID().replaceAll("-", "")}`;
let suiteDatabaseUrl = "";
let bootstrap: ReturnType<typeof createDatabasePool>;
let pool: ReturnType<typeof createDatabasePool>;

describe("production PostgreSQL source migrations", () => {
  beforeAll(async () => {
    expect(suiteDatabase).toMatch(/^migration_suite_[a-f0-9]{32}$/);
    bootstrap = createDatabasePool(bootstrapDatabaseUrl);
    await bootstrap.query(`create database ${suiteDatabase}`);
    const isolatedUrl = new URL(bootstrapDatabaseUrl);
    isolatedUrl.pathname = `/${suiteDatabase}`;
    suiteDatabaseUrl = isolatedUrl.toString();
    pool = createDatabasePool(suiteDatabaseUrl);
    await migrateSourceSchema(pool);
  }, 60_000);
  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${suiteDatabase}`);
      await bootstrap.end();
    }
  });

  it("is deterministic and idempotent", async () => {
    await expect(migrateSourceSchema(pool)).resolves.toEqual([]);
    await expect(inspectSourceMigrationState(pool)).resolves.toEqual({
      platform: 11,
      security: 19,
      workflow: 1,
      master_data: 2,
      finance: 30,
      hr: 34,
      runtime: 1,
    });
  });

  it("migrates a fresh isolated database through Statement and Reconciliation authority", async () => {
    const database = `transfer_fresh_${randomUUID().replaceAll("-", "")}`;
    expect(database).toMatch(/^transfer_fresh_[a-f0-9]{32}$/);
    const freshUrl = new URL(suiteDatabaseUrl);
    freshUrl.pathname = `/${database}`;
    await pool.query(`create database ${database}`);
    const fresh = createDatabasePool(freshUrl.toString());
    try {
      await migrateSourceSchema(fresh);
      await expect(inspectSourceMigrationState(fresh)).resolves.toMatchObject({
        platform: 11,
        security: 19,
        finance: 30,
      });
      const columns = await fresh.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name='bank_transfer'
            and column_name in ('posting_date','value_date','delegated_decision_id')
          order by column_name`,
      );
      expect(columns.rows.map((row) => row.column_name)).toEqual([
        "delegated_decision_id",
        "posting_date",
        "value_date",
      ]);
      await expect(migrateSourceSchema(fresh)).resolves.toEqual([]);
    } finally {
      await fresh.end();
      await pool.query(`drop database ${database}`);
    }
  });

  it("upgrades Finance 27 to 28 without changing an existing Bank Account row", async () => {
    const database = `reconciliation_upgrade_${randomUUID().replaceAll("-", "")}`;
    expect(database).toMatch(/^reconciliation_upgrade_[a-f0-9]{32}$/);
    const upgradeUrl = new URL(suiteDatabaseUrl);
    upgradeUrl.pathname = `/${database}`;
    await pool.query(`create database ${database}`);
    const upgrade = createDatabasePool(upgradeUrl.toString());
    const tenantId = "br02-upgrade-tenant";
    const companyId = "br02-upgrade-company";
    const ledgerId = "br02-upgrade-ledger";
    const bankAccountId = "br02-upgrade-bank";
    try {
      for (const moduleName of ["platform", "security", "workflow", "master_data"] as const) {
        await migrateSourceModule(upgrade, moduleName);
      }
      await migrateSourceModule(upgrade, "finance", { throughVersion: 27 });
      await expect(inspectSourceMigrationState(upgrade)).resolves.toMatchObject({ finance: 27 });
      await upgrade.query(
        `insert into tenant (id,name,plan,region,status,default_locale)
         values ($1,'BR-02 upgrade tenant','enterprise','test','active','en')`,
        [tenantId],
      );
      await upgrade.query(
        `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
         values ($1,$2,null,'company','BR02-UPGRADE','BR-02 upgrade company','active')`,
        [companyId, tenantId],
      );
      await upgrade.query(
        `insert into currency (tenant_id,code,name,decimal_places,is_base,status)
         values ($1,'USD','US Dollar',2,true,'active')`,
        [tenantId],
      );
      for (const userId of ["br02.upgrade.maker", "br02.upgrade.checker"] as const) {
        await upgrade.query(
          `insert into security_user_account
            (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at)
           values ($1,$2,$3,$4,'active','disabled',now(),now())`,
          [userId, tenantId, `br02:${userId}`, `${userId}@example.invalid`],
        );
      }
      await upgrade.query(
        `insert into account
          (id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,
           manual_posting_allowed,is_system_account,reconciliation_required,created_at)
         values ($1,$2,$3,'BR02-BANK','BR-02 existing Bank Account','asset',false,'[]','active',
                 true,false,true,now())`,
        [ledgerId, tenantId, companyId],
      );
      await upgrade.query(
        `insert into bank_account
          (id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,
           account_name,account_type,account_number_masked,account_number_ciphertext,
           account_number_nonce,account_number_hash,encryption_key_version,overdraft_limit,
           row_version,created_by,submitted_by,submitted_at,submission_reason,approved_by,
           approved_at,decision_reason,updated_at)
         values ($1,$2,$3,$4,'Existing Upgrade Bank','USD','active',now(),'BR02-UPGRADE-BANK',
                 'Existing operating account','current','.... 0028',$5,$6,$7,'upgrade-test-v1',0,
                 1,'br02.upgrade.maker','br02.upgrade.maker',now(),'Pre-28 controlled record',
                 'br02.upgrade.checker',now(),'Pre-28 independent approval',now())`,
        [
          bankAccountId,
          tenantId,
          companyId,
          ledgerId,
          Buffer.alloc(24, 28),
          Buffer.alloc(12, 28),
          randomBytes(32).toString("hex"),
        ],
      );
      const before = await upgrade.query(
        `select id,company_id,account_id,bank_name,currency,status,row_version
           from bank_account where tenant_id=$1 and id=$2`,
        [tenantId, bankAccountId],
      );

      await migrateSourceModule(upgrade, "finance");

      await expect(inspectSourceMigrationState(upgrade)).resolves.toMatchObject({ finance: 30 });
      const after = await upgrade.query(
        `select id,company_id,account_id,bank_name,currency,status,row_version
           from bank_account where tenant_id=$1 and id=$2`,
        [tenantId, bankAccountId],
      );
      expect(after.rows).toEqual(before.rows);
    } finally {
      await upgrade.end();
      await pool.query(`drop database ${database}`);
    }
  }, 60_000);

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
      "bank_receipt",
      "bank_receipt_event",
      "bank_receipt_line",
      "bank_receipt_sequence",
      "bank_transfer",
      "bank_transfer_event",
      "bank_transfer_fx_policy",
      "bank_transfer_fx_policy_event",
      "bank_transfer_line",
      "bank_transfer_sequence",
      "bank_statement_mapping_profile",
      "bank_statement_mapping_profile_event",
      "bank_statement_import",
      "bank_statement_line",
      "bank_statement_import_event",
      "bank_reconciliation",
      "bank_reconciliation_ledger_line",
      "bank_reconciliation_match",
      "bank_reconciliation_adjustment",
      "bank_reconciliation_adjustment_event",
      "bank_reconciliation_event",
      "currency_catalog",
      "currency_master_event",
      "country_currency_catalog",
      "company_currency_profile",
      "company_currency",
      "company_currency_event",
      "bank_revaluation_policy",
      "bank_revaluation_policy_event",
      "bank_revaluation",
      "bank_revaluation_line",
      "bank_revaluation_event",
      "bank_revaluation_reversal_schedule",
      "finance_nominal_section_policy",
      "finance_nominal_event",
      "finance_general_nominal",
      "finance_general_nominal_policy",
      "finance_general_nominal_event",
      "finance_chart_template",
      "finance_chart_template_node",
      "finance_chart_template_event",
      "finance_chart_hierarchy_maintenance",
      "finance_chart_company_adoption",
      "finance_chart_company_node",
      "finance_chart_company_event",
      "finance_chart_bank_binding",
      "erp_project",
      "erp_location",
      "erp_reference_master_event",
      "bank_assignment_intervention",
      "bank_self_approval_grant_version",
      "bank_delegated_decision",
      "fiscal_calendar_event",
      "bank_approver_reassignment",
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
      { module_name: "finance", migration_count: "30", latest: 30 },
      { module_name: "hr", migration_count: "34", latest: 34 },
      { module_name: "master_data", migration_count: "2", latest: 2 },
      { module_name: "platform", migration_count: "11", latest: 11 },
      { module_name: "runtime", migration_count: "1", latest: 1 },
      { module_name: "security", migration_count: "19", latest: 19 },
      { module_name: "workflow", migration_count: "1", latest: 1 },
    ]);
    const bankingMigrations = await pool.query<{ module_name: string; version: number; name: string }>(
      `select module_name,version,name from nexora_schema_migration
        where (module_name='platform' and version in (8,10,11))
           or (module_name='security' and version in (15,17,18,19))
           or (module_name='finance' and version in (5,6,7,8,9,10,11,12,13,14,15,16,17,18,26,27,28,29,30))
        order by module_name,version`,
    );
    expect(bankingMigrations.rows).toEqual([
      { module_name: "finance", version: 5, name: "finance_posting_bank_payments" },
      { module_name: "finance", version: 6, name: "currency_rate_authority_lock" },
      { module_name: "finance", version: 7, name: "bank_payment_posting_override" },
      { module_name: "finance", version: 8, name: "finance_posting_bank_receipts" },
      { module_name: "finance", version: 9, name: "bank_nominal_master_data" },
      { module_name: "finance", version: 10, name: "bank_account_override_variable_fix" },
      { module_name: "finance", version: 11, name: "general_nominal_master" },
      { module_name: "finance", version: 12, name: "general_nominal_dependency_guards" },
      { module_name: "finance", version: 13, name: "central_chart_templates" },
      { module_name: "finance", version: 14, name: "chart_hierarchy_maintenance_evidence" },
      { module_name: "finance", version: 15, name: "company_chart_adoption" },
      { module_name: "finance", version: 16, name: "chart_adoption_validation_bounds" },
      { module_name: "finance", version: 17, name: "chart_validation_record_names" },
      { module_name: "finance", version: 18, name: "company_bank_definition_binding" },
      { module_name: "finance", version: 26, name: "bank_transfers_and_fx_policy" },
      { module_name: "finance", version: 27, name: "bank_transfer_date_columns" },
      { module_name: "finance", version: 28, name: "bank_statement_reconciliation" },
      { module_name: "finance", version: 29, name: "bank_reconciliation_manual_workflow" },
      { module_name: "finance", version: 30, name: "bank_fx_revaluation" },
      { module_name: "platform", version: 8, name: "idempotency_patch_method" },
      { module_name: "platform", version: 10, name: "currency_master_governance" },
      { module_name: "platform", version: 11, name: "company_currency_profiles" },
      { module_name: "security", version: 15, name: "approval_override_post_action" },
      { module_name: "security", version: 17, name: "bank_transfer_permissions" },
      { module_name: "security", version: 18, name: "bank_reconciliation_permissions" },
      { module_name: "security", version: 19, name: "bank_revaluation_permissions" },
    ]);
  });

  it("keeps Bank Transfer posting/value dates and the posting-date directory index", async () => {
    const columns = await pool.query<{ column_name: string; is_nullable: string }>(
      `select column_name,is_nullable
         from information_schema.columns
        where table_schema='public' and table_name='bank_transfer'
          and column_name in ('posting_date','value_date')
        order by column_name`,
    );
    expect(columns.rows).toEqual([
      { column_name: "posting_date", is_nullable: "NO" },
      { column_name: "value_date", is_nullable: "YES" },
    ]);
    const index = await pool.query<{ definition: string }>(
      `select pg_get_indexdef(indexrelid) as definition
         from pg_index
        where indexrelid='bank_transfer_directory'::regclass`,
    );
    expect(index.rows[0]?.definition).toContain("posting_date DESC");
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
    expect(result.rows[0]?.permission_count).toBe("322");
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
    const transferPermissions = await pool.query<{ permission_key: string }>(
      `select permission_key from security_permission_definition
        where permission_key like 'banking.transfer.%' and status='active'
        order by permission_key`,
    );
    expect(transferPermissions.rows.map((row) => row.permission_key)).toEqual([
      "banking.transfer.approve",
      "banking.transfer.create",
      "banking.transfer.post",
      "banking.transfer.read",
      "banking.transfer.reassign",
      "banking.transfer.reverse",
      "banking.transfer.submit",
      "banking.transfer.update",
    ]);
    const catalog = await pool.query<{ code: string }>("select code from currency_catalog order by code");
    expect(catalog.rows).toHaveLength(20);
    expect(catalog.rows).toContainEqual({ code: "PKR" });
    expect(catalog.rows).toContainEqual({ code: "USD" });
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
