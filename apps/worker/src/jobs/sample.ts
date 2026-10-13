import { UnrecoverableError, type Job } from "bullmq";

import { sampleJobPayloadSchema, type SampleJobPayload } from "@nexora/contracts/jobs";

export interface JobExecutionRepository {
  mark(
    jobId: string,
    status: "active" | "completed" | "failed" | "dead-lettered",
    details: { attempts: number; correlationId: string; payload: unknown; errorCode?: string },
  ): Promise<void>;
}

export type SampleJobData = SampleJobPayload & { correlationId: string; traceContext: Record<string, string> };

export async function processSampleJob(
  job: Job<SampleJobData>,
  repository: JobExecutionRepository,
): Promise<{ processed: true }> {
  const payload = sampleJobPayloadSchema.parse(job.data);
  const details = { attempts: job.attemptsMade + 1, correlationId: job.data.correlationId, payload };
  await repository.mark(job.id ?? payload.requestId, "active", details);
  if (payload.mode === "terminal") {
    await repository.mark(job.id ?? payload.requestId, "failed", { ...details, errorCode: "TERMINAL_SAMPLE_FAILURE" });
    throw new UnrecoverableError("TERMINAL_SAMPLE_FAILURE");
  }
  if (payload.mode === "retry-once" && job.attemptsMade === 0) {
    await repository.mark(job.id ?? payload.requestId, "failed", { ...details, errorCode: "RETRYABLE_SAMPLE_FAILURE" });
    throw new Error("RETRYABLE_SAMPLE_FAILURE");
  }
  await repository.mark(job.id ?? payload.requestId, "completed", details);
  return { processed: true };
}
