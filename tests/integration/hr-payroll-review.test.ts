import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import {
  createHrPayrollRecordSchema,
  hrPayrollRunComparisonQuerySchema,
  hrPayrollRunComparisonSchema,
  type HrPayrollRunAction,
} from "../../packages/contracts/src/hr/index.js";
import { createPayrollRunFixture, runActor, runPermissions } from "./hr-payroll-run-fixture.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Payroll return, correction and immutable review comparison", () => {
  let pool: DatabasePool, repo: SourceHrRepository;
  const fixtures: Awaited<ReturnType<typeof createPayrollRunFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture() {
    const f = await createPayrollRunFixture(pool);
    fixtures.push(f);
    await f.act("policy", {
      currency_code: "PKR",
      money_scale: 2,
      rounding_mode: "half_up",
      net_payable_account_id: f.liability,
    });
    const s = await repo.getPayrollRunWorkspace(runActor(), f.query);
    await f.act("open", { policy_id: s.policies[0]!.id });
    return f;
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function compare(f: Fixture, extra: Record<string, unknown> = {}, actor = runActor()) {
    const s = await repo.getPayrollRunWorkspace(runActor(), f.query);
    const r = await repo.getPayrollRunComparison(
      actor,
      hrPayrollRunComparisonQuerySchema.parse({ ...f.query, expected_run_number: s.period!.run_number, ...extra }),
    );
    return hrPayrollRunComparisonSchema.parse(r);
  }
  async function adjustment(f: Fixture, amount: string) {
    return repo.createPayrollRecord(
      runActor(),
      createHrPayrollRecordSchema.parse({
        kind: "adjustment",
        company_id: f.companyId,
        employee_id: f.person.employeeId,
        component_id: f.component.id,
        effective_month: f.month,
        amount,
        reason: "Governed correction to an independently returned Payroll run",
      }),
      randomUUID(),
      "review-test",
    );
  }
  async function approveAdjustment(f: Fixture, id: string) {
    for (const action of ["submit", "approve"] as const) {
      const row = (
        await repo.getPayrollWorkspace(runActor(), {
          ...f.query,
          section: "adjustments",
          search: "",
          limit: 25,
          offset: 0,
        })
      ).items.find((r) => r.id === id)!;
      await repo.actOnPayrollRecord(
        runActor(action === "approve" ? "r06.checker" : "r06.maker"),
        id,
        {
          company_id: f.companyId,
          section: "adjustments",
          action,
          expected_version: row.version,
          source_hash: row.source_hash,
          confirm_override: false,
          reason: "Independently reviewed returned Payroll input correction",
        },
        randomUUID(),
        "review-test",
      );
    }
  }
  async function returnRun(f: Fixture) {
    await f.act("submit");
    await f.act("return", {}, "r06.checker");
  }
  it("reopens only an independently returned unapproved period and requires a new calculation before resubmission", async () => {
    const f = await fixture();
    await f.act("calculate");
    const original = (await repo.getPayrollRunWorkspace(runActor(), f.query)).employees[0]!;
    await expect(adjustment(f, "12.3456")).rejects.toMatchObject({ status: 409 });
    await f.act("submit");
    await expect(f.act("return")).rejects.toMatchObject({ status: 403 });
    await f.act("return", {}, "r06.checker");
    let state = await repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.period).toMatchObject({ state: "open", run_number: 1, review_hash: null });
    expect(state.allowed_actions).toContain("calculate");
    expect(state.allowed_actions).not.toContain("submit");
    expect(state.employees[0]!.id).toBe(original.id);
    await expect(f.act("submit")).rejects.toMatchObject({ status: 409 });
    const input = await adjustment(f, "12.3456");
    await expect(f.act("calculate")).rejects.toMatchObject({ status: 409 });
    await approveAdjustment(f, input.id);
    await f.act("calculate");
    state = await repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.period).toMatchObject({ state: "calculated", run_number: 2 });
    expect(state.employees[0]!.net).toBe("31012.3500");
    const compared = await compare(f);
    expect(compared.counts.amount_changed).toBe(1);
    expect(compared.items[0]).toMatchObject({
      change: "amount_changed",
      before: { id: original.id, net: "31000.0000" },
      after: { net: "31012.3500" },
      delta: { net: "12.3500" },
    });
    expect(compared.delta.net).toBe("12.3500");
    await f.act("submit");
    const saved = (
      await pool.query("select net::text,calculation_hash from hr_payroll_result where tenant_id=$1 and id=$2", [
        tenant,
        original.id,
      ])
    ).rows[0];
    expect(saved).toMatchObject({ net: "31000.0000", calculation_hash: original.calculation_hash });
    expect(
      (
        await pool.query("select state,consumed_result_id from hr_payroll_adjustment where tenant_id=$1 and id=$2", [
          tenant,
          input.id,
        ])
      ).rows[0],
    ).toMatchObject({ state: "approved", consumed_result_id: null });
  });
  it("classifies an identical recalculation as unchanged and preserves both result identities", async () => {
    const f = await fixture();
    await f.act("calculate");
    await f.act("calculate");
    const r = await compare(f, { filter: "all" });
    expect(r.counts).toEqual({ amount_changed: 0, evidence_changed: 0, added: 0, removed: 0, unchanged: 1 });
    expect(r.items[0]!.before!.id).not.toBe(r.items[0]!.after!.id);
    expect(r.items[0]!.change).toBe("unchanged");
    expect(r.delta.net).toBe("0.0000");
    expect((await compare(f)).items).toEqual([]);
  });
  it("shows changed evidence even when currency rounding leaves pay amounts unchanged", async () => {
    const f = await fixture();
    await f.act("calculate");
    await returnRun(f);
    const a = await adjustment(f, "0.004");
    await approveAdjustment(f, a.id);
    await f.act("calculate");
    const r = await compare(f);
    expect(r.items[0]).toMatchObject({
      change: "evidence_changed",
      evidence_changed: true,
      attendance_changed: false,
      delta: { net: "0.0000" },
    });
    expect(r.counts.evidence_changed).toBe(1);
    expect(r.counts.amount_changed).toBe(0);
  });
  it("keeps large fractional differences exact without browser or floating-point accounting", async () => {
    const f = await fixture();
    await f.act("calculate");
    await returnRun(f);
    const a = await adjustment(f, "9007199254740.1234");
    await approveAdjustment(f, a.id);
    await f.act("calculate");
    const r = await compare(f);
    expect(r.delta.net).toBe("9007199254740.1200");
    expect(r.current_totals.net).toBe("9007199285740.1200");
  });
  it("compares any earlier retained revision and returns bounded deterministic filtered pages", async () => {
    const f = await fixture();
    await f.act("calculate");
    await f.act("calculate");
    await f.act("calculate");
    const r = await compare(f, { baseline_run_number: 1, filter: "all", limit: 1 });
    expect(r.baseline_run_number).toBe(1);
    expect(r.runs.map((x) => x.run_number)).toEqual([3, 2, 1]);
    expect(r.total).toBe(1);
    expect(r.items).toHaveLength(1);
    const beyond = await compare(f, { baseline_run_number: 1, filter: "unchanged", limit: 1, offset: 1 });
    expect(beyond.total).toBe(1);
    expect(beyond.items).toEqual([]);
    expect(beyond.current_totals).toEqual(r.current_totals);
  });
  it("identifies the first calculation without inventing an earlier baseline", async () => {
    const f = await fixture();
    await f.act("calculate");
    const r = await compare(f);
    expect(r.baseline_run_number).toBeNull();
    expect(r.baseline_totals).toBeNull();
    expect(r.counts.added).toBe(1);
  });
  it("rejects stale, current, future and nonexistent baseline selections", async () => {
    const f = await fixture();
    await f.act("calculate");
    await f.act("calculate");
    await expect(compare(f, { expected_run_number: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(compare(f, { baseline_run_number: 2 })).rejects.toMatchObject({ status: 409 });
    await expect(compare(f, { baseline_run_number: 999 })).rejects.toMatchObject({ status: 409 });
  });
  it("requires current result authority and explicit access to the requested company", async () => {
    const f = await fixture();
    await f.act("calculate");
    await expect(compare(f, {}, runActor("r06.maker", ["hr.payroll.period.read"]))).rejects.toMatchObject({
      status: 403,
    });
    await expect(compare(f, {}, runActor("r06.restricted"))).rejects.toMatchObject({ status: 403 });
    await expect(compare(f, { company_id: "another-company" })).rejects.toMatchObject({ status: 403 });
    await expect(compare(f, {}, { ...runActor(), tenantId: "other-tenant" })).rejects.toMatchObject({ status: 403 });
  });
  it("rechecks normalized company grants for historical wages and return replays", async () => {
    const f = await fixture();
    await f.act("calculate");
    await f.act("submit");
    const current = await repo.getPayrollRunWorkspace(runActor(), f.query),
      key = randomUUID();
    const command: HrPayrollRunAction = {
      ...f.query,
      action: "return",
      reason: "Current scoped independent Payroll return",
      expected_version: current.period!.version,
      source_hash: current.source_hash,
      confirm_override: false,
    };
    await repo.actOnPayrollRun(runActor("r06.checker"), command, key, "review-test");
    expect((await repo.actOnPayrollRun(runActor("r06.checker"), command, key, "review-test")).replayed).toBe(true);
    const removed = (
      await pool.query(
        "delete from security_role_scope_grant g where tenant_id=$1 and permission_key='hr.payroll.period.approve' and role_policy_id in(select role_policy_id from security_user_role_assignment_version where tenant_id=$1 and user_id='r06.checker') returning role_policy_id,scope_kind,scope_value",
        [tenant],
      )
    ).rows;
    try {
      await expect(repo.actOnPayrollRun(runActor("r06.checker"), command, key, "review-test")).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      for (const row of removed)
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)values($1,$2,'hr.payroll.period.approve',$3,$4)on conflict do nothing",
          [tenant, row.role_policy_id, row.scope_kind, row.scope_value],
        );
    }
    const grants = (
      await pool.query(
        "delete from security_role_scope_grant where tenant_id=$1 and permission_key='hr.payroll.result.read' and role_policy_id in(select role_policy_id from security_user_role_assignment_version where tenant_id=$1 and user_id='r06.checker') returning role_policy_id,scope_kind,scope_value",
        [tenant],
      )
    ).rows;
    try {
      await expect(compare(f, {}, runActor("r06.checker"))).rejects.toMatchObject({ status: 403 });
    } finally {
      for (const row of grants)
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)values($1,$2,'hr.payroll.result.read',$3,$4)on conflict do nothing",
          [tenant, row.role_policy_id, row.scope_kind, row.scope_value],
        );
    }
  });
  it("does not offer maker submission to other actors or an unprivileged self-review action", async () => {
    const f = await fixture();
    await f.act("calculate");
    expect((await repo.getPayrollRunWorkspace(runActor("r06.checker"), f.query)).allowed_actions).not.toContain(
      "submit",
    );
    await f.act("submit");
    let s = await repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(s.review_access).toBe("forbidden");
    expect(s.allowed_actions).not.toContain("return");
    expect(s.allowed_actions).not.toContain("approve");
    s = await repo.getPayrollRunWorkspace(runActor("r06.checker"), f.query);
    expect(s.review_access).toBe("independent");
    expect(s.allowed_actions).toContain("return");
    const override = {
      ...runActor("r06.maker", [...runPermissions, "platform.approval.override"]),
      actor: {
        ...runActor().actor,
        permissions: [...runPermissions, "platform.approval.override"],
        roles: ["super_administrator"],
      },
    };
    expect((await repo.getPayrollRunWorkspace(override, f.query)).review_access).toBe("override_required");
  });
  it("preserves the complete inherited paid-state and Finance proposal guards", async () => {
    const source = await readFile(
      new URL("../../packages/db/source-migrations/hr/0073_governed_payroll_settlement.forward.sql", import.meta.url),
      "utf8",
    );
    const installed = (
      await pool.query("select pg_get_functiondef('protect_governed_payroll_period()'::regprocedure) as definition")
    ).rows[0].definition as string;
    const paidStart = source.indexOf("IF OLD.workflow_managed AND OLD.state='posted' AND NEW.state='paid' THEN"),
      financeStart = source.indexOf("IF OLD.workflow_managed AND ((OLD.state='approved'", paidStart);
    const normalStart = source.indexOf("IF OLD.workflow_managed THEN", financeStart);
    expect(paidStart).toBeGreaterThan(0);
    expect(financeStart).toBeGreaterThan(paidStart);
    expect(normalStart).toBeGreaterThan(financeStart);
    expect(installed).toContain(source.slice(paidStart, financeStart).trim());
    expect(installed).toContain(source.slice(financeStart, normalStart).trim());
    expect(installed).toContain("OLD.state='under_review' AND NEW.state='open'");
  });
  it("rejects a database-only reopen without the matching immutable return event", async () => {
    const f = await fixture();
    await f.act("calculate");
    await f.act("submit");
    await expect(
      pool.query(
        "update hr_payroll_period set state='open',version=version+1,reviewed_by='r06.checker',reviewed_at=now(),review_hash=null where tenant_id=$1 and company_id=$2",
        [tenant, f.companyId],
      ),
    ).rejects.toThrow("matching immutable review event");
    expect((await repo.getPayrollRunWorkspace(runActor(), f.query)).period!.state).toBe("under_review");
    await expect(
      pool.query(
        "update hr_payroll_period set state='open',version=version+1,reviewed_by='r06.checker',reviewed_at=now(),review_hash=null,run_number=run_number+1 where tenant_id=$1 and company_id=$2",
        [tenant, f.companyId],
      ),
    ).rejects.toThrow("preserve the run");
  });
});
