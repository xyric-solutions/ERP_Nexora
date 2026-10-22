import type { BeforePayrollAttendanceClose } from "./hr-payroll-run-fixture.js";
import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import {
  createHrLocalizationSchema,
  createHrPayrollRecordSchema,
  type HrStatutoryPackTerms,
  type HrLocalizationTerms,
} from "../../packages/contracts/src/hr/index.js";
import { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import { statutoryBundleIdentity } from "../../server/api/src/modules/hr/payroll-statutory-bundle.js";
import { createPayrollRunFixture, runActor, runPermissions } from "./hr-payroll-run-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
export const publisherActor = (id = "r06.maker") => runActor(id, [...runPermissions, "platform.localization.activate"]);
/** Isolated arithmetic fixtures only. Production classification tests exercise policy gates; these are not legal rates. */
export function syntheticStatutoryBundle(jurisdiction = "pk-national", from = "2026-10-01"): HrStatutoryPackTerms {
  return {
    kind: "pack_release",
    schema_version: 1,
    execution_contract: "safe_formula_v1",
    classification: "synthetic",
    key: "fixture_" + randomUUID().replaceAll("-", ""),
    name: "Isolated arithmetic acceptance fixture only",
    semantic_version: "1.0.0",
    country_code: "PK",
    jurisdiction_id: jurisdiction,
    effective_from: from,
    effective_to: null,
    sources: [
      {
        id: "fixture",
        reference: "urn:test:arithmetic-specification-not-statutory-rates",
        document_hash: "a".repeat(64),
      },
    ],
    rules: [
      {
        key: "test_deduction",
        category: "fixture",
        name: "Arithmetic acceptance deduction only",
        rule_type: "safe_formula",
        configuration: {
          schema_version: 1,
          currency_code: "PKR",
          money_scale: 2,
          rounding_mode: "half_up",
          formula: "GROSS * RATE",
          constants: { RATE: "0.1" },
        },
        applicability: { schema_version: 1, all: [{ variable: "GROSS", operator: "gt", value: "0" }] },
        output: {
          schema_version: 1,
          line_code: "SYN_TAX",
          line_name: "Arithmetic fixture only",
          line_kind: "deduction",
          component_code: "SYN_TAX",
        },
        vectors: [
          ["positive", "100", "10"],
          ["boundary", "0.05", "0.01"],
          ["non_applicable", "0", "0"],
        ].map(([kind, gross, amount]) => ({
          key: kind!,
          kind: kind as "positive" | "boundary" | "non_applicable",
          inputs: { GROSS: gross! },
          expected: { applicable: kind !== "non_applicable", amount: amount! },
          rounding: { money_scale: 2, rounding_mode: "half_up" },
          source_id: "fixture",
        })),
      },
    ],
  };
}
export async function createPublisherFixture(pool: DatabasePool, beforeAttendanceClose?: BeforePayrollAttendanceClose) {
  const f = await createPayrollRunFixture(pool, [], { beforeAttendanceClose }),
    repo = new SourceHrRepository(pool),
    jurisdiction = "pub-region-" + randomUUID();
  await pool.query(
    `insert into jurisdiction(id,country_code,parent_id,code,name,level,kind,status,valid_from,source_version) values($1,'PK','pk-national',$1,'Isolated publisher test region','subnational','other','active',$2,'synthetic fixture; no legal meaning')`,
    [jurisdiction, f.month],
  );
  const bundle = syntheticStatutoryBundle(jurisdiction, f.month);
  const query = (kind: HrLocalizationTerms["kind"]) => ({
    company_id: f.companyId,
    kind,
    on_date: f.month,
    search: "",
    limit: 50,
    offset: 0,
  });
  const create = async (terms: HrLocalizationTerms) =>
    repo.createPayrollLocalization(
      publisherActor(),
      createHrLocalizationSchema.parse({
        company_id: f.companyId,
        terms,
        source_reference: "Reviewed isolated test specification",
        reason: "Controlled publisher acceptance fixture",
      }),
      randomUUID(),
      "publisher-test",
    );
  const row = async (kind: HrLocalizationTerms["kind"], id: string) =>
    (await repo.getPayrollLocalization(publisherActor(), query(kind))).items.find((r) => r.id === id)!;
  const act = async (
    kind: HrLocalizationTerms["kind"],
    id: string,
    action: "submit" | "approve" | "reject",
    who = "r06.maker",
  ) => {
    const before = await row(kind, id);
    return repo.decidePayrollLocalization(
      publisherActor(who),
      id,
      {
        company_id: f.companyId,
        action,
        expected_version: before.version,
        source_hash: before.source_hash,
        reason: "Independent isolated publisher review",
        confirm_override: false,
      },
      randomUUID(),
      "publisher-test",
    );
  };
  const approve = async (terms: HrLocalizationTerms) => {
    const made = await create(terms);
    await act(terms.kind, made.id, "submit");
    await act(terms.kind, made.id, "approve", "r06.checker");
    return made.id;
  };
  const proposal = async (b = bundle) => {
    const id = await approve(b);
    return {
      tenant,
      company: f.companyId,
      requestId: id,
      artifactHash: statutoryBundleIdentity(tenant, b).artifact_hash,
    };
  };
  const prepareCompany = async (workJurisdiction = jurisdiction) => {
    const profile = await approve({
      kind: "legal_profile",
      country_code: "PK",
      jurisdiction_id: jurisdiction,
      legal_entity_type_id: "pk-company",
      effective_from: f.month,
      effective_to: null,
    });
    await approve({
      kind: "payroll_configuration",
      currency_code: "PKR",
      payroll_frequency: "monthly",
      effective_from: f.month,
      effective_to: null,
    });
    await approve({
      kind: "work_location",
      country_code: "PK",
      jurisdiction_id: workJurisdiction,
      work_location_id: f.masters.work_location!,
      effective_from: f.month,
      effective_to: null,
    });
    await repo.createPayrollRecord(
      publisherActor(),
      createHrPayrollRecordSchema.parse({
        kind: "component",
        company_id: f.companyId,
        code: "SYN_TAX",
        name: "Arithmetic test fixture deduction",
        component_kind: "deduction",
        method: "fixed",
        formula: null,
        taxable: false,
        prorated: false,
        account_id: f.liability,
        position: 2,
        reason: "Isolated statutory output mapping",
      }),
      randomUUID(),
      "publisher-test",
    );
    return profile;
  };
  return { ...f, repo, bundle, jurisdiction, query, create, row, act, approve, proposal, prepareCompany };
}
