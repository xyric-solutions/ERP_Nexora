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
  state: z.enum(["draft", "pending_approval", "active", "inactive", "rejected"]).optional(),
  self_decision_requires_override: z.boolean().optional(),
  version: z.number().int().positive(),
  section_count: z.number().int().nonnegative(),
  nominal_count: z.number().int().nonnegative(),
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
    if (v.code && !v.parent_id)
      c.addIssue({
        code: "custom",
        message: "An explicit four-digit code is valid only for a controlled Section create.",
      });
  });
export const changeFinanceHierarchyRequestSchema = z
  .strictObject({
    expected_version: z.number().int().positive(),
    name: z.string().trim().min(1).max(160).optional(),
    action: z.enum(["activate", "deactivate", "submit", "approve", "reject"]).optional(),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .refine((v) => !!v.name !== !!v.action, "Specify exactly one name change or lifecycle action.")
  .refine((v) => v.action !== "reject" || !!v.reason, "A rejection reason is required.")
  .refine((v) => !v.reason || v.action === "reject", "Only rejection accepts a supplied reason.");
export type FinanceHierarchyQuery = z.infer<typeof financeHierarchyQuerySchema>;
export type FinanceHierarchyItem = z.infer<typeof financeHierarchyItemSchema>;
export type FinanceHierarchyDirectory = z.infer<typeof financeHierarchyDirectorySchema>;
export type CreateFinanceHierarchyRequest = z.infer<typeof createFinanceHierarchyRequestSchema>;
export type ChangeFinanceHierarchyRequest = z.infer<typeof changeFinanceHierarchyRequestSchema>;
