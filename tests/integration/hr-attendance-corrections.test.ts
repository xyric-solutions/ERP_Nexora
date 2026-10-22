import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { createHrCorrectionRequestSchema, hrCorrectionDetailSchema } from "../../packages/contracts/src/hr/index.js";
import { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import {
  ensureSourceAuthorizationFixture,
  ensureSourceSuperAdministratorFixture,
  sourceTestTenantId,
} from "./source-security-fixture.js";
import {
  createCorrectionFixture,
  createCorrectionOverrideAccount,
  correctionActor,
  correctionPermissions,
} from "./hr-correction-fixture.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip,
  key = () => randomUUID(),
  corr = "correction-integration";
run("Live Attendance Corrections", () => {
  let overrideId: string;
  let pool: DatabasePool, repo: SourceHrRepository, f: Awaited<ReturnType<typeof createCorrectionFixture>>;
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
    await ensureSourceSuperAdministratorFixture(pool);
    overrideId = await createCorrectionOverrideAccount(pool);
    f = await createCorrectionFixture(pool, undefined, [overrideId]);
  });
  afterAll(async () => {
    if (f) await f.dispose();
    await pool?.end();
  });
  const context = async (employeeId: string, actor = correctionActor()) =>
    (await repo.getCorrectionContext(actor, { company_id: f.companyId, on_date: f.today, employee_id: employeeId }))
      .evidence!;
  const create = async (extra = {}, person?: Awaited<ReturnType<typeof f.target>>, token = key()) => {
    const employee = person ?? (await f.target()),
      evidence = await context(employee.employeeId),
      input = createHrCorrectionRequestSchema.parse({
        company_id: f.companyId,
        employee_id: employee.employeeId,
        work_date: f.today,
        kind: "incorrect_attendance",
        stated_in: f.today + "T00:00:00+05:00",
        stated_out: f.today + "T08:00:00+05:00",
        reason: "Controlled missing device attendance evidence",
        expected_evidence_hash: evidence.hash,
        ...extra,
      });
    return { employee, input, result: await repo.createCorrection(correctionActor(), input, token, corr) };
  };
  const detail = (id: string, actor = correctionActor()) => repo.getCorrection(actor, f.companyId, id);
  const act = async (
    id: string,
    action: "submit" | "cancel" | "manager_approve" | "manager_reject" | "hr_approve" | "hr_reject",
    actor = correctionActor(),
    extra = {},
    token = key(),
  ) => {
    const d = await detail(id, actor);
    return repo.actOnCorrection(
      actor,
      id,
      {
        company_id: f.companyId,
        expected_version: d.version,
        action,
        reason: "Reviewed correction with source evidence",
        expected_evidence_hash: d.evidence?.hash ?? null,
        override_self_approval: false,
        ...extra,
      },
      token,
      corr,
    );
  };
  it("applies only the final HR approval through separate owner, manager and HR actors", async () => {
    const { result, employee } = await create();
    let d = await detail(result.id);
    expect(hrCorrectionDetailSchema.safeParse(d).success).toBe(true);
    expect(d.status).toBe("draft");
    await act(result.id, "submit");
    await expect(act(result.id, "manager_approve", correctionActor("r06.checker"))).rejects.toMatchObject({
      status: 403,
    });
    await act(result.id, "manager_approve", correctionActor(f.managerId));
    expect(
      (
        await repo.listDailyAttendance(correctionActor(), {
          company_id: f.companyId,
          on_date: f.today,
          limit: 100,
          offset: 0,
        })
      ).items.find((r) => r.employee_id === employee.employeeId)?.correction_applied,
    ).toBe(false);
    await expect(act(result.id, "hr_approve", correctionActor(f.managerId))).rejects.toMatchObject({ status: 403 });
    await act(result.id, "hr_approve", correctionActor("r06.checker"));
    d = await detail(result.id);
    expect(d.status).toBe("approved");
    expect(d.history.map((h) => h.action)).toEqual(["hr_approve", "manager_approve", "submit", "create"]);
    expect(d.allowed_actions).toEqual([]);
    const day = (
      await repo.listDailyAttendance(correctionActor(), {
        company_id: f.companyId,
        on_date: f.today,
        limit: 100,
        offset: 0,
      })
    ).items.find((r) => r.employee_id === employee.employeeId)!;
    expect(day).toMatchObject({ status: "present", worked_minutes: 420, correction_applied: true, punch_count: 0 });
    expect(
      (
        await pool.query("select count(*)::int as n from hr_payroll_input where tenant_id=$1 and company_id=$2", [
          sourceTestTenantId,
          f.companyId,
        ])
      ).rows[0]?.n,
    ).toBe(0);
  });
  it("enforces permission, company/tenant grants and raw-punch privacy", async () => {
    await expect(
      repo.listCorrections(correctionActor("r06.maker", []), { company_id: f.companyId, limit: 50, offset: 0 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.listCorrections(correctionActor("r06.restricted"), { company_id: f.companyId, limit: 50, offset: 0 }),
    ).rejects.toMatchObject({ status: 403 });
    const made = await create(),
      limited = await detail(
        made.result.id,
        correctionActor(
          "r06.maker",
          correctionPermissions.filter((p) => p !== "hr.attendance.punch.read"),
        ),
      );
    expect(limited.evidence?.day.punches).toBeNull();
    expect(JSON.stringify(limited)).not.toContain("source_snapshot");
    await expect(
      repo.getCorrection({ ...correctionActor(), tenantId: "different-tenant" }, f.companyId, made.result.id),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("protects draft ownership, stale versions and idempotent writes", async () => {
    const person = await f.target(),
      token = key(),
      made = await create({}, person, token);
    expect((await repo.createCorrection(correctionActor(), made.input, token, corr)).replayed).toBe(true);
    await expect(
      repo.createCorrection(
        correctionActor(),
        { ...made.input, reason: "Different correction source terms" },
        token,
        corr,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const d = await detail(made.result.id),
      update = {
        company_id: f.companyId,
        expected_version: d.version,
        kind: d.kind,
        stated_in: made.input.stated_in,
        stated_out: made.input.stated_out,
        reason: "Updated correction draft for review",
        expected_evidence_hash: d.evidence!.hash,
      };
    await expect(
      repo.updateCorrection(correctionActor("r06.checker"), d.id, update, key(), corr),
    ).rejects.toMatchObject({ status: 403 });
    await repo.updateCorrection(correctionActor(), d.id, update, key(), corr);
    await expect(repo.updateCorrection(correctionActor(), d.id, update, key(), corr)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("requires fresh source evidence after punches change", async () => {
    const person = await f.target(),
      e = await context(person.employeeId);
    await pool.query(
      "insert into hr_attendance_punch (tenant_id,id,company_id,employee_id,work_date,occurred_at,direction,source,source_reference,captured_by) values ($1,$2,$3,$4,$5,$6,'in','biometric',$2,'r06.maker')",
      [
        sourceTestTenantId,
        "correction-punch-" + randomUUID(),
        f.companyId,
        person.employeeId,
        f.today,
        f.today + "T00:00:00+05:00",
      ],
    );
    await expect(
      repo.createCorrection(
        correctionActor(),
        createHrCorrectionRequestSchema.parse({
          company_id: f.companyId,
          employee_id: person.employeeId,
          work_date: f.today,
          kind: "missing_out",
          stated_in: null,
          stated_out: f.today + "T08:00:00+05:00",
          reason: "Missing out after newly captured punch",
          expected_evidence_hash: e.hash,
        }),
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_CORRECTION_EVIDENCE_STALE" });
  });
  it("rejects incorrect timezone offsets and out-of-window timestamps", async () => {
    await expect(
      create({ stated_in: f.today + "T00:00:00+00:00", stated_out: f.today + "T08:00:00+00:00" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      create({ stated_in: "2020-01-01T00:00:00+05:00", stated_out: "2020-01-01T08:00:00+05:00" }),
    ).rejects.toMatchObject({ status: 400, code: "HR_CORRECTION_TIME_OUTSIDE_SHIFT" });
  });
  it("allows cancellation and both rejection stages while keeping history", async () => {
    const a = await create();
    await act(a.result.id, "cancel");
    expect((await detail(a.result.id)).status).toBe("cancelled");
    const b = await create();
    await act(b.result.id, "submit");
    await act(b.result.id, "manager_reject", correctionActor(f.managerId));
    expect((await detail(b.result.id)).status).toBe("rejected");
    const c = await create();
    await act(c.result.id, "submit");
    await act(c.result.id, "manager_approve", correctionActor(f.managerId));
    await act(c.result.id, "hr_reject", correctionActor("r06.checker"));
    expect((await detail(c.result.id)).status).toBe("rejected");
  });
  it("serializes competing submissions for the same employee day", async () => {
    const person = await f.target(),
      a = await create({}, person),
      b = await create({}, person);
    const result = await Promise.allSettled([act(a.result.id, "submit"), act(b.result.id, "submit")]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("blocks the subject employee's own approval and records explicit super-admin overrides", async () => {
    const made = await create();
    await pool.query(
      "insert into employee_user_binding (tenant_id,id,user_id,employee_id,effective_from,reason,created_by) values ($1,$2,$3,$4,current_date,'Synthetic subject self-approval check','r06.maker')",
      [sourceTestTenantId, "subject-binding-" + randomUUID(), f.subjectUserId, made.employee.employeeId],
    );
    await act(made.result.id, "submit");
    await act(made.result.id, "manager_approve", correctionActor(f.managerId));
    await expect(act(made.result.id, "hr_approve", correctionActor(f.subjectUserId))).rejects.toMatchObject({
      status: 403,
    });
    const superActor = correctionActor(
      overrideId,
      [...correctionPermissions, "platform.approval.override"],
      ["super_administrator"],
    );
    const ownEmployee = await f.target(),
      ownEvidence = await context(ownEmployee.employeeId, superActor);
    const own = await repo.createCorrection(
      superActor,
      { ...made.input, employee_id: ownEmployee.employeeId, expected_evidence_hash: ownEvidence.hash },
      key(),
      corr,
    );
    await act(own.id, "submit", superActor);
    await act(own.id, "manager_approve", correctionActor(f.managerId));
    await expect(act(own.id, "hr_approve", superActor)).rejects.toMatchObject({
      status: 403,
      code: "HR_CORRECTION_EXPLICIT_OVERRIDE_REQUIRED",
    });
    await act(own.id, "hr_approve", superActor, { override_self_approval: true });
    expect((await detail(own.id)).history[0]?.override_event_id).toBeTruthy();
  });
  it("keeps legacy records read-only and protects final events in PostgreSQL", async () => {
    const made = await create();
    await act(made.result.id, "cancel");
    await expect(
      pool.query(
        "update hr_attendance_correction set reason='Forbidden terminal rewrite',version=version+1 where tenant_id=$1 and id=$2",
        [sourceTestTenantId, made.result.id],
      ),
    ).rejects.toBeTruthy();
    await expect(
      pool.query("delete from hr_attendance_correction_event where tenant_id=$1 and correction_id=$2", [
        sourceTestTenantId,
        made.result.id,
      ]),
    ).rejects.toBeTruthy();
    const person = await f.target(),
      id = "legacy-correction-" + randomUUID();
    await pool.query(
      "insert into hr_attendance_correction (tenant_id,id,company_id,employee_id,work_date,kind,reason,requested_by) values ($1,$2,$3,$4,$5,'official_duty','Retained legacy correction record','r06.maker')",
      [sourceTestTenantId, id, f.companyId, person.employeeId, f.today],
    );
    expect((await detail(id)).allowed_actions).toEqual([]);
    expect((await detail(id)).can_edit).toBe(false);
  });
  it("authenticates routes and enforces origin, CSRF, schemas and idempotency", async () => {
    const session = {
      sessionId: "correction-session",
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
      authService: {
        loadAuthenticatedAccount: vi.fn(async () => correctionActor().actor),
      } as unknown as TenantAuthApiService,
      sessionService: {
        get: vi.fn(async () => session),
        authorizeMutation: vi.fn(async (_token: string, csrf: string) =>
          csrf === session.csrfToken ? { status: "ok", session } : { status: "invalid_csrf" },
        ),
      } as unknown as TenantSessionApiService,
    });
    const route = `/api/v1/hr/attendance_corrections?company_id=${f.companyId}`;
    expect((await request(app).get(route)).status).toBe(401);
    expect((await request(app).get(route).set("cookie", "nexora_session=test")).status).toBe(200);
    const made = await create();
    const send = (origin: string, csrf: string, body: object) =>
      request(app)
        .post("/api/v1/hr/attendance_corrections")
        .set("cookie", "nexora_session=test")
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", key())
        .send(body);
    expect((await send("https://evil.test", session.csrfToken, made.input)).status).toBe(403);
    expect((await send("https://hr.example.test", "bad", made.input)).status).toBe(403);
    expect((await send("https://hr.example.test", session.csrfToken, { ...made.input, raw_punches: [] })).status).toBe(
      400,
    );
  });
  it("resolves missing-in, missing-out and official-duty requests without editing device punches", async () => {
    for (const kind of ["missing_in", "missing_out", "official_duty"] as const) {
      const person = await f.target();
      if (kind !== "official_duty")
        await pool.query(
          "insert into hr_attendance_punch (tenant_id,id,company_id,employee_id,work_date,occurred_at,direction,source,source_reference,captured_by) values ($1,$2,$3,$4,$5,$6,$7,'biometric',$2,'r06.maker')",
          [
            sourceTestTenantId,
            "correction-original-" + randomUUID(),
            f.companyId,
            person.employeeId,
            f.today,
            f.today + (kind === "missing_in" ? "T08:00:00+05:00" : "T00:00:00+05:00"),
            kind === "missing_in" ? "out" : "in",
          ],
        );
      const original = (await context(person.employeeId)).day.punches;
      const made = await create(
        {
          kind,
          stated_in: kind === "missing_in" ? f.today + "T00:00:00+05:00" : null,
          stated_out: kind === "missing_out" ? f.today + "T08:00:00+05:00" : null,
        },
        person,
      );
      await act(made.result.id, "submit");
      await act(made.result.id, "manager_approve", correctionActor(f.managerId));
      await act(made.result.id, "hr_approve", correctionActor("r06.checker"));
      const result = (await detail(made.result.id)).evidence!.day;
      expect(result.punches).toEqual(original);
      expect(result.status).toBe(kind === "official_duty" ? "official_duty" : "present");
    }
  });
  it("does not submit an incomplete correction that leaves unmatched punch evidence", async () => {
    const made = await create({ kind: "missing_out", stated_in: null });
    await expect(act(made.result.id, "submit")).rejects.toMatchObject({
      status: 409,
      code: "HR_CORRECTION_NOT_RESOLVED",
    });
    expect((await detail(made.result.id)).status).toBe("draft");
  });

  it("requires an audited override when a subject binding is added after submission", async () => {
    const made = await create();
    await act(made.result.id, "submit");
    await act(made.result.id, "manager_approve", correctionActor(f.managerId));
    await pool.query(
      "insert into employee_user_binding (tenant_id,id,user_id,employee_id,effective_from,reason,created_by) values ($1,$2,$3,$4,current_date,'Late subject binding for override regression','r06.maker')",
      [sourceTestTenantId, "late-binding-" + randomUUID(), overrideId, made.employee.employeeId],
    );
    const admin = correctionActor(
      overrideId,
      [...correctionPermissions, "platform.approval.override"],
      ["super_administrator"],
    );
    await expect(act(made.result.id, "hr_reject", admin)).rejects.toMatchObject({
      status: 403,
      code: "HR_CORRECTION_EXPLICIT_OVERRIDE_REQUIRED",
    });
    await act(made.result.id, "hr_reject", admin, { override_self_approval: true });
    expect((await detail(made.result.id)).history[0]?.override_event_id).toBeTruthy();
  });
  it("honors locked periods without rewriting evidence or creating audit side effects", async () => {
    const made = await create();
    await pool.query(
      "insert into hr_attendance_period (tenant_id,id,company_id,month,state,opened_by,locked_by,locked_at,source_hash) values ($1,$2,$3,date_trunc('month',$4::date),'locked','r06.maker','r06.checker',now(),'correction-lock')",
      [sourceTestTenantId, "correction-period-" + randomUUID(), f.companyId, f.today],
    );
    const d = await detail(made.result.id);
    expect(d.allowed_actions).toEqual([]);
    expect(d.evidence?.period_locked).toBe(true);
    await expect(act(made.result.id, "submit")).rejects.toMatchObject({ status: 403 });
    expect((await detail(made.result.id)).version).toBe(1);
  });
});
