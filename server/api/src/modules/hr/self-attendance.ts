import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  CreateHrSelfAttendancePunch,
  HrAttendanceRecord,
  HrAttendanceRecordRules,
  HrAttendanceRecordSummary,
  HrAttendanceWorkMode,
  HrEmployeeAttendanceRecords,
  HrEmployeeAttendanceRecordsQuery,
  HrSelfAttendance,
  HrSelfAttendanceQuery,
  SaveHrSelfAttendanceDay,
} from "@nexora/contracts";
import { AttendanceCompletion, type AttendanceCompletionDependencies } from "./attendance-completion.js";
import { requireSelfServiceEmployee } from "./employee-self-service-authority.js";
import { HrApiError, type HrActorContext } from "./source-repository.js";

/**
 * Daily check-in / check-out rules. Suggested times are presets only; employees may also record "now".
 * 7h or more is a completed day, 4h to under 7h is an early leave and under 4h is a half day. A check-in
 * after the latest suggested check-in time is a late arrival.
 */
export const attendanceRecordRules: HrAttendanceRecordRules = {
  minimum_work_minutes: 7 * 60,
  half_day_below_minutes: 4 * 60,
  late_after: "11:00",
  check_in_presets: ["09:00", "10:00", "11:00"],
  check_out_presets: ["17:00", "18:00", "19:00"],
};

/** Punches that have not been replaced by a later correction (table alias `p`). */
const LIVE_PUNCH =
  "not exists(select 1 from hr_attendance_punch_amendment m where m.tenant_id=p.tenant_id and m.punch_id=p.id)";

type TodayPunch = {
  id: string;
  direction: "in" | "out";
  occurred_at: Date;
  local_time: string;
  work_mode: HrAttendanceWorkMode;
  note: string | null;
  source: string;
  source_reference: string;
  captured_by: string;
};
/** Only punches the employee recorded here themselves may be changed by them. */
const ownPunch = (p: TodayPunch, userId: string) =>
  p.source === "web" && p.source_reference.startsWith("self:") && p.captured_by === userId;

/** Clock skew tolerated between the browser's "now" and the server's when a preset is chosen. */
const FUTURE_TOLERANCE_MS = 60_000;

export type AttendancePunchRow = {
  on_date: string;
  direction: "in" | "out";
  occurred_at: Date | string;
  local_time: string;
  work_mode: HrAttendanceWorkMode;
  note: string | null;
};

const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

/** One day's punches -> one attendance record. Pure, so the self and HR views cannot disagree. */
export function evaluateAttendanceRecord(
  onDate: string,
  punches: readonly AttendancePunchRow[],
  today: string,
  rules: HrAttendanceRecordRules = attendanceRecordRules,
): HrAttendanceRecord {
  const ordered = [...punches].sort((a, b) => Date.parse(iso(a.occurred_at)) - Date.parse(iso(b.occurred_at)));
  const checkIn = ordered.find((p) => p.direction === "in") ?? null;
  const outs = ordered.filter(
    (p) => p.direction === "out" && (!checkIn || Date.parse(iso(p.occurred_at)) > Date.parse(iso(checkIn.occurred_at))),
  );
  const checkOut = outs.at(-1) ?? null;
  const worked =
    checkIn && checkOut
      ? Math.max(0, Math.floor((Date.parse(iso(checkOut.occurred_at)) - Date.parse(iso(checkIn.occurred_at))) / 60000))
      : 0;
  const status: HrAttendanceRecord["status"] =
    checkIn && checkOut
      ? worked >= rules.minimum_work_minutes
        ? "completed"
        : worked >= rules.half_day_below_minutes
          ? "early_leave"
          : "half_day"
      : checkIn
        ? onDate >= today
          ? "in_progress"
          : "missing_check_out"
        : "missing_check_in";
  const notes = [...new Set(ordered.map((p) => p.note?.trim()).filter((n): n is string => !!n))];
  return {
    on_date: onDate,
    check_in_at: checkIn ? iso(checkIn.occurred_at) : null,
    check_in_time: checkIn?.local_time ?? null,
    check_out_at: checkOut ? iso(checkOut.occurred_at) : null,
    check_out_time: checkOut?.local_time ?? null,
    worked_minutes: worked,
    status,
    arrival: checkIn ? (checkIn.local_time > rules.late_after ? "late" : "on_time") : null,
    work_mode: (checkIn ?? checkOut)?.work_mode ?? null,
    note: notes.length ? notes.join(" · ") : null,
  };
}

export function summarizeAttendanceRecords(records: readonly HrAttendanceRecord[]): HrAttendanceRecordSummary {
  return {
    recorded_days: records.length,
    completed: records.filter((r) => r.status === "completed").length,
    early_leave: records.filter((r) => r.status === "early_leave").length,
    half_day: records.filter((r) => r.status === "half_day").length,
    late: records.filter((r) => r.arrival === "late").length,
    remote: records.filter((r) => r.work_mode === "remote").length,
    worked_minutes: records.reduce((total, r) => total + r.worked_minutes, 0),
  };
}

export class SelfAttendance {
  private readonly writes: AttendanceCompletion;
  constructor(private readonly d: AttendanceCompletionDependencies) {
    this.writes = new AttendanceCompletion(d);
  }

  /** The attendance time zone: the employee's shift for today, else the database session's zone. */
  private async clock(client: PoolClient, c: HrActorContext, company: string, employee: string) {
    const base = (
      await client.query<{ today: string; now: Date; zone: string }>(
        "select current_date::text as today,now() as now,current_setting('TimeZone') as zone",
      )
    ).rows[0]!;
    // A missing or unresolvable shift only means the session zone is used; the savepoint keeps the transaction usable.
    await client.query("savepoint self_attendance_zone");
    const shiftDay = await this.d
      .days(client, c, company, [base.today], [employee], base.now, base.today, false)
      .then(async (days) => {
        await client.query("release savepoint self_attendance_zone");
        return days;
      })
      .catch(async () => {
        await client.query("rollback to savepoint self_attendance_zone");
        return [];
      });
    const zone = shiftDay[0]?.row.time_zone || base.zone;
    const local = (
      await client.query<{ today: string; now_time: string }>(
        "select (now() at time zone $1)::date::text as today,to_char(now() at time zone $1,'HH24:MI') as now_time",
        [zone],
      )
    ).rows[0]!;
    return { zone, now: base.now, today: local.today, nowTime: local.now_time };
  }

  private async records(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    employee: string,
    from: string,
    to: string,
    zone: string,
    today: string,
  ) {
    const rows = await client.query<AttendancePunchRow>(
      `select work_date::text as on_date,direction,occurred_at,to_char(occurred_at at time zone $6,'HH24:MI') as local_time,work_mode,note
       from hr_attendance_punch p where p.tenant_id=$1 and p.company_id=$2 and p.employee_id=$3 and p.work_date between $4::date and $5::date
       and ${LIVE_PUNCH} order by p.work_date,p.occurred_at,p.id limit 2000`,
      [c.tenantId, company, employee, from, to, zone],
    );
    const byDate = new Map<string, AttendancePunchRow[]>();
    for (const row of rows.rows) byDate.set(row.on_date, [...(byDate.get(row.on_date) ?? []), row]);
    return [...byDate.entries()].map(([date, punches]) => evaluateAttendanceRecord(date, punches, today));
  }

  /** Today's live punches, oldest first. */
  private async todayPunches(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    employee: string,
    today: string,
    zone: string,
  ) {
    return (
      await client.query<TodayPunch>(
        `select p.id,p.direction,p.occurred_at,to_char(p.occurred_at at time zone $5,'HH24:MI') as local_time,p.work_mode,p.note,p.source,p.source_reference,p.captured_by
         from hr_attendance_punch p where p.tenant_id=$1 and p.company_id=$2 and p.employee_id=$3 and p.work_date=$4::date and ${LIVE_PUNCH}
         order by p.occurred_at,p.id`,
        [c.tenantId, company, employee, today, zone],
      )
    ).rows;
  }

  private async employee(client: PoolClient, c: HrActorContext, company: string, employee: string) {
    const row = (
      await client.query<{ employee_number: string; display_name: string }>(
        `select e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as display_name from employee e
         where e.tenant_id=$1 and e.id=$3 and exists(select 1 from employee_assignment ea where ea.tenant_id=e.tenant_id and ea.employee_id=e.id and ea.company_id=$2)`,
        [c.tenantId, company, employee],
      )
    ).rows[0];
    if (!row)
      throw new HrApiError(404, "HR_EMPLOYEE_NOT_FOUND", "This employee has no attendance in the selected company.");
    return row;
  }

  private async body(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    employee: string,
    from: string,
    to: string,
  ) {
    const clock = await this.clock(client, c, company, employee);
    const person = await this.employee(client, c, company, employee);
    const records = await this.records(client, c, company, employee, from, to, clock.zone, clock.today);
    return {
      clock,
      body: {
        company_id: company,
        employee_id: employee,
        employee_number: person.employee_number,
        display_name: person.display_name,
        time_zone: clock.zone,
        today: clock.today,
        from,
        to,
        rules: attendanceRecordRules,
        summary: summarizeAttendanceRecords(records),
        records: [...records].sort((a, b) => b.on_date.localeCompare(a.on_date)),
      },
    };
  }

  /** The signed-in employee's own check-in state and records. Ownership is the authority; no HR role is needed. */
  async workspace(c: HrActorContext, q: HrSelfAttendanceQuery): Promise<HrSelfAttendance> {
    const client = await this.d.pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
      const employee = await requireSelfServiceEmployee(client, c, q.company_id);
      const { clock, body } = await this.body(client, c, q.company_id, employee, q.from, q.to);
      const todayRecord =
        body.records.find((r) => r.on_date === clock.today) ??
        (await this.records(client, c, q.company_id, employee, clock.today, clock.today, clock.zone, clock.today))[0] ??
        null;
      const locked = await client.query(
        "select 1 from hr_attendance_period where tenant_id=$1 and company_id=$2 and month=date_trunc('month',$3::date)::date and state='locked'",
        [c.tenantId, q.company_id, clock.today],
      );
      const today = await this.todayPunches(client, c, q.company_id, employee, clock.today, clock.zone);
      await client.query("commit");
      return {
        ...body,
        now_time: clock.nowTime,
        today_record: todayRecord,
        today_editable: today.every((p) => ownPunch(p, c.actor.userId)),
        period_locked: !!locked.rowCount,
      };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Records the signed-in employee's own check-in or check-out for today. */
  async punch(c: HrActorContext, input: CreateHrSelfAttendancePunch, key: string, corr: string) {
    let employee = "";
    return this.writes.runWrite(
      c,
      input.company_id,
      "hr.attendance.self.punch",
      key,
      corr,
      "/api/v1/hr/self_service/attendance/punches",
      input,
      async (client) => {
        const clock = await this.clock(client, c, input.company_id, employee);
        const occurred = input.time
          ? (
              await client.query<{ at: Date }>("select ($1::date + $2::time) at time zone $3 as at", [
                clock.today,
                input.time,
                clock.zone,
              ])
            ).rows[0]!.at
          : clock.now;
        if (occurred.getTime() > clock.now.getTime() + FUTURE_TOLERANCE_MS)
          throw new HrApiError(
            400,
            "HR_ATTENDANCE_FUTURE_TIME",
            "That time has not happened yet. Choose Now or an earlier time.",
          );
        const today = {
          rows: await this.todayPunches(client, c, input.company_id, employee, clock.today, clock.zone),
        };
        const checkIn = today.rows.find((p) => p.direction === "in");
        if (input.direction === "in" && checkIn)
          throw new HrApiError(409, "HR_ATTENDANCE_ALREADY_CHECKED_IN", "You have already checked in today.");
        if (input.direction === "out") {
          if (!checkIn) throw new HrApiError(409, "HR_ATTENDANCE_CHECK_IN_REQUIRED", "Check in before checking out.");
          if (today.rows.some((p) => p.direction === "out"))
            throw new HrApiError(409, "HR_ATTENDANCE_ALREADY_CHECKED_OUT", "You have already checked out today.");
          if (occurred.getTime() <= new Date(checkIn.occurred_at).getTime())
            throw new HrApiError(400, "HR_ATTENDANCE_CHECK_OUT_ORDER", "Check-out must be after your check-in time.");
        }
        const note = input.note?.trim() || null;
        const id = await this.insertPunch(
          client,
          c,
          input.company_id,
          employee,
          clock.today,
          occurred,
          input.direction,
          input.work_mode,
          note,
        );
        const after = {
          company_id: input.company_id,
          employee_id: employee,
          work_date: clock.today,
          direction: input.direction,
          occurred_at: occurred.toISOString(),
          recorded_at: clock.now.toISOString(),
          work_mode: input.work_mode,
          note,
        };
        return {
          id,
          version: 1,
          status: input.direction === "in" ? "checked_in" : "checked_out",
          before: null,
          after,
          type: "attendance_punch",
          hash: null,
          override: null,
          reason: note ?? (input.direction === "in" ? "Self check-in" : "Self check-out"),
          action: input.direction === "in" ? "check_in" : "check_out",
        };
      },
      async (client) => {
        employee = await requireSelfServiceEmployee(client, c, input.company_id, true);
      },
    );
  }

  private async insertPunch(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    employee: string,
    workDate: string,
    occurred: Date,
    direction: "in" | "out",
    mode: HrAttendanceWorkMode,
    note: string | null,
  ) {
    const id = `attendance-punch-${randomUUID()}`;
    await client.query(
      `insert into hr_attendance_punch(tenant_id,id,company_id,employee_id,work_date,occurred_at,direction,source,source_reference,captured_by,work_mode,note)
       values($1,$2,$3,$4,$5::date,$6,$7,'web',$8,$9,$10,$11)`,
      [c.tenantId, id, company, employee, workDate, occurred, direction, `self:${id}`, c.actor.userId, mode, note],
    );
    return id;
  }

  /**
   * Saves today's check-in and check-out. A changed self-recorded time is recorded as a new punch and the earlier
   * punch is marked replaced (never edited), so the original stays in the audit history.
   */
  async saveDay(c: HrActorContext, input: SaveHrSelfAttendanceDay, key: string, corr: string) {
    let employee = "";
    return this.writes.runWrite(
      c,
      input.company_id,
      "hr.attendance.self.punch",
      key,
      corr,
      "/api/v1/hr/self_service/attendance/day",
      input,
      async (client) => {
        const clock = await this.clock(client, c, input.company_id, employee);
        const at = async (time: string) => {
          const value = (
            await client.query<{ at: Date }>("select ($1::date + $2::time) at time zone $3 as at", [
              clock.today,
              time,
              clock.zone,
            ])
          ).rows[0]!.at;
          if (value.getTime() > clock.now.getTime() + FUTURE_TOLERANCE_MS)
            throw new HrApiError(
              400,
              "HR_ATTENDANCE_FUTURE_TIME",
              "That time has not happened yet. Choose Now or an earlier time.",
            );
          return value;
        };
        const punches = await this.todayPunches(client, c, input.company_id, employee, clock.today, clock.zone);
        const checkIn = punches.find((p) => p.direction === "in");
        const checkOut = punches.filter((p) => p.direction === "out").at(-1);
        if (!input.check_out && checkOut)
          throw new HrApiError(409, "HR_ATTENDANCE_CHECK_OUT_REQUIRED", "Keep a check-out time; it cannot be removed.");
        const note = input.note?.trim() || null;
        const inChanged =
          !checkIn ||
          checkIn.local_time !== input.check_in ||
          checkIn.work_mode !== input.work_mode ||
          checkIn.note !== note;
        // The day's note is kept on the check-in; a note left on an earlier check-out moves there too.
        const outChanged =
          !!input.check_out && (!checkOut || checkOut.local_time !== input.check_out || checkOut.note !== null);
        if (!inChanged && !outChanged)
          throw new HrApiError(409, "HR_ATTENDANCE_NO_CHANGE", "Nothing has changed since your last save.");
        for (const [changed, punch] of [
          [inChanged, checkIn],
          [outChanged, checkOut],
        ] as const)
          if (changed && punch && !ownPunch(punch, c.actor.userId))
            throw new HrApiError(
              409,
              "HR_ATTENDANCE_DEVICE_PUNCH",
              "Today's time came from an attendance device. Ask HR for a correction.",
            );
        // An unchanged time keeps its exact original timestamp; only a changed time is re-entered.
        const inAt = checkIn && checkIn.local_time === input.check_in ? checkIn.occurred_at : await at(input.check_in);
        const outAt = !input.check_out
          ? null
          : checkOut && checkOut.local_time === input.check_out
            ? checkOut.occurred_at
            : await at(input.check_out);
        if (outAt && new Date(outAt).getTime() <= new Date(inAt).getTime())
          throw new HrApiError(400, "HR_ATTENDANCE_CHECK_OUT_ORDER", "Check-out must be after your check-in time.");
        const replace = async (old: TodayPunch | undefined, next: string) => {
          if (!old) return;
          await client.query(
            `insert into hr_attendance_punch_amendment(tenant_id,id,company_id,employee_id,work_date,punch_id,replaced_by_punch_id,reason,amended_by)
             values($1,$2,$3,$4,$5::date,$6,$7,$8,$9)`,
            [
              c.tenantId,
              `attendance-amendment-${randomUUID()}`,
              input.company_id,
              employee,
              clock.today,
              old.id,
              next,
              "Corrected by the employee on the day.",
              c.actor.userId,
            ],
          );
        };
        if (inChanged)
          await replace(
            checkIn,
            await this.insertPunch(
              client,
              c,
              input.company_id,
              employee,
              clock.today,
              inAt,
              "in",
              input.work_mode,
              note,
            ),
          );
        if (outChanged)
          await replace(
            checkOut,
            await this.insertPunch(
              client,
              c,
              input.company_id,
              employee,
              clock.today,
              outAt!,
              "out",
              input.work_mode,
              null,
            ),
          );
        const resource = `attendance-day-${employee}-${clock.today}`;
        const version =
          Number(
            (
              await client.query<{ n: string }>(
                "select count(*) as n from hr_attendance_completion_event where tenant_id=$1 and resource_type='attendance_punch' and resource_id=$2",
                [c.tenantId, resource],
              )
            ).rows[0]!.n,
          ) + 1;
        const snapshot = (inTime: string | null, outTime: string | null, mode: string | null, text: string | null) => ({
          company_id: input.company_id,
          employee_id: employee,
          work_date: clock.today,
          check_in: inTime,
          check_out: outTime,
          work_mode: mode,
          note: text,
        });
        const before =
          checkIn || checkOut
            ? snapshot(
                checkIn?.local_time ?? null,
                checkOut?.local_time ?? null,
                checkIn?.work_mode ?? null,
                checkIn?.note ?? null,
              )
            : null;
        return {
          id: resource,
          version,
          status: input.check_out ? "checked_out" : "checked_in",
          before,
          after: {
            ...snapshot(input.check_in, input.check_out ?? null, input.work_mode, note),
            recorded_at: clock.now.toISOString(),
          },
          type: "attendance_punch",
          hash: null,
          override: null,
          reason: before ? "Employee corrected today's attendance." : "Employee recorded today's attendance.",
          action: before ? "correct_day" : "record_day",
        };
      },
      async (client) => {
        employee = await requireSelfServiceEmployee(client, c, input.company_id, true);
      },
    );
  }

  /** HR view of one employee's check-in records for a date range. */
  async employeeRecords(c: HrActorContext, q: HrEmployeeAttendanceRecordsQuery): Promise<HrEmployeeAttendanceRecords> {
    if (!c.actor.permissions.includes("hr.attendance.read"))
      throw new HrApiError(403, "PERMISSION_DENIED", "Attendance read permission is required.");
    return this.d.read(c, "hr.attendance.punch.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      return (await this.body(client, c, q.company_id, q.employee_id, q.from, q.to)).body;
    });
  }
}
