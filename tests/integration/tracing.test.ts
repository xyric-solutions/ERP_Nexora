import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";

import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import { PostgresJobExecutionRepository } from "../../apps/worker/src/job-repository.js";
import { processQueuedJob } from "../../apps/worker/src/runtime.js";
import { createDatabasePool } from "../../packages/db/src/pool.js";
import { migrate } from "../../packages/db/src/migrations.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_test";
const pool = createDatabasePool(databaseUrl);
const repository = new PostgresJobExecutionRepository(pool, `trace-test-${process.pid}`);
const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });

describe("distributed tracing", () => {
  beforeAll(async () => {
    provider.register();
    await migrate(pool);
  });

  afterAll(async () => {
    await provider.forceFlush();
    await provider.shutdown();
    await pool.end();
  });

  it("keeps API enqueue, worker processing, and PostgreSQL writes in one trace", async () => {
    const app = createApp({
      config: { allowedOrigins: new Set(["http://localhost:3000"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      jobPublisher: {
        async publishSample(payload, options) {
          await processQueuedJob(
            {
              id: options.jobId,
              name: "sample",
              attemptsMade: 0,
              data: {
                ...payload,
                correlationId: options.correlationId,
                traceContext: options.traceContext,
              },
            } as never,
            repository,
          );
        },
      },
    });

    const response = await request(app).post("/api/v1/jobs/sample").send({ requestId: randomUUID(), mode: "succeed" });
    expect(response.status).toBe(202);

    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    const named = ["api.jobs.sample.enqueue", "worker.jobs.sample.process", "db.job_execution.upsert"];
    for (const name of named) expect(spans.some((span) => span.name === name)).toBe(true);
    const traceIds = new Set(
      spans.filter((span) => named.includes(span.name)).map((span) => span.spanContext().traceId),
    );
    expect([...traceIds]).toHaveLength(1);
  });
});
