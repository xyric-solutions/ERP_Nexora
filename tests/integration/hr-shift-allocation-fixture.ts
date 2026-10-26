import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { sourceTestTenantId } from "./source-security-fixture.js";
export async function createShiftAllocationFixture(pool: DatabasePool, users = ["r06.maker", "r06.checker"]) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    companyId = `shift-company-${suffix}`;
  await pool.query(
    "insert into organization_unit (id,tenant_id,parent_id,type,code,name,status) values ($1,$2,null,'company',$3,$4,'active')",
    [companyId, sourceTestTenantId, `ROSTER-${suffix}`, `Roster Acceptance ${suffix.slice(0, 5)}`],
  );
  for (const userId of users)
    await pool.query(
      "insert into security_user_company_access (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values ($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','isolated-shift-allocation-fixture')",
      [sourceTestTenantId, `shift-access-${suffix}-${userId}`, userId, companyId],
    );
  const masters: Record<string, string> = {};
  for (const kind of [
    "designation",
    "job_grade",
    "cost_center",
    "work_location",
    "employment_type",
    "employee_category",
  ]) {
    const id = `shift-master-${kind}-${suffix}`;
    masters[kind] = id;
    await pool.query(
      "insert into hr_master_record (tenant_id,id,company_id,master_type,code,name,status,created_by,configuration_key,configuration_value) values ($1,$2,$3,$4,$5,$6,'active','r06.maker',$7,$8)",
      [
        sourceTestTenantId,
        id,
        companyId,
        kind,
        `M-${suffix}`,
        `Roster ${kind.replaceAll("_", " ")}`,
        kind === "work_location" ? "working_pattern" : null,
        kind === "work_location" ? "on_site" : null,
      ],
    );
  }
  const today = (await pool.query<{ today: string }>("select current_date::text as today")).rows[0]!.today;
  const target = async (effectiveTo: string | null = null, reportingManagerId: string | null = null) => {
    const token = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase(),
      branchId = `roster-branch-${token}`,
      departmentId = `roster-department-${token}`,
      employeeId = `roster-employee-${token}`;
    await pool.query(
      "insert into organization_unit (id,tenant_id,parent_id,type,code,name,status) values ($1,$2,$3,'branch',$4,$5,'active'),($6,$2,$1,'department',$7,$8,'active')",
      [
        branchId,
        sourceTestTenantId,
        companyId,
        `B-${token}`,
        `Operations ${token.slice(0, 4)}`,
        departmentId,
        `D-${token}`,
        `Client Services ${token.slice(0, 4)}`,
      ],
    );
    await pool.query(
      "insert into employee (id,tenant_id,employee_number,first_name,last_name,joined_on,status,created_by) values ($1,$2,$3,'Roster',$4,current_date-365,'active','r06.maker')",
      [employeeId, sourceTestTenantId, `E-${token}`, `Employee ${token.slice(0, 4)}`],
    );
    const assignmentId = `roster-placement-${token}`;
    await pool.query(
      "insert into employee_assignment (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,effective_from,effective_to,change_reason,created_by,assignment_status,source_reference,reporting_manager_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,current_date-365,$13,'initial_appointment','r06.maker','legacy_compatibility','isolated-roster-fixture',$14)",
      [
        assignmentId,
        sourceTestTenantId,
        employeeId,
        companyId,
        branchId,
        departmentId,
        masters.designation,
        masters.job_grade,
        masters.cost_center,
        masters.work_location,
        masters.employment_type,
        masters.employee_category,
        effectiveTo,
        reportingManagerId,
      ],
    );
    return { branchId, departmentId, employeeId, assignmentId };
  };
  const dispose = () =>
    pool.query(
      "update security_user_company_access set revoked_by='r06.last-admin-a',revoked_at=now(),revocation_reason='Isolated shift fixture completed' where tenant_id=$1 and company_id=$2 and revoked_at is null",
      [sourceTestTenantId, companyId],
    );
  return { companyId, masters, today, target, dispose };
}
