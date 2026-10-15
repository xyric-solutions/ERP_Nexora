import { randomUUID } from "node:crypto";

import type pg from "pg";

import { withSpan } from "@nexora/observability";

import type { JobExecutionRepository } from "./jobs/sample.js";

export class PostgresJobExecutionRepository implements JobExecutionRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly queue = "nexora",
  ) {}

  async mark(
    jobKey: string,
    status: "active" | "completed" | "failed" | "dead-lettered",
    details: { attempts: number; correlationId: string; payload: unknown; errorCode?: string },
  ): Promise<void> {
    await withSpan(
      "db.job_execution.upsert",
      { kind: "client", attributes: { "db.system": "postgresql", "db.operation.name": "upsert" } },
      async () =>
        this.pool.query(
          `insert into job_execution (id, queue, job_key, status, attempts, correlation_id, payload, error_code)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (queue, job_key) do update set
         status = excluded.status,
         attempts = greatest(job_execution.attempts, excluded.attempts),
         correlation_id = excluded.correlation_id,
         payload = excluded.payload,
         error_code = excluded.error_code,
         updated_at = now()`,
          [
            randomUUID(),
            this.queue,
            jobKey,
            status,
            details.attempts,
            details.correlationId,
            details.payload,
            details.errorCode ?? null,
          ],
        ),
    );
  }
}
