import { z } from "zod";
import { countryCodeSchema, currencyCodeSchema, organisationTypeSchema } from "../administration/tenant-profile.js";

const id = z.string().trim().min(1).max(128);
export const businessNatureDirectorySchema = z.strictObject({
  items: z.array(z.strictObject({ key: id, name: z.string().min(1).max(160) })),
});
export const businessSetupInputSchema = z.strictObject({
  company_id: id.optional(),
  company_name: z.string().trim().min(2).max(200),
  business_nature_key: id,
  organisation_type: organisationTypeSchema,
  country_code: countryCodeSchema,
  base_currency: currencyCodeSchema,
  financial_year_start_month: z.number().int().min(1).max(12),
  accounting_method: z.enum(["accrual", "cash"]).default("accrual"),
});
export const businessSetupSchema = businessSetupInputSchema.extend({
  company_id: id,
  template_id: id,
  initialized_at: z.string().datetime(),
});
export const businessSetupResultSchema = z.strictObject({
  setup: businessSetupSchema,
  audit_event_id: id,
  replayed: z.boolean(),
});
export const businessSetupStatusSchema = z.strictObject({ setup: businessSetupSchema.nullable() });
export type BusinessNatureDirectory = z.infer<typeof businessNatureDirectorySchema>;
export type BusinessSetupInput = z.infer<typeof businessSetupInputSchema>;
export type BusinessSetup = z.infer<typeof businessSetupSchema>;
export type BusinessSetupResult = z.infer<typeof businessSetupResultSchema>;
export type BusinessSetupStatus = z.infer<typeof businessSetupStatusSchema>;

export const businessTemplateRolesSchema = z.strictObject({
  receivable: id,
  payable: id,
  revenue: id,
  expense: id,
  realized_gain: id,
  realized_loss: id,
  unrealized_gain: id,
  unrealized_loss: id,
  bank_charge: id.optional(),
  rounding: id.optional(),
  cash_and_bank_section: id,
});
