import { Redis } from "ioredis";

import { checkDatabase, createDatabasePool } from "@nexora/db";
import { createLogger } from "@nexora/observability";

import { PostgresJobExecutionRepository } from "./job-repository.js";
import { PostgresBankStatementCleanupRepository } from "./jobs/bank-statement-orphan-cleanup.js";
import { PostgresBankRevaluationReversalRepository } from "./jobs/bank-revaluation-reversal.js";
import { readBankRevaluationReversalConfig } from "./revaluation-config.js";
import { readRecurringJournalConfig } from "./recurring-journal-config.js";
import { PostgresRecurringJournalGenerationRepository } from "./jobs/recurring-journal-generation.js";
import { startCredentialEmailDelivery } from "./email/credential-delivery.js";
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
let revaluations = null;
if (revaluationConfig) {
  const repository = new PostgresBankRevaluationReversalRepository(pool);
  await repository.checkReady(revaluationConfig.actorId, revaluationConfig.tenantLimit);
  revaluations = { repository, ...revaluationConfig };
}
const recurringJournalConfig = readRecurringJournalConfig();
const runtime = createJobRuntime({
  connection: redis,
  repository: new PostgresJobExecutionRepository(pool),
  logger,
  cleanup: {
    storage,
    repository: new PostgresBankStatementCleanupRepository(pool),
    ...readBankStatementCleanupConfig(),
  },
  revaluations,
  ...(recurringJournalConfig
    ? {
        recurringJournals: {
          repository: new PostgresRecurringJournalGenerationRepository(pool),
          ...recurringJournalConfig,
        },
      }
    : {}),
});
await Promise.all([runtime.schedulerReady, runtime.worker.waitUntilReady()]);
const stopCredentialEmailDelivery = startCredentialEmailDelivery(pool, logger);
logger.info(
  {
    bankRevaluationReversalsEnabled: revaluations !== null,
    credentialEmailConfigured: stopCredentialEmailDelivery !== null,
  },
  "Worker ready",
);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "worker shutdown started");
  await Promise.all([runtime.close(), stopCredentialEmailDelivery?.()]);
  storage.close();
  await Promise.allSettled([redis.quit(), pool.end()]);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
