import { z } from "zod";

export const referenceMasterKindSchema = z.enum(["projects", "locations"]);
const id = z.string().trim().min(1).max(128);
const fields = {
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  name: z.string().trim().min(1).max(200),
};
export const referenceMasterQuerySchema = z.strictObject({
  company_id: id,
  search: z.string().trim().max(160).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().max(512).optional(),
});
export const createReferenceMasterRequestSchema = z.strictObject({ company_id: id, ...fields });
export const updateReferenceMasterRequestSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().positive(),
  name: fields.name,
});
export const changeReferenceMasterStatusRequestSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().positive(),
  status: z.enum(["active", "inactive"]),
});
export const referenceMasterSchema = z.strictObject({
  id,
  company_id: id,
  ...fields,
  status: z.enum(["active", "inactive"]),
  version: z.number().int().positive(),
  created_by: id,
  updated_by: id,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export const referenceMasterDirectorySchema = z.strictObject({
  items: z.array(referenceMasterSchema).max(100),
  next_cursor: z.string().nullable(),
});
export const referenceMasterMutationSchema = z.strictObject({ record: referenceMasterSchema, audit_event_id: id });
export type ReferenceMasterKind = z.infer<typeof referenceMasterKindSchema>;
export type ReferenceMasterQuery = z.infer<typeof referenceMasterQuerySchema>;
export type ReferenceMaster = z.infer<typeof referenceMasterSchema>;
export type ReferenceMasterDirectory = z.infer<typeof referenceMasterDirectorySchema>;
export type ReferenceMasterMutation = z.infer<typeof referenceMasterMutationSchema>;
export type CreateReferenceMasterRequest = z.infer<typeof createReferenceMasterRequestSchema>;
export type UpdateReferenceMasterRequest = z.infer<typeof updateReferenceMasterRequestSchema>;
export type ChangeReferenceMasterStatusRequest = z.infer<typeof changeReferenceMasterStatusRequestSchema>;
