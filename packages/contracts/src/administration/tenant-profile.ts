import { z } from "zod";

export const organisationTypeSchema = z.enum([
  "sole_proprietorship",
  "partnership",
  "private_limited",
  "public_limited",
  "non_profit",
  "government",
  "other",
]);
export type OrganisationType = z.infer<typeof organisationTypeSchema>;

/** ISO 3166-1 alpha-2, upper case. */
export const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}$/);
/** ISO 4217, upper case. */
export const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/);
export const financialYearStartMonthSchema = z.number().int().min(1).max(12);
const organisationName = z.string().trim().min(2).max(200);

export const tenantProfileSchema = z.strictObject({
  tenant_id: z.string().min(1).max(128),
  organisation_type: organisationTypeSchema,
  name: organisationName,
  country_code: countryCodeSchema,
  financial_year_start_month: financialYearStartMonthSchema,
  base_currency: currencyCodeSchema.nullable(),
  registered_at: z.iso.datetime({ offset: true }).nullable(),
  row_version: z.number().int().nonnegative(),
});
export type TenantProfile = z.infer<typeof tenantProfileSchema>;

/**
 * Super Admin only. A change to `financial_year_start_month` is refused while the
 * current fiscal calendar has postings and applies to the next calendar only.
 */
export const updateTenantProfileRequestSchema = z
  .strictObject({
    organisation_type: organisationTypeSchema.optional(),
    name: organisationName.optional(),
    country_code: countryCodeSchema.optional(),
    financial_year_start_month: financialYearStartMonthSchema.optional(),
    base_currency: currencyCodeSchema.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "at least one field must be changed" });
export type UpdateTenantProfileRequest = z.infer<typeof updateTenantProfileRequestSchema>;
