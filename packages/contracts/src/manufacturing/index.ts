import { z } from "zod";
import { parseQuantity } from "./quantities.js";
import { unitSnapshotSchema } from "../inventory/units.js";
import {
  bomChargeInputSchema,
  bomChargeSchema,
  manufacturingRecipeSchema,
  manufacturingOrderLineInputSchema,
} from "./templates.js";
export * from "./templates.js";

export * from "./quantities.js";

/** Versioned BOM templates feed plans and approved order recipes.
 * Physical issue, actual charge capitalization and completion use the stock service. */
const identity = z.string().trim().min(1).max(128);
const text = (max: number) => z.string().trim().max(max).default("");
const date = z.iso.date();
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,4})?$/, "Use up to 12 digits and 4 decimal places.");
const positiveQuantity = quantity.refine((value) => parseQuantity(value) > 0n, "Enter a quantity greater than zero.");
const version = z.number().int().positive();
const directory = <T extends z.ZodType>(item: T) =>
  z.strictObject({ items: z.array(item), next_cursor: z.string().nullable() });

export const manufacturingSurfaceSchema = z.enum(["boms", "plans", "orders"]);
export type ManufacturingSurface = z.infer<typeof manufacturingSurfaceSchema>;

export const manufacturingCompaniesSchema = z.strictObject({
  items: z.array(z.strictObject({ id: identity, code: z.string(), name: z.string() })),
});
export type ManufacturingCompanies = z.infer<typeof manufacturingCompaniesSchema>;

/**
 * Lookup kinds. `finished_product`: active goods marked for manufacture (all pages).
 * `component`: active goods (BOM lines). `project`/`location`: active company masters.
 */
export const manufacturingLookupKindSchema = z.enum([
  "finished_product",
  "component",
  "non_stock",
  "warehouse",
  "expense",
  "currency",
  "project",
  "location",
]);
export type ManufacturingLookupKind = z.infer<typeof manufacturingLookupKindSchema>;
export const manufacturingLookupQuerySchema = z.strictObject({
  company_id: identity,
  surface: manufacturingSurfaceSchema,
  kind: manufacturingLookupKindSchema,
  search: text(160),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ManufacturingLookupQuery = z.infer<typeof manufacturingLookupQuerySchema>;
export const manufacturingLookupDirectorySchema = directory(
  z.strictObject({ id: identity, code: z.string(), name: z.string(), unit: z.string().nullable() }),
);
export type ManufacturingLookupDirectory = z.infer<typeof manufacturingLookupDirectorySchema>;

export const manufacturingDirectoryQuerySchema = z.strictObject({
  company_id: identity,
  search: text(160),
  state: z.enum(["draft", "converted", "submitted", "returned", "approved"]).optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ManufacturingDirectoryQuery = z.infer<typeof manufacturingDirectoryQuerySchema>;

/* ---------------------------------------------------------------- Bill of Materials */

export const bomLineInputSchema = z.strictObject({
  product_id: identity,
  quantity: positiveQuantity,
  unit_id: identity.optional(),
  warehouse_id: identity.nullable().optional(),
  description: text(500).optional(),
});
const bomFields = z.strictObject({
  company_id: identity,
  product_id: identity,
  output_quantity: positiveQuantity,
  template_name: text(120).optional(),
  warehouse_id: identity.nullable().optional(),
  output_unit_id: identity.optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  charges: z.array(bomChargeInputSchema).max(100).optional(),
  notes: text(4000),
  lines: z.array(bomLineInputSchema).min(1, "Add at least one component.").max(200),
  expected_version: version.optional(),
});
export const bomInputSchema = bomFields.superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.lines.forEach((line, index) => {
    if (line.product_id === value.product_id)
      ctx.addIssue({
        code: "custom",
        path: ["lines", index, "product_id"],
        message: "A component cannot be the finished product.",
      });
    if (seen.has(line.product_id))
      ctx.addIssue({ code: "custom", path: ["lines", index, "product_id"], message: "Use each component once." });
    seen.add(line.product_id);
  });
});
export const updateBomInputSchema = bomInputSchema.safeExtend({ expected_version: version });
export const bomLineSchema = z.strictObject({
  product_id: identity,
  product_code: z.string(),
  product_name: z.string(),
  quantity: z.string(),
  unit: z.string(),
  unit_snapshot: unitSnapshotSchema.nullable().optional(),
  warehouse_id: identity.nullable().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
});
export const bomSchema = z.strictObject({
  id: identity,
  company_id: identity,
  code: z.string(),
  product_id: identity,
  product_code: z.string(),
  product_name: z.string(),
  output_quantity: z.string(),
  unit: z.string(),
  notes: z.string(),
  component_count: z.number().int().nonnegative(),
  template_name: z.string().optional(),
  warehouse_id: identity.nullable().optional(),
  currency: z.string().optional(),
  decimal_places: z.number().int().min(0).max(8).optional(),
  charges: z.array(bomChargeSchema).optional(),
  output_snapshot: unitSnapshotSchema.nullable().optional(),
  lines: z.array(bomLineSchema),
  version,
  created_at: z.string(),
  updated_at: z.string(),
});
export const bomDirectorySchema = directory(bomSchema);
export const bomMutationSchema = z.strictObject({ record: bomSchema, audit_event_id: identity });
export const bomByProductQuerySchema = z.strictObject({ company_id: identity, surface: manufacturingSurfaceSchema });
export type BomLineInput = z.infer<typeof bomLineInputSchema>;
export type BomInput = z.infer<typeof bomInputSchema>;
export type Bom = z.infer<typeof bomSchema>;
export type BomLine = z.infer<typeof bomLineSchema>;
export type BomDirectory = z.infer<typeof bomDirectorySchema>;
export type BomMutation = z.infer<typeof bomMutationSchema>;

/* ---------------------------------------------------------------- Production plans */

const planFields = z.strictObject({
  bom_version: version.optional(),
  warehouse_id: identity.nullable().optional(),
  company_id: identity,
  product_id: identity,
  planned_quantity: positiveQuantity,
  notes: text(4000),
  expected_version: version.optional(),
});
export const productionPlanInputSchema = planFields;
export const updateProductionPlanInputSchema = planFields.extend({ expected_version: version });
export const productionPlanSchema = z.strictObject({
  recipe: manufacturingRecipeSchema.nullable().optional(),
  id: identity,
  company_id: identity,
  code: z.string(),
  product_id: identity,
  product_code: z.string(),
  product_name: z.string(),
  planned_quantity: z.string(),
  unit: z.string(),
  notes: z.string(),
  state: z.enum(["draft", "converted"]),
  manufacturing_order_id: identity.nullable(),
  manufacturing_order_code: z.string().nullable(),
  version,
  created_at: z.string(),
  updated_at: z.string(),
});
export const productionPlanDirectorySchema = directory(productionPlanSchema);
export const productionPlanMutationSchema = z.strictObject({ record: productionPlanSchema, audit_event_id: identity });
/** Converting needs nothing but the current version; the order is dated today unless a date is given. */
export const convertProductionPlanInputSchema = z.strictObject({
  company_id: identity,
  expected_version: version,
  order_date: date.optional(),
});
export type ProductionPlanInput = z.infer<typeof productionPlanInputSchema>;
export type ProductionPlan = z.infer<typeof productionPlanSchema>;
export type ProductionPlanDirectory = z.infer<typeof productionPlanDirectorySchema>;
export type ProductionPlanMutation = z.infer<typeof productionPlanMutationSchema>;
export type ConvertProductionPlanInput = z.infer<typeof convertProductionPlanInputSchema>;

/* ---------------------------------------------------------------- Manufacturing orders */

/** `submitted` and `returned` exist only on orders made before the one-step confirmation. */
export const manufacturingOrderStateSchema = z.enum(["draft", "submitted", "returned", "approved"]);
export type ManufacturingOrderState = z.infer<typeof manufacturingOrderStateSchema>;
const orderFields = z.strictObject({
  bom_version: version.optional(),
  warehouse_id: identity.nullable().optional(),
  lines: z.array(manufacturingOrderLineInputSchema).min(1).max(200).optional(),
  company_id: identity,
  product_id: identity,
  quantity: positiveQuantity,
  order_date: date,
  project_id: identity.nullable().default(null),
  location_id: identity.nullable().default(null),
  notes: text(4000),
  expected_version: version.optional(),
});
export const manufacturingOrderInputSchema = orderFields;
export const updateManufacturingOrderInputSchema = orderFields.extend({ expected_version: version });
export const manufacturingOrderEventSchema = z.strictObject({
  action: z.string(),
  actor_id: z.string(),
  actor_name: z.string(),
  reason: z.string(),
  override: z.boolean(),
  occurred_at: z.string(),
});
export const manufacturingOrderSchema = z.strictObject({
  recipe: manufacturingRecipeSchema.nullable().optional(),
  id: identity,
  company_id: identity,
  code: z.string(),
  product_id: identity,
  product_code: z.string(),
  product_name: z.string(),
  plan_id: identity.nullable(),
  plan_code: z.string().nullable(),
  quantity: z.string(),
  unit: z.string(),
  order_date: z.string(),
  project_id: identity.nullable(),
  project_name: z.string().nullable(),
  location_id: identity.nullable(),
  location_name: z.string().nullable(),
  state: manufacturingOrderStateSchema,
  notes: z.string(),
  created_by: z.string(),
  created_by_name: z.string(),
  approved_by_name: z.string().nullable(),
  approved_at: z.string().nullable(),
  issued_quantity: z.string().optional(),
  completed_quantity: z.string().optional(),
  events: z.array(manufacturingOrderEventSchema),
  version,
  created_at: z.string(),
  updated_at: z.string(),
});
export const manufacturingOrderDirectorySchema = directory(manufacturingOrderSchema);
export const manufacturingOrderMutationSchema = z.strictObject({
  record: manufacturingOrderSchema,
  audit_event_id: identity,
});
/** One step: confirming a draft order approves it. */
export const manufacturingOrderActionSchema = z.strictObject({
  company_id: identity,
  expected_version: version,
  action: z.literal("approve"),
});
export const convertProductionPlanResultSchema = z.strictObject({
  plan: productionPlanSchema,
  order: manufacturingOrderSchema,
  audit_event_id: identity,
});
export type ConvertProductionPlanResult = z.infer<typeof convertProductionPlanResultSchema>;
export type ManufacturingOrderInput = z.infer<typeof manufacturingOrderInputSchema>;
export type ManufacturingOrder = z.infer<typeof manufacturingOrderSchema>;
export type ManufacturingOrderEvent = z.infer<typeof manufacturingOrderEventSchema>;
export type ManufacturingOrderDirectory = z.infer<typeof manufacturingOrderDirectorySchema>;
export type ManufacturingOrderMutation = z.infer<typeof manufacturingOrderMutationSchema>;
export type ManufacturingOrderAction = z.input<typeof manufacturingOrderActionSchema>;
