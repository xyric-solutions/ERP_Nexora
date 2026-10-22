import { countryScope } from "./hr-settlement-country-fixture.js";
import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { createBenefitFixture } from "./hr-benefit-fixture.js";
import { createEncashmentFixture } from "./hr-encashment-fixture.js";
import { attachSalaryBenefit, salaryBenefitPermissions } from "./hr-salary-benefit-fixture.js";
import { attachSalaryEncashment, salaryEncashmentPermissions } from "./hr-salary-encashment-fixture.js";
import { journalPermissions } from "./hr-payroll-journal-fixture.js";
import { lifecycleActor } from "./hr-lifecycle-case-fixture.js";
import { hrLifecycleCaseWorkspaceSchema, type HrLifecycleCaseAction } from "../../packages/contracts/src/hr/index.js";
export const supplementPermissions = [
  ...new Set([...salaryBenefitPermissions, ...salaryEncashmentPermissions, ...journalPermissions]),
];
export const supplementActor = (who = "r06.maker") => lifecycleActor(who, supplementPermissions);
export async function grantSupplementAuthority(pool: DatabasePool, company: string) {
  for (const role of ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"])
    for (const key of supplementPermissions) {
      if (!(await pool.query("select 1 from security_permission_definition where permission_key=$1", [key])).rowCount)
        continue;
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
        [tenant, role, key],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
        [tenant, role, key, company],
      );
    }
}
export async function createSupplementFixture(pool: DatabasePool, encashment = false, countryScoped = false) {
  let benefit: Awaited<ReturnType<typeof createBenefitFixture>>,
    encash: Awaited<ReturnType<typeof createEncashmentFixture>>,
    f: Awaited<ReturnType<typeof attachSalaryBenefit>> | Awaited<ReturnType<typeof attachSalaryEncashment>>;
  const prod = await createProductionJournalFixture(
    pool,
    async (p) => {
      f = encashment
        ? await attachSalaryEncashment(pool, encash!, p.component.id)
        : await attachSalaryBenefit(
            pool,
            benefit!,
            p.component.id,
            countryScoped ? { legal_scope: countryScope("work_location", p.jurisdiction) } : {},
          );
      await grantSupplementAuthority(pool, f.companyId);
      await f.decideSalary("submit_rule");
      await f.decideSalary("approve_rule", "r06.checker");
      await f.addSalary();
      await f.salaryCaseAction("submit");
      await f.salaryCaseAction("approve", "r06.checker");
      await f.repo.actOnLifecycleCase(
        supplementActor(),
        {
          action: "prepare_payroll",
          company_id: f.companyId,
          id: f.statement.id,
          expected_version: (await f.salaryRow()).version,
          month: p.month,
          unprocessed_entitlements_only: true,
          mappings: [
            { line_index: 0, component_id: null, exclusion_reason: "Reviewed zero-value reference only" },
            { line_index: 1, component_id: p.component.id, exclusion_reason: "" },
          ],
          reason: "Original settlement input independently processed before supplement",
        },
        randomUUID(),
        "supplement-fixture",
      );
      const id = (
        await pool.query(
          "select adjustment_id from hr_settlement_payroll_link where tenant_id=$1 and case_id=$2 and line_index=1",
          [tenant, f.statement.id],
        )
      ).rows[0].adjustment_id;
      for (const action of ["submit", "approve"] as const) {
        const who = action === "approve" ? "r06.checker" : "r06.maker",
          w = await f.repo.getPayrollWorkspace(supplementActor(who), {
            company_id: f.companyId,
            month: p.month,
            section: "adjustments",
            search: "",
            limit: 25,
            offset: 0,
          }),
          r = w.items.find((x) => x.id === id)!;
        await f.repo.actOnPayrollRecord(
          supplementActor(who),
          id,
          {
            company_id: f.companyId,
            section: "adjustments",
            action,
            expected_version: r.version,
            source_hash: r.source_hash,
            confirm_override: false,
            reason: "Independent original settlement Payroll input review",
          },
          randomUUID(),
          "supplement-fixture",
        );
      }
    },
    async (p) => {
      if (encashment) encash = await createEncashmentFixture(pool, { fixture: p, person: p.person });
      else benefit = await createBenefitFixture(pool, { fixture: p, person: p.person });
    },
  );
  await grantSupplementAuthority(pool, prod.companyId);
  await prod.journalAction("prepare");
  await prod.journalAction("accept", "r06.checker");
  await prod.journalAction("post", "r06.target");
  const ready = f!;
  const row = async (who = "r06.maker") =>
    hrLifecycleCaseWorkspaceSchema
      .parse(
        await ready.repo.getLifecycleCaseWorkspace(supplementActor(who), {
          company_id: ready.companyId,
          section: "settlement",
          search: "",
          limit: 25,
          offset: 0,
        }),
      )
      .items.find((x) => x.id === ready.statement.id)!;
  const act = (input: HrLifecycleCaseAction, who = "r06.maker", key = randomUUID()) =>
    ready.repo.actOnLifecycleCase(supplementActor(who), input, key, "supplement-test");
  const propose = async (amount: string, days?: string) => {
    const r = await row();
    return act({
      action: "request_financial_correction",
      company_id: ready.companyId,
      id: r.id,
      expected_version: r.version,
      correction_source_hash: r.financial_corrections!.source_hash,
      corrections:
        r.terms.kind === "settlement"
          ? r.terms.lines.map((line, index) => ({
              line_index: index,
              corrected_minor:
                index === 1
                  ? amount
                  : (r.financial_corrections!.base_lines.find((x) => x.line_index === index)?.amount_minor ??
                    line.amount_minor),
              ...(index === 1 && days !== undefined ? { corrected_leave_days: days } : {}),
            }))
          : [],
      authority_reference: "Synthetic signed retained policy and corrective calculation reference",
      reason: "Review a compensating amount and preserve the original Payroll evidence",
    });
  };
  const review = async (decision: "approve" | "reject" = "approve", who = "r06.checker") => {
    const r = await row(who),
      pending = r.financial_corrections!.records.find((x) => x.state === "submitted")!;
    return act(
      {
        action: "decide_financial_correction",
        company_id: ready.companyId,
        id: r.id,
        expected_version: r.version,
        correction_id: pending.id,
        decision,
        reason: "Independent review of exact money and leave differences",
      },
      who,
    );
  };
  const calculate = async (who = "r06.maker") => {
    const r = await row(who),
      pending = r.financial_corrections!.records.find((x) => x.state === "approved")!;
    return act(
      {
        action: "calculate_payroll_correction",
        company_id: ready.companyId,
        id: r.id,
        expected_version: r.version,
        correction_id: pending.id,
        correction_source_hash: r.financial_corrections!.source_hash,
        posting_date: ready.today,
        taxable_lines: [1],
        tax_treatment_reviewed: true,
        reason: "Reviewed retained earned-month tax treatment for supplemental Payroll",
      },
      who,
    );
  };
  const execute = async (
    action: "approve_payroll_correction" | "reject_payroll_correction" | "post_payroll_correction",
    who = "r06.checker",
    key = randomUUID(),
  ) => {
    const r = await row(who),
      execution = r.financial_corrections!.executions[0]!;
    const input: HrLifecycleCaseAction = {
      action,
      company_id: ready.companyId,
      id: r.id,
      expected_version: r.version,
      execution_id: execution.id,
      execution_version: execution.version,
      execution_source_hash: execution.source_hash,
      reason: "Independent supplemental Payroll approval or actual Finance posting",
    };
    return { input, result: await act(input, who, key) };
  };
  return { ...ready, prod, row, act, propose, review, calculate, execute };
}
