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

run("governed employee Transfer repository", () => {
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
      "hr.employee_assignment.transfer",
      "hr.employment_lifecycle.action",
      "hr.employment_relationship.create",
      "hr.master.create",
    ]);
  const employeeApprover = () => actor("r06.checker", ["hr.employee.approve"]);
  const hireApprover = () => actor("r06.checker", ["hr.employment_lifecycle.approve"]);
  const transferApprover = () => actor("r06.checker", ["hr.employee_assignment.change"]);

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
        ('transfer-business-unit',$1,$2,'business_unit','TR-BU','Transfer Business Unit','active'),
        ('transfer-division',$1,$2,'division','TR-DV','Transfer Division','active'),
        ('transfer-warehouse',$1,$2,'warehouse','TR-WH','Transfer Warehouse','active'),
        ('transfer-source-branch',$1,$2,'branch','TR-SRC-BR','Transfer Source Branch','active'),
        ('transfer-source-department',$1,'transfer-source-branch','department','TR-SRC-DP','Transfer Source Department','active'),
        ('transfer-target-branch',$1,$2,'branch','TR-TGT-BR','Transfer Target Branch','active'),
        ('transfer-target-department',$1,'transfer-target-branch','department','TR-TGT-DP','Transfer Target Department','active')
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId, companyId],
    );
    await pool.query(
      `insert into hr_master_record
        (id,tenant_id,company_id,master_type,code,name,created_by)
       values
        ('transfer-designation',$1,$2,'designation','TR-DES','Transfer Designation','r06.maker'),
        ('transfer-grade',$1,$2,'job_grade','TR-GRD','Transfer Grade','r06.maker'),
        ('transfer-cost-center',$1,$2,'cost_center','TR-CC','Transfer Cost Center','r06.maker'),
        ('transfer-location',$1,$2,'work_location','TR-LOC','Transfer Location','r06.maker'),
        ('transfer-employment-type',$1,$2,'employment_type','TR-ET','Transfer Employment Type','r06.maker'),
        ('transfer-category',$1,$2,'employee_category','TR-CAT','Transfer Category','r06.maker')
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
          code: `TR-${suffix}`,
          name: "Transfer test lifecycle",
          effective_from: yesterday,
          effective_to: yesterday,
        },
        `transfer-policy-create-${suffix}`,
        "hr-transfer-integration",
      );
      await repository.submitEmploymentLifecyclePolicy(
        policyMaker,
        policy.id,
        { reason: "Transfer test policy ready." },
        `transfer-policy-submit-${suffix}`,
        "hr-transfer-integration",
      );
      await repository.approveEmploymentLifecyclePolicy(
        policyApprover,
        policy.id,
        { reason: "Transfer test policy approved." },
        `transfer-policy-approve-${suffix}`,
        "hr-transfer-integration",
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
        employee_number: `T${suffix}`,
        first_name: label,
        last_name: "Transfer",
        joined_on: yesterday,
      },
      `transfer-employee-${suffix}`,
      "hr-transfer-integration",
    );
    await repository.submitEmployeeDraft(
      maker(),
      employee.id,
      { reason: "Transfer fixture profile ready." },
      `transfer-submit-${suffix}`,
      "hr-transfer-integration",
    );
    await repository.decideEmployeeDraftApproval(
      employeeApprover(),
      employee.id,
      { decision: "approved", reason: "Transfer fixture profile approved." },
      `transfer-profile-approve-${suffix}`,
      "hr-transfer-integration",
    );
    const profile = await repository.createProfileDraftAssignment(
      maker(),
      employee.id,
      {
        company_id: companyId,
        branch_id: "transfer-source-branch",
        department_id: "transfer-source-department",
        designation_id: "transfer-designation",
        job_grade_id: "transfer-grade",
        cost_center_id: "transfer-cost-center",
        work_location_id: "transfer-location",
        employment_type_id: "transfer-employment-type",
        employee_category_id: "transfer-category",
        effective_from: yesterday,
      },
      `transfer-profile-${suffix}`,
      "hr-transfer-integration",
    );
    const job = await repository.createJob(
      maker(),
      { company_id: companyId, code: `TJ${suffix}`, name: `${label} Transfer Job ${suffix}` },
      `transfer-job-${suffix}`,
      "hr-transfer-integration",
    );
    const hire = await repository.createEmployeeHireRequest(
      maker(),
      employee.id,
      {
        company_id: companyId,
        job_id: job.id,
        profile_draft_assignment_id: profile.id,
        effective_on: yesterday,
        reason: "Activate the transfer integration fixture.",
      },
      `transfer-hire-${suffix}`,
      "hr-transfer-integration",
    );
    const hireDecision = await repository.decideEmployeeHireRequest(
      hireApprover(),
      employee.id,
      hire.id,
      { decision: "approved", reason: "Fixture Hire independently approved." },
      `transfer-hire-approve-${suffix}`,
      "hr-transfer-integration",
    );
    const sourceAssignmentId = hireDecision.assignment_id!;
    await pool.query(
      `insert into employee_assignment_org_unit
        (tenant_id,assignment_id,organization_type,organization_unit_id,created_by)
       values
        ($1,$2,'business_unit','transfer-business-unit','r06.maker'),
        ($1,$2,'division','transfer-division','r06.maker'),
        ($1,$2,'warehouse','transfer-warehouse','r06.maker')`,
      [sourceTestTenantId, sourceAssignmentId],
    );
    const input = {
      company_id: companyId,
      source_assignment_id: sourceAssignmentId,
      branch_id: "transfer-target-branch",
      department_id: "transfer-target-department",
      job_id: job.id,
      designation_id: "transfer-designation",
      job_grade_id: "transfer-grade",
      cost_center_id: "transfer-cost-center",
      work_location_id: "transfer-location",
      employment_type_id: "transfer-employment-type",
      employee_category_id: "transfer-category",
      effective_on: today,
      reason: `${label} is moving to the target operating branch.`,
    };
    const transfer = await repository.createEmployeeTransferRequest(
      maker(),
      employee.id,
      input,
      `transfer-request-${suffix}`,
      "hr-transfer-integration",
    );
    return { employee, sourceAssignmentId, input, transfer, suffix };
  }

  it("creates, scopes, replays, and independently approves a Transfer", async () => {
    const fixture = await createActiveEmployee("Approved");
    await expect(
      repository.createEmployeeTransferRequest(
        maker(),
        fixture.employee.id,
        fixture.input,
        `transfer-request-${fixture.suffix}`,
        "hr-transfer-integration",
      ),
    ).resolves.toEqual({ ...fixture.transfer, replayed: true });
    await expect(
      repository.createEmployeeTransferRequest(
        maker(),
        fixture.employee.id,
        { ...fixture.input, reason: "Conflicting replay." },
        `transfer-request-${fixture.suffix}`,
        "hr-transfer-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" } satisfies Partial<HrApiError>);
    await expect(
      repository.createEmployeeTransferRequest(
        maker(),
        fixture.employee.id,
        fixture.input,
        `transfer-duplicate-${fixture.suffix}`,
        "hr-transfer-integration",
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_TRANSFER_ALREADY_PENDING" } satisfies Partial<HrApiError>);

    const queue = await repository.listEmployeeTransferRequests(transferApprover(), {
      company_id: companyId,
      search: fixture.employee.employee_number,
      limit: 25,
    });
    expect(queue.items).toEqual([
      expect.objectContaining({
        id: fixture.transfer.id,
        source_assignment_id: fixture.sourceAssignmentId,
        proposed_branch: "Transfer Target Branch",
        status: "pending",
      }),
    ]);
    await expect(
      repository.listEmployeeTransferRequests(actor("no-company-transfer", ["hr.employee_assignment.change"]), {
        company_id: companyId,
        limit: 25,
      }),
    ).rejects.toMatchObject({ status: 403, code: "COMPANY_ACCESS_DENIED" } satisfies Partial<HrApiError>);

    const selfApprover = maker();
    selfApprover.actor.permissions.push("hr.employee_assignment.change");
    await expect(
      repository.decideEmployeeTransferRequest(
        selfApprover,
        fixture.employee.id,
        fixture.transfer.id,
        { decision: "approved", reason: "Self approval must fail." },
        `transfer-self-${fixture.suffix}`,
        "hr-transfer-integration",
      ),
    ).rejects.toMatchObject({ status: 403, code: "HR_SELF_APPROVAL_FORBIDDEN" } satisfies Partial<HrApiError>);

    const decision = await repository.decideEmployeeTransferRequest(
      transferApprover(),
      fixture.employee.id,
      fixture.transfer.id,
      { decision: "approved", reason: "Independent Transfer approval completed." },
      `transfer-decision-${fixture.suffix}`,
      "hr-transfer-integration",
    );
    expect(decision).toMatchObject({ status: "approved", assignment_id: expect.any(String), replayed: false });
    const state = await pool.query(
      `select request.request_state,request.decided_by,source.assignment_status as source_status,
              source.effective_to::text as source_end,target.assignment_status as target_status,
              target.change_reason,target.effective_from::text as target_start,
              target.branch_id,target.department_id,target.employment_relationship_id=source.employment_relationship_id as same_relationship
         from hr_employee_transfer_request request
         join employee_assignment source on source.tenant_id=request.tenant_id and source.id=request.source_assignment_id
         join employee_assignment target on target.tenant_id=request.tenant_id and target.id=request.projected_assignment_id
        where request.tenant_id=$1 and request.id=$2`,
      [sourceTestTenantId, fixture.transfer.id],
    );
    expect(state.rows).toEqual([
      {
        request_state: "approved",
        decided_by: "r06.checker",
        source_status: "ended",
        source_end: yesterday,
        target_status: "active",
        change_reason: "transfer",
        target_start: today,
        branch_id: "transfer-target-branch",
        department_id: "transfer-target-department",
        same_relationship: true,
      },
    ]);
    const placements = await pool.query(
      `select organization_type,organization_unit_id
         from employee_assignment_org_unit
        where tenant_id=$1 and assignment_id=$2
        order by organization_type`,
      [sourceTestTenantId, decision.assignment_id],
    );
    expect(placements.rows).toEqual([
      { organization_type: "branch", organization_unit_id: "transfer-target-branch" },
      { organization_type: "business_unit", organization_unit_id: "transfer-business-unit" },
      { organization_type: "department", organization_unit_id: "transfer-target-department" },
      { organization_type: "division", organization_unit_id: "transfer-division" },
      { organization_type: "warehouse", organization_unit_id: "transfer-warehouse" },
    ]);
  });

  it("rejects a Transfer without changing the active assignment", async () => {
    const fixture = await createActiveEmployee("Rejected");
    const decision = await repository.decideEmployeeTransferRequest(
      transferApprover(),
      fixture.employee.id,
      fixture.transfer.id,
      { decision: "rejected", reason: "The target placement requires correction." },
      `transfer-reject-${fixture.suffix}`,
      "hr-transfer-integration",
    );
    expect(decision).toMatchObject({ status: "rejected", assignment_id: null });
    const state = await pool.query(
      `select request.request_state,request.projected_assignment_id,
              assignment.assignment_status,assignment.effective_to
         from hr_employee_transfer_request request
         join employee_assignment assignment
           on assignment.tenant_id=request.tenant_id and assignment.id=request.source_assignment_id
        where request.tenant_id=$1 and request.id=$2`,
      [sourceTestTenantId, fixture.transfer.id],
    );
    expect(state.rows).toEqual([
      { request_state: "rejected", projected_assignment_id: null, assignment_status: "active", effective_to: null },
    ]);
  });
});
