import { z } from "zod";
const id = z.string().trim().min(1).max(128);
export const financeHierarchyQuerySchema = z.strictObject({
  company_id: id,
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(100).default(100),
});
export const financeHierarchyItemSchema = z.strictObject({
  id,
  company_id: id,
  code: id,
  name: z.string().min(1).max(160),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  parent_id: id.nullable(),
  status: z.enum(["active", "inactive"]),
  version: z.number().int().positive(),
});
export const financeHierarchyDirectorySchema = z.strictObject({
  items: z.array(financeHierarchyItemSchema).max(100),
  next_cursor: z.string().max(512).nullable(),
});
export const createFinanceHierarchyRequestSchema = z
  .strictObject({
    company_id: id,
    name: z.string().trim().min(1).max(160),
    type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
    parent_id: id.optional(),
    code: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
  })
  .superRefine((v, c) => {
    if (!!v.parent_id !== !!v.code)
      c.addIssue({
        code: "custom",
        message: "A section requires its category and four-digit code; category codes are generated.",
      });
  });
export const changeFinanceHierarchyRequestSchema = z
  .strictObject({
    expected_version: z.number().int().positive(),
    name: z.string().trim().min(1).max(160).optional(),
    action: z.enum(["activate", "deactivate"]).optional(),
  })
  .refine((v) => !!v.name !== !!v.action, "Specify exactly one name change or status action.");
export type FinanceHierarchyQuery = z.infer<typeof financeHierarchyQuerySchema>;
export type FinanceHierarchyItem = z.infer<typeof financeHierarchyItemSchema>;
export type FinanceHierarchyDirectory = z.infer<typeof financeHierarchyDirectorySchema>;
export type CreateFinanceHierarchyRequest = z.infer<typeof createFinanceHierarchyRequestSchema>;
export type ChangeFinanceHierarchyRequest = z.infer<typeof changeFinanceHierarchyRequestSchema>;
