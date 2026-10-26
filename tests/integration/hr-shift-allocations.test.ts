import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import {
  createHrShiftRequestSchema,
  createHrShiftAllocationRequestSchema,
  hrShiftAllocationDetailSchema,
  hrShiftResolutionSchema,
} from "../../packages/contracts/src/hr/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { SourceHrRepository, type HrActorContext } from "../../server/api/src/modules/hr/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";
import { createShiftAllocationFixture } from "./hr-shift-allocation-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;
const key = () => `roster-${randomUUID()}`,
  corr = "shift-allocation-integration";
const day = (date: string, n: number) =>
  new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const actor = (
  userId = "r06.maker",
  permissions = ["hr.attendance.shift.read", "hr.attendance.shift.manage"],
): HrActorContext => ({
  tenantId: sourceTestTenantId,
  actor: {
    tenantId: sourceTestTenantId,
    organizationName: "Roster tests",
    userId,
    email: `${userId}@example.test`,
    displayName: userId,
    roles: ["hr_manager"],
    permissions,
    sessionVersion: 1,
  },
});
run("Live effective-dated shift allocations", () => {
  let pool: DatabasePool, repo: SourceHrRepository, f: Awaited<ReturnType<typeof createShiftAllocationFixture>>;
  const extraFixtures: Awaited<ReturnType<typeof createShiftAllocationFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
    f = await createShiftAllocationFixture(pool);
  });
  afterAll(async () => {
    for (const fixture of [f, ...extraFixtures]) if (fixture) await fixture.dispose();
    await pool?.end();
  });
  const shift = async (extra = {}) =>
    repo.createShift(
      actor(),
      createHrShiftRequestSchema.parse({
        company_id: f.companyId,
        code: `S-${randomUUID().slice(0, 8).toUpperCase()}`,
        name: "Roster test day shift",
        kind: "fixed",
        start_minute: 540,
        end_minute: 1020,
        required_work_minutes: 420,
        grace_in_minutes: 15,
        grace_out_minutes: 10,
        minimum_present_minutes: 120,
        half_day_minutes: 240,
        overtime_after_minutes: 30,
        weekly_off_days: [0, 6],
        breaks: [{ label: "Unpaid meal", minutes: 60, paid: false }],
        time_zone: "Asia/Karachi",
        work_location_id: null,
        reason: "Controlled allocation integration working rules",
        ...extra,
      }),
      key(),
      corr,
    );
  const input = (scope: "employee" | "department" | "branch", scopeId: string, shiftId: string, extra = {}) =>
    createHrShiftAllocationRequestSchema.parse({
      company_id: f.companyId,
      scope,
      scope_id: scopeId,
      shift_id: shiftId,
      effective_from: f.today,
      effective_to: null,
      reason: "Controlled working roster allocation",
      ...extra,
    });
  const create = (body: ReturnType<typeof input>, token = key()) =>
    repo.createShiftAllocation(actor(), body, token, corr);
  const get = (id: string) => repo.getShiftAllocation(actor(), f.companyId, id);
  const resolve = (employeeId: string, date = f.today) =>
    repo.resolveEmployeeShift(actor(), { company_id: f.companyId, employee_id: employeeId, on_date: date });
  it("scopes directory, employee choices and mutations to attendance permissions and company", async () => {
    const target = await f.target(),
      s = await shift(),
      record = await create(input("employee", target.employeeId, s.id));
    const choices = await repo.getShiftAllocationContext(actor(), {
      company_id: f.companyId,
      scope: "employee",
      on_date: f.today,
    });
    expect(choices.targets.some((t) => t.id === target.employeeId)).toBe(true);
    await expect(
      repo.getShiftAllocationContext(actor("r06.restricted"), {
        company_id: f.companyId,
        scope: "branch",
        on_date: f.today,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(repo.getShiftAllocation(actor("r06.maker", []), f.companyId, record.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      repo.createShiftAllocation(
        actor("r06.maker", ["hr.attendance.shift.read"]),
        input("employee", target.employeeId, s.id),
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(repo.getShiftAllocation(actor(), "nexora-r06-uat-company", record.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(resolve("r06-uat-employee-target")).rejects.toMatchObject({ status: 404 });
    const foreign = actor();
    foreign.tenantId = "foreign";
    foreign.actor.tenantId = "foreign";
    await expect(repo.getShiftAllocation(foreign, f.companyId, record.id)).rejects.toMatchObject({ status: 403 });
  });
  it("resolves employee over department over branch and retains lower-priority defaults", async () => {
    const t = await f.target(),
      a = await shift(),
      b = await shift(),
      c = await shift();
    const branch = await create(input("branch", t.branchId, a.id));
    expect((await resolve(t.employeeId)).resolved_shift?.id).toBe(a.id);
    const department = await create(input("department", t.departmentId, b.id));
    expect((await resolve(t.employeeId)).resolved_shift?.id).toBe(b.id);
    const employee = await create(input("employee", t.employeeId, c.id));
    const result = await resolve(t.employeeId);
    expect(hrShiftResolutionSchema.safeParse(result).success).toBe(true);
    expect(result.contenders.map((r) => r.id)).toEqual([employee.id, department.id, branch.id]);
    expect(result.resolved_shift?.id).toBe(c.id);
    await repo.closeShiftAllocation(
      actor(),
      employee.id,
      {
        company_id: f.companyId,
        expected_version: 1,
        action: "cancel",
        effective_to: null,
        reason: "Withdraw the unstarted personal override",
      },
      key(),
      corr,
    );
    expect((await resolve(t.employeeId)).winning_assignment_id).toBe(department.id);
  });
  it("serializes retries and explicit replacements, preserving both intervals and audit links", async () => {
    const t = await f.target(),
      a = await shift(),
      b = await shift(),
      body = input("employee", t.employeeId, a.id, { effective_from: day(f.today, 1) }),
      token = key();
    const records = await Promise.all([create(body, token), create(body, token)]);
    expect(records[0]!.id).toBe(records[1]!.id);
    expect(records.map((r) => r.replayed).sort()).toEqual([false, true]);
    const old = records[0]!;
    const audit = await pool.query<{ source_reference: string }>(
      "select source_reference from platform_admin_audit_event where tenant_id=$1 and id=$2",
      [sourceTestTenantId, old.audit_event_id],
    );
    expect(audit.rows[0]!.source_reference).toBe(`hr:shift-assignment:${old.id}`);
    await expect(create({ ...body, reason: "Different request for same key" }, token)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    await expect(
      create(input("employee", t.employeeId, b.id, { effective_from: day(f.today, 5) })),
    ).rejects.toMatchObject({ code: "HR_SHIFT_ALLOCATION_OVERLAP" });
    const replacement = await create(
      input("employee", t.employeeId, b.id, {
        effective_from: day(f.today, 10),
        replace_assignment_id: old.id,
        expected_replace_version: 1,
      }),
    );
    expect((await get(old.id)).effective_to).toBe(day(f.today, 9));
    expect((await get(old.id)).version).toBe(2);
    expect((await get(old.id)).history[0]?.related_reference).toBe(replacement.reference);
    expect((await resolve(t.employeeId, day(f.today, 5))).resolved_shift?.id).toBe(a.id);
    expect((await resolve(t.employeeId, day(f.today, 10))).resolved_shift?.id).toBe(b.id);
    expect(hrShiftAllocationDetailSchema.safeParse(await get(replacement.id)).success).toBe(true);
    await expect(
      create(
        input("employee", t.employeeId, a.id, {
          effective_from: day(f.today, 11),
          replace_assignment_id: replacement.id,
          expected_replace_version: 2,
        }),
      ),
    ).rejects.toMatchObject({ code: "HR_SHIFT_ALLOCATION_STALE" });
    await expect(
      pool.query("update hr_shift_assignment set shift_id=$3,version=version+1 where tenant_id=$1 and id=$2", [
        sourceTestTenantId,
        old.id,
        b.id,
      ]),
    ).rejects.toThrow(/immutable/);
    await expect(
      pool.query("delete from hr_shift_assignment_event where tenant_id=$1 and assignment_id=$2", [
        sourceTestTenantId,
        old.id,
      ]),
    ).rejects.toThrow(/immutable/);
  });
  it("cancels same-start replacements without losing history or blocking unused shift retirement", async () => {
    const t = await f.target(),
      a = await shift(),
      b = await shift(),
      from = day(f.today, 7);
    const old = await create(input("department", t.departmentId, a.id, { effective_from: from }));
    const replacement = await create(
      input("department", t.departmentId, b.id, {
        effective_from: from,
        replace_assignment_id: old.id,
        expected_replace_version: 1,
      }),
    );
    expect((await get(old.id)).state).toBe("cancelled");
    expect((await get(replacement.id)).replaces_assignment_id).toBe(old.id);
    await repo.changeShiftStatus(
      actor(),
      a.id,
      {
        company_id: f.companyId,
        expected_version: 1,
        status: "inactive",
        reason: "Retire a cancelled unstarted shift policy",
      },
      key(),
      corr,
    );
    const token = key(),
      body = {
        company_id: f.companyId,
        expected_version: 1,
        action: "cancel" as const,
        effective_to: null,
        reason: "Cancel future allocation before work begins",
      };
    await repo.closeShiftAllocation(actor(), replacement.id, body, token, corr);
    expect((await repo.closeShiftAllocation(actor(), replacement.id, body, token, corr)).replayed).toBe(true);
    expect((await resolve(t.employeeId, from)).blockers).toContain(
      "No employee, department or branch shift is assigned on this date.",
    );
  });
  it("closes prospectively, rejects extensions/backdating and leaves ended evidence readable", async () => {
    const t = await f.target(),
      s = await shift(),
      record = await create(input("employee", t.employeeId, s.id));
    const change = (end: string, version = 1) =>
      repo.closeShiftAllocation(
        actor(),
        record.id,
        {
          company_id: f.companyId,
          expected_version: version,
          action: "close",
          effective_to: end,
          reason: "Set the final day of this working arrangement",
        },
        key(),
        corr,
      );
    await expect(change(day(f.today, -2))).rejects.toMatchObject({ code: "HR_SHIFT_ALLOCATION_PROTECTED" });
    await change(day(f.today, 5));
    await expect(change(day(f.today, 10), 2)).rejects.toMatchObject({ code: "HR_SHIFT_ALLOCATION_PROTECTED" });
    expect((await resolve(t.employeeId, day(f.today, 6))).resolved_shift).toBeNull();
    await expect(create(input("branch", t.branchId, s.id, { effective_from: day(f.today, -1) }))).rejects.toMatchObject(
      { code: "HR_SHIFT_ALLOCATION_RETROACTIVE" },
    );
    const historyTarget = await f.target(),
      legacyId = `historic-roster-${randomUUID()}`;
    await pool.query(
      "insert into hr_shift_assignment (id,tenant_id,company_id,scope,scope_id,shift_id,effective_from,effective_to,created_by) values ($1,$2,$3,'employee',$4,$5,current_date-10,current_date-1,'r06.maker')",
      [legacyId, sourceTestTenantId, f.companyId, historyTarget.employeeId, s.id],
    );
    expect((await get(legacyId)).state).toBe("ended");
    await expect(
      repo.closeShiftAllocation(
        actor(),
        legacyId,
        {
          company_id: f.companyId,
          expected_version: 1,
          action: "cancel",
          effective_to: null,
          reason: "Attempt to rewrite historical evidence",
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_SHIFT_ALLOCATION_FINAL" });
    expect((await resolve(historyTarget.employeeId, day(f.today, -1))).resolved_shift?.id).toBe(s.id);
  });
  it("requires full approved employment coverage and correct site and organisation scope", async () => {
    const t = await f.target(day(f.today, 3)),
      s = await shift();
    await expect(
      create(input("employee", t.employeeId, s.id, { effective_to: day(f.today, 10) })),
    ).rejects.toMatchObject({ code: "HR_SHIFT_ALLOCATION_EMPLOYMENT_REQUIRED" });
    await create(input("employee", t.employeeId, s.id, { effective_to: day(f.today, 3) }));
    const draft = await repo.createEmployeeDraft(
      actor("r06.maker", ["hr.employee.create"]),
      {
        company_id: f.companyId,
        employee_number: `D-${randomUUID().slice(0, 8).toUpperCase()}`,
        first_name: "Unapproved",
        last_name: "Roster",
        joined_on: f.today,
      },
      key(),
      corr,
    );
    await expect(create(input("employee", draft.id, s.id))).rejects.toMatchObject({
      code: "HR_SHIFT_ALLOCATION_EMPLOYMENT_REQUIRED",
    });
    const siteShift = await shift({ work_location_id: f.masters.work_location });
    const another = await f.target();
    await expect(create(input("branch", another.branchId, siteShift.id))).rejects.toMatchObject({
      code: "HR_SHIFT_ALLOCATION_LOCATION_MISMATCH",
    });
    await expect(create(input("department", another.branchId, s.id))).rejects.toMatchObject({
      code: "HR_SHIFT_ALLOCATION_PROTECTED",
    });
    await create(input("employee", another.employeeId, siteShift.id));
    const location = await repo.createMaster(
      actor("r06.maker", ["hr.master.create"]),
      {
        company_id: f.companyId,
        type: "work_location",
        code: `SITE-${randomUUID().slice(0, 8).toUpperCase()}`,
        name: `Different roster site ${randomUUID()}`,
        description: "Isolated location mismatch check",
        configuration_key: "working_pattern",
        configuration_value: "on_site",
      },
      key(),
      corr,
    );
    const elsewhere = await shift({ work_location_id: location.id }),
      newTarget = await f.target();
    await expect(create(input("employee", newTarget.employeeId, elsewhere.id))).rejects.toMatchObject({
      code: "HR_SHIFT_ALLOCATION_LOCATION_MISMATCH",
    });
    const blocked = await shift();
    await repo.changeShiftStatus(
      actor(),
      blocked.id,
      {
        company_id: f.companyId,
        expected_version: 1,
        status: "inactive",
        reason: "Retire unused inactive configuration",
      },
      key(),
      corr,
    );
    await expect(create(input("branch", another.branchId, blocked.id))).rejects.toMatchObject({
      code: "HR_SHIFT_ALLOCATION_PROTECTED",
    });
  });
  it("resolves weekly rotations through the dated allocation authority", async () => {
    const t = await f.target(),
      a = await shift(),
      b = await shift({ kind: "night", start_minute: 1320, end_minute: 1800 });
    const weekday = new Date(f.today + "T00:00:00Z").getUTCDay(),
      anchor = day(f.today, -((weekday + 6) % 7));
    const rotation = await repo.createShift(
      actor(),
      createHrShiftRequestSchema.parse({
        company_id: f.companyId,
        code: `ROT-${randomUUID().slice(0, 8).toUpperCase()}`,
        name: "Allocated weekly cycle",
        kind: "rotating",
        time_zone: "Asia/Karachi",
        work_location_id: null,
        rotation_anchor_date: anchor,
        rotation_shift_ids: [a.id, b.id],
        reason: "Weekly cycle allocated to operations",
      }),
      key(),
      corr,
    );
    await create(input("branch", t.branchId, rotation.id));
    expect((await resolve(t.employeeId)).resolved_shift?.id).toBe(a.id);
    const next = await resolve(t.employeeId, day(f.today, 7));
    expect(next.resolved_shift?.id).toBe(b.id);
    expect(next.resolved_shift?.end_minute).toBe(1800);
  });
  it("rejects locked-period changes and rolls back replacement without altering old evidence", async () => {
    const locked = await createShiftAllocationFixture(pool);
    extraFixtures.push(locked);
    const t = await locked.target();
    const s = await shift({ company_id: locked.companyId });
    const old = await create({ ...input("employee", t.employeeId, s.id), company_id: locked.companyId });
    const month = new Date(Date.UTC(Number(locked.today.slice(0, 4)), Number(locked.today.slice(5, 7)), 1))
      .toISOString()
      .slice(0, 10);
    await pool.query(
      "insert into hr_attendance_period (id,tenant_id,company_id,month,state,opened_by,locked_by,locked_at,source_hash) values ($1,$2,$3,$4,'locked','r06.maker','r06.checker',now(),$5)",
      [`roster-locked-${randomUUID()}`, sourceTestTenantId, locked.companyId, month, "a".repeat(64)],
    );
    await expect(
      create({
        ...input("employee", t.employeeId, s.id, {
          effective_from: month,
          replace_assignment_id: old.id,
          expected_replace_version: 1,
        }),
        company_id: locked.companyId,
      }),
    ).rejects.toMatchObject({ code: "HR_SHIFT_ALLOCATION_PERIOD_LOCKED" });
    const after = await repo.getShiftAllocation(actor(), locked.companyId, old.id);
    expect(after.version).toBe(1);
    expect(after.effective_to).toBeNull();
    expect(after.history).toHaveLength(1);
  });
  it("keeps future roster targets active until their defaults are closed or cancelled", async () => {
    const manager = actor("r06.maker", ["hr.organization.update"]);
    const branch = await repo.createOrganizationUnit(
      manager,
      {
        company_id: f.companyId,
        parent_id: f.companyId,
        type: "branch",
        code: `FUT-${randomUUID().slice(0, 8).toUpperCase()}`,
        name: "Future roster branch without employees",
      },
      key(),
      corr,
    );
    const s = await shift(),
      allocation = await create(input("branch", branch.id, s.id, { effective_from: day(f.today, 10) }));
    await expect(
      repo.changeOrganizationUnitStatus(
        manager,
        branch.id,
        { company_id: f.companyId, status: "inactive" },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_ORGANIZATION_UNIT_IN_SHIFT_USE" });
    await repo.closeShiftAllocation(
      actor(),
      allocation.id,
      {
        company_id: f.companyId,
        expected_version: 1,
        action: "cancel",
        effective_to: null,
        reason: "Cancel future default before closing this unit",
      },
      key(),
      corr,
    );
    await repo.changeOrganizationUnitStatus(
      manager,
      branch.id,
      { company_id: f.companyId, status: "inactive" },
      key(),
      corr,
    );
    expect((await get(allocation.id)).state).toBe("cancelled");
  });
  it("validates HTTP authentication, CSRF/origin, scope schemas and documented reads", async () => {
    const session = {
      sessionId: "roster-session",
      tenantId: sourceTestTenantId,
      userId: "r06.maker",
      csrfToken: "c".repeat(43),
      idleExpiresAt: new Date("2099-01-01"),
      absoluteExpiresAt: new Date("2099-01-01"),
    };
    const api = createApp({
      config: { allowedOrigins: new Set(["https://hr.example.test"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      hrRepository: repo,
      authService: { loadAuthenticatedAccount: vi.fn(async () => actor().actor) } as unknown as TenantAuthApiService,
      sessionService: {
        get: vi.fn(async () => session),
        authorizeMutation: vi.fn(async (_token: string, csrf: string) =>
          csrf === session.csrfToken ? { status: "ok", session } : { status: "invalid_csrf" },
        ),
      } as unknown as TenantSessionApiService,
    });
    const target = await f.target(),
      s = await shift(),
      body = input("employee", target.employeeId, s.id);
    expect((await request(api).get(`/api/v1/hr/shift_assignments?company_id=${f.companyId}`)).status).toBe(401);
    const send = (origin: string, csrf: string, data: object) =>
      request(api)
        .post("/api/v1/hr/shift_assignments")
        .set("cookie", "nexora_session=test")
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", key())
        .send(data);
    expect((await send("https://evil.example", session.csrfToken, body)).status).toBe(403);
    expect((await send("https://hr.example.test", "bad", body)).status).toBe(403);
    expect((await send("https://hr.example.test", session.csrfToken, { ...body, salary: "1" })).status).toBe(400);
    const created = await send("https://hr.example.test", session.csrfToken, body);
    expect(created.status).toBe(201);
    const read = await request(api)
      .get(`/api/v1/hr/shift_assignments/${created.body.id}?company_id=${f.companyId}`)
      .set("cookie", "nexora_session=test");
    expect(read.status).toBe(200);
    expect(hrShiftAllocationDetailSchema.safeParse(read.body).success).toBe(true);
    const resolveResponse = await request(api)
      .get(`/api/v1/hr/shift_resolution?company_id=${f.companyId}&employee_id=${target.employeeId}&on_date=${f.today}`)
      .set("cookie", "nexora_session=test");
    expect(resolveResponse.status).toBe(200);
    expect(hrShiftResolutionSchema.safeParse(resolveResponse.body).success).toBe(true);
    expect(JSON.stringify(resolveResponse.body)).not.toContain("personal_email");
    const before = (
      await pool.query<{ n: number }>(
        "select count(*)::int as n from hr_payroll_input where tenant_id=$1 and company_id=$2",
        [sourceTestTenantId, f.companyId],
      )
    ).rows[0]!.n;
    expect(before).toBe(0);
  });
});
