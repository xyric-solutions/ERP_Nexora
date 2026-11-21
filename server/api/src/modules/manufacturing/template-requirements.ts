import type { PoolClient } from "pg";
import {
  decimal,
  decimalText,
  divideRounded,
  parseQuantity,
  scaleQuantity,
  manufacturingRecipeSchema,
  requirementsPreviewSchema,
  type Bom,
  type BomInput,
  type ManufacturingRecipe,
  type ManufacturingOrderInput,
} from "@nexora/contracts";
import { productUnitChoices, productUnitSnapshot } from "../inventory/units-repository.js";
import { resolveCompanyBaseCurrency } from "../finance/currencies/company-authority.js";
import { operationalFailure as fail } from "../shared/operational-transaction.js";
export async function warehouseNames(c: PoolClient, t: string, company: string, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, string>();
  const rows = (
    await c.query<{ id: string; name: string }>(
      "select id,name from inventory_warehouse where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and status='active'",
      [t, company, unique],
    )
  ).rows;
  if (rows.length !== unique.length) fail("Choose active warehouses from this company.", "BOM_WAREHOUSE_INVALID");
  return new Map(rows.map((row) => [row.id, row.name]));
}
async function currency(c: PoolClient, t: string, company: string, code?: string) {
  const selected = code || (await resolveCompanyBaseCurrency(c, t, company, false)).code;
  const row = (
    await c.query<{ code: string; decimal_places: number }>(
      "select cc.currency_code code,c.decimal_places from company_currency cc join currency c on(c.tenant_id,c.code)=(cc.tenant_id,cc.currency_code) where cc.tenant_id=$1 and cc.company_id=$2 and cc.currency_code=$3 and cc.status='active' and c.status='active'",
      [t, company, selected],
    )
  ).rows[0];
  if (!row) fail("Choose an active company estimate currency.", "BOM_CURRENCY_INVALID");
  return row;
}
export async function normalizeBom(c: PoolClient, t: string, company: string, input: BomInput) {
  await warehouseNames(c, t, company, [input.warehouse_id, ...input.lines.map((l) => l.warehouse_id)]);
  const units = await productUnitChoices(c, t, company, [input.product_id, ...input.lines.map((l) => l.product_id)]),
    output = productUnitSnapshot(units.get(input.product_id)!, input.output_quantity, input.output_unit_id),
    money = await currency(c, t, company, input.currency);
  const rows = (
    await c.query<{
      id: string;
      name: string;
      code: string;
      category: string;
      details: { track_inventory?: boolean };
      type: string;
    }>(
      "select id,name,code,category,details,type from inventory_product where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and status='active'",
      [t, company, input.lines.map((l) => l.product_id)],
    )
  ).rows;
  if (rows.some((p) => p.type !== "goods" || p.details.track_inventory !== true))
    fail("Raw materials must be inventory-tracked goods. Use Non-Stock for other inputs.", "BOM_COMPONENT_INELIGIBLE");
  const lines = input.lines.map((line) => {
    const snapshot = productUnitSnapshot(units.get(line.product_id)!, line.quantity, line.unit_id);
    return {
      ...line,
      quantity: snapshot.base_quantity,
      unit: snapshot.base_unit_name,
      unit_snapshot: snapshot,
      warehouse_id: line.warehouse_id ?? null,
      description: line.description ?? "",
    };
  });
  const charges = [];
  for (const charge of input.charges ?? []) {
    let product_name: string | null = null,
      account_name: string | null = null;
    if (charge.kind === "non_stock") {
      const p = (
        await c.query(
          "select name,type,details from inventory_product where tenant_id=$1 and company_id=$2 and id=$3 and status='active'",
          [t, company, charge.product_id ?? null],
        )
      ).rows[0];
      if (!p || (p.type !== "service" && p.details.track_inventory !== false))
        fail("Select an active non-stock product or service.", "BOM_NON_STOCK_INVALID");
      product_name = p.name;
    } else if (charge.product_id) fail("Expense rows use an expense account, not an inventory product.");
    if (charge.expense_account_id) {
      const a = (
        await c.query(
          "select code||' · '||name name from account where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and type='expense' and not is_header and not is_system_account and not managed_bank_nominal and not reconciliation_required",
          [t, company, charge.expense_account_id],
        )
      ).rows[0];
      if (!a) fail("Choose an active postable expense account.", "BOM_EXPENSE_INVALID");
      account_name = a.name;
    } else if (charge.kind === "expense")
      fail("Select the expense account for the estimated expense.", "BOM_EXPENSE_REQUIRED");
    const amount = decimalText(
      divideRounded(parseQuantity(charge.quantity) * decimal(charge.rate, 8), 10n ** BigInt(12 - money.decimal_places)),
      money.decimal_places,
    );
    charges.push({
      ...charge,
      product_id: charge.product_id ?? null,
      expense_account_id: charge.expense_account_id ?? null,
      product_name,
      account_name,
      amount,
    });
  }
  return {
    lines,
    output,
    details: {
      template_name: input.template_name?.trim() || null,
      warehouse_id: input.warehouse_id ?? null,
      currency: money.code,
      decimal_places: money.decimal_places,
      charges,
      output_snapshot: output,
    },
  };
}
export async function recipeFromBom(
  c: PoolClient,
  t: string,
  company: string,
  bom: Bom,
  quantity: string,
  warehouse?: string | null,
): Promise<ManufacturingRecipe> {
  const names = await warehouseNames(c, t, company, [
      warehouse,
      bom.warehouse_id,
      ...bom.lines.map((l) => l.warehouse_id),
    ]),
    money = await currency(c, t, company, bom.currency);
  const products = (
    await c.query<{ id: string; type: string; details: { manufacture_enabled?: boolean; track_inventory?: boolean } }>(
      "select id,type,details from inventory_product where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and status='active'",
      [t, company, [bom.product_id, ...bom.lines.map((l) => l.product_id)]],
    )
  ).rows;
  if (
    products.length !== bom.lines.length + 1 ||
    !products.find((p) => p.id === bom.product_id)?.details.manufacture_enabled ||
    products.some((p) => p.id !== bom.product_id && (p.type !== "goods" || p.details.track_inventory !== true))
  )
    fail("BOM products require current active manufacturing and inventory setup.", "BOM_COMPONENT_INELIGIBLE");
  const lines = bom.lines.map((line) => {
    const required = scaleQuantity(line.quantity, bom.output_quantity, quantity),
      warehouse_id = line.warehouse_id ?? warehouse ?? bom.warehouse_id ?? null;
    if (parseQuantity(required) === 0n)
      fail(
        "A material requirement rounds to zero. Increase the batch quantity or revise the BOM.",
        "BOM_QUANTITY_PRECISION",
      );
    return {
      product_id: line.product_id,
      product_code: line.product_code,
      product_name: line.product_name,
      category: line.category ?? "",
      description: line.description || line.product_name,
      bom_quantity: line.quantity,
      quantity: required,
      standard_quantity: required,
      remark: "",
      unit: line.unit,
      unit_snapshot: line.unit_snapshot ?? null,
      warehouse_id,
      warehouse_name: warehouse_id ? (names.get(warehouse_id) ?? null) : null,
    };
  });
  let total = 0n;
  const charges = (bom.charges ?? []).map((charge) => {
    const required = scaleQuantity(charge.quantity, bom.output_quantity, quantity),
      amount = divideRounded(
        parseQuantity(required) * decimal(charge.rate, 8),
        10n ** BigInt(12 - money.decimal_places),
      );
    total += amount;
    return { ...charge, quantity: required, amount: decimalText(amount, money.decimal_places) };
  });
  return manufacturingRecipeSchema.parse({
    bom_id: bom.id,
    bom_code: bom.code,
    bom_version: bom.version,
    template_name: bom.template_name || bom.product_name,
    product_id: bom.product_id,
    product_code: bom.product_code,
    product_name: bom.product_name,
    output_quantity: bom.output_quantity,
    quantity,
    unit: bom.unit,
    warehouse_id: warehouse ?? bom.warehouse_id ?? null,
    currency: money.code,
    decimal_places: money.decimal_places,
    lines,
    charges,
    estimated_charges: decimalText(total, money.decimal_places),
    notes: bom.notes,
  });
}
export function orderRecipe(recipe: ManufacturingRecipe, input: ManufacturingOrderInput): ManufacturingRecipe {
  if (!input.lines) return recipe;
  if (
    input.lines.length !== recipe.lines.length ||
    new Set(input.lines.map((l) => l.product_id)).size !== recipe.lines.length
  )
    fail("Keep each approved BOM material exactly once.", "ORDER_MATERIAL_MISMATCH");
  return manufacturingRecipeSchema.parse({
    ...recipe,
    lines: recipe.lines.map((line) => {
      const selected = input.lines!.find((l) => l.product_id === line.product_id);
      if (!selected) fail("Keep all BOM material references.");
      if (parseQuantity(selected.quantity) !== parseQuantity(line.standard_quantity) && !selected.remark.trim())
        fail("Explain each material quantity deviation.", "ORDER_VARIANCE_REASON_REQUIRED");
      return { ...line, quantity: selected.quantity, remark: selected.remark };
    }),
  });
}
export async function persistRecipeLines(
  c: PoolClient,
  t: string,
  company: string,
  entity: "plan" | "order",
  id: string,
  recipe: ManufacturingRecipe,
) {
  const table = entity === "plan" ? "manufacturing_plan_line" : "manufacturing_order_line",
    key = entity === "plan" ? "plan_id" : "order_id";
  await c.query(`delete from ${table} where tenant_id=$1 and company_id=$2 and ${key}=$3`, [t, company, id]);
  await c.query(
    entity === "plan"
      ? `insert into ${table}(tenant_id,company_id,${key},line_no,product_id,bom_quantity,required_quantity,unit) select $1,$2,$3,n::int,l->>'product_id',(l->>'bom_quantity')::numeric,(l->>'quantity')::numeric,l->>'unit' from jsonb_array_elements($4::jsonb) with ordinality x(l,n)`
      : `insert into ${table}(tenant_id,company_id,${key},line_no,product_id,standard_quantity,quantity,unit,remark) select $1,$2,$3,n::int,l->>'product_id',(l->>'standard_quantity')::numeric,(l->>'quantity')::numeric,l->>'unit',l->>'remark' from jsonb_array_elements($4::jsonb) with ordinality x(l,n)`,
    [t, company, id, JSON.stringify(recipe.lines)],
  );
}
export async function previewAvailability(
  c: PoolClient,
  t: string,
  company: string,
  recipe: ManufacturingRecipe,
  asOf?: string,
) {
  const date = asOf ?? (await c.query("select current_date::text as_of")).rows[0].as_of;
  const rows = (
    await c.query<{ product_id: string; warehouse_id: string; quantity: string }>(
      "select product_id,warehouse_id,sum(quantity)::text quantity from inventory_stock_entry where tenant_id=$1 and company_id=$2 and product_id=any($3::text[]) and movement_date<=$4::date group by product_id,warehouse_id",
      [t, company, recipe.lines.map((l) => l.product_id), date],
    )
  ).rows;
  return requirementsPreviewSchema.parse({
    recipe,
    availability: recipe.lines.map((line) => {
      const on_hand = line.warehouse_id
          ? (rows.find((r) => r.product_id === line.product_id && r.warehouse_id === line.warehouse_id)?.quantity ??
            "0")
          : null,
        shortage =
          on_hand === null
            ? null
            : decimalText(
                parseQuantity(line.quantity) > decimal(on_hand, 4, true)
                  ? parseQuantity(line.quantity) - decimal(on_hand, 4, true)
                  : 0n,
                4,
              );
      return {
        product_id: line.product_id,
        warehouse_id: line.warehouse_id,
        warehouse_name: line.warehouse_name,
        on_hand,
        required_quantity: line.quantity,
        shortage,
        as_of: date,
      };
    }),
  });
}
