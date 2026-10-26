import { runActor } from "./hr-payroll-run-fixture.js";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createSalaryBenefitFixture, salaryBenefitActor } from "./hr-salary-benefit-fixture.js";
import { createSalaryEncashmentFixture, attachSalaryEncashment } from "./hr-salary-encashment-fixture.js";
import {
  countryScope,
  createCountryRegion,
  approveSettlementProfile,
  createCountryBenefit,
} from "./hr-settlement-country-fixture.js";
import {
  hrSettlementBenefitWorkspaceSchema,
  hrSettlementCountryScopeSchema,
} from "../../packages/contracts/src/hr/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Administrator-configured country settlement policies", () => {
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
  async function fixture() {
    const f = await createSalaryBenefitFixture(pool);
    fixtures.push(f);
    return f;
  }
  it("uses a separately approved legal-employer profile and retains exact country and authority evidence", async () => {
    const f = await fixture(),
      profile = await approveSettlementProfile(f),
      g = await createCountryBenefit(pool, f, countryScope()),
      w = await g.salaryPreview(),
      p = w.preview!;
    expect(p.blockers).toEqual([]);
    expect(p.country_scope).toMatchObject({
      country_code: "PK",
      basis: "legal_employer",
      profile_id: profile,
      matched_rule_id: g.salaryRule.id,
    });
    expect(p.amount_minor).toBe("1033333");
    hrSettlementBenefitWorkspaceSchema.parse(w);
    expect(w.legal_countries.some((x) => x.code === "PK")).toBe(true);
    await g.addSalary();
    await g.salaryCaseAction("submit");
    await g.salaryCaseAction("approve", "r06.checker");
    const source = (
      await pool.query("select snapshot from hr_settlement_benefit_source where tenant_id=$1 and case_id=$2", [
        tenant,
        g.statement.id,
      ])
    ).rows[0].snapshot;
    const retained = await g.repo.getLifecycleCaseWorkspace(salaryBenefitActor(), {
      company_id: g.companyId,
      section: "settlement",
      search: "",
      limit: 25,
      offset: 0,
    });
    expect(retained.items[0]!.country_sources[0]!.evidence).toMatchObject({
      as_of: f.today,
      profile_id: profile,
      authority_reference: countryScope().authority_reference,
    });
    expect(source.country_scope.profiles[0].id).toBe(profile);
    expect(source.line.source_reference).toContain("Country PK");
  });
  it("prioritizes effective regional policies over country rules and country rules over company defaults", async () => {
    const f = await fixture(),
      region = await createCountryRegion(pool, f.pay.month);
    await approveSettlementProfile(f, "work_location", region);
    await f.decideSalary("submit_rule");
    await f.decideSalary("approve_rule", "r06.checker");
    const national = await createCountryBenefit(pool, f, countryScope("work_location"));
    expect((await f.salaryPreview()).preview!.blockers.join(" ")).toMatch(/most specific/);
    expect((await national.salaryPreview()).preview!.blockers).toEqual([]);
    const regional = await createCountryBenefit(pool, f, countryScope("work_location", region));
    expect((await national.salaryPreview()).preview!.country_scope!.matched_rule_id).toBe(regional.salaryRule.id);
    await expect(national.addSalary()).rejects.toMatchObject({ status: 409 });
    expect((await regional.salaryPreview()).preview!.blockers).toEqual([]);
    await regional.addSalary();
    await regional.salaryCaseAction("submit");
    await regional.salaryCaseAction("approve", "r06.checker");
  });
  it("allows separate country policies for the same period without applying a foreign-country rule", async () => {
    const f = await fixture();
    await approveSettlementProfile(f);
    await pool.query(
      "insert into country(code,alpha3,name,subnational_mode,status,valid_from,source_version) values('QZ','QZZ','Synthetic test country','not_applicable','active','2000-01-01','synthetic test only') on conflict(code) do nothing",
    );
    const pk = await createCountryBenefit(pool, f, countryScope()),
      other = await createCountryBenefit(pool, f, countryScope("legal_employer", null, "QZ"));
    expect((await pk.salaryPreview()).preview!.blockers).toEqual([]);
    expect((await other.salaryPreview()).preview!.blockers.join(" ")).toMatch(/most specific/);
  });
  it("blocks missing jurisdiction evidence and prevents a default bypass when a country profile is unresolved", async () => {
    const f = await fixture();
    await f.decideSalary("submit_rule");
    await f.decideSalary("approve_rule", "r06.checker");
    const g = await createCountryBenefit(pool, f, countryScope());
    expect((await g.salaryPreview()).preview!.blockers.join(" ")).toMatch(/one approved effective/);
    expect((await f.salaryPreview()).preview!.blockers.join(" ")).toMatch(/one approved effective/);
    await expect(g.addSalary()).rejects.toMatchObject({ status: 409 });
    await approveSettlementProfile(f);
    expect((await g.salaryPreview()).preview!.blockers).toEqual([]);
  });
  it("rejects overlapping identical scopes, conflicting profile bases, invalid countries and foreign jurisdictions", async () => {
    const f = await fixture();
    await approveSettlementProfile(f);
    await createCountryBenefit(pool, f, countryScope());
    for (const scope of [countryScope(), countryScope("work_location")]) {
      const r = await f.salaryAction({
        action: "create_rule",
        company_id: f.companyId,
        terms: { ...f.salaryTerms, legal_scope: scope },
        reason: "Synthetic overlapping scope proposed for independent policy review",
      });
      await f.salaryAction({
        action: "submit_rule",
        company_id: f.companyId,
        id: r.id,
        expected_version: 1,
        reason: "Submitted proposed overlapping synthetic country policy",
      });
      await expect(
        f.salaryAction(
          {
            action: "approve_rule",
            company_id: f.companyId,
            id: r.id,
            expected_version: 2,
            reason: "Independent review of conflicting synthetic scope",
          },
          "r06.checker",
        ),
      ).rejects.toMatchObject({ status: 409 });
    }
    await expect(
      f.salaryAction({
        action: "create_rule",
        company_id: f.companyId,
        terms: { ...f.salaryTerms, legal_scope: countryScope("legal_employer", null, "ZX") },
        reason: "Unknown country must be rejected by shared reference authority",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.salaryAction({
        action: "create_rule",
        company_id: f.companyId,
        terms: { ...f.salaryTerms, legal_scope: countryScope("legal_employer", "pk-national", "QZ") },
        reason: "Foreign jurisdiction must be rejected by shared reference authority",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects changed country evidence at statement approval and direct source insertion", async () => {
    const f = await fixture(),
      region = await createCountryRegion(pool, f.pay.month);
    await approveSettlementProfile(f, "work_location", region);
    const g = await createCountryBenefit(pool, f, countryScope("work_location", region));
    await g.addSalary();
    await g.salaryCaseAction("submit");
    await expect(
      pool.query(
        "insert into hr_settlement_benefit_source select (jsonb_populate_record(null::hr_settlement_benefit_source,to_jsonb(s)||jsonb_build_object('id',$3::text,'snapshot',s.snapshot-'country_scope'))).* from hr_settlement_benefit_source s where tenant_id=$1 and case_id=$2 limit 1",
        [tenant, g.statement.id, randomUUID()],
      ),
    ).rejects.toThrow(/Country applicability/);
    await pool.query("update jurisdiction set status='inactive' where id=$1", [region]);
    await expect(g.salaryCaseAction("approve", "r06.checker")).rejects.toMatchObject({ status: 409 });
    await expect(
      pool.query(
        "update hr_lifecycle_case set state='approved',version=version+1,decided_by='r06.checker',updated_by='r06.checker' where tenant_id=$1 and id=$2",
        [tenant, g.statement.id],
      ),
    ).rejects.toThrow(/Country applicability/);
  });
  it("requires correction before Payroll handoff if a newly approved country rule supersedes captured default evidence", async () => {
    const f = await fixture();
    await approveSettlementProfile(f);
    await f.decideSalary("submit_rule");
    await f.decideSalary("approve_rule", "r06.checker");
    await f.addSalary();
    await f.salaryCaseAction("submit");
    await f.salaryCaseAction("approve", "r06.checker");
    await createCountryBenefit(pool, f, countryScope());
    await expect(
      f.repo.actOnLifecycleCase(
        salaryBenefitActor(),
        {
          action: "prepare_payroll",
          company_id: f.companyId,
          id: f.statement.id,
          expected_version: (await f.salaryRow()).version,
          month: f.pay.month,
          unprocessed_entitlements_only: true,
          mappings: [
            { line_index: 0, component_id: null, exclusion_reason: "Reviewed zero reference only" },
            { line_index: 1, component_id: f.pay.component.id, exclusion_reason: "" },
          ],
          reason: "Stale country evidence must be corrected before new Payroll obligations",
        },
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_SETTLEMENT_COUNTRY_REVIEW_REQUIRED" });
    const r = await f.salaryRow();
    await expect(
      pool.query(
        "insert into hr_settlement_payroll_link(tenant_id,company_id,id,case_id,line_index,revision,effective_month,source_version,source_terms,reason,exclusion_reason,created_by) values($1,$2,$3,$4,0,1,$5,$6,$7::jsonb,'Attempt to bypass changed country proof','Reviewed zero reference only','r06.maker')",
        [tenant, f.companyId, randomUUID(), f.statement.id, f.pay.month, r.version, JSON.stringify(r.terms)],
      ),
    ).rejects.toThrow(/Country applicability/);
  });
  it("uses the same country resolver for salary-based leave, independent consumption and exact restoration", async () => {
    const f = await createSalaryEncashmentFixture(pool);
    fixtures.push(f);
    const region = await createCountryRegion(pool, f.pay.month);
    await approveSettlementProfile(f, "work_location", region);
    const g = await attachSalaryEncashment(pool, f, f.pay.component.id, {
      legal_scope: countryScope("work_location", region),
    });
    await g.decideSalary("submit_rule");
    await g.decideSalary("approve_rule", "r06.checker");
    expect((await g.salaryPreview()).preview!).toMatchObject({
      amount_minor: "1059167",
      blockers: [],
      country_scope: { country_code: "PK", basis: "work_location" },
    });
    await g.addSalary();
    await g.salaryCaseAction("submit");
    await g.salaryCaseAction("approve", "r06.checker");
    expect((await g.balance()).encashed).toBe("10.2500");
    await g.salaryCaseAction("request_void");
    await g.salaryCaseAction("approve_void", "r06.checker");
    expect((await g.balance()).encashed).toBe("0.0000");
  });
  it("requires an explicit country code, applicability basis and retained authority reference", () => {
    expect(hrSettlementCountryScopeSchema.safeParse(countryScope()).success).toBe(true);
    for (const s of [
      { ...countryScope(), authority_reference: "" },
      { ...countryScope(), country_code: "Pakistan" },
      { ...countryScope(), basis: "nationality" },
      { ...countryScope(), jurisdiction_id: undefined },
    ])
      expect(hrSettlementCountryScopeSchema.safeParse(s).success).toBe(false);
  });
  it("blocks backdated country policies after handoff and permits approval after independent input rejection", async () => {
    const f = await fixture();
    await approveSettlementProfile(f);
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
      salaryBenefitActor(),
      {
        action: "prepare_payroll",
        company_id: f.companyId,
        id: f.statement.id,
        expected_version: (await f.salaryRow()).version,
        month: f.pay.month,
        unprocessed_entitlements_only: true,
        mappings: [
          { line_index: 0, component_id: null, exclusion_reason: "Reviewed zero reference only" },
          { line_index: 1, component_id: f.pay.component.id, exclusion_reason: "" },
        ],
        reason: "Reviewed unchanged original company obligation before country policy proposal",
      },
      randomUUID(),
      "test",
    );
    const rule = await f.salaryAction({
      action: "create_rule",
      company_id: f.companyId,
      terms: { ...f.salaryTerms, legal_scope: countryScope() },
      reason: "Proposed synthetic country policy covering an existing Payroll obligation",
    });
    await f.salaryAction({
      action: "submit_rule",
      company_id: f.companyId,
      id: rule.id,
      expected_version: 1,
      reason: "Submitted synthetic policy for independent backdating review",
    });
    const decision = {
      action: "approve_rule" as const,
      company_id: f.companyId,
      id: rule.id,
      expected_version: 2,
      reason: "Independent review must preserve active Payroll obligation evidence",
    };
    await expect(f.salaryAction(decision, "r06.checker")).rejects.toMatchObject({
      status: 409,
      code: "HR_SETTLEMENT_COUNTRY_OBLIGATION_REVIEW",
    });
    const id = (
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
        r = w.items.find((x) => x.id === id)!;
      await f.repo.actOnPayrollRecord(
        runActor(who),
        id,
        {
          company_id: f.companyId,
          section: "adjustments",
          action,
          expected_version: r.version,
          source_hash: r.source_hash,
          confirm_override: false,
          reason: "Independent Payroll rejection before country policy and statement correction",
        },
        randomUUID(),
        "test",
      );
    }
    await f.salaryAction(decision, "r06.checker");
    await f.salaryCaseAction("request_void");
    await f.salaryCaseAction("approve_void", "r06.checker");
    expect((await f.salaryRow()).state).toBe("cancelled");
  });
});
