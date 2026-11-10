import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  createHrSelfAttendancePunchSchema,
  hrEmployeeAttendanceRecordsSchema,
  hrSelfAttendanceSchema,
  type SaveHrSelfAttendanceDay,
} from "../../packages/contracts/src/hr/index.js";
import { correctionActor } from "./hr-correction-fixture.js";
import { createPersonalLeaveFixture, personalLeavePermissions } from "./hr-self-leave-fixture.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";

const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Employee self-service check-in and check-out", () => {
  let pool: DatabasePool;
  let f: Awaited<ReturnType<typeof createPersonalLeaveFixture>>;
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    f = await createPersonalLeaveFixture(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });
  const workspace = async () =>
    hrSelfAttendanceSchema.parse(
      await f.repo.getSelfAttendance(f.own(), { company_id: f.companyId, from: f.today, to: f.today }),
    );
  const punch = (input: Record<string, unknown>, key: string = randomUUID()) =>
    f.repo.createSelfAttendancePunch(
      f.own(),
      createHrSelfAttendancePunchSchema.parse({ company_id: f.companyId, work_mode: "office", ...input }),
      key,
      "self-attendance-test",
    );

  it("records an audited own check-in and check-out with mode and notes, once per day", async () => {
    const before = await workspace();
    expect(before.employee_id).toBe(f.person.employeeId);
    expect(before.today_record).toBeNull();
    expect(before.rules).toMatchObject({ minimum_work_minutes: 420, half_day_below_minutes: 240, late_after: "11:00" });

    await expect(punch({ direction: "out" })).rejects.toMatchObject({ code: "HR_ATTENDANCE_CHECK_IN_REQUIRED" });
    if (before.now_time < "23:58")
      await expect(punch({ direction: "in", time: "23:59" })).rejects.toMatchObject({
        code: "HR_ATTENDANCE_FUTURE_TIME",
      });

    const key = randomUUID();
    const checkIn = await punch({ direction: "in", work_mode: "remote", note: "Starting from home" }, key);
    expect(checkIn).toMatchObject({ status: "checked_in", replayed: false });
    expect(await punch({ direction: "in", work_mode: "remote", note: "Starting from home" }, key)).toMatchObject({
      id: checkIn.id,
      replayed: true,
    });
    await expect(punch({ direction: "in" })).rejects.toMatchObject({ code: "HR_ATTENDANCE_ALREADY_CHECKED_IN" });

    const open = await workspace();
    expect(open.today_record).toMatchObject({ status: "in_progress", work_mode: "remote", note: "Starting from home" });
    if (open.today_record!.check_in_time! > "00:00")
      await expect(punch({ direction: "out", time: "00:00" })).rejects.toMatchObject({
        code: "HR_ATTENDANCE_CHECK_OUT_ORDER",
      });

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await punch({ direction: "out", note: "Done for today" })).toMatchObject({ status: "checked_out" });
    await expect(punch({ direction: "out" })).rejects.toMatchObject({ code: "HR_ATTENDANCE_ALREADY_CHECKED_OUT" });

    const done = await workspace();
    expect(done.today_record).toMatchObject({
      status: "half_day",
      work_mode: "remote",
      note: "Starting from home · Done for today",
    });
    expect(done.summary).toMatchObject({ recorded_days: 1, half_day: 1, remote: 1 });

    const stored = await pool.query(
      "select direction,source,work_mode,note,captured_by from hr_attendance_punch where tenant_id=$1 and employee_id=$2 and work_date=$3 order by occurred_at",
      [tenant, f.person.employeeId, f.today],
    );
    expect(stored.rows).toEqual([
      { direction: "in", source: "web", work_mode: "remote", note: "Starting from home", captured_by: f.user },
      { direction: "out", source: "web", work_mode: "office", note: "Done for today", captured_by: f.user },
    ]);
    const events = await pool.query(
      "select action from hr_attendance_completion_event where tenant_id=$1 and resource_type='attendance_punch' and actor_id=$2 order by occurred_at",
      [tenant, f.user],
    );
    expect(events.rows.map((r) => r.action)).toEqual(["check_in", "check_out"]);
  });

  it("saves a corrected check-in time again, keeping the original punch as replaced history", async () => {
    const before = await workspace();
    const record = before.today_record!;
    expect(before.today_editable).toBe(true);
    const save = (input: Record<string, unknown>) =>
      f.repo.saveSelfAttendanceDay(
        f.own(),
        // Unparsed on purpose: the first check-in and check-out may share a minute, which the request schema rejects.
        { company_id: f.companyId, work_mode: "remote", ...input } as SaveHrSelfAttendanceDay,
        randomUUID(),
        "self-attendance-test",
      );
    await expect(save({ check_in: record.check_in_time, check_out: null })).rejects.toMatchObject({
      code: "HR_ATTENDANCE_CHECK_OUT_REQUIRED",
    });
    // Same times: only the day's note moves onto the check-in; the original timestamps are kept.
    const same = { check_in: record.check_in_time, check_out: record.check_out_time, note: record.note };
    expect(await save(same)).toMatchObject({ status: "checked_out" });
    expect((await workspace()).today_record).toMatchObject({
      check_in_at: record.check_in_at,
      check_out_at: record.check_out_at,
      note: record.note,
    });
    await expect(save(same)).rejects.toMatchObject({ code: "HR_ATTENDANCE_NO_CHANGE" });
    if (record.check_in_time! <= "00:00") return;

    expect(
      await save({ check_in: "00:00", check_out: record.check_out_time, note: "Forgot to check in on time" }),
    ).toMatchObject({ status: "checked_out", replayed: false });
    const after = await workspace();
    expect(after.today_record).toMatchObject({
      check_in_time: "00:00",
      check_out_time: record.check_out_time,
      note: "Forgot to check in on time",
      work_mode: "remote",
    });
    expect(after.summary.recorded_days).toBe(1);

    const replaced = await pool.query(
      "select p.direction from hr_attendance_punch_amendment m join hr_attendance_punch p on p.tenant_id=m.tenant_id and p.id=m.punch_id where m.tenant_id=$1 and m.employee_id=$2 and m.work_date=$3 order by p.direction",
      [tenant, f.person.employeeId, f.today],
    );
    // First save: both punches re-recorded (the note moved to the check-in). Second save: the check-in again.
    expect(replaced.rows.map((r) => r.direction)).toEqual(["in", "in", "out"]);
    const events = await pool.query(
      "select action from hr_attendance_completion_event where tenant_id=$1 and resource_type='attendance_punch' and resource_id like 'attendance-day-%' and actor_id=$2",
      [tenant, f.user],
    );
    expect(events.rows.map((r) => r.action)).toEqual(["correct_day", "correct_day"]);
    await expect(
      pool.query("update hr_attendance_punch_amendment set reason='x' where tenant_id=$1", [tenant]),
    ).rejects.toThrow();
  });

  it("lets HR read the employee's records only with attendance and punch read", async () => {
    const hr = correctionActor("r06.maker", personalLeavePermissions);
    const records = hrEmployeeAttendanceRecordsSchema.parse(
      await f.repo.getEmployeeAttendanceRecords(hr, {
        company_id: f.companyId,
        employee_id: f.person.employeeId,
        from: f.today.slice(0, 8) + "01",
        to: f.today,
      }),
    );
    expect(records.records.map((r) => r.on_date)).toContain(f.today);
    const withoutPunches = correctionActor(
      "r06.maker",
      personalLeavePermissions.filter((p) => p !== "hr.attendance.punch.read"),
    );
    await expect(
      f.repo.getEmployeeAttendanceRecords(withoutPunches, {
        company_id: f.companyId,
        employee_id: f.person.employeeId,
        from: f.today,
        to: f.today,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses check-in for a sign-in without its own employee binding", async () => {
    await expect(
      f.repo.createSelfAttendancePunch(
        correctionActor("r06.checker", [], ["employee"]),
        createHrSelfAttendancePunchSchema.parse({ company_id: f.companyId, direction: "in", work_mode: "office" }),
        randomUUID(),
        "self-attendance-test",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
