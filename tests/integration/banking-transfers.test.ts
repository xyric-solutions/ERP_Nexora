import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import { SourceBankTransferRepository } from "../../server/api/src/modules/banking/transfers/source-repository.js";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import {
  ensureCompanyCurrencyFixture,
  ensureSourceAuthorizationFixture,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const isolatedDatabase = `transfer_lifecycle_${randomUUID().replaceAll("-", "")}`;
const companyId = `transfer-company-${suffix}`;
const calendarId = `transfer-calendar-${suffix}`;
const periodId = `transfer-period-${suffix}`;
const sourceLedgerId = `transfer-source-ledger-${suffix}`;
const destinationLedgerId = `transfer-destination-ledger-${suffix}`;
const foreignLedgerId = `transfer-foreign-ledger-${suffix}`;
const sourceBankId = `transfer-source-bank-${suffix}`;
const destinationBankId = `transfer-destination-bank-${suffix}`;
const foreignBankId = `transfer-foreign-bank-${suffix}`;
const foreignRateId = `transfer-foreign-rate-${suffix}`;
const policyId = `transfer-policy-${suffix}`;
const policyNominals = ["gain", "loss", "rounding", "charge"].map((kind) => `transfer-${kind}-${suffix}`);

function actor(userId: string, permissions: readonly string[]): BankingActorContext {
  const account: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: [],
    permissions,
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor: account };
}

const maker = actor("r06.maker", [
  "banking.transfer.read",
  "banking.transfer.create",
  "banking.transfer.update",
  "banking.transfer.submit",
]);
const checker = actor("r06.checker", ["banking.transfer.read", "banking.transfer.approve"]);
const poster = actor("r06.target", ["banking.transfer.read", "banking.transfer.post", "banking.transfer.reverse"]);

run("Bank Transfer governed repository", () => {
  let pool: DatabasePool;
  let bootstrap: DatabasePool;
  let repository: SourceBankTransferRepository;
  let postingDate: string;
  let baseCurrency: string;
  let foreignCurrency: string;

  beforeAll(async () => {
    bootstrap = createDatabasePool(databaseUrl!);
    expect(isolatedDatabase).toMatch(/^transfer_lifecycle_[a-f0-9]{32}$/);
    await bootstrap.query(`create database ${isolatedDatabase}`);
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.pathname = `/${isolatedDatabase}`;
    pool = createDatabasePool(isolatedUrl.toString());
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);
    const clock = await pool.query<{ posting_date: string; year: number; period: number }>(
      `select current_date::text as posting_date,
              extract(year from current_date)::integer as year,
              extract(month from current_date)::integer as period`,
    );
    postingDate = clock.rows[0]!.posting_date;
    const base = await pool.query<{ code: string }>(
      "select code from currency where tenant_id=$1 and status='active' and is_base order by code limit 1",
      [sourceTestTenantId],
    );
    baseCurrency = base.rows[0]?.code ?? "USD";
    if (!base.rows[0]) {
      await pool.query(
        "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'USD','US Dollar',2,true,'active')",
        [sourceTestTenantId],
      );
    }
    const foreign = await pool.query<{ code: string; name: string; decimal_places: number }>(
      `select code,name,decimal_places from currency_catalog
        where status='active' and code<>$1
          and exists(select 1 from country_currency_catalog mapping where mapping.currency_code=currency_catalog.code)
        order by code limit 1`,
      [baseCurrency],
    );
    foreignCurrency = foreign.rows[0]!.code;
    await pool.query(
      `insert into currency
        (tenant_id,code,name,decimal_places,is_base,status,catalog_code,row_version,adopted_by,adopted_at)
       values($1,$2,$3,$4,false,'active',$2,1,'r06.maker',clock_timestamp())`,
      [sourceTestTenantId, foreignCurrency, foreign.rows[0]!.name, foreign.rows[0]!.decimal_places],
    );

    await pool.query(
      `insert into organization_unit(id,tenant_id,parent_id,type,code,name,status)
       values($1,$2,null,'company',$3,'Bank Transfer Integration Company','active')`,
      [companyId, sourceTestTenantId, `TRF-${suffix}`],
    );
    await ensureCompanyCurrencyFixture(pool, companyId, baseCurrency, [foreignCurrency]);

    const grants = [
      [
        "r06-uat-policy-maker",
        ["banking.transfer.read", "banking.transfer.create", "banking.transfer.update", "banking.transfer.submit"],
      ],
      ["r06-uat-policy-checker", ["banking.transfer.read", "banking.transfer.approve"]],
      ["r06-uat-policy-payment-poster", ["banking.transfer.read", "banking.transfer.post", "banking.transfer.reverse"]],
    ] as const;
    for (const [policy, permissions] of grants) {
      await pool.query(
        `insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
         select $1,$2,permission,'all' from unnest($3::text[]) permission on conflict do nothing`,
        [sourceTestTenantId, policy, permissions],
      );
      await pool.query(
        `insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
         select $1,$2,permission,'company',$4 from unnest($3::text[]) permission on conflict do nothing`,
        [sourceTestTenantId, policy, permissions, companyId],
      );
    }
    for (const userId of ["r06.maker", "r06.checker", "r06.target"]) {
      await pool.query(
        `insert into security_user_company_access
          (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
         values($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','bank-transfer-integration')`,
        [sourceTestTenantId, `transfer-access-${userId}-${suffix}`, userId, companyId],
      );
    }

    await pool.query(
      `insert into fiscal_calendar(id,tenant_id,company_id,year,period_start,period_end,status)
       values($1,$2,$3,$4,make_date($4,1,1),make_date($4,12,31),'active')`,
      [calendarId, sourceTestTenantId, companyId, clock.rows[0]!.year],
    );
    await pool.query(
      `insert into financial_period
        (id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at)
       values($1,$2,$3,$4,$5,date_trunc('month',current_date)::date,
              (date_trunc('month',current_date)+interval '1 month - 1 day')::date,'open',now())`,
      [periodId, sourceTestTenantId, companyId, calendarId, clock.rows[0]!.period],
    );

    await pool.query(
      `insert into account
        (id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,
         manual_posting_allowed,is_system_account,reconciliation_required,created_at)
       values
        ($1,$8,$9,$10,'Transfer Source Control','asset',false,'[]','active',true,false,true,now()),
        ($2,$8,$9,$11,'Transfer Destination Control','asset',false,'[]','active',true,false,true,now()),
        ($3,$8,$9,$12,'Transfer FX Gain','revenue',false,'[]','active',true,false,false,now()),
        ($4,$8,$9,$13,'Transfer FX Loss','expense',false,'[]','active',true,false,false,now()),
        ($5,$8,$9,$14,'Transfer Rounding','expense',false,'[]','active',true,false,false,now()),
        ($6,$8,$9,$15,'Transfer Bank Charge','expense',false,'[]','active',true,false,false,now()),
        ($7,$8,$9,$16,'Transfer Foreign Control','asset',false,'[]','active',true,false,true,now())`,
      [
        sourceLedgerId,
        destinationLedgerId,
        ...policyNominals,
        foreignLedgerId,
        sourceTestTenantId,
        companyId,
        `TRFS-${suffix}`,
        `TRFD-${suffix}`,
        `TRFG-${suffix}`,
        `TRFL-${suffix}`,
        `TRFR-${suffix}`,
        `TRFC-${suffix}`,
        `TRFF-${suffix}`,
      ],
    );

    const bankInsert = `insert into bank_account
      (id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,account_name,
       account_type,account_number_masked,account_number_ciphertext,account_number_nonce,
       account_number_hash,encryption_key_version,overdraft_limit,row_version,created_by,
       submitted_by,submitted_at,submission_reason,approved_by,approved_at,decision_reason,updated_at)
     values($1,$2,$3,$4,'Synthetic Transfer Bank',$5,'active',now(),$6,$7,'current',
            '**** 1234',$8,$9,$10,'integration-v1',0,1,'r06.maker',
            'r06.maker',now(),'Controlled integration setup','r06.checker',now(),
            'Controlled integration approval',now())`;
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    await pool.query(bankInsert, [
      sourceBankId,
      sourceTestTenantId,
      companyId,
      sourceLedgerId,
      baseCurrency,
      `TRFS-${suffix}`,
      "Transfer Source Account",
      Buffer.alloc(24, 21),
      Buffer.alloc(12, 22),
      hash(`source-${suffix}`),
    ]);
    await pool.query(bankInsert, [
      destinationBankId,
      sourceTestTenantId,
      companyId,
      destinationLedgerId,
      baseCurrency,
      `TRFD-${suffix}`,
      "Transfer Destination Account",
      Buffer.alloc(24, 23),
      Buffer.alloc(12, 24),
      hash(`destination-${suffix}`),
    ]);
    await pool.query(bankInsert, [
      foreignBankId,
      sourceTestTenantId,
      companyId,
      foreignLedgerId,
      foreignCurrency,
      `TRFF-${suffix}`,
      "Transfer Foreign Account",
      Buffer.alloc(24, 25),
      Buffer.alloc(12, 26),
      hash(`foreign-${suffix}`),
    ]);
    await pool.query(
      `insert into currency_rate
        (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,created_by,updated_at)
       values($1,$2,$3,$4,$5,1.25,current_date-1,'active',1,'r06.maker',clock_timestamp())`,
      [foreignRateId, sourceTestTenantId, companyId, foreignCurrency, baseCurrency],
    );

    await pool.query(
      `insert into bank_transfer_fx_policy
        (tenant_id,company_id,id,fx_gain_nominal_id,fx_loss_nominal_id,rounding_nominal_id,
         bank_charge_nominal_id,rounding_tolerance,created_by,updated_by)
       values($1,$2,$3,$4,$5,$6,$7,0.01,'r06.maker','r06.maker')`,
      [sourceTestTenantId, companyId, policyId, ...policyNominals],
    );
    repository = new SourceBankTransferRepository(pool);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${isolatedDatabase}`);
      await bootstrap.end();
    }
  });

  it("runs create through reversal with independent approval, posting and balanced journals", async () => {
    const created = await repository.create(
      maker,
      {
        company_id: companyId,
        approver_user_id: "r06.checker",
        posting_date: postingDate,
        lines: [
          {
            line_order: 1,
            document_date: postingDate,
            from_bank_account_id: sourceBankId,
            to_bank_account_id: destinationBankId,
            external_reference: `MOVE-${suffix}`,
            transfer_mode: "internal",
            details: "Move operating cash to reserve",
            source_amount: "250.00",
            bank_charge_amount: "0",
          },
        ],
      },
      randomUUID(),
      randomUUID(),
    );
    expect(created).toMatchObject({ state: "draft", version: 1, replayed: false });

    const submitted = await repository.submit(
      maker,
      created.id,
      { expected_version: created.version },
      randomUUID(),
      randomUUID(),
    );
    const approved = await repository.decide(
      checker,
      created.id,
      { action: "approve", expected_version: submitted.version, reason: "Verified same-company cash movement" },
      randomUUID(),
      randomUUID(),
    );
    const posted = await repository.post(
      poster,
      created.id,
      { expected_version: approved.version },
      randomUUID(),
      randomUUID(),
    );
    expect(posted).toMatchObject({ state: "posted", version: 4 });

    const journal = await pool.query<{ debit: string; credit: string }>(
      `select coalesce(sum(debit),0)::text as debit,coalesce(sum(credit),0)::text as credit
         from journal_line where tenant_id=$1 and journal_id=$2`,
      [sourceTestTenantId, posted.journal_id],
    );
    expect(journal.rows[0]).toEqual({ debit: "250.00000000", credit: "250.00000000" });

    const reversed = await repository.reverse(
      poster,
      created.id,
      { expected_version: posted.version, reason: "Treasury requested controlled reversal" },
      randomUUID(),
      randomUUID(),
    );
    expect(reversed).toMatchObject({ state: "reversed", version: 5 });
    const detail = await repository.get(maker, created.id);
    expect(detail.timeline.map((event) => event.action)).toEqual([
      "created",
      "submitted",
      "approved",
      "posted",
      "reversed",
    ]);
    expect(detail).toMatchObject({
      state: "reversed",
      created_by: "r06.maker",
      approved_by: "r06.checker",
      posted_by: "r06.target",
      reversed_by: "r06.target",
    });
  }, 60_000);

  it("posts and reverses a cross-currency movement with snapshotted rate and governed charge", async () => {
    const created = await repository.create(
      maker,
      {
        company_id: companyId,
        approver_user_id: "r06.checker",
        posting_date: postingDate,
        lines: [
          {
            line_order: 1,
            document_date: postingDate,
            from_bank_account_id: sourceBankId,
            to_bank_account_id: foreignBankId,
            external_reference: `FX-${suffix}`,
            transfer_mode: "wire_swift",
            details: "Fund foreign reserve account",
            source_amount: "250.00",
            bank_charge_amount: "2.00",
          },
        ],
      },
      randomUUID(),
      randomUUID(),
    );
    const submitted = await repository.submit(
      maker,
      created.id,
      { expected_version: created.version },
      randomUUID(),
      randomUUID(),
    );
    const approved = await repository.decide(
      checker,
      created.id,
      { action: "approve", expected_version: submitted.version, reason: "Verified treasury FX movement" },
      randomUUID(),
      randomUUID(),
    );
    const posted = await repository.post(
      poster,
      created.id,
      { expected_version: approved.version },
      randomUUID(),
      randomUUID(),
    );
    const detail = await repository.get(maker, created.id);
    expect(detail.lines[0]).toMatchObject({
      source_currency: baseCurrency,
      destination_currency: foreignCurrency,
      destination_amount: "200.00000000",
      destination_rate_id: foreignRateId,
      destination_rate: "1.250000000000000000",
      bank_charge_amount: "2.00000000",
    });
    expect(detail.accounting_preview).toMatchObject({
      base_currency: baseCurrency,
      debit_total: "252.00000000",
      credit_total: "252.00000000",
    });
    const journal = await pool.query<{ debit: string; credit: string }>(
      `select coalesce(sum(base_debit),0)::text as debit,coalesce(sum(base_credit),0)::text as credit
         from journal_line where tenant_id=$1 and journal_id=$2`,
      [sourceTestTenantId, posted.journal_id],
    );
    expect(journal.rows[0]).toEqual({ debit: "252.00000000", credit: "252.00000000" });
    await expect(
      repository.reverse(
        poster,
        created.id,
        { expected_version: posted.version, reason: "Reverse controlled FX acceptance movement" },
        randomUUID(),
        randomUUID(),
      ),
    ).resolves.toMatchObject({ state: "reversed", version: 5 });
  }, 60_000);
});
