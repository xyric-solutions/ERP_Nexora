import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { BankingActorContext } from "../banking/source-repository.js";
import { companyAuthoritySql } from "../security/company-authority.js";
import { CompanyCurrencyAuthorityError } from "../finance/currencies/company-authority.js";

export class BudgetError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
export function budgetReject(message: string, code = "BUDGET_INVALID", status = 422): never {
  throw new BudgetError(status, code, message);
}
export const budgetHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type BudgetClient = Pick<PoolClient, "query">;
export async function lockBudget(client: BudgetClient, tenant: string, company: string) {
  // All purchasing, subledger and Budget mutations use this order.
  for (const resource of ["subledger", "procurement", "budget"])
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`${resource}:${tenant}:${company}`]);
}
export class BudgetTransactions {
  constructor(readonly pool: Pool) {}
  async run<T>(
    ctx: BankingActorContext,
    company: string,
    permission: string,
    write: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (ctx.tenantId !== ctx.actor.tenantId || !ctx.actor.permissions.includes(permission))
      budgetReject("Budget access is not permitted.", "PERMISSION_DENIED", 403);
    if (write && (ctx.realActorId || ctx.impersonationRequestId))
      budgetReject("Budget changes are unavailable during impersonation.", "IMPERSONATION_RESTRICTED", 403);
    const client = await this.pool.connect();
    try {
      await client.query(write ? "begin" : "begin isolation level repeatable read read only");
      await client.query("select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id',$2,true)", [
        ctx.tenantId,
        ctx.actor.userId,
      ]);
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
        `nexora:security:admin:${ctx.tenantId}`,
      ]);
      if (!(await client.query(companyAuthoritySql, [ctx.tenantId, ctx.actor.userId, company, permission])).rowCount)
        budgetReject("Budget access is unavailable for this company.", "COMPANY_ACCESS_DENIED", 403);
      if (write) await lockBudget(client, ctx.tenantId, company);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error instanceof BudgetError) throw error;
      if (error instanceof CompanyCurrencyAuthorityError)
        throw new BudgetError(error.status, error.code, error.message, { cause: error });
      if (error instanceof z.ZodError)
        throw new BudgetError(422, "BUDGET_VALIDATION_FAILED", "Budget input or retained evidence is invalid.", {
          cause: error,
        });
      if (error && typeof error === "object" && "code" in error) {
        if (["42P01", "42703"].includes(String(error.code)))
          throw new BudgetError(503, "BUDGET_UNAVAILABLE", "Budget migrations are required.");
        if (["23503", "23505", "23514", "40001", "40P01", "42501"].includes(String(error.code)))
          throw new BudgetError(
            409,
            "BUDGET_CONFLICT",
            "Budget data changed or its evidence is incomplete. Reload and retry.",
            { cause: error },
          );
      }
      throw error;
    } finally {
      client.release();
    }
  }
  mutate<T>(
    ctx: BankingActorContext,
    company: string,
    permission: string,
    key: string,
    input: unknown,
    work: (client: PoolClient) => Promise<T>,
    parse: (value: unknown) => T,
  ): Promise<T> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      budgetReject("Supply a valid idempotency key.", "IDEMPOTENCY_KEY_INVALID", 400);
    return this.run(ctx, company, permission, true, async (client) => {
      const fingerprint = budgetHash(input);
      const prior = (
        await client.query<{ fingerprint: string; result: unknown }>(
          "select fingerprint,result from budget_idempotency where tenant_id=$1 and company_id=$2 and actor_id=$3 and key=$4",
          [ctx.tenantId, company, ctx.actor.userId, key],
        )
      ).rows[0];
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          budgetReject("This idempotency key was used for different Budget input.", "IDEMPOTENCY_CONFLICT", 409);
        return parse(prior.result);
      }
      const result = parse(await work(client));
      await client.query(
        "insert into budget_idempotency(tenant_id,company_id,actor_id,key,fingerprint,result) values($1,$2,$3,$4,$5,$6)",
        [ctx.tenantId, company, ctx.actor.userId, key, fingerprint, JSON.stringify(result)],
      );
      return result;
    });
  }
}
const auditTables = new Set(["budget_plan", "budget_version", "budget_model", "budget_import", "budget_request"]);
export async function budgetAudit(
  client: BudgetClient,
  ctx: BankingActorContext,
  company: string,
  entity: string,
  id: string,
  action: string,
  reason: string,
  correlation: string,
) {
  if (!auditTables.has(entity)) throw new Error("Unsupported Budget audit entity.");
  await client.query(
    `insert into budget_audit(tenant_id,company_id,id,entity,entity_id,record_version,action,actor_id,reason,correlation_id,snapshot)
    select tenant_id,company_id,$4,$5,id,version,$6,$7,$8,$9,to_jsonb(record) from ${entity} record where tenant_id=$1 and company_id=$2 and id=$3`,
    [ctx.tenantId, company, id, randomUUID(), entity, action, ctx.actor.userId, reason, correlation],
  );
}
export async function allocateBudgetCode(client: BudgetClient, tenant: string, company: string, prefix: string) {
  const row = (
    await client.query<{ value: string }>(
      `insert into budget_sequence(tenant_id,company_id,prefix,next_value) values($1,$2,$3,2)
    on conflict(tenant_id,company_id,prefix) do update set next_value=budget_sequence.next_value+1 returning (next_value-1)::text as value`,
      [tenant, company, prefix],
    )
  ).rows[0]!;
  return `${prefix}-${row.value.padStart(3, "0")}`;
}
