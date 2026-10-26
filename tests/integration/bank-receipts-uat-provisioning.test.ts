import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceTenantAuthenticationRepository } from "../../server/api/src/modules/auth/source-repository.js";
import { SourceBankReceiptRepository } from "../../server/api/src/modules/banking/receipts/source-repository.js";
import { BankingApiError, type BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { SourceSecurityAdministrationRepository } from "../../server/api/src/modules/security/source-administration-repository.js";
import {
  bankReceiptPermissions,
  ensureSourceAuthorizationFixture,
  sourceTestCompanyId,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const executeFile = promisify(execFile);
const encryptionKey = Buffer.alloc(32, 29).toString("base64");
const controlledPassword = "NexoraLocal!2026-ProvisioningTest";
const provisionCommand = ["node_modules/tsx/dist/cli.mjs", "scripts/provision-bank-receipts-uat.ts"];

async function context(pool: DatabasePool, userId: string): Promise<BankingActorContext> {
  const actor = await new SourceTenantAuthenticationRepository(pool).loadAuthenticatedAccount(
    sourceTestTenantId,
    userId,
    new Date(),
  );
  if (!actor) throw new Error(`Missing controlled actor ${userId}`);
  return { tenantId: sourceTestTenantId, actor };
}

run("Bank Receipt controlled UAT provisioning", () => {
  let pool: DatabasePool;
  let repository: SourceBankReceiptRepository;
  let maker: BankingActorContext;
  let checker: BankingActorContext;
  let poster: BankingActorContext;
  let overrideAdmin: BankingActorContext;
  let shoaib: BankingActorContext;
  let bankAccountId: string;
  let postingDate: string;
  let provisionEnvironment: NodeJS.ProcessEnv;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);

    provisionEnvironment = {
      ...process.env,
      DATABASE_URL: databaseUrl!,
      NEXORA_ENVIRONMENT: "uat",
      NEXORA_UAT_CONFIRM: sourceTestTenantId,
      BANKING_DATA_ENCRYPTION_KEY: encryptionKey,
      BANKING_DATA_ENCRYPTION_KEY_VERSION: "acceptance-v1",
    };
    const shoaibProvisioning = await executeFile(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/provision-shoaib-admin.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...provisionEnvironment,
          NEXORA_SHOAIB_PASSWORD: controlledPassword,
          AUTH_LOGIN_DIRECTORY_SECRET: "provisioning-test-directory-secret-2026",
        },
        timeout: 120_000,
      },
    );
    const first = await executeFile(process.execPath, provisionCommand, {
      cwd: process.cwd(),
      env: provisionEnvironment,
      timeout: 120_000,
    });
    const second = await executeFile(process.execPath, provisionCommand, {
      cwd: process.cwd(),
      env: provisionEnvironment,
      timeout: 120_000,
    });
    expect(first.stdout).not.toContain(encryptionKey);
    expect(first.stdout).not.toContain(controlledPassword);
    expect(second.stdout).not.toContain(encryptionKey);
    expect(second.stdout).not.toContain(controlledPassword);
    expect(first.stderr).not.toContain(encryptionKey);
    expect(first.stderr).not.toContain(controlledPassword);
    expect(second.stderr).not.toContain(encryptionKey);
    expect(second.stderr).not.toContain(controlledPassword);
    expect(shoaibProvisioning.stdout).not.toContain(controlledPassword);
    expect(shoaibProvisioning.stderr).not.toContain(controlledPassword);

    [maker, checker, poster, overrideAdmin, shoaib] = await Promise.all([
      context(pool, "r06.maker"),
      context(pool, "r06.checker"),
      context(pool, "r06.target"),
      context(pool, "r06.override-admin"),
      context(pool, "user-shoaib-super-admin"),
    ]);
    repository = new SourceBankReceiptRepository(pool);
    const authority = await pool.query<{ bank_account_id: string; posting_date: string }>(
      `select bank.id as bank_account_id,current_date::text as posting_date
         from bank_account bank
        where bank.tenant_id=$1 and bank.company_id=$2
          and bank.account_id='r06-uat-bank-receipt-control' and bank.status='active'`,
      [sourceTestTenantId, sourceTestCompanyId],
    );
    bankAccountId = authority.rows[0]!.bank_account_id;
    postingDate = authority.rows[0]!.posting_date;
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("is repeatable and grants all seven permissions dynamically to Shoaib's governed super-admin policy", async () => {
    const expected = {
      "r06.maker": [
        "banking.receipt.create",
        "banking.receipt.read",
        "banking.receipt.submit",
        "banking.receipt.update",
      ],
      "r06.checker": ["banking.receipt.approve", "banking.receipt.read"],
      "r06.target": ["banking.receipt.post", "banking.receipt.read", "banking.receipt.reverse"],
    } as const;
    for (const actor of [maker.actor, checker.actor, poster.actor]) {
      expect(actor.permissions.filter((permission) => permission.startsWith("banking.receipt.")).sort()).toEqual([
        ...expected[actor.userId as keyof typeof expected],
      ]);
    }
    expect(shoaib.actor.roles).toContain("super_administrator");
    expect(shoaib.actor.permissions).toEqual(
      expect.arrayContaining([...bankReceiptPermissions, "platform.approval.override"]),
    );

    const evidence = await pool.query<{
      bank_account_count: number;
      company_scope_count: number;
      shoaib_assignment_count: number;
    }>(
      `select
         (select count(*)::int from bank_account
           where tenant_id=$1 and company_id=$2 and account_id='r06-uat-bank-receipt-control') as bank_account_count,
         (select count(*)::int from security_role_scope_grant
           where tenant_id=$1 and scope_kind='company' and scope_value=$2
             and permission_key=any($3::text[])) as company_scope_count,
         (select count(*)::int from security_user_role_assignment
           where tenant_id=$1 and user_id='user-shoaib-super-admin'
             and lifecycle_state='active') as shoaib_assignment_count`,
      [sourceTestTenantId, sourceTestCompanyId, bankReceiptPermissions],
    );
    expect(evidence.rows[0]).toEqual({
      bank_account_count: 1,
      company_scope_count: 9,
      shoaib_assignment_count: 1,
    });

    const scopedPermissions = await pool.query<{
      policy_id: string;
      permission_key: string;
      scope_kind: string;
      scope_value: string;
    }>(
      `select grant_row.role_policy_id as policy_id,grant_row.permission_key,
              scope.scope_kind,scope.scope_value
         from security_role_permission_grant grant_row
         join security_role_scope_grant scope
           on scope.tenant_id=grant_row.tenant_id
          and scope.role_policy_id=grant_row.role_policy_id
          and scope.permission_key=grant_row.permission_key
        where grant_row.tenant_id=$1
          and grant_row.role_policy_id=any($2::text[])
          and grant_row.permission_key like 'banking.receipt.%'
        order by grant_row.role_policy_id,grant_row.permission_key,scope.scope_kind,scope.scope_value`,
      [sourceTestTenantId, ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"]],
    );
    expect(scopedPermissions.rows).toEqual([
      {
        policy_id: "r06-uat-policy-checker",
        permission_key: "banking.receipt.approve",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-checker",
        permission_key: "banking.receipt.read",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-maker",
        permission_key: "banking.receipt.create",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-maker",
        permission_key: "banking.receipt.read",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-maker",
        permission_key: "banking.receipt.submit",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-maker",
        permission_key: "banking.receipt.update",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-payment-poster",
        permission_key: "banking.receipt.post",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-payment-poster",
        permission_key: "banking.receipt.read",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-payment-poster",
        permission_key: "banking.receipt.reverse",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
    ]);

    const sod = await pool.query<{ role_policy_id: string; conflicting_role_id: string }>(
      `select role_policy_id,conflicting_role_id from security_role_assignment_sod_rule
        where tenant_id=$1 and role_policy_id=any($2::text[])
        order by role_policy_id,conflicting_role_id`,
      [sourceTestTenantId, ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"]],
    );
    expect(sod.rows).toEqual([
      { role_policy_id: "r06-uat-policy-checker", conflicting_role_id: "r06-uat-role-maker" },
      { role_policy_id: "r06-uat-policy-checker", conflicting_role_id: "r06-uat-role-payment-poster" },
      { role_policy_id: "r06-uat-policy-maker", conflicting_role_id: "r06-uat-role-checker" },
      { role_policy_id: "r06-uat-policy-maker", conflicting_role_id: "r06-uat-role-payment-poster" },
      { role_policy_id: "r06-uat-policy-payment-poster", conflicting_role_id: "r06-uat-role-checker" },
      { role_policy_id: "r06-uat-policy-payment-poster", conflicting_role_id: "r06-uat-role-maker" },
    ]);

    const roleAssignments = await pool.query<{ user_id: string; role_policy_id: string }>(
      `select user_id,role_policy_id from security_user_role_assignment
        where tenant_id=$1 and role_policy_id=any($2::text[]) and lifecycle_state='active'
        order by role_policy_id,user_id`,
      [sourceTestTenantId, ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"]],
    );
    expect(roleAssignments.rows).toEqual([
      { user_id: "r06.checker", role_policy_id: "r06-uat-policy-checker" },
      { user_id: "r06.maker", role_policy_id: "r06-uat-policy-maker" },
      { user_id: "r06.target", role_policy_id: "r06-uat-policy-payment-poster" },
    ]);

    const security = new SourceSecurityAdministrationRepository(pool);
    const suffix = randomUUID().slice(0, 8);
    const securityContext = {
      tenantId: sourceTestTenantId,
      actor: shoaib.actor,
      correlationId: `uat-sod-${suffix}`,
    };
    const assignmentRequest = await security.createAssignmentRequest(
      securityContext,
      {
        requested_action: "create",
        proposal: {
          target_user_id: "r06.maker",
          role_policy_id: "r06-uat-policy-payment-poster",
          assignment_id: null,
          valid_from: new Date().toISOString(),
          valid_until: null,
          revocation_reason: null,
        },
      },
      `uat-sod-create-${suffix}`,
    );
    await security.actOnAssignmentRequest(
      securityContext,
      { action: "submit", request_id: assignmentRequest.entity_id, expected_version: 1 },
      `uat-sod-submit-${suffix}`,
    );
    await expect(
      security.decideApproval(
        securityContext,
        {
          resource_type: "assignment",
          request_id: assignmentRequest.entity_id,
          decision: "approved",
          reason: "Controlled SOD rejection evidence",
          expected_version: 2,
        },
        `uat-sod-decide-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "SOD_VIOLATION" });
  });

  it("enforces distinct maker/checker/poster roles and persists an exact posted-then-reversed workflow", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await repository.create(
      maker,
      {
        company_id: sourceTestCompanyId,
        bank_account_id: bankAccountId,
        posting_date: postingDate,
        value_date: postingDate,
        lines: [
          {
            line_order: 1,
            document_date: postingDate,
            external_reference: `UAT-${suffix}`,
            document_reference: `DOC-${suffix}`,
            receipt_method: "bank_transfer",
            payer_name: "Synthetic UAT Customer",
            nominal_account_id: "r06-uat-bank-receipt-income",
            narration: "Synthetic controlled UAT receipt",
            amount: "125.00",
            dimensions: { department: "R06-UAT" },
          },
        ],
      },
      `uat-receipt-create-${suffix}`,
      `uat-receipt-create-${suffix}`,
    );
    const submitted = await repository.submit(
      maker,
      created.id,
      { expected_version: created.version },
      `uat-receipt-submit-${suffix}`,
      `uat-receipt-submit-${suffix}`,
    );
    await expect(
      repository.decide(
        maker,
        created.id,
        { action: "approve", expected_version: submitted.version },
        `uat-receipt-maker-approve-${suffix}`,
        `uat-receipt-maker-approve-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "PERMISSION_DENIED" });
    const approved = await repository.decide(
      checker,
      created.id,
      { action: "approve", expected_version: submitted.version },
      `uat-receipt-approve-${suffix}`,
      `uat-receipt-approve-${suffix}`,
    );
    await expect(
      repository.post(
        checker,
        created.id,
        { expected_version: approved.version },
        `uat-receipt-checker-post-${suffix}`,
        `uat-receipt-checker-post-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "PERMISSION_DENIED" });
    const posted = await repository.post(
      poster,
      created.id,
      { expected_version: approved.version },
      `uat-receipt-post-${suffix}`,
      `uat-receipt-post-${suffix}`,
    );
    const reversed = await repository.reverse(
      poster,
      created.id,
      { expected_version: posted.version, reason: "Controlled acceptance reversal" },
      `uat-receipt-reverse-${suffix}`,
      `uat-receipt-reverse-${suffix}`,
    );
    expect(reversed).toMatchObject({ state: "reversed", version: 5, replayed: false });

    const persisted = await pool.query<{
      state: string;
      created_by: string;
      approved_by: string;
      posted_by: string;
      reversed_by: string;
      event_count: number;
      journal_count: number;
      original_journal_status: string;
      reversal_journal_status: string;
      original_debit_total: string;
      original_credit_total: string;
      reversal_debit_total: string;
      reversal_credit_total: string;
      bank_net_movement: string;
    }>(
      `select receipt.state,receipt.created_by,receipt.approved_by,receipt.posted_by,receipt.reversed_by,
              (select count(*)::int from bank_receipt_event event
                where event.tenant_id=receipt.tenant_id and event.receipt_id=receipt.id) as event_count,
              (select count(*)::int from journal_entry journal
                where journal.tenant_id=receipt.tenant_id
                  and journal.id in (receipt.original_journal_entry_id,receipt.reversal_journal_entry_id)) as journal_count,
              (select journal.status from journal_entry journal
                where journal.tenant_id=receipt.tenant_id and journal.id=receipt.original_journal_entry_id)
                as original_journal_status,
              (select journal.status from journal_entry journal
                where journal.tenant_id=receipt.tenant_id and journal.id=receipt.reversal_journal_entry_id)
                as reversal_journal_status,
              (select sum(line.base_debit)::text from journal_line line
                where line.tenant_id=receipt.tenant_id and line.journal_id=receipt.original_journal_entry_id)
                as original_debit_total,
              (select sum(line.base_credit)::text from journal_line line
                where line.tenant_id=receipt.tenant_id and line.journal_id=receipt.original_journal_entry_id)
                as original_credit_total,
              (select sum(line.base_debit)::text from journal_line line
                where line.tenant_id=receipt.tenant_id and line.journal_id=receipt.reversal_journal_entry_id)
                as reversal_debit_total,
              (select sum(line.base_credit)::text from journal_line line
                where line.tenant_id=receipt.tenant_id and line.journal_id=receipt.reversal_journal_entry_id)
                as reversal_credit_total,
              (select coalesce(sum(line.base_debit-line.base_credit),0)::text
                 from journal_line line
                where line.tenant_id=receipt.tenant_id
                  and line.journal_id in (receipt.original_journal_entry_id,receipt.reversal_journal_entry_id)
                  and line.account_id='r06-uat-bank-receipt-control') as bank_net_movement
         from bank_receipt receipt where receipt.tenant_id=$1 and receipt.id=$2`,
      [sourceTestTenantId, created.id],
    );
    expect(persisted.rows[0]).toMatchObject({
      state: "reversed",
      created_by: "r06.maker",
      approved_by: "r06.checker",
      posted_by: "r06.target",
      reversed_by: "r06.target",
      event_count: 5,
      journal_count: 2,
      original_journal_status: "reversed",
      reversal_journal_status: "posted",
      bank_net_movement: "0.00000000",
    });
    expect(persisted.rows[0]?.original_debit_total).toBe(persisted.rows[0]?.original_credit_total);
    expect(persisted.rows[0]?.reversal_debit_total).toBe(persisted.rows[0]?.reversal_credit_total);
    expect(persisted.rows[0]?.reversal_debit_total).toBe(persisted.rows[0]?.original_debit_total);
  });

  it("records governed super-admin approval override evidence and enforces company and tenant isolation", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await repository.create(
      overrideAdmin,
      {
        company_id: sourceTestCompanyId,
        bank_account_id: bankAccountId,
        posting_date: postingDate,
        lines: [
          {
            line_order: 1,
            document_date: postingDate,
            external_reference: `OVERRIDE-${suffix}`,
            document_reference: `OVERRIDE-DOC-${suffix}`,
            receipt_method: "online",
            payer_name: "Synthetic Override Customer",
            nominal_account_id: "r06-uat-bank-receipt-income",
            narration: "Synthetic approval override evidence",
            amount: "25.00",
            dimensions: { department: "R06-UAT" },
          },
        ],
      },
      `uat-receipt-override-create-${suffix}`,
      `uat-receipt-override-create-${suffix}`,
    );
    const submitted = await repository.submit(
      overrideAdmin,
      created.id,
      { expected_version: created.version },
      `uat-receipt-override-submit-${suffix}`,
      `uat-receipt-override-submit-${suffix}`,
    );
    const approved = await repository.decide(
      overrideAdmin,
      created.id,
      {
        action: "approve",
        expected_version: submitted.version,
        reason: "Controlled super-administrator continuity decision",
      },
      `uat-receipt-override-approve-${suffix}`,
      `uat-receipt-override-approve-${suffix}`,
    );
    expect(approved.state).toBe("approved");
    const overrideEvidence = await pool.query<{ event_count: number; override_id: string | null }>(
      `select
         (select count(*)::int from approval_override_event event
           where event.tenant_id=receipt.tenant_id and event.event_id=receipt.approval_override_event_id
             and event.resource_type='banking.receipt'
             and event.normal_permission_key='banking.receipt.approve') as event_count,
         receipt.approval_override_event_id as override_id
       from bank_receipt receipt where receipt.tenant_id=$1 and receipt.id=$2`,
      [sourceTestTenantId, created.id],
    );
    expect(overrideEvidence.rows[0]?.event_count).toBe(1);
    expect(overrideEvidence.rows[0]?.override_id).toBeTruthy();

    const secondaryCompanyAccess = await pool.query<{ count: number }>(
      `select count(distinct user_id)::int as count from security_user_company_access
        where tenant_id=$1 and company_id='nexora-r06-uat-company-two'
          and user_id=any($2::text[]) and revoked_at is null`,
      [sourceTestTenantId, ["r06.maker", "r06.checker"]],
    );
    expect(secondaryCompanyAccess.rows[0]?.count).toBe(2);
    const companyTwoQuery = {
      company_id: "nexora-r06-uat-company-two",
      sort_by: "posting_date",
      sort_direction: "desc",
      limit: 10,
    } as const;
    await expect(repository.list(maker, companyTwoQuery)).rejects.toMatchObject<Partial<BankingApiError>>({
      status: 403,
      code: "PERMISSION_DENIED",
    });
    await expect(repository.list(checker, companyTwoQuery)).rejects.toMatchObject<Partial<BankingApiError>>({
      status: 403,
      code: "PERMISSION_DENIED",
    });

    await expect(
      repository.get(
        {
          tenantId: "nexora-bank-receipt-isolation-uat",
          actor: { ...maker.actor, tenantId: "nexora-bank-receipt-isolation-uat" },
        },
        created.id,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 404, code: "RECEIPT_NOT_FOUND" });
  });

  it("fails closed without leaking secrets when reserved synthetic authority conflicts", async () => {
    await pool.query(
      `update currency set name='Conflicting Synthetic Authority',updated_at=now()
        where tenant_id=$1 and code='XBR'`,
      [sourceTestTenantId],
    );
    let failure: unknown;
    try {
      await executeFile(process.execPath, provisionCommand, {
        cwd: process.cwd(),
        env: provisionEnvironment,
        timeout: 120_000,
      });
    } catch (error) {
      failure = error;
    } finally {
      await pool.query(
        `update currency set name='Synthetic Bank Receipt Unit',updated_at=now()
          where tenant_id=$1 and code='XBR'`,
        [sourceTestTenantId],
      );
    }
    expect(failure).toBeTruthy();
    const processFailure = failure as Error & { stdout?: string; stderr?: string };
    expect(processFailure.stderr).toContain(
      "The reserved synthetic Bank Receipt currency conflicts with expected authority",
    );
    for (const output of [processFailure.stdout ?? "", processFailure.stderr ?? ""]) {
      expect(output).not.toContain(encryptionKey);
      expect(output).not.toContain(controlledPassword);
    }
  });
});
