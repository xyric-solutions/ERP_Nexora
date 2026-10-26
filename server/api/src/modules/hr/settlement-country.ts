import type { PoolClient } from "pg";
import type { HrSettlementCountryEvidence } from "@nexora/contracts";
import type { HrActorContext } from "./source-repository.js";
import { HrApiError } from "./source-repository.js";
// Country proof comes from one tenant-scoped database resolver used by source,
// statement-approval and Payroll-handoff guards as well as API calculations.
type CountryContext = {
  as_of: string;
  basis: HrSettlementCountryEvidence["basis"];
  profiles: Array<{ id: string; country_code: string }>;
  country: { name: string } | null;
  ancestry: Array<{ id: string; name: string; level: string }>;
  rule_set: Array<{ id: string; terms: { name: string } }>;
  matched_rule_id: string | null;
  selected_scope: { authority_reference: string } | null;
};
export function projectSettlementCountry(
  context: CountryContext | null | undefined,
  rule: string,
): HrSettlementCountryEvidence | null {
  if (!context) return null;
  const profile = context.profiles[0],
    matched = context.rule_set.find((r) => r.id === context.matched_rule_id);
  return {
    as_of: context.as_of,
    basis: context.basis,
    country_code: profile?.country_code ?? null,
    country_name: context.country?.name ?? null,
    profile_id: profile?.id ?? null,
    jurisdictions: context.ancestry.map((j) => ({ id: j.id, name: j.name, level: j.level })),
    selected_rule_id: rule,
    matched_rule_id: context.matched_rule_id,
    matched_rule_name: matched?.terms.name ?? null,
    authority_reference: context.selected_scope?.authority_reference ?? null,
  };
}
export async function readSettlementCountry(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  employee: string,
  relationship: string,
  date: string,
  family: "benefit" | "encashment",
  rule: string,
) {
  const context = (
    await client.query("select read_hr_settlement_country_context($1,$2,$3,$4,$5::date,$6,$7) proof", [
      c.tenantId,
      company,
      employee,
      relationship,
      date,
      family,
      rule,
    ])
  ).rows[0].proof;
  const evidence = projectSettlementCountry(context, rule);
  return { context, evidence, blockers: (context?.blockers ?? []) as string[] };
}
export async function settlementCountryOptions(client: PoolClient, country?: string) {
  return {
    legal_countries: (
      await client.query("select code,name from country where status='active' order by name,code limit 250")
    ).rows,
    legal_jurisdictions: country
      ? (
          await client.query(
            "select id,name,country_code,parent_id,level from jurisdiction where country_code=$1 and status='active' order by case level when 'national' then 0 when 'subnational' then 1 else 2 end,name,id limit 500",
            [country],
          )
        ).rows
      : [],
  };
}
export async function reviewSettlementCountryHandoff(
  client: PoolClient,
  c: HrActorContext,
  row: { company_id: string; employee_id: string; relationship_id: string; id: string; terms: unknown },
) {
  const sources = (
    await client.query(
      "select s.* from (select tenant_id,company_id,case_id,id,rule_id,as_of::text,snapshot,'benefit' family,'benefit_source_id' source_key from hr_settlement_benefit_source union all select tenant_id,company_id,case_id,id,rule_id,as_of::text,snapshot,'encashment','encashment_source_id' from hr_settlement_encashment_source) s where s.tenant_id=$1 and s.company_id=$2 and s.case_id=$3 and exists(select 1 from jsonb_array_elements($4::jsonb->'lines') l where l->>s.source_key=s.id)",
      [c.tenantId, row.company_id, row.id, JSON.stringify(row.terms)],
    )
  ).rows;
  for (const s of sources) {
    const current = await readSettlementCountry(
      client,
      c,
      row.company_id,
      row.employee_id,
      row.relationship_id,
      s.as_of,
      s.family,
      s.rule_id,
    );
    if (
      current.blockers.length ||
      (
        await client.query(
          "select normalized_hr_country_closure($1,$2,$3,$4::date,$5::jsonb) is distinct from normalized_hr_country_closure($1,$2,$3,$4::date,$6::jsonb) as differs",
          [
            c.tenantId,
            row.company_id,
            row.relationship_id,
            s.as_of,
            JSON.stringify(current.context),
            JSON.stringify(s.snapshot.country_scope ?? null),
          ],
        )
      ).rows[0].differs
    )
      throw new HrApiError(
        409,
        "HR_SETTLEMENT_COUNTRY_REVIEW_REQUIRED",
        "Country policy or jurisdiction evidence changed. Independently correct the statement before Payroll handoff.",
      );
  }
}
