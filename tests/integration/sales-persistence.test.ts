import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import {
  setupSubledgerFixture,
  subledgerActor,
  subledgerPermissions,
  configureCustomerCreditFixture,
} from "./subledger-fixture.js";
import { SourceSalesRepository } from "../../server/api/src/modules/sales/source-repository.js";
import { SourceInventoryRepository } from "../../server/api/src/modules/inventory/source-repository.js";
import { SourceReferenceMasterRepository } from "../../server/api/src/modules/master-data/source-repository.js";
import { SourceStockRepository } from "../../server/api/src/modules/inventory/stock-repository.js";
import { SourceManufacturingRepository } from "../../server/api/src/modules/manufacturing/source-repository.js";
import { SourceTaxRepository } from "../../server/api/src/modules/finance/taxes/source-repository.js";
import { ensureSourceSuperAdministratorFixture } from "./source-security-fixture.js";
import {
  salesDocumentInputSchema,
  salesLineInputSchema,
  salesQuerySchema,
  salesLookupQuerySchema,
  subledgerQuerySchema,
  productInputSchema,
  bomInputSchema,
  warehouseInputSchema,
  stockMovementInputSchema,
  stockQuerySchema,
  manufacturingOrderInputSchema,
  taxInputSchema,
  type SalesDocumentInput,
  type SalesDetail,
  type SubledgerOperation,
  type StockOperation,
} from "../../packages/contracts/src/index.js";

const key = () => randomUUID(),
  permissions = [
    ...subledgerPermissions,
    "sales.document.read",
    "sales.document.create",
    "sales.document.approve",
    "inventory.item.read",
    "inventory.item.create",
    "inventory.bin.create",
    "inventory.bin.read",
    "master_data.project.manage",
    "master_data.location.manage",
    "inventory.stock.read",
    "inventory.stock.manage",
    "inventory.stock.approve",
    "inventory.stock.post",
    "inventory.stock.configure",
    "manufacturing.bom.read",
    "manufacturing.bom.create",
    "manufacturing.order.read",
    "manufacturing.order.create",
    "manufacturing.order.approve",
  ];
const actor = (user = "r06.maker") => {
  const context = subledgerActor(user);
  return { ...context, actor: { ...context.actor, permissions } };
};
describe("Canonical persistent commercial Sales", () => {
  let db: Awaited<ReturnType<typeof createDisposableSourceDatabase>>,
    fixture: Awaited<ReturnType<typeof setupSubledgerFixture>>,
    repo: SourceSalesRepository;
  let customer: string, project: string, location: string, product: string, warehouse: string, outputTax: string;
  beforeAll(async () => {
    db = await createDisposableSourceDatabase(
      process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_source_test",
    );
    fixture = await setupSubledgerFixture(db.pool, undefined, "USD");
    repo = new SourceSalesRepository(db.pool);
    for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"]) {
      await db.pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,$2,p,'all' from unnest($3::text[])p on conflict do nothing",
        [fixture.tenant, policy, permissions],
      );
      await db.pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,$2,p,'company',$4 from unnest($3::text[])p on conflict do nothing",
        [fixture.tenant, policy, permissions, fixture.company],
      );
    }
    customer = (
      await fixture.repository.createParty(
        actor(),
        {
          company_id: fixture.company,
          kind: "customer",
          name: "Actual isolated commercial customer",
          default_currency: "USD",
        },
        key(),
      )
    ).id;
    const masters = new SourceReferenceMasterRepository(db.pool);
    project = (
      await masters.create(
        actor(),
        "projects",
        { company_id: fixture.company, name: "Actual isolated customer project" },
        key(),
        key(),
      )
    ).record.id;
    location = (
      await masters.create(
        actor(),
        "locations",
        { company_id: fixture.company, name: "Actual isolated customer location" },
        key(),
        key(),
      )
    ).record.id;
    product = (
      await new SourceInventoryRepository(db.pool).save(
        actor(),
        null,
        productInputSchema.parse({
          category_id: "category-fixture-" + fixture.company,
          company_id: fixture.company,
          name: "Actual canonical sale product",
          currency: "USD",
          unit: "Each",
        }),
        key(),
        key(),
      )
    ).record.id;
    warehouse = (
      await new SourceInventoryRepository(db.pool).saveWarehouse(
        actor(),
        null,
        warehouseInputSchema.parse({ company_id: fixture.company, name: "Actual fulfillment warehouse" }),
        key(),
        key(),
      )
    ).record.id;
  }, 90000);
  afterAll(async () => {
    await db?.close();
  });
  const input = (patch: Partial<SalesDocumentInput> = {}) =>
    salesDocumentInputSchema.parse({
      company_id: fixture.company,
      kind: "quotation",
      customer_id: customer,
      currency: "USD",
      document_date: "2026-11-20",
      project_id: project,
      location_id: location,
      no_tax_reason: "Explicit isolated non-taxed acceptance scenario",
      lines: [{ product_id: product, description: "Actual commercial units", quantity: "3", unit_price: "10.25" }],
      ...patch,
    });
  const action = (
    saved: SalesDetail,
    value: "submit" | "approve" | "reject" | "revise" | "cancel" | "pause" | "resume",
    user = "r06.maker",
    identity = key(),
  ) =>
    repo.action(
      actor(user),
      saved.record.id,
      {
        company_id: fixture.company,
        expected_version: saved.record.version,
        action: value,
        reason: "Explicit isolated commercial lifecycle acceptance",
      },
      identity,
      key(),
    );
  const approvedOrder = async (quantity = "3") =>
    action(
      await repo.save(
        actor(),
        null,
        input({ kind: "order", lines: [{ ...input().lines[0]!, quantity }] }),
        key(),
        key(),
      ),
      "approve",
    );
  const financial = async (op: SubledgerOperation) => {
    for (const [command, user] of [
      ["submit", "r06.maker"],
      ["approve", "r06.checker"],
      ["post", "r06.target"],
    ] as const)
      op = await fixture.repository.action(
        actor(user),
        op.id,
        {
          company_id: fixture.company,
          expected_version: op.version,
          action: command,
          reason: "Explicit isolated independent financial review",
        },
        key(),
      );
    return op;
  };
  it("persists canonical customer/product references, exact amounts and immutable audit across reload", async () => {
    const saved = await repo.save(actor(), null, input(), key(), key()),
      loaded = await repo.get(actor(), fixture.company, saved.record.id);
    expect(loaded).toEqual(saved);
    expect(saved.record).toMatchObject({
      code: "QTN-001",
      state: "draft",
      version: 1,
      customer_id: customer,
      total_amount: "30.75000000",
      net_amount: "30.75000000",
      tax_amount: "0.00000000",
      posting_state: "unprepared",
    });
    expect(saved.record.lines[0]).toMatchObject({
      product_id: product,
      product_code: "PRD-001",
      quantity: "3",
      base_quantity: "3",
      unit: "Each",
    });
    expect(saved.events).toHaveLength(1);
    expect(saved.events[0]).toMatchObject({ action: "created", actor_id: "r06.maker", version: 1 });
    expect(
      (
        await db.pool.query("select count(*)::int n from journal_entry where tenant_id=$1 and company_id=$2", [
          fixture.tenant,
          fixture.company,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("replays a draft identity without allocating another code and rejects changed retry bodies", async () => {
    const request = key(),
      body = input(),
      saved = await repo.save(actor(), null, body, request, key());
    expect(await repo.save(actor(), null, body, request, key())).toEqual(saved);
    await expect(repo.save(actor(), null, { ...body, reference: "Changed" }, request, key())).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });
  it("reorders and archives lines without losing their source identities or prior audit", async () => {
    let saved = await repo.save(
      actor(),
      null,
      input({
        lines: [
          { ...input().lines[0]!, quantity: "1" },
          { ...input().lines[0]!, quantity: "2", description: "Second actual line" },
        ],
      }),
      key(),
      key(),
    );
    const original = saved.record.lines;
    const editable = () =>
      input({
        expected_version: saved.record.version,
        lines: saved.record.lines.map((line) => salesLineInputSchema.strip().parse(line)),
      });
    saved = await repo.save(
      actor(),
      saved.record.id,
      { ...editable(), lines: [original[1]!, original[0]!].map((line) => salesLineInputSchema.strip().parse(line)) },
      key(),
      key(),
    );
    expect(saved.record.lines.map((line) => line.id)).toEqual([original[1]!.id, original[0]!.id]);
    saved = await repo.save(
      actor(),
      saved.record.id,
      { ...editable(), lines: [salesLineInputSchema.strip().parse(saved.record.lines[0]!)] },
      key(),
      key(),
    );
    expect(saved.record.lines).toHaveLength(1);
    expect(saved.events).toHaveLength(3);
    expect(
      (
        await db.pool.query(
          "select count(*)::int all_lines,count(*)filter(where active)::int active_lines from sales_document_line where tenant_id=$1 and company_id=$2 and document_id=$3",
          [fixture.tenant, fixture.company, saved.record.id],
        )
      ).rows[0],
    ).toEqual({ all_lines: 2, active_lines: 1 });
  });
  it("bounds live directories and lists, returns actual stock availability, and rejects foreign company scope", async () => {
    const catalogue = await repo.lookups(
      actor(),
      salesLookupQuerySchema.parse({ company_id: fixture.company, kind: "product" }),
    );
    expect(catalogue.items).toHaveLength(1);
    expect(catalogue.items[0]).toMatchObject({
      id: product,
      name: "Actual canonical sale product",
      quantity: "0",
      currency: "USD",
    });
    const customers = await repo.lookups(
      actor(),
      salesLookupQuerySchema.parse({ company_id: fixture.company, kind: "customer" }),
    );
    expect(customers.items.map((row) => row.id)).toEqual([customer]);
    const page = await repo.list(
      actor(),
      salesQuerySchema.parse({ company_id: fixture.company, kind: "quotation", limit: 1 }),
    );
    expect(page.items).toHaveLength(1);
    expect(page.total).toBeGreaterThan(1);
    expect(
      (
        await repo.list(
          actor(),
          salesQuerySchema.parse({ company_id: fixture.company, kind: "quotation", search: "%" }),
        )
      ).items,
    ).toEqual([]);
    await expect(
      repo.list(actor(), salesQuerySchema.parse({ company_id: "unrelated-company", kind: "quotation" })),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects non-owner edits, stale versions and forged line identities", async () => {
    const saved = await repo.save(actor(), null, input(), key(), key());
    await expect(
      repo.save(actor("r06.checker"), saved.record.id, input({ expected_version: 1 }), key(), key()),
    ).rejects.toMatchObject({ code: "SALES_DRAFT_LOCKED", status: 403 });
    await expect(
      repo.save(actor(), saved.record.id, input({ expected_version: 2 }), key(), key()),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(
      repo.save(
        actor(),
        null,
        input({ lines: [{ ...input().lines[0]!, id: saved.record.lines[0]!.id }] }),
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "SALES_LINE_IDENTITY_INVALID" });
  });
  it("rolls back source writes that omit a matching versioned audit", async () => {
    const saved = await repo.save(actor(), null, input(), key(), key()),
      client = await db.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.maker',true)",
        [fixture.tenant],
      );
      await client.query(
        "update sales_document set row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
        [fixture.tenant, fixture.company, saved.record.id],
      );
      await expect(client.query("commit")).rejects.toThrow(/versioned audit/);
    } finally {
      await client.query("rollback");
      client.release();
    }
    expect((await repo.get(actor(), fixture.company, saved.record.id)).record.version).toBe(1);
  });
  it("excludes the creator from independent approver lookups without removing creator approval", async () => {
    const scope = salesLookupQuerySchema.parse({ company_id: fixture.company, kind: "approver" });
    const makerReviewers = await repo.lookups(actor(), scope);
    expect(makerReviewers.items.map((item) => item.id)).not.toContain("r06.maker");
    expect(makerReviewers.items.map((item) => item.id)).toContain("r06.checker");
    const checkerReviewers = await repo.lookups(actor("r06.checker"), scope);
    expect(checkerReviewers.items.map((item) => item.id)).not.toContain("r06.checker");
    expect(checkerReviewers.items.map((item) => item.id)).toContain("r06.maker");
    await expect(repo.save(actor(), null, input({ approver_id: "r06.maker" }), key(), key())).rejects.toMatchObject({
      code: "SALES_APPROVER_INVALID",
    });
    const draft = await repo.save(actor(), null, input({ approver_id: null }), key(), key());
    expect(draft.record).toMatchObject({ state: "draft", approver_id: null });
    expect((await action(draft, "approve")).record.state).toBe("approved");
  });
  it("enforces optional named review, current authority, immutable approval and replay", async () => {
    let saved = await repo.save(actor(), null, input({ approver_id: "r06.checker" }), key(), key());
    await expect(action(saved, "approve")).rejects.toMatchObject({ code: "SALES_STATE_CONFLICT" });
    saved = await action(saved, "submit");
    await expect(action(saved, "approve")).rejects.toMatchObject({ code: "SALES_ACTOR_REQUIRED" });
    const request = key(),
      submitted = saved;
    saved = await action(submitted, "approve", "r06.checker", request);
    expect(await action(submitted, "approve", "r06.checker", request)).toEqual(saved);
    expect(saved.record).toMatchObject({ state: "approved", version: 3, posting_state: "unprepared" });
    await expect(
      repo.save(actor(), saved.record.id, input({ expected_version: 3 }), key(), key()),
    ).rejects.toMatchObject({ code: "SALES_DRAFT_LOCKED" });
    expect(saved.events.map((event) => event.action)).toEqual(["approve", "submit", "created"]);
  });
  it("preserves explicit creator confirmation and blocks quantity over-invoicing at the database boundary", async () => {
    const order = await approvedOrder(),
      draft = await repo.derive(actor(), order.record.id, {
        company_id: fixture.company,
        expected_version: order.record.version,
        kind: "invoice",
        document_date: "2026-11-20",
      });
    const first = await action(
      await repo.save(
        actor(),
        null,
        { ...draft, due_date: "2026-12-20", lines: draft.lines.map((line) => ({ ...line, quantity: "2" })) },
        key(),
        key(),
      ),
      "approve",
    );
    expect(first.record).toMatchObject({ state: "approved", source_id: order.record.id, posting_state: "unprepared" });
    const second = await repo.save(
      actor(),
      null,
      { ...draft, due_date: "2026-12-20", lines: draft.lines.map((line) => ({ ...line, quantity: "2" })) },
      key(),
      key(),
    );
    await expect(action(second, "approve")).rejects.toMatchObject({ code: "OPERATION_INTEGRITY_CONFLICT" });
    expect((await repo.get(actor(), fixture.company, second.record.id)).record.state).toBe("draft");
    const remainder = await repo.derive(actor(), order.record.id, {
      company_id: fixture.company,
      expected_version: order.record.version,
      kind: "invoice",
      document_date: "2026-11-20",
    });
    expect(remainder.lines[0]!.quantity).toBe("1");
    await expect(action(order, "cancel")).rejects.toMatchObject({ code: "OPERATION_INTEGRITY_CONFLICT" });
    await action(first, "cancel");
    await action(second, "cancel");
    expect((await action(order, "cancel")).record.state).toBe("cancelled");
  });
  it("serializes competing delivery confirmations without double reserving source quantities", async () => {
    const order = await approvedOrder("2"),
      draft = await repo.derive(actor(), order.record.id, {
        company_id: fixture.company,
        expected_version: order.record.version,
        kind: "delivery",
        document_date: "2026-11-20",
        warehouse_id: warehouse,
      });
    const one = await repo.save(actor(), null, draft, key(), key()),
      two = await repo.save(actor(), null, draft, key(), key());
    const outcomes = await Promise.allSettled([action(one, "approve"), action(two, "approve")]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(
      repo.derive(actor(), order.record.id, {
        company_id: fixture.company,
        expected_version: order.record.version,
        kind: "delivery",
        document_date: "2026-11-20",
      }),
    ).rejects.toMatchObject({ code: "SALES_SOURCE_EXHAUSTED" });
    expect(
      (
        await db.pool.query("select count(*)::int n from inventory_stock_entry where tenant_id=$1 and company_id=$2", [
          fixture.tenant,
          fixture.company,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("retains direct invoice fulfillment identities and requires a real warehouse at confirmation", async () => {
    const invoice = await action(
      await repo.save(actor(), null, input({ kind: "invoice", due_date: "2026-12-20" }), key(), key()),
      "approve",
    );
    expect(invoice.record.lines[0]!.fulfillment_source_id).toBe(invoice.record.id);
    const draft = await repo.derive(actor(), invoice.record.id, {
      company_id: fixture.company,
      expected_version: invoice.record.version,
      kind: "delivery",
      document_date: "2026-11-20",
    });
    const missing = await repo.save(actor(), null, draft, key(), key());
    await expect(action(missing, "approve")).rejects.toMatchObject({ code: "OPERATION_INTEGRITY_CONFLICT" });
    const saved = await repo.save(
      actor(),
      missing.record.id,
      { ...draft, warehouse_id: warehouse, expected_version: missing.record.version },
      key(),
      key(),
    );
    expect((await action(saved, "approve")).record.lines[0]!.fulfillment_source_id).toBe(invoice.record.id);
  });
  it("keeps recurring generation explicit, period-idempotent and pausable without altering existing invoices", async () => {
    const service = (
      await new SourceInventoryRepository(db.pool).save(
        actor(),
        null,
        productInputSchema.parse({
          category_id: "category-fixture-" + fixture.company,
          company_id: fixture.company,
          name: "Actual recurring service",
          currency: "USD",
          unit: "Each",
          type: "service",
          track_inventory: false,
        }),
        key(),
        key(),
      )
    ).record.id;
    let template = await action(
      await repo.save(
        actor(),
        null,
        input({
          kind: "recurring",
          customer_id: null,
          recurrence: {
            enabled: true,
            frequency: "monthly",
            start_date: "2026-11-20",
            end_date: null,
            customer_ids: [customer],
          },
          lines: [{ ...input().lines[0]!, product_id: service, quantity: "1", unit_price: "12" }],
        }),
        key(),
        key(),
      ),
      "approve",
    );
    const draft = await repo.derive(actor(), template.record.id, {
      company_id: fixture.company,
      expected_version: template.record.version,
      kind: "invoice",
      customer_id: customer,
      billing_period: "2026-11-01",
      document_date: "2026-11-20",
    });
    const invoice = await repo.save(actor(), null, { ...draft, due_date: "2026-12-20" }, key(), key());
    await expect(repo.save(actor(), null, { ...draft, due_date: "2026-12-20" }, key(), key())).rejects.toMatchObject({
      code: "OPERATION_INTEGRITY_CONFLICT",
    });
    template = await action(template, "pause");
    await expect(
      repo.derive(actor(), template.record.id, {
        company_id: fixture.company,
        expected_version: template.record.version,
        kind: "invoice",
        customer_id: customer,
        billing_period: "2026-12-01",
        document_date: "2026-12-01",
      }),
    ).rejects.toMatchObject({ code: "SALES_RECURRING_INELIGIBLE" });
    expect((await repo.get(actor(), fixture.company, invoice.record.id)).record.total_amount).toBe("12.00000000");
    expect((await action(template, "resume")).record.recurrence?.enabled).toBe(true);
  });
  it("fails closed on missing tax treatment, stale products and excess native-currency precision", async () => {
    const missing = await repo.save(actor(), null, input({ no_tax_reason: "" }), key(), key());
    await expect(action(missing, "approve")).rejects.toMatchObject({ code: "SALES_CONFIGURATION_REQUIRED" });
    await expect(
      repo.save(actor(), null, input({ lines: [{ ...input().lines[0]!, unit_price: "0.001" }] }), key(), key()),
    ).rejects.toThrow(/precision/);
    const saved = await repo.save(actor(), null, input(), key(), key());
    const inventory = new SourceInventoryRepository(db.pool),
      record = await inventory.get(actor(), fixture.company, product);
    await inventory.save(
      actor(),
      product,
      productInputSchema
        .strip()
        .parse({ ...record, name: "Reviewed revised canonical product", expected_version: record.version }),
      key(),
      key(),
    );
    await expect(action(saved, "approve")).rejects.toMatchObject({ code: "SALES_REVIEW_STALE" });
  });
  it("posts the approved Sales invoice once through AR and reconciles a partial receipt to the real bank", async () => {
    await configureCustomerCreditFixture(fixture, customer);
    const invoice = await action(
      await repo.save(actor(), null, input({ kind: "invoice", due_date: "2026-12-20" }), key(), key()),
      "approve",
    );
    const prepare = {
      company_id: fixture.company,
      expected_version: invoice.record.version,
      reason: "Review actual commercial invoice accounting",
    };
    let op = await fixture.repository.prepareSales(actor(), invoice.record.id, prepare, key());
    expect((await fixture.repository.prepareSales(actor(), invoice.record.id, prepare, key())).id).toBe(op.id);
    await expect(
      fixture.repository.action(
        actor(),
        op.id,
        {
          company_id: fixture.company,
          expected_version: op.version,
          action: "approve",
          reason: "Attempt maker self approval",
        },
        key(),
      ),
    ).rejects.toThrow();
    op = await financial(op);
    let loaded = await repo.get(actor(), fixture.company, invoice.record.id);
    expect(loaded.record).toMatchObject({
      posting_state: "posted",
      financial_operation_id: op.id,
      subledger_item_id: op.id,
      outstanding: "30.75000000",
    });
    expect(op.preview?.lines.map((line) => line.accountId).sort()).toEqual(
      [fixture.policy.receivable_account_id, fixture.policy.revenue_account_id].sort(),
    );
    const receipt = await financial(
      await fixture.repository.create(
        actor(),
        {
          company_id: fixture.company,
          type: "settlement",
          side: "receivable",
          party_id: customer,
          date: "2026-11-20",
          reference: invoice.record.code,
          reason: "Actual partial customer receipt",
          bank_account_id: fixture.banks.USD!,
          payment_currency: "USD",
          payment_amount: "15",
          bank_fee: "0",
          allocations: [{ item_id: op.id, amount: "15" }],
          dimensions: { project, location },
        },
        key(),
      ),
    );
    loaded = await repo.get(actor(), fixture.company, invoice.record.id);
    expect(loaded.record.outstanding).toBe("15.75000000");
    const bank = (
      await db.pool.query(
        "select sum(l.debit-l.credit)::text amount from journal_line l join journal_entry j on(j.tenant_id,j.id)=(l.tenant_id,l.journal_id) join bank_account b on(b.tenant_id,b.company_id,b.account_id)=(j.tenant_id,j.company_id,l.account_id) where b.tenant_id=$1 and b.company_id=$2 and b.id=$3",
        [fixture.tenant, fixture.company, fixture.banks.USD],
      )
    ).rows[0];
    expect(bank.amount).toBe("15.00000000");
    expect(
      (
        await db.pool.query(
          "select count(*)::int n from(select j.id from journal_entry j join journal_line l on(l.tenant_id,l.journal_id)=(j.tenant_id,j.id) where j.tenant_id=$1 and j.company_id=$2 and j.id=any($3::text[]) group by j.id having sum(l.base_debit-l.base_credit)=0) balanced",
          [fixture.tenant, fixture.company, [op.journal_id, receipt.journal_id]],
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await fixture.repository.workspace(
          actor(),
          subledgerQuerySchema.parse({
            company_id: fixture.company,
            as_of: "2026-11-20",
            sales_document_id: invoice.record.id,
          }),
        )
      ).operations.map((item) => item.id),
    ).toEqual([receipt.id, op.id]);
    await expect(action(invoice, "cancel")).rejects.toMatchObject({ code: "OPERATION_INTEGRITY_CONFLICT" });
  });
  it("requires actual posted delivery before delivered-policy invoice accounting", async () => {
    const inventory = new SourceInventoryRepository(db.pool),
      delivered = (
        await inventory.save(
          actor(),
          null,
          productInputSchema.parse({
            category_id: "category-fixture-" + fixture.company,
            company_id: fixture.company,
            name: "Actual delivered-policy goods",
            currency: "USD",
            unit: "Each",
            invoice_policy: "delivered",
          }),
          key(),
          key(),
        )
      ).record.id;
    const invoice = await action(
      await repo.save(
        actor(),
        null,
        input({ kind: "invoice", due_date: "2026-12-20", lines: [{ ...input().lines[0]!, product_id: delivered }] }),
        key(),
        key(),
      ),
      "approve",
    );
    await expect(
      fixture.repository.prepareSales(
        actor(),
        invoice.record.id,
        {
          company_id: fixture.company,
          expected_version: invoice.record.version,
          reason: "Attempt invoice before actual delivery",
        },
        key(),
      ),
    ).rejects.toMatchObject({ code: "SALES_POSTED_DELIVERY_REQUIRED" });
  });
  it("keeps financial credits separate from stock and links the unreversed original invoice", async () => {
    const invoice = await action(
      await repo.save(actor(), null, input({ kind: "invoice", due_date: "2026-12-20" }), key(), key()),
      "approve",
    );
    const original = await financial(
      await fixture.repository.prepareSales(
        actor(),
        invoice.record.id,
        {
          company_id: fixture.company,
          expected_version: invoice.record.version,
          reason: "Original invoice for credit acceptance",
        },
        key(),
      ),
    );
    const draft = await repo.derive(actor(), invoice.record.id, {
      company_id: fixture.company,
      expected_version: invoice.record.version,
      kind: "credit",
      document_date: "2026-11-21",
    });
    const credit = await action(
      await repo.save(
        actor(),
        null,
        { ...draft, lines: draft.lines.map((line) => ({ ...line, quantity: "1" })) },
        key(),
        key(),
      ),
      "approve",
    );
    const op = await financial(
      await fixture.repository.prepareSales(
        actor(),
        credit.record.id,
        {
          company_id: fixture.company,
          expected_version: credit.record.version,
          reason: "Actual source-linked credit acceptance",
        },
        key(),
      ),
    );
    expect(op.input).toMatchObject({
      sales_document_id: credit.record.id,
      original_item_id: original.id,
      kind: "credit_note",
    });
    expect(op.preview?.item?.original_amount).toBe("-10.25");
    expect(
      (
        await db.pool.query("select count(*)::int n from inventory_stock_entry where tenant_id=$1 and company_id=$2", [
          fixture.tenant,
          fixture.company,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("connects actual manufacturing to Sales delivery, AR, bank receipt and separately costed return/credit", async () => {
    const stock = new SourceStockRepository(db.pool),
      inventory = new SourceInventoryRepository(db.pool),
      manufacturing = new SourceManufacturingRepository(db.pool);
    const accounts: Record<string, string> = {};
    for (const [name, type] of [
      ["stock", "asset"],
      ["grni", "liability"],
      ["opening", "equity"],
      ["wip", "asset"],
      ["variance", "expense"],
    ]) {
      const id = `sales-stock-${key()}`;
      accounts[name!] = id;
      await db.pool.query(
        "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,$1,$4,$5,false,'active',clock_timestamp())",
        [id, fixture.tenant, fixture.company, name, type],
      );
    }
    await stock.configure(
      actor(),
      {
        company_id: fixture.company,
        expected_version: 0,
        receipt_accrual_account_id: accounts.grni!,
        opening_account_id: accounts.opening!,
        wip_account_id: accounts.wip!,
        variance_account_id: accounts.variance!,
        reason: "Explicit reviewed isolated stock mapping",
      },
      key(),
      key(),
    );
    const createProduct = async (manufacture_enabled: boolean) => {
      const saved = (
        await inventory.save(
          actor(),
          null,
          productInputSchema.parse({
            category_id: "category-fixture-" + fixture.company,
            company_id: fixture.company,
            name: `Actual ${manufacture_enabled ? "finished output" : "component"} ${key()}`,
            currency: "USD",
            unit: "Each",
            manufacture_enabled,
            invoice_policy: "delivered",
            stock_account_id: accounts.stock!,
            income_account_id: fixture.policy.revenue_account_id,
            expense_account_id: fixture.policy.expense_account_id,
          }),
          key(),
          key(),
        )
      ).record;
      await stock.configureValuation(
        actor(),
        {
          company_id: fixture.company,
          product_id: saved.id,
          expected_version: 0,
          method: "fifo",
          reason: "Actual isolated valuation approval",
        },
        key(),
        key(),
      );
      return saved.id;
    };
    const component = await createProduct(false),
      finished = await createProduct(true);
    const finishStock = async (op: StockOperation) => {
      for (const [command, user] of [
        ["submit", "r06.maker"],
        ["approve", "r06.checker"],
        ["post", "r06.target"],
      ] as const)
        op = await stock.action(
          actor(user),
          op.id,
          {
            company_id: fixture.company,
            expected_version: op.version,
            action: command,
            reason: "Independent isolated actual stock review",
          },
          key(),
          key(),
        );
      return op;
    };
    const createStock = (patch: Record<string, unknown>) =>
      stock.create(
        actor(),
        stockMovementInputSchema.parse({
          company_id: fixture.company,
          date: "2026-11-20",
          reason: "Actual physical evidence",
          ...patch,
        }),
        key(),
        key(),
      );
    await finishStock(
      await createStock({
        kind: "opening",
        lines: [{ product_id: component, warehouse_id: warehouse, quantity: "4", value: "40" }],
      }),
    );
    await manufacturing.saveBom(
      actor(),
      null,
      bomInputSchema.parse({
        company_id: fixture.company,
        product_id: finished,
        output_quantity: "2",
        warehouse_id: warehouse,
        lines: [{ product_id: component, quantity: "4" }],
      }),
      key(),
      key(),
    );
    let production = (
      await manufacturing.saveOrder(
        actor(),
        null,
        manufacturingOrderInputSchema.parse({
          company_id: fixture.company,
          product_id: finished,
          quantity: "2",
          order_date: "2026-11-20",
          project_id: project,
          location_id: location,
        }),
        key(),
        key(),
      )
    ).record;
    production = (
      await manufacturing.action(
        actor("r06.checker"),
        production.id,
        { company_id: fixture.company, expected_version: production.version, action: "approve" },
        key(),
        key(),
      )
    ).record;
    const issue = await finishStock(
      await createStock({
        kind: "manufacturing_issue",
        source_id: production.id,
        quantity: "2",
        lines: [{ product_id: component, warehouse_id: warehouse, quantity: "4" }],
      }),
    );
    await finishStock(
      await createStock({
        kind: "manufacturing_completion",
        source_id: issue.id,
        quantity: "2",
        warehouse_id: warehouse,
      }),
    );
    const actual = await repo.lookups(
      actor(),
      salesLookupQuerySchema.parse({
        company_id: fixture.company,
        kind: "product",
        search: finished,
        warehouse_id: warehouse,
      }),
    );
    expect(actual.items[0]).toMatchObject({ id: finished, quantity: "2.0000" });
    const order = await action(
      await repo.save(
        actor(),
        null,
        input({
          kind: "order",
          warehouse_id: warehouse,
          lines: [
            { ...input().lines[0]!, product_id: finished, quantity: "1", unit_price: "30" },
            {
              ...input().lines[0]!,
              product_id: finished,
              quantity: "1",
              unit_price: "30",
              description: "Second separately priced unit",
            },
          ],
        }),
        key(),
        key(),
      ),
      "approve",
    );
    const delivery = await action(
      await repo.save(
        actor(),
        null,
        await repo.derive(actor(), order.record.id, {
          company_id: fixture.company,
          expected_version: order.record.version,
          kind: "delivery",
          document_date: "2026-11-20",
        }),
        key(),
        key(),
      ),
      "approve",
    );
    const delivered = await finishStock(
      await createStock({
        kind: "delivery",
        source_id: delivery.record.id,
        source_version: delivery.record.version,
        warehouse_id: warehouse,
      }),
    );
    expect(delivered.preview?.entries).toHaveLength(1);
    expect(delivered.preview?.entries[0]).toMatchObject({ product_id: finished, quantity: "-2", value: "-40.00" });
    expect(delivered.preview?.evidence.sales_lines).toMatchObject([
      { base_quantity: "1", value: "20.00" },
      { base_quantity: "1", value: "20.00" },
    ]);
    const draft = await repo.derive(actor(), order.record.id, {
      company_id: fixture.company,
      expected_version: order.record.version,
      kind: "invoice",
      document_date: "2026-11-20",
    });
    const invoice = await action(
      await repo.save(actor(), null, { ...draft, due_date: "2026-12-20" }, key(), key()),
      "approve",
    );
    const ar = await financial(
      await fixture.repository.prepareSales(
        actor(),
        invoice.record.id,
        {
          company_id: fixture.company,
          expected_version: invoice.record.version,
          reason: "Recognize actually delivered manufactured goods",
        },
        key(),
      ),
    );
    expect(ar.preview?.item?.original_amount).toBe("60.00");
    expect(
      (
        await stock.workspace(
          actor(),
          stockQuerySchema.parse({
            company_id: fixture.company,
            as_of: "2026-11-20",
            product_id: finished,
            warehouse_id: warehouse,
          }),
        )
      ).balances[0],
    ).toMatchObject({ quantity: "0.0000", value: "0.00000000" });
    const returnDraft = await repo.derive(actor(), delivery.record.id, {
      company_id: fixture.company,
      expected_version: delivery.record.version,
      kind: "return",
      document_date: "2026-11-20",
    });
    const returned = await action(
      await repo.save(actor(), null, { ...returnDraft, lines: [returnDraft.lines[0]!] }, key(), key()),
      "approve",
    );
    const physicalReturn = await finishStock(
      await createStock({
        kind: "return",
        source_id: returned.record.id,
        source_version: returned.record.version,
        warehouse_id: warehouse,
      }),
    );
    expect(physicalReturn.preview?.entries[0]).toMatchObject({ quantity: "1", value: "20.00" });
    expect(physicalReturn.preview?.entries[0]?.original_entry_id).toBeTruthy();
    const creditDraft = await repo.derive(actor(), invoice.record.id, {
      company_id: fixture.company,
      expected_version: invoice.record.version,
      kind: "credit",
      document_date: "2026-11-20",
    });
    const credit = await action(
      await repo.save(actor(), null, { ...creditDraft, lines: [creditDraft.lines[0]!] }, key(), key()),
      "approve",
    );
    const credited = await financial(
      await fixture.repository.prepareSales(
        actor(),
        credit.record.id,
        {
          company_id: fixture.company,
          expected_version: credit.record.version,
          reason: "Credit original manufactured invoice line",
        },
        key(),
      ),
    );
    await financial(
      await fixture.repository.create(
        actor(),
        {
          company_id: fixture.company,
          type: "settlement",
          side: "receivable",
          party_id: customer,
          date: "2026-11-20",
          reference: invoice.record.code,
          reason: "Receipt for retained delivered unit",
          bank_account_id: fixture.banks.USD!,
          payment_currency: "USD",
          payment_amount: "30",
          bank_fee: "0",
          allocations: [{ item_id: ar.id, amount: "30" }],
        },
        key(),
      ),
    );
    await financial(
      await fixture.repository.create(
        actor(),
        {
          company_id: fixture.company,
          type: "offset",
          side: "receivable",
          party_id: customer,
          date: "2026-11-20",
          reference: credit.record.code,
          reason: "Apply actual invoice credit without restocking again",
          allocations: [
            { item_id: ar.id, amount: "30" },
            { item_id: credited.id, amount: "30" },
          ],
        },
        key(),
      ),
    );
    expect((await repo.get(actor(), fixture.company, invoice.record.id)).record.outstanding).toBe("0.00000000");
    const amounts = (
      await db.pool.query(
        "select l.account_id,sum(l.base_debit-l.base_credit)::text amount from journal_line l join journal_entry j on(j.tenant_id,j.id)=(l.tenant_id,l.journal_id) where j.tenant_id=$1 and j.company_id=$2 and l.account_id=any($3::text[]) group by l.account_id",
        [fixture.tenant, fixture.company, [accounts.stock, accounts.wip]],
      )
    ).rows;
    expect(amounts).toEqual(
      expect.arrayContaining([
        { account_id: accounts.stock, amount: "20.00000000" },
        { account_id: accounts.wip, amount: "0.00000000" },
      ]),
    );
    expect(
      (
        await stock.workspace(
          actor(),
          stockQuerySchema.parse({
            company_id: fixture.company,
            as_of: "2026-11-20",
            product_id: finished,
            warehouse_id: warehouse,
          }),
        )
      ).balances[0],
    ).toMatchObject({ quantity: "1.0000", value: "20.00000000" });
  });
  it("credits original governed tax residuals exactly across a rate change and controlled reversal", async () => {
    const taxPermissions = ["finance.tax.read", "finance.tax.manage", "finance.tax_mapping.admin"];
    await ensureSourceSuperAdministratorFixture(db.pool);
    await db.pool.query(
      "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,'r06.override-admin',$3,false,'r06.last-admin-a','governed_administration','disposable-sales-tax-fixture')",
      [fixture.tenant, key(), fixture.company],
    );
    await db.pool.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,'r06-uat-policy-approval-override',p,'all' from unnest($2::text[])p on conflict do nothing",
      [fixture.tenant, taxPermissions],
    );
    await db.pool.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,'r06-uat-policy-approval-override',p,'company',$3 from unnest($2::text[])p on conflict do nothing",
      [fixture.tenant, taxPermissions, fixture.company],
    );
    const adminBase = subledgerActor("r06.override-admin"),
      admin = {
        ...adminBase,
        actor: { ...adminBase.actor, roles: ["super_administrator"], permissions: [...permissions, ...taxPermissions] },
      };
    const account = `sales-output-tax-${key()}`;
    await db.pool.query(
      "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,$1,'Actual isolated output tax','liability',false,'active',clock_timestamp())",
      [account, fixture.tenant, fixture.company],
    );
    const taxes = new SourceTaxRepository(db.pool),
      taxInput = taxInputSchema.parse({
        company_id: fixture.company,
        name: "Original approved Sales tax",
        tax_type: "GST",
        rate: "10",
        module: "sales",
        treatment: "output",
        trigger: "recognition",
        account_id: account,
        effective_date: "2026-11-01",
        reason: "Explicit isolated tax mapping approval",
      });
    const tax = await taxes.save(admin, taxInput, key());
    outputTax = tax.id;
    const service = (
      await new SourceInventoryRepository(db.pool).save(
        actor(),
        null,
        productInputSchema.parse({
          category_id: "category-fixture-" + fixture.company,
          company_id: fixture.company,
          name: "Actual fractional tax service",
          currency: "USD",
          unit: "Each",
          type: "service",
          track_inventory: false,
        }),
        key(),
        key(),
      )
    ).record.id;
    const invoice = await action(
      await repo.save(
        actor(),
        null,
        input({
          kind: "invoice",
          due_date: "2026-12-20",
          lines: [
            { ...input().lines[0]!, product_id: service, quantity: "5", unit_price: "0.01", tax_definition_id: tax.id },
          ],
        }),
        key(),
        key(),
      ),
      "approve",
    );
    expect(invoice.record).toMatchObject({
      net_amount: "0.05000000",
      tax_amount: "0.01000000",
      total_amount: "0.06000000",
    });
    const original = await financial(
      await fixture.repository.prepareSales(
        actor(),
        invoice.record.id,
        {
          company_id: fixture.company,
          expected_version: invoice.record.version,
          reason: "Original governed fractional Sales invoice",
        },
        key(),
      ),
    );
    await taxes.save(
      admin,
      { ...taxInput, rate: "20", effective_date: "2026-11-21", expected_version: tax.version },
      key(),
      tax.id,
    );
    const credit = async (quantity: string) => {
      const draft = await repo.derive(actor(), invoice.record.id, {
        company_id: fixture.company,
        expected_version: invoice.record.version,
        kind: "credit",
        document_date: "2026-11-21",
      });
      return action(
        await repo.save(
          actor(),
          null,
          { ...draft, lines: draft.lines.map((line) => ({ ...line, quantity })) },
          key(),
          key(),
        ),
        "approve",
      );
    };
    const first = await credit("2");
    expect(first.record).toMatchObject({
      net_amount: "0.02000000",
      tax_amount: "0.01000000",
      total_amount: "0.03000000",
    });
    const firstOp = await financial(
      await fixture.repository.prepareSales(
        actor(),
        first.record.id,
        {
          company_id: fixture.company,
          expected_version: first.record.version,
          reason: "Credit exact original tax residual",
        },
        key(),
      ),
    );
    expect(firstOp.preview?.taxes[0]).toMatchObject({
      rate: "10.00",
      basis: "-0.02",
      amount: "-0.01",
      prior_basis: "0.05",
      prior_amount: "0.01",
    });
    const second = await credit("3"),
      secondOp = await financial(
        await fixture.repository.prepareSales(
          actor(),
          second.record.id,
          {
            company_id: fixture.company,
            expected_version: second.record.version,
            reason: "Final original tax residual credit",
          },
          key(),
        ),
      );
    expect(secondOp.preview?.taxes[0]).toMatchObject({
      basis: "-0.03",
      amount: "0.00",
      prior_basis: "0.03",
      prior_amount: "0.00",
    });
    await expect(
      fixture.repository.create(
        actor(),
        {
          company_id: fixture.company,
          type: "reversal",
          operation_id: original.id,
          date: "2026-11-21",
          reference: "",
          reason: "Attempt original invoice reversal before dependent credits",
        },
        key(),
      ),
    ).rejects.toMatchObject({ code: "SUBLEDGER_CONFLICT" });
    const reversal = await financial(
      await fixture.repository.create(
        actor(),
        {
          company_id: fixture.company,
          type: "reversal",
          operation_id: secondOp.id,
          date: "2026-11-21",
          reference: "",
          reason: "Compensate actual final credit without changing original tax",
        },
        key(),
      ),
    );
    expect(reversal.preview?.taxes[0]).toMatchObject({ prior_basis: "-0.03", prior_amount: "0.00" });
    await action(second, "cancel");
    const reissued = await credit("3");
    await financial(
      await fixture.repository.prepareSales(
        actor(),
        reissued.record.id,
        {
          company_id: fixture.company,
          expected_version: reissued.record.version,
          reason: "Reissue only the explicitly compensated quantity",
        },
        key(),
      ),
    );
    expect(
      (
        await db.pool.query(
          "select sum(a.amount)::text amount,sum(a.basis)::text basis from finance_tax_application a where a.tenant_id=$1 and a.company_id=$2 and a.definition_id=$3",
          [fixture.tenant, fixture.company, tax.id],
        )
      ).rows[0],
    ).toEqual({ amount: "0.00", basis: "0.00" });
  });
  it("preserves weekly billing and approved invoice snapshots when a template is revised", async () => {
    const service = (
      await new SourceInventoryRepository(db.pool).save(
        actor(),
        null,
        productInputSchema.parse({
          category_id: "category-fixture-" + fixture.company,
          company_id: fixture.company,
          name: "Actual weekly contractual service",
          currency: "USD",
          unit: "Each",
          type: "service",
          track_inventory: false,
        }),
        key(),
        key(),
      )
    ).record.id;
    let template = await action(
      await repo.save(
        actor(),
        null,
        input({
          kind: "recurring",
          customer_id: null,
          recurrence: {
            enabled: true,
            frequency: "weekly",
            start_date: "2026-11-20",
            end_date: null,
            customer_ids: [customer],
          },
          lines: [{ ...input().lines[0]!, product_id: service, quantity: "1", unit_price: "12" }],
        }),
        key(),
        key(),
      ),
      "approve",
    );
    const generated = await repo.derive(actor(), template.record.id, {
      company_id: fixture.company,
      expected_version: template.record.version,
      kind: "invoice",
      customer_id: customer,
      billing_period: "2026-11-20",
      document_date: "2026-11-20",
    });
    const invoice = await action(
      await repo.save(actor(), null, { ...generated, due_date: "2026-12-20" }, key(), key()),
      "approve",
    );
    template = await action(template, "revise");
    const changes = salesDocumentInputSchema.strip().parse({
      ...template.record,
      expected_version: template.record.version,
      lines: template.record.lines.map((line) => salesLineInputSchema.strip().parse({ ...line, unit_price: "20" })),
    });
    template = await action(await repo.save(actor(), template.record.id, changes, key(), key()), "approve");
    expect(template.record.total_amount).toBe("20.00000000");
    const posted = await financial(
      await fixture.repository.prepareSales(
        actor(),
        invoice.record.id,
        {
          company_id: fixture.company,
          expected_version: invoice.record.version,
          reason: "Post retained approved weekly invoice snapshot",
        },
        key(),
      ),
    );
    expect(posted.preview?.item?.original_amount).toBe("12.00");
    const next = await repo.derive(actor(), template.record.id, {
      company_id: fixture.company,
      expected_version: template.record.version,
      kind: "invoice",
      customer_id: customer,
      billing_period: "2026-11-27",
      document_date: "2026-11-27",
    });
    expect(next.lines[0]!.unit_price).toBe("20.00000000");
    await expect(
      repo.save(actor(), null, { ...next, billing_period: "2026-11-26", due_date: "2026-12-20" }, key(), key()),
    ).rejects.toMatchObject({ code: "SALES_RECURRING_PERIOD_INVALID" });
    expect((await repo.productUnits(actor(), fixture.company, service)).base.name).toBe("Each");
    const overview = await repo.overview(actor(), fixture.company);
    expect(overview.counts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "invoice", state: "approved" })]),
    );
    expect(overview.notices.some((notice) => notice.document_id === invoice.record.id)).toBe(true);
  });
  it.each([
    ["JPY", "49", "98.00000000", "10.00000000", "108"],
    ["KWD", "1.005", "2.01000000", "0.20100000", "2.211"],
  ])(
    "posts governed %s amounts using native currency precision and actual company FX",
    async (currency, price, net, tax, total) => {
      const service = (
        await new SourceInventoryRepository(db.pool).save(
          actor(),
          null,
          productInputSchema.parse({
            category_id: "category-fixture-" + fixture.company,
            company_id: fixture.company,
            name: `Actual ${currency} priced service`,
            currency: "USD",
            unit: "Each",
            type: "service",
            track_inventory: false,
          }),
          key(),
          key(),
        )
      ).record.id;
      const invoice = await action(
        await repo.save(
          actor(),
          null,
          input({
            kind: "invoice",
            currency: currency!,
            due_date: "2026-12-20",
            lines: [
              {
                ...input().lines[0]!,
                product_id: service,
                quantity: "2",
                unit_price: price!,
                tax_definition_id: outputTax,
              },
            ],
          }),
          key(),
          key(),
        ),
        "approve",
      );
      expect(invoice.record).toMatchObject({ currency, net_amount: net, tax_amount: tax });
      const op = await financial(
        await fixture.repository.prepareSales(
          actor(),
          invoice.record.id,
          {
            company_id: fixture.company,
            expected_version: invoice.record.version,
            reason: "Actual company-governed native currency invoice",
          },
          key(),
        ),
      );
      expect(op.preview?.item?.original_amount).toBe(total);
      expect(
        (
          await db.pool.query(
            "select sum(l.base_debit-l.base_credit)::text amount from journal_line l where l.tenant_id=$1 and l.journal_id=$2",
            [fixture.tenant, op.journal_id],
          )
        ).rows[0].amount,
      ).toBe("0.00000000");
    },
  );
  it("enforces Sales row isolation for an actual non-superuser without BYPASSRLS", async () => {
    const record = await repo.save(actor(), null, input(), key(), key()),
      role = `sales_rls_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    if (!/^sales_rls_[a-f0-9]{20}$/.test(role)) throw Error("Unsafe isolated role identity");
    const client = await db.pool.connect();
    try {
      await client.query(`create role ${role} nologin nosuperuser noinherit nobypassrls`);
      await client.query(
        `grant select on sales_document,sales_document_line,sales_document_audit,sales_request,security_user_company_access to ${role}`,
      );
      await client.query("begin");
      await client.query(`set local role ${role}`);
      await client.query(
        "select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.maker',true)",
        [fixture.tenant],
      );
      expect(
        (await client.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0],
      ).toEqual({ rolsuper: false, rolbypassrls: false });
      expect(
        (await client.query("select count(*)::int n from sales_document where id=$1", [record.record.id])).rows[0].n,
      ).toBe(1);
      await client.query("select set_config('nexora.user_id','missing-company-user',true)");
      expect(
        (await client.query("select count(*)::int n from sales_document where id=$1", [record.record.id])).rows[0].n,
      ).toBe(0);
      expect(
        (await client.query("select count(*)::int n from sales_document_line where document_id=$1", [record.record.id]))
          .rows[0].n,
      ).toBe(0);
      await client.query(
        "select set_config('nexora.tenant_id','unrelated-tenant',true),set_config('nexora.user_id','r06.maker',true)",
      );
      expect(
        (
          await client.query("select count(*)::int n from sales_document_audit where document_id=$1", [
            record.record.id,
          ])
        ).rows[0].n,
      ).toBe(0);
      await client.query("rollback");
    } finally {
      await client.query("rollback");
      await client.query(
        `revoke select on sales_document,sales_document_line,sales_document_audit,sales_request,security_user_company_access from ${role}`,
      );
      await client.query(`drop role ${role}`);
      client.release();
    }
  });
});
