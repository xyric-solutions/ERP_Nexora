import type { Pool, PoolClient } from "pg";
import type { HrAttendanceCompletionResult } from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { attendanceHash } from "./attendance-completion.js";
export type HrGovernedDependencies = {
  pool: Pool;
  audit: (
    client: PoolClient,
    c: HrActorContext,
    corr: string,
    type: "hr.personal_data.correction" | "hr.report.governance" | "hr.learning.workflow",
    id: string,
    before: unknown,
    after: unknown,
  ) => Promise<string>;
};
export async function withHrGovernedClient<T>(
  d: HrGovernedDependencies,
  c: HrActorContext,
  readOnly: boolean,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (c.actor.tenantId !== c.tenantId)
    throw new HrApiError(403, "PERMISSION_DENIED", "The active tenant session is required.");
  const client = await d.pool.connect();
  try {
    await client.query(readOnly ? "begin isolation level repeatable read read only" : "begin");
    await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
export async function runHrGovernedCommand(
  d: HrGovernedDependencies,
  c: HrActorContext,
  command: {
    company: string;
    path: string;
    key: string;
    corr: string;
    input: unknown;
    lock: string;
    type: "hr.personal_data.correction" | "hr.report.governance" | "hr.learning.workflow";
  },
  authorize: (client: PoolClient) => Promise<void>,
  change: (
    client: PoolClient,
  ) => Promise<{ id: string; version: number; status: string; before: unknown; after: unknown }>,
): Promise<HrAttendanceCompletionResult> {
  if (c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId))
    throw new HrApiError(403, "PERMISSION_DENIED", "Use your own active session for this governed action.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(command.key))
    throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "Use a valid idempotency key.");
  try {
    return await withHrGovernedClient(d, c, false, async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [command.lock]);
      await authorize(client); // Current authority is checked even when the command was previously completed.
      const fingerprint = attendanceHash(command.input),
        prior = (
          await client.query<{ request_fingerprint: string; response_body: HrAttendanceCompletionResult }>(
            "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",
            [c.tenantId, c.actor.userId, command.path, command.key],
          )
        ).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== fingerprint)
          throw new HrApiError(409, "HR_GOVERNED_REVIEW_REQUIRED", "This idempotency key belongs to another request.");
        return { ...prior.response_body, replayed: true };
      }
      const result = await change(client),
        audit = await d.audit(client, c, command.corr, command.type, result.id, result.before, result.after);
      const receipt = {
        id: result.id,
        company_id: command.company,
        version: result.version,
        status: result.status,
        audit_event_id: audit,
        replayed: false,
      };
      await client.query(
        "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)",
        [c.tenantId, c.actor.userId, command.path, command.key, fingerprint, receipt, attendanceHash(receipt)],
      );
      return receipt;
    });
  } catch (e) {
    if (e instanceof HrApiError) throw e;
    if (["23505", "23514", "23P01", "P0001"].includes((e as { code?: string }).code ?? ""))
      throw new HrApiError(
        409,
        "HR_GOVERNED_REVIEW_REQUIRED",
        "The action conflicts with protected history, another pending request or changed source data. Refresh and review.",
      );
    throw e;
  }
}

/** Explicit company access is independent of role permission grants. */
export async function requireHrGovernedCompany(client: PoolClient, c: HrActorContext, company: string, lock = false) {
  if (c.actor.tenantId !== c.tenantId)
    throw new HrApiError(403, "PERMISSION_DENIED", "The active tenant session is required.");
  const rows = await client.query(
    `select 1 from security_user_account u join security_user_company_access a on a.tenant_id=u.tenant_id and a.user_id=u.id and a.company_id=$3 and a.revoked_at is null join organization_unit o on o.tenant_id=a.tenant_id and o.id=a.company_id and o.type='company' and o.status='active' where u.tenant_id=$1 and u.id=$2 and u.status='active' and u.archived_at is null limit 1${lock ? " for share of u,a,o" : ""}`,
    [c.tenantId, c.actor.userId, company],
  );
  if (!rows.rowCount) throw new HrApiError(403, "PERMISSION_DENIED", "Current company access is required.");
}
