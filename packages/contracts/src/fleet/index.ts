import { z } from "zod";

/*
 * Fleet (meeting 16 Nov 2026): vehicles with the tools kept in them, drivers taken from HR
 * employees, fuel entries with an automatic km-per-litre average, and maintenance entries.
 * Fleet owns the vehicle record until a live Assets register exists; lease installments stay
 * in Assets. Vendor purchases record the supplier and invoice reference with a billing status;
 * bill creation in Procurement/Finance is a later phase. No GL, stock or bank posting here.
 */
const identity = z.string().trim().min(1).max(128);
const text = (max: number) => z.string().trim().max(max).default("");
const date = z.iso.date();
const version = z.number().int().positive();
const directory = <T extends z.ZodType>(item: T) =>
  z.strictObject({ items: z.array(item), next_cursor: z.string().nullable() });
const decimal = (digits: number, places: number, label: string) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{1,${digits}}(\\.\\d{1,${places}})?$`),
      `Use up to ${digits} digits and ${places} decimal place${places === 1 ? "" : "s"} for ${label}.`,
    );
const odometer = decimal(11, 1, "the odometer");
const money = decimal(14, 2, "the amount");
const positive = (schema: z.ZodString, message: string) => schema.refine((value) => Number(value) > 0, message);

/* ---------------------------------------------------------------- Shared decimal maths */

/** Scales a non-negative decimal string to an integer number of `places` decimal units. */
export function scaleDecimal(value: string, places: number): bigint {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  return BigInt(whole || "0") * 10n ** BigInt(places) + BigInt((fraction + "0".repeat(places)).slice(0, places) || "0");
}

function formatScaled(value: bigint, places: number): string {
  const unit = 10n ** BigInt(places);
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(places, "0");
  return places === 0 ? whole.toString() : `${whole}.${fraction}`;
}

/** Integer division rounded half away from zero, matching PostgreSQL `round()` on numeric. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

/**
 * Fuel average agreed in the meeting: (current odometer − previous odometer) ÷ litres added,
 * in kilometres per litre, rounded to 2 decimals. Returns null when it cannot be calculated.
 */
export function computeKmPerLitre(previousOdometer: string, currentOdometer: string, litres: string): string | null {
  try {
    const distanceTenths = scaleDecimal(currentOdometer, 1) - scaleDecimal(previousOdometer, 1);
    const litresHundredths = scaleDecimal(litres, 2);
    if (distanceTenths <= 0n || litresHundredths <= 0n) return null;
    // km/L × 100 = (distance/10) / (litres/100) × 100 = distanceTenths × 1000 / litresHundredths
    return formatScaled(divideRounded(distanceTenths * 1000n, litresHundredths), 2);
  } catch {
    return null;
  }
}

/** Fuel amount = litres × rate, rounded to 2 decimals. */
export function computeFuelAmount(litres: string, rate: string): string | null {
  try {
    return formatScaled(divideRounded(scaleDecimal(litres, 2) * scaleDecimal(rate, 2), 100n), 2);
  } catch {
    return null;
  }
}

/** Maintenance total = labour + parts. */
export function computeMaintenanceTotal(labour: string, parts: string): string | null {
  try {
    return formatScaled(scaleDecimal(labour || "0", 2) + scaleDecimal(parts || "0", 2), 2);
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- Shared queries */

export const fleetCompaniesSchema = z.strictObject({
  items: z.array(z.strictObject({ id: identity, code: z.string(), name: z.string() })),
});
export type FleetCompanies = z.infer<typeof fleetCompaniesSchema>;

/** `vehicle`/`driver`: Fleet records. `employee`: HR employees not yet drivers. `supplier`: active suppliers. */
export const fleetLookupKindSchema = z.enum(["vehicle", "driver", "employee", "supplier"]);
export type FleetLookupKind = z.infer<typeof fleetLookupKindSchema>;
export const fleetLookupQuerySchema = z.strictObject({
  company_id: identity,
  kind: fleetLookupKindSchema,
  search: text(160),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type FleetLookupQuery = z.infer<typeof fleetLookupQuerySchema>;
export const fleetLookupItemSchema = z.strictObject({
  id: identity,
  code: z.string(),
  name: z.string(),
  detail: z.string(),
});
export const fleetLookupDirectorySchema = z.strictObject({ items: z.array(fleetLookupItemSchema) });
export type FleetLookupItem = z.infer<typeof fleetLookupItemSchema>;
export type FleetLookupDirectory = z.infer<typeof fleetLookupDirectorySchema>;

export const fleetDirectoryQuerySchema = z.strictObject({
  company_id: identity,
  search: text(160),
  vehicle_id: identity.optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type FleetDirectoryQuery = z.infer<typeof fleetDirectoryQuerySchema>;
export const fleetRecordQuerySchema = z.strictObject({ company_id: identity });

/* ---------------------------------------------------------------- Drivers */

export const fleetDriverStatusSchema = z.enum(["active", "inactive"]);
const driverFields = z.strictObject({
  company_id: identity,
  employee_id: identity,
  licence_number: z.string().trim().min(1, "Enter the licence number.").max(60),
  licence_class: z.string().trim().min(1, "Enter the licence class.").max(40),
  licence_expires_on: date,
  status: fleetDriverStatusSchema.default("active"),
  notes: text(2000),
  expected_version: version.optional(),
});
export const fleetDriverInputSchema = driverFields;
export const updateFleetDriverInputSchema = driverFields.extend({ expected_version: version });
export const fleetDriverSchema = z.strictObject({
  id: identity,
  company_id: identity,
  code: z.string(),
  employee_id: identity,
  employee_number: z.string(),
  employee_name: z.string(),
  employee_status: z.string(),
  designation: z.string().nullable(),
  /** Employment terms now live on the HR cost centre (HR149): payroll, stipend or accounts payable. */
  payment_route: z.string().nullable(),
  licence_number: z.string(),
  licence_class: z.string(),
  licence_expires_on: z.string(),
  status: fleetDriverStatusSchema,
  assigned_vehicle_id: identity.nullable(),
  assigned_vehicle_registration: z.string().nullable(),
  notes: z.string(),
  version,
  created_at: z.string(),
  updated_at: z.string(),
});
export const fleetDriverDirectorySchema = directory(fleetDriverSchema);
export const fleetDriverMutationSchema = z.strictObject({ record: fleetDriverSchema, audit_event_id: identity });
export type FleetDriverInput = z.input<typeof fleetDriverInputSchema>;
export type FleetDriver = z.infer<typeof fleetDriverSchema>;
export type FleetDriverDirectory = z.infer<typeof fleetDriverDirectorySchema>;
export type FleetDriverMutation = z.infer<typeof fleetDriverMutationSchema>;

/* ---------------------------------------------------------------- Vehicles */

export const fleetVehicleStatusSchema = z.enum(["active", "workshop", "retired"]);
export const fleetOwnershipSchema = z.enum(["owned", "leased"]);
export const fleetFuelTypeSchema = z.enum(["petrol", "diesel", "cng", "hybrid", "electric"]);
const vehicleFields = z.strictObject({
  company_id: identity,
  registration_no: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9 -]{0,19}$/, "Use letters, numbers, spaces or hyphens (up to 20)."),
  asset_number: text(40),
  make_model: z.string().trim().min(1, "Enter the make and model.").max(160),
  category: z.string().trim().min(1, "Enter the category.").max(80),
  ownership: fleetOwnershipSchema,
  fuel_type: fleetFuelTypeSchema,
  opening_odometer: odometer,
  status: fleetVehicleStatusSchema.default("active"),
  current_driver_id: identity.nullable().default(null),
  notes: text(2000),
  expected_version: version.optional(),
});
export const fleetVehicleInputSchema = vehicleFields;
export const updateFleetVehicleInputSchema = vehicleFields.extend({ expected_version: version });
export const fleetVehicleSchema = z.strictObject({
  id: identity,
  company_id: identity,
  code: z.string(),
  registration_no: z.string(),
  asset_number: z.string(),
  make_model: z.string(),
  category: z.string(),
  ownership: fleetOwnershipSchema,
  fuel_type: fleetFuelTypeSchema,
  opening_odometer: z.string(),
  /** Highest reading known: the latest fuel entry, or the opening reading. */
  current_odometer: z.string(),
  status: fleetVehicleStatusSchema,
  current_driver_id: identity.nullable(),
  current_driver_name: z.string().nullable(),
  tool_count: z.number().int().nonnegative(),
  average_km_per_litre: z.string().nullable(),
  notes: z.string(),
  version,
  created_at: z.string(),
  updated_at: z.string(),
});
export const fleetVehicleDirectorySchema = directory(fleetVehicleSchema);
export const fleetVehicleMutationSchema = z.strictObject({ record: fleetVehicleSchema, audit_event_id: identity });
export type FleetVehicleInput = z.input<typeof fleetVehicleInputSchema>;
export type FleetVehicle = z.infer<typeof fleetVehicleSchema>;
export type FleetVehicleDirectory = z.infer<typeof fleetVehicleDirectorySchema>;
export type FleetVehicleMutation = z.infer<typeof fleetVehicleMutationSchema>;

/* ---------------------------------------------------------------- Vehicle tools */

export const fleetToolConditionSchema = z.enum(["good", "damaged", "destroyed"]);
const toolFields = z.strictObject({
  company_id: identity,
  name: z.string().trim().min(1, "Enter the tool name.").max(120),
  quantity: z.number().int().min(1).max(999).default(1),
  condition: fleetToolConditionSchema.default("good"),
  /** Set when this tool replaces a damaged or destroyed one. */
  replaces_tool_id: identity.nullable().default(null),
  recorded_on: date,
  notes: text(1000),
  expected_version: version.optional(),
});
export const fleetToolInputSchema = toolFields;
export const updateFleetToolInputSchema = toolFields.extend({ expected_version: version });
export const fleetToolSchema = z.strictObject({
  id: identity,
  company_id: identity,
  vehicle_id: identity,
  name: z.string(),
  quantity: z.number().int(),
  condition: fleetToolConditionSchema,
  replaces_tool_id: identity.nullable(),
  replaces_tool_name: z.string().nullable(),
  replaced_by_tool_id: identity.nullable(),
  recorded_on: z.string(),
  notes: z.string(),
  version,
  created_at: z.string(),
  updated_at: z.string(),
});
export const fleetToolListSchema = z.strictObject({ items: z.array(fleetToolSchema) });
export const fleetToolMutationSchema = z.strictObject({ record: fleetToolSchema, audit_event_id: identity });
export type FleetToolInput = z.input<typeof fleetToolInputSchema>;
export type FleetTool = z.infer<typeof fleetToolSchema>;
export type FleetToolList = z.infer<typeof fleetToolListSchema>;
export type FleetToolMutation = z.infer<typeof fleetToolMutationSchema>;

/* ---------------------------------------------------------------- Billing */

/** `pending`: a supplier invoice is recorded but no bill exists yet (billing is a later phase). */
export const fleetBillingStatusSchema = z.enum(["not_applicable", "pending", "billed"]);
export type FleetBillingStatus = z.infer<typeof fleetBillingStatusSchema>;

/* ---------------------------------------------------------------- Fuel entries */

export const fleetFuelEntryInputSchema = z.strictObject({
  company_id: identity,
  vehicle_id: identity,
  driver_id: identity.nullable().default(null),
  entry_date: date,
  odometer,
  litres: positive(decimal(8, 2, "litres"), "Enter the litres added."),
  rate: money,
  supplier_id: identity.nullable().default(null),
  supplier_invoice_ref: text(80),
  notes: text(1000),
});
export const fleetFuelEntrySchema = z.strictObject({
  id: identity,
  company_id: identity,
  code: z.string(),
  vehicle_id: identity,
  vehicle_registration: z.string(),
  driver_id: identity.nullable(),
  driver_name: z.string().nullable(),
  entry_date: z.string(),
  previous_odometer: z.string(),
  odometer: z.string(),
  distance: z.string(),
  litres: z.string(),
  rate: z.string(),
  amount: z.string(),
  km_per_litre: z.string(),
  supplier_id: identity.nullable(),
  supplier_name: z.string().nullable(),
  supplier_invoice_ref: z.string(),
  billing_status: fleetBillingStatusSchema,
  notes: z.string(),
  version,
  created_at: z.string(),
});
export const fleetFuelDirectorySchema = directory(fleetFuelEntrySchema);
export const fleetFuelMutationSchema = z.strictObject({ record: fleetFuelEntrySchema, audit_event_id: identity });
export type FleetFuelEntryInput = z.input<typeof fleetFuelEntryInputSchema>;
export type FleetFuelEntry = z.infer<typeof fleetFuelEntrySchema>;
export type FleetFuelDirectory = z.infer<typeof fleetFuelDirectorySchema>;
export type FleetFuelMutation = z.infer<typeof fleetFuelMutationSchema>;

/* ---------------------------------------------------------------- Maintenance entries */

export const fleetMaintenanceInputSchema = z
  .strictObject({
    company_id: identity,
    vehicle_id: identity,
    entry_date: date,
    odometer: odometer.nullable().default(null),
    work_description: z.string().trim().min(3, "Describe the work performed.").max(2000),
    labour_amount: money.default("0"),
    parts_amount: money.default("0"),
    is_external: z.boolean().default(false),
    supplier_id: identity.nullable().default(null),
    supplier_invoice_ref: text(80),
  })
  .superRefine((value, ctx) => {
    if (scaleDecimal(value.labour_amount, 2) + scaleDecimal(value.parts_amount, 2) <= 0n)
      ctx.addIssue({ code: "custom", path: ["labour_amount"], message: "Enter the labour or parts amount." });
    if (value.is_external && !value.supplier_id)
      ctx.addIssue({ code: "custom", path: ["supplier_id"], message: "Select the vendor who did the work." });
    if (!value.is_external && value.supplier_id)
      ctx.addIssue({ code: "custom", path: ["supplier_id"], message: "In-house work has no vendor." });
  });
export const fleetMaintenanceEntrySchema = z.strictObject({
  id: identity,
  company_id: identity,
  code: z.string(),
  vehicle_id: identity,
  vehicle_registration: z.string(),
  entry_date: z.string(),
  odometer: z.string().nullable(),
  work_description: z.string(),
  labour_amount: z.string(),
  parts_amount: z.string(),
  total_amount: z.string(),
  is_external: z.boolean(),
  supplier_id: identity.nullable(),
  supplier_name: z.string().nullable(),
  supplier_invoice_ref: z.string(),
  billing_status: fleetBillingStatusSchema,
  version,
  created_at: z.string(),
});
export const fleetMaintenanceDirectorySchema = directory(fleetMaintenanceEntrySchema);
export const fleetMaintenanceMutationSchema = z.strictObject({
  record: fleetMaintenanceEntrySchema,
  audit_event_id: identity,
});
export type FleetMaintenanceInput = z.input<typeof fleetMaintenanceInputSchema>;
export type FleetMaintenanceEntry = z.infer<typeof fleetMaintenanceEntrySchema>;
export type FleetMaintenanceDirectory = z.infer<typeof fleetMaintenanceDirectorySchema>;
export type FleetMaintenanceMutation = z.infer<typeof fleetMaintenanceMutationSchema>;

/* ---------------------------------------------------------------- Fuel efficiency report */

export const fleetFuelEfficiencyQuerySchema = z.strictObject({
  company_id: identity,
  from: date.optional(),
  to: date.optional(),
});
export const fleetFuelEfficiencyRowSchema = z.strictObject({
  vehicle_id: identity,
  vehicle_registration: z.string(),
  make_model: z.string(),
  entries: z.number().int().nonnegative(),
  distance: z.string(),
  litres: z.string(),
  amount: z.string(),
  /** Total distance ÷ total litres over the period. */
  km_per_litre: z.string().nullable(),
});
export const fleetFuelEfficiencyReportSchema = z.strictObject({
  from: z.string().nullable(),
  to: z.string().nullable(),
  rows: z.array(fleetFuelEfficiencyRowSchema),
});
export type FleetFuelEfficiencyQuery = z.input<typeof fleetFuelEfficiencyQuerySchema>;
export type FleetFuelEfficiencyRow = z.infer<typeof fleetFuelEfficiencyRowSchema>;
export type FleetFuelEfficiencyReport = z.infer<typeof fleetFuelEfficiencyReportSchema>;
