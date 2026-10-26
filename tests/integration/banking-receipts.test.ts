import { randomUUID } from "node:crypto";
import { registerBankGovernanceCases } from "./bank-governance-cases.js";
import {
  bankContextFixture,
  assertContextDatabaseGuards,
  assertConcurrentApproverRevocation,
  assertUnassignedCheckerDenied,
} from "./bank-context-fixture.js";

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
  ensureCompanyCurrencyFixture,
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
    approver_user_id: "r06.checker",
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
    await ensureCompanyCurrencyFixture(pool, companyId, baseCurrency, []);
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

  function registerContextTest() {
    it("persists typed context, routes assigned approval and preserves ledger dimensions through reversal", async () => {
      // Restore access with a new immutable fixture grant if an earlier replay test revoked its own grant.
      await pool.query(
        `insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
      select $1,$2,'r06.maker',$3,false,'r06.last-admin-a','governed_administration','synthetic-context-test'
      where not exists(select 1 from security_user_company_access where tenant_id=$1 and company_id=$3 and user_id='r06.maker' and revoked_at is null)`,
        [sourceTestTenantId, randomUUID(), companyId],
      );
      const { masters, masterActor, project, location } = await bankContextFixture(pool, maker, companyId);
      const foreign = await bankContextFixture(pool, maker, "nexora-r06-uat-company");
      const input = { ...receiptInput(postingDate, `CTX-${suffix}`), project_id: project.id, location_id: location.id };
      const options = await repository.workflowOptions(maker, { company_id: companyId, kind: "project", limit: 10 });
      expect(options.items.map((item) => item.id)).toContain(project.id);
      expect(options.items.map((item) => item.id)).not.toContain(foreign.project.id);
      expect(
        (
          await repository.workflowOptions(maker, {
            company_id: companyId,
            kind: "project",
            selected_id: foreign.project.id,
            limit: 10,
          })
        ).selected,
      ).toBeNull();
      const checkers = await repository.workflowOptions(maker, { company_id: companyId, kind: "approver", limit: 100 });
      expect(checkers.items.map((item) => item.id)).toContain("r06.checker");
      expect(checkers.items.map((item) => item.id)).not.toContain(maker.actor.userId);
      const missing = await repository.create(maker, { ...input, approver_user_id: null }, randomUUID(), randomUUID());
      await expect(
        repository.submit(maker, missing.id, { expected_version: 1 }, randomUUID(), randomUUID()),
      ).rejects.toMatchObject({ code: "BANK_APPROVER_REQUIRED" });
      await expect(
        repository.create(maker, { ...input, project_id: "outside-company-project" }, randomUUID(), randomUUID()),
      ).rejects.toMatchObject({ code: "BANK_CONTEXT_INELIGIBLE" });
      await expect(
        repository.create(
          maker,
          {
            ...input,
            lines: input.lines.map((line) => ({ ...line, dimensions: { ...line.dimensions, project: "forged" } })),
          },
          randomUUID(),
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: "BANK_CONTEXT_CONFLICT" });
      const created = await repository.create(maker, input, randomUUID(), randomUUID());
      await expect(
        repository.create(maker, { ...input, project_id: foreign.project.id }, randomUUID(), randomUUID()),
      ).rejects.toMatchObject({ code: "BANK_CONTEXT_INELIGIBLE" });
      const detail = await repository.get(maker, created.id);
      await assertContextDatabaseGuards(pool, sourceTestTenantId, "receipt", created.id);
      expect(detail).toMatchObject({
        project_id: project.id,
        location_id: location.id,
        approver_user_id: "r06.checker",
      });
      expect(detail.lines[0]?.dimensions).toMatchObject({
        project: project.id,
        location: location.id,
        department: "finance",
      });
      const submitted = await repository.submit(maker, created.id, { expected_version: 1 }, randomUUID(), randomUUID());
      await assertUnassignedCheckerDenied(pool, sourceTestTenantId, companyId, "receipt", () =>
        repository.decide(
          {
            ...poster,
            actor: { ...poster.actor, permissions: [...poster.actor.permissions, "banking.receipt.approve"] },
          },
          created.id,
          { action: "approve", expected_version: submitted.version },
          randomUUID(),
          randomUUID(),
        ),
      );
      await assertConcurrentApproverRevocation(pool, sourceTestTenantId, companyId, "receipt", () =>
        repository.decide(
          checker,
          created.id,
          { action: "approve", expected_version: submitted.version },
          randomUUID(),
          randomUUID(),
        ),
      );
      await pool.query(
        "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-checker' and permission_key='banking.receipt.approve' and scope_kind='company' and scope_value=$2",
        [sourceTestTenantId, companyId],
      );
      try {
        await expect(
          repository.decide(
            checker,
            created.id,
            { action: "approve", expected_version: submitted.version },
            randomUUID(),
            randomUUID(),
          ),
        ).rejects.toMatchObject({ status: 403 });
      } finally {
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-checker','banking.receipt.approve','company',$2)",
          [sourceTestTenantId, companyId],
        );
      }
      const approved = await repository.decide(
        checker,
        created.id,
        { action: "approve", expected_version: submitted.version },
        randomUUID(),
        randomUUID(),
      );
      const inactive = await masters.status(
        masterActor,
        "projects",
        project.id,
        { company_id: companyId, expected_version: 1, status: "inactive" },
        randomUUID(),
        randomUUID(),
      );
      await expect(
        repository.post(poster, created.id, { expected_version: approved.version }, randomUUID(), randomUUID()),
      ).rejects.toMatchObject({ code: "BANK_CONTEXT_INELIGIBLE" });
      const active = await masters.status(
        masterActor,
        "projects",
        project.id,
        { company_id: companyId, expected_version: inactive.record.version, status: "active" },
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
      await masters.status(
        masterActor,
        "projects",
        project.id,
        { company_id: companyId, expected_version: active.record.version, status: "inactive" },
        randomUUID(),
        randomUUID(),
      );
      await repository.reverse(
        poster,
        created.id,
        { expected_version: posted.version, reason: "Synthetic context reversal" },
        randomUUID(),
        randomUUID(),
      );
      const reversed = await repository.get(maker, created.id);
      const ledger = await pool.query(
        "select dimensions from journal_line where tenant_id=$1 and journal_id=any($2::text[]) and account_id=$3",
        [sourceTestTenantId, [reversed.journal_id, reversed.reversal_journal_id], incomeId],
      );
      expect(ledger.rows).toHaveLength(2);
      expect(
        ledger.rows.every((line) => line.dimensions.project === project.id && line.dimensions.location === location.id),
      ).toBe(true);
    }, 60_000);
  }
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
    await expect(repository.listNominalAccounts(maker, { company_id: companyId, limit: 100 })).resolves.toMatchObject({
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
      { action: "approve", expected_version: submitted.version },
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
  registerContextTest();
  registerBankGovernanceCases(() => ({
    pool,
    kind: "receipt",
    company: companyId,
    repository,
    maker,
    checker,
    poster,
    admin: overrideAdmin,
    create: (actor, fields) =>
      repository.create(
        actor,
        { ...receiptInput(postingDate, `GOV-${randomUUID()}`), ...fields },
        randomUUID(),
        randomUUID(),
      ),
  }));
});
