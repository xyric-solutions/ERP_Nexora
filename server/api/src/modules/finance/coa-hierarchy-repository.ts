import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  financeHierarchyItemSchema,
  type FinanceHierarchyDirectory,
  type FinanceHierarchyQuery,
  type CreateFinanceHierarchyRequest,
  type ChangeFinanceHierarchyRequest,
} from "@nexora/contracts";
import type { FinanceNominalActorContext } from "./nominals/source-repository.js";
import { isCoaSuperAdministrator, hasLiveCoaMasterAuthority } from "./coa-master-authority.js";
import { changeCoaMaster, CoaMasterError } from "./coa-master-change.js";
const projection = "select id,company_id,code,name,type,parent_id,status,coa_version::integer as version from account";
export class SourceCoaHierarchyRepository {
  constructor(private readonly pool: Pool) {}
  private async run<T>(
    ctx: FinanceNominalActorContext,
    company: string,
    permission: string,
    work: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (ctx.tenantId !== ctx.actor.tenantId || !ctx.actor.permissions.includes(permission))
      throw new CoaMasterError(403, "PERMISSION_DENIED", "Company Finance authority is required.");
    const mutation = permission !== "finance.nominal.read";
    if (mutation && !isCoaSuperAdministrator(ctx))
      throw new CoaMasterError(
        403,
        "COA_SUPER_ADMIN_REQUIRED",
        "Only a global Super Admin may manage categories and sections.",
      );
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('nexora.tenant_id',$1,true)", [ctx.tenantId]);
      await c.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
        `nexora:security:admin:${ctx.tenantId}`,
      ]);
      const allowed = await c.query<{ allowed: boolean }>("select bank_has_live_permission($1,$2,$3,$4) as allowed", [
        ctx.tenantId,
        company,
        ctx.actor.userId,
        permission,
      ]);
      if (!allowed.rows[0]?.allowed || (mutation && !(await hasLiveCoaMasterAuthority(c, ctx, company))))
        throw new CoaMasterError(
          403,
          "COMPANY_ACCESS_DENIED",
          "Live company-scoped Super Admin authority is required for changes.",
        );
      const result = await work(c);
      await c.query("commit");
      return result;
    } catch (e) {
      await c.query("rollback");
      if (e instanceof CoaMasterError) throw e;
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        ["23505", "23514", "23503", "40001", "40P01"].includes(String(e.code))
      )
        throw new CoaMasterError(
          409,
          "COA_HIERARCHY_CONFLICT",
          "Hierarchy dependencies, identity, duplicates or concurrent changes prevent this operation.",
        );
      throw e;
    } finally {
      c.release();
    }
  }
  list(ctx: FinanceNominalActorContext, q: FinanceHierarchyQuery): Promise<FinanceHierarchyDirectory> {
    return this.run(ctx, q.company_id, "finance.nominal.read", async (c) => {
      let last = "";
      if (q.cursor) {
        try {
          const v: unknown = JSON.parse(Buffer.from(q.cursor, "base64url").toString("utf8"));
          if (
            !v ||
            typeof v !== "object" ||
            !("company" in v) ||
            v.company !== q.company_id ||
            !("tenant" in v) ||
            v.tenant !== ctx.tenantId ||
            !("id" in v) ||
            typeof v.id !== "string"
          )
            throw new Error();
          last = v.id;
        } catch {
          throw new CoaMasterError(400, "COA_CURSOR_INVALID", "Continuation does not match this company.");
        }
      }
      const r = await c.query(
        `${projection} where tenant_id=$1 and company_id=$2 and is_header and id>$3 order by id limit $4`,
        [ctx.tenantId, q.company_id, last, q.limit + 1],
      );
      const items = r.rows.slice(0, q.limit).map((v) => financeHierarchyItemSchema.parse(v));
      return {
        items,
        next_cursor:
          r.rows.length > q.limit
            ? Buffer.from(
                JSON.stringify({ company: q.company_id, tenant: ctx.tenantId, id: items.at(-1)!.id }),
              ).toString("base64url")
            : null,
      };
    });
  }
  async change(
    ctx: FinanceNominalActorContext,
    company: string,
    id: string | undefined,
    input: CreateFinanceHierarchyRequest | ChangeFinanceHierarchyRequest,
    key: string,
    correlation: string,
  ) {
    const create = "company_id" in input,
      permission = create
        ? "finance.nominal.create"
        : "name" in input
          ? "finance.nominal.update"
          : "finance.nominal.status";
    return this.run(ctx, company, permission, async (c) => {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
        throw new CoaMasterError(400, "INVALID_IDEMPOTENCY_KEY", "A request key is required.");
      const path = `/api/v1/finance/hierarchy${id ? "/" + id : ""}`,
        method = create ? "POST" : "PATCH",
        fingerprint = createHash("sha256")
          .update(JSON.stringify({ company_id: company, input }))
          .digest("hex");
      await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:coa-header:${ctx.tenantId}:${ctx.actor.userId}:${path}:${key}`,
      ]);
      const previous = await c.query<{ request_fingerprint: string; response_body: unknown }>(
        "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method=$3 and path=$4 and idempotency_key=$5",
        [ctx.tenantId, ctx.actor.userId, method, path, key],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].request_fingerprint !== fingerprint)
          throw new CoaMasterError(409, "IDEMPOTENCY_CONFLICT", "This key was used for another request.");
        return financeHierarchyItemSchema.parse(previous.rows[0].response_body);
      }
      let accountId = id;
      if (create) {
        const category = input.parent_id
          ? (
              await c.query(
                "select id from account where tenant_id=$1 and company_id=$2 and id=$3 and parent_id is null and is_header and status='active' and type=$4 for share",
                [ctx.tenantId, company, input.parent_id, input.type],
              )
            ).rows[0]
          : null;
        if (input.parent_id && !category)
          throw new CoaMasterError(
            409,
            "COA_CATEGORY_INVALID",
            "Choose an active same-company category of the same accounting type.",
          );
        await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `nexora:coa-name:${ctx.tenantId}:${company}:${input.parent_id ?? "root"}:${input.name.trim().toLowerCase()}`,
        ]);
        if (
          (
            await c.query(
              "select 1 from account where tenant_id=$1 and company_id=$2 and parent_id is not distinct from $3 and lower(btrim(name))=lower(btrim($4))",
              [ctx.tenantId, company, input.parent_id ?? null, input.name],
            )
          ).rowCount
        )
          throw new CoaMasterError(409, "NOMINAL_DUPLICATE", "This hierarchy name already exists.");
        accountId = `coa-header-${randomUUID()}`;
        const code = input.code ?? `CAT-${randomUUID().slice(0, 12)}`;
        await c.query(
          "insert into account(tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,created_at) values($1,$2,$3,$4,$5,$6,$7,true,'active',false,clock_timestamp())",
          [ctx.tenantId, company, accountId, code, input.name, input.type, input.parent_id ?? null],
        );
        if (input.parent_id)
          await c.query(
            "insert into finance_general_nominal_policy(tenant_id,company_id,section_id,category_id,prefix,code_width,next_value,last_value) values($1,$2,$3,$4,$5,2,1,99)",
            [ctx.tenantId, company, accountId, input.parent_id, code],
          );
        await changeCoaMaster(c, ctx, accountId, "created", 1, correlation);
      } else {
        if (
          !(
            await c.query("select 1 from account where tenant_id=$1 and company_id=$2 and id=$3 and is_header", [
              ctx.tenantId,
              company,
              id,
            ])
          ).rowCount
        )
          throw new CoaMasterError(404, "COA_MASTER_NOT_FOUND", "The company hierarchy master was not found.");
        await changeCoaMaster(
          c,
          ctx,
          id!,
          input.action === "activate" ? "activated" : input.action === "deactivate" ? "deactivated" : "updated",
          input.expected_version,
          correlation,
          input.name ? { name: input.name } : {},
        );
      }
      const item = financeHierarchyItemSchema.parse(
        (
          await c.query(`${projection} where tenant_id=$1 and company_id=$2 and id=$3`, [
            ctx.tenantId,
            company,
            accountId,
          ])
        ).rows[0],
      );
      await c.query(
        "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [ctx.tenantId, ctx.actor.userId, method, path, key, fingerprint, create ? 201 : 200, item, `"${item.version}"`],
      );
      return item;
    });
  }
}
