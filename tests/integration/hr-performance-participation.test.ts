import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createPerformanceFixture, performanceActor } from "./hr-performance-fixture.js";
import {
  hrPerformanceParticipationSchema,
  hrPerformanceParticipationActionSchema,
  type HrPerformanceParticipationAction,
} from "../../packages/contracts/src/hr/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Employee-owned Performance contributions", () => {
  let pool: DatabasePool;
  let f: Awaited<ReturnType<typeof createPerformanceFixture>>;
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    f = await createPerformanceFixture(pool);
  });
  afterAll(async () => {
    await f?.dispose();
    await pool?.end();
  });
  it("validates explicit self versus peer contribution contracts", () => {
    expect(
      hrPerformanceParticipationActionSchema.safeParse({
        action: "submit",
        company_id: "a",
        cycle_id: "c",
        id: "x",
        expected_version: 1,
        summary: "Reviewed evidence",
        goals_hash: "0".repeat(64),
        ratings: [{ goal_id: "g", rating: 6, evidence: "Evidence" }],
        reason: "Test reason",
      }).success,
    ).toBe(false);
  });
  it("enforces employee ownership, invited peer evidence, goal freezing, manager calibration, acknowledgement and idempotency", async () => {
    await f.act(f.cycle.id, "activate");
    const goal = await f.goal();
    await f.act(goal.id, "approve_goal", "r06.checker");
    const peer = await f.target(),
      ownUser = "perf-self-" + randomUUID(),
      peerUser = "perf-peer-" + randomUUID();
    for (const user of [ownUser, peerUser]) {
      await pool.query(
        "insert into security_user_account(id,tenant_id,identity_subject,email,status,mfa_state,created_at) values($1,$2,$1,$3,'active','disabled',now())",
        [user, tenant, user + "@example.test"],
      );
      await pool.query(
        "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','isolated-performance-participant')",
        [tenant, randomUUID(), user, f.companyId],
      );
    }
    // Bind fixture users once, with explicit isolated test identities and effective dates.
    for (const [user, employee] of [
      [ownUser, f.person.employeeId],
      [peerUser, peer.employeeId],
    ])
      await pool.query(
        "insert into employee_user_binding(id,tenant_id,user_id,employee_id,effective_from,reason,created_by) values($1,$2,$3,$4,current_date,'Isolated Performance ownership fixture','r06.last-admin-a')",
        ["performance-binding-" + randomUUID(), tenant, user, employee],
      );
    const common = { company_id: f.companyId, cycle_id: f.cycle.id };
    const action = (input: HrPerformanceParticipationAction, who = "r06.maker", key = randomUUID()) =>
      f.repo.actOnPerformanceParticipation(
        performanceActor(who, [ownUser, peerUser].includes(who) ? [] : undefined),
        input,
        key,
        "participation-test",
      );
    const read = async (mode: "mine" | "staff", who = "r06.maker") =>
      hrPerformanceParticipationSchema.parse(
        await f.repo.getPerformanceParticipation(
          performanceActor(who, [ownUser, peerUser].includes(who) ? [] : undefined),
          { ...common, mode },
        ),
      );
    await expect(
      action({
        ...common,
        action: "invite",
        employee_id: f.person.employeeId,
        contributor_employee_id: peer.employeeId,
        kind: "self",
        reason: "Invalid self assessment target",
      }),
    ).rejects.toMatchObject({ status: 409 });
    const own = await action({
      ...common,
      action: "invite",
      employee_id: f.person.employeeId,
      contributor_employee_id: f.person.employeeId,
      kind: "self",
      reason: "Request employee self appraisal",
    });
    const invitedPeer = await action({
      ...common,
      action: "invite",
      employee_id: f.person.employeeId,
      contributor_employee_id: peer.employeeId,
      kind: "peer",
      reason: "Request independent peer evidence",
    });
    await expect(read("staff", ownUser)).rejects.toMatchObject({ status: 403 });
    const mine = await read("mine", ownUser);
    expect(mine.items.map((i) => i.id)).toEqual([own.id]);
    expect(mine.items[0].can_submit).toBe(true);
    expect(
      (await f.repo.getPerformanceInbox(performanceActor(ownUser, []))).items.some((i) => i.cycle_id === f.cycle.id),
    ).toBe(true);
    const item = mine.items[0],
      submit: HrPerformanceParticipationAction = {
        ...common,
        action: "submit",
        id: own.id,
        expected_version: 1,
        summary: "My documented delivery and collaboration achievements",
        goals_hash: item.goals_hash,
        ratings: [{ goal_id: goal.id, rating: 4, evidence: "Accepted delivery evidence with customer signoff" }],
        reason: "Submit my own annual appraisal",
      };
    await expect(action(submit, "r06.checker")).rejects.toMatchObject({ status: 403 });
    await expect(action({ ...submit, goals_hash: "0".repeat(64) }, ownUser)).rejects.toMatchObject({ status: 409 });
    const manager = await f.review();
    await expect(f.act(manager.id, "submit_review")).rejects.toMatchObject({ status: 409 });
    const key = randomUUID();
    expect((await action(submit, ownUser, key)).status).toBe("submitted");
    expect((await action(submit, ownUser, key)).replayed).toBe(true);
    await expect(action(submit, ownUser)).rejects.toMatchObject({ status: 409 });
    await expect(f.act(goal.id, "revise_goal")).rejects.toMatchObject({ status: 409 });
    const peerItem = (await read("mine", peerUser)).items.find((i) => i.id === invitedPeer.id)!;
    await action(
      {
        ...submit,
        id: peerItem.id,
        goals_hash: peerItem.goals_hash,
        summary: "Peer evidence of reliable collaboration",
      },
      peerUser,
    );
    await expect(f.act(manager.id, "submit_review")).rejects.toMatchObject({ status: 409 });
    const refreshedManager = await f.review("r06.maker", { id: manager.id, version: manager.version });
    await f.act(refreshedManager.id, "submit_review");
    await f.act(manager.id, "publish_review", "r06.checker");
    const published = (await read("mine", ownUser)).reviews[0];
    expect(published.can_acknowledge).toBe(true);
    const outcome = await f.outcome(manager.id);
    await f.act(outcome.id, "submit_outcome");
    await f.act(outcome.id, "approve_outcome", "r06.checker");
    await f.act(outcome.id, "complete_outcome");
    await expect(f.act(f.cycle.id, "close_cycle")).rejects.toMatchObject({ status: 409 });
    const acknowledge: HrPerformanceParticipationAction = {
      ...common,
      action: "acknowledge",
      review_id: manager.id,
      expected_version: published.version,
      reason: "I acknowledge receipt and retain my employee comment",
    };
    await expect(action(acknowledge, "r06.checker")).rejects.toMatchObject({ status: 403 });
    await action(acknowledge, ownUser);
    expect((await read("mine", ownUser)).reviews[0].acknowledgement).toContain("acknowledge receipt");
    await f.act(f.cycle.id, "close_cycle");
    expect((await f.read("cycles")).cycle?.state).toBe("closed");
    await expect(
      pool.query("update hr_performance_contribution set summary='Changed' where tenant_id=$1 and id=$2", [
        tenant,
        own.id,
      ]),
    ).rejects.toBeTruthy();
    await expect(
      pool.query("delete from hr_performance_acknowledgement where tenant_id=$1 and review_id=$2", [
        tenant,
        manager.id,
      ]),
    ).rejects.toBeTruthy();
    await pool.query(
      "update security_user_company_access set revoked_at=now(),revoked_by='r06.last-admin-a',revocation_reason='Performance scope revocation test' where tenant_id=$1 and user_id=$3 and company_id=$2",
      [tenant, f.companyId, ownUser],
    );
    await expect(action(submit, ownUser, key)).rejects.toMatchObject({ status: 403 });
    expect(
      (await f.repo.getPerformanceInbox(performanceActor(ownUser, []))).items.some((i) => i.cycle_id === f.cycle.id),
    ).toBe(false);
  });
});
