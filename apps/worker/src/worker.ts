import { Redis } from "ioredis";

import { checkDatabase, createDatabasePool } from "@nexora/db";
import { createLogger } from "@nexora/observability";

import { PostgresJobExecutionRepository } from "./job-repository.js";
import { createJobRuntime } from "./runtime.js";

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) throw new Error("DATABASE_URL and REDIS_URL are required");

const logger = createLogger();
const pool = createDatabasePool(databaseUrl);
await checkDatabase(pool);
const schema = await pool.query<{ available: boolean }>(
  "select to_regclass('public.job_execution') is not null as available",
);
if (!schema.rows[0]?.available) throw new Error("The runtime migration for job_execution is required");
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
await redis.ping();
const runtime = createJobRuntime({ connection: redis, repository: new PostgresJobExecutionRepository(pool), logger });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "worker shutdown started");
  await runtime.close();
  await Promise.allSettled([redis.quit(), pool.end()]);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
