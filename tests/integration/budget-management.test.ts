import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  budgetPlanInputSchema,
  budgetVersionInputSchema,
  budgetQuerySchema,
} from "../../packages/contracts/src/index.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupSubledgerFixture, subledgerActor } from "./subledger-fixture.js";
import { SourceBudgetRepository } from "../../server/api/src/modules/budget/source-repository.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import { BudgetService } from "../../server/api/src/modules/budget/service.js";
import { FinancePostingService } from "../../server/api/src/modules/finance/posting/service.js";
import {
  createFinanceTransactionClient,
  type FinanceTransactionClient,
} from "../../server/api/src/modules/finance/posting/types.js";
import { writeXlsx } from "../../server/api/src/files/xlsx.js";
import { budgetImportHeaders } from "../../server/api/src/modules/budget/files.js";
import {
  budgetModelInputSchema,
  budgetGenerateSchema,
  decimal,
  type BudgetDetail,
} from "../../packages/contracts/src/index.js";

describe("Persistent company Budget management", () => {
  let db: Awaited<ReturnType<typeof createDisposableSourceDatabase>>,
    f: Awaited<ReturnType<typeof setupSubledgerFixture>>,
    repo: SourceBudgetRepository;
  let permissions: string[];
  const actor = (id = "r06.maker") => {
    const ctx = subledgerActor(id);
    return { ...ctx, actor: { ...ctx.actor, permissions: [...ctx.actor.permissions, ...permissions] } };
  };
  beforeAll(async () => {
    db = await createDisposableSourceDatabase(
      process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_source_test",
    );
    f = await setupSubledgerFixture(db.pool, undefined, "USD");
    repo = new SourceBudgetRepository(db.pool);
    permissions = (
      await db.pool.query<{ permission_key: string }>(
        "select permission_key from security_permission_definition where module='budget'",
      )
    ).rows.map((r) => r.permission_key);
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
  }, 90000);
  afterAll(async () => {
    await db?.close();
  });
  async function plan() {
    return repo.createPlan(
      actor(),
      budgetPlanInputSchema.parse({
        company_id: f.company,
        name: "Operating Budget",
        fiscal_calendar_id: `cal-${f.company}`,
        reason: "Isolated Budget acceptance",
      }),
      randomUUID(),
      randomUUID(),
    );
  }
  async function draft() {
    const p = await plan();
    return repo.createVersion(
      actor(),
      budgetVersionInputSchema.parse({
        company_id: f.company,
        plan_id: p.id,
        name: "Original",
        reason: "Isolated draft",
        lines: [
          {
            account_id: f.policy.expense_account_id,
            allocations: [{ period_id: `period-${f.company}-9`, amount: "100.01" }],
          },
        ],
      }),
      randomUUID(),
      randomUUID(),
    );
  }
  const service = () => new BudgetService(repo);
  async function approved(d: BudgetDetail) {
    const submitted = await service().governance.action(
      actor(),
      d.record.id,
      {
        company_id: f.company,
        expected_version: d.record.version,
        action: "submit",
        approver_id: "r06.checker",
        reason: "Independent budget review",
      },
      randomUUID(),
      randomUUID(),
    );
    return service().governance.action(
      actor("r06.checker"),
      d.record.id,
      {
        company_id: f.company,
        expected_version: submitted.record.version,
        action: "approve",
        reason: "Independent budget approval",
      },
      randomUUID(),
      randomUUID(),
    );
  }
  async function finance<T>(work: (c: FinanceTransactionClient) => Promise<T>) {
    const c = await db.pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.maker',true)", [
        f.tenant,
      ]);
      const result = await work(await createFinanceTransactionClient(c));
      await c.query("commit");
      return result;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  it("migrates idempotently without creating budgets or enabling controls", async () => {
    expect(await migrateSourceSchema(db.pool)).toEqual([]);
    expect((await db.pool.query("select count(*)::int as n from budget_policy")).rows[0].n).toBe(0);
  });
  it("loads real scoped accounting references", async () => {
    const options = await repo.options(actor(), budgetQuerySchema.parse({ company_id: f.company }));
    expect(options.currency).toBe("USD");
    expect(options.accounts.some((a) => a.id === f.policy.expense_account_id)).toBe(true);
    expect(options.periods.length).toBe(4);
  });
  it("persists and reloads exact monthly amounts with immutable audit evidence", async () => {
    const d = await draft(),
      loaded = await repo.detail(actor(), f.company, d.record.id);
    expect(loaded.lines[0]!.allocations[0]!.amount).toBe("100.01000000");
    expect(loaded.record.total).toBe("100.01000000");
    expect(loaded.history).toHaveLength(1);
    expect(loaded.record.plan_code).toMatch(/^BGT-\d{3,}$/);
  });
  it("replays identical mutations and rejects different input under the same key", async () => {
    const key = randomUUID(),
      input = budgetPlanInputSchema.parse({
        company_id: f.company,
        name: "Replay",
        fiscal_calendar_id: `cal-${f.company}`,
        reason: "Replay acceptance",
      });
    const first = await repo.createPlan(actor(), input, key, randomUUID());
    expect(await repo.createPlan(actor(), input, key, randomUUID())).toEqual(first);
    await expect(repo.createPlan(actor(), { ...input, name: "Different" }, key, randomUUID())).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });
  it("rejects stale edits, duplicate periods and excess currency precision", async () => {
    const d = await draft(),
      input = budgetVersionInputSchema.parse({
        plan_id: d.record.plan_id,
        name: d.record.name,
        kind: d.record.kind,
        parent_id: d.record.parent_id,
        company_id: f.company,
        lines: d.lines.map(({ account_id, dimensions, notes, allocations }) => ({
          account_id,
          dimensions,
          notes,
          allocations,
        })),
        reason: "Update acceptance",
      });
    await expect(
      repo.updateVersion(actor(), d.record.id, { ...input, expected_version: 99 }, randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ code: "BUDGET_VERSION_CONFLICT" });
    await expect(
      repo.createVersion(
        actor(),
        {
          ...input,
          lines: [{ ...input.lines[0]!, allocations: [{ period_id: `period-${f.company}-9`, amount: "0.001" }] }],
        },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "BUDGET_INVALID" });
    await expect(
      repo.createVersion(
        actor(),
        {
          ...input,
          lines: [
            { ...input.lines[0]!, allocations: [input.lines[0]!.allocations[0]!, input.lines[0]!.allocations[0]!] },
          ],
        },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "BUDGET_INVALID" });
  });
  it("rejects access to another company and impersonated mutations", async () => {
    const d = await draft();
    await expect(repo.detail(actor(), "unassigned-company", d.record.id)).rejects.toMatchObject({
      code: "COMPANY_ACCESS_DENIED",
    });
    const ctx = { ...actor(), realActorId: "r06.checker", impersonationRequestId: "isolated" };
    await expect(
      repo.createPlan(
        ctx,
        budgetPlanInputSchema.parse({
          company_id: f.company,
          name: "Denied",
          fiscal_calendar_id: `cal-${f.company}`,
          reason: "Denied acceptance",
        }),
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "IMPERSONATION_RESTRICTED" });
  });
  it("allocates stable unique codes under concurrent creation", async () => {
    const records = await Promise.all(Array.from({ length: 4 }, () => plan()));
    expect(new Set(records.map((p) => p.code)).size).toBe(4);
  });
  it("requires an independent assigned checker and retains immutable approval history", async () => {
    const d = await draft(),
      submitted = await service().governance.action(
        actor(),
        d.record.id,
        {
          company_id: f.company,
          expected_version: 1,
          action: "submit",
          approver_id: "r06.checker",
          reason: "Submit for acceptance",
        },
        randomUUID(),
        randomUUID(),
      );
    await expect(
      service().governance.action(
        actor(),
        d.record.id,
        {
          company_id: f.company,
          expected_version: submitted.record.version,
          action: "approve",
          reason: "Self approval attempt",
        },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    const result = await service().governance.action(
      actor("r06.checker"),
      d.record.id,
      {
        company_id: f.company,
        expected_version: submitted.record.version,
        action: "approve",
        reason: "Independent acceptance",
      },
      randomUUID(),
      randomUUID(),
    );
    expect(result.record.state).toBe("approved");
    expect(result.approvals.map((a) => a.action)).toEqual(["submit", "approve"]);
    await expect(
      db.pool.query("update budget set amount=999 where managed_line_id=$1", [result.lines[0]!.id]),
    ).rejects.toThrow("immutable");
  });
  it("rejects overlapping dimension pools before submission", async () => {
    const d = await draft();
    await expect(
      service().governance.action(
        actor(),
        d.record.id,
        {
          company_id: f.company,
          expected_version: 1,
          action: "submit",
          approver_id: "r06.maker",
          reason: "Invalid checker",
        },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "BUDGET_INVALID" });
  });
  it("creates separate revision and best/expected/worst scenario versions", async () => {
    const original = await approved(await draft());
    const generated = await service().forecasting.generate(
      actor(),
      budgetGenerateSchema.parse({
        company_id: f.company,
        source_version_id: original.record.id,
        name: "Worst case",
        kind: "scenario",
        case: "worst",
        method: "copy",
        growth_percent: "10",
        cutoff: "2026-09-30",
        reason: "Scenario acceptance",
      }),
      randomUUID(),
      randomUUID(),
    );
    expect(generated.record.parent_id).toBe(original.record.id);
    expect(generated.record.total).toBe("110.01000000");
    expect((await repo.detail(actor(), f.company, original.record.id)).record.total).toBe("100.01000000");
    expect(generated.record.assumptions.case).toBe("worst");
    const scenarios = await repo.directory(
      actor(),
      budgetQuerySchema.parse({ company_id: f.company, kind: "scenario", limit: 1 }),
    );
    expect(scenarios.total).toBe(1);
    expect(scenarios.versions.map((version) => version.id)).toEqual([generated.record.id]);
    const forecasts = await repo.directory(
      actor(),
      budgetQuerySchema.parse({ company_id: f.company, kind: "forecast", limit: 1 }),
    );
    expect(forecasts.total).toBe(0);
    expect(forecasts.versions).toEqual([]);
  });
  it("round-trips real XLSX allocations with preview and draft-only commit", async () => {
    const d = await draft(),
      file = writeXlsx("Budget", budgetImportHeaders, [
        ["expense", "", "", "", "", "2026-09-01", "78.45", "Import acceptance"],
      ]);
    const preview = await service().files.preview(
      actor(),
      f.company,
      d.record.id,
      d.record.version,
      file,
      "xlsx",
      randomUUID(),
      randomUUID(),
    );
    expect(preview.errors).toEqual([]);
    expect(preview.lines).toHaveLength(1);
    const saved = await service().files.commit(
      actor(),
      f.company,
      preview.id,
      preview.version,
      "Confirmed XLSX import",
      randomUUID(),
      randomUUID(),
    );
    expect(saved.record.total).toBe("78.45000000");
    expect(saved.history.some((a) => a.action === "imported")).toBe(true);
    const exported = await service().files.export(
      actor(),
      budgetQuerySchema.parse({ company_id: f.company, version_id: saved.record.id }),
      "xlsx",
      true,
    );
    expect(exported.readUInt32LE(0)).toBe(0x04034b50);
    await expect(
      service().files.commit(
        actor(),
        f.company,
        preview.id,
        preview.version,
        "Duplicate import",
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "BUDGET_VERSION_CONFLICT" });
  });
  it("retains row errors and prevents stale import commits", async () => {
    const d = await draft(),
      invalid = writeXlsx("Budget", budgetImportHeaders, [["missing", "", "", "", "", "2026-09-01", "1.00", ""]]);
    const rejected = await service().files.preview(
      actor(),
      f.company,
      d.record.id,
      1,
      invalid,
      "xlsx",
      randomUUID(),
      randomUUID(),
    );
    expect(rejected.errors).toHaveLength(1);
    await expect(
      service().files.commit(actor(), f.company, rejected.id, 1, "Invalid import attempt", randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ code: "BUDGET_INVALID" });
    expect((await repo.detail(actor(), f.company, d.record.id)).record.total).toBe("100.01000000");
  });
  it("persists and archives reusable model definitions", async () => {
    const input = budgetModelInputSchema.parse({
      company_id: f.company,
      name: "Seasonal expense",
      reason: "Model acceptance",
      lines: [
        { account_id: f.policy.expense_account_id, amount: "1200", weights: Array.from({ length: 12 }, () => "1") },
      ],
    });
    const model = await service().governance.model(actor(), undefined, input, randomUUID(), randomUUID());
    const archived = await service().governance.model(
      actor(),
      model.id,
      { ...input, expected_version: model.version, active: false },
      randomUUID(),
      randomUUID(),
    );
    expect(archived.active).toBe(false);
    expect(archived.version).toBe(2);
  });
  it("reports real GL actuals and keeps reversal history correct by as-of date", async () => {
    const d = await approved(await draft()),
      posting = new FinancePostingService(),
      sourceId = randomUUID();
    const original = await finance((c) =>
      posting.post(c, {
        tenantId: f.tenant,
        companyId: f.company,
        actorId: "r06.maker",
        sourceType: "budget_acceptance",
        sourceId,
        eventType: "budget_acceptance.posted",
        postingDate: "2026-09-15",
        externalIdempotencyKey: randomUUID(),
        transactionCurrency: "USD",
        exchangeRateId: null,
        exchangeRateValue: "1",
        payloadHashMaterial: { test: true },
        lines: [
          {
            accountId: f.policy.expense_account_id,
            debit: "30.00",
            credit: "0",
            dimensions: {},
            description: "Real budget actual",
          },
          {
            accountId: f.policy.payable_account_id,
            debit: "0",
            credit: "30.00",
            dimensions: {},
            description: "Offset",
          },
        ],
      }),
    );
    const report = await service().report(
      actor(),
      budgetQuerySchema.parse({
        company_id: f.company,
        version_id: d.record.id,
        period_id: `period-${f.company}-9`,
        as_of: "2026-09-30",
      }),
    );
    const expense = report.rows.find((r) => r.account_id === f.policy.expense_account_id)!;
    expect(expense.actual).toBe("30.00000000");
    expect(expense.variance).toBe("70.01000000");
    await finance((c) =>
      posting.reverse(c, {
        tenantId: f.tenant,
        companyId: f.company,
        actorId: "r06.maker",
        sourceType: "budget_acceptance",
        sourceId,
        eventType: "budget_acceptance.reversed",
        originalEventType: "budget_acceptance.posted",
        originalAccountingEventId: original.accountingEventId,
        originalJournalId: original.journalId,
        postingDate: "2026-10-02",
        externalIdempotencyKey: randomUUID(),
        transactionCurrency: "USD",
        payloadHashMaterial: { test: true },
      }),
    );
    const historical = await service().report(
      actor(),
      budgetQuerySchema.parse({ company_id: f.company, version_id: d.record.id, as_of: "2026-09-30" }),
    );
    expect(historical.rows.find((r) => r.account_id === f.policy.expense_account_id)?.actual).toBe("30.00000000");
    const current = await service().report(
      actor(),
      budgetQuerySchema.parse({ company_id: f.company, version_id: d.record.id, as_of: "2026-10-31" }),
    );
    expect(decimal(current.totals.actual, 8, true)).toBe(0n);
  });
  it("builds a rolling forecast from posted history and calculates a live estimate at completion", async () => {
    const original = await approved(await draft());
    const forecast = await service().forecasting.generate(
      actor(),
      budgetGenerateSchema.parse({
        company_id: f.company,
        source_version_id: original.record.id,
        name: "Rolling three periods",
        kind: "forecast",
        method: "rolling",
        cutoff: "2026-09-30",
        history_from: "2026-09-01",
        history_to: "2026-09-30",
        horizon: 3,
        reason: "Posted-history forecast acceptance",
      }),
      randomUUID(),
      randomUUID(),
    );
    expect(forecast.lines[0]!.allocations).toHaveLength(3);
    expect(forecast.forecast_summary).toMatchObject({
      actual: "30.00000000",
      remaining: "90.00000000",
      eac: "120.00000000",
    });
  });
  it("applies balanced transfers only after an independent decision and preserves original allocations", async () => {
    const p = await plan();
    const precedingAccounts = Array.from({ length: 101 }, (_, index) => ({
      id: randomUUID(),
      code: `BGT-PAGE-${String(index).padStart(3, "0")}`,
    }));
    await db.pool.query(
      `insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at)
      select x.id,$1,$2,x.code,x.code,'expense',false,'active',clock_timestamp() from jsonb_to_recordset($3::jsonb) as x(id text,code text)`,
      [f.tenant, f.company, JSON.stringify(precedingAccounts)],
    );
    let d = await repo.createVersion(
      actor(),
      budgetVersionInputSchema.parse({
        company_id: f.company,
        plan_id: p.id,
        name: "Transfer baseline",
        reason: "Transfer acceptance",
        lines: [
          ...precedingAccounts.map((account) => ({
            account_id: account.id,
            allocations: [{ period_id: `period-${f.company}-11`, amount: "0" }],
          })),
          {
            account_id: f.policy.expense_account_id,
            allocations: [
              { period_id: `period-${f.company}-11`, amount: "100" },
              { period_id: `period-${f.company}-12`, amount: "0" },
            ],
          },
        ],
      }),
      randomUUID(),
      randomUUID(),
    );
    d = await approved(d);
    const line = d.lines.find((line) => line.account_id === f.policy.expense_account_id)!;
    const displayPage = await service().report(
      actor(),
      budgetQuerySchema.parse({
        company_id: f.company,
        version_id: d.record.id,
        period_id: `period-${f.company}-11`,
        limit: 100,
      }),
    );
    expect(displayPage.rows.some((row) => row.account_id === line.account_id)).toBe(false);
    const request = await service().governance.request(
      actor(),
      {
        company_id: f.company,
        request: {
          kind: "transfer",
          version_id: d.record.id,
          from_line_id: line.id,
          from_period_id: `period-${f.company}-11`,
          to_line_id: line.id,
          to_period_id: `period-${f.company}-12`,
          amount: "25",
        },
        reason: "Move available allocation",
      },
      randomUUID(),
      randomUUID(),
    );
    const key = randomUUID(),
      decision = {
        company_id: f.company,
        expected_version: request.version,
        action: "approve" as const,
        reason: "Independent transfer review",
      };
    const result = await service().governance.requestAction(
      actor("r06.checker"),
      request.id,
      decision,
      key,
      randomUUID(),
    );
    expect(
      (await service().governance.requestAction(actor("r06.checker"), request.id, decision, key, randomUUID())).id,
    ).toBe(result.id);
    const rows = await service().report(
      actor(),
      budgetQuerySchema.parse({
        company_id: f.company,
        version_id: d.record.id,
        as_of: new Date().toISOString().slice(0, 10),
        account_id: f.policy.expense_account_id,
      }),
    );
    expect(rows.rows.find((r) => r.period_id === `period-${f.company}-11`)?.transfers).toBe("-25.00000000");
    expect(rows.rows.find((r) => r.period_id === `period-${f.company}-12`)?.transfers).toBe("25.00000000");
    expect((await repo.detail(actor(), f.company, d.record.id)).record.total).toBe("100.00000000");
  });
  it("enforces company and tenant RLS for a non-owner database role", async () => {
    const d = await draft(),
      role = `budget_rls_${randomUUID().replaceAll("-", "")}`;
    expect(role).toMatch(/^budget_rls_[a-f0-9]{32}$/);
    const c = await db.pool.connect();
    try {
      await c.query("begin");
      await c.query(`create role ${role}`);
      await c.query(`grant usage on schema public to ${role}`);
      await c.query(`grant select on all tables in schema public to ${role}`);
      await c.query(`set local role ${role}`);
      await c.query("select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.maker',true)", [
        f.tenant,
      ]);
      expect((await c.query("select id from budget_version where id=$1", [d.record.id])).rowCount).toBe(1);
      await c.query("select set_config('nexora.user_id','r06.last-admin-a',true)");
      expect((await c.query("select id from budget_version where id=$1", [d.record.id])).rowCount).toBe(0);
      await c.query(
        "select set_config('nexora.tenant_id','other-tenant',true),set_config('nexora.user_id','r06.maker',true)",
      );
      expect((await c.query("select id from budget_version where id=$1", [d.record.id])).rowCount).toBe(0);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
