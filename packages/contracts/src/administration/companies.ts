import { z } from "zod";

import { countryCodeSchema, currencyCodeSchema } from "./tenant-profile.js";

const identifier = z.string().trim().min(1).max(128);
const companyName = z.string().trim().min(2).max(200);

/** A company is an HR `organization_unit` of type `company` (plan D8: HR org units are the single source). */
export const adminCompanySchema = z.strictObject({
  id: identifier,
  code: z.string().max(32),
  name: companyName,
  legal_name: z.string().max(200).nullable(),
  country_code: countryCodeSchema.nullable(),
  base_currency: currencyCodeSchema.nullable(),
  status: z.enum(["active", "inactive"]),
  row_version: z.number().int().nonnegative(),
});
export type AdminCompany = z.infer<typeof adminCompanySchema>;

export const adminCompanyDirectorySchema = z.strictObject({ items: adminCompanySchema.array() });
export type AdminCompanyDirectory = z.infer<typeof adminCompanyDirectorySchema>;

/** The server allocates the company code (`CO-001` style); clients never send one. */
export const createAdminCompanyRequestSchema = z.strictObject({
  name: companyName,
  legal_name: z.string().trim().min(2).max(200).nullable().default(null),
  country_code: countryCodeSchema.nullable().default(null),
  base_currency: currencyCodeSchema.nullable().default(null),
});
export type CreateAdminCompanyRequest = z.infer<typeof createAdminCompanyRequestSchema>;

export const updateAdminCompanyRequestSchema = z
  .strictObject({
    name: companyName.optional(),
    legal_name: z.string().trim().min(2).max(200).nullable().optional(),
    country_code: countryCodeSchema.nullable().optional(),
    base_currency: currencyCodeSchema.nullable().optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "at least one field must be changed" });
export type UpdateAdminCompanyRequest = z.infer<typeof updateAdminCompanyRequestSchema>;
