import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createCorrectionFixture, correctionActor, correctionPermissions } from "./hr-correction-fixture.js";
import { createLifecycleFixture } from "./hr-lifecycle-case-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
import {
  createHrLeaveTypeRequestSchema,
  createHrSelfLeaveRequestSchema,
  type HrSelfLeaveAction,
} from "../../packages/contracts/src/hr/index.js";
export const personalLeavePermissions = [
  ...correctionPermissions,
  "hr.employee_document.read",
  "hr.leave.type.read",
  "hr.leave.type.manage",
  "hr.leave.balance.read",
  "hr.leave.balance.adjust",
  ...["read", "create", "submit", "cancel", "manager_approve", "manager_reject", "hr_approve", "hr_reject"].map(
    (p) => "hr.leave.request." + p,
  ),
  "hr.attendance.period.read",
  "hr.attendance.period.manage",
  "hr.attendance.period.lock",
];
export const leaveStaff = (who = "r06.maker") => correctionActor(who, personalLeavePermissions);
export async function createPersonalLeaveFixture(pool: DatabasePool) {
  const base = await createCorrectionFixture(pool, undefined, ["r06.last-admin-a"]),
    person = await base.target();
  const managerEmployment = await createLifecycleFixture(pool, false, { fixture: base, person: base.manager });
  const relationshipId = "personal-relationship-" + randomUUID(),
    assignmentId = "personal-assignment-" + randomUUID(),
    month = base.today.slice(0, 7) + "-01";
  // Reuse the one approved company policy; add the subordinate through its immutable Hire event.
  await pool.query(
    "insert into hr_employment_relationship(id,tenant_id,employee_id,legal_employer_id,relationship_number,status,effective_from,lifecycle_policy_id,approval_state,created_by) values($1,$2,$3,$4,$1,'draft',$5,$6,'pending','r06.maker')",
    [relationshipId, tenant, person.employeeId, base.companyId, month, managerEmployment.policy.id],
  );
  const transition = (
    await pool.query(
      "select from_state_id,to_state_id from hr_employment_lifecycle_transition where tenant_id=$1 and policy_id=$2 and event_type='hire'",
      [tenant, managerEmployment.policy.id],
    )
  ).rows[0];
  await pool.query(
    "insert into hr_employment_event(id,tenant_id,relationship_id,sequence,event_type,effective_on,previous_state_id,resulting_state_id,recorded_by,approved_by,approved_at,source_reference,reason) values($1,$2,$3,1,'hire',$4,$5,$6,'r06.checker','r06.checker',now(),'isolated-personal-leave','Independent personal fixture employment')",
    ["personal-hire-" + randomUUID(), tenant, relationshipId, month, transition.from_state_id, transition.to_state_id],
  );
  await pool.query(
    "update hr_employment_relationship set status='active',approval_state='approved' where tenant_id=$1 and id=$2",
    [tenant, relationshipId],
  );
  await pool.query(
    "update employee_assignment set assignment_status='ended',effective_to=($3::date-1) where tenant_id=$1 and id=$2",
    [tenant, person.assignmentId, month],
  );
  const job = (
    await pool.query("select job_id from employee_assignment where tenant_id=$1 and id=$2", [
      tenant,
      managerEmployment.assignmentId,
    ])
  ).rows[0].job_id;
  await pool.query(
    "insert into employee_assignment select (jsonb_populate_record(null::employee_assignment,to_jsonb(a)||jsonb_build_object('id',$3::text,'effective_from',$4::text,'effective_to',null,'employment_relationship_id',$5::text,'assignment_status','active','job_id',$6::text))).* from employee_assignment a where a.tenant_id=$1 and a.id=$2",
    [tenant, person.assignmentId, assignmentId, month, relationshipId, job],
  );
  const f = { ...base, person, repo: managerEmployment.repo, relationshipId, assignmentId },
    user = base.subjectUserId;
  const binding = "personal-leave-" + randomUUID();
  await pool.query(
    "insert into employee_user_binding(id,tenant_id,user_id,employee_id,effective_from,reason,created_by) values($1,$2,$3,$4,current_date,'Isolated personal leave ownership','r06.last-admin-a')",
    [binding, tenant, user, person.employeeId],
  );
  const policy = {
    effective_from: f.today.slice(0, 7) + "-01",
    annual_entitlement_days: "20",
    accrual_method: "annual_grant" as const,
    carry_forward: false,
    maximum_carry_forward_days: "0",
    maximum_balance_days: "40",
    minimum_request_days: "0.5",
    maximum_request_days: "20",
    requires_hr_approval: true,
    applicable_category_ids: [],
    applicable_genders: [],
    document_required_after_days: null,
  };
  const type = await f.repo.createLeaveType(
    leaveStaff(),
    createHrLeaveTypeRequestSchema.parse({
      company_id: f.companyId,
      code: "PERSONAL",
      name: "Annual personal leave",
      paid: true,
      policy,
      reason: "Isolated personal leave policy approval workflow",
    }),
    randomUUID(),
    "personal-leave-fixture",
  );
  const balance = async () =>
    (
      await f.repo.listLeaveBalances(leaveStaff(), {
        company_id: f.companyId,
        employee_id: person.employeeId,
        leave_type_id: type.id,
        as_of: f.today,
        limit: 25,
        offset: 0,
      })
    ).items[0]!;
  await f.repo.postLeaveBalance(
    leaveStaff(),
    {
      company_id: f.companyId,
      employee_id: person.employeeId,
      leave_type_id: type.id,
      effective_on: f.today,
      kind: "opening",
      days: "10.0000",
      period_start: null,
      period_end: null,
      expected_balance_hash: (await balance()).hash,
      reason: "Independent isolated personal leave opening entitlement",
    },
    randomUUID(),
    "personal-leave-fixture",
  );
  const own = () => correctionActor(user, [], ["employee"]);
  const context = () =>
    f.repo.getSelfLeaveContext(own(), {
      company_id: f.companyId,
      leave_type_id: type.id,
      from_date: f.today,
      to_date: f.today,
    });
  const detail = (id: string) => f.repo.getSelfLeaveRequest(own(), f.companyId, id);
  const create = async (portion: "full" | "first_half" = "full", key = randomUUID()) => {
    const c = await context(),
      input = createHrSelfLeaveRequestSchema.parse({
        company_id: f.companyId,
        leave_type_id: type.id,
        from_date: f.today,
        to_date: f.today,
        days: [{ on_date: f.today, portion }],
        reason: "Personal leave application with reviewed calendar and balance",
        expected_evidence_hash: c.hash,
      });
    return { input, key, result: await f.repo.createSelfLeaveRequest(own(), input, key, "personal-leave-test") };
  };
  const action = async (id: string, action: HrSelfLeaveAction["action"], key = randomUUID()) => {
    const d = await detail(id),
      input: HrSelfLeaveAction = {
        company_id: f.companyId,
        action,
        expected_version: d.version,
        expected_evidence_hash: d.context?.hash,
        reason: "Reviewed personal leave " + action + " workflow",
      };
    return { input, key, result: await f.repo.actOnSelfLeaveRequest(own(), id, input, key, "personal-leave-test") };
  };
  const decide = async (
    id: string,
    action: "manager_approve" | "hr_approve",
    who = action === "manager_approve" ? base.managerId : "r06.last-admin-a",
  ) => {
    const d = await f.repo.getLeaveRequest(leaveStaff(who), f.companyId, id);
    return f.repo.actOnLeaveRequest(
      leaveStaff(who),
      id,
      {
        company_id: f.companyId,
        action,
        expected_version: d.version,
        expected_evidence_hash: d.context?.hash,
        reason: "Independent normal leave workflow decision",
        override_self_approval: false,
      },
      randomUUID(),
      "personal-leave-test",
    );
  };
  return { ...f, user, binding, type, policy, own, context, detail, create, action, decide, balance };
}
