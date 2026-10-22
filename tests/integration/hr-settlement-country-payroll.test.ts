import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createBenefitFixture } from "./hr-benefit-fixture.js";
import { attachSalaryBenefit, salaryBenefitActor } from "./hr-salary-benefit-fixture.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { runActor } from "./hr-payroll-run-fixture.js";
import { countryScope } from "./hr-settlement-country-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Country settlement Payroll and Finance provenance", () => {
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
  it("retains reviewed country applicability through actual Payroll consumption and Finance posting", async () => {
    let base: Awaited<ReturnType<typeof createBenefitFixture>>, f: Awaited<ReturnType<typeof attachSalaryBenefit>>;
    const prod = await createProductionJournalFixture(
      pool,
      async (p) => {
        f = await attachSalaryBenefit(pool, base!, p.component.id, { legal_scope: countryScope("legal_employer") });
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

    const proposed = await f!.salaryAction({
      action: "create_rule",
      company_id: prod.companyId,
      terms: { ...f!.salaryTerms, legal_scope: countryScope("legal_employer", prod.jurisdiction) },
      reason: "Proposed regional policy must preserve already posted Payroll evidence",
    });
    await f!.salaryAction({
      action: "submit_rule",
      company_id: prod.companyId,
      id: proposed.id,
      expected_version: 1,
      reason: "Independent review of proposed backdated country policy",
    });
    await expect(
      f!.salaryAction(
        {
          action: "approve_rule",
          company_id: prod.companyId,
          id: proposed.id,
          expected_version: 2,
          reason: "Posted Payroll must prevent retroactive policy override",
        },
        "r06.checker",
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_SETTLEMENT_COUNTRY_OBLIGATION_REVIEW" });
    const future = (await pool.query("select(current_date+1)::text as day")).rows[0].day;
    const next = await f!.salaryAction({
      action: "create_rule",
      company_id: prod.companyId,
      terms: {
        ...f!.salaryTerms,
        effective_from: future,
        effective_to: future,
        legal_scope: countryScope("legal_employer", prod.jurisdiction),
      },
      reason: "Future country policy does not alter the posted historical obligation",
    });
    await f!.salaryAction({
      action: "submit_rule",
      company_id: prod.companyId,
      id: next.id,
      expected_version: 1,
      reason: "Submitted future synthetic policy for independent approval",
    });
    await f!.salaryAction(
      {
        action: "approve_rule",
        company_id: prod.companyId,
        id: next.id,
        expected_version: 2,
        reason: "Future policy preserves original Finance posting history",
      },
      "r06.checker",
    );
  }, 120000);
});
