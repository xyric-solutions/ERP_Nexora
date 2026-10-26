import { z } from "zod";

import { bankStatementLineSchema } from "./statement-imports.js";

const identifier = z.string().trim().min(1).max(128);
const isoCurrency = z.string().regex(/^[A-Z]{3}$/);
const isoDate = z.string().date();
const isoDateTime = z.string().datetime();
const version = z.number().int().positive();
const reason = z.string().trim().min(3).max(500);
const signedAmount = z.string().regex(/^-?(0|[1-9]\d{0,29})(\.\d{1,8})?$/);
const positiveAmount = z
  .string()
  .regex(/^(0|[1-9]\d{0,29})(\.\d{1,8})?$/)
  .refine((value) => value.replace(/[.0]/g, "").length > 0, "Amount must be greater than zero.");

export const bankReconciliationMethodSchema = z.enum(["statement_import", "manual_tick"]);
export const bankReconciliationStateSchema = z.enum(["draft", "in_progress", "submitted", "approved"]);
export const bankReconciliationMatchTypeSchema = z.enum(["exact", "suggested", "manual"]);
export const bankReconciliationMatchStateSchema = z.enum(["proposed", "confirmed", "rejected"]);
export const bankReconciliationAdjustmentKindSchema = z.enum([
  "bank_charge",
  "interest_earned",
  "unidentified_credit",
  "unidentified_debit",
  "other",
]);
export const bankReconciliationAdjustmentStateSchema = z.enum(["draft", "submitted", "approved", "posted", "reversed"]);
export const bankReconciliationOpeningBalanceSourceSchema = z.enum([
  "last_approved_reconciliation",
  "ledger_before_period",
]);

export const bankReconciliationBalanceSummarySchema = z.strictObject({
  currency: isoCurrency,
  opening_statement_balance: signedAmount,
  statement_money_in: signedAmount,
  statement_money_out: signedAmount,
  reconstructed_statement_balance: signedAmount,
  closing_statement_balance: signedAmount,
  ledger_balance_at_cutoff: signedAmount,
  unmatched_ledger_money_in: signedAmount,
  unmatched_ledger_money_out: signedAmount,
  adjusted_ledger_balance: signedAmount,
  difference: signedAmount,
  matched_count: z.number().int().nonnegative(),
  unmatched_statement_count: z.number().int().nonnegative(),
  unmatched_ledger_count: z.number().int().nonnegative(),
  adjustment_count: z.number().int().nonnegative(),
  available_ledger_money_in: signedAmount.optional(),
  available_ledger_money_out: signedAmount.optional(),
  selected_ledger_money_in: signedAmount.optional(),
  selected_ledger_money_out: signedAmount.optional(),
  calculated_selected_balance: signedAmount.optional(),
});

export const bankReconciliationSummarySchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  bank_account_id: identifier,
  bank_account_name: z.string().trim().min(1).max(160),
  method: bankReconciliationMethodSchema,
  import_id: identifier.nullable(),
  reconciliation_date: isoDate,
  statement_date: isoDate,
  period_start: isoDate,
  period_end: isoDate,
  statement_reference: z.string().trim().min(1).max(128),
  balances: bankReconciliationBalanceSummarySchema,
  state: bankReconciliationStateSchema,
  prepared_by: identifier,
  submitted_by: identifier.nullable(),
  approved_by: identifier.nullable(),
  version,
  created_at: isoDateTime,
  submitted_at: isoDateTime.nullable(),
  approved_at: isoDateTime.nullable(),
});

export const bankReconciliationDirectoryQuerySchema = z
  .strictObject({
    company_id: identifier,
    bank_account_id: identifier.optional(),
    state: bankReconciliationStateSchema.optional(),
    method: bankReconciliationMethodSchema.optional(),
    statement_date_from: isoDate.optional(),
    statement_date_to: isoDate.optional(),
    search: z.string().trim().max(160).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).max(512).optional(),
  })
  .superRefine((value, context) => {
    if (value.statement_date_from && value.statement_date_to && value.statement_date_from > value.statement_date_to) {
      context.addIssue({
        code: "custom",
        path: ["statement_date_to"],
        message: "The ending statement date cannot precede the starting date.",
      });
    }
  });

export const bankReconciliationDirectorySchema = z.strictObject({
  items: z.array(bankReconciliationSummarySchema).max(100),
  next_cursor: z.string().max(512).nullable(),
});

export const bankReconciliationLedgerCandidateSchema = z.strictObject({
  journal_line_id: identifier,
  journal_id: identifier,
  journal_entry_number: z.string().trim().min(1).max(128),
  posting_date: isoDate,
  direction: z.enum(["money_in", "money_out"]),
  amount: positiveAmount,
  currency: isoCurrency,
  reference: z.string().trim().max(128).nullable(),
  narrative: z.string().trim().max(500).nullable(),
  matched: z.boolean(),
  reversed: z.boolean(),
  manual_selected: z.boolean().default(false),
});

export const bankReconciliationMatchSchema = z.strictObject({
  id: identifier,
  statement_line_id: identifier,
  journal_line_id: identifier,
  match_type: bankReconciliationMatchTypeSchema,
  state: bankReconciliationMatchStateSchema,
  confidence_score: z.number().min(0).max(1),
  reason_codes: z.array(z.string().trim().min(1).max(64)).max(20),
  decided_by: identifier.nullable(),
  decided_at: isoDateTime.nullable(),
  version,
});

export const bankReconciliationAdjustmentSchema = z.strictObject({
  id: identifier,
  statement_line_id: identifier,
  kind: bankReconciliationAdjustmentKindSchema,
  offset_nominal_id: identifier,
  offset_nominal_code: z.string().trim().min(1).max(128),
  offset_nominal_name: z.string().trim().min(1).max(200),
  narrative: z.string().trim().min(3).max(500),
  direction: z.enum(["money_in", "money_out"]),
  amount: positiveAmount,
  currency: isoCurrency,
  state: bankReconciliationAdjustmentStateSchema,
  version,
  created_by: identifier,
  submitted_by: identifier.nullable(),
  approved_by: identifier.nullable(),
  posted_by: identifier.nullable(),
  reversed_by: identifier.nullable(),
  journal_id: identifier.nullable(),
  bank_journal_line_id: identifier.nullable(),
});

export const bankReconciliationAuditEventSchema = z.strictObject({
  id: identifier,
  action: z.string().trim().min(1).max(64),
  actor_id: identifier,
  actor_label: z.string().trim().min(1).max(200),
  previous_state: z.string().trim().max(64).nullable(),
  resulting_state: z.string().trim().max(64),
  reason: z.string().trim().max(500).nullable(),
  occurred_at: isoDateTime,
});

export const bankReconciliationDetailSchema = bankReconciliationSummarySchema.extend({
  statement_lines: z.array(bankStatementLineSchema).max(1_000),
  ledger_candidates: z.array(bankReconciliationLedgerCandidateSchema).max(2_000),
  matches: z.array(bankReconciliationMatchSchema).max(1_000),
  adjustments: z.array(bankReconciliationAdjustmentSchema).max(1_000),
  timeline: z.array(bankReconciliationAuditEventSchema).max(2_000),
  ledger_population_hash: z.string().regex(/^[a-f0-9]{64}$/),
  ledger_calculated_at: isoDateTime,
  self_decision_requires_override: z.boolean(),
  super_admin_override_allowed: z.boolean(),
});

export const createBankReconciliationRequestSchema = z
  .strictObject({
    company_id: identifier,
    bank_account_id: identifier,
    method: bankReconciliationMethodSchema,
    import_id: identifier.nullable().optional(),
    reconciliation_date: isoDate,
    statement_date: isoDate,
    period_start: isoDate,
    period_end: isoDate,
    statement_reference: z.string().trim().min(1).max(128),
    opening_statement_balance: signedAmount.optional(),
    closing_statement_balance: signedAmount,
  })
  .superRefine((value, context) => {
    if (value.period_start > value.period_end || value.statement_date < value.period_end) {
      context.addIssue({
        code: "custom",
        path: ["period_end"],
        message: "The reconciliation period must end on or before the statement date.",
      });
    }
    if (value.method === "statement_import" && !value.import_id) {
      context.addIssue({
        code: "custom",
        path: ["import_id"],
        message: "Statement import reconciliation requires an import.",
      });
    }
    if (value.method === "manual_tick" && value.import_id) {
      context.addIssue({
        code: "custom",
        path: ["import_id"],
        message: "Manual reconciliation cannot attach an import.",
      });
    }
  });

export const bankReconciliationSetupQuerySchema = z
  .strictObject({
    company_id: identifier,
    bank_account_id: identifier,
    period_start: isoDate,
    period_end: isoDate,
    statement_date: isoDate,
  })
  .superRefine((value, context) => {
    if (value.period_start > value.period_end || value.period_end > value.statement_date) {
      context.addIssue({
        code: "custom",
        path: ["period_end"],
        message: "The reconciliation period must end on or before the statement date.",
      });
    }
  });

export const bankReconciliationSetupSchema = z.strictObject({
  company_id: identifier,
  bank_account_id: identifier,
  bank_account_name: z.string().trim().min(1).max(160),
  currency: isoCurrency,
  opening_statement_balance: signedAmount,
  opening_balance_source: bankReconciliationOpeningBalanceSourceSchema,
  last_approved_reconciliation_id: identifier.nullable(),
  last_approved_statement_date: isoDate.nullable(),
  available_receipts: signedAmount,
  available_payments: signedAmount,
  available_transaction_count: z.number().int().nonnegative().max(2_000),
});

export const setBankReconciliationManualSelectionRequestSchema = z.strictObject({
  expected_version: version,
  journal_line_id: identifier,
  selected: z.boolean(),
});

export const createBankReconciliationMatchRequestSchema = z
  .strictObject({
    action: z.enum(["propose", "confirm_exact", "confirm_manual"]),
    expected_version: version,
    statement_line_id: identifier.optional(),
    journal_line_id: identifier.optional(),
  })
  .superRefine((value, context) => {
    if (value.action !== "propose" && (!value.statement_line_id || !value.journal_line_id)) {
      context.addIssue({
        code: "custom",
        message: "Confirming a match requires one statement line and one journal line.",
      });
    }
  });

export const decideBankReconciliationMatchRequestSchema = z
  .strictObject({
    action: z.enum(["confirm", "reject"]),
    expected_version: version,
    reason: reason.optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "reject" && !value.reason) {
      context.addIssue({ code: "custom", path: ["reason"], message: "Rejecting a match requires a reason." });
    }
  });

export const unmatchBankReconciliationRequestSchema = z.strictObject({ expected_version: version, reason });

export const createBankReconciliationAdjustmentRequestSchema = z.strictObject({
  expected_version: version,
  statement_line_id: identifier,
  kind: bankReconciliationAdjustmentKindSchema,
  offset_nominal_id: identifier,
  narrative: z.string().trim().min(3).max(500),
});

export const updateBankReconciliationAdjustmentRequestSchema = z
  .strictObject({
    expected_version: version,
    kind: bankReconciliationAdjustmentKindSchema.optional(),
    offset_nominal_id: identifier.optional(),
    narrative: z.string().trim().min(3).max(500).optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "expected_version"), "An adjustment change is required.");

export const submitBankReconciliationAdjustmentRequestSchema = z.strictObject({ expected_version: version });
export const decideBankReconciliationAdjustmentRequestSchema = z
  .strictObject({
    action: z.enum(["approve", "reject"]),
    expected_version: version,
    reason: reason.optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "reject" && !value.reason) {
      context.addIssue({ code: "custom", path: ["reason"], message: "Rejecting an adjustment requires a reason." });
    }
  });
export const postBankReconciliationAdjustmentRequestSchema = z.strictObject({ expected_version: version });
export const reverseBankReconciliationAdjustmentRequestSchema = z.strictObject({ expected_version: version, reason });

export const submitBankReconciliationRequestSchema = z.strictObject({ expected_version: version });
export const decideBankReconciliationRequestSchema = z
  .strictObject({
    action: z.enum(["approve", "reject"]),
    expected_version: version,
    reason: reason.optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "reject" && !value.reason) {
      context.addIssue({ code: "custom", path: ["reason"], message: "Rejecting a reconciliation requires a reason." });
    }
  });

export const bankReconciliationMutationResultSchema = z.strictObject({
  id: identifier,
  state: bankReconciliationStateSchema,
  version,
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export const bankReconciliationMatchMutationResultSchema = z.strictObject({
  reconciliation_id: identifier,
  reconciliation_version: version,
  match: bankReconciliationMatchSchema.nullable(),
  balances: bankReconciliationBalanceSummarySchema,
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export const bankReconciliationAdjustmentMutationResultSchema = z.strictObject({
  reconciliation_id: identifier,
  reconciliation_version: version,
  adjustment: bankReconciliationAdjustmentSchema,
  balances: bankReconciliationBalanceSummarySchema,
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export const bankReconciliationManualSelectionMutationResultSchema = z.strictObject({
  reconciliation_id: identifier,
  reconciliation_version: version,
  journal_line_id: identifier,
  selected: z.boolean(),
  balances: bankReconciliationBalanceSummarySchema,
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export type BankReconciliationState = z.infer<typeof bankReconciliationStateSchema>;
export type BankReconciliationSummary = z.infer<typeof bankReconciliationSummarySchema>;
export type BankReconciliationDirectoryQuery = z.infer<typeof bankReconciliationDirectoryQuerySchema>;
export type BankReconciliationDirectory = z.infer<typeof bankReconciliationDirectorySchema>;
export type BankReconciliationDetail = z.infer<typeof bankReconciliationDetailSchema>;
export type BankReconciliationLedgerCandidate = z.infer<typeof bankReconciliationLedgerCandidateSchema>;
export type BankReconciliationMatch = z.infer<typeof bankReconciliationMatchSchema>;
export type BankReconciliationAdjustment = z.infer<typeof bankReconciliationAdjustmentSchema>;
export type BankReconciliationOpeningBalanceSource = z.infer<typeof bankReconciliationOpeningBalanceSourceSchema>;
export type BankReconciliationSetupQuery = z.infer<typeof bankReconciliationSetupQuerySchema>;
export type BankReconciliationSetup = z.infer<typeof bankReconciliationSetupSchema>;
export type CreateBankReconciliationRequest = z.infer<typeof createBankReconciliationRequestSchema>;
export type CreateBankReconciliationMatchRequest = z.infer<typeof createBankReconciliationMatchRequestSchema>;
export type SetBankReconciliationManualSelectionRequest = z.infer<
  typeof setBankReconciliationManualSelectionRequestSchema
>;
export type DecideBankReconciliationMatchRequest = z.infer<typeof decideBankReconciliationMatchRequestSchema>;
export type UnmatchBankReconciliationRequest = z.infer<typeof unmatchBankReconciliationRequestSchema>;
export type CreateBankReconciliationAdjustmentRequest = z.infer<typeof createBankReconciliationAdjustmentRequestSchema>;
export type UpdateBankReconciliationAdjustmentRequest = z.infer<typeof updateBankReconciliationAdjustmentRequestSchema>;
export type SubmitBankReconciliationAdjustmentRequest = z.infer<typeof submitBankReconciliationAdjustmentRequestSchema>;
export type DecideBankReconciliationAdjustmentRequest = z.infer<typeof decideBankReconciliationAdjustmentRequestSchema>;
export type PostBankReconciliationAdjustmentRequest = z.infer<typeof postBankReconciliationAdjustmentRequestSchema>;
export type ReverseBankReconciliationAdjustmentRequest = z.infer<
  typeof reverseBankReconciliationAdjustmentRequestSchema
>;
export type SubmitBankReconciliationRequest = z.infer<typeof submitBankReconciliationRequestSchema>;
export type DecideBankReconciliationRequest = z.infer<typeof decideBankReconciliationRequestSchema>;
export type BankReconciliationMutationResult = z.infer<typeof bankReconciliationMutationResultSchema>;
export type BankReconciliationMatchMutationResult = z.infer<typeof bankReconciliationMatchMutationResultSchema>;
export type BankReconciliationAdjustmentMutationResult = z.infer<
  typeof bankReconciliationAdjustmentMutationResultSchema
>;
export type BankReconciliationManualSelectionMutationResult = z.infer<
  typeof bankReconciliationManualSelectionMutationResultSchema
>;
