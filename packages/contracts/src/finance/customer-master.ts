import { z } from "zod";
import { supplierProfileSchema } from "../procurement/supplier-profile.js";

const id = z.string().trim().min(1).max(128);
const currency = z.string().regex(/^[A-Z]{3}$/);
const email = z.union([z.email().max(254), z.literal("")]);
export const customerMasterScopeSchema = z.strictObject({ company_id: id });
export const customerMasterQuerySchema = customerMasterScopeSchema.extend({
  search: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
const fields = {
  name: z.string().trim().min(1).max(200),
  tax_id: z.string().trim().max(128),
  email,
  phone: z.string().trim().max(64),
  status: z.enum(["active", "inactive"]),
};
export const customerMasterInputSchema = customerMasterScopeSchema.extend({
  ...fields,
  default_currency: currency,
  address: z.string().trim().max(1000),
  profile: supplierProfileSchema,
});
export const customerMasterUpdateSchema = customerMasterInputSchema.omit({ default_currency: true }).extend({
  expected_version: z.number().int().nonnegative(),
});
export const customerMasterSummarySchema = customerMasterScopeSchema.extend({
  ...fields,
  id,
  code: id,
  default_currency: currency,
  version: z.number().int().nonnegative(),
});
export const customerMasterDirectorySchema = z.strictObject({
  items: z.array(customerMasterSummarySchema),
  total: z.number().int().nonnegative(),
  base_currency: currency,
  currencies: z.array(z.strictObject({ code: currency, name: z.string() })),
});
export const customerMasterSchema = customerMasterSummarySchema.extend({
  address: z.string(),
  profile: supplierProfileSchema,
});
export const customerMasterMutationSchema = customerMasterSummarySchema.pick({ id: true, code: true, version: true });
export type CustomerMaster = z.infer<typeof customerMasterSchema>;
export type CustomerMasterSummary = z.infer<typeof customerMasterSummarySchema>;
export type CustomerMasterDirectory = z.infer<typeof customerMasterDirectorySchema>;
export type CustomerMasterInput = z.infer<typeof customerMasterInputSchema>;
export type CustomerMasterUpdate = z.infer<typeof customerMasterUpdateSchema>;
export type CustomerMasterQuery = z.infer<typeof customerMasterQuerySchema>;
export type CustomerMasterMutation = z.infer<typeof customerMasterMutationSchema>;
