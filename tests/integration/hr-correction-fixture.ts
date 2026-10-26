import { randomUUID } from "node:crypto";
import { createHrShiftRequestSchema } from "../../packages/contracts/src/hr/index.js";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { SourceHrRepository, type HrActorContext } from "../../server/api/src/modules/hr/source-repository.js";
import { createShiftAllocationFixture } from "./hr-shift-allocation-fixture.js";
import { sourceTestTenantId } from "./source-security-fixture.js";
export const correctionPermissions = [
  "hr.attendance.correction.read",
  "hr.attendance.correction.create",
  "hr.attendance.correction.submit",
  "hr.attendance.correction.cancel",
  "hr.attendance.correction.manager_approve",
  "hr.attendance.correction.manager_reject",
  "hr.attendance.correction.hr_approve",
  "hr.attendance.correction.hr_reject",
  "hr.attendance.read",
  "hr.attendance.punch.read",
  "hr.attendance.shift.read",
  "hr.attendance.shift.manage",
];
export const correctionActor = (
  userId = "r06.maker",
  permissions = correctionPermissions,
  roles = ["hr_manager"],
): HrActorContext => ({
  tenantId: sourceTestTenantId,
  actor: {
    tenantId: sourceTestTenantId,
    userId,
    organizationName: "Correction tests",
    email: userId + "@example.test",
    displayName: userId,
    roles,
    permissions,
    sessionVersion: 1,
  },
});
export async function createCorrectionFixture(pool: DatabasePool, managerUserId?: string, extraUsers: string[] = []) {
  const managerId = managerUserId ?? "correction-manager-" + randomUUID().slice(0, 12),
    subjectUserId = "correction-subject-" + randomUUID().slice(0, 12);
  for (const id of [managerId, subjectUserId])
    await pool.query(
      "insert into security_user_account (tenant_id,id,identity_subject,email,display_name,status,mfa_state,created_at) values ($1,$2,$2,$3,$4,'active','disabled',now()) on conflict (tenant_id,id) do nothing",
      [
        sourceTestTenantId,
        id,
        id + "@test.invalid",
        id === managerId ? "Correction Reporting Manager" : "Correction Employee",
      ],
    );
  const f = await createShiftAllocationFixture(pool, [
      ...new Set(["r06.maker", "r06.checker", managerId, subjectUserId, ...extraUsers]),
    ]),
    manager = await f.target();
  await pool.query(
    "insert into employee_user_binding (tenant_id,id,user_id,employee_id,effective_from,reason,created_by) values ($1,$2,$3,$4,current_date-365,'Synthetic correction reporting route','r06.maker')",
    [sourceTestTenantId, "correction-binding-" + randomUUID(), managerId, manager.employeeId],
  );
  const repo = new SourceHrRepository(pool),
    shift = await repo.createShift(
      correctionActor(),
      createHrShiftRequestSchema.parse({
        company_id: f.companyId,
        code: "CORRECTION",
        name: "Correction Office Shift",
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
        reason: "Controlled attendance correction working rules",
      }),
      randomUUID(),
      "correction-fixture",
    );
  const target = async () => {
    const employee = await f.target(null, manager.employeeId);
    await repo.createShiftAllocation(
      correctionActor(),
      {
        company_id: f.companyId,
        scope: "employee",
        scope_id: employee.employeeId,
        shift_id: shift.id,
        effective_from: f.today,
        effective_to: null,
        reason: "Controlled correction employee roster",
      },
      randomUUID(),
      "correction-fixture",
    );
    return employee;
  };
  return { ...f, managerId, subjectUserId, manager, shift, target };
}

export async function createCorrectionOverrideAccount(pool: DatabasePool) {
  const id = "correction-super-" + randomUUID().slice(0, 12),
    policy = "correction-super-policy-" + randomUUID().slice(0, 12),
    assignment = "correction-super-assignment-" + randomUUID().slice(0, 12),
    permissions = [...correctionPermissions, "platform.approval.override"];
  await pool.query(
    "insert into security_user_account (tenant_id,id,identity_subject,email,display_name,status,mfa_state,created_at) values ($1,$2,$2,$3,'Correction Override Administrator','active','disabled',now())",
    [sourceTestTenantId, id, id + "@test.invalid"],
  );
  const role = (
    await pool.query<{ role_id: string }>(
      "select role_id from security_tenant_role where tenant_id=$1 and role_code='super_administrator' and lifecycle_state='active'",
      [sourceTestTenantId],
    )
  ).rows[0];
  if (!role) throw Error("Missing governed super-administrator fixture role");
  await pool.query(
    `insert into security_role_policy (id,tenant_id,role,scope,permissions,field_rules,sod_rules,version,status,created_at,role_id,lifecycle_state) values ($2,$1,'super_administrator','{"mode":"tenant"}'::jsonb,$3::jsonb,'{"allow":null,"deny":[]}'::jsonb,'{"conflicting_roles":[],"distinct_actor_fields":[]}'::jsonb,$4,'active',now(),$5,'active')`,
    [
      sourceTestTenantId,
      policy,
      JSON.stringify(permissions),
      1000000000 + Math.floor(Math.random() * 100000000),
      role.role_id,
    ],
  );
  await pool.query(
    "insert into security_role_permission_grant (tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,$2,permission_key,'all' from security_permission_definition where permission_key=any($3::text[]) and status='active'",
    [sourceTestTenantId, policy, permissions],
  );
  await pool.query(
    "insert into security_user_role_assignment (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from) values ($1,$2,$3,'r06.last-admin-a',now(),$4,'active',now())",
    [sourceTestTenantId, id, policy, assignment],
  );
  await pool.query(
    "insert into security_user_role_assignment_version (tenant_id,assignment_id,version,user_id,role_policy_id,lifecycle_state,valid_from,assigned_by,source_kind,source_reference) values ($1,$2,1,$3,$4,'active',now(),'r06.last-admin-a','legacy_backfill','isolated-correction-override-fixture')",
    [sourceTestTenantId, assignment, id, policy],
  );
  return id;
}
