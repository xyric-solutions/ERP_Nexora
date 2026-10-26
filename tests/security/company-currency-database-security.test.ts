import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import { createDisposableSourceDatabase } from "./disposable-source-database.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("Company currency database security controls", () => {
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

  it("forces company RLS on profiles, activations, and immutable event history", async () => {
    const expected = ["company_currency", "company_currency_event", "company_currency_profile"];
    const relations = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname,relrowsecurity,relforcerowsecurity from pg_class
        where relname=any($1::text[]) order by relname`,
      [expected],
    );
    expect(relations.rows.map((row) => row.relname)).toEqual(expected);
    expect(relations.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  it("keeps reference data, company identity, rate facts, and events immutable", async () => {
    const triggers = await pool.query<{ table_name: string; trigger_name: string }>(
      `select class.relname as table_name,trigger.tgname as trigger_name
         from pg_trigger trigger join pg_class class on class.oid=trigger.tgrelid
        where class.relname=any($1::text[]) and not trigger.tgisinternal
        order by class.relname,trigger.tgname`,
      [
        [
          "company_currency",
          "company_currency_event",
          "company_currency_profile",
          "country_currency_catalog",
          "currency_rate",
        ],
      ],
    );
    expect(triggers.rows).toEqual(
      expect.arrayContaining([
        { table_name: "company_currency", trigger_name: "company_currency_guard" },
        { table_name: "company_currency_event", trigger_name: "company_currency_event_immutable" },
        { table_name: "company_currency_profile", trigger_name: "company_currency_profile_guard" },
        { table_name: "country_currency_catalog", trigger_name: "country_currency_catalog_immutable" },
        { table_name: "currency_rate", trigger_name: "currency_rate_revision_guard" },
      ]),
    );
    const rateGuard = await pool.query<{ source: string }>(
      "select pg_get_functiondef(oid) as source from pg_proc where proname='guard_currency_rate_revision'",
    );
    expect(rateGuard.rows[0]?.source).toContain("Company rates must target the company base currency");
    expect(rateGuard.rows[0]?.source).toContain("same-company superseded revision");
  });

  it("enforces one company base activation and one current dated company rate revision", async () => {
    const indexes = await pool.query<{ index_name: string }>(
      `select indexname as index_name from pg_indexes
        where schemaname='public' and indexname=any($1::text[]) order by indexname`,
      [["company_currency_one_base", "currency_rate_company_one_current_revision"]],
    );
    expect(indexes.rows.map((row) => row.index_name)).toEqual([
      "company_currency_one_base",
      "currency_rate_company_one_current_revision",
    ]);
  });

  it("registers company currency permissions without assigning authority", async () => {
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
    const grants = await pool.query<{ count: string }>(
      `select count(*)::text from security_role_permission_grant
        where permission_key like 'finance.company_currency%'`,
    );
    expect(grants.rows[0]?.count).toBe("0");
  });
});
