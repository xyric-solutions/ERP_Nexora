import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  decimal,
  decimalText,
  taxInputSchema,
  taxUpdateSchema,
  taxStatusSchema,
  taxDirectorySchema,
  taxDetailSchema,
  taxOptionsSchema,
  taxTypeSchema,
  taxContextRules,
  type TaxInput,
  type TaxUpdate,
  type TaxStatus,
  type TaxQuery,
} from "@nexora/contracts";
import { z } from "zod";
import type { BankingActorContext } from "../../banking/source-repository.js";
import { companyAuthoritySql } from "../../security/company-authority.js";
import { TaxError, taxReject } from "./resolver.js";

const projection = `d.id,d.company_id,d.code,d.version,d.status,r.revision,r.name,r.tax_type,r.rate::text,r.description,r.effective_date::text,m.module,m.treatment,m.trigger,m.account_id,m.payroll_component_id,m.payroll_basis_component_id,a.code as account_code,a.name as account_name`;
const joined = `from finance_tax_definition d join finance_tax_revision r on r.tenant_id=d.tenant_id and r.company_id=d.company_id and r.definition_id=d.id
 join finance_tax_mapping_rule m on m.tenant_id=r.tenant_id and m.company_id=r.company_id and m.definition_id=r.definition_id and m.revision=r.revision
 join account a on a.tenant_id=m.tenant_id and a.company_id=m.company_id and a.id=m.account_id`;
const latest = `r.revision=(select max(v.revision) from finance_tax_revision v where v.tenant_id=d.tenant_id and v.company_id=d.company_id and v.definition_id=d.id)`;

export class SourceTaxRepository {
  constructor(readonly pool: Pool) {}
  async transaction<T>(
    context: BankingActorContext,
    company: string,
    write: boolean,
    work: (client: PoolClient) => Promise<T>,
  ) {
    const permission = write ? "finance.tax.manage" : "finance.tax.read";
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission))
      taxReject("Tax access is not permitted.", "PERMISSION_DENIED", 403);
    if (write && (context.realActorId || context.impersonationRequestId))
      taxReject("Tax changes are disabled during impersonation.", "IMPERSONATION_RESTRICTED", 403);
    const client = await this.pool.connect();
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
        !(await client.query(companyAuthoritySql, [context.tenantId, context.actor.userId, company, permission]))
          .rowCount
      )
        taxReject("Tax access is not available for this company.", "COMPANY_ACCESS_DENIED", 403);
      if (write) {
        if (
          !context.actor.permissions.includes("finance.tax_mapping.admin") ||
          !(await this.isAdmin(client, context, company))
        )
          taxReject(
            "Only an authorized company administrator can change tax nominal mappings.",
            "TAX_ADMIN_REQUIRED",
            403,
          );
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `tax:${context.tenantId}:${company}`,
        ]);
      }
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error instanceof TaxError) throw error;
      if (error instanceof z.ZodError)
        taxReject("Tax input or retained evidence is invalid.", "TAX_INPUT_INVALID", 400);
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23503", "23505", "23514", "40001", "40P01", "42501"].includes(String(error.code))
      ) {
        const mapped = new TaxError(
          409,
          "TAX_CONFLICT",
          "Tax configuration conflicts with an account constraint or concurrent change. Refresh before retrying.",
        );
        Object.defineProperty(mapped, "cause", { value: error });
        throw mapped;
      }
      throw error;
    } finally {
      client.release();
    }
  }
  private async isAdmin(client: PoolClient, context: BankingActorContext, company: string) {
    return (
      (
        await client.query<{ allowed: boolean }>("select finance_tax_admin($1,$2,$3) as allowed", [
          context.tenantId,
          company,
          context.actor.userId,
        ])
      ).rows[0]?.allowed === true
    );
  }
  private async read(client: PoolClient, tenant: string, company: string, id: string) {
    const rows = (
      await client.query(
        `select ${projection} ${joined} where d.tenant_id=$1 and d.company_id=$2 and d.id=$3 order by r.revision desc limit 100`,
        [tenant, company, id],
      )
    ).rows;
    if (!rows[0]) taxReject("Tax definition was not found in this company.", "NOT_FOUND", 404);
    return taxDetailSchema.parse({ ...rows[0], history: rows });
  }
  get(context: BankingActorContext, company: string, id: string) {
    return this.transaction(context, company, false, (client) => this.read(client, context.tenantId, company, id));
  }
  list(context: BankingActorContext, q: TaxQuery) {
    return this.transaction(context, q.company_id, false, async (client) => {
      const condition = `d.tenant_id=$1 and d.company_id=$2 and ${latest} and ($3='' or r.name ilike '%'||$3||'%' or d.code ilike '%'||$3||'%') and ($4::text is null or m.module=$4) and ($5::text is null or r.tax_type=$5) and ($6::text is null or d.status=$6)`;
      const values = [context.tenantId, q.company_id, q.search, q.module ?? null, q.tax_type ?? null, q.status ?? null];
      const count = (
        await client.query<{ total: number }>(`select count(*)::integer as total ${joined} where ${condition}`, values)
      ).rows[0]!.total;
      const rows = (
        await client.query(
          `select ${projection} ${joined} where ${condition} order by d.code,d.id limit $7 offset $8`,
          [...values, q.limit, q.offset],
        )
      ).rows;
      return taxDirectorySchema.parse({ items: rows, total: count });
    });
  }
  options(context: BankingActorContext, q: TaxQuery) {
    return this.transaction(context, q.company_id, false, async (client) => {
      const condition = `a.tenant_id=$1 and a.company_id=$2 and a.status='active' and not a.is_header and not a.reconciliation_required and a.type in ('asset','liability')
        and ($3='' or a.code ilike '%'||$3||'%' or a.name ilike '%'||$3||'%')
        and not exists(select 1 from bank_account b where b.tenant_id=a.tenant_id and b.company_id=a.company_id and b.account_id=a.id)
        and not exists(select 1 from finance_subledger_policy p where p.tenant_id=a.tenant_id and p.company_id=a.company_id and a.id in (p.receivable_account_id,p.payable_account_id))`;
      const values = [context.tenantId, q.company_id, q.search];
      return taxOptionsSchema.parse({
        can_manage:
          !context.realActorId &&
          !context.impersonationRequestId &&
          context.actor.permissions.includes("finance.tax_mapping.admin") &&
          (await this.isAdmin(client, context, q.company_id)),
        types: taxTypeSchema.options,
        rules: taxContextRules,
        payroll_components: (
          await client.query(
            "select id,code,name,kind from hr_pay_component where tenant_id=$1 and company_id=$2 and status='active' and kind in ('earning','deduction') order by position,id limit 501",
            [context.tenantId, q.company_id],
          )
        ).rows.slice(0, 500),
        accounts: (
          await client.query(
            `select a.id,a.code,a.name,a.type,g.currency from account a left join finance_general_nominal g on g.tenant_id=a.tenant_id and g.company_id=a.company_id and g.nominal_id=a.id where ${condition} order by a.code,a.id limit $4 offset $5`,
            [...values, q.limit, q.offset],
          )
        ).rows,
        total_accounts: (
          await client.query<{ total: number }>(
            `select count(*)::integer as total from account a where ${condition}`,
            values,
          )
        ).rows[0]!.total,
      });
    });
  }
  save(context: BankingActorContext, raw: TaxInput | TaxUpdate, key: string, id?: string) {
    const parsed = id ? taxUpdateSchema.parse(raw) : taxInputSchema.parse(raw);
    const input = { ...parsed, rate: decimalText(decimal(parsed.rate, 2), 2) };
    return this.transaction(context, input.company_id, true, async (client) => {
      return this.idempotent(client, context, input.company_id, key, { id, input }, async () => {
        const identifier = id ?? randomUUID();
        if (id) {
          const old = await this.read(client, context.tenantId, input.company_id, id);
          if (!("expected_version" in input) || input.expected_version !== old.version)
            taxReject("Tax configuration changed. Refresh before editing.", "TAX_VERSION_CONFLICT");
          if (input.effective_date < old.effective_date)
            taxReject("Successor revisions cannot precede the last revision's effective date.");
          if (
            (
              await client.query(
                "select 1 from finance_tax_application where tenant_id=$1 and company_id=$2 and definition_id=$3 and application_date>=$4::date limit 1",
                [context.tenantId, input.company_id, id, input.effective_date],
              )
            ).rowCount
          )
            taxReject("Posted tax applications lock this cutoff. Use an effective date after the latest application.");
          await client.query(
            "update finance_tax_definition set status=$4,version=version+1 where tenant_id=$1 and company_id=$2 and id=$3",
            [context.tenantId, input.company_id, id, input.status],
          );
        } else {
          const next = (
            await client.query<{ value: string }>(
              "insert into finance_tax_sequence(tenant_id,company_id,next_value) values($1,$2,2) on conflict(tenant_id,company_id) do update set next_value=finance_tax_sequence.next_value+1 returning (next_value-1)::text as value",
              [context.tenantId, input.company_id],
            )
          ).rows[0]!.value;
          await client.query(
            "insert into finance_tax_definition(tenant_id,company_id,id,code,status,version,created_by) values($1,$2,$3,$4,$5,1,$6)",
            [
              context.tenantId,
              input.company_id,
              identifier,
              `TAX-${next.padStart(3, "0")}`,
              input.status,
              context.actor.userId,
            ],
          );
        }
        const revision = (
          await client.query<{ revision: number }>(
            "select coalesce(max(revision),0)+1 as revision from finance_tax_revision where tenant_id=$1 and company_id=$2 and definition_id=$3",
            [context.tenantId, input.company_id, identifier],
          )
        ).rows[0]!.revision;
        await client.query(
          "insert into finance_tax_revision(tenant_id,company_id,definition_id,revision,name,tax_type,rate,description,effective_date,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            context.tenantId,
            input.company_id,
            identifier,
            revision,
            input.name,
            input.tax_type,
            input.rate,
            input.description,
            input.effective_date,
            context.actor.userId,
          ],
        );
        await client.query(
          "insert into finance_tax_mapping_rule(tenant_id,company_id,definition_id,revision,module,treatment,trigger,account_id,payroll_component_id,payroll_basis_component_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            context.tenantId,
            input.company_id,
            identifier,
            revision,
            input.module,
            input.treatment,
            input.trigger,
            input.account_id,
            input.payroll_component_id ?? null,
            input.payroll_basis_component_id ?? null,
          ],
        );
        const result = await this.read(client, context.tenantId, input.company_id, identifier);
        await this.audit(client, context, input.company_id, identifier, id ? "revise" : "create", input.reason, result);
        return result;
      });
    });
  }
  status(context: BankingActorContext, id: string, raw: TaxStatus, key: string) {
    const input = taxStatusSchema.parse(raw);
    return this.transaction(context, input.company_id, true, (client) =>
      this.idempotent(client, context, input.company_id, key, { id, action: "status", input }, async () => {
        const old = await this.read(client, context.tenantId, input.company_id, id);
        if (old.version !== input.expected_version)
          taxReject("Tax configuration changed. Refresh before changing status.", "TAX_VERSION_CONFLICT");
        await client.query(
          "update finance_tax_definition set status=$4,version=version+1 where tenant_id=$1 and company_id=$2 and id=$3",
          [context.tenantId, input.company_id, id, input.status],
        );
        const result = await this.read(client, context.tenantId, input.company_id, id);
        await this.audit(client, context, input.company_id, id, input.status, input.reason, result);
        return result;
      }),
    );
  }
  private async audit(
    client: PoolClient,
    c: BankingActorContext,
    company: string,
    id: string,
    action: string,
    reason: string,
    evidence: unknown,
  ) {
    await client.query(
      "insert into finance_tax_audit(tenant_id,company_id,id,definition_id,actor_id,action,reason,evidence) values($1,$2,$3,$4,$5,$6,$7,$8)",
      [c.tenantId, company, randomUUID(), id, c.actor.userId, action, reason, JSON.stringify(evidence)],
    );
  }
  private async idempotent(
    client: PoolClient,
    c: BankingActorContext,
    company: string,
    key: string,
    input: unknown,
    work: () => Promise<unknown>,
  ) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      taxReject("Supply a valid idempotency key.", "INVALID_IDEMPOTENCY_KEY", 400);
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const old = (
      await client.query<{ fingerprint: string; result: unknown }>(
        "select fingerprint,result from finance_tax_idempotency where tenant_id=$1 and company_id=$2 and actor_id=$3 and key=$4",
        [c.tenantId, company, c.actor.userId, key],
      )
    ).rows[0];
    if (old) {
      if (old.fingerprint !== fingerprint)
        taxReject("This key belongs to another tax request.", "IDEMPOTENCY_CONFLICT");
      return taxDetailSchema.parse(old.result);
    }
    const result = taxDetailSchema.parse(await work());
    await client.query(
      "insert into finance_tax_idempotency(tenant_id,company_id,actor_id,key,fingerprint,result) values($1,$2,$3,$4,$5,$6)",
      [c.tenantId, company, c.actor.userId, key, fingerprint, JSON.stringify(result)],
    );
    return result;
  }
}
