import { createPublishedContextFixture } from "./hr-published-context-fixture.js";
import { ExactPayrollAmount as Money } from "../../server/api/src/modules/hr/payroll-calculation.js";
import { attendanceHash } from "../../server/api/src/modules/hr/attendance-completion.js";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { createStatutoryFixture } from "./hr-payroll-statutory-fixture.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import {
  splitPlacementWithPool,
  splitStatutoryRules,
  approveContextDeclarations,
} from "./hr-statutory-context-fixture.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { runActor } from "./hr-payroll-run-fixture.js";
import { hrPayrollRunWorkspaceSchema } from "../../packages/contracts/src/hr/index.js";
const contextAmount = (first: string, second: string, days: number) =>
  Money.parse(
    Money.parse(first)
      .multiply(Money.parse("14"))
      .divide(Money.parse(String(days)))
      .decimal(2),
  )
    .add(
      Money.parse(
        Money.parse(second)
          .multiply(Money.parse(String(days - 14)))
          .divide(Money.parse(String(days)))
          .decimal(2),
      ),
    )
    .decimal(4);
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Dated statutory contexts and Payroll recognition (artificial reviewed rules)", () => {
  let pool: DatabasePool;
  let taxYear: number;
  const disposables: { dispose: () => Promise<unknown> }[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    taxYear = (await pool.query("select extract(year from current_date)::int n")).rows[0].n;
  });
  afterAll(async () => {
    for (const f of disposables) await f.dispose();
    await pool?.end();
  });
  async function fixture(options: NonNullable<Parameters<typeof createStatutoryFixture>[1]> = {}) {
    const f = await createStatutoryFixture(pool, options);
    disposables.push(f);
    return f;
  }
  async function state(f: Awaited<ReturnType<typeof fixture>>) {
    return hrPayrollRunWorkspaceSchema.parse(await f.repo.getPayrollRunWorkspace(runActor(), f.query));
  }
  async function snapshot(result: string) {
    return (
      await pool.query("select * from hr_payroll_statutory_snapshot where tenant_id=$1 and payroll_result_id=$2", [
        tenant,
        result,
      ])
    ).rows[0];
  }
  it("resolves a mid-period placement transfer and applies unchanged monthly rules only once", async () => {
    const f = await fixture({ beforeAttendanceClose: splitPlacementWithPool(pool) });
    await f.act("calculate");
    const w = await state(f),
      e = w.employees[0]!;
    expect(e).toMatchObject({
      gross: "31000.0000",
      deductions: "3100.0000",
      net: "27900.0000",
      employer_contributions: "1550.0000",
      warnings: [],
    });
    expect(e.statutory!.contexts).toHaveLength(2);
    expect(e.statutory!.rule_count).toBe(2);
    const s = await snapshot(e.id);
    expect(s.resolver_version).toBe("dated_statutory_context_v1");
    expect(
      s.context_segments_json[0].segments.reduce((n: number, c: { calendar_days: number }) => n + c.calendar_days, 0),
    ).toBe(f.payload.days.length);
    await f.act("submit");
    await f.act("approve", "r06.checker");
    expect((await state(f)).period!.state).toBe("approved");
  });
  it("blocks a gap in earned placement authority without sealing partial statutory results", async () => {
    const f = await fixture({ beforeAttendanceClose: splitPlacementWithPool(pool, 1) });
    await f.act("calculate");
    const e = (await state(f)).employees[0]!;
    expect(e.warnings.join(" ")).toContain("Statutory context");
    expect(await snapshot(e.id)).toBeUndefined();
  });
  it("allocates effective rule versions from their explicit reviewed context policy", async () => {
    const f = await fixture({ contextBasis: true, beforePackReview: (info) => splitStatutoryRules(pool, info) });
    await f.act("calculate");
    const w = await state(f),
      e = w.employees[0]!;
    expect(e).toMatchObject({
      deductions: contextAmount("3100", "6200", f.payload.days.length),
      net: Money.parse("31000")
        .subtract(Money.parse(contextAmount("3100", "6200", f.payload.days.length)))
        .decimal(4),
      employer_contributions: contextAmount("1550", "3100", f.payload.days.length),
      warnings: [],
    });
    expect(e.statutory!.contexts).toHaveLength(2);
    expect(e.statutory!.rule_count).toBe(4);
    const s = await snapshot(e.id),
      lines = (
        await pool.query(
          "select employee_amount::text,employer_amount::text,input_evidence_json from hr_payroll_statutory_snapshot_line where tenant_id=$1 and snapshot_id=$2 order by position",
          [tenant, s.id],
        )
      ).rows;
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.input_evidence_json.sources.context_groups.length === 1)).toBe(true);
    await f.act("submit");
    await f.act("approve", "r06.checker");
    expect((await state(f)).period!.state).toBe("approved");
  });
  it("checks net-pay safety after explicit allocation, before approving any money", async () => {
    const f = await fixture({
      contextBasis: true,
      beforePackReview: async (info) => {
        await splitStatutoryRules(pool, info);
        const rows = (
          await pool.query(
            "select *,effective_from::text as date_from from hr_statutory_rule_version where pack_version_id=$1",
            [info.version],
          )
        ).rows;
        for (const r of rows) {
          const initial = r.date_from === info.fixture.month,
            config = { ...r.configuration_json, formula: initial ? "GROSS * 2" : "0" };
          await pool.query(
            "update hr_statutory_rule_version set configuration_json=$2::jsonb,content_hash=$3 where id=$1",
            [r.id, JSON.stringify(config), attendanceHash(config)],
          );
          const vectors = (
            await pool.query("select * from hr_statutory_rule_test_vector where rule_version_id=$1", [r.id])
          ).rows;
          for (const v of vectors) {
            const i = v.canonical_inputs_json,
              amount = (
                initial
                  ? Money.parse(i.GROSS)
                      .multiply(Money.parse("2"))
                      .multiply(Money.parse(i.CONTEXT_DAYS))
                      .divide(Money.parse(i.EARNED_PERIOD_DAYS))
                  : Money.parse("0")
              ).decimal(2),
              expected = { applicable: i.GROSS !== "0", amount };
            await pool.query(
              "update hr_statutory_rule_test_vector set expected_outputs_json=$2::jsonb,content_hash=$3 where id=$1",
              [v.id, JSON.stringify(expected), attendanceHash(expected)],
            );
          }
        }
      },
    });
    await f.act("calculate");
    const e = (await state(f)).employees[0]!,
      expected = Money.parse("62000")
        .multiply(Money.parse("14"))
        .divide(Money.parse(String(f.payload.days.length)))
        .decimal(2);
    expect(e.warnings).toEqual([]);
    expect(Money.parse(e.deductions).compare(Money.parse(expected))).toBe(0);
    expect(e.statutory!.state).toBe("sealed");
  });
  it("publishes and independently approves effective pack versions through the real production executor", async () => {
    const f = await createPublishedContextFixture(pool);
    disposables.push(f);
    await f.run("calculate");
    const w = await f.repo.getPayrollRunWorkspace(runActor(), f.query),
      e = w.employees[0]!;
    expect(e.warnings).toEqual([]);
    expect(e.statutory).toMatchObject({ environment: "production", state: "sealed", pack_count: 2, rule_count: 2 });
    expect(e.statutory!.contexts).toHaveLength(2);
    expect(e.deductions).toBe(contextAmount("3100", "6200", f.payload.days.length));
    await f.run("submit");
    await f.run("approve", {}, "r06.checker");
    expect((await f.repo.getPayrollRunWorkspace(runActor(), f.query)).period!.state).toBe("approved");
  });
  it("requires an explicit published allocation policy when rule coverage changes", async () => {
    const f = await fixture({ beforePackReview: (info) => splitStatutoryRules(pool, info) });
    await f.act("calculate");
    const e = (await state(f)).employees[0]!;
    expect(e.warnings.join(" ")).toContain("published calendar-weighted monthly context policy");
    expect(await snapshot(e.id)).toBeUndefined();
  });
  it("resolves dated declaration inputs and aggregates repeated rule versions into one sealed output", async () => {
    const f = await fixture({ contextBasis: true, taxYear, formula: "GROSS * RATE + DOCUMENTED_TAX_CREDIT" });
    await approveContextDeclarations(f);
    await f.act("calculate");
    const e = (await state(f)).employees[0]!;
    expect(e).toMatchObject({
      deductions: contextAmount("3100", "3410", f.payload.days.length),
      net: Money.parse("31000")
        .subtract(Money.parse(contextAmount("3100", "3410", f.payload.days.length)))
        .decimal(4),
      employer_contributions: contextAmount("1550", "1860", f.payload.days.length),
      warnings: [],
    });
    expect(e.statutory!.rule_count).toBe(2);
    expect(e.statutory!.contexts).toHaveLength(2);
    const s = await snapshot(e.id),
      line = (
        await pool.query(
          "select input_evidence_json from hr_payroll_statutory_snapshot_line where tenant_id=$1 and snapshot_id=$2 order by position limit 1",
          [tenant, s.id],
        )
      ).rows[0];
    expect(line.input_evidence_json.sources.context_groups).toHaveLength(2);
  });
  it("does not infer the allocation of a changed declaration under an older monthly rule", async () => {
    const f = await fixture({ taxYear, formula: "GROSS * RATE + DOCUMENTED_TAX_CREDIT" });
    await approveContextDeclarations(f);
    await f.act("calculate");
    const e = (await state(f)).employees[0]!;
    expect(e.warnings.join(" ")).toContain("No allocation is inferred");
    expect(await snapshot(e.id)).toBeUndefined();
  });
  it("retains declaration revisions without duplicating money when the used values remain identical", async () => {
    const f = await fixture({ taxYear, formula: "GROSS * RATE + DOCUMENTED_TAX_CREDIT" });
    await approveContextDeclarations(f, "0");
    await f.act("calculate");
    const e = (await state(f)).employees[0]!;
    expect(e).toMatchObject({ deductions: "3100.0000", net: "27900.0000", warnings: [] });
    expect(e.statutory!.contexts).toHaveLength(2);
    const s = await snapshot(e.id),
      line = (
        await pool.query(
          "select input_evidence_json from hr_payroll_statutory_snapshot_line where tenant_id=$1 and snapshot_id=$2 order by position limit 1",
          [tenant, s.id],
        )
      ).rows[0];
    expect(line.input_evidence_json.sources.context_groups[0].contexts).toHaveLength(2);
  });
  it("preserves an earlier immutable context snapshot on recalculation and fingerprints all resolved evidence", async () => {
    const f = await fixture({ contextBasis: true, beforePackReview: (info) => splitStatutoryRules(pool, info) });
    await f.act("calculate");
    const before = (await state(f)).employees[0]!,
      first = await snapshot(before.id);
    await f.act("calculate");
    const after = (await state(f)).employees[0]!;
    expect(after.id).not.toBe(before.id);
    expect(after.calculation_hash).toBe(before.calculation_hash);
    expect((await snapshot(before.id)).context_segments_json).toEqual(first.context_segments_json);
    await expect(
      pool.query(
        "update hr_payroll_statutory_snapshot set context_segments_json='[]'::jsonb where tenant_id=$1 and id=$2",
        [tenant, first.id],
      ),
    ).rejects.toThrow();
  });
  it("keeps synthetic context evidence outside normal production approval", async () => {
    const f = await fixture({ beforeAttendanceClose: splitPlacementWithPool(pool) });
    await f.act("calculate");
    await f.act("submit");
    const w = await f.productionRepo.getPayrollRunWorkspace(runActor("r06.checker"), f.query);
    expect(w.allowed_actions).not.toContain("approve");
  });
  it("posts a production-executor context result through existing independent Finance accrual", async () => {
    const f = await createProductionJournalFixture(pool, undefined, splitPlacementWithPool(pool));
    disposables.push(f);
    const w = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(w.employees[0]!.statutory!.contexts).toHaveLength(2);
    expect(w.period!.state).toBe("approved");
    await f.journalAction("prepare");
    await f.journalAction("accept", "r06.checker");
    await f.journalAction("post", "r06.target");
    const posted = await f.journalRead();
    expect(posted.period!.state).toBe("posted");
    expect(posted.proposal!.external_journal_id).toBeTruthy();
    expect(
      (
        await pool.query(
          "select count(*)::int n from accounting_event where tenant_id=$1 and source_type='hr.payroll' and source_id=$2",
          [tenant, w.period!.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("rejects absent allocation-group evidence and rolls back all result writes", async () => {
    const f = await fixture({ beforeAttendanceClose: splitPlacementWithPool(pool) }),
      name = "context_group_fault_" + randomUUID().replaceAll("-", ""),
      company = f.companyId.replaceAll("'", "''");
    await pool.query(
      `create function ${name}()returns trigger language plpgsql as $$begin if exists(select 1 from hr_payroll_statutory_snapshot s where s.tenant_id=new.tenant_id and s.id=new.snapshot_id and s.company_id='${company}' and s.resolver_version='dated_statutory_context_v1') then new.input_evidence_json=jsonb_set(new.input_evidence_json,'{sources,context_groups}','[]'::jsonb);end if;return new;end$$`,
    );
    await pool.query(
      `create trigger ${name} before insert on hr_payroll_statutory_snapshot_line for each row execute function ${name}()`,
    );
    try {
      await expect(f.act("calculate")).rejects.toThrow();
    } finally {
      await pool.query(`drop trigger ${name} on hr_payroll_statutory_snapshot_line`);
      await pool.query(`drop function ${name}()`);
    }
    expect((await state(f)).period).toMatchObject({ state: "open", run_number: 0 });
    expect(
      (
        await pool.query("select count(*)::int n from hr_payroll_result where tenant_id=$1 and company_id=$2", [
          tenant,
          f.companyId,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("rejects overlapping context evidence at commit and rolls back the entire Payroll calculation", async () => {
    const f = await fixture({ beforeAttendanceClose: splitPlacementWithPool(pool) }),
      name = "context_fault_" + randomUUID().replaceAll("-", ""),
      company = f.companyId.replaceAll("'", "''");
    expect(
      (
        await pool.query(
          "select tgdeferrable,tginitdeferred from pg_trigger where tgname='hr_dated_statutory_context_provenance'",
        )
      ).rows[0],
    ).toMatchObject({ tgdeferrable: true, tginitdeferred: true });
    await pool.query(
      `create function ${name}()returns trigger language plpgsql as $$begin if new.company_id='${company}' and new.resolver_version='dated_statutory_context_v1' then new.context_segments_json=jsonb_set(new.context_segments_json,'{0,segments,1,effective_from}',new.context_segments_json#>'{0,segments,0,effective_from}');end if;return new;end$$`,
    );
    await pool.query(
      `create trigger ${name} before insert on hr_payroll_statutory_snapshot for each row execute function ${name}()`,
    );
    try {
      await expect(f.act("calculate")).rejects.toThrow();
    } finally {
      await pool.query(`drop trigger ${name} on hr_payroll_statutory_snapshot`);
      await pool.query(`drop function ${name}()`);
    }
    expect((await state(f)).period).toMatchObject({ state: "open", run_number: 0 });
    expect(
      (
        await pool.query("select count(*)::int n from hr_payroll_result where tenant_id=$1 and company_id=$2", [
          tenant,
          f.companyId,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
});
