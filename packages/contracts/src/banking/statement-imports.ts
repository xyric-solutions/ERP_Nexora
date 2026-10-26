import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const isoCurrency = z.string().regex(/^[A-Z]{3}$/);
const isoDate = z.string().date();
const isoDateTime = z.string().datetime();
const version = z.number().int().positive();
const boundedText = z.string().trim().max(500);
const positiveAmount = z
  .string()
  .regex(/^(0|[1-9]\d{0,29})(\.\d{1,8})?$/)
  .refine((value) => value.replace(/[.0]/g, "").length > 0, "Amount must be greater than zero.");

export const bankStatementFileFormatSchema = z.enum(["csv", "xlsx"]);
export const bankStatementDateFormatSchema = z.enum(["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd-MM-yyyy"]);
export const bankStatementAmountConventionSchema = z.enum(["separate_debit_credit", "signed_amount"]);
export const bankStatementSignedAmountDirectionSchema = z.enum(["positive_money_in", "positive_money_out"]);
export const bankStatementImportStateSchema = z.enum(["uploaded", "draft", "validated", "finalized", "rejected"]);
export const bankStatementMappingProfileStateSchema = z.enum(["active", "inactive"]);
export const bankStatementDirectionSchema = z.enum(["money_in", "money_out"]);
export const bankStatementInclusionStateSchema = z.enum(["included", "excluded"]);
export const bankStatementValidationStateSchema = z.enum(["valid", "warning", "duplicate", "error"]);
export const bankStatementDuplicateDispositionSchema = z.enum([
  "not_applicable",
  "unresolved",
  "accepted_duplicate",
  "rejected_duplicate",
]);

export const bankStatementMappingColumnsSchema = z.strictObject({
  date: z.string().trim().min(1).max(128),
  payment: z.string().trim().min(1).max(128).nullable(),
  receipt: z.string().trim().min(1).max(128).nullable(),
  signed_amount: z.string().trim().min(1).max(128).nullable(),
  reference: z.string().trim().min(1).max(128).nullable(),
  details: z.string().trim().min(1).max(128).nullable(),
  transaction_type: z.string().trim().min(1).max(128).nullable(),
  account_text: z.string().trim().min(1).max(128).nullable(),
  payment_mode: z.string().trim().min(1).max(128).nullable(),
  running_balance: z.string().trim().min(1).max(128).nullable().optional(),
});

export const bankStatementMappingSnapshotSchema = z
  .strictObject({
    file_format: bankStatementFileFormatSchema,
    delimiter: z.string().min(1).max(4).nullable(),
    encoding: z.enum(["utf-8", "windows-1252"]).nullable(),
    worksheet: z.string().trim().min(1).max(128).nullable(),
    header_row: z.number().int().min(1).max(100),
    date_format: bankStatementDateFormatSchema,
    amount_convention: bankStatementAmountConventionSchema,
    signed_amount_direction: bankStatementSignedAmountDirectionSchema.nullable(),
    columns: bankStatementMappingColumnsSchema,
  })
  .superRefine((mapping, context) => {
    if (mapping.file_format === "csv" && mapping.delimiter === null) {
      context.addIssue({ code: "custom", path: ["delimiter"], message: "CSV mappings require a delimiter." });
    }
    if (mapping.file_format === "xlsx" && mapping.worksheet === null) {
      context.addIssue({ code: "custom", path: ["worksheet"], message: "Excel mappings require one worksheet." });
    }
    if (
      mapping.amount_convention === "separate_debit_credit" &&
      (mapping.columns.payment === null || mapping.columns.receipt === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["columns"],
        message: "Separate debit and credit mappings require Payment and Receipt columns.",
      });
    }
    if (mapping.amount_convention === "signed_amount" && mapping.columns.signed_amount === null) {
      context.addIssue({
        code: "custom",
        path: ["columns", "signed_amount"],
        message: "Signed amount mappings require an amount column.",
      });
    }
    if (mapping.columns.reference === null && mapping.columns.details === null) {
      context.addIssue({
        code: "custom",
        path: ["columns"],
        message: "A Reference or Details column is required.",
      });
    }
  });

export const bankStatementMappingProfileSchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  bank_account_id: identifier,
  name: z.string().trim().min(1).max(160),
  state: bankStatementMappingProfileStateSchema,
  mapping: bankStatementMappingSnapshotSchema,
  version,
  created_by: identifier,
  updated_by: identifier,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});

export const bankStatementMappingProfileDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  bank_account_id: identifier.optional(),
  state: bankStatementMappingProfileStateSchema.optional(),
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export const bankStatementMappingProfileDirectorySchema = z.strictObject({
  items: z.array(bankStatementMappingProfileSchema).max(100),
  next_cursor: z.string().max(512).nullable(),
});

export const createBankStatementMappingProfileRequestSchema = z.strictObject({
  company_id: identifier,
  bank_account_id: identifier,
  name: z.string().trim().min(1).max(160),
  mapping: bankStatementMappingSnapshotSchema,
});

export const updateBankStatementMappingProfileRequestSchema = z
  .strictObject({
    expected_version: version,
    name: z.string().trim().min(1).max(160).optional(),
    state: bankStatementMappingProfileStateSchema.optional(),
    mapping: bankStatementMappingSnapshotSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "expected_version"), "A profile change is required.");

export const bankStatementValidationIssueSchema = z.strictObject({
  code: z.string().trim().min(1).max(64),
  severity: z.enum(["warning", "error"]),
  field: z.string().trim().min(1).max(64).nullable(),
  message: z.string().trim().min(1).max(500),
});

const sanitizedRawRowSchema = z
  .record(z.string().trim().min(1).max(128), z.string().max(4_000).nullable())
  .superRefine((row, context) => {
    if (Object.keys(row).length > 64) {
      context.addIssue({ code: "custom", message: "Statement rows may contain at most 64 columns." });
    }
  });

export const bankStatementLineSchema = z.strictObject({
  id: identifier,
  import_id: identifier,
  source_row_number: z.number().int().min(1).max(1_001),
  raw_row: sanitizedRawRowSchema,
  transaction_date: isoDate.nullable(),
  direction: bankStatementDirectionSchema.nullable(),
  amount: positiveAmount.nullable(),
  currency: isoCurrency,
  reference: boundedText.nullable(),
  details: boundedText.nullable(),
  transaction_type: z.string().trim().max(160).nullable(),
  account_text: z.string().trim().max(200).nullable(),
  payment_mode: z.string().trim().max(160).nullable(),
  running_balance: z
    .string()
    .regex(/^-?(0|[1-9]\d{0,29})(\.\d{1,8})?$/)
    .nullable()
    .optional(),
  row_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  inclusion_state: bankStatementInclusionStateSchema,
  exclusion_reason: boundedText.nullable(),
  validation_state: bankStatementValidationStateSchema,
  duplicate_disposition: bankStatementDuplicateDispositionSchema,
  issues: z.array(bankStatementValidationIssueSchema).max(25),
  version,
});

export const bankStatementImportCountsSchema = z.strictObject({
  total: z.number().int().min(0).max(1_000),
  valid: z.number().int().min(0).max(1_000),
  warning: z.number().int().min(0).max(1_000),
  error: z.number().int().min(0).max(1_000),
  duplicate: z.number().int().min(0).max(1_000),
  excluded: z.number().int().min(0).max(1_000),
  finalized: z.number().int().min(0).max(1_000),
});

export const bankStatementImportSummarySchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  bank_account_id: identifier,
  bank_account_name: z.string().trim().min(1).max(160),
  statement_reference: z.string().trim().min(1).max(128),
  statement_date_from: isoDate.nullable().default(null),
  statement_date_to: isoDate.nullable().default(null),
  original_filename: z.string().trim().min(1).max(255),
  file_format: bankStatementFileFormatSchema,
  detected_media_type: z.enum([
    "text/csv",
    "application/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]),
  byte_size: z.number().int().min(1).max(26_214_400),
  checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  state: bankStatementImportStateSchema,
  counts: bankStatementImportCountsSchema,
  version,
  created_by: identifier,
  created_at: isoDateTime,
  finalized_by: identifier.nullable(),
  finalized_at: isoDateTime.nullable(),
});

export const bankStatementImportDirectoryQuerySchema = z
  .strictObject({
    company_id: identifier,
    bank_account_id: identifier.optional(),
    state: bankStatementImportStateSchema.optional(),
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

export const bankStatementImportDirectorySchema = z.strictObject({
  items: z.array(bankStatementImportSummarySchema).max(100),
  next_cursor: z.string().max(512).nullable(),
});

export const bankStatementImportDetailSchema = bankStatementImportSummarySchema.extend({
  mapping_profile_id: identifier.nullable(),
  mapping_snapshot: bankStatementMappingSnapshotSchema.nullable(),
  lines: z.array(bankStatementLineSchema).max(1_000),
  supersedes_import_id: identifier.nullable(),
  statement_ending_date: isoDate.nullable().optional(),
  statement_ending_balance: z
    .string()
    .regex(/^-?(0|[1-9]\d{0,29})(\.\d{1,8})?$/)
    .nullable()
    .optional(),
});

export const bankStatementImportOptionsQuerySchema = z.strictObject({ company_id: identifier });
export const bankStatementImportOptionsSchema = z.strictObject({
  bank_accounts: z
    .array(
      z.strictObject({
        id: identifier,
        reference: z.string().trim().min(1).max(64),
        account_name: z.string().trim().min(1).max(160),
        bank_name: z.string().trim().min(1).max(200).nullable(),
        account_number_masked: z.string().trim().min(4).max(80).nullable(),
        currency: isoCurrency,
      }),
    )
    .max(200),
  mapping_profiles: z.array(bankStatementMappingProfileSchema).max(100),
  date_formats: z.array(bankStatementDateFormatSchema),
  max_file_bytes: z.number().int().positive().max(26_214_400),
  max_rows: z.literal(1_000),
});

export const bankStatementUploadFieldsSchema = z.strictObject({
  company_id: identifier,
  bank_account_id: identifier,
  statement_reference: z.string().trim().min(1).max(128),
  date_format: bankStatementDateFormatSchema,
  mapping_profile_id: identifier.nullable().optional(),
  supersedes_import_id: identifier.nullable().optional(),
});

export const updateBankStatementImportMappingRequestSchema = z.strictObject({
  expected_version: version,
  mapping: bankStatementMappingSnapshotSchema,
  save_profile: z
    .strictObject({ name: z.string().trim().min(1).max(160) })
    .nullable()
    .optional(),
});

export const updateBankStatementLineRequestSchema = z
  .strictObject({
    expected_version: version,
    inclusion_state: bankStatementInclusionStateSchema.optional(),
    exclusion_reason: boundedText.nullable().optional(),
    duplicate_disposition: bankStatementDuplicateDispositionSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.inclusion_state === "excluded" && !value.exclusion_reason) {
      context.addIssue({
        code: "custom",
        path: ["exclusion_reason"],
        message: "Excluded rows require a reason.",
      });
    }
    if (Object.keys(value).every((key) => key === "expected_version")) {
      context.addIssue({ code: "custom", message: "A statement-line resolution is required." });
    }
  });

export const validateBankStatementImportRequestSchema = z.strictObject({ expected_version: version });
export const finalizeBankStatementImportRequestSchema = z.strictObject({ expected_version: version });

export const bankStatementImportMutationResultSchema = z.strictObject({
  id: identifier,
  state: bankStatementImportStateSchema,
  version,
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export const bankStatementTemplateFormatSchema = bankStatementFileFormatSchema;

export type BankStatementFileFormat = z.infer<typeof bankStatementFileFormatSchema>;
export type BankStatementDateFormat = z.infer<typeof bankStatementDateFormatSchema>;
export type BankStatementMappingSnapshot = z.infer<typeof bankStatementMappingSnapshotSchema>;
export type BankStatementMappingProfile = z.infer<typeof bankStatementMappingProfileSchema>;
export type BankStatementMappingProfileDirectoryQuery = z.infer<typeof bankStatementMappingProfileDirectoryQuerySchema>;
export type BankStatementMappingProfileDirectory = z.infer<typeof bankStatementMappingProfileDirectorySchema>;
export type CreateBankStatementMappingProfileRequest = z.infer<typeof createBankStatementMappingProfileRequestSchema>;
export type UpdateBankStatementMappingProfileRequest = z.infer<typeof updateBankStatementMappingProfileRequestSchema>;
export type BankStatementLine = z.infer<typeof bankStatementLineSchema>;
export type BankStatementImportSummary = z.infer<typeof bankStatementImportSummarySchema>;
export type BankStatementImportDirectoryQuery = z.infer<typeof bankStatementImportDirectoryQuerySchema>;
export type BankStatementImportDirectory = z.infer<typeof bankStatementImportDirectorySchema>;
export type BankStatementImportDetail = z.infer<typeof bankStatementImportDetailSchema>;
export type BankStatementImportOptionsQuery = z.infer<typeof bankStatementImportOptionsQuerySchema>;
export type BankStatementImportOptions = z.infer<typeof bankStatementImportOptionsSchema>;
export type BankStatementUploadFields = z.infer<typeof bankStatementUploadFieldsSchema>;
export type UpdateBankStatementImportMappingRequest = z.infer<typeof updateBankStatementImportMappingRequestSchema>;
export type UpdateBankStatementLineRequest = z.infer<typeof updateBankStatementLineRequestSchema>;
export type ValidateBankStatementImportRequest = z.infer<typeof validateBankStatementImportRequestSchema>;
export type FinalizeBankStatementImportRequest = z.infer<typeof finalizeBankStatementImportRequestSchema>;
export type BankStatementImportMutationResult = z.infer<typeof bankStatementImportMutationResultSchema>;
export type BankStatementTemplateFormat = z.infer<typeof bankStatementTemplateFormatSchema>;
