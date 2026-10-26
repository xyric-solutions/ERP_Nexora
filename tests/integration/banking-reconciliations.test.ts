import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";

const databaseUrl = process.env.TEST_SOURCE_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

const reconciliationRelations = [
  "bank_reconciliation",
  "bank_reconciliation_match",
  "bank_reconciliation_adjustment",
  "bank_reconciliation_adjustment_event",
  "bank_reconciliation_event",
] as const;

run("Bank Reconciliation database baseline", () => {
  let pool: DatabasePool;

  beforeAll(() => {
    pool = createDatabasePool(databaseUrl!);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("has the approved reconciliation, matching, adjustment and audit relations", async () => {
    const result = await pool.query<{ relation_name: string; relation: string | null }>(
      `select relation_name, to_regclass('public.' || relation_name)::text as relation
         from unnest($1::text[]) relation_name
        order by relation_name`,
      [reconciliationRelations],
    );

    expect(result.rows.filter((row) => row.relation === null).map((row) => row.relation_name)).toEqual([]);
  });
});
