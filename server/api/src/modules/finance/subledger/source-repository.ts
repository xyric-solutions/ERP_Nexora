import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  purchaseLineSchema,
  calculateTax,
  absolute,
  convertMinor,
  decimal,
  decimalText,
  divideRounded,
  proportionalMinor,
  subledgerActionSchema,
  subledgerItemSchema,
  subledgerOperationInputSchema,
  subledgerOperationSchema,
  subledgerPartyInputSchema,
  subledgerPartySchema,
  subledgerPolicyInputSchema,
  subledgerPolicySchema,
  subledgerWorkspaceSchema,
  subledgerPreviewSchema,
  type SubledgerAction,
  type SubledgerInput,
  type SubledgerItem,
  type SubledgerOperation,
  type SubledgerPartyInput,
  type SubledgerPolicy,
  type SubledgerPolicyInput,
  type SubledgerQuery,
  type SubledgerWorkspace,
} from "@nexora/contracts";
import type { BankingActorContext } from "../../banking/source-repository.js";
import { companyAuthoritySql } from "../../security/company-authority.js";
import { resolveTax, recordTaxApplications, reverseTaxApplications, TaxError } from "../taxes/resolver.js";
import { itemBalancesSql, itemBalanceParameters } from "./queries.js";
import {
  resolveCompanyBaseCurrency,
  resolveCompanyCurrencyAuthority,
  CompanyCurrencyAuthorityError,
} from "../currencies/company-authority.js";
import { FinancePostingService } from "../posting/service.js";
import {
  createFinanceTransactionClient,
  FinancePostingError,
  type FinanceMultiCurrencyPostingLine,
} from "../posting/types.js";

export class SubledgerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function reject(message: string, code = "SUBLEDGER_VALIDATION_FAILED", status = 409): never {
  throw new SubledgerError(status, code, message);
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const dbMinor = (value: string, scale: number) => decimal(value, 8, true) / 10n ** BigInt(8 - scale);
const sideSign = (side: "receivable" | "payable") => (side === "receivable" ? 1n : -1n);
const previewSchema = subledgerPreviewSchema;
type Preview = z.infer<typeof previewSchema>;
type Authority = Awaited<ReturnType<typeof resolveCompanyCurrencyAuthority>>;
type OperationRow = {
  id: string;
  code: string;
  company_id: string;
  type: string;
  date: string;
  state: string;
  version: number;
  maker_id: string;
  approver_id: string | null;
  journal_id: string | null;
  input: unknown;
  preview: unknown;
  preview_hash: string | null;
};
const operationProjection = `id,code,company_id,type,operation_date::text as date,state,version,maker_id,approver_id,journal_id,payload as input,preview,preview_hash`;

export class SourceSubledgerRepository {
  constructor(
    readonly pool: Pool,
    private readonly finance = new FinancePostingService(),
  ) {}

  async transaction<T>(
    context: BankingActorContext,
    company: string,
    permission: string,
    write: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission))
      reject("The required financial permission is missing.", "PERMISSION_DENIED", 403);
    if (write && (context.realActorId || context.impersonationRequestId))
      reject("Financial changes are disabled during impersonation.", "IMPERSONATION_RESTRICTED", 403);
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
        reject("Financial access is not available for this company.", "COMPANY_ACCESS_DENIED", 403);
      // One company posting stream protects valuation cutoffs and multi-item allocations.
      // Reads do not take this lock; different companies progress independently.
      if (write)
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `subledger:${context.tenantId}:${company}`,
        ]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error instanceof SubledgerError) throw error;
      if (error instanceof TaxError) throw new SubledgerError(error.status, error.code, error.message);
      if (error instanceof CompanyCurrencyAuthorityError || error instanceof FinancePostingError)
        throw new SubledgerError(error.status, error.code, error.message);
      if (error instanceof z.ZodError)
        throw new SubledgerError(400, "SUBLEDGER_INPUT_INVALID", "Financial input or stored evidence is invalid.");
      if (error instanceof Error && /decimal|Allocation exceeds|exchange rate/i.test(error.message))
        throw new SubledgerError(400, "SUBLEDGER_AMOUNT_INVALID", error.message);
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23503", "23505", "23514", "40001", "40P01"].includes(String(error.code))
      ) {
        const mapped = new SubledgerError(
          409,
          "SUBLEDGER_CONFLICT",
          "Financial evidence conflicts with a constraint or concurrent change. Refresh and retry.",
        );
        Object.defineProperty(mapped, "cause", { value: error });
        throw mapped;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async idempotent<T>(
    client: PoolClient,
    context: BankingActorContext,
    company: string,
    key: string,
    input: unknown,
    parse: (value: unknown) => T,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      reject("A valid idempotency key is required.", "INVALID_IDEMPOTENCY_KEY", 400);
    const fingerprint = hash(input);
    const prior = (
      await client.query<{ fingerprint: string; result: unknown }>(
        "select fingerprint,result from finance_subledger_idempotency where tenant_id=$1 and company_id=$2 and actor_id=$3 and key=$4",
        [context.tenantId, company, context.actor.userId, key],
      )
    ).rows[0];
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        reject("This idempotency key belongs to another request.", "IDEMPOTENCY_CONFLICT");
      return parse(prior.result);
    }
    const result = await work();
    await client.query(
      "insert into finance_subledger_idempotency(tenant_id,company_id,actor_id,key,fingerprint,result) values($1,$2,$3,$4,$5,$6)",
      [context.tenantId, company, context.actor.userId, key, fingerprint, JSON.stringify(result)],
    );
    return result;
  }

  private async audit(
    client: PoolClient,
    context: BankingActorContext,
    company: string,
    action: string,
    operation: string | null,
    reason: string,
    evidence: unknown,
  ) {
    await client.query(
      "insert into finance_subledger_audit(tenant_id,company_id,id,operation_id,action,actor_id,reason,evidence) values($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        context.tenantId,
        company,
        randomUUID(),
        operation,
        action,
        context.actor.userId,
        reason,
        JSON.stringify(evidence),
      ],
    );
  }

  private async code(client: PoolClient, tenant: string, company: string, prefix: string): Promise<string> {
    const value = (
      await client.query<{ value: string }>(
        `insert into finance_subledger_sequence(tenant_id,company_id,prefix,next_value) values($1,$2,$3,2)
      on conflict(tenant_id,company_id,prefix) do update set next_value=finance_subledger_sequence.next_value+1 returning (next_value-1)::text as value`,
        [tenant, company, prefix],
      )
    ).rows[0]!;
    return `${prefix}-${value.value.padStart(3, "0")}`;
  }

  async createParty(context: BankingActorContext, raw: SubledgerPartyInput, key: string) {
    const input = subledgerPartyInputSchema.parse(raw);
    return this.transaction(context, input.company_id, "finance.subledger.manage", true, (client) =>
      this.idempotent(
        client,
        context,
        input.company_id,
        key,
        { action: "party", input },
        (value) => subledgerPartySchema.parse(value),
        async () => {
          const currency = await client.query(
            "select 1 from company_currency where tenant_id=$1 and company_id=$2 and currency_code=$3 and status='active'",
            [context.tenantId, input.company_id, input.default_currency],
          );
          if (!currency.rowCount) reject("Activate the party's currency for this company first.");
          if (input.source_supplier_id) {
            const supplier = (
              await client.query<{ name: string }>(
                "select name from procurement_supplier where tenant_id=$1 and company_id=$2 and id=$3",
                [context.tenantId, input.company_id, input.source_supplier_id],
              )
            ).rows[0];
            if (input.kind !== "supplier" || !supplier || supplier.name !== input.name)
              reject("The supplier reference does not match the company supplier.");
          }
          const result = {
            ...input,
            id: randomUUID(),
            code: await this.code(
              client,
              context.tenantId,
              input.company_id,
              input.kind === "customer" ? "CUS" : "VEN",
            ),
          };
          await client.query(
            "insert into finance_subledger_party(tenant_id,company_id,id,kind,code,name,default_currency,source_supplier_id,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            [
              context.tenantId,
              input.company_id,
              result.id,
              input.kind,
              result.code,
              input.name,
              input.default_currency,
              input.source_supplier_id ?? null,
              context.actor.userId,
            ],
          );
          await this.audit(
            client,
            context,
            input.company_id,
            "party_created",
            null,
            "Created persistent financial party",
            result,
          );
          return subledgerPartySchema.parse(result);
        },
      ),
    );
  }

  async configure(context: BankingActorContext, raw: SubledgerPolicyInput, key: string) {
    const input = subledgerPolicyInputSchema.parse(raw);
    return this.transaction(context, input.company_id, "finance.subledger.manage", true, (client) =>
      this.idempotent(
        client,
        context,
        input.company_id,
        key,
        { action: "policy", input },
        (value) => subledgerPolicySchema.parse(value),
        async () => {
          const prior = await this.policy(client, context.tenantId, input.company_id, false);
          if ((prior?.version ?? 0) !== input.expected_version)
            reject("The accounting policy changed. Refresh its version.", "STALE_VERSION");
          const roles = [
            "receivable",
            "payable",
            "revenue",
            "expense",
            "realized_gain",
            "realized_loss",
            "unrealized_gain",
            "unrealized_loss",
          ] as const;
          const ids = roles.map((role) => input[`${role}_account_id`]);
          if (new Set(ids).size !== ids.length) reject("Use distinct control, income, expense and FX accounts.");
          const accounts = (
            await client.query<{ id: string; type: string }>(
              "select id,type from account where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and status='active' and not is_header",
              [context.tenantId, input.company_id, ids],
            )
          ).rows;
          const types = ["asset", "liability", "revenue", "expense", "revenue", "expense", "revenue", "expense"];
          roles.forEach((role, i) => {
            if (accounts.find((account) => account.id === input[`${role}_account_id`])?.type !== types[i])
              reject(`Select an active posting ${types[i]} account for ${role.replaceAll("_", " ")}.`);
          });
          if (
            prior &&
            (prior.receivable_account_id !== input.receivable_account_id ||
              prior.payable_account_id !== input.payable_account_id) &&
            (
              await client.query("select 1 from finance_subledger_item where tenant_id=$1 and company_id=$2 limit 1", [
                context.tenantId,
                input.company_id,
              ])
            ).rowCount
          )
            reject("Control accounts cannot change after open-item activity. Use a governed migration.");
          const version = input.expected_version + 1;
          await client.query(
            `insert into finance_subledger_policy(tenant_id,company_id,version,${roles.map((role) => `${role}_account_id`).join(",")},created_by) values(${Array.from({ length: 12 }, (_, i) => `$${i + 1}`).join(",")})`,
            [context.tenantId, input.company_id, version, ...ids, context.actor.userId],
          );
          const result = subledgerPolicySchema.parse({
            ...Object.fromEntries(Object.entries(input).filter(([key]) => key !== "expected_version")),
            version,
          });
          await this.audit(
            client,
            context,
            input.company_id,
            "policy_created",
            null,
            "Versioned currency accounting policy",
            result,
          );
          return result;
        },
      ),
    );
  }

  private async policy(
    client: PoolClient,
    tenant: string,
    company: string,
    required = true,
  ): Promise<SubledgerPolicy | null> {
    const result = (
      await client.query(
        "select company_id,version,receivable_account_id,payable_account_id,revenue_account_id,expense_account_id,realized_gain_account_id,realized_loss_account_id,unrealized_gain_account_id,unrealized_loss_account_id from finance_subledger_policy where tenant_id=$1 and company_id=$2 order by version desc limit 1",
        [tenant, company],
      )
    ).rows[0];
    if (!result && required)
      reject(
        "Configure the company's subledger accounting policy before preparing financial documents.",
        "SUBLEDGER_POLICY_MISSING",
      );
    return result ? subledgerPolicySchema.parse(result) : null;
  }

  /** All values are derived as of a date from immutable events, not mutable balances. */
  async items(
    client: PoolClient,
    tenant: string,
    query: Pick<SubledgerQuery, "company_id" | "as_of" | "party_id" | "side" | "currency">,
    options: { limit?: number; offset?: number; openOnly?: boolean; monetaryOnly?: boolean; ids?: string[] } = {},
  ): Promise<SubledgerItem[]> {
    const rows = (
      await client.query<{
        id: string;
        code: string;
        party_id: string;
        party_name: string;
        side: "receivable" | "payable";
        kind: "invoice" | "credit_note" | "advance";
        currency: string;
        base_currency: string;
        decimal_places: number;
        base_decimal_places: number;
        date: string;
        due_date: string;
        original_amount: string;
        original_base: string;
        outstanding: string;
        carrying: string;
        historical: string;
        unrealized: string;
        monetary: boolean;
        control_account_id: string;
        journal_id: string;
        rate: string;
        rate_id: string | null;
      }>(
        `${itemBalancesSql} select id,code,party_id,party_name,side,kind,currency,base_currency,decimal_places,base_decimal_places,
        document_date::text as date,due_date::text,original_amount::text,original_base::text,outstanding::text,carrying::text,historical::text,unrealized::text,
        monetary,control_account_id,journal_id,rate::text,rate_id from item_balances
        where (not $7::boolean or outstanding<>0) and ($8::text[] is null or id=any($8::text[]))
        and (not $11::boolean or monetary)
        order by document_date,id limit $9 offset $10`,
        [
          ...itemBalanceParameters(tenant, query),
          options.openOnly ?? false,
          options.ids ?? null,
          options.limit ?? 2001,
          options.offset ?? 0,
          options.monetaryOnly ?? false,
        ],
      )
    ).rows;
    return rows.map((row) =>
      subledgerItemSchema.parse({
        ...row,
        original_amount: decimalText(dbMinor(row.original_amount, row.decimal_places), row.decimal_places),
        original_base: decimalText(dbMinor(row.original_base, row.base_decimal_places), row.base_decimal_places),
        outstanding: decimalText(dbMinor(row.outstanding, row.decimal_places), row.decimal_places),
        carrying: decimalText(dbMinor(row.carrying, row.base_decimal_places), row.base_decimal_places),
        historical: decimalText(dbMinor(row.historical, row.base_decimal_places), row.base_decimal_places),
        unrealized: decimalText(dbMinor(row.unrealized, row.base_decimal_places), row.base_decimal_places),
      }),
    );
  }

  async workspace(context: BankingActorContext, query: SubledgerQuery): Promise<SubledgerWorkspace> {
    return this.transaction(context, query.company_id, "finance.subledger.read", false, async (client) => {
      const base = await resolveCompanyBaseCurrency(client, context.tenantId, query.company_id, false);
      const values = itemBalanceParameters(context.tenantId, query);
      const items = await this.items(client, context.tenantId, query, { limit: query.limit, offset: query.offset });
      const totals = (
        await client.query<{ total: number; carrying: string; unrealized: string }>(
          `${itemBalancesSql} select count(*)::integer as total,coalesce(sum(carrying),0)::text as carrying,coalesce(sum(unrealized),0)::text as unrealized from item_balances`,
          values,
        )
      ).rows[0]!;
      const balancesSql = `${itemBalancesSql}, currency_balances as (
        select party_id,party_name,side,currency,base_currency,decimal_places,
        sum(outstanding)::text as outstanding,sum(carrying)::text as carrying,sum(unrealized)::text as unrealized,
        sum(case when overdue_days<=0 then outstanding else 0 end)::text as current,
        sum(case when overdue_days between 1 and 30 then outstanding else 0 end)::text as days_1_30,
        sum(case when overdue_days between 31 and 60 then outstanding else 0 end)::text as days_31_60,
        sum(case when overdue_days between 61 and 90 then outstanding else 0 end)::text as days_61_90,
        sum(case when overdue_days>90 then outstanding else 0 end)::text as days_over_90
        from item_balances group by party_id,party_name,side,currency,base_currency,decimal_places
      )`;
      const balanceCount = (
        await client.query<{ total: number }>(
          `${balancesSql} select count(*)::integer as total from currency_balances`,
          values,
        )
      ).rows[0]!.total;
      const balances = (
        await client.query<{
          party_id: string;
          party_name: string;
          side: string;
          currency: string;
          base_currency: string;
          decimal_places: number;
          outstanding: string;
          carrying: string;
          unrealized: string;
          current: string;
          days_1_30: string;
          days_31_60: string;
          days_61_90: string;
          days_over_90: string;
        }>(`${balancesSql} select * from currency_balances order by party_name,party_id,currency limit $7 offset $8`, [
          ...values,
          query.limit,
          query.offset,
        ])
      ).rows.map((row) => {
        const { decimal_places: scale, ...rest } = row;
        return {
          ...rest,
          outstanding: decimalText(dbMinor(row.outstanding, scale), scale),
          carrying: decimalText(dbMinor(row.carrying, base.decimalPlaces), base.decimalPlaces),
          unrealized: decimalText(dbMinor(row.unrealized, base.decimalPlaces), base.decimalPlaces),
          ...Object.fromEntries(
            (["current", "days_1_30", "days_31_60", "days_61_90", "days_over_90"] as const).map((key) => [
              key,
              decimalText(dbMinor(row[key], scale), scale),
            ]),
          ),
        };
      });
      const parties = (
        await client.query(
          "select id,company_id,kind,code,name,default_currency,source_supplier_id from finance_subledger_party where tenant_id=$1 and company_id=$2 order by name,id",
          [context.tenantId, query.company_id],
        )
      ).rows.map((row) =>
        subledgerPartySchema.parse({ ...row, source_supplier_id: row.source_supplier_id ?? undefined }),
      );
      const operationFilter = `tenant_id=$1 and company_id=$2 and operation_date<=$3::date
        and ($4::text is null or payload->>'side'=$4 or type='reversal')
        and ($5::text is null or payload->>'party_id'=$5 or type='revaluation' or type='reversal')
        and ($6::text is null or payload->>'currency'=$6 or payload->>'payment_currency'=$6 or type in ('offset','reversal'))`;
      const operationValues = [
        context.tenantId,
        query.company_id,
        query.as_of,
        query.side ?? null,
        query.party_id ?? null,
        query.currency ?? null,
      ];
      const operations = (
        await client.query<OperationRow>(
          `select ${operationProjection} from finance_subledger_operation where ${operationFilter} order by created_at desc,id limit $7 offset $8`,
          [...operationValues, query.limit, query.offset],
        )
      ).rows.map((row) => this.operation(row));
      const count = (
        await client.query<{ total: number }>(
          `select count(*)::integer as total from finance_subledger_operation where ${operationFilter}`,
          operationValues,
        )
      ).rows[0]!.total;
      return subledgerWorkspaceSchema.parse({
        company_id: query.company_id,
        base_currency: base.code,
        base_decimal_places: base.decimalPlaces,
        as_of: query.as_of,
        parties,
        policy: await this.policy(client, context.tenantId, query.company_id, false),
        items,
        total_items: totals.total,
        operations,
        total_operations: count,
        balances,
        total_balances: balanceCount,
        carrying_total: decimalText(dbMinor(totals.carrying, base.decimalPlaces), base.decimalPlaces),
        unrealized_total: decimalText(dbMinor(totals.unrealized, base.decimalPlaces), base.decimalPlaces),
        accounts: (
          await client.query(
            "select id,code,name,type from account where tenant_id=$1 and company_id=$2 and status='active' and not is_header order by code",
            [context.tenantId, query.company_id],
          )
        ).rows,
        banks: (
          await client.query(
            "select id,account_name as name,currency from bank_account where tenant_id=$1 and company_id=$2 and status='active' order by account_name",
            [context.tenantId, query.company_id],
          )
        ).rows,
        currencies: (
          await client.query(
            "select c.currency_code as code,s.decimal_places from company_currency c join currency s on s.tenant_id=c.tenant_id and s.code=c.currency_code where c.tenant_id=$1 and c.company_id=$2 and c.status='active' and s.status='active' order by c.currency_code",
            [context.tenantId, query.company_id],
          )
        ).rows,
      });
    });
  }

  private operation(row: OperationRow): SubledgerOperation {
    const value = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "preview_hash"));
    return subledgerOperationSchema.parse(value);
  }
  private async loadOperation(client: PoolClient, tenant: string, company: string, id: string): Promise<OperationRow> {
    const row = (
      await client.query<OperationRow>(
        `select ${operationProjection} from finance_subledger_operation where tenant_id=$1 and company_id=$2 and id=$3 for update`,
        [tenant, company, id],
      )
    ).rows[0];
    if (!row) reject("Financial operation was not found in this company.", "NOT_FOUND", 404);
    return row;
  }

  private async preview(
    client: PoolClient,
    context: BankingActorContext,
    input: SubledgerInput,
    id: string,
    code: string,
  ): Promise<Preview> {
    const policy = (await this.policy(client, context.tenantId, input.company_id))!;
    const base = await resolveCompanyBaseCurrency(client, context.tenantId, input.company_id);
    const result: Preview = {
      base_currency: base.code,
      base_decimal_places: base.decimalPlaces,
      policy_version: policy.version,
      lines: [],
      deltas: [],
      item: null,
      sources: [],
      realized_gain: decimalText(0n, base.decimalPlaces),
      unrealized_gain: decimalText(0n, base.decimalPlaces),
      rounding: decimalText(0n, base.decimalPlaces),
      fx_by_item: [],
      taxes: [],
    };
    const authorityCache = new Map<string, Authority>();
    const authority = async (currency: string) => {
      let value = authorityCache.get(currency);
      if (!value) {
        value = await resolveCompanyCurrencyAuthority(client, {
          tenantId: context.tenantId,
          companyId: input.company_id,
          sourceCurrency: currency,
          effectiveOnOrBefore: input.date,
        });
        authorityCache.set(currency, value);
      }
      return value;
    };
    const add = (account: string, signedDebit: bigint, currency: string, a: Authority, description: string) => {
      if (signedDebit === 0n) return;
      result.lines.push({
        accountId: account,
        debit: decimalText(signedDebit > 0n ? signedDebit : 0n, a.sourceDecimalPlaces),
        credit: decimalText(signedDebit < 0n ? -signedDebit : 0n, a.sourceDecimalPlaces),
        currency,
        exchangeRateId: a.rateId,
        exchangeRateValue: a.rateValue,
        exchangeRateDate: a.rateEffectiveDate,
        dimensions: {},
        description,
      });
    };
    const baseAuthority = await authority(base.code);
    const addBase = (account: string, amount: bigint, description: string) =>
      add(account, amount, base.code, baseAuthority, description);
    const gain = (amount: bigint, unrealized: boolean, description: string) => {
      addBase(
        amount >= 0n
          ? unrealized
            ? policy.unrealized_gain_account_id
            : policy.realized_gain_account_id
          : unrealized
            ? policy.unrealized_loss_account_id
            : policy.realized_loss_account_id,
        -amount,
        description,
      );
    };
    const bank = async (bankId: string, currency: string) => {
      const row = (
        await client.query<{ account_id: string; currency: string; overdraft_limit: string }>(
          "select account_id,currency,overdraft_limit::text from bank_account where tenant_id=$1 and company_id=$2 and id=$3 and status='active' for update",
          [context.tenantId, input.company_id, bankId],
        )
      ).rows[0];
      if (!row || row.currency !== currency) reject("Select an active bank account in the payment currency.");
      return row;
    };
    const checkBankCash = async (account: Awaited<ReturnType<typeof bank>>, cash: bigint, scale: number) => {
      const position = (
        await client.query<{ balance: string; latest: string | null }>(
          `select coalesce(sum(case when l.currency=$4 then l.debit-l.credit else 0 end),0)::text as balance,max(j.posting_date)::text as latest
        from journal_entry j join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id
        where j.tenant_id=$1 and j.company_id=$2 and l.account_id=$3 and j.status in ('posted','reversed')`,
          [context.tenantId, input.company_id, account.account_id, account.currency],
        )
      ).rows[0]!;
      if (position.latest && position.latest > input.date)
        reject(
          "Later bank activity exists. Use the current posting date or a governed correction.",
          "BANK_DATE_CONFLICT",
        );
      if (dbMinor(position.balance, scale) + cash < -dbMinor(account.overdraft_limit, scale))
        reject("This payment exceeds the bank's available balance and approved overdraft.", "BANK_INSUFFICIENT_FUNDS");
    };
    if (input.type === "reversal") {
      const original = await this.loadOperation(client, context.tenantId, input.company_id, input.operation_id);
      if (original.state !== "posted" || original.type === "reversal" || original.date > input.date)
        reject("Choose a posted original operation dated on or before the reversal.");
      if (
        (
          await client.query(
            "select 1 from finance_subledger_operation where tenant_id=$1 and company_id=$2 and state='posted' and type='reversal' and payload->>'operation_id'=$3",
            [context.tenantId, input.company_id, original.id],
          )
        ).rowCount
      )
        reject("This operation was already reversed.");
      const postedPreview = previewSchema.parse(original.preview);
      result.taxes = postedPreview.taxes.map((tax) => ({
        ...tax,
        basis: decimalText(-decimal(tax.basis, tax.decimal_places, true), tax.decimal_places),
        amount: decimalText(-decimal(tax.amount, tax.decimal_places, true), tax.decimal_places),
      }));
      const reversedBanks = (
        await client.query<{ id: string; currency: string; decimal_places: number }>(
          `select b.id,b.currency,c.decimal_places from bank_account b join currency c on c.tenant_id=b.tenant_id and c.code=b.currency
         where b.tenant_id=$1 and b.company_id=$2 and b.account_id=any($3::text[])`,
          [context.tenantId, input.company_id, postedPreview.lines.map((line) => line.accountId)],
        )
      ).rows;
      for (const row of reversedBanks) {
        const account = await bank(row.id, row.currency);
        const originalCash = postedPreview.lines
          .filter((line) => line.accountId === account.account_id && line.currency === row.currency)
          .reduce(
            (sum, line) => sum + dbMinor(line.debit, row.decimal_places) - dbMinor(line.credit, row.decimal_places),
            0n,
          );
        await checkBankCash(account, -originalCash, row.decimal_places);
      }
      for (const delta of postedPreview.deltas) {
        if (
          (
            await client.query(
              `select 1 from finance_subledger_item_event where tenant_id=$1 and company_id=$2 and item_id=$3 and operation_id<>$4
               and (event_date>$5::date or (event_date=$5::date and created_at>(select created_at from finance_subledger_item_event where tenant_id=$1 and company_id=$2 and item_id=$3 and operation_id=$4)))
               having max(event_date)>$6::date or coalesce(sum(foreign_delta),0)<>0 or coalesce(sum(base_delta),0)<>0
                 or coalesce(sum(historical_delta),0)<>0 or coalesce(sum(unrealized_delta),0)<>0`,
              [context.tenantId, input.company_id, delta.item_id, original.id, original.date, input.date],
            )
          ).rowCount
        )
          reject("Reverse the item's later financial effects before reversing this operation.");
      }
      result.sources = await this.items(
        client,
        context.tenantId,
        { company_id: input.company_id, as_of: input.date },
        { ids: postedPreview.deltas.map((delta) => delta.item_id), limit: 500 },
      );
      result.deltas = postedPreview.deltas.map((delta) => ({
        item_id: delta.item_id,
        foreign: decimalText(-decimal(delta.foreign, 8, true), 8),
        base: decimalText(-decimal(delta.base, 8, true), 8),
        historical: decimalText(-decimal(delta.historical, 8, true), 8),
        unrealized: decimalText(-decimal(delta.unrealized, 8, true), 8),
      }));
      // The Finance reverse command preserves the exact original native/base snapshots.
      result.lines = postedPreview.lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit }));
      result.realized_gain = decimalText(
        -decimal(postedPreview.realized_gain, base.decimalPlaces, true),
        base.decimalPlaces,
      );
      result.unrealized_gain = decimalText(
        -decimal(postedPreview.unrealized_gain, base.decimalPlaces, true),
        base.decimalPlaces,
      );
      result.rounding = decimalText(-decimal(postedPreview.rounding, base.decimalPlaces, true), base.decimalPlaces);
      result.fx_by_item = postedPreview.fx_by_item.map((fx) => ({
        item_id: fx.item_id,
        realized: decimalText(-decimal(fx.realized, base.decimalPlaces, true), base.decimalPlaces),
        unrealized: decimalText(-decimal(fx.unrealized, base.decimalPlaces, true), base.decimalPlaces),
      }));
      return result;
    }
    if ("party_id" in input && input.party_id) {
      const party = (
        await client.query<{ kind: string }>(
          "select kind from finance_subledger_party where tenant_id=$1 and company_id=$2 and id=$3",
          [context.tenantId, input.company_id, input.party_id],
        )
      ).rows[0];
      if (!party || party.kind !== (input.side === "receivable" ? "customer" : "supplier"))
        reject("Select the matching customer or supplier in this company.");
    }
    const orientation = sideSign(input.side);
    let control = input.side === "receivable" ? policy.receivable_account_id : policy.payable_account_id;
    if (input.type === "recognition") {
      const a = await authority(input.currency);
      const basis = decimal(input.amount, a.sourceDecimalPlaces);
      if (
        input.tax_definition_id &&
        (input.tax_amount !== undefined || input.tax_account_id || input.kind === "advance")
      )
        reject("A governed tax cannot be combined with manual tax overrides or an advance.");
      const sourceTaxDocument = input.source_document_id
        ? (
            await client.query<{ lines: unknown; date: string }>(
              "select lines,coalesce(bill_date,document_date)::text as date from procurement_document where tenant_id=$1 and company_id=$2 and id=$3 and kind='bill' and state='approved'",
              [context.tenantId, input.company_id, input.source_document_id],
            )
          ).rows[0]
        : undefined;
      const sourceTaxLines = sourceTaxDocument ? purchaseLineSchema.array().parse(sourceTaxDocument.lines) : [];
      const sourceGoverned = sourceTaxLines.some((line) => line.tax_definition_id);
      const governedTaxes = [];
      if (sourceGoverned) {
        if (input.tax_amount !== undefined || input.tax_account_id)
          reject("An approved governed bill resolves its own tax mappings; manual overrides are not allowed.");
        let sourceBasis = 0n;
        for (const line of sourceTaxLines) {
          const units = divideRounded(decimal(line.quantity, 4) * decimal(line.unit_price, 2), 10000n);
          sourceBasis += units;
          if (!line.tax_definition_id) {
            if (decimal(line.tax_percent, 2) !== 0n)
              reject("Mixed governed and manual nonzero bill taxes require separate accounting documents.");
            continue;
          }
          const tax = await resolveTax(client, {
            tenant: context.tenantId,
            company: input.company_id,
            definition: line.tax_definition_id,
            date: sourceTaxDocument!.date,
            module: "purchases",
            trigger: "recognition",
            currency: input.currency,
            precision: a.sourceDecimalPlaces,
            basis: decimalText(units, 2),
          });
          if (
            tax.treatment !== "recoverable" ||
            !line.tax_snapshot ||
            tax.revision !== line.tax_snapshot.revision ||
            tax.account_id !== line.tax_snapshot.account_id ||
            tax.amount !== line.tax_snapshot.amount
          )
            reject(
              "The approved bill tax evidence changed; use its governed source correction workflow.",
              "TAX_SNAPSHOT_CHANGED",
            );
          tax.source_item_id = line.id;
          governedTaxes.push(tax);
        }
        if (a.sourceDecimalPlaces !== 2 || sourceBasis !== basis)
          reject("The accounting taxable basis must match the approved governed bill's exact line bases.");
        if (input.tax_definition_id && !governedTaxes.some((tax) => tax.definition_id === input.tax_definition_id))
          reject("Tax selection does not match the approved bill.");
      } else if (input.tax_definition_id)
        governedTaxes.push(
          await resolveTax(client, {
            tenant: context.tenantId,
            company: input.company_id,
            definition: input.tax_definition_id,
            date: input.date,
            module: input.side === "receivable" ? "sales" : "purchases",
            trigger: "recognition",
            currency: input.currency,
            precision: a.sourceDecimalPlaces,
            basis: decimalText(input.kind === "credit_note" ? -basis : basis, a.sourceDecimalPlaces),
          }),
        );
      const governed = governedTaxes[0] ?? null;
      result.taxes.push(...governedTaxes);
      const withholding = governed?.treatment === "withholding";
      const tax = governed
        ? governedTaxes.reduce((sum, tax) => sum + absolute(decimal(tax.amount, a.sourceDecimalPlaces, true)), 0n)
        : decimal(input.tax_amount ?? "0", a.sourceDecimalPlaces);
      const positive = governed ? (withholding ? basis - tax : basis + tax) : basis;
      if ((!withholding && tax >= positive) || (input.kind === "advance" && tax !== 0n))
        reject("Tax must be less than the document total; advances do not recognize invoice tax.");
      if (positive <= 0n || input.due_date < input.date)
        reject("Enter a positive amount and a due date on or after recognition.");
      if (!input.monetary && input.kind !== "advance") reject("Only classified advances can be nonmonetary.");
      if (
        (
          await client.query(
            `select 1 from finance_subledger_operation where tenant_id=$1 and company_id=$2 and type='revaluation' and state='posted'
        and payload->>'side'=$3 and payload->>'currency'=$4 and operation_date>=$5::date
        and (payload->>'party_id' is null or payload->>'party_id'=$6)
        limit 1`,
            [context.tenantId, input.company_id, input.side, input.currency, input.date, input.party_id],
          )
        ).rowCount
      )
        reject(
          "A posted valuation locks this historical cutoff. Use a correction dated after that cutoff.",
          "VALUATION_CUTOFF_LOCKED",
        );
      const signed = input.kind === "invoice" ? positive : -positive;
      const carrying = convertMinor(signed, a.sourceDecimalPlaces, a.rateValue, base.decimalPlaces);
      if (carrying === 0n) reject("The functional amount rounds to zero.");
      let counter =
        input.counter_account_id ??
        (input.side === "receivable" ? policy.revenue_account_id : policy.expense_account_id);
      if (input.kind === "advance") {
        if (!input.bank_account_id) reject("An advance requires its actual bank account.");
        const advanceBank = await bank(input.bank_account_id, input.currency);
        await checkBankCash(advanceBank, -signed * orientation, a.sourceDecimalPlaces);
        counter = advanceBank.account_id;
        if (!input.monetary) {
          if (!input.counter_account_id) reject("Select the nonmonetary advance control account explicitly.");
          const advanceAccount = (
            await client.query<{ type: string }>(
              "select type from account where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and not is_header",
              [context.tenantId, input.company_id, input.counter_account_id],
            )
          ).rows[0];
          if (advanceAccount?.type !== (input.side === "receivable" ? "liability" : "asset"))
            reject(
              "A customer prepayment needs a deferred-income liability; a supplier prepayment needs an asset account.",
            );
          control = input.counter_account_id;
        }
      } else if (input.counter_account_id) {
        const account = (
          await client.query<{ type: string }>(
            "select type from account where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and not is_header",
            [context.tenantId, input.company_id, counter],
          )
        ).rows[0];
        if (account?.type !== (input.side === "receivable" ? "revenue" : "expense"))
          reject("Select a matching revenue or expense account.");
      }
      if (input.source_document_id) {
        const source = (
          await client.query<{ currency: string; total: string; net: string }>(
            `select d.currency,d.total_amount::text as total,
          (select sum(round((l->>'quantity')::numeric*(l->>'unit_price')::numeric,2))::text from jsonb_array_elements(d.lines) l) as net
          from procurement_document d join finance_subledger_party p
          on p.tenant_id=d.tenant_id and p.company_id=d.company_id and p.source_supplier_id=d.supplier_id
          where d.tenant_id=$1 and d.company_id=$2 and d.id=$3 and p.id=$4 and d.kind='bill' and d.state='approved'`,
            [context.tenantId, input.company_id, input.source_document_id, input.party_id],
          )
        ).rows[0];
        if (
          input.side !== "payable" ||
          input.kind !== "invoice" ||
          !source ||
          source.currency !== input.currency ||
          decimal(source.total, 8) !== decimal(decimalText(withholding ? basis : positive, a.sourceDecimalPlaces), 8) ||
          decimal(source.total, 8) - decimal(source.net, 8) !==
            decimal(decimalText(withholding ? 0n : tax, a.sourceDecimalPlaces), 8)
        )
          reject("The source must be this supplier's approved bill with matching currency and amount.");
      }
      const partyName = (
        await client.query<{ name: string }>(
          "select name from finance_subledger_party where tenant_id=$1 and company_id=$2 and id=$3",
          [context.tenantId, input.company_id, input.party_id],
        )
      ).rows[0]!.name;
      result.item = {
        id,
        code,
        party_id: input.party_id,
        party_name: partyName,
        side: input.side,
        kind: input.kind,
        currency: input.currency,
        base_currency: base.code,
        decimal_places: a.sourceDecimalPlaces,
        base_decimal_places: base.decimalPlaces,
        date: input.date,
        due_date: input.due_date,
        original_amount: decimalText(signed, a.sourceDecimalPlaces),
        original_base: decimalText(carrying, base.decimalPlaces),
        outstanding: decimalText(signed, a.sourceDecimalPlaces),
        carrying: decimalText(carrying, base.decimalPlaces),
        historical: decimalText(carrying, base.decimalPlaces),
        unrealized: decimalText(0n, base.decimalPlaces),
        monetary: input.monetary,
        control_account_id: control,
        rate: a.rateValue,
        rate_id: a.rateId,
      };
      add(control, signed * orientation, input.currency, a, `${code} control`);
      const signedTax = signed > 0n ? tax : -tax;
      add(
        counter,
        -(withholding ? signed + signedTax : signed - signedTax) * orientation,
        input.currency,
        a,
        `${code} recognition`,
      );
      if (tax > 0n) {
        const postings = governedTaxes.length
          ? governedTaxes
          : [{ account_id: input.tax_account_id, amount: decimalText(signedTax, a.sourceDecimalPlaces) }];
        for (const posting of postings) {
          const taxAccountId = posting.account_id;
          if (!taxAccountId || [policy.receivable_account_id, policy.payable_account_id].includes(taxAccountId))
            reject("Select a separate company tax posting account.");
          const taxAccount = (
            await client.query<{ type: string }>(
              "select type from account where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and not is_header",
              [context.tenantId, input.company_id, taxAccountId],
            )
          ).rows[0];
          if (taxAccount?.type !== (input.side === "receivable" || withholding ? "liability" : "asset"))
            reject("Select an output/withholding liability or recoverable input-tax asset as appropriate.");
          const units = decimal(posting.amount, a.sourceDecimalPlaces, true);
          add(taxAccountId, withholding ? -units : -units * orientation, input.currency, a, `${code} tax control`);
        }
        const residual = result.lines.reduce(
          (sum, line) =>
            sum +
            convertMinor(
              decimal(line.debit, a.sourceDecimalPlaces) - decimal(line.credit, a.sourceDecimalPlaces),
              a.sourceDecimalPlaces,
              a.rateValue,
              base.decimalPlaces,
            ),
          0n,
        );
        addBase(policy.expense_account_id, -residual, `${code} tax conversion rounding`);
        result.rounding = decimalText(residual, base.decimalPlaces);
      }
      result.deltas.push({
        item_id: id,
        foreign: result.item.original_amount,
        base: result.item.original_base,
        historical: result.item.original_base,
        unrealized: "0",
      });
      return result;
    }
    const candidates = await this.items(
      client,
      context.tenantId,
      {
        company_id: input.company_id,
        as_of: input.date,
        side: input.side,
        ...("party_id" in input && input.party_id ? { party_id: input.party_id } : {}),
        ...(input.type === "revaluation" ? { currency: input.currency } : {}),
      },
      input.type === "revaluation"
        ? { openOnly: true, monetaryOnly: true, limit: 501 }
        : { ids: input.allocations.map((allocation) => allocation.item_id), limit: 40 },
    );
    if (input.type === "revaluation") {
      if (input.currency === base.code) reject("Functional-currency balances do not require FX revaluation.");
      const a = await authority(input.currency);
      result.sources = candidates.filter(
        (item) => item.monetary && decimal(item.outstanding, item.decimal_places, true) !== 0n,
      );
      if (result.sources.length > 500) reject("Narrow the valuation by party; this batch exceeds 500 open items.");
      let totalGain = 0n;
      for (const item of result.sources) {
        const outstanding = decimal(item.outstanding, item.decimal_places, true);
        const target = convertMinor(outstanding, item.decimal_places, a.rateValue, base.decimalPlaces);
        const adjustment = target - decimal(item.carrying, base.decimalPlaces, true);
        if (adjustment === 0n) continue;
        addBase(item.control_account_id, adjustment * orientation, `${item.code} closing valuation`);
        gain(adjustment * orientation, true, `${item.code} unrealized FX`);
        totalGain += adjustment * orientation;
        result.fx_by_item.push({
          item_id: item.id,
          realized: decimalText(0n, base.decimalPlaces),
          unrealized: decimalText(adjustment * orientation, base.decimalPlaces),
        });
        result.deltas.push({
          item_id: item.id,
          foreign: "0",
          base: decimalText(adjustment, base.decimalPlaces),
          historical: "0",
          unrealized: decimalText(adjustment, base.decimalPlaces),
        });
      }
      result.unrealized_gain = decimalText(totalGain, base.decimalPlaces);
      if (!result.deltas.length) reject("No eligible open monetary balance requires a valuation adjustment.");
    } else {
      if (new Set(input.allocations.map((allocation) => allocation.item_id)).size !== input.allocations.length)
        reject("An item may appear only once in an allocation.");
      result.sources = input.allocations.map((allocation) => {
        const item = candidates.find((row) => row.id === allocation.item_id);
        if (!item) reject("An allocation is outside the party, company or posting date.");
        return item;
      });
      let clearedCarrying = 0n;
      let clearedSpot = 0n;
      let clearedUnrealized = 0n;
      const nativeOffsets = new Map<string, bigint>();
      const paymentAuthority = input.type === "settlement" ? await authority(input.payment_currency) : null;
      let expectedPayment = 0n;
      let quotedBase = 0n;
      let withheldBase = 0n;
      let withheldPayment = 0n;
      let withheldFx = 0n;
      const dealRate = input.type === "settlement" && input.conversion_rate ? decimal(input.conversion_rate, 18) : null;
      const nonmonetaryOffset = input.type === "offset" && result.sources.some((item) => !item.monetary);
      if (
        dealRate !== null &&
        (dealRate <= 0n ||
          input.type !== "settlement" ||
          !input.conversion_reference ||
          new Set(result.sources.map((item) => item.currency)).size !== 1 ||
          result.sources[0]?.currency === input.payment_currency)
      )
        reject(
          "A cross-currency bank deal requires a positive payment-units-per-invoice-unit rate, bank evidence reference, and invoices in one original currency.",
        );
      for (let index = 0; index < input.allocations.length; index++) {
        const allocation = input.allocations[index]!;
        const item = result.sources[index]!;
        const remaining = decimal(item.outstanding, item.decimal_places, true);
        const amount = decimal(allocation.amount, item.decimal_places);
        const carrying = proportionalMinor(
          decimal(item.carrying, base.decimalPlaces, true),
          amount,
          absolute(remaining),
        );
        const historical = proportionalMinor(
          decimal(item.historical, base.decimalPlaces, true),
          amount,
          absolute(remaining),
        );
        const unrealized = carrying - historical;
        const signed = remaining > 0n ? amount : -amount;
        const a = await authority(item.currency);
        let taxFx = 0n;
        if (input.type === "settlement" && input.tax_definition_id) {
          if (input.side !== "payable" || signed <= 0n || item.kind !== "invoice")
            reject("Supplier withholding requires positive supplier invoice allocations.");
          if (
            (
              await client.query(
                "select 1 from finance_subledger_item i join finance_subledger_operation o on o.tenant_id=i.tenant_id and o.company_id=i.company_id and o.id=i.operation_id where i.tenant_id=$1 and i.company_id=$2 and i.id=$3 and exists(select 1 from jsonb_array_elements(coalesce(o.preview->'taxes','[]'::jsonb)) t where t->>'treatment'='withholding' and t->>'trigger'='recognition')",
                [context.tenantId, input.company_id, item.id],
              )
            ).rowCount
          )
            reject("This invoice already withheld tax at recognition; settlement cannot withhold it again.");
          const tax = await resolveTax(client, {
            tenant: context.tenantId,
            company: input.company_id,
            definition: input.tax_definition_id,
            date: input.date,
            module: "purchases",
            trigger: "settlement",
            currency: item.currency,
            precision: item.decimal_places,
            basis: decimalText(amount, item.decimal_places),
          });
          tax.source_item_id = item.id;
          const prior = (
            await client.query<{ basis: string; amount: string }>(
              "select coalesce(sum(basis),0)::text as basis,coalesce(sum(amount),0)::text as amount from finance_tax_application where tenant_id=$1 and company_id=$2 and definition_id=$3 and revision=$4 and source_line=$5 and currency=$6",
              [context.tenantId, input.company_id, tax.definition_id, tax.revision, item.id, item.currency],
            )
          ).rows[0]!;
          tax.prior_basis = decimalText(dbMinor(prior.basis, item.decimal_places), item.decimal_places);
          tax.prior_amount = decimalText(dbMinor(prior.amount, item.decimal_places), item.decimal_places);
          tax.amount = decimalText(
            decimal(
              calculateTax(
                decimalText(
                  decimal(tax.basis, item.decimal_places) + decimal(tax.prior_basis, item.decimal_places),
                  item.decimal_places,
                ),
                tax.rate,
                item.decimal_places,
              ),
              item.decimal_places,
            ) - decimal(tax.prior_amount, item.decimal_places),
            item.decimal_places,
          );
          result.taxes.push(tax);
          const units = decimal(tax.amount, item.decimal_places);
          const taxBase = convertMinor(units, item.decimal_places, a.rateValue, base.decimalPlaces);
          withheldBase += taxBase;
          add(tax.account_id, -units, item.currency, a, `${item.code} governed withholding`);
          if (paymentAuthority) {
            const taxPayment =
              dealRate !== null
                ? divideRounded(
                    units * dealRate * 10n ** BigInt(paymentAuthority.sourceDecimalPlaces),
                    10n ** BigInt(item.decimal_places + 18),
                  )
                : divideRounded(
                    units * decimal(a.rateValue, 18) * 10n ** BigInt(paymentAuthority.sourceDecimalPlaces),
                    decimal(paymentAuthority.rateValue, 18) * 10n ** BigInt(item.decimal_places),
                  );
            withheldPayment += taxPayment;
            taxFx =
              dealRate === null
                ? 0n
                : divideRounded(
                    units * dealRate * decimal(paymentAuthority.rateValue, 18) * 10n ** BigInt(base.decimalPlaces),
                    10n ** BigInt(item.decimal_places + 36),
                  ) - taxBase;
            withheldFx += taxFx;
          }
        }
        const spot = convertMinor(signed, item.decimal_places, a.rateValue, base.decimalPlaces);
        const economicBase =
          input.type === "offset"
            ? 0n
            : dealRate !== null && paymentAuthority
              ? divideRounded(
                  signed * dealRate * decimal(paymentAuthority.rateValue, 18) * 10n ** BigInt(base.decimalPlaces),
                  10n ** BigInt(item.decimal_places + 36),
                )
              : spot;
        result.fx_by_item.push({
          item_id: item.id,
          realized: decimalText(
            nonmonetaryOffset ? 0n : (economicBase - historical) * orientation + taxFx,
            base.decimalPlaces,
          ),
          unrealized: decimalText(-unrealized * orientation, base.decimalPlaces),
        });
        clearedCarrying += carrying;
        clearedSpot += spot;
        clearedUnrealized += unrealized;
        nativeOffsets.set(item.currency, (nativeOffsets.get(item.currency) ?? 0n) + signed);
        if (paymentAuthority && dealRate !== null) {
          expectedPayment += divideRounded(
            signed * dealRate * 10n ** BigInt(paymentAuthority.sourceDecimalPlaces),
            10n ** BigInt(item.decimal_places + 18),
          );
          quotedBase += divideRounded(
            signed * dealRate * decimal(paymentAuthority.rateValue, 18) * 10n ** BigInt(base.decimalPlaces),
            10n ** BigInt(item.decimal_places + 36),
          );
        } else if (paymentAuthority)
          expectedPayment += divideRounded(
            signed * decimal(a.rateValue, 18) * 10n ** BigInt(paymentAuthority.sourceDecimalPlaces),
            decimal(paymentAuthority.rateValue, 18) * 10n ** BigInt(item.decimal_places),
          );
        add(
          item.control_account_id,
          -signed * orientation,
          item.currency,
          a,
          `${item.code} original-currency settlement`,
        );
        addBase(item.control_account_id, (spot - carrying) * orientation, `${item.code} carrying-value relief`);
        result.deltas.push({
          item_id: item.id,
          foreign: decimalText(-signed, item.decimal_places),
          base: decimalText(-carrying, base.decimalPlaces),
          historical: decimalText(-historical, base.decimalPlaces),
          unrealized: decimalText(-unrealized, base.decimalPlaces),
        });
      }
      let cashBase = 0n;
      if (input.type === "settlement" && paymentAuthority) {
        const payment = decimal(input.payment_amount, paymentAuthority.sourceDecimalPlaces);
        const fee = decimal(input.bank_fee, paymentAuthority.sourceDecimalPlaces);
        if ((payment === 0n && withheldPayment === 0n) || payment !== absolute(expectedPayment) - withheldPayment)
          reject("The payment amount must match the explicit allocations at the governed cross-currency rates.");
        const incoming = expectedPayment * orientation > 0n;
        if (incoming && fee >= payment) reject("Bank fees must be less than the incoming receipt.");
        const account = await bank(input.bank_account_id, input.payment_currency);
        const cash = incoming ? payment - fee : -payment - fee;
        await checkBankCash(account, cash, paymentAuthority.sourceDecimalPlaces);
        cashBase = convertMinor(
          incoming ? payment : -payment,
          paymentAuthority.sourceDecimalPlaces,
          paymentAuthority.rateValue,
          base.decimalPlaces,
        );
        add(account.account_id, cash, input.payment_currency, paymentAuthority, `${code} bank settlement`);
        // Calculate fee base as the difference between principal and actual cash to preserve rounding exactly.
        const actualCashBase = convertMinor(
          cash,
          paymentAuthority.sourceDecimalPlaces,
          paymentAuthority.rateValue,
          base.decimalPlaces,
        );
        addBase(policy.expense_account_id, cashBase - actualCashBase, `${code} bank fee`);
        if (withheldPayment) {
          cashBase -= withheldBase;
        }
      } else {
        if ([...nativeOffsets.values()].some((value) => value !== 0n))
          reject(
            "An offset must balance original amounts within each currency; use a bank settlement for currency conversion.",
          );
      }
      const rounding =
        input.type === "settlement"
          ? cashBase - (dealRate !== null ? quotedBase : clearedSpot) * orientation - withheldFx
          : 0n;
      addBase(policy.expense_account_id, -rounding, `${code} cross-currency conversion rounding`);
      result.rounding = decimalText(rounding, base.decimalPlaces);
      const realized = cashBase - clearedCarrying * orientation - rounding;
      if (nonmonetaryOffset) {
        if (
          result.sources.some(
            (item) =>
              (item.kind !== "advance" && item.date !== input.date) ||
              decimal(item.unrealized, base.decimalPlaces, true) !== 0n,
          )
        )
          reject(
            "Apply a nonmonetary prepayment on the invoice recognition date before valuation, so income/expense uses the advance's historical basis.",
          );
        addBase(
          input.side === "receivable" ? policy.revenue_account_id : policy.expense_account_id,
          -realized,
          `${code} historical advance basis for recognition`,
        );
      } else {
        if (input.type === "settlement" && result.sources.some((item) => !item.monetary))
          reject(
            "Nonmonetary advances are applied to an invoice by historical-basis offset; they cannot be refunded as monetary balances.",
          );
        gain(realized, false, `${code} incremental realized FX`);
      }
      // Previously recognized unrealized movement is reclassified, not recognized twice.
      const reclass = clearedUnrealized * orientation;
      if (reclass) {
        addBase(
          reclass > 0n ? policy.unrealized_gain_account_id : policy.unrealized_loss_account_id,
          reclass,
          `${code} release unrealized FX`,
        );
        gain(reclass, false, `${code} realized FX reclassification`);
      }
      result.realized_gain = decimalText(nonmonetaryOffset ? 0n : realized + reclass, base.decimalPlaces);
      result.unrealized_gain = decimalText(-reclass, base.decimalPlaces);
      // Spot totals are independently encoded in native lines; their carrying adjustment must reconcile.
      if (clearedSpot === 0n && input.type === "settlement")
        reject("Use an offset when allocations have zero net value.");
    }
    const affected = result.sources.map((item) => item.id);
    if (
      affected.length &&
      (
        await client.query(
          "select 1 from finance_subledger_item_event where tenant_id=$1 and company_id=$2 and item_id=any($3::text[]) and event_date>$4::date limit 1",
          [context.tenantId, input.company_id, affected, input.date],
        )
      ).rowCount
    )
      reject(
        "Later item activity exists. Reverse the later effects before backdating this operation.",
        "SUBLEDGER_DATE_CONFLICT",
      );
    if (result.lines.length > 1000) reject("Narrow this operation to fewer items.");
    return result;
  }

  async create(context: BankingActorContext, raw: SubledgerInput, key: string): Promise<SubledgerOperation> {
    const input = subledgerOperationInputSchema.parse(raw);
    return this.transaction(context, input.company_id, "finance.subledger.manage", true, (client) =>
      this.idempotent(
        client,
        context,
        input.company_id,
        key,
        { action: "create", input },
        (value) => subledgerOperationSchema.parse(value),
        async () => {
          const id = randomUUID();
          const prefix =
            input.type === "recognition"
              ? `${input.side === "receivable" ? "AR" : "AP"}${input.kind === "invoice" ? "I" : input.kind === "credit_note" ? "C" : "A"}`
              : ({ settlement: "SET", offset: "OFF", revaluation: "FXR", reversal: "REV" } as const)[input.type];
          const code = await this.code(client, context.tenantId, input.company_id, prefix);
          const preview = await this.preview(client, context, input, id, code);
          await client.query(
            "insert into finance_subledger_operation(tenant_id,company_id,id,code,type,operation_date,maker_id,payload,preview) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            [
              context.tenantId,
              input.company_id,
              id,
              code,
              input.type,
              input.date,
              context.actor.userId,
              JSON.stringify(input),
              JSON.stringify(preview),
            ],
          );
          await this.audit(client, context, input.company_id, "created", id, input.reason, preview);
          return this.operation(await this.loadOperation(client, context.tenantId, input.company_id, id));
        },
      ),
    );
  }

  async action(
    context: BankingActorContext,
    id: string,
    raw: SubledgerAction,
    key: string,
  ): Promise<SubledgerOperation> {
    const input = subledgerActionSchema.parse(raw);
    const permission =
      input.action === "post"
        ? "finance.subledger.post"
        : ["approve", "reject"].includes(input.action)
          ? "finance.subledger.approve"
          : "finance.subledger.manage";
    return this.transaction(context, input.company_id, permission, true, (client) =>
      this.idempotent(
        client,
        context,
        input.company_id,
        key,
        { action: input.action, id, input },
        (value) => subledgerOperationSchema.parse(value),
        async () => {
          const row = await this.loadOperation(client, context.tenantId, input.company_id, id);
          if (row.version !== input.expected_version)
            reject("The operation changed. Refresh before acting.", "STALE_VERSION");
          const payload = subledgerOperationInputSchema.parse(row.input);
          let state: string = row.state;
          let preview = row.preview;
          let previewHash = row.preview_hash;
          let approver = row.approver_id;
          let journal = row.journal_id;
          if (input.action === "submit") {
            if (!["draft", "rejected"].includes(row.state) || row.maker_id !== context.actor.userId)
              reject("Only the maker can submit an eligible draft.");
            preview = await this.preview(client, context, payload, row.id, row.code);
            previewHash = hash(preview);
            state = "submitted";
          } else if (input.action === "approve" || input.action === "reject") {
            if (
              !(row.state === "submitted" || (row.state === "approved" && input.action === "reject")) ||
              row.maker_id === context.actor.userId
            )
              reject("An independent approver must decide a submitted operation.", "MAKER_CHECKER_REQUIRED", 403);
            if (
              input.action === "approve" &&
              hash(await this.preview(client, context, payload, row.id, row.code)) !== row.preview_hash
            )
              reject(
                "Source balances, policy or rates changed. Reject and resubmit for fresh approval.",
                "SUBLEDGER_SNAPSHOT_CHANGED",
              );
            approver = input.action === "approve" ? context.actor.userId : null;
            state = input.action === "approve" ? "approved" : "rejected";
          } else {
            if (row.state !== "approved" || !approver || approver === row.maker_id)
              reject("Independent approval is required before posting.");
            if (
              !(
                await client.query(companyAuthoritySql, [
                  context.tenantId,
                  approver,
                  input.company_id,
                  "finance.subledger.approve",
                ])
              ).rowCount
            )
              reject(
                "The independent approver no longer has current company approval authority.",
                "APPROVER_AUTHORITY_CHANGED",
                403,
              );
            const recalculated = await this.preview(client, context, payload, row.id, row.code);
            if (hash(recalculated) !== row.preview_hash)
              reject(
                "The approved financial evidence changed. Prepare a refreshed operation.",
                "SUBLEDGER_SNAPSHOT_CHANGED",
              );
            const financeClient = await createFinanceTransactionClient(client);
            if (payload.type === "reversal") {
              const original = await this.loadOperation(
                client,
                context.tenantId,
                input.company_id,
                payload.operation_id,
              );
              const event = (
                await client.query<{ id: string }>(
                  "select id from accounting_event where tenant_id=$1 and source_type='currency_subledger' and source_id=$2 and state='posted' and event_type='currency_subledger.posted'",
                  [context.tenantId, original.id],
                )
              ).rows[0];
              if (!event || !original.journal_id) reject("The original posting evidence is unavailable.");
              journal = (
                await this.finance.reverse(financeClient, {
                  tenantId: context.tenantId,
                  companyId: input.company_id,
                  actorId: context.actor.userId,
                  sourceType: "currency_subledger",
                  sourceId: original.id,
                  eventType: "currency_subledger.reversed",
                  originalEventType: "currency_subledger.posted",
                  originalAccountingEventId: event.id,
                  originalJournalId: original.journal_id,
                  postingDate: payload.date,
                  transactionCurrency: recalculated.base_currency,
                  externalIdempotencyKey: `subledger:${id}`,
                  payloadHashMaterial: { operation_id: id, reason: input.reason },
                })
              ).journalId;
            } else {
              journal = (
                await this.finance.postMultiCurrency(financeClient, {
                  tenantId: context.tenantId,
                  companyId: input.company_id,
                  actorId: context.actor.userId,
                  sourceType: "currency_subledger",
                  sourceId: id,
                  eventType: "currency_subledger.posted",
                  postingDate: payload.date,
                  externalIdempotencyKey: `subledger:${id}`,
                  transactionCurrency: recalculated.base_currency,
                  lines: recalculated.lines satisfies FinanceMultiCurrencyPostingLine[],
                  payloadHashMaterial: { operation_id: id, approved_hash: row.preview_hash!, reason: input.reason },
                })
              ).journalId;
            }
            if (payload.type === "reversal") {
              await reverseTaxApplications(client, {
                tenant: context.tenantId,
                company: input.company_id,
                original: payload.operation_id,
                source: id,
                sourceType: "currency_subledger",
                journal: journal!,
                date: payload.date,
              });
            } else if (recalculated.taxes.length) {
              await recordTaxApplications(client, {
                tenant: context.tenantId,
                company: input.company_id,
                sourceType: "currency_subledger",
                sourceId: id,
                date: payload.date,
                journal: journal!,
                taxes: recalculated.taxes,
                rate: async (currency) => {
                  const a = await resolveCompanyCurrencyAuthority(client, {
                    tenantId: context.tenantId,
                    companyId: input.company_id,
                    sourceCurrency: currency,
                    effectiveOnOrBefore: payload.date,
                  });
                  return { value: a.rateValue, basePrecision: recalculated.base_decimal_places };
                },
              });
            }
            if (recalculated.item) {
              const item = recalculated.item;
              await client.query(
                `insert into finance_subledger_item(tenant_id,company_id,id,code,operation_id,party_id,side,kind,currency,base_currency,decimal_places,base_decimal_places,document_date,due_date,original_amount,original_base,monetary,control_account_id,journal_id,rate,rate_id,source_document_id)
            values(${Array.from({ length: 22 }, (_, i) => `$${i + 1}`).join(",")})`,
                [
                  context.tenantId,
                  input.company_id,
                  item.id,
                  item.code,
                  id,
                  item.party_id,
                  item.side,
                  item.kind,
                  item.currency,
                  item.base_currency,
                  item.decimal_places,
                  item.base_decimal_places,
                  item.date,
                  item.due_date,
                  item.original_amount,
                  item.original_base,
                  item.monetary,
                  item.control_account_id,
                  journal,
                  item.rate,
                  item.rate_id,
                  payload.type === "recognition" ? (payload.source_document_id ?? null) : null,
                ],
              );
            }
            for (const delta of recalculated.deltas)
              await client.query(
                `insert into finance_subledger_item_event(tenant_id,company_id,id,item_id,operation_id,event_date,foreign_delta,base_delta,historical_delta,unrealized_delta,journal_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [
                  context.tenantId,
                  input.company_id,
                  randomUUID(),
                  delta.item_id,
                  id,
                  payload.date,
                  delta.foreign,
                  delta.base,
                  delta.historical,
                  delta.unrealized,
                  journal,
                ],
              );
            state = "posted";
          }
          await client.query(
            "update finance_subledger_operation set state=$4,version=version+1,approver_id=$5,preview=$6,preview_hash=$7,journal_id=$8,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
            [context.tenantId, input.company_id, id, state, approver, JSON.stringify(preview), previewHash, journal],
          );
          await this.audit(client, context, input.company_id, input.action, id, input.reason, {
            state,
            journal_id: journal,
            version: row.version + 1,
            approved_hash: previewHash,
          });
          return this.operation(await this.loadOperation(client, context.tenantId, input.company_id, id));
        },
      ),
    );
  }
}
