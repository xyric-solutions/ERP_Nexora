import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import type { BankStatementMappingSnapshot } from "../../packages/contracts/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import { SourceBankReconciliationAdjustmentRepository } from "../../server/api/src/modules/banking/reconciliations/adjustment-repository.js";
import { SourceBankReconciliationRepository } from "../../server/api/src/modules/banking/reconciliations/source-repository.js";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { SourceBankStatementImportRepository } from "../../server/api/src/modules/banking/statements/source-repository.js";
import type { CreateBankStatementImportCommand } from "../../server/api/src/modules/banking/statements/service.js";
import {
  ensureCompanyCurrencyFixture,
  ensureSourceAuthorizationFixture,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const isolatedDatabase = `reconciliation_adjustment_${randomUUID().replaceAll("-", "")}`;
const companyId = `adjustment-company-${suffix}`;
const calendarId = `adjustment-calendar-${suffix}`;
const periodId = `adjustment-period-${suffix}`;
const bankLedgerId = `adjustment-bank-ledger-${suffix}`;
const offsetLedgerId = `adjustment-offset-ledger-${suffix}`;
const bankAccountId = `adjustment-bank-${suffix}`;
const importId = `adjustment-import-${suffix}`;
const statementReference = `ADJ-${suffix}`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

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

const makerPermissions = [
  "banking.statement_import.read",
  "banking.statement_import.create",
  "banking.statement_import.update",
  "banking.statement_import.finalize",
  "banking.statement_mapping.read",
  "banking.reconciliation.read",
  "banking.reconciliation.create",
  "banking.reconciliation.update",
  "banking.reconciliation.match",
  "banking.reconciliation.submit",
  "banking.reconciliation_adjustment.read",
  "banking.reconciliation_adjustment.create",
  "banking.reconciliation_adjustment.update",
  "banking.reconciliation_adjustment.submit",
  "banking.reconciliation_adjustment.approve",
  "banking.reconciliation_adjustment.post",
  "banking.reconciliation_adjustment.reverse",
] as const;
const maker = actor("r06.maker", makerPermissions);
const checker = actor("r06.checker", [
  "banking.reconciliation.read",
  "banking.reconciliation_adjustment.read",
  "banking.reconciliation_adjustment.approve",
]);

const mapping: BankStatementMappingSnapshot = {
  file_format: "csv",
  delimiter: ",",
  encoding: "utf-8",
  worksheet: null,
  header_row: 1,
  date_format: "yyyy-MM-dd",
  amount_convention: "separate_debit_credit",
  signed_amount_direction: null,
  columns: {
    date: "Date",
    payment: "Payment",
    receipt: "Receipt",
    signed_amount: null,
    reference: "Reference",
    details: "Details",
    transaction_type: null,
    account_text: null,
    payment_mode: null,
  },
};

run("Bank Reconciliation governed adjustments", () => {
  let bootstrap: DatabasePool;
  let pool: DatabasePool;
  let statements: SourceBankStatementImportRepository;
  let reconciliations: SourceBankReconciliationRepository;
  let adjustments: SourceBankReconciliationAdjustmentRepository;
  let postingDate: string;
  let reconciliationId: string;
  let statementLineId: string;

  beforeAll(async () => {
    bootstrap = createDatabasePool(databaseUrl!);
    expect(isolatedDatabase).toMatch(/^reconciliation_adjustment_[a-f0-9]{32}$/);
    await bootstrap.query(`create database ${isolatedDatabase}`);
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.pathname = `/${isolatedDatabase}`;
    pool = createDatabasePool(isolatedUrl.toString());
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);

    const clock = await pool.query<{ date: string; year: number; month: number }>(
      `select current_date::text as date,extract(year from current_date)::integer as year,
              extract(month from current_date)::integer as month`,
    );
    postingDate = clock.rows[0]!.date;
    const base = await pool.query<{ code: string }>(
      "select code from currency where tenant_id=$1 and status='active' and is_base order by code limit 1",
      [sourceTestTenantId],
    );
    if (!base.rows[0]) {
      await pool.query(
        "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'USD','US Dollar',2,true,'active')",
        [sourceTestTenantId],
      );
    } else if (base.rows[0].code !== "USD") {
      throw new Error("The disposable adjustment test requires USD as the tenant base currency.");
    }
    await pool.query(
      `insert into organization_unit(id,tenant_id,parent_id,type,code,name,status)
       values($1,$2,null,'company',$3,'Adjustment Integration Company','active')`,
      [companyId, sourceTestTenantId, `ADJ-${suffix}`],
    );
    await ensureCompanyCurrencyFixture(pool, companyId, "USD", []);
    for (const [policy, permissions] of [
      ["r06-uat-policy-maker", makerPermissions],
      ["r06-uat-policy-checker", checker.actor.permissions],
    ] as const) {
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
    for (const userId of [maker.actor.userId, checker.actor.userId]) {
      await pool.query(
        `insert into security_user_company_access
          (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
         values($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','adjustment-integration')`,
        [sourceTestTenantId, `adjustment-access-${userId}-${suffix}`, userId, companyId],
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
      [periodId, sourceTestTenantId, companyId, calendarId, clock.rows[0]!.month],
    );
    await pool.query(
      `insert into account
        (id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,
         manual_posting_allowed,is_system_account,reconciliation_required,created_at)
       values
        ($1,$3,$4,$5,'Adjustment Bank Control','asset',false,'[]','active',true,false,true,now()),
        ($2,$3,$4,$6,'Bank Charges','expense',false,'[]','active',true,false,false,now())`,
      [bankLedgerId, offsetLedgerId, sourceTestTenantId, companyId, `ADJB-${suffix}`, `ADJO-${suffix}`],
    );
    await pool.query(
      `insert into bank_account
        (id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,account_name,
         account_type,account_number_masked,account_number_ciphertext,account_number_nonce,
         account_number_hash,encryption_key_version,overdraft_limit,row_version,created_by,
         submitted_by,submitted_at,submission_reason,approved_by,approved_at,decision_reason,updated_at)
       values($1,$2,$3,$4,'Synthetic Adjustment Bank','USD','active',now(),$5,'Adjustment Account',
              'current','**** 6789',$6,$7,$8,'integration-v1',0,1,'r06.maker',
              'r06.maker',now(),'Controlled integration setup','r06.checker',now(),
              'Controlled integration approval',now())`,
      [
        bankAccountId,
        sourceTestTenantId,
        companyId,
        bankLedgerId,
        `ADJB-${suffix}`,
        Buffer.alloc(24, 51),
        Buffer.alloc(12, 52),
        sha(`adjustment-bank-${suffix}`),
      ],
    );

    statements = new SourceBankStatementImportRepository(pool);
    reconciliations = new SourceBankReconciliationRepository(pool);
    adjustments = new SourceBankReconciliationAdjustmentRepository(pool);
    const command: CreateBankStatementImportCommand = {
      id: importId,
      fields: {
        company_id: companyId,
        bank_account_id: bankAccountId,
        statement_reference: statementReference,
        date_format: "yyyy-MM-dd",
      },
      originalFilename: "adjustment.csv",
      fileFormat: "csv",
      detectedMediaType: "text/csv",
      mappingProfileId: null,
      mappingSnapshot: mapping,
      object: {
        objectKey: `bank-statements/quarantine/${sourceTestTenantId}/${companyId}/${importId}.csv`,
        sizeBytes: 128,
        checksumSha256: sha(`adjustment-file-${suffix}`),
        contentType: "text/csv",
        etag: sha(`adjustment-etag-${suffix}`),
      },
      lines: [
        {
          sourceRowNumber: 2,
          rawRow: { Date: postingDate, Payment: "25.00", Reference: statementReference },
          transactionDate: postingDate,
          direction: "money_out",
          amount: "25.00000000",
          currency: "USD",
          reference: statementReference,
          details: "Monthly bank charge",
          transactionType: "bank_charge",
          accountText: null,
          paymentMode: null,
          runningBalance: "100.00000000",
          rowFingerprint: sha(`adjustment-row-${suffix}`),
          inclusionState: "included",
          exclusionReason: null,
          validationState: "valid",
          duplicateDisposition: "not_applicable",
          issues: [],
        },
      ],
    };
    const imported = await statements.createImport(
      maker,
      command,
      `adjustment-statement-create-${suffix}`,
      `correlation-adjustment-statement-create-${suffix}`,
    );
    const validated = await statements.validate(
      maker,
      importId,
      { expected_version: imported.version },
      `adjustment-statement-validate-${suffix}`,
      `correlation-adjustment-statement-validate-${suffix}`,
    );
    await statements.finalize(
      maker,
      importId,
      { expected_version: validated.version },
      `adjustment-statement-finalize-${suffix}`,
      `correlation-adjustment-statement-finalize-${suffix}`,
    );
    const reconciliation = await reconciliations.create(
      maker,
      {
        company_id: companyId,
        bank_account_id: bankAccountId,
        method: "statement_import",
        import_id: importId,
        reconciliation_date: postingDate,
        statement_date: postingDate,
        period_start: postingDate,
        period_end: postingDate,
        statement_reference: statementReference,
        opening_statement_balance: "0.00000000",
        closing_statement_balance: "-25.00000000",
      },
      `adjustment-reconciliation-create-${suffix}`,
      `correlation-adjustment-reconciliation-create-${suffix}`,
    );
    reconciliationId = reconciliation.id;
    const detail = await reconciliations.get(maker, reconciliationId);
    statementLineId = detail.statement_lines[0]!.id;
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${isolatedDatabase}`);
      await bootstrap.end();
    }
  });

  it("governs approval, posting, reversal and replacement without allowing approval to post", async () => {
    const initial = await reconciliations.get(maker, reconciliationId);
    await expect(
      adjustments.create(
        maker,
        reconciliationId,
        {
          expected_version: initial.version,
          statement_line_id: statementLineId,
          kind: "bank_charge",
          offset_nominal_id: "r06-uat-bank-operating-usd",
          narrative: "Cross-company nominal must be rejected",
        },
        `adjustment-cross-company-create-${suffix}`,
        `correlation-adjustment-cross-company-create-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 400, code: "RECONCILIATION_ADJUSTMENT_NOMINAL_INVALID" });
    const created = await adjustments.create(
      maker,
      reconciliationId,
      {
        expected_version: initial.version,
        statement_line_id: statementLineId,
        kind: "bank_charge",
        offset_nominal_id: offsetLedgerId,
        narrative: "Monthly bank charge",
      },
      `adjustment-create-${suffix}`,
      `correlation-adjustment-create-${suffix}`,
    );
    expect(created.adjustment).toMatchObject({
      direction: "money_out",
      amount: "25.00000000",
      state: "draft",
    });
    await expect(adjustments.get(maker, reconciliationId, created.adjustment.id)).resolves.toMatchObject({
      id: created.adjustment.id,
      state: "draft",
      amount: "25.00000000",
    });
    await expect(
      adjustments.get(actor("r06.target", []), reconciliationId, created.adjustment.id),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    await expect(
      adjustments.update(
        { ...maker, realActorId: "r06.last-admin-a", impersonationRequestId: "impersonation-a" },
        reconciliationId,
        created.adjustment.id,
        { expected_version: created.adjustment.version, narrative: "Impersonated mutation" },
        `adjustment-impersonated-update-${suffix}`,
        `correlation-adjustment-impersonated-update-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "IMPERSONATION_RESTRICTED" });
    await expect(
      adjustments.create(
        maker,
        reconciliationId,
        {
          expected_version: initial.version,
          statement_line_id: statementLineId,
          kind: "bank_charge",
          offset_nominal_id: offsetLedgerId,
          narrative: "Conflicting reuse of the create key",
        },
        `adjustment-create-${suffix}`,
        `correlation-adjustment-create-conflict-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      adjustments.update(
        maker,
        reconciliationId,
        created.adjustment.id,
        { expected_version: created.adjustment.version + 1, narrative: "Stale draft update" },
        `adjustment-stale-update-${suffix}`,
        `correlation-adjustment-stale-update-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 409, code: "RECONCILIATION_ADJUSTMENT_VERSION_CONFLICT" });
    const submitted = await adjustments.submit(
      maker,
      reconciliationId,
      created.adjustment.id,
      { expected_version: created.adjustment.version },
      `adjustment-submit-${suffix}`,
      `correlation-adjustment-submit-${suffix}`,
    );
    await expect(
      adjustments.post(
        maker,
        reconciliationId,
        created.adjustment.id,
        { expected_version: submitted.adjustment.version },
        `adjustment-invalid-transition-${suffix}`,
        `correlation-adjustment-invalid-transition-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 409, code: "RECONCILIATION_ADJUSTMENT_NOT_POSTABLE" });
    await expect(
      adjustments.decide(
        maker,
        reconciliationId,
        created.adjustment.id,
        { action: "approve", expected_version: submitted.adjustment.version },
        `adjustment-self-approve-${suffix}`,
        `correlation-adjustment-self-approve-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "RECONCILIATION_ADJUSTMENT_APPROVER_SEPARATION_REQUIRED" });
    const journalsBeforeApproval = await pool.query<{ count: string }>(
      "select count(*)::text as count from journal_entry where tenant_id=$1 and company_id=$2",
      [sourceTestTenantId, companyId],
    );
    const approved = await adjustments.decide(
      checker,
      reconciliationId,
      created.adjustment.id,
      { action: "approve", expected_version: submitted.adjustment.version },
      `adjustment-approve-${suffix}`,
      `correlation-adjustment-approve-${suffix}`,
    );
    expect(approved.adjustment.state).toBe("approved");
    const journalsAfterApproval = await pool.query<{ count: string }>(
      "select count(*)::text as count from journal_entry where tenant_id=$1 and company_id=$2",
      [sourceTestTenantId, companyId],
    );
    expect(journalsAfterApproval.rows[0]?.count).toBe(journalsBeforeApproval.rows[0]?.count);
    await expect(
      reconciliations.submit(
        maker,
        reconciliationId,
        { expected_version: approved.reconciliation_version },
        `adjustment-reconciliation-premature-submit-${suffix}`,
        `correlation-adjustment-reconciliation-premature-submit-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 409, code: "RECONCILIATION_NOT_BALANCED" });

    const postInput = { expected_version: approved.adjustment.version };
    const postKey = `adjustment-post-${suffix}`;
    const posted = await adjustments.post(
      maker,
      reconciliationId,
      created.adjustment.id,
      postInput,
      postKey,
      `correlation-adjustment-post-${suffix}`,
    );
    expect(posted.adjustment.state).toBe("posted");
    await expect(
      adjustments.post(
        maker,
        reconciliationId,
        created.adjustment.id,
        postInput,
        postKey,
        `correlation-adjustment-post-replay-${suffix}`,
      ),
    ).resolves.toMatchObject({ replayed: true, adjustment: { journal_id: posted.adjustment.journal_id } });
    const journalLines = await pool.query<{ account_id: string; debit: string; credit: string }>(
      `select account_id,debit::text,credit::text from journal_line
        where tenant_id=$1 and journal_id=$2 order by line_number`,
      [sourceTestTenantId, posted.adjustment.journal_id],
    );
    expect(journalLines.rows).toEqual([
      { account_id: offsetLedgerId, debit: "25.00000000", credit: "0.00000000" },
      { account_id: bankLedgerId, debit: "0.00000000", credit: "25.00000000" },
    ]);
    let detail = await reconciliations.get(maker, reconciliationId);
    expect(detail).toMatchObject({
      balances: { difference: "0.00000000", unmatched_statement_count: 0 },
      matches: [expect.objectContaining({ state: "confirmed" })],
    });

    const reversed = await adjustments.reverse(
      maker,
      reconciliationId,
      created.adjustment.id,
      { expected_version: posted.adjustment.version, reason: "Charge was withdrawn by the bank" },
      `adjustment-reverse-${suffix}`,
      `correlation-adjustment-reverse-${suffix}`,
    );
    expect(reversed.adjustment.state).toBe("reversed");
    detail = await reconciliations.get(maker, reconciliationId);
    expect(detail.balances.unmatched_statement_count).toBe(1);

    const replacement = await adjustments.create(
      maker,
      reconciliationId,
      {
        expected_version: detail.version,
        statement_line_id: statementLineId,
        kind: "bank_charge",
        offset_nominal_id: offsetLedgerId,
        narrative: "Replacement bank charge evidence",
      },
      `adjustment-replacement-create-${suffix}`,
      `correlation-adjustment-replacement-create-${suffix}`,
    );
    const replacementSubmitted = await adjustments.submit(
      maker,
      reconciliationId,
      replacement.adjustment.id,
      { expected_version: replacement.adjustment.version },
      `adjustment-replacement-submit-${suffix}`,
      `correlation-adjustment-replacement-submit-${suffix}`,
    );
    const replacementApproved = await adjustments.decide(
      checker,
      reconciliationId,
      replacement.adjustment.id,
      { action: "approve", expected_version: replacementSubmitted.adjustment.version },
      `adjustment-replacement-approve-${suffix}`,
      `correlation-adjustment-replacement-approve-${suffix}`,
    );
    const concurrentPosts = await Promise.allSettled([
      adjustments.post(
        maker,
        reconciliationId,
        replacement.adjustment.id,
        { expected_version: replacementApproved.adjustment.version },
        `adjustment-replacement-post-a-${suffix}`,
        `correlation-adjustment-replacement-post-a-${suffix}`,
      ),
      adjustments.post(
        maker,
        reconciliationId,
        replacement.adjustment.id,
        { expected_version: replacementApproved.adjustment.version },
        `adjustment-replacement-post-b-${suffix}`,
        `correlation-adjustment-replacement-post-b-${suffix}`,
      ),
    ]);
    const successfulPosts = concurrentPosts.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof adjustments.post>>> =>
        result.status === "fulfilled",
    );
    const failedPosts = concurrentPosts.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(successfulPosts).toHaveLength(1);
    expect(failedPosts).toHaveLength(1);
    expect(failedPosts[0]?.reason).toMatchObject({
      status: 409,
      code: "RECONCILIATION_ADJUSTMENT_VERSION_CONFLICT",
    });
    const replacementPosted = successfulPosts[0]!.value;
    expect(replacementPosted.adjustment.state).toBe("posted");
    detail = await reconciliations.get(maker, reconciliationId);
    expect(detail.balances).toMatchObject({ difference: "0.00000000", unmatched_statement_count: 0 });
    await expect(
      reconciliations.submit(
        maker,
        reconciliationId,
        { expected_version: detail.version },
        `adjustment-reconciliation-submit-${suffix}`,
        `correlation-adjustment-reconciliation-submit-${suffix}`,
      ),
    ).resolves.toMatchObject({ state: "submitted" });
  }, 60_000);
});
