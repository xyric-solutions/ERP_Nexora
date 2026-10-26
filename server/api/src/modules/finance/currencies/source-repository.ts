import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  currencyCatalogDirectorySchema,
  countryCurrencyDirectorySchema,
  companyCurrencyProfileSchema,
  companyCurrencyDirectorySchema,
  companyCurrencyRateDirectorySchema,
  companyCurrencyRateSchema,
  companyCurrencyMutationSchema,
  tenantCurrencyDirectorySchema,
  currencyRateDirectorySchema,
  currencyRateSchema,
  transferFxPolicySchema,
  financeConfigurationMutationSchema,
  type AdoptCurrencyRequest,
  type ChangeCurrencyRateStatusRequest,
  type ChangeCurrencyStatusRequest,
  type CorrectCurrencyRateRequest,
  type CreateCurrencyRateRequest,
  type CurrencyCatalogDirectory,
  type CurrencyCatalogQuery,
  type CountryCurrencyDirectory,
  type CountryCurrencyDirectoryQuery,
  type CompanyCurrencyProfile,
  type ConfigureCompanyCurrencyProfileRequest,
  type CompanyCurrencyDirectory,
  type CompanyCurrencyDirectoryQuery,
  type ActivateCompanyCurrencyRequest,
  type ChangeCompanyCurrencyStatusRequest,
  type CompanyCurrencyRate,
  type CompanyCurrencyRateDirectory,
  type CompanyCurrencyRateDirectoryQuery,
  type CreateCompanyCurrencyRateRequest,
  type CorrectCompanyCurrencyRateRequest,
  type ChangeCompanyCurrencyRateStatusRequest,
  type CompanyCurrencyMutation,
  type CurrencyRate,
  type CurrencyRateDirectory,
  type CurrencyRateQuery,
  type FinanceConfigurationMutation,
  type TenantCurrencyDirectory,
  type TenantCurrencyQuery,
  type TransferFxPolicy,
  type UpsertTransferFxPolicyRequest,
} from "@nexora/contracts";
import type { BankingActorContext } from "../../banking/source-repository.js";
import { financeRateAuthorityLockResource } from "../posting/source-repository.js";

export class FinanceCurrencyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

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
const digest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
const timestamp = (value: string | Date) => new Date(value).toISOString();
const offset = (cursor?: string) => {
  if (!cursor) return 0;
  try {
    const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
};
const cursor = (value: number) => Buffer.from(String(value), "utf8").toString("base64url");

interface CurrencyRow extends Record<string, unknown> {
  row_version: number | string;
  status: string;
}

interface CurrencyRateRow extends Record<string, unknown> {
  id: string;
  source_currency: string;
  target_currency: string;
  effective_date: string | Date;
  status: string;
  row_version?: number | string;
  version?: number | string;
  created_by?: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface TransferFxPolicyRow extends Record<string, unknown> {
  id: string;
  company_id: string;
  fx_gain_nominal_id: string;
  fx_loss_nominal_id: string;
  rounding_nominal_id: string;
  bank_charge_nominal_id: string;
  rounding_tolerance: string;
  row_version: number | string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface CompanyCurrencyRateRow extends CurrencyRateRow {
  company_id: string;
}

export interface ResolvedCompanyCurrencyRate {
  id: string;
  companyId: string;
  sourceCurrency: string;
  targetCurrency: string;
  rate: string;
  effectiveDate: string;
  version: number;
  authority: "company" | "legacy_pre_cutover";
}

export interface ResolveCompanyCurrencyRateOptions {
  /**
   * Legacy rates are never selected by date. A caller reviewing pre-cutover
   * evidence must supply the exact immutable legacy rate identifier already
   * stored on that evidence.
   */
  legacyEvidenceRateId?: string;
}

export class SourceFinanceCurrencyRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(
    context: BankingActorContext,
    work: (client: PoolClient) => Promise<T>,
    mutation = false,
  ): Promise<T> {
    if (
      context.tenantId !== context.actor.tenantId ||
      (mutation && (context.realActorId || context.impersonationRequestId))
    )
      throw new FinanceCurrencyError(
        403,
        "CURRENCY_AUTHORITY_DENIED",
        "Currency configuration requires the authenticated tenant and cannot be changed while impersonating.",
      );
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select set_config('nexora.user_id',$1,true)", [context.actor.userId]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error instanceof FinanceCurrencyError) throw error;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23503", "23505", "23514", "40001", "40P01"].includes(String(error.code))
      )
        throw new FinanceCurrencyError(
          409,
          "CURRENCY_CONFIGURATION_CONFLICT",
          "Currency configuration, dependencies or concurrent authority changed. Refresh and retry.",
          { cause: error },
        );
      throw error;
    } finally {
      client.release();
    }
  }

  private requireClaim(context: BankingActorContext, permission: string) {
    if (!context.actor.permissions.includes(permission))
      throw new FinanceCurrencyError(403, "PERMISSION_DENIED", "Explicit Currency Master authority is required.");
  }

  private async requireTenantPermission(client: PoolClient, context: BankingActorContext, permission: string) {
    this.requireClaim(context, permission);
    const result = await client.query(
      `select 1 from security_user_role_assignment_version assignment
       join security_role_policy policy on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id and policy.status='active' and policy.lifecycle_state='active'
       join security_tenant_role role on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id and role.lifecycle_state='active'
       join security_role_permission_grant grant_row on grant_row.tenant_id=policy.tenant_id and grant_row.role_policy_id=policy.id and grant_row.permission_key=$3
       join security_permission_definition definition on definition.permission_key=grant_row.permission_key and definition.status='active'
       join security_role_scope_grant scope on scope.tenant_id=grant_row.tenant_id and scope.role_policy_id=grant_row.role_policy_id and scope.permission_key=grant_row.permission_key
       where assignment.tenant_id=$1 and assignment.user_id=$2 and assignment.lifecycle_state='active'
        and assignment.valid_from<=now() and (assignment.valid_until is null or assignment.valid_until>now())
        and assignment.version=(select max(v.version) from security_user_role_assignment_version v where v.tenant_id=assignment.tenant_id and v.assignment_id=assignment.assignment_id)
        and scope.scope_kind='tenant' and scope.scope_value=$1 limit 1`,
      [context.tenantId, context.actor.userId, permission],
    );
    if (!result.rowCount)
      throw new FinanceCurrencyError(
        403,
        "CURRENCY_AUTHORITY_DENIED",
        "A live tenant-scoped Currency Master grant is required.",
      );
  }

  private async requireCompanyPermission(
    client: PoolClient,
    context: BankingActorContext,
    companyId: string,
    permission: string,
  ) {
    this.requireClaim(context, permission);
    const allowed = await client.query<{ allowed: boolean }>(
      "select bank_has_live_permission($1,$2,$3,$4) as allowed",
      [context.tenantId, companyId, context.actor.userId, permission],
    );
    if (!allowed.rows[0]?.allowed)
      throw new FinanceCurrencyError(
        403,
        "COMPANY_ACCESS_DENIED",
        "The company is outside your live permission scope.",
      );
  }

  private async idempotent<T>(
    client: PoolClient,
    context: BankingActorContext,
    path: string,
    input: unknown,
    key: string,
    parse: (value: unknown) => T,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      throw new FinanceCurrencyError(400, "INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:currency:${context.tenantId}:${context.actor.userId}:${path}:${key}`,
    ]);
    const requestHash = digest(input);
    const prior = (
      await client.query<{ request_fingerprint: string; response_body: unknown }>(
        "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",
        [context.tenantId, context.actor.userId, path, key],
      )
    ).rows[0];
    if (prior) {
      if (prior.request_fingerprint !== requestHash)
        throw new FinanceCurrencyError(409, "IDEMPOTENCY_CONFLICT", "This key was used for another request.");
      return parse(prior.response_body);
    }
    const result = await work();
    await client.query(
      "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)",
      [context.tenantId, context.actor.userId, path, key, requestHash, JSON.stringify(result), `"${digest(result)}"`],
    );
    return result;
  }

  private async audit(
    client: PoolClient,
    context: BankingActorContext,
    input: {
      action: string;
      entityType: string;
      entityId: string;
      before: unknown;
      after: unknown;
      source: string;
      correlation: string;
    },
  ) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const previous = (
      await client.query<{ sequence: string; event_hash: string }>(
        "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
        [context.tenantId],
      )
    ).rows[0];
    const occurred = new Date().toISOString();
    const event = {
      id: `currency-event-${randomUUID()}`,
      tenant_id: context.tenantId,
      sequence: Number(previous?.sequence ?? 0) + 1,
      actor_id: context.actor.userId,
      correlation_id: input.correlation,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      before_hash: digest(input.before),
      after_hash: digest(input.after),
      source_reference: input.source,
      occurred_at: occurred,
      previous_event_hash: previous?.event_hash ?? digest({ genesis: context.tenantId }),
    };
    await client.query(
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
        digest(event),
      ],
    );
    return { id: event.id, occurred };
  }

  private async companyEvent(
    client: PoolClient,
    context: BankingActorContext,
    input: {
      companyId: string;
      entityType: "profile" | "currency" | "rate";
      entityId: string;
      action:
        | "profile_created"
        | "currency_activated"
        | "currency_inactivated"
        | "rate_created"
        | "rate_corrected"
        | "rate_activated"
        | "rate_inactivated";
      recordVersion: number;
      reason?: string;
      correlation: string;
      occurredAt: string;
    },
  ) {
    const id = `company-currency-event-${randomUUID()}`;
    await client.query(
      `insert into company_currency_event
       (tenant_id,company_id,id,entity_type,entity_id,action,record_version,actor_id,reason,correlation_id,occurred_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        context.tenantId,
        input.companyId,
        id,
        input.entityType,
        input.entityId,
        input.action,
        input.recordVersion,
        context.actor.userId,
        input.reason ?? null,
        input.correlation,
        input.occurredAt,
      ],
    );
    return id;
  }

  private companyRate(row: CompanyCurrencyRateRow): CompanyCurrencyRate {
    return companyCurrencyRateSchema.parse({
      ...row,
      version: Number(row.version ?? row.row_version),
      created_by: row.created_by,
      created_at: timestamp(row.created_at),
      updated_at: timestamp(row.updated_at),
    });
  }

  async listCountryCurrencies(
    context: BankingActorContext,
    query: CountryCurrencyDirectoryQuery,
  ): Promise<CountryCurrencyDirectory> {
    this.requireClaim(context, "finance.company_currency.read");
    return this.transaction(context, async (client) => {
      const values: unknown[] = [];
      const filters = ["status='active'"];
      if (query.search) {
        values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(country_code ilike $${values.length} escape '\\' or country_name ilike $${values.length} escape '\\' or currency_code ilike $${values.length} escape '\\' or currency_name ilike $${values.length} escape '\\')`,
        );
      }
      if (query.country_code) {
        values.push(query.country_code);
        filters.push(`country_code=$${values.length}`);
      }
      if (query.currency_code) {
        values.push(query.currency_code);
        filters.push(`currency_code=$${values.length}`);
      }
      const start = offset(query.cursor);
      values.push(query.limit + 1, start);
      const result = await client.query(
        `select country_code,country_name,currency_code,currency_name,currency_symbol,
                decimal_places::integer,is_primary,status
           from country_currency_catalog
          where ${filters.join(" and ")}
          order by country_name,country_code,is_primary desc,currency_code
          limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      const more = result.rows.length > query.limit;
      return countryCurrencyDirectorySchema.parse({
        items: result.rows.slice(0, query.limit),
        next_cursor: more ? cursor(start + query.limit) : null,
      });
    });
  }

  async getCompanyCurrencyProfile(context: BankingActorContext, companyId: string): Promise<CompanyCurrencyProfile> {
    return this.transaction(context, async (client) => {
      await this.requireCompanyPermission(client, context, companyId, "finance.company_currency_profile.read");
      const row = (
        await client.query(
          `select profile.id,profile.company_id,profile.base_currency,
                  tenant_currency.name as base_currency_name,
                  profile.base_country_code,catalog.country_name as base_country_name,
                  profile.status,
                  (profile.locked_at is not null or exists(
                    select 1 from journal_entry journal
                     where journal.tenant_id=profile.tenant_id
                       and journal.company_id=profile.company_id
                       and journal.status in ('posted','reversed')
                  )) as locked,
                  profile.locked_at,profile.row_version::integer as version,
                  profile.created_at,profile.updated_at
             from company_currency_profile profile
             join currency tenant_currency
               on tenant_currency.tenant_id=profile.tenant_id
              and tenant_currency.code=profile.base_currency
             left join country_currency_catalog catalog
               on catalog.country_code=profile.base_country_code
              and catalog.currency_code=profile.base_currency
            where profile.tenant_id=$1 and profile.company_id=$2`,
          [context.tenantId, companyId],
        )
      ).rows[0];
      if (!row)
        throw new FinanceCurrencyError(
          404,
          "COMPANY_CURRENCY_PROFILE_NOT_FOUND",
          "Configure the company base currency before using Finance or Banking.",
        );
      return companyCurrencyProfileSchema.parse({
        ...row,
        locked_at: row.locked_at ? timestamp(row.locked_at) : null,
        created_at: timestamp(row.created_at),
        updated_at: timestamp(row.updated_at),
      });
    });
  }

  async configureCompanyCurrencyProfile(
    context: BankingActorContext,
    input: ConfigureCompanyCurrencyProfileRequest,
    key: string,
    correlation: string,
  ): Promise<CompanyCurrencyMutation> {
    return this.transaction(
      context,
      async (client) => {
        await this.requireCompanyPermission(
          client,
          context,
          input.company_id,
          "finance.company_currency_profile.manage",
        );
        return this.idempotent(
          client,
          context,
          `/api/v1/finance/companies/${input.company_id}/currency-profile`,
          input,
          key,
          (value) => companyCurrencyMutationSchema.parse(value),
          async () => {
            const company = (
              await client.query(
                "select id from organization_unit where tenant_id=$1 and id=$2 and type='company' and status='active'",
                [context.tenantId, input.company_id],
              )
            ).rows[0];
            if (!company) throw new FinanceCurrencyError(404, "COMPANY_NOT_FOUND", "The active company was not found.");
            const mapping = (
              await client.query<{
                currency_name: string;
                decimal_places: number;
              }>(
                `select standard.name as currency_name,standard.decimal_places::integer
                   from country_currency_catalog mapping
                   join currency_catalog standard
                     on standard.code=mapping.currency_code and standard.status='active'
                  where mapping.country_code=$1 and mapping.currency_code=$2 and mapping.status='active'`,
                [input.base_country_code, input.base_currency],
              )
            ).rows[0];
            if (!mapping)
              throw new FinanceCurrencyError(
                400,
                "COUNTRY_CURRENCY_MAPPING_INVALID",
                "The selected country and base currency are not an active supported mapping.",
              );
            if (
              (
                await client.query("select 1 from company_currency_profile where tenant_id=$1 and company_id=$2", [
                  context.tenantId,
                  input.company_id,
                ])
              ).rowCount
            )
              throw new FinanceCurrencyError(
                409,
                "COMPANY_CURRENCY_PROFILE_EXISTS",
                "The company base currency is already configured.",
              );
            await client.query(
              `insert into currency
               (tenant_id,code,name,decimal_places,is_base,status,catalog_code,row_version,adopted_by,adopted_at)
               values($1,$2,$3,$4,
                 not exists(select 1 from currency where tenant_id=$1 and is_base and status='active'),
                 'active',$2,1,$5,clock_timestamp())
               on conflict(tenant_id,code) do nothing`,
              [
                context.tenantId,
                input.base_currency,
                mapping.currency_name,
                mapping.decimal_places,
                context.actor.userId,
              ],
            );
            const profileId = `company-currency-profile-${randomUUID()}`;
            const companyCurrencyId = `company-currency-${randomUUID()}`;
            await client.query(
              `insert into company_currency_profile
               (tenant_id,company_id,id,base_currency,base_country_code,status,row_version,created_by,updated_by)
               values($1,$2,$3,$4,$5,'active',1,$6,$6)`,
              [
                context.tenantId,
                input.company_id,
                profileId,
                input.base_currency,
                input.base_country_code,
                context.actor.userId,
              ],
            );
            await client.query(
              `insert into company_currency
               (tenant_id,company_id,id,currency_code,selected_country_code,is_base,status,row_version,created_by,updated_by)
               values($1,$2,$3,$4,$5,true,'active',1,$6,$6)`,
              [
                context.tenantId,
                input.company_id,
                companyCurrencyId,
                input.base_currency,
                input.base_country_code,
                context.actor.userId,
              ],
            );
            const audit = await this.audit(client, context, {
              action: "finance.company_currency_profile.created",
              entityType: "company_currency_profile",
              entityId: profileId,
              before: null,
              after: {
                company_id: input.company_id,
                base_currency: input.base_currency,
                base_country_code: input.base_country_code,
              },
              source: `company:${input.company_id}`,
              correlation,
            });
            await this.companyEvent(client, context, {
              companyId: input.company_id,
              entityType: "profile",
              entityId: profileId,
              action: "profile_created",
              recordVersion: 1,
              correlation,
              occurredAt: audit.occurred,
            });
            return companyCurrencyMutationSchema.parse({
              id: profileId,
              version: 1,
              audit_event_id: audit.id,
              replayed: false,
            });
          },
        );
      },
      true,
    );
  }

  async listCompanyCurrencies(
    context: BankingActorContext,
    query: CompanyCurrencyDirectoryQuery,
  ): Promise<CompanyCurrencyDirectory> {
    return this.transaction(context, async (client) => {
      await this.requireCompanyPermission(client, context, query.company_id, "finance.company_currency.read");
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["company_currency.tenant_id=$1", "company_currency.company_id=$2"];
      if (query.search) {
        values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(company_currency.currency_code ilike $${values.length} escape '\\' or mapping.currency_name ilike $${values.length} escape '\\' or mapping.country_name ilike $${values.length} escape '\\')`,
        );
      }
      if (query.status) {
        values.push(query.status);
        filters.push(`company_currency.status=$${values.length}`);
      }
      const start = offset(query.cursor);
      values.push(query.limit + 1, start);
      const result = await client.query(
        `select company_currency.id,company_currency.company_id,company_currency.currency_code,
                mapping.currency_name,company_currency.selected_country_code,
                mapping.country_name as selected_country_name,mapping.decimal_places::integer,
                company_currency.is_base,company_currency.status,
                latest.rate::text as latest_rate,latest.effective_date::text as latest_rate_effective_date,
                company_currency.row_version::integer as version,
                company_currency.created_at,company_currency.updated_at
           from company_currency
           join country_currency_catalog mapping
             on mapping.country_code=company_currency.selected_country_code
            and mapping.currency_code=company_currency.currency_code
           left join lateral (
             select rate,effective_date
               from currency_rate
              where tenant_id=company_currency.tenant_id
                and company_id=company_currency.company_id
                and source_currency=company_currency.currency_code
                and status='active'
              order by effective_date desc,id desc limit 1
           ) latest on true
          where ${filters.join(" and ")}
          order by company_currency.is_base desc,company_currency.currency_code,company_currency.id
          limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      const more = result.rows.length > query.limit;
      return companyCurrencyDirectorySchema.parse({
        items: result.rows.slice(0, query.limit).map((row) => ({
          ...row,
          latest_rate: row.latest_rate ?? null,
          latest_rate_effective_date: row.latest_rate_effective_date ?? null,
          created_at: timestamp(row.created_at),
          updated_at: timestamp(row.updated_at),
        })),
        next_cursor: more ? cursor(start + query.limit) : null,
      });
    });
  }

  async activateCompanyCurrency(
    context: BankingActorContext,
    input: ActivateCompanyCurrencyRequest,
    key: string,
    correlation: string,
  ): Promise<CompanyCurrencyMutation> {
    return this.transaction(
      context,
      async (client) => {
        await this.requireCompanyPermission(client, context, input.company_id, "finance.company_currency.manage");
        return this.idempotent(
          client,
          context,
          `/api/v1/finance/company-currencies:${input.company_id}`,
          input,
          key,
          (value) => companyCurrencyMutationSchema.parse(value),
          async () => {
            const profile = (
              await client.query<{ base_currency: string }>(
                "select base_currency from company_currency_profile where tenant_id=$1 and company_id=$2 and status='active' for share",
                [context.tenantId, input.company_id],
              )
            ).rows[0];
            if (!profile)
              throw new FinanceCurrencyError(
                409,
                "COMPANY_CURRENCY_PROFILE_REQUIRED",
                "Configure the company base currency before activating a foreign currency.",
              );
            if (profile.base_currency === input.currency_code)
              throw new FinanceCurrencyError(
                400,
                "BASE_CURRENCY_DUPLICATION",
                "The base currency is already active and cannot be added as a foreign currency.",
              );
            const mapping = (
              await client.query<{ currency_name: string; decimal_places: number }>(
                `select standard.name as currency_name,standard.decimal_places::integer
                   from country_currency_catalog mapping
                   join currency_catalog standard
                     on standard.code=mapping.currency_code and standard.status='active'
                  where mapping.country_code=$1 and mapping.currency_code=$2 and mapping.status='active'`,
                [input.country_code, input.currency_code],
              )
            ).rows[0];
            if (!mapping)
              throw new FinanceCurrencyError(
                400,
                "COUNTRY_CURRENCY_MAPPING_INVALID",
                "The selected country and currency are not an active supported mapping.",
              );
            if (
              (
                await client.query(
                  "select 1 from company_currency where tenant_id=$1 and company_id=$2 and currency_code=$3",
                  [context.tenantId, input.company_id, input.currency_code],
                )
              ).rowCount
            )
              throw new FinanceCurrencyError(
                409,
                "COMPANY_CURRENCY_EXISTS",
                "This currency is already configured for the company.",
              );
            await client.query(
              `insert into currency
               (tenant_id,code,name,decimal_places,is_base,status,catalog_code,row_version,adopted_by,adopted_at)
               values($1,$2,$3,$4,false,'active',$2,1,$5,clock_timestamp())
               on conflict(tenant_id,code) do nothing`,
              [
                context.tenantId,
                input.currency_code,
                mapping.currency_name,
                mapping.decimal_places,
                context.actor.userId,
              ],
            );
            await client.query("select pg_advisory_xact_lock(finance_currency_rate_lock_key($1,$2,$3))", [
              context.tenantId,
              input.currency_code,
              profile.base_currency,
            ]);
            const companyCurrencyId = `company-currency-${randomUUID()}`;
            const rateId = `company-currency-rate-${randomUUID()}`;
            await client.query(
              `insert into company_currency
               (tenant_id,company_id,id,currency_code,selected_country_code,is_base,status,row_version,created_by,updated_by)
               values($1,$2,$3,$4,$5,false,'active',1,$6,$6)`,
              [
                context.tenantId,
                input.company_id,
                companyCurrencyId,
                input.currency_code,
                input.country_code,
                context.actor.userId,
              ],
            );
            await client.query(
              `insert into currency_rate
               (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,created_by,updated_at)
               values($1,$2,$3,$4,$5,$6,$7,'active',1,$8,clock_timestamp())`,
              [
                rateId,
                context.tenantId,
                input.company_id,
                input.currency_code,
                profile.base_currency,
                input.rate,
                input.effective_date,
                context.actor.userId,
              ],
            );
            const audit = await this.audit(client, context, {
              action: "finance.company_currency.activated",
              entityType: "company_currency",
              entityId: companyCurrencyId,
              before: null,
              after: {
                company_id: input.company_id,
                currency_code: input.currency_code,
                country_code: input.country_code,
                initial_rate_id: rateId,
                effective_date: input.effective_date,
              },
              source: `company:${input.company_id}`,
              correlation,
            });
            await this.companyEvent(client, context, {
              companyId: input.company_id,
              entityType: "currency",
              entityId: companyCurrencyId,
              action: "currency_activated",
              recordVersion: 1,
              correlation,
              occurredAt: audit.occurred,
            });
            await this.companyEvent(client, context, {
              companyId: input.company_id,
              entityType: "rate",
              entityId: rateId,
              action: "rate_created",
              recordVersion: 1,
              correlation,
              occurredAt: audit.occurred,
            });
            return companyCurrencyMutationSchema.parse({
              id: companyCurrencyId,
              version: 1,
              audit_event_id: audit.id,
              replayed: false,
            });
          },
        );
      },
      true,
    );
  }

  async changeCompanyCurrencyStatus(
    context: BankingActorContext,
    companyId: string,
    currencyCode: string,
    input: ChangeCompanyCurrencyStatusRequest,
    key: string,
    correlation: string,
  ): Promise<CompanyCurrencyMutation> {
    return this.transaction(
      context,
      async (client) => {
        await this.requireCompanyPermission(client, context, companyId, "finance.company_currency.manage");
        return this.idempotent(
          client,
          context,
          `/api/v1/finance/company-currencies/${currencyCode}/status:${companyId}`,
          input,
          key,
          (value) => companyCurrencyMutationSchema.parse(value),
          async () => {
            const current = (
              await client.query<{
                id: string;
                is_base: boolean;
                status: string;
                row_version: number | string;
              }>(
                `select id,is_base,status,row_version
                   from company_currency
                  where tenant_id=$1 and company_id=$2 and currency_code=$3 for update`,
                [context.tenantId, companyId, currencyCode],
              )
            ).rows[0];
            if (!current)
              throw new FinanceCurrencyError(404, "COMPANY_CURRENCY_NOT_FOUND", "The company currency was not found.");
            if (Number(current.row_version) !== input.expected_version)
              throw new FinanceCurrencyError(
                409,
                "COMPANY_CURRENCY_VERSION_CONFLICT",
                "The company currency changed. Reload and retry.",
              );
            if (current.status === input.status)
              throw new FinanceCurrencyError(
                409,
                "COMPANY_CURRENCY_STATUS_UNCHANGED",
                "Select a different company-currency status.",
              );
            if (current.is_base && input.status === "inactive")
              throw new FinanceCurrencyError(
                409,
                "BASE_CURRENCY_REQUIRED",
                "The company base currency cannot be inactivated.",
              );
            if (input.status === "inactive") {
              const dependency = await client.query(
                `select 1 where exists(
                   select 1 from bank_account
                    where tenant_id=$1 and company_id=$2 and currency=$3 and status='active'
                 ) or exists(
                   select 1 from currency_rate
                    where tenant_id=$1 and company_id=$2 and source_currency=$3 and status='active'
                 )`,
                [context.tenantId, companyId, currencyCode],
              );
              if (dependency.rowCount)
                throw new FinanceCurrencyError(
                  409,
                  "COMPANY_CURRENCY_IN_USE",
                  "Inactivate dependent bank accounts and current rates before inactivating this currency.",
                );
            }
            await client.query(
              `update company_currency
                  set status=$4,row_version=row_version+1,updated_by=$5,updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and currency_code=$3`,
              [context.tenantId, companyId, currencyCode, input.status, context.actor.userId],
            );
            const version = input.expected_version + 1;
            const audit = await this.audit(client, context, {
              action: `finance.company_currency.${input.status === "active" ? "activated" : "inactivated"}`,
              entityType: "company_currency",
              entityId: current.id,
              before: { status: current.status, version: input.expected_version },
              after: { status: input.status, version },
              source: `company:${companyId}`,
              correlation,
            });
            await this.companyEvent(client, context, {
              companyId,
              entityType: "currency",
              entityId: current.id,
              action: input.status === "active" ? "currency_activated" : "currency_inactivated",
              recordVersion: version,
              reason: input.reason,
              correlation,
              occurredAt: audit.occurred,
            });
            return companyCurrencyMutationSchema.parse({
              id: current.id,
              version,
              audit_event_id: audit.id,
              replayed: false,
            });
          },
        );
      },
      true,
    );
  }

  async listCompanyCurrencyRates(
    context: BankingActorContext,
    query: CompanyCurrencyRateDirectoryQuery,
  ): Promise<CompanyCurrencyRateDirectory> {
    return this.transaction(context, async (client) => {
      await this.requireCompanyPermission(client, context, query.company_id, "finance.company_currency_rate.read");
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["tenant_id=$1", "company_id=$2"];
      if (query.source_currency) {
        values.push(query.source_currency);
        filters.push(`source_currency=$${values.length}`);
      }
      if (query.effective_on_or_before) {
        values.push(query.effective_on_or_before);
        filters.push(`effective_date<=$${values.length}::date`);
      }
      if (query.status) {
        values.push(query.status);
        filters.push(`status=$${values.length}`);
      }
      const start = offset(query.cursor);
      values.push(query.limit + 1, start);
      const result = await client.query<CompanyCurrencyRateRow>(
        `select id,company_id,source_currency,target_currency,rate::text,effective_date::text,status,
                row_version::integer as version,supersedes_rate_id,created_by,created_at,updated_at
           from currency_rate where ${filters.join(" and ")}
          order by effective_date desc,id desc
          limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      const more = result.rows.length > query.limit;
      return companyCurrencyRateDirectorySchema.parse({
        items: result.rows.slice(0, query.limit).map((row) => this.companyRate(row)),
        next_cursor: more ? cursor(start + query.limit) : null,
      });
    });
  }

  async createCompanyCurrencyRate(
    context: BankingActorContext,
    input: CreateCompanyCurrencyRateRequest,
    key: string,
    correlation: string,
  ): Promise<CompanyCurrencyRate> {
    return this.transaction(
      context,
      async (client) => {
        await this.requireCompanyPermission(client, context, input.company_id, "finance.company_currency_rate.manage");
        return this.idempotent(
          client,
          context,
          `/api/v1/finance/company-currency-rates:${input.company_id}`,
          input,
          key,
          (value) => companyCurrencyRateSchema.parse(value),
          async () => {
            const profile = (
              await client.query<{ base_currency: string }>(
                "select base_currency from company_currency_profile where tenant_id=$1 and company_id=$2 and status='active'",
                [context.tenantId, input.company_id],
              )
            ).rows[0];
            if (!profile)
              throw new FinanceCurrencyError(
                409,
                "COMPANY_CURRENCY_PROFILE_REQUIRED",
                "Configure the company base currency before creating a rate.",
              );
            if (profile.base_currency === input.source_currency)
              throw new FinanceCurrencyError(400, "RATE_PAIR_INVALID", "A base-to-base rate is not allowed.");
            const companyCurrency = (
              await client.query<{ status: string }>(
                `select status from company_currency
                  where tenant_id=$1 and company_id=$2 and currency_code=$3 and not is_base`,
                [context.tenantId, input.company_id, input.source_currency],
              )
            ).rows[0];
            if (!companyCurrency || companyCurrency.status !== "active")
              throw new FinanceCurrencyError(
                409,
                "COMPANY_CURRENCY_INACTIVE",
                "The source currency must be active for this company.",
              );
            await client.query("select pg_advisory_xact_lock(finance_currency_rate_lock_key($1,$2,$3))", [
              context.tenantId,
              input.source_currency,
              profile.base_currency,
            ]);
            const id = `company-currency-rate-${randomUUID()}`;
            await client.query(
              `insert into currency_rate
               (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,created_by,updated_at)
               values($1,$2,$3,$4,$5,$6,$7,'active',1,$8,clock_timestamp())`,
              [
                id,
                context.tenantId,
                input.company_id,
                input.source_currency,
                profile.base_currency,
                input.rate,
                input.effective_date,
                context.actor.userId,
              ],
            );
            const row = (
              await client.query<CompanyCurrencyRateRow>(
                `select id,company_id,source_currency,target_currency,rate::text,effective_date::text,status,
                        row_version::integer as version,supersedes_rate_id,created_by,created_at,updated_at
                   from currency_rate where tenant_id=$1 and company_id=$2 and id=$3`,
                [context.tenantId, input.company_id, id],
              )
            ).rows[0]!;
            const rate = this.companyRate(row);
            const audit = await this.audit(client, context, {
              action: "finance.company_currency_rate.created",
              entityType: "company_currency_rate",
              entityId: id,
              before: null,
              after: rate,
              source: `company:${input.company_id}`,
              correlation,
            });
            await this.companyEvent(client, context, {
              companyId: input.company_id,
              entityType: "rate",
              entityId: id,
              action: "rate_created",
              recordVersion: 1,
              correlation,
              occurredAt: audit.occurred,
            });
            return rate;
          },
        );
      },
      true,
    );
  }

  async correctCompanyCurrencyRate(
    context: BankingActorContext,
    id: string,
    input: CorrectCompanyCurrencyRateRequest,
    key: string,
    correlation: string,
  ): Promise<CompanyCurrencyRate> {
    this.requireClaim(context, "finance.company_currency_rate.manage");
    return this.transaction(
      context,
      async (client) => {
        const current = (
          await client.query<CompanyCurrencyRateRow>(
            "select * from currency_rate where tenant_id=$1 and id=$2 and company_id is not null for update",
            [context.tenantId, id],
          )
        ).rows[0];
        if (!current)
          throw new FinanceCurrencyError(404, "COMPANY_CURRENCY_RATE_NOT_FOUND", "The company rate was not found.");
        await this.requireCompanyPermission(
          client,
          context,
          current.company_id,
          "finance.company_currency_rate.manage",
        );
        return this.idempotent(
          client,
          context,
          `/api/v1/finance/company-currency-rates/${id}/corrections`,
          input,
          key,
          (value) => companyCurrencyRateSchema.parse(value),
          async () => {
            if (Number(current.row_version) !== input.expected_version || current.status !== "active")
              throw new FinanceCurrencyError(
                409,
                "COMPANY_CURRENCY_RATE_VERSION_CONFLICT",
                "The active company rate changed. Reload and retry.",
              );
            await client.query("select pg_advisory_xact_lock(finance_currency_rate_lock_key($1,$2,$3))", [
              context.tenantId,
              current.source_currency,
              current.target_currency,
            ]);
            await client.query(
              `update currency_rate
                  set status='superseded',row_version=row_version+1,updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and id=$3`,
              [context.tenantId, current.company_id, id],
            );
            const replacement = `company-currency-rate-${randomUUID()}`;
            await client.query(
              `insert into currency_rate
               (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,
                supersedes_rate_id,created_by,reason,updated_at)
               values($1,$2,$3,$4,$5,$6,$7,'active',1,$8,$9,$10,clock_timestamp())`,
              [
                replacement,
                context.tenantId,
                current.company_id,
                current.source_currency,
                current.target_currency,
                input.rate,
                current.effective_date,
                id,
                context.actor.userId,
                input.reason,
              ],
            );
            const row = (
              await client.query<CompanyCurrencyRateRow>(
                `select id,company_id,source_currency,target_currency,rate::text,effective_date::text,status,
                        row_version::integer as version,supersedes_rate_id,created_by,created_at,updated_at
                   from currency_rate where tenant_id=$1 and company_id=$2 and id=$3`,
                [context.tenantId, current.company_id, replacement],
              )
            ).rows[0]!;
            const rate = this.companyRate(row);
            const audit = await this.audit(client, context, {
              action: "finance.company_currency_rate.corrected",
              entityType: "company_currency_rate",
              entityId: replacement,
              before: { id, version: input.expected_version },
              after: rate,
              source: `supersedes:${id}`,
              correlation,
            });
            await this.companyEvent(client, context, {
              companyId: current.company_id,
              entityType: "rate",
              entityId: replacement,
              action: "rate_corrected",
              recordVersion: 1,
              reason: input.reason,
              correlation,
              occurredAt: audit.occurred,
            });
            return rate;
          },
        );
      },
      true,
    );
  }

  async changeCompanyCurrencyRateStatus(
    context: BankingActorContext,
    id: string,
    input: ChangeCompanyCurrencyRateStatusRequest,
    key: string,
    correlation: string,
  ): Promise<CompanyCurrencyRate> {
    this.requireClaim(context, "finance.company_currency_rate.manage");
    return this.transaction(
      context,
      async (client) => {
        const current = (
          await client.query<CompanyCurrencyRateRow>(
            "select * from currency_rate where tenant_id=$1 and id=$2 and company_id is not null for update",
            [context.tenantId, id],
          )
        ).rows[0];
        if (!current)
          throw new FinanceCurrencyError(404, "COMPANY_CURRENCY_RATE_NOT_FOUND", "The company rate was not found.");
        await this.requireCompanyPermission(
          client,
          context,
          current.company_id,
          "finance.company_currency_rate.manage",
        );
        return this.idempotent(
          client,
          context,
          `/api/v1/finance/company-currency-rates/${id}/status`,
          input,
          key,
          (value) => companyCurrencyRateSchema.parse(value),
          async () => {
            if (Number(current.row_version) !== input.expected_version || current.status === "superseded")
              throw new FinanceCurrencyError(
                409,
                "COMPANY_CURRENCY_RATE_VERSION_CONFLICT",
                "The current company rate changed. Reload and retry.",
              );
            if (current.status === input.status)
              throw new FinanceCurrencyError(
                409,
                "COMPANY_CURRENCY_RATE_STATUS_UNCHANGED",
                "Select a different company-rate status.",
              );
            await client.query("select pg_advisory_xact_lock(finance_currency_rate_lock_key($1,$2,$3))", [
              context.tenantId,
              current.source_currency,
              current.target_currency,
            ]);
            await client.query(
              `update currency_rate
                  set status=$4,row_version=row_version+1,updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and id=$3`,
              [context.tenantId, current.company_id, id, input.status],
            );
            const row = (
              await client.query<CompanyCurrencyRateRow>(
                `select id,company_id,source_currency,target_currency,rate::text,effective_date::text,status,
                        row_version::integer as version,supersedes_rate_id,created_by,created_at,updated_at
                   from currency_rate where tenant_id=$1 and company_id=$2 and id=$3`,
                [context.tenantId, current.company_id, id],
              )
            ).rows[0]!;
            const rate = this.companyRate(row);
            const version = input.expected_version + 1;
            const audit = await this.audit(client, context, {
              action: `finance.company_currency_rate.${input.status === "active" ? "activated" : "inactivated"}`,
              entityType: "company_currency_rate",
              entityId: id,
              before: { status: current.status, version: input.expected_version },
              after: rate,
              source: `company:${current.company_id}`,
              correlation,
            });
            await this.companyEvent(client, context, {
              companyId: current.company_id,
              entityType: "rate",
              entityId: id,
              action: input.status === "active" ? "rate_activated" : "rate_inactivated",
              recordVersion: version,
              reason: input.reason,
              correlation,
              occurredAt: audit.occurred,
            });
            return rate;
          },
        );
      },
      true,
    );
  }

  async resolveCompanyCurrencyRate(
    context: BankingActorContext,
    companyId: string,
    sourceCurrency: string,
    effectiveOnOrBefore: string,
    options: ResolveCompanyCurrencyRateOptions = {},
  ): Promise<ResolvedCompanyCurrencyRate> {
    return this.transaction(context, async (client) => {
      await this.requireCompanyPermission(client, context, companyId, "finance.company_currency_rate.read");
      const profile = (
        await client.query<{ id: string; base_currency: string }>(
          "select id,base_currency from company_currency_profile where tenant_id=$1 and company_id=$2 and status='active'",
          [context.tenantId, companyId],
        )
      ).rows[0];
      if (!profile)
        throw new FinanceCurrencyError(
          409,
          "COMPANY_CURRENCY_PROFILE_REQUIRED",
          "Configure the company base currency before resolving exchange rates.",
        );
      const companyCurrency = (
        await client.query<{ status: string }>(
          "select status from company_currency where tenant_id=$1 and company_id=$2 and currency_code=$3",
          [context.tenantId, companyId, sourceCurrency],
        )
      ).rows[0];
      if (!companyCurrency || companyCurrency.status !== "active")
        throw new FinanceCurrencyError(
          409,
          "COMPANY_CURRENCY_INACTIVE",
          "The source currency is not active for this company.",
        );
      if (sourceCurrency === profile.base_currency)
        return {
          id: profile.id,
          companyId,
          sourceCurrency,
          targetCurrency: profile.base_currency,
          rate: "1",
          effectiveDate: effectiveOnOrBefore,
          version: 1,
          authority: "company",
        };
      const companyRate = (
        await client.query<{
          id: string;
          source_currency: string;
          target_currency: string;
          rate: string;
          effective_date: string;
          version: number;
        }>(
          `select id,source_currency,target_currency,rate::text,effective_date::text,
                  row_version::integer as version
             from currency_rate
            where tenant_id=$1 and company_id=$2 and source_currency=$3
              and target_currency=$4 and status='active' and effective_date<=$5::date
            order by effective_date desc,id desc limit 1`,
          [context.tenantId, companyId, sourceCurrency, profile.base_currency, effectiveOnOrBefore],
        )
      ).rows[0];
      if (companyRate)
        return {
          id: companyRate.id,
          companyId,
          sourceCurrency: companyRate.source_currency,
          targetCurrency: companyRate.target_currency,
          rate: companyRate.rate,
          effectiveDate: companyRate.effective_date,
          version: companyRate.version,
          authority: "company",
        };
      if (options.legacyEvidenceRateId) {
        const legacy = (
          await client.query<{
            id: string;
            source_currency: string;
            target_currency: string;
            rate: string;
            effective_date: string;
            version: number;
          }>(
            `select id,source_currency,target_currency,rate::text,effective_date::text,
                    row_version::integer as version
               from currency_rate
              where tenant_id=$1 and company_id is null and id=$2
                and source_currency=$3 and target_currency=$4 and effective_date<=$5::date`,
            [
              context.tenantId,
              options.legacyEvidenceRateId,
              sourceCurrency,
              profile.base_currency,
              effectiveOnOrBefore,
            ],
          )
        ).rows[0];
        if (legacy)
          return {
            id: legacy.id,
            companyId,
            sourceCurrency: legacy.source_currency,
            targetCurrency: legacy.target_currency,
            rate: legacy.rate,
            effectiveDate: legacy.effective_date,
            version: legacy.version,
            authority: "legacy_pre_cutover",
          };
      }
      throw new FinanceCurrencyError(
        404,
        "COMPANY_CURRENCY_RATE_NOT_FOUND",
        "No active company exchange rate applies on or before the requested date.",
      );
    });
  }

  async listCatalog(context: BankingActorContext, query: CurrencyCatalogQuery): Promise<CurrencyCatalogDirectory> {
    this.requireClaim(context, "platform.currency.read");
    return this.transaction(context, async (client) => {
      await this.requireTenantPermission(client, context, "platform.currency.read");
      const values: unknown[] = [context.tenantId];
      const filters = ["catalog.status='active'"];
      if (query.search) {
        values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(catalog.code ilike $${values.length} escape '\\' or catalog.name ilike $${values.length} escape '\\')`,
        );
      }
      if (query.adopted !== undefined) {
        values.push(query.adopted);
        filters.push(`(tenant_currency.code is not null)=$${values.length}`);
      }
      const start = offset(query.cursor);
      values.push(query.limit + 1, start);
      const result = await client.query(
        `select catalog.code,catalog.name,catalog.decimal_places,(tenant_currency.code is not null) as adopted,
          tenant_currency.status as adopted_status,coalesce(tenant_currency.is_base,false) as is_base
         from currency_catalog catalog left join currency tenant_currency on tenant_currency.tenant_id=$1 and tenant_currency.code=catalog.code
         where ${filters.join(" and ")} order by catalog.code limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      const more = result.rows.length > query.limit;
      return currencyCatalogDirectorySchema.parse({
        items: result.rows.slice(0, query.limit),
        next_cursor: more ? cursor(start + query.limit) : null,
      });
    });
  }

  async listCurrencies(context: BankingActorContext, query: TenantCurrencyQuery): Promise<TenantCurrencyDirectory> {
    this.requireClaim(context, "platform.currency.read");
    return this.transaction(context, async (client) => {
      await this.requireTenantPermission(client, context, "platform.currency.read");
      const values: unknown[] = [context.tenantId],
        filters = ["tenant_id=$1"];
      if (query.search) {
        values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(`(code ilike $${values.length} escape '\\' or name ilike $${values.length} escape '\\')`);
      }
      if (query.status) {
        values.push(query.status);
        filters.push(`status=$${values.length}`);
      }
      const start = offset(query.cursor);
      values.push(query.limit + 1, start);
      const result = await client.query(
        `select code,name,decimal_places,is_base,status,row_version::integer as version,created_at,updated_at from currency where ${filters.join(" and ")} order by is_base desc,code limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      const more = result.rows.length > query.limit;
      return tenantCurrencyDirectorySchema.parse({
        items: result.rows
          .slice(0, query.limit)
          .map((row) => ({ ...row, created_at: timestamp(row.created_at), updated_at: timestamp(row.updated_at) })),
        next_cursor: more ? cursor(start + query.limit) : null,
      });
    });
  }

  async adopt(
    context: BankingActorContext,
    input: AdoptCurrencyRequest,
    key: string,
    correlation: string,
  ): Promise<FinanceConfigurationMutation> {
    return this.transaction(
      context,
      async (client) => {
        await this.requireTenantPermission(client, context, "platform.currency.manage");
        return this.idempotent(
          client,
          context,
          "/api/v1/finance/currencies/adoptions",
          input,
          key,
          (v) => financeConfigurationMutationSchema.parse(v),
          async () => {
            const catalog = (
              await client.query<{ code: string; name: string; decimal_places: number }>(
                "select code,name,decimal_places from currency_catalog where code=$1 and status='active'",
                [input.code],
              )
            ).rows[0];
            if (!catalog)
              throw new FinanceCurrencyError(
                404,
                "CURRENCY_CATALOG_NOT_FOUND",
                "The standard currency is unavailable.",
              );
            if (
              (
                await client.query("select 1 from currency where tenant_id=$1 and code=$2", [
                  context.tenantId,
                  input.code,
                ])
              ).rowCount
            )
              throw new FinanceCurrencyError(409, "CURRENCY_ALREADY_ADOPTED", "This currency is already adopted.");
            await client.query(
              "insert into currency(tenant_id,code,name,decimal_places,is_base,status,catalog_code,row_version,adopted_by,adopted_at) values($1,$2,$3,$4,false,'active',$2,1,$5,clock_timestamp())",
              [context.tenantId, catalog.code, catalog.name, catalog.decimal_places, context.actor.userId],
            );
            const audit = await this.audit(client, context, {
              action: "platform.currency.adopted",
              entityType: "currency",
              entityId: input.code,
              before: null,
              after: catalog,
              source: "currency_catalog",
              correlation,
            });
            await client.query(
              "insert into currency_master_event(tenant_id,id,entity_type,entity_id,action,record_version,actor_id,reason,correlation_id,occurred_at) values($1,$2,'currency',$3,'adopted',1,$4,null,$5,$6)",
              [context.tenantId, audit.id, input.code, context.actor.userId, correlation, audit.occurred],
            );
            return financeConfigurationMutationSchema.parse({
              id: input.code,
              version: 1,
              audit_event_id: audit.id,
              replayed: false,
            });
          },
        );
      },
      true,
    );
  }

  async changeCurrencyStatus(
    context: BankingActorContext,
    code: string,
    input: ChangeCurrencyStatusRequest,
    key: string,
    correlation: string,
  ): Promise<FinanceConfigurationMutation> {
    return this.transaction(
      context,
      async (client) => {
        await this.requireTenantPermission(client, context, "platform.currency.manage");
        return this.idempotent(
          client,
          context,
          `/api/v1/finance/currencies/${code}/status`,
          input,
          key,
          (v) => financeConfigurationMutationSchema.parse(v),
          async () => {
            const current = (
              await client.query<CurrencyRow>("select * from currency where tenant_id=$1 and code=$2 for update", [
                context.tenantId,
                code,
              ])
            ).rows[0];
            if (!current)
              throw new FinanceCurrencyError(404, "CURRENCY_NOT_FOUND", "The tenant currency was not found.");
            if (Number(current.row_version) !== input.expected_version)
              throw new FinanceCurrencyError(
                409,
                "CURRENCY_VERSION_CONFLICT",
                "The currency changed. Reload and retry.",
              );
            if (current.status === input.status)
              throw new FinanceCurrencyError(409, "CURRENCY_STATUS_UNCHANGED", "Select a different currency status.");
            if (input.status === "inactive") {
              const dependency = await client.query(
                `select 1 where exists(select 1 from bank_account where tenant_id=$1 and currency=$2 and status='active') or exists(select 1 from currency_rate where tenant_id=$1 and status='active' and (source_currency=$2 or target_currency=$2))`,
                [context.tenantId, code],
              );
              if (dependency.rowCount)
                throw new FinanceCurrencyError(
                  409,
                  "CURRENCY_IN_USE",
                  "Deactivate dependent Banks and rates before inactivating this currency.",
                );
            }
            await client.query(
              "update currency set status=$3,row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and code=$2",
              [context.tenantId, code, input.status],
            );
            const audit = await this.audit(client, context, {
              action: `platform.currency.${input.status === "active" ? "activated" : "inactivated"}`,
              entityType: "currency",
              entityId: code,
              before: current,
              after: { ...current, status: input.status },
              source: `currency:${code}`,
              correlation,
            });
            await client.query(
              "insert into currency_master_event(tenant_id,id,entity_type,entity_id,action,record_version,actor_id,reason,correlation_id,occurred_at) values($1,$2,'currency',$3,$4,$5,$6,$7,$8,$9)",
              [
                context.tenantId,
                audit.id,
                code,
                input.status === "active" ? "activated" : "inactivated",
                input.expected_version + 1,
                context.actor.userId,
                input.reason,
                correlation,
                audit.occurred,
              ],
            );
            return financeConfigurationMutationSchema.parse({
              id: code,
              version: input.expected_version + 1,
              audit_event_id: audit.id,
              replayed: false,
            });
          },
        );
      },
      true,
    );
  }

  private rate(row: CurrencyRateRow): CurrencyRate {
    return currencyRateSchema.parse({
      ...row,
      version: Number(row.version),
      created_by: row.created_by ?? null,
      created_at: timestamp(row.created_at),
      updated_at: timestamp(row.updated_at),
    });
  }

  async listRates(context: BankingActorContext, query: CurrencyRateQuery): Promise<CurrencyRateDirectory> {
    this.requireClaim(context, "platform.currency_rate.read");
    return this.transaction(context, async (client) => {
      await this.requireTenantPermission(client, context, "platform.currency_rate.read");
      const values: unknown[] = [context.tenantId],
        filters = ["tenant_id=$1"];
      if (query.source_currency) {
        values.push(query.source_currency);
        filters.push(`source_currency=$${values.length}`);
      }
      if (query.effective_on_or_before) {
        values.push(query.effective_on_or_before);
        filters.push(`effective_date<=$${values.length}::date`);
      }
      if (query.status) {
        values.push(query.status);
        filters.push(`status=$${values.length}`);
      }
      const start = offset(query.cursor);
      values.push(query.limit + 1, start);
      const result = await client.query(
        `select id,source_currency,target_currency,rate::text,effective_date::text,status,row_version::integer as version,supersedes_rate_id,created_by,created_at,updated_at from currency_rate where ${filters.join(" and ")} order by effective_date desc,id desc limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      const more = result.rows.length > query.limit;
      return currencyRateDirectorySchema.parse({
        items: result.rows.slice(0, query.limit).map((row) => this.rate(row)),
        next_cursor: more ? cursor(start + query.limit) : null,
      });
    });
  }

  async createRate(
    context: BankingActorContext,
    input: CreateCurrencyRateRequest,
    key: string,
    correlation: string,
  ): Promise<CurrencyRate> {
    return this.transaction(
      context,
      async (client) => {
        await this.requireTenantPermission(client, context, "platform.currency_rate.manage");
        return this.idempotent(
          client,
          context,
          "/api/v1/finance/currency_rates",
          input,
          key,
          (v) => currencyRateSchema.parse(v),
          async () => {
            const base = (
              await client.query<{ code: string }>(
                "select code from currency where tenant_id=$1 and is_base and status='active'",
                [context.tenantId],
              )
            ).rows;
            if (base.length !== 1)
              throw new FinanceCurrencyError(
                409,
                "BASE_CURRENCY_INVALID",
                "Exactly one active base currency is required.",
              );
            if (input.source_currency === base[0]!.code)
              throw new FinanceCurrencyError(400, "RATE_PAIR_INVALID", "A base-to-base rate is not allowed.");
            await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
              financeRateAuthorityLockResource(context.tenantId, input.source_currency, base[0]!.code),
            ]);
            const id = `currency-rate-${randomUUID()}`;
            await client.query(
              "insert into currency_rate(id,tenant_id,source_currency,target_currency,rate,effective_date,status,row_version,created_by,updated_at) values($1,$2,$3,$4,$5,$6,'active',1,$7,clock_timestamp())",
              [
                id,
                context.tenantId,
                input.source_currency,
                base[0]!.code,
                input.rate,
                input.effective_date,
                context.actor.userId,
              ],
            );
            const row = (
              await client.query(
                "select id,source_currency,target_currency,rate::text,effective_date::text,status,row_version::integer as version,supersedes_rate_id,created_by,created_at,updated_at from currency_rate where tenant_id=$1 and id=$2",
                [context.tenantId, id],
              )
            ).rows[0];
            const audit = await this.audit(client, context, {
              action: "platform.currency_rate.created",
              entityType: "currency_rate",
              entityId: id,
              before: null,
              after: row,
              source: `rate:${input.source_currency}:${base[0]!.code}`,
              correlation,
            });
            await client.query(
              "insert into currency_master_event(tenant_id,id,entity_type,entity_id,action,record_version,actor_id,reason,correlation_id,occurred_at) values($1,$2,'currency_rate',$3,'rate_created',1,$4,null,$5,$6)",
              [context.tenantId, audit.id, id, context.actor.userId, correlation, audit.occurred],
            );
            return this.rate(row);
          },
        );
      },
      true,
    );
  }

  async correctRate(
    context: BankingActorContext,
    id: string,
    input: CorrectCurrencyRateRequest,
    key: string,
    correlation: string,
  ): Promise<CurrencyRate> {
    return this.transaction(
      context,
      async (client) => {
        await this.requireTenantPermission(client, context, "platform.currency_rate.manage");
        return this.idempotent(
          client,
          context,
          `/api/v1/finance/currency_rates/${id}/corrections`,
          input,
          key,
          (v) => currencyRateSchema.parse(v),
          async () => {
            const current = (
              await client.query<CurrencyRateRow>(
                "select * from currency_rate where tenant_id=$1 and id=$2 for update",
                [context.tenantId, id],
              )
            ).rows[0];
            if (!current)
              throw new FinanceCurrencyError(404, "CURRENCY_RATE_NOT_FOUND", "The currency rate was not found.");
            if (Number(current.row_version) !== input.expected_version || current.status !== "active")
              throw new FinanceCurrencyError(
                409,
                "CURRENCY_RATE_VERSION_CONFLICT",
                "The active rate changed. Reload and retry.",
              );
            await client.query("select pg_advisory_xact_lock(finance_currency_rate_lock_key($1,$2,$3))", [
              context.tenantId,
              current.source_currency,
              current.target_currency,
            ]);
            await client.query(
              "update currency_rate set status='superseded',row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and id=$2",
              [context.tenantId, id],
            );
            const replacement = `currency-rate-${randomUUID()}`;
            await client.query(
              "insert into currency_rate(id,tenant_id,source_currency,target_currency,rate,effective_date,status,row_version,supersedes_rate_id,created_by,reason,updated_at) values($1,$2,$3,$4,$5,$6,'active',1,$7,$8,$9,clock_timestamp())",
              [
                replacement,
                context.tenantId,
                current.source_currency,
                current.target_currency,
                input.rate,
                current.effective_date,
                id,
                context.actor.userId,
                input.reason,
              ],
            );
            const row = (
              await client.query(
                "select id,source_currency,target_currency,rate::text,effective_date::text,status,row_version::integer as version,supersedes_rate_id,created_by,created_at,updated_at from currency_rate where tenant_id=$1 and id=$2",
                [context.tenantId, replacement],
              )
            ).rows[0];
            const audit = await this.audit(client, context, {
              action: "platform.currency_rate.corrected",
              entityType: "currency_rate",
              entityId: replacement,
              before: current,
              after: row,
              source: `supersedes:${id}`,
              correlation,
            });
            await client.query(
              "insert into currency_master_event(tenant_id,id,entity_type,entity_id,action,record_version,actor_id,reason,correlation_id,occurred_at) values($1,$2,'currency_rate',$3,'rate_corrected',1,$4,$5,$6,$7)",
              [
                context.tenantId,
                audit.id,
                replacement,
                context.actor.userId,
                input.reason,
                correlation,
                audit.occurred,
              ],
            );
            return this.rate(row);
          },
        );
      },
      true,
    );
  }

  async changeRateStatus(
    context: BankingActorContext,
    id: string,
    input: ChangeCurrencyRateStatusRequest,
    key: string,
    correlation: string,
  ): Promise<CurrencyRate> {
    return this.transaction(
      context,
      async (client) => {
        await this.requireTenantPermission(client, context, "platform.currency_rate.manage");
        return this.idempotent(
          client,
          context,
          `/api/v1/finance/currency_rates/${id}/status`,
          input,
          key,
          (v) => currencyRateSchema.parse(v),
          async () => {
            const current = (
              await client.query<CurrencyRateRow>(
                "select * from currency_rate where tenant_id=$1 and id=$2 for update",
                [context.tenantId, id],
              )
            ).rows[0];
            if (!current)
              throw new FinanceCurrencyError(404, "CURRENCY_RATE_NOT_FOUND", "The currency rate was not found.");
            if (Number(current.row_version) !== input.expected_version || current.status === "superseded")
              throw new FinanceCurrencyError(
                409,
                "CURRENCY_RATE_VERSION_CONFLICT",
                "The current rate changed. Reload and retry.",
              );
            if (current.status === input.status)
              throw new FinanceCurrencyError(409, "CURRENCY_RATE_STATUS_UNCHANGED", "Select a different rate status.");
            await client.query("select pg_advisory_xact_lock(finance_currency_rate_lock_key($1,$2,$3))", [
              context.tenantId,
              current.source_currency,
              current.target_currency,
            ]);
            await client.query(
              "update currency_rate set status=$3,row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and id=$2",
              [context.tenantId, id, input.status],
            );
            const row = (
              await client.query(
                "select id,source_currency,target_currency,rate::text,effective_date::text,status,row_version::integer as version,supersedes_rate_id,created_by,created_at,updated_at from currency_rate where tenant_id=$1 and id=$2",
                [context.tenantId, id],
              )
            ).rows[0];
            const action = input.status === "active" ? "rate_activated" : "rate_inactivated";
            const audit = await this.audit(client, context, {
              action: `platform.currency_rate.${input.status === "active" ? "activated" : "inactivated"}`,
              entityType: "currency_rate",
              entityId: id,
              before: current,
              after: row,
              source: `rate:${id}`,
              correlation,
            });
            await client.query(
              "insert into currency_master_event(tenant_id,id,entity_type,entity_id,action,record_version,actor_id,reason,correlation_id,occurred_at) values($1,$2,'currency_rate',$3,$4,$5,$6,$7,$8,$9)",
              [
                context.tenantId,
                audit.id,
                id,
                action,
                input.expected_version + 1,
                context.actor.userId,
                input.reason,
                correlation,
                audit.occurred,
              ],
            );
            return this.rate(row);
          },
        );
      },
      true,
    );
  }

  private policy(row: TransferFxPolicyRow): TransferFxPolicy {
    return transferFxPolicySchema.parse({
      id: row.id,
      company_id: row.company_id,
      fx_gain_nominal_id: row.fx_gain_nominal_id,
      fx_loss_nominal_id: row.fx_loss_nominal_id,
      rounding_nominal_id: row.rounding_nominal_id,
      bank_charge_nominal_id: row.bank_charge_nominal_id,
      rounding_tolerance: row.rounding_tolerance,
      version: Number(row.row_version),
      created_at: timestamp(row.created_at),
      updated_at: timestamp(row.updated_at),
    });
  }
  async getPolicy(context: BankingActorContext, companyId: string): Promise<TransferFxPolicy> {
    return this.transaction(context, async (client) => {
      await this.requireCompanyPermission(client, context, companyId, "finance.transfer_fx_policy.read");
      const row = (
        await client.query(
          "select *,rounding_tolerance::text from bank_transfer_fx_policy where tenant_id=$1 and company_id=$2",
          [context.tenantId, companyId],
        )
      ).rows[0];
      if (!row)
        throw new FinanceCurrencyError(
          404,
          "TRANSFER_FX_POLICY_NOT_FOUND",
          "Configure the company Transfer/FX policy before creating Transfers.",
        );
      return this.policy(row);
    });
  }
  async upsertPolicy(
    context: BankingActorContext,
    input: UpsertTransferFxPolicyRequest,
    key: string,
    correlation: string,
  ): Promise<FinanceConfigurationMutation> {
    return this.transaction(
      context,
      async (client) => {
        await this.requireCompanyPermission(client, context, input.company_id, "finance.transfer_fx_policy.manage");
        return this.idempotent(
          client,
          context,
          "/api/v1/finance/transfer_policy",
          input,
          key,
          (v) => financeConfigurationMutationSchema.parse(v),
          async () => {
            const current = (
              await client.query<TransferFxPolicyRow>(
                "select * from bank_transfer_fx_policy where tenant_id=$1 and company_id=$2 for update",
                [context.tenantId, input.company_id],
              )
            ).rows[0];
            if (current && Number(current.row_version) !== input.expected_version)
              throw new FinanceCurrencyError(
                409,
                "TRANSFER_FX_POLICY_VERSION_CONFLICT",
                "The Transfer/FX policy changed. Reload and retry.",
              );
            if (!current && input.expected_version !== undefined)
              throw new FinanceCurrencyError(
                409,
                "TRANSFER_FX_POLICY_VERSION_CONFLICT",
                "The Transfer/FX policy does not exist yet.",
              );
            const id = current?.id ?? `transfer-fx-policy-${randomUUID()}`,
              version = current ? Number(current.row_version) + 1 : 1;
            if (current)
              await client.query(
                "update bank_transfer_fx_policy set fx_gain_nominal_id=$3,fx_loss_nominal_id=$4,rounding_nominal_id=$5,bank_charge_nominal_id=$6,rounding_tolerance=$7,row_version=row_version+1,updated_by=$8,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2",
                [
                  context.tenantId,
                  input.company_id,
                  input.fx_gain_nominal_id,
                  input.fx_loss_nominal_id,
                  input.rounding_nominal_id,
                  input.bank_charge_nominal_id,
                  input.rounding_tolerance,
                  context.actor.userId,
                ],
              );
            else
              await client.query(
                "insert into bank_transfer_fx_policy(tenant_id,company_id,id,fx_gain_nominal_id,fx_loss_nominal_id,rounding_nominal_id,bank_charge_nominal_id,rounding_tolerance,row_version,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$9)",
                [
                  context.tenantId,
                  input.company_id,
                  id,
                  input.fx_gain_nominal_id,
                  input.fx_loss_nominal_id,
                  input.rounding_nominal_id,
                  input.bank_charge_nominal_id,
                  input.rounding_tolerance,
                  context.actor.userId,
                ],
              );
            const after = (
              await client.query("select * from bank_transfer_fx_policy where tenant_id=$1 and id=$2", [
                context.tenantId,
                id,
              ])
            ).rows[0];
            const audit = await this.audit(client, context, {
              action: `finance.transfer_fx_policy.${current ? "updated" : "created"}`,
              entityType: "bank_transfer_fx_policy",
              entityId: id,
              before: current ?? null,
              after,
              source: `company:${input.company_id}`,
              correlation,
            });
            await client.query(
              "insert into bank_transfer_fx_policy_event(tenant_id,company_id,id,policy_id,actor_id,action,record_version,reason,correlation_id,occurred_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
              [
                context.tenantId,
                input.company_id,
                audit.id,
                id,
                context.actor.userId,
                current ? "updated" : "created",
                version,
                input.reason,
                correlation,
                audit.occurred,
              ],
            );
            return financeConfigurationMutationSchema.parse({ id, version, audit_event_id: audit.id, replayed: false });
          },
        );
      },
      true,
    );
  }
}
