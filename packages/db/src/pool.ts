import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema/index.js";

export function createDatabasePool(connectionString: string) {
  return new pg.Pool({ connectionString, max: 20, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}

export function createDatabase(pool: pg.Pool) {
  return drizzle(pool, { schema });
}

export async function checkDatabase(pool: pg.Pool): Promise<void> {
  await pool.query("select 1");
}

export type DatabasePool = pg.Pool;
export type Database = ReturnType<typeof createDatabase>;
