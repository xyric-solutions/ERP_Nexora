import { z } from "zod";
export { assetCategoryTemplates, assetFieldTemplates } from "./templates.js";

const id = z.string().trim().min(1).max(128);
const text = z.string().trim().max(500);
const amount = z.string().regex(/^(0|[1-9]\d{0,19})(\.\d{1,8})?$/);
const date = z.iso.date();
export const assetCompanyPolicyInputSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().nonnegative(),
  method: z.enum(["straight_line", "reducing_balance", "double_declining"]),
  useful_life_months: z.number().int().min(1).max(1200),
  annual_rate_percent: z.number().positive().max(100),
  residual_percent: z.number().min(0).max(100),
  summary_frequency: z.enum(["daily", "monthly", "quarterly", "annual"]),
  start_rule: z.enum(["available_for_use", "next_month"]),
  allow_start_override: z.boolean(),
  allow_category_overrides: z.boolean(),
  auto_prepare_monthly: z.boolean(),
});
export const assetCompanyPolicySchema = assetCompanyPolicyInputSchema.omit({ expected_version: true }).extend({
  version: z.number().int().positive(),
  scheduled_actor_id: id,
});
export const assetNominalClassificationInputSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().nonnegative(),
  active: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});
export type AssetCompanyPolicyInput = z.infer<typeof assetCompanyPolicyInputSchema>;
export type AssetCompanyPolicy = z.infer<typeof assetCompanyPolicySchema>;
export function assetPolicyStart(
  category: { start_rule?: "available_for_use" | "next_month" | undefined },
  available: string,
) {
  if (category.start_rule !== "next_month" || !/^\d{4}-\d{2}-\d{2}$/.test(available)) return available;
  return new Date(Date.UTC(Number(available.slice(0, 4)), Number(available.slice(5, 7)), 1)).toISOString().slice(0, 10);
}
export const assetStagedDocumentSchema = z.strictObject({
  id,
  title: z.string(),
  file_name: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int().positive(),
});
export type AssetStagedDocument = z.infer<typeof assetStagedDocumentSchema>;
export const assetValuationQuerySchema = z.strictObject({ company_id: id, as_of: date });
export const assetValuationSchema = z.strictObject({
  asset_id: id,
  as_of: date,
  basis: z.enum(["legacy_monthly", "actual_actual"]),
  daily_depreciation: amount,
  calculated_depreciation: amount,
  posted_depreciation: amount,
  unposted_accrual: amount,
  projected_net_book_value: amount,
  remaining_depreciable_value: amount,
  age_days: z.number().int().nonnegative(),
  remaining_life_days: z.number().int().nonnegative(),
  useful_life_end: date,
});
export type AssetValuation = z.infer<typeof assetValuationSchema>;
export const assetAccrualQuerySchema = z.strictObject({
  company_id: id,
  from: date,
  to: date,
  frequency: z.enum(["daily", "monthly", "quarterly", "annual"]),
});
export type AssetAccrualQuery = z.infer<typeof assetAccrualQuerySchema>;
export const assetAccrualScheduleSchema = z.strictObject({
  asset_id: id,
  frequency: z.enum(["daily", "monthly", "quarterly", "annual"]),
  rows: z
    .array(z.strictObject({ start: date, end: date, amount, accumulated_depreciation: amount, net_book_value: amount }))
    .max(366),
});
export type AssetAccrualSchedule = z.infer<typeof assetAccrualScheduleSchema>;
export const assetJournalQuerySchema = z.strictObject({
  company_id: id,
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const assetJournalDirectorySchema = z.strictObject({
  items: z.array(
    z.strictObject({ id, reference: z.string(), date, description: z.string(), debit: amount, credit: amount }),
  ),
  next_offset: z.number().int().nullable(),
});
export type AssetJournalDirectory = z.infer<typeof assetJournalDirectorySchema>;
export const assetMethodSchema = z.enum(["straight_line", "reducing_balance", "double_declining"]);
export const assetFieldDefinitionSchema = z.strictObject({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/)
    .refine((key) => !["constructor", "prototype"].includes(key)),
  label: z.string().trim().min(1).max(100),
  type: z.enum(["text", "number", "date", "select", "document"]),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});
export const assetFieldDefinitionsSchema = z
  .array(assetFieldDefinitionSchema)
  .max(40)
  .superRefine((fields, ctx) => {
    if (new Set(fields.map((field) => field.key)).size !== fields.length)
      ctx.addIssue({ code: "custom", message: "Category field keys must be unique." });
    for (const field of fields)
      if (field.type === "select" && !field.options?.length)
        ctx.addIssue({ code: "custom", message: "Select fields require bounded choices." });
  });
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
  calculation_basis: z.enum(["legacy_monthly", "actual_actual"]).optional(),
  field_template: z.enum(["general", "vehicle", "machinery", "equipment", "furniture", "building"]).optional(),
  field_definitions: assetFieldDefinitionsSchema.optional(),
  inherit_company_policy: z.boolean().optional(),
  company_policy_version: z.number().int().positive().optional(),
  start_rule: z.enum(["available_for_use", "next_month"]).optional(),
  allow_start_override: z.boolean().optional(),
  allow_policy_override: z.boolean().optional(),
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
  condition: z.enum(["new", "used", "refurbished", "good", "fair", "damaged", "missing"]),
  manufacturer: text.optional(),
  subcategory: text.optional(),
  asset_type: text.optional(),
  uom: z.string().trim().max(32).optional(),
  responsible_person: text.optional(),
  remarks: text.optional(),
  operational_status: z.enum(["under_installation", "in_service", "under_maintenance"]).optional(),
  custom_fields: z
    .record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), z.union([z.string().max(2000), z.number().finite()]))
    .refine((values) => Object.keys(values).length <= 40, "At most 40 custom fields are supported.")
    .optional(),
  warranty_provider: text.default(""),
  warranty_start: date.nullable().default(null),
  warranty_end: date.nullable().default(null),
  verification_due: date.nullable().default(null),
  maintenance_provider: text.default(""),
  evidence: assetEvidenceSchema,
});
export const assetUnitInputSchema = z.strictObject({
  unit_id: id.optional(),
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
export const purchaseAssetRegistrationSchema = z
  .strictObject({
    reason: z.string().trim().min(3).max(400).optional(),
    category_version: z.number().int().positive(),
    company_policy_version: z.number().int().positive().optional(),
    units: z.array(assetUnitInputSchema).min(1).max(100),
  })
  .superRefine((registration, ctx) => {
    const ids = registration.units.flatMap((unit) => (unit.unit_id ? [unit.unit_id] : []));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Individual asset unit identities must be unique." });
  });
export function validateAssetCustomFields(
  definitions: z.infer<typeof assetFieldDefinitionsSchema>,
  values: z.infer<typeof assetDetailsSchema>["custom_fields"] = {},
): string | null {
  for (const key of Object.keys(values))
    if (!definitions.some((field) => field.key === key)) return `Unknown category field: ${key}.`;
  for (const field of definitions) {
    const value = values[field.key];
    if (value === undefined || value === "") {
      if (field.required) return `${field.label} is required.`;
      continue;
    }
    if (field.type === "number" ? typeof value !== "number" : typeof value !== "string")
      return `${field.label} has an invalid type.`;
    if (field.type === "date" && !z.iso.date().safeParse(value).success) return `${field.label} requires a valid date.`;
    if (field.type === "document" && !/^(staged|attachment):[a-f0-9-]{36}$/.test(String(value)))
      return `${field.label} requires a private document upload.`;
    if (field.type === "select" && !field.options?.includes(String(value)))
      return `${field.label} requires a configured choice.`;
  }
  return null;
}
export type AssetFieldDefinition = z.infer<typeof assetFieldDefinitionSchema>;
export type AssetUnitInput = z.infer<typeof assetUnitInputSchema>;
export type PurchaseAssetRegistration = z.infer<typeof purchaseAssetRegistrationSchema>;
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
  purchase_order_reference: z.string().nullable().optional(),
  purchase_bill_reference: z.string().nullable().optional(),
  vendor_invoice_reference: z.string().nullable().optional(),
  invoice_date: date.nullable().optional(),
  purchase_date: date.nullable().optional(),
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
  purchase_reference: z.string().nullable().optional(),
  supplier_name: z.string().nullable().optional(),
  accrual_basis: z
    .strictObject({ start: date, opening_carrying: amount, opening_accumulated: amount })
    .nullable()
    .optional(),
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
  valuation: assetValuationSchema.optional(),
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
  preparation_result: z
    .strictObject({ status: z.string(), error_code: z.string().nullable(), updated_at: z.string() })
    .nullable()
    .optional(),
  company_policy: assetCompanyPolicySchema.nullable().optional(),
  base_currency: z.string(),
  decimal_places: z.number().int(),
  categories: z.array(assetCategorySchema),
  accounts: z.array(
    option.extend({
      type: z.string(),
      fixed_asset: z.boolean().optional(),
      classification_version: z.number().int().optional(),
    }),
  ),
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
