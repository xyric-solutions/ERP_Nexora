import { createHash, randomUUID } from "node:crypto";
import {
  bomInputSchema,
  bomMutationSchema,
  bomSchema,
  convertProductionPlanInputSchema,
  convertProductionPlanResultSchema,
  manufacturingOrderActionSchema,
  manufacturingOrderInputSchema,
  manufacturingOrderMutationSchema,
  manufacturingOrderSchema,
  productionPlanInputSchema,
  productionPlanMutationSchema,
  productionPlanSchema,
  type Bom,
  type BomInput,
  type ConvertProductionPlanInput,
  type ManufacturingDirectoryQuery,
  type ManufacturingLookupQuery,
  type ManufacturingOrder,
  type ManufacturingOrderAction,
  type ManufacturingOrderInput,
  type ManufacturingSurface,
  type ProductionPlan,
  type ProductionPlanInput,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";
import type { ReferenceMasterContext } from "../master-data/source-repository.js";
import { companyAuthoritySql as companyAuthority } from "../security/company-authority.js";

/*
 * Manufacturing: Bill of Materials, Production Planning and Manufacturing Orders.
 * Simplified flow (13 Nov 2026): plan (finished product + quantity) -> convert -> draft
 * Manufacturing Order -> Confirm & Approve in one step. BOM/ingredient integration with
 * plans and orders is a later phase. Nothing here issues material, moves stock, costs
 * production or posts to the ledger.
 */
export type ManufacturingContext = ReferenceMasterContext;
export class ManufacturingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(message: string, code = "MANUFACTURING_VALIDATION_FAILED", status = 409): never {
  throw new ManufacturingError(status, code, message);
}
function digest(value: unknown): string {
  const canonical = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(canonical)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, canonical(child)]),
          )
        : item;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const readPermission: Record<ManufacturingSurface, string> = {
  boms: "manufacturing.bom.read",
  plans: "manufacturing.plan.read",
  orders: "manufacturing.order.read",
};
const APPROVE = "manufacturing.order.approve";
const unitSql = "coalesce(nullif(btrim(p.details->>'unit'),''),'Each')";
const like = (search: string) => `%${search.replace(/[\\%_]/g, "\\$&")}%`;

const bomProjection = `jsonb_build_object('id',b.id,'company_id',b.company_id,'code',b.code,'product_id',b.product_id,
 'product_code',fp.code,'product_name',fp.name,'output_quantity',trim_scale(b.output_quantity)::text,'unit',b.unit,'notes',b.notes,
 'version',b.row_version,'created_at',b.created_at::text,'updated_at',b.updated_at::text,
 'lines',coalesce((select jsonb_agg(jsonb_build_object('product_id',l.product_id,'product_code',c.code,'product_name',c.name,
   'quantity',trim_scale(l.quantity)::text,'unit',l.unit) order by l.line_no)
  from manufacturing_bom_line l join inventory_product c on c.tenant_id=l.tenant_id and c.company_id=l.company_id and c.id=l.product_id
  where l.tenant_id=b.tenant_id and l.company_id=b.company_id and l.bom_id=b.id),'[]'::jsonb)) as record`;
const bomJoins = `from manufacturing_bom b join inventory_product fp on fp.tenant_id=b.tenant_id and fp.company_id=b.company_id and fp.id=b.product_id`;

const planProjection = `jsonb_build_object('id',x.id,'company_id',x.company_id,'code',x.code,'product_id',x.product_id,
 'product_code',fp.code,'product_name',fp.name,'planned_quantity',trim_scale(x.planned_quantity)::text,'unit',x.unit,
 'notes',x.notes,'state',x.state,'manufacturing_order_id',x.manufacturing_order_id,'manufacturing_order_code',mo.code,
 'version',x.row_version,'created_at',x.created_at::text,'updated_at',x.updated_at::text) as record`;
const planJoins = `from manufacturing_plan x
 join inventory_product fp on fp.tenant_id=x.tenant_id and fp.company_id=x.company_id and fp.id=x.product_id
 left join manufacturing_order mo on mo.tenant_id=x.tenant_id and mo.company_id=x.company_id and mo.id=x.manufacturing_order_id`;

const orderProjection = `jsonb_build_object('id',x.id,'company_id',x.company_id,'code',x.code,'product_id',x.product_id,
 'product_code',fp.code,'product_name',fp.name,'plan_id',x.plan_id,'plan_code',plan.code,
 'quantity',trim_scale(x.quantity)::text,'unit',x.unit,'order_date',to_char(x.order_date,'YYYY-MM-DD'),
 'project_id',x.project_id,'project_name',project.code||' · '||project.name,
 'location_id',x.location_id,'location_name',location.code||' · '||location.name,
 'state',x.state,'notes',x.notes,
 'created_by',x.created_by,'created_by_name',coalesce(nullif(btrim(creator.display_name),''),creator.id),
 'approved_by_name',case when x.state='approved' then coalesce(nullif(btrim(approver.display_name),''),approver.id) end,
 'approved_at',case when x.state='approved' then x.updated_at::text end,
 'version',x.row_version,'created_at',x.created_at::text,'updated_at',x.updated_at::text) as record`;
const orderJoins = `from manufacturing_order x
 join inventory_product fp on fp.tenant_id=x.tenant_id and fp.company_id=x.company_id and fp.id=x.product_id
 join security_user_account creator on creator.tenant_id=x.tenant_id and creator.id=x.created_by
 left join erp_project project on project.tenant_id=x.tenant_id and project.company_id=x.company_id and project.id=x.project_id
 left join erp_location location on location.tenant_id=x.tenant_id and location.company_id=x.company_id and location.id=x.location_id
 left join security_user_account approver on approver.tenant_id=x.tenant_id and approver.id=x.approver_id
 left join manufacturing_plan plan on plan.tenant_id=x.tenant_id and plan.company_id=x.company_id and plan.id=x.plan_id`;

type Entity = "bom" | "plan" | "order";

export class SourceManufacturingRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(
    context: ManufacturingContext,
    company: string | null,
    permission: string,
    write: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission))
      fail("Your account does not have the required Manufacturing permission.", "PERMISSION_DENIED", 403);
    if (write && (context.realActorId || context.impersonationRequestId))
      fail("Manufacturing changes are disabled during impersonation.", "IMPERSONATION_RESTRICTED", 403);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
        `nexora:security:admin:${context.tenantId}`,
      ]);
      const access = await client.query(companyAuthority, [
        context.tenantId,
        context.actor.userId,
        company,
        permission,
      ]);
      if (company && !access.rowCount)
        fail("Manufacturing access is not available for this company.", "COMPANY_ACCESS_DENIED", 403);
      // Serialize code allocation, one-BOM-per-product checks and approvals per company.
      if (write)
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `manufacturing:${context.tenantId}:${company}`,
        ]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error && typeof error === "object" && "code" in error) {
        if (["42P01", "42703", "42883"].includes(String(error.code)))
          fail(
            "The Manufacturing database migration is required. Contact your administrator.",
            "MANUFACTURING_UNAVAILABLE",
            503,
          );
        if (String(error.code) === "23505")
          fail(
            "This record already exists or the request key was reused. Refresh and check the existing record.",
            "MANUFACTURING_DUPLICATE",
          );
        if (["23503", "23514", "40001", "40P01"].includes(String(error.code)))
          fail(
            "Manufacturing data changed or its audit evidence is incomplete. Refresh and retry.",
            "MANUFACTURING_INTEGRITY_CONFLICT",
          );
      }
      if (error instanceof RangeError) fail(error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /* ------------------------------------------------------------------ shared */

  private cursor(value: string | undefined, scope: unknown): string | null {
    if (!value) return null;
    try {
      const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("id" in parsed) ||
        typeof parsed.id !== "string" ||
        parsed.id.length > 128 ||
        !("scope" in parsed) ||
        parsed.scope !== digest(scope)
      )
        throw new Error("cursor");
      return parsed.id;
    } catch {
      return fail("The continuation does not match this company and filter.", "INVALID_CURSOR", 400);
    }
  }
  private continuation(id: string, scope: unknown) {
    return Buffer.from(JSON.stringify({ id, scope: digest(scope) })).toString("base64url");
  }
  private page<T extends { id: string }>(rows: T[], limit: number, scope: unknown) {
    const items = rows.slice(0, limit);
    return { items, next_cursor: rows.length > limit ? this.continuation(items.at(-1)!.id, scope) : null };
  }
  private validateMutation(id: string | null, version: number | undefined, key: string) {
    if (!keyPattern.test(key)) fail("Use a valid idempotency key.", "INVALID_IDEMPOTENCY_KEY", 400);
    if (!!id !== !!version)
      fail("Updates require the current version; new records must omit it.", "MANUFACTURING_VERSION_REQUIRED", 400);
  }
  private async replay(client: PoolClient, context: ManufacturingContext, key: string, fingerprint: string) {
    if (!keyPattern.test(key)) fail("Use a valid idempotency key.", "INVALID_IDEMPOTENCY_KEY", 400);
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `manufacturing:key:${context.tenantId}:${context.actor.userId}:${key}`,
    ]);
    const result = await client.query<{ request_sha256: string; result: unknown }>(
      "select request_sha256,result from manufacturing_change where tenant_id=$1 and actor_id=$2 and idempotency_key=$3",
      [context.tenantId, context.actor.userId, key],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.request_sha256 !== fingerprint)
      fail("This request key was already used for different Manufacturing data.", "IDEMPOTENCY_CONFLICT");
    return row.result;
  }
  private async nextCode(client: PoolClient, table: string, prefix: string, tenant: string, company: string) {
    const next = await client.query<{ value: string }>(
      `select (coalesce(max(substring(code from '^${prefix}-([0-9]+)$')::bigint),0)+1)::text as value from ${table} where tenant_id=$1 and company_id=$2`,
      [tenant, company],
    );
    return `${prefix}-${next.rows[0]!.value.padStart(3, "0")}`;
  }
  /** Append-only audit event plus the evidence row the database triggers require. */
  private async evidence(
    client: PoolClient,
    context: ManufacturingContext,
    entity: Entity,
    record: { id: string; company_id: string; version: number },
    action: string,
    reason: string,
    result: (auditEventId: string) => unknown,
    key: string,
    fingerprint: string,
    correlation: string,
    override: string | null = null,
  ) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const prior = await client.query<{ sequence: string; event_hash: string }>(
      "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
      [context.tenantId],
    );
    const before = await client.query<{ record: unknown }>(
      "select snapshot as record from manufacturing_change where tenant_id=$1 and company_id=$2 and entity_type=$3 and entity_id=$4 and record_version=$5",
      [context.tenantId, record.company_id, entity, record.id, record.version - 1],
    );
    const event = {
      id: `audit-${randomUUID()}`,
      tenant_id: context.tenantId,
      sequence: Number(prior.rows[0]?.sequence ?? 0) + 1,
      actor_id: context.actor.userId,
      correlation_id: correlation,
      action: `manufacturing.${entity}.${action}`,
      entity_type: `manufacturing_${entity}`,
      entity_id: record.id,
      before_hash: digest(before.rows[0]?.record ?? null),
      after_hash: digest(record),
      source_reference: `company:${record.company_id}`,
      approval_reference: override,
      occurred_at: new Date().toISOString(),
      previous_event_hash: prior.rows[0]?.event_hash ?? digest({ genesis: context.tenantId }),
    };
    await client.query(
      "insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
      [...Object.values(event), digest(event)],
    );
    await client.query(
      `insert into manufacturing_change(tenant_id,company_id,id,entity_type,entity_id,record_version,actor_id,action,reason,audit_event_id,approval_override_event_id,idempotency_key,request_sha256,snapshot,result)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,manufacturing_snapshot($4,$1,$2,$5),$14::jsonb)`,
      [
        context.tenantId,
        record.company_id,
        randomUUID(),
        entity,
        record.id,
        record.version,
        context.actor.userId,
        action,
        reason,
        event.id,
        override,
        key,
        fingerprint,
        JSON.stringify(result(event.id)),
      ],
    );
    return event.id;
  }

  companies(context: ManufacturingContext, surface: ManufacturingSurface) {
    const permission = readPermission[surface];
    return this.transaction(context, null, permission, false, async (client) => {
      const result = await client.query<{ id: string; code: string; name: string }>(
        `${companyAuthority} order by company.code,company.id limit 201`,
        [context.tenantId, context.actor.userId, null, permission],
      );
      if (result.rows.length > 200)
        fail("Narrow your company access before loading Manufacturing.", "COMPANY_DIRECTORY_LIMIT");
      return { items: result.rows };
    });
  }

  lookups(context: ManufacturingContext, query: ManufacturingLookupQuery) {
    const allowed =
      query.surface === "boms" ? ["finished_product", "component"] : ["finished_product", "project", "location"];
    if (!allowed.includes(query.kind))
      fail("This lookup is not available on this Manufacturing page.", "LOOKUP_PERMISSION_DENIED", 403);
    return this.transaction(context, query.company_id, readPermission[query.surface], false, async (client) => {
      const scope = { tenant: context.tenantId, directory: "lookups", ...query, cursor: undefined },
        after = this.cursor(query.cursor, scope),
        args = [context.tenantId, query.company_id, like(query.search), after, query.limit + 1];
      const product = (extra: string) =>
        `select p.id,p.code,p.name,${unitSql} as unit from inventory_product p
         where p.tenant_id=$1 and p.company_id=$2 and p.status='active' and p.type='goods' ${extra}
         and (p.name ilike $3 escape '\\' or p.code ilike $3 escape '\\') and ($4::text is null or p.id>$4) order by p.id limit $5`;
      const master = (table: string) =>
        `select id,code,name,null::text as unit from ${table} where tenant_id=$1 and company_id=$2 and status='active'
         and (name ilike $3 escape '\\' or code ilike $3 escape '\\') and ($4::text is null or id>$4) order by id limit $5`;
      const sql = {
        finished_product: product("and p.details->>'manufacture_enabled'='true'"),
        component: product(""),
        project: master("erp_project"),
        location: master("erp_location"),
      }[query.kind];
      const rows = (await client.query<{ id: string; code: string; name: string; unit: string | null }>(sql, args))
        .rows;
      return this.page(rows, query.limit, scope);
    });
  }
  /** Project and site location are optional on a Manufacturing Order; when given they must be active in the company. */
  private async optionalReferences(
    client: PoolClient,
    tenant: string,
    company: string,
    project: string | null,
    location: string | null,
  ) {
    if (project) {
      const found = await client.query(
        "select 1 from erp_project where tenant_id=$1 and company_id=$2 and id=$3 and status='active' for share",
        [tenant, company, project],
      );
      if (!found.rowCount) fail("Select an active project from this company.");
    }
    if (location) {
      const found = await client.query(
        "select 1 from erp_location where tenant_id=$1 and company_id=$2 and id=$3 and status='active' for share",
        [tenant, company, location],
      );
      if (!found.rowCount) fail("Select an active site location from this company.");
    }
  }

  /* ------------------------------------------------------------------ Bills of Materials */

  private async loadBom(client: PoolClient, tenant: string, company: string, id: string): Promise<Bom> {
    const result = await client.query<{ record: Omit<Bom, "component_count"> }>(
      `select ${bomProjection} ${bomJoins} where b.tenant_id=$1 and b.company_id=$2 and b.id=$3`,
      [tenant, company, id],
    );
    if (!result.rows[0]) fail("The Bill of Materials was not found in this company.", "BOM_NOT_FOUND", 404);
    return bomSchema.parse({ ...result.rows[0].record, component_count: result.rows[0].record.lines.length });
  }
  /** The product's Bill of Materials, locked against concurrent edits for the rest of the transaction. */
  private async productBom(client: PoolClient, tenant: string, company: string, product: string): Promise<Bom> {
    const found = await client.query<{ id: string }>(
      "select id from manufacturing_bom where tenant_id=$1 and company_id=$2 and product_id=$3 for share",
      [tenant, company, product],
    );
    if (!found.rows[0]) fail("Create a Bill of Materials for this product first.", "BOM_REQUIRED");
    return this.loadBom(client, tenant, company, found.rows[0].id);
  }
  boms(context: ManufacturingContext, query: ManufacturingDirectoryQuery) {
    return this.transaction(context, query.company_id, readPermission.boms, false, async (client) => {
      const scope = { tenant: context.tenantId, entity: "bom", ...query, cursor: undefined },
        after = this.cursor(query.cursor, scope);
      const result = await client.query<{ record: Omit<Bom, "component_count"> }>(
        `select ${bomProjection} ${bomJoins} where b.tenant_id=$1 and b.company_id=$2
         and (b.code ilike $3 escape '\\' or fp.name ilike $3 escape '\\' or fp.code ilike $3 escape '\\')
         and ($4::text is null or (b.created_at,b.id)<(select a.created_at,a.id from manufacturing_bom a where a.tenant_id=$1 and a.company_id=$2 and a.id=$4))
         order by b.created_at desc,b.id desc limit $5`,
        [context.tenantId, query.company_id, like(query.search), after, query.limit + 1],
      );
      const rows = result.rows.map((row) =>
        bomSchema.parse({ ...row.record, component_count: row.record.lines.length }),
      );
      return this.page(rows, query.limit, scope);
    });
  }
  getBom(context: ManufacturingContext, company: string, id: string) {
    return this.transaction(context, company, readPermission.boms, false, (client) =>
      this.loadBom(client, context.tenantId, company, id),
    );
  }
  bomByProduct(context: ManufacturingContext, company: string, product: string, surface: ManufacturingSurface) {
    return this.transaction(context, company, readPermission[surface], false, (client) =>
      this.productBom(client, context.tenantId, company, product),
    );
  }
  saveBom(context: ManufacturingContext, id: string | null, input: BomInput, key: string, correlation: string) {
    const parsed = bomInputSchema.parse(input);
    this.validateMutation(id, parsed.expected_version, key);
    const permission = id ? "manufacturing.bom.update" : "manufacturing.bom.create";
    return this.transaction(context, parsed.company_id, permission, true, async (client) => {
      const fingerprint = digest({ entity: "bom", id, input: parsed }),
        replay = await this.replay(client, context, key, fingerprint);
      if (replay) return bomMutationSchema.parse(replay);
      const tenant = context.tenantId,
        company = parsed.company_id;
      const before = id ? await this.loadBom(client, tenant, company, id) : null;
      if (before && before.version !== parsed.expected_version)
        fail("The Bill of Materials changed. Reload before saving.", "BOM_VERSION_CONFLICT");
      if (before && before.product_id !== parsed.product_id)
        fail("A Bill of Materials keeps its finished product. Create a new one for another product.");
      const finished = await client.query<{ unit: string }>(
        `select ${unitSql} as unit from inventory_product p where p.tenant_id=$1 and p.company_id=$2 and p.id=$3
         and p.status='active' and p.type='goods' and p.details->>'manufacture_enabled'='true' for share`,
        [tenant, company, parsed.product_id],
      );
      if (!finished.rows[0])
        fail("Choose an active goods product marked for manufacture in Inventory.", "BOM_PRODUCT_INELIGIBLE");
      if (!before) {
        const existing = await client.query<{ code: string }>(
          "select code from manufacturing_bom where tenant_id=$1 and company_id=$2 and product_id=$3",
          [tenant, company, parsed.product_id],
        );
        if (existing.rows[0])
          fail(
            `This product already has a Bill of Materials (${existing.rows[0].code}). Open it to make changes.`,
            "BOM_ALREADY_EXISTS",
          );
      }
      const components = await client.query<{ id: string; unit: string }>(
        `select p.id,${unitSql} as unit from inventory_product p where p.tenant_id=$1 and p.company_id=$2 and p.id=any($3::text[])
         and p.status='active' and p.type='goods' for share`,
        [tenant, company, parsed.lines.map((line) => line.product_id)],
      );
      if (components.rowCount !== parsed.lines.length)
        fail("Every component must be a different active goods product from this company.", "BOM_COMPONENT_INELIGIBLE");
      const units = new Map(components.rows.map((row) => [row.id, row.unit]));
      const recordId = id ?? `bom-${randomUUID()}`;
      if (before) {
        await client.query(
          "update manufacturing_bom set output_quantity=$4,unit=$5,notes=$6,row_version=row_version+1,updated_by=$7,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
          [
            tenant,
            company,
            recordId,
            parsed.output_quantity,
            finished.rows[0].unit,
            parsed.notes,
            context.actor.userId,
          ],
        );
        await client.query("delete from manufacturing_bom_line where tenant_id=$1 and company_id=$2 and bom_id=$3", [
          tenant,
          company,
          recordId,
        ]);
      } else {
        const code = await this.nextCode(client, "manufacturing_bom", "BOM", tenant, company);
        await client.query(
          "insert into manufacturing_bom(tenant_id,company_id,id,code,product_id,output_quantity,unit,notes,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)",
          [
            tenant,
            company,
            recordId,
            code,
            parsed.product_id,
            parsed.output_quantity,
            finished.rows[0].unit,
            parsed.notes,
            context.actor.userId,
          ],
        );
      }
      await client.query(
        `insert into manufacturing_bom_line(tenant_id,company_id,bom_id,line_no,product_id,quantity,unit)
         select $1,$2,$3,x.ordinality::int,x.value->>'product_id',(x.value->>'quantity')::numeric,x.value->>'unit'
         from jsonb_array_elements($4::jsonb) with ordinality as x(value,ordinality)`,
        [
          tenant,
          company,
          recordId,
          JSON.stringify(parsed.lines.map((line) => ({ ...line, unit: units.get(line.product_id) }))),
        ],
      );
      const record = await this.loadBom(client, tenant, company, recordId);
      const audit = await this.evidence(
        client,
        context,
        "bom",
        record,
        before ? "saved" : "created",
        before ? "Bill of Materials saved" : "Bill of Materials created",
        (auditEventId) => ({ record, audit_event_id: auditEventId }),
        key,
        fingerprint,
        correlation,
      );
      return { record, audit_event_id: audit };
    });
  }

  /* ------------------------------------------------------------------ Production plans */

  /** Plans and orders name an active goods product marked for manufacture; no BOM is required yet. */
  private async finishedProduct(client: PoolClient, tenant: string, company: string, product: string) {
    const found = await client.query<{ unit: string }>(
      `select ${unitSql} as unit from inventory_product p where p.tenant_id=$1 and p.company_id=$2 and p.id=$3
       and p.status='active' and p.type='goods' and p.details->>'manufacture_enabled'='true' for share`,
      [tenant, company, product],
    );
    if (!found.rows[0])
      fail("Choose an active finished product marked for manufacture in Inventory.", "PRODUCT_INELIGIBLE");
    return found.rows[0].unit;
  }
  private async loadPlan(client: PoolClient, tenant: string, company: string, id: string): Promise<ProductionPlan> {
    const result = await client.query<{ record: unknown }>(
      `select ${planProjection} ${planJoins} where x.tenant_id=$1 and x.company_id=$2 and x.id=$3`,
      [tenant, company, id],
    );
    if (!result.rows[0]) fail("The production plan was not found in this company.", "PLAN_NOT_FOUND", 404);
    return productionPlanSchema.parse(result.rows[0].record);
  }
  plans(context: ManufacturingContext, query: ManufacturingDirectoryQuery) {
    return this.transaction(context, query.company_id, readPermission.plans, false, async (client) => {
      const scope = { tenant: context.tenantId, entity: "plan", ...query, cursor: undefined },
        after = this.cursor(query.cursor, scope);
      const result = await client.query<{ record: unknown }>(
        `select ${planProjection} ${planJoins} where x.tenant_id=$1 and x.company_id=$2 and ($6::text is null or x.state=$6)
         and (x.code ilike $3 escape '\\' or fp.name ilike $3 escape '\\' or fp.code ilike $3 escape '\\')
         and ($4::text is null or (x.created_at,x.id)<(select a.created_at,a.id from manufacturing_plan a where a.tenant_id=$1 and a.company_id=$2 and a.id=$4))
         order by x.created_at desc,x.id desc limit $5`,
        [context.tenantId, query.company_id, like(query.search), after, query.limit + 1, query.state ?? null],
      );
      return this.page(
        result.rows.map((row) => productionPlanSchema.parse(row.record)),
        query.limit,
        scope,
      );
    });
  }
  getPlan(context: ManufacturingContext, company: string, id: string) {
    return this.transaction(context, company, readPermission.plans, false, (client) =>
      this.loadPlan(client, context.tenantId, company, id),
    );
  }
  savePlan(
    context: ManufacturingContext,
    id: string | null,
    input: ProductionPlanInput,
    key: string,
    correlation: string,
  ) {
    const parsed = productionPlanInputSchema.parse(input);
    this.validateMutation(id, parsed.expected_version, key);
    return this.transaction(context, parsed.company_id, "manufacturing.plan.create", true, async (client) => {
      const fingerprint = digest({ entity: "plan", id, input: parsed }),
        replay = await this.replay(client, context, key, fingerprint);
      if (replay) return productionPlanMutationSchema.parse(replay);
      const tenant = context.tenantId,
        company = parsed.company_id;
      const before = id ? await this.loadPlan(client, tenant, company, id) : null;
      if (before && before.version !== parsed.expected_version)
        fail("The production plan changed. Reload before saving.", "PLAN_VERSION_CONFLICT");
      if (before && before.state !== "draft")
        fail("A converted production plan cannot be edited.", "PLAN_NOT_EDITABLE");
      const unit = await this.finishedProduct(client, tenant, company, parsed.product_id);
      const recordId = id ?? `plan-${randomUUID()}`;
      if (before)
        await client.query(
          "update manufacturing_plan set product_id=$4,planned_quantity=$5,unit=$6,notes=$7,row_version=row_version+1,updated_by=$8,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
          [
            tenant,
            company,
            recordId,
            parsed.product_id,
            parsed.planned_quantity,
            unit,
            parsed.notes,
            context.actor.userId,
          ],
        );
      else {
        const code = await this.nextCode(client, "manufacturing_plan", "PP", tenant, company);
        await client.query(
          "insert into manufacturing_plan(tenant_id,company_id,id,code,product_id,planned_quantity,unit,notes,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)",
          [
            tenant,
            company,
            recordId,
            code,
            parsed.product_id,
            parsed.planned_quantity,
            unit,
            parsed.notes,
            context.actor.userId,
          ],
        );
      }
      const record = await this.loadPlan(client, tenant, company, recordId);
      const audit = await this.evidence(
        client,
        context,
        "plan",
        record,
        before ? "saved" : "created",
        before ? "Production plan saved" : "Production plan created",
        (auditEventId) => ({ record, audit_event_id: auditEventId }),
        key,
        fingerprint,
        correlation,
      );
      return { record, audit_event_id: audit };
    });
  }
  /** Creates a draft Manufacturing Order with the plan's product and quantity, and marks the plan converted. */
  convertPlan(
    context: ManufacturingContext,
    id: string,
    input: ConvertProductionPlanInput,
    key: string,
    correlation: string,
  ) {
    const parsed = convertProductionPlanInputSchema.parse(input);
    if (!keyPattern.test(key)) fail("Use a valid idempotency key.", "INVALID_IDEMPOTENCY_KEY", 400);
    return this.transaction(context, parsed.company_id, "manufacturing.plan.convert", true, async (client) => {
      const tenant = context.tenantId,
        company = parsed.company_id;
      // Conversion creates a Manufacturing Order, so order creation authority is required as well.
      if (
        !context.actor.permissions.includes("manufacturing.order.create") ||
        !(await client.query(companyAuthority, [tenant, context.actor.userId, company, "manufacturing.order.create"]))
          .rowCount
      )
        fail("Manufacturing Order creation access is required to convert a plan.", "PERMISSION_DENIED", 403);
      const fingerprint = digest({ entity: "plan", id, convert: parsed }),
        replay = await this.replay(client, context, key, fingerprint);
      if (replay) return convertProductionPlanResultSchema.parse(replay);
      const plan = await this.loadPlan(client, tenant, company, id);
      if (plan.version !== parsed.expected_version)
        fail("The production plan changed. Reload before converting.", "PLAN_VERSION_CONFLICT");
      if (plan.state !== "draft")
        fail(
          `This plan was already converted to ${plan.manufacturing_order_code ?? "a Manufacturing Order"}.`,
          "PLAN_ALREADY_CONVERTED",
        );
      const unit = await this.finishedProduct(client, tenant, company, plan.product_id);
      const orderId = `mo-${randomUUID()}`;
      const code = await this.nextCode(client, "manufacturing_order", "MO", tenant, company);
      await client.query(
        `insert into manufacturing_order(tenant_id,company_id,id,code,product_id,plan_id,quantity,unit,order_date,notes,created_by,updated_by)
         values($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9::date,current_date),$10,$11,$11)`,
        [
          tenant,
          company,
          orderId,
          code,
          plan.product_id,
          plan.id,
          plan.planned_quantity,
          unit,
          parsed.order_date ?? null,
          plan.notes,
          context.actor.userId,
        ],
      );
      const order = await this.loadOrder(client, tenant, company, orderId);
      await this.evidence(
        client,
        context,
        "order",
        order,
        "created",
        `Created from production plan ${plan.code}`,
        (auditEventId) => ({ record: order, audit_event_id: auditEventId }),
        `mo-from-plan-${digest({ key, id }).slice(0, 48)}`,
        fingerprint,
        correlation,
      );
      await client.query(
        "update manufacturing_plan set state='converted',manufacturing_order_id=$4,row_version=row_version+1,updated_by=$5,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
        [tenant, company, plan.id, orderId, context.actor.userId],
      );
      const converted = await this.loadPlan(client, tenant, company, plan.id);
      const finalOrder = await this.loadOrder(client, tenant, company, orderId, true);
      const audit = await this.evidence(
        client,
        context,
        "plan",
        converted,
        "converted",
        `Converted to Manufacturing Order ${code}`,
        (auditEventId) => ({ plan: converted, order: finalOrder, audit_event_id: auditEventId }),
        key,
        fingerprint,
        correlation,
      );
      return { plan: converted, order: finalOrder, audit_event_id: audit };
    });
  }

  /* ------------------------------------------------------------------ Manufacturing orders */

  private async loadOrder(
    client: PoolClient,
    tenant: string,
    company: string,
    id: string,
    history = false,
  ): Promise<ManufacturingOrder> {
    const result = await client.query<{ record: Record<string, unknown> }>(
      `select ${orderProjection} ${orderJoins} where x.tenant_id=$1 and x.company_id=$2 and x.id=$3`,
      [tenant, company, id],
    );
    if (!result.rows[0]) fail("The Manufacturing Order was not found in this company.", "ORDER_NOT_FOUND", 404);
    const events = history
      ? (
          await client.query(
            `select e.action,e.actor_id,coalesce(nullif(btrim(u.display_name),''),u.id) as actor_name,e.reason,
             e.approval_override_event_id is not null as override,e.occurred_at::text
             from manufacturing_change e join security_user_account u on u.tenant_id=e.tenant_id and u.id=e.actor_id
             where e.tenant_id=$1 and e.company_id=$2 and e.entity_type='order' and e.entity_id=$3 order by e.record_version`,
            [tenant, company, id],
          )
        ).rows
      : [];
    return manufacturingOrderSchema.parse({ ...result.rows[0].record, events });
  }
  orders(context: ManufacturingContext, query: ManufacturingDirectoryQuery) {
    return this.transaction(context, query.company_id, readPermission.orders, false, async (client) => {
      const scope = { tenant: context.tenantId, entity: "order", ...query, cursor: undefined },
        after = this.cursor(query.cursor, scope);
      const result = await client.query<{ record: unknown }>(
        `select ${orderProjection} ${orderJoins} where x.tenant_id=$1 and x.company_id=$2 and ($6::text is null or x.state=$6)
         and (x.code ilike $3 escape '\\' or fp.name ilike $3 escape '\\' or fp.code ilike $3 escape '\\' or coalesce(plan.code,'') ilike $3 escape '\\')
         and ($4::text is null or (x.created_at,x.id)<(select a.created_at,a.id from manufacturing_order a where a.tenant_id=$1 and a.company_id=$2 and a.id=$4))
         order by x.created_at desc,x.id desc limit $5`,
        [context.tenantId, query.company_id, like(query.search), after, query.limit + 1, query.state ?? null],
      );
      return this.page(
        result.rows.map((row) => manufacturingOrderSchema.parse({ ...(row.record as object), events: [] })),
        query.limit,
        scope,
      );
    });
  }
  getOrder(context: ManufacturingContext, company: string, id: string) {
    return this.transaction(context, company, readPermission.orders, false, (client) =>
      this.loadOrder(client, context.tenantId, company, id, true),
    );
  }
  /** A replayed order response returns the order as it stands now, including its full history. */
  private async refreshOrderReplay(
    client: PoolClient,
    context: ManufacturingContext,
    company: string,
    replay: unknown,
  ) {
    const stored = manufacturingOrderMutationSchema.parse(replay);
    return { ...stored, record: await this.loadOrder(client, context.tenantId, company, stored.record.id, true) };
  }
  saveOrder(
    context: ManufacturingContext,
    id: string | null,
    input: ManufacturingOrderInput,
    key: string,
    correlation: string,
  ) {
    const parsed = manufacturingOrderInputSchema.parse(input);
    this.validateMutation(id, parsed.expected_version, key);
    return this.transaction(context, parsed.company_id, "manufacturing.order.create", true, async (client) => {
      const fingerprint = digest({ entity: "order", id, input: parsed }),
        replay = await this.replay(client, context, key, fingerprint);
      if (replay) return this.refreshOrderReplay(client, context, parsed.company_id, replay);
      const tenant = context.tenantId,
        company = parsed.company_id;
      const before = id ? await this.loadOrder(client, tenant, company, id) : null;
      if (before && before.version !== parsed.expected_version)
        fail("The Manufacturing Order changed. Reload before saving.", "ORDER_VERSION_CONFLICT");
      if (before && !["draft", "returned"].includes(before.state))
        fail("Only draft Manufacturing Orders can be edited.", "ORDER_NOT_EDITABLE");
      if (before?.plan_id && before.product_id !== parsed.product_id)
        fail("An order created from a production plan keeps its product.");
      const unit = await this.finishedProduct(client, tenant, company, parsed.product_id);
      await this.optionalReferences(client, tenant, company, parsed.project_id, parsed.location_id);
      const recordId = id ?? `mo-${randomUUID()}`;
      const values = [
        tenant,
        company,
        recordId,
        parsed.product_id,
        parsed.quantity,
        unit,
        parsed.order_date,
        parsed.project_id,
        parsed.location_id,
        parsed.notes,
        context.actor.userId,
      ];
      if (before)
        await client.query(
          `update manufacturing_order set product_id=$4,quantity=$5,unit=$6,order_date=$7,project_id=$8,location_id=$9,notes=$10,
           row_version=row_version+1,updated_by=$11,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
          values,
        );
      else {
        const code = await this.nextCode(client, "manufacturing_order", "MO", tenant, company);
        await client.query(
          `insert into manufacturing_order(tenant_id,company_id,id,product_id,quantity,unit,order_date,project_id,location_id,notes,created_by,updated_by,code)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12)`,
          [...values, code],
        );
      }
      const saved = await this.loadOrder(client, tenant, company, recordId);
      const audit = await this.evidence(
        client,
        context,
        "order",
        saved,
        before ? "saved" : "created",
        before ? "Manufacturing Order saved" : "Manufacturing Order created",
        (auditEventId) => ({ record: saved, audit_event_id: auditEventId }),
        key,
        fingerprint,
        correlation,
      );
      return { record: await this.loadOrder(client, tenant, company, recordId, true), audit_event_id: audit };
    });
  }
  /**
   * Confirm & Approve: one step from draft to approved (requested 13 Nov 2026). It needs the
   * Manufacturing Order approval permission (Module Admin level); the confirmer is recorded as the approver.
   */
  action(context: ManufacturingContext, id: string, input: ManufacturingOrderAction, key: string, correlation: string) {
    const parsed = manufacturingOrderActionSchema.parse(input);
    if (!keyPattern.test(key)) fail("Use a valid idempotency key.", "INVALID_IDEMPOTENCY_KEY", 400);
    return this.transaction(context, parsed.company_id, APPROVE, true, async (client) => {
      const fingerprint = digest({ entity: "order", id, action: parsed }),
        replay = await this.replay(client, context, key, fingerprint);
      if (replay) return this.refreshOrderReplay(client, context, parsed.company_id, replay);
      const tenant = context.tenantId,
        company = parsed.company_id;
      const before = await this.loadOrder(client, tenant, company, id);
      if (before.version !== parsed.expected_version)
        fail("The Manufacturing Order changed. Reload before confirming.", "ORDER_VERSION_CONFLICT");
      if (before.state === "approved") fail("This Manufacturing Order is already approved.", "ORDER_STATE_CONFLICT");
      // The product must still be an active finished product at the moment of approval.
      await this.finishedProduct(client, tenant, company, before.product_id);
      await client.query(
        `update manufacturing_order set state='approved',approver_id=$4,row_version=row_version+1,updated_by=$4,updated_at=clock_timestamp()
         where tenant_id=$1 and company_id=$2 and id=$3`,
        [tenant, company, id, context.actor.userId],
      );
      const saved = await this.loadOrder(client, tenant, company, id);
      const audit = await this.evidence(
        client,
        context,
        "order",
        saved,
        "approve",
        "Confirmed and approved",
        (auditEventId) => ({ record: saved, audit_event_id: auditEventId }),
        key,
        fingerprint,
        correlation,
      );
      return { record: await this.loadOrder(client, tenant, company, id, true), audit_event_id: audit };
    });
  }
}
