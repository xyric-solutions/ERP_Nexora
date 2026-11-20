import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import {
  salesLookupQuerySchema,
  salesDocumentInputSchema,
  salesQuerySchema,
  salesDirectorySchema,
  salesOverviewSchema,
  salesDetailSchema,
  salesDocumentSchema,
  salesActionSchema,
  salesDerivedDraftInputSchema,
  salesStockPrepareSchema,
  salesSourcePrepareSchema,
  stockMovementInputSchema,
  type SalesAction,
  type SalesDerivedDraftInput,
  type SalesLookupQuery,
  type SalesDocumentInput,
  type SalesQuery,
  type SalesDetail,
} from "@nexora/contracts";
import type { ReferenceMasterContext } from "../master-data/source-repository.js";
import {
  operationalTransaction,
  operationalFailure as fail,
  operationalAudit,
  operationalDigest,
} from "../shared/operational-transaction.js";
import { lookupSales } from "./masters.js";
import { canonicalSales } from "./normalize.js";
import { loadSalesSource, loadSalesDocument, salesDocumentSelect } from "./records.js";
import { changeSalesState } from "./actions.js";
import { deriveSalesDraft } from "./derive.js";
import { salesNavigation } from "./overview.js";
import { SourceStockRepository } from "../inventory/stock-repository.js";
import { productUnitChoices } from "../inventory/units-repository.js";
import { SourceSubledgerRepository } from "../finance/subledger/source-repository.js";

/** Sales owns commercial sources; Inventory/Finance retain all posting effects. */
export class SourceSalesRepository {
  constructor(
    readonly pool: Pool,
    private readonly stock = new SourceStockRepository(pool),
    private readonly finance = new SourceSubledgerRepository(pool),
  ) {}
  private transaction<T>(
    context: ReferenceMasterContext,
    company: string,
    permission: string,
    write: boolean,
    work: (client: PoolClient) => Promise<T>,
  ) {
    return operationalTransaction(this.pool, context, company, permission, write, work);
  }
  private async snapshot(client: PoolClient, tenant: string, company: string, id: string) {
    return (
      await client.query<{ snapshot: unknown }>("select sales_document_snapshot($1,$2,$3) snapshot", [
        tenant,
        company,
        id,
      ])
    ).rows[0]!.snapshot;
  }
  private async audit(
    client: PoolClient,
    context: ReferenceMasterContext,
    company: string,
    id: string,
    version: number,
    action: string,
    reason: string,
    before: unknown,
    correlation: string,
  ) {
    const snapshot = await this.snapshot(client, context.tenantId, company, id);
    const event = await operationalAudit(client, context, {
      company,
      entity: "sales_document",
      id,
      action: `sales.document.${action}`,
      before,
      after: snapshot,
      correlation,
    });
    await client.query(
      "insert into sales_document_audit(tenant_id,company_id,id,document_id,version,actor_id,action,reason,snapshot,audit_event_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)",
      [
        context.tenantId,
        company,
        randomUUID(),
        id,
        version,
        context.actor.userId,
        action,
        reason,
        JSON.stringify(snapshot),
        event,
      ],
    );
  }
  private async detail(client: PoolClient, tenant: string, company: string, id: string): Promise<SalesDetail> {
    const record = await loadSalesDocument(client, tenant, company, id);
    const events = (
      await client.query(
        "select e.id,e.actor_id,coalesce(nullif(btrim(u.display_name),''),u.id) actor_name,e.action,e.reason,e.version,e.occurred_at::text from sales_document_audit e join security_user_account u on(u.tenant_id,u.id)=(e.tenant_id,e.actor_id) where e.tenant_id=$1 and e.company_id=$2 and e.document_id=$3 order by e.version desc limit 100",
        [tenant, company, id],
      )
    ).rows;
    const linked = (
      await client.query(
        "select id,code,kind,state from sales_document where tenant_id=$1 and company_id=$2 and(source_id=$3 or template_id=$3 or id=$4) order by document_date,code limit 100",
        [tenant, company, id, record.source_id],
      )
    ).rows;
    return salesDetailSchema.parse({ record, events, linked });
  }
  get(context: ReferenceMasterContext, company: string, id: string) {
    return this.transaction(context, company, "sales.document.read", false, (client) =>
      this.detail(client, context.tenantId, company, id),
    );
  }
  list(context: ReferenceMasterContext, raw: SalesQuery) {
    const query = salesQuerySchema.parse(raw),
      pattern = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
    return this.transaction(context, query.company_id, "sales.document.read", false, async (client) => {
      const params = [
        context.tenantId,
        query.company_id,
        query.kind,
        pattern,
        query.state ?? null,
        query.customer_id ?? null,
      ];
      const filter =
        "d.tenant_id=$1 and d.company_id=$2 and d.kind=$3 and(d.code ilike $4 escape '\\' or d.details->>'reference' ilike $4 escape '\\' or p.name ilike $4 escape '\\') and($5::text is null or d.state=$5) and($6::text is null or d.customer_id=$6)";
      const rows = (
        await client.query<{ record: unknown }>(
          `${salesDocumentSelect} where ${filter} order by d.document_date desc,d.created_at desc,d.id limit $7 offset $8`,
          [...params, query.limit, query.offset],
        )
      ).rows;
      const total = (
        await client.query<{ n: number }>(
          `select count(*)::int n from sales_document d left join finance_party_directory p on(p.tenant_id,p.company_id,p.id)=(d.tenant_id,d.company_id,d.customer_id) where ${filter}`,
          params,
        )
      ).rows[0]!.n;
      return salesDirectorySchema.parse({ items: rows.map((row) => salesDocumentSchema.parse(row.record)), total });
    });
  }
  lookups(context: ReferenceMasterContext, raw: SalesLookupQuery) {
    const query = salesLookupQuerySchema.parse(raw);
    return operationalTransaction(this.pool, context, query.company_id, "sales.document.read", false, (client) =>
      lookupSales(client, context.tenantId, query),
    );
  }
  overview(context: ReferenceMasterContext, company: string, asOf?: string) {
    return this.transaction(context, company, "sales.document.read", false, async (client) => {
      const counts = (
        await client.query(
          "select kind,state,count(*)::int count from sales_document where tenant_id=$1 and company_id=$2 group by kind,state",
          [context.tenantId, company],
        )
      ).rows;
      const notices = (
        await client.query(
          `select e.id,d.id document_id,d.code,d.kind,e.action,e.occurred_at::text at,coalesce(nullif(btrim(u.display_name),''),u.id) actor_name
        from sales_document d join sales_document_audit e on(e.tenant_id,e.company_id,e.document_id,e.version)=(d.tenant_id,d.company_id,d.id,d.row_version)
        join security_user_account u on(u.tenant_id,u.id)=(e.tenant_id,e.actor_id)
        where d.tenant_id=$1 and d.company_id=$2 and((d.approver_id=$3 and d.state='submitted' and e.action='submit') or(d.maker_id=$3 and e.action in('approve','reject')))
        order by e.occurred_at desc,e.id limit 100`,
          [context.tenantId, company, context.actor.userId],
        )
      ).rows;
      return salesOverviewSchema.parse({
        counts,
        notices,
        navigation_counts: await salesNavigation(client, context.tenantId, company, asOf),
      });
    });
  }
  productUnits(context: ReferenceMasterContext, company: string, id: string) {
    return this.transaction(context, company, "sales.document.read", false, async (client) => {
      if (
        !(
          await client.query(
            "select 1 from inventory_product where(tenant_id,company_id,id)=($1,$2,$3) and status='active' and details->>'sales_enabled'='true'",
            [context.tenantId, company, id],
          )
        ).rowCount
      )
        fail("Choose an active sales-enabled company product.", "SALES_PRODUCT_INELIGIBLE");
      return (await productUnitChoices(client, context.tenantId, company, [id], false, false)).get(id)!;
    });
  }
  private async idempotent(
    client: PoolClient,
    context: ReferenceMasterContext,
    company: string,
    key: string,
    body: unknown,
    work: () => Promise<SalesDetail>,
  ) {
    if (!key.trim() || key.length > 255)
      fail("Supply a request identity of 1–255 characters.", "IDEMPOTENCY_KEY_REQUIRED", 400);
    const hash = operationalDigest(body),
      prior = (
        await client.query<{ request_hash: string; result: unknown }>(
          "select request_hash,result from sales_request where tenant_id=$1 and company_id=$2 and actor_id=$3 and idempotency_key=$4",
          [context.tenantId, company, context.actor.userId, key],
        )
      ).rows[0];
    if (prior) {
      if (prior.request_hash !== hash)
        fail("This request identity was used for different commercial data.", "IDEMPOTENCY_CONFLICT");
      return salesDetailSchema.parse(prior.result);
    }
    const result = await work();
    await client.query(
      "insert into sales_request(tenant_id,company_id,actor_id,idempotency_key,request_hash,result) values($1,$2,$3,$4,$5,$6::jsonb)",
      [context.tenantId, company, context.actor.userId, key, hash, JSON.stringify(result)],
    );
    return result;
  }
  save(context: ReferenceMasterContext, id: string | null, raw: SalesDocumentInput, key: string, correlation: string) {
    const input = salesDocumentInputSchema.parse(raw);
    return this.transaction(context, input.company_id, "sales.document.create", true, (client) =>
      this.idempotent(client, context, input.company_id, key, { id, input }, async () => {
        const tenant = context.tenantId,
          company = input.company_id;
        if (id)
          await client.query("select id from sales_document where(tenant_id,company_id,id)=($1,$2,$3) for update", [
            tenant,
            company,
            id,
          ]);
        const previous = id ? await loadSalesSource(client, tenant, company, id) : undefined;
        if (previous && (previous.maker_id !== context.actor.userId || !["draft", "rejected"].includes(previous.state)))
          fail("Only the authorized maker can change an unapproved commercial draft.", "SALES_DRAFT_LOCKED", 403);
        if (previous && (input.expected_version !== previous.version || input.kind !== previous.kind))
          fail("The commercial version or kind changed. Reload before saving.", "STALE_VERSION");
        if (!previous && input.expected_version !== undefined)
          fail("A new document cannot claim an existing version.", "STALE_VERSION");
        const docId = id ?? `sales-${randomUUID()}`,
          version = (previous?.version ?? 0) + 1,
          before = previous ? await this.snapshot(client, tenant, company, docId) : null;
        const normalized = await canonicalSales(client, context, docId, input, previous),
          a = normalized.authority,
          canonical = normalized.input;
        const details = {
          reference: canonical.reference,
          notes: canonical.notes,
          no_tax_reason: canonical.no_tax_reason,
          discount_amount: canonical.discount_amount,
          payment_term: canonical.payment_term,
          valid_until: canonical.valid_until,
          recurrence: canonical.recurrence,
          readiness: normalized.readiness,
          source_version: normalized.sourceVersion,
          template_version: normalized.templateVersion,
        };
        const data = {
          customer_id: canonical.customer_id,
          source_id: canonical.source_id,
          template_id: canonical.template_id,
          billing_period: canonical.billing_period,
          document_date: canonical.document_date,
          due_date: canonical.due_date,
          currency: canonical.currency,
          base_currency: a.baseCurrency,
          decimal_places: a.sourceDecimalPlaces,
          project_id: canonical.project_id,
          location_id: canonical.location_id,
          warehouse_id: canonical.warehouse_id,
          approver_id: canonical.approver_id,
          net_amount: normalized.net,
          tax_amount: normalized.tax,
          total_amount: normalized.total,
          exchange_rate_id: a.rateId,
          exchange_rate: a.rateValue,
          exchange_rate_date: a.rateEffectiveDate,
          details: JSON.stringify(details),
        };
        const columns = Object.keys(data),
          values = Object.values(data);
        if (previous) {
          await client.query(
            `update sales_document set ${columns.map((name, i) => `${name}=$${i + 4}`).join(",")},state='draft',row_version=row_version+1,updated_by=$${values.length + 4},updated_at=clock_timestamp() where(tenant_id,company_id,id)=($1,$2,$3)`,
            [tenant, company, docId, ...values, context.actor.userId],
          );
          await client.query(
            "update sales_document_line set active=false where tenant_id=$1 and company_id=$2 and document_id=$3 and active and not(id=any($4::text[]))",
            [tenant, company, docId, normalized.lines.map((line) => line.value.id)],
          );
        } else {
          const prefix = {
            quotation: "QTN",
            order: "SO",
            delivery: "DLV",
            invoice: "INV",
            return: "SR",
            credit: "SCN",
            recurring: "RB",
          }[canonical.kind];
          const next = (
            await client.query<{ n: string }>(
              "select(coalesce(max((split_part(code,'-',2))::numeric),0)+1)::text n from sales_document where tenant_id=$1 and company_id=$2 and kind=$3",
              [tenant, company, canonical.kind],
            )
          ).rows[0]!.n;
          const code = `${prefix}-${next.padStart(3, "0")}`;
          const insertColumns = ["tenant_id", "company_id", "id", "kind", "code", "maker_id", "updated_by", ...columns];
          await client.query(
            `insert into sales_document(${insertColumns.join(",")}) values(${insertColumns.map((_, i) => `$${i + 1}`).join(",")})`,
            [tenant, company, docId, canonical.kind, code, context.actor.userId, context.actor.userId, ...values],
          );
        }
        for (const [index, entry] of normalized.lines.entries()) {
          const line = entry.value,
            fields = {
              line_no: index + 1,
              product_id: line.product_id,
              source_document_id: line.source_line_id ? canonical.source_id : null,
              source_line_id: line.source_line_id,
              template_document_id: line.template_line_id ? canonical.template_id : null,
              template_line_id: line.template_line_id,
              fulfillment_source_id: line.fulfillment_source_id,
              fulfillment_source_line_id: line.fulfillment_source_line_id,
              description: line.description,
              quantity: line.quantity,
              base_quantity: line.base_quantity,
              unit_id: line.unit_id!,
              unit_snapshot: JSON.stringify(line.unit_snapshot),
              product_snapshot: JSON.stringify(entry.product),
              unit_price: line.unit_price,
              discount_amount: line.discount_amount,
              allocated_discount_amount: line.allocated_discount_amount,
              net_amount: line.net_amount,
              tax_amount: line.tax_amount,
              total_amount: line.total_amount,
              tax_definition_id: line.tax_definition_id,
              tax_snapshot: line.tax_snapshot ? JSON.stringify(line.tax_snapshot) : null,
              dimensions: JSON.stringify(line.dimensions),
            };
          const names = ["tenant_id", "company_id", "document_id", "id", ...Object.keys(fields)],
            parameters = [tenant, company, docId, line.id, ...Object.values(fields)];
          await client.query(
            `insert into sales_document_line(${names.join(",")}) values(${names.map((_, i) => `$${i + 1}`).join(",")}) on conflict(tenant_id,company_id,document_id,id) do update set ${Object.keys(
              fields,
            )
              .map((name) => `${name}=excluded.${name}`)
              .join(",")}`,
            parameters,
          );
        }
        await this.audit(
          client,
          context,
          company,
          docId,
          version,
          previous ? "saved" : "created",
          previous ? "Saved reviewed commercial draft changes" : "Created commercial source draft",
          before,
          correlation,
        );
        return this.detail(client, tenant, company, docId);
      }),
    );
  }
  action(context: ReferenceMasterContext, id: string, raw: SalesAction, key: string, correlation: string) {
    const input = salesActionSchema.parse(raw);
    return this.transaction(context, input.company_id, "sales.document.read", true, (client) =>
      this.idempotent(client, context, input.company_id, key, { id, ...input }, async () => {
        await client.query("select id from sales_document where(tenant_id,company_id,id)=($1,$2,$3) for update", [
          context.tenantId,
          input.company_id,
          id,
        ]);
        const source = await loadSalesSource(client, context.tenantId, input.company_id, id);
        const before = await this.snapshot(client, context.tenantId, input.company_id, id);
        await changeSalesState(client, context, source, input);
        await this.audit(
          client,
          context,
          input.company_id,
          id,
          source.version + 1,
          input.action,
          input.reason,
          before,
          correlation,
        );
        return this.detail(client, context.tenantId, input.company_id, id);
      }),
    );
  }
  derive(context: ReferenceMasterContext, id: string, raw: SalesDerivedDraftInput) {
    const input = salesDerivedDraftInputSchema.parse(raw);
    return this.transaction(context, input.company_id, "sales.document.create", false, async (client) =>
      deriveSalesDraft(
        client,
        context.tenantId,
        await loadSalesSource(client, context.tenantId, input.company_id, id),
        input,
      ),
    );
  }
  prepareAccounting(
    context: ReferenceMasterContext,
    id: string,
    raw: z.input<typeof salesSourcePrepareSchema>,
    key: string,
  ) {
    return this.finance.prepareSales(context, id, raw, key);
  }
  async prepareStock(
    context: ReferenceMasterContext,
    id: string,
    raw: z.input<typeof salesStockPrepareSchema>,
    key: string,
    correlation: string,
  ) {
    const input = salesStockPrepareSchema.parse(raw);
    const proposal = await this.transaction(context, input.company_id, "sales.document.read", false, async (client) => {
      const source = await loadSalesSource(client, context.tenantId, input.company_id, id);
      if (source.version !== input.expected_version)
        fail("The commercial source changed. Reload before preparing stock.", "STALE_VERSION");
      if (source.state !== "approved" || !["delivery", "return"].includes(source.kind) || !source.warehouse_id)
        fail(
          "Prepare physical accounting from an approved delivery or return with its actual warehouse.",
          "SALES_STOCK_SOURCE_INVALID",
        );
      return stockMovementInputSchema.parse({
        company_id: source.company_id,
        kind: source.kind,
        source_id: source.id,
        source_version: source.version,
        warehouse_id: source.warehouse_id,
        date: input.date,
        reference: source.code,
        reason: input.reason,
        dimensions: { project: source.project_id, location: source.location_id },
      });
    });
    // The Stock transaction re-attests the version; never nest company write locks.
    return this.stock.create(context, proposal, key, correlation);
  }
}
