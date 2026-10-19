import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  HrApiError,
  SourceHrRepository,
  type HrActorContext,
} from "../../server/api/src/modules/hr/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const companyId = "nexora-r06-uat-company-two";
const effectiveOn = "2026-10-16";

function actor(userId: string, permissions: string[], tenantId = sourceTestTenantId): HrActorContext {
  const account: AuthenticatedAccount = {
    tenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: ["hr_manager"],
    permissions,
    sessionVersion: 1,
  };
  return { tenantId, actor: account };
}

run("governed employee Hire repository", () => {
  let pool: DatabasePool;
  let repository: SourceHrRepository;

  const maker = () =>
    actor("r06.maker", [
      "hr.employee.create",
      "hr.employee.update",
      "hr.employee.submit",
      "hr.employee_assignment.create",
      "hr.employment_lifecycle.action",
      "hr.employment_relationship.create",
    ]);
  const employeeApprover = () => actor("r06.checker", ["hr.employee.approve"]);
  const hireApprover = () => actor("r06.checker", ["hr.employment_lifecycle.approve"]);

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    repository = new SourceHrRepository(pool);
    await pool.query(
      `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
       values
        ('hire-test-branch-two',$1,$2,'branch','HIRE-BR-2','Hire Test Branch Two','active'),
        ('hire-test-department-two',$1,'hire-test-branch-two','department','HIRE-DEPT-2','Hire Test Department Two','active')
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId, companyId],
    );

    const assignmentReader = actor("r06.maker", ["hr.employee_assignment.read"]);
    await expect(
      repository.listOrganizationUnits(assignmentReader, { company_id: companyId, limit: 200 }),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: "hire-test-branch-two", type: "branch" }),
        expect.objectContaining({ id: "hire-test-department-two", type: "department" }),
      ]),
    });
    await pool.query(
      `insert into hr_master_record
        (id,tenant_id,company_id,master_type,code,name,created_by)
       values
        ('hire-test-designation-two',$1,$2,'designation','HIRE-DES-2','Hire Test Designation Two','r06.maker'),
        ('hire-test-grade-two',$1,$2,'job_grade','HIRE-GRD-2','Hire Test Grade Two','r06.maker'),
        ('hire-test-cost-center-two',$1,$2,'cost_center','HIRE-CC-2','Hire Test Cost Center Two','r06.maker'),
        ('hire-test-location-two',$1,$2,'work_location','HIRE-LOC-2','Hire Test Location Two','r06.maker'),
        ('hire-test-employment-type-two',$1,$2,'employment_type','HIRE-ET-2','Hire Test Employment Type Two','r06.maker'),
        ('hire-test-category-two',$1,$2,'employee_category','HIRE-CAT-2','Hire Test Category Two','r06.maker')
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId, companyId],
    );

    const active = await pool.query<{ id: string }>(
      `select id from hr_employment_lifecycle_policy
        where tenant_id=$1 and legal_employer_id=$2 and status='active'
          and effective_from<=$3 and (effective_to is null or effective_to>=$3)
        limit 1`,
      [sourceTestTenantId, companyId, effectiveOn],
    );
    if (!active.rows[0]) {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
      const manager = actor("r06.maker", ["hr.employment_lifecycle_policy.manage"]);
      const checker = actor("r06.checker", ["hr.employment_lifecycle_policy.approve"]);
      const policy = await repository.createEmploymentLifecyclePolicy(
        manager,
        {
          company_id: companyId,
          code: `HIRE-${suffix}`,
          name: "Governed Hire integration policy",
          effective_from: effectiveOn,
        },
        `hire-policy-create-${suffix}`,
        "hr-hire-integration",
      );
      await repository.submitEmploymentLifecyclePolicy(
        manager,
        policy.id,
        { reason: "Integration policy ready for review." },
        `hire-policy-submit-${suffix}`,
        "hr-hire-integration",
      );
      await repository.approveEmploymentLifecyclePolicy(
        checker,
        policy.id,
        { reason: "Integration policy independently approved." },
        `hire-policy-approve-${suffix}`,
        "hr-hire-integration",
      );
      await repository.activateEmploymentLifecyclePolicy(
        checker,
        policy.id,
        { reason: "Integration policy activated for governed Hire tests." },
        `hire-policy-activate-${suffix}`,
        "hr-hire-integration",
      );
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function createEligibleHire(label: string) {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const employee = await repository.createEmployeeDraft(
      maker(),
      {
        company_id: companyId,
        employee_number: `H${suffix}`,
        first_name: label,
        last_name: "Candidate",
        joined_on: effectiveOn,
      },
      `hire-employee-${suffix}`,
      "hr-hire-integration",
    );
    await repository.submitEmployeeDraft(
      maker(),
      employee.id,
      { reason: "Profile ready for independent approval." },
      `hire-employee-submit-${suffix}`,
      "hr-hire-integration",
    );
    await repository.decideEmployeeDraftApproval(
      employeeApprover(),
      employee.id,
      { decision: "approved", reason: "Profile independently approved." },
      `hire-employee-approve-${suffix}`,
      "hr-hire-integration",
    );
    const profileAssignment = await repository.createProfileDraftAssignment(
      maker(),
      employee.id,
      {
        company_id: companyId,
        branch_id: "hire-test-branch-two",
        department_id: "hire-test-department-two",
        designation_id: "hire-test-designation-two",
        job_grade_id: "hire-test-grade-two",
        cost_center_id: "hire-test-cost-center-two",
        work_location_id: "hire-test-location-two",
        employment_type_id: "hire-test-employment-type-two",
        employee_category_id: "hire-test-category-two",
        effective_from: effectiveOn,
      },
      `hire-profile-assignment-${suffix}`,
      "hr-hire-integration",
    );
    const jobMaker = actor("r06.maker", ["hr.master.create"]);
    const job = await repository.createJob(
      jobMaker,
      {
        company_id: companyId,
        code: `HJ${suffix}`,
        name: `${label} Hire Job ${suffix}`,
        description: "Synthetic governed Hire integration job.",
      },
      `hire-job-${suffix}`,
      "hr-hire-integration",
    );
    const input = {
      company_id: companyId,
      job_id: job.id,
      profile_draft_assignment_id: profileAssignment.id,
      effective_on: effectiveOn,
      reason: `${label} candidate is ready for an independent Hire decision.`,
    };
    const request = await repository.createEmployeeHireRequest(
      maker(),
      employee.id,
      input,
      `hire-request-${suffix}`,
      "hr-hire-integration",
    );
    return { employee, profileAssignment, job, input, request, suffix };
  }

  it("creates, discovers, and independently approves one idempotent Hire request", async () => {
    const fixture = await createEligibleHire("Approved");
    const replay = await repository.createEmployeeHireRequest(
      maker(),
      fixture.employee.id,
      fixture.input,
      `hire-request-${fixture.suffix}`,
      "hr-hire-integration",
    );
    expect(replay).toEqual({ ...fixture.request, replayed: true });
    await expect(
      repository.createEmployeeHireRequest(
        maker(),
        fixture.employee.id,
        { ...fixture.input, reason: "A conflicting payload." },
        `hire-request-${fixture.suffix}`,
        "hr-hire-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" } satisfies Partial<HrApiError>);
    await expect(
      repository.createEmployeeHireRequest(
        maker(),
        fixture.employee.id,
        fixture.input,
        `hire-request-duplicate-${fixture.suffix}`,
        "hr-hire-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_HIRE_NOT_ALLOWED" } satisfies Partial<HrApiError>);

    const queue = await repository.listEmployeeHireRequests(hireApprover(), {
      company_id: companyId,
      search: fixture.employee.employee_number,
      limit: 25,
    });
    expect(queue.items).toEqual([
      expect.objectContaining({
        id: fixture.request.id,
        employee_id: fixture.employee.id,
        job_id: fixture.job.id,
        profile_draft_assignment_id: fixture.profileAssignment.id,
        status: "pending",
        requested_by: "r06.maker",
      }),
    ]);
    const detail = await repository.getEmployeeHireRequest(hireApprover(), fixture.employee.id, fixture.request.id);
    expect(detail).toMatchObject({
      id: fixture.request.id,
      company_id: companyId,
      status: "pending",
      self_decision_requires_override: false,
      super_admin_override_allowed: false,
    });
    const ordinaryMakerReview = maker();
    ordinaryMakerReview.actor.permissions.push("hr.employment_lifecycle.approve");
    expect(
      await repository.getEmployeeHireRequest(ordinaryMakerReview, fixture.employee.id, fixture.request.id),
    ).toMatchObject({
      self_decision_requires_override: true,
      super_admin_override_allowed: false,
    });
    const superAdminMakerReview = maker();
    superAdminMakerReview.actor.roles = ["super_administrator"];
    superAdminMakerReview.actor.permissions.push("hr.employment_lifecycle.approve", "platform.approval.override");
    expect(
      await repository.getEmployeeHireRequest(superAdminMakerReview, fixture.employee.id, fixture.request.id),
    ).toMatchObject({
      self_decision_requires_override: true,
      super_admin_override_allowed: true,
    });
    expect(JSON.stringify(detail)).not.toContain("work_email");
    await expect(
      repository.listEmployeeHireRequests(
        actor(`no-company-access-${fixture.suffix}`, ["hr.employment_lifecycle.approve"]),
        {
          company_id: companyId,
          limit: 25,
        },
      ),
    ).rejects.toMatchObject({ status: 403, code: "COMPANY_ACCESS_DENIED" } satisfies Partial<HrApiError>);
    await expect(
      repository.getEmployeeHireRequest(
        actor("r06.checker", ["hr.employment_lifecycle.approve"], "other-tenant"),
        fixture.employee.id,
        fixture.request.id,
      ),
    ).rejects.toMatchObject({ status: 404, code: "HR_HIRE_REQUEST_NOT_FOUND" } satisfies Partial<HrApiError>);

    const selfApprover = maker();
    selfApprover.actor.permissions.push("hr.employment_lifecycle.approve");
    await expect(
      repository.decideEmployeeHireRequest(
        selfApprover,
        fixture.employee.id,
        fixture.request.id,
        { decision: "approved", reason: "Self approval must fail." },
        `hire-self-decision-${fixture.suffix}`,
        "hr-hire-integration",
      ),
    ).rejects.toMatchObject({ status: 403, code: "HR_SELF_APPROVAL_FORBIDDEN" } satisfies Partial<HrApiError>);

    const decision = await repository.decideEmployeeHireRequest(
      hireApprover(),
      fixture.employee.id,
      fixture.request.id,
      { decision: "approved", reason: "Independent Hire approval completed." },
      `hire-decision-${fixture.suffix}`,
      "hr-hire-integration",
    );
    expect(decision).toMatchObject({ status: "approved", assignment_id: expect.any(String), replayed: false });
    const decisionReplay = await repository.decideEmployeeHireRequest(
      hireApprover(),
      fixture.employee.id,
      fixture.request.id,
      { decision: "approved", reason: "Independent Hire approval completed." },
      `hire-decision-${fixture.suffix}`,
      "hr-hire-integration",
    );
    expect(decisionReplay).toEqual({ ...decision, replayed: true });

    const state = await pool.query(
      `select request.approval_state,relationship.status as relationship_status,
              relationship.approval_state as relationship_approval,employee.status as employee_status,
              (select count(*)::int from hr_employment_event event where event.tenant_id=request.tenant_id and event.request_id=request.id) as event_count,
              (select count(*)::int from employee_assignment assignment where assignment.tenant_id=request.tenant_id and assignment.employee_id=employee.id and assignment.assignment_status='active' and assignment.employment_relationship_id=relationship.id) as active_assignment_count,
              (select assignment_status from employee_assignment assignment where assignment.tenant_id=request.tenant_id and assignment.id=$3) as profile_assignment_status
         from hr_employment_lifecycle_request request
         join hr_employment_relationship relationship on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id
         join employee on employee.tenant_id=relationship.tenant_id and employee.id=$2
        where request.tenant_id=$1 and request.id=$4`,
      [sourceTestTenantId, fixture.employee.id, fixture.profileAssignment.id, fixture.request.id],
    );
    expect(state.rows).toEqual([
      {
        approval_state: "approved",
        relationship_status: "active",
        relationship_approval: "approved",
        employee_status: "active",
        event_count: 1,
        active_assignment_count: 1,
        profile_assignment_status: "profile_draft",
      },
    ]);
    expect(
      await repository.getEmployeeHireRequest(hireApprover(), fixture.employee.id, fixture.request.id),
    ).toMatchObject({
      status: "approved",
      decided_by: "r06.checker",
      decision_reason: "Independent Hire approval completed.",
    });
    const historyReader = actor("r06.maker", ["hr.employment_history.read"]);
    const lifecycleHistory = await repository.listEmployeeLifecycleEvents(historyReader, fixture.employee.id, {
      limit: 25,
    });
    const profileHistory = await repository.listEmployeeProfileHistory(historyReader, fixture.employee.id, {
      limit: 25,
    });
    expect(lifecycleHistory).toMatchObject({
      items: [
        expect.objectContaining({
          event_type: "hire",
          sequence: 1,
          resulting_state: expect.objectContaining({ canonical_class: "employed" }),
        }),
      ],
      next_cursor: null,
    });
    expect(profileHistory.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ revision: 1, capture_origin: "recorded_change" })]),
    );
    expect(JSON.stringify({ lifecycleHistory, profileHistory })).not.toMatch(
      /recorded_by|approved_by|date_of_birth|personal_email|phone/,
    );
  });

  it("rejects a Hire request without activating employment or creating an event", async () => {
    const fixture = await createEligibleHire("Rejected");
    const decision = await repository.decideEmployeeHireRequest(
      hireApprover(),
      fixture.employee.id,
      fixture.request.id,
      { decision: "rejected", reason: "Employment context requires correction." },
      `hire-reject-${fixture.suffix}`,
      "hr-hire-integration",
    );
    expect(decision).toMatchObject({ status: "rejected", assignment_id: null, replayed: false });
    const state = await pool.query(
      `select request.approval_state,relationship.status as relationship_status,
              relationship.approval_state as relationship_approval,employee.status as employee_status,
              (select count(*)::int from hr_employment_event event where event.tenant_id=request.tenant_id and event.request_id=request.id) as event_count,
              (select count(*)::int from employee_assignment assignment where assignment.tenant_id=request.tenant_id and assignment.employee_id=employee.id and assignment.assignment_status='active') as active_assignment_count
         from hr_employment_lifecycle_request request
         join hr_employment_relationship relationship on relationship.tenant_id=request.tenant_id and relationship.id=request.relationship_id
         join employee on employee.tenant_id=relationship.tenant_id and employee.id=$2
        where request.tenant_id=$1 and request.id=$3`,
      [sourceTestTenantId, fixture.employee.id, fixture.request.id],
    );
    expect(state.rows).toEqual([
      {
        approval_state: "rejected",
        relationship_status: "draft",
        relationship_approval: "rejected",
        employee_status: "pending_approval",
        event_count: 0,
        active_assignment_count: 0,
      },
    ]);
  });
});
