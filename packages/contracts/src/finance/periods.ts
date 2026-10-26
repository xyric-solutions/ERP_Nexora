import { z } from "zod";
const id = z.string().trim().min(1).max(128);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const financialPeriodStatusSchema = z.enum(["open", "soft_close", "closed"]);
export function monthlyFiscalPeriods(start: string) {
  if (!z.iso.date().safeParse(start).success || !start.endsWith("-01"))
    throw new RangeError("Choose the first day of a month.");
  const year = Number(start.slice(0, 4)),
    month = Number(start.slice(5, 7)) - 1;
  if (year < 1900 || year > 2999 || (year === 2999 && month !== 0))
    throw new RangeError("Fiscal year must fit within 1900–2999.");
  return Array.from({ length: 12 }, (_, index) => ({
    period_number: index + 1,
    period_start: new Date(Date.UTC(year, month + index, 1)).toISOString().slice(0, 10),
    period_end: new Date(Date.UTC(year, month + index + 1, 0)).toISOString().slice(0, 10),
  }));
}
export const fiscalCalendarSchema = z.strictObject({
  id,
  company_id: id,
  year: z.number().int(),
  period_start: z.iso.date(),
  period_end: z.iso.date(),
  status: z.enum(["draft", "active", "closed"]),
  version,
});
export const financialPeriodSchema = z.strictObject({
  id,
  company_id: id,
  fiscal_calendar_id: id,
  period_number: z.number().int().min(1).max(12),
  period_start: z.iso.date(),
  period_end: z.iso.date(),
  status: financialPeriodStatusSchema,
  version,
});
export const fiscalCalendarQuerySchema = z.strictObject({
  company_id: id,
  after: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const fiscalCalendarDirectorySchema = z.strictObject({
  items: z.array(fiscalCalendarSchema).max(100),
  next_cursor: id.nullable(),
});
export const calendarEventSchema = z.strictObject({
  id,
  actor_id: id,
  action: z.string(),
  period_id: id.nullable(),
  before_status: z.string().nullable(),
  after_status: z.string(),
  reason: z.string().nullable(),
  occurred_at: z.iso.datetime({ offset: true }),
  correlation_id: id,
});
export const fiscalCalendarDetailSchema = z.strictObject({
  calendar: fiscalCalendarSchema,
  periods: z.array(financialPeriodSchema).max(12),
  history: z.array(calendarEventSchema).max(100),
  history_has_more: z.boolean(),
});
export const createFiscalCalendarSchema = z.strictObject({
  company_id: id,
  period_start: z.iso.date().refine((value) => {
    try {
      monthlyFiscalPeriods(value);
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid first-of-month fiscal-year start within 1900–2999."),
});
export const generateFiscalPeriodsSchema = z.strictObject({ company_id: id, expected_version: version });
export const changeFiscalPeriodsSchema = z
  .strictObject({
    company_id: id,
    periods: z
      .array(z.strictObject({ id, expected_version: version }))
      .min(1)
      .max(12),
    status: financialPeriodStatusSchema,
    reason: z.string().trim().min(3).max(500).optional(),
    confirm_locked_reopen: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.periods.map((p) => p.id)).size !== v.periods.length)
      ctx.addIssue({ code: "custom", message: "Duplicate periods are not permitted.", path: ["periods"] });
    if (v.status !== "soft_close" && !v.reason)
      ctx.addIssue({ code: "custom", message: "Opening or locking requires a reason.", path: ["reason"] });
  });
export type FiscalCalendar = z.infer<typeof fiscalCalendarSchema>;
export type FinancialPeriod = z.infer<typeof financialPeriodSchema>;
export type FiscalCalendarDetail = z.infer<typeof fiscalCalendarDetailSchema>;
export type FiscalCalendarQuery = z.infer<typeof fiscalCalendarQuerySchema>;
export type FiscalCalendarDirectory = z.infer<typeof fiscalCalendarDirectorySchema>;
export type CreateFiscalCalendar = z.infer<typeof createFiscalCalendarSchema>;
export type GenerateFiscalPeriods = z.infer<typeof generateFiscalPeriodsSchema>;
export type ChangeFiscalPeriods = z.infer<typeof changeFiscalPeriodsSchema>;
