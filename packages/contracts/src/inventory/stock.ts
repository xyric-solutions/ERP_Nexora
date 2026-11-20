import { z } from "zod";
import { parseQuantity } from "../manufacturing/quantities.js";
import { subledgerDimensionsSchema } from "../finance/subledger.js";

const id = z.string().trim().min(1).max(128);
const quantity = z
  .string()
  .regex(/^(0|[1-9]\d{0,11})(\.\d{1,4})?$/)
  .refine((v) => parseQuantity(v) > 0n);
const value = z.string().regex(/^(0|[1-9]\d{0,21})(\.\d{1,8})?$/);
const signed = z.string().regex(/^-?(0|[1-9]\d{0,29})(\.\d{1,8})?$/);
const version = z.number().int().nonnegative();
const reason = z.string().trim().min(3).max(500);
export const stockPolicyInputSchema = z.strictObject({
  company_id: id,
  expected_version: version,
  receipt_accrual_account_id: id,
  opening_account_id: id,
  wip_account_id: id,
  variance_account_id: id,
  reason,
});
export const stockPolicySchema = stockPolicyInputSchema
  .omit({ expected_version: true })
  .extend({ version: version.positive() });
export const stockValuationInputSchema = z.strictObject({
  company_id: id,
  product_id: id,
  expected_version: version,
  method: z.enum(["fifo", "weighted_average"]),
  reason,
});
export const stockValuationSchema = stockValuationInputSchema.omit({ expected_version: true }).extend({
  version: version.positive(),
  product_code: z.string(),
  product_name: z.string(),
  stock_account_id: id,
});
const common = {
  company_id: id,
  date: z.iso.date(),
  reference: z.string().trim().max(160).default(""),
  reason,
  dimensions: subledgerDimensionsSchema.default({}),
};
const consumption = z.strictObject({ product_id: id, warehouse_id: id, quantity });
export const stockMovementInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...common,
    kind: z.literal("opening"),
    lines: z.array(consumption.extend({ value })).min(1).max(100),
  }),
  z.strictObject({ ...common, kind: z.literal("receipt"), source_id: id, warehouse_id: id }),
  z.strictObject({ ...common, kind: z.literal("transfer"), source_id: id }),
  z.strictObject({
    ...common,
    kind: z.literal("manufacturing_issue"),
    source_id: id,
    quantity,
    lines: z.array(consumption).min(1).max(100),
  }),
  z.strictObject({ ...common, kind: z.literal("manufacturing_completion"), source_id: id, quantity, warehouse_id: id }),
  z.strictObject({ ...common, kind: z.literal("delivery"), source_id: id, warehouse_id: id }),
  z.strictObject({ ...common, kind: z.literal("return"), source_id: id, warehouse_id: id }),
  z.strictObject({ ...common, kind: z.literal("reversal"), operation_id: id }),
]);
export const stockActionSchema = z.strictObject({
  company_id: id,
  expected_version: version.positive(),
  action: z.enum(["submit", "approve", "reject", "post", "cancel"]),
  reason,
});
export const stockQuerySchema = z.strictObject({
  company_id: id,
  as_of: z.iso.date(),
  product_id: id.optional(),
  warehouse_id: id.optional(),
  search: z.string().trim().max(160).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export const stockLookupQuerySchema = z.strictObject({
  company_id: id,
  kind: z.enum([
    "product",
    "warehouse",
    "account",
    "receipt",
    "transfer",
    "manufacturing_order",
    "manufacturing_issue",
    "reversal",
  ]),
  account_type: z.enum(["asset", "liability", "equity", "expense"]).optional(),
  search: z.string().trim().max(160).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export const stockLookupDirectorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id,
      code: z.string(),
      name: z.string(),
      unit: z.string().nullable(),
      type: z.string().nullable(),
      stock_account_id: id.nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export const stockEntryPreviewSchema = z.strictObject({
  product_id: id,
  product_code: z.string(),
  product_name: z.string(),
  warehouse_id: id,
  warehouse_name: z.string(),
  quantity: signed,
  value: signed,
  unit: z.string(),
  account_id: id,
  method: z.enum(["fifo", "weighted_average"]),
  valuation_version: version.positive(),
  allocations: z.array(z.strictObject({ entry_id: id, quantity: signed, value: signed })).max(1000),
  original_entry_id: id.nullable(),
});
export const stockPreviewSchema = z.strictObject({
  base_currency: z.string().regex(/^[A-Z]{3}$/),
  decimal_places: z.number().int().min(0).max(8),
  policy_version: version.positive(),
  entries: z.array(stockEntryPreviewSchema).min(1).max(200),
  lines: z
    .array(
      z.strictObject({
        accountId: id,
        debit: value,
        credit: value,
        dimensions: subledgerDimensionsSchema,
        description: z.string(),
      }),
    )
    .min(2)
    .max(1000),
  evidence: z.record(z.string(), z.json()),
});
export const stockOperationSchema = z.strictObject({
  id,
  company_id: id,
  code: z.string(),
  kind: z.enum([
    "opening",
    "receipt",
    "transfer",
    "manufacturing_issue",
    "manufacturing_completion",
    "delivery",
    "return",
    "reversal",
  ]),
  date: z.iso.date(),
  state: z.enum(["draft", "submitted", "approved", "rejected", "cancelled", "posted", "reversed"]),
  version: version.positive(),
  maker_id: id,
  approver_id: id.nullable(),
  poster_id: id.nullable(),
  journal_id: id.nullable(),
  accounting_event_id: id.nullable(),
  input: stockMovementInputSchema,
  preview: stockPreviewSchema.nullable(),
});
export const stockBalanceSchema = z.strictObject({
  product_id: id,
  product_code: z.string(),
  product_name: z.string(),
  warehouse_id: id,
  warehouse_name: z.string(),
  unit: z.string(),
  quantity: signed,
  value: signed,
});
export const stockWorkspaceSchema = z.strictObject({
  company_id: id,
  as_of: z.iso.date(),
  base_currency: z.string(),
  decimal_places: z.number().int(),
  policy: stockPolicySchema.nullable(),
  valuations: z.array(stockValuationSchema),
  balances: z.array(stockBalanceSchema),
  total_balances: z.number().int().nonnegative(),
  operations: z.array(stockOperationSchema),
  total_operations: z.number().int().nonnegative(),
});
export type StockPolicyInput = z.infer<typeof stockPolicyInputSchema>;
export type StockPolicy = z.infer<typeof stockPolicySchema>;
export type StockValuationInput = z.infer<typeof stockValuationInputSchema>;
export type StockValuation = z.infer<typeof stockValuationSchema>;
export type StockMovementInput = z.infer<typeof stockMovementInputSchema>;
export type StockAction = z.infer<typeof stockActionSchema>;
export type StockQuery = z.infer<typeof stockQuerySchema>;
export type StockLookupQuery = z.infer<typeof stockLookupQuerySchema>;
export type StockLookupDirectory = z.infer<typeof stockLookupDirectorySchema>;
export type StockPreview = z.infer<typeof stockPreviewSchema>;
export type StockEntryPreview = z.infer<typeof stockEntryPreviewSchema>;
export type StockOperation = z.infer<typeof stockOperationSchema>;
export type StockWorkspace = z.infer<typeof stockWorkspaceSchema>;
