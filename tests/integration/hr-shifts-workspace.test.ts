import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import {
  createHrShiftRequestSchema,
  updateHrShiftRequestSchema,
  hrShiftDetailSchema,
  type CreateHrShiftRequest,
} from "../../packages/contracts/src/hr/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { SourceHrRepository, type HrActorContext } from "../../server/api/src/modules/hr/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;
const company = "nexora-r06-uat-company",
  other = "nexora-r06-uat-company-two";
const actor = (
  userId = "r06.maker",
  permissions = ["hr.attendance.shift.read", "hr.attendance.shift.manage"],
): HrActorContext => ({
  tenantId: sourceTestTenantId,
  actor: {
    tenantId: sourceTestTenantId,
    organizationName: "Shift tests",
    userId,
    email: `${userId}@example.test`,
    displayName: userId,
    roles: ["hr_manager"],
    permissions,
    sessionVersion: 1,
  },
});
const key = () => `shift-${randomUUID()}`,
  corr = "shift-rule-integration";
const leaf = (extra: Record<string, unknown> = {}) =>
  createHrShiftRequestSchema.parse({
    company_id: company,
    code: `S${randomUUID().replaceAll("-", "").slice(0, 15).toUpperCase()}`,
    name: "Controlled working arrangement",
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
    breaks: [{ label: "Lunch", minutes: 60, paid: false }],
    time_zone: "Asia/Karachi",
    work_location_id: null,
    reason: "Controlled shift configuration verification",
    ...extra,
  });
run("Live company shifts and attendance rules", () => {
  let pool: DatabasePool, repo: SourceHrRepository;
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });
  const create = (input: CreateHrShiftRequest = leaf()) => repo.createShift(actor(), input, key(), corr);
  const get = (id: string, date?: string) => repo.getShift(actor(), company, id, date);
  const directory = (extra = {}) => ({ company_id: company, leaf_only: false, limit: 50, offset: 0, ...extra });
  async function assign(id: string, historical = false) {
    const scope = `shift-department-${randomUUID()}`;
    await pool.query(
      "insert into organization_unit (id,tenant_id,parent_id,type,code,name,status) values ($1,$2,'nexora-r06-uat-branch','department',$3,'Shift isolated department','active')",
      [scope, sourceTestTenantId, `SD${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`],
    );
    await pool.query(
      "insert into hr_shift_assignment (id,tenant_id,company_id,scope,scope_id,shift_id,effective_from,effective_to,created_by) values ($1,$2,$3,'department',$4,$5,current_date-10,case when $6 then current_date-1 else null end,'r06.maker')",
      [`shift-assignment-${randomUUID()}`, sourceTestTenantId, company, scope, id, historical],
    );
  }
  it("scopes shifts, company picker and location context using attendance permissions", async () => {
    const s = await create();
    expect(
      (await repo.listCompanies(actor("r06.maker", ["hr.attendance.shift.read"]))).items.some((c) => c.id === company),
    ).toBe(true);
    expect(
      (await repo.getShiftContext(actor(), { company_id: company })).locations.some((l) => l.id === "r06-uat-location"),
    ).toBe(true);
    await expect(repo.listShifts(actor("r06.maker", []), directory())).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.createShift(actor("r06.maker", ["hr.attendance.shift.read"]), leaf(), key(), corr),
    ).rejects.toMatchObject({ status: 403 });
    await expect(repo.listShifts(actor("r06.restricted"), directory({ company_id: other }))).rejects.toMatchObject({
      status: 403,
    });
    await expect(repo.getShift(actor(), other, s.id)).rejects.toMatchObject({ status: 404 });
    const foreign = actor();
    foreign.tenantId = "foreign";
    foreign.actor.tenantId = "foreign";
    await expect(repo.getShift(foreign, company, s.id)).rejects.toMatchObject({ status: 403 });
  });
  it("validates overnight windows, break totals, attendance thresholds, flexible hours and time zones", () => {
    const base = leaf();
    for (const patch of [
      { end_minute: 500 },
      { end_minute: 2100 },
      { breaks: [{ label: "All day", minutes: 480, paid: true }] },
      { required_work_minutes: 500 },
      { half_day_minutes: 500 },
      { minimum_present_minutes: 300, half_day_minutes: 240 },
      { weekly_off_days: [0, 0] },
      { weekly_off_days: [0, 1, 2, 3, 4, 5, 6] },
      { time_zone: "Invalid/Nowhere" },
      { time_zone: "+05:00" },
      { kind: "night" },
      { kind: "flexible", required_work_minutes: 420 },
    ])
      expect(createHrShiftRequestSchema.safeParse({ ...base, ...patch }).success).toBe(false);
    expect(
      createHrShiftRequestSchema.safeParse({ ...base, kind: "night", start_minute: 1320, end_minute: 1800 }).success,
    ).toBe(true);
    expect(
      createHrShiftRequestSchema.safeParse({
        ...base,
        kind: "flexible",
        start_minute: 480,
        end_minute: 1200,
        required_work_minutes: 480,
        grace_in_minutes: 0,
        grace_out_minutes: 0,
      }).success,
    ).toBe(true);
    expect(createHrShiftRequestSchema.safeParse({ ...base, payroll_rate: "100" }).success).toBe(false);
  });
  it("persists paid/unpaid rules and each leaf type without creating assignments or payroll", async () => {
    const before = await pool.query<{ n: number }>(
      "select count(*)::int as n from hr_shift_assignment where tenant_id=$1",
      [sourceTestTenantId],
    );
    const records = [
      leaf(),
      leaf({ kind: "multiple" }),
      leaf({ kind: "night", start_minute: 1320, end_minute: 1800 }),
      leaf({
        kind: "flexible",
        start_minute: 480,
        end_minute: 1200,
        required_work_minutes: 480,
        grace_in_minutes: 0,
        grace_out_minutes: 0,
      }),
      leaf({
        breaks: [
          { label: "Paid rest", minutes: 30, paid: true },
          { label: "Unpaid meal", minutes: 30, paid: false },
        ],
        required_work_minutes: 450,
        work_location_id: "r06-uat-location",
      }),
    ];
    for (const input of records) {
      const created = await create(input),
        view = await get(created.id);
      expect(hrShiftDetailSchema.safeParse(view).success).toBe(true);
      expect(view.required_work_minutes).toBe(input.kind === "rotating" ? 0 : input.required_work_minutes);
      expect(view.configured).toBe(true);
      expect(view.breaks).toEqual(input.kind === "rotating" ? [] : input.breaks);
      expect(view.history).toHaveLength(1);
    }
    expect(
      (
        await pool.query<{ n: number }>("select count(*)::int as n from hr_shift_assignment where tenant_id=$1", [
          sourceTestTenantId,
        ])
      ).rows[0]!.n,
    ).toBe(before.rows[0]!.n);
    await expect(create(leaf({ work_location_id: "r06-uat-designation" }))).rejects.toMatchObject({
      code: "HR_SHIFT_LOCATION_INVALID",
    });
  });
  it("serializes retries, versions unused edits and preserves immutable rule snapshots", async () => {
    const input = leaf(),
      token = key(),
      results = await Promise.all([
        repo.createShift(actor(), input, token, corr),
        repo.createShift(actor(), input, token, corr),
      ]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    const id = results[0]!.id;
    await expect(repo.createShift(actor(), { ...input, name: "Changed request" }, token, corr)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    await expect(create(input)).rejects.toMatchObject({ code: "HR_SHIFT_CODE_EXISTS" });
    const update = updateHrShiftRequestSchema.parse({ ...input, name: "Revised unused shift", expected_version: 1 });
    await repo.updateShift(actor(), id, update, key(), corr);
    expect((await get(id)).version).toBe(2);
    expect((await get(id)).history).toHaveLength(2);
    await expect(repo.updateShift(actor(), id, update, key(), corr)).rejects.toMatchObject({ code: "HR_SHIFT_STALE" });
    await expect(
      pool.query("update hr_shift_rule_event set reason='Altered history' where tenant_id=$1 and shift_id=$2", [
        sourceTestTenantId,
        id,
      ]),
    ).rejects.toThrow(/immutable/);
    const filtered = await repo.listShifts(actor(), directory({ search: input.code, limit: 1 }));
    expect(filtered.total).toBe(1);
    expect((await repo.listShifts(actor(), directory({ search: input.code, offset: 1, limit: 1 }))).items).toHaveLength(
      0,
    );
  });
  it("resolves anchored weekly rotations and protects their configured member rules", async () => {
    const a = await create(),
      b = await create(leaf({ kind: "night", start_minute: 1320, end_minute: 1800 }));
    const input = createHrShiftRequestSchema.parse({
      company_id: company,
      code: `R${randomUUID().replaceAll("-", "").slice(0, 15).toUpperCase()}`,
      name: "Weekly rotation",
      kind: "rotating",
      time_zone: "Asia/Karachi",
      work_location_id: null,
      rotation_anchor_date: "2026-10-19",
      rotation_shift_ids: [a.id, b.id],
      reason: "Governed weekly roster configuration",
    });
    const rotation = await create(input);
    expect((await get(rotation.id, "2026-10-19")).resolved?.id).toBe(a.id);
    expect((await get(rotation.id, "2026-10-26")).resolved?.id).toBe(b.id);
    expect((await get(rotation.id, "2026-11-02")).resolved?.id).toBe(a.id);
    expect((await get(rotation.id, "2026-10-12")).resolved?.id).toBe(b.id);
    await expect(
      repo.updateShift(
        actor(),
        a.id,
        updateHrShiftRequestSchema.parse({ ...leaf(), expected_version: 1 }),
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_SHIFT_RULES_IN_USE" });
    await expect(
      repo.changeShiftStatus(
        actor(),
        b.id,
        {
          company_id: company,
          expected_version: 1,
          status: "inactive",
          reason: "Attempt removal from active rotation",
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_SHIFT_IN_USE" });
    await expect(
      pool.query("delete from hr_shift_break where tenant_id=$1 and shift_id=$2", [sourceTestTenantId, a.id]),
    ).rejects.toThrow(/immutable/);
    const invalid = {
      ...input,
      code: `R${randomUUID().replaceAll("-", "").slice(0, 15).toUpperCase()}`,
      rotation_shift_ids: [a.id, rotation.id],
    };
    await expect(create(invalid)).rejects.toMatchObject({ code: "HR_SHIFT_ROTATION_INVALID" });
    await expect(create({ ...invalid, rotation_shift_ids: [a.id, b.id], time_zone: "UTC" })).rejects.toMatchObject({
      code: "HR_SHIFT_ROTATION_INVALID",
    });
    const foreign = await repo.createShift(actor(), leaf({ company_id: other }), key(), corr);
    await expect(create({ ...invalid, rotation_shift_ids: [a.id, foreign.id] })).rejects.toMatchObject({
      code: "HR_SHIFT_ROTATION_INVALID",
    });
    await repo.changeShiftStatus(
      actor(),
      rotation.id,
      { company_id: company, expected_version: 1, status: "inactive", reason: "Deactivate unused rotation policy" },
      key(),
      corr,
    );
    await repo.changeShiftStatus(
      actor(),
      b.id,
      { company_id: company, expected_version: 1, status: "inactive", reason: "Retire unused night schedule" },
      key(),
      corr,
    );
    await expect(
      repo.changeShiftStatus(
        actor(),
        rotation.id,
        {
          company_id: company,
          expected_version: 2,
          status: "active",
          reason: "Attempt reactivation with inactive member",
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_SHIFT_ROTATION_INVALID" });
  });
  it("freezes assigned rules and protects current/future allocation while retaining historical shifts", async () => {
    const input = leaf(),
      s = await create(input);
    await assign(s.id);
    expect((await get(s.id)).rules_locked).toBe(true);
    await expect(
      repo.updateShift(actor(), s.id, updateHrShiftRequestSchema.parse({ ...input, expected_version: 1 }), key(), corr),
    ).rejects.toMatchObject({ code: "HR_SHIFT_RULES_IN_USE" });
    await expect(
      pool.query("update hr_shift set name='Tampered',version=version+1 where tenant_id=$1 and id=$2", [
        sourceTestTenantId,
        s.id,
      ]),
    ).rejects.toThrow(/immutable/);
    await expect(
      repo.changeShiftStatus(
        actor(),
        s.id,
        {
          company_id: company,
          expected_version: 1,
          status: "inactive",
          reason: "Attempt to invalidate current allocations",
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_SHIFT_IN_USE" });
    const past = await create();
    await assign(past.id, true);
    await repo.changeShiftStatus(
      actor(),
      past.id,
      {
        company_id: company,
        expected_version: 1,
        status: "inactive",
        reason: "Retire completed historical allocation",
      },
      key(),
      corr,
    );
    expect((await get(past.id)).status).toBe("inactive");
  });
  it("keeps legacy shifts visible but requires configuration before new allocation", async () => {
    const id = `legacy-shift-${randomUUID()}`,
      code = `L${randomUUID().replaceAll("-", "").slice(0, 15).toUpperCase()}`;
    await pool.query(
      "insert into hr_shift (tenant_id,id,company_id,code,name,kind,start_minute,end_minute,half_day_minutes,minimum_present_minutes,created_by) values ($1,$2,$3,$4,'Legacy shift','fixed',540,1020,240,120,'r06.maker')",
      [sourceTestTenantId, id, company, code],
    );
    expect((await get(id)).configured).toBe(false);
    await expect(assign(id)).rejects.toThrow(/Configure shift/);
    await repo.updateShift(
      actor(),
      id,
      updateHrShiftRequestSchema.parse({ ...leaf({ code }), expected_version: 1 }),
      key(),
      corr,
    );
    expect((await get(id)).configured).toBe(true);
  });
  it("protects work-location availability while company shifts depend on it", async () => {
    const manager = actor("r06.maker", [
      "hr.master.create",
      "hr.master.update",
      "hr.attendance.shift.manage",
      "hr.attendance.shift.read",
    ]);
    const site = await repo.createMaster(
      manager,
      {
        company_id: company,
        type: "work_location",
        code: `SITE-${randomUUID().slice(0, 8).toUpperCase()}`,
        name: `Shift site ${randomUUID()}`,
        description: "Isolated work location",
        configuration_key: "working_pattern",
        configuration_value: "on_site",
      },
      key(),
      corr,
    );
    const shift = await create(leaf({ work_location_id: site.id }));
    await expect(
      repo.changeMasterStatus(manager, site.id, { company_id: company, status: "inactive" }, key(), corr),
    ).rejects.toMatchObject({ code: "HR_WORK_LOCATION_IN_SHIFT_USE" });
    await repo.changeShiftStatus(
      actor(),
      shift.id,
      {
        company_id: company,
        expected_version: 1,
        status: "inactive",
        reason: "Retire the location-specific working policy",
      },
      key(),
      corr,
    );
    await repo.changeMasterStatus(manager, site.id, { company_id: company, status: "inactive" }, key(), corr);
    await expect(
      repo.changeShiftStatus(
        actor(),
        shift.id,
        {
          company_id: company,
          expected_version: 2,
          status: "active",
          reason: "Attempt reactivation at a closed location",
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_SHIFT_LOCATION_INVALID" });
  });
  it("enforces HTTP cookies, CSRF, origin and strict validation for the live screen", async () => {
    const session = {
      sessionId: "shifts-session",
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
    expect((await request(api).get(`/api/v1/hr/shifts?company_id=${company}`)).status).toBe(401);
    expect(
      (
        await request(api)
          .get(`/api/v1/hr/shifts?company_id=${company}&leaf_only=bad`)
          .set("cookie", "nexora_session=test")
      ).status,
    ).toBe(400);
    const send = (origin: string, csrf: string, body: object) =>
      request(api)
        .post("/api/v1/hr/shifts")
        .set("cookie", "nexora_session=test")
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", key())
        .send(body);
    const input = leaf();
    expect((await send("https://evil.example", session.csrfToken, input)).status).toBe(403);
    expect((await send("https://hr.example.test", "bad", input)).status).toBe(403);
    expect((await send("https://hr.example.test", session.csrfToken, { ...input, grace_in_minutes: -1 })).status).toBe(
      400,
    );
    const created = await send("https://hr.example.test", session.csrfToken, input);
    expect(created.status).toBe(201);
    const read = await request(api)
      .get(`/api/v1/hr/shifts/${created.body.id}?company_id=${company}`)
      .set("cookie", "nexora_session=test");
    expect(read.status).toBe(200);
    expect(hrShiftDetailSchema.safeParse(read.body).success).toBe(true);
    const rls = await pool.query(
      "select relrowsecurity,relforcerowsecurity from pg_class where relname='hr_shift_rule_event'",
    );
    expect(rls.rows[0]).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
  });
});
