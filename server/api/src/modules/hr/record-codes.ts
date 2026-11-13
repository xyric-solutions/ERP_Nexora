import type { PoolClient } from "pg";
import type { HrRecordCodeKind } from "@nexora/contracts";

// Sources are internal constants; callers cannot supply SQL identifiers.
const sources = {
  employee: ["EMP", "employee", "employee_number", null],
  shift: ["SHF", "hr_shift", "code", "company_id"],
  leave: ["LT", "hr_leave_type", "code", "company_id"],
  component: ["PAY", "hr_pay_component", "code", "company_id"],
  structure: ["SAL", "hr_salary_structure", "code", "company_id"],
  loan: ["LN", "hr_employee_loan", "reference", "company_id"],
  advance: ["ADV", "hr_employee_loan", "reference", "company_id"],
  lifecycle: ["LCP", "hr_employment_lifecycle_policy", "code", "legal_employer_id"],
  programme: ["TRN", "hr_learning_record", "terms->>'code'", "company_id"],
  overtime: ["OTP", "hr_ot_monetary_policy", "reference", "company_id"],
  designation: ["DSG", "hr_master_record", "code", "company_id"],
  job_grade: ["GRD", "hr_master_record", "code", "company_id"],
  job: ["JOB", "hr_master_record", "code", "company_id"],
  cost_center: ["CC", "hr_master_record", "code", "company_id"],
  work_location: ["LOC", "hr_master_record", "code", "company_id"],
  employment_setup: ["ES", "hr_master_record", "code", "company_id"],
  // Retired by HR134; kept so archived ET/EC codes still parse and never reissue.
  employment_type: ["ET", "hr_master_record", "code", "company_id"],
  employee_category: ["EC", "hr_master_record", "code", "company_id"],
  business_unit: ["BU", "organization_unit", "code", null],
  // Division units are shown as Locations and branch units as Projects. Earlier
  // DIV-/BR- codes keep their values; new records use the visible names.
  division: ["LCN", "organization_unit", "code", null],
  branch: ["PRJ", "organization_unit", "code", null],
  department: ["DEPT", "organization_unit", "code", null],
  warehouse: ["WH", "organization_unit", "code", null],
  // HR154: every Add / New / Create form allocates a code. Recruitment and attendance records keep
  // their historical year-random references; new records use the sequential PREFIX-### form.
  requisition: ["MRQ", "hr_manpower_requisition", "reference", "company_id"],
  opening: ["JOP", "hr_job_opening", "reference", "company_id"],
  candidate: ["CAN", "hr_candidate", "reference", "company_id"],
  application: ["APL", "hr_recruitment_application", "reference", "company_id"],
  offer: ["OFR", "hr_recruitment_offer", "reference", "company_id"],
  interview: ["INT", "hr_recruitment_interview", "code", null],
  assessment: ["ASM", "hr_recruitment_assessment", "code", null],
  shift_allocation: ["SAS", "hr_shift_assignment", "reference", "company_id"],
  leave_request: ["LVR", "hr_leave_request", "reference", "company_id"],
  leave_posting: ["LBP", "hr_leave_transaction", "code", "company_id"],
  correction: ["ACR", "hr_attendance_correction", "reference", "company_id"],
  overtime_request: ["OT", "hr_overtime_request", "reference", "company_id"],
  overtime_rule: ["OTR", "hr_overtime_rule", "code", "company_id"],
  transfer: ["TRF", "hr_employee_transfer_request", "code", "company_id"],
  promotion: ["PRM", "hr_employee_promotion_request", "code", "company_id"],
  manager_change: ["RMC", "hr_employee_manager_change_request", "code", "company_id"],
  work_location_change: ["WLC", "hr_employee_work_location_change_request", "code", "company_id"],
  placement_change: ["OPC", "hr_employee_organization_placement_change_request", "code", "company_id"],
  assignment: ["ASG", "employee_assignment", "code", "company_id"],
  hire: ["HIR", "hr_employment_relationship", "relationship_number", "legal_employer_id"],
  onboarding: ["ONB", "hr_lifecycle_case", "code", "company_id"],
  probation: ["PRB", "hr_lifecycle_case", "code", "company_id"],
  resignation: ["RSG", "hr_lifecycle_case", "code", "company_id"],
  termination: ["TRM", "hr_lifecycle_case", "code", "company_id"],
  clearance: ["CLR", "hr_lifecycle_case", "code", "company_id"],
  settlement: ["STL", "hr_lifecycle_case", "code", "company_id"],
  contact: ["CON", "employee_contact", "code", null],
  emergency_contact: ["EMC", "employee_emergency_contact", "code", null],
  document: ["DOC", "employee_document", "code", null],
  employment_history: ["EMH", "hr_employee_employment_history", "code", null],
  salary: ["SLA", "hr_salary_assignment", "code", "company_id"],
  adjustment: ["ADJ", "hr_payroll_adjustment", "code", "company_id"],
  ot_arrangement: ["OTA", "hr_employee_ot_arrangement", "code", "company_id"],
  statutory_setup: ["STS", "hr_payroll_localization_request", "code", "company_id"],
  payroll_policy: ["PPL", "hr_payroll_policy", "code", "company_id"],
  payroll_period: ["PRD", "hr_payroll_period", "code", "company_id"],
} as const satisfies Record<HrRecordCodeKind, readonly [string, string, string, string | null]>;
export type HrCodeKind = keyof typeof sources;
export const hrCodeKinds = Object.keys(sources) as HrCodeKind[];

/** Allocates a fresh code for a record created from an Add / New / Create form. */
export function allocateNewHrCode(client: PoolClient, tenant: string, company: string, kind: HrCodeKind): Promise<string> {
  return allocateHrCode(client, tenant, company, kind, "AUTO");
}

/** Call inside the authorized mutation transaction, after idempotency replay.
 * AUTO opts into allocation; explicit legacy API/import codes remain compatible.
 */
export async function allocateHrCode(
  client: PoolClient,
  tenant: string,
  company: string,
  kind: HrCodeKind,
  requested: string,
): Promise<string> {
  if (requested !== "AUTO") return requested;
  const [prefix, table, column, companyColumn] = sources[kind];
  const scope = companyColumn ? company : tenant;
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    JSON.stringify(["hr-record-code", tenant, scope, kind]),
  ]);
  const params: string[] = [tenant, `^${prefix}-([0-9]{1,9})$`];
  let where = "tenant_id=$1";
  if (companyColumn) {
    params.push(company);
    where += ` and ${companyColumn}=$${params.length}`;
  }
  if (table === "hr_master_record") {
    params.push(kind);
    where += ` and master_type=$${params.length}`;
  }
  const existing = await client.query<{ highest: string }>(
    `select coalesce(max((substring(${column} from $2))::bigint),0)::text highest from ${table} where ${where}`,
    params,
  );
  const result = await client.query<{ value: string }>(
    `insert into hr_record_code_counter(tenant_id,scope_id,record_kind,next_value)
     values($1,$2,$3,$4::bigint+2)
     on conflict(tenant_id,scope_id,record_kind) do update
       set next_value=greatest(hr_record_code_counter.next_value,$4::bigint+1)+1
     returning (next_value-1)::text value`,
    [tenant, scope, kind, existing.rows[0]!.highest],
  );
  return `${prefix}-${result.rows[0]!.value.padStart(3, "0")}`;
}

/** The code allocateHrCode would issue next, for showing on a new form. Read-only:
 * the final code is still reserved transactionally when the record is saved. */
export async function previewHrCode(
  client: PoolClient,
  tenant: string,
  company: string,
  kind: HrCodeKind,
): Promise<string> {
  const [prefix, table, column, companyColumn] = sources[kind];
  const scope = companyColumn ? company : tenant;
  const params: string[] = [tenant, `^${prefix}-([0-9]{1,9})$`];
  let where = "tenant_id=$1";
  if (companyColumn) {
    params.push(company);
    where += ` and ${companyColumn}=$${params.length}`;
  }
  if (table === "hr_master_record") {
    params.push(kind);
    where += ` and master_type=$${params.length}`;
  }
  params.push(scope, kind);
  const next = await client.query<{ value: string }>(
    `select greatest(
        coalesce((select max((substring(${column} from $2))::bigint) from ${table} where ${where}),0)+1,
        coalesce((select next_value from hr_record_code_counter where tenant_id=$1 and scope_id=$${params.length - 1} and record_kind=$${params.length}),0)
      )::text value`,
    params,
  );
  return `${prefix}-${next.rows[0]!.value.padStart(3, "0")}`;
}

/** Call inside the delete transaction before removing a coded record. Raises the
 * company/tenant counter past the deleted code so it is never reissued, even when
 * it was the highest code and no counter row existed yet (seeded/imported codes).
 */
export async function retireHrCode(
  client: PoolClient,
  tenant: string,
  company: string,
  kind: HrCodeKind,
  code: string,
): Promise<void> {
  const [prefix, , , companyColumn] = sources[kind];
  const match = new RegExp(`^${prefix}-([0-9]{1,9})$`).exec(code);
  if (!match) return;
  const scope = companyColumn ? company : tenant;
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    JSON.stringify(["hr-record-code", tenant, scope, kind]),
  ]);
  await client.query(
    `insert into hr_record_code_counter(tenant_id,scope_id,record_kind,next_value)
     values($1,$2,$3,$4::bigint+1)
     on conflict(tenant_id,scope_id,record_kind) do update
       set next_value=greatest(hr_record_code_counter.next_value,excluded.next_value)`,
    [tenant, scope, kind, match[1]],
  );
}

export function isHrCodeKind(kind: string): kind is HrCodeKind {
  return Object.hasOwn(sources, kind);
}
