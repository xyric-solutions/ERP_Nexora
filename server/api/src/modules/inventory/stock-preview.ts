import type { PoolClient } from "pg";
import { z } from "zod";
import {
  decimal,
  decimalText,
  divideRounded,
  convertMinor,
  parseQuantity,
  formatQuantity,
  purchaseTotals,
  purchaseDocumentSchema,
  stockOperationSchema,
  stockPreviewSchema,
  stockPolicySchema,
  unitSnapshotSchema,
  manufacturingRecipeSchema,
  type StockEntryPreview,
  type StockOperation,
  type StockPreview,
} from "@nexora/contracts";
import type { InventoryContext } from "./source-repository.js";
import { operationalFailure as fail, operationalDigest } from "../shared/operational-transaction.js";
import {
  resolveCompanyBaseCurrency,
  resolveCompanyCurrencyAuthority,
} from "../finance/currencies/company-authority.js";
import { productUnitChoices, productUnitSnapshot } from "./units-repository.js";
import { issueStockCost } from "./stock-costing.js";
import {
  appendProductionCharge,
  batchCharges,
  assertProductionReversal,
  attestActualMaterials,
  requireProductionFinanceRead,
} from "./production-costs.js";
import { appendSalesStock } from "../sales/stock-source.js";

const productRecord = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  stock_account_id: z.string().nullable(),
  version: z.number(),
  unit: z.string(),
  unit_id: z.string().nullable().optional(),
  track_inventory: z.boolean(),
  manufacture_enabled: z.boolean(),
  valuation_version: z.number().nullable(),
  method: z.enum(["fifo", "weighted_average"]).nullable(),
  valuation_account: z.string().nullable(),
  eligible: z.boolean(),
});
const purchaseShape = purchaseDocumentSchema.pick({
  id: true,
  code: true,
  company_id: true,
  kind: true,
  state: true,
  version: true,
  source_id: true,
  supplier_id: true,
  document_date: true,
  currency: true,
  lines: true,
  total_amount: true,
  discount_amount: true,
  additional_charges: true,
});
export function stockMinor(value: string, precision: number): bigint {
  const amount = decimal(value, 8, true),
    unit = 10n ** BigInt(8 - precision);
  if (amount % unit !== 0n)
    fail("Stock value exceeds the company's functional-currency precision.", "STOCK_VALUE_PRECISION");
  return amount / unit;
}
const operationProjection =
  "id,company_id,code,kind,movement_date::text as date,state,version,maker_id,approver_id,poster_id,journal_id,accounting_event_id,payload as input,preview";
const jsonEvidence = (value: unknown) => z.json().parse(JSON.parse(JSON.stringify(value)));

export async function buildStockPreview(
  client: PoolClient,
  context: InventoryContext,
  op: StockOperation,
): Promise<StockPreview> {
  const tenant = context.tenantId,
    company = op.company_id,
    input = op.input;
  const sourcePermission =
    input.kind === "receipt"
      ? "procurement.document.read"
      : input.kind.startsWith("manufacturing_")
        ? "manufacturing.order.read"
        : input.kind === "delivery" || input.kind === "return"
          ? "sales.document.read"
          : null;
  if (
    sourcePermission &&
    (!context.actor.permissions.includes(sourcePermission) ||
      !(
        await client.query("select 1 where bank_has_live_permission($1,$2,$3,$4)", [
          tenant,
          company,
          context.actor.userId,
          sourcePermission,
        ])
      ).rowCount)
  )
    fail(
      "Read authority for this movement's owning source module is required in the same company.",
      "STOCK_SOURCE_PERMISSION_REQUIRED",
      403,
    );
  const base = await resolveCompanyBaseCurrency(client, tenant, company);
  if (input.kind === "reversal") return reversalPreview(client, context, op);
  if (Object.keys(input.dimensions).some((key) => /^(purchase_|asset_|sales_)/.test(key)))
    fail("Source accounting references are assigned by their owning workflow.", "STOCK_SOURCE_DIMENSION_RESERVED");
  const policyRow = (
    await client.query(
      "select company_id,version,receipt_accrual_account_id,opening_account_id,wip_account_id,variance_account_id,reason from inventory_stock_policy where tenant_id=$1 and company_id=$2 order by version desc limit 1",
      [tenant, company],
    )
  ).rows[0];
  if (!policyRow)
    fail("Review company stock accounting mappings before preparing a movement.", "STOCK_POLICY_REQUIRED");
  const policy = stockPolicySchema.parse(policyRow);
  const periods = (
    await client.query<{ id: string }>(
      "select id from financial_period where tenant_id=$1 and company_id=$2 and $3::date between period_start and period_end and status='open'",
      [tenant, company, op.date],
    )
  ).rows;
  if (periods.length !== 1) fail("Choose a posting date in an open financial period.", "STOCK_PERIOD_UNAVAILABLE");
  await client.query("select finance_validate_dimensions($1,$2,$3::jsonb)", [
    tenant,
    company,
    JSON.stringify(input.dimensions),
  ]);
  const result: StockPreview = {
    base_currency: base.code,
    decimal_places: base.decimalPlaces,
    policy_version: policy.version,
    entries: [],
    lines: [],
    evidence: { period_id: periods[0]!.id, policy: policyRow },
  };
  const productCache = new Map<string, z.infer<typeof productRecord>>();
  async function product(id: string) {
    let p = productCache.get(id);
    if (p) return p;
    const row = (
      await client.query<{ record: unknown }>(
        `select p.details||jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'stock_account_id',p.stock_account_id,'version',p.row_version,
      'valuation_version',v.version,'method',v.method,'valuation_account',v.stock_account_id,
      'eligible',(p.status='active' and p.type='goods' and a.type='asset' and a.status='active' and not a.is_header and a.manual_posting_allowed and not a.reconciliation_required and not a.managed_bank_nominal and not finance_is_subledger_control(p.tenant_id,p.company_id,a.id))) as record
      from inventory_product p left join lateral(select version,method,stock_account_id from inventory_stock_valuation where tenant_id=p.tenant_id and company_id=p.company_id and product_id=p.id order by version desc limit 1)v on true
      left join account a on(a.tenant_id,a.company_id,a.id)=(p.tenant_id,p.company_id,p.stock_account_id)
      where p.tenant_id=$1 and p.company_id=$2 and p.id=$3`,
        [tenant, company, id],
      )
    ).rows[0];
    if (!row) fail("A stock product was not found in this company.", "STOCK_PRODUCT_NOT_FOUND");
    p = productRecord.parse(row.record);
    if (!p.eligible || !p.track_inventory || !p.stock_account_id)
      fail(
        "Choose an active inventory-tracked product with an eligible stock asset account.",
        "STOCK_PRODUCT_INELIGIBLE",
      );
    if (!p.method || !p.valuation_version || p.valuation_account !== p.stock_account_id)
      fail(`Review valuation for ${p.code} before stock posting.`, "STOCK_VALUATION_REQUIRED");
    result.evidence[`product:${id}`] = jsonEvidence(row.record);
    productCache.set(id, p);
    return p;
  }
  async function entry(productId: string, warehouseId: string, quantity: bigint, incomingValue?: bigint) {
    const p = await product(productId);
    const warehouse = (
      await client.query<{ id: string; name: string; row_version: number }>(
        "select id,name,row_version from inventory_warehouse where tenant_id=$1 and company_id=$2 and id=$3 and status='active'",
        [tenant, company, warehouseId],
      )
    ).rows[0];
    if (!warehouse) fail("Choose an active warehouse in this company.", "STOCK_WAREHOUSE_REQUIRED");
    const choices = (await productUnitChoices(client, tenant, company, [productId])).get(productId)!;
    const unitSnapshot = productUnitSnapshot(choices, formatQuantity(quantity < 0n ? -quantity : quantity));
    const balance = (
      await client.query<{ quantity: string; value: string; sequence: string; latest: string | null }>(
        "select coalesce(sum(quantity),0)::text as quantity,coalesce(sum(value),0)::text as value,coalesce(max(sequence),0)::text as sequence,max(movement_date)::text as latest from inventory_stock_entry where tenant_id=$1 and company_id=$2 and product_id=$3 and warehouse_id=$4",
        [tenant, company, productId, warehouseId],
      )
    ).rows[0]!;
    if (balance.latest && op.date < balance.latest)
      fail("A later stock movement locks this valuation cutoff. Use a current correction date.", "STOCK_DATE_CUTOFF");
    result.evidence[`balance:${productId}:${warehouseId}`] = {
      ...balance,
      warehouse_version: warehouse.row_version,
      unit_snapshot: unitSnapshot,
    };
    let amount: bigint,
      allocations: StockEntryPreview["allocations"] = [];
    if (quantity < 0n) {
      if (
        result.entries.some(
          (e) => e.product_id === productId && e.warehouse_id === warehouseId && decimal(e.quantity, 4, true) < 0n,
        )
      )
        fail("Combine repeated product/warehouse consumption into one actual line.", "STOCK_DUPLICATE_ISSUE_LINE");
      let layers;
      if (p.method === "fifo") {
        const rows = (
          await client.query<{ id: string; quantity: string; value: string }>(
            `with remaining as(
          select e.id,e.movement_date,e.sequence,e.quantity-coalesce(a.quantity,0) as quantity,e.value-coalesce(a.value,0) as value
          from inventory_stock_entry e left join lateral(select sum(quantity)quantity,sum(value)value from inventory_stock_cost_allocation where tenant_id=e.tenant_id and company_id=e.company_id and incoming_entry_id=e.id)a on true
          where e.tenant_id=$1 and e.company_id=$2 and e.product_id=$3 and e.warehouse_id=$4 and e.quantity>0 and e.kind<>'reversal'),layers as(
          select *,sum(quantity)over(order by movement_date,sequence rows between unbounded preceding and 1 preceding) as previous_quantity from remaining where quantity>0 or value<>0)
          select id,quantity::text,value::text from layers where coalesce(previous_quantity,0)<$5::numeric order by movement_date,sequence limit 1001`,
            [tenant, company, productId, warehouseId, formatQuantity(-quantity)],
          )
        ).rows;
        if (rows.length > 1000)
          fail(
            "This issue spans more than 1,000 cost layers. Split the actual issue into smaller movements.",
            "STOCK_LAYER_LIMIT",
          );
        layers = rows.map((row) => ({
          id: row.id,
          quantity: parseQuantity(row.quantity),
          value: stockMinor(row.value, base.decimalPlaces),
        }));
        result.evidence[`layers:${productId}:${warehouseId}`] = rows;
      } else
        layers = [
          {
            id: "weighted-average",
            quantity: parseQuantity(balance.quantity),
            value: stockMinor(balance.value, base.decimalPlaces),
          },
        ];
      if (-quantity > parseQuantity(balance.quantity))
        fail("Insufficient posted stock in this warehouse.", "STOCK_SHORTAGE");
      const cost = issueStockCost(p.method!, -quantity, layers);
      amount = -cost.value;
      allocations = cost.allocations.map((a) => ({
        entry_id: a.entry_id,
        quantity: formatQuantity(a.quantity),
        value: decimalText(a.value, base.decimalPlaces),
      }));
    } else {
      if (!incomingValue || incomingValue <= 0n)
        fail("Incoming stock requires explicit positive functional cost evidence.", "STOCK_COST_REQUIRED");
      amount = incomingValue;
    }
    const row: StockEntryPreview = {
      product_id: productId,
      product_code: p.code,
      product_name: p.name,
      warehouse_id: warehouseId,
      warehouse_name: warehouse.name,
      quantity: formatQuantity(quantity),
      value: decimalText(amount, base.decimalPlaces),
      unit: p.unit,
      account_id: p.stock_account_id!,
      method: p.method!,
      valuation_version: p.valuation_version!,
      allocations,
      original_entry_id: null,
    };
    result.entries.push(row);
    return row;
  }
  function leg(account: string, amount: bigint, dimensions: Record<string, string>, description: string) {
    if (!amount) return;
    result.lines.push({
      accountId: account,
      debit: decimalText(amount > 0n ? amount : 0n, base.decimalPlaces),
      credit: decimalText(amount < 0n ? -amount : 0n, base.decimalPlaces),
      dimensions,
      description,
    });
  }
  function accounting(row: StockEntryPreview, counter: string, dimensions: Record<string, string> = input.dimensions) {
    const amount = stockMinor(row.value, base.decimalPlaces);
    leg(row.account_id, amount, { ...dimensions, warehouse: row.warehouse_id }, `${op.code} ${row.product_code}`);
    leg(counter, -amount, dimensions, `${op.code} ${input.kind}`);
  }
  async function purchaseSource(id: string) {
    const row = (
      await client.query(
        `select id,code,company_id,kind,state,row_version as version,source_id,supplier_id,document_date::text,currency,lines,total_amount::text,discount_amount::text,additional_charges
      from procurement_document where tenant_id=$1 and company_id=$2 and id=$3 for share`,
        [tenant, company, id],
      )
    ).rows[0];
    if (!row) fail("The approved receipt was not found in this company.", "STOCK_SOURCE_NOT_FOUND");
    const source = purchaseShape.parse(row);
    if (source.kind !== "receipt" || source.state !== "approved" || op.date < source.document_date)
      fail("Stock receipt requires an approved actual receipt and a valid posting date.", "STOCK_SOURCE_NOT_APPROVED");
    return source;
  }
  if (input.kind === "opening") {
    const seen = new Set<string>();
    for (const line of input.lines) {
      const key = `${line.product_id}:${line.warehouse_id}`;
      if (seen.has(key)) fail("Use each product and warehouse once in an opening.");
      seen.add(key);
      if (
        (
          await client.query(
            "select 1 from inventory_stock_entry where tenant_id=$1 and company_id=$2 and product_id=$3 and warehouse_id=$4 and kind='opening'",
            [tenant, company, line.product_id, line.warehouse_id],
          )
        ).rowCount
      )
        fail(
          "This product/warehouse already has opening evidence. Use its controlled correction workflow.",
          "STOCK_OPENING_EXISTS",
        );
      accounting(
        await entry(
          line.product_id,
          line.warehouse_id,
          parseQuantity(line.quantity),
          stockMinor(line.value, base.decimalPlaces),
        ),
        policy.opening_account_id,
      );
    }
  } else if (input.kind === "receipt") {
    const source = await purchaseSource(input.source_id),
      totals = purchaseTotals(source.lines, source);
    if (
      (
        await client.query(
          `select 1 from finance_subledger_operation o
      join procurement_document b on(b.tenant_id,b.company_id,b.id)=(o.tenant_id,o.company_id,o.payload->>'source_document_id')
      cross join lateral jsonb_array_elements(b.lines) l
      where o.tenant_id=$1 and o.company_id=$2 and o.state='posted' and o.type='recognition'
       and o.payload->>'side'='payable' and o.payload->>'kind'='invoice' and b.source_id=$3
       and exists(select 1 from jsonb_array_elements($4::jsonb) r where r->>'source_line_id'=l->>'source_line_id' and r->>'product_id'=l->>'product_id')
       and not exists(select 1 from finance_subledger_operation v where v.tenant_id=o.tenant_id and v.company_id=o.company_id and v.state='posted' and v.type='reversal' and v.payload->>'operation_id'=o.id)
       and not exists(select 1 from inventory_receipt_bill_match m where(m.tenant_id,m.company_id,m.operation_id,m.bill_line_id)=(o.tenant_id,o.company_id,o.id,l->>'id')) limit 1`,
          [tenant, company, source.source_id, JSON.stringify(source.lines)],
        )
      ).rowCount
    )
      fail(
        "An existing supplier recognition already charged this order line without receipt accrual. Review its controlled correction before stock posting.",
        "STOCK_HISTORICAL_AP_REVIEW_REQUIRED",
      );
    const authority = await resolveCompanyCurrencyAuthority(client, {
      tenantId: tenant,
      companyId: company,
      sourceCurrency: source.currency,
      effectiveOnOrBefore: op.date,
    });
    result.evidence.source = jsonEvidence(source);
    result.evidence.currency = {
      rate_id: authority.rateId,
      rate: authority.rateValue,
      date: authority.rateEffectiveDate,
    };
    const receiptLines: ReturnType<typeof jsonEvidence>[] = [];
    for (const [index, line] of source.lines.entries()) {
      if (!line.product_id)
        fail(
          "A stock receipt line must reference a real product. Review legacy custom lines before posting.",
          "STOCK_RECEIPT_PRODUCT_REQUIRED",
        );
      const tracked = (
        await client.query<{ type: string; tracked: boolean }>(
          "select type,(details->>'track_inventory')::boolean as tracked from inventory_product where tenant_id=$1 and company_id=$2 and id=$3",
          [tenant, company, line.product_id],
        )
      ).rows[0];
      if (tracked?.type === "service" || tracked?.tracked === false) continue;
      if (line.asset_category_id)
        fail("Fixed assets use the acquisition workflow, not inventory stock.", "STOCK_ASSET_SOURCE_CONFLICT");
      const choices = (await productUnitChoices(client, tenant, company, [line.product_id])).get(line.product_id)!;
      const units = productUnitSnapshot(choices, line.quantity, line.unit_id);
      if (line.unit_snapshot && operationalDigest(units) !== operationalDigest(line.unit_snapshot))
        fail(
          "The receipt's approved UOM conversion changed. Review its source before posting.",
          "STOCK_SOURCE_UNIT_CHANGED",
        );
      const native = stockMinor(totals.lines[index]!.net, authority.sourceDecimalPlaces);
      const value = convertMinor(native, authority.sourceDecimalPlaces, authority.rateValue, base.decimalPlaces);
      const dimensions = Object.fromEntries(
        Object.entries({ ...input.dimensions, ...line.dimensions, purchase_line_id: line.id }).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
      accounting(
        await entry(line.product_id, input.warehouse_id, parseQuantity(units.base_quantity), value),
        policy.receipt_accrual_account_id,
        dimensions,
      );
      receiptLines.push({
        line_id: line.id ?? String(index + 1),
        order_line_id: line.source_line_id,
        product_id: line.product_id,
        quantity: units.base_quantity,
        native_net: totals.lines[index]!.net,
        value: decimalText(value, base.decimalPlaces),
        unit_snapshot: units,
      });
    }
    result.evidence.receipt_lines = receiptLines;
  } else if (input.kind === "transfer") {
    const transfer = (
      await client.query<{ record: unknown }>(
        `select to_jsonb(t)||jsonb_build_object('lines',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('quantity',l.quantity::text) order by l.line_no) from inventory_transfer_line l where(l.tenant_id,l.company_id,l.transfer_id)=(t.tenant_id,t.company_id,t.id)),'[]'::jsonb)) as record from inventory_transfer t where tenant_id=$1 and company_id=$2 and id=$3 for share`,
        [tenant, company, input.source_id],
      )
    ).rows[0];
    const transferSchema = z.object({
      from_warehouse_id: z.string(),
      to_warehouse_id: z.string(),
      transfer_date: z.string(),
      row_version: z.number(),
      lines: z
        .array(
          z.object({
            product_id: z.string(),
            quantity: z.coerce.string(),
            unit_id: z.string().optional().nullable(),
            unit_snapshot: z.json().optional().nullable(),
          }),
        )
        .min(1),
    });
    if (!transfer) fail("The transfer was not found in this company.", "STOCK_SOURCE_NOT_FOUND");
    const source = transferSchema.parse(transfer.record);
    if (source.from_warehouse_id === source.to_warehouse_id || op.date < source.transfer_date)
      fail("Choose a valid transfer source and posting date.");
    const amounts = new Map<string, bigint>();
    for (const line of source.lines) {
      const choices = (await productUnitChoices(client, tenant, company, [line.product_id])).get(line.product_id)!;
      const saved = line.unit_snapshot ? unitSnapshotSchema.parse(line.unit_snapshot) : null;
      const units = productUnitSnapshot(
        choices,
        saved?.entered_quantity ?? line.quantity,
        saved?.unit_id ?? line.unit_id ?? undefined,
      );
      if (
        saved &&
        (operationalDigest(units) !== operationalDigest(saved) ||
          parseQuantity(units.base_quantity) !== parseQuantity(line.quantity))
      )
        fail("The transfer's approved UOM evidence changed.", "STOCK_SOURCE_UNIT_CHANGED");
      amounts.set(line.product_id, (amounts.get(line.product_id) ?? 0n) + parseQuantity(units.base_quantity));
    }
    result.evidence.source = jsonEvidence(transfer.record);
    for (const [id, quantity] of amounts) {
      const outgoing = await entry(id, source.from_warehouse_id, -quantity);
      const incoming = await entry(
        id,
        source.to_warehouse_id,
        quantity,
        -stockMinor(outgoing.value, base.decimalPlaces),
      );
      leg(
        outgoing.account_id,
        stockMinor(outgoing.value, base.decimalPlaces),
        { ...input.dimensions, warehouse: outgoing.warehouse_id },
        `${op.code} transfer out`,
      );
      leg(
        incoming.account_id,
        stockMinor(incoming.value, base.decimalPlaces),
        { ...input.dimensions, warehouse: incoming.warehouse_id },
        `${op.code} transfer in`,
      );
    }
  } else if (input.kind === "manufacturing_issue") {
    const order = await manufacturingOrder(client, tenant, company, input.source_id);
    if (order.recipe) await assertOutputUnit(client, tenant, company, order);
    if (op.date < order.order_date) fail("Material issue cannot precede its manufacturing order.");
    const issued = (
      await client.query<{ quantity: string }>(
        "select coalesce(sum((payload->>'quantity')::numeric),0)::text as quantity from inventory_stock_operation where tenant_id=$1 and company_id=$2 and kind='manufacturing_issue' and state='posted' and payload->>'source_id'=$3",
        [tenant, company, order.id],
      )
    ).rows[0]!.quantity;
    if (parseQuantity(issued) + parseQuantity(input.quantity) > parseQuantity(order.quantity))
      fail("Issued production batches exceed the approved order quantity.", "STOCK_PRODUCTION_QUANTITY_EXCEEDED");
    result.evidence.order = jsonEvidence(order);
    result.evidence.approved_materials = await attestActualMaterials(order, issued, input);
    result.evidence.issued_quantity = issued;
    result.evidence.wip_account_id = policy.wip_account_id;
    const bom = (
      await client.query<{ snapshot: unknown }>(
        `select to_jsonb(b)||jsonb_build_object('output_quantity',b.output_quantity::text,'lines',(select jsonb_agg(to_jsonb(l)||jsonb_build_object('quantity',l.quantity::text) order by line_no) from manufacturing_bom_line l where(l.tenant_id,l.company_id,l.bom_id)=(b.tenant_id,b.company_id,b.id))) as snapshot from manufacturing_bom b where tenant_id=$1 and company_id=$2 and product_id=$3`,
        [tenant, company, order.product_id],
      )
    ).rows[0];
    result.evidence.bom = order.recipe
      ? z.json().parse(order.recipe)
      : bom?.snapshot
        ? z.json().parse(bom.snapshot)
        : null;
    for (const line of input.lines) {
      if (line.product_id === order.product_id) fail("The finished product cannot consume itself.");
      const frozen = order.recipe?.lines.find((material) => material.product_id === line.product_id);
      if (frozen) {
        const current = await product(line.product_id);
        const changed =
          frozen.unit_snapshot?.base_unit_id && current.unit_id
            ? frozen.unit_snapshot.base_unit_id !== current.unit_id
            : frozen.unit !== current.unit;
        if (changed)
          fail(
            "A material base unit changed after this recipe was approved. Refresh and approve a corrected order before issuing it.",
            "PRODUCTION_RECIPE_UNIT_CHANGED",
          );
      }
      accounting(
        await entry(line.product_id, line.warehouse_id, -parseQuantity(line.quantity)),
        policy.wip_account_id,
        orderDimensions(order, input.dimensions),
      );
    }
  } else if (input.kind === "manufacturing_charge") {
    await appendProductionCharge(client, context, op, result, leg);
  } else if (input.kind === "manufacturing_completion") {
    const row = (
      await client.query(
        `select ${operationProjection} from inventory_stock_operation where tenant_id=$1 and company_id=$2 and id=$3 for share`,
        [tenant, company, input.source_id],
      )
    ).rows[0];
    if (!row) fail("Select the posted material issue for this production batch.", "STOCK_PRODUCTION_ISSUE_REQUIRED");
    const issue = stockOperationSchema.parse(row);
    if (
      issue.state !== "posted" ||
      issue.input.kind !== "manufacturing_issue" ||
      !issue.preview ||
      op.date < issue.date
    )
      fail("Completion requires a posted, unreversed actual material issue.", "STOCK_PRODUCTION_ISSUE_REQUIRED");
    const order = await manufacturingOrder(client, tenant, company, issue.input.source_id);
    await assertOutputUnit(client, tenant, company, order);
    const used = (
      await client.query<{ quantity: string; value: string }>(
        `select coalesce(sum((o.payload->>'quantity')::numeric),0)::text as quantity,
      coalesce(sum((select sum((e->>'value')::numeric) from jsonb_array_elements(o.preview->'entries')e)),0)::text as value
      from inventory_stock_operation o where tenant_id=$1 and company_id=$2 and kind='manufacturing_completion' and state='posted' and payload->>'source_id'=$3`,
        [tenant, company, issue.id],
      )
    ).rows[0]!;
    const remaining = parseQuantity(issue.input.quantity) - parseQuantity(used.quantity),
      quantity = parseQuantity(input.quantity);
    if (quantity > remaining)
      fail(
        "Actual output exceeds this material issue's remaining production quantity.",
        "STOCK_PRODUCTION_QUANTITY_EXCEEDED",
      );
    const charges = await batchCharges(client, tenant, company, issue.id);
    if (charges.latest && op.date < charges.latest)
      fail("Completion cannot precede actual production charge history.", "STOCK_DATE_CUTOFF");
    if (order.recipe?.charges.length && !input.charges_review_reason)
      fail(
        "Review actual charges or explain any waived estimates before completing the batch.",
        "PRODUCTION_CHARGE_REVIEW_REQUIRED",
      );
    result.evidence.production_charges = charges;
    const total =
      -issue.preview.entries.reduce((sum, e) => sum + stockMinor(e.value, base.decimalPlaces), 0n) +
      stockMinor(charges.value, base.decimalPlaces);
    const carrying = total - stockMinor(used.value, base.decimalPlaces);
    const value = quantity === remaining ? carrying : divideRounded(carrying * quantity, remaining);
    if (value <= 0n || (quantity < remaining && value >= carrying))
      fail("The completion cannot leave production with zero or negative cost. Review the batch quantity.");
    const wip = issue.preview.evidence.wip_account_id;
    if (typeof wip !== "string" || issue.preview.base_currency !== base.code)
      fail("The original production WIP or currency evidence is unavailable.");
    result.evidence.issue = {
      id: issue.id,
      version: issue.version,
      preview_hash: operationalDigest(issue.preview),
      remaining_quantity: formatQuantity(remaining),
      remaining_value: decimalText(carrying, base.decimalPlaces),
    };
    result.evidence.order = jsonEvidence(order);
    result.evidence.wip_account_id = wip;
    if (Object.entries(input.dimensions).some(([key, value]) => issue.input.dimensions[key] !== value))
      fail(
        "Completion must preserve its material issue's accounting dimensions.",
        "STOCK_PRODUCTION_DIMENSIONS_CHANGED",
      );
    accounting(
      await entry(order.product_id, input.warehouse_id, quantity, value),
      wip,
      orderDimensions(order, issue.input.dimensions),
    );
  } else {
    await appendSalesStock(client, context, op, result, { entry, leg });
  }
  result.evidence.accounts = jsonEvidence(
    (
      await client.query(
        "select id,code,name from account where tenant_id=$1 and company_id=$2 and id=any($3::text[]) order by code,id",
        [tenant, company, [...new Set(result.lines.map((line) => line.accountId))]],
      )
    ).rows,
  );
  return stockPreviewSchema.parse(result);
}

async function assertOutputUnit(
  client: PoolClient,
  tenant: string,
  company: string,
  order: { product_id: string; unit: string },
) {
  const row = (
    await client.query(
      "select details->>'unit' unit from inventory_product where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and details->>'manufacture_enabled'='true'",
      [tenant, company, order.product_id],
    )
  ).rows[0];
  if (!row || row.unit !== order.unit)
    fail("The finished product's active base unit must match its approved order.", "PRODUCTION_OUTPUT_UNIT_CHANGED");
}
async function manufacturingOrder(client: PoolClient, tenant: string, company: string, id: string) {
  const order = (
    await client.query(
      "select id,code,product_id,quantity::text,unit,state,row_version as version,order_date::text,project_id,location_id,recipe from manufacturing_order where tenant_id=$1 and company_id=$2 and id=$3 for share",
      [tenant, company, id],
    )
  ).rows[0];
  const schema = z.object({
    id: z.string(),
    code: z.string(),
    product_id: z.string(),
    quantity: z.string(),
    unit: z.string(),
    recipe: manufacturingRecipeSchema.nullable().default(null),
    state: z.literal("approved"),
    version: z.number(),
    order_date: z.string(),
    project_id: z.string().nullable(),
    location_id: z.string().nullable(),
  });
  if (!order || order.state !== "approved")
    fail("Actual production requires an approved manufacturing order in this company.", "STOCK_ORDER_NOT_APPROVED");
  return schema.parse(order);
}

function orderDimensions(
  order: { project_id: string | null; location_id: string | null },
  input: Record<string, string>,
) {
  const dimensions: Record<string, string> = {
    ...input,
    ...(order.project_id ? { project: order.project_id } : {}),
    ...(order.location_id ? { location: order.location_id } : {}),
  };
  if (Object.entries(input).some(([key, value]) => dimensions[key] !== value))
    fail(
      "Actual production must preserve its approved order's project and location.",
      "STOCK_PRODUCTION_DIMENSIONS_CHANGED",
    );
  return dimensions;
}

async function reversalPreview(
  client: PoolClient,
  context: InventoryContext,
  op: StockOperation,
): Promise<StockPreview> {
  if (op.input.kind !== "reversal") fail("A reversal source is required.");
  const tenant = context.tenantId,
    company = op.company_id;
  const row = (
    await client.query(
      `select ${operationProjection} from inventory_stock_operation where tenant_id=$1 and company_id=$2 and id=$3 for update`,
      [tenant, company, op.input.operation_id],
    )
  ).rows[0];
  if (!row) fail("The original stock operation was not found in this company.", "STOCK_NOT_FOUND", 404);
  const original = stockOperationSchema.parse(row);
  if (original.kind === "manufacturing_charge") {
    await requireProductionFinanceRead(client, context, company, true);
    if (
      !context.actor.permissions.includes("manufacturing.order.read") ||
      !(
        await client.query("select 1 where bank_has_live_permission($1,$2,$3,$4)", [
          tenant,
          company,
          context.actor.userId,
          "manufacturing.order.read",
        ])
      ).rowCount
    )
      fail("Current manufacturing source read access is required.", "PRODUCTION_SOURCE_PERMISSION_REQUIRED", 403);
  }
  await assertProductionReversal(client, tenant, company, original, op.date);
  if (original.kind === "reversal" || original.state !== "posted" || !original.preview || op.date < original.date)
    fail("Choose an unreversed posted original and a valid reversal date.", "STOCK_REVERSAL_SOURCE_INVALID");
  if (
    (
      await client.query(
        "select 1 from inventory_receipt_bill_match where tenant_id=$1 and company_id=$2 and receipt_operation_id=$3 having sum(quantity)>0",
        [tenant, company, original.id],
      )
    ).rowCount
  )
    fail(
      "Reverse the supplier recognition that consumed this receipt accrual before reversing stock.",
      "STOCK_RECEIPT_BILLED",
    );
  if (
    (
      await client.query(
        "select 1 from inventory_receipt_bill_match m join finance_subledger_operation f on(f.tenant_id,f.company_id,f.id)=(m.tenant_id,m.company_id,m.operation_id) where m.tenant_id=$1 and m.company_id=$2 and m.receipt_operation_id=$3 and f.operation_date>$4::date limit 1",
        [tenant, company, original.id, op.date],
      )
    ).rowCount
  )
    fail("Receipt reversal must follow its supplier recognition and compensation history.", "STOCK_DATE_CUTOFF");
  if (
    (
      await client.query(
        "select 1 from inventory_stock_operation where tenant_id=$1 and company_id=$2 and kind='manufacturing_completion' and payload->>'source_id'=$3 and state='posted' limit 1",
        [tenant, company, original.id],
      )
    ).rowCount
  )
    fail("Reverse the batch's completed output before reversing material consumption.", "STOCK_REVERSAL_DEPENDENCIES");
  const later = (
    await client.query(
      `select 1 from inventory_stock_entry e join inventory_stock_operation o on(o.tenant_id,o.company_id,o.id)=(e.tenant_id,e.company_id,e.operation_id)
    where e.tenant_id=$1 and e.company_id=$2 and e.operation_id<>$3 and o.state='posted' and o.kind<>'reversal' and exists(
    select 1 from inventory_stock_entry s where(s.tenant_id,s.company_id,s.operation_id)=(e.tenant_id,e.company_id,$3)
    and(s.product_id,s.warehouse_id)=(e.product_id,e.warehouse_id) and e.sequence>s.sequence) limit 1`,
      [tenant, company, original.id],
    )
  ).rowCount;
  if (later)
    fail(
      "Reverse later movements of the affected product/warehouse before this stock correction.",
      "STOCK_REVERSAL_DEPENDENCIES",
    );
  if (
    (
      await client.query(
        `select 1 from inventory_stock_entry e where e.tenant_id=$1 and e.company_id=$2 and e.movement_date>$4::date and exists(
    select 1 from inventory_stock_entry s where(s.tenant_id,s.company_id,s.operation_id)=(e.tenant_id,e.company_id,$3) and(s.product_id,s.warehouse_id)=(e.product_id,e.warehouse_id)) limit 1`,
        [tenant, company, original.id, op.date],
      )
    ).rowCount
  )
    fail("The reversal date must follow all affected stock history.", "STOCK_DATE_CUTOFF");
  const entries = (
    await client.query<{ id: string; line_no: number }>(
      "select id,line_no from inventory_stock_entry where tenant_id=$1 and company_id=$2 and operation_id=$3 order by line_no",
      [tenant, company, original.id],
    )
  ).rows;
  const costAllocations = (
    await client.query<{ entry_id: string; incoming_entry_id: string; quantity: string; value: string }>(
      `select a.entry_id,a.incoming_entry_id,a.quantity::text,a.value::text from inventory_stock_cost_allocation a join inventory_stock_entry e on(e.tenant_id,e.company_id,e.id)=(a.tenant_id,a.company_id,a.entry_id)
    where(e.tenant_id,e.company_id,e.operation_id)=($1,$2,$3) order by e.line_no,a.incoming_entry_id`,
      [tenant, company, original.id],
    )
  ).rows;
  const preview: StockPreview = {
    ...original.preview,
    entries: original.preview.entries.map((e, index) => {
      const quantity = -decimal(e.quantity, 4, true),
        value = -decimal(e.value, 8, true);
      const id = entries[index]?.id;
      if (!id) fail("The original stock ledger evidence is incomplete.");
      return {
        ...e,
        quantity: formatQuantity(quantity),
        value: decimalText(value, 8),
        original_entry_id: id,
        allocations:
          e.method !== "fifo"
            ? []
            : quantity < 0n
              ? [{ entry_id: id, quantity: formatQuantity(-quantity), value: decimalText(-value, 8) }]
              : costAllocations
                  .filter((a) => a.entry_id === id)
                  .map((a) => ({
                    entry_id: a.incoming_entry_id,
                    quantity: formatQuantity(-parseQuantity(a.quantity)),
                    value: decimalText(-decimal(a.value, 8), 8),
                  })),
      };
    }),
    lines: original.preview.lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit })),
    evidence: {
      accounts: original.preview.evidence.accounts ?? [],
      original_kind: original.kind,
      original_operation_id: original.id,
      original_version: original.version,
      original_preview_hash: operationalDigest(original.preview),
      original_journal_id: original.journal_id,
      original_entry_ids: entries.map((e) => e.id),
    },
  };
  return stockPreviewSchema.parse(preview);
}
