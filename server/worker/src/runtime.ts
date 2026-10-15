import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { Logger } from "pino";

import { withExtractedSpan } from "@nexora/observability";

import type { JobExecutionRepository, SampleJobData } from "./jobs/sample.js";
import { processSampleJob } from "./jobs/sample.js";

export async function processQueuedJob(
  job: Parameters<typeof processSampleJob>[0],
  repository: JobExecutionRepository,
) {
  if (job.name !== "sample") throw new Error(`Unsupported job type: ${job.name}`);
  return withExtractedSpan(
    "worker.jobs.sample.process",
    job.data.traceContext,
    {
      kind: "consumer",
      attributes: { "messaging.system": "bullmq", "messaging.message.id": job.id ?? job.data.requestId },
    },
    async () => processSampleJob(job, repository),
  );
}

export function createJobRuntime(options: {
  connection: ConnectionOptions;
  repository: JobExecutionRepository;
  logger: Logger;
  queueName?: string;
}) {
  const queueName = options.queueName ?? "nexora";
  const deadLetterQueue = new Queue(`${queueName}-dead-letter`, { connection: options.connection });
  const worker = new Worker<SampleJobData>(queueName, async (job) => processQueuedJob(job, options.repository), {
    connection: options.connection,
    concurrency: 5,
    lockDuration: 30_000,
  });

  worker.on("completed", (job) =>
    options.logger.info({ jobId: job.id, correlationId: job.data.correlationId }, "job completed"),
  );
  worker.on("failed", (job, error) => {
    if (!job) return;
    options.logger.error({ jobId: job.id, error, correlationId: job.data.correlationId }, "job failed");
    if (error.name === "UnrecoverableError") {
      const jobId = job.id ?? job.data.requestId;
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
    deadLetterQueue,
    async close() {
      await Promise.allSettled([worker.close(), deadLetterQueue.close()]);
    },
  };
}
