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

run("governed employee work-location-change repository", () => {
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
  const locationApprover = () => actor("r06.checker", ["hr.employee_assignment.change"]);

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
        ('work-location-business-unit',$1,$2,'business_unit','WL-BU','Work Location Business Unit','active'),
        ('work-location-branch',$1,'work-location-business-unit','branch','WL-BR','Work Location Branch','active'),
        ('work-location-department',$1,'work-location-branch','department','WL-DP','Work Location Department','active')
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId, companyId],
    );
    await pool.query(
      `insert into hr_master_record
        (id,tenant_id,company_id,master_type,code,name,created_by)
       values
        ('work-location-designation',$1,$2,'designation','WL-DES','Work Location Role','r06.maker'),
        ('work-location-grade',$1,$2,'job_grade','WL-GRD','Work Location Grade','r06.maker'),
        ('work-location-cost-center',$1,$2,'cost_center','WL-CC','Work Location Cost Center','r06.maker'),
        ('work-location-source',$1,$2,'work_location','WL-SRC','Islamabad Office','r06.maker'),
        ('work-location-target',$1,$2,'work_location','WL-TGT','Lahore Office','r06.maker'),
        ('work-location-no-profile',$1,$2,'work_location','WL-NOP','Unreviewed Office','r06.maker'),
        ('work-location-employment-type',$1,$2,'employment_type','WL-ET','Work Location Employment Type','r06.maker'),
        ('work-location-category',$1,$2,'employee_category','WL-CAT','Work Location Category','r06.maker')
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId, companyId],
    );
    const jurisdiction = await pool.query<{ country_code: string; id: string }>(
      "select country_code,id from jurisdiction order by country_code,id limit 1",
    );
    if (!jurisdiction.rows[0]) throw new Error("The source test database has no jurisdiction fixture.");
    await pool.query(
      `insert into hr_work_location_profile
        (id,tenant_id,company_id,work_location_id,country_code,jurisdiction_id,
         effective_from,state,created_by,submitted_by,submitted_at,approved_by,approved_at)
       values
        ('work-location-target-profile',$1,$2,'work-location-target',$3,$4,
         $5,'active','r06.maker','r06.maker',now(),'r06.checker',now())
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId, companyId, jurisdiction.rows[0].country_code, jurisdiction.rows[0].id, yesterday],
    );
    await pool.query(
      `insert into hr_salary_structure
        (id,tenant_id,company_id,code,name,description,created_by)
       values ('work-location-salary-structure',$1,$2,'WL-SALARY','Work Location Salary','Location isolation fixture','r06.maker')
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
          code: `WL-${suffix}`,
          name: "Work-location-change test lifecycle",
          effective_from: yesterday,
          effective_to: yesterday,
        },
        `work-location-policy-create-${suffix}`,
        "hr-work-location-change-integration",
      );
      await repository.submitEmploymentLifecyclePolicy(
        policyMaker,
        policy.id,
        { reason: "Work-location-change test policy ready." },
        `work-location-policy-submit-${suffix}`,
        "hr-work-location-change-integration",
      );
      await repository.approveEmploymentLifecyclePolicy(
        policyApprover,
        policy.id,
        { reason: "Work-location-change test policy approved." },
        `work-location-policy-approve-${suffix}`,
        "hr-work-location-change-integration",
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

  async function activateEmployee(label: string) {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const employee = await repository.createEmployeeDraft(
      maker(),
      {
        company_id: companyId,
        employee_number: `W${suffix}`,
        first_name: label,
        last_name: "WorkLocation",
        joined_on: yesterday,
      },
      `work-location-employee-${suffix}`,
      "hr-work-location-change-integration",
    );
    await repository.submitEmployeeDraft(
      maker(),
      employee.id,
      { reason: "Work-location fixture profile ready." },
      `work-location-submit-${suffix}`,
      "hr-work-location-change-integration",
    );
    await repository.decideEmployeeDraftApproval(
      employeeApprover(),
      employee.id,
      { decision: "approved", reason: "Work-location fixture profile approved." },
      `work-location-profile-approve-${suffix}`,
      "hr-work-location-change-integration",
    );
    const profile = await repository.createProfileDraftAssignment(
      maker(),
      employee.id,
      {
        company_id: companyId,
        branch_id: "work-location-branch",
        department_id: "work-location-department",
        designation_id: "work-location-designation",
        job_grade_id: "work-location-grade",
        cost_center_id: "work-location-cost-center",
        work_location_id: "work-location-source",
        employment_type_id: "work-location-employment-type",
        employee_category_id: "work-location-category",
        effective_from: yesterday,
      },
      `work-location-profile-${suffix}`,
      "hr-work-location-change-integration",
    );
    const job = await repository.createJob(
      maker(),
      { company_id: companyId, code: `WJ${suffix}`, name: `${label} Job ${suffix}` },
      `work-location-job-${suffix}`,
      "hr-work-location-change-integration",
    );
    const hire = await repository.createEmployeeHireRequest(
      maker(),
      employee.id,
      {
        company_id: companyId,
        job_id: job.id,
        profile_draft_assignment_id: profile.id,
        effective_on: yesterday,
        reason: "Activate the work-location integration fixture.",
      },
      `work-location-hire-${suffix}`,
      "hr-work-location-change-integration",
    );
    const decision = await repository.decideEmployeeHireRequest(
      hireApprover(),
      employee.id,
      hire.id,
      { decision: "approved", reason: "Fixture Hire independently approved." },
      `work-location-hire-approve-${suffix}`,
      "hr-work-location-change-integration",
    );
    await pool.query(
      `insert into employee_assignment_org_unit
        (tenant_id,assignment_id,organization_type,organization_unit_id,created_by)
       values ($1,$2,'business_unit','work-location-business-unit','r06.maker')`,
      [sourceTestTenantId, decision.assignment_id],
    );
    return { employee, assignmentId: decision.assignment_id!, suffix };
  }

  async function addSalary(employeeId: string, suffix: string) {
    await pool.query(
      `insert into hr_salary_assignment
        (id,tenant_id,company_id,employee_id,structure_id,currency_code,effective_from,state,reason,created_by)
       values ($1,$2,$3,$4,'work-location-salary-structure','PKR',$5,'effective','Existing governed salary','r06.maker')`,
      [`work-location-salary-${suffix}`, sourceTestTenantId, companyId, employeeId, yesterday],
    );
  }

  async function salaryState(employeeId: string) {
    return pool.query(
      `select id,structure_id,currency_code,effective_from::text,effective_to::text,state,reason
         from hr_salary_assignment where tenant_id=$1 and employee_id=$2 order by id`,
      [sourceTestTenantId, employeeId],
    );
  }

  it("creates, replays, scopes, and independently approves a jurisdiction-ready location change", async () => {
    const subject = await activateEmployee("Approved");
    await addSalary(subject.employee.id, subject.suffix);
    const salaryBefore = (await salaryState(subject.employee.id)).rows;
    const input = {
      company_id: companyId,
      source_assignment_id: subject.assignmentId,
      work_location_id: "work-location-target",
      effective_on: today,
      reason: "Move the employee to the reviewed Lahore statutory location.",
    };
    const created = await repository.createEmployeeWorkLocationChangeRequest(
      maker(),
      subject.employee.id,
      input,
      `work-location-request-${subject.suffix}`,
      "hr-work-location-change-integration",
    );
    await expect(
      repository.createEmployeeWorkLocationChangeRequest(
        maker(),
        subject.employee.id,
        input,
        `work-location-request-${subject.suffix}`,
        "hr-work-location-change-integration",
      ),
    ).resolves.toEqual({ ...created, replayed: true });
    await expect(
      repository.createEmployeeWorkLocationChangeRequest(
        maker(),
        subject.employee.id,
        { ...input, reason: "Conflicting replay." },
        `work-location-request-${subject.suffix}`,
        "hr-work-location-change-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" } satisfies Partial<HrApiError>);
    await expect(
      repository.createEmployeeWorkLocationChangeRequest(
        maker(),
        subject.employee.id,
        input,
        `work-location-duplicate-${subject.suffix}`,
        "hr-work-location-change-integration",
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "HR_WORK_LOCATION_CHANGE_ALREADY_PENDING",
    } satisfies Partial<HrApiError>);
    const queue = await repository.listEmployeeWorkLocationChangeRequests(locationApprover(), {
      company_id: companyId,
      search: subject.employee.employee_number,
      limit: 25,
    });
    expect(queue.items).toEqual([
      expect.objectContaining({
        id: created.id,
        current_work_location_id: "work-location-source",
        proposed_work_location_id: "work-location-target",
        jurisdiction_profile_id: "work-location-target-profile",
        jurisdiction_ready: true,
      }),
    ]);
    await expect(
      repository.listEmployeeWorkLocationChangeRequests(
        actor("no-company-work-location", ["hr.employee_assignment.change"]),
        { company_id: companyId, limit: 25 },
      ),
    ).rejects.toMatchObject({ status: 403, code: "COMPANY_ACCESS_DENIED" } satisfies Partial<HrApiError>);
    await expect(
      repository.decideEmployeeWorkLocationChangeRequest(
        maker(),
        subject.employee.id,
        created.id,
        { decision: "approved", reason: "Self approval must fail." },
        `work-location-self-${subject.suffix}`,
        "hr-work-location-change-integration",
      ),
    ).rejects.toMatchObject({ status: 403, code: "HR_SELF_APPROVAL_FORBIDDEN" } satisfies Partial<HrApiError>);
    const decision = await repository.decideEmployeeWorkLocationChangeRequest(
      locationApprover(),
      subject.employee.id,
      created.id,
      { decision: "approved", reason: "Independent work-location approval completed." },
      `work-location-decision-${subject.suffix}`,
      "hr-work-location-change-integration",
    );
    expect(decision).toMatchObject({ status: "approved", assignment_id: expect.any(String), replayed: false });
    const state = await pool.query(
      `select source.assignment_status as source_status,source.effective_to::text as source_end,
              target.assignment_status as target_status,target.change_reason,target.effective_from::text as target_start,
              target.work_location_id,
              target.company_id=source.company_id as same_company,
              target.branch_id=source.branch_id as same_branch,
              target.department_id=source.department_id as same_department,
              target.job_id=source.job_id as same_job,
              target.designation_id=source.designation_id as same_designation,
              target.job_grade_id=source.job_grade_id as same_grade,
              target.cost_center_id=source.cost_center_id as same_cost_center,
              target.employment_type_id=source.employment_type_id as same_employment_type,
              target.employee_category_id=source.employee_category_id as same_category,
              target.reporting_manager_id is not distinct from source.reporting_manager_id as same_manager,
              target.employment_relationship_id=source.employment_relationship_id as same_relationship
         from hr_employee_work_location_change_request request
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
        change_reason: "work_location_change",
        target_start: today,
        work_location_id: "work-location-target",
        same_company: true,
        same_branch: true,
        same_department: true,
        same_job: true,
        same_designation: true,
        same_grade: true,
        same_cost_center: true,
        same_employment_type: true,
        same_category: true,
        same_manager: true,
        same_relationship: true,
      }),
    ]);
    const placements = await pool.query(
      `select organization_type,organization_unit_id
         from employee_assignment_org_unit
        where tenant_id=$1 and assignment_id=$2
        order by organization_type`,
      [sourceTestTenantId, decision.assignment_id],
    );
    expect(placements.rows).toEqual([
      { organization_type: "branch", organization_unit_id: "work-location-branch" },
      { organization_type: "business_unit", organization_unit_id: "work-location-business-unit" },
      { organization_type: "department", organization_unit_id: "work-location-department" },
    ]);
    expect((await salaryState(subject.employee.id)).rows).toEqual(salaryBefore);
  });

  it("rejects unreviewed and unchanged targets, while rejection creates no assignment", async () => {
    const subject = await activateEmployee("Rejected");
    const base = {
      company_id: companyId,
      source_assignment_id: subject.assignmentId,
      effective_on: today,
      reason: "Validate guarded work-location proposals.",
    };
    await expect(
      repository.createEmployeeWorkLocationChangeRequest(
        maker(),
        subject.employee.id,
        { ...base, work_location_id: "work-location-source" },
        `work-location-same-${subject.suffix}`,
        "hr-work-location-change-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_WORK_LOCATION_CHANGE_REQUIRED" } satisfies Partial<HrApiError>);
    await expect(
      repository.createEmployeeWorkLocationChangeRequest(
        maker(),
        subject.employee.id,
        { ...base, work_location_id: "work-location-no-profile" },
        `work-location-unreviewed-${subject.suffix}`,
        "hr-work-location-change-integration",
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "HR_WORK_LOCATION_JURISDICTION_REQUIRED",
    } satisfies Partial<HrApiError>);
    const request = await repository.createEmployeeWorkLocationChangeRequest(
      maker(),
      subject.employee.id,
      { ...base, work_location_id: "work-location-target" },
      `work-location-reject-${subject.suffix}`,
      "hr-work-location-change-integration",
    );
    const rejection = await repository.decideEmployeeWorkLocationChangeRequest(
      locationApprover(),
      subject.employee.id,
      request.id,
      { decision: "rejected", reason: "The relocation proposal requires correction." },
      `work-location-reject-decision-${subject.suffix}`,
      "hr-work-location-change-integration",
    );
    expect(rejection).toMatchObject({ status: "rejected", assignment_id: null });
    const source = await pool.query(
      `select assignment_status,effective_to,work_location_id
         from employee_assignment where tenant_id=$1 and id=$2`,
      [sourceTestTenantId, subject.assignmentId],
    );
    expect(source.rows).toEqual([
      { assignment_status: "active", effective_to: null, work_location_id: "work-location-source" },
    ]);
  });

  it("revalidates jurisdiction authority before approval and still permits rejection", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
    const locationId = `work-location-stale-${suffix}`;
    const profileId = `work-location-stale-profile-${suffix}`;
    const jurisdiction = await pool.query<{ country_code: string; id: string }>(
      "select country_code,id from jurisdiction order by country_code,id limit 1",
    );
    await pool.query(
      `insert into hr_master_record
        (id,tenant_id,company_id,master_type,code,name,created_by)
       values ($1,$2,$3,'work_location',$4,$5,'r06.maker')`,
      [locationId, sourceTestTenantId, companyId, `WLS${suffix}`, `Stale Location ${suffix}`],
    );
    await pool.query(
      `insert into hr_work_location_profile
        (id,tenant_id,company_id,work_location_id,country_code,jurisdiction_id,
         effective_from,state,created_by,submitted_by,submitted_at,approved_by,approved_at)
       values ($1,$2,$3,$4,$5,$6,$7,'active','r06.maker','r06.maker',now(),'r06.checker',now())`,
      [
        profileId,
        sourceTestTenantId,
        companyId,
        locationId,
        jurisdiction.rows[0]!.country_code,
        jurisdiction.rows[0]!.id,
        yesterday,
      ],
    );
    const subject = await activateEmployee("StaleAuthority");
    const request = await repository.createEmployeeWorkLocationChangeRequest(
      maker(),
      subject.employee.id,
      {
        company_id: companyId,
        source_assignment_id: subject.assignmentId,
        work_location_id: locationId,
        effective_on: today,
        reason: "Exercise decision-time jurisdiction revalidation.",
      },
      `work-location-stale-request-${suffix}`,
      "hr-work-location-change-integration",
    );
    await pool.query(
      `update hr_work_location_profile set state='superseded',updated_at=now()
        where tenant_id=$1 and id=$2`,
      [sourceTestTenantId, profileId],
    );
    await expect(
      repository.decideEmployeeWorkLocationChangeRequest(
        locationApprover(),
        subject.employee.id,
        request.id,
        { decision: "approved", reason: "This authority has become stale." },
        `work-location-stale-approve-${suffix}`,
        "hr-work-location-change-integration",
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "HR_WORK_LOCATION_JURISDICTION_REQUIRED",
    } satisfies Partial<HrApiError>);
    await expect(
      repository.decideEmployeeWorkLocationChangeRequest(
        locationApprover(),
        subject.employee.id,
        request.id,
        { decision: "rejected", reason: "The jurisdiction evidence was superseded." },
        `work-location-stale-reject-${suffix}`,
        "hr-work-location-change-integration",
      ),
    ).resolves.toMatchObject({ status: "rejected", assignment_id: null });
  });
});
