import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const currency = z.string().regex(/^[A-Z]{3}$/);
const date = z.string().date();
const dateTime = z.string().datetime();
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const reason = z.string().trim().min(3).max(500);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,29})(\.[0-9]{1,8})?$/);

export const journalStateSchema = z.enum(["draft", "submitted", "posted", "reversed"]);
export const journalSourceSchema = z.enum(["manual", "bank", "payroll", "finance", "other"]);

export const journalLineInputSchema = z
  .strictObject({
    account_id: identifier,
    description: z.string().trim().min(1).max(500),
    debit: amount.default("0"),
    credit: amount.default("0"),
    dimensions: z.record(z.string(), z.string().trim().max(128)).default({}),
  })
  .superRefine((line, context) => {
    const debit = Number(line.debit);
    const credit = Number(line.credit);
    if (!((debit > 0 && credit === 0) || (credit > 0 && debit === 0)))
      context.addIssue({ code: "custom", message: "Each Journal line must contain exactly one positive side." });
  });

export const journalLineSchema = journalLineInputSchema.extend({
  id: identifier,
  line_number: z.number().int().min(1).max(1_000),
  account_code: z.string().min(1).max(128),
  account_name: z.string().min(1).max(200),
});

export const journalOptionsQuerySchema = z.strictObject({ company_id: identifier.optional() });
export const journalOptionsSchema = z.strictObject({
  companies: z.array(z.strictObject({ id: identifier, code: z.string(), name: z.string() })).max(100),
  selected_company_id: identifier.nullable(),
  base_currency: currency.nullable(),
  decimal_places: z.number().int().min(0).max(8).nullable(),
  nominals: z
    .array(
      z.strictObject({
        id: identifier,
        code: z.string().min(1).max(128),
        name: z.string().min(1).max(200),
        required_dimensions: z.array(identifier).max(32),
      }),
    )
    .max(2_000),
});

export const journalDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  source: journalSourceSchema.optional(),
  state: journalStateSchema.optional(),
  nominal_id: identifier.optional(),
  reference: z.string().trim().max(160).optional(),
  date_from: date.optional(),
  date_to: date.optional(),
  approval_queue: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export const journalSummarySchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  display_number: z.string().min(1).max(160),
  journal_date: date,
  reference_number: z.string().max(160).nullable(),
  source: journalSourceSchema,
  source_label: z.string().min(1).max(160),
  state: journalStateSchema,
  currency,
  total: amount,
  version: version.nullable(),
  maker_user_id: identifier.nullable(),
  submitted_at: dateTime.nullable(),
  can_open_owner_workflow: z.boolean(),
});

export const journalDirectorySchema = z.strictObject({
  items: z.array(journalSummarySchema),
  next_cursor: z.string().max(512).nullable(),
});

export const journalEventSchema = z.strictObject({
  id: identifier,
  event_type: z.enum(["created", "updated", "submitted", "rejected", "posted", "reversed", "deleted"]),
  actor_id: identifier,
  actor_name: z.string().min(1).max(200),
  reason: z.string().max(500).nullable(),
  occurred_at: dateTime,
});

export const journalDetailSchema = journalSummarySchema.extend({
  base_decimal_places: z.number().int().min(0).max(8),
  approval_note: z.string().max(500).nullable(),
  rejection_reason: z.string().max(500).nullable(),
  posted_entry_number: z.string().max(160).nullable(),
  lines: z.array(journalLineSchema).min(1).max(1_000),
  events: z.array(journalEventSchema).max(1_000),
  capabilities: z.strictObject({
    update: z.boolean(),
    delete_draft: z.boolean(),
    submit: z.boolean(),
    approve: z.boolean(),
    reject: z.boolean(),
    reverse: z.boolean(),
    self_approval_required: z.boolean(),
    super_admin_override_available: z.boolean(),
  }),
});

export const createJournalRequestSchema = z.strictObject({
  company_id: identifier,
  journal_date: date,
  reference_number: z.string().trim().min(1).max(160).optional(),
  lines: z.array(journalLineInputSchema).min(2).max(1_000),
});

export const updateJournalRequestSchema = z.strictObject({
  expected_version: version,
  journal_date: date,
  reference_number: z.string().trim().min(1).max(160).nullable().optional(),
  lines: z.array(journalLineInputSchema).min(2).max(1_000),
});

export const submitJournalRequestSchema = z.strictObject({ expected_version: version });
export const deleteJournalRequestSchema = z.strictObject({ expected_version: version, reason });
export const decideJournalRequestSchema = z
  .strictObject({
    expected_version: version,
    action: z.enum(["reject", "post"]),
    reason: reason.optional(),
    approval_note: z.string().trim().min(1).max(500).optional(),
    confirmed: z.boolean().default(false),
  })
  .superRefine((input, context) => {
    if (input.action === "reject" && !input.reason)
      context.addIssue({ code: "custom", path: ["reason"], message: "A rejection reason is required." });
    if (input.action === "post" && !input.confirmed)
      context.addIssue({ code: "custom", path: ["confirmed"], message: "Final review confirmation is required." });
  });
export const reverseJournalRequestSchema = z.strictObject({
  expected_version: version,
  reversal_date: date,
  reason,
});

export const journalMutationResultSchema = z.strictObject({
  id: identifier,
  state: journalStateSchema,
  version,
  audit_event_id: identifier,
  ledger_journal_id: identifier.nullable(),
  entry_number: z.string().max(160).nullable(),
  replayed: z.boolean(),
});
export const journalDeleteResultSchema = z.strictObject({
  id: identifier,
  deleted: z.literal(true),
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export const recurringJournalScheduleSchema = z.enum(["monthly", "quarterly"]);
export const recurringJournalStatusSchema = z.enum(["active", "inactive"]);
export const recurringJournalDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  status: recurringJournalStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().min(1).max(512).optional(),
});
export const recurringJournalTemplateSchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  name: z.string().min(1).max(200),
  schedule: recurringJournalScheduleSchema,
  status: recurringJournalStatusSchema,
  start_date: date,
  end_date: date.nullable(),
  next_scheduled_date: date.nullable(),
  last_generated_date: date.nullable(),
  base_currency: currency,
  reference_pattern: z.string().max(160).nullable(),
  narration: z.string().min(1).max(500),
  version,
  lines: z.array(journalLineInputSchema).min(2).max(1_000),
  updated_at: dateTime,
});
export const recurringJournalDirectorySchema = z.strictObject({
  items: z.array(recurringJournalTemplateSchema),
  next_cursor: z.string().max(512).nullable(),
});
export const createRecurringJournalRequestSchema = z.strictObject({
  company_id: identifier,
  name: z.string().trim().min(1).max(200),
  schedule: recurringJournalScheduleSchema,
  start_date: date,
  end_date: date.nullable().optional(),
  reference_pattern: z.string().trim().min(1).max(160).optional(),
  narration: z.string().trim().min(1).max(500),
  lines: z.array(journalLineInputSchema).min(2).max(1_000),
});
export const updateRecurringJournalRequestSchema = createRecurringJournalRequestSchema
  .omit({ company_id: true })
  .extend({ expected_version: version });
export const changeRecurringJournalStatusRequestSchema = z.strictObject({
  expected_version: version,
  action: z.enum(["activate", "inactivate"]),
  reason,
});
export const recurringJournalOccurrenceSchema = z.strictObject({
  id: identifier,
  scheduled_date: date,
  state: z.enum(["pending", "draft_created", "draft_deleted", "failed", "exhausted"]),
  manual_journal_id: identifier.nullable(),
  attempt_count: z.number().int().min(0).max(100),
  last_error_code: z.string().max(64).nullable(),
  updated_at: dateTime,
});
export const recurringJournalOccurrenceDirectorySchema = z.strictObject({
  items: z.array(recurringJournalOccurrenceSchema),
  next_cursor: z.string().max(512).nullable(),
});

export type JournalDirectoryQuery = z.infer<typeof journalDirectoryQuerySchema>;
export type JournalLineInput = z.infer<typeof journalLineInputSchema>;
export type JournalDirectory = z.infer<typeof journalDirectorySchema>;
export type JournalSummary = z.infer<typeof journalSummarySchema>;
export type JournalOptions = z.infer<typeof journalOptionsSchema>;
export type JournalDetail = z.infer<typeof journalDetailSchema>;
export type CreateJournalRequest = z.infer<typeof createJournalRequestSchema>;
export type UpdateJournalRequest = z.infer<typeof updateJournalRequestSchema>;
export type SubmitJournalRequest = z.infer<typeof submitJournalRequestSchema>;
export type DeleteJournalRequest = z.infer<typeof deleteJournalRequestSchema>;
export type DecideJournalRequest = z.infer<typeof decideJournalRequestSchema>;
export type ReverseJournalRequest = z.infer<typeof reverseJournalRequestSchema>;
export type JournalMutationResult = z.infer<typeof journalMutationResultSchema>;
export type JournalDeleteResult = z.infer<typeof journalDeleteResultSchema>;
export type RecurringJournalDirectoryQuery = z.infer<typeof recurringJournalDirectoryQuerySchema>;
export type RecurringJournalTemplate = z.infer<typeof recurringJournalTemplateSchema>;
export type RecurringJournalDirectory = z.infer<typeof recurringJournalDirectorySchema>;
export type CreateRecurringJournalRequest = z.infer<typeof createRecurringJournalRequestSchema>;
export type UpdateRecurringJournalRequest = z.infer<typeof updateRecurringJournalRequestSchema>;
export type ChangeRecurringJournalStatusRequest = z.infer<typeof changeRecurringJournalStatusRequestSchema>;
export type RecurringJournalOccurrenceDirectory = z.infer<typeof recurringJournalOccurrenceDirectorySchema>;
