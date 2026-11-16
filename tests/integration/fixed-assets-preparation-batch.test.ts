import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { assetCreateSchema, type FixedAsset } from "../../packages/contracts/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/index.js";
import { AssetDraftPreparation } from "../../server/api/src/modules/fixed-assets/preparation.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupAssetFixture } from "./fixed-assets-fixture.js";

const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("Bounded asset draft preparation for a large register", () => {
  let f: Awaited<ReturnType<typeof setupAssetFixture>>, close: () => Promise<void>;
  beforeAll(async () => {
    const db = await createDisposableSourceDatabase(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
    close = db.close;
    f = await setupAssetFixture(db.pool);
  }, 60000);
  afterAll(async () => {
    await close?.();
  });
  it("prepares 400 then the remaining asset, never silently truncates, never posts, and safely replays migrations", async () => {
    expect(await migrateSourceSchema(f.pool)).toEqual([]);
    const source = await f.bankAcquisition(),
      assets: FixedAsset[] = [];
    for (const size of [100, 100, 100, 100, 1]) {
      const result = await f.service.repository.create(
        f.maker,
        assetCreateSchema.parse({
          company_id: f.company,
          category_id: f.category.id,
          source_line_id: source.line,
          supplier_id: f.vendor.id,
          reason: "Large register bounded preparation acceptance",
          units: Array.from({ length: size }, () => ({
            details: { name: "Batch acceptance asset", condition: "new", serial_number: randomUUID() },
            cost: "100",
            residual_value: "0",
            useful_life_months: 48,
            method: "straight_line",
            annual_rate_percent: 25,
            in_service_date: "2026-09-01",
            depreciation_start: "2026-09-01",
            assignment: {},
          })),
        }),
        randomUUID(),
      );
      for (const asset of result.items) assets.push(await f.activate(asset));
    }
    expect(assets).toHaveLength(401);
    await f.service.repository.saveCompanyPolicy(
      f.maker,
      {
        company_id: f.company,
        expected_version: 0,
        method: "straight_line",
        useful_life_months: 48,
        annual_rate_percent: 25,
        residual_percent: 0,
        summary_frequency: "monthly",
        start_rule: "available_for_use",
        allow_start_override: true,
        allow_category_overrides: true,
        auto_prepare_monthly: true,
      },
      randomUUID(),
    );
    const before = (await f.pool.query("select count(*)::int as count from journal_entry")).rows[0].count,
      job = new AssetDraftPreparation(f.pool),
      now = new Date("2026-10-01T01:00:00Z");
    expect(await job.prepare(now)).toMatchObject({ drafts: 1, failed: 0 });
    expect(await job.prepare(now)).toMatchObject({ drafts: 1, failed: 0 });
    expect(await job.prepare(now)).toMatchObject({ drafts: 0, failed: 0 });
    const runs = await f.pool.query(
      "select state,jsonb_array_length(details) as units from fixed_asset_depreciation_run where tenant_id=$1 and company_id=$2 order by created_at",
      [f.tenant, f.company],
    );
    expect(runs.rows).toEqual([
      { state: "draft", units: 400 },
      { state: "draft", units: 1 },
    ]);
    expect((await f.pool.query("select count(*)::int as count from journal_entry")).rows[0].count).toBe(before);
    expect(
      (await f.pool.query("select sum(accumulated_depreciation)::text as amount from fixed_asset_record")).rows[0]
        .amount,
    ).toBe("0.00000000");
  }, 180000);
});
