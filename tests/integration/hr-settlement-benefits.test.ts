import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createBenefitFixture } from "./hr-benefit-fixture.js";
import { lifecycleActor, lifecyclePermissions } from "./hr-lifecycle-case-fixture.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { createPayrollRunFixture, runPermissions, runActor } from "./hr-payroll-run-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Governed company settlement benefits", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createBenefitFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture(start?: string) {
    const f = await createBenefitFixture(pool, undefined, start);
    fixtures.push(f);
    return f;
  }
  type F = Awaited<ReturnType<typeof fixture>>;
  async function approve(f: F, id = f.rule.id) {
    await f.decide("submit_rule", "r06.maker", id);
    await f.decide("approve_rule", "r06.checker", id);
  }
  async function row(f: F) {
    return (
      await pool.query("select terms,evidence,state,version from hr_lifecycle_case where tenant_id=$1 and id=$2", [
        tenant,
        f.statement.id,
      ])
    ).rows[0];
  }
  it("requires separate rule approval, preserves terms and rejects overlapping category periods", async () => {
    const f = await fixture();
    expect((await f.preview()).preview!.blockers).toContain("The company benefit rule needs independent approval.");
    await f.decide("submit_rule");
    await expect(f.decide("approve_rule")).rejects.toMatchObject({ status: 403 });
    await f.decide("approve_rule", "r06.checker");
    await expect(
      pool.query(
        'update hr_settlement_benefit_rule set terms=terms||\'{"rate_minor":"99"}\' where tenant_id=$1 and id=$2',
        [tenant, f.rule.id],
      ),
    ).rejects.toThrow();
    const next = await f.create();
    await f.decide("submit_rule", "r06.maker", next.id);
    await expect(f.decide("approve_rule", "r06.checker", next.id)).rejects.toMatchObject({ status: 409 });
  });
  it("calculates an exact fixed benefit, protects the editor source and replaces a category without duplicating it", async () => {
    const f = await fixture();
    await approve(f);
    expect((await f.preview()).preview).toMatchObject({ eligible_units: 1, amount_minor: "12345", blockers: [] });
    await f.add();
    await f.add();
    const r = await row(f);
    expect(r.terms.lines).toHaveLength(2);
    expect(r.evidence.net_minor).toBe("12345");
    const old = structuredClone(r.terms);
    r.terms.lines[1].amount_minor = "99";
    await expect(f.save(r.terms, "r06.maker", { id: f.statement.id, version: r.version })).rejects.toMatchObject({
      status: 409,
    });
    delete old.lines[1].benefit_source_id;
    await expect(f.save(old, "r06.maker", { id: f.statement.id, version: r.version })).rejects.toMatchObject({
      status: 409,
    });
    await f.act(f.statement.id, "submit");
    await f.act(f.statement.id, "approve", "r06.checker");
    await expect(f.add()).rejects.toMatchObject({ status: 409 });
  });
  it("uses completed calendar service years with a cap and exact integer money", async () => {
    const start = (await pool.query("select (current_date-interval '3 years 6 months')::date::text as day")).rows[0]
        .day,
      f = await fixture(start),
      r = await f.create({ basis: "completed_service_years", maximum_units: 2, category: "severance" });
    await approve(f, r.id);
    const p = (await f.preview(r.id)).preview!;
    expect(p.completed_service_years).toBe(3);
    expect(p.eligible_units).toBe(2);
    expect(p.amount_minor).toBe("24690");
    await f.add(r.id);
    expect((await row(f)).evidence.net_minor).toBe("24690");
  });
  it("keeps earning and deduction categories distinct and reconciles exact net amounts", async () => {
    const f = await fixture();
    await approve(f);
    await f.add();
    const recovery = await f.create({ category: "notice", direction: "deduction", rate_minor: "345" });
    await approve(f, recovery.id);
    await f.add(recovery.id);
    await f.add(recovery.id);
    const r = await row(f);
    expect(r.terms.lines).toHaveLength(3);
    expect(r.evidence).toMatchObject({ earnings_minor: "12345", deductions_minor: "345", net_minor: "12000" });
    await f.act(f.statement.id, "submit");
    await f.act(f.statement.id, "approve", "r06.checker");
  });
  it("reports service, exit type, effective-date and zero-year eligibility blockers", async () => {
    const f = await fixture(),
      r = await f.create({
        basis: "completed_service_years",
        maximum_units: 10,
        minimum_service_days: 36500,
        exit_kinds: ["termination"],
        effective_from: "2020-01-01",
        effective_to: "2020-12-31",
      });
    await approve(f, r.id);
    const p = (await f.preview(r.id)).preview!;
    expect(p.blockers).toEqual(
      expect.arrayContaining([
        "Minimum service has not been reached.",
        "The rule does not cover this type of exit.",
        "The rule does not cover this exit date.",
        "No completed service units are eligible under this rule.",
      ]),
    );
    await expect(f.add(r.id)).rejects.toMatchObject({ status: 409 });
  });
  it("requires a separate statement approver from the benefit calculator, before replay too", async () => {
    const f = await fixture();
    await approve(f);
    await f.add(f.rule.id, "r06.checker");
    await f.act(f.statement.id, "submit");
    await expect(f.act(f.statement.id, "approve", "r06.checker")).rejects.toMatchObject({ status: 403 });
    await f.act(f.statement.id, "return", "r06.checker");
    await f.add();
    await f.act(f.statement.id, "submit");
    await f.act(f.statement.id, "approve", "r06.checker");
  });
  it("rechecks current normalized company grants and blocks impersonation and cross-company access", async () => {
    const f = await fixture();
    await f.decide("submit_rule");
    const input = {
        action: "approve_rule" as const,
        company_id: f.companyId,
        id: f.rule.id,
        expected_version: 2,
        reason: "Independent review of signed company benefit policy and rate",
      },
      key = randomUUID();
    await f.action(input, "r06.checker", key);
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-checker' and permission_key='hr.employment_lifecycle_policy.approve' and scope_value=$2",
      [tenant, f.companyId],
    );
    await expect(f.action(input, "r06.checker", key)).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.actOnSettlementBenefit(
        { ...lifecycleActor(), impersonationRequestId: "impersonated" },
        input,
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.getSettlementBenefits(lifecycleActor(), { company_id: "unavailable-company", limit: 25, offset: 0 }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("keeps benefits immutable in SQL and supports whole-statement correction without touching leave", async () => {
    const f = await fixture();
    await approve(f);
    await f.add();
    await expect(
      pool.query(
        "update hr_lifecycle_case set terms=jsonb_set(terms,'{lines,1,amount_minor}','\"99\"'),version=version+1 where tenant_id=$1 and id=$2",
        [tenant, f.statement.id],
      ),
    ).rejects.toThrow();
    await f.act(f.statement.id, "submit");
    await f.act(f.statement.id, "approve", "r06.checker");
    for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker"])
      for (const key of ["hr.leave.balance.read", "hr.leave.balance.adjust"]) {
        await pool.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
          [tenant, policy, key],
        );
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
          [tenant, policy, key, f.companyId],
        );
      }
    const actor = (id: string) =>
      lifecycleActor(id, [...lifecyclePermissions, "hr.leave.balance.read", "hr.leave.balance.adjust"]);
    for (const action of ["request_void", "approve_void"] as const) {
      await f.repo.actOnLifecycleCase(
        actor(action === "request_void" ? "r06.maker" : "r06.checker"),
        {
          action,
          company_id: f.companyId,
          id: f.statement.id,
          expected_version: (await row(f)).version,
          reason: "Independent correction of company contractual benefit amount",
        },
        randomUUID(),
        "test",
      );
    }
    expect((await row(f)).state).toBe("cancelled");
    expect(
      (
        await pool.query("select count(*)::int n from hr_leave_transaction where tenant_id=$1 and company_id=$2", [
          tenant,
          f.companyId,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("rejects stale evidence when a Payroll period opens after calculation", async () => {
    let f: F;
    const pay = await createPayrollRunFixture(pool, [], {
      beforeAttendanceClose: async (base) => {
        f = await createBenefitFixture(pool, { fixture: base, person: base.person });
        fixtures.push(f);
        await approve(f);
        await f.add();
      },
    });
    await pay.act("policy", {
      currency_code: "PKR",
      money_scale: 2,
      rounding_mode: "half_up",
      net_payable_account_id: pay.liability,
    });
    const state = await pay.repo.getPayrollRunWorkspace(runActor(), pay.query);
    await pay.act("open", { policy_id: state.policies[0]!.id });
    await expect(f!.act(f!.statement.id, "submit")).rejects.toMatchObject({ status: 409 });
    await f!.add();
    await f!.act(f!.statement.id, "submit");
  });
  it("carries generated benefit through actual Payroll consumption and Finance posting", async () => {
    let f: F;
    const prod = await createProductionJournalFixture(
      pool,
      async (base) => {
        await approve(f!);
        await f!.add();
        await f!.act(f!.statement.id, "submit");
        await f!.act(f!.statement.id, "approve", "r06.checker");
        for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker"])
          for (const key of [
            "hr.payroll.setup.read",
            "hr.payroll.adjustment.read",
            "hr.payroll.adjustment.manage",
            "hr.payroll.adjustment.approve",
          ]) {
            await pool.query(
              "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
              [tenant, policy, key],
            );
            await pool.query(
              "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
              [tenant, policy, key, base.companyId],
            );
          }
        await f!.repo.actOnLifecycleCase(
          lifecycleActor("r06.maker", [...lifecyclePermissions, ...runPermissions]),
          {
            action: "prepare_payroll",
            company_id: base.companyId,
            id: f!.statement.id,
            expected_version: (await row(f!)).version,
            month: base.month,
            unprocessed_entitlements_only: true,
            mappings: [
              { line_index: 0, component_id: null, exclusion_reason: "Reviewed zero value historical reference" },
              { line_index: 1, component_id: base.component.id, exclusion_reason: "" },
            ],
            reason: "Approved company benefit handed off to independently reviewed Payroll",
          },
          randomUUID(),
          "test",
        );
        const id = (
          await pool.query(
            "select adjustment_id from hr_settlement_payroll_link where tenant_id=$1 and case_id=$2 and line_index=1",
            [tenant, f!.statement.id],
          )
        ).rows[0].adjustment_id;
        for (const action of ["submit", "approve"] as const) {
          const who = action === "approve" ? "r06.checker" : "r06.maker",
            w = await f!.repo.getPayrollWorkspace(runActor(who), {
              company_id: base.companyId,
              month: base.month,
              section: "adjustments",
              search: "",
              limit: 25,
              offset: 0,
            }),
            r = w.items.find((x) => x.id === id)!;
          await f!.repo.actOnPayrollRecord(
            runActor(who),
            id,
            {
              company_id: base.companyId,
              section: "adjustments",
              action,
              expected_version: r.version,
              source_hash: r.source_hash,
              confirm_override: false,
              reason: "Independent source benefit Payroll review and decision",
            },
            randomUUID(),
            "test",
          );
        }
      },
      async (base) => {
        f = await createBenefitFixture(pool, { fixture: base, person: base.person });
        fixtures.push(f);
      },
    );
    await prod.journalAction("prepare");
    await prod.journalAction("accept", "r06.checker");
    await prod.journalAction("post", "r06.target");
    const w = await f!.repo.getLifecycleCaseWorkspace(
        lifecycleActor("r06.maker", [...lifecyclePermissions, ...runPermissions]),
        { company_id: prod.companyId, section: "settlement", search: "", limit: 25, offset: 0 },
      ),
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
    ).toEqual([{ amount: "123.4500" }]);
  }, 120000);
});
