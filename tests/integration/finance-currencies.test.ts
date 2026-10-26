import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { SourceFinanceCurrencyRepository } from "../../server/api/src/modules/finance/currencies/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const isolatedDatabase = `currency_lifecycle_${randomUUID().replaceAll("-", "")}`;
const companyId = `currency-company-${suffix}`;
const nominalIds = ["gain", "loss", "rounding", "charge"].map((kind) => `currency-${kind}-${suffix}`);
const permissions = [
  "platform.currency.read",
  "platform.currency.manage",
  "platform.currency_rate.read",
  "platform.currency_rate.manage",
  "finance.transfer_fx_policy.read",
  "finance.transfer_fx_policy.manage",
] as const;

function context(): BankingActorContext {
  const account: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId: "r06.maker",
    email: "r06.maker@uat.nexora.invalid",
    displayName: "Currency Administrator",
    roles: [],
    permissions,
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor: account };
}

run("Finance Currency governed repository", () => {
  let bootstrap: DatabasePool;
  let pool: DatabasePool;
  let repository: SourceFinanceCurrencyRepository;
  let sourceCurrency: string;

  beforeAll(async () => {
    bootstrap = createDatabasePool(databaseUrl!);
    expect(isolatedDatabase).toMatch(/^currency_lifecycle_[a-f0-9]{32}$/);
    await bootstrap.query(`create database ${isolatedDatabase}`);
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.pathname = `/${isolatedDatabase}`;
    pool = createDatabasePool(isolatedUrl.toString());
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);

    const base = await pool.query<{ code: string }>(
      "select code from currency where tenant_id=$1 and is_base and status='active' limit 1",
      [sourceTestTenantId],
    );
    if (!base.rows[0]) {
      await pool.query(
        "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'USD','US Dollar',2,true,'active')",
        [sourceTestTenantId],
      );
    }
    const candidate = await pool.query<{ code: string }>(
      `select catalog.code from currency_catalog catalog
        where catalog.status='active' and catalog.code<>(select code from currency where tenant_id=$1 and is_base)
          and not exists(select 1 from currency where tenant_id=$1 and code=catalog.code)
        order by catalog.code limit 1`,
      [sourceTestTenantId],
    );
    sourceCurrency = candidate.rows[0]!.code;

    await pool.query(
      `insert into organization_unit(id,tenant_id,parent_id,type,code,name,status)
       values($1,$2,null,'company',$3,'Currency Integration Company','active')`,
      [companyId, sourceTestTenantId, `CUR-${suffix}`],
    );
    await pool.query(
      `insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
       select $1,'r06-uat-policy-maker',permission,'all' from unnest($2::text[]) permission on conflict do nothing`,
      [sourceTestTenantId, permissions],
    );
    await pool.query(
      `insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
       select $1,'r06-uat-policy-maker',permission,'tenant',$1 from unnest($2::text[]) permission
        where permission like 'platform.currency%'
       on conflict do nothing`,
      [sourceTestTenantId, permissions],
    );
    await pool.query(
      `insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
       select $1,'r06-uat-policy-maker',permission,'company',$3 from unnest($2::text[]) permission
        where permission like 'finance.transfer_fx_policy.%'
       on conflict do nothing`,
      [sourceTestTenantId, permissions, companyId],
    );
    await pool.query(
      `insert into security_user_company_access
        (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
       values($1,$2,'r06.maker',$3,false,'r06.last-admin-a','governed_administration','currency-integration')`,
      [sourceTestTenantId, `currency-access-${suffix}`, companyId],
    );
    await pool.query(
      `insert into account
        (id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,
         manual_posting_allowed,is_system_account,reconciliation_required,created_at)
       values
        ($1,$5,$6,$7,'Currency FX Gain','revenue',false,'[]','active',true,false,false,now()),
        ($2,$5,$6,$8,'Currency FX Loss','expense',false,'[]','active',true,false,false,now()),
        ($3,$5,$6,$9,'Currency Rounding','expense',false,'[]','active',true,false,false,now()),
        ($4,$5,$6,$10,'Currency Bank Charge','expense',false,'[]','active',true,false,false,now())`,
      [
        ...nominalIds,
        sourceTestTenantId,
        companyId,
        `CURG-${suffix}`,
        `CURL-${suffix}`,
        `CURR-${suffix}`,
        `CURC-${suffix}`,
      ],
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

  it("adopts a catalog currency, corrects an effective rate, and persists company policy history", async () => {
    const administrator = context();
    const adopted = await repository.adopt(administrator, { code: sourceCurrency }, randomUUID(), randomUUID());
    expect(adopted).toMatchObject({ id: sourceCurrency, version: 1, replayed: false });

    const rate = await repository.createRate(
      administrator,
      { source_currency: sourceCurrency, rate: "1.10000000", effective_date: "2026-10-22" },
      randomUUID(),
      randomUUID(),
    );
    const corrected = await repository.correctRate(
      administrator,
      rate.id,
      { expected_version: rate.version, rate: "1.12500000", reason: "Corrected from approved treasury quote" },
      randomUUID(),
      randomUUID(),
    );
    expect(corrected).toMatchObject({
      source_currency: sourceCurrency,
      rate: "1.125000000000000000",
      status: "active",
      supersedes_rate_id: rate.id,
      version: 1,
    });
    const original = await pool.query<{ status: string; row_version: string }>(
      "select status,row_version::text from currency_rate where tenant_id=$1 and id=$2",
      [sourceTestTenantId, rate.id],
    );
    expect(original.rows[0]).toEqual({ status: "superseded", row_version: "2" });

    const policyMutation = await repository.upsertPolicy(
      administrator,
      {
        company_id: companyId,
        fx_gain_nominal_id: nominalIds[0]!,
        fx_loss_nominal_id: nominalIds[1]!,
        rounding_nominal_id: nominalIds[2]!,
        bank_charge_nominal_id: nominalIds[3]!,
        rounding_tolerance: "0.01",
        reason: "Initial governed Bank Transfer FX policy",
      },
      randomUUID(),
      randomUUID(),
    );
    expect(policyMutation).toMatchObject({ version: 1, replayed: false });
    await expect(repository.getPolicy(administrator, companyId)).resolves.toMatchObject({
      id: policyMutation.id,
      company_id: companyId,
      fx_gain_nominal_id: nominalIds[0],
      version: 1,
    });

    const events = await pool.query<{ action: string }>(
      `select action from currency_master_event where tenant_id=$1 order by occurred_at,id`,
      [sourceTestTenantId],
    );
    expect(events.rows.map((event) => event.action)).toEqual(
      expect.arrayContaining(["adopted", "rate_created", "rate_corrected"]),
    );
  }, 60_000);
});
