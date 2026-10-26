import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import { createDisposableSourceDatabase } from "./disposable-source-database.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("Finance currency database security controls", () => {
  let pool: DatabasePool;
  let closeDatabase: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const database = await createDisposableSourceDatabase(databaseUrl!);
    pool = database.pool;
    closeDatabase = database.close;
    await migrateSourceSchema(pool);
  }, 60_000);

  afterAll(async () => {
    await closeDatabase?.();
  });

  it("forces tenant RLS and append-only currency evidence", async () => {
    const relations = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname,relrowsecurity,relforcerowsecurity from pg_class
        where oid=any(array['currency'::regclass,'currency_rate'::regclass,'currency_master_event'::regclass])
        order by relname`,
    );
    expect(relations.rows).toHaveLength(3);
    expect(relations.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const immutable = await pool.query<{ trigger_name: string }>(
      `select tgname as trigger_name from pg_trigger
        where tgrelid='currency_master_event'::regclass and not tgisinternal`,
    );
    expect(immutable.rows).toContainEqual({ trigger_name: "currency_master_event_immutable" });
  });

  it("serializes governed rate authority and exposes only explicit permissions", async () => {
    const controls = await pool.query<{ trigger_name: string; function_name: string }>(
      `select trigger.tgname as trigger_name,procedure.proname as function_name
         from pg_trigger trigger join pg_proc procedure on procedure.oid=trigger.tgfoid
        where trigger.tgrelid='currency_rate'::regclass
          and trigger.tgname='currency_rate_authority_lock' and not trigger.tgisinternal`,
    );
    expect(controls.rows).toEqual([
      { trigger_name: "currency_rate_authority_lock", function_name: "lock_currency_rate_authority" },
    ]);
    const permissions = await pool.query<{ key: string }>(
      `select permission_key as key from security_permission_definition
        where permission_key like 'platform.currency%'
           or permission_key='finance.transfer_fx_policy.manage'
        order by permission_key`,
    );
    expect(permissions.rows.map((row) => row.key)).toEqual([
      "finance.transfer_fx_policy.manage",
      "platform.currency.create",
      "platform.currency.manage",
      "platform.currency.read",
      "platform.currency_rate.create",
      "platform.currency_rate.manage",
      "platform.currency_rate.read",
    ]);
  });

  it("forces company isolation and immutable country/currency evidence", async () => {
    const relations = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname,relrowsecurity,relforcerowsecurity from pg_class
        where oid=any(array[
          'company_currency_profile'::regclass,
          'company_currency'::regclass,
          'company_currency_event'::regclass
        ]) order by relname`,
    );
    expect(relations.rows).toHaveLength(3);
    expect(relations.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);

    const catalog = await pool.query<{ mapping_count: string; immutable: boolean }>(
      `select count(*)::text as mapping_count,
              exists(
                select 1 from pg_trigger
                 where tgrelid='country_currency_catalog'::regclass
                   and tgname='country_currency_catalog_immutable'
                   and not tgisinternal
              ) as immutable
         from country_currency_catalog`,
    );
    expect(Number(catalog.rows[0]?.mapping_count)).toBeGreaterThanOrEqual(240);
    expect(catalog.rows[0]?.immutable).toBe(true);

    const rateAuthority = await pool.query<{ company_column: boolean; company_unique: boolean }>(
      `select
         exists(select 1 from information_schema.columns
                 where table_schema='public' and table_name='currency_rate' and column_name='company_id')
           as company_column,
         to_regclass('public.currency_rate_company_one_current_revision') is not null as company_unique`,
    );
    expect(rateAuthority.rows).toEqual([{ company_column: true, company_unique: true }]);
  });

  it("exposes exact company currency permissions without implicit grants", async () => {
    const permissions = await pool.query<{ key: string }>(
      `select permission_key as key from security_permission_definition
        where permission_key like 'finance.company_currency%'
        order by permission_key`,
    );
    expect(permissions.rows.map((row) => row.key)).toEqual([
      "finance.company_currency.manage",
      "finance.company_currency.read",
      "finance.company_currency_profile.manage",
      "finance.company_currency_profile.read",
      "finance.company_currency_rate.manage",
      "finance.company_currency_rate.read",
    ]);
  });
});
