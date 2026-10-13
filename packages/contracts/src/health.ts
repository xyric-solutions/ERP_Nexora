import { z } from "zod";

export const healthStatusSchema = z.object({
  status: z.enum(["ok", "unavailable"]),
  service: z.string().min(1),
  version: z.string().min(1),
  timestamp: z.iso.datetime(),
  checks: z.record(z.string(), z.enum(["ok", "unavailable"])).optional(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
