import { z } from "zod";
import { decimal, decimalText, divideRounded } from "./exact-money.js";

const id = z.string().trim().min(1).max(128);
export const taxTypeSchema = z.enum(["WHT", "GST", "VAT", "Excise", "Payroll Tax", "Other"]);
export const taxModuleSchema = z.enum(["purchases", "sales", "payroll", "fixed_assets"]);
export const taxTreatmentSchema = z.enum(["withholding", "output", "recoverable", "payroll_deduction"]);
export const taxTriggerSchema = z.enum(["recognition", "settlement", "calculation"]);
export const taxRateSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/)
  .refine((value) => {
    try {
      return decimal(value, 2) <= 10000n;
    } catch {
      return false;
    }
  }, "Rate must have at most two decimals and cannot exceed 100%.");
export const taxContextRules = [
  { module: "purchases", treatment: "recoverable", trigger: "recognition", account_type: "asset" },
  { module: "purchases", treatment: "withholding", trigger: "recognition", account_type: "liability" },
  { module: "purchases", treatment: "withholding", trigger: "settlement", account_type: "liability" },
  { module: "sales", treatment: "output", trigger: "recognition", account_type: "liability" },
  { module: "payroll", treatment: "payroll_deduction", trigger: "calculation", account_type: "liability" },
  { module: "fixed_assets", treatment: "recoverable", trigger: "recognition", account_type: "asset" },
  { module: "fixed_assets", treatment: "withholding", trigger: "recognition", account_type: "liability" },
] as const;
export const taxInputSchema = z
  .strictObject({
    company_id: id,
    name: z.string().trim().min(1).max(200),
    tax_type: taxTypeSchema,
    rate: taxRateSchema,
    description: z.string().trim().max(2000).default(""),
    module: taxModuleSchema,
    treatment: taxTreatmentSchema,
    trigger: taxTriggerSchema,
    payroll_component_id: id.optional(),
    payroll_basis_component_id: id.optional(),
    account_id: id,
    effective_date: z.iso.date(),
    status: z.enum(["active", "inactive"]).default("active"),
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    (value) =>
      value.module !== "payroll"
        ? !value.payroll_component_id && !value.payroll_basis_component_id
        : !!value.payroll_component_id && !!value.payroll_basis_component_id,
    {
      message: "Payroll taxes require an explicit deduction component and earning basis.",
      path: ["payroll_component_id"],
    },
  )
  .refine(
    (value) =>
      taxContextRules.some(
        (rule) => rule.module === value.module && rule.treatment === value.treatment && rule.trigger === value.trigger,
      ),
    { message: "The tax treatment and trigger are not supported for this module.", path: ["treatment"] },
  );
export const taxUpdateSchema = taxInputSchema.safeExtend({ expected_version: z.number().int().positive() });
export const taxStatusSchema = z.strictObject({
  company_id: id,
  expected_version: z.number().int().positive(),
  status: z.enum(["active", "inactive"]),
  reason: z.string().trim().min(3).max(500),
});
export const taxQuerySchema = z.strictObject({
  company_id: id,
  search: z.string().trim().max(100).default(""),
  module: taxModuleSchema.optional(),
  tax_type: taxTypeSchema.optional(),
  status: z.enum(["active", "inactive"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export const taxScopeSchema = z.strictObject({ company_id: id });
export const taxDefinitionSchema = z.strictObject({
  id,
  company_id: id,
  code: id,
  version: z.number().int().positive(),
  revision: z.number().int().positive(),
  name: z.string(),
  tax_type: taxTypeSchema,
  rate: z.string(),
  description: z.string(),
  module: taxModuleSchema,
  treatment: taxTreatmentSchema,
  trigger: taxTriggerSchema,
  account_id: id,
  payroll_component_id: id.nullable().default(null),
  payroll_basis_component_id: id.nullable().default(null),
  account_code: z.string(),
  account_name: z.string(),
  effective_date: z.iso.date(),
  status: z.enum(["active", "inactive"]),
});
export const taxDirectorySchema = z.strictObject({
  items: z.array(taxDefinitionSchema),
  total: z.number().int().min(0),
});
export const taxDetailSchema = taxDefinitionSchema.extend({ history: z.array(taxDefinitionSchema) });
export const taxOptionsSchema = z.strictObject({
  can_manage: z.boolean(),
  types: z.array(taxTypeSchema),
  rules: z.array(
    z.strictObject({
      module: taxModuleSchema,
      treatment: taxTreatmentSchema,
      trigger: taxTriggerSchema,
      account_type: z.enum(["asset", "liability"]),
    }),
  ),
  accounts: z.array(
    z.strictObject({
      id,
      code: z.string(),
      name: z.string(),
      type: z.enum(["asset", "liability"]),
      currency: z.string().nullable(),
    }),
  ),
  payroll_components: z
    .array(z.strictObject({ id, code: z.string(), name: z.string(), kind: z.enum(["earning", "deduction"]) }))
    .max(500),
  total_accounts: z.number().int().min(0),
});
export const taxSnapshotSchema = z.strictObject({
  source_item_id: id.optional(),
  prior_basis: z.string().default("0"),
  prior_amount: z.string().default("0"),
  definition_id: id,
  revision: z.number().int().positive(),
  code: id,
  name: z.string(),
  module: taxModuleSchema,
  treatment: taxTreatmentSchema,
  trigger: taxTriggerSchema,
  account_id: id,
  rate: z.string(),
  basis: z.string(),
  amount: z.string(),
  currency: z.string(),
  decimal_places: z.number().int().min(0).max(8),
});
export function calculateTax(basis: string, rate: string, precision: number): string {
  const units = decimal(basis, precision, true);
  return decimalText(divideRounded(units * decimal(taxRateSchema.parse(rate), 2), 10000n), precision);
}
export type TaxInput = z.infer<typeof taxInputSchema>;
export type TaxUpdate = z.infer<typeof taxUpdateSchema>;
export type TaxStatus = z.infer<typeof taxStatusSchema>;
export type TaxQuery = z.infer<typeof taxQuerySchema>;
export type TaxDefinition = z.infer<typeof taxDefinitionSchema>;
export type TaxDirectory = z.infer<typeof taxDirectorySchema>;
export type TaxDetail = z.infer<typeof taxDetailSchema>;
export type TaxOptions = z.infer<typeof taxOptionsSchema>;
export type TaxSnapshot = z.infer<typeof taxSnapshotSchema>;
