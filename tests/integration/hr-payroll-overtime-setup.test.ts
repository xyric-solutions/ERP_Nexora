import { randomUUID } from "node:crypto";
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { sourceTestTenantId as tenant, ensureSourceAuthorizationFixture } from "./source-security-fixture.js";
import { createGovernedOvertimeFixture } from "./hr-payroll-overtime-setup-fixture.js";
import { runActor, runPermissions } from "./hr-payroll-run-fixture.js";
import {
  hrOvertimeMoneyWorkspaceSchema,
  hrPayrollRunWorkspaceSchema,
} from "../../packages/contracts/src/hr/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;
run("Governed monetary overtime setup", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createGovernedOvertimeFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture() {
    const f = await createGovernedOvertimeFixture(pool);
    fixtures.push(f);
    return f;
  }
  async function configured(f: Awaited<ReturnType<typeof fixture>>) {
    const policy = await f.createPolicy();
    await f.release(policy.id);
    const arrangement = await f.createArrangement(policy.id);
    await f.decide(arrangement.id, "arrangement", "submit");
    await f.decide(arrangement.id, "arrangement", "approve", "r06.checker");
    return { policy, arrangement };
  }
  it("creates, reviews and releases policy and arrangement through real API services, then calculates published overtime", async () => {
    const f = await fixture(),
      { policy, arrangement } = await configured(f);
    const workspace = await f.repo.getOvertimeMoneyWorkspace(runActor(), f.moneyQuery("arrangement"));
    hrOvertimeMoneyWorkspaceSchema.parse(workspace);
    expect(workspace.options.policies.map((p) => p.id)).toContain(policy.id);
    expect((await f.record(arrangement.id, "arrangement")).status).toBe("approved");
    await f.calculate();
    const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    hrPayrollRunWorkspaceSchema.parse(state);
    expect(state.employees[0]!.net).toBe("31232.5000");
    expect(state.employees[0]!.lines.find((l) => l.overtime)?.overtime?.policy_version_id).toBe(policy.id);
    expect((await f.record(policy.id, "policy")).history.map((h) => h.action)).toEqual(
      expect.arrayContaining(["create", "submit", "approve", "release"]),
    );
  });
  it("requires independent policy approval and release and blocks skipped transitions", async () => {
    const f = await fixture(),
      p = await f.createPolicy();
    await expect(f.decide(p.id, "policy", "approve", "r06.checker")).rejects.toMatchObject({ status: 409 });
    await f.decide(p.id, "policy", "submit");
    await expect(f.decide(p.id, "policy", "approve")).rejects.toMatchObject({ status: 403 });
    await f.decide(p.id, "policy", "approve", "r06.checker");
    await expect(f.decide(p.id, "policy", "release")).rejects.toMatchObject({ status: 403 });
    await f.decide(p.id, "policy", "release", "r06.checker");
  });
  it("requires independent compensation approval for the employee arrangement", async () => {
    const f = await fixture(),
      p = await f.createPolicy();
    await f.release(p.id);
    const a = await f.createArrangement(p.id);
    await f.decide(a.id, "arrangement", "submit");
    await expect(f.decide(a.id, "arrangement", "approve")).rejects.toMatchObject({ status: 403 });
    await f.decide(a.id, "arrangement", "approve", "r06.checker");
    expect((await f.record(a.id, "arrangement")).version).toBe(3);
  });
  it("rejects a maker with manage permission but no policy approval permission", async () => {
    const f = await fixture(),
      p = await f.createPolicy();
    await f.decide(p.id, "policy", "submit");
    const row = await f.record(p.id, "policy");
    await expect(
      f.repo.decideOvertimeMoney(
        runActor(
          "r06.checker",
          runPermissions.filter((p) => p !== "hr.payroll.period.approve"),
        ),
        p.id,
        {
          company_id: f.companyId,
          kind: "policy",
          action: "approve",
          expected_version: row.version,
          source_hash: row.source_hash,
          reason: "Denied policy approval boundary",
          confirm_override: false,
        },
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("replays concurrent creation once without duplicating a policy", async () => {
    const f = await fixture(),
      key = randomUUID(),
      results = await Promise.all([f.createPolicy({}, key), f.createPolicy({}, key)]);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect(results[0]!.id).toBe(results[1]!.id);
  });
  it("rejects stale decision fingerprints and idempotency payload changes", async () => {
    const f = await fixture(),
      p = await f.createPolicy(),
      row = await f.record(p.id, "policy"),
      key = randomUUID(),
      input = {
        company_id: f.companyId,
        kind: "policy" as const,
        action: "submit" as const,
        expected_version: row.version,
        source_hash: row.source_hash,
        reason: "Reviewed source snapshot acceptance",
        confirm_override: false,
      };
    await f.repo.decideOvertimeMoney(runActor(), p.id, input, key, "test");
    await expect(f.repo.decideOvertimeMoney(runActor(), p.id, input, randomUUID(), "test")).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      f.repo.decideOvertimeMoney(runActor(), p.id, { ...input, reason: "Changed retry terms" }, key, "test"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("preserves submitted terms and allowed-component authority in PostgreSQL", async () => {
    const f = await fixture(),
      p = await f.createPolicy();
    await f.decide(p.id, "policy", "submit");
    await expect(
      pool.query(
        "update hr_ot_monetary_policy_version set effective_from=effective_from+1,workflow_version=workflow_version+1 where tenant_id=$1 and id=$2",
        [tenant, p.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query("update hr_ot_monetary_policy_option set multiplier=2 where tenant_id=$1 and policy_version_id=$2", [
        tenant,
        p.id,
      ]),
    ).rejects.toThrow();
    const option = (
      await pool.query("select id from hr_ot_monetary_policy_option where tenant_id=$1 and policy_version_id=$2", [
        tenant,
        p.id,
      ])
    ).rows[0].id;
    await expect(
      pool.query(
        "insert into hr_ot_monetary_option_component(id,tenant_id,company_id,option_id,component_id,position) values($1,$2,$3,$4,$5,2)",
        ["late-" + randomUUID(), tenant, f.companyId, option, f.component.id],
      ),
    ).rejects.toThrow();
  });
  it("rejects overlapping released policy ranges atomically", async () => {
    const f = await fixture(),
      p = await f.createPolicy();
    await f.release(p.id);
    const p2 = await f.createPolicy({ reference: "ANOTHER" });
    await f.decide(p2.id, "policy", "submit");
    await f.decide(p2.id, "policy", "approve", "r06.checker");
    await expect(f.decide(p2.id, "policy", "release", "r06.checker")).rejects.toMatchObject({ status: 409 });
    expect((await f.record(p2.id, "policy")).status).toBe("approved");
  });
  it("does not allow arrangements to reference foreign or unreleased policies", async () => {
    const f = await fixture(),
      other = await fixture(),
      p = await other.createPolicy();
    await other.release(p.id);
    await expect(f.createArrangement(p.id)).rejects.toMatchObject({ status: 409 });
    const own = await f.createPolicy();
    await expect(f.createArrangement(own.id)).rejects.toMatchObject({ status: 409 });
  });
  it("validates active company accounts, earning basis and Finance currency precision", async () => {
    const f = await fixture(),
      other = await fixture();
    await expect(f.createPolicy({ terms: { ...f.terms, money_scale: 3 } })).rejects.toMatchObject({ status: 409 });
    await expect(
      f.createPolicy({ terms: { ...f.terms, earning_component_id: other.component.id } }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects a direct rate on a selected-component policy and out-of-policy dates", async () => {
    const f = await fixture(),
      p = await f.createPolicy({ effective_to: f.month });
    await f.release(p.id);
    await expect(f.createArrangement(p.id, { direct_rate: "10", effective_to: f.month })).rejects.toMatchObject({
      status: 409,
    });
    await expect(f.createArrangement(p.id, { effective_to: null })).rejects.toMatchObject({ status: 409 });
  });
  it("keeps rejected policy authority out of employee choices", async () => {
    const f = await fixture(),
      p = await f.createPolicy();
    await f.decide(p.id, "policy", "submit");
    await f.decide(p.id, "policy", "reject", "r06.checker");
    const row = await f.record(p.id, "policy");
    expect(row.status).toBe("rejected");
    expect(row.allowed_actions).toEqual([]);
    expect((await f.repo.getOvertimeMoneyWorkspace(runActor(), f.moneyQuery("arrangement"))).options.policies).toEqual(
      [],
    );
  });
  it("blocks retroactive arrangement creation after a calculated Payroll period", async () => {
    const f = await fixture(),
      { policy } = await configured(f);
    await f.calculate();
    await expect(f.createArrangement(policy.id)).rejects.toMatchObject({ status: 409 });
  });
  it("requires company access and rejects impersonated creation", async () => {
    const f = await fixture();
    await expect(
      f.repo.getOvertimeMoneyWorkspace(runActor("r06.restricted"), f.moneyQuery("policy")),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.createOvertimeMoney(
        { ...runActor(), impersonationRequestId: "test-impersonation" },
        f.policyInput,
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("exposes only bounded company-filtered lists and maker-owned submission actions", async () => {
    const f = await fixture(),
      p = await f.createPolicy(),
      q = { ...f.moneyQuery("policy"), limit: 1, offset: 0 };
    hrOvertimeMoneyWorkspaceSchema.parse(await f.repo.getOvertimeMoneyWorkspace(runActor(), q));
    const checker = await f.repo.getOvertimeMoneyWorkspace(runActor("r06.checker"), q);
    expect(checker.items[0]!.allowed_actions).not.toContain("submit");
    expect(checker.items[0]!.id).toBe(p.id);
  });
  it("supports a governed direct contractual hourly arrangement through calculation", async () => {
    const f = await fixture(),
      p = await f.createPolicy({
        terms: {
          ...f.terms,
          basis_source: "direct_contractual_rate",
          rate_basis_method: "direct_hourly",
          component_ids: [],
          ordinary_hours: null,
        },
      });
    await f.release(p.id);
    const a = await f.createArrangement(p.id, { direct_rate: "250" });
    await f.decide(a.id, "arrangement", "submit");
    await f.decide(a.id, "arrangement", "approve", "r06.checker");
    await f.calculate();
    expect((await f.repo.getPayrollRunWorkspace(runActor(), f.query)).employees[0]!.net).toBe("31375.0000");
  });
});
