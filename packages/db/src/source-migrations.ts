import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type pg from "pg";

const sourceMigrationsRoot = fileURLToPath(new URL("../source-migrations/", import.meta.url));
const filePattern = /^(?<version>\d{4})_(?<name>[a-z0-9_]+?)(?:\.forward)?\.sql$/;
const sourceModuleOrder = ["platform", "security", "workflow", "finance", "hr", "runtime"] as const;

interface SourceMigration {
  version: number;
  name: string;
  sql: string;
}

async function loadSourceMigrations(moduleName: string): Promise<SourceMigration[]> {
  if (!/^[a-z][a-z0-9_]*$/.test(moduleName)) throw new Error("Invalid source migration module name");
  const directory = resolve(sourceMigrationsRoot, moduleName);
  const migrations: SourceMigration[] = [];
  const versions = new Set<number>();
  for (const file of (await readdir(directory)).sort()) {
    const match = filePattern.exec(file);
    if (!match?.groups) continue;
    const version = Number(match.groups.version);
    if (versions.has(version)) throw new Error(`Duplicate source migration version: ${moduleName} ${version}`);
    versions.add(version);
    migrations.push({
      version,
      name: match.groups.name ?? "",
      sql: await readFile(resolve(directory, file), "utf8"),
    });
  }
  return migrations;
}

async function sourceMigrationLedger(pool: pg.Pool | pg.PoolClient, moduleName: string): Promise<Map<number, string>> {
  const registry = await pool.query<{ exists: boolean }>(
    "select to_regclass('public.nexora_schema_migration') is not null as exists",
  );
  if (!registry.rows[0]?.exists) return new Map();
  const ledger = await pool.query<{ version: number; name: string }>(
    `select version, name
     from nexora_schema_migration
     where module_name = $1
     order by version`,
    [moduleName],
  );
  return new Map(ledger.rows.map((row) => [Number(row.version), row.name]));
}

export async function migrateSourceModule(pool: pg.Pool, moduleName: string): Promise<boolean> {
  const migrations = await loadSourceMigrations(moduleName);
  const client = await pool.connect();
  let changed = false;
  try {
    await client.query("select pg_advisory_lock(hashtextextended($1, 0))", [`nexora:source-migration:${moduleName}`]);
    const applied = await sourceMigrationLedger(client, moduleName);
    for (const migration of migrations) {
      const appliedName = applied.get(migration.version);
      if (appliedName) {
        if (appliedName !== migration.name) {
          throw new Error(
            `Source migration identity changed: ${moduleName} ${migration.version} (${appliedName} != ${migration.name})`,
          );
        }
        continue;
      }
      if (migration.version > 1 && !applied.has(migration.version - 1)) {
        throw new Error(`Source migration predecessor is missing: ${moduleName} ${migration.version - 1}`);
      }
      await client.query("begin");
      try {
        await client.query(migration.sql);
        const recorded = await client.query<{ name: string }>(
          `select name from nexora_schema_migration where module_name = $1 and version = $2`,
          [moduleName, migration.version],
        );
        if (recorded.rows[0]?.name !== migration.name) {
          throw new Error(`Source migration did not record its expected identity: ${moduleName} ${migration.version}`);
        }
        await client.query("commit");
        applied.set(migration.version, migration.name);
        changed = true;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client
      .query("select pg_advisory_unlock(hashtextextended($1, 0))", [`nexora:source-migration:${moduleName}`])
      .catch(() => undefined);
    client.release();
  }
  return changed;
}

export async function migrateSourceSchema(pool: pg.Pool): Promise<ReadonlyArray<string>> {
  const changed: string[] = [];
  for (const moduleName of sourceModuleOrder) {
    if (await migrateSourceModule(pool, moduleName)) changed.push(moduleName);
  }
  return changed;
}

export async function inspectSourceMigrationState(pool: pg.Pool): Promise<Record<string, number>> {
  const state: Record<string, number> = {};
  for (const moduleName of sourceModuleOrder) {
    const ledger = await sourceMigrationLedger(pool, moduleName);
    state[moduleName] = Math.max(0, ...ledger.keys());
  }
  return state;
}
