import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import {
  hrOvertimeDetailSchema,
  hrAttendancePeriodWorkspaceSchema,
  hrAttendancePayrollInputsSchema,
} from "../../packages/contracts/src/hr/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createCorrectionFixture, correctionActor, correctionPermissions } from "./hr-correction-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;
const permissions = [
  ...correctionPermissions,
  ...["read", "create", "submit", "cancel", "manager_approve", "manager_reject", "hr_approve", "hr_reject"].map(
    (p) => "hr.attendance.overtime." + p,
  ),
  "hr.attendance.overtime_rule.read",
  "hr.attendance.overtime_rule.manage",
  "hr.attendance.period.read",
  "hr.attendance.period.manage",
  "hr.attendance.period.lock",
  "hr.attendance.payroll_input.read",
];
const actor = (id = "r06.maker", p = permissions) => correctionActor(id, p),
  key = () => randomUUID(),
  corr = "attendance-completion-integration";
run("Connected Overtime → Attendance Close → Payroll Inputs", () => {
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
  async function fixture() {
    const f = await createCorrectionFixture(pool),
      person = await f.target();
    const month = (
      await pool.query<{ month: string }>(
        "select (date_trunc('month',current_date)-interval '1 month')::date::text as month",
      )
    ).rows[0]!.month;
    for (const employeeId of [f.manager.employeeId, person.employeeId])
      await pool.query(
        `insert into hr_shift_assignment(tenant_id,id,company_id,scope,scope_id,shift_id,effective_from,effective_to,note,created_by) values($1,$2,$3,'employee',$4,$5,$6::date,current_date-1,'Synthetic historical roster for close acceptance','r06.maker')`,
        [tenant, "historic-roster-" + key(), f.companyId, employeeId, f.shift.id, month],
      );
    const result = { ...f, person, month };
    fixtures.push(result);
    return result;
  }
  async function punches(f: Awaited<ReturnType<typeof fixture>>, date = f.month, end = "10:00:00") {
    for (const [direction, time] of [
      ["in", "00:00:00"],
      ["out", end],
    ])
      await pool.query(
        `insert into hr_attendance_punch(tenant_id,id,company_id,employee_id,work_date,occurred_at,direction,source,source_reference,captured_by) values($1,$2,$3,$4,$5,$6,$7,'web',$8,'r06.maker')`,
        [
          tenant,
          "close-punch-" + key(),
          f.companyId,
          f.person.employeeId,
          date,
          date + "T" + time + "+05:00",
          direction,
          key(),
        ],
      );
  }
  async function rule(f: Awaited<ReturnType<typeof fixture>>, category: "regular" | "weekend" | "holiday" = "regular") {
    return repo.createOvertimeRule(
      actor(),
      {
        company_id: f.companyId,
        category,
        effective_from: f.month,
        effective_to: null,
        minimum_minutes: 30,
        daily_cap_minutes: 240,
        reason: "Verified operational overtime rule for attendance acceptance",
      },
      key(),
      corr,
    );
  }
  async function claim(f: Awaited<ReturnType<typeof fixture>>, date = f.month) {
    const e = (
      await repo.overtimeContext(actor(), { company_id: f.companyId, on_date: date, employee_id: f.person.employeeId })
    ).evidence!;
    const input = {
      company_id: f.companyId,
      employee_id: f.person.employeeId,
      work_date: date,
      requested_minutes: 90,
      reason: "Approved extra service delivery work beyond the scheduled shift",
      expected_evidence_hash: e.hash,
    };
    return { e, input, result: await repo.createOvertime(actor(), input, key(), corr) };
  }
  async function action(
    f: Awaited<ReturnType<typeof fixture>>,
    id: string,
    action: "submit" | "cancel" | "manager_approve" | "manager_reject" | "hr_approve" | "hr_reject",
    who = "r06.maker",
    extra = {},
  ) {
    const d = await repo.getOvertime(actor(who), f.companyId, id);
    return repo.actOnOvertime(
      actor(who),
      id,
      {
        company_id: f.companyId,
        action,
        expected_version: d.version,
        expected_evidence_hash: d.evidence?.hash,
        reason: "Reviewed source attendance and overtime evidence carefully",
        override_self_approval: false,
        ...extra,
      },
      key(),
      corr,
    );
  }
  async function periodAction(
    f: Awaited<ReturnType<typeof fixture>>,
    action: "open" | "process" | "lock",
    who = "r06.maker",
    extra = {},
    token = key(),
  ) {
    const d = await repo.periodWorkspace(actor(who), { company_id: f.companyId, month: f.month, limit: 25, offset: 0 });
    return repo.actOnPeriod(
      actor(who),
      {
        company_id: f.companyId,
        month: f.month,
        action,
        expected_version: d.period?.version ?? 0,
        expected_source_hash: d.period?.review_hash ?? undefined,
        reason: "Reviewed the complete attendance period and its source evidence",
        override_self_approval: false,
        ...extra,
      },
      token,
      corr,
    );
  }
  const workspace = (f: Awaited<ReturnType<typeof fixture>>) =>
    repo.periodWorkspace(actor(), { company_id: f.companyId, month: f.month, limit: 25, offset: 0 });
  it("routes three actors, locks reviewed hours atomically and exposes frozen daily payroll evidence", async () => {
    const f = await fixture();
    await punches(f);
    await rule(f);
    const { e, result } = await claim(f);
    expect(e.eligible_minutes).toBe(90);
    expect(hrOvertimeDetailSchema.parse(await repo.getOvertime(actor(), f.companyId, result.id)).status).toBe("draft");
    await action(f, result.id, "submit");
    await expect(action(f, result.id, "manager_approve", "r06.checker")).rejects.toMatchObject({ status: 403 });
    await action(f, result.id, "manager_approve", f.managerId);
    expect(
      (
        await repo.listDailyAttendance(actor(), { company_id: f.companyId, on_date: f.month, limit: 50, offset: 0 })
      ).items.find((r) => r.employee_id === f.person.employeeId)?.approved_overtime_minutes,
    ).toBe(0);
    await action(f, result.id, "hr_approve", "r06.checker", { approved_minutes: 60 });
    await periodAction(f, "open");
    await periodAction(f, "process");
    const review = hrAttendancePeriodWorkspaceSchema.parse(await workspace(f));
    expect(review.period?.state).toBe("hr_review");
    expect(review.total).toBe(2);
    expect(review.items.find((i) => i.employee_id === f.person.employeeId)?.overtime_regular_minutes).toBe(60);
    await expect(periodAction(f, "lock")).rejects.toMatchObject({ status: 403 });
    await periodAction(f, "lock", "r06.checker");
    const inputs = hrAttendancePayrollInputsSchema.parse(
      await repo.payrollInputs(actor(), { company_id: f.companyId, month: f.month, limit: 25, offset: 0 }),
    );
    expect(inputs.locked).toBe(true);
    const item = inputs.items.find((i) => i.employee_id === f.person.employeeId)!;
    expect(item.paid_days).toBe("1.0000");
    expect(item.overtime_regular_minutes).toBe(60);
    expect(item.days[0]?.overtime[0]?.id).toBe(result.id);
    const before = inputs.items;
    await expect(punches(f, f.month, "11:00:00")).rejects.toThrow(/locked/i);
    await expect(
      pool.query(`update hr_payroll_input set paid_days=0 where tenant_id=$1 and period_id=$2`, [
        tenant,
        inputs.period!.id,
      ]),
    ).rejects.toThrow(/immutable/i);
    expect(
      (await repo.payrollInputs(actor(), { company_id: f.companyId, month: f.month, limit: 25, offset: 0 })).items,
    ).toEqual(before);
  });
  it("blocks unresolved punches and pending overtime, then permits review after resolution", async () => {
    const f = await fixture();
    await punches(f);
    await rule(f);
    const { result } = await claim(f);
    await periodAction(f, "open");
    await periodAction(f, "process");
    let w = await workspace(f);
    expect(w.period?.state).toBe("exceptions");
    expect(
      w.items
        .flatMap((i) => i.days)
        .flatMap((d) => d.issues)
        .some((i) => i.includes("Pending overtime")),
    ).toBe(true);
    await expect(periodAction(f, "lock", "r06.checker")).rejects.toMatchObject({ status: 403 });
    await action(f, result.id, "cancel");
    await periodAction(f, "process");
    w = await workspace(f);
    expect(w.period?.state).toBe("hr_review");
  });
  it("rejects stale reviews when source ingestion changes a prepared month", async () => {
    const f = await fixture();
    await periodAction(f, "open");
    await periodAction(f, "process");
    await punches(f);
    await expect(periodAction(f, "lock", "r06.checker")).rejects.toMatchObject({ status: 409 });
    expect(
      (await repo.payrollInputs(actor(), { company_id: f.companyId, month: f.month, limit: 25, offset: 0 })).items,
    ).toEqual([]);
    await periodAction(f, "process");
    await periodAction(f, "lock", "r06.checker");
  });
  it("enforces company, permission and raw-punch privacy boundaries", async () => {
    const f = await fixture();
    await punches(f);
    await rule(f);
    const { result } = await claim(f);
    await expect(
      repo.listOvertime(actor("r06.restricted"), { company_id: f.companyId, month: f.month, limit: 25, offset: 0 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.payrollInputs(
        actor(
          "r06.maker",
          permissions.filter((p) => p !== "hr.attendance.payroll_input.read"),
        ),
        { company_id: f.companyId, month: f.month, limit: 25, offset: 0 },
      ),
    ).rejects.toMatchObject({ status: 403 });
    const d = await repo.getOvertime(
      actor(
        "r06.maker",
        permissions.filter((p) => p !== "hr.attendance.punch.read"),
      ),
      f.companyId,
      result.id,
    );
    expect(d.evidence?.attendance.day.punches).toBeNull();
    expect(d.history).toHaveLength(1);
  });
  it("rejects excess hours, stale evidence and over-approval; terminal claims cannot be changed", async () => {
    const f = await fixture();
    await punches(f);
    await rule(f);
    const e = (
      await repo.overtimeContext(actor(), {
        company_id: f.companyId,
        on_date: f.month,
        employee_id: f.person.employeeId,
      })
    ).evidence!;
    const input = {
      company_id: f.companyId,
      employee_id: f.person.employeeId,
      work_date: f.month,
      requested_minutes: 91,
      reason: "Controlled extra work request with reviewed evidence",
      expected_evidence_hash: e.hash,
    };
    await expect(repo.createOvertime(actor(), input, key(), corr)).rejects.toMatchObject({ status: 409 });
    await expect(
      repo.createOvertime(
        actor(),
        { ...input, requested_minutes: 60, expected_evidence_hash: "0".repeat(64) },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const { result } = await claim(f);
    await action(f, result.id, "submit");
    await action(f, result.id, "manager_approve", f.managerId);
    await expect(action(f, result.id, "hr_approve", "r06.checker", { approved_minutes: 100 })).rejects.toMatchObject({
      status: 409,
    });
    await action(f, result.id, "hr_reject", "r06.checker");
    await expect(action(f, result.id, "cancel")).rejects.toMatchObject({ status: 403 });
    const replacement = await claim(f);
    expect(replacement.result.id).not.toBe(result.id);
  });
  it("replays successful writes and rejects stale versions without duplicate events", async () => {
    const f = await fixture();
    await punches(f);
    await rule(f);
    const { input } = await claim(f);
    const requests = await repo.listOvertime(actor(), {
      company_id: f.companyId,
      month: f.month,
      limit: 25,
      offset: 0,
    });
    await action(f, requests.items[0]!.id, "cancel");
    const token = key(),
      created = await repo.createOvertime(actor(), input, token, corr),
      replayed = await repo.createOvertime(actor(), input, token, corr);
    expect(replayed).toMatchObject({ id: created.id, replayed: true });
    await expect(
      repo.createOvertime(actor(), { ...input, reason: "A different request reason" }, token, corr),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      repo.actOnOvertime(
        actor(),
        created.id,
        {
          company_id: f.companyId,
          action: "submit",
          expected_version: 99,
          reason: "Controlled stale version decision",
          override_self_approval: false,
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await repo.getOvertime(actor(), f.companyId, created.id)).history).toHaveLength(1);
  });
  it("derives weekend and holiday categories from attendance calendars", async () => {
    const f = await fixture();
    await pool.query(
      `insert into hr_holiday(tenant_id,id,company_id,holiday_date,name,optional,status,created_by) values($1,$2,$3,$4,'Acceptance holiday',false,'active','r06.maker')`,
      [tenant, "holiday-" + key(), f.companyId, f.month],
    );
    await punches(f);
    await rule(f, "holiday");
    const e = (
      await repo.overtimeContext(actor(), {
        company_id: f.companyId,
        on_date: f.month,
        employee_id: f.person.employeeId,
      })
    ).evidence!;
    expect(e.category).toBe("holiday");
    expect(e.eligible_minutes).toBe(240);
    const holiday = await repo.createOvertime(
      actor(),
      {
        company_id: f.companyId,
        employee_id: f.person.employeeId,
        work_date: f.month,
        requested_minutes: 120,
        reason: "Controlled holiday operational overtime request",
        expected_evidence_hash: e.hash,
      },
      key(),
      corr,
    );
    expect((await repo.getOvertime(actor(), f.companyId, holiday.id)).category).toBe("holiday");
  });
  it("prevents rule overlap, rule rewriting and processing current months", async () => {
    const f = await fixture();
    await punches(f);
    const r = await rule(f);
    await expect(rule(f)).rejects.toMatchObject({ status: 409 });
    await claim(f);
    await expect(
      pool.query("update hr_overtime_rule set minimum_minutes=10 where tenant_id=$1 and id=$2", [tenant, r.id]),
    ).rejects.toThrow(/immutable/i);
    const month = f.today.slice(0, 7) + "-01";
    await repo.actOnPeriod(
      actor(),
      {
        company_id: f.companyId,
        month,
        action: "open",
        expected_version: 0,
        reason: "Controlled current period opening",
        override_self_approval: false,
      },
      key(),
      corr,
    );
    await expect(
      repo.actOnPeriod(
        actor(),
        {
          company_id: f.companyId,
          month,
          action: "process",
          expected_version: 1,
          reason: "Current month must remain open",
          override_self_approval: false,
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("serializes competing locks with idempotency and emits only one lock event", async () => {
    const f = await fixture();
    await periodAction(f, "open");
    await periodAction(f, "process");
    const w = await workspace(f),
      input = {
        company_id: f.companyId,
        month: f.month,
        action: "lock" as const,
        expected_version: w.period!.version,
        expected_source_hash: w.period!.review_hash!,
        reason: "Concurrent lock approval against the identical reviewed source",
        override_self_approval: false,
      },
      token = key();
    const results = await Promise.all([
      repo.actOnPeriod(actor("r06.checker"), input, token, corr),
      repo.actOnPeriod(actor("r06.checker"), input, token, corr),
    ]);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect((await workspace(f)).history.filter((h) => h.action === "lock")).toHaveLength(1);
  });
  it("rechecks a source writer that commits while the close operation waits for its lock", async () => {
    const f = await fixture();
    await periodAction(f, "open");
    await periodAction(f, "process");
    const w = await workspace(f),
      client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:hr:attendance:${tenant}:${f.companyId}`,
      ]);
      await client.query(
        `insert into hr_attendance_punch(tenant_id,id,company_id,employee_id,work_date,occurred_at,direction,source,source_reference,captured_by) values($1,$2,$3,$4,$5,$6,'in','web',$7,'r06.maker')`,
        [
          tenant,
          "racing-punch-" + key(),
          f.companyId,
          f.person.employeeId,
          f.month,
          f.month + "T00:00:00+05:00",
          key(),
        ],
      );
      const assertion = expect(
        repo.actOnPeriod(
          actor("r06.checker"),
          {
            company_id: f.companyId,
            month: f.month,
            action: "lock",
            expected_version: w.period!.version,
            expected_source_hash: w.period!.review_hash!,
            reason: "Concurrent source writer must block stale attendance lock",
            override_self_approval: false,
          },
          key(),
          corr,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await new Promise((r) => setTimeout(r, 30));
      await client.query("commit");
      await assertion;
      expect((await workspace(f)).period?.state).toBe("hr_review");
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });
  it('creates an effective successor while retaining the original claimed rule terms',async()=>{
    const f=await fixture();await punches(f);const original=await rule(f);await claim(f);
    const next=(await pool.query<{date:string}>("select ($1::date+interval '1 month')::date::text as date",[f.month])).rows[0]!.date;
    const successor=await repo.createOvertimeRule(actor(),{company_id:f.companyId,category:'regular',effective_from:next,effective_to:null,minimum_minutes:45,daily_cap_minutes:180,reason:'Future operational overtime rule with preserved historical claim terms'},key(),corr);
    expect(successor.version).toBe(2);
    const rows=(await pool.query<{id:string;minimum_minutes:number;effective_to:string|null}>('select id,minimum_minutes,effective_to::text from hr_overtime_rule where tenant_id=$1 and id=any($2::text[])',[tenant,[original.id,successor.id]])).rows;
    expect(rows.find(r=>r.id===original.id)?.minimum_minutes).toBe(30);expect(rows.find(r=>r.id===original.id)?.effective_to).not.toBeNull();expect(rows.find(r=>r.id===successor.id)?.effective_to).toBeNull();
  });

});
