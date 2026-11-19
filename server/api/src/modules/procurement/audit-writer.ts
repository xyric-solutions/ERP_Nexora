import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ReferenceMasterContext } from "../master-data/source-repository.js";

export function procurementDigest(value: unknown): string {
  const canonical = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(canonical)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, canonical(child)]),
          )
        : item;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

/** Caller owns authorization, protected profile serialization and the transaction. */
export async function writeProcurementEvidence(
  client: PoolClient,
  context: ReferenceMasterContext,
  input: {
    entity: "supplier" | "document";
    id: string;
    company: string;
    version: number;
    action: string;
    reason: string;
    record: unknown;
    key: string;
    fingerprint: string;
    correlation: string;
    override?: string | null;
    budgetWarnings?: readonly string[];
  },
) {
  const {
    entity,
    id,
    company,
    version,
    action,
    reason,
    record,
    key,
    fingerprint,
    correlation,
    override = null,
    budgetWarnings = [],
  } = input;
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `nexora:platform:audit:${context.tenantId}`,
  ]);
  const prior = await client.query<{ sequence: string; event_hash: string }>(
    "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
    [context.tenantId],
  );
  const before = await client.query<{ record: unknown }>(
    "select result->'record' as record from procurement_change where tenant_id=$1 and company_id=$2 and entity_type=$3 and entity_id=$4 and record_version=$5",
    [context.tenantId, company, entity, id, version - 1],
  );
  const event = {
    id: `audit-${randomUUID()}`,
    tenant_id: context.tenantId,
    sequence: Number(prior.rows[0]?.sequence ?? 0) + 1,
    actor_id: context.actor.userId,
    correlation_id: correlation,
    action: `procurement.${entity}.${action}`,
    entity_type: `procurement_${entity}`,
    entity_id: id,
    before_hash: procurementDigest(before.rows[0]?.record ?? null),
    after_hash: procurementDigest(record),
    source_reference: `company:${company}`,
    approval_reference: override,
    occurred_at: new Date().toISOString(),
    previous_event_hash: prior.rows[0]?.event_hash ?? procurementDigest({ genesis: context.tenantId }),
  };
  await client.query(
    "insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
    [...Object.values(event), procurementDigest(event)],
  );
  await client.query(
    `insert into procurement_change(tenant_id,company_id,id,entity_type,entity_id,record_version,actor_id,action,reason,audit_event_id,approval_override_event_id,idempotency_key,request_sha256,snapshot,result)
     select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,to_jsonb(r),$14::jsonb from procurement_${entity} r where r.tenant_id=$1 and r.company_id=$2 and r.id=$5`,
    [
      context.tenantId,
      company,
      randomUUID(),
      entity,
      id,
      version,
      context.actor.userId,
      action,
      reason,
      event.id,
      override,
      key,
      fingerprint,
      JSON.stringify({
        record,
        audit_event_id: event.id,
        ...(budgetWarnings.length ? { budget_warnings: budgetWarnings } : {}),
      }),
    ],
  );
  return event.id;
}
