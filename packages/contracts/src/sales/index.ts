import { z } from "zod";
import { unitSnapshotSchema } from "../inventory/units.js";
import { taxSnapshotSchema } from "../finance/taxes.js";
import { billPaymentTermSchema } from "../procurement/bill-payment-terms.js";
import { budgetDimensionsSchema } from "../budget/index.js";
import { subledgerPartyConfigurationSchema } from "../finance/subledger.js";
export * from "./amounts.js";

const id = z.string().trim().min(1).max(128),
  date = z.iso.date();
const money = z.string().regex(/^(0|[1-9]\d{0,21})(\.\d{1,8})?$/);
const signedMoney = z.string().regex(/^-?(0|[1-9]\d{0,29})(\.\d{1,8})?$/);
const quantity = z
  .string()
  .regex(/^(0|[1-9]\d{0,11})(\.\d{1,4})?$/)
  .refine((value) => /[1-9]/.test(value), "Quantity must be positive.");
const text = (max: number) => z.string().trim().max(max).default("");
export const salesKindSchema = z.enum(["quotation", "order", "delivery", "invoice", "return", "credit", "recurring"]);
export const salesStateSchema = z.enum(["draft", "submitted", "approved", "rejected", "cancelled"]);
export const salesLineInputSchema = z.strictObject({
  id: id.optional(),
  source_line_id: id.nullable().default(null),
  template_line_id: id.nullable().default(null),
  product_id: id.nullable(),
  description: z.string().trim().min(1).max(500),
  quantity,
  unit_id: id.optional(),
  unit_price: money,
  discount_amount: money.default("0"),
  tax_definition_id: id.nullable().default(null),
  dimensions: budgetDimensionsSchema.default({}),
});
export const salesLineSchema = salesLineInputSchema.extend({
  id,
  product_code: z.string().nullable(),
  product_name: z.string().nullable(),
  product_version: z.number().int().positive().nullable(),
  product_type: z.enum(["goods", "service", "charge"]),
  track_inventory: z.boolean(),
  invoice_policy: z.enum(["ordered", "delivered"]),
  unit: z.string(),
  unit_snapshot: unitSnapshotSchema.nullable(),
  base_quantity: quantity,
  fulfillment_source_id: id.nullable(),
  fulfillment_source_line_id: id.nullable(),
  net_amount: money,
  tax_amount: money,
  total_amount: money,
  tax_snapshot: taxSnapshotSchema.nullable(),
  allocated_discount_amount: money,
});
export const salesRecurrenceSchema = z.strictObject({
  enabled: z.boolean(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  start_date: date,
  end_date: date.nullable().default(null),
  customer_ids: z.array(id).min(1).max(100),
});
const fields = {
  company_id: id,
  kind: salesKindSchema,
  customer_id: id.nullable(),
  source_id: id.nullable().default(null),
  template_id: id.nullable().default(null),
  billing_period: date.nullable().default(null),
  document_date: date,
  due_date: date.nullable().default(null),
  valid_until: date.nullable().default(null),
  currency: z.string().regex(/^[A-Z]{3}$/),
  project_id: id,
  location_id: id,
  warehouse_id: id.nullable().default(null),
  approver_id: id.nullable().default(null),
  payment_term: billPaymentTermSchema.nullable().default(null),
  reference: text(160),
  notes: text(4000),
  no_tax_reason: text(500),
  discount_amount: money.default("0"),
  recurrence: salesRecurrenceSchema.nullable().default(null),
  lines: z.array(salesLineInputSchema).min(1).max(100),
  expected_version: z.number().int().positive().optional(),
};
export const salesDocumentInputSchema = z.strictObject(fields).superRefine((input, context) => {
  if (input.kind !== "recurring" && !input.customer_id)
    context.addIssue({ code: "custom", path: ["customer_id"], message: "Choose the canonical customer." });
  if ((input.kind === "recurring") !== !!input.recurrence)
    context.addIssue({
      code: "custom",
      path: ["recurrence"],
      message: "Recurring configuration belongs only to an explicit template.",
    });
  if (input.template_id && (!input.billing_period || input.kind !== "invoice"))
    context.addIssue({
      code: "custom",
      path: ["billing_period"],
      message: "A generated invoice requires its template and billing period.",
    });
  if (!input.template_id && input.billing_period)
    context.addIssue({
      code: "custom",
      path: ["template_id"],
      message: "A billing period belongs to its recurring template.",
    });
});
export const salesDocumentUpdateSchema = salesDocumentInputSchema.safeExtend({
  expected_version: z.number().int().positive(),
});
export const salesSourceSchema = z
  .strictObject(fields)
  .omit({ expected_version: true, lines: true })
  .extend({
    id,
    code: z.string(),
    version: z.number().int().positive(),
    state: salesStateSchema,
    maker_id: id,
    lines: z.array(salesLineSchema).min(1).max(100),
    net_amount: money,
    tax_amount: money,
    total_amount: money,
    decimal_places: z.number().int().min(0).max(8),
    base_currency: z.string(),
    exchange_rate_id: id.nullable(),
    exchange_rate: z.string(),
    exchange_rate_date: date.nullable(),
    readiness: z.array(z.string()),
    created_at: z.string(),
    updated_at: z.string(),
  });
export const salesDocumentSchema = salesSourceSchema.extend({
  recurring_customers: z.array(z.strictObject({ id, code: z.string(), name: z.string() })).max(100),
  customer_code: z.string().nullable(),
  customer_name: z.string().nullable(),
  project_name: z.string(),
  location_name: z.string(),
  warehouse_name: z.string().nullable(),
  source_code: z.string().nullable(),
  source_kind: salesKindSchema.nullable(),
  maker_name: z.string(),
  approver_name: z.string().nullable(),
  posting_state: z.enum(["unprepared", "draft", "submitted", "approved", "rejected", "posted", "reversed"]),
  stock_operation_id: id.nullable(),
  financial_operation_id: id.nullable(),
  subledger_item_id: id.nullable(),
  outstanding: signedMoney.nullable(),
});
export const salesActionSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().positive(),
  action: z.enum(["submit", "approve", "reject", "revise", "cancel", "pause", "resume"]),
  reason: z.string().trim().min(3).max(500),
});
export const salesQuerySchema = z.strictObject({
  company_id: id,
  kind: salesKindSchema,
  search: text(160),
  state: salesStateSchema.optional(),
  customer_id: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export const salesDirectorySchema = z.strictObject({
  items: z.array(salesDocumentSchema),
  total: z.number().int().nonnegative(),
});
export const salesLookupQuerySchema = z.strictObject({
  company_id: id,
  kind: z.enum([
    "customer",
    "product",
    "warehouse",
    "unit",
    "project",
    "location",
    "approver",
    "currency",
    "tax",
    "source",
  ]),
  source_kind: salesKindSchema.optional(),
  customer_id: id.optional(),
  search: text(160),
  warehouse_id: id.optional(),
  as_of: date.optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export const salesLookupDirectorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id,
      code: z.string(),
      name: z.string(),
      type: z.string().nullable(),
      currency: z.string().nullable(),
      price: money.nullable(),
      unit: z.string().nullable(),
      quantity: z.string().nullable(),
      decimal_places: z.number().int().nullable(),
      unit_id: id.nullable().default(null),
      tax_rate: z.string().nullable().default(null),
      financial_configuration: subledgerPartyConfigurationSchema.nullable().default(null),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export const salesDerivedDraftInputSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().positive(),
  kind: salesKindSchema,
  customer_id: id.optional(),
  document_date: date,
  billing_period: date.optional(),
  warehouse_id: id.optional(),
});
export const salesSourcePrepareSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
export const salesStockPrepareSchema = salesSourcePrepareSchema.extend({ date });
export const salesEventSchema = z.strictObject({
  id,
  actor_id: id,
  actor_name: z.string(),
  action: z.string(),
  reason: z.string(),
  version: z.number().int().positive(),
  occurred_at: z.string(),
});
export const salesDetailSchema = z.strictObject({
  record: salesDocumentSchema,
  events: z.array(salesEventSchema),
  linked: z.array(z.strictObject({ id, code: z.string(), kind: salesKindSchema, state: salesStateSchema })).max(100),
});
export const salesOverviewSchema = z.strictObject({
  navigation_counts: z.strictObject({
    quotations: z.number().int().nonnegative(),
    "pick-pack-delivery": z.number().int().nonnegative(),
    receipts: z.number().int().nonnegative(),
    "recurring-bills": z.number().int().nonnegative(),
  }),
  counts: z.array(
    z.strictObject({ kind: salesKindSchema, state: salesStateSchema, count: z.number().int().nonnegative() }),
  ),
  notices: z
    .array(
      z.strictObject({
        id,
        document_id: id,
        code: z.string(),
        kind: salesKindSchema,
        action: z.enum(["submit", "approve", "reject"]),
        at: z.string(),
        actor_name: z.string(),
      }),
    )
    .max(100),
});
export type SalesDocumentInput = z.infer<typeof salesDocumentInputSchema>;
export type SalesDocument = z.infer<typeof salesDocumentSchema>;
export type SalesSource = z.infer<typeof salesSourceSchema>;
export type SalesLine = z.infer<typeof salesLineSchema>;
export type SalesLineInput = z.infer<typeof salesLineInputSchema>;
export type SalesKind = z.infer<typeof salesKindSchema>;
export type SalesAction = z.infer<typeof salesActionSchema>;
export type SalesQuery = z.infer<typeof salesQuerySchema>;
export type SalesLookupQuery = z.infer<typeof salesLookupQuerySchema>;
export type SalesDerivedDraftInput = z.infer<typeof salesDerivedDraftInputSchema>;
export type SalesDetail = z.infer<typeof salesDetailSchema>;
export type SalesDocumentUpdate = z.infer<typeof salesDocumentUpdateSchema>;
export type SalesSourcePrepare = z.infer<typeof salesSourcePrepareSchema>;
export type SalesStockPrepare = z.infer<typeof salesStockPrepareSchema>;
export type SalesDirectory = z.infer<typeof salesDirectorySchema>;
export type SalesLookupDirectory = z.infer<typeof salesLookupDirectorySchema>;
export type SalesOverview = z.infer<typeof salesOverviewSchema>;
