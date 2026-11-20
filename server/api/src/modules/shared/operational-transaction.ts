import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { ReferenceMasterContext } from "../master-data/source-repository.js";
import { companyAuthoritySql } from "../security/company-authority.js";
import { FinancePostingError } from "../finance/posting/types.js";
import { CompanyCurrencyAuthorityError } from "../finance/currencies/company-authority.js";
import { TaxError } from "../finance/taxes/resolver.js";
import { InventoryError } from "../inventory/errors.js";

export class OperationalError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function operationalFailure(message: string, code = "OPERATION_VALIDATION_FAILED", status = 409): never {
  throw new OperationalError(status, code, message);
}
export function operationalDigest(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, canonical(item)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

/** Shared caller-owned transaction boundary for stock and commercial source workflows. */
export async function operationalTransaction<T>(
  pool: Pool,
  context: ReferenceMasterContext,
  company: string,
  permission: string,
  write: boolean,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission))
    operationalFailure("The required operational permission is missing.", "PERMISSION_DENIED", 403);
  if (write && (context.realActorId || context.impersonationRequestId))
    operationalFailure(
      "Posting and master changes are disabled during impersonation.",
      "IMPERSONATION_RESTRICTED",
      403,
    );
  const client = await pool.connect();
  try {
    await client.query(write ? "begin" : "begin isolation level repeatable read read only");
    await client.query("select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id',$2,true)", [
      context.tenantId,
      context.actor.userId,
    ]);
    await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
      `nexora:security:admin:${context.tenantId}`,
    ]);
    if (
      !(await client.query(companyAuthoritySql, [context.tenantId, context.actor.userId, company, permission])).rowCount
    )
      operationalFailure("Access is not available for this company.", "COMPANY_ACCESS_DENIED", 403);
    if (write)
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `operational:${context.tenantId}:${company}`,
      ]);
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    if (error instanceof OperationalError) throw error;
    if (
      error instanceof FinancePostingError ||
      error instanceof CompanyCurrencyAuthorityError ||
      error instanceof TaxError ||
      error instanceof InventoryError
    )
      throw new OperationalError(error.status, error.code, error.message);
    if (error instanceof z.ZodError)
      throw new OperationalError(400, "OPERATION_INPUT_INVALID", "Operational input or stored evidence is invalid.");
    if (error instanceof RangeError) throw new OperationalError(409, "OPERATION_AMOUNT_INVALID", error.message);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["23503", "23505", "23514", "40001", "40P01", "P0001"].includes(String(error.code))
    ) {
      const mapped = new OperationalError(
        409,
        "OPERATION_INTEGRITY_CONFLICT",
        "Source, approval or ledger evidence changed or conflicts with an integrity rule. Refresh and review before retrying.",
      );
      Object.defineProperty(mapped, "cause", { value: error });
      throw mapped;
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Appends to the existing immutable tenant audit chain, inside the caller transaction. */
export async function operationalAudit(
  client: PoolClient,
  context: ReferenceMasterContext,
  input: {
    company: string;
    entity: string;
    id: string;
    action: string;
    before: unknown;
    after: unknown;
    correlation: string;
  },
): Promise<string> {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `nexora:platform:audit:${context.tenantId}`,
  ]);
  const prior = (
    await client.query<{ sequence: string; event_hash: string }>(
      "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
      [context.tenantId],
    )
  ).rows[0];
  const event = {
    id: `audit-${randomUUID()}`,
    tenant_id: context.tenantId,
    sequence: Number(prior?.sequence ?? 0) + 1,
    actor_id: context.actor.userId,
    correlation_id: input.correlation,
    action: input.action,
    entity_type: input.entity,
    entity_id: input.id,
    before_hash: operationalDigest(input.before),
    after_hash: operationalDigest(input.after),
    source_reference: `company:${input.company}`,
    approval_reference: null,
    occurred_at: new Date().toISOString(),
    previous_event_hash: prior?.event_hash ?? operationalDigest({ genesis: context.tenantId }),
  };
  await client.query(
    "insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
    [...Object.values(event), operationalDigest(event)],
  );
  return event.id;
}
