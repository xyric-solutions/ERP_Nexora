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

function actor(userId: string, permissions: string[]): HrActorContext {
  const account: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: ["hr_manager"],
    permissions,
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor: account };
}

run("governed employee manager-change repository", () => {
  let pool: DatabasePool;
  let repository: SourceHrRepository;
  let today: string;
  let yesterday: string;
  let managerA: Awaited<ReturnType<typeof activateEmployee>>;
  let managerB: Awaited<ReturnType<typeof activateEmployee>>;

  const maker = () =>
    actor("r06.maker", [
      "hr.employee.create",
      "hr.employee.update",
      "hr.employee.submit",
      "hr.employee_assignment.create",
      "hr.employee_assignment.manager_change",
      "hr.employment_lifecycle.action",
      "hr.employment_relationship.create",
      "hr.master.create",
    ]);
  const employeeApprover = () => actor("r06.checker", ["hr.employee.approve"]);
  const hireApprover = () => actor("r06.checker", ["hr.employment_lifecycle.approve"]);
  const managerChangeApprover = () => actor("r06.checker", ["hr.employee_assignment.change"]);
  const privilegedMaker = () =>
    actor("r06.maker", ["hr.employee_assignment.manager_change", "hr.employee_assignment.change"]);

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    repository = new SourceHrRepository(pool);
    const dates = await pool.query<{ today: string; yesterday: string }>(
      "select current_date::text as today,(current_date-1)::text as yesterday",
    );
    today = dates.rows[0]!.today;
    yesterday = dates.rows[0]!.yesterday;
    await pool.query(
      `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
       values
        ('manager-change-branch',$1,$2,'branch','MC-BR','Manager Change Branch','active'),
        ('manager-change-department',$1,'manager-change-branch','department','MC-DP','Manager Change Department','active')
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId, companyId],
    );
    await pool.query(
      `insert into hr_master_record
        (id,tenant_id,company_id,master_type,code,name,created_by)
       values
        ('manager-change-designation',$1,$2,'designation','MC-DES','Manager Change Role','r06.maker'),
        ('manager-change-grade',$1,$2,'job_grade','MC-GRD','Manager Change Grade','r06.maker'),
        ('manager-change-cost-center',$1,$2,'cost_center','MC-CC','Manager Change Cost Center','r06.maker'),
        ('manager-change-location',$1,$2,'work_location','MC-LOC','Manager Change Location','r06.maker'),
        ('manager-change-employment-type',$1,$2,'employment_type','MC-ET','Manager Change Employment Type','r06.maker'),
        ('manager-change-category',$1,$2,'employee_category','MC-CAT','Manager Change Category','r06.maker')
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId, companyId],
    );
    await pool.query(
      `insert into hr_salary_structure
        (id,tenant_id,company_id,code,name,description,created_by)
       values ('manager-change-salary-structure',$1,$2,'MC-SALARY','Manager Change Salary','Manager-change isolation fixture','r06.maker')
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId, companyId],
    );
    const activePolicy = await pool.query<{ id: string }>(
      `select id from hr_employment_lifecycle_policy
        where tenant_id=$1 and legal_employer_id=$2 and status='active'
          and effective_from<=$3 and (effective_to is null or effective_to>=$3)
        limit 1`,
      [sourceTestTenantId, companyId, yesterday],
    );
    if (!activePolicy.rows[0]) {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
      const policyMaker = actor("r06.maker", ["hr.employment_lifecycle_policy.manage"]);
      const policyApprover = actor("r06.checker", ["hr.employment_lifecycle_policy.approve"]);
      const policy = await repository.createEmploymentLifecyclePolicy(
        policyMaker,
        {
          company_id: companyId,
          code: `MC-${suffix}`,
          name: "Manager-change test lifecycle",
          effective_from: yesterday,
          effective_to: yesterday,
        },
        `manager-change-policy-create-${suffix}`,
        "hr-manager-change-integration",
      );
      await repository.submitEmploymentLifecyclePolicy(
        policyMaker,
        policy.id,
        { reason: "Manager-change test policy ready." },
        `manager-change-policy-submit-${suffix}`,
        "hr-manager-change-integration",
      );
      await repository.approveEmploymentLifecyclePolicy(
        policyApprover,
        policy.id,
        { reason: "Manager-change test policy approved." },
        `manager-change-policy-approve-${suffix}`,
        "hr-manager-change-integration",
      );
      await pool.query(
        `update hr_employment_lifecycle_policy
            set status='active',activated_by='r06.checker',activated_at=now(),updated_at=now()
          where tenant_id=$1 and id=$2 and status='approved'`,
        [sourceTestTenantId, policy.id],
      );
    }
    managerA = await activateEmployee("ManagerA", null);
    managerB = await activateEmployee("ManagerB", null);
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function activateEmployee(label: string, reportingManagerId: string | null) {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const employee = await repository.createEmployeeDraft(
      maker(),
      {
        company_id: companyId,
        employee_number: `M${suffix}`,
        first_name: label,
        last_name: "ManagerChange",
        joined_on: yesterday,
      },
      `manager-change-employee-${suffix}`,
      "hr-manager-change-integration",
    );
    await repository.submitEmployeeDraft(
      maker(),
      employee.id,
      { reason: "Manager-change fixture profile ready." },
      `manager-change-submit-${suffix}`,
      "hr-manager-change-integration",
    );
    await repository.decideEmployeeDraftApproval(
      employeeApprover(),
      employee.id,
      { decision: "approved", reason: "Manager-change fixture profile approved." },
      `manager-change-profile-approve-${suffix}`,
      "hr-manager-change-integration",
    );
    const profile = await repository.createProfileDraftAssignment(
      maker(),
      employee.id,
      {
        company_id: companyId,
        branch_id: "manager-change-branch",
        department_id: "manager-change-department",
        designation_id: "manager-change-designation",
        job_grade_id: "manager-change-grade",
        cost_center_id: "manager-change-cost-center",
        work_location_id: "manager-change-location",
        employment_type_id: "manager-change-employment-type",
        employee_category_id: "manager-change-category",
        ...(reportingManagerId ? { reporting_manager_id: reportingManagerId } : {}),
        effective_from: yesterday,
      },
      `manager-change-profile-${suffix}`,
      "hr-manager-change-integration",
    );
    const job = await repository.createJob(
      maker(),
      { company_id: companyId, code: `MJ${suffix}`, name: `${label} Job ${suffix}` },
      `manager-change-job-${suffix}`,
      "hr-manager-change-integration",
    );
    const hire = await repository.createEmployeeHireRequest(
      maker(),
      employee.id,
      {
        company_id: companyId,
        job_id: job.id,
        profile_draft_assignment_id: profile.id,
        effective_on: yesterday,
        reason: "Activate the manager-change integration fixture.",
      },
      `manager-change-hire-${suffix}`,
      "hr-manager-change-integration",
    );
    const decision = await repository.decideEmployeeHireRequest(
      hireApprover(),
      employee.id,
      hire.id,
      { decision: "approved", reason: "Fixture Hire independently approved." },
      `manager-change-hire-approve-${suffix}`,
      "hr-manager-change-integration",
    );
    return { employee, assignmentId: decision.assignment_id!, suffix };
  }

  async function addSalary(employeeId: string, suffix: string) {
    await pool.query(
      `insert into hr_salary_assignment
        (id,tenant_id,company_id,employee_id,structure_id,currency_code,effective_from,state,reason,created_by)
       values ($1,$2,$3,$4,'manager-change-salary-structure','PKR',$5,'effective','Existing governed salary','r06.maker')`,
      [`manager-change-salary-${suffix}`, sourceTestTenantId, companyId, employeeId, yesterday],
    );
  }

  async function salaryState(employeeId: string) {
    return pool.query(
      `select id,structure_id,currency_code,effective_from::text,effective_to::text,state,reason
         from hr_salary_assignment where tenant_id=$1 and employee_id=$2 order by id`,
      [sourceTestTenantId, employeeId],
    );
  }

  it("creates, replays, scopes, and independently approves a manager change without changing salary", async () => {
    const subject = await activateEmployee("Approved", managerA.employee.id);
    await addSalary(subject.employee.id, subject.suffix);
    const salaryBefore = (await salaryState(subject.employee.id)).rows;
    const input = {
      company_id: companyId,
      source_assignment_id: subject.assignmentId,
      reporting_manager_id: managerB.employee.id,
      clear_reporting_manager: false,
      effective_on: today,
      reason: "Move the employee to the approved reporting line.",
    };
    const created = await repository.createEmployeeManagerChangeRequest(
      maker(),
      subject.employee.id,
      input,
      `manager-change-request-${subject.suffix}`,
      "hr-manager-change-integration",
    );
    await expect(
      repository.createEmployeeManagerChangeRequest(
        privilegedMaker(),
        subject.employee.id,
        input,
        `manager-change-request-${subject.suffix}`,
        "hr-manager-change-integration",
      ),
    ).resolves.toEqual({ ...created, replayed: true });
    await expect(
      repository.createEmployeeManagerChangeRequest(
        maker(),
        subject.employee.id,
        { ...input, reason: "Conflicting replay." },
        `manager-change-request-${subject.suffix}`,
        "hr-manager-change-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" } satisfies Partial<HrApiError>);
    await expect(
      repository.createEmployeeManagerChangeRequest(
        maker(),
        subject.employee.id,
        input,
        `manager-change-duplicate-${subject.suffix}`,
        "hr-manager-change-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_MANAGER_CHANGE_ALREADY_PENDING" } satisfies Partial<HrApiError>);
    await expect(
      repository.createEmployeeManagerChangeRequest(
        maker(),
        subject.employee.id,
        { ...input, reporting_manager_id: managerA.employee.id },
        `manager-change-no-change-${subject.suffix}`,
        "hr-manager-change-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_MANAGER_CHANGE_REQUIRED" } satisfies Partial<HrApiError>);
    const queue = await repository.listEmployeeManagerChangeRequests(managerChangeApprover(), {
      company_id: companyId,
      search: subject.employee.employee_number,
      limit: 25,
    });
    expect(queue.items).toEqual([
      expect.objectContaining({
        id: created.id,
        current_reporting_manager_id: managerA.employee.id,
        proposed_reporting_manager_id: managerB.employee.id,
        clear_reporting_manager: false,
      }),
    ]);
    await expect(
      repository.listEmployeeManagerChangeRequests(
        actor("no-company-manager-change", ["hr.employee_assignment.change"]),
        { company_id: companyId, limit: 25 },
      ),
    ).rejects.toMatchObject({ status: 403, code: "COMPANY_ACCESS_DENIED" } satisfies Partial<HrApiError>);
    await expect(
      repository.decideEmployeeManagerChangeRequest(
        privilegedMaker(),
        subject.employee.id,
        created.id,
        { decision: "approved", reason: "Self approval must fail." },
        `manager-change-self-${subject.suffix}`,
        "hr-manager-change-integration",
      ),
    ).rejects.toMatchObject({ status: 403, code: "HR_SELF_APPROVAL_FORBIDDEN" } satisfies Partial<HrApiError>);
    const decision = await repository.decideEmployeeManagerChangeRequest(
      managerChangeApprover(),
      subject.employee.id,
      created.id,
      { decision: "approved", reason: "Independent manager-change approval completed." },
      `manager-change-decision-${subject.suffix}`,
      "hr-manager-change-integration",
    );
    expect(decision).toMatchObject({ status: "approved", assignment_id: expect.any(String), replayed: false });
    const state = await pool.query(
      `select source.assignment_status as source_status,source.effective_to::text as source_end,
              target.assignment_status as target_status,target.change_reason,target.effective_from::text as target_start,
              target.reporting_manager_id,
              target.company_id=source.company_id as same_company,
              target.branch_id=source.branch_id as same_branch,
              target.department_id=source.department_id as same_department,
              target.job_id=source.job_id as same_job,
              target.designation_id=source.designation_id as same_designation,
              target.job_grade_id=source.job_grade_id as same_grade,
              target.cost_center_id=source.cost_center_id as same_cost_center,
              target.work_location_id=source.work_location_id as same_location,
              target.employment_type_id=source.employment_type_id as same_employment_type,
              target.employee_category_id=source.employee_category_id as same_category,
              target.employment_relationship_id=source.employment_relationship_id as same_relationship
         from hr_employee_manager_change_request request
         join employee_assignment source on source.tenant_id=request.tenant_id and source.id=request.source_assignment_id
         join employee_assignment target on target.tenant_id=request.tenant_id and target.id=request.projected_assignment_id
        where request.tenant_id=$1 and request.id=$2`,
      [sourceTestTenantId, created.id],
    );
    expect(state.rows).toEqual([
      expect.objectContaining({
        source_status: "ended",
        source_end: yesterday,
        target_status: "active",
        change_reason: "manager_change",
        target_start: today,
        reporting_manager_id: managerB.employee.id,
        same_company: true,
        same_branch: true,
        same_department: true,
        same_job: true,
        same_designation: true,
        same_grade: true,
        same_cost_center: true,
        same_location: true,
        same_employment_type: true,
        same_category: true,
        same_relationship: true,
      }),
    ]);
    expect((await salaryState(subject.employee.id)).rows).toEqual(salaryBefore);
  });

  it("supports an explicitly approved clear and rejection without unintended assignment writes", async () => {
    const cleared = await activateEmployee("Cleared", managerA.employee.id);
    const clearRequest = await repository.createEmployeeManagerChangeRequest(
      maker(),
      cleared.employee.id,
      {
        company_id: companyId,
        source_assignment_id: cleared.assignmentId,
        reporting_manager_id: null,
        clear_reporting_manager: true,
        effective_on: today,
        reason: "Establish an approved top-level reporting line.",
      },
      `manager-change-clear-${cleared.suffix}`,
      "hr-manager-change-integration",
    );
    const clearDecision = await repository.decideEmployeeManagerChangeRequest(
      managerChangeApprover(),
      cleared.employee.id,
      clearRequest.id,
      { decision: "approved", reason: "The explicit reporting-line clear is approved." },
      `manager-change-clear-decision-${cleared.suffix}`,
      "hr-manager-change-integration",
    );
    const clearState = await pool.query(
      `select reporting_manager_id,change_reason from employee_assignment
        where tenant_id=$1 and id=$2`,
      [sourceTestTenantId, clearDecision.assignment_id],
    );
    expect(clearState.rows).toEqual([{ reporting_manager_id: null, change_reason: "manager_change" }]);

    const rejected = await activateEmployee("Rejected", managerA.employee.id);
    const rejectedRequest = await repository.createEmployeeManagerChangeRequest(
      maker(),
      rejected.employee.id,
      {
        company_id: companyId,
        source_assignment_id: rejected.assignmentId,
        reporting_manager_id: managerB.employee.id,
        clear_reporting_manager: false,
        effective_on: today,
        reason: "Propose a reporting line for rejection coverage.",
      },
      `manager-change-reject-${rejected.suffix}`,
      "hr-manager-change-integration",
    );
    const rejection = await repository.decideEmployeeManagerChangeRequest(
      managerChangeApprover(),
      rejected.employee.id,
      rejectedRequest.id,
      { decision: "rejected", reason: "The reporting-line proposal requires correction." },
      `manager-change-reject-decision-${rejected.suffix}`,
      "hr-manager-change-integration",
    );
    expect(rejection).toMatchObject({ status: "rejected", assignment_id: null });
    const rejectedState = await pool.query(
      `select assignment.assignment_status,assignment.effective_to,assignment.reporting_manager_id
         from hr_employee_manager_change_request request
         join employee_assignment assignment
           on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
        where request.tenant_id=$1 and request.id=$2`,
      [sourceTestTenantId, rejectedRequest.id],
    );
    expect(rejectedState.rows).toEqual([
      { assignment_status: "active", effective_to: null, reporting_manager_id: managerA.employee.id },
    ]);
  });

  it("rejects self-reporting and reporting cycles before creating a pending request", async () => {
    const subject = await activateEmployee("CycleSubject", null);
    const subordinate = await activateEmployee("CycleSubordinate", subject.employee.id);
    const base = {
      company_id: companyId,
      source_assignment_id: subject.assignmentId,
      clear_reporting_manager: false,
      effective_on: today,
      reason: "Invalid reporting-line proposal.",
    };
    await expect(
      repository.createEmployeeManagerChangeRequest(
        maker(),
        subject.employee.id,
        { ...base, reporting_manager_id: subject.employee.id },
        `manager-change-self-request-${subject.suffix}`,
        "hr-manager-change-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_MANAGER_CHANGE_SELF_FORBIDDEN" } satisfies Partial<HrApiError>);
    await expect(
      repository.createEmployeeManagerChangeRequest(
        maker(),
        subject.employee.id,
        { ...base, reporting_manager_id: subordinate.employee.id },
        `manager-change-cycle-${subject.suffix}`,
        "hr-manager-change-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_MANAGER_CHANGE_CYCLE_FORBIDDEN" } satisfies Partial<HrApiError>);
  });
});
