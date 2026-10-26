import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const cursor = z.string().trim().min(1).max(512);
const reason = z.string().trim().min(3).max(500);
const reference = z.string().trim().min(1).max(128);
const narration = z.string().trim().min(1).max(500);
const signedAmount = z.string().regex(/^-?(0|[1-9]\d{0,29})(\.\d{1,8})?$/);
const unsignedAmount = z.string().regex(/^(0|[1-9]\d{0,29})(\.\d{1,8})?$/);
const positiveRate = z
  .string()
  .regex(/^(0|[1-9]\d{0,19})(\.\d{1,18})?$/)
  .refine((value) => value.replace(/[.0]/g, "").length > 0, "Exchange rate must be greater than zero.");

export const bankRevaluationStateSchema = z.enum(["draft", "submitted", "approved", "rejected", "posted", "reversed"]);
export const bankRevaluationDirectionSchema = z.enum(["gain", "loss", "none"]);
export const bankRevaluationReversalStateSchema = z.enum(["not_scheduled", "pending", "posted", "failed"]);

export const bankRevaluationPolicySchema = z.strictObject({
  id,
  company_id: id,
  unrealized_gain_nominal_id: id,
  unrealized_gain_nominal_code: z.string().trim().min(1).max(64),
  unrealized_gain_nominal_name: z.string().trim().min(1).max(160),
  unrealized_loss_nominal_id: id,
  unrealized_loss_nominal_code: z.string().trim().min(1).max(64),
  unrealized_loss_nominal_name: z.string().trim().min(1).max(160),
  reversal_mode: z.literal("next_open_period_first_day"),
  status: z.enum(["active", "inactive"]),
  version,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export const upsertBankRevaluationPolicyRequestSchema = z
  .strictObject({
    company_id: id,
    expected_version: version.optional(),
    unrealized_gain_nominal_id: id,
    unrealized_loss_nominal_id: id,
    status: z.enum(["active", "inactive"]).default("active"),
    reason,
  })
  .refine((value) => value.unrealized_gain_nominal_id !== value.unrealized_loss_nominal_id, {
    message: "Unrealized gain and loss nominals must be different.",
    path: ["unrealized_loss_nominal_id"],
  });

export const bankRevaluationPolicyMutationSchema = z.strictObject({
  id,
  version,
  audit_event_id: id,
  replayed: z.boolean(),
});

export const bankRevaluationDirectoryQuerySchema = z
  .strictObject({
    company_id: id,
    currency: currencyCode.optional(),
    bank_account_id: id.optional(),
    states: z.array(bankRevaluationStateSchema).min(1).max(6).optional(),
    date_from: z.iso.date().optional(),
    date_to: z.iso.date().optional(),
    search: z.string().trim().max(160).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: cursor.optional(),
  })
  .refine((value) => !value.date_from || !value.date_to || value.date_from <= value.date_to, {
    message: "date_from must be on or before date_to.",
    path: ["date_to"],
  });

export const bankRevaluationSummarySchema = z.strictObject({
  id,
  company_id: id,
  voucher_number: reference,
  external_reference: reference.nullable(),
  revaluation_date: z.iso.date(),
  base_currency: currencyCode,
  currency: currencyCode,
  closing_rate: positiveRate,
  foreign_balance: signedAmount,
  carrying_base_balance: signedAmount,
  revalued_base_balance: signedAmount,
  gain_loss_amount: signedAmount,
  direction: bankRevaluationDirectionSchema,
  account_count: z.number().int().min(0).max(10_000),
  state: bankRevaluationStateSchema,
  reversal_state: bankRevaluationReversalStateSchema,
  version,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export const bankRevaluationDirectorySchema = z.strictObject({
  items: z.array(bankRevaluationSummarySchema).max(100),
  next_cursor: cursor.nullable(),
});

export const bankRevaluationPreviewRequestSchema = z.strictObject({
  company_id: id,
  currency: currencyCode,
  revaluation_date: z.iso.date(),
});

export const bankRevaluationRateSnapshotSchema = z.strictObject({
  rate_id: id,
  source_currency: currencyCode,
  target_currency: currencyCode,
  rate: positiveRate,
  effective_date: z.iso.date(),
  revision_version: version,
});

export const bankRevaluationPolicySnapshotSchema = z.strictObject({
  policy_id: id,
  policy_version: version,
  unrealized_gain_nominal_id: id,
  unrealized_loss_nominal_id: id,
  reversal_mode: z.literal("next_open_period_first_day"),
});

export const bankRevaluationLineSchema = z.strictObject({
  id: id.nullable(),
  bank_account_id: id,
  bank_account_code: z.string().trim().min(1).max(64),
  bank_account_name: z.string().trim().min(1).max(160),
  bank_name: z.string().trim().min(1).max(160),
  control_nominal_id: id,
  control_nominal_code: z.string().trim().min(1).max(64),
  currency: currencyCode,
  foreign_balance: signedAmount,
  carrying_base_balance: signedAmount,
  revalued_base_balance: signedAmount,
  adjustment: signedAmount,
  direction: bankRevaluationDirectionSchema,
});

export const bankRevaluationTotalsSchema = z.strictObject({
  foreign_balance: signedAmount,
  carrying_base_balance: signedAmount,
  revalued_base_balance: signedAmount,
  total_gain: unsignedAmount,
  total_loss: unsignedAmount,
  net_gain_loss: signedAmount,
});

export const bankRevaluationPreviewSchema = z.strictObject({
  company_id: id,
  base_currency: currencyCode,
  currency: currencyCode,
  revaluation_date: z.iso.date(),
  rate_snapshot: bankRevaluationRateSnapshotSchema,
  policy_snapshot: bankRevaluationPolicySnapshotSchema,
  lines: z.array(bankRevaluationLineSchema).max(10_000),
  totals: bankRevaluationTotalsSchema,
  source_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  generated_at: z.iso.datetime({ offset: true }),
});

export const bankRevaluationJournalLinePreviewSchema = z.strictObject({
  nominal_id: id,
  nominal_code: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1).max(500),
  debit: unsignedAmount,
  credit: unsignedAmount,
});

export const bankRevaluationAccountingPreviewSchema = z.strictObject({
  posting_date: z.iso.date(),
  period_id: id,
  currency: currencyCode,
  lines: z.array(bankRevaluationJournalLinePreviewSchema).min(2).max(20_002),
  debit_total: unsignedAmount,
  credit_total: unsignedAmount,
  balanced: z.boolean(),
});

export const bankRevaluationDetailSchema = bankRevaluationSummarySchema.extend({
  narration: narration.nullable(),
  rate_snapshot: bankRevaluationRateSnapshotSchema,
  policy_snapshot: bankRevaluationPolicySnapshotSchema,
  lines: z.array(bankRevaluationLineSchema).max(10_000),
  totals: bankRevaluationTotalsSchema,
  accounting_preview: bankRevaluationAccountingPreviewSchema.nullable(),
  source_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  maker_user_id: id,
  approver_user_id: id.nullable(),
  submitted_by: id.nullable(),
  submitted_at: z.iso.datetime({ offset: true }).nullable(),
  decided_by: id.nullable(),
  decided_at: z.iso.datetime({ offset: true }).nullable(),
  decision_reason: reason.nullable(),
  super_admin_override_used: z.boolean(),
  decision_evidence_id: id.nullable(),
  posted_by: id.nullable(),
  posted_at: z.iso.datetime({ offset: true }).nullable(),
  journal_entry_id: id.nullable(),
  reversal_scheduled_date: z.iso.date().nullable(),
  reversal_journal_entry_id: id.nullable(),
  reversed_at: z.iso.datetime({ offset: true }).nullable(),
});

export const createBankRevaluationRequestSchema = z.strictObject({
  company_id: id,
  currency: currencyCode,
  revaluation_date: z.iso.date(),
  external_reference: reference.optional(),
  narration: narration.optional(),
  approver_user_id: id.optional(),
});

export const updateBankRevaluationRequestSchema = z
  .strictObject({
    expected_version: version,
    currency: currencyCode.optional(),
    revaluation_date: z.iso.date().optional(),
    external_reference: reference.nullable().optional(),
    narration: narration.nullable().optional(),
    approver_user_id: id.nullable().optional(),
  })
  .refine(
    (value) =>
      value.currency !== undefined ||
      value.revaluation_date !== undefined ||
      value.external_reference !== undefined ||
      value.narration !== undefined ||
      value.approver_user_id !== undefined,
    { message: "At least one editable draft field is required." },
  );

export const submitBankRevaluationRequestSchema = z.strictObject({
  expected_version: version,
  reason: reason.optional(),
});

export const decideBankRevaluationRequestSchema = z
  .strictObject({
    expected_version: version,
    action: z.enum(["approve", "reject"]),
    reason: reason.optional(),
  })
  .refine((value) => value.action !== "reject" || value.reason !== undefined, {
    message: "A reason is required when rejecting a Bank Revaluation.",
    path: ["reason"],
  });

export const approveBankRevaluationRequestSchema = z.strictObject({
  expected_version: version,
  reason: reason.optional(),
});

export const rejectBankRevaluationRequestSchema = z.strictObject({
  expected_version: version,
  reason,
});

export const postBankRevaluationRequestSchema = z.strictObject({
  expected_version: version,
});

export const reverseBankRevaluationRequestSchema = z.strictObject({
  expected_version: version,
  reason,
});

export const bankRevaluationMutationResultSchema = z.strictObject({
  id,
  voucher_number: reference,
  state: bankRevaluationStateSchema,
  version,
  audit_event_id: id,
  journal_entry_id: id.nullable(),
  reversal_scheduled_date: z.iso.date().nullable(),
  replayed: z.boolean(),
});

export const bankRevaluationEventSchema = z.strictObject({
  id,
  revaluation_id: id,
  event_type: z.enum([
    "created",
    "updated",
    "submitted",
    "approved",
    "rejected",
    "posted",
    "reversal_scheduled",
    "reversal_failed",
    "reversed",
  ]),
  from_state: bankRevaluationStateSchema.nullable(),
  to_state: bankRevaluationStateSchema.nullable(),
  actor_user_id: id.nullable(),
  reason: z.string().trim().min(1).max(500).nullable(),
  super_admin_override_used: z.boolean(),
  decision_evidence_id: id.nullable(),
  occurred_at: z.iso.datetime({ offset: true }),
});

export const bankRevaluationEventDirectorySchema = z.strictObject({
  items: z.array(bankRevaluationEventSchema).max(100),
  next_cursor: cursor.nullable(),
});

export const bankRevaluationEventDirectoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: cursor.optional(),
});

export type BankRevaluationState = z.infer<typeof bankRevaluationStateSchema>;
export type BankRevaluationPolicy = z.infer<typeof bankRevaluationPolicySchema>;
export type UpsertBankRevaluationPolicyRequest = z.infer<typeof upsertBankRevaluationPolicyRequestSchema>;
export type BankRevaluationPolicyMutation = z.infer<typeof bankRevaluationPolicyMutationSchema>;
export type BankRevaluationDirectoryQuery = z.infer<typeof bankRevaluationDirectoryQuerySchema>;
export type BankRevaluationSummary = z.infer<typeof bankRevaluationSummarySchema>;
export type BankRevaluationDirectory = z.infer<typeof bankRevaluationDirectorySchema>;
export type BankRevaluationPreviewRequest = z.infer<typeof bankRevaluationPreviewRequestSchema>;
export type BankRevaluationRateSnapshot = z.infer<typeof bankRevaluationRateSnapshotSchema>;
export type BankRevaluationPolicySnapshot = z.infer<typeof bankRevaluationPolicySnapshotSchema>;
export type BankRevaluationLine = z.infer<typeof bankRevaluationLineSchema>;
export type BankRevaluationTotals = z.infer<typeof bankRevaluationTotalsSchema>;
export type BankRevaluationPreview = z.infer<typeof bankRevaluationPreviewSchema>;
export type BankRevaluationAccountingPreview = z.infer<typeof bankRevaluationAccountingPreviewSchema>;
export type BankRevaluationDetail = z.infer<typeof bankRevaluationDetailSchema>;
export type CreateBankRevaluationRequest = z.infer<typeof createBankRevaluationRequestSchema>;
export type UpdateBankRevaluationRequest = z.infer<typeof updateBankRevaluationRequestSchema>;
export type SubmitBankRevaluationRequest = z.infer<typeof submitBankRevaluationRequestSchema>;
export type DecideBankRevaluationRequest = z.infer<typeof decideBankRevaluationRequestSchema>;
export type ApproveBankRevaluationRequest = z.infer<typeof approveBankRevaluationRequestSchema>;
export type RejectBankRevaluationRequest = z.infer<typeof rejectBankRevaluationRequestSchema>;
export type PostBankRevaluationRequest = z.infer<typeof postBankRevaluationRequestSchema>;
export type ReverseBankRevaluationRequest = z.infer<typeof reverseBankRevaluationRequestSchema>;
export type BankRevaluationMutationResult = z.infer<typeof bankRevaluationMutationResultSchema>;
export type BankRevaluationEvent = z.infer<typeof bankRevaluationEventSchema>;
export type BankRevaluationEventDirectory = z.infer<typeof bankRevaluationEventDirectorySchema>;
export type BankRevaluationEventDirectoryQuery = z.infer<typeof bankRevaluationEventDirectoryQuerySchema>;
