import { z } from "zod";

const identity = z.string().trim().min(1).max(128);
const text = (max: number) => z.string().trim().max(max).default("");
const quantity = z.string().regex(/^\d{1,12}(\.\d{1,4})?$/, "Use up to 12 digits and 4 decimal places.");
const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Use up to 12 digits and 2 decimal places.");
const percent = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/)
  .refine((value) => Number(value) <= 100, "Use a percentage from 0 to 100.");
const date = z.iso.date();
export const productUnits = ["Each", "Pcs", "Box", "Pack", "Kg", "Gram", "Litre", "Metre", "Hour", "Day"] as const;
const productFieldsSchema = z.strictObject({
  company_id: identity,
  name: z.string().trim().min(1).max(200),
  type: z.enum(["goods", "service"]).default("goods"),
  status: z.enum(["active", "inactive"]).default("active"),
  category: text(120),
  reference: text(120),
  barcode: text(120),
  unit: z.enum(productUnits).default("Each"),
  sales_enabled: z.boolean().default(true),
  purchase_enabled: z.boolean().default(true),
  manufacture_enabled: z.boolean().default(false),
  track_inventory: z.boolean().default(true),
  sales_description: text(2000),
  purchase_description: text(2000),
  notes: text(4000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  sale_price: amount.default("0"),
  cost: amount.default("0"),
  sale_discount: percent.default("0"),
  purchase_discount: percent.default("0"),
  sales_tax: percent.default("0"),
  purchase_tax: percent.default("0"),
  non_filer_tax: percent.default("0"),
  invoice_policy: z.enum(["ordered", "delivered"]).default("ordered"),
  low_stock_level: quantity.default("0"),
  bin_location: text(120),
  weight: quantity.default("0"),
  large_pack_size: quantity.refine((v) => Number(v) > 0).default("1"),
  small_pack_size: quantity.refine((v) => Number(v) > 0).default("1"),
  opening_date: date.nullable().default(null),
  opening_quantity: quantity.default("0"),
  opening_rate: amount.default("0"),
  preferred_supplier_id: identity.nullable().default(null),
  stock_account_id: identity.nullable().default(null),
  income_account_id: identity.nullable().default(null),
  expense_account_id: identity.nullable().default(null),
  location_id: identity.nullable().default(null),
  default_warehouse_id: identity.nullable().default(null),
  expected_version: z.number().int().positive().optional(),
});
// Browser drafts allow blank fields; public mutations use productInputSchema.
export const productDraftSchema = productFieldsSchema.extend({
  name: z.string().trim().max(200),
  currency: z.string().max(3),
});
export const productInputSchema = productFieldsSchema.superRefine((value, ctx) => {
  if (value.type === "service" && value.track_inventory)
    ctx.addIssue({ code: "custom", path: ["track_inventory"], message: "Services cannot track inventory." });
  if (value.type === "service" && value.manufacture_enabled)
    ctx.addIssue({
      code: "custom",
      path: ["manufacture_enabled"],
      message: "Only goods can be marked for manufacture.",
    });
  if (Number(value.opening_quantity) > 0 && (!value.track_inventory || !value.opening_date))
    ctx.addIssue({
      code: "custom",
      path: ["opening_quantity"],
      message: "Opening stock requires inventory tracking and an opening date.",
    });
});
export const updateProductInputSchema = productInputSchema.safeExtend({
  expected_version: z.number().int().positive(),
});
export const productSchema = productFieldsSchema.omit({ expected_version: true }).extend({
  id: identity,
  code: identity,
  version: z.number().int().positive(),
  preferred_supplier_name: z.string().nullable(),
  stock_account_name: z.string().nullable(),
  income_account_name: z.string().nullable(),
  expense_account_name: z.string().nullable(),
  location_name: z.string().nullable(),
  default_warehouse_name: z.string().nullable(),
  // Opening plans are not posted stock. Never infer an on-hand balance from master data.
  on_hand_quantity: z.null(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const productQuerySchema = z.strictObject({
  company_id: identity,
  search: text(160),
  type: z.enum(["goods", "service"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  category: z.string().trim().max(120).optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const productDirectorySchema = z.strictObject({
  items: z.array(productSchema),
  next_cursor: z.string().nullable(),
});
export const inventoryCompaniesSchema = z.strictObject({
  items: z.array(z.strictObject({ id: identity, code: z.string(), name: z.string() })),
});
export const inventoryOptionsSchema = z.strictObject({
  currencies: z.array(z.strictObject({ code: z.string(), name: z.string() })),
  units: z.array(z.enum(productUnits)),
  stock_mode: z.literal("opening_plan"),
});
export const productMutationSchema = z.strictObject({ record: productSchema, audit_event_id: identity });
export const inventorySurfaceSchema = z.enum(["products", "warehouses", "transfers"]);
export type InventorySurface = z.infer<typeof inventorySurfaceSchema>;
export const productLookupKindSchema = z.enum([
  "supplier",
  "stock_account",
  "income_account",
  "expense_account",
  "location",
  "warehouse",
  "product",
]);
export const productLookupQuerySchema = z.strictObject({
  company_id: identity,
  kind: productLookupKindSchema,
  surface: inventorySurfaceSchema.default("products"),
  search: text(160),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const productLookupDirectorySchema = z.strictObject({
  items: z.array(z.strictObject({ id: identity, code: z.string(), name: z.string(), unit: z.string().optional() })),
  next_cursor: z.string().nullable(),
});
export type ProductInput = z.infer<typeof productInputSchema>;
export type Product = z.infer<typeof productSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
export type ProductLookupQuery = z.infer<typeof productLookupQuerySchema>;
export type ProductLookupKind = z.infer<typeof productLookupKindSchema>;
export type ProductDirectory = z.infer<typeof productDirectorySchema>;
export type ProductMutation = z.infer<typeof productMutationSchema>;
export type InventoryCompanies = z.infer<typeof inventoryCompaniesSchema>;
export type InventoryOptions = z.infer<typeof inventoryOptionsSchema>;
export type ProductLookupDirectory = z.infer<typeof productLookupDirectorySchema>;

const warehouseFields = z.strictObject({
  company_id: identity,
  name: z.string().trim().min(1).max(200),
  location_id: identity.nullable().default(null),
  address: text(1000),
  contact_name: text(160),
  phone: text(60),
  email: z.union([z.literal(""), z.email().max(254)]).default(""),
  notes: text(4000),
  status: z.enum(["active", "inactive"]).default("active"),
  expected_version: z.number().int().positive().optional(),
});
export const warehouseInputSchema = warehouseFields;
export const warehouseDraftSchema = warehouseFields.extend({ name: z.string().max(200) });
export const updateWarehouseInputSchema = warehouseFields.extend({ expected_version: z.number().int().positive() });
export const warehouseSchema = warehouseFields.omit({ expected_version: true }).extend({
  id: identity,
  code: identity,
  version: z.number().int().positive(),
  location_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const inventoryDirectoryQuerySchema = z.strictObject({
  company_id: identity,
  search: text(160),
  status: z.enum(["active", "inactive"]).optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const warehouseDirectorySchema = z.strictObject({
  items: z.array(warehouseSchema),
  next_cursor: z.string().nullable(),
});
export const warehouseMutationSchema = z.strictObject({ record: warehouseSchema, audit_event_id: identity });
export const transferLineInputSchema = z.strictObject({
  product_id: identity,
  quantity: quantity.refine((v) => Number(v) > 0, "Quantity must be greater than zero."),
});
const transferFields = z.strictObject({
  company_id: identity,
  from_warehouse_id: identity,
  to_warehouse_id: identity,
  transfer_date: date,
  reference: text(160),
  notes: text(4000),
  lines: z.array(transferLineInputSchema).min(1).max(100),
  expected_version: z.number().int().positive().optional(),
});
export const stockTransferInputSchema = transferFields.superRefine((value, ctx) => {
  if (value.from_warehouse_id === value.to_warehouse_id)
    ctx.addIssue({ code: "custom", path: ["to_warehouse_id"], message: "Choose a different destination warehouse." });
  const seen = new Set<string>();
  value.lines.forEach((line, index) => {
    if (seen.has(line.product_id))
      ctx.addIssue({ code: "custom", path: ["lines", index, "product_id"], message: "Use one line per product." });
    seen.add(line.product_id);
  });
});
export const updateStockTransferInputSchema = stockTransferInputSchema.safeExtend({
  expected_version: z.number().int().positive(),
});
export const stockTransferSchema = transferFields.omit({ expected_version: true, lines: true }).extend({
  id: identity,
  code: identity,
  version: z.number().int().positive(),
  state: z.literal("draft"),
  posted: z.literal(false),
  from_warehouse_name: z.string(),
  to_warehouse_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  lines: z.array(
    transferLineInputSchema.extend({ product_code: z.string(), product_name: z.string(), unit: z.string() }),
  ),
});
export const stockTransferDirectorySchema = z.strictObject({
  items: z.array(stockTransferSchema),
  next_cursor: z.string().nullable(),
});
export const stockTransferMutationSchema = z.strictObject({ record: stockTransferSchema, audit_event_id: identity });
export type WarehouseInput = z.infer<typeof warehouseInputSchema>;
export type Warehouse = z.infer<typeof warehouseSchema>;
export type WarehouseDirectory = z.infer<typeof warehouseDirectorySchema>;
export type WarehouseMutation = z.infer<typeof warehouseMutationSchema>;
export type InventoryDirectoryQuery = z.infer<typeof inventoryDirectoryQuerySchema>;
export type StockTransferInput = z.infer<typeof stockTransferInputSchema>;
export type StockTransfer = z.infer<typeof stockTransferSchema>;
export type StockTransferDirectory = z.infer<typeof stockTransferDirectorySchema>;
export type StockTransferMutation = z.infer<typeof stockTransferMutationSchema>;
