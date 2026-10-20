import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const currency = z.string().regex(/^[A-Z]{3}$/);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const reason = z.string().trim().min(3).max(500);
const nominalName = z.string().trim().min(1).max(160);
const description = z.string().trim().max(2_000);

export const financeNominalStateSchema = z.enum([
  "draft",
  "pending_approval",
  "active",
  "rejected",
  "inactive",
  "closed",
  "review_required",
]);

export const financeNominalOptionsQuerySchema = z.strictObject({
  company_id: identifier.optional(),
});

export const financeNominalDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  category_id: identifier.optional(),
  section_id: identifier.optional(),
  search: z.string().trim().max(160).optional(),
  currency: currency.optional(),
  state: financeNominalStateSchema.optional(),
  account_status: z.enum(["active", "inactive"]).optional(),
  sort_by: z.enum(["code", "name", "currency", "state"]).default("code"),
  sort_direction: z.enum(["asc", "desc"]).default("asc"),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});

const hierarchyAccount = z.strictObject({
  id: identifier,
  code: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
});

export const financeNominalOptionsSchema = z.strictObject({
  companies: z.array(
    z.strictObject({
      id: identifier,
      code: z.string().min(1).max(128),
      name: z.string().min(1).max(200),
    }),
  ),
  selected_company_id: identifier.nullable(),
  categories: z.array(hierarchyAccount),
  sections: z.array(
    hierarchyAccount.extend({
      category_id: identifier,
      section_role: z.literal("cash_and_bank").nullable(),
      creation_enabled: z.boolean(),
    }),
  ),
  currencies: z.array(
    z.strictObject({
      code: currency,
      name: z.string().min(1).max(100),
      decimal_places: z.number().int().min(0).max(8),
      is_base: z.boolean(),
    }),
  ),
  setup: z.strictObject({
    cash_and_bank_configured: z.boolean(),
    code_policy_configured: z.boolean(),
  }),
});

// Finance identity is separate from the stable Banking capability identifier.
// Legacy-only external identifiers never enter the Nominal directory.
export const financeNominalSummarySchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  code: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  description: description.nullable(),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  account_status: z.enum(["active", "inactive"]),
  is_header: z.boolean(),
  category: hierarchyAccount.nullable(),
  section: hierarchyAccount.nullable(),
  currency: currency.nullable(),
  bank_account_id: identifier.nullable(),
  identity_mode: z.enum(["legacy_detailed", "nominal_only"]).nullable(),
  state: financeNominalStateSchema.nullable(),
  version: version.nullable(),
  banking_available: z.boolean(),
});

export const financeNominalDirectorySchema = z.strictObject({
  items: z.array(financeNominalSummarySchema),
  next_cursor: z.string().max(512).nullable(),
});

export const financeNominalDetailSchema = financeNominalSummarySchema.extend({
  created_at: z.string().datetime(),
  self_decision_requires_override: z.boolean(),
  super_admin_override_allowed: z.boolean(),
  capabilities: z.strictObject({
    update: z.boolean(),
    submit: z.boolean(),
    decide: z.boolean(),
    deactivate: z.boolean(),
  }),
  events: z.array(
    z.strictObject({
      id: identifier,
      event_type: z.enum(["created", "updated", "submitted", "approved", "rejected", "deactivated"]),
      actor_name: z.string().min(1).max(200),
      reason: reason.nullable(),
      occurred_at: z.string().datetime(),
      approval_override_event_id: identifier.nullable(),
    }),
  ),
});

export const createFinanceNominalRequestSchema = z.strictObject({
  company_id: identifier,
  category_id: identifier,
  section_id: identifier,
  name: nominalName,
  currency,
  description: description.optional(),
});

export const updateFinanceNominalRequestSchema = z
  .strictObject({
    expected_version: version,
    name: nominalName.optional(),
    currency: currency.optional(),
    description: description.nullable().optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.currency !== undefined || value.description !== undefined,
    "At least one nominal field is required.",
  );

export const submitFinanceNominalRequestSchema = z.strictObject({ expected_version: version, reason });
export const decideFinanceNominalRequestSchema = z.strictObject({
  expected_version: version,
  action: z.enum(["approve", "reject"]),
  reason,
});
export const changeFinanceNominalStatusRequestSchema = z.strictObject({
  expected_version: version,
  action: z.literal("deactivate"),
  reason,
});

export const financeNominalMutationResultSchema = z.strictObject({
  id: identifier,
  bank_account_id: identifier,
  code: z.string().min(1).max(128),
  state: financeNominalStateSchema,
  version,
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export type FinanceNominalState = z.infer<typeof financeNominalStateSchema>;
export type FinanceNominalOptionsQuery = z.infer<typeof financeNominalOptionsQuerySchema>;
export type FinanceNominalDirectoryQuery = z.infer<typeof financeNominalDirectoryQuerySchema>;
export type FinanceNominalOptions = z.infer<typeof financeNominalOptionsSchema>;
export type FinanceNominalSummary = z.infer<typeof financeNominalSummarySchema>;
export type FinanceNominalDirectory = z.infer<typeof financeNominalDirectorySchema>;
export type FinanceNominalDetail = z.infer<typeof financeNominalDetailSchema>;
export type CreateFinanceNominalRequest = z.infer<typeof createFinanceNominalRequestSchema>;
export type UpdateFinanceNominalRequest = z.infer<typeof updateFinanceNominalRequestSchema>;
export type SubmitFinanceNominalRequest = z.infer<typeof submitFinanceNominalRequestSchema>;
export type DecideFinanceNominalRequest = z.infer<typeof decideFinanceNominalRequestSchema>;
export type ChangeFinanceNominalStatusRequest = z.infer<typeof changeFinanceNominalStatusRequestSchema>;
export type FinanceNominalMutationResult = z.infer<typeof financeNominalMutationResultSchema>;
