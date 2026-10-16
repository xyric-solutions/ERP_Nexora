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

run("governed employee Promotion repository", () => {
  let pool: DatabasePool;
  let repository: SourceHrRepository;
  let today: string;
  let yesterday: string;

  const maker = () =>
    actor("r06.maker", [
      "hr.employee.create",
      "hr.employee.update",
      "hr.employee.submit",
      "hr.employee_assignment.create",
      "hr.employee_assignment.change",
      "hr.employment_lifecycle.action",
      "hr.employment_relationship.create",
      "hr.master.create",
    ]);
  const employeeApprover = () => actor("r06.checker", ["hr.employee.approve"]);
  const hireApprover = () => actor("r06.checker", ["hr.employment_lifecycle.approve"]);
  const promotionApprover = () => actor("r06.checker", ["hr.employee_assignment.change"]);

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
        ('promotion-branch',$1,$2,'branch','PR-BR','Promotion Branch','active'),
        ('promotion-department',$1,'promotion-branch','department','PR-DP','Promotion Department','active')
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId, companyId],
    );
    await pool.query(
      `insert into hr_master_record
        (id,tenant_id,company_id,master_type,code,name,created_by)
       values
        ('promotion-source-designation',$1,$2,'designation','PR-DES-1','Associate','r06.maker'),
        ('promotion-target-designation',$1,$2,'designation','PR-DES-2','Senior Associate','r06.maker'),
        ('promotion-source-grade',$1,$2,'job_grade','PR-GRD-1','Grade 1','r06.maker'),
        ('promotion-target-grade',$1,$2,'job_grade','PR-GRD-2','Grade 2','r06.maker'),
        ('promotion-cost-center',$1,$2,'cost_center','PR-CC','Promotion Cost Center','r06.maker'),
        ('promotion-location',$1,$2,'work_location','PR-LOC','Promotion Location','r06.maker'),
        ('promotion-employment-type',$1,$2,'employment_type','PR-ET','Promotion Employment Type','r06.maker'),
        ('promotion-category',$1,$2,'employee_category','PR-CAT','Promotion Category','r06.maker')
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId, companyId],
    );
    await pool.query(
      `insert into hr_salary_structure
        (id,tenant_id,company_id,code,name,description,created_by)
       values ('promotion-salary-structure',$1,$2,'PR-SALARY','Promotion Salary','Promotion isolation fixture','r06.maker')
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
          code: `PR-${suffix}`,
          name: "Promotion test lifecycle",
          effective_from: yesterday,
          effective_to: yesterday,
        },
        `promotion-policy-create-${suffix}`,
        "hr-promotion-integration",
      );
      await repository.submitEmploymentLifecyclePolicy(
        policyMaker,
        policy.id,
        { reason: "Promotion test policy ready." },
        `promotion-policy-submit-${suffix}`,
        "hr-promotion-integration",
      );
      await repository.approveEmploymentLifecyclePolicy(
        policyApprover,
        policy.id,
        { reason: "Promotion test policy approved." },
        `promotion-policy-approve-${suffix}`,
        "hr-promotion-integration",
      );
      await pool.query(
        `update hr_employment_lifecycle_policy
            set status='active',activated_by='r06.checker',activated_at=now(),updated_at=now()
          where tenant_id=$1 and id=$2 and status='approved'`,
        [sourceTestTenantId, policy.id],
      );
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function createActiveEmployee(label: string) {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const employee = await repository.createEmployeeDraft(
      maker(),
      {
        company_id: companyId,
        employee_number: `P${suffix}`,
        first_name: label,
        last_name: "Promotion",
        joined_on: yesterday,
      },
      `promotion-employee-${suffix}`,
      "hr-promotion-integration",
    );
    await repository.submitEmployeeDraft(
      maker(),
      employee.id,
      { reason: "Promotion fixture profile ready." },
      `promotion-submit-${suffix}`,
      "hr-promotion-integration",
    );
    await repository.decideEmployeeDraftApproval(
      employeeApprover(),
      employee.id,
      { decision: "approved", reason: "Promotion fixture profile approved." },
      `promotion-profile-approve-${suffix}`,
      "hr-promotion-integration",
    );
    const profile = await repository.createProfileDraftAssignment(
      maker(),
      employee.id,
      {
        company_id: companyId,
        branch_id: "promotion-branch",
        department_id: "promotion-department",
        designation_id: "promotion-source-designation",
        job_grade_id: "promotion-source-grade",
        cost_center_id: "promotion-cost-center",
        work_location_id: "promotion-location",
        employment_type_id: "promotion-employment-type",
        employee_category_id: "promotion-category",
        effective_from: yesterday,
      },
      `promotion-profile-${suffix}`,
      "hr-promotion-integration",
    );
    const sourceJob = await repository.createJob(
      maker(),
      { company_id: companyId, code: `PJ1${suffix}`, name: `${label} Associate Job ${suffix}` },
      `promotion-source-job-${suffix}`,
      "hr-promotion-integration",
    );
    const targetJob = await repository.createJob(
      maker(),
      { company_id: companyId, code: `PJ2${suffix}`, name: `${label} Senior Job ${suffix}` },
      `promotion-target-job-${suffix}`,
      "hr-promotion-integration",
    );
    const hire = await repository.createEmployeeHireRequest(
      maker(),
      employee.id,
      {
        company_id: companyId,
        job_id: sourceJob.id,
        profile_draft_assignment_id: profile.id,
        effective_on: yesterday,
        reason: "Activate the Promotion integration fixture.",
      },
      `promotion-hire-${suffix}`,
      "hr-promotion-integration",
    );
    const hireDecision = await repository.decideEmployeeHireRequest(
      hireApprover(),
      employee.id,
      hire.id,
      { decision: "approved", reason: "Fixture Hire independently approved." },
      `promotion-hire-approve-${suffix}`,
      "hr-promotion-integration",
    );
    await pool.query(
      `insert into hr_salary_assignment
        (id,tenant_id,company_id,employee_id,structure_id,currency_code,effective_from,state,reason,created_by)
       values ($1,$2,$3,$4,'promotion-salary-structure','PKR',$5,'effective','Existing governed salary','r06.maker')`,
      [`promotion-salary-${suffix}`, sourceTestTenantId, companyId, employee.id, yesterday],
    );
    const input = {
      company_id: companyId,
      source_assignment_id: hireDecision.assignment_id!,
      job_id: targetJob.id,
      designation_id: "promotion-target-designation",
      job_grade_id: "promotion-target-grade",
      effective_on: today,
      reason: `${label} is ready for the senior role.`,
    };
    const promotion = await repository.createEmployeePromotionRequest(
      maker(),
      employee.id,
      input,
      `promotion-request-${suffix}`,
      "hr-promotion-integration",
    );
    return { employee, sourceAssignmentId: hireDecision.assignment_id!, sourceJobId: sourceJob.id, input, promotion, suffix };
  }

  async function salaryState(employeeId: string) {
    return pool.query(
      `select id,structure_id,currency_code,effective_from::text,effective_to::text,state,reason
         from hr_salary_assignment where tenant_id=$1 and employee_id=$2 order by id`,
      [sourceTestTenantId, employeeId],
    );
  }

  it("creates, scopes, replays, and independently approves a Promotion without changing salary", async () => {
    const fixture = await createActiveEmployee("Approved");
    const salaryBefore = (await salaryState(fixture.employee.id)).rows;
    await expect(
      repository.createEmployeePromotionRequest(
        maker(),
        fixture.employee.id,
        fixture.input,
        `promotion-request-${fixture.suffix}`,
        "hr-promotion-integration",
      ),
    ).resolves.toEqual({ ...fixture.promotion, replayed: true });
    await expect(
      repository.createEmployeePromotionRequest(
        maker(),
        fixture.employee.id,
        { ...fixture.input, reason: "Conflicting replay." },
        `promotion-request-${fixture.suffix}`,
        "hr-promotion-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" } satisfies Partial<HrApiError>);
    await expect(
      repository.createEmployeePromotionRequest(
        maker(),
        fixture.employee.id,
        fixture.input,
        `promotion-duplicate-${fixture.suffix}`,
        "hr-promotion-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_PROMOTION_ALREADY_PENDING" } satisfies Partial<HrApiError>);
    await expect(
      repository.createEmployeePromotionRequest(
        maker(),
        fixture.employee.id,
        {
          ...fixture.input,
          job_id: fixture.sourceJobId,
          designation_id: "promotion-source-designation",
          job_grade_id: "promotion-source-grade",
        },
        `promotion-no-change-${fixture.suffix}`,
        "hr-promotion-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_PROMOTION_CHANGE_REQUIRED" } satisfies Partial<HrApiError>);

    const queue = await repository.listEmployeePromotionRequests(promotionApprover(), {
      company_id: companyId,
      search: fixture.employee.employee_number,
      limit: 25,
    });
    expect(queue.items).toEqual([
      expect.objectContaining({
        id: fixture.promotion.id,
        source_assignment_id: fixture.sourceAssignmentId,
        proposed_designation: "Senior Associate",
        proposed_job_grade: "Grade 2",
        status: "pending",
      }),
    ]);
    await expect(
      repository.listEmployeePromotionRequests(actor("no-company-promotion", ["hr.employee_assignment.change"]), {
        company_id: companyId,
        limit: 25,
      }),
    ).rejects.toMatchObject({ status: 403, code: "COMPANY_ACCESS_DENIED" } satisfies Partial<HrApiError>);
    await expect(
      repository.decideEmployeePromotionRequest(
        maker(),
        fixture.employee.id,
        fixture.promotion.id,
        { decision: "approved", reason: "Self approval must fail." },
        `promotion-self-${fixture.suffix}`,
        "hr-promotion-integration",
      ),
    ).rejects.toMatchObject({ status: 403, code: "HR_SELF_APPROVAL_FORBIDDEN" } satisfies Partial<HrApiError>);

    const decision = await repository.decideEmployeePromotionRequest(
      promotionApprover(),
      fixture.employee.id,
      fixture.promotion.id,
      { decision: "approved", reason: "Independent Promotion approval completed." },
      `promotion-decision-${fixture.suffix}`,
      "hr-promotion-integration",
    );
    expect(decision).toMatchObject({ status: "approved", assignment_id: expect.any(String), replayed: false });
    const state = await pool.query(
      `select source.assignment_status as source_status,source.effective_to::text as source_end,
              target.assignment_status as target_status,target.change_reason,
              target.effective_from::text as target_start,target.job_id,
              target.designation_id,target.job_grade_id,
              target.branch_id=source.branch_id as same_branch,
              target.department_id=source.department_id as same_department,
              target.cost_center_id=source.cost_center_id as same_cost_center,
              target.work_location_id=source.work_location_id as same_location,
              target.employment_type_id=source.employment_type_id as same_employment_type,
              target.employee_category_id=source.employee_category_id as same_category,
              target.reporting_manager_id is not distinct from source.reporting_manager_id as same_manager,
              target.employment_relationship_id=source.employment_relationship_id as same_relationship
         from hr_employee_promotion_request request
         join employee_assignment source on source.tenant_id=request.tenant_id and source.id=request.source_assignment_id
         join employee_assignment target on target.tenant_id=request.tenant_id and target.id=request.projected_assignment_id
        where request.tenant_id=$1 and request.id=$2`,
      [sourceTestTenantId, fixture.promotion.id],
    );
    expect(state.rows).toEqual([
      expect.objectContaining({
        source_status: "ended",
        source_end: yesterday,
        target_status: "active",
        change_reason: "promotion",
        target_start: today,
        job_id: fixture.input.job_id,
        designation_id: "promotion-target-designation",
        job_grade_id: "promotion-target-grade",
        same_branch: true,
        same_department: true,
        same_cost_center: true,
        same_location: true,
        same_employment_type: true,
        same_category: true,
        same_manager: true,
        same_relationship: true,
      }),
    ]);
    expect((await salaryState(fixture.employee.id)).rows).toEqual(salaryBefore);
  });

  it("rejects a Promotion without changing assignment or salary history", async () => {
    const fixture = await createActiveEmployee("Rejected");
    const salaryBefore = (await salaryState(fixture.employee.id)).rows;
    const decision = await repository.decideEmployeePromotionRequest(
      promotionApprover(),
      fixture.employee.id,
      fixture.promotion.id,
      { decision: "rejected", reason: "The role change requires correction." },
      `promotion-reject-${fixture.suffix}`,
      "hr-promotion-integration",
    );
    expect(decision).toMatchObject({ status: "rejected", assignment_id: null });
    const state = await pool.query(
      `select request.request_state,request.projected_assignment_id,
              assignment.assignment_status,assignment.effective_to
         from hr_employee_promotion_request request
         join employee_assignment assignment
           on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
        where request.tenant_id=$1 and request.id=$2`,
      [sourceTestTenantId, fixture.promotion.id],
    );
    expect(state.rows).toEqual([
      { request_state: "rejected", projected_assignment_id: null, assignment_status: "active", effective_to: null },
    ]);
    expect((await salaryState(fixture.employee.id)).rows).toEqual(salaryBefore);
  });
});
