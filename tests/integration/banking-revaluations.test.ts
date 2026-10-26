import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { SourceBankRevaluationRepository } from "../../server/api/src/modules/banking/revaluations/source-repository.js";
import {
  PostgresBankRevaluationReversalRepository,
  processBankRevaluationReversals,
  type BankRevaluationReversalOptions,
} from "../../server/worker/src/jobs/bank-revaluation-reversal.js";
import {
  ensureCompanyCurrencyFixture,
  ensureSourceAuthorizationFixture,
  ensureSourceSuperAdministratorFixture,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const isolatedDatabase = `bank_revaluation_${randomUUID().replaceAll("-", "")}`;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const companyId = `fxr-revaluation-${suffix}`;
const otherCompanyId = `fxr-revaluation-other-${suffix}`;
const permissions = [
  "banking.revaluation_policy.read",
  "banking.revaluation_policy.manage",
  "banking.revaluation.read",
  "banking.revaluation.create",
  "banking.revaluation.update",
  "banking.revaluation.submit",
] as const;
const cutoffDate = "2026-10-26";
const priorDate = "2026-10-20";
const futureDate = "2026-10-28";

function actorContext(overrides: Partial<BankingActorContext> = {}): BankingActorContext {
  const actor: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId: "r06.maker",
    email: "r06.maker@uat.nexora.invalid",
    displayName: "Bank Revaluation Maker",
    roles: [],
    permissions,
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor, ...overrides };
}

function checkerContext(): BankingActorContext {
  return {
    tenantId: sourceTestTenantId,
    actor: {
      tenantId: sourceTestTenantId,
      organizationName: "Nexora R06 Controlled UAT",
      userId: "r06.checker",
      email: "r06.checker@uat.nexora.invalid",
      displayName: "Bank Revaluation Approver",
      roles: [],
      permissions: ["banking.revaluation.read", "banking.revaluation.approve"],
      sessionVersion: 1,
    },
  };
}

function posterContext(): BankingActorContext {
  return {
    tenantId: sourceTestTenantId,
    actor: {
      tenantId: sourceTestTenantId,
      organizationName: "Nexora R06 Controlled UAT",
      userId: "r06.target",
      email: "r06.target@uat.nexora.invalid",
      displayName: "Bank Revaluation Poster",
      roles: [],
      permissions: ["banking.revaluation.read", "banking.revaluation.post", "banking.revaluation.reverse"],
      sessionVersion: 1,
    },
  };
}

function overrideContext(): BankingActorContext {
  const permissions = [
    "platform.approval.override",
    "banking.revaluation.read",
    "banking.revaluation.create",
    "banking.revaluation.update",
    "banking.revaluation.submit",
    "banking.revaluation.approve",
  ];
  return {
    tenantId: sourceTestTenantId,
    actor: {
      tenantId: sourceTestTenantId,
      organizationName: "Nexora R06 Controlled UAT",
      userId: "r06.override-admin",
      email: "override-admin@uat.nexora.invalid",
      displayName: "Override Administrator",
      roles: ["super_administrator"],
      permissions,
      sessionVersion: 1,
    },
  };
}

const sha = (value: string): string => createHash("sha256").update(value).digest("hex");

run("Bank Revaluation preview and draft authority", () => {
  let bootstrap: DatabasePool;
  let pool: DatabasePool;
  let repository: SourceBankRevaluationRepository;
  let baseCurrency: string;
  let foreignCurrency: string;
  let missingRateCurrency: string;
  const periodId = `fxr-period-${suffix}`;
  const priorPeriodId = `fxr-period-prior-${suffix}`;
  const bankOneId = `fxr-bank-one-${suffix}`;
  const bankTwoId = `fxr-bank-two-${suffix}`;
  const zeroBankId = `fxr-bank-zero-${suffix}`;
  const inactiveBankId = `fxr-bank-inactive-${suffix}`;
  const baseBankId = `fxr-bank-base-${suffix}`;
  const bankOneLedger = `fxr-ledger-one-${suffix}`;
  const bankTwoLedger = `fxr-ledger-two-${suffix}`;
  const zeroBankLedger = `fxr-ledger-zero-${suffix}`;
  const inactiveBankLedger = `fxr-ledger-inactive-${suffix}`;
  const baseBankLedger = `fxr-ledger-base-${suffix}`;
  const counterLedger = `fxr-ledger-counter-${suffix}`;
  const gainLedger = `fxr-ledger-gain-${suffix}`;
  const lossLedger = `fxr-ledger-loss-${suffix}`;

  async function insertBank(id: string, ledgerId: string, currency: string, reference: string): Promise<void> {
    await pool.query(
      `insert into bank_account
        (id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,account_name,
         account_type,account_number_masked,account_number_ciphertext,account_number_nonce,
         account_number_hash,encryption_key_version,overdraft_limit,row_version,created_by,
         submitted_by,submitted_at,submission_reason,approved_by,approved_at,decision_reason,updated_at)
       values($1,$2,$3,$4,'Synthetic FX Bank',$5,'active',clock_timestamp(),$6,$7,'current',
              '**** 2468',$8,$9,$10,'integration-v1',0,1,'r06.maker',
              'r06.maker',clock_timestamp(),'Controlled FXR setup','r06.checker',clock_timestamp(),
              'Controlled independent approval',clock_timestamp())`,
      [
        id,
        sourceTestTenantId,
        companyId,
        ledgerId,
        currency,
        reference,
        `${reference} Account`,
        Buffer.alloc(24, reference.charCodeAt(0)),
        Buffer.alloc(12, reference.charCodeAt(reference.length - 1)),
        sha(`${id}-account`),
      ],
    );
  }

  async function postJournal(input: {
    id: string;
    postingDate: string;
    periodId?: string;
    lines: ReadonlyArray<{
      accountId: string;
      debit: string;
      credit: string;
      baseDebit: string;
      baseCredit: string;
    }>;
  }): Promise<void> {
    await pool.query(
      `insert into journal_entry
        (id,tenant_id,company_id,created_by,posting_date,period_id,source_type,source_id,status,created_at)
       values($1,$2,$3,'r06.maker',$4,$5,'integration.bank_fx_revaluation',$1,'draft',clock_timestamp())`,
      [input.id, sourceTestTenantId, companyId, input.postingDate, input.periodId ?? periodId],
    );
    for (const [index, line] of input.lines.entries()) {
      await pool.query(
        `insert into journal_line
          (id,journal_id,tenant_id,line_number,account_id,debit,credit,currency,fx_rate,base_debit,base_credit,dimensions)
         values($1,$2,$3,$4,$5,$6,$7,$8,277,$9,$10,'{}')`,
        [
          `${input.id}-line-${index + 1}`,
          input.id,
          sourceTestTenantId,
          index + 1,
          line.accountId,
          line.debit,
          line.credit,
          foreignCurrency,
          line.baseDebit,
          line.baseCredit,
        ],
      );
    }
    await pool.query(
      `update journal_entry set status='posted',entry_number=$3,posted_at=clock_timestamp()
        where tenant_id=$1 and id=$2`,
      [sourceTestTenantId, input.id, `FXJ-${input.id}`.slice(0, 128)],
    );
  }

  beforeAll(async () => {
    bootstrap = createDatabasePool(databaseUrl!);
    expect(isolatedDatabase).toMatch(/^bank_revaluation_[a-f0-9]{32}$/);
    await bootstrap.query(`create database ${isolatedDatabase}`);
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.pathname = `/${isolatedDatabase}`;
    pool = createDatabasePool(isolatedUrl.toString());
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);
    await ensureSourceSuperAdministratorFixture(pool);

    const base = await pool.query<{ code: string }>(
      "select code from currency where tenant_id=$1 and status='active' and is_base order by code limit 1",
      [sourceTestTenantId],
    );
    baseCurrency = base.rows[0]?.code ?? "USD";
    if (!base.rows[0])
      await pool.query(
        "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'USD','US Dollar',2,true,'active')",
        [sourceTestTenantId],
      );
    const foreign = await pool.query<{ code: string; name: string; decimal_places: number }>(
      `select code,name,decimal_places from currency_catalog
        where status='active' and code<>$1
        order by case when code='AED' then 0 else 1 end,code limit 2`,
      [baseCurrency],
    );
    foreignCurrency = foreign.rows[0]!.code;
    missingRateCurrency = foreign.rows[1]!.code;
    for (const currency of foreign.rows) {
      await pool.query(
        `insert into currency
          (tenant_id,code,name,decimal_places,is_base,status,catalog_code,row_version,adopted_by,adopted_at)
         values($1,$2,$3,$4,false,'active',$2,1,'r06.maker',clock_timestamp())
         on conflict(tenant_id,code) do nothing`,
        [sourceTestTenantId, currency.code, currency.name, currency.decimal_places],
      );
    }

    await pool.query(
      `insert into organization_unit(id,tenant_id,parent_id,type,code,name,status)
       values($1,$3,null,'company',$4,'FXR Revaluation Company','active'),
             ($2,$3,null,'company',$5,'FXR Revaluation Other Company','active')`,
      [companyId, otherCompanyId, sourceTestTenantId, `FXR-${suffix}`, `FXR-O-${suffix}`],
    );
    await ensureCompanyCurrencyFixture(pool, companyId, baseCurrency, [foreignCurrency, missingRateCurrency]);
    await ensureCompanyCurrencyFixture(pool, otherCompanyId, baseCurrency, [foreignCurrency]);

    const grants = [
      ["r06-uat-policy-maker", [...permissions, "banking.revaluation.approve"]],
      ["r06-uat-policy-checker", ["banking.revaluation.read", "banking.revaluation.approve"]],
      [
        "r06-uat-policy-payment-poster",
        ["banking.revaluation.read", "banking.revaluation.post", "banking.revaluation.reverse"],
      ],
      [
        "r06-uat-policy-approval-override",
        [
          "platform.approval.override",
          "banking.revaluation.read",
          "banking.revaluation.create",
          "banking.revaluation.update",
          "banking.revaluation.submit",
          "banking.revaluation.approve",
        ],
      ],
    ] as const;
    for (const [policyId, grantedPermissions] of grants) {
      await pool.query(
        `insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
         select $1,$2,permission,'all' from unnest($3::text[]) permission on conflict do nothing`,
        [sourceTestTenantId, policyId, grantedPermissions],
      );
      await pool.query(
        `insert into security_role_scope_grant
          (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
         select $1,$2,permission,'company',$4 from unnest($3::text[]) permission on conflict do nothing`,
        [sourceTestTenantId, policyId, grantedPermissions, companyId],
      );
    }
    for (const userId of ["r06.maker", "r06.checker", "r06.target", "r06.override-admin"]) {
      await pool.query(
        `insert into security_user_company_access
          (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
         values($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','bank-revaluation-integration')`,
        [sourceTestTenantId, `fxr-access-${userId}-${suffix}`, userId, companyId],
      );
    }

    await pool.query(
      `insert into fiscal_calendar(id,tenant_id,company_id,year,period_start,period_end,status)
       values($1,$2,$3,2026,date '2026-01-01',date '2026-12-31','active')`,
      [`fxr-calendar-${suffix}`, sourceTestTenantId, companyId],
    );
    await pool.query(
      `insert into financial_period
        (id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at)
       values($1,$2,$3,$4,9,date '2026-09-01',date '2026-09-30','open',clock_timestamp())`,
      [priorPeriodId, sourceTestTenantId, companyId, `fxr-calendar-${suffix}`],
    );
    await pool.query(
      `insert into financial_period
        (id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at)
       values($1,$2,$3,$4,10,date '2026-10-01',date '2026-10-31','open',clock_timestamp())`,
      [periodId, sourceTestTenantId, companyId, `fxr-calendar-${suffix}`],
    );
    await pool.query(
      `insert into financial_period
        (id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at)
       values($1,$2,$3,$4,11,date '2026-11-01',date '2026-11-30','open',clock_timestamp())`,
      [`fxr-period-next-${suffix}`, sourceTestTenantId, companyId, `fxr-calendar-${suffix}`],
    );

    await pool.query(
      `insert into account
        (id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,
         manual_posting_allowed,is_system_account,reconciliation_required,created_at)
       values
        ($1,$9,$10,$11,'FX Bank One','asset',false,'[]','active',true,false,true,clock_timestamp()),
        ($2,$9,$10,$12,'FX Bank Two','asset',false,'[]','active',true,false,true,clock_timestamp()),
        ($3,$9,$10,$13,'FX Bank Zero','asset',false,'[]','active',true,false,true,clock_timestamp()),
        ($4,$9,$10,$14,'FX Bank Inactive','asset',false,'[]','active',true,false,true,clock_timestamp()),
        ($5,$9,$10,$15,'Base Bank','asset',false,'[]','active',true,false,true,clock_timestamp()),
        ($6,$9,$10,$16,'FX Counter','liability',false,'[]','active',true,false,false,clock_timestamp()),
        ($7,$9,$10,$17,'Unrealized FX Gain','revenue',false,'[]','active',true,false,false,clock_timestamp()),
        ($8,$9,$10,$18,'Unrealized FX Loss','expense',false,'[]','active',true,false,false,clock_timestamp())`,
      [
        bankOneLedger,
        bankTwoLedger,
        zeroBankLedger,
        inactiveBankLedger,
        baseBankLedger,
        counterLedger,
        gainLedger,
        lossLedger,
        sourceTestTenantId,
        companyId,
        `FXB1-${suffix}`,
        `FXB2-${suffix}`,
        `FXBZ-${suffix}`,
        `FXBI-${suffix}`,
        `FXBB-${suffix}`,
        `FXBC-${suffix}`,
        `FXBG-${suffix}`,
        `FXBL-${suffix}`,
      ],
    );
    await insertBank(bankOneId, bankOneLedger, foreignCurrency, `FXB1-${suffix}`);
    await insertBank(bankTwoId, bankTwoLedger, foreignCurrency, `FXB2-${suffix}`);
    await insertBank(zeroBankId, zeroBankLedger, foreignCurrency, `FXBZ-${suffix}`);
    await insertBank(inactiveBankId, inactiveBankLedger, foreignCurrency, `FXBI-${suffix}`);
    await insertBank(baseBankId, baseBankLedger, baseCurrency, `FXBB-${suffix}`);
    await pool.query(
      `update bank_account set status='inactive',deactivated_by='r06.maker',deactivated_at=clock_timestamp(),
              row_version=row_version+1,updated_at=clock_timestamp()
        where tenant_id=$1 and company_id=$2 and id=$3`,
      [sourceTestTenantId, companyId, inactiveBankId],
    );

    await pool.query(
      `insert into bank_revaluation_policy
        (tenant_id,company_id,id,unrealized_gain_nominal_id,unrealized_loss_nominal_id,
         reversal_mode,status,row_version,created_by,updated_by)
       values($1,$2,$3,$4,$5,'next_open_period_first_day','active',1,'r06.maker','r06.maker')`,
      [sourceTestTenantId, companyId, `fxr-policy-${suffix}`, gainLedger, lossLedger],
    );

    const originalRateId = `fxr-rate-old-${suffix}`;
    const correctedRateId = `fxr-rate-new-${suffix}`;
    await pool.query(
      `insert into currency_rate
        (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,
         created_by,reason,updated_at)
       values($1,$2,$3,$4,$5,275,date '2026-10-20','active',1,'r06.maker','Initial controlled rate',clock_timestamp())`,
      [originalRateId, sourceTestTenantId, companyId, foreignCurrency, baseCurrency],
    );
    await pool.query(
      `update currency_rate set status='superseded',row_version=row_version+1,updated_at=clock_timestamp()
        where tenant_id=$1 and company_id=$2 and id=$3`,
      [sourceTestTenantId, companyId, originalRateId],
    );
    await pool.query(
      `insert into currency_rate
        (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,
         supersedes_rate_id,created_by,reason,updated_at)
       values($1,$2,$3,$4,$5,277,date '2026-10-20','active',1,$6,'r06.maker',
              'Corrected controlled closing rate',clock_timestamp())`,
      [correctedRateId, sourceTestTenantId, companyId, foreignCurrency, baseCurrency, originalRateId],
    );

    await postJournal({
      id: `fxr-journal-cutoff-${suffix}`,
      postingDate: priorDate,
      lines: [
        { accountId: bankOneLedger, debit: "1000", credit: "0", baseDebit: "275000", baseCredit: "0" },
        { accountId: bankTwoLedger, debit: "0", credit: "100", baseDebit: "0", baseCredit: "27500" },
        { accountId: counterLedger, debit: "0", credit: "900", baseDebit: "0", baseCredit: "247500" },
      ],
    });
    await postJournal({
      id: `fxr-journal-future-${suffix}`,
      postingDate: futureDate,
      lines: [
        { accountId: bankOneLedger, debit: "500", credit: "0", baseDebit: "138500", baseCredit: "0" },
        { accountId: counterLedger, debit: "0", credit: "500", baseDebit: "0", baseCredit: "138500" },
      ],
    });
    await postJournal({
      id: `fxr-journal-inactive-${suffix}`,
      postingDate: priorDate,
      lines: [
        { accountId: inactiveBankLedger, debit: "50", credit: "0", baseDebit: "13750", baseCredit: "0" },
        { accountId: counterLedger, debit: "0", credit: "50", baseDebit: "0", baseCredit: "13750" },
      ],
    });
    repository = new SourceBankRevaluationRepository(pool);
  }, 90_000);

  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${isolatedDatabase}`);
      await bootstrap.end();
    }
  });

  it("returns only live company-scoped independent approvers for the draft form", async () => {
    const options = await repository.approverOptions(actorContext(), {
      company_id: companyId,
      kind: "approver",
      limit: 50,
    });
    expect(options.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "r06.checker", eligible: true, self_approval: false })]),
    );
    expect(options.items.map((item) => item.id)).not.toContain("r06.maker");
  });

  it("previews corrected-rate gains, losses and zero balances at the posting-date cutoff without N+1 omissions", async () => {
    const preview = await repository.preview(actorContext(), {
      company_id: companyId,
      currency: foreignCurrency,
      revaluation_date: cutoffDate,
    });

    expect(preview.rate_snapshot).toMatchObject({
      rate_id: `fxr-rate-new-${suffix}`,
      rate: "277.000000000000000000",
      effective_date: "2026-10-20",
      revision_version: 1,
    });
    expect(preview.lines).toHaveLength(3);
    expect(preview.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bank_account_id: bankOneId,
          foreign_balance: "1000.00000000",
          carrying_base_balance: "275000.00000000",
          revalued_base_balance: "277000.00",
          adjustment: "2000.00",
          direction: "gain",
        }),
        expect.objectContaining({
          bank_account_id: bankTwoId,
          foreign_balance: "-100.00000000",
          revalued_base_balance: "-27700.00",
          adjustment: "-200.00",
          direction: "loss",
        }),
        expect.objectContaining({
          bank_account_id: zeroBankId,
          foreign_balance: "0.00000000",
          adjustment: "0.00",
          direction: "none",
        }),
      ]),
    );
    expect(preview.lines.map((line) => line.bank_account_id)).not.toContain(inactiveBankId);
    expect(preview.lines.map((line) => line.bank_account_id)).not.toContain(baseBankId);
    expect(preview.totals).toEqual({
      foreign_balance: "900.00000000",
      carrying_base_balance: "247500.00",
      revalued_base_balance: "249300.00",
      total_gain: "2000.00",
      total_loss: "200.00",
      net_gain_loss: "1800.00",
    });
  });

  it("fails closed for a missing rate, base currency and another company outside live scope", async () => {
    const unauthorized = actorContext({
      actor: { ...actorContext().actor, permissions: [] },
    });
    await expect(
      repository.preview(unauthorized, {
        company_id: companyId,
        currency: foreignCurrency,
        revaluation_date: cutoffDate,
      }),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    await expect(
      repository.preview(actorContext(), {
        company_id: companyId,
        currency: missingRateCurrency,
        revaluation_date: cutoffDate,
      }),
    ).rejects.toMatchObject({ status: 409, code: "REVALUATION_RATE_MISSING" });
    await pool.query(
      `update company_currency
          set status='inactive',row_version=row_version+1,updated_by='r06.maker',updated_at=clock_timestamp()
        where tenant_id=$1 and company_id=$2 and currency_code=$3`,
      [sourceTestTenantId, companyId, missingRateCurrency],
    );
    await expect(
      repository.preview(actorContext(), {
        company_id: companyId,
        currency: missingRateCurrency,
        revaluation_date: cutoffDate,
      }),
    ).rejects.toMatchObject({ status: 409, code: "REVALUATION_CURRENCY_INACTIVE" });
    await expect(
      repository.preview(actorContext(), {
        company_id: companyId,
        currency: baseCurrency,
        revaluation_date: cutoffDate,
      }),
    ).rejects.toMatchObject({ status: 400, code: "REVALUATION_BASE_CURRENCY_INVALID" });
    await expect(
      repository.preview(actorContext(), {
        company_id: otherCompanyId,
        currency: foreignCurrency,
        revaluation_date: cutoffDate,
      }),
    ).rejects.toMatchObject({ status: 403, code: "COMPANY_ACCESS_DENIED" });
  });

  it("creates, reads, lists and updates one audited draft with replay and stale-version protection", async () => {
    const createKey = randomUUID();
    const created = await repository.create(
      actorContext(),
      {
        company_id: companyId,
        currency: foreignCurrency,
        revaluation_date: cutoffDate,
        external_reference: `FXR-EXT-${suffix}`,
        narration: "Month-end foreign Bank balance revaluation",
        approver_user_id: "r06.checker",
      },
      createKey,
      randomUUID(),
    );
    expect(created).toMatchObject({ state: "draft", version: 1, replayed: false });
    const replayed = await repository.create(
      actorContext(),
      {
        company_id: companyId,
        currency: foreignCurrency,
        revaluation_date: cutoffDate,
        external_reference: `FXR-EXT-${suffix}`,
        narration: "Month-end foreign Bank balance revaluation",
        approver_user_id: "r06.checker",
      },
      createKey,
      randomUUID(),
    );
    expect(replayed).toMatchObject({ id: created.id, audit_event_id: created.audit_event_id, replayed: true });
    await expect(
      repository.create(
        actorContext(),
        {
          company_id: companyId,
          currency: foreignCurrency,
          revaluation_date: cutoffDate,
          narration: "Conflicting use of an existing idempotency key",
        },
        createKey,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });

    const detail = await repository.get(actorContext(), created.id);
    expect(detail).toMatchObject({
      id: created.id,
      state: "draft",
      version: 1,
      maker_user_id: "r06.maker",
      gain_loss_amount: "1800.00000000",
      source_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(detail.lines).toHaveLength(3);
    await expect(
      repository.list(actorContext(), { company_id: companyId, currency: foreignCurrency, limit: 1 }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ id: created.id })] });

    const updated = await repository.update(
      actorContext(),
      created.id,
      { expected_version: 1, narration: "Reviewed month-end foreign Bank balances" },
      randomUUID(),
      randomUUID(),
    );
    expect(updated).toMatchObject({ state: "draft", version: 2 });
    await expect(
      repository.update(
        actorContext(),
        created.id,
        { expected_version: 1, narration: "Stale update" },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409, code: "REVALUATION_VERSION_CONFLICT" });
  });

  it("requires a refreshed draft when posted balance evidence changes, then submits the recalculated snapshot", async () => {
    const created = await repository.create(
      actorContext(),
      {
        company_id: companyId,
        currency: foreignCurrency,
        revaluation_date: "2026-10-25",
        narration: "Refresh-required evidence test",
        approver_user_id: "r06.checker",
      },
      randomUUID(),
      randomUUID(),
    );
    await postJournal({
      id: `fxr-journal-change-${suffix}`,
      postingDate: "2026-10-25",
      lines: [
        { accountId: bankOneLedger, debit: "10", credit: "0", baseDebit: "2750", baseCredit: "0" },
        { accountId: counterLedger, debit: "0", credit: "10", baseDebit: "0", baseCredit: "2750" },
      ],
    });
    await expect(
      repository.submit(
        actorContext(),
        created.id,
        { expected_version: 1, reason: "Submit after source review" },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409, code: "REVALUATION_REFRESH_REQUIRED" });
    const refreshed = await repository.update(
      actorContext(),
      created.id,
      { expected_version: 1, narration: "Refreshed after posted balance change" },
      randomUUID(),
      randomUUID(),
    );
    const submitted = await repository.submit(
      actorContext(),
      created.id,
      { expected_version: refreshed.version, reason: "Evidence refreshed and ready for approval" },
      randomUUID(),
      randomUUID(),
    );
    expect(submitted).toMatchObject({ state: "submitted", version: 3, replayed: false });
    const events = await pool.query<{ event_type: string; record_version: string }>(
      `select event_type,record_version::text from bank_revaluation_event
        where tenant_id=$1 and revaluation_id=$2 order by record_version`,
      [sourceTestTenantId, created.id],
    );
    expect(events.rows).toEqual([
      { event_type: "created", record_version: "1" },
      { event_type: "updated", record_version: "2" },
      { event_type: "submitted", record_version: "3" },
    ]);
  });

  it("prevents ordinary self-approval at submit even when the maker role carries the decision permission", async () => {
    const created = await repository.create(
      actorContext(),
      {
        company_id: companyId,
        currency: foreignCurrency,
        revaluation_date: "2026-10-22",
        narration: "Self-approval separation test",
        approver_user_id: "r06.maker",
      },
      randomUUID(),
      randomUUID(),
    );
    await expect(
      repository.submit(
        actorContext(),
        created.id,
        { expected_version: created.version, reason: "Attempt ordinary self-approval" },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 400, code: "REVALUATION_APPROVER_INELIGIBLE" });
  });

  it("rejects, revises, independently approves and posts one balanced base-currency journal with a durable schedule", async () => {
    const created = await repository.create(
      actorContext(),
      {
        company_id: companyId,
        currency: foreignCurrency,
        revaluation_date: "2026-10-24",
        narration: "Independent lifecycle and posting test",
        approver_user_id: "r06.checker",
      },
      randomUUID(),
      randomUUID(),
    );
    const firstSubmission = await repository.submit(
      actorContext(),
      created.id,
      { expected_version: created.version, reason: "Ready for initial checker review" },
      randomUUID(),
      randomUUID(),
    );
    await expect(
      repository.decide(
        actorContext({
          actor: { ...actorContext().actor, permissions: [...permissions, "banking.revaluation.approve"] },
        }),
        created.id,
        { expected_version: firstSubmission.version, action: "approve", reason: "Maker cannot replace checker" },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403, code: "REVALUATION_ASSIGNED_APPROVER_REQUIRED" });
    const rejected = await repository.decide(
      checkerContext(),
      created.id,
      { expected_version: firstSubmission.version, action: "reject", reason: "Refresh narration before approval" },
      randomUUID(),
      randomUUID(),
    );
    expect(rejected).toMatchObject({ state: "rejected", version: 3, journal_entry_id: null });
    const revised = await repository.update(
      actorContext(),
      created.id,
      { expected_version: rejected.version, narration: "Narration refreshed after checker review" },
      randomUUID(),
      randomUUID(),
    );
    expect(revised).toMatchObject({ state: "draft", version: 4 });
    const resubmitted = await repository.submit(
      actorContext(),
      created.id,
      { expected_version: revised.version, reason: "Revised draft ready for approval" },
      randomUUID(),
      randomUUID(),
    );
    const approved = await repository.decide(
      checkerContext(),
      created.id,
      { expected_version: resubmitted.version, action: "approve", reason: "Balances and policy evidence verified" },
      randomUUID(),
      randomUUID(),
    );
    expect(approved).toMatchObject({ state: "approved", version: 6, journal_entry_id: null });
    const beforePost = await repository.get(actorContext(), created.id);
    expect(beforePost.accounting_preview).toMatchObject({
      currency: baseCurrency,
      debit_total: "2200",
      credit_total: "2200",
      balanced: true,
    });
    expect(beforePost.accounting_preview?.lines).toHaveLength(4);
    expect(beforePost.accounting_preview?.lines.map((line) => line.nominal_id)).not.toContain(zeroBankLedger);

    const postKey = randomUUID();
    const posted = await repository.post(
      posterContext(),
      created.id,
      { expected_version: approved.version },
      postKey,
      randomUUID(),
    );
    expect(posted).toMatchObject({
      state: "posted",
      version: 7,
      journal_entry_id: expect.any(String),
      reversal_scheduled_date: "2026-11-01",
      replayed: false,
    });
    const replayed = await repository.post(
      posterContext(),
      created.id,
      { expected_version: approved.version },
      postKey,
      randomUUID(),
    );
    expect(replayed).toMatchObject({ id: created.id, journal_entry_id: posted.journal_entry_id, replayed: true });

    const journal = await pool.query<{
      source_type: string;
      status: string;
      line_count: number;
      currencies: string[];
      debit: string;
      credit: string;
    }>(
      `select event.source_type,journal.status,count(line.id)::integer as line_count,
              array_agg(distinct line.currency order by line.currency) as currencies,
              sum(line.base_debit)::text as debit,sum(line.base_credit)::text as credit
         from journal_entry journal
         join accounting_event event
           on event.tenant_id=journal.tenant_id and event.id=journal.source_id
         join journal_line line on line.tenant_id=journal.tenant_id and line.journal_id=journal.id
        where journal.tenant_id=$1 and journal.id=$2
        group by event.source_type,journal.status`,
      [sourceTestTenantId, posted.journal_entry_id],
    );
    expect(journal.rows[0]).toEqual({
      source_type: "bank_fx_revaluation",
      status: "posted",
      line_count: 4,
      currencies: [baseCurrency],
      debit: "2200.00000000",
      credit: "2200.00000000",
    });
    await expect(repository.get(actorContext(), created.id)).resolves.toMatchObject({
      state: "posted",
      reversal_state: "pending",
    });

    const afterPosting = await repository.preview(actorContext(), {
      company_id: companyId,
      currency: foreignCurrency,
      revaluation_date: "2026-10-24",
    });
    expect(afterPosting.totals).toMatchObject({
      foreign_balance: "900.00000000",
      net_gain_loss: "0.00",
    });
    await expect(
      repository.preview(actorContext(), {
        company_id: companyId,
        currency: foreignCurrency,
        revaluation_date: "2026-11-02",
      }),
    ).rejects.toMatchObject({ status: 409, code: "REVALUATION_PRIOR_REVERSAL_UNRESOLVED" });
  });

  it("records immutable audited evidence for a governed Super Administrator self-decision", async () => {
    const administrator = overrideContext();
    const created = await repository.create(
      administrator,
      {
        company_id: companyId,
        currency: foreignCurrency,
        revaluation_date: "2026-10-21",
        narration: "Controlled Super Administrator override test",
        approver_user_id: administrator.actor.userId,
      },
      randomUUID(),
      randomUUID(),
    );
    const submitted = await repository.submit(
      administrator,
      created.id,
      { expected_version: created.version, reason: "Controlled localhost override test" },
      randomUUID(),
      randomUUID(),
    );
    const approved = await repository.decide(
      administrator,
      created.id,
      { expected_version: submitted.version, action: "approve", reason: "Audited controlled test approval" },
      randomUUID(),
      randomUUID(),
    );
    expect(approved).toMatchObject({ state: "approved", version: 3 });
    const evidence = await pool.query<{ super_admin_override_used: boolean; decision_evidence_id: string | null }>(
      `select super_admin_override_used,decision_evidence_id from bank_revaluation
        where tenant_id=$1 and id=$2`,
      [sourceTestTenantId, created.id],
    );
    expect(evidence.rows[0]).toMatchObject({
      super_admin_override_used: true,
      decision_evidence_id: expect.stringMatching(/^approval-override-/),
    });
    const immutableEvent = await pool.query<{ count: string }>(
      `select count(*)::text as count from approval_override_event
        where tenant_id=$1 and event_id=$2 and resource_type='banking.revaluation'`,
      [sourceTestTenantId, evidence.rows[0]!.decision_evidence_id],
    );
    expect(immutableEvent.rows[0]?.count).toBe("1");
  });

  it("reverses a due posting once through an exact compensating Finance journal", async () => {
    await pool.query(
      `insert into currency_rate
        (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,
         created_by,reason,updated_at)
       values($1,$2,$3,$4,$5,276,date '2026-09-01','active',1,'r06.maker',
              'Prior-period controlled closing rate',clock_timestamp())`,
      [`fxr-rate-prior-${suffix}`, sourceTestTenantId, companyId, foreignCurrency, baseCurrency],
    );
    await postJournal({
      id: `fxr-journal-prior-${suffix}`,
      postingDate: "2026-09-20",
      periodId: priorPeriodId,
      lines: [
        { accountId: bankOneLedger, debit: "100", credit: "0", baseDebit: "27500", baseCredit: "0" },
        { accountId: counterLedger, debit: "0", credit: "100", baseDebit: "0", baseCredit: "27500" },
      ],
    });
    const created = await repository.create(
      actorContext(),
      {
        company_id: companyId,
        currency: foreignCurrency,
        revaluation_date: "2026-09-30",
        narration: "Due automatic reversal evidence test",
        approver_user_id: "r06.checker",
      },
      randomUUID(),
      randomUUID(),
    );
    const submitted = await repository.submit(
      actorContext(),
      created.id,
      { expected_version: created.version, reason: "Prior-period balance ready for approval" },
      randomUUID(),
      randomUUID(),
    );
    const approved = await repository.decide(
      checkerContext(),
      created.id,
      { expected_version: submitted.version, action: "approve", reason: "Prior-period calculation verified" },
      randomUUID(),
      randomUUID(),
    );
    const posted = await repository.post(
      posterContext(),
      created.id,
      { expected_version: approved.version },
      randomUUID(),
      randomUUID(),
    );
    expect(posted).toMatchObject({ state: "posted", reversal_scheduled_date: "2026-10-01" });
    await pool.query("update financial_period set status='closed' where tenant_id=$1 and id=$2", [
      sourceTestTenantId,
      periodId,
    ]);
    const reversalRepository = new PostgresBankRevaluationReversalRepository(pool);
    const workerOptions: BankRevaluationReversalOptions = {
      now: new Date("2026-10-26T12:00:00.000Z"),
      actorId: "r06.target",
      workerId: "fxr-worker-closed-period",
      tenantLimit: 100,
      claimLimit: 10,
      claimLeaseMs: 60_000,
      retryBaseMs: 30_000,
      retryMaximumMs: 300_000,
    };
    await expect(processBankRevaluationReversals(workerOptions, reversalRepository)).resolves.toMatchObject({
      claimed: 1,
      reversed: 0,
      pending: 1,
      failed: 0,
    });
    const unavailable = await pool.query<{ state: string; attempt_count: number; last_error_code: string }>(
      `select state,attempt_count,last_error_code from bank_revaluation_reversal_schedule
        where tenant_id=$1 and revaluation_id=$2`,
      [sourceTestTenantId, created.id],
    );
    expect(unavailable.rows[0]).toEqual({
      state: "pending",
      attempt_count: 1,
      last_error_code: "REVALUATION_REVERSAL_PERIOD_NOT_OPEN",
    });
    await pool.query("update financial_period set status='open' where tenant_id=$1 and id=$2", [
      sourceTestTenantId,
      periodId,
    ]);
    const concurrentResults = await Promise.all([
      processBankRevaluationReversals(
        { ...workerOptions, now: new Date("2026-10-26T12:01:00.000Z"), workerId: "fxr-worker-a" },
        new PostgresBankRevaluationReversalRepository(pool),
      ),
      processBankRevaluationReversals(
        { ...workerOptions, now: new Date("2026-10-26T12:01:00.000Z"), workerId: "fxr-worker-b" },
        new PostgresBankRevaluationReversalRepository(pool),
      ),
    ]);
    expect(concurrentResults.reduce((total, result) => total + result.claimed, 0)).toBe(1);
    expect(concurrentResults.reduce((total, result) => total + result.reversed, 0)).toBe(1);
    await expect(
      processBankRevaluationReversals(
        { ...workerOptions, now: new Date("2026-10-26T12:02:00.000Z"), workerId: "fxr-worker-restart" },
        new PostgresBankRevaluationReversalRepository(pool),
      ),
    ).resolves.toMatchObject({ claimed: 0, reversed: 0 });
    await expect(repository.get(posterContext(), created.id)).resolves.toMatchObject({
      state: "reversed",
      version: 5,
      reversal_state: "posted",
    });

    const journals = await pool.query<{
      status: string;
      debit: string;
      credit: string;
      reversal_journal_entry_id: string | null;
      schedule_state: string;
      attempt_count: number;
    }>(
      `select original.status,sum(reversal_line.base_debit)::text as debit,
              sum(reversal_line.base_credit)::text as credit,
              revaluation.reversal_journal_entry_id,schedule.state as schedule_state,
              schedule.attempt_count
         from bank_revaluation revaluation
         join journal_entry original
           on original.tenant_id=revaluation.tenant_id and original.id=revaluation.journal_entry_id
         join bank_revaluation_reversal_schedule schedule
           on schedule.tenant_id=revaluation.tenant_id and schedule.revaluation_id=revaluation.id
         join journal_line reversal_line
           on reversal_line.tenant_id=revaluation.tenant_id
          and reversal_line.journal_id=revaluation.reversal_journal_entry_id
        where revaluation.tenant_id=$1 and revaluation.id=$2
        group by original.status,revaluation.reversal_journal_entry_id,schedule.state,schedule.attempt_count`,
      [sourceTestTenantId, created.id],
    );
    expect(journals.rows[0]).toMatchObject({
      status: "reversed",
      debit: "100.00000000",
      credit: "100.00000000",
      reversal_journal_entry_id: expect.any(String),
      schedule_state: "posted",
      attempt_count: 2,
    });
    const reportFeed = await pool.query<{
      base_currency: string;
      september_balance: string;
      october_balance: string;
      raw_october_balance: string;
    }>(
      `select profile.base_currency,
              coalesce(sum(case when journal.posting_date<=date '2026-09-30'
                                then line.base_debit-line.base_credit else 0 end),0)::text as september_balance,
              coalesce(sum(case when journal.posting_date<=date '2026-10-31'
                                then line.base_debit-line.base_credit else 0 end),0)::text as october_balance,
              coalesce(sum(case when journal.posting_date<=date '2026-10-31'
                                then line.debit-line.credit else 0 end),0)::text as raw_october_balance
         from company_currency_profile profile
         join journal_entry journal
           on journal.tenant_id=profile.tenant_id and journal.company_id=profile.company_id
          and journal.status in ('posted','reversed')
         join journal_line line
           on line.tenant_id=journal.tenant_id and line.journal_id=journal.id
          and line.account_id=$4
        where profile.tenant_id=$1 and profile.company_id=$2
          and journal.id=any($3::text[])
        group by profile.base_currency`,
      [
        sourceTestTenantId,
        companyId,
        [`fxr-journal-prior-${suffix}`, posted.journal_entry_id, journals.rows[0]!.reversal_journal_entry_id],
        bankOneLedger,
      ],
    );
    expect(reportFeed.rows[0]).toEqual({
      base_currency: baseCurrency,
      september_balance: "27600.00000000",
      october_balance: "27500.00000000",
      raw_october_balance: "100.00000000",
    });
    const reversalCount = await pool.query<{ count: string }>(
      `select count(*)::text as count from accounting_event
        where tenant_id=$1 and source_type='bank_fx_revaluation'
          and source_id=$2 and event_type='bank_fx_revaluation.reversed'`,
      [sourceTestTenantId, created.id],
    );
    expect(reversalCount.rows[0]?.count).toBe("1");
    const workerEvents = await pool.query<{ event_type: string; count: number }>(
      `select event_type,count(*)::integer as count from bank_revaluation_event
        where tenant_id=$1 and revaluation_id=$2 and event_type in ('reversal_failed','reversed')
        group by event_type order by event_type`,
      [sourceTestTenantId, created.id],
    );
    expect(workerEvents.rows).toEqual([
      { event_type: "reversal_failed", count: 1 },
      { event_type: "reversed", count: 1 },
    ]);
  });

  it("serves versioned company policy and bounded immutable lifecycle events", async () => {
    const policy = await repository.getPolicy(actorContext(), companyId);
    expect(policy).toMatchObject({
      company_id: companyId,
      unrealized_gain_nominal_id: gainLedger,
      unrealized_loss_nominal_id: lossLedger,
      status: "active",
      version: 1,
    });
    const policyKey = randomUUID();
    const changed = await repository.upsertPolicy(
      actorContext(),
      {
        company_id: companyId,
        expected_version: policy.version,
        unrealized_gain_nominal_id: gainLedger,
        unrealized_loss_nominal_id: lossLedger,
        status: "active",
        reason: "Verify governed policy API revision",
      },
      policyKey,
      randomUUID(),
    );
    expect(changed).toMatchObject({ version: 2, replayed: false });
    await expect(
      repository.upsertPolicy(
        actorContext(),
        {
          company_id: companyId,
          expected_version: policy.version,
          unrealized_gain_nominal_id: gainLedger,
          unrealized_loss_nominal_id: lossLedger,
          status: "active",
          reason: "Verify governed policy API revision",
        },
        policyKey,
        randomUUID(),
      ),
    ).resolves.toMatchObject({ version: 2, replayed: true });

    const created = await repository.create(
      actorContext(),
      {
        company_id: companyId,
        currency: foreignCurrency,
        revaluation_date: "2026-10-23",
        narration: "Immutable event directory evidence",
        approver_user_id: "r06.checker",
      },
      randomUUID(),
      randomUUID(),
    );
    const events = await repository.listEvents(actorContext(), created.id, { limit: 1 });
    expect(events.items).toHaveLength(1);
    expect(events.items[0]).toMatchObject({
      revaluation_id: created.id,
      event_type: "created",
      actor_user_id: "r06.maker",
    });
    expect(events.next_cursor).toBeNull();
    await expect(
      repository.listEvents(actorContext(), created.id, { limit: 1, cursor: "not-a-cursor" }),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_CURSOR" });
  });
});
