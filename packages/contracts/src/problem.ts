import { z } from "zod";

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string(),
  instance: z.string(),
  correlationId: z.string().min(1),
  code: z.string().min(1),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
