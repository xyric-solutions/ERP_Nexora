import { createHrLeaveTypeRequestSchema } from "../../packages/contracts/src/hr/index.js";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createPersonalLeaveFixture, leaveStaff } from "./hr-self-leave-fixture.js";
import {
  createHrSelfLeaveRequestSchema,
  hrSelfLeaveActionSchema,
  hrSelfLeaveContextQuerySchema,
} from "../../packages/contracts/src/hr/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Employee-owned leave applications with shared ERP approval", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createPersonalLeaveFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture() {
    const f = await createPersonalLeaveFixture(pool);
    fixtures.push(f);
    return f;
  }
  it("rejects employee selectors, approval actions and personal override fields", () => {
    expect(
      hrSelfLeaveContextQuerySchema.safeParse({
        company_id: "c",
        employee_id: "victim",
        from_date: "2026-10-21",
        to_date: "2026-10-21",
      }).success,
    ).toBe(false);
    expect(
      hrSelfLeaveActionSchema.safeParse({
        company_id: "c",
        action: "hr_approve",
        expected_version: 1,
        reason: "Attempt to approve personal leave",
      }).success,
    ).toBe(false);
    expect(
      hrSelfLeaveActionSchema.safeParse({
        company_id: "c",
        action: "submit",
        expected_version: 1,
        override_self_approval: true,
        reason: "Attempt a personal override",
      }).success,
    ).toBe(false);
  });
  it("creates an audited own draft, reserves on submission, then posts exact usage through normal manager and HR approval", async () => {
    const f = await fixture(),
      c = await f.context();
    expect(c.employees.map((e) => e.id)).toEqual([f.person.employeeId]);
    expect(c.documents).toEqual([]);
    expect(c.blockers).toEqual([]);
    const saved = await f.create("first_half");
    expect(saved.result.status).toBe("draft");
    expect((await f.balance()).reserved).toBe("0.0000");
    expect(await f.repo.createSelfLeaveRequest(f.own(), saved.input, saved.key, "replay")).toMatchObject({
      replayed: true,
      id: saved.result.id,
    });
    expect(await f.detail(saved.result.id)).toMatchObject({
      employee_id: f.person.employeeId,
      requested_by: f.user,
      status: "draft",
      allowed_actions: ["cancel", "submit"],
    });
    await f.action(saved.result.id, "submit");
    expect(await f.balance()).toMatchObject({ reserved: "0.5000", available: "9.5000" });
    await f.decide(saved.result.id, "manager_approve");
    expect((await f.detail(saved.result.id)).status).toBe("pending_hr");
    await f.decide(saved.result.id, "hr_approve");
    expect(await f.balance()).toMatchObject({ reserved: "0.0000", used: "0.5000", available: "9.5000" });
    const final = await f.detail(saved.result.id);
    expect(final.status).toBe("approved");
    expect(final.allowed_actions).toEqual([]);
    expect(final.history).toHaveLength(4);
    expect(
      (
        await pool.query(
          "select count(*)::int as n from hr_leave_transaction where tenant_id=$1 and source_type='leave_request' and source_id like $2",
          [tenant, saved.result.id + ":%"],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("cancels a pending own request, releases reservations and rejects stale versions", async () => {
    const f = await fixture(),
      saved = await f.create();
    await f.action(saved.result.id, "submit");
    const d = await f.detail(saved.result.id);
    await expect(
      f.repo.actOnSelfLeaveRequest(
        f.own(),
        d.id,
        {
          company_id: f.companyId,
          action: "cancel",
          expected_version: 1,
          reason: "Cancel request with a stale draft version",
        },
        randomUUID(),
        "stale",
      ),
    ).rejects.toMatchObject({ status: 409 });
    const cancelled = await f.action(d.id, "cancel");
    expect(cancelled.result.status).toBe("cancelled");
    expect(await f.balance()).toMatchObject({ available: "10.0000", reserved: "0.0000", used: "0.0000" });
    expect(await f.repo.actOnSelfLeaveRequest(f.own(), d.id, cancelled.input, cancelled.key, "replay")).toMatchObject({
      replayed: true,
    });
  });
  it("rejects stale evidence, overlapping reservations and insufficient entitlement", async () => {
    const f = await fixture(),
      c = await f.context(),
      input = {
        company_id: f.companyId,
        leave_type_id: f.type.id,
        from_date: f.today,
        to_date: f.today,
        days: [{ on_date: f.today, portion: "full" as const }],
        reason: "Reviewed personal leave source evidence",
        expected_evidence_hash: "0".repeat(64),
      };
    expect(createHrSelfLeaveRequestSchema.safeParse(input).success).toBe(true);
    await expect(f.repo.createSelfLeaveRequest(f.own(), input, randomUUID(), "stale")).rejects.toMatchObject({
      status: 409,
    });
    const saved = await f.create();
    await f.action(saved.result.id, "submit");
    expect((await f.context()).blockers.join(" ")).toMatch(/overlap/);
    await expect(
      f.repo.createSelfLeaveRequest(f.own(), { ...input, expected_evidence_hash: c.hash }, randomUUID(), "overlap"),
    ).rejects.toMatchObject({ status: 409 });
    await f.action(saved.result.id, "cancel");
    const balance = await f.balance();
    await f.repo.postLeaveBalance(
      leaveStaff(),
      {
        company_id: f.companyId,
        employee_id: f.person.employeeId,
        leave_type_id: f.type.id,
        effective_on: f.today,
        kind: "adjustment",
        days: "-10.0000",
        period_start: null,
        period_end: null,
        expected_balance_hash: balance.hash,
        reason: "Controlled isolated removal of available entitlement",
      },
      randomUUID(),
      "insufficient",
    );
    await expect(f.create()).rejects.toMatchObject({ status: 409 });
  });
  it("denies other employee records and owner replay immediately after binding or company access revocation", async () => {
    const f = await fixture(),
      saved = await f.create();
    await expect(
      f.repo.getSelfLeaveRequest(leaveStaff("r06.maker"), f.companyId, saved.result.id),
    ).rejects.toMatchObject({ status: 403 });
    await pool.query(
      "update employee_user_binding set effective_to=current_date,ended_at=now(),ended_by='r06.last-admin-a' where tenant_id=$1 and id=$2",
      [tenant, f.binding],
    );
    await expect(
      f.repo.createSelfLeaveRequest(f.own(), saved.input, saved.key, "revoked-binding-replay"),
    ).rejects.toMatchObject({ status: 403 });
    const g = await fixture(),
      pending = await g.create();
    const submitted = await g.action(pending.result.id, "submit");
    await pool.query(
      "update security_user_company_access set revoked_at=now(),revoked_by='r06.last-admin-a',revocation_reason='Isolated personal grant revocation' where tenant_id=$1 and company_id=$2 and user_id=$3 and revoked_at is null",
      [tenant, g.companyId, g.user],
    );
    await expect(
      g.repo.actOnSelfLeaveRequest(g.own(), pending.result.id, submitted.input, submitted.key, "revoked-access-replay"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("blocks impersonated writes, tenant mismatches, unauthorized personal approvals and document-required policies", async () => {
    const f = await fixture(),
      saved = await f.create();
    await expect(
      f.repo.createSelfLeaveRequest(
        { ...f.own(), impersonationRequestId: "impersonated" },
        saved.input,
        randomUUID(),
        "impersonation",
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.getSelfLeaveContext(
        { ...f.own(), tenantId: "other" },
        { company_id: f.companyId, from_date: f.today, to_date: f.today },
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.actOnSelfLeaveRequest(
        f.own(),
        saved.result.id,
        {
          company_id: f.companyId,
          action: "hr_approve",
          expected_version: 1,
          reason: "Forbidden personal HR approval",
        } as never,
        randomUUID(),
        "forbidden",
      ),
    ).rejects.toMatchObject({ status: 403 });
    await f.action(saved.result.id, "cancel");
    const docType = await f.repo.createLeaveType(
      leaveStaff(),
      createHrLeaveTypeRequestSchema.parse({
        company_id: f.companyId,
        code: "DOCUMENT",
        name: "Document-supported leave",
        paid: false,
        policy: { ...f.policy, annual_entitlement_days: "0", document_required_after_days: "0" },
        reason: "Isolated verified supporting document requirement",
      }),
      randomUUID(),
      "document-required",
    );
    const q = { company_id: f.companyId, leave_type_id: docType.id, from_date: f.today, to_date: f.today },
      context = await f.repo.getSelfLeaveContext(f.own(), q);
    await expect(
      f.repo.createSelfLeaveRequest(
        f.own(),
        {
          ...q,
          days: [{ on_date: f.today, portion: "full" }],
          reason: "Personal leave requiring verified HR document",
          expected_evidence_hash: context.hash,
        },
        randomUUID(),
        "document-required",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("reports write eligibility for an active employee and suppresses personal actions during impersonation", async () => {
    const f = await fixture(),
      saved = await f.create(),
      q = { company_id: f.companyId, month: f.today.slice(0, 7) + "-01", limit: 25, offset: 0 };
    expect((await f.repo.getSelfService(f.own(), q)).can_apply_leave).toBe(true);
    const impersonated = { ...f.own(), impersonationRequestId: "isolated-governed-impersonation" };
    expect((await f.repo.getSelfService(impersonated, q)).can_apply_leave).toBe(false);
    expect((await f.repo.getSelfLeaveRequest(impersonated, f.companyId, saved.result.id)).allowed_actions).toEqual([]);
  });
  it("rejects another employee request inside the same authorized company", async () => {
    const f = await fixture(),
      other = await f.target();
    const type = await f.repo.createLeaveType(
      leaveStaff(),
      createHrLeaveTypeRequestSchema.parse({
        company_id: f.companyId,
        code: "OTHER",
        name: "Other employee unpaid leave",
        paid: false,
        policy: { ...f.policy, annual_entitlement_days: "0" },
        reason: "Isolated same-company owner isolation",
      }),
      randomUUID(),
      "same-company-owner",
    );
    const q = {
        company_id: f.companyId,
        employee_id: other.employeeId,
        leave_type_id: type.id,
        from_date: f.today,
        to_date: f.today,
      },
      context = await f.repo.leaveContext(leaveStaff(), q);
    const request = await f.repo.createLeaveRequest(
      leaveStaff(),
      {
        ...q,
        document_id: null,
        days: [{ on_date: f.today, portion: "full" }],
        reason: "Another employee legitimate HR-prepared request",
        expected_evidence_hash: context.hash,
      },
      randomUUID(),
      "same-company-owner",
    );
    await expect(f.repo.getSelfLeaveRequest(f.own(), f.companyId, request.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      f.repo.actOnSelfLeaveRequest(
        f.own(),
        request.id,
        {
          company_id: f.companyId,
          action: "cancel",
          expected_version: 1,
          reason: "Attempt to cancel a different employee request",
        },
        randomUUID(),
        "same-company-owner",
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("stops routing to an ended reporting-manager binding while still permitting cancellation of the employee draft", async () => {
    const f = await fixture(),
      saved = await f.create();
    await pool.query(
      "update employee_user_binding set effective_to=current_date,ended_at=now(),ended_by='r06.last-admin-a' where tenant_id=$1 and user_id=$2 and employee_id=$3 and ended_at is null",
      [tenant, f.managerId, f.manager.employeeId],
    );
    expect((await f.context()).blockers.join(" ")).toMatch(/reporting manager/i);
    expect((await f.detail(saved.result.id)).allowed_actions).toEqual(["cancel"]);
    await expect(f.create()).rejects.toMatchObject({ status: 409 });
    expect((await f.action(saved.result.id, "cancel")).result.status).toBe("cancelled");
  });
});
