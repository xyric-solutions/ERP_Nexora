import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { createPayrollRunFixture } from "./hr-payroll-run-fixture.js";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createEncashmentFixture, encashmentActor } from "./hr-encashment-fixture.js";
import { hrLifecycleCaseWorkspaceSchema, type HrLifecycleCaseAction } from "../../packages/contracts/src/hr/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Independent pre-Payroll settlement corrections", () => {
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
  async function fixture() {
    const f = await createEncashmentFixture(pool);
    fixtures.push(f);
    await f.decide("submit_rule");
    await f.decide("approve_rule", "r06.checker");
    await f.add();
    await f.caseAction("submit");
    await f.caseAction("approve", "r06.checker");
    return f;
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function row(f: Fixture) {
    return (await pool.query("select * from hr_lifecycle_case where tenant_id=$1 and id=$2", [tenant, f.statement.id]))
      .rows[0];
  }
  async function input(
    f: Fixture,
    action: "request_void" | "approve_void" | "reject_void",
  ): Promise<HrLifecycleCaseAction> {
    return {
      action,
      company_id: f.companyId,
      id: f.statement.id,
      expected_version: (await row(f)).version,
      reason: "Reviewed correction of the original contractual settlement statement",
    };
  }
  async function act(f: Fixture, action: "request_void" | "approve_void" | "reject_void", who = "r06.maker") {
    return f.repo.actOnLifecycleCase(encashmentActor(who), await input(f, action), randomUUID(), "void-test");
  }
  async function workspace(f: Fixture, who = "r06.maker") {
    return hrLifecycleCaseWorkspaceSchema.parse(
      await f.repo.getLifecycleCaseWorkspace(encashmentActor(who), {
        company_id: f.companyId,
        section: "settlement",
        search: "",
        limit: 25,
        offset: 0,
      }),
    );
  }

  it("blocks Payroll handoff during review and permits correction after a zero-value exclusion", async () => {
    const f = await fixture();
    async function link() {
      const r = await row(f);
      return pool.query(
        "insert into hr_settlement_payroll_link(tenant_id,company_id,id,case_id,line_index,revision,effective_month,source_version,source_terms,reason,exclusion_reason,created_by) values($1,$2,$3,$4,0,1,$5,$6,$7::jsonb,'Reviewed exclusion for prior processed reference','Prior zero amount reviewed outside Payroll','r06.maker')",
        [
          tenant,
          f.companyId,
          randomUUID(),
          f.statement.id,
          f.today.slice(0, 7) + "-01",
          r.version,
          JSON.stringify(r.terms),
        ],
      );
    }
    await act(f, "request_void");
    await expect(link()).rejects.toThrow(/correction review/);
    await act(f, "reject_void", "r06.checker");
    await link();
    expect((await workspace(f)).items[0]!.void_blockers).toEqual([]);
    await act(f, "request_void");
    await act(f, "approve_void", "r06.checker");
    expect((await f.balance()).encashed).toBe("0.0000");
  });
  it("restores only settlement leave after attendance close while ordinary sources remain sealed", async () => {
    let f: Fixture;
    await createPayrollRunFixture(pool, [], {
      beforeAttendanceClose: async (base) => {
        f = await createEncashmentFixture(pool, { fixture: base, person: base.person });
        fixtures.push(f);
      },
    });
    await f!.decide("submit_rule");
    await f!.decide("approve_rule", "r06.checker");
    await f!.add();
    await f!.caseAction("submit");
    await f!.caseAction("approve", "r06.checker");
    await act(f!, "request_void");
    await act(f!, "approve_void", "r06.checker");
    expect((await f!.balance()).encashed).toBe("0.0000");
    await expect(f!.posting("1", "adjustment")).rejects.toMatchObject({ status: 409 });
  });
  it("requires Payroll correction once Payroll calculates but still permits rejecting a pending review", async () => {
    let f: Fixture;
    await createProductionJournalFixture(
      pool,
      async () => {
        await f!.decide("submit_rule");
        await f!.decide("approve_rule", "r06.checker");
        await f!.add();
        await f!.caseAction("submit");
        await f!.caseAction("approve", "r06.checker");
        await act(f!, "request_void");
      },
      async (base) => {
        f = await createEncashmentFixture(pool, { fixture: base, person: base.person });
        fixtures.push(f);
      },
    );
    await expect(act(f!, "approve_void", "r06.checker")).rejects.toMatchObject({ status: 409 });
    expect((await workspace(f!, "r06.checker")).items[0]!.allowed_actions).toEqual(["reject_void"]);
    await act(f!, "reject_void", "r06.checker");
    expect((await f!.balance()).encashed).toBe("10.2500");
    await expect(act(f!, "request_void")).rejects.toMatchObject({ status: 409 });
  });

  it("restores exact days only after separate approval and preserves the original evidence", async () => {
    const f = await fixture(),
      original = await row(f);
    await act(f, "request_void");
    expect((await f.balance()).encashed).toBe("10.2500");
    const w = await workspace(f);
    expect(w.items[0]!.void_requests[0]!.state).toBe("submitted");
    expect(w.items[0]!.can_prepare_payroll).toBe(false);
    expect(w.items[0]!.allowed_actions).not.toContain("approve_void");
    await expect(act(f, "approve_void")).rejects.toMatchObject({ status: 403 });
    const decision = await input(f, "approve_void"),
      key = randomUUID();
    await f.repo.actOnLifecycleCase(encashmentActor("r06.checker"), decision, key, "void-test");
    const after = await row(f);
    expect(after).toMatchObject({
      state: "cancelled",
      version: original.version + 2,
      terms: original.terms,
      evidence: original.evidence,
      decided_by: original.decided_by,
      updated_by: original.updated_by,
    });
    expect(await f.balance()).toMatchObject({ encashed: "0.0000", balance: "12.3456", available: "12.3456" });
    expect((await f.repo.actOnLifecycleCase(encashmentActor("r06.checker"), decision, key, "void-test")).replayed).toBe(
      true,
    );
    expect(
      (
        await pool.query(
          "select kind,days::text from hr_leave_transaction where tenant_id=$1 and company_id=$2 and kind in('encashed','encashment_reversal') order by days",
          [tenant, f.companyId],
        )
      ).rows,
    ).toEqual([
      { kind: "encashed", days: "-10.2500" },
      { kind: "encashment_reversal", days: "10.2500" },
    ]);
    const yesterday = (await pool.query("select ($1::date-1)::text as day", [f.today])).rows[0].day;
    expect((await f.balance(yesterday)).future_used).toBe("0.0000");
    const replacement = await f.save({
      ...original.terms,
      lines: original.terms.lines.filter((l: { encashment_source_id?: string }) => !l.encashment_source_id),
    });
    expect(replacement.status).toBe("draft");
  });
  it("retains rejected reviews and permits a fresh independent request without restoring leave", async () => {
    const f = await fixture();
    await act(f, "request_void");
    await act(f, "reject_void", "r06.checker");
    expect((await row(f)).state).toBe("approved");
    expect((await f.balance()).encashed).toBe("10.2500");
    await act(f, "request_void", "r06.checker");
    // A previous requester may decide a later request made by a different officer.
    await act(f, "approve_void");
    const h = (await workspace(f)).items[0]!.void_requests;
    expect(h.map((v) => v.state)).toEqual(["approved", "rejected"]);
  });
  it("serializes duplicate requests and competing independent decisions", async () => {
    const f = await fixture(),
      value = await input(f, "request_void");
    const a = await Promise.allSettled(
      [1, 2].map(() => f.repo.actOnLifecycleCase(encashmentActor(), value, randomUUID(), "test")),
    );
    expect(a.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const decision = await input(f, "approve_void");
    const b = await Promise.allSettled(
      [1, 2].map(() => f.repo.actOnLifecycleCase(encashmentActor("r06.checker"), decision, randomUUID(), "test")),
    );
    expect(b.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await f.balance()).encashed).toBe("0.0000");
  });
  it("requires current normalized authority before replay and blocks impersonation and cross-company access", async () => {
    const f = await fixture(),
      value = await input(f, "request_void"),
      key = randomUUID();
    await f.repo.actOnLifecycleCase(encashmentActor(), value, key, "test");
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-maker' and permission_key='hr.employment_lifecycle.action' and scope_value=$2",
      [tenant, f.companyId],
    );
    await expect(f.repo.actOnLifecycleCase(encashmentActor(), value, key, "test")).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      f.repo.actOnLifecycleCase(
        { ...encashmentActor("r06.checker"), impersonationRequestId: "impersonated" },
        await input(f, "approve_void"),
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.actOnLifecycleCase(
        encashmentActor("r06.checker"),
        { ...(await input(f, "approve_void")), company_id: "unavailable-company" },
        randomUUID(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects direct cancellation, forged restoration and correction decisions missing their atomic effects", async () => {
    const f = await fixture();
    await expect(
      pool.query("update hr_lifecycle_case set state='cancelled',version=version+1 where tenant_id=$1 and id=$2", [
        tenant,
        f.statement.id,
      ]),
    ).rejects.toThrow();
    await expect(
      pool.query(
        "insert into hr_leave_transaction select (jsonb_populate_record(null::hr_leave_transaction,to_jsonb(t)||jsonb_build_object('id',$3::text,'kind','encashment_reversal','source_type','settlement_void','days',-t.days))).* from hr_leave_transaction t where tenant_id=$1 and company_id=$2 and kind='encashed'",
        [tenant, f.companyId, randomUUID()],
      ),
    ).rejects.toThrow();
    await act(f, "request_void");
    await expect(
      pool.query(
        "update hr_settlement_void_request set state='approved',decided_by='r06.checker',decision_reason='Independent decision missing atomic reversal',decided_at=now() where tenant_id=$1 and case_id=$2",
        [tenant, f.statement.id],
      ),
    ).rejects.toThrow();
    expect((await f.balance()).encashed).toBe("10.2500");
  });
  it("pauses offboarding until review is resolved and preserves correction history against modification", async () => {
    const f = await fixture();
    await act(f, "request_void");
    const w = await f.repo.getLifecycleCaseWorkspace(encashmentActor(), {
      company_id: f.companyId,
      section: "offboarding",
      search: "",
      limit: 25,
      offset: 0,
    });
    expect(w.items.find((x) => x.id === f.exit.id)!.allowed_actions).not.toContain("apply_exit");
    await expect(f.act(f.exit.id, "apply_exit")).rejects.toMatchObject({ status: 403 });
    await expect(
      pool.query(
        "update hr_settlement_void_request set reason='Changed immutable request reason' where tenant_id=$1 and case_id=$2",
        [tenant, f.statement.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query("delete from hr_settlement_void_request where tenant_id=$1 and case_id=$2", [tenant, f.statement.id]),
    ).rejects.toThrow();
  });
});
