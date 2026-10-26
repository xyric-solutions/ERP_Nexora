import type { PoolClient } from "pg";
import type { HrLocalizationTerms } from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import { jurisdictionChain } from "./payroll-jurisdiction.js";
export const isJurisdictionSetup = (kind: string) =>
  kind === "jurisdiction_override" || kind === "jurisdiction_override_revocation";
export async function requireJurisdictionSetupAuthority(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  action: "read" | "manage" | "approve",
) {
  for (const key of new Set(["hr.payroll.setup.read", "hr.payroll.salary.read", "hr.payroll.salary." + action]))
    await requireHrCompanyPermission(client, c, company, key);
}
export async function validateJurisdictionSetup(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  t: HrLocalizationTerms,
  mode: "production" | "test",
) {
  const fail = (message: string): never => {
    throw new HrApiError(409, "HR_LOCALIZATION_REVIEW_REQUIRED", message);
  };
  if (t.kind === "jurisdiction_override_revocation") {
    const o = (
      await client.query(
        "select id,effective_from::text,effective_to::text,state from hr_employee_jurisdiction_override where tenant_id=$1 and company_id=$2 and id=$3 for share",
        [c.tenantId, company, t.override_id],
      )
    ).rows[0];
    if (!o || o.state !== "approved" || o.effective_from !== t.effective_from || o.effective_to !== t.effective_to)
      fail("Select a currently approved company override and retain its exact effective range for revocation review.");
    return;
  }
  if (t.kind !== "jurisdiction_override") return;
  const assignment = (
    await client.query(
      `select a.id,a.effective_from::text,a.effective_to::text from employee_assignment a left join hr_employment_relationship er on er.tenant_id=a.tenant_id and er.id=a.employment_relationship_id where a.tenant_id=$1 and a.company_id=$2 and a.employee_id=$3 and a.id=$4 and a.effective_from<=$5::date and (a.effective_to is null or($6::date is not null and a.effective_to>=$6::date)) and(a.assignment_status='legacy_compatibility' or(a.assignment_status in('active','ended') and er.approval_state='approved' and er.status in('active','ended'))) for share of a`,
      [c.tenantId, company, t.employee_id, t.employee_assignment_id, t.effective_from, t.effective_to],
    )
  ).rows[0];
  if (!assignment) fail("Choose this employee’s approved operational placement covering the complete override range.");
  const chain = (
    await client.query(
      `with recursive chain as(select id,parent_id,country_code,status,valid_from,valid_to,array[id] as path from jurisdiction where id=$1 union all select j.id,j.parent_id,j.country_code,j.status,j.valid_from,j.valid_to,c.path||j.id from jurisdiction j join chain c on j.id=c.parent_id where not j.id=any(c.path))select distinct id,parent_id,country_code,status,valid_from::text,valid_to::text from chain limit 257`,
      [t.jurisdiction_id],
    )
  ).rows;
  if (
    !chain.length ||
    chain.length > 256 ||
    chain.some(
      (j) =>
        j.country_code !== t.country_code ||
        j.status !== "active" ||
        j.valid_from > t.effective_from ||
        (j.valid_to && j.valid_to < (t.effective_to ?? t.effective_from)),
    )
  )
    fail("The override needs a complete active same-country jurisdiction chain covering its range.");
  jurisdictionChain(chain, t.jurisdiction_id);
  const available = await client.query(
    `select 1 from company_localization_activation a join company_legal_profile l on l.tenant_id=a.tenant_id and l.company_id=a.company_id and l.id=a.legal_profile_id join localization_pack_version v on v.id=a.pack_version_id join localization_pack p on p.id=v.pack_id join localization_import_release ir on ir.pack_version_id=v.id and ir.artifact_hash=v.artifact_hash join hr_statutory_rule r on r.pack_id=p.id join hr_statutory_rule_version rv on rv.rule_id=r.id and rv.pack_version_id=v.id where a.tenant_id=$1 and a.company_id=$2 and a.state='active' and l.state in('approved','active') and l.country_code=$3 and p.country_code=$3 and p.target_jurisdiction_id=any($4::text[]) and p.status='active' and(p.publisher_scope='system' or p.publisher_tenant_id=$1) and v.status in('approved','active') and r.category=$5 and ir.report_json->>'classification'=any($8::text[]) and ir.report_json->>'execution_contract'='safe_formula_v1' and greatest(a.effective_from,l.effective_from,v.effective_from,rv.effective_from)<=coalesce($7::date,$6::date) and least(coalesce(a.effective_to,'infinity'::date),coalesce(l.effective_to,'infinity'::date),coalesce(v.effective_to,'infinity'::date),coalesce(rv.effective_to,'infinity'::date))>=$6::date and greatest(a.effective_from,l.effective_from,v.effective_from,rv.effective_from)<=least(coalesce(a.effective_to,'infinity'::date),coalesce(l.effective_to,'infinity'::date),coalesce(v.effective_to,'infinity'::date),coalesce(rv.effective_to,'infinity'::date)) having daterange($6::date,coalesce($7::date,$6::date),'[]') <@ range_agg(daterange(greatest(a.effective_from,l.effective_from,v.effective_from,rv.effective_from),least(coalesce(a.effective_to,'infinity'::date),coalesce(l.effective_to,'infinity'::date),coalesce(v.effective_to,'infinity'::date),coalesce(rv.effective_to,'infinity'::date)),'[]'))`,
    [
      c.tenantId,
      company,
      t.country_code,
      chain.map((j) => j.id),
      t.rule_scope,
      t.effective_from,
      t.effective_to,
      mode === "test" ? ["production", "synthetic"] : ["production"],
    ],
  );
  if (!available.rowCount)
    fail(
      "Publish and activate a supported rule in this jurisdiction chain and category before requesting the override.",
    );
  if (
    (
      await client.query(
        `select 1 from hr_employee_jurisdiction_override where tenant_id=$1 and company_id=$2 and employee_id=$3 and rule_scope=$4 and state='approved' and effective_from<=coalesce($6::date,'infinity'::date) and(effective_to is null or effective_to>=$5::date) limit 1`,
        [c.tenantId, company, t.employee_id, t.rule_scope, t.effective_from, t.effective_to],
      )
    ).rowCount
  )
    fail(
      "An approved override already covers this employee/category range. Use a separately reviewed revocation before creating a replacement.",
    );
}
