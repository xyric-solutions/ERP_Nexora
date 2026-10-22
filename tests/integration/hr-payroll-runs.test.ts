import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import {
  createHrPayrollRecordSchema,
  hrPayrollRunWorkspaceSchema,
  hrPayrollRunActionSchema,
} from "../../packages/contracts/src/hr/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createPayrollRunFixture, runActor, runPermissions } from "./hr-payroll-run-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;
run("Persisted Payroll run lifecycle", () => {
  let pool: DatabasePool, repo: SourceHrRepository;
  const fixtures: Awaited<ReturnType<typeof createPayrollRunFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture(options = {}) {
    const f = await createPayrollRunFixture(pool, [], options);
    fixtures.push(f);
    return f;
  }
  async function configure(f: Awaited<ReturnType<typeof fixture>>) {
    await f.act("policy", {
      currency_code: "PKR",
      money_scale: 2,
      rounding_mode: "half_up",
      net_payable_account_id: f.liability,
    });
    const state = await repo.getPayrollRunWorkspace(runActor(), f.query);
    hrPayrollRunWorkspaceSchema.parse(state);
    await f.act("open", { policy_id: state.policies[0]!.id });
  }
  it("opens and persists an exact run tied to the frozen v5 input and approved salary", async () => {
    const f = await fixture();
    await configure(f);
    await f.act("calculate");
    const state = await repo.getPayrollRunWorkspace(runActor(), f.query);
    hrPayrollRunWorkspaceSchema.parse(state);
    expect(state.period).toMatchObject({ state: "calculated", run_number: 1, version: 2 });
    expect(state.employees[0]).toMatchObject({
      gross: "31000.0000",
      deductions: "0.0000",
      net: "31000.0000",
      attendance_source_hash: f.payload.source_hash,
    });
    expect(state.blocked.join(" ")).toContain("statutory");
    const evidence = (
      await pool.query(
        "select payroll_input_id,payroll_input_evidence_version,execution_evidence from hr_payroll_result where tenant_id=$1 and id=$2",
        [tenant, state.employees[0]!.id],
      )
    ).rows[0];
    expect(evidence.payroll_input_id).toBe(f.inputId);
    expect(evidence.payroll_input_evidence_version).toBe("attendance_close_v5");
    expect(evidence.execution_evidence.engine_version).toBe("monthly_fixed_v1");
  });
  it("keeps recalculation as a new immutable run and preserves the old one", async () => {
    const f = await fixture();
    await configure(f);
    await f.act("calculate");
    const first = (await repo.getPayrollRunWorkspace(runActor(), f.query)).employees[0]!;
    await f.act("calculate");
    const current = await repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(current.period!.run_number).toBe(2);
    expect(current.employees[0]!.id).not.toBe(first.id);
    expect(current.employees[0]!.calculation_hash).toBe(first.calculation_hash);
    expect(
      Number(
        (
          await pool.query("select count(*) as n from hr_payroll_result where tenant_id=$1 and period_id=$2", [
            tenant,
            current.period!.id,
          ])
        ).rows[0].n,
      ),
    ).toBe(2);
    await expect(
      pool.query("update hr_payroll_result set net=1 where tenant_id=$1 and id=$2", [tenant, first.id]),
    ).rejects.toThrow();
  });
  it("submits to a real review queue, requires a separate reviewer and returns the run", async () => {
    const f = await fixture();
    await configure(f);
    await f.act("calculate");
    await f.act("submit");
    expect((await repo.getPayrollRunWorkspace(runActor(), f.query)).period!.state).toBe("under_review");
    await expect(f.act("return")).rejects.toMatchObject({ status: 403 });
    await f.act("return", {}, "r06.checker");
    expect((await repo.getPayrollRunWorkspace(runActor(), f.query)).period!.state).toBe("open");
  });
  it("does not approve preliminary wages without verified statutory evidence", async () => {
    const f = await fixture();
    await configure(f);
    await f.act("calculate");
    await f.act("submit");
    await expect(f.act("approve", {}, "r06.checker")).rejects.toMatchObject({ status: 409 });
    expect((await repo.getPayrollRunWorkspace(runActor(), f.query)).period!.state).toBe("under_review");
  });
  it("serializes repeated calculations and replays the committed response once", async () => {
    const f = await fixture();
    await configure(f);
    const state = await repo.getPayrollRunWorkspace(runActor(), f.query),
      key = randomUUID(),
      input = hrPayrollRunActionSchema.parse({
        ...f.query,
        action: "calculate",
        reason: "Concurrent calculation replay acceptance",
        expected_version: state.period!.version,
        source_hash: state.source_hash,
      });
    const results = await Promise.all([
      repo.actOnPayrollRun(runActor(), input, key, "test"),
      repo.actOnPayrollRun(runActor(), input, key, "test"),
    ]);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect((await repo.getPayrollRunWorkspace(runActor(), f.query)).period!.run_number).toBe(1);
  });
  it("rejects stale evidence and changed idempotency payloads", async () => {
    const f = await fixture();
    await configure(f);
    const state = await repo.getPayrollRunWorkspace(runActor(), f.query),
      key = randomUUID(),
      input = hrPayrollRunActionSchema.parse({
        ...f.query,
        action: "calculate",
        reason: "Idempotent calculation acceptance",
        expected_version: state.period!.version,
        source_hash: state.source_hash,
      });
    await repo.actOnPayrollRun(runActor(), input, key, "test");
    await expect(repo.actOnPayrollRun(runActor(), input, randomUUID(), "test")).rejects.toMatchObject({ status: 409 });
    await expect(
      repo.actOnPayrollRun(runActor(), { ...input, reason: "Changed calculation request" }, key, "test"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("does not expose wage amounts to a period-only reader", async () => {
    const f = await fixture();
    await configure(f);
    await f.act("calculate");
    const state = await repo.getPayrollRunWorkspace(runActor("r06.checker", ["hr.payroll.period.read"]), f.query);
    expect(state.employees).toEqual([]);
    expect(state.total).toBe(1);
    expect(state.allowed_actions).not.toContain("calculate");
    expect(state.allowed_actions).not.toContain("submit");
  });
  it("requires explicit calculation, compensation and attendance read grants", async () => {
    const f = await fixture();
    await configure(f);
    const state = await repo.getPayrollRunWorkspace(runActor(), f.query),
      input = hrPayrollRunActionSchema.parse({
        ...f.query,
        action: "calculate",
        reason: "Denied salary access must not calculate",
        expected_version: state.period!.version,
        source_hash: state.source_hash,
      });
    await expect(
      repo.actOnPayrollRun(
        runActor(
          "r06.maker",
          runPermissions.filter((p) => p !== "hr.payroll.salary.read"),
        ),
        input,
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects foreign company accounts and currency precision mismatches", async () => {
    const f = await fixture(),
      other = await fixture();
    await expect(
      f.act("policy", {
        currency_code: "PKR",
        money_scale: 2,
        rounding_mode: "half_up",
        net_payable_account_id: other.liability,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.act("policy", {
        currency_code: "PKR",
        money_scale: 3,
        rounding_mode: "half_up",
        net_payable_account_id: f.liability,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("blocks legacy attendance summaries and unexecuted approved overtime", async () => {
    const legacy = await fixture({ legacy: true });
    await expect(configure(legacy)).rejects.toMatchObject({ status: 409 });
    const overtime = await fixture({ overtime: true });
    await configure(overtime);
    await expect(overtime.act("calculate")).rejects.toMatchObject({ status: 409 });
    expect((await repo.getPayrollRunWorkspace(runActor(), overtime.query)).period!.run_number).toBe(0);
  });
  it("rejects unauthorized company reads and impersonated mutations", async () => {
    const f = await fixture();
    await expect(repo.getPayrollRunWorkspace(runActor("r06.restricted"), f.query)).rejects.toMatchObject({
      status: 403,
    });
    const state = await repo.getPayrollRunWorkspace(runActor(), f.query);
    await expect(
      repo.actOnPayrollRun(
        { ...runActor(), impersonationRequestId: "test-impersonation" },
        hrPayrollRunActionSchema.parse({
          ...f.query,
          action: "policy",
          reason: "An impersonated writer cannot change payroll",
          expected_version: 0,
          source_hash: state.source_hash,
        }),
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  async function adjustment(
    f: Awaited<ReturnType<typeof fixture>>,
    amount: string,
    kind = "earning",
    approve = true,
    employee = f.person.employeeId,
  ) {
    let component = f.component.id;
    if (kind === "deduction")
      component = (
        await repo.createPayrollRecord(
          runActor(),
          createHrPayrollRecordSchema.parse({
            kind: "component",
            company_id: f.companyId,
            reason: "Governed deduction fixture",
            code: "DEDUCT",
            name: "Approved one-off deduction",
            component_kind: "deduction",
            method: "fixed",
            formula: null,
            taxable: false,
            prorated: false,
            account_id: f.liability,
            position: 2,
          }),
          randomUUID(),
          "test",
        )
      ).id;
    const created = await repo.createPayrollRecord(
      runActor(),
      createHrPayrollRecordSchema.parse({
        kind: "adjustment",
        company_id: f.companyId,
        reason: "Governed one-off fixture",
        employee_id: employee,
        component_id: component,
        effective_month: f.month,
        amount,
      }),
      randomUUID(),
      "test",
    );
    if (approve)
      for (const action of ["submit", "approve"] as const) {
        const row = (
          await repo.getPayrollWorkspace(runActor(), {
            company_id: f.companyId,
            month: f.month,
            section: "adjustments",
            limit: 25,
            offset: 0,
            search: "",
          })
        ).items.find((r) => r.id === created.id)!;
        await repo.actOnPayrollRecord(
          runActor(action === "approve" ? "r06.checker" : "r06.maker"),
          row.id,
          {
            company_id: f.companyId,
            section: "adjustments",
            action,
            reason: "Independent input authority",
            expected_version: row.version,
            source_hash: row.source_hash,
            confirm_override: false,
          },
          randomUUID(),
          "test",
        );
      }
    return created.id;
  }
  it("includes approved one-off earnings and deductions with explicit currency rounding", async () => {
    const f = await fixture();
    await configure(f);
    const earning = await adjustment(f, "12.3456"),
      deduction = await adjustment(f, "2.3456", "deduction");
    await f.act("calculate");
    const state = await repo.getPayrollRunWorkspace(runActor(), f.query),
      row = state.employees[0]!;
    expect(row).toMatchObject({ gross: "31012.3500", deductions: "2.3500", net: "31010.0000" });
    expect(row.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "adjustment:" + earning, amount: "12.3500" }),
        expect.objectContaining({ source: "adjustment:" + deduction, amount: "2.3500" }),
      ]),
    );
    const sources = (
      await pool.query(
        "select state,consumed_result_id from hr_payroll_adjustment where tenant_id=$1 and id=any($2::text[])",
        [tenant, [earning, deduction]],
      )
    ).rows;
    expect(sources.every((r) => r.state === "approved" && r.consumed_result_id === null)).toBe(true);
  });
  it("recalculates one-off inputs without duplicating or prematurely consuming them", async () => {
    const f = await fixture();
    await configure(f);
    await adjustment(f, "10");
    await f.act("calculate");
    await f.act("calculate");
    const state = await repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.period!.run_number).toBe(2);
    expect(state.employees[0]!.gross).toBe("31010.0000");
    expect(state.employees[0]!.lines.filter((l) => l.source.startsWith("adjustment:"))).toHaveLength(1);
  });
  it("blocks pending inputs instead of silently dropping them", async () => {
    const f = await fixture();
    await configure(f);
    await adjustment(f, "10", "earning", false);
    await expect(f.act("calculate")).rejects.toMatchObject({ status: 409 });
    expect((await repo.getPayrollRunWorkspace(runActor(), f.query)).period!.run_number).toBe(0);
  });
  it("prevents new adjustments from silently altering a calculated period", async () => {
    const f = await fixture();
    await configure(f);
    await f.act("calculate");
    const first = (await repo.getPayrollRunWorkspace(runActor(), f.query)).employees[0]!;
    await expect(adjustment(f, "15")).rejects.toMatchObject({ status: 409 });
    const current = await repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(current.employees[0]!.calculation_hash).toBe(first.calculation_hash);
    expect(current.employees[0]!.gross).toBe("31000.0000");
  });
  it("rolls back a run whose approved deductions exceed pay", async () => {
    const f = await fixture();
    await configure(f);
    await adjustment(f, "40000", "deduction");
    await expect(f.act("calculate")).rejects.toMatchObject({ status: 409 });
    const state = await repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.employees).toEqual([]);
    expect(state.period!.run_number).toBe(0);
  });
  it("rejects approved inputs for employees absent from the frozen attendance population", async () => {
    const f = await fixture();
    await configure(f);
    const other = await f.target();
    await adjustment(f, "10", "earning", true, other.employeeId);
    await expect(f.act("calculate")).rejects.toMatchObject({ status: 409 });
  });
  it("prevents source consumption without its current approved run and exact retained evidence", async () => {
    const f = await fixture();
    await configure(f);
    const id = await adjustment(f, "10");
    await f.act("calculate");
    const result = (await repo.getPayrollRunWorkspace(runActor(), f.query)).employees[0]!;
    await expect(
      pool.query(
        "update hr_payroll_adjustment set state='consumed',consumed_result_id=$3,version=version+1 where tenant_id=$1 and id=$2",
        [tenant, id, result.id],
      ),
    ).rejects.toThrow();
    expect(
      (await pool.query("select state from hr_payroll_adjustment where tenant_id=$1 and id=$2", [tenant, id])).rows[0]
        .state,
    ).toBe("approved");
  });

  it("enforces consumption and current approval as one database commit", async () => {
    const f = await fixture();
    await configure(f);
    const input = await adjustment(f, "10");
    await f.act("calculate");
    await f.act("submit");
    const state = await repo.getPayrollRunWorkspace(runActor(), f.query),
      result = state.employees[0]!;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      await client.query(
        "update hr_payroll_adjustment set state='consumed',consumed_result_id=$3,version=version+1 where tenant_id=$1 and id=$2",
        [tenant, input, result.id],
      );
      await expect(client.query("commit")).rejects.toThrow("approval must commit together");
      await client.query("rollback");
    } finally {
      client.release();
    }
    expect(
      (await pool.query("select state from hr_payroll_adjustment where tenant_id=$1 and id=$2", [tenant, input]))
        .rows[0].state,
    ).toBe("approved");
  });
  it("retains exact consumed source terms and prevents reuse after atomic database approval", async () => {
    // Synthetic persistence invariant only: the public approval endpoint still
    // requires real sealed statutory execution and is tested separately above.
    const f = await fixture();
    await configure(f);
    const input = await adjustment(f, "12.3456");
    await f.act("calculate");
    await f.act("submit");
    const state = await repo.getPayrollRunWorkspace(runActor(), f.query),
      result = state.employees[0]!;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      await client.query(
        "update hr_payroll_period set state='approved',version=version+1,approved_by='r06.checker',approved_at=now(),reviewed_by='r06.checker',reviewed_at=now() where tenant_id=$1 and id=$2",
        [tenant, state.period!.id],
      );
      await client.query(
        "update hr_payroll_adjustment set state='consumed',consumed_result_id=$3,version=version+1 where tenant_id=$1 and id=$2",
        [tenant, input, result.id],
      );
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
    const row = (
      await pool.query(
        "select state,amount::text,consumed_result_id from hr_payroll_adjustment where tenant_id=$1 and id=$2",
        [tenant, input],
      )
    ).rows[0];
    expect(row).toMatchObject({ state: "consumed", amount: "12.3456", consumed_result_id: result.id });
    await expect(
      pool.query(
        "update hr_payroll_adjustment set state='approved',version=version+1,consumed_result_id=null where tenant_id=$1 and id=$2",
        [tenant, input],
      ),
    ).rejects.toThrow();
    await expect(f.act("calculate")).rejects.toMatchObject({ status: 409 });
  });
});
