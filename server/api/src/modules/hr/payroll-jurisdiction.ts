import type { PoolClient } from "pg";
import { PayrollCalculationError } from "./payroll-calculation.js";
type Row = Record<string, unknown>;
const fail: (message: string) => never = (message) => {
  throw new PayrollCalculationError(message);
};
export function jurisdictionChain(rows: Row[], id: unknown) {
  const chain = new Set<unknown>();
  let next = id;
  while (next) {
    if (chain.has(next)) fail("Cyclic statutory jurisdiction context.");
    chain.add(next);
    const row = rows.find((j) => j.id === next);
    if (!row) fail("Incomplete statutory jurisdiction context.");
    next = row.parent_id;
  }
  return chain;
}
/** An approved category override selects a jurisdiction chain, never a tax rate or implicit regional precedence. */
export function selectScopedStatutoryRules(
  packs: Row[],
  rules: Row[],
  overrides: Row[],
  rows: Row[],
  legal: unknown,
  work: unknown,
  context: Row,
) {
  const legalChain = jurisdictionChain(rows, legal),
    workChain = jurisdictionChain(rows, work),
    comparable = legalChain.has(work) || workChain.has(legal),
    defaults = new Set([...legalChain, ...workChain]);
  const byScope = new Map<string, Row>();
  for (const o of overrides) {
    const scope = String(o.rule_scope);
    if (byScope.has(scope)) fail("Overlapping approved employee jurisdiction overrides are ambiguous.");
    byScope.set(scope, o);
  }
  const scopes = [...new Set(rules.map((r) => String(r.rule_scope)))].sort(),
    resolutions: Row[] = [];
  for (const scope of byScope.keys())
    if (!scopes.includes(scope))
      fail("An approved jurisdiction override has no activated published rule category: " + scope);
  for (const scope of scopes) {
    const o = byScope.get(scope);
    if (!o && !comparable)
      fail(
        "Different legal/work jurisdiction branches require an approved override for every published rule category: " +
          scope,
      );
    const chain = o ? jurisdictionChain(rows, o.jurisdiction_id) : defaults;
    resolutions.push({
      ...context,
      rule_scope: scope,
      jurisdiction_id: o?.jurisdiction_id ?? work,
      jurisdiction_chain: [...chain].map(String).sort(),
      override_id: o?.id ?? null,
    });
  }
  const selected = rules.filter((r) => {
    const p = packs.find((p) => p.pack_version_id === r.pack_version_id);
    if (!p) fail("A scoped statutory rule has no retained pack.");
    const resolution = resolutions.find((s) => s.rule_scope === r.rule_scope)!;
    return (resolution.jurisdiction_chain as string[]).includes(String(p!.target_jurisdiction_id));
  });
  for (const scope of scopes)
    if (!selected.some((r) => r.rule_scope === scope))
      fail("Activate a published rule in the selected jurisdiction chain for category: " + scope);
  return {
    rules: selected,
    packs: packs.filter((p) => selected.some((r) => r.pack_version_id === p.pack_version_id)),
    resolutions,
  };
}
export async function resolvePayrollJurisdiction(
  client: PoolClient,
  tenant: string,
  company: string,
  employee: string,
  from: string,
  to: string,
  assignment: Row,
  profile: Row,
  location: Row,
  subnationalMode: unknown,
) {
  const overrides = (
    await client.query(
      `select id,tenant_id,company_id,employee_id,employee_assignment_id,rule_scope,country_code,jurisdiction_id,legal_basis,reason,evidence_reference,effective_from::text,effective_to::text,state,requested_by,approved_by,approved_at::text from hr_employee_jurisdiction_override where tenant_id=$1 and company_id=$2 and employee_id=$3 and state='approved' and effective_from<=$5::date and(effective_to is null or effective_to>=$4::date) order by rule_scope,id collate "C" limit 51 for share`,
      [tenant, company, employee, from, to],
    )
  ).rows as Row[];
  if (overrides.length > 50) fail("An employee statutory context supports at most 50 approved category overrides.");
  for (const o of overrides)
    if (
      o.employee_assignment_id !== assignment.id ||
      o.country_code !== profile.country_code ||
      String(o.effective_from) > from ||
      (o.effective_to && String(o.effective_to) < to) ||
      !o.approved_by ||
      !o.approved_at ||
      o.approved_by === o.requested_by ||
      !o.legal_basis ||
      !o.evidence_reference
    )
      fail(
        "An approved jurisdiction override must cover this exact employee placement, category and earned context with independent legal evidence.",
      );
  const jurisdictions = (
    await client.query(
      `with recursive chain as(select id,parent_id,level,country_code,status,valid_from,valid_to,array[id] as path from jurisdiction where id=any($1::text[]) union all select j.id,j.parent_id,j.level,j.country_code,j.status,j.valid_from,j.valid_to,c.path||j.id from jurisdiction j join chain c on j.id=c.parent_id where not j.id=any(c.path))select distinct id,parent_id,level,country_code,status,valid_from::text,valid_to::text from chain limit 257`,
      [[profile.registered_jurisdiction_id, location.jurisdiction_id, ...overrides.map((o) => o.jurisdiction_id)]],
    )
  ).rows as Row[];
  if (
    !jurisdictions.length ||
    jurisdictions.length > 256 ||
    jurisdictions.some(
      (j) =>
        j.country_code !== profile.country_code ||
        j.status !== "active" ||
        String(j.valid_from) > from ||
        (j.valid_to && String(j.valid_to) < to),
    )
  )
    fail("The legal, work and override jurisdiction chains must be bounded, active and effective in the same country.");
  jurisdictionChain(jurisdictions, profile.registered_jurisdiction_id);
  const work = jurisdictionChain(jurisdictions, location.jurisdiction_id);
  for (const o of overrides) jurisdictionChain(jurisdictions, o.jurisdiction_id);
  if (subnationalMode === "required" && !jurisdictions.some((j) => work.has(j.id) && j.level === "subnational"))
    fail("This country requires a reviewed subnational work-location jurisdiction.");
  return {
    jurisdictions,
    overrides,
    select: (packs: Row[], rules: Row[]) =>
      selectScopedStatutoryRules(
        packs,
        rules,
        overrides,
        jurisdictions,
        profile.registered_jurisdiction_id,
        location.jurisdiction_id,
        {
          effective_from: from,
          effective_to: to,
          employee_assignment_id: assignment.id,
          legal_profile_id: profile.id,
          work_location_profile_id: location.id,
        },
      ),
  };
}
