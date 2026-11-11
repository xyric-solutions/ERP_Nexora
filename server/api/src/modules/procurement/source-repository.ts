import { companyAuthoritySql as companyAuthority } from "../security/company-authority.js";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { SupplierProfileCrypto, isEncryptedSupplierProfile } from "./supplier-profile-crypto.js";
import { evaluateApprovalActor } from "@nexora/auth";
import {
  purchaseDocumentSchema,
  purchaseMutationSchema,
  purchaseFlowSchema,
  supplierSchema,
  supplierMutationSchema,
  savePurchaseRequestSchema,
  purchaseActionRequestSchema,
  supplierInputSchema,
  supplierProfileSchema,
  supplierMailingAddress,
  billPaymentSchedule,
  type PurchaseDocument,
  type PurchaseKind,
  type SavePurchaseRequest,
  type PurchaseActionRequest,
  type PurchaseQuery,
  type PurchaseMutation,
  type Supplier,
  type SupplierInput,
  type SupplierProfile,
  type SupplierMutation,
  type ProcurementLookupQuery,
  type PurchaseFlowQuery,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";
import type { ReferenceMasterContext } from "../master-data/source-repository.js";
import { writeApprovalOverrideEvent } from "../security/approval-override-writer.js";
import {
  documentTotal,
  scaled,
  money,
  paymentTotals,
  type ProcurementOptions,
  type PurchasePaymentDetails,
} from "@nexora/contracts";

export type ProcurementContext = ReferenceMasterContext;
export class ProcurementError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(message: string, code = "PURCHASE_VALIDATION_FAILED", status = 409): never {
  throw new ProcurementError(status, code, message);
}
const prefixes: Record<PurchaseKind, string> = {
  request: "PRQ",
  rfq: "RFQ",
  order: "PO",
  receipt: "GRN",
  bill: "BILL",
  payment: "PAY",
  multi_payment: "MVP",
};
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

const documentProjection = `d.id,d.company_id,d.kind,d.code,d.supplier_id,d.approver_id,coalesce(nullif(btrim(approver.display_name),''),approver.id) as approver_name,d.source_id,d.invited_supplier_ids,
 to_char(d.document_date,'YYYY-MM-DD') as document_date,to_char(d.due_date,'YYYY-MM-DD') as due_date,
 to_char(d.bill_date,'YYYY-MM-DD') as bill_date,d.payment_term,
 d.currency,d.reference,d.notes,d.lines,d.allocations,d.payment_details,d.total_amount::text,d.state,d.row_version as version,
 d.created_by,d.updated_by,d.created_at::text,d.updated_at::text,s.name as supplier_name,source.code as source_code,
 coalesce((select sum((a->>'amount')::numeric+coalesce((a->>'discount')::numeric,0)) from procurement_document payment cross join lateral jsonb_array_elements(payment.allocations) a
 where payment.tenant_id=d.tenant_id and payment.company_id=d.company_id and payment.state='approved' and payment.kind in ('payment','multi_payment') and payment.allocations @> jsonb_build_array(jsonb_build_object('bill_id',d.id)) and a->>'bill_id'=d.id),0)::numeric(20,2)::text as reserved_amount`;
const documentJoins = `from procurement_document d left join procurement_supplier s on s.tenant_id=d.tenant_id and s.company_id=d.company_id and s.id=d.supplier_id
 left join security_user_account approver on approver.tenant_id=d.tenant_id and approver.id=d.approver_id
 left join procurement_document source on source.tenant_id=d.tenant_id and source.company_id=d.company_id and source.id=d.source_id`;

export class SourceProcurementRepository {
  constructor(
    private readonly pool: Pool,
    private readonly profileCrypto?: SupplierProfileCrypto,
  ) {}
  private protectProfile(profile: SupplierProfile | undefined, tenant: string, company: string, id: string): unknown {
    if (!profile?.bank_accounts.length) return profile ?? {};
    if (!this.profileCrypto)
      fail("Supplier bank storage is not configured. Contact your administrator.", "SUPPLIER_BANKING_UNAVAILABLE", 503);
    return this.profileCrypto.encrypt(profile, JSON.stringify([tenant, company, id]));
  }
  private readProfile(profile: unknown, tenant: string, company: string, id: string): SupplierProfile {
    if (!isEncryptedSupplierProfile(profile)) return supplierProfileSchema.parse(profile ?? {});
    if (!this.profileCrypto)
      fail("Supplier bank storage is not configured. Contact your administrator.", "SUPPLIER_BANKING_UNAVAILABLE", 503);
    try {
      return this.profileCrypto.decrypt(profile, JSON.stringify([tenant, company, id]));
    } catch {
      return fail(
        "Supplier bank details could not be opened. Contact your administrator.",
        "SUPPLIER_BANKING_UNAVAILABLE",
        503,
      );
    }
  }
  private async transaction<T>(
    context: ProcurementContext,
    company: string | null,
    permission: string,
    write: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission))
      fail("Your account does not have the required Purchase permission.", "PERMISSION_DENIED", 403);
    if (write && (context.realActorId || context.impersonationRequestId))
      fail("Purchase changes are disabled during impersonation.", "IMPERSONATION_RESTRICTED", 403);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
        `nexora:security:admin:${context.tenantId}`,
      ]);
      const authority = await client.query(companyAuthority, [
        context.tenantId,
        context.actor.userId,
        company,
        permission,
      ]);
      if (company && !authority.rowCount)
        fail("Purchase access is not available for this company.", "COMPANY_ACCESS_DENIED", 403);
      // Serialize approval consumption and edits per company, including partial receipts and payment allocations.
      if (write)
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `procurement:${context.tenantId}:${company}`,
        ]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error && typeof error === "object" && "code" in error) {
        if (["42P01", "42703"].includes(String(error.code)))
          fail(
            "The Purchase database migration is required. Contact your administrator.",
            "PROCUREMENT_UNAVAILABLE",
            503,
          );
        if (["23503", "23505", "23514", "40001", "40P01"].includes(String(error.code)))
          fail(
            "Purchase data changed or its audit evidence is incomplete. Refresh and retry.",
            "PURCHASE_INTEGRITY_CONFLICT",
          );
      }
      if (error instanceof RangeError) fail(error.message);
      throw error;
    } finally {
      client.release();
    }
  }
  companies(context: ProcurementContext) {
    return this.transaction(context, null, "procurement.document.read", false, async (client) => {
      const rows = await client.query<{ id: string; code: string; name: string }>(
        `${companyAuthority} order by company.code,company.id limit 201`,
        [context.tenantId, context.actor.userId, null, "procurement.document.read"],
      );
      if (rows.rows.length > 200)
        fail("Narrow your company access before loading Purchases.", "COMPANY_DIRECTORY_LIMIT");
      return { items: rows.rows };
    });
  }
  async list(context: ProcurementContext, query: PurchaseQuery) {
    return this.transaction(context, query.company_id, "procurement.document.read", false, async (client) => {
      const cursor = this.cursor(query.cursor, { tenant: context.tenantId, ...query, cursor: undefined });
      const result = await client.query(
        `select ${documentProjection} ${documentJoins}
       where d.tenant_id=$1 and d.company_id=$2 and ($3::text is null or d.kind=$3) and ($4::text is null or d.state=$4)
       and (d.code ilike $5 escape '\\' or d.reference ilike $5 escape '\\' or s.name ilike $5 escape '\\')
       and ($6::text is null or d.id>$6) and ($8::text is null or d.supplier_id=$8) order by d.id limit $7`,
        [
          context.tenantId,
          query.company_id,
          query.kind ?? null,
          query.state ?? null,
          `%${query.search.replace(/[\\%_]/g, "\\$&")}%`,
          cursor,
          query.limit + 1,
          query.supplier_id ?? null,
        ],
      );
      const items = result.rows.slice(0, query.limit).map((row) => purchaseDocumentSchema.parse(row));
      return {
        items,
        next_cursor:
          result.rows.length > query.limit
            ? this.continuation(items.at(-1)!.id, { tenant: context.tenantId, ...query, cursor: undefined })
            : null,
      };
    });
  }
  options(context: ProcurementContext, company: string) {
    return this.transaction(context, company, "procurement.document.read", false, async (client) => {
      const result = await client.query<{ code: string; name: string }>(
        "select c.code,c.name from company_currency cc join currency c on c.tenant_id=cc.tenant_id and c.code=cc.currency_code where cc.tenant_id=$1 and cc.company_id=$2 and cc.status='active' and c.status='active' and c.decimal_places=2 order by cc.is_base desc,c.code limit 100",
        [context.tenantId, company],
      );
      const canSelfApprove = await this.ownApprovalAuthority(client, context.tenantId, company, context.actor.userId);
      const banks = await client.query<NonNullable<ProcurementOptions["bank_accounts"]>[number]>(
        `select bank.id,bank.account_name,bank.account_number_masked,bank.currency
         from bank_account bank join account ledger on ledger.tenant_id=bank.tenant_id and ledger.company_id=bank.company_id and ledger.id=bank.account_id
         where bank.tenant_id=$1 and bank.company_id=$2 and bank.status='active'
          and ledger.status='active' and not ledger.is_header and ledger.manual_posting_allowed and ledger.reconciliation_required
         order by bank.account_name,bank.id limit 200`,
        [context.tenantId, company],
      );
      return {
        currencies: result.rows,
        bank_accounts: banks.rows,
        can_self_approve: canSelfApprove,
        execution_mode: "instruction_only" as const,
      };
    });
  }
  products(context: ProcurementContext, query: ProcurementLookupQuery) {
    return this.transaction(context, query.company_id, "procurement.document.read", false, async (client) => {
      const scope = { tenant: context.tenantId, directory: "products", ...query, cursor: undefined };
      const cursor = this.cursor(query.cursor, scope);
      const result = await client.query<{ id: string; code: string; name: string; uom: string }>(
        `select id,code,name,coalesce(nullif(details->>'unit',''),'Each') as uom from inventory_product
         where tenant_id=$1 and company_id=$2 and status='active'
         and (code ilike $3 escape '\\' or name ilike $3 escape '\\')
         and ($4::text is null or id>$4) order by id limit $5`,
        [context.tenantId, query.company_id, `%${query.search.replace(/[\\%_]/g, "\\$&")}%`, cursor, query.limit + 1],
      );
      const items = result.rows.slice(0, query.limit);
      return {
        items,
        next_cursor: result.rows.length > query.limit ? this.continuation(items.at(-1)!.id, scope) : null,
      };
    });
  }
  approvers(context: ProcurementContext, query: ProcurementLookupQuery) {
    return this.transaction(context, query.company_id, "procurement.document.read", false, async (client) => {
      const scope = { tenant: context.tenantId, directory: "approvers", ...query, cursor: undefined };
      const cursor = this.cursor(query.cursor, scope);
      const eligible = companyAuthority
        .replaceAll("$2", "candidate.id")
        .replaceAll("$4", "'procurement.document.approve'");
      const result = await client.query<{ id: string; name: string }>(
        `select candidate.id,coalesce(nullif(btrim(candidate.display_name),''),candidate.id) as name from security_user_account candidate
         where candidate.tenant_id=$1 and exists(${eligible})
         and (candidate.display_name ilike $2 escape '\\' or candidate.id ilike $2 escape '\\')
         and ($4::text is null or candidate.id>$4) order by candidate.id limit $5`,
        [context.tenantId, `%${query.search.replace(/[\\%_]/g, "\\$&")}%`, query.company_id, cursor, query.limit + 1],
      );
      const items = result.rows.slice(0, query.limit);
      return {
        items,
        next_cursor: result.rows.length > query.limit ? this.continuation(items.at(-1)!.id, scope) : null,
      };
    });
  }
  private async ownApprovalAuthority(client: PoolClient, tenant: string, company: string, user: string) {
    const self = await client.query(companyAuthority, [tenant, user, company, "procurement.document.self_approve"]);
    if (self.rowCount) return true;
    const admin = await client.query(
      companyAuthority.replace("where u.tenant_id", "where r.role_code='super_administrator' and u.tenant_id"),
      [tenant, user, company, "platform.approval.override"],
    );
    return !!admin.rowCount;
  }
  private async requireApprover(
    client: PoolClient,
    tenant: string,
    company: string,
    approver: string | null | undefined,
    makers: string[],
  ) {
    if (!approver) return; // Historical unassigned records retain independent checker approval.
    const allowed = await client.query(companyAuthority, [tenant, approver, company, "procurement.document.approve"]);
    if (!allowed.rowCount)
      fail("Select an active approver with approval access to this company.", "PURCHASE_APPROVER_INELIGIBLE");
    if (makers.includes(approver) && !(await this.ownApprovalAuthority(client, tenant, company, approver)))
      fail(
        "This approver needs explicit self-approval access or must be independent of the makers.",
        "MAKER_CHECKER_REQUIRED",
        403,
      );
  }
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
  private async load(
    client: PoolClient,
    tenant: string,
    company: string,
    id: string,
    history = false,
  ): Promise<PurchaseDocument> {
    const result = await client.query(
      `select ${documentProjection} ${documentJoins} where d.tenant_id=$1 and d.company_id=$2 and d.id=$3`,
      [tenant, company, id],
    );
    if (!result.rowCount) fail("The Purchase record was not found in this company.", "PURCHASE_NOT_FOUND", 404);
    const events = history
      ? (
          await client.query(
            "select action,actor_id,reason,occurred_at::text from procurement_change where tenant_id=$1 and company_id=$2 and entity_type='document' and entity_id=$3 order by record_version",
            [tenant, company, id],
          )
        ).rows
      : [];
    return purchaseDocumentSchema.parse({ ...result.rows[0], events });
  }
  get(context: ProcurementContext, company: string, id: string) {
    return this.transaction(context, company, "procurement.document.read", false, async (client) => {
      const record = await this.load(client, context.tenantId, company, id, true);
      if (["payment", "multi_payment"].includes(record.kind)) return record;
      const approver = await this.requestApprover(client, context.tenantId, company, id);
      return purchaseDocumentSchema.parse({
        ...record,
        request_approver_id: approver?.id ?? null,
        request_approver_name: approver?.name ?? null,
      });
    });
  }
  private async requestApprover(client: PoolClient, tenant: string, company: string, id: string) {
    const result = await client.query<{ id: string; name: string }>(
      `with recursive ancestors as (
        select id,source_id,approver_id,0 as depth,array[id] as path from procurement_document where tenant_id=$1 and company_id=$2 and id=$3
        union all
        select parent.id,parent.source_id,parent.approver_id,a.depth+1,a.path||parent.id
        from ancestors a join procurement_document parent on parent.tenant_id=$1 and parent.company_id=$2 and parent.id=a.source_id
        where a.depth<5 and not parent.id=any(a.path)
      ) select a.approver_id as id,coalesce(nullif(btrim(u.display_name),''),a.approver_id) as name
        from ancestors a left join security_user_account u on u.tenant_id=$1 and u.id=a.approver_id
        where a.approver_id is not null order by a.depth desc limit 1`,
      [tenant, company, id],
    );
    return result.rows[0] ?? null;
  }
  flow(context: ProcurementContext, id: string, query: PurchaseFlowQuery) {
    return this.transaction(context, query.company_id, "procurement.document.read", false, async (client) => {
      const root = await client.query<{ id: string; code: string; kind: string }>(
        `with recursive ancestors as (
          select id,code,kind,source_id,0 as depth,array[id] as path from procurement_document where tenant_id=$1 and company_id=$2 and id=$3
          union all
          select parent.id,parent.code,parent.kind,parent.source_id,a.depth+1,a.path||parent.id
          from ancestors a join procurement_document parent on parent.tenant_id=$1 and parent.company_id=$2 and parent.id=a.source_id
          where a.depth<5 and not parent.id=any(a.path)
        ) select id,code,kind from ancestors order by depth desc limit 1`,
        [context.tenantId, query.company_id, id],
      );
      const request = root.rows[0];
      if (!request) fail("The Purchase record was not found in this company.", "PURCHASE_NOT_FOUND", 404);
      if (request.kind !== "request")
        fail("This record does not belong to a Request-to-Bill flow.", "PURCHASE_FLOW_UNAVAILABLE");
      const scope = {
        tenant: context.tenantId,
        company: query.company_id,
        root: request.id,
        limit: query.limit,
        directory: "flow",
      };
      const cursor = this.cursor(query.cursor, scope);
      const tree = `with recursive flow as (
        select id,kind,state,source_id,0 as depth from procurement_document where tenant_id=$1 and company_id=$2 and id=$3
        union all
        select child.id,child.kind,child.state,child.source_id,f.depth+1 from flow f
        join procurement_document child on child.tenant_id=$1 and child.company_id=$2 and child.source_id=f.id
        where f.depth<5 and child.kind in ('rfq','order','receipt','bill')
      )`;
      const counts = await client.query(
        `${tree} select kind,count(*)::integer as total,
        count(*) filter(where state='draft')::integer as draft,
        count(*) filter(where state='submitted')::integer as submitted,
        count(*) filter(where state='approved')::integer as approved,
        count(*) filter(where state='rejected')::integer as rejected,
        count(*) filter(where state='cancelled')::integer as cancelled from flow group by kind`,
        [context.tenantId, query.company_id, request.id],
      );
      const records = await client.query(
        `${tree}
        select d.id,d.code,d.kind,d.state,d.source_id,source.code as source_code,
        to_char(d.document_date,'YYYY-MM-DD') as document_date,s.name as supplier_name,d.total_amount::text,d.currency
        from flow f join procurement_document d on d.tenant_id=$1 and d.company_id=$2 and d.id=f.id
        left join procurement_document source on source.tenant_id=d.tenant_id and source.company_id=d.company_id and source.id=d.source_id
        left join procurement_supplier s on s.tenant_id=d.tenant_id and s.company_id=d.company_id and s.id=d.supplier_id
        where ($4::text is null or d.id>$4) order by d.id limit $5`,
        [context.tenantId, query.company_id, request.id, cursor, query.limit + 1],
      );
      const items = records.rows.slice(0, query.limit);
      return purchaseFlowSchema.parse({
        root_id: request.id,
        root_code: request.code,
        items,
        stages: counts.rows,
        next_cursor: records.rows.length > query.limit ? this.continuation(items.at(-1)!.id, scope) : null,
      });
    });
  }
  suppliers(context: ProcurementContext, query: PurchaseQuery) {
    return this.transaction(context, query.company_id, "procurement.vendor.read", false, async (client) => {
      const cursor = this.cursor(query.cursor, { tenant: context.tenantId, ...query, cursor: undefined });
      const result = await client.query(
        `select id,company_id,code,name,tax_id,email,phone,address,profile,status,risk_status,row_version as version from procurement_supplier
       where tenant_id=$1 and company_id=$2 and (name ilike $3 escape '\\' or code ilike $3 escape '\\') and ($4::text is null or id>$4) order by id limit $5`,
        [context.tenantId, query.company_id, `%${query.search.replace(/[\\%_]/g, "\\$&")}%`, cursor, query.limit + 1],
      );
      const items = result.rows.slice(0, query.limit).map((row) =>
        supplierSchema.parse({
          ...row,
          profile: this.readProfile(row.profile, context.tenantId, query.company_id, row.id),
        }),
      );
      return {
        items,
        next_cursor:
          result.rows.length > query.limit
            ? this.continuation(items.at(-1)!.id, { tenant: context.tenantId, ...query, cursor: undefined })
            : null,
      };
    });
  }
  private async vendor(
    client: PoolClient,
    tenant: string,
    company: string,
    id: string,
    eligible = true,
  ): Promise<Supplier> {
    const result = await client.query(
      `select s.id,s.company_id,s.code,s.name,s.tax_id,s.email,s.phone,s.address,s.profile,s.status,s.risk_status,s.row_version as version,
       p.status as party_status,p.risk_status as party_risk,p.type as party_type from procurement_supplier s join party p on p.tenant_id=s.tenant_id and p.id=s.id
       where s.tenant_id=$1 and s.company_id=$2 and s.id=$3`,
      [tenant, company, id],
    );
    if (!result.rowCount) fail("The supplier is not available in this company.", "SUPPLIER_NOT_FOUND", 404);
    const row = result.rows[0]!,
      { party_status, party_risk, party_type, ...record } = row;
    const supplier = supplierSchema.parse({
      ...record,
      profile: this.readProfile(record.profile, tenant, company, id),
    });
    if (
      eligible &&
      (supplier.status !== "active" ||
        supplier.risk_status === "blocked" ||
        party_status !== "active" ||
        party_risk === "blocked" ||
        party_type !== "vendor")
    )
      fail("An active, unblocked supplier is required.", "SUPPLIER_INELIGIBLE");
    return supplier;
  }
  private async requireSuppliers(client: PoolClient, tenant: string, company: string, ids: string[]) {
    if (!ids.length) return;
    const result = await client.query(
      `select s.id from procurement_supplier s join party p on p.tenant_id=s.tenant_id and p.id=s.id and p.type='vendor'
      where s.tenant_id=$1 and s.company_id=$2 and s.id=any($3::text[]) and s.status='active' and p.status='active' and s.risk_status<>'blocked' and p.risk_status<>'blocked'`,
      [tenant, company, ids],
    );
    if (result.rows.length !== ids.length)
      fail("An active, unblocked supplier in this company is required.", "SUPPLIER_INELIGIBLE");
  }
  private async replay(client: PoolClient, context: ProcurementContext, key: string, fingerprint: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      fail("A bounded idempotency key is required.", "INVALID_IDEMPOTENCY_KEY", 400);
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `procurement:key:${context.tenantId}:${context.actor.userId}:${key}`,
    ]);
    const result = await client.query<{ request_sha256: string; result: unknown }>(
      "select request_sha256,result from procurement_change where tenant_id=$1 and actor_id=$2 and idempotency_key=$3",
      [context.tenantId, context.actor.userId, key],
    );
    if (result.rowCount && result.rows[0]!.request_sha256 !== fingerprint)
      fail("This request key belongs to another operation.", "IDEMPOTENCY_CONFLICT");
    return result.rows[0]?.result;
  }
  async saveSupplier(
    context: ProcurementContext,
    id: string | null,
    input: SupplierInput,
    key: string,
    correlation: string,
  ): Promise<SupplierMutation> {
    const created = id === null,
      parsed = supplierInputSchema.parse(input),
      fingerprint = digest({ entity: "supplier", id, input: parsed });
    return this.transaction(context, parsed.company_id, "procurement.vendor.create", true, async (client) => {
      const replay = await this.replay(client, context, key, fingerprint);
      if (replay) {
        const saved = z
          .object({
            record: z.looseObject({ id: z.string(), profile: z.unknown().optional() }),
            audit_event_id: z.string(),
          })
          .parse(replay);
        return supplierMutationSchema.parse({
          ...saved,
          record: {
            ...saved.record,
            profile: this.readProfile(saved.record.profile, context.tenantId, parsed.company_id, saved.record.id),
          },
        });
      }
      if (id) {
        const before = await this.vendor(client, context.tenantId, parsed.company_id, id, false);
        if (before.version !== parsed.expected_version)
          fail("The supplier changed. Reload before editing.", "PURCHASE_VERSION_CONFLICT");
        await client.query(
          `update procurement_supplier set name=$4,tax_id=$5,email=$6,phone=$7,address=$8,status=$9,profile=coalesce($11::jsonb,profile),row_version=row_version+1,updated_by=$10,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
          [
            context.tenantId,
            parsed.company_id,
            id,
            parsed.name,
            parsed.tax_id,
            parsed.email,
            parsed.phone,
            parsed.address,
            parsed.status,
            context.actor.userId,
            parsed.profile === undefined
              ? null
              : JSON.stringify(this.protectProfile(parsed.profile, context.tenantId, parsed.company_id, id)),
          ],
        );
        await client.query("update party set name=$3,tax_id=$4,status=$5 where tenant_id=$1 and id=$2", [
          context.tenantId,
          id,
          parsed.name,
          parsed.tax_id,
          parsed.status,
        ]);
      } else {
        if (parsed.expected_version !== undefined)
          fail("A new supplier cannot have an existing version.", "INVALID_PURCHASE", 400);
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `procurement:supplier-code:${context.tenantId}`,
        ]);
        const result = await client.query<{ next: string }>(
          "select (coalesce(max(substring(code from '[0-9]+$')::numeric),0)+1)::text as next from party where tenant_id=$1 and code ~ '^SUP-[0-9]+$'",
          [context.tenantId],
        );
        const code = `SUP-${result.rows[0]!.next.padStart(3, "0")}`;
        id = `supplier-${randomUUID()}`;
        await client.query(
          "insert into party(id,tenant_id,type,code,name,tax_id,status,risk_status,created_at) values($1,$2,'vendor',$3,$4,$5,$6,'normal',now())",
          [id, context.tenantId, code, parsed.name, parsed.tax_id, parsed.status],
        );
        await client.query(
          "insert into procurement_supplier(tenant_id,company_id,id,code,name,tax_id,email,phone,address,status,created_by,updated_by,profile) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12::jsonb)",
          [
            context.tenantId,
            parsed.company_id,
            id,
            code,
            parsed.name,
            parsed.tax_id,
            parsed.email,
            parsed.phone,
            parsed.address,
            parsed.status,
            context.actor.userId,
            JSON.stringify(this.protectProfile(parsed.profile, context.tenantId, parsed.company_id, id)),
          ],
        );
      }
      const record = await this.vendor(client, context.tenantId, parsed.company_id, id, false);
      const auditId = await this.evidence(
        client,
        context,
        "supplier",
        record.id,
        record.company_id,
        record.version,
        created ? "created" : "saved",
        "Supplier details saved",
        record,
        key,
        fingerprint,
        correlation,
      );
      return supplierMutationSchema.parse({ record, audit_event_id: auditId });
    });
  }
  async save(
    context: ProcurementContext,
    id: string | null,
    input: SavePurchaseRequest,
    key: string,
    correlation: string,
  ): Promise<PurchaseMutation> {
    const parsed = savePurchaseRequestSchema.parse(input),
      fingerprint = digest({ entity: "document", id, input: parsed });
    return this.transaction(
      context,
      parsed.company_id,
      id ? "procurement.document.action" : "procurement.document.create",
      true,
      async (client) => {
        const replay = await this.replay(client, context, key, fingerprint);
        if (replay) return purchaseMutationSchema.parse(replay);
        let code: string;
        let approverId = parsed.approver_id ?? null;
        let previousApprover: string | null = null;
        let paymentDetails = parsed.payment_details;
        let billDate = parsed.bill_date;
        let paymentTerm = parsed.payment_term;
        let makers = [context.actor.userId];
        if (id) {
          const before = await this.load(client, context.tenantId, parsed.company_id, id, true);
          previousApprover = before.approver_id ?? null;
          if (paymentDetails === undefined) paymentDetails = before.payment_details;
          if (billDate === undefined) billDate = before.bill_date;
          if (paymentTerm === undefined) paymentTerm = before.payment_term;
          if (parsed.approver_id === undefined) approverId = before.approver_id ?? null;
          makers = [
            ...makers,
            before.created_by,
            ...before.events
              .filter((event) => ["created", "saved", "submit"].includes(event.action))
              .map((event) => event.actor_id),
          ];
          if (before.version !== parsed.expected_version)
            fail("The Purchase record changed. Reload before editing.", "PURCHASE_VERSION_CONFLICT");
          if (!["draft", "rejected"].includes(before.state) || before.kind !== parsed.kind)
            fail("Only draft or rejected records can be edited.", "PURCHASE_NOT_EDITABLE");
          code = before.code;
        } else {
          if (parsed.expected_version !== undefined)
            fail("A new Purchase record cannot have an existing version.", "INVALID_PURCHASE", 400);
          const next = await client.query<{ next: string }>(
            "select (coalesce(max(substring(code from '[0-9]+$')::numeric),0)+1)::text as next from procurement_document where tenant_id=$1 and company_id=$2 and kind=$3",
            [context.tenantId, parsed.company_id, parsed.kind],
          );
          code = `${prefixes[parsed.kind]}-${next.rows[0]!.next.padStart(3, "0")}`;
        }
        if (!["request", "payment", "multi_payment"].includes(parsed.kind) && parsed.source_id) {
          const inherited = await this.requestApprover(client, context.tenantId, parsed.company_id, parsed.source_id);
          if (parsed.approver_id && parsed.approver_id !== inherited?.id && parsed.approver_id !== previousApprover)
            fail("The approver is inherited from the Purchase Request.", "PURCHASE_APPROVER_MISMATCH", 400);
          approverId = inherited?.id ?? previousApprover;
        }
        await this.requireApprover(client, context.tenantId, parsed.company_id, approverId, makers);
        const lines = parsed.lines.map((line) => ({ ...line, id: line.id ?? `purchase-line-${randomUUID()}` }));
        if (parsed.kind === "request") {
          const productIds = [...new Set(lines.flatMap((line) => (line.product_id ? [line.product_id] : [])))];
          if (productIds.length) {
            const products = await client.query<{ id: string; code: string; name: string; uom: string }>(
              `select id,code,name,coalesce(nullif(details->>'unit',''),'Each') as uom from inventory_product
               where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and status='active' for share`,
              [context.tenantId, parsed.company_id, productIds],
            );
            if (products.rows.length !== productIds.length)
              fail("A selected product is inactive or unavailable in this company.", "PURCHASE_PRODUCT_INELIGIBLE");
            for (const line of lines) {
              const product = products.rows.find((item) => item.id === line.product_id);
              if (product) {
                line.item_code = product.code;
                line.product_name = product.name;
                line.uom = product.uom;
              }
            }
          }
        }
        const details = paymentDetails
          ? await this.paymentSnapshots(client, context.tenantId, parsed.company_id, parsed.currency, paymentDetails)
          : null;
        const terms = {
          ...parsed,
          lines,
          payment_details: details,
          bill_date: billDate ?? null,
          payment_term: paymentTerm ?? null,
        };
        if (terms.kind === "bill") {
          terms.bill_date ??= terms.document_date;
          if (terms.payment_term) {
            try {
              terms.due_date = billPaymentSchedule(terms.bill_date, terms.payment_term, documentTotal(lines)).at(
                -1,
              )!.due_date;
            } catch {
              fail(
                "The bill date or payment schedule is outside the supported range.",
                "INVALID_BILL_PAYMENT_TERM",
                400,
              );
            }
          }
        }
        const total = await this.validate(client, context.tenantId, id, terms, false);
        const documentId = id ?? `purchase-${randomUUID()}`;
        const values = [
          context.tenantId,
          parsed.company_id,
          documentId,
          parsed.kind,
          code,
          parsed.supplier_id,
          parsed.source_id,
          JSON.stringify(parsed.invited_supplier_ids),
          parsed.document_date,
          terms.due_date,
          parsed.currency,
          parsed.reference,
          parsed.notes,
          JSON.stringify(lines),
          JSON.stringify(parsed.allocations),
          total,
          context.actor.userId,
          approverId,
          details ? JSON.stringify(details) : null,
          terms.bill_date,
          terms.payment_term,
        ];
        if (id)
          await client.query(
            `update procurement_document set supplier_id=$6,source_id=$7,invited_supplier_ids=$8,document_date=$9,due_date=$10,currency=$11,reference=$12,notes=$13,lines=$14,allocations=$15,total_amount=$16,updated_by=$17,approver_id=$18,payment_details=$19,bill_date=$20,payment_term=$21,updated_at=clock_timestamp(),row_version=row_version+1,state='draft' where tenant_id=$1 and company_id=$2 and id=$3 and kind=$4 and code=$5`,
            values,
          );
        else
          await client.query(
            `insert into procurement_document(tenant_id,company_id,id,kind,code,supplier_id,source_id,invited_supplier_ids,document_date,due_date,currency,reference,notes,lines,allocations,total_amount,created_by,updated_by,approver_id,payment_details,bill_date,payment_term) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,$18,$19,$20,$21)`,
            values,
          );
        const record = await this.load(client, context.tenantId, parsed.company_id, documentId);
        const auditId = await this.evidence(
          client,
          context,
          "document",
          documentId,
          parsed.company_id,
          record.version,
          id ? "saved" : "created",
          "Purchase draft saved",
          record,
          key,
          fingerprint,
          correlation,
        );
        return { record, audit_event_id: auditId };
      },
    );
  }
  private async validate(
    client: PoolClient,
    tenant: string,
    id: string | null,
    terms: SavePurchaseRequest,
    committing: boolean,
  ): Promise<string> {
    if (terms.kind !== "bill" && (terms.bill_date || terms.payment_term))
      fail("Bill dates and payment terms belong to supplier bills.", "INVALID_BILL_PAYMENT_TERM", 400);
    const dateBasis = terms.kind === "bill" ? (terms.bill_date ?? terms.document_date) : terms.document_date;
    if (terms.due_date && terms.due_date < dateBasis)
      fail(
        terms.kind === "bill"
          ? "The due date cannot be before the bill date."
          : "The due date cannot be before the document date.",
      );
    if (terms.kind === "bill" && terms.payment_term) {
      let dueDate: string;
      try {
        dueDate = billPaymentSchedule(dateBasis, terms.payment_term, documentTotal(terms.lines)).at(-1)!.due_date;
      } catch {
        return fail("Enter a valid bill payment schedule.", "INVALID_BILL_PAYMENT_TERM", 400);
      }
      if (terms.due_date !== dueDate)
        fail("The bill due date does not match its payment term.", "INVALID_BILL_PAYMENT_TERM", 400);
    }
    const currency = await client.query(
      "select 1 from currency c join company_currency cc on cc.tenant_id=c.tenant_id and cc.currency_code=c.code where c.tenant_id=$2 and c.code=$1 and c.status='active' and c.decimal_places=2 and cc.company_id=$3 and cc.status='active'",
      [terms.currency, tenant, terms.company_id],
    );
    if (!currency.rowCount) fail("Select an active tenant currency with two decimal places.");
    const supplierIds = [
      ...new Set([...(terms.supplier_id ? [terms.supplier_id] : []), ...terms.invited_supplier_ids]),
    ];
    await this.requireSuppliers(client, tenant, terms.company_id, supplierIds);
    if (new Set(terms.invited_supplier_ids).size !== terms.invited_supplier_ids.length)
      fail("Select each invited supplier once.");
    if (terms.kind !== "rfq" && terms.invited_supplier_ids.length)
      fail("Invited suppliers belong to a Request for Quotation.");
    if (terms.kind === "rfq" && !terms.invited_supplier_ids.length)
      fail("Invite at least one supplier to the Request for Quotation.");
    if (["payment", "multi_payment"].includes(terms.kind))
      return this.validatePayment(client, tenant, id, terms, committing);
    if (terms.payment_details) fail("Payment details belong to payment instructions.");
    if (terms.allocations.length) fail("Bill allocations belong to Payment forms.");
    if (!terms.lines.length) fail("Enter at least one product or service line.");
    if (new Set(terms.lines.map((line) => line.id)).size !== terms.lines.length)
      fail("Each document line needs a unique identity.");
    if (["order", "receipt", "bill"].includes(terms.kind) && !terms.supplier_id) fail("Select the supplier.");
    if (terms.kind === "bill" && !terms.reference) fail("Enter the supplier invoice reference.");
    if (terms.kind === "bill") {
      const duplicate = await client.query(
        "select 1 from procurement_document where tenant_id=$1 and company_id=$2 and kind='bill' and supplier_id=$3 and lower(reference)=lower($4) and state<>'cancelled' and id<>coalesce($5,'')",
        [tenant, terms.company_id, terms.supplier_id, terms.reference, id],
      );
      if (duplicate.rowCount) fail("This supplier invoice reference is already recorded.", "DUPLICATE_SUPPLIER_BILL");
    }
    if (terms.kind === "request" && terms.source_id)
      fail("A Purchase Request does not have an earlier Purchase source.");
    if (terms.kind !== "request" && !terms.source_id) fail("Select an approved source document.");
    if (terms.source_id) {
      if (terms.source_id === id) fail("A record cannot be its own source.");
      const source = await this.load(client, tenant, terms.company_id, terms.source_id);
      const allowed: Record<string, string[]> = {
        rfq: ["request"],
        order: ["rfq", "request"],
        receipt: ["order"],
        bill: ["order"],
      };
      if (source.state !== "approved" || !allowed[terms.kind]?.includes(source.kind))
        fail(
          "The selected source must be an approved record from the previous workflow step.",
          "PURCHASE_SOURCE_INELIGIBLE",
        );
      if (source.currency !== terms.currency) fail("The currency must match the source document.");
      if (source.supplier_id && source.supplier_id !== terms.supplier_id)
        fail("The supplier must match the source document.");
      if (source.kind === "rfq" && terms.supplier_id && !source.invited_supplier_ids.includes(terms.supplier_id))
        fail("Select a supplier invited to this Request for Quotation.");
      if (new Set(terms.lines.map((line) => line.source_line_id)).size !== terms.lines.length)
        fail("Select each source line once; use separate receipts for partial deliveries.");
      const consumed = new Map<string, bigint>();
      if (committing) {
        const quantities = await client.query<{ kind: string; source_line_id: string; quantity: string }>(
          `select d.kind,l->>'source_line_id' as source_line_id,sum((l->>'quantity')::numeric)::text as quantity
          from procurement_document d cross join lateral jsonb_array_elements(d.lines) l where d.tenant_id=$1 and d.company_id=$2 and d.source_id=$3 and d.state='approved' and d.id<>coalesce($4,'') group by d.kind,l->>'source_line_id'`,
          [tenant, terms.company_id, source.id, id],
        );
        for (const row of quantities.rows) consumed.set(`${row.kind}:${row.source_line_id}`, scaled(row.quantity, 4));
      }
      let request: PurchaseDocument | null = null;
      const rootConsumed = new Map<string, bigint>();
      if (terms.kind === "order" && committing) {
        request =
          source.kind === "request" ? source : await this.load(client, tenant, terms.company_id, source.source_id!);
        const quantities = await client.query<{ source_line_id: string; quantity: string }>(
          `select case when o.source_id=$3 then l->>'source_line_id' else rl->>'source_line_id' end as source_line_id,sum((l->>'quantity')::numeric)::text as quantity
          from procurement_document o cross join lateral jsonb_array_elements(o.lines) l
          left join procurement_document rfq on rfq.tenant_id=o.tenant_id and rfq.company_id=o.company_id and rfq.id=o.source_id and rfq.kind='rfq'
          left join lateral jsonb_array_elements(rfq.lines) rl on rl->>'id'=l->>'source_line_id'
          where o.tenant_id=$1 and o.company_id=$2 and o.kind='order' and o.state='approved' and o.id<>coalesce($4,'') and (o.source_id=$3 or rfq.source_id=$3)
          group by case when o.source_id=$3 then l->>'source_line_id' else rl->>'source_line_id' end`,
          [tenant, terms.company_id, request.id, id],
        );
        for (const row of quantities.rows) rootConsumed.set(row.source_line_id, scaled(row.quantity, 4));
      }
      for (const line of terms.lines) {
        const sourceLine = source.lines.find((item) => item.id === line.source_line_id);
        if (!sourceLine) fail("Every line must reference a line on the selected source.");
        if (
          line.item_code !== sourceLine.item_code ||
          (line.product_id ?? null) !== (sourceLine.product_id ?? null) ||
          (line.product_name ?? "") !== (sourceLine.product_name ?? "") ||
          line.uom !== sourceLine.uom
        )
          fail("The item and unit must match the source line.");
        let available = scaled(sourceLine.quantity, 4);
        if (committing && terms.kind !== "rfq") available -= consumed.get(`${terms.kind}:${sourceLine.id}`) ?? 0n;
        if (request) {
          const rootLine = request.lines.find(
            (item) => item.id === (source.kind === "request" ? sourceLine.id : sourceLine.source_line_id),
          );
          if (
            !rootLine ||
            scaled(line.quantity, 4) > scaled(rootLine.quantity, 4) - (rootConsumed.get(rootLine.id!) ?? 0n)
          )
            fail(
              "The ordered quantity exceeds the Purchase Request quantity still available across quotations.",
              "PURCHASE_QUANTITY_EXCEEDED",
            );
        }
        if (scaled(line.quantity, 4) > available)
          fail("The quantity exceeds the source quantity still available.", "PURCHASE_QUANTITY_EXCEEDED");
        if (terms.kind === "receipt" || terms.kind === "bill") {
          if (
            scaled(line.unit_price, 2) !== scaled(sourceLine.unit_price, 2) ||
            scaled(line.tax_percent, 2) !== scaled(sourceLine.tax_percent, 2)
          )
            fail("Receipt and bill prices and tax must match the approved Purchase Order.", "PURCHASE_PRICE_MISMATCH");
        }
        if (
          terms.kind === "bill" &&
          committing &&
          scaled(line.quantity, 4) >
            (consumed.get(`receipt:${sourceLine.id}`) ?? 0n) - (consumed.get(`bill:${sourceLine.id}`) ?? 0n)
        )
          fail("Bill quantities exceed products received and not yet billed.", "PURCHASE_RECEIPT_MATCH_REQUIRED");
      }
    }
    const total = documentTotal(terms.lines);
    if (["order", "bill"].includes(terms.kind) && total === "0.00")
      fail("A Purchase Order or bill must have a positive amount.");
    return total;
  }
  private async validatePayment(
    client: PoolClient,
    tenant: string,
    id: string | null,
    terms: SavePurchaseRequest,
    committing: boolean,
  ): Promise<string> {
    if (terms.lines.length || terms.source_id)
      fail("Payments use bill allocations rather than product lines or an order source.");
    if (!terms.allocations.length) fail("Allocate the payment to at least one approved bill.");
    if (new Set(terms.allocations.map((item) => item.bill_id)).size !== terms.allocations.length)
      fail("Select each bill once.");
    const result = await client.query(
      `select ${documentProjection} ${documentJoins} where d.tenant_id=$1 and d.company_id=$2 and d.id=any($3::text[])`,
      [tenant, terms.company_id, terms.allocations.map((item) => item.bill_id)],
    );
    const bills = new Map(
      result.rows.map((row) => {
        const bill = purchaseDocumentSchema.parse(row);
        return [bill.id, bill];
      }),
    );
    const vendors = new Set<string>();
    let total = 0n;
    for (const allocation of terms.allocations) {
      const bill = bills.get(allocation.bill_id);
      if (
        !bill ||
        bill.kind !== "bill" ||
        bill.state !== "approved" ||
        !bill.supplier_id ||
        bill.currency !== terms.currency
      )
        fail("Payments require approved bills in the selected company and currency.", "PAYMENT_BILL_INELIGIBLE");
      vendors.add(bill.supplier_id);
      const reserved = committing ? scaled(bill.reserved_amount, 2) : 0n;
      if (
        scaled(allocation.amount, 2) + scaled(allocation.discount ?? "0", 2) >
        scaled(bill.total_amount, 2) - reserved
      )
        fail("The amount exceeds the bill amount available for payment instructions.", "PAYMENT_ALLOCATION_EXCEEDED");
      total += scaled(allocation.amount, 2);
    }
    await this.requireSuppliers(client, tenant, terms.company_id, [...vendors]);
    if (terms.kind === "payment" && (vendors.size !== 1 || !terms.supplier_id || !vendors.has(terms.supplier_id)))
      fail("A Payment must allocate bills from its selected supplier.");
    if (terms.kind === "multi_payment" && (vendors.size < 2 || terms.supplier_id))
      fail("A Multi-vendor Payment requires bills from at least two suppliers.");
    if (total > 99999999999999n) fail("The payment amount exceeds the supported limit.");
    if (terms.payment_details) {
      await this.paymentBank(client, tenant, terms.company_id, terms.currency, terms.payment_details.bank_account_id);
      const entries = terms.payment_details.entries;
      if (
        new Set(entries.map((entry) => entry.supplier_id)).size !== entries.length ||
        entries.length !== vendors.size ||
        entries.some((entry) => !vendors.has(entry.supplier_id))
      )
        fail("Enter payment details once for each supplier included in the allocations.");
      let gross = 0n;
      for (const entry of entries) {
        const allocated = terms.allocations.reduce(
          (sum, allocation) =>
            sum +
            (bills.get(allocation.bill_id)?.supplier_id === entry.supplier_id ? scaled(allocation.amount, 2) : 0n),
          0n,
        );
        paymentTotals(entry, money(allocated));
        gross += scaled(entry.amount, 2);
      }
      if (gross > 99999999999999n) fail("The payment amount exceeds the supported limit.");
      return money(gross);
    }
    return money(total);
  }
  private async paymentBank(client: PoolClient, tenant: string, company: string, currency: string, id: string) {
    const result = await client.query<{ account_name: string; account_number_masked: string | null }>(
      `select bank.account_name,bank.account_number_masked from bank_account bank join account ledger
       on ledger.tenant_id=bank.tenant_id and ledger.company_id=bank.company_id and ledger.id=bank.account_id
       where bank.tenant_id=$1 and bank.company_id=$2 and bank.id=$3 and bank.currency=$4 and bank.status='active'
        and ledger.status='active' and not ledger.is_header and ledger.manual_posting_allowed and ledger.reconciliation_required for share of bank,ledger`,
      [tenant, company, id, currency],
    );
    if (!result.rows[0])
      fail("Select an active company bank account in the payment currency.", "PAYMENT_BANK_INELIGIBLE");
    return result.rows[0];
  }
  private async paymentSnapshots(
    client: PoolClient,
    tenant: string,
    company: string,
    currency: string,
    details: PurchasePaymentDetails,
  ): Promise<PurchasePaymentDetails> {
    const bank = await this.paymentBank(client, tenant, company, currency, details.bank_account_id);
    const result = await client.query<{ id: string; address: string; name: string; code: string; profile: unknown }>(
      "select id,address,name,code,profile from procurement_supplier where tenant_id=$1 and company_id=$2 and id=any($3::text[]) for share",
      [tenant, company, details.entries.map((entry) => entry.supplier_id)],
    );
    if (result.rows.length !== new Set(details.entries.map((entry) => entry.supplier_id)).size)
      fail("Select suppliers in this company.");
    return {
      bank_account_id: details.bank_account_id,
      bank_account_name: bank.account_name,
      account_number_masked: bank.account_number_masked,
      entries: details.entries.map((entry) => {
        const supplier = result.rows.find((item) => item.id === entry.supplier_id)!;
        const profile = this.readProfile(supplier.profile, tenant, company, supplier.id);
        return {
          ...entry,
          mailing_address: supplierMailingAddress({ address: supplier.address, profile }),
          supplier_name: supplier.name,
          supplier_code: supplier.code,
        };
      }),
    };
  }
  async action(
    context: ProcurementContext,
    id: string,
    input: PurchaseActionRequest,
    key: string,
    correlation: string,
  ): Promise<PurchaseMutation> {
    const parsed = purchaseActionRequestSchema.parse(input),
      fingerprint = digest({ entity: "document", id, action: parsed });
    const permission = `procurement.document.${parsed.action === "submit" ? "submit" : ["approve", "reject"].includes(parsed.action) ? "approve" : "action"}`;
    return this.transaction(context, parsed.company_id, permission, true, async (client) => {
      const replay = await this.replay(client, context, key, fingerprint);
      if (replay) return purchaseMutationSchema.parse(replay);
      const before = await this.load(client, context.tenantId, parsed.company_id, id, true);
      const payment = ["payment", "multi_payment"].includes(before.kind);
      const reason = parsed.reason || "Approved through the Purchase workflow.";
      const inherited = payment ? null : await this.requestApprover(client, context.tenantId, parsed.company_id, id);
      const approverId = inherited?.id ?? before.approver_id ?? null;
      if (before.version !== parsed.expected_version)
        fail("The Purchase record changed. Reload before acting.", "PURCHASE_VERSION_CONFLICT");
      const expected =
        parsed.action === "submit"
          ? ["draft", "rejected"]
          : parsed.action === "cancel"
            ? ["draft", "rejected", "submitted"]
            : ["submitted"];
      if (!expected.includes(before.state))
        fail("This action is not available in the current Purchase state.", "PURCHASE_STATE_CONFLICT");
      let override: string | null = null;
      const makers = [
        ...new Set([
          before.created_by,
          ...before.events
            .filter((event) => ["created", "saved", "submit"].includes(event.action))
            .map((event) => event.actor_id),
        ]),
      ];
      if (parsed.action === "submit")
        await this.requireApprover(client, context.tenantId, parsed.company_id, approverId, [
          ...makers,
          context.actor.userId,
        ]);
      if (parsed.action === "approve" || parsed.action === "reject") {
        const decision = evaluateApprovalActor({
          account: context.actor,
          makerActorIds: makers,
          normalDecisionPermission: permission,
          impersonated: !!context.realActorId,
        });
        const selfAuthority =
          makers.includes(context.actor.userId) &&
          !!(
            await client.query(companyAuthority, [
              context.tenantId,
              context.actor.userId,
              parsed.company_id,
              "procurement.document.self_approve",
            ])
          ).rowCount;
        if (decision.kind === "forbidden" && !(decision.reason === "maker_checker_required" && selfAuthority))
          fail("An independent authorized checker must decide this Purchase record.", "MAKER_CHECKER_REQUIRED", 403);
        if (approverId && approverId !== context.actor.userId && decision.kind !== "override")
          fail("Only the assigned approver can decide this Purchase record.", "PURCHASE_APPROVER_REQUIRED", 403);
        if (decision.kind === "override")
          override = (
            await writeApprovalOverrideEvent(client, {
              tenantId: context.tenantId,
              account: context.actor,
              makerActorIds: makers,
              normalDecisionPermission: permission,
              resourceType: "procurement.document",
              resourceId: id,
              decisionAction: parsed.action,
              reason,
              correlationId: correlation,
              idempotencyKey: `purchase-override-${digest({ key, id })}`,
              metadata: {
                company_id: parsed.company_id,
                expected_version: before.version,
                reason_origin: parsed.reason ? "user" : "system",
                approver_id: approverId,
              },
            })
          ).eventId;
      }
      if (["submit", "approve"].includes(parsed.action))
        await this.validate(client, context.tenantId, id, before, parsed.action === "approve");
      const instance = await this.workflow(client, context, before, parsed.action, reason);
      const state = { submit: "submitted", approve: "approved", reject: "rejected", cancel: "cancelled" }[
        parsed.action
      ];
      await client.query(
        "update procurement_document set state=$4,row_version=row_version+1,updated_by=$5,updated_at=clock_timestamp(),approval_instance_id=coalesce($6,approval_instance_id),approver_id=$7 where tenant_id=$1 and company_id=$2 and id=$3",
        [context.tenantId, parsed.company_id, id, state, context.actor.userId, instance, approverId],
      );
      const record = await this.load(client, context.tenantId, parsed.company_id, id);
      const auditId = await this.evidence(
        client,
        context,
        "document",
        id,
        parsed.company_id,
        record.version,
        parsed.action,
        reason,
        record,
        key,
        fingerprint,
        correlation,
        override,
      );
      return { record, audit_event_id: auditId };
    });
  }
  private async workflow(
    client: PoolClient,
    context: ProcurementContext,
    document: PurchaseDocument,
    action: PurchaseActionRequest["action"],
    reason: string,
  ) {
    const tenant = context.tenantId;
    if (action === "submit") {
      const definition = `procurement-${document.kind}`;
      await client.query(
        `insert into workflow_definition(id,tenant_id,module,trigger,entry_step_id,steps,version,status,created_at) values($1,$2,'procurement',$3,'review',$4,1,'active',now()) on conflict(tenant_id,id) do nothing`,
        [
          definition,
          tenant,
          `${document.kind}_approval`,
          JSON.stringify([{ id: "review", level: 1, permission: "procurement.document.approve" }]),
        ],
      );
      const instance = `purchase-approval-${randomUUID()}`;
      await client.query(
        `insert into approval_instance(id,tenant_id,workflow_definition_id,workflow_definition_version,source_type,source_id,current_step_id,requested_by,started_at,due_at,state,created_at) values($1,$2,$3,1,'procurement_document',$4,'review',$5,now(),now()+interval '7 days','pending',now())`,
        [instance, tenant, definition, document.id, context.actor.userId],
      );
      await client.query(
        `insert into approval_action(id,tenant_id,approval_instance_id,step_id,level,actor_id,action,comments,previous_state,new_state,acted_at,sequence) values($1,$2,$3,'review',1,$4,'submit',$5,'pending','pending',now(),1)`,
        [`purchase-action-${randomUUID()}`, tenant, instance, context.actor.userId, reason],
      );
      return instance;
    } else if (document.state === "submitted") {
      const found = await client.query<{ approval_instance_id: string }>(
        "select approval_instance_id from procurement_document where tenant_id=$1 and id=$2",
        [tenant, document.id],
      );
      const instance = found.rows[0]?.approval_instance_id;
      if (!instance) fail("The Purchase approval history is incomplete.", "PURCHASE_APPROVAL_UNAVAILABLE");
      const state = action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled";
      await client.query(
        "update approval_instance set state=$3,updated_at=clock_timestamp() where tenant_id=$1 and id=$2 and state='pending'",
        [tenant, instance, state],
      );
      await client.query(
        `insert into approval_action(id,tenant_id,approval_instance_id,step_id,level,actor_id,action,comments,previous_state,new_state,acted_at,sequence) values($1,$2,$3,'review',1,$4,$5,$6,'pending',$7,now(),2)`,
        [`purchase-action-${randomUUID()}`, tenant, instance, context.actor.userId, action, reason, state],
      );
    }
    return null;
  }
  private async evidence(
    client: PoolClient,
    context: ProcurementContext,
    entity: "supplier" | "document",
    id: string,
    company: string,
    version: number,
    action: string,
    reason: string,
    record: Supplier | PurchaseDocument,
    key: string,
    fingerprint: string,
    correlation: string,
    override: string | null = null,
  ) {
    const evidenceRecord =
      entity === "supplier" && "risk_status" in record
        ? { ...record, profile: this.protectProfile(record.profile, context.tenantId, company, id) }
        : record;
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const prior = await client.query<{ sequence: string; event_hash: string }>(
      "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
      [context.tenantId],
    );
    const before = await client.query<{ record: unknown }>(
      "select result->'record' as record from procurement_change where tenant_id=$1 and company_id=$2 and entity_type=$3 and entity_id=$4 and record_version=$5",
      [context.tenantId, company, entity, id, version - 1],
    );
    const event = {
      id: `audit-${randomUUID()}`,
      tenant_id: context.tenantId,
      sequence: Number(prior.rows[0]?.sequence ?? 0) + 1,
      actor_id: context.actor.userId,
      correlation_id: correlation,
      action: `procurement.${entity}.${action}`,
      entity_type: `procurement_${entity}`,
      entity_id: id,
      before_hash: digest(before.rows[0]?.record ?? null),
      after_hash: digest(evidenceRecord),
      source_reference: `company:${company}`,
      approval_reference: override,
      occurred_at: new Date().toISOString(),
      previous_event_hash: prior.rows[0]?.event_hash ?? digest({ genesis: context.tenantId }),
    };
    await client.query(
      `insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [...Object.values(event), digest(event)],
    );
    await client.query(
      `insert into procurement_change(tenant_id,company_id,id,entity_type,entity_id,record_version,actor_id,action,reason,audit_event_id,approval_override_event_id,idempotency_key,request_sha256,snapshot,result)
      select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,to_jsonb(r),$14::jsonb from procurement_${entity} r where r.tenant_id=$1 and r.company_id=$2 and r.id=$5`,
      [
        context.tenantId,
        company,
        randomUUID(),
        entity,
        id,
        version,
        context.actor.userId,
        action,
        reason,
        event.id,
        override,
        key,
        fingerprint,
        JSON.stringify({ record: evidenceRecord, audit_event_id: event.id }),
      ],
    );
    return event.id;
  }
}
