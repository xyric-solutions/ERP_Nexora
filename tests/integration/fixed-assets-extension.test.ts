import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { assetCategoryInputSchema, assetCreateSchema, type AssetCategory } from "../../packages/contracts/src/index.js";
import { AssetDraftPreparation } from "../../server/api/src/modules/fixed-assets/preparation.js";
import { minor } from "../../server/api/src/modules/fixed-assets/calculations.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupAssetFixture } from "./fixed-assets-fixture.js";

const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("Integrated asset policies, purchase registration and draft preparation", () => {
  let f: Awaited<ReturnType<typeof setupAssetFixture>>, close: () => Promise<void>;
  beforeAll(async () => {
    const db = await createDisposableSourceDatabase(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
    close = db.close;
    f = await setupAssetFixture(db.pool);
  }, 60000);
  afterAll(async () => {
    await close?.();
  });
  async function category(name: string, patch: Partial<AssetCategory> = {}) {
    const terms = assetCategoryInputSchema.strip().parse({ ...f.category, expected_version: 0 });
    return f.service.repository.saveCategory(
      f.maker,
      null,
      assetCategoryInputSchema.parse({
        ...terms,
        name,
        calculation_basis: "actual_actual",
        useful_life_months: 96,
        annual_rate_percent: 15,
        ...patch,
        expected_version: 0,
      }),
      randomUUID(),
    );
  }
  async function actualAsset(cost = "250000") {
    const policy = await category(`Actual daily ${randomUUID()}`),
      source = await f.bankAcquisition();
    const registered = await f.service.repository.create(
      f.maker,
      assetCreateSchema.parse({
        company_id: f.company,
        category_id: policy.id,
        source_line_id: source.line,
        supplier_id: f.vendor.id,
        reason: "Actual daily acceptance scenario",
        units: [
          {
            details: { name: "Actual daily asset", condition: "new" },
            cost,
            residual_value: "0",
            method: policy.method,
            annual_rate_percent: policy.annual_rate_percent,
            useful_life_months: policy.useful_life_months,
            in_service_date: "2026-09-16",
            depreciation_start: "2026-09-16",
            assignment: {},
          },
        ],
      }),
      randomUUID(),
    );
    return f.activate(registered.items[0]!);
  }
  it("registers ten individual units from mixed categories and one acquisition posting", async () => {
    const printers = await category("Printers"),
      chairs = await category("Office chairs"),
      before = (await f.pool.query("select count(*)::int as count from journal_entry")).rows[0].count;
    const purchase = await f.purchase("100000", "5", true, "5000", true, undefined, {
      groups: [
        { category: f.category, amount: "100000", quantity: "5" },
        { category: printers, amount: "30000", quantity: "2" },
        { category: chairs, amount: "10000", quantity: "3" },
      ],
      approver: {
        ...f.checker,
        actor: {
          ...f.checker.actor,
          permissions: f.checker.actor.permissions.filter((permission) => permission !== "assets.asset.create"),
        },
      },
    });
    const origins = await f.pool.query(
      "select a.id,a.code,a.category_id,a.status from fixed_asset_purchase_origin o join fixed_asset_record a on a.tenant_id=o.tenant_id and a.company_id=o.company_id and a.id=o.asset_id where o.tenant_id=$1 and o.document_id=$2",
      [f.tenant, purchase.source.id],
    );
    expect(origins.rows).toHaveLength(10);
    expect(new Set(origins.rows.map((r) => r.code)).size).toBe(10);
    expect(origins.rows.filter((r) => r.category_id === printers.id)).toHaveLength(2);
    expect(origins.rows.every((r) => r.status === "draft")).toBe(true);
    expect((await f.pool.query("select count(*)::int as count from journal_entry")).rows[0].count).toBe(before + 1);
    const journals = await f.service.journals(f.maker, f.company, origins.rows[0].id, 0, 30);
    expect(journals.items).toHaveLength(1);
    expect(journals.items[0]!.debit).toBe("595000.00000000");
    expect(journals.items[0]!.debit).toBe(journals.items[0]!.credit);
  });
  it("rejects changed classifications and stale category snapshots atomically at AP posting", async () => {
    const counts = async () =>
        (
          await f.pool.query(
            "select (select count(*)::int from journal_entry) as journals,(select count(*)::int from fixed_asset_record) as assets",
          )
        ).rows[0],
      before = await counts();
    try {
      await expect(
        f.purchase("12000", "2", true, "0", true, undefined, {
          beforePost: async () => {
            await f.pool.query(
              "update fixed_asset_nominal_classification set active=false,version=version+1 where tenant_id=$1 and company_id=$2 and account_id=$3",
              [f.tenant, f.company, f.accounts.asset],
            );
          },
        }),
      ).rejects.toMatchObject({ code: "ASSET_CLASSIFICATION_CHANGED" });
      expect(await counts()).toEqual(before);
    } finally {
      await f.pool.query(
        "update fixed_asset_nominal_classification set active=true,version=version+1 where tenant_id=$1 and company_id=$2 and account_id=$3",
        [f.tenant, f.company, f.accounts.asset],
      );
    }
    const policy = await category("Stale policy scenario");
    await expect(
      f.purchase("12000", "1", true, "0", true, undefined, {
        groups: [{ category: policy, amount: "12000", quantity: "1" }],
        beforePost: async () => {
          const terms = assetCategoryInputSchema.strip().parse({ ...policy, expected_version: policy.version });
          await f.service.repository.saveCategory(
            f.maker,
            policy.id,
            assetCategoryInputSchema.parse({ ...terms, annual_rate_percent: 20 }),
            randomUUID(),
          );
        },
      }),
    ).rejects.toMatchObject({ code: "ASSET_POLICY_CHANGED" });
    expect(await counts()).toEqual(before);
  });
  it("persists a daily basis and reconciles every summary frequency to posted monthly depreciation", async () => {
    const asset = await actualAsset();
    expect(asset.accrual_basis?.start).toBe("2026-09-16");
    const totals = [];
    for (const frequency of ["daily", "monthly", "quarterly", "annual"] as const) {
      const data = await f.service.accrualSchedule(f.maker, asset.id, {
        company_id: f.company,
        from: "2026-09-16",
        to: "2026-09-30",
        frequency,
      });
      totals.push(data.rows.reduce((sum, row) => sum + minor(row.amount, 2), 0n));
    }
    expect(new Set(totals).size).toBe(1);
    const posted = await f.postDepreciation(asset, 9);
    expect(minor(posted.total, 2)).toBe(totals[0]);
    const valuation = await f.service.valuation(f.maker, f.company, asset.id, "2026-09-30");
    expect(minor(valuation.unposted_accrual, 2)).toBe(0n);
    expect(minor(valuation.posted_depreciation, 2)).toBe(totals[0]);
    const journals = await f.service.journals(f.maker, f.company, asset.id, 0, 30);
    expect(journals.items).toHaveLength(2);
    await expect(
      f.service.accrualSchedule(f.maker, asset.id, {
        company_id: f.company,
        from: "2026-09-01",
        to: "2026-09-30",
        frequency: "daily",
      }),
    ).rejects.toBeDefined();
  });
  it("forces tenant RLS on every new business table for a role without bypass privileges", async () => {
    const tables = [
        "fixed_asset_nominal_classification",
        "fixed_asset_company_policy",
        "fixed_asset_purchase_origin",
        "fixed_asset_preparation_result",
        "fixed_asset_staged_document",
        "fixed_asset_zero_accrual_observation",
      ],
      role = `asset_rls_${randomUUID().replaceAll("-", "")}`;
    const definitions = await f.pool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "select relrowsecurity,relforcerowsecurity from pg_class where oid=any($1::regclass[])",
      [tables],
    );
    expect(definitions.rows).toHaveLength(tables.length);
    expect(definitions.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const client = await f.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [f.tenant]);
      await client.query(`create role ${role} nologin nosuperuser nobypassrls`);
      await client.query(`grant usage on schema public to ${role}`);
      await client.query(`grant select,insert on ${tables.join(",")} to ${role}`);
      await client.query(`set local role ${role}`);
      expect((await client.query("select count(*)::int as count from fixed_asset_purchase_origin")).rows[0].count).toBe(
        10,
      );
      await client.query("select set_config('nexora.tenant_id','outside-tenant',true)");
      for (const table of tables)
        expect((await client.query(`select count(*)::int as count from ${table}`)).rows[0].count).toBe(0);
      await expect(
        client.query(
          "insert into fixed_asset_nominal_classification(tenant_id,company_id,account_id,updated_by) values($1,$2,'forged-account',$3)",
          [f.tenant, f.company, f.maker.actor.userId],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
  it("enforces company defaults and start rules for new assets while retaining registered snapshots", async () => {
    const input = {
      company_id: f.company,
      expected_version: 0,
      method: "straight_line" as const,
      useful_life_months: 96,
      annual_rate_percent: 15,
      residual_percent: 0,
      summary_frequency: "monthly" as const,
      start_rule: "next_month" as const,
      allow_start_override: false,
      allow_category_overrides: false,
      auto_prepare_monthly: false,
    };
    const first = await f.service.repository.saveCompanyPolicy(f.maker, input, randomUUID()),
      effective = (await f.service.repository.options(f.maker, f.company)).categories.find(
        (c) => c.id === f.category.id,
      )!;
    expect(effective).toMatchObject({
      inherit_company_policy: true,
      company_policy_version: 1,
      useful_life_months: 96,
      calculation_basis: "actual_actual",
      start_rule: "next_month",
      allow_policy_override: false,
    });
    const source = await f.bankAcquisition(),
      unit = {
        details: { name: "Company policy asset", condition: "new" },
        cost: "1000",
        residual_value: "0",
        useful_life_months: 96,
        method: "straight_line",
        annual_rate_percent: 15,
        in_service_date: "2026-09-01",
        depreciation_start: "2026-09-01",
        assignment: {},
      };
    const create = (terms: typeof unit) =>
      f.service.repository.create(
        f.maker,
        assetCreateSchema.parse({
          company_id: f.company,
          category_id: f.category.id,
          source_line_id: source.line,
          supplier_id: f.vendor.id,
          reason: "Check company policy enforcement",
          units: [terms],
        }),
        randomUUID(),
      );
    await expect(create(unit)).rejects.toMatchObject({ code: "ASSET_VALIDATION_FAILED" });
    const registered = (await create({ ...unit, depreciation_start: "2026-10-01" })).items[0]!;
    expect(registered.category.company_policy_version).toBe(first.version);
    await f.service.repository.saveCompanyPolicy(
      f.maker,
      {
        ...input,
        expected_version: first.version,
        allow_category_overrides: true,
        start_rule: "available_for_use",
        allow_start_override: true,
      },
      randomUUID(),
    );
    expect((await f.service.detail(f.maker, f.company, registered.id)).asset.category.company_policy_version).toBe(1);
  });
  it("prepares only drafts, coordinates duplicate ticks/manual runs, and blocks revoked or closed-period authority", async () => {
    const asset = await actualAsset(),
      policy = {
        company_id: f.company,
        expected_version: (await f.service.repository.options(f.maker, f.company)).company_policy?.version ?? 0,
        method: "straight_line" as const,
        useful_life_months: 96,
        annual_rate_percent: 15,
        residual_percent: 0,
        summary_frequency: "monthly" as const,
        start_rule: "available_for_use" as const,
        allow_start_override: false,
        allow_category_overrides: true,
        auto_prepare_monthly: true,
      };
    await f.service.repository.saveCompanyPolicy(f.maker, policy, randomUUID());
    const failures: unknown[] = [];
    const job = new AssetDraftPreparation(f.pool, (error) => failures.push(error)),
      now = new Date("2026-10-01T01:00:00Z"),
      count = async () =>
        (
          await f.pool.query(
            "select (select count(*)::int from fixed_asset_depreciation_run) as runs,(select count(*)::int from journal_entry) as journals",
          )
        ).rows[0];
    const before = await count(),
      first = await job.prepare(now);
    expect(failures).toEqual([]);
    expect(first.failed).toBe(0);
    expect(first.drafts).toBe(1);
    const after = await count();
    expect(after.journals).toBe(before.journals);
    expect(after.runs).toBe(before.runs + 1);
    await job.prepare(now);
    expect(await count()).toEqual(after);
    await expect(
      f.service.depreciation.create(
        f.maker,
        {
          company_id: f.company,
          period_id: `period-${f.company}-9`,
          asset_ids: [asset.id],
          reason: "Concurrent manual run must coordinate",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "ASSET_RUN_PENDING" });
    const tiny = await actualAsset("0.01"),
      beforeZero = await count();
    expect((await job.prepare(now)).drafts).toBe(0);
    expect(await count()).toEqual(beforeZero);
    expect(
      (
        await f.pool.query(
          "select period_end::text from fixed_asset_zero_accrual_observation where tenant_id=$1 and company_id=$2 and asset_id=$3",
          [f.tenant, f.company, tiny.id],
        )
      ).rows[0]?.period_end,
    ).toBe("2026-09-30");
    let prior = (await f.service.workspace(f.maker, { company_id: f.company })).runs.find((run) =>
      run.details.some((detail) => detail.asset_id === asset.id),
    )!;
    prior = await f.service.depreciation.action(
      f.maker,
      prior.id,
      {
        company_id: f.company,
        expected_version: prior.version,
        action: "submit",
        reason: "Submit scheduled preparation for checking",
      },
      randomUUID(),
    );
    await f.service.depreciation.action(
      f.checker,
      prior.id,
      {
        company_id: f.company,
        expected_version: prior.version,
        action: "reject",
        reason: "Review this unchanged preparation manually",
      },
      randomUUID(),
    );
    expect((await job.prepare(now)).failed).toBe(1);
    expect((await f.service.repository.options(f.maker, f.company)).preparation_result?.error_code).toBe(
      "ASSET_PREPARATION_REQUIRES_REVIEW",
    );
    expect(await count()).toEqual(beforeZero);
    await actualAsset();
    const beforeBlocked = await count();
    await f.pool.query("update financial_period set status='closed' where tenant_id=$1 and company_id=$2 and id=$3", [
      f.tenant,
      f.company,
      `period-${f.company}-9`,
    ]);
    expect((await job.prepare(now)).failed).toBe(1);
    expect((await f.service.repository.options(f.maker, f.company)).preparation_result?.error_code).toBe(
      "ASSET_PREPARATION_PERIOD_CLOSED",
    );
    expect(await count()).toEqual(beforeBlocked);
    await f.pool.query(
      "update security_user_company_access set revoked_at=clock_timestamp(),revoked_by='r06.last-admin-a',revocation_reason='Verify scheduled access revocation' where tenant_id=$1 and company_id=$2 and user_id=$3 and revoked_at is null",
      [f.tenant, f.company, f.maker.actor.userId],
    );
    expect((await job.prepare(now)).failed).toBe(1);
    expect(await count()).toEqual(beforeBlocked);
  });
});
