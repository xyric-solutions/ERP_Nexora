import { createDatabasePool } from "./pool.js";
import { backfillUserCompanyAccess, readUserCompanyAccessShadowParity } from "./user-company-access-backfill.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = createDatabasePool(databaseUrl);
try {
  const backfill = await backfillUserCompanyAccess(pool);
  const shadow = await readUserCompanyAccessShadowParity(pool);
  process.stdout.write(`${JSON.stringify({ backfill, shadow })}\n`);
  if (shadow.mismatches.length > 0) process.exitCode = 2;
} finally {
  await pool.end();
}
