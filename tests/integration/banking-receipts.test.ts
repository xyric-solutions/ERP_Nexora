import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { BankingIdentifierCrypto } from "../../server/api/src/modules/banking/crypto.js";
import { SourceBankReceiptRepository } from "../../server/api/src/modules/banking/receipts/source-repository.js";
import {
  BankingApiError,
  SourceBankingRepository,
  type BankingActorContext,
} from "../../server/api/src/modules/banking/source-repository.js";
import { FinancePostingService } from "../../server/api/src/modules/finance/posting/index.js";
import {
  ensureSourceAuthorizationFixture,
  ensureSourceSuperAdministratorFixture,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const companyId = `receipt-company-${suffix}`;
const calendarId = `receipt-calendar-${suffix}`;
const periodId = `receipt-period-${suffix}`;
const bankLedgerId = `receipt-bank-ledger-${suffix}`;
const incomeId = `receipt-income-${suffix}`;
const bankAccountId = `receipt-bank-${suffix}`;

function context(userId: string, permissions: readonly string[], roles: readonly string[] = []): BankingActorContext {
  const actor: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles,
    permissions,
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor };
}

const allReceiptPermissions = [
  "banking.receipt.read",
  "banking.receipt.create",
  "banking.receipt.update",
  "banking.receipt.submit",
  "banking.receipt.approve",
  "banking.receipt.post",
  "banking.receipt.reverse",
] as const;
const maker = context("r06.maker", [
  "banking.bank_account.read",
  "banking.receipt.read",
  "banking.receipt.create",
  "banking.receipt.update",
  "banking.receipt.submit",
]);
const checker = context("r06.checker", ["banking.receipt.read", "banking.receipt.approve"]);
const poster = context("r06.target", ["banking.receipt.read", "banking.receipt.post", "banking.receipt.reverse"]);
const overrideAdmin = context(
  "r06.override-admin",
  ["platform.approval.override", ...allReceiptPermissions],
  ["super_administrator"],
);

function receiptInput(postingDate: string, reference: string) {
  return {
    company_id: companyId,
    bank_account_id: bankAccountId,
    posting_date: postingDate,
    lines: [
      {
        line_order: 1,
        document_date: postingDate,
        external_reference: reference,
        receipt_method: "bank_transfer" as const,
        payer_name: "Synthetic Acceptance Customer",
        nominal_account_id: incomeId,
        narration: "Controlled customer receipt",
        amount: "125.25",
        dimensions: { department: "finance" },
      },
    ],
  };
}

run("Bank Receipt governed repository", () => {
  let pool: DatabasePool;
  let repository: SourceBankReceiptRepository;
  let accounts: SourceBankingRepository;
  let postingDate: string;
  let fiscalYear: number;
  let periodNumber: number;
  let baseCurrency: string;

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
    await pool.query(
      `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
       values ($1,$2,null,'company',$3,'Bank Receipt Integration Company','active')`,
      [companyId, sourceTestTenantId, `REC-${suffix}`],
    );
    for (const grant of [
      {
        policyId: "r06-uat-policy-maker",
        permissions: [
          "banking.receipt.read",
          "banking.receipt.create",
          "banking.receipt.update",
          "banking.receipt.submit",
          "banking.receipt.approve",
        ],
      },
      {
        policyId: "r06-uat-policy-checker",
        permissions: ["banking.receipt.read", "banking.receipt.approve"],
      },
      {
        policyId: "r06-uat-policy-payment-poster",
        permissions: ["banking.receipt.read", "banking.receipt.post", "banking.receipt.reverse"],
      },
    ]) {
      await pool.query(
        `insert into security_role_permission_grant
          (tenant_id,role_policy_id,permission_key,field_allow_mode)
         select $1,$2,permission,'all' from unnest($3::text[]) permission
         on conflict do nothing`,
        [sourceTestTenantId, grant.policyId, grant.permissions],
      );
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
        ($1,$3,$4,$5,'Bank Receipt Control','asset',false,'[]'::jsonb,'active',true,false,true,now()),
        ($2,$3,$4,$6,'Bank Receipt Income','revenue',false,'["department"]'::jsonb,'active',true,false,false,now())`,
      [bankLedgerId, incomeId, sourceTestTenantId, companyId, `BANK-${suffix}`, `INC-${suffix}`],
    );
    for (const userId of ["r06.maker", "r06.checker", "r06.target", "r06.override-admin"] as const) {
      await pool.query(
        `insert into security_user_company_access
          (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
         values ($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','bank-receipt-integration')`,
        [sourceTestTenantId, `receipt-access-${userId}-${suffix}`, userId, companyId],
      );
    }
    await pool.query(
      `insert into bank_account
        (id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,account_name,
         account_type,branch,account_number_masked,account_number_ciphertext,account_number_nonce,
         account_number_hash,encryption_key_version,swift_bic,overdraft_limit,row_version,created_by,
         submitted_by,submitted_at,submission_reason,approved_by,approved_at,decision_reason,updated_at)
       values ($1,$2,$3,$4,'Synthetic Integration Bank',$5,'active',now(),$6,'Receipt Operating Account',
               'current','Test Branch','**** 5678',$7,$8,$9,'integration-v1','SYNTPKKA',0,1,
               'r06.maker','r06.maker',now(),'Controlled integration setup','r06.checker',now(),
               'Controlled integration approval',now())`,
      [
        bankAccountId,
        sourceTestTenantId,
        companyId,
        bankLedgerId,
        baseCurrency,
        `BA-${suffix}`,
        Buffer.alloc(24, 7),
        Buffer.alloc(12, 3),
        Buffer.from(`receipt-${suffix}`, "utf8").toString("hex").padEnd(64, "0").slice(0, 64),
      ],
    );
    repository = new SourceBankReceiptRepository(pool);
    accounts = new SourceBankingRepository(
      pool,
      new BankingIdentifierCrypto(Buffer.alloc(32, 29).toString("base64"), "integration-v1"),
    );
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("runs create through reversal with payer, idempotency, separation and correct accounting direction", async () => {
    const input = receiptInput(postingDate, `EXT-${suffix}`);
    const options = await repository.options(maker, { company_id: companyId });
    expect(options.bank_accounts).toEqual([expect.objectContaining({ id: bankAccountId })]);
    expect(options.receipt_methods.map((method) => method.value)).toEqual([
      "bank_transfer",
      "cheque",
      "cash",
      "online",
      "direct_debit",
      "card",
    ]);
    await expect(repository.listNominalAccounts(maker, { company_id: companyId, limit: 100 })).resolves.toEqual({
      items: [expect.objectContaining({ id: incomeId, required_dimensions: ["department"] })],
    });
    await expect(
      repository.create(
        maker,
        { ...input, lines: [{ ...input.lines[0]!, dimensions: {} }] },
        `receipt-missing-dimension-${suffix}`,
        `receipt-corr-missing-dimension-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 400, code: "RECEIPT_DIMENSION_REQUIRED" });

    const created = await repository.create(maker, input, `receipt-create-${suffix}`, `receipt-corr-create-${suffix}`);
    expect(created).toMatchObject({ state: "draft", version: 1, replayed: false });
    await expect(
      repository.create(maker, input, `receipt-create-${suffix}`, `receipt-corr-replay-${suffix}`),
    ).resolves.toMatchObject({ id: created.id, replayed: true });
    await expect(
      repository.create(
        maker,
        { ...input, lines: [{ ...input.lines[0]!, amount: "126.25" }] },
        `receipt-create-${suffix}`,
        `receipt-corr-conflict-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 409, code: "RECEIPT_IDEMPOTENCY_CONFLICT" });
    const directory = await repository.list(maker, {
      company_id: companyId,
      search: "Synthetic Acceptance Customer",
      sort_by: "posting_date",
      sort_direction: "desc",
      limit: 50,
    });
    expect(directory.items).toEqual([
      expect.objectContaining({
        id: created.id,
        payer_summary: "Synthetic Acceptance Customer",
        nominal_account_summary: `${`INC-${suffix}`} - Bank Receipt Income`,
      }),
    ]);
    const updated = await repository.update(
      maker,
      created.id,
      { expected_version: created.version, value_date: postingDate },
      `receipt-update-${suffix}`,
      `receipt-corr-update-${suffix}`,
    );
    expect(updated).toMatchObject({ state: "draft", version: created.version + 1 });

    const submitted = await repository.submit(
      maker,
      created.id,
      { expected_version: updated.version },
      `receipt-submit-${suffix}`,
      `receipt-corr-submit-${suffix}`,
    );
    await expect(
      repository.decide(
        context("r06.maker", [...maker.actor.permissions, "banking.receipt.approve"]),
        created.id,
        { action: "approve", expected_version: submitted.version },
        `receipt-self-approve-${suffix}`,
        `receipt-corr-self-approve-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "RECEIPT_MAKER_CHECKER_REQUIRED" });
    const approved = await repository.decide(
      checker,
      created.id,
      { action: "approve", expected_version: submitted.version },
      `receipt-approve-${suffix}`,
      `receipt-corr-approve-${suffix}`,
    );
    const posted = await repository.post(
      poster,
      created.id,
      { expected_version: approved.version },
      `receipt-post-${suffix}`,
      `receipt-corr-post-${suffix}`,
    );
    expect(posted).toMatchObject({ state: "posted", version: approved.version + 1 });
    expect(await accounts.getAccount(maker, bankAccountId)).toMatchObject({
      ledger_balance: "125.25000000",
      last_movement_on: postingDate,
    });
    const postedDetail = await repository.get(maker, created.id);
    expect(postedDetail).toMatchObject({
      payer_summary: "Synthetic Acceptance Customer",
      nominal_account_summary: `${`INC-${suffix}`} - Bank Receipt Income`,
      state: "posted",
    });
    expect(postedDetail.lines[0]).toMatchObject({ payer_name: "Synthetic Acceptance Customer" });
    expect(postedDetail.accounting_preview.lines).toEqual([
      expect.objectContaining({ line_order: 1, account_id: bankLedgerId, side: "debit", is_bank_control: true }),
      expect.objectContaining({ line_order: 2, account_id: incomeId, side: "credit", is_bank_control: false }),
    ]);

    const reversed = await repository.reverse(
      poster,
      created.id,
      { expected_version: posted.version, reason: "Duplicate customer receipt" },
      `receipt-reverse-${suffix}`,
      `receipt-corr-reverse-${suffix}`,
    );
    expect(reversed).toMatchObject({ state: "reversed", version: posted.version + 1 });
    expect(await accounts.getAccount(maker, bankAccountId)).toMatchObject({ ledger_balance: "0.00000000" });
    expect((await repository.get(maker, created.id)).timeline.map((event) => event.action)).toEqual([
      "created",
      "updated",
      "submitted",
      "approved",
      "posted",
      "reversed",
    ]);
  }, 60_000);

  it("records the governed super-admin exception and rolls back a failed Finance post", async () => {
    const input = receiptInput(postingDate, `OVERRIDE-${suffix}`);
    const created = await repository.create(
      overrideAdmin,
      input,
      `receipt-override-create-${suffix}`,
      `receipt-corr-override-create-${suffix}`,
    );
    const submitted = await repository.submit(
      overrideAdmin,
      created.id,
      { expected_version: created.version },
      `receipt-override-submit-${suffix}`,
      `receipt-corr-override-submit-${suffix}`,
    );
    const approved = await repository.decide(
      overrideAdmin,
      created.id,
      { action: "approve", expected_version: submitted.version, reason: "Controlled emergency self-approval" },
      `receipt-override-approve-${suffix}`,
      `receipt-corr-override-approve-${suffix}`,
    );
    const evidence = await pool.query<{ approval_override_event_id: string | null; event_override_id: string | null }>(
      `select receipt.approval_override_event_id,event.approval_override_event_id as event_override_id
         from bank_receipt receipt join bank_receipt_event event
           on event.tenant_id=receipt.tenant_id and event.receipt_id=receipt.id and event.event_type='approved'
        where receipt.tenant_id=$1 and receipt.id=$2`,
      [sourceTestTenantId, created.id],
    );
    expect(evidence.rows[0]?.approval_override_event_id).toMatch(/^approval-override-/);
    expect(evidence.rows[0]?.event_override_id).toBe(evidence.rows[0]?.approval_override_event_id);

    const finance = new FinancePostingService();
    vi.spyOn(finance, "post").mockRejectedValueOnce(new Error("injected Finance failure"));
    const failingRepository = new SourceBankReceiptRepository(pool, finance);
    await expect(
      failingRepository.post(
        overrideAdmin,
        created.id,
        { expected_version: approved.version },
        `receipt-failed-post-${suffix}`,
        `receipt-corr-failed-post-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 500, code: "RECEIPT_POSTING_FAILED" });
    const rollback = await pool.query<{
      state: string;
      row_version: string;
      posted_events: string;
      finance_events: string;
      idempotency_success: string;
    }>(
      `select receipt.state,receipt.row_version::text,
              (select count(*)::text from bank_receipt_event event
                where event.tenant_id=receipt.tenant_id and event.receipt_id=receipt.id and event.event_type='posted') posted_events,
              (select count(*)::text from accounting_event event
                where event.tenant_id=receipt.tenant_id and event.source_type='banking.receipt' and event.source_id=receipt.id) finance_events,
              (select count(*)::text from platform_admin_idempotency idempotency
                where idempotency.tenant_id=receipt.tenant_id and idempotency.idempotency_key=$3) idempotency_success
         from bank_receipt receipt where receipt.tenant_id=$1 and receipt.id=$2`,
      [sourceTestTenantId, created.id, `receipt-failed-post-${suffix}`],
    );
    expect(rollback.rows[0]).toEqual({
      state: "approved",
      row_version: String(approved.version),
      posted_events: "0",
      finance_events: "0",
      idempotency_success: "0",
    });
  }, 60_000);
});
