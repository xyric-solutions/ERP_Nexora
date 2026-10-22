import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import {
  createHrLeaveTypeRequestSchema,
  createHrLeaveRequestSchema,
  hrLeaveContextSchema,
  hrLeaveRequestDetailSchema,
  hrLeaveBalanceDirectorySchema,
  hrLeaveTypeDirectorySchema,
} from "../../packages/contracts/src/hr/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createCorrectionFixture, correctionActor, correctionPermissions } from "./hr-correction-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip,
  key = () => randomUUID(),
  corr = "time-leave-integration";
export const leavePermissions = [
  ...correctionPermissions,
  "hr.employee_document.read",
  "hr.leave.type.read",
  "hr.leave.type.manage",
  "hr.leave.balance.read",
  "hr.leave.balance.adjust",
  ...["read", "create", "submit", "cancel", "manager_approve", "manager_reject", "hr_approve", "hr_reject"].map(
    (v) => "hr.leave.request." + v,
  ),
  "hr.attendance.period.read",
  "hr.attendance.period.manage",
  "hr.attendance.period.lock",
  "hr.attendance.payroll_input.read",
];
const actor = (id = "r06.maker", permissions = leavePermissions) => correctionActor(id, permissions);
run("Connected Time & Leave", () => {
  let pool: DatabasePool, repo: SourceHrRepository;
  const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture(past = false) {
    const f = await createCorrectionFixture(pool, undefined, ["r06.last-admin-a"]),
      person = await f.target(),
      date = past
        ? (
            await pool.query<{ date: string }>(
              "select (date_trunc('month',current_date)-interval '1 month')::date::text as date",
            )
          ).rows[0]!.date
        : f.today;
    if (past)
      for (const employee of [f.manager.employeeId, person.employeeId])
        await pool.query(
          `insert into hr_shift_assignment(tenant_id,id,company_id,scope,scope_id,shift_id,effective_from,effective_to,note,created_by) values($1,$2,$3,'employee',$4,$5,$6::date,current_date-1,'Synthetic historical Time and Leave roster','r06.maker')`,
          [tenant, "leave-history-" + key(), f.companyId, employee, f.shift.id, date],
        );
    const policy = {
      effective_from: date,
      annual_entitlement_days: "20",
      accrual_method: "annual_grant" as const,
      carry_forward: false,
      maximum_carry_forward_days: "0",
      maximum_balance_days: "40",
      minimum_request_days: "0.5",
      maximum_request_days: "30",
      requires_hr_approval: true,
      applicable_category_ids: [],
      applicable_genders: [],
      document_required_after_days: null,
    };
    const type = await repo.createLeaveType(
      actor(),
      createHrLeaveTypeRequestSchema.parse({
        company_id: f.companyId,
        code: "ANNUAL",
        name: "Annual Leave",
        paid: true,
        policy,
        reason: "Controlled annual leave policy for connected acceptance",
      }),
      key(),
      corr,
    );
    const result = { ...f, person, date, type, policy };
    fixtures.push(result);
    return result;
  }
  async function balance(f: Awaited<ReturnType<typeof fixture>>, date = f.date) {
    return (
      await repo.listLeaveBalances(actor(), {
        company_id: f.companyId,
        as_of: date,
        employee_id: f.person.employeeId,
        leave_type_id: f.type.id,
        limit: 25,
        offset: 0,
      })
    ).items[0]!;
  }
  async function credit(f: Awaited<ReturnType<typeof fixture>>, days = "10", extra = {}) {
    const b = await balance(f);
    return repo.postLeaveBalance(
      actor(),
      {
        company_id: f.companyId,
        employee_id: f.person.employeeId,
        leave_type_id: f.type.id,
        effective_on: f.date,
        kind: "opening",
        days,
        period_start: null,
        period_end: null,
        expected_balance_hash: b.hash,
        reason: "Authorized opening entitlement with verified migration evidence",
        ...extra,
      },
      key(),
      corr,
    );
  }
  async function context(f: Awaited<ReturnType<typeof fixture>>, date = f.date, extra = {}) {
    return repo.leaveContext(actor(), {
      company_id: f.companyId,
      employee_id: f.person.employeeId,
      leave_type_id: f.type.id,
      from_date: date,
      to_date: date,
      ...extra,
    });
  }
  async function create(
    f: Awaited<ReturnType<typeof fixture>>,
    portion: "full" | "first_half" | "second_half" = "full",
    date = f.date,
    extra = {},
  ) {
    const ctx = await context(f, date);
    const input = createHrLeaveRequestSchema.parse({
      company_id: f.companyId,
      employee_id: f.person.employeeId,
      leave_type_id: f.type.id,
      from_date: date,
      to_date: date,
      document_id: null,
      days: [{ on_date: date, portion }],
      reason: "Controlled leave request with policy, balance and roster evidence",
      expected_evidence_hash: ctx.hash,
      ...extra,
    });
    return { input, result: await repo.createLeaveRequest(actor(), input, key(), corr) };
  }
  async function detail(f: Awaited<ReturnType<typeof fixture>>, id: string, who = "r06.maker") {
    return repo.getLeaveRequest(actor(who), f.companyId, id);
  }
  async function action(
    f: Awaited<ReturnType<typeof fixture>>,
    id: string,
    action: "submit" | "cancel" | "manager_approve" | "manager_reject" | "hr_approve" | "hr_reject",
    who = "r06.maker",
    extra = {},
  ) {
    const d = await detail(f, id, who);
    return repo.actOnLeaveRequest(
      actor(who),
      id,
      {
        company_id: f.companyId,
        action,
        expected_version: d.version,
        expected_evidence_hash: d.context?.hash,
        reason: "Reviewed exact leave days, policy limits and employee evidence",
        override_self_approval: false,
        ...extra,
      },
      key(),
      corr,
    );
  }
  async function approve(f: Awaited<ReturnType<typeof fixture>>, id: string) {
    await action(f, id, "submit");
    await action(f, id, "manager_approve", f.managerId);
    return action(f, id, "hr_approve", "r06.checker");
  }
  it("reserves on submission, posts daily usage only at final approval and shares attendance evidence", async () => {
    const f = await fixture(true);
    expect(
      hrLeaveTypeDirectorySchema.safeParse(
        await repo.listLeaveTypes(actor(), { company_id: f.companyId, as_of: f.date, limit: 25, offset: 0 }),
      ).success,
    ).toBe(true);
    await credit(f);
    const ctx = hrLeaveContextSchema.parse(await context(f));
    expect(ctx.blockers).toEqual([]);
    expect(ctx.days[0]?.chargeable).toBe(true);
    const { result } = await create(f);
    await action(f, result.id, "submit");
    expect((await balance(f)).reserved).toBe("1.0000");
    await expect(action(f, result.id, "manager_approve", "r06.checker")).rejects.toMatchObject({ status: 403 });
    await action(f, result.id, "manager_approve", f.managerId);
    expect(
      (
        await repo.listDailyAttendance(actor(), { company_id: f.companyId, on_date: f.date, limit: 50, offset: 0 })
      ).items.find((i) => i.employee_id === f.person.employeeId)?.status,
    ).toBe("absent");
    await action(f, result.id, "hr_approve", "r06.checker");
    expect(hrLeaveRequestDetailSchema.parse(await detail(f, result.id)).status).toBe("approved");
    expect((await balance(f)).balance).toBe("9.0000");
    expect((await balance(f)).reserved).toBe("0.0000");
    expect(
      (
        await repo.listDailyAttendance(actor(), { company_id: f.companyId, on_date: f.date, limit: 50, offset: 0 })
      ).items.find((i) => i.employee_id === f.person.employeeId)?.status,
    ).toBe("on_leave");
    const usage = (
      await repo.leaveLedger(actor(), {
        company_id: f.companyId,
        employee_id: f.person.employeeId,
        leave_type_id: f.type.id,
        as_of: f.date,
        limit: 25,
        offset: 0,
      })
    ).items.filter((t) => t.kind === "used");
    expect(usage).toHaveLength(1);
    expect(usage[0]?.days).toBe("-1.0000");
    await expect(
      pool.query("update hr_leave_request_day set days=0.5 where tenant_id=$1 and request_id=$2", [tenant, result.id]),
    ).rejects.toThrow(/immutable/i);
  });
  it("excludes holidays and prevents overlap, stale evidence and insufficient balance", async () => {
    const f = await fixture();
    await expect(create(f)).rejects.toMatchObject({ status: 409 });
    await credit(f, "1");
    const { result } = await create(f);
    await action(f, result.id, "submit");
    await expect(create(f)).rejects.toMatchObject({ status: 409 });
    await action(f, result.id, "cancel");
    expect((await balance(f)).available).toBe("1.0000");
    await pool.query(
      `insert into hr_holiday(tenant_id,id,company_id,holiday_date,name,optional,status,created_by) values($1,$2,$3,$4,'Controlled company holiday',false,'active','r06.maker')`,
      [tenant, "leave-holiday-" + key(), f.companyId, f.date],
    );
    expect((await context(f)).days[0]?.chargeable).toBe(false);
    await expect(create(f)).rejects.toMatchObject({ status: 409 });
  });
  it("releases pending reservations after rejection without changing posted balance", async () => {
    const f = await fixture();
    await credit(f);
    const { result } = await create(f);
    await action(f, result.id, "submit");
    await action(f, result.id, "manager_reject", f.managerId);
    const b = await balance(f);
    expect(b.balance).toBe("10.0000");
    expect(b.reserved).toBe("0.0000");
    expect((await detail(f, result.id)).allowed_actions).toEqual([]);
  });
  it("tracks future approved usage separately from posted/as-of balances", async () => {
    const f = await fixture();
    await credit(f);
    const future = (await pool.query<{ date: string }>("select (current_date+3)::text as date")).rows[0]!.date;
    const { result } = await create(f, "full", future);
    await approve(f, result.id);
    const b = await balance(f);
    expect(b.balance).toBe("10.0000");
    expect(b.future_used).toBe("1.0000");
    expect(b.available).toBe("9.0000");
  });
  it("requires supporting documents with employee scope, verification and expiry", async () => {
    const f = await fixture();
    await credit(f);
    const later = (await pool.query<{ date: string }>("select (current_date+1)::text as date")).rows[0]!.date;
    await repo.updateLeavePolicy(
      actor(),
      f.type.id,
      {
        company_id: f.companyId,
        expected_version: 1,
        policy: { ...f.policy, effective_from: later, document_required_after_days: "0" },
        reason: "Require verified support before all future leave approvals",
      },
      key(),
      corr,
    );
    await expect(create(f, "full", later)).rejects.toMatchObject({ status: 409 });
    const doc = "leave-doc-" + key();
    await pool.query(
      `insert into employee_document(tenant_id,id,employee_id,document_type,title,storage_key,created_by,verification_status,status) values($1,$2,$3,'medical','Verified leave supporting evidence',null,'r06.maker','verified','active')`,
      [tenant, doc, f.person.employeeId],
    );
    const ctx = await context(f, later, { document_id: doc });
    expect(ctx.documents.map((d) => d.id)).toContain(doc);
    const { result } = await create(f, "full", later, { document_id: doc, expected_evidence_hash: ctx.hash });
    expect((await detail(f, result.id)).document_id).toBe(doc);
  });
  it("preserves approved request policy dates when creating successor versions", async () => {
    const f = await fixture();
    await credit(f);
    const future = (await pool.query<{ date: string }>("select (current_date+3)::text as date")).rows[0]!.date;
    const { result } = await create(f, "full", future);
    await approve(f, result.id);
    const earlier = (await pool.query<{ date: string }>("select (current_date+1)::text as date")).rows[0]!.date;
    await expect(
      repo.updateLeavePolicy(
        actor(),
        f.type.id,
        {
          company_id: f.companyId,
          expected_version: 1,
          policy: { ...f.policy, effective_from: earlier },
          reason: "Policy successor cannot remove already approved future dates",
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await repo.listLeaveTypes(actor(), { company_id: f.companyId, as_of: f.date, limit: 25, offset: 0 })).items[0]
        ?.version,
    ).toBe(1);
  });
  it("enforces ledger caps, opening uniqueness and reserved balance protection", async () => {
    const f = await fixture();
    await credit(f, "1");
    await expect(credit(f, "1")).rejects.toMatchObject({ status: 409 });
    const { result } = await create(f);
    await action(f, result.id, "submit");
    await expect(credit(f, "-1", { kind: "adjustment" })).rejects.toMatchObject({ status: 409 });
    await expect(credit(f, "50", { kind: "adjustment" })).rejects.toMatchObject({ status: 409 });
    expect(
      hrLeaveBalanceDirectorySchema.parse(
        await repo.listLeaveBalances(actor(), { company_id: f.companyId, as_of: f.date, limit: 25, offset: 0 }),
      ).total,
    ).toBe(2);
  });
  it("replays create/post writes without double credits and rejects changed idempotency payloads", async () => {
    const f = await fixture(),
      b = await balance(f),
      token = key(),
      input = {
        company_id: f.companyId,
        employee_id: f.person.employeeId,
        leave_type_id: f.type.id,
        effective_on: f.date,
        kind: "opening" as const,
        days: "10",
        period_start: null,
        period_end: null,
        expected_balance_hash: b.hash,
        reason: "Controlled idempotent opening balance with source evidence",
      };
    const a = await repo.postLeaveBalance(actor(), input, token, corr),
      replay = await repo.postLeaveBalance(actor(), input, token, corr);
    expect(replay).toMatchObject({ id: a.id, replayed: true });
    await expect(repo.postLeaveBalance(actor(), { ...input, days: "11" }, token, corr)).rejects.toMatchObject({
      status: 409,
    });
    expect((await balance(f)).balance).toBe("10.0000");
  });
  it("protects tenant/company scope and mutation permissions", async () => {
    const f = await fixture();
    await expect(
      repo.listLeaveTypes(actor("r06.restricted"), { company_id: f.companyId, as_of: f.date, limit: 25, offset: 0 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.listLeaveBalances(
        actor(
          "r06.maker",
          leavePermissions.filter((p) => p !== "hr.leave.balance.read"),
        ),
        { company_id: f.companyId, as_of: f.date, limit: 25, offset: 0 },
      ),
    ).rejects.toMatchObject({ status: 403 });
    const ctx = await repo.leaveContext(
      actor(
        "r06.maker",
        leavePermissions.filter((p) => p !== "hr.employee_document.read"),
      ),
      {
        company_id: f.companyId,
        from_date: f.date,
        to_date: f.date,
        employee_id: f.person.employeeId,
        leave_type_id: f.type.id,
      },
    );
    expect(ctx.documents).toEqual([]);
  });
  it("reconciles explicit half-day leave with worked time and frozen payroll inputs", async () => {
    const f = await fixture(true);
    await credit(f);
    for (const [direction, time] of [
      ["in", "04:00:00"],
      ["out", "08:00:00"],
    ])
      await pool.query(
        `insert into hr_attendance_punch(tenant_id,id,company_id,employee_id,work_date,occurred_at,direction,source,source_reference,captured_by) values($1,$2,$3,$4,$5,$6,$7,'web',$8,'r06.maker')`,
        [
          tenant,
          "leave-half-punch-" + key(),
          f.companyId,
          f.person.employeeId,
          f.date,
          f.date + "T" + time + "+05:00",
          direction,
          key(),
        ],
      );
    const { result } = await create(f, "first_half");
    await approve(f, result.id);
    const day = (
      await repo.listDailyAttendance(actor(), { company_id: f.companyId, on_date: f.date, limit: 50, offset: 0 })
    ).items.find((r) => r.employee_id === f.person.employeeId)!;
    expect(day.status).toBe("partial_leave");
    expect(day.worked_minutes).toBe(210);
    expect(day.issues).toEqual([]);
    for (const action of ["open", "process"] as const) {
      const w = await repo.periodWorkspace(actor(), { company_id: f.companyId, month: f.date, limit: 25, offset: 0 });
      await repo.actOnPeriod(
        actor(),
        {
          company_id: f.companyId,
          month: f.date,
          action,
          expected_version: w.period?.version ?? 0,
          reason: "Controlled half-day leave payroll reconciliation acceptance",
          override_self_approval: false,
        },
        key(),
        corr,
      );
    }
    const w = await repo.periodWorkspace(actor(), { company_id: f.companyId, month: f.date, limit: 25, offset: 0 });
    expect(w.period?.state).toBe("hr_review");
    const item = w.items.find((i) => i.employee_id === f.person.employeeId)!;
    expect(item.days[0]?.paid_days).toBe("1.0000");
    expect(item.days[0]?.approved_leave_days).toBe("0.5000");
    expect(item.days[0]?.present_days).toBe("0.5000");
    await repo.actOnPeriod(
      actor("r06.checker"),
      {
        company_id: f.companyId,
        month: f.date,
        action: "lock",
        expected_version: w.period!.version,
        expected_source_hash: w.period!.review_hash!,
        reason: "Independent locker reviewed exact fractional attendance evidence",
        override_self_approval: false,
      },
      key(),
      corr,
    );
    await expect(create(f)).rejects.toMatchObject({ status: 409 });
  });
  it("cancels approved leave only through independent HR and exact immutable reversals", async () => {
    const f = await fixture();
    await credit(f);
    const future = (await pool.query<{ date: string }>("select (current_date+3)::text as date")).rows[0]!.date;
    const { result } = await create(f, "full", future);
    await approve(f, result.id);
    const original = await detail(f, result.id);
    expect(original.allowed_actions).not.toContain("cancel_approved");
    const d = await detail(f, result.id, "r06.last-admin-a");
    expect(d.allowed_actions).toContain("cancel_approved");
    await repo.actOnLeaveRequest(
      actor("r06.last-admin-a"),
      result.id,
      {
        company_id: f.companyId,
        action: "cancel_approved",
        expected_version: d.version,
        expected_evidence_hash: d.context!.hash,
        reason: "Independent HR approved cancellation before payroll period lock",
        override_self_approval: false,
      },
      key(),
      corr,
    );
    const b = await balance(f);
    expect(b.balance).toBe("10.0000");
    expect(b.future_used).toBe("0.0000");
    expect(b.available).toBe("10.0000");
    const final = await detail(f, result.id);
    expect(final.status).toBe("cancelled");
    expect(final.hr_decided_by).toBe("r06.checker");
    expect(final.history[0]?.action).toBe("cancel_approved");
    expect(
      (
        await repo.leaveLedger(actor(), {
          company_id: f.companyId,
          employee_id: f.person.employeeId,
          leave_type_id: f.type.id,
          as_of: future,
          limit: 25,
          offset: 0,
        })
      ).items.filter((t) => t.kind === "reversal"),
    ).toHaveLength(1);
  });
  it("finalizes manager-only leave without inventing an HR decision", async () => {
    const f = await fixture();
    await credit(f);
    const future = (await pool.query<{ date: string }>("select (current_date+3)::text as date")).rows[0]!.date;
    await repo.updateLeavePolicy(
      actor(),
      f.type.id,
      {
        company_id: f.companyId,
        expected_version: 1,
        policy: { ...f.policy, effective_from: future, requires_hr_approval: false },
        reason: "Controlled manager-only approval policy for future requests",
      },
      key(),
      corr,
    );
    const { result } = await create(f, "full", future);
    await action(f, result.id, "submit");
    await action(f, result.id, "manager_approve", f.managerId);
    const d = await detail(f, result.id);
    expect(d.status).toBe("approved");
    expect(d.hr_decided_by).toBeNull();
    expect((await balance(f)).future_used).toBe("1.0000");
  });
  it("serializes competing reservations so pending requests cannot overspend one balance", async () => {
    const f = await fixture();
    await credit(f, "1");
    const first = (await pool.query<{ date: string }>("select (current_date+3)::text as date")).rows[0]!.date,
      second = (await pool.query<{ date: string }>("select (current_date+4)::text as date")).rows[0]!.date;
    const a = await create(f, "full", first),
      b = await create(f, "full", second);
    const da = await detail(f, a.result.id),
      db = await detail(f, b.result.id);
    const input = (d: typeof da) => ({
      company_id: f.companyId,
      action: "submit" as const,
      expected_version: d.version,
      expected_evidence_hash: d.context!.hash,
      reason: "Concurrent leave submission must reserve real available balance",
      override_self_approval: false,
    });
    const results = await Promise.allSettled([
      repo.actOnLeaveRequest(actor(), da.id, input(da), key(), corr),
      repo.actOnLeaveRequest(actor(), db.id, input(db), key(), corr),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await balance(f)).reserved).toBe("1.0000");
    expect((await balance(f)).available).toBe("0.0000");
  });
  it("corrects a missing punch on an approved half-day without losing the leave portion", async () => {
    const f = await fixture(true);
    await credit(f);
    const { result } = await create(f, "first_half");
    await approve(f, result.id);
    await pool.query(
      `insert into hr_attendance_punch(tenant_id,id,company_id,employee_id,work_date,occurred_at,direction,source,source_reference,captured_by) values($1,$2,$3,$4,$5,$6,'in','web',$7,'r06.maker')`,
      [
        tenant,
        "leave-correction-punch-" + key(),
        f.companyId,
        f.person.employeeId,
        f.date,
        f.date + "T04:00:00+05:00",
        key(),
      ],
    );
    const evidence = (
      await repo.getCorrectionContext(actor(), {
        company_id: f.companyId,
        employee_id: f.person.employeeId,
        on_date: f.date,
      })
    ).evidence!;
    const correction = await repo.createCorrection(
      actor(),
      {
        company_id: f.companyId,
        employee_id: f.person.employeeId,
        work_date: f.date,
        kind: "missing_out",
        stated_in: null,
        stated_out: f.date + "T08:00:00+05:00",
        reason: "Device missed checkout after the working half of an approved leave day",
        expected_evidence_hash: evidence.hash,
      },
      key(),
      corr,
    );
    for (const [action, who] of [
      ["submit", "r06.maker"],
      ["manager_approve", f.managerId],
      ["hr_approve", "r06.checker"],
    ] as const) {
      const d = await repo.getCorrection(actor(who), f.companyId, correction.id);
      await repo.actOnCorrection(
        actor(who),
        correction.id,
        {
          company_id: f.companyId,
          action,
          expected_version: d.version,
          expected_evidence_hash: d.evidence!.hash,
          reason: "Independent review of half-day leave and corrected checkout evidence",
          override_self_approval: false,
        },
        key(),
        corr,
      );
    }
    const day = (
      await repo.listDailyAttendance(actor(), { company_id: f.companyId, on_date: f.date, limit: 50, offset: 0 })
    ).items.find((r) => r.employee_id === f.person.employeeId)!;
    expect(day.status).toBe("partial_leave");
    expect(day.worked_minutes).toBe(210);
    expect(day.late_minutes).toBe(0);
    expect(day.correction_applied).toBe(true);
    expect(day.issues).toEqual([]);
  });
  it("allows independently approved cancellation after a future placement end, using original usage scope", async () => {
    const f = await fixture();
    await credit(f);
    const future = (await pool.query<{ date: string }>("select (current_date+5)::text as date")).rows[0]!.date;
    const { result } = await create(f, "full", future);
    await approve(f, result.id);
    await pool.query(
      "update employee_assignment set assignment_status='ended',effective_to=current_date+2 where tenant_id=$1 and id=$2",
      [tenant, f.person.assignmentId],
    );
    const d = await detail(f, result.id, "r06.last-admin-a");
    expect(d.allowed_actions).toContain("cancel_approved");
    await repo.actOnLeaveRequest(
      actor("r06.last-admin-a"),
      result.id,
      {
        company_id: f.companyId,
        action: "cancel_approved",
        expected_version: d.version,
        expected_evidence_hash: d.context!.hash,
        reason: "Independent HR cancelled future leave after approved employment placement ended",
        override_self_approval: false,
      },
      key(),
      corr,
    );
    expect((await balance(f)).available).toBe("10.0000");
    expect((await detail(f, result.id)).status).toBe("cancelled");
  });
  it("does not expose a foreign company employee, bindings or document metadata through leave context", async () => {
    const own = await fixture(),
      foreign = await fixture();
    await expect(
      repo.leaveContext(actor(own.managerId), {
        company_id: own.companyId,
        employee_id: foreign.person.employeeId,
        leave_type_id: own.type.id,
        from_date: own.date,
        to_date: own.date,
      }),
    ).rejects.toMatchObject({ status: 404, code: "HR_LEAVE_EMPLOYEE_NOT_FOUND" });
    await expect(
      repo.leaveContext(actor(own.managerId), {
        company_id: own.companyId,
        employee_id: foreign.person.employeeId,
        leave_type_id: own.type.id,
        from_date: own.date,
        to_date: own.date,
        request_id: "foreign-or-invented-request",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
