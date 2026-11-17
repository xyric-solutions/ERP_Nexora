import { z } from "zod";

const identity = z.string().trim().min(1).max(128);
export const unitCategorySchema = z.enum([
  "mass",
  "length",
  "area",
  "volume",
  "count",
  "time",
  "packaging",
  "legacy_day",
]);
export const unitFactorSchema = z.string().regex(/^[1-9]\d{0,17}$/, "Use a positive whole number of up to 18 digits.");
const ratioValue = z.string().regex(/^[1-9]\d{0,35}$/);
export const unitInputSchema = z.strictObject({
  company_id: identity,
  name: z.string().trim().min(1).max(32),
  symbol: z.string().trim().min(1).max(16),
  category: unitCategorySchema,
  numerator: unitFactorSchema.default("1"),
  denominator: unitFactorSchema.default("1"),
  precision: z.number().int().min(0).max(4).default(4),
  status: z.enum(["active", "inactive"]).default("active"),
  expected_version: z.number().int().positive().optional(),
});
export const unitSchema = unitInputSchema.omit({ expected_version: true }).extend({
  id: identity,
  code: identity,
  standard: z.boolean(),
  version: z.number().int().positive(),
});
export const unitQuerySchema = z.strictObject({
  company_id: identity,
  search: z.string().trim().max(160).default(""),
  category: unitCategorySchema.optional(),
  status: z.enum(["active", "inactive"]).optional(),
  after: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const unitDirectorySchema = z.strictObject({ items: z.array(unitSchema), next_cursor: z.string().nullable() });
export const unitMutationSchema = z.strictObject({ record: unitSchema, audit_event_id: identity });
export const packagingRuleSchema = z.strictObject({
  unit_id: identity,
  quantity: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,4})?$/)
    .refine((v) => /[1-9]/.test(v), "Contents must be positive."),
});
export const unitSnapshotSchema = z.strictObject({
  unit_id: identity,
  unit_name: z.string(),
  base_unit_id: identity,
  base_unit_name: z.string(),
  entered_quantity: z.string(),
  base_quantity: z.string(),
  numerator: ratioValue,
  denominator: ratioValue,
  unit_precision: z.number().int().min(0).max(4),
  base_precision: z.number().int().min(0).max(4),
});
export const unitConversionInputSchema = z.strictObject({
  company_id: identity,
  from_id: identity,
  to_id: identity,
  quantity: z.string().regex(/^\d{1,12}(\.\d{1,12})?$/),
  product_id: identity.optional(),
});
export const unitConversionSchema = z.strictObject({
  quantity: z.string(),
  exact: z.boolean(),
  from: unitSchema,
  to: unitSchema,
});
export const productUnitsSchema = z.strictObject({
  base: unitSchema,
  items: z.array(z.strictObject({ unit: unitSchema, numerator: ratioValue, denominator: ratioValue })),
});
export type MeasurementUnit = z.infer<typeof unitSchema>;
export type UnitInput = z.infer<typeof unitInputSchema>;
export type UnitQuery = z.infer<typeof unitQuerySchema>;
export type UnitDirectory = z.infer<typeof unitDirectorySchema>;
export type UnitMutation = z.infer<typeof unitMutationSchema>;
export type PackagingRule = z.infer<typeof packagingRuleSchema>;
export type UnitSnapshot = z.infer<typeof unitSnapshotSchema>;
export type UnitConversionInput = z.infer<typeof unitConversionInputSchema>;
export type UnitConversion = z.infer<typeof unitConversionSchema>;
export type ProductUnits = z.infer<typeof productUnitsSchema>;

type Factor = Pick<MeasurementUnit, "category" | "numerator" | "denominator">;
export function reduceUnitRatio(numerator: bigint, denominator: bigint) {
  let a = numerator,
    b = denominator;
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return { numerator: (numerator / a).toString(), denominator: (denominator / a).toString() };
}
export function unitRatio(from: Factor, to: Factor) {
  if (from.category !== to.category || from.category === "packaging" || from.category === "legacy_day")
    throw new Error("Choose compatible measurement units. Packaging requires a product content rule.");
  return reduceUnitRatio(
    BigInt(from.numerator) * BigInt(to.denominator),
    BigInt(from.denominator) * BigInt(to.numerator),
  );
}
export function convertUnitQuantity(quantity: string, ratio: { numerator: string; denominator: string }, places = 12) {
  if (!/^\d{1,12}(\.\d{1,12})?$/.test(quantity) || !Number.isInteger(places) || places < 0 || places > 12)
    throw new Error("Enter a non-negative quantity with up to 12 decimal places.");
  ratioValue.parse(ratio.numerator);
  ratioValue.parse(ratio.denominator);
  const [whole, fraction = ""] = quantity.split(".");
  const denominator = BigInt(ratio.denominator) * 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole! + fraction) * BigInt(ratio.numerator) * 10n ** BigInt(places);
  const scaled = numerator / denominator,
    exact = numerator % denominator === 0n;
  if (scaled >= 10n ** BigInt(12 + places)) throw new Error("Converted quantity exceeds the supported quantity limit.");
  const digits = scaled.toString().padStart(places + 1, "0");
  const result = places ? `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/, "") : digits;
  return { quantity: result || "0", exact };
}
