import { createHash } from "node:crypto";

import { Router } from "express";

import { sampleJobPayloadSchema, type JobReceipt, type SampleJobPayload } from "@nexora/contracts";
import { injectTrace, withSpan } from "@nexora/observability";

import { currentRequestContext } from "../../http/request-context.js";

export interface JobPublisher {
  publishSample(
    payload: SampleJobPayload,
    options: { jobId: string; correlationId: string; traceContext: Record<string, string> },
  ): Promise<void>;
}

export function createJobsRouter(publisher: JobPublisher): Router {
  const router = Router();
  router.post("/sample", async (req, res) => {
    const payload = sampleJobPayloadSchema.parse(req.body);
    const correlationId = currentRequestContext().correlationId;
    const jobId = createHash("sha256").update(`sample:${payload.requestId}`).digest("hex");
    await withSpan(
      "api.jobs.sample.enqueue",
      { kind: "producer", attributes: { "messaging.system": "bullmq", "messaging.message.id": jobId } },
      async () => publisher.publishSample(payload, { jobId, correlationId, traceContext: injectTrace({}) }),
    );
    const receipt: JobReceipt = { jobId, correlationId, status: "queued" };
    res.status(202).json(receipt);
  });
  return router;
}
