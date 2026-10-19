import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const isoCurrency = z.string().regex(/^[A-Z]{3}$/);
const isoDate = z.string().date();
const isoDateTime = z.string().datetime();
const decimal = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,8})?$/);
const signedDecimal = z.string().regex(/^-?(0|[1-9]\d*)(\.\d{1,8})?$/);
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
