import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { BankingIdentifierCrypto } from "../../server/api/src/modules/banking/crypto.js";
import {
  BankingApiError,
  SourceBankingRepository,
  type BankingActorContext,
} from "../../server/api/src/modules/banking/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const suffix = randomUUID().slice(0, 8);
const companyId = "nexora-r06-uat-company";
const outsideCompanyId = `bank-outside-company-${suffix}`;
const ledgerAccountId = `bank-ledger-${suffix}`;

function context(userId: string, permissions: string[]): BankingActorContext {
  const actor: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: ["banking_test"],
    permissions,
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor };
}

const maker = context("r06.maker", [
  "banking.bank_account.read",
  "banking.bank_account.create",
  "banking.bank_account.update",
  "banking.bank_account.submit",
  "banking.bank_account.approve",
]);
const checker = context("r06.checker", ["banking.bank_account.read", "banking.bank_account.approve"]);

run("Banking account foundation repository", () => {
  let pool: DatabasePool;
  let repository: SourceBankingRepository;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    await pool.query(
      `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
       values ($1,$2,null,'company',$3,'Banking Outside Scope','active')`,
      [outsideCompanyId, sourceTestTenantId, `BANK-OUT-${suffix}`],
    );
    await pool.query(
      `insert into account
        (id,tenant_id,company_id,code,name,type,is_header,status,manual_posting_allowed,
         is_system_account,reconciliation_required,created_at)
       values ($1,$2,$3,$4,'Bank Operating Test','asset',false,'active',true,false,true,now())`,
      [ledgerAccountId, sourceTestTenantId, companyId, `BANK-${suffix}`],
    );
    repository = new SourceBankingRepository(
      pool,
      new BankingIdentifierCrypto(Buffer.alloc(32, 19).toString("base64"), "integration-v1"),
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists encrypted identifiers and enforces the independent approval lifecycle", async () => {
    const createInput = {
      company_id: companyId,
      account_name: "Controlled Operating Account",
      account_type: "current" as const,
      bank_name: "Synthetic Test Bank",
      branch: "Controlled Branch",
      account_number: `ACCT${suffix}7890`,
      iban: `PK00SYNTHETIC${suffix.toUpperCase()}`,
      swift_bic: "SYNTPKKA",
      currency: "USD",
      ledger_account_id: ledgerAccountId,
      overdraft_limit: "0",
      opening_balance: "0",
    };
    const created = await repository.createAccount(maker, createInput, `bank-create-${suffix}`, `corr-${suffix}-1`);
    expect(created).toMatchObject({ state: "draft", version: 1, replayed: false });

    const replayed = await repository.createAccount(maker, createInput, `bank-create-${suffix}`, `corr-${suffix}-2`);
    expect(replayed).toMatchObject({ id: created.id, state: "draft", version: 1, replayed: true });
    await expect(
      repository.createAccount(
        maker,
        { ...createInput, account_name: "Conflicting idempotent request" },
        `bank-create-${suffix}`,
        `corr-${suffix}-conflict`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 409, code: "IDEMPOTENCY_CONFLICT" });

    const protectedRow = await pool.query<{
      account_number_ciphertext: Buffer;
      account_number_hash: string;
      account_number_masked: string;
    }>(
      `select account_number_ciphertext,account_number_hash,account_number_masked
         from bank_account where tenant_id=$1 and id=$2`,
      [sourceTestTenantId, created.id],
    );
    expect(protectedRow.rows[0]?.account_number_ciphertext.toString("utf8")).not.toContain(createInput.account_number);
    expect(protectedRow.rows[0]?.account_number_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(protectedRow.rows[0]?.account_number_masked).toBe("•••• 7890");

    const revised = await repository.updateAccount(
      maker,
      created.id,
      { expected_version: 1, iban: null, swift_bic: null },
      `bank-update-${suffix}`,
      `corr-${suffix}-3`,
    );
    expect(revised).toMatchObject({ state: "draft", version: 2 });
    const cleared = await pool.query<{ iban_ciphertext: Buffer | null; swift_bic: string }>(
      `select iban_ciphertext,swift_bic from bank_account where tenant_id=$1 and id=$2`,
      [sourceTestTenantId, created.id],
    );
    expect(cleared.rows[0]).toEqual({ iban_ciphertext: null, swift_bic: "" });

    const submitted = await repository.submitAccount(
      maker,
      created.id,
      { expected_version: 2, reason: "Ready for independent review" },
      `bank-submit-${suffix}`,
      `corr-${suffix}-4`,
    );
    expect(submitted).toMatchObject({ state: "pending_approval", version: 3 });

    await expect(
      repository.decideAccount(
        maker,
        created.id,
        { action: "approve", expected_version: 3, reason: "Maker must not self-approve" },
        `bank-self-approve-${suffix}`,
        `corr-${suffix}-5`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "MAKER_CHECKER_REQUIRED" });

    const approved = await repository.decideAccount(
      checker,
      created.id,
      { action: "approve", expected_version: 3, reason: "Independent verification complete" },
      `bank-approve-${suffix}`,
      `corr-${suffix}-6`,
    );
    expect(approved).toMatchObject({ state: "active", version: 4 });

    const detail = await repository.getAccount(maker, created.id);
    expect(detail).toMatchObject({
      id: created.id,
      state: "active",
      ledger_balance: "0",
      available_balance: null,
      iban_masked: null,
      swift_bic: "",
    });
    expect(JSON.stringify(detail)).not.toContain(createInput.account_number);

    const evidence = await pool.query<{ event_count: string; audit_count: string }>(
      `select
        (select count(*)::text from bank_account_event where tenant_id=$1 and account_id=$2) event_count,
        (select count(*)::text from platform_admin_audit_event
          where tenant_id=$1 and entity_type='bank_account' and entity_id=$2) audit_count`,
      [sourceTestTenantId, created.id],
    );
    expect(evidence.rows[0]).toEqual({ event_count: "4", audit_count: "4" });

    await expect(
      repository.createAccount(
        maker,
        { ...createInput, account_name: "Duplicate Ledger Mapping", account_number: `OTHER${suffix}4321` },
        `bank-ledger-duplicate-${suffix}`,
        `corr-${suffix}-7`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 409, code: "BANK_ACCOUNT_DUPLICATE" });
  });

  it("rejects access to a company outside the authenticated user's scope", async () => {
    const restricted = context("r06.restricted", ["banking.bank_account.read"]);
    await expect(
      repository.listAccounts(restricted, {
        company_id: outsideCompanyId,
        sort_by: "account_name",
        sort_direction: "asc",
        limit: 25,
      }),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "COMPANY_ACCESS_DENIED" });
  });
});
