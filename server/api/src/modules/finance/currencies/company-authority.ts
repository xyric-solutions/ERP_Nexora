import type { PoolClient } from "pg";

export type CompanyCurrencyAuthorityClient = Pick<PoolClient, "query">;

export class CompanyCurrencyAuthorityError extends Error {
  constructor(
    readonly status: number,
    readonly code: "COMPANY_CURRENCY_PROFILE_MISSING" | "COMPANY_CURRENCY_INACTIVE" | "COMPANY_CURRENCY_RATE_MISSING",
    message: string,
  ) {
    super(message);
  }
}

export interface CompanyCurrencyAuthority {
  baseCurrency: string;
  baseDecimalPlaces: number;
  sourceDecimalPlaces: number;
  rateId: string | null;
  rateValue: string;
  rateEffectiveDate: string | null;
}

interface ResolveCompanyCurrencyAuthorityInput {
  tenantId: string;
  companyId: string;
  sourceCurrency: string;
  effectiveOnOrBefore: string;
  lock?: boolean;
}

export interface CompanyBaseCurrencyAuthority {
  code: string;
  decimalPlaces: number;
}

export async function resolveCompanyBaseCurrency(
  client: CompanyCurrencyAuthorityClient,
  tenantId: string,
  companyId: string,
  lock = true,
): Promise<CompanyBaseCurrencyAuthority> {
  const profile = (
    await client.query<{ code: string; decimal_places: number }>(
      `select profile.base_currency as code,standard.decimal_places::integer
         from company_currency_profile profile
         join currency standard
           on standard.tenant_id=profile.tenant_id
          and standard.code=profile.base_currency
          and standard.status='active'
         join company_currency company_base
           on company_base.tenant_id=profile.tenant_id
          and company_base.company_id=profile.company_id
          and company_base.currency_code=profile.base_currency
          and company_base.is_base
          and company_base.status='active'
        where profile.tenant_id=$1 and profile.company_id=$2 and profile.status='active'
        ${lock ? "for share of profile,standard,company_base" : ""}`,
      [tenantId, companyId],
    )
  ).rows[0];
  if (!profile)
    throw new CompanyCurrencyAuthorityError(
      409,
      "COMPANY_CURRENCY_PROFILE_MISSING",
      "Configure the company base currency before creating financial transactions.",
    );
  return { code: profile.code, decimalPlaces: profile.decimal_places };
}

/**
 * Resolves the sole live currency authority for new company financial effects.
 * It intentionally does not fall back to tenant rates. Historical workflows
 * that already persisted a legacy rate identifier read that evidence directly
 * and never recalculate a posted amount.
 */
export async function resolveCompanyCurrencyAuthority(
  client: CompanyCurrencyAuthorityClient,
  input: ResolveCompanyCurrencyAuthorityInput,
): Promise<CompanyCurrencyAuthority> {
  const lock = input.lock ?? true;
  const profile = await resolveCompanyBaseCurrency(client, input.tenantId, input.companyId, lock);

  const source = (
    await client.query<{ decimal_places: number }>(
      `select standard.decimal_places::integer
         from company_currency company_currency
         join currency standard
           on standard.tenant_id=company_currency.tenant_id
          and standard.code=company_currency.currency_code
          and standard.status='active'
        where company_currency.tenant_id=$1
          and company_currency.company_id=$2
          and company_currency.currency_code=$3
          and company_currency.status='active'
        ${lock ? "for share of company_currency,standard" : ""}`,
      [input.tenantId, input.companyId, input.sourceCurrency],
    )
  ).rows[0];
  if (!source)
    throw new CompanyCurrencyAuthorityError(
      409,
      "COMPANY_CURRENCY_INACTIVE",
      "The transaction currency is not active for this company.",
    );

  if (input.sourceCurrency === profile.code)
    return {
      baseCurrency: profile.code,
      baseDecimalPlaces: profile.decimalPlaces,
      sourceDecimalPlaces: source.decimal_places,
      rateId: null,
      rateValue: "1.000000000000000000",
      rateEffectiveDate: null,
    };

  if (lock)
    await client.query("select pg_advisory_xact_lock(finance_currency_rate_lock_key($1,$2,$3))", [
      input.tenantId,
      input.sourceCurrency,
      profile.code,
    ]);
  const rate = (
    await client.query<{ id: string; rate: string; effective_date: string }>(
      `select id,rate::text,effective_date::text
         from currency_rate
        where tenant_id=$1 and company_id=$2 and source_currency=$3 and target_currency=$4
          and effective_date<=$5::date and status='active'
        order by effective_date desc,id desc limit 1 ${lock ? "for share" : ""}`,
      [input.tenantId, input.companyId, input.sourceCurrency, profile.code, input.effectiveOnOrBefore],
    )
  ).rows[0];
  if (!rate)
    throw new CompanyCurrencyAuthorityError(
      409,
      "COMPANY_CURRENCY_RATE_MISSING",
      "No active company exchange rate applies on or before the transaction date.",
    );
  return {
    baseCurrency: profile.code,
    baseDecimalPlaces: profile.decimalPlaces,
    sourceDecimalPlaces: source.decimal_places,
    rateId: rate.id,
    rateValue: rate.rate,
    rateEffectiveDate: rate.effective_date,
  };
}
