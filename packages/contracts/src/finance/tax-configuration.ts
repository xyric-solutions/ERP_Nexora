import { z } from "zod";
import { taxTypeSchema } from "./taxes.js";

const regionFields = {
  name: z.string().trim().min(1).max(100),
  short_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9-]{0,9}$/),
  status: z.enum(["active", "inactive"]),
};
const regionCode = z.string().regex(/^TRG-[0-9]{3,}$/);
export const taxRegionInputSchema = z.strictObject({ code: regionCode.optional(), ...regionFields });
export const taxRegionSchema = z.strictObject({ code: regionCode, ...regionFields });
export const taxDisplaySchema = z.strictObject({
  tax_type: taxTypeSchema,
  label: z.string().trim().min(1).max(60),
  supplier: z.boolean(),
  customer: z.boolean(),
});
const display = z
  .array(taxDisplaySchema)
  .length(taxTypeSchema.options.length)
  .refine(
    (rows) => new Set(rows.map((row) => row.tax_type)).size === taxTypeSchema.options.length,
    "Configure each tax type exactly once.",
  );
const regions = z
  .array(taxRegionInputSchema)
  .max(100)
  .refine(
    (rows) =>
      new Set(rows.map((row) => row.short_code)).size === rows.length &&
      new Set(rows.flatMap((row) => (row.code ? [row.code] : []))).size === rows.filter((row) => row.code).length,
    "Region codes must be unique, including inactive regions.",
  );
export const taxConfigurationInputSchema = z.strictObject({
  company_id: z.string().trim().min(1).max(128),
  expected_version: z.number().int().min(0),
  year_end_date: z.iso.date().nullable(),
  display,
  regions,
  reason: z.string().trim().min(3).max(500),
});
export const taxConfigurationSchema = z.strictObject({
  company_id: z.string(),
  version: z.number().int().min(0),
  year_end_date: z.iso.date().nullable(),
  display,
  regions: z.array(taxRegionSchema).max(100),
});
export function defaultTaxConfiguration(company_id: string): TaxConfiguration {
  return {
    company_id,
    version: 0,
    year_end_date: null,
    regions: [],
    display: taxTypeSchema.options.map((tax_type) => ({ tax_type, label: tax_type, supplier: true, customer: true })),
  };
}
export type TaxConfiguration = z.infer<typeof taxConfigurationSchema>;
export type TaxConfigurationInput = z.infer<typeof taxConfigurationInputSchema>;
export type TaxRegionInput = z.infer<typeof taxRegionInputSchema>;
