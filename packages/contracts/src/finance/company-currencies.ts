import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const countryCode = z.string().regex(/^[A-Z]{2}$/);
const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const reason = z.string().trim().min(3).max(500);
const rate = z
  .string()
  .regex(/^(0|[1-9]\d{0,19})(\.\d{1,18})?$/)
  .refine((value) => value.replace(/[.0]/g, "").length > 0, "Exchange rate must be greater than zero.");
const cursor = z.string().trim().min(1).max(512);
const boundedPageSize = z.coerce.number().int().min(1).max(100).default(50);

export const countryCurrencyMappingStatusSchema = z.enum(["active", "retired"]);
export const companyCurrencyStatusSchema = z.enum(["active", "inactive"]);
export const companyCurrencyRateStatusSchema = z.enum(["active", "inactive", "superseded"]);

export const countryCurrencyDirectoryQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  country_code: countryCode.optional(),
  currency_code: currencyCode.optional(),
  limit: boundedPageSize,
  cursor: cursor.optional(),
});

export const countryCurrencyMappingSchema = z.strictObject({
  country_code: countryCode,
  country_name: z.string().trim().min(1).max(120),
  currency_code: currencyCode,
  currency_name: z.string().trim().min(1).max(100),
  currency_symbol: z.string().trim().min(1).max(16).nullable(),
  decimal_places: z.number().int().min(0).max(8),
  is_primary: z.boolean(),
  status: countryCurrencyMappingStatusSchema,
});

export const countryCurrencyDirectorySchema = z.strictObject({
  items: z.array(countryCurrencyMappingSchema).max(100),
  next_cursor: cursor.nullable(),
});

export const companyCurrencyProfileSchema = z.strictObject({
  id,
  company_id: id,
  base_currency: currencyCode,
  base_currency_name: z.string().trim().min(1).max(100),
  base_country_code: countryCode.nullable(),
  base_country_name: z.string().trim().min(1).max(120).nullable(),
  status: z.literal("active"),
  locked: z.boolean(),
  locked_at: z.iso.datetime({ offset: true }).nullable(),
  version,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export const configureCompanyCurrencyProfileRequestSchema = z.strictObject({
  company_id: id,
  base_country_code: countryCode,
  base_currency: currencyCode,
});

export const companyCurrencyDirectoryQuerySchema = z.strictObject({
  company_id: id,
  search: z.string().trim().max(100).optional(),
  status: companyCurrencyStatusSchema.optional(),
  limit: boundedPageSize,
  cursor: cursor.optional(),
});

export const companyCurrencySchema = z.strictObject({
  id,
  company_id: id,
  currency_code: currencyCode,
  currency_name: z.string().trim().min(1).max(100),
  selected_country_code: countryCode,
  selected_country_name: z.string().trim().min(1).max(120),
  decimal_places: z.number().int().min(0).max(8),
  is_base: z.boolean(),
  status: companyCurrencyStatusSchema,
  latest_rate: rate.nullable(),
  latest_rate_effective_date: z.iso.date().nullable(),
  version,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export const companyCurrencyDirectorySchema = z.strictObject({
  items: z.array(companyCurrencySchema).max(100),
  next_cursor: cursor.nullable(),
});

export const activateCompanyCurrencyRequestSchema = z.strictObject({
  company_id: id,
  country_code: countryCode,
  currency_code: currencyCode,
  /** Number of company-base currency units for one source-currency unit. */
  rate,
  effective_date: z.iso.date(),
});

export const changeCompanyCurrencyStatusRequestSchema = z.strictObject({
  expected_version: version,
  status: companyCurrencyStatusSchema,
  reason,
});

export const companyCurrencyRateDirectoryQuerySchema = z.strictObject({
  company_id: id,
  source_currency: currencyCode.optional(),
  effective_on_or_before: z.iso.date().optional(),
  status: companyCurrencyRateStatusSchema.optional(),
  limit: boundedPageSize,
  cursor: cursor.optional(),
});

export const companyCurrencyRateSchema = z.strictObject({
  id,
  company_id: id,
  source_currency: currencyCode,
  target_currency: currencyCode,
  rate,
  effective_date: z.iso.date(),
  status: companyCurrencyRateStatusSchema,
  version,
  supersedes_rate_id: id.nullable(),
  created_by: id,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export const companyCurrencyRateDirectorySchema = z.strictObject({
  items: z.array(companyCurrencyRateSchema).max(100),
  next_cursor: cursor.nullable(),
});

export const createCompanyCurrencyRateRequestSchema = z.strictObject({
  company_id: id,
  source_currency: currencyCode,
  /** Number of company-base currency units for one source-currency unit. */
  rate,
  effective_date: z.iso.date(),
});

export const correctCompanyCurrencyRateRequestSchema = z.strictObject({
  expected_version: version,
  rate,
  reason,
});

export const changeCompanyCurrencyRateStatusRequestSchema = z.strictObject({
  expected_version: version,
  status: z.enum(["active", "inactive"]),
  reason,
});

export const companyCurrencyMutationSchema = z.strictObject({
  id,
  version,
  audit_event_id: id,
  replayed: z.boolean(),
});

export type CountryCurrencyDirectoryQuery = z.infer<typeof countryCurrencyDirectoryQuerySchema>;
export type CountryCurrencyMapping = z.infer<typeof countryCurrencyMappingSchema>;
export type CountryCurrencyDirectory = z.infer<typeof countryCurrencyDirectorySchema>;
export type CompanyCurrencyProfile = z.infer<typeof companyCurrencyProfileSchema>;
export type ConfigureCompanyCurrencyProfileRequest = z.infer<typeof configureCompanyCurrencyProfileRequestSchema>;
export type CompanyCurrencyDirectoryQuery = z.infer<typeof companyCurrencyDirectoryQuerySchema>;
export type CompanyCurrency = z.infer<typeof companyCurrencySchema>;
export type CompanyCurrencyDirectory = z.infer<typeof companyCurrencyDirectorySchema>;
export type ActivateCompanyCurrencyRequest = z.infer<typeof activateCompanyCurrencyRequestSchema>;
export type ChangeCompanyCurrencyStatusRequest = z.infer<typeof changeCompanyCurrencyStatusRequestSchema>;
export type CompanyCurrencyRateDirectoryQuery = z.infer<typeof companyCurrencyRateDirectoryQuerySchema>;
export type CompanyCurrencyRate = z.infer<typeof companyCurrencyRateSchema>;
export type CompanyCurrencyRateDirectory = z.infer<typeof companyCurrencyRateDirectorySchema>;
export type CreateCompanyCurrencyRateRequest = z.infer<typeof createCompanyCurrencyRateRequestSchema>;
export type CorrectCompanyCurrencyRateRequest = z.infer<typeof correctCompanyCurrencyRateRequestSchema>;
export type ChangeCompanyCurrencyRateStatusRequest = z.infer<typeof changeCompanyCurrencyRateStatusRequestSchema>;
export type CompanyCurrencyMutation = z.infer<typeof companyCurrencyMutationSchema>;
