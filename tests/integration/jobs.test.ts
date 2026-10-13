import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";

import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresJobExecutionRepository } from "../../apps/worker/src/job-repository.js";
import { createJobRuntime } from "../../apps/worker/src/runtime.js";
import { createDatabasePool } from "../../packages/db/src/pool.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import { createLogger } from "../../packages/observability/src/index.js";
import { eventually } from "../../packages/testing/src/index.js";

const databaseUrl = process.env.TEST_SOURCE_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_source_test";
const redisUrl = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56380";
const queueName = `nexora-test-${process.pid}-${Date.now()}`;
const pool = createDatabasePool(databaseUrl);
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(queueName, { connection: redis });
const events = new QueueEvents(queueName, { connection: redis });
const repository = new PostgresJobExecutionRepository(pool, queueName);
const runtime = createJobRuntime({ connection: redis, repository, logger: createLogger(new PassThrough()), queueName });

describe("durable job processing", () => {
  beforeAll(async () => {
    await migrateSourceSchema(pool);
    await events.waitUntilReady();
    await runtime.worker.waitUntilReady();
  });

  afterAll(async () => {
    await runtime.close();
    await Promise.allSettled([events.close(), queue.obliterate({ force: true }), queue.close()]);
    await Promise.allSettled([redis.quit(), pool.end()]);
  });

  it("completes, retries once, and dead-letters terminal failure without duplicate records", async () => {
    const succeed = await queue.add(
      "sample",
      { requestId: randomUUID(), mode: "succeed", correlationId: "corr-success", traceContext: {} },
      { jobId: randomUUID(), attempts: 2 },
    );
    const retry = await queue.add(
      "sample",
      { requestId: randomUUID(), mode: "retry-once", correlationId: "corr-retry", traceContext: {} },
      { jobId: randomUUID(), attempts: 2, backoff: { type: "fixed", delay: 10 } },
    );
    const terminal = await queue.add(
      "sample",
      { requestId: randomUUID(), mode: "terminal", correlationId: "corr-terminal", traceContext: {} },
      { jobId: randomUUID(), attempts: 2 },
    );

    await expect(succeed.waitUntilFinished(events, 10_000)).resolves.toEqual({ processed: true });
    await expect(retry.waitUntilFinished(events, 10_000)).resolves.toEqual({ processed: true });
    await expect(terminal.waitUntilFinished(events, 10_000)).rejects.toThrow("TERMINAL_SAMPLE_FAILURE");

    await eventually(async () => {
      const result = await pool.query<{ job_key: string; status: string; attempts: string }>(
        "select job_key, status, attempts from job_execution where queue = $1",
        [queueName],
      );
      expect(result.rows).toHaveLength(3);
      expect(result.rows.find((row) => row.job_key === retry.id)).toMatchObject({ status: "completed", attempts: "2" });
      expect(result.rows.find((row) => row.job_key === terminal.id)).toMatchObject({ status: "dead-lettered" });
      expect(await runtime.deadLetterQueue.getJobCounts("waiting", "delayed", "completed", "failed")).toMatchObject({
        waiting: 1,
      });
    });
  });
});
