import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  assetCategoryInputSchema,
  assetAssignmentSchema,
  assetCategorySchema,
  assetCreateSchema,
  assetCreateResultSchema,
  assetUpdateSchema,
  assetActionSchema,
  fixedAssetSchema,
  assetOptionsSchema,
  assetDirectorySchema,
  assetQuerySchema,
  assetSourcesSchema,
  validateAssetCustomFields,
  assetCompanyPolicyInputSchema,
  assetCompanyPolicySchema,
  assetNominalClassificationInputSchema,
  assetPolicyStart,
  type AssetCompanyPolicyInput,
  type AssetCompanyPolicy,
  type AssetCategoryInput,
  type AssetCreate,
  type AssetUpdate,
  type AssetAction,
  type FixedAsset,
  type AssetQuery,
  type AssetCategory,
  type AssetSource,
} from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { companyAuthoritySql } from "../security/company-authority.js";
import { resolveCompanyBaseCurrency, CompanyCurrencyAuthorityError } from "../finance/currencies/company-authority.js";
import { FinancePostingService, hashFinanceValue } from "../finance/posting/service.js";
import { FinancePostingError } from "../finance/posting/types.js";
import { acquisitionSources } from "./sources.js";
import { minor, money } from "./calculations.js";
import { attachStagedDocuments } from "./staged-documents.js";

export class AssetError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function reject(message: string, code = "ASSET_VALIDATION_FAILED", status = 409): never {
  throw new AssetError(status, code, message);
}
export const digest = (value: unknown) => hashFinanceValue(JSON.parse(JSON.stringify(value ?? null)));
export type AssetAuditEntry = { id: string; action: string; reason: string; before: unknown; after: unknown };
export type AssetActorContext = BankingActorContext & { correlationId?: string };
export const assetProjection = `(select s.name from procurement_supplier s where s.tenant_id=fixed_asset_record.tenant_id and s.company_id=fixed_asset_record.company_id and s.id=fixed_asset_record.supplier_id) as supplier_name,
 (select d.code from journal_line l join finance_subledger_item i on i.tenant_id=l.tenant_id and i.journal_id=l.journal_id and i.kind='invoice' and i.side='payable'
 join procurement_document d on d.tenant_id=i.tenant_id and d.company_id=i.company_id and d.id=i.source_document_id
 where l.tenant_id=fixed_asset_record.tenant_id and l.id=fixed_asset_record.source_line_id limit 1) as purchase_reference,
 accrual_basis,id,company_id,code,category_id,category_snapshot as category,category_snapshot->>'name' as category_name,supplier_id,source_line_id,acquisition_date::text,base_currency,decimal_places,
 cost::text,residual_value::text,accumulated_depreciation::text,impairment::text,(case when status in ('returned','disposed') then 0 else cost-accumulated_depreciation-impairment end)::text as net_book_value,
 useful_life_months,method,annual_rate_percent::float,in_service_date::text,depreciation_start::text,last_depreciation_end::text,last_financial_date::text,
 assignment,assignment_date::text,details,status,version,created_by,approved_by,created_at::text`;
function effectiveCategory(category: AssetCategory, policy: AssetCompanyPolicy | null): AssetCategory {
  if (!policy) {
    if (category.inherit_company_policy) reject("Configure the company Asset Policy before inheriting it.");
    return category;
  }
  if (!category.inherit_company_policy && policy.allow_category_overrides) return category;
  return {
    ...category,
    inherit_company_policy: true,
    method: policy.method,
    useful_life_months: policy.useful_life_months,
    annual_rate_percent: policy.annual_rate_percent,
    residual_percent: policy.residual_percent,
    calculation_basis: "actual_actual",
    company_policy_version: policy.version,
    start_rule: policy.start_rule,
    allow_start_override: policy.allow_start_override,
    allow_policy_override: policy.allow_category_overrides,
  };
}
export class SourceAssetRepository {
  constructor(
    readonly pool: Pool,
    readonly finance = new FinancePostingService(),
  ) {}
  async transaction<T>(
    context: AssetActorContext,
    company: string,
    action: string,
    write: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const permission = `assets.asset.${action}`;
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission))
      reject("The required Fixed Assets permission is missing.", "PERMISSION_DENIED", 403);
    if (write && (context.realActorId || context.impersonationRequestId))
      reject("Asset changes are disabled during impersonation.", "IMPERSONATION_RESTRICTED", 403);
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
        reject("Fixed Assets access is not available in this company.", "COMPANY_ACCESS_DENIED", 403);
      if (write)
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `assets:${context.tenantId}:${company}`,
        ]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error instanceof AssetError) throw error;
      if (error instanceof FinancePostingError || error instanceof CompanyCurrencyAuthorityError)
        throw new AssetError(error.status, error.code, error.message);
      if (error instanceof z.ZodError)
        throw new AssetError(400, "ASSET_INPUT_INVALID", "Asset input or stored evidence is invalid.");
      if (error instanceof RangeError) throw new AssetError(400, "ASSET_AMOUNT_INVALID", error.message);
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23503", "23505", "23514", "40001", "40P01"].includes(String(error.code))
      ) {
        const mapped = new AssetError(
          409,
          "ASSET_CONFLICT",
          "Asset evidence conflicts with a database constraint or concurrent change. Refresh and retry.",
        );
        Object.defineProperty(mapped, "cause", { value: error });
        throw mapped;
      }
      throw error;
    } finally {
      client.release();
    }
  }
  async idempotent<T>(
    client: PoolClient,
    context: BankingActorContext,
    company: string,
    key: string,
    input: unknown,
    schema: z.ZodType<T>,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      reject("Supply a valid idempotency key.", "INVALID_IDEMPOTENCY_KEY", 400);
    const hash = digest(input),
      prior = (
        await client.query<{ fingerprint: string; result: unknown }>(
          "select fingerprint,result from fixed_asset_idempotency where tenant_id=$1 and company_id=$2 and actor_id=$3 and key=$4",
          [context.tenantId, company, context.actor.userId, key],
        )
      ).rows[0];
    if (prior) {
      if (prior.fingerprint !== hash)
        reject("This idempotency key belongs to another request.", "IDEMPOTENCY_CONFLICT");
      return schema.parse(prior.result);
    }
    const result = schema.parse(await work());
    await client.query(
      "insert into fixed_asset_idempotency(tenant_id,company_id,actor_id,key,fingerprint,result) values($1,$2,$3,$4,$5,$6)",
      [context.tenantId, company, context.actor.userId, key, hash, JSON.stringify(result)],
    );
    return result;
  }
  async code(client: PoolClient, tenant: string, company: string, prefix: string) {
    const row = (
      await client.query<{ value: string }>(
        `insert into fixed_asset_sequence(tenant_id,company_id,prefix,next_value) values($1,$2,$3,2) on conflict(tenant_id,company_id,prefix) do update set next_value=fixed_asset_sequence.next_value+1 returning (next_value-1)::text as value`,
        [tenant, company, prefix],
      )
    ).rows[0]!;
    return `${prefix}-${row.value.padStart(3, "0")}`;
  }
  async audit(
    client: PoolClient,
    context: BankingActorContext,
    company: string,
    id: string,
    action: string,
    reason: string,
    before: unknown,
    after: unknown,
  ) {
    return this.auditBatch(client, context, company, [{ id, action, reason, before, after }]);
  }
  async auditBatch(client: PoolClient, context: AssetActorContext, company: string, entries: AssetAuditEntry[]) {
    if (!entries.length) return;
    if (entries.length > 400) reject("The asset audit batch exceeds its safe limit.");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const prior = (
      await client.query<{ sequence: string; event_hash: string }>(
        "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
        [context.tenantId],
      )
    ).rows[0];
    let previous = prior?.event_hash ?? digest({ genesis: context.tenantId }),
      sequence = Number(prior?.sequence ?? 0);
    const evidence: Array<{
      tenant_id: string;
      company_id: string;
      id: string;
      entity_id: string;
      action: string;
      actor_id: string;
      reason: string;
      before_value: unknown;
      after_value: unknown;
      audit_event_id: string;
    }> = [];
    const events = entries.map((entry) => {
      const event = {
        id: randomUUID(),
        tenant_id: context.tenantId,
        sequence: ++sequence,
        actor_id: context.actor.userId,
        correlation_id: context.correlationId ?? randomUUID(),
        action: `assets.asset.${entry.action}`,
        entity_type: "fixed_asset",
        entity_id: entry.id,
        before_hash: digest(entry.before),
        after_hash: digest(entry.after),
        source_reference: `company:${company}`,
        approval_reference: null,
        occurred_at: new Date().toISOString(),
        previous_event_hash: previous,
      };
      const event_hash = digest(event);
      previous = event_hash;
      evidence.push({
        tenant_id: context.tenantId,
        company_id: company,
        id: randomUUID(),
        entity_id: entry.id,
        action: entry.action,
        actor_id: context.actor.userId,
        reason: entry.reason,
        before_value: entry.before ?? null,
        after_value: entry.after ?? null,
        audit_event_id: event.id,
      });
      return { ...event, event_hash };
    });
    await client.query(
      `insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash) select id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash from jsonb_to_recordset($1::jsonb) as e(id text,tenant_id text,sequence bigint,actor_id text,correlation_id text,action text,entity_type text,entity_id text,before_hash text,after_hash text,source_reference text,approval_reference text,occurred_at timestamptz,previous_event_hash text,event_hash text)`,
      [JSON.stringify(events)],
    );
    await client.query(
      `insert into fixed_asset_audit(tenant_id,company_id,id,entity_id,action,actor_id,reason,before_value,after_value,audit_event_id) select tenant_id,company_id,id,entity_id,action,actor_id,reason,before_value,after_value,audit_event_id from jsonb_to_recordset($1::jsonb) as e(tenant_id text,company_id text,id text,entity_id text,action text,actor_id text,reason text,before_value jsonb,after_value jsonb,audit_event_id text)`,
      [JSON.stringify(evidence)],
    );
  }
  async assetsByIds(client: PoolClient, tenant: string, company: string, ids: string[], lock = false) {
    const result = await client.query(
      `select ${assetProjection} from fixed_asset_record where tenant_id=$1 and company_id=$2 and id=any($3::text[]) order by id ${lock ? "for update" : ""}`,
      [tenant, company, ids],
    );
    return result.rows.map((row) => fixedAssetSchema.parse(row));
  }
  async postingContexts(client: PoolClient, tenant: string, company: string, assets: FixedAsset[], date: string) {
    const rows = await client.query<{ id: string; dimensions: unknown; assignment: unknown }>(
      `select a.id,l.dimensions,case when a.assignment_date<=$4 then a.assignment else coalesce((select input->'assignment' from fixed_asset_event e where e.tenant_id=a.tenant_id and e.company_id=a.company_id and e.asset_id=a.id and e.type='transfer' and e.state='posted' and e.event_date<=$4 order by e.event_date desc,e.created_at desc,e.id desc limit 1),(select after_value->'asset'->'assignment' from fixed_asset_audit h where h.tenant_id=a.tenant_id and h.company_id=a.company_id and h.entity_id=a.id and h.action='created' order by occurred_at,id limit 1)) end as assignment
      from fixed_asset_record a join journal_line l on l.tenant_id=a.tenant_id and l.id=a.source_line_id join journal_entry j on j.tenant_id=l.tenant_id and j.company_id=a.company_id and j.id=l.journal_id and j.status='posted' where a.tenant_id=$1 and a.company_id=$2 and a.id=any($3::text[]) for share of j,l`,
      [tenant, company, assets.map((asset) => asset.id), date],
    );
    if (rows.rowCount !== assets.length)
      reject("A registered acquisition source is unavailable.", "ASSET_SOURCE_INVALID");
    return new Map(
      rows.rows.map((row) => {
        const assignment = assetAssignmentSchema.parse(row.assignment),
          source = z.record(z.string(), z.string()).parse(row.dimensions);
        return [
          row.id,
          {
            ...source,
            ...Object.fromEntries(
              Object.entries(assignment)
                .filter((entry): entry is [string, string] => entry[1] !== null)
                .map(([key, value]) => [key.replace("_id", ""), value]),
            ),
          },
        ];
      }),
    );
  }
  async asset(client: PoolClient, tenant: string, company: string, id: string, lock = false): Promise<FixedAsset> {
    const row = (
      await client.query(
        `select ${assetProjection} from fixed_asset_record where tenant_id=$1 and company_id=$2 and id=$3 ${lock ? "for update" : ""}`,
        [tenant, company, id],
      )
    ).rows[0];
    if (!row) reject("The asset was not found.", "ASSET_NOT_FOUND", 404);
    return fixedAssetSchema.parse(row);
  }
  async category(client: PoolClient, tenant: string, company: string, id: string): Promise<AssetCategory> {
    const row = (
      await client.query<{ id: string; code: string; version: number; policy: unknown }>(
        "select id,code,version,policy from fixed_asset_category where tenant_id=$1 and company_id=$2 and id=$3",
        [tenant, company, id],
      )
    ).rows[0];
    if (!row) reject("The asset category was not found.", "ASSET_CATEGORY_NOT_FOUND", 404);
    const category = assetCategorySchema.parse({
      ...Object(row.policy),
      id: row.id,
      code: row.code,
      version: row.version,
    });
    const policy = await this.companyPolicy(client, tenant, company);
    return effectiveCategory(category, policy);
  }
  async companyPolicy(client: PoolClient, tenant: string, company: string) {
    const row = (
      await client.query<{ version: number; policy: unknown }>(
        "select version,policy from fixed_asset_company_policy where tenant_id=$1 and company_id=$2",
        [tenant, company],
      )
    ).rows[0];
    return row ? assetCompanyPolicySchema.parse({ ...Object(row.policy), version: row.version }) : null;
  }
  async saveCompanyPolicy(context: BankingActorContext, raw: AssetCompanyPolicyInput, key: string) {
    const input = assetCompanyPolicyInputSchema.parse(raw);
    return this.transaction(context, input.company_id, "categories", true, (client) =>
      this.idempotent(client, context, input.company_id, key, input, assetCompanyPolicySchema, async () => {
        const before = await this.companyPolicy(client, context.tenantId, input.company_id);
        this.version(before?.version ?? 0, input.expected_version);
        if (
          input.auto_prepare_monthly &&
          (!context.actor.permissions.includes("assets.asset.depreciate") ||
            !(
              await client.query(companyAuthoritySql, [
                context.tenantId,
                context.actor.userId,
                input.company_id,
                "assets.asset.depreciate",
              ])
            ).rowCount)
        )
          reject(
            "Depreciation preparation authority is required to enable scheduled drafts.",
            "PERMISSION_DENIED",
            403,
          );
        const terms = Object.fromEntries(Object.entries(input).filter(([name]) => name !== "expected_version"));
        const policy = { ...terms, scheduled_actor_id: context.actor.userId };
        await client.query(
          `insert into fixed_asset_company_policy(tenant_id,company_id,version,policy,updated_by) values($1,$2,1,$3,$4)
        on conflict(tenant_id,company_id) do update set version=fixed_asset_company_policy.version+1,policy=excluded.policy,updated_by=excluded.updated_by,updated_at=clock_timestamp()`,
          [context.tenantId, input.company_id, JSON.stringify(policy), context.actor.userId],
        );
        const after = (await this.companyPolicy(client, context.tenantId, input.company_id))!;
        await this.audit(
          client,
          context,
          input.company_id,
          input.company_id,
          "company_policy_saved",
          "Configure company Asset Policies",
          before,
          after,
        );
        return after;
      }),
    );
  }
  async classifyNominal(
    context: BankingActorContext,
    account: string,
    raw: z.infer<typeof assetNominalClassificationInputSchema>,
    key: string,
  ) {
    const input = assetNominalClassificationInputSchema.parse(raw);
    return this.transaction(context, input.company_id, "categories", true, async (client) => {
      if (
        !context.actor.permissions.includes("finance.nominal.update") ||
        !(
          await client.query(companyAuthoritySql, [
            context.tenantId,
            context.actor.userId,
            input.company_id,
            "finance.nominal.update",
          ])
        ).rowCount
      )
        reject("Chart of Accounts update permission is required.", "PERMISSION_DENIED", 403);
      const nominal = (
        await client.query(
          `select id from account a where tenant_id=$1 and company_id=$2 and id=$3 and type='asset' and status='active' and not is_header and not reconciliation_required
        and not exists(select 1 from bank_account b where b.tenant_id=a.tenant_id and b.company_id=a.company_id and b.account_id=a.id)
        and not exists(select 1 from finance_subledger_policy p where p.tenant_id=a.tenant_id and p.company_id=a.company_id and a.id in(p.receivable_account_id,p.payable_account_id))
        and not exists(select 1 from finance_tax_mapping_rule t where t.tenant_id=a.tenant_id and t.company_id=a.company_id and t.account_id=a.id)`,
          [context.tenantId, input.company_id, account],
        )
      ).rows[0];
      if (!nominal) reject("Only an active postable non-control asset nominal can be classified.");
      const schema = z.strictObject({ account_id: z.string(), active: z.boolean(), version: z.number().int() });
      return this.idempotent(client, context, input.company_id, key, { account, input }, schema, async () => {
        const before = (
          await client.query<{ active: boolean; version: number }>(
            "select active,version from fixed_asset_nominal_classification where tenant_id=$1 and company_id=$2 and account_id=$3 for update",
            [context.tenantId, input.company_id, account],
          )
        ).rows[0];
        this.version(before?.version ?? 0, input.expected_version);
        await client.query(
          `insert into fixed_asset_nominal_classification(tenant_id,company_id,account_id,active,updated_by) values($1,$2,$3,$4,$5)
          on conflict(tenant_id,company_id,account_id) do update set active=excluded.active,version=fixed_asset_nominal_classification.version+1,updated_by=excluded.updated_by,updated_at=clock_timestamp()`,
          [context.tenantId, input.company_id, account, input.active, context.actor.userId],
        );
        const after = { account_id: account, active: input.active, version: (before?.version ?? 0) + 1 };
        await this.audit(client, context, input.company_id, account, "nominal_classified", input.reason, before, after);
        return after;
      });
    });
  }
  async categories(client: PoolClient, tenant: string, company: string) {
    const rows = (
      await client.query(
        "select id,code,version,policy from fixed_asset_category where tenant_id=$1 and company_id=$2 order by code",
        [tenant, company],
      )
    ).rows;
    const categories = rows.map((row) =>
      assetCategorySchema.parse({ ...row.policy, id: row.id, code: row.code, version: row.version }),
    );
    const policy = await this.companyPolicy(client, tenant, company);
    return categories.map((category) => effectiveCategory(category, policy));
  }
  async saveCategory(context: BankingActorContext, id: string | null, raw: AssetCategoryInput, key: string) {
    const input = assetCategoryInputSchema.parse(raw);
    return this.transaction(context, input.company_id, "categories", true, (client) =>
      this.idempotent(client, context, input.company_id, key, { id, input }, assetCategorySchema, async () => {
        const base = await resolveCompanyBaseCurrency(client, context.tenantId, input.company_id);
        const companyPolicy = await this.companyPolicy(client, context.tenantId, input.company_id);
        if (companyPolicy && !companyPolicy.allow_category_overrides && !input.inherit_company_policy)
          reject("Company Asset Policies require categories to inherit the company depreciation terms.");
        minor(input.capitalization_threshold, base.decimalPlaces);
        const roles = [
          ["asset", input.asset_account_id],
          ["asset", input.accumulated_account_id],
          ["expense", input.expense_account_id],
          ["revenue", input.gain_account_id],
          ["expense", input.loss_account_id],
          ["expense", input.impairment_account_id],
        ];
        for (const [type, account] of roles)
          if (
            !(
              await client.query(
                "select 1 from account where tenant_id=$1 and company_id=$2 and id=$3 and type=$4 and status='active' and not is_header and not reconciliation_required",
                [context.tenantId, input.company_id, account, type],
              )
            ).rowCount
          )
            reject("Select active, postable company accounts of the correct type for all category roles.");
        const before = id ? await this.category(client, context.tenantId, input.company_id, id) : null;
        if (input.expected_version !== (before?.version ?? 0))
          reject("The category changed. Refresh and retry.", "ASSET_VERSION_CONFLICT", 412);
        const identifier = id ?? randomUUID(),
          code = before?.code ?? (await this.code(client, context.tenantId, input.company_id, "FAC")),
          policy = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "expected_version"));
        await client.query(
          `insert into fixed_asset_category(tenant_id,company_id,id,code,name,version,active,policy,asset_account_id,accumulated_account_id,created_by,updated_by) values($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,$10)
   on conflict(tenant_id,company_id,id) do update set name=excluded.name,version=fixed_asset_category.version+1,active=excluded.active,policy=excluded.policy,asset_account_id=excluded.asset_account_id,accumulated_account_id=excluded.accumulated_account_id,updated_by=excluded.updated_by,updated_at=clock_timestamp()`,
          [
            context.tenantId,
            input.company_id,
            identifier,
            code,
            input.name,
            input.active,
            JSON.stringify(policy),
            input.asset_account_id,
            input.accumulated_account_id,
            context.actor.userId,
          ],
        );
        await client.query(
          `insert into fixed_asset_nominal_classification(tenant_id,company_id,account_id,updated_by)
          values($1,$2,$3,$4) on conflict(tenant_id,company_id,account_id) do nothing`,
          [context.tenantId, input.company_id, input.asset_account_id, context.actor.userId],
        );
        const result = await this.category(client, context.tenantId, input.company_id, identifier);
        await this.audit(
          client,
          context,
          input.company_id,
          identifier,
          "category_saved",
          "Category accounting policy configured.",
          before,
          result,
        );
        return result;
      }),
    );
  }
  async source(client: PoolClient, tenant: string, company: string, line: string, lock = false): Promise<AssetSource> {
    if (lock) {
      const journal = (
        await client.query<{ journal_id: string }>(
          "select l.journal_id from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id where l.tenant_id=$1 and j.company_id=$2 and l.id=$3",
          [tenant, company, line],
        )
      ).rows[0];
      if (!journal) reject("The acquisition source was not found.", "ASSET_SOURCE_INVALID");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `fixed-asset-source-journal:${tenant}:${company}:${journal.journal_id}`,
      ]);
    }
    const source = (await acquisitionSources(client, tenant, company, 0, 1, line))[0];
    if (!source)
      reject(
        "Select an original posted Bank Payment or a posted supplier invoice linked to an approved Purchase bill.",
        "ASSET_SOURCE_INVALID",
      );
    return source;
  }
  async assignment(
    client: PoolClient,
    tenant: string,
    company: string,
    assignment: FixedAsset["assignment"],
    date: string,
  ) {
    for (const [key, table] of [
      ["location_id", "erp_location"],
      ["project_id", "erp_project"],
    ] as const)
      if (
        assignment[key] &&
        !(
          await client.query(
            `select 1 from ${table} where tenant_id=$1 and company_id=$2 and id=$3 and status='active'`,
            [tenant, company, assignment[key]],
          )
        ).rowCount
      )
        reject("The assignment reference is inactive or outside this company.");
    for (const [key, type] of [
      ["department_id", "department"],
      ["branch_id", "branch"],
    ] as const)
      if (
        assignment[key] &&
        !(
          await client.query(
            `with recursive units as (select id,parent_id,type,status from organization_unit where tenant_id=$1 and id=$2 union all select u.id,u.parent_id,u.type,u.status from organization_unit u join units p on u.parent_id=p.id where u.tenant_id=$1) select 1 from units where id=$3 and type=$4 and status='active'`,
            [tenant, company, assignment[key], type],
          )
        ).rowCount
      )
        reject("The organization assignment is inactive or outside this company.");
    if (
      assignment.custodian_id &&
      !(
        await client.query(
          `select 1 from employee e join employee_assignment a on a.tenant_id=e.tenant_id and a.employee_id=e.id where e.tenant_id=$1 and e.id=$3 and a.company_id=$2 and a.effective_from<=$4 and (a.effective_to is null or a.effective_to>=$4) and e.status in ('active','probation','confirmed')`,
          [tenant, company, assignment.custodian_id, date],
        )
      ).rowCount
    )
      reject("The custodian needs a current employee assignment in this company.");
  }
  async assignmentAt(
    client: PoolClient,
    tenant: string,
    company: string,
    asset: FixedAsset,
    date: string,
  ): Promise<FixedAsset["assignment"]> {
    if (asset.assignment_date <= date) return asset.assignment;
    const transfer = (
      await client.query<{ assignment: unknown }>(
        "select input->'assignment' as assignment from fixed_asset_event where tenant_id=$1 and company_id=$2 and asset_id=$3 and type='transfer' and state='posted' and event_date<=$4 order by event_date desc,created_at desc,id desc limit 1",
        [tenant, company, asset.id, date],
      )
    ).rows[0];
    const initial =
      transfer ??
      (
        await client.query<{ assignment: unknown }>(
          "select after_value->'asset'->'assignment' as assignment from fixed_asset_audit where tenant_id=$1 and company_id=$2 and entity_id=$3 and action='created' order by occurred_at,id limit 1",
          [tenant, company, asset.id],
        )
      ).rows[0];
    if (!initial) reject("Historical assignment evidence is unavailable.", "ASSET_ASSIGNMENT_HISTORY_MISSING");
    return assetAssignmentSchema.parse(initial.assignment);
  }
  async create(context: BankingActorContext, raw: AssetCreate, key: string) {
    const input = assetCreateSchema.parse(raw);
    return this.transaction(context, input.company_id, "create", true, (client) =>
      this.idempotent(client, context, input.company_id, key, input, assetCreateResultSchema, () =>
        this.createInTransaction(client, context, input),
      ),
    );
  }
  async createInTransaction(
    client: PoolClient,
    context: BankingActorContext,
    input: AssetCreate,
    purchaseDocument?: string,
  ) {
    if (
      context.tenantId !== context.actor.tenantId ||
      !context.actor.permissions.includes("assets.asset.create") ||
      context.realActorId ||
      context.impersonationRequestId
    )
      reject("The required Fixed Assets creation permission is missing.", "PERMISSION_DENIED", 403);
    if (
      !(
        await client.query(companyAuthoritySql, [
          context.tenantId,
          context.actor.userId,
          input.company_id,
          "assets.asset.create",
        ])
      ).rowCount
    )
      reject("Fixed Assets access is not available in this company.", "COMPANY_ACCESS_DENIED", 403);
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `assets:${context.tenantId}:${input.company_id}`,
    ]);
    const category = await this.category(client, context.tenantId, input.company_id, input.category_id);
    if (!category.active) reject("The category is inactive.");
    const source = await this.source(client, context.tenantId, input.company_id, input.source_line_id, true),
      base = await resolveCompanyBaseCurrency(client, context.tenantId, input.company_id);
    if (source.account_id !== category.asset_account_id)
      reject("The posted acquisition account does not match the selected category.");
    const supplier = source.supplier_id ?? input.supplier_id ?? null;
    if (source.supplier_id && input.supplier_id && source.supplier_id !== input.supplier_id)
      reject("The supplier must match the original Purchase invoice.");
    if (
      !supplier ||
      !(
        await client.query(
          "select 1 from procurement_supplier where tenant_id=$1 and company_id=$2 and id=$3 and status='active'",
          [context.tenantId, input.company_id, supplier],
        )
      ).rowCount
    )
      reject("Select the original active company supplier.");
    let total = 0n;
    const items: FixedAsset[] = [];
    for (const unit of input.units) {
      const fieldError = validateAssetCustomFields(category.field_definitions ?? [], unit.details.custom_fields);
      if (fieldError) reject(fieldError);
      const cost = minor(unit.cost, base.decimalPlaces),
        residual = minor(unit.residual_value, base.decimalPlaces);
      total += cost;
      if (cost <= 0n || residual > cost || cost < minor(category.capitalization_threshold, base.decimalPlaces))
        reject("Cost must be positive, meet the category threshold, and cover residual value.");
      if (unit.in_service_date < source.date || unit.depreciation_start < unit.in_service_date)
        reject("In-service and depreciation dates must follow the acquisition.");
      this.validateUnitPolicy(category, unit);
      if (unit.method === "reducing_balance" && unit.annual_rate_percent <= 0)
        reject("Reducing balance requires a positive annual rate.");
      if (
        unit.details.warranty_start &&
        unit.details.warranty_end &&
        unit.details.warranty_start > unit.details.warranty_end
      )
        reject("Warranty end must follow its start.");
      await this.assignment(client, context.tenantId, input.company_id, unit.assignment, unit.in_service_date);
      const id = randomUUID(),
        code = await this.code(client, context.tenantId, input.company_id, category.numbering_prefix);
      await client.query(
        `insert into fixed_asset_record(tenant_id,company_id,id,code,category_id,category_snapshot,supplier_id,source_line_id,acquisition_date,base_currency,decimal_places,cost,residual_value,useful_life_months,method,annual_rate_percent,in_service_date,depreciation_start,last_financial_date,assignment,assignment_date,details,status,created_by)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$9,$19,$17,$20,'draft',$21)`,
        [
          context.tenantId,
          input.company_id,
          id,
          code,
          category.id,
          JSON.stringify(category),
          supplier,
          source.line_id,
          source.date,
          base.code,
          base.decimalPlaces,
          money(cost, base.decimalPlaces),
          money(residual, base.decimalPlaces),
          unit.useful_life_months,
          unit.method,
          unit.annual_rate_percent,
          unit.in_service_date,
          unit.depreciation_start,
          JSON.stringify(unit.assignment),
          JSON.stringify(unit.details),
          context.actor.userId,
        ],
      );
      await client.query(
        "insert into fixed_asset_acquisition(tenant_id,company_id,id,asset_id,source_line_id,amount) values($1,$2,$3,$4,$5,$6)",
        [context.tenantId, input.company_id, randomUUID(), id, source.line_id, money(cost, base.decimalPlaces)],
      );
      const asset = await this.asset(client, context.tenantId, input.company_id, id);
      await attachStagedDocuments(client, context, input.company_id, id, category, unit.details, purchaseDocument);
      await this.audit(client, context, input.company_id, id, "created", input.reason, null, { asset, source });
      items.push(asset);
    }
    if (total > minor(source.available, base.decimalPlaces))
      reject(
        "The individual asset costs exceed the remaining posted acquisition amount.",
        "ASSET_SOURCE_OVERALLOCATED",
      );
    return { items };
  }
  async update(context: BankingActorContext, id: string, raw: AssetUpdate, key: string) {
    const input = assetUpdateSchema.parse(raw);
    return this.transaction(context, input.company_id, "edit", true, (client) =>
      this.idempotent(client, context, input.company_id, key, { id, input }, fixedAssetSchema, async () => {
        const before = await this.asset(client, context.tenantId, input.company_id, id, true);
        const fieldError = validateAssetCustomFields(
          before.category.field_definitions ?? [],
          input.details.custom_fields,
        );
        if (fieldError) reject(fieldError);
        this.version(before.version, input.expected_version);
        if (!["draft", "active", "fully_depreciated"].includes(before.status))
          reject("Details can be edited only for drafts or assets in service.");
        if (
          input.details.warranty_start &&
          input.details.warranty_end &&
          input.details.warranty_start > input.details.warranty_end
        )
          reject("Warranty end must follow its start.");
        const policy = input.depreciation ?? before;
        for (const field of before.category.field_definitions ?? []) {
          if (field.type !== "document") continue;
          const reference = input.details.custom_fields?.[field.key];
          if (!reference || reference === before.details.custom_fields?.[field.key]) continue;
          if (
            typeof reference !== "string" ||
            !reference.startsWith("attachment:") ||
            !(
              await client.query(
                "select 1 from fixed_asset_attachment where tenant_id=$1 and company_id=$2 and asset_id=$3 and id=$4",
                [context.tenantId, input.company_id, id, reference.slice(11)],
              )
            ).rowCount
          )
            reject("Select a private attachment belonging to this asset.");
        }
        if (input.depreciation) this.validateUnitPolicy(before.category, policy);
        if (input.depreciation && before.status !== "draft")
          reject("Depreciation policy can be corrected only before submission.");
        if (
          minor(policy.residual_value, before.decimal_places) > minor(before.cost, before.decimal_places) ||
          policy.in_service_date < before.acquisition_date ||
          policy.depreciation_start < policy.in_service_date ||
          (policy.method === "reducing_balance" && policy.annual_rate_percent <= 0)
        )
          reject("Check residual value, useful life, reducing-balance rate and commencement dates.");
        if (input.depreciation)
          await this.assignment(client, context.tenantId, input.company_id, before.assignment, policy.in_service_date);
        await client.query(
          "update fixed_asset_record set details=$4,residual_value=$5,useful_life_months=$6,method=$7,annual_rate_percent=$8,in_service_date=$9,depreciation_start=$10,assignment_date=case when status='draft' then $9 else assignment_date end,version=version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
          [
            context.tenantId,
            input.company_id,
            id,
            JSON.stringify(input.details),
            policy.residual_value,
            policy.useful_life_months,
            policy.method,
            policy.annual_rate_percent,
            policy.in_service_date,
            policy.depreciation_start,
          ],
        );
        const result = await this.asset(client, context.tenantId, input.company_id, id);
        await this.audit(client, context, input.company_id, id, "updated", input.reason, before, result);
        return result;
      }),
    );
  }
  version(actual: number, expected: number) {
    if (actual !== expected) reject("The record changed. Refresh and retry.", "ASSET_VERSION_CONFLICT", 412);
  }
  validateUnitPolicy(
    category: AssetCategory,
    unit: Pick<
      AssetCreate["units"][number],
      "in_service_date" | "depreciation_start" | "method" | "annual_rate_percent" | "useful_life_months"
    >,
  ) {
    if (
      category.inherit_company_policy &&
      category.allow_policy_override === false &&
      (unit.method !== category.method ||
        unit.annual_rate_percent !== category.annual_rate_percent ||
        unit.useful_life_months !== category.useful_life_months)
    )
      reject("The company policy does not permit overriding depreciation method, rate or useful life.");
    const start = assetPolicyStart(category, unit.in_service_date);
    if (category.allow_start_override === false && unit.depreciation_start !== start)
      reject("The depreciation start must follow the approved company start rule.");
  }
  async action(context: BankingActorContext, id: string, raw: AssetAction, key: string) {
    const input = assetActionSchema.parse(raw);
    return this.transaction(
      context,
      input.company_id,
      input.action === "submit" ? "create" : "approve",
      true,
      (client) =>
        this.idempotent(client, context, input.company_id, key, { id, input }, fixedAssetSchema, async () => {
          const before = await this.asset(client, context.tenantId, input.company_id, id, true);
          this.version(before.version, input.expected_version);
          const target = { submit: "submitted", approve: "approved", reject: "draft", activate: "active" }[
              input.action
            ],
            required = { submit: "draft", approve: "submitted", reject: "submitted", activate: "approved" }[
              input.action
            ];
          if (before.status !== required) reject("This action is unavailable in the asset lifecycle state.");
          if (["approve", "reject", "activate"].includes(input.action) && before.created_by === context.actor.userId)
            reject("An independent checker must approve and activate this asset.", "ASSET_SELF_APPROVAL_DENIED", 403);
          const source = await this.source(client, context.tenantId, input.company_id, before.source_line_id);
          if (source.account_id !== before.category.asset_account_id) reject("The acquisition mapping changed.");
          if (input.action === "activate") {
            const now = (await client.query<{ today: string }>("select current_date::text as today")).rows[0]!.today;
            if (before.in_service_date > now) reject("The asset cannot be activated before its in-service date.");
            await this.assignment(
              client,
              context.tenantId,
              input.company_id,
              before.assignment,
              before.in_service_date,
            );
          }
          await client.query(
            `update fixed_asset_record set status=$4,approved_by=case when $5='approve' then $6 when $5='reject' then null else approved_by end,version=version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
            [context.tenantId, input.company_id, id, target, input.action, context.actor.userId],
          );
          const result = await this.asset(client, context.tenantId, input.company_id, id);
          await this.audit(client, context, input.company_id, id, input.action, input.reason, before, result);
          return result;
        }),
    );
  }
  assetScope(tenant: string, query: AssetQuery) {
    const parameters: unknown[] = [tenant, query.company_id],
      clauses = ["tenant_id=$1", "company_id=$2"];
    const filter = (sql: string, value: unknown) => {
      parameters.push(value);
      clauses.push(sql.replace("?", `$${parameters.length}`));
    };
    if (query.search)
      filter("(code ilike ? or details->>'name' ilike ? or details->>'serial_number' ilike ?)", `%${query.search}%`);
    // The search predicate intentionally reuses one bound value in all fields.
    if (query.search)
      clauses[clauses.length - 1] = clauses[clauses.length - 1]!.replaceAll("?", `$${parameters.length}`);
    for (const key of ["category_id", "status", "supplier_id"] as const) if (query[key]) filter(`${key}=?`, query[key]);
    for (const key of ["department_id", "location_id", "project_id", "custodian_id"] as const)
      if (query[key]) filter(`coalesce(assignment->>'${key}','unassigned')=?`, query[key]);
    if (query.from) filter("acquisition_date>=?", query.from);
    if (query.to) filter("acquisition_date<=?", query.to);
    return { where: clauses.join(" and "), parameters };
  }
  async directory(client: PoolClient, tenant: string, query: AssetQuery) {
    const { where, parameters } = this.assetScope(tenant, query);
    const total = Number(
      (
        await client.query<{ count: string }>(
          `select count(*)::text from fixed_asset_record where ${where}`,
          parameters,
        )
      ).rows[0]!.count,
    );
    const sort = { code: "code", cost: "cost desc,code", acquired: "acquisition_date desc,code" }[query.sort];
    parameters.push(query.limit, query.offset);
    const rows = await client.query(
      `select ${assetProjection} from fixed_asset_record where ${where} order by ${sort} limit $${parameters.length - 1} offset $${parameters.length}`,
      parameters,
    );
    return assetDirectorySchema.parse({
      items: rows.rows,
      total,
      next_offset: query.offset + query.limit < total ? query.offset + query.limit : null,
    });
  }
  async list(context: BankingActorContext, raw: AssetQuery) {
    const query = assetQuerySchema.parse(raw);
    return this.transaction(context, query.company_id, "read", false, (client) =>
      this.directory(client, context.tenantId, query),
    );
  }
  async sources(context: BankingActorContext, raw: AssetQuery) {
    const query = assetQuerySchema.parse(raw);
    return this.transaction(context, query.company_id, "read", false, async (client) => {
      const items = await acquisitionSources(
        client,
        context.tenantId,
        query.company_id,
        query.offset,
        query.limit + 1,
        undefined,
        query.source_id,
      );
      return assetSourcesSchema.parse({
        items: items.slice(0, query.limit),
        next_offset: items.length > query.limit ? query.offset + query.limit : null,
      });
    });
  }
  async options(context: BankingActorContext, company: string) {
    return this.transaction(context, company, "read", false, async (client) => {
      const base = await resolveCompanyBaseCurrency(client, context.tenantId, company, false),
        params = [context.tenantId, company];
      const read = async (sql: string) => (await client.query(sql, params)).rows;
      return assetOptionsSchema.parse({
        preparation_result:
          (
            await client.query(
              "select status,error_code,updated_at::text from fixed_asset_preparation_result where tenant_id=$1 and company_id=$2",
              params,
            )
          ).rows[0] ?? null,
        company_policy: await this.companyPolicy(client, context.tenantId, company),
        base_currency: base.code,
        decimal_places: base.decimalPlaces,
        categories: await this.categories(client, context.tenantId, company),
        accounts: await read(
          "select a.id,a.code,a.name,a.type,coalesce(c.active,false) as fixed_asset,coalesce(c.version,0) as classification_version from account a left join fixed_asset_nominal_classification c on c.tenant_id=a.tenant_id and c.company_id=a.company_id and c.account_id=a.id where a.tenant_id=$1 and a.company_id=$2 and a.status='active' and not a.is_header order by a.code limit 5000",
        ),
        suppliers: await read(
          "select id,code,name from procurement_supplier where tenant_id=$1 and company_id=$2 and status='active' order by code limit 5000",
        ),
        employees: await read(
          "select distinct e.id,e.employee_number as code,concat_ws(' ',e.first_name,e.last_name) as name from employee e join employee_assignment a on a.tenant_id=e.tenant_id and a.employee_id=e.id where e.tenant_id=$1 and a.company_id=$2 and a.effective_from<=current_date and (a.effective_to is null or a.effective_to>=current_date) and e.status in ('active','probation','confirmed') order by code limit 5000",
        ),
        departments: await read(
          "with recursive u as(select id,parent_id,type,code,name,status from organization_unit where tenant_id=$1 and id=$2 union all select c.id,c.parent_id,c.type,c.code,c.name,c.status from organization_unit c join u on c.parent_id=u.id where c.tenant_id=$1) select id,code,name from u where type='department' and status='active' order by code",
        ),
        branches: await read(
          "with recursive u as(select id,parent_id,type,code,name,status from organization_unit where tenant_id=$1 and id=$2 union all select c.id,c.parent_id,c.type,c.code,c.name,c.status from organization_unit c join u on c.parent_id=u.id where c.tenant_id=$1) select id,code,name from u where type='branch' and status='active' order by code",
        ),
        locations: await read(
          "select id,code,name from erp_location where tenant_id=$1 and company_id=$2 and status='active' order by code limit 5000",
        ),
        projects: await read(
          "select id,code,name from erp_project where tenant_id=$1 and company_id=$2 and status='active' order by code limit 5000",
        ),
        periods: await read(
          "select id,period_number::text as code,period_start::text||' – '||period_end::text as name,period_start::text as start,period_end::text as end,status from financial_period where tenant_id=$1 and company_id=$2 order by period_start desc limit 120",
        ),
        credit_notes: await read(
          "select i.id,i.code,p.name||' · '||i.currency||' '||abs(i.original_amount)::text as name from finance_subledger_item i join finance_subledger_party p on p.tenant_id=i.tenant_id and p.company_id=i.company_id and p.id=i.party_id join journal_entry j on j.tenant_id=i.tenant_id and j.company_id=i.company_id and j.id=i.journal_id where i.tenant_id=$1 and i.company_id=$2 and i.kind='credit_note' and i.side='payable' and j.status='posted' and not exists(select 1 from finance_subledger_operation reversed where reversed.tenant_id=i.tenant_id and reversed.company_id=i.company_id and reversed.type='reversal' and reversed.state='posted' and reversed.payload->>'operation_id'=i.operation_id) order by i.document_date desc,i.id limit 5000",
        ),
        refund_receipts: await read(
          "select l.id,j.entry_number||' / '||l.line_number::text as code,a.name||' · '||l.base_credit::text as name from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id join account a on a.tenant_id=l.tenant_id and a.company_id=j.company_id and a.id=l.account_id where l.tenant_id=$1 and j.company_id=$2 and j.status='posted' and l.base_credit>0 and (exists(select 1 from bank_receipt r where r.tenant_id=j.tenant_id and r.company_id=j.company_id and r.original_journal_entry_id=j.id and r.state='posted') or exists(select 1 from finance_subledger_operation o where o.tenant_id=j.tenant_id and o.company_id=j.company_id and o.journal_id=j.id and o.type='settlement' and o.payload->>'side'='payable' and not exists(select 1 from finance_subledger_operation reversed where reversed.tenant_id=o.tenant_id and reversed.company_id=o.company_id and reversed.type='reversal' and reversed.state='posted' and reversed.payload->>'operation_id'=o.id))) order by j.posting_date desc,j.id,l.line_number limit 5000",
        ),
      });
    });
  }
}
