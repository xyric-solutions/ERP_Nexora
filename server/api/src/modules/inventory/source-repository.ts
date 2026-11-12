import { createHash, randomUUID } from "node:crypto";
import {
  warehouseInputSchema,
  warehouseSchema,
  warehouseMutationSchema,
  stockTransferInputSchema,
  stockTransferSchema,
  stockTransferMutationSchema,
  type WarehouseInput,
  type Warehouse,
  type StockTransferInput,
  type StockTransfer,
  type InventoryDirectoryQuery,
  type InventorySurface,
  productInputSchema,
  productSchema,
  productMutationSchema,
  productUnits,
  type ProductInput,
  type ProductQuery,
  type ProductLookupQuery,
  type Product,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";
import type { ReferenceMasterContext } from "../master-data/source-repository.js";
import { companyAuthoritySql } from "../security/company-authority.js";

export type InventoryContext = ReferenceMasterContext;
export class InventoryError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(message: string, code = "PRODUCT_VALIDATION_FAILED", status = 409): never {
  throw new InventoryError(status, code, message);
}
function hash(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, child]) => [k, canonical(child)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
function surfacePermission(surface: InventorySurface) {
  return surface === "warehouses"
    ? "inventory.bin.read"
    : surface === "transfers"
      ? "inventory.stock.read"
      : "inventory.item.read";
}
const projection = `p.details || jsonb_build_object('id',p.id,'company_id',p.company_id,'code',p.code,'name',p.name,'type',p.type,'status',p.status,'category',p.category,'reference',p.reference,'barcode',p.barcode,'currency',p.currency,'preferred_supplier_id',p.preferred_supplier_id,'stock_account_id',p.stock_account_id,'income_account_id',p.income_account_id,'expense_account_id',p.expense_account_id,'version',p.row_version,'created_at',p.created_at::text,'updated_at',p.updated_at::text,'on_hand_quantity',null,'preferred_supplier_name',s.name,'stock_account_name',stock.code||' · '||stock.name,'income_account_name',income.code||' · '||income.name,'expense_account_name',expense.code||' · '||expense.name,'location_id',p.location_id,'default_warehouse_id',p.default_warehouse_id,'location_name',location.name,'default_warehouse_name',warehouse.name) as record`;
const joins = `from inventory_product p
 left join procurement_supplier s on s.tenant_id=p.tenant_id and s.company_id=p.company_id and s.id=p.preferred_supplier_id
 left join erp_location location on location.tenant_id=p.tenant_id and location.company_id=p.company_id and location.id=p.location_id
 left join inventory_warehouse warehouse on warehouse.tenant_id=p.tenant_id and warehouse.company_id=p.company_id and warehouse.id=p.default_warehouse_id
 left join account stock on stock.tenant_id=p.tenant_id and stock.company_id=p.company_id and stock.id=p.stock_account_id
 left join account income on income.tenant_id=p.tenant_id and income.company_id=p.company_id and income.id=p.income_account_id
 left join account expense on expense.tenant_id=p.tenant_id and expense.company_id=p.company_id and expense.id=p.expense_account_id`;
// Configuration only: these mappings grant no posting capability. Bank and reconciliation accounts are excluded.
const accountEligibility = `a.status='active' and not a.is_header and not a.managed_bank_nominal and not a.reconciliation_required
 and (not a.managed_general_nominal or exists(select 1 from finance_general_nominal n where n.tenant_id=a.tenant_id and n.nominal_id=a.id and n.state='active'))`;
const accountTypes: Record<"stock_account" | "income_account" | "expense_account", string> = {
  stock_account: "asset",
  income_account: "revenue",
  expense_account: "expense",
};

export class SourceInventoryRepository {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(
    context: InventoryContext,
    company: string | null,
    write: boolean,
    work: (client: PoolClient) => Promise<T>,
    permission = write ? "inventory.item.create" : "inventory.item.read",
  ): Promise<T> {
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission))
      fail("Your account does not have the required Inventory permission.", "PERMISSION_DENIED", 403);
    if (write && (context.realActorId || context.impersonationRequestId))
      fail("Inventory changes are disabled during impersonation.", "IMPERSONATION_RESTRICTED", 403);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
        `nexora:security:admin:${context.tenantId}`,
      ]);
      const access = await client.query(companyAuthoritySql, [
        context.tenantId,
        context.actor.userId,
        company,
        permission,
      ]);
      if (company && !access.rowCount)
        fail("Inventory access is not available for this company.", "COMPANY_ACCESS_DENIED", 403);
      if (write)
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `inventory:${context.tenantId}:${company}`,
        ]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error && typeof error === "object" && "code" in error) {
        if (["42P01", "42703"].includes(String(error.code)))
          fail(
            "The Inventory database migration is required. Contact your administrator.",
            "INVENTORY_UNAVAILABLE",
            503,
          );
        if (["23505"].includes(String(error.code)))
          fail(
            "This product barcode or request key is already used. Refresh and check the existing product.",
            "PRODUCT_DUPLICATE",
          );
        if (["23503", "23514", "40001", "40P01"].includes(String(error.code)))
          fail(
            "Product data changed or its audit evidence is incomplete. Refresh and retry.",
            "PRODUCT_INTEGRITY_CONFLICT",
          );
      }
      throw error;
    } finally {
      client.release();
    }
  }
  companies(context: InventoryContext, surface: InventorySurface = "products") {
    const permission = surfacePermission(surface);
    return this.transaction(
      context,
      null,
      false,
      async (client) => {
        const result = await client.query<{ id: string; code: string; name: string }>(
          `${companyAuthoritySql} order by company.code,company.id limit 201`,
          [context.tenantId, context.actor.userId, null, permission],
        );
        if (result.rows.length > 200)
          fail("Narrow your company access before loading Products.", "COMPANY_DIRECTORY_LIMIT");
        return { items: result.rows };
      },
      permission,
    );
  }
  options(context: InventoryContext, company: string) {
    return this.transaction(context, company, false, async (client) => {
      const result = await client.query<{ code: string; name: string }>(
        "select c.code,c.name from company_currency cc join currency c on c.tenant_id=cc.tenant_id and c.code=cc.currency_code where cc.tenant_id=$1 and cc.company_id=$2 and cc.status='active' and c.status='active' and c.decimal_places=2 order by cc.is_base desc,c.code limit 100",
        [context.tenantId, company],
      );
      return { currencies: result.rows, units: [...productUnits], stock_mode: "opening_plan" as const };
    });
  }
  private cursor(cursor: string | undefined, scope: unknown): string | null {
    if (!cursor) return null;
    try {
      const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (
        !value ||
        typeof value !== "object" ||
        !("id" in value) ||
        typeof value.id !== "string" ||
        value.id.length > 128 ||
        !("scope" in value) ||
        value.scope !== hash(scope)
      )
        throw new Error("cursor");
      return value.id;
    } catch {
      return fail("The continuation does not match this company and filter.", "INVALID_CURSOR", 400);
    }
  }
  private continuation(id: string, scope: unknown) {
    return Buffer.from(JSON.stringify({ id, scope: hash(scope) })).toString("base64url");
  }
  list(context: InventoryContext, query: ProductQuery) {
    return this.transaction(context, query.company_id, false, async (client) => {
      const scope = { tenant: context.tenantId, ...query, cursor: undefined },
        after = this.cursor(query.cursor, scope);
      const result = await client.query<{ record: unknown }>(
        `select ${projection} ${joins} where p.tenant_id=$1 and p.company_id=$2
       and ($3::text is null or p.type=$3) and ($4::text is null or p.status=$4) and ($5::text is null or p.category=$5)
       and (p.name ilike $6 escape '\\' or p.code ilike $6 escape '\\' or p.barcode ilike $6 escape '\\' or p.reference ilike $6 escape '\\')
       and ($7::text is null or p.code>(select anchor.code from inventory_product anchor where anchor.tenant_id=$1 and anchor.company_id=$2 and anchor.id=$7)) order by p.code limit $8`,
        [
          context.tenantId,
          query.company_id,
          query.type ?? null,
          query.status ?? null,
          query.category ?? null,
          `%${query.search.replace(/[\\%_]/g, "\\$&")}%`,
          after,
          query.limit + 1,
        ],
      );
      const items = result.rows.slice(0, query.limit).map((r) => productSchema.parse(r.record));
      return {
        items,
        next_cursor: result.rows.length > query.limit ? this.continuation(items.at(-1)!.id, scope) : null,
      };
    });
  }
  private async load(client: PoolClient, tenant: string, company: string, id: string): Promise<Product> {
    const result = await client.query<{ record: unknown }>(
      `select ${projection} ${joins} where p.tenant_id=$1 and p.company_id=$2 and p.id=$3`,
      [tenant, company, id],
    );
    if (!result.rowCount) fail("The product was not found in this company.", "PRODUCT_NOT_FOUND", 404);
    return productSchema.parse(result.rows[0]!.record);
  }
  get(context: InventoryContext, company: string, id: string) {
    return this.transaction(context, company, false, (client) => this.load(client, context.tenantId, company, id));
  }
  lookups(context: InventoryContext, query: ProductLookupQuery) {
    const surface = query.surface ?? "products",
      permission = surfacePermission(surface);
    const allowed =
      surface === "warehouses"
        ? ["location"]
        : surface === "transfers"
          ? ["warehouse", "product"]
          : ["supplier", "stock_account", "income_account", "expense_account", "location", "warehouse"];
    if (!allowed.includes(query.kind))
      fail("This lookup is not available for this Inventory page.", "LOOKUP_PERMISSION_DENIED", 403);
    return this.transaction(
      context,
      query.company_id,
      false,
      async (client) => {
        const scope = { tenant: context.tenantId, ...query, cursor: undefined },
          after = this.cursor(query.cursor, scope),
          pattern = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
        let rows: { id: string; code: string; name: string; unit?: string }[];
        const args = [context.tenantId, query.company_id, pattern, after, query.limit + 1];
        if (query.kind === "supplier")
          rows = (
            await client.query(
              `select s.id,s.code,s.name from procurement_supplier s join party v on v.tenant_id=s.tenant_id and v.id=s.id and v.type='vendor' and v.status='active' and v.risk_status<>'blocked' where s.tenant_id=$1 and s.company_id=$2 and s.status='active' and s.risk_status<>'blocked' and (s.name ilike $3 escape '\\' or s.code ilike $3 escape '\\') and ($4::text is null or s.id>$4) order by s.id limit $5`,
              args,
            )
          ).rows;
        else if (query.kind === "location")
          rows = (
            await client.query(
              `select id,code,name from erp_location where tenant_id=$1 and company_id=$2 and status='active' and (name ilike $3 escape '\\' or code ilike $3 escape '\\') and ($4::text is null or id>$4) order by id limit $5`,
              args,
            )
          ).rows;
        else if (query.kind === "warehouse")
          rows = (
            await client.query(
              `select id,code,name from inventory_warehouse where tenant_id=$1 and company_id=$2 and status='active' and (name ilike $3 escape '\\' or code ilike $3 escape '\\') and ($4::text is null or id>$4) order by id limit $5`,
              args,
            )
          ).rows;
        else if (query.kind === "product")
          rows = (
            await client.query(
              `select id,code,name,details->>'unit' as unit from inventory_product where tenant_id=$1 and company_id=$2 and status='active' and type='goods' and details->>'track_inventory'='true' and (name ilike $3 escape '\\' or code ilike $3 escape '\\') and ($4::text is null or id>$4) order by id limit $5`,
              args,
            )
          ).rows;
        else
          rows = (
            await client.query(
              `select a.id,a.code,a.name from account a where a.tenant_id=$1 and a.company_id=$2 and ${accountEligibility} and a.type=$6 and (a.name ilike $3 escape '\\' or a.code ilike $3 escape '\\') and ($4::text is null or a.id>$4) order by a.id limit $5`,
              [...args, accountTypes[query.kind]],
            )
          ).rows;
        const items = rows.slice(0, query.limit);
        return { items, next_cursor: rows.length > query.limit ? this.continuation(items.at(-1)!.id, scope) : null };
      },
      permission,
    );
  }
  private async validateReferences(client: PoolClient, tenant: string, input: ProductInput) {
    await this.validateLocation(client, tenant, input.company_id, input.location_id);
    if (input.default_warehouse_id) {
      const warehouse = await client.query(
        "select 1 from inventory_warehouse where tenant_id=$1 and company_id=$2 and id=$3 and status='active' for share",
        [tenant, input.company_id, input.default_warehouse_id],
      );
      if (!warehouse.rowCount) fail("Choose an active default warehouse from this company.");
    }
    const currency = await client.query(
      "select 1 from company_currency cc join currency c on c.tenant_id=cc.tenant_id and c.code=cc.currency_code where cc.tenant_id=$1 and cc.company_id=$2 and cc.currency_code=$3 and cc.status='active' and c.status='active' and c.decimal_places=2 for share of cc,c",
      [tenant, input.company_id, input.currency],
    );
    if (!currency.rowCount) fail("Select an active two-decimal currency for this company.");
    if (input.preferred_supplier_id) {
      const found = await client.query(
        "select 1 from procurement_supplier s join party p on p.tenant_id=s.tenant_id and p.id=s.id where s.tenant_id=$1 and s.company_id=$2 and s.id=$3 and s.status='active' and s.risk_status<>'blocked' and p.type='vendor' and p.status='active' and p.risk_status<>'blocked' for share of s,p",
        [tenant, input.company_id, input.preferred_supplier_id],
      );
      if (!found.rowCount) fail("Choose an active, unblocked supplier from this company.");
    }
    for (const kind of ["stock_account", "income_account", "expense_account"] as const) {
      const id = input[`${kind}_id`];
      if (!id) continue;
      const found = await client.query(
        `select 1 from account a where a.tenant_id=$1 and a.company_id=$2 and a.id=$3 and a.type=$4 and ${accountEligibility} for share of a`,
        [tenant, input.company_id, id, accountTypes[kind]],
      );
      if (!found.rowCount)
        fail(
          `Choose an active ${kind.replaceAll("_", " ")} from this company. Bank, header and reconciliation accounts cannot be used.`,
        );
    }
  }
  save(context: InventoryContext, id: string | null, input: ProductInput, key: string, correlation: string) {
    const parsed = productInputSchema.parse(input);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      fail("Use a valid idempotency key.", "INVALID_IDEMPOTENCY_KEY", 400);
    if (!!id !== !!parsed.expected_version)
      fail("Updates require the current product version; new products must omit it.", "PRODUCT_VERSION_REQUIRED", 400);
    return this.transaction(context, parsed.company_id, true, async (client) => {
      const fingerprint = hash({ id, input: parsed }),
        replay = await client.query<{ request_sha256: string; result: unknown }>(
          "select request_sha256,result from inventory_product_change where tenant_id=$1 and actor_id=$2 and idempotency_key=$3",
          [context.tenantId, context.actor.userId, key],
        );
      if (replay.rowCount) {
        if (replay.rows[0]!.request_sha256 !== fingerprint)
          fail("This request key was already used for different product data.", "IDEMPOTENCY_CONFLICT");
        return productMutationSchema.parse(replay.rows[0]!.result);
      }
      const before = id ? await this.load(client, context.tenantId, parsed.company_id, id) : null;
      await this.validateReferences(client, context.tenantId, parsed);
      const {
        company_id,
        name,
        type,
        status,
        category,
        reference,
        barcode,
        currency,
        preferred_supplier_id,
        stock_account_id,
        income_account_id,
        expense_account_id,
        location_id,
        default_warehouse_id,
        expected_version,
        ...details
      } = parsed;
      if (before && before.version !== expected_version)
        fail("The product changed. Reload before saving.", "PRODUCT_VERSION_CONFLICT");
      const productId = id ?? `product-${randomUUID()}`;
      if (before) {
        await client.query(
          `update inventory_product set name=$4,type=$5,status=$6,category=$7,reference=$8,barcode=$9,currency=$10,preferred_supplier_id=$11,stock_account_id=$12,income_account_id=$13,expense_account_id=$14,details=$15,row_version=row_version+1,updated_by=$16,location_id=$17,default_warehouse_id=$18,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
          [
            context.tenantId,
            company_id,
            productId,
            name,
            type,
            status,
            category,
            reference,
            barcode,
            currency,
            preferred_supplier_id,
            stock_account_id,
            income_account_id,
            expense_account_id,
            JSON.stringify(details),
            context.actor.userId,
            location_id,
            default_warehouse_id,
          ],
        );
      } else {
        const next = await client.query<{ value: string }>(
          "select (coalesce(max(substring(code from '^PRD-([0-9]+)$')::bigint),0)+1)::text as value from inventory_product where tenant_id=$1 and company_id=$2",
          [context.tenantId, company_id],
        );
        const code = `PRD-${next.rows[0]!.value.padStart(3, "0")}`;
        await client.query(
          `insert into inventory_product(tenant_id,company_id,id,code,name,type,status,category,reference,barcode,currency,preferred_supplier_id,stock_account_id,income_account_id,expense_account_id,details,created_by,updated_by,location_id,default_warehouse_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,$18,$19)`,
          [
            context.tenantId,
            company_id,
            productId,
            code,
            name,
            type,
            status,
            category,
            reference,
            barcode,
            currency,
            preferred_supplier_id,
            stock_account_id,
            income_account_id,
            expense_account_id,
            JSON.stringify(details),
            context.actor.userId,
            location_id,
            default_warehouse_id,
          ],
        );
      }
      const record = await this.load(client, context.tenantId, company_id, productId);
      const action = before ? "saved" : "created",
        auditId = await this.audit(
          client,
          context,
          "product",
          productId,
          company_id,
          before,
          record,
          action,
          correlation,
        );
      const result = { record, audit_event_id: auditId };
      await client.query(
        `insert into inventory_product_change(tenant_id,company_id,id,product_id,record_version,actor_id,action,audit_event_id,idempotency_key,request_sha256,snapshot,result) select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_jsonb(p),$11::jsonb from inventory_product p where p.tenant_id=$1 and p.company_id=$2 and p.id=$4`,
        [
          context.tenantId,
          company_id,
          randomUUID(),
          productId,
          record.version,
          context.actor.userId,
          action,
          auditId,
          key,
          fingerprint,
          JSON.stringify(result),
        ],
      );
      return result;
    });
  }

  private async validateLocation(client: PoolClient, tenant: string, company: string, id: string | null) {
    if (!id) return;
    const found = await client.query(
      "select 1 from erp_location where tenant_id=$1 and company_id=$2 and id=$3 and status='active' for share",
      [tenant, company, id],
    );
    if (!found.rowCount) fail("Choose an active location from this company.");
  }
  private async audit(
    client: PoolClient,
    context: InventoryContext,
    entity: "product" | "warehouse" | "transfer",
    id: string,
    company: string,
    before: unknown,
    after: unknown,
    action: string,
    correlation: string,
  ) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const prior = await client.query<{ sequence: string; event_hash: string }>(
      "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
      [context.tenantId],
    );
    const event = {
      id: `audit-${randomUUID()}`,
      tenant_id: context.tenantId,
      sequence: Number(prior.rows[0]?.sequence ?? 0) + 1,
      actor_id: context.actor.userId,
      correlation_id: correlation,
      action: `inventory.${entity}.${action}`,
      entity_type: `inventory_${entity}`,
      entity_id: id,
      before_hash: hash(before),
      after_hash: hash(after),
      source_reference: `company:${company}`,
      approval_reference: null,
      occurred_at: new Date().toISOString(),
      previous_event_hash: prior.rows[0]?.event_hash ?? hash({ genesis: context.tenantId }),
    };
    await client.query(
      "insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
      [...Object.values(event), hash(event)],
    );
    return event.id;
  }
  private async operationReplay(client: PoolClient, context: InventoryContext, key: string, fingerprint: string) {
    const result = await client.query<{ request_sha256: string; result: unknown }>(
      "select request_sha256,result from inventory_operation_change where tenant_id=$1 and actor_id=$2 and idempotency_key=$3",
      [context.tenantId, context.actor.userId, key],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.request_sha256 !== fingerprint)
      fail("This request key was already used for different Inventory data.", "IDEMPOTENCY_CONFLICT");
    return row.result;
  }
  private async operationEvidence(
    client: PoolClient,
    context: InventoryContext,
    entity: "warehouse" | "transfer",
    record: Warehouse | StockTransfer,
    before: unknown,
    key: string,
    fingerprint: string,
    correlation: string,
  ) {
    const action = before ? "saved" : "created",
      auditId = await this.audit(
        client,
        context,
        entity,
        record.id,
        record.company_id,
        before,
        record,
        action,
        correlation,
      );
    const result = { record, audit_event_id: auditId };
    await client.query(
      "insert into inventory_operation_change(tenant_id,company_id,id,entity_type,entity_id,record_version,actor_id,action,audit_event_id,idempotency_key,request_sha256,snapshot,result) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,inventory_operation_snapshot($4,$1,$2,$5),$12::jsonb)",
      [
        context.tenantId,
        record.company_id,
        randomUUID(),
        entity,
        record.id,
        record.version,
        context.actor.userId,
        action,
        auditId,
        key,
        fingerprint,
        JSON.stringify(result),
      ],
    );
    return auditId;
  }
  private validateMutation(id: string | null, version: number | undefined, key: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      fail("Use a valid idempotency key.", "INVALID_IDEMPOTENCY_KEY", 400);
    if (!!id !== !!version)
      fail("Updates require the current version; new records must omit it.", "INVENTORY_VERSION_REQUIRED", 400);
  }
  private async loadWarehouse(client: PoolClient, tenant: string, company: string, id: string): Promise<Warehouse> {
    const result = await client.query(
      `select ${warehouseProjection} from inventory_warehouse w left join erp_location l on l.tenant_id=w.tenant_id and l.company_id=w.company_id and l.id=w.location_id where w.tenant_id=$1 and w.company_id=$2 and w.id=$3`,
      [tenant, company, id],
    );
    if (!result.rows[0]) fail("The warehouse was not found in this company.", "WAREHOUSE_NOT_FOUND", 404);
    return warehouseSchema.parse(result.rows[0]);
  }
  getWarehouse(context: InventoryContext, company: string, id: string) {
    return this.transaction(
      context,
      company,
      false,
      (c) => this.loadWarehouse(c, context.tenantId, company, id),
      "inventory.bin.read",
    );
  }
  warehouses(context: InventoryContext, query: InventoryDirectoryQuery) {
    return this.transaction(
      context,
      query.company_id,
      false,
      async (client) => {
        const scope = { tenant: context.tenantId, entity: "warehouse", ...query, cursor: undefined },
          after = this.cursor(query.cursor, scope);
        const result = await client.query(
          `select ${warehouseProjection} from inventory_warehouse w left join erp_location l on l.tenant_id=w.tenant_id and l.company_id=w.company_id and l.id=w.location_id where w.tenant_id=$1 and w.company_id=$2 and ($3::text is null or w.status=$3) and (w.code ilike $4 escape '\\' or w.name ilike $4 escape '\\' or l.name ilike $4 escape '\\') and ($5::text is null or w.code>(select code from inventory_warehouse where tenant_id=$1 and company_id=$2 and id=$5)) order by w.code limit $6`,
          [
            context.tenantId,
            query.company_id,
            query.status ?? null,
            `%${query.search.replace(/[\\%_]/g, "\\$&")}%`,
            after,
            query.limit + 1,
          ],
        );
        const items = result.rows.slice(0, query.limit).map((row) => warehouseSchema.parse(row));
        return {
          items,
          next_cursor: result.rows.length > query.limit ? this.continuation(items.at(-1)!.id, scope) : null,
        };
      },
      "inventory.bin.read",
    );
  }
  saveWarehouse(context: InventoryContext, id: string | null, input: WarehouseInput, key: string, correlation: string) {
    const parsed = warehouseInputSchema.parse(input);
    this.validateMutation(id, parsed.expected_version, key);
    return this.transaction(
      context,
      parsed.company_id,
      true,
      async (client) => {
        const fingerprint = hash({ entity: "warehouse", id, input: parsed }),
          replay = await this.operationReplay(client, context, key, fingerprint);
        if (replay) return warehouseMutationSchema.parse(replay);
        const before = id ? await this.loadWarehouse(client, context.tenantId, parsed.company_id, id) : null;
        if (before && before.version !== parsed.expected_version)
          fail("The warehouse changed. Reload before saving.", "WAREHOUSE_VERSION_CONFLICT");
        await this.validateLocation(client, context.tenantId, parsed.company_id, parsed.location_id);
        const recordId = id ?? `warehouse-${randomUUID()}`;
        if (before) {
          await client.query(
            "update inventory_warehouse set name=$4,location_id=$5,address=$6,contact_name=$7,phone=$8,email=$9,notes=$10,status=$11,row_version=row_version+1,updated_by=$12,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
            [
              context.tenantId,
              parsed.company_id,
              recordId,
              parsed.name,
              parsed.location_id,
              parsed.address,
              parsed.contact_name,
              parsed.phone,
              parsed.email,
              parsed.notes,
              parsed.status,
              context.actor.userId,
            ],
          );
          await client.query(
            "update organization_unit set name=$3,status=$4,updated_at=clock_timestamp() where tenant_id=$1 and id=$2",
            [context.tenantId, recordId, parsed.name, parsed.status],
          );
        } else {
          // Organization-unit codes are tenant-wide, including HR-created and inactive warehouses.
          await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
            `inventory:warehouse-code:${context.tenantId}`,
          ]);
          const next = await client.query<{ value: string }>(
            "select (coalesce(max(substring(code from '^WH-([0-9]+)$')::bigint),0)+1)::text as value from organization_unit where tenant_id=$1",
            [context.tenantId],
          );
          const code = `WH-${next.rows[0]!.value.padStart(3, "0")}`;
          await client.query(
            "insert into organization_unit(tenant_id,id,parent_id,type,code,name,status) values($1,$2,$3,'warehouse',$4,$5,$6)",
            [context.tenantId, recordId, parsed.company_id, code, parsed.name, parsed.status],
          );
          await client.query(
            "insert into inventory_warehouse(tenant_id,company_id,id,code,name,location_id,address,contact_name,phone,email,notes,status,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)",
            [
              context.tenantId,
              parsed.company_id,
              recordId,
              code,
              parsed.name,
              parsed.location_id,
              parsed.address,
              parsed.contact_name,
              parsed.phone,
              parsed.email,
              parsed.notes,
              parsed.status,
              context.actor.userId,
            ],
          );
        }
        const record = await this.loadWarehouse(client, context.tenantId, parsed.company_id, recordId),
          auditId = await this.operationEvidence(
            client,
            context,
            "warehouse",
            record,
            before,
            key,
            fingerprint,
            correlation,
          );
        return { record, audit_event_id: auditId };
      },
      "inventory.bin.create",
    );
  }
  private async loadTransfer(client: PoolClient, tenant: string, company: string, id: string): Promise<StockTransfer> {
    const result = await client.query(
      `select ${transferProjection} from inventory_transfer t join inventory_warehouse f on f.tenant_id=t.tenant_id and f.id=t.from_warehouse_id join inventory_warehouse d on d.tenant_id=t.tenant_id and d.id=t.to_warehouse_id where t.tenant_id=$1 and t.company_id=$2 and t.id=$3`,
      [tenant, company, id],
    );
    if (!result.rows[0]) fail("The stock transfer was not found in this company.", "TRANSFER_NOT_FOUND", 404);
    return stockTransferSchema.parse(result.rows[0]);
  }
  getTransfer(context: InventoryContext, company: string, id: string) {
    return this.transaction(
      context,
      company,
      false,
      (c) => this.loadTransfer(c, context.tenantId, company, id),
      "inventory.stock.read",
    );
  }
  transfers(context: InventoryContext, query: InventoryDirectoryQuery) {
    return this.transaction(
      context,
      query.company_id,
      false,
      async (client) => {
        const scope = { tenant: context.tenantId, entity: "transfer", ...query, cursor: undefined },
          after = this.cursor(query.cursor, scope);
        const result = await client.query(
          `select ${transferProjection} from inventory_transfer t join inventory_warehouse f on f.tenant_id=t.tenant_id and f.id=t.from_warehouse_id join inventory_warehouse d on d.tenant_id=t.tenant_id and d.id=t.to_warehouse_id where t.tenant_id=$1 and t.company_id=$2 and (t.code ilike $3 escape '\\' or t.reference ilike $3 escape '\\' or f.name ilike $3 escape '\\' or d.name ilike $3 escape '\\') and ($4::text is null or t.code>(select code from inventory_transfer where tenant_id=$1 and company_id=$2 and id=$4)) order by t.code limit $5`,
          [context.tenantId, query.company_id, `%${query.search.replace(/[\\%_]/g, "\\$&")}%`, after, query.limit + 1],
        );
        const items = result.rows.slice(0, query.limit).map((row) => stockTransferSchema.parse(row));
        return {
          items,
          next_cursor: result.rows.length > query.limit ? this.continuation(items.at(-1)!.id, scope) : null,
        };
      },
      "inventory.stock.read",
    );
  }
  saveTransfer(
    context: InventoryContext,
    id: string | null,
    input: StockTransferInput,
    key: string,
    correlation: string,
  ) {
    const parsed = stockTransferInputSchema.parse(input);
    this.validateMutation(id, parsed.expected_version, key);
    return this.transaction(context, parsed.company_id, true, async (client) => {
      // Draft request creation grants no movement capability. Both existing Inventory capabilities must be currently scoped to this company.
      if (
        !context.actor.permissions.includes("inventory.stock.read") ||
        !(
          await client.query(companyAuthoritySql, [
            context.tenantId,
            context.actor.userId,
            parsed.company_id,
            "inventory.stock.read",
          ])
        ).rowCount
      )
        fail("Stock access is required to prepare a transfer.", "PERMISSION_DENIED", 403);
      const fingerprint = hash({ entity: "transfer", id, input: parsed }),
        replay = await this.operationReplay(client, context, key, fingerprint);
      if (replay) return stockTransferMutationSchema.parse(replay);
      const before = id ? await this.loadTransfer(client, context.tenantId, parsed.company_id, id) : null;
      if (before && before.version !== parsed.expected_version)
        fail("The stock transfer changed. Reload before saving.", "TRANSFER_VERSION_CONFLICT");
      const warehouses = await client.query(
        "select id from inventory_warehouse where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and status='active' order by id for share",
        [context.tenantId, parsed.company_id, [parsed.from_warehouse_id, parsed.to_warehouse_id]],
      );
      if (warehouses.rowCount !== 2) fail("Choose two different active warehouses from this company.");
      const products = await client.query<{ id: string; unit: string }>(
        "select id,details->>'unit' as unit from inventory_product where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and status='active' and type='goods' and details->>'track_inventory'='true' order by id for share",
        [context.tenantId, parsed.company_id, parsed.lines.map((l) => l.product_id)],
      );
      if (products.rowCount !== parsed.lines.length)
        fail("Every line must use a different active stock-tracked product from this company.");
      const recordId = id ?? `transfer-${randomUUID()}`;
      if (before) {
        await client.query(
          "update inventory_transfer set from_warehouse_id=$4,to_warehouse_id=$5,transfer_date=$6,reference=$7,notes=$8,row_version=row_version+1,updated_by=$9,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
          [
            context.tenantId,
            parsed.company_id,
            recordId,
            parsed.from_warehouse_id,
            parsed.to_warehouse_id,
            parsed.transfer_date,
            parsed.reference,
            parsed.notes,
            context.actor.userId,
          ],
        );
        await client.query(
          "delete from inventory_transfer_line where tenant_id=$1 and company_id=$2 and transfer_id=$3",
          [context.tenantId, parsed.company_id, recordId],
        );
      } else {
        const next = await client.query<{ value: string }>(
          "select (coalesce(max(substring(code from '^ST-([0-9]+)$')::bigint),0)+1)::text as value from inventory_transfer where tenant_id=$1 and company_id=$2",
          [context.tenantId, parsed.company_id],
        );
        const code = `ST-${next.rows[0]!.value.padStart(3, "0")}`;
        await client.query(
          "insert into inventory_transfer(tenant_id,company_id,id,code,from_warehouse_id,to_warehouse_id,transfer_date,reference,notes,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)",
          [
            context.tenantId,
            parsed.company_id,
            recordId,
            code,
            parsed.from_warehouse_id,
            parsed.to_warehouse_id,
            parsed.transfer_date,
            parsed.reference,
            parsed.notes,
            context.actor.userId,
          ],
        );
      }
      const units = new Map(products.rows.map((p) => [p.id, p.unit]));
      // One bounded insert avoids a round trip per line; the server supplies each product's saved unit.
      await client.query(
        "insert into inventory_transfer_line(tenant_id,company_id,transfer_id,line_no,product_id,quantity,unit) select $1,$2,$3,x.ordinality::int,x.value->>'product_id',(x.value->>'quantity')::numeric,x.value->>'unit' from jsonb_array_elements($4::jsonb) with ordinality as x(value,ordinality)",
        [
          context.tenantId,
          parsed.company_id,
          recordId,
          JSON.stringify(parsed.lines.map((l) => ({ ...l, unit: units.get(l.product_id) }))),
        ],
      );
      const record = await this.loadTransfer(client, context.tenantId, parsed.company_id, recordId),
        auditId = await this.operationEvidence(
          client,
          context,
          "transfer",
          record,
          before,
          key,
          fingerprint,
          correlation,
        );
      return { record, audit_event_id: auditId };
    });
  }
}

const warehouseProjection =
  "w.id,w.company_id,w.code,w.name,w.location_id,l.name as location_name,w.address,w.contact_name,w.phone,w.email,w.notes,w.status,w.row_version as version,w.created_at::text,w.updated_at::text";
const transferProjection = `t.id,t.company_id,t.code,t.from_warehouse_id,t.to_warehouse_id,to_char(t.transfer_date,'YYYY-MM-DD') as transfer_date,t.reference,t.notes,t.state,false as posted,t.row_version as version,f.name as from_warehouse_name,d.name as to_warehouse_name,t.created_at::text,t.updated_at::text,
 coalesce((select jsonb_agg(jsonb_build_object('product_id',l.product_id,'quantity',l.quantity::text,'product_code',p.code,'product_name',p.name,'unit',l.unit) order by l.line_no) from inventory_transfer_line l join inventory_product p on p.tenant_id=l.tenant_id and p.company_id=l.company_id and p.id=l.product_id where l.tenant_id=t.tenant_id and l.company_id=t.company_id and l.transfer_id=t.id),'[]'::jsonb) as lines`;
