import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createLifecycleFixture, lifecycleActor } from "./hr-lifecycle-case-fixture.js";
import { hrPolicyUpgradeWorkspaceSchema, type HrPolicyUpgradeAction } from "../../packages/contracts/src/hr/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Governed upgrades of existing employment policies", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createLifecycleFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture() {
    const f = await createLifecycleFixture(pool, true);
    fixtures.push(f);
    const target = await f.repo.createEmploymentLifecyclePolicy(
      lifecycleActor(),
      {
        company_id: f.companyId,
        code: "NEW-" + randomUUID().slice(0, 8).toUpperCase(),
        name: "Reviewed replacement policy with confirmation and exits",
        effective_from: f.today,
      },
      randomUUID(),
      "upgrade-test",
    );
    await f.repo.submitEmploymentLifecyclePolicy(
      lifecycleActor(),
      target.id,
      { reason: "Submit independently reviewed replacement policy" },
      randomUUID(),
      "upgrade-test",
    );
    await f.repo.approveEmploymentLifecyclePolicy(
      lifecycleActor("r06.checker"),
      target.id,
      { decision: "approved", reason: "Independent approval of replacement policy definitions" },
      randomUUID(),
      "upgrade-test",
    );
    const read = async (who = "r06.maker") =>
      hrPolicyUpgradeWorkspaceSchema.parse(
        await f.repo.getPolicyUpgrades(lifecycleActor(who), {
          company_id: f.companyId,
          search: "",
          limit: 25,
          offset: 0,
        }),
      );
    const request = (extra: Record<string, unknown> = {}, who = "r06.maker", key = randomUUID()) =>
      f.repo.actOnPolicyUpgrade(
        lifecycleActor(who),
        {
          action: "request",
          company_id: f.companyId,
          relationship_id: f.relationshipId,
          target_policy_id: target.id,
          effective_on: f.today,
          reason: "Upgrade legacy employment authority while preserving Hire history",
          ...extra,
        } as HrPolicyUpgradeAction,
        key,
        "upgrade-test",
      );
    const act = async (
      id: string,
      action: "approve" | "reject" | "cancel",
      who = "r06.checker",
      key = randomUUID(),
    ) => {
      const r = (
        await pool.query("select version from hr_employment_policy_adoption where tenant_id=$1 and id=$2", [tenant, id])
      ).rows[0];
      return f.repo.actOnPolicyUpgrade(
        lifecycleActor(who),
        {
          action,
          company_id: f.companyId,
          id,
          expected_version: r.version,
          reason: "Reviewed independent employee policy upgrade decision",
        },
        key,
        "upgrade-test",
      );
    };
    return { ...f, target, upgrades: read, request, decide: act };
  }
  it("upgrades an older Hire-only policy, then confirms and offboards under the new approved authority without rewriting originals", async () => {
    const f = await fixture(),
      before = (
        await pool.query(
          "select to_jsonb(p) as policy from hr_employment_lifecycle_policy p where tenant_id=$1 and id=$2",
          [tenant, f.policy.id],
        )
      ).rows[0].policy,
      oldEvents = (
        await pool.query(
          "select to_jsonb(e) as event from hr_employment_event e where tenant_id=$1 and relationship_id=$2 order by sequence",
          [tenant, f.relationshipId],
        )
      ).rows.map((r) => r.event);
    expect((await f.upgrades()).policies.some((p) => p.id === f.target.id)).toBe(true);
    const upgrade = await f.request();
    expect((await f.upgrades()).items[0]).toMatchObject({
      state: "pending",
      source_policy_id: f.policy.id,
      target_policy_id: f.target.id,
      from_state: "Employed",
      target_state: "Employed",
    });
    await expect(f.decide(upgrade.id, "approve", "r06.maker")).rejects.toMatchObject({ status: 403 });
    await f.decide(upgrade.id, "approve");
    expect((await f.upgrades()).relationships[0].effective_policy_id).toBe(f.target.id);
    const probation = await f.save({
      kind: "probation",
      relationship_id: f.relationshipId,
      effective_date: f.today,
      recommendation: "confirm",
      extension_until: null,
      rating: 4,
      summary: "Successful evidence-based probation under upgraded authority",
    });
    await f.act(probation.id, "submit");
    await f.act(probation.id, "approve", "r06.checker");
    const exit = await f.save({
      kind: "resignation",
      relationship_id: f.relationshipId,
      last_working_date: f.today,
      notice_reference: "Signed resignation and employer acceptance",
      summary: "Agreed employment exit after independent policy upgrade",
    });
    await f.act(exit.id, "submit");
    await f.act(exit.id, "approve", "r06.checker");
    const clearance = await f.save({
      kind: "clearance",
      exit_case_id: exit.id,
      notes: "Complete handover evidence",
      tasks: f.tasks("clearance"),
    });
    await f.act(clearance.id, "submit");
    await f.act(clearance.id, "approve", "r06.checker");
    const currency = (await f.read("settlement")).currencies[0].code,
      statement = await f.save({
        kind: "settlement",
        exit_case_id: exit.id,
        currency,
        lines: [
          {
            direction: "earning",
            description: "Reviewed final entitlement",
            amount_minor: "10000",
            source_reference: "Signed reviewed statement reference",
          },
        ],
        notes: "Manually reviewed statement with posting and payment separate",
      });
    await f.act(statement.id, "submit");
    await f.act(statement.id, "approve", "r06.checker");
    await f.act(exit.id, "apply_exit");
    expect(
      (
        await pool.query(
          "select lifecycle_policy_id,status from hr_employment_relationship where tenant_id=$1 and id=$2",
          [tenant, f.relationshipId],
        )
      ).rows[0],
    ).toMatchObject({ lifecycle_policy_id: f.policy.id, status: "ended" });
    expect(
      (
        await pool.query(
          "select to_jsonb(p) as policy from hr_employment_lifecycle_policy p where tenant_id=$1 and id=$2",
          [tenant, f.policy.id],
        )
      ).rows[0].policy,
    ).toEqual(before);
    const events = (
      await pool.query(
        "select to_jsonb(e) as event from hr_employment_event e where tenant_id=$1 and relationship_id=$2 order by sequence",
        [tenant, f.relationshipId],
      )
    ).rows.map((r) => r.event);
    expect(events.slice(0, oldEvents.length)).toEqual(oldEvents);
    expect(events.map((e) => e.event_type)).toEqual(["hire", "confirmation", "resignation"]);
    await expect(
      pool.query(
        "update hr_employment_policy_adoption set decision_reason='Rewrite approved decision' where tenant_id=$1 and id=$2",
        [tenant, upgrade.id],
      ),
    ).rejects.toBeTruthy();
    await expect(
      pool.query("update hr_employment_relationship set lifecycle_policy_id=$3 where tenant_id=$1 and id=$2", [
        tenant,
        f.relationshipId,
        f.target.id,
      ]),
    ).rejects.toBeTruthy();
  });
  it("rejects future, backdated, same-policy, draft-policy and cross-company requests", async () => {
    const a = await fixture(),
      b = await fixture(),
      future = (await pool.query("select (current_date+1)::text as date")).rows[0].date;
    for (const extra of [
      { effective_on: future },
      { effective_on: "2000-01-01" },
      { target_policy_id: a.policy.id },
      { target_policy_id: b.target.id },
      { relationship_id: b.relationshipId },
    ])
      await expect(a.request(extra)).rejects.toMatchObject({ status: 409 });
    const draft = await a.repo.createEmploymentLifecyclePolicy(
      lifecycleActor(),
      {
        company_id: a.companyId,
        code: "DR-" + randomUUID().slice(0, 8).toUpperCase(),
        name: "Unapproved policy cannot govern an upgrade",
        effective_from: a.today,
      },
      randomUUID(),
      "upgrade-test",
    );
    await expect(a.request({ target_policy_id: draft.id })).rejects.toMatchObject({ status: 409 });
    expect((await a.upgrades()).total).toBe(0);
  });
  it("requires fresh affected-case evidence and supports rejection and cancellation without changing authority", async () => {
    const f = await fixture(),
      request = await f.request();
    const review = await f.save({
      kind: "probation",
      relationship_id: f.relationshipId,
      effective_date: f.today,
      recommendation: "extend",
      extension_until: "2099-12-31",
      rating: 3,
      summary: "New probation evidence invalidates the pending upgrade snapshot",
    });
    expect(review.status).toBe("draft");
    await expect(f.decide(request.id, "approve")).rejects.toMatchObject({ status: 409 });
    await f.decide(request.id, "cancel", "r06.maker");
    const second = await f.request();
    await f.decide(second.id, "reject");
    expect((await f.upgrades()).relationships[0].effective_policy_id).toBe(f.policy.id);
    const third = await f.request();
    await f.decide(third.id, "approve");
    expect((await f.upgrades()).relationships[0].effective_policy_id).toBe(f.target.id);
  });
  it("serializes concurrent decisions and rechecks current scoped authority before replay", async () => {
    const f = await fixture(),
      record = await f.request(),
      input = {
        action: "approve" as const,
        company_id: f.companyId,
        id: record.id,
        expected_version: 1,
        reason: "Independent policy upgrade approval with retained authority evidence",
      },
      keys = [randomUUID(), randomUUID()];
    const outcomes = await Promise.allSettled(
      keys.map((key) => f.repo.actOnPolicyUpgrade(lifecycleActor("r06.checker"), input, key, "upgrade-race")),
    );
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);
    const key = keys[outcomes.findIndex((r) => r.status === "fulfilled")];
    expect(
      (await f.repo.actOnPolicyUpgrade(lifecycleActor("r06.checker"), input, key, "upgrade-replay")).replayed,
    ).toBe(true);
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-checker' and permission_key='hr.employment_lifecycle_policy.approve' and scope_value=$2",
      [tenant, f.companyId],
    );
    await expect(
      f.repo.actOnPolicyUpgrade(lifecycleActor("r06.checker"), input, key, "upgrade-replay"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("blocks employee self approval, impersonation and unauthorized reads", async () => {
    const f = await fixture(),
      user = "upgrade-employee-" + randomUUID();
    await pool.query(
      "insert into security_user_account(id,tenant_id,identity_subject,email,status,mfa_state,created_at) values($1,$2,$1,$3,'active','disabled',now())",
      [user, tenant, user + "@example.test"],
    );
    await pool.query(
      "insert into employee_user_binding(id,tenant_id,user_id,employee_id,effective_from,reason,created_by) values($1,$2,$3,$4,current_date,'Isolated employee self-decision control','r06.last-admin-a')",
      ["upgrade-binding-" + randomUUID(), tenant, user, f.person.employeeId],
    );
    const record = await f.request();
    await expect(
      pool.query(
        "update hr_employment_policy_adoption set state='approved',version=version+1,decided_by=$3,decision_reason='Forbidden employee self approval',decided_at=now() where tenant_id=$1 and id=$2",
        [tenant, record.id, user],
      ),
    ).rejects.toBeTruthy();
    await expect(
      f.repo.getPolicyUpgrades(lifecycleActor("r06.target", []), {
        company_id: f.companyId,
        search: "",
        limit: 25,
        offset: 0,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.actOnPolicyUpgrade(
        { ...lifecycleActor(), impersonationRequestId: "impersonation-test" },
        {
          action: "cancel",
          company_id: f.companyId,
          id: record.id,
          expected_version: 1,
          reason: "Impersonation may not change employment authority",
        },
        randomUUID(),
        "upgrade-test",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("protects effective boundaries against backdated upgrades and events", async () => {
    const f = await fixture(),
      record = await f.request();
    await f.decide(record.id, "approve");
    const earlier = (await pool.query("select (current_date-1)::text as date")).rows[0].date;
    const target = await f.repo.createEmploymentLifecyclePolicy(
      lifecycleActor(),
      {
        company_id: f.companyId,
        code: "EARLY-" + randomUUID().slice(0, 8).toUpperCase(),
        name: "Another reviewed replacement policy",
        effective_from: f.today.slice(0, 7) + "-01",
      },
      randomUUID(),
      "upgrade-test",
    );
    await f.repo.submitEmploymentLifecyclePolicy(
      lifecycleActor(),
      target.id,
      { reason: "Submit another reviewed company policy" },
      randomUUID(),
      "upgrade-test",
    );
    await f.repo.approveEmploymentLifecyclePolicy(
      lifecycleActor("r06.checker"),
      target.id,
      { decision: "approved", reason: "Independent approval of replacement definition" },
      randomUUID(),
      "upgrade-test",
    );
    await expect(f.request({ target_policy_id: target.id, effective_on: earlier })).rejects.toMatchObject({
      status: 409,
    });
    const prior = (
        await pool.query(
          "select * from hr_employment_event where tenant_id=$1 and relationship_id=$2 order by sequence desc limit 1",
          [tenant, f.relationshipId],
        )
      ).rows[0],
      state = (
        await pool.query(
          "select id from hr_employment_lifecycle_state where tenant_id=$1 and policy_id=$2 and code='confirmed'",
          [tenant, f.target.id],
        )
      ).rows[0].id;
    await expect(
      pool.query(
        "insert into hr_employment_event(id,tenant_id,relationship_id,sequence,event_type,effective_on,previous_state_id,resulting_state_id,recorded_by,approved_by,approved_at,source_reference,reason) values($1,$2,$3,2,'confirmation',$4,$5,$6,'r06.checker','r06.checker',now(),'isolated-backdated-event','Attempt to bypass an approved policy boundary')",
        ["backdated-" + randomUUID(), tenant, f.relationshipId, earlier, prior.resulting_state_id, state],
      ),
    ).rejects.toThrow("later approved policy boundary");
    expect(
      (
        await pool.query(
          "select count(*)::int as n from hr_employment_event where tenant_id=$1 and relationship_id=$2",
          [tenant, f.relationshipId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("rejects incompatible state mappings and current-role write violations", async () => {
    const f = await fixture();
    await expect(f.request({}, "r06.target")).rejects.toMatchObject({ status: 403 });
    const record = await f.request(),
      confirmed = (
        await pool.query(
          "select id from hr_employment_lifecycle_state where tenant_id=$1 and policy_id=$2 and code='confirmed'",
          [tenant, f.target.id],
        )
      ).rows[0].id;
    await expect(
      pool.query(
        "insert into hr_employment_policy_adoption select(jsonb_populate_record(null::hr_employment_policy_adoption,to_jsonb(a)||jsonb_build_object('id',$3::text,'target_state_id',$4::text))).* from hr_employment_policy_adoption a where a.tenant_id=$1 and a.id=$2",
        [tenant, record.id, "bad-mapping-" + randomUUID(), confirmed],
      ),
    ).rejects.toThrow("exact employment state meaning");
  });
});
