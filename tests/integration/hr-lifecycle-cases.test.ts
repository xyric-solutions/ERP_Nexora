import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createLifecycleFixture, lifecycleActor } from "./hr-lifecycle-case-fixture.js";
import { lifecycleSettlement } from "../../server/api/src/modules/hr/lifecycle-cases.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Connected Employee Lifecycle cases", () => {
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
  async function fixture(limitedPolicy = false) {
    const f = await createLifecycleFixture(pool, limitedPolicy);
    fixtures.push(f);
    return f;
  }
  it("calculates exact statement amounts without floating-point rounding without marking payment or posting", () => {
    expect(
      lifecycleSettlement([
        { direction: "earning", amount_minor: "999999999999999" },
        { direction: "earning", amount_minor: "999999999999999" },
        { direction: "deduction", amount_minor: "123" },
      ]),
    ).toMatchObject({ net_minor: "1999999999999875", payment_status: "not_paid", posting_status: "statement_only" });
    expect(() => lifecycleSettlement([{ direction: "earning", amount_minor: "1.5" }])).toThrow();
  });
  it("completes joining controls and independently confirms probation through authoritative employment history", async () => {
    const f = await fixture();
    const incomplete = await f.save({
      kind: "onboarding",
      relationship_id: f.relationshipId,
      due_date: f.today,
      notes: "Joining control checklist",
      tasks: f.tasks("onboarding", false),
    });
    await expect(f.act(incomplete.id, "submit")).rejects.toMatchObject({ status: 409 });
    const edited = await f.save(
      {
        kind: "onboarding",
        relationship_id: f.relationshipId,
        due_date: f.today,
        notes: "Verified joining readiness",
        tasks: f.tasks("onboarding"),
      },
      "r06.maker",
      incomplete,
    );
    await f.act(edited.id, "submit");
    await expect(f.act(edited.id, "approve")).rejects.toMatchObject({ status: 403 });
    await f.act(edited.id, "approve", "r06.checker");
    expect((await f.read("onboarding")).items[0].state).toBe("approved");
    await expect(
      f.save({
        kind: "onboarding",
        relationship_id: f.relationshipId,
        due_date: f.today,
        notes: "Cannot omit controls",
        tasks: f.tasks("onboarding").slice(1),
      }),
    ).rejects.toMatchObject({ status: 409 });
    const probation = await f.save({
      kind: "probation",
      relationship_id: f.relationshipId,
      effective_date: f.today,
      recommendation: "confirm",
      extension_until: null,
      rating: 4,
      summary: "Successful probation reviewed with documented evidence",
    });
    await f.act(probation.id, "submit");
    await f.act(probation.id, "approve", "r06.checker");
    expect((await f.read("probation")).items[0].evidence.result).toBe("confirmed");
    expect(
      (
        await pool.query(
          "select event_type from hr_employment_event where tenant_id=$1 and relationship_id=$2 order by sequence desc limit 1",
          [tenant, f.relationshipId],
        )
      ).rows[0].event_type,
    ).toBe("confirmation");
  });
  it.each(["resignation", "termination"] as const)(
    "connects approved %s, clearance, exact final statement and authoritative offboarding without Banking",
    async (kind) => {
      const f = await fixture();
      const exit = await f.save({
        kind,
        relationship_id: f.relationshipId,
        last_working_date: f.today,
        notice_reference: "Reviewed notice and signed company decision",
        summary: "Agreed employment exit with documented notice and handover",
      });
      await f.act(exit.id, "submit");
      await f.act(exit.id, "approve", "r06.checker");
      await expect(f.act(exit.id, "apply_exit")).rejects.toMatchObject({ status: 409 });
      const clearance = await f.save({
        kind: "clearance",
        exit_case_id: exit.id,
        tasks: f.tasks("clearance"),
        notes: "Assets, accounts, work and HR handover verified",
      });
      await f.act(clearance.id, "submit");
      await f.act(clearance.id, "approve", "r06.checker");
      const currency = (await f.read("settlement")).currencies[0].code;
      const settlement = await f.save({
        kind: "settlement",
        exit_case_id: exit.id,
        currency,
        lines: [
          {
            direction: "earning",
            description: "Reviewed final entitlement statement",
            amount_minor: "120000",
            source_reference: "Approved Payroll calculation reference LC-TEST",
          },
          {
            direction: "deduction",
            description: "Reviewed handover recovery",
            amount_minor: "2000",
            source_reference: "Signed clearance recovery LC-TEST",
          },
        ],
        notes: "Reviewed manual final statement; posting and Banking payment remain separate.",
      });
      await f.act(settlement.id, "submit");
      await f.act(settlement.id, "approve", "r06.checker");
      expect((await f.read("settlement")).items[0].evidence.net_minor).toBe("118000");
      const result = await f.act(exit.id, "apply_exit");
      expect(result.status).toBe("closed");
      const rel = (
        await pool.query(
          "select status,effective_to::text from hr_employment_relationship where tenant_id=$1 and id=$2",
          [tenant, f.relationshipId],
        )
      ).rows[0];
      expect(rel).toMatchObject({ status: "ended", effective_to: f.today });
      expect(
        (
          await pool.query("select assignment_status from employee_assignment where tenant_id=$1 and id=$2", [
            tenant,
            f.assignmentId,
          ])
        ).rows[0].assignment_status,
      ).toBe("ended");
      expect((await f.read("offboarding")).items[0].evidence.payment_status).toBe("not_paid");
      await expect(
        pool.query("delete from hr_lifecycle_case_event where tenant_id=$1 and record_id=$2", [tenant, exit.id]),
      ).rejects.toBeTruthy();
    },
  );
  it("rejects stale versions, foreign company scope, missing current grants and immutable approved edits", async () => {
    const f = await fixture(),
      record = await f.save({
        kind: "probation",
        relationship_id: f.relationshipId,
        effective_date: f.today,
        recommendation: "extend",
        extension_until: "2099-12-31",
        rating: 3,
        summary: "Reviewed probation extension and follow-up due date",
      });
    await expect(
      f.repo.actOnLifecycleCase(
        lifecycleActor(),
        {
          action: "submit",
          company_id: f.companyId,
          id: record.id,
          expected_version: 99,
          reason: "Stale version must not pass",
        },
        randomUUID(),
        "lifecycle-test",
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.repo.getLifecycleCaseWorkspace(lifecycleActor("r06.target", []), {
        company_id: f.companyId,
        section: "probation",
        search: "",
        limit: 25,
        offset: 0,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await f.act(record.id, "submit");
    await f.act(record.id, "approve", "r06.checker");
    await expect(
      f.save(
        {
          kind: "probation",
          relationship_id: f.relationshipId,
          effective_date: f.today,
          recommendation: "extend",
          extension_until: "2099-12-31",
          rating: 5,
          summary: "Attempt to rewrite an approved probation review",
        },
        "r06.maker",
        { id: record.id, version: 3 },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await f.read("probation")).items[0].evidence.result).toBe("probation_extended");
  });
  async function readyExit(f: Awaited<ReturnType<typeof createLifecycleFixture>>, date = f.today) {
    const exit = await f.save({
      kind: "resignation",
      relationship_id: f.relationshipId,
      last_working_date: date,
      notice_reference: "Signed employment exit notice",
      summary: "Independent exit review and recorded handover evidence",
    });
    await f.act(exit.id, "submit");
    await f.act(exit.id, "approve", "r06.checker");
    const clearance = await f.save({
      kind: "clearance",
      exit_case_id: exit.id,
      tasks: f.tasks("clearance"),
      notes: "All mandatory handover controls verified",
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
            source_reference: "Signed reviewed entitlement LC-123",
          },
        ],
        notes: "Independent manually reviewed statement without financial posting or payment.",
      });
    await f.act(statement.id, "submit");
    await f.act(statement.id, "approve", "r06.checker");
    return exit;
  }
  it("serializes competing decisions and checks current scoped authority before replay", async () => {
    const f = await fixture(),
      record = await f.save({
        kind: "probation",
        relationship_id: f.relationshipId,
        effective_date: f.today,
        recommendation: "extend",
        extension_until: "2099-12-31",
        rating: 3,
        summary: "Independent reviewed probation extension plan",
      }),
      input = {
        action: "submit" as const,
        company_id: f.companyId,
        id: record.id,
        expected_version: 1,
        reason: "Submit controlled probation review",
      };
    const keys = [randomUUID(), randomUUID()],
      results = await Promise.allSettled(
        keys.map((key) => f.repo.actOnLifecycleCase(lifecycleActor(), input, key, "lifecycle-race")),
      );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const index = results.findIndex((r) => r.status === "fulfilled");
    expect((await f.repo.actOnLifecycleCase(lifecycleActor(), input, keys[index], "lifecycle-replay")).replayed).toBe(
      true,
    );
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-maker' and permission_key='hr.employment_lifecycle.action' and scope_value=$2",
      [tenant, f.companyId],
    );
    await expect(
      f.repo.actOnLifecycleCase(lifecycleActor(), input, keys[index], "lifecycle-replay"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("preserves older approved policy definitions and rolls back every projection when an exit transition is unavailable", async () => {
    const f = await fixture(true),
      exit = await readyExit(f);
    await expect(f.act(exit.id, "apply_exit")).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await pool.query("select status,effective_to from hr_employment_relationship where tenant_id=$1 and id=$2", [
          tenant,
          f.relationshipId,
        ])
      ).rows[0],
    ).toMatchObject({ status: "active", effective_to: null });
    expect(
      (
        await pool.query(
          "select assignment_status,effective_to from employee_assignment where tenant_id=$1 and id=$2",
          [tenant, f.assignmentId],
        )
      ).rows[0],
    ).toMatchObject({ assignment_status: "active", effective_to: null });
    expect((await f.read("offboarding")).items[0].state).toBe("approved");
    const confirm = await f.save({
      kind: "probation",
      relationship_id: f.relationshipId,
      effective_date: f.today,
      recommendation: "confirm",
      extension_until: null,
      rating: 4,
      summary: "Legacy policy must not be changed or bypassed",
    });
    await f.act(confirm.id, "submit");
    await expect(f.act(confirm.id, "approve", "r06.checker")).rejects.toMatchObject({ status: 409 });
    expect((await f.read("probation")).items[0].state).toBe("submitted");
  });
  it("blocks future-dated offboarding and preserves historical Payroll adjustment eligibility after a valid exit", async () => {
    const f = await fixture(),
      future = (await pool.query("select (current_date+1)::text as date")).rows[0].date,
      exit = await readyExit(f, future);
    await expect(f.act(exit.id, "apply_exit")).rejects.toMatchObject({ status: 409 });
    const past = await fixture(),
      current = await readyExit(past);
    await past.act(current.id, "apply_exit");
    const options = await past.repo.getPayrollOptions(lifecycleActor("r06.maker", ["hr.payroll.adjustment.read"]), {
      company_id: past.companyId,
      search: "",
      on_date: past.today,
    });
    expect(options.employees.some((e) => e.id === past.person.employeeId)).toBe(true);
    const later = await past.repo.getPayrollOptions(lifecycleActor("r06.maker", ["hr.payroll.adjustment.read"]), {
      company_id: past.companyId,
      search: "",
      on_date: future,
    });
    expect(later.employees.some((e) => e.id === past.person.employeeId)).toBe(false);
  });
  it("requires real linked-account deactivation before accepting exit clearance evidence", async () => {
    const f = await fixture(),
      user = "lifecycle-leaver-" + randomUUID();
    await pool.query(
      "insert into security_user_account(id,tenant_id,identity_subject,email,status,mfa_state,created_at) values($1,$2,$1,$3,'active','disabled',now())",
      [user, tenant, user + "@example.test"],
    );
    await pool.query(
      "insert into employee_user_binding(id,tenant_id,user_id,employee_id,effective_from,reason,created_by) values($1,$2,$3,$4,current_date,'Isolated leaver account clearance check','r06.last-admin-a')",
      ["lifecycle-binding-" + randomUUID(), tenant, user, f.person.employeeId],
    );
    const exit = await f.save({
      kind: "resignation",
      relationship_id: f.relationshipId,
      last_working_date: f.today,
      notice_reference: "Signed exit notice and agreed date",
      summary: "Reviewed employment exit and handover controls",
    });
    await f.act(exit.id, "submit");
    await f.act(exit.id, "approve", "r06.checker");
    const clearance = await f.save({
      kind: "clearance",
      exit_case_id: exit.id,
      tasks: f.tasks("clearance"),
      notes: "Claimed completion must not leave linked access active",
    });
    await expect(f.act(clearance.id, "submit")).rejects.toMatchObject({ status: 409 });
    await expect(
      pool.query(
        "update hr_lifecycle_case set state='submitted',submitted_by='r06.maker',version=version+1 where tenant_id=$1 and id=$2",
        [tenant, clearance.id],
      ),
    ).rejects.toBeTruthy();
    expect(
      (await pool.query("select status from security_user_account where tenant_id=$1 and id=$2", [tenant, user]))
        .rows[0].status,
    ).toBe("active");
    // Independent Security activity is deliberately separate from the HR operation.
    await pool.query(
      "update security_user_account set status='inactive',updated_at=now() where tenant_id=$1 and id=$2",
      [tenant, user],
    );
    await f.act(clearance.id, "submit");
    await f.act(clearance.id, "approve", "r06.checker");
    expect((await f.read("clearance")).items[0].state).toBe("approved");
  });
});
