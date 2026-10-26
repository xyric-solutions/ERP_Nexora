import { randomUUID } from "node:crypto";
import { createHrPayrollRecordSchema } from "../../packages/contracts/src/hr/index.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { hrPayrollRunWorkspaceSchema } from "../../packages/contracts/src/hr/index.js";
import { createStatutoryFixture } from "./hr-payroll-statutory-fixture.js";
import { runActor } from "./hr-payroll-run-fixture.js";
import { sourceTestTenantId as tenant, ensureSourceAuthorizationFixture } from "./source-security-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Published statutory execution in isolated Payroll (synthetic rules only)", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createStatutoryFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture(options: Parameters<typeof createStatutoryFixture>[1] = {}) {
    const f = await createStatutoryFixture(pool, options);
    fixtures.push(f);
    return f;
  }
  it("calculates employee deductions and separate employer costs, sealing reproducible immutable evidence", async () => {
    const f = await fixture();
    await f.act("calculate");
    const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    hrPayrollRunWorkspaceSchema.parse(state);
    expect(state.employees[0]).toMatchObject({
      gross: "31000.0000",
      deductions: "3100.0000",
      net: "27900.0000",
      employer_contributions: "1550.0000",
    });
    expect(state.blocked).toEqual([]);
    const snapshot = (
      await pool.query(`select * from hr_payroll_statutory_snapshot where tenant_id=$1 and payroll_result_id=$2`, [
        tenant,
        state.employees[0]!.id,
      ])
    ).rows[0];
    expect(snapshot).toMatchObject({ state: "sealed", calculation_engine_version: "statutory_rules_v1_test" });
    const lines = (
      await pool.query(
        `select * from hr_payroll_statutory_snapshot_line where tenant_id=$1 and snapshot_id=$2 order by position`,
        [tenant, snapshot.id],
      )
    ).rows;
    expect(lines).toHaveLength(2);
    expect(lines[0].input_evidence_json.inputs.GROSS).toBe("31000.00");
    await expect(
      pool.query(
        `update hr_payroll_statutory_snapshot_line set employee_amount=0 where tenant_id=$1 and snapshot_id=$2`,
        [tenant, snapshot.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(`delete from hr_payroll_statutory_snapshot where tenant_id=$1 and id=$2`, [tenant, snapshot.id]),
    ).rejects.toThrow();
  });
  it("requires independent final approval and rejects synthetic evidence in the production repository", async () => {
    const f = await fixture();
    await f.act("calculate");
    await f.act("submit");
    await expect(f.act("approve")).rejects.toMatchObject({ status: 403 });
    const prod = await f.productionRepo.getPayrollRunWorkspace(runActor("r06.checker"), f.query);
    expect(prod.allowed_actions).not.toContain("approve");
    await expect(
      f.productionRepo.actOnPayrollRun(
        runActor("r06.checker"),
        {
          ...f.query,
          action: "approve",
          reason: "Production must reject synthetic evidence",
          expected_version: prod.period!.version,
          source_hash: prod.source_hash,
          confirm_override: false,
        },
        crypto.randomUUID(),
        "statutory-test",
      ),
    ).rejects.toMatchObject({ status: 409 });
    await f.act("approve", "r06.checker");
    expect((await f.repo.getPayrollRunWorkspace(runActor(), f.query)).period!.state).toBe("approved");
  });
  it("production calculation saves explicit blockers without sealing synthetic releases", async () => {
    const f = await fixture();
    const state = await f.productionRepo.getPayrollRunWorkspace(runActor(), f.query);
    await f.productionRepo.actOnPayrollRun(
      runActor(),
      {
        ...f.query,
        action: "calculate",
        reason: "Production classification rejection acceptance",
        expected_version: state.period!.version,
        source_hash: state.source_hash,
        confirm_override: false,
      },
      crypto.randomUUID(),
      "statutory-test",
    );
    const next = await f.productionRepo.getPayrollRunWorkspace(runActor(), f.query);
    expect(next.employees[0]!.net).toBe("31000.0000");
    expect(next.employees[0]!.warnings.join(" ")).toMatch(/environment/);
    expect(
      (
        await pool.query(
          `select count(*)::int as n from hr_payroll_statutory_snapshot where tenant_id=$1 and company_id=$2`,
          [tenant, f.companyId],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it.each([{ badVector: true }, { release: false }, { component: false }])(
    "does not retain partial outputs when published evidence is unusable %j",
    async (options) => {
      const f = await fixture(options);
      await f.act("calculate");
      const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
      expect(state.employees[0]!.warnings.length).toBeGreaterThan(0);
      expect(state.employees[0]!.deductions).toBe("0.0000");
      expect(state.employees[0]!.employer_contributions).toBe("0.0000");
      expect(state.blocked.join(" ")).toMatch(/sealed statutory/);
    },
  );
  it("recalculates into new sealed results while retaining the previous immutable run", async () => {
    const f = await fixture();
    await f.act("calculate");
    await f.act("calculate");
    const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.period!.run_number).toBe(2);
    expect(state.employees[0]!.net).toBe("27900.0000");
    expect(
      (
        await pool.query(
          `select count(*)::int as n from hr_payroll_statutory_snapshot where tenant_id=$1 and company_id=$2 and state='sealed'`,
          [tenant, f.companyId],
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it("rejects a changed jurisdiction context without silently treating the deduction as zero", async () => {
    const f = await fixture();
    await pool.query(`update hr_work_location_profile set state='superseded' where tenant_id=$1 and id=$2`, [
      tenant,
      f.location,
    ]);
    await f.act("calculate");
    const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.employees[0]!.warnings.join(" ")).toMatch(/work-location/);
    expect(state.blocked.length).toBeGreaterThan(0);
  });
  it("consumes approved one-off inputs atomically with independent final approval and replays safely", async () => {
    const f = await fixture();
    const created = await f.repo.createPayrollRecord(
      runActor(),
      createHrPayrollRecordSchema.parse({
        kind: "adjustment",
        company_id: f.companyId,
        reason: "Synthetic governed adjustment acceptance",
        employee_id: f.person.employeeId,
        component_id: f.component.id,
        effective_month: f.month,
        amount: "100",
      }),
      randomUUID(),
      "statutory-test",
    );
    for (const action of ["submit", "approve"] as const) {
      const row = (
        await f.repo.getPayrollWorkspace(runActor(), {
          ...f.query,
          section: "adjustments",
          limit: 25,
          offset: 0,
          search: "",
        })
      ).items.find((r) => r.id === created.id)!;
      await f.repo.actOnPayrollRecord(
        runActor(action === "approve" ? "r06.checker" : "r06.maker"),
        row.id,
        {
          company_id: f.companyId,
          section: "adjustments",
          action,
          reason: "Independent synthetic input authority",
          expected_version: row.version,
          source_hash: row.source_hash,
          confirm_override: false,
        },
        randomUUID(),
        "statutory-test",
      );
    }
    await f.act("calculate");
    let state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.employees[0]!.net).toBe("27990.0000");
    expect(
      (await pool.query("select state from hr_payroll_adjustment where tenant_id=$1 and id=$2", [tenant, created.id]))
        .rows[0].state,
    ).toBe("approved");
    await f.act("submit");
    state = await f.repo.getPayrollRunWorkspace(runActor("r06.checker"), f.query);
    const request = {
        ...f.query,
        action: "approve" as const,
        reason: "Independent final statutory acceptance",
        expected_version: state.period!.version,
        source_hash: state.source_hash,
        confirm_override: false,
      },
      key = randomUUID();
    const first = await f.repo.actOnPayrollRun(runActor("r06.checker"), request, key, "statutory-test");
    const replay = await f.repo.actOnPayrollRun(runActor("r06.checker"), request, key, "statutory-test");
    expect(replay).toEqual({ ...first, replayed: true });
    const source = (
      await pool.query("select state,consumed_result_id from hr_payroll_adjustment where tenant_id=$1 and id=$2", [
        tenant,
        created.id,
      ])
    ).rows[0];
    expect(source).toMatchObject({ state: "consumed", consumed_result_id: state.employees[0]!.id });
    await expect(
      pool.query("update hr_payroll_adjustment set amount=0 where tenant_id=$1 and id=$2", [tenant, created.id]),
    ).rejects.toThrow();
  });
  it("blocks a statutory rule whose total deductions exceed employee earnings", async () => {
    const f = await fixture({ formula: "GROSS * 2" });
    await f.act("calculate");
    const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.employees[0]!.warnings.join(" ")).toMatch(/exceed total employee earnings/);
    expect(state.blocked.length).toBeGreaterThan(0);
  });
});
