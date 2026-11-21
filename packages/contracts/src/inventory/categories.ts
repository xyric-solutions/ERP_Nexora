import { z } from "zod";
const id = z.string().trim().min(1).max(128);
export const productCategoryInputSchema = z.strictObject({
  company_id: id,
  name: z.string().trim().min(1).max(120),
  status: z.enum(["active", "inactive"]).default("active"),
  reason: z.string().trim().min(1).max(1000),
  expected_version: z.number().int().positive().optional(),
});
export const productCategorySchema = z.strictObject({
  id,
  company_id: id,
  code: id,
  name: z.string(),
  status: z.enum(["active", "inactive"]),
  version: z.number().int().positive(),
});
export const productCategoryQuerySchema = z.strictObject({
  company_id: id,
  search: z.string().trim().max(120).default(""),
  status: z.enum(["active", "inactive"]).optional(),
  after: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const productCategoryDirectorySchema = z.strictObject({
  items: z.array(productCategorySchema),
  next_cursor: z.string().nullable(),
});
export const productCategoryMutationSchema = z.strictObject({ record: productCategorySchema, audit_event_id: id });
export type ProductCategory = z.infer<typeof productCategorySchema>;
export type ProductCategoryInput = z.infer<typeof productCategoryInputSchema>;
export type ProductCategoryQuery = z.infer<typeof productCategoryQuerySchema>;
export type ProductCategoryDirectory = z.infer<typeof productCategoryDirectorySchema>;
export type ProductCategoryMutation = z.infer<typeof productCategoryMutationSchema>;
