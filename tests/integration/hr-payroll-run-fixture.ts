import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import { attendanceHash } from "../../server/api/src/modules/hr/attendance-completion.js";
import { createHrPayrollRecordSchema, type HrPayrollRunAction } from "../../packages/contracts/src/hr/index.js";
import { createShiftAllocationFixture } from "./hr-shift-allocation-fixture.js";
import { correctionActor } from "./hr-correction-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
export const runPermissions = [
  ...["setup", "salary", "adjustment", "loan", "period", "result", "report", "payment", "payslip"].flatMap((g) =>
    ["read", "manage", "approve"].map((p) => "hr.payroll." + g + "." + p),
  ),
  "hr.payroll.recalculate",
  "hr.attendance.payroll_input.read",
];
export const runActor = (id = "r06.maker", permissions = runPermissions) => correctionActor(id, permissions);
export type BeforePayrollAttendanceClose = (
  fixture: Awaited<ReturnType<typeof createShiftAllocationFixture>> & {
    person: Awaited<ReturnType<Awaited<ReturnType<typeof createShiftAllocationFixture>>["target"]>>;
    month: string;
  },
) => Promise<void>;
export async function grantRunReviewFixtureAuthority(pool: DatabasePool, company: string, users: string[]) {
  const policies = (
    await pool.query<{ role_policy_id: string }>(
      "select distinct role_policy_id from security_user_role_assignment_version where tenant_id=$1 and user_id=any($2::text[]) and lifecycle_state='active'",
      [tenant, users],
    )
  ).rows;
  for (const policy of policies)
    for (const permission of ["hr.payroll.period.read", "hr.payroll.result.read", "hr.payroll.period.approve"]) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)values($1,$2,$3,'all')on conflict do nothing",
        [tenant, policy.role_policy_id, permission],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)values($1,$2,$3,'company',$4)on conflict do nothing",
        [tenant, policy.role_policy_id, permission, company],
      );
    }
}
export async function createPayrollRunFixture(
  pool: DatabasePool,
  extraUsers: string[] = [],
  options: {
    legacy?: boolean;
    overtime?: boolean;
    overtimeDays?: number;
    overtimeMinutes?: number;
    beforeAttendanceClose?: BeforePayrollAttendanceClose | undefined;
  } = {},
) {
  const f = await createShiftAllocationFixture(pool, ["r06.maker", "r06.checker", ...extraUsers]),
    person = await f.target(),
    repo = new SourceHrRepository(pool),
    month = f.today.slice(0, 7) + "-01",
    expense = "run-expense-" + randomUUID(),
    liability = "run-liability-" + randomUUID();
  await grantRunReviewFixtureAuthority(pool, f.companyId, ["r06.maker", "r06.checker", ...extraUsers]);
  await pool.query(
    `insert into currency(tenant_id,code,name,decimal_places,status) values($1,'PKR','Pakistani Rupee',2,'active') on conflict(tenant_id,code) do nothing`,
    [tenant],
  );
  await pool.query(
    `insert into account(id,tenant_id,company_id,code,name,type,status,created_at) values($1,$3,$4,'RUN_EXP','Payroll expense','expense','active',now()),($2,$3,$4,'RUN_PAY','Net payroll payable','liability','active',now())`,
    [expense, liability, tenant, f.companyId],
  );
  const create = async (data: Record<string, unknown>) =>
    repo.createPayrollRecord(
      runActor(),
      createHrPayrollRecordSchema.parse({
        company_id: f.companyId,
        reason: "Isolated persisted Payroll run acceptance",
        ...data,
      }),
      randomUUID(),
      "run-fixture",
    );
  const component = await create({
    kind: "component",
    code: "BASIC",
    name: "Monthly base salary",
    component_kind: "earning",
    method: "fixed",
    formula: null,
    taxable: true,
    prorated: true,
    account_id: expense,
    position: 1,
  });
  const structure = await create({
    kind: "structure",
    code: "MONTHLY",
    name: "Run acceptance monthly salary",
    description: "Synthetic compensation authority",
    currency_code: "PKR",
    items: [{ component_id: component.id, amount: "31000", formula: null }],
  });
  const salary = await create({
    kind: "salary",
    employee_id: person.employeeId,
    structure_id: structure.id,
    currency_code: "PKR",
    effective_from: month,
    effective_to: null,
    compensation_type: "fixed",
    payment_basis: "monthly",
  });
  for (const action of ["submit", "approve"] as const) {
    const row = (
      await repo.getPayrollWorkspace(runActor(), {
        company_id: f.companyId,
        section: "salaries",
        month,
        search: "",
        limit: 25,
        offset: 0,
      })
    ).items.find((r) => r.id === salary.id)!;
    await repo.actOnPayrollRecord(
      runActor(action === "approve" ? "r06.checker" : "r06.maker"),
      row.id,
      {
        company_id: f.companyId,
        section: "salaries",
        action,
        reason: "Independent synthetic salary authority",
        expected_version: row.version,
        source_hash: row.source_hash,
        confirm_override: false,
      },
      randomUUID(),
      "run-fixture",
    );
  }
  const dates = (
    await pool.query<{ on_date: string }>(
      `select d::date::text as on_date from generate_series($1::date,($1::date+interval '1 month'-interval '1 day')::date,'1 day') d`,
      [month],
    )
  ).rows;
  const employee = (
    await pool.query(
      `select employee_number,concat_ws(' ',first_name,last_name) as display_name from employee where tenant_id=$1 and id=$2`,
      [tenant, person.employeeId],
    )
  ).rows[0];
  const days = dates.map((d, i) => ({
    on_date: d.on_date,
    status: "present",
    shift_id: null,
    time_zone: "Asia/Karachi",
    worked_minutes: 480,
    paid_days: "1.0000",
    unpaid_days: "0.0000",
    approved_leave_days: "0.0000",
    unpaid_leave_days: "0.0000",
    present_days: "1.0000",
    absent_days: "0.0000",
    correction_ids: [],
    leave_ids: [],
    issues: [],
    overtime:
      options.overtime && i < (options.overtimeDays ?? 1)
        ? [
            {
              id: "synthetic-approved-ot-" + f.companyId + "-" + i,
              category: "regular",
              minutes: options.overtimeMinutes ?? 60,
              operational_rule_id: "synthetic-operational-rule-" + f.companyId,
            },
          ]
        : [],
  }));
  const payload = {
    employee_id: person.employeeId,
    employee_number: employee.employee_number,
    display_name: employee.display_name,
    calendar_days: String(days.length),
    paid_days: String(days.length),
    unpaid_days: "0",
    approved_leave_days: "0",
    unpaid_leave_days: "0",
    present_days: String(days.length),
    absent_days: "0",
    overtime_regular_minutes: options.overtime ? (options.overtimeDays ?? 1) * (options.overtimeMinutes ?? 60) : 0,
    overtime_weekend_minutes: 0,
    overtime_holiday_minutes: 0,
    correction_count: 0,
    exception_count: 0,
    days,
    source_hash: attendanceHash({ synthetic: true, days, employee: person.employeeId }),
  };
  if (options.overtime) {
    const ot = payload.days[0]!.overtime[0]!;
    await pool.query(
      `insert into hr_overtime_rule(id,tenant_id,company_id,category,multiplier,minimum_minutes,daily_cap_minutes,created_by,effective_from,evidence_hash) values($1,$2,$3,'regular',99,0,240,'r06.maker',$4,$5)`,
      [ot.operational_rule_id, tenant, f.companyId, month, "a".repeat(64)],
    );
    for (const day of days)
      for (const entry of day.overtime) {
        await pool.query(
          `insert into hr_overtime_request(id,tenant_id,company_id,employee_id,work_date,category,requested_minutes,approved_minutes,reason,status,requested_by,operational_rule_id,operational_rule_evidence_hash) values($1,$2,$3,$4,$5,'regular',$8,$8,'Synthetic governed overtime authority','approved','r06.maker',$6,$7)`,
          [
            entry.id,
            tenant,
            f.companyId,
            person.employeeId,
            day.on_date,
            entry.operational_rule_id,
            "a".repeat(64),
            entry.minutes,
          ],
        );
      }
  }
  if (options.beforeAttendanceClose) await options.beforeAttendanceClose({ ...f, person, month });
  const attendanceId = "run-attendance-" + randomUUID(),
    inputId = "run-input-" + randomUUID();
  await pool.query(
    `insert into hr_attendance_period(id,tenant_id,company_id,month,state,opened_by,locked_by,locked_at,source_hash) values($1,$2,$3,$4,'locked','r06.maker','r06.checker',now(),$5)`,
    [attendanceId, tenant, f.companyId, month, attendanceHash(payload)],
  );
  await pool.query(
    `insert into hr_payroll_input(id,tenant_id,company_id,period_id,employee_id,calendar_days,paid_days,unpaid_days,approved_leave_days,unpaid_leave_days,present_days,absent_days,source_hash,evidence_version,source_snapshot_json,completion_payload,overtime_regular_minutes) values($1,$2,$3,$4,$5,$6,$6,0,0,0,$6,0,$7,$8,$9::jsonb,$10::jsonb,$11)`,
    [
      inputId,
      tenant,
      f.companyId,
      attendanceId,
      person.employeeId,
      days.length,
      payload.source_hash,
      options.legacy ? "legacy_summary_v1" : "attendance_close_v5",
      JSON.stringify(options.legacy ? [] : days),
      options.legacy ? null : JSON.stringify(payload),
      payload.overtime_regular_minutes,
    ],
  );
  const query = { company_id: f.companyId, month };
  const act = async (
    action: HrPayrollRunAction["action"],
    extra: Partial<HrPayrollRunAction> = {},
    who = "r06.maker",
    idempotency = randomUUID(),
  ) => {
    const state = await repo.getPayrollRunWorkspace(runActor(who), query);
    return repo.actOnPayrollRun(
      runActor(who),
      {
        ...query,
        action,
        reason: "Controlled persisted Payroll run transition",
        expected_version: state.period?.version ?? 0,
        source_hash: state.source_hash,
        confirm_override: false,
        ...extra,
      },
      idempotency,
      "run-fixture",
    );
  };
  return {
    ...f,
    person,
    month,
    expense,
    liability,
    component,
    structure,
    salary,
    attendanceId,
    inputId,
    payload,
    repo,
    query,
    act,
  };
}
