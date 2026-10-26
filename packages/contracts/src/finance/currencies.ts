import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const code = z.string().regex(/^[A-Z]{3}$/);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const reason = z.string().trim().min(3).max(500);
const rate = z
  .string()
  .regex(/^(0|[1-9]\d{0,19})(\.\d{1,18})?$/)
  .refine((value) => value.replace(/[.0]/g, "").length > 0, "Exchange rate must be greater than zero.");

export const currencyStatusSchema = z.enum(["active", "inactive"]);
export const currencyRateStatusSchema = z.enum(["active", "inactive", "superseded"]);

export const currencyCatalogQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  adopted: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});
export const currencyCatalogItemSchema = z.strictObject({
  code,
  name: z.string().trim().min(1).max(100),
  decimal_places: z.number().int().min(0).max(8),
  adopted: z.boolean(),
  adopted_status: currencyStatusSchema.nullable(),
  is_base: z.boolean(),
});
export const currencyCatalogDirectorySchema = z.strictObject({
  items: z.array(currencyCatalogItemSchema).max(100),
  next_cursor: z.string().max(512).nullable(),
});

export const tenantCurrencyQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  status: currencyStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});
export const tenantCurrencySchema = z.strictObject({
  code,
  name: z.string().trim().min(1).max(100),
  decimal_places: z.number().int().min(0).max(8),
  is_base: z.boolean(),
  status: currencyStatusSchema,
  version,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export const tenantCurrencyDirectorySchema = z.strictObject({
  items: z.array(tenantCurrencySchema).max(100),
  next_cursor: z.string().max(512).nullable(),
});
export const adoptCurrencyRequestSchema = z.strictObject({ code });
export const changeCurrencyStatusRequestSchema = z.strictObject({
  expected_version: version,
  status: currencyStatusSchema,
  reason,
});

export const currencyRateQuerySchema = z.strictObject({
  source_currency: code.optional(),
  effective_on_or_before: z.iso.date().optional(),
  status: currencyRateStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});
export const currencyRateSchema = z.strictObject({
  id,
  source_currency: code,
  target_currency: code,
  rate,
  effective_date: z.iso.date(),
  status: currencyRateStatusSchema,
  version,
  supersedes_rate_id: id.nullable(),
  // Legacy rates pre-date governed actor evidence. New writes always persist an
  // actor, while the nullable projection keeps upgrade reads compatible.
  created_by: id.nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export const currencyRateDirectorySchema = z.strictObject({
  items: z.array(currencyRateSchema).max(100),
  next_cursor: z.string().max(512).nullable(),
});
export const createCurrencyRateRequestSchema = z.strictObject({
  source_currency: code,
  rate,
  effective_date: z.iso.date(),
});
export const correctCurrencyRateRequestSchema = z.strictObject({
  expected_version: version,
  rate,
  reason,
});
export const changeCurrencyRateStatusRequestSchema = z.strictObject({
  expected_version: version,
  status: z.enum(["active", "inactive"]),
  reason,
});

export const transferFxPolicySchema = z.strictObject({
  id,
  company_id: id,
  fx_gain_nominal_id: id,
  fx_loss_nominal_id: id,
  rounding_nominal_id: id,
  bank_charge_nominal_id: id,
  rounding_tolerance: z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,8})?$/),
  version,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export const upsertTransferFxPolicyRequestSchema = z.strictObject({
  company_id: id,
  expected_version: version.optional(),
  fx_gain_nominal_id: id,
  fx_loss_nominal_id: id,
  rounding_nominal_id: id,
  bank_charge_nominal_id: id,
  rounding_tolerance: z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,8})?$/),
  reason,
});

export const financeConfigurationMutationSchema = z.strictObject({
  id,
  version,
  audit_event_id: id,
  replayed: z.boolean(),
});

export type CurrencyStatus = z.infer<typeof currencyStatusSchema>;
export type CurrencyCatalogQuery = z.infer<typeof currencyCatalogQuerySchema>;
export type CurrencyCatalogItem = z.infer<typeof currencyCatalogItemSchema>;
export type CurrencyCatalogDirectory = z.infer<typeof currencyCatalogDirectorySchema>;
export type TenantCurrencyQuery = z.infer<typeof tenantCurrencyQuerySchema>;
export type TenantCurrency = z.infer<typeof tenantCurrencySchema>;
export type TenantCurrencyDirectory = z.infer<typeof tenantCurrencyDirectorySchema>;
export type AdoptCurrencyRequest = z.infer<typeof adoptCurrencyRequestSchema>;
export type ChangeCurrencyStatusRequest = z.infer<typeof changeCurrencyStatusRequestSchema>;
export type CurrencyRateStatus = z.infer<typeof currencyRateStatusSchema>;
export type CurrencyRateQuery = z.infer<typeof currencyRateQuerySchema>;
export type CurrencyRate = z.infer<typeof currencyRateSchema>;
export type CurrencyRateDirectory = z.infer<typeof currencyRateDirectorySchema>;
export type CreateCurrencyRateRequest = z.infer<typeof createCurrencyRateRequestSchema>;
export type CorrectCurrencyRateRequest = z.infer<typeof correctCurrencyRateRequestSchema>;
export type ChangeCurrencyRateStatusRequest = z.infer<typeof changeCurrencyRateStatusRequestSchema>;
export type TransferFxPolicy = z.infer<typeof transferFxPolicySchema>;
export type UpsertTransferFxPolicyRequest = z.infer<typeof upsertTransferFxPolicyRequestSchema>;
export type FinanceConfigurationMutation = z.infer<typeof financeConfigurationMutationSchema>;
