import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  purchaseDocumentSchema,
  supplierSchema,
  purchaseTotals,
  financialPaymentSchedule,
  subledgerPartyConfigurationInputSchema,
  subledgerPartyConfigurationSchema,
  type SubledgerPartyConfigurationInput,
  type SubledgerPartyConfiguration,
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
  subledgerOperationRequestSchema,
  subledgerOperationSchema,
  subledgerPartyInputSchema,
  subledgerPartySchema,
  subledgerSupplierDirectorySchema,
  subledgerPolicyInputSchema,
  subledgerPolicySchema,
  subledgerWorkspaceSchema,
  subledgerPreviewSchema,
  purchaseAccountingPrepareSchema,
  type SubledgerAction,
  type SubledgerInput,
  type SubledgerRequest,
  type SubledgerItem,
  type SubledgerOperation,
  type SubledgerPartyInput,
  type SubledgerSupplierQuery,
  type SubledgerPolicy,
  type SubledgerPolicyInput,
  type SubledgerQuery,
  type SubledgerWorkspace,
} from "@nexora/contracts";
import type { BankingActorContext } from "../../banking/source-repository.js";
import { companyAuthoritySql } from "../../security/company-authority.js";
import { hasAssetJournalReferences } from "../../fixed-assets/sources.js";
import { procurementDigest, writeProcurementEvidence } from "../../procurement/audit-writer.js";
import { SourceAssetRepository, AssetError } from "../../fixed-assets/source-repository.js";
import { registerPostedPurchase } from "../../fixed-assets/purchase-registration.js";
import { resolveTax, recordTaxApplications, reverseTaxApplications, TaxError } from "../taxes/resolver.js";
import { itemBalancesSql, itemBalanceParameters } from "./queries.js";
import { previewPurchasePayment, purchaseSource, purchaseParty, nativePurchaseAmount } from "./purchase-bridge.js";
import {
  resolveCompanyBaseCurrency,
  resolveCompanyCurrencyAuthority,
  CompanyCurrencyAuthorityError,
} from "../currencies/company-authority.js";
import { FinancePostingService } from "../posting/service.js";
import {
  matchPurchaseStock,
  reversePurchaseStockMatches,
  recordPurchaseStockMatches,
  PurchaseAccrualError,
} from "../../inventory/purchase-accrual.js";
import { InventoryError } from "../../inventory/errors.js";
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
      if (write) {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `operational:${context.tenantId}:${company}`,
        ]);
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `subledger:${context.tenantId}:${company}`,
        ]);
      }
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error instanceof SubledgerError) throw error;
      if (error instanceof PurchaseAccrualError || error instanceof InventoryError)
        throw new SubledgerError(error.status, error.code, error.message);
      if (error instanceof AssetError) throw new SubledgerError(error.status, error.code, error.message);
      if (error instanceof TaxError) throw new SubledgerError(error.status, error.code, error.message);
      if (error instanceof CompanyCurrencyAuthorityError || error instanceof FinancePostingError)
        throw new SubledgerError(error.status, error.code, error.message);
      if (error instanceof z.ZodError)
        throw new SubledgerError(400, "SUBLEDGER_INPUT_INVALID", "Financial input or stored evidence is invalid.");
      if (error && typeof error === "object" && "constraint" in error && error.constraint === "erp_party_duplicate")
        throw new SubledgerError(
          409,
          "PARTY_IDENTITY_EXISTS",
          "A matching customer or supplier already exists in this company. Use its existing master record.",
        );
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

  async supplierMasters(context: BankingActorContext, query: SubledgerSupplierQuery) {
    return this.transaction(context, query.company_id, "finance.subledger.read", false, async (client) => {
      const search = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
      const filter = `p.tenant_id=$1 and p.company_id=$2 and p.type='vendor' and p.status='active' and p.risk_status<>'blocked'
        and exists(select 1 from procurement_supplier s where s.tenant_id=p.tenant_id and s.company_id=p.company_id and s.id=p.id and s.risk_status<>'blocked')
        and (p.name ilike $3 escape '\\' or p.code ilike $3 escape '\\')`;
      const rows = await client.query(
        `select p.id,p.code,p.name,p.status,p.risk_status from party p where ${filter} order by p.name,p.id limit $4 offset $5`,
        [context.tenantId, query.company_id, search, query.limit, query.offset],
      );
      const total = await client.query<{ total: number }>(
        `select count(*)::integer as total from party p where ${filter}`,
        [context.tenantId, query.company_id, search],
      );
      return subledgerSupplierDirectorySchema.parse({ items: rows.rows, total: total.rows[0]!.total });
    });
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
            const linked = (
              await client.query(
                "select id,company_id,kind,code,name,default_currency,source_supplier_id,canonical_party_id,status,risk_status from finance_party_directory where tenant_id=$1 and company_id=$2 and source_supplier_id=$3 and status='active' and risk_status<>'blocked'",
                [context.tenantId, input.company_id, input.source_supplier_id],
              )
            ).rows[0];
            if (linked) return subledgerPartySchema.parse(linked);
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
          const canonical = (
            await client.query(
              "select id,company_id,kind,code,name,default_currency,source_supplier_id,canonical_party_id,status,risk_status from finance_party_directory where tenant_id=$1 and company_id=$2 and id=$3",
              [context.tenantId, input.company_id, result.id],
            )
          ).rows[0];
          const party = subledgerPartySchema.parse({
            ...canonical,
            source_supplier_id: canonical.source_supplier_id ?? undefined,
          });
          if (input.kind === "supplier" && !input.source_supplier_id) {
            const profile = supplierSchema.parse(
              (
                await client.query(
                  "select id,company_id,code,name,tax_id,email,phone,address,status,risk_status,profile,row_version as version from procurement_supplier where tenant_id=$1 and company_id=$2 and id=$3",
                  [context.tenantId, input.company_id, party.canonical_party_id],
                )
              ).rows[0],
            );
            await writeProcurementEvidence(client, context, {
              entity: "supplier",
              id: profile.id,
              company: input.company_id,
              version: 1,
              action: "created",
              reason:
                "Inactive profile from financial supplier onboarding; vendor activation remains separately authorized",
              record: profile,
              key: `financial-profile:${procurementDigest({ key, id: party.id })}`,
              fingerprint: procurementDigest(profile),
              correlation: randomUUID(),
            });
          }
          await this.audit(
            client,
            context,
            input.company_id,
            "party_created",
            null,
            "Created persistent financial party",
            party,
          );
          return party;
        },
      ),
    );
  }

  private async configurations(client: PoolClient, tenant: string, company: string, partyId?: string) {
    const rows = await client.query<SubledgerPartyConfiguration & { decimal_places: number }>(
      `select distinct on (s.party_id) s.company_id,s.party_id,s.version,s.payment_term,
       s.credit_limit::text,s.credit_currency,s.reason,c.decimal_places
       from finance_party_configuration s join currency c on c.tenant_id=s.tenant_id and c.code=s.credit_currency
       where s.tenant_id=$1 and s.company_id=$2 and ($3::text is null or s.party_id=$3)
       order by s.party_id,s.version desc`,
      [tenant, company, partyId ?? null],
    );
    return new Map(
      rows.rows.map(({ decimal_places, ...row }) => [
        row.party_id,
        subledgerPartyConfigurationSchema.parse({
          ...row,
          credit_limit:
            row.credit_limit === null ? null : decimalText(dbMinor(row.credit_limit, decimal_places), decimal_places),
        }),
      ]),
    );
  }

  async configureParty(
    context: BankingActorContext,
    partyId: string,
    raw: SubledgerPartyConfigurationInput,
    key: string,
  ) {
    const input = subledgerPartyConfigurationInputSchema.parse(raw);
    return this.transaction(context, input.company_id, "finance.subledger.manage", true, (client) =>
      this.idempotent(
        client,
        context,
        input.company_id,
        key,
        { action: "configure_party", partyId, input },
        (value) => subledgerPartyConfigurationSchema.parse(value),
        async () => {
          const party = (
            await client.query<{ kind: string }>(
              "select kind from finance_party_directory where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and risk_status<>'blocked'",
              [context.tenantId, input.company_id, partyId],
            )
          ).rows[0];
          if (!party) reject("Select an active financial customer or supplier in this company.");
          const prior = (await this.configurations(client, context.tenantId, input.company_id, partyId)).get(partyId);
          if ((prior?.version ?? 0) !== input.expected_version)
            reject("Financial settings changed. Reload before saving.", "STALE_VERSION");
          if ((party.kind === "customer") !== (input.credit_limit !== null))
            reject("Set an explicit customer credit limit; supplier terms have no customer credit limit.");
          const base = await resolveCompanyBaseCurrency(client, context.tenantId, input.company_id, false);
          const credit =
            input.credit_limit === null
              ? null
              : decimalText(decimal(input.credit_limit, base.decimalPlaces), base.decimalPlaces);
          const result = subledgerPartyConfigurationSchema.parse({
            company_id: input.company_id,
            party_id: partyId,
            version: input.expected_version + 1,
            payment_term: input.payment_term,
            credit_limit: credit,
            credit_currency: base.code,
            reason: input.reason,
          });
          await client.query(
            "insert into finance_party_configuration(tenant_id,company_id,party_id,version,payment_term,credit_limit,credit_currency,reason,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            [
              context.tenantId,
              input.company_id,
              partyId,
              result.version,
              result.payment_term,
              credit,
              base.code,
              input.reason,
              context.actor.userId,
            ],
          );
          await this.audit(client, context, input.company_id, "party_configured", null, input.reason, result);
          return result;
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
        due_schedule: unknown;
      }>(
        `${itemBalancesSql} select id,code,party_id,party_name,side,kind,currency,base_currency,decimal_places,base_decimal_places,
        document_date::text as date,due_date::text,original_amount::text,original_base::text,outstanding::text,carrying::text,historical::text,unrealized::text,
        monetary,control_account_id,journal_id,rate::text,rate_id,due_schedule from item_balances
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
        due_schedule: row.due_schedule ?? undefined,
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
      const configurations = await this.configurations(client, context.tenantId, query.company_id);
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
        sum(age_current)::text as current,
        sum(age_1_30)::text as days_1_30,
        sum(age_31_60)::text as days_31_60,
        sum(age_61_90)::text as days_61_90,
        sum(age_over_90)::text as days_over_90
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
          `select p.id,p.company_id,p.kind,p.code,p.name,p.default_currency,p.source_supplier_id,p.canonical_party_id,p.status,p.risk_status,
           case when s.profile->>'credit_days' ~ '^\\d{1,3}$' then (s.profile->>'credit_days')::integer else null end as supplier_credit_days
           from finance_party_directory p left join procurement_supplier s on (s.tenant_id,s.company_id,s.id)=(p.tenant_id,p.company_id,p.source_supplier_id)
           where p.tenant_id=$1 and p.company_id=$2 order by p.name,p.id`,
          [context.tenantId, query.company_id],
        )
      ).rows.map((row) =>
        subledgerPartySchema.parse({
          ...row,
          source_supplier_id: row.source_supplier_id ?? undefined,
          financial_configuration: configurations.get(row.id) ?? null,
        }),
      );
      const operationFilter = `tenant_id=$1 and company_id=$2 and operation_date<=$3::date
        and ($4::text is null or payload->>'side'=$4 or type='reversal')
        and ($5::text is null or payload->>'party_id'=$5 or type='revaluation' or type='reversal')
        and ($6::text is null or payload->>'currency'=$6 or payload->>'payment_currency'=$6 or type in ('offset','reversal'))
        and ($7::text is null or payload->>'source_document_id'=$7)`;
      const operationValues = [
        context.tenantId,
        query.company_id,
        query.as_of,
        query.side ?? null,
        query.party_id ?? null,
        query.currency ?? null,
        query.source_document_id ?? null,
      ];
      const operations = (
        await client.query<OperationRow>(
          `select ${operationProjection} from finance_subledger_operation where ${operationFilter} order by created_at desc,id limit $8 offset $9`,
          [...operationValues, query.limit, query.offset],
        )
      ).rows.map((row) => this.operation(row));
      const count = (
        await client.query<{ total: number }>(
          `select count(*)::integer as total from finance_subledger_operation where ${operationFilter}`,
          operationValues,
        )
      ).rows[0]!.total;
      const policy = await this.policy(client, context.tenantId, query.company_id, false);
      const taxes = (
        await client.query<{ count: number }>(
          "select count(*)::integer as count from finance_tax_definition where tenant_id=$1 and company_id=$2 and status='active'",
          [context.tenantId, query.company_id],
        )
      ).rows[0]!.count;
      return subledgerWorkspaceSchema.parse({
        dimension_options: (
          await client.query(
            `select * from (
           select type as dimension,id,code,name from organization_unit where tenant_id=$1 and status='active'
            and type in ('department','branch','division','business_unit','warehouse') and organization_unit_is_within_company($1,id,$2)
           union all select 'project',id,code,name from erp_project where tenant_id=$1 and company_id=$2 and status='active'
           union all select 'location',id,code,name from erp_location where tenant_id=$1 and company_id=$2 and status='active'
           union all select 'cost_centre',id,code,name from hr_master_record where tenant_id=$1 and company_id=$2 and status='active' and master_type='cost_center'
          ) refs order by dimension,code,id limit 1000`,
            [context.tenantId, query.company_id],
          )
        ).rows,
        readiness: {
          policy_configured: policy !== null,
          unconfigured_customers: parties.filter((p) => p.kind === "customer" && !p.financial_configuration).length,
          unconfigured_suppliers: parties.filter((p) => p.kind === "supplier" && !p.financial_configuration).length,
          active_tax_definitions: taxes,
        },
        company_id: query.company_id,
        base_currency: base.code,
        base_decimal_places: base.decimalPlaces,
        as_of: query.as_of,
        parties,
        policy,
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
    deferBankCash = false,
  ): Promise<Preview> {
    if (input.type !== "reversal" && input.dimensions) {
      if (Object.keys(input.dimensions).some((key) => /^(purchase_|asset_)/.test(key)))
        reject("Source accounting references are assigned by their owning workflow.");
      await client.query("select finance_validate_dimensions($1,$2,$3::jsonb)", [
        context.tenantId,
        input.company_id,
        JSON.stringify(input.dimensions),
      ]);
    }
    if (input.type === "purchase_payment")
      return previewPurchasePayment(client, context, input, id, code, (child, childId, childCode) =>
        this.preview(client, context, child, childId, childCode, true),
      );
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
        dimensions: { ...input.dimensions },
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
      if (!deferBankCash && dbMinor(position.balance, scale) + cash < -dbMinor(account.overdraft_limit, scale))
        reject("This payment exceeds the bank's available balance and approved overdraft.", "BANK_INSUFFICIENT_FUNDS");
    };
    if (input.type === "reversal") {
      const original = await this.loadOperation(client, context.tenantId, input.company_id, input.operation_id);
      if (original.state !== "posted" || original.type === "reversal" || original.date > input.date)
        reject("Choose a posted original operation dated on or before the reversal.");
      if (
        original.journal_id &&
        (await hasAssetJournalReferences(client, context.tenantId, input.company_id, original.journal_id))
      )
        reject(
          "This financial source is referenced by Fixed Assets. Use the asset lifecycle workflow.",
          "SUBLEDGER_ASSET_SOURCE_LOCKED",
        );
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
      const reversedMatches = await reversePurchaseStockMatches(
        client,
        context.tenantId,
        input.company_id,
        original.id,
      );
      if (reversedMatches.length) result.stock_matches = reversedMatches;
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
          "select kind from finance_party_directory where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and risk_status<>'blocked'",
          [context.tenantId, input.company_id, input.party_id],
        )
      ).rows[0];
      if (!party || party.kind !== (input.side === "receivable" ? "customer" : "supplier"))
        reject("Select the matching customer or supplier in this company.");
    }
    const orientation = sideSign(input.side);
    let control = input.side === "receivable" ? policy.receivable_account_id : policy.payable_account_id;
    if (input.type === "recognition") {
      const configuration = (await this.configurations(client, context.tenantId, input.company_id, input.party_id)).get(
        input.party_id,
      );
      if (input.side === "receivable" && input.kind === "invoice" && !configuration)
        reject(
          "Review this customer's payment terms and finite credit limit before preparing an invoice.",
          "CUSTOMER_FINANCIAL_CONFIGURATION_REQUIRED",
        );
      if (
        input.document_type &&
        ((input.document_type === "credit_note") !== (input.kind === "credit_note") || input.kind === "advance")
      )
        reject("The document type must agree with its invoice or credit accounting effect.");
      const a = await authority(input.currency);
      const basis = decimal(input.amount, a.sourceDecimalPlaces);
      if (
        input.tax_definition_id &&
        (input.tax_amount !== undefined || input.tax_account_id || input.kind === "advance")
      )
        reject("A governed tax cannot be combined with manual tax overrides or an advance.");
      const sourceTaxDocument = input.source_document_id
        ? (
            await client.query<{ lines: unknown; discount_amount: string; additional_charges: unknown; date: string }>(
              "select lines,discount_amount::text,additional_charges,coalesce(bill_date,document_date)::text as date from procurement_document where tenant_id=$1 and company_id=$2 and id=$3 and kind='bill' and state='approved' for share",
              [context.tenantId, input.company_id, input.source_document_id],
            )
          ).rows[0]
        : undefined;
      const sourceTerms = sourceTaxDocument
        ? purchaseDocumentSchema.pick({ lines: true, discount_amount: true, additional_charges: true }).parse({
            lines: sourceTaxDocument.lines,
            discount_amount: sourceTaxDocument.discount_amount,
            additional_charges: sourceTaxDocument.additional_charges,
          })
        : null;
      const sourceTaxLines = sourceTerms?.lines ?? [];
      const sourceCharges = sourceTerms?.additional_charges ?? [];
      const sourceAmounts = sourceTerms ? purchaseTotals(sourceTaxLines, sourceTerms) : null;
      const sourceTaxEntries = [
        ...sourceTaxLines.map((line, index) => ({ line, net: sourceAmounts!.lines[index]!.net })),
        ...sourceCharges.map((line, index) => ({ line, net: sourceAmounts!.charges[index]!.net })),
      ];
      const sourceGoverned = sourceTaxEntries.some(({ line }) => line.tax_definition_id);
      const governedTaxes = [];
      if (sourceGoverned) {
        if (input.tax_amount !== undefined || input.tax_account_id)
          reject("An approved governed bill resolves its own tax mappings; manual overrides are not allowed.");
        let sourceBasis = 0n;
        for (const { line, net } of sourceTaxEntries) {
          const units = decimal(net, 2);
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
            module: "asset_category_id" in line && line.asset_category_id ? ["purchases", "fixed_assets"] : "purchases",
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
        if (input.counter_account_id || !input.monetary) {
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
        const assetAcquisition =
          input.side === "payable" &&
          account?.type === "asset" &&
          (input.kind === "credit_note" || (input.kind === "invoice" && !!input.source_document_id)) &&
          (
            await client.query(
              `select 1 where exists(select 1 from fixed_asset_category where tenant_id=$1 and company_id=$2 and asset_account_id=$3 and active) or exists(select 1 from fixed_asset_record where tenant_id=$1 and company_id=$2 and category_snapshot->>'asset_account_id'=$3)`,
              [context.tenantId, input.company_id, counter],
            )
          ).rowCount;
        if (account?.type !== (input.side === "receivable" ? "revenue" : "expense") && !assetAcquisition)
          reject(
            "Select a matching revenue/expense account, or a configured asset account for a linked supplier acquisition or credit note.",
          );
      }
      if (input.source_document_id) {
        const source = (
          await client.query<{ currency: string; total: string }>(
            `select d.currency,d.total_amount::text as total
          from procurement_document d join finance_party_directory p
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
          !sourceAmounts ||
          decimal(source.total, 8) !== decimal(sourceAmounts.total, 8) ||
          decimal(source.total, 8) - decimal(sourceAmounts.net, 8) !==
            decimal(decimalText(withholding ? 0n : tax, a.sourceDecimalPlaces), 8)
        )
          reject("The source must be this supplier's approved bill with matching currency and amount.");
      }
      if (input.original_item_id) {
        if (input.kind !== "credit_note") reject("An original invoice link belongs only to a credit note.");
        const original = (
          await client.query<{ amount: string; control_account_id: string }>(
            `select i.original_amount::text as amount,i.control_account_id from finance_subledger_item i where i.tenant_id=$1 and i.company_id=$2 and i.id=$3 and i.party_id=$4 and i.side=$5 and i.currency=$6 and i.kind='invoice' and i.document_date<=$7 and not exists(select 1 from finance_subledger_operation r where r.tenant_id=i.tenant_id and r.company_id=i.company_id and r.state='posted' and r.type='reversal' and r.payload->>'operation_id'=i.operation_id)`,
            [
              context.tenantId,
              input.company_id,
              input.original_item_id,
              input.party_id,
              input.side,
              input.currency,
              input.date,
            ],
          )
        ).rows[0];
        if (!original || original.control_account_id !== control)
          reject("Select this party’s unreversed original invoice in the same currency and control account.");
        const used = (
          await client.query<{ amount: string }>(
            `select coalesce(sum(abs(i.original_amount)),0)::text as amount from finance_subledger_item i join finance_subledger_operation o on o.tenant_id=i.tenant_id and o.company_id=i.company_id and o.id=i.operation_id where i.tenant_id=$1 and i.company_id=$2 and i.kind='credit_note' and o.payload->>'original_item_id'=$3 and not exists(select 1 from finance_subledger_operation r where r.tenant_id=o.tenant_id and r.company_id=o.company_id and r.state='posted' and r.type='reversal' and r.payload->>'operation_id'=o.id)`,
            [context.tenantId, input.company_id, input.original_item_id],
          )
        ).rows[0]!.amount;
        if (dbMinor(used, a.sourceDecimalPlaces) + positive > dbMinor(original.amount, a.sourceDecimalPlaces))
          reject("Credit notes exceed the original invoice amount.");
      }
      const partyName = (
        await client.query<{ name: string }>(
          "select name from finance_party_directory where tenant_id=$1 and company_id=$2 and id=$3",
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
      if (
        input.side === "payable" &&
        input.kind === "invoice" &&
        (sourceCharges.length > 0 || sourceTaxLines.length > 0)
      ) {
        if (
          input.counter_account_id &&
          sourceTaxLines.some((line) => line.asset_category_id || line.nominal_account_id)
        )
          reject("The approved bill resolves its asset categories. Clear the manual purchase accounting override.");
        const categories = (
          await client.query<{ id: string; asset_account_id: string }>(
            `select c.id,c.asset_account_id from fixed_asset_category c join account a on a.tenant_id=c.tenant_id and a.company_id=c.company_id and a.id=c.asset_account_id and a.status='active' and a.type='asset' and not a.is_header and not a.reconciliation_required where c.tenant_id=$1 and c.company_id=$2 and c.active and c.id=any($3::text[]) for share of c,a`,
            [
              context.tenantId,
              input.company_id,
              [...new Set(sourceTaxLines.flatMap((line) => (line.asset_category_id ? [line.asset_category_id] : [])))],
            ],
          )
        ).rows;
        let allocated = 0n;
        for (const [lineIndex, line] of sourceTaxLines.entries()) {
          const category = line.asset_category_id
            ? categories.find((item) => item.id === line.asset_category_id)
            : undefined;
          if (line.asset_category_id && !category)
            reject("An approved asset category or its accounting account is no longer active.");
          const unitsAtSource = decimal(sourceAmounts!.lines[lineIndex]!.net, 2),
            native = decimal(
              nativePurchaseAmount(decimalText(unitsAtSource, 2), a.sourceDecimalPlaces),
              a.sourceDecimalPlaces,
            );
          allocated += native;
          const firstLine = result.lines.length;
          const stock = await matchPurchaseStock(client, {
            tenant: context.tenantId,
            company: input.company_id,
            bill: input.source_document_id!,
            date: input.date,
            line,
            precision: base.decimalPlaces,
          });
          if (stock) {
            if (input.counter_account_id)
              reject("Tracked purchase recognition clears receipt accrual. Remove the manual accounting override.");
            result.stock_matches = [...(result.stock_matches ?? []), ...stock.matches];
            let received = 0n;
            for (const match of stock.matches) {
              const value = dbMinor(match.value, base.decimalPlaces);
              received += value;
              addBase(match.accrual_account_id, value, `${code} received goods accrual`);
            }
            addBase(
              stock.varianceAccount,
              convertMinor(native, a.sourceDecimalPlaces, a.rateValue, base.decimalPlaces) - received,
              `${code} purchase price / exchange variance`,
            );
          } else
            add(
              line.nominal_account_id ?? category?.asset_account_id ?? counter,
              native,
              input.currency,
              a,
              `${code} ${line.item_code || line.description} ${line.asset_category_id ? "asset acquisition" : "purchase expense"}`,
            );
          if (native > 0n && line.id)
            for (const postedLine of result.lines.slice(firstLine))
              postedLine.dimensions = Object.fromEntries(
                Object.entries({ ...line.dimensions, purchase_line_id: line.id }).filter(
                  (entry): entry is [string, string] => typeof entry[1] === "string",
                ),
              );
        }
        for (const charge of sourceCharges) {
          if (
            !charge.nominal_account_id ||
            !(
              await client.query(
                "select 1 from account where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and type='expense' and not is_header and not reconciliation_required",
                [context.tenantId, input.company_id, charge.nominal_account_id],
              )
            ).rowCount
          )
            reject("The approved charge requires an active expense account in this company.");
          const native = decimal(nativePurchaseAmount(charge.amount, a.sourceDecimalPlaces), a.sourceDecimalPlaces);
          allocated += native;
          add(charge.nominal_account_id, native, input.currency, a, `${code} ${charge.description}`);
          if (native > 0n)
            result.lines[result.lines.length - 1]!.dimensions = Object.fromEntries(
              Object.entries({ ...charge.dimensions, purchase_charge_id: charge.id }).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string",
              ),
            );
        }
        if (allocated !== (withholding ? signed + signedTax : signed - signedTax))
          reject("Approved bill acquisition allocations do not match its net accounting amount.");
      } else
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
      }
      {
        const residual = result.lines.reduce(
          (sum, line) =>
            sum +
            convertMinor(
              decimal(line.debit, line.currency === base.code ? base.decimalPlaces : a.sourceDecimalPlaces) -
                decimal(line.credit, line.currency === base.code ? base.decimalPlaces : a.sourceDecimalPlaces),
              line.currency === base.code ? base.decimalPlaces : a.sourceDecimalPlaces,
              line.exchangeRateValue,
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
      if (input.kind === "invoice") {
        if (configuration) result.party_configuration = configuration;
        let term = input.payment_term ?? configuration?.payment_term;
        if (input.source_document_id) {
          const sourceTerm = (
            await client.query<{ payment_term: SubledgerPartyConfiguration["payment_term"] | null }>(
              "select payment_term from procurement_document where tenant_id=$1 and company_id=$2 and id=$3",
              [context.tenantId, input.company_id, input.source_document_id],
            )
          ).rows[0];
          // An approved source bill owns its terms, including legacy manual dates.
          term = sourceTerm?.payment_term ?? undefined;
        }
        const items = [result.item, ...(result.additional_items ?? [])];
        for (const item of items) {
          item.due_schedule = term
            ? financialPaymentSchedule(item.date, term, item.original_amount, item.decimal_places)
            : [{ due_date: item.due_date, amount: item.original_amount }];
          if (item.due_schedule.at(-1)!.due_date !== item.due_date)
            reject(
              "The invoice due date must agree with its reviewed payment terms.",
              "PAYMENT_TERMS_DUE_DATE_MISMATCH",
            );
        }
        if (
          input.side === "receivable" &&
          configuration?.credit_limit !== null &&
          configuration?.credit_limit !== undefined
        ) {
          const prior = (
            await client.query<{ exposure: string }>(
              `select coalesce(sum(e.base_delta),0)::text as exposure from finance_subledger_item i
             join finance_subledger_item_event e on (e.tenant_id,e.company_id,e.item_id)=(i.tenant_id,i.company_id,i.id)
             where i.tenant_id=$1 and i.company_id=$2 and i.party_id=$3 and i.side='receivable'`,
              [context.tenantId, input.company_id, input.party_id],
            )
          ).rows[0]!;
          const next =
            dbMinor(prior.exposure, base.decimalPlaces) +
            items.reduce((total, item) => total + decimal(item.original_base, base.decimalPlaces), 0n);
          if (next > decimal(configuration.credit_limit, base.decimalPlaces))
            reject(
              "The invoice exceeds the customer's reviewed functional-currency credit limit.",
              "CUSTOMER_CREDIT_LIMIT_EXCEEDED",
            );
        }
      }
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

  async create(context: BankingActorContext, raw: SubledgerRequest, key: string): Promise<SubledgerOperation> {
    const request = subledgerOperationRequestSchema.parse(raw);
    return this.transaction(context, request.company_id, "finance.subledger.manage", true, (client) =>
      this.idempotent(
        client,
        context,
        request.company_id,
        key,
        { action: "create", input: request },
        (value) => subledgerOperationSchema.parse(value),
        async () => {
          let normalized = request;
          if (request.type === "settlement" || (request.type === "recognition" && request.kind === "advance")) {
            const bank = (
              await client.query<{ currency: string }>(
                `select bank.currency from bank_account bank
                 join account ledger on ledger.tenant_id=bank.tenant_id and ledger.company_id=bank.company_id and ledger.id=bank.account_id
                 where bank.tenant_id=$1 and bank.company_id=$2 and bank.id=$3 and bank.status='active'
                  and ledger.status='active' and not ledger.is_header and ledger.reconciliation_required
                 for share of bank,ledger`,
                [context.tenantId, request.company_id, request.bank_account_id],
              )
            ).rows[0];
            if (!bank) reject("Select an active bank account in this company.");
            const supplied = request.type === "settlement" ? request.payment_currency : request.currency;
            if (supplied && supplied !== bank.currency)
              reject("The transaction currency must match the selected bank account.");
            normalized =
              request.type === "settlement"
                ? { ...request, payment_currency: bank.currency }
                : { ...request, currency: bank.currency };
          }
          if (normalized.type === "recognition") {
            const configuration = (
              await this.configurations(client, context.tenantId, request.company_id, normalized.party_id)
            ).get(normalized.party_id);
            const term =
              normalized.payment_term ?? (normalized.kind === "invoice" ? configuration?.payment_term : undefined);
            const due = term
              ? financialPaymentSchedule(normalized.date, term, "0", 0).at(-1)!.due_date
              : normalized.due_date;
            if (!due) reject("Set a due date or configure reviewed financial payment terms.");
            normalized = {
              ...normalized,
              ...(term ? { payment_term: term } : {}),
              due_date: normalized.due_date ?? due,
            };
          }
          const input = subledgerOperationInputSchema.parse(normalized);
          if (input.type === "purchase_payment")
            reject("Prepare source-owned payments from the Purchase accounting action.");
          const id = randomUUID();
          const prefix =
            input.type === "recognition"
              ? `${input.side === "receivable" ? "AR" : "AP"}${input.kind === "invoice" ? "I" : input.kind === "credit_note" ? "C" : "A"}`
              : (
                  {
                    settlement: "SET",
                    purchase_payment: "PSET",
                    offset: "OFF",
                    revaluation: "FXR",
                    reversal: "REV",
                  } as const
                )[input.type];
          const code = await this.code(client, context.tenantId, input.company_id, prefix);
          const preview = await this.preview(client, context, input, id, code);
          if (
            input.type === "recognition" &&
            input.source_document_id &&
            (
              await client.query(
                "select 1 from finance_subledger_operation where tenant_id=$1 and company_id=$2 and type='recognition' and payload->>'source_document_id'=$3 limit 1",
                [context.tenantId, input.company_id, input.source_document_id],
              )
            ).rowCount
          )
            reject(
              "This Purchase Bill already has a financial operation. Open its existing review instead.",
              "PURCHASE_ALREADY_LINKED",
            );
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

  /** Non-posting source adoption, serialized with AP allocations and idempotency. */
  async preparePurchase(
    context: BankingActorContext,
    documentId: string,
    raw: z.input<typeof purchaseAccountingPrepareSchema>,
    key: string,
  ) {
    const input = purchaseAccountingPrepareSchema.parse(raw);
    return this.transaction(context, input.company_id, "finance.subledger.manage", true, (client) =>
      this.idempotent(
        client,
        context,
        input.company_id,
        key,
        { action: "prepare_purchase", documentId, input },
        (value) => subledgerOperationSchema.parse(value),
        async () => {
          if (
            !(
              await client.query(companyAuthoritySql, [
                context.tenantId,
                context.actor.userId,
                input.company_id,
                "procurement.document.read",
              ])
            ).rowCount
          )
            reject("Purchase read access is required in this company.", "PERMISSION_DENIED", 403);
          const source = await purchaseSource(client, context.tenantId, input.company_id, documentId);
          if (source.version !== input.expected_version)
            reject("The Purchase source changed. Reload before preparing accounting.", "STALE_VERSION");
          if (source.state !== "approved" || !["bill", "payment", "multi_payment"].includes(source.kind))
            reject("Approve a Bill or supplier payment instruction before preparing its accounting.");
          const linked = (
            await client.query<{ operation_id: string }>(
              `select op.id as operation_id from finance_subledger_operation op left join procurement_accounting_link link on link.tenant_id=op.tenant_id and link.company_id=op.company_id and link.operation_id=op.id
               where op.tenant_id=$1 and op.company_id=$2 and (link.document_id=$3 or (op.type='recognition' and op.payload->>'source_document_id'=$3))
               order by (op.state='posted') desc,(link.document_id is not null) desc,op.created_at,op.id limit 1`,
              [context.tenantId, input.company_id, documentId],
            )
          ).rows[0];
          const previous = linked
            ? await this.loadOperation(client, context.tenantId, input.company_id, linked.operation_id)
            : undefined;
          if (previous && input.expected_operation_version === undefined) return this.operation(previous);
          if (input.expected_operation_version !== undefined) {
            if (!previous || previous.version !== input.expected_operation_version)
              reject("The financial draft changed. Reopen it before updating mappings.", "STALE_VERSION");
            if (previous.maker_id !== context.actor.userId)
              reject("Only the financial draft's maker may update its mappings.", "MAKER_REQUIRED", 403);
            if (!["draft", "rejected"].includes(previous.state))
              reject(
                "Reject the financial review before changing accounting mappings. Posted operations require reversal.",
                "PURCHASE_ACCOUNTING_REVIEW_LOCKED",
              );
          }
          let payload: SubledgerInput;
          if (source.kind === "bill") {
            if (!source.supplier_id) reject("The Bill requires a supplier.");
            const party = await purchaseParty(client, context.tenantId, input.company_id, source.supplier_id);
            const totals = purchaseTotals(source.lines, source);
            const currency = await resolveCompanyCurrencyAuthority(client, {
              tenantId: context.tenantId,
              companyId: input.company_id,
              sourceCurrency: source.currency,
              effectiveOnOrBefore: source.bill_date ?? source.document_date,
            });
            const governed =
              source.lines.some((line) => line.tax_definition_id) ||
              source.additional_charges?.some((line) => line.tax_definition_id);
            const tax = decimal(source.total_amount, 8) - decimal(totals.net, 8);
            payload = subledgerOperationInputSchema.parse({
              company_id: input.company_id,
              type: "recognition",
              side: "payable",
              party_id: party,
              kind: "invoice",
              currency: source.currency,
              amount: nativePurchaseAmount(governed ? totals.net : source.total_amount, currency.sourceDecimalPlaces),
              date: source.bill_date ?? source.document_date,
              due_date: source.due_date ?? source.bill_date ?? source.document_date,
              reference: source.code,
              reason: `Recognize approved Purchase ${source.code}`,
              source_document_id: source.id,
              ...(!governed && tax > 0n
                ? {
                    tax_amount: nativePurchaseAmount(decimalText(tax, 8), currency.sourceDecimalPlaces),
                    tax_account_id: input.tax_account_id,
                  }
                : {}),
            });
          } else
            payload = subledgerOperationInputSchema.parse({
              company_id: input.company_id,
              type: "purchase_payment",
              side: "payable",
              source_document_id: source.id,
              source_version: source.version,
              currency: source.currency,
              date: source.document_date,
              reference: source.code,
              reason: `Settle approved Purchase ${source.code}`,
              discount_account_id: input.discount_account_id,
              advance_account_id: input.advance_account_id,
              advance_monetary: input.advance_monetary,
              tax_definition_id: input.tax_definition_id,
              additional_tax_definition_id: input.additional_tax_definition_id,
              bank_fee: input.bank_fee,
            });
          if (previous) {
            const stored = subledgerOperationInputSchema.parse(previous.input);
            if (stored.type === "purchase_payment")
              payload = {
                ...stored,
                discount_account_id: input.discount_account_id,
                advance_account_id: input.advance_account_id,
                advance_monetary: input.advance_monetary,
                tax_definition_id: input.tax_definition_id,
                additional_tax_definition_id: input.additional_tax_definition_id,
                bank_fee: input.bank_fee,
              };
            else if (stored.type === "recognition") payload = { ...stored, tax_account_id: input.tax_account_id };
            else reject("This operation is not a source accounting draft.");
          }
          const id = previous?.id ?? randomUUID(),
            code =
              previous?.code ??
              (await this.code(client, context.tenantId, input.company_id, source.kind === "bill" ? "API" : "PSET"));
          const preview = await this.preview(client, context, payload, id, code);
          if (previous) {
            await client.query(
              "insert into procurement_accounting_link(tenant_id,company_id,document_id,operation_id,source_version,created_by) values($1,$2,$3,$4,$5,$6) on conflict(tenant_id,company_id,document_id) do nothing",
              [context.tenantId, input.company_id, source.id, id, source.version, context.actor.userId],
            );
            await client.query(
              "update finance_subledger_operation set payload=$4,preview=$5,state='draft',preview_hash=null,approver_id=null,version=version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
              [context.tenantId, input.company_id, id, JSON.stringify(payload), JSON.stringify(preview)],
            );
          } else {
            await client.query(
              "insert into finance_subledger_operation(tenant_id,company_id,id,code,type,operation_date,maker_id,payload,preview) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
              [
                context.tenantId,
                input.company_id,
                id,
                code,
                payload.type,
                payload.date,
                context.actor.userId,
                JSON.stringify(payload),
                JSON.stringify(preview),
              ],
            );
            await client.query(
              "insert into procurement_accounting_link(tenant_id,company_id,document_id,operation_id,source_version,created_by) values($1,$2,$3,$4,$5,$6)",
              [context.tenantId, input.company_id, source.id, id, source.version, context.actor.userId],
            );
          }
          await this.audit(
            client,
            context,
            input.company_id,
            previous ? "purchase_draft_revised" : "purchase_prepared",
            id,
            payload.reason,
            {
              source_id: source.id,
              source_version: source.version,
              ...(previous
                ? {
                    previous_version: previous.version,
                    previous_input: previous.input,
                    previous_preview: previous.preview,
                  }
                : {}),
              preview,
            },
          );
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
                  payloadHashMaterial: {
                    operation_id: id,
                    approved_hash: row.preview_hash!,
                    reason: input.reason,
                    ...(payload.type === "purchase_payment"
                      ? { payment_reference: payload.reference, purchase_document_id: payload.source_document_id }
                      : {}),
                  },
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
            for (const item of [
              ...(recalculated.item ? [recalculated.item] : []),
              ...(recalculated.additional_items ?? []),
            ]) {
              await client.query(
                `insert into finance_subledger_item(tenant_id,company_id,id,code,operation_id,party_id,side,kind,currency,base_currency,decimal_places,base_decimal_places,document_date,due_date,original_amount,original_base,monetary,control_account_id,journal_id,rate,rate_id,source_document_id,due_schedule)
            values(${Array.from({ length: 23 }, (_, i) => `$${i + 1}`).join(",")})`,
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
                  item.due_schedule ? JSON.stringify(item.due_schedule) : null,
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
            if (
              payload.type === "recognition" &&
              payload.side === "payable" &&
              payload.kind === "invoice" &&
              payload.source_document_id
            )
              await registerPostedPurchase(
                new SourceAssetRepository(this.pool),
                client,
                context,
                input.company_id,
                payload.source_document_id,
                journal!,
              );
            await recordPurchaseStockMatches(
              client,
              context.tenantId,
              input.company_id,
              id,
              journal!,
              recalculated.stock_matches ?? [],
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
