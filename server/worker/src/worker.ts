import { Redis } from "ioredis";

import { checkDatabase, createDatabasePool } from "@nexora/db";
import { createLogger } from "@nexora/observability";

import { PostgresJobExecutionRepository } from "./job-repository.js";
import { PostgresBankStatementCleanupRepository } from "./jobs/bank-statement-orphan-cleanup.js";
import { PostgresBankRevaluationReversalRepository } from "./jobs/bank-revaluation-reversal.js";
import { readBankRevaluationReversalConfig } from "./revaluation-config.js";
import { createJobRuntime } from "./runtime.js";
import { createWorkerObjectStorage, readBankStatementCleanupConfig } from "./storage-config.js";

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
const storage = createWorkerObjectStorage();
await storage.checkReady();
const revaluationConfig = readBankRevaluationReversalConfig();
const revaluationRepository = new PostgresBankRevaluationReversalRepository(pool);
await revaluationRepository.checkReady(revaluationConfig.actorId, revaluationConfig.tenantLimit);
const runtime = createJobRuntime({
  connection: redis,
  repository: new PostgresJobExecutionRepository(pool),
  logger,
  cleanup: {
    storage,
    repository: new PostgresBankStatementCleanupRepository(pool),
    ...readBankStatementCleanupConfig(),
  },
  revaluations: {
    repository: revaluationRepository,
    ...revaluationConfig,
  },
});
await runtime.schedulerReady;

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "worker shutdown started");
  await runtime.close();
  storage.close();
  await Promise.allSettled([redis.quit(), pool.end()]);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
