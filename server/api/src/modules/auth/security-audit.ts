import { createHash, randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

/** SHA-256 of the canonical JSON form; the same scheme the security administration audit chain uses. */
export function securityStateHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value)), "utf8")
    .digest("hex");
}

export interface SecurityAuditEventInput {
  tenantId: string;
  actorId: string;
  correlationId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  sourceReference: string;
  approvalReference?: string | null;
  occurredAt: Date;
}

/**
 * Appends one row to the tenant's hash-chained `security_audit_event` log inside the caller's transaction. Mirrors
 * the chain rules of the security administration repository (same advisory lock, genesis and payload shape) so the
 * chain stays verifiable whichever module wrote the row. Only state hashes are stored, never the states themselves.
 */
export async function appendSecurityAuditEvent(client: PoolClient, input: SecurityAuditEventInput): Promise<string> {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `nexora:security:audit:${input.tenantId}`,
  ]);
  const latest = await client.query<{ sequence: string; event_hash: string }>(
    `select sequence,event_hash from security_audit_event where tenant_id=$1 order by sequence desc limit 1`,
    [input.tenantId],
  );
  const sequence = latest.rows[0] ? Number(latest.rows[0].sequence) + 1 : 1;
  const previousEventHash = latest.rows[0]?.event_hash ?? securityStateHash({ genesis: input.tenantId });
  const id = randomUUID();
  const occurredAt = input.occurredAt.toISOString();
  const beforeHash = securityStateHash(input.before);
  const afterHash = securityStateHash(input.after);
  const payload = {
    id,
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    correlation_id: input.correlationId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    before_hash: beforeHash,
    after_hash: afterHash,
    source_reference: input.sourceReference,
    approval_reference: input.approvalReference ?? null,
    occurred_at: occurredAt,
    sequence,
    previous_event_hash: previousEventHash,
  };
  const eventHash = securityStateHash(payload);
  await client.query(
    `insert into security_audit_event
     (id,tenant_id,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,sequence,previous_event_hash,event_hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id,
      input.tenantId,
      input.actorId,
      input.correlationId,
      input.action,
      input.entityType,
      input.entityId,
      beforeHash,
      afterHash,
      input.sourceReference,
      payload.approval_reference,
      occurredAt,
      sequence,
      previousEventHash,
      eventHash,
    ],
  );
  return id;
}
