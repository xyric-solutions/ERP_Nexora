import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createBenefitFixture } from "./hr-benefit-fixture.js";
import { lifecycleActor, lifecyclePermissions } from "./hr-lifecycle-case-fixture.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { attachSalaryBenefit, salaryBenefitActor } from "./hr-salary-benefit-fixture.js";
import { runActor } from "./hr-payroll-run-fixture.js";
import {
  hrLifecycleCaseWorkspaceSchema,
  hrLifecycleCaseActionSchema,
  type HrLifecycleCaseAction,
} from "../../packages/contracts/src/hr/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const permissions = [
  ...lifecyclePermissions,
  "hr.payroll.setup.read",
  "hr.payroll.adjustment.read",
  "hr.payroll.result.read",
];
const actor = (who = "r06.maker") => lifecycleActor(who, permissions);
type Fixture = Awaited<ReturnType<typeof createBenefitFixture>>;
(url ? describe : describe.skip)("Financial correction review after finalized Payroll or offboarding", () => {
  let pool: DatabasePool;
  const fixtures: Array<{ dispose: () => Promise<unknown> }> = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function grants(company: string) {
    for (const role of ["r06-uat-policy-maker", "r06-uat-policy-checker"])
      for (const key of permissions.slice(-3)) {
        await pool.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
          [tenant, role, key],
        );
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
          [tenant, role, key, company],
        );
      }
  }
  async function read(f: Fixture, who = "r06.maker") {
    return hrLifecycleCaseWorkspaceSchema
      .parse(
        await f.repo.getLifecycleCaseWorkspace(actor(who), {
          company_id: f.companyId,
          section: "settlement",
          search: "",
          limit: 25,
          offset: 0,
        }),
      )
      .items.find((x) => x.id === f.statement.id)!;
  }
  async function propose(f: Fixture, amounts: string[], key = randomUUID()) {
    const r = await read(f);
    const input: HrLifecycleCaseAction = {
      action: "request_financial_correction",
      company_id: f.companyId,
      id: f.statement.id,
      expected_version: r.version,
      correction_source_hash: r.financial_corrections?.source_hash ?? "0".repeat(64),
      corrections: amounts.map((corrected_minor, line_index) => ({ line_index, corrected_minor })),
      authority_reference: "Synthetic signed correction calculation reference",
      reason: "Review the exact compensating differences without rewriting the original",
    };
    return { input, key, run: () => f.repo.actOnLifecycleCase(actor(), input, key, "correction-review-test") };
  }
  async function decide(f: Fixture, decision: "approve" | "reject", who = "r06.checker") {
    const r = await read(f, who),
      review = r.financial_corrections!.records.find((x) => x.state === "submitted")!;
    return f.repo.actOnLifecycleCase(
      actor(who),
      {
        action: "decide_financial_correction",
        company_id: f.companyId,
        id: f.statement.id,
        expected_version: r.version,
        correction_id: review.id,
        decision,
        reason: "Independent review of the supporting reference and exact differences",
      },
      randomUUID(),
      "correction-review-test",
    );
  }
  async function ended() {
    const f = await createBenefitFixture(pool);
    fixtures.push(f);
    await grants(f.companyId);
    await f.save(
      {
        kind: "settlement",
        exit_case_id: f.exit.id,
        currency: "PKR",
        notes: "Original signed statement retained",
        lines: [
          {
            direction: "earning",
            description: "Reviewed company benefit",
            amount_minor: "10000",
            source_reference: "signed-original-benefit-review",
          },
          {
            direction: "deduction",
            description: "Reviewed employee deduction",
            amount_minor: "2000",
            source_reference: "signed-original-deduction-review",
          },
        ],
      },
      "r06.maker",
      { id: f.statement.id, version: 1 },
    );
    await f.act(f.statement.id, "submit");
    await f.act(f.statement.id, "approve", "r06.checker");
    expect((await read(f)).financial_corrections).toBeNull();
    await expect((await propose(f, ["12000", "2500"])).run()).rejects.toMatchObject({ status: 409 });
    const clearance = await f.save({
      kind: "clearance",
      exit_case_id: f.exit.id,
      tasks: f.tasks("clearance", true),
      notes: "Actual reviewed offboarding prerequisites",
    });
    await f.act(clearance.id, "submit");
    await f.act(clearance.id, "approve", "r06.checker");
    await f.act(f.exit.id, "apply_exit");
    return f;
  }
  it("independently approves exact earning/deduction deltas after actual employment closure without changing original records", async () => {
    const f = await ended(),
      original = await read(f),
      before = (
        await pool.query("select to_jsonb(x) as row from hr_employment_relationship x where tenant_id=$1 and id=$2", [
          tenant,
          f.relationshipId,
        ])
      ).rows[0].row;
    const request = await propose(f, ["12000", "2500"]);
    await request.run();
    const pending = (await read(f)).financial_corrections!.records[0]!;
    expect(pending).toMatchObject({
      state: "submitted",
      net_delta_minor: "1500",
      can_approve: false,
      can_reject: false,
    });
    expect(pending.lines.map((x) => x.delta_minor)).toEqual(["2000", "500"]);
    await expect(decide(f, "approve", "r06.maker")).rejects.toMatchObject({ status: 403 });
    await decide(f, "approve");
    const current = await read(f);
    expect(current.financial_corrections!.records[0]).toMatchObject({
      state: "approved",
      decided_by: "r06.checker",
      can_approve: false,
      can_reject: false,
    });
    expect(current.terms).toEqual(original.terms);
    expect(current.evidence).toEqual(original.evidence);
    expect(current.version).toBe(original.version);
    expect(current.state).toBe("approved");
    expect(
      (
        await pool.query("select to_jsonb(x) as row from hr_employment_relationship x where tenant_id=$1 and id=$2", [
          tenant,
          f.relationshipId,
        ])
      ).rows[0].row,
    ).toEqual(before);
    expect(
      (
        await pool.query(
          "select count(*)::int n from hr_leave_transaction where tenant_id=$1 and company_id=$2 and source_type='settlement_void'",
          [tenant, f.companyId],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await pool.query("select count(*)::int n from hr_payroll_adjustment where tenant_id=$1 and company_id=$2", [
          tenant,
          f.companyId,
        ])
      ).rows[0].n,
    ).toBe(0);
    expect(await request.run()).toMatchObject({ replayed: true });
    await expect((await propose(f, ["13000", "2500"])).run()).rejects.toMatchObject({ status: 409 });
    await expect(
      pool.query("update hr_settlement_correction_review set net_delta_minor='1' where tenant_id=$1 and id=$2", [
        tenant,
        pending.id,
      ]),
    ).rejects.toThrow();
    await expect(
      pool.query("delete from hr_settlement_correction_review where tenant_id=$1 and id=$2", [tenant, pending.id]),
    ).rejects.toThrow();
  });
  it("rejects no-op, missing, duplicate, stale-source proposals; records recoveries and permits a fresh review after rejection", async () => {
    const f = await ended();
    await expect((await propose(f, ["10000", "2000"])).run()).rejects.toMatchObject({ status: 409 });
    await expect((await propose(f, ["9000"])).run()).rejects.toMatchObject({ status: 409 });
    const p = await propose(f, ["9000", "2500"]);
    if (p.input.action !== "request_financial_correction") throw Error("request expected");
    expect(
      hrLifecycleCaseActionSchema.safeParse({
        ...p.input,
        corrections: [p.input.corrections[0], p.input.corrections[0]],
      }).success,
    ).toBe(false);
    await expect(
      f.repo.actOnLifecycleCase(actor(), { ...p.input, correction_source_hash: "f".repeat(64) }, randomUUID(), "test"),
    ).rejects.toMatchObject({ status: 409 });
    await p.run();
    expect((await read(f)).financial_corrections!.records[0]!.net_delta_minor).toBe("-1500");
    await decide(f, "reject");
    expect((await read(f)).financial_corrections!.can_request).toBe(true);
    await (await propose(f, ["11000", "2500"])).run();
    expect((await read(f)).financial_corrections!.records).toHaveLength(2);
  });
  it("requires current normalized Payroll grants before replay and isolates the affected employee and company", async () => {
    const f = await ended(),
      p = await propose(f, ["12000", "2500"]);
    await p.run();
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-maker' and permission_key='hr.payroll.result.read' and scope_value=$2",
      [tenant, f.companyId],
    );
    await expect(p.run()).rejects.toMatchObject({ status: 403 });
    expect((await read(f)).financial_corrections).toBeNull();
    await grants(f.companyId);
    const subject = "correction-subject-" + randomUUID();
    await pool.query(
      "insert into security_user_account(id,tenant_id,identity_subject,email,status,mfa_state,created_at) values($1,$2,$1,$3,'active','disabled',now())",
      [subject, tenant, subject + "@example.test"],
    );
    await pool.query(
      "insert into employee_user_binding(id,tenant_id,user_id,employee_id,effective_from,reason,created_by) values($1,$2,$3,$4,current_date,'Isolated correction affected employee check','r06.last-admin-a')",
      [randomUUID(), tenant, subject, f.person.employeeId],
    );
    const pending = (await read(f)).financial_corrections!.records[0]!;
    await expect(
      pool.query(
        "update hr_settlement_correction_review set state='approved',decided_by=$3,decision_reason='Affected employee attempted direct approval',decided_at=clock_timestamp() where tenant_id=$1 and id=$2",
        [tenant, pending.id, subject],
      ),
    ).rejects.toThrow("Affected employees");
    await expect(
      f.repo.actOnLifecycleCase(actor(), { ...p.input, company_id: randomUUID() }, randomUUID(), "test"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("serializes competing requests and rejects forged source evidence and differences at the database boundary", async () => {
    const f = await ended(),
      one = await propose(f, ["12000", "2500"]),
      two = await propose(f, ["12500", "2500"]);
    const attempts = await Promise.allSettled([one.run(), two.run()]);
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((x) => x.status === "rejected")).toHaveLength(1);
    const review = (await read(f)).financial_corrections!.records[0]!;
    await expect(
      pool.query(
        "insert into hr_settlement_correction_review(tenant_id,company_id,id,case_id,source_hash,snapshot,lines,net_delta_minor,authority_reference,reason,requested_by) select tenant_id,company_id,$3,case_id,source_hash,snapshot||jsonb_build_object('employment_status','active'),lines,net_delta_minor,authority_reference,reason,requested_by from hr_settlement_correction_review where tenant_id=$1 and id=$2",
        [tenant, review.id, randomUUID()],
      ),
    ).rejects.toThrow("source evidence changed");
    await expect(
      pool.query(
        "insert into hr_settlement_correction_review(tenant_id,company_id,id,case_id,source_hash,snapshot,lines,net_delta_minor,authority_reference,reason,requested_by) select tenant_id,company_id,$3,case_id,source_hash,snapshot,lines,'1',authority_reference,reason,requested_by from hr_settlement_correction_review where tenant_id=$1 and id=$2",
        [tenant, review.id, randomUUID()],
      ),
    ).rejects.toThrow("reconcile exactly");
    const rls = (
      await pool.query(
        "select relrowsecurity,relforcerowsecurity from pg_class where oid='hr_settlement_correction_review'::regclass",
      )
    ).rows[0];
    expect(rls).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });
  it("captures consumed Payroll evidence, rejects stale approval after actual Finance posting, and preserves the posted obligation on a fresh review", async () => {
    let base: Fixture, f: Awaited<ReturnType<typeof attachSalaryBenefit>>;
    const prod = await createProductionJournalFixture(
      pool,
      async (p) => {
        f = await attachSalaryBenefit(pool, base!, p.component.id);
        await f.decideSalary("submit_rule");
        await f.decideSalary("approve_rule", "r06.checker");
        await f.addSalary();
        await f.salaryCaseAction("submit");
        await f.salaryCaseAction("approve", "r06.checker");
        await f.repo.actOnLifecycleCase(
          salaryBenefitActor(),
          {
            action: "prepare_payroll",
            company_id: f.companyId,
            id: f.statement.id,
            expected_version: (await f.salaryRow()).version,
            month: p.month,
            unprocessed_entitlements_only: true,
            mappings: [
              { line_index: 0, component_id: null, exclusion_reason: "Reviewed zero amount only" },
              { line_index: 1, component_id: p.component.id, exclusion_reason: "" },
            ],
            reason: "Reviewed original salary benefit for Payroll",
          },
          randomUUID(),
          "test",
        );
        const id = (
          await pool.query(
            "select adjustment_id from hr_settlement_payroll_link where tenant_id=$1 and case_id=$2 and line_index=1",
            [tenant, f.statement.id],
          )
        ).rows[0].adjustment_id;
        for (const action of ["submit", "approve"] as const) {
          const who = action === "approve" ? "r06.checker" : "r06.maker",
            w = await f.repo.getPayrollWorkspace(runActor(who), {
              company_id: f.companyId,
              month: p.month,
              section: "adjustments",
              search: "",
              limit: 25,
              offset: 0,
            }),
            r = w.items.find((x) => x.id === id)!;
          await f.repo.actOnPayrollRecord(
            runActor(who),
            id,
            {
              company_id: f.companyId,
              section: "adjustments",
              action,
              expected_version: r.version,
              source_hash: r.source_hash,
              confirm_override: false,
              reason: "Independent original Payroll input review",
            },
            randomUUID(),
            "test",
          );
        }
      },
      async (p) => {
        base = await createBenefitFixture(pool, { fixture: p, person: p.person });
        fixtures.push(base);
      },
    );
    await grants(prod.companyId);
    // Salary evidence retains its stronger private-read permission in addition to correction authority.
    const correctionActor = (who = "r06.maker") => salaryBenefitActor(who);
    async function salaryRead(who = "r06.maker") {
      return (
        await f!.repo.getLifecycleCaseWorkspace(correctionActor(who), {
          company_id: f!.companyId,
          section: "settlement",
          search: "",
          limit: 25,
          offset: 0,
        })
      ).items.find((x) => x.id === f!.statement.id)!;
    }
    async function request() {
      const r = await salaryRead();
      return f!.repo.actOnLifecycleCase(
        correctionActor(),
        {
          action: "request_financial_correction",
          company_id: f!.companyId,
          id: f!.statement.id,
          expected_version: r.version,
          correction_source_hash: r.financial_corrections!.source_hash,
          corrections: [
            { line_index: 0, corrected_minor: "0" },
            { line_index: 1, corrected_minor: "1034433" },
          ],
          authority_reference: "Synthetic approved compensating amount review",
          reason: "Post-finalization review retains original salary and statutory evidence",
        },
        randomUUID(),
        "test",
      );
    }
    await request();
    await prod.journalAction("prepare");
    await prod.journalAction("accept", "r06.checker");
    await prod.journalAction("post", "r06.target");
    const posted = await salaryRead("r06.checker"),
      review = posted.financial_corrections!.records[0]!;
    expect(review.stale).toBe(true);
    expect(review.can_approve).toBe(false);
    expect(review.can_reject).toBe(true);
    const decision = (which: "approve" | "reject") =>
      f!.repo.actOnLifecycleCase(
        correctionActor("r06.checker"),
        {
          action: "decide_financial_correction",
          company_id: f!.companyId,
          id: f!.statement.id,
          expected_version: posted.version,
          correction_id: review.id,
          decision: which,
          reason: "Independent correction review against current posted evidence",
        },
        randomUUID(),
        "test",
      );
    await expect(decision("approve")).rejects.toMatchObject({ status: 409 });
    await decision("reject");
    await request();
    const latest = await salaryRead("r06.checker"),
      fresh = latest.financial_corrections!.records[0]!;
    await f!.repo.actOnLifecycleCase(
      correctionActor("r06.checker"),
      {
        action: "decide_financial_correction",
        company_id: f!.companyId,
        id: f!.statement.id,
        expected_version: latest.version,
        correction_id: fresh.id,
        decision: "approve",
        reason: "Independent review acknowledges separate statutory and Payroll correction",
      },
      randomUUID(),
      "test",
    );
    const done = await salaryRead();
    expect(done.financial_corrections!.records[0]).toMatchObject({ state: "approved", net_delta_minor: "1100" });
    expect(done.payroll_links.find((x) => x.line_index === 1)).toMatchObject({
      state: "consumed",
      finance_state: "posted",
    });
    expect(
      (
        await pool.query("select state from hr_payroll_period where tenant_id=$1 and company_id=$2", [
          tenant,
          prod.companyId,
        ])
      ).rows[0].state,
    ).toBe("posted");
  });
});
