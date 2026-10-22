import { createPayrollOvertimeFixture, type OvertimeFixtureOptions } from "./hr-payroll-overtime-fixture.js";
import { hrPayrollRunWorkspaceSchema } from "../../packages/contracts/src/hr/index.js";
import { randomUUID } from "node:crypto";
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { createPayrollRunFixture, runActor } from "./hr-payroll-run-fixture.js";
import { sourceTestTenantId as tenant, ensureSourceAuthorizationFixture } from "./source-security-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;
run("Governed monetary overtime in persisted Payroll", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createPayrollRunFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture(options: OvertimeFixtureOptions = {}) {
    const f = await createPayrollOvertimeFixture(pool, options);
    fixtures.push(f);
    return f;
  }
  it("adds exact monetary overtime and immutable result/line/salary evidence, ignoring the operational multiplier", async () => {
    const f = await fixture();
    await f.act("calculate");
    const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    hrPayrollRunWorkspaceSchema.parse(state);
    expect(state.employees[0]).toMatchObject({ gross: "31232.5000", net: "31232.5000" });
    expect(state.employees[0]!.lines).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: "overtime:" + f.ot.id, amount: "232.5000" })]),
    );
    const evidence = (
      await pool.query("select * from hr_payroll_ot_evidence where tenant_id=$1 and payroll_result_id=$2", [
        tenant,
        state.employees[0]!.id,
      ])
    ).rows[0];
    expect(evidence).toMatchObject({
      overtime_request_id: f.ot.id,
      policy_version_id: f.version,
      arrangement_id: f.arrangement,
      multiplier: "1.500000",
      rounded_amount: "232.5000",
    });
    expect(evidence.salary_segment_id).toBeTruthy();
    await expect(
      pool.query("update hr_payroll_ot_evidence set rounded_amount=0 where tenant_id=$1 and id=$2", [
        tenant,
        evidence.id,
      ]),
    ).rejects.toThrow();
  });
  it("recalculates into new evidence without double counting", async () => {
    const f = await fixture();
    await f.act("calculate");
    await f.act("calculate");
    const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.period!.run_number).toBe(2);
    expect(state.employees[0]!.gross).toBe("31232.5000");
    expect(
      Number(
        (
          await pool.query("select count(*) as n from hr_payroll_ot_evidence where tenant_id=$1 and company_id=$2", [
            tenant,
            f.companyId,
          ])
        ).rows[0].n,
      ),
    ).toBe(2);
  });
  it.each(["hourly_rate", "final_employee_period"])("retains %s policy rounding evidence", async (stage) => {
    const f = await fixture({ stage });
    await f.act("calculate");
    expect((await f.repo.getPayrollRunWorkspace(runActor(), f.query)).employees[0]!.gross).toBe("31232.5000");
  });
  it("uses an explicitly approved direct hourly arrangement", async () => {
    const f = await fixture({ direct: true });
    await f.act("calculate");
    expect((await f.repo.getPayrollRunWorkspace(runActor(), f.query)).employees[0]!.gross).toBe("31375.0000");
  });
  it.each([{ released: false }, { scale: 3 }, { selectedHourly: true }])(
    "fails closed for unusable monetary authority %j",
    async (options) => {
      const f = await fixture(options);
      await expect(f.act("calculate")).rejects.toMatchObject({ status: 409 });
      expect((await f.repo.getPayrollRunWorkspace(runActor(), f.query)).employees).toEqual([]);
    },
  );
  it("seals released policy identity and approved selections against inserted or changed children", async () => {
    const f = await fixture();
    await expect(
      pool.query("update hr_ot_monetary_policy set contractual_ot_allowed=true where tenant_id=$1 and id=$2", [
        tenant,
        f.policy,
      ]),
    ).rejects.toThrow();
    await expect(
      pool.query(
        "update hr_employee_ot_arrangement_component set position=2 where tenant_id=$1 and arrangement_id=$2",
        [tenant, f.arrangement],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `insert into hr_employee_ot_arrangement_component(id,tenant_id,company_id,arrangement_id,component_id,position) values($1,$2,$3,$4,$5,2)`,
        ["late-" + randomUUID(), tenant, f.companyId, f.arrangement, f.component.id],
      ),
    ).rejects.toThrow("Sealed");
    await expect(
      pool.query(
        `insert into hr_ot_monetary_option_component(id,tenant_id,company_id,option_id,component_id,position) values($1,$2,$3,$4,$5,2)`,
        ["late-" + randomUUID(), tenant, f.companyId, f.option, f.component.id],
      ),
    ).rejects.toThrow("Sealed");
  });

  it.each([
    { stage: "per_ot_day", net: "31007.7600", amounts: ["3.8800", "3.8800"] },
    { stage: "final_employee_period", net: "31007.7500", amounts: ["3.8800", "3.8700"] },
  ])("reconciles multi-day rounding at $stage", async ({ stage, net, amounts }) => {
    const f = await fixture({ stage, minutes: 1, days: 2 });
    await f.act("calculate");
    const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.employees[0]!.net).toBe(net);
    const rows = (
      await pool.query(
        "select rounded_amount::text,calculation_json from hr_payroll_ot_evidence where tenant_id=$1 and company_id=$2 order by work_date",
        [tenant, f.companyId],
      )
    ).rows;
    expect(rows.map((r) => r.rounded_amount)).toEqual(amounts);
  });

  it("prevents moving draft monetary options into a released authority", async () => {
    const f = await fixture(),
      version = "draft-version-" + randomUUID(),
      option = "draft-option-" + randomUUID();
    await pool.query(
      "insert into hr_ot_monetary_policy_version(id,tenant_id,company_id,policy_id,version_number,category,effective_from,source_reference,created_by) values($1,$2,$3,$4,2,'regular',$5,'synthetic-draft-successor','r06.maker')",
      [version, tenant, f.companyId, f.policy, f.month],
    );
    await pool.query(
      "insert into hr_ot_monetary_policy_option select (jsonb_populate_record(null::hr_ot_monetary_policy_option,to_jsonb(src)||jsonb_build_object('id',$3::text,'policy_version_id',$4::text,'code','DRAFT_COPY'))).* from hr_ot_monetary_policy_option src where src.tenant_id=$1 and src.id=$2",
      [tenant, f.option, option, version],
    );
    await expect(
      pool.query("update hr_ot_monetary_policy_option set policy_version_id=$3 where tenant_id=$1 and id=$2", [
        tenant,
        option,
        f.version,
      ]),
    ).rejects.toThrow("Sealed");
  });
});
