import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createSalaryBenefitFixture, attachSalaryBenefit } from "./hr-salary-benefit-fixture.js";
import { runActor } from "./hr-payroll-run-fixture.js";
import {
  createHrLocalizationSchema,
  type HrLocalizationTerms,
  type HrSettlementCountryScope,
} from "../../packages/contracts/src/hr/index.js";
type F = Pick<
  Awaited<ReturnType<typeof createSalaryBenefitFixture>>,
  "repo" | "companyId" | "pay" | "masters" | "today"
>;
export const countryScope = (
  basis: HrSettlementCountryScope["basis"] = "legal_employer",
  jurisdiction_id: string | null = null,
  country_code = "PK",
): HrSettlementCountryScope => ({
  country_code,
  jurisdiction_id,
  basis,
  authority_reference: "Synthetic reviewed company policy authority; not a statutory rate",
});
export async function createCountryRegion(pool: DatabasePool, month: string) {
  const id = "settlement-region-" + randomUUID();
  await pool.query(
    "insert into jurisdiction(id,country_code,parent_id,code,name,level,kind,status,valid_from,source_version) values($1,'PK','pk-national',$1,'Synthetic settlement region','subnational','other','active',$2,'synthetic settlement acceptance fixture')",
    [id, month],
  );
  return id;
}
export async function approveSettlementProfile(
  f: F,
  basis: HrSettlementCountryScope["basis"] = "legal_employer",
  jurisdiction = "pk-national",
) {
  const terms: HrLocalizationTerms =
    basis === "legal_employer"
      ? {
          kind: "legal_profile",
          country_code: "PK",
          jurisdiction_id: jurisdiction,
          legal_entity_type_id: "pk-company",
          effective_from: f.pay.month,
          effective_to: null,
        }
      : {
          kind: "work_location",
          country_code: "PK",
          work_location_id: f.masters.work_location!,
          jurisdiction_id: jurisdiction,
          effective_from: f.pay.month,
          effective_to: null,
        };
  const created = await f.repo.createPayrollLocalization(
    runActor(),
    createHrLocalizationSchema.parse({
      company_id: f.companyId,
      terms,
      source_reference: "Synthetic company profile for country settlement acceptance",
      reason: "Reviewed effective country profile for synthetic settlement workflow",
    }),
    randomUUID(),
    "country-test",
  );
  for (const [action, who] of [
    ["submit", "r06.maker"],
    ["approve", "r06.checker"],
  ] as const) {
    const w = await f.repo.getPayrollLocalization(runActor(who), {
        company_id: f.companyId,
        kind: terms.kind,
        on_date: f.today,
        search: "",
        limit: 25,
        offset: 0,
      }),
      r = w.items.find((x) => x.id === created.id)!;
    await f.repo.decidePayrollLocalization(
      runActor(who),
      created.id,
      {
        company_id: f.companyId,
        action,
        expected_version: r.version,
        source_hash: r.source_hash,
        reason: "Independent approval of synthetic effective country profile",
        confirm_override: false,
      },
      randomUUID(),
      "country-test",
    );
  }
  return created.id;
}
export async function createCountryBenefit(
  pool: DatabasePool,
  f: Awaited<ReturnType<typeof createSalaryBenefitFixture>>,
  scope: HrSettlementCountryScope,
) {
  const g = await attachSalaryBenefit(pool, f, f.pay.component.id, { legal_scope: scope });
  await g.decideSalary("submit_rule");
  await g.decideSalary("approve_rule", "r06.checker");
  return g;
}
