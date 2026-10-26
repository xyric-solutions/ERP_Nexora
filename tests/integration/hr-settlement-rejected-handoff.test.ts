import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createSalaryEncashmentFixture, salaryEncashmentActor } from "./hr-salary-encashment-fixture.js";
import { runActor } from "./hr-payroll-run-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Settlement correction after rejected Payroll handoff", () => {
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
  it("blocks active inputs then restores exact leave after independent Payroll rejection without deleting handoff history", async () => {
    const f = await createSalaryEncashmentFixture(pool);
    fixtures.push(f);
    await f.decideSalary("submit_rule");
    await f.decideSalary("approve_rule", "r06.checker");
    await f.addSalary();
    await f.salaryCaseAction("submit");
    await f.salaryCaseAction("approve", "r06.checker");
    await f.pay.act("policy", {
      currency_code: "PKR",
      money_scale: 2,
      rounding_mode: "half_up",
      net_payable_account_id: f.pay.liability,
    });
    await f.repo.actOnLifecycleCase(
      salaryEncashmentActor(),
      {
        action: "prepare_payroll",
        company_id: f.companyId,
        id: f.statement.id,
        expected_version: (await f.salaryRow()).version,
        month: f.pay.month,
        unprocessed_entitlements_only: true,
        mappings: [
          {
            line_index: 0,
            component_id: null,
            exclusion_reason: "Reviewed zero-value reference excluded from Payroll",
          },
          { line_index: 1, component_id: f.pay.component.id, exclusion_reason: "" },
        ],
        reason: "Reviewed unprocessed salary-based leave encashment for Payroll handoff",
      },
      randomUUID(),
      "test",
    );
    await expect(f.salaryCaseAction("request_void")).rejects.toMatchObject({ status: 409 });
    const adjustment = (
      await pool.query(
        "select adjustment_id from hr_settlement_payroll_link where tenant_id=$1 and case_id=$2 and line_index=1",
        [tenant, f.statement.id],
      )
    ).rows[0].adjustment_id;
    for (const [action, who] of [
      ["submit", "r06.maker"],
      ["reject", "r06.checker"],
    ] as const) {
      const w = await f.repo.getPayrollWorkspace(runActor(who), {
          company_id: f.companyId,
          month: f.pay.month,
          section: "adjustments",
          search: "",
          limit: 25,
          offset: 0,
        }),
        r = w.items.find((x) => x.id === adjustment)!;
      await f.repo.actOnPayrollRecord(
        runActor(who),
        adjustment,
        {
          company_id: f.companyId,
          section: "adjustments",
          action,
          expected_version: r.version,
          source_hash: r.source_hash,
          confirm_override: false,
          reason: "Independent Payroll rejection before governed statement correction",
        },
        randomUUID(),
        "test",
      );
    }
    await f.salaryCaseAction("request_void");
    await f.salaryCaseAction("approve_void", "r06.checker");
    expect(await f.balance()).toMatchObject({ encashed: "0.0000", balance: "12.3456" });
    expect((await f.salaryRow()).state).toBe("cancelled");
    expect(
      (
        await pool.query("select count(*)::int n from hr_settlement_payroll_link where tenant_id=$1 and case_id=$2", [
          tenant,
          f.statement.id,
        ])
      ).rows[0].n,
    ).toBe(2);
    expect(
      (await pool.query("select state from hr_payroll_adjustment where tenant_id=$1 and id=$2", [tenant, adjustment]))
        .rows[0].state,
    ).toBe("rejected");
    await expect(
      f.repo.actOnLifecycleCase(
        salaryEncashmentActor(),
        {
          action: "prepare_payroll",
          company_id: f.companyId,
          id: f.statement.id,
          expected_version: (await f.salaryRow()).version,
          month: f.pay.month,
          unprocessed_entitlements_only: true,
          mappings: [
            { line_index: 0, component_id: null, exclusion_reason: "Reviewed zero amount excluded" },
            { line_index: 1, component_id: f.pay.component.id, exclusion_reason: "" },
          ],
          reason: "Cancelled statement must not recreate original Payroll obligations",
        },
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("preserves nonzero externally processed references and refuses both API and direct database void requests", async () => {
    const f = await createSalaryEncashmentFixture(pool);
    fixtures.push(f);
    await f.decideSalary("submit_rule");
    await f.decideSalary("approve_rule", "r06.checker");
    await f.addSalary();
    await f.salaryCaseAction("submit");
    await f.salaryCaseAction("approve", "r06.checker");
    const r = await f.salaryRow();
    await pool.query(
      "insert into hr_settlement_payroll_link(tenant_id,company_id,id,case_id,line_index,revision,effective_month,source_version,source_terms,reason,exclusion_reason,created_by) values($1,$2,$3,$4,1,1,$5,$6,$7::jsonb,'Reviewed external financial processing reference','Amount already processed outside Payroll','r06.maker')",
      [tenant, f.companyId, randomUUID(), f.statement.id, f.pay.month, r.version, JSON.stringify(r.terms)],
    );
    await expect(f.salaryCaseAction("request_void")).rejects.toMatchObject({ status: 409 });
    await expect(
      pool.query(
        "insert into hr_settlement_void_request(tenant_id,company_id,id,case_id,case_version,requested_by,reason) values($1,$2,$3,$4,$5,'r06.maker','Attempt to restore encashment already processed externally')",
        [tenant, f.companyId, randomUUID(), f.statement.id, r.version],
      ),
    ).rejects.toThrow();
    expect((await f.balance()).encashed).toBe("10.2500");
  });
});
