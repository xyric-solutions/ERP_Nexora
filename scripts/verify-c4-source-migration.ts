import {
  createDatabasePool,
  inspectSourceMigrationState,
  migrateSourceSchema,
} from "../packages/db/src/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = createDatabasePool(databaseUrl);
try {
  const first = await migrateSourceSchema(pool);
  const second = await migrateSourceSchema(pool);
  const versions = await inspectSourceMigrationState(pool);
  const tables = await pool.query<{ count: number }>(
    "select count(*)::int as count from pg_tables where schemaname = 'public'",
  );
  process.stdout.write(`${JSON.stringify({ first, second, versions, tables: tables.rows[0]?.count ?? 0 })}\n`);
} finally {
  await pool.end();
}
