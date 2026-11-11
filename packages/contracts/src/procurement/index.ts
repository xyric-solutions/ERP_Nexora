import { z } from "zod";
import { supplierProfileSchema } from "./supplier-profile.js";
import { billPaymentTermSchema } from "./bill-payment-terms.js";
export { billPaymentTermSchema, billPaymentTerms, billPaymentSchedule } from "./bill-payment-terms.js";
export type { BillPaymentTerm } from "./bill-payment-terms.js";
export {
  supplierProfileSchema,
  supplierBankAccountSchema,
  supplierAddressSchema,
  supplierMailingAddress,
} from "./supplier-profile.js";
export type { SupplierProfile, SupplierBankAccount } from "./supplier-profile.js";
export { scaled, money, lineTotal, documentTotal } from "./amounts.js";
export { paymentTotals } from "./payment-amounts.js";

const identity = z.string().trim().min(1).max(128);
const date = z.iso.date();
const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const quantity = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,4})?$/)
  .refine((value) => Number(value) > 0, "Quantity must be positive");
export const purchaseKindSchema = z.enum(["request", "rfq", "order", "receipt", "bill", "payment", "multi_payment"]);
export const purchaseStateSchema = z.enum(["draft", "submitted", "approved", "rejected", "cancelled"]);
export const purchaseLineSchema = z.strictObject({
  id: identity.optional(),
  source_line_id: identity.nullable().default(null),
  item_code: z.string().trim().max(64).default(""),
  product_id: identity.nullable().optional(),
  product_name: z.string().trim().max(200).optional(),
  description: z.string().trim().min(1).max(500),
  quantity,
  uom: z.string().trim().min(1).max(32),
  unit_price: amount,
  tax_percent: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/)
    .refine((value) => Number(value) <= 100),
});
export const purchaseAllocationSchema = z.strictObject({
  bill_id: identity,
  amount: amount.refine((value) => Number(value) > 0),
  discount: amount.optional(),
});
export const purchasePaymentEntrySchema = z.strictObject({
  supplier_id: identity,
  supplier_name: z.string().max(200).optional(),
  supplier_code: z.string().max(64).optional(),
  amount: amount.refine((value) => Number(value) > 0),
  mode: z.enum(["bank_transfer", "cheque", "cash", "online", "standing_order", "card"]),
  reference: z.string().trim().max(128).default(""),
  wht_rate: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/)
    .refine((value) => Number(value) <= 100),
  additional_wht: amount,
  mailing_address: z.string().max(1500).optional(),
});
export const purchasePaymentDetailsSchema = z.strictObject({
  bank_account_id: identity,
  bank_account_name: z.string().max(200).optional(),
  account_number_masked: z.string().max(128).nullable().optional(),
  entries: z.array(purchasePaymentEntrySchema).min(1).max(100),
});
export type PurchasePaymentDetails = z.infer<typeof purchasePaymentDetailsSchema>;
export type PurchasePaymentEntry = z.infer<typeof purchasePaymentEntrySchema>;
export const purchaseTermsSchema = z.strictObject({
  company_id: identity,
  kind: purchaseKindSchema,
  supplier_id: identity.nullable().default(null),
  approver_id: identity.nullable().optional(),
  invited_supplier_ids: z.array(identity).max(50).default([]),
  source_id: identity.nullable().default(null),
  document_date: date,
  bill_date: date.nullable().optional(),
  payment_term: billPaymentTermSchema
    .nullable()
    .optional()
    .describe(
      "Bill-only term calculated from bill_date; due_date stores the final scheduled date. Null selects a manual due date.",
    ),
  due_date: date.nullable().default(null),
  currency: z.string().regex(/^[A-Z]{3}$/),
  reference: z.string().trim().max(128).default(""),
  notes: z.string().trim().max(2000).default(""),
  lines: z.array(purchaseLineSchema).max(100).default([]),
  allocations: z.array(purchaseAllocationSchema).max(100).default([]),
  payment_details: purchasePaymentDetailsSchema.nullable().optional(),
});
export const savePurchaseRequestSchema = purchaseTermsSchema.extend({
  expected_version: z.number().int().positive().optional(),
});
export const updatePurchaseRequestSchema = savePurchaseRequestSchema.required({ expected_version: true });
export const purchaseActionRequestSchema = z
  .strictObject({
    company_id: identity,
    expected_version: z.number().int().positive(),
    action: z.enum(["submit", "approve", "reject", "cancel"]),
    reason: z
      .string()
      .trim()
      .max(512)
      .default("")
      .describe("Optional for Purchase approval, including payment instructions; required for other actions."),
  })
  .superRefine((input, context) => {
    if (input.action !== "approve" && !input.reason)
      context.addIssue({ code: "custom", path: ["reason"], message: "A reason is required for this action." });
  });
export const purchaseDocumentSchema = purchaseTermsSchema.extend({
  id: identity,
  code: z.string(),
  state: purchaseStateSchema,
  version: z.number().int().positive(),
  total_amount: amount,
  created_by: identity,
  updated_by: identity,
  created_at: z.string(),
  updated_at: z.string(),
  supplier_name: z.string().nullable(),
  approver_name: z.string().nullable().optional(),
  request_approver_id: identity.nullable().optional(),
  request_approver_name: z.string().nullable().optional(),
  source_code: z.string().nullable(),
  reserved_amount: amount.default("0.00"),
  events: z
    .array(z.strictObject({ action: z.string(), actor_id: identity, reason: z.string(), occurred_at: z.string() }))
    .default([]),
});
export const purchaseDirectorySchema = z.strictObject({
  items: z.array(purchaseDocumentSchema),
  next_cursor: z.string().nullable(),
});
export const purchaseFlowDocumentSchema = purchaseDocumentSchema.pick({
  id: true,
  code: true,
  kind: true,
  state: true,
  source_id: true,
  source_code: true,
  document_date: true,
  supplier_name: true,
  total_amount: true,
  currency: true,
});
export const purchaseFlowQuerySchema = z.strictObject({
  company_id: identity,
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const purchaseFlowSchema = z.strictObject({
  root_id: identity,
  root_code: z.string(),
  items: z.array(purchaseFlowDocumentSchema),
  stages: z.array(
    z.strictObject({
      kind: purchaseKindSchema,
      total: z.number().int().nonnegative(),
      draft: z.number().int().nonnegative(),
      submitted: z.number().int().nonnegative(),
      approved: z.number().int().nonnegative(),
      rejected: z.number().int().nonnegative(),
      cancelled: z.number().int().nonnegative(),
    }),
  ),
  next_cursor: z.string().nullable(),
});
export type PurchaseFlow = z.infer<typeof purchaseFlowSchema>;
export type PurchaseFlowDocument = z.infer<typeof purchaseFlowDocumentSchema>;
export type PurchaseFlowQuery = z.infer<typeof purchaseFlowQuerySchema>;
export const purchaseQuerySchema = z.strictObject({
  company_id: identity,
  kind: purchaseKindSchema.optional(),
  supplier_id: identity.optional(),
  search: z.string().trim().max(160).default(""),
  state: purchaseStateSchema.optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const supplierInputSchema = z.strictObject({
  company_id: identity,
  name: z.string().trim().min(1).max(200),
  tax_id: z.string().trim().max(128).default(""),
  email: z.union([z.email(), z.literal("")]).default(""),
  phone: z.string().trim().max(64).default(""),
  address: z.string().trim().max(1000).default(""),
  profile: supplierProfileSchema.optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  expected_version: z.number().int().positive().optional(),
});
export const supplierSchema = supplierInputSchema.omit({ expected_version: true }).extend({
  id: identity,
  code: z.string(),
  version: z.number().int().positive(),
  risk_status: z.enum(["normal", "watch", "blocked"]),
});
export const updateSupplierInputSchema = supplierInputSchema.required({ expected_version: true });
export const supplierDirectorySchema = z.strictObject({
  items: z.array(supplierSchema),
  next_cursor: z.string().nullable(),
});
export const procurementCompaniesSchema = z.strictObject({
  items: z.array(z.strictObject({ id: identity, code: z.string(), name: z.string() })),
});
export const procurementOptionsSchema = z.strictObject({
  currencies: z.array(z.strictObject({ code: z.string(), name: z.string() })),
  can_self_approve: z.boolean().optional(),
  bank_accounts: z
    .array(
      z.strictObject({
        id: identity,
        account_name: z.string(),
        account_number_masked: z.string().nullable(),
        currency: z.string(),
      }),
    )
    .max(200)
    .optional(),
  execution_mode: z.literal("instruction_only"),
});
export const procurementLookupQuerySchema = z.strictObject({
  company_id: identity,
  search: z.string().trim().max(160).default(""),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const purchaseProductDirectorySchema = z.strictObject({
  items: z.array(z.strictObject({ id: identity, code: z.string(), name: z.string(), uom: z.string() })),
  next_cursor: z.string().nullable(),
});
export const purchaseApproverDirectorySchema = z.strictObject({
  items: z.array(z.strictObject({ id: identity, name: z.string() })),
  next_cursor: z.string().nullable(),
});
export type ProcurementLookupQuery = z.infer<typeof procurementLookupQuerySchema>;
export type PurchaseProductDirectory = z.infer<typeof purchaseProductDirectorySchema>;
export type PurchaseApproverDirectory = z.infer<typeof purchaseApproverDirectorySchema>;
export const purchaseMutationSchema = z.strictObject({ record: purchaseDocumentSchema, audit_event_id: identity });
export const supplierMutationSchema = z.strictObject({ record: supplierSchema, audit_event_id: identity });
export type PurchaseKind = z.infer<typeof purchaseKindSchema>;
export type PurchaseLine = z.infer<typeof purchaseLineSchema>;
export type PurchaseTerms = z.infer<typeof purchaseTermsSchema>;
export type SavePurchaseRequest = z.infer<typeof savePurchaseRequestSchema>;
export type PurchaseActionRequest = z.input<typeof purchaseActionRequestSchema>;
export type PurchaseDocument = z.infer<typeof purchaseDocumentSchema>;
export type PurchaseDirectory = z.infer<typeof purchaseDirectorySchema>;
export type PurchaseQuery = z.infer<typeof purchaseQuerySchema>;
export type SupplierInput = z.infer<typeof supplierInputSchema>;
export type Supplier = z.infer<typeof supplierSchema>;
export type SupplierDirectory = z.infer<typeof supplierDirectorySchema>;
export type ProcurementCompanies = z.infer<typeof procurementCompaniesSchema>;
export type ProcurementOptions = z.infer<typeof procurementOptionsSchema>;
export type PurchaseMutation = z.infer<typeof purchaseMutationSchema>;
export type SupplierMutation = z.infer<typeof supplierMutationSchema>;
