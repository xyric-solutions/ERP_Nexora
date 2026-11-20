import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  unitSchema,
  unitInputSchema,
  unitMutationSchema,
  packagingRuleSchema,
  convertUnitQuantity,
  unitRatio,
  reduceUnitRatio,
  type MeasurementUnit,
  type UnitInput,
  type UnitQuery,
  type UnitConversionInput,
  type ProductUnits,
  type UnitSnapshot,
} from "@nexora/contracts";
import type { InventoryContext } from "./source-repository.js";
import { InventoryError } from "./errors.js";

function fail(message: string, code = "UNIT_VALIDATION_FAILED", status = 409): never {
  throw new InventoryError(status, code, message);
}
function checkedQuantity(quantity: string, ratio: { numerator: string; denominator: string }, precision: number) {
  try {
    return convertUnitQuantity(quantity, ratio, precision);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Invalid unit conversion.");
  }
}
export type UnitTransaction = <T>(
  context: InventoryContext,
  company: string,
  write: boolean,
  work: (client: PoolClient) => Promise<T>,
  permission?: string,
) => Promise<T>;
type UnitAudit = (
  client: PoolClient,
  context: InventoryContext,
  id: string,
  company: string,
  before: unknown,
  after: unknown,
  action: string,
  correlation: string,
) => Promise<string>;
const projection =
  "id,company_id,code,name,symbol,category,numerator::text,denominator::text,precision,status,(standard_key is not null) as standard,row_version as version";
export async function companyUnits(
  client: PoolClient,
  tenant: string,
  company: string,
  lock = true,
): Promise<MeasurementUnit[]> {
  const result = await client.query(
    `select ${projection} from inventory_unit where tenant_id=$1 and company_id=$2 order by code limit 1001 ${lock ? "for share" : ""}`,
    [tenant, company],
  );
  if (result.rows.length > 1000) fail("This company exceeds the supported 1,000 unit catalogue limit.");
  return result.rows.map((row) => unitSchema.parse(row));
}
export async function productUnitChoices(
  client: PoolClient,
  tenant: string,
  company: string,
  productIds: string[],
  allowInactiveProduct = false,
  lock = true,
) {
  const units = await companyUnits(client, tenant, company, lock);
  const products = await client.query<{
    id: string;
    details: { unit: string; unit_id?: string; packaging_rules?: unknown[] };
  }>(
    `select id,details from inventory_product where tenant_id=$1 and company_id=$2 and id=any($3::text[]) ${allowInactiveProduct ? "" : "and status='active'"} ${lock ? "for share" : ""}`,
    [tenant, company, productIds],
  );
  if (products.rows.length !== productIds.length)
    fail("A selected product is inactive or unavailable in this company.");
  const result = new Map<string, ProductUnits>();
  for (const product of products.rows) {
    const base = units.find((u) => u.name === product.details.unit);
    if (!base) fail("The product's saved unit is unavailable. Contact your administrator.");
    const rules = (product.details.packaging_rules ?? []).map((r) => packagingRuleSchema.parse(r));
    const items: ProductUnits["items"] = [{ unit: base, numerator: "1", denominator: "1" }];
    for (const unit of units) {
      if (unit.id === base.id || unit.status !== "active") continue;
      if (unit.category === base.category && !["packaging", "legacy_day"].includes(unit.category))
        items.push({ unit, ...unitRatio(unit, base) });
      else {
        const rule = rules.find((r) => r.unit_id === unit.id);
        if (rule && (unit.category === "packaging" || (base.category === "legacy_day" && unit.category === "time"))) {
          const [whole, fraction = ""] = rule.quantity.split(".");
          items.push({ unit, ...reduceUnitRatio(BigInt(whole! + fraction), 10n ** BigInt(fraction.length)) });
        }
      }
    }
    result.set(product.id, { base, items });
  }
  return result;
}
export function productUnitSnapshot(choices: ProductUnits, quantity: string, id?: string): UnitSnapshot {
  const choice = choices.items.find((c) => c.unit.id === (id ?? choices.base.id));
  if (!choice || choice.unit.status !== "active" || choices.base.status !== "active")
    fail("Choose an active compatible product unit.");
  const entered = checkedQuantity(quantity, { numerator: "1", denominator: "1" }, choice.unit.precision);
  if (!entered.exact) fail(`This unit allows ${choice.unit.precision} decimal places.`);
  const base = checkedQuantity(quantity, choice, Math.min(4, choices.base.precision));
  if (!base.exact || !/[1-9]/.test(base.quantity))
    fail(
      "The converted base quantity must be positive and fit the base unit precision (at most four decimals). Choose a larger quantity or another unit.",
    );
  return {
    unit_id: choice.unit.id,
    unit_name: choice.unit.name,
    base_unit_id: choices.base.id,
    base_unit_name: choices.base.name,
    entered_quantity: quantity,
    base_quantity: base.quantity,
    numerator: choice.numerator,
    denominator: choice.denominator,
    unit_precision: choice.unit.precision,
    base_precision: choices.base.precision,
  };
}

export class SourceUnitRepository {
  constructor(
    private readonly transaction: UnitTransaction,
    private readonly audit: UnitAudit,
  ) {}
  list(context: InventoryContext, query: UnitQuery) {
    return this.transaction(context, query.company_id, false, async (client) => {
      const result = await client.query(
        `select ${projection} from inventory_unit where tenant_id=$1 and company_id=$2
       and ($3='' or name ilike $3 escape '\\' or symbol ilike $3 escape '\\' or code ilike $3 escape '\\')
       and ($4::text is null or category=$4) and ($5::text is null or status=$5) and ($6::text is null or code>$6) order by code limit $7`,
        [
          context.tenantId,
          query.company_id,
          query.search ? `%${query.search.replace(/[\\%_]/g, "\\$&")}%` : "",
          query.category ?? null,
          query.status ?? null,
          query.after ?? null,
          query.limit + 1,
        ],
      );
      const items = result.rows.slice(0, query.limit).map((r) => unitSchema.parse(r));
      return { items, next_cursor: result.rows.length > query.limit ? items.at(-1)!.code : null };
    });
  }
  get(context: InventoryContext, company: string, id: string) {
    return this.transaction(context, company, false, async (client) => {
      const result = await client.query(
        `select ${projection} from inventory_unit where tenant_id=$1 and company_id=$2 and id=$3`,
        [context.tenantId, company, id],
      );
      if (!result.rowCount) fail("Unit not found.", "UNIT_NOT_FOUND", 404);
      return unitSchema.parse(result.rows[0]);
    });
  }
  choices(
    context: InventoryContext,
    company: string,
    product: string,
    surface: "products" | "purchases" | "transfers" = "products",
  ) {
    const permission =
      surface === "purchases"
        ? "procurement.document.read"
        : surface === "transfers"
          ? "inventory.stock.read"
          : "inventory.item.read";
    return this.transaction(
      context,
      company,
      false,
      async (client) => (await productUnitChoices(client, context.tenantId, company, [product])).get(product)!,
      permission,
    );
  }
  convert(context: InventoryContext, input: UnitConversionInput) {
    return this.transaction(context, input.company_id, false, async (client) => {
      const units = await companyUnits(client, context.tenantId, input.company_id);
      const from = units.find((u) => u.id === input.from_id && u.status === "active"),
        to = units.find((u) => u.id === input.to_id && u.status === "active");
      if (!from || !to) fail("Choose active units from this company.");
      let ratio;
      if (from.id === to.id) ratio = { numerator: "1", denominator: "1" };
      else if (input.product_id) {
        const choices = (await productUnitChoices(client, context.tenantId, input.company_id, [input.product_id])).get(
          input.product_id,
        )!;
        const a = choices.items.find((c) => c.unit.id === from.id),
          b = choices.items.find((c) => c.unit.id === to.id);
        if (!a || !b) fail("These units do not have a conversion for this product.");
        ratio = reduceUnitRatio(
          BigInt(a.numerator) * BigInt(b.denominator),
          BigInt(a.denominator) * BigInt(b.numerator),
        );
      } else {
        try {
          ratio = unitRatio(from, to);
        } catch {
          fail("Choose units in the same measurement category. Packaging needs a product content rule.");
        }
      }
      try {
        return { ...convertUnitQuantity(input.quantity, ratio), from, to };
      } catch (error) {
        fail(error instanceof Error ? error.message : "Invalid conversion.");
      }
    });
  }
  save(context: InventoryContext, id: string | null, input: UnitInput, key: string, correlation: string) {
    const parsed = unitInputSchema.parse(input);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      fail("Use a valid idempotency key.", "INVALID_IDEMPOTENCY_KEY", 400);
    if (!!id !== !!parsed.expected_version)
      fail("Updates require the current unit version.", "UNIT_VERSION_REQUIRED", 400);
    return this.transaction(context, parsed.company_id, true, async (client) => {
      const fingerprint = createHash("sha256")
        .update(JSON.stringify({ id, input: parsed }))
        .digest("hex");
      const replay = await client.query<{ request_sha256: string; result: unknown }>(
        "select request_sha256,result from inventory_unit_change where tenant_id=$1 and actor_id=$2 and idempotency_key=$3",
        [context.tenantId, context.actor.userId, key],
      );
      if (replay.rowCount) {
        if (replay.rows[0]!.request_sha256 !== fingerprint)
          fail("This request key was already used for different unit data.", "IDEMPOTENCY_CONFLICT");
        return unitMutationSchema.parse(replay.rows[0]!.result);
      }
      const rows = await companyUnits(client, context.tenantId, parsed.company_id),
        before = id ? rows.find((u) => u.id === id) : null;
      if (id && !before) fail("Unit not found.", "UNIT_NOT_FOUND", 404);
      if (before && before.version !== parsed.expected_version)
        fail("The unit changed. Reload before saving.", "UNIT_VERSION_CONFLICT");
      if (
        before &&
        ["name", "symbol", "category", "numerator", "denominator", "precision"].some(
          (k) => Reflect.get(before, k) !== Reflect.get(parsed, k),
        )
      )
        fail("Unit definitions are fixed. Create a replacement unit to change its meaning.");
      if (
        !before &&
        (parsed.category === "legacy_day" ||
          (parsed.category === "packaging" && (parsed.numerator !== "1" || parsed.denominator !== "1")))
      )
        fail("Custom packaging uses a product content rule; legacy service days cannot be created.");
      if (!before && rows.length >= 1000) fail("This company already has 1,000 units.");
      if (
        rows.some(
          (u) =>
            u.id !== id &&
            (u.name.toLowerCase() === parsed.name.toLowerCase() ||
              u.symbol.toLowerCase() === parsed.symbol.toLowerCase()),
        )
      )
        fail("A unit already uses this name or symbol.", "UNIT_DUPLICATE");
      const recordId = id ?? `unit-${randomUUID()}`;
      if (before)
        await client.query(
          "update inventory_unit set status=$4,row_version=row_version+1,updated_by=$5,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
          [context.tenantId, parsed.company_id, recordId, parsed.status, context.actor.userId],
        );
      else {
        const next = rows.reduce((n, u) => Math.max(n, Number(u.code.replace(/^UOM-/, "")) || 0), 0) + 1;
        await client.query(
          "insert into inventory_unit(tenant_id,company_id,id,code,name,symbol,category,numerator,denominator,precision,status,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            context.tenantId,
            parsed.company_id,
            recordId,
            `UOM-${String(next).padStart(3, "0")}`,
            parsed.name,
            parsed.symbol,
            parsed.category,
            parsed.numerator,
            parsed.denominator,
            parsed.precision,
            parsed.status,
            context.actor.userId,
          ],
        );
      }
      const record = unitSchema.parse(
        (
          await client.query(
            `select ${projection} from inventory_unit where tenant_id=$1 and company_id=$2 and id=$3`,
            [context.tenantId, parsed.company_id, recordId],
          )
        ).rows[0],
      );
      const auditId = await this.audit(
        client,
        context,
        recordId,
        parsed.company_id,
        before,
        record,
        before ? "saved" : "created",
        correlation,
      );
      const result = { record, audit_event_id: auditId };
      await client.query(
        "insert into inventory_unit_change(tenant_id,company_id,id,unit_id,record_version,actor_id,audit_event_id,idempotency_key,request_sha256,snapshot,result) select $1,$2,$3,$4,$5,$6,$7,$8,$9,to_jsonb(u),$10::jsonb from inventory_unit u where tenant_id=$1 and company_id=$2 and id=$4",
        [
          context.tenantId,
          parsed.company_id,
          randomUUID(),
          recordId,
          record.version,
          context.actor.userId,
          auditId,
          key,
          fingerprint,
          JSON.stringify(result),
        ],
      );
      return result;
    });
  }
}
