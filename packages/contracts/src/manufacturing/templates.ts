import { z } from "zod";
import { unitSnapshotSchema } from "../inventory/units.js";
import { parseQuantity, formatQuantity, scaleQuantity } from "./quantities.js";
const id = z.string().trim().min(1).max(128),
  quantity = z.string().regex(/^\d{1,12}(\.\d{1,4})?$/),
  positive = quantity.refine((v) => parseQuantity(v) > 0n),
  amount = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/);
export const bomChargeInputSchema = z.strictObject({
  kind: z.enum(["non_stock", "expense"]),
  product_id: id.nullable().optional(),
  expense_account_id: id.nullable().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: positive,
  rate: amount,
});
export const bomChargeSchema = bomChargeInputSchema.extend({
  product_name: z.string().nullable(),
  account_name: z.string().nullable(),
  amount: z.string(),
});
export const recipeLineSchema = z.strictObject({
  product_id: id,
  product_code: z.string(),
  product_name: z.string(),
  category: z.string(),
  description: z.string(),
  bom_quantity: quantity,
  quantity: quantity,
  standard_quantity: quantity,
  remark: z.string().max(500),
  unit: z.string(),
  unit_snapshot: unitSnapshotSchema.nullable(),
  warehouse_id: id.nullable(),
  warehouse_name: z.string().nullable(),
});
export const manufacturingRecipeSchema = z.strictObject({
  bom_id: id,
  bom_code: z.string(),
  bom_version: z.number().int().positive(),
  template_name: z.string(),
  product_id: id,
  product_code: z.string(),
  product_name: z.string(),
  output_quantity: positive,
  quantity: positive,
  unit: z.string(),
  warehouse_id: id.nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  decimal_places: z.number().int().min(0).max(8),
  lines: z.array(recipeLineSchema).min(1).max(200),
  charges: z.array(bomChargeSchema).max(100),
  estimated_charges: z.string(),
  notes: z.string(),
});
export const requirementsQuerySchema = z.strictObject({
  company_id: id,
  surface: z.enum(["boms", "plans", "orders"]),
  product_id: id,
  quantity: positive,
  bom_version: z.coerce.number().int().positive().optional(),
  warehouse_id: id.optional(),
  as_of: z.iso.date().optional(),
});
export const requirementsPreviewSchema = z.strictObject({
  recipe: manufacturingRecipeSchema,
  availability: z.array(
    z.strictObject({
      product_id: id,
      warehouse_id: id.nullable(),
      warehouse_name: z.string().nullable(),
      on_hand: z.string().nullable(),
      required_quantity: z.string(),
      shortage: z.string().nullable(),
      as_of: z.iso.date(),
    }),
  ),
});
export const manufacturingOrderLineInputSchema = z.strictObject({
  product_id: id,
  quantity: positive,
  remark: z.string().trim().max(500).default(""),
});
export const materialBalanceQuerySchema = z.strictObject({
  company_id: id,
  surface: z.enum(["boms", "plans", "orders"]),
  product_id: id,
  warehouse_id: id.optional(),
  as_of: z.iso.date().optional(),
});
export const materialBalanceSchema = z.strictObject({
  product_id: id,
  category: z.string(),
  unit: z.string(),
  warehouse_id: id.nullable(),
  on_hand: z.string().nullable(),
  as_of: z.iso.date(),
});
export type MaterialBalanceQuery = z.infer<typeof materialBalanceQuerySchema>;
export type MaterialBalance = z.infer<typeof materialBalanceSchema>;
/** Cumulative rounding keeps multiple actual batches equal to the approved total. */
export function expectedBatchMaterials(recipe: ManufacturingRecipe, issued: string, quantity: string) {
  const cumulative = formatQuantity(parseQuantity(issued) + parseQuantity(quantity));
  return recipe.lines.map((line) => ({
    ...line,
    quantity: formatQuantity(
      parseQuantity(scaleQuantity(line.quantity, recipe.quantity, cumulative)) -
        parseQuantity(scaleQuantity(line.quantity, recipe.quantity, issued)),
    ),
  }));
}
export type BomChargeInput = z.infer<typeof bomChargeInputSchema>;
export type ManufacturingRecipe = z.infer<typeof manufacturingRecipeSchema>;
export type RequirementsQuery = z.infer<typeof requirementsQuerySchema>;
export type RequirementsPreview = z.infer<typeof requirementsPreviewSchema>;
