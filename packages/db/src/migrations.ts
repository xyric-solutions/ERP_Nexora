import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type pg from "pg";

const lockId = 4_894_133_721;
const migrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));

export async function migrate(pool: pg.Pool, directory = migrationsDirectory): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [lockId]);
    await client.query(`create table if not exists nexora_migration (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )`);
    const files = (await readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
    for (const file of files) {
      const sql = await readFile(resolve(directory, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const applied = await client.query<{ checksum: string }>(
        "select checksum from nexora_migration where name = $1",
        [file],
      );
      if (applied.rowCount) {
        if (applied.rows[0]?.checksum !== checksum) throw new Error(`Applied migration changed: ${file}`);
        continue;
      }
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into nexora_migration (name, checksum) values ($1, $2)", [file, checksum]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [lockId]).catch(() => undefined);
    client.release();
  }
}
