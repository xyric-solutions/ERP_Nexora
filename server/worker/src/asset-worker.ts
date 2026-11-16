import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { checkDatabase, createDatabasePool } from "@nexora/db";
import { createLogger } from "@nexora/observability";
import { AssetDraftPreparation } from "@nexora/api/asset-preparation";
import { PostgresJobExecutionRepository } from "./job-repository.js";
import { createWorkerObjectStorage } from "./storage-config.js";

// Dedicated opt-in runtime deliberately has no financial-posting job handlers.
if (process.env.ASSET_DRAFT_PREPARATION_ENABLED !== "true")
  throw new Error("Set ASSET_DRAFT_PREPARATION_ENABLED=true to run the draft-only asset scheduler.");
if (!process.env.DATABASE_URL || !process.env.REDIS_URL) throw new Error("DATABASE_URL and REDIS_URL are required.");
const logger = createLogger(),
  pool = createDatabasePool(process.env.DATABASE_URL),
  redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
await checkDatabase(pool);
const schema = await pool.query<{ available: boolean }>(
  "select to_regclass('public.job_execution') is not null and exists(select 1 from nexora_schema_migration where module_name='fixed_assets' and version=7) as available",
);
if (!schema.rows[0]?.available)
  throw new Error("Fixed Assets migration 0007 and the durable job runtime are required.");
await redis.ping();
const storage = createWorkerObjectStorage();
await storage.checkReady();
const queueName = "nexora-asset-drafts",
  queue = new Queue(queueName, { connection: redis }),
  ledger = new PostgresJobExecutionRepository(pool, queueName),
  preparation = new AssetDraftPreparation(
    pool,
    (error) => logger.error({ error }, "asset company preparation blocked"),
    storage,
  );
const worker = new Worker(
  queueName,
  async (job) => {
    if (job.name !== "prepare-asset-drafts") throw new Error("Unsupported asset scheduler job.");
    const correlationId = randomUUID(),
      details = { attempts: job.attemptsMade + 1, correlationId, payload: { type: "asset_draft_preparation" } };
    await ledger.mark(job.id!, "active", details);
    try {
      const result = await preparation.prepare();
      await ledger.mark(job.id!, "completed", { ...details, payload: result });
      logger.info(result, "asset draft preparation completed");
      return result;
    } catch (error) {
      await ledger.mark(job.id!, "failed", { ...details, errorCode: "ASSET_DRAFT_PREPARATION_FAILED" });
      throw error;
    }
  },
  { connection: redis, concurrency: 1, lockDuration: 60000 },
);
worker.on("error", (error) => logger.error({ error }, "asset draft worker error"));
await queue.upsertJobScheduler(
  "monthly-asset-draft-preparation",
  { every: 3600000 },
  {
    name: "prepare-asset-drafts",
    data: {},
    opts: { attempts: 3, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: 100, removeOnFail: 100 },
  },
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await worker.close();
  await queue.close();
  storage.close();
  await redis.quit();
  await pool.end();
}
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
