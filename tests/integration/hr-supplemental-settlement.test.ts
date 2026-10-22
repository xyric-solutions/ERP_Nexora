import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createSupplementFixture, grantSupplementAuthority } from "./hr-supplement-fixture.js";
import { readLeaveBalances } from "../../server/api/src/modules/hr/leave-balances.js";
import { supplementActor } from "./hr-supplement-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Actual supplemental settlement Payroll and Finance", () => {
  let pool: DatabasePool;
  const fixtures: Array<{ dispose: () => Promise<unknown> }> = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture(encashment = false, countryScoped = false) {
    const f = await createSupplementFixture(pool, encashment, countryScoped);
    fixtures.push(f);
    return f;
  }
  it("posts an independently reviewed retained-rule supplement, preserves originals and allows a second compensating correction", async () => {
    const f = await fixture(),
      original = await f.row(),
      originalResults = (
        await pool.query(
          "select to_jsonb(r) as value from hr_payroll_result r where tenant_id=$1 and company_id=$2 order by id",
          [tenant, f.companyId],
        )
      ).rows;
    await f.propose("1034433");
    await f.review();
    await f.calculate();
    const calculation = (await f.row()).financial_corrections!.executions[0]!;
    expect(calculation.state).toBe("calculated");
    expect(calculation.months[0]!.after_gross).not.toBe(calculation.months[0]!.before_gross);
    await expect(f.execute("approve_payroll_correction", "r06.maker")).rejects.toMatchObject({ status: 403 });
    await f.execute("approve_payroll_correction");
    await expect(f.execute("post_payroll_correction", "r06.checker")).rejects.toMatchObject({ status: 403 });
    const key = randomUUID(),
      posted = await f.execute("post_payroll_correction", "r06.target", key);
    expect(await f.act(posted.input, "r06.target", key)).toMatchObject({ replayed: true });
    const current = await f.row(),
      execution = current.financial_corrections!.executions[0]!;
    expect(execution).toMatchObject({ state: "posted", posted_by: "r06.target" });
    expect(execution.journal_id).toBeTruthy();
    expect(current.financial_corrections!.records[0]!.state).toBe("processed");
    expect(current.financial_corrections!.can_request).toBe(true);
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-payment-poster' and permission_key='finance.journal.post' and scope_value=$2",
      [tenant, f.companyId],
    );
    await expect(f.act(posted.input, "r06.target", key)).rejects.toMatchObject({ status: 403 });
    await grantSupplementAuthority(pool, f.companyId);
    const run = await f.repo.getPayrollRunWorkspace(supplementActor(), {
      company_id: f.companyId,
      month: f.prod.month,
      limit: 25,
      offset: 0,
    });
    expect(run.employees.find((x) => x.employee_id === f.person.employeeId)!.supplemental!.net).toBe(
      execution.months[0]!.after_net,
    );
    const dashboard = await f.repo.getFinancePayrollDashboard(supplementActor(), f.companyId);
    expect(dashboard.latest_period!.net).toBe(run.supplemental_totals!.net);
    expect(current.terms).toEqual(original.terms);
    expect(current.version).toBe(original.version);
    expect(
      (
        await pool.query(
          "select to_jsonb(r) as value from hr_payroll_result r where tenant_id=$1 and company_id=$2 order by id",
          [tenant, f.companyId],
        )
      ).rows,
    ).toEqual(originalResults);
    expect(
      (
        await pool.query("select status from journal_entry where tenant_id=$1 and id=$2", [
          tenant,
          execution.journal_id,
        ])
      ).rows[0].status,
    ).toBe("posted");
    expect(
      (
        await pool.query("select effective_hr_payroll_correction($1,$2,$3) as result", [
          tenant,
          f.companyId,
          execution.months[0]!.result_id,
        ])
      ).rows[0].result.net,
    ).toBe(execution.months[0]!.after_net);
    await expect(
      pool.query("update journal_entry set status='reversed' where tenant_id=$1 and id=$2", [
        tenant,
        execution.journal_id,
      ]),
    ).rejects.toThrow();
    await f.propose("1033333");
    await f.review();
    await f.calculate();
    const second = (await f.row()).financial_corrections!.executions[0]!;
    expect(second.months[0]!.before_net).toBe(execution.months[0]!.after_net);
    await f.execute("approve_payroll_correction");
    await f.execute("post_payroll_correction", "r06.target");
    expect((await f.row()).financial_corrections!.records.filter((x) => x.state === "processed")).toHaveLength(2);
  });
  it("rejects stale rates and unauthorized replays, retains rejected calculations and permits a fresh successor", async () => {
    const f = await fixture();
    await f.propose("1034433");
    await f.review();
    await f.calculate();
    const first = (await f.row()).financial_corrections!.executions[0]!;
    const priorRate = (
      await pool.query(
        "select id,rate::text from currency_rate where tenant_id=$1 and source_currency='PKR' order by effective_date desc,id desc limit 1",
        [tenant],
      )
    ).rows[0];
    try {
      await pool.query("update currency_rate set rate=rate+0.00000001 where tenant_id=$1 and id=$2", [
        tenant,
        priorRate.id,
      ]);
      await expect(f.execute("approve_payroll_correction")).rejects.toMatchObject({ status: 409 });
      await f.execute("reject_payroll_correction");
      expect((await f.row()).financial_corrections!.executions[0]!.state).toBe("rejected");
      await f.calculate();
      const next = (await f.row()).financial_corrections!.executions[0]!;
      expect(next.id).not.toBe(first.id);
      await expect(
        pool.query("update hr_settlement_correction_execution set snapshot='{}'::jsonb where tenant_id=$1 and id=$2", [
          tenant,
          next.id,
        ]),
      ).rejects.toThrow();
    } finally {
      await pool.query("update currency_rate set rate=$3 where tenant_id=$1 and id=$2", [
        tenant,
        priorRate.id,
        priorRate.rate,
      ]);
    }
  });
  it("restores exact encashed days atomically with a negative monetary supplement without reopening employment or rewriting source consumption", async () => {
    const f = await fixture(true),
      original = await f.row();
    if (original.terms.kind !== "settlement") throw Error("statement");
    const source = original.terms.lines[1]!.encashment_source_id!;
    const leaveSource = (
      await pool.query(
        "select leave_type_id,days::text from hr_settlement_encashment_source where tenant_id=$1 and id=$2",
        [tenant, source],
      )
    ).rows[0];
    const balance = async () => {
      const client = await pool.connect();
      try {
        return (
          await readLeaveBalances(
            client,
            supplementActor(),
            f.companyId,
            [{ employee: f.person.employeeId, type: leaveSource.leave_type_id }],
            f.today,
          )
        )[0]!;
      } finally {
        client.release();
      }
    };
    expect((await balance()).encashed).toBe("10.2500");
    await f.propose("930000", "9.0000");
    await f.review();
    await f.calculate();
    expect((await balance()).encashed).toBe("10.2500");
    const calc = (await f.row()).financial_corrections!.executions[0]!;
    expect(calc.leave_changes[0]).toMatchObject({
      original_days: "10.2500",
      corrected_days: "9.0000",
      delta_days: "1.2500",
    });
    await f.execute("approve_payroll_correction");
    await f.execute("post_payroll_correction", "r06.target");
    expect((await balance()).encashed).toBe("9.0000");
    expect((await balance()).available).toBe("3.3456");
    const ledger = (
      await pool.query(
        "select kind,days::text from hr_leave_transaction where tenant_id=$1 and company_id=$2 and(kind='encashed' or kind='encashment_correction') order by kind",
        [tenant, f.companyId],
      )
    ).rows;
    expect(ledger).toEqual([
      { kind: "encashed", days: "-10.2500" },
      { kind: "encashment_correction", days: "1.2500" },
    ]);
    await expect(f.propose("1136667", "11.0000")).rejects.toMatchObject({ status: 409 });
    await f.propose("1033333", "10.0000");
    await f.review();
    await f.calculate();
    await f.execute("approve_payroll_correction");
    await f.execute("post_payroll_correction", "r06.target");
    expect((await balance()).encashed).toBe("10.0000");
    expect((await balance()).available).toBe("2.3456");
    await expect(
      pool.query(
        "delete from hr_leave_transaction where tenant_id=$1 and company_id=$2 and kind='encashment_correction'",
        [tenant, f.companyId],
      ),
    ).rejects.toThrow();
  });
  it("keeps authoritative employment closure and country applicability intact when correcting after offboarding", async () => {
    const f = await fixture(false, true),
      clearance = await f.save({
        kind: "clearance",
        exit_case_id: f.exit.id,
        tasks: f.tasks("clearance", true),
        notes: "Actual independent clearance before authoritative offboarding",
      });
    async function action(id: string, action: "submit" | "approve" | "apply_exit", who = "r06.maker") {
      const version = (
        await pool.query("select version from hr_lifecycle_case where tenant_id=$1 and id=$2", [tenant, id])
      ).rows[0].version;
      return f.act(
        {
          action,
          company_id: f.companyId,
          id,
          expected_version: version,
          reason: "Independent actual offboarding control and historical correction review",
        },
        who,
      );
    }
    await action(clearance.id, "submit");
    await action(clearance.id, "approve", "r06.checker");
    await action(f.exit.id, "apply_exit");
    expect(
      (
        await pool.query("select status from hr_employment_relationship where tenant_id=$1 and id=$2", [
          tenant,
          f.relationshipId,
        ])
      ).rows[0].status,
    ).toBe("ended");
    const source = (
      await pool.query(
        "select rule_id,snapshot,as_of::text from hr_settlement_benefit_source where tenant_id=$1 and case_id=$2",
        [tenant, f.statement.id],
      )
    ).rows[0];
    await pool.query("select check_hr_settlement_country_source($1,$2,$3,$4,$5::date,'benefit',$6,$7::jsonb)", [
      tenant,
      f.companyId,
      f.person.employeeId,
      f.relationshipId,
      source.as_of,
      source.rule_id,
      JSON.stringify(source.snapshot),
    ]);
    const tampered = JSON.parse(JSON.stringify(source.snapshot));
    tampered.country_scope.assignments[0].work_location_id = "different-placement";
    await expect(
      pool.query("select check_hr_settlement_country_source($1,$2,$3,$4,$5::date,'benefit',$6,$7::jsonb)", [
        tenant,
        f.companyId,
        f.person.employeeId,
        f.relationshipId,
        source.as_of,
        source.rule_id,
        JSON.stringify(tampered),
      ]),
    ).rejects.toThrow();
    await f.propose("1034433");
    await f.review();
    await f.calculate();
    await f.execute("approve_payroll_correction");
    await f.execute("post_payroll_correction", "r06.target");
    expect(
      (
        await pool.query("select status from hr_employment_relationship where tenant_id=$1 and id=$2", [
          tenant,
          f.relationshipId,
        ])
      ).rows[0].status,
    ).toBe("ended");
  });
  it("rolls back posting when Finance is closed and leaves the approved calculation unchanged", async () => {
    const f = await fixture();
    await f.propose("1034433");
    await f.review();
    await f.calculate();
    await f.execute("approve_payroll_correction");
    const period = (
      await pool.query(
        "select id,status from financial_period where tenant_id=$1 and company_id=$2 and current_date between period_start and period_end",
        [tenant, f.companyId],
      )
    ).rows[0];
    try {
      await pool.query("update financial_period set status='closed' where tenant_id=$1 and id=$2", [tenant, period.id]);
      await expect(f.execute("post_payroll_correction", "r06.target")).rejects.toMatchObject({ status: 409 });
      expect((await f.row()).financial_corrections!.executions[0]!.state).toBe("approved");
      expect((await f.row()).financial_corrections!.records[0]!.state).toBe("approved");
    } finally {
      await pool.query("update financial_period set status=$3 where tenant_id=$1 and id=$2", [
        tenant,
        period.id,
        period.status,
      ]);
    }
  });
});
