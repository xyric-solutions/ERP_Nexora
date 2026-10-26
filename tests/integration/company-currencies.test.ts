import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import {
  FinanceCurrencyError,
  SourceFinanceCurrencyRepository,
} from "../../server/api/src/modules/finance/currencies/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const isolatedDatabase = `company_currency_${randomUUID().replaceAll("-", "")}`;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const companyId = `fxr-company-${suffix}`;
const otherCompanyId = `fxr-company-other-${suffix}`;
const permissions = [
  "finance.company_currency_profile.read",
  "finance.company_currency_profile.manage",
  "finance.company_currency.read",
  "finance.company_currency.manage",
  "finance.company_currency_rate.read",
  "finance.company_currency_rate.manage",
] as const;

function context(overrides: Partial<BankingActorContext> = {}): BankingActorContext {
  const actor: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId: "r06.maker",
    email: "r06.maker@uat.nexora.invalid",
    displayName: "Company Currency Administrator",
    roles: [],
    permissions,
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor, ...overrides };
}

run("Company currency and rate authority", () => {
  let bootstrap: DatabasePool;
  let pool: DatabasePool;
  let repository: SourceFinanceCurrencyRepository;

  beforeAll(async () => {
    bootstrap = createDatabasePool(databaseUrl!);
    expect(isolatedDatabase).toMatch(/^company_currency_[a-f0-9]{32}$/);
    await bootstrap.query(`create database ${isolatedDatabase}`);
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.pathname = `/${isolatedDatabase}`;
    pool = createDatabasePool(isolatedUrl.toString());
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);
    await pool.query(
      `insert into organization_unit(id,tenant_id,parent_id,type,code,name,status)
       values($1,$3,null,'company',$4,'FXR Company','active'),
             ($2,$3,null,'company',$5,'FXR Other Company','active')`,
      [companyId, otherCompanyId, sourceTestTenantId, `FXR-${suffix}`, `FXR-O-${suffix}`],
    );
    await pool.query(
      `insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
       select $1,'r06-uat-policy-maker',permission,'all'
         from unnest($2::text[]) permission on conflict do nothing`,
      [sourceTestTenantId, permissions],
    );
    await pool.query(
      `insert into security_role_scope_grant
       (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
       select $1,'r06-uat-policy-maker',permission,'company',$3
         from unnest($2::text[]) permission on conflict do nothing`,
      [sourceTestTenantId, permissions, companyId],
    );
    await pool.query(
      `insert into security_user_company_access
       (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
       values($1,$2,'r06.maker',$3,false,'r06.last-admin-a','governed_administration','fxr-03-test')`,
      [sourceTestTenantId, `fxr-access-${suffix}`, companyId],
    );
    repository = new SourceFinanceCurrencyRepository(pool);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${isolatedDatabase}`);
      await bootstrap.end();
    }
  });

  it("searches the deterministic country directory", async () => {
    const result = await repository.listCountryCurrencies(context(), { search: "United States", limit: 10 });
    expect(result.items).toContainEqual(
      expect.objectContaining({ country_code: "US", currency_code: "USD", is_primary: true }),
    );
  });

  it("configures one base profile and atomically activates a foreign currency with its initial rate", async () => {
    const administrator = context();
    const profile = await repository.configureCompanyCurrencyProfile(
      administrator,
      { company_id: companyId, base_country_code: "PK", base_currency: "PKR" },
      randomUUID(),
      randomUUID(),
    );
    expect(profile).toMatchObject({ version: 1, replayed: false });
    await expect(repository.getCompanyCurrencyProfile(administrator, companyId)).resolves.toMatchObject({
      company_id: companyId,
      base_currency: "PKR",
      base_country_code: "PK",
    });

    const activation = await repository.activateCompanyCurrency(
      administrator,
      {
        company_id: companyId,
        country_code: "US",
        currency_code: "USD",
        rate: "275",
        effective_date: "2026-10-26",
      },
      randomUUID(),
      randomUUID(),
    );
    expect(activation).toMatchObject({ version: 1, replayed: false });

    const records = await repository.listCompanyCurrencies(administrator, { company_id: companyId, limit: 50 });
    expect(records.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency_code: "PKR", is_base: true, latest_rate: null }),
        expect.objectContaining({
          currency_code: "USD",
          is_base: false,
          latest_rate: "275.000000000000000000",
          latest_rate_effective_date: "2026-10-26",
        }),
      ]),
    );
    const persisted = await pool.query<{ currencies: string; rates: string }>(
      `select
         (select count(*)::text from company_currency where tenant_id=$1 and company_id=$2) currencies,
         (select count(*)::text from currency_rate where tenant_id=$1 and company_id=$2) rates`,
      [sourceTestTenantId, companyId],
    );
    expect(persisted.rows[0]).toEqual({ currencies: "2", rates: "1" });
  });

  it("rejects unsupported mappings and duplicate/base activation without partial records", async () => {
    const administrator = context();
    await expect(
      repository.activateCompanyCurrency(
        administrator,
        {
          company_id: companyId,
          country_code: "US",
          currency_code: "AED",
          rate: "75",
          effective_date: "2026-10-26",
        },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 400, code: "COUNTRY_CURRENCY_MAPPING_INVALID" });
    await expect(
      repository.activateCompanyCurrency(
        administrator,
        {
          company_id: companyId,
          country_code: "PK",
          currency_code: "PKR",
          rate: "1",
          effective_date: "2026-10-26",
        },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 400, code: "BASE_CURRENCY_DUPLICATION" });
    await expect(
      repository.activateCompanyCurrency(
        administrator,
        {
          company_id: companyId,
          country_code: "US",
          currency_code: "USD",
          rate: "276",
          effective_date: "2026-10-27",
        },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409, code: "COMPANY_CURRENCY_EXISTS" });
    const unsupported = await pool.query(
      "select 1 from company_currency where tenant_id=$1 and company_id=$2 and currency_code='AED'",
      [sourceTestTenantId, companyId],
    );
    expect(unsupported.rowCount).toBe(0);
  });

  it("preserves rate history, resolves as-of company authority, and rejects stale revisions", async () => {
    const administrator = context();
    const created = await repository.createCompanyCurrencyRate(
      administrator,
      { company_id: companyId, source_currency: "USD", rate: "277", effective_date: "2026-11-01" },
      randomUUID(),
      randomUUID(),
    );
    const corrected = await repository.correctCompanyCurrencyRate(
      administrator,
      created.id,
      { expected_version: 1, rate: "278", reason: "Corrected approved treasury rate" },
      randomUUID(),
      randomUUID(),
    );
    expect(corrected).toMatchObject({
      rate: "278.000000000000000000",
      supersedes_rate_id: created.id,
      version: 1,
    });
    await expect(
      repository.correctCompanyCurrencyRate(
        administrator,
        created.id,
        { expected_version: 1, rate: "279", reason: "Stale correction must fail" },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409, code: "COMPANY_CURRENCY_RATE_VERSION_CONFLICT" });
    await expect(
      repository.resolveCompanyCurrencyRate(administrator, companyId, "USD", "2026-11-03"),
    ).resolves.toMatchObject({
      id: corrected.id,
      rate: "278.000000000000000000",
      effectiveDate: "2026-11-01",
      authority: "company",
    });
    const inactive = await repository.changeCompanyCurrencyRateStatus(
      administrator,
      corrected.id,
      { expected_version: 1, status: "inactive", reason: "Temporarily withdraw the approved quote" },
      randomUUID(),
      randomUUID(),
    );
    expect(inactive).toMatchObject({ id: corrected.id, status: "inactive", version: 2 });
    const reactivated = await repository.changeCompanyCurrencyRateStatus(
      administrator,
      corrected.id,
      { expected_version: 2, status: "active", reason: "Treasury reconfirmed the approved quote" },
      randomUUID(),
      randomUUID(),
    );
    expect(reactivated).toMatchObject({ id: corrected.id, status: "active", version: 3 });
    const history = await repository.listCompanyCurrencyRates(administrator, {
      company_id: companyId,
      source_currency: "USD",
      limit: 50,
    });
    expect(history.items.map((rate) => rate.status)).toEqual(expect.arrayContaining(["active", "superseded"]));
  });

  it("does not silently fall back to tenant legacy rates", async () => {
    const administrator = context();
    await expect(
      repository.resolveCompanyCurrencyRate(administrator, companyId, "USD", "2026-10-01"),
    ).rejects.toMatchObject({ status: 404, code: "COMPANY_CURRENCY_RATE_NOT_FOUND" });
  });

  it("uses a legacy rate only when pre-cutover evidence supplies its exact identifier", async () => {
    const legacyRateId = `legacy-rate-${suffix}`;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await client.query(
        `insert into currency_rate
         (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,created_by)
         values($1,$2,null,'USD','PKR',274,date '2026-09-30','active',1,'r06.maker')`,
        [legacyRateId, sourceTestTenantId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    await expect(
      repository.resolveCompanyCurrencyRate(context(), companyId, "USD", "2026-10-01", {
        legacyEvidenceRateId: legacyRateId,
      }),
    ).resolves.toMatchObject({
      id: legacyRateId,
      rate: "274.000000000000000000",
      authority: "legacy_pre_cutover",
    });
  });

  it("rejects impersonated mutations and cross-company reads", async () => {
    await expect(
      repository.createCompanyCurrencyRate(
        { ...context(), realActorId: "r06.last-admin-a", impersonationRequestId: "impersonation-fxr" },
        { company_id: companyId, source_currency: "USD", rate: "280", effective_date: "2026-12-01" },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403, code: "CURRENCY_AUTHORITY_DENIED" });
    await expect(repository.getCompanyCurrencyProfile(context(), otherCompanyId)).rejects.toBeInstanceOf(
      FinanceCurrencyError,
    );
  });
});
