import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import {
  bankSelfApprovalQuerySchema,
  bankSelfApprovalOptionsQuerySchema,
  changeBankSelfApprovalRequestSchema,
  bankSelfApprovalGrantSchema,
  bankSelfApprovalDirectorySchema,
  bankSelfApprovalOptionsSchema,
  type BankSelfApprovalQuery,
  type BankSelfApprovalOptionsQuery,
  type ChangeBankSelfApprovalRequest,
} from "@nexora/contracts";
import { BankingApiError, type BankingActorContext } from "../banking/source-repository.js";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      )
    : value;
}
function hash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
const projection = `g.id,g.company_id,g.transaction_kind,g.user_id,coalesce(u.display_name,u.id) as user_name,g.version::integer,g.state,g.actor_id,g.reason,g.audit_event_id,
 to_char(g.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at`;
const cursorSchema = z.strictObject({
  user: z.string().max(128),
  version: z.number().int().min(0),
  scope: z.string().length(64),
});
function cursor(input: string | undefined, scope: string) {
  if (!input) return { user: "", version: 0 };
  try {
    const value = cursorSchema.parse(JSON.parse(Buffer.from(input, "base64url").toString("utf8")));
    if (value.scope !== scope) throw new Error("scope");
    return value;
  } catch {
    throw new BankingApiError(
      400,
      "BANK_GRANT_CURSOR_INVALID",
      "Continuation does not match this company and selection.",
    );
  }
}
export class SourceBankSelfApprovalRepository {
  constructor(private readonly pool: Pool) {}
  private async run<T>(
    context: BankingActorContext,
    company: string | undefined,
    mutation: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const permission = `security.bank_self_approval.${mutation ? "manage" : "read"}`;
    if (
      context.actor.tenantId !== context.tenantId ||
      context.realActorId ||
      context.impersonationRequestId ||
      !context.actor.roles.includes("super_administrator") ||
      !context.actor.permissions.includes("platform.approval.override") ||
      !context.actor.permissions.includes(permission)
    )
      throw new BankingApiError(
        403,
        "BANK_GRANT_ADMIN_REQUIRED",
        "Explicit Bank grant permission and active global administrator authority are required.",
      );
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query(
        `select ${mutation ? "pg_advisory_xact_lock" : "pg_advisory_xact_lock_shared"}(hashtextextended($1,0))`,
        [`nexora:security:admin:${context.tenantId}`],
      );
      if (company) {
        const authority = await client.query<{ allowed: boolean }>(
          "select bank_has_live_permission($1,$2,$3,'platform.approval.override',true) and bank_has_live_permission($1,$2,$3,$4) as allowed",
          [context.tenantId, company, context.actor.userId, permission],
        );
        if (!authority.rows[0]?.allowed)
          throw new BankingApiError(
            403,
            "BANK_GRANT_SCOPE_DENIED",
            "Live global and company-scoped Bank grant authority are required.",
          );
      }
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["42P01", "42703", "42883"].includes(String(error.code))
      )
        throw new BankingApiError(
          503,
          "BANK_GRANT_UNAVAILABLE",
          "Bank approval governance migrations are required. Contact an administrator.",
        );
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23514", "23503", "23505", "40001", "40P01"].includes(String(error.code))
      )
        throw new BankingApiError(
          409,
          "BANK_GRANT_INTEGRITY_CONFLICT",
          "Grant authority or version changed. Refresh before retrying.",
        );
      throw error;
    } finally {
      client.release();
    }
  }
  options(context: BankingActorContext, input: BankSelfApprovalOptionsQuery) {
    const query = bankSelfApprovalOptionsQuerySchema.parse(input);
    return this.run(context, query.company_id, false, async (client) => {
      const companies = await client.query(
        `select id,code,name from organization_unit where tenant_id=$1 and type='company' and status='active'
        and bank_has_live_permission($1,id,$2,'platform.approval.override',true)
        and bank_has_live_permission($1,id,$2,'security.bank_self_approval.read') order by code,id limit 201`,
        [context.tenantId, context.actor.userId],
      );
      if (companies.rows.length > 200)
        throw new BankingApiError(
          409,
          "BANK_GRANT_DIRECTORY_LIMIT",
          "Narrow company access before loading grant administration.",
        );
      const scope = hash([
        context.tenantId,
        context.actor.userId,
        query.company_id,
        query.transaction_kind,
        query.search,
        query.limit,
      ]);
      const continuation = cursor(query.cursor, scope);
      const users = query.company_id
        ? await client.query<{ id: string; name: string }>(
            `select u.id,coalesce(u.display_name,u.id) as name from security_user_account u
        where u.tenant_id=$1 and u.id>$3 and u.id<>$4 and bank_has_live_permission($1,$2,u.id,$5)
        and (u.id ilike $6 escape '\\' or coalesce(u.display_name,'') ilike $6 escape '\\') order by u.id limit $7`,
            [
              context.tenantId,
              query.company_id,
              continuation.user,
              context.actor.userId,
              `banking.${query.transaction_kind}.approve`,
              `%${(query.search ?? "").replace(/[\\%_]/g, "\\$&")}%`,
              query.limit + 1,
            ],
          )
        : { rows: [] };
      const page = users.rows.slice(0, query.limit);
      return bankSelfApprovalOptionsSchema.parse({
        companies: companies.rows,
        users: page,
        next_cursor:
          users.rows.length > query.limit
            ? Buffer.from(JSON.stringify({ user: page.at(-1)!.id, version: 0, scope })).toString("base64url")
            : null,
      });
    });
  }
  list(context: BankingActorContext, input: BankSelfApprovalQuery) {
    const query = bankSelfApprovalQuerySchema.parse(input);
    return this.run(context, query.company_id, false, async (client) => {
      const scope = hash([context.tenantId, context.actor.userId, { ...query, cursor: undefined }]),
        continuation = cursor(query.cursor, scope);
      const rows = await client.query(
        `select ${projection} from bank_self_approval_grant_version g join security_user_account u on u.tenant_id=g.tenant_id and u.id=g.user_id
        where g.tenant_id=$1 and g.company_id=$2 and g.transaction_kind=$3 and ($4::text is null or g.user_id=$4)
        and ($5 or g.version=(select max(v.version) from bank_self_approval_grant_version v where v.tenant_id=g.tenant_id and v.company_id=g.company_id and v.transaction_kind=g.transaction_kind and v.user_id=g.user_id))
        and (g.user_id,g.version)>($6,$7::bigint) order by g.user_id,g.version limit $8`,
        [
          context.tenantId,
          query.company_id,
          query.transaction_kind,
          query.user_id ?? null,
          query.history === "true",
          continuation.user,
          continuation.version,
          query.limit + 1,
        ],
      );
      const page = rows.rows.slice(0, query.limit),
        last = page.at(-1);
      return bankSelfApprovalDirectorySchema.parse({
        items: page,
        next_cursor:
          rows.rows.length > query.limit && last
            ? Buffer.from(JSON.stringify({ user: last.user_id, version: last.version, scope })).toString("base64url")
            : null,
      });
    });
  }
  change(context: BankingActorContext, input: ChangeBankSelfApprovalRequest, key: string, correlation: string) {
    const request = changeBankSelfApprovalRequestSchema.parse(input);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      throw new BankingApiError(400, "INVALID_IDEMPOTENCY_KEY", "A valid retry key is required.");
    return this.run(context, request.company_id, true, async (client) => {
      const fingerprint = hash(request);
      const replay = await client.query(
        `select ${projection},g.request_sha256 from bank_self_approval_grant_version g join security_user_account u on u.tenant_id=g.tenant_id and u.id=g.user_id where g.tenant_id=$1 and g.actor_id=$2 and g.idempotency_key=$3`,
        [context.tenantId, context.actor.userId, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_sha256 !== fingerprint)
          throw new BankingApiError(
            409,
            "BANK_GRANT_IDEMPOTENCY_CONFLICT",
            "This retry key was used for a different grant change.",
          );
        const { request_sha256: _fingerprint, ...record } = replay.rows[0];
        void _fingerprint;
        return { record: bankSelfApprovalGrantSchema.parse(record), replayed: true };
      }
      const before = await client.query(
        `select * from bank_self_approval_grant_version where tenant_id=$1 and company_id=$2 and transaction_kind=$3 and user_id=$4 order by version desc limit 1`,
        [context.tenantId, request.company_id, request.transaction_kind, request.user_id],
      );
      const previous = before.rows[0];
      if (
        Number(previous?.version ?? 0) !== request.expected_version ||
        previous?.state === request.state ||
        (!previous && request.state !== "active")
      )
        throw new BankingApiError(
          409,
          "BANK_GRANT_VERSION_CONFLICT",
          "The grant changed or already has this state. Refresh before changing it.",
        );
      const id = randomUUID(),
        version = request.expected_version + 1,
        auditId = `audit-${randomUUID()}`;
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:platform:audit:${context.tenantId}`,
      ]);
      const latest = await client.query(
        "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
        [context.tenantId],
      );
      const audit = {
        id: auditId,
        tenant_id: context.tenantId,
        sequence: Number(latest.rows[0]?.sequence ?? 0) + 1,
        actor_id: context.actor.userId,
        correlation_id: correlation,
        action: `security.bank_self_approval.${request.state}`,
        entity_type: "bank_self_approval_grant",
        entity_id: id,
        before_hash: hash(previous ?? null),
        after_hash: hash({ ...request, id, version }),
        source_reference: `company:${request.company_id}`,
        approval_reference: null,
        occurred_at: new Date().toISOString(),
        previous_event_hash: latest.rows[0]?.event_hash ?? hash({ genesis: context.tenantId }),
      };
      await client.query(
        `insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          audit.id,
          audit.tenant_id,
          audit.sequence,
          audit.actor_id,
          audit.correlation_id,
          audit.action,
          audit.entity_type,
          audit.entity_id,
          audit.before_hash,
          audit.after_hash,
          audit.source_reference,
          null,
          audit.occurred_at,
          audit.previous_event_hash,
          hash(audit),
        ],
      );
      await client.query(
        `insert into bank_self_approval_grant_version(tenant_id,company_id,transaction_kind,user_id,version,id,state,actor_id,reason,audit_event_id,idempotency_key,request_sha256)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          context.tenantId,
          request.company_id,
          request.transaction_kind,
          request.user_id,
          version,
          id,
          request.state,
          context.actor.userId,
          request.reason,
          auditId,
          key,
          fingerprint,
        ],
      );
      const result = await client.query(
        `select ${projection} from bank_self_approval_grant_version g join security_user_account u on u.tenant_id=g.tenant_id and u.id=g.user_id where g.tenant_id=$1 and g.id=$2`,
        [context.tenantId, id],
      );
      return { record: bankSelfApprovalGrantSchema.parse(result.rows[0]), replayed: false };
    });
  }
}
