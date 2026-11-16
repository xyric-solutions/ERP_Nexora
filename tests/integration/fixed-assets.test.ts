import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assetQuerySchema } from "../../packages/contracts/src/index.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupAssetFixture } from "./fixed-assets-fixture.js";
import { bankContextFixture } from "./bank-context-fixture.js";
import { assetCreateSchema, assetCategoryInputSchema } from "../../packages/contracts/src/index.js";

const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("PostgreSQL fixed assets and single-source accounting", () => {
  let f: Awaited<ReturnType<typeof setupAssetFixture>>, close: () => Promise<void>;
  beforeAll(async () => {
    const db = await createDisposableSourceDatabase(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
    close = db.close;
    f = await setupAssetFixture(db.pool);
  }, 60000);
  afterAll(async () => {
    await close?.();
  });
  const query = () => assetQuerySchema.parse({ company_id: f.company });
  it("atomically creates individual bill assets on AP posting and replays without duplicate capitalization", async () => {
    const purchase = await f.purchase("100000", "5", true, "5000", true);
    const origins = await f.pool.query(
      `select a.id,a.code,a.status,a.cost::text,a.source_line_id,o.unit_id
      from fixed_asset_purchase_origin o join fixed_asset_record a on a.tenant_id=o.tenant_id and a.company_id=o.company_id and a.id=o.asset_id
      where o.tenant_id=$1 and o.company_id=$2 and o.document_id=$3`,
      [f.tenant, f.company, purchase.source.id],
    );
    expect(origins.rows).toHaveLength(5);
    expect(new Set(origins.rows.map((row) => row.code)).size).toBe(5);
    expect(
      origins.rows.every(
        (row) => row.status === "draft" && row.cost === "100000.00000000" && row.source_line_id === purchase.line,
      ),
    ).toBe(true);
    const replay = await f.repository.action(
      f.poster,
      purchase.posted.id,
      {
        company_id: f.company,
        expected_version: purchase.posted.version - 1,
        action: "post",
        reason: "Governed source accounting test",
      },
      purchase.postingKey,
    );
    expect(replay.journal_id).toBe(purchase.posted.journal_id);
    expect(
      (
        await f.pool.query(
          "select count(*)::int as count from fixed_asset_purchase_origin where tenant_id=$1 and document_id=$2",
          [f.tenant, purchase.source.id],
        )
      ).rows[0].count,
    ).toBe(5);
    await expect(f.register(purchase.line, "1", undefined, "0")).rejects.toBeDefined();
    const journal = await f.pool.query(
      "select sum(base_debit)::text as debit,sum(base_credit)::text as credit from journal_line where tenant_id=$1 and journal_id=$2",
      [f.tenant, purchase.posted.journal_id],
    );
    expect(journal.rows[0].debit).toBe(journal.rows[0].credit);
    expect(journal.rows[0].debit).toBe("505000.00000000");
  });
  it("rolls back the acquisition journal and all units when automatic registration fails", async () => {
    const counts = async () =>
      (
        await f.pool.query(
          "select (select count(*)::int from journal_entry) as journals,(select count(*)::int from fixed_asset_record) as assets",
        )
      ).rows[0];
    const before = await counts();
    await expect(f.purchase("12000", "2", true, "0", true, `duplicate-${crypto.randomUUID()}`)).rejects.toMatchObject({
      code: "SUBLEDGER_CONFLICT",
    });
    expect(await counts()).toEqual(before);
  });
  it("registers the posted bank acquisition without another journal and survives reload", async () => {
    const acquisition = await f.bankAcquisition(),
      count = await f.pool.query(
        "select count(*)::int as count from journal_entry where tenant_id=$1 and company_id=$2",
        [f.tenant, f.company],
      );
    const asset = await f.register(acquisition.line),
      detail = await f.service.detail(f.maker, f.company, asset.id);
    expect(asset.code).toMatch(/^FA-\d{3,}$/);
    expect(asset.cost).toBe("250000.00000000");
    expect(detail.source.source_type).toBe("bank_payment");
    expect(detail.schedule.rows[0]?.amount).toBe("5000.00");
    expect(
      (
        await f.pool.query("select count(*)::int as count from journal_entry where tenant_id=$1 and company_id=$2", [
          f.tenant,
          f.company,
        ])
      ).rows[0].count,
    ).toBe(count.rows[0].count);
    await expect(f.register(acquisition.line)).rejects.toMatchObject({ code: "ASSET_CONFLICT" });
    expect(detail.history).toHaveLength(1);
  });
  it("requires independent approval, rejects stale edits and isolates company/tenant authority", async () => {
    const acquisition = await f.bankAcquisition(),
      asset = await f.register(acquisition.line);
    const submitted = await f.service.repository.action(
      f.maker,
      asset.id,
      { company_id: f.company, expected_version: asset.version, action: "submit", reason: "Submit for checking" },
      randomUUID(),
    );
    await expect(
      f.service.repository.action(
        f.maker,
        asset.id,
        {
          company_id: f.company,
          expected_version: submitted.version,
          action: "approve",
          reason: "Attempt self approval",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "ASSET_SELF_APPROVAL_DENIED" });
    await expect(
      f.service.repository.update(
        f.maker,
        asset.id,
        {
          company_id: f.company,
          expected_version: asset.version,
          details: asset.details,
          reason: "Attempt stale edit",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 412 });
    await expect(f.service.detail(f.maker, "outside-company", asset.id)).rejects.toMatchObject({
      code: "COMPANY_ACCESS_DENIED",
    });
    await expect(f.service.workspace({ ...f.maker, tenantId: "different-tenant" }, query())).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    await expect(
      f.service.workspace({ ...f.maker, actor: { ...f.maker.actor, permissions: [] } }, query()),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
  it("calculates, posts and reverses exact monthly depreciation without duplicate runs", async () => {
    const asset = await f.activate(await f.register((await f.bankAcquisition()).line));
    let run = await f.service.depreciation.create(
      f.maker,
      {
        company_id: f.company,
        period_id: `period-${f.company}-9`,
        asset_ids: [asset.id],
        reason: "Preview September depreciation",
      },
      randomUUID(),
    );
    expect(run.total).toBe("5000.00000000");
    expect(run.details[0]?.closing_carrying).toBe("245000.00");
    for (const [actor, action] of [
      [f.maker, "submit"],
      [f.checker, "approve"],
      [f.poster, "post"],
    ] as const)
      run = await f.service.depreciation.action(
        actor,
        run.id,
        { company_id: f.company, expected_version: run.version, action, reason: "Reviewed monthly depreciation" },
        randomUUID(),
      );
    expect(run.state).toBe("posted");
    expect((await f.service.detail(f.maker, f.company, asset.id)).asset.accumulated_depreciation).toBe("5000.00000000");
    await expect(
      f.service.depreciation.action(
        f.poster,
        run.id,
        { company_id: f.company, expected_version: run.version, action: "post", reason: "Try posting twice" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "ASSET_VALIDATION_FAILED" });
    const duplicate = await f.service.depreciation.create(
      f.maker,
      { company_id: f.company, period_id: run.period_id, asset_ids: [asset.id], reason: "Check duplicate prevention" },
      randomUUID(),
    );
    expect(duplicate.details[0]?.skip_reason).toMatch(/already/);
    const reversed = await f.service.depreciation.action(
      f.checker,
      run.id,
      {
        company_id: f.company,
        expected_version: run.version,
        action: "reverse",
        reversal_date: "2026-10-01",
        reason: "Governed depreciation correction",
      },
      randomUUID(),
    );
    expect(reversed.state).toBe("reversed");
    expect((await f.service.detail(f.maker, f.company, asset.id)).asset.accumulated_depreciation).toBe("0.00000000");
  });
  it("posts maintenance, verification and impairment while preserving acquisition history", async () => {
    let asset = await f.activate(await f.register((await f.bankAcquisition()).line));
    const maintenance = await f.postEvent(
      f.event(asset, "maintenance", {
        maintenance_type: "inspection",
        description: "Inspect keyboard",
        cost: "1000",
        treatment: "expense",
        next_date: "2026-11-10",
      }),
    );
    expect(maintenance.journal_id).toBeNull();
    asset = (await f.service.detail(f.maker, f.company, asset.id)).asset;
    await f.postEvent(f.event(asset, "verification", { actual_assignment: {}, condition: "good", result: "verified" }));
    asset = (await f.service.detail(f.maker, f.company, asset.id)).asset;
    const impairment = await f.postEvent(f.event(asset, "impairment", { recoverable_amount: "200000" }));
    expect(impairment.preview.amount).toBe("40000.00");
    expect(impairment.depreciation_run_ids).toHaveLength(2);
    const detail = await f.service.detail(f.maker, f.company, asset.id);
    expect(detail.asset.net_book_value).toBe("200000.00000000");
    expect(detail.asset.source_line_id).toBe(asset.source_line_id);
    expect(detail.history.length).toBeGreaterThan(4);
  });
  it("returns a paid direct acquisition through a separate receivable journal and prevents further depreciation", async () => {
    const asset = await f.activate(await f.register((await f.bankAcquisition()).line));
    const returned = await f.postEvent(
      f.event(asset, "return", {
        amount: "250000",
        credit_note_reference: "VENDOR-CREDIT-001",
        refund_receivable_account_id: f.accounts.refund,
        condition: "damaged",
      }),
    );
    expect(returned.journal_id).toBeTruthy();
    const detail = await f.service.detail(f.maker, f.company, asset.id);
    expect(detail.asset.status).toBe("returned");
    expect(detail.asset.net_book_value).toBe("0");
    expect(detail.schedule.rows).toHaveLength(2);
    expect(
      (
        await f.pool.query("select state from bank_payment where tenant_id=$1 and original_journal_entry_id=$2", [
          f.tenant,
          detail.source.journal_id,
        ])
      ).rows[0].state,
    ).toBe("posted");
    await expect(
      f.pool.query("delete from fixed_asset_record where tenant_id=$1 and company_id=$2 and id=$3", [
        f.tenant,
        f.company,
        asset.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("creates multiple individual units from a posted Purchase invoice without duplicating capitalization", async () => {
    const purchase = await f.purchase("250000", "2"),
      one = await f.register(purchase.line, "250000"),
      two = await f.register(purchase.line, "250000");
    expect(one.id).not.toBe(two.id);
    expect(one.code).not.toBe(two.code);
    expect((await f.service.detail(f.maker, f.company, one.id)).source.purchase_document_id).toBe(purchase.source.id);
    await expect(f.register(purchase.line, "1", randomUUID(), "0")).rejects.toMatchObject({ code: "ASSET_CONFLICT" });
  });
  it("classifies a mixed approved Purchase bill into existing asset and expense accounts exactly once", async () => {
    const purchase = await f.purchase("250000", "1", true, "10000");
    const balances = (
      await f.pool.query<{ account_id: string; debit: string }>(
        "select account_id,sum(base_debit)::text as debit from journal_line where tenant_id=$1 and journal_id=$2 group by account_id",
        [f.tenant, purchase.posted.journal_id],
      )
    ).rows;
    expect(balances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account_id: f.accounts.asset, debit: "250000.00000000" }),
        expect.objectContaining({ account_id: f.policy.expense_account_id, debit: "10000.00000000" }),
      ]),
    );
    expect((await f.register(purchase.line)).cost).toBe("250000.00000000");
    expect(purchase.source.total_amount).toBe("260000.00");
  });
  it("adds an independently posted improvement without duplicate GL and rebases the remaining life", async () => {
    let asset = await f.activate(await f.register((await f.bankAcquisition()).line));
    await f.postDepreciation(asset);
    asset = (await f.service.detail(f.maker, f.company, asset.id)).asset;
    const improvement = await f.bankAcquisition("47000", "2026-10-01");
    const event = await f.postEvent(
      f.event(asset, "maintenance", {
        date: "2026-10-15",
        maintenance_type: "upgrade",
        description: "Approved capital improvement",
        cost: "47000",
        treatment: "capital_improvement",
        source_line_id: improvement.line,
      }),
    );
    expect(event.journal_id).toBe(improvement.posted.journal_id);
    expect(event.preview.depreciation).toHaveLength(0);
    const detail = await f.service.detail(f.maker, f.company, asset.id);
    expect(detail.asset.cost).toBe("297000.00000000");
    expect(detail.schedule.rows.find((row) => row.start === "2026-10-01")?.amount).toBe("6000.00");
    await expect(f.register(improvement.line, "1", randomUUID(), "0")).rejects.toMatchObject({ status: 409 });
  });
  it("returns only selected units of an unpaid invoice through the existing supplier credit note", async () => {
    const purchase = await f.purchase("250000", "2"),
      asset = await f.register(purchase.line),
      other = await f.register(purchase.line);
    const credit = await f.postSubledger({
      company_id: f.company,
      date: "2026-10-31",
      reference: "PARTIAL-ASSET-RETURN",
      original_item_id: purchase.posted.id,
      reason: "Original supplier return credit",
      type: "recognition",
      side: "payable",
      kind: "credit_note",
      party_id: f.party.id,
      currency: "PKR",
      amount: "250000",
      due_date: "2026-10-31",
      monetary: true,
      counter_account_id: f.accounts.asset!,
    });
    const returned = await f.postEvent(
      f.event(asset, "return", {
        amount: "250000",
        credit_note_reference: "PARTIAL-ASSET-RETURN",
        credit_note_item_id: credit.id,
        condition: "damaged",
      }),
    );
    expect(returned.preview.lines).toHaveLength(0);
    expect(returned.journal_id).toBe(credit.journal_id);
    expect((await f.service.detail(f.maker, f.company, other.id)).asset.status).toBe("draft");
    const dashboard = await f.service.reports.dashboard(f.maker, query(), true);
    expect(dashboard.reconciliation.every((row) => Number(row.difference) === 0)).toBe(true);
  });
  it("records an actual bank refund once and reconciles the separate return receivable", async () => {
    let asset = await f.activate(await f.register((await f.bankAcquisition()).line));
    const returned = await f.postEvent(
      f.event(asset, "return", {
        amount: "250000",
        credit_note_reference: "REFUND-CREDIT",
        refund_receivable_account_id: f.accounts.refund,
        condition: "damaged",
      }),
    );
    asset = (await f.service.detail(f.maker, f.company, asset.id)).asset;
    const receipt = await f.bankRefund(),
      count = (
        await f.pool.query("select count(*)::int as count from journal_entry where tenant_id=$1 and company_id=$2", [
          f.tenant,
          f.company,
        ])
      ).rows[0].count;
    const input = f.event(asset, "refund", {
        return_event_id: returned.id,
        receipt_line_id: receipt.line,
        amount: "250000",
        date: "2026-11-01",
      }),
      refunded = await f.postEvent(input);
    expect(refunded.journal_id).toBe(receipt.posted.journal_id);
    expect(
      (
        await f.pool.query("select count(*)::int as count from journal_entry where tenant_id=$1 and company_id=$2", [
          f.tenant,
          f.company,
        ])
      ).rows[0].count,
    ).toBe(count);
    const after = (await f.service.detail(f.maker, f.company, asset.id)).asset;
    await expect(
      f.service.lifecycle.create(
        f.maker,
        f.event(after, "refund", {
          return_event_id: returned.id,
          receipt_line_id: receipt.line,
          amount: "1",
          date: "2026-11-01",
        }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "ASSET_VALIDATION_FAILED" });
    const balance = (
      await f.pool.query(
        "select sum(base_debit-base_credit)::text as balance from journal_line where tenant_id=$1 and account_id=$2",
        [f.tenant, f.accounts.refund],
      )
    ).rows[0].balance;
    // The earlier direct return remains outstanding; this return and receipt net to zero.
    expect(balance).toBe("250000.00000000");
  });
  it("preserves effective assignment history and acquisition journals after a transfer", async () => {
    const refs = await bankContextFixture(f.pool, f.maker, f.company),
      asset = await f.activate(await f.register((await f.bankAcquisition()).line));
    const before = (
      await f.pool.query("select count(*)::int as count from journal_entry where tenant_id=$1 and company_id=$2", [
        f.tenant,
        f.company,
      ])
    ).rows[0].count;
    const transfer = await f.postEvent(
      f.event(asset, "transfer", {
        assignment: { ...asset.assignment, project_id: refs.project.id, location_id: refs.location.id },
      }),
    );
    expect(transfer.journal_id).toBeNull();
    const detail = await f.service.detail(f.maker, f.company, asset.id);
    expect(detail.asset.assignment.location_id).toBe(refs.location.id);
    expect(detail.history.find((event) => event.action === "transfer")?.before).toMatchObject({
      assignment: { location_id: null },
    });
    expect(
      (
        await f.pool.query("select count(*)::int as count from journal_entry where tenant_id=$1 and company_id=$2", [
          f.tenant,
          f.company,
        ])
      ).rows[0].count,
    ).toBe(before);
    await f.postDepreciation(detail.asset);
    const lines = await f.pool.query<{ dimensions: Record<string, string> }>(
      "select l.dimensions from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id join accounting_event e on e.tenant_id=j.tenant_id and e.id=j.source_id where j.tenant_id=$1 and j.company_id=$2 and e.source_type=$3 and l.dimensions->>'location'=$4",
      [f.tenant, f.company, "assets.depreciation", refs.location.id],
    );
    expect(lines.rows).toHaveLength(0);
  });
  it("derecognizes a depreciated asset on disposal and calculates the loss on the server", async () => {
    const asset = await f.activate(await f.register((await f.bankAcquisition()).line));
    await f.postDepreciation(asset);
    const current = (await f.service.detail(f.maker, f.company, asset.id)).asset;
    const disposal = await f.postEvent(
      f.event(current, "disposal", {
        kind: "sale",
        proceeds: "200000",
        proceeds_account_id: f.accounts.refund,
        counterparty: "Controlled buyer",
      }),
    );
    expect(disposal.preview).toMatchObject({ carrying: "240000.00", gain: "-40000.00" });
    expect(disposal.preview.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account_id: f.accounts.accumulated, debit: "10000.00" }),
        expect.objectContaining({ account_id: f.accounts.loss, debit: "40000.00" }),
        expect.objectContaining({ account_id: f.accounts.asset, credit: "250000.00" }),
      ]),
    );
    expect((await f.service.detail(f.maker, f.company, asset.id)).asset.status).toBe("disposed");
  });
  it("returns a depreciated bank acquisition with its accumulated depreciation preserved and cleared in GL", async () => {
    const asset = await f.activate(await f.register((await f.bankAcquisition()).line));
    await f.postDepreciation(asset);
    const current = (await f.service.detail(f.maker, f.company, asset.id)).asset;
    const returned = await f.postEvent(
      f.event(current, "return", {
        amount: "250000",
        credit_note_reference: "DEPRECIATED-RETURN",
        refund_receivable_account_id: f.accounts.refund,
        condition: "damaged",
      }),
    );
    expect(returned.preview.gain).toBe("10000.00");
    expect(returned.preview.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account_id: f.accounts.accumulated, debit: "10000.00" }),
        expect.objectContaining({ account_id: f.accounts.gain, credit: "10000.00" }),
      ]),
    );
    const detail = await f.service.detail(f.maker, f.company, asset.id);
    expect(detail.asset.accumulated_depreciation).toBe("10000.00000000");
    expect(detail.schedule.rows).toHaveLength(2);
  });
  it("serializes concurrent registrations and preserves a deterministic idempotent result", async () => {
    const source = await f.bankAcquisition(),
      results = await Promise.allSettled([f.register(source.line), f.register(source.line)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const second = await f.bankAcquisition(),
      input = assetCreateSchema.parse({
        company_id: f.company,
        category_id: f.category.id,
        source_line_id: second.line,
        supplier_id: f.vendor.id,
        reason: "Idempotent registration retry",
        units: [
          {
            details: { name: "Idempotent asset", condition: "new" },
            cost: "250000",
            residual_value: "10000",
            useful_life_months: 48,
            method: "straight_line",
            annual_rate_percent: 25,
            in_service_date: "2026-09-01",
            depreciation_start: "2026-09-01",
            assignment: {},
          },
        ],
      }),
      key = randomUUID();
    const first = await f.service.repository.create(f.maker, input, key);
    expect(await f.service.repository.create(f.maker, input, key)).toEqual(first);
    await expect(
      f.service.repository.create(f.maker, { ...input, reason: "Different request payload" }, key),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("returns a faulty unit before activation without depreciation or a second acquisition journal", async () => {
    const asset = await f.register((await f.bankAcquisition()).line);
    const returned = await f.postEvent(
      f.event(asset, "return", {
        date: "2026-09-03",
        amount: "250000",
        credit_note_reference: "EARLY-FAULTY",
        refund_receivable_account_id: f.accounts.refund,
        condition: "damaged",
      }),
    );
    expect(returned.preview).toMatchObject({ carrying: "250000.00", gain: "0.00", depreciation: [] });
    const detail = await f.service.detail(f.maker, f.company, asset.id);
    expect(detail.asset.status).toBe("returned");
    expect(detail.asset.approved_by).toBeNull();
    expect(detail.schedule.rows).toHaveLength(0);
  });
  it("rejects a return credit above unit cost and an expected refund before the return", async () => {
    const asset = await f.register((await f.bankAcquisition()).line),
      input = {
        date: "2026-09-03",
        amount: "250000",
        credit_note_reference: "INVALID-TERMS",
        refund_receivable_account_id: f.accounts.refund,
        condition: "damaged",
      };
    await expect(
      f.service.lifecycle.create(f.maker, f.event(asset, "return", { ...input, amount: "250000.01" }), randomUUID()),
    ).rejects.toMatchObject({ code: "ASSET_VALIDATION_FAILED" });
    await expect(
      f.service.lifecycle.create(
        f.maker,
        f.event(asset, "return", { ...input, expected_refund_date: "2026-09-02" }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "ASSET_VALIDATION_FAILED" });
    await expect(
      f.service.lifecycle.create(
        f.maker,
        f.event(asset, "return", { ...input, credit_note_item_id: randomUUID() }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "ASSET_VALIDATION_FAILED" });
  });
  it("does not include full-month lifecycle depreciation before the configured commencement date", async () => {
    let asset = await f.register((await f.bankAcquisition()).line);
    asset = await f.service.repository.update(
      f.maker,
      asset.id,
      {
        company_id: f.company,
        expected_version: asset.version,
        details: asset.details,
        depreciation: {
          residual_value: "10000",
          useful_life_months: 48,
          method: "straight_line",
          annual_rate_percent: 25,
          in_service_date: "2026-09-01",
          depreciation_start: "2026-10-15",
        },
        reason: "Configure later permitted commencement",
      },
      randomUUID(),
    );
    asset = await f.activate(asset);
    const returned = await f.postEvent(
      f.event(asset, "return", {
        date: "2026-10-05",
        amount: "250000",
        credit_note_reference: "BEFORE-COMMENCEMENT",
        refund_receivable_account_id: f.accounts.refund,
        condition: "damaged",
      }),
    );
    expect(returned.preview.depreciation).toEqual([]);
    expect(returned.preview.accumulated_depreciation).toBe("0.00");
  });
  it("rolls back the entire lifecycle when catch-up depreciation falls in a closed period", async () => {
    const asset = await f.activate(await f.register((await f.bankAcquisition()).line));
    let event = await f.service.lifecycle.create(
      f.maker,
      f.event(asset, "impairment", { recoverable_amount: "200000" }),
      randomUUID(),
    );
    for (const [actor, action] of [
      [f.maker, "submit"],
      [f.checker, "approve"],
    ] as const)
      event = await f.service.lifecycle.action(
        actor,
        event.id,
        {
          company_id: f.company,
          expected_version: event.version,
          action,
          reason: "Approve event with catch-up depreciation",
        },
        randomUUID(),
      );
    const before = (
      await f.pool.query("select count(*)::int n from journal_entry where tenant_id=$1 and company_id=$2", [
        f.tenant,
        f.company,
      ])
    ).rows[0].n;
    await f.pool.query("update financial_period set status='closed' where tenant_id=$1 and company_id=$2 and id=$3", [
      f.tenant,
      f.company,
      "period-" + f.company + "-9",
    ]);
    try {
      await expect(
        f.service.lifecycle.action(
          f.poster,
          event.id,
          {
            company_id: f.company,
            expected_version: event.version,
            action: "post",
            reason: "Attempt closed period event",
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect((await f.service.detail(f.maker, f.company, asset.id)).asset.accumulated_depreciation).toBe("0.00000000");
      expect(
        (
          await f.pool.query("select count(*)::int n from journal_entry where tenant_id=$1 and company_id=$2", [
            f.tenant,
            f.company,
          ])
        ).rows[0].n,
      ).toBe(before);
    } finally {
      await f.pool.query("update financial_period set status='open' where tenant_id=$1 and company_id=$2 and id=$3", [
        f.tenant,
        f.company,
        "period-" + f.company + "-9",
      ]);
    }
  });
  it("permits draft corrections and freezes depreciation policy once submitted", async () => {
    let asset = await f.register((await f.bankAcquisition()).line);
    asset = await f.service.repository.update(
      f.maker,
      asset.id,
      {
        company_id: f.company,
        expected_version: asset.version,
        details: asset.details,
        depreciation: {
          residual_value: "10000",
          useful_life_months: 24,
          method: "straight_line",
          annual_rate_percent: 25,
          in_service_date: "2026-09-01",
          depreciation_start: "2026-09-01",
        },
        reason: "Correct unsubmitted useful life",
      },
      randomUUID(),
    );
    expect(asset.useful_life_months).toBe(24);
    asset = await f.activate(asset);
    await expect(
      f.service.repository.update(
        f.maker,
        asset.id,
        {
          company_id: f.company,
          expected_version: asset.version,
          details: asset.details,
          depreciation: {
            residual_value: "10000",
            useful_life_months: 48,
            method: "straight_line",
            annual_rate_percent: 25,
            in_service_date: "2026-09-01",
            depreciation_start: "2026-09-01",
          },
          reason: "Attempt activated policy rewrite",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "ASSET_VALIDATION_FAILED" });
  });
  it("blocks registered source reversals and unaudited balance mutations at the database boundary", async () => {
    const source = await f.bankAcquisition(),
      asset = await f.register(source.line);
    await expect(
      f.payments.reverse(
        f.poster,
        source.posted.id,
        { expected_version: source.posted.version, reason: "Attempt source acquisition reversal" },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const client = await f.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id',$2,true)", [
        f.tenant,
        f.maker.actor.userId,
      ]);
      await client.query(
        "update fixed_asset_record set cost=cost+1,version=version+1 where tenant_id=$1 and company_id=$2 and id=$3",
        [f.tenant, f.company, asset.id],
      );
      await expect(client.query("set constraints all immediate")).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
  it("validates category account mappings and reports bounded directory totals", async () => {
    const { id, code, version, ...category } = f.category;
    expect(id && code && version).toBeTruthy();
    await expect(
      f.service.repository.saveCategory(
        f.maker,
        null,
        assetCategoryInputSchema.parse({
          ...category,
          expected_version: 0,
          asset_account_id: f.policy.revenue_account_id,
          name: "Invalid category",
        }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "ASSET_VALIDATION_FAILED" });
    const list = await f.service.repository.list(
      f.maker,
      assetQuerySchema.parse({ company_id: f.company, search: "Laptop", limit: 1 }),
    );
    expect(list.items).toHaveLength(1);
    expect(list.next_offset).toBe(1);
    expect(list.total).toBeGreaterThan(1);
  });
  it("reports current verification exceptions and clears them after a subsequent verified inspection", async () => {
    let asset = await f.activate(await f.register((await f.bankAcquisition()).line));
    const exception = await f.postEvent(
      f.event(asset, "verification", {
        date: "2026-10-01",
        actual_assignment: {},
        condition: "damaged",
        result: "damaged",
      }),
    );
    const scope = assetQuerySchema.parse({
      company_id: f.company,
      search: asset.code,
      event_type: "verification",
      verification_exceptions: "true",
    });
    expect((await f.service.workspace(f.maker, scope)).events.map((e) => e.id)).toEqual([exception.id]);
    asset = (await f.service.detail(f.maker, f.company, asset.id)).asset;
    await f.postEvent(
      f.event(asset, "verification", {
        date: "2026-10-02",
        actual_assignment: {},
        condition: "good",
        result: "verified",
      }),
    );
    expect((await f.service.workspace(f.maker, scope)).events).toEqual([]);
  });
  it("tracks partial refunds to zero and protects linked Bank Receipts from independent reversal", async () => {
    let asset = await f.register((await f.bankAcquisition()).line);
    const returned = await f.postEvent(
      f.event(asset, "return", {
        date: "2026-09-03",
        amount: "250000",
        credit_note_reference: "PARTIAL-REFUNDS",
        refund_receivable_account_id: f.accounts.refund,
        condition: "damaged",
      }),
    );
    const scope = assetQuerySchema.parse({ company_id: f.company, search: asset.code });
    for (const [amount, outstanding] of [
      ["100000", "150000.00"],
      ["150000", "0.00"],
    ]) {
      asset = (await f.service.detail(f.maker, f.company, asset.id)).asset;
      const receipt = await f.bankRefund(amount);
      await f.postEvent(
        f.event(asset, "refund", {
          return_event_id: returned.id,
          receipt_line_id: receipt.line,
          amount,
          date: "2026-11-01",
        }),
      );
      const report = await f.service.reports.dashboard(f.maker, scope, true);
      expect(report.refund_outstanding).toBe(outstanding);
      if (outstanding === "0.00") expect(report.refunds).toEqual([]);
      else expect(report.refunds[0]?.outstanding).toBe(outstanding);
      await expect(
        f.receipts.reverse(
          f.poster,
          receipt.posted.id,
          { expected_version: receipt.posted.version, reason: "Attempt reversing linked asset refund" },
          randomUUID(),
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: "RECEIPT_REGISTERED_ASSET_REFUND" });
    }
  });
});
