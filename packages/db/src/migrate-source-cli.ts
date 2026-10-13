import { createDatabasePool } from "./pool.js";
import { inspectSourceMigrationState, migrateSourceSchema } from "./source-migrations.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = createDatabasePool(databaseUrl);
try {
  const changedModules = await migrateSourceSchema(pool);
  const versions = await inspectSourceMigrationState(pool);
  process.stdout.write(`${JSON.stringify({ changedModules, versions })}\n`);
} finally {
  await pool.end();
}
