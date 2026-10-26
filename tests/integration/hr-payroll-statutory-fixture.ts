import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import type { HrPayrollRunAction } from "../../packages/contracts/src/hr/index.js";
import { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import { attendanceHash } from "../../server/api/src/modules/hr/attendance-completion.js";
import { createPayrollRunFixture, runActor } from "./hr-payroll-run-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
export async function createStatutoryFixture(
  pool: DatabasePool,
  options: {
    badVector?: boolean;
    release?: boolean;
    component?: boolean;
    formula?: string;
    contextBasis?: boolean;
    taxYear?: number;
    beforeAttendanceClose?: import("./hr-payroll-run-fixture.js").BeforePayrollAttendanceClose;
    beforePackReview?: (info: {
      fixture: Awaited<ReturnType<typeof createPayrollRunFixture>>;
      version: string;
      rules: string[];
      jurisdiction: string;
    }) => Promise<void>;
  } = {},
) {
  const f = await createPayrollRunFixture(pool, [], { beforeAttendanceClose: options.beforeAttendanceClose }),
    id = () => randomUUID(),
    profile = id(),
    configuration = id(),
    location = id(),
    pack = id(),
    version = id(),
    artifact = attendanceHash({ id: id(), classification: "synthetic" });
  const ref = (
    await pool.query(
      "select j.id as jurisdiction,e.id as entity from jurisdiction j join legal_entity_type e on e.country_code=j.country_code and e.status='active' where j.country_code='PK' and j.level='national' and j.status='active' order by e.id limit 1",
    )
  ).rows[0];
  if (!ref) throw Error("Localization reference fixtures are required");
  const syntheticRegion = "syn-region-" + id();
  await pool.query(
    `insert into jurisdiction(id,country_code,parent_id,code,name,level,kind,status,valid_from,source_version) values($1,'PK',$2,$1,'Synthetic test region only','subnational','other','active',$3,'synthetic acceptance fixture; no legal meaning')`,
    [syntheticRegion, ref.jurisdiction, f.month],
  );
  ref.jurisdiction = syntheticRegion;

  await pool.query(
    `insert into company_legal_profile(id,tenant_id,company_id,country_code,registered_jurisdiction_id,legal_entity_type_id,effective_from,state,created_by,submitted_by,submitted_at,approved_by,approved_at) values($1,$2,$3,'PK',$4,$5,$6,'approved','r06.maker','r06.maker',now(),'r06.checker',now())`,
    [profile, tenant, f.companyId, ref.jurisdiction, ref.entity, f.month],
  );
  await pool.query(
    `insert into company_payroll_configuration(id,tenant_id,company_id,payroll_currency,payroll_frequency,effective_from,status) values($1,$2,$3,'PKR','monthly',$4,'active')`,
    [configuration, tenant, f.companyId, f.month],
  );
  await pool.query(
    `insert into hr_work_location_profile(id,tenant_id,company_id,work_location_id,country_code,jurisdiction_id,effective_from,state,created_by,submitted_by,submitted_at,approved_by,approved_at) values($1,$2,$3,$4,'PK',$5,$6,'approved','r06.maker','r06.maker',now(),'r06.checker',now())`,
    [location, tenant, f.companyId, f.masters.work_location, ref.jurisdiction, f.month],
  );
  const components: string[] = [],
    rules: string[] = [];
  await pool.query(
    `insert into localization_pack(id,pack_key,domain,country_code,target_jurisdiction_id,publisher_scope,publisher_tenant_id,owner_reference,status) values($1,$1,'hr_payroll','PK',$2,'tenant',$3,'synthetic integration test only','active')`,
    [pack, ref.jurisdiction, tenant],
  );
  await pool.query(
    `insert into localization_pack_version(id,pack_id,semantic_version,effective_from,status,source_manifest_hash,content_hash,artifact_hash) values($1,$2,'1.0.0',$3,'draft',$4,$4,$4)`,
    [version, pack, f.month, artifact],
  );
  for (const [kind, code, rate] of [
    ["deduction", "SYN_TAX", "0.1"],
    ["employer_contribution", "SYN_EMP", "0.05"],
  ]) {
    const component = id(),
      rule = id(),
      rv = id();
    components.push(component);
    rules.push(rv);
    if (options.component !== false)
      await pool.query(
        `insert into hr_pay_component(id,tenant_id,company_id,code,name,kind,method,taxable,prorated,expense_account_id,liability_account_id,position,status,created_by) values($1,$2,$3,$4,$4,$5,'fixed',false,false,$6,$7,10,'active','r06.maker')`,
        [component, tenant, f.companyId, code, kind, kind === "employer_contribution" ? f.expense : null, f.liability],
      );
    await pool.query(
      `insert into hr_statutory_rule(id,pack_id,rule_key,category,name) values($1,$2,$3,$3,'Synthetic acceptance rule only')`,
      [rule, pack, code],
    );
    const config = {
        schema_version: 1,
        ...(options.contextBasis ? { context_basis: "calendar_weighted_monthly" } : {}),
        ...(options.taxYear ? { tax_year: options.taxYear } : {}),
        currency_code: "PKR",
        money_scale: 2,
        rounding_mode: "half_up",
        formula: options.formula ?? "GROSS * RATE",
        constants: { RATE: rate },
      },
      applicability = { schema_version: 1, all: [{ variable: "GROSS", operator: "gt", value: "0" }] },
      output = {
        schema_version: 1,
        line_code: code,
        line_name: "Synthetic acceptance only",
        line_kind: kind,
        component_code: code,
      };
    await pool.query(
      `insert into hr_statutory_rule_version(id,rule_id,pack_version_id,effective_from,rule_type,applicability_json,configuration_json,stacking_operation,source_references_json,content_hash,output_definition_json) values($1,$2,$3,$4,'safe_formula',$5::jsonb,$6::jsonb,'additive',$7::jsonb,$8,$9::jsonb)`,
      [
        rv,
        rule,
        version,
        f.month,
        JSON.stringify(applicability),
        JSON.stringify(config),
        JSON.stringify([{ reference: "synthetic test specification; not statutory rates" }]),
        attendanceHash(config),
        JSON.stringify(output),
      ],
    );
    for (const [vk, gross] of [
      ["positive", "100"],
      ["boundary", "1"],
      ["non_applicable", "0"],
    ]) {
      const amount =
        options.badVector && vk === "positive"
          ? "999"
          : String(
              Math.round(
                Number(gross) *
                  (options.formula === "GROSS * 2" ? 2 : Number(rate)) *
                  (options.contextBasis && vk === "boundary" ? 15 / 31 : 1) *
                  100,
              ) / 100,
            );
      await pool.query(
        `insert into hr_statutory_rule_test_vector(id,rule_version_id,pack_version_id,scenario_key,vector_kind,canonical_inputs_json,expected_outputs_json,rounding_expectations_json,source_reference,reviewer_id,reviewed_at,content_hash) values($1,$2,$3,$4,$4,$5::jsonb,$6::jsonb,$7::jsonb,'synthetic acceptance specification','r06.checker',now(),$8)`,
        [
          id(),
          rv,
          version,
          vk,
          JSON.stringify({
            GROSS: gross,
            ...(options.contextBasis
              ? { CONTEXT_DAYS: vk === "boundary" ? "15" : "31", EARNED_PERIOD_DAYS: "31" }
              : {}),
            ...(options.taxYear ? { DOCUMENTED_TAX_CREDIT: "0" } : {}),
          }),
          JSON.stringify({ applicable: vk !== "non_applicable", amount }),
          JSON.stringify({ money_scale: 2, rounding_mode: "half_up" }),
          artifact,
        ],
      );
    }
  }
  if (options.beforePackReview)
    await options.beforePackReview({ fixture: f, version, rules, jurisdiction: ref.jurisdiction });
  await pool.query(
    `update localization_pack_version set status='validated',validated_at=now(),reviewer_id='r06.checker' where id=$1`,
    [version],
  );
  await pool.query(
    `update localization_pack_version set status='approved',approved_at=now(),approver_id='r06.checker' where id=$1`,
    [version],
  );
  if (options.release !== false)
    await pool.query(
      `insert into localization_import_release(artifact_hash,pack_version_id,bundle_schema_version,report_json) values($1,$2,1,$3::jsonb)`,
      [
        artifact,
        version,
        JSON.stringify({ classification: "synthetic", execution_contract: "safe_formula_v1", test_fixture: true }),
      ],
    );
  await pool.query(
    `insert into company_localization_activation(id,tenant_id,company_id,legal_profile_id,target_jurisdiction_id,pack_version_id,effective_from,state,approved_by,approved_at) values($1,$2,$3,$4,$5,$6,$7,'active','r06.checker',now())`,
    [id(), tenant, f.companyId, profile, ref.jurisdiction, version, f.month],
  );
  await f.act("policy", {
    currency_code: "PKR",
    money_scale: 2,
    rounding_mode: "half_up",
    net_payable_account_id: f.liability,
  });
  const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
  await f.act("open", { policy_id: state.policies[0]!.id });
  const repo = new SourceHrRepository(pool, "test");
  const act = async (action: HrPayrollRunAction["action"], who = "r06.maker", key = randomUUID()) => {
    const state = await repo.getPayrollRunWorkspace(runActor(who), f.query);
    return repo.actOnPayrollRun(
      runActor(who),
      {
        ...f.query,
        action,
        reason: "Isolated synthetic statutory acceptance",
        expected_version: state.period!.version,
        source_hash: state.source_hash,
        confirm_override: false,
      },
      key,
      "statutory-test",
    );
  };
  return {
    ...f,
    productionRepo: f.repo,
    repo,
    act,
    profile,
    configuration,
    location,
    pack,
    version,
    components,
    jurisdiction: ref.jurisdiction as string,
    rules,
  };
}
