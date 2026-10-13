import { createDatabasePool } from "./pool.js";
import { backfillLoginDirectory } from "./login-directory-backfill.js";

const databaseUrl = process.env.DATABASE_URL;
const loginDirectorySecret = process.env.AUTH_LOGIN_DIRECTORY_SECRET;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!loginDirectorySecret) throw new Error("AUTH_LOGIN_DIRECTORY_SECRET is required");

const pool = createDatabasePool(databaseUrl);
try {
  const result = await backfillLoginDirectory(pool, loginDirectorySecret);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await pool.end();
}
