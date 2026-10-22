import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { runActor, runPermissions } from "./hr-payroll-run-fixture.js";
import { lifecycleActor } from "./hr-lifecycle-case-fixture.js";
import { encashmentPermissions } from "./hr-encashment-fixture.js";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createEncashmentFixture, encashmentActor } from "./hr-encashment-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Governed source-backed settlement encashment", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createEncashmentFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture(approve = true) {
    const f = await createEncashmentFixture(pool);
    fixtures.push(f);
    if (approve) {
      await f.decide("submit_rule");
      await f.decide("approve_rule", "r06.checker");
    }
    return f;
  }
  it("requires independent rule approval and retains immutable policy versions", async () => {
    const f = await fixture(false);
    expect((await f.preview()).preview!.blockers).toContain("The company encashment rule needs independent approval.");
    await f.decide("submit_rule");
    await expect(f.decide("approve_rule")).rejects.toMatchObject({ status: 403 });
    await f.decide("approve_rule", "r06.checker");
    await expect(
      pool.query(
        'update hr_settlement_encashment_rule set terms=terms||\'{"rate_minor":"999"}\' where tenant_id=$1 and id=$2',
        [tenant, f.rule.id],
      ),
    ).rejects.toThrow();
    const next = await f.action({
      action: "create_rule",
      company_id: f.companyId,
      terms: f.ruleTerms,
      reason: "Proposed overlapping replacement for approval review",
    });
    await f.decide("submit_rule", "r06.maker", next.id);
    await expect(f.decide("approve_rule", "r06.checker", next.id)).rejects.toMatchObject({ status: 409 });
  });
  it("calculates capped four-decimal days and exact amount, consuming leave only with independent approval", async () => {
    const f = await fixture(),
      p = (await f.preview()).preview!;
    expect(p).toMatchObject({ eligible_days: "10.2500", amount_minor: "102510", available: "12.3456", blockers: [] });
    await f.add();
    expect((await f.balance()).encashed).toBe("0.0000");
    const row = (
      await pool.query("select * from hr_lifecycle_case where tenant_id=$1 and id=$2", [tenant, f.statement.id])
    ).rows[0];
    expect(row.terms.lines[1].amount_minor).toBe("102510");
    expect(row.evidence.net_minor).toBe("102510");
    await f.caseAction("submit");
    await expect(f.caseAction("approve")).rejects.toMatchObject({ status: 403 });
    const key = randomUUID();
    const response = await f.caseAction("approve", "r06.checker", key);
    expect(response.status).toBe("approved");
    const b = await f.balance();
    expect(b).toMatchObject({ balance: "2.0956", available: "2.0956", encashed: "10.2500" });
    const same = {
      action: "approve" as const,
      company_id: f.companyId,
      id: f.statement.id,
      expected_version: row.version + 1,
      reason: "Independent settlement review including leave consumption",
    };
    expect(
      (await f.repo.actOnLifecycleCase(encashmentActor("r06.checker"), same, key, "encashment-test")).replayed,
    ).toBe(true);
    expect(
      (
        await pool.query(
          "select count(*)::int n from hr_leave_transaction where tenant_id=$1 and company_id=$2 and kind='encashed'",
          [tenant, f.companyId],
        )
      ).rows[0].n,
    ).toBe(1);
    await expect(f.posting("-3", "adjustment")).rejects.toMatchObject({ status: 409 });
  });
  it("rejects stale previews and submitted snapshots, then allows draft recalculation without duplicate source use", async () => {
    const f = await fixture(),
      hash = (await f.preview()).preview!.source_hash;
    await f.posting("1", "adjustment");
    await expect(f.add("r06.maker", hash)).rejects.toMatchObject({ status: 409 });
    await f.add();
    await f.caseAction("submit");
    await f.posting("-1", "adjustment");
    await expect(f.caseAction("approve", "r06.checker")).rejects.toMatchObject({ status: 409 });
    await f.caseAction("return", "r06.checker");
    await f.add();
    const lines = (
      await pool.query("select terms from hr_lifecycle_case where tenant_id=$1 and id=$2", [tenant, f.statement.id])
    ).rows[0].terms.lines;
    expect(lines.filter((l: { encashment_source_id?: string }) => l.encashment_source_id)).toHaveLength(1);
    await f.caseAction("submit");
    await f.caseAction("approve", "r06.checker");
  });
  it("protects generated amounts, source ownership and company scope", async () => {
    const f = await fixture();
    await f.add();
    const row = (
      await pool.query("select terms,version from hr_lifecycle_case where tenant_id=$1 and id=$2", [
        tenant,
        f.statement.id,
      ])
    ).rows[0];
    row.terms.lines[1].amount_minor = "99999";
    await expect(
      f.repo.actOnLifecycleCase(
        encashmentActor(),
        {
          action: "save",
          company_id: f.companyId,
          id: f.statement.id,
          expected_version: row.version,
          terms: row.terms,
          reason: "Attempt to overwrite source calculated amount",
        },
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      pool.query(
        "update hr_lifecycle_case set terms=jsonb_set(terms,'{lines,1,amount_minor}','\"99999\"'),version=version+1 where tenant_id=$1 and id=$2",
        [tenant, f.statement.id],
      ),
    ).rejects.toThrow();
    await expect(
      f.repo.getSettlementEntitlements(encashmentActor(), { company_id: "unavailable-company", limit: 25, offset: 0 }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rechecks normalized permission before replay and blocks impersonation", async () => {
    const f = await fixture(false);
    await f.decide("submit_rule");
    const input = {
        action: "approve_rule" as const,
        company_id: f.companyId,
        id: f.rule.id,
        expected_version: 2,
        reason: "Independent contractual policy approval and scope review",
      },
      key = randomUUID();
    await f.action(input, "r06.checker", key);
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-checker' and permission_key='hr.employment_lifecycle_policy.approve' and scope_value=$2",
      [tenant, f.companyId],
    );
    await expect(f.action(input, "r06.checker", key)).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.actOnSettlementEntitlement(
        { ...encashmentActor(), impersonationRequestId: "impersonated" },
        input,
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("serializes competing decisions and keeps an approved statement immutable", async () => {
    const f = await fixture();
    await f.add();
    await f.caseAction("submit");
    const results = await Promise.allSettled([
      f.caseAction("approve", "r06.checker"),
      f.caseAction("approve", "r06.checker"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(f.add()).rejects.toMatchObject({ status: 409 });
    expect((await f.balance()).encashed).toBe("10.2500");
  });
  it("excludes pending reservations and protects the same days in historical balance reads", async () => {
    const f = await fixture();
    await pool.query(
      "insert into hr_leave_request(tenant_id,id,company_id,employee_id,leave_type_id,from_date,to_date,requested_days,reason,status,requested_by) values($1,$2,$3,$4,$5,$6,$6,5,'Synthetic pending leave reservation','pending_manager','r06.maker')",
      [tenant, randomUUID(), f.companyId, f.person.employeeId, f.type.id, f.today],
    );
    const p = (await f.preview()).preview!;
    expect(p.reserved).toBe("5.0000");
    expect(p.eligible_days).toBe("7.3456");
    await f.add();
    await f.caseAction("submit");
    await f.caseAction("approve", "r06.checker");
    expect((await f.balance()).available).toBe("0.0000");
    const yesterday = (await pool.query("select ($1::date-1)::text as on_date", [f.today])).rows[0].on_date;
    const b = await f.balance(yesterday);
    expect(Number(b.future_used)).toBeGreaterThanOrEqual(7.3456);
  });
  it("rejects unsupported source detachment and reports minimum service eligibility", async () => {
    const f = await fixture();
    await f.add();
    const row = (
      await pool.query("select terms,version from hr_lifecycle_case where tenant_id=$1 and id=$2", [
        tenant,
        f.statement.id,
      ])
    ).rows[0];
    delete row.terms.lines[1].encashment_source_id;
    await expect(
      f.repo.actOnLifecycleCase(
        encashmentActor(),
        {
          action: "save",
          company_id: f.companyId,
          id: f.statement.id,
          expected_version: row.version,
          terms: row.terms,
          reason: "Attempt to detach a policy-generated entitlement",
        },
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 409 });
    const other = await f.action({
      action: "create_rule",
      company_id: f.companyId,
      terms: {
        ...f.ruleTerms,
        minimum_service_days: 3650,
        effective_from: f.today.slice(0, 4) + "-01-01",
        effective_to: f.today.slice(0, 4) + "-01-02",
      },
      reason: "Reviewed service eligibility for another contractual period",
    });
    const preview = (await f.preview(other.id)).preview!;
    expect(preview.blockers).toContain("The employee has not reached the rule’s minimum service days.");
    expect(preview.blockers).toContain("The rule does not cover the approved exit date.");
  });
  it("carries generated leave entitlement and its consumed days through Payroll into actual Finance posting", async () => {
    let e: Awaited<ReturnType<typeof createEncashmentFixture>>;
    const prod = await createProductionJournalFixture(
      pool,
      async (base) => {
        await expect(e!.posting("1", "adjustment")).rejects.toMatchObject({ status: 409 });
        await e.decide("submit_rule");
        await e.decide("approve_rule", "r06.checker");
        await e.add();
        await e.caseAction("submit");
        await e.caseAction("approve", "r06.checker");
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
        const actor = lifecycleActor("r06.maker", [...encashmentPermissions, ...runPermissions]);
        await e.repo.actOnLifecycleCase(
          actor,
          {
            action: "prepare_payroll",
            company_id: base.companyId,
            id: e.statement.id,
            expected_version: 4,
            month: base.month,
            unprocessed_entitlements_only: true,
            mappings: [
              { line_index: 0, component_id: null, exclusion_reason: "Reviewed zero-value reference only" },
              { line_index: 1, component_id: base.component.id, exclusion_reason: "" },
            ],
            reason: "Approved leave entitlement routed through governed Payroll",
          },
          randomUUID(),
          "test",
        );
        const id = (
          await pool.query(
            "select adjustment_id from hr_settlement_payroll_link where tenant_id=$1 and case_id=$2 and line_index=1",
            [tenant, e.statement.id],
          )
        ).rows[0].adjustment_id;
        for (const action of ["submit", "approve"] as const) {
          const who = action === "approve" ? "r06.checker" : "r06.maker",
            w = await e.repo.getPayrollWorkspace(runActor(who), {
              company_id: base.companyId,
              month: base.month,
              section: "adjustments",
              search: "",
              limit: 25,
              offset: 0,
            }),
            row = w.items.find((r) => r.id === id)!;
          await e.repo.actOnPayrollRecord(
            runActor(who),
            id,
            {
              company_id: base.companyId,
              section: "adjustments",
              action,
              expected_version: row.version,
              source_hash: row.source_hash,
              confirm_override: false,
              reason: "Independent generated leave entitlement Payroll decision",
            },
            randomUUID(),
            "test",
          );
        }
      },
      async (base) => {
        e = await createEncashmentFixture(pool, { fixture: base, person: base.person });
      },
    );
    fixtures.push(e!);
    await prod.journalAction("prepare");
    await prod.journalAction("accept", "r06.checker");
    await prod.journalAction("post", "r06.target");
    const w = await e!.repo.getLifecycleCaseWorkspace(
        lifecycleActor("r06.maker", [...encashmentPermissions, ...runPermissions]),
        { company_id: prod.companyId, section: "settlement", search: "", limit: 25, offset: 0 },
      ),
      link = w.items[0]!.payroll_links.find((l) => l.line_index === 1)!;
    expect(link).toMatchObject({ state: "consumed", period_state: "posted", finance_state: "posted" });
    expect(link.journal_id).toBeTruthy();
    expect((await e!.balance()).encashed).toBe("10.2500");
    expect(
      (
        await pool.query(
          "select amount::text from hr_payroll_result_item where tenant_id=$1 and result_id=$2 and source=$3",
          [tenant, link.result_id, "adjustment:" + link.adjustment_id],
        )
      ).rows,
    ).toEqual([{ amount: "1025.1000" }]);
  }, 120000);
});
