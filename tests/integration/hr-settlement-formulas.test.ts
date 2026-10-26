import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createSalaryBenefitFixture } from "./hr-salary-benefit-fixture.js";
import { createBenefitFixture } from "./hr-benefit-fixture.js";
import { lifecycleActor } from "./hr-lifecycle-case-fixture.js";
import { calculateHrSettlementMinor, hrBenefitRuleTermsSchema } from "../../packages/contracts/src/hr/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Explicit company service-day settlement formulas", () => {
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
  it("calculates elapsed salary-based partial years from actual days and rounds once", async () => {
    const f = await createSalaryBenefitFixture(pool, true);
    fixtures.push(f);
    const terms = {
      ...f.salaryTerms,
      basis: "service_days" as const,
      service_day_count: "elapsed" as const,
      maximum_units: 36500,
      salary_basis: { ...f.salaryTerms.salary_basis!, divisor: 365, multiplier: 1 },
    };
    const rule = await f.salaryAction({
      action: "create_rule",
      company_id: f.companyId,
      terms,
      reason: "Signed synthetic partial-year policy with explicit elapsed day convention",
    });
    for (const [action, who] of [
      ["submit_rule", "r06.maker"],
      ["approve_rule", "r06.checker"],
    ] as const) {
      const r = (
        await pool.query("select version from hr_settlement_benefit_rule where tenant_id=$1 and id=$2", [
          tenant,
          rule.id,
        ])
      ).rows[0];
      await f.salaryAction(
        {
          action,
          company_id: f.companyId,
          id: rule.id,
          expected_version: r.version,
          reason: "Independent review of partial service policy and explicit company divisor",
        },
        who,
      );
    }
    const p = (
      await f.repo.getSettlementBenefits((await import("./hr-salary-benefit-fixture.js")).salaryBenefitActor(), {
        company_id: f.companyId,
        exit_case_id: f.exit.id,
        rule_id: rule.id,
        limit: 25,
        offset: 0,
      })
    ).preview!;
    expect(p.blockers).toEqual([]);
    expect(p.eligible_units).toBe(p.service_days);
    expect(p.service_days).toBeGreaterThan(1000);
    expect(p.amount_minor).toBe(calculateHrSettlementMinor(String(p.service_days), "3100000", 365, 1));
    await f.salaryAction({
      action: "add_to_statement",
      company_id: f.companyId,
      id: f.statement.id,
      expected_version: (await f.salaryRow()).version,
      rule_id: rule.id,
      source_hash: p.source_hash,
      reason: "Reviewed actual service dates and single-rounded contractual partial-year benefit",
    });
    await f.salaryCaseAction("submit");
    await f.salaryCaseAction("approve", "r06.checker");
    expect((await f.salaryRow()).terms.lines[1].calculation).toMatchObject({
      quantity: String(p.service_days),
      rate_divisor: 365,
    });
  });
  it("supports inclusive days, company fixed-reference factors and a bounded day cap", async () => {
    const f = await createBenefitFixture(pool);
    fixtures.push(f);
    const terms = {
      ...f.terms,
      category: "other" as const,
      basis: "service_days" as const,
      service_day_count: "inclusive" as const,
      rate_minor: "10001",
      rate_factors: { multiplier: 3, divisor: 365 },
      maximum_units: 5,
    };
    const rule = await f.action({
      action: "create_rule",
      company_id: f.companyId,
      terms,
      reason: "Reviewed synthetic contractual partial-year company reference amount",
    });
    for (const [action, who, version] of [
      ["submit_rule", "r06.maker", 1],
      ["approve_rule", "r06.checker", 2],
    ] as const)
      await f.action(
        {
          action,
          company_id: f.companyId,
          id: rule.id,
          expected_version: version,
          reason: "Independent inclusive service-day and factor review",
        },
        who,
      );
    const p = (
      await f.repo.getSettlementBenefits(lifecycleActor(), {
        company_id: f.companyId,
        exit_case_id: f.exit.id,
        rule_id: rule.id,
        limit: 25,
        offset: 0,
      })
    ).preview!;
    expect(p.blockers).toEqual([]);
    expect(p.eligible_units).toBe(Math.min(5, p.service_days + 1));
    expect(p.amount_minor).toBe(calculateHrSettlementMinor(String(p.eligible_units), "10001", 365, 3));
    await f.action({
      action: "add_to_statement",
      company_id: f.companyId,
      id: f.statement.id,
      expected_version: 1,
      rule_id: rule.id,
      source_hash: p.source_hash,
      reason: "Reviewed included service days and exact signed company reference factors",
    });
    await f.act(f.statement.id, "submit");
    await f.act(f.statement.id, "approve", "r06.checker");
  });
  it("rejects ambiguous day counts, mixed rate sources and invalid caps", () => {
    const common = {
      name: "Signed partial-year company benefit",
      category: "gratuity",
      direction: "earning",
      currency: "PKR",
      rate_minor: "10001",
      maximum_units: 3650,
      minimum_service_days: 0,
      exit_kinds: ["resignation"],
      effective_from: "2026-01-01",
      effective_to: "2026-12-31",
      policy_reference: "Signed company benefit formula reference",
    };
    const valid = {
      ...common,
      basis: "service_days",
      service_day_count: "elapsed",
      rate_factors: { multiplier: 1, divisor: 365 },
    };
    expect(hrBenefitRuleTermsSchema.safeParse(valid).success).toBe(true);
    for (const invalid of [
      { ...valid, service_day_count: undefined },
      { ...valid, rate_factors: undefined },
      { ...valid, maximum_units: 36501 },
      { ...valid, rate_minor: "0", salary_basis: { component_ids: ["base"], multiplier: 1, divisor: 365 } },
      { ...valid, basis: "completed_service_years" },
      { ...valid, rate_factors: { multiplier: 1, divisor: 0 } },
    ])
      expect(hrBenefitRuleTermsSchema.safeParse(invalid).success).toBe(false);
  });
  it("rejects direct source forgery of the included day convention or factors", async () => {
    const f = await createSalaryBenefitFixture(pool);
    fixtures.push(f);
    await f.decideSalary("submit_rule");
    await f.decideSalary("approve_rule", "r06.checker");
    await f.addSalary();
    await expect(
      pool.query(
        "insert into hr_settlement_benefit_source select (jsonb_populate_record(null::hr_settlement_benefit_source,to_jsonb(s)||jsonb_build_object('id',$3::text,'units',2))).* from hr_settlement_benefit_source s where tenant_id=$1 and case_id=$2 limit 1",
        [tenant, f.statement.id, randomUUID()],
      ),
    ).rejects.toThrow();
  });
});
