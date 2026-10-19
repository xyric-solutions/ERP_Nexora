import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceTenantAuthenticationRepository } from "../../server/api/src/modules/auth/source-repository.js";
import { SourceBankPaymentRepository } from "../../server/api/src/modules/banking/payments/source-repository.js";
import { BankingApiError, type BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { SourceSecurityAdministrationRepository } from "../../server/api/src/modules/security/source-administration-repository.js";
import {
  bankPaymentPermissions,
  ensureSourceAuthorizationFixture,
  sourceTestCompanyId,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const executeFile = promisify(execFile);
const encryptionKey = Buffer.alloc(32, 29).toString("base64");
const controlledPassword = "NexoraLocal!2026-ProvisioningTest";
const provisionCommand = ["node_modules/tsx/dist/cli.mjs", "scripts/provision-bank-payments-uat.ts"];

async function context(pool: DatabasePool, userId: string): Promise<BankingActorContext> {
  const actor = await new SourceTenantAuthenticationRepository(pool).loadAuthenticatedAccount(
    sourceTestTenantId,
    userId,
    new Date(),
  );
  if (!actor) throw new Error(`Missing controlled actor ${userId}`);
  return { tenantId: sourceTestTenantId, actor };
}

run("Bank Payment controlled UAT provisioning", () => {
  let pool: DatabasePool;
  let repository: SourceBankPaymentRepository;
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
    repository = new SourceBankPaymentRepository(pool);
    const authority = await pool.query<{ bank_account_id: string; posting_date: string }>(
      `select bank.id as bank_account_id,current_date::text as posting_date
         from bank_account bank
        where bank.tenant_id=$1 and bank.company_id=$2
          and bank.account_id='r06-uat-bank-payment-control' and bank.status='active'`,
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
        "banking.payment.create",
        "banking.payment.read",
        "banking.payment.submit",
        "banking.payment.update",
      ],
      "r06.checker": ["banking.payment.approve", "banking.payment.read"],
      "r06.target": ["banking.payment.post", "banking.payment.read", "banking.payment.reverse"],
    } as const;
    for (const actor of [maker.actor, checker.actor, poster.actor]) {
      expect(actor.permissions.filter((permission) => permission.startsWith("banking.payment.")).sort()).toEqual([
        ...expected[actor.userId as keyof typeof expected],
      ]);
    }
    expect(shoaib.actor.roles).toContain("super_administrator");
    expect(shoaib.actor.permissions).toEqual(
      expect.arrayContaining([...bankPaymentPermissions, "platform.approval.override"]),
    );

    const evidence = await pool.query<{
      bank_account_count: number;
      company_scope_count: number;
      shoaib_assignment_count: number;
    }>(
      `select
         (select count(*)::int from bank_account
           where tenant_id=$1 and company_id=$2 and account_id='r06-uat-bank-payment-control') as bank_account_count,
         (select count(*)::int from security_role_scope_grant
           where tenant_id=$1 and scope_kind='company' and scope_value=$2
             and permission_key=any($3::text[])) as company_scope_count,
         (select count(*)::int from security_user_role_assignment
           where tenant_id=$1 and user_id='user-shoaib-super-admin'
             and lifecycle_state='active') as shoaib_assignment_count`,
      [sourceTestTenantId, sourceTestCompanyId, bankPaymentPermissions],
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
          and grant_row.permission_key like 'banking.payment.%'
        order by grant_row.role_policy_id,grant_row.permission_key,scope.scope_kind,scope.scope_value`,
      [sourceTestTenantId, ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"]],
    );
    expect(scopedPermissions.rows).toEqual([
      {
        policy_id: "r06-uat-policy-checker",
        permission_key: "banking.payment.approve",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-checker",
        permission_key: "banking.payment.read",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-maker",
        permission_key: "banking.payment.create",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-maker",
        permission_key: "banking.payment.read",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-maker",
        permission_key: "banking.payment.submit",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-maker",
        permission_key: "banking.payment.update",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-payment-poster",
        permission_key: "banking.payment.post",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-payment-poster",
        permission_key: "banking.payment.read",
        scope_kind: "company",
        scope_value: sourceTestCompanyId,
      },
      {
        policy_id: "r06-uat-policy-payment-poster",
        permission_key: "banking.payment.reverse",
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
            payment_method: "bank_transfer",
            nominal_account_id: "r06-uat-bank-payment-expense",
            narration: "Synthetic controlled UAT payment",
            amount: "125.00",
            dimensions: { department: "R06-UAT" },
          },
        ],
      },
      `uat-payment-create-${suffix}`,
      `uat-payment-create-${suffix}`,
    );
    const submitted = await repository.submit(
      maker,
      created.id,
      { expected_version: created.version },
      `uat-payment-submit-${suffix}`,
      `uat-payment-submit-${suffix}`,
    );
    await expect(
      repository.decide(
        maker,
        created.id,
        { action: "approve", expected_version: submitted.version },
        `uat-payment-maker-approve-${suffix}`,
        `uat-payment-maker-approve-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "PERMISSION_DENIED" });
    const approved = await repository.decide(
      checker,
      created.id,
      { action: "approve", expected_version: submitted.version },
      `uat-payment-approve-${suffix}`,
      `uat-payment-approve-${suffix}`,
    );
    await expect(
      repository.post(
        checker,
        created.id,
        { expected_version: approved.version },
        `uat-payment-checker-post-${suffix}`,
        `uat-payment-checker-post-${suffix}`,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 403, code: "PERMISSION_DENIED" });
    const posted = await repository.post(
      poster,
      created.id,
      { expected_version: approved.version },
      `uat-payment-post-${suffix}`,
      `uat-payment-post-${suffix}`,
    );
    const reversed = await repository.reverse(
      poster,
      created.id,
      { expected_version: posted.version, reason: "Controlled acceptance reversal" },
      `uat-payment-reverse-${suffix}`,
      `uat-payment-reverse-${suffix}`,
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
    }>(
      `select payment.state,payment.created_by,payment.approved_by,payment.posted_by,payment.reversed_by,
              (select count(*)::int from bank_payment_event event
                where event.tenant_id=payment.tenant_id and event.payment_id=payment.id) as event_count,
              (select count(*)::int from journal_entry journal
                where journal.tenant_id=payment.tenant_id
                  and journal.id in (payment.original_journal_entry_id,payment.reversal_journal_entry_id)) as journal_count
         from bank_payment payment where payment.tenant_id=$1 and payment.id=$2`,
      [sourceTestTenantId, created.id],
    );
    expect(persisted.rows[0]).toEqual({
      state: "reversed",
      created_by: "r06.maker",
      approved_by: "r06.checker",
      posted_by: "r06.target",
      reversed_by: "r06.target",
      event_count: 5,
      journal_count: 2,
    });
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
            payment_method: "online",
            nominal_account_id: "r06-uat-bank-payment-expense",
            narration: "Synthetic approval override evidence",
            amount: "25.00",
            dimensions: { department: "R06-UAT" },
          },
        ],
      },
      `uat-payment-override-create-${suffix}`,
      `uat-payment-override-create-${suffix}`,
    );
    const submitted = await repository.submit(
      overrideAdmin,
      created.id,
      { expected_version: created.version },
      `uat-payment-override-submit-${suffix}`,
      `uat-payment-override-submit-${suffix}`,
    );
    const approved = await repository.decide(
      overrideAdmin,
      created.id,
      {
        action: "approve",
        expected_version: submitted.version,
        reason: "Controlled super-administrator continuity decision",
      },
      `uat-payment-override-approve-${suffix}`,
      `uat-payment-override-approve-${suffix}`,
    );
    expect(approved.state).toBe("approved");
    const overrideEvidence = await pool.query<{ event_count: number; override_id: string | null }>(
      `select
         (select count(*)::int from approval_override_event event
           where event.tenant_id=payment.tenant_id and event.event_id=payment.approval_override_event_id
             and event.resource_type='banking.payment'
             and event.normal_permission_key='banking.payment.approve') as event_count,
         payment.approval_override_event_id as override_id
       from bank_payment payment where payment.tenant_id=$1 and payment.id=$2`,
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
          tenantId: "nexora-bank-payment-isolation-uat",
          actor: { ...maker.actor, tenantId: "nexora-bank-payment-isolation-uat" },
        },
        created.id,
      ),
    ).rejects.toMatchObject<Partial<BankingApiError>>({ status: 404, code: "PAYMENT_NOT_FOUND" });
  });

  it("fails closed without leaking secrets when reserved synthetic authority conflicts", async () => {
    await pool.query(
      `update currency set name='Conflicting Synthetic Authority',updated_at=now()
        where tenant_id=$1 and code='XBP'`,
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
        `update currency set name='Synthetic Bank Payment Unit',updated_at=now()
          where tenant_id=$1 and code='XBP'`,
        [sourceTestTenantId],
      );
    }
    expect(failure).toBeTruthy();
    const processFailure = failure as Error & { stdout?: string; stderr?: string };
    expect(processFailure.stderr).toContain(
      "The reserved synthetic Bank Payment currency conflicts with expected authority",
    );
    for (const output of [processFailure.stdout ?? "", processFailure.stderr ?? ""]) {
      expect(output).not.toContain(encryptionKey);
      expect(output).not.toContain(controlledPassword);
    }
  });
});
