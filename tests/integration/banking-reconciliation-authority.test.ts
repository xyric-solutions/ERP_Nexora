import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import type { BankStatementMappingSnapshot } from "../../packages/contracts/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import { SourceBankReconciliationRepository } from "../../server/api/src/modules/banking/reconciliations/source-repository.js";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { SourceBankStatementImportRepository } from "../../server/api/src/modules/banking/statements/source-repository.js";
import type { CreateBankStatementImportCommand } from "../../server/api/src/modules/banking/statements/service.js";
import {
  ensureCompanyCurrencyFixture,
  ensureSourceAuthorizationFixture,
  ensureSourceSuperAdministratorFixture,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const isolatedDatabase = `reconciliation_${randomUUID().replaceAll("-", "")}`;
const companyId = `reconciliation-company-${suffix}`;
const calendarId = `reconciliation-calendar-${suffix}`;
const periodId = `reconciliation-period-${suffix}`;
const bankLedgerId = `reconciliation-bank-ledger-${suffix}`;
const counterLedgerId = `reconciliation-counter-ledger-${suffix}`;
const bankAccountId = `reconciliation-bank-${suffix}`;
const importId = `reconciliation-import-${suffix}`;
const statementReference = `REC-${suffix}`;

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
  "banking.reconciliation.approve",
] as const;
const maker = actor("r06.maker", makerPermissions);
const checker = actor("r06.checker", ["banking.reconciliation.read", "banking.reconciliation.approve"]);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

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

run("Bank Reconciliation governed repository", () => {
  let bootstrap: DatabasePool;
  let pool: DatabasePool;
  let statements: SourceBankStatementImportRepository;
  let reconciliations: SourceBankReconciliationRepository;
  let postingDate: string;

  beforeAll(async () => {
    bootstrap = createDatabasePool(databaseUrl!);
    expect(isolatedDatabase).toMatch(/^reconciliation_[a-f0-9]{32}$/);
    await bootstrap.query(`create database ${isolatedDatabase}`);
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.pathname = `/${isolatedDatabase}`;
    pool = createDatabasePool(isolatedUrl.toString());
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);
    await ensureSourceSuperAdministratorFixture(pool);

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
      await pool.query(
        "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'USD','US Dollar',2,false,'active') on conflict do nothing",
        [sourceTestTenantId],
      );
    }
    await pool.query(
      `insert into organization_unit(id,tenant_id,parent_id,type,code,name,status)
       values($1,$2,null,'company',$3,'Reconciliation Integration Company','active')`,
      [companyId, sourceTestTenantId, `REC-${suffix}`],
    );
    await ensureCompanyCurrencyFixture(pool, companyId, "USD", ["USD"]);
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
    for (const userId of ["r06.maker", "r06.checker"]) {
      await pool.query(
        `insert into security_user_company_access
          (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
         values($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','reconciliation-integration')`,
        [sourceTestTenantId, `reconciliation-access-${userId}-${suffix}`, userId, companyId],
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
        ($1,$3,$4,$5,'Reconciliation Bank Control','asset',false,'[]','active',true,false,true,now()),
        ($2,$3,$4,$6,'Reconciliation Counter','revenue',false,'[]','active',true,false,false,now())`,
      [bankLedgerId, counterLedgerId, sourceTestTenantId, companyId, `RECB-${suffix}`, `RECC-${suffix}`],
    );
    await pool.query(
      `insert into bank_account
        (id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,account_name,
         account_type,account_number_masked,account_number_ciphertext,account_number_nonce,
         account_number_hash,encryption_key_version,overdraft_limit,row_version,created_by,
         submitted_by,submitted_at,submission_reason,approved_by,approved_at,decision_reason,updated_at)
       values($1,$2,$3,$4,'Synthetic Reconciliation Bank','USD','active',now(),$5,'Reconciliation Account',
              'current','**** 5678',$6,$7,$8,'integration-v1',0,1,'r06.maker',
              'r06.maker',now(),'Controlled integration setup','r06.checker',now(),
              'Controlled integration approval',now())`,
      [
        bankAccountId,
        sourceTestTenantId,
        companyId,
        bankLedgerId,
        `RECB-${suffix}`,
        Buffer.alloc(24, 41),
        Buffer.alloc(12, 42),
        sha(`reconciliation-bank-${suffix}`),
      ],
    );

    const journalId = `reconciliation-journal-${suffix}`;
    await pool.query(
      `insert into journal_entry
        (id,tenant_id,company_id,created_by,posting_date,period_id,source_type,source_id,status,created_at)
       values($1,$2,$3,'r06.maker',$4,$5,'integration.reconciliation',$6,'draft',now())`,
      [journalId, sourceTestTenantId, companyId, postingDate, periodId, `source-${suffix}`],
    );
    await pool.query(
      `insert into journal_line
        (id,journal_id,tenant_id,line_number,account_id,debit,credit,currency,fx_rate,base_debit,base_credit,dimensions)
       values
        ($1,$3,$4,1,$5,100,0,'USD',1,100,0,'{}'),
        ($2,$3,$4,2,$6,0,100,'USD',1,0,100,'{}')`,
      [
        `reconciliation-bank-line-${suffix}`,
        `reconciliation-counter-line-${suffix}`,
        journalId,
        sourceTestTenantId,
        bankLedgerId,
        counterLedgerId,
      ],
    );
    await pool.query(
      `update journal_entry set status='posted',entry_number=$3,posted_at=now()
        where tenant_id=$1 and id=$2`,
      [sourceTestTenantId, journalId, statementReference],
    );

    statements = new SourceBankStatementImportRepository(pool);
    reconciliations = new SourceBankReconciliationRepository(pool);
    const command: CreateBankStatementImportCommand = {
      id: importId,
      fields: {
        company_id: companyId,
        bank_account_id: bankAccountId,
        statement_reference: statementReference,
        date_format: "yyyy-MM-dd",
      },
      originalFilename: "reconciliation.csv",
      fileFormat: "csv",
      detectedMediaType: "text/csv",
      mappingProfileId: null,
      mappingSnapshot: mapping,
      object: {
        objectKey: `bank-statements/quarantine/${sourceTestTenantId}/${companyId}/${importId}.csv`,
        sizeBytes: 128,
        checksumSha256: sha(`reconciliation-file-${suffix}`),
        contentType: "text/csv",
        etag: sha(`reconciliation-etag-${suffix}`),
      },
      lines: [
        {
          sourceRowNumber: 2,
          rawRow: { Date: postingDate, Receipt: "100.00", Reference: statementReference },
          transactionDate: postingDate,
          direction: "money_in",
          amount: "100.00000000",
          currency: "USD",
          reference: statementReference,
          details: "Synthetic receipt",
          transactionType: null,
          accountText: null,
          paymentMode: null,
          rowFingerprint: sha(`reconciliation-row-${suffix}`),
          inclusionState: "included",
          exclusionReason: null,
          validationState: "valid",
          duplicateDisposition: "not_applicable",
          issues: [],
        },
      ],
    };
    const created = await statements.createImport(
      maker,
      command,
      `statement-create-${suffix}`,
      `correlation-statement-create-${suffix}`,
    );
    const validated = await statements.validate(
      maker,
      importId,
      { expected_version: created.version },
      `statement-validate-${suffix}`,
      `correlation-statement-validate-${suffix}`,
    );
    await statements.finalize(
      maker,
      importId,
      { expected_version: validated.version },
      `statement-finalize-${suffix}`,
      `correlation-statement-finalize-${suffix}`,
    );
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${isolatedDatabase}`);
      await bootstrap.end();
    }
  });

  it("captures, exactly matches, submits and independently approves without posting", async () => {
    const accountingBefore = await pool.query<{ count: string }>(
      "select count(*)::text as count from accounting_event where tenant_id=$1",
      [sourceTestTenantId],
    );
    const journalsBefore = await pool.query<{ count: string }>(
      "select count(*)::text as count from journal_entry where tenant_id=$1 and company_id=$2",
      [sourceTestTenantId, companyId],
    );
    const created = await reconciliations.create(
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
        closing_statement_balance: "100.00000000",
      },
      `reconciliation-create-${suffix}`,
      `correlation-reconciliation-create-${suffix}`,
    );
    const reconciliationId = created.id;
    expect(created).toMatchObject({ state: "in_progress", replayed: false });
    let detail = await reconciliations.get(maker, reconciliationId);
    expect(detail.matches).toEqual([
      expect.objectContaining({ match_type: "exact", state: "confirmed", confidence_score: 1 }),
    ]);
    expect(detail.balances).toMatchObject({ difference: "0.00000000", unmatched_statement_count: 0 });
    const exactMatch = detail.matches[0]!;
    const unmatched = await reconciliations.unmatch(
      maker,
      reconciliationId,
      exactMatch.id,
      { expected_version: detail.version, reason: "Manual review requested by the preparer" },
      `reconciliation-unmatch-${suffix}`,
      `correlation-reconciliation-unmatch-${suffix}`,
    );
    expect(unmatched).toMatchObject({
      reconciliation_id: reconciliationId,
      match: null,
      balances: { unmatched_statement_count: 1 },
    });
    const manual = await reconciliations.createMatch(
      maker,
      reconciliationId,
      {
        action: "confirm_manual",
        expected_version: unmatched.reconciliation_version,
        statement_line_id: exactMatch.statement_line_id,
        journal_line_id: exactMatch.journal_line_id,
      },
      `reconciliation-manual-${suffix}`,
      `correlation-reconciliation-manual-${suffix}`,
    );
    expect(manual.match).toMatchObject({ match_type: "manual", state: "confirmed" });
    detail = await reconciliations.get(maker, reconciliationId);
    expect(detail.balances).toMatchObject({ difference: "0.00000000", unmatched_statement_count: 0 });
    const populationCounts = await pool.query<{ captured: string; eligible: string }>(
      `select
         (select count(*)::text from bank_reconciliation_ledger_line capture
           where capture.tenant_id=$1 and capture.company_id=$2 and capture.reconciliation_id=$3) as captured,
         (select count(*)::text from journal_line line
           join journal_entry journal on journal.tenant_id=line.tenant_id and journal.id=line.journal_id
          where journal.tenant_id=$1 and journal.company_id=$2 and line.account_id=$4
            and line.currency='USD' and journal.status='posted' and journal.posting_date<=$5::date
            and not exists(
              select 1 from bank_reconciliation_ledger_line used
               where used.tenant_id=line.tenant_id and used.company_id=journal.company_id
                 and used.journal_line_id=line.id and used.reconciled_at is not null
            )) as eligible`,
      [sourceTestTenantId, companyId, reconciliationId, bankLedgerId, postingDate],
    );
    expect(populationCounts.rows[0]).toEqual({ captured: "1", eligible: "1" });

    const submitted = await reconciliations.submit(
      maker,
      reconciliationId,
      { expected_version: detail.version },
      `reconciliation-submit-${suffix}`,
      `correlation-reconciliation-submit-${suffix}`,
    );
    expect(submitted.state).toBe("submitted");
    await expect(
      reconciliations.decide(
        maker,
        reconciliationId,
        { action: "approve", expected_version: submitted.version },
        `reconciliation-self-approve-${suffix}`,
        `correlation-reconciliation-self-approve-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "RECONCILIATION_APPROVER_SEPARATION_REQUIRED" });
    const forgedOverrideMaker: BankingActorContext = {
      ...maker,
      actor: {
        ...maker.actor,
        roles: [...maker.actor.roles, "super_administrator"],
        permissions: [...maker.actor.permissions, "platform.approval.override"],
      },
    };
    await expect(
      reconciliations.decide(
        forgedOverrideMaker,
        reconciliationId,
        {
          action: "approve",
          expected_version: submitted.version,
          reason: "Forged client claims must not authorize a reconciliation override",
        },
        `reconciliation-forged-override-${suffix}`,
        `correlation-reconciliation-forged-override-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "RECONCILIATION_APPROVER_SEPARATION_REQUIRED" });
    const approved = await reconciliations.decide(
      checker,
      reconciliationId,
      { action: "approve", expected_version: submitted.version },
      `reconciliation-approve-${suffix}`,
      `correlation-reconciliation-approve-${suffix}`,
    );
    expect(approved.state).toBe("approved");
    detail = await reconciliations.get(checker, reconciliationId);
    expect(detail.state).toBe("approved");

    const accountingAfter = await pool.query<{ count: string }>(
      "select count(*)::text as count from accounting_event where tenant_id=$1",
      [sourceTestTenantId],
    );
    const journalsAfter = await pool.query<{ count: string }>(
      "select count(*)::text as count from journal_entry where tenant_id=$1 and company_id=$2",
      [sourceTestTenantId, companyId],
    );
    expect(accountingAfter.rows[0]!.count).toBe(accountingBefore.rows[0]!.count);
    expect(journalsAfter.rows[0]!.count).toBe(journalsBefore.rows[0]!.count);

    const overridePolicyId = "r06-uat-policy-approval-override";
    const overrideAssignmentId = `reconciliation-override-assignment-${suffix}`;
    await pool.query(
      `insert into security_role_permission_grant
        (tenant_id,role_policy_id,permission_key,field_allow_mode)
       values($1,$2,'banking.reconciliation.approve','all')
       on conflict do nothing`,
      [sourceTestTenantId, overridePolicyId],
    );
    await pool.query(
      `insert into security_role_scope_grant
        (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
       values($1,$2,'banking.reconciliation.approve','tenant',$1)
       on conflict do nothing`,
      [sourceTestTenantId, overridePolicyId],
    );
    await pool.query(
      `insert into security_user_role_assignment
        (tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from)
       values($1,$2,$3,$2,now(),$4,'active',now())`,
      [sourceTestTenantId, maker.actor.userId, overridePolicyId, overrideAssignmentId],
    );
    await pool.query(
      `insert into security_user_role_assignment_version
        (tenant_id,assignment_id,version,supersedes_version,user_id,role_policy_id,lifecycle_state,
         valid_from,valid_until,assigned_by,administration_command_id,source_kind,source_reference)
       select $1,$2,1,null,$3,$4,'active',assignment.valid_from,null,$3,null,
              'legacy_backfill','controlled-test-fixture'
         from security_user_role_assignment assignment
        where assignment.tenant_id=$1 and assignment.assignment_id=$2`,
      [sourceTestTenantId, overrideAssignmentId, maker.actor.userId, overridePolicyId],
    );
    const governedOverrideMaker: BankingActorContext = {
      ...maker,
      actor: {
        ...maker.actor,
        roles: [...maker.actor.roles, "super_administrator"],
        permissions: [...maker.actor.permissions, "platform.approval.override"],
      },
    };
    const overrideCreated = await reconciliations.create(
      governedOverrideMaker,
      {
        company_id: companyId,
        bank_account_id: bankAccountId,
        method: "manual_tick",
        reconciliation_date: postingDate,
        statement_date: postingDate,
        period_start: postingDate,
        period_end: postingDate,
        statement_reference: `OVERRIDE-${statementReference}`,
        opening_statement_balance: "0.00000000",
        closing_statement_balance: "0.00000000",
      },
      `reconciliation-override-create-${suffix}`,
      `correlation-reconciliation-override-create-${suffix}`,
    );
    const overrideSubmitted = await reconciliations.submit(
      governedOverrideMaker,
      overrideCreated.id,
      { expected_version: overrideCreated.version },
      `reconciliation-override-submit-${suffix}`,
      `correlation-reconciliation-override-submit-${suffix}`,
    );
    const overrideApproved = await reconciliations.decide(
      governedOverrideMaker,
      overrideCreated.id,
      {
        action: "approve",
        expected_version: overrideSubmitted.version,
        reason: "Controlled Super Administrator reconciliation continuity test",
      },
      `reconciliation-override-approve-${suffix}`,
      `correlation-reconciliation-override-approve-${suffix}`,
    );
    expect(overrideApproved.state).toBe("approved");
    const overrideEvidence = await pool.query<{ count: string }>(
      `select count(*)::text as count
         from bank_reconciliation reconciliation
         join approval_override_event event
           on event.tenant_id=reconciliation.tenant_id
          and event.event_id=reconciliation.approval_override_event_id
        where reconciliation.tenant_id=$1 and reconciliation.id=$2
          and event.resource_type='bank_reconciliation'
          and event.normal_permission_key='banking.reconciliation.approve'
          and event.decision_action='approve'`,
      [sourceTestTenantId, overrideCreated.id],
    );
    expect(overrideEvidence.rows[0]?.count).toBe("1");
  }, 60_000);
});
