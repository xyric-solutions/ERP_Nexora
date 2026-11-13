import { randomUUID, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  subledgerQuerySchema,
  subledgerReportQuerySchema,
  type SubledgerInput,
  type SubledgerOperation,
  savePurchaseRequestSchema,
  supplierInputSchema,
  type PurchaseDocument,
  type PurchaseKind,
} from "../../packages/contracts/src/index.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupSubledgerFixture, subledgerActor } from "./subledger-fixture.js";
import { SubledgerReports } from "../../server/api/src/modules/finance/subledger/reports.js";
import { SourceSubledgerRepository } from "../../server/api/src/modules/finance/subledger/source-repository.js";
import { SourceProcurementRepository } from "../../server/api/src/modules/procurement/source-repository.js";
import { SupplierProfileCrypto } from "../../server/api/src/modules/procurement/supplier-profile-crypto.js";

const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("persistent multi-currency customer/vendor accounting", () => {
  let close: () => Promise<void>;
  let fixture: Awaited<ReturnType<typeof setupSubledgerFixture>>;
  beforeAll(async () => {
    const database = await createDisposableSourceDatabase(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
    close = database.close;
    fixture = await setupSubledgerFixture(database.pool);
  }, 60000);
  afterAll(async () => {
    await close?.();
  });
  const maker = subledgerActor(),
    checker = subledgerActor("r06.checker"),
    poster = subledgerActor("r06.target");
  async function post(input: SubledgerInput, repository = fixture.repository) {
    let op = await repository.create(maker, input, randomUUID());
    op = await repository.action(
      maker,
      op.id,
      { company_id: input.company_id, action: "submit", expected_version: op.version, reason: "Submit audited test" },
      randomUUID(),
    );
    op = await repository.action(
      checker,
      op.id,
      {
        company_id: input.company_id,
        action: "approve",
        expected_version: op.version,
        reason: "Independent test review",
      },
      randomUUID(),
    );
    return repository.action(
      poster,
      op.id,
      { company_id: input.company_id, action: "post", expected_version: op.version, reason: "Post reviewed test" },
      randomUUID(),
    );
  }
  const workspace = (as_of = "2026-11-30", party_id?: string) =>
    fixture.repository.workspace(
      maker,
      subledgerQuerySchema.parse({ company_id: fixture.company, as_of, party_id, limit: 100 }),
    );
  const report = (kind: string, as_of = "2026-11-30", rest = {}) =>
    new SubledgerReports(fixture.repository).run(
      maker,
      subledgerReportQuerySchema.parse({ company_id: fixture.company, as_of, report: kind, ...rest }),
    );
  async function party(kind: "customer" | "supplier" = "customer") {
    return fixture.repository.createParty(
      maker,
      { company_id: fixture.company, name: `Currency party ${randomUUID()}`, kind, default_currency: "USD" },
      randomUUID(),
    );
  }
  const recognize = (
    party_id: string,
    currency: string,
    amount: string,
    date = "2026-09-20",
    side: "receivable" | "payable" = "receivable",
    kind: "invoice" | "credit_note" | "advance" = "invoice",
  ): SubledgerInput => ({
    company_id: fixture.company,
    type: "recognition",
    party_id,
    side,
    kind,
    currency,
    amount,
    date,
    due_date: date,
    monetary: true,
    reference: "",
    reason: "Controlled currency test",
  });
  let customerId: string, invoice: SubledgerOperation;
  it("persists separate currency balances, exact carrying values and full-filter totals", async () => {
    const customer = await party();
    customerId = customer.id;
    invoice = await post(recognize(customer.id, "USD", "1000"));
    await post(recognize(customer.id, "EUR", "500"));
    await post(recognize(customer.id, "PKR", "50000"));
    const data = await workspace("2026-09-30", customer.id);
    expect(data.balances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: "USD", outstanding: "1000.00", carrying: "280000.00" }),
        expect.objectContaining({ currency: "EUR", outstanding: "500.00", carrying: "150000.00" }),
        expect.objectContaining({ currency: "PKR", outstanding: "50000.00", carrying: "50000.00" }),
      ]),
    );
    const reloaded = await new SourceSubledgerRepository(fixture.pool).workspace(
      maker,
      subledgerQuerySchema.parse({ company_id: fixture.company, as_of: "2026-09-30", party_id: customer.id, limit: 1 }),
    );
    expect(reloaded.items).toHaveLength(1);
    expect(reloaded.total_items).toBe(3);
    expect(reloaded.balances).toHaveLength(1);
    expect(reloaded.total_balances).toBe(3);
    expect(reloaded.carrying_total).toBe("480000.00");
    expect((await report("trial_balance", "2026-09-30")).reconciliation.every((row) => row.difference === "0.00")).toBe(
      true,
    );
  });
  it("settles partially, posts realized FX and revalues only the remaining amount", async () => {
    await fixture.rate("USD", "285", "2026-10-01");
    const receipt = await post({
      company_id: fixture.company,
      type: "settlement",
      party_id: customerId,
      side: "receivable",
      date: "2026-10-02",
      reference: "",
      reason: "Part receipt",
      payment_currency: "USD",
      payment_amount: "500",
      bank_fee: "0",
      bank_account_id: fixture.banks.USD!,
      allocations: [{ item_id: invoice.id, amount: "500" }],
    });
    expect(receipt.preview).toMatchObject({ realized_gain: "2500.00" });
    const after = (await workspace("2026-10-02", customerId)).items.find((item) => item.id === invoice.id)!;
    expect(after).toMatchObject({ outstanding: "500.00", carrying: "140000.00", unrealized: "0.00" });
    await post({
      company_id: fixture.company,
      type: "revaluation",
      side: "receivable",
      party_id: customerId,
      currency: "USD",
      date: "2026-10-31",
      reference: "",
      reason: "Month end valuation",
    });
    expect((await workspace("2026-10-31", customerId)).items.find((item) => item.id === invoice.id)).toMatchObject({
      outstanding: "500.00",
      carrying: "142500.00",
      unrealized: "2500.00",
    });
    await fixture.rate("USD", "287", "2026-11-01");
    const final = await post({
      company_id: fixture.company,
      type: "settlement",
      party_id: customerId,
      side: "receivable",
      date: "2026-11-02",
      reference: "",
      reason: "Final receipt",
      payment_currency: "USD",
      payment_amount: "500",
      bank_fee: "0",
      bank_account_id: fixture.banks.USD!,
      allocations: [{ item_id: invoice.id, amount: "500" }],
    });
    expect(final.preview).toMatchObject({ realized_gain: "3500.00" });
    expect((await workspace("2026-11-02", customerId)).items.find((item) => item.id === invoice.id)).toMatchObject({
      outstanding: "0.00",
      carrying: "0.00",
      unrealized: "0.00",
    });
    const gl = await report("trial_balance", "2026-11-02");
    expect(gl.debit).toBe(gl.credit);
    expect(gl.reconciliation.every((row) => row.difference === "0.00")).toBe(true);
    expect(gl.rows.find((row) => row.id === fixture.policy.realized_gain_account_id)?.balance).toBe("-6000.00");
    expect(gl.rows.find((row) => row.id === fixture.policy.unrealized_gain_account_id)?.balance).toBe("0.00");
    expect((await workspace("2026-10-31", customerId)).items.find((item) => item.id === invoice.id)?.carrying).toBe(
      "142500.00",
    );
  });
  it("recognizes opposite supplier FX signs and exact three-decimal currencies", async () => {
    const supplier = await party("supplier");
    const bill = await post(recognize(supplier.id, "USD", "1000", "2026-09-20", "payable"));
    const paid = await post({
      company_id: fixture.company,
      type: "settlement",
      side: "payable",
      party_id: supplier.id,
      date: "2026-11-03",
      reference: "",
      reason: "Supplier settlement",
      payment_currency: "USD",
      payment_amount: "1000",
      bank_fee: "0",
      bank_account_id: fixture.banks.USD!,
      allocations: [{ item_id: bill.id, amount: "1000" }],
    });
    expect(paid.preview).toMatchObject({ realized_gain: "-7000.00" });
    const customer = await party();
    const kwd = await post(recognize(customer.id, "KWD", "1.234"));
    expect((await workspace("2026-09-30", customer.id)).items.find((item) => item.id === kwd.id)).toMatchObject({
      outstanding: "1.234",
      carrying: "1110.60",
    });
    await expect(
      fixture.repository.create(maker, recognize(customer.id, "JPY", "1.1"), randomUUID()),
    ).rejects.toMatchObject({ code: "SUBLEDGER_AMOUNT_INVALID" });
  });
  it("requires independent decisions, idempotency, current snapshots and tenant/company authorization", async () => {
    const customer = await party();
    const input = recognize(customer.id, "USD", "10", "2026-11-05");
    const key = randomUUID();
    let draft = await fixture.repository.create(maker, input, key);
    expect((await fixture.repository.create(maker, input, key)).id).toBe(draft.id);
    const retries = await Promise.all([
      fixture.repository.create(maker, input, key),
      fixture.repository.create(maker, input, key),
    ]);
    expect(retries.every((retry) => retry.id === draft.id)).toBe(true);
    await expect(fixture.repository.create(maker, { ...input, reference: "different" }, key)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    draft = await fixture.repository.action(
      maker,
      draft.id,
      { company_id: fixture.company, action: "submit", expected_version: draft.version, reason: "Submit test" },
      randomUUID(),
    );
    await expect(
      fixture.repository.action(
        maker,
        draft.id,
        {
          company_id: fixture.company,
          action: "approve",
          expected_version: draft.version,
          reason: "Try self approval",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    await fixture.rate("USD", "288", "2026-11-04");
    await expect(
      fixture.repository.action(
        checker,
        draft.id,
        {
          company_id: fixture.company,
          action: "approve",
          expected_version: draft.version,
          reason: "Approve stale rate",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "SUBLEDGER_SNAPSHOT_CHANGED" });
    await expect(
      fixture.repository.workspace(
        { ...maker, tenantId: "other-tenant" },
        subledgerQuerySchema.parse({ company_id: fixture.company, as_of: "2026-11-30" }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      fixture.repository.workspace(
        maker,
        subledgerQuerySchema.parse({ company_id: "other-company", as_of: "2026-11-30" }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      fixture.pool.query("update finance_subledger_item_event set base_delta=0 where tenant_id=$1", [fixture.tenant]),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("settles a USD invoice through a EUR bank with explicit rates and a separate fee", async () => {
    const customer = await party();
    const item = await post(recognize(customer.id, "USD", "100", "2026-09-25"));
    const settlement = await post({
      company_id: fixture.company,
      type: "settlement",
      side: "receivable",
      party_id: customer.id,
      date: "2026-11-07",
      reason: "Cross currency receipt",
      reference: "",
      payment_currency: "EUR",
      payment_amount: "96",
      bank_fee: "1",
      bank_account_id: fixture.banks.EUR!,
      allocations: [{ item_id: item.id, amount: "100" }],
    });
    expect(settlement.preview).toMatchObject({ realized_gain: "800.00" });
    expect((await workspace("2026-11-07", customer.id)).items[0]).toMatchObject({
      outstanding: "0.00",
      carrying: "0.00",
    });
    expect(settlement.preview?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: "EUR", debit: "95.00", credit: "0.00" }),
        expect.objectContaining({ description: `${settlement.code} bank fee`, debit: "300.00" }),
      ]),
    );
    const fx = await report("fx", "2026-11-07", { party_id: customer.id });
    expect(fx.balance).toBe("800.00");
  });
  it("offsets credits and records a refunded credit without modifying original postings", async () => {
    const customer = await party();
    const original = await post(recognize(customer.id, "USD", "30", "2026-11-08"));
    const credit = await post(recognize(customer.id, "USD", "50", "2026-11-08", "receivable", "credit_note"));
    await post({
      company_id: fixture.company,
      type: "offset",
      side: "receivable",
      party_id: customer.id,
      date: "2026-11-08",
      reason: "Apply credit note",
      reference: "",
      allocations: [
        { item_id: original.id, amount: "30" },
        { item_id: credit.id, amount: "30" },
      ],
    });
    await post({
      company_id: fixture.company,
      type: "settlement",
      side: "receivable",
      party_id: customer.id,
      date: "2026-11-09",
      reason: "Refund remaining credit",
      reference: "",
      payment_currency: "USD",
      payment_amount: "20",
      bank_fee: "0",
      bank_account_id: fixture.banks.USD!,
      allocations: [{ item_id: credit.id, amount: "20" }],
    });
    expect(
      (await workspace("2026-11-09", customer.id)).items.every(
        (item) => item.outstanding === "0.00" && item.carrying === "0.00",
      ),
    ).toBe(true);
  });
  it("serializes concurrent allocations and preserves one financial effect under replay", async () => {
    const customer = await party();
    const item = await post(recognize(customer.id, "USD", "100", "2026-11-10"));
    const prepare = async () => {
      let operation = await fixture.repository.create(
        maker,
        {
          company_id: fixture.company,
          type: "settlement",
          side: "receivable",
          party_id: customer.id,
          date: "2026-11-10",
          reason: "Concurrent partial payment",
          reference: "",
          payment_currency: "USD",
          payment_amount: "75",
          bank_fee: "0",
          bank_account_id: fixture.banks.USD!,
          allocations: [{ item_id: item.id, amount: "75" }],
        },
        randomUUID(),
      );
      operation = await fixture.repository.action(
        maker,
        operation.id,
        {
          company_id: fixture.company,
          expected_version: operation.version,
          action: "submit",
          reason: "Submit concurrent test",
        },
        randomUUID(),
      );
      return fixture.repository.action(
        checker,
        operation.id,
        {
          company_id: fixture.company,
          expected_version: operation.version,
          action: "approve",
          reason: "Approve concurrent test",
        },
        randomUUID(),
      );
    };
    const first = await prepare(),
      second = await prepare();
    const results = await Promise.allSettled(
      [first, second].map((operation) =>
        fixture.repository.action(
          poster,
          operation.id,
          {
            company_id: fixture.company,
            expected_version: operation.version,
            action: "post",
            reason: "Post concurrent test",
          },
          randomUUID(),
        ),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await workspace("2026-11-10", customer.id)).items[0]).toMatchObject({
      outstanding: "25.00",
      carrying: "7200.00",
    });
  });
  it("reverses valuation through an exact compensating journal and preserves dated history", async () => {
    const customer = await party();
    const item = await post(recognize(customer.id, "EUR", "100", "2026-09-21"));
    await fixture.rate("EUR", "310", "2026-10-15");
    const valuation = await post({
      company_id: fixture.company,
      type: "revaluation",
      side: "receivable",
      party_id: customer.id,
      currency: "EUR",
      date: "2026-10-20",
      reference: "",
      reason: "Value isolated balance",
    });
    await post({
      company_id: fixture.company,
      type: "reversal",
      operation_id: valuation.id,
      date: "2026-10-21",
      reference: "",
      reason: "Reverse isolated valuation",
    });
    expect((await workspace("2026-10-20", customer.id)).items[0]?.carrying).toBe("31000.00");
    expect((await workspace("2026-10-21", customer.id)).items[0]).toMatchObject({
      id: item.id,
      carrying: "30000.00",
      unrealized: "0.00",
    });
    expect((await report("trial_balance", "2026-11-30")).reconciliation.every((row) => row.difference === "0.00")).toBe(
      true,
    );
  });
  it("excludes nonmonetary advances from FX and recognizes their historical basis on application", async () => {
    const customer = await party();
    const advance = await post({
      ...recognize(customer.id, "USD", "100", "2026-11-11", "receivable", "advance"),
      monetary: false,
      bank_account_id: fixture.banks.USD!,
      counter_account_id: fixture.policy.payable_account_id,
    });
    await expect(
      fixture.repository.create(
        maker,
        {
          company_id: fixture.company,
          type: "revaluation",
          side: "receivable",
          party_id: customer.id,
          currency: "USD",
          date: "2026-11-11",
          reference: "",
          reason: "Do not revalue nonmonetary advance",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "SUBLEDGER_VALIDATION_FAILED" });
    await fixture.rate("USD", "289", "2026-11-12");
    const invoice = await post(recognize(customer.id, "USD", "100", "2026-11-12"));
    const applied = await post({
      company_id: fixture.company,
      type: "offset",
      side: "receivable",
      party_id: customer.id,
      date: "2026-11-12",
      reason: "Recognize at prepaid historical basis",
      reference: "",
      allocations: [
        { item_id: advance.id, amount: "100" },
        { item_id: invoice.id, amount: "100" },
      ],
    });
    expect(applied.preview).toMatchObject({ realized_gain: "0.00", unrealized_gain: "0.00" });
    expect(applied.preview?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: fixture.policy.revenue_account_id, debit: "100.00" }),
      ]),
    );
    expect(
      (await workspace("2026-11-12", customer.id)).items.every(
        (item) => item.outstanding === "0.00" && item.carrying === "0.00",
      ),
    ).toBe(true);
  });
  it("blocks closed-period posting atomically and enforces bank overdraft limits", async () => {
    const customer = await party();
    let operation = await fixture.repository.create(
      maker,
      recognize(customer.id, "USD", "10", "2026-11-15"),
      randomUUID(),
    );
    operation = await fixture.repository.action(
      maker,
      operation.id,
      {
        company_id: fixture.company,
        action: "submit",
        expected_version: operation.version,
        reason: "Submit closing test",
      },
      randomUUID(),
    );
    operation = await fixture.repository.action(
      checker,
      operation.id,
      {
        company_id: fixture.company,
        action: "approve",
        expected_version: operation.version,
        reason: "Approve closing test",
      },
      randomUUID(),
    );
    await fixture.pool.query(
      "update financial_period set status='closed' where tenant_id=$1 and company_id=$2 and period_number=11",
      [fixture.tenant, fixture.company],
    );
    await expect(
      fixture.repository.action(
        poster,
        operation.id,
        {
          company_id: fixture.company,
          action: "post",
          expected_version: operation.version,
          reason: "Try closed period",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "FINANCE_PERIOD_CLOSED_POST_BLOCKED" });
    expect(
      (
        await fixture.pool.query(
          "select count(*)::integer as count from finance_subledger_item_event where tenant_id=$1 and company_id=$2 and operation_id=$3",
          [fixture.tenant, fixture.company, operation.id],
        )
      ).rows[0].count,
    ).toBe(0);
    await fixture.pool.query(
      "update financial_period set status='open' where tenant_id=$1 and company_id=$2 and period_number=11",
      [fixture.tenant, fixture.company],
    );
    const supplier = await party("supplier");
    const bill = await post(recognize(supplier.id, "USD", "200000000", "2026-11-16", "payable"));
    await expect(
      fixture.repository.create(
        maker,
        {
          company_id: fixture.company,
          type: "settlement",
          side: "payable",
          party_id: supplier.id,
          date: "2026-11-16",
          reason: "Reject unavailable bank funds",
          reference: "",
          payment_currency: "USD",
          payment_amount: "200000000",
          bank_fee: "0",
          bank_account_id: fixture.banks.USD!,
          allocations: [{ item_id: bill.id, amount: "200000000" }],
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "BANK_INSUFFICIENT_FUNDS" });
  });
  it("separates invoice tax, bank-deal FX and conversion rounding", async () => {
    const customer = await party();
    const taxAccount = `tax-${randomUUID()}`;
    await fixture.pool.query(
      "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,$1,'Output tax','liability',false,'active',clock_timestamp())",
      [taxAccount, fixture.tenant, fixture.company],
    );
    const taxed = await post({
      ...recognize(customer.id, "USD", "110", "2026-11-18"),
      tax_amount: "10",
      tax_account_id: taxAccount,
    });
    expect(taxed.preview?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: fixture.policy.revenue_account_id, credit: "100.00", currency: "USD" }),
        expect.objectContaining({ accountId: taxAccount, credit: "10.00", currency: "USD" }),
      ]),
    );
    const tiny = await post(recognize(customer.id, "USD", "0.01", "2026-11-19"));
    const rounded = await post({
      company_id: fixture.company,
      type: "settlement",
      side: "receivable",
      party_id: customer.id,
      date: "2026-11-19",
      reason: "Currency boundary rounding",
      reference: "",
      payment_currency: "EUR",
      payment_amount: "0.01",
      bank_fee: "0",
      bank_account_id: fixture.banks.EUR!,
      allocations: [{ item_id: tiny.id, amount: "0.01" }],
    });
    expect(rounded.preview).toMatchObject({ realized_gain: "0.00", rounding: "0.21" });
    const dealInvoice = await post(recognize(customer.id, "USD", "100", "2026-11-20"));
    const deal = await post({
      company_id: fixture.company,
      type: "settlement",
      side: "receivable",
      party_id: customer.id,
      date: "2026-11-20",
      reason: "Audited actual bank conversion",
      reference: "BANK-DEAL",
      payment_currency: "EUR",
      payment_amount: "90",
      conversion_rate: "0.9",
      conversion_reference: "Bank deal confirmation 001",
      bank_fee: "0",
      bank_account_id: fixture.banks.EUR!,
      allocations: [{ item_id: dealInvoice.id, amount: "100" }],
    });
    expect(deal.preview).toMatchObject({ realized_gain: "-1000.00", rounding: "0.00" });
    const reconciled = await report("trial_balance", "2026-11-30");
    expect(reconciled.reconciliation.every((row) => row.difference === "0.00")).toBe(true);
    expect(reconciled.debit).toBe(reconciled.credit);
  });
  it("reports running statements, exact ageing and full totals across result pages", async () => {
    const statement = await report("statement", "2026-10-31", {
      party_id: customerId,
      currency: "USD",
      from: "2026-10-01",
      limit: 1,
    });
    expect(statement.rows).toHaveLength(1);
    expect(statement.total_rows).toBe(2);
    expect(statement.rows[0]?.balance).toBe("140000.00");
    expect(statement.balance).toBe("142500.00");
    const last = await report("statement", "2026-10-31", {
      party_id: customerId,
      currency: "USD",
      from: "2026-10-01",
      limit: 1,
      offset: 1,
    });
    expect(last.rows[0]?.balance).toBe("142500.00");
    expect(last.balance).toBe(statement.balance);
    const ledger = await report("general_ledger", "2026-10-31", { from: "2026-10-01", limit: 100 });
    const trial = await report("trial_balance", "2026-10-31", { limit: 100 });
    expect(ledger.rows.filter((row) => row.code === "receivable").at(-1)?.balance).toBe(
      trial.rows.find((row) => row.code === "receivable")?.balance,
    );
    await expect(report("trial_balance", "2026-10-31", { party_id: customerId })).rejects.toMatchObject({
      code: "REPORT_SCOPE_INVALID",
    });
    const ageing = await workspace("2026-11-30", customerId);
    expect(ageing.balances.find((row) => row.currency === "EUR")).toMatchObject({
      outstanding: "500.00",
      days_61_90: "500.00",
    });
    const denied = subledgerActor("r06.restricted");
    await expect(
      fixture.repository.workspace(
        denied,
        subledgerQuerySchema.parse({ company_id: fixture.company, as_of: "2026-11-30" }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("allocates one receipt across historical rates and permits reversal after exact downstream cancellation", async () => {
    const customer = await party();
    const first = await post(recognize(customer.id, "USD", "100", "2026-11-23"));
    await fixture.rate("USD", "290", "2026-11-24");
    const second = await post(recognize(customer.id, "USD", "100", "2026-11-24"));
    const settlement = await post({
      company_id: fixture.company,
      type: "settlement",
      side: "receivable",
      party_id: customer.id,
      date: "2026-11-26",
      reason: "Batch historical invoice rates",
      reference: "",
      payment_currency: "USD",
      payment_amount: "200",
      bank_fee: "0",
      bank_account_id: fixture.banks.USD!,
      allocations: [
        { item_id: first.id, amount: "100" },
        { item_id: second.id, amount: "100" },
      ],
    });
    expect(settlement.preview?.realized_gain).toBe("100.00");
    await expect(
      fixture.repository.create(
        maker,
        {
          company_id: fixture.company,
          type: "reversal",
          operation_id: first.id,
          date: "2026-11-27",
          reference: "",
          reason: "Must undo settlement first",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "SUBLEDGER_VALIDATION_FAILED" });
    await post({
      company_id: fixture.company,
      type: "reversal",
      operation_id: settlement.id,
      date: "2026-11-27",
      reference: "",
      reason: "Undo entire batch settlement",
    });
    await post({
      company_id: fixture.company,
      type: "reversal",
      operation_id: first.id,
      date: "2026-11-28",
      reference: "",
      reason: "Cancel original after receipt reversal",
    });
    const data = await workspace("2026-11-30", customer.id);
    expect(data.items.find((item) => item.id === first.id)?.carrying).toBe("0.00");
    expect(data.items.find((item) => item.id === second.id)?.carrying).toBe("29000.00");
    expect((await report("fx", "2026-11-30", { party_id: customer.id })).balance).toBe("0.00");
  });
  it("attributes bulk valuation FX to each party and keeps reversed historical cutoffs locked", async () => {
    const first = await party(),
      second = await party();
    await post(recognize(first.id, "JPY", "10", "2026-11-24"));
    await post(recognize(second.id, "JPY", "20", "2026-11-24"));
    await fixture.rate("JPY", "3", "2026-11-25");
    const valuation = await post({
      company_id: fixture.company,
      type: "revaluation",
      side: "receivable",
      currency: "JPY",
      date: "2026-11-25",
      reference: "",
      reason: "Company wide JPY valuation",
    });
    expect((await report("fx", "2026-11-25", { party_id: first.id })).balance).toBe("10.00");
    expect((await report("fx", "2026-11-25", { party_id: second.id })).balance).toBe("20.00");
    await post({
      company_id: fixture.company,
      type: "reversal",
      operation_id: valuation.id,
      date: "2026-11-26",
      reference: "",
      reason: "Reverse bulk valuation",
    });
    expect((await report("fx", "2026-11-26", { party_id: first.id })).balance).toBe("0.00");
    await expect(
      fixture.repository.create(maker, recognize(first.id, "JPY", "1", "2026-11-24"), randomUUID()),
    ).rejects.toMatchObject({ code: "VALUATION_CUTOFF_LOCKED" });
    expect((await report("trial_balance")).reconciliation.every((row) => row.difference === "0.00")).toBe(true);
  });
  it("realizes the full historical gain after valuation and clears three-decimal final residues", async () => {
    const isolated = await setupSubledgerFixture(fixture.pool);
    await isolated.rate("USD", "285", "2026-10-01");
    await isolated.rate("USD", "287", "2026-11-01");
    const customer = await isolated.repository.createParty(
      maker,
      { company_id: isolated.company, kind: "customer", name: "Full valuation and precision", default_currency: "USD" },
      randomUUID(),
    );
    const record = async (input: SubledgerInput) =>
      post({ ...input, company_id: isolated.company }, isolated.repository);
    const invoice = await record(recognize(customer.id, "USD", "1000", "2026-09-20"));
    const valuation = await record({
      company_id: isolated.company,
      type: "revaluation",
      side: "receivable",
      party_id: customer.id,
      currency: "USD",
      date: "2026-10-31",
      reference: "",
      reason: "Full open balance closing rate",
    });
    expect(valuation.preview?.unrealized_gain).toBe("5000.00");
    const receipt = await record({
      company_id: isolated.company,
      type: "settlement",
      side: "receivable",
      party_id: customer.id,
      date: "2026-11-02",
      reference: "",
      reason: "Full receipt after valuation",
      payment_currency: "USD",
      payment_amount: "1000",
      bank_fee: "0",
      bank_account_id: isolated.banks.USD!,
      allocations: [{ item_id: invoice.id, amount: "1000" }],
    });
    expect(receipt.preview).toMatchObject({ realized_gain: "7000.00", unrealized_gain: "-5000.00" });
    const kwd = await record(recognize(customer.id, "KWD", "1.234", "2026-09-20"));
    for (const [date, amount] of [
      ["2026-11-03", "0.333"],
      ["2026-11-04", "0.901"],
    ] as const)
      await record({
        company_id: isolated.company,
        type: "settlement",
        side: "receivable",
        party_id: customer.id,
        date,
        reference: "",
        reason: "Three decimal partial allocation",
        payment_currency: "KWD",
        payment_amount: amount,
        bank_fee: "0",
        bank_account_id: isolated.banks.KWD!,
        allocations: [{ item_id: kwd.id, amount }],
      });
    const data = await isolated.repository.workspace(
      maker,
      subledgerQuerySchema.parse({ company_id: isolated.company, as_of: "2026-11-30" }),
    );
    expect(data.items.every((item) => /^0(?:\.0+)?$/.test(item.outstanding) && item.carrying === "0.00")).toBe(true);
    const fx = await new SubledgerReports(isolated.repository).run(
      maker,
      subledgerReportQuerySchema.parse({ company_id: isolated.company, as_of: "2026-11-30", report: "fx" }),
    );
    expect(fx.balance).toBe("7000.00");
    const deposit = await record({
      ...recognize(customer.id, "USD", "100000000", "2026-11-05", "receivable", "advance"),
      bank_account_id: isolated.banks.USD!,
    });
    const supplier = await isolated.repository.createParty(
      maker,
      { company_id: isolated.company, kind: "supplier", name: "Bank reversal funds", default_currency: "USD" },
      randomUUID(),
    );
    const bill = await record(recognize(supplier.id, "USD", "200000000", "2026-11-05", "payable"));
    await record({
      company_id: isolated.company,
      type: "settlement",
      side: "payable",
      party_id: supplier.id,
      date: "2026-11-05",
      reference: "",
      reason: "Use authorized bank funds",
      payment_currency: "USD",
      payment_amount: "200000000",
      bank_fee: "0",
      bank_account_id: isolated.banks.USD!,
      allocations: [{ item_id: bill.id, amount: "200000000" }],
    });
    await expect(
      isolated.repository.create(
        maker,
        {
          company_id: isolated.company,
          type: "reversal",
          operation_id: deposit.id,
          date: "2026-11-06",
          reference: "",
          reason: "Prevent overdraft through reversal",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "BANK_INSUFFICIENT_FUNDS" });
  });
  it("forces company RLS and rejects forged or modified financial evidence", async () => {
    const tables = ["party", "policy", "sequence", "operation", "item", "item_event", "audit", "idempotency"].map(
      (name) => `finance_subledger_${name}`,
    );
    const flags = await fixture.pool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "select relrowsecurity,relforcerowsecurity from pg_class where relname=any($1::text[])",
      [tables],
    );
    expect(flags.rows).toHaveLength(8);
    expect(flags.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const draft = await fixture.repository.create(maker, recognize(customerId, "USD", "1", "2026-11-29"), randomUUID());
    await expect(
      fixture.pool.query(
        `insert into finance_subledger_item_event(tenant_id,company_id,id,item_id,operation_id,event_date,foreign_delta,base_delta,historical_delta,unrealized_delta,journal_id)
      select tenant_id,company_id,$1,item_id,$2,'2026-11-29',0,0,0,0,journal_id from finance_subledger_item_event where tenant_id=$3 and company_id=$4 limit 1`,
        [randomUUID(), draft.id, fixture.tenant, fixture.company],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      fixture.pool.query("delete from finance_subledger_audit where tenant_id=$1 and company_id=$2", [
        fixture.tenant,
        fixture.company,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      fixture.pool.query(
        "update finance_subledger_operation set version=version+1 where tenant_id=$1 and company_id=$2 and state='posted'",
        [fixture.tenant, fixture.company],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("rechecks the approver's live company permission at posting time", async () => {
    const customer = await party();
    let operation = await fixture.repository.create(
      maker,
      recognize(customer.id, "USD", "1", "2026-11-29"),
      randomUUID(),
    );
    for (const [actor, action] of [
      [maker, "submit"],
      [checker, "approve"],
    ] as const)
      operation = await fixture.repository.action(
        actor,
        operation.id,
        {
          company_id: fixture.company,
          expected_version: operation.version,
          action,
          reason: "Live approval authority test",
        },
        randomUUID(),
      );
    await fixture.pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-checker' and permission_key='finance.subledger.approve' and scope_kind='company' and scope_value=$2",
      [fixture.tenant, fixture.company],
    );
    try {
      await expect(
        fixture.repository.action(
          poster,
          operation.id,
          {
            company_id: fixture.company,
            expected_version: operation.version,
            action: "post",
            reason: "Reject revoked approver authority",
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        (
          await fixture.pool.query(
            "select count(*)::integer as count from finance_subledger_item_event where tenant_id=$1 and company_id=$2 and operation_id=$3",
            [fixture.tenant, fixture.company, operation.id],
          )
        ).rows[0].count,
      ).toBe(0);
    } finally {
      await fixture.pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-checker','finance.subledger.approve','company',$2)",
        [fixture.tenant, fixture.company],
      );
    }
  });
  it("recognizes an approved supplier bill once with exact source tax and company linkage", async () => {
    const permissions = [
      "procurement.document.read",
      "procurement.document.create",
      "procurement.document.action",
      "procurement.document.submit",
      "procurement.document.approve",
      "procurement.vendor.read",
      "procurement.vendor.create",
    ];
    for (const role of ["r06-uat-policy-maker", "r06-uat-policy-checker"]) {
      await fixture.pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,$2,p,'all' from unnest($3::text[]) p on conflict do nothing",
        [fixture.tenant, role, permissions],
      );
      await fixture.pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,$2,p,'company',$4 from unnest($3::text[]) p on conflict do nothing",
        [fixture.tenant, role, permissions, fixture.company],
      );
    }
    const procurement = new SourceProcurementRepository(
      fixture.pool,
      new SupplierProfileCrypto(randomBytes(32).toString("base64"), "test-v1"),
    );
    const prep = { ...maker, actor: { ...maker.actor, permissions: [...maker.actor.permissions, ...permissions] } };
    const review = {
      ...checker,
      actor: { ...checker.actor, permissions: [...checker.actor.permissions, ...permissions] },
    };
    const vendor = (
      await procurement.saveSupplier(
        prep,
        null,
        supplierInputSchema.parse({ company_id: fixture.company, name: "Approved source vendor" }),
        randomUUID(),
        randomUUID(),
      )
    ).record;
    let source: PurchaseDocument | undefined;
    let order: PurchaseDocument | undefined;
    const names: PurchaseKind[] = ["request", "rfq", "order", "receipt", "bill"];
    for (const kind of names) {
      let document = (
        await procurement.save(
          prep,
          null,
          savePurchaseRequestSchema.parse({
            company_id: fixture.company,
            kind,
            supplier_id: kind === "request" || kind === "rfq" ? null : vendor.id,
            source_id: (kind === "bill" ? order : source)?.id ?? null,
            invited_supplier_ids: kind === "rfq" ? [vendor.id] : [],
            approver_id: "r06.checker",
            document_date: "2026-11-29",
            currency: "USD",
            reference: `SOURCE-${kind}`,
            lines: [
              {
                source_line_id: (kind === "bill" ? order : source)?.lines[0]?.id ?? null,
                item_code: "SOURCE-001",
                description: "Source tax rounding",
                quantity: "1.005",
                uom: "Each",
                unit_price: "1.00",
                tax_percent: "10",
              },
            ],
          }),
          randomUUID(),
          randomUUID(),
        )
      ).record;
      for (const [actor, action] of [
        [prep, "submit"],
        [review, "approve"],
      ] as const)
        document = (
          await procurement.action(
            actor,
            document.id,
            {
              company_id: fixture.company,
              expected_version: document.version,
              action,
              reason: "Approved source accounting test",
            },
            randomUUID(),
            randomUUID(),
          )
        ).record;
      source = document;
      if (kind === "order") order = document;
    }
    if (!source) throw Error("Source bill missing");
    expect(source.total_amount).toBe("1.11");
    const vendorAccount = await fixture.repository.createParty(
      maker,
      {
        company_id: fixture.company,
        kind: "supplier",
        name: vendor.name,
        default_currency: "USD",
        source_supplier_id: vendor.id,
      },
      randomUUID(),
    );
    const taxAccount = `source-tax-${randomUUID()}`;
    await fixture.pool.query(
      "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,$1,'Input tax','asset',false,'active',clock_timestamp())",
      [taxAccount, fixture.tenant, fixture.company],
    );
    const input = {
      ...recognize(vendorAccount.id, "USD", "1.11", "2026-11-29", "payable"),
      source_document_id: source.id,
      tax_amount: "0.10",
      tax_account_id: taxAccount,
    };
    await expect(
      fixture.repository.create(maker, { ...input, tax_amount: "0.11" }, randomUUID()),
    ).rejects.toMatchObject({ code: "SUBLEDGER_VALIDATION_FAILED" });
    const operation = await post(input);
    expect(operation.preview?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: fixture.policy.expense_account_id, debit: "1.01" }),
        expect.objectContaining({ accountId: taxAccount, debit: "0.10" }),
      ]),
    );
    await expect(post(input)).rejects.toMatchObject({ code: "SUBLEDGER_CONFLICT" });
    expect((await workspace("2026-11-30", vendorAccount.id)).total_items).toBe(1);
  });
  it("uses company functional currency and produces balanced translated financial statements", async () => {
    const second = await setupSubledgerFixture(fixture.pool, `mc-usd-${randomUUID()}`, "USD");
    const customer = await second.repository.createParty(
      maker,
      {
        company_id: second.company,
        name: "USD functional company customer",
        kind: "customer",
        default_currency: "EUR",
      },
      randomUUID(),
    );
    let op = await second.repository.create(
      maker,
      { ...recognize(customer.id, "EUR", "100", "2026-09-20"), company_id: second.company },
      randomUUID(),
    );
    for (const [actor, action] of [
      [maker, "submit"],
      [checker, "approve"],
      [poster, "post"],
    ] as const)
      op = await second.repository.action(
        actor,
        op.id,
        { company_id: second.company, expected_version: op.version, action, reason: "Non PKR company test" },
        randomUUID(),
      );
    const data = await second.repository.workspace(
      maker,
      subledgerQuerySchema.parse({ company_id: second.company, as_of: "2026-09-30" }),
    );
    expect(data.base_currency).toBe("USD");
    expect(data.items[0]?.carrying).toBe("110.00");
    const translated = await new SubledgerReports(second.repository).run(
      maker,
      subledgerReportQuerySchema.parse({
        company_id: second.company,
        as_of: "2026-09-30",
        report: "balance_sheet",
        presentation_currency: "EUR",
      }),
    );
    expect(translated.presentation_balance).toBe("0.00");
    expect(translated.translation_method).toMatch(/translation reserve/);
    expect((await workspace()).items.some((row) => row.party_id === customer.id)).toBe(false);
  });
});
