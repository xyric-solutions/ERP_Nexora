import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { BankingIdentifierCrypto } from "../../server/api/src/modules/banking/crypto.js";
import { SourceBankPaymentRepository } from "../../server/api/src/modules/banking/payments/source-repository.js";
import {
  BankingApiError,
  SourceBankingRepository,
  type BankingActorContext,
} from "../../server/api/src/modules/banking/source-repository.js";
import {
  ensureSourceAuthorizationFixture,
  ensureSourceSuperAdministratorFixture,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const companyId = `payment-company-${suffix}`;
const calendarId = `payment-calendar-${suffix}`;
const periodId = `payment-period-${suffix}`;
const bankLedgerId = `payment-bank-ledger-${suffix}`;
const expenseId = `payment-expense-${suffix}`;
const bankAccountId = `payment-bank-${suffix}`;
const foreignBankLedgerId = `payment-fx-bank-ledger-${suffix}`;
const foreignBankAccountId = `payment-fx-bank-${suffix}`;
const initialRateId = `payment-rate-initial-${suffix}`;
const changedRateId = `payment-rate-changed-${suffix}`;

function context(
  userId: string,
  permissions: readonly string[],
  roles: readonly string[] = [],
  tenantId = sourceTestTenantId,
): BankingActorContext {
  const actor: AuthenticatedAccount = {
    tenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles,
    permissions,
    sessionVersion: 1,
  };
  return { tenantId, actor };
}

const allPaymentPermissions = [
  "banking.payment.read",
  "banking.payment.create",
  "banking.payment.update",
  "banking.payment.submit",
  "banking.payment.approve",
  "banking.payment.post",
  "banking.payment.reverse",
] as const;
const maker = context("r06.maker", [
  "banking.bank_account.read",
  "banking.payment.read",
  "banking.payment.create",
  "banking.payment.update",
  "banking.payment.submit",
]);
const makerWithPost = context("r06.maker", [...maker.actor.permissions, "banking.payment.post"]);
const checker = context("r06.checker", ["banking.payment.read", "banking.payment.approve"]);
const poster = context("r06.target", ["banking.payment.read", "banking.payment.post", "banking.payment.reverse"]);
const restricted = context("r06.restricted", []);
const outOfCompany = context("r06.restricted", ["banking.payment.read"]);
const scopeDenied = context("r06.restricted", allPaymentPermissions);
const overrideAdmin = context(
  "r06.override-admin",
  ["platform.approval.override", ...allPaymentPermissions],
  ["super_administrator"],
);

function currencyCode(value: string): string {
  return [0, 2, 4]
    .map((offset) => String.fromCharCode(65 + (Number.parseInt(value.slice(offset, offset + 2), 16) % 26)))
    .join("");
}

function paymentInput(bankId: string, postingDate: string, reference: string) {
  return {
    company_id: companyId,
    bank_account_id: bankId,
    posting_date: postingDate,
    lines: [
      {
        line_order: 1,
        document_date: postingDate,
        external_reference: reference,
        payment_method: "bank_transfer" as const,
        nominal_account_id: expenseId,
        narration: "Controlled supplier settlement",
        amount: "125.25",
        dimensions: { department: "finance" },
      },
    ],
  };
}

run("Bank Payment governed repository", () => {
  let pool: DatabasePool;
  let repository: SourceBankPaymentRepository;
  let accounts: SourceBankingRepository;
  let postingDate: string;
  let fiscalYear: number;
  let periodNumber: number;
  let baseCurrency: string;
  let foreignCurrency: string;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    await ensureSourceSuperAdministratorFixture(pool);
    const date = await pool.query<{ current_date: string; fiscal_year: number; period_number: number }>(
      `select current_date::text as current_date,extract(year from current_date)::integer as fiscal_year,
              extract(month from current_date)::integer as period_number`,
    );
    postingDate = date.rows[0]!.current_date;
    fiscalYear = date.rows[0]!.fiscal_year;
    periodNumber = date.rows[0]!.period_number;
    const base = await pool.query<{ code: string }>(
      `select code from currency where tenant_id=$1 and status='active' and is_base order by code`,
      [sourceTestTenantId],
    );
    baseCurrency = base.rows[0]?.code ?? "USD";
    if (!base.rows[0]) {
      await pool.query(
        `insert into currency (tenant_id,code,name,decimal_places,is_base,status)
         values ($1,'USD','US Dollar',2,true,'active')`,
        [sourceTestTenantId],
      );
    }
    const candidates = [
      ...new Set([currencyCode(suffix), currencyCode(suffix.slice(6) + suffix), "XBA", "XBB", "XBC"]),
    ].filter((code) => code !== baseCurrency);
    const known = new Set(
      (
        await pool.query<{ code: string }>(`select code from currency where tenant_id=$1`, [sourceTestTenantId])
      ).rows.map((row) => row.code),
    );
    foreignCurrency = candidates.find((code) => !known.has(code))!;
    if (!foreignCurrency) throw new Error("Could not allocate an isolated Bank Payment currency fixture.");

    await pool.query(
      `insert into currency (tenant_id,code,name,decimal_places,is_base,status)
       values ($1,$2,'Synthetic Bank Payment Currency',2,false,'active')`,
      [sourceTestTenantId, foreignCurrency],
    );
    await pool.query(
      `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
       values ($1,$2,null,'company',$3,'Bank Payment Integration Company','active')`,
      [companyId, sourceTestTenantId, `PAY-${suffix}`],
    );
    await pool.query(
      `insert into security_role_permission_grant
        (tenant_id,role_policy_id,permission_key,field_allow_mode)
       values
        ($1,'r06-uat-policy-maker','banking.payment.approve','all'),
        ($1,'r06-uat-policy-maker','banking.payment.post','all')
       on conflict do nothing`,
      [sourceTestTenantId],
    );
    for (const grant of [
      {
        policyId: "r06-uat-policy-maker",
        permissions: [
          "banking.payment.read",
          "banking.payment.create",
          "banking.payment.update",
          "banking.payment.submit",
          "banking.payment.approve",
          "banking.payment.post",
        ],
      },
      {
        policyId: "r06-uat-policy-checker",
        permissions: ["banking.payment.read", "banking.payment.approve"],
      },
      {
        policyId: "r06-uat-policy-payment-poster",
        permissions: ["banking.payment.read", "banking.payment.post", "banking.payment.reverse"],
      },
    ]) {
      await pool.query(
        `insert into security_role_scope_grant
          (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
         select $1,$2,permission,'company',$3 from unnest($4::text[]) permission
         on conflict do nothing`,
        [sourceTestTenantId, grant.policyId, companyId, grant.permissions],
      );
    }
    await pool.query(
      `insert into fiscal_calendar (id,tenant_id,company_id,year,period_start,period_end,status)
       values ($1,$2,$3,$4,make_date($4,1,1),make_date($4,12,31),'active')`,
      [calendarId, sourceTestTenantId, companyId, fiscalYear],
    );
    await pool.query(
      `insert into financial_period
        (id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at)
       values ($1,$2,$3,$4,$5,date_trunc('month',current_date)::date,
               (date_trunc('month',current_date)+interval '1 month - 1 day')::date,'open',now())`,
      [periodId, sourceTestTenantId, companyId, calendarId, periodNumber],
    );
    await pool.query(
      `insert into account
        (id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,
         manual_posting_allowed,is_system_account,reconciliation_required,created_at)
       values
        ($1,$4,$5,$6,'Bank Payment Control','asset',false,'[]'::jsonb,'active',true,false,true,now()),
        ($2,$4,$5,$7,'Bank Payment Expense','expense',false,'["department"]'::jsonb,'active',true,false,false,now()),
        ($3,$4,$5,$8,'Foreign Bank Payment Control','asset',false,'[]'::jsonb,'active',true,false,true,now())`,
      [
        bankLedgerId,
        expenseId,
        foreignBankLedgerId,
        sourceTestTenantId,
        companyId,
        `BANK-${suffix}`,
        `EXP-${suffix}`,
        `FXBANK-${suffix}`,
      ],
    );
    for (const userId of ["r06.maker", "r06.checker", "r06.target", "r06.restricted", "r06.override-admin"] as const) {
      await pool.query(
        `insert into security_user_company_access
          (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
         values ($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','bank-payment-integration')`,
        [sourceTestTenantId, `payment-access-${userId}-${suffix}`, userId, companyId],
      );
    }
    const accountInsert = `insert into bank_account
      (id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,account_name,
       account_type,branch,account_number_masked,account_number_ciphertext,account_number_nonce,
       account_number_hash,encryption_key_version,swift_bic,overdraft_limit,row_version,created_by,
       submitted_by,submitted_at,submission_reason,approved_by,approved_at,decision_reason,updated_at)
     values ($1,$2,$3,$4,'Synthetic Integration Bank',$5,'active',now(),$6,$7,'current','Test Branch',
             '•••• 1234',$8,$9,$10,'integration-v1','SYNTPKKA',0,1,'r06.maker','r06.maker',now(),
             'Controlled integration setup','r06.checker',now(),'Controlled integration approval',now())`;
    await pool.query(accountInsert, [
      bankAccountId,
      sourceTestTenantId,
      companyId,
      bankLedgerId,
      baseCurrency,
      `BA-${suffix}`,
      "Payment Operating Account",
      Buffer.alloc(24, 7),
      Buffer.alloc(12, 3),
      createHashHex(`base-${suffix}`),
    ]);
    await pool.query(accountInsert, [
      foreignBankAccountId,
      sourceTestTenantId,
      companyId,
      foreignBankLedgerId,
      foreignCurrency,
      `FX-${suffix}`,
      "Foreign Payment Account",
      Buffer.alloc(24, 8),
      Buffer.alloc(12, 4),
      createHashHex(`fx-${suffix}`),
    ]);
    await pool.query(
      `insert into currency_rate (id,tenant_id,source_currency,target_currency,rate,effective_date,created_at)
       values ($1,$2,$3,$4,1.25,current_date - 1,now())`,
      [initialRateId, sourceTestTenantId, foreignCurrency, baseCurrency],
    );
    repository = new SourceBankPaymentRepository(pool);
    accounts = new SourceBankingRepository(
      pool,
      new BankingIdentifierCrypto(Buffer.alloc(32, 29).toString("base64"), "integration-v1"),
    );
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("runs create through reversal with version, scope, permission and idempotency controls", async () => {
    const input = paymentInput(bankAccountId, postingDate, `EXT-${suffix}`);
    await expect(
      repository.list(scopeDenied, {
        company_id: companyId,
        sort_by: "posting_date",
        sort_direction: "desc",
        limit: 50,
      }),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "PERMISSION_DENIED" });
    await expect(repository.options(scopeDenied, { company_id: companyId })).rejects.toMatchObject<
      Partial<BankingApiError>
    >({ status: 403, code: "PERMISSION_DENIED" });
    await expect(repository.listNominalAccounts(maker, { company_id: companyId, limit: 100 })).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: expenseId,
          account_type: "expense",
          required_dimensions: ["department"],
        }),
      ],
    });
    await expect(
      repository.create(
        maker,
        {
          ...input,
          lines: [{ ...input.lines[0]!, nominal_account_id: foreignBankLedgerId, dimensions: {} }],
        },
        `payment-bank-control-create-${suffix}`,
        `payment-corr-bank-control-create-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 400, code: "PAYMENT_ACCOUNT_INVALID" });
    await expect(
      repository.create(
        scopeDenied,
        input,
        `payment-cross-scope-create-${suffix}`,
        `payment-corr-cross-scope-create-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "PERMISSION_DENIED" });
    const created = await repository.create(maker, input, `payment-create-${suffix}`, `payment-corr-create-${suffix}`);
    expect(created).toMatchObject({ state: "draft", version: 1, replayed: false });
    await expect(
      repository.create(maker, input, `payment-create-${suffix}`, `payment-corr-replay-${suffix}`),
    ).resolves.toMatchObject({ id: created.id, state: "draft", version: 1, replayed: true });
    await expect(
      repository.create(
        maker,
        { ...input, lines: [{ ...input.lines[0]!, amount: "126.25" }] },
        `payment-create-${suffix}`,
        `payment-corr-conflict-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 409, code: "PAYMENT_IDEMPOTENCY_CONFLICT" });
    await expect(
      repository.update(
        maker,
        created.id,
        { expected_version: 2, value_date: postingDate },
        `payment-update-stale-${suffix}`,
        `payment-corr-stale-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 409, code: "PAYMENT_VERSION_CONFLICT" });

    const updated = await repository.update(
      maker,
      created.id,
      { expected_version: 1, value_date: postingDate },
      `payment-update-${suffix}`,
      `payment-corr-update-${suffix}`,
    );
    expect(updated).toMatchObject({ state: "draft", version: 2 });
    const submitted = await repository.submit(
      maker,
      created.id,
      { expected_version: 2 },
      `payment-submit-${suffix}`,
      `payment-corr-submit-${suffix}`,
    );
    expect(submitted).toMatchObject({ state: "submitted", version: 3 });
    await expect(
      repository.decide(
        context("r06.maker", [...maker.actor.permissions, "banking.payment.approve"]),
        created.id,
        { action: "approve", expected_version: 3 },
        `payment-self-decide-${suffix}`,
        `payment-corr-self-decide-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "PAYMENT_MAKER_CHECKER_REQUIRED" });
    const approved = await repository.decide(
      checker,
      created.id,
      { action: "approve", expected_version: 3 },
      `payment-approve-${suffix}`,
      `payment-corr-approve-${suffix}`,
    );
    expect(approved).toMatchObject({ state: "approved", version: 4 });
    await expect(repository.get(scopeDenied, created.id)).rejects.toMatchObject<Partial<BankingApiError>>({
      status: 403,
      code: "PERMISSION_DENIED",
    });
    const beforePostingList = await accounts.listAccounts(maker, {
      company_id: companyId,
      sort_by: "account_name",
      sort_direction: "asc",
      limit: 100,
    });
    expect(beforePostingList.items.find((account) => account.id === bankAccountId)).toMatchObject({
      ledger_balance: "0",
      last_movement_on: null,
    });
    expect(
      (await accounts.accountSummary(maker, companyId)).items.find((item) => item.currency === baseCurrency)
        ?.ledger_balance,
    ).toBe("0");
    expect(await accounts.getAccount(maker, bankAccountId)).toMatchObject({
      ledger_balance: "0",
      last_movement_on: null,
    });
    await expect(
      repository.post(
        makerWithPost,
        created.id,
        { expected_version: 4 },
        `payment-maker-post-${suffix}`,
        `payment-corr-maker-post-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({
      status: 403,
      code: "PAYMENT_POSTER_SEPARATION_REQUIRED",
    });
    const posted = await repository.post(
      poster,
      created.id,
      { expected_version: 4 },
      `payment-post-${suffix}`,
      `payment-corr-post-${suffix}`,
    );
    expect(posted).toMatchObject({ state: "posted", version: 5, replayed: false });
    await expect(
      repository.post(
        poster,
        created.id,
        { expected_version: 4 },
        `payment-post-${suffix}`,
        `payment-corr-post-replay-${suffix}`,
      ),
    ).resolves.toEqual({ ...posted, replayed: true });
    expect(
      (
        await accounts.listAccounts(maker, {
          company_id: companyId,
          sort_by: "account_name",
          sort_direction: "asc",
          limit: 100,
        })
      ).items.find((account) => account.id === bankAccountId),
    ).toMatchObject({
      ledger_balance: "-125.25000000",
      last_movement_on: postingDate,
    });
    expect(
      (await accounts.accountSummary(maker, companyId)).items.find((item) => item.currency === baseCurrency)
        ?.ledger_balance,
    ).toBe("-125.25000000");
    expect(await accounts.getAccount(maker, bankAccountId)).toMatchObject({
      ledger_balance: "-125.25000000",
      last_movement_on: postingDate,
    });

    const reversed = await repository.reverse(
      poster,
      created.id,
      { expected_version: 5, reason: "Duplicate supplier settlement" },
      `payment-reverse-${suffix}`,
      `payment-corr-reverse-${suffix}`,
    );
    expect(reversed).toMatchObject({ state: "reversed", version: 6, replayed: false });
    expect(
      (
        await accounts.listAccounts(maker, {
          company_id: companyId,
          sort_by: "account_name",
          sort_direction: "asc",
          limit: 100,
        })
      ).items.find((account) => account.id === bankAccountId),
    ).toMatchObject({
      ledger_balance: "0.00000000",
      last_movement_on: postingDate,
    });
    expect(
      (await accounts.accountSummary(maker, companyId)).items.find((item) => item.currency === baseCurrency)
        ?.ledger_balance,
    ).toBe("0.00000000");
    expect(await accounts.getAccount(maker, bankAccountId)).toMatchObject({
      ledger_balance: "0.00000000",
      last_movement_on: postingDate,
    });
    const detail = await repository.get(maker, created.id);
    expect(detail).toMatchObject({ state: "reversed", version: 6, line_count: 1 });
    expect(detail.lines[0]).toMatchObject({ line_order: 1, external_reference: `EXT-${suffix}` });
    expect(detail.timeline.map((event) => event.action)).toEqual([
      "created",
      "updated",
      "submitted",
      "approved",
      "posted",
      "reversed",
    ]);

    await expect(repository.get(restricted, created.id)).rejects.toMatchObject<Partial<BankingApiError>>({
      status: 403,
      code: "PERMISSION_DENIED",
    });
    await expect(repository.get(outOfCompany, created.id)).rejects.toMatchObject<Partial<BankingApiError>>({
      status: 403,
      code: "PERMISSION_DENIED",
    });
    await expect(
      repository.get(context("foreign-user", ["banking.payment.read"], [], `tenant-${suffix}`), created.id),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 404, code: "PAYMENT_NOT_FOUND" });
  }, 60_000);

  it("records governed super-administrator override evidence and rolls back stale FX posting", async () => {
    const overrideInput = paymentInput(bankAccountId, postingDate, `OVERRIDE-${suffix}`);
    const overrideCreated = await repository.create(
      overrideAdmin,
      overrideInput,
      `payment-override-create-${suffix}`,
      `payment-corr-override-create-${suffix}`,
    );
    const overrideSubmitted = await repository.submit(
      overrideAdmin,
      overrideCreated.id,
      { expected_version: 1 },
      `payment-override-submit-${suffix}`,
      `payment-corr-override-submit-${suffix}`,
    );
    const overrideApproved = await repository.decide(
      overrideAdmin,
      overrideCreated.id,
      { action: "approve", expected_version: overrideSubmitted.version, reason: "Controlled emergency self-approval" },
      `payment-override-approve-${suffix}`,
      `payment-corr-override-approve-${suffix}`,
    );
    expect(overrideApproved).toMatchObject({ state: "approved" });
    const overrideEvidence = await pool.query<{
      approval_override_event_id: string | null;
      event_override_id: string | null;
    }>(
      `select payment.approval_override_event_id,event.approval_override_event_id as event_override_id
         from bank_payment payment join bank_payment_event event
           on event.tenant_id=payment.tenant_id and event.payment_id=payment.id and event.event_type='approved'
        where payment.tenant_id=$1 and payment.id=$2`,
      [sourceTestTenantId, overrideCreated.id],
    );
    expect(overrideEvidence.rows[0]?.approval_override_event_id).toMatch(/^approval-override-/);
    expect(overrideEvidence.rows[0]?.event_override_id).toBe(overrideEvidence.rows[0]?.approval_override_event_id);
    await expect(
      repository.post(
        { ...overrideAdmin, impersonationRequestId: `payment-impersonation-${suffix}` },
        overrideCreated.id,
        { expected_version: overrideApproved.version },
        `payment-override-impersonated-post-${suffix}`,
        `payment-corr-override-impersonated-post-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "IMPERSONATION_RESTRICTED" });
    const overridePosted = await repository.post(
      overrideAdmin,
      overrideCreated.id,
      { expected_version: overrideApproved.version },
      `payment-override-post-${suffix}`,
      `payment-corr-override-post-${suffix}`,
    );
    expect(overridePosted).toMatchObject({ state: "posted", version: overrideApproved.version + 1 });
    const postingOverrideEvidence = await pool.query<{
      decision_override_id: string | null;
      posted_override_id: string | null;
      decision_action: string;
      normal_permission_key: string;
      reason: string;
      actor_user_id: string;
      audit_override_id: string | null;
    }>(
      `select payment.approval_override_event_id as decision_override_id,
              event.approval_override_event_id as posted_override_id,
              evidence.decision_action,evidence.normal_permission_key,evidence.reason,evidence.actor_user_id,
              audit.approval_reference as audit_override_id
         from bank_payment payment
         join bank_payment_event event
           on event.tenant_id=payment.tenant_id and event.payment_id=payment.id and event.event_type='posted'
         join approval_override_event evidence
           on evidence.tenant_id=event.tenant_id and evidence.event_id=event.approval_override_event_id
         join platform_admin_audit_event audit
           on audit.tenant_id=event.tenant_id and audit.id=event.platform_audit_event_id
        where payment.tenant_id=$1 and payment.id=$2`,
      [sourceTestTenantId, overrideCreated.id],
    );
    expect(postingOverrideEvidence.rows[0]).toMatchObject({
      decision_override_id: overrideEvidence.rows[0]?.approval_override_event_id,
      decision_action: "post",
      normal_permission_key: "banking.payment.post",
      reason: "Governed global super-administrator posting segregation override",
      actor_user_id: "r06.override-admin",
    });
    expect(postingOverrideEvidence.rows[0]?.posted_override_id).toMatch(/^approval-override-/);
    expect(postingOverrideEvidence.rows[0]?.posted_override_id).not.toBe(
      postingOverrideEvidence.rows[0]?.decision_override_id,
    );
    expect(postingOverrideEvidence.rows[0]?.audit_override_id).toBe(
      postingOverrideEvidence.rows[0]?.posted_override_id,
    );

    const fxInput = paymentInput(foreignBankAccountId, postingDate, `FX-${suffix}`);
    const fxCreated = await repository.create(
      maker,
      fxInput,
      `payment-fx-create-${suffix}`,
      `payment-corr-fx-create-${suffix}`,
    );
    const fxSubmitted = await repository.submit(
      maker,
      fxCreated.id,
      { expected_version: 1 },
      `payment-fx-submit-${suffix}`,
      `payment-corr-fx-submit-${suffix}`,
    );
    const fxApproved = await repository.decide(
      checker,
      fxCreated.id,
      { action: "approve", expected_version: fxSubmitted.version },
      `payment-fx-approve-${suffix}`,
      `payment-corr-fx-approve-${suffix}`,
    );
    await pool.query(
      `insert into currency_rate (id,tenant_id,source_currency,target_currency,rate,effective_date,created_at)
       values ($1,$2,$3,$4,1.5,current_date,now())`,
      [changedRateId, sourceTestTenantId, foreignCurrency, baseCurrency],
    );
    await expect(
      repository.post(
        poster,
        fxCreated.id,
        { expected_version: fxApproved.version },
        `payment-fx-post-${suffix}`,
        `payment-corr-fx-post-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 409, code: "PAYMENT_FX_RATE_CHANGED" });
    const rollback = await pool.query<{ state: string; row_version: string; event_count: string }>(
      `select payment.state,payment.row_version::text,
              (select count(*)::text from accounting_event event
                where event.tenant_id=payment.tenant_id and event.source_type='banking.payment' and event.source_id=payment.id) event_count
         from bank_payment payment where payment.tenant_id=$1 and payment.id=$2`,
      [sourceTestTenantId, fxCreated.id],
    );
    expect(rollback.rows[0]).toEqual({ state: "approved", row_version: String(fxApproved.version), event_count: "0" });

    const replayInput = paymentInput(bankAccountId, postingDate, `REVOKE-${suffix}`);
    const replayCreated = await repository.create(
      maker,
      replayInput,
      `payment-revoke-replay-${suffix}`,
      `payment-corr-revoke-create-${suffix}`,
    );
    await pool.query(
      `delete from security_role_scope_grant
        where tenant_id=$1 and role_policy_id='r06-uat-policy-maker'
          and permission_key='banking.payment.create' and scope_kind='company' and scope_value=$2`,
      [sourceTestTenantId, companyId],
    );
    try {
      await expect(
        repository.create(
          maker,
          replayInput,
          `payment-revoke-replay-${suffix}`,
          `payment-corr-revoke-replay-${suffix}`,
        ),
      ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "PERMISSION_DENIED" });
      const persisted = await pool.query<{ id: string }>(`select id from bank_payment where tenant_id=$1 and id=$2`, [
        sourceTestTenantId,
        replayCreated.id,
      ]);
      expect(persisted.rows).toEqual([{ id: replayCreated.id }]);
    } finally {
      await pool.query(
        `insert into security_role_scope_grant
          (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
         values ($1,'r06-uat-policy-maker','banking.payment.create','company',$2)
         on conflict do nothing`,
        [sourceTestTenantId, companyId],
      );
    }
    await pool.query(
      `update security_user_company_access
          set revoked_by='r06.last-admin-a',revoked_at=clock_timestamp(),revocation_reason='Replay authority regression'
        where tenant_id=$1 and access_id=$2 and revoked_at is null`,
      [sourceTestTenantId, `payment-access-r06.maker-${suffix}`],
    );
    await expect(
      repository.create(maker, replayInput, `payment-revoke-replay-${suffix}`, `payment-corr-access-replay-${suffix}`),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "COMPANY_ACCESS_DENIED" });
  }, 60_000);
});

function createHashHex(value: string): string {
  return Buffer.from(value, "utf8").toString("hex").padEnd(64, "0").slice(0, 64);
}
