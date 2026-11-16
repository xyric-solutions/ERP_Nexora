import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const text = z.string().trim().max(500);
const amount = z.string().regex(/^(0|[1-9]\d{0,19})(\.\d{1,8})?$/);
const date = z.iso.date();
export const assetMethodSchema = z.enum(["straight_line", "reducing_balance"]);
export const assetStatusSchema = z.enum([
  "draft",
  "submitted",
  "approved",
  "active",
  "fully_depreciated",
  "returned",
  "disposed",
]);
export const assetAssignmentSchema = z.strictObject({
  custodian_id: id.nullable().default(null),
  department_id: id.nullable().default(null),
  branch_id: id.nullable().default(null),
  location_id: id.nullable().default(null),
  project_id: id.nullable().default(null),
});
export const assetEvidenceSchema = z
  .array(z.strictObject({ reference: z.string().trim().min(1).max(200), description: text }))
  .max(30)
  .default([]);
const assetCategoryBaseSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().min(0),
  name: z.string().trim().min(2).max(200),
  active: z.boolean(),
  asset_account_id: id,
  accumulated_account_id: id,
  expense_account_id: id,
  gain_account_id: id,
  loss_account_id: id,
  impairment_account_id: id,
  useful_life_months: z.number().int().min(1).max(1200),
  method: assetMethodSchema,
  annual_rate_percent: z.number().min(0).max(100),
  residual_percent: z.number().min(0).max(100),
  convention: z.enum(["full_month", "actual_days"]),
  capitalization_threshold: amount,
  numbering_prefix: z
    .string()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/)
    .refine((value) => !["FAC", "FAE", "DEP"].includes(value), "Choose a prefix reserved for asset records.")
    .default("FA"),
});
export const assetCategoryInputSchema = assetCategoryBaseSchema.superRefine((value, ctx) => {
  if (
    new Set([
      value.asset_account_id,
      value.accumulated_account_id,
      value.expense_account_id,
      value.gain_account_id,
      value.loss_account_id,
      value.impairment_account_id,
    ]).size !== 6
  )
    ctx.addIssue({ code: "custom", message: "Each accounting role requires a distinct account." });
  if (value.method === "reducing_balance" && value.annual_rate_percent <= 0)
    ctx.addIssue({
      code: "custom",
      path: ["annual_rate_percent"],
      message: "Reducing balance requires a positive annual rate.",
    });
});
export const assetCategorySchema = assetCategoryBaseSchema
  .omit({ expected_version: true })
  .extend({ id, code: id, version: z.number().int().positive() });
export const assetDetailsSchema = z.strictObject({
  name: z.string().trim().min(2).max(200),
  description: text.default(""),
  brand: text.default(""),
  model: text.default(""),
  serial_number: z.string().trim().max(128).default(""),
  barcode: z.string().trim().max(128).default(""),
  condition: z.enum(["new", "good", "fair", "damaged", "missing"]),
  warranty_provider: text.default(""),
  warranty_start: date.nullable().default(null),
  warranty_end: date.nullable().default(null),
  verification_due: date.nullable().default(null),
  maintenance_provider: text.default(""),
  evidence: assetEvidenceSchema,
});
export const assetUnitInputSchema = z.strictObject({
  details: assetDetailsSchema,
  cost: amount,
  residual_value: amount,
  useful_life_months: z.number().int().min(1).max(1200),
  method: assetMethodSchema,
  annual_rate_percent: z.number().min(0).max(100),
  in_service_date: date,
  depreciation_start: date,
  assignment: assetAssignmentSchema,
});
export const assetCreateSchema = z.strictObject({
  company_id: id,
  category_id: id,
  source_line_id: id,
  supplier_id: id.optional(),
  units: z.array(assetUnitInputSchema).min(1).max(100),
  reason: z.string().trim().min(3).max(500),
});
export const assetDraftPolicySchema = z.strictObject({
  residual_value: amount,
  useful_life_months: z.number().int().min(1).max(1200),
  method: assetMethodSchema,
  annual_rate_percent: z.number().min(0).max(100),
  in_service_date: date,
  depreciation_start: date,
});
export const assetUpdateSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().positive(),
  details: assetDetailsSchema,
  depreciation: assetDraftPolicySchema.optional(),
  reason: z.string().trim().min(3).max(500),
});
export const assetActionSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().positive(),
  action: z.enum(["submit", "approve", "reject", "activate"]),
  reason: z.string().trim().min(3).max(500),
});
export const assetQuerySchema = z.strictObject({
  company_id: id,
  search: z.string().trim().max(100).default(""),
  category_id: id.optional(),
  status: assetStatusSchema.optional(),
  department_id: id.optional(),
  location_id: id.optional(),
  project_id: id.optional(),
  custodian_id: id.optional(),
  supplier_id: id.optional(),
  from: date.optional(),
  to: date.optional(),
  event_from: date.optional(),
  event_to: date.optional(),
  verification_exceptions: z.literal("true").optional(),
  sort: z.enum(["code", "cost", "acquired"]).default("code"),
  event_type: z
    .enum(["transfer", "maintenance", "verification", "impairment", "disposal", "return", "refund"])
    .optional(),
  source_id: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export const assetSourceSchema = z.strictObject({
  line_id: id,
  journal_id: id,
  entry_number: id,
  date,
  account_id: id,
  account_name: z.string(),
  source_type: z.enum(["bank_payment", "purchase_invoice"]),
  source_id: id,
  reference: z.string(),
  supplier_id: id.nullable(),
  supplier_name: z.string().nullable(),
  purchase_document_id: id.nullable(),
  bank_account_id: id.nullable(),
  currency: z.string(),
  exchange_rate: z.string(),
  base_currency: z.string(),
  base_amount: amount,
  allocated: amount,
  available: amount,
  dimensions: z.record(z.string(), z.string()),
});
export const fixedAssetSchema = z.strictObject({
  id,
  company_id: id,
  code: id,
  category_id: id,
  category_name: z.string(),
  category: assetCategorySchema,
  supplier_id: id.nullable(),
  source_line_id: id,
  acquisition_date: date,
  base_currency: z.string(),
  decimal_places: z.number().int(),
  cost: amount,
  residual_value: amount,
  accumulated_depreciation: amount,
  impairment: amount,
  net_book_value: amount,
  useful_life_months: z.number().int(),
  method: assetMethodSchema,
  annual_rate_percent: z.number(),
  in_service_date: date,
  depreciation_start: date,
  last_depreciation_end: date.nullable(),
  last_financial_date: date,
  assignment: assetAssignmentSchema,
  assignment_date: date,
  details: assetDetailsSchema,
  status: assetStatusSchema,
  version: z.number().int().positive(),
  created_by: id,
  approved_by: id.nullable(),
  created_at: z.string(),
});
const eventCommon = {
  company_id: id,
  asset_id: id,
  expected_version: z.number().int().positive(),
  date,
  reason: z.string().trim().min(3).max(500),
  evidence: assetEvidenceSchema,
};
export const assetEventInputSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...eventCommon, type: z.literal("transfer"), assignment: assetAssignmentSchema }),
  z.strictObject({
    ...eventCommon,
    type: z.literal("maintenance"),
    maintenance_type: z.string().trim().min(2).max(100),
    maintenance_status: z.enum(["planned", "in_progress", "completed"]).default("completed"),
    description: text,
    supplier_id: id.optional(),
    cost: amount,
    next_date: date.optional(),
    treatment: z.enum(["expense", "capital_improvement"]),
    source_line_id: id.optional(),
  }),
  z.strictObject({
    ...eventCommon,
    type: z.literal("verification"),
    actual_assignment: assetAssignmentSchema,
    condition: assetDetailsSchema.shape.condition,
    result: z.enum(["verified", "misplaced", "missing", "damaged", "incorrect_assignment"]),
  }),
  z.strictObject({ ...eventCommon, type: z.literal("impairment"), recoverable_amount: amount }),
  z.strictObject({
    ...eventCommon,
    type: z.literal("disposal"),
    kind: z.enum(["sale", "scrap"]),
    proceeds: amount,
    proceeds_account_id: id.optional(),
    counterparty: text.default(""),
  }),
  z.strictObject({
    ...eventCommon,
    type: z.literal("return"),
    amount: amount,
    credit_note_reference: z.string().trim().min(1).max(160),
    credit_note_item_id: id.optional(),
    refund_receivable_account_id: id.optional(),
    expected_refund_date: date.optional(),
    condition: assetDetailsSchema.shape.condition,
  }),
  z.strictObject({
    ...eventCommon,
    type: z.literal("refund"),
    return_event_id: id,
    receipt_line_id: id,
    amount: amount,
  }),
]);
export const assetEventActionSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().positive(),
  action: z.enum(["submit", "approve", "reject", "post"]),
  reason: z.string().trim().min(3).max(500),
});
export const assetPostingLineSchema = z.strictObject({
  account_id: id,
  debit: amount,
  credit: amount,
  dimensions: z.record(z.string(), z.string()),
});
export const assetDepreciationDetailSchema = z.strictObject({
  start: date,
  end: date,
  asset_id: id,
  asset_version: z.number().int().positive(),
  code: id,
  amount,
  opening_carrying: amount,
  closing_carrying: amount,
  previous_end: date.nullable(),
  skip_reason: z.string().nullable(),
});
export const assetLifecycleDepreciationSchema = z.strictObject({
  period_id: id,
  start: date,
  end: date,
  posting_date: date,
  detail: assetDepreciationDetailSchema,
});
export const assetEventPreviewSchema = z.strictObject({
  cost: amount,
  accumulated_depreciation: amount,
  impairment: amount,
  carrying: amount,
  amount: amount,
  gain: z.string(),
  lines: z.array(assetPostingLineSchema).max(10),
  linked_journal_id: id.nullable(),
  depreciation: z.array(assetLifecycleDepreciationSchema).max(12).default([]),
});
export const assetEventSchema = z.strictObject({
  journal_reference: z.string().nullable().default(null),
  id,
  code: id,
  company_id: id,
  asset_id: id,
  asset_code: id,
  type: assetEventInputSchema.options[0].shape.type.or(
    z.enum(["maintenance", "verification", "impairment", "disposal", "return", "refund"]),
  ),
  date,
  state: z.enum(["draft", "submitted", "approved", "rejected", "posted"]),
  version: z.number().int().positive(),
  maker_id: id,
  approver_id: id.nullable(),
  input: assetEventInputSchema,
  preview: assetEventPreviewSchema,
  journal_id: id.nullable(),
  created_at: z.string(),
  depreciation_run_ids: z.array(id).max(12).default([]),
});
export const assetDepreciationInputSchema = z.strictObject({
  company_id: id,
  period_id: id,
  asset_ids: z.array(id).min(1).max(400).optional(),
  reason: z.string().trim().min(3).max(500),
});
export const assetDepreciationActionSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().positive(),
  action: z.enum(["submit", "approve", "reject", "post", "reverse"]),
  reason: z.string().trim().min(3).max(500),
  reversal_date: date.optional(),
});
export const assetDepreciationRunSchema = z.strictObject({
  journal_reference: z.string().nullable().default(null),
  reversal_journal_reference: z.string().nullable().default(null),
  lifecycle_event_id: id.nullable().default(null),
  id,
  code: id,
  company_id: id,
  period_id: id,
  start: date,
  end: date,
  state: z.enum(["draft", "submitted", "approved", "rejected", "posted", "reversed"]),
  version: z.number().int().positive(),
  maker_id: id,
  approver_id: id.nullable(),
  total: amount,
  details: z.array(assetDepreciationDetailSchema).max(400),
  journal_id: id.nullable(),
  reversal_journal_id: id.nullable(),
});
export const assetScheduleSchema = z.strictObject({
  asset_id: id,
  base_currency: z.string(),
  annual: z.array(z.strictObject({ year: z.number().int(), depreciation: amount, posted: amount })),
  rows: z
    .array(
      z.strictObject({
        start: date,
        end: date,
        amount,
        accumulated_depreciation: amount,
        net_book_value: amount,
        posted: z.boolean(),
      }),
    )
    .max(1201),
});
export const assetHistorySchema = z.strictObject({
  id,
  action: z.string(),
  actor_id: id,
  at: z.string(),
  reason: z.string(),
  before: z.unknown(),
  after: z.unknown(),
});
export const assetAttachmentInputSchema = z.strictObject({ company_id: id, title: z.string().trim().min(1).max(200) });
export const assetAttachmentSchema = z.strictObject({
  id,
  asset_id: id,
  title: z.string(),
  file_name: z.string(),
  content_type: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  size_bytes: z.number().int().positive().max(10485760),
  checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  created_by: id,
  created_at: z.string(),
});
export const assetDetailSchema = z.strictObject({
  asset: fixedAssetSchema,
  source: assetSourceSchema,
  events: z.array(assetEventSchema),
  history: z.array(assetHistorySchema),
  history_offset: z.number().int().nonnegative(),
  history_next_offset: z.number().int().nonnegative().nullable(),
  schedule: assetScheduleSchema,
  refund_outstanding: amount,
  attachments: z.array(assetAttachmentSchema),
});
export const assetDetailQuerySchema = z.strictObject({
  company_id: id,
  history_offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
const option = z.strictObject({ id, code: z.string(), name: z.string() });
export const assetOptionsSchema = z.strictObject({
  base_currency: z.string(),
  decimal_places: z.number().int(),
  categories: z.array(assetCategorySchema),
  accounts: z.array(option.extend({ type: z.string() })),
  suppliers: z.array(option),
  employees: z.array(option),
  departments: z.array(option),
  branches: z.array(option),
  locations: z.array(option),
  projects: z.array(option),
  periods: z.array(option.extend({ start: date, end: date, status: z.string() })),
  credit_notes: z.array(option),
  refund_receipts: z.array(option),
});
export const assetDirectorySchema = z.strictObject({
  items: z.array(fixedAssetSchema),
  total: z.number().int(),
  next_offset: z.number().int().nullable(),
});
export const assetWorkspaceSchema = z.strictObject({
  assets: assetDirectorySchema,
  events: z.array(assetEventSchema),
  runs: z.array(assetDepreciationRunSchema),
});
export const assetDashboardSchema = z.strictObject({
  refunds: z.array(
    z.strictObject({
      asset_id: id,
      asset_code: id,
      asset_name: z.string(),
      supplier_name: z.string(),
      return_code: id,
      date,
      amount,
      outstanding: amount,
    }),
  ),
  refunds_next_offset: z.number().int().nonnegative().nullable(),
  group_pages: z.array(
    z.strictObject({
      dimension: z.enum(["category", "department", "location", "project", "custodian", "acquisition_month"]),
      total: z.number().int(),
      next_offset: z.number().int().nullable(),
    }),
  ),
  total: z.number().int(),
  active: z.number().int(),
  returned: z.number().int(),
  disposed: z.number().int(),
  maintenance: z.number().int(),
  verification_due: z.number().int(),
  warranty_expiring: z.number().int(),
  depreciation_due: z.number().int(),
  cost: amount,
  accumulated_depreciation: amount,
  impairment: amount,
  net_book_value: amount,
  refund_outstanding: amount,
  groups: z.array(
    z.strictObject({
      dimension: z.enum(["category", "department", "location", "project", "custodian", "acquisition_month"]),
      id: z.string(),
      label: z.string(),
      count: z.number().int(),
      cost: amount,
      accumulated_depreciation: amount,
      impairment: amount,
      net_book_value: amount,
    }),
  ),
  reconciliation: z.array(
    z.strictObject({
      account_id: id,
      account_name: z.string(),
      role: z.enum(["asset", "accumulated"]),
      register_balance: z.string(),
      gl_balance: z.string(),
      difference: z.string(),
    }),
  ),
});
export const assetSourcesSchema = z.strictObject({
  items: z.array(assetSourceSchema),
  next_offset: z.number().int().nullable(),
});
export const assetCreateResultSchema = z.strictObject({ items: z.array(fixedAssetSchema) });
export type AssetCategoryInput = z.infer<typeof assetCategoryInputSchema>;
export type AssetCategory = z.infer<typeof assetCategorySchema>;
export type AssetCreate = z.infer<typeof assetCreateSchema>;
export type FixedAsset = z.infer<typeof fixedAssetSchema>;
export type AssetQuery = z.infer<typeof assetQuerySchema>;
export type AssetUpdate = z.infer<typeof assetUpdateSchema>;
export type AssetAction = z.infer<typeof assetActionSchema>;
export type AssetSource = z.infer<typeof assetSourceSchema>;
export type AssetEventInput = z.infer<typeof assetEventInputSchema>;
export type AssetEventAction = z.infer<typeof assetEventActionSchema>;
export type AssetEvent = z.infer<typeof assetEventSchema>;
export type AssetEventPreview = z.infer<typeof assetEventPreviewSchema>;
export type AssetDepreciationInput = z.infer<typeof assetDepreciationInputSchema>;
export type AssetDepreciationAction = z.infer<typeof assetDepreciationActionSchema>;
export type AssetDepreciationRun = z.infer<typeof assetDepreciationRunSchema>;
export type AssetSchedule = z.infer<typeof assetScheduleSchema>;
export type AssetOptions = z.infer<typeof assetOptionsSchema>;
export type AssetDetail = z.infer<typeof assetDetailSchema>;
export type AssetWorkspace = z.infer<typeof assetWorkspaceSchema>;
export type AssetDashboard = z.infer<typeof assetDashboardSchema>;
export type AssetSources = z.infer<typeof assetSourcesSchema>;
export type AssetAttachment = z.infer<typeof assetAttachmentSchema>;
export type AssetAttachmentInput = z.infer<typeof assetAttachmentInputSchema>;
