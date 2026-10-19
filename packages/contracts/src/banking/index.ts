import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const isoCurrency = z.string().regex(/^[A-Z]{3}$/);
const isoDate = z.string().date();
const isoDateTime = z.string().datetime();
const decimal = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,8})?$/);
const signedDecimal = z.string().regex(/^-?(0|[1-9]\d*)(\.\d{1,8})?$/);
const boundedDecimal = z.string().regex(/^(0|[1-9]\d{0,29})(\.\d{1,8})?$/);
const positiveBoundedDecimal = boundedDecimal.refine(
  (value) => value.replace(/[.0]/g, "").length > 0,
  "Amount must be greater than zero.",
);
const positiveBoundedRate = z
  .string()
  .regex(/^(0|[1-9]\d{0,19})(\.\d{1,18})?$/)
  .refine((value) => value.replace(/[.0]/g, "").length > 0, "Exchange rate must be greater than zero.");
const zeroAmount = decimal.refine((value) => /^0(?:\.0{1,8})?$/.test(value), {
  message: "Opening balance must remain zero until Finance posting is available.",
});

export const bankAccountStateSchema = z.enum([
  "draft",
  "pending_approval",
  "active",
  "rejected",
  "inactive",
  "closed",
  "review_required",
]);
export const bankAccountTypeSchema = z.enum(["current", "deposit", "escrow", "cash"]);

export const bankingCompanyDirectorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: identifier,
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(200),
    }),
  ),
});

export const bankingLedgerAccountDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});
export const bankingLedgerAccountDirectorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: identifier,
      code: z.string().min(1).max(128),
      name: z.string().min(1).max(200),
      currency: isoCurrency.nullable(),
    }),
  ),
});

export const bankAccountDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  bank: z.string().trim().max(200).optional(),
  currency: isoCurrency.optional(),
  ledger_account_id: identifier.optional(),
  state: bankAccountStateSchema.optional(),
  sort_by: z
    .enum(["account_name", "bank_name", "currency", "ledger_balance", "last_movement_on"])
    .default("account_name"),
  sort_direction: z.enum(["asc", "desc"]).default("asc"),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export const bankAccountSummarySchema = z.strictObject({
  id: identifier,
  reference: z.string().min(1).max(64),
  account_name: z.string().min(1).max(160),
  account_type: bankAccountTypeSchema,
  bank_name: z.string().min(1).max(200),
  branch: z.string().max(200),
  account_number_masked: z.string().min(4).max(80),
  currency: isoCurrency,
  ledger_account_id: identifier,
  ledger_account_code: z.string().min(1).max(128),
  ledger_account_name: z.string().min(1).max(200),
  ledger_balance: signedDecimal,
  available_balance: signedDecimal.nullable(),
  unreconciled_count: z.number().int().min(0).nullable(),
  last_movement_on: isoDate.nullable(),
  state: bankAccountStateSchema,
  version: z.number().int().positive(),
});

export const bankAccountDirectorySchema = z.strictObject({
  items: z.array(bankAccountSummarySchema),
  next_cursor: z.string().nullable(),
});

export const bankAccountCurrencySummarySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      currency: isoCurrency,
      ledger_balance: signedDecimal,
      account_count: z.number().int().min(0),
    }),
  ),
});

export const bankAccountDetailSchema = bankAccountSummarySchema.extend({
  company_id: identifier,
  iban_masked: z.string().max(80).nullable(),
  swift_bic: z.string().max(11),
  overdraft_limit: decimal,
  created_by: identifier.nullable(),
  submitted_by: identifier.nullable(),
  approved_by: identifier.nullable(),
  rejected_by: identifier.nullable(),
  created_at: isoDateTime,
  submitted_at: isoDateTime.nullable(),
  approved_at: isoDateTime.nullable(),
  rejected_at: isoDateTime.nullable(),
  self_decision_requires_override: z.boolean(),
  super_admin_override_allowed: z.boolean(),
});

const accountNumber = z
  .string()
  .trim()
  .min(4)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ./-]*$/);
const ibanValue = z.string().trim().min(8).max(64);
const iban = ibanValue.optional();
const swiftBicValue = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/);
const swiftBic = swiftBicValue.optional();

const editableBankAccountFields = {
  account_name: z.string().trim().min(1).max(160),
  account_type: bankAccountTypeSchema,
  bank_name: z.string().trim().min(1).max(200),
  branch: z.string().trim().max(200).optional(),
  account_number: accountNumber,
  iban,
  swift_bic: swiftBic,
  currency: isoCurrency,
  ledger_account_id: identifier,
  overdraft_limit: decimal.default("0"),
  opening_balance: zeroAmount.default("0"),
} as const;

export const createBankAccountRequestSchema = z.strictObject({
  company_id: identifier,
  ...editableBankAccountFields,
});

export const updateBankAccountRequestSchema = z
  .strictObject({
    expected_version: z.number().int().positive(),
    account_name: editableBankAccountFields.account_name.optional(),
    account_type: editableBankAccountFields.account_type.optional(),
    bank_name: editableBankAccountFields.bank_name.optional(),
    branch: editableBankAccountFields.branch,
    account_number: editableBankAccountFields.account_number.optional(),
    iban: ibanValue.nullable().optional(),
    swift_bic: swiftBicValue.nullable().optional(),
    currency: editableBankAccountFields.currency.optional(),
    ledger_account_id: editableBankAccountFields.ledger_account_id.optional(),
    overdraft_limit: editableBankAccountFields.overdraft_limit.optional(),
    opening_balance: editableBankAccountFields.opening_balance.optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "expected_version"),
    "At least one bank account field is required.",
  );

export const submitBankAccountRequestSchema = z.strictObject({
  expected_version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

export const decideBankAccountRequestSchema = z.strictObject({
  action: z.enum(["approve", "reject"]),
  expected_version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

export const changeBankAccountStatusRequestSchema = z.strictObject({
  action: z.enum(["deactivate", "close"]),
  expected_version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

export const bankAccountMutationResultSchema = z.strictObject({
  id: identifier,
  reference: z.string().min(1).max(64),
  state: bankAccountStateSchema,
  version: z.number().int().positive(),
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export const bankPaymentStateSchema = z.enum([
  "draft",
  "submitted",
  "approved",
  "rejected",
  "posted",
  "reversed",
]);

export const bankPaymentMethodSchema = z.enum([
  "bank_transfer",
  "cheque",
  "cash",
  "online",
  "standing_order",
  "card",
]);

const bankPaymentReference = z.string().trim().min(1).max(128);
const bankPaymentNarration = z.string().trim().min(3).max(500);
const bankPaymentReason = z.string().trim().min(3).max(500);
const bankPaymentDimensionsRecordSchema = z.record(
  z.string().trim().min(1).max(64),
  z.string().trim().min(1).max(128),
);

export const bankPaymentDimensionsSchema = bankPaymentDimensionsRecordSchema.superRefine((value, context) => {
  if (Object.keys(value).length > 25) {
    context.addIssue({ code: "custom", message: "At most 25 accounting dimensions are allowed." });
  }
  if (JSON.stringify(value).length > 4_000) {
    context.addIssue({ code: "custom", message: "Accounting dimensions are too large." });
  }
});

const editableBankPaymentLineFields = {
  line_order: z.number().int().min(1).max(200),
  document_date: isoDate,
  external_reference: bankPaymentReference,
  document_reference: z.string().trim().min(1).max(128).nullable().optional(),
  payment_method: bankPaymentMethodSchema,
  nominal_account_id: identifier,
  narration: bankPaymentNarration,
  amount: positiveBoundedDecimal,
  dimensions: bankPaymentDimensionsSchema,
} as const;

export const bankPaymentLineInputSchema = z.strictObject(editableBankPaymentLineFields);

export const bankPaymentLineSchema = z.strictObject({
  id: identifier,
  ...editableBankPaymentLineFields,
});

const bankPaymentLinesSchema = z.array(bankPaymentLineInputSchema).min(1).max(200).superRefine((lines, context) => {
  const orders = new Set(lines.map((line) => line.line_order));
  if (orders.size !== lines.length) {
    context.addIssue({ code: "custom", message: "Payment line order values must be unique." });
  }
});

const editableBankPaymentFields = {
  bank_account_id: identifier,
  posting_date: isoDate,
  value_date: isoDate.nullable().optional(),
  lines: bankPaymentLinesSchema,
} as const;

export const createBankPaymentRequestSchema = z.strictObject({
  company_id: identifier,
  ...editableBankPaymentFields,
});

export const updateBankPaymentRequestSchema = z
  .strictObject({
    expected_version: z.number().int().positive(),
    bank_account_id: editableBankPaymentFields.bank_account_id.optional(),
    posting_date: editableBankPaymentFields.posting_date.optional(),
    value_date: editableBankPaymentFields.value_date,
    lines: editableBankPaymentFields.lines.optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "expected_version"),
    "At least one bank payment field is required.",
  );

export const submitBankPaymentRequestSchema = z.strictObject({
  expected_version: z.number().int().positive(),
});

export const decideBankPaymentRequestSchema = z
  .strictObject({
    action: z.enum(["approve", "reject"]),
    expected_version: z.number().int().positive(),
    reason: bankPaymentReason.optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "reject" && value.reason === undefined) {
      context.addIssue({ code: "custom", path: ["reason"], message: "A rejection reason is required." });
    }
  });

export const postBankPaymentRequestSchema = z.strictObject({
  expected_version: z.number().int().positive(),
});

export const reverseBankPaymentRequestSchema = z.strictObject({
  expected_version: z.number().int().positive(),
  reason: bankPaymentReason,
});

export const bankPaymentDirectoryQuerySchema = z
  .strictObject({
    company_id: identifier,
    bank_account_id: identifier.optional(),
    state: bankPaymentStateSchema.optional(),
    posting_date_from: isoDate.optional(),
    posting_date_to: isoDate.optional(),
    search: z.string().trim().max(160).optional(),
    sort_by: z.enum(["posting_date", "reference", "total_amount", "state"]).default("posting_date"),
    sort_direction: z.enum(["asc", "desc"]).default("desc"),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).max(512).optional(),
  })
  .superRefine((value, context) => {
    if (value.posting_date_from && value.posting_date_to && value.posting_date_from > value.posting_date_to) {
      context.addIssue({
        code: "custom",
        path: ["posting_date_to"],
        message: "The ending posting date cannot be before the starting posting date.",
      });
    }
  });

export const bankPaymentSummarySchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  reference: z.string().min(1).max(64),
  bank_account_id: identifier,
  bank_account_name: z.string().min(1).max(160),
  bank_name: z.string().min(1).max(200),
  account_number_masked: z.string().min(4).max(80),
  posting_date: isoDate,
  value_date: isoDate.nullable(),
  currency: isoCurrency,
  total_amount: positiveBoundedDecimal,
  line_count: z.number().int().min(1).max(200),
  narration_summary: z.string().trim().min(1).max(500).nullable(),
  state: bankPaymentStateSchema,
  version: z.number().int().positive(),
  created_at: isoDateTime,
});

export const bankPaymentDirectorySchema = z.strictObject({
  items: z.array(bankPaymentSummarySchema),
  next_cursor: z.string().nullable(),
});

export const bankPaymentTimelineEventSchema = z.strictObject({
  id: identifier,
  action: z.enum(["created", "updated", "submitted", "approved", "rejected", "posted", "reversed"]),
  previous_state: bankPaymentStateSchema.nullable(),
  resulting_state: bankPaymentStateSchema,
  actor_id: identifier,
  actor_label: z.string().trim().min(1).max(200),
  reason: z.string().max(500).nullable(),
  occurred_at: isoDateTime,
});

export const bankPaymentAccountingPreviewLineSchema = z.strictObject({
  line_order: z.number().int().min(1).max(201),
  account_id: identifier,
  account_code: z.string().min(1).max(128),
  account_name: z.string().min(1).max(200),
  side: z.enum(["debit", "credit"]),
  amount: positiveBoundedDecimal,
  is_bank_control: z.boolean(),
});

export const bankPaymentAccountingPreviewSchema = z.strictObject({
  currency: isoCurrency,
  lines: z.array(bankPaymentAccountingPreviewLineSchema).min(2).max(201),
  debit_total: positiveBoundedDecimal,
  credit_total: positiveBoundedDecimal,
});

export const bankPaymentDetailSchema = bankPaymentSummarySchema.extend({
  base_currency: isoCurrency,
  exchange_rate: positiveBoundedRate.nullable(),
  lines: z.array(bankPaymentLineSchema).min(1).max(200),
  timeline: z.array(bankPaymentTimelineEventSchema).max(1_000),
  accounting_preview: bankPaymentAccountingPreviewSchema,
  created_by: identifier,
  submitted_by: identifier.nullable(),
  approved_by: identifier.nullable(),
  rejected_by: identifier.nullable(),
  posted_by: identifier.nullable(),
  reversed_by: identifier.nullable(),
  submitted_at: isoDateTime.nullable(),
  approved_at: isoDateTime.nullable(),
  rejected_at: isoDateTime.nullable(),
  posted_at: isoDateTime.nullable(),
  reversed_at: isoDateTime.nullable(),
  accounting_event_id: identifier.nullable(),
  journal_id: identifier.nullable(),
  journal_entry_number: z.string().min(1).max(128).nullable(),
  reversal_accounting_event_id: identifier.nullable(),
  reversal_journal_id: identifier.nullable(),
  reversal_journal_entry_number: z.string().min(1).max(128).nullable(),
  self_decision_requires_override: z.boolean(),
  super_admin_override_allowed: z.boolean(),
});

export const bankPaymentOptionsQuerySchema = z.strictObject({
  company_id: identifier,
});

export const bankPaymentOptionsSchema = z.strictObject({
  bank_accounts: z.array(
    z.strictObject({
      id: identifier,
      reference: z.string().min(1).max(64),
      account_name: z.string().min(1).max(160),
      bank_name: z.string().min(1).max(200),
      account_number_masked: z.string().min(4).max(80),
      currency: isoCurrency,
      ledger_account_code: z.string().min(1).max(128),
      ledger_account_name: z.string().min(1).max(200),
    }),
  ).max(200),
});

export const bankPaymentNominalAccountDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const bankPaymentNominalAccountDirectorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: identifier,
      code: z.string().min(1).max(128),
      name: z.string().min(1).max(200),
      account_type: z.string().trim().min(1).max(64),
      required_dimensions: z.array(z.string().trim().min(1).max(64)).max(25),
    }),
  ).max(100),
});

export const bankPaymentMutationResultSchema = z.strictObject({
  id: identifier,
  reference: z.string().min(1).max(64),
  state: bankPaymentStateSchema,
  version: z.number().int().positive(),
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export const bankPaymentPostingResultSchema = bankPaymentMutationResultSchema.extend({
  accounting_event_id: identifier,
  journal_id: identifier,
  journal_entry_number: z.string().min(1).max(128),
});

export const bankPaymentReversalResultSchema = bankPaymentMutationResultSchema.extend({
  original_accounting_event_id: identifier,
  original_journal_id: identifier,
  reversal_accounting_event_id: identifier,
  reversal_journal_id: identifier,
  reversal_journal_entry_number: z.string().min(1).max(128),
});

export const bankReceiptStateSchema = z.enum(["draft", "submitted", "approved", "rejected", "posted", "reversed"]);

export const bankReceiptMethodSchema = z.enum(["bank_transfer", "cheque", "cash", "online", "direct_debit", "card"]);

const bankReceiptReference = z.string().trim().min(1).max(128);
const bankReceiptPayerName = z.string().trim().min(1).max(200);
const bankReceiptNarration = z.string().trim().min(3).max(500);
const bankReceiptReason = z.string().trim().min(3).max(500);

export const bankReceiptDimensionsSchema = bankPaymentDimensionsRecordSchema.superRefine((value, context) => {
  if (Object.keys(value).length > 25) {
    context.addIssue({ code: "custom", message: "At most 25 accounting dimensions are allowed." });
  }
  if (JSON.stringify(value).length > 4_000) {
    context.addIssue({ code: "custom", message: "Accounting dimensions are too large." });
  }
});

const editableBankReceiptLineFields = {
  line_order: z.number().int().min(1).max(200),
  document_date: isoDate,
  external_reference: bankReceiptReference.nullable().optional(),
  document_reference: bankReceiptReference.nullable().optional(),
  receipt_method: bankReceiptMethodSchema,
  payer_name: bankReceiptPayerName,
  nominal_account_id: identifier,
  narration: bankReceiptNarration.nullable().optional(),
  amount: positiveBoundedDecimal,
  dimensions: bankReceiptDimensionsSchema,
} as const;

export const bankReceiptLineInputSchema = z.strictObject(editableBankReceiptLineFields);

export const bankReceiptLineSchema = z.strictObject({
  id: identifier,
  line_order: editableBankReceiptLineFields.line_order,
  document_date: editableBankReceiptLineFields.document_date,
  external_reference: bankReceiptReference.nullable(),
  document_reference: bankReceiptReference.nullable(),
  receipt_method: editableBankReceiptLineFields.receipt_method,
  payer_name: editableBankReceiptLineFields.payer_name,
  nominal_account_id: editableBankReceiptLineFields.nominal_account_id,
  narration: bankReceiptNarration.nullable(),
  amount: editableBankReceiptLineFields.amount,
  dimensions: editableBankReceiptLineFields.dimensions,
});

const bankReceiptLinesSchema = z
  .array(bankReceiptLineInputSchema)
  .min(1)
  .max(200)
  .superRefine((lines, context) => {
    const orders = new Set(lines.map((line) => line.line_order));
    if (orders.size !== lines.length) {
      context.addIssue({ code: "custom", message: "Receipt line order values must be unique." });
    }
  });

const editableBankReceiptFields = {
  bank_account_id: identifier,
  posting_date: isoDate,
  value_date: isoDate.nullable().optional(),
  lines: bankReceiptLinesSchema,
} as const;

export const createBankReceiptRequestSchema = z.strictObject({
  company_id: identifier,
  ...editableBankReceiptFields,
});

export const updateBankReceiptRequestSchema = z
  .strictObject({
    expected_version: z.number().int().positive(),
    bank_account_id: editableBankReceiptFields.bank_account_id.optional(),
    posting_date: editableBankReceiptFields.posting_date.optional(),
    value_date: editableBankReceiptFields.value_date,
    lines: editableBankReceiptFields.lines.optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "expected_version"),
    "At least one bank receipt field is required.",
  );

export const submitBankReceiptRequestSchema = z.strictObject({
  expected_version: z.number().int().positive(),
});

export const decideBankReceiptRequestSchema = z
  .strictObject({
    action: z.enum(["approve", "reject"]),
    expected_version: z.number().int().positive(),
    reason: bankReceiptReason.optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "reject" && value.reason === undefined) {
      context.addIssue({ code: "custom", path: ["reason"], message: "A rejection reason is required." });
    }
  });

export const postBankReceiptRequestSchema = z.strictObject({
  expected_version: z.number().int().positive(),
});

export const reverseBankReceiptRequestSchema = z.strictObject({
  expected_version: z.number().int().positive(),
  reason: bankReceiptReason,
});

export const bankReceiptDirectoryQuerySchema = z
  .strictObject({
    company_id: identifier,
    bank_account_id: identifier.optional(),
    state: bankReceiptStateSchema.optional(),
    posting_date_from: isoDate.optional(),
    posting_date_to: isoDate.optional(),
    search: z.string().trim().max(160).optional(),
    sort_by: z.enum(["posting_date", "reference", "total_amount", "state"]).default("posting_date"),
    sort_direction: z.enum(["asc", "desc"]).default("desc"),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).max(512).optional(),
  })
  .superRefine((value, context) => {
    if (value.posting_date_from && value.posting_date_to && value.posting_date_from > value.posting_date_to) {
      context.addIssue({
        code: "custom",
        path: ["posting_date_to"],
        message: "The ending posting date cannot be before the starting posting date.",
      });
    }
  });

export const bankReceiptSummarySchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  reference: z.string().min(1).max(64),
  bank_account_id: identifier,
  bank_account_name: z.string().min(1).max(160),
  bank_name: z.string().min(1).max(200),
  account_number_masked: z.string().min(4).max(80),
  posting_date: isoDate,
  value_date: isoDate.nullable(),
  currency: isoCurrency,
  total_amount: positiveBoundedDecimal,
  line_count: z.number().int().min(1).max(200),
  payer_summary: z.string().trim().min(1).max(500).nullable(),
  nominal_account_summary: z.string().trim().min(1).max(500).nullable(),
  narration_summary: z.string().trim().min(1).max(500).nullable(),
  state: bankReceiptStateSchema,
  version: z.number().int().positive(),
  created_at: isoDateTime,
});

export const bankReceiptDirectorySchema = z.strictObject({
  items: z.array(bankReceiptSummarySchema),
  next_cursor: z.string().nullable(),
});

export const bankReceiptTimelineEventSchema = z.strictObject({
  id: identifier,
  action: z.enum(["created", "updated", "submitted", "approved", "rejected", "posted", "reversed"]),
  previous_state: bankReceiptStateSchema.nullable(),
  resulting_state: bankReceiptStateSchema,
  actor_id: identifier,
  actor_label: z.string().trim().min(1).max(200),
  reason: z.string().max(500).nullable(),
  occurred_at: isoDateTime,
});

export const bankReceiptAccountingPreviewLineSchema = z.strictObject({
  line_order: z.number().int().min(1).max(201),
  account_id: identifier,
  account_code: z.string().min(1).max(128),
  account_name: z.string().min(1).max(200),
  side: z.enum(["debit", "credit"]),
  amount: positiveBoundedDecimal,
  is_bank_control: z.boolean(),
});

export const bankReceiptAccountingPreviewSchema = z.strictObject({
  currency: isoCurrency,
  lines: z.array(bankReceiptAccountingPreviewLineSchema).min(2).max(201),
  debit_total: positiveBoundedDecimal,
  credit_total: positiveBoundedDecimal,
});

export const bankReceiptDetailSchema = bankReceiptSummarySchema.extend({
  base_currency: isoCurrency,
  exchange_rate: positiveBoundedRate.nullable(),
  lines: z.array(bankReceiptLineSchema).min(1).max(200),
  timeline: z.array(bankReceiptTimelineEventSchema).max(1_000),
  accounting_preview: bankReceiptAccountingPreviewSchema,
  created_by: identifier,
  submitted_by: identifier.nullable(),
  approved_by: identifier.nullable(),
  rejected_by: identifier.nullable(),
  posted_by: identifier.nullable(),
  reversed_by: identifier.nullable(),
  submitted_at: isoDateTime.nullable(),
  approved_at: isoDateTime.nullable(),
  rejected_at: isoDateTime.nullable(),
  posted_at: isoDateTime.nullable(),
  reversed_at: isoDateTime.nullable(),
  accounting_event_id: identifier.nullable(),
  journal_id: identifier.nullable(),
  journal_entry_number: z.string().min(1).max(128).nullable(),
  reversal_accounting_event_id: identifier.nullable(),
  reversal_journal_id: identifier.nullable(),
  reversal_journal_entry_number: z.string().min(1).max(128).nullable(),
  self_decision_requires_override: z.boolean(),
  super_admin_override_allowed: z.boolean(),
});

export const bankReceiptOptionsQuerySchema = z.strictObject({
  company_id: identifier,
});

export const bankReceiptOptionsSchema = z.strictObject({
  bank_accounts: bankPaymentOptionsSchema.shape.bank_accounts,
  receipt_methods: z
    .array(
      z.strictObject({
        value: bankReceiptMethodSchema,
        label: z.string().trim().min(1).max(80),
      }),
    )
    .length(bankReceiptMethodSchema.options.length),
});

export const bankReceiptNominalAccountDirectoryQuerySchema = bankPaymentNominalAccountDirectoryQuerySchema;
export const bankReceiptNominalAccountDirectorySchema = bankPaymentNominalAccountDirectorySchema;

export const bankReceiptMutationResultSchema = z.strictObject({
  id: identifier,
  reference: z.string().min(1).max(64),
  state: bankReceiptStateSchema,
  version: z.number().int().positive(),
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export const bankReceiptPostingResultSchema = bankReceiptMutationResultSchema.extend({
  accounting_event_id: identifier,
  journal_id: identifier,
  journal_entry_number: z.string().min(1).max(128),
});

export const bankReceiptReversalResultSchema = bankReceiptMutationResultSchema.extend({
  original_accounting_event_id: identifier,
  original_journal_id: identifier,
  reversal_accounting_event_id: identifier,
  reversal_journal_id: identifier,
  reversal_journal_entry_number: z.string().min(1).max(128),
});

export type BankAccountState = z.infer<typeof bankAccountStateSchema>;
export type BankAccountType = z.infer<typeof bankAccountTypeSchema>;
export type BankingCompanyDirectory = z.infer<typeof bankingCompanyDirectorySchema>;
export type BankingLedgerAccountDirectoryQuery = z.infer<typeof bankingLedgerAccountDirectoryQuerySchema>;
export type BankingLedgerAccountDirectory = z.infer<typeof bankingLedgerAccountDirectorySchema>;
export type BankAccountDirectoryQuery = z.infer<typeof bankAccountDirectoryQuerySchema>;
export type BankAccountSummary = z.infer<typeof bankAccountSummarySchema>;
export type BankAccountDirectory = z.infer<typeof bankAccountDirectorySchema>;
export type BankAccountCurrencySummary = z.infer<typeof bankAccountCurrencySummarySchema>;
export type BankAccountDetail = z.infer<typeof bankAccountDetailSchema>;
export type CreateBankAccountRequest = z.infer<typeof createBankAccountRequestSchema>;
export type UpdateBankAccountRequest = z.infer<typeof updateBankAccountRequestSchema>;
export type SubmitBankAccountRequest = z.infer<typeof submitBankAccountRequestSchema>;
export type DecideBankAccountRequest = z.infer<typeof decideBankAccountRequestSchema>;
export type ChangeBankAccountStatusRequest = z.infer<typeof changeBankAccountStatusRequestSchema>;
export type BankAccountMutationResult = z.infer<typeof bankAccountMutationResultSchema>;
export type BankPaymentState = z.infer<typeof bankPaymentStateSchema>;
export type BankPaymentMethod = z.infer<typeof bankPaymentMethodSchema>;
export type BankPaymentDimensions = z.infer<typeof bankPaymentDimensionsSchema>;
export type BankPaymentLineInput = z.infer<typeof bankPaymentLineInputSchema>;
export type BankPaymentLine = z.infer<typeof bankPaymentLineSchema>;
export type CreateBankPaymentRequest = z.infer<typeof createBankPaymentRequestSchema>;
export type UpdateBankPaymentRequest = z.infer<typeof updateBankPaymentRequestSchema>;
export type SubmitBankPaymentRequest = z.infer<typeof submitBankPaymentRequestSchema>;
export type DecideBankPaymentRequest = z.infer<typeof decideBankPaymentRequestSchema>;
export type PostBankPaymentRequest = z.infer<typeof postBankPaymentRequestSchema>;
export type ReverseBankPaymentRequest = z.infer<typeof reverseBankPaymentRequestSchema>;
export type BankPaymentDirectoryQuery = z.infer<typeof bankPaymentDirectoryQuerySchema>;
export type BankPaymentSummary = z.infer<typeof bankPaymentSummarySchema>;
export type BankPaymentDirectory = z.infer<typeof bankPaymentDirectorySchema>;
export type BankPaymentTimelineEvent = z.infer<typeof bankPaymentTimelineEventSchema>;
export type BankPaymentAccountingPreviewLine = z.infer<typeof bankPaymentAccountingPreviewLineSchema>;
export type BankPaymentAccountingPreview = z.infer<typeof bankPaymentAccountingPreviewSchema>;
export type BankPaymentDetail = z.infer<typeof bankPaymentDetailSchema>;
export type BankPaymentOptionsQuery = z.infer<typeof bankPaymentOptionsQuerySchema>;
export type BankPaymentOptions = z.infer<typeof bankPaymentOptionsSchema>;
export type BankPaymentNominalAccountDirectoryQuery = z.infer<typeof bankPaymentNominalAccountDirectoryQuerySchema>;
export type BankPaymentNominalAccountDirectory = z.infer<typeof bankPaymentNominalAccountDirectorySchema>;
export type BankPaymentMutationResult = z.infer<typeof bankPaymentMutationResultSchema>;
export type BankPaymentPostingResult = z.infer<typeof bankPaymentPostingResultSchema>;
export type BankPaymentReversalResult = z.infer<typeof bankPaymentReversalResultSchema>;
export type BankReceiptState = z.infer<typeof bankReceiptStateSchema>;
export type BankReceiptMethod = z.infer<typeof bankReceiptMethodSchema>;
export type BankReceiptDimensions = z.infer<typeof bankReceiptDimensionsSchema>;
export type BankReceiptLineInput = z.infer<typeof bankReceiptLineInputSchema>;
export type BankReceiptLine = z.infer<typeof bankReceiptLineSchema>;
export type CreateBankReceiptRequest = z.infer<typeof createBankReceiptRequestSchema>;
export type UpdateBankReceiptRequest = z.infer<typeof updateBankReceiptRequestSchema>;
export type SubmitBankReceiptRequest = z.infer<typeof submitBankReceiptRequestSchema>;
export type DecideBankReceiptRequest = z.infer<typeof decideBankReceiptRequestSchema>;
export type PostBankReceiptRequest = z.infer<typeof postBankReceiptRequestSchema>;
export type ReverseBankReceiptRequest = z.infer<typeof reverseBankReceiptRequestSchema>;
export type BankReceiptDirectoryQuery = z.infer<typeof bankReceiptDirectoryQuerySchema>;
export type BankReceiptSummary = z.infer<typeof bankReceiptSummarySchema>;
export type BankReceiptDirectory = z.infer<typeof bankReceiptDirectorySchema>;
export type BankReceiptTimelineEvent = z.infer<typeof bankReceiptTimelineEventSchema>;
export type BankReceiptAccountingPreviewLine = z.infer<typeof bankReceiptAccountingPreviewLineSchema>;
export type BankReceiptAccountingPreview = z.infer<typeof bankReceiptAccountingPreviewSchema>;
export type BankReceiptDetail = z.infer<typeof bankReceiptDetailSchema>;
export type BankReceiptOptionsQuery = z.infer<typeof bankReceiptOptionsQuerySchema>;
export type BankReceiptOptions = z.infer<typeof bankReceiptOptionsSchema>;
export type BankReceiptNominalAccountDirectoryQuery = z.infer<typeof bankReceiptNominalAccountDirectoryQuerySchema>;
export type BankReceiptNominalAccountDirectory = z.infer<typeof bankReceiptNominalAccountDirectorySchema>;
export type BankReceiptMutationResult = z.infer<typeof bankReceiptMutationResultSchema>;
export type BankReceiptPostingResult = z.infer<typeof bankReceiptPostingResultSchema>;
export type BankReceiptReversalResult = z.infer<typeof bankReceiptReversalResultSchema>;
