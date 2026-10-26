import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createShiftAllocationFixture } from "./hr-shift-allocation-fixture.js";
import { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import { correctionActor } from "./hr-correction-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
import {
  hrLifecycleCaseWorkspaceSchema,
  type HrLifecycleCaseTerms,
  type HrLifecycleCaseAction,
  type HrLifecycleCaseQuery,
} from "../../packages/contracts/src/hr/index.js";
export const lifecyclePermissions = [
  "hr.payroll.adjustment.read",
  "hr.employment_history.read",
  "hr.employment_lifecycle.action",
  "hr.employment_lifecycle.approve",
  "hr.employment_lifecycle_policy.read",
  "hr.employment_lifecycle_policy.manage",
  "hr.employment_lifecycle_policy.approve",
];
export const lifecycleActor = (who = "r06.maker", permissions = lifecyclePermissions) =>
  correctionActor(who, permissions);
export async function createLifecycleFixture(
  pool: DatabasePool,
  limitedPolicy = false,
  base?: {
    fixture: Awaited<ReturnType<typeof createShiftAllocationFixture>>;
    person: Awaited<ReturnType<Awaited<ReturnType<typeof createShiftAllocationFixture>>["target"]>>;
  },
  options: { employmentStart?: string } = {},
) {
  const f = base?.fixture ?? (await createShiftAllocationFixture(pool, ["r06.maker", "r06.checker", "r06.target"])),
    person = base?.person ?? (await f.target()),
    repo = new SourceHrRepository(pool),
    employmentStart = options.employmentStart ?? f.today.slice(0, 7) + "-01";
  for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker"])
    for (const permission of lifecyclePermissions) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
        [tenant, policy, permission],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
        [tenant, policy, permission, f.companyId],
      );
    }
  await pool.query(
    "update security_role_policy p set permissions=coalesce((select jsonb_agg(g.permission_key order by g.permission_key) from security_role_permission_grant g join security_permission_definition d on d.permission_key=g.permission_key and d.status='active' where g.tenant_id=p.tenant_id and g.role_policy_id=p.id),'[]') where p.tenant_id=$1 and p.id=any($2::text[])",
    [tenant, ["r06-uat-policy-maker", "r06-uat-policy-checker"]],
  );
  const policy = await repo.createEmploymentLifecyclePolicy(
    lifecycleActor(),
    {
      company_id: f.companyId,
      code: "LC-" + randomUUID().slice(0, 8).toUpperCase(),
      name: "Governed lifecycle test policy",
      effective_from: employmentStart,
    },
    randomUUID(),
    "lifecycle-fixture",
  );
  if (limitedPolicy)
    await pool.query(
      "delete from hr_employment_lifecycle_transition where tenant_id=$1 and policy_id=$2 and event_type<>'hire'",
      [tenant, policy.id],
    );
  await repo.submitEmploymentLifecyclePolicy(
    lifecycleActor(),
    policy.id,
    { reason: "Submit isolated lifecycle policy" },
    randomUUID(),
    "lifecycle-fixture",
  );
  await repo.approveEmploymentLifecyclePolicy(
    lifecycleActor("r06.checker"),
    policy.id,
    { decision: "approved", reason: "Independent policy definition approval" },
    randomUUID(),
    "lifecycle-fixture",
  );
  await repo.activateEmploymentLifecyclePolicy(
    lifecycleActor("r06.checker"),
    policy.id,
    { reason: "Activate isolated lifecycle policy" },
    randomUUID(),
    "lifecycle-fixture",
  );
  const relationshipId = "lifecycle-relationship-" + randomUUID();
  // Build an approved authoritative employment fixture through the same immutable event boundary as Hire.
  await pool.query(
    "insert into hr_employment_relationship(id,tenant_id,employee_id,legal_employer_id,relationship_number,status,effective_from,lifecycle_policy_id,approval_state,created_by) values($1,$2,$3,$4,$1,'draft',$5,$6,'pending','r06.maker')",
    [relationshipId, tenant, person.employeeId, f.companyId, employmentStart, policy.id],
  );
  const transition = (
    await pool.query(
      "select t.* from hr_employment_lifecycle_transition t where t.tenant_id=$1 and t.policy_id=$2 and event_type='hire'",
      [tenant, policy.id],
    )
  ).rows[0];
  await pool.query(
    "insert into hr_employment_event(id,tenant_id,relationship_id,sequence,event_type,effective_on,previous_state_id,resulting_state_id,recorded_by,approved_by,approved_at,source_reference,reason) values($1,$2,$3,1,'hire',$4,$5,$6,'r06.checker','r06.checker',now(),'isolated-lifecycle-fixture','Independent fixture employment hire')",
    [
      "lifecycle-hire-" + randomUUID(),
      tenant,
      relationshipId,
      employmentStart,
      transition.from_state_id,
      transition.to_state_id,
    ],
  );
  await pool.query(
    "update hr_employment_relationship set status='active',approval_state='approved' where tenant_id=$1 and id=$2",
    [tenant, relationshipId],
  );
  // Add the authoritative segment after ending the fixture's legacy segment before the cycle starts.
  const previous = (await pool.query("select ($1::date-1)::text as day", [f.today.slice(0, 7) + "-01"])).rows[0].day;
  await pool.query(
    "update employee_assignment set assignment_status='ended',effective_to=$3 where tenant_id=$1 and id=$2",
    [tenant, person.assignmentId, previous],
  );
  const assignmentId = "lifecycle-assignment-" + randomUUID(),
    jobId = "lifecycle-job-" + randomUUID();
  await pool.query(
    "insert into hr_master_record(tenant_id,id,company_id,master_type,code,name,status,created_by) values($1,$2,$3,'job',$4,'Lifecycle fixture job','active','r06.maker')",
    [tenant, jobId, f.companyId, "LC-" + randomUUID().slice(0, 8).toUpperCase()],
  );
  await pool.query(
    "insert into employee_assignment select (jsonb_populate_record(null::employee_assignment,to_jsonb(a)||jsonb_build_object('id',$3::text,'effective_from',$4::text,'effective_to',null,'employment_relationship_id',$5::text,'assignment_status','active','job_id',$6::text))).* from employee_assignment a where a.tenant_id=$1 and a.id=$2",
    [tenant, person.assignmentId, assignmentId, f.today.slice(0, 7) + "-01", relationshipId, jobId],
  );
  const save = (terms: HrLifecycleCaseTerms, who = "r06.maker", old?: { id: string; version: number }) =>
    repo.actOnLifecycleCase(
      lifecycleActor(who),
      {
        action: "save",
        company_id: f.companyId,
        id: old?.id ?? null,
        expected_version: old?.version ?? 0,
        terms,
        reason: "Reviewed lifecycle case preparation",
      },
      randomUUID(),
      "lifecycle-test",
    );
  const act = async (
    id: string,
    action: Exclude<HrLifecycleCaseAction["action"], "save" | "prepare_payroll" | "request_financial_correction" | "decide_financial_correction" | "calculate_payroll_correction" | "approve_payroll_correction" | "reject_payroll_correction" | "post_payroll_correction">,
    who = "r06.maker",
    key = randomUUID(),
  ) => {
    const r = (await pool.query("select version from hr_lifecycle_case where tenant_id=$1 and id=$2", [tenant, id]))
      .rows[0];
    return repo.actOnLifecycleCase(
      lifecycleActor(who),
      {
        action,
        company_id: f.companyId,
        id,
        expected_version: r.version,
        reason: "Governed lifecycle action and evidence",
      },
      key,
      "lifecycle-test",
    );
  };
  const read = async (section: HrLifecycleCaseQuery["section"], who = "r06.maker") =>
    hrLifecycleCaseWorkspaceSchema.parse(
      await repo.getLifecycleCaseWorkspace(lifecycleActor(who), {
        company_id: f.companyId,
        section,
        search: "",
        limit: 25,
        offset: 0,
      }),
    );
  const tasks = (kind: "onboarding" | "clearance", complete = true) =>
    (kind === "onboarding"
      ? ["identity", "employment", "access", "equipment", "payroll"]
      : ["assets", "access", "finance", "knowledge", "hr"]
    ).map((id) => ({
      id,
      title: "Reviewed " + id,
      complete,
      evidence: complete ? "Reviewed evidence and signed handover reference" : "",
    }));
  return { ...f, person, relationshipId, assignmentId, repo, policy, save, act, read, tasks };
}
