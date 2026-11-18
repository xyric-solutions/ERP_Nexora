import { z } from "zod";

export const connectedReportIds = [
  "bank-account-activity-report",
  "bank-balance-report",
  "bank-reconciliation-report",
  "bank-unmatched-report",
  "cash-position-report",
  "purchase-requisition-report",
  "rfq-comparison-report",
  "purchase-order-detail-report",
  "purchase-receipt-report",
  "purchase-bill-detail-report",
  "purchase-price-variance-report",
  "three-way-match-report",
  "supplier-outstanding-report",
  "supplier-advance-report",
  "supplier-performance-report",
  "purchase-bank-movements",
] as const;
export const connectedReportQuerySchema = z
  .strictObject({
    company_id: z.string().min(1).max(128),
    report: z.enum(connectedReportIds),
    as_of: z.iso.date(),
    from: z.iso.date().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    bank_id: z.string().min(1).max(128).optional(),
    supplier_id: z.string().min(1).max(128).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
  })
  .refine((query) => !query.from || query.from <= query.as_of, {
    message: "From date must not exceed the as-of date.",
    path: ["from"],
  });
export const connectedReportSchema = z.strictObject({
  company_id: z.string(),
  report: z.enum(connectedReportIds),
  as_of: z.iso.date(),
  from: z.iso.date().nullable(),
  columns: z.array(
    z.strictObject({ key: z.string(), label: z.string(), kind: z.enum(["text", "amount", "quantity"]) }),
  ),
  rows: z.array(
    z.strictObject({
      id: z.string(),
      date: z.string(),
      code: z.string(),
      name: z.string(),
      currency: z.string(),
      source_module: z.string(),
      source_page: z.string(),
      source_id: z.string(),
      journal_id: z.string().nullable(),
      values: z.record(z.string(), z.string()),
    }),
  ),
  total_rows: z.number().int().nonnegative(),
  totals: z.array(
    z.strictObject({
      currency: z.string(),
      decimal_places: z.number().int(),
      values: z.record(z.string(), z.string()),
    }),
  ),
  notes: z.array(z.string()),
});
export type ConnectedReportQuery = z.infer<typeof connectedReportQuerySchema>;
export type ConnectedReport = z.infer<typeof connectedReportSchema>;
