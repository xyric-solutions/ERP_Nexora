import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  productInputSchema,
  bomInputSchema,
  type SubledgerRequest,
  warehouseInputSchema,
  stockTransferInputSchema,
  stockMovementInputSchema,
  stockQuerySchema,
  manufacturingOrderInputSchema,
  savePurchaseRequestSchema,
  supplierInputSchema,
  salesLookupQuerySchema,
  type PurchaseDocument,
  type PurchaseKind,
  type SubledgerOperation,
  type StockOperation,
  type StockMovementInput,
} from "../../packages/contracts/src/index.js";
import { SourceInventoryRepository } from "../../server/api/src/modules/inventory/source-repository.js";
import { SourceManufacturingRepository } from "../../server/api/src/modules/manufacturing/source-repository.js";
import { SourceStockRepository } from "../../server/api/src/modules/inventory/stock-repository.js";
import { SourceProcurementRepository } from "../../server/api/src/modules/procurement/source-repository.js";
import { SourceSubledgerRepository } from "../../server/api/src/modules/finance/subledger/source-repository.js";
import { SourceSalesRepository } from "../../server/api/src/modules/sales/source-repository.js";
import { FinancePostingService } from "../../server/api/src/modules/finance/posting/service.js";
import { createFinanceTransactionClient } from "../../server/api/src/modules/finance/posting/types.js";
import { setupSubledgerFixture, subledgerActor, subledgerPermissions } from "./subledger-fixture.js";

const bootstrapUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const suite = bootstrapUrl ? describe : describe.skip;
const database = `posted_stock_${randomUUID().replaceAll("-", "")}`;
const permissions = [
  ...subledgerPermissions,
  "sales.document.read",
  "finance.journal.read",
  "manufacturing.bom.read",
  "manufacturing.bom.create",
  "inventory.stock.read",
  "inventory.stock.manage",
  "inventory.stock.approve",
  "inventory.stock.post",
  "inventory.stock.configure",
  "inventory.item.read",
  "inventory.item.create",
  "inventory.bin.read",
  "inventory.bin.create",
  "manufacturing.order.read",
  "manufacturing.order.create",
  "manufacturing.order.approve",
  "procurement.document.read",
  "procurement.document.create",
  "procurement.document.action",
  "procurement.document.submit",
  "procurement.document.approve",
  "procurement.vendor.read",
  "procurement.vendor.create",
];
const actor = (user = "r06.maker") => {
  const context = subledgerActor(user);
  return { ...context, actor: { ...context.actor, permissions } };
};
const maker = actor(),
  checker = actor("r06.checker"),
  poster = actor("r06.target");
const key = () => randomUUID();
suite("Immutable posted stock and central accounting", () => {
  let bootstrap: DatabasePool,
    pool: DatabasePool,
    stock: SourceStockRepository,
    inventory: SourceInventoryRepository,
    manufacturing: SourceManufacturingRepository;
  let financial: SourceSubledgerRepository;
  let company: string, tenant: string, warehouseA: string, warehouseB: string, stockAccount: string;
  let policy: {
    receipt_accrual_account_id: string;
    opening_account_id: string;
    wip_account_id: string;
    variance_account_id: string;
  };
  beforeAll(async () => {
    if (!bootstrapUrl || !["localhost", "127.0.0.1"].includes(new URL(bootstrapUrl).hostname))
      throw Error("Explicit local test database required");
    bootstrap = createDatabasePool(bootstrapUrl);
    await bootstrap.query(`create database ${database}`);
    const url = new URL(bootstrapUrl);
    url.pathname = `/${database}`;
    pool = createDatabasePool(url.href);
    const fixture = await setupSubledgerFixture(pool, `stock-${key()}`, "USD");
    financial = fixture.repository;
    company = fixture.company;
    tenant = fixture.tenant;
    for (const role of ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"]) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,$2,k,'all' from unnest($3::text[])k on conflict do nothing",
        [tenant, role, permissions],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,$2,k,'company',$4 from unnest($3::text[])k on conflict do nothing",
        [tenant, role, permissions, company],
      );
    }
    const accounts: Record<string, string> = {};
    for (const [name, type] of [
      ["stock", "asset"],
      ["grni", "liability"],
      ["opening", "equity"],
      ["wip", "asset"],
      ["variance", "expense"],
    ]) {
      const id = `${company}-${name}`;
      accounts[name!] = id;
      await pool.query(
        "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,$4,$4,$5,false,'active',clock_timestamp())",
        [id, tenant, company, name, type],
      );
    }
    stockAccount = accounts.stock!;
    policy = {
      receipt_accrual_account_id: accounts.grni!,
      opening_account_id: accounts.opening!,
      wip_account_id: accounts.wip!,
      variance_account_id: accounts.variance!,
    };
    stock = new SourceStockRepository(pool);
    inventory = new SourceInventoryRepository(pool);
    manufacturing = new SourceManufacturingRepository(pool);
    warehouseA = (
      await inventory.saveWarehouse(
        maker,
        null,
        warehouseInputSchema.parse({ company_id: company, name: "Actual test source warehouse" }),
        key(),
        key(),
      )
    ).record.id;
    warehouseB = (
      await inventory.saveWarehouse(
        maker,
        null,
        warehouseInputSchema.parse({ company_id: company, name: "Actual test second warehouse" }),
        key(),
        key(),
      )
    ).record.id;
    await stock.configure(
      maker,
      { company_id: company, expected_version: 0, ...policy, reason: "Reviewed isolated stock mappings" },
      key(),
      key(),
    );
  }, 60000);
  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database ${database} with(force)`);
      await bootstrap.end();
    }
  });
  async function product(method: "fifo" | "weighted_average" = "fifo", manufacture = false) {
    const record = (
      await inventory.save(
        maker,
        null,
        productInputSchema.parse({
          category_id: "category-fixture-" + company,
          company_id: company,
          name: `Actual test ${key()}`,
          currency: "USD",
          unit: "Each",
          stock_account_id: stockAccount,
          manufacture_enabled: manufacture,
        }),
        key(),
        key(),
      )
    ).record;
    await stock.configureValuation(
      maker,
      {
        company_id: company,
        product_id: record.id,
        expected_version: 0,
        method,
        reason: "Reviewed isolated valuation choice",
      },
      key(),
      key(),
    );
    return record.id;
  }
  const create = (input: Record<string, unknown>) =>
    stock.create(
      maker,
      stockMovementInputSchema.parse({
        company_id: company,
        date: "2026-11-20",
        reason: "Controlled isolated stock evidence",
        ...input,
      }),
      key(),
      key(),
    );
  async function finish(op: StockOperation) {
    for (const [user, action] of [
      [maker, "submit"],
      [checker, "approve"],
      [poster, "post"],
    ] as const)
      op = await stock.action(
        user,
        op.id,
        { company_id: company, expected_version: op.version, action, reason: "Reviewed isolated stock decision" },
        key(),
        key(),
      );
    return op;
  }
  const opening = (id: string, warehouse: string, quantity: string, value: string) =>
    create({ kind: "opening", lines: [{ product_id: id, warehouse_id: warehouse, quantity, value }] }).then(finish);
  async function order(
    productId: string,
    component: string,
    materialQuantity = "4",
    quantity = "4",
    charges: unknown[] = [],
  ) {
    const existing = (
      await pool.query("select id from manufacturing_bom where tenant_id=$1 and company_id=$2 and product_id=$3", [
        tenant,
        company,
        productId,
      ])
    ).rowCount;
    if (!existing)
      await manufacturing.saveBom(
        maker,
        null,
        bomInputSchema.parse({
          company_id: company,
          product_id: productId,
          output_quantity: quantity,
          warehouse_id: warehouseA,
          lines: [{ product_id: component, quantity: materialQuantity }],
          charges,
        }),
        key(),
        key(),
      );
    const record = (
      await manufacturing.saveOrder(
        maker,
        null,
        manufacturingOrderInputSchema.parse({
          company_id: company,
          product_id: productId,
          quantity,
          order_date: "2026-11-20",
        }),
        key(),
        key(),
      )
    ).record;
    return (
      await manufacturing.action(
        checker,
        record.id,
        { company_id: company, expected_version: record.version, action: "approve" },
        key(),
        key(),
      )
    ).record;
  }
  const balance = async (id: string, warehouse = warehouseA, asOf = "2026-11-20") =>
    (
      await stock.workspace(
        maker,
        stockQuerySchema.parse({ company_id: company, as_of: asOf, product_id: id, warehouse_id: warehouse }),
      )
    ).balances[0];
  it.each(["USD", "EUR"])(
    "clears actual %s receipt accrual for partial bills, governed FX and exact AP reversal",
    async (currency) => {
      const billDate = currency === "EUR" ? "2026-11-21" : "2026-11-20",
        receiptValue = currency === "EUR" ? "110" : "100",
        matchedValue = currency === "EUR" ? "44" : "40";
      if (currency === "EUR")
        await pool.query(
          "insert into currency_rate(id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,created_by,reason,updated_at) values($1,$2,$3,'EUR','USD','1.25','2026-11-21','active',1,'r06.maker','Reviewed isolated purchase FX',clock_timestamp())",
          [key(), tenant, company],
        );
      const id = await product(),
        purchases = new SourceProcurementRepository(pool),
        finance = new SourceSubledgerRepository(pool);
      const supplier = (
        await purchases.saveSupplier(
          maker,
          null,
          supplierInputSchema.parse({ company_id: company, name: `Reviewed isolated supplier ${key()}` }),
          key(),
          key(),
        )
      ).record;
      await finance.createParty(
        maker,
        {
          company_id: company,
          kind: "supplier",
          name: supplier.name,
          default_currency: currency,
          source_supplier_id: supplier.id,
        },
        key(),
      );
      async function approved(kind: PurchaseKind, source?: PurchaseDocument, quantity = "10") {
        let document = (
          await purchases.save(
            maker,
            null,
            savePurchaseRequestSchema.parse({
              company_id: company,
              kind,
              supplier_id: kind === "request" ? null : supplier.id,
              source_id: source?.id,
              document_date: kind === "bill" ? billDate : "2026-11-20",
              currency,
              reference: kind === "bill" ? key() : "",
              lines: [
                {
                  ...(source?.lines[0] ?? {
                    product_id: id,
                    description: "Actual tracked component",
                    uom: "Each",
                    unit_price: "10",
                    tax_percent: "0",
                  }),
                  id: undefined,
                  source_line_id: source?.lines[0]?.id,
                  quantity,
                },
              ],
            }),
            key(),
            key(),
          )
        ).record;
        for (const [user, action] of [
          [maker, "submit"],
          [checker, "approve"],
        ] as const)
          document = (
            await purchases.action(
              user,
              document.id,
              {
                company_id: company,
                expected_version: document.version,
                action,
                reason: "Reviewed actual purchase source",
              },
              key(),
              key(),
            )
          ).record;
        return document;
      }
      async function postFinance(op: SubledgerOperation) {
        for (const [user, action] of [
          [maker, "submit"],
          [checker, "approve"],
          [poster, "post"],
        ] as const)
          op = await finance.action(
            user,
            op.id,
            {
              company_id: company,
              expected_version: op.version,
              action,
              reason: "Reviewed receipt accrual accounting",
            },
            key(),
          );
        return op;
      }
      const request = await approved("request"),
        order = await approved("order", request),
        receipt = await approved("receipt", order);
      const bill = await approved("bill", order, "4");
      await expect(
        finance.preparePurchase(maker, bill.id, { company_id: company, expected_version: bill.version }, key()),
      ).rejects.toMatchObject({ code: "PURCHASE_STOCK_MATCH_REQUIRED" });
      const stockReceipt = await finish(
        await create({ kind: "receipt", source_id: receipt.id, warehouse_id: warehouseA }),
      );
      const first = await postFinance(
        await finance.preparePurchase(maker, bill.id, { company_id: company, expected_version: bill.version }, key()),
      );
      expect(first.preview?.stock_matches).toEqual([
        expect.objectContaining({
          quantity: "4",
          value: `${matchedValue}.00000000`,
          accrual_account_id: policy.receipt_accrual_account_id,
        }),
      ]);
      expect(first.preview?.lines.filter((l) => l.accountId === policy.receipt_accrual_account_id)).toEqual([
        expect.objectContaining({ debit: `${matchedValue}.00`, credit: "0.00", currency: "USD" }),
      ]);
      expect(first.preview?.lines.some((l) => l.accountId === stockAccount)).toBe(false);
      expect(first.preview?.lines.filter((l) => l.accountId === policy.variance_account_id)).toEqual(
        currency === "EUR" ? [expect.objectContaining({ debit: "6.00", credit: "0.00", currency: "USD" })] : [],
      );
      const blocked = await create({ kind: "reversal", operation_id: stockReceipt.id });
      await expect(finish(blocked)).rejects.toMatchObject({ code: "STOCK_RECEIPT_BILLED" });
      const secondBill = await approved("bill", order, "6");
      const second = await postFinance(
        await finance.preparePurchase(
          maker,
          secondBill.id,
          { company_id: company, expected_version: secondBill.version },
          key(),
        ),
      );
      const gl = async () =>
        (
          await pool.query(
            "select coalesce(sum(base_debit-base_credit),0)::text amount from journal_line where tenant_id=$1 and account_id=$2",
            [tenant, policy.receipt_accrual_account_id],
          )
        ).rows[0].amount;
      expect(await gl()).toBe("0.00000000");
      for (const op of [second, first])
        await postFinance(
          await finance.create(
            maker,
            {
              company_id: company,
              type: "reversal",
              operation_id: op.id,
              date: billDate,
              reference: "",
              reason: "Reverse isolated matched AP recognition",
            },
            key(),
          ),
        );
      expect(await gl()).toBe(`-${receiptValue}.00000000`);
      if (currency === "EUR") {
        await expect(finish(blocked)).rejects.toMatchObject({ code: "STOCK_DATE_CUTOFF" });
        await stock.action(
          maker,
          blocked.id,
          {
            company_id: company,
            expected_version: blocked.version,
            action: "cancel",
            reason: "Replace with date after AP compensation",
          },
          key(),
          key(),
        );
      }
      await finish(await create({ kind: "reversal", operation_id: stockReceipt.id, date: billDate }));
      expect(await gl()).toBe("0.00000000");
      expect(await balance(id, warehouseA, billDate)).toMatchObject({ quantity: "0.0000", value: "0.00000000" });
      expect(
        (
          await pool.query(
            "select count(*)::int n,sum(quantity)::text quantity,sum(value)::text value from inventory_receipt_bill_match where tenant_id=$1 and company_id=$2 and receipt_operation_id=$3",
            [tenant, company, stockReceipt.id],
          )
        ).rows[0],
      ).toEqual({ n: 4, quantity: "0.0000", value: "0.00000000" });
    },
  );
  it("posts reviewed opening stock once and reconciles its real asset journal", async () => {
    const id = await product(),
      op = await opening(id, warehouseA, "10", "100");
    expect(op).toMatchObject({
      state: "posted",
      version: 4,
      approver_id: checker.actor.userId,
      poster_id: poster.actor.userId,
    });
    expect(op.journal_id).toBeTruthy();
    expect(await balance(id)).toMatchObject({ quantity: "10.0000", value: "100.00000000" });
    const journal = (
      await pool.query(
        "select sum(base_debit)::text debit,sum(base_credit)::text credit from journal_line where tenant_id=$1 and journal_id=$2",
        [tenant, op.journal_id],
      )
    ).rows[0];
    expect(journal).toEqual({ debit: "100.00000000", credit: "100.00000000" });
    const duplicate = await create({
      kind: "opening",
      lines: [{ product_id: id, warehouse_id: warehouseA, quantity: "10", value: "100" }],
    });
    await expect(
      stock.action(
        maker,
        duplicate.id,
        {
          company_id: company,
          expected_version: duplicate.version,
          action: "submit",
          reason: "Duplicate reviewed opening attempt",
        },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "STOCK_OPENING_EXISTS" });
  });
  it("compensates the exact original opening and retains the immutable source", async () => {
    const id = await product(),
      original = await opening(id, warehouseA, "3", "100");
    const reversal = await finish(await create({ kind: "reversal", operation_id: original.id }));
    expect(reversal.state).toBe("posted");
    expect((await stock.get(maker, company, original.id)).state).toBe("reversed");
    expect(await balance(id)).toMatchObject({ quantity: "0.0000", value: "0.00000000" });
    expect(
      (
        await pool.query(
          "select count(*)::int n from inventory_stock_entry where tenant_id=$1 and company_id=$2 and product_id=$3",
          [tenant, company, id],
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it.each([
    ["fifo", "140", "35"],
    ["weighted_average", "160", "40"],
  ] as const)(
    "%s preserves transfer value, actual consumption and partial output costs",
    async (method, total, partial) => {
      const component = await product(method),
        finished = await product(method, true);
      await opening(component, warehouseA, "10", "100");
      await opening(component, warehouseB, "10", "200");
      const source = (
        await inventory.saveTransfer(
          maker,
          null,
          stockTransferInputSchema.parse({
            company_id: company,
            from_warehouse_id: warehouseB,
            to_warehouse_id: warehouseA,
            transfer_date: "2026-11-20",
            lines: [{ product_id: component, quantity: "5" }],
          }),
          key(),
          key(),
        )
      ).record;
      await finish(await create({ kind: "transfer", source_id: source.id }));
      const approved = await order(finished, component, "12");
      const issue = await finish(
        await create({
          kind: "manufacturing_issue",
          source_id: approved.id,
          quantity: "4",
          lines: [{ product_id: component, warehouse_id: warehouseA, quantity: "12" }],
        }),
      );
      expect(issue.preview!.lines.filter((l) => l.accountId === policy.wip_account_id)[0]?.debit).toBe(`${total}.00`);
      const first = await finish(
        await create({
          kind: "manufacturing_completion",
          source_id: issue.id,
          quantity: "1",
          warehouse_id: warehouseA,
        }),
      );
      expect(first.preview!.entries[0]?.value).toBe(`${partial}.00`);
      const last = await finish(
        await create({
          kind: "manufacturing_completion",
          source_id: issue.id,
          quantity: "3",
          warehouse_id: warehouseA,
        }),
      );
      expect(await balance(finished)).toMatchObject({ quantity: "4.0000", value: `${total}.00000000` });
      const catalogue = await new SourceSalesRepository(pool).lookups(
        maker,
        salesLookupQuerySchema.parse({
          company_id: company,
          kind: "product",
          search: finished,
          warehouse_id: warehouseA,
        }),
      );
      expect(catalogue.items).toEqual([
        expect.objectContaining({ id: finished, type: "goods", quantity: "4.0000", currency: "USD", unit: "Each" }),
      ]);
      expect(catalogue.total).toBe(1);
      const excess = await create({
        kind: "manufacturing_completion",
        source_id: issue.id,
        quantity: "1",
        warehouse_id: warehouseA,
      });
      await expect(
        stock.action(
          maker,
          excess.id,
          { company_id: company, expected_version: 1, action: "submit", reason: "Check excess actual output" },
          key(),
          key(),
        ),
      ).rejects.toMatchObject({ code: "STOCK_PRODUCTION_QUANTITY_EXCEEDED" });
      await expect(finish(await create({ kind: "reversal", operation_id: issue.id }))).rejects.toMatchObject({
        code: "STOCK_REVERSAL_DEPENDENCIES",
      });
      await finish(await create({ kind: "reversal", operation_id: last.id }));
      await finish(await create({ kind: "reversal", operation_id: first.id }));
      await finish(await create({ kind: "reversal", operation_id: issue.id }));
      expect(await balance(finished)).toMatchObject({ quantity: "0.0000", value: "0.00000000" });
      expect(await balance(component)).toMatchObject({ quantity: "15.0000", value: "200.00000000" });
    },
  );
  it.each(["USD", "EUR"])(
    "capitalizes evidenced %s production expenses once, completes partial output and compensates in dependency order",
    async (currency) => {
      const component = await product(),
        finished = await product("fifo", true),
        expense = `${company}-expense`;
      await opening(component, warehouseA, "3", "30");
      const approved = await order(finished, component, "3", "3", [
        {
          kind: "expense",
          expense_account_id: expense,
          description: "Reviewed production service estimate",
          quantity: "1",
          rate: "10",
        },
      ]);
      const issue = await finish(
        await create({
          kind: "manufacturing_issue",
          source_id: approved.id,
          quantity: "3",
          lines: [{ product_id: component, warehouse_id: warehouseA, quantity: "3" }],
        }),
      );
      const supplier = await financial.createParty(
        maker,
        { company_id: company, name: `Actual charge source ${key()}`, kind: "supplier", default_currency: currency },
        key(),
      );
      async function financePost(input: SubledgerRequest) {
        let op = await financial.create(maker, input, key());
        for (const [user, action] of [
          [maker, "submit"],
          [checker, "approve"],
          [poster, "post"],
        ] as const)
          op = await financial.action(
            user,
            op.id,
            {
              company_id: company,
              expected_version: op.version,
              action,
              reason: "Independent actual expense acceptance",
            },
            key(),
          );
        return op;
      }
      const bill = await financePost({
        company_id: company,
        type: "recognition",
        party_id: supplier.id,
        side: "payable",
        kind: "invoice",
        currency,
        amount: "10",
        date: "2026-11-20",
        due_date: "2026-11-20",
        monetary: true,
        reference: "",
        reason: "Evidenced actual production expense",
      });
      const source = (
        await pool.query(
          "select id,base_debit::text amount,currency,fx_rate::text from journal_line where tenant_id=$1 and journal_id=$2 and account_id=$3 and base_debit>0",
          [tenant, bill.journal_id, expense],
        )
      ).rows[0];
      expect(source).toMatchObject({ currency, amount: currency === "USD" ? "10.00000000" : "11.00000000" });
      const input = stockMovementInputSchema.parse({
          company_id: company,
          kind: "manufacturing_charge",
          source_id: issue.id,
          date: "2026-11-20",
          allocations: [{ journal_line_id: source.id, amount: currency === "USD" ? "10" : "11" }],
          reason: "Capitalize independently approved production cost",
        }),
        request = key();
      let charge = await stock.create(maker, input, request, key());
      expect((await stock.create(maker, input, request, key())).id).toBe(charge.id);
      const noFinance = {
        ...maker,
        actor: { ...maker.actor, permissions: permissions.filter((p) => p !== "finance.journal.read") },
      };
      await expect(
        stock.action(
          noFinance,
          charge.id,
          {
            company_id: company,
            expected_version: charge.version,
            action: "submit",
            reason: "Permission guard acceptance",
          },
          key(),
          key(),
        ),
      ).rejects.toMatchObject({ code: "PRODUCTION_SOURCE_PERMISSION_REQUIRED" });
      const competing = [charge, await stock.create(maker, input, key(), key())];
      for (let index = 0; index < competing.length; index++)
        for (const [user, action] of [
          [maker, "submit"],
          [checker, "approve"],
        ] as const) {
          const current = competing[index]!;
          competing[index] = await stock.action(
            user,
            current.id,
            {
              company_id: company,
              expected_version: current.version,
              action,
              reason: "Review competing actual cost allocations",
            },
            key(),
            key(),
          );
        }
      const decisions = await Promise.allSettled(
        competing.map((op) =>
          stock.action(
            poster,
            op.id,
            {
              company_id: company,
              expected_version: op.version,
              action: "post",
              reason: "Post independently reviewed actual expense",
            },
            key(),
            key(),
          ),
        ),
      );
      expect(decisions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const posted = decisions.find((result) => result.status === "fulfilled");
      if (!posted || posted.status !== "fulfilled") throw Error("Actual charge posting did not succeed");
      charge = posted.value;
      expect(charge.preview?.entries).toEqual([]);
      expect(charge.preview?.evidence.production_sources).toEqual([
        expect.objectContaining({ currency, fx_rate: source.fx_rate }),
      ]);
      expect(
        (await pool.query("select count(*)::int n from inventory_stock_entry where operation_id=$1", [charge.id]))
          .rows[0].n,
      ).toBe(0);
      await expect(finish(await stock.create(maker, input, key(), key()))).rejects.toMatchObject({
        code: "PRODUCTION_EXPENSE_OVERALLOCATED",
      });
      const item = (
        await pool.query("select id,original_amount::text from finance_subledger_item where operation_id=$1", [bill.id])
      ).rows[0];
      expect(item.original_amount).toBe("10.00000000");
      const reversalInput: SubledgerRequest = {
        company_id: company,
        type: "reversal",
        operation_id: bill.id,
        date: "2026-11-20",
        reason: "Verify capitalized source dependency",
      };
      await expect(financial.create(maker, reversalInput, key())).rejects.toMatchObject({
        code: "PRODUCTION_COST_SOURCE_ALLOCATED",
      });
      await expect(
        financial.create(
          maker,
          {
            company_id: company,
            type: "recognition",
            party_id: supplier.id,
            side: "payable",
            kind: "credit_note",
            original_item_id: item.id,
            currency,
            amount: "1",
            date: "2026-11-20",
            due_date: "2026-11-20",
            monetary: true,
            reference: "",
            reason: "Allocated source credit protection",
          },
          key(),
        ),
      ).rejects.toMatchObject({ code: "PRODUCTION_COST_SOURCE_ALLOCATED" });
      await expect(
        finish(
          await create({
            kind: "manufacturing_completion",
            source_id: issue.id,
            quantity: "1",
            warehouse_id: warehouseA,
          }),
        ),
      ).rejects.toMatchObject({ code: "PRODUCTION_CHARGE_REVIEW_REQUIRED" });
      const first = await finish(
        await create({
          kind: "manufacturing_completion",
          source_id: issue.id,
          quantity: "1",
          warehouse_id: warehouseA,
          charges_review_reason: "All applicable actual expenses allocated and approved",
        }),
      );
      const last = await finish(
        await create({
          kind: "manufacturing_completion",
          source_id: issue.id,
          quantity: "2",
          warehouse_id: warehouseA,
          charges_review_reason: "All applicable actual expenses allocated and approved",
        }),
      );
      expect(await balance(finished)).toMatchObject({
        quantity: "3.0000",
        value: currency === "USD" ? "40.00000000" : "41.00000000",
      });
      const sums = async () =>
        (
          await pool.query(
            "select l.account_id,sum(l.base_debit-l.base_credit)::text value from journal_line l where l.tenant_id=$1 and l.journal_id=any($2::text[]) group by l.account_id",
            [tenant, [bill.journal_id, issue.journal_id, charge.journal_id, first.journal_id, last.journal_id]],
          )
        ).rows;
      expect(await sums()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ account_id: expense, value: "0.00000000" }),
          expect.objectContaining({ account_id: policy.wip_account_id, value: "0.00000000" }),
        ]),
      );
      await expect(finish(await create({ kind: "reversal", operation_id: charge.id }))).rejects.toMatchObject({
        code: "PRODUCTION_CHARGE_OUTPUT_DEPENDENCY",
      });
      await finish(await create({ kind: "reversal", operation_id: last.id }));
      await finish(await create({ kind: "reversal", operation_id: first.id }));
      await expect(finish(await create({ kind: "reversal", operation_id: issue.id }))).rejects.toMatchObject({
        code: "PRODUCTION_CHARGE_DEPENDENCY",
      });
      await finish(await create({ kind: "reversal", operation_id: charge.id }));
      expect(
        (
          await pool.query(
            "select sum(value)::text value from inventory_production_cost_allocation where batch_id=$1",
            [issue.id],
          )
        ).rows[0].value,
      ).toBe("0.00000000");
      await finish(await create({ kind: "reversal", operation_id: issue.id }));
      expect(await balance(finished)).toMatchObject({ quantity: "0.0000", value: "0.00000000" });
      let compensated = await financial.create(maker, reversalInput, key());
      for (const [user, action] of [
        [maker, "submit"],
        [checker, "approve"],
        [poster, "post"],
      ] as const)
        compensated = await financial.action(
          user,
          compensated.id,
          {
            company_id: company,
            expected_version: compensated.version,
            action,
            reason: "Compensated source reversal acceptance",
          },
          key(),
        );
    },
  );
  it("rejects a changed material base unit after recipe approval before its first actual issue", async () => {
    const component = await product(),
      finished = await product("fifo", true),
      approved = await order(finished, component, "1", "1");
    const current = await inventory.get(maker, company, component);
    await inventory.save(
      maker,
      component,
      productInputSchema.parse({
        company_id: company,
        category_id: `category-fixture-${company}`,
        name: current.name,
        currency: "USD",
        unit: "Kg",
        stock_account_id: stockAccount,
        expected_version: current.version,
      }),
      key(),
      key(),
    );
    await opening(component, warehouseA, "2", "20");
    await expect(
      finish(
        await create({
          kind: "manufacturing_issue",
          source_id: approved.id,
          quantity: "1",
          lines: [{ product_id: component, warehouse_id: warehouseA, quantity: "1" }],
        }),
      ),
    ).rejects.toMatchObject({ code: "PRODUCTION_RECIPE_UNIT_CHANGED" });
    expect(await balance(component)).toMatchObject({ quantity: "2.0000", value: "20.00000000" });
  });
  it("retains replay identity and rejects altered requests without duplicate operations", async () => {
    const id = await product(),
      input: StockMovementInput = stockMovementInputSchema.parse({
        company_id: company,
        date: "2026-11-20",
        kind: "opening",
        reason: "Explicit isolated replay evidence",
        lines: [{ product_id: id, warehouse_id: warehouseA, quantity: "1", value: "10" }],
      }),
      request = key();
    const first = await stock.create(maker, input, request, key());
    expect(await stock.create(maker, input, request, key())).toEqual(first);
    await expect(stock.create(maker, { ...input, reference: "Different" }, request, key())).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });
  it("serializes competing stock issues and invalidates the losing approval without negative stock", async () => {
    const component = await product(),
      finished = await product("fifo", true);
    await opening(component, warehouseA, "5", "50");
    const batchA = await order(finished, component),
      batchB = await order(finished, component);
    async function reviewed(source_id: string) {
      let op = await create({
        kind: "manufacturing_issue",
        source_id,
        quantity: "4",
        lines: [{ product_id: component, warehouse_id: warehouseA, quantity: "4" }],
      });
      for (const [user, action] of [
        [maker, "submit"],
        [checker, "approve"],
      ] as const)
        op = await stock.action(
          user,
          op.id,
          { company_id: company, expected_version: op.version, action, reason: "Review competing actual consumption" },
          key(),
          key(),
        );
      return op;
    }
    const operations = [await reviewed(batchA.id), await reviewed(batchB.id)];
    const results = await Promise.allSettled(
      operations.map((op) =>
        stock.action(
          poster,
          op.id,
          {
            company_id: company,
            expected_version: op.version,
            action: "post",
            reason: "Post reviewed competing consumption",
          },
          key(),
          key(),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await balance(component)).toMatchObject({ quantity: "1.0000", value: "10.00000000" });
    expect(
      (
        await pool.query(
          "select count(*)::int n from inventory_stock_operation where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and state='posted'",
          [tenant, company, operations.map((op) => op.id)],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("rolls back a closed-period posting without stock or journal effects", async () => {
    const id = await product();
    let op = await create({
      kind: "opening",
      lines: [{ product_id: id, warehouse_id: warehouseA, quantity: "1", value: "10" }],
    });
    for (const [user, action] of [
      [maker, "submit"],
      [checker, "approve"],
    ] as const)
      op = await stock.action(
        user,
        op.id,
        { company_id: company, expected_version: op.version, action, reason: "Review period controlled stock" },
        key(),
        key(),
      );
    await pool.query(
      "update financial_period set status='closed' where tenant_id=$1 and company_id=$2 and '2026-11-20'::date between period_start and period_end",
      [tenant, company],
    );
    try {
      await expect(
        stock.action(
          poster,
          op.id,
          {
            company_id: company,
            expected_version: op.version,
            action: "post",
            reason: "Closed period must reject posting",
          },
          key(),
          key(),
        ),
      ).rejects.toMatchObject({ code: "STOCK_PERIOD_UNAVAILABLE" });
      expect(await stock.get(maker, company, op.id)).toMatchObject({
        state: "approved",
        journal_id: null,
        version: op.version,
      });
      expect(
        (
          await pool.query("select count(*)::int n from inventory_stock_entry where tenant_id=$1 and operation_id=$2", [
            tenant,
            op.id,
          ])
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await pool.query(
            "select count(*)::int n from accounting_event where tenant_id=$1 and source_type='inventory_stock' and source_id=$2",
            [tenant, op.id],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await pool.query(
        "update financial_period set status='open' where tenant_id=$1 and company_id=$2 and '2026-11-20'::date between period_start and period_end",
        [tenant, company],
      );
    }
  });
  it("rejects a generic journal reversal that would leave posted stock without its accounting source", async () => {
    const id = await product(),
      op = await opening(id, warehouseA, "1", "10"),
      client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id',$2,true)", [
        tenant,
        poster.actor.userId,
      ]);
      await new FinancePostingService().reverse(await createFinanceTransactionClient(client), {
        tenantId: tenant,
        companyId: company,
        actorId: poster.actor.userId,
        sourceType: "inventory_stock",
        sourceId: op.id,
        eventType: "stock.reversed",
        originalEventType: "stock.posted",
        originalAccountingEventId: op.accounting_event_id!,
        originalJournalId: op.journal_id!,
        postingDate: "2026-11-20",
        transactionCurrency: "USD",
        externalIdempotencyKey: key(),
        payloadHashMaterial: { reason: "Attempt a detached stock reversal" },
      });
      await expect(client.query("commit")).rejects.toThrow(/controlled|Stock journals/);
    } finally {
      await client.query("rollback");
      client.release();
    }
    expect(
      (await pool.query("select status from journal_entry where tenant_id=$1 and id=$2", [tenant, op.journal_id]))
        .rows[0].status,
    ).toBe("posted");
    expect(await balance(id)).toMatchObject({ quantity: "1.0000", value: "10.00000000" });
  });
  it("enforces independent approval, current versions and company permissions", async () => {
    const id = await product();
    let op = await create({
      kind: "opening",
      lines: [{ product_id: id, warehouse_id: warehouseA, quantity: "1", value: "10" }],
    });
    op = await stock.action(
      maker,
      op.id,
      { company_id: company, expected_version: op.version, action: "submit", reason: "Submit isolated evidence" },
      key(),
      key(),
    );
    await expect(
      stock.action(
        maker,
        op.id,
        { company_id: company, expected_version: op.version, action: "approve", reason: "Invalid self approval" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "STOCK_INDEPENDENT_ACTOR_REQUIRED" });
    await expect(
      stock.action(
        checker,
        op.id,
        { company_id: company, expected_version: 1, action: "approve", reason: "Stale approval attempt" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(stock.get(maker, "unrelated-company", op.id)).rejects.toMatchObject({ status: 403 });
    const denied = { ...maker, actor: { ...maker.actor, permissions: [] } };
    await expect(stock.get(denied, company, op.id)).rejects.toMatchObject({ status: 403 });
  });
  it("requires the approver's current company authority at posting time", async () => {
    const id = await product();
    let op = await create({
      kind: "opening",
      lines: [{ product_id: id, warehouse_id: warehouseA, quantity: "1", value: "10" }],
    });
    for (const [user, action] of [
      [maker, "submit"],
      [checker, "approve"],
    ] as const)
      op = await stock.action(
        user,
        op.id,
        { company_id: company, expected_version: op.version, action, reason: "Review live approval authority" },
        key(),
        key(),
      );
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-checker' and permission_key='inventory.stock.approve' and scope_kind='company' and scope_value=$2",
      [tenant, company],
    );
    try {
      await expect(
        stock.action(
          poster,
          op.id,
          {
            company_id: company,
            expected_version: op.version,
            action: "post",
            reason: "Reject revoked reviewer authority",
          },
          key(),
          key(),
        ),
      ).rejects.toMatchObject({ code: "STOCK_APPROVAL_AUTHORITY_CHANGED", status: 403 });
      expect(await stock.get(maker, company, op.id)).toMatchObject({
        state: "approved",
        journal_id: null,
        version: op.version,
      });
    } finally {
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-checker','inventory.stock.approve','company',$2) on conflict do nothing",
        [tenant, company],
      );
    }
  });
  it("rejects caller-supplied source accounting identities", async () => {
    const id = await product(),
      op = await create({
        kind: "opening",
        dimensions: { purchase_line_id: "unrelated-source" },
        lines: [{ product_id: id, warehouse_id: warehouseA, quantity: "1", value: "10" }],
      });
    await expect(
      stock.action(
        maker,
        op.id,
        {
          company_id: company,
          expected_version: op.version,
          action: "submit",
          reason: "Do not accept forged source metadata",
        },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "STOCK_SOURCE_DIMENSION_RESERVED" });
    expect(await stock.get(maker, company, op.id)).toMatchObject({ state: "draft", journal_id: null, version: 1 });
  });
  it("retains immutable evidence and enforces forced RLS with a non-owner runtime role", async () => {
    const role = `stock_rls_${key().replaceAll("-", "")}`,
      client = await pool.connect();
    const tables = [
      "inventory_stock_entry",
      "inventory_stock_operation",
      "inventory_stock_cost_allocation",
      "inventory_stock_policy",
      "inventory_stock_valuation",
      "inventory_stock_audit",
      "inventory_stock_request",
      "inventory_receipt_bill_match",
    ];
    await pool.query(`create role ${role} nologin nosuperuser nobypassrls`);
    try {
      await pool.query(`grant usage on schema public to ${role}`);
      for (const table of tables) await pool.query(`grant select on ${table} to ${role}`);
      await client.query("begin");
      await client.query(`set local role ${role}`);
      await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      expect((await client.query("select count(*)::int n from inventory_stock_entry")).rows[0].n).toBeGreaterThan(0);
      await client.query("select set_config('nexora.tenant_id','unrelated-tenant',true)");
      for (const table of tables)
        expect((await client.query(`select count(*)::int n from ${table}`)).rows[0].n).toBe(0);
      await client.query("rollback");
      await expect(
        pool.query("update inventory_stock_entry set value=value+1 where tenant_id=$1", [tenant]),
      ).rejects.toThrow(/immutable|append.only/i);
      await expect(pool.query("delete from inventory_receipt_bill_match where tenant_id=$1", [tenant])).rejects.toThrow(
        /immutable|append.only/i,
      );
    } finally {
      await client.query("rollback");
      client.release();
      await pool.query(`drop owned by ${role}`);
      await pool.query(`drop role ${role}`);
    }
  });
});
