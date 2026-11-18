import { z } from "zod";
export * from "./calculations.js";

const id = z.string().trim().min(1).max(128);
export const budgetImportMaxBytes = 10 * 1024 * 1024;
export const budgetImportMaxRows = 18000;
const name = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(3).max(2000);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const budgetMoneySchema = z.string().regex(/^(0|[1-9]\d{0,21})(\.\d{1,8})?$/);
const signedMoney = z.string().regex(/^-?(0|[1-9]\d{0,29})(\.\d{1,8})?$/);
const totalMoney = z.string().regex(/^(0|[1-9]\d{0,29})(\.\d{1,8})?$/);
const percent = z.string().regex(/^-?\d{1,4}(\.\d{1,4})?$/);
export const budgetDimensionsSchema = z.strictObject({
  department: id.optional(),
  project: id.optional(),
  cost_centre: id.optional(),
  branch: id.optional(),
});
export const budgetScopeSchema = z.strictObject({ company_id: id });
export const budgetQuerySchema = budgetScopeSchema.extend({
  fiscal_calendar_id: id.optional(),
  version_id: id.optional(),
  plan_id: id.optional(),
  search: z.string().trim().max(160).default(""),
  state: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
  kind: z.enum(["baseline", "revision", "scenario", "forecast"]).optional(),
  account_id: id.optional(),
  period_id: id.optional(),
  department: id.optional(),
  project: id.optional(),
  cost_centre: id.optional(),
  branch: id.optional(),
  from: z.iso.date().optional(),
  as_of: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export const budgetAllocationSchema = z.strictObject({ period_id: id, amount: budgetMoneySchema });
export const budgetLineInputSchema = z.strictObject({
  account_id: id,
  dimensions: budgetDimensionsSchema.default({}),
  notes: z.string().trim().max(2000).default(""),
  allocations: z.array(budgetAllocationSchema).min(1).max(36),
});
export const budgetPlanInputSchema = budgetScopeSchema.extend({ name, fiscal_calendar_id: id, reason });
export const budgetKindSchema = z.enum(["baseline", "revision", "scenario", "forecast"]);
export const budgetAssumptionsSchema = z.strictObject({
  case: z.enum(["best", "expected", "worst"]).optional(),
  method: z.enum(["manual", "historical", "rolling", "model", "copy"]).optional(),
  growth_percent: percent.optional(),
  history_from: z.iso.date().optional(),
  history_to: z.iso.date().optional(),
  horizon: z.number().int().min(1).max(36).optional(),
  model_id: id.optional(),
  source_version_id: id.optional(),
  algorithm: z.string().max(100).optional(),
  source_cutoff: z.iso.date().optional(),
});
export const budgetVersionInputSchema = budgetScopeSchema.extend({
  plan_id: id,
  name,
  kind: budgetKindSchema.default("baseline"),
  parent_id: id.nullable().default(null),
  cutoff: z.iso.date().nullable().default(null),
  assumptions: budgetAssumptionsSchema.default({}),
  lines: z.array(budgetLineInputSchema).max(500),
  reason,
});
export const budgetVersionUpdateSchema = budgetVersionInputSchema.extend({ expected_version: version });
export const budgetActionSchema = budgetScopeSchema.extend({
  expected_version: version,
  action: z.enum(["submit", "approve", "reject"]),
  reason,
  approver_id: id.optional(),
});
export const budgetPolicyInputSchema = budgetScopeSchema.extend({
  fiscal_calendar_id: id,
  control_version_id: id,
  expected_version: z.number().int().min(0),
  enabled: z.boolean(),
  mode: z.enum(["warning", "approval", "block"]),
  warn_percent: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,4})?$/)
    .refine((v) => Number(v) <= 100),
  effective_date: z.iso.date(),
  reason,
});
export const budgetModelInputSchema = budgetScopeSchema.extend({
  name,
  expected_version: version.optional(),
  active: z.boolean().default(true),
  reason,
  lines: z
    .array(
      z.strictObject({
        account_id: id,
        dimensions: budgetDimensionsSchema.default({}),
        notes: z.string().max(2000).default(""),
        amount: budgetMoneySchema,
        weights: z.array(z.string().regex(/^\d{1,8}(\.\d{1,4})?$/)).length(12),
      }),
    )
    .min(1)
    .max(500),
});
export const budgetApplyModelSchema = budgetScopeSchema.extend({
  version_id: id,
  model_id: id,
  expected_version: version,
  reason,
});
export const budgetGenerateSchema = budgetScopeSchema.extend({
  source_version_id: id,
  name,
  kind: z.enum(["revision", "scenario", "forecast"]),
  case: z.enum(["best", "expected", "worst"]).default("expected"),
  method: z.enum(["copy", "historical", "rolling"]).default("copy"),
  growth_percent: percent.default("0"),
  cutoff: z.iso.date(),
  history_from: z.iso.date().optional(),
  history_to: z.iso.date().optional(),
  horizon: z.number().int().min(1).max(36).default(12),
  reason,
});
const transfer = z.strictObject({
  kind: z.literal("transfer"),
  version_id: id,
  from_line_id: id,
  from_period_id: id,
  to_line_id: id,
  to_period_id: id,
  amount: budgetMoneySchema.refine((v) => /[1-9]/.test(v), "Enter a positive transfer."),
});
const exception = z.strictObject({
  kind: z.literal("exception"),
  source_document_id: id,
  source_version: version,
  source_hash: z.string().regex(/^[a-f0-9]{64}$/),
  policy_id: id,
});
const closure = z.strictObject({ kind: z.literal("closure"), commitment_id: id, effective_date: z.iso.date() });
export const budgetRequestInputSchema = budgetScopeSchema.extend({
  request: z.discriminatedUnion("kind", [transfer, exception, closure]),
  reason,
});
export const budgetRequestActionSchema = budgetScopeSchema.extend({
  expected_version: version,
  action: z.enum(["approve", "reject"]),
  reason,
});
export const budgetImportCommitSchema = budgetScopeSchema.extend({ expected_version: version, reason });
export const budgetImportPreviewQuerySchema = budgetScopeSchema.extend({
  version_id: id,
  expected_version: z.coerce.number().int().positive(),
});
export const budgetReconcileSchema = budgetScopeSchema.extend({ reason });
export const budgetCommentInputSchema = budgetScopeSchema.extend({
  version_id: id,
  account_id: id,
  period_id: id,
  comment: reason,
});

const reference = z.strictObject({ id, code: z.string(), name: z.string() });
export const budgetPeriodSchema = z.strictObject({
  id,
  fiscal_calendar_id: id,
  number: z.number().int(),
  start: z.iso.date(),
  end: z.iso.date(),
  status: z.string(),
});
export const budgetReferenceOptionsSchema = z.strictObject({
  departments: z.array(reference),
  projects: z.array(reference),
  cost_centres: z.array(reference),
  branches: z.array(reference),
  periods: z.array(budgetPeriodSchema),
});
export const budgetOptionsSchema = z.strictObject({
  currency: z.string(),
  decimal_places: z.number().int(),
  permissions: z.array(z.string()),
  calendars: z.array(reference.extend({ year: z.number().int(), start: z.iso.date(), end: z.iso.date() })),
  periods: z.array(budgetPeriodSchema),
  accounts: z.array(reference.extend({ type: z.string(), required_dimensions: z.array(z.string()) })),
  account_total: z.number().int(),
  departments: z.array(reference),
  projects: z.array(reference),
  cost_centres: z.array(reference),
  branches: z.array(reference),
  approvers: z.array(z.strictObject({ id, name })),
});
export const budgetPlanSchema = z.strictObject({
  id,
  company_id: id,
  code: z.string(),
  name,
  fiscal_calendar_id: id,
  currency: z.string(),
  owner_id: id,
  version,
});
export const budgetVersionSchema = z.strictObject({
  id,
  company_id: id,
  plan_id: id,
  number: version,
  name,
  kind: budgetKindSchema,
  state: z.enum(["draft", "submitted", "approved", "rejected"]),
  version,
  parent_id: id.nullable(),
  cutoff: z.iso.date().nullable(),
  assumptions: budgetAssumptionsSchema,
  approver_id: id.nullable(),
  created_by: id,
  updated_by: id,
  created_at: z.string(),
  updated_at: z.string(),
  total: totalMoney,
  plan_name: name,
  plan_code: z.string(),
  fiscal_calendar_id: id,
  currency: z.string(),
});
export const budgetAuditSchema = z.strictObject({
  id,
  entity: z.string(),
  entity_id: id,
  record_version: version,
  action: z.string(),
  actor_id: id,
  reason: z.string(),
  occurred_at: z.string(),
});
export const budgetDetailSchema = z.strictObject({
  comments: z.array(
    z.strictObject({ id, account_id: id, period_id: id, comment: z.string(), actor_id: id, occurred_at: z.string() }),
  ),
  forecast_summary: z
    .strictObject({
      cutoff: z.iso.date(),
      actual: signedMoney,
      remaining: signedMoney,
      eac: signedMoney,
      revenue_actual: signedMoney,
      revenue_remaining: signedMoney,
      revenue_eac: signedMoney,
    })
    .nullable(),
  record: budgetVersionSchema,
  lines: z.array(
    budgetLineInputSchema.extend({ id, account_code: z.string(), account_name: z.string(), account_type: z.string() }),
  ),
  history: z.array(budgetAuditSchema),
  approvals: z.array(z.strictObject({ actor_id: id, action: z.string(), comments: z.string(), acted_at: z.string() })),
});
export const budgetModelSchema = budgetModelInputSchema
  .omit({ reason: true, expected_version: true })
  .extend({ id, code: z.string(), version });
export const budgetPolicySchema = budgetPolicyInputSchema
  .omit({ expected_version: true })
  .extend({ id, version, created_by: id });
export const budgetSourceControlSchema = z.strictObject({
  source_document_id: id,
  code: z.string(),
  source_version: version,
  source_hash: z.string(),
  policy: budgetPolicySchema.nullable(),
  policies: z.array(budgetPolicySchema),
});
export const budgetSourceDirectorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id,
      code: z.string(),
      kind: z.enum(["order", "bill"]),
      state: z.string(),
      version,
      amount: budgetMoneySchema,
      currency: z.string(),
    }),
  ),
  total: z.number().int(),
});
export const budgetRequestSchema = z.strictObject({
  id,
  company_id: id,
  code: z.string(),
  kind: z.enum(["transfer", "exception", "closure"]),
  payload: budgetRequestInputSchema.shape.request,
  state: z.enum(["submitted", "approved", "rejected"]),
  version,
  created_by: id,
  updated_by: id,
  created_at: z.string(),
  reason: z.string(),
});
export const budgetDirectorySchema = z.strictObject({
  plans: z.array(budgetPlanSchema),
  versions: z.array(budgetVersionSchema),
  models: z.array(budgetModelSchema),
  requests: z.array(budgetRequestSchema),
  policies: z.array(budgetPolicySchema),
  total: z.number().int(),
  request_total: z.number().int(),
  model_total: z.number().int(),
  plan_total: z.number().int(),
});
export const budgetReportRowSchema = z.strictObject({
  id,
  account_id: id,
  account_code: z.string(),
  account_name: z.string(),
  account_type: z.string(),
  period_id: id,
  period_start: z.iso.date(),
  period_end: z.iso.date(),
  dimensions: budgetDimensionsSchema,
  budget: signedMoney,
  transfers: signedMoney,
  actual: signedMoney,
  commitment: signedMoney,
  available: signedMoney,
  variance: signedMoney,
  variance_percent: z.string().nullable(),
  utilization_percent: z.string().nullable(),
  favorable: z.boolean(),
  unbudgeted: z.boolean(),
});
export const budgetCommitmentSchema = z.strictObject({
  id,
  source_document_id: id,
  source_code: z.string(),
  source_line_id: id,
  account_id: id,
  account_code: z.string(),
  account_name: z.string(),
  dimensions: budgetDimensionsSchema,
  period_id: id,
  commitment_date: z.iso.date(),
  currency: z.string(),
  rate: z.string(),
  reserved: totalMoney,
  consumed: signedMoney,
  remaining: signedMoney,
});
export const budgetReportSchema = z.strictObject({
  rows: z.array(budgetReportRowSchema),
  total: z.number().int(),
  currency: z.string(),
  decimal_places: z.number().int(),
  as_of: z.iso.date(),
  policy: budgetPolicySchema.nullable(),
  complete: z.boolean(),
  issues: z.array(z.string()),
  totals: z.strictObject({
    budget: signedMoney,
    transfers: signedMoney,
    actual: signedMoney,
    commitment: signedMoney,
    available: signedMoney,
  }),
  commitments: z.array(budgetCommitmentSchema),
  commitment_total: z.number().int(),
});
export const budgetImportSchema = z.strictObject({
  id,
  version_id: id,
  target_version: version,
  version,
  state: z.enum(["preview", "committed"]),
  lines: z.array(budgetLineInputSchema),
  errors: z.array(z.strictObject({ row: z.number().int(), message: z.string() })),
  content_hash: z.string(),
});
export const budgetDrillSchema = z.strictObject({
  rows: z.array(
    z.strictObject({
      id,
      journal_id: id,
      entry_number: z.string(),
      date: z.iso.date(),
      source_type: z.string(),
      source_id: id,
      debit: totalMoney,
      credit: totalMoney,
      dimensions: z.record(z.string(), z.string()),
    }),
  ),
  total: z.number().int(),
});
export type BudgetDimensions = z.infer<typeof budgetDimensionsSchema>;
export type BudgetQuery = z.infer<typeof budgetQuerySchema>;
export type BudgetLineInput = z.infer<typeof budgetLineInputSchema>;
export type BudgetPlanInput = z.infer<typeof budgetPlanInputSchema>;
export type BudgetVersionInput = z.infer<typeof budgetVersionInputSchema>;
export type BudgetVersionUpdate = z.infer<typeof budgetVersionUpdateSchema>;
export type BudgetAction = z.infer<typeof budgetActionSchema>;
export type BudgetOptions = z.infer<typeof budgetOptionsSchema>;
export type BudgetDetail = z.infer<typeof budgetDetailSchema>;
export type BudgetVersion = z.infer<typeof budgetVersionSchema>;
export type BudgetDirectory = z.infer<typeof budgetDirectorySchema>;
export type BudgetPolicyInput = z.infer<typeof budgetPolicyInputSchema>;
export type BudgetPolicy = z.infer<typeof budgetPolicySchema>;
export type BudgetModelInput = z.infer<typeof budgetModelInputSchema>;
export type BudgetModel = z.infer<typeof budgetModelSchema>;
export type BudgetApplyModel = z.infer<typeof budgetApplyModelSchema>;
export type BudgetGenerate = z.infer<typeof budgetGenerateSchema>;
export type BudgetRequestInput = z.infer<typeof budgetRequestInputSchema>;
export type BudgetRequestAction = z.infer<typeof budgetRequestActionSchema>;
export type BudgetRequest = z.infer<typeof budgetRequestSchema>;
export type BudgetReport = z.infer<typeof budgetReportSchema>;
export type BudgetImport = z.infer<typeof budgetImportSchema>;
export type BudgetCommentInput = z.infer<typeof budgetCommentInputSchema>;
export type BudgetDrill = z.infer<typeof budgetDrillSchema>;
export type BudgetSourceControl = z.infer<typeof budgetSourceControlSchema>;
export type BudgetSourceDirectory = z.infer<typeof budgetSourceDirectorySchema>;
