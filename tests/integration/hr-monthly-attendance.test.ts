import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import {
  createHrShiftRequestSchema,
  hrMonthlyAttendanceQuerySchema,
  hrMonthlyAttendanceDirectorySchema,
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
  "hr.attendance.payroll_input.read",
];
const actor = (userId = "r06.maker", grants = permissions): HrActorContext => ({
  tenantId: sourceTestTenantId,
  actor: {
    tenantId: sourceTestTenantId,
    userId,
    organizationName: "Monthly attendance tests",
    email: userId + "@example.test",
    displayName: userId,
    roles: ["hr_manager"],
    permissions: grants,
    sessionVersion: 1,
  },
});
run("Live Monthly Attendance", () => {
  let pool: DatabasePool,
    repo: SourceHrRepository,
    f: Awaited<ReturnType<typeof createShiftAllocationFixture>>,
    target: Awaited<ReturnType<typeof f.target>>,
    month: string;
  const query = (extra = {}) => hrMonthlyAttendanceQuerySchema.parse({ company_id: f.companyId, month, ...extra });
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
    f = await createShiftAllocationFixture(pool);
    target = await f.target();
    month = f.today.slice(0, 7) + "-01";
    const shift = await repo.createShift(
      actor(),
      createHrShiftRequestSchema.parse({
        company_id: f.companyId,
        code: "MONTH",
        name: "Monthly Office Shift",
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
        reason: "Controlled monthly attendance integration",
      }),
      randomUUID(),
      "monthly-tests",
    );
    await repo.createShiftAllocation(
      actor(),
      {
        company_id: f.companyId,
        scope: "employee",
        scope_id: target.employeeId,
        shift_id: shift.id,
        effective_from: f.today,
        effective_to: null,
        reason: "Controlled monthly roster authority",
      },
      randomUUID(),
      "monthly-tests",
    );
    for (const [direction, hour] of [
      ["in", 0],
      ["out", 8],
    ] as const)
      await pool.query(
        "insert into hr_attendance_punch (id,tenant_id,company_id,employee_id,work_date,occurred_at,direction,source,source_reference,captured_by) values ($1,$2,$3,$4,$5,($5::date+$6*interval '1 hour') at time zone 'Asia/Karachi',$7,'biometric',$1,'r06.maker')",
        ["monthly-punch-" + randomUUID(), sourceTestTenantId, f.companyId, target.employeeId, f.today, hour, direction],
      );
  });
  afterAll(async () => {
    if (f) await f.dispose();
    await pool?.end();
  });
  it("matches daily results and exposes bounded non-sensitive monthly summaries", async () => {
    const result = await repo.listMonthlyAttendance(actor(), query()),
      daily = await repo.listDailyAttendance(actor(), {
        company_id: f.companyId,
        on_date: f.today,
        limit: 50,
        offset: 0,
      });
    expect(hrMonthlyAttendanceDirectorySchema.safeParse(result).success).toBe(true);
    expect(result.total).toBe(1);
    const employee = result.items[0]!,
      day = employee.days.find((d) => d.on_date === f.today)!,
      single = daily.items[0]!;
    expect(day).toMatchObject({
      status: single.status,
      worked_minutes: single.worked_minutes,
      late_minutes: single.late_minutes,
      leave_days: single.leave_days,
    });
    expect(employee.worked_minutes).toBe(420);
    expect(Object.values(employee.counts).reduce((a, b) => a + b, 0)).toBe(employee.covered_days);
    expect(JSON.stringify(result)).not.toMatch(
      /source_reference|personal_email|bank_account|salary_amount|occurred_at|"punches"/,
    );
  });
  it("enforces permission, tenant and company access", async () => {
    await expect(repo.listMonthlyAttendance(actor("r06.maker", []), query())).rejects.toMatchObject({ status: 403 });
    await expect(repo.listMonthlyAttendance(actor("r06.restricted"), query())).rejects.toMatchObject({ status: 403 });
    await expect(repo.listMonthlyAttendance({ ...actor(), tenantId: "another-tenant" }, query())).rejects.toMatchObject(
      { status: 403 },
    );
  });
  it("excludes days outside actual employment coverage", async () => {
    const last = new Date(Date.parse(f.today + "T00:00:00Z") - 86400000).toISOString().slice(0, 10),
      former = await f.target(last);
    const data = await repo.listMonthlyAttendance(actor(), query());
    const employee = data.items.find((r) => r.employee_id === former.employeeId)!;
    expect(employee.days.every((d) => d.on_date <= last)).toBe(true);
    expect(employee.days.some((d) => d.on_date === f.today)).toBe(false);
    const expected = Math.max(0, Math.round((Date.parse(last) - Date.parse(month)) / 86400000) + 1);
    expect(employee.covered_days).toBe(expected);
  });
  it("handles February lengths and keeps future shifts out of absence", async () => {
    const feb = await repo.listMonthlyAttendance(actor(), query({ month: "2028-02-01" }));
    expect(feb.through_date).toBe("2028-02-29");
    const active = feb.items.find((r) => r.employee_id === target.employeeId)!;
    expect(active.covered_days).toBe(29);
    expect(active.counts.absent).toBe(0);
    expect(active.counts.scheduled).toBe(29);
    const next = await repo.listMonthlyAttendance(actor(), query({ month: "2029-02-01" }));
    expect(next.through_date).toBe("2029-02-28");
  });
  it("searches literal special characters and paginates employees before days", async () => {
    const all = await repo.listMonthlyAttendance(actor(), query()),
      name = all.items[0]!.employee_number;
    expect((await repo.listMonthlyAttendance(actor(), query({ search: name }))).items).toHaveLength(1);
    expect((await repo.listMonthlyAttendance(actor(), query({ search: "%_\\'" }))).total).toBe(0);
    const first = await repo.listMonthlyAttendance(actor(), query({ limit: 1 })),
      second = await repo.listMonthlyAttendance(actor(), query({ limit: 1, offset: 1 }));
    expect(first.total).toBe(second.total);
    expect(first.items[0]?.employee_id).not.toBe(second.items[0]?.employee_id);
  });
  it("batch-loads a whole employee page and month using constant query count", async () => {
    for (let i = 0; i < 24; i++) await f.target();
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
    await measured.listMonthlyAttendance(actor(), query({ limit: 1 }));
    const one = calls;
    calls = 0;
    const started = performance.now(),
      data = await measured.listMonthlyAttendance(actor(), query({ limit: 25 }));
    expect(data.items).toHaveLength(25);
    expect(calls).toBe(one);
    expect(calls).toBeLessThanOrEqual(12);
    expect(data.items.every((e) => e.days.length <= 31)).toBe(true);
    console.log(
      `Monthly attendance: 25 employees, ${calls} SQL statements including security/transaction, ${Math.round(performance.now() - started)}ms local read.`,
    );
  });
  it("keeps finalized inputs separate and checks their additional permission", async () => {
    const period = "monthly-period-" + randomUUID();
    await pool.query(
      "insert into hr_attendance_period (id,tenant_id,company_id,month,state,opened_by,locked_by,locked_at,source_hash) values ($1,$2,$3,$4,'locked','r06.maker','r06.checker',now(),'synthetic-monthly-lock')",
      [period, sourceTestTenantId, f.companyId, month],
    );
    await pool.query(
      "insert into hr_payroll_input (id,tenant_id,company_id,period_id,employee_id,calendar_days,paid_days,unpaid_days,approved_leave_days,unpaid_leave_days,present_days,absent_days,source_hash) values ($1,$2,$3,$4,$5,31,20,11,0,0,20,11,$6)",
      ["monthly-input-" + randomUUID(), sourceTestTenantId, f.companyId, period, target.employeeId, "a".repeat(64)],
    );
    const full = await repo.listMonthlyAttendance(actor(), query({ limit: 50 })),
      limited = await repo.listMonthlyAttendance(actor("r06.maker", ["hr.attendance.read"]), query({ limit: 50 }));
    expect(full.period_state).toBe("locked");
    const item = full.items.find((r) => r.employee_id === target.employeeId)!;
    expect(item.finalized_input?.paid_days).toBe("20.0000");
    expect(item.worked_minutes).toBe(420);
    expect(limited.snapshot_access).toBe(false);
    expect(limited.items.every((r) => r.finalized_input === null)).toBe(true);
    expect((await repo.listMonthlyAttendance(actor(), query({ limit: 50 }))).items).toEqual(full.items);
  });
  it("authenticates the documented route and rejects invalid months and limits", async () => {
    const session = {
      sessionId: "monthly-session",
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
    const route = `/api/v1/hr/monthly_attendance?company_id=${f.companyId}&month=${month}`;
    expect((await request(app).get(route)).status).toBe(401);
    const response = await request(app).get(route).set("cookie", "nexora_session=test");
    expect(response.status).toBe(200);
    expect(hrMonthlyAttendanceDirectorySchema.safeParse(response.body).success).toBe(true);
    for (const suffix of ["&limit=51", "&offset=-1", "&month=2026-02-31"]) {
      expect(
        (
          await request(app)
            .get(route + suffix)
            .set("cookie", "nexora_session=test")
        ).status,
      ).toBe(400);
    }
    expect(
      (await request(app).get(route.replace(month, "2026-10-02")).set("cookie", "nexora_session=test")).status,
    ).toBe(400);
  });
});
