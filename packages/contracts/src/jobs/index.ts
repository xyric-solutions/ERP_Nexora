import { z } from "zod";

export const sampleJobPayloadSchema = z.object({
  requestId: z.string().uuid(),
  mode: z.enum(["succeed", "retry-once", "terminal"]),
});

export const jobReceiptSchema = z.object({
  jobId: z.string().min(1),
  status: z.enum(["queued", "active", "completed", "failed", "dead-lettered"]),
  correlationId: z.string().min(1),
});

export type SampleJobPayload = z.infer<typeof sampleJobPayloadSchema>;
export type JobReceipt = z.infer<typeof jobReceiptSchema>;
