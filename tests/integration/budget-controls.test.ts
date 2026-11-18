import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  budgetPlanInputSchema,
  budgetVersionInputSchema,
  budgetQuerySchema,
  savePurchaseRequestSchema,
  supplierInputSchema,
  decimal,
  type PurchaseDocument,
  type PurchaseKind,
  type SubledgerOperation,
} from "../../packages/contracts/src/index.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupSubledgerFixture, subledgerActor } from "./subledger-fixture.js";
import { SourceBudgetRepository } from "../../server/api/src/modules/budget/source-repository.js";
import { BudgetService } from "../../server/api/src/modules/budget/service.js";
import { SourceProcurementRepository } from "../../server/api/src/modules/procurement/source-repository.js";
import { SupplierProfileCrypto } from "../../server/api/src/modules/procurement/supplier-profile-crypto.js";
import { FinancePostingService } from "../../server/api/src/modules/finance/posting/service.js";
import { createFinanceTransactionClient } from "../../server/api/src/modules/finance/posting/types.js";
import { reconcileBudgetPurchases } from "../../server/api/src/modules/budget/accounting-bridge.js";

describe("Atomic purchase commitments and GL budget controls", () => {
  let db: Awaited<ReturnType<typeof createDisposableSourceDatabase>>,
    f: Awaited<ReturnType<typeof setupSubledgerFixture>>,
    budget: BudgetService,
    purchasing: SourceProcurementRepository;
  let permissions: string[],
    today: string,
    period: string,
    versionId: string,
    supplier: string,
    order: PurchaseDocument,
    bill: PurchaseDocument,
    recognized: SubledgerOperation;
  const actor = (id = "r06.maker") => {
    const c = subledgerActor(id);
    return { ...c, actor: { ...c.actor, permissions: [...c.actor.permissions, ...permissions] } };
  };
  beforeAll(async () => {
    db = await createDisposableSourceDatabase(
      process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_source_test",
    );
    f = await setupSubledgerFixture(db.pool, undefined, "USD");
    budget = new BudgetService(new SourceBudgetRepository(db.pool));
    purchasing = new SourceProcurementRepository(
      db.pool,
      new SupplierProfileCrypto(randomBytes(32).toString("base64"), "budget-test"),
    );
    permissions = [
      ...(
        await db.pool.query<{ permission_key: string }>(
          "select permission_key from security_permission_definition where module='budget'",
        )
      ).rows.map((r) => r.permission_key),
      "procurement.document.read",
      "procurement.document.create",
      "procurement.document.submit",
      "procurement.document.approve",
      "procurement.document.action",
      "procurement.vendor.read",
      "procurement.vendor.create",
    ];
    for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"]) {
      await db.pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,$2,p,'all' from unnest($3::text[]) p on conflict do nothing",
        [f.tenant, policy, permissions],
      );
      await db.pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,$2,p,'company',$4 from unnest($3::text[]) p on conflict do nothing",
        [f.tenant, policy, permissions, f.company],
      );
    }
    today = (await db.pool.query<{ date: string }>("select current_date::text as date")).rows[0]!.date;
    period = (
      await db.pool.query<{ id: string }>(
        "select id from financial_period where tenant_id=$1 and company_id=$2 and $3::date between period_start and period_end",
        [f.tenant, f.company, today],
      )
    ).rows[0]!.id;
    const plan = await budget.records.createPlan(
      actor(),
      budgetPlanInputSchema.parse({
        company_id: f.company,
        name: "Controlled operating plan",
        fiscal_calendar_id: `cal-${f.company}`,
        reason: "Control acceptance",
      }),
      randomUUID(),
      randomUUID(),
    );
    let version = await budget.records.createVersion(
      actor(),
      budgetVersionInputSchema.parse({
        company_id: f.company,
        plan_id: plan.id,
        name: "Approved control",
        reason: "Control acceptance",
        lines: [{ account_id: f.policy.expense_account_id, allocations: [{ period_id: period, amount: "1000.00" }] }],
      }),
      randomUUID(),
      randomUUID(),
    );
    version = await budget.governance.action(
      actor(),
      version.record.id,
      {
        company_id: f.company,
        expected_version: version.record.version,
        action: "submit",
        approver_id: "r06.checker",
        reason: "Independent control review",
      },
      randomUUID(),
      randomUUID(),
    );
    version = await budget.governance.action(
      actor("r06.checker"),
      version.record.id,
      {
        company_id: f.company,
        expected_version: version.record.version,
        action: "approve",
        reason: "Independent control approval",
      },
      randomUUID(),
      randomUUID(),
    );
    versionId = version.record.id;
    await budget.governance.policy(
      actor("r06.checker"),
      {
        company_id: f.company,
        fiscal_calendar_id: `cal-${f.company}`,
        control_version_id: versionId,
        expected_version: 0,
        enabled: true,
        mode: "block",
        warn_percent: "80",
        effective_date: today,
        reason: "Activate isolated controls",
      },
      randomUUID(),
    );
    const vendor = await purchasing.saveSupplier(
      actor(),
      null,
      supplierInputSchema.parse({ company_id: f.company, name: "Budget control supplier" }),
      randomUUID(),
      randomUUID(),
    );
    supplier = vendor.record.id;
    await f.repository.createParty(
      actor(),
      {
        company_id: f.company,
        kind: "supplier",
        name: vendor.record.name,
        default_currency: "USD",
        source_supplier_id: supplier,
      },
      randomUUID(),
    );
  }, 90000);
  afterAll(async () => {
    await db?.close();
  });
  async function approve(d: PurchaseDocument) {
    for (const [ctx, action] of [
      [actor(), "submit"],
      [actor("r06.checker"), "approve"],
    ] as const)
      d = (
        await purchasing.action(
          ctx,
          d.id,
          {
            company_id: f.company,
            expected_version: d.version,
            action,
            reason: "Isolated independent purchase review",
          },
          randomUUID(),
          randomUUID(),
        )
      ).record;
    return d;
  }
  async function document(kind: PurchaseKind, source?: PurchaseDocument, quantity = "10", price = "10") {
    return (
      await purchasing.save(
        actor(),
        null,
        savePurchaseRequestSchema.parse({
          company_id: f.company,
          kind,
          supplier_id: ["request", "rfq"].includes(kind) ? null : supplier,
          source_id: source?.id ?? null,
          invited_supplier_ids: kind === "rfq" ? [supplier] : [],
          approver_id: "r06.checker",
          document_date: today,
          reference: `BGT-${randomUUID()}`,
          currency: "USD",
          lines: [
            {
              source_line_id: source?.lines[0]!.id ?? null,
              item_code: "BGT-SERVICE",
              description: "Budget controlled service",
              quantity,
              uom: "Each",
              unit_price: price,
              tax_percent: "0",
              nominal_account_id: f.policy.expense_account_id,
            },
          ],
        }),
        randomUUID(),
        randomUUID(),
      )
    ).record;
  }
  async function purchaseOrder(quantity = "10", price = "10") {
    const request = await approve(await document("request", undefined, quantity, price)),
      rfq = await approve(await document("rfq", request, quantity, price));
    return document("order", rfq, quantity, price);
  }
  const report = () =>
    budget.report(
      actor(),
      budgetQuerySchema.parse({ company_id: f.company, version_id: versionId, period_id: period, as_of: today }),
    );
  async function post(operation: SubledgerOperation) {
    for (const [ctx, action] of [
      [actor(), "submit"],
      [actor("r06.checker"), "approve"],
      [actor("r06.target"), "post"],
    ] as const)
      operation = await f.repository.action(
        ctx,
        operation.id,
        { company_id: f.company, expected_version: operation.version, action, reason: "Isolated financial review" },
        randomUUID(),
      );
    return operation;
  }
  it("reserves an approved order once and keeps receipts separate", async () => {
    order = await approve(await purchaseOrder());
    let r = await report();
    expect(r.totals.commitment).toBe("100.00000000");
    expect(r.totals.available).toBe("900.00000000");
    await approve(await document("receipt", order, "4"));
    r = await report();
    expect(r.totals.commitment).toBe("100.00000000");
  });
  it("releases only the partial bill amount when its real GL recognition posts", async () => {
    bill = await approve(await document("bill", order, "4"));
    expect((await report()).totals.commitment).toBe("100.00000000");
    recognized = await post(
      await f.repository.preparePurchase(
        actor(),
        bill.id,
        { company_id: f.company, expected_version: bill.version },
        randomUUID(),
      ),
    );
    const r = await report();
    expect(r.totals.actual).toBe("40.00000000");
    expect(r.totals.commitment).toBe("60.00000000");
    expect(r.totals.available).toBe("900.00000000");
    expect(
      (
        await db.pool.query("select count(*)::int as n from budget_commitment_event where journal_id=$1", [
          recognized.journal_id,
        ])
      ).rows[0].n,
    ).toBe(1);
  });
  it("rolls back a GL posting that would exceed the active budget", async () => {
    const source = randomUUID();
    const c = await db.pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.maker',true)", [
        f.tenant,
      ]);
      await expect(
        new FinancePostingService().post(await createFinanceTransactionClient(c), {
          tenantId: f.tenant,
          companyId: f.company,
          actorId: "r06.maker",
          sourceType: "budget_control_test",
          sourceId: source,
          eventType: "budget_control_test.posted",
          postingDate: today,
          externalIdempotencyKey: randomUUID(),
          transactionCurrency: "USD",
          exchangeRateId: null,
          exchangeRateValue: "1",
          payloadHashMaterial: { test: true },
          lines: [
            {
              accountId: f.policy.expense_account_id,
              debit: "950",
              credit: "0",
              dimensions: {},
              description: "Exceeds remaining budget",
            },
            {
              accountId: f.policy.payable_account_id,
              debit: "0",
              credit: "950",
              dimensions: {},
              description: "Offset",
            },
          ],
        }),
      ).rejects.toMatchObject({ code: "FINANCE_BUDGET_BLOCKED" });
      await c.query("rollback");
    } finally {
      c.release();
    }
    expect(
      (await db.pool.query("select count(*)::int as n from accounting_event where source_id=$1", [source])).rows[0].n,
    ).toBe(0);
    expect((await report()).totals.available).toBe("900.00000000");
  });
  it("restores commitment exposure on financial reversal without losing historical evidence", async () => {
    await post(
      await f.repository.create(
        actor(),
        {
          company_id: f.company,
          type: "reversal",
          operation_id: recognized.id,
          date: today,
          reason: "Reverse isolated partial recognition",
        },
        randomUUID(),
      ),
    );
    const r = await report();
    expect(r.totals.actual).toBe("0.00000000");
    expect(r.totals.commitment).toBe("100.00000000");
  });
  it("backfills historical recognition and reversal once without losing restored exposure", async () => {
    const c = await db.pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.checker',true)", [
        f.tenant,
      ]);
      // Simulate pre-Budget journals only inside this rolled-back fixture transaction.
      await c.query("alter table budget_commitment_event disable trigger immutable_evidence");
      await c.query("delete from budget_commitment_event where tenant_id=$1 and company_id=$2", [f.tenant, f.company]);
      await c.query("alter table budget_commitment_event enable trigger immutable_evidence");
      const first = await reconcileBudgetPurchases(c, f.tenant, f.company, "r06.checker");
      expect(first.journals).toBe(2);
      await reconcileBudgetPurchases(c, f.tenant, f.company, "r06.checker");
      const evidence = (
        await c.query<{ n: number; consumed: string }>(
          "select count(*)::int as n,coalesce(sum(base_delta),0)::text as consumed from budget_commitment_event where tenant_id=$1 and company_id=$2",
          [f.tenant, f.company],
        )
      ).rows[0]!;
      expect(evidence.n).toBe(2);
      expect(decimal(evidence.consumed, 8, true)).toBe(0n);
      await c.query("set constraints all immediate");
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
  it("serializes simultaneous approvals against one available balance", async () => {
    let a = await purchaseOrder("1", "500"),
      b = await purchaseOrder("1", "500");
    for (const d of [a, b]) {
      const result = (
        await purchasing.action(
          actor(),
          d.id,
          { company_id: f.company, expected_version: d.version, action: "submit", reason: "Concurrent control test" },
          randomUUID(),
          randomUUID(),
        )
      ).record;
      if (d.id === a.id) a = result;
      else b = result;
    }
    const results = await Promise.allSettled(
      [a, b].map((d) =>
        purchasing.action(
          actor("r06.checker"),
          d.id,
          { company_id: f.company, expected_version: d.version, action: "approve", reason: "Competing approval" },
          randomUUID(),
          randomUUID(),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(decimal((await report()).totals.commitment, 8)).toBe(60000000000n);
  });
  it("requires independent closure and preserves the reservation audit trail", async () => {
    const commitment = (await report()).commitments.find((c) => c.source_document_id === order.id)!;
    const request = await budget.governance.request(
      actor(),
      {
        company_id: f.company,
        request: { kind: "closure", commitment_id: commitment.id, effective_date: today },
        reason: "Close remaining source obligation",
      },
      randomUUID(),
      randomUUID(),
    );
    await expect(
      budget.governance.requestAction(
        actor(),
        request.id,
        { company_id: f.company, expected_version: request.version, action: "approve", reason: "Self closure attempt" },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    await budget.governance.requestAction(
      actor("r06.checker"),
      request.id,
      {
        company_id: f.company,
        expected_version: request.version,
        action: "approve",
        reason: "Independent source closure",
      },
      randomUUID(),
      randomUUID(),
    );
    expect((await report()).totals.commitment).toBe("500.00000000");
    expect(
      (
        await db.pool.query("select count(*)::int as n from budget_commitment_event where commitment_id=$1", [
          commitment.id,
        ])
      ).rows[0].n,
    ).toBe(3);
  });
  it("requires a current source-bound exception under approval policy", async () => {
    await budget.governance.policy(
      actor("r06.checker"),
      {
        company_id: f.company,
        fiscal_calendar_id: `cal-${f.company}`,
        control_version_id: versionId,
        expected_version: 1,
        enabled: true,
        mode: "approval",
        warn_percent: "80",
        effective_date: today,
        reason: "Require independent exceptions",
      },
      randomUUID(),
    );
    let pending = await purchaseOrder("1", "800");
    pending = (
      await purchasing.action(
        actor(),
        pending.id,
        {
          company_id: f.company,
          expected_version: pending.version,
          action: "submit",
          reason: "Submit exception source",
        },
        randomUUID(),
        randomUUID(),
      )
    ).record;
    const decision = {
      company_id: f.company,
      expected_version: pending.version,
      action: "approve" as const,
      reason: "Approve exception source",
    };
    await expect(
      purchasing.action(actor("r06.checker"), pending.id, decision, randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ code: "BUDGET_APPROVAL_REQUIRED" });
    const control = await budget.sourceControl(actor(), f.company, pending.id);
    expect(control.policies.map((policy) => policy.id)).toContain(control.policy!.id);
    const request = await budget.governance.request(
      actor(),
      {
        company_id: f.company,
        request: {
          kind: "exception",
          source_document_id: pending.id,
          source_version: control.source_version,
          source_hash: control.source_hash,
          policy_id: control.policy!.id,
        },
        reason: "Independently authorize excess purchase",
      },
      randomUUID(),
      randomUUID(),
    );
    await budget.governance.requestAction(
      actor("r06.checker"),
      request.id,
      {
        company_id: f.company,
        expected_version: request.version,
        action: "approve",
        reason: "Independent exception review",
      },
      randomUUID(),
      randomUUID(),
    );
    const approved = (await purchasing.action(actor("r06.checker"), pending.id, decision, randomUUID(), randomUUID()))
      .record;
    const commitment = (await report()).commitments.find((c) => c.source_document_id === approved.id)!;
    const close = await budget.governance.request(
      actor(),
      {
        company_id: f.company,
        request: { kind: "closure", commitment_id: commitment.id, effective_date: today },
        reason: "Finish isolated exception acceptance",
      },
      randomUUID(),
      randomUUID(),
    );
    await budget.governance.requestAction(
      actor("r06.checker"),
      close.id,
      {
        company_id: f.company,
        expected_version: close.version,
        action: "approve",
        reason: "Independent acceptance cleanup",
      },
      randomUUID(),
      randomUUID(),
    );
  });
  it("allows warning-policy approvals and retains the warning in idempotent audit results", async () => {
    await budget.governance.policy(
      actor("r06.checker"),
      {
        company_id: f.company,
        fiscal_calendar_id: `cal-${f.company}`,
        control_version_id: versionId,
        expected_version: 2,
        enabled: true,
        mode: "warning",
        warn_percent: "80",
        effective_date: today,
        reason: "Warn without blocking approval",
      },
      randomUUID(),
    );
    let pending = await purchaseOrder("1", "800");
    pending = (
      await purchasing.action(
        actor(),
        pending.id,
        { company_id: f.company, expected_version: pending.version, action: "submit", reason: "Submit warning source" },
        randomUUID(),
        randomUUID(),
      )
    ).record;
    const key = randomUUID(),
      decision = {
        company_id: f.company,
        expected_version: pending.version,
        action: "approve" as const,
        reason: "Approve under warning policy",
      };
    const result = await purchasing.action(actor("r06.checker"), pending.id, decision, key, randomUUID());
    expect(result.budget_warnings?.join(" ")).toContain("exceeds");
    expect(
      (await purchasing.action(actor("r06.checker"), pending.id, decision, key, randomUUID())).budget_warnings,
    ).toEqual(result.budget_warnings);
  });
});
