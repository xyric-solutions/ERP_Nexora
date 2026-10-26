import { z } from "zod";
const id = z.string().trim().min(1).max(128);
export const bankWorkflowInputFields = {
  project_id: id.nullable().optional(),
  location_id: id.nullable().optional(),
  approver_user_id: id.nullable().optional(),
};
export const bankWorkflowDetailFields = {
  ...bankWorkflowInputFields,
  project_name: z.string().max(200).nullable().optional(),
  location_name: z.string().max(200).nullable().optional(),
  approver_name: z.string().max(320).nullable().optional(),
  assigned_decision_allowed: z.boolean().optional(),
  delegated_self_approval_allowed: z.boolean().optional(),
  can_reassign_approver: z.boolean().optional(),
  delegated_decision_id: id.nullable().optional(),
  approver_history: z
    .array(
      z.strictObject({
        id,
        version: z.number().int().positive(),
        previous_user_id: id.nullable(),
        assigned_user_id: id,
        actor_id: id,
        occurred_at: z.iso.datetime(),
      }),
    )
    .max(100)
    .optional(),
};
export const reassignBankApproverRequestSchema = z.strictObject({
  approver_user_id: id,
  expected_version: z.number().int().positive(),
});
export type ReassignBankApproverRequest = z.infer<typeof reassignBankApproverRequestSchema>;
export const bankWorkflowOptionQuerySchema = z.strictObject({
  company_id: id,
  kind: z.enum(["project", "location", "approver"]),
  search: z.string().trim().max(160).optional(),
  selected_id: id.optional(),
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const bankWorkflowOptionSchema = z.strictObject({
  id,
  code: z.string().max(128),
  name: z.string().max(320),
  eligible: z.boolean(),
  self_approval: z.boolean(),
});
export const bankWorkflowOptionsSchema = z.strictObject({
  items: z.array(bankWorkflowOptionSchema).max(100),
  selected: bankWorkflowOptionSchema.nullable(),
  next_cursor: z.string().max(512).nullable(),
});
export type BankWorkflowOptionQuery = z.infer<typeof bankWorkflowOptionQuerySchema>;
export type BankWorkflowOptions = z.infer<typeof bankWorkflowOptionsSchema>;
