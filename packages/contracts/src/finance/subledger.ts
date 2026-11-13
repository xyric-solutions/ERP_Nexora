import { z } from "zod";
import { taxSnapshotSchema } from "./taxes.js";

const id = z.string().trim().min(1).max(128);
const amount = z.string().regex(/^(0|[1-9]\d{0,29})(\.\d{1,8})?$/);
const signedAmount = z.string().regex(/^-?(0|[1-9]\d{0,29})(\.\d{1,8})?$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
const date = z.iso.date();
export const subledgerSideSchema = z.enum(["receivable", "payable"]);
export const subledgerQuerySchema = z.strictObject({
  company_id: id,
  as_of: date,
  party_id: id.optional(),
  side: subledgerSideSchema.optional(),
  currency: currency.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export const subledgerPartyInputSchema = z.strictObject({
  company_id: id,
  kind: z.enum(["customer", "supplier"]),
  name: z.string().trim().min(1).max(200),
  default_currency: currency,
  source_supplier_id: id.optional(),
});
export const subledgerPolicyInputSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().min(0),
  receivable_account_id: id,
  payable_account_id: id,
  revenue_account_id: id,
  expense_account_id: id,
  realized_gain_account_id: id,
  realized_loss_account_id: id,
  unrealized_gain_account_id: id,
  unrealized_loss_account_id: id,
});
const allocation = z.strictObject({ item_id: id, amount });
const common = {
  company_id: id,
  date,
  reference: z.string().trim().max(160).default(""),
  reason: z.string().trim().min(3).max(500),
};
export const subledgerRecognitionSchema = z.strictObject({
  ...common,
  type: z.literal("recognition"),
  party_id: id,
  side: subledgerSideSchema,
  kind: z.enum(["invoice", "credit_note", "advance"]),
  currency,
  amount,
  due_date: date,
  monetary: z.boolean().default(true),
  bank_account_id: id.optional(),
  source_document_id: id.optional(),
  counter_account_id: id.optional(),
  tax_definition_id: id.optional(),
  tax_amount: amount.optional(),
  tax_account_id: id.optional(),
});
export const subledgerSettlementSchema = z.strictObject({
  ...common,
  type: z.literal("settlement"),
  party_id: id,
  side: subledgerSideSchema,
  bank_account_id: id,
  payment_currency: currency,
  payment_amount: amount,
  bank_fee: amount.default("0"),
  tax_definition_id: id.optional(),
  conversion_rate: z
    .string()
    .regex(/^(0|[1-9]\d{0,19})(\.\d{1,18})?$/)
    .optional(),
  conversion_reference: z.string().trim().min(3).max(160).optional(),
  allocations: z.array(allocation).min(1).max(40),
});
export const subledgerOffsetSchema = z.strictObject({
  ...common,
  type: z.literal("offset"),
  party_id: id,
  side: subledgerSideSchema,
  allocations: z.array(allocation).min(2).max(40),
});
export const subledgerRevaluationSchema = z.strictObject({
  ...common,
  type: z.literal("revaluation"),
  side: subledgerSideSchema,
  currency,
  party_id: id.optional(),
});
export const subledgerReversalSchema = z.strictObject({ ...common, type: z.literal("reversal"), operation_id: id });
export const subledgerOperationInputSchema = z.discriminatedUnion("type", [
  subledgerRecognitionSchema,
  subledgerSettlementSchema,
  subledgerOffsetSchema,
  subledgerRevaluationSchema,
  subledgerReversalSchema,
]);
export const subledgerActionSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().positive(),
  action: z.enum(["submit", "approve", "reject", "post"]),
  reason: z.string().trim().min(3).max(500),
});
export const subledgerPartySchema = subledgerPartyInputSchema.extend({ id, code: id });
export const subledgerPolicySchema = subledgerPolicyInputSchema
  .omit({ expected_version: true })
  .extend({ version: z.number().int().positive() });
export const subledgerItemSchema = z.strictObject({
  id,
  code: id,
  party_id: id,
  party_name: z.string(),
  side: subledgerSideSchema,
  kind: z.enum(["invoice", "credit_note", "advance"]),
  currency,
  base_currency: currency,
  decimal_places: z.number().int(),
  base_decimal_places: z.number().int(),
  date,
  due_date: date,
  original_amount: signedAmount,
  original_base: signedAmount,
  outstanding: signedAmount,
  carrying: signedAmount,
  historical: signedAmount,
  unrealized: signedAmount,
  monetary: z.boolean(),
  control_account_id: id,
  journal_id: id,
  rate: z.string(),
  rate_id: id.nullable(),
});
export const subledgerPreviewSchema = z.strictObject({
  taxes: z.array(taxSnapshotSchema).max(100).default([]),
  base_currency: currency,
  base_decimal_places: z.number().int(),
  policy_version: z.number().int(),
  lines: z.array(
    z.strictObject({
      accountId: id,
      debit: amount,
      credit: amount,
      currency,
      exchangeRateId: id.nullable(),
      exchangeRateValue: z.string(),
      exchangeRateDate: date.nullable(),
      dimensions: z.record(z.string(), z.string()),
      description: z.string(),
    }),
  ),
  deltas: z.array(
    z.strictObject({
      item_id: id,
      foreign: signedAmount,
      base: signedAmount,
      historical: signedAmount,
      unrealized: signedAmount,
    }),
  ),
  item: subledgerItemSchema.omit({ journal_id: true }).nullable(),
  sources: z.array(subledgerItemSchema),
  realized_gain: signedAmount,
  unrealized_gain: signedAmount,
  rounding: signedAmount,
  fx_by_item: z.array(z.strictObject({ item_id: id, realized: signedAmount, unrealized: signedAmount })),
});
export const subledgerOperationSchema = z.strictObject({
  id,
  code: id,
  company_id: id,
  type: z.string(),
  date,
  state: z.enum(["draft", "submitted", "approved", "rejected", "posted"]),
  version: z.number().int().positive(),
  maker_id: id,
  approver_id: id.nullable(),
  journal_id: id.nullable(),
  input: subledgerOperationInputSchema,
  preview: subledgerPreviewSchema.nullable(),
});
export const subledgerBalanceSchema = z.strictObject({
  party_id: id,
  party_name: z.string(),
  side: subledgerSideSchema,
  currency,
  base_currency: currency,
  outstanding: signedAmount,
  carrying: signedAmount,
  unrealized: signedAmount,
  current: signedAmount,
  days_1_30: signedAmount,
  days_31_60: signedAmount,
  days_61_90: signedAmount,
  days_over_90: signedAmount,
});
export const subledgerWorkspaceSchema = z.strictObject({
  company_id: id,
  base_currency: currency,
  base_decimal_places: z.number().int(),
  as_of: date,
  parties: z.array(subledgerPartySchema),
  policy: subledgerPolicySchema.nullable(),
  items: z.array(subledgerItemSchema),
  operations: z.array(subledgerOperationSchema),
  balances: z.array(subledgerBalanceSchema),
  total_items: z.number().int(),
  total_operations: z.number().int(),
  total_balances: z.number().int(),
  carrying_total: signedAmount,
  unrealized_total: signedAmount,
  accounts: z.array(z.strictObject({ id, code: id, name: z.string(), type: z.string() })),
  banks: z.array(z.strictObject({ id, name: z.string(), currency })),
  currencies: z.array(z.strictObject({ code: currency, decimal_places: z.number().int() })),
});
export const subledgerReportQuerySchema = subledgerQuerySchema.extend({
  from: date.optional(),
  report: z.enum(["statement", "fx", "trial_balance", "general_ledger", "profit_loss", "balance_sheet"]),
  presentation_currency: currency.optional(),
});
export const subledgerReportSchema = z.strictObject({
  company_id: id,
  report: z.string(),
  as_of: date,
  base_currency: currency,
  presentation_currency: currency,
  translation_method: z.string(),
  rows: z.array(
    z.strictObject({
      id,
      date: date.nullable(),
      code: z.string(),
      name: z.string(),
      type: z.string(),
      currency,
      original: signedAmount,
      debit: signedAmount,
      credit: signedAmount,
      balance: signedAmount,
      presentation_balance: signedAmount,
      rate: z.string().nullable(),
      journal_id: id.nullable(),
    }),
  ),
  total_rows: z.number().int(),
  debit: signedAmount,
  credit: signedAmount,
  balance: signedAmount,
  presentation_balance: signedAmount,
  translation_difference: signedAmount,
  reconciliation: z.array(
    z.strictObject({
      account_id: id,
      ledger_balance: signedAmount,
      subledger_balance: signedAmount,
      difference: signedAmount,
    }),
  ),
});
export type SubledgerInput = z.infer<typeof subledgerOperationInputSchema>;
export type SubledgerAction = z.infer<typeof subledgerActionSchema>;
export type SubledgerQuery = z.infer<typeof subledgerQuerySchema>;
export type SubledgerPartyInput = z.infer<typeof subledgerPartyInputSchema>;
export type SubledgerPolicyInput = z.infer<typeof subledgerPolicyInputSchema>;
export type SubledgerPolicy = z.infer<typeof subledgerPolicySchema>;
export type SubledgerParty = z.infer<typeof subledgerPartySchema>;
export type SubledgerItem = z.infer<typeof subledgerItemSchema>;
export type SubledgerOperation = z.infer<typeof subledgerOperationSchema>;
export type SubledgerWorkspace = z.infer<typeof subledgerWorkspaceSchema>;
export type SubledgerReportQuery = z.infer<typeof subledgerReportQuerySchema>;
export type SubledgerReport = z.infer<typeof subledgerReportSchema>;
