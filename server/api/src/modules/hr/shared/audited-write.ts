import { createHash } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { HrApiError, type HrActorContext } from "../source-repository.js";

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null), "utf8").digest("hex");
}

/**
 * One tenant-scoped, idempotent write transaction: replays return the stored
 * result, constraint failures become a 409 with `conflictMessage`.
 */
export async function auditedWrite<T extends object>(
  pool: Pool,
  context: HrActorContext,
  options: {
    permission: string | readonly string[];
    path: string;
    input: unknown;
    idempotencyKey: string;
    lock: string;
    conflictCode?: string;
    conflictMessage?: string;
  },
  operation: (client: PoolClient) => Promise<T>,
): Promise<T & { replayed: boolean }> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(options.idempotencyKey))
    throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
  const permissions = typeof options.permission === "string" ? [options.permission] : options.permission;
  if (!permissions.some((permission) => context.actor.permissions.includes(permission)))
    throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to change this record.");
  const client = await pool.connect();
  try {
    await client.query("begin isolation level read committed");
    await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [options.lock]);
    const fingerprint = stableHash(options.input);
    const replay = await client.query<{ request_fingerprint: string; response_body: T }>(
      `select request_fingerprint,response_body from platform_admin_idempotency
        where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
      [context.tenantId, context.actor.userId, options.path, options.idempotencyKey],
    );
    if (replay.rows[0]) {
      if (replay.rows[0].request_fingerprint !== fingerprint)
        throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another request.");
      await client.query("commit");
      return { ...replay.rows[0].response_body, replayed: true };
    }
    const result = { ...(await operation(client)), replayed: false };
    await client.query(
      `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
       values ($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
      [context.tenantId, context.actor.userId, options.path, options.idempotencyKey, fingerprint, result, stableHash(result)],
    );
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof HrApiError) throw error;
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    const message = String((error as { message?: unknown } | null)?.message ?? "");
    if (code === "23503")
      throw new HrApiError(409, options.conflictCode ?? "HR_RECORD_IN_USE", "This record is still used by other records and cannot be removed.");
    if (code === "23514" || code === "23505")
      throw new HrApiError(
        409,
        options.conflictCode ?? "HR_RECORD_INVALID",
        options.conflictMessage ?? (/must be (active|within)|exceeds|requires/.test(message) ? `The change was refused: ${message}.` : "The change conflicts with the current records."),
      );
    throw error;
  } finally {
    client.release();
  }
}
