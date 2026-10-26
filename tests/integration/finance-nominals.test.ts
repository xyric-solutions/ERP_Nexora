import { randomBytes, randomUUID } from "node:crypto";
import { bankAccountDetailSchema } from "../../packages/contracts/src/banking/index.js";
import { BankingIdentifierCrypto } from "../../server/api/src/modules/banking/crypto.js";
import { SourceBankingRepository } from "../../server/api/src/modules/banking/source-repository.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  SourceFinanceNominalRepository,
  type FinanceNominalActorContext,
} from "../../server/api/src/modules/finance/nominals/source-repository.js";
import {
  ensureCompanyCurrencyFixture,
  ensureSourceSuperAdministratorFixture,
  sourceTestTenantId,
} from "./source-security-fixture.js";
import { SourceBankPaymentRepository } from "../../server/api/src/modules/banking/payments/source-repository.js";
import { SourceBankReceiptRepository } from "../../server/api/src/modules/banking/receipts/source-repository.js";

const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = url ? describe : describe.skip;
const suffix = randomUUID().slice(0, 8);
const company = `nominal-workflow-${suffix}`,
  category = `category-${suffix}`,
  section = `section-${suffix}`;
const permissions = ["read", "create", "update", "submit", "approve", "status"].flatMap((action) => [
  `finance.nominal.${action}`,
  `banking.bank_account.${action}`,
]);
function context(userId: string, allowed = permissions): FinanceNominalActorContext {
  return {
    tenantId: sourceTestTenantId,
    actor: {
      tenantId: sourceTestTenantId,
      userId,
      organizationName: "Synthetic test",
      email: `${userId}@uat.nexora.invalid`,
      displayName: userId,
      roles: userId === "r06.override-admin" ? ["super_administrator"] : ["banking_test"],
      permissions: allowed,
      sessionVersion: 1,
    },
  };
}
const maker = context("r06.override-admin", [...permissions, "platform.approval.override"]),
  checker = context("r06.checker");
const key = () => randomUUID();

run("Bank nominal transactional workflow", () => {
  let pool: DatabasePool, repo: SourceFinanceNominalRepository;
  const input = (name = `Operating ${randomUUID()}`) => ({
    company_id: company,
    category_id: category,
    section_id: section,
    name,
    currency: "USD",
  });
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    repo = new SourceFinanceNominalRepository(pool);
    await ensureSourceSuperAdministratorFixture(pool);
    await pool.query(
      `insert into organization_unit (tenant_id,id,type,code,name,status) values ($1,$2,'company',$2,'Synthetic Bank Workflow','active')`,
      [sourceTestTenantId, company],
    );
    await ensureCompanyCurrencyFixture(pool, company, "USD", ["PKR"]);
    await pool.query(
      `insert into account (tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,created_at)
      values ($1,$2,$3,$3,'Current Assets','asset',null,true,'active',false,now()),
             ($1,$2,$4,$4,'Cash & Bank','asset',$3,true,'active',false,now())`,
      [sourceTestTenantId, company, category, section],
    );
    await pool.query(
      `insert into finance_nominal_section_policy (tenant_id,company_id,category_id,section_id,section_role,prefix,code_width,first_value,last_value,next_value)
      values ($1,$2,$3,$4,'cash_and_bank',$5,4,1,9999,1)`,
      [sourceTestTenantId, company, category, section, `WF-${suffix}-`],
    );
    for (const user of [maker, checker, context("r06.maker")])
      await pool.query(
        `insert into security_user_company_access
      (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
      values ($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','synthetic-bank-test')`,
        [sourceTestTenantId, key(), user.actor.userId, company],
      );
    for (const policy of ["r06-uat-policy-approval-override", "r06-uat-policy-checker"]) {
      const grants = [...permissions, "banking.payment.read", "banking.receipt.read"];
      await pool.query(
        `insert into security_role_permission_grant (tenant_id,role_policy_id,permission_key,field_allow_mode)
        select $1,$2,permission,'all' from unnest($3::text[]) permission on conflict do nothing`,
        [sourceTestTenantId, policy, grants],
      );
      await pool.query(
        `insert into security_role_scope_grant (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
        select $1,$2,permission,'company',$3 from unnest($4::text[]) permission on conflict do nothing`,
        [sourceTestTenantId, policy, company, grants],
      );
    }
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("creates distinct canonical nominals with minimal capabilities and safely replays requests", async () => {
    const request = input(),
      requestKey = key();
    const first = await repo.create(maker, request, requestKey, key());
    const replay = await repo.create(maker, request, requestKey, key());
    expect(replay).toEqual({ ...first, replayed: true });
    const second = await repo.create(maker, input(), key(), key());
    expect(second.code).not.toBe(first.code);
    const rows = await pool.query(
      `select a.status,a.name,b.account_name,b.status as bank_status,b.identity_mode,b.bank_name,b.account_number_masked
      from account a join bank_account b on b.tenant_id=a.tenant_id and b.account_id=a.id where a.tenant_id=$1 and a.id=$2`,
      [sourceTestTenantId, first.id],
    );
    expect(rows.rows[0]).toMatchObject({
      status: "active",
      bank_status: "active",
      identity_mode: "nominal_only",
      name: request.name,
      account_name: request.name,
      bank_name: null,
      account_number_masked: null,
    });
    await expect(repo.create(maker, input(), requestKey, key())).rejects.toMatchObject({ status: 409 });
  });

  it("enforces both permission sets, company access, active currency and impersonation restrictions", async () => {
    await expect(
      repo.create(context("r06.maker", ["finance.nominal.create"]), input(), key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(repo.create(context("r06.viewer"), input(), key(), key())).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.create({ ...maker, impersonationRequestId: "synthetic-impersonation" }, input(), key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(repo.create(maker, { ...input(), currency: "ZZZ" }, key(), key())).rejects.toMatchObject({
      code: "NOMINAL_CURRENCY_INVALID",
    });
  });

  it("exposes the canonical code through existing Bank reads and blocks legacy mutation bypass", async () => {
    const created = await repo.create(maker, input(), key(), key());
    const accounts = new SourceBankingRepository(
      pool,
      new BankingIdentifierCrypto(randomBytes(32).toString("base64"), "synthetic-test"),
    );
    const detail = await accounts.getAccount(maker, created.bank_account_id);
    expect(bankAccountDetailSchema.parse(detail)).toMatchObject({
      identity_mode: "nominal_only",
      ledger_account_code: created.code,
      ledger_balance: "0",
      bank_name: null,
      account_number_masked: null,
    });
    expect(
      (
        await accounts.listAccounts(maker, {
          company_id: company,
          search: created.code,
          sort_by: "account_name",
          sort_direction: "asc",
          limit: 10,
        })
      ).items.map((account) => account.id),
    ).toContain(created.bank_account_id);
    await expect(
      accounts.submitAccount(
        maker,
        created.bank_account_id,
        { expected_version: created.version, reason: "Attempted legacy bypass" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "BANK_NOMINAL_WORKFLOW_REQUIRED" });
  });

  it("directly edits active masters, deactivates both records, and preserves immutable history", async () => {
    const created = await repo.create(maker, input(), key(), key());
    const updated = await repo.update(
      maker,
      created.id,
      { expected_version: created.version, name: `Updated ${suffix}`, description: "Synthetic workflow" },
      key(),
      key(),
    );
    await expect(
      repo.update(maker, created.id, { expected_version: created.version, description: "Stale" }, key(), key()),
    ).rejects.toMatchObject({ code: "NOMINAL_VERSION_CONFLICT" });
    const approved = updated;
    const detail = await repo.get(maker, created.id);
    expect(detail).toMatchObject({ banking_available: true, account_status: "active", state: "active" });
    expect(detail.events.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(["created", "updated", "activated"]),
    );
    const selectorContext = context("r06.checker", [...permissions, "banking.payment.read", "banking.receipt.read"]);
    const payments = new SourceBankPaymentRepository(pool),
      receipts = new SourceBankReceiptRepository(pool);
    expect((await payments.options(selectorContext, { company_id: company })).bank_accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.bank_account_id, ledger_account_code: created.code, bank_name: null }),
      ]),
    );
    expect((await receipts.options(selectorContext, { company_id: company })).bank_accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.bank_account_id, ledger_account_code: created.code }),
      ]),
    );
    const disabled = await repo.changeStatus(
      maker,
      created.id,
      { expected_version: approved.version, action: "deactivate", reason: "Synthetic lifecycle complete" },
      key(),
      key(),
    );
    expect(disabled.state).toBe("inactive");
    expect((await repo.get(maker, created.id)).banking_available).toBe(false);
    expect(
      (await payments.options(selectorContext, { company_id: company })).bank_accounts.map((bank) => bank.id),
    ).not.toContain(created.bank_account_id);
    expect(
      (await receipts.options(selectorContext, { company_id: company })).bank_accounts.map((bank) => bank.id),
    ).not.toContain(created.bank_account_id);
  });

  it("rejects a claimed session permission when its persisted company scope is missing", async () => {
    await pool.query(
      `delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-approval-override' and permission_key='finance.nominal.create' and scope_kind='company' and scope_value=$2`,
      [sourceTestTenantId, company],
    );
    try {
      await expect(repo.create(maker, input(), key(), key())).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    } finally {
      await pool.query(
        `insert into security_role_scope_grant (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
        values ($1,'r06-uat-policy-approval-override','finance.nominal.create','company',$2) on conflict do nothing`,
        [sourceTestTenantId, company],
      );
    }
  });

  it("rolls back failed creation without consuming codes or leaving partial records", async () => {
    const request = input(`Duplicate ${suffix}`);
    await repo.create(maker, request, key(), key());
    const before = await pool.query(
      "select next_value from finance_nominal_section_policy where tenant_id=$1 and section_id=$2",
      [sourceTestTenantId, section],
    );
    await expect(repo.create(maker, request, key(), key())).rejects.toMatchObject({ code: "NOMINAL_DUPLICATE" });
    const after = await pool.query(
      "select next_value from finance_nominal_section_policy where tenant_id=$1 and section_id=$2",
      [sourceTestTenantId, section],
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("allocates concurrent creations independently without posting an opening journal", async () => {
    const before = await pool.query(
      "select count(*)::text as count from journal_entry where tenant_id=$1 and company_id=$2",
      [sourceTestTenantId, company],
    );
    const results = await Promise.all(Array.from({ length: 4 }, () => repo.create(maker, input(), key(), key())));
    expect(new Set(results.map((row) => row.code)).size).toBe(4);
    expect(new Set(results.map((row) => row.bank_account_id)).size).toBe(4);
    const after = await pool.query(
      "select count(*)::text as count from journal_entry where tenant_id=$1 and company_id=$2",
      [sourceTestTenantId, company],
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("denies ordinary master mutation and preserves direct activation facts across sessions", async () => {
    const created = await repo.create(maker, input(), key(), key());
    await expect(
      repo.changeStatus(
        checker,
        created.id,
        { expected_version: created.version, action: "deactivate", reason: "Forbidden ordinary change" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.get({ ...maker, tenantId: "other-tenant", actor: { ...maker.actor, tenantId: "other-tenant" } }, created.id),
    ).rejects.toMatchObject({ status: 404 });
    const fresh = new SourceFinanceNominalRepository(pool);
    expect(await fresh.get(checker, created.id)).toMatchObject({ code: created.code, state: "active" });
    const facts = await pool.query("select submitted_by,approved_by from bank_account where tenant_id=$1 and id=$2", [
      sourceTestTenantId,
      created.bank_account_id,
    ]);
    expect(facts.rows).toEqual([{ submitted_by: null, approved_by: null }]);
    const overrides = await pool.query(
      "select count(*) from approval_override_event where tenant_id=$1 and resource_id=$2",
      [sourceTestTenantId, created.bank_account_id],
    );
    expect(overrides.rows[0].count).toBe("0");
  });

  it("posts balanced Payment and Receipt journals through existing Finance services against the new nominal", async () => {
    const created = await repo.create(maker, input(), key(), key());
    await pool.query(
      `insert into fiscal_calendar (id,tenant_id,company_id,year,period_start,period_end,status)
      values ($1,$2,$3,extract(year from current_date)::integer,date_trunc('year',current_date)::date,(date_trunc('year',current_date)+interval '1 year - 1 day')::date,'active')`,
      [`calendar-${suffix}`, sourceTestTenantId, company],
    );
    await pool.query(
      `insert into financial_period (id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at)
      values ($1,$2,$3,$4,extract(month from current_date)::integer,date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date,'open',now())`,
      [`period-${suffix}`, sourceTestTenantId, company, `calendar-${suffix}`],
    );
    await pool.query(
      `insert into account (tenant_id,company_id,id,code,name,type,is_header,status,manual_posting_allowed,created_at)
      values ($1,$2,$3,$3,'Synthetic Expense','expense',false,'active',true,now()),($1,$2,$4,$4,'Synthetic Income','revenue',false,'active',true,now())`,
      [sourceTestTenantId, company, `expense-${suffix}`, `income-${suffix}`],
    );
    const date = (await pool.query<{ day: string }>("select current_date::text as day")).rows[0]!.day;
    const financialPermissions = ["payment", "receipt"].flatMap((kind) =>
      ["read", "create", "submit", "approve", "post"].map((action) => `banking.${kind}.${action}`),
    );
    await pool.query(
      `insert into security_user_company_access (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
      values ($1,$2,'r06.target',$3,false,'r06.last-admin-a','governed_administration','synthetic-bank-posting')`,
      [sourceTestTenantId, key(), company],
    );
    for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"]) {
      await pool.query(
        `insert into security_role_permission_grant (tenant_id,role_policy_id,permission_key,field_allow_mode)
        select $1,$2,permission,'all' from unnest($3::text[]) permission on conflict do nothing`,
        [sourceTestTenantId, policy, financialPermissions],
      );
      await pool.query(
        `insert into security_role_scope_grant (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
        select $1,$2,permission,'company',$3 from unnest($4::text[]) permission on conflict do nothing`,
        [sourceTestTenantId, policy, company, financialPermissions],
      );
    }
    const financialMaker = context("r06.maker", financialPermissions),
      financialChecker = context("r06.checker", financialPermissions),
      poster = context("r06.target", financialPermissions);
    const payments = new SourceBankPaymentRepository(pool),
      receipts = new SourceBankReceiptRepository(pool);
    const common = {
      company_id: company,
      bank_account_id: created.bank_account_id,
      posting_date: date,
      approver_user_id: "r06.checker",
    };
    const line = {
      line_order: 1,
      document_date: date,
      external_reference: `acceptance-${suffix}`,
      narration: "Synthetic nominal posting",
      amount: "12.50",
      dimensions: {},
    };
    for (const kind of ["payment", "receipt"] as const) {
      const repository = kind === "payment" ? payments : receipts;
      const transaction =
        kind === "payment"
          ? await payments.create(
              financialMaker,
              {
                ...common,
                lines: [{ ...line, payment_method: "bank_transfer", nominal_account_id: `expense-${suffix}` }],
              },
              key(),
              key(),
            )
          : await receipts.create(
              financialMaker,
              {
                ...common,
                lines: [
                  {
                    ...line,
                    receipt_method: "bank_transfer",
                    payer_name: "Synthetic Payer",
                    nominal_account_id: `income-${suffix}`,
                  },
                ],
              },
              key(),
              key(),
            );
      const pending = await repository.submit(
        financialMaker,
        transaction.id,
        { expected_version: transaction.version },
        key(),
        key(),
      );
      const approved = await repository.decide(
        financialChecker,
        transaction.id,
        { expected_version: pending.version, action: "approve" },
        key(),
        key(),
      );
      const posted = await repository.post(
        poster,
        transaction.id,
        { expected_version: approved.version },
        key(),
        key(),
      );
      expect(posted.state).toBe("posted");
      const journal = await pool.query(
        `select sum(debit)::text as debit,sum(credit)::text as credit,
        count(*) filter (where account_id=$3)::integer as control_lines from journal_line where tenant_id=$1 and journal_id=$2`,
        [sourceTestTenantId, posted.journal_id, created.id],
      );
      expect(Number(journal.rows[0].debit)).toBe(12.5);
      expect(journal.rows[0].debit).toBe(journal.rows[0].credit);
      expect(journal.rows[0].control_lines).toBe(1);
    }
    await expect(
      repo.update(maker, created.id, { expected_version: created.version, currency: "PKR" }, key(), key()),
    ).rejects.toMatchObject({ status: 409, code: "COA_CURRENCY_IN_USE" });
    await expect(repo.create(maker, { ...input(), currency: "AED" }, key(), key())).rejects.toMatchObject({
      status: 400,
      code: "NOMINAL_CURRENCY_INVALID",
    });
  });
});
