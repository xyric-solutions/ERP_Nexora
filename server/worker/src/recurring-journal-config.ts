import { z } from "zod";

const schema = z.object({
  actorId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u),
  everyMs: z.number().int().min(60_000).max(86_400_000),
  tenantLimit: z.number().int().min(1).max(1_000),
  templateLimit: z.number().int().min(1).max(100),
});

export type RecurringJournalConfig = z.infer<typeof schema>;

export function readRecurringJournalConfig(): RecurringJournalConfig | null {
  const actorId = process.env.JOURNAL_RECURRING_ACTOR_ID?.trim();
  if (!actorId) return null;
  return schema.parse({
    actorId,
    everyMs: Number(process.env.JOURNAL_RECURRING_EVERY_MS ?? 3_600_000),
    tenantLimit: Number(process.env.JOURNAL_RECURRING_TENANT_LIMIT ?? 100),
    templateLimit: Number(process.env.JOURNAL_RECURRING_TEMPLATE_LIMIT ?? 25),
  });
}
