import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { BankingActorContext } from "../../banking/source-repository.js";
import { hasLiveCoaMasterAuthority } from "../../finance/coa-master-authority.js";

export class FiscalCalendarError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export type CalendarContext = BankingActorContext;
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
export const calendarHash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
export async function requireCalendarPermission(
  c: PoolClient,
  ctx: CalendarContext,
  company: string,
  permission: string,
  admin = false,
) {
  if (ctx.tenantId !== ctx.actor.tenantId || !ctx.actor.permissions.includes(permission))
    throw new FiscalCalendarError(403, "PERMISSION_DENIED", "Explicit Finance calendar authority is required.");
  const live = await c.query<{ allowed: boolean }>("select bank_has_live_permission($1,$2,$3,$4) as allowed", [
    ctx.tenantId,
    company,
    ctx.actor.userId,
    permission,
  ]);
  if (!live.rows[0]?.allowed || (admin && !(await hasLiveCoaMasterAuthority(c, ctx, company))))
    throw new FiscalCalendarError(
      403,
      "CALENDAR_AUTHORITY_DENIED",
      "Live company-scoped authority is required; locked reopening and calendar setup also require a global Super Admin.",
    );
}
export async function calendarTransaction<T>(
  pool: Pool,
  ctx: CalendarContext,
  work: (c: PoolClient) => Promise<T>,
  mutation = false,
): Promise<T> {
  if (ctx.tenantId !== ctx.actor.tenantId || (mutation && (ctx.realActorId || ctx.impersonationRequestId)))
    throw new FiscalCalendarError(
      403,
      "CALENDAR_AUTHORITY_DENIED",
      "Calendar operations require the authenticated tenant; impersonated writes are prohibited.",
    );
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('nexora.tenant_id',$1,true)", [ctx.tenantId]);
    await c.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
      `nexora:security:admin:${ctx.tenantId}`,
    ]);
    const result = await work(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    if (e instanceof FiscalCalendarError) throw e;
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      ["23505", "23503", "23514", "23P01", "40001", "40P01"].includes(String(e.code))
    )
      throw new FiscalCalendarError(
        409,
        "CALENDAR_CONFLICT",
        "Dates, dependencies or concurrent changes conflict. Refresh the calendar; no partial change was saved.",
      );
    throw e;
  } finally {
    c.release();
  }
}
export async function calendarIdempotency<T>(
  c: PoolClient,
  ctx: CalendarContext,
  path: string,
  input: unknown,
  key: string,
  parse: (v: unknown) => T,
  work: () => Promise<T>,
): Promise<T> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
    throw new FiscalCalendarError(400, "INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
  await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `nexora:calendar-request:${ctx.tenantId}:${ctx.actor.userId}:${path}:${key}`,
  ]);
  const hash = calendarHash(input),
    prior = (
      await c.query<{ request_fingerprint: string; response_body: unknown }>(
        "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",
        [ctx.tenantId, ctx.actor.userId, path, key],
      )
    ).rows[0];
  if (prior) {
    if (prior.request_fingerprint !== hash)
      throw new FiscalCalendarError(409, "IDEMPOTENCY_CONFLICT", "This key was used for a different request.");
    return parse(prior.response_body);
  }
  const result = await work();
  await c.query(
    "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)",
    [ctx.tenantId, ctx.actor.userId, path, key, hash, JSON.stringify(result), `"${calendarHash(result)}"`],
  );
  return result;
}
export async function calendarAudit(
  c: PoolClient,
  ctx: CalendarContext,
  calendar: { id: string; company_id: string },
  period: { id: string; version: number } | null,
  action: string,
  before: string | null,
  after: string,
  reason: string | null,
  correlation: string,
) {
  await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`nexora:platform:audit:${ctx.tenantId}`]);
  const prior = (
    await c.query<{ sequence: string; event_hash: string }>(
      "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
      [ctx.tenantId],
    )
  ).rows[0];
  const occurred = (
    await c.query<{ at: string }>(
      "select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as at",
    )
  ).rows[0]!.at;
  const event = {
    id: `fiscal-event-${randomUUID()}`,
    tenant_id: ctx.tenantId,
    sequence: Number(prior?.sequence ?? 0) + 1,
    actor_id: ctx.actor.userId,
    correlation_id: correlation,
    action: `finance.period.${action}`,
    entity_type: period ? "financial_period" : "fiscal_calendar",
    entity_id: period?.id ?? calendar.id,
    before_hash: calendarHash(before),
    after_hash: calendarHash({ calendar, period, status: after }),
    source_reference: `company:${calendar.company_id}`,
    approval_reference: null,
    occurred_at: occurred,
    previous_event_hash: prior?.event_hash ?? calendarHash({ genesis: ctx.tenantId }),
  };
  await c.query(
    "insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null,$12,$13,$14)",
    [
      event.id,
      event.tenant_id,
      event.sequence,
      event.actor_id,
      event.correlation_id,
      event.action,
      event.entity_type,
      event.entity_id,
      event.before_hash,
      event.after_hash,
      event.source_reference,
      event.occurred_at,
      event.previous_event_hash,
      calendarHash(event),
    ],
  );
  await c.query(
    "insert into fiscal_calendar_event(tenant_id,company_id,id,calendar_id,period_id,actor_id,action,before_status,after_status,record_version,reason,correlation_id,occurred_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    [
      ctx.tenantId,
      calendar.company_id,
      event.id,
      calendar.id,
      period?.id ?? null,
      ctx.actor.userId,
      action,
      before,
      after,
      period?.version ?? 1,
      reason,
      correlation,
      occurred,
    ],
  );
}
