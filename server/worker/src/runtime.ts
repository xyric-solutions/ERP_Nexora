import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import type { Logger } from "pino";

import { withExtractedSpan } from "@nexora/observability";

import {
  BANK_STATEMENT_CLEANUP_JOB,
  processBankStatementOrphanCleanup,
  type BankStatementCleanupRepository,
  type BankStatementCleanupStorage,
} from "./jobs/bank-statement-orphan-cleanup.js";
import {
  BANK_REVALUATION_REVERSAL_JOB,
  processBankRevaluationReversals,
  type BankRevaluationReversalOptions,
  type BankRevaluationReversalRepository,
} from "./jobs/bank-revaluation-reversal.js";
import type { JobExecutionRepository, SampleJobData } from "./jobs/sample.js";
import { processSampleJob } from "./jobs/sample.js";

export async function processQueuedJob(
  job: Job<WorkerJobData>,
  repository: JobExecutionRepository,
  cleanup?: CleanupRuntimeOptions,
  revaluations?: RevaluationRuntimeOptions,
) {
  if (job.name === BANK_STATEMENT_CLEANUP_JOB) {
    if (!cleanup) throw new Error("Bank Statement cleanup dependencies are unavailable");
    const data = job.data as BankStatementCleanupJobData;
    return withExtractedSpan(
      "worker.jobs.bank_statement_orphan_cleanup.process",
      data.traceContext,
      {
        kind: "consumer",
        attributes: { "messaging.system": "bullmq", "messaging.message.id": job.id ?? BANK_STATEMENT_CLEANUP_JOB },
      },
      async () =>
        processBankStatementOrphanCleanup(
          {
            now: new Date(),
            orphanGraceMs: cleanup.orphanGraceMs,
            pageSize: cleanup.pageSize,
            maxObjects: cleanup.maxObjects,
          },
          cleanup,
        ),
    );
  }
  if (job.name === BANK_REVALUATION_REVERSAL_JOB) {
    if (!revaluations) throw new Error("Bank Revaluation reversal dependencies are unavailable");
    const data = job.data as BankRevaluationReversalJobData;
    return withExtractedSpan(
      "worker.jobs.bank_revaluation_reversal.process",
      data.traceContext,
      {
        kind: "consumer",
        attributes: { "messaging.system": "bullmq", "messaging.message.id": job.id ?? BANK_REVALUATION_REVERSAL_JOB },
      },
      async () =>
        processBankRevaluationReversals(
          {
            now: new Date(),
            workerId: revaluations.workerId,
            actorId: revaluations.actorId,
            tenantLimit: revaluations.tenantLimit,
            claimLimit: revaluations.claimLimit,
            claimLeaseMs: revaluations.claimLeaseMs,
            retryBaseMs: revaluations.retryBaseMs,
            retryMaximumMs: revaluations.retryMaximumMs,
          },
          revaluations.repository,
        ),
    );
  }
  if (job.name !== "sample") throw new Error(`Unsupported job type: ${job.name}`);
  const sampleJob = job as Job<SampleJobData>;
  return withExtractedSpan(
    "worker.jobs.sample.process",
    sampleJob.data.traceContext,
    {
      kind: "consumer",
      attributes: { "messaging.system": "bullmq", "messaging.message.id": sampleJob.id ?? sampleJob.data.requestId },
    },
    async () => processSampleJob(sampleJob, repository),
  );
}

type BankStatementCleanupJobData = { correlationId: string; traceContext: Record<string, string> };
type BankRevaluationReversalJobData = { correlationId: string; traceContext: Record<string, string> };
type WorkerJobData = SampleJobData | BankStatementCleanupJobData | BankRevaluationReversalJobData;

type CleanupRuntimeOptions = {
  storage: BankStatementCleanupStorage;
  repository: BankStatementCleanupRepository;
  orphanGraceMs: number;
  pageSize: number;
  maxObjects: number;
  everyMs: number;
};

type RevaluationRuntimeOptions = Omit<BankRevaluationReversalOptions, "now"> & {
  repository: BankRevaluationReversalRepository;
  everyMs: number;
};

export function createJobRuntime(options: {
  connection: ConnectionOptions;
  repository: JobExecutionRepository;
  logger: Logger;
  queueName?: string;
  cleanup?: CleanupRuntimeOptions;
  revaluations?: RevaluationRuntimeOptions;
}) {
  const queueName = options.queueName ?? "nexora";
  const queue = new Queue<WorkerJobData>(queueName, { connection: options.connection });
  const deadLetterQueue = new Queue(`${queueName}-dead-letter`, { connection: options.connection });
  const worker = new Worker<WorkerJobData>(
    queueName,
    async (job) => processQueuedJob(job, options.repository, options.cleanup, options.revaluations),
    {
      connection: options.connection,
      concurrency: 5,
      lockDuration: 30_000,
    },
  );

  const schedulerReady = Promise.all([
    options.cleanup
      ? queue.upsertJobScheduler(
          BANK_STATEMENT_CLEANUP_JOB,
          { every: options.cleanup.everyMs },
          {
            name: BANK_STATEMENT_CLEANUP_JOB,
            data: { correlationId: "scheduled-bank-statement-cleanup", traceContext: {} },
            opts: { attempts: 5, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: 100 },
          },
        )
      : Promise.resolve(),
    options.revaluations
      ? queue.upsertJobScheduler(
          BANK_REVALUATION_REVERSAL_JOB,
          { every: options.revaluations.everyMs },
          {
            name: BANK_REVALUATION_REVERSAL_JOB,
            data: { correlationId: "scheduled-bank-revaluation-reversal", traceContext: {} },
            opts: { attempts: 1, removeOnComplete: 100 },
          },
        )
      : Promise.resolve(),
  ]);

  worker.on("completed", (job) =>
    options.logger.info({ jobId: job.id, correlationId: job.data.correlationId }, "job completed"),
  );
  worker.on("failed", (job, error) => {
    if (!job) return;
    options.logger.error({ jobId: job.id, error, correlationId: job.data.correlationId }, "job failed");
    if (error.name === "UnrecoverableError") {
      const jobId = job.id ?? ("requestId" in job.data ? job.data.requestId : `${job.name}-${job.timestamp}`);
      void deadLetterQueue
        .add(job.name, job.data, { jobId, removeOnComplete: false })
        .then(async () => {
          await options.repository.mark(jobId, "dead-lettered", {
            attempts: job.attemptsMade,
            correlationId: job.data.correlationId,
            payload: job.data,
            errorCode: error.message,
          });
        })
        .catch((deadLetterError: unknown) =>
          options.logger.error({ deadLetterError, jobId: job.id }, "dead-letter write failed"),
        );
    }
  });

  return {
    worker,
    queue,
    deadLetterQueue,
    schedulerReady,
    async close() {
      await Promise.allSettled([worker.close(), queue.close(), deadLetterQueue.close()]);
    },
  };
}
