import { randomUUID, randomBytes } from "node:crypto";
import { SupplierProfileCrypto } from "../../server/api/src/modules/procurement/supplier-profile-crypto.js";
import { PassThrough } from "node:stream";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabasePool,
  migrateSourceSchema,
  migrateSourceModule,
  type DatabasePool,
} from "../../packages/db/src/index.js";
import {
  savePurchaseRequestSchema,
  savePurchaseInputSchema,
  productInputSchema,
  supplierInputSchema,
  type PurchaseDocument,
  type PurchaseKind,
  type SavePurchaseRequest,
} from "../../packages/contracts/src/index.js";
import {
  SourceProcurementRepository,
  type ProcurementContext,
} from "../../server/api/src/modules/procurement/source-repository.js";
import { SourceInventoryRepository } from "../../server/api/src/modules/inventory/source-repository.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { purchasePaymentBankFixture } from "./purchase-payment-fixture.js";
import {
  ensureSourceSuperAdministratorFixture,
  sourceTestTenantId as tenant,
  sourceTestCompanyId as company,
} from "./source-security-fixture.js";

const bootstrapUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const suite = bootstrapUrl ? describe : describe.skip;
const database = `purchase_workflow_${randomUUID().replaceAll("-", "")}`;
const permissions = [
  "procurement.document.read",
  "procurement.document.create",
  "procurement.document.action",
  "procurement.document.submit",
  "procurement.document.approve",
  "procurement.vendor.read",
  "procurement.vendor.create",
];
function context(user = "r06.maker"): ProcurementContext {
  return {
    tenantId: tenant,
    actor: {
      tenantId: tenant,
      userId: user,
      organizationName: "Synthetic Purchase company",
      displayName: user,
      email: "purchase@example.invalid",
      roles: ["purchase_tester"],
      permissions,
      sessionVersion: 1,
    },
  };
}
const maker = context(),
  checker = context("r06.checker"),
  key = () => randomUUID();
const profileCrypto = new SupplierProfileCrypto(randomBytes(32).toString("base64"), "test-v1");
suite("Database-backed Purchase and Supplier workflow", () => {
  let bootstrap: DatabasePool, pool: DatabasePool, repo: SourceProcurementRepository;
  let supplierA: string, supplierB: string;
  beforeAll(async () => {
    if (!bootstrapUrl || !["localhost", "127.0.0.1"].includes(new URL(bootstrapUrl).hostname))
      throw new Error("An explicit local test database is required");
    expect(database).toMatch(/^purchase_workflow_[a-f0-9]{32}$/);
    bootstrap = createDatabasePool(bootstrapUrl);
    await bootstrap.query(`create database ${database}`);
    const url = new URL(bootstrapUrl);
    url.pathname = `/${database}`;
    pool = createDatabasePool(url.toString());
    await migrateSourceSchema(pool);
    await ensureSourceSuperAdministratorFixture(pool);
    await purchasePaymentBankFixture(pool);
    repo = new SourceProcurementRepository(pool, profileCrypto);
    for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-approval-override"]) {
      for (const permission of permissions) {
        await pool.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
          [tenant, policy, permission],
        );
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
          [tenant, policy, permission, company],
        );
      }
    }
    supplierA = (
      await repo.saveSupplier(
        maker,
        null,
        supplierInputSchema.parse({ company_id: company, name: "Synthetic supplier A" }),
        key(),
        key(),
      )
    ).record.id;
    supplierB = (
      await repo.saveSupplier(
        maker,
        null,
        supplierInputSchema.parse({ company_id: company, name: "Synthetic supplier B" }),
        key(),
        key(),
      )
    ).record.id;
  }, 120_000);
  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${database}`);
      await bootstrap.end();
    }
  });
  function terms(
    kind: PurchaseKind,
    source?: PurchaseDocument,
    supplier: string | null = supplierA,
    quantity = "10",
    currency = source?.currency ?? "USD",
  ): SavePurchaseRequest {
    return savePurchaseRequestSchema.parse({
      company_id: company,
      kind,
      supplier_id: kind === "request" || kind === "rfq" ? null : supplier,
      source_id: source?.id ?? null,
      invited_supplier_ids: kind === "rfq" ? [supplierA, supplierB] : [],
      document_date: "2026-11-05",
      currency,
      reference: kind === "bill" ? `INV-${key()}` : "",
      lines: [
        {
          ...(source?.lines[0] ?? {
            item_code: "ITEM-001",
            description: "Synthetic product",
            uom: "Each",
            unit_price: "10.00",
            tax_percent: "0",
          }),
          id: undefined,
          source_line_id: source?.lines[0]?.id ?? null,
          quantity,
        },
      ],
    });
  }
  async function save(input: SavePurchaseRequest) {
    return (await repo.save(maker, null, input, key(), key())).record;
  }
  async function submit(record: PurchaseDocument) {
    return (
      await repo.action(
        maker,
        record.id,
        {
          company_id: company,
          expected_version: record.version,
          action: "submit",
          reason: "Synthetic request for independent approval",
        },
        key(),
        key(),
      )
    ).record;
  }
  async function approve(record: PurchaseDocument, reason = "Synthetic independent approval") {
    return (
      await repo.action(
        checker,
        record.id,
        {
          company_id: company,
          expected_version: record.version,
          action: "approve",
          reason,
        },
        key(),
        key(),
      )
    ).record;
  }
  async function approved(input: SavePurchaseRequest) {
    return approve(await submit(await save(input)));
  }
  async function order(supplier = supplierA, quantity = "10", currency = "USD") {
    const requisition = await approved(terms("request", undefined, null, quantity, currency));
    const rfq = await approved(terms("rfq", requisition, null, quantity));
    return approved(terms("order", rfq, supplier, quantity));
  }
  async function bill(supplier = supplierA, quantity = "10", currency = "USD") {
    const po = await order(supplier, quantity, currency);
    await approved(terms("receipt", po, supplier, quantity));
    return approved(terms("bill", po, supplier, quantity));
  }
  it("fetches Purchase currencies under runtime RLS without leaking company or user context", async () => {
    const role = `purchase_rls_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`create role ${role} nologin nosuperuser nobypassrls`);
    await pool.query(`grant usage on schema public to ${role}`);
    await pool.query(`grant select on all tables in schema public to ${role}`);
    const target = new URL(bootstrapUrl!);
    target.pathname = `/${database}`;
    const restrictedPool = new Pool({ connectionString: target.toString(), options: `-c role=${role}`, max: 1 });
    const restricted = new SourceProcurementRepository(restrictedPool, profileCrypto);
    const assertClearedContext = async () => {
      const result = await restrictedPool.query(
        "select current_setting('nexora.user_id',true) as user_id,current_setting('nexora.tenant_id',true) as tenant_id",
      );
      expect(result.rows[0].user_id ?? "").toBe("");
      expect(result.rows[0].tenant_id ?? "").toBe("");
      expect((await restrictedPool.query("select currency_code from company_currency")).rows).toEqual([]);
    };
    try {
      const expected = (await repo.options(maker, company)).currencies;
      expect(expected).toContainEqual(expect.objectContaining({ code: "USD" }));
      expect((await restricted.options(maker, company)).currencies).toEqual(expected);
      await assertClearedContext();
      await expect(restricted.options(maker, "outside-company")).rejects.toMatchObject({ status: 403 });
      await assertClearedContext();
      const unassigned = { ...maker, actor: { ...maker.actor, userId: "unassigned-purchase-user" } };
      await expect(restricted.options(unassigned, company)).rejects.toMatchObject({ status: 403 });
      await expect(restricted.options({ ...maker, tenantId: "outside-tenant" }, company)).rejects.toMatchObject({
        status: 403,
      });
      await assertClearedContext();
      expect((await restricted.options(checker, company)).currencies).toEqual(expected);
      await assertClearedContext();
    } finally {
      await restrictedPool.end();
      await pool.query(`drop owned by ${role}`);
      await pool.query(`drop role ${role}`);
    }
  });
  it("persists discounts and freight and allocates their remaining cents across partial receipts and bills", async () => {
    const expenseId = `purchase-freight-${key()}`;
    await pool.query(
      "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,$1,'Synthetic freight','expense',false,'active',now())",
      [expenseId, tenant, company],
    );
    const request = await approved({
      ...terms("request", undefined, null, "3"),
      discount_amount: "0.02",
      lines: [{ ...terms("request", undefined, null, "3").lines[0]!, unit_price: "1.00", discount_amount: "0.01" }],
      additional_charges: [
        {
          id: "freight",
          type: "freight",
          description: "Synthetic freight",
          amount: "0.01",
          tax_percent: "0",
          nominal_account_id: expenseId,
        },
      ],
    });
    const orderInput = terms("order", request, supplierA, "3");
    const po = await approved({
      ...orderInput,
      discount_amount: request.discount_amount,
      additional_charges: request.additional_charges,
    });
    expect(po.total_amount).toBe("2.98");
    const receipt = await approved(terms("receipt", po, supplierA, "1"));
    const first = await approved(terms("bill", po, supplierA, "1"));
    const secondDraft = await save(terms("bill", po, supplierA, "2"));
    const secondSubmitted = await submit(secondDraft);
    await expect(approve(secondSubmitted)).rejects.toMatchObject({ code: "PURCHASE_RECEIPT_MATCH_REQUIRED" });
    await approved(terms("receipt", po, supplierA, "2"));
    const second = await approve(secondSubmitted);
    expect(Number(first.total_amount) + Number(second.total_amount)).toBe(2.98);
    expect(Number(first.additional_charges![0]!.amount) + Number(second.additional_charges![0]!.amount)).toBe(0.01);
    expect(Number(receipt.discount_amount) + Number(second.discount_amount)).toBe(0.02);
    const loaded = await repo.get(maker, company, second.id);
    expect(loaded).toMatchObject({
      discount_amount: second.discount_amount,
      additional_charges: second.additional_charges,
      total_amount: second.total_amount,
    });
    const origin = await repo.get(maker, company, po.id);
    expect(origin.source_consumption?.bill.lines[0]).toMatchObject({
      quantity: "3",
      line_discount: "0.01",
      document_discount: "0.02",
    });
    await expect(save({ ...terms("request", undefined, null), discount_amount: "1000" })).rejects.toMatchObject({
      code: "PURCHASE_VALIDATION_FAILED",
    });
  });
  it("filters supplier bills before pagination and binds cursors to the supplier", async () => {
    const first = await bill(supplierA),
      other = await bill(supplierB),
      second = await bill(supplierA);
    const query = {
      company_id: company,
      kind: "bill" as const,
      state: "approved" as const,
      supplier_id: supplierA,
      search: "",
      limit: 1,
    };
    const ids: string[] = [];
    let page = await repo.list(maker, query);
    expect(page.next_cursor).toBeTruthy();
    await expect(
      repo.list(maker, { ...query, supplier_id: supplierB, cursor: page.next_cursor! }),
    ).rejects.toMatchObject({ status: 400 });
    for (;;) {
      expect(page.items.every((item) => item.supplier_id === supplierA)).toBe(true);
      ids.push(...page.items.map((item) => item.id));
      if (!page.next_cursor) break;
      page = await repo.list(maker, { ...query, cursor: page.next_cursor });
    }
    expect(ids).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(ids).not.toContain(other.id);
    expect((await repo.list(maker, { ...query, supplier_id: "unknown-supplier" })).items).toEqual([]);
  });
  it("persists bill dates and computes payment terms on the server through approval and legacy edits", async () => {
    const po = await order();
    await approved(terms("receipt", po));
    const input = {
      ...terms("bill", po),
      document_date: "2026-11-11",
      bill_date: "2026-10-01",
      payment_term: "days_15" as const,
      due_date: "2099-01-01",
    };
    const draft = await save(input);
    expect(draft).toMatchObject({ bill_date: "2026-10-01", payment_term: "days_15", due_date: "2026-10-16" });
    const legacy: SavePurchaseRequest = { ...input, due_date: draft.due_date, expected_version: draft.version };
    delete legacy.bill_date;
    delete legacy.payment_term;
    const updated = (await repo.save(maker, draft.id, legacy, key(), key())).record;
    expect(updated).toMatchObject({ bill_date: "2026-10-01", payment_term: "days_15", due_date: "2026-10-16" });
    const result = await approve(await submit(updated));
    expect(result).toMatchObject({
      state: "approved",
      bill_date: "2026-10-01",
      due_date: "2026-10-16",
      payment_term: "days_15",
    });
    const snapshot = await pool.query(
      "select snapshot from procurement_change where tenant_id=$1 and entity_id=$2 and action='approve'",
      [tenant, result.id],
    );
    expect(snapshot.rows[0].snapshot).toMatchObject({
      bill_date: "2026-10-01",
      payment_term: "days_15",
      due_date: "2026-10-16",
    });
  });
  it("validates manual bill due dates against bill date and rejects bill terms on other documents", async () => {
    const po = await order();
    await approved(terms("receipt", po));
    const input = {
      ...terms("bill", po),
      document_date: "2026-11-11",
      bill_date: "2026-10-01",
      due_date: "2026-10-02",
      payment_term: null,
    };
    expect(await save(input)).toMatchObject({ bill_date: "2026-10-01", due_date: "2026-10-02", payment_term: null });
    await expect(save({ ...input, reference: `INV-${key()}`, due_date: "2026-09-30" })).rejects.toThrow(
      "before the bill date",
    );
    await expect(save({ ...terms("request", undefined, null), bill_date: "2026-11-11" })).rejects.toMatchObject({
      code: "INVALID_BILL_PAYMENT_TERM",
    });
    const split = await save({ ...input, reference: `INV-${key()}`, payment_term: "percent_30_now_balance_60_days" });
    expect(split).toMatchObject({
      bill_date: "2026-10-01",
      due_date: "2026-11-30",
      payment_term: "percent_30_now_balance_60_days",
    });
  });
  it("keeps a single RFQ supplier on downstream Orders and rejects a different supplier", async () => {
    const request = await approved(terms("request"));
    const rfq = await approved({ ...terms("rfq", request), supplier_id: supplierA, invited_supplier_ids: [supplierA] });
    expect(rfq.supplier_id).toBe(supplierA);
    expect(rfq.invited_supplier_ids).toEqual([supplierA]);
    await expect(save(terms("order", rfq, supplierB))).rejects.toThrow("The supplier must match the source document.");
    const po = await approved(terms("order", rfq, supplierA));
    expect(po.supplier_id).toBe(supplierA);
  });
  it("runs the additive migration idempotently and reuses the Party supplier master", async () => {
    expect(await migrateSourceModule(pool, "procurement")).toBe(false);
    const rows = await pool.query(
      "select s.code,p.type from procurement_supplier s join party p on p.tenant_id=s.tenant_id and p.id=s.id where s.tenant_id=$1 order by s.code",
      [tenant],
    );
    expect(rows.rows).toEqual([
      { code: "SUP-001", type: "vendor" },
      { code: "SUP-002", type: "vendor" },
    ]);
    expect((await repo.companies(maker)).items.some((item) => item.id === company)).toBe(true);
  });
  it("persists the linked Request → RFQ → Order → partial Receipt → Bill lifecycle and shared approvals", async () => {
    const po = await order();
    const receipt = await approved(terms("receipt", po, supplierA, "4"));
    const invoice = await approved(terms("bill", po, supplierA, "4"));
    expect(receipt).toMatchObject({ source_id: po.id, state: "approved", total_amount: "40.00" });
    expect((await repo.get(maker, company, invoice.id)).events.map((event) => event.action)).toEqual([
      "created",
      "submit",
      "approve",
    ]);
    const workflow = await pool.query(
      "select a.state, count(action.id)::integer as actions from procurement_document d join approval_instance a on a.tenant_id=d.tenant_id and a.id=d.approval_instance_id join approval_action action on action.tenant_id=a.tenant_id and action.approval_instance_id=a.id where d.tenant_id=$1 and d.id=$2 group by a.state",
      [tenant, invoice.id],
    );
    expect(workflow.rows).toEqual([{ state: "approved", actions: 2 }]);
    await expect(
      repo.save(
        maker,
        po.id,
        { ...terms("order"), source_id: po.source_id, expected_version: po.version },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "PURCHASE_NOT_EDITABLE" });
  });
  it("rejects over-receipt, over-billing, price mismatch and duplicate supplier invoices", async () => {
    const po = await order();
    await approved(terms("receipt", po, supplierA, "6"));
    const extra = await submit(await save(terms("receipt", po, supplierA, "5")));
    await expect(approve(extra)).rejects.toMatchObject({ code: "PURCHASE_QUANTITY_EXCEEDED" });
    const early = await submit(await save(terms("bill", po, supplierA, "7")));
    await expect(approve(early)).rejects.toMatchObject({ code: "PURCHASE_RECEIPT_MATCH_REQUIRED" });
    const correct = await approved(terms("bill", po, supplierA, "6"));
    await expect(save({ ...terms("bill", po, supplierA, "1"), reference: correct.reference })).rejects.toMatchObject({
      code: "DUPLICATE_SUPPLIER_BILL",
    });
    const mismatch = terms("bill", po, supplierA, "1");
    mismatch.lines[0]!.unit_price = "11.00";
    await expect(save(mismatch)).rejects.toMatchObject({ code: "PURCHASE_PRICE_MISMATCH" });
  });
  it("prevents orders from consuming the same request through different quotations", async () => {
    const requisition = await approved(terms("request"));
    const first = await approved(terms("rfq", requisition));
    const second = await approved(terms("rfq", requisition));
    await approved(terms("order", first, supplierA, "7"));
    const excess = await submit(await save(terms("order", second, supplierB, "4")));
    await expect(approve(excess)).rejects.toMatchObject({ code: "PURCHASE_QUANTITY_EXCEEDED" });
  });
  it("persists detailed supplier profiles with audited edits, legacy compatibility and replay", async () => {
    const input = supplierInputSchema.parse({
      company_id: company,
      name: "Detailed synthetic supplier",
      address: "Billing street",
      profile: {
        entity_type: "individual",
        contact_name: "Synthetic contact",
        billing_city: "Karachi",
        tax_registration: "SYNTHETIC-TAX",
        credit_days: 30,
        currency: "USD",
        notes: "Internal purchasing note",
        delivery_same_as_billing: false,
        delivery_address: { street: "Delivery street", city: "Lahore" },
        bank_accounts: [
          {
            id: "bank-one",
            bank_name: "Synthetic Bank",
            account_title: "Detailed synthetic supplier",
            iban: "PK36SCBL0000001123456702",
            is_default: true,
          },
        ],
      },
    });
    const retry = key();
    const saved = await repo.saveSupplier(maker, null, input, retry, key());
    expect(await repo.saveSupplier(maker, null, input, retry, key())).toEqual(saved);
    const listed = await repo.suppliers(maker, { company_id: company, search: "Detailed synthetic", limit: 10 });
    expect(listed.items).toEqual([saved.record]);
    expect(saved.record.profile).toEqual(input.profile);
    await expect(
      new SourceProcurementRepository(pool).suppliers(maker, {
        company_id: company,
        search: "Detailed synthetic",
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: "SUPPLIER_BANKING_UNAVAILABLE" });
    const legacy = supplierInputSchema.parse({
      company_id: company,
      name: "Legacy name edit",
      expected_version: saved.record.version,
    });
    const updated = await repo.saveSupplier(maker, saved.record.id, legacy, key(), key());
    expect(updated.record).toMatchObject({ code: saved.record.code, version: 2, profile: input.profile });
    await expect(repo.saveSupplier(maker, saved.record.id, legacy, key(), key())).rejects.toMatchObject({
      code: "PURCHASE_VERSION_CONFLICT",
    });
    const cleared = await repo.saveSupplier(
      maker,
      saved.record.id,
      supplierInputSchema.parse({ ...legacy, expected_version: 2, profile: {} }),
      key(),
      key(),
    );
    expect(cleared.record.profile?.bank_accounts).toEqual([]);
    const audits = await pool.query(
      "select record_version,snapshot->'profile' as profile,result from procurement_change where tenant_id=$1 and entity_type='supplier' and entity_id=$2 order by record_version",
      [tenant, saved.record.id],
    );
    expect(audits.rows).toHaveLength(3);
    const scope = JSON.stringify([tenant, company, saved.record.id]);
    expect(profileCrypto.decrypt(audits.rows[0]?.profile, scope)).toEqual(input.profile);
    expect(profileCrypto.decrypt(audits.rows[1]?.profile, scope)).toEqual(input.profile);
    expect(JSON.stringify(audits.rows)).not.toContain("PK36SCBL0000001123456702");
    expect(JSON.stringify(audits.rows)).not.toContain("Synthetic Bank");
    expect(audits.rows[2]?.profile).toEqual(cleared.record.profile);
  });
  it("keeps stable codes and replays identical creates/edits without duplicate audit writes", async () => {
    const input = terms("request"),
      retry = key();
    const first = await repo.save(maker, null, input, retry, key());
    expect(await repo.save(maker, null, input, retry, key())).toEqual(first);
    await expect(repo.save(maker, null, { ...input, notes: "Changed retry" }, retry, key())).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    const update = { ...input, notes: "Edited draft", expected_version: 1 },
      updateKey = key();
    const edited = await repo.save(maker, first.record.id, update, updateKey, key());
    expect(edited.record).toMatchObject({ code: first.record.code, version: 2, notes: "Edited draft" });
    expect(await repo.save(maker, first.record.id, update, updateKey, key())).toEqual(edited);
    await expect(repo.save(maker, first.record.id, update, key(), key())).rejects.toMatchObject({
      code: "PURCHASE_VERSION_CONFLICT",
    });
    const concurrent = await Promise.all([save(terms("request")), save(terms("request"))]);
    expect(new Set(concurrent.map((item) => item.code)).size).toBe(2);
  });
  it("requires an independent checker and revalidates supplier eligibility at approval", async () => {
    const pending = await submit(await save(terms("request")));
    await expect(
      repo.action(
        maker,
        pending.id,
        {
          company_id: company,
          expected_version: pending.version,
          action: "approve",
          reason: "Forbidden self approval",
        },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    const po = await order(),
      receipt = await submit(await save(terms("receipt", po, supplierA, "1")));
    await pool.query("update party set risk_status='blocked' where tenant_id=$1 and id=$2", [tenant, supplierA]);
    try {
      await expect(approve(receipt)).rejects.toMatchObject({ code: "SUPPLIER_INELIGIBLE" });
    } finally {
      await pool.query("update party set risk_status='normal' where tenant_id=$1 and id=$2", [tenant, supplierA]);
    }
  });
  it.each(["request", "payment", "multi_payment"] as const)(
    "records and replays Super Admin %s self-approval without a user-entered reason",
    async (kind) => {
      const admin = {
        ...context("r06.override-admin"),
        actor: {
          ...context("r06.override-admin").actor,
          roles: ["super_administrator"],
          permissions: [...permissions, "platform.approval.override"],
        },
      };
      const inputTerms =
        kind === "request"
          ? terms("request")
          : savePurchaseRequestSchema.parse({
              company_id: company,
              kind,
              supplier_id: kind === "payment" ? supplierA : null,
              document_date: "2026-11-05",
              currency: "USD",
              allocations: [
                { bill_id: (await bill()).id, amount: "10.00" },
                ...(kind === "multi_payment" ? [{ bill_id: (await bill(supplierB)).id, amount: "10.00" }] : []),
              ],
            });
      const created = (await repo.save(admin, null, inputTerms, key(), key())).record;
      expect((await repo.options(admin, company)).can_self_approve).toBe(true);
      const pending = (
        await repo.action(
          admin,
          created.id,
          { company_id: company, expected_version: 1, action: "submit", reason: "Synthetic administrator submission" },
          key(),
          key(),
        )
      ).record;
      const input = {
          company_id: company,
          expected_version: pending.version,
          action: "approve" as const,
          reason: "",
        },
        retry = key();
      await expect(repo.action(context("r06.override-admin"), pending.id, input, key(), key())).rejects.toMatchObject({
        code: "MAKER_CHECKER_REQUIRED",
      });
      const result = await repo.action(admin, pending.id, input, retry, key());
      expect(result.record.state).toBe("approved");
      expect(await repo.action(admin, pending.id, input, retry, key())).toEqual(result);
      const evidence = await pool.query(
        "select reason,metadata->>'reason_origin' as reason_origin from approval_override_event where tenant_id=$1 and resource_type='procurement.document' and resource_id=$2",
        [tenant, pending.id],
      );
      expect(evidence.rows).toEqual([{ reason: "Approved through the Purchase workflow.", reason_origin: "system" }]);
    },
  );
  it("allocates single and multi-vendor payments without bank/stock/GL posting", async () => {
    const first = await bill(),
      second = await bill(supplierB);
    const single = savePurchaseRequestSchema.parse({
      company_id: company,
      kind: "payment",
      supplier_id: supplierA,
      document_date: "2026-11-05",
      currency: "USD",
      allocations: [{ bill_id: first.id, amount: "25.00" }],
    });
    const pendingSingle = await submit(await save(single));
    for (const action of ["reject", "cancel"] as const)
      await expect(
        repo.action(
          checker,
          pendingSingle.id,
          { company_id: company, expected_version: pendingSingle.version, action },
          key(),
          key(),
        ),
      ).rejects.toThrow("A reason is required");
    const approvedSingle = await repo.action(
      checker,
      pendingSingle.id,
      { company_id: company, expected_version: pendingSingle.version, action: "approve" },
      key(),
      key(),
    );
    expect(approvedSingle.record.state).toBe("approved");
    expect((await repo.get(maker, company, pendingSingle.id)).events.at(-1)?.reason).toBe(
      "Approved through the Purchase workflow.",
    );
    const multi = savePurchaseRequestSchema.parse({
      company_id: company,
      kind: "multi_payment",
      document_date: "2026-11-05",
      currency: "USD",
      allocations: [
        { bill_id: first.id, amount: "75.00" },
        { bill_id: second.id, amount: "100.00" },
      ],
    });
    const result = await approve(await submit(await save(multi)), "");
    expect((await repo.get(maker, company, result.id)).events.at(-1)?.reason).toBe(
      "Approved through the Purchase workflow.",
    );
    expect(result.total_amount).toBe("175.00");
    expect((await repo.get(maker, company, first.id)).reserved_amount).toBe("100.00");
    const excess = await submit(await save({ ...single, allocations: [{ bill_id: first.id, amount: "1.00" }] }));
    await expect(approve(excess)).rejects.toMatchObject({ code: "PAYMENT_ALLOCATION_EXCEEDED" });
    const journals = await pool.query("select count(*)::integer as count from journal_entry where tenant_id=$1", [
      tenant,
    ]);
    expect(journals.rows[0]?.count).toBe(0);
    const banks = await pool.query("select count(*)::integer as count from bank_payment where tenant_id=$1", [tenant]);
    expect(banks.rows[0]?.count).toBe(0);
  });
  it("persists scoped payment details and reserves payment plus discount with audited retries", async () => {
    const invoice = await bill();
    const input = savePurchaseRequestSchema.parse({
      company_id: company,
      kind: "payment",
      supplier_id: supplierA,
      document_date: "2026-11-05",
      currency: "USD",
      allocations: [{ bill_id: invoice.id, amount: "75.00", discount: "5.00" }],
      payment_details: {
        bank_account_id: "purchase-bank-USD",
        bank_account_name: "Spoofed name",
        entries: [
          {
            supplier_id: supplierA,
            amount: "90.00",
            mode: "cheque",
            reference: "SYNTHETIC-CHEQUE",
            wht_rate: "2.5",
            additional_wht: "1.00",
            mailing_address: "Spoofed address",
          },
        ],
      },
    });
    const retry = key();
    const saved = await repo.save(maker, null, input, retry, key());
    expect(await repo.save(maker, null, input, retry, key())).toEqual(saved);
    expect(saved.record.total_amount).toBe("90.00");
    expect(saved.record.payment_details?.bank_account_name).toBe("Purchase USD account");
    expect(saved.record.payment_details?.account_number_masked).toBe("•••• 1234");
    expect(saved.record.payment_details?.entries[0]).toMatchObject({
      amount: "90.00",
      mode: "cheque",
      wht_rate: "2.5",
      mailing_address: "",
    });
    const legacyEdit = { ...input, expected_version: saved.record.version };
    delete legacyEdit.payment_details;
    const edited = await repo.save(maker, saved.record.id, legacyEdit, key(), key());
    expect(edited.record.payment_details).toEqual(saved.record.payment_details);
    const final = await approve(await submit(edited.record));
    expect((await repo.get(maker, company, final.id)).payment_details).toEqual(saved.record.payment_details);
    expect((await repo.get(maker, company, invoice.id)).reserved_amount).toBe("80.00");
    await expect(
      save({ ...input, payment_details: { ...input.payment_details!, bank_account_id: "purchase-bank-PKR" } }),
    ).rejects.toMatchObject({ code: "PAYMENT_BANK_INELIGIBLE" });
    await expect(
      save({
        ...input,
        payment_details: {
          ...input.payment_details!,
          entries: [{ ...input.payment_details!.entries[0]!, amount: "74.99" }],
        },
      }),
    ).rejects.toThrow("exceed the gross amount");
    await expect(
      save({
        ...input,
        payment_details: {
          ...input.payment_details!,
          entries: [{ ...input.payment_details!.entries[0]!, additional_wht: "90" }],
        },
      }),
    ).rejects.toThrow("Withholding exceeds");
    const excess = await submit(
      await save({ ...input, allocations: [{ bill_id: invoice.id, amount: "20.00", discount: "0.01" }] }),
    );
    await expect(approve(excess)).rejects.toMatchObject({ code: "PAYMENT_ALLOCATION_EXCEEDED" });
    const snapshots = await pool.query(
      "select snapshot->'payment_details' as details from procurement_change where tenant_id=$1 and entity_id=$2 order by record_version desc limit 1",
      [tenant, final.id],
    );
    expect(snapshots.rows[0]?.details).toEqual(final.payment_details);
  });
  it.each([
    ["PKR", "0.35"],
    ["AED", "27.00"],
    ["USD", "100.00"],
  ])("derives %s purchase payment currency and stores Accounting base values", async (currency, grossBase) => {
    const invoice = await bill(supplierA, "10", currency);
    const input = savePurchaseInputSchema.parse({
      company_id: company,
      kind: "payment",
      supplier_id: supplierA,
      document_date: "2026-11-05",
      allocations: [{ bill_id: invoice.id, amount: "100.00" }],
      payment_details: {
        bank_account_id: `purchase-bank-${currency}`,
        entries: [
          {
            supplier_id: supplierA,
            amount: "100.00",
            mode: "bank_transfer",
            wht_rate: "0",
            additional_wht: "0.00",
          },
        ],
      },
    });
    const saved = await repo.save(maker, null, input, key(), key());
    expect(saved.record.currency).toBe(currency);
    expect(saved.record.payment_details?.fx_snapshot).toMatchObject({
      currency,
      base_currency: "USD",
      gross_base: grossBase,
      net_base: grossBase,
    });
    const forged = {
      ...input,
      payment_details: {
        ...input.payment_details!,
        fx_snapshot: { ...saved.record.payment_details!.fx_snapshot!, rate: "999", net_base: "0" },
      },
    };
    const canonical = await repo.save(maker, null, forged, key(), key());
    expect(canonical.record.payment_details?.fx_snapshot).toEqual(saved.record.payment_details?.fx_snapshot);
    await expect(repo.save(maker, null, { ...input, currency: "ZZZ" }, key(), key())).rejects.toMatchObject({
      code: "PAYMENT_BANK_INELIGIBLE",
    });
    const completed = await approve(await submit(saved.record));
    expect(completed.payment_details?.fx_snapshot).toEqual(saved.record.payment_details?.fx_snapshot);
    const journals = await pool.query("select count(*)::integer as count from journal_entry where tenant_id=$1", [
      tenant,
    ]);
    expect(journals.rows[0]?.count).toBe(0);
  });
  it("fails closed on missing rates and requires refreshed approval when Accounting FX evidence changes", async () => {
    const invoice = await bill(supplierA, "10", "AED");
    const input = savePurchaseInputSchema.parse({
      company_id: company,
      kind: "payment",
      supplier_id: supplierA,
      document_date: "2026-11-05",
      allocations: [{ bill_id: invoice.id, amount: "100.00" }],
      payment_details: {
        bank_account_id: "purchase-bank-AED",
        entries: [
          {
            supplier_id: supplierA,
            amount: "100.00",
            mode: "bank_transfer",
            wht_rate: "2",
            additional_wht: "1.00",
          },
        ],
      },
    });
    await expect(repo.save(maker, null, { ...input, document_date: "2025-12-31" }, key(), key())).rejects.toMatchObject(
      { code: "COMPANY_CURRENCY_RATE_MISSING" },
    );
    const saved = (await repo.save(maker, null, input, key(), key())).record;
    expect(saved.payment_details?.fx_snapshot).toMatchObject({
      gross_base: "27.00",
      withholding_base: "0.54",
      additional_withholding_base: "0.27",
      net_base: "26.19",
    });
    const pending = await submit(saved);
    await pool.query(
      `insert into currency_rate(id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,created_by,reason,updated_at)
      values('purchase-rate-AED-new',$1,$2,'AED','USD','0.28','2026-11-05','active',1,'r06.maker','Synthetic rate change',now())`,
      [tenant, company],
    );
    await expect(approve(pending)).rejects.toMatchObject({ code: "PAYMENT_FX_SNAPSHOT_CHANGED" });
    const rejected = (
      await repo.action(
        checker,
        pending.id,
        {
          company_id: company,
          expected_version: pending.version,
          action: "reject",
          reason: "Refresh Accounting rate evidence",
        },
        key(),
        key(),
      )
    ).record;
    const refreshed = (
      await repo.save(maker, rejected.id, { ...input, expected_version: rejected.version }, key(), key())
    ).record;
    expect(refreshed.payment_details?.fx_snapshot?.net_base).toBe("27.16");
    expect((await approve(await submit(refreshed))).state).toBe("approved");
  });
  it("serializes concurrent payment approvals against the same bill", async () => {
    const invoice = await bill();
    const input = savePurchaseRequestSchema.parse({
      company_id: company,
      kind: "payment",
      supplier_id: supplierA,
      document_date: "2026-11-05",
      currency: "USD",
      allocations: [{ bill_id: invoice.id, amount: "75.00" }],
    });
    const attempts = await Promise.all([submit(await save(input)), submit(await save(input))]);
    const results = await Promise.allSettled(attempts.map((record) => approve(record)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await repo.get(maker, company, invoice.id)).reserved_amount).toBe("75.00");
  });
  it("enforces company, tenant, permission, impersonation and cursor boundaries", async () => {
    await expect(repo.list(maker, { company_id: "ungranted-company", search: "", limit: 10 })).rejects.toMatchObject({
      status: 403,
    });
    await expect(repo.companies({ ...maker, tenantId: "another-tenant" })).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.save({ ...maker, realActorId: "r06.checker" }, null, terms("request"), key(), key()),
    ).rejects.toMatchObject({ code: "IMPERSONATION_RESTRICTED" });
    await expect(
      repo.save(
        { ...maker, actor: { ...maker.actor, permissions: ["procurement.document.read"] } },
        null,
        terms("request"),
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    const page = await repo.list(maker, { company_id: company, kind: "request", search: "", limit: 1 });
    expect(page.next_cursor).toBeTruthy();
    await expect(
      repo.list(maker, { company_id: company, kind: "bill", search: "", limit: 1, cursor: page.next_cursor! }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    const draft = await save(terms("request"));
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "update procurement_document set row_version=row_version+1,notes='Unaudited' where tenant_id=$1 and id=$2",
        [tenant, draft.id],
      );
      await expect(client.query("commit")).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
  it("inherits the PR approver through every stage and approves without entered reasons", async () => {
    const request = await approved({ ...terms("request"), approver_id: checker.actor.userId });
    let previous = request;
    let po: PurchaseDocument | null = null;
    for (const kind of ["rfq", "order", "receipt", "bill"] as const) {
      const source = kind === "bill" ? po! : previous;
      const input = { ...terms(kind, source), approver_id: null };
      await expect(save({ ...input, approver_id: "r06.override-admin" })).rejects.toMatchObject({
        code: "PURCHASE_APPROVER_MISMATCH",
      });
      const draft = await save(input);
      expect(draft.approver_id).toBe(checker.actor.userId);
      expect((await repo.get(maker, company, draft.id)).request_approver_id).toBe(checker.actor.userId);
      const pending = await submit(draft);
      await expect(
        repo.action(
          context("r06.override-admin"),
          pending.id,
          { company_id: company, expected_version: pending.version, action: "approve" },
          key(),
          key(),
        ),
      ).rejects.toMatchObject({ code: "PURCHASE_APPROVER_REQUIRED" });
      const result = await repo.action(
        checker,
        pending.id,
        { company_id: company, expected_version: pending.version, action: "approve" },
        key(),
        key(),
      );
      expect(result.record.state).toBe("approved");
      expect(result.record.approver_id).toBe(checker.actor.userId);
      expect((await repo.get(maker, company, pending.id)).events.at(-1)?.reason).toBe(
        "Approved through the Purchase workflow.",
      );
      previous = result.record;
      if (kind === "order") po = result.record;
    }
  });
  it("assigns eligible company approvers and rejects another authorized checker", async () => {
    const directory = await repo.approvers(maker, { company_id: company, search: "", limit: 1 });
    expect(directory.items).toHaveLength(1);
    expect(directory.next_cursor).toBeTruthy();
    const rest = await repo.approvers(maker, {
      company_id: company,
      search: "",
      limit: 1,
      cursor: directory.next_cursor!,
    });
    expect(rest.items[0]?.id).not.toBe(directory.items[0]?.id);
    await expect(repo.approvers(maker, { company_id: "other", search: "", limit: 30 })).rejects.toMatchObject({
      status: 403,
    });
    await expect(save({ ...terms("request"), approver_id: "missing-user" })).rejects.toMatchObject({
      code: "PURCHASE_APPROVER_INELIGIBLE",
    });
    await expect(save({ ...terms("request"), approver_id: maker.actor.userId })).rejects.toMatchObject({
      code: "MAKER_CHECKER_REQUIRED",
    });
    const assigned = await save({ ...terms("request"), approver_id: checker.actor.userId });
    const updated = (
      await repo.save(maker, assigned.id, { ...terms("request"), expected_version: assigned.version }, key(), key())
    ).record;
    expect(updated.approver_id).toBe(checker.actor.userId);
    const pending = await submit(updated);
    expect(pending.approver_id).toBe(checker.actor.userId);
    await expect(
      repo.action(
        context("r06.override-admin"),
        pending.id,
        { company_id: company, expected_version: pending.version, action: "approve", reason: "Unassigned decision" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "PURCHASE_APPROVER_REQUIRED" });
    expect((await approve(pending)).state).toBe("approved");
  });
  it("requires live company-scoped self-approval and preserves explicit, idempotent audit history", async () => {
    const permission = "procurement.document.self_approve",
      policy = "r06-uat-policy-maker";
    await pool.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all')",
      [tenant, policy, permission],
    );
    const grant = () =>
      pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4)",
        [tenant, policy, permission, company],
      );
    const revoke = () =>
      pool.query(
        "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id=$2 and permission_key=$3",
        [tenant, policy, permission],
      );
    try {
      await grant();
      expect((await repo.options(maker, company)).can_self_approve).toBe(true);
      const pending = await submit(await save({ ...terms("request"), approver_id: maker.actor.userId }));
      const input = {
        company_id: company,
        expected_version: pending.version,
        action: "approve" as const,
        reason: "Explicit assigned self approval",
      };
      await revoke();
      expect((await repo.options(maker, company)).can_self_approve).toBe(false);
      await expect(repo.action(maker, pending.id, input, key(), key())).rejects.toMatchObject({
        code: "MAKER_CHECKER_REQUIRED",
      });
      await grant();
      const retry = key(),
        result = await repo.action(maker, pending.id, input, retry, key());
      expect(result.record.state).toBe("approved");
      expect(await repo.action(maker, pending.id, input, retry, key())).toEqual(result);
      expect((await repo.get(maker, company, pending.id)).events.map((event) => event.action)).toEqual([
        "created",
        "submit",
        "approve",
      ]);
    } finally {
      await revoke();
      await pool.query(
        "delete from security_role_permission_grant where tenant_id=$1 and role_policy_id=$2 and permission_key=$3",
        [tenant, policy, permission],
      );
    }
  });
  it("resolves product code/name from the live company catalog and retains source snapshots through billing", async () => {
    const permission = "inventory.item.create",
      policy = "r06-uat-policy-maker";
    await pool.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
      [tenant, policy, permission],
    );
    await pool.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
      [tenant, policy, permission, company],
    );
    const inventory = new SourceInventoryRepository(pool);
    const actor = { ...maker, actor: { ...maker.actor, permissions: [...permissions, permission] } };
    const productInput = productInputSchema.parse({
      category_id: "category-fixture-" + company,
      company_id: company,
      name: "Synthetic named valve",
      currency: "USD",
      unit: "Each",
    });
    const product = (await inventory.save(actor, null, productInput, key(), key())).record;
    expect((await repo.products(maker, { company_id: company, search: product.code, limit: 30 })).items).toEqual([
      expect.objectContaining({ id: product.id, name: product.name, code: product.code }),
    ]);
    expect((await repo.products(maker, { company_id: company, search: "named valve", limit: 30 })).items[0]?.id).toBe(
      product.id,
    );
    await expect(repo.products(maker, { company_id: "other", search: "", limit: 30 })).rejects.toMatchObject({
      status: 403,
    });
    const input = terms("request");
    input.lines[0] = { ...input.lines[0]!, product_id: product.id, item_code: "forged", product_name: "forged" };
    const requisition = await approved(input);
    expect(requisition.lines[0]).toMatchObject({
      product_id: product.id,
      item_code: product.code,
      product_name: product.name,
    });
    await inventory.save(
      actor,
      product.id,
      { ...productInput, name: "Renamed catalog valve", expected_version: product.version },
      key(),
      key(),
    );
    const invalid = terms("rfq", requisition);
    invalid.lines[0]!.product_name = "Changed downstream identity";
    await expect(save(invalid)).rejects.toMatchObject({ code: "PURCHASE_VALIDATION_FAILED" });
    const rfq = await approved(terms("rfq", requisition));
    const po = await approved(terms("order", rfq));
    await approved(terms("receipt", po));
    const invoice = await approved(terms("bill", po));
    expect(invoice.lines[0]).toMatchObject({ item_code: product.code, product_name: "Synthetic named valve" });
    await expect(save({ ...input, lines: [{ ...input.lines[0]!, product_id: "unavailable" }] })).rejects.toMatchObject({
      code: "PURCHASE_PRODUCT_INELIGIBLE",
    });
  });
  it("keeps commercial amounts unchanged while converting request units and partial downstream base quantities", async () => {
    const inventory = new SourceInventoryRepository(pool);
    const inventoryActor = {
      ...maker,
      actor: { ...maker.actor, permissions: [...permissions, "inventory.item.create"] },
    };
    const units = (
      await pool.query<{ id: string; name: string }>(
        "select id,name from inventory_unit where tenant_id=$1 and company_id=$2",
        [tenant, company],
      )
    ).rows;
    const gram = units.find((u) => u.name === "Gram")!;
    const product = (
      await inventory.save(
        inventoryActor,
        null,
        productInputSchema.parse({
          category_id: "category-fixture-" + company,
          company_id: company,
          name: "Conversion purchase material",
          currency: "USD",
          unit: "Kg",
        }),
        key(),
        key(),
      )
    ).record;
    const requestTerms = terms("request", undefined, null, "250");
    requestTerms.lines[0] = {
      ...requestTerms.lines[0]!,
      product_id: product.id,
      unit_id: gram.id,
      uom: "forged",
      unit_price: "2.00",
      tax_percent: "10",
    };
    const requisition = await approved(requestTerms);
    expect(requisition.lines[0]).toMatchObject({
      uom: "Gram",
      quantity: "250",
      unit_price: "2.00",
      unit_snapshot: { base_quantity: "0.25", base_unit_name: "Kg", unit_name: "Gram" },
    });
    expect(requisition.total_amount).toBe("550.00");
    // Purchase users can read eligible unit choices without Inventory management rights.
    expect((await inventory.units.choices(maker, company, product.id, "purchases")).base.name).toBe("Kg");
    const rfq = await approved(terms("rfq", requisition, null, "250"));
    const po = await approved(terms("order", rfq, supplierA, "250"));
    const first = await approved(terms("receipt", po, supplierA, "100"));
    expect(first.lines[0]!.unit_snapshot?.base_quantity).toBe("0.1");
    const invoice = await approved(terms("bill", po, supplierA, "100"));
    expect(invoice.total_amount).toBe("220.00");
    expect(invoice.lines[0]).toMatchObject({
      uom: "Gram",
      unit_snapshot: { base_quantity: "0.1", entered_quantity: "100", numerator: "1", denominator: "1000" },
    });
    const changedUnit = terms("receipt", po, supplierA, "100");
    changedUnit.lines[0]!.uom = "Kg";
    await expect(save(changedUnit)).rejects.toMatchObject({ code: "PURCHASE_VALIDATION_FAILED" });
    await expect(approved(terms("receipt", po, supplierA, "151"))).rejects.toMatchObject({
      code: "PURCHASE_QUANTITY_EXCEEDED",
    });
    const forged = terms("request", undefined, null, "1");
    forged.lines[0] = {
      ...forged.lines[0]!,
      product_id: product.id,
      unit_id: gram.id,
      unit_snapshot: { ...invoice.lines[0]!.unit_snapshot!, base_quantity: "999" },
    };
    const corrected = await save(forged);
    expect(corrected.lines[0]!.unit_snapshot?.base_quantity).toBe("0.001");
  });
  it("returns the complete linked Request-to-Bill progress from any stage with scoped pagination and exact status counts", async () => {
    const requisition = await approved(terms("request"));
    const rfq = await approved(terms("rfq", requisition));
    const po = await approved(terms("order", rfq));
    const received = await approved(terms("receipt", po, supplierA, "4"));
    const pendingReceipt = await save(terms("receipt", po, supplierA, "6"));
    const invoice = await approved(terms("bill", po, supplierA, "4"));
    const unrelated = await save(terms("request"));
    const first = await repo.flow(maker, invoice.id, { company_id: company, limit: 2 });
    expect(first).toMatchObject({
      root_id: requisition.id,
      root_code: requisition.code,
      next_cursor: expect.any(String),
    });
    expect(first.items).toHaveLength(2);
    expect(first.stages.find((stage) => stage.kind === "receipt")).toMatchObject({ total: 2, draft: 1, approved: 1 });
    const ids = first.items.map((item) => item.id);
    let cursor = first.next_cursor;
    while (cursor) {
      const page = await repo.flow(maker, po.id, { company_id: company, limit: 2, cursor });
      ids.push(...page.items.map((item) => item.id));
      cursor = page.next_cursor;
    }
    expect(ids.sort()).toEqual([requisition.id, rfq.id, po.id, received.id, pendingReceipt.id, invoice.id].sort());
    expect(ids).not.toContain(unrelated.id);
    await expect(
      repo.flow(maker, unrelated.id, { company_id: company, limit: 2, cursor: first.next_cursor! }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    await expect(repo.flow(maker, invoice.id, { company_id: "other-company", limit: 2 })).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      repo.flow({ ...maker, tenantId: "other-tenant" }, invoice.id, { company_id: company, limit: 2 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.flow({ ...maker, actor: { ...maker.actor, permissions: [] } }, invoice.id, {
        company_id: company,
        limit: 2,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(repo.flow(maker, "missing-document", { company_id: company, limit: 2 })).rejects.toMatchObject({
      status: 404,
    });
  });
  it("validates the public API, CSRF, If-Match and live database authority", async () => {
    const session = {
      tenantId: tenant,
      userId: maker.actor.userId,
      sessionId: "synthetic-purchase",
      csrfToken: "synthetic-csrf",
      idleExpiresAt: new Date(),
      absoluteExpiresAt: new Date(),
    };
    // Only session restoration is simulated; all data, permission and scope checks use PostgreSQL.
    const authentication = { loadAuthenticatedAccount: async () => maker.actor } as TenantAuthApiService;
    const sessions = {
      get: async () => session,
      authorizeMutation: async (_token: string, csrf: string) =>
        csrf === session.csrfToken ? { status: "ok", session } : { status: "invalid_csrf" },
    } as TenantSessionApiService;
    const app = createApp({
      config: { allowedOrigins: new Set(["https://erp.example.test"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      authService: authentication,
      sessionService: sessions,
      procurementRepository: repo,
    });
    expect(
      (
        await request(app)
          .get(`/api/v1/procurement/documents?company_id=${company}`)
          .set("cookie", "nexora_session=synthetic")
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get(`/api/v1/procurement/documents?company_id=${company}&unexpected=yes`)
          .set("cookie", "nexora_session=synthetic")
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/v1/procurement/documents")
          .set("cookie", "nexora_session=synthetic")
          .set("idempotency-key", key())
          .send(terms("request"))
      ).status,
    ).toBe(403);
    const created = await request(app)
      .post("/api/v1/procurement/documents")
      .set("cookie", "nexora_session=synthetic")
      .set("origin", "https://erp.example.test")
      .set("idempotency-key", key())
      .set("x-csrf-token", session.csrfToken)
      .send(terms("request"));
    expect(created.status).toBe(201);
    const workflow = await request(app)
      .get(`/api/v1/procurement/documents/${created.body.record.id}/flow?company_id=${company}`)
      .set("cookie", "nexora_session=synthetic");
    expect(workflow.status).toBe(200);
    expect(workflow.body.root_id).toBe(created.body.record.id);
    expect(
      (
        await request(app)
          .get(`/api/v1/procurement/documents/${created.body.record.id}/flow?company_id=${company}&limit=101`)
          .set("cookie", "nexora_session=synthetic")
      ).status,
    ).toBe(400);
    for (const path of ["products", "approvers"]) {
      const directory = await request(app)
        .get(`/api/v1/procurement/${path}?company_id=${company}&limit=1`)
        .set("cookie", "nexora_session=synthetic");
      expect(directory.status).toBe(200);
      expect(directory.body.items).toHaveLength(1);
      expect(
        (
          await request(app)
            .get(`/api/v1/procurement/${path}?company_id=${company}&limit=101`)
            .set("cookie", "nexora_session=synthetic")
        ).status,
      ).toBe(400);
    }
    const update = await request(app)
      .patch(`/api/v1/procurement/documents/${created.body.record.id}`)
      .set("cookie", "nexora_session=synthetic")
      .set("idempotency-key", key())
      .set("x-csrf-token", session.csrfToken)
      .send({ ...terms("request"), expected_version: 1 });
    expect(update.status).toBe(412);
    expect(
      (
        await request(app)
          .get(`/api/v1/procurement/documents?company_id=${company}`)
          .set("cookie", "nexora_session=synthetic")
          .set("x-tenant-id", "other-tenant")
      ).status,
    ).toBe(403);
  });
});
