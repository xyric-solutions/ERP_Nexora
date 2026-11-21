import { productionExpenseLookup, postProductionAllocations } from "./production-costs.js";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  stockPolicyInputSchema,
  stockPolicySchema,
  stockValuationInputSchema,
  stockValuationSchema,
  stockMovementInputSchema,
  stockActionSchema,
  stockOperationSchema,
  stockWorkspaceSchema,
  type StockPolicyInput,
  type StockValuationInput,
  type StockMovementInput,
  type StockAction,
  type StockQuery,
  type StockOperation,
  type StockPreview,
  stockLookupDirectorySchema,
  type StockLookupQuery,
} from "@nexora/contracts";
import type { InventoryContext } from "./source-repository.js";
import {
  operationalTransaction,
  operationalFailure as fail,
  operationalDigest,
  operationalAudit,
} from "../shared/operational-transaction.js";
import { FinancePostingService } from "../finance/posting/service.js";
import { createFinanceTransactionClient } from "../finance/posting/types.js";
import { resolveCompanyBaseCurrency } from "../finance/currencies/company-authority.js";
import { buildStockPreview } from "./stock-preview.js";

const operationProjection =
  "id,company_id,code,kind,movement_date::text as date,state,version,maker_id,approver_id,poster_id,journal_id,accounting_event_id,payload as input,preview";
export class SourceStockRepository {
  constructor(
    readonly pool: Pool,
    private readonly finance = new FinancePostingService(),
  ) {}
  private transaction<T>(
    context: InventoryContext,
    company: string,
    permission: string,
    write: boolean,
    work: (client: PoolClient) => Promise<T>,
  ) {
    return operationalTransaction(this.pool, context, company, permission, write, work);
  }
  private async idempotent<T>(
    client: PoolClient,
    context: InventoryContext,
    company: string,
    key: string,
    input: unknown,
    parse: (value: unknown) => T,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      fail("A valid idempotency key is required.", "INVALID_IDEMPOTENCY_KEY", 400);
    const fingerprint = operationalDigest(input);
    const old = (
      await client.query<{ request_hash: string; result: unknown }>(
        "select request_hash,result from inventory_stock_request where tenant_id=$1 and company_id=$2 and actor_id=$3 and idempotency_key=$4",
        [context.tenantId, company, context.actor.userId, key],
      )
    ).rows[0];
    if (old) {
      if (old.request_hash !== fingerprint)
        fail("This request key was used with different stock data.", "IDEMPOTENCY_CONFLICT");
      return parse(old.result);
    }
    const result = await work();
    await client.query(
      "insert into inventory_stock_request(tenant_id,company_id,actor_id,idempotency_key,request_hash,result) values($1,$2,$3,$4,$5,$6::jsonb)",
      [context.tenantId, company, context.actor.userId, key, fingerprint, JSON.stringify(result)],
    );
    return result;
  }
  private async snapshot(
    client: PoolClient,
    tenant: string,
    company: string,
    entity: "policy" | "valuation" | "operation",
    id: string,
    version?: number,
  ) {
    const sql =
      entity === "policy"
        ? "select to_jsonb(x) as snapshot from inventory_stock_policy x where tenant_id=$1 and company_id=$2 and company_id=$3 and version=$4"
        : entity === "valuation"
          ? "select to_jsonb(x) as snapshot from inventory_stock_valuation x where tenant_id=$1 and company_id=$2 and product_id=$3 and version=$4"
          : "select to_jsonb(x) as snapshot from inventory_stock_operation x where tenant_id=$1 and company_id=$2 and id=$3 and version=$4";
    return (await client.query<{ snapshot: unknown }>(sql, [tenant, company, id, version])).rows[0]?.snapshot;
  }
  private async audit(
    client: PoolClient,
    context: InventoryContext,
    company: string,
    entity: "policy" | "valuation" | "operation",
    id: string,
    version: number,
    action: string,
    reason: string,
    before: unknown,
    correlation: string,
  ) {
    const after = await this.snapshot(client, context.tenantId, company, entity, id, version);
    if (!after) fail("Stock audit source was not found.", "STOCK_AUDIT_SOURCE", 500);
    const auditId = await operationalAudit(client, context, {
      company,
      entity: `inventory_stock_${entity}`,
      id,
      action: `inventory.stock.${entity}.${action}`,
      before: before ?? null,
      after,
      correlation,
    });
    await client.query(
      "insert into inventory_stock_audit(tenant_id,company_id,id,entity_type,entity_id,version,actor_id,action,reason,snapshot,audit_event_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)",
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
        JSON.stringify(after),
        auditId,
      ],
    );
  }
  async configure(context: InventoryContext, raw: StockPolicyInput, key: string, correlation: string) {
    const input = stockPolicyInputSchema.parse(raw);
    return this.transaction(context, input.company_id, "inventory.stock.configure", true, (client) =>
      this.idempotent(
        client,
        context,
        input.company_id,
        key,
        input,
        (v) => stockPolicySchema.parse(v),
        async () => {
          const prior =
            (
              await client.query<{ version: number }>(
                "select version from inventory_stock_policy where tenant_id=$1 and company_id=$2 order by version desc limit 1",
                [context.tenantId, input.company_id],
              )
            ).rows[0]?.version ?? 0;
          if (prior !== input.expected_version)
            fail("The stock accounting policy changed. Reload before saving.", "STALE_VERSION");
          const before = prior
            ? await this.snapshot(client, context.tenantId, input.company_id, "policy", input.company_id, prior)
            : null;
          const result = (
            await client.query(
              "insert into inventory_stock_policy(tenant_id,company_id,version,receipt_accrual_account_id,opening_account_id,wip_account_id,variance_account_id,reason,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning company_id,version,receipt_accrual_account_id,opening_account_id,wip_account_id,variance_account_id,reason",
              [
                context.tenantId,
                input.company_id,
                prior + 1,
                input.receipt_accrual_account_id,
                input.opening_account_id,
                input.wip_account_id,
                input.variance_account_id,
                input.reason,
                context.actor.userId,
              ],
            )
          ).rows[0];
          await this.audit(
            client,
            context,
            input.company_id,
            "policy",
            input.company_id,
            prior + 1,
            "configured",
            input.reason,
            before,
            correlation,
          );
          return stockPolicySchema.parse(result);
        },
      ),
    );
  }
  async configureValuation(context: InventoryContext, raw: StockValuationInput, key: string, correlation: string) {
    const input = stockValuationInputSchema.parse(raw);
    return this.transaction(context, input.company_id, "inventory.stock.configure", true, (client) =>
      this.idempotent(
        client,
        context,
        input.company_id,
        key,
        input,
        (v) => stockValuationSchema.parse(v),
        async () => {
          const prior =
            (
              await client.query<{ version: number }>(
                "select version from inventory_stock_valuation where tenant_id=$1 and company_id=$2 and product_id=$3 order by version desc limit 1",
                [context.tenantId, input.company_id, input.product_id],
              )
            ).rows[0]?.version ?? 0;
          if (prior !== input.expected_version)
            fail("This product valuation configuration changed. Reload before saving.", "STALE_VERSION");
          const before = prior
            ? await this.snapshot(client, context.tenantId, input.company_id, "valuation", input.product_id, prior)
            : null;
          const product = (
            await client.query<{ code: string; name: string; stock_account_id: string | null }>(
              "select code,name,stock_account_id from inventory_product where tenant_id=$1 and company_id=$2 and id=$3",
              [context.tenantId, input.company_id, input.product_id],
            )
          ).rows[0];
          if (!product?.stock_account_id)
            fail(
              "Configure this product's real stock asset account before reviewing its valuation.",
              "STOCK_PRODUCT_ACCOUNT_REQUIRED",
            );
          await client.query(
            "insert into inventory_stock_valuation(tenant_id,company_id,product_id,version,method,stock_account_id,reason,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              context.tenantId,
              input.company_id,
              input.product_id,
              prior + 1,
              input.method,
              product.stock_account_id,
              input.reason,
              context.actor.userId,
            ],
          );
          await this.audit(
            client,
            context,
            input.company_id,
            "valuation",
            input.product_id,
            prior + 1,
            "configured",
            input.reason,
            before,
            correlation,
          );
          return stockValuationSchema.parse({
            company_id: input.company_id,
            product_id: input.product_id,
            method: input.method,
            reason: input.reason,
            version: prior + 1,
            product_code: product.code,
            product_name: product.name,
            stock_account_id: product.stock_account_id,
          });
        },
      ),
    );
  }
  async load(client: PoolClient, tenant: string, company: string, id: string, lock = false): Promise<StockOperation> {
    const result = (
      await client.query(
        `select ${operationProjection} from inventory_stock_operation where tenant_id=$1 and company_id=$2 and id=$3 ${lock ? "for update" : ""}`,
        [tenant, company, id],
      )
    ).rows[0];
    if (!result) fail("The stock operation was not found in this company.", "STOCK_NOT_FOUND", 404);
    return stockOperationSchema.parse(result);
  }
  get(context: InventoryContext, company: string, id: string) {
    return this.transaction(context, company, "inventory.stock.read", false, (client) =>
      this.load(client, context.tenantId, company, id),
    );
  }
  lookups(context: InventoryContext, query: StockLookupQuery) {
    return this.transaction(context, query.company_id, "inventory.stock.read", false, async (client) => {
      if (query.kind === "production_expense") return productionExpenseLookup(client, context, query);
      const sourcePermission =
        query.kind === "receipt"
          ? "procurement.document.read"
          : query.kind === "manufacturing_order" || query.kind === "manufacturing_issue"
            ? "manufacturing.order.read"
            : null;
      if (
        sourcePermission &&
        (!context.actor.permissions.includes(sourcePermission) ||
          !(
            await client.query("select 1 where bank_has_live_permission($1,$2,$3,$4)", [
              context.tenantId,
              query.company_id,
              context.actor.userId,
              sourcePermission,
            ])
          ).rowCount)
      )
        fail(
          "Read permission for the source module is required in this company.",
          "STOCK_SOURCE_PERMISSION_REQUIRED",
          403,
        );
      const source =
        query.kind === "product"
          ? {
              select: "id,code,name,details->>'unit' as unit,type,stock_account_id",
              table: "inventory_product",
              filter: "status='active' and type='goods' and details->>'track_inventory'='true'",
            }
          : query.kind === "warehouse"
            ? {
                select: "id,code,name,null::text as unit,null::text as type,null::text as stock_account_id",
                table: "inventory_warehouse",
                filter: "status='active'",
              }
            : query.kind === "receipt"
              ? {
                  select: "id,code,reference as name,null::text as unit,kind as type,null::text as stock_account_id",
                  table: "procurement_document",
                  filter: "kind='receipt' and state='approved'",
                }
              : query.kind === "transfer"
                ? {
                    select:
                      "id,code,reference as name,null::text as unit,'transfer'::text as type,null::text as stock_account_id",
                    table: "inventory_transfer",
                    filter: "state='draft'",
                  }
                : query.kind === "manufacturing_order"
                  ? {
                      select:
                        "id,code,notes as name,unit,'manufacturing_order'::text as type,null::text as stock_account_id",
                      table: "manufacturing_order",
                      filter: "state='approved'",
                    }
                  : query.kind === "manufacturing_issue" || query.kind === "reversal"
                    ? {
                        select:
                          "id,code,coalesce(payload->>'reference','') as name,null::text as unit,kind as type,null::text as stock_account_id",
                        table: "inventory_stock_operation",
                        filter:
                          query.kind === "manufacturing_issue"
                            ? "kind='manufacturing_issue' and state='posted'"
                            : "kind<>'reversal' and state='posted'",
                      }
                    : {
                        select: "id,code,name,null::text as unit,type,null::text as stock_account_id",
                        table: "account",
                        filter:
                          "status='active' and not is_header and manual_posting_allowed and not reconciliation_required and not managed_bank_nominal and not finance_is_subledger_control(tenant_id,company_id,id)",
                      };
      const pattern = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
      const candidates = `select ${source.select} from ${source.table} where tenant_id=$1 and company_id=$2 and ${source.filter}`;
      const filter = "(code ilike $3 escape '\\' or name ilike $3 escape '\\') and($4::text is null or type=$4)";
      const args = [
        context.tenantId,
        query.company_id,
        pattern,
        query.kind === "account" ? (query.account_type ?? null) : null,
      ];
      const items = (
        await client.query(`select * from(${candidates})s where ${filter} order by code,id limit $5 offset $6`, [
          ...args,
          query.limit,
          query.offset,
        ])
      ).rows;
      const total = (
        await client.query<{ n: number }>(`select count(*)::int as n from(${candidates})s where ${filter}`, args)
      ).rows[0]!.n;
      return stockLookupDirectorySchema.parse({ items, total });
    });
  }
  create(context: InventoryContext, raw: StockMovementInput, key: string, correlation: string) {
    const input = stockMovementInputSchema.parse(raw);
    return this.transaction(context, input.company_id, "inventory.stock.manage", true, (client) =>
      this.idempotent(
        client,
        context,
        input.company_id,
        key,
        input,
        (v) => stockOperationSchema.parse(v),
        async () => {
          // A new source claim is explicit; opening the source screen never creates it.
          if ("source_id" in input && ["receipt", "transfer", "delivery", "return"].includes(input.kind)) {
            const old = (
              await client.query<{ id: string; payload: unknown }>(
                "select id,payload from inventory_stock_operation where tenant_id=$1 and company_id=$2 and kind=$3 and payload->>'source_id'=$4 and state not in('cancelled','reversed')",
                [context.tenantId, input.company_id, input.kind, input.source_id],
              )
            ).rows[0];
            if (old) {
              if (operationalDigest(old.payload) !== operationalDigest(input))
                fail(
                  "This source already has different stock preparation. Review it before creating another.",
                  "STOCK_SOURCE_EXISTS",
                );
              return this.load(client, context.tenantId, input.company_id, old.id);
            }
          }
          if (input.kind === "reversal") {
            const old = (
              await client.query<{ id: string; payload: unknown }>(
                "select id,payload from inventory_stock_operation where tenant_id=$1 and company_id=$2 and kind='reversal' and payload->>'operation_id'=$3 and state<>'cancelled'",
                [context.tenantId, input.company_id, input.operation_id],
              )
            ).rows[0];
            if (old) {
              if (operationalDigest(old.payload) !== operationalDigest(input))
                fail(
                  "This stock source already has a different reversal draft. Review or cancel that draft first.",
                  "STOCK_REVERSAL_EXISTS",
                );
              return this.load(client, context.tenantId, input.company_id, old.id);
            }
          }
          const number = (
            await client.query<{ next: string }>(
              "select (coalesce(max(substring(code from 5)::bigint),0)+1)::text as next from inventory_stock_operation where tenant_id=$1 and company_id=$2",
              [context.tenantId, input.company_id],
            )
          ).rows[0]!.next;
          const id = `stock-${randomUUID()}`,
            code = `STK-${number.padStart(3, "0")}`;
          await client.query(
            "insert into inventory_stock_operation(tenant_id,company_id,id,code,kind,movement_date,payload,maker_id) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8)",
            [
              context.tenantId,
              input.company_id,
              id,
              code,
              input.kind,
              input.date,
              JSON.stringify(input),
              context.actor.userId,
            ],
          );
          await this.audit(
            client,
            context,
            input.company_id,
            "operation",
            id,
            1,
            "created",
            input.reason,
            null,
            correlation,
          );
          return this.load(client, context.tenantId, input.company_id, id);
        },
      ),
    );
  }
  action(context: InventoryContext, id: string, raw: StockAction, key: string, correlation: string) {
    const input = stockActionSchema.parse(raw);
    const permission =
      input.action === "post"
        ? "inventory.stock.post"
        : ["approve", "reject"].includes(input.action)
          ? "inventory.stock.approve"
          : "inventory.stock.manage";
    return this.transaction(context, input.company_id, permission, true, (client) =>
      this.idempotent(
        client,
        context,
        input.company_id,
        key,
        { id, ...input },
        (v) => stockOperationSchema.parse(v),
        async () => {
          const op = await this.load(client, context.tenantId, input.company_id, id, true);
          if (op.version !== input.expected_version)
            fail("The stock operation changed. Reload before acting.", "STALE_VERSION");
          const actor = context.actor.userId;
          const before = await this.snapshot(client, context.tenantId, input.company_id, "operation", id, op.version);
          if (["submit", "cancel"].includes(input.action) && actor !== op.maker_id)
            fail("Only this stock draft's maker can submit or cancel it.", "STOCK_MAKER_REQUIRED", 403);
          if (["approve", "reject", "post"].includes(input.action) && actor === op.maker_id)
            fail(
              "An independent authorized user must review or post this stock movement.",
              "STOCK_INDEPENDENT_ACTOR_REQUIRED",
              403,
            );
          let state: StockOperation["state"],
            preview = op.preview;
          if (input.action === "submit") {
            if (!["draft", "rejected"].includes(op.state))
              fail("Only a draft or rejected stock movement can be submitted.", "STOCK_STATE_CONFLICT");
            preview = await buildStockPreview(client, context, op);
            state = "submitted";
          } else if (input.action === "approve" || input.action === "post") {
            if (op.state !== (input.action === "approve" ? "submitted" : "approved"))
              fail("This stock movement is not at the required approval/posting stage.", "STOCK_STATE_CONFLICT");
            const fresh = await buildStockPreview(client, context, op);
            if (operationalDigest(fresh) !== operationalDigest(op.preview))
              fail(
                "Stock, source, rate or configuration evidence changed. Reject and resubmit for fresh review.",
                "STOCK_REVIEW_STALE",
              );
            preview = fresh;
            state = input.action === "approve" ? "approved" : "posted";
          } else if (input.action === "reject") {
            if (!["submitted", "approved"].includes(op.state))
              fail("Only a submitted or approved movement can be rejected.", "STOCK_STATE_CONFLICT");
            state = "rejected";
          } else {
            if (!["draft", "rejected"].includes(op.state))
              fail("Only an unsubmitted draft can be cancelled.", "STOCK_STATE_CONFLICT");
            state = "cancelled";
          }
          if (state === "posted") {
            if (!preview || !op.approver_id) fail("Approved stock evidence is required.");
            if (
              !(
                await client.query(
                  "select 1 where bank_has_live_permission($1,$2,$3,'inventory.stock.approve') and bank_has_live_permission($1,$2,$4,'inventory.stock.manage')",
                  [context.tenantId, input.company_id, op.approver_id, op.maker_id],
                )
              ).rowCount
            )
              fail(
                "The stock maker or approver no longer has live authority.",
                "STOCK_APPROVAL_AUTHORITY_CHANGED",
                403,
              );
            await this.post(client, context, op, preview, input.reason, correlation);
          } else {
            await client.query(
              "update inventory_stock_operation set state=$4,version=version+1,preview=$5::jsonb,preview_hash=$6,approver_id=$7,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
              [
                context.tenantId,
                input.company_id,
                id,
                state,
                preview ? JSON.stringify(preview) : null,
                preview ? operationalDigest(preview) : null,
                state === "approved" ? actor : null,
              ],
            );
            await this.audit(
              client,
              context,
              input.company_id,
              "operation",
              id,
              op.version + 1,
              input.action,
              input.reason,
              before,
              correlation,
            );
          }
          return this.load(client, context.tenantId, input.company_id, id);
        },
      ),
    );
  }
  private async post(
    client: PoolClient,
    context: InventoryContext,
    op: StockOperation,
    preview: StockPreview,
    reason: string,
    correlation: string,
  ) {
    const tx = await createFinanceTransactionClient(client);
    const common = {
      tenantId: context.tenantId,
      companyId: op.company_id,
      actorId: context.actor.userId,
      sourceType: "inventory_stock",
      sourceId: op.id,
      eventType: "stock.posted",
      externalIdempotencyKey: `stock:${op.id}`,
      transactionCurrency: preview.base_currency,
      payloadHashMaterial: { operation_id: op.id, preview_hash: operationalDigest(preview) },
      auditRef: correlation,
    };
    let result;
    if (op.input.kind === "reversal") {
      const original = await this.load(client, context.tenantId, op.company_id, op.input.operation_id, true);
      if (!original.journal_id || !original.accounting_event_id) fail("Original stock accounting evidence is missing.");
      result = await this.finance.reverse(tx, {
        ...common,
        sourceId: original.id,
        eventType: "stock.reversed",
        originalEventType: "stock.posted",
        originalAccountingEventId: original.accounting_event_id,
        originalJournalId: original.journal_id,
        postingDate: op.date,
      });
    } else
      result = await this.finance.post(tx, {
        ...common,
        postingDate: op.date,
        exchangeRateId: null,
        exchangeRateValue: "1",
        lines: preview.lines,
      });
    for (const [index, entry] of preview.entries.entries()) {
      const entryId = `stock-entry-${randomUUID()}`;
      await client.query(
        "insert into inventory_stock_entry(tenant_id,company_id,id,operation_id,line_no,kind,movement_date,product_id,warehouse_id,unit,quantity,value,currency,account_id,method,valuation_version,original_entry_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
        [
          context.tenantId,
          op.company_id,
          entryId,
          op.id,
          index + 1,
          op.kind,
          op.date,
          entry.product_id,
          entry.warehouse_id,
          entry.unit,
          entry.quantity,
          entry.value,
          preview.base_currency,
          entry.account_id,
          entry.method,
          entry.valuation_version,
          entry.original_entry_id,
        ],
      );
      for (const allocation of entry.allocations)
        await client.query(
          "insert into inventory_stock_cost_allocation(tenant_id,company_id,entry_id,incoming_entry_id,quantity,value) values($1,$2,$3,$4,$5,$6)",
          [context.tenantId, op.company_id, entryId, allocation.entry_id, allocation.quantity, allocation.value],
        );
    }
    await postProductionAllocations(client, context, { ...op, preview });
    const before = await this.snapshot(client, context.tenantId, op.company_id, "operation", op.id, op.version);
    await client.query(
      "update inventory_stock_operation set state='posted',version=version+1,poster_id=$4,journal_id=$5,accounting_event_id=$6,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
      [context.tenantId, op.company_id, op.id, context.actor.userId, result.journalId, result.accountingEventId],
    );
    await this.audit(
      client,
      context,
      op.company_id,
      "operation",
      op.id,
      op.version + 1,
      "post",
      reason,
      before,
      correlation,
    );
    if (op.input.kind === "reversal") {
      const original = await this.load(client, context.tenantId, op.company_id, op.input.operation_id);
      const beforeOriginal = await this.snapshot(
        client,
        context.tenantId,
        op.company_id,
        "operation",
        original.id,
        original.version,
      );
      await client.query(
        "update inventory_stock_operation set state='reversed',version=version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
        [context.tenantId, op.company_id, original.id],
      );
      await this.audit(
        client,
        context,
        op.company_id,
        "operation",
        original.id,
        original.version + 1,
        "reverse",
        reason,
        beforeOriginal,
        correlation,
      );
    }
  }
  workspace(context: InventoryContext, query: StockQuery) {
    return this.transaction(context, query.company_id, "inventory.stock.read", false, async (client) => {
      const base = await resolveCompanyBaseCurrency(client, context.tenantId, query.company_id, false);
      const policy =
        (
          await client.query(
            "select company_id,version,receipt_accrual_account_id,opening_account_id,wip_account_id,variance_account_id,reason from inventory_stock_policy where tenant_id=$1 and company_id=$2 order by version desc limit 1",
            [context.tenantId, query.company_id],
          )
        ).rows[0] ?? null;
      const pattern = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
      const params = [
        context.tenantId,
        query.company_id,
        query.as_of,
        query.product_id ?? null,
        query.warehouse_id ?? null,
        pattern,
      ];
      const balances = `select e.product_id,p.code as product_code,p.name as product_name,e.warehouse_id,w.name as warehouse_name,p.details->>'unit' as unit,sum(e.quantity)::text as quantity,sum(e.value)::text as value
        from inventory_stock_entry e join inventory_product p on(p.tenant_id,p.company_id,p.id)=(e.tenant_id,e.company_id,e.product_id)
        join inventory_warehouse w on(w.tenant_id,w.company_id,w.id)=(e.tenant_id,e.company_id,e.warehouse_id)
        where e.tenant_id=$1 and e.company_id=$2 and e.movement_date<=$3 and($4::text is null or e.product_id=$4) and($5::text is null or e.warehouse_id=$5)
        and(p.name ilike $6 escape '\\' or p.code ilike $6 escape '\\') group by e.product_id,p.code,p.name,e.warehouse_id,w.name,p.details->>'unit'`;
      const rows = (
        await client.query(`${balances} order by p.code,e.warehouse_id limit $7 offset $8`, [
          ...params,
          query.limit,
          query.offset,
        ])
      ).rows;
      const total = (await client.query<{ n: number }>(`select count(*)::int as n from(${balances})b`, params)).rows[0]!
        .n;
      const opFilter = "tenant_id=$1 and company_id=$2 and movement_date<=$3 and code ilike $4 escape '\\'";
      const opParams = [context.tenantId, query.company_id, query.as_of, pattern];
      const operations = (
        await client.query(
          `select ${operationProjection} from inventory_stock_operation where ${opFilter} order by created_at desc,id limit $5 offset $6`,
          [...opParams, query.limit, query.offset],
        )
      ).rows;
      const opCount = (
        await client.query<{ n: number }>(
          `select count(*)::int as n from inventory_stock_operation where ${opFilter}`,
          opParams,
        )
      ).rows[0]!.n;
      const valuations = (
        await client.query(
          `select distinct on(v.product_id) v.company_id,v.product_id,v.version,v.method,v.reason,v.stock_account_id,p.code as product_code,p.name as product_name from inventory_stock_valuation v join inventory_product p on(p.tenant_id,p.company_id,p.id)=(v.tenant_id,v.company_id,v.product_id)
        where v.tenant_id=$1 and v.company_id=$2 and($3::text is null or v.product_id=$3) and(p.name ilike $4 escape '\\' or p.code ilike $4 escape '\\') order by v.product_id,v.version desc limit $5 offset $6`,
          [context.tenantId, query.company_id, query.product_id ?? null, pattern, query.limit, query.offset],
        )
      ).rows;
      return stockWorkspaceSchema.parse({
        company_id: query.company_id,
        as_of: query.as_of,
        base_currency: base.code,
        decimal_places: base.decimalPlaces,
        policy,
        valuations,
        balances: rows,
        total_balances: total,
        operations,
        total_operations: opCount,
      });
    });
  }
}
