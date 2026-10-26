import { z } from "zod";
const id = z.string().trim().min(1).max(128);
export const bankSelfApprovalQuerySchema = z.strictObject({
  company_id: id,
  transaction_kind: z.enum(["payment", "receipt"]),
  user_id: id.optional(),
  history: z.enum(["true", "false"]).default("false"),
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const bankSelfApprovalOptionsQuerySchema = z.strictObject({
  company_id: id.optional(),
  transaction_kind: z.enum(["payment", "receipt"]).default("payment"),
  search: z.string().trim().max(160).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const changeBankSelfApprovalRequestSchema = z.strictObject({
  company_id: id,
  transaction_kind: z.enum(["payment", "receipt"]),
  user_id: id,
  expected_version: z.number().int().min(0),
  state: z.enum(["active", "revoked"]),
  reason: z.string().trim().min(3).max(500),
});
export const bankSelfApprovalGrantSchema = z.strictObject({
  id,
  company_id: id,
  transaction_kind: z.enum(["payment", "receipt"]),
  user_id: id,
  user_name: z.string().max(320),
  version: z.number().int().positive(),
  state: z.enum(["active", "revoked"]),
  actor_id: id,
  reason: z.string().max(500),
  audit_event_id: id,
  created_at: z.iso.datetime(),
});
export const bankSelfApprovalDirectorySchema = z.strictObject({
  items: z.array(bankSelfApprovalGrantSchema).max(100),
  next_cursor: z.string().max(512).nullable(),
});
export const bankSelfApprovalOptionsSchema = z.strictObject({
  companies: z.array(z.strictObject({ id, code: z.string(), name: z.string() })).max(200),
  users: z.array(z.strictObject({ id, name: z.string().max(320) })).max(100),
  next_cursor: z.string().max(512).nullable(),
});
export const bankSelfApprovalMutationSchema = z.strictObject({
  record: bankSelfApprovalGrantSchema,
  replayed: z.boolean(),
});
export type BankSelfApprovalQuery = z.infer<typeof bankSelfApprovalQuerySchema>;
export type BankSelfApprovalOptionsQuery = z.infer<typeof bankSelfApprovalOptionsQuerySchema>;
export type ChangeBankSelfApprovalRequest = z.infer<typeof changeBankSelfApprovalRequestSchema>;
export type BankSelfApprovalGrant = z.infer<typeof bankSelfApprovalGrantSchema>;
export type BankSelfApprovalDirectory = z.infer<typeof bankSelfApprovalDirectorySchema>;
export type BankSelfApprovalOptions = z.infer<typeof bankSelfApprovalOptionsSchema>;
export type BankSelfApprovalMutation = z.infer<typeof bankSelfApprovalMutationSchema>;
