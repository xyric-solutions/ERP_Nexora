import type { PoolClient } from "pg";
import { hrStatutoryPackTermsSchema, type HrStatutoryPackTerms } from "@nexora/contracts";
import { verifyStatutoryVectors } from "./payroll-statutory-rules.js";
import { PayrollCalculationError } from "./payroll-calculation.js";
import { attendanceHash } from "./attendance-completion.js";
export function verifyStatutoryBundle(input: unknown): HrStatutoryPackTerms {
  const b = hrStatutoryPackTermsSchema.parse(input),
    fail = (message: string): never => {
      throw new PayrollCalculationError(message);
    };
  if (b.effective_to && b.effective_to < b.effective_from) fail("The bundle effective range is invalid.");
  if (
    new Set(b.sources.map((s) => s.id)).size !== b.sources.length ||
    new Set(b.rules.map((r) => r.key)).size !== b.rules.length
  )
    fail("Bundle source and rule keys must be unique.");
  const currency = b.rules[0]!.configuration;
  for (const r of b.rules) {
    if (
      r.configuration.currency_code !== currency.currency_code ||
      r.configuration.money_scale !== currency.money_scale
    )
      fail("Every bundle rule must use the same explicit currency and precision.");
    if (Object.keys(r.configuration.constants).length > 50 || r.vectors.some((v) => Object.keys(v.inputs).length > 40))
      fail("The bundle exceeds its bounded input/constant contract.");
    if (
      new Set(r.vectors.map((v) => v.key)).size !== r.vectors.length ||
      r.vectors.some((v) => !b.sources.some((s) => s.id === v.source_id))
    )
      fail("Every vector needs a unique key and a reviewed source reference.");
    verifyStatutoryVectors(
      {
        id: r.key,
        rule_type: r.rule_type,
        configuration_json: r.configuration,
        applicability_json: r.applicability,
        output_definition_json: r.output,
      },
      r.vectors.map((v) => ({
        vector_kind: v.kind,
        canonical_inputs_json: v.inputs,
        expected_outputs_json: v.expected,
        rounding_expectations_json: v.rounding,
      })),
    );
  }
  return b;
}
export function statutoryBundleIdentity(tenant: string, b: HrStatutoryPackTerms) {
  const pack_key = "tenant-" + attendanceHash(tenant).slice(0, 32) + ":" + b.key,
    pack_id = "stat-pack-" + attendanceHash({ tenant, key: b.key }),
    version_id = "stat-version-" + attendanceHash({ tenant, key: b.key, version: b.semantic_version });
  return { pack_key, pack_id, version_id, artifact_hash: attendanceHash(b) };
}
export async function validateStatutoryBundleReferences(client: PoolClient, tenant: string, b: HrStatutoryPackTerms) {
  const found = (
    await client.query(
      `select 1 from country c join jurisdiction j on j.country_code=c.code where c.code=$1 and j.id=$2 and c.status='active' and j.status='active' and c.valid_from<=$3::date and j.valid_from<=$3::date and(c.valid_to is null or c.valid_to>=coalesce($4::date,$3::date)) and(j.valid_to is null or j.valid_to>=coalesce($4::date,$3::date))`,
      [b.country_code, b.jurisdiction_id, b.effective_from, b.effective_to],
    )
  ).rowCount;
  if (!found)
    throw new PayrollCalculationError(
      "Bundle country and jurisdiction references must be active for the effective range.",
    );
  const config = b.rules[0]!.configuration;
  if (
    !(
      await client.query(
        "select 1 from currency where tenant_id=$1 and code=$2 and decimal_places=$3 and status='active'",
        [tenant, config.currency_code, config.money_scale],
      )
    ).rowCount
  )
    throw new PayrollCalculationError("Bundle currency and precision must match the active tenant Finance currency.");
  const id = statutoryBundleIdentity(tenant, b),
    existing = (
      await client.query("select * from localization_pack where id=$1 or pack_key=$2", [id.pack_id, id.pack_key])
    ).rows;
  if (
    existing.some(
      (p) =>
        p.id !== id.pack_id ||
        p.pack_key !== id.pack_key ||
        p.publisher_scope !== "tenant" ||
        p.publisher_tenant_id !== tenant ||
        p.country_code !== b.country_code ||
        p.target_jurisdiction_id !== b.jurisdiction_id ||
        p.status !== "active",
    )
  )
    throw new PayrollCalculationError(
      "The existing pack identity differs from this tenant, country or jurisdiction. Use a new pack key.",
    );
}
