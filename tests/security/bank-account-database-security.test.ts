import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("Banking database security controls", () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await migrateSourceSchema(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("forces tenant RLS on bank accounts and immutable lifecycle evidence", async () => {
    const relations = await pool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname,relrowsecurity,relforcerowsecurity
         from pg_class
        where oid=any(array['bank_account'::regclass,'bank_account_event'::regclass])
        order by relname`,
    );
    expect(relations.rows).toEqual([
      { relname: "bank_account", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "bank_account_event", relrowsecurity: true, relforcerowsecurity: true },
    ]);

    const controls = await pool.query<{ trigger_name: string }>(
      `select tgname as trigger_name from pg_trigger
        where tgrelid=any(array['bank_account'::regclass,'bank_account_event'::regclass])
          and not tgisinternal order by tgname`,
    );
    expect(controls.rows.map((row) => row.trigger_name)).toEqual(
      expect.arrayContaining(["bank_account_event_immutable", "bank_account_transition_guard"]),
    );
  });

  it("enforces unique protected identifiers and one bank account per company ledger", async () => {
    const indexes = await pool.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where schemaname='public' and tablename='bank_account'
        order by indexname`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "uq_bank_account_number_hash",
        "uq_bank_account_iban_hash",
        "uq_bank_account_company_ledger_mapping",
      ]),
    );
  });
});
