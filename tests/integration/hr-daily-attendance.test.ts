import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import {
  createHrShiftRequestSchema,
  hrDailyAttendanceQuerySchema,
  hrDailyAttendanceDirectorySchema,
} from "../../packages/contracts/src/hr/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceHrRepository, type HrActorContext } from "../../server/api/src/modules/hr/source-repository.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";
import { createShiftAllocationFixture } from "./hr-shift-allocation-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;
const permissions = [
  "hr.attendance.read",
  "hr.attendance.punch.read",
  "hr.attendance.shift.read",
  "hr.attendance.shift.manage",
];
const actor = (userId = "r06.maker", grants = permissions): HrActorContext => ({
  tenantId: sourceTestTenantId,
  actor: {
    tenantId: sourceTestTenantId,
    userId,
    organizationName: "Attendance tests",
    email: userId + "@example.test",
    displayName: userId,
    roles: ["hr_manager"],
    permissions: grants,
    sessionVersion: 1,
  },
});
run("Live Daily Attendance", () => {
  let pool: DatabasePool,
    repo: SourceHrRepository,
    f: Awaited<ReturnType<typeof createShiftAllocationFixture>>,
    target: Awaited<ReturnType<typeof f.target>>,
    shiftId: string;
  const query = (extra = {}) =>
    hrDailyAttendanceQuerySchema.parse({ company_id: f.companyId, on_date: f.today, ...extra });
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
    f = await createShiftAllocationFixture(pool);
    target = await f.target();
    const s = await repo.createShift(
      actor(),
      createHrShiftRequestSchema.parse({
        company_id: f.companyId,
        code: "DAY",
        name: "Attendance Office",
        kind: "fixed",
        start_minute: 0,
        end_minute: 480,
        required_work_minutes: 420,
        grace_in_minutes: 15,
        grace_out_minutes: 10,
        minimum_present_minutes: 120,
        half_day_minutes: 240,
        overtime_after_minutes: 30,
        weekly_off_days: [],
        breaks: [{ label: "Meal", minutes: 60, paid: false }],
        time_zone: "Asia/Karachi",
        work_location_id: null,
        reason: "Controlled daily attendance integration",
      }),
      randomUUID(),
      "attendance-tests",
    );
    shiftId = s.id;
    await repo.createShiftAllocation(
      actor(),
      {
        company_id: f.companyId,
        scope: "employee",
        scope_id: target.employeeId,
        shift_id: s.id,
        effective_from: f.today,
        effective_to: null,
        reason: "Daily attendance test roster",
      },
      randomUUID(),
      "attendance-tests",
    );
    // Immutable synthetic device evidence; no business record in the local application DB.
    for (const [direction, hour] of [
      ["in", 0],
      ["out", 8],
    ] as const)
      await pool.query(
        "insert into hr_attendance_punch (id,tenant_id,company_id,employee_id,work_date,occurred_at,direction,source,source_reference,captured_by) values ($1,$2,$3,$4,$5,($5::date+$6*interval '1 hour') at time zone 'Asia/Karachi',$7,'biometric',$1,'r06.maker')",
        ["daily-punch-" + randomUUID(), sourceTestTenantId, f.companyId, target.employeeId, f.today, hour, direction],
      );
  });
  afterAll(async () => {
    if (f) await f.dispose();
    await pool?.end();
  });
  it("reads actual placement, priority, timezone and immutable evidence", async () => {
    const data = await repo.listDailyAttendance(actor(), query());
    expect(hrDailyAttendanceDirectorySchema.safeParse(data).success).toBe(true);
    expect(data.total).toBe(1);
    expect(data.items[0]).toMatchObject({
      employee_id: target.employeeId,
      shift_id: shiftId,
      allocation_scope: "employee",
      punch_count: 2,
      worked_minutes: 420,
    });
    expect(data.items[0]?.punches).toHaveLength(2);
    expect(data.items[0]?.scheduled_end).toBe(new Date(f.today + "T08:00:00+05:00").toISOString());
  });
  it("enforces attendance permission, company grants and tenant isolation", async () => {
    await expect(repo.listDailyAttendance(actor("r06.maker", []), query())).rejects.toMatchObject({ status: 403 });
    await expect(repo.listDailyAttendance(actor("r06.restricted"), query())).rejects.toMatchObject({ status: 403 });
    await expect(repo.listDailyAttendance({ ...actor(), tenantId: "other-tenant" }, query())).rejects.toMatchObject({
      status: 403,
    });
  });
  it("lets attendance-only readers choose companies but redacts raw punches", async () => {
    const limited = actor("r06.maker", ["hr.attendance.read"]);
    expect((await repo.listCompanies(limited)).items.some((c) => c.id === f.companyId)).toBe(true);
    const data = await repo.listDailyAttendance(limited, query());
    expect(data.can_read_punches).toBe(false);
    expect(data.items[0]?.punches).toBeNull();
    expect(JSON.stringify(data)).not.toContain("source_reference");
  });
  it("searches and paginates with stable totals and excludes draft placements", async () => {
    await f.target();
    const first = await repo.listDailyAttendance(actor(), query({ limit: 1 })),
      next = await repo.listDailyAttendance(actor(), query({ limit: 1, offset: 1 }));
    expect(first.total).toBe(2);
    expect(first.items[0]?.employee_id).not.toBe(next.items[0]?.employee_id);
    const empty = await repo.listDailyAttendance(actor(), query({ search: "%_\\'" }));
    expect(empty.total).toBe(0);
    expect((await repo.listDailyAttendance(actor(), query({ search: target.employeeId }))).total).toBe(0);
  });
  it("matches roster preview and flags a missing shift without fabricated absence", async () => {
    const data = await repo.listDailyAttendance(actor(), query());
    const unassigned = data.items.find((r) => r.employee_id !== target.employeeId);
    expect(unassigned?.status).toBe("needs_review");
    const resolution = await repo.resolveEmployeeShift(actor(), {
      company_id: f.companyId,
      employee_id: target.employeeId,
      on_date: f.today,
    });
    expect(data.items.find((r) => r.employee_id === target.employeeId)?.shift_id).toBe(resolution.resolved_shift?.id);
  });
  it("batch-loads a full page with a constant query count", async () => {
    for (let i = 0; i < 49; i++) await f.target();
    let calls = 0;
    const measuredPool = {
      connect: async () => {
        const client = await pool.connect();
        return new Proxy(client, {
          get(target, key) {
            if (key === "query")
              return (...args: unknown[]) => {
                calls++;
                return Reflect.apply(target.query, target, args);
              };
            if (key === "release") return target.release.bind(target);
            return Reflect.get(target, key);
          },
        });
      },
    } as unknown as DatabasePool;
    const measured = new SourceHrRepository(measuredPool);
    await measured.listDailyAttendance(actor(), query({ limit: 1 }));
    const one = calls;
    calls = 0;
    const started = performance.now(),
      page = await measured.listDailyAttendance(actor(), query({ limit: 50 }));
    expect(page.total).toBe(51);
    expect(page.items).toHaveLength(50);
    expect(calls).toBe(one);
    expect(calls).toBeLessThanOrEqual(12);
    console.log(
      `Daily Attendance: 50 employees, ${calls} SQL statements including transaction/security, ${Math.round(performance.now() - started)}ms local integration read.`,
    );
    expect((await repo.listDailyAttendance(actor(), query({ offset: 50 }))).items).toHaveLength(1);
  });

  it("applies only final correction evidence and scoped calendar authority", async () => {
    const person = await f.target();
    await repo.createShiftAllocation(
      actor(),
      {
        company_id: f.companyId,
        scope: "department",
        scope_id: person.departmentId,
        shift_id: shiftId,
        effective_from: f.today,
        effective_to: null,
        reason: "Attendance approval authority test",
      },
      randomUUID(),
      "attendance-tests",
    );
    const correction = "daily-correction-" + randomUUID();
    await pool.query(
      "insert into hr_attendance_correction (id,tenant_id,company_id,employee_id,work_date,kind,stated_in,stated_out,reason,status,requested_by) values ($1,$2,$3,$4,$5,'incorrect_attendance',($5::date+interval '0 hours') at time zone 'Asia/Karachi',($5::date+interval '8 hours') at time zone 'Asia/Karachi','Controlled correction evidence','pending_hr','r06.maker')",
      [correction, sourceTestTenantId, f.companyId, person.employeeId, f.today],
    );
    const before = (await repo.listDailyAttendance(actor(), query({ limit: 100 }))).items.find(
      (r) => r.employee_id === person.employeeId,
    )!;
    expect(before.correction_applied).toBe(false);
    await pool.query(
      "update hr_attendance_correction set status='approved',hr_decided_by='r06.checker',hr_decided_at=now() where tenant_id=$1 and id=$2",
      [sourceTestTenantId, correction],
    );
    const after = (await repo.listDailyAttendance(actor(), query({ limit: 100 }))).items.find(
      (r) => r.employee_id === person.employeeId,
    )!;
    expect(after.correction_applied).toBe(true);
    expect(after.worked_minutes).toBe(420);
    expect(after.punch_count).toBe(0);
    expect(after.allocation_scope).toBe("department");
    await pool.query(
      "insert into hr_holiday (id,tenant_id,company_id,branch_id,holiday_date,name,optional,created_by) values ($1,$2,$3,$4,$5,'Branch public holiday',false,'r06.maker')",
      ["daily-holiday-" + randomUUID(), sourceTestTenantId, f.companyId, person.branchId, f.today],
    );
    expect(
      (await repo.listDailyAttendance(actor(), query({ limit: 100 }))).items.find(
        (r) => r.employee_id === person.employeeId,
      )?.status,
    ).toBe("holiday");
    expect(
      (await repo.listDailyAttendance(actor(), query({ limit: 100 }))).items.find(
        (r) => r.employee_id === target.employeeId,
      )?.status,
    ).not.toBe("holiday");
  });

  it("reads approved leave from exact per-day allocations without extending it across the whole request", async () => {
    const person = await f.target();
    await repo.createShiftAllocation(
      actor(),
      {
        company_id: f.companyId,
        scope: "employee",
        scope_id: person.employeeId,
        shift_id: shiftId,
        effective_from: f.today,
        effective_to: null,
        reason: "Approved daily leave test assignment",
      },
      randomUUID(),
      "attendance-tests",
    );
    const typeId = "daily-leave-type-" + randomUUID(),
      policyId = "daily-leave-policy-" + randomUUID(),
      requestId = "daily-leave-request-" + randomUUID();
    await pool.query(
      "insert into hr_leave_type (id,tenant_id,company_id,code,name,paid,annual_entitlement_days,accrual_method,carry_forward,maximum_carry_forward_days,maximum_balance_days,minimum_request_days,maximum_request_days,requires_hr_approval,created_by) values ($1,$2,$3,'ANNUAL','Annual leave',true,20,'annual_grant',false,0,20,0.5,20,true,'r06.maker')",
      [typeId, sourceTestTenantId, f.companyId],
    );
    await pool.query(
      "insert into hr_leave_policy_version (id,tenant_id,company_id,leave_type_id,version_number,effective_from,annual_entitlement_days,accrual_method,carry_forward,maximum_carry_forward_days,maximum_balance_days,minimum_request_days,maximum_request_days,requires_hr_approval,created_by) values ($1,$2,$3,$4,1,'2020-01-01',20,'annual_grant',false,0,20,0.5,20,true,'r06.maker')",
      [policyId, sourceTestTenantId, f.companyId, typeId],
    );
    await pool.query(
      "insert into hr_leave_request (id,tenant_id,company_id,employee_id,leave_type_id,from_date,to_date,requested_days,reason,status,requested_by) values ($1,$2,$3,$4,$5,$6::date,$6::date+1,0.5,'Synthetic partial leave evidence','approved','r06.maker')",
      [requestId, sourceTestTenantId, f.companyId, person.employeeId, typeId, f.today],
    );
    await pool.query(
      "insert into hr_leave_request_day (id,tenant_id,company_id,request_id,employee_id,leave_type_id,policy_version_id,leave_date,days) values ($1,$2,$3,$4,$5,$6,$7,$8,0.5)",
      [
        "daily-leave-day-" + randomUUID(),
        sourceTestTenantId,
        f.companyId,
        requestId,
        person.employeeId,
        typeId,
        policyId,
        f.today,
      ],
    );
    const current = (await repo.listDailyAttendance(actor(), query({ limit: 100 }))).items.find(
      (r) => r.employee_id === person.employeeId,
    )!;
    expect(current).toMatchObject({ status: "needs_review", leave_days: "0.5" });
    expect(current.issues).toContain("Partial leave is missing an explicit half-day allocation.");
    const next = new Date(Date.parse(f.today + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
    expect(
      (await repo.listDailyAttendance(actor(), query({ limit: 100, on_date: next }))).items.find(
        (r) => r.employee_id === person.employeeId,
      )?.leave_days,
    ).toBe("0");
  });

  it("does not change punches, locked periods or payroll inputs on refresh", async () => {
    const id = "daily-period-" + randomUUID();
    await pool.query(
      "insert into hr_attendance_period (id,tenant_id,company_id,month,state,opened_by,locked_by,locked_at,source_hash) values ($1,$2,$3,date_trunc('month',$4::date),'locked','r06.maker','r06.checker',now(),'controlled-test-hash')",
      [id, sourceTestTenantId, f.companyId, f.today],
    );
    const a = await repo.listDailyAttendance(actor(), query()),
      b = await repo.listDailyAttendance(actor(), query());
    expect(b.period_state).toBe("locked");
    expect(b.items).toEqual(a.items);
    expect(
      (
        await pool.query("select source_hash from hr_attendance_period where tenant_id=$1 and id=$2", [
          sourceTestTenantId,
          id,
        ])
      ).rows[0]?.source_hash,
    ).toBe("controlled-test-hash");
    expect(
      (
        await pool.query("select count(*)::int as n from hr_payroll_input where tenant_id=$1 and company_id=$2", [
          sourceTestTenantId,
          f.companyId,
        ])
      ).rows[0]?.n,
    ).toBe(0);
  });
  it("serves the authenticated documented route and validates bounds", async () => {
    const session = {
      sessionId: "attendance-test-session",
      tenantId: sourceTestTenantId,
      userId: "r06.maker",
      csrfToken: "c".repeat(43),
      idleExpiresAt: new Date("2099-01-01"),
      absoluteExpiresAt: new Date("2099-01-01"),
    };
    const app = createApp({
      config: { allowedOrigins: new Set(["https://hr.example.test"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      hrRepository: repo,
      authService: { loadAuthenticatedAccount: vi.fn(async () => actor().actor) } as unknown as TenantAuthApiService,
      sessionService: { get: vi.fn(async () => session) } as unknown as TenantSessionApiService,
    });
    const route = `/api/v1/hr/daily_attendance?company_id=${f.companyId}&on_date=${f.today}`;
    expect((await request(app).get(route)).status).toBe(401);
    const response = await request(app).get(route).set("cookie", "nexora_session=test");
    expect(response.status).toBe(200);
    expect(hrDailyAttendanceDirectorySchema.safeParse(response.body).success).toBe(true);
    expect(
      (
        await request(app)
          .get(route + "&limit=101")
          .set("cookie", "nexora_session=test")
      ).status,
    ).toBe(400);
    expect(
      (await request(app).get(route.replace(f.today, "invalid")).set("cookie", "nexora_session=test")).status,
    ).toBe(400);
  });
});
