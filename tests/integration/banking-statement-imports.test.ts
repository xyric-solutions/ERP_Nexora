import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";

const databaseUrl = process.env.TEST_SOURCE_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

const statementRelations = [
  "bank_statement_mapping_profile",
  "bank_statement_mapping_profile_event",
  "bank_statement_import",
  "bank_statement_line",
  "bank_statement_import_event",
] as const;

run("Bank Statement Import database baseline", () => {
  let pool: DatabasePool;

  beforeAll(() => {
    pool = createDatabasePool(databaseUrl!);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("has the approved company-scoped statement import relations", async () => {
    const result = await pool.query<{ relation_name: string; relation: string | null }>(
      `select relation_name, to_regclass('public.' || relation_name)::text as relation
         from unnest($1::text[]) relation_name
        order by relation_name`,
      [statementRelations],
    );

    expect(result.rows.filter((row) => row.relation === null).map((row) => row.relation_name)).toEqual([]);
  });
});
