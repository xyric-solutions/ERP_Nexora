import type { Pool } from "pg";
import {
  verifyStatutoryBundle,
  validateStatutoryBundleReferences,
  statutoryBundleIdentity,
} from "./payroll-statutory-bundle.js";
import { attendanceHash } from "./attendance-completion.js";
import { PayrollCalculationError } from "./payroll-calculation.js";
export type PublishStatutoryRequest = {
  tenant: string;
  company: string;
  requestId: string;
  artifactHash: string;
  allowSynthetic?: boolean;
};
export async function publishApprovedStatutoryPack(pool: Pool, input: PublishStatutoryRequest) {
  const client = await pool.connect(),
    fail = (message: string): never => {
      throw new PayrollCalculationError(message);
    };
  try {
    await client.query("begin");
    await client.query("select set_config('nexora.tenant_id',$1,true)", [input.tenant]);
    const principal = (
      await client.query(
        `select session_user as name,localization_publisher_is_registered() or session_user=pg_get_userbyid((select relowner from pg_class where oid='localization_import_release'::regclass)) as allowed`,
      )
    ).rows[0];
    if (!principal.allowed)
      fail("Use a registered localization publisher database principal. The API role must not publish catalog data.");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      "nexora:payroll:" + input.tenant + ":" + input.company,
    ]);
    // Approved requests cannot change; the company lock serializes approval.
    // The publisher needs SELECT only, never UPDATE authority over review requests.
    const row = (
      await client.query(
        `select * from hr_payroll_localization_request where tenant_id=$1 and company_id=$2 and id=$3`,
        [input.tenant, input.company, input.requestId],
      )
    ).rows[0];
    if (
      !row ||
      row.kind !== "pack_release" ||
      row.state !== "approved" ||
      !row.decided_by ||
      row.decided_by === row.created_by ||
      row.decided_by === row.submitted_by
    )
      fail("Publication requires this company’s independently approved rule bundle.");
    const b = verifyStatutoryBundle(row.terms),
      identity = statutoryBundleIdentity(input.tenant, b);
    if (identity.artifact_hash !== input.artifactHash)
      fail("The requested artifact fingerprint does not match the approved bundle.");
    if (b.classification === "synthetic" && !input.allowSynthetic)
      fail(
        "Synthetic publication requires an explicit --allow-synthetic flag and cannot enable production Payroll approval.",
      );
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      "nexora:statutory-pack:" + identity.pack_id,
    ]);
    const prior = (
      await client.query(
        `select artifact_hash,pack_version_id,publisher_name,published_at::text from hr_statutory_pack_publication where tenant_id=$1 and company_id=$2 and request_id=$3`,
        [input.tenant, input.company, input.requestId],
      )
    ).rows[0];
    if (prior) {
      if (prior.artifact_hash !== identity.artifact_hash)
        fail("The publication acknowledgement has a different artifact hash.");
      await client.query("commit");
      return { ...prior, replayed: true };
    }
    await validateStatutoryBundleReferences(client, input.tenant, b);
    if (
      (
        await client.query(
          "select 1 from localization_pack_version where id=$1 or(pack_id=$2 and semantic_version=$3)",
          [identity.version_id, identity.pack_id, b.semantic_version],
        )
      ).rowCount
    )
      fail("This pack version already exists. Use a new semantic version; published content cannot be overwritten.");
    await client.query(
      `insert into localization_pack(id,pack_key,domain,country_code,target_jurisdiction_id,publisher_scope,publisher_tenant_id,owner_reference,status) values($1,$2,'hr_payroll',$3,$4,'tenant',$5,$6,'active') on conflict(id) do nothing`,
      [identity.pack_id, identity.pack_key, b.country_code, b.jurisdiction_id, input.tenant, b.name],
    );
    await client.query(
      `insert into localization_pack_version(id,pack_id,semantic_version,effective_from,effective_to,status,source_manifest_hash,content_hash,artifact_hash) values($1,$2,$3,$4,$5,'draft',$6,$7,$8)`,
      [
        identity.version_id,
        identity.pack_id,
        b.semantic_version,
        b.effective_from,
        b.effective_to,
        attendanceHash(b.sources),
        attendanceHash(b.rules),
        identity.artifact_hash,
      ],
    );
    for (const rule of b.rules) {
      const ruleId = "stat-rule-" + attendanceHash({ pack: identity.pack_id, key: rule.key }),
        versionId = "stat-rule-version-" + attendanceHash({ version: identity.version_id, key: rule.key });
      // Rule identity is stable; released definitions live on immutable versions.
      const existing = (
        await client.query("select pack_id,rule_key,category from hr_statutory_rule where id=$1", [ruleId])
      ).rows[0];
      if (
        existing &&
        (existing.pack_id !== identity.pack_id || existing.rule_key !== rule.key || existing.category !== rule.category)
      )
        fail("An existing rule key has different identity/category. Use a new rule key.");
      await client.query(
        `insert into hr_statutory_rule(id,pack_id,rule_key,category,name) values($1,$2,$3,$4,$5) on conflict(id) do nothing`,
        [ruleId, identity.pack_id, rule.key, rule.category, rule.name],
      );
      await client.query(
        `insert into hr_statutory_rule_version(id,rule_id,pack_version_id,effective_from,effective_to,rule_type,applicability_json,configuration_json,stacking_operation,source_references_json,content_hash,output_definition_json) values($1,$2,$3,$4,$5,'safe_formula',$6::jsonb,$7::jsonb,'additive',$8::jsonb,$9,$10::jsonb)`,
        [
          versionId,
          ruleId,
          identity.version_id,
          b.effective_from,
          b.effective_to,
          JSON.stringify(rule.applicability),
          JSON.stringify(rule.configuration),
          JSON.stringify(b.sources),
          attendanceHash(rule),
          JSON.stringify(rule.output),
        ],
      );
      for (const vector of rule.vectors)
        await client.query(
          `insert into hr_statutory_rule_test_vector(id,rule_version_id,pack_version_id,scenario_key,vector_kind,canonical_inputs_json,expected_outputs_json,rounding_expectations_json,source_reference,reviewer_id,reviewed_at,content_hash) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12)`,
          [
            "stat-vector-" + attendanceHash({ versionId, key: vector.key }),
            versionId,
            identity.version_id,
            vector.key,
            vector.kind,
            JSON.stringify(vector.inputs),
            JSON.stringify(vector.expected),
            JSON.stringify(vector.rounding),
            b.sources.find((s) => s.id === vector.source_id)!.reference,
            row.decided_by,
            row.decided_at,
            attendanceHash(vector),
          ],
        );
    }
    await client.query(
      `update localization_pack_version set status='validated',validated_at=clock_timestamp(),reviewer_id=$2 where id=$1`,
      [identity.version_id, row.decided_by],
    );
    await client.query(
      `update localization_pack_version set status='approved',approved_at=$3,approver_id=$2,published_at=clock_timestamp() where id=$1`,
      [identity.version_id, row.decided_by, row.decided_at],
    );
    const report = {
      classification: b.classification,
      execution_contract: b.execution_contract,
      request_id: input.requestId,
      tenant_id: input.tenant,
      company_id: input.company,
      artifact_hash: identity.artifact_hash,
      maker: row.created_by,
      reviewer: row.decided_by,
      reviewed_at: row.decided_at,
      engine_validation: "reviewed_vectors_v1",
      rules: b.rules.length,
    };
    await client.query(
      `insert into localization_import_release(artifact_hash,pack_version_id,bundle_schema_version,report_json) values($1,$2,1,$3::jsonb)`,
      [identity.artifact_hash, identity.version_id, JSON.stringify(report)],
    );
    const published = (
      await client.query(
        `insert into hr_statutory_pack_publication(tenant_id,company_id,request_id,artifact_hash,pack_version_id) values($1,$2,$3,$4,$5) returning artifact_hash,pack_version_id,publisher_name,published_at::text`,
        [input.tenant, input.company, input.requestId, identity.artifact_hash, identity.version_id],
      )
    ).rows[0];
    await client.query(
      `insert into hr_payroll_workspace_event(tenant_id,id,company_id,record_id,record_type,action,reason,actor_id,before_json,after_json,source_hash) values($1,$2,$3,$4,'localization','publish','Imported the independently approved statutory artifact',$5,'null'::jsonb,$6::jsonb,$7)`,
      [
        input.tenant,
        "stat-published-" + identity.artifact_hash,
        input.company,
        input.requestId,
        "publisher:" + principal.name,
        JSON.stringify(published),
        identity.artifact_hash,
      ],
    );
    await client.query("commit");
    return { ...published, replayed: false };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
