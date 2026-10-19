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
const overrideLedgerAccountId = `bank-override-ledger-${suffix}`;
const overrideActorId = `bank-override-${suffix}`;
const overrideAssignmentId = `bank-override-assignment-${suffix}`;

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
const overrideActor: BankingActorContext = {
  tenantId: sourceTestTenantId,
  actor: {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId: overrideActorId,
    email: `${overrideActorId}@uat.nexora.invalid`,
    displayName: "Bank Override Actor",
    roles: ["super_administrator"],
    permissions: [
      "platform.approval.override",
      "banking.bank_account.read",
      "banking.bank_account.create",
      "banking.bank_account.submit",
      "banking.bank_account.approve",
    ],
    sessionVersion: 1,
  },
};

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
       values
         ($1,$3,$4,$5,'Bank Operating Test','asset',false,'active',true,false,true,now()),
         ($2,$3,$4,$6,'Bank Override Test','asset',false,'active',true,false,true,now())`,
      [
        ledgerAccountId,
        overrideLedgerAccountId,
        sourceTestTenantId,
        companyId,
        `BANK-${suffix}`,
        `BANK-OVERRIDE-${suffix}`,
      ],
    );
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await client.query(
        `insert into security_user_account
          (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at,display_name)
         values ($1,$2,$3,$4,'active','disabled',now(),now(),'Bank Override Actor')`,
        [overrideActorId, sourceTestTenantId, `test:${overrideActorId}`, overrideActor.actor.email],
      );
      await client.query(
        `insert into security_tenant_role
          (tenant_id,role_id,role_code,display_name,description,lifecycle_state,source_kind,source_reference)
         values ($1,'role-super-administrator','super_administrator','Super Administrator',
                 'Controlled override test authority','active','legacy_backfill',$2)
         on conflict (tenant_id,role_code) do nothing`,
        [sourceTestTenantId, `test:${suffix}`],
      );
      const role = await client.query<{ role_id: string }>(
        `select role_id from security_tenant_role
          where tenant_id=$1 and role_code='super_administrator' and lifecycle_state='active'`,
        [sourceTestTenantId],
      );
      await client.query(
        `insert into security_role_policy
          (id,tenant_id,role,scope,permissions,field_rules,sod_rules,version,status,created_at,role_id,lifecycle_state)
         values ('policy-super-administrator',$1,'super_administrator',$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,
                 1,'active',now(),$6,'active')
         on conflict do nothing`,
        [
          sourceTestTenantId,
          JSON.stringify({ mode: "tenant" }),
          JSON.stringify(overrideActor.actor.permissions),
          JSON.stringify({ allow: null, deny: [] }),
          JSON.stringify({ conflicting_roles: [], distinct_actor_fields: [] }),
          role.rows[0]!.role_id,
        ],
      );
      const policy = await client.query<{ id: string }>(
        `select id from security_role_policy
          where tenant_id=$1 and role='super_administrator' and role_id=$2
            and status='active' and lifecycle_state='active'
          order by id limit 1`,
        [sourceTestTenantId, role.rows[0]!.role_id],
      );
      for (const permission of overrideActor.actor.permissions) {
        await client.query(
          `insert into security_role_permission_grant
            (tenant_id,role_policy_id,permission_key,field_allow_mode)
           values ($1,$2,$3,'all') on conflict do nothing`,
          [sourceTestTenantId, policy.rows[0]!.id, permission],
        );
      }
      await client.query(
        `insert into security_user_role_assignment
          (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from)
         values ($1,$2,$3,$2,now(),$4,'active',now())`,
        [sourceTestTenantId, overrideActorId, policy.rows[0]!.id, overrideAssignmentId],
      );
      await client.query(
        `insert into security_user_role_assignment_version
          (tenant_id,assignment_id,version,supersedes_version,user_id,role_policy_id,lifecycle_state,
           valid_from,assigned_by,administration_command_id,source_kind,source_reference)
         values ($1,$2,1,null,$3,$4,'active',now(),$3,null,'legacy_backfill',$5)`,
        [sourceTestTenantId, overrideAssignmentId, overrideActorId, policy.rows[0]!.id, `test:${suffix}`],
      );
      await client.query(
        `insert into security_user_company_access
          (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
         values ($1,$2,$3,$4,true,$3,'governed_administration',$5)`,
        [
          sourceTestTenantId,
          `bank-override-company-access-${suffix}`,
          overrideActorId,
          companyId,
          `test:${suffix}`,
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
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

  it("commits a governed super-admin self-decision with one immutable override event", async () => {
    const accountNumber = `OVERRIDE${suffix}4321`;
    const created = await repository.createAccount(
      overrideActor,
      {
        company_id: companyId,
        account_name: "Governed Override Account",
        account_type: "current",
        bank_name: "Synthetic Override Bank",
        branch: "Controlled Branch",
        account_number: accountNumber,
        currency: "USD",
        ledger_account_id: overrideLedgerAccountId,
        overdraft_limit: "0",
        opening_balance: "0",
      },
      `bank-override-create-${suffix}`,
      `bank-override-correlation-create-${suffix}`,
    );
    const submitted = await repository.submitAccount(
      overrideActor,
      created.id,
      { expected_version: created.version, reason: "Ready for governed self-review" },
      `bank-override-submit-${suffix}`,
      `bank-override-correlation-submit-${suffix}`,
    );
    const decided = await repository.decideAccount(
      overrideActor,
      created.id,
      { action: "approve", expected_version: submitted.version, reason: "Emergency treasury setup verified" },
      `bank-override-decide-${suffix}`,
      `bank-override-correlation-decide-${suffix}`,
    );
    expect(decided).toMatchObject({ state: "active", version: submitted.version + 1, replayed: false });

    const replayed = await repository.decideAccount(
      overrideActor,
      created.id,
      { action: "approve", expected_version: submitted.version, reason: "Emergency treasury setup verified" },
      `bank-override-decide-${suffix}`,
      `bank-override-correlation-replay-${suffix}`,
    );
    expect(replayed).toMatchObject({ id: created.id, state: "active", replayed: true });

    const evidence = await pool.query<{
      approval_override_event_id: string;
      override_count: string;
      event_override: boolean;
      audit_reference: string;
    }>(
      `select bank.approval_override_event_id,
              (select count(*)::text from approval_override_event event
                where event.tenant_id=bank.tenant_id and event.resource_type='banking.bank_account'
                  and event.resource_id=bank.id) as override_count,
              coalesce((select (event.state_snapshot->>'super_admin_override')::boolean
                from bank_account_event event
               where event.tenant_id=bank.tenant_id and event.account_id=bank.id
                 and event.event_type='approved' order by event.occurred_at desc limit 1),false) as event_override,
              coalesce((select audit.approval_reference from platform_admin_audit_event audit
                where audit.tenant_id=bank.tenant_id and audit.entity_type='bank_account'
                  and audit.entity_id=bank.id and audit.action='banking.bank_account.approve'
                order by audit.sequence desc limit 1),'') as audit_reference
         from bank_account bank where bank.tenant_id=$1 and bank.id=$2`,
      [sourceTestTenantId, created.id],
    );
    expect(evidence.rows[0]?.approval_override_event_id).toMatch(/^approval-override-/);
    expect(evidence.rows[0]).toMatchObject({
      override_count: "1",
      event_override: true,
      audit_reference: evidence.rows[0]?.approval_override_event_id,
    });

    const detail = await repository.getAccount(overrideActor, created.id);
    expect(detail).toMatchObject({
      state: "active",
      self_decision_requires_override: true,
      super_admin_override_allowed: true,
    });
  });
});
