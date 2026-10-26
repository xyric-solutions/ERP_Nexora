import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthenticatedAccount } from "@nexora/auth";
import {
  referenceMasterKindSchema,
  referenceMasterQuerySchema,
  referenceMasterSchema,
  referenceMasterMutationSchema,
  createReferenceMasterRequestSchema,
  updateReferenceMasterRequestSchema,
  changeReferenceMasterStatusRequestSchema,
  type ReferenceMasterKind,
  type ReferenceMasterQuery,
  type ReferenceMaster,
  type ReferenceMasterDirectory,
  type ReferenceMasterMutation,
  type CreateReferenceMasterRequest,
  type UpdateReferenceMasterRequest,
  type ChangeReferenceMasterStatusRequest,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";

export interface ReferenceMasterContext {
  tenantId: string;
  actor: AuthenticatedAccount;
  realActorId?: string;
  impersonationRequestId?: string;
}
export class ReferenceMasterError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const configurations = {
  projects: { table: "erp_project", permission: "master_data.project", foreignKey: "project_id" },
  locations: { table: "erp_location", permission: "master_data.location", foreignKey: "location_id" },
} as const;
function configuration(kind: ReferenceMasterKind) {
  return configurations[referenceMasterKindSchema.parse(kind)];
}
function hash(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, canonical(child)]),
      );
    return item;
  }
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
// Both current company access and the latest effective policy assignment are required.
const authoritySql = `select distinct company.id,company.code,company.name
 from security_user_account u
 join security_user_company_access c on c.tenant_id=u.tenant_id and c.user_id=u.id and c.revoked_at is null
 join organization_unit company on company.tenant_id=c.tenant_id and company.id=c.company_id and company.type='company' and company.status='active'
 join security_user_role_assignment_version a on a.tenant_id=u.tenant_id and a.user_id=u.id
 join security_role_policy p on p.tenant_id=a.tenant_id and p.id=a.role_policy_id and p.status='active' and p.lifecycle_state='active'
 join security_tenant_role r on r.tenant_id=p.tenant_id and r.role_id=p.role_id and r.lifecycle_state='active'
 join security_role_permission_grant g on g.tenant_id=p.tenant_id and g.role_policy_id=p.id and g.permission_key=$4
 join security_permission_definition d on d.permission_key=g.permission_key and d.status='active'
 join security_role_scope_grant s on s.tenant_id=g.tenant_id and s.role_policy_id=g.role_policy_id and s.permission_key=g.permission_key
 where u.tenant_id=$1 and u.id=$2 and u.status='active' and u.archived_at is null
 and ($3::text is null or company.id=$3)
 and a.lifecycle_state='active' and a.valid_from<=now() and (a.valid_until is null or a.valid_until>now())
 and a.version=(select max(v.version) from security_user_role_assignment_version v where v.tenant_id=a.tenant_id and v.assignment_id=a.assignment_id)
 and ((s.scope_kind='tenant' and s.scope_value=$1) or (s.scope_kind='company' and s.scope_value=company.id))`;
const projection = `id,company_id,code,name,status,row_version::integer as version,created_by,updated_by,
 to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
 to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at`;

export class SourceReferenceMasterRepository {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(
    context: ReferenceMasterContext,
    permission: string,
    company: string | null,
    work: (client: PoolClient) => Promise<T>,
    mutation = false,
  ): Promise<T> {
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission))
      throw new ReferenceMasterError(403, "PERMISSION_DENIED", "Company master-data authority is required.");
    if (mutation && (context.realActorId || context.impersonationRequestId))
      throw new ReferenceMasterError(
        403,
        "IMPERSONATION_RESTRICTED",
        "Master-data changes are disabled during impersonation.",
      );
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      // Keep the live permission snapshot stable until the operation commits.
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
        `nexora:security:admin:${context.tenantId}`,
      ]);
      if (company) {
        const grant = await client.query(`${authoritySql} limit 1`, [
          context.tenantId,
          context.actor.userId,
          company,
          permission,
        ]);
        if (!grant.rowCount)
          throw new ReferenceMasterError(
            403,
            "COMPANY_ACCESS_DENIED",
            "Live company-scoped master-data authority is required.",
          );
      }
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error && typeof error === "object" && "code" in error) {
        if (["42P01", "42703"].includes(String(error.code)))
          throw new ReferenceMasterError(
            503,
            "MASTER_DATA_UNAVAILABLE",
            "The shared master-data schema is not available. Contact your administrator.",
          );
        if (error.code === "23505")
          throw new ReferenceMasterError(
            409,
            "MASTER_CODE_CONFLICT",
            "This company already has that reference code or change version.",
          );
        if (["23503", "23514", "40001", "40P01"].includes(String(error.code)))
          throw new ReferenceMasterError(
            409,
            "MASTER_INTEGRITY_CONFLICT",
            "Master data changed or its audit evidence is incomplete. Refresh and retry.",
          );
      }
      throw error;
    } finally {
      client.release();
    }
  }
  async companies(context: ReferenceMasterContext, kind: ReferenceMasterKind) {
    const permission = `${configuration(kind).permission}.read`;
    return this.transaction(context, permission, null, async (client) => {
      const result = await client.query<{ id: string; code: string; name: string }>(
        `${authoritySql} order by company.code,company.id limit 201`,
        [context.tenantId, context.actor.userId, null, permission],
      );
      if (result.rows.length > 200)
        throw new ReferenceMasterError(
          409,
          "COMPANY_DIRECTORY_LIMIT",
          "Narrow company access before loading this directory.",
        );
      return { items: result.rows };
    });
  }
  async list(
    context: ReferenceMasterContext,
    kind: ReferenceMasterKind,
    input: ReferenceMasterQuery,
  ): Promise<ReferenceMasterDirectory> {
    const query = referenceMasterQuerySchema.parse(input),
      config = configuration(kind);
    let cursor: { code: string; id: string } | null = null;
    if (query.cursor) {
      try {
        const decoded: unknown = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"));
        const parsed = referenceMasterQuerySchema.parse({ ...query, cursor: undefined });
        // Bind continuation to the exact company/filter selection, not merely a row.
        const value = cursorSchema.parse(decoded);
        if (value.scope !== hash({ kind, tenant: context.tenantId, ...parsed })) throw new Error("scope");
        cursor = value;
      } catch {
        throw new ReferenceMasterError(
          400,
          "INVALID_CURSOR",
          "The continuation does not match this company/filter selection.",
        );
      }
    }
    return this.transaction(context, `${config.permission}.read`, query.company_id, async (client) => {
      const escaped = (query.search ?? "").replace(/[\\%_]/g, "\\$&");
      const result = await client.query(
        `select ${projection} from ${config.table}
        where tenant_id=$1 and company_id=$2 and ($3::text is null or status=$3)
        and (code ilike $4 escape '\\' or name ilike $4 escape '\\')
        and ($5::text is null or (lower(code),id)>($5,$6)) order by lower(code),id limit $7`,
        [
          context.tenantId,
          query.company_id,
          query.status ?? null,
          `%${escaped}%`,
          cursor?.code ?? null,
          cursor?.id ?? null,
          query.limit + 1,
        ],
      );
      const items = result.rows.slice(0, query.limit).map((row) => referenceMasterSchema.parse(row)),
        last = items.at(-1);
      return {
        items,
        next_cursor:
          result.rows.length > query.limit && last
            ? Buffer.from(
                JSON.stringify({
                  code: last.code.toLowerCase(),
                  id: last.id,
                  scope: hash({ kind, tenant: context.tenantId, ...query, cursor: undefined }),
                }),
              ).toString("base64url")
            : null,
      };
    });
  }
  private async load(
    client: PoolClient,
    tenant: string,
    kind: ReferenceMasterKind,
    company: string,
    id: string,
    lock = false,
  ): Promise<ReferenceMaster> {
    const result = await client.query(
      `select ${projection} from ${configuration(kind).table} where tenant_id=$1 and company_id=$2 and id=$3${lock ? " for update" : ""}`,
      [tenant, company, id],
    );
    if (!result.rowCount)
      throw new ReferenceMasterError(404, "MASTER_NOT_FOUND", "The company reference was not found.");
    return referenceMasterSchema.parse(result.rows[0]);
  }
  async get(context: ReferenceMasterContext, kind: ReferenceMasterKind, company: string, id: string) {
    return this.transaction(context, `${configuration(kind).permission}.read`, company, (client) =>
      this.load(client, context.tenantId, kind, company, id),
    );
  }
  create(
    context: ReferenceMasterContext,
    kind: ReferenceMasterKind,
    input: CreateReferenceMasterRequest,
    key: string,
    correlation: string,
  ) {
    const parsed = createReferenceMasterRequestSchema.parse(input);
    return this.change(context, kind, "created", null, parsed, key, correlation);
  }
  update(
    context: ReferenceMasterContext,
    kind: ReferenceMasterKind,
    id: string,
    input: UpdateReferenceMasterRequest,
    key: string,
    correlation: string,
  ) {
    return this.change(context, kind, "updated", id, updateReferenceMasterRequestSchema.parse(input), key, correlation);
  }
  status(
    context: ReferenceMasterContext,
    kind: ReferenceMasterKind,
    id: string,
    input: ChangeReferenceMasterStatusRequest,
    key: string,
    correlation: string,
  ) {
    return this.change(
      context,
      kind,
      "status_changed",
      id,
      changeReferenceMasterStatusRequestSchema.parse(input),
      key,
      correlation,
    );
  }
  private async change(
    context: ReferenceMasterContext,
    kind: ReferenceMasterKind,
    action: "created" | "updated" | "status_changed",
    id: string | null,
    input: CreateReferenceMasterRequest | UpdateReferenceMasterRequest | ChangeReferenceMasterStatusRequest,
    key: string,
    correlation: string,
  ): Promise<ReferenceMasterMutation> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      throw new ReferenceMasterError(400, "INVALID_IDEMPOTENCY_KEY", "A bounded idempotency key is required.");
    const config = configuration(kind),
      fingerprint = hash({ kind, action, id, input });
    return this.transaction(
      context,
      `${config.permission}.manage`,
      input.company_id,
      async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `master-data:${context.tenantId}:${context.actor.userId}:${key}`,
        ]);
        const replay = await client.query<{ request_sha256: string; result: unknown }>(
          "select request_sha256,result from erp_reference_master_event where tenant_id=$1 and actor_id=$2 and idempotency_key=$3",
          [context.tenantId, context.actor.userId, key],
        );
        if (replay.rowCount) {
          if (replay.rows[0]!.request_sha256 !== fingerprint)
            throw new ReferenceMasterError(
              409,
              "IDEMPOTENCY_CONFLICT",
              "This request key belongs to another operation.",
            );
          return referenceMasterMutationSchema.parse(replay.rows[0]!.result);
        }
        let before: ReferenceMaster | null = null;
        if (id) {
          before = await this.load(client, context.tenantId, kind, input.company_id, id, true);
          if (!("expected_version" in input) || input.expected_version !== before.version)
            throw new ReferenceMasterError(
              409,
              "MASTER_VERSION_CONFLICT",
              "The reference changed. Reload before editing.",
            );
          if (action === "updated" && "name" in input)
            await client.query(
              `update ${config.table} set name=$4,row_version=row_version+1,updated_by=$5,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
              [context.tenantId, input.company_id, id, input.name, context.actor.userId],
            );
          else if (action === "status_changed" && "status" in input)
            await client.query(
              `update ${config.table} set status=$4,row_version=row_version+1,updated_by=$5,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
              [context.tenantId, input.company_id, id, input.status, context.actor.userId],
            );
        } else {
          if (!("code" in input))
            throw new ReferenceMasterError(400, "INVALID_MASTER", "Creation fields are required.");
          id = `reference-${randomUUID()}`;
          await client.query(
            `insert into ${config.table}(tenant_id,company_id,id,code,name,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6)`,
            [context.tenantId, input.company_id, id, input.code, input.name, context.actor.userId],
          );
        }
        const record = await this.load(client, context.tenantId, kind, input.company_id, id);
        const auditId = await this.audit(client, context, kind, action, record, before, correlation);
        const result = { record, audit_event_id: auditId };
        await client.query(
          `insert into erp_reference_master_event(tenant_id,company_id,id,kind,${config.foreignKey},record_version,action,actor_id,audit_event_id,idempotency_key,request_sha256,result) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            context.tenantId,
            input.company_id,
            randomUUID(),
            kind,
            id,
            record.version,
            action,
            context.actor.userId,
            auditId,
            key,
            fingerprint,
            JSON.stringify(result),
          ],
        );
        return referenceMasterMutationSchema.parse(result);
      },
      true,
    );
  }
  private async audit(
    client: PoolClient,
    context: ReferenceMasterContext,
    kind: ReferenceMasterKind,
    action: string,
    after: ReferenceMaster,
    before: ReferenceMaster | null,
    correlation: string,
  ) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const latest = await client.query<{ sequence: string; event_hash: string }>(
      "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
      [context.tenantId],
    );
    const event = {
      id: `audit-${randomUUID()}`,
      tenant_id: context.tenantId,
      sequence: Number(latest.rows[0]?.sequence ?? 0) + 1,
      actor_id: context.actor.userId,
      correlation_id: correlation,
      action: `master_data.${kind}.${action}`,
      entity_type: configuration(kind).table,
      entity_id: after.id,
      before_hash: hash(before),
      after_hash: hash(after),
      source_reference: `company:${after.company_id}`,
      approval_reference: null,
      occurred_at: new Date().toISOString(),
      previous_event_hash: latest.rows[0]?.event_hash ?? hash({ genesis: context.tenantId }),
    };
    await client.query(
      `insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
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
        null,
        event.occurred_at,
        event.previous_event_hash,
        hash(event),
      ],
    );
    return event.id;
  }
}

const cursorSchema = z.strictObject({
  code: z.string().min(1).max(64),
  id: z.string().min(1).max(128),
  scope: z.string().regex(/^[a-f0-9]{64}$/),
});
