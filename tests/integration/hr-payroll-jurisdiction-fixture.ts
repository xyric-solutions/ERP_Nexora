import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import type { HrPayrollRunAction, HrLocalizationTerms } from "../../packages/contracts/src/hr/index.js";
import { createPublisherFixture, publisherActor } from "./hr-payroll-publisher-fixture.js";
import { publishApprovedStatutoryPack } from "../../server/api/src/modules/hr/payroll-statutory-publisher.js";
import { ExactPayrollAmount as Money } from "../../server/api/src/modules/hr/payroll-calculation.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
export async function grantJurisdictionFixtureAuthority(pool: DatabasePool, company: string) {
  for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker"])
    for (const permission of [
      "hr.payroll.setup.read",
      "hr.payroll.salary.read",
      "hr.payroll.salary.manage",
      "hr.payroll.salary.approve",
    ]) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)values($1,$2,$3,'all')on conflict do nothing",
        [tenant, policy, permission],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)values($1,$2,$3,'company',$4)on conflict do nothing",
        [tenant, policy, permission, company],
      );
    }
}
/** Production executor and independently published artificial packs. No jurisdiction rates are asserted. */
export async function createJurisdictionFixture(pool: DatabasePool, context = false, crossBranch = false) {
  const f = await createPublisherFixture(pool),
    other = "override-region-" + randomUUID();
  await grantJurisdictionFixtureAuthority(pool, f.companyId);
  await pool.query(
    "insert into jurisdiction(id,country_code,parent_id,code,name,level,kind,status,valid_from,source_version)values($1,'PK','pk-national',$1,'Isolated override region','subnational','other','active',$2,'artificial arithmetic specification')",
    [other, f.month],
  );
  const profile = await f.prepareCompany(crossBranch ? other : f.jurisdiction);
  const addPack = async (jurisdiction: string, rate: string, scope = "fixture", informational = false) => {
    const b = structuredClone(f.bundle);
    b.key = "jurisdiction_" + randomUUID().replaceAll("-", "");
    b.jurisdiction_id = jurisdiction;
    b.classification = "production";
    for (const r of b.rules) {
      r.category = scope;
      r.configuration.constants.RATE = rate;
      if (informational) {
        r.output.line_kind = "informational";
        r.output.component_code = null;
      }
      if (context) r.configuration.context_basis = "calendar_weighted_monthly";
      for (const v of r.vectors) {
        if (context)
          v.inputs = {
            GROSS: v.kind === "positive" ? "100" : v.kind === "boundary" ? "1" : "0",
            CONTEXT_DAYS: v.kind === "positive" ? "31" : "15",
            EARNED_PERIOD_DAYS: "31",
          };
        let amount = Money.parse(v.inputs.GROSS!).multiply(Money.parse(rate));
        if (context)
          amount = amount
            .multiply(Money.parse(v.inputs.CONTEXT_DAYS!))
            .divide(Money.parse(v.inputs.EARNED_PERIOD_DAYS!));
        v.expected = { applicable: v.kind !== "non_applicable", amount: amount.decimal(2) };
      }
    }
    const published = await publishApprovedStatutoryPack(pool, await f.proposal(b));
    await f.approve({
      kind: "activation",
      legal_profile_id: profile,
      jurisdiction_id: jurisdiction,
      pack_version_id: published.pack_version_id,
      effective_from: f.month,
      effective_to: null,
    });
    return published;
  };
  await addPack(f.jurisdiction, "0.1");
  await addPack(other, "0.2");
  const query = { company_id: f.companyId, month: f.month };
  const run = async (
    action: HrPayrollRunAction["action"],
    extra: Partial<HrPayrollRunAction> = {},
    who = "r06.maker",
  ) => {
    const w = await f.repo.getPayrollRunWorkspace(publisherActor(who), query);
    return f.repo.actOnPayrollRun(
      publisherActor(who),
      {
        ...query,
        action,
        reason: "Isolated reviewed scoped jurisdiction calculation",
        source_hash: w.source_hash,
        expected_version: w.period?.version ?? 0,
        confirm_override: false,
        ...extra,
      },
      randomUUID(),
      "jurisdiction-test",
    );
  };
  await run("policy", {
    currency_code: "PKR",
    money_scale: 2,
    rounding_mode: "half_up",
    net_payable_account_id: f.liability,
  });
  await run("open", { policy_id: (await f.repo.getPayrollRunWorkspace(publisherActor(), query)).policies[0]!.id });
  const terms: Extract<HrLocalizationTerms, { kind: "jurisdiction_override" }> = {
    kind: "jurisdiction_override",
    employee_id: f.person.employeeId,
    employee_assignment_id: f.person.assignmentId,
    rule_scope: "fixture",
    country_code: "PK",
    jurisdiction_id: other,
    legal_basis: "Artificial independently reviewed category-jurisdiction specification; no legal rate",
    evidence_reference: "urn:test:jurisdiction-override",
    effective_from: f.month,
    effective_to: null,
  };
  const revoke = async (id: string) => {
    const o = (
      await pool.query(
        "select effective_from::text,effective_to::text from hr_employee_jurisdiction_override where tenant_id=$1 and id=$2",
        [tenant, id],
      )
    ).rows[0];
    return f.approve({
      kind: "jurisdiction_override_revocation",
      override_id: id,
      effective_from: o.effective_from,
      effective_to: o.effective_to,
    });
  };
  const evidence = async () =>
    (
      await pool.query(
        "select r.id,r.execution_evidence,s.id as snapshot_id,s.override_evidence_json from hr_payroll_result r join hr_payroll_statutory_snapshot s on s.tenant_id=r.tenant_id and s.payroll_result_id=r.id where r.tenant_id=$1 and r.company_id=$2 order by r.run_number desc limit 1",
        [tenant, f.companyId],
      )
    ).rows[0];
  return { ...f, profile, other, addPack, query, run, terms, revoke, evidence };
}
