import { randomUUID } from "node:crypto";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";

const databaseNamePattern = /^fxr_security_[a-f0-9]{24}$/;

export async function createDisposableSourceDatabase(bootstrapUrl: string): Promise<{
  pool: DatabasePool;
  close(): Promise<void>;
}> {
  const databaseName = `fxr_security_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  if (!databaseNamePattern.test(databaseName)) throw new Error("Refusing an invalid disposable database name.");

  const bootstrap = createDatabasePool(bootstrapUrl);
  const isolatedUrl = new URL(bootstrapUrl);
  isolatedUrl.pathname = `/${databaseName}`;
  let pool: DatabasePool | undefined;
  try {
    await bootstrap.query(`create database ${databaseName}`);
    pool = createDatabasePool(isolatedUrl.toString());
  } catch (error) {
    await bootstrap.end();
    throw error;
  }

  return {
    pool,
    async close() {
      await pool?.end();
      await bootstrap.query(`drop database if exists ${databaseName}`);
      await bootstrap.end();
    },
  };
}
