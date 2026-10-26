import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { attendanceHash } from "../../server/api/src/modules/hr/attendance-completion.js";
import { ExactPayrollAmount as Money } from "../../server/api/src/modules/hr/payroll-calculation.js";
import { createHrLocalizationSchema } from "../../packages/contracts/src/hr/index.js";
import type { BeforePayrollAttendanceClose } from "./hr-payroll-run-fixture.js";
import { runActor } from "./hr-payroll-run-fixture.js";
import type { createStatutoryFixture } from "./hr-payroll-statutory-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
export function splitPlacementWithPool(pool: DatabasePool, gap = 0): BeforePayrollAttendanceClose {
  return async (f) => {
    const split = f.month.slice(0, 8) + "15",
      id = "stat-context-placement-" + randomUUID();
    await pool.query(
      "update employee_assignment set effective_to=$3::date-1,assignment_status='ended' where tenant_id=$1 and id=$2",
      [tenant, f.person.assignmentId, split],
    );
    await pool.query(
      `insert into employee_assignment(id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,effective_from,effective_to,change_reason,created_by,assignment_status,source_reference,reporting_manager_id)
  select $3,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_grade_id,cost_center_id,work_location_id,employment_type_id,employee_category_id,$4::date+$5::int,null,'transfer','r06.maker','legacy_compatibility','isolated dated statutory placement',reporting_manager_id from employee_assignment where tenant_id=$1 and id=$2`,
      [tenant, f.person.assignmentId, id, split, gap],
    );
  };
}
export async function splitStatutoryRules(
  pool: DatabasePool,
  info: Parameters<NonNullable<NonNullable<Parameters<typeof createStatutoryFixture>[1]>["beforePackReview"]>>[0],
) {
  const split = info.fixture.month.slice(0, 8) + "15";
  for (const id of info.rules) {
    const source = (await pool.query("select * from hr_statutory_rule_version where id=$1", [id])).rows[0],
      next = "stat-context-rule-" + randomUUID(),
      configuration = {
        ...source.configuration_json,
        constants: {
          ...source.configuration_json.constants,
          RATE: Money.parse(source.configuration_json.constants.RATE).multiply(Money.parse("2")).decimal(4),
        },
      };
    await pool.query("update hr_statutory_rule_version set effective_to=$2::date-1 where id=$1", [id, split]);
    await pool.query(
      `insert into hr_statutory_rule_version(id,rule_id,pack_version_id,effective_from,rule_type,applicability_json,configuration_json,stacking_operation,source_references_json,content_hash,output_definition_json,supersedes_rule_version_id)values($1,$2,$3,$4,'safe_formula',$5::jsonb,$6::jsonb,$7,$8::jsonb,$9,$10::jsonb,$11)`,
      [
        next,
        source.rule_id,
        source.pack_version_id,
        split,
        JSON.stringify(source.applicability_json),
        JSON.stringify(configuration),
        source.stacking_operation,
        JSON.stringify(source.source_references_json),
        attendanceHash(configuration),
        JSON.stringify(source.output_definition_json),
        id,
      ],
    );
    const vectors = (await pool.query("select * from hr_statutory_rule_test_vector where rule_version_id=$1", [id]))
      .rows;
    for (const v of vectors) {
      const inputs = v.canonical_inputs_json;
      let amount = Money.parse(inputs.GROSS).multiply(Money.parse(configuration.constants.RATE));
      if (configuration.context_basis)
        amount = amount.multiply(Money.parse(inputs.CONTEXT_DAYS)).divide(Money.parse(inputs.EARNED_PERIOD_DAYS));
      await pool.query(
        `insert into hr_statutory_rule_test_vector(id,rule_version_id,pack_version_id,scenario_key,vector_kind,canonical_inputs_json,expected_outputs_json,rounding_expectations_json,source_reference,reviewer_id,reviewed_at,content_hash)values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,'synthetic context specification only','r06.checker',now(),$9)`,
        [
          randomUUID(),
          next,
          source.pack_version_id,
          v.scenario_key,
          v.vector_kind,
          JSON.stringify(inputs),
          JSON.stringify({ applicable: inputs.GROSS !== "0", amount: amount.decimal(2) }),
          JSON.stringify(v.rounding_expectations_json),
          attendanceHash({ next, inputs }),
        ],
      );
    }
  }
}
export async function approveContextDeclarations(
  f: Awaited<ReturnType<typeof createStatutoryFixture>>,
  nextCredit = "310",
) {
  let previous: string | null = null;
  for (const [effective, credit] of [
    [f.month, "0"],
    [f.month.slice(0, 8) + "15", nextCredit],
  ]) {
    const terms = {
      kind: "declaration",
      employee_id: f.person.employeeId,
      jurisdiction_id: f.jurisdiction,
      tax_year: Number(f.month.slice(0, 4)),
      supersedes_declaration_id: previous,
      effective_from: effective,
      currency_code: "PKR",
      estimated_annual_salary: "372000",
      prior_taxable_salary: "0",
      prior_salary_tax_withheld: "0",
      documented_tax_credit: credit,
      other_tax_withheld: "0",
      eobi_applicability: "not_applicable",
      provincial_social_security_status: "assessed_not_applicable",
    };
    const created = await f.repo.createPayrollLocalization(
      runActor(),
      createHrLocalizationSchema.parse({
        company_id: f.companyId,
        terms,
        source_reference: "Synthetic context acceptance specification; no legal rate",
        reason: "Reviewed statutory declaration context fixture",
      }),
      randomUUID(),
      "statutory-context-test",
    );
    for (const action of ["submit", "approve"] as const) {
      const row = (
        await f.repo.getPayrollLocalization(runActor(), {
          company_id: f.companyId,
          kind: "declaration",
          on_date: effective!,
          search: "",
          limit: 50,
          offset: 0,
        })
      ).items.find((r) => r.id === created.id)!;
      await f.repo.decidePayrollLocalization(
        runActor(action === "approve" ? "r06.checker" : "r06.maker"),
        row.id,
        {
          company_id: f.companyId,
          action,
          expected_version: row.version,
          source_hash: row.source_hash,
          reason: "Independently approved synthetic statutory declaration",
          confirm_override: false,
        },
        randomUUID(),
        "statutory-context-test",
      );
    }
    previous = created.id;
  }
}
