import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createSalaryBenefitFixture, attachSalaryBenefit, salaryBenefitActor } from "./hr-salary-benefit-fixture.js";
import { createBenefitFixture } from "./hr-benefit-fixture.js";
import { lifecycleActor } from "./hr-lifecycle-case-fixture.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { runActor } from "./hr-payroll-run-fixture.js";
import { createHrPayrollRecordSchema } from "../../packages/contracts/src/hr/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Approved salary-backed settlement benefits", () => {
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
  async function fixture(years = false) {
    const f = await createSalaryBenefitFixture(pool, years);
    fixtures.push(f);
    await f.decideSalary("submit_rule");
    await f.decideSalary("approve_rule", "r06.checker");
    return f;
  }
  type F = Awaited<ReturnType<typeof fixture>>;
  async function salaryDecision(f: F, id: string, action: "submit" | "approve" | "reject", who = "r06.maker") {
    const w = await f.repo.getPayrollWorkspace(runActor(who), {
        company_id: f.companyId,
        month: f.pay.month,
        section: "salaries",
        search: "",
        limit: 25,
        offset: 0,
      }),
      r = w.items.find((x) => x.id === id)!;
    return f.repo.actOnPayrollRecord(
      runActor(who),
      id,
      {
        company_id: f.companyId,
        section: "salaries",
        action,
        expected_version: r.version,
        source_hash: r.source_hash,
        confirm_override: false,
        reason: "Governed synthetic salary successor evidence review",
      },
      randomUUID(),
      "salary-test",
    );
  }
  async function successor(f: F) {
    const structure = await f.repo.createPayrollRecord(
      runActor(),
      createHrPayrollRecordSchema.parse({
        kind: "structure",
        company_id: f.companyId,
        code: "REV" + randomUUID().slice(0, 6).toUpperCase(),
        name: "Reviewed revised salary structure",
        description: "Isolated contractual salary change",
        currency_code: "PKR",
        items: [{ component_id: f.pay.component.id, amount: "31000.01", formula: null }],
        reason: "Controlled salary source revision for settlement review",
      }),
      randomUUID(),
      "test",
    );
    return f.repo.createPayrollRecord(
      runActor(),
      createHrPayrollRecordSchema.parse({
        kind: "salary",
        company_id: f.companyId,
        employee_id: f.person.employeeId,
        structure_id: structure.id,
        currency_code: "PKR",
        effective_from: f.today,
        effective_to: null,
        compensation_type: "fixed",
        payment_basis: "monthly",
        supersedes_id: f.pay.salary.id,
        reason: "Controlled salary successor for actual settlement source review",
      }),
      randomUUID(),
      "test",
    );
  }
  it("uses the approved monthly component snapshots and rounds the entire rational calculation once", async () => {
    const f = await fixture(true),
      p = (await f.salaryPreview()).preview!;
    expect(p).toMatchObject({
      eligible_units: 2,
      amount_minor: "2066667",
      rate_minor: "1033333",
      blockers: [],
      salary: { assignment_id: f.pay.salary.id, basis_minor: "3100000", multiplier: 1, divisor: 3 },
    });
    await f.addSalary();
    const r = await f.salaryRow();
    expect(r.terms.lines[1].calculation).toMatchObject({
      quantity: "2",
      rate_minor: "3100000",
      rate_multiplier: 1,
      rate_divisor: 3,
    });
    expect(r.evidence.net_minor).toBe("2066667");
    await f.salaryCaseAction("submit");
    await f.salaryCaseAction("approve", "r06.checker");
  });
  it("protects salary preview, retained statement evidence and replay with current company salary permissions", async () => {
    const f = await fixture();
    await expect(
      f.repo.getSettlementBenefits(lifecycleActor(), {
        company_id: f.companyId,
        exit_case_id: f.exit.id,
        rule_id: f.salaryRule.id,
        limit: 25,
        offset: 0,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await f.addSalary();
    await expect(
      f.repo.getLifecycleCaseWorkspace(lifecycleActor(), {
        company_id: f.companyId,
        section: "settlement",
        search: "",
        limit: 25,
        offset: 0,
      }),
    ).rejects.toMatchObject({ status: 403 });
    const input = {
        action: "add_to_statement" as const,
        company_id: f.companyId,
        id: f.statement.id,
        expected_version: (await f.salaryRow()).version,
        rule_id: f.salaryRule.id,
        source_hash: (await f.salaryPreview()).preview!.source_hash,
        reason: "Reviewed current salary basis for idempotent source refresh",
      },
      key = randomUUID();
    await f.salaryAction(input, "r06.maker", key);
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-maker' and permission_key='hr.payroll.salary.read' and scope_value=$2",
      [tenant, f.companyId],
    );
    await expect(f.salaryAction(input, "r06.maker", key)).rejects.toMatchObject({ status: 403 });
  });
  it("blocks missing components and supports source refresh after an approved salary successor", async () => {
    const f = await fixture();
    await f.addSalary();
    const next = await successor(f);
    await salaryDecision(f, next.id, "submit");
    expect((await f.salaryPreview()).preview!.blockers.join(" ")).toMatch(/submitted salary changes/);
    await expect(f.salaryCaseAction("submit")).rejects.toMatchObject({ status: 409 });
    await salaryDecision(f, next.id, "approve", "r06.checker");
    await expect(f.salaryCaseAction("submit")).rejects.toMatchObject({ status: 409 });
    await f.addSalary();
    expect((await f.salaryRow()).evidence.net_minor).toBe("1033334");
    await f.salaryCaseAction("submit");
    await f.salaryCaseAction("approve", "r06.checker");
  });
  it("requires statement correction before a salary change covering an approved settlement can be submitted", async () => {
    const f = await fixture();
    await f.addSalary();
    await f.salaryCaseAction("submit");
    await f.salaryCaseAction("approve", "r06.checker");
    const next = await successor(f);
    await expect(salaryDecision(f, next.id, "submit")).rejects.toMatchObject({ status: 409 });
    await f.salaryCaseAction("request_void");
    await f.salaryCaseAction("approve_void", "r06.checker");
    await salaryDecision(f, next.id, "submit");
    await salaryDecision(f, next.id, "approve", "r06.checker");
  });
  it("retains source and factor immutability in both API and database", async () => {
    const f = await fixture();
    await f.addSalary();
    const row = await f.salaryRow();
    row.terms.lines[1].calculation.rate_divisor = 2;
    await expect(
      f.repo.actOnLifecycleCase(
        salaryBenefitActor(),
        {
          action: "save",
          company_id: f.companyId,
          id: f.statement.id,
          expected_version: row.version,
          terms: row.terms,
          reason: "Attempt to overwrite an approved salary calculation factor",
        },
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      pool.query(
        "insert into hr_settlement_benefit_source select (jsonb_populate_record(null::hr_settlement_benefit_source,to_jsonb(s)||jsonb_build_object('id',$3::text,'snapshot',jsonb_set(s.snapshot,'{salary,salary,basis_minor}','\"1\"')))).* from hr_settlement_benefit_source s where tenant_id=$1 and case_id=$2 limit 1",
        [tenant, f.statement.id, randomUUID()],
      ),
    ).rejects.toThrow();
  });
  it("blocks formula/missing salary components instead of evaluating unsupported salary bases", async () => {
    const f = await fixture();
    await pool.query("update hr_pay_component set status='inactive',version=version+1 where tenant_id=$1 and id=$2", [
      tenant,
      f.pay.component.id,
    ]);
    expect((await f.salaryPreview()).preview!.blockers.join(" ")).toMatch(/active fixed earning/);
    await expect(f.addSalary()).rejects.toMatchObject({ status: 409 });
  });
  it("consumes a salary-derived benefit through actual Payroll and Finance posting", async () => {
    let base: Awaited<ReturnType<typeof createBenefitFixture>>, f: Awaited<ReturnType<typeof attachSalaryBenefit>>;
    const prod = await createProductionJournalFixture(
      pool,
      async (p) => {
        f = await attachSalaryBenefit(pool, base!, p.component.id);
        await f.decideSalary("submit_rule");
        await f.decideSalary("approve_rule", "r06.checker");
        await f.addSalary();
        await f.salaryCaseAction("submit");
        await f.salaryCaseAction("approve", "r06.checker");
        await f.repo.actOnLifecycleCase(
          salaryBenefitActor(),
          {
            action: "prepare_payroll",
            company_id: f.companyId,
            id: f.statement.id,
            expected_version: (await f.salaryRow()).version,
            month: p.month,
            unprocessed_entitlements_only: true,
            mappings: [
              { line_index: 0, component_id: null, exclusion_reason: "Reviewed zero-value reference only" },
              { line_index: 1, component_id: p.component.id, exclusion_reason: "" },
            ],
            reason: "Reviewed salary-derived entitlement for independent Payroll processing",
          },
          randomUUID(),
          "test",
        );
        const id = (
          await pool.query(
            "select adjustment_id from hr_settlement_payroll_link where tenant_id=$1 and case_id=$2 and line_index=1",
            [tenant, f.statement.id],
          )
        ).rows[0].adjustment_id;
        for (const action of ["submit", "approve"] as const) {
          const who = action === "approve" ? "r06.checker" : "r06.maker",
            w = await f.repo.getPayrollWorkspace(runActor(who), {
              company_id: p.companyId,
              month: p.month,
              section: "adjustments",
              search: "",
              limit: 25,
              offset: 0,
            }),
            r = w.items.find((x) => x.id === id)!;
          await f.repo.actOnPayrollRecord(
            runActor(who),
            id,
            {
              company_id: p.companyId,
              section: "adjustments",
              action,
              expected_version: r.version,
              source_hash: r.source_hash,
              confirm_override: false,
              reason: "Independent salary-derived benefit Payroll review",
            },
            randomUUID(),
            "test",
          );
        }
      },
      async (p) => {
        base = await createBenefitFixture(pool, { fixture: p, person: p.person });
        fixtures.push(base);
      },
    );
    await prod.journalAction("prepare");
    await prod.journalAction("accept", "r06.checker");
    await prod.journalAction("post", "r06.target");
    const w = await f!.repo.getLifecycleCaseWorkspace(salaryBenefitActor(), {
        company_id: prod.companyId,
        section: "settlement",
        search: "",
        limit: 25,
        offset: 0,
      }),
      link = w.items[0]!.payroll_links.find((x) => x.line_index === 1)!;
    expect(link).toMatchObject({ state: "consumed", finance_state: "posted" });
    expect(link.journal_id).toBeTruthy();
    expect(
      (
        await pool.query(
          "select amount::text from hr_payroll_result_item where tenant_id=$1 and result_id=$2 and source=$3",
          [tenant, link.result_id, "adjustment:" + link.adjustment_id],
        )
      ).rows,
    ).toEqual([{ amount: "10333.3300" }]);
  }, 120000);
});
