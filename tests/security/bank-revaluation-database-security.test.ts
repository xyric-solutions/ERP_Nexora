import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import { createDisposableSourceDatabase } from "./disposable-source-database.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("Bank Revaluation database security controls", () => {
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

  it("forces company RLS across policy, lifecycle, evidence and reversal tables", async () => {
    const expected = [
      "bank_revaluation",
      "bank_revaluation_event",
      "bank_revaluation_line",
      "bank_revaluation_policy",
      "bank_revaluation_policy_event",
      "bank_revaluation_reversal_schedule",
      "bank_revaluation_sequence",
    ];
    const relations = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname,relrowsecurity,relforcerowsecurity from pg_class
        where relname=any($1::text[]) order by relname`,
      [expected],
    );
    expect(relations.rows.map((row) => row.relname)).toEqual([...expected].sort());
    expect(relations.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  it("keeps lifecycle evidence immutable and protects maker-checker transitions", async () => {
    const triggers = await pool.query<{ table_name: string; trigger_name: string }>(
      `select class.relname as table_name,trigger.tgname as trigger_name
         from pg_trigger trigger
         join pg_class class on class.oid=trigger.tgrelid
        where class.relname=any($1::text[]) and not trigger.tgisinternal
        order by class.relname,trigger.tgname`,
      [["bank_revaluation", "bank_revaluation_event", "bank_revaluation_policy_event"]],
    );
    expect(triggers.rows).toContainEqual({ table_name: "bank_revaluation", trigger_name: "bank_revaluation_guard" });
    expect(triggers.rows).toContainEqual({
      table_name: "bank_revaluation_event",
      trigger_name: "bank_revaluation_event_immutable",
    });
    expect(triggers.rows).toContainEqual({
      table_name: "bank_revaluation_policy_event",
      trigger_name: "bank_revaluation_policy_event_immutable",
    });

    const guard = await pool.query<{ source: string }>(
      `select pg_get_functiondef(oid) as source from pg_proc where proname='guard_bank_revaluation'`,
    );
    expect(guard.rows[0]?.source).toContain("NEW.decided_by=NEW.maker_user_id");
    expect(guard.rows[0]?.source).toContain("NEW.super_admin_override_used");
  });

  it("prevents duplicate financial effects and reversal schedules", async () => {
    const indexes = await pool.query<{ index_name: string }>(
      `select indexname as index_name from pg_indexes
        where schemaname='public' and indexname=any($1::text[])
        order by indexname`,
      [
        [
          "bank_revaluation_one_active_run",
          "bank_revaluation_one_reversal_journal",
          "bank_revaluation_one_source_journal",
          "bank_revaluation_reversal_one_journal",
        ],
      ],
    );
    expect(indexes.rows.map((row) => row.index_name)).toEqual([
      "bank_revaluation_one_active_run",
      "bank_revaluation_one_reversal_journal",
      "bank_revaluation_one_source_journal",
      "bank_revaluation_reversal_one_journal",
    ]);
  });

  it("registers exact policy and lifecycle permissions without assigning them", async () => {
    const permissions = await pool.query<{ key: string }>(
      `select permission_key as key from security_permission_definition
        where permission_key like 'banking.revaluation%'
        order by permission_key`,
    );
    expect(permissions.rows.map((row) => row.key)).toEqual([
      "banking.revaluation.approve",
      "banking.revaluation.create",
      "banking.revaluation.post",
      "banking.revaluation.read",
      "banking.revaluation.reverse",
      "banking.revaluation.submit",
      "banking.revaluation.update",
      "banking.revaluation_policy.manage",
      "banking.revaluation_policy.read",
    ]);
  });
});
