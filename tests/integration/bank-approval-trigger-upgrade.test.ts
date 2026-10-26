import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceModule } from "../../packages/db/src/source-migrations.js";

const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = url ? describe : describe.skip;
run("Bank approval trigger upgrade compatibility", () => {
  let pool: DatabasePool;
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await migrateSourceModule(pool, "finance");
  });
  afterAll(async () => {
    await pool?.end();
  });
  it("repairs a historical ambiguous trigger while preserving rejection of mismatched override evidence", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const definition = await client.query<{ body: string }>(
        "select pg_get_functiondef('validate_bank_account_approval_override()'::regprocedure) as body",
      );
      const historical = definition.rows[0]!.body.replaceAll("expected_decision_action", "decision_action");
      await client.query(historical);
      await client.query(`create temporary table bank_approval_upgrade_probe
        (tenant_id text,id text,status text,approved_by text,rejected_by text,approval_override_event_id text) on commit drop`);
      await client.query(`create trigger bank_approval_probe before insert on bank_approval_upgrade_probe
        for each row execute function validate_bank_account_approval_override()`);
      const probe =
        "insert into bank_approval_upgrade_probe values ('synthetic-tenant','synthetic-bank','active','synthetic-actor',null,'missing-override')";
      await client.query("savepoint historical_failure");
      await expect(client.query(probe)).rejects.toMatchObject({ code: "42702" });
      await client.query("rollback to savepoint historical_failure");
      const migration = await readFile(
        new URL(
          "../../packages/db/source-migrations/finance/0010_bank_account_override_variable_fix.forward.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await client.query(migration.slice(0, migration.indexOf("INSERT INTO nexora_schema_migration")));
      await client.query("savepoint missing_evidence");
      await expect(client.query(probe)).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint missing_evidence");
      await client.query(
        "insert into bank_approval_upgrade_probe values ('synthetic-tenant','synthetic-bank','pending_approval',null,null,null)",
      );
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});
