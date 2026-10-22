import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createPerformanceFixture, performanceActor } from "./hr-performance-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;
run("Connected company Performance lifecycle", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createPerformanceFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture() {
    const f = await createPerformanceFixture(pool);
    fixtures.push(f);
    return f;
  }
  async function ready() {
    const f = await fixture();
    await f.act(f.cycle.id, "activate");
    const g = await f.goal();
    await f.act(g.id, "approve_goal", "r06.checker");
    return { ...f, g };
  }
  it("connects cycle, approved goals, exact review, independent publication, outcome and completed cycle without Payroll changes", async () => {
    const f = await ready(),
      review = await f.review();
    expect((await f.read("reviews")).items[0]?.evidence.score).toBe("4.0000");
    await f.act(review.id, "submit_review");
    await f.act(review.id, "publish_review", "r06.checker");
    const outcome = await f.outcome(review.id);
    await f.act(outcome.id, "submit_outcome");
    await f.act(outcome.id, "approve_outcome", "r06.checker");
    await f.act(outcome.id, "complete_outcome");
    await f.act(f.cycle.id, "close_cycle");
    expect((await f.read("cycles")).cycle?.state).toBe("closed");
    expect((await f.read("outcomes")).items[0]?.state).toBe("closed");
    expect((await f.read("reviews")).items[0]?.state).toBe("published");
    expect(
      (await pool.query("select 1 from hr_payroll_period where tenant_id=$1 and company_id=$2", [tenant, f.companyId]))
        .rowCount,
    ).toBe(0);
    expect((await f.read("cycles")).history.map((h) => h.action)).toContain("publish_review");
  });
  it("blocks inactive cycles, overweight goals and reviews with partial or unapproved goals", async () => {
    const f = await fixture();
    await expect(f.goal()).rejects.toMatchObject({ status: 409 });
    await f.act(f.cycle.id, "activate");
    const g = await f.goal(6000);
    await expect(f.goal(5000, "Second goal")).rejects.toMatchObject({ status: 409 });
    await expect(f.review()).rejects.toMatchObject({ status: 409 });
    await f.act(g.id, "approve_goal", "r06.checker");
    await expect(f.review()).rejects.toMatchObject({ status: 409 });
  });
  it("requires independent goal and review decisions, and freezes goals after review submission", async () => {
    const f = await fixture();
    await f.act(f.cycle.id, "activate");
    const g = await f.goal();
    await expect(f.act(g.id, "approve_goal")).rejects.toMatchObject({ status: 403 });
    await f.act(g.id, "approve_goal", "r06.checker");
    const r = await f.review();
    await f.act(r.id, "submit_review");
    await expect(f.act(r.id, "publish_review")).rejects.toMatchObject({ status: 403 });
    await expect(f.act(g.id, "revise_goal")).rejects.toMatchObject({ status: 409 });
    await f.act(r.id, "publish_review", "r06.checker");
  });
  it("reopens a goal with history and blocks stale review evidence until resaved", async () => {
    const f = await ready(),
      r = await f.review();
    await f.act(f.g.id, "revise_goal");
    const g = (await f.read("goals")).items[0]!;
    expect(g.state).toBe("draft");
    await f.save(
      { ...g.terms, ...(g.terms.kind === "goal" ? { target: "Revised target supported by new evidence" } : {}) },
      "r06.maker",
      g,
    );
    await f.act(g.id, "approve_goal", "r06.checker");
    await expect(f.act(r.id, "submit_review")).rejects.toMatchObject({ status: 409 });
    const current = (await f.read("reviews")).items[0]!;
    await f.review("r06.maker", current);
    await f.act(r.id, "submit_review");
  });
  it("rejects cross-company employees, source reparenting and closing unfinished follow-ups", async () => {
    const a = await ready(),
      b = await fixture();
    await b.act(b.cycle.id, "activate");
    await expect(
      b.save({
        kind: "goal",
        cycle_id: b.cycle.id,
        employee_id: a.person.employeeId,
        title: "Wrong company target",
        measure: "Must never cross company",
        target: "Scoped employee",
        weight_bps: 10000,
        due_date: b.today,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(a.act(a.cycle.id, "close_cycle")).rejects.toMatchObject({ status: 409 });
    const r = await a.review();
    await a.act(r.id, "submit_review");
    await a.act(r.id, "publish_review", "r06.checker");
    await expect(a.act(a.cycle.id, "close_cycle")).rejects.toMatchObject({ status: 409 });
  });
  it("replays once, rejects stale edits and rechecks revoked company authority on replay", async () => {
    const f = await fixture(),
      input = {
        action: "activate" as const,
        company_id: f.companyId,
        record_id: f.cycle.id,
        expected_version: 1,
        reason: "Replay controlled cycle activation",
      },
      key = randomUUID();
    await f.repo.actOnPerformance(performanceActor(), input, key, "performance-test");
    expect(await f.repo.actOnPerformance(performanceActor(), input, key, "performance-test")).toMatchObject({
      replayed: true,
    });
    await expect(
      f.repo.actOnPerformance(performanceActor(), input, randomUUID(), "performance-test"),
    ).rejects.toMatchObject({ status: 409 });
    await pool.query(
      `delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-maker' and permission_key='hr.performance.manage' and scope_value=$2`,
      [tenant, f.companyId],
    );
    await expect(f.repo.actOnPerformance(performanceActor(), input, key, "performance-test")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("prevents published review mutation, source-score forgery and history deletion", async () => {
    const f = await ready(),
      r = await f.review();
    await expect(
      pool.query(
        `update hr_performance_record set state='submitted',version=version+1,submitted_by='r06.maker',evidence=jsonb_set(evidence,'{score}','"5.0000"') where tenant_id=$1 and id=$2`,
        [tenant, r.id],
      ),
    ).rejects.toThrow();
    await f.act(r.id, "submit_review");
    await f.act(r.id, "publish_review", "r06.checker");
    await expect(
      pool.query(
        `update hr_performance_record set terms=jsonb_set(terms,'{summary}','"rewritten"'),version=version+1 where tenant_id=$1 and id=$2`,
        [tenant, r.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query("delete from hr_performance_event where tenant_id=$1 and company_id=$2", [tenant, f.companyId]),
    ).rejects.toThrow();
  });
  it("serializes concurrent publication and requires independent approved outcomes", async () => {
    const f = await ready(),
      r = await f.review();
    await f.act(r.id, "submit_review");
    const input = {
        action: "publish_review" as const,
        company_id: f.companyId,
        record_id: r.id,
        expected_version: 2,
        reason: "Independent concurrent publication",
      },
      result = await Promise.allSettled(
        [1, 2].map(() =>
          f.repo.actOnPerformance(performanceActor("r06.checker"), input, randomUUID(), "performance-test"),
        ),
      );
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const o = await f.outcome(r.id);
    await f.act(o.id, "submit_outcome");
    await expect(f.act(o.id, "approve_outcome")).rejects.toMatchObject({ status: 403 });
    await expect(f.act(o.id, "complete_outcome")).rejects.toMatchObject({ status: 403 });
  });
  it("preserves administrator authorization parity and rejects foreign cycle/read scopes", async () => {
    const f = await fixture(),
      other = await fixture();
    const mismatch = await pool.query(
      `select 1 from security_role_policy p join security_tenant_role r on r.tenant_id=p.tenant_id and r.role_id=p.role_id where p.tenant_id=$1 and r.role_code='super_administrator' and p.status='active' and p.lifecycle_state='active' and p.permissions is distinct from coalesce((select jsonb_agg(g.permission_key order by g.permission_key) from security_role_permission_grant g join security_permission_definition d on d.permission_key=g.permission_key and d.status='active' where g.tenant_id=p.tenant_id and g.role_policy_id=p.id),'[]'::jsonb)`,
      [tenant],
    );
    expect(mismatch.rowCount).toBe(0);
    await expect(f.read("cycles", "r06.other")).rejects.toMatchObject({ status: 403 });
    await expect(f.read("cycles", "r06.maker", { cycle_id: other.cycle.id })).rejects.toMatchObject({ status: 404 });
  });
  it("allows future planning but does not submit a review before the cycle ends", async () => {
    const f = await fixture(),
      future = new Date(f.today + "T12:00:00Z");
    future.setUTCDate(future.getUTCDate() + 2);
    const end = future.toISOString().slice(0, 10);
    const c = await f.save({
      kind: "cycle",
      title: "Future cycle planning",
      description: "No premature publication",
      start_date: f.today,
      end_date: end,
      review_due_date: end,
    });
    await f.act(c.id, "activate");
    const g = await f.save({
      kind: "goal",
      cycle_id: c.id,
      employee_id: f.person.employeeId,
      title: "Future period goal",
      measure: "Reviewed delivery acceptance",
      target: "95 percent",
      weight_bps: 10000,
      due_date: end,
    });
    await f.act(g.id, "approve_goal", "r06.checker");
    const gs = (await f.read("reviews", "r06.maker", { cycle_id: c.id })).goal_sets[0]!;
    const r = await f.save({
      kind: "review",
      cycle_id: c.id,
      employee_id: f.person.employeeId,
      goals_hash: gs.source_hash,
      summary: "Prepared draft for future period",
      strengths: "Reliable collaboration",
      development: "Improve mentoring skills",
      ratings: [{ goal_id: g.id, rating: 3, evidence: "Draft evidence remains subject to period completion" }],
    });
    await expect(f.act(r.id, "submit_review")).rejects.toMatchObject({ status: 409 });
  });
});
