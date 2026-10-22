import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createLifecycleFixture, lifecycleActor, lifecyclePermissions } from "./hr-lifecycle-case-fixture.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { runActor, runPermissions } from "./hr-payroll-run-fixture.js";
import { journalActor } from "./hr-payroll-journal-fixture.js";
import {
  hrLifecycleCaseActionSchema,
  hrLifecycleCaseWorkspaceSchema,
  type HrLifecycleCaseAction,
} from "../../packages/contracts/src/hr/index.js";
import { settlementPayrollDecimal } from "../../server/api/src/modules/hr/settlement-payroll.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const permissions = [...new Set([...lifecyclePermissions, ...runPermissions])];
const actor = (who = "r06.maker") => lifecycleActor(who, permissions);
(url ? describe : describe.skip)("Settlement Payroll source handoff", () => {
  let pool: DatabasePool;
  const fixtures: { dispose: () => Promise<unknown> }[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function grants(company: string) {
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
          [tenant, policy, key, company],
        );
      }
  }
  async function statement(f: Awaited<ReturnType<typeof createLifecycleFixture>>) {
    await grants(f.companyId);
    const exit = await f.save({
      kind: "resignation",
      relationship_id: f.relationshipId,
      last_working_date: f.today,
      notice_reference: "notice-reviewed-reference",
      summary: "Independently reviewed employee exit",
    });
    await f.act(exit.id, "submit");
    await f.act(exit.id, "approve", "r06.checker");
    const settlement = await f.save({
      kind: "settlement",
      exit_case_id: exit.id,
      currency: "PKR",
      notes: "Reviewed new unpaid contractual entitlement and historical reference",
      lines: [
        {
          direction: "earning",
          description: "New contractual entitlement",
          amount_minor: "12345",
          calculation: { quantity: "1.5", rate_minor: "8230", rounding: "half_up" },
          source_reference: "signed-new-entitlement-001",
        },
        {
          direction: "earning",
          description: "Salary already processed reference",
          amount_minor: "3100000",
          source_reference: "previous-payroll-reference-001",
        },
      ],
    });
    await f.act(settlement.id, "submit");
    await f.act(settlement.id, "approve", "r06.checker");
    return settlement;
  }
  async function fixture() {
    const f = await createLifecycleFixture(pool);
    fixtures.push(f);
    const expense = "settlement-exp-" + randomUUID(),
      liability = "settlement-lia-" + randomUUID(),
      component = "settlement-comp-" + randomUUID();
    await pool.query(
      "insert into account(id,tenant_id,company_id,code,name,type,status,created_at) values($1,$3,$4,'SETEXP','Settlement expense','expense','active',now()),($2,$3,$4,'SETLIA','Settlement payable','liability','active',now())",
      [expense, liability, tenant, f.companyId],
    );
    await pool.query(
      "insert into hr_pay_component(id,tenant_id,company_id,code,name,kind,method,expense_account_id,created_by) values($1,$2,$3,'SETTLE','Settlement entitlement','earning','fixed',$4,'r06.maker')",
      [component, tenant, f.companyId, expense],
    );
    await pool.query(
      "insert into hr_payroll_policy(id,tenant_id,company_id,currency_code,money_scale,net_payable_account_id,created_by) values($1,$2,$3,'PKR',2,$4,'r06.maker')",
      [randomUUID(), tenant, f.companyId, liability],
    );
    const saved = await statement(f);
    return { ...f, component, saved };
  }
  function input(f: {
    companyId: string;
    today: string;
    component: string;
    saved: { id: string };
  }): Extract<HrLifecycleCaseAction, { action: "prepare_payroll" }> {
    return {
      action: "prepare_payroll",
      company_id: f.companyId,
      id: f.saved.id,
      expected_version: 3,
      month: f.today.slice(0, 7) + "-01",
      unprocessed_entitlements_only: true,
      mappings: [
        { line_index: 0, component_id: f.component, exclusion_reason: "" },
        {
          line_index: 1,
          component_id: null,
          exclusion_reason: "Already processed in earlier salary; retain for reference only",
        },
      ],
      reason: "Reviewed new unpaid contractual entitlement and excluded prior salary",
    };
  }
  const prepare = (f: Awaited<ReturnType<typeof fixture>>, value = input(f), key = randomUUID(), who = "r06.maker") =>
    f.repo.actOnLifecycleCase(actor(who), value, key, "settlement-payroll-test");
  it("converts exact minor units at 0–4 precision without floating point", () => {
    expect(settlementPayrollDecimal("12345", 2)).toBe("123.45");
    expect(settlementPayrollDecimal("1", 4)).toBe("0.0001");
    expect(settlementPayrollDecimal("999999999999999", 0)).toBe("999999999999999");
    expect(() => settlementPayrollDecimal("1.2", 2)).toThrow();
  });
  it("creates exact draft inputs and documented exclusions, preserves approval, and safely replays", async () => {
    const f = await fixture(),
      key = randomUUID(),
      source = (await pool.query("select * from hr_lifecycle_case where tenant_id=$1 and id=$2", [tenant, f.saved.id]))
        .rows[0];
    const result = await prepare(f, input(f), key);
    expect(result.status).toBe("payroll_inputs_prepared");
    expect((await prepare(f, input(f), key)).replayed).toBe(true);
    const w = hrLifecycleCaseWorkspaceSchema.parse(
      await f.repo.getLifecycleCaseWorkspace(actor(), {
        company_id: f.companyId,
        section: "settlement",
        search: "",
        limit: 25,
        offset: 0,
      }),
    );
    expect(w.items[0]!.payroll_links.map((l) => l.state)).toEqual(["draft", "excluded"]);
    const id = w.items[0]!.payroll_links[0]!.adjustment_id!;
    expect(
      (
        await pool.query(
          "select amount::text,state,workflow_managed from hr_payroll_adjustment where tenant_id=$1 and id=$2",
          [tenant, id],
        )
      ).rows[0],
    ).toMatchObject({ amount: "123.4500", state: "draft", workflow_managed: true });
    expect(
      (await pool.query("select * from hr_lifecycle_case where tenant_id=$1 and id=$2", [tenant, f.saved.id])).rows[0],
    ).toEqual(source);
    await expect(prepare(f)).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await pool.query("select count(*)::int n from hr_payroll_adjustment where tenant_id=$1 and company_id=$2", [
          tenant,
          f.companyId,
        ])
      ).rows[0].n,
    ).toBe(1);
    await expect(
      pool.query(
        "update hr_settlement_payroll_link set reason='overwrite audited source' where tenant_id=$1 and case_id=$2",
        [tenant, f.saved.id],
      ),
    ).rejects.toThrow();
  });
  it("rejects incomplete mapping, wrong direction/company/currency and stale versions atomically", async () => {
    const f = await fixture();
    await expect(prepare(f, { ...input(f), mappings: input(f).mappings.slice(0, 1) })).rejects.toMatchObject({
      status: 409,
    });
    await expect(prepare(f, { ...input(f), expected_version: 2 })).rejects.toMatchObject({ status: 409 });
    await expect(
      prepare(f, {
        ...input(f),
        mappings: input(f).mappings.map((m) =>
          m.line_index === 0 ? { ...m, component_id: "other-company-component" } : m,
        ),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await pool.query(
      "update hr_pay_component set kind='deduction',expense_account_id=null,liability_account_id=$3 where tenant_id=$1 and id=$2",
      [
        tenant,
        f.component,
        (
          await pool.query("select id from account where tenant_id=$1 and company_id=$2 and type='liability'", [
            tenant,
            f.companyId,
          ])
        ).rows[0].id,
      ],
    );
    await expect(prepare(f)).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await pool.query("select count(*)::int n from hr_settlement_payroll_link where tenant_id=$1 and case_id=$2", [
          tenant,
          f.saved.id,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("rechecks current grants before idempotent replay, rejects impersonation and scopes reads", async () => {
    const f = await fixture(),
      key = randomUUID();
    await prepare(f, input(f), key);
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-maker' and permission_key='hr.payroll.adjustment.manage' and scope_value=$2",
      [tenant, f.companyId],
    );
    await expect(prepare(f, input(f), key)).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.actOnLifecycleCase({ ...actor(), impersonationRequestId: "impersonated" }, input(f), randomUUID(), "test"),
    ).rejects.toMatchObject({ status: 403 });
    const w = await f.repo.getLifecycleCaseWorkspace(lifecycleActor(), {
      company_id: f.companyId,
      section: "settlement",
      search: "",
      limit: 25,
      offset: 0,
    });
    expect(w.items[0]!.payroll_links).toEqual([]);
    expect(w.payroll_components).toEqual([]);
  });
  it("reissues only rejected inputs, retains immutable predecessors and blocks author Payroll approval", async () => {
    const f = await fixture();
    await prepare(f);
    const first = (
      await pool.query(
        "select adjustment_id from hr_settlement_payroll_link where tenant_id=$1 and case_id=$2 and adjustment_id is not null",
        [tenant, f.saved.id],
      )
    ).rows[0].adjustment_id;
    async function act(id: string, action: "submit" | "reject" | "approve", who = "r06.maker") {
      const w = await f.repo.getPayrollWorkspace(actor(who), {
          company_id: f.companyId,
          month: input(f).month,
          section: "adjustments",
          search: "",
          limit: 25,
          offset: 0,
        }),
        row = w.items.find((r) => r.id === id)!;
      return f.repo.actOnPayrollRecord(
        actor(who),
        id,
        {
          company_id: f.companyId,
          section: "adjustments",
          action,
          expected_version: row.version,
          source_hash: row.source_hash,
          confirm_override: false,
          reason: "Independent Payroll input decision",
        },
        randomUUID(),
        "test",
      );
    }
    await act(first, "submit");
    await act(first, "reject", "r06.checker");
    await prepare(f);
    const rows = (
      await pool.query(
        "select adjustment_id,revision from hr_settlement_payroll_link where tenant_id=$1 and case_id=$2 and line_index=0 order by revision",
        [tenant, f.saved.id],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.adjustment_id).toBe(first);
    await act(rows[1]!.adjustment_id, "submit");
    await expect(act(rows[1]!.adjustment_id, "approve", "r06.maker")).rejects.toMatchObject({ status: 403 });
    await expect(
      pool.query(
        "update hr_payroll_adjustment set state='approved',version=version+1,approved_by='r06.maker',approved_at=now() where tenant_id=$1 and id=$2",
        [tenant, rows[1]!.adjustment_id],
      ),
    ).rejects.toThrow();
  });
  it("serializes competing preparations and validates the public strict contract", async () => {
    const f = await fixture(),
      results = await Promise.allSettled([prepare(f), prepare(f)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(hrLifecycleCaseActionSchema.safeParse({ ...input(f), unprocessed_entitlements_only: false }).success).toBe(
      false,
    );
    expect(hrLifecycleCaseActionSchema.safeParse({ ...input(f), amount: "999" }).success).toBe(false);
  });
  it("carries the linked entitlement through independent Payroll approval to a real Finance journal without Banking", async () => {
    let life: Awaited<ReturnType<typeof createLifecycleFixture>>, saved: { id: string };
    const prod = await createProductionJournalFixture(pool, async (base) => {
      life = await createLifecycleFixture(pool, false, { fixture: base, person: base.person });
      saved = await statement(life);
      const f = { ...life, component: base.component.id, saved };
      await prepare(f);
      const id = (
        await pool.query(
          "select adjustment_id from hr_settlement_payroll_link where tenant_id=$1 and case_id=$2 and line_index=0",
          [tenant, saved.id],
        )
      ).rows[0].adjustment_id;
      for (const action of ["submit", "approve"] as const) {
        const who = action === "approve" ? "r06.checker" : "r06.maker";
        const w = await base.repo.getPayrollWorkspace(runActor(who), {
            company_id: base.companyId,
            month: base.month,
            section: "adjustments",
            search: "",
            limit: 25,
            offset: 0,
          }),
          row = w.items.find((r) => r.id === id)!;
        await base.repo.actOnPayrollRecord(
          runActor(who),
          id,
          {
            company_id: base.companyId,
            section: "adjustments",
            action,
            expected_version: row.version,
            source_hash: row.source_hash,
            confirm_override: false,
            reason: "Independent settlement Payroll inclusion",
          },
          randomUUID(),
          "test",
        );
      }
    });
    fixtures.push(prod);
    await prod.journalAction("prepare");
    await prod.journalAction("accept", "r06.checker");
    await prod.journalAction("post", "r06.target");
    const w = await life!.repo.getLifecycleCaseWorkspace(actor(), {
        company_id: prod.companyId,
        section: "settlement",
        search: "",
        limit: 25,
        offset: 0,
      }),
      link = w.items[0]!.payroll_links[0]!;
    expect(link.state).toBe("consumed");
    expect(link.period_state).toBe("posted");
    expect(link.result_id).toBeTruthy();
    expect(link.journal_id).toBeTruthy();
    expect(
      (
        await pool.query(
          "select amount::text from hr_payroll_result_item where tenant_id=$1 and result_id=$2 and source=$3",
          [tenant, link.result_id, "adjustment:" + link.adjustment_id],
        )
      ).rows,
    ).toEqual([{ amount: "123.4500" }]);
    expect(
      (await prod.repo.getPayrollJournalWorkspace(journalActor(), { company_id: prod.companyId, month: prod.month }))
        .proposal?.external_journal_id,
    ).toBe(link.journal_id);
  }, 120000);
});
